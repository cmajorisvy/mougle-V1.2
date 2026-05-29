/**
 * Audience archive trash-bin storage notifier (Task #568).
 *
 * Task #514 added an in-dashboard amber warning when the audience
 * archive recycle bin (`.trash/`) exceeds admin-configured file-count
 * or byte thresholds. That warning only surfaces if a founder happens
 * to open the Omni-Channel Audience admin page. This notifier mirrors
 * the {@link ./audience-archive-deletion-notifier} pattern and emails
 * the configured recipients proactively when
 * {@link getArchiveTrashStats} reports `trashFileCountExceeded` or
 * `trashBytesExceeded`, so trash doesn't quietly balloon between
 * dashboard visits.
 *
 * Hard rules:
 *   - Read-only with respect to archive / trash state — never deletes
 *     or modifies anything. Only reads stats.
 *   - Suppressed entirely when `enabled === false` (unsubscribe / mute).
 *   - Send failures are caught and logged so a broken Resend connection
 *     cannot crash the retention sweeper tick.
 *   - Dedup: the same threshold breach is not re-emailed every tick.
 *     A successful send updates `lastAlertAt` + `lastAlertSignature`
 *     in the config row; the next tick within `alertIntervalHours`
 *     with the same signature (file-count bucket + byte bucket +
 *     which thresholds are exceeded) is skipped.
 *   - Snooze: `snoozeUntil` (ISO, future, capped at 90 days from now)
 *     suppresses sends entirely and is reset to `null` when cleared.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { emailService } from "./email-service";
import {
  getArchiveTrashStats,
  type AudienceArchiveTrashStats,
} from "./audience-retention-service";

export const AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_SETTING_KEY =
  "audience_archive_trash_bin_notifier";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HISTORY_MAX = 50;
const MAX_SNOOZE_MS = 90 * 24 * 60 * 60 * 1000;

export const DEFAULT_ALERT_INTERVAL_HOURS = 24;

export type TrashBinNotifierEventKind = "alert" | "test";
export type TrashBinNotifierEventReason =
  | "disabled"
  | "no_recipients"
  | "below_threshold"
  | "deduplicated"
  | "snoozed"
  | "send_failed"
  | "stats_failed"
  | "sent";

export interface AudienceArchiveTrashBinNotifierConfig {
  enabled: boolean;
  recipients: string[];
  alertIntervalHours: number;
  lastAlertAt: string | null;
  lastAlertSignature: string | null;
  snoozeUntil: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_CONFIG: AudienceArchiveTrashBinNotifierConfig =
  {
    enabled: false,
    recipients: [],
    alertIntervalHours: DEFAULT_ALERT_INTERVAL_HOURS,
    lastAlertAt: null,
    lastAlertSignature: null,
    snoozeUntil: null,
    updatedAt: null,
    updatedBy: null,
  };

function normalizeEmails(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((s) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
        .filter((s) => s.length > 0 && EMAIL_RE.test(s)),
    ),
  );
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function parseStored(
  raw: string | null | undefined,
): AudienceArchiveTrashBinNotifierConfig {
  if (!raw) return { ...DEFAULT_AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_CONFIG };
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") {
      return { ...DEFAULT_AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_CONFIG };
    }
    return {
      enabled: Boolean(p.enabled),
      recipients: normalizeEmails(p.recipients),
      alertIntervalHours: clampInt(
        p.alertIntervalHours,
        1,
        24 * 30,
        DEFAULT_ALERT_INTERVAL_HOURS,
      ),
      lastAlertAt: typeof p.lastAlertAt === "string" ? p.lastAlertAt : null,
      lastAlertSignature:
        typeof p.lastAlertSignature === "string" ? p.lastAlertSignature : null,
      snoozeUntil:
        typeof p.snoozeUntil === "string" && !Number.isNaN(Date.parse(p.snoozeUntil))
          ? new Date(p.snoozeUntil).toISOString()
          : null,
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : null,
      updatedBy: typeof p.updatedBy === "string" ? p.updatedBy : null,
    };
  } catch {
    return { ...DEFAULT_AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_CONFIG };
  }
}

export async function getAudienceArchiveTrashBinNotifierConfig(): Promise<AudienceArchiveTrashBinNotifierConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) {
      return { ...DEFAULT_AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_CONFIG };
    }
    return parseStored(rows[0].value);
  } catch (err) {
    console.error(
      "[audience-archive-trash-bin-notifier] failed to load config:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_CONFIG };
  }
}

async function persistConfig(
  next: AudienceArchiveTrashBinNotifierConfig,
  updatedBy?: string | null,
): Promise<void> {
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_SETTING_KEY,
      value: stored,
      updatedBy: updatedBy ?? undefined,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: stored,
        updatedBy: updatedBy ?? undefined,
        updatedAt: new Date(),
      },
    });
}

export async function setAudienceArchiveTrashBinNotifierConfig(input: {
  enabled: boolean;
  recipients: string[];
  alertIntervalHours?: number;
  updatedBy?: string | null;
}): Promise<AudienceArchiveTrashBinNotifierConfig> {
  const recipients = normalizeEmails(input.recipients);
  if (input.enabled && recipients.length === 0) {
    throw new Error("at least one recipient is required when enabled");
  }
  const current = await getAudienceArchiveTrashBinNotifierConfig();
  const next: AudienceArchiveTrashBinNotifierConfig = {
    enabled: Boolean(input.enabled),
    recipients,
    alertIntervalHours: clampInt(
      input.alertIntervalHours ?? current.alertIntervalHours,
      1,
      24 * 30,
      DEFAULT_ALERT_INTERVAL_HOURS,
    ),
    lastAlertAt: current.lastAlertAt,
    lastAlertSignature: current.lastAlertSignature,
    snoozeUntil: current.snoozeUntil,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? null,
  };
  await persistConfig(next, input.updatedBy);
  return next;
}

/**
 * Set/clear the snooze window without touching recipients, dedup
 * state, or interval. Pass `snoozeUntil: null` to clear.
 * Fixed 90-day cap to prevent silent forever-mute.
 */
export async function setAudienceArchiveTrashBinNotifierSnooze(input: {
  snoozeUntil: string | null;
  updatedBy?: string | null;
  now?: Date;
}): Promise<AudienceArchiveTrashBinNotifierConfig> {
  const current = await getAudienceArchiveTrashBinNotifierConfig();
  const nowDate = input.now ?? new Date();
  let snoozeUntil: string | null = null;
  if (input.snoozeUntil !== null && input.snoozeUntil !== undefined) {
    const parsed = Date.parse(input.snoozeUntil);
    if (!Number.isFinite(parsed)) {
      throw new Error("invalid snoozeUntil timestamp");
    }
    const nowMs = nowDate.getTime();
    if (parsed <= nowMs) {
      throw new Error("snoozeUntil must be in the future");
    }
    snoozeUntil = new Date(Math.min(parsed, nowMs + MAX_SNOOZE_MS)).toISOString();
  }
  const next: AudienceArchiveTrashBinNotifierConfig = {
    ...current,
    snoozeUntil,
    updatedAt: nowDate.toISOString(),
    updatedBy: input.updatedBy ?? current.updatedBy,
  };
  await persistConfig(next, input.updatedBy ?? current.updatedBy);
  return next;
}

/* ---------------------------------------------------------------- */
/* History (in-memory ring buffer for the admin UI)                  */
/* ---------------------------------------------------------------- */

export interface AudienceArchiveTrashBinNotifierHistoryEntry {
  kind: TrashBinNotifierEventKind;
  reason: TrashBinNotifierEventReason;
  notified: boolean;
  recipients: string[];
  trashFileCount: number;
  totalTrashBytes: number;
  trashFileCountExceeded: boolean;
  trashBytesExceeded: boolean;
  errorMessage: string | null;
  occurredAt: string;
}

const history: AudienceArchiveTrashBinNotifierHistoryEntry[] = [];

function recordHistory(
  entry: Omit<AudienceArchiveTrashBinNotifierHistoryEntry, "occurredAt">,
): AudienceArchiveTrashBinNotifierHistoryEntry {
  const full: AudienceArchiveTrashBinNotifierHistoryEntry = {
    ...entry,
    occurredAt: new Date().toISOString(),
  };
  history.unshift(full);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  return full;
}

export function getAudienceArchiveTrashBinNotifierHistory(
  limit = 20,
): AudienceArchiveTrashBinNotifierHistoryEntry[] {
  const n = Math.max(1, Math.min(HISTORY_MAX, Math.floor(limit)));
  return history.slice(0, n);
}

export function resetAudienceArchiveTrashBinNotifierHistoryForTests(): void {
  history.length = 0;
}

/* ---------------------------------------------------------------- */
/* Alert run                                                         */
/* ---------------------------------------------------------------- */

export interface RunTrashBinAlertResult {
  notified: boolean;
  reason: TrashBinNotifierEventReason;
  recipients: string[];
  trashFileCount: number;
  totalTrashBytes: number;
  trashFileCountExceeded: boolean;
  trashBytesExceeded: boolean;
}

function bucketize(n: number, bucketSize: number): number {
  if (bucketSize <= 0) return n;
  return Math.floor(n / bucketSize) * bucketSize;
}

/**
 * Build a dedup signature that bypasses the alert-interval window
 * when the breach materially changes (a new threshold flips, the
 * file count crosses an order-of-magnitude bucket, or trash bytes
 * cross another 100MB bucket).
 */
function alertSignature(stats: AudienceArchiveTrashStats): string {
  const fileBucket = bucketize(stats.trashFileCount, 100);
  const byteBucket = bucketize(stats.totalTrashBytes, 100 * 1024 * 1024);
  const filesFlag = stats.trashFileCountExceeded ? "f" : "_";
  const bytesFlag = stats.trashBytesExceeded ? "b" : "_";
  return `${filesFlag}${bytesFlag}:${fileBucket}:${byteBucket}`;
}

export async function runTrashBinAlert(opts: {
  statsLoader?: () => Promise<AudienceArchiveTrashStats>;
  triggeredBy?: string | null;
  now?: Date;
} = {}): Promise<RunTrashBinAlertResult> {
  const cfg = await getAudienceArchiveTrashBinNotifierConfig();
  const base: RunTrashBinAlertResult = {
    notified: false,
    reason: "disabled",
    recipients: cfg.recipients,
    trashFileCount: 0,
    totalTrashBytes: 0,
    trashFileCountExceeded: false,
    trashBytesExceeded: false,
  };
  if (!cfg.enabled) {
    recordHistory({ kind: "alert", ...base, errorMessage: null });
    return base;
  }
  if (cfg.recipients.length === 0) {
    const r = { ...base, reason: "no_recipients" as const };
    recordHistory({ kind: "alert", ...r, errorMessage: null });
    return r;
  }

  let stats: AudienceArchiveTrashStats;
  try {
    stats = await (opts.statsLoader ?? getArchiveTrashStats)();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const r = { ...base, reason: "stats_failed" as const };
    recordHistory({ kind: "alert", ...r, errorMessage: msg });
    return r;
  }

  const baseWithStats: RunTrashBinAlertResult = {
    ...base,
    trashFileCount: stats.trashFileCount,
    totalTrashBytes: stats.totalTrashBytes,
    trashFileCountExceeded: stats.trashFileCountExceeded,
    trashBytesExceeded: stats.trashBytesExceeded,
  };

  if (!stats.trashFileCountExceeded && !stats.trashBytesExceeded) {
    const r = { ...baseWithStats, reason: "below_threshold" as const };
    recordHistory({ kind: "alert", ...r, errorMessage: null });
    return r;
  }

  const now = opts.now ?? new Date();
  const nowMs = now.getTime();

  if (cfg.snoozeUntil) {
    const t = Date.parse(cfg.snoozeUntil);
    if (Number.isFinite(t) && t > nowMs) {
      const r = { ...baseWithStats, reason: "snoozed" as const };
      recordHistory({
        kind: "alert",
        ...r,
        errorMessage: `snoozed_until:${cfg.snoozeUntil}`,
      });
      return r;
    }
  }

  const sig = alertSignature(stats);
  const intervalMs = cfg.alertIntervalHours * 60 * 60 * 1000;
  const lastMs = cfg.lastAlertAt ? Date.parse(cfg.lastAlertAt) : NaN;
  const withinWindow = Number.isFinite(lastMs) && nowMs - lastMs < intervalMs;
  const sameSignature = cfg.lastAlertSignature === sig;
  if (withinWindow && sameSignature) {
    const r = { ...baseWithStats, reason: "deduplicated" as const };
    recordHistory({ kind: "alert", ...r, errorMessage: null });
    return r;
  }

  try {
    await emailService.sendAudienceArchiveTrashBinAlert(cfg.recipients, {
      trashFileCount: stats.trashFileCount,
      totalTrashBytes: stats.totalTrashBytes,
      trashWarnFileCount: stats.trashWarnFileCount,
      trashWarnBytes: stats.trashWarnBytes,
      trashFileCountExceeded: stats.trashFileCountExceeded,
      trashBytesExceeded: stats.trashBytesExceeded,
      graceDays: stats.graceDays,
      oldestPendingDeletedAtIso: stats.oldestPendingDeletedAtIso,
      nextPurgeAtIso: stats.nextPurgeAtIso,
      triggeredBy: opts.triggeredBy ?? null,
    });
    const updated: AudienceArchiveTrashBinNotifierConfig = {
      ...cfg,
      lastAlertAt: new Date(nowMs).toISOString(),
      lastAlertSignature: sig,
    };
    await persistConfig(updated, cfg.updatedBy);
    const r: RunTrashBinAlertResult = {
      ...baseWithStats,
      notified: true,
      reason: "sent",
    };
    recordHistory({ kind: "alert", ...r, errorMessage: null });
    return r;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      "[audience-archive-trash-bin-notifier] alert send failed:",
      msg,
    );
    const r = { ...baseWithStats, reason: "send_failed" as const };
    recordHistory({ kind: "alert", ...r, errorMessage: msg });
    return r;
  }
}

/* ---------------------------------------------------------------- */
/* Manual test send                                                  */
/* ---------------------------------------------------------------- */

export interface SendTestTrashBinAlertResult {
  ok: boolean;
  recipients: string[];
  errorMessage: string | null;
  entry: AudienceArchiveTrashBinNotifierHistoryEntry;
}

export async function sendTestTrashBinAlertEmail(opts: {
  statsLoader?: () => Promise<AudienceArchiveTrashStats>;
} = {}): Promise<SendTestTrashBinAlertResult> {
  const cfg = await getAudienceArchiveTrashBinNotifierConfig();
  if (cfg.recipients.length === 0) {
    throw new Error("no_recipients_configured");
  }
  let stats: AudienceArchiveTrashStats;
  try {
    stats = await (opts.statsLoader ?? getArchiveTrashStats)();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const entry = recordHistory({
      kind: "test",
      reason: "stats_failed",
      notified: false,
      recipients: cfg.recipients,
      trashFileCount: 0,
      totalTrashBytes: 0,
      trashFileCountExceeded: false,
      trashBytesExceeded: false,
      errorMessage: msg,
    });
    return { ok: false, recipients: cfg.recipients, errorMessage: msg, entry };
  }
  try {
    await emailService.sendAudienceArchiveTrashBinAlert(cfg.recipients, {
      trashFileCount: stats.trashFileCount,
      totalTrashBytes: stats.totalTrashBytes,
      trashWarnFileCount: stats.trashWarnFileCount,
      trashWarnBytes: stats.trashWarnBytes,
      trashFileCountExceeded: stats.trashFileCountExceeded,
      trashBytesExceeded: stats.trashBytesExceeded,
      graceDays: stats.graceDays,
      oldestPendingDeletedAtIso: stats.oldestPendingDeletedAtIso,
      nextPurgeAtIso: stats.nextPurgeAtIso,
      triggeredBy: "test",
      isTest: true,
    });
    const entry = recordHistory({
      kind: "test",
      reason: "sent",
      notified: true,
      recipients: cfg.recipients,
      trashFileCount: stats.trashFileCount,
      totalTrashBytes: stats.totalTrashBytes,
      trashFileCountExceeded: stats.trashFileCountExceeded,
      trashBytesExceeded: stats.trashBytesExceeded,
      errorMessage: null,
    });
    return { ok: true, recipients: cfg.recipients, errorMessage: null, entry };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const entry = recordHistory({
      kind: "test",
      reason: "send_failed",
      notified: false,
      recipients: cfg.recipients,
      trashFileCount: stats.trashFileCount,
      totalTrashBytes: stats.totalTrashBytes,
      trashFileCountExceeded: stats.trashFileCountExceeded,
      trashBytesExceeded: stats.trashBytesExceeded,
      errorMessage: msg,
    });
    return { ok: false, recipients: cfg.recipients, errorMessage: msg, entry };
  }
}
