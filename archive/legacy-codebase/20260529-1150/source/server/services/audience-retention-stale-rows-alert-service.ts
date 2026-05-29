/**
 * Audience-retention stale-rows backlog alert (Task #440).
 *
 * Task #418 exposed the per-table count of audit rows that are already
 * older than the retention window but still sitting in Postgres
 * (`stalePendingArchive`). That number is visible on the admin
 * retention card, but admins still have to open the dashboard to
 * notice the backlog growing. When a sweep keeps partially succeeding
 * (e.g. one table archives fine but another silently fails on every
 * tick) the existing silent-failure alert may never fire — the sweep
 * does return `error: null` overall — and the backlog can grow for
 * days unnoticed.
 *
 * This service mirrors `audience-retention-failure-alert-service.ts`:
 *   - Tracks a per-table threshold (default 10,000 rows).
 *   - Fires a founder `platform_alerts` row + a best-effort email to
 *     every active root admin whenever any audit table's stale-pending
 *     count crosses its threshold.
 *   - Rate-limits notifications so a backlog that stays above the
 *     threshold tick after tick does not spam the founder's inbox.
 *   - Auto-resolves any open backlog alert the next time the stale
 *     count drops back below threshold for every table.
 *
 * Threshold precedence (per table, highest first):
 *   1. admin override in `system_settings` under
 *      `audience_retention_stale_rows_thresholds` as JSON
 *      `{ messages?, decisions?, commands?, default? }`
 *   2. env var `AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD`
 *   3. compiled-in `DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD`
 *      (10,000)
 *
 * Dedup window precedence:
 *   1. env `AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS`
 *   2. default 1 hour
 *
 * `0` disables dedup entirely.
 */

import { and, desc, eq, gte, lt, lte, type SQL } from "drizzle-orm";
import { db } from "../db";
import { adminStaff, platformAlerts, systemSettings } from "@shared/schema";
import { audienceStaleRowsThresholdHistory } from "../../shared/omni-channel-audience-schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";
import type { AudienceRetentionTable } from "./audience-retention-service";
import { resolveAdminIdentities } from "./admin-identity-resolver";

export const AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE =
  "audience_retention_stale_rows_backlog";

export const AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY =
  "audience_retention_stale_rows_thresholds";

/** Task #676 — `system_settings` key for the per-control opt-out toggle. */
export const AUDIENCE_RETENTION_STALE_ROWS_NOTIFY_ON_WEAKENING_SETTING_KEY =
  "audience_retention_stale_rows_notify_on_weakening";

export const DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD = 10_000;

/** Task #676 — multiplier above which a loosening triggers a notify. */
export const STALE_ROWS_WEAKENING_MULTIPLIER = 2;

const DEFAULT_DEDUP_MS = 60 * 60 * 1000;

const ALERT_LINK = "/admin/omni-channel-audience#retention";

const TABLES: AudienceRetentionTable[] = ["messages", "decisions", "commands"];

export interface StaleRowsThresholds {
  messages: number;
  decisions: number;
  commands: number;
}

export type StaleRowsThresholdOverride = Partial<
  Record<AudienceRetentionTable | "default", number>
>;

function envThreshold(): number | null {
  const raw = Number(process.env.AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD);
  if (!Number.isFinite(raw) || raw < 0) return null;
  return Math.floor(raw);
}

function dedupWindowMs(): number {
  const raw = Number(process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_DEDUP_MS;
}

interface OverrideRow {
  override: StaleRowsThresholdOverride;
  updatedBy: string | null;
  updatedAt: string | null;
}

async function readOverride(): Promise<OverrideRow | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY,
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const parsed = JSON.parse(rows[0].value);
    if (!parsed || typeof parsed !== "object") return null;
    const out: StaleRowsThresholdOverride = {};
    for (const k of ["messages", "decisions", "commands", "default"] as const) {
      const v = Number((parsed as any)[k]);
      if (Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
    }
    if (Object.keys(out).length === 0) return null;
    return {
      override: out,
      updatedBy: rows[0].updatedBy ?? null,
      updatedAt: rows[0].updatedAt ? rows[0].updatedAt.toISOString() : null,
    };
  } catch {
    return null;
  }
}

export async function getEffectiveStaleRowsThresholds(): Promise<{
  thresholds: StaleRowsThresholds;
  override: StaleRowsThresholdOverride | null;
  envFallback: number | null;
  updatedBy: string | null;
  /**
   * Task #672 — human-readable identity for `updatedBy`, resolved by
   * joining the raw id against `admin_staff` (matched by id OR by
   * email/username so legacy session payloads still resolve). Null
   * when no match exists — the UI falls back to the raw id.
   */
  updatedByDisplayName: string | null;
  updatedByEmail: string | null;
  updatedAt: string | null;
}> {
  const row = await readOverride();
  const override = row?.override ?? null;
  const env = envThreshold();
  const base =
    override?.default ?? env ?? DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD;
  const thresholds: StaleRowsThresholds = {
    messages: override?.messages ?? base,
    decisions: override?.decisions ?? base,
    commands: override?.commands ?? base,
  };
  const rawUpdatedBy = row?.updatedBy ?? null;
  let updatedByDisplayName: string | null = null;
  let updatedByEmail: string | null = null;
  if (rawUpdatedBy) {
    const identityById = await resolveAdminIdentities([rawUpdatedBy]);
    const ident = identityById.get(rawUpdatedBy) ?? null;
    updatedByDisplayName = ident?.displayName ?? null;
    updatedByEmail = ident?.email ?? null;
  }
  return {
    thresholds,
    override,
    envFallback: env,
    updatedBy: rawUpdatedBy,
    updatedByDisplayName,
    updatedByEmail,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function setStaleRowsThresholdOverride(
  value: StaleRowsThresholdOverride | null,
  updatedBy?: string,
): Promise<{
  thresholds: StaleRowsThresholds;
  override: StaleRowsThresholdOverride | null;
  envFallback: number | null;
  updatedBy: string | null;
  updatedByDisplayName: string | null;
  updatedByEmail: string | null;
  updatedAt: string | null;
}> {
  // Task #556 — snapshot the prior override BEFORE we touch the row so
  // we can write a who/what audit entry. The Retention Mode card surfaces
  // these entries so admins can answer "who lowered the messages
  // threshold to 250 last Tuesday?" without crawling through git
  // history.
  const prior = await readOverride();
  // Task #676 — also snapshot the effective per-table thresholds so we
  // can detect whether this change weakens the alert (set to 0, or
  // loosened by 2x+) and notify root admins.
  const priorEffective = await getEffectiveStaleRowsThresholds();
  if (value === null) {
    await db
      .delete(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY,
        ),
      );
  } else {
    const cleaned: StaleRowsThresholdOverride = {};
    for (const k of ["messages", "decisions", "commands", "default"] as const) {
      const v = Number(value[k]);
      if (Number.isFinite(v) && v >= 0) cleaned[k] = Math.floor(v);
    }
    const stored = JSON.stringify(cleaned);
    await db
      .insert(systemSettings)
      .values({
        key: AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY,
        value: stored,
        updatedBy,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: stored, updatedBy, updatedAt: new Date() },
      });
  }
  try {
    await db.insert(audienceStaleRowsThresholdHistory).values({
      priorOverride: prior?.override ?? null,
      newOverride: value,
      updatedBy: updatedBy ?? null,
    });
  } catch (err) {
    console.error(
      "[AudienceRetentionStaleRowsAlert] failed to record threshold history:",
      err,
    );
  }
  const newEffective = await getEffectiveStaleRowsThresholds();
  try {
    await maybeNotifyStaleRowsWeakening({
      prior: priorEffective.thresholds,
      next: newEffective.thresholds,
      actor: updatedBy ?? "unknown",
    });
  } catch (err) {
    console.error(
      "[AudienceRetentionStaleRowsAlert] failed to send weakening notification:",
      err,
    );
  }
  return newEffective;
}

/* --------------------------------------------------------------------- */
/* Task #676 — notify-on-weakening toggle + email                        */
/* --------------------------------------------------------------------- */

export async function isStaleRowsNotifyOnWeakeningEnabled(): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_RETENTION_STALE_ROWS_NOTIFY_ON_WEAKENING_SETTING_KEY,
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

export async function setStaleRowsNotifyOnWeakeningEnabled(
  enabled: boolean,
  updatedBy?: string,
): Promise<{ enabled: boolean }> {
  const stored = enabled ? "true" : "false";
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_RETENTION_STALE_ROWS_NOTIFY_ON_WEAKENING_SETTING_KEY,
      value: stored,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: stored, updatedBy, updatedAt: new Date() },
    });
  return { enabled };
}

export type StaleRowsWeakeningReason = "disabled" | "loosened_2x";

export interface StaleRowsWeakeningEntry {
  table: AudienceRetentionTable;
  reason: StaleRowsWeakeningReason;
  prior: number;
  next: number;
}

export function classifyStaleRowsWeakening(
  prior: StaleRowsThresholds,
  next: StaleRowsThresholds,
): StaleRowsWeakeningEntry[] {
  const out: StaleRowsWeakeningEntry[] = [];
  for (const table of ["messages", "decisions", "commands"] as const) {
    const p = prior[table];
    const n = next[table];
    if (n === 0 && p > 0) {
      out.push({ table, reason: "disabled", prior: p, next: n });
    } else if (p > 0 && n >= STALE_ROWS_WEAKENING_MULTIPLIER * p) {
      out.push({ table, reason: "loosened_2x", prior: p, next: n });
    }
  }
  return out;
}

async function maybeNotifyStaleRowsWeakening(args: {
  prior: StaleRowsThresholds;
  next: StaleRowsThresholds;
  actor: string;
}): Promise<boolean> {
  const weakened = classifyStaleRowsWeakening(args.prior, args.next);
  if (weakened.length === 0) return false;
  const enabled = await isStaleRowsNotifyOnWeakeningEnabled();
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
    .map(
      (w) =>
        `${w.table}: ${w.prior.toLocaleString()} → ${w.next.toLocaleString()} (${
          w.reason === "disabled" ? "DISABLED" : "loosened 2x+"
        })`,
    )
    .join("\n");
  const worst: StaleRowsWeakeningReason = weakened.some(
    (w) => w.reason === "disabled",
  )
    ? "disabled"
    : "loosened_2x";
  const emailService = new EmailService();
  await emailService.sendSafetyThresholdWeakenedEmail(to, {
    controlLabel: "Audience stale-rows backlog threshold",
    controlKey: AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY,
    actor: args.actor,
    reason: worst,
    detail,
    link: ALERT_LINK,
    occurredAt: new Date().toISOString(),
  });
  return true;
}

/* --------------------------------------------------------------------- */
/* Task #556 — threshold-change history                                  */
/* --------------------------------------------------------------------- */

export interface StaleRowsThresholdHistoryEntry {
  id: string;
  priorOverride: StaleRowsThresholdOverride | null;
  newOverride: StaleRowsThresholdOverride | null;
  updatedBy: string | null;
  /**
   * Task #672 — human-readable identity for `updatedBy`, resolved by
   * joining the raw id against `admin_staff` (matched by id OR by
   * email/username so legacy session payloads still resolve). Null
   * when no match exists — the UI falls back to the raw id.
   */
  updatedByDisplayName: string | null;
  updatedByEmail: string | null;
  occurredAt: string;
}

const STALE_ROWS_HISTORY_DEFAULT_LIMIT = 10;
const STALE_ROWS_HISTORY_MAX_LIMIT = 100;

export interface StaleRowsThresholdHistoryFilters {
  updatedBy?: string | null;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
}

function coerceHistoryFilterDate(
  value: string | Date | null | undefined,
): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function getStaleRowsThresholdHistory(
  limit: number = STALE_ROWS_HISTORY_DEFAULT_LIMIT,
  filters: StaleRowsThresholdHistoryFilters = {},
): Promise<StaleRowsThresholdHistoryEntry[]> {
  const n = Math.max(
    1,
    Math.min(STALE_ROWS_HISTORY_MAX_LIMIT, Math.floor(limit) || STALE_ROWS_HISTORY_DEFAULT_LIMIT),
  );
  const conds: SQL[] = [];
  const updatedBy =
    typeof filters.updatedBy === "string" ? filters.updatedBy.trim() : "";
  if (updatedBy) {
    conds.push(eq(audienceStaleRowsThresholdHistory.updatedBy, updatedBy));
  }
  const fromDate = coerceHistoryFilterDate(filters.fromDate ?? null);
  if (fromDate) {
    conds.push(gte(audienceStaleRowsThresholdHistory.occurredAt, fromDate));
  }
  const toDate = coerceHistoryFilterDate(filters.toDate ?? null);
  if (toDate) {
    conds.push(lte(audienceStaleRowsThresholdHistory.occurredAt, toDate));
  }
  try {
    const where =
      conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
    const q = db
      .select()
      .from(audienceStaleRowsThresholdHistory)
      .$dynamic();
    if (where) q.where(where);
    const rows = await q
      .orderBy(desc(audienceStaleRowsThresholdHistory.occurredAt))
      .limit(n);
    const identityById = await resolveAdminIdentities(
      rows.map((r) => r.updatedBy),
    );
    return rows.map((r) => {
      const raw = r.updatedBy ?? null;
      const ident = raw ? identityById.get(raw) ?? null : null;
      return {
        id: r.id,
        priorOverride: (r.priorOverride as StaleRowsThresholdOverride | null) ?? null,
        newOverride: (r.newOverride as StaleRowsThresholdOverride | null) ?? null,
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
      "[AudienceRetentionStaleRowsAlert] failed to read threshold history:",
      err,
    );
    return [];
  }
}

/**
 * Task #606 — full threshold-change history for CSV export. Returns
 * every persisted row (newest first) so compliance reviewers can attach
 * the complete audit trail to post-incident write-ups instead of just
 * the last `STALE_ROWS_HISTORY_DEFAULT_LIMIT` rows.
 */
export async function getAllStaleRowsThresholdHistory(
  filters: StaleRowsThresholdHistoryFilters = {},
): Promise<StaleRowsThresholdHistoryEntry[]> {
  const conds: SQL[] = [];
  const updatedBy =
    typeof filters.updatedBy === "string" ? filters.updatedBy.trim() : "";
  if (updatedBy) {
    conds.push(eq(audienceStaleRowsThresholdHistory.updatedBy, updatedBy));
  }
  const fromDate = coerceHistoryFilterDate(filters.fromDate ?? null);
  if (fromDate) {
    conds.push(gte(audienceStaleRowsThresholdHistory.occurredAt, fromDate));
  }
  const toDate = coerceHistoryFilterDate(filters.toDate ?? null);
  if (toDate) {
    conds.push(lte(audienceStaleRowsThresholdHistory.occurredAt, toDate));
  }
  try {
    const where =
      conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
    const q = db
      .select()
      .from(audienceStaleRowsThresholdHistory)
      .$dynamic();
    if (where) q.where(where);
    const rows = await q.orderBy(
      desc(audienceStaleRowsThresholdHistory.occurredAt),
    );
    const identityById = await resolveAdminIdentities(
      rows.map((r) => r.updatedBy),
    );
    return rows.map((r) => {
      const raw = r.updatedBy ?? null;
      const ident = raw ? identityById.get(raw) ?? null : null;
      return {
        id: r.id,
        priorOverride: (r.priorOverride as StaleRowsThresholdOverride | null) ?? null,
        newOverride: (r.newOverride as StaleRowsThresholdOverride | null) ?? null,
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
      "[AudienceRetentionStaleRowsAlert] failed to read full threshold history:",
      err,
    );
    return [];
  }
}

/**
 * Task #556 — bounded retention sweep. Mirrors
 * `pruneAuditExportNotificationsOlderThan` so the history table cannot
 * grow without bound; called from the audience retention sweeper on the
 * same audit-window cadence.
 */
export async function pruneStaleRowsThresholdHistoryOlderThan(
  cutoff: Date,
): Promise<number> {
  const res: any = await db
    .delete(audienceStaleRowsThresholdHistory)
    .where(lt(audienceStaleRowsThresholdHistory.occurredAt, cutoff));
  return (res?.rowCount as number) ?? 0;
}

export interface StaleRowsCheckContext {
  stalePendingArchive: Record<AudienceRetentionTable, number>;
  retentionDays: number;
  trigger: "scheduled" | "manual" | "cli";
}

class AudienceRetentionStaleRowsAlertService {
  private lastAlertAt: number | null = null;
  private suppressedSince: number | null = null;
  private suppressedCount = 0;
  private consecutiveOver = 0;
  private emailService = new EmailService();

  /**
   * Inspect the current stale-pending-archive counts and fire a founder
   * alert + email when any table is above its threshold. Safe to call
   * after every sweep; the service handles dedup internally.
   *
   * Returns `true` if a notification was actually fired, `false` if it
   * was suppressed by the rate limit or every table is below threshold.
   */
  async checkAndNotify(ctx: StaleRowsCheckContext): Promise<boolean> {
    const { thresholds } = await getEffectiveStaleRowsThresholds();
    const offenders = TABLES.filter(
      (t) =>
        thresholds[t] > 0 && (ctx.stalePendingArchive[t] ?? 0) >= thresholds[t],
    );

    if (offenders.length === 0) {
      // Healthy — reset suppression state and auto-resolve any open
      // backlog alerts so the founder dashboard doesn't keep showing
      // a stale warning after the backlog recovers.
      this.consecutiveOver = 0;
      this.suppressedSince = null;
      this.suppressedCount = 0;
      this.lastAlertAt = null;
      await this.autoResolveOpen(ctx);
      return false;
    }

    this.consecutiveOver += 1;
    const now = Date.now();
    const window = dedupWindowMs();
    if (
      this.lastAlertAt != null &&
      window > 0 &&
      now - this.lastAlertAt < window
    ) {
      this.suppressedSince ??= this.lastAlertAt;
      this.suppressedCount += 1;
      return false;
    }

    const suppressedCount = this.suppressedCount;
    const suppressedSince = this.suppressedSince;
    this.lastAlertAt = now;
    this.suppressedSince = null;
    this.suppressedCount = 0;

    const title = "Audience retention stale-rows backlog over threshold";
    const offenderDetail = offenders
      .map(
        (t) =>
          `${t}=${ctx.stalePendingArchive[t]}/${thresholds[t]}`,
      )
      .join(", ");
    const repeatedNote =
      suppressedCount > 0
        ? ` (${suppressedCount} similar warning${
            suppressedCount === 1 ? "" : "s"
          } suppressed since ${
            suppressedSince ? new Date(suppressedSince).toISOString() : "?"
          })`
        : this.consecutiveOver > 1
          ? ` (${this.consecutiveOver} consecutive ticks over threshold)`
          : "";
    const message =
      `${title}: ${offenderDetail} ` +
      `(retentionDays=${ctx.retentionDays}, trigger=${ctx.trigger})` +
      repeatedNote;

    try {
      await panicButtonService.createAlert({
        type: AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          source: "audience-retention-stale-rows-alert-service",
          stalePendingArchive: ctx.stalePendingArchive,
          thresholds,
          offenders,
          retentionDays: ctx.retentionDays,
          trigger: ctx.trigger,
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
        "[AudienceRetentionStaleRowsAlert] failed to create platform alert:",
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
        "[AudienceRetentionStaleRowsAlert] failed to email admins:",
        err,
      );
    }

    return true;
  }

  private async autoResolveOpen(ctx: StaleRowsCheckContext): Promise<number> {
    let resolved = 0;
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(
              platformAlerts.type,
              AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE,
            ),
            eq(platformAlerts.acknowledged, false),
          ),
        )
        .orderBy(desc(platformAlerts.createdAt));
      if (open.length === 0) return 0;
      const resolvedAt = new Date();
      for (const row of open) {
        const prevDetails =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const mergedDetails = {
          ...prevDetails,
          autoResolved: true,
          autoResolvedAt: resolvedAt.toISOString(),
          autoResolvedRetentionDays: ctx.retentionDays,
          autoResolvedTrigger: ctx.trigger,
          autoResolvedStalePendingArchive: ctx.stalePendingArchive,
          autoResolvedNote:
            "Auto-cleared after stale-rows backlog dropped below threshold.",
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
          `[AudienceRetentionStaleRowsAlert] auto-resolved ${resolved} open alert(s) after backlog recovered`,
        );
      }
    } catch (err) {
      console.error(
        "[AudienceRetentionStaleRowsAlert] failed to auto-resolve alerts:",
        err,
      );
    }
    return resolved;
  }

  /**
   * Manually acknowledge every open backlog alert. Used by the admin
   * "Acknowledge" button on the Retention Mode card so ops can dismiss
   * a known/triaged backlog without leaving the audience dashboard.
   *
   * Resets the dedup state so a fresh backlog can re-alert immediately
   * after acknowledgment.
   *
   * Returns the number of alerts that were acknowledged.
   */
  async acknowledgeOpenAlerts(acknowledgedBy: string): Promise<number> {
    let resolved = 0;
    const actor = acknowledgedBy && acknowledgedBy.length > 0
      ? acknowledgedBy
      : "root_admin";
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(
              platformAlerts.type,
              AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE,
            ),
            eq(platformAlerts.acknowledged, false),
          ),
        )
        .orderBy(desc(platformAlerts.createdAt));
      if (open.length === 0) {
        this.lastAlertAt = null;
        this.suppressedSince = null;
        this.suppressedCount = 0;
        return 0;
      }
      const resolvedAt = new Date();
      for (const row of open) {
        const prevDetails =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const mergedDetails = {
          ...prevDetails,
          manuallyAcknowledged: true,
          manuallyAcknowledgedAt: resolvedAt.toISOString(),
          manuallyAcknowledgedBy: actor,
          manuallyAcknowledgedNote:
            "Manually acknowledged from the Retention Mode card.",
        };
        await db
          .update(platformAlerts)
          .set({
            acknowledged: true,
            acknowledgedBy: actor,
            acknowledgedAt: resolvedAt,
            details: mergedDetails,
          })
          .where(eq(platformAlerts.id, row.id));
        resolved += 1;
      }
      this.lastAlertAt = null;
      this.suppressedSince = null;
      this.suppressedCount = 0;
      if (resolved > 0) {
        console.log(
          `[AudienceRetentionStaleRowsAlert] manually acknowledged ${resolved} open alert(s) by ${actor}`,
        );
      }
    } catch (err) {
      console.error(
        "[AudienceRetentionStaleRowsAlert] failed to acknowledge alerts:",
        err,
      );
      throw err;
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

export const audienceRetentionStaleRowsAlertService =
  new AudienceRetentionStaleRowsAlertService();
