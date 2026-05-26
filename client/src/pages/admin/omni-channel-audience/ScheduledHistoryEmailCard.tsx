import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
import {
  HISTORY_EMAIL_SCHEDULE_URL,
  HISTORY_EMAIL_FAILURE_THRESHOLD_ERRORS,
  buildHistoryEmailSchedulePayload,
  buildHistoryEmailFailureThresholdPayload,
} from "../omni-channel-audience-forms";
import { EmailSchedule, EmailRun, FailureAlertSnoozeControls } from "./_shared";

type HistoryEmailStats = {
  windowDays: number;
  windowStart: string;
  windowEnd: string | null;
  usedExplicitRange: boolean;
  recipient: string | null;
  totalSends: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  lastSuccessfulRunAt: string | null;
  lastSuccessfulRunAgeMs: number | null;
  lastSuccessfulHistoryRows: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  excludesTestRuns: boolean;
};

type HistoryEmailRecipientStat = {
  recipient: string;
  totalSends: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  successRate: number;
  lastSuccessfulRunAt: string | null;
};

function formatAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type FilterPreset = {
  id: string;
  name: string;
  from: string | null;
  to: string | null;
  recipient: string | null;
  createdAt: string;
  createdBy: string | null;
};

function describePreset(p: FilterPreset): string {
  const parts: string[] = [];
  if (p.from || p.to) {
    parts.push(`${p.from || "…"} → ${p.to || "…"}`);
  }
  if (p.recipient) parts.push(p.recipient);
  return parts.join(" · ") || "no filters";
}

function describePresetAuthor(p: FilterPreset): string {
  let savedAt = "unknown date";
  if (p.createdAt) {
    const d = new Date(p.createdAt);
    if (!Number.isNaN(d.getTime())) {
      savedAt = d.toLocaleDateString();
    }
  }
  const who = p.createdBy && p.createdBy.trim().length > 0 ? p.createdBy.trim() : null;
  return who ? `saved by ${who} on ${savedAt}` : `saved on ${savedAt}`;
}

function HistoryEmailStatsPanel({
  stats,
  byRecipient,
  loading,
  onDownloadCsv,
  csvExporting,
  csvError,
  onDownloadBreakdownCsv,
  breakdownCsvExporting,
  breakdownCsvError,
  from,
  to,
  recipient,
  knownRecipients,
  onFromChange,
  onToChange,
  onRecipientChange,
  onClearFilters,
  presets,
  presetsLoading,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onUpdatePreset,
  presetSaving,
  presetDeletingId,
  presetUpdatingId,
  pendingCloseEditId,
  onAcknowledgeCloseEdit,
  presetError,
}: {
  stats: HistoryEmailStats | undefined;
  byRecipient: HistoryEmailRecipientStat[];
  loading: boolean;
  onDownloadCsv: () => void;
  csvExporting: boolean;
  csvError: string | null;
  onDownloadBreakdownCsv: () => void;
  breakdownCsvExporting: boolean;
  breakdownCsvError: string | null;
  from: string;
  to: string;
  recipient: string;
  knownRecipients: string[];
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onRecipientChange: (v: string) => void;
  onClearFilters: () => void;
  presets: FilterPreset[];
  presetsLoading: boolean;
  onApplyPreset: (p: FilterPreset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  onUpdatePreset: (
    id: string,
    patch: { name: string; from: string | null; to: string | null; recipient: string | null },
  ) => void;
  presetSaving: boolean;
  presetDeletingId: string | null;
  presetUpdatingId: string | null;
  pendingCloseEditId: string | null;
  onAcknowledgeCloseEdit: () => void;
  presetError: string | null;
}) {
  const [newPresetName, setNewPresetName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    if (pendingCloseEditId && editingId === pendingCloseEditId) {
      setEditingId(null);
      onAcknowledgeCloseEdit();
    } else if (pendingCloseEditId) {
      onAcknowledgeCloseEdit();
    }
  }, [pendingCloseEditId, editingId, onAcknowledgeCloseEdit]);
  const [editName, setEditName] = useState("");
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editRecipient, setEditRecipient] = useState("");
  const startEdit = (p: FilterPreset) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditFrom(p.from ?? "");
    setEditTo(p.to ?? "");
    setEditRecipient(p.recipient ?? "");
  };
  const cancelEdit = () => {
    setEditingId(null);
  };
  const saveEdit = (id: string) => {
    onUpdatePreset(id, {
      name: editName.trim(),
      from: editFrom || null,
      to: editTo || null,
      recipient: editRecipient || null,
    });
  };
  const editingPreset = editingId
    ? presets.find((p) => p.id === editingId) ?? null
    : null;
  const filtersActiveForSave = Boolean(from || to || recipient);
  const usingExplicitRange = Boolean(stats?.usedExplicitRange);
  const filtersActive = Boolean(from || to || recipient);
  const headerLabel = usingExplicitRange
    ? `Compliance health (${stats?.windowStart ? new Date(stats.windowStart).toLocaleDateString() : "…"} → ${stats?.windowEnd ? new Date(stats.windowEnd).toLocaleDateString() : "…"}${stats?.excludesTestRuns ? ", excl. tests" : ""}${stats?.recipient ? `, ${stats.recipient}` : ""})`
    : `Compliance health (last ${stats?.windowDays ?? 30} days${stats?.excludesTestRuns ? ", excl. tests" : ""}${stats?.recipient ? `, ${stats.recipient}` : ""})`;
  return (
    <div
      className="rounded border bg-muted/30 p-3 space-y-2"
      data-testid="panel-history-email-stats"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div
          className="text-xs uppercase text-muted-foreground"
          data-testid="text-history-stats-header"
        >
          {headerLabel}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {csvError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-history-runs-csv-error"
            >
              {csvError}
            </span>
          )}
          {breakdownCsvError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-history-breakdown-csv-error"
            >
              {breakdownCsvError}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onDownloadCsv}
            disabled={csvExporting}
            data-testid="button-history-runs-csv"
          >
            {csvExporting
              ? "Exporting…"
              : filtersActive
                ? "Download CSV (filtered)"
                : "Download CSV (90d)"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDownloadBreakdownCsv}
            disabled={breakdownCsvExporting}
            data-testid="button-history-breakdown-csv"
          >
            {breakdownCsvExporting ? "Exporting…" : "Download breakdown CSV"}
          </Button>
        </div>
      </div>
      <div
        className="rounded border bg-background/40 p-2 space-y-2 text-xs"
        data-testid="panel-history-stats-filter-presets"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground font-medium">
            Saved filter presets
          </span>
          {presetsLoading && presets.length === 0 && (
            <span className="text-muted-foreground">Loading…</span>
          )}
          {!presetsLoading && presets.length === 0 && (
            <span
              className="text-muted-foreground"
              data-testid="text-history-presets-empty"
            >
              None yet — save the current filters below to start a list.
            </span>
          )}
          {presets.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5"
              data-testid={`chip-history-preset-${p.id}`}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => onApplyPreset(p)}
                    data-testid={`button-history-preset-apply-${p.id}`}
                  >
                    {p.name}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div data-testid={`tooltip-history-preset-${p.id}`}>
                    <div>{describePreset(p)}</div>
                    <div
                      className="text-[10px] opacity-80 mt-0.5"
                      data-testid={`text-history-preset-author-${p.id}`}
                    >
                      {describePresetAuthor(p)}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
              <button
                type="button"
                aria-label={`Edit preset ${p.name}`}
                title="Edit preset"
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={() => startEdit(p)}
                disabled={presetUpdatingId === p.id}
                data-testid={`button-history-preset-edit-${p.id}`}
              >
                ✎
              </button>
              <button
                type="button"
                aria-label={`Delete preset ${p.name}`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                onClick={() => onDeletePreset(p.id)}
                disabled={presetDeletingId === p.id}
                data-testid={`button-history-preset-delete-${p.id}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {editingPreset && (
          <div
            className="rounded border bg-background/60 p-2 space-y-2"
            data-testid={`panel-history-preset-edit-${editingPreset.id}`}
          >
            <div className="text-muted-foreground text-[11px] uppercase">
              Editing preset
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="space-y-1 flex flex-col sm:col-span-2">
                <span className="text-muted-foreground">Name</span>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 text-xs"
                  maxLength={80}
                  data-testid={`input-history-preset-edit-name-${editingPreset.id}`}
                />
              </label>
              <label className="space-y-1 flex flex-col">
                <span className="text-muted-foreground">From</span>
                <input
                  type="date"
                  value={editFrom}
                  onChange={(e) => setEditFrom(e.target.value)}
                  className="w-full h-8 rounded border bg-background px-2 text-xs"
                  data-testid={`input-history-preset-edit-from-${editingPreset.id}`}
                />
              </label>
              <label className="space-y-1 flex flex-col">
                <span className="text-muted-foreground">To</span>
                <input
                  type="date"
                  value={editTo}
                  onChange={(e) => setEditTo(e.target.value)}
                  className="w-full h-8 rounded border bg-background px-2 text-xs"
                  data-testid={`input-history-preset-edit-to-${editingPreset.id}`}
                />
              </label>
              <label className="space-y-1 flex flex-col sm:col-span-4">
                <span className="text-muted-foreground">Recipient</span>
                <Input
                  value={editRecipient}
                  onChange={(e) => setEditRecipient(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="audit@example.com"
                  data-testid={`input-history-preset-edit-recipient-${editingPreset.id}`}
                />
              </label>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  presetUpdatingId === editingPreset.id ||
                  editName.trim().length === 0 ||
                  (!editFrom && !editTo && !editRecipient)
                }
                onClick={() => saveEdit(editingPreset.id)}
                data-testid={`button-history-preset-edit-save-${editingPreset.id}`}
              >
                {presetUpdatingId === editingPreset.id ? "Saving…" : "Save changes"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEdit}
                data-testid={`button-history-preset-edit-cancel-${editingPreset.id}`}
              >
                Cancel
              </Button>
              {!editFrom && !editTo && !editRecipient && (
                <span className="text-muted-foreground text-xs">
                  Pick a date range or recipient.
                </span>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder='e.g. "Q3 2025 — audit@example.com"'
            className="h-8 w-64 text-xs"
            data-testid="input-history-preset-name"
            maxLength={80}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={
              presetSaving ||
              !filtersActiveForSave ||
              newPresetName.trim().length === 0
            }
            onClick={() => {
              const name = newPresetName.trim();
              if (!name) return;
              onSavePreset(name);
              setNewPresetName("");
            }}
            data-testid="button-history-preset-save"
          >
            {presetSaving ? "Saving…" : "Save current filters as preset"}
          </Button>
          {!filtersActiveForSave && (
            <span className="text-muted-foreground">
              Pick a date range or recipient first.
            </span>
          )}
          {presetError && (
            <span
              className="text-destructive"
              data-testid="text-history-preset-error"
            >
              {presetError}
            </span>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-4 text-xs">
        <label className="space-y-1 flex flex-col">
          <span className="text-muted-foreground">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className="w-full h-8 rounded border bg-background px-2 text-xs"
            data-testid="input-history-stats-from"
          />
        </label>
        <label className="space-y-1 flex flex-col">
          <span className="text-muted-foreground">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className="w-full h-8 rounded border bg-background px-2 text-xs"
            data-testid="input-history-stats-to"
          />
        </label>
        <label className="space-y-1 flex flex-col">
          <span className="text-muted-foreground">Recipient</span>
          <select
            value={recipient}
            onChange={(e) => onRecipientChange(e.target.value)}
            className="w-full h-8 rounded border bg-background px-2 text-xs"
            data-testid="select-history-stats-recipient"
          >
            <option value="">All recipients</option>
            {knownRecipients.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            {recipient && !knownRecipients.includes(recipient) && (
              <option value={recipient}>{recipient}</option>
            )}
          </select>
        </label>
        <div className="flex items-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearFilters}
            disabled={!filtersActive}
            data-testid="button-history-stats-clear-filters"
            className="w-full"
          >
            Clear filters
          </Button>
        </div>
      </div>
      {loading && !stats ? (
        <p className="text-xs text-muted-foreground" data-testid="text-history-stats-loading">
          Loading stats…
        </p>
      ) : !stats ? (
        <p className="text-xs text-muted-foreground" data-testid="text-history-stats-empty">
          No stats available.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded border bg-background p-2">
            <div className="text-muted-foreground">Sends in window</div>
            <div
              className="text-base font-medium tabular-nums"
              data-testid="stat-history-total-sends"
            >
              {stats.totalSends}
            </div>
          </div>
          <div className="rounded border bg-background p-2">
            <div className="text-muted-foreground">Success / Failed</div>
            <div className="text-base font-medium tabular-nums flex gap-2 items-baseline">
              <span data-testid="stat-history-success-count" className="text-green-600">
                {stats.successCount}
              </span>
              <span className="text-muted-foreground">/</span>
              <span
                data-testid="stat-history-failure-count"
                className={stats.failureCount > 0 ? "text-destructive" : ""}
              >
                {stats.failureCount}
              </span>
              {stats.pendingCount > 0 && (
                <span
                  className="text-muted-foreground"
                  data-testid="stat-history-pending-count"
                >
                  ({stats.pendingCount} pending)
                </span>
              )}
            </div>
          </div>
          <div className="rounded border bg-background p-2">
            <div className="text-muted-foreground">Last successful delivery</div>
            <div
              className="text-base font-medium"
              data-testid="stat-history-last-success-age"
            >
              {formatAge(stats.lastSuccessfulRunAgeMs)}
            </div>
            {stats.lastSuccessfulRunAt && (
              <div
                className="text-[10px] text-muted-foreground font-mono"
                data-testid="stat-history-last-success-at"
              >
                {new Date(stats.lastSuccessfulRunAt).toLocaleString()}
              </div>
            )}
          </div>
          <div className="rounded border bg-background p-2">
            <div className="text-muted-foreground">History rows last shipped</div>
            <div
              className="text-base font-medium tabular-nums"
              data-testid="stat-history-last-rows"
            >
              {stats.lastSuccessfulHistoryRows ?? "—"}
            </div>
          </div>
        </div>
      )}
      <div className="space-y-1" data-testid="panel-history-recipient-breakdown">
        <div className="text-xs uppercase text-muted-foreground">
          Per-recipient breakdown
        </div>
        {byRecipient.length === 0 ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="text-history-recipient-breakdown-empty"
          >
            No per-recipient sends in this window.
          </p>
        ) : (
          <div className="rounded border bg-background overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-2 py-1 font-medium">Inbox</th>
                  <th className="px-2 py-1 font-medium text-right">Sends</th>
                  <th className="px-2 py-1 font-medium text-right">Success %</th>
                  <th className="px-2 py-1 font-medium text-right">Failed</th>
                  <th className="px-2 py-1 font-medium">Last success</th>
                </tr>
              </thead>
              <tbody>
                {byRecipient.map((r) => {
                  const pct = Math.round(r.successRate * 100);
                  const failing = r.failureCount > 0;
                  return (
                    <tr
                      key={r.recipient}
                      onClick={() => onRecipientChange(r.recipient)}
                      className={
                        "cursor-pointer border-t hover:bg-muted/40 " +
                        (recipient === r.recipient ? "bg-muted/60" : "")
                      }
                      data-testid={`row-history-recipient-${r.recipient}`}
                    >
                      <td
                        className="px-2 py-1 font-mono truncate max-w-[14rem]"
                        data-testid={`cell-history-recipient-inbox-${r.recipient}`}
                      >
                        {r.recipient}
                      </td>
                      <td
                        className="px-2 py-1 text-right tabular-nums"
                        data-testid={`cell-history-recipient-sends-${r.recipient}`}
                      >
                        {r.totalSends}
                      </td>
                      <td
                        className={
                          "px-2 py-1 text-right tabular-nums " +
                          (pct === 100
                            ? "text-green-600"
                            : pct >= 80
                              ? ""
                              : "text-destructive")
                        }
                        data-testid={`cell-history-recipient-success-rate-${r.recipient}`}
                      >
                        {pct}%
                      </td>
                      <td
                        className={
                          "px-2 py-1 text-right tabular-nums " +
                          (failing ? "text-destructive font-medium" : "text-muted-foreground")
                        }
                        data-testid={`cell-history-recipient-failed-${r.recipient}`}
                      >
                        {r.failureCount}
                      </td>
                      <td
                        className="px-2 py-1 text-muted-foreground"
                        data-testid={`cell-history-recipient-last-success-${r.recipient}`}
                      >
                        {r.lastSuccessfulRunAt
                          ? new Date(r.lastSuccessfulRunAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Click a row to filter the panel to that inbox. Sorted by failure
          count desc.
        </p>
      </div>
    </div>
  );
}

export function ScheduledHistoryEmailCard() {
  const qc = useQueryClient();
  const scheduleQuery = useQuery<{ schedule: EmailSchedule; runs: EmailRun[] }>({
    queryKey: ["/api/admin/newsroom/audience/email-schedule-history"],
  });
  // Task #525 — compliance can scope stats + CSV to a date range and recipient.
  const [statsFrom, setStatsFrom] = useState("");
  const [statsTo, setStatsTo] = useState("");
  const [statsRecipient, setStatsRecipient] = useState("");
  const statsQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (statsFrom) params.set("from", new Date(statsFrom).toISOString());
    if (statsTo) params.set("to", new Date(statsTo).toISOString());
    if (statsRecipient) params.set("recipient", statsRecipient);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [statsFrom, statsTo, statsRecipient]);
  const statsQuery = useQuery<{
    stats: HistoryEmailStats;
    byRecipient: HistoryEmailRecipientStat[];
    knownRecipients: string[];
  }>({
    queryKey: [
      `/api/admin/newsroom/audience/email-schedule-history/stats${statsQueryString}`,
    ],
  });

  // Task #574 — saved filter presets for one-click reuse.
  const presetsQuery = useQuery<{ presets: FilterPreset[] }>({
    queryKey: [
      "/api/admin/newsroom/audience/email-schedule-history/filter-presets",
    ],
  });
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetDeletingId, setPresetDeletingId] = useState<string | null>(null);
  const [presetUpdatingId, setPresetUpdatingId] = useState<string | null>(null);
  const [pendingCloseEditId, setPendingCloseEditId] = useState<string | null>(null);
  const savePresetMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/email-schedule-history/filter-presets",
        {
          name,
          from: statsFrom || null,
          to: statsTo || null,
          recipient: statsRecipient || null,
        },
      );
      return (await res.json()) as { preset: FilterPreset; presets: FilterPreset[] };
    },
    onSuccess: () => {
      setPresetError(null);
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/email-schedule-history/filter-presets",
        ],
      });
    },
    onError: (e: any) => setPresetError(e?.message ?? "save_failed"),
  });
  const deletePresetMutation = useMutation({
    mutationFn: async (id: string) => {
      setPresetDeletingId(id);
      const res = await apiRequest(
        "DELETE",
        `/api/admin/newsroom/audience/email-schedule-history/filter-presets/${encodeURIComponent(id)}`,
      );
      return (await res.json()) as { deleted: boolean; presets: FilterPreset[] };
    },
    onSuccess: () => {
      setPresetError(null);
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/email-schedule-history/filter-presets",
        ],
      });
    },
    onError: (e: any) => setPresetError(e?.message ?? "delete_failed"),
    onSettled: () => setPresetDeletingId(null),
  });
  // Task #624 — edit/rename an existing preset in place.
  const updatePresetMutation = useMutation({
    mutationFn: async (args: {
      id: string;
      name: string;
      from: string | null;
      to: string | null;
      recipient: string | null;
    }) => {
      setPresetUpdatingId(args.id);
      const res = await apiRequest(
        "PUT",
        `/api/admin/newsroom/audience/email-schedule-history/filter-presets/${encodeURIComponent(args.id)}`,
        {
          name: args.name,
          from: args.from,
          to: args.to,
          recipient: args.recipient,
        },
      );
      return (await res.json()) as {
        preset: FilterPreset;
        presets: FilterPreset[];
      };
    },
    onSuccess: (_data, vars) => {
      setPresetError(null);
      setPendingCloseEditId(vars.id);
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/email-schedule-history/filter-presets",
        ],
      });
    },
    onError: (e: any) => setPresetError(e?.message ?? "update_failed"),
    onSettled: () => setPresetUpdatingId(null),
  });
  const applyPreset = (p: FilterPreset) => {
    setStatsFrom(p.from ?? "");
    setStatsTo(p.to ?? "");
    setStatsRecipient(p.recipient ?? "");
  };

  const [runsCsvExporting, setRunsCsvExporting] = useState(false);
  const [runsCsvError, setRunsCsvError] = useState<string | null>(null);
  const downloadRunsCsv = async () => {
    setRunsCsvExporting(true);
    setRunsCsvError(null);
    try {
      const params = new URLSearchParams();
      if (statsFrom) params.set("from", new Date(statsFrom).toISOString());
      if (statsTo) params.set("to", new Date(statsTo).toISOString());
      if (statsRecipient) params.set("recipient", statsRecipient);
      if (!statsFrom && !statsTo) params.set("windowDays", "90");
      const res = await fetch(
        `/api/admin/newsroom/audience/email-schedule-history/runs/export.csv?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `runs export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `audience-audit-history-email-runs-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setRunsCsvError(e?.message ?? "runs export failed");
    } finally {
      setRunsCsvExporting(false);
    }
  };

  // Task #636 — per-recipient breakdown CSV download.
  const [breakdownCsvExporting, setBreakdownCsvExporting] = useState(false);
  const [breakdownCsvError, setBreakdownCsvError] = useState<string | null>(null);
  const downloadBreakdownCsv = async () => {
    setBreakdownCsvExporting(true);
    setBreakdownCsvError(null);
    try {
      const params = new URLSearchParams();
      if (statsFrom) params.set("from", new Date(statsFrom).toISOString());
      if (statsTo) params.set("to", new Date(statsTo).toISOString());
      if (statsRecipient) params.set("recipient", statsRecipient);
      const res = await fetch(
        `/api/admin/newsroom/audience/email-schedule-history/recipient-breakdown/export.csv?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `breakdown export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `audience-audit-history-email-recipient-breakdown-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setBreakdownCsvError(e?.message ?? "breakdown export failed");
    } finally {
      setBreakdownCsvExporting(false);
    }
  };

  const [enabled, setEnabled] = useState(false);
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [recipientsText, setRecipientsText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const s = scheduleQuery.data?.schedule;
    if (s && !hydrated) {
      setEnabled(s.enabled);
      setCadence(s.cadence);
      setRecipientsText(s.recipients.join(", "));
      setHydrated(true);
    }
  }, [scheduleQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildHistoryEmailSchedulePayload({
        enabled,
        cadence,
        recipientsText,
      });
      return await apiRequest("PUT", HISTORY_EMAIL_SCHEDULE_URL, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return (
            typeof k === "string" &&
            k.startsWith(HISTORY_EMAIL_SCHEDULE_URL)
          );
        },
      });
    },
    onError: (e: any) => setSaveError(e?.message ?? "save failed"),
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/email-schedule-history/preview",
      );
      return (await res.json()) as {
        preview: {
          exportedAt: string;
          subject: string;
          html: string;
          recipients: string[];
          attachments: Array<{ filename: string; sizeBytes: number }>;
          totalExports: number;
        };
      };
    },
    onSuccess: () => {
      setSaveError(null);
      setPreviewOpen(true);
    },
    onError: (e: any) => setSaveError(e?.message ?? "preview failed"),
  });
  const preview = previewMutation.data?.preview;

  const [sendTestResult, setSendTestResult] = useState<string | null>(null);
  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/email-schedule-history/preview/send-test",
      );
      return (await res.json()) as { recipient: string; run: { runId: string; status: string } };
    },
    onSuccess: (data) => {
      setSaveError(null);
      setSendTestResult(
        data.run.status === "success"
          ? `Test sent to ${data.recipient}`
          : `Send failed for ${data.recipient}`,
      );
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return (
            typeof k === "string" &&
            k.startsWith("/api/admin/newsroom/audience/email-schedule-history")
          );
        },
      });
    },
    onError: (e: any) => {
      setSendTestResult(null);
      setSaveError(e?.message ?? "send test failed");
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/email-schedule-history/run-now",
      );
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return (
            typeof k === "string" &&
            (k.startsWith("/api/admin/newsroom/audience/email-schedule-history") ||
              k.startsWith("/api/admin/newsroom/audience/export-log"))
          );
        },
      });
    },
    onError: (e: any) => setSaveError(e?.message ?? "run failed"),
  });

  const schedule = scheduleQuery.data?.schedule;
  const runs = scheduleQuery.data?.runs ?? [];

  const failureAlertQuery = useQuery<{
    alert: {
      id: number | string;
      message: string;
      createdAt: string;
      details: Record<string, any>;
    } | null;
    snooze: {
      snoozeUntil: string | null;
      updatedAt: string | null;
      updatedBy: string | null;
    };
  }>({
    queryKey: [
      "/api/admin/newsroom/audience/email-schedule-history/failure-alert",
    ],
    refetchInterval: 60_000,
  });
  const failureAlert = failureAlertQuery.data?.alert ?? null;
  const failureSnooze = failureAlertQuery.data?.snooze ?? null;

  // Task #521 — admin-tunable failure-alert threshold.
  const failureThresholdQuery = useQuery<{
    config: {
      threshold: number;
      override: number | null;
      envFallback: number | null;
      defaultThreshold: number;
      min: number;
      max: number;
    };
  }>({
    queryKey: [
      "/api/admin/newsroom/audience/email-schedule-history/failure-threshold",
    ],
  });
  const thresholdConfig = failureThresholdQuery.data?.config;
  const [thresholdDraft, setThresholdDraft] = useState<string>("");
  const [thresholdSaveError, setThresholdSaveError] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (thresholdConfig) {
      setThresholdDraft(
        thresholdConfig.override !== null ? String(thresholdConfig.override) : "",
      );
    }
  }, [thresholdConfig?.override]);
  const saveThresholdMutation = useMutation({
    mutationFn: async (value: number | null) => {
      const res = await apiRequest(
        "PUT",
        "/api/admin/newsroom/audience/email-schedule-history/failure-threshold",
        { value },
      );
      return (await res.json()) as { config: typeof thresholdConfig };
    },
    onSuccess: () => {
      setThresholdSaveError(null);
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/email-schedule-history/failure-threshold",
        ],
      });
    },
    onError: (e: any) =>
      setThresholdSaveError(e?.message ?? "save_failed"),
  });

  type StaleSnoozePolicy =
    | { kind: "fixed" }
    | { kind: "auto_extend"; extendDays: number }
    | {
        kind: "weekday_mute";
        days: number[];
        startHour: number;
        endHour: number;
      };
  const staleAlertQuery = useQuery<{
    alert: {
      id: number | string;
      message: string;
      createdAt: string;
      details: Record<string, any>;
    } | null;
    evaluation: {
      stale: boolean;
      cadence: "weekly" | "monthly";
      allowedAgeMs: number;
      ageMs: number | null;
      reason: string;
      lastSuccessfulRunAt: string | null;
      snoozeUntil: string | null;
      snoozePolicy: StaleSnoozePolicy;
    };
    snooze: {
      snoozeUntil: string | null;
      snoozePolicy: StaleSnoozePolicy;
      updatedAt: string | null;
      updatedBy: string | null;
    };
    // Task #637 — per-recipient inbox silence.
    recipientAlerts?: Array<{
      id: number | string;
      recipient: string;
      message: string;
      createdAt: string;
      details: Record<string, any>;
    }>;
    recipientEvaluation?: {
      enabled: boolean;
      cadence: "weekly" | "monthly";
      allowedAgeMs: number;
      snoozeUntil: string | null;
      recipients: Array<{
        recipient: string;
        silent: boolean;
        hasEverSucceeded: boolean;
        lastSuccessfulRunAt: string | null;
        ageMs: number | null;
        reason: string;
      }>;
    };
    // Task #713 — server-driven snooze cap. Single source of truth so
    // changing `MAX_SNOOZE_MS` on the backend updates this UI hint
    // automatically.
    snoozeCap?: { maxMs: number; maxDays: number };
  }>({
    queryKey: [
      "/api/admin/newsroom/audience/email-schedule-history/stale-alert",
    ],
    refetchInterval: 60_000,
  });
  const staleAlert = staleAlertQuery.data?.alert ?? null;
  const recipientAlerts = staleAlertQuery.data?.recipientAlerts ?? [];
  const staleSnoozeUntil = staleAlertQuery.data?.snooze?.snoozeUntil ?? null;
  // Task #713 — fall back to 90d if the server hasn't reported a cap
  // yet (older deploys, or while the query is loading).
  const staleSnoozeMaxDays = staleAlertQuery.data?.snoozeCap?.maxDays ?? 90;
  const staleSnoozeMaxMs =
    staleAlertQuery.data?.snoozeCap?.maxMs ??
    staleSnoozeMaxDays * 24 * 60 * 60 * 1000;
  const staleSnoozeMaxDateValue = (() => {
    const d = new Date(Date.now() + staleSnoozeMaxMs);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();
  const [staleSnoozeCapNotice, setStaleSnoozeCapNotice] = useState<
    string | null
  >(null);
  const staleSnoozePolicy: StaleSnoozePolicy =
    staleAlertQuery.data?.snooze?.snoozePolicy ?? { kind: "fixed" };
  const staleEvalReason = staleAlertQuery.data?.evaluation?.reason ?? "";
  const staleFixedSnoozed = Boolean(
    staleSnoozeUntil &&
      !Number.isNaN(Date.parse(staleSnoozeUntil)) &&
      Date.parse(staleSnoozeUntil) > Date.now(),
  );
  // Task #627 — recurring `weekday_mute` policies are "snoozed" when
  // the server says so via the evaluation, even with no `snoozeUntil`.
  const staleSnoozed = staleFixedSnoozed || staleEvalReason === "snoozed";
  const [staleSnoozeError, setStaleSnoozeError] = useState<string | null>(null);
  const staleSnoozeMutation = useMutation({
    mutationFn: async (input: {
      snoozeUntil: string | null;
      snoozePolicy?: StaleSnoozePolicy | null;
    }) => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/email-schedule-history/stale-alert/snooze",
        input,
      );
      const body = await res.json();
      return { body, requestedSnoozeUntil: input.snoozeUntil };
    },
    onSuccess: (result: any) => {
      setStaleSnoozeError(null);
      // Task #713 — detect server-side snooze cap. If the founder
      // requested a date past the cap, the server clamps it; surface
      // the effective end date so they don't think their request was
      // applied verbatim.
      const requested: string | null = result?.requestedSnoozeUntil ?? null;
      const actual: string | null =
        result?.body?.snooze?.snoozeUntil ?? null;
      if (requested && actual) {
        const reqMs = Date.parse(requested);
        const actMs = Date.parse(actual);
        // Tolerate small clock-skew (1 min) between client and server.
        if (
          Number.isFinite(reqMs) &&
          Number.isFinite(actMs) &&
          reqMs - actMs > 60_000
        ) {
          setStaleSnoozeCapNotice(
            `Snooze is capped at ${staleSnoozeMaxDays} days — effective end ${new Date(
              actMs,
            ).toLocaleString()}.`,
          );
        } else {
          setStaleSnoozeCapNotice(null);
        }
      } else {
        setStaleSnoozeCapNotice(null);
      }
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/email-schedule-history/stale-alert",
        ],
      });
    },
    onError: (e: any) => {
      setStaleSnoozeCapNotice(null);
      setStaleSnoozeError(e?.message ?? "snooze_failed");
    },
  });

  const snoozeForDays = (days: number) => {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    staleSnoozeMutation.mutate({ snoozeUntil: until });
  };
  const snoozeUntilDate = (value: string) => {
    if (!value) return;
    // Treat as end-of-day in the user's local zone.
    const until = new Date(`${value}T23:59:59`).toISOString();
    staleSnoozeMutation.mutate({ snoozeUntil: until });
  };
  const [staleSnoozeDateDraft, setStaleSnoozeDateDraft] = useState<string>("");

  // Task #627 — recurring weekly mute picker state. Hydrated from the
  // currently-active policy so the picker reflects what's saved.
  const initialWeekdayDays =
    staleSnoozePolicy.kind === "weekday_mute" ? staleSnoozePolicy.days : [];
  const initialWeekdayStart =
    staleSnoozePolicy.kind === "weekday_mute" ? staleSnoozePolicy.startHour : 0;
  const initialWeekdayEnd =
    staleSnoozePolicy.kind === "weekday_mute" ? staleSnoozePolicy.endHour : 0;
  const [weekdayDays, setWeekdayDays] = useState<number[]>(initialWeekdayDays);
  const [weekdayStart, setWeekdayStart] = useState<number>(initialWeekdayStart);
  const [weekdayEnd, setWeekdayEnd] = useState<number>(initialWeekdayEnd);
  const [weekdayHydrated, setWeekdayHydrated] = useState(false);
  useEffect(() => {
    if (!weekdayHydrated && staleAlertQuery.data) {
      if (staleSnoozePolicy.kind === "weekday_mute") {
        setWeekdayDays(staleSnoozePolicy.days);
        setWeekdayStart(staleSnoozePolicy.startHour);
        setWeekdayEnd(staleSnoozePolicy.endHour);
      }
      setWeekdayHydrated(true);
    }
  }, [staleAlertQuery.data, weekdayHydrated, staleSnoozePolicy]);
  const toggleWeekdayDay = (d: number) =>
    setWeekdayDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  const saveWeekdayMute = () => {
    if (weekdayDays.length === 0) {
      setStaleSnoozeError("Pick at least one day.");
      return;
    }
    staleSnoozeMutation.mutate({
      snoozeUntil: null,
      snoozePolicy: {
        kind: "weekday_mute",
        days: weekdayDays,
        startHour: weekdayStart,
        endHour: weekdayEnd,
      },
    });
  };
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <Card data-testid="card-history-email-schedule" id="audit-history">
      <CardHeader>
        <CardTitle>Scheduled Audit-Export History Email</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(staleAlert || staleSnoozed) && (
          <div
            className="rounded border border-destructive/60 bg-destructive/10 p-3 space-y-2 text-sm"
            data-testid="banner-history-email-stale-alert"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="destructive">scheduler silent</Badge>
              <span className="font-medium">
                Scheduled history email has gone silent
              </span>
              {staleAlert && (
                <span className="text-xs text-muted-foreground">
                  opened {new Date(staleAlert.createdAt).toLocaleString()}
                </span>
              )}
              {staleSnoozed && (
                <Badge
                  variant="destructive"
                  data-testid="badge-history-email-stale-snoozed"
                >
                  Snoozed until {new Date(staleSnoozeUntil!).toLocaleString()}
                </Badge>
              )}
            </div>
            {staleAlert && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="text-history-email-stale-alert-message"
              >
                {staleAlert.message}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              {staleSnoozed
                ? "Snoozed during planned downtime — no new pages will fire until the snooze expires. The schedule itself is unchanged."
                : "No successful delivery within the cadence + grace window (weekly > 8d, monthly > 32d). Auto-clears as soon as a fresh successful run lands. Root admins were also emailed."}
            </p>
            <div
              className="flex items-center gap-2 flex-wrap"
              data-testid="row-history-email-stale-snooze-controls"
            >
              {!staleSnoozed && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={staleSnoozeMutation.isPending}
                    onClick={() => snoozeForDays(1)}
                    data-testid="button-history-email-stale-snooze-1d"
                  >
                    Snooze 1 day
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={staleSnoozeMutation.isPending}
                    onClick={() => snoozeForDays(7)}
                    data-testid="button-history-email-stale-snooze-1w"
                  >
                    Snooze 1 week
                  </Button>
                  <Input
                    type="date"
                    value={staleSnoozeDateDraft}
                    onChange={(e) => setStaleSnoozeDateDraft(e.target.value)}
                    max={staleSnoozeMaxDateValue}
                    className="h-8 w-40"
                    data-testid="input-history-email-stale-snooze-until"
                  />
                  <span
                    className="text-[10px] text-muted-foreground"
                    data-testid="text-history-email-stale-snooze-cap"
                  >
                    Max {staleSnoozeMaxDays}d (
                    {new Date(
                      Date.now() + staleSnoozeMaxMs,
                    ).toLocaleDateString()}
                    )
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      staleSnoozeMutation.isPending || !staleSnoozeDateDraft
                    }
                    onClick={() => snoozeUntilDate(staleSnoozeDateDraft)}
                    data-testid="button-history-email-stale-snooze-until"
                  >
                    Snooze until date
                  </Button>
                </>
              )}
              {staleSnoozed && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={staleSnoozeMutation.isPending}
                  onClick={() =>
                    staleSnoozeMutation.mutate({
                      snoozeUntil: null,
                      snoozePolicy: { kind: "fixed" },
                    })
                  }
                  data-testid="button-history-email-stale-unsnooze"
                >
                  {staleSnoozeMutation.isPending ? "Unsnoozing…" : "Unsnooze"}
                </Button>
              )}
              {staleSnoozeError && (
                <span
                  className="text-xs text-destructive"
                  data-testid="text-history-email-stale-snooze-error"
                >
                  {staleSnoozeError}
                </span>
              )}
            </div>
            {staleSnoozeCapNotice && (
              <p
                className="text-xs text-amber-600 dark:text-amber-400"
                data-testid="text-history-email-stale-snooze-capped"
              >
                {staleSnoozeCapNotice}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Snooze is capped at {staleSnoozeMaxDays} days to avoid silent
              forever-mute.
            </p>
          </div>
        )}
        {/* Task #627 — always-visible recurring weekly mute picker so
         founders on a regular maintenance schedule can configure it
         proactively, not only when the alert is already firing. */}
        {staleAlertQuery.data && (
          <div
            className="rounded border bg-muted/30 p-3 space-y-2 text-xs"
            data-testid="panel-history-email-stale-weekday-mute"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">
                Recurring weekly mute (scheduler-silent alert)
              </span>
              {staleSnoozePolicy.kind === "weekday_mute" && (
                <Badge
                  variant="secondary"
                  data-testid="badge-history-email-stale-weekday-mute-active"
                >
                  Active{" "}
                  {staleSnoozePolicy.days
                    .map((d) => DAY_LABELS[d])
                    .join(", ")}{" "}
                  {String(staleSnoozePolicy.startHour).padStart(2, "0")}:00–
                  {String(staleSnoozePolicy.endHour).padStart(2, "0")}:00 UTC
                </Badge>
              )}
              {staleSnoozePolicy.kind === "weekday_mute" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={staleSnoozeMutation.isPending}
                  onClick={() =>
                    staleSnoozeMutation.mutate({
                      snoozeUntil: null,
                      snoozePolicy: { kind: "fixed" },
                    })
                  }
                  data-testid="button-history-email-stale-weekday-clear"
                >
                  Clear recurring mute
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Mutes the "scheduler has gone silent" alert on the selected
              weekdays each week. No expiry — clear with the button above.
              Hours in UTC. Set start ≥ end to cross midnight (e.g. 18 → 8
              mutes 18:00 through next-day 08:00).
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              {DAY_LABELS.map((label, idx) => {
                const active = weekdayDays.includes(idx);
                return (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => toggleWeekdayDay(idx)}
                    className={
                      "h-7 px-2 rounded border text-xs " +
                      (active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted")
                    }
                    data-testid={`button-history-email-stale-weekday-day-${idx}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Start hour</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  step={1}
                  value={weekdayStart}
                  onChange={(e) =>
                    setWeekdayStart(
                      Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                    )
                  }
                  className="h-8 w-20"
                  data-testid="input-history-email-stale-weekday-start"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">End hour</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  step={1}
                  value={weekdayEnd}
                  onChange={(e) =>
                    setWeekdayEnd(
                      Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                    )
                  }
                  className="h-8 w-20"
                  data-testid="input-history-email-stale-weekday-end"
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  staleSnoozeMutation.isPending || weekdayDays.length === 0
                }
                onClick={saveWeekdayMute}
                data-testid="button-history-email-stale-weekday-save"
              >
                Save recurring mute
              </Button>
            </div>
          </div>
        )}
        {recipientAlerts.length > 0 && (
          <div
            className="rounded border border-destructive/60 bg-destructive/10 p-3 space-y-2 text-sm"
            data-testid="banner-history-email-recipient-stale-alert"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="destructive">inbox silent</Badge>
              <span className="font-medium">
                {recipientAlerts.length === 1
                  ? "1 recipient inbox has gone silent"
                  : `${recipientAlerts.length} recipient inboxes have gone silent`}
              </span>
            </div>
            <ul
              className="text-xs text-muted-foreground space-y-1 list-disc pl-5"
              data-testid="list-history-email-recipient-stale"
            >
              {recipientAlerts.map((a) => (
                <li
                  key={a.id}
                  data-testid={`row-history-email-recipient-stale-${a.recipient}`}
                >
                  <span className="font-mono">{a.recipient}</span> —{" "}
                  {a.message}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground">
              The aggregate scheduler may still look healthy because other
              recipients are receiving the email. Auto-clears once that inbox
              gets a fresh successful delivery.
            </p>
          </div>
        )}
        <StaleSnoozeLogSection refreshKey={staleAlertQuery.dataUpdatedAt} />
        {failureAlert && (
          <div
            className="rounded border border-destructive/60 bg-destructive/10 p-3 space-y-1 text-sm"
            data-testid="banner-history-email-failure-alert"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="destructive">delivery failing</Badge>
              <span className="font-medium">
                Audit-export history email is failing
              </span>
              <span className="text-xs text-muted-foreground">
                opened {new Date(failureAlert.createdAt).toLocaleString()}
              </span>
            </div>
            <p
              className="text-xs text-muted-foreground"
              data-testid="text-history-email-failure-alert-message"
            >
              {failureAlert.message}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Auto-clears as soon as the next scheduled run succeeds. The
              founder dashboard and root admins were also notified by email.
            </p>
          </div>
        )}
        <FailureAlertSnoozeControls
          testIdPrefix="history-email-failure-alert"
          snoozeUntil={failureSnooze?.snoozeUntil ?? null}
          endpoint="/api/admin/newsroom/audience/email-schedule-history/failure-alert/snooze"
          invalidateKey="/api/admin/newsroom/audience/email-schedule-history/failure-alert"
          historyEndpoint="/api/admin/newsroom/audience/email-schedule-history/failure-alert/snooze-history"
        />
        <p className="text-xs text-muted-foreground">
          Automatically email the audit-export <strong>history</strong> (the
          meta-audit "who exported what, when" log) to your compliance team on
          a fixed cadence. JSON + CSV attached. Each send is itself logged in
          the export history with formats <code>json-history</code> and{" "}
          <code>csv-history</code>. Configured separately from the audit-trail
          schedule above.
        </p>
        {thresholdConfig && (
          <div
            className="rounded border p-3 space-y-2 text-xs"
            data-testid="card-history-email-failure-threshold"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">Failure alert threshold</span>
              <Badge
                variant="outline"
                data-testid="badge-failure-threshold-effective"
              >
                fires after {thresholdConfig.threshold} consecutive failure
                {thresholdConfig.threshold === 1 ? "" : "s"}
              </Badge>
              {thresholdConfig.override !== null && (
                <Badge variant="secondary">admin override</Badge>
              )}
              {thresholdConfig.override === null &&
                thresholdConfig.envFallback !== null && (
                  <Badge variant="secondary">from env</Badge>
                )}
              {thresholdConfig.override === null &&
                thresholdConfig.envFallback === null && (
                  <Badge variant="outline">default</Badge>
                )}
            </div>
            <p className="text-muted-foreground">
              How many scheduler runs must fail in a row before the founder is
              paged. Range {thresholdConfig.min}–{thresholdConfig.max}.
              Precedence: admin override beats the{" "}
              <code>AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD</code> env
              var, which beats the default of {thresholdConfig.defaultThreshold}.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="number"
                min={thresholdConfig.min}
                max={thresholdConfig.max}
                step={1}
                value={thresholdDraft}
                onChange={(e) => setThresholdDraft(e.target.value)}
                placeholder={`use default (${thresholdConfig.envFallback ?? thresholdConfig.defaultThreshold})`}
                className="h-8 w-40"
                data-testid="input-failure-threshold-override"
              />
              <Button
                size="sm"
                disabled={saveThresholdMutation.isPending}
                onClick={() => {
                  try {
                    const { value } = buildHistoryEmailFailureThresholdPayload({
                      draft: thresholdDraft,
                      bounds: {
                        min: thresholdConfig.min,
                        max: thresholdConfig.max,
                      },
                    });
                    saveThresholdMutation.mutate(value);
                  } catch (err: any) {
                    setThresholdSaveError(
                      err?.message ??
                        HISTORY_EMAIL_FAILURE_THRESHOLD_ERRORS.outOfRange(
                          thresholdConfig.min,
                          thresholdConfig.max,
                        ),
                    );
                  }
                }}
                data-testid="button-failure-threshold-save"
              >
                {saveThresholdMutation.isPending ? "Saving…" : "Save override"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  saveThresholdMutation.isPending ||
                  thresholdConfig.override === null
                }
                onClick={() => saveThresholdMutation.mutate(null)}
                data-testid="button-failure-threshold-clear"
              >
                Use env / default
              </Button>
              {thresholdSaveError && (
                <span
                  className="text-destructive"
                  data-testid="text-failure-threshold-error"
                >
                  {thresholdSaveError}
                </span>
              )}
            </div>
          </div>
        )}
        <HistoryEmailStatsPanel
          stats={statsQuery.data?.stats}
          byRecipient={statsQuery.data?.byRecipient ?? []}
          loading={statsQuery.isLoading}
          onDownloadCsv={downloadRunsCsv}
          csvExporting={runsCsvExporting}
          csvError={runsCsvError}
          onDownloadBreakdownCsv={downloadBreakdownCsv}
          breakdownCsvExporting={breakdownCsvExporting}
          breakdownCsvError={breakdownCsvError}
          from={statsFrom}
          to={statsTo}
          recipient={statsRecipient}
          knownRecipients={statsQuery.data?.knownRecipients ?? []}
          onFromChange={setStatsFrom}
          onToChange={setStatsTo}
          onRecipientChange={setStatsRecipient}
          onClearFilters={() => {
            setStatsFrom("");
            setStatsTo("");
            setStatsRecipient("");
          }}
          presets={presetsQuery.data?.presets ?? []}
          presetsLoading={presetsQuery.isLoading}
          onApplyPreset={applyPreset}
          onSavePreset={(name) => savePresetMutation.mutate(name)}
          onDeletePreset={(id) => deletePresetMutation.mutate(id)}
          onUpdatePreset={(id, patch) =>
            updatePresetMutation.mutate({ id, ...patch })
          }
          presetSaving={savePresetMutation.isPending}
          presetDeletingId={presetDeletingId}
          presetUpdatingId={presetUpdatingId}
          pendingCloseEditId={pendingCloseEditId}
          onAcknowledgeCloseEdit={() => setPendingCloseEditId(null)}
          presetError={presetError}
        />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Enabled</span>
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-history-schedule-enabled"
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Cadence</span>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as "weekly" | "monthly")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-history-schedule-cadence"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">Recipients (comma or space separated)</span>
          <Input
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            data-testid="input-history-schedule-recipients"
            placeholder="compliance@example.com, legal@example.com"
          />
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-history-schedule-save"
          >
            {saveMutation.isPending ? "Saving…" : "Save schedule"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
            data-testid="button-history-schedule-preview"
          >
            {previewMutation.isPending ? "Loading…" : "Preview"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runNowMutation.mutate()}
            disabled={runNowMutation.isPending || !schedule || schedule.recipients.length === 0}
            data-testid="button-history-schedule-run-now"
          >
            {runNowMutation.isPending ? "Sending…" : "Send now"}
          </Button>
          {schedule?.nextRunAt && (
            <Badge variant="outline" data-testid="badge-history-schedule-next-run">
              Next: {new Date(schedule.nextRunAt).toLocaleString()}
            </Badge>
          )}
          {schedule?.lastRunStatus && (
            <Badge
              variant={schedule.lastRunStatus === "success" ? "default" : "destructive"}
              data-testid="badge-history-schedule-last-status"
            >
              Last: {schedule.lastRunStatus}
            </Badge>
          )}
          {saveError && (
            <span className="text-xs text-destructive" data-testid="text-history-schedule-error">
              {saveError}
            </span>
          )}
        </div>
        {schedule?.lastRunError && (
          <div
            className="text-xs text-destructive rounded border border-destructive/40 bg-destructive/5 p-2"
            data-testid="text-history-schedule-last-error"
          >
            Last error: {schedule.lastRunError}
          </div>
        )}
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-2">Recent runs</div>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-history-runs">
              No runs yet.
            </p>
          ) : (
            <div className="space-y-1">
              {runs.map((r) => (
                <div
                  key={r.runId}
                  className="flex items-center justify-between text-xs rounded border p-2"
                  data-testid={`row-history-run-${r.runId}`}
                >
                  <div className="flex gap-2 items-center flex-wrap">
                    <Badge
                      variant={
                        r.status === "success"
                          ? "default"
                          : r.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {r.status}
                    </Badge>
                    <Badge variant="outline">{r.cadence}</Badge>
                    <Badge variant="outline">{r.triggeredBy}</Badge>
                    {r.isTest && (
                      <Badge variant="secondary" data-testid={`badge-history-test-${r.runId}`}>
                        test
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {new Date(r.startedAt).toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">
                      history rows:{r.messageCount}
                    </span>
                  </div>
                  <div className="text-muted-foreground truncate max-w-[40%]">
                    {r.errorMessage ?? r.recipients.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
          data-testid="dialog-history-schedule-preview"
        >
          <DialogHeader>
            <DialogTitle>History email preview</DialogTitle>
            <DialogDescription>
              Rendered HTML body for the currently saved history schedule.
              Nothing was sent.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="flex-1 overflow-auto space-y-3">
              <div className="text-xs space-y-1" data-testid="text-history-preview-meta">
                <div>
                  <span className="text-muted-foreground">Subject:</span>{" "}
                  <span className="font-medium">{preview.subject}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Exported at:</span>{" "}
                  <span className="font-mono">
                    {new Date(preview.exportedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Recipients:</span>{" "}
                  {preview.recipients.length === 0 ? (
                    <span className="italic text-muted-foreground">none configured</span>
                  ) : (
                    preview.recipients.join(", ")
                  )}
                </div>
                <div className="flex gap-2 flex-wrap pt-1">
                  <Badge variant="outline">history rows: {preview.totalExports}</Badge>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">
                  Attachments ({preview.attachments.length})
                </div>
                <div className="space-y-1">
                  {preview.attachments.map((a) => (
                    <div
                      key={a.filename}
                      className="flex items-center justify-between text-xs rounded border p-2"
                      data-testid={`row-history-preview-attachment-${a.filename}`}
                    >
                      <span className="font-mono truncate">{a.filename}</span>
                      <span className="text-muted-foreground ml-2 shrink-0">
                        {(a.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Rendered HTML</div>
                <iframe
                  title="Audit history email preview"
                  data-testid="iframe-history-preview-html"
                  sandbox=""
                  srcDoc={preview.html}
                  className="w-full h-[420px] rounded border bg-white"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendTestMutation.mutate()}
                  disabled={sendTestMutation.isPending}
                  data-testid="button-history-send-test-to-me"
                >
                  {sendTestMutation.isPending ? "Sending…" : "Send test to me"}
                </Button>
                {sendTestResult && (
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid="text-history-send-test-result"
                  >
                    {sendTestResult}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Preview only · "Send test to me" emails this rendered payload
                to your admin address only (not the configured recipients) ·
                platformSendAllowed:false · realSendAllowed:false
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No preview loaded.</p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Task #692 — durable snooze-window history. Surfaces the last 10
// snooze windows on the stale-alert section so founders can audit who
// muted the scheduler-silent alert and how each window ended (replaced
// / unsnoozed / naturally expired). Mirrors the archive-deletion
// notifier snooze-log section (Task #562).
interface StaleSnoozeLogEntry {
  id: string;
  snoozeId: string;
  snoozeStartedAt: string;
  snoozeUntil: string | null;
  endedAt: string | null;
  endedReason: "expired" | "replaced" | "unsnoozed" | null;
  policyKind: "fixed" | "auto_extend" | "weekday_mute";
  policyExtendDays: number | null;
  policyDays: number[] | null;
  policyStartHour: number | null;
  policyEndHour: number | null;
  createdBy: string | null;
  suppressedTicks: number;
  maxAgeMsObserved: number | null;
  lastSuccessfulRunAtAtClose: string | null;
}

function StaleSnoozeLogSection({ refreshKey }: { refreshKey: number }) {
  const query = useQuery<{ entries: StaleSnoozeLogEntry[] }>({
    queryKey: [
      "/api/admin/newsroom/audience/email-schedule-history/stale-alert/snooze-log",
      refreshKey,
    ],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/admin/newsroom/audience/email-schedule-history/stale-alert/snooze-log?limit=10",
      );
      return await res.json();
    },
  });
  const entries = query.data?.entries ?? [];
  if (entries.length === 0) {
    return null;
  }
  return (
    <div
      className="rounded border p-3 space-y-2 text-xs"
      data-testid="card-history-email-stale-snooze-log"
    >
      <div className="font-medium">Past snooze windows (last 10)</div>
      <ul className="space-y-1">
        {entries.map((e) => {
          const started = new Date(e.snoozeStartedAt).toLocaleString();
          const ended = e.endedAt
            ? new Date(e.endedAt).toLocaleString()
            : "open";
          const reason = e.endedReason ?? "active";
          return (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-2"
              data-testid={`row-history-email-stale-snooze-log-${e.id}`}
            >
              <Badge variant="outline">{e.policyKind}</Badge>
              <Badge variant="secondary">{reason}</Badge>
              <span className="text-muted-foreground">{started}</span>
              <span className="text-muted-foreground">→ {ended}</span>
              {e.createdBy && (
                <span className="text-muted-foreground">
                  by {e.createdBy}
                </span>
              )}
              {e.suppressedTicks > 0 && (
                <span className="text-muted-foreground">
                  suppressed {e.suppressedTicks} tick
                  {e.suppressedTicks === 1 ? "" : "s"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
