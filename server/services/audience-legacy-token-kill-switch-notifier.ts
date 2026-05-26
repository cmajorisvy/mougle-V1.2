/**
 * Audience legacy-token kill-switch notifier (Task #608).
 *
 * Sends a founder/security email the moment a root admin flips the
 * per-platform legacy-token env-fallback kill-switch via
 * `setEnvFallbackDisabledOverride` /
 * `setEnvFallbackDisabledOverridesBulk`. This is a security-critical
 * control: turning the env fallback OFF can instantly break every
 * connector still relying on the shared token, and turning it ON
 * re-opens a known attack surface. The passive audit log (Task #558)
 * already records who flipped what when, but this notifier surfaces
 * unauthorized or accidental flips in real time.
 *
 * Pattern mirrors `audience-audit-export-notifier`:
 *   - Config in `system_settings` under
 *     `audience_legacy_token_kill_switch_notifier`
 *     (enabled, recipients, suppressedActorIds, dedupWindowMs).
 *   - In-memory dedup keyed by `<platform>:<newValue>` — repeated
 *     identical flips on the same platform within the window collapse
 *     into one email and the next email reports
 *     "N similar flips suppressed since T". A genuinely different
 *     flip (new platform, new resolved value, new actor) bypasses
 *     dedup and fires immediately.
 *   - Disabled / no-recipients / actor-suppressed / send-failed never
 *     throw — a broken notifier can never block an actual kill-switch
 *     change.
 *   - Plaintext tokens are NEVER part of the bus event or the email.
 */

import { eq } from "drizzle-orm";

import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { emailService } from "./email-service";
import type {
  AudiencePlatform,
  AudienceLegacyTokenKillSwitchAuditRow,
} from "../../shared/omni-channel-audience-schema";
import type { LegacyTokenKillSwitchAuditValue } from "./audience-legacy-token-kill-switch-audit-service";

export const AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_SETTING_KEY =
  "audience_legacy_token_kill_switch_notifier";

export const DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_DEDUP_MS =
  5 * 60 * 1000;

export interface AudienceLegacyTokenKillSwitchNotifierConfig {
  enabled: boolean;
  recipients: string[];
  /**
   * Per-actor mute: actors whose IDs appear here are silently swallowed
   * (recorded in history with reason `actor_suppressed`). Use for
   * routine founder flips that should not page the founder themselves.
   */
  suppressedActorIds: string[];
  /**
   * Admin override for the dedup window. `null` means fall back to the
   * env / default. `0` disables dedup (every flip fires an email).
   */
  dedupWindowMs: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_CONFIG: AudienceLegacyTokenKillSwitchNotifierConfig =
  {
    enabled: false,
    recipients: [],
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

function clampDedupWindow(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}

function envDedupWindowMs(): number | null {
  const raw = process.env.AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_DEDUP_MS;
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function resolveLegacyTokenKillSwitchDedupWindowMs(
  cfg: AudienceLegacyTokenKillSwitchNotifierConfig,
): number {
  if (cfg.dedupWindowMs !== null && cfg.dedupWindowMs >= 0) {
    return cfg.dedupWindowMs;
  }
  const env = envDedupWindowMs();
  if (env !== null) return env;
  return DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_DEDUP_MS;
}

function parseStored(
  raw: string | null | undefined,
): AudienceLegacyTokenKillSwitchNotifierConfig {
  if (!raw) return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_CONFIG };
    }
    return {
      enabled: Boolean(parsed.enabled),
      recipients: Array.isArray(parsed.recipients)
        ? normalizeEmails(parsed.recipients)
        : [],
      suppressedActorIds: Array.isArray(parsed.suppressedActorIds)
        ? normalizeActorIds(parsed.suppressedActorIds)
        : [],
      dedupWindowMs: clampDedupWindow(parsed.dedupWindowMs ?? null),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
    };
  } catch {
    return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_CONFIG };
  }
}

export async function getAudienceLegacyTokenKillSwitchNotifierConfig(): Promise<AudienceLegacyTokenKillSwitchNotifierConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_SETTING_KEY,
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_CONFIG };
    }
    return parseStored(rows[0].value);
  } catch (err) {
    console.error(
      "[audience-legacy-token-kill-switch-notifier] failed to load config:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_CONFIG };
  }
}

export async function setAudienceLegacyTokenKillSwitchNotifierConfig(input: {
  enabled: boolean;
  recipients: string[];
  suppressedActorIds?: string[];
  dedupWindowMs?: number | null;
  updatedBy?: string | null;
}): Promise<AudienceLegacyTokenKillSwitchNotifierConfig> {
  const recipients = normalizeEmails(input.recipients);
  const suppressedActorIds = normalizeActorIds(input.suppressedActorIds ?? []);
  const dedupWindowMs = clampDedupWindow(
    input.dedupWindowMs === undefined ? null : input.dedupWindowMs,
  );
  if (input.enabled && recipients.length === 0) {
    throw new Error("at least one recipient is required when enabled");
  }
  const next: AudienceLegacyTokenKillSwitchNotifierConfig = {
    enabled: Boolean(input.enabled),
    recipients,
    suppressedActorIds,
    dedupWindowMs,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? null,
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_SETTING_KEY,
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

export type LegacyTokenKillSwitchNotifyReason =
  | "sent"
  | "disabled"
  | "no_recipients"
  | "actor_suppressed"
  | "deduplicated"
  | "send_failed";

export interface LegacyTokenKillSwitchFlipEvent {
  platform: AudiencePlatform;
  previousValue: LegacyTokenKillSwitchAuditValue;
  newValue: LegacyTokenKillSwitchAuditValue;
  updatedBy: string;
  batchId?: string | null;
  flippedAt: string;
}

export interface LegacyTokenKillSwitchNotifyResult {
  notified: boolean;
  reason: LegacyTokenKillSwitchNotifyReason;
  recipients: string[];
  event: LegacyTokenKillSwitchFlipEvent;
  errorMessage: string | null;
  suppressedCount?: number;
  suppressedSince?: string | null;
  dedupWindowMs?: number;
}

export interface LegacyTokenKillSwitchNotificationHistoryEntry
  extends LegacyTokenKillSwitchNotifyResult {
  id: string;
  isTest: boolean;
  occurredAt: string;
}

interface DedupState {
  lastSentAt: number;
  lastActorId: string;
  lastNewValue: LegacyTokenKillSwitchAuditValue;
  suppressedCount: number;
  suppressedSince: number | null;
}

const dedupState = new Map<string, DedupState>();

export function resetLegacyTokenKillSwitchNotifierDedupForTests(): void {
  dedupState.clear();
  historyRing.length = 0;
}

const HISTORY_MAX = 50;
const historyRing: LegacyTokenKillSwitchNotificationHistoryEntry[] = [];

function recordHistory(
  result: LegacyTokenKillSwitchNotifyResult,
  opts: { isTest?: boolean } = {},
): LegacyTokenKillSwitchNotificationHistoryEntry {
  const now = new Date();
  const entry: LegacyTokenKillSwitchNotificationHistoryEntry = {
    ...result,
    id: `ltks_${now.getTime().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`,
    isTest: Boolean(opts.isTest),
    occurredAt: now.toISOString(),
  };
  historyRing.unshift(entry);
  if (historyRing.length > HISTORY_MAX) {
    historyRing.length = HISTORY_MAX;
  }
  return entry;
}

export function getLegacyTokenKillSwitchNotificationHistory(
  limit = 20,
): LegacyTokenKillSwitchNotificationHistoryEntry[] {
  const n = Math.max(1, Math.min(HISTORY_MAX, Math.floor(limit) || 20));
  return historyRing.slice(0, n);
}

export async function handleLegacyTokenKillSwitchFlip(
  event: LegacyTokenKillSwitchFlipEvent,
  configLoader: () => Promise<AudienceLegacyTokenKillSwitchNotifierConfig> = getAudienceLegacyTokenKillSwitchNotifierConfig,
): Promise<LegacyTokenKillSwitchNotifyResult> {
  const cfg = await configLoader();
  const base = {
    recipients: cfg.recipients,
    event,
    errorMessage: null as string | null,
  };
  if (!cfg.enabled) {
    const r: LegacyTokenKillSwitchNotifyResult = {
      notified: false,
      reason: "disabled",
      ...base,
    };
    recordHistory(r);
    return r;
  }
  if (cfg.recipients.length === 0) {
    const r: LegacyTokenKillSwitchNotifyResult = {
      notified: false,
      reason: "no_recipients",
      ...base,
    };
    recordHistory(r);
    return r;
  }
  if (cfg.suppressedActorIds.includes(event.updatedBy)) {
    const r: LegacyTokenKillSwitchNotifyResult = {
      notified: false,
      reason: "actor_suppressed",
      ...base,
    };
    recordHistory(r);
    return r;
  }

  const window = resolveLegacyTokenKillSwitchDedupWindowMs(cfg);
  const now = Date.now();
  const dedupKey = `${event.platform}:${event.newValue}`;
  const prev = dedupState.get(dedupKey);
  let burstSuppressedCount = 0;
  let burstSuppressedSince: number | null = null;

  if (prev && window > 0) {
    const withinWindow = now - prev.lastSentAt < window;
    const sameActor = prev.lastActorId === event.updatedBy;
    if (withinWindow && sameActor) {
      prev.suppressedCount += 1;
      if (prev.suppressedSince === null) {
        prev.suppressedSince = prev.lastSentAt;
      }
      const r: LegacyTokenKillSwitchNotifyResult = {
        notified: false,
        reason: "deduplicated",
        ...base,
        suppressedCount: prev.suppressedCount,
        suppressedSince: new Date(prev.suppressedSince).toISOString(),
        dedupWindowMs: window,
      };
      recordHistory(r);
      return r;
    }
    burstSuppressedCount = prev.suppressedCount;
    burstSuppressedSince = prev.suppressedSince;
  }

  const suppressedSinceIso = burstSuppressedSince
    ? new Date(burstSuppressedSince).toISOString()
    : null;

  try {
    await emailService.sendAudienceLegacyTokenKillSwitchNotification(
      cfg.recipients,
      event,
      {
        suppressedCount: burstSuppressedCount,
        suppressedSince: suppressedSinceIso,
      },
    );
    dedupState.set(dedupKey, {
      lastSentAt: now,
      lastActorId: event.updatedBy,
      lastNewValue: event.newValue,
      suppressedCount: 0,
      suppressedSince: null,
    });
    const r: LegacyTokenKillSwitchNotifyResult = {
      notified: true,
      reason: "sent",
      ...base,
      suppressedCount: burstSuppressedCount,
      suppressedSince: suppressedSinceIso,
      dedupWindowMs: window,
    };
    recordHistory(r);
    return r;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      "[audience-legacy-token-kill-switch-notifier] email send failed:",
      msg,
    );
    const r: LegacyTokenKillSwitchNotifyResult = {
      notified: false,
      reason: "send_failed",
      ...base,
      errorMessage: msg,
      suppressedCount: burstSuppressedCount,
      suppressedSince: suppressedSinceIso,
      dedupWindowMs: window,
    };
    recordHistory(r);
    return r;
  }
}

/**
 * Called from `setEnvFallbackDisabledOverride` /
 * `setEnvFallbackDisabledOverridesBulk` after the audit row is written.
 * Fire-and-forget: the notifier never throws out of here so a broken
 * Resend connection cannot crash a kill-switch change.
 */
export function notifyLegacyTokenKillSwitchFlip(
  event: LegacyTokenKillSwitchFlipEvent,
): void {
  handleLegacyTokenKillSwitchFlip(event).catch((err) => {
    console.error(
      "[audience-legacy-token-kill-switch-notifier] handler error:",
      (err as Error)?.message ?? err,
    );
  });
}

export async function sendTestLegacyTokenKillSwitchNotification(opts: {
  triggeredBy?: string | null;
} = {}): Promise<{
  ok: boolean;
  recipients: string[];
  errorMessage: string | null;
  entry: LegacyTokenKillSwitchNotificationHistoryEntry;
}> {
  const cfg = await getAudienceLegacyTokenKillSwitchNotifierConfig();
  if (cfg.recipients.length === 0) {
    throw new Error("no_recipients_configured");
  }
  const event: LegacyTokenKillSwitchFlipEvent = {
    platform: "youtube",
    previousValue: "false",
    newValue: "true",
    updatedBy: opts.triggeredBy ?? "admin_test",
    batchId: null,
    flippedAt: new Date().toISOString(),
  };
  try {
    await emailService.sendAudienceLegacyTokenKillSwitchNotification(
      cfg.recipients,
      event,
      { isTest: true },
    );
    const result: LegacyTokenKillSwitchNotifyResult = {
      notified: true,
      reason: "sent",
      recipients: cfg.recipients,
      event,
      errorMessage: null,
    };
    const entry = recordHistory(result, { isTest: true });
    return { ok: true, recipients: cfg.recipients, errorMessage: null, entry };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const result: LegacyTokenKillSwitchNotifyResult = {
      notified: false,
      reason: "send_failed",
      recipients: cfg.recipients,
      event,
      errorMessage: msg,
    };
    const entry = recordHistory(result, { isTest: true });
    return { ok: false, recipients: cfg.recipients, errorMessage: msg, entry };
  }
}

/**
 * Convenience: convert a freshly-recorded audit row into a flip event.
 * The route layer can call this if it prefers to re-derive the event
 * from the audit row rather than the inputs.
 */
export function flipEventFromAuditRow(
  row: AudienceLegacyTokenKillSwitchAuditRow,
): LegacyTokenKillSwitchFlipEvent {
  const flippedAt =
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : new Date(row.updatedAt as any).toISOString();
  return {
    platform: row.platform as AudiencePlatform,
    previousValue: row.previousValue as LegacyTokenKillSwitchAuditValue,
    newValue: row.newValue as LegacyTokenKillSwitchAuditValue,
    updatedBy: row.updatedBy,
    batchId: row.batchId ?? null,
    flippedAt,
  };
}
