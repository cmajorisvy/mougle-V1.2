/**
 * Founder PTO mode (Task #563).
 *
 * Task #516 added an auto-extend + weekday-mute snooze policy to the
 * audience-archive-deletion-notifier. The same machinery is useful for
 * every other founder-facing notifier so the founder can mute the whole
 * notifier stack during planned PTO without flipping each one
 * individually.
 *
 * This service stores a single global snooze policy + an enrollment
 * list of notifier ids. Each enrolled notifier asks
 * `isNotifierMutedByPto(id, now)` from inside its existing
 * "should I skip this send?" path. Per-notifier snoozes still apply
 * independently — PTO mode is an additional OR-gate.
 *
 * Hard rules:
 *   - Read-only with respect to notifier-owned state. PTO mode never
 *     mutates `audience_archive_deletion_notifier` or
 *     `audience_audit_export_notifier` configs.
 *   - When `enabled === false`, the PTO gate is a no-op regardless of
 *     the snooze policy. Founders unsnooze either by clearing the
 *     window or flipping the global toggle.
 *   - `auto_extend` policy bypasses the 90-day cap (same as #516).
 *   - All persistence failures are caught + logged. A flaky DB cannot
 *     crash a notifier tick.
 */

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../db";
import { systemSettings, founderPtoSuppressionLog } from "@shared/schema";
import {
  MAX_AUTO_EXTEND_DAYS,
  getAudienceArchiveDeletionNotifierConfig,
  type SnoozePolicy,
  type SnoozeSource,
} from "./audience-archive-deletion-notifier";
import { emailService } from "./email-service";

export const FOUNDER_PTO_MODE_SETTING_KEY = "founder_pto_mode";

/**
 * Registry of notifiers that can be enrolled in PTO mode. Each entry is
 * a stable id (used in storage + API), a human label for the admin UI,
 * and a short description of what the notifier emails.
 */
export interface PtoNotifierDescriptor {
  id: string;
  label: string;
  description: string;
}

export const PTO_NOTIFIER_REGISTRY: ReadonlyArray<PtoNotifierDescriptor> = [
  {
    id: "audience_archive_deletion",
    label: "Audience archive deletion alerts",
    description:
      "Upcoming-expiry digest + post-cleanup summary for the omni-channel audience archive.",
  },
  {
    id: "audience_audit_export",
    label: "Audience audit-export alerts",
    description:
      "Fires when anyone pulls the audience audit trail (with dedup + outlier escalation).",
  },
  {
    id: "gateway_block_alert",
    label: "Gateway block-storm alerts",
    description:
      "Pages when audience-platform gateway blocks for a platform exceed the rolling-window threshold.",
  },
  {
    id: "audience_retention_failure",
    label: "Audience retention sweep failure alerts",
    description:
      "Fires when the daily audience-retention sweep fails to prune audit tables.",
  },
  {
    id: "broadcast_sweep_failure",
    label: "Broadcast sweep failure alerts",
    description:
      "Fires when the scheduled broadcast cover/media sweep fails or crashes.",
  },
  {
    id: "shorts_backlog",
    label: "Shorts approval backlog alerts",
    description:
      "Fires when pending shorts drafts cross the founder-configured backlog threshold.",
  },
  {
    id: "live_broadcast",
    label: "Live broadcast detection alerts",
    description:
      "Fires when the scheduled scan finds non-dry-run broadcast rows over the threshold.",
  },
  {
    id: "audience_connector_rotation",
    label: "Audience connector token rotation alerts",
    description:
      "Fires the moment a per-connector platform access token is installed, rotated, or wiped.",
  },
  {
    id: "production_asset_orphan_sweep",
    label: "3D asset orphan sweep alerts",
    description:
      "Fires when the scheduled sweep finds archived 3D asset rows whose object bytes are missing above the founder-configured threshold.",
  },
];

export function isKnownPtoNotifierId(id: string): boolean {
  return PTO_NOTIFIER_REGISTRY.some((n) => n.id === id);
}

export interface FounderPtoModeConfig {
  enabled: boolean;
  enrolledNotifiers: string[];
  snoozePolicy: SnoozePolicy;
  snoozeUntil: string | null;
  snoozeStartedAt: string | null;
  snoozeSuppressedCount: number;
  lastSnoozeSource: SnoozeSource | null;
  /**
   * Task #622 — `snoozeStartedAt` of the most recent PTO window for
   * which the "PTO ended — here's what you missed" recap email was
   * already sent. Used to dedup the recap so a single PTO window
   * triggers at most one summary email even if multiple ticks observe
   * the transition.
   */
  lastResumeRecapAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_FOUNDER_PTO_MODE_CONFIG: FounderPtoModeConfig = {
  enabled: false,
  enrolledNotifiers: PTO_NOTIFIER_REGISTRY.map((n) => n.id),
  snoozePolicy: { kind: "fixed" },
  snoozeUntil: null,
  snoozeStartedAt: null,
  snoozeSuppressedCount: 0,
  lastSnoozeSource: null,
  lastResumeRecapAt: null,
  updatedAt: null,
  updatedBy: null,
};

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

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
    return { kind: "weekday_mute", days, startHour, endHour };
  }
  return { kind: "fixed" };
}

function normalizeEnrolled(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => isKnownPtoNotifierId(s)),
    ),
  );
}

function parseStored(raw: string | null | undefined): FounderPtoModeConfig {
  if (!raw) return { ...DEFAULT_FOUNDER_PTO_MODE_CONFIG };
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") {
      return { ...DEFAULT_FOUNDER_PTO_MODE_CONFIG };
    }
    return {
      enabled: Boolean(p.enabled),
      enrolledNotifiers: normalizeEnrolled(p.enrolledNotifiers),
      snoozePolicy: parseSnoozePolicy(p.snoozePolicy),
      snoozeUntil:
        typeof p.snoozeUntil === "string" && !Number.isNaN(Date.parse(p.snoozeUntil))
          ? new Date(p.snoozeUntil).toISOString()
          : null,
      snoozeStartedAt:
        typeof p.snoozeStartedAt === "string" &&
        !Number.isNaN(Date.parse(p.snoozeStartedAt))
          ? new Date(p.snoozeStartedAt).toISOString()
          : null,
      snoozeSuppressedCount: clampInt(
        p.snoozeSuppressedCount,
        0,
        Number.MAX_SAFE_INTEGER,
        0,
      ),
      lastSnoozeSource:
        p.lastSnoozeSource === "manual" ||
        p.lastSnoozeSource === "auto" ||
        p.lastSnoozeSource === "weekday_window"
          ? p.lastSnoozeSource
          : null,
      lastResumeRecapAt:
        typeof p.lastResumeRecapAt === "string" &&
        !Number.isNaN(Date.parse(p.lastResumeRecapAt))
          ? new Date(p.lastResumeRecapAt).toISOString()
          : null,
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : null,
      updatedBy: typeof p.updatedBy === "string" ? p.updatedBy : null,
    };
  } catch {
    return { ...DEFAULT_FOUNDER_PTO_MODE_CONFIG };
  }
}

export async function getFounderPtoModeConfig(): Promise<FounderPtoModeConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, FOUNDER_PTO_MODE_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) {
      return { ...DEFAULT_FOUNDER_PTO_MODE_CONFIG };
    }
    return parseStored(rows[0].value);
  } catch (err) {
    console.error(
      "[founder-pto-mode] failed to load config:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_FOUNDER_PTO_MODE_CONFIG };
  }
}

async function persistConfig(
  next: FounderPtoModeConfig,
  updatedBy?: string | null,
): Promise<void> {
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: FOUNDER_PTO_MODE_SETTING_KEY,
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

export async function setFounderPtoEnrollment(input: {
  enabled: boolean;
  enrolledNotifiers: string[];
  updatedBy?: string | null;
}): Promise<FounderPtoModeConfig> {
  const current = await getFounderPtoModeConfig();
  const enrolled = normalizeEnrolled(input.enrolledNotifiers);
  const next: FounderPtoModeConfig = {
    ...current,
    enabled: Boolean(input.enabled),
    enrolledNotifiers: enrolled,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? current.updatedBy,
  };
  await persistConfig(next, input.updatedBy ?? current.updatedBy);
  return next;
}

export async function setFounderPtoSnooze(input: {
  snoozeUntil: string | null;
  snoozePolicy?: SnoozePolicy | null;
  updatedBy?: string | null;
  now?: Date;
}): Promise<FounderPtoModeConfig> {
  const current = await getFounderPtoModeConfig();
  const nextPolicy: SnoozePolicy =
    input.snoozePolicy === undefined
      ? current.snoozePolicy
      : input.snoozePolicy === null
        ? { kind: "fixed" }
        : parseSnoozePolicy(input.snoozePolicy);

  const nowDate = input.now ?? new Date();
  let snoozeUntil: string | null = null;
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
    if (nextPolicy.kind === "auto_extend") {
      snoozeUntil = new Date(parsed).toISOString();
    } else {
      const maxMs = nowMs + 90 * 24 * 60 * 60 * 1000;
      snoozeUntil = new Date(Math.min(parsed, maxMs)).toISOString();
    }
    lastSnoozeSource = "manual";
  } else {
    lastSnoozeSource = null;
  }

  // Task #622 — when the founder clears or replaces a snooze window that
  // had a non-zero suppressed counter, attempt to send the resume-recap
  // email synchronously so they don't lose the audit trail. Send
  // failures are caught + logged so a flaky email provider cannot
  // block the snooze update.
  const trigger: PtoResumeRecapTrigger | null = current.snoozeStartedAt
    ? snoozeUntil === null
      ? "manual_unsnooze"
      : "replaced"
    : null;
  if (trigger) {
    await attemptFounderPtoResumeRecap(current, nowDate, trigger).catch((err) => {
      console.error(
        "[founder-pto-mode] resume recap attempt failed:",
        (err as Error)?.message ?? err,
      );
      return null;
    });
  }

  const next: FounderPtoModeConfig = {
    ...current,
    snoozeUntil,
    snoozeStartedAt: snoozeUntil ? nowDate.toISOString() : null,
    snoozeSuppressedCount: 0,
    snoozePolicy: nextPolicy,
    lastSnoozeSource,
    // Setting/clearing/replacing a window resets the recap dedup pointer
    // so a brand-new window can recap when it ends.
    lastResumeRecapAt: null,
    updatedAt: nowDate.toISOString(),
    updatedBy: input.updatedBy ?? current.updatedBy,
  };
  await persistConfig(next, input.updatedBy ?? current.updatedBy);
  return next;
}

function isInWeekdayMuteWindow(
  policy: Extract<SnoozePolicy, { kind: "weekday_mute" }>,
  now: Date,
): { active: boolean; endsAt: Date | null } {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const s = policy.startHour;
  const e = policy.endHour;
  if (s < e) {
    if (policy.days.includes(day) && hour >= s && hour < e) {
      const endsAt = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), e, 0, 0),
      );
      return { active: true, endsAt };
    }
    return { active: false, endsAt: null };
  }
  if (policy.days.includes(day) && hour >= s) {
    const endsAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, e, 0, 0),
    );
    return { active: true, endsAt };
  }
  const prevDay = (day + 6) % 7;
  if (policy.days.includes(prevDay) && hour < e) {
    const endsAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), e, 0, 0),
    );
    return { active: true, endsAt };
  }
  return { active: false, endsAt: null };
}

export interface EvaluatedPtoSnooze {
  cfg: FounderPtoModeConfig;
  snoozed: boolean;
  source: SnoozeSource | null;
  effectiveUntil: string | null;
}

/**
 * Auto-extend / weekday-mute / fixed evaluation, mirroring
 * `evaluateAndMaybeAutoExtendSnooze` in the archive-deletion notifier.
 * Persists the auto-extension when fired so the next caller sees the
 * fresh `snoozeUntil`.
 */
export async function evaluateAndMaybeAutoExtendFounderPtoSnooze(
  cfg: FounderPtoModeConfig,
  now: Date,
): Promise<EvaluatedPtoSnooze> {
  if (!cfg.enabled) {
    return { cfg, snoozed: false, source: null, effectiveUntil: null };
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
      if (policy.kind === "auto_extend") {
        const newUntilMs =
          nowMs + Math.max(1, policy.extendDays) * 24 * 60 * 60 * 1000;
        const newUntil = new Date(newUntilMs).toISOString();
        const updated: FounderPtoModeConfig = {
          ...cfg,
          snoozeUntil: newUntil,
          lastSnoozeSource: "auto",
          updatedAt: new Date().toISOString(),
        };
        try {
          await persistConfig(updated, cfg.updatedBy);
        } catch (err) {
          console.error(
            "[founder-pto-mode] auto-extend persist failed:",
            (err as Error)?.message ?? err,
          );
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
 * Convenience used by each notifier from inside its "should I send?"
 * path. Returns `null` when PTO mode isn't muting this notifier right
 * now, or `{source, effectiveUntil}` when it is.
 */
export async function isNotifierMutedByPto(
  notifierId: string,
  now: Date = new Date(),
): Promise<{ source: SnoozeSource; effectiveUntil: string | null } | null> {
  const cfg = await getFounderPtoModeConfig();
  if (!cfg.enabled) return null;
  if (!cfg.enrolledNotifiers.includes(notifierId)) return null;
  const evaluated = await evaluateAndMaybeAutoExtendFounderPtoSnooze(cfg, now);
  if (!evaluated.snoozed) return null;
  return {
    source: evaluated.source ?? "manual",
    effectiveUntil: evaluated.effectiveUntil,
  };
}

/**
 * Task #621 — context for a single swallowed alert. Used both to bump
 * the dashboard counter and to write a row into
 * `founder_pto_suppression_log` so the founder can audit, after the
 * fact, *which* notifier was muted and what it was about.
 */
export interface FounderPtoSuppressionRecord {
  notifierId: string;
  source?: SnoozeSource | null;
  effectiveUntil?: string | Date | null;
  /** Short human-readable summary surfaced in the admin UI list. */
  summary?: string | null;
  /** Optional structured payload (file count, actor, ...). */
  payload?: Record<string, unknown> | null;
}

/**
 * Best-effort counter bump used by enrolled notifiers when they
 * actually swallowed an alert. Counter is reset on every snooze change
 * (set / clear / policy update) so the dashboard pill reflects only the
 * current window.
 *
 * Lazily seeds `snoozeStartedAt` when called inside a weekday-mute-only
 * window (which has no explicit `snoozeUntil`), so the resume-recap can
 * dedup against a stable window id.
 *
 * Task #621 — also persists a row to `founder_pto_suppression_log`
 * when a record is provided so the founder PTO page can show a history
 * of what was swallowed.
 */
export async function bumpFounderPtoSuppressedCount(
  record?: FounderPtoSuppressionRecord,
): Promise<void> {
  try {
    const cfg = await getFounderPtoModeConfig();
    const next: FounderPtoModeConfig = {
      ...cfg,
      snoozeSuppressedCount: cfg.snoozeSuppressedCount + 1,
      snoozeStartedAt: cfg.snoozeStartedAt ?? new Date().toISOString(),
    };
    await persistConfig(next, cfg.updatedBy);
  } catch (err) {
    console.error(
      "[founder-pto-mode] failed to bump suppressed counter:",
      (err as Error)?.message ?? err,
    );
  }
  if (record && record.notifierId) {
    try {
      let effectiveUntil: Date | null = null;
      if (record.effectiveUntil) {
        const d =
          record.effectiveUntil instanceof Date
            ? record.effectiveUntil
            : new Date(record.effectiveUntil);
        if (!Number.isNaN(d.getTime())) effectiveUntil = d;
      }
      await db.insert(founderPtoSuppressionLog).values({
        notifierId: record.notifierId,
        snoozeSource: record.source ?? null,
        effectiveUntil,
        summary: record.summary ?? null,
        payload: record.payload ?? null,
      });
    } catch (err) {
      console.error(
        "[founder-pto-mode] failed to persist suppression log row:",
        (err as Error)?.message ?? err,
      );
    }
  }
}

/* ---------------------------------------------------------------- */
/* Task #621 — persistent suppression log                            */
/* ---------------------------------------------------------------- */

export interface FounderPtoSuppressionLogEntry {
  id: string;
  notifierId: string;
  snoozeSource: SnoozeSource | null;
  effectiveUntil: string | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

export const FOUNDER_PTO_SUPPRESSION_LOG_MAX_LIMIT = 100;
export const FOUNDER_PTO_SUPPRESSION_LOG_DEFAULT_LIMIT = 20;

function rowToSuppressionEntry(
  r: typeof founderPtoSuppressionLog.$inferSelect,
): FounderPtoSuppressionLogEntry {
  return {
    id: r.id,
    notifierId: r.notifierId,
    snoozeSource:
      r.snoozeSource === "manual" ||
      r.snoozeSource === "auto" ||
      r.snoozeSource === "weekday_window"
        ? r.snoozeSource
        : null,
    effectiveUntil:
      r.effectiveUntil instanceof Date
        ? r.effectiveUntil.toISOString()
        : r.effectiveUntil
          ? new Date(r.effectiveUntil as any).toISOString()
          : null,
    summary: r.summary ?? null,
    payload: (r.payload as Record<string, unknown> | null) ?? null,
    occurredAt:
      r.occurredAt instanceof Date
        ? r.occurredAt.toISOString()
        : new Date(r.occurredAt as any).toISOString(),
  };
}

export async function getFounderPtoSuppressionLog(
  opts: { limit?: number; notifierId?: string | null } = {},
): Promise<FounderPtoSuppressionLogEntry[]> {
  const n = Math.max(
    1,
    Math.min(
      FOUNDER_PTO_SUPPRESSION_LOG_MAX_LIMIT,
      Math.floor(opts.limit ?? FOUNDER_PTO_SUPPRESSION_LOG_DEFAULT_LIMIT) ||
        FOUNDER_PTO_SUPPRESSION_LOG_DEFAULT_LIMIT,
    ),
  );
  const conds: SQL[] = [];
  const notifierId =
    typeof opts.notifierId === "string" ? opts.notifierId.trim() : "";
  if (notifierId) {
    conds.push(eq(founderPtoSuppressionLog.notifierId, notifierId));
  }
  try {
    const q = db.select().from(founderPtoSuppressionLog).$dynamic();
    if (conds.length === 1) q.where(conds[0]);
    else if (conds.length > 1) q.where(and(...conds));
    const rows = await q
      .orderBy(desc(founderPtoSuppressionLog.occurredAt))
      .limit(n);
    return rows.map(rowToSuppressionEntry);
  } catch (err) {
    console.error(
      "[founder-pto-mode] failed to read suppression log:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

/**
 * Task #621 — bounded retention sweep. Called by the audience
 * retention sweeper on the same daily cadence as the other audit
 * tables so the log can't grow without bound.
 */
export async function pruneFounderPtoSuppressionLogOlderThan(
  cutoff: Date,
): Promise<number> {
  const res: any = await db
    .delete(founderPtoSuppressionLog)
    .where(lt(founderPtoSuppressionLog.occurredAt, cutoff));
  return (res?.rowCount as number) ?? 0;
}

/* ---------------------------------------------------------------- */
/* Task #685 — per-notifier / per-source / per-day suppression chart */
/* ---------------------------------------------------------------- */

export const FOUNDER_PTO_SUPPRESSION_STATS_DEFAULT_DAYS = 30;
export const FOUNDER_PTO_SUPPRESSION_STATS_MAX_DAYS = 90;

export interface FounderPtoSuppressionStatBucket {
  /** YYYY-MM-DD (UTC) */
  day: string;
  notifierId: string;
  /** "manual" | "auto" | "weekday_window" | "unknown" */
  source: string;
  count: number;
}

export interface FounderPtoSuppressionStatsResult {
  windowDays: number;
  since: string;
  totalCount: number;
  buckets: FounderPtoSuppressionStatBucket[];
}

/**
 * Aggregates `founder_pto_suppression_log` rows over the last `days`
 * UTC days, grouped by (day, notifier_id, snooze_source). Returns an
 * empty result when the DB read fails so a flaky DB cannot break the
 * admin page.
 */
export async function getFounderPtoSuppressionStats(opts: {
  days?: number;
  notifierId?: string | null;
  now?: Date;
} = {}): Promise<FounderPtoSuppressionStatsResult> {
  const days = Math.max(
    1,
    Math.min(
      FOUNDER_PTO_SUPPRESSION_STATS_MAX_DAYS,
      Math.floor(opts.days ?? FOUNDER_PTO_SUPPRESSION_STATS_DEFAULT_DAYS) ||
        FOUNDER_PTO_SUPPRESSION_STATS_DEFAULT_DAYS,
    ),
  );
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const conds: SQL[] = [gte(founderPtoSuppressionLog.occurredAt, since)];
  const notifierId =
    typeof opts.notifierId === "string" ? opts.notifierId.trim() : "";
  if (notifierId) {
    conds.push(eq(founderPtoSuppressionLog.notifierId, notifierId));
  }
  try {
    const dayCol = sql<string>`to_char(date_trunc('day', ${founderPtoSuppressionLog.occurredAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    const countCol = sql<number>`count(*)::int`;
    const rows = await db
      .select({
        day: dayCol,
        notifierId: founderPtoSuppressionLog.notifierId,
        snoozeSource: founderPtoSuppressionLog.snoozeSource,
        count: countCol,
      })
      .from(founderPtoSuppressionLog)
      .where(conds.length === 1 ? conds[0] : and(...conds))
      .groupBy(dayCol, founderPtoSuppressionLog.notifierId, founderPtoSuppressionLog.snoozeSource)
      .orderBy(dayCol);
    let total = 0;
    const buckets: FounderPtoSuppressionStatBucket[] = rows.map((r) => {
      const c = Number(r.count) || 0;
      total += c;
      const src =
        r.snoozeSource === "manual" ||
        r.snoozeSource === "auto" ||
        r.snoozeSource === "weekday_window"
          ? r.snoozeSource
          : "unknown";
      return {
        day: String(r.day),
        notifierId: r.notifierId,
        source: src,
        count: c,
      };
    });
    return {
      windowDays: days,
      since: since.toISOString(),
      totalCount: total,
      buckets,
    };
  } catch (err) {
    console.error(
      "[founder-pto-mode] failed to read suppression stats:",
      (err as Error)?.message ?? err,
    );
    return {
      windowDays: days,
      since: since.toISOString(),
      totalCount: 0,
      buckets: [],
    };
  }
}

/**
 * Task #684 — bounded export for the founder UI's "Download CSV"
 * affordance. Returns every surviving suppression-log row (newest
 * first) up to {@link FOUNDER_PTO_SUPPRESSION_LOG_EXPORT_MAX} so the
 * founder can attach the history to a postmortem.
 */
export const FOUNDER_PTO_SUPPRESSION_LOG_EXPORT_MAX = 10000;

export async function getAllFounderPtoSuppressionLogForExport(
  opts: { notifierId?: string | null } = {},
): Promise<FounderPtoSuppressionLogEntry[]> {
  const notifierId =
    typeof opts.notifierId === "string" ? opts.notifierId.trim() : "";
  try {
    const q = db.select().from(founderPtoSuppressionLog).$dynamic();
    if (notifierId) {
      q.where(eq(founderPtoSuppressionLog.notifierId, notifierId));
    }
    const rows = await q
      .orderBy(desc(founderPtoSuppressionLog.occurredAt))
      .limit(FOUNDER_PTO_SUPPRESSION_LOG_EXPORT_MAX);
    return rows.map(rowToSuppressionEntry);
  } catch (err) {
    console.error(
      "[founder-pto-mode] failed to read suppression log for export:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

export interface ClearFounderPtoSuppressionLogResult {
  deletedCount: number;
  clearedBy: string | null;
  clearedAt: string;
}

/**
 * Task #684 — founder-triggered wipe of the PTO suppression-log table.
 * Returns the number of rows that were removed and emits a structured
 * `[founder-pto-mode][audit]` console line so the action shows up in
 * platform logs (the project has no formal admin-audit table). The
 * caller (route) is responsible for root-admin auth + CSRF; this
 * function is purely the persistence side.
 */
export async function clearFounderPtoSuppressionLog(input: {
  clearedBy?: string | null;
} = {}): Promise<ClearFounderPtoSuppressionLogResult> {
  const clearedBy = input.clearedBy ?? null;
  const clearedAt = new Date().toISOString();
  let deletedCount = 0;
  try {
    const res: any = await db.delete(founderPtoSuppressionLog);
    deletedCount = (res?.rowCount as number) ?? 0;
  } catch (err) {
    console.error(
      "[founder-pto-mode] failed to clear suppression log:",
      (err as Error)?.message ?? err,
    );
    throw err;
  }
  console.log(
    `[founder-pto-mode][audit] suppression_log_cleared by=${clearedBy ?? "unknown"} rows=${deletedCount} at=${clearedAt}`,
  );
  return { deletedCount, clearedBy, clearedAt };
}

export async function clearFounderPtoSuppressionLogForTests(): Promise<void> {
  try {
    await db.delete(founderPtoSuppressionLog);
  } catch {
    /* best-effort */
  }
}

/* ---------------------------------------------------------------- */
/* Task #622 — PTO resume recap                                      */
/* ---------------------------------------------------------------- */

export type PtoResumeRecapTrigger =
  | "manual_unsnooze"
  | "replaced"
  | "natural_expiry";

export type PtoResumeRecapReason =
  | "sent"
  | "disabled"
  | "no_recipients"
  | "no_snooze_window"
  | "no_counters"
  | "already_recapped"
  | "still_snoozed"
  | "send_failed";

export interface PtoResumeRecapResult {
  recapSent: boolean;
  reason: PtoResumeRecapReason;
  trigger: PtoResumeRecapTrigger | null;
  suppressedCount: number;
  enrolledNotifiers: string[];
  errorMessage: string | null;
}

/**
 * Resolves the recipient list for the PTO resume-recap email by
 * reusing the audience-archive-deletion-notifier's recipient list
 * (the task explicitly allows reusing the existing list to keep
 * configuration surface small).
 */
async function loadPtoResumeRecapRecipients(): Promise<string[]> {
  try {
    const c = await getAudienceArchiveDeletionNotifierConfig();
    return Array.isArray(c.recipients) ? c.recipients : [];
  } catch (err) {
    console.warn(
      "[founder-pto-mode] failed to load resume-recap recipients:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

/**
 * Attempt to send the resume-recap email for the snooze window
 * captured in `cfg`. Caller is responsible for persisting the
 * post-recap state (advancing `lastResumeRecapAt`, resetting counters);
 * this function only sends + reports.
 *
 * No-op cases (return without sending and with a non-"sent" reason):
 *   - PTO mode disabled
 *   - No `snoozeStartedAt` recorded
 *   - `snoozeSuppressedCount === 0` (nothing was suppressed)
 *   - No recipients configured on the archive-deletion notifier
 *   - Recap already sent for this window (`lastResumeRecapAt`
 *     matches `snoozeStartedAt`)
 */
export async function attemptFounderPtoResumeRecap(
  cfg: FounderPtoModeConfig,
  now: Date,
  trigger: PtoResumeRecapTrigger,
): Promise<PtoResumeRecapResult> {
  const base: PtoResumeRecapResult = {
    recapSent: false,
    reason: "disabled",
    trigger,
    suppressedCount: cfg.snoozeSuppressedCount,
    enrolledNotifiers: cfg.enrolledNotifiers,
    errorMessage: null,
  };
  if (!cfg.enabled) return base;
  if (!cfg.snoozeStartedAt) return { ...base, reason: "no_snooze_window" };
  if (cfg.snoozeSuppressedCount === 0) return { ...base, reason: "no_counters" };
  if (
    cfg.lastResumeRecapAt &&
    cfg.lastResumeRecapAt === cfg.snoozeStartedAt
  ) {
    return { ...base, reason: "already_recapped" };
  }
  const recipients = await loadPtoResumeRecapRecipients();
  if (recipients.length === 0) return { ...base, reason: "no_recipients" };
  const startedMs = Date.parse(cfg.snoozeStartedAt);
  const endedMs = now.getTime();
  const durationMs = Math.max(
    0,
    endedMs - (Number.isFinite(startedMs) ? startedMs : endedMs),
  );
  try {
    await emailService.sendFounderPtoResumeRecap(recipients, {
      suppressedCount: cfg.snoozeSuppressedCount,
      enrolledNotifiers: cfg.enrolledNotifiers,
      snoozeStartedAt: cfg.snoozeStartedAt,
      snoozeEndedAt: new Date(endedMs).toISOString(),
      durationMs,
      trigger,
      snoozePolicyKind: cfg.snoozePolicy?.kind ?? "fixed",
    });
    return { ...base, recapSent: true, reason: "sent" };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      "[founder-pto-mode] resume recap send failed:",
      msg,
    );
    return { ...base, reason: "send_failed", errorMessage: msg };
  }
}

/**
 * Called from the audience-retention sweeper tick. When the global
 * PTO snooze window has elapsed naturally (or the weekday-mute window
 * has ended) and one or more enrolled notifiers actually swallowed an
 * alert, sends the recap email and clears the window state. Dedup is
 * keyed off `snoozeStartedAt` via `lastResumeRecapAt`.
 *
 * Safe to call on every tick: returns `still_snoozed` /
 * `already_recapped` / `no_snooze_window` / `no_counters` without
 * sending in the common no-op cases.
 */
export async function runFounderPtoResumeRecapIfDue(opts: {
  now?: Date;
} = {}): Promise<PtoResumeRecapResult> {
  const now = opts.now ?? new Date();
  const cfg = await getFounderPtoModeConfig();
  if (!cfg.snoozeStartedAt) {
    return {
      recapSent: false,
      reason: "no_snooze_window",
      trigger: null,
      suppressedCount: 0,
      enrolledNotifiers: cfg.enrolledNotifiers,
      errorMessage: null,
    };
  }
  if (
    cfg.lastResumeRecapAt &&
    cfg.lastResumeRecapAt === cfg.snoozeStartedAt
  ) {
    return {
      recapSent: false,
      reason: "already_recapped",
      trigger: null,
      suppressedCount: cfg.snoozeSuppressedCount,
      enrolledNotifiers: cfg.enrolledNotifiers,
      errorMessage: null,
    };
  }
  const evald = await evaluateAndMaybeAutoExtendFounderPtoSnooze(cfg, now);
  if (evald.snoozed) {
    return {
      recapSent: false,
      reason: "still_snoozed",
      trigger: null,
      suppressedCount: evald.cfg.snoozeSuppressedCount,
      enrolledNotifiers: evald.cfg.enrolledNotifiers,
      errorMessage: null,
    };
  }
  const result = await attemptFounderPtoResumeRecap(
    evald.cfg,
    now,
    "natural_expiry",
  );
  // Advance dedup pointer + clear elapsed window state unless the send
  // failed (so the next tick retries). The window we just observed is
  // captured by `evald.cfg.snoozeStartedAt`.
  const shouldAdvance =
    result.recapSent ||
    result.reason === "no_counters" ||
    result.reason === "no_recipients" ||
    result.reason === "disabled";
  if (shouldAdvance) {
    const cleared: FounderPtoModeConfig = {
      ...evald.cfg,
      snoozeUntil: null,
      snoozeStartedAt: null,
      snoozeSuppressedCount: 0,
      lastResumeRecapAt: evald.cfg.snoozeStartedAt,
      lastSnoozeSource: null,
    };
    try {
      await persistConfig(cleared, evald.cfg.updatedBy);
    } catch (err) {
      console.error(
        "[founder-pto-mode] failed to clear recapped PTO window:",
        (err as Error)?.message ?? err,
      );
    }
  }
  return result;
}
