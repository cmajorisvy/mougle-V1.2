import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RetentionStat, StalePendingHistoryEntry } from "./_shared";
import { useAdminTimeZonePreference } from "@/lib/admin-timezone";
import { StalePendingTrend } from "./StalePendingTrend";
import {
  RestoreLogDailyActivityChart,
  RestoreLogActivityTrendPill,
} from "./RestoreLogDailyActivityChart";
import {
  RESTORE_LOG_RATE_THRESHOLD_URL,
  RESTORE_LOG_RATE_THRESHOLD_ERRORS,
  buildRestoreLogRateThresholdPayload,
  buildStaleRowsThresholdsPayload,
} from "../omni-channel-audience-forms";

interface RetentionSweepResult {
  startedAt: string;
  finishedAt: string;
  retentionDays: number;
  cutoffIso: string;
  messagesPruned: number;
  decisionsPruned: number;
  commandsPruned: number;
  gatewayEventsPruned?: number;
  notificationHistoryPruned?: number;
  thresholdAuditRowsPruned?: number;
  totalPruned: number;
  restoreLogPruned?: number;
  restoreLogRetentionDays?: number;
  restoreLogCutoffIso?: string;
  trigger: "scheduled" | "manual" | "cli";
  error: string | null;
}

type RetentionMode = "delete" | "archive";

interface RetentionModeMap {
  messages: RetentionMode;
  decisions: RetentionMode;
  commands: RetentionMode;
}

interface RetentionArchiveFile {
  table: string;
  path: string;
  rowCount: number;
  bytes: number;
}

interface RestoreLogEntry {
  restoredAt: string;
  archivePath: string;
  table: string;
  restoredBy: string;
  rowsParsed: number;
  rowsInserted: number;
  rowsSkipped: number;
  error: string | null;
}

interface RetentionStats {
  retentionDays: number;
  defaultRetentionDays: number;
  override: number | null;
  envFallback: number | null;
  intervalHours: number;
  schedulerRunning: boolean;
  lastRun:
    | (RetentionSweepResult & {
        messagesArchived?: number;
        decisionsArchived?: number;
        commandsArchived?: number;
        archiveFiles?: RetentionArchiveFile[];
      })
    | null;
  totalRowsPruned: number;
  totalGatewayEventsPruned?: number;
  totalThresholdAuditPruned?: number;
  runCount: number;
  mode?: RetentionModeMap;
  modeOverride?: Partial<RetentionModeMap> | null;
  totalRowsArchived?: number;
  totalArchiveFiles?: number;
  archiveUploadRetryCount?: number;
  archiveUploadFinalFailureCount?: number;
  stalePendingArchive?: { messages: number; decisions: number; commands: number };
  alertActive?: boolean;
  staleRowsAlertActive?: boolean;
  staleRowsThresholds?: { messages: number; decisions: number; commands: number };
  restoreLogRetentionDays?: number;
  defaultRestoreLogRetentionDays?: number;
  restoreLogRetentionOverride?: number | null;
  restoreLogRetentionEnvFallback?: number | null;
  totalRestoreLogPruned?: number;
  restoreLogRowCount?: number;
  stalePendingHistory?: StalePendingHistoryEntry[];
  restoreLogRate?: {
    todayCount: number;
    threshold: number;
    override: number | null;
    envFallback: number | null;
    alertActive: boolean;
    windowStartIso: string;
    defaultThreshold: number;
    dailyActivity?: { dayStartIso: string; count: number }[];
  };
}

export function RetentionCard({ productionId }: { productionId: string }) {
  const qc = useQueryClient();
  // Task #882 — honor the founder-selected admin timezone (shared with
  // other admin surfaces like OrphanReconcilePanel) so the CSV's
  // changed_at_local column matches whatever zone the rest of the admin
  // UI is rendering.
  const { timeZone: adminTimeZone } = useAdminTimeZonePreference();

  const [retentionDaysInput, setRetentionDaysInput] = useState<string>("");
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [restoreLogRetentionInput, setRestoreLogRetentionInput] = useState<string>("");
  const [restoreLogRetentionError, setRestoreLogRetentionError] = useState<string | null>(null);
  const [restoreLogRateThresholdInput, setRestoreLogRateThresholdInput] = useState<string>("");
  const [restoreLogRateThresholdError, setRestoreLogRateThresholdError] = useState<string | null>(null);

  const RESTORE_LOG_ACTIVITY_WINDOW_KEY =
    "mougle.omniChannelAudience.restoreLogActivityWindow.v1";
  const RESTORE_LOG_ACTIVITY_WINDOW_OPTIONS = [7, 14, 30] as const;
  type RestoreLogActivityWindow =
    (typeof RESTORE_LOG_ACTIVITY_WINDOW_OPTIONS)[number];
  const [restoreLogActivityDays, setRestoreLogActivityDaysState] =
    useState<RestoreLogActivityWindow>(() => {
      if (typeof window === "undefined") return 7;
      try {
        const raw = window.localStorage.getItem(
          RESTORE_LOG_ACTIVITY_WINDOW_KEY,
        );
        const n = raw == null ? NaN : Number(raw);
        if (
          (RESTORE_LOG_ACTIVITY_WINDOW_OPTIONS as readonly number[]).includes(n)
        ) {
          return n as RestoreLogActivityWindow;
        }
      } catch {
        /* ignore */
      }
      return 7;
    });
  const setRestoreLogActivityDays = (d: RestoreLogActivityWindow) => {
    setRestoreLogActivityDaysState(d);
    try {
      window.localStorage.setItem(
        RESTORE_LOG_ACTIVITY_WINDOW_KEY,
        String(d),
      );
    } catch {
      /* ignore */
    }
  };
  const [staleRowsDefaultInput, setStaleRowsDefaultInput] = useState<string>("");
  const [staleRowsMessagesInput, setStaleRowsMessagesInput] = useState<string>("");
  const [staleRowsDecisionsInput, setStaleRowsDecisionsInput] = useState<string>("");
  const [staleRowsCommandsInput, setStaleRowsCommandsInput] = useState<string>("");
  const [staleRowsError, setStaleRowsError] = useState<string | null>(null);
  const [staleRowsAckError, setStaleRowsAckError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  const retentionQuery = useQuery<{ stats: RetentionStats }>({
    queryKey: ["/api/admin/newsroom/audience/retention/stats"],
  });

  const restoreLogActivityQuery = useQuery<{
    days: number;
    maxDays: number;
    defaultDays: number;
    dailyActivity: { dayStartIso: string; count: number }[];
  }>({
    queryKey: [
      "/api/admin/newsroom/audience/retention/restore-log/daily-activity",
      restoreLogActivityDays,
    ],
    queryFn: async () => {
      const r = await fetch(
        `/api/admin/newsroom/audience/retention/restore-log/daily-activity?days=${restoreLogActivityDays}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`activity_fetch_failed_${r.status}`);
      return r.json();
    },
  });

  const sweepMutation = useMutation({
    mutationFn: async (retentionDays?: number) => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/sweep",
        retentionDays != null ? { retentionDays } : {},
      );
    },
    onSuccess: () => {
      setRetentionError(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/stats"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/newsroom/audience/${productionId}/history`] });
    },
    onError: (e: any) => setRetentionError(e?.message ?? "sweep failed"),
  });

  const overrideMutation = useMutation({
    mutationFn: async (retentionDays: number | null) => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/override",
        { retentionDays },
      );
    },
    onSuccess: () => {
      setRetentionError(null);
      setRetentionDaysInput("");
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/stats"] });
    },
    onError: (e: any) => setRetentionError(e?.message ?? "override failed"),
  });

  const restoreLogRetentionMutation = useMutation({
    mutationFn: async (retentionDays: number | null) => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/restore-log/retention",
        { retentionDays },
      );
    },
    onSuccess: () => {
      setRestoreLogRetentionError(null);
      setRestoreLogRetentionInput("");
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/stats"] });
    },
    onError: (e: any) =>
      setRestoreLogRetentionError(e?.message ?? "restore-log retention update failed"),
  });

  const restoreLogRateThresholdMutation = useMutation({
    mutationFn: async (threshold: number | null) => {
      return await apiRequest(
        "POST",
        RESTORE_LOG_RATE_THRESHOLD_URL,
        { threshold },
      );
    },
    onSuccess: () => {
      setRestoreLogRateThresholdError(null);
      setRestoreLogRateThresholdInput("");
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/retention/stats"],
      });
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/retention/restore-log/rate-threshold/history",
        ],
      });
      // Task #677 — a save may have just fired a weakening email.
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/retention/restore-log/rate-threshold/weakening-history",
        ],
      });
    },
    onError: (e: any) =>
      setRestoreLogRateThresholdError(
        e?.message ?? "rate threshold update failed",
      ),
  });

  type RestoreLogRateThresholdHistoryEntry = {
    id: string;
    priorOverride: number | null;
    newOverride: number | null;
    updatedBy: string | null;
    // Task #619 — human-readable identity for `updatedBy`.
    updatedByDisplayName: string | null;
    updatedByEmail: string | null;
    occurredAt: string;
  };
  const restoreLogRateThresholdHistoryQuery = useQuery<{
    entries: RestoreLogRateThresholdHistoryEntry[];
  }>({
    queryKey: [
      "/api/admin/newsroom/audience/retention/restore-log/rate-threshold/history",
    ],
  });

  // Task #618: notify-on-weakening toggle for the restore-log rate
  // spike threshold. Default ON; founders can opt out.
  const RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_URL =
    "/api/admin/newsroom/audience/retention/restore-log/rate-threshold/notify-on-weakening";
  const restoreLogRateNotifyOnWeakeningQuery = useQuery<{ enabled: boolean }>({
    queryKey: [RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_URL],
  });
  const restoreLogRateNotifyOnWeakeningMutation = useMutation({
    mutationFn: async (enabled: boolean) =>
      apiRequest("POST", RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_URL, {
        enabled,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_URL],
      });
    },
  });

  // Task #677: persistent history of every weakening-email send attempt.
  type RestoreLogRateWeakeningNotificationEntry = {
    id: string;
    actor: string;
    reason: "disabled" | "loosened_2x";
    priorEffective: number;
    newEffective: number;
    priorOverride: number | null;
    newOverride: number | null;
    recipients: string[];
    sent: boolean;
    errorMessage: string | null;
    occurredAt: string;
  };
  const RESTORE_LOG_RATE_WEAKENING_HISTORY_URL =
    "/api/admin/newsroom/audience/retention/restore-log/rate-threshold/weakening-history";
  const restoreLogRateWeakeningHistoryQuery = useQuery<{
    entries: RestoreLogRateWeakeningNotificationEntry[];
  }>({
    queryKey: [RESTORE_LOG_RATE_WEAKENING_HISTORY_URL],
  });

  // Task #676: notify-on-weakening toggle for the stale-rows backlog
  // thresholds. Default ON; founders can opt out.
  const STALE_ROWS_NOTIFY_ON_WEAKENING_URL =
    "/api/admin/newsroom/audience/retention/stale-rows-threshold/notify-on-weakening";
  const staleRowsNotifyOnWeakeningQuery = useQuery<{ enabled: boolean }>({
    queryKey: [STALE_ROWS_NOTIFY_ON_WEAKENING_URL],
  });
  const staleRowsNotifyOnWeakeningMutation = useMutation({
    mutationFn: async (enabled: boolean) =>
      apiRequest("POST", STALE_ROWS_NOTIFY_ON_WEAKENING_URL, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [STALE_ROWS_NOTIFY_ON_WEAKENING_URL],
      });
    },
  });

  type StaleRowsThresholdResponse = {
    thresholds: { messages: number; decisions: number; commands: number };
    override: Partial<{
      messages: number;
      decisions: number;
      commands: number;
      default: number;
    }> | null;
    envFallback: number | null;
    updatedBy: string | null;
    updatedByDisplayName: string | null;
    updatedByEmail: string | null;
    updatedAt: string | null;
  };
  const staleRowsThresholdQuery = useQuery<StaleRowsThresholdResponse>({
    queryKey: ["/api/admin/newsroom/audience/retention/stale-rows-thresholds"],
  });
  const staleRowsThresholdMutation = useMutation({
    mutationFn: async (
      override:
        | Partial<{
            messages: number;
            decisions: number;
            commands: number;
            default: number;
          }>
        | null,
    ) => {
      return await apiRequest(
        "PUT",
        "/api/admin/newsroom/audience/retention/stale-rows-thresholds",
        { override },
      );
    },
    onSuccess: () => {
      setStaleRowsError(null);
      setStaleRowsDefaultInput("");
      setStaleRowsMessagesInput("");
      setStaleRowsDecisionsInput("");
      setStaleRowsCommandsInput("");
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/retention/stale-rows-thresholds",
        ],
      });
      qc.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith(
            "/api/admin/newsroom/audience/retention/stale-rows-thresholds/history",
          ),
      });
    },
    onError: (e: any) =>
      setStaleRowsError(e?.message ?? "stale-rows threshold save failed"),
  });

  type StaleRowsThresholdHistoryEntry = {
    id: string;
    priorOverride: Partial<{
      messages: number;
      decisions: number;
      commands: number;
      default: number;
    }> | null;
    newOverride: Partial<{
      messages: number;
      decisions: number;
      commands: number;
      default: number;
    }> | null;
    updatedBy: string | null;
    updatedByDisplayName: string | null;
    updatedByEmail: string | null;
    occurredAt: string;
  };
  // Task #605: filter the threshold history by actor or date range.
  const [staleRowsHistoryActor, setStaleRowsHistoryActor] = useState<string>("");
  const [staleRowsHistoryFrom, setStaleRowsHistoryFrom] = useState<string>("");
  const [staleRowsHistoryTo, setStaleRowsHistoryTo] = useState<string>("");
  const staleRowsHistoryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "10");
    if (staleRowsHistoryActor) params.set("updatedBy", staleRowsHistoryActor);
    if (staleRowsHistoryFrom) {
      const d = new Date(staleRowsHistoryFrom);
      if (!Number.isNaN(d.getTime())) params.set("from", d.toISOString());
    }
    if (staleRowsHistoryTo) {
      const d = new Date(staleRowsHistoryTo);
      if (!Number.isNaN(d.getTime())) params.set("to", d.toISOString());
    }
    return `/api/admin/newsroom/audience/retention/stale-rows-thresholds/history?${params.toString()}`;
  }, [staleRowsHistoryActor, staleRowsHistoryFrom, staleRowsHistoryTo]);
  const staleRowsHistoryCsvUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (staleRowsHistoryActor) params.set("updatedBy", staleRowsHistoryActor);
    if (staleRowsHistoryFrom) {
      const d = new Date(staleRowsHistoryFrom);
      if (!Number.isNaN(d.getTime())) params.set("from", d.toISOString());
    }
    if (staleRowsHistoryTo) {
      const d = new Date(staleRowsHistoryTo);
      if (!Number.isNaN(d.getTime())) params.set("to", d.toISOString());
    }
    // Task #882 — pass the founder-selected admin timezone (falls
    // back to the validated browser zone or UTC inside the hook) so
    // the CSV's `changed_at_local` column matches what the on-screen
    // history rows render.
    if (adminTimeZone) params.set("timeZone", adminTimeZone);
    const qs = params.toString();
    return (
      "/api/admin/newsroom/audience/retention/stale-rows-thresholds/history.csv" +
      (qs ? `?${qs}` : "")
    );
  }, [
    staleRowsHistoryActor,
    staleRowsHistoryFrom,
    staleRowsHistoryTo,
    adminTimeZone,
  ]);
  const staleRowsThresholdHistoryQuery = useQuery<{
    entries: StaleRowsThresholdHistoryEntry[];
  }>({
    queryKey: [staleRowsHistoryUrl],
  });

  const acknowledgeStaleRowsAlertMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/stale-rows-alert/acknowledge",
        {},
      );
    },
    onSuccess: () => {
      setStaleRowsAckError(null);
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/retention/stats"],
      });
    },
    onError: (e: any) =>
      setStaleRowsAckError(e?.message ?? "acknowledge failed"),
  });

  const setModeMutation = useMutation({
    mutationFn: async (mode: RetentionModeMap | null) => {
      return await apiRequest("POST", "/api/admin/newsroom/audience/retention/mode", { mode });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/stats"] }),
  });

  const restoreLogQuery = useQuery<{ restoreLog: RestoreLogEntry[] }>({
    queryKey: ["/api/admin/newsroom/audience/retention/restore-log"],
  });

  const restoreMutation = useMutation({
    mutationFn: async (archivePath: string) => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/restore",
        { archivePath },
      );
    },
    onSuccess: (data: any) => {
      setRestoreError(null);
      const r = data?.result;
      if (r) {
        setRestoreNotice(
          `Restored ${r.rowsInserted} of ${r.rowsParsed} rows into audience_${r.table} (${r.rowsSkipped} already present)`,
        );
      }
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/restore-log"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/newsroom/audience/${productionId}/history`] });
    },
    onError: (e: any) => {
      setRestoreNotice(null);
      setRestoreError(e?.message ?? "restore failed");
    },
  });

  const retentionStats = retentionQuery.data?.stats;

  const triggerRestore = (archivePath: string, table: string, rowCount: number) => {
    const ok = window.confirm(
      `Restore ${rowCount} archived row(s) from\n\n${archivePath}\n\nback into audience_${table}? Already-present rows will be skipped.`,
    );
    if (!ok) return;
    restoreMutation.mutate(archivePath);
  };

  const updateTableMode = (table: keyof RetentionModeMap, value: RetentionMode) => {
    const current: RetentionModeMap =
      retentionStats?.mode ?? { messages: "delete", decisions: "delete", commands: "delete" };
    setModeMutation.mutate({ ...current, [table]: value });
  };

  return (
      <Card data-testid="card-retention">
        <CardHeader>
          <CardTitle>Audit Retention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Old audience messages, safety decisions, and simulated moderation
            commands are pruned on a schedule. Channel connectors are never
            auto-deleted.
          </p>
          {retentionQuery.isLoading && (
            <p className="text-sm text-muted-foreground" data-testid="text-retention-loading">
              Loading retention status…
            </p>
          )}
          {retentionQuery.data?.stats && (() => {
            const s = retentionQuery.data.stats;
            const lr = s.lastRun;
            return (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <RetentionStat
                    label="Current window"
                    value={`${s.retentionDays} days`}
                    sub={
                      s.override != null
                        ? `admin override`
                        : s.envFallback != null
                          ? `env: ${s.envFallback}d`
                          : `default: ${s.defaultRetentionDays}d`
                    }
                    testid="stat-retention-window"
                  />
                  <RetentionStat
                    label="Scheduler"
                    value={s.schedulerRunning ? "Running" : "Stopped"}
                    sub={`every ${s.intervalHours}h`}
                    testid="stat-retention-scheduler"
                  />
                  <RetentionStat
                    label="Sweeps completed"
                    value={String(s.runCount)}
                    sub={
                      s.totalGatewayEventsPruned != null
                        ? `${s.totalRowsPruned.toLocaleString()} rows pruned total · ${s.totalGatewayEventsPruned.toLocaleString()} gateway events`
                        : `${s.totalRowsPruned.toLocaleString()} rows pruned total`
                    }
                    testid="stat-retention-runcount"
                  />
                  <RetentionStat
                    label="Last sweep"
                    value={
                      lr
                        ? `${lr.totalPruned.toLocaleString()} rows`
                        : "Never run"
                    }
                    sub={
                      lr
                        ? `${new Date(lr.finishedAt).toLocaleString()} · ${lr.trigger}`
                        : "no sweeps yet"
                    }
                    testid="stat-retention-lastrun"
                  />
                </div>

                {s.staleRowsAlertActive && s.stalePendingArchive && s.staleRowsThresholds && (
                  <div
                    className="rounded border border-amber-500/60 bg-amber-500/10 p-3 space-y-2 text-sm"
                    data-testid="panel-retention-stale-rows-alert"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-amber-500 text-amber-600 dark:text-amber-400"
                        data-testid="badge-stale-rows-alert-active"
                      >
                        Backlog alert active
                      </Badge>
                      <span className="text-xs font-medium">
                        One or more audit tables are over the stale-rows
                        backlog threshold
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7 px-2 text-xs"
                        disabled={acknowledgeStaleRowsAlertMutation.isPending}
                        onClick={() =>
                          acknowledgeStaleRowsAlertMutation.mutate()
                        }
                        data-testid="button-acknowledge-stale-rows-alert"
                      >
                        {acknowledgeStaleRowsAlertMutation.isPending
                          ? "Acknowledging…"
                          : "Acknowledge"}
                      </Button>
                    </div>
                    {staleRowsAckError && (
                      <p
                        className="text-xs text-destructive"
                        data-testid="text-stale-rows-ack-error"
                      >
                        {staleRowsAckError}
                      </p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-3 text-xs">
                      <span data-testid="text-stale-rows-threshold-messages">
                        Messages:{" "}
                        <strong>
                          {s.stalePendingArchive.messages.toLocaleString()}
                        </strong>{" "}
                        / {s.staleRowsThresholds.messages.toLocaleString()}
                      </span>
                      <span data-testid="text-stale-rows-threshold-decisions">
                        Decisions:{" "}
                        <strong>
                          {s.stalePendingArchive.decisions.toLocaleString()}
                        </strong>{" "}
                        / {s.staleRowsThresholds.decisions.toLocaleString()}
                      </span>
                      <span data-testid="text-stale-rows-threshold-commands">
                        Commands:{" "}
                        <strong>
                          {s.stalePendingArchive.commands.toLocaleString()}
                        </strong>{" "}
                        / {s.staleRowsThresholds.commands.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {s.alertActive && s.stalePendingArchive && (
                  <div
                    className="rounded border border-destructive/60 bg-destructive/10 p-3 space-y-2 text-sm"
                    data-testid="panel-retention-stale-pending"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive">alert active</Badge>
                      <span className="text-xs font-medium">
                        Rows over the {s.retentionDays}-day window still
                        awaiting a successful archive
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 text-xs">
                      <span data-testid="text-stale-pending-messages">
                        Messages:{" "}
                        <strong>
                          {s.stalePendingArchive.messages.toLocaleString()}
                        </strong>
                        {s.mode?.messages === "archive" ? " (archive)" : " (delete)"}
                        <StalePendingTrend
                          history={s.stalePendingHistory}
                          field="messages"
                          current={s.stalePendingArchive.messages}
                          testid="trend-stale-pending-messages"
                        />
                      </span>
                      <span data-testid="text-stale-pending-decisions">
                        Decisions:{" "}
                        <strong>
                          {s.stalePendingArchive.decisions.toLocaleString()}
                        </strong>
                        {s.mode?.decisions === "archive" ? " (archive)" : " (delete)"}
                        <StalePendingTrend
                          history={s.stalePendingHistory}
                          field="decisions"
                          current={s.stalePendingArchive.decisions}
                          testid="trend-stale-pending-decisions"
                        />
                      </span>
                      <span data-testid="text-stale-pending-commands">
                        Commands:{" "}
                        <strong>
                          {s.stalePendingArchive.commands.toLocaleString()}
                        </strong>
                        {s.mode?.commands === "archive" ? " (archive)" : " (delete)"}
                        <StalePendingTrend
                          history={s.stalePendingHistory}
                          field="commands"
                          current={s.stalePendingArchive.commands}
                          testid="trend-stale-pending-commands"
                        />
                      </span>
                    </div>
                    {(s.stalePendingHistory?.length ?? 0) >= 2 && (
                      <div
                        className="text-[10px] text-muted-foreground"
                        data-testid="text-stale-pending-history-meta"
                      >
                        Trend across the last {s.stalePendingHistory!.length} sweep
                        {s.stalePendingHistory!.length === 1 ? "" : "s"}.
                        ▼ green = backlog shrinking, ▲ red = backlog growing.
                      </div>
                    )}
                  </div>
                )}

                {/* Task #468: stale-rows alert threshold controls */}
                {(() => {
                  const sr = staleRowsThresholdQuery.data;
                  if (!sr) return null;
                  const source = (table: "messages" | "decisions" | "commands") => {
                    const ov = sr.override ?? {};
                    if (typeof ov[table] === "number") return "override";
                    if (typeof ov.default === "number") return "default override";
                    if (sr.envFallback != null) return "env";
                    return "default";
                  };
                  return (
                    <div
                      className="rounded border p-3 space-y-3 text-sm"
                      data-testid="panel-stale-rows-threshold"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          stale-rows alert threshold
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Email + founder alert fires when any audit table's
                          stale-pending-archive count crosses its threshold.
                        </span>
                      </div>
                      <label
                        className="flex items-center gap-2 text-[11px] cursor-pointer select-none"
                        data-testid="label-stale-rows-notify-on-weakening"
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={
                            staleRowsNotifyOnWeakeningQuery.data?.enabled ??
                            true
                          }
                          disabled={
                            staleRowsNotifyOnWeakeningQuery.isLoading ||
                            staleRowsNotifyOnWeakeningMutation.isPending
                          }
                          onChange={(e) =>
                            staleRowsNotifyOnWeakeningMutation.mutate(
                              e.target.checked,
                            )
                          }
                          data-testid="checkbox-stale-rows-notify-on-weakening"
                        />
                        <span>
                          Notify on weakening (email all root admins when a
                          stale-rows threshold is set to 0 or loosened by 2x+)
                        </span>
                      </label>
                      <div className="grid gap-2 sm:grid-cols-3 text-xs">
                        <span data-testid="text-stale-threshold-messages">
                          Messages:{" "}
                          <strong>
                            {sr.thresholds.messages.toLocaleString()}
                          </strong>{" "}
                          <span className="text-muted-foreground">
                            ({source("messages")})
                          </span>
                        </span>
                        <span data-testid="text-stale-threshold-decisions">
                          Decisions:{" "}
                          <strong>
                            {sr.thresholds.decisions.toLocaleString()}
                          </strong>{" "}
                          <span className="text-muted-foreground">
                            ({source("decisions")})
                          </span>
                        </span>
                        <span data-testid="text-stale-threshold-commands">
                          Commands:{" "}
                          <strong>
                            {sr.thresholds.commands.toLocaleString()}
                          </strong>{" "}
                          <span className="text-muted-foreground">
                            ({source("commands")})
                          </span>
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Env fallback:{" "}
                        {sr.envFallback != null
                          ? sr.envFallback.toLocaleString()
                          : "—"}
                        . Leave a field blank to keep its current value.
                      </div>
                      {sr.override != null && (sr.updatedBy || sr.updatedAt) && (
                        <div
                          className="text-[10px] text-muted-foreground"
                          data-testid="text-stale-threshold-last-changed"
                        >
                          Last changed by{" "}
                          <strong
                            title={sr.updatedBy ?? undefined}
                            data-testid="text-stale-threshold-updated-by"
                          >
                            {sr.updatedByDisplayName
                              ? `${sr.updatedByDisplayName}${sr.updatedByEmail ? ` (${sr.updatedByEmail})` : ""}`
                              : sr.updatedByEmail ??
                                sr.updatedBy ??
                                "unknown"}
                          </strong>
                          {sr.updatedAt && (
                            <>
                              {" "}at{" "}
                              <span
                                title={sr.updatedAt}
                                data-testid="text-stale-threshold-updated-at"
                              >
                                {new Date(sr.updatedAt).toLocaleString()}
                              </span>
                            </>
                          )}
                          .
                        </div>
                      )}
                      <div className="grid gap-2 sm:grid-cols-4">
                        <label className="text-xs space-y-1">
                          <span className="text-muted-foreground">
                            Default (all tables)
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={staleRowsDefaultInput}
                            onChange={(e) =>
                              setStaleRowsDefaultInput(e.target.value)
                            }
                            placeholder={
                              sr.override?.default != null
                                ? String(sr.override.default)
                                : ""
                            }
                            data-testid="input-stale-threshold-default"
                          />
                        </label>
                        <label className="text-xs space-y-1">
                          <span className="text-muted-foreground">Messages</span>
                          <Input
                            type="number"
                            min={0}
                            value={staleRowsMessagesInput}
                            onChange={(e) =>
                              setStaleRowsMessagesInput(e.target.value)
                            }
                            placeholder={String(sr.thresholds.messages)}
                            data-testid="input-stale-threshold-messages"
                          />
                        </label>
                        <label className="text-xs space-y-1">
                          <span className="text-muted-foreground">
                            Decisions
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={staleRowsDecisionsInput}
                            onChange={(e) =>
                              setStaleRowsDecisionsInput(e.target.value)
                            }
                            placeholder={String(sr.thresholds.decisions)}
                            data-testid="input-stale-threshold-decisions"
                          />
                        </label>
                        <label className="text-xs space-y-1">
                          <span className="text-muted-foreground">
                            Commands
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={staleRowsCommandsInput}
                            onChange={(e) =>
                              setStaleRowsCommandsInput(e.target.value)
                            }
                            placeholder={String(sr.thresholds.commands)}
                            data-testid="input-stale-threshold-commands"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Button
                          size="sm"
                          onClick={() => {
                            try {
                              const { override } = buildStaleRowsThresholdsPayload({
                                defaultInput: staleRowsDefaultInput,
                                messagesInput: staleRowsMessagesInput,
                                decisionsInput: staleRowsDecisionsInput,
                                commandsInput: staleRowsCommandsInput,
                                currentOverride: sr.override ?? null,
                              });
                              staleRowsThresholdMutation.mutate(override);
                            } catch (err: any) {
                              setStaleRowsError(
                                err?.message ??
                                  "stale-rows threshold save failed",
                              );
                            }
                          }}
                          disabled={staleRowsThresholdMutation.isPending}
                          data-testid="button-stale-threshold-save"
                        >
                          {staleRowsThresholdMutation.isPending
                            ? "Saving…"
                            : "Save thresholds"}
                        </Button>
                        {sr.override != null && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              staleRowsThresholdMutation.mutate(null)
                            }
                            disabled={staleRowsThresholdMutation.isPending}
                            data-testid="button-stale-threshold-clear"
                          >
                            Clear override
                          </Button>
                        )}
                        {staleRowsError && (
                          <span
                            className="text-xs text-destructive"
                            data-testid="text-stale-threshold-error"
                          >
                            {staleRowsError}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const entries =
                          staleRowsThresholdHistoryQuery.data?.entries ?? [];
                        const actorOptions = Array.from(
                          new Set(
                            entries
                              .map((e) => e.updatedBy)
                              .filter(
                                (a): a is string =>
                                  typeof a === "string" && a.length > 0,
                              ),
                          ),
                        ).sort();
                        const filtersActive =
                          staleRowsHistoryActor !== "" ||
                          staleRowsHistoryFrom !== "" ||
                          staleRowsHistoryTo !== "";
                        const formatOverride = (
                          ov:
                            | Partial<{
                                messages: number;
                                decisions: number;
                                commands: number;
                                default: number;
                              }>
                            | null,
                        ): string => {
                          if (!ov) return "cleared";
                          const parts: string[] = [];
                          for (const k of [
                            "default",
                            "messages",
                            "decisions",
                            "commands",
                          ] as const) {
                            const v = ov[k];
                            if (typeof v === "number") {
                              parts.push(`${k}=${v.toLocaleString()}`);
                            }
                          }
                          return parts.length === 0 ? "cleared" : parts.join(", ");
                        };
                        return (
                          <div
                            className="space-y-1 pt-2 border-t"
                            data-testid="panel-stale-threshold-history"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                                Recent threshold changes
                              </div>
                              <a
                                href={staleRowsHistoryCsvUrl}
                                download
                                className="text-[11px] underline text-muted-foreground hover:text-foreground"
                                data-testid="link-stale-threshold-history-csv"
                              >
                                Download CSV
                              </a>
                            </div>
                            <div
                              className="flex flex-wrap gap-2 items-center pb-1"
                              data-testid="filters-stale-threshold-history"
                            >
                              <label className="text-[10px] text-muted-foreground">
                                Actor
                                <select
                                  className="ml-1 h-7 rounded border bg-background px-1 text-xs"
                                  value={staleRowsHistoryActor}
                                  onChange={(e) =>
                                    setStaleRowsHistoryActor(e.target.value)
                                  }
                                  data-testid="select-stale-threshold-history-actor"
                                >
                                  <option value="">All</option>
                                  {staleRowsHistoryActor &&
                                    !actorOptions.includes(
                                      staleRowsHistoryActor,
                                    ) && (
                                      <option value={staleRowsHistoryActor}>
                                        {staleRowsHistoryActor}
                                      </option>
                                    )}
                                  {actorOptions.map((a) => (
                                    <option key={a} value={a}>
                                      {a}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-[10px] text-muted-foreground">
                                From
                                <input
                                  type="datetime-local"
                                  className="ml-1 h-7 rounded border bg-background px-1 text-xs"
                                  value={staleRowsHistoryFrom}
                                  onChange={(e) =>
                                    setStaleRowsHistoryFrom(e.target.value)
                                  }
                                  data-testid="input-stale-threshold-history-from"
                                />
                              </label>
                              <label className="text-[10px] text-muted-foreground">
                                To
                                <input
                                  type="datetime-local"
                                  className="ml-1 h-7 rounded border bg-background px-1 text-xs"
                                  value={staleRowsHistoryTo}
                                  onChange={(e) =>
                                    setStaleRowsHistoryTo(e.target.value)
                                  }
                                  data-testid="input-stale-threshold-history-to"
                                />
                              </label>
                              {filtersActive && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setStaleRowsHistoryActor("");
                                    setStaleRowsHistoryFrom("");
                                    setStaleRowsHistoryTo("");
                                  }}
                                  data-testid="button-stale-threshold-history-clear-filters"
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                            {staleRowsThresholdHistoryQuery.isLoading ? (
                              <div
                                className="text-xs text-muted-foreground"
                                data-testid="text-stale-threshold-history-loading"
                              >
                                Loading…
                              </div>
                            ) : entries.length === 0 ? (
                              <div
                                className="text-xs text-muted-foreground"
                                data-testid="text-stale-threshold-history-empty"
                              >
                                No threshold changes recorded yet.
                              </div>
                            ) : (
                              <ul
                                className="space-y-1 text-xs"
                                data-testid="list-stale-threshold-history"
                              >
                                {entries.map((entry) => (
                                  <li
                                    key={entry.id}
                                    className="rounded border px-2 py-1 space-y-0.5"
                                    data-testid={`row-stale-threshold-history-${entry.id}`}
                                  >
                                    <div className="flex flex-wrap gap-2 items-center">
                                      <span
                                        title={entry.occurredAt}
                                        className="font-mono text-[11px]"
                                        data-testid={`text-stale-threshold-history-time-${entry.id}`}
                                      >
                                        {new Date(
                                          entry.occurredAt,
                                        ).toLocaleString()}
                                      </span>
                                      <span className="text-muted-foreground">
                                        by{" "}
                                      </span>
                                      <strong
                                        title={entry.updatedBy ?? undefined}
                                        data-testid={`text-stale-threshold-history-actor-${entry.id}`}
                                      >
                                        {entry.updatedByDisplayName
                                          ? `${entry.updatedByDisplayName}${entry.updatedByEmail ? ` (${entry.updatedByEmail})` : ""}`
                                          : entry.updatedByEmail ??
                                            entry.updatedBy ??
                                            "unknown"}
                                      </strong>
                                    </div>
                                    <div className="text-muted-foreground">
                                      <span data-testid={`text-stale-threshold-history-prior-${entry.id}`}>
                                        {formatOverride(entry.priorOverride)}
                                      </span>
                                      {" → "}
                                      <span
                                        className="text-foreground"
                                        data-testid={`text-stale-threshold-history-new-${entry.id}`}
                                      >
                                        {formatOverride(entry.newOverride)}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {lr ? (
                  <div
                    className="rounded border p-3 space-y-1 text-sm"
                    data-testid="panel-retention-lastrun"
                  >
                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge variant={lr.error ? "destructive" : "default"}>
                        {lr.error ? "failed" : "ok"}
                      </Badge>
                      <Badge variant="outline">{lr.trigger}</Badge>
                      <Badge variant="outline">
                        cutoff {new Date(lr.cutoffIso).toLocaleString()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {lr.retentionDays}d window
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 text-xs">
                      <span data-testid="text-pruned-messages">
                        Messages pruned: <strong>{lr.messagesPruned.toLocaleString()}</strong>
                      </span>
                      <span data-testid="text-pruned-decisions">
                        Decisions pruned: <strong>{lr.decisionsPruned.toLocaleString()}</strong>
                      </span>
                      <span data-testid="text-pruned-commands">
                        Commands pruned: <strong>{lr.commandsPruned.toLocaleString()}</strong>
                      </span>
                      <span data-testid="text-pruned-gateway-events">
                        Gateway events pruned:{" "}
                        <strong>{(lr.gatewayEventsPruned ?? 0).toLocaleString()}</strong>
                      </span>
                      <span data-testid="text-pruned-notification-history">
                        Notification history pruned:{" "}
                        <strong>
                          {(lr.notificationHistoryPruned ?? 0).toLocaleString()}
                        </strong>
                      </span>
                      <span data-testid="text-pruned-threshold-audit">
                        Threshold audit pruned:{" "}
                        <strong>
                          {(lr.thresholdAuditRowsPruned ?? 0).toLocaleString()}
                        </strong>
                        {s.totalThresholdAuditPruned != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({s.totalThresholdAuditPruned.toLocaleString()} total)
                          </span>
                        )}
                      </span>
                      <span data-testid="text-pruned-restore-log">
                        Restore log pruned:{" "}
                        <strong>{(lr.restoreLogPruned ?? 0).toLocaleString()}</strong>
                        {lr.restoreLogRetentionDays != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({lr.restoreLogRetentionDays}d window)
                          </span>
                        )}
                      </span>
                    </div>
                    {lr.error && (
                      <div
                        className="text-xs text-destructive"
                        data-testid="text-retention-last-error"
                      >
                        {lr.error}
                      </div>
                    )}
                  </div>
                ) : (
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="text-retention-never-run"
                  >
                    No sweep has run yet. Trigger one below or wait for the
                    scheduled tick.
                  </p>
                )}

                <div className="flex flex-wrap gap-2 items-end">
                  <label className="text-xs space-y-1">
                    <span className="text-muted-foreground">
                      Retention window (days)
                    </span>
                    <Input
                      type="number"
                      min={1}
                      value={retentionDaysInput}
                      onChange={(e) => setRetentionDaysInput(e.target.value)}
                      placeholder={String(s.retentionDays)}
                      className="w-40"
                      data-testid="input-retention-days"
                    />
                  </label>
                  <Button
                    size="sm"
                    onClick={() => {
                      const n = Number(retentionDaysInput);
                      if (!Number.isFinite(n) || n < 1) {
                        setRetentionError("Enter a positive integer number of days.");
                        return;
                      }
                      overrideMutation.mutate(Math.floor(n));
                    }}
                    disabled={overrideMutation.isPending || retentionDaysInput.trim() === ""}
                    data-testid="button-retention-save-window"
                  >
                    {overrideMutation.isPending ? "Saving…" : "Save window"}
                  </Button>
                  {s.override != null && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => overrideMutation.mutate(null)}
                      disabled={overrideMutation.isPending}
                      data-testid="button-retention-clear-override"
                    >
                      Clear override
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const raw = retentionDaysInput.trim();
                      if (raw === "") {
                        sweepMutation.mutate(undefined);
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n) || n < 1) {
                        setRetentionError("Enter a positive integer number of days.");
                        return;
                      }
                      sweepMutation.mutate(Math.floor(n));
                    }}
                    disabled={sweepMutation.isPending}
                    data-testid="button-retention-run-sweep"
                  >
                    {sweepMutation.isPending ? "Running…" : "Run sweep now"}
                  </Button>
                  {retentionError && (
                    <span
                      className="text-xs text-destructive self-center"
                      data-testid="text-retention-error"
                    >
                      {retentionError}
                    </span>
                  )}
                </div>

                <div
                  className="rounded border p-3 space-y-3"
                  data-testid="panel-retention-mode"
                >
                  <div className="text-xs text-muted-foreground">
                    Choose per-table whether to permanently <strong>delete</strong> old
                    rows or first <strong>archive</strong> a gzipped JSONL copy to object
                    storage (<code>PRIVATE_OBJECT_DIR/audience-archive/&lt;table&gt;/&lt;ts&gt;.jsonl.gz</code>)
                    for compliance reconstruction.
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {(["messages", "decisions", "commands"] as const).map((t) => (
                      <label key={t} className="text-xs space-y-1">
                        <span className="text-muted-foreground capitalize">{t}</span>
                        <select
                          value={s.mode?.[t] ?? "delete"}
                          onChange={(e) =>
                            updateTableMode(t, e.target.value as RetentionMode)
                          }
                          disabled={setModeMutation.isPending}
                          className="w-full h-9 rounded border bg-background px-2 text-sm"
                          data-testid={`select-retention-mode-${t}`}
                        >
                          <option value="delete">delete (hard-prune)</option>
                          <option value="archive">
                            archive (gzip → object storage, then prune)
                          </option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-retention-totals">
                    Lifetime archived: <strong>{(s.totalRowsArchived ?? 0).toLocaleString()}</strong>
                    {" "}rows in <strong>{s.totalArchiveFiles ?? 0}</strong> files
                  </div>
                  <div
                    className="text-xs text-muted-foreground"
                    data-testid="text-archive-upload-retries"
                  >
                    Archive upload retries:{" "}
                    <strong>{(s.archiveUploadRetryCount ?? 0).toLocaleString()}</strong>
                    {" "}· final failures:{" "}
                    <strong>{(s.archiveUploadFinalFailureCount ?? 0).toLocaleString()}</strong>
                    {(s.archiveUploadRetryCount ?? 0) > 0 && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                        — storage backend may be flaking, investigate before retries are exhausted
                      </span>
                    )}
                  </div>
                  {lr && (lr.archiveFiles?.length ?? 0) > 0 && (
                    <div className="text-xs space-y-1" data-testid="block-retention-last-archive">
                      <div className="text-muted-foreground">
                        Last run archived messages={lr.messagesArchived ?? 0},
                        decisions={lr.decisionsArchived ?? 0},
                        commands={lr.commandsArchived ?? 0}
                      </div>
                      <ul className="space-y-2">
                        {lr.archiveFiles!.map((f) => (
                          <li
                            key={`${f.table}-${f.path}`}
                            className="flex flex-wrap items-center gap-2 font-mono text-[11px] break-all"
                            data-testid={`row-archive-file-${f.table}`}
                          >
                            <Badge variant="outline">{f.table}</Badge>{" "}
                            <span>{f.path}</span>{" "}
                            <span className="text-muted-foreground">
                              ({f.rowCount} rows, {f.bytes} bytes)
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => triggerRestore(f.path, f.table, f.rowCount)}
                              disabled={restoreMutation.isPending}
                              data-testid={`button-restore-archive-${f.table}`}
                            >
                              {restoreMutation.isPending ? "Restoring…" : "Restore"}
                            </Button>
                          </li>
                        ))}
                      </ul>
                      {restoreNotice && (
                        <div
                          className="text-xs text-emerald-600 dark:text-emerald-400"
                          data-testid="text-restore-notice"
                        >
                          {restoreNotice}
                        </div>
                      )}
                      {restoreError && (
                        <div
                          className="text-xs text-destructive"
                          data-testid="text-restore-error"
                        >
                          {restoreError}
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    className="rounded border p-3 space-y-2"
                    data-testid="panel-restore-log-retention"
                  >
                    <div className="text-xs text-muted-foreground">
                      Restore log retention controls how long entries in{" "}
                      <code>audience_restore_log</code> are kept before the
                      daily sweep prunes them.
                    </div>
                    <div
                      className="text-xs"
                      data-testid="text-restore-log-retention-current"
                    >
                      Current window:{" "}
                      <strong>
                        {s.restoreLogRetentionDays ??
                          s.defaultRestoreLogRetentionDays ??
                          "—"}
                      </strong>
                      {typeof s.restoreLogRetentionDays === "number" && " d"}
                      {s.restoreLogRetentionOverride != null ? (
                        <span className="ml-2 text-muted-foreground">
                          (admin override:{" "}
                          <strong>{s.restoreLogRetentionOverride}d</strong>)
                        </span>
                      ) : s.restoreLogRetentionEnvFallback != null ? (
                        <span className="ml-2 text-muted-foreground">
                          (env fallback:{" "}
                          <strong>
                            {s.restoreLogRetentionEnvFallback}d
                          </strong>
                          )
                        </span>
                      ) : (
                        <span className="ml-2 text-muted-foreground">
                          (default:{" "}
                          <strong>
                            {s.defaultRestoreLogRetentionDays ?? "—"}d
                          </strong>
                          )
                        </span>
                      )}
                      {" · rows kept: "}
                      <strong>
                        {(s.restoreLogRowCount ?? 0).toLocaleString()}
                      </strong>
                      {" · lifetime pruned: "}
                      <strong>
                        {(s.totalRestoreLogPruned ?? 0).toLocaleString()}
                      </strong>
                    </div>
                    <div className="flex flex-wrap gap-2 items-end">
                      <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">
                          Restore-log window (days)
                        </span>
                        <Input
                          type="number"
                          min={1}
                          value={restoreLogRetentionInput}
                          onChange={(e) =>
                            setRestoreLogRetentionInput(e.target.value)
                          }
                          placeholder={String(
                            s.restoreLogRetentionDays ??
                              s.defaultRestoreLogRetentionDays ??
                              "",
                          )}
                          className="w-40"
                          data-testid="input-restore-log-retention-days"
                        />
                      </label>
                      <Button
                        size="sm"
                        onClick={() => {
                          const n = Number(restoreLogRetentionInput);
                          if (!Number.isFinite(n) || n < 1) {
                            setRestoreLogRetentionError(
                              "Enter a positive integer number of days.",
                            );
                            return;
                          }
                          restoreLogRetentionMutation.mutate(Math.floor(n));
                        }}
                        disabled={
                          restoreLogRetentionMutation.isPending ||
                          restoreLogRetentionInput.trim() === ""
                        }
                        data-testid="button-restore-log-retention-save"
                      >
                        {restoreLogRetentionMutation.isPending
                          ? "Saving…"
                          : "Save window"}
                      </Button>
                      {s.restoreLogRetentionOverride != null && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            restoreLogRetentionMutation.mutate(null)
                          }
                          disabled={restoreLogRetentionMutation.isPending}
                          data-testid="button-restore-log-retention-reset"
                        >
                          Reset to default
                        </Button>
                      )}
                      {restoreLogRetentionError && (
                        <span
                          className="text-xs text-destructive self-center"
                          data-testid="text-restore-log-retention-error"
                        >
                          {restoreLogRetentionError}
                        </span>
                      )}
                    </div>
                  </div>
                  {s.restoreLogRate && (
                    <div
                      className={`text-xs space-y-1 border-t pt-2 ${
                        s.restoreLogRate.alertActive
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                      data-testid="block-restore-log-rate"
                    >
                      <div className="font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>
                          Restore activity today (UTC):{" "}
                          <span data-testid="text-restore-log-rate-count">
                            <strong>
                              {s.restoreLogRate.todayCount.toLocaleString()}
                            </strong>
                          </span>{" "}
                          / {s.restoreLogRate.threshold.toLocaleString()}
                          {s.restoreLogRate.threshold === 0 && " (alerting off)"}
                        </span>
                        <RestoreLogDailyActivityChart
                          activity={
                            restoreLogActivityQuery.data?.dailyActivity ??
                            s.restoreLogRate.dailyActivity
                          }
                          threshold={s.restoreLogRate.threshold}
                        />
                        <span
                          className="inline-flex items-center gap-0.5 rounded border bg-muted/40 p-0.5"
                          data-testid="toggle-restore-log-activity-window"
                          title="Choose how many days of restore activity to chart"
                        >
                          {RESTORE_LOG_ACTIVITY_WINDOW_OPTIONS.map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setRestoreLogActivityDays(d)}
                              aria-pressed={restoreLogActivityDays === d}
                              className={`px-1.5 py-0.5 text-[10px] rounded ${
                                restoreLogActivityDays === d
                                  ? "bg-background font-semibold text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              data-testid={`button-restore-log-activity-window-${d}d`}
                            >
                              {d}d
                            </button>
                          ))}
                        </span>
                        <RestoreLogActivityTrendPill
                          activity={
                            restoreLogActivityQuery.data?.dailyActivity ??
                            s.restoreLogRate.dailyActivity
                          }
                          threshold={s.restoreLogRate.threshold}
                        />
                        {s.restoreLogRate.alertActive && (
                          <Badge
                            variant="destructive"
                            data-testid="badge-restore-log-rate-alert"
                          >
                            rate spike alert active
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px]">
                        Founders are emailed when today's
                        <code className="mx-1">audience_restore_log</code>
                        inserts cross the threshold. Window resets at 00:00 UTC.
                        {s.restoreLogRate.override != null && (
                          <> Threshold override: {s.restoreLogRate.override}.</>
                        )}
                      </div>
                      <label
                        className="flex items-center gap-2 text-[11px] cursor-pointer select-none"
                        data-testid="label-restore-log-rate-notify-on-weakening"
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={
                            restoreLogRateNotifyOnWeakeningQuery.data
                              ?.enabled ?? true
                          }
                          disabled={
                            restoreLogRateNotifyOnWeakeningQuery.isLoading ||
                            restoreLogRateNotifyOnWeakeningMutation.isPending
                          }
                          onChange={(e) =>
                            restoreLogRateNotifyOnWeakeningMutation.mutate(
                              e.target.checked,
                            )
                          }
                          data-testid="checkbox-restore-log-rate-notify-on-weakening"
                        />
                        <span>
                          Notify on weakening (email all root admins when the
                          threshold is set to 0 or loosened by 2x+)
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-2 items-end pt-1">
                        <label className="text-[11px] space-y-1">
                          <span className="text-muted-foreground">
                            Rate threshold (0 disables)
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={restoreLogRateThresholdInput}
                            onChange={(e) =>
                              setRestoreLogRateThresholdInput(e.target.value)
                            }
                            placeholder={String(s.restoreLogRate.threshold)}
                            className="w-32 h-8"
                            data-testid="input-restore-log-rate-threshold"
                          />
                        </label>
                        <Button
                          size="sm"
                          onClick={() => {
                            try {
                              const { threshold } =
                                buildRestoreLogRateThresholdPayload({
                                  draft: restoreLogRateThresholdInput,
                                });
                              restoreLogRateThresholdMutation.mutate(threshold);
                            } catch (e: any) {
                              setRestoreLogRateThresholdError(
                                e?.message ??
                                  RESTORE_LOG_RATE_THRESHOLD_ERRORS.nonNegativeInteger,
                              );
                            }
                          }}
                          disabled={
                            restoreLogRateThresholdMutation.isPending ||
                            restoreLogRateThresholdInput.trim() === ""
                          }
                          data-testid="button-restore-log-rate-threshold-save"
                        >
                          {restoreLogRateThresholdMutation.isPending
                            ? "Saving…"
                            : "Save threshold"}
                        </Button>
                        {s.restoreLogRate.override != null && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              restoreLogRateThresholdMutation.mutate(null)
                            }
                            disabled={restoreLogRateThresholdMutation.isPending}
                            data-testid="button-restore-log-rate-threshold-reset"
                          >
                            Reset to default
                          </Button>
                        )}
                        {restoreLogRateThresholdError && (
                          <span
                            className="text-[11px] text-destructive self-center"
                            data-testid="text-restore-log-rate-threshold-error"
                          >
                            {restoreLogRateThresholdError}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const entries =
                          restoreLogRateThresholdHistoryQuery.data?.entries ??
                          [];
                        const formatOverride = (v: number | null) => {
                          if (v === null || v === undefined) return "default";
                          if (v === 0) return "0 (alerting off)";
                          return v.toLocaleString();
                        };
                        return (
                          <div
                            className="space-y-1 pt-2 border-t"
                            data-testid="panel-restore-log-rate-threshold-history"
                          >
                            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                              Recent threshold changes
                            </div>
                            {restoreLogRateThresholdHistoryQuery.isLoading ? (
                              <div
                                className="text-[11px] text-muted-foreground"
                                data-testid="text-restore-log-rate-threshold-history-loading"
                              >
                                Loading…
                              </div>
                            ) : entries.length === 0 ? (
                              <div
                                className="text-[11px] text-muted-foreground"
                                data-testid="text-restore-log-rate-threshold-history-empty"
                              >
                                No threshold changes recorded yet.
                              </div>
                            ) : (
                              <ul
                                className="space-y-1 text-[11px]"
                                data-testid="list-restore-log-rate-threshold-history"
                              >
                                {entries.slice(0, 5).map((entry) => (
                                  <li
                                    key={entry.id}
                                    className="rounded border px-2 py-1 space-y-0.5"
                                    data-testid={`row-restore-log-rate-threshold-history-${entry.id}`}
                                  >
                                    <div className="flex flex-wrap gap-2 items-center">
                                      <span
                                        title={entry.occurredAt}
                                        className="font-mono"
                                        data-testid={`text-restore-log-rate-threshold-history-time-${entry.id}`}
                                      >
                                        {new Date(
                                          entry.occurredAt,
                                        ).toLocaleString()}
                                      </span>
                                      <span className="text-muted-foreground">
                                        by{" "}
                                      </span>
                                      <strong
                                        title={entry.updatedBy ?? undefined}
                                        data-testid={`text-restore-log-rate-threshold-history-actor-${entry.id}`}
                                      >
                                        {entry.updatedByDisplayName
                                          ? `${entry.updatedByDisplayName}${
                                              entry.updatedByEmail
                                                ? ` (${entry.updatedByEmail})`
                                                : ""
                                            }`
                                          : entry.updatedBy ?? "unknown"}
                                      </strong>
                                    </div>
                                    <div className="text-muted-foreground">
                                      <span
                                        data-testid={`text-restore-log-rate-threshold-history-prior-${entry.id}`}
                                      >
                                        {formatOverride(entry.priorOverride)}
                                      </span>
                                      {" → "}
                                      <span
                                        className="text-foreground"
                                        data-testid={`text-restore-log-rate-threshold-history-new-${entry.id}`}
                                      >
                                        {formatOverride(entry.newOverride)}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                      {(() => {
                        const entries =
                          restoreLogRateWeakeningHistoryQuery.data?.entries ??
                          [];
                        const reasonLabel = (
                          r: "disabled" | "loosened_2x",
                        ) =>
                          r === "disabled"
                            ? "alerting DISABLED"
                            : "loosened 2x+";
                        return (
                          <div
                            className="space-y-1 pt-2 border-t"
                            data-testid="panel-restore-log-rate-weakening-history"
                          >
                            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                              Recent weakening alerts
                            </div>
                            {restoreLogRateWeakeningHistoryQuery.isLoading ? (
                              <div
                                className="text-[11px] text-muted-foreground"
                                data-testid="text-restore-log-rate-weakening-history-loading"
                              >
                                Loading…
                              </div>
                            ) : entries.length === 0 ? (
                              <div
                                className="text-[11px] text-muted-foreground"
                                data-testid="text-restore-log-rate-weakening-history-empty"
                              >
                                No weakening alerts emailed yet.
                              </div>
                            ) : (
                              <ul
                                className="space-y-1 text-[11px]"
                                data-testid="list-restore-log-rate-weakening-history"
                              >
                                {entries.slice(0, 5).map((entry) => (
                                  <li
                                    key={entry.id}
                                    className="rounded border px-2 py-1 space-y-0.5"
                                    data-testid={`row-restore-log-rate-weakening-history-${entry.id}`}
                                  >
                                    <div className="flex flex-wrap gap-2 items-center">
                                      <Badge
                                        variant={
                                          entry.sent ? "default" : "destructive"
                                        }
                                        data-testid={`badge-restore-log-rate-weakening-history-status-${entry.id}`}
                                      >
                                        {entry.sent ? "sent" : "failed"}
                                      </Badge>
                                      <span
                                        title={entry.occurredAt}
                                        className="font-mono"
                                        data-testid={`text-restore-log-rate-weakening-history-time-${entry.id}`}
                                      >
                                        {new Date(
                                          entry.occurredAt,
                                        ).toLocaleString()}
                                      </span>
                                      <span className="text-muted-foreground">
                                        by{" "}
                                      </span>
                                      <strong
                                        data-testid={`text-restore-log-rate-weakening-history-actor-${entry.id}`}
                                      >
                                        {entry.actor}
                                      </strong>
                                      <Badge variant="outline">
                                        {reasonLabel(entry.reason)}
                                      </Badge>
                                    </div>
                                    <div className="text-muted-foreground">
                                      <span
                                        data-testid={`text-restore-log-rate-weakening-history-prior-${entry.id}`}
                                      >
                                        {entry.priorEffective.toLocaleString()}
                                      </span>
                                      {" → "}
                                      <span
                                        className="text-foreground"
                                        data-testid={`text-restore-log-rate-weakening-history-new-${entry.id}`}
                                      >
                                        {entry.newEffective.toLocaleString()}
                                      </span>
                                      {entry.recipients.length > 0 && (
                                        <>
                                          {" · "}
                                          <span
                                            title={entry.recipients.join(", ")}
                                            data-testid={`text-restore-log-rate-weakening-history-recipients-${entry.id}`}
                                          >
                                            {entry.recipients.length}{" "}
                                            recipient
                                            {entry.recipients.length === 1
                                              ? ""
                                              : "s"}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                    {entry.errorMessage && (
                                      <div
                                        className="text-[11px] text-destructive"
                                        data-testid={`text-restore-log-rate-weakening-history-error-${entry.id}`}
                                      >
                                        {entry.errorMessage}
                                      </div>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {(restoreLogQuery.data?.restoreLog?.length ?? 0) > 0 && (
                    <div
                      className="text-xs space-y-1 border-t pt-2"
                      data-testid="block-restore-log"
                    >
                      <div className="text-muted-foreground font-medium">
                        Recent restores
                      </div>
                      <ul className="space-y-1">
                        {restoreLogQuery.data!.restoreLog.slice(0, 5).map((e, i) => (
                          <li
                            key={`${e.restoredAt}-${i}`}
                            className="font-mono text-[11px] break-all"
                            data-testid={`row-restore-log-${i}`}
                          >
                            <Badge variant={e.error ? "destructive" : "default"}>
                              {e.error ? "failed" : "ok"}
                            </Badge>{" "}
                            <Badge variant="outline">{e.table}</Badge>{" "}
                            {new Date(e.restoredAt).toLocaleString()} · by {e.restoredBy} ·
                            inserted {e.rowsInserted}/{e.rowsParsed} (skipped {e.rowsSkipped})
                            {e.error && (
                              <span className="text-destructive"> · {e.error}</span>
                            )}{" "}
                            <span className="text-muted-foreground">{e.archivePath}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
  );
}
