/**
 * Audience moderation retention sweeper (Task #383, extended in Task #390).
 *
 * The four `audience_*` tables capture every audience message, safety
 * decision and moderation command for compliance audit. Without a
 * retention policy they grow forever and bloat Supabase. This service:
 *
 *   - Deletes (or archives) rows older than a configurable retention
 *     window (default 90 days) from `audience_messages`,
 *     `audience_safety_decisions`, and `audience_moderation_commands`.
 *   - NEVER touches `audience_channel_connectors` — those are operational
 *     state (registered platforms + permissions), not audit history.
 *   - Runs on a daily schedule when WORKER_ENABLED, and exposes a manual
 *     run + admin override knobs.
 *
 * Retention mode (Task #390):
 *   Each of the three audit tables has an independent mode:
 *     - `delete` (default, prior behaviour): rows hard-deleted from Postgres.
 *     - `archive`: rows are first serialized to a gzipped JSONL file in
 *       object storage (`PRIVATE_OBJECT_DIR/audience-archive/<table>/<ts>.jsonl.gz`)
 *       and only deleted from Postgres once the archive write succeeds.
 *   Mode is persisted in `system_settings` under `audience_retention_mode`
 *   as a JSON object `{ messages, decisions, commands }`. Env fallback:
 *   `AUDIENCE_RETENTION_MODE_<TABLE>` ∈ {delete, archive}.
 *
 * Window precedence (highest first):
 *   1. explicit `retentionDays` argument passed to `runRetentionSweep`
 *   2. admin override stored in `system_settings` under
 *      `audience_retention_days`
 *   3. env var `AUDIENCE_RETENTION_DAYS`
 *   4. default = 90 days
 *
 * Scheduler cadence comes from env `AUDIENCE_RETENTION_INTERVAL_HOURS`
 * (default 24). Initial delay is `AUDIENCE_RETENTION_INITIAL_DELAY_MS`
 * (default 5 minutes).
 */

import { and, desc, eq, lt, sql } from "drizzle-orm";
import { gzipSync, gunzipSync, createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import {
  audienceMessages,
  audienceSafetyDecisions,
  audienceModerationCommands,
  audienceRestoreLog,
  audienceArchiveDeletions,
  audienceArchiveTrashPurges,
  audienceRetentionStaleHistory,
  gatewayAlertSettingsAudit,
  type AudienceArchiveDeletionRow,
  type AudienceArchiveTrashPurgeRow,
} from "../../shared/omni-channel-audience-schema";
import { systemSettings, platformAlerts } from "@shared/schema";
import {
  audienceRetentionFailureAlertService,
  AUDIENCE_RETENTION_ALERT_TYPE,
} from "./audience-retention-failure-alert-service";
import {
  audienceRetentionStaleRowsAlertService,
  AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE,
  getEffectiveStaleRowsThresholds,
  pruneStaleRowsThresholdHistoryOlderThan,
  type StaleRowsThresholds,
} from "./audience-retention-stale-rows-alert-service";
import {
  audienceRestoreLogRateAlertService,
  getRestoreLogRateStats,
  pruneRestoreLogRateThresholdHistoryOlderThan,
  pruneRestoreLogRateWeakeningNotificationsOlderThan,
  type RestoreLogRateStats,
} from "./audience-restore-log-rate-alert-service";
import { pruneGatewayEventsOlderThan } from "./audience-gateway-event-log-service";
import { pruneLegacyTokenKillSwitchAuditOlderThan } from "./audience-legacy-token-kill-switch-audit-service";
import {
  pruneAuditExportNotificationsOlderThan as defaultPruneAuditExportNotificationsOlderThan,
  pruneAuditExportNotifierConfigHistoryOlderThan as defaultPruneAuditExportNotifierConfigHistoryOlderThan,
} from "./audience-audit-export-notifier";
import { pruneConnectorRotationNotificationsOlderThan as defaultPruneConnectorRotationNotificationsOlderThan } from "./audience-connector-rotation-notifier";
import { pruneLegacyTokenDispatchAlertsOlderThan as defaultPruneLegacyTokenDispatchAlertsOlderThan } from "./audience-legacy-token-dispatch-alert-service";
import { pruneAudienceArchiveDeletionSnoozeLogOlderThan as defaultPruneArchiveSnoozeLogOlderThan } from "./audience-archive-deletion-notifier";
import { pruneAuditEmailFailureAlertSnoozeHistoryOlderThan as defaultPruneAuditEmailSnoozeHistoryOlderThan } from "./audit-email-failure-alert-snooze";
import { pruneAudienceAuditHistoryEmailStaleSnoozeLogOlderThan as defaultPruneStaleSnoozeLogOlderThan } from "./audience-audit-history-email-stale-alert-service";
import { pruneFounderPtoSuppressionLogOlderThan as defaultPruneFounderPtoSuppressionLogOlderThan } from "./founder-pto-mode-service";
import {
  pruneFlappingConfigHistoryOlderThan as defaultPruneFlappingConfigHistoryOlderThan,
  pruneFlappingSnoozeLogOlderThan as defaultPruneFlappingSnoozeLogOlderThan,
  pruneSweepThresholdChangesOlderThan as defaultPruneSweepThresholdChangesOlderThan,
} from "./production-asset-orphan-alert-service";

// Task #488: indirected through a module-local binding so tests can inject a
// failing prune to exercise the failure-alert surface without mucking with
// the DB. Production code paths use the default import.
type AuditExportNotificationsPruner = (cutoff: Date) => Promise<number>;
let auditExportNotificationsPruner: AuditExportNotificationsPruner =
  defaultPruneAuditExportNotificationsOlderThan;
export function setAuditExportNotificationsPrunerForTests(
  fn: AuditExportNotificationsPruner,
): void {
  auditExportNotificationsPruner = fn;
}
export function resetAuditExportNotificationsPrunerForTests(): void {
  auditExportNotificationsPruner = defaultPruneAuditExportNotificationsOlderThan;
}

// Task #545: same injection pattern for the connector-rotation notifier
// history so tests can exercise failure paths without DB shenanigans.
type ConnectorRotationNotificationsPruner = (cutoff: Date) => Promise<number>;
let connectorRotationNotificationsPruner: ConnectorRotationNotificationsPruner =
  defaultPruneConnectorRotationNotificationsOlderThan;
export function setConnectorRotationNotificationsPrunerForTests(
  fn: ConnectorRotationNotificationsPruner,
): void {
  connectorRotationNotificationsPruner = fn;
}
export function resetConnectorRotationNotificationsPrunerForTests(): void {
  connectorRotationNotificationsPruner =
    defaultPruneConnectorRotationNotificationsOlderThan;
}

// Task #549: same indirection for legacy-token dispatch alert prune.
type LegacyTokenDispatchAlertsPruner = (cutoff: Date) => Promise<number>;
let legacyTokenDispatchAlertsPruner: LegacyTokenDispatchAlertsPruner =
  defaultPruneLegacyTokenDispatchAlertsOlderThan;
export function setLegacyTokenDispatchAlertsPrunerForTests(
  fn: LegacyTokenDispatchAlertsPruner,
): void {
  legacyTokenDispatchAlertsPruner = fn;
}
export function resetLegacyTokenDispatchAlertsPrunerForTests(): void {
  legacyTokenDispatchAlertsPruner = defaultPruneLegacyTokenDispatchAlertsOlderThan;
}

// Task #562: same injection pattern for the archive-deletion snooze-log
// retention so tests can exercise failure paths without DB shenanigans.
type ArchiveSnoozeLogPruner = (cutoff: Date) => Promise<number>;
let archiveSnoozeLogPruner: ArchiveSnoozeLogPruner =
  defaultPruneArchiveSnoozeLogOlderThan;
export function setArchiveSnoozeLogPrunerForTests(fn: ArchiveSnoozeLogPruner): void {
  archiveSnoozeLogPruner = fn;
}
export function resetArchiveSnoozeLogPrunerForTests(): void {
  archiveSnoozeLogPruner = defaultPruneArchiveSnoozeLogOlderThan;
}

// Task #728: same injection pattern for the audit-export notifier
// config-change history table so tests can exercise failure paths
// without DB shenanigans.
type AuditExportNotifierConfigHistoryPruner = (cutoff: Date) => Promise<number>;
let auditExportNotifierConfigHistoryPruner: AuditExportNotifierConfigHistoryPruner =
  defaultPruneAuditExportNotifierConfigHistoryOlderThan;
export function setAuditExportNotifierConfigHistoryPrunerForTests(
  fn: AuditExportNotifierConfigHistoryPruner,
): void {
  auditExportNotifierConfigHistoryPruner = fn;
}
export function resetAuditExportNotifierConfigHistoryPrunerForTests(): void {
  auditExportNotifierConfigHistoryPruner =
    defaultPruneAuditExportNotifierConfigHistoryOlderThan;
}

// Task #613: same injection pattern for the audit-email failure-alert
// snooze history table so tests can exercise failure paths without DB
// shenanigans.
type AuditEmailSnoozeHistoryPruner = (cutoff: Date) => Promise<number>;
let auditEmailSnoozeHistoryPruner: AuditEmailSnoozeHistoryPruner =
  defaultPruneAuditEmailSnoozeHistoryOlderThan;
export function setAuditEmailSnoozeHistoryPrunerForTests(
  fn: AuditEmailSnoozeHistoryPruner,
): void {
  auditEmailSnoozeHistoryPruner = fn;
}
export function resetAuditEmailSnoozeHistoryPrunerForTests(): void {
  auditEmailSnoozeHistoryPruner = defaultPruneAuditEmailSnoozeHistoryOlderThan;
}

// Task #692: same injection pattern for the audit-export history email
// stale-alert snooze-window log so tests can exercise failure paths
// without DB shenanigans.
type StaleSnoozeLogPruner = (cutoff: Date) => Promise<number>;
let staleSnoozeLogPruner: StaleSnoozeLogPruner =
  defaultPruneStaleSnoozeLogOlderThan;
export function setStaleSnoozeLogPrunerForTests(
  fn: StaleSnoozeLogPruner,
): void {
  staleSnoozeLogPruner = fn;
}
export function resetStaleSnoozeLogPrunerForTests(): void {
  staleSnoozeLogPruner = defaultPruneStaleSnoozeLogOlderThan;
}

// Task #621: same injection pattern for the founder PTO suppression log
// retention so tests can exercise failure paths without DB shenanigans.
type FounderPtoSuppressionLogPruner = (cutoff: Date) => Promise<number>;
let founderPtoSuppressionLogPruner: FounderPtoSuppressionLogPruner =
  defaultPruneFounderPtoSuppressionLogOlderThan;
export function setFounderPtoSuppressionLogPrunerForTests(
  fn: FounderPtoSuppressionLogPruner,
): void {
  founderPtoSuppressionLogPruner = fn;
}
export function resetFounderPtoSuppressionLogPrunerForTests(): void {
  founderPtoSuppressionLogPruner = defaultPruneFounderPtoSuppressionLogOlderThan;
}

// Task #840: same injection pattern for the two production-asset orphan
// sweep flapping audit tables (config-change history + snooze log) so
// tests can exercise failure paths without DB shenanigans.
type FlappingConfigHistoryPruner = (cutoff: Date) => Promise<number>;
let flappingConfigHistoryPruner: FlappingConfigHistoryPruner =
  defaultPruneFlappingConfigHistoryOlderThan;
export function setFlappingConfigHistoryPrunerForTests(
  fn: FlappingConfigHistoryPruner,
): void {
  flappingConfigHistoryPruner = fn;
}
export function resetFlappingConfigHistoryPrunerForTests(): void {
  flappingConfigHistoryPruner = defaultPruneFlappingConfigHistoryOlderThan;
}

type FlappingSnoozeLogPruner = (cutoff: Date) => Promise<number>;
let flappingSnoozeLogPruner: FlappingSnoozeLogPruner =
  defaultPruneFlappingSnoozeLogOlderThan;
export function setFlappingSnoozeLogPrunerForTests(
  fn: FlappingSnoozeLogPruner,
): void {
  flappingSnoozeLogPruner = fn;
}
export function resetFlappingSnoozeLogPrunerForTests(): void {
  flappingSnoozeLogPruner = defaultPruneFlappingSnoozeLogOlderThan;
}

// Task #850: same injection pattern for the orphan-sweep alert threshold
// change history table (Task #845) so tests can exercise failure paths
// without DB shenanigans.
type SweepThresholdChangesPruner = (cutoff: Date) => Promise<number>;
let sweepThresholdChangesPruner: SweepThresholdChangesPruner =
  defaultPruneSweepThresholdChangesOlderThan;
export function setSweepThresholdChangesPrunerForTests(
  fn: SweepThresholdChangesPruner,
): void {
  sweepThresholdChangesPruner = fn;
}
export function resetSweepThresholdChangesPrunerForTests(): void {
  sweepThresholdChangesPruner = defaultPruneSweepThresholdChangesOlderThan;
}

export const AUDIENCE_RETENTION_SETTING_KEY = "audience_retention_days";
export const AUDIENCE_RETENTION_MODE_SETTING_KEY = "audience_retention_mode";
export const AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY = "audience_archive_retention_policy";
export const AUDIENCE_RESTORE_LOG_RETENTION_SETTING_KEY = "audience_restore_log_retention_days";
export const DEFAULT_AUDIENCE_RETENTION_DAYS = 90;
export const DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS = 365;
export const DEFAULT_AUDIENCE_RESTORE_LOG_RETENTION_DAYS = 365;
export const ARCHIVE_EXPIRY_WARNING_DAYS = 7;
// Task #439: how long a soft-deleted archive file lingers under the
// `.trash/` prefix before the trash sweep hard-deletes it.
export const DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS = 7;
// Task #514: default thresholds for the recycle-bin "too large" warning.
// `0` for either knob disables that specific warning channel.
export const DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_FILES = 1000;
export const DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_BYTES = 1024 * 1024 * 1024; // 1 GiB
const MAX_AUDIENCE_ARCHIVE_TRASH_WARN_FILES = 10_000_000;
const MAX_AUDIENCE_ARCHIVE_TRASH_WARN_BYTES = 1024 * 1024 * 1024 * 1024; // 1 TiB
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;
const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_INITIAL_DELAY_MS = 5 * 60 * 1000;
export const DEFAULT_AUDIENCE_ARCHIVE_UPLOAD_RETRIES = 3;
export const DEFAULT_AUDIENCE_ARCHIVE_UPLOAD_RETRY_BACKOFF_MS = 250;

export type RetentionMode = "delete" | "archive";
export type AudienceRetentionTable = "messages" | "decisions" | "commands";
export type AudienceRetentionModeConfig = Record<AudienceRetentionTable, RetentionMode>;

export const DEFAULT_AUDIENCE_RETENTION_MODE: AudienceRetentionModeConfig = {
  messages: "delete",
  decisions: "delete",
  commands: "delete",
};

export interface AudienceArchiveFile {
  table: AudienceRetentionTable;
  path: string;
  rowCount: number;
  bytes: number;
}

export interface AudienceRetentionSweepResult {
  startedAt: string;
  finishedAt: string;
  retentionDays: number;
  cutoffIso: string;
  mode: AudienceRetentionModeConfig;
  messagesPruned: number;
  decisionsPruned: number;
  commandsPruned: number;
  gatewayEventsPruned: number;
  /**
   * Task #488 — number of rows pruned from `audience_audit_export_notifications`
   * on this sweep. The prune runs on the same audit-window cadence so the
   * history table can never grow without bound; surfacing the count mirrors
   * `gatewayEventsPruned` / `restoreLogPruned` so the founder can see the
   * sweep is actually doing its job.
   */
  notificationHistoryPruned: number;
  /**
   * Task #545 — number of rows pruned from
   * `audience_connector_rotation_notifications` on this sweep. Same
   * audit-window cadence as `notificationHistoryPruned`; surfaced so
   * the Retention Mode admin card can show the prune is running.
   */
  connectorRotationHistoryPruned: number;
  /**
   * Task #549 — number of rows pruned from
   * `audience_legacy_token_dispatch_alerts` on this sweep using the same
   * audit-window cadence. Mirrors `notificationHistoryPruned` so the
   * Retention Mode card can show whether the legacy-token alert history
   * is actually being aged out.
   */
  legacyTokenAlertHistoryPruned: number;
  /**
   * Task #490 — number of rows pruned from `gateway_alert_settings_audit`
   * on this sweep using the same audience retention window. Each save /
   * reset of the omni-channel audience alert thresholds writes a row
   * there; without this prune the audit table grows forever.
   */
  thresholdAuditRowsPruned: number;
  messagesArchived: number;
  decisionsArchived: number;
  commandsArchived: number;
  totalPruned: number;
  totalArchived: number;
  archiveFiles: AudienceArchiveFile[];
  /**
   * Task #435 — number of rows pruned from `audience_restore_log` on this
   * sweep using the (typically longer) restore-log retention window.
   */
  restoreLogPruned: number;
  /** Cutoff timestamp used for the restore-log prune on this sweep. */
  restoreLogCutoffIso: string;
  /** Effective restore-log retention window in days used by this sweep. */
  restoreLogRetentionDays: number;
  trigger: "scheduled" | "manual" | "cli";
  error: string | null;
}

export interface AudienceRetentionStats {
  retentionDays: number;
  defaultRetentionDays: number;
  override: number | null;
  envFallback: number | null;
  mode: AudienceRetentionModeConfig;
  modeOverride: Partial<AudienceRetentionModeConfig> | null;
  intervalHours: number;
  schedulerRunning: boolean;
  lastRun: AudienceRetentionSweepResult | null;
  totalRowsPruned: number;
  /**
   * Task #461 — running total of rows pruned from
   * `audience_gateway_events` across all sweeps in this process. Already
   * included in `totalRowsPruned`, but surfaced separately so the
   * Retention Mode card can show how much gateway-event history is
   * being aged out.
   */
  totalGatewayEventsPruned: number;
  /**
   * Task #565 — running total of rows pruned from
   * `gateway_alert_settings_audit` across all sweeps in this process.
   * Already included in `totalRowsPruned` via the per-table prune path,
   * but surfaced separately so the Retention Mode card can show how
   * much threshold-edit audit history is being aged out without
   * forcing founders to read server logs.
   */
  totalThresholdAuditPruned: number;
  totalRowsArchived: number;
  totalArchiveFiles: number;
  runCount: number;
  /**
   * Task #442 — number of in-process retry attempts the archive uploader
   * has needed since process start (i.e. attempts past the first one that
   * eventually either succeeded or failed). A non-zero value here means
   * the storage backend is starting to flake and ops should investigate
   * before the retry budget is exhausted.
   */
  archiveUploadRetryCount: number;
  /**
   * Task #442 — number of archive uploads that exhausted every retry and
   * ultimately failed. Each one corresponds to a founder alert.
   */
  archiveUploadFinalFailureCount: number;
  /**
   * Task #418 — per-table count of audit rows that are already older than
   * the current retention window but still sitting in Postgres. When the
   * silent-failure alert is active these numbers tell admins exactly how
   * many messages / decisions / commands are still waiting for a
   * successful archive (or hard-prune) so they can judge urgency.
   */
  stalePendingArchive: Record<AudienceRetentionTable, number>;
  /** Whether an `audience_retention_sweep_failure` alert is currently open. */
  alertActive: boolean;
  /**
   * Task #469 — whether an `audience_retention_stale_rows_backlog` alert is
   * currently open. Mirrors `alertActive` so the Retention Mode card can
   * show admins at a glance whether the backlog-email they received is
   * still open or has already auto-resolved.
   */
  staleRowsAlertActive: boolean;
  /**
   * Task #469 — effective per-table stale-pending-archive thresholds used
   * by the backlog alert. Surfacing them on the dashboard lets admins
   * compare the current `stalePendingArchive` counts against the limit
   * that would re-fire the alert without opening the alert config.
   */
  staleRowsThresholds: StaleRowsThresholds;
  /**
   * Task #435 — effective retention window for the persistent
   * `audience_restore_log` audit table (typically longer than the audit
   * windows so regulators retain plenty of restore history).
   */
  restoreLogRetentionDays: number;
  defaultRestoreLogRetentionDays: number;
  restoreLogRetentionOverride: number | null;
  restoreLogRetentionEnvFallback: number | null;
  /** Total restore-log rows pruned across all sweeps in this process. */
  totalRestoreLogPruned: number;
  /** Current row count in `audience_restore_log` (for the dashboard). */
  restoreLogRowCount: number;
  /**
   * Task #441 — last N samples of the per-table stale-pending counter
   * (one row per completed sweep, oldest-first). Lets the Retention Mode
   * card draw a sparkline + trend arrow so admins can tell whether the
   * backlog is shrinking (catching up) or growing (failure still
   * ongoing) at a glance.
   */
  stalePendingHistory: AudienceStalePendingHistoryEntry[];
  /**
   * Task #470 — current per-UTC-day insert rate into
   * `audience_restore_log` plus the configured rate threshold. Lets
   * the admin dashboard surface "X / Y restores today" near the
   * restore-log card and flag when an open rate-spike alert exists.
   */
  restoreLogRate: RestoreLogRateStats;
}

export interface AudienceStalePendingHistoryEntry {
  recordedAt: string;
  retentionDays: number;
  messages: number;
  decisions: number;
  commands: number;
  trigger: AudienceRetentionSweepResult["trigger"];
  error: string | null;
}

export const AUDIENCE_STALE_HISTORY_DEFAULT_LIMIT = 10;
export const AUDIENCE_STALE_HISTORY_MAX_LIMIT = 100;

/**
 * Task #486 — Per-table trend summary derived from
 * `audience_retention_stale_history`. Used to surface the stale-pending
 * backlog direction on founder-facing surfaces (Workday dashboard,
 * retention failure alert email) without requiring callers to redo the
 * sparkline math.
 */
export type StalePendingTrendDirection = "growing" | "shrinking" | "flat" | "unknown";

export interface StalePendingTableTrend {
  current: number;
  previous: number | null;
  delta: number | null;
  direction: StalePendingTrendDirection;
  arrow: "up" | "down" | "flat" | "none";
  /**
   * Task #544 — number of consecutive sweeps (ending at the latest
   * sample) where the stale-pending counter for this table grew vs.
   * the previous sample. A single bad sweep then a clean one yields
   * 0; three growing sweeps in a row yields 3. Used by the founder
   * Workday "growing for many sweeps in a row" actionable + the
   * retention failure alert email.
   */
  consecutiveGrowthStreak: number;
}

export interface StalePendingTrendSummary {
  sampleCount: number;
  latestRecordedAt: string | null;
  tables: {
    messages: StalePendingTableTrend;
    decisions: StalePendingTableTrend;
    commands: StalePendingTableTrend;
  };
}

function consecutiveGrowthStreak(series: number[]): number {
  let streak = 0;
  for (let i = series.length - 1; i > 0; i--) {
    if (series[i] > series[i - 1]) streak++;
    else break;
  }
  return streak;
}

function makeTrend(series: number[]): StalePendingTableTrend {
  if (series.length === 0) {
    return {
      current: 0,
      previous: null,
      delta: null,
      direction: "unknown",
      arrow: "none",
      consecutiveGrowthStreak: 0,
    };
  }
  const current = series[series.length - 1];
  const streak = consecutiveGrowthStreak(series);
  if (series.length < 2) {
    return {
      current,
      previous: null,
      delta: null,
      direction: "unknown",
      arrow: "none",
      consecutiveGrowthStreak: streak,
    };
  }
  const previous = series[series.length - 2];
  const delta = current - previous;
  if (delta > 0)
    return {
      current,
      previous,
      delta,
      direction: "growing",
      arrow: "up",
      consecutiveGrowthStreak: streak,
    };
  if (delta < 0)
    return {
      current,
      previous,
      delta,
      direction: "shrinking",
      arrow: "down",
      consecutiveGrowthStreak: streak,
    };
  return {
    current,
    previous,
    delta,
    direction: "flat",
    arrow: "flat",
    consecutiveGrowthStreak: streak,
  };
}

/**
 * Task #544 — minimum number of consecutive growing sweeps before the
 * Workday dashboard / founder-facing surfaces flag a sustained
 * stale-pending backlog. Default 3; configurable via env so a noisy
 * environment can dial it up.
 */
export const DEFAULT_AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD = 3;

export function audienceRetentionGrowthStreakThreshold(): number {
  const raw = Number(process.env.AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return DEFAULT_AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD;
}

export function summarizeStalePendingTrend(
  history: AudienceStalePendingHistoryEntry[],
): StalePendingTrendSummary {
  return {
    sampleCount: history.length,
    latestRecordedAt: history.length > 0 ? history[history.length - 1].recordedAt : null,
    tables: {
      messages: makeTrend(history.map((h) => h.messages)),
      decisions: makeTrend(history.map((h) => h.decisions)),
      commands: makeTrend(history.map((h) => h.commands)),
    },
  };
}

let lastRun: AudienceRetentionSweepResult | null = null;
let totalRowsPruned = 0;
let totalGatewayEventsPruned = 0;
let totalThresholdAuditPruned = 0;
let totalRowsArchived = 0;
let totalArchiveFiles = 0;
let totalRestoreLogPruned = 0;
let runCount = 0;
let archiveUploadRetryCount = 0;
let archiveUploadFinalFailureCount = 0;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let initialTimerHandle: ReturnType<typeof setTimeout> | null = null;
let running = false;

function envRetentionDays(): number | null {
  const raw = Number(process.env.AUDIENCE_RETENTION_DAYS);
  if (!Number.isFinite(raw)) return null;
  return clampRetention(raw);
}

function envRestoreLogRetentionDays(): number | null {
  const raw = Number(process.env.AUDIENCE_RESTORE_LOG_RETENTION_DAYS);
  if (!Number.isFinite(raw)) return null;
  return clampRetention(raw);
}

function clampRetention(n: number): number {
  const x = Math.floor(n);
  if (x < MIN_RETENTION_DAYS) return MIN_RETENTION_DAYS;
  if (x > MAX_RETENTION_DAYS) return MAX_RETENTION_DAYS;
  return x;
}

function intervalHours(): number {
  const raw = Number(process.env.AUDIENCE_RETENTION_INTERVAL_HOURS);
  if (Number.isFinite(raw) && raw >= 1) return raw;
  return DEFAULT_INTERVAL_HOURS;
}

function initialDelayMs(): number {
  const raw = Number(process.env.AUDIENCE_RETENTION_INITIAL_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_INITIAL_DELAY_MS;
}

function parseMode(v: unknown): RetentionMode | null {
  if (v === "delete" || v === "archive") return v;
  return null;
}

function envModeFor(table: AudienceRetentionTable): RetentionMode | null {
  const key = `AUDIENCE_RETENTION_MODE_${table.toUpperCase()}`;
  return parseMode(process.env[key]);
}

async function readOverrideDays(): Promise<number | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_RETENTION_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) return null;
    const n = Number(rows[0].value);
    if (!Number.isFinite(n)) return null;
    return clampRetention(n);
  } catch {
    return null;
  }
}

async function readModeOverride(): Promise<Partial<AudienceRetentionModeConfig> | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_RETENTION_MODE_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) return null;
    const parsed = JSON.parse(rows[0].value);
    if (!parsed || typeof parsed !== "object") return null;
    const out: Partial<AudienceRetentionModeConfig> = {};
    for (const t of ["messages", "decisions", "commands"] as const) {
      const m = parseMode((parsed as any)[t]);
      if (m) out[t] = m;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function getEffectiveRetentionMode(): Promise<{
  mode: AudienceRetentionModeConfig;
  modeOverride: Partial<AudienceRetentionModeConfig> | null;
}> {
  const override = await readModeOverride();
  const mode: AudienceRetentionModeConfig = { ...DEFAULT_AUDIENCE_RETENTION_MODE };
  for (const t of ["messages", "decisions", "commands"] as const) {
    const fromOverride = override?.[t];
    const fromEnv = envModeFor(t);
    mode[t] = fromOverride ?? fromEnv ?? DEFAULT_AUDIENCE_RETENTION_MODE[t];
  }
  return { mode, modeOverride: override };
}

export async function setRetentionMode(
  partial: Partial<AudienceRetentionModeConfig> | null,
  updatedBy?: string,
): Promise<{ mode: AudienceRetentionModeConfig; modeOverride: Partial<AudienceRetentionModeConfig> | null }> {
  if (partial === null) {
    await db.delete(systemSettings).where(eq(systemSettings.key, AUDIENCE_RETENTION_MODE_SETTING_KEY));
  } else {
    const cleaned: Partial<AudienceRetentionModeConfig> = {};
    for (const t of ["messages", "decisions", "commands"] as const) {
      const m = parseMode(partial[t]);
      if (m) cleaned[t] = m;
    }
    const stored = JSON.stringify(cleaned);
    await db
      .insert(systemSettings)
      .values({ key: AUDIENCE_RETENTION_MODE_SETTING_KEY, value: stored, updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: stored, updatedBy, updatedAt: new Date() },
      });
  }
  return getEffectiveRetentionMode();
}

export async function getEffectiveRetentionDays(): Promise<{
  retentionDays: number;
  override: number | null;
  envFallback: number | null;
}> {
  const override = await readOverrideDays();
  const envFallback = envRetentionDays();
  const retentionDays = override ?? envFallback ?? DEFAULT_AUDIENCE_RETENTION_DAYS;
  return { retentionDays, override, envFallback };
}

async function readRestoreLogOverrideDays(): Promise<number | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_RESTORE_LOG_RETENTION_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) return null;
    const n = Number(rows[0].value);
    if (!Number.isFinite(n)) return null;
    return clampRetention(n);
  } catch {
    return null;
  }
}

export async function getEffectiveRestoreLogRetentionDays(): Promise<{
  retentionDays: number;
  override: number | null;
  envFallback: number | null;
}> {
  const override = await readRestoreLogOverrideDays();
  const envFallback = envRestoreLogRetentionDays();
  const retentionDays = override ?? envFallback ?? DEFAULT_AUDIENCE_RESTORE_LOG_RETENTION_DAYS;
  return { retentionDays, override, envFallback };
}

export async function setRestoreLogRetentionOverride(
  value: number | null,
  updatedBy?: string,
): Promise<{ retentionDays: number; override: number | null; envFallback: number | null }> {
  if (value === null) {
    await db
      .delete(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_RESTORE_LOG_RETENTION_SETTING_KEY));
  } else {
    const stored = String(clampRetention(value));
    await db
      .insert(systemSettings)
      .values({ key: AUDIENCE_RESTORE_LOG_RETENTION_SETTING_KEY, value: stored, updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: stored, updatedBy, updatedAt: new Date() },
      });
  }
  return getEffectiveRestoreLogRetentionDays();
}

export async function setRetentionOverride(
  value: number | null,
  updatedBy?: string,
): Promise<{ retentionDays: number; override: number | null; envFallback: number | null }> {
  if (value === null) {
    await db.delete(systemSettings).where(eq(systemSettings.key, AUDIENCE_RETENTION_SETTING_KEY));
  } else {
    const stored = String(clampRetention(value));
    await db
      .insert(systemSettings)
      .values({ key: AUDIENCE_RETENTION_SETTING_KEY, value: stored, updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: stored, updatedBy, updatedAt: new Date() },
      });
  }
  return getEffectiveRetentionDays();
}

/* --------------------------------------------------------------------- */
/* Archive writer                                                         */
/* --------------------------------------------------------------------- */

export interface AudienceArchiveWriter {
  /**
   * Persist a gzipped JSONL payload for a given audit table to durable
   * storage. Implementations must throw on failure so the caller can skip
   * the subsequent DELETE and keep the rows intact for the next sweep.
   * Returns the absolute storage path that was written.
   */
  write(
    table: AudienceRetentionTable,
    gzippedJsonl: Buffer,
    meta: { rowCount: number; cutoffIso: string; sweepStartedAt: string },
  ): Promise<string>;
}

export interface AudienceArchiveListing {
  table: AudienceRetentionTable;
  path: string;
  bytes: number;
  rowCount: number | null;
  updatedAt: string | null;
  sweepStartedAt: string | null;
  cutoffIso: string | null;
}

export interface AudienceArchiveStream {
  stream: NodeJS.ReadableStream;
  bytes: number | null;
  contentType: string;
  filename: string;
}

export interface AudienceArchiveReader {
  /** List every archive file currently stored under `audience-archive/`. */
  list(): Promise<AudienceArchiveListing[]>;
  /** Open a read stream for a single archive file by its absolute path. */
  openStream(path: string): Promise<AudienceArchiveStream>;
  /**
   * Fetch the gzipped JSONL payload for a previously-archived audit
   * table from durable storage. Implementations must throw on failure
   * so the restore endpoint can surface the error to the operator.
   */
  read(objectPath: string): Promise<Buffer>;
  /**
   * Permanently delete an archive file by its absolute path. MUST throw
   * on failure so the caller can skip the audit-log write and surface
   * the error to the founder.
   */
  delete(path: string): Promise<void>;
  /**
   * Task #439: rename / move an archive file from one absolute path to
   * another. Used by `runArchiveCleanup` to soft-delete files into
   * `audience-archive/.trash/<deletionId>/` for a configurable grace
   * window, and by `restoreFromTrashDeletion` to move them back.
   * Implementations MUST throw on failure so the caller can leave the
   * audit row untouched and surface the error to the founder.
   */
  move(srcPath: string, dstPath: string): Promise<void>;
}

let archiveWriter: AudienceArchiveWriter = createDefaultArchiveWriter();
let archiveReader: AudienceArchiveReader = createDefaultArchiveReader();

export function setAudienceArchiveWriter(writer: AudienceArchiveWriter): void {
  archiveWriter = writer;
}

export function resetAudienceArchiveWriter(): void {
  archiveWriter = createDefaultArchiveWriter();
}

export function setAudienceArchiveReader(reader: AudienceArchiveReader): void {
  archiveReader = reader;
}

export function resetAudienceArchiveReader(): void {
  archiveReader = createDefaultArchiveReader();
}

export async function listAudienceArchiveFiles(): Promise<AudienceArchiveListing[]> {
  return archiveReader.list();
}

export async function openAudienceArchiveStream(path: string): Promise<AudienceArchiveStream> {
  return archiveReader.openStream(path);
}


export interface AudienceArchivePreview {
  path: string;
  filename: string;
  bytes: number | null;
  contentType: string;
  maxRows: number;
  offset: number;
  rows: unknown[];
  truncated: boolean;
  parseErrors: number;
  /**
   * When the preview call reaches the end of the gzip without hitting
   * the row cap, we know the file's total row count for free: it is
   * `offset + rows.length`. This is surfaced as `totalRows` so the
   * admin UI can show "Showing rows N–M of TOTAL" without an extra
   * round-trip to the count endpoint. `null` when the call was
   * truncated and the true total is still unknown.
   */
  totalRows: number | null;
  /** Present only when invoked with a `query`; identifies search-mode response. */
  query?: string;
  /** Total matching rows in the whole file (search mode). */
  totalMatches?: number;
  /** Total non-blank lines scanned across the whole file (search mode). */
  totalScanned?: number;
  /** Original 1-indexed file line number for each returned row (search mode). */
  rowLineNumbers?: number[];
}

export interface AudienceArchiveRowCount {
  path: string;
  filename: string;
  bytes: number | null;
  rowCount: number;
  parseErrors: number;
}

export interface PreviewAudienceArchiveOptions {
  offset?: number;
  query?: string;
}

/**
 * Open a gzipped JSONL archive file, decode up to `maxRows` lines and
 * return them as a JSON-friendly array. Used by the admin "preview"
 * route so root admins can sanity-check an archive (during a regulator
 * request, for example) without downloading and gunzipping it locally.
 *
 * The underlying read stream is destroyed as soon as the row cap is
 * reached so we never decompress more than necessary.
 *
 * When `query` is provided (Task #446), the entire gzip is streamed and
 * only rows whose raw JSON contains the (case-insensitive) substring
 * are returned, capped at `maxRows`. The response then also includes
 * `totalMatches`, `totalScanned`, and `rowLineNumbers` so admins can
 * answer "does this 50k-row archive mention author X?" in a single
 * request instead of paging through it manually.
 */
export async function previewAudienceArchive(
  path: string,
  maxRows: number,
  offsetOrOptions: number | PreviewAudienceArchiveOptions = 0,
): Promise<AudienceArchivePreview> {
  const opts: PreviewAudienceArchiveOptions =
    typeof offsetOrOptions === "number" ? { offset: offsetOrOptions } : offsetOrOptions;
  const safeOffset =
    Number.isFinite(opts.offset) && (opts.offset as number) > 0 ? Math.floor(opts.offset as number) : 0;
  const rawQuery = typeof opts.query === "string" ? opts.query : "";
  const trimmedQuery = rawQuery.trim();
  const searchMode = trimmedQuery.length > 0;
  const needle = trimmedQuery.toLowerCase();

  const opened = await archiveReader.openStream(path);
  const gunzip = createGunzip();
  const rl = createInterface({ input: opened.stream.pipe(gunzip) });
  const rows: unknown[] = [];
  const rowLineNumbers: number[] = [];
  let truncated = false;
  let parseErrors = 0;
  let skipped = 0;
  let totalMatches = 0;
  let totalScanned = 0;
  let lineNumber = 0;
  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      lineNumber++;
      totalScanned++;
      if (searchMode) {
        if (!line.toLowerCase().includes(needle)) continue;
        totalMatches++;
        if (rows.length >= maxRows) {
          truncated = true;
          // keep scanning so totalMatches is accurate across the whole file
          continue;
        }
        try {
          rows.push(JSON.parse(line));
        } catch {
          parseErrors++;
          rows.push({ _parseError: true, raw: line });
        }
        rowLineNumbers.push(lineNumber);
      } else {
        if (skipped < safeOffset) {
          skipped++;
          continue;
        }
        if (rows.length >= maxRows) {
          truncated = true;
          break;
        }
        try {
          rows.push(JSON.parse(line));
        } catch {
          parseErrors++;
          rows.push({ _parseError: true, raw: line });
        }
      }
    }
  } finally {
    rl.close();
    const stream = opened.stream as NodeJS.ReadableStream & { destroy?: () => void };
    if (typeof stream.destroy === "function") stream.destroy();
    if (typeof (gunzip as any).destroy === "function") (gunzip as any).destroy();
  }
  const base: AudienceArchivePreview = {
    path,
    filename: opened.filename,
    bytes: opened.bytes,
    contentType: opened.contentType,
    maxRows,
    offset: searchMode ? 0 : safeOffset,
    rows,
    truncated,
    parseErrors,
    // In search mode we always stream the full file (no offset paging),
    // so `totalScanned` is the authoritative full row count. Otherwise
    // we only know the total when the call reached EOF without hitting
    // the cap.
    totalRows: searchMode
      ? totalScanned
      : truncated
        ? null
        : safeOffset + rows.length,
  };
  if (searchMode) {
    base.query = trimmedQuery;
    base.totalMatches = totalMatches;
    base.totalScanned = totalScanned;
    base.rowLineNumbers = rowLineNumbers;
  }
  return base;
}

export interface AudienceArchiveSearchExportResult {
  path: string;
  filename: string;
  bytes: number | null;
  query: string;
  totalMatches: number;
  totalScanned: number;
  parseErrors: number;
}

/**
 * Stream a gzipped JSONL archive end-to-end, filter rows whose raw JSON
 * (case-insensitive) contains the given search query, and emit a CSV row
 * for every match via the `onRow` callback. The callback is awaited so
 * the caller can backpressure against an HTTP response stream.
 *
 * Used by Task #484 — "Download matches as CSV" on the preview modal.
 * Returns the totals so the route can write an audit-export log entry.
 *
 * CSV schema: `line_number,payload` where `payload` is the original
 * (untouched) JSON line from the archive. RFC-4180 quoting is applied
 * to the payload only — line_number is always a bare integer.
 */
export async function streamAudienceArchiveSearchMatchesCsv(
  path: string,
  query: string,
  onRow: (csvRow: string) => void | Promise<void>,
): Promise<AudienceArchiveSearchExportResult> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error("query_required");
  }
  const needle = trimmed.toLowerCase();
  const opened = await archiveReader.openStream(path);
  const gunzip = createGunzip();
  const rl = createInterface({ input: opened.stream.pipe(gunzip) });
  let totalMatches = 0;
  let totalScanned = 0;
  let parseErrors = 0;
  let lineNumber = 0;
  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      lineNumber++;
      totalScanned++;
      if (!line.toLowerCase().includes(needle)) continue;
      totalMatches++;
      try {
        // validate JSON so we can flag corrupt rows without skipping them
        JSON.parse(line);
      } catch {
        parseErrors++;
      }
      const escaped = `"${line.replace(/"/g, '""')}"`;
      await onRow(`${lineNumber},${escaped}\n`);
    }
  } finally {
    rl.close();
    const stream = opened.stream as NodeJS.ReadableStream & { destroy?: () => void };
    if (typeof stream.destroy === "function") stream.destroy();
    if (typeof (gunzip as any).destroy === "function") (gunzip as any).destroy();
  }
  return {
    path,
    filename: opened.filename,
    bytes: opened.bytes,
    query: trimmed,
    totalMatches,
    totalScanned,
    parseErrors,
  };
}

/**
 * Stream a gzipped JSONL archive end-to-end and return the total number
 * of non-empty (newline-delimited) JSON rows it contains. Used by the
 * admin "preview" modal when the file's row count is not known from
 * object-storage metadata (older archives, or archives uploaded by a
 * sweep that did not stamp `rowCount`). The stream is consumed exactly
 * once and discarded — we do not buffer any of the row payloads.
 */
export async function countAudienceArchiveRows(
  path: string,
): Promise<AudienceArchiveRowCount> {
  const opened = await archiveReader.openStream(path);
  const gunzip = createGunzip();
  const rl = createInterface({ input: opened.stream.pipe(gunzip) });
  let rowCount = 0;
  let parseErrors = 0;
  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      rowCount++;
      // Validate just enough to flag corrupt lines, but don't keep the
      // parsed value around — the goal is a count, not a payload dump.
      try {
        JSON.parse(line);
      } catch {
        parseErrors++;
      }
    }
  } finally {
    rl.close();
    const stream = opened.stream as NodeJS.ReadableStream & { destroy?: () => void };
    if (typeof stream.destroy === "function") stream.destroy();
    if (typeof (gunzip as any).destroy === "function") (gunzip as any).destroy();
  }
  return {
    path,
    filename: opened.filename,
    bytes: opened.bytes,
    rowCount,
    parseErrors,
  };
}


/* --------------------------------------------------------------------- */
/* Archive retention policy (Task #413)                                   */
/*                                                                        */
/*   The audit-table retention sweep above controls how long rows stay   */
/*   in Postgres. When a sweep runs in `archive` mode it writes a       */
/*   gzipped JSONL copy of those rows to                                 */
/*   `PRIVATE_OBJECT_DIR/audience-archive/<table>/<ts>.jsonl.gz`. With  */
/*   no policy those archive files accumulate forever and slowly bloat  */
/*   object storage. This block adds:                                    */
/*                                                                        */
/*     - An admin-configurable "delete archive files older than N days" */
/*       knob (default 365), with an opt-out switch.                     */
/*     - A daily cleanup job that lists archive files and permanently   */
/*       deletes ones past the window, writing an audit row per         */
/*       deletion.                                                       */
/*     - Stats for the dashboard: total bytes used, total file count,   */
/*       and the next expiry batch (files due to be removed within     */
/*       `ARCHIVE_EXPIRY_WARNING_DAYS` days).                            */
/*                                                                        */
/*   Policy is persisted in `system_settings` under                     */
/*   `audience_archive_retention_policy` as JSON:                        */
/*     `{ retentionDays: number, autoDeleteEnabled: boolean }`           */
/* --------------------------------------------------------------------- */

export interface AudienceArchiveRetentionPolicy {
  retentionDays: number;
  autoDeleteEnabled: boolean;
  /**
   * Task #476 — how long a soft-deleted archive file lingers under
   * `.trash/<deletionId>/` before the trash sweep hard-deletes it. When
   * unset, falls back to `AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS` env var or
   * `DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS`.
   */
  trashGraceDays: number;
  /**
   * Task #514 — admin-configurable threshold for the recycle-bin
   * "too large" warning. When the number of files currently sitting in
   * `.trash/` (pending purge) exceeds this value, the admin dashboard
   * renders an amber warning banner. Set to `0` to disable the
   * file-count warning channel.
   */
  trashWarnFileCount: number;
  /**
   * Task #514 — sibling of `trashWarnFileCount` but in bytes. Set to
   * `0` to disable the byte-size warning channel.
   */
  trashWarnBytes: number;
}

export const DEFAULT_AUDIENCE_ARCHIVE_RETENTION_POLICY: AudienceArchiveRetentionPolicy = {
  retentionDays: DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS,
  autoDeleteEnabled: true,
  trashGraceDays: DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS,
  trashWarnFileCount: DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_FILES,
  trashWarnBytes: DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_BYTES,
};

function clampTrashWarnFiles(n: number): number {
  const x = Math.floor(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x > MAX_AUDIENCE_ARCHIVE_TRASH_WARN_FILES) return MAX_AUDIENCE_ARCHIVE_TRASH_WARN_FILES;
  return x;
}

function clampTrashWarnBytes(n: number): number {
  const x = Math.floor(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x > MAX_AUDIENCE_ARCHIVE_TRASH_WARN_BYTES) return MAX_AUDIENCE_ARCHIVE_TRASH_WARN_BYTES;
  return x;
}

export interface AudienceArchiveCleanupDeletion {
  deletionId: string;
  path: string;
  archiveTable: AudienceRetentionTable;
  bytes: number;
  rowCount: number | null;
  archiveAgeDays: number;
}

export interface AudienceArchiveCleanupResult {
  startedAt: string;
  finishedAt: string;
  retentionDays: number;
  cutoffIso: string;
  autoDeleteEnabled: boolean;
  dryRun: boolean;
  trigger: "scheduled" | "manual" | "cli";
  candidateFiles: number;
  deletedFiles: number;
  bytesDeleted: number;
  deletions: AudienceArchiveCleanupDeletion[];
  errors: Array<{ path: string; error: string }>;
  skippedReason: "auto_delete_disabled" | null;
}

export interface AudienceArchiveNextExpiryBatch {
  withinDays: number;
  fileCount: number;
  totalBytes: number;
  earliestExpiryIso: string | null;
}

export interface AudienceArchiveStats {
  policy: AudienceArchiveRetentionPolicy;
  defaultRetentionDays: number;
  defaultAutoDeleteEnabled: boolean;
  totalFiles: number;
  totalBytes: number;
  oldestFileAgeDays: number | null;
  expiredFileCount: number;
  expiredBytes: number;
  nextExpiryBatch: AudienceArchiveNextExpiryBatch;
  lastCleanup: AudienceArchiveCleanupResult | null;
  cleanupRunCount: number;
}

let lastArchiveCleanup: AudienceArchiveCleanupResult | null = null;
let archiveCleanupRunCount = 0;

async function readArchivePolicyRaw(): Promise<Partial<AudienceArchiveRetentionPolicy> | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) return null;
    const parsed = JSON.parse(rows[0].value);
    if (!parsed || typeof parsed !== "object") return null;
    const out: Partial<AudienceArchiveRetentionPolicy> = {};
    if (typeof (parsed as any).retentionDays === "number" && Number.isFinite((parsed as any).retentionDays)) {
      out.retentionDays = clampRetention((parsed as any).retentionDays);
    }
    if (typeof (parsed as any).autoDeleteEnabled === "boolean") {
      out.autoDeleteEnabled = (parsed as any).autoDeleteEnabled;
    }
    if (
      typeof (parsed as any).trashGraceDays === "number" &&
      Number.isFinite((parsed as any).trashGraceDays)
    ) {
      out.trashGraceDays = clampRetention((parsed as any).trashGraceDays);
    }
    if (
      typeof (parsed as any).trashWarnFileCount === "number" &&
      Number.isFinite((parsed as any).trashWarnFileCount)
    ) {
      out.trashWarnFileCount = clampTrashWarnFiles((parsed as any).trashWarnFileCount);
    }
    if (
      typeof (parsed as any).trashWarnBytes === "number" &&
      Number.isFinite((parsed as any).trashWarnBytes)
    ) {
      out.trashWarnBytes = clampTrashWarnBytes((parsed as any).trashWarnBytes);
    }
    return out;
  } catch {
    return null;
  }
}

export async function getEffectiveArchiveRetentionPolicy(): Promise<AudienceArchiveRetentionPolicy> {
  const stored = await readArchivePolicyRaw();
  return {
    retentionDays:
      stored?.retentionDays ??
      envArchiveRetentionDays() ??
      DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS,
    autoDeleteEnabled:
      stored?.autoDeleteEnabled === undefined
        ? DEFAULT_AUDIENCE_ARCHIVE_RETENTION_POLICY.autoDeleteEnabled
        : stored.autoDeleteEnabled,
    trashGraceDays: stored?.trashGraceDays ?? envArchiveTrashGraceDays() ?? DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS,
    trashWarnFileCount:
      stored?.trashWarnFileCount ?? DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_FILES,
    trashWarnBytes:
      stored?.trashWarnBytes ?? DEFAULT_AUDIENCE_ARCHIVE_TRASH_WARN_BYTES,
  };
}

export type AudienceArchiveRetentionDaysSource = "admin" | "env" | "default";

/**
 * Task #567 — same precedence as the `retentionDays` field on
 * `getEffectiveArchiveRetentionPolicy()` but also reports which layer
 * of the precedence chain (stored admin override >
 * `AUDIENCE_ARCHIVE_RETENTION_DAYS` env > built-in default) supplied
 * the value so the admin "Window" stat can render a "default" / "env
 * fallback: Nd" / "custom override: Nd" sublabel matching the one
 * Task #519 added to the recycle-bin grace input.
 */
export async function getEffectiveArchiveRetentionPolicyWithSource(): Promise<{
  policy: AudienceArchiveRetentionPolicy;
  retentionDaysSource: AudienceArchiveRetentionDaysSource;
  retentionDaysEnvFallback: number | null;
}> {
  const stored = await readArchivePolicyRaw();
  const envFallback = envArchiveRetentionDays();
  let retentionDaysSource: AudienceArchiveRetentionDaysSource;
  if (stored?.retentionDays != null) retentionDaysSource = "admin";
  else if (envFallback != null) retentionDaysSource = "env";
  else retentionDaysSource = "default";
  const policy = await getEffectiveArchiveRetentionPolicy();
  return {
    policy,
    retentionDaysSource,
    retentionDaysEnvFallback: envFallback,
  };
}

function envArchiveTrashGraceDays(): number | null {
  const raw = Number(process.env.AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS);
  if (Number.isFinite(raw) && raw >= 0) return clampRetention(Math.max(1, Math.floor(raw)));
  return null;
}

function envArchiveRetentionDays(): number | null {
  const raw = Number(process.env.AUDIENCE_ARCHIVE_RETENTION_DAYS);
  if (Number.isFinite(raw) && raw >= 0) return clampRetention(Math.max(1, Math.floor(raw)));
  return null;
}

export async function setArchiveRetentionPolicy(
  partial: Partial<AudienceArchiveRetentionPolicy>,
  updatedBy?: string,
): Promise<AudienceArchiveRetentionPolicy> {
  const current = await getEffectiveArchiveRetentionPolicy();
  const next: AudienceArchiveRetentionPolicy = {
    retentionDays:
      typeof partial.retentionDays === "number" && Number.isFinite(partial.retentionDays)
        ? clampRetention(partial.retentionDays)
        : current.retentionDays,
    autoDeleteEnabled:
      typeof partial.autoDeleteEnabled === "boolean"
        ? partial.autoDeleteEnabled
        : current.autoDeleteEnabled,
    trashGraceDays:
      typeof partial.trashGraceDays === "number" && Number.isFinite(partial.trashGraceDays)
        ? clampRetention(partial.trashGraceDays)
        : current.trashGraceDays,
    trashWarnFileCount:
      typeof partial.trashWarnFileCount === "number" && Number.isFinite(partial.trashWarnFileCount)
        ? clampTrashWarnFiles(partial.trashWarnFileCount)
        : current.trashWarnFileCount,
    trashWarnBytes:
      typeof partial.trashWarnBytes === "number" && Number.isFinite(partial.trashWarnBytes)
        ? clampTrashWarnBytes(partial.trashWarnBytes)
        : current.trashWarnBytes,
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({ key: AUDIENCE_ARCHIVE_RETENTION_SETTING_KEY, value: stored, updatedBy })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: stored, updatedBy, updatedAt: new Date() },
    });
  return next;
}

function fileTimestampMs(f: AudienceArchiveListing): number | null {
  const raw = f.updatedAt ?? f.sweepStartedAt;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function ageDays(nowMs: number, fileMs: number | null): number | null {
  if (fileMs == null) return null;
  return Math.max(0, (nowMs - fileMs) / (24 * 60 * 60 * 1000));
}

export async function getArchiveStats(): Promise<AudienceArchiveStats> {
  const policy = await getEffectiveArchiveRetentionPolicy();
  let files: AudienceArchiveListing[] = [];
  try {
    files = await archiveReader.list();
  } catch {
    files = [];
  }
  const now = Date.now();
  let totalBytes = 0;
  let oldestFileMs: number | null = null;
  let expiredFileCount = 0;
  let expiredBytes = 0;
  let warnFileCount = 0;
  let warnBytes = 0;
  let earliestWarnExpiry: number | null = null;
  const retentionMs = policy.retentionDays * 24 * 60 * 60 * 1000;
  const warnCutoffMs = now - (policy.retentionDays - ARCHIVE_EXPIRY_WARNING_DAYS) * 24 * 60 * 60 * 1000;
  for (const f of files) {
    totalBytes += f.bytes;
    const ts = fileTimestampMs(f);
    if (ts != null) {
      if (oldestFileMs == null || ts < oldestFileMs) oldestFileMs = ts;
      const age = now - ts;
      if (age >= retentionMs) {
        expiredFileCount += 1;
        expiredBytes += f.bytes;
      } else if (ts <= warnCutoffMs) {
        warnFileCount += 1;
        warnBytes += f.bytes;
        const expiry = ts + retentionMs;
        if (earliestWarnExpiry == null || expiry < earliestWarnExpiry) {
          earliestWarnExpiry = expiry;
        }
      }
    }
  }
  // Expired files always count as "next batch" because the next cleanup
  // tick will remove them — surface that to the dashboard with the
  // earliest expiry timestamp shifted to "now" (already past due).
  if (expiredFileCount > 0) {
    warnFileCount += expiredFileCount;
    warnBytes += expiredBytes;
    if (earliestWarnExpiry == null) earliestWarnExpiry = now;
  }
  return {
    policy,
    defaultRetentionDays: DEFAULT_AUDIENCE_ARCHIVE_RETENTION_DAYS,
    defaultAutoDeleteEnabled: DEFAULT_AUDIENCE_ARCHIVE_RETENTION_POLICY.autoDeleteEnabled,
    totalFiles: files.length,
    totalBytes,
    oldestFileAgeDays:
      oldestFileMs != null ? Math.floor((now - oldestFileMs) / (24 * 60 * 60 * 1000)) : null,
    expiredFileCount,
    expiredBytes,
    nextExpiryBatch: {
      withinDays: ARCHIVE_EXPIRY_WARNING_DAYS,
      fileCount: warnFileCount,
      totalBytes: warnBytes,
      earliestExpiryIso: earliestWarnExpiry != null ? new Date(earliestWarnExpiry).toISOString() : null,
    },
    lastCleanup: lastArchiveCleanup,
    cleanupRunCount: archiveCleanupRunCount,
  };
}

export interface RunArchiveCleanupOptions {
  retentionDaysArg?: number;
  trigger?: "scheduled" | "manual" | "cli";
  dryRun?: boolean;
  actor?: string;
  forceWhenDisabled?: boolean;
}

export async function runArchiveCleanup(
  opts: RunArchiveCleanupOptions = {},
): Promise<AudienceArchiveCleanupResult> {
  const startedAt = new Date();
  const trigger = opts.trigger ?? "manual";
  const dryRun = !!opts.dryRun;
  const policy = await getEffectiveArchiveRetentionPolicy();
  const retentionDays =
    typeof opts.retentionDaysArg === "number" && Number.isFinite(opts.retentionDaysArg)
      ? clampRetention(opts.retentionDaysArg)
      : policy.retentionDays;
  const cutoff = new Date(startedAt.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  // Auto-delete opt-out: scheduled ticks skip, manual runs require an
  // explicit `forceWhenDisabled` to actually delete (the UI surfaces
  // this as a "dry-run only" affordance when auto-delete is off).
  if (!policy.autoDeleteEnabled && trigger === "scheduled" && !opts.forceWhenDisabled) {
    const result: AudienceArchiveCleanupResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      retentionDays,
      cutoffIso: cutoff.toISOString(),
      autoDeleteEnabled: false,
      dryRun,
      trigger,
      candidateFiles: 0,
      deletedFiles: 0,
      bytesDeleted: 0,
      deletions: [],
      errors: [],
      skippedReason: "auto_delete_disabled",
    };
    lastArchiveCleanup = result;
    return result;
  }

  let files: AudienceArchiveListing[];
  try {
    files = await archiveReader.list();
  } catch (err) {
    const result: AudienceArchiveCleanupResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      retentionDays,
      cutoffIso: cutoff.toISOString(),
      autoDeleteEnabled: policy.autoDeleteEnabled,
      dryRun,
      trigger,
      candidateFiles: 0,
      deletedFiles: 0,
      bytesDeleted: 0,
      deletions: [],
      errors: [{ path: "(list)", error: (err as Error).message ?? String(err) }],
      skippedReason: null,
    };
    lastArchiveCleanup = result;
    return result;
  }

  const expired = files.filter((f) => {
    const ts = fileTimestampMs(f);
    return ts != null && ts < cutoff.getTime();
  });
  const effectiveDryRun = dryRun || (!policy.autoDeleteEnabled && !opts.forceWhenDisabled);
  const graceDays = await archiveTrashGraceDays();
  const deletions: AudienceArchiveCleanupDeletion[] = [];
  const errors: AudienceArchiveCleanupResult["errors"] = [];
  let bytesDeleted = 0;
  let deletedFiles = 0;
  for (const f of expired) {
    const ts = fileTimestampMs(f);
    const age = ageDays(startedAt.getTime(), ts) ?? 0;
    const deletionId = `arcdel_${randomUUID().slice(0, 12)}`;
    const deletion: AudienceArchiveCleanupDeletion = {
      deletionId,
      path: f.path,
      archiveTable: f.table,
      bytes: f.bytes,
      rowCount: f.rowCount,
      archiveAgeDays: age,
    };
    if (effectiveDryRun) {
      deletions.push(deletion);
      continue;
    }
    // Task #439: soft-delete by moving to `.trash/<deletionId>/` first.
    // A separate purge sweep hard-deletes trash entries past their grace
    // window, leaving admins a window to restore an accidentally-deleted
    // archive from the deletions log.
    const trashPath = buildTrashPath(f.path, deletionId);
    if (!trashPath) {
      errors.push({
        path: f.path,
        error: "could_not_derive_trash_path",
      });
      continue;
    }
    try {
      await archiveReader.move(f.path, trashPath);
      bytesDeleted += f.bytes;
      deletedFiles += 1;
      try {
        await db.insert(audienceArchiveDeletions).values({
          deletionId,
          path: f.path,
          archiveTable: f.table,
          bytes: f.bytes,
          rowCount: f.rowCount ?? null,
          archiveAgeDays: age,
          retentionDays,
          trigger,
          actor: opts.actor ?? null,
          trashPath,
          graceDays,
        });
      } catch (auditErr) {
        // Audit-log write failure shouldn't roll back the trash move
        // (file is already moved), but we must surface it as an error
        // so the founder notices — the file is unrecoverable via the
        // deletions log without an audit row pointing at the trash path.
        errors.push({
          path: f.path,
          error: `audit_log_write_failed: ${(auditErr as Error).message ?? String(auditErr)}`,
        });
      }
      deletions.push(deletion);
    } catch (err) {
      errors.push({ path: f.path, error: (err as Error).message ?? String(err) });
    }
  }

  const result: AudienceArchiveCleanupResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    retentionDays,
    cutoffIso: cutoff.toISOString(),
    autoDeleteEnabled: policy.autoDeleteEnabled,
    dryRun: effectiveDryRun,
    trigger,
    candidateFiles: expired.length,
    deletedFiles,
    bytesDeleted,
    deletions,
    errors,
    skippedReason: null,
  };
  lastArchiveCleanup = result;
  archiveCleanupRunCount += 1;
  return result;
}

export async function listArchiveDeletions(limit = 50): Promise<AudienceArchiveDeletionRow[]> {
  try {
    return await db
      .select()
      .from(audienceArchiveDeletions)
      .orderBy(desc(audienceArchiveDeletions.deletedAt))
      .limit(Math.max(1, Math.min(500, limit)));
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------------- */
/* Trash (.trash/) soft-delete helpers (Task #439)                        */
/* --------------------------------------------------------------------- */

export type AudienceArchiveTrashGraceDaysSource = "admin" | "env" | "default";

export interface AudienceArchiveTrashStats {
  trashFileCount: number;
  totalTrashBytes: number;
  oldestPendingDeletedAtIso: string | null;
  nextPurgeAtIso: string | null;
  graceDays: number;
  /**
   * Task #519 — provenance of the effective `graceDays` value so the
   * admin Archive Retention card can surface whether the recycle-bin
   * grace came from an admin override, the env var fallback, or the
   * built-in default. Precedence mirrors `archiveTrashGraceDays()`:
   * stored admin override > `AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS` env >
   * `DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS`.
   */
  graceDaysSource: AudienceArchiveTrashGraceDaysSource;
  /**
   * Task #519 — env fallback value (if set) so the UI can show
   * "env fallback: Nd" verbatim, matching the restore-log sublabel.
   */
  graceDaysEnvFallback: number | null;
  /** Task #519 — built-in default grace value, for the "default: Nd" sublabel. */
  defaultGraceDays: number;
  /** Task #514 — effective "trash too large" thresholds (0 = disabled). */
  trashWarnFileCount: number;
  trashWarnBytes: number;
  /** True iff the file-count threshold is set (>0) and is exceeded. */
  trashFileCountExceeded: boolean;
  /** True iff the byte-size threshold is set (>0) and is exceeded. */
  trashBytesExceeded: boolean;
}

/**
 * Aggregate stats for archive files currently sitting in the `.trash/`
 * recycle bin (soft-deleted, not yet purged). Used by the Archive
 * Retention card to surface how much storage is still occupied by
 * pending-purge files and when the next purge will fire.
 */
export async function getArchiveTrashStats(): Promise<AudienceArchiveTrashStats> {
  const policy = await getEffectiveArchiveRetentionPolicy();
  const { graceDays, source: graceDaysSource } =
    await archiveTrashGraceDaysWithSource();
  const graceDaysEnvFallback = envArchiveTrashGraceDays();
  let rows: Array<{ bytes: number | null; deletedAt: Date | null }> = [];
  try {
    rows = await db
      .select({
        bytes: audienceArchiveDeletions.bytes,
        deletedAt: audienceArchiveDeletions.deletedAt,
      })
      .from(audienceArchiveDeletions)
      .where(
        and(
          sql`${audienceArchiveDeletions.trashPath} is not null`,
          sql`${audienceArchiveDeletions.purgedAt} is null`,
        ),
      );
  } catch {
    rows = [];
  }
  let totalTrashBytes = 0;
  let oldestMs: number | null = null;
  for (const r of rows) {
    totalTrashBytes += Number(r.bytes ?? 0);
    const t = r.deletedAt instanceof Date ? r.deletedAt.getTime() : null;
    if (t != null && Number.isFinite(t)) {
      if (oldestMs == null || t < oldestMs) oldestMs = t;
    }
  }
  const nextPurgeMs =
    oldestMs != null ? oldestMs + graceDays * 24 * 60 * 60 * 1000 : null;
  const trashFileCount = rows.length;
  return {
    trashFileCount,
    totalTrashBytes,
    oldestPendingDeletedAtIso:
      oldestMs != null ? new Date(oldestMs).toISOString() : null,
    nextPurgeAtIso: nextPurgeMs != null ? new Date(nextPurgeMs).toISOString() : null,
    graceDays,
    graceDaysSource,
    graceDaysEnvFallback,
    defaultGraceDays: DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS,
    trashWarnFileCount: policy.trashWarnFileCount,
    trashWarnBytes: policy.trashWarnBytes,
    trashFileCountExceeded:
      policy.trashWarnFileCount > 0 && trashFileCount > policy.trashWarnFileCount,
    trashBytesExceeded:
      policy.trashWarnBytes > 0 && totalTrashBytes > policy.trashWarnBytes,
  };
}

async function archiveTrashGraceDays(): Promise<number> {
  return (await archiveTrashGraceDaysWithSource()).graceDays;
}

/**
 * Task #519 — same precedence as `archiveTrashGraceDays()` but also
 * reports which layer of the precedence chain supplied the value so
 * the admin UI can render a "default" / "env fallback" / "custom
 * override" sublabel under the grace input.
 */
export async function archiveTrashGraceDaysWithSource(): Promise<{
  graceDays: number;
  source: AudienceArchiveTrashGraceDaysSource;
}> {
  const stored = await readArchivePolicyRaw();
  if (stored?.trashGraceDays != null) {
    return { graceDays: stored.trashGraceDays, source: "admin" };
  }
  const fromEnv = envArchiveTrashGraceDays();
  if (fromEnv != null) return { graceDays: fromEnv, source: "env" };
  return { graceDays: DEFAULT_AUDIENCE_ARCHIVE_TRASH_GRACE_DAYS, source: "default" };
}

/**
 * Build the absolute `.trash/<deletionId>/` destination path for an
 * archive file. Returns null if the input path doesn't contain the
 * expected `/audience-archive/` segment (defensive — we never want to
 * write trash files outside the audience-archive prefix).
 */
function buildTrashPath(originalPath: string, deletionId: string): string | null {
  const marker = "/audience-archive/";
  const idx = originalPath.indexOf(marker);
  if (idx === -1) return null;
  const before = originalPath.slice(0, idx);
  const after = originalPath.slice(idx + marker.length);
  return `${before}/audience-archive/.trash/${deletionId}/${after}`;
}

export interface AudienceArchiveTrashPurgeResult {
  startedAt: string;
  finishedAt: string;
  graceDays: number;
  cutoffIso: string;
  trigger: "scheduled" | "manual" | "cli";
  candidateEntries: number;
  purgedEntries: number;
  bytesPurged: number;
  errors: Array<{ deletionId: string; trashPath: string; error: string }>;
}

export interface RunArchiveTrashPurgeOptions {
  graceDaysArg?: number;
  trigger?: "scheduled" | "manual" | "cli";
  /**
   * Task #557 — actor that initiated the purge (root admin id, staff id,
   * or worker tag). Persisted in `audience_archive_trash_purges` so the
   * "Recent recycle-bin purges" list can show who triggered each clear.
   */
  actor?: string | null;
}

/**
 * Hard-delete `.trash/` archive files whose original deletion is older
 * than the configured grace window. Sets `purgedAt` on the matching
 * audit row so the deletions log can render "trashed → purged".
 */
export async function runArchiveTrashPurge(
  opts: RunArchiveTrashPurgeOptions = {},
): Promise<AudienceArchiveTrashPurgeResult> {
  const startedAt = new Date();
  const trigger = opts.trigger ?? "manual";
  // Task #514: explicit `graceDaysArg: 0` is honored (used by the
  // "Empty trash" CTA) and floor at 0; otherwise the configured grace
  // wins and the normal clamp/min-1 invariant applies.
  const graceDays =
    typeof opts.graceDaysArg === "number" && Number.isFinite(opts.graceDaysArg)
      ? opts.graceDaysArg === 0
        ? 0
        : clampRetention(opts.graceDaysArg)
      : await archiveTrashGraceDays();
  const cutoff = new Date(startedAt.getTime() - graceDays * 24 * 60 * 60 * 1000);
  const errors: AudienceArchiveTrashPurgeResult["errors"] = [];
  let candidates: AudienceArchiveDeletionRow[] = [];
  try {
    candidates = await db
      .select()
      .from(audienceArchiveDeletions)
      .where(
        and(
          sql`${audienceArchiveDeletions.trashPath} is not null`,
          sql`${audienceArchiveDeletions.purgedAt} is null`,
          lt(audienceArchiveDeletions.deletedAt, cutoff),
        ),
      );
  } catch (err) {
    errors.push({
      deletionId: "(list)",
      trashPath: "",
      error: (err as Error).message ?? String(err),
    });
  }
  let purgedEntries = 0;
  let bytesPurged = 0;
  for (const row of candidates) {
    const trashPath = row.trashPath as string;
    try {
      await archiveReader.delete(trashPath);
      bytesPurged += Number(row.bytes ?? 0);
      purgedEntries += 1;
      try {
        await db
          .update(audienceArchiveDeletions)
          .set({ purgedAt: new Date() })
          .where(eq(audienceArchiveDeletions.deletionId, row.deletionId));
      } catch (auditErr) {
        errors.push({
          deletionId: row.deletionId,
          trashPath,
          error: `audit_update_failed: ${(auditErr as Error).message ?? String(auditErr)}`,
        });
      }
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      // If the trash file is already gone, mark the row as purged
      // anyway so we don't keep retrying every tick.
      if (msg === "not_found") {
        try {
          await db
            .update(audienceArchiveDeletions)
            .set({ purgedAt: new Date() })
            .where(eq(audienceArchiveDeletions.deletionId, row.deletionId));
        } catch {
          /* swallow — error captured below */
        }
        purgedEntries += 1;
        continue;
      }
      errors.push({ deletionId: row.deletionId, trashPath, error: msg });
    }
  }
  const finishedAt = new Date();
  // Task #557 — persist a per-run audit row so the admin "Recent recycle-bin
  // purges" list can show who emptied the trash, when, and how much was
  // reclaimed. Insert is best-effort — a DB failure here must NOT mask a
  // successful purge.
  try {
    await db.insert(audienceArchiveTrashPurges).values({
      startedAt,
      finishedAt,
      trigger,
      actor: opts.actor ? String(opts.actor).slice(0, 200) : null,
      graceDays,
      candidateEntries: candidates.length,
      purgedEntries,
      bytesPurged,
      errorCount: errors.length,
    } as any);
  } catch (err) {
    console.warn(
      "[audience-retention] trash purge audit insert failed:",
      (err as Error).message ?? String(err),
    );
  }
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    graceDays,
    cutoffIso: cutoff.toISOString(),
    trigger,
    candidateEntries: candidates.length,
    purgedEntries,
    bytesPurged,
    errors,
  };
}

/**
 * Task #557 — list the most recent trash-purge audit rows for the admin
 * "Recent recycle-bin purges" panel. Newest first, capped between 1..200.
 * Returns an empty array on DB failure so the panel degrades gracefully.
 */
export async function listArchiveTrashPurges(
  limit = 20,
): Promise<AudienceArchiveTrashPurgeRow[]> {
  try {
    return await db
      .select()
      .from(audienceArchiveTrashPurges)
      .orderBy(desc(audienceArchiveTrashPurges.startedAt))
      .limit(Math.max(1, Math.min(200, limit)));
  } catch {
    return [];
  }
}

export interface AudienceArchiveRestoreResult {
  deletionId: string;
  restoredPath: string;
  trashPath: string;
  restoredBy: string;
  restoredAt: string;
}

/**
 * Restore a previously soft-deleted archive file by moving the gzipped
 * JSONL back from `.trash/<deletionId>/` to its original audience-archive
 * path. Looks up the deletion in `audience_archive_deletions` by its
 * `deletionId`; refuses to restore if the file has already been purged
 * or never had a trash path (e.g. legacy hard-delete row).
 */
export async function restoreFromTrashDeletion(
  deletionId: string,
  restoredBy: string,
): Promise<AudienceArchiveRestoreResult> {
  const rows = await db
    .select()
    .from(audienceArchiveDeletions)
    .where(eq(audienceArchiveDeletions.deletionId, deletionId))
    .limit(1);
  if (rows.length === 0) throw new Error("deletion_not_found");
  const row = rows[0];
  if (!row.trashPath) throw new Error("not_restorable_legacy_hard_delete");
  if (row.purgedAt) throw new Error("already_purged_from_trash");
  await archiveReader.move(row.trashPath, row.path);
  try {
    await db
      .update(audienceArchiveDeletions)
      .set({ trashPath: null })
      .where(eq(audienceArchiveDeletions.deletionId, deletionId));
  } catch (err) {
    console.error(
      "[audience-retention] restore succeeded but audit clear failed:",
      (err as Error).message ?? String(err),
    );
  }
  const restoredAt = new Date().toISOString();
  console.log(
    `[audience-retention] archive restore ok deletionId=${deletionId} ` +
      `from=${row.trashPath} to=${row.path} by=${restoredBy}`,
  );
  return {
    deletionId,
    restoredPath: row.path,
    trashPath: row.trashPath,
    restoredBy,
    restoredAt,
  };
}


function parsePrivateObjectDir(): { bucketName: string; dirInBucket: string } {
  const dir = (process.env.PRIVATE_OBJECT_DIR || "").trim();
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set — cannot list audience archive files.",
    );
  }
  const trimmed = dir.replace(/^\//, "").replace(/\/$/, "");
  const parts = trimmed.split("/");
  if (parts.length < 1 || !parts[0]) {
    throw new Error(`Invalid PRIVATE_OBJECT_DIR path: ${dir}`);
  }
  return { bucketName: parts[0], dirInBucket: parts.slice(1).join("/") };
}

function createDefaultArchiveReader(): AudienceArchiveReader {
  return {
    async list() {
      const { bucketName, dirInBucket } = parsePrivateObjectDir();
      const prefix = `${dirInBucket ? dirInBucket + "/" : ""}audience-archive/`;
      const { objectStorageClient } = await import(
        "../replit_integrations/object_storage/objectStorage"
      );
      const [files] = await objectStorageClient
        .bucket(bucketName)
        .getFiles({ prefix });
      const out: AudienceArchiveListing[] = [];
      for (const f of files) {
        const after = f.name.split("audience-archive/")[1];
        if (!after) continue;
        const segs = after.split("/");
        if (segs.length < 2) continue;
        const tableRaw = segs[0];
        if (tableRaw !== "messages" && tableRaw !== "decisions" && tableRaw !== "commands") {
          continue;
        }
        const md: any = f.metadata ?? {};
        const userMeta: any = md.metadata ?? {};
        out.push({
          table: tableRaw,
          path: `/${bucketName}/${f.name}`,
          bytes: Number(md.size ?? 0) || 0,
          rowCount: userMeta.rowCount != null ? Number(userMeta.rowCount) : null,
          updatedAt: md.updated ? String(md.updated) : null,
          sweepStartedAt: userMeta.sweepStartedAt ?? null,
          cutoffIso: userMeta.cutoff ?? null,
        });
      }
      return out;
    },
    async openStream(path: string) {
      const trimmed = path.startsWith("/") ? path.slice(1) : path;
      const parts = trimmed.split("/");
      if (parts.length < 2) throw new Error("invalid_path");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");
      const { objectStorageClient } = await import(
        "../replit_integrations/object_storage/objectStorage"
      );
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (!exists) throw new Error("not_found");
      const [metadata] = await file.getMetadata();
      return {
        stream: file.createReadStream(),
        bytes: metadata.size != null ? Number(metadata.size) : null,
        contentType: metadata.contentType ?? "application/gzip",
        filename: objectName.split("/").pop() ?? "audience-archive.jsonl.gz",
      };
    },
    async read(objectPath) {
      const trimmed = objectPath.startsWith("/") ? objectPath.slice(1) : objectPath;
      const parts = trimmed.split("/");
      if (parts.length < 2) {
        throw new Error(`invalid archive path: ${objectPath}`);
      }
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");
      const { objectStorageClient } = await import(
        "../replit_integrations/object_storage/objectStorage"
      );
      const [buf] = await objectStorageClient
        .bucket(bucketName)
        .file(objectName)
        .download();
      return buf as Buffer;
    },
    async delete(path: string) {
      const trimmed = path.startsWith("/") ? path.slice(1) : path;
      const parts = trimmed.split("/");
      if (parts.length < 2) throw new Error("invalid_path");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");
      const { objectStorageClient } = await import(
        "../replit_integrations/object_storage/objectStorage"
      );
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (!exists) throw new Error("not_found");
      await file.delete();
    },
    async move(srcPath: string, dstPath: string) {
      const trimSrc = srcPath.startsWith("/") ? srcPath.slice(1) : srcPath;
      const srcParts = trimSrc.split("/");
      const trimDst = dstPath.startsWith("/") ? dstPath.slice(1) : dstPath;
      const dstParts = trimDst.split("/");
      if (srcParts.length < 2 || dstParts.length < 2) throw new Error("invalid_path");
      const srcBucket = srcParts[0];
      const srcObject = srcParts.slice(1).join("/");
      const dstBucket = dstParts[0];
      const dstObject = dstParts.slice(1).join("/");
      const { objectStorageClient } = await import(
        "../replit_integrations/object_storage/objectStorage"
      );
      const srcFile = objectStorageClient.bucket(srcBucket).file(srcObject);
      const [exists] = await srcFile.exists();
      if (!exists) throw new Error("not_found");
      const dstFile = objectStorageClient.bucket(dstBucket).file(dstObject);
      await srcFile.copy(dstFile);
      await srcFile.delete();
    },
  };
}

function createDefaultArchiveWriter(): AudienceArchiveWriter {
  return {
    async write(table, gzippedJsonl, meta) {
      const dir = (process.env.PRIVATE_OBJECT_DIR || "").trim();
      if (!dir) {
        throw new Error(
          "PRIVATE_OBJECT_DIR not set — cannot archive audience audit rows in archive mode.",
        );
      }
      const stamp = meta.sweepStartedAt.replace(/[:.]/g, "-");
      const objectPath = `${dir.replace(/\/$/, "")}/audience-archive/${table}/${stamp}.jsonl.gz`;
      const trimmed = objectPath.startsWith("/") ? objectPath.slice(1) : objectPath;
      const parts = trimmed.split("/");
      if (parts.length < 2) {
        throw new Error(`Invalid PRIVATE_OBJECT_DIR path: ${objectPath}`);
      }
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");
      // Lazy import so test environments without object storage configured
      // can still load this module.
      const { objectStorageClient } = await import(
        "../replit_integrations/object_storage/objectStorage"
      );
      await objectStorageClient
        .bucket(bucketName)
        .file(objectName)
        .save(gzippedJsonl, {
          contentType: "application/gzip",
          metadata: {
            metadata: {
              audienceTable: table,
              rowCount: String(meta.rowCount),
              cutoff: meta.cutoffIso,
              sweepStartedAt: meta.sweepStartedAt,
            },
          },
        });
      return objectPath;
    },
  };
}

function archiveUploadRetries(): number {
  const raw = Number(process.env.AUDIENCE_ARCHIVE_UPLOAD_RETRIES);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return DEFAULT_AUDIENCE_ARCHIVE_UPLOAD_RETRIES;
}

function archiveUploadBackoffMs(): number {
  const raw = Number(process.env.AUDIENCE_ARCHIVE_UPLOAD_RETRY_BACKOFF_MS);
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return DEFAULT_AUDIENCE_ARCHIVE_UPLOAD_RETRY_BACKOFF_MS;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a single archive-upload attempt in an in-process retry loop so
 * transient storage failures (network blips, brief quota glitches) clear
 * themselves before the founder is paged. Only the final failure
 * propagates to the caller; every attempt is logged for debugging.
 *
 * Retry count comes from `AUDIENCE_ARCHIVE_UPLOAD_RETRIES`
 * (default 3) and the linear backoff base from
 * `AUDIENCE_ARCHIVE_UPLOAD_RETRY_BACKOFF_MS` (default 250ms).
 */
async function writeArchiveWithRetry(
  table: AudienceRetentionTable,
  gz: Buffer,
  meta: { rowCount: number; cutoffIso: string; sweepStartedAt: string },
): Promise<string> {
  const attempts = archiveUploadRetries();
  const backoff = archiveUploadBackoffMs();
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const path = await archiveWriter.write(table, gz, meta);
      if (i > 1) {
        console.log(
          `[audience-retention] archive upload for ${table} succeeded on attempt ${i}/${attempts}`,
        );
      }
      return path;
    } catch (err) {
      lastError = err;
      const msg = (err as Error)?.message ?? String(err);
      if (i < attempts) {
        archiveUploadRetryCount += 1;
        console.warn(
          `[audience-retention] archive upload for ${table} failed (attempt ${i}/${attempts}): ${msg} — retrying in ${backoff * i}ms`,
        );
        await sleep(backoff * i);
      } else {
        archiveUploadFinalFailureCount += 1;
        console.error(
          `[audience-retention] archive upload for ${table} failed (attempt ${i}/${attempts}): ${msg} — giving up, founder alert will fire`,
        );
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function archiveAndDelete<
  TTable extends typeof audienceMessages | typeof audienceSafetyDecisions | typeof audienceModerationCommands,
>(
  table: TTable,
  tableKind: AudienceRetentionTable,
  cutoffColumn: any,
  cutoff: Date,
  mode: RetentionMode,
  sweepStartedAt: string,
): Promise<{ pruned: number; archived: number; archiveFile: AudienceArchiveFile | null }> {
  if (mode === "archive") {
    const rows = (await db.select().from(table as any).where(lt(cutoffColumn, cutoff))) as any[];
    if (rows.length === 0) {
      return { pruned: 0, archived: 0, archiveFile: null };
    }
    const jsonl = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    const gz = gzipSync(Buffer.from(jsonl, "utf8"));
    const path = await writeArchiveWithRetry(tableKind, gz, {
      rowCount: rows.length,
      cutoffIso: cutoff.toISOString(),
      sweepStartedAt,
    });
    // A writer that returns an empty / null path is treated as a silent
    // upload failure: the rows MUST stay in Postgres so the next sweep
    // can retry, and the post-sweep silent-failure check will fire a
    // founder alert because old rows still exist for this archive table.
    if (!path) {
      return { pruned: 0, archived: 0, archiveFile: null };
    }
    const delRes = await db.delete(table as any).where(lt(cutoffColumn, cutoff));
    const pruned = (delRes as any).rowCount ?? rows.length;
    return {
      pruned,
      archived: rows.length,
      archiveFile: { table: tableKind, path, rowCount: rows.length, bytes: gz.byteLength },
    };
  }
  const delRes = await db.delete(table as any).where(lt(cutoffColumn, cutoff));
  return { pruned: (delRes as any).rowCount ?? 0, archived: 0, archiveFile: null };
}

/* --------------------------------------------------------------------- */
/* Restore from archive (Task #407)                                       */
/* --------------------------------------------------------------------- */

export interface AudienceRestoreEntry {
  restoredAt: string;
  archivePath: string;
  table: AudienceRetentionTable;
  restoredBy: string;
  rowsParsed: number;
  rowsInserted: number;
  rowsSkipped: number;
  error: string | null;
}

const MAX_RESTORE_LOG_ENTRIES = 50;

async function recordRestore(entry: AudienceRestoreEntry): Promise<void> {
  try {
    await db.insert(audienceRestoreLog).values({
      restoredAt: new Date(entry.restoredAt),
      archivePath: entry.archivePath,
      tableName: entry.table,
      restoredBy: entry.restoredBy,
      rowsParsed: entry.rowsParsed,
      rowsInserted: entry.rowsInserted,
      rowsSkipped: entry.rowsSkipped,
      error: entry.error,
    });
  } catch (err) {
    console.error(
      "[audience-retention] failed to persist restore log entry:",
      (err as Error).message ?? String(err),
    );
  }
  // Task #470: after every successful (or attempted) restore-log insert,
  // check whether today's restore rate has crossed the configured
  // threshold and fire a founder alert if so. Failures here are
  // non-fatal — the restore itself already succeeded.
  try {
    await audienceRestoreLogRateAlertService.checkAndNotify({
      restoredBy: entry.restoredBy,
    });
  } catch (err) {
    console.error(
      "[audience-retention] restore-log rate alert check threw:",
      (err as Error).message ?? String(err),
    );
  }
}

export async function getAudienceRestoreLog(): Promise<AudienceRestoreEntry[]> {
  try {
    const rows = await db
      .select()
      .from(audienceRestoreLog)
      .orderBy(desc(audienceRestoreLog.restoredAt))
      .limit(MAX_RESTORE_LOG_ENTRIES);
    return rows.map((r) => ({
      restoredAt: (r.restoredAt instanceof Date ? r.restoredAt : new Date(r.restoredAt as any)).toISOString(),
      archivePath: r.archivePath,
      table: r.tableName as AudienceRetentionTable,
      restoredBy: r.restoredBy,
      rowsParsed: r.rowsParsed,
      rowsInserted: r.rowsInserted,
      rowsSkipped: r.rowsSkipped,
      error: r.error,
    }));
  } catch (err) {
    console.error(
      "[audience-retention] failed to read restore log:",
      (err as Error).message ?? String(err),
    );
    return [];
  }
}

function inferTableFromPath(objectPath: string): AudienceRetentionTable {
  // Default writer layout: <bucket-or-dir>/audience-archive/<table>/<stamp>.jsonl.gz
  const match = objectPath.match(/audience-archive\/(messages|decisions|commands)\//);
  if (!match) {
    throw new Error(
      `cannot infer audience table from archive path (expected segment 'audience-archive/<messages|decisions|commands>/'): ${objectPath}`,
    );
  }
  return match[1] as AudienceRetentionTable;
}

function parseJsonl(buf: Buffer): any[] {
  const text = buf.toString("utf8");
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      throw new Error(`invalid JSONL on line ${idx + 1}: ${(e as Error).message}`);
    }
  });
}

function normalizeRow(table: AudienceRetentionTable, raw: any): any {
  const row = { ...raw };
  const dateFields: Record<AudienceRetentionTable, string[]> = {
    messages: ["receivedAt"],
    decisions: ["decidedAt"],
    commands: ["createdAt"],
  };
  for (const f of dateFields[table]) {
    if (typeof row[f] === "string") row[f] = new Date(row[f]);
  }
  return row;
}

export interface AudienceRestoreResult extends AudienceRestoreEntry {}

/**
 * Restore previously-archived audience moderation rows back into Postgres.
 *
 * - Reads the gzipped JSONL file from object storage (via the injectable
 *   `AudienceArchiveReader`).
 * - Infers the target table from the path segment (`messages` / `decisions`
 *   / `commands`).
 * - Re-inserts every row with `onConflictDoNothing()` so already-present
 *   rows (e.g. partial prior restores) are silently skipped.
 * - Connectors are NEVER restored from this path — only the three audit
 *   tables are eligible.
 * - Appends an entry to the in-memory restore log (who triggered it,
 *   how many rows landed) and also logs the same line to stdout.
 */
export async function restoreFromArchive(
  archivePath: string,
  restoredBy: string,
): Promise<AudienceRestoreResult> {
  const restoredAt = new Date().toISOString();
  let table: AudienceRetentionTable = "messages";
  let rowsParsed = 0;
  let rowsInserted = 0;
  let rowsSkipped = 0;
  let errorMsg: string | null = null;
  try {
    table = inferTableFromPath(archivePath);
  } catch (err) {
    errorMsg = (err as Error).message ?? String(err);
  }
  try {
    if (errorMsg) throw new Error(errorMsg);
    const gz = await archiveReader.read(archivePath);
    const jsonl = gunzipSync(gz);
    const rows = parseJsonl(jsonl);
    rowsParsed = rows.length;
    const target =
      table === "messages"
        ? audienceMessages
        : table === "decisions"
          ? audienceSafetyDecisions
          : audienceModerationCommands;
    for (const raw of rows) {
      const row = normalizeRow(table, raw);
      const res: any = await (db as any)
        .insert(target)
        .values(row)
        .onConflictDoNothing()
        .returning({ id: (target as any).id });
      if (Array.isArray(res) && res.length > 0) rowsInserted += 1;
      else rowsSkipped += 1;
    }
  } catch (err) {
    errorMsg = (err as Error).message ?? String(err);
  }
  const entry: AudienceRestoreEntry = {
    restoredAt,
    archivePath,
    table,
    restoredBy,
    rowsParsed,
    rowsInserted,
    rowsSkipped,
    error: errorMsg,
  };
  await recordRestore(entry);
  if (errorMsg) {
    console.warn(
      `[audience-retention] restore FAILED path=${archivePath} table=${table} by=${restoredBy} error=${errorMsg}`,
    );
  } else {
    console.log(
      `[audience-retention] restore ok path=${archivePath} table=${table} by=${restoredBy} parsed=${rowsParsed} inserted=${rowsInserted} skipped=${rowsSkipped}`,
    );
  }
  return entry;
}

/**
 * Run a single retention sweep. Connectors are NEVER pruned — only the
 * three audit-trail tables. Errors are swallowed into the returned
 * summary so the daily scheduler can keep running on the next tick.
 */
export async function runRetentionSweep(
  retentionDaysArg?: number,
  trigger: AudienceRetentionSweepResult["trigger"] = "manual",
): Promise<AudienceRetentionSweepResult> {
  const startedAt = new Date();
  const eff = await getEffectiveRetentionDays();
  const retentionDays =
    typeof retentionDaysArg === "number" && Number.isFinite(retentionDaysArg)
      ? clampRetention(retentionDaysArg)
      : eff.retentionDays;
  const cutoff = new Date(startedAt.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const { mode } = await getEffectiveRetentionMode();
  const restoreLogEff = await getEffectiveRestoreLogRetentionDays();
  const restoreLogRetentionDays = restoreLogEff.retentionDays;
  const restoreLogCutoff = new Date(
    startedAt.getTime() - restoreLogRetentionDays * 24 * 60 * 60 * 1000,
  );

  let messagesPruned = 0;
  let decisionsPruned = 0;
  let commandsPruned = 0;
  let gatewayEventsPruned = 0;
  let messagesArchived = 0;
  let decisionsArchived = 0;
  let commandsArchived = 0;
  const archiveFiles: AudienceArchiveFile[] = [];
  let errorMsg: string | null = null;
  const sweepStartedAt = startedAt.toISOString();

  try {
    const dec = await archiveAndDelete(
      audienceSafetyDecisions,
      "decisions",
      audienceSafetyDecisions.decidedAt,
      cutoff,
      mode.decisions,
      sweepStartedAt,
    );
    decisionsPruned = dec.pruned;
    decisionsArchived = dec.archived;
    if (dec.archiveFile) archiveFiles.push(dec.archiveFile);

    const cmd = await archiveAndDelete(
      audienceModerationCommands,
      "commands",
      audienceModerationCommands.createdAt,
      cutoff,
      mode.commands,
      sweepStartedAt,
    );
    commandsPruned = cmd.pruned;
    commandsArchived = cmd.archived;
    if (cmd.archiveFile) archiveFiles.push(cmd.archiveFile);

    const msg = await archiveAndDelete(
      audienceMessages,
      "messages",
      audienceMessages.receivedAt,
      cutoff,
      mode.messages,
      sweepStartedAt,
    );
    messagesPruned = msg.pruned;
    messagesArchived = msg.archived;
    if (msg.archiveFile) archiveFiles.push(msg.archiveFile);

    // Task #421: prune the permanent gateway event log on the same schedule.
    gatewayEventsPruned = await pruneGatewayEventsOlderThan(cutoff);
  } catch (err) {
    errorMsg = (err as Error).message ?? String(err);
  }

  // Task #490: prune `gateway_alert_settings_audit` on the same schedule
  // and window as the other audience audit tables so the threshold-edit
  // history can't grow forever. Failures are non-fatal — operational
  // logging is the founder's signal; we still record `0` in the result.
  let thresholdAuditRowsPruned = 0;
  try {
    const delRes = await db
      .delete(gatewayAlertSettingsAudit)
      .where(lt(gatewayAlertSettingsAudit.updatedAt, cutoff));
    thresholdAuditRowsPruned = (delRes as any).rowCount ?? 0;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(`[audience-retention] threshold-audit prune failed: ${msg}`);
    if (!errorMsg) errorMsg = `threshold-audit prune failed: ${msg}`;
  }

  // Silent-failure detection (Task #408): if a table is in archive mode
  // but produced 0 archive files AND pruned 0 rows AND old rows still
  // exist, the archive upload silently failed (writer returned empty
  // path, bucket misconfigured, etc.). Treat as an error so the founder
  // alert fires and the audit tables don't grow unnoticed.
  if (!errorMsg) {
    const archiveChecks: Array<{
      kind: AudienceRetentionTable;
      pruned: number;
      archived: number;
      table: any;
      cutoffColumn: any;
    }> = [
      {
        kind: "messages",
        pruned: messagesPruned,
        archived: messagesArchived,
        table: audienceMessages,
        cutoffColumn: audienceMessages.receivedAt,
      },
      {
        kind: "decisions",
        pruned: decisionsPruned,
        archived: decisionsArchived,
        table: audienceSafetyDecisions,
        cutoffColumn: audienceSafetyDecisions.decidedAt,
      },
      {
        kind: "commands",
        pruned: commandsPruned,
        archived: commandsArchived,
        table: audienceModerationCommands,
        cutoffColumn: audienceModerationCommands.createdAt,
      },
    ];
    const silentTables: string[] = [];
    try {
      for (const c of archiveChecks) {
        if (mode[c.kind] !== "archive") continue;
        if (c.archived > 0 || c.pruned > 0) continue;
        const stale = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(c.table)
          .where(lt(c.cutoffColumn, cutoff));
        const count = Number(stale[0]?.c ?? 0);
        if (count > 0) silentTables.push(`${c.kind}(${count})`);
      }
    } catch (err) {
      errorMsg = `Silent-failure post-check threw: ${(err as Error).message ?? String(err)}`;
    }
    if (!errorMsg && silentTables.length > 0) {
      errorMsg = `Archive upload appears to have silently failed for: ${silentTables.join(", ")} — old rows remain in Postgres but no archive file was written.`;
    }
  }

  // Task #558: prune the legacy-token kill-switch audit log on the same
  // schedule and window as the other audience audit tables so the
  // who-flipped-what history can't grow forever. Failure is non-fatal but
  // is surfaced as a sweep error so the founder failure-alert service
  // fires.
  try {
    await pruneLegacyTokenKillSwitchAuditOlderThan(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(`[audience-retention] legacy-token kill-switch audit prune failed: ${msg}`);
    if (!errorMsg) errorMsg = `legacy-token kill-switch audit prune failed: ${msg}`;
  }

  // Task #435: prune very old rows from `audience_restore_log` using its
  // own (typically longer) retention window so the restore audit trail
  // doesn't grow forever. Failures here are non-fatal — we still report
  // the audit-table sweep result so a temporary restore-log prune
  // failure doesn't mask successful audit pruning.
  let restoreLogPruned = 0;
  try {
    const delRes = await db
      .delete(audienceRestoreLog)
      .where(lt(audienceRestoreLog.restoredAt, restoreLogCutoff));
    restoreLogPruned = (delRes as any).rowCount ?? 0;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(`[audience-retention] restore-log prune failed: ${msg}`);
    if (!errorMsg) errorMsg = `restore-log prune failed: ${msg}`;
  }

  // Task #448 / #488: prune the audit-export notification history table on
  // the same audit-window cadence so it can't grow without bound. Failures
  // here are non-fatal for the audit-table sweep, but they DO surface as
  // a sweep error (so the founder failure-alert service fires) and the
  // prune count is reported on the result so the Retention Mode admin
  // card can show whether the prune actually ran.
  let notificationHistoryPruned = 0;
  try {
    notificationHistoryPruned = await auditExportNotificationsPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] audit-export notification prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `audit-export notification prune failed: ${msg}`;
    }
  }

  // Task #728: prune the audit-export notifier config-change history
  // on the same audit-window cadence so the durable config-audit log
  // can't grow without bound. Failure is non-fatal but is surfaced as
  // a sweep error so the founder failure-alert service fires.
  try {
    await auditExportNotifierConfigHistoryPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] audit-export notifier config history prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `audit-export notifier config history prune failed: ${msg}`;
    }
  }

  // Task #562: prune the archive-deletion snooze-window log on the same
  // audit-window cadence so the snooze history can't grow without bound.
  // Failure is non-fatal but is surfaced as a sweep error.
  let archiveSnoozeLogPruned = 0;
  try {
    archiveSnoozeLogPruned = await archiveSnoozeLogPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] archive-snooze-log prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `archive-snooze-log prune failed: ${msg}`;
    }
  }

  // Task #613: prune the audit-email failure-alert snooze history on the
  // same audit-window cadence so the durable snooze audit log can't grow
  // without bound. Failure is non-fatal but is surfaced as a sweep error
  // so the founder failure-alert service fires.
  let auditEmailSnoozeHistoryPruned = 0;
  try {
    auditEmailSnoozeHistoryPruned =
      await auditEmailSnoozeHistoryPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] audit-email snooze history prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `audit-email snooze history prune failed: ${msg}`;
    }
  }

  // Task #692: prune the audit-history email stale-alert snooze-window
  // log on the same audit-window cadence so the durable stale-alert
  // snooze history can't grow without bound. Only CLOSED rows older
  // than the cutoff are eligible — open snooze windows are preserved.
  try {
    await staleSnoozeLogPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] stale-alert snooze log prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `stale-alert snooze log prune failed: ${msg}`;
    }
  }

  // Task #621: prune the founder PTO suppression log on the same
  // audit-window cadence so the table can't grow without bound.
  // Failure is non-fatal but is surfaced as a sweep error.
  try {
    await founderPtoSuppressionLogPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] founder-pto suppression log prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `founder-pto suppression log prune failed: ${msg}`;
    }
  }

  // Task #840: prune the production-asset orphan-sweep flapping audit
  // tables (config-change history + snooze log) on the same audit-window
  // cadence so they can't grow without bound. Failures are non-fatal
  // for the audit-table sweep but DO surface as a sweep error so the
  // founder failure-alert service fires.
  try {
    await flappingConfigHistoryPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] flapping-config history prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `flapping-config history prune failed: ${msg}`;
    }
  }
  try {
    await flappingSnoozeLogPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] flapping-snooze log prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `flapping-snooze log prune failed: ${msg}`;
    }
  }

  // Task #850: prune the orphan-sweep alert threshold change history
  // (Task #845) on the same audit-window cadence so the table can't grow
  // without bound. Failure is non-fatal but is surfaced as a sweep error.
  try {
    await sweepThresholdChangesPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] sweep-threshold change history prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `sweep-threshold change history prune failed: ${msg}`;
    }
  }

  // Task #545: prune the connector-rotation notification history table on
  // the same audit-window cadence so the durable rotation alert log can't
  // grow without bound. Failure is non-fatal but is surfaced as a sweep
  // error so the founder failure-alert service fires.
  let connectorRotationHistoryPruned = 0;
  try {
    connectorRotationHistoryPruned =
      await connectorRotationNotificationsPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] connector-rotation notification prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `connector-rotation notification prune failed: ${msg}`;
    }
  }

  // Task #549: prune the legacy-token dispatch alert history on the same
  // audit-window cadence so the table can't grow without bound. Failures
  // are non-fatal for the audit-table sweep but DO surface as a sweep
  // error so the founder failure-alert service fires.
  let legacyTokenAlertHistoryPruned = 0;
  try {
    legacyTokenAlertHistoryPruned = await legacyTokenDispatchAlertsPruner(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] legacy-token dispatch alert prune failed: ${msg}`,
    );
    if (!errorMsg) {
      errorMsg = `legacy-token dispatch alert prune failed: ${msg}`;
    }
  }

  // Task #556 — prune the stale-rows alert threshold history on the same
  // cadence so the audit table can't grow without bound. Mirrors the
  // notification-history prune above; failures are logged but never
  // poison the rest of the sweep.
  try {
    await pruneStaleRowsThresholdHistoryOlderThan(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] stale-rows threshold history prune failed: ${msg}`,
    );
  }

  // Task #571 — prune the restore-log rate threshold change history on
  // the same cadence so the audit table cannot grow without bound.
  // Failures are logged but never poison the rest of the sweep.
  try {
    await pruneRestoreLogRateThresholdHistoryOlderThan(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] restore-log rate threshold history prune failed: ${msg}`,
    );
  }

  // Task #677 — prune the restore-log rate weakening-email notification
  // history on the same cadence so the audit table cannot grow without
  // bound. Failures are logged but never poison the rest of the sweep.
  try {
    await pruneRestoreLogRateWeakeningNotificationsOlderThan(cutoff);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      `[audience-retention] restore-log rate weakening notification prune failed: ${msg}`,
    );
  }

  const finishedAt = new Date();
  const totalPruned = messagesPruned + decisionsPruned + commandsPruned + gatewayEventsPruned;
  const totalArchived = messagesArchived + decisionsArchived + commandsArchived;
  const result: AudienceRetentionSweepResult = {
    startedAt: sweepStartedAt,
    finishedAt: finishedAt.toISOString(),
    retentionDays,
    cutoffIso: cutoff.toISOString(),
    mode,
    messagesPruned,
    decisionsPruned,
    commandsPruned,
    gatewayEventsPruned,
    notificationHistoryPruned,
    connectorRotationHistoryPruned,
    legacyTokenAlertHistoryPruned,
    thresholdAuditRowsPruned,
    messagesArchived,
    decisionsArchived,
    commandsArchived,
    totalPruned,
    totalArchived,
    archiveFiles,
    restoreLogPruned,
    restoreLogCutoffIso: restoreLogCutoff.toISOString(),
    restoreLogRetentionDays,
    trigger,
    error: errorMsg,
  };
  lastRun = result;
  // Task #441: snapshot the post-sweep stale-pending backlog per table so
  // the dashboard can draw a trend across the last N sweeps. Use the
  // same counter the live stats endpoint uses to keep numbers aligned.
  try {
    const postSweepStale = await countStalePendingArchive(retentionDays);
    await recordStalePendingHistory(retentionDays, trigger, errorMsg, postSweepStale);
  } catch (histErr) {
    console.warn(
      "[audience-retention] post-sweep stale-history capture failed:",
      (histErr as Error)?.message ?? String(histErr),
    );
  }
  if (!errorMsg) {
    totalRowsPruned += totalPruned;
    totalGatewayEventsPruned += gatewayEventsPruned;
    totalThresholdAuditPruned += thresholdAuditRowsPruned;
    totalRowsArchived += totalArchived;
    totalArchiveFiles += archiveFiles.length;
    totalRestoreLogPruned += restoreLogPruned;
    runCount += 1;
    try {
      await audienceRetentionFailureAlertService.notifySuccess({
        cutoffIso: result.cutoffIso,
        retentionDays: result.retentionDays,
        trigger,
      });
    } catch (alertErr) {
      console.error(
        "[audience-retention] failed to auto-resolve failure alert:",
        alertErr,
      );
    }
  } else {
    try {
      await audienceRetentionFailureAlertService.notifyFailure({
        error: errorMsg,
        cutoffIso: result.cutoffIso,
        retentionDays: result.retentionDays,
        trigger,
      });
    } catch (alertErr) {
      console.error(
        "[audience-retention] failed to fire failure alert:",
        alertErr,
      );
    }
  }
  return result;
}

async function recordStalePendingHistory(
  retentionDays: number,
  trigger: AudienceRetentionSweepResult["trigger"],
  sweepError: string | null,
  counts: Record<AudienceRetentionTable, number>,
): Promise<void> {
  try {
    await db.insert(audienceRetentionStaleHistory).values({
      retentionDays,
      stalePendingMessages: counts.messages,
      stalePendingDecisions: counts.decisions,
      stalePendingCommands: counts.commands,
      sweepTrigger: trigger,
      sweepError,
    });
  } catch (err) {
    console.warn(
      "[audience-retention] failed to persist stale-pending history row:",
      (err as Error)?.message ?? String(err),
    );
  }
}

export async function getStalePendingHistory(
  limit: number = AUDIENCE_STALE_HISTORY_DEFAULT_LIMIT,
): Promise<AudienceStalePendingHistoryEntry[]> {
  const safeLimit = Math.max(
    1,
    Math.min(
      AUDIENCE_STALE_HISTORY_MAX_LIMIT,
      Number.isFinite(limit) ? Math.floor(limit) : AUDIENCE_STALE_HISTORY_DEFAULT_LIMIT,
    ),
  );
  try {
    const rows = await db
      .select()
      .from(audienceRetentionStaleHistory)
      .orderBy(desc(audienceRetentionStaleHistory.recordedAt))
      .limit(safeLimit);
    // Return oldest-first so the sparkline renders left-to-right.
    return rows
      .map((r) => ({
        recordedAt: (r.recordedAt instanceof Date
          ? r.recordedAt
          : new Date(r.recordedAt as any)
        ).toISOString(),
        retentionDays: r.retentionDays,
        messages: r.stalePendingMessages,
        decisions: r.stalePendingDecisions,
        commands: r.stalePendingCommands,
        trigger: (r.sweepTrigger as AudienceRetentionSweepResult["trigger"]) ?? "scheduled",
        error: r.sweepError ?? null,
      }))
      .reverse();
  } catch {
    return [];
  }
}

async function countStalePendingArchive(
  retentionDays: number,
): Promise<Record<AudienceRetentionTable, number>> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result: Record<AudienceRetentionTable, number> = {
    messages: 0,
    decisions: 0,
    commands: 0,
  };
  const probes: Array<{
    kind: AudienceRetentionTable;
    table: any;
    cutoffColumn: any;
  }> = [
    { kind: "messages", table: audienceMessages, cutoffColumn: audienceMessages.receivedAt },
    {
      kind: "decisions",
      table: audienceSafetyDecisions,
      cutoffColumn: audienceSafetyDecisions.decidedAt,
    },
    {
      kind: "commands",
      table: audienceModerationCommands,
      cutoffColumn: audienceModerationCommands.createdAt,
    },
  ];
  for (const p of probes) {
    try {
      const r = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(p.table)
        .where(lt(p.cutoffColumn, cutoff));
      result[p.kind] = Number(r[0]?.c ?? 0);
    } catch {
      result[p.kind] = 0;
    }
  }
  return result;
}

async function isRetentionAlertActive(): Promise<boolean> {
  return isOpenAlertForType(AUDIENCE_RETENTION_ALERT_TYPE);
}

async function isStaleRowsAlertActive(): Promise<boolean> {
  return isOpenAlertForType(AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE);
}

async function isOpenAlertForType(type: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: platformAlerts.id })
      .from(platformAlerts)
      .where(
        and(
          eq(platformAlerts.type, type),
          eq(platformAlerts.acknowledged, false),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getRetentionStats(): Promise<AudienceRetentionStats> {
  const eff = await getEffectiveRetentionDays();
  const m = await getEffectiveRetentionMode();
  const restoreLogEff = await getEffectiveRestoreLogRetentionDays();
  const [
    stalePendingArchive,
    alertActive,
    staleRowsAlertActive,
    staleRowsThresholdInfo,
    restoreLogRowCount,
    stalePendingHistory,
  ] = await Promise.all([
    countStalePendingArchive(eff.retentionDays),
    isRetentionAlertActive(),
    isStaleRowsAlertActive(),
    getEffectiveStaleRowsThresholds(),
    (async () => {
      try {
        const r = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(audienceRestoreLog);
        return Number(r[0]?.c ?? 0);
      } catch {
        return 0;
      }
    })(),
    getStalePendingHistory(AUDIENCE_STALE_HISTORY_DEFAULT_LIMIT),
  ]);
  const restoreLogRate = await getRestoreLogRateStats();
  return {
    retentionDays: eff.retentionDays,
    defaultRetentionDays: DEFAULT_AUDIENCE_RETENTION_DAYS,
    override: eff.override,
    envFallback: eff.envFallback,
    mode: m.mode,
    modeOverride: m.modeOverride,
    intervalHours: intervalHours(),
    schedulerRunning: intervalHandle !== null,
    lastRun,
    totalRowsPruned,
    totalGatewayEventsPruned,
    totalThresholdAuditPruned,
    totalRowsArchived,
    totalArchiveFiles,
    runCount,
    archiveUploadRetryCount,
    archiveUploadFinalFailureCount,
    stalePendingArchive,
    alertActive,
    staleRowsAlertActive,
    staleRowsThresholds: staleRowsThresholdInfo.thresholds,
    restoreLogRetentionDays: restoreLogEff.retentionDays,
    defaultRestoreLogRetentionDays: DEFAULT_AUDIENCE_RESTORE_LOG_RETENTION_DAYS,
    restoreLogRetentionOverride: restoreLogEff.override,
    restoreLogRetentionEnvFallback: restoreLogEff.envFallback,
    totalRestoreLogPruned,
    restoreLogRowCount,
    stalePendingHistory,
    restoreLogRate,
  };
}

export function startAudienceRetentionScheduler(): void {
  if (intervalHandle !== null) return;
  const hours = intervalHours();
  const delay = initialDelayMs();
  console.log(
    `[audience-retention] scheduler started — sweep every ${hours} hour(s), first run in ${Math.round(delay / 1000)}s`,
  );
  initialTimerHandle = setTimeout(() => {
    void runTick("scheduled");
  }, delay);
  intervalHandle = setInterval(() => {
    void runTick("scheduled");
  }, hours * 60 * 60 * 1000);
}

export function stopAudienceRetentionScheduler(): void {
  if (initialTimerHandle) {
    clearTimeout(initialTimerHandle);
    initialTimerHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[audience-retention] scheduler stopped");
  }
}

async function runTick(trigger: AudienceRetentionSweepResult["trigger"]): Promise<void> {
  if (running) {
    console.log("[audience-retention] previous sweep still running; skipping tick");
    return;
  }
  running = true;
  try {
    const r = await runRetentionSweep(undefined, trigger);
    if (r.error) {
      console.warn(`[audience-retention] sweep failed: ${r.error}`);
    } else {
      console.log(
        `[audience-retention] sweep ok — retention=${r.retentionDays}d ` +
          `pruned messages=${r.messagesPruned} decisions=${r.decisionsPruned} commands=${r.commandsPruned} gatewayEvents=${r.gatewayEventsPruned} notificationHistory=${r.notificationHistoryPruned} connectorRotationHistory=${r.connectorRotationHistoryPruned} legacyTokenAlertHistory=${r.legacyTokenAlertHistoryPruned} thresholdAudit=${r.thresholdAuditRowsPruned} ` +
          `archived messages=${r.messagesArchived} decisions=${r.decisionsArchived} commands=${r.commandsArchived} ` +
          `archiveFiles=${r.archiveFiles.length}`,
      );
    }
    // Task #440: check stale-pending-archive backlog against per-table
    // thresholds and email founders if any audit table is above its
    // limit. Runs after every tick (success OR failure) because a
    // partial sweep can leave the backlog growing even when the
    // top-level error is null.
    try {
      const stale = await countStalePendingArchive(r.retentionDays);
      await audienceRetentionStaleRowsAlertService.checkAndNotify({
        stalePendingArchive: stale,
        retentionDays: r.retentionDays,
        trigger,
      });
    } catch (err) {
      console.error(
        "[audience-retention] stale-rows alert check threw:",
        err,
      );
    }
    // Task #413: also sweep the archive bucket on the same cadence so
    // gzipped JSONL files past their retention window are removed.
    try {
      const ac = await runArchiveCleanup({ trigger });
      if (ac.skippedReason) {
        console.log(`[audience-retention] archive cleanup skipped: ${ac.skippedReason}`);
      } else if (ac.errors.length > 0) {
        console.warn(
          `[audience-retention] archive cleanup finished with ${ac.errors.length} error(s); deleted=${ac.deletedFiles}/${ac.candidateFiles}`,
        );
      } else {
        console.log(
          `[audience-retention] archive cleanup ok — retention=${ac.retentionDays}d deleted=${ac.deletedFiles}/${ac.candidateFiles} bytes=${ac.bytesDeleted}`,
        );
      }
      // Task #438: notify admins after large permanent deletions, and
      // send the upcoming-expiry digest at most once per dedup window.
      try {
        const { notifyPostCleanup, runUpcomingExpiryDigest, runSnoozeRecapIfDue } = await import(
          "./audience-archive-deletion-notifier"
        );
        await notifyPostCleanup(ac);
        await runUpcomingExpiryDigest();
        // Task #561 — if a snooze window has elapsed naturally and
        // swallowed any alerts, email founders a one-shot recap so
        // they don't have to be at the dashboard when the counter
        // clears.
        await runSnoozeRecapIfDue();
        // Task #622 — when the global founder PTO window has elapsed
        // naturally (or the weekday-mute window closed) and any
        // enrolled notifier swallowed an alert, email founders a
        // one-shot recap so they don't have to be at the dashboard
        // when the counter clears.
        try {
          const { runFounderPtoResumeRecapIfDue } = await import(
            "./founder-pto-mode-service"
          );
          await runFounderPtoResumeRecapIfDue();
        } catch (err) {
          console.warn(
            "[founder-pto-mode] resume-recap tick hook failed:",
            (err as Error)?.message ?? err,
          );
        }
        // Task #568 — proactively email founders when the recycle bin
        // is hoarding storage past the configured thresholds, so they
        // don't have to be at the dashboard to notice the amber pill.
        try {
          const { runTrashBinAlert } = await import(
            "./audience-archive-trash-bin-notifier"
          );
          await runTrashBinAlert({ triggeredBy: trigger });
        } catch (err) {
          console.warn(
            "[audience-archive-trash-bin-notifier] tick hook failed:",
            (err as Error)?.message ?? err,
          );
        }
      } catch (err) {
        console.warn(
          "[audience-archive-deletion-notifier] tick hook failed:",
          (err as Error)?.message ?? err,
        );
      }
    } catch (err) {
      console.error("[audience-retention] archive cleanup threw:", err);
    }
    // Task #439: hard-delete trash files past their grace window.
    try {
      const tp = await runArchiveTrashPurge({ trigger, actor: "worker" });
      if (tp.errors.length > 0) {
        console.warn(
          `[audience-retention] trash purge finished with ${tp.errors.length} error(s); purged=${tp.purgedEntries}/${tp.candidateEntries}`,
        );
      } else if (tp.purgedEntries > 0) {
        console.log(
          `[audience-retention] trash purge ok — grace=${tp.graceDays}d purged=${tp.purgedEntries}/${tp.candidateEntries} bytes=${tp.bytesPurged}`,
        );
      }
    } catch (err) {
      console.error("[audience-retention] trash purge threw:", err);
    }
  } finally {
    running = false;
  }
}

/** Test-only: reset in-memory counters so each test starts clean. */
export async function resetAudienceRetentionStateForTests(): Promise<void> {
  lastRun = null;
  totalRowsPruned = 0;
  totalGatewayEventsPruned = 0;
  totalThresholdAuditPruned = 0;
  totalRowsArchived = 0;
  totalArchiveFiles = 0;
  totalRestoreLogPruned = 0;
  runCount = 0;
  archiveUploadRetryCount = 0;
  archiveUploadFinalFailureCount = 0;
  audienceRestoreLogRateAlertService.resetForTests();
  resetAuditExportNotificationsPrunerForTests();
  try {
    await db.delete(audienceRestoreLog);
  } catch {
    /* swallow — tests reset DB tables explicitly when needed */
  }
  try {
    await db.delete(audienceRetentionStaleHistory);
  } catch {
    /* swallow — tests reset DB tables explicitly when needed */
  }

  lastArchiveCleanup = null;
  archiveCleanupRunCount = 0;


  resetAudienceArchiveWriter();
  resetAudienceArchiveReader();
}
