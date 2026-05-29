import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { buildArchiveRetentionPolicyFieldPayload } from "../omni-channel-audience-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArchivePolicy, ArchiveStats, ArchiveDeletionRow, RetentionStat, formatBytes } from "./_shared";

function TrashThresholdBar({
  label,
  current,
  threshold,
  formatValue,
  testid,
}: {
  label: string;
  current: number;
  threshold: number;
  formatValue: (n: number) => string;
  testid: string;
}) {
  if (threshold <= 0) return null;
  const rawPercent = (current / threshold) * 100;
  const percent = Math.max(0, rawPercent);
  const width = Math.min(100, percent);
  const exceeded = percent >= 100;
  const warn = percent >= 80 && !exceeded;
  const fillClass = exceeded
    ? "bg-red-500"
    : warn
      ? "bg-amber-500"
      : "bg-emerald-500/70";
  return (
    <div className="space-y-0.5" data-testid={testid}>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>
          {label}: {formatValue(current)} / {formatValue(threshold)}
        </span>
        <span data-testid={`${testid}-percent`}>{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
        <div
          className={`h-full ${fillClass} transition-all`}
          style={{ width: `${width}%` }}
          data-testid={`${testid}-fill`}
        />
      </div>
    </div>
  );
}

function TrashThresholdBars({
  fileCount,
  warnFileCount,
  bytes,
  warnBytes,
}: {
  fileCount: number;
  warnFileCount: number;
  bytes: number;
  warnBytes: number;
}) {
  if (warnFileCount <= 0 && warnBytes <= 0) return null;
  return (
    <div className="space-y-1.5" data-testid="block-archive-trash-thresholds">
      <TrashThresholdBar
        label="Files vs warn threshold"
        current={fileCount}
        threshold={warnFileCount}
        formatValue={(n) => n.toLocaleString()}
        testid="bar-archive-trash-files"
      />
      <TrashThresholdBar
        label="Storage vs warn threshold"
        current={bytes}
        threshold={warnBytes}
        formatValue={formatBytes}
        testid="bar-archive-trash-bytes"
      />
    </div>
  );
}

export function ArchiveRetentionPolicyCard() {
  const qc = useQueryClient();
  const [daysInput, setDaysInput] = useState<string>("");
  const [graceInput, setGraceInput] = useState<string>("");
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<ArchiveStats["lastCleanup"] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    files: number;
    bytes: number;
    forceWhenDisabled: boolean;
  } | null>(null);
  const [confirmTrashPurge, setConfirmTrashPurge] = useState<{
    files: number;
    bytes: number;
  } | null>(null);
  const [trashPurgeError, setTrashPurgeError] = useState<string | null>(null);
  const [trashPurgeNotice, setTrashPurgeNotice] = useState<string | null>(null);

  const policyQuery = useQuery<{
    policy: ArchivePolicy;
    stats: ArchiveStats;
    retentionDaysSource?: "admin" | "env" | "default";
    retentionDaysEnvFallback?: number | null;
  }>({
    queryKey: ["/api/admin/newsroom/audience/retention/archive/policy"],
  });
  const deletionsQuery = useQuery<{ deletions: ArchiveDeletionRow[] }>({
    queryKey: ["/api/admin/newsroom/audience/retention/archive/deletions"],
  });
  const trashStatsQuery = useQuery<{
    stats: {
      trashFileCount: number;
      totalTrashBytes: number;
      oldestPendingDeletedAtIso: string | null;
      nextPurgeAtIso: string | null;
      graceDays: number;
      graceDaysSource: "admin" | "env" | "default";
      graceDaysEnvFallback: number | null;
      defaultGraceDays: number;
      trashWarnFileCount: number;
      trashWarnBytes: number;
      trashFileCountExceeded: boolean;
      trashBytesExceeded: boolean;
    };
  }>({
    queryKey: ["/api/admin/newsroom/audience/retention/archive/trash/stats"],
  });
  const trashPurgesQuery = useQuery<{
    purges: Array<{
      id: string;
      startedAt: string;
      finishedAt: string | null;
      trigger: string;
      actor: string | null;
      graceDays: number;
      candidateEntries: number;
      purgedEntries: number;
      bytesPurged: number;
      errorCount: number;
    }>;
  }>({
    queryKey: ["/api/admin/newsroom/audience/retention/archive/trash/purges"],
  });

  const [warnFilesInput, setWarnFilesInput] = useState<string>("");
  const [warnBytesInput, setWarnBytesInput] = useState<string>("");
  const graceInputRef = useRef<HTMLInputElement | null>(null);

  const savePolicyMutation = useMutation({
    mutationFn: async (body: Partial<ArchivePolicy>) => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/archive/policy",
        body,
      );
    },
    onSuccess: () => {
      setPolicyError(null);
      setDaysInput("");
      setGraceInput("");
      setWarnFilesInput("");
      setWarnBytesInput("");
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/archive/policy"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/archive/trash/stats"] });
    },
    onError: (e: any) => setPolicyError(e?.message ?? "policy save failed"),
  });

  const cleanupMutation = useMutation({
    mutationFn: async (body: { dryRun?: boolean; forceWhenDisabled?: boolean }) => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/archive/cleanup",
        body,
      );
    },
    onSuccess: (data: any) => {
      setCleanupError(null);
      setCleanupPreview(data?.result ?? null);
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/archive/policy"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/archive/deletions"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/archive/trash/stats"] });
      qc.invalidateQueries({
        queryKey: [],
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith(
            "/api/admin/newsroom/audience/retention/archive/files",
          ),
      });
    },
    onError: (e: any) => setCleanupError(e?.message ?? "cleanup failed"),
  });

  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const trashRestoreMutation = useMutation({
    mutationFn: async (deletionId: string) => {
      return await apiRequest(
        "POST",
        `/api/admin/newsroom/audience/retention/archive/deletions/${encodeURIComponent(deletionId)}/restore`,
        {},
      );
    },
    onSuccess: (data: any) => {
      setRestoreError(null);
      setRestoreNotice(
        `Restored ${data?.result?.restoredPath ?? "archive file"} from trash.`,
      );
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/archive/policy"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/archive/deletions"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/archive/trash/stats"] });
      qc.invalidateQueries({
        queryKey: [],
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith(
            "/api/admin/newsroom/audience/retention/archive/files",
          ),
      });
    },
    onError: (e: any) => {
      setRestoreNotice(null);
      setRestoreError(e?.message ?? "restore failed");
    },
  });

  const trashPurgeMutation = useMutation({
    mutationFn: async (body: { graceDays?: number }) => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/archive/trash/purge",
        body,
      );
    },
    onSuccess: (data: any) => {
      setTrashPurgeError(null);
      const purged = Number(data?.result?.purgedEntries ?? 0);
      const bytes = Number(data?.result?.bytesPurged ?? 0);
      const errCount = Array.isArray(data?.result?.errors)
        ? data.result.errors.length
        : 0;
      setTrashPurgeNotice(
        `Emptied recycle bin: ${purged.toLocaleString()} file${
          purged === 1 ? "" : "s"
        } purged (${formatBytes(bytes)} reclaimed)${
          errCount > 0 ? `, ${errCount} error${errCount === 1 ? "" : "s"}` : ""
        }.`,
      );
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/retention/archive/trash/stats"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/retention/archive/deletions"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/retention/archive/policy"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/retention/archive/trash/purges"],
      });
    },
    onError: (e: any) => {
      setTrashPurgeNotice(null);
      setTrashPurgeError(e?.message ?? "purge failed");
    },
  });

  const stats = policyQuery.data?.stats;
  const policy = policyQuery.data?.policy;
  const nextBatch = stats?.nextExpiryBatch;
  const hasWarning = !!nextBatch && nextBatch.fileCount > 0;
  const earliestExpiry =
    nextBatch?.earliestExpiryIso ? new Date(nextBatch.earliestExpiryIso) : null;

  return (
    <Card data-testid="card-archive-policy">
      <CardHeader>
        <CardTitle>Archive Retention Policy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Archived files in
          <code className="mx-1">PRIVATE_OBJECT_DIR/audience-archive/</code>
          are <strong>permanently deleted</strong> once they exceed this
          window. Default is{" "}
          {stats?.defaultRetentionDays ?? 365} days. Set the window to a
          shorter or longer value, or switch auto-delete off entirely to keep
          everything until you trigger a manual cleanup.
        </p>

        {policyQuery.isLoading && (
          <p className="text-sm text-muted-foreground" data-testid="text-archive-policy-loading">
            Loading archive policy…
          </p>
        )}

        {stats && policy && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <RetentionStat
                label="Window"
                value={`${policy.retentionDays} days`}
                sub={
                  policyQuery.data?.retentionDaysSource === "admin"
                    ? `custom override: ${policy.retentionDays}d`
                    : policyQuery.data?.retentionDaysSource === "env"
                    ? `env fallback: ${
                        policyQuery.data?.retentionDaysEnvFallback ??
                        policy.retentionDays
                      }d`
                    : `default: ${stats.defaultRetentionDays}d`
                }
                testid="stat-archive-retention-window"
              />
              <RetentionStat
                label="Auto-delete"
                value={policy.autoDeleteEnabled ? "On" : "Off"}
                sub={policy.autoDeleteEnabled ? "scheduled sweep runs" : "manual only"}
                testid="stat-archive-autodelete"
              />
              <RetentionStat
                label="Total files"
                value={stats.totalFiles.toLocaleString()}
                sub={formatBytes(stats.totalBytes)}
                testid="stat-archive-total"
              />
              <RetentionStat
                label="Oldest file"
                value={
                  stats.oldestFileAgeDays != null
                    ? `${stats.oldestFileAgeDays}d old`
                    : "—"
                }
                sub={stats.expiredFileCount > 0
                  ? `${stats.expiredFileCount} past window`
                  : "all within window"}
                testid="stat-archive-oldest"
              />
            </div>

            {trashStatsQuery.data?.stats && (
              <div
                className="rounded border bg-muted/30 p-3 space-y-2"
                data-testid="block-archive-trash-stats"
              >
                <div className="text-xs font-semibold text-muted-foreground uppercase">
                  Recycle bin (.trash/)
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <RetentionStat
                    label="Files in trash"
                    value={trashStatsQuery.data.stats.trashFileCount.toLocaleString()}
                    sub={
                      trashStatsQuery.data.stats.trashFileCount === 0
                        ? "empty"
                        : "soft-deleted"
                    }
                    testid="stat-archive-trash-files"
                  />
                  <RetentionStat
                    label="Storage used"
                    value={formatBytes(trashStatsQuery.data.stats.totalTrashBytes)}
                    sub="pending purge"
                    testid="stat-archive-trash-bytes"
                  />
                  <RetentionStat
                    label="Grace window"
                    value={`${trashStatsQuery.data.stats.graceDays} day${
                      trashStatsQuery.data.stats.graceDays === 1 ? "" : "s"
                    }`}
                    sub="before hard-delete"
                    testid="stat-archive-trash-grace"
                  />
                  <RetentionStat
                    label="Next purge"
                    value={
                      trashStatsQuery.data.stats.nextPurgeAtIso
                        ? new Date(
                            trashStatsQuery.data.stats.nextPurgeAtIso,
                          ).toLocaleString()
                        : "—"
                    }
                    sub={
                      trashStatsQuery.data.stats.oldestPendingDeletedAtIso
                        ? `oldest deleted ${new Date(
                            trashStatsQuery.data.stats.oldestPendingDeletedAtIso,
                          ).toLocaleDateString()}`
                        : "nothing pending"
                    }
                    testid="stat-archive-trash-next-purge"
                  />
                </div>
                <TrashThresholdBars
                  fileCount={trashStatsQuery.data.stats.trashFileCount}
                  warnFileCount={trashStatsQuery.data.stats.trashWarnFileCount}
                  bytes={trashStatsQuery.data.stats.totalTrashBytes}
                  warnBytes={trashStatsQuery.data.stats.trashWarnBytes}
                />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setConfirmTrashPurge({
                        files: trashStatsQuery.data!.stats.trashFileCount,
                        bytes: trashStatsQuery.data!.stats.totalTrashBytes,
                      });
                    }}
                    disabled={
                      trashPurgeMutation.isPending ||
                      trashStatsQuery.data!.stats.trashFileCount === 0
                    }
                    data-testid="button-archive-trash-empty-now"
                  >
                    {trashPurgeMutation.isPending
                      ? "Emptying…"
                      : `Empty trash now (${trashStatsQuery.data!.stats.trashFileCount.toLocaleString()} file${
                          trashStatsQuery.data!.stats.trashFileCount === 1 ? "" : "s"
                        })`}
                  </Button>
                  {trashPurgeNotice && (
                    <span
                      className="text-xs text-emerald-600"
                      data-testid="text-archive-trash-purge-notice"
                    >
                      {trashPurgeNotice}
                    </span>
                  )}
                  {trashPurgeError && (
                    <span
                      className="text-xs text-destructive"
                      data-testid="text-archive-trash-purge-error"
                    >
                      {trashPurgeError}
                    </span>
                  )}
                </div>
                <div
                  className="rounded border bg-background/40 p-2 space-y-1"
                  data-testid="block-archive-trash-purges"
                >
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Recent recycle-bin purges
                  </div>
                  {trashPurgesQuery.isLoading && (
                    <div
                      className="text-xs text-muted-foreground"
                      data-testid="text-archive-trash-purges-loading"
                    >
                      Loading…
                    </div>
                  )}
                  {!trashPurgesQuery.isLoading &&
                    (trashPurgesQuery.data?.purges?.length ?? 0) === 0 && (
                      <div
                        className="text-xs text-muted-foreground"
                        data-testid="text-archive-trash-purges-empty"
                      >
                        No purges recorded yet.
                      </div>
                    )}
                  {(trashPurgesQuery.data?.purges?.length ?? 0) > 0 && (
                    <ul className="space-y-1">
                      {trashPurgesQuery.data!.purges.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center gap-2 text-xs"
                          data-testid={`row-archive-trash-purge-${p.id}`}
                        >
                          <span
                            className="font-mono text-muted-foreground"
                            data-testid={`text-archive-trash-purge-when-${p.id}`}
                          >
                            {new Date(p.startedAt).toLocaleString()}
                          </span>
                          <Badge
                            variant={p.trigger === "manual" ? "default" : "outline"}
                            data-testid={`badge-archive-trash-purge-trigger-${p.id}`}
                          >
                            {p.trigger}
                          </Badge>
                          {p.actor && (
                            <span
                              className="text-muted-foreground"
                              data-testid={`text-archive-trash-purge-actor-${p.id}`}
                            >
                              by {p.actor}
                            </span>
                          )}
                          <span data-testid={`text-archive-trash-purge-files-${p.id}`}>
                            {p.purgedEntries.toLocaleString()}/
                            {p.candidateEntries.toLocaleString()} file
                            {p.candidateEntries === 1 ? "" : "s"}
                          </span>
                          <span data-testid={`text-archive-trash-purge-bytes-${p.id}`}>
                            {formatBytes(p.bytesPurged)}
                          </span>
                          {p.errorCount > 0 && (
                            <span
                              className="text-destructive"
                              data-testid={`text-archive-trash-purge-errors-${p.id}`}
                            >
                              {p.errorCount} error{p.errorCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {(trashStatsQuery.data.stats.trashFileCountExceeded ||
                  trashStatsQuery.data.stats.trashBytesExceeded) && (
                  <div
                    className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-2"
                    data-testid="block-archive-trash-warning"
                  >
                    <div className="font-semibold">
                      ⚠ Recycle bin is hoarding too much storage.
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {trashStatsQuery.data.stats.trashFileCountExceeded && (
                        <li data-testid="text-archive-trash-warning-files">
                          {trashStatsQuery.data.stats.trashFileCount.toLocaleString()} file
                          {trashStatsQuery.data.stats.trashFileCount === 1 ? "" : "s"} in trash
                          exceeds the configured threshold of{" "}
                          {trashStatsQuery.data.stats.trashWarnFileCount.toLocaleString()}.
                        </li>
                      )}
                      {trashStatsQuery.data.stats.trashBytesExceeded && (
                        <li data-testid="text-archive-trash-warning-bytes">
                          {formatBytes(trashStatsQuery.data.stats.totalTrashBytes)} of pending-purge
                          storage exceeds the configured threshold of{" "}
                          {formatBytes(trashStatsQuery.data.stats.trashWarnBytes)}.
                        </li>
                      )}
                    </ul>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setConfirmTrashPurge({
                            files: trashStatsQuery.data!.stats.trashFileCount,
                            bytes: trashStatsQuery.data!.stats.totalTrashBytes,
                          });
                        }}
                        disabled={trashPurgeMutation.isPending}
                        data-testid="button-archive-trash-empty"
                      >
                        Empty trash
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          graceInputRef.current?.focus();
                          graceInputRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                        }}
                        data-testid="button-archive-trash-shorten-grace"
                      >
                        Shorten grace window
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {hasWarning && policy.autoDeleteEnabled && (
              <div
                className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1"
                data-testid="block-archive-warning"
              >
                <div className="font-semibold">
                  ⚠ {nextBatch!.fileCount.toLocaleString()} file
                  {nextBatch!.fileCount === 1 ? "" : "s"} ({formatBytes(nextBatch!.totalBytes)})
                  scheduled to be permanently deleted within{" "}
                  {nextBatch!.withinDays} day{nextBatch!.withinDays === 1 ? "" : "s"}.
                </div>
                {earliestExpiry && (
                  <div data-testid="text-archive-earliest-expiry">
                    Earliest deletion: {earliestExpiry.toLocaleString()}
                  </div>
                )}
                <div>
                  Download anything you still need from the browser below, or
                  raise the retention window before the next sweep runs.
                </div>
              </div>
            )}

            {hasWarning && !policy.autoDeleteEnabled && (
              <div
                className="rounded border border-muted bg-muted/30 p-3 text-xs space-y-1"
                data-testid="block-archive-disabled-warning"
              >
                Auto-delete is currently <strong>off</strong>. No files will be
                removed by the daily sweep, but{" "}
                {nextBatch!.fileCount.toLocaleString()} file
                {nextBatch!.fileCount === 1 ? "" : "s"} are already past the
                {" "}
                {policy.retentionDays}-day window and will be removed the next
                time you re-enable auto-delete or trigger a manual cleanup.
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-end pt-1">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Retention window (days)</span>
                <Input
                  type="number"
                  min={1}
                  className="w-32"
                  value={daysInput}
                  onChange={(e) => setDaysInput(e.target.value)}
                  placeholder={String(policy.retentionDays)}
                  data-testid="input-archive-retention-days"
                />
              </label>
              <Button
                size="sm"
                onClick={() => {
                  try {
                    const payload = buildArchiveRetentionPolicyFieldPayload({
                      field: "retentionDays",
                      input: daysInput,
                    });
                    savePolicyMutation.mutate(payload);
                  } catch (e: any) {
                    setPolicyError(e?.message ?? "invalid input");
                  }
                }}
                disabled={savePolicyMutation.isPending || daysInput.trim() === ""}
                data-testid="button-archive-save-window"
              >
                {savePolicyMutation.isPending ? "Saving…" : "Save window"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  savePolicyMutation.mutate({ autoDeleteEnabled: !policy.autoDeleteEnabled })
                }
                disabled={savePolicyMutation.isPending}
                data-testid="button-archive-toggle-autodelete"
              >
                {policy.autoDeleteEnabled ? "Turn auto-delete off" : "Turn auto-delete on"}
              </Button>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">
                  Recycle-bin grace (days)
                </span>
                <Input
                  ref={graceInputRef}
                  type="number"
                  min={1}
                  className="w-32"
                  value={graceInput}
                  onChange={(e) => setGraceInput(e.target.value)}
                  placeholder={String(policy.trashGraceDays)}
                  data-testid="input-archive-trash-grace-days"
                />
                {trashStatsQuery.data?.stats && (
                  <span
                    className="block text-[10px] text-muted-foreground"
                    data-testid="text-archive-trash-grace-source"
                  >
                    {trashStatsQuery.data.stats.graceDaysSource === "admin"
                      ? `custom override: ${trashStatsQuery.data.stats.graceDays}d`
                      : trashStatsQuery.data.stats.graceDaysSource === "env"
                      ? `env fallback: ${
                          trashStatsQuery.data.stats.graceDaysEnvFallback ??
                          trashStatsQuery.data.stats.graceDays
                        }d`
                      : `default: ${trashStatsQuery.data.stats.defaultGraceDays}d`}
                  </span>
                )}
              </label>
              <Button
                size="sm"
                onClick={() => {
                  try {
                    const payload = buildArchiveRetentionPolicyFieldPayload({
                      field: "trashGraceDays",
                      input: graceInput,
                    });
                    savePolicyMutation.mutate(payload);
                  } catch (e: any) {
                    setPolicyError(e?.message ?? "invalid input");
                  }
                }}
                disabled={savePolicyMutation.isPending || graceInput.trim() === ""}
                data-testid="button-archive-save-trash-grace"
              >
                {savePolicyMutation.isPending ? "Saving…" : "Save grace"}
              </Button>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">
                  Trash warn — files (0 = off)
                </span>
                <Input
                  type="number"
                  min={0}
                  className="w-32"
                  value={warnFilesInput}
                  onChange={(e) => setWarnFilesInput(e.target.value)}
                  placeholder={String(policy.trashWarnFileCount)}
                  data-testid="input-archive-trash-warn-files"
                />
              </label>
              <Button
                size="sm"
                onClick={() => {
                  try {
                    const payload = buildArchiveRetentionPolicyFieldPayload({
                      field: "trashWarnFileCount",
                      input: warnFilesInput,
                    });
                    savePolicyMutation.mutate(payload);
                  } catch (e: any) {
                    setPolicyError(e?.message ?? "invalid input");
                  }
                }}
                disabled={savePolicyMutation.isPending || warnFilesInput.trim() === ""}
                data-testid="button-archive-save-trash-warn-files"
              >
                {savePolicyMutation.isPending ? "Saving…" : "Save file warn"}
              </Button>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">
                  Trash warn — bytes (0 = off)
                </span>
                <Input
                  type="number"
                  min={0}
                  className="w-40"
                  value={warnBytesInput}
                  onChange={(e) => setWarnBytesInput(e.target.value)}
                  placeholder={String(policy.trashWarnBytes)}
                  data-testid="input-archive-trash-warn-bytes"
                />
              </label>
              <Button
                size="sm"
                onClick={() => {
                  try {
                    const payload = buildArchiveRetentionPolicyFieldPayload({
                      field: "trashWarnBytes",
                      input: warnBytesInput,
                    });
                    savePolicyMutation.mutate(payload);
                  } catch (e: any) {
                    setPolicyError(e?.message ?? "invalid input");
                  }
                }}
                disabled={savePolicyMutation.isPending || warnBytesInput.trim() === ""}
                data-testid="button-archive-save-trash-warn-bytes"
              >
                {savePolicyMutation.isPending ? "Saving…" : "Save byte warn"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cleanupMutation.mutate({ dryRun: true })}
                disabled={cleanupMutation.isPending}
                data-testid="button-archive-dryrun"
              >
                {cleanupMutation.isPending ? "Running…" : "Preview cleanup (dry-run)"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setConfirmDelete({
                    files: stats.expiredFileCount,
                    bytes: stats.expiredBytes,
                    forceWhenDisabled: !policy.autoDeleteEnabled,
                  });
                }}
                disabled={cleanupMutation.isPending || stats.expiredFileCount === 0}
                data-testid="button-archive-delete-now"
              >
                Delete {stats.expiredFileCount.toLocaleString()} expired file
                {stats.expiredFileCount === 1 ? "" : "s"} now
              </Button>
              {policyError && (
                <span className="text-xs text-destructive self-center" data-testid="text-archive-policy-error">
                  {policyError}
                </span>
              )}
              {cleanupError && (
                <span className="text-xs text-destructive self-center" data-testid="text-archive-cleanup-error">
                  {cleanupError}
                </span>
              )}
            </div>

            {cleanupPreview && (
              <div
                className="rounded border p-2 text-xs space-y-1"
                data-testid="block-archive-cleanup-result"
              >
                <div>
                  {cleanupPreview.dryRun ? "Dry-run" : "Cleanup"} —
                  {" "}
                  {cleanupPreview.candidateFiles.toLocaleString()} candidate
                  {cleanupPreview.candidateFiles === 1 ? "" : "s"} ·{" "}
                  {cleanupPreview.deletedFiles.toLocaleString()} deleted ·{" "}
                  {formatBytes(cleanupPreview.bytesDeleted)} reclaimed
                  {cleanupPreview.skippedReason && (
                    <span className="ml-2 text-muted-foreground">
                      ({cleanupPreview.skippedReason})
                    </span>
                  )}
                </div>
                {cleanupPreview.errors.length > 0 && (
                  <div className="text-destructive" data-testid="text-archive-cleanup-result-errors">
                    {cleanupPreview.errors.length} error{cleanupPreview.errors.length === 1 ? "" : "s"}: {cleanupPreview.errors[0].error}
                  </div>
                )}
              </div>
            )}

            {stats.lastCleanup && (
              <div className="text-xs text-muted-foreground" data-testid="text-archive-last-cleanup">
                Last cleanup at{" "}
                {new Date(stats.lastCleanup.startedAt).toLocaleString()} ({stats.lastCleanup.trigger}):
                {" "}
                {stats.lastCleanup.deletedFiles}/{stats.lastCleanup.candidateFiles} files removed
                {stats.lastCleanup.errors.length > 0
                  ? `, ${stats.lastCleanup.errors.length} error(s)`
                  : ""}
                .
              </div>
            )}

            {deletionsQuery.data?.deletions && deletionsQuery.data.deletions.length > 0 && (
              <div className="space-y-1" data-testid="block-archive-deletions-log">
                <div className="text-xs font-semibold text-muted-foreground uppercase">
                  Recent permanent deletions
                </div>
                <div className="space-y-1 max-h-48 overflow-auto">
                  {deletionsQuery.data.deletions.slice(0, 10).map((d) => {
                    const inTrash = !!d.trashPath && !d.purgedAt;
                    const purged = !!d.purgedAt;
                    return (
                      <div
                        key={d.deletionId}
                        className="rounded border p-2 text-[11px]"
                        data-testid={`row-archive-deletion-${d.deletionId}`}
                      >
                        <div className="flex gap-2 flex-wrap items-center">
                          <Badge variant="outline">{d.archiveTable}</Badge>
                          {inTrash && (
                            <Badge
                              variant="secondary"
                              data-testid={`badge-archive-deletion-trash-${d.deletionId}`}
                            >
                              In trash
                            </Badge>
                          )}
                          {purged && (
                            <Badge
                              variant="destructive"
                              data-testid={`badge-archive-deletion-purged-${d.deletionId}`}
                            >
                              Purged
                            </Badge>
                          )}
                          <span>{formatBytes(d.bytes)}</span>
                          <span>·</span>
                          <span>{Math.round(d.archiveAgeDays)}d old at deletion</span>
                          <span>·</span>
                          <span>{d.trigger}</span>
                          {d.actor && (
                            <>
                              <span>·</span>
                              <span>{d.actor}</span>
                            </>
                          )}
                          <span className="ml-auto text-muted-foreground">
                            {new Date(d.deletedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="font-mono break-all text-muted-foreground">
                          {d.path}
                        </div>
                        {inTrash && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-muted-foreground">
                              Restorable for{" "}
                              {d.graceDays != null
                                ? `${d.graceDays}d grace window`
                                : "the configured grace window"}
                              .
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => trashRestoreMutation.mutate(d.deletionId)}
                              disabled={
                                trashRestoreMutation.isPending &&
                                trashRestoreMutation.variables === d.deletionId
                              }
                              data-testid={`button-archive-deletion-restore-${d.deletionId}`}
                            >
                              {trashRestoreMutation.isPending &&
                              trashRestoreMutation.variables === d.deletionId
                                ? "Restoring…"
                                : "Restore"}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {restoreNotice && (
                  <div
                    className="text-xs text-emerald-600"
                    data-testid="text-archive-restore-notice"
                  >
                    {restoreNotice}
                  </div>
                )}
                {restoreError && (
                  <div
                    className="text-xs text-destructive"
                    data-testid="text-archive-restore-error"
                  >
                    {restoreError}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <Dialog
          open={confirmDelete !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmDelete(null);
          }}
        >
          <DialogContent data-testid="dialog-archive-delete-confirm">
            <DialogHeader>
              <DialogTitle>Permanently delete {confirmDelete?.files ?? 0} archive file{(confirmDelete?.files ?? 0) === 1 ? "" : "s"}?</DialogTitle>
              <DialogDescription>
                This will remove {formatBytes(confirmDelete?.bytes ?? 0)} of
                gzipped JSONL archives from object storage. The deletion is
                logged in the audit trail but the files themselves cannot be
                recovered. Download anything you still need before continuing.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(null)}
                data-testid="button-archive-delete-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  cleanupMutation.mutate({
                    forceWhenDisabled: confirmDelete?.forceWhenDisabled ?? false,
                  });
                  setConfirmDelete(null);
                }}
                data-testid="button-archive-delete-confirm"
              >
                Delete permanently
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={confirmTrashPurge !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmTrashPurge(null);
          }}
        >
          <DialogContent data-testid="dialog-archive-trash-purge-confirm">
            <DialogHeader>
              <DialogTitle>
                Empty recycle bin —{" "}
                {(confirmTrashPurge?.files ?? 0).toLocaleString()} file
                {(confirmTrashPurge?.files ?? 0) === 1 ? "" : "s"}?
              </DialogTitle>
              <DialogDescription>
                This permanently hard-deletes every file currently in{" "}
                <code>.trash/</code>, reclaiming{" "}
                {formatBytes(confirmTrashPurge?.bytes ?? 0)} of object storage.
                The recycle-bin grace window will be bypassed, so soft-deleted
                files can no longer be restored after this runs. The deletion
                is recorded in the audit trail.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setConfirmTrashPurge(null)}
                data-testid="button-archive-trash-purge-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  trashPurgeMutation.mutate({ graceDays: 0 });
                  setConfirmTrashPurge(null);
                }}
                data-testid="button-archive-trash-purge-confirm"
              >
                Empty trash now
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
