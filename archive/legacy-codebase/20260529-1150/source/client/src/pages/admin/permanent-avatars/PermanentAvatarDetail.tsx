import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  UserSquare2,
  ShieldCheck,
  KeyRound,
  Archive,
  ArchiveRestore,
  RefreshCw,
  Repeat,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AuditRow,
  BoundAssetSummary,
  BoundRigSummary,
  PermanentAvatar,
  PermanentAvatarSafetyBadges,
} from "./shared";

type DetailResponse = {
  ok: boolean;
  permanentAvatar: PermanentAvatar;
  bodyAsset: BoundAssetSummary | null;
  rig: BoundRigSummary | null;
  auditLog: AuditRow[];
};

type PreviewBundleResponse = {
  ok: boolean;
  bodyAssetSignedUrl: string;
  rigSignedUrl: string;
  ttlSeconds: number;
  bodyAssetExpiresAt: string;
  rigExpiresAt: string;
};

export default function PermanentAvatarDetail() {
  const [, params] = useRoute<{ id: string }>("/admin/permanent-avatars/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();

  const url = `/api/admin/permanent-avatars/${id}`;
  const { data, isLoading, error, refetch } = useQuery<DetailResponse>({
    queryKey: [url],
    enabled: !!id,
  });

  // Ephemeral session-only state for the preview bundle. Intentionally NOT
  // persisted to localStorage, route state, or form state — see R7B design §7.
  const [bundle, setBundle] = useState<PreviewBundleResponse | null>(null);
  const [bundleErr, setBundleErr] = useState<string | null>(null);
  const [bundlePending, setBundlePending] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const av = data?.permanentAvatar;

  async function fetchPreviewBundle() {
    setBundlePending(true);
    setBundleErr(null);
    try {
      const res = await fetch(`/api/admin/permanent-avatars/${id}/preview-bundle`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setBundleErr(json?.message || `HTTP ${res.status}`);
        return;
      }
      setBundle(json);
    } catch (err: any) {
      setBundleErr(err?.message || "Failed to fetch preview bundle");
    } finally {
      setBundlePending(false);
    }
  }

  async function callAction(path: string, body: Record<string, any> = {}, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const res = await apiRequest("POST", `/api/admin/permanent-avatars/${id}${path}`, body);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      alert(json?.message || json?.error || `HTTP ${res.status}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: [url] });
  }

  async function permanentlyDelete() {
    if (!av) return;
    if (deleteSlugInput !== av.slug) {
      setDeleteErr("Slug did not match.");
      return;
    }
    if (!deleteReason.trim()) {
      setDeleteErr("A non-empty reason is required.");
      return;
    }
    setDeletePending(true);
    setDeleteErr(null);
    try {
      const res = await apiRequest("DELETE", `/api/admin/permanent-avatars/${id}`, {
        confirm: true,
        reason: deleteReason.trim(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setDeleteErr(json?.message || json?.error || `HTTP ${res.status}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/permanent-avatars"] });
      setDeleteOpen(false);
      navigate("/admin/permanent-avatars");
    } catch (err: any) {
      setDeleteErr(err?.message || "Delete failed");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-permanent-avatars-detail">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/permanent-avatars">
            <Button variant="ghost" size="sm" data-testid="button-back-to-list">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to library
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="text-loading">Loading…</CardContent></Card>
        ) : error ? (
          <Card><CardContent className="py-10 text-center text-sm text-destructive" data-testid="text-error">Failed to load: {(error as Error).message}</CardContent></Card>
        ) : !av ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Permanent avatar not found.</CardContent></Card>
        ) : (
          <>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <UserSquare2 className="h-5 w-5 text-fuchsia-400" />
                  <span data-testid="text-display-name">{av.displayName}</span>
                  <Badge variant="outline" className="ml-2" data-testid="pill-slug">{av.slug}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PermanentAvatarSafetyBadges />

                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge variant="outline" data-testid="pill-lifecycle-state">lifecycle: {av.lifecycleState}</Badge>
                  <Badge variant="outline" data-testid="pill-identity-review">identity: {av.identityReview}</Badge>
                  <Badge variant="outline" data-testid="pill-safety-review">safety: {av.safetyReview}</Badge>
                  <Badge variant="outline" data-testid="pill-approval-gate">gate: {av.approvalGate}</Badge>
                  <Badge variant="outline" data-testid="pill-status">status: {av.status}</Badge>
                  <Badge variant="outline" data-testid="pill-role-preset">role: {av.rolePreset}</Badge>
                </div>

                <div className="mb-4 grid gap-3 text-xs sm:grid-cols-2">
                  <div data-testid="text-id"><span className="text-muted-foreground">ID:</span> <code>{av.id}</code></div>
                  <div><span className="text-muted-foreground">Created by:</span> <span data-testid="text-created-by">{av.createdByUserId}</span></div>
                  <div><span className="text-muted-foreground">Created:</span> <span data-testid="text-created">{new Date(av.createdAt).toLocaleString()}</span></div>
                  <div><span className="text-muted-foreground">Updated:</span> <span data-testid="text-updated">{new Date(av.updatedAt).toLocaleString()}</span></div>
                  {av.voiceProfileHint && (
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Voice hint:</span> <span data-testid="text-voice-hint">{av.voiceProfileHint}</span></div>
                  )}
                  {av.languageHint && (
                    <div><span className="text-muted-foreground">Language hint:</span> <span data-testid="text-language-hint">{av.languageHint}</span></div>
                  )}
                  {av.defaultRoomKind && (
                    <div><span className="text-muted-foreground">Default room:</span> <span data-testid="text-default-room">{av.defaultRoomKind}{av.defaultRoomId ? ` · ${av.defaultRoomId}` : ""}</span></div>
                  )}
                  {av.personaSummary && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Persona summary:</span>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground" data-testid="text-persona-summary">{av.personaSummary}</p>
                    </div>
                  )}
                  {av.identityReviewNote && (
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Identity review note:</span> <span data-testid="text-identity-review-note">{av.identityReviewNote}</span></div>
                  )}
                  {av.safetyReviewNote && (
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Safety review note:</span> <span data-testid="text-safety-review-note">{av.safetyReviewNote}</span></div>
                  )}
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <Card data-testid="card-bound-body-asset">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Bound body asset</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs">
                      {data?.bodyAsset ? (
                        <div className="space-y-1">
                          <div><span className="text-muted-foreground">Name:</span> <span data-testid="text-body-asset-name">{data.bodyAsset.name}</span></div>
                          <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" data-testid="pill-body-asset-status">{data.bodyAsset.status}</Badge></div>
                          <div><span className="text-muted-foreground">Gate:</span> <Badge variant="outline" data-testid="pill-body-asset-gate">{data.bodyAsset.approvalGate}</Badge></div>
                          <Link href={`/admin/3d-assets/${data.bodyAsset.id}`}>
                            <Button variant="link" size="sm" className="px-0" data-testid="link-deep-body-asset">
                              Open asset detail <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <div>
                          <code data-testid="text-body-asset-id-fallback">{av.bodyAssetId}</code>
                          <Link href={`/admin/3d-assets/${av.bodyAssetId}`}>
                            <Button variant="link" size="sm" className="px-0" data-testid="link-deep-body-asset">
                              Open <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card data-testid="card-bound-rig">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Bound rig</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs">
                      {data?.rig ? (
                        <div className="space-y-1">
                          <div><span className="text-muted-foreground">Name:</span> <span data-testid="text-rig-name">{data.rig.name}</span></div>
                          <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" data-testid="pill-rig-status">{data.rig.status}</Badge></div>
                          <div><span className="text-muted-foreground">Gate:</span> <Badge variant="outline" data-testid="pill-rig-gate">{data.rig.approvalGate}</Badge></div>
                          <Link href={`/admin/3d-rigs/${data.rig.id}`}>
                            <Button variant="link" size="sm" className="px-0" data-testid="link-deep-rig">
                              Open rig detail <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <div>
                          <code data-testid="text-rig-id-fallback">{av.rigId}</code>
                          <Link href={`/admin/3d-rigs/${av.rigId}`}>
                            <Button variant="link" size="sm" className="px-0" data-testid="link-deep-rig">
                              Open <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="mb-4 rounded border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={fetchPreviewBundle}
                      disabled={bundlePending}
                      data-testid="button-preview-bundle"
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Preview bundle (signed URLs · ≤ 15 min)
                    </Button>
                    {bundleErr && (
                      <span className="text-xs text-destructive" data-testid="text-preview-bundle-error">{bundleErr}</span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      URLs are ephemeral and never persisted.
                    </span>
                  </div>
                  {bundle && (
                    <div className="mt-3 space-y-2 text-xs" data-testid="block-preview-bundle">
                      <div className="text-muted-foreground" data-testid="text-preview-bundle-expires">
                        Body expires {new Date(bundle.bodyAssetExpiresAt).toLocaleTimeString()} · Rig expires {new Date(bundle.rigExpiresAt).toLocaleTimeString()}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Body asset URL: </span>
                        <a
                          href={bundle.bodyAssetSignedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-primary underline"
                          data-testid="link-preview-body-asset"
                        >
                          {bundle.bodyAssetSignedUrl}
                        </a>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Rig URL: </span>
                        <a
                          href={bundle.rigSignedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-primary underline"
                          data-testid="link-preview-rig"
                        >
                          {bundle.rigSignedUrl}
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/permanent-avatars/${av.id}/identity-review`}>
                    <Button variant="outline" data-testid="button-identity-review">
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Identity review
                    </Button>
                  </Link>
                  <Link href={`/admin/permanent-avatars/${av.id}/safety-review`}>
                    <Button variant="outline" data-testid="button-safety-review">
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Safety review
                    </Button>
                  </Link>
                  <Button
                    variant="default"
                    onClick={() => callAction("/approval")}
                    disabled={
                      av.approvalGate === "approved_internal" ||
                      av.identityReview !== "approved_internal" ||
                      av.safetyReview !== "approved_internal"
                    }
                    data-testid="button-advance-approval"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Advance to approved_internal
                  </Button>
                  <Link href={`/admin/permanent-avatars/${av.id}/rebind`}>
                    <Button variant="outline" data-testid="button-rebind">
                      <Repeat className="mr-2 h-4 w-4" />
                      Rebind
                    </Button>
                  </Link>
                  {av.status !== "archived" ? (
                    <Button
                      variant="outline"
                      onClick={() => callAction("/archive", {}, "Archive this permanent avatar?")}
                      data-testid="button-archive"
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => callAction("/unarchive", {}, "Unarchive this permanent avatar?")}
                      data-testid="button-unarchive"
                    >
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                      Unarchive
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDeleteSlugInput("");
                      setDeleteReason("");
                      setDeleteErr(null);
                      setDeleteOpen(true);
                    }}
                    disabled={av.status !== "archived"}
                    data-testid="button-permanently-delete"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Permanently delete
                  </Button>
                  <Button variant="ghost" onClick={() => refetch()} data-testid="button-refresh-detail">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Audit log (last {data?.auditLog?.length ?? 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {!data?.auditLog || data.auditLog.length === 0 ? (
                  <div className="text-sm text-muted-foreground" data-testid="text-audit-empty">No events.</div>
                ) : (
                  <ul className="space-y-2">
                    {data.auditLog.map((row) => (
                      <li
                        key={row.id}
                        className="rounded border border-border bg-muted/20 p-2 text-xs"
                        data-testid={`row-audit-${row.id}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-foreground" data-testid={`text-audit-event-${row.id}`}>
                            {row.event}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(row.createdAt).toLocaleString()} · {row.actorUserId}
                          </span>
                        </div>
                        {row.payload && (
                          <pre className="mt-1 overflow-x-auto text-[11px] text-muted-foreground">
                            {JSON.stringify(row.payload, null, 2)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent data-testid="dialog-permanent-delete">
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete permanent avatar?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the DB row plus all audit-log rows. A tombstone row is written
                in the same transaction (slug stays burned). The bound body asset and rig are
                NOT deleted. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <div>
                <Label htmlFor="input-confirm-slug">
                  Retype the slug to confirm: <code>{av?.slug}</code>
                </Label>
                <Input
                  id="input-confirm-slug"
                  value={deleteSlugInput}
                  onChange={(e) => setDeleteSlugInput(e.target.value)}
                  data-testid="input-confirm-slug"
                />
              </div>
              <div>
                <Label htmlFor="input-delete-reason">Reason (recorded in tombstone)</Label>
                <Textarea
                  id="input-delete-reason"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  rows={2}
                  data-testid="input-delete-reason"
                />
              </div>
              {deleteErr && (
                <div className="text-xs text-destructive" data-testid="text-delete-error">{deleteErr}</div>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  permanentlyDelete();
                }}
                disabled={
                  deletePending ||
                  !av ||
                  deleteSlugInput !== av.slug ||
                  !deleteReason.trim()
                }
                data-testid="button-confirm-delete"
              >
                {deletePending ? "Deleting…" : "Permanently delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
