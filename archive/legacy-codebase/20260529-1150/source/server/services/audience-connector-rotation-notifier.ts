/**
 * Audience Connector Token Rotation Notifier (Task #496, dedup added in #546).
 *
 * Subscribes to `audience.connector_secret_set` /
 * `audience.connector_secret_rotated` / `audience.connector_secret_deleted`
 * neural-newsroom bus events and emails the founder (plus any other
 * configured recipients) the moment a per-connector platform access
 * token is installed, rotated, or wiped. This is the compromise-response
 * channel: a stolen-key rotation should never go unnoticed because
 * nobody happened to be looking at the omni-channel audience UI.
 *
 * Hard rules:
 *   - Plaintext tokens are NEVER part of the bus event payload (the
 *     secrets service strips them before emitting) and the email body
 *     only carries the connector id, platform, action verb, who did it,
 *     when, and the new rotation count.
 *   - Disabled / no-recipients / send failures never throw out of the
 *     bus subscriber.
 *   - Recipients are validated as RFC-shaped emails and de-duplicated
 *     case-insensitively, matching the audit-export notifier.
 *   - Dedup window (Task #546): repeated set/rotate/delete events on the
 *     SAME connectorId with the SAME action within the configured window
 *     are collapsed into one email. The next email that does fire
 *     reports "N similar rotations suppressed since T" so nothing is
 *     silently dropped. A different action on the same connector
 *     (e.g. rotate after a sequence of rotates → delete) bypasses dedup
 *     and fires immediately. Precedence: admin override
 *     (`dedupWindowMs` on the config) > env
 *     `AUDIENCE_CONNECTOR_ROTATION_DEDUP_MS` > default 5 minutes. Set
 *     to 0 to disable dedup entirely.
 */

import { desc, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../db";
import { systemSettings } from "@shared/schema";
import {
  audienceConnectorRotationNotifications,
  audienceConnectorRotationDedupState,
} from "../../shared/omni-channel-audience-schema";
import { emailService } from "./email-service";
import { neuralNewsroomBus } from "./neural-newsroom-bus";
import type { AudienceConnectorSecretRotationEvent } from "./audience-connector-secrets-service";

export const AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_SETTING_KEY =
  "audience_connector_rotation_notifier";

export const DEFAULT_AUDIENCE_CONNECTOR_ROTATION_DEDUP_MS = 5 * 60 * 1000;

export interface AudienceConnectorRotationNotifierConfig {
  enabled: boolean;
  recipients: string[];
  /**
   * Optional per-action mute. Actions whose names appear here are
   * silently swallowed (recorded in history with reason
   * `action_suppressed`). Use to e.g. ignore noisy first-install events
   * while still alerting on rotate/delete.
   */
  suppressedActions: Array<"set" | "rotate" | "delete">;
  /**
   * Admin override for the dedup window. `null` means fall back to the
   * env / default. `0` disables dedup (every event fires an email).
   */
  dedupWindowMs: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ACTIONS = new Set(["set", "rotate", "delete"]);

export const DEFAULT_AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_CONFIG: AudienceConnectorRotationNotifierConfig =
  {
    enabled: false,
    recipients: [],
    suppressedActions: [],
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

function normalizeActions(
  input: unknown,
): Array<"set" | "rotate" | "delete"> {
  if (!Array.isArray(input)) return [];
  const out = new Set<"set" | "rotate" | "delete">();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const v = raw.trim().toLowerCase();
    if (VALID_ACTIONS.has(v)) out.add(v as "set" | "rotate" | "delete");
  }
  return Array.from(out);
}

function clampDedupWindow(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}

function envDedupWindowMs(): number | null {
  const raw = process.env.AUDIENCE_CONNECTOR_ROTATION_DEDUP_MS;
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function resolveConnectorRotationDedupWindowMs(
  cfg: AudienceConnectorRotationNotifierConfig,
): number {
  if (cfg.dedupWindowMs !== null && cfg.dedupWindowMs >= 0) {
    return cfg.dedupWindowMs;
  }
  const env = envDedupWindowMs();
  if (env !== null) return env;
  return DEFAULT_AUDIENCE_CONNECTOR_ROTATION_DEDUP_MS;
}

function parseStored(
  raw: string | null | undefined,
): AudienceConnectorRotationNotifierConfig {
  if (!raw) return { ...DEFAULT_AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_CONFIG };
    }
    return {
      enabled: Boolean(parsed.enabled),
      recipients: Array.isArray(parsed.recipients)
        ? normalizeEmails(parsed.recipients)
        : [],
      suppressedActions: normalizeActions(parsed.suppressedActions),
      dedupWindowMs: clampDedupWindow(parsed.dedupWindowMs ?? null),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
    };
  } catch {
    return { ...DEFAULT_AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_CONFIG };
  }
}

export async function getAudienceConnectorRotationNotifierConfig(): Promise<AudienceConnectorRotationNotifierConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) {
      return { ...DEFAULT_AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_CONFIG };
    }
    return parseStored(rows[0].value);
  } catch (err) {
    console.error(
      "[audience-connector-rotation-notifier] failed to load config:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_CONFIG };
  }
}

export async function setAudienceConnectorRotationNotifierConfig(input: {
  enabled: boolean;
  recipients: string[];
  suppressedActions?: Array<"set" | "rotate" | "delete">;
  dedupWindowMs?: number | null;
  updatedBy?: string | null;
}): Promise<AudienceConnectorRotationNotifierConfig> {
  const recipients = normalizeEmails(input.recipients);
  const suppressedActions = normalizeActions(input.suppressedActions ?? []);
  const dedupWindowMs = clampDedupWindow(
    input.dedupWindowMs === undefined ? null : input.dedupWindowMs,
  );
  if (input.enabled && recipients.length === 0) {
    throw new Error("at least one recipient is required when enabled");
  }
  const next: AudienceConnectorRotationNotifierConfig = {
    enabled: Boolean(input.enabled),
    recipients,
    suppressedActions,
    dedupWindowMs,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? null,
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_SETTING_KEY,
      value: stored,
      updatedBy: input.updatedBy ?? undefined,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: stored,
        updatedBy: input.updatedBy ?? undefined,
        updatedAt: new Date(),
      },
    });
  return next;
}

export type ConnectorRotationNotifyReason =
  | "sent"
  | "disabled"
  | "no_recipients"
  | "action_suppressed"
  | "deduplicated"
  | "pto_snoozed"
  | "send_failed";

export interface ConnectorRotationNotifyResult {
  notified: boolean;
  reason: ConnectorRotationNotifyReason;
  recipients: string[];
  event: AudienceConnectorSecretRotationEvent;
  errorMessage: string | null;
  /**
   * Set on `deduplicated` results and on `sent` results that follow a
   * dedup burst. Carries the running count of similar rotations that
   * were collapsed into the next outgoing email.
   */
  suppressedCount?: number;
  /** ISO timestamp of the first suppression in the current burst. */
  suppressedSince?: string | null;
  /** Effective dedup window applied to this event (ms). */
  dedupWindowMs?: number;
}

export interface ConnectorRotationNotificationHistoryEntry
  extends ConnectorRotationNotifyResult {
  id: string;
  isTest: boolean;
  occurredAt: string;
}

const HISTORY_MAX = 50;

interface ConnectorDedupState {
  lastSentAt: number;
  lastAction: "set" | "rotate" | "delete";
  suppressedCount: number;
  suppressedSince: number | null;
}

async function loadDedupState(
  connectorId: string,
): Promise<ConnectorDedupState | null> {
  try {
    const rows = await db
      .select()
      .from(audienceConnectorRotationDedupState)
      .where(eq(audienceConnectorRotationDedupState.connectorId, connectorId))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    const lastSentAt =
      r.lastSentAt instanceof Date
        ? r.lastSentAt.getTime()
        : new Date(r.lastSentAt as any).getTime();
    const suppressedSince = r.suppressedSince
      ? r.suppressedSince instanceof Date
        ? r.suppressedSince.getTime()
        : new Date(r.suppressedSince as any).getTime()
      : null;
    return {
      lastSentAt,
      lastAction: r.lastAction as ConnectorDedupState["lastAction"],
      suppressedCount: r.suppressedCount ?? 0,
      suppressedSince,
    };
  } catch (err) {
    console.error(
      "[audience-connector-rotation-notifier] failed to load dedup state:",
      (err as Error)?.message ?? err,
    );
    return null;
  }
}

async function saveDedupState(
  connectorId: string,
  state: ConnectorDedupState,
): Promise<void> {
  try {
    await db
      .insert(audienceConnectorRotationDedupState)
      .values({
        connectorId,
        lastSentAt: new Date(state.lastSentAt),
        lastAction: state.lastAction,
        suppressedCount: state.suppressedCount,
        suppressedSince: state.suppressedSince
          ? new Date(state.suppressedSince)
          : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: audienceConnectorRotationDedupState.connectorId,
        set: {
          lastSentAt: new Date(state.lastSentAt),
          lastAction: state.lastAction,
          suppressedCount: state.suppressedCount,
          suppressedSince: state.suppressedSince
            ? new Date(state.suppressedSince)
            : null,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error(
      "[audience-connector-rotation-notifier] failed to persist dedup state:",
      (err as Error)?.message ?? err,
    );
  }
}

export async function resetAudienceConnectorRotationNotifierDedupForTests(): Promise<void> {
  try {
    await db.delete(audienceConnectorRotationDedupState);
  } catch (err) {
    console.error(
      "[audience-connector-rotation-notifier] failed to clear dedup state:",
      (err as Error)?.message ?? err,
    );
  }
}

async function recordHistory(
  result: ConnectorRotationNotifyResult,
  opts: { isTest?: boolean } = {},
): Promise<ConnectorRotationNotificationHistoryEntry> {
  const occurredAt = new Date();
  const entry: ConnectorRotationNotificationHistoryEntry = {
    ...result,
    id: `crn_${occurredAt.getTime().toString(36)}_${randomUUID().slice(0, 8)}`,
    isTest: Boolean(opts.isTest),
    occurredAt: occurredAt.toISOString(),
  };
  try {
    await db.insert(audienceConnectorRotationNotifications).values({
      notificationId: entry.id,
      connectorId: result.event.connectorId,
      platform: result.event.platform,
      action: result.event.action,
      rotatedBy: result.event.rotatedBy ?? null,
      rotationCount: Math.floor(result.event.rotationCount) || 0,
      keyVersion: Math.floor(result.event.keyVersion) || 1,
      event: result.event as unknown as Record<string, unknown>,
      recipients: result.recipients,
      notified: result.notified,
      reason: result.reason,
      isTest: entry.isTest,
      errorMessage: result.errorMessage,
      occurredAt,
    });
  } catch (err) {
    console.error(
      "[audience-connector-rotation-notifier] failed to persist history entry:",
      (err as Error)?.message ?? err,
    );
  }
  return entry;
}

export async function getConnectorRotationNotificationHistory(
  limit = 20,
): Promise<ConnectorRotationNotificationHistoryEntry[]> {
  const n = Math.max(1, Math.min(HISTORY_MAX, Math.floor(limit) || 20));
  try {
    const rows = await db
      .select()
      .from(audienceConnectorRotationNotifications)
      .orderBy(desc(audienceConnectorRotationNotifications.occurredAt))
      .limit(n);
    return rows.map((r) => ({
      id: r.notificationId,
      notified: r.notified,
      reason: r.reason as ConnectorRotationNotifyReason,
      recipients: r.recipients,
      event: (r.event as unknown as AudienceConnectorSecretRotationEvent) ?? {
        connectorId: r.connectorId,
        platform: r.platform as AudienceConnectorSecretRotationEvent["platform"],
        action: r.action as AudienceConnectorSecretRotationEvent["action"],
        rotatedBy: r.rotatedBy,
        rotatedAt: (r.occurredAt instanceof Date
          ? r.occurredAt
          : new Date(r.occurredAt as any)
        ).toISOString(),
        rotationCount: r.rotationCount,
        keyVersion: r.keyVersion,
      },
      errorMessage: r.errorMessage,
      isTest: r.isTest,
      occurredAt: (r.occurredAt instanceof Date
        ? r.occurredAt
        : new Date(r.occurredAt as any)
      ).toISOString(),
    }));
  } catch (err) {
    console.error(
      "[audience-connector-rotation-notifier] failed to read history:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

export async function clearConnectorRotationNotificationHistoryForTests(): Promise<void> {
  try {
    await db.delete(audienceConnectorRotationNotifications);
  } catch (err) {
    console.error(
      "[audience-connector-rotation-notifier] failed to clear history:",
      (err as Error)?.message ?? err,
    );
  }
  await resetAudienceConnectorRotationNotifierDedupForTests();
}

/**
 * Task #545: bounded retention sweep — delete every notification row
 * older than `cutoff`. Called from the audience retention sweeper on
 * the same daily cadence so the history table can never grow without
 * bound. Returns the number of rows pruned.
 */
export async function pruneConnectorRotationNotificationsOlderThan(
  cutoff: Date,
): Promise<number> {
  const res: any = await db
    .delete(audienceConnectorRotationNotifications)
    .where(lt(audienceConnectorRotationNotifications.occurredAt, cutoff));
  return (res?.rowCount as number) ?? 0;
}

export async function handleConnectorRotationEvent(
  event: AudienceConnectorSecretRotationEvent,
  configLoader: () => Promise<AudienceConnectorRotationNotifierConfig> = getAudienceConnectorRotationNotifierConfig,
): Promise<ConnectorRotationNotifyResult> {
  const cfg = await configLoader();
  const base = { recipients: cfg.recipients, event, errorMessage: null };
  if (!cfg.enabled) {
    const r: ConnectorRotationNotifyResult = {
      notified: false,
      reason: "disabled",
      ...base,
    };
    await recordHistory(r);
    return r;
  }
  if (cfg.recipients.length === 0) {
    const r: ConnectorRotationNotifyResult = {
      notified: false,
      reason: "no_recipients",
      ...base,
    };
    await recordHistory(r);
    return r;
  }
  if (cfg.suppressedActions.includes(event.action)) {
    const r: ConnectorRotationNotifyResult = {
      notified: false,
      reason: "action_suppressed",
      ...base,
    };
    await recordHistory(r);
    return r;
  }

  // Task #620 — central founder PTO mode swallows the email without
  // touching per-connector dedup state, so the next post-PTO event
  // still reports the burst-suppressed count accurately.
  try {
    const { isNotifierMutedByPto, bumpFounderPtoSuppressedCount } =
      await import("./founder-pto-mode-service");
    const ptoSnooze = await isNotifierMutedByPto("audience_connector_rotation");
    if (ptoSnooze) {
      const r: ConnectorRotationNotifyResult = {
        notified: false,
        reason: "pto_snoozed",
        ...base,
        errorMessage: `pto_snoozed_until:${ptoSnooze.effectiveUntil ?? "open"}`,
      };
      await recordHistory(r);
      await bumpFounderPtoSuppressedCount();
      return r;
    }
  } catch (err) {
    console.error(
      "[audience-connector-rotation-notifier] PTO mode check failed:",
      (err as Error)?.message ?? err,
    );
  }

  const window = resolveConnectorRotationDedupWindowMs(cfg);
  const now = Date.now();
  const prev = await loadDedupState(event.connectorId);
  let burstSuppressedCount = 0;
  let burstSuppressedSince: number | null = null;

  if (prev && window > 0) {
    const withinWindow = now - prev.lastSentAt < window;
    const sameAction = prev.lastAction === event.action;
    if (withinWindow && sameAction) {
      const nextSuppressedCount = prev.suppressedCount + 1;
      const nextSuppressedSince =
        prev.suppressedSince === null ? prev.lastSentAt : prev.suppressedSince;
      await saveDedupState(event.connectorId, {
        lastSentAt: prev.lastSentAt,
        lastAction: prev.lastAction,
        suppressedCount: nextSuppressedCount,
        suppressedSince: nextSuppressedSince,
      });
      const r: ConnectorRotationNotifyResult = {
        notified: false,
        reason: "deduplicated",
        ...base,
        suppressedCount: nextSuppressedCount,
        suppressedSince: new Date(nextSuppressedSince).toISOString(),
        dedupWindowMs: window,
      };
      await recordHistory(r);
      return r;
    }
    burstSuppressedCount = prev.suppressedCount;
    burstSuppressedSince = prev.suppressedSince;
  }

  const suppressedSinceIso = burstSuppressedSince
    ? new Date(burstSuppressedSince).toISOString()
    : null;

  try {
    await emailService.sendAudienceConnectorRotationNotification(
      cfg.recipients,
      event,
      {
        suppressedCount: burstSuppressedCount,
        suppressedSince: suppressedSinceIso,
      },
    );
    await saveDedupState(event.connectorId, {
      lastSentAt: now,
      lastAction: event.action,
      suppressedCount: 0,
      suppressedSince: null,
    });
    const r: ConnectorRotationNotifyResult = {
      notified: true,
      reason: "sent",
      ...base,
      suppressedCount: burstSuppressedCount,
      suppressedSince: suppressedSinceIso,
      dedupWindowMs: window,
    };
    await recordHistory(r);
    return r;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      "[audience-connector-rotation-notifier] email send failed:",
      msg,
    );
    const r: ConnectorRotationNotifyResult = {
      notified: false,
      reason: "send_failed",
      ...base,
      errorMessage: msg,
      suppressedCount: burstSuppressedCount,
      suppressedSince: suppressedSinceIso,
      dedupWindowMs: window,
    };
    await recordHistory(r);
    return r;
  }
}

export async function sendTestConnectorRotationNotification(opts: {
  triggeredBy?: string | null;
} = {}): Promise<{
  ok: boolean;
  recipients: string[];
  errorMessage: string | null;
  entry: ConnectorRotationNotificationHistoryEntry;
}> {
  const cfg = await getAudienceConnectorRotationNotifierConfig();
  if (cfg.recipients.length === 0) {
    throw new Error("no_recipients_configured");
  }
  const event: AudienceConnectorSecretRotationEvent = {
    connectorId: "test_connector_id",
    platform: "youtube",
    action: "rotate",
    rotatedBy: opts.triggeredBy ?? "admin_test",
    rotatedAt: new Date().toISOString(),
    rotationCount: 1,
    keyVersion: 1,
  };
  try {
    await emailService.sendAudienceConnectorRotationNotification(
      cfg.recipients,
      event,
      { isTest: true },
    );
    const result: ConnectorRotationNotifyResult = {
      notified: true,
      reason: "sent",
      recipients: cfg.recipients,
      event,
      errorMessage: null,
    };
    const entry = await recordHistory(result, { isTest: true });
    return { ok: true, recipients: cfg.recipients, errorMessage: null, entry };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const result: ConnectorRotationNotifyResult = {
      notified: false,
      reason: "send_failed",
      recipients: cfg.recipients,
      event,
      errorMessage: msg,
    };
    const entry = await recordHistory(result, { isTest: true });
    return { ok: false, recipients: cfg.recipients, errorMessage: msg, entry };
  }
}

let installed = false;
let unsubscribes: Array<() => void> = [];

export function installAudienceConnectorRotationNotifier(): boolean {
  if (installed) return false;
  const handle = (e: { payload: unknown }) => {
    const event = e.payload as AudienceConnectorSecretRotationEvent;
    handleConnectorRotationEvent(event).catch((err) =>
      console.error(
        "[audience-connector-rotation-notifier] handler error:",
        (err as Error)?.message ?? err,
      ),
    );
  };
  for (const name of [
    "audience.connector_secret_set",
    "audience.connector_secret_rotated",
    "audience.connector_secret_deleted",
  ] as const) {
    unsubscribes.push(
      neuralNewsroomBus.subscribe(name, {
        id: `audience_connector_rotation_notifier_${name}`,
        type: "admin",
        handler: handle,
      }),
    );
  }
  installed = true;
  console.log("[audience-connector-rotation-notifier] installed");
  return true;
}

export function uninstallAudienceConnectorRotationNotifier(): void {
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

// Re-exported for the admin dashboard `Last updated` chip and history feed.
export type { AudienceConnectorSecretRotationEvent };
