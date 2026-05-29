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

export type LexiconLocale = "en" | "es" | "pt" | "fr" | "de" | "zh" | "ar";

export interface ConnectorFeatureFlags {
  multilingualLexicons: LexiconLocale[];
  aiModerationSecondOpinion: boolean;
}

export interface Connector {
  connectorId: string;
  platform: string;
  displayName: string;
  connectionStatus: string;
  apiAccessMode: string;
  permissions: Record<string, boolean>;
  safetyEnvelope: Record<string, boolean>;
  featureFlags: ConnectorFeatureFlags;
  platformSendApproved?: boolean;
  platformSendApprovedBy?: string | null;
  platformSendApprovedAt?: string | null;
  autoPausedAt?: string | null;
  autoPausedReason?: string | null;
}

export interface StalePendingHistoryEntry {
  recordedAt: string;
  retentionDays: number;
  messages: number;
  decisions: number;
  commands: number;
  trigger: "scheduled" | "manual" | "cli";
  error: string | null;
}

export const LEXICON_LOCALES: { code: LexiconLocale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
];

export interface Decision {
  decisionId: string;
  messageId: string;
  platform: string;
  action: string;
  reasonCodes: string[];
  scores: Record<string, number>;
  giftValue: number | null;
  allowedForRobotSpeech: boolean;
  allowedForScreenDisplay: boolean;
  cAudienceSafety: number;
}

export const PLATFORMS = [
  "youtube", "facebook", "x", "telegram", "instagram", "tiktok", "linkedin", "reddit", "custom",
];

export type AudienceAuditRiskSignal =
  | "full_trail"
  | "no_date_window"
  | "wide_date_window"
  | "first_export_by_actor"
  | "new_production_for_actor"
  | "format_change";

export const RISK_SIGNAL_LABELS: Record<AudienceAuditRiskSignal, string> = {
  full_trail: "FULL TRAIL (no filters)",
  no_date_window: "no date window",
  wide_date_window: "wide date window (>90d)",
  first_export_by_actor: "first-ever export",
  new_production_for_actor: "new productionId",
  format_change: "format change",
};

export const RISK_SIGNAL_DESCRIPTIONS: Record<AudienceAuditRiskSignal, string> = {
  full_trail:
    "No filters at all — the actor pulled the entire audit trail in one shot.",
  no_date_window:
    "Neither a from nor a to date was set, so the pull spans all time.",
  wide_date_window:
    "The from/to window covers more than 90 days.",
  first_export_by_actor:
    "This actor has never pulled the audit trail before.",
  new_production_for_actor:
    "This actor is exporting a productionId they have not exported before.",
  format_change:
    "The actor switched to a different format than their most recent prior export.",
};

export const RISK_SIGNAL_BADGE_CLASS: Record<AudienceAuditRiskSignal, string> = {
  full_trail:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
  no_date_window:
    "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800",
  wide_date_window:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  first_export_by_actor:
    "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
  new_production_for_actor:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  format_change:
    "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
};

export const RISK_SIGNAL_ORDER: AudienceAuditRiskSignal[] = [
  "full_trail",
  "no_date_window",
  "wide_date_window",
  "first_export_by_actor",
  "new_production_for_actor",
  "format_change",
];

export function MetricCard({ label, value, testid }: { label: string; value: number; testid: string }) {
  return (
    <Card data-testid={testid}>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export interface ArchiveFile {
  table: "messages" | "decisions" | "commands";
  path: string;
  bytes: number;
  rowCount: number | null;
  updatedAt: string | null;
  sweepStartedAt: string | null;
  cutoffIso: string | null;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export interface ArchivePreviewResult {
  path: string;
  filename: string;
  bytes: number | null;
  contentType: string;
  maxRows: number;
  offset: number;
  rows: unknown[];
  truncated: boolean;
  parseErrors: number;
  totalRows: number | null;
  query?: string;
  totalMatches?: number;
  totalScanned?: number;
  rowLineNumbers?: number[];
}

export interface ArchiveRowCountResult {
  path: string;
  filename: string;
  bytes: number | null;
  rowCount: number;
  parseErrors: number;
}

export interface ArchivePolicy {
  retentionDays: number;
  autoDeleteEnabled: boolean;
  trashGraceDays: number;
  trashWarnFileCount: number;
  trashWarnBytes: number;
}

export type ArchiveRetentionDaysSource = "admin" | "env" | "default";

export interface ArchiveStats {
  policy: ArchivePolicy;
  defaultRetentionDays: number;
  defaultAutoDeleteEnabled: boolean;
  totalFiles: number;
  totalBytes: number;
  oldestFileAgeDays: number | null;
  expiredFileCount: number;
  expiredBytes: number;
  nextExpiryBatch: {
    withinDays: number;
    fileCount: number;
    totalBytes: number;
    earliestExpiryIso: string | null;
  };
  lastCleanup: {
    startedAt: string;
    deletedFiles: number;
    candidateFiles: number;
    bytesDeleted: number;
    trigger: string;
    dryRun: boolean;
    skippedReason: string | null;
    errors: Array<{ path: string; error: string }>;
  } | null;
  cleanupRunCount: number;
}

export interface ArchiveDeletionRow {
  deletionId: string;
  path: string;
  archiveTable: string;
  bytes: number;
  rowCount: number | null;
  archiveAgeDays: number;
  retentionDays: number;
  trigger: string;
  actor: string | null;
  deletedAt: string;
  trashPath: string | null;
  graceDays: number | null;
  purgedAt: string | null;
}

export function RetentionStat({
  label,
  value,
  sub,
  testid,
}: {
  label: string;
  value: string;
  sub?: string;
  testid: string;
}) {
  return (
    <div className="rounded border p-3" data-testid={testid}>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export interface EmailSchedule {
  scheduleId: string;
  enabled: boolean;
  cadence: "weekly" | "monthly";
  recipients: string[];
  platform: string | null;
  productionId: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  nextRunAt: string | null;
  updatedAt: string;
}

export interface EmailRun {
  runId: string;
  cadence: string;
  triggeredBy: string;
  isTest?: boolean;
  windowFrom: string;
  windowTo: string;
  recipients: string[];
  status: string;
  errorMessage: string | null;
  messageCount: number;
  decisionCount: number;
  commandCount: number;
  startedAt: string;
  completedAt: string | null;
}

/**
 * Task #560 — shared snooze controls for the two audit-email
 * failure-alert banners. Renders 1d / 1w / "until DATE" presets, the
 * current "snoozed until …" badge, and an Unsnooze button. Capped at
 * 90 days server-side; the input enforces 90d client-side too.
 */
export interface FailureAlertSnoozeHistoryEntry {
  id: string;
  alertKey: string;
  action: "set" | "cleared" | "expired";
  snoozeUntil: string | null;
  updatedBy: string | null;
  occurredAt: string;
}

export function FailureAlertSnoozeControls(props: {
  testIdPrefix: string;
  snoozeUntil: string | null;
  endpoint: string;
  invalidateKey: string;
  /**
   * Task #613 — optional URL of the snooze-history endpoint. When
   * provided, the control renders a "Past snooze actions (last N)" list
   * underneath the controls so compliance can audit who muted what
   * when. The query is invalidated after every snooze mutation.
   */
  historyEndpoint?: string;
}) {
  const { testIdPrefix, snoozeUntil, endpoint, invalidateKey, historyEndpoint } =
    props;
  const qc = useQueryClient();
  const [customDate, setCustomDate] = useState("");
  const [snoozeError, setSnoozeError] = useState<string | null>(null);

  const maxDate = useMemo(() => {
    const d = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  }, []);

  const mutation = useMutation({
    mutationFn: async (snoozeUntilIso: string | null) => {
      const res = await apiRequest("POST", endpoint, {
        snoozeUntil: snoozeUntilIso,
      });
      return (await res.json()) as {
        snooze: { snoozeUntil: string | null };
      };
    },
    onSuccess: () => {
      setSnoozeError(null);
      qc.invalidateQueries({ queryKey: [invalidateKey] });
      if (historyEndpoint) {
        qc.invalidateQueries({ queryKey: [historyEndpoint] });
      }
    },
    onError: (e: any) => setSnoozeError(e?.message ?? "snooze_failed"),
  });

  const historyQuery = useQuery<{ history: FailureAlertSnoozeHistoryEntry[] }>({
    queryKey: [historyEndpoint ?? ""],
    enabled: !!historyEndpoint,
    refetchInterval: historyEndpoint ? 60_000 : false,
  });
  const history = historyQuery.data?.history ?? [];

  const snoozeFor = (ms: number) => {
    const iso = new Date(Date.now() + ms).toISOString();
    mutation.mutate(iso);
  };

  const snoozeUntilDate = () => {
    if (!customDate) {
      setSnoozeError("Pick a date/time first");
      return;
    }
    const t = Date.parse(customDate);
    if (!Number.isFinite(t)) {
      setSnoozeError("Invalid date/time");
      return;
    }
    if (t <= Date.now()) {
      setSnoozeError("Date must be in the future");
      return;
    }
    mutation.mutate(new Date(t).toISOString());
  };

  const active = !!snoozeUntil && Date.parse(snoozeUntil) > Date.now();

  return (
    <div
      className="rounded border p-2 space-y-2 text-xs"
      data-testid={`${testIdPrefix}-snooze-controls`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium">Snooze alert</span>
        {active && (
          <Badge
            variant="destructive"
            data-testid={`${testIdPrefix}-snooze-active-badge`}
          >
            snoozed until {new Date(snoozeUntil!).toLocaleString()}
          </Badge>
        )}
        {!active && (
          <span className="text-muted-foreground">not snoozed</span>
        )}
      </div>
      <p className="text-muted-foreground">
        Mute this alert during a known outage without disabling the
        schedule. Auto-clears as soon as a successful run lands or the
        snooze expires. Capped at 90 days.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => snoozeFor(24 * 60 * 60 * 1000)}
          data-testid={`button-${testIdPrefix}-snooze-1d`}
        >
          Snooze 1 day
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => snoozeFor(7 * 24 * 60 * 60 * 1000)}
          data-testid={`button-${testIdPrefix}-snooze-1w`}
        >
          Snooze 1 week
        </Button>
        <Input
          type="datetime-local"
          value={customDate}
          max={maxDate}
          onChange={(e) => setCustomDate(e.target.value)}
          className="h-8 w-52"
          data-testid={`input-${testIdPrefix}-snooze-until`}
        />
        <Button
          size="sm"
          disabled={mutation.isPending || !customDate}
          onClick={snoozeUntilDate}
          data-testid={`button-${testIdPrefix}-snooze-until-date`}
        >
          Snooze until date
        </Button>
        {active && (
          <Button
            size="sm"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(null)}
            data-testid={`button-${testIdPrefix}-unsnooze`}
          >
            Unsnooze
          </Button>
        )}
        {snoozeError && (
          <span
            className="text-destructive"
            data-testid={`text-${testIdPrefix}-snooze-error`}
          >
            {snoozeError}
          </span>
        )}
      </div>
      {historyEndpoint && (
        <div
          className="pt-2 border-t space-y-1"
          data-testid={`${testIdPrefix}-snooze-history`}
        >
          <div className="text-[10px] uppercase text-muted-foreground">
            Past snooze actions (last {history.length || 10})
          </div>
          {history.length === 0 ? (
            <p
              className="text-muted-foreground"
              data-testid={`text-${testIdPrefix}-snooze-history-empty`}
            >
              No snooze actions recorded yet.
            </p>
          ) : (
            <div className="space-y-1">
              {history.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded border p-1.5 text-[11px]"
                  data-testid={`row-${testIdPrefix}-snooze-history-${row.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={
                        row.action === "set"
                          ? "default"
                          : row.action === "cleared"
                            ? "secondary"
                            : "outline"
                      }
                      data-testid={`badge-${testIdPrefix}-snooze-history-action-${row.id}`}
                    >
                      {row.action}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(row.occurredAt).toLocaleString()}
                    </span>
                    {row.snoozeUntil && (
                      <span
                        className="text-muted-foreground"
                        data-testid={`text-${testIdPrefix}-snooze-history-until-${row.id}`}
                      >
                        until {new Date(row.snoozeUntil).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-muted-foreground font-mono truncate max-w-[40%]"
                    data-testid={`text-${testIdPrefix}-snooze-history-by-${row.id}`}
                  >
                    {row.updatedBy ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
