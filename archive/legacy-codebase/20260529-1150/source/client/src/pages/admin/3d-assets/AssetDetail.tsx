import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Box,
  KeyRound,
  ShieldCheck,
  Archive,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AssetSafetyBadges } from "./safety-badges";
import {
  UsedByPermanentAvatarsCard,
  PERMANENT_AVATAR_USED_BY_ANCHOR,
} from "@/components/admin/UsedByPermanentAvatarsCard";

type Asset = {
  id: string;
  name: string;
  format: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  status: string;
  lifecycleState: string;
  licenseStatus: string;
  licenseSource: string | null;
  licenseNote: string | null;
  safetyReview: string;
  safetyNote: string | null;
  approvalGate: string;
  publicUrl: null;
  metadata: any;
  originalSourceUrl: string | null;
  uploaderUserId: string;
  createdAt: string;
  updatedAt: string;
};

type AuditRow = {
  id: string;
  assetId: string;
  actorUserId: string;
  event: string;
  payload: any;
  createdAt: string;
};

type DetailResponse = {
  ok: boolean;
  asset: Asset;
  auditLog: AuditRow[];
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function assetKindLabel(kind: unknown): string {
  if (kind === "rig") return "rig";
  if (kind === "set_prop") return "set prop";
  return "unspecified";
}

function assetKindBadgeClass(kind: unknown): string {
  if (kind === "rig") return "border-sky-500/40 text-sky-400";
  if (kind === "set_prop") return "border-emerald-500/40 text-emerald-400";
  return "border-muted-foreground/40 text-muted-foreground";
}

function useCountdown(targetIso: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetIso]);
  if (!targetIso) return 0;
  return Math.max(0, Math.floor((new Date(targetIso).getTime() - now) / 1000));
}

export default function AssetDetail() {
  const [, params] = useRoute<{ id: string }>("/admin/3d-assets/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();

  const url = `/api/admin/production-assets/${id}`;
  const { data, isLoading, error, refetch } = useQuery<DetailResponse>({
    queryKey: [url],
    enabled: !!id,
  });

  const [signed, setSigned] = useState<{ url: string; expiresAt: string } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueErr, setIssueErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const remaining = useCountdown(signed?.expiresAt ?? null);

  useEffect(() => {
    if (signed && remaining <= 0) setSigned(null);
  }, [remaining, signed]);

  async function issueSignedUrl() {
    setIssuing(true);
    setIssueErr(null);
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/production-assets/${id}/signed-preview-url`,
        { ttlSeconds: 900 },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setIssueErr(json?.message || `HTTP ${res.status}`);
        return;
      }
      setSigned({ url: json.url, expiresAt: json.expiresAt });
      await queryClient.invalidateQueries({ queryKey: [url] });
    } catch (err: any) {
      setIssueErr(err?.message || "Failed to issue signed URL");
    } finally {
      setIssuing(false);
    }
  }

  async function approve() {
    const res = await apiRequest("POST", `/api/admin/production-assets/${id}/approval`, {});
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      alert(json?.message || `HTTP ${res.status}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: [url] });
  }

  async function setAssetKind(assetKind: "rig" | "set_prop" | null) {
    const current = data?.asset?.metadata?.assetKind ?? null;
    const label = assetKind ?? "(unset)";
    if (!confirm(`Set assetKind from "${current ?? "(unset)"}" to "${label}"?`)) return;
    const res = await apiRequest(
      "POST",
      `/api/admin/production-assets/${id}/asset-kind`,
      { assetKind },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      alert(json?.message || `HTTP ${res.status}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: [url] });
  }

  async function archive() {
    if (!confirm("Archive this asset?")) return;
    const res = await apiRequest("POST", `/api/admin/production-assets/${id}/archive`, {});
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      if (res.status === 409) {
        alert(
          `${json?.message || "Archive refused (HTTP 409)."}\n\n` +
            `One or more permanent avatars currently bind this asset as ` +
            `their body. Scroll to the "Used by permanent avatars" card ` +
            `below and rebind or archive each listed avatar first.`,
        );
        scrollToUsedByCard();
      } else {
        alert(json?.message || `HTTP ${res.status}`);
      }
      return;
    }
    await queryClient.invalidateQueries({ queryKey: [url] });
  }

  function scrollToUsedByCard() {
    const el = document.getElementById(PERMANENT_AVATAR_USED_BY_ANCHOR);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function permanentlyDelete() {
    if (!data?.asset) return;
    const expectedName = data.asset.name;
    const typed = prompt(
      `PERMANENTLY DELETE this archived asset?\n\n` +
        `This removes the database row, all audit-log rows, and the object-storage bytes.\n` +
        `This cannot be undone.\n\n` +
        `To confirm, type the asset name exactly:\n${expectedName}`,
    );
    if (typed === null) return;
    if (typed !== expectedName) {
      alert("Name did not match. Deletion cancelled.");
      return;
    }
    const reason = prompt("Reason for deletion (required, recorded in moderation log):", "");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("A non-empty reason is required.");
      return;
    }

    setDeleting(true);
    setDeleteErr(null);
    try {
      const res = await apiRequest("DELETE", `/api/admin/production-assets/${id}`, {
        confirm: true,
        reason: reason.trim(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        if (res.status === 409) {
          setDeleteErr(
            `${json?.message || json?.error || "Delete refused (HTTP 409)."} ` +
              `See the "Used by permanent avatars" card below — rebind or ` +
              `archive each listed avatar first.`,
          );
          scrollToUsedByCard();
        } else {
          setDeleteErr(json?.message || json?.error || `HTTP ${res.status}`);
        }
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/production-assets"] });
      navigate("/admin/3d-assets");
    } catch (err: any) {
      setDeleteErr(err?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-3d-assets-detail">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/3d-assets">
            <Button variant="ghost" size="sm" data-testid="button-back-to-list">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to library
            </Button>
          </Link>
          {data?.asset && (
            <Link href={`/admin/3d-assets/${data.asset.id}/safety-review`}>
              <Button variant="outline" size="sm" data-testid="link-safety-review">
                <ShieldCheck className="mr-2 h-4 w-4" />
                License + safety review
              </Button>
            </Link>
          )}
        </div>

        {isLoading ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="text-loading">Loading asset…</CardContent></Card>
        ) : error ? (
          <Card><CardContent className="py-10 text-center text-sm text-destructive" data-testid="text-error">Failed to load: {(error as Error).message}</CardContent></Card>
        ) : !data?.asset ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Asset not found.</CardContent></Card>
        ) : (
          <>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Box className="h-5 w-5 text-fuchsia-400" />
                  <span data-testid="text-asset-name">{data.asset.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AssetSafetyBadges />

                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={assetKindBadgeClass(data.asset.metadata?.assetKind)}
                    data-testid="pill-asset-kind"
                  >
                    kind: {assetKindLabel(data.asset.metadata?.assetKind)}
                  </Badge>
                  <Badge variant="outline" data-testid="pill-lifecycle-state">lifecycle: {data.asset.lifecycleState}</Badge>
                  <Badge variant="outline" data-testid="pill-license-status">license: {data.asset.licenseStatus}</Badge>
                  <Badge variant="outline" data-testid="pill-safety-review">safety: {data.asset.safetyReview}</Badge>
                  <Badge variant="outline" data-testid="pill-approval-gate">gate: {data.asset.approvalGate}</Badge>
                  <Badge variant="outline" data-testid="pill-status">status: {data.asset.status}</Badge>
                </div>

                <div className="mb-4 grid gap-3 text-xs sm:grid-cols-2">
                  <div data-testid="text-asset-id">
                    <span className="text-muted-foreground">ID:</span> <code>{data.asset.id}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Format:</span>{" "}
                    <code data-testid="text-asset-format">{data.asset.format}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Size:</span>{" "}
                    <span data-testid="text-asset-size">{formatBytes(data.asset.byteSize)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">sha256:</span>{" "}
                    <code className="break-all" data-testid="text-asset-sha256">{data.asset.sha256}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Storage key:</span>{" "}
                    <code className="break-all" data-testid="text-asset-storage-key">{data.asset.storageKey}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Uploaded by:</span>{" "}
                    <span data-testid="text-asset-uploader">{data.asset.uploaderUserId}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>{" "}
                    <span data-testid="text-asset-created">{new Date(data.asset.createdAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Updated:</span>{" "}
                    <span data-testid="text-asset-updated">{new Date(data.asset.updatedAt).toLocaleString()}</span>
                  </div>
                  {data.asset.originalSourceUrl && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Original source:</span>{" "}
                      <a
                        href={data.asset.originalSourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline break-all"
                        data-testid="link-original-source"
                      >
                        {data.asset.originalSourceUrl}
                      </a>
                    </div>
                  )}
                  {data.asset.licenseSource && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">License source:</span>{" "}
                      <span data-testid="text-license-source">{data.asset.licenseSource}</span>
                    </div>
                  )}
                  {data.asset.licenseNote && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">License note:</span>{" "}
                      <span data-testid="text-license-note">{data.asset.licenseNote}</span>
                    </div>
                  )}
                  {data.asset.safetyNote && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Safety note:</span>{" "}
                      <span data-testid="text-safety-note">{data.asset.safetyNote}</span>
                    </div>
                  )}
                </div>

                {data.asset.metadata && (
                  <details className="mb-4 rounded border border-border bg-muted/20 p-3 text-xs" data-testid="block-metadata">
                    <summary className="cursor-pointer text-foreground">Validator metadata</summary>
                    <pre className="mt-2 overflow-x-auto text-[11px]">
                      {JSON.stringify(data.asset.metadata, null, 2)}
                    </pre>
                  </details>
                )}

                <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-muted/20 p-3">
                  <Button
                    onClick={issueSignedUrl}
                    disabled={issuing}
                    data-testid="button-issue-signed-url"
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    Issue signed preview URL (15 min)
                  </Button>
                  {signed && (
                    <>
                      <span className="text-xs text-muted-foreground" data-testid="text-signed-url-expires">
                        Expires in {Math.floor(remaining / 60)}m {remaining % 60}s
                      </span>
                      <a
                        href={signed.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-xs text-primary underline"
                        data-testid="link-signed-url"
                      >
                        Open <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </>
                  )}
                  {issueErr && (
                    <span className="text-xs text-destructive" data-testid="text-signed-url-error">{issueErr}</span>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    URL is ephemeral and never persisted.
                  </span>
                </div>

                <div className="mt-4 rounded border border-border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-foreground">
                      Asset kind classification
                    </div>
                    <Badge variant="outline" data-testid="pill-asset-kind">
                      kind: {data.asset.metadata?.assetKind ?? "(unset)"}
                    </Badge>
                  </div>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Backfill the asset kind on legacy rows so the rig picker and library
                    filters surface them. Each change is recorded in the audit log.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssetKind("rig")}
                      disabled={data.asset.metadata?.assetKind === "rig"}
                      data-testid="button-set-asset-kind-rig"
                    >
                      Mark as rig
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssetKind("set_prop")}
                      disabled={data.asset.metadata?.assetKind === "set_prop"}
                      data-testid="button-set-asset-kind-set-prop"
                    >
                      Mark as set_prop
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAssetKind(null)}
                      disabled={!data.asset.metadata?.assetKind}
                      data-testid="button-clear-asset-kind"
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    onClick={approve}
                    disabled={data.asset.approvalGate === "approved_internal" || data.asset.safetyReview !== "approved_internal"}
                    data-testid="button-advance-approval"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Advance to approved_internal
                  </Button>
                  <Button
                    variant="outline"
                    onClick={archive}
                    disabled={data.asset.status === "archived"}
                    data-testid="button-archive"
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </Button>
                  {data.asset.status === "archived" && (
                    <Button
                      variant="destructive"
                      onClick={permanentlyDelete}
                      disabled={deleting}
                      data-testid="button-permanently-delete"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {deleting ? "Deleting…" : "Permanently delete"}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => refetch()} data-testid="button-refresh-detail">
                    Refresh
                  </Button>
                </div>
                {deleteErr && (
                  <div
                    className="mt-2 text-xs text-destructive"
                    data-testid="text-delete-error"
                  >
                    Delete failed: {deleteErr}
                  </div>
                )}
              </CardContent>
            </Card>

            <UsedByPermanentAvatarsCard filter={{ kind: "bodyAsset", id: data.asset.id }} />

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Audit log (last {data.auditLog.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {data.auditLog.length === 0 ? (
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
      </div>
    </div>
  );
}
