/**
 * Audience restore-log rate-of-growth alert (Task #470).
 *
 * Task #435 added a retention sweep that auto-trims old
 * `audience_restore_log` rows so the table cannot grow forever. But a
 * stuck client, a confused operator or an abuse pattern can still
 * insert thousands of restore rows between sweeps without anyone
 * noticing — and a flood of restores is itself an interesting signal
 * (someone is poking the restore endpoint very hard).
 *
 * This service mirrors `audience-retention-stale-rows-alert-service.ts`:
 *   - Counts how many rows have landed in `audience_restore_log` since
 *     the start of the current UTC day.
 *   - If today's count crosses a configurable threshold (default 50/day),
 *     fires a founder `platform_alerts` row + a best-effort email to
 *     every active root admin.
 *   - Rate-limits notifications so a hammered restore endpoint does not
 *     fire the same alert every insert.
 *   - Auto-resolves any open rate alert as soon as today's count drops
 *     back below the threshold (e.g. once the UTC day rolls over).
 *
 * Threshold precedence (highest first):
 *   1. admin override in `system_settings`
 *      `audience_restore_log_rate_threshold` (numeric string)
 *   2. env var `AUDIENCE_RESTORE_LOG_RATE_THRESHOLD`
 *   3. compiled-in `DEFAULT_AUDIENCE_RESTORE_LOG_RATE_THRESHOLD` (50)
 *
 * Dedup window precedence:
 *   1. env `AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS`
 *   2. default 1 hour
 *
 * `0` for the threshold disables alerting entirely.
 * `0` for the dedup window disables suppression entirely.
 */

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, platformAlerts, systemSettings } from "@shared/schema";
import { randomUUID } from "node:crypto";
import {
  audienceRestoreLog,
  audienceRestoreLogRateThresholdHistory,
  audienceRestoreLogRateWeakeningNotifications,
} from "../../shared/omni-channel-audience-schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";
import { resolveAdminIdentities } from "./admin-identity-resolver";

export const AUDIENCE_RESTORE_LOG_RATE_ALERT_TYPE =
  "audience_restore_log_rate_spike";

export const AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY =
  "audience_restore_log_rate_threshold";

export const AUDIENCE_RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_SETTING_KEY =
  "audience_restore_log_rate_notify_on_weakening";

export const DEFAULT_AUDIENCE_RESTORE_LOG_RATE_THRESHOLD = 50;

/** Task #618 — multiplier above which a loosening triggers a notify. */
export const RESTORE_LOG_RATE_WEAKENING_MULTIPLIER = 2;

const DEFAULT_DEDUP_MS = 60 * 60 * 1000;

const ALERT_LINK = "/admin/omni-channel-audience#retention";

function envThreshold(): number | null {
  const raw = Number(process.env.AUDIENCE_RESTORE_LOG_RATE_THRESHOLD);
  if (!Number.isFinite(raw) || raw < 0) return null;
  return Math.floor(raw);
}

function dedupWindowMs(): number {
  const raw = Number(process.env.AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_DEDUP_MS;
}

function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

async function readOverride(): Promise<number | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) return null;
    const n = Number(rows[0].value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  } catch {
    return null;
  }
}

export async function getEffectiveRestoreLogRateThreshold(): Promise<{
  threshold: number;
  override: number | null;
  envFallback: number | null;
}> {
  const override = await readOverride();
  const envFallback = envThreshold();
  const threshold =
    override ?? envFallback ?? DEFAULT_AUDIENCE_RESTORE_LOG_RATE_THRESHOLD;
  return { threshold, override, envFallback };
}

export async function setRestoreLogRateThresholdOverride(
  value: number | null,
  updatedBy?: string,
): Promise<{
  threshold: number;
  override: number | null;
  envFallback: number | null;
}> {
  // Task #571 — snapshot the prior override BEFORE we touch the row so
  // we can write a who/what audit entry. The Retention Mode card
  // surfaces these entries so admins can answer "who disabled the
  // restore-log rate alert last Tuesday?" without crawling through
  // git history.
  const priorEff = await getEffectiveRestoreLogRateThreshold();
  const prior = priorEff.override;
  const cleaned = value === null ? null : Math.max(0, Math.floor(value));
  if (cleaned === null) {
    await db
      .delete(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY));
  } else {
    const stored = String(cleaned);
    await db
      .insert(systemSettings)
      .values({
        key: AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY,
        value: stored,
        updatedBy,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: stored, updatedBy, updatedAt: new Date() },
      });
  }
  try {
    await db.insert(audienceRestoreLogRateThresholdHistory).values({
      priorOverride: prior,
      newOverride: cleaned,
      updatedBy: updatedBy ?? null,
    });
  } catch (err) {
    console.error(
      "[AudienceRestoreLogRateAlert] failed to record threshold history:",
      err,
    );
  }
  const newEff = await getEffectiveRestoreLogRateThreshold();
  // Task #618 — if the change weakens the alert (alerting off, or
  // loosened by 2x+), push an email to every active root admin so a
  // careless or malicious loosening is immediately visible. The
  // "Notify on weakening" toggle in the restore-log-rate block lets
  // founders opt out.
  try {
    await maybeNotifyWeakening({
      priorEffective: priorEff.threshold,
      newEffective: newEff.threshold,
      priorOverride: prior,
      newOverride: cleaned,
      actor: updatedBy ?? "unknown",
    });
  } catch (err) {
    console.error(
      "[AudienceRestoreLogRateAlert] failed to send weakening notification:",
      err,
    );
  }
  return newEff;
}

/* --------------------------------------------------------------------- */
/* Task #618 — notify-on-weakening toggle + email                        */
/* --------------------------------------------------------------------- */

export async function isRestoreLogRateNotifyOnWeakeningEnabled(): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_SETTING_KEY,
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

export async function setRestoreLogRateNotifyOnWeakeningEnabled(
  enabled: boolean,
  updatedBy?: string,
): Promise<{ enabled: boolean }> {
  const stored = enabled ? "true" : "false";
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_RESTORE_LOG_RATE_NOTIFY_ON_WEAKENING_SETTING_KEY,
      value: stored,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: stored, updatedBy, updatedAt: new Date() },
    });
  return { enabled };
}

export type RestoreLogRateWeakeningReason = "disabled" | "loosened_2x";

export function classifyRestoreLogRateWeakening(
  priorEffective: number,
  newEffective: number,
): RestoreLogRateWeakeningReason | null {
  // Disabled: alerting was on (>0) and is now off (0).
  if (newEffective === 0 && priorEffective > 0) return "disabled";
  // Loosened by 2x+: only meaningful when prior was alerting (>0).
  if (
    priorEffective > 0 &&
    newEffective >= RESTORE_LOG_RATE_WEAKENING_MULTIPLIER * priorEffective
  ) {
    return "loosened_2x";
  }
  return null;
}

async function maybeNotifyWeakening(args: {
  priorEffective: number;
  newEffective: number;
  priorOverride: number | null;
  newOverride: number | null;
  actor: string;
}): Promise<boolean> {
  const reason = classifyRestoreLogRateWeakening(
    args.priorEffective,
    args.newEffective,
  );
  if (!reason) return false;
  const enabled = await isRestoreLogRateNotifyOnWeakeningEnabled();
  if (!enabled) return false;
  const recipients = await db
    .select({ email: adminStaff.email })
    .from(adminStaff)
    .where(
      and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)),
    );
  const to = recipients.map((r) => r.email).filter((e): e is string => !!e);
  if (to.length === 0) return false;
  const emailService = new EmailService();
  const occurredAt = new Date();
  let sent = false;
  let errorMessage: string | null = null;
  try {
    await emailService.sendRestoreRateAlertWeakenedEmail(to, {
      actor: args.actor,
      priorEffective: args.priorEffective,
      newEffective: args.newEffective,
      priorOverride: args.priorOverride,
      newOverride: args.newOverride,
      reason,
      occurredAt: occurredAt.toISOString(),
    });
    sent = true;
  } catch (err) {
    errorMessage = (err as Error)?.message ?? String(err);
    console.error(
      "[AudienceRestoreLogRateAlert] failed to send weakening email:",
      errorMessage,
    );
  }
  // Task #677 — persist every weakening-email attempt so founders have
  // a verifiable in-dashboard trail even when Resend silently swallows
  // a message. Best-effort: a DB hiccup here must not crash the
  // threshold update flow.
  try {
    await db.insert(audienceRestoreLogRateWeakeningNotifications).values({
      notificationId: `wknfy_${occurredAt.getTime().toString(36)}_${randomUUID().slice(0, 8)}`,
      actor: args.actor,
      reason,
      priorEffective: Math.floor(args.priorEffective),
      newEffective: Math.floor(args.newEffective),
      priorOverride: args.priorOverride,
      newOverride: args.newOverride,
      recipients: to,
      sent,
      errorMessage,
      occurredAt,
    });
  } catch (err) {
    console.error(
      "[AudienceRestoreLogRateAlert] failed to persist weakening notification history:",
      (err as Error)?.message ?? err,
    );
  }
  return sent;
}

/* --------------------------------------------------------------------- */
/* Task #677 — weakening-email notification history                       */
/* --------------------------------------------------------------------- */

export interface RestoreLogRateWeakeningNotificationEntry {
  id: string;
  actor: string;
  reason: RestoreLogRateWeakeningReason;
  priorEffective: number;
  newEffective: number;
  priorOverride: number | null;
  newOverride: number | null;
  recipients: string[];
  sent: boolean;
  errorMessage: string | null;
  occurredAt: string;
}

const WEAKENING_NOTIF_HISTORY_DEFAULT_LIMIT = 10;
const WEAKENING_NOTIF_HISTORY_MAX_LIMIT = 50;

export async function getRestoreLogRateWeakeningNotificationHistory(
  limit = WEAKENING_NOTIF_HISTORY_DEFAULT_LIMIT,
): Promise<RestoreLogRateWeakeningNotificationEntry[]> {
  const n = Math.max(
    1,
    Math.min(
      WEAKENING_NOTIF_HISTORY_MAX_LIMIT,
      Math.floor(limit) || WEAKENING_NOTIF_HISTORY_DEFAULT_LIMIT,
    ),
  );
  try {
    const rows = await db
      .select()
      .from(audienceRestoreLogRateWeakeningNotifications)
      .orderBy(desc(audienceRestoreLogRateWeakeningNotifications.occurredAt))
      .limit(n);
    return rows.map((r) => ({
      id: r.notificationId,
      actor: r.actor,
      reason: r.reason as RestoreLogRateWeakeningReason,
      priorEffective: r.priorEffective,
      newEffective: r.newEffective,
      priorOverride: r.priorOverride ?? null,
      newOverride: r.newOverride ?? null,
      recipients: r.recipients ?? [],
      sent: r.sent,
      errorMessage: r.errorMessage ?? null,
      occurredAt: (r.occurredAt instanceof Date
        ? r.occurredAt
        : new Date(r.occurredAt as any)
      ).toISOString(),
    }));
  } catch (err) {
    console.error(
      "[AudienceRestoreLogRateAlert] failed to read weakening notification history:",
      err,
    );
    return [];
  }
}

/**
 * Task #677 — bounded retention sweep. Mirrors
 * `pruneAuditExportNotificationsOlderThan` so the table can never grow
 * without bound; called from the audience retention sweeper on the
 * same daily cadence.
 */
export async function pruneRestoreLogRateWeakeningNotificationsOlderThan(
  cutoff: Date,
): Promise<number> {
  const res: any = await db
    .delete(audienceRestoreLogRateWeakeningNotifications)
    .where(lt(audienceRestoreLogRateWeakeningNotifications.occurredAt, cutoff));
  return (res?.rowCount as number) ?? 0;
}

/* --------------------------------------------------------------------- */
/* Task #571 — threshold-change history                                  */
/* --------------------------------------------------------------------- */

export interface RestoreLogRateThresholdHistoryEntry {
  id: string;
  priorOverride: number | null;
  newOverride: number | null;
  updatedBy: string | null;
  /**
   * Task #619 — human-readable identity for `updatedBy`, resolved by
   * joining the raw id against `admin_staff` (matched by id OR by
   * email/username so legacy session payloads still resolve). Null when
   * no match exists — UI falls back to the raw id.
   */
  updatedByDisplayName: string | null;
  updatedByEmail: string | null;
  occurredAt: string;
}

const RESTORE_LOG_RATE_HISTORY_DEFAULT_LIMIT = 10;
const RESTORE_LOG_RATE_HISTORY_MAX_LIMIT = 100;

export async function getRestoreLogRateThresholdHistory(
  limit = RESTORE_LOG_RATE_HISTORY_DEFAULT_LIMIT,
): Promise<RestoreLogRateThresholdHistoryEntry[]> {
  const n = Math.max(
    1,
    Math.min(
      RESTORE_LOG_RATE_HISTORY_MAX_LIMIT,
      Math.floor(limit) || RESTORE_LOG_RATE_HISTORY_DEFAULT_LIMIT,
    ),
  );
  try {
    const rows = await db
      .select()
      .from(audienceRestoreLogRateThresholdHistory)
      .orderBy(desc(audienceRestoreLogRateThresholdHistory.occurredAt))
      .limit(n);

    // Task #619 — resolve raw `updatedBy` ids to display name + email
    // by joining against admin_staff. Task #672 — uses the shared
    // `resolveAdminIdentities` helper so every audit panel gets the
    // same lookup behaviour.
    const identityById = await resolveAdminIdentities(
      rows.map((r) => r.updatedBy),
    );

    return rows.map((r) => {
      const raw = r.updatedBy ?? null;
      const ident = raw ? identityById.get(raw) ?? null : null;
      return {
        id: r.id,
        priorOverride: r.priorOverride ?? null,
        newOverride: r.newOverride ?? null,
        updatedBy: raw,
        updatedByDisplayName: ident?.displayName ?? null,
        updatedByEmail: ident?.email ?? null,
        occurredAt: (r.occurredAt instanceof Date
          ? r.occurredAt
          : new Date(r.occurredAt as any)
        ).toISOString(),
      };
    });
  } catch (err) {
    console.error(
      "[AudienceRestoreLogRateAlert] failed to read threshold history:",
      err,
    );
    return [];
  }
}

/**
 * Task #571 — bounded retention sweep. Mirrors
 * `pruneStaleRowsThresholdHistoryOlderThan` so the history table cannot
 * grow without bound; called from the audience retention sweeper on
 * the same audit-window cadence.
 */
export async function pruneRestoreLogRateThresholdHistoryOlderThan(
  cutoff: Date,
): Promise<number> {
  const res: any = await db
    .delete(audienceRestoreLogRateThresholdHistory)
    .where(lt(audienceRestoreLogRateThresholdHistory.occurredAt, cutoff));
  return (res?.rowCount as number) ?? 0;
}

async function countTodayInserts(now: Date = new Date()): Promise<number> {
  try {
    const since = startOfUtcDay(now);
    const r = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(audienceRestoreLog)
      .where(gte(audienceRestoreLog.restoredAt, since));
    return Number(r[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

async function isRateAlertActive(): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: platformAlerts.id })
      .from(platformAlerts)
      .where(
        and(
          eq(platformAlerts.type, AUDIENCE_RESTORE_LOG_RATE_ALERT_TYPE),
          eq(platformAlerts.acknowledged, false),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export interface RestoreLogRateStats {
  todayCount: number;
  threshold: number;
  override: number | null;
  envFallback: number | null;
  alertActive: boolean;
  windowStartIso: string;
  defaultThreshold: number;
  /**
   * Task #528 — per-day insert counts for the last N UTC days (default 7),
   * ordered oldest → newest. The final entry corresponds to today
   * (same value as `todayCount`). Lets admins see whether today is a
   * spike relative to the recent week at a glance.
   */
  dailyActivity: RestoreLogDailyActivityEntry[];
}

export interface RestoreLogDailyActivityEntry {
  /** ISO timestamp of the UTC day-start for this bucket. */
  dayStartIso: string;
  /** Number of `audience_restore_log` inserts that landed on that day. */
  count: number;
}

export const DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS = 7;
export const MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS = 30;

/**
 * Task #528 — return per-day insert counts for the last `days` UTC days,
 * ordered oldest → newest, with explicit zero-fills for days that had
 * no inserts. Caps at 30 days so a curious admin can't ask for a year.
 */
export async function getRestoreLogDailyActivity(
  days: number = DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
  now: Date = new Date(),
): Promise<RestoreLogDailyActivityEntry[]> {
  const n = Math.max(
    1,
    Math.min(MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS, Math.floor(days)),
  );
  const today = startOfUtcDay(now);
  const since = new Date(today.getTime() - (n - 1) * 24 * 60 * 60 * 1000);
  const buckets: RestoreLogDailyActivityEntry[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    buckets.push({ dayStartIso: d.toISOString(), count: 0 });
  }
  try {
    const rows = await db
      .select({ restoredAt: audienceRestoreLog.restoredAt })
      .from(audienceRestoreLog)
      .where(gte(audienceRestoreLog.restoredAt, since));
    const byIso = new Map<string, number>();
    for (const b of buckets) byIso.set(b.dayStartIso, 0);
    for (const r of rows) {
      const t = r.restoredAt instanceof Date ? r.restoredAt : new Date(r.restoredAt as any);
      if (Number.isNaN(t.getTime())) continue;
      const dayIso = new Date(
        Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
      ).toISOString();
      if (byIso.has(dayIso)) byIso.set(dayIso, (byIso.get(dayIso) ?? 0) + 1);
    }
    for (const b of buckets) b.count = byIso.get(b.dayStartIso) ?? 0;
  } catch {
    // fall through — return zero-filled buckets
  }
  return buckets;
}

export async function getRestoreLogRateStats(
  now: Date = new Date(),
): Promise<RestoreLogRateStats> {
  const [eff, todayCount, alertActive, dailyActivity] = await Promise.all([
    getEffectiveRestoreLogRateThreshold(),
    countTodayInserts(now),
    isRateAlertActive(),
    getRestoreLogDailyActivity(DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS, now),
  ]);
  return {
    todayCount,
    threshold: eff.threshold,
    override: eff.override,
    envFallback: eff.envFallback,
    alertActive,
    windowStartIso: startOfUtcDay(now).toISOString(),
    defaultThreshold: DEFAULT_AUDIENCE_RESTORE_LOG_RATE_THRESHOLD,
    dailyActivity,
  };
}

export interface RestoreLogRateCheckContext {
  restoredBy: string;
  now?: Date;
}

class AudienceRestoreLogRateAlertService {
  private lastAlertAt: number | null = null;
  private suppressedSince: number | null = null;
  private suppressedCount = 0;
  private consecutiveOver = 0;
  private emailService = new EmailService();

  /**
   * Inspect today's `audience_restore_log` insert count and fire a
   * founder alert + email when it crosses the configured threshold.
   * Safe to call after every restore insert; the service handles dedup
   * internally.
   *
   * Returns `true` if a notification was actually fired, `false` if it
   * was suppressed by the rate limit or the count is below threshold.
   */
  async checkAndNotify(ctx: RestoreLogRateCheckContext): Promise<boolean> {
    const now = ctx.now ?? new Date();
    const { threshold } = await getEffectiveRestoreLogRateThreshold();
    if (threshold <= 0) {
      // Alerting disabled — also clear any stale state.
      this.consecutiveOver = 0;
      this.suppressedSince = null;
      this.suppressedCount = 0;
      this.lastAlertAt = null;
      return false;
    }

    const todayCount = await countTodayInserts(now);

    if (todayCount < threshold) {
      this.consecutiveOver = 0;
      this.suppressedSince = null;
      this.suppressedCount = 0;
      this.lastAlertAt = null;
      await this.autoResolveOpen({ todayCount, threshold, now });
      return false;
    }

    this.consecutiveOver += 1;
    const ts = now.getTime();
    const window = dedupWindowMs();
    if (
      this.lastAlertAt != null &&
      window > 0 &&
      ts - this.lastAlertAt < window
    ) {
      this.suppressedSince ??= this.lastAlertAt;
      this.suppressedCount += 1;
      return false;
    }

    const suppressedCount = this.suppressedCount;
    const suppressedSince = this.suppressedSince;
    this.lastAlertAt = ts;
    this.suppressedSince = null;
    this.suppressedCount = 0;

    const title = "Audience restore log filling up unusually fast";
    const repeatedNote =
      suppressedCount > 0
        ? ` (${suppressedCount} similar warning${
            suppressedCount === 1 ? "" : "s"
          } suppressed since ${
            suppressedSince ? new Date(suppressedSince).toISOString() : "?"
          })`
        : this.consecutiveOver > 1
          ? ` (${this.consecutiveOver} consecutive checks over threshold)`
          : "";
    const message =
      `${title}: ${todayCount} restore${todayCount === 1 ? "" : "s"} ` +
      `today (threshold=${threshold}, lastRestoredBy=${ctx.restoredBy})` +
      repeatedNote;

    try {
      await panicButtonService.createAlert({
        type: AUDIENCE_RESTORE_LOG_RATE_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          source: "audience-restore-log-rate-alert-service",
          todayCount,
          threshold,
          restoredBy: ctx.restoredBy,
          windowStartIso: startOfUtcDay(now).toISOString(),
          consecutiveOver: this.consecutiveOver,
          suppressedCount,
          suppressedSince: suppressedSince
            ? new Date(suppressedSince).toISOString()
            : null,
          dedupWindowMs: window,
          link: ALERT_LINK,
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[AudienceRestoreLogRateAlert] failed to create platform alert:",
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
        "[AudienceRestoreLogRateAlert] failed to email admins:",
        err,
      );
    }

    return true;
  }

  private async autoResolveOpen(ctx: {
    todayCount: number;
    threshold: number;
    now: Date;
  }): Promise<number> {
    let resolved = 0;
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(platformAlerts.type, AUDIENCE_RESTORE_LOG_RATE_ALERT_TYPE),
            eq(platformAlerts.acknowledged, false),
          ),
        )
        .orderBy(desc(platformAlerts.createdAt));
      if (open.length === 0) return 0;
      const resolvedAt = ctx.now;
      for (const row of open) {
        const prevDetails =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const mergedDetails = {
          ...prevDetails,
          autoResolved: true,
          autoResolvedAt: resolvedAt.toISOString(),
          autoResolvedTodayCount: ctx.todayCount,
          autoResolvedThreshold: ctx.threshold,
          autoResolvedNote:
            "Auto-cleared after restore-log insert rate dropped below threshold.",
        };
        await db
          .update(platformAlerts)
          .set({
            acknowledged: true,
            acknowledgedBy: "system",
            acknowledgedAt: resolvedAt,
            details: mergedDetails,
          })
          .where(eq(platformAlerts.id, row.id));
        resolved += 1;
      }
      if (resolved > 0) {
        console.log(
          `[AudienceRestoreLogRateAlert] auto-resolved ${resolved} open alert(s) after rate recovered`,
        );
      }
    } catch (err) {
      console.error(
        "[AudienceRestoreLogRateAlert] failed to auto-resolve alerts:",
        err,
      );
    }
    return resolved;
  }

  /** Test helper: clear all dedup / counter state. */
  resetForTests() {
    this.lastAlertAt = null;
    this.suppressedSince = null;
    this.suppressedCount = 0;
    this.consecutiveOver = 0;
  }
}

export const audienceRestoreLogRateAlertService =
  new AudienceRestoreLogRateAlertService();
