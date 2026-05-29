import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Box, ChevronDown, ChevronRight, History, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssetSafetyBadges } from "./safety-badges";
import OrphanReconcilePanel from "./OrphanReconcilePanel";
import R7bE2eCleanupPanel from "./R7bE2eCleanupPanel";

const PAGE_SIZE = 20;

type Asset = {
  id: string;
  name: string;
  format: string;
  byteSize: number;
  status: string;
  lifecycleState: string;
  licenseStatus: string;
  safetyReview: string;
  approvalGate: string;
  createdAt: string;
  metadata?: { assetKind?: string | null } | null;
};

function assetKindLabel(kind: string | null | undefined): string {
  if (kind === "rig") return "rig";
  if (kind === "set_prop") return "set prop";
  return "unspecified";
}

function assetKindBadgeClass(kind: string | null | undefined): string {
  if (kind === "rig") return "border-sky-500/40 text-sky-400";
  if (kind === "set_prop") return "border-emerald-500/40 text-emerald-400";
  return "border-muted-foreground/40 text-muted-foreground";
}

type ListResponse = {
  ok: boolean;
  items: Asset[];
  total: number;
  limit: number;
  offset: number;
};

const STATUS_OPTIONS = ["any", "draft", "active", "archived"] as const;
const SAFETY_OPTIONS = [
  "any",
  "pending",
  "approved_internal",
  "rejected",
  "needs_changes",
] as const;
const GATE_OPTIONS = ["any", "not_approved", "approved_internal"] as const;
const ASSET_KIND_OPTIONS = ["any", "set_prop", "rig"] as const;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

type DeletionSnapshot = {
  id: string;
  assetId: string;
  moderationLogId: string | null;
  actorUserId: string;
  reason: string | null;
  assetSnapshot: Record<string, any>;
  auditLogSnapshot: Array<Record<string, any>>;
  auditRowCount: number;
  createdAt: string;
};

type DeletionListResponse = {
  ok: boolean;
  items: DeletionSnapshot[];
  total: number;
  limit: number;
  offset: number;
};

function DeletionHistorySection() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const url = "/api/admin/production-assets/deletions?limit=20&offset=0";
  const { data, isLoading, error, refetch, isFetching } =
    useQuery<DeletionListResponse>({
      queryKey: [url],
      enabled: open,
    });

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div
      className="mb-3 rounded border border-border bg-muted/10"
      data-testid="deletion-history-section"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
        onClick={() => setOpen((v) => !v)}
        data-testid="button-toggle-deletion-history"
      >
        <span className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Deleted-asset audit timeline</span>
          <span className="text-xs text-muted-foreground">
            Snapshots survive the cascade so "what was that asset and who
            approved it?" still has an answer.
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {open && (
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span data-testid="text-deletion-history-summary">
              {isLoading
                ? "Loading deletion snapshots…"
                : `${items.length} of ${total} snapshot${total === 1 ? "" : "s"}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-deletion-history"
            >
              <RefreshCw
                className={`mr-2 h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
          {error && (
            <div
              className="py-4 text-xs text-destructive"
              data-testid="text-deletion-history-error"
            >
              Failed to load deletion snapshots: {(error as Error).message}
            </div>
          )}
          {!isLoading && !error && items.length === 0 && (
            <div
              className="py-4 text-xs text-muted-foreground"
              data-testid="text-deletion-history-empty"
            >
              No deletion snapshots yet. When an archived asset is permanently
              deleted its full audit trail is captured here.
            </div>
          )}
          <ul className="space-y-2">
            {items.map((s) => {
              const isOpen = expanded.has(s.id);
              const snap = s.assetSnapshot ?? {};
              return (
                <li
                  key={s.id}
                  className="rounded border border-border bg-background/40 p-2 text-xs"
                  data-testid={`deletion-snapshot-${s.assetId}`}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => toggle(s.id)}
                    data-testid={`button-toggle-snapshot-${s.assetId}`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-destructive/60 text-destructive"
                      >
                        deleted
                      </Badge>
                      <span className="font-medium">
                        {snap.name ?? s.assetId}
                      </span>
                      <code className="text-[10px] text-muted-foreground">
                        {s.assetId}
                      </code>
                      <span className="text-muted-foreground">
                        · {s.auditRowCount} audit row
                        {s.auditRowCount === 1 ? "" : "s"} captured
                      </span>
                      <span className="text-muted-foreground">
                        · by {s.actorUserId}
                      </span>
                      <span className="text-muted-foreground">
                        · {new Date(s.createdAt).toLocaleString()}
                      </span>
                    </span>
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  {isOpen && (
                    <div
                      className="mt-2 space-y-2"
                      data-testid={`snapshot-detail-${s.assetId}`}
                    >
                      <div className="grid gap-1 sm:grid-cols-2">
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">
                            Reason
                          </div>
                          <div data-testid={`snapshot-reason-${s.assetId}`}>
                            {s.reason ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">
                            Moderation log ID
                          </div>
                          <code className="text-[10px]">
                            {s.moderationLogId ?? "—"}
                          </code>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">
                            Format / size
                          </div>
                          <div>
                            {snap.format ?? "?"} ·{" "}
                            {typeof snap.byteSize === "number"
                              ? formatBytes(snap.byteSize)
                              : "?"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">
                            sha256
                          </div>
                          <code className="break-all text-[10px]">
                            {snap.sha256 ?? "—"}
                          </code>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">
                            License / safety / gate (at deletion)
                          </div>
                          <div>
                            {snap.licenseStatus ?? "?"} ·{" "}
                            {snap.safetyReview ?? "?"} ·{" "}
                            {snap.approvalGate ?? "?"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">
                            Uploaded by
                          </div>
                          <code className="text-[10px]">
                            {snap.uploaderUserId ?? "—"}
                          </code>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase text-muted-foreground">
                          Captured audit trail ({s.auditRowCount})
                        </div>
                        {s.auditLogSnapshot.length === 0 ? (
                          <div className="text-muted-foreground">
                            No audit-log rows existed for this asset at
                            deletion.
                          </div>
                        ) : (
                          <ol
                            className="space-y-1"
                            data-testid={`snapshot-audit-list-${s.assetId}`}
                          >
                            {s.auditLogSnapshot.map((row: any, i: number) => (
                              <li
                                key={row.id ?? i}
                                className="rounded bg-muted/40 px-2 py-1"
                              >
                                <span className="font-medium">
                                  {row.event ?? "event"}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  · by {row.actorUserId ?? "?"} ·{" "}
                                  {row.createdAt
                                    ? new Date(row.createdAt).toLocaleString()
                                    : "?"}
                                </span>
                                {row.payload && (
                                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
                                    {JSON.stringify(row.payload, null, 2)}
                                  </pre>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AssetLibraryList() {
  const [status, setStatus] = useState<string>("any");
  const [safetyReview, setSafetyReview] = useState<string>("any");
  const [approvalGate, setApprovalGate] = useState<string>("any");
  const [assetKind, setAssetKind] = useState<string>("any");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkResults, setBulkResults] = useState<
    { id: string; name: string; ok: boolean; message?: string }[] | null
  >(null);

  const params = new URLSearchParams();
  if (status !== "any") params.set("status", status);
  if (safetyReview !== "any") params.set("safetyReview", safetyReview);
  if (approvalGate !== "any") params.set("approvalGate", approvalGate);
  if (assetKind !== "any") params.set("assetKind", assetKind);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));

  const url = `/api/admin/production-assets?${params.toString()}`;

  const { data, isLoading, error, refetch, isFetching } = useQuery<ListResponse>({
    queryKey: [url],
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const archivedItems = useMemo(
    () => items.filter((a) => a.status === "archived"),
    [items],
  );
  const allArchivedSelected =
    archivedItems.length > 0 && archivedItems.every((a) => selected.has(a.id));

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllArchived(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of archivedItems) {
        if (checked) next.add(a.id);
        else next.delete(a.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    const targets = items.filter((a) => ids.includes(a.id) && a.status === "archived");
    if (targets.length === 0) {
      alert("No archived assets selected.");
      return;
    }
    const confirmMsg =
      `PERMANENTLY DELETE ${targets.length} archived asset${targets.length === 1 ? "" : "s"}?\n\n` +
      `This removes the database row, all audit-log rows, and the object-storage bytes\n` +
      `for each selected asset. This cannot be undone.\n\n` +
      targets.map((a) => `• ${a.name}`).join("\n") +
      `\n\nType DELETE to confirm:`;
    const typed = prompt(confirmMsg);
    if (typed === null) return;
    if (typed !== "DELETE") {
      alert("Confirmation did not match. Bulk deletion cancelled.");
      return;
    }
    const reason = prompt(
      "Reason for bulk deletion (required, recorded in moderation log for every asset):",
      "",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert("A non-empty reason is required.");
      return;
    }

    setBulkDeleting(true);
    setBulkResults(null);
    const results: { id: string; name: string; ok: boolean; message?: string }[] = [];
    for (const a of targets) {
      try {
        const res = await apiRequest("DELETE", `/api/admin/production-assets/${a.id}`, {
          confirm: true,
          reason: reason.trim(),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          results.push({
            id: a.id,
            name: a.name,
            ok: false,
            message: json?.message || json?.error || `HTTP ${res.status}`,
          });
        } else {
          results.push({ id: a.id, name: a.name, ok: true });
        }
      } catch (err: any) {
        results.push({
          id: a.id,
          name: a.name,
          ok: false,
          message: err?.message || "Request failed",
        });
      }
    }
    setBulkResults(results);
    setBulkDeleting(false);
    const succeededIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (!succeededIds.has(id)) next.add(id);
      return next;
    });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/production-assets"] });
    await refetch();
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-3d-assets-list">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-to-dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Link href="/admin/3d-assets/upload">
              <Button size="sm" data-testid="button-upload-new">
                <Plus className="mr-2 h-4 w-4" />
                Upload asset
              </Button>
            </Link>
          </div>
        </div>

        <OrphanReconcilePanel />

        <R7bE2eCleanupPanel kind="asset" />

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Box className="h-5 w-5 text-fuchsia-400" />
                  3D Asset Library
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin-only catalog of GLB / GLTF assets. Private storage. License + safety
                  + approval lifecycle. No public URLs in this phase.
                </p>
              </div>
              <Badge variant="outline" className="border-fuchsia-500/40 text-fuchsia-500" data-testid="badge-r5c-phase">
                R5C · Admin library
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <AssetSafetyBadges />

            <div className="mb-4 grid gap-3 sm:grid-cols-4" data-testid="filters">
              <div>
                <Label htmlFor="filter-status" className="text-xs">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setOffset(0);
                    setStatus(v);
                  }}
                >
                  <SelectTrigger id="filter-status" data-testid="filter-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`filter-status-option-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-safety-review" className="text-xs">Safety review</Label>
                <Select
                  value={safetyReview}
                  onValueChange={(v) => {
                    setOffset(0);
                    setSafetyReview(v);
                  }}
                >
                  <SelectTrigger id="filter-safety-review" data-testid="filter-safety-review">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SAFETY_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`filter-safety-review-option-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-approval-gate" className="text-xs">Approval gate</Label>
                <Select
                  value={approvalGate}
                  onValueChange={(v) => {
                    setOffset(0);
                    setApprovalGate(v);
                  }}
                >
                  <SelectTrigger id="filter-approval-gate" data-testid="filter-approval-gate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GATE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`filter-approval-gate-option-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-asset-kind" className="text-xs">Asset kind</Label>
                <Select
                  value={assetKind}
                  onValueChange={(v) => {
                    setOffset(0);
                    setAssetKind(v);
                  }}
                >
                  <SelectTrigger id="filter-asset-kind" data-testid="filter-asset-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_KIND_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`filter-asset-kind-option-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div
              className="mb-3 flex flex-wrap items-center gap-2 rounded border border-border bg-muted/20 p-2 text-xs"
              data-testid="bulk-delete-toolbar"
            >
              <span className="text-muted-foreground" data-testid="text-bulk-select-count">
                {selected.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAllArchived(!allArchivedSelected)}
                disabled={archivedItems.length === 0 || bulkDeleting}
                data-testid="button-select-all-archived"
              >
                {allArchivedSelected ? "Unselect all archived" : "Select all archived"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={selected.size === 0 || bulkDeleting}
                data-testid="button-clear-selection"
              >
                Clear selection
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={bulkDelete}
                disabled={selected.size === 0 || bulkDeleting}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {bulkDeleting
                  ? "Deleting…"
                  : `Delete selected (${selected.size})`}
              </Button>
              <span className="ml-auto text-[11px] text-muted-foreground">
                Only archived assets can be permanently deleted.
              </span>
            </div>

            <DeletionHistorySection />

            {bulkResults && (
              <div
                className="mb-3 rounded border border-border bg-muted/20 p-3 text-xs"
                data-testid="bulk-delete-results"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium" data-testid="text-bulk-results-summary">
                    Bulk delete: {bulkResults.filter((r) => r.ok).length} succeeded,{" "}
                    {bulkResults.filter((r) => !r.ok).length} failed
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkResults(null)}
                    data-testid="button-dismiss-bulk-results"
                  >
                    Dismiss
                  </Button>
                </div>
                <ul className="space-y-1">
                  {bulkResults.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-2"
                      data-testid={`bulk-delete-result-${r.id}`}
                    >
                      <Badge
                        variant="outline"
                        className={
                          r.ok
                            ? "border-emerald-500/40 text-emerald-400"
                            : "border-destructive/60 text-destructive"
                        }
                      >
                        {r.ok ? "ok" : "failed"}
                      </Badge>
                      <span className="font-medium">{r.name}</span>
                      <code className="text-[10px] text-muted-foreground">{r.id}</code>
                      {!r.ok && r.message && (
                        <span className="text-destructive">— {r.message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground" data-testid="text-loading">
                Loading assets…
              </div>
            ) : error ? (
              <div className="py-10 text-center text-sm text-destructive" data-testid="text-error">
                Failed to load assets: {(error as Error).message}
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground" data-testid="text-empty">
                No assets match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto rounded border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allArchivedSelected}
                          disabled={archivedItems.length === 0 || bulkDeleting}
                          onCheckedChange={(v) => toggleAllArchived(v === true)}
                          aria-label="Select all archived"
                          data-testid="checkbox-select-all-archived"
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>License</TableHead>
                      <TableHead>Safety</TableHead>
                      <TableHead>Gate</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((a) => {
                      const isArchived = a.status === "archived";
                      return (
                      <TableRow key={a.id} data-testid={`row-asset-${a.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(a.id)}
                            disabled={!isArchived || bulkDeleting}
                            onCheckedChange={(v) => toggleOne(a.id, v === true)}
                            aria-label={
                              isArchived
                                ? `Select ${a.name}`
                                : `${a.name} is not archived`
                            }
                            data-testid={`checkbox-select-asset-${a.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={assetKindBadgeClass(a.metadata?.assetKind)}
                            data-testid={`pill-asset-kind-${a.id}`}
                          >
                            {assetKindLabel(a.metadata?.assetKind)}
                          </Badge>
                        </TableCell>
                        <TableCell><code className="text-xs">{a.format}</code></TableCell>
                        <TableCell>{formatBytes(a.byteSize)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-status-${a.id}`}>{a.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-license-${a.id}`}>{a.licenseStatus}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-safety-${a.id}`}>{a.safetyReview}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-gate-${a.id}`}>{a.approvalGate}</Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/admin/3d-assets/${a.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`link-asset-detail-${a.id}`}
                            >
                              Open
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span data-testid="text-pagination-info">
                Showing {items.length === 0 ? 0 : offset + 1}–{offset + items.length} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || isFetching}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + items.length >= total || isFetching}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
