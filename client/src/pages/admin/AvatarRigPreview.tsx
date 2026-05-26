import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  EyeOff,
  Server,
  Film,
  Cpu,
  Send,
  Lock,
  Sparkles,
  Box,
  AlertCircle,
  Mic,
  Video,
  PersonStanding,
} from "lucide-react";
import type { RigInfo } from "@/components/production-house/r3f/AvatarRigCanvas";

const AvatarRigCanvas = lazy(
  () => import("@/components/production-house/r3f/AvatarRigCanvas"),
);

const SAFETY_BADGES: { label: string; icon: typeof ShieldCheck; testId: string }[] = [
  { label: "Admin preview only", icon: ShieldCheck, testId: "badge-admin-preview-only" },
  { label: "No public URL", icon: EyeOff, testId: "badge-no-public-url" },
  { label: "No signed URL", icon: Lock, testId: "badge-no-signed-url" },
  { label: "No provider calls", icon: Server, testId: "badge-no-provider-calls" },
  { label: "No render execution", icon: Film, testId: "badge-no-render-execution" },
  { label: "No Unreal execution", icon: Cpu, testId: "badge-no-unreal-execution" },
  { label: "No 4D hardware", icon: Sparkles, testId: "badge-no-4d-hardware" },
  { label: "No publishing", icon: Send, testId: "badge-no-publishing" },
  { label: "Local demo asset only", icon: Box, testId: "badge-local-demo-asset-only" },
  { label: "Visual only — no provider, no voice, no video", icon: Mic, testId: "badge-visual-only-no-provider-voice-video" },
  { label: "No voice generation", icon: Mic, testId: "badge-no-voice-generation" },
  { label: "No video generation", icon: Video, testId: "badge-no-video-generation" },
];

type ApprovedRig = {
  id: string;
  name: string;
  format: string;
  byteSize: number;
};

type ApprovedRigsResponse = {
  ok: boolean;
  items: ApprovedRig[];
};

type PermanentAvatar = {
  id: string;
  slug?: string;
  displayName?: string;
  name?: string;
  rolePreset?: string | null;
};

type PermanentAvatarsResponse = {
  ok: boolean;
  items: PermanentAvatar[];
};

type SourceKind = "demo" | "approved_rig" | "permanent_avatar";

const PREVIEW_BUNDLE_TTL_SECONDS = 900;
// Refresh shortly before the 900s server-side TTL elapses to avoid an
// in-flight GLTF load racing the expiry. URLs are kept in React state
// ONLY — never localStorage, sessionStorage, cookies, query string, or
// route state. Cleared on unmount and on source change.
const PREVIEW_BUNDLE_REFRESH_MS = (PREVIEW_BUNDLE_TTL_SECONDS - 30) * 1000;

export default function AvatarRigPreview() {
  const { isLoading, isAuthenticated, isAuthorized } = useAdminAuth();
  const [pose, setPose] = useState<"t_pose" | "a_pose">("t_pose");
  const [rigInfo, setRigInfo] = useState<RigInfo | null>(null);
  const [rigError, setRigError] = useState<string | null>(null);

  const [sourceKind, setSourceKind] = useState<SourceKind>("demo");
  // Used when sourceKind === "approved_rig"
  const [selectedRigId, setSelectedRigId] = useState<string>("");
  // Used when sourceKind === "permanent_avatar"
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>("");

  const [signedRigUrl, setSignedRigUrl] = useState<string | null>(null);
  const [signedBodyAssetUrl, setSignedBodyAssetUrl] = useState<string | null>(null);
  const [bundleExpiresAt, setBundleExpiresAt] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [bodyAssetError, setBodyAssetError] = useState<string | null>(null);
  const [bundleFetchTick, setBundleFetchTick] = useState(0);

  const rigsListUrl =
    "/api/admin/production-rigs?approvalGate=approved_internal&status=active&limit=100";
  const { data: rigsData } = useQuery<ApprovedRigsResponse>({
    queryKey: [rigsListUrl],
    enabled: isAuthenticated && isAuthorized,
  });
  const approvedRigs = rigsData?.items ?? [];

  const avatarsListUrl =
    "/api/admin/permanent-avatars?approvalGate=approved_internal&status=active&limit=100";
  const { data: avatarsData, error: avatarsListError } = useQuery<PermanentAvatarsResponse>({
    queryKey: [avatarsListUrl],
    enabled: isAuthenticated && isAuthorized && sourceKind === "permanent_avatar",
    retry: false,
  });
  const permanentAvatars = avatarsData?.items ?? [];

  // Approved-rig signed URL
  useEffect(() => {
    if (sourceKind !== "approved_rig" || !selectedRigId) {
      return;
    }
    let aborted = false;
    setSigning(true);
    setSignError(null);
    setSignedRigUrl(null);
    setSignedBodyAssetUrl(null);
    setBundleExpiresAt(null);
    (async () => {
      try {
        const res = await apiRequest(
          "POST",
          `/api/admin/production-rigs/${encodeURIComponent(selectedRigId)}/signed-preview-url`,
          { ttlSeconds: PREVIEW_BUNDLE_TTL_SECONDS },
        );
        const json = await res.json().catch(() => ({}));
        if (aborted) return;
        if (!res.ok || !json?.ok || !json?.url) {
          setSignError(json?.message || `Failed to sign rig URL (HTTP ${res.status})`);
          return;
        }
        setSignedRigUrl(String(json.url));
        setBundleExpiresAt(json.expiresAt ?? null);
      } catch (err: any) {
        if (!aborted) setSignError(err?.message || "Failed to sign rig URL");
      } finally {
        if (!aborted) setSigning(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [sourceKind, selectedRigId]);

  // Permanent-avatar preview-bundle (body + rig signed URLs)
  useEffect(() => {
    if (sourceKind !== "permanent_avatar" || !selectedAvatarId) {
      return;
    }
    let aborted = false;
    setSigning(true);
    setSignError(null);
    setBodyAssetError(null);
    setSignedRigUrl(null);
    setSignedBodyAssetUrl(null);
    setBundleExpiresAt(null);
    (async () => {
      try {
        const res = await apiRequest(
          "GET",
          `/api/admin/permanent-avatars/${encodeURIComponent(selectedAvatarId)}/preview-bundle`,
        );
        const json = await res.json().catch(() => ({}));
        if (aborted) return;
        const bodyUrl = json?.bodyAssetSignedUrl ?? json?.body?.url ?? null;
        const rigUrl = json?.rigSignedUrl ?? json?.rig?.url ?? null;
        if (!res.ok || !bodyUrl || !rigUrl) {
          setSignError(
            json?.message ||
              `Failed to fetch permanent-avatar preview bundle (HTTP ${res.status})`,
          );
          return;
        }
        setSignedBodyAssetUrl(String(bodyUrl));
        setSignedRigUrl(String(rigUrl));
        setBundleExpiresAt(
          json?.bodyAssetExpiresAt ??
            json?.rigExpiresAt ??
            json?.expiresAt ??
            json?.body?.expiresAt ??
            json?.rig?.expiresAt ??
            null,
        );
      } catch (err: any) {
        if (!aborted) setSignError(err?.message || "Failed to fetch preview bundle");
      } finally {
        if (!aborted) setSigning(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [sourceKind, selectedAvatarId, bundleFetchTick]);

  // Hard session timer: re-fetch the bundle (or rig URL) just before the
  // 900 s server-side TTL elapses. URLs are component state only — never
  // persisted anywhere — and are cleared on unmount via the effect below.
  useEffect(() => {
    if (sourceKind === "demo") return;
    if (!signedRigUrl && !signedBodyAssetUrl) return;
    const timer = window.setTimeout(() => {
      setBundleFetchTick((n) => n + 1);
    }, PREVIEW_BUNDLE_REFRESH_MS);
    return () => window.clearTimeout(timer);
  }, [sourceKind, signedRigUrl, signedBodyAssetUrl]);

  // Source-kind change: clear all signed URLs + errors immediately.
  useEffect(() => {
    setSignedRigUrl(null);
    setSignedBodyAssetUrl(null);
    setBundleExpiresAt(null);
    setSignError(null);
    setBodyAssetError(null);
    setRigInfo(null);
    setRigError(null);
    if (sourceKind === "demo") {
      setSelectedRigId("");
      setSelectedAvatarId("");
    } else if (sourceKind === "approved_rig") {
      setSelectedAvatarId("");
    } else if (sourceKind === "permanent_avatar") {
      setSelectedRigId("");
    }
  }, [sourceKind]);

  // Hard unmount clear — defense-in-depth so no signed URL outlives the page.
  const clearRef = useRef<() => void>(() => {});
  clearRef.current = () => {
    setSignedRigUrl(null);
    setSignedBodyAssetUrl(null);
    setBundleExpiresAt(null);
  };
  useEffect(() => {
    return () => {
      clearRef.current();
    };
  }, []);

  const refreshBundle = useCallback(() => setBundleFetchTick((n) => n + 1), []);

  const effectiveRigUrl = useMemo(() => {
    if (sourceKind === "demo") return null;
    return signedRigUrl;
  }, [sourceKind, signedRigUrl]);

  const effectiveBodyUrl = useMemo(() => {
    if (sourceKind !== "permanent_avatar") return null;
    return signedBodyAssetUrl;
  }, [sourceKind, signedBodyAssetUrl]);

  if (isLoading || !isAuthenticated || !isAuthorized) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"
        data-testid="page-avatar-rig-preview-auth-gate"
      >
        {isLoading ? "Verifying admin access…" : "Redirecting…"}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-avatar-rig-preview">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-to-dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
          </Link>
          <Badge variant="outline" className="border-fuchsia-500/40 text-fuchsia-300" data-testid="badge-r7-phase">
            R7 · Avatar rig · Visual only
          </Badge>
        </div>

        <Card data-testid="card-avatar-rig-header">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <PersonStanding className="h-5 w-5 text-fuchsia-400" />
                  Avatar Rig Visual Preview
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin-only static visual preview of a humanoid avatar rig. Loads a single
                  local demo GLB and renders the joint hierarchy inside the R3F safety envelope.
                  <strong className="ml-1 text-foreground">
                    Visual only — no HeyGen, no ElevenLabs, no voice, no video, no lip-sync,
                    no provider API.
                  </strong>
                </p>
              </div>
              <Badge variant="outline" className="border-amber-500/40 text-amber-300" data-testid="badge-dry-run">
                <ShieldAlert className="mr-1 h-3 w-3" />
                Dry run
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2" data-testid="safety-badges">
              {SAFETY_BADGES.map(({ label, icon: Icon, testId }) => (
                <Badge
                  key={testId}
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-300"
                  data-testid={testId}
                >
                  <Icon className="mr-1 h-3 w-3" />
                  {label}
                </Badge>
              ))}
            </div>

            <div
              className="mb-3 grid grid-cols-1 gap-3 rounded border border-border bg-muted/20 px-3 py-3 sm:grid-cols-3"
              data-testid="rig-info-panel"
            >
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Rig name
                </Label>
                <div className="mt-1 text-sm font-medium" data-testid="text-rig-name">
                  {rigInfo?.rigName ?? "—"}
                </div>
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Joint count
                </Label>
                <div className="mt-1 text-sm font-medium" data-testid="text-rig-joint-count">
                  {rigInfo ? `${rigInfo.jointCount} joints` : "—"}
                </div>
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Root joint
                </Label>
                <div className="mt-1 text-sm font-medium" data-testid="text-rig-root-joint">
                  {rigInfo?.rootJointName ?? "—"}
                </div>
              </div>
            </div>

            <div
              className="mb-3 flex flex-col gap-2 rounded border border-border bg-muted/20 px-3 py-2"
              data-testid="rig-picker-controls"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-sm">Source kind</Label>
                <Select
                  value={sourceKind}
                  onValueChange={(v) => setSourceKind(v as SourceKind)}
                >
                  <SelectTrigger className="w-[260px]" data-testid="select-source-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo" data-testid="select-source-kind-option-demo">
                      Local R7 demo rig (internal_only)
                    </SelectItem>
                    <SelectItem
                      value="approved_rig"
                      data-testid="select-source-kind-option-approved-rig"
                    >
                      Approved-internal rig
                    </SelectItem>
                    <SelectItem
                      value="permanent_avatar"
                      data-testid="select-source-kind-option-permanent-avatar"
                    >
                      Permanent Avatar (body + rig)
                    </SelectItem>
                  </SelectContent>
                </Select>

                {sourceKind === "approved_rig" && (
                  <>
                    <Select value={selectedRigId} onValueChange={setSelectedRigId}>
                      <SelectTrigger
                        className="w-[320px]"
                        data-testid="select-rig-source"
                      >
                        <SelectValue placeholder="Select an approved rig…" />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedRigs.length === 0 && (
                          <div
                            className="px-3 py-2 text-xs text-muted-foreground"
                            data-testid="text-no-approved-rigs"
                          >
                            No approved_internal rigs found.
                          </div>
                        )}
                        {approvedRigs.map((r) => (
                          <SelectItem
                            key={r.id}
                            value={r.id}
                            data-testid={`select-rig-source-option-${r.id}`}
                          >
                            {r.name} · {r.format}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Link href="/admin/3d-rigs">
                      <Button variant="ghost" size="sm" data-testid="link-rig-library">
                        Manage rig library
                      </Button>
                    </Link>
                  </>
                )}

                {sourceKind === "permanent_avatar" && (
                  <>
                    <Select
                      value={selectedAvatarId}
                      onValueChange={setSelectedAvatarId}
                    >
                      <SelectTrigger
                        className="w-[320px]"
                        data-testid="select-permanent-avatar"
                      >
                        <SelectValue placeholder="Select a permanent avatar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {avatarsListError && (
                          <div
                            className="px-3 py-2 text-xs text-destructive-foreground"
                            data-testid="text-permanent-avatars-list-error"
                          >
                            Failed to load permanent-avatar list.
                          </div>
                        )}
                        {!avatarsListError && permanentAvatars.length === 0 && (
                          <div
                            className="px-3 py-2 text-xs text-muted-foreground"
                            data-testid="text-no-permanent-avatars"
                          >
                            No approved_internal permanent avatars found.
                          </div>
                        )}
                        {permanentAvatars.map((a) => {
                          const label =
                            a.displayName ?? a.name ?? a.slug ?? a.id;
                          return (
                            <SelectItem
                              key={a.id}
                              value={a.id}
                              data-testid={`select-permanent-avatar-option-${a.id}`}
                            >
                              {label}
                              {a.rolePreset ? ` · ${a.rolePreset}` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={refreshBundle}
                      disabled={!selectedAvatarId || signing}
                      data-testid="button-refresh-preview-bundle"
                    >
                      Refresh preview URLs
                    </Button>
                  </>
                )}
              </div>
              <span
                className="text-[11px] text-muted-foreground"
                data-testid="text-rig-source-note"
              >
                {sourceKind === "demo"
                  ? "Demo GLB committed in repo. No external fetch. Approval gate: not_approved."
                  : signing
                  ? "Issuing signed preview URL (≤15 min)…"
                  : signError
                  ? `Signed URL error: ${signError}`
                  : sourceKind === "approved_rig" && signedRigUrl
                  ? `Signed rig URL active${bundleExpiresAt ? ` · expires ${new Date(bundleExpiresAt).toLocaleTimeString()}` : ""}`
                  : sourceKind === "permanent_avatar" && signedRigUrl && signedBodyAssetUrl
                  ? `Body + rig signed URLs active${bundleExpiresAt ? ` · expires ${new Date(bundleExpiresAt).toLocaleTimeString()}` : ""} · auto-refresh ≤ 900s`
                  : sourceKind === "permanent_avatar"
                  ? "Select a permanent avatar. Bundle endpoint mints ephemeral body + rig URLs."
                  : "Selecting approved_internal rig…"}
              </span>
              {sourceKind === "permanent_avatar" && (
                <span
                  className="text-[11px] text-muted-foreground"
                  data-testid="text-ephemeral-url-note"
                >
                  Signed URLs are held in component state only. Never written to
                  localStorage, sessionStorage, cookies, query string, or route
                  state. Auto-refresh before the 900 s server-side TTL elapses.
                </span>
              )}
            </div>

            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-muted/20 px-3 py-2"
              data-testid="pose-controls"
            >
              <div className="flex items-center gap-2">
                <Label className="text-sm">Pose</Label>
                <div className="inline-flex overflow-hidden rounded border border-border">
                  <button
                    type="button"
                    onClick={() => setPose("t_pose")}
                    className={
                      "px-3 py-1 text-xs " +
                      (pose === "t_pose"
                        ? "bg-fuchsia-500/20 text-fuchsia-200"
                        : "text-muted-foreground hover:bg-muted/40")
                    }
                    aria-pressed={pose === "t_pose"}
                    data-testid="button-pose-t"
                  >
                    T-pose
                  </button>
                  <button
                    type="button"
                    onClick={() => setPose("a_pose")}
                    className={
                      "border-l border-border px-3 py-1 text-xs " +
                      (pose === "a_pose"
                        ? "bg-fuchsia-500/20 text-fuchsia-200"
                        : "text-muted-foreground hover:bg-muted/40")
                    }
                    aria-pressed={pose === "a_pose"}
                    data-testid="button-pose-a"
                  >
                    A-pose
                  </button>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground" data-testid="text-pose-static-note">
                Static pose switch — no animation timeline, no interpolation, no lip-sync.
              </span>
            </div>

            {rigError && (
              <div
                className="mb-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="rig-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Avatar rig failed to load:</strong> {rigError}
                </span>
              </div>
            )}

            {bodyAssetError && (
              <div
                className="mb-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="body-asset-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Body asset failed to load:</strong> {bodyAssetError}
                </span>
              </div>
            )}

            <Suspense
              fallback={
                <div
                  className="flex h-[480px] w-full items-center justify-center rounded border border-border bg-muted/30 text-sm text-muted-foreground"
                  data-testid="r7-rig-suspense"
                >
                  Loading rig canvas…
                </div>
              }
            >
              <AvatarRigCanvas
                pose={pose}
                url={effectiveRigUrl ?? undefined}
                bodyAssetUrl={effectiveBodyUrl}
                onRigInfo={(info) => {
                  setRigInfo(info);
                  setRigError(null);
                }}
                onRigError={(msg) => setRigError(msg)}
                onBodyAssetError={(msg) => setBodyAssetError(msg)}
              />
            </Suspense>

            <div className="mt-4 grid gap-2 rounded border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div data-testid="text-rig-source">
                <strong className="text-foreground">Rig source:</strong> local committed demo GLB at{" "}
                <code>/demo-assets/avatar-rig-demo.glb</code> (~1.4 KB, JSON-chunk-only,{" "}
                <em>internal_only</em>). Generated by{" "}
                <code>scripts/generate-r7-avatar-rig-demo-glb.mjs</code> — no third-party rig data.
              </div>
              <div data-testid="text-perf-notes">
                <strong className="text-foreground">Performance guard:</strong> lazy-loaded Canvas · DPR cap{" "}
                <code>[1, 1.5]</code> · <code>frameloop=&quot;demand&quot;</code> · low-power GL preference ·
                WebGL availability fallback · GLTF Suspense + ErrorBoundary · no <code>setState</code> inside{" "}
                <code>useFrame</code> · no animation loop.
              </div>
              <div data-testid="text-visual-only-note">
                <strong className="text-foreground">Visual-only contract:</strong> no HeyGen / ElevenLabs /
                Runway / avatar-as-a-service call · no voice generation · no audio element · no microphone ·
                no video element · no render export · no publishing · no env-secret read · no <code>fetch</code>{" "}
                outside the R3F safety envelope.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
