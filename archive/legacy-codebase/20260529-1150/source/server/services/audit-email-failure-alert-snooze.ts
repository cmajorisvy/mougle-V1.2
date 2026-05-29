/**
 * Shared snooze helper for the two audit-email failure-alert services
 * (Task #560).
 *
 * Persists a `{ snoozeUntil, updatedAt, updatedBy }` JSON blob in
 * `system_settings` under a caller-provided key, capped at 90 days into
 * the future so a founder cannot accidentally mute alerts forever. Used
 * by:
 *
 *   - `audience-audit-email-failure-alert-service.ts` (trail email,
 *     Task #520)
 *   - `audience-audit-history-email-failure-alert-service.ts` (history
 *     email, Task #482)
 *
 * Hard rules:
 *   - `setSnooze(key, null)` clears the snooze and returns
 *     `{ snoozeUntil: null, ... }`.
 *   - `setSnooze(key, iso)` requires a parseable ISO timestamp strictly
 *     in the future; values further than 90 days out are silently
 *     clamped to now + 90d (so the UI does not have to surface a
 *     validation error for "until DATE" presets the founder picked).
 *   - `isSnoozed(key)` returns `true` only while `snoozeUntil` is in the
 *     future at call time; once it has elapsed the row is left in place
 *     but treated as "not snoozed", so resume-after-expiry is automatic.
 *
 * Task #613 — every snooze action ("set", "cleared", "expired") is also
 * appended to `audience_audit_email_failure_alert_snoozes` so the
 * founder can review who muted which alert when long after the live
 * `system_settings` row has been overwritten. The history table is
 * read-only with respect to alert dispatch (never gates a send) and is
 * pruned on the audience-retention cadence.
 */

import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db";
import {
  systemSettings,
  audienceAuditEmailFailureAlertSnoozes,
  type AudienceAuditEmailFailureAlertSnoozeRow,
} from "@shared/schema";

export const MAX_SNOOZE_DAYS = 90;
const MAX_SNOOZE_MS = MAX_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

export interface AuditEmailFailureAlertSnoozeConfig {
  snoozeUntil: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  /**
   * Task #614 — timestamp at which a one-time "snooze about to expire"
   * reminder email was sent for the *current* snooze window. Reset to
   * `null` whenever `setAuditEmailFailureAlertSnooze` writes a new
   * `snoozeUntil` so a fresh reminder fires for the next window. A
   * value older than `snoozeUntil` is also treated as "not yet sent"
   * defensively.
   */
  expiryReminderSentAt: string | null;
}

const DEFAULT_CONFIG: AuditEmailFailureAlertSnoozeConfig = {
  snoozeUntil: null,
  updatedAt: null,
  updatedBy: null,
  expiryReminderSentAt: null,
};

export type AuditEmailFailureAlertSnoozeAction =
  | "set"
  | "cleared"
  | "expired";

export interface AuditEmailFailureAlertSnoozeHistoryEntry {
  id: string;
  alertKey: string;
  action: AuditEmailFailureAlertSnoozeAction;
  snoozeUntil: string | null;
  updatedBy: string | null;
  occurredAt: string;
}

function parse(raw: string | null | undefined): AuditEmailFailureAlertSnoozeConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return { ...DEFAULT_CONFIG };
    const snoozeUntil =
      typeof p.snoozeUntil === "string" && !Number.isNaN(Date.parse(p.snoozeUntil))
        ? new Date(p.snoozeUntil).toISOString()
        : null;
    const expiryReminderSentAt =
      typeof p.expiryReminderSentAt === "string" &&
      !Number.isNaN(Date.parse(p.expiryReminderSentAt))
        ? new Date(p.expiryReminderSentAt).toISOString()
        : null;
    return {
      snoozeUntil,
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : null,
      updatedBy: typeof p.updatedBy === "string" ? p.updatedBy : null,
      expiryReminderSentAt,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function appendSnoozeHistory(input: {
  alertKey: string;
  action: AuditEmailFailureAlertSnoozeAction;
  snoozeUntil: Date | null;
  updatedBy: string | null;
  occurredAt: Date;
  dedupKey: string | null;
}): Promise<void> {
  try {
    await db
      .insert(audienceAuditEmailFailureAlertSnoozes)
      .values({
        alertKey: input.alertKey,
        action: input.action,
        snoozeUntil: input.snoozeUntil ?? undefined,
        updatedBy: input.updatedBy ?? undefined,
        occurredAt: input.occurredAt,
        dedupKey: input.dedupKey ?? undefined,
      })
      .onConflictDoNothing();
  } catch (err) {
    // History is best-effort: never poison a snooze write because the
    // append-only audit table is temporarily unavailable.
    console.error(
      `[audit-email-failure-snooze] failed to append history for ${input.alertKey}:`,
      (err as Error)?.message ?? err,
    );
  }
}

export async function getAuditEmailFailureAlertSnooze(
  key: string,
): Promise<AuditEmailFailureAlertSnoozeConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (rows.length === 0) return { ...DEFAULT_CONFIG };
    return parse(rows[0].value);
  } catch (err) {
    console.error(
      `[audit-email-failure-snooze] failed to load ${key}:`,
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_CONFIG };
  }
}

export async function isAuditEmailFailureAlertSnoozed(
  key: string,
  now: Date = new Date(),
): Promise<{ snoozed: boolean; snoozeUntil: string | null }> {
  const cfg = await getAuditEmailFailureAlertSnooze(key);
  if (!cfg.snoozeUntil) return { snoozed: false, snoozeUntil: null };
  const t = Date.parse(cfg.snoozeUntil);
  if (!Number.isFinite(t) || t <= now.getTime()) {
    // Task #613 — lazily record an "expired" history row the first time
    // we observe that a stored snooze window has elapsed. Dedup key is
    // deterministic on (key, snoozeUntil) so repeated calls are no-ops.
    await appendSnoozeHistory({
      alertKey: key,
      action: "expired",
      snoozeUntil: new Date(t),
      updatedBy: cfg.updatedBy,
      occurredAt: new Date(t),
      dedupKey: `expired:${key}:${new Date(t).toISOString()}`,
    });
    return { snoozed: false, snoozeUntil: cfg.snoozeUntil };
  }
  return { snoozed: true, snoozeUntil: cfg.snoozeUntil };
}

export async function setAuditEmailFailureAlertSnooze(
  key: string,
  input: { snoozeUntil: string | null; updatedBy?: string | null; now?: Date },
): Promise<AuditEmailFailureAlertSnoozeConfig> {
  const nowDate = input.now ?? new Date();
  // Snapshot the previous live snooze so we know whether the founder
  // actually cleared an active window (vs. clearing an already-empty
  // setting, which we don't bother logging).
  const previous = await getAuditEmailFailureAlertSnooze(key);
  const previouslyActive =
    !!previous.snoozeUntil && Date.parse(previous.snoozeUntil) > nowDate.getTime();
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
    const capped = Math.min(parsed, nowMs + MAX_SNOOZE_MS);
    snoozeUntil = new Date(capped).toISOString();
  }
  const next: AuditEmailFailureAlertSnoozeConfig = {
    snoozeUntil,
    updatedAt: nowDate.toISOString(),
    updatedBy: input.updatedBy ?? null,
    // Task #614 — a fresh snooze window always resets the
    // one-time-reminder receipt so the new window gets its own
    // 24h-before-expiry email. Clearing the snooze also clears the
    // receipt (so the next future snooze starts cleanly).
    expiryReminderSentAt: null,
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key,
      value: stored,
      updatedBy: input.updatedBy ?? undefined,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: stored,
        updatedBy: input.updatedBy ?? undefined,
        updatedAt: nowDate,
      },
    });

  // Task #613 — append a history row for the action just taken. We only
  // log a "cleared" row when an actually-active snooze was cleared, so
  // dashboard noise from idempotent unsnooze clicks stays minimal.
  if (snoozeUntil) {
    await appendSnoozeHistory({
      alertKey: key,
      action: "set",
      snoozeUntil: new Date(snoozeUntil),
      updatedBy: input.updatedBy ?? null,
      occurredAt: nowDate,
      dedupKey: `set:${key}:${snoozeUntil}:${nowDate.toISOString()}`,
    });
  } else if (previouslyActive) {
    await appendSnoozeHistory({
      alertKey: key,
      action: "cleared",
      snoozeUntil: previous.snoozeUntil ? new Date(previous.snoozeUntil) : null,
      updatedBy: input.updatedBy ?? null,
      occurredAt: nowDate,
      dedupKey: `cleared:${key}:${nowDate.toISOString()}`,
    });
  }
  return next;
}

/**
 * Task #614 — Mark the current snooze window as having had its
 * "snooze about to expire" reminder email sent. Preserves
 * `snoozeUntil`, `updatedAt`, and `updatedBy` so the founder's
 * original snooze window stays intact. Returns the persisted config,
 * or `null` if no snooze row currently exists (cannot remind on a
 * snooze that was never set).
 */
export async function markAuditEmailFailureAlertExpiryReminderSent(
  key: string,
  reminderSentAt: Date = new Date(),
): Promise<AuditEmailFailureAlertSnoozeConfig | null> {
  const current = await getAuditEmailFailureAlertSnooze(key);
  if (!current.snoozeUntil) return null;
  const next: AuditEmailFailureAlertSnoozeConfig = {
    ...current,
    expiryReminderSentAt: reminderSentAt.toISOString(),
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({ key, value: stored })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: stored, updatedAt: reminderSentAt },
    });
  return next;
}

function rowToEntry(
  row: AudienceAuditEmailFailureAlertSnoozeRow,
): AuditEmailFailureAlertSnoozeHistoryEntry {
  return {
    id: row.id,
    alertKey: row.alertKey,
    action: row.action as AuditEmailFailureAlertSnoozeAction,
    snoozeUntil: row.snoozeUntil ? new Date(row.snoozeUntil).toISOString() : null,
    updatedBy: row.updatedBy,
    occurredAt: new Date(row.occurredAt).toISOString(),
  };
}

const HISTORY_MAX = 50;

/**
 * Task #613 — newest-first history of snooze actions for one alert.
 * `limit` is bounded to [1, 50] to keep the response payload small.
 */
export async function listAuditEmailFailureAlertSnoozeHistory(
  key: string,
  limit = 10,
): Promise<AuditEmailFailureAlertSnoozeHistoryEntry[]> {
  const bounded = Math.max(1, Math.min(HISTORY_MAX, Math.floor(limit)));
  try {
    const rows = await db
      .select()
      .from(audienceAuditEmailFailureAlertSnoozes)
      .where(eq(audienceAuditEmailFailureAlertSnoozes.alertKey, key))
      .orderBy(desc(audienceAuditEmailFailureAlertSnoozes.occurredAt))
      .limit(bounded);
    return rows.map(rowToEntry);
  } catch (err) {
    console.error(
      `[audit-email-failure-snooze] failed to list history for ${key}:`,
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

/**
 * Task #613 — prune snooze-history rows older than the supplied cutoff.
 * Called by the audience retention sweep on the same audit-window
 * cadence as the other history tables (Task #562 pattern).
 */
export async function pruneAuditEmailFailureAlertSnoozeHistoryOlderThan(
  cutoff: Date,
): Promise<number> {
  const deleted = await db
    .delete(audienceAuditEmailFailureAlertSnoozes)
    .where(lt(audienceAuditEmailFailureAlertSnoozes.occurredAt, cutoff))
    .returning({ id: audienceAuditEmailFailureAlertSnoozes.id });
  return deleted.length;
}

export async function clearAuditEmailFailureAlertSnoozeForTests(
  key: string,
): Promise<void> {
  try {
    await db.delete(systemSettings).where(eq(systemSettings.key, key));
    await db
      .delete(audienceAuditEmailFailureAlertSnoozes)
      .where(eq(audienceAuditEmailFailureAlertSnoozes.alertKey, key));
  } catch {
    /* test cleanup is best-effort */
  }
}
