/**
 * Audience audit-export *history* email staleness alert (Task #524).
 *
 * Task #481 surfaced "last successful delivery age" on the founder
 * dashboard, but if the scheduler tick itself stops firing — worker
 * crash, host reboot, recipients wiped, Resend silently dropping mail
 * without throwing — the panel will just quietly age and nobody is
 * paged. This service fires an alert when the gap between the last
 * successful scheduler-triggered run and "now" exceeds the schedule's
 * cadence + grace window (weekly => >8d, monthly => >32d), and
 * auto-resolves the alert the next time a fresh successful run lands.
 *
 * Mirrors the shape of
 * `audience-audit-history-email-failure-alert-service.ts` so the
 * founder dashboard / banner pattern stays consistent.
 */

import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, platformAlerts, systemSettings } from "@shared/schema";
import {
  audienceAuditHistoryEmailStaleSnoozeLog,
  type AudienceAuditHistoryEmailStaleSnoozeLogRow,
} from "@shared/omni-channel-audience-schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService, emailService } from "./email-service";
import { audienceAuditHistoryEmailScheduler } from "./audience-audit-history-email-scheduler";

export const AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_ALERT_TYPE =
  "audience_audit_history_email_stale";

// Task #637 — per-recipient inbox silence. Distinct from the run-level
// staleness alert above so a single dead mailbox doesn't get hidden
// behind the aggregate "scheduler ran successfully" signal. One
// platform_alerts row per silent inbox, deduped via details.recipient.
export const AUDIENCE_AUDIT_HISTORY_EMAIL_RECIPIENT_STALE_ALERT_TYPE =
  "audience_audit_history_email_recipient_stale";

const ALERT_LINK = "/admin/omni-channel-audience#audit-history";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKLY_ALLOWED_AGE_MS = 8 * DAY_MS; // 7d cadence + 1d grace
const MONTHLY_ALLOWED_AGE_MS = 32 * DAY_MS; // ~30d cadence + 2d grace
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

// Task #570 — snooze the staleness alert during planned downtime
// (maintenance, intentional Resend pause, recipient list being
// rewritten). Mirrors the archive-deletion notifier snooze (Task #474):
// founder can pause the alert for a bounded window without losing the
// schedule itself. Capped at 90d to avoid silent forever-mute.
//
// Task #627 — extended with a `snoozePolicy` mirroring the archive
// deletion notifier (Task #516). `fixed` keeps the old fixed-window
// behavior; `auto_extend` re-rolls `snoozeUntil` on every tick so
// founders on extended PTO don't get paged when the window naturally
// elapses; `weekday_mute` is a recurring weekly window so ops with a
// regular Saturday maintenance window can mute permanently without
// re-snoozing.
export const AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_SNOOZE_SETTING_KEY =
  "audience_audit_history_email_stale_snooze";
export const STALE_SNOOZE_MAX_MS = 90 * DAY_MS;
const MAX_SNOOZE_MS = STALE_SNOOZE_MAX_MS;
export const STALE_SNOOZE_MAX_DAYS = 90;
export const STALE_SNOOZE_MAX_AUTO_EXTEND_DAYS = 30;

/**
 * Task #627. See archive-deletion notifier Task #516 for the original
 * shape. Kept locally instead of importing to avoid coupling the
 * staleness service to the much larger notifier module.
 */
export type StaleSnoozePolicy =
  | { kind: "fixed" }
  | { kind: "auto_extend"; extendDays: number }
  | {
      kind: "weekday_mute";
      days: number[]; // 0=Sun..6=Sat
      startHour: number; // 0..23
      endHour: number; // 0..23
    };

export const DEFAULT_STALE_SNOOZE_POLICY: StaleSnoozePolicy = { kind: "fixed" };

export interface StaleSnoozeConfig {
  snoozeUntil: string | null;
  snoozePolicy: StaleSnoozePolicy;
  updatedAt: string | null;
  updatedBy: string | null;
  // Task #626 — snooze-window recap state. `snoozeStartedAt` marks the
  // beginning of the most recent snooze window; counters track ticks
  // that *would have* paged the founder while snoozed, and
  // `lastSnoozeRecapAt` is the dedup key (set to the `snoozeStartedAt`
  // of the window for which a recap email was already sent). State
  // intentionally survives manual `unsnooze` (snoozeUntil → null) so
  // the next stale tick can still emit the "here's what you missed"
  // recap; setting a NEW snooze resets all of these.
  snoozeStartedAt: string | null;
  snoozeSuppressedTicks: number;
  snoozeMaxSuppressedAgeMs: number | null;
  snoozeLastSuppressedLastSuccessfulRunAt: string | null;
  lastSnoozeRecapAt: string | null;
}

const EMPTY_SNOOZE: StaleSnoozeConfig = {
  snoozeUntil: null,
  snoozePolicy: { ...DEFAULT_STALE_SNOOZE_POLICY },
  updatedAt: null,
  updatedBy: null,
  snoozeStartedAt: null,
  snoozeSuppressedTicks: 0,
  snoozeMaxSuppressedAgeMs: null,
  snoozeLastSuppressedLastSuccessfulRunAt: null,
  lastSnoozeRecapAt: null,
};

function clampInt(
  n: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function parseStaleSnoozePolicy(input: unknown): StaleSnoozePolicy {
  if (!input || typeof input !== "object") return { kind: "fixed" };
  const p = input as Record<string, unknown>;
  if (p.kind === "auto_extend") {
    const extendDays = clampInt(
      p.extendDays,
      1,
      STALE_SNOOZE_MAX_AUTO_EXTEND_DAYS,
      1,
    );
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
    const startHour = clampInt(p.startHour, 0, 23, 0);
    const endHour = clampInt(p.endHour, 0, 23, 24 % 24);
    return { kind: "weekday_mute", days, startHour, endHour };
  }
  return { kind: "fixed" };
}

/**
 * Task #627 — recurring weekday mute window. UTC weekday/hour. If
 * `startHour < endHour` the window is a single-day slice; otherwise
 * it crosses midnight (e.g. 18→8 mutes 18:00 → 08:00 next day).
 */
function isInWeekdayMuteWindow(
  policy: Extract<StaleSnoozePolicy, { kind: "weekday_mute" }>,
  now: Date,
): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const s = policy.startHour;
  const e = policy.endHour;
  if (s < e) {
    return policy.days.includes(day) && hour >= s && hour < e;
  }
  // s >= e: window crosses midnight.
  if (policy.days.includes(day) && hour >= s) return true;
  const prevDay = (day + 6) % 7;
  if (policy.days.includes(prevDay) && hour < e) return true;
  return false;
}

async function readSnoozeConfig(): Promise<StaleSnoozeConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_SNOOZE_SETTING_KEY,
        ),
      )
      .limit(1);
    if (rows.length === 0) return { ...EMPTY_SNOOZE };
    const raw = rows[0].value;
    if (!raw) return { ...EMPTY_SNOOZE };
    const parsed = JSON.parse(raw) as Partial<StaleSnoozeConfig> & {
      snoozePolicy?: unknown;
    };
    const snoozeUntil =
      typeof parsed.snoozeUntil === "string" &&
      !Number.isNaN(Date.parse(parsed.snoozeUntil))
        ? new Date(parsed.snoozeUntil).toISOString()
        : null;
    const snoozeStartedAt =
      typeof parsed.snoozeStartedAt === "string" &&
      !Number.isNaN(Date.parse(parsed.snoozeStartedAt))
        ? new Date(parsed.snoozeStartedAt).toISOString()
        : null;
    const lastSnoozeRecapAt =
      typeof parsed.lastSnoozeRecapAt === "string" &&
      !Number.isNaN(Date.parse(parsed.lastSnoozeRecapAt))
        ? new Date(parsed.lastSnoozeRecapAt).toISOString()
        : null;
    const snoozeSuppressedTicks =
      typeof parsed.snoozeSuppressedTicks === "number" &&
      Number.isFinite(parsed.snoozeSuppressedTicks)
        ? Math.max(0, Math.floor(parsed.snoozeSuppressedTicks))
        : 0;
    const snoozeMaxSuppressedAgeMs =
      typeof parsed.snoozeMaxSuppressedAgeMs === "number" &&
      Number.isFinite(parsed.snoozeMaxSuppressedAgeMs)
        ? Math.max(0, parsed.snoozeMaxSuppressedAgeMs)
        : null;
    const snoozeLastSuppressedLastSuccessfulRunAt =
      typeof parsed.snoozeLastSuppressedLastSuccessfulRunAt === "string"
        ? parsed.snoozeLastSuppressedLastSuccessfulRunAt
        : null;
    return {
      snoozeUntil,
      snoozePolicy: parseStaleSnoozePolicy(parsed.snoozePolicy),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy:
        typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
      snoozeStartedAt,
      snoozeSuppressedTicks,
      snoozeMaxSuppressedAgeMs,
      snoozeLastSuppressedLastSuccessfulRunAt,
      lastSnoozeRecapAt,
    };
  } catch {
    return { ...EMPTY_SNOOZE };
  }
}

async function writeSnoozeConfig(
  cfg: StaleSnoozeConfig,
  now: Date,
): Promise<void> {
  const stored = JSON.stringify(cfg);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_SNOOZE_SETTING_KEY,
      value: stored,
      updatedBy: cfg.updatedBy ?? undefined,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: stored,
        updatedBy: cfg.updatedBy ?? undefined,
        updatedAt: now,
      },
    });
}

export async function getAudienceAuditHistoryEmailStaleSnooze(): Promise<StaleSnoozeConfig> {
  return readSnoozeConfig();
}

/* ---------------------------------------------------------------- */
/* Task #692 — durable snooze-window history                          */
/* ---------------------------------------------------------------- */

let staleSnoozeLogSeq = 0;
function newStaleSnoozeId(): string {
  staleSnoozeLogSeq += 1;
  return `stalesnooze_${Date.now().toString(36)}_${staleSnoozeLogSeq.toString(36)}`;
}

async function openStaleSnoozeLog(input: {
  snoozeStartedAt: Date;
  snoozeUntil: string | null;
  policy: StaleSnoozePolicy;
  createdBy: string | null;
}): Promise<void> {
  try {
    await db.insert(audienceAuditHistoryEmailStaleSnoozeLog).values({
      snoozeId: newStaleSnoozeId(),
      snoozeStartedAt: input.snoozeStartedAt,
      snoozeUntil: input.snoozeUntil ? new Date(input.snoozeUntil) : null,
      endedAt: null,
      endedReason: null,
      policyKind: input.policy.kind,
      policyExtendDays:
        input.policy.kind === "auto_extend" ? input.policy.extendDays : null,
      policyDays:
        input.policy.kind === "weekday_mute" ? input.policy.days : null,
      policyStartHour:
        input.policy.kind === "weekday_mute" ? input.policy.startHour : null,
      policyEndHour:
        input.policy.kind === "weekday_mute" ? input.policy.endHour : null,
      createdBy: input.createdBy,
      suppressedTicks: 0,
      maxAgeMsObserved: null,
      lastSuccessfulRunAtAtClose: null,
    });
  } catch (err) {
    console.error(
      "[audience-audit-history-email-stale] open snooze log failed:",
      (err as Error)?.message ?? err,
    );
  }
}

async function closeOpenStaleSnoozeLog(input: {
  endedAt: Date;
  endedReason: "expired" | "replaced" | "unsnoozed";
  counters: {
    suppressedTicks: number;
    maxAgeMsObserved: number | null;
    lastSuccessfulRunAtAtClose: string | null;
  };
}): Promise<number> {
  try {
    const lastSuccessAt =
      input.counters.lastSuccessfulRunAtAtClose &&
      !Number.isNaN(Date.parse(input.counters.lastSuccessfulRunAtAtClose))
        ? new Date(input.counters.lastSuccessfulRunAtAtClose)
        : null;
    const res: any = await db
      .update(audienceAuditHistoryEmailStaleSnoozeLog)
      .set({
        endedAt: input.endedAt,
        endedReason: input.endedReason,
        suppressedTicks: Math.max(0, input.counters.suppressedTicks),
        maxAgeMsObserved:
          input.counters.maxAgeMsObserved !== null
            ? Math.min(
                Math.max(0, input.counters.maxAgeMsObserved),
                2_147_483_647,
              )
            : null,
        lastSuccessfulRunAtAtClose: lastSuccessAt,
      })
      .where(isNull(audienceAuditHistoryEmailStaleSnoozeLog.endedAt));
    return (res?.rowCount as number) ?? 0;
  } catch (err) {
    console.error(
      "[audience-audit-history-email-stale] close snooze log failed:",
      (err as Error)?.message ?? err,
    );
    return 0;
  }
}

export interface AudienceAuditHistoryEmailStaleSnoozeLogEntry {
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

function toStaleLogEntry(
  row: AudienceAuditHistoryEmailStaleSnoozeLogRow,
): AudienceAuditHistoryEmailStaleSnoozeLogEntry {
  const kind =
    row.policyKind === "auto_extend" || row.policyKind === "weekday_mute"
      ? row.policyKind
      : "fixed";
  const endedReason =
    row.endedReason === "expired" ||
    row.endedReason === "replaced" ||
    row.endedReason === "unsnoozed"
      ? row.endedReason
      : null;
  return {
    id: row.id,
    snoozeId: row.snoozeId,
    snoozeStartedAt: row.snoozeStartedAt.toISOString(),
    snoozeUntil: row.snoozeUntil ? row.snoozeUntil.toISOString() : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    endedReason,
    policyKind: kind,
    policyExtendDays: row.policyExtendDays ?? null,
    policyDays: row.policyDays ?? null,
    policyStartHour: row.policyStartHour ?? null,
    policyEndHour: row.policyEndHour ?? null,
    createdBy: row.createdBy ?? null,
    suppressedTicks: row.suppressedTicks ?? 0,
    maxAgeMsObserved: row.maxAgeMsObserved ?? null,
    lastSuccessfulRunAtAtClose: row.lastSuccessfulRunAtAtClose
      ? row.lastSuccessfulRunAtAtClose.toISOString()
      : null,
  };
}

export async function listAudienceAuditHistoryEmailStaleSnoozeLog(
  limit = 10,
): Promise<AudienceAuditHistoryEmailStaleSnoozeLogEntry[]> {
  const n = Math.max(1, Math.min(50, Math.floor(limit) || 10));
  try {
    const rows = await db
      .select()
      .from(audienceAuditHistoryEmailStaleSnoozeLog)
      .orderBy(desc(audienceAuditHistoryEmailStaleSnoozeLog.snoozeStartedAt))
      .limit(n);
    return rows.map(toStaleLogEntry);
  } catch (err) {
    console.error(
      "[audience-audit-history-email-stale] list snooze log failed:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

/**
 * Task #692 — bounded retention sweep for the stale-alert snooze-window
 * log. Called from the audience retention sweeper on the same daily
 * cadence as the other audit-history tables. A row is eligible only
 * when it has CLOSED (endedAt is set) and its endedAt is older than
 * the cutoff — never deletes an open window mid-snooze.
 */
export async function pruneAudienceAuditHistoryEmailStaleSnoozeLogOlderThan(
  cutoff: Date,
): Promise<number> {
  const res: any = await db
    .delete(audienceAuditHistoryEmailStaleSnoozeLog)
    .where(lt(audienceAuditHistoryEmailStaleSnoozeLog.endedAt, cutoff));
  return (res?.rowCount as number) ?? 0;
}

export async function clearAudienceAuditHistoryEmailStaleSnoozeLogForTests(): Promise<void> {
  try {
    await db.delete(audienceAuditHistoryEmailStaleSnoozeLog);
  } catch {
    /* best-effort */
  }
}

/**
 * Task #570 — set or clear the staleness-alert snooze. Pass
 * `snoozeUntil: null` to unsnooze. Fixed-window snooze is capped at
 * 90 days; an `Error` is thrown for invalid or non-future timestamps.
 *
 * Task #627 — also accepts an optional `snoozePolicy`:
 *   - `fixed` (default): classic fixed-window snooze, capped at 90d.
 *   - `auto_extend`: skips the 90d cap and re-rolls `snoozeUntil` on
 *     each tick by `extendDays` (1..30). Founder must unsnooze
 *     explicitly to clear it.
 *   - `weekday_mute`: recurring weekly window. `snoozeUntil` is not
 *     required for this policy (callers can pass `null`).
 */
export async function setAudienceAuditHistoryEmailStaleSnooze(input: {
  snoozeUntil: string | null;
  snoozePolicy?: StaleSnoozePolicy | null;
  updatedBy?: string | null;
  now?: Date;
}): Promise<StaleSnoozeConfig> {
  const now = input.now ?? new Date();
  const nextPolicy: StaleSnoozePolicy =
    input.snoozePolicy === undefined || input.snoozePolicy === null
      ? { kind: "fixed" }
      : parseStaleSnoozePolicy(input.snoozePolicy);

  // Task #626 + #627 — manual unsnooze (no snoozeUntil and no
  // recurring weekday_mute policy) preserves the snooze-window recap
  // state so the next stale tick can emit the "here's what you
  // missed" email. Only setting a brand-new snooze resets the
  // counters. We deliberately do NOT delete the row here (unlike the
  // pre-#626 behavior) — recap dedup keys must survive an unsnooze.
  const wantsClear =
    (input.snoozeUntil === null || input.snoozeUntil === undefined) &&
    nextPolicy.kind !== "weekday_mute";
  if (wantsClear) {
    const current = await readSnoozeConfig();
    // Task #692 — close any open snooze-window log row with reason
    // `unsnoozed`, snapshotting the suppressed counters at the moment
    // the founder cleared the snooze.
    await closeOpenStaleSnoozeLog({
      endedAt: now,
      endedReason: "unsnoozed",
      counters: {
        suppressedTicks: current.snoozeSuppressedTicks,
        maxAgeMsObserved: current.snoozeMaxSuppressedAgeMs,
        lastSuccessfulRunAtAtClose:
          current.snoozeLastSuppressedLastSuccessfulRunAt,
      },
    });
    const cfg: StaleSnoozeConfig = {
      ...current,
      snoozeUntil: null,
      snoozePolicy: { kind: "fixed" },
      updatedAt: now.toISOString(),
      updatedBy: input.updatedBy ?? current.updatedBy ?? null,
    };
    await writeSnoozeConfig(cfg, now);
    return cfg;
  }

  let snoozeUntil: string | null = null;
  if (input.snoozeUntil !== null && input.snoozeUntil !== undefined) {
    const parsedMs = Date.parse(input.snoozeUntil);
    if (!Number.isFinite(parsedMs)) {
      throw new Error("invalid snoozeUntil timestamp");
    }
    const nowMs = now.getTime();
    if (parsedMs <= nowMs) {
      throw new Error("snoozeUntil must be in the future");
    }
    // `auto_extend` is the documented indefinite-mute path, so it
    // bypasses the 90d cap. `fixed` and `weekday_mute` (when paired
    // with an explicit until) still respect the cap.
    if (nextPolicy.kind === "auto_extend") {
      snoozeUntil = new Date(parsedMs).toISOString();
    } else {
      const cappedMs = Math.min(parsedMs, nowMs + MAX_SNOOZE_MS);
      snoozeUntil = new Date(cappedMs).toISOString();
    }
  }

  // Task #692 — close any previously-open snooze-window log row with
  // reason `replaced`, snapshotting the suppressed counters from the
  // outgoing window before we open the new one.
  const current = await readSnoozeConfig();
  await closeOpenStaleSnoozeLog({
    endedAt: now,
    endedReason: "replaced",
    counters: {
      suppressedTicks: current.snoozeSuppressedTicks,
      maxAgeMsObserved: current.snoozeMaxSuppressedAgeMs,
      lastSuccessfulRunAtAtClose:
        current.snoozeLastSuppressedLastSuccessfulRunAt,
    },
  });

  const cfg: StaleSnoozeConfig = {
    snoozeUntil,
    snoozePolicy: nextPolicy,
    updatedAt: now.toISOString(),
    updatedBy: input.updatedBy ?? null,
    // Task #626 — a new snooze always starts a fresh recap window:
    // reset suppressed counters and the dedup key.
    snoozeStartedAt: now.toISOString(),
    snoozeSuppressedTicks: 0,
    snoozeMaxSuppressedAgeMs: null,
    snoozeLastSuppressedLastSuccessfulRunAt: null,
    lastSnoozeRecapAt: null,
  };
  await writeSnoozeConfig(cfg, now);
  // Task #692 — open a fresh log row for this new snooze window.
  await openStaleSnoozeLog({
    snoozeStartedAt: now,
    snoozeUntil,
    policy: nextPolicy,
    createdBy: input.updatedBy ?? null,
  });
  return cfg;
}

/**
 * Task #626 — wipe the persisted snooze state (including the recap
 * dedup key + suppressed counters). Test-only.
 */
export async function resetAudienceAuditHistoryEmailStaleSnoozeForTests(): Promise<void> {
  await db
    .delete(systemSettings)
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_SNOOZE_SETTING_KEY,
      ),
    );
  // Task #692 — also wipe the durable snooze-window log so tests start
  // from a clean slate.
  await clearAudienceAuditHistoryEmailStaleSnoozeLogForTests();
}

function allowedAgeMsForCadence(cadence: "weekly" | "monthly"): number {
  return cadence === "monthly" ? MONTHLY_ALLOWED_AGE_MS : WEEKLY_ALLOWED_AGE_MS;
}

// Task #626 — true when we have an open recap-window (snooze ended,
// snoozeStartedAt is set) and the recap for it hasn't been sent yet.
function canRecapWindow(snooze: StaleSnoozeConfig): boolean {
  if (!snooze.snoozeStartedAt) return false;
  if (snooze.lastSnoozeRecapAt === snooze.snoozeStartedAt) return false;
  return true;
}

export interface SnoozeRecapResult {
  recapSent: boolean;
  reason: "sent" | "no_recipients" | "send_failed";
}

export interface StaleEvaluation {
  enabled: boolean;
  cadence: "weekly" | "monthly";
  recipients: string[];
  hasEverSucceeded: boolean;
  lastSuccessfulRunAt: string | null;
  ageMs: number | null;
  allowedAgeMs: number;
  stale: boolean;
  reason:
    | "disabled"
    | "no_recipients"
    | "never_succeeded"
    | "fresh"
    | "stale_no_success"
    | "stale_overdue"
    | "snoozed";
  /** Task #570 — non-null while a founder snooze is active. */
  snoozeUntil: string | null;
  /** Task #627 — policy that produced the current snooze, if any. */
  snoozePolicy: StaleSnoozePolicy;
}

class AudienceAuditHistoryEmailStaleAlertService {
  private emailService: EmailService = emailService;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private lastFiredAt: number | null = null;

  /**
   * Inspect the current schedule + run stats and decide whether the
   * scheduled compliance email has gone silent past its cadence.
   *
   * `now` is injectable so tests can control the clock without
   * mocking Date.
   */
  async evaluate(
    now: Date = new Date(),
    opts: { ignoreSnooze?: boolean } = {},
  ): Promise<StaleEvaluation> {
    const schedule = await audienceAuditHistoryEmailScheduler.getSchedule();
    const cadence = (schedule.cadence === "monthly" ? "monthly" : "weekly") as
      | "weekly"
      | "monthly";
    const allowedAgeMs = allowedAgeMsForCadence(cadence);
    const snooze = await readSnoozeConfig();

    if (!schedule.enabled) {
      return {
        enabled: false,
        cadence,
        recipients: schedule.recipients,
        hasEverSucceeded: false,
        lastSuccessfulRunAt: null,
        ageMs: null,
        allowedAgeMs,
        stale: false,
        reason: "disabled",
        snoozeUntil: null,
        snoozePolicy: snooze.snoozePolicy,
      };
    }
    if (schedule.recipients.length === 0) {
      return {
        enabled: true,
        cadence,
        recipients: [],
        hasEverSucceeded: false,
        lastSuccessfulRunAt: null,
        ageMs: null,
        allowedAgeMs,
        stale: false,
        reason: "no_recipients",
        snoozeUntil: null,
        snoozePolicy: snooze.snoozePolicy,
      };
    }

    // Task #570 / #627 — founder snooze short-circuits staleness.
    // Order:
    //   1. weekday_mute window active right now (no until needed)
    //   2. explicit snoozeUntil in the future
    // For `auto_extend`, evaluate is side-effect free; we only report
    // snoozed when the stored `snoozeUntil` is still in the future.
    // `tick` rolls the timestamp forward for `auto_extend` so the
    // next evaluate keeps reporting snoozed indefinitely.
    // Task #626 — `opts.ignoreSnooze` lets the tick path compute the
    // would-be-stale reality while we're snoozed so the suppressed
    // counter can advance and the recap can fire on expiry.
    if (!opts.ignoreSnooze) {
      if (snooze.snoozePolicy.kind === "weekday_mute") {
        if (isInWeekdayMuteWindow(snooze.snoozePolicy, now)) {
          return {
            enabled: true,
            cadence,
            recipients: schedule.recipients,
            hasEverSucceeded: false,
            lastSuccessfulRunAt: null,
            ageMs: null,
            allowedAgeMs,
            stale: false,
            reason: "snoozed",
            snoozeUntil: snooze.snoozeUntil,
            snoozePolicy: snooze.snoozePolicy,
          };
        }
      }
      if (snooze.snoozeUntil) {
        const t = Date.parse(snooze.snoozeUntil);
        if (Number.isFinite(t) && t > now.getTime()) {
          return {
            enabled: true,
            cadence,
            recipients: schedule.recipients,
            hasEverSucceeded: false,
            lastSuccessfulRunAt: null,
            ageMs: null,
            allowedAgeMs,
            stale: false,
            reason: "snoozed",
            snoozeUntil: snooze.snoozeUntil,
            snoozePolicy: snooze.snoozePolicy,
          };
        }
      }
    }

    // 365d window is large enough that any monthly schedule with any
    // successful delivery in the past year will surface here.
    const stats = await audienceAuditHistoryEmailScheduler.getRunStats({
      windowDays: 365,
      excludeTestRuns: true,
    });

    const lastSuccessfulRunAt = stats.lastSuccessfulRunAt;
    if (!lastSuccessfulRunAt) {
      // No successful real run on record. Only treat as stale if the
      // schedule has been enabled long enough that we *should* have
      // seen a delivery by now (schedule.updatedAt is the best proxy
      // we have for "configured at"). This avoids paging the founder
      // the instant they turn the schedule on.
      const updatedAtMs = Date.parse(schedule.updatedAt);
      const configuredAgeMs = Number.isFinite(updatedAtMs)
        ? Math.max(0, now.getTime() - updatedAtMs)
        : 0;
      const stale = configuredAgeMs > allowedAgeMs;
      return {
        enabled: true,
        cadence,
        recipients: schedule.recipients,
        hasEverSucceeded: false,
        lastSuccessfulRunAt: null,
        ageMs: configuredAgeMs,
        allowedAgeMs,
        stale,
        reason: stale ? "stale_no_success" : "never_succeeded",
        snoozeUntil: null,
        snoozePolicy: snooze.snoozePolicy,
      };
    }

    const lastMs = Date.parse(lastSuccessfulRunAt);
    const ageMs = Number.isFinite(lastMs)
      ? Math.max(0, now.getTime() - lastMs)
      : null;
    const stale = ageMs !== null && ageMs > allowedAgeMs;
    return {
      enabled: true,
      cadence,
      recipients: schedule.recipients,
      hasEverSucceeded: true,
      lastSuccessfulRunAt,
      ageMs,
      allowedAgeMs,
      stale,
      reason: stale ? "stale_overdue" : "fresh",
      snoozeUntil: null,
      snoozePolicy: snooze.snoozePolicy,
    };
  }

  /**
   * Task #627 — for the `auto_extend` policy only, bump an elapsed
   * `snoozeUntil` forward by `extendDays` before the staleness check
   * runs. Returns `true` if the snooze is now active (originally or
   * after the extension), `false` otherwise.
   */
  private async maybeAutoExtendSnooze(now: Date): Promise<boolean> {
    const snooze = await readSnoozeConfig();
    if (snooze.snoozePolicy.kind !== "auto_extend") return false;
    if (!snooze.snoozeUntil) return false;
    const t = Date.parse(snooze.snoozeUntil);
    if (!Number.isFinite(t)) return false;
    if (t > now.getTime()) return true; // still active, no extension needed
    const extendDays = Math.max(1, snooze.snoozePolicy.extendDays);
    const newUntil = new Date(
      now.getTime() + extendDays * DAY_MS,
    ).toISOString();
    const next: StaleSnoozeConfig = {
      ...snooze,
      snoozeUntil: newUntil,
      updatedAt: now.toISOString(),
    };
    const stored = JSON.stringify(next);
    try {
      await db
        .insert(systemSettings)
        .values({
          key: AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_SNOOZE_SETTING_KEY,
          value: stored,
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: stored, updatedAt: now },
        });
    } catch (err) {
      console.error(
        "[audience-audit-history-email-stale] auto_extend persist failed:",
        (err as Error)?.message ?? err,
      );
      return false;
    }
    return true;
  }

  /**
   * Run a single staleness check. If the schedule is stale and no
   * open alert exists, fire one + email root admins. If it has
   * recovered, auto-resolve any open alerts.
   *
   * Returns the evaluation so callers can log it.
   */
  async tick(
    now: Date = new Date(),
  ): Promise<{
    evaluation: StaleEvaluation;
    fired: boolean;
    resolved: number;
    recapSent?: boolean;
    recapReason?: SnoozeRecapResult["reason"];
  }> {
    if (this.ticking) {
      return {
        evaluation: await this.evaluate(now),
        fired: false,
        resolved: 0,
      };
    }
    this.ticking = true;
    try {
      // Task #627 — for `auto_extend`, re-roll snoozeUntil first so
      // the snooze read below sees the fresh future timestamp.
      await this.maybeAutoExtendSnooze(now);

      // Task #626 — read the snooze state once, evaluate ignoring the
      // snooze, and decide afterward whether we should short-circuit
      // (snoozed) or fire the recap (snooze ended → stale). Task #627
      // additions: also treat an active `weekday_mute` window as
      // snoozed so the recurring policy participates in suppression /
      // recap accounting.
      const snooze = await readSnoozeConfig();
      const snoozeUntilMs = snooze.snoozeUntil
        ? Date.parse(snooze.snoozeUntil)
        : NaN;
      const inWeekdayMute =
        snooze.snoozePolicy.kind === "weekday_mute" &&
        isInWeekdayMuteWindow(snooze.snoozePolicy, now);
      const isSnoozed =
        inWeekdayMute ||
        (Number.isFinite(snoozeUntilMs) && snoozeUntilMs > now.getTime());

      const rawEvaluation = await this.evaluate(now, { ignoreSnooze: true });

      // While snoozed: never page, never auto-resolve. But if the
      // schedule *would have* fired, bump the suppressed counter so
      // the post-expiry recap can quote the count + max age + last
      // successful run observed during the silent window.
      // Task #637 — the per-recipient sweep is also a no-op while
      // snoozed (it honors the same snooze internally), so we simply
      // skip it on this path.
      // Task #692 — natural-expiry detection. When the snooze window
      // we previously opened has elapsed (fixed policy with passed
      // snoozeUntil; auto_extend re-rolls earlier in this tick so it
      // never reaches here; weekday_mute is recurring so the row
      // never naturally "expires"), close the open log row with
      // `expired` so founders can audit the silent window. Re-runs
      // are safe — `closeOpenStaleSnoozeLog` only matches rows with
      // `endedAt IS NULL`.
      if (
        !isSnoozed &&
        snooze.snoozePolicy.kind !== "weekday_mute" &&
        Number.isFinite(snoozeUntilMs) &&
        snoozeUntilMs <= now.getTime()
      ) {
        await closeOpenStaleSnoozeLog({
          endedAt: now,
          endedReason: "expired",
          counters: {
            suppressedTicks: snooze.snoozeSuppressedTicks,
            maxAgeMsObserved: snooze.snoozeMaxSuppressedAgeMs,
            lastSuccessfulRunAtAtClose:
              rawEvaluation.lastSuccessfulRunAt ??
              snooze.snoozeLastSuppressedLastSuccessfulRunAt,
          },
        });
      }


      if (isSnoozed) {
        if (rawEvaluation.stale) {
          await this.bumpSuppressedCounter(snooze, rawEvaluation, now);
        }
        const snoozedEvaluation: StaleEvaluation = {
          enabled: rawEvaluation.enabled,
          cadence: rawEvaluation.cadence,
          recipients: rawEvaluation.recipients,
          hasEverSucceeded: false,
          lastSuccessfulRunAt: null,
          ageMs: null,
          allowedAgeMs: rawEvaluation.allowedAgeMs,
          stale: false,
          reason: "snoozed",
          snoozeUntil: snooze.snoozeUntil,
          snoozePolicy: snooze.snoozePolicy,
        };
        return {
          evaluation: snoozedEvaluation,
          fired: false,
          resolved: 0,
          recapSent: false,
        };
      }

      // Task #626 — first tick after a snooze window ended. If the
      // schedule is currently stale and the recap for this window
      // hasn't been sent yet, emit the recap email before going down
      // the normal fire-alert path.
      let recapSent = false;
      let recapReason: SnoozeRecapResult["reason"] | undefined;
      if (canRecapWindow(snooze) && rawEvaluation.stale) {
        const result = await this.attemptSnoozeRecap(
          snooze,
          rawEvaluation,
          now,
        );
        recapSent = result.recapSent;
        recapReason = result.reason;
      }

      const open = await this.listOpenAlertRows();

      let runFired = false;
      let runResolved = 0;
      if (!rawEvaluation.stale) {
        runResolved = await this.autoResolve(open, rawEvaluation, now);
      } else if (open.length === 0) {
        await this.fireAlert(rawEvaluation, now);
        runFired = true;
      }

      // Task #637 — also sweep per-recipient silence on the same tick
      // so a dead mailbox surfaces even when the aggregate scheduler
      // run still looks healthy. Failures inside the recipient sweep
      // are logged and never poison the run-level result.
      try {
        await this.tickRecipients(now);
      } catch (err) {
        console.error(
          "[AudienceAuditHistoryEmailStaleAlert] recipient sweep failed:",
          (err as Error)?.message ?? err,
        );
      }

      return {
        evaluation: rawEvaluation,
        fired: runFired,
        resolved: runResolved,
        recapSent,
        recapReason,
      };
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Task #626 — increment the suppressed-tick counter while snoozed.
   * Also tracks the worst ageMs and the last lastSuccessfulRunAt so
   * the recap email can quote concrete numbers, not just a count.
   */
  private async bumpSuppressedCounter(
    snooze: StaleSnoozeConfig,
    evaluation: StaleEvaluation,
    now: Date,
  ): Promise<void> {
    try {
      // If snoozeStartedAt is missing (e.g. legacy row pre-#626 with
      // an active snooze), backfill it to "now" so the recap still has
      // a window to quote.
      const startedAt = snooze.snoozeStartedAt ?? now.toISOString();
      const prevMax = snooze.snoozeMaxSuppressedAgeMs ?? 0;
      const nextMax =
        evaluation.ageMs !== null
          ? Math.max(prevMax, evaluation.ageMs)
          : snooze.snoozeMaxSuppressedAgeMs;
      const updated: StaleSnoozeConfig = {
        ...snooze,
        snoozeStartedAt: startedAt,
        snoozeSuppressedTicks: snooze.snoozeSuppressedTicks + 1,
        snoozeMaxSuppressedAgeMs: nextMax,
        snoozeLastSuppressedLastSuccessfulRunAt:
          evaluation.lastSuccessfulRunAt ??
          snooze.snoozeLastSuppressedLastSuccessfulRunAt,
      };
      await writeSnoozeConfig(updated, now);
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailStaleAlert] failed to bump suppressed counter:",
        err,
      );
    }
  }

  /**
   * Task #626 — emit the "snooze ended — here's what you missed"
   * recap email. Dedup is keyed off `snoozeStartedAt`: the field
   * `lastSnoozeRecapAt` is set to the same value after a successful
   * send so the same window can't fire twice. Send failures do NOT
   * advance the dedup key, so the next tick will retry.
   */
  private async attemptSnoozeRecap(
    snooze: StaleSnoozeConfig,
    evaluation: StaleEvaluation,
    now: Date,
  ): Promise<SnoozeRecapResult> {
    const startedAt = snooze.snoozeStartedAt!;
    const endedAt = now.toISOString();
    const durationMs = Math.max(
      0,
      now.getTime() - Date.parse(startedAt),
    );
    // Task #737 — the recap goes ONLY to the schedule's configured
    // recipients (the founders who set up the audit-export email and
    // therefore lost visibility while snoozed). Root-admin fan-out
    // was removed because it double-sent the recap whenever a root
    // admin existed; the regular page (fireAlert) still notifies
    // root admins. Dedup is per-email via Set.
    const recipientSet = new Set<string>(evaluation.recipients);
    const recipientEmails = Array.from(recipientSet);
    if (recipientEmails.length === 0) {
      await writeSnoozeConfig(
        { ...snooze, lastSnoozeRecapAt: startedAt },
        now,
      );
      return { recapSent: false, reason: "no_recipients" };
    }
    try {
      for (const to of recipientEmails) {
        await this.emailService.sendAudienceAuditHistoryEmailStaleSnoozeRecap(
          to,
          {
            snoozeStartedAt: startedAt,
            snoozeEndedAt: endedAt,
            durationMs,
            suppressedTicks: snooze.snoozeSuppressedTicks,
            maxSuppressedAgeMs: snooze.snoozeMaxSuppressedAgeMs,
            currentAgeMs: evaluation.ageMs,
            allowedAgeMs: evaluation.allowedAgeMs,
            cadence: evaluation.cadence,
            lastSuccessfulRunAt:
              evaluation.lastSuccessfulRunAt ??
              snooze.snoozeLastSuppressedLastSuccessfulRunAt,
            actionUrl: ALERT_LINK,
          },
        );
      }
      await writeSnoozeConfig(
        { ...snooze, lastSnoozeRecapAt: startedAt },
        now,
      );
      console.log(
        `[AudienceAuditHistoryEmailStaleAlert] snooze recap sent (window ${startedAt} → ${endedAt}, suppressedTicks=${snooze.snoozeSuppressedTicks})`,
      );
      return { recapSent: true, reason: "sent" };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      console.error(
        "[AudienceAuditHistoryEmailStaleAlert] snooze recap send failed:",
        msg,
      );
      // Do NOT advance dedup on failure so the next tick can retry.
      return { recapSent: false, reason: "send_failed" };
    }
  }

  private async listOpenAlertRows() {
    return db
      .select()
      .from(platformAlerts)
      .where(
        and(
          eq(
            platformAlerts.type,
            AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_ALERT_TYPE,
          ),
          eq(platformAlerts.acknowledged, false),
        ),
      )
      .orderBy(desc(platformAlerts.createdAt));
  }

  private async fireAlert(
    evaluation: StaleEvaluation,
    now: Date,
  ): Promise<void> {
    const ageDays =
      evaluation.ageMs !== null
        ? Math.round((evaluation.ageMs / DAY_MS) * 10) / 10
        : null;
    const allowedDays = Math.round(evaluation.allowedAgeMs / DAY_MS);
    const title = "Audit-export history email has gone silent";
    const reasonText =
      evaluation.reason === "stale_no_success"
        ? `no successful delivery on record after ${ageDays}d enabled`
        : `last successful delivery was ${ageDays}d ago`;
    const message =
      `${title}: ${reasonText} ` +
      `(cadence=${evaluation.cadence}, allowedAgeDays=${allowedDays}, ` +
      `recipients=${evaluation.recipients.length})`;

    try {
      await panicButtonService.createAlert({
        type: AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          source: "audience-audit-history-email-stale-alert-service",
          cadence: evaluation.cadence,
          allowedAgeDays: allowedDays,
          ageDays,
          lastSuccessfulRunAt: evaluation.lastSuccessfulRunAt,
          hasEverSucceeded: evaluation.hasEverSucceeded,
          recipients: evaluation.recipients,
          reason: evaluation.reason,
          evaluatedAt: now.toISOString(),
          link: ALERT_LINK,
        },
        autoTriggered: true,
      });
      this.lastFiredAt = now.getTime();
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailStaleAlert] failed to create platform alert:",
        err,
      );
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(
          and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)),
        );
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title,
          severity: "medium",
          message,
          actionUrl: ALERT_LINK,
        });
      }
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailStaleAlert] failed to email admins:",
        err,
      );
    }
  }

  private async autoResolve(
    open: Array<{ id: number | string; details: unknown }>,
    evaluation: StaleEvaluation,
    now: Date,
  ): Promise<number> {
    if (open.length === 0) return 0;
    let resolved = 0;
    try {
      for (const row of open) {
        const prevDetails =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const mergedDetails = {
          ...prevDetails,
          autoResolved: true,
          autoResolvedAt: now.toISOString(),
          autoResolvedReason: evaluation.reason,
          autoResolvedLastSuccessfulRunAt: evaluation.lastSuccessfulRunAt,
          autoResolvedNote:
            "Auto-cleared after a fresh successful audit-export history email delivery.",
        };
        await db
          .update(platformAlerts)
          .set({
            acknowledged: true,
            acknowledgedBy: "system",
            acknowledgedAt: now,
            details: mergedDetails,
          })
          .where(eq(platformAlerts.id, row.id as any));
        resolved += 1;
      }
      if (resolved > 0) {
        console.log(
          `[AudienceAuditHistoryEmailStaleAlert] auto-resolved ${resolved} open alert(s) after fresh delivery`,
        );
      }
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailStaleAlert] failed to auto-resolve alerts:",
        err,
      );
    }
    return resolved;
  }

  /**
   * Task #637 — per-recipient inbox silence evaluation. For each inbox
   * the scheduler has ever sent a real (non-test) run to, decide
   * whether that inbox has received zero successful deliveries within
   * the cadence + grace window.
   *
   * Hidden side: a brand-new recipient that has *never* had a success
   * is only flagged silent once the schedule has been configured long
   * enough that we *should* have seen a delivery, mirroring the
   * run-level `never_succeeded` behavior. This avoids paging the
   * founder the instant a new inbox is added.
   *
   * Snooze honors the same founder-level snooze as the run-level
   * staleness alert: while snoozed, every recipient surfaces as
   * `"snoozed"` and nothing fires / nothing auto-resolves.
   */
  async evaluateRecipients(
    now: Date = new Date(),
  ): Promise<{
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
      reason:
        | "fresh"
        | "stale_overdue"
        | "stale_no_success"
        | "never_succeeded"
        | "snoozed";
    }>;
  }> {
    const schedule = await audienceAuditHistoryEmailScheduler.getSchedule();
    const cadence = (schedule.cadence === "monthly" ? "monthly" : "weekly") as
      | "weekly"
      | "monthly";
    const allowedAgeMs = allowedAgeMsForCadence(cadence);

    if (!schedule.enabled || schedule.recipients.length === 0) {
      return {
        enabled: schedule.enabled,
        cadence,
        allowedAgeMs,
        snoozeUntil: null,
        recipients: [],
      };
    }

    const snooze = await readSnoozeConfig();
    let activeSnoozeUntil: string | null = null;
    if (snooze.snoozeUntil) {
      const t = Date.parse(snooze.snoozeUntil);
      if (Number.isFinite(t) && t > now.getTime()) {
        activeSnoozeUntil = snooze.snoozeUntil;
      }
    }

    // Union of "ever attached to a real run" + the schedule's currently
    // configured recipients. A recipient that was just added but has
    // never been on a run still counts so we can age them out against
    // the schedule.updatedAt clock.
    const known = await audienceAuditHistoryEmailScheduler.listKnownRecipients({
      excludeTestRuns: true,
    });
    const inboxes = new Set<string>(known);
    for (const r of schedule.recipients) {
      const v = r.trim().toLowerCase();
      if (v) inboxes.add(v);
    }

    const updatedAtMs = Date.parse(schedule.updatedAt);
    const configuredAgeMs = Number.isFinite(updatedAtMs)
      ? Math.max(0, now.getTime() - updatedAtMs)
      : 0;

    const result: Array<{
      recipient: string;
      silent: boolean;
      hasEverSucceeded: boolean;
      lastSuccessfulRunAt: string | null;
      ageMs: number | null;
      reason:
        | "fresh"
        | "stale_overdue"
        | "stale_no_success"
        | "never_succeeded"
        | "snoozed";
    }> = [];

    for (const recipient of Array.from(inboxes).sort()) {
      if (activeSnoozeUntil) {
        result.push({
          recipient,
          silent: false,
          hasEverSucceeded: false,
          lastSuccessfulRunAt: null,
          ageMs: null,
          reason: "snoozed",
        });
        continue;
      }
      const stats = await audienceAuditHistoryEmailScheduler.getRunStats({
        recipient,
        excludeTestRuns: true,
      });
      const lastAt = stats.lastSuccessfulRunAt;
      if (!lastAt) {
        const stale = configuredAgeMs > allowedAgeMs;
        result.push({
          recipient,
          silent: stale,
          hasEverSucceeded: false,
          lastSuccessfulRunAt: null,
          ageMs: configuredAgeMs,
          reason: stale ? "stale_no_success" : "never_succeeded",
        });
        continue;
      }
      const lastMs = Date.parse(lastAt);
      const ageMs = Number.isFinite(lastMs)
        ? Math.max(0, now.getTime() - lastMs)
        : null;
      const stale = ageMs !== null && ageMs > allowedAgeMs;
      result.push({
        recipient,
        silent: stale,
        hasEverSucceeded: true,
        lastSuccessfulRunAt: lastAt,
        ageMs,
        reason: stale ? "stale_overdue" : "fresh",
      });
    }

    return {
      enabled: true,
      cadence,
      allowedAgeMs,
      snoozeUntil: activeSnoozeUntil,
      recipients: result,
    };
  }

  /**
   * Task #637 — fire / auto-resolve per-recipient silence alerts.
   * One platform_alerts row per silent inbox, deduped by
   * `details.recipient`. Auto-clears as soon as that inbox gets a
   * fresh success (mirrors the run-level alert's autoResolve).
   */
  async tickRecipients(
    now: Date = new Date(),
  ): Promise<{
    fired: number;
    resolved: number;
    silentRecipients: string[];
  }> {
    const evaluation = await this.evaluateRecipients(now);

    // Snoozed or schedule disabled / empty — leave existing rows alone
    // so they survive the snooze window, mirroring the run-level alert.
    if (
      !evaluation.enabled ||
      evaluation.recipients.length === 0 ||
      evaluation.snoozeUntil
    ) {
      return { fired: 0, resolved: 0, silentRecipients: [] };
    }

    const open = await this.listOpenRecipientAlertRows();
    const openByRecipient = new Map<string, (typeof open)[number]>();
    for (const row of open) {
      const d = (row.details as Record<string, any>) ?? {};
      const r =
        typeof d.recipient === "string" ? d.recipient.toLowerCase() : null;
      if (r) openByRecipient.set(r, row);
    }

    let fired = 0;
    let resolved = 0;
    const silentRecipients: string[] = [];

    for (const entry of evaluation.recipients) {
      const existing = openByRecipient.get(entry.recipient);
      if (entry.silent) {
        silentRecipients.push(entry.recipient);
        if (!existing) {
          await this.fireRecipientAlert(entry, evaluation, now);
          fired += 1;
        }
      } else if (existing) {
        await this.autoResolveRecipientRow(existing, entry, now);
        resolved += 1;
      }
    }
    return { fired, resolved, silentRecipients };
  }

  private async listOpenRecipientAlertRows() {
    return db
      .select()
      .from(platformAlerts)
      .where(
        and(
          eq(
            platformAlerts.type,
            AUDIENCE_AUDIT_HISTORY_EMAIL_RECIPIENT_STALE_ALERT_TYPE,
          ),
          eq(platformAlerts.acknowledged, false),
        ),
      )
      .orderBy(desc(platformAlerts.createdAt));
  }

  private async fireRecipientAlert(
    entry: {
      recipient: string;
      hasEverSucceeded: boolean;
      lastSuccessfulRunAt: string | null;
      ageMs: number | null;
      reason: string;
    },
    evaluation: { cadence: "weekly" | "monthly"; allowedAgeMs: number },
    now: Date,
  ): Promise<void> {
    const ageDays =
      entry.ageMs !== null
        ? Math.round((entry.ageMs / DAY_MS) * 10) / 10
        : null;
    const allowedDays = Math.round(evaluation.allowedAgeMs / DAY_MS);
    const title = "Audit-export history inbox has gone silent";
    const reasonText = entry.hasEverSucceeded
      ? `last successful delivery to ${entry.recipient} was ${ageDays}d ago`
      : `no successful delivery to ${entry.recipient} on record after ${ageDays}d enabled`;
    const message =
      `${title}: ${reasonText} ` +
      `(cadence=${evaluation.cadence}, allowedAgeDays=${allowedDays})`;

    try {
      await panicButtonService.createAlert({
        type: AUDIENCE_AUDIT_HISTORY_EMAIL_RECIPIENT_STALE_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          source: "audience-audit-history-email-stale-alert-service",
          scope: "recipient",
          recipient: entry.recipient,
          cadence: evaluation.cadence,
          allowedAgeDays: allowedDays,
          ageDays,
          lastSuccessfulRunAt: entry.lastSuccessfulRunAt,
          hasEverSucceeded: entry.hasEverSucceeded,
          reason: entry.reason,
          evaluatedAt: now.toISOString(),
          link: ALERT_LINK,
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailRecipientStaleAlert] failed to create platform alert:",
        err,
      );
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(
          and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)),
        );
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title,
          severity: "medium",
          message,
          actionUrl: ALERT_LINK,
        });
      }
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailRecipientStaleAlert] failed to email admins:",
        err,
      );
    }
  }

  private async autoResolveRecipientRow(
    row: { id: number | string; details: unknown },
    entry: {
      recipient: string;
      reason: string;
      lastSuccessfulRunAt: string | null;
    },
    now: Date,
  ): Promise<void> {
    const prevDetails =
      row.details && typeof row.details === "object"
        ? (row.details as Record<string, any>)
        : {};
    const mergedDetails = {
      ...prevDetails,
      autoResolved: true,
      autoResolvedAt: now.toISOString(),
      autoResolvedReason: entry.reason,
      autoResolvedLastSuccessfulRunAt: entry.lastSuccessfulRunAt,
      autoResolvedNote: `Auto-cleared after a fresh successful delivery to ${entry.recipient}.`,
    };
    try {
      await db
        .update(platformAlerts)
        .set({
          acknowledged: true,
          acknowledgedBy: "system",
          acknowledgedAt: now,
          details: mergedDetails,
        })
        .where(eq(platformAlerts.id, row.id as any));
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailRecipientStaleAlert] failed to auto-resolve:",
        err,
      );
    }
  }

  /**
   * Returns currently-open per-recipient silence alerts, newest first,
   * for the admin banner. One entry per silent inbox.
   */
  async getOpenRecipientAlerts(): Promise<
    Array<{
      id: number | string;
      recipient: string;
      message: string;
      createdAt: string;
      details: Record<string, any>;
    }>
  > {
    try {
      const rows = await this.listOpenRecipientAlertRows();
      return rows.map((row) => {
        const d =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const created = (row.createdAt as Date | null) ?? new Date();
        return {
          id: row.id as any,
          recipient: typeof d.recipient === "string" ? d.recipient : "",
          message: row.message,
          createdAt: created.toISOString(),
          details: d,
        };
      });
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailRecipientStaleAlert] failed to load open alerts:",
        err,
      );
      return [];
    }
  }

  /**
   * Returns the most recent open alert (if any) for the admin banner.
   */
  async getOpenAlert(): Promise<{
    id: number | string;
    message: string;
    createdAt: string;
    details: Record<string, any>;
  } | null> {
    try {
      const rows = await this.listOpenAlertRows();
      if (rows.length === 0) return null;
      const row = rows[0];
      const created = (row.createdAt as Date | null) ?? new Date();
      return {
        id: row.id as any,
        message: row.message,
        createdAt: created.toISOString(),
        details:
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {},
      };
    } catch (err) {
      console.error(
        "[AudienceAuditHistoryEmailStaleAlert] failed to load open alert:",
        err,
      );
      return null;
    }
  }

  startScheduler(checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS): void {
    if (this.timerHandle) return;
    console.log(
      `[audience-audit-history-email-stale] alert scheduler started (check every ${Math.round(
        checkIntervalMs / 60000,
      )}m)`,
    );
    this.timerHandle = setInterval(() => {
      this.tick().catch((e) =>
        console.error(
          "[audience-audit-history-email-stale] tick error:",
          (e as Error)?.message ?? e,
        ),
      );
    }, checkIntervalMs);
  }

  stop(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
      console.log(
        "[audience-audit-history-email-stale] alert scheduler stopped",
      );
    }
  }

  /** Test helper. */
  resetForTests(): void {
    this.lastFiredAt = null;
  }
}

export const audienceAuditHistoryEmailStaleAlertService =
  new AudienceAuditHistoryEmailStaleAlertService();
