/**
 * Audience archive deletion notifier (Task #438).
 *
 * Task #413 added a dashboard warning banner when audience archive
 * files are about to be permanently deleted, plus an audit log of every
 * deletion. Admins who don't visit the dashboard daily can still lose
 * data silently. This service emails them proactively via the existing
 * Resend integration in two cases:
 *
 *   1. **Upcoming-expiry digest** — at most once per `digestIntervalHours`,
 *      whenever `nextExpiryBatch.fileCount > 0`. The email lists how many
 *      files are scheduled for deletion within the warning window,
 *      total bytes, the earliest expiry timestamp, and a link to the
 *      admin archive browser.
 *
 *   2. **Post-cleanup summary** — fires when a scheduled or manual
 *      cleanup permanently deletes more than `postCleanupFileThreshold`
 *      files OR more than `postCleanupBytesThreshold` bytes. The email
 *      summarises the cleanup and links to the audit log.
 *
 * Hard rules:
 *   - Read-only with respect to archive state — never deletes or
 *     modifies anything. Only reads stats / cleanup results.
 *   - Suppressed entirely when `enabled === false` (unsubscribe / mute).
 *   - Recipients are validated as RFC-shaped emails. PUT route enforces
 *     `at least one recipient when enabled`.
 *   - Send failures are caught and logged so a broken Resend connection
 *     cannot crash the scheduler tick.
 *   - Digest dedup is timestamp-based: a successful digest send updates
 *     `lastDigestAt` in the config row so the next tick within the
 *     window skips. A signature of the batch (file count + earliest
 *     expiry) bypasses dedup when the batch materially changes.
 */

import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, systemSettings } from "@shared/schema";
import {
  audienceArchiveNotifierSnoozeLog,
  type AudienceArchiveNotifierSnoozeLogRow,
} from "@shared/omni-channel-audience-schema";
import { emailService } from "./email-service";
import {
  getArchiveStats,
  type AudienceArchiveCleanupResult,
  type AudienceArchiveStats,
} from "./audience-retention-service";
import { resolveAdminIdentities } from "./admin-identity-resolver";

/** Task #676 — `system_settings` key for the per-control opt-out toggle. */
export const AUDIENCE_ARCHIVE_DELETION_NOTIFY_ON_WEAKENING_SETTING_KEY =
  "audience_archive_deletion_notify_on_weakening";

/** Task #676 — multiplier above which a loosening triggers a notify. */
export const ARCHIVE_DELETION_WEAKENING_MULTIPLIER = 2;

export const AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY =
  "audience_archive_deletion_notifier";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HISTORY_MAX = 50;

export const DEFAULT_DIGEST_INTERVAL_HOURS = 24;
export const DEFAULT_WARNING_LEAD_DAYS = 7;
export const DEFAULT_POST_CLEANUP_FILE_THRESHOLD = 10;
export const DEFAULT_POST_CLEANUP_BYTES_THRESHOLD = 100 * 1024 * 1024;
export const MAX_AUTO_EXTEND_DAYS = 30;

/**
 * Task #516 — snooze policy. Task #474 only supported fixed-window
 * snoozes; founders going on extended PTO had to remember to re-snooze
 * before the window ended. The policy alongside `snoozeUntil`:
 *
 *   - `fixed`        : default. Snooze ends exactly at `snoozeUntil`.
 *   - `auto_extend`  : when `snoozeUntil` elapses the scheduler bumps
 *                      it forward by `extendDays` (1..30) instead of
 *                      letting emails resume. Founder unsnoozes
 *                      explicitly to clear it. Treated as an indefinite
 *                      mute, so it bypasses the 90-day manual cap.
 *   - `weekday_mute` : recurring mute window on selected weekdays
 *                      (0=Sun..6=Sat). Window runs `startHour`..`endHour`
 *                      in `timeZone` (IANA, default `"UTC"`). If
 *                      `startHour >= endHour` the window crosses
 *                      midnight (e.g. 18→8 means 18:00 → next-day 08:00).
 *                      No `snoozeUntil` needed; "snoozed" is computed
 *                      on the fly. Task #564: an optional `timeZone`
 *                      (e.g. `"America/Los_Angeles"`) lets founders
 *                      configure the window in their local time;
 *                      omitted/invalid values fall back to UTC for
 *                      back-compat with policies saved before #564.
 */
export type SnoozePolicy =
  | { kind: "fixed" }
  | { kind: "auto_extend"; extendDays: number }
  | {
      kind: "weekday_mute";
      days: number[];
      startHour: number;
      endHour: number;
      timeZone?: string;
    };

export const DEFAULT_SNOOZE_POLICY: SnoozePolicy = { kind: "fixed" };

export type SnoozeSource = "manual" | "auto" | "weekday_window";

export interface AudienceArchiveDeletionNotifierConfig {
  enabled: boolean;
  recipients: string[];
  warningLeadDays: number;
  digestIntervalHours: number;
  postCleanupFileThreshold: number;
  postCleanupBytesThreshold: number;
  lastDigestAt: string | null;
  lastDigestSignature: string | null;
  /**
   * Task #474: when set to an ISO timestamp in the future, both the
   * upcoming-expiry digest and the post-cleanup summary skip sending
   * with a `snoozed` reason. Lets founders pause alerts for a planned
   * audit / migration window without losing recipients, thresholds,
   * or dedup state. `null` (the default) means not snoozed.
   */
  snoozeUntil: string | null;
  /**
   * Task #517: tracks how many digest + post-cleanup alerts were
   * silently swallowed during the *current* snooze window so the
   * dashboard can show "N alerts suppressed (M files / X bytes)" at a
   * glance. Reset to 0 whenever the snooze is set, cleared, or
   * expires naturally.
   */
  snoozeStartedAt: string | null;
  snoozeSuppressedCount: number;
  snoozeSuppressedFiles: number;
  snoozeSuppressedBytes: number;
  /** Task #516. See {@link SnoozePolicy}. */
  snoozePolicy: SnoozePolicy;
  /**
   * Task #561 — `snoozeStartedAt` of the most recent snooze window for
   * which the "snooze ended — here's what you missed" recap email was
   * already sent. Used to dedup the recap so a single snooze window
   * triggers at most one recap email even if the sweeper tick fires
   * multiple times after expiry.
   */
  lastSnoozeRecapAt: string | null;
  /**
   * Task #516. Tracks how the current `snoozeUntil` came to be:
   * `"manual"` (founder clicked Snooze N) vs `"auto"` (auto-extend
   * policy bumped it). Surfaced in history entries so the founder can
   * distinguish "I muted this" from "the system kept it muted".
   */
  lastSnoozeSource: SnoozeSource | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_AUDIENCE_ARCHIVE_DELETION_NOTIFIER_CONFIG: AudienceArchiveDeletionNotifierConfig =
  {
    enabled: false,
    recipients: [],
    warningLeadDays: DEFAULT_WARNING_LEAD_DAYS,
    digestIntervalHours: DEFAULT_DIGEST_INTERVAL_HOURS,
    postCleanupFileThreshold: DEFAULT_POST_CLEANUP_FILE_THRESHOLD,
    postCleanupBytesThreshold: DEFAULT_POST_CLEANUP_BYTES_THRESHOLD,
    lastDigestAt: null,
    lastDigestSignature: null,
    snoozeUntil: null,
    snoozeStartedAt: null,
    snoozeSuppressedCount: 0,
    snoozeSuppressedFiles: 0,
    snoozeSuppressedBytes: 0,
    snoozePolicy: { ...DEFAULT_SNOOZE_POLICY },
    lastSnoozeRecapAt: null,
    lastSnoozeSource: null,
    updatedAt: null,
    updatedBy: null,
  };

function parseSnoozePolicy(input: unknown): SnoozePolicy {
  if (!input || typeof input !== "object") return { kind: "fixed" };
  const p = input as Record<string, unknown>;
  if (p.kind === "auto_extend") {
    const extendDays = clampInt(p.extendDays, 1, MAX_AUTO_EXTEND_DAYS, 1);
    return { kind: "auto_extend", extendDays };
  }
  if (p.kind === "weekday_mute") {
    const days = Array.isArray(p.days)
      ? Array.from(
          new Set(
            (p.days as unknown[])
              .map((n) => Number(n))
              .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
          ),
        ).sort((a, b) => a - b)
      : [];
    if (days.length === 0) return { kind: "fixed" };
    const startHour = clampInt(p.startHour, 0, 23, 18);
    const endHour = clampInt(p.endHour, 0, 23, 8);
    // Task #564: optional IANA timeZone. Invalid / missing values
    // collapse to omitted, which the runtime treats as UTC. We
    // deliberately don't persist "UTC" explicitly so older rows that
    // pre-date #564 keep round-tripping unchanged.
    const tz =
      typeof p.timeZone === "string" && isValidTimeZone(p.timeZone)
        ? p.timeZone
        : undefined;
    return tz
      ? { kind: "weekday_mute", days, startHour, endHour, timeZone: tz }
      : { kind: "weekday_mute", days, startHour, endHour };
  }
  return { kind: "fixed" };
}

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

/**
 * Task #564 — IANA time-zone validation. `Intl.DateTimeFormat` throws
 * on unknown zones, which is the canonical way to validate them in
 * Node. We keep it isolated so the rest of the parser can stay pure.
 */
function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Task #564 — extract wall-clock parts (weekday + Y/M/D + hour) for a
 * given UTC instant *as observed in `timeZone`*. Used by the recurring
 * `weekday_mute` window check so a founder in `America/Los_Angeles`
 * who configures "Mon 09:00–10:00" sees the window fire at 09:00
 * Pacific (16:00 UTC in PDT, 17:00 UTC in PST) rather than 09:00 UTC.
 */
function getZonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; weekday: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  let hour = parseInt(get("hour"), 10);
  // Some ICU builds report midnight as "24"; normalize to 0.
  if (!Number.isFinite(hour) || hour === 24) hour = 0;
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    weekday: weekdayMap[get("weekday")] ?? 0,
    hour,
  };
}

/**
 * Task #564 — convert a wall-clock time in `timeZone` to the UTC
 * instant it represents. Implemented as a single-step fixed-point
 * because Node's `Date` is always UTC-backed and we don't want to
 * pull in a full tz library. Accuracy is hour-resolution which is all
 * the `weekday_mute` window cares about.
 */
function zonedTimeToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, 0, 0);
  const guess = new Date(targetUtcMs);
  const z = getZonedParts(guess, timeZone);
  const guessLocalAsUtcMs = Date.UTC(z.year, z.month - 1, z.day, z.hour, 0, 0);
  const offsetMs = guessLocalAsUtcMs - targetUtcMs;
  return new Date(targetUtcMs - offsetMs);
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function parseStored(raw: string | null | undefined): AudienceArchiveDeletionNotifierConfig {
  if (!raw) return { ...DEFAULT_AUDIENCE_ARCHIVE_DELETION_NOTIFIER_CONFIG };
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") {
      return { ...DEFAULT_AUDIENCE_ARCHIVE_DELETION_NOTIFIER_CONFIG };
    }
    return {
      enabled: Boolean(p.enabled),
      recipients: normalizeEmails(p.recipients),
      warningLeadDays: clampInt(p.warningLeadDays, 1, 365, DEFAULT_WARNING_LEAD_DAYS),
      digestIntervalHours: clampInt(
        p.digestIntervalHours,
        1,
        24 * 30,
        DEFAULT_DIGEST_INTERVAL_HOURS,
      ),
      postCleanupFileThreshold: clampInt(
        p.postCleanupFileThreshold,
        0,
        1_000_000,
        DEFAULT_POST_CLEANUP_FILE_THRESHOLD,
      ),
      postCleanupBytesThreshold: clampInt(
        p.postCleanupBytesThreshold,
        0,
        Number.MAX_SAFE_INTEGER,
        DEFAULT_POST_CLEANUP_BYTES_THRESHOLD,
      ),
      lastDigestAt: typeof p.lastDigestAt === "string" ? p.lastDigestAt : null,
      lastDigestSignature:
        typeof p.lastDigestSignature === "string" ? p.lastDigestSignature : null,
      snoozeUntil:
        typeof p.snoozeUntil === "string" && !Number.isNaN(Date.parse(p.snoozeUntil))
          ? new Date(p.snoozeUntil).toISOString()
          : null,
      snoozeStartedAt:
        typeof p.snoozeStartedAt === "string" && !Number.isNaN(Date.parse(p.snoozeStartedAt))
          ? new Date(p.snoozeStartedAt).toISOString()
          : null,
      snoozeSuppressedCount: clampInt(
        p.snoozeSuppressedCount,
        0,
        Number.MAX_SAFE_INTEGER,
        0,
      ),
      snoozeSuppressedFiles: clampInt(
        p.snoozeSuppressedFiles,
        0,
        Number.MAX_SAFE_INTEGER,
        0,
      ),
      snoozeSuppressedBytes: clampInt(
        p.snoozeSuppressedBytes,
        0,
        Number.MAX_SAFE_INTEGER,
        0,
      ),
      snoozePolicy: parseSnoozePolicy(p.snoozePolicy),
      lastSnoozeRecapAt:
        typeof p.lastSnoozeRecapAt === "string" &&
        !Number.isNaN(Date.parse(p.lastSnoozeRecapAt))
          ? new Date(p.lastSnoozeRecapAt).toISOString()
          : null,
      lastSnoozeSource:
        p.lastSnoozeSource === "manual" ||
        p.lastSnoozeSource === "auto" ||
        p.lastSnoozeSource === "weekday_window"
          ? p.lastSnoozeSource
          : null,
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : null,
      updatedBy: typeof p.updatedBy === "string" ? p.updatedBy : null,
    };
  } catch {
    return { ...DEFAULT_AUDIENCE_ARCHIVE_DELETION_NOTIFIER_CONFIG };
  }
}

/**
 * Task #561 — internal raw loader that returns the persisted config
 * *without* the dashboard-friendly auto-zero applied by
 * {@link getAudienceArchiveDeletionNotifierConfig}. The recap path
 * needs real `snoozeSuppressed*` counters even after the snooze
 * window has elapsed so it can compose the "here's what you missed"
 * email body.
 */
async function loadStoredConfig(): Promise<AudienceArchiveDeletionNotifierConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) {
      return { ...DEFAULT_AUDIENCE_ARCHIVE_DELETION_NOTIFIER_CONFIG };
    }
    return parseStored(rows[0].value);
  } catch (err) {
    console.error(
      "[audience-archive-deletion-notifier] failed to load raw config:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_AUDIENCE_ARCHIVE_DELETION_NOTIFIER_CONFIG };
  }
}

export async function getAudienceArchiveDeletionNotifierConfig(): Promise<AudienceArchiveDeletionNotifierConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) {
      return { ...DEFAULT_AUDIENCE_ARCHIVE_DELETION_NOTIFIER_CONFIG };
    }
    const parsed = parseStored(rows[0].value);
    // Task #517: once the snooze window has elapsed, surface the
    // counters as zero so the dashboard "N suppressed" pill clears
    // automatically. Persisted state is left untouched — the next
    // setSnooze() call resets it explicitly.
    if (parsed.snoozeUntil) {
      const t = Date.parse(parsed.snoozeUntil);
      if (!Number.isFinite(t) || t <= Date.now()) {
        return {
          ...parsed,
          snoozeSuppressedCount: 0,
          snoozeSuppressedFiles: 0,
          snoozeSuppressedBytes: 0,
        };
      }
    } else if (
      parsed.snoozeSuppressedCount > 0 ||
      parsed.snoozeSuppressedFiles > 0 ||
      parsed.snoozeSuppressedBytes > 0
    ) {
      return {
        ...parsed,
        snoozeSuppressedCount: 0,
        snoozeSuppressedFiles: 0,
        snoozeSuppressedBytes: 0,
      };
    }
    return parsed;
  } catch (err) {
    console.error(
      "[audience-archive-deletion-notifier] failed to load config:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_AUDIENCE_ARCHIVE_DELETION_NOTIFIER_CONFIG };
  }
}

async function persistConfig(
  next: AudienceArchiveDeletionNotifierConfig,
  updatedBy?: string | null,
): Promise<void> {
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
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

export async function setAudienceArchiveDeletionNotifierConfig(input: {
  enabled: boolean;
  recipients: string[];
  warningLeadDays?: number;
  digestIntervalHours?: number;
  postCleanupFileThreshold?: number;
  postCleanupBytesThreshold?: number;
  updatedBy?: string | null;
}): Promise<AudienceArchiveDeletionNotifierConfig> {
  const recipients = normalizeEmails(input.recipients);
  if (input.enabled && recipients.length === 0) {
    throw new Error("at least one recipient is required when enabled");
  }
  const current = await getAudienceArchiveDeletionNotifierConfig();
  // Task #676 — snapshot the prior shape so we can detect a weakening
  // (notifier disabled, or either threshold set to 0 / loosened 2x+).
  const priorSnapshot = {
    enabled: current.enabled,
    postCleanupFileThreshold: current.postCleanupFileThreshold,
    postCleanupBytesThreshold: current.postCleanupBytesThreshold,
  };
  const next: AudienceArchiveDeletionNotifierConfig = {
    enabled: Boolean(input.enabled),
    recipients,
    warningLeadDays: clampInt(
      input.warningLeadDays ?? current.warningLeadDays,
      1,
      365,
      DEFAULT_WARNING_LEAD_DAYS,
    ),
    digestIntervalHours: clampInt(
      input.digestIntervalHours ?? current.digestIntervalHours,
      1,
      24 * 30,
      DEFAULT_DIGEST_INTERVAL_HOURS,
    ),
    postCleanupFileThreshold: clampInt(
      input.postCleanupFileThreshold ?? current.postCleanupFileThreshold,
      0,
      1_000_000,
      DEFAULT_POST_CLEANUP_FILE_THRESHOLD,
    ),
    postCleanupBytesThreshold: clampInt(
      input.postCleanupBytesThreshold ?? current.postCleanupBytesThreshold,
      0,
      Number.MAX_SAFE_INTEGER,
      DEFAULT_POST_CLEANUP_BYTES_THRESHOLD,
    ),
    lastDigestAt: current.lastDigestAt,
    lastDigestSignature: current.lastDigestSignature,
    snoozeUntil: current.snoozeUntil,
    snoozeStartedAt: current.snoozeStartedAt,
    snoozeSuppressedCount: current.snoozeSuppressedCount,
    snoozeSuppressedFiles: current.snoozeSuppressedFiles,
    snoozeSuppressedBytes: current.snoozeSuppressedBytes,
    snoozePolicy: current.snoozePolicy,
    lastSnoozeRecapAt: current.lastSnoozeRecapAt,
    lastSnoozeSource: current.lastSnoozeSource,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? null,
  };
  await persistConfig(next, input.updatedBy);
  try {
    await maybeNotifyArchiveDeletionWeakening({
      prior: priorSnapshot,
      next: {
        enabled: next.enabled,
        postCleanupFileThreshold: next.postCleanupFileThreshold,
        postCleanupBytesThreshold: next.postCleanupBytesThreshold,
      },
      actor: input.updatedBy ?? "unknown",
    });
  } catch (err) {
    console.error(
      "[audience-archive-deletion-notifier] failed to send weakening notification:",
      (err as Error)?.message ?? err,
    );
  }
  return next;
}

/* --------------------------------------------------------------------- */
/* Task #676 — notify-on-weakening toggle + email                        */
/* --------------------------------------------------------------------- */

export async function isArchiveDeletionNotifyOnWeakeningEnabled(): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_ARCHIVE_DELETION_NOTIFY_ON_WEAKENING_SETTING_KEY,
        ),
      )
      .limit(1);
    if (rows.length === 0) return true; // default ON
    const v = String(rows[0].value ?? "").toLowerCase();
    return !(v === "false" || v === "0" || v === "off");
  } catch {
    return true;
  }
}

export async function setArchiveDeletionNotifyOnWeakeningEnabled(
  enabled: boolean,
  updatedBy?: string,
): Promise<{ enabled: boolean }> {
  const stored = enabled ? "true" : "false";
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_ARCHIVE_DELETION_NOTIFY_ON_WEAKENING_SETTING_KEY,
      value: stored,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: stored, updatedBy, updatedAt: new Date() },
    });
  return { enabled };
}

export type ArchiveDeletionWeakeningReason =
  | "control_disabled"
  | "disabled"
  | "loosened_2x";

export interface ArchiveDeletionWeakeningEntry {
  field:
    | "enabled"
    | "postCleanupFileThreshold"
    | "postCleanupBytesThreshold";
  reason: ArchiveDeletionWeakeningReason;
  prior: number | boolean;
  next: number | boolean;
}

export function classifyArchiveDeletionWeakening(
  prior: {
    enabled: boolean;
    postCleanupFileThreshold: number;
    postCleanupBytesThreshold: number;
  },
  next: {
    enabled: boolean;
    postCleanupFileThreshold: number;
    postCleanupBytesThreshold: number;
  },
): ArchiveDeletionWeakeningEntry[] {
  const out: ArchiveDeletionWeakeningEntry[] = [];
  if (prior.enabled && !next.enabled) {
    out.push({
      field: "enabled",
      reason: "control_disabled",
      prior: true,
      next: false,
    });
  }
  for (const field of [
    "postCleanupFileThreshold",
    "postCleanupBytesThreshold",
  ] as const) {
    const p = prior[field];
    const n = next[field];
    if (n === 0 && p > 0) {
      out.push({ field, reason: "disabled", prior: p, next: n });
    } else if (
      p > 0 &&
      n >= ARCHIVE_DELETION_WEAKENING_MULTIPLIER * p
    ) {
      out.push({ field, reason: "loosened_2x", prior: p, next: n });
    }
  }
  return out;
}

async function maybeNotifyArchiveDeletionWeakening(args: {
  prior: {
    enabled: boolean;
    postCleanupFileThreshold: number;
    postCleanupBytesThreshold: number;
  };
  next: {
    enabled: boolean;
    postCleanupFileThreshold: number;
    postCleanupBytesThreshold: number;
  };
  actor: string;
}): Promise<boolean> {
  const weakened = classifyArchiveDeletionWeakening(args.prior, args.next);
  if (weakened.length === 0) return false;
  const enabled = await isArchiveDeletionNotifyOnWeakeningEnabled();
  if (!enabled) return false;
  const recipients = await db
    .select({ email: adminStaff.email })
    .from(adminStaff)
    .where(
      and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)),
    );
  const to = recipients.map((r) => r.email).filter((e): e is string => !!e);
  if (to.length === 0) return false;
  const detail = weakened
    .map((w) => {
      const label =
        w.reason === "control_disabled"
          ? "enabled: true → false (notifier OFF)"
          : `${w.field}: ${String(w.prior)} → ${String(w.next)} (${
              w.reason === "disabled" ? "DISABLED" : "loosened 2x+"
            })`;
      return label;
    })
    .join("\n");
  const worst: ArchiveDeletionWeakeningReason = weakened.some(
    (w) => w.reason === "control_disabled",
  )
    ? "control_disabled"
    : weakened.some((w) => w.reason === "disabled")
      ? "disabled"
      : "loosened_2x";
  await emailService.sendSafetyThresholdWeakenedEmail(to, {
    controlLabel: "Audience archive deletion notifier",
    controlKey: AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY,
    actor: args.actor,
    reason: worst,
    detail,
    link: "/admin/omni-channel-audience#archive-policy",
    occurredAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Task #474 — set/clear the snooze window without touching recipients,
 * thresholds, or dedup state. Pass `snoozeUntil: null` to clear.
 *
 * Task #517 — every snooze change (set new, extend, or clear) resets
 * the suppressed-alert counters so the dashboard's "N alerts swallowed
 * while snoozed" pill always reflects only the *current* window.
 *
 * Task #516 extended this to also accept an optional `snoozePolicy`.
 * Pass `snoozePolicy: { kind: "fixed" }` (or omit it) for the classic
 * fixed-window behavior. Pass `auto_extend` to keep extending past
 * the initial `snoozeUntil`, or `weekday_mute` for a recurring
 * weekday window (no `snoozeUntil` required for that case).
 */
export async function setAudienceArchiveDeletionNotifierSnooze(input: {
  snoozeUntil: string | null;
  snoozePolicy?: SnoozePolicy | null;
  updatedBy?: string | null;
  now?: Date;
}): Promise<AudienceArchiveDeletionNotifierConfig> {
  // Task #561 — use raw stored counters (not the dashboard-friendly
  // auto-zeroed view) so we can decide whether the *outgoing* snooze
  // window needs a "here's what you missed" recap email.
  const current = await loadStoredConfig();
  // Task #562 — close any open snooze-log row before we reset the
  // counters / open a new window, snapshotting the un-zeroed counters
  // so the founder can audit "how much did the last window swallow".
  // `loadStoredConfig` already returns the raw (non-auto-zeroed)
  // counters, so we feed them straight through.
  try {
    await closeOpenSnoozeLog({
      endedAt: input.now ?? new Date(),
      endedReason:
        input.snoozeUntil === null || input.snoozeUntil === undefined
          ? input.snoozePolicy &&
            input.snoozePolicy !== null &&
            (parseSnoozePolicy(input.snoozePolicy).kind === "weekday_mute" ||
              parseSnoozePolicy(input.snoozePolicy).kind === "auto_extend")
            ? "replaced"
            : "unsnoozed"
          : "replaced",
      counters: {
        snoozeSuppressedCount: current.snoozeSuppressedCount,
        snoozeSuppressedFiles: current.snoozeSuppressedFiles,
        snoozeSuppressedBytes: current.snoozeSuppressedBytes,
      },
    });
  } catch (err) {
    console.error(
      "[audience-archive-deletion-notifier] failed to close open snooze log:",
      (err as Error)?.message ?? err,
    );
  }
  const nextPolicy: SnoozePolicy =
    input.snoozePolicy === undefined
      ? current.snoozePolicy
      : input.snoozePolicy === null
        ? { kind: "fixed" }
        : parseSnoozePolicy(input.snoozePolicy);

  let snoozeUntil: string | null = null;
  const nowDate = input.now ?? new Date();
  let lastSnoozeSource: SnoozeSource | null = current.lastSnoozeSource;
  if (input.snoozeUntil !== null && input.snoozeUntil !== undefined) {
    const parsed = Date.parse(input.snoozeUntil);
    if (!Number.isFinite(parsed)) {
      throw new Error("invalid snoozeUntil timestamp");
    }
    const nowMs = nowDate.getTime();
    if (parsed <= nowMs) {
      throw new Error("snoozeUntil must be in the future");
    }
    // Cap manual snooze at 90 days for fixed policy to avoid silent
    // forever-mute. `auto_extend` is the documented way to mute
    // indefinitely, so it bypasses the cap.
    if (nextPolicy.kind === "auto_extend") {
      snoozeUntil = new Date(parsed).toISOString();
    } else {
      const maxMs = nowMs + 90 * 24 * 60 * 60 * 1000;
      snoozeUntil = new Date(Math.min(parsed, maxMs)).toISOString();
    }
    lastSnoozeSource = "manual";
  } else {
    // Clearing snoozeUntil also clears the source attribution.
    lastSnoozeSource = null;
  }

  // Task #561 — if the outgoing snooze window swallowed any alerts and
  // hasn't already been recapped, fire the recap email *before* we
  // reset the counters. Trigger is "manual_unsnooze" when clearing,
  // "replaced" when a new snooze window is being installed.
  let nextRecapAt = current.lastSnoozeRecapAt;
  if (
    current.snoozeStartedAt &&
    current.lastSnoozeRecapAt !== current.snoozeStartedAt &&
    (current.snoozeSuppressedCount > 0 ||
      current.snoozeSuppressedFiles > 0 ||
      current.snoozeSuppressedBytes > 0) &&
    current.enabled &&
    current.recipients.length > 0
  ) {
    const trigger: SnoozeRecapTrigger = snoozeUntil ? "replaced" : "manual_unsnooze";
    const recap = await attemptSnoozeRecap(current, nowDate, trigger);
    if (recap.recapSent) {
      nextRecapAt = current.snoozeStartedAt;
    }
  }

  const next: AudienceArchiveDeletionNotifierConfig = {
    ...current,
    snoozeUntil,
    snoozeStartedAt: snoozeUntil ? nowDate.toISOString() : null,
    snoozeSuppressedCount: 0,
    snoozeSuppressedFiles: 0,
    snoozeSuppressedBytes: 0,
    snoozePolicy: nextPolicy,
    lastSnoozeRecapAt: nextRecapAt,
    lastSnoozeSource,
    updatedAt: nowDate.toISOString(),
    updatedBy: input.updatedBy ?? current.updatedBy,
  };
  await persistConfig(next, input.updatedBy ?? current.updatedBy);

  // Task #562 — open a new snooze-log row whenever a snooze is now
  // active (explicit snoozeUntil OR a recurring weekday_mute policy).
  // The row stays open until the next setSnooze call or, for fixed
  // snoozes, until `evaluateAndMaybeAutoExtendSnooze` detects natural
  // expiry.
  const isNowActive =
    Boolean(snoozeUntil) || nextPolicy.kind === "weekday_mute";
  if (isNowActive) {
    try {
      await openSnoozeLog({
        startedAt: nowDate,
        snoozeUntil,
        policy: nextPolicy,
        source: lastSnoozeSource ?? "manual",
        createdBy: input.updatedBy ?? current.updatedBy ?? null,
      });
    } catch (err) {
      console.error(
        "[audience-archive-deletion-notifier] failed to open snooze log:",
        (err as Error)?.message ?? err,
      );
    }
  }

  // Run through the public getter so callers see counters consistent
  // with the dashboard view.
  return getAudienceArchiveDeletionNotifierConfig();
}

/**
 * Task #516 — recurring weekday mute window check. Day numbers are
 * `0=Sun..6=Sat` in UTC. If `startHour < endHour` the window is a
 * single-day slice; otherwise it crosses midnight (e.g. 18→8 mutes
 * from 18:00 on selected days through 08:00 the next day).
 */
function isInWeekdayMuteWindow(
  policy: Extract<SnoozePolicy, { kind: "weekday_mute" }>,
  now: Date,
): { active: boolean; endsAt: Date | null } {
  // Task #564: weekday + hour are evaluated in `policy.timeZone` when
  // set (IANA), otherwise UTC for back-compat with policies persisted
  // before founder-local time existed.
  const tz = policy.timeZone ?? "UTC";
  const z = getZonedParts(now, tz);
  const day = z.weekday;
  const hour = z.hour;
  const s = policy.startHour;
  const e = policy.endHour;
  if (s < e) {
    if (policy.days.includes(day) && hour >= s && hour < e) {
      const endsAt = zonedTimeToUTC(z.year, z.month, z.day, e, tz);
      return { active: true, endsAt };
    }
    return { active: false, endsAt: null };
  }
  // s >= e: window crosses midnight (or covers full 24h when s===e).
  if (policy.days.includes(day) && hour >= s) {
    // Date.UTC handles day overflow (day+1 in a month roll-over) and
    // zonedTimeToUTC re-anchors it back to the founder's zone.
    const endsAt = zonedTimeToUTC(z.year, z.month, z.day + 1, e, tz);
    return { active: true, endsAt };
  }
  const prevDay = (day + 6) % 7;
  if (policy.days.includes(prevDay) && hour < e) {
    const endsAt = zonedTimeToUTC(z.year, z.month, z.day, e, tz);
    return { active: true, endsAt };
  }
  return { active: false, endsAt: null };
}

/**
 * Task #517 — synchronous "is currently snoozed?" check used by
 * `bumpSnoozeSuppressed` and the digest/post-cleanup paths after
 * `evaluateAndMaybeAutoExtendSnooze` has already had a chance to
 * persist any auto-extension. Considers both an explicit `snoozeUntil`
 * in the future AND an active `weekday_mute` policy window.
 */
function isSnoozed(
  cfg: AudienceArchiveDeletionNotifierConfig,
  nowMs: number,
): boolean {
  if (cfg.snoozeUntil) {
    const t = Date.parse(cfg.snoozeUntil);
    if (Number.isFinite(t) && t > nowMs) return true;
  }
  const policy = cfg.snoozePolicy ?? { kind: "fixed" };
  if (policy.kind === "weekday_mute") {
    return isInWeekdayMuteWindow(policy, new Date(nowMs)).active;
  }
  return false;
}

export interface EvaluatedSnooze {
  cfg: AudienceArchiveDeletionNotifierConfig;
  snoozed: boolean;
  source: SnoozeSource | null;
  effectiveUntil: string | null;
  /**
   * Task #621 — true when the snooze decision was driven by the central
   * Founder PTO mode (vs. the per-notifier own-snooze). Callers use
   * this to bump the persistent PTO suppression log on swallow.
   */
  byPto?: boolean;
}

/**
 * Task #516 — compute "is this notifier currently snoozed?" given the
 * config and policy, auto-extending the fixed timestamp when the
 * `auto_extend` policy is active and the previous window has elapsed.
 * If an auto-extension fires, the updated config row is persisted and
 * returned so the caller can use the fresh state.
 */
export async function evaluateAndMaybeAutoExtendSnooze(
  cfg: AudienceArchiveDeletionNotifierConfig,
  now: Date,
): Promise<EvaluatedSnooze> {
  // Task #563 — central PTO mode acts as an additional OR-gate. When
  // the founder has enrolled this notifier into PTO mode and the global
  // window is active, treat as snoozed (per-notifier state untouched).
  // Import is lazy to keep the module DAG free of cycles.
  try {
    const { isNotifierMutedByPto } = await import("./founder-pto-mode-service");
    const ptoSnooze = await isNotifierMutedByPto(
      "audience_archive_deletion",
      now,
    );
    if (ptoSnooze) {
      return {
        cfg,
        snoozed: true,
        source: ptoSnooze.source,
        effectiveUntil: ptoSnooze.effectiveUntil,
        byPto: true,
      };
    }
  } catch (err) {
    console.error(
      "[audience-archive-deletion-notifier] PTO mode check failed:",
      (err as Error)?.message ?? err,
    );
  }

  const nowMs = now.getTime();
  const policy = cfg.snoozePolicy ?? { kind: "fixed" };

  if (policy.kind === "weekday_mute") {
    const w = isInWeekdayMuteWindow(policy, now);
    if (w.active) {
      return {
        cfg,
        snoozed: true,
        source: "weekday_window",
        effectiveUntil: w.endsAt ? w.endsAt.toISOString() : null,
      };
    }
    // Outside the recurring window — fall through to any explicit
    // snoozeUntil the founder may also have set.
  }

  if (cfg.snoozeUntil) {
    const t = Date.parse(cfg.snoozeUntil);
    if (Number.isFinite(t)) {
      if (t > nowMs) {
        return {
          cfg,
          snoozed: true,
          source: cfg.lastSnoozeSource ?? "manual",
          effectiveUntil: cfg.snoozeUntil,
        };
      }
      // Snooze expired. Auto-extend if policy says so; otherwise
      // (Task #562) close any open snooze-log row with reason
      // "expired" so the founder can see the window ended naturally
      // and what it swallowed.
      if (policy.kind !== "auto_extend") {
        try {
          const raw = await getRawStoredCounters();
          await closeOpenSnoozeLog({
            endedAt: now,
            endedReason: "expired",
            counters: raw,
          });
        } catch (err) {
          console.error(
            "[audience-archive-deletion-notifier] failed to close expired snooze log:",
            (err as Error)?.message ?? err,
          );
        }
      }
      if (policy.kind === "auto_extend") {
        const newUntilMs =
          nowMs + Math.max(1, policy.extendDays) * 24 * 60 * 60 * 1000;
        const newUntil = new Date(newUntilMs).toISOString();
        const updated: AudienceArchiveDeletionNotifierConfig = {
          ...cfg,
          snoozeUntil: newUntil,
          lastSnoozeSource: "auto",
          updatedAt: new Date().toISOString(),
        };
        try {
          await persistConfig(updated, cfg.updatedBy);
        } catch (err) {
          console.error(
            "[audience-archive-deletion-notifier] auto-extend persist failed:",
            (err as Error)?.message ?? err,
          );
          // Even if persistence fails, honor the snooze in-memory for
          // this tick so we don't suddenly send the email we just
          // promised to suppress.
        }
        return {
          cfg: updated,
          snoozed: true,
          source: "auto",
          effectiveUntil: newUntil,
        };
      }
    }
  }

  return { cfg, snoozed: false, source: null, effectiveUntil: null };
}

/**
 * Task #517 — bump the suppressed-alert counters during an active
 * snooze window. Called from the digest + post-cleanup paths when the
 * `snoozed` branch fires. No-op if not currently snoozed (defensive).
 */
async function bumpSnoozeSuppressed(
  cfg: AudienceArchiveDeletionNotifierConfig,
  files: number,
  bytes: number,
  nowMs: number,
): Promise<void> {
  if (!isSnoozed(cfg, nowMs)) return;
  const next: AudienceArchiveDeletionNotifierConfig = {
    ...cfg,
    snoozeSuppressedCount: cfg.snoozeSuppressedCount + 1,
    snoozeSuppressedFiles: cfg.snoozeSuppressedFiles + Math.max(0, files),
    snoozeSuppressedBytes: cfg.snoozeSuppressedBytes + Math.max(0, bytes),
  };
  try {
    await persistConfig(next, cfg.updatedBy);
  } catch (err) {
    console.error(
      "[audience-archive-deletion-notifier] failed to bump snooze counters:",
      (err as Error)?.message ?? err,
    );
  }
}

/* ---------------------------------------------------------------- */
/* Snooze recap (Task #561)                                          */
/* ---------------------------------------------------------------- */

export type SnoozeRecapTrigger =
  | "manual_unsnooze"
  | "natural_expiry"
  | "replaced";

export interface SnoozeRecapResult {
  recapSent: boolean;
  reason:
    | "sent"
    | "disabled"
    | "no_recipients"
    | "no_counters"
    | "still_snoozed"
    | "already_recapped"
    | "no_snooze_window"
    | "send_failed";
  suppressedCount: number;
  suppressedFiles: number;
  suppressedBytes: number;
  trigger: SnoozeRecapTrigger | null;
  errorMessage: string | null;
}

/**
 * Task #561 — best-effort send of the "snooze ended, here's what got
 * swallowed" recap email. Caller is responsible for advancing
 * `lastSnoozeRecapAt` on the config row (we don't persist here so the
 * setSnooze path can fold the recap result into its own write).
 *
 * Returns a structured result so the caller can log / decide whether
 * to advance dedup state.
 */
async function attemptSnoozeRecap(
  cfg: AudienceArchiveDeletionNotifierConfig,
  now: Date,
  trigger: SnoozeRecapTrigger,
): Promise<SnoozeRecapResult> {
  const base: SnoozeRecapResult = {
    recapSent: false,
    reason: "disabled",
    suppressedCount: cfg.snoozeSuppressedCount,
    suppressedFiles: cfg.snoozeSuppressedFiles,
    suppressedBytes: cfg.snoozeSuppressedBytes,
    trigger,
    errorMessage: null,
  };
  if (!cfg.enabled) return base;
  if (cfg.recipients.length === 0) return { ...base, reason: "no_recipients" };
  if (!cfg.snoozeStartedAt) return { ...base, reason: "no_snooze_window" };
  if (
    cfg.snoozeSuppressedCount === 0 &&
    cfg.snoozeSuppressedFiles === 0 &&
    cfg.snoozeSuppressedBytes === 0
  ) {
    return { ...base, reason: "no_counters" };
  }
  const startedMs = Date.parse(cfg.snoozeStartedAt);
  const endedMs = now.getTime();
  const durationMs = Math.max(0, endedMs - (Number.isFinite(startedMs) ? startedMs : endedMs));
  try {
    await emailService.sendAudienceArchiveSnoozeRecap(cfg.recipients, {
      suppressedCount: cfg.snoozeSuppressedCount,
      suppressedFiles: cfg.snoozeSuppressedFiles,
      suppressedBytes: cfg.snoozeSuppressedBytes,
      snoozeStartedAt: cfg.snoozeStartedAt,
      snoozeEndedAt: new Date(endedMs).toISOString(),
      durationMs,
      trigger,
    });
    recordHistory({
      kind: "snooze_recap",
      reason: "sent",
      notified: true,
      recipients: cfg.recipients,
      fileCount: cfg.snoozeSuppressedFiles,
      totalBytes: cfg.snoozeSuppressedBytes,
      earliestExpiryIso: null,
      errorMessage: `trigger:${trigger};count:${cfg.snoozeSuppressedCount}`,
    });
    return {
      ...base,
      recapSent: true,
      reason: "sent",
    };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      "[audience-archive-deletion-notifier] snooze recap send failed:",
      msg,
    );
    recordHistory({
      kind: "snooze_recap",
      reason: "send_failed",
      notified: false,
      recipients: cfg.recipients,
      fileCount: cfg.snoozeSuppressedFiles,
      totalBytes: cfg.snoozeSuppressedBytes,
      earliestExpiryIso: null,
      errorMessage: `trigger:${trigger};${msg}`,
    });
    return { ...base, reason: "send_failed", errorMessage: msg };
  }
}

/**
 * Task #561 — called from the audience-retention sweeper tick. When a
 * previously-active snooze window has expired naturally (snoozeUntil
 * in the past AND not still snoozed by a weekday/auto policy) and
 * non-zero suppressed counters are recorded for that window, sends
 * the recap email and clears the window state. Dedup is keyed off
 * `snoozeStartedAt` via `lastSnoozeRecapAt`.
 *
 * Safe to call on every tick: returns `still_snoozed` /
 * `already_recapped` / `no_snooze_window` / `no_counters` without
 * sending in the common no-op cases.
 */
export async function runSnoozeRecapIfDue(opts: {
  now?: Date;
} = {}): Promise<SnoozeRecapResult> {
  const now = opts.now ?? new Date();
  const cfg = await loadStoredConfig();
  if (!cfg.snoozeStartedAt) {
    return {
      recapSent: false,
      reason: "no_snooze_window",
      suppressedCount: 0,
      suppressedFiles: 0,
      suppressedBytes: 0,
      trigger: null,
      errorMessage: null,
    };
  }
  if (cfg.lastSnoozeRecapAt === cfg.snoozeStartedAt) {
    return {
      recapSent: false,
      reason: "already_recapped",
      suppressedCount: cfg.snoozeSuppressedCount,
      suppressedFiles: cfg.snoozeSuppressedFiles,
      suppressedBytes: cfg.snoozeSuppressedBytes,
      trigger: null,
      errorMessage: null,
    };
  }
  // Evaluate snooze policy (this may auto-extend a fixed snooze that
  // ran past its expiry under `auto_extend`, persisting the new
  // window). If we're still snoozed, the recap isn't due yet.
  const evald = await evaluateAndMaybeAutoExtendSnooze(cfg, now);
  if (evald.snoozed) {
    return {
      recapSent: false,
      reason: "still_snoozed",
      suppressedCount: evald.cfg.snoozeSuppressedCount,
      suppressedFiles: evald.cfg.snoozeSuppressedFiles,
      suppressedBytes: evald.cfg.snoozeSuppressedBytes,
      trigger: null,
      errorMessage: null,
    };
  }
  const result = await attemptSnoozeRecap(evald.cfg, now, "natural_expiry");
  // Whether or not we actually sent an email, advance the dedup
  // pointer + clear the elapsed window state so we don't scan it on
  // every subsequent tick. Exception: if the send failed, leave
  // `lastSnoozeRecapAt` alone so the next tick will retry.
  const shouldAdvance =
    result.recapSent || result.reason === "no_counters" || result.reason === "no_recipients" || result.reason === "disabled";
  if (shouldAdvance) {
    const cleared: AudienceArchiveDeletionNotifierConfig = {
      ...evald.cfg,
      snoozeUntil: null,
      snoozeStartedAt: null,
      snoozeSuppressedCount: 0,
      snoozeSuppressedFiles: 0,
      snoozeSuppressedBytes: 0,
      lastSnoozeRecapAt: evald.cfg.snoozeStartedAt,
      lastSnoozeSource: null,
    };
    try {
      await persistConfig(cleared, evald.cfg.updatedBy);
    } catch (err) {
      console.error(
        "[audience-archive-deletion-notifier] failed to clear recapped snooze window:",
        (err as Error)?.message ?? err,
      );
    }
  }
  return result;
}

/* ---------------------------------------------------------------- */
/* History (in-memory ring buffer)                                   */
/* ---------------------------------------------------------------- */

export type NotifierEventKind =
  | "digest"
  | "post_cleanup"
  | "test"
  | "snooze_recap";
export type NotifierEventReason =
  | "sent"
  | "disabled"
  | "snoozed"
  | "no_recipients"
  | "no_pending_deletions"
  | "deduplicated"
  | "below_threshold"
  | "send_failed";

export interface AudienceArchiveDeletionNotifierHistoryEntry {
  id: string;
  kind: NotifierEventKind;
  reason: NotifierEventReason;
  notified: boolean;
  recipients: string[];
  fileCount: number;
  totalBytes: number;
  earliestExpiryIso: string | null;
  errorMessage: string | null;
  /**
   * Task #516. Only populated when `reason === "snoozed"`. Tells the
   * founder whether the email was suppressed because they explicitly
   * muted (`"manual"`), the auto-extend policy bumped the window
   * (`"auto"`), or the recurring weekday-mute window is currently
   * active (`"weekday_window"`).
   */
  snoozeSource: SnoozeSource | null;
  occurredAt: string;
}

const history: AudienceArchiveDeletionNotifierHistoryEntry[] = [];
let historySeq = 0;

function recordHistory(
  partial: Omit<
    AudienceArchiveDeletionNotifierHistoryEntry,
    "id" | "occurredAt" | "snoozeSource"
  > & { snoozeSource?: SnoozeSource | null },
): AudienceArchiveDeletionNotifierHistoryEntry {
  historySeq += 1;
  const entry: AudienceArchiveDeletionNotifierHistoryEntry = {
    ...partial,
    snoozeSource: partial.snoozeSource ?? null,
    id: `arcnotif_${Date.now().toString(36)}_${historySeq.toString(36)}`,
    occurredAt: new Date().toISOString(),
  };
  history.unshift(entry);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  return entry;
}

export function getAudienceArchiveDeletionNotifierHistory(
  limit = 20,
): AudienceArchiveDeletionNotifierHistoryEntry[] {
  const n = Math.max(1, Math.min(HISTORY_MAX, Math.floor(limit) || 20));
  return history.slice(0, n);
}

export function resetAudienceArchiveDeletionNotifierHistoryForTests(): void {
  history.length = 0;
  historySeq = 0;
}

/* ---------------------------------------------------------------- */
/* Task #562 — persistent snooze-window log                          */
/* ---------------------------------------------------------------- */

/**
 * Read the suppressed counters straight from the stored config row,
 * WITHOUT the auto-zero-on-expiry behavior of
 * `getAudienceArchiveDeletionNotifierConfig`. Used when snapshotting
 * a closing snooze-log row so the founder sees what the window
 * actually swallowed (not the dashboard-friendly zeroed view).
 */
async function getRawStoredCounters(): Promise<{
  snoozeSuppressedCount: number;
  snoozeSuppressedFiles: number;
  snoozeSuppressedBytes: number;
}> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_DELETION_NOTIFIER_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) {
      return { snoozeSuppressedCount: 0, snoozeSuppressedFiles: 0, snoozeSuppressedBytes: 0 };
    }
    const p = JSON.parse(rows[0].value || "{}");
    return {
      snoozeSuppressedCount: clampInt(p.snoozeSuppressedCount, 0, Number.MAX_SAFE_INTEGER, 0),
      snoozeSuppressedFiles: clampInt(p.snoozeSuppressedFiles, 0, Number.MAX_SAFE_INTEGER, 0),
      snoozeSuppressedBytes: clampInt(p.snoozeSuppressedBytes, 0, Number.MAX_SAFE_INTEGER, 0),
    };
  } catch {
    return { snoozeSuppressedCount: 0, snoozeSuppressedFiles: 0, snoozeSuppressedBytes: 0 };
  }
}

let snoozeLogSeq = 0;
function newSnoozeId(): string {
  snoozeLogSeq += 1;
  return `arcsnooze_${Date.now().toString(36)}_${snoozeLogSeq.toString(36)}`;
}

async function openSnoozeLog(input: {
  startedAt: Date;
  snoozeUntil: string | null;
  policy: SnoozePolicy;
  source: SnoozeSource;
  createdBy: string | null;
}): Promise<void> {
  const policyExtendDays =
    input.policy.kind === "auto_extend" ? input.policy.extendDays : null;
  const policyDays =
    input.policy.kind === "weekday_mute" ? input.policy.days : null;
  const policyStartHour =
    input.policy.kind === "weekday_mute" ? input.policy.startHour : null;
  const policyEndHour =
    input.policy.kind === "weekday_mute" ? input.policy.endHour : null;
  await db.insert(audienceArchiveNotifierSnoozeLog).values({
    snoozeId: newSnoozeId(),
    startedAt: input.startedAt,
    endedAt: null,
    endedReason: null,
    source: input.source,
    policyKind: input.policy.kind,
    policyExtendDays,
    policyDays,
    policyStartHour,
    policyEndHour,
    snoozeUntil: input.snoozeUntil ? new Date(input.snoozeUntil) : null,
    createdBy: input.createdBy,
    suppressedCount: 0,
    suppressedFiles: 0,
    suppressedBytes: 0,
  });
}

async function closeOpenSnoozeLog(input: {
  endedAt: Date;
  endedReason: "expired" | "replaced" | "unsnoozed" | "cleared";
  counters: {
    snoozeSuppressedCount: number;
    snoozeSuppressedFiles: number;
    snoozeSuppressedBytes: number;
  };
}): Promise<number> {
  const res: any = await db
    .update(audienceArchiveNotifierSnoozeLog)
    .set({
      endedAt: input.endedAt,
      endedReason: input.endedReason,
      suppressedCount: input.counters.snoozeSuppressedCount,
      suppressedFiles: input.counters.snoozeSuppressedFiles,
      suppressedBytes: Math.min(
        input.counters.snoozeSuppressedBytes,
        2_147_483_647,
      ),
    })
    .where(isNull(audienceArchiveNotifierSnoozeLog.endedAt));
  return (res?.rowCount as number) ?? 0;
}

export interface AudienceArchiveDeletionSnoozeLogEntry {
  id: string;
  snoozeId: string;
  startedAt: string;
  endedAt: string | null;
  endedReason: "expired" | "replaced" | "unsnoozed" | "cleared" | null;
  source: SnoozeSource;
  policyKind: "fixed" | "auto_extend" | "weekday_mute";
  policyExtendDays: number | null;
  policyDays: number[] | null;
  policyStartHour: number | null;
  policyEndHour: number | null;
  snoozeUntil: string | null;
  createdBy: string | null;
  /**
   * Task #672 — human-readable identity for `createdBy`, resolved by
   * joining the raw id against `admin_staff` (matched by id OR by
   * email/username so legacy session payloads still resolve). Null when
   * no match exists — the UI falls back to the raw id.
   */
  createdByDisplayName: string | null;
  createdByEmail: string | null;
  suppressedCount: number;
  suppressedFiles: number;
  suppressedBytes: number;
}

function toEntry(
  row: AudienceArchiveNotifierSnoozeLogRow,
): AudienceArchiveDeletionSnoozeLogEntry {
  const kind =
    row.policyKind === "auto_extend" || row.policyKind === "weekday_mute"
      ? row.policyKind
      : "fixed";
  const source: SnoozeSource =
    row.source === "auto" || row.source === "weekday_window"
      ? row.source
      : "manual";
  const endedReason =
    row.endedReason === "expired" ||
    row.endedReason === "replaced" ||
    row.endedReason === "unsnoozed" ||
    row.endedReason === "cleared"
      ? row.endedReason
      : null;
  return {
    id: row.id,
    snoozeId: row.snoozeId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    endedReason,
    source,
    policyKind: kind,
    policyExtendDays: row.policyExtendDays ?? null,
    policyDays: row.policyDays ?? null,
    policyStartHour: row.policyStartHour ?? null,
    policyEndHour: row.policyEndHour ?? null,
    snoozeUntil: row.snoozeUntil ? row.snoozeUntil.toISOString() : null,
    createdBy: row.createdBy ?? null,
    createdByDisplayName: null,
    createdByEmail: null,
    suppressedCount: row.suppressedCount ?? 0,
    suppressedFiles: row.suppressedFiles ?? 0,
    suppressedBytes: row.suppressedBytes ?? 0,
  };
}

export async function listAudienceArchiveDeletionSnoozeLog(
  limit = 10,
): Promise<AudienceArchiveDeletionSnoozeLogEntry[]> {
  const n = Math.max(1, Math.min(50, Math.floor(limit) || 10));
  try {
    const rows = await db
      .select()
      .from(audienceArchiveNotifierSnoozeLog)
      .orderBy(desc(audienceArchiveNotifierSnoozeLog.startedAt))
      .limit(n);
    const identityById = await resolveAdminIdentities(
      rows.map((r) => r.createdBy),
    );
    return rows.map((row) => {
      const entry = toEntry(row);
      const raw = entry.createdBy;
      const ident = raw ? identityById.get(raw) ?? null : null;
      entry.createdByDisplayName = ident?.displayName ?? null;
      entry.createdByEmail = ident?.email ?? null;
      return entry;
    });
  } catch (err) {
    console.error(
      "[audience-archive-deletion-notifier] failed to read snooze log:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

/**
 * Task #562 — bounded retention sweep for the snooze-window log.
 * Called from the audience retention sweeper on the same daily cadence
 * as the other audit-history tables. A row is eligible for pruning
 * only when it has CLOSED (endedAt is set) and its endedAt is older
 * than the cutoff — never deletes an open window mid-snooze.
 */
export async function pruneAudienceArchiveDeletionSnoozeLogOlderThan(
  cutoff: Date,
): Promise<number> {
  const res: any = await db
    .delete(audienceArchiveNotifierSnoozeLog)
    .where(
      and(
        lt(audienceArchiveNotifierSnoozeLog.endedAt, cutoff),
      ),
    );
  return (res?.rowCount as number) ?? 0;
}

export async function clearAudienceArchiveDeletionSnoozeLogForTests(): Promise<void> {
  try {
    await db.delete(audienceArchiveNotifierSnoozeLog);
  } catch {
    /* best-effort */
  }
}

/* ---------------------------------------------------------------- */
/* Digest                                                            */
/* ---------------------------------------------------------------- */

function digestSignature(batchFileCount: number, earliestExpiryIso: string | null): string {
  return `${batchFileCount}|${earliestExpiryIso ?? "none"}`;
}

export interface RunUpcomingExpiryDigestResult {
  notified: boolean;
  reason: NotifierEventReason;
  recipients: string[];
  fileCount: number;
  totalBytes: number;
  earliestExpiryIso: string | null;
}

/**
 * Check the current archive stats and, if any files are scheduled to
 * be deleted within the warning window AND the dedup window has
 * elapsed (or the batch signature has changed), send a digest email.
 *
 * Safe to call on every retention-sweeper tick — when nothing's due or
 * the digest was already sent recently, it returns a `deduplicated` /
 * `no_pending_deletions` result without sending.
 */
export async function runUpcomingExpiryDigest(opts: {
  now?: Date;
  statsLoader?: () => Promise<AudienceArchiveStats>;
  triggeredBy?: string | null;
} = {}): Promise<RunUpcomingExpiryDigestResult> {
  const cfg = await getAudienceArchiveDeletionNotifierConfig();
  const baseResult: RunUpcomingExpiryDigestResult = {
    notified: false,
    reason: "disabled",
    recipients: cfg.recipients,
    fileCount: 0,
    totalBytes: 0,
    earliestExpiryIso: null,
  };
  if (!cfg.enabled) {
    recordHistory({ kind: "digest", ...baseResult, errorMessage: null });
    return baseResult;
  }
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  // Task #516 — evaluate first so an `auto_extend` policy can push
  // snoozeUntil forward (persisted) before we decide whether to send.
  // Task #517 — when snoozed we still load stats below so we can record
  // how many files / bytes the swallowed digest WOULD have warned about,
  // then return early with `snoozed`.
  const snoozeEval = await evaluateAndMaybeAutoExtendSnooze(cfg, now);
  const cfgAfterSnooze = snoozeEval.cfg;
  const snoozedNow = snoozeEval.snoozed;
  const snoozeUntilForLog =
    snoozeEval.effectiveUntil ?? cfgAfterSnooze.snoozeUntil;
  const snoozeSource = snoozeEval.source;
  if (!snoozedNow && cfgAfterSnooze.recipients.length === 0) {
    const r = { ...baseResult, reason: "no_recipients" as const };
    recordHistory({ kind: "digest", ...r, errorMessage: null });
    return r;
  }

  let stats: AudienceArchiveStats;
  try {
    stats = await (opts.statsLoader ?? getArchiveStats)();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    if (snoozedNow) {
      // Can't measure what we would have warned about, but we still
      // suppress the alert. Record snoozed without bumping counters.
      const r = { ...baseResult, reason: "snoozed" as const };
      recordHistory({
        kind: "digest",
        ...r,
        errorMessage: `snoozed_until:${snoozeUntilForLog}`,
        snoozeSource,
      });
      return r;
    }
    const r = { ...baseResult, reason: "send_failed" as const };
    recordHistory({ kind: "digest", ...r, errorMessage: `stats_load_failed: ${msg}` });
    return r;
  }

  const batch = stats.nextExpiryBatch;
  const fileCount = batch.fileCount;
  const totalBytes = batch.totalBytes;
  const earliestExpiryIso = batch.earliestExpiryIso;

  if (snoozedNow) {
    // Only count a snooze-suppression when a digest would actually
    // have been sent (i.e. files are due in the warning window). A
    // run with `fileCount === 0` wouldn't have emailed anyway.
    if (fileCount > 0) {
      await bumpSnoozeSuppressed(cfgAfterSnooze, fileCount, totalBytes, nowMs);
      // Task #621 — also persist a row to the founder PTO suppression
      // log when this snooze was driven by central PTO mode (not the
      // notifier's own per-config snooze) so the founder dashboard can
      // show the swallow with context.
      if (snoozeEval.byPto) {
        try {
          const { bumpFounderPtoSuppressedCount } = await import(
            "./founder-pto-mode-service"
          );
          await bumpFounderPtoSuppressedCount({
            notifierId: "audience_archive_deletion",
            source: snoozeSource,
            effectiveUntil: snoozeUntilForLog,
            summary: `Upcoming-expiry digest: ${fileCount} file(s) (${totalBytes} bytes) would have been warned`,
            payload: {
              kind: "digest",
              fileCount,
              totalBytes,
              earliestExpiryIso,
            },
          });
        } catch (err) {
          console.error(
            "[audience-archive-deletion-notifier] PTO suppression log failed:",
            (err as Error)?.message ?? err,
          );
        }
      }
    }
    const r = {
      ...baseResult,
      reason: "snoozed" as const,
      fileCount,
      totalBytes,
      earliestExpiryIso,
    };
    recordHistory({
      kind: "digest",
      ...r,
      errorMessage: `snoozed_until:${snoozeUntilForLog}`,
      snoozeSource,
    });
    return r;
  }

  if (fileCount === 0) {
    const r = {
      ...baseResult,
      reason: "no_pending_deletions" as const,
      fileCount,
      totalBytes,
      earliestExpiryIso,
    };
    recordHistory({ kind: "digest", ...r, errorMessage: null });
    return r;
  }

  const intervalMs = cfg.digestIntervalHours * 60 * 60 * 1000;
  const sig = digestSignature(fileCount, earliestExpiryIso);
  const lastDigestMs = cfg.lastDigestAt ? Date.parse(cfg.lastDigestAt) : NaN;
  const withinWindow = Number.isFinite(lastDigestMs) && nowMs - lastDigestMs < intervalMs;
  const sameSignature = cfg.lastDigestSignature === sig;
  if (withinWindow && sameSignature) {
    const r = {
      ...baseResult,
      reason: "deduplicated" as const,
      fileCount,
      totalBytes,
      earliestExpiryIso,
    };
    recordHistory({ kind: "digest", ...r, errorMessage: null });
    return r;
  }

  try {
    await emailService.sendAudienceArchiveExpiryDigest(cfg.recipients, {
      fileCount,
      totalBytes,
      earliestExpiryIso,
      warningLeadDays: stats.nextExpiryBatch.withinDays,
      retentionDays: stats.policy.retentionDays,
      autoDeleteEnabled: stats.policy.autoDeleteEnabled,
      triggeredBy: opts.triggeredBy ?? null,
    });
    const updated: AudienceArchiveDeletionNotifierConfig = {
      ...cfgAfterSnooze,
      lastDigestAt: new Date(nowMs).toISOString(),
      lastDigestSignature: sig,
    };
    await persistConfig(updated, cfgAfterSnooze.updatedBy);
    const r: RunUpcomingExpiryDigestResult = {
      notified: true,
      reason: "sent",
      recipients: cfg.recipients,
      fileCount,
      totalBytes,
      earliestExpiryIso,
    };
    recordHistory({ kind: "digest", ...r, errorMessage: null });
    return r;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error("[audience-archive-deletion-notifier] digest send failed:", msg);
    const r = {
      ...baseResult,
      reason: "send_failed" as const,
      fileCount,
      totalBytes,
      earliestExpiryIso,
    };
    recordHistory({ kind: "digest", ...r, errorMessage: msg });
    return r;
  }
}

/* ---------------------------------------------------------------- */
/* Post-cleanup summary                                              */
/* ---------------------------------------------------------------- */

export interface NotifyPostCleanupResult {
  notified: boolean;
  reason: NotifierEventReason;
  recipients: string[];
  deletedFiles: number;
  bytesDeleted: number;
}

export async function notifyPostCleanup(
  result: AudienceArchiveCleanupResult,
): Promise<NotifyPostCleanupResult> {
  const cfg = await getAudienceArchiveDeletionNotifierConfig();
  const base: NotifyPostCleanupResult = {
    notified: false,
    reason: "disabled",
    recipients: cfg.recipients,
    deletedFiles: result.deletedFiles,
    bytesDeleted: result.bytesDeleted,
  };
  if (!cfg.enabled) {
    recordHistory({
      kind: "post_cleanup",
      ...base,
      fileCount: result.deletedFiles,
      totalBytes: result.bytesDeleted,
      earliestExpiryIso: null,
      errorMessage: null,
    });
    return base;
  }
  const now = new Date();
  const nowMs = now.getTime();
  const snoozeEval = await evaluateAndMaybeAutoExtendSnooze(cfg, now);
  const cfgAfterSnooze = snoozeEval.cfg;
  if (snoozeEval.snoozed) {
    // Task #517: only count it as a "suppressed alert" when this
    // cleanup WOULD actually have emailed (real deletion crossing one
    // of the thresholds). Dry-runs, skipped cleanups, and below-
    // threshold runs would have stayed quiet even without snooze.
    const wouldHaveEmailed =
      !result.dryRun &&
      !result.skippedReason &&
      result.deletedFiles > 0 &&
      ((cfgAfterSnooze.postCleanupFileThreshold > 0 &&
        result.deletedFiles >= cfgAfterSnooze.postCleanupFileThreshold) ||
        (cfgAfterSnooze.postCleanupBytesThreshold > 0 &&
          result.bytesDeleted >= cfgAfterSnooze.postCleanupBytesThreshold));
    if (wouldHaveEmailed) {
      await bumpSnoozeSuppressed(
        cfgAfterSnooze,
        result.deletedFiles,
        result.bytesDeleted,
        nowMs,
      );
      if (snoozeEval.byPto) {
        try {
          const { bumpFounderPtoSuppressedCount } = await import(
            "./founder-pto-mode-service"
          );
          await bumpFounderPtoSuppressedCount({
            notifierId: "audience_archive_deletion",
            source: snoozeEval.source,
            effectiveUntil:
              snoozeEval.effectiveUntil ?? snoozeEval.cfg.snoozeUntil,
            summary: `Post-cleanup summary: ${result.deletedFiles} file(s) (${result.bytesDeleted} bytes) deleted by ${result.trigger}`,
            payload: {
              kind: "post_cleanup",
              deletedFiles: result.deletedFiles,
              bytesDeleted: result.bytesDeleted,
              trigger: result.trigger,
              retentionDays: result.retentionDays,
            },
          });
        } catch (err) {
          console.error(
            "[audience-archive-deletion-notifier] PTO suppression log failed:",
            (err as Error)?.message ?? err,
          );
        }
      }
    }
    const r = { ...base, reason: "snoozed" as const };
    recordHistory({
      kind: "post_cleanup",
      ...r,
      fileCount: result.deletedFiles,
      totalBytes: result.bytesDeleted,
      earliestExpiryIso: null,
      errorMessage: `snoozed_until:${snoozeEval.effectiveUntil ?? snoozeEval.cfg.snoozeUntil}`,
      snoozeSource: snoozeEval.source,
    });
    return r;
  }
  if (cfg.recipients.length === 0) {
    const r = { ...base, reason: "no_recipients" as const };
    recordHistory({
      kind: "post_cleanup",
      ...r,
      fileCount: result.deletedFiles,
      totalBytes: result.bytesDeleted,
      earliestExpiryIso: null,
      errorMessage: null,
    });
    return r;
  }

  // Dry-runs and skipped cleanups have nothing to report. Real deletions
  // below both thresholds also stay quiet.
  if (result.dryRun || result.skippedReason || result.deletedFiles === 0) {
    const r = { ...base, reason: "below_threshold" as const };
    recordHistory({
      kind: "post_cleanup",
      ...r,
      fileCount: result.deletedFiles,
      totalBytes: result.bytesDeleted,
      earliestExpiryIso: null,
      errorMessage: null,
    });
    return r;
  }
  const overFileThreshold =
    cfg.postCleanupFileThreshold > 0 &&
    result.deletedFiles >= cfg.postCleanupFileThreshold;
  const overBytesThreshold =
    cfg.postCleanupBytesThreshold > 0 &&
    result.bytesDeleted >= cfg.postCleanupBytesThreshold;
  if (!overFileThreshold && !overBytesThreshold) {
    const r = { ...base, reason: "below_threshold" as const };
    recordHistory({
      kind: "post_cleanup",
      ...r,
      fileCount: result.deletedFiles,
      totalBytes: result.bytesDeleted,
      earliestExpiryIso: null,
      errorMessage: null,
    });
    return r;
  }

  try {
    await emailService.sendAudienceArchiveCleanupSummary(cfg.recipients, {
      deletedFiles: result.deletedFiles,
      bytesDeleted: result.bytesDeleted,
      retentionDays: result.retentionDays,
      cutoffIso: result.cutoffIso,
      trigger: result.trigger,
      candidateFiles: result.candidateFiles,
      errors: result.errors.length,
      fileThreshold: cfg.postCleanupFileThreshold,
      bytesThreshold: cfg.postCleanupBytesThreshold,
      thresholdHit: overFileThreshold ? "files" : "bytes",
    });
    const r: NotifyPostCleanupResult = {
      notified: true,
      reason: "sent",
      recipients: cfg.recipients,
      deletedFiles: result.deletedFiles,
      bytesDeleted: result.bytesDeleted,
    };
    recordHistory({
      kind: "post_cleanup",
      ...r,
      fileCount: result.deletedFiles,
      totalBytes: result.bytesDeleted,
      earliestExpiryIso: null,
      errorMessage: null,
    });
    return r;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      "[audience-archive-deletion-notifier] post-cleanup send failed:",
      msg,
    );
    const r = { ...base, reason: "send_failed" as const };
    recordHistory({
      kind: "post_cleanup",
      ...r,
      fileCount: result.deletedFiles,
      totalBytes: result.bytesDeleted,
      earliestExpiryIso: null,
      errorMessage: msg,
    });
    return r;
  }
}

/* ---------------------------------------------------------------- */
/* Task #612 — manual resend of the last snooze recap                */
/* ---------------------------------------------------------------- */

export interface ResendSnoozeRecapResult {
  recapSent: boolean;
  reason:
    | "sent"
    | "disabled"
    | "no_recipients"
    | "no_prior_recap"
    | "no_counters"
    | "send_failed";
  suppressedCount: number;
  suppressedFiles: number;
  suppressedBytes: number;
  snoozeStartedAt: string | null;
  snoozeEndedAt: string | null;
  trigger: SnoozeRecapTrigger | null;
  recipients: string[];
  errorMessage: string | null;
}

function mapEndedReasonToTrigger(
  reason: AudienceArchiveDeletionSnoozeLogEntry["endedReason"],
): SnoozeRecapTrigger {
  if (reason === "expired") return "natural_expiry";
  if (reason === "replaced") return "replaced";
  // "unsnoozed" and "cleared" and null all map to manual_unsnooze for
  // the email body copy.
  return "manual_unsnooze";
}

/**
 * Task #612 — re-send the recap email for the most recently recapped
 * snooze window. The original recap (sent on natural expiry or
 * unsnooze) advances `lastSnoozeRecapAt` so the scheduler won't fire
 * again; if the email was lost (Resend bounce, founder deleted it,
 * spam folder) there was previously no way to recover it. This
 * function reads the persisted counters from the matching snooze-log
 * row and re-emits the same recap, tagged in history as a manual
 * resend.
 *
 * Does NOT touch `lastSnoozeRecapAt` or any dedup state — repeated
 * calls keep working as long as a prior recap exists. Returns a
 * structured reason so the admin UI can show a clear message.
 */
export async function resendLastSnoozeRecap(opts: {
  now?: Date;
  triggeredBy?: string | null;
} = {}): Promise<ResendSnoozeRecapResult> {
  const cfg = await loadStoredConfig();
  const base: ResendSnoozeRecapResult = {
    recapSent: false,
    reason: "disabled",
    suppressedCount: 0,
    suppressedFiles: 0,
    suppressedBytes: 0,
    snoozeStartedAt: cfg.lastSnoozeRecapAt,
    snoozeEndedAt: null,
    trigger: null,
    recipients: cfg.recipients,
    errorMessage: null,
  };
  if (!cfg.enabled) return base;
  if (cfg.recipients.length === 0) return { ...base, reason: "no_recipients" };
  if (!cfg.lastSnoozeRecapAt) {
    return { ...base, reason: "no_prior_recap" };
  }

  // Find the snooze-log row that recorded the recapped window. The
  // dedup pointer `lastSnoozeRecapAt` is the `snoozeStartedAt` of the
  // window, which equals the snooze-log row's `startedAt`.
  const targetStartedMs = Date.parse(cfg.lastSnoozeRecapAt);
  let matched: AudienceArchiveDeletionSnoozeLogEntry | null = null;
  if (Number.isFinite(targetStartedMs)) {
    try {
      const rows = await listAudienceArchiveDeletionSnoozeLog(50);
      // Pick the closest startedAt (millisecond rounding through
      // Postgres can drift by <1s in practice).
      let bestDelta = Number.POSITIVE_INFINITY;
      for (const row of rows) {
        const ms = Date.parse(row.startedAt);
        if (!Number.isFinite(ms)) continue;
        const delta = Math.abs(ms - targetStartedMs);
        if (delta < bestDelta) {
          bestDelta = delta;
          matched = row;
        }
      }
      // Accept anything within 2 seconds; otherwise treat as missing.
      if (bestDelta > 2_000) matched = null;
    } catch (err) {
      console.error(
        "[audience-archive-deletion-notifier] resend: snooze-log read failed:",
        (err as Error)?.message ?? err,
      );
    }
  }

  if (
    !matched ||
    (matched.suppressedCount === 0 &&
      matched.suppressedFiles === 0 &&
      matched.suppressedBytes === 0)
  ) {
    return {
      ...base,
      reason: "no_counters",
      snoozeStartedAt: matched?.startedAt ?? cfg.lastSnoozeRecapAt,
      snoozeEndedAt: matched?.endedAt ?? null,
    };
  }

  const trigger = mapEndedReasonToTrigger(matched.endedReason);
  const now = opts.now ?? new Date();
  const endedMs = matched.endedAt
    ? Date.parse(matched.endedAt)
    : now.getTime();
  const startedMs = Date.parse(matched.startedAt);
  const durationMs = Math.max(
    0,
    (Number.isFinite(endedMs) ? endedMs : now.getTime()) -
      (Number.isFinite(startedMs) ? startedMs : now.getTime()),
  );
  const triggeredBy = opts.triggeredBy ?? null;
  try {
    await emailService.sendAudienceArchiveSnoozeRecap(cfg.recipients, {
      suppressedCount: matched.suppressedCount,
      suppressedFiles: matched.suppressedFiles,
      suppressedBytes: matched.suppressedBytes,
      snoozeStartedAt: matched.startedAt,
      snoozeEndedAt: matched.endedAt ?? new Date(endedMs).toISOString(),
      durationMs,
      trigger,
    });
    recordHistory({
      kind: "snooze_recap",
      reason: "sent",
      notified: true,
      recipients: cfg.recipients,
      fileCount: matched.suppressedFiles,
      totalBytes: matched.suppressedBytes,
      earliestExpiryIso: null,
      errorMessage: `manual_resend;trigger:${trigger};count:${matched.suppressedCount};by:${triggeredBy ?? "root_admin"}`,
    });
    return {
      recapSent: true,
      reason: "sent",
      suppressedCount: matched.suppressedCount,
      suppressedFiles: matched.suppressedFiles,
      suppressedBytes: matched.suppressedBytes,
      snoozeStartedAt: matched.startedAt,
      snoozeEndedAt: matched.endedAt,
      trigger,
      recipients: cfg.recipients,
      errorMessage: null,
    };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      "[audience-archive-deletion-notifier] manual resend failed:",
      msg,
    );
    recordHistory({
      kind: "snooze_recap",
      reason: "send_failed",
      notified: false,
      recipients: cfg.recipients,
      fileCount: matched.suppressedFiles,
      totalBytes: matched.suppressedBytes,
      earliestExpiryIso: null,
      errorMessage: `manual_resend;trigger:${trigger};${msg}`,
    });
    return {
      recapSent: false,
      reason: "send_failed",
      suppressedCount: matched.suppressedCount,
      suppressedFiles: matched.suppressedFiles,
      suppressedBytes: matched.suppressedBytes,
      snoozeStartedAt: matched.startedAt,
      snoozeEndedAt: matched.endedAt,
      trigger,
      recipients: cfg.recipients,
      errorMessage: msg,
    };
  }
}

/* ---------------------------------------------------------------- */
/* Manual test send                                                  */
/* ---------------------------------------------------------------- */

export interface SendTestResult {
  ok: boolean;
  recipients: string[];
  errorMessage: string | null;
  entry: AudienceArchiveDeletionNotifierHistoryEntry;
}

export async function sendTestArchiveDeletionEmail(): Promise<SendTestResult> {
  const cfg = await getAudienceArchiveDeletionNotifierConfig();
  if (cfg.recipients.length === 0) {
    throw new Error("no_recipients_configured");
  }
  try {
    await emailService.sendAudienceArchiveExpiryDigest(cfg.recipients, {
      fileCount: 0,
      totalBytes: 0,
      earliestExpiryIso: null,
      warningLeadDays: cfg.warningLeadDays,
      retentionDays: 0,
      autoDeleteEnabled: false,
      triggeredBy: "test",
      isTest: true,
    });
    const entry = recordHistory({
      kind: "test",
      reason: "sent",
      notified: true,
      recipients: cfg.recipients,
      fileCount: 0,
      totalBytes: 0,
      earliestExpiryIso: null,
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
      fileCount: 0,
      totalBytes: 0,
      earliestExpiryIso: null,
      errorMessage: msg,
    });
    return { ok: false, recipients: cfg.recipients, errorMessage: msg, entry };
  }
}

/**
 * Task #552 — send a one-off preview of the upcoming-expiry digest using
 * the CURRENT `nextExpiryBatch` stats, so founders can verify formatting
 * in their inbox without waiting for the scheduler tick. Unlike
 * `runUpcomingExpiryDigest`, this never updates `lastDigestAt` /
 * `lastDigestSignature` (no impact on dedup state) and bypasses the
 * snooze / enabled checks — it's an explicit founder action. Recorded
 * in history with `kind: "test"` so it's easy to distinguish from real
 * digest sends.
 */
export async function sendTestArchiveExpiryDigestEmail(opts: {
  statsLoader?: () => Promise<AudienceArchiveStats>;
  triggeredBy?: string | null;
} = {}): Promise<SendTestResult> {
  const cfg = await getAudienceArchiveDeletionNotifierConfig();
  if (cfg.recipients.length === 0) {
    throw new Error("no_recipients_configured");
  }
  let stats: AudienceArchiveStats;
  try {
    stats = await (opts.statsLoader ?? getArchiveStats)();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const entry = recordHistory({
      kind: "test",
      reason: "send_failed",
      notified: false,
      recipients: cfg.recipients,
      fileCount: 0,
      totalBytes: 0,
      earliestExpiryIso: null,
      errorMessage: `stats_load_failed: ${msg}`,
    });
    return { ok: false, recipients: cfg.recipients, errorMessage: msg, entry };
  }
  const batch = stats.nextExpiryBatch;
  try {
    await emailService.sendAudienceArchiveExpiryDigest(cfg.recipients, {
      fileCount: batch.fileCount,
      totalBytes: batch.totalBytes,
      earliestExpiryIso: batch.earliestExpiryIso,
      warningLeadDays: batch.withinDays,
      retentionDays: stats.policy.retentionDays,
      autoDeleteEnabled: stats.policy.autoDeleteEnabled,
      triggeredBy: opts.triggeredBy ?? "test-digest",
      isTest: true,
    });
    const entry = recordHistory({
      kind: "test",
      reason: "sent",
      notified: true,
      recipients: cfg.recipients,
      fileCount: batch.fileCount,
      totalBytes: batch.totalBytes,
      earliestExpiryIso: batch.earliestExpiryIso,
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
      fileCount: batch.fileCount,
      totalBytes: batch.totalBytes,
      earliestExpiryIso: batch.earliestExpiryIso,
      errorMessage: msg,
    });
    return { ok: false, recipients: cfg.recipients, errorMessage: msg, entry };
  }
}
