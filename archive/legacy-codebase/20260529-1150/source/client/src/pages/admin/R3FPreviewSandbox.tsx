import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";

const ProductionCanvasSandbox = lazy(
  () => import("@/components/production-house/r3f/ProductionCanvasSandbox"),
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
];

interface ApprovedInternalAsset {
  id: string;
  name: string;
  format: string;
  byteSize: number;
}

export default function R3FPreviewSandbox() {
  const [showDemoGltf, setShowDemoGltf] = useState(false);
  const [gltfError, setGltfError] = useState<string | null>(null);

  const [showApprovedInternal, setShowApprovedInternal] = useState(false);
  const [approvedAssets, setApprovedAssets] = useState<ApprovedInternalAsset[]>([]);
  const [approvedAssetsLoading, setApprovedAssetsLoading] = useState(false);
  const [approvedAssetsError, setApprovedAssetsError] = useState<string | null>(null);
  const [selectedApprovedId, setSelectedApprovedId] = useState<string>("");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlExpiresAt, setSignedUrlExpiresAt] = useState<string | null>(null);
  const [signedUrlLoading, setSignedUrlLoading] = useState(false);
  const [approvedInternalError, setApprovedInternalError] = useState<string | null>(null);

  useEffect(() => {
    if (!showApprovedInternal) return;
    let aborted = false;
    setApprovedAssetsLoading(true);
    setApprovedAssetsError(null);
    fetch(
      "/api/admin/production-assets?approvalGate=approved_internal&status=active&limit=50",
      { credentials: "include" },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (aborted) return;
        const items: ApprovedInternalAsset[] = Array.isArray(data?.items)
          ? data.items.map((a: any) => ({
              id: String(a.id),
              name: String(a.name ?? a.id),
              format: String(a.format ?? "glb"),
              byteSize: Number(a.byteSize ?? 0),
            }))
          : [];
        setApprovedAssets(items);
      })
      .catch((err) => {
        if (aborted) return;
        setApprovedAssetsError(err?.message ?? "Failed to load approved internal assets.");
      })
      .finally(() => {
        if (!aborted) setApprovedAssetsLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [showApprovedInternal]);

  useEffect(() => {
    if (!showApprovedInternal || !selectedApprovedId) {
      setSignedUrl(null);
      setSignedUrlExpiresAt(null);
      return;
    }
    let aborted = false;
    setSignedUrlLoading(true);
    setApprovedInternalError(null);
    setSignedUrl(null);
    setSignedUrlExpiresAt(null);
    fetch(
      `/api/admin/production-assets/${encodeURIComponent(selectedApprovedId)}/signed-preview-url`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttlSeconds: 900 }),
      },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (aborted) return;
        if (!data?.url) throw new Error("Missing signed URL in response.");
        setSignedUrl(String(data.url));
        setSignedUrlExpiresAt(data.expiresAt ? String(data.expiresAt) : null);
      })
      .catch((err) => {
        if (aborted) return;
        setApprovedInternalError(err?.message ?? "Failed to mint signed preview URL.");
      })
      .finally(() => {
        if (!aborted) setSignedUrlLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [showApprovedInternal, selectedApprovedId]);

  useEffect(() => {
    if (!showApprovedInternal) {
      setSelectedApprovedId("");
      setSignedUrl(null);
      setSignedUrlExpiresAt(null);
      setApprovedInternalError(null);
    }
  }, [showApprovedInternal]);

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-r3f-preview-sandbox">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-to-dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
          </Link>
          <Badge variant="outline" className="border-fuchsia-500/40 text-fuchsia-300" data-testid="badge-r3-phase">
            R3 · R5B · Admin sandbox
          </Badge>
        </div>

        <Card data-testid="card-sandbox-header">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Sparkles className="h-5 w-5 text-fuchsia-400" />
                  R3F Preview Sandbox
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Browser-only React-Three-Fiber sandbox for safe 3D preview experiments.
                  R5B adds a single local demo GLB loader (toggle below). No private assets,
                  no provider calls, no render, no public output.
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
              {showApprovedInternal && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-300"
                  data-testid="badge-approved-internal-only"
                >
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  Approved internal only
                </Badge>
              )}
            </div>

            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-muted/20 px-3 py-2"
              data-testid="demo-gltf-controls"
            >
              <div className="flex items-center gap-3">
                <Switch
                  id="toggle-demo-gltf"
                  checked={showDemoGltf}
                  onCheckedChange={(v) => {
                    setShowDemoGltf(v);
                    if (!v) setGltfError(null);
                  }}
                  data-testid="switch-demo-gltf"
                />
                <Label htmlFor="toggle-demo-gltf" className="cursor-pointer text-sm">
                  Load demo GLB (<code className="text-xs">/demo-assets/sandbox-cube.glb</code> · 1.4 KB · local · internal_only)
                </Label>
              </div>
              <span className="text-[11px] text-muted-foreground" data-testid="text-demo-provenance">
                Generated by <code>scripts/generate-r3f-demo-glb.mjs</code> — no third-party model data.
              </span>
            </div>

            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-muted/20 px-3 py-2"
              data-testid="approved-internal-controls"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  id="toggle-approved-internal"
                  checked={showApprovedInternal}
                  onCheckedChange={(v) => setShowApprovedInternal(v)}
                  data-testid="switch-approved-internal"
                />
                <Label htmlFor="toggle-approved-internal" className="cursor-pointer text-sm">
                  Load approved internal asset (signed URL · ephemeral · admin-only)
                </Label>
                {showApprovedInternal && (
                  <select
                    value={selectedApprovedId}
                    onChange={(e) => setSelectedApprovedId(e.target.value)}
                    disabled={approvedAssetsLoading || approvedAssets.length === 0}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                    data-testid="select-approved-internal-asset"
                  >
                    <option value="">
                      {approvedAssetsLoading
                        ? "Loading…"
                        : approvedAssets.length === 0
                          ? "No approved internal assets"
                          : "Select an approved internal asset…"}
                    </option>
                    {approvedAssets.map((a) => (
                      <option key={a.id} value={a.id} data-testid={`option-approved-asset-${a.id}`}>
                        {a.name} · {a.format} · {a.byteSize} B
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {showApprovedInternal && signedUrlExpiresAt && (
                <span
                  className="text-[11px] text-muted-foreground"
                  data-testid="text-signed-url-expires"
                >
                  Signed URL expires at {new Date(signedUrlExpiresAt).toLocaleTimeString()}
                </span>
              )}
              {showApprovedInternal && signedUrlLoading && (
                <span className="text-[11px] text-muted-foreground" data-testid="text-signed-url-loading">
                  Minting signed URL…
                </span>
              )}
            </div>

            {showApprovedInternal && approvedAssetsError && (
              <div
                className="mb-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="approved-internal-list-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Failed to load approved internal assets:</strong> {approvedAssetsError}
                </span>
              </div>
            )}

            {showApprovedInternal && approvedInternalError && (
              <div
                className="mb-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="approved-internal-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Approved internal asset failed:</strong> {approvedInternalError}
                </span>
              </div>
            )}

            {gltfError && (
              <div
                className="mb-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="demo-gltf-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Demo GLB failed to load:</strong> {gltfError}
                </span>
              </div>
            )}

            <Suspense
              fallback={
                <div
                  className="flex h-[480px] w-full items-center justify-center rounded border border-border bg-muted/30 text-sm text-muted-foreground"
                  data-testid="r3f-sandbox-suspense"
                >
                  Loading R3F canvas…
                </div>
              }
            >
              <ProductionCanvasSandbox
                showDemoGltf={showDemoGltf}
                onGltfError={(msg) => setGltfError(msg)}
                approvedInternalUrl={showApprovedInternal ? signedUrl : null}
                onApprovedInternalError={(msg) => setApprovedInternalError(msg)}
              />
            </Suspense>

            <div className="mt-4 grid gap-2 rounded border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div data-testid="text-scene-notes">
                <strong className="text-foreground">Scene contents:</strong> simple grid · perspective camera ·
                ambient + 2 directional lights · 1 box + 1 sphere primitive · optional 1 local demo GLB cube.
                No textures, no HDRI, no external models, no Unity iframe.
              </div>
              <div data-testid="text-perf-notes">
                <strong className="text-foreground">Performance guard:</strong> lazy-loaded Canvas · DPR cap{" "}
                <code>[1, 1.5]</code> · <code>frameloop=&quot;demand&quot;</code> · low-power GL preference ·
                WebGL availability fallback · GLTF Suspense + ErrorBoundary · no <code>setState</code> inside{" "}
                <code>useFrame</code> · no animation loop.
              </div>
              <div data-testid="text-safety-note">
                <strong className="text-foreground">Safety envelope:</strong> publicUrl=null · signedUrl=null ·
                realSendAllowed=false · executionEnabled=false. Demo GLB is treated as <em>internal_only</em>{" "}
                under the R4 metadata model. No provider/env secret access from this surface.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
