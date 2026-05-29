/**
 * Audience audit-trail export notifier (Task #396, dedup added in #425).
 *
 * Subscribes to the `audience.audit_exported` neural-newsroom bus event
 * and emails the founder (and any other configured recipients) the
 * moment someone pulls the audience audit trail. Configurable from the
 * admin UI under `/api/admin/newsroom/audience/export-notifier`.
 *
 * Hard rules:
 *   - Read-only with respect to the audit trail — the notifier never
 *     mutates audit rows. It only consumes the bus event.
 *   - Suppressed when the actor is the founder themselves (configured
 *     via `suppressedActorIds`) to avoid noise from routine founder
 *     pulls.
 *   - Optional `minRowCount` threshold: when > 0, only exports whose
 *     `totalRowCount >= minRowCount` are notified. Set to 0 to notify
 *     on every export.
 *   - Recipients are validated as RFC-shaped emails.
 *   - Send failures never throw out of the bus subscriber — they are
 *     logged so a broken Resend connection cannot crash the export
 *     route.
 *   - Dedup window (Task #425): repeated exports by the same actor with
 *     the same filters within the window are collapsed into one email.
 *     The next email that does fire reports "N similar exports
 *     suppressed since T" so nothing is silently dropped. A genuinely
 *     different export (new actor, new filters, or >=2x the previous
 *     row count) bypasses the dedup and fires immediately. Precedence:
 *     admin override (`dedupWindowMs` on the config) > env
 *     `AUDIENCE_AUDIT_EXPORT_DEDUP_MS` > default 5 minutes. Set to 0 to
 *     disable dedup entirely.
 */

import { and, desc, eq, gte, lt, lte, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { adminStaff, systemSettings } from "@shared/schema";
import { neuralNewsroomBus } from "./neural-newsroom-bus";
import { emailService } from "./email-service";
import {
  audienceAuditExportNotifications,
  audienceAuditExportNotifierConfigHistory,
  type AudienceAuditExportNotifierConfigHistoryRow,
  type AudienceAuditExportRecord,
} from "../../shared/omni-channel-audience-schema";
import {
  getAudienceRiskSignalRules,
  partitionRiskSignalsForEmail,
  type AudienceRiskSignalRules,
} from "./audience-risk-signal-rules-service";
import { resolveAdminIdentities } from "./admin-identity-resolver";

export const AUDIENCE_AUDIT_EXPORT_NOTIFIER_SETTING_KEY =
  "audience_audit_export_notifier";

/** Task #676 — `system_settings` key for the per-control opt-out toggle. */
export const AUDIENCE_AUDIT_EXPORT_NOTIFY_ON_WEAKENING_SETTING_KEY =
  "audience_audit_export_notify_on_weakening";

/** Task #676 — multiplier above which a loosening triggers a notify. */
export const AUDIT_EXPORT_WEAKENING_MULTIPLIER = 2;

export const DEFAULT_AUDIENCE_AUDIT_EXPORT_DEDUP_MS = 5 * 60 * 1000;
export const LARGE_ROW_COUNT_MULTIPLIER = 2;

export interface AudienceAuditExportNotifierConfig {
  enabled: boolean;
  recipients: string[];
  minRowCount: number;
  suppressedActorIds: string[];
  /**
   * Admin override for the dedup window. `null` means fall back to the
   * env / default. `0` disables dedup (every export fires an email).
   */
  dedupWindowMs: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_AUDIENCE_AUDIT_EXPORT_NOTIFIER_CONFIG: AudienceAuditExportNotifierConfig =
  {
    enabled: false,
    recipients: [],
    minRowCount: 0,
    suppressedActorIds: [],
    dedupWindowMs: null,
    updatedAt: null,
    updatedBy: null,
  };

function normalizeEmails(input: string[]): string[] {
  return Array.from(
    new Set(
      input
        .map((s) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
        .filter((s) => s.length > 0 && EMAIL_RE.test(s)),
    ),
  );
}

function normalizeActorIds(input: string[]): string[] {
  return Array.from(
    new Set(
      input
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0),
    ),
  );
}

function clampThreshold(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function clampDedupWindow(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}

function envDedupWindowMs(): number | null {
  const raw = process.env.AUDIENCE_AUDIT_EXPORT_DEDUP_MS;
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function resolveDedupWindowMs(
  cfg: AudienceAuditExportNotifierConfig,
): number {
  if (cfg.dedupWindowMs !== null && cfg.dedupWindowMs >= 0) {
    return cfg.dedupWindowMs;
  }
  const env = envDedupWindowMs();
  if (env !== null) return env;
  return DEFAULT_AUDIENCE_AUDIT_EXPORT_DEDUP_MS;
}

function parseStored(raw: string | null | undefined): AudienceAuditExportNotifierConfig {
  if (!raw) return { ...DEFAULT_AUDIENCE_AUDIT_EXPORT_NOTIFIER_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_AUDIENCE_AUDIT_EXPORT_NOTIFIER_CONFIG };
    }
    return {
      enabled: Boolean(parsed.enabled),
      recipients: Array.isArray(parsed.recipients)
        ? normalizeEmails(parsed.recipients)
        : [],
      minRowCount: clampThreshold(Number(parsed.minRowCount ?? 0)),
      suppressedActorIds: Array.isArray(parsed.suppressedActorIds)
        ? normalizeActorIds(parsed.suppressedActorIds)
        : [],
      dedupWindowMs: clampDedupWindow(parsed.dedupWindowMs ?? null),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
    };
  } catch {
    return { ...DEFAULT_AUDIENCE_AUDIT_EXPORT_NOTIFIER_CONFIG };
  }
}

export async function getAudienceAuditExportNotifierConfig(): Promise<AudienceAuditExportNotifierConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_AUDIT_EXPORT_NOTIFIER_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) {
      return { ...DEFAULT_AUDIENCE_AUDIT_EXPORT_NOTIFIER_CONFIG };
    }
    return parseStored(rows[0].value);
  } catch (err) {
    console.error(
      "[audience-audit-export-notifier] failed to load config:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_AUDIENCE_AUDIT_EXPORT_NOTIFIER_CONFIG };
  }
}

export async function setAudienceAuditExportNotifierConfig(input: {
  enabled: boolean;
  recipients: string[];
  minRowCount: number;
  suppressedActorIds?: string[];
  dedupWindowMs?: number | null;
  updatedBy?: string | null;
}): Promise<AudienceAuditExportNotifierConfig> {
  const recipients = normalizeEmails(input.recipients);
  const minRowCount = clampThreshold(input.minRowCount);
  const suppressedActorIds = normalizeActorIds(input.suppressedActorIds ?? []);
  const dedupWindowMs = clampDedupWindow(
    input.dedupWindowMs === undefined ? null : input.dedupWindowMs,
  );
  if (input.enabled && recipients.length === 0) {
    throw new Error("at least one recipient is required when enabled");
  }
  // Task #676 — snapshot the prior shape so we can detect a weakening
  // (notifier disabled, or minRowCount loosened 2x+) and notify root
  // admins.
  const priorConfig = await getAudienceAuditExportNotifierConfig();
  const occurredAt = new Date();
  const next: AudienceAuditExportNotifierConfig = {
    enabled: Boolean(input.enabled),
    recipients,
    minRowCount,
    suppressedActorIds,
    dedupWindowMs,
    updatedAt: occurredAt.toISOString(),
    updatedBy: input.updatedBy ?? null,
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_AUDIT_EXPORT_NOTIFIER_SETTING_KEY,
      value: stored,
      updatedBy: input.updatedBy ?? undefined,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: stored,
        updatedBy: input.updatedBy ?? undefined,
        updatedAt: occurredAt,
      },
    });
  // Task #728 — append a sanitized config-change row whenever the
  // effective config actually changed. Best-effort: history failures
  // never block the config save.
  try {
    await recordAuditExportNotifierConfigChange({
      previous: priorConfig,
      next,
      updatedBy: input.updatedBy ?? null,
      occurredAt,
    });
  } catch (err) {
    console.error(
      "[audience-audit-export-notifier] failed to append config history:",
      (err as Error)?.message ?? err,
    );
  }
  try {
    await maybeNotifyAuditExportWeakening({
      prior: {
        enabled: priorConfig.enabled,
        minRowCount: priorConfig.minRowCount,
      },
      next: { enabled: next.enabled, minRowCount: next.minRowCount },
      actor: input.updatedBy ?? "unknown",
    });
  } catch (err) {
    console.error(
      "[audience-audit-export-notifier] failed to send weakening notification:",
      (err as Error)?.message ?? err,
    );
  }
  return next;
}

/* --------------------------------------------------------------------- */
/* Task #728 — durable config-change audit trail                          */
/*                                                                         */
/* Every successful change to the audit-export notifier suppression /     */
/* dedup config is appended (sanitized) to                                 */
/* `audience_audit_export_notifier_config_history`. No-effective-change   */
/* saves are skipped so dashboard noise stays minimal. The previous /     */
/* new config snapshots only carry the operational fields already         */
/* exposed by the admin GET endpoint — there are no secrets, tokens,     */
/* or email bodies in this table. Pruned by the audience retention       */
/* sweep on the same audit-window cadence as the other history tables.   */
/* --------------------------------------------------------------------- */

export type AuditExportNotifierConfigChangeAction =
  | "updated"
  | "cleared"
  | "restored_default";

export interface AuditExportNotifierConfigSnapshot {
  enabled: boolean;
  recipientCount: number;
  recipients: string[];
  minRowCount: number;
  suppressedActorIdCount: number;
  suppressedActorIds: string[];
  dedupWindowMs: number | null;
}

export interface AuditExportNotifierConfigHistoryEntry {
  id: string;
  occurredAt: string;
  updatedBy: string | null;
  action: AuditExportNotifierConfigChangeAction;
  previousConfig: AuditExportNotifierConfigSnapshot | null;
  newConfig: AuditExportNotifierConfigSnapshot | null;
  changedFields: string[];
}

const CONFIG_HISTORY_MAX = 50;

const TRACKED_CONFIG_FIELDS = [
  "enabled",
  "recipients",
  "minRowCount",
  "suppressedActorIds",
  "dedupWindowMs",
] as const;

export type TrackedAuditExportNotifierConfigField =
  (typeof TRACKED_CONFIG_FIELDS)[number];

function sanitizeConfigSnapshot(
  cfg: AudienceAuditExportNotifierConfig,
): AuditExportNotifierConfigSnapshot {
  return {
    enabled: cfg.enabled,
    recipientCount: cfg.recipients.length,
    recipients: [...cfg.recipients],
    minRowCount: cfg.minRowCount,
    suppressedActorIdCount: cfg.suppressedActorIds.length,
    suppressedActorIds: [...cfg.suppressedActorIds],
    dedupWindowMs: cfg.dedupWindowMs,
  };
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function diffAuditExportNotifierConfig(
  previous: AudienceAuditExportNotifierConfig,
  next: AudienceAuditExportNotifierConfig,
): TrackedAuditExportNotifierConfigField[] {
  const changed: TrackedAuditExportNotifierConfigField[] = [];
  if (previous.enabled !== next.enabled) changed.push("enabled");
  if (!arraysEqual(previous.recipients, next.recipients))
    changed.push("recipients");
  if (previous.minRowCount !== next.minRowCount) changed.push("minRowCount");
  if (!arraysEqual(previous.suppressedActorIds, next.suppressedActorIds))
    changed.push("suppressedActorIds");
  if ((previous.dedupWindowMs ?? null) !== (next.dedupWindowMs ?? null))
    changed.push("dedupWindowMs");
  return changed;
}

function classifyConfigChange(
  next: AudienceAuditExportNotifierConfig,
  changed: TrackedAuditExportNotifierConfigField[],
): AuditExportNotifierConfigChangeAction {
  const def = DEFAULT_AUDIENCE_AUDIT_EXPORT_NOTIFIER_CONFIG;
  const matchesDefault =
    next.enabled === def.enabled &&
    next.recipients.length === 0 &&
    next.minRowCount === def.minRowCount &&
    next.suppressedActorIds.length === 0 &&
    (next.dedupWindowMs ?? null) === def.dedupWindowMs;
  if (matchesDefault) return "restored_default";
  if (changed.includes("enabled") && !next.enabled) return "cleared";
  return "updated";
}

export async function recordAuditExportNotifierConfigChange(input: {
  previous: AudienceAuditExportNotifierConfig;
  next: AudienceAuditExportNotifierConfig;
  updatedBy: string | null;
  occurredAt?: Date;
}): Promise<AuditExportNotifierConfigHistoryEntry | null> {
  const changed = diffAuditExportNotifierConfig(input.previous, input.next);
  if (changed.length === 0) return null;
  const occurredAt = input.occurredAt ?? new Date();
  const action = classifyConfigChange(input.next, changed);
  const previousSnap = sanitizeConfigSnapshot(input.previous);
  const nextSnap = sanitizeConfigSnapshot(input.next);
  const dedupKey = `audit-export-notifier-config:${occurredAt.toISOString()}:${randomUUID().slice(
    0,
    8,
  )}`;
  try {
    const inserted = await db
      .insert(audienceAuditExportNotifierConfigHistory)
      .values({
        occurredAt,
        updatedBy: input.updatedBy ?? undefined,
        action,
        previousConfig: previousSnap as unknown as object,
        newConfig: nextSnap as unknown as object,
        changedFields: changed as unknown as string[],
        dedupKey,
      })
      .returning();
    const row = inserted[0];
    return rowToConfigHistoryEntry(row);
  } catch (err) {
    console.error(
      "[audience-audit-export-notifier] failed to persist config history:",
      (err as Error)?.message ?? err,
    );
    return null;
  }
}

function rowToConfigHistoryEntry(
  row: AudienceAuditExportNotifierConfigHistoryRow,
): AuditExportNotifierConfigHistoryEntry {
  return {
    id: row.id,
    occurredAt: (row.occurredAt instanceof Date
      ? row.occurredAt
      : new Date(row.occurredAt as any)
    ).toISOString(),
    updatedBy: row.updatedBy ?? null,
    action: row.action as AuditExportNotifierConfigChangeAction,
    previousConfig:
      (row.previousConfig as AuditExportNotifierConfigSnapshot | null) ?? null,
    newConfig:
      (row.newConfig as AuditExportNotifierConfigSnapshot | null) ?? null,
    changedFields: Array.isArray(row.changedFields)
      ? (row.changedFields as string[])
      : [],
  };
}

export async function listAuditExportNotifierConfigHistory(
  limit = 10,
): Promise<AuditExportNotifierConfigHistoryEntry[]> {
  const bounded = Math.max(
    1,
    Math.min(CONFIG_HISTORY_MAX, Math.floor(limit) || 10),
  );
  try {
    const rows = await db
      .select()
      .from(audienceAuditExportNotifierConfigHistory)
      .orderBy(desc(audienceAuditExportNotifierConfigHistory.occurredAt))
      .limit(bounded);
    return rows.map(rowToConfigHistoryEntry);
  } catch (err) {
    console.error(
      "[audience-audit-export-notifier] failed to list config history:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

export async function pruneAuditExportNotifierConfigHistoryOlderThan(
  cutoff: Date,
): Promise<number> {
  const deleted = await db
    .delete(audienceAuditExportNotifierConfigHistory)
    .where(lt(audienceAuditExportNotifierConfigHistory.occurredAt, cutoff))
    .returning({ id: audienceAuditExportNotifierConfigHistory.id });
  return deleted.length;
}

export async function clearAuditExportNotifierConfigHistoryForTests(): Promise<void> {
  try {
    await db.delete(audienceAuditExportNotifierConfigHistory);
  } catch {
    /* best-effort test cleanup */
  }
}

/* --------------------------------------------------------------------- */
/* Task #676 — notify-on-weakening toggle + email                        */
/* --------------------------------------------------------------------- */

export async function isAuditExportNotifyOnWeakeningEnabled(): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_AUDIT_EXPORT_NOTIFY_ON_WEAKENING_SETTING_KEY,
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

export async function setAuditExportNotifyOnWeakeningEnabled(
  enabled: boolean,
  updatedBy?: string,
): Promise<{ enabled: boolean }> {
  const stored = enabled ? "true" : "false";
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_AUDIT_EXPORT_NOTIFY_ON_WEAKENING_SETTING_KEY,
      value: stored,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: stored, updatedBy, updatedAt: new Date() },
    });
  return { enabled };
}

export type AuditExportWeakeningReason =
  | "control_disabled"
  | "loosened_2x";

export interface AuditExportWeakeningEntry {
  field: "enabled" | "minRowCount";
  reason: AuditExportWeakeningReason;
  prior: number | boolean;
  next: number | boolean;
}

export function classifyAuditExportWeakening(
  prior: { enabled: boolean; minRowCount: number },
  next: { enabled: boolean; minRowCount: number },
): AuditExportWeakeningEntry[] {
  const out: AuditExportWeakeningEntry[] = [];
  if (prior.enabled && !next.enabled) {
    out.push({
      field: "enabled",
      reason: "control_disabled",
      prior: true,
      next: false,
    });
  }
  // For minRowCount, *higher* = fewer emails = weaker monitoring.
  // 0 means "notify on every export" (most strict), so 0 isn't a
  // weakening — only raising N by 2x+ matters here.
  if (
    prior.minRowCount > 0 &&
    next.minRowCount >= AUDIT_EXPORT_WEAKENING_MULTIPLIER * prior.minRowCount
  ) {
    out.push({
      field: "minRowCount",
      reason: "loosened_2x",
      prior: prior.minRowCount,
      next: next.minRowCount,
    });
  }
  return out;
}

async function maybeNotifyAuditExportWeakening(args: {
  prior: { enabled: boolean; minRowCount: number };
  next: { enabled: boolean; minRowCount: number };
  actor: string;
}): Promise<boolean> {
  const weakened = classifyAuditExportWeakening(args.prior, args.next);
  if (weakened.length === 0) return false;
  const enabled = await isAuditExportNotifyOnWeakeningEnabled();
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
    .map((w) =>
      w.reason === "control_disabled"
        ? "enabled: true → false (notifier OFF)"
        : `${w.field}: ${String(w.prior)} → ${String(w.next)} (loosened 2x+)`,
    )
    .join("\n");
  const worst: AuditExportWeakeningReason = weakened.some(
    (w) => w.reason === "control_disabled",
  )
    ? "control_disabled"
    : "loosened_2x";
  await emailService.sendSafetyThresholdWeakenedEmail(to, {
    controlLabel: "Audience audit-export notifier",
    controlKey: AUDIENCE_AUDIT_EXPORT_NOTIFIER_SETTING_KEY,
    actor: args.actor,
    reason: worst,
    detail,
    link: "/admin/omni-channel-audience#export-notifier",
    occurredAt: new Date().toISOString(),
  });
  return true;
}

export interface NotifyResult {
  notified: boolean;
  reason:
    | "sent"
    | "disabled"
    | "no_recipients"
    | "actor_suppressed"
    | "below_threshold"
    | "deduplicated"
    | "send_failed"
    | "history_format_skipped"
    | "pto_snoozed";
  recipients: string[];
  thresholdRowCount: number;
  exportId: string;
  /**
   * Set on `deduplicated` results and on `sent` results that follow a
   * dedup burst. Carries the running count of similar exports that were
   * collapsed into the next outgoing email.
   */
  suppressedCount?: number;
  /** ISO timestamp of the first suppression in the current burst. */
  suppressedSince?: string | null;
  /** Effective dedup window applied to this event (ms). */
  dedupWindowMs?: number;
}

interface ActorDedupState {
  lastSentAt: number;
  lastFilters: AudienceAuditExportRecord["filters"];
  lastRowCount: number;
  suppressedCount: number;
  suppressedSince: number | null;
}

const dedupState = new Map<string, ActorDedupState>();

function filtersEqual(
  a: AudienceAuditExportRecord["filters"],
  b: AudienceAuditExportRecord["filters"],
): boolean {
  return (
    (a.fromDate ?? null) === (b.fromDate ?? null) &&
    (a.toDate ?? null) === (b.toDate ?? null) &&
    (a.platform ?? null) === (b.platform ?? null) &&
    (a.productionId ?? null) === (b.productionId ?? null)
  );
}

export function resetAudienceAuditExportNotifierDedupForTests() {
  dedupState.clear();
}

export interface AuditExportNotificationHistoryEntry {
  id: string;
  exportId: string;
  actorId: string;
  actorType: string;
  actorRole: string | null;
  /**
   * Task #672 — human-readable identity for `actorId`, resolved by
   * joining the raw id against `admin_staff` (matched by id OR by
   * email/username so legacy session payloads still resolve). Null when
   * no match exists — UI falls back to the raw id.
   */
  actorDisplayName: string | null;
  actorEmail: string | null;
  format: AudienceAuditExportRecord["format"];
  totalRowCount: number;
  thresholdRowCount: number;
  thresholdExceeded: boolean;
  recipients: string[];
  notified: boolean;
  reason: NotifyResult["reason"];
  isTest: boolean;
  errorMessage: string | null;
  occurredAt: string;
}

const HISTORY_MAX = 50;

async function recordHistory(
  record: AudienceAuditExportRecord,
  result: NotifyResult,
  opts: { isTest?: boolean; errorMessage?: string | null } = {},
): Promise<AuditExportNotificationHistoryEntry> {
  const occurredAt = new Date();
  const entry: AuditExportNotificationHistoryEntry = {
    id: `notif_${occurredAt.getTime().toString(36)}_${randomUUID().slice(0, 8)}`,
    exportId: record.exportId,
    actorId: record.actorId,
    actorType: record.actorType,
    actorRole: record.actorRole,
    actorDisplayName: null,
    actorEmail: null,
    format: record.format,
    totalRowCount: record.rowCounts.total,
    thresholdRowCount: result.thresholdRowCount,
    thresholdExceeded:
      result.thresholdRowCount > 0 &&
      record.rowCounts.total >= result.thresholdRowCount,
    recipients: result.recipients,
    notified: result.notified,
    reason: result.reason,
    isTest: Boolean(opts.isTest),
    errorMessage: opts.errorMessage ?? null,
    occurredAt: occurredAt.toISOString(),
  };
  try {
    await db.insert(audienceAuditExportNotifications).values({
      notificationId: entry.id,
      exportId: entry.exportId,
      actorId: entry.actorId,
      actorType: entry.actorType,
      actorRole: entry.actorRole,
      format: entry.format,
      totalRowCount: Math.floor(entry.totalRowCount) || 0,
      thresholdRowCount: Math.floor(entry.thresholdRowCount) || 0,
      thresholdExceeded: entry.thresholdExceeded,
      recipients: entry.recipients,
      notified: entry.notified,
      reason: entry.reason,
      isTest: entry.isTest,
      errorMessage: entry.errorMessage,
      occurredAt,
    });
  } catch (err) {
    console.error(
      "[audience-audit-export-notifier] failed to persist history entry:",
      (err as Error)?.message ?? err,
    );
  }
  return entry;
}

export interface AuditExportNotificationHistoryFilters {
  actorId?: string | null;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
  reason?: NotifyResult["reason"] | null;
}

export const AUDIT_EXPORT_NOTIFICATION_REASONS: ReadonlyArray<NotifyResult["reason"]> = [
  "sent",
  "disabled",
  "no_recipients",
  "actor_suppressed",
  "below_threshold",
  "deduplicated",
  "send_failed",
  "history_format_skipped",
  "pto_snoozed",
];

function coerceFilterDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function getAuditExportNotificationHistory(
  limit = 20,
  filters: AuditExportNotificationHistoryFilters = {},
): Promise<AuditExportNotificationHistoryEntry[]> {
  const n = Math.max(1, Math.min(HISTORY_MAX, Math.floor(limit) || 20));
  const conds: SQL[] = [];
  const actorId =
    typeof filters.actorId === "string" ? filters.actorId.trim() : "";
  if (actorId) {
    conds.push(eq(audienceAuditExportNotifications.actorId, actorId));
  }
  const fromDate = coerceFilterDate(filters.fromDate ?? null);
  if (fromDate) {
    conds.push(gte(audienceAuditExportNotifications.occurredAt, fromDate));
  }
  const toDate = coerceFilterDate(filters.toDate ?? null);
  if (toDate) {
    conds.push(lte(audienceAuditExportNotifications.occurredAt, toDate));
  }
  if (
    filters.reason &&
    AUDIT_EXPORT_NOTIFICATION_REASONS.includes(filters.reason)
  ) {
    conds.push(eq(audienceAuditExportNotifications.reason, filters.reason));
  }
  try {
    const where =
      conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
    const q = db
      .select()
      .from(audienceAuditExportNotifications)
      .$dynamic();
    if (where) q.where(where);
    const rows = await q
      .orderBy(desc(audienceAuditExportNotifications.occurredAt))
      .limit(n);
    const identityById = await resolveAdminIdentities(
      rows.map((r) => r.actorId),
    );
    return rows.map((r) => {
      const ident = r.actorId ? identityById.get(r.actorId) ?? null : null;
      return {
        id: r.notificationId,
        exportId: r.exportId,
        actorId: r.actorId,
        actorType: r.actorType,
        actorRole: r.actorRole,
        actorDisplayName: ident?.displayName ?? null,
        actorEmail: ident?.email ?? null,
        format: r.format as AudienceAuditExportRecord["format"],
        totalRowCount: r.totalRowCount,
        thresholdRowCount: r.thresholdRowCount,
        thresholdExceeded: r.thresholdExceeded,
        recipients: r.recipients,
        notified: r.notified,
        reason: r.reason as NotifyResult["reason"],
        isTest: r.isTest,
        errorMessage: r.errorMessage,
        occurredAt: (r.occurredAt instanceof Date
          ? r.occurredAt
          : new Date(r.occurredAt as any)
        ).toISOString(),
      };
    });
  } catch (err) {
    console.error(
      "[audience-audit-export-notifier] failed to read history:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

export async function clearAuditExportNotificationHistory(): Promise<void> {
  try {
    await db.delete(audienceAuditExportNotifications);
  } catch (err) {
    console.error(
      "[audience-audit-export-notifier] failed to clear history:",
      (err as Error)?.message ?? err,
    );
  }
}

/**
 * Task #448: bounded retention sweep — delete every notification row
 * older than `cutoff`. Called from the audience retention sweeper on
 * the same daily cadence so the history table can never grow without
 * bound. Returns the number of rows pruned.
 */
export async function pruneAuditExportNotificationsOlderThan(
  cutoff: Date,
): Promise<number> {
  const res: any = await db
    .delete(audienceAuditExportNotifications)
    .where(lt(audienceAuditExportNotifications.occurredAt, cutoff));
  return (res?.rowCount as number) ?? 0;
}

export async function handleAuditExportEvent(
  record: AudienceAuditExportRecord,
  configLoader: () => Promise<AudienceAuditExportNotifierConfig> = getAudienceAuditExportNotifierConfig,
  rulesLoader: () => Promise<AudienceRiskSignalRules> = getAudienceRiskSignalRules,
): Promise<NotifyResult> {
  const cfg = await configLoader();
  const base = {
    recipients: cfg.recipients,
    thresholdRowCount: cfg.minRowCount,
    exportId: record.exportId,
  };
  if (record.format === "json-history" || record.format === "csv-history") {
    // History-format rows are produced by the scheduled history-email
    // sender (Task #432). They are themselves audit-trail rows for sends
    // of the audit-trail history and must NOT trigger this notifier, or
    // every scheduled history send would also fire a notifier email.
    const r: NotifyResult = { notified: false, reason: "history_format_skipped", ...base };
    recordHistory(record, r);
    return r;
  }
  if (!cfg.enabled) {
    const r: NotifyResult = { notified: false, reason: "disabled", ...base };
    await recordHistory(record, r);
    return r;
  }
  if (cfg.recipients.length === 0) {
    const r: NotifyResult = { notified: false, reason: "no_recipients", ...base };
    await recordHistory(record, r);
    return r;
  }
  if (cfg.suppressedActorIds.includes(record.actorId)) {
    const r: NotifyResult = { notified: false, reason: "actor_suppressed", ...base };
    await recordHistory(record, r);
    return r;
  }
  // Task #563 — central founder PTO mode acts as an OR-gate alongside
  // the per-notifier dedup/threshold settings. Lazy-imported to avoid
  // module DAG cycles.
  try {
    const { isNotifierMutedByPto, bumpFounderPtoSuppressedCount } = await import(
      "./founder-pto-mode-service"
    );
    const ptoSnooze = await isNotifierMutedByPto("audience_audit_export");
    if (ptoSnooze) {
      const r: NotifyResult = { notified: false, reason: "pto_snoozed", ...base };
      await recordHistory(record, r, {
        errorMessage: `pto_snoozed_until:${ptoSnooze.effectiveUntil ?? "open"}`,
      });
      // Task #621 — also write a row to the persistent PTO suppression
      // log so the founder can see *which* export was swallowed.
      await bumpFounderPtoSuppressedCount({
        notifierId: "audience_audit_export",
        source: ptoSnooze.source,
        effectiveUntil: ptoSnooze.effectiveUntil,
        summary: `Audit export by ${record.actorId} (${record.actorType}) — ${record.rowCounts.total} rows, ${record.format}`,
        payload: {
          exportId: record.exportId,
          actorId: record.actorId,
          actorType: record.actorType,
          actorRole: record.actorRole,
          format: record.format,
          totalRowCount: record.rowCounts.total,
        },
      });
      return r;
    }
  } catch (err) {
    console.error(
      "[audience-audit-export-notifier] PTO mode check failed:",
      (err as Error)?.message ?? err,
    );
  }
  // Task #428 — outliers always notify (bypass the below_threshold gate)
  // because by definition they exceed the rolling median by a large
  // multiple, regardless of the founder's static minRowCount knob.
  const isOutlier = Boolean(record.outlier?.isOutlier);
  const thresholdExceeded =
    cfg.minRowCount === 0 || record.rowCounts.total >= cfg.minRowCount;
  if (!thresholdExceeded && !isOutlier) {
    const r: NotifyResult = { notified: false, reason: "below_threshold", ...base };
    await recordHistory(record, r);
    return r;
  }

  const window = resolveDedupWindowMs(cfg);
  const now = Date.now();
  const prev = dedupState.get(record.actorId);
  let burstSuppressedCount = 0;
  let burstSuppressedSince: number | null = null;

  if (prev && window > 0) {
    const withinWindow = now - prev.lastSentAt < window;
    const sameFilters = filtersEqual(prev.lastFilters, record.filters);
    const largeJump =
      prev.lastRowCount > 0 &&
      record.rowCounts.total >= prev.lastRowCount * LARGE_ROW_COUNT_MULTIPLIER;
    if (withinWindow && sameFilters && !largeJump) {
      prev.suppressedCount += 1;
      if (prev.suppressedSince === null) {
        prev.suppressedSince = prev.lastSentAt;
      }
      const r: NotifyResult = {
        notified: false,
        reason: "deduplicated",
        ...base,
        suppressedCount: prev.suppressedCount,
        suppressedSince: new Date(prev.suppressedSince).toISOString(),
        dedupWindowMs: window,
      };
      await recordHistory(record, r);
      return r;
    }
    burstSuppressedCount = prev.suppressedCount;
    burstSuppressedSince = prev.suppressedSince;
  }

  const suppressedSinceIso = burstSuppressedSince
    ? new Date(burstSuppressedSince).toISOString()
    : null;

  // Task #459: hot-reload the founder-tunable risk-signal rules so muted
  // signals stay out of the email entirely and only loud signals appear in
  // the subject `[RISK: ...]` prefix. Persisted signals on the audit row
  // are untouched.
  const rules = await rulesLoader();
  const partition = partitionRiskSignalsForEmail(
    record.riskSignals ?? [],
    rules,
  );

  try {
    await emailService.sendAudienceAuditExportNotification(cfg.recipients, {
      exportId: record.exportId,
      actorId: record.actorId,
      actorType: record.actorType,
      actorRole: record.actorRole,
      format: record.format as "json" | "csv",
      filters: record.filters,
      rowCounts: record.rowCounts,
      riskSignals: partition.bodySignals,
      riskSubjectSignals: partition.subjectSignals,
      exportedAt: record.exportedAt,
      thresholdRowCount: cfg.minRowCount,
      thresholdExceeded: cfg.minRowCount > 0,
      suppressedCount: burstSuppressedCount,
      suppressedSince: suppressedSinceIso,
      outlier: record.outlier ?? null,
    });
    dedupState.set(record.actorId, {
      lastSentAt: now,
      lastFilters: { ...record.filters },
      lastRowCount: record.rowCounts.total,
      suppressedCount: 0,
      suppressedSince: null,
    });
    const r: NotifyResult = {
      notified: true,
      reason: "sent",
      ...base,
      suppressedCount: burstSuppressedCount,
      suppressedSince: suppressedSinceIso,
      dedupWindowMs: window,
    };
    await recordHistory(record, r);
    return r;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error("[audience-audit-export-notifier] email send failed:", msg);
    const r: NotifyResult = {
      notified: false,
      reason: "send_failed",
      ...base,
      suppressedCount: burstSuppressedCount,
      suppressedSince: suppressedSinceIso,
      dedupWindowMs: window,
    };
    await recordHistory(record, r, { errorMessage: msg });
    return r;
  }
}

export interface SendTestResult {
  ok: boolean;
  recipients: string[];
  errorMessage: string | null;
  entry: AuditExportNotificationHistoryEntry;
}

export async function sendTestAuditExportNotification(opts: {
  triggeredBy?: string | null;
} = {}): Promise<SendTestResult> {
  const cfg = await getAudienceAuditExportNotifierConfig();
  if (cfg.recipients.length === 0) {
    throw new Error("no_recipients_configured");
  }
  const record: AudienceAuditExportRecord = {
    exportId: `aud_exp_test_${Date.now().toString(36)}`,
    actorId: opts.triggeredBy ?? "admin_test",
    actorType: "root_admin",
    actorRole: "test_send",
    format: "json",
    filters: { fromDate: null, toDate: null, platform: null, productionId: null },
    rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0, total: 0 },
    riskSignals: [],
    exportedAt: new Date().toISOString(),
    outlier: {
      isOutlier: false,
      rollingMedian: 0,
      rollingP95: 0,
      threshold: 0,
      sampleSize: 0,
      multiplier: 0,
    },
  };
  const base = {
    recipients: cfg.recipients,
    thresholdRowCount: cfg.minRowCount,
    exportId: record.exportId,
  };
  try {
    await emailService.sendAudienceAuditExportNotification(cfg.recipients, {
      exportId: record.exportId,
      actorId: record.actorId,
      actorType: record.actorType,
      actorRole: record.actorRole,
      format: record.format as "json" | "csv",
      filters: record.filters,
      rowCounts: record.rowCounts,
      exportedAt: record.exportedAt,
      thresholdRowCount: cfg.minRowCount,
      thresholdExceeded: false,
      outlier: record.outlier ?? null,
    });
    const result: NotifyResult = { notified: true, reason: "sent", ...base };
    const entry = await recordHistory(record, result, { isTest: true });
    return { ok: true, recipients: cfg.recipients, errorMessage: null, entry };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error("[audience-audit-export-notifier] test send failed:", msg);
    const result: NotifyResult = { notified: false, reason: "send_failed", ...base };
    const entry = await recordHistory(record, result, { isTest: true, errorMessage: msg });
    return { ok: false, recipients: cfg.recipients, errorMessage: msg, entry };
  }
}

let installed = false;
let unsubscribes: Array<() => void> = [];

export function installAudienceAuditExportNotifier(): boolean {
  if (installed) return false;
  const seen = new Set<string>();
  const handle = (event: { payload: unknown }) => {
    const record = event.payload as AudienceAuditExportRecord;
    // The same export emits BOTH `audience.audit_exported` and (when
    // flagged) `audience.audit_export_outlier`. Dedupe by exportId so
    // an outlier only sends one email.
    if (seen.has(record.exportId)) return;
    seen.add(record.exportId);
    if (seen.size > 1024) {
      const first = seen.values().next().value;
      if (first) seen.delete(first);
    }
    handleAuditExportEvent(record).catch((err) =>
      console.error(
        "[audience-audit-export-notifier] handler error:",
        (err as Error)?.message ?? err,
      ),
    );
  };
  unsubscribes.push(
    neuralNewsroomBus.subscribe("audience.audit_exported", {
      id: "audience_audit_export_notifier",
      type: "admin",
      handler: handle,
    }),
  );
  unsubscribes.push(
    neuralNewsroomBus.subscribe("audience.audit_export_outlier", {
      id: "audience_audit_export_notifier_outlier",
      type: "admin",
      handler: handle,
    }),
  );
  installed = true;
  console.log("[audience-audit-export-notifier] installed");
  return true;
}

export function uninstallAudienceAuditExportNotifier(): void {
  for (const fn of unsubscribes) {
    try {
      fn();
    } catch {
      /* noop */
    }
  }
  unsubscribes = [];
  installed = false;
}
