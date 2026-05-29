import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  PersonStanding,
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
import { RigSafetyBadges } from "./safety-badges";
import {
  UsedByPermanentAvatarsCard,
  PERMANENT_AVATAR_USED_BY_ANCHOR,
} from "@/components/admin/UsedByPermanentAvatarsCard";

type Rig = {
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
  rigId: string;
  actorUserId: string;
  event: string;
  payload: any;
  createdAt: string;
};

type DetailResponse = {
  ok: boolean;
  rig: Rig;
  auditLog: AuditRow[];
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
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

export default function RigDetail() {
  const [, params] = useRoute<{ id: string }>("/admin/3d-rigs/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();

  const url = `/api/admin/production-rigs/${id}`;
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
        `/api/admin/production-rigs/${id}/signed-preview-url`,
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
    const res = await apiRequest("POST", `/api/admin/production-rigs/${id}/approval`, {});
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      alert(json?.message || `HTTP ${res.status}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: [url] });
  }

  async function archive() {
    if (!confirm("Archive this rig?")) return;
    const res = await apiRequest("POST", `/api/admin/production-rigs/${id}/archive`, {});
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      if (res.status === 409) {
        alert(
          `${json?.message || "Archive refused (HTTP 409)."}\n\n` +
            `One or more permanent avatars currently bind this rig. ` +
            `Scroll to the "Used by permanent avatars" card below and ` +
            `rebind or archive each listed avatar first.`,
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
    if (!data?.rig) return;
    const expectedName = data.rig.name;
    const typed = prompt(
      `PERMANENTLY DELETE this archived rig?\n\n` +
        `This removes the database row, all audit-log rows, and the object-storage bytes.\n` +
        `This cannot be undone.\n\n` +
        `To confirm, type the rig name exactly:\n${expectedName}`,
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
      const res = await apiRequest("DELETE", `/api/admin/production-rigs/${id}`, {
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
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/production-rigs"] });
      navigate("/admin/3d-rigs");
    } catch (err: any) {
      setDeleteErr(err?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-3d-rigs-detail">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/3d-rigs">
            <Button variant="ghost" size="sm" data-testid="button-back-to-list">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to library
            </Button>
          </Link>
          {data?.rig && (
            <Link href={`/admin/3d-rigs/${data.rig.id}/safety-review`}>
              <Button variant="outline" size="sm" data-testid="link-safety-review">
                <ShieldCheck className="mr-2 h-4 w-4" />
                License + safety review
              </Button>
            </Link>
          )}
        </div>

        {isLoading ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="text-loading">Loading rig…</CardContent></Card>
        ) : error ? (
          <Card><CardContent className="py-10 text-center text-sm text-destructive" data-testid="text-error">Failed to load: {(error as Error).message}</CardContent></Card>
        ) : !data?.rig ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Rig not found.</CardContent></Card>
        ) : (
          <>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <PersonStanding className="h-5 w-5 text-fuchsia-400" />
                  <span data-testid="text-rig-name">{data.rig.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RigSafetyBadges />

                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge variant="outline" data-testid="pill-lifecycle-state">lifecycle: {data.rig.lifecycleState}</Badge>
                  <Badge variant="outline" data-testid="pill-license-status">license: {data.rig.licenseStatus}</Badge>
                  <Badge variant="outline" data-testid="pill-safety-review">safety: {data.rig.safetyReview}</Badge>
                  <Badge variant="outline" data-testid="pill-approval-gate">gate: {data.rig.approvalGate}</Badge>
                  <Badge variant="outline" data-testid="pill-status">status: {data.rig.status}</Badge>
                </div>

                <div className="mb-4 grid gap-3 text-xs sm:grid-cols-2">
                  <div data-testid="text-rig-id">
                    <span className="text-muted-foreground">ID:</span> <code>{data.rig.id}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Format:</span>{" "}
                    <code data-testid="text-rig-format">{data.rig.format}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Size:</span>{" "}
                    <span data-testid="text-rig-size">{formatBytes(data.rig.byteSize)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">sha256:</span>{" "}
                    <code className="break-all" data-testid="text-rig-sha256">{data.rig.sha256}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Storage key:</span>{" "}
                    <code className="break-all" data-testid="text-rig-storage-key">{data.rig.storageKey}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Uploaded by:</span>{" "}
                    <span data-testid="text-rig-uploader">{data.rig.uploaderUserId}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>{" "}
                    <span data-testid="text-rig-created">{new Date(data.rig.createdAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Updated:</span>{" "}
                    <span data-testid="text-rig-updated">{new Date(data.rig.updatedAt).toLocaleString()}</span>
                  </div>
                  {data.rig.originalSourceUrl && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Original source:</span>{" "}
                      <a
                        href={data.rig.originalSourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline break-all"
                        data-testid="link-original-source"
                      >
                        {data.rig.originalSourceUrl}
                      </a>
                    </div>
                  )}
                  {data.rig.licenseSource && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">License source:</span>{" "}
                      <span data-testid="text-license-source">{data.rig.licenseSource}</span>
                    </div>
                  )}
                  {data.rig.licenseNote && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">License note:</span>{" "}
                      <span data-testid="text-license-note">{data.rig.licenseNote}</span>
                    </div>
                  )}
                  {data.rig.safetyNote && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Safety note:</span>{" "}
                      <span data-testid="text-safety-note">{data.rig.safetyNote}</span>
                    </div>
                  )}
                </div>

                {data.rig.metadata && (
                  <details className="mb-4 rounded border border-border bg-muted/20 p-3 text-xs" data-testid="block-metadata">
                    <summary className="cursor-pointer text-foreground">Validator metadata</summary>
                    <pre className="mt-2 overflow-x-auto text-[11px]">
                      {JSON.stringify(data.rig.metadata, null, 2)}
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

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    onClick={approve}
                    disabled={data.rig.approvalGate === "approved_internal" || data.rig.safetyReview !== "approved_internal"}
                    data-testid="button-advance-approval"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Advance to approved_internal
                  </Button>
                  <Button
                    variant="outline"
                    onClick={archive}
                    disabled={data.rig.status === "archived"}
                    data-testid="button-archive"
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </Button>
                  {data.rig.status === "archived" && (
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

            <UsedByPermanentAvatarsCard filter={{ kind: "rig", id: data.rig.id }} />

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
