/**
 * Audience Legacy-Token Dispatch Alert (Task #500).
 *
 * Task #462 exposed which connectors are still relying on the shared
 * `AUDIENCE_GATEWAY_<PLATFORM>_TOKEN` env fallback, but the founder has
 * to open the admin dashboard to see it. This service makes that
 * proactive: every time an approved `official_api` connector
 * SUCCESSFULLY dispatches a moderation command via the legacy env-token
 * path, the founder gets a single dedup'd email telling them which
 * connector + platform fired and suggesting they install a per-connector
 * encrypted secret before flipping `AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_<P>`.
 *
 * Hard rules (mirroring `audience-audit-export-notifier`):
 *   - Subscribes to `audience.gateway_send_dispatched`. Only fires when
 *     the bus payload carries `tokenSource === "legacy_env_fallback"`
 *     AND `apiAccessMode === "official_api"` AND
 *     `platformSendApproved === true`. Other events are ignored.
 *   - Dedup is keyed on `connectorId`: within the dedup window
 *     (default 24h, configurable) a single alert per connector. A new
 *     connector still on the legacy fallback fires immediately.
 *   - Recipients are validated as RFC-shaped emails. Disabled / empty
 *     recipients always skip (still logged in history).
 *   - Send failures NEVER throw out of the bus subscriber — they are
 *     logged so a broken Resend connection cannot crash the gateway.
 *   - NEVER touches token material. The payload only carries the
 *     connector display name, platform, and access-mode flag — all of
 *     which are already public to root admins via the legacy-token
 *     status route.
 */

import { desc, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { audienceLegacyTokenDispatchAlerts } from "../../shared/omni-channel-audience-schema";
import { neuralNewsroomBus } from "./neural-newsroom-bus";
import { emailService } from "./email-service";

export const AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_SETTING_KEY =
  "audience_legacy_token_dispatch_alert";

export const DEFAULT_LEGACY_TOKEN_DISPATCH_DEDUP_MS = 24 * 60 * 60 * 1000;
const MAX_DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface AudienceLegacyTokenDispatchAlertConfig {
  enabled: boolean;
  recipients: string[];
  /** `null` falls back to env or default. `0` disables dedup entirely. */
  dedupWindowMs: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_CONFIG: AudienceLegacyTokenDispatchAlertConfig =
  {
    enabled: false,
    recipients: [],
    dedupWindowMs: null,
    updatedAt: null,
    updatedBy: null,
  };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmails(input: string[]): string[] {
  return Array.from(
    new Set(
      input
        .map((s) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
        .filter((s) => s.length > 0 && EMAIL_RE.test(s)),
    ),
  );
}

function clampDedupWindow(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.min(MAX_DEDUP_WINDOW_MS, Math.floor(v));
}

function envDedupWindowMs(): number | null {
  const raw = process.env.AUDIENCE_LEGACY_TOKEN_DISPATCH_DEDUP_MS;
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(MAX_DEDUP_WINDOW_MS, Math.floor(n));
}

export function resolveLegacyTokenDispatchDedupWindowMs(
  cfg: AudienceLegacyTokenDispatchAlertConfig,
): number {
  if (cfg.dedupWindowMs !== null && cfg.dedupWindowMs >= 0) {
    return cfg.dedupWindowMs;
  }
  const env = envDedupWindowMs();
  if (env !== null) return env;
  return DEFAULT_LEGACY_TOKEN_DISPATCH_DEDUP_MS;
}

function parseStored(
  raw: string | null | undefined,
): AudienceLegacyTokenDispatchAlertConfig {
  if (!raw) return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_CONFIG };
    }
    return {
      enabled: Boolean(parsed.enabled),
      recipients: Array.isArray(parsed.recipients)
        ? normalizeEmails(parsed.recipients)
        : [],
      dedupWindowMs: clampDedupWindow(parsed.dedupWindowMs ?? null),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
    };
  } catch {
    return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_CONFIG };
  }
}

export async function getAudienceLegacyTokenDispatchAlertConfig(): Promise<AudienceLegacyTokenDispatchAlertConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_SETTING_KEY,
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_CONFIG };
    }
    return parseStored(rows[0].value);
  } catch (err) {
    console.error(
      "[audience-legacy-token-dispatch-alert] failed to load config:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_CONFIG };
  }
}

export async function setAudienceLegacyTokenDispatchAlertConfig(input: {
  enabled: boolean;
  recipients: string[];
  dedupWindowMs?: number | null;
  updatedBy?: string | null;
}): Promise<AudienceLegacyTokenDispatchAlertConfig> {
  const recipients = normalizeEmails(input.recipients);
  const dedupWindowMs = clampDedupWindow(
    input.dedupWindowMs === undefined ? null : input.dedupWindowMs,
  );
  if (input.enabled && recipients.length === 0) {
    throw new Error("at least one recipient is required when enabled");
  }
  const next: AudienceLegacyTokenDispatchAlertConfig = {
    enabled: Boolean(input.enabled),
    recipients,
    dedupWindowMs,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? null,
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_SETTING_KEY,
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

export interface LegacyTokenDispatchEventPayload {
  commandId?: string | null;
  connectorId?: string | null;
  platform?: string | null;
  requestedAction?: string | null;
  tokenSource?: "per_connector_secret" | "legacy_env_fallback" | null;
  connectorDisplayName?: string | null;
  apiAccessMode?: string | null;
  platformSendApproved?: boolean | null;
}

export type AlertReason =
  | "sent"
  | "disabled"
  | "no_recipients"
  | "not_legacy_fallback"
  | "not_official_api"
  | "not_approved"
  | "missing_connector"
  | "deduplicated"
  | "send_failed";

export interface AlertResult {
  notified: boolean;
  reason: AlertReason;
  recipients: string[];
  connectorId: string | null;
  platform: string | null;
  dedupWindowMs: number;
}

interface ConnectorDedupState {
  lastSentAt: number;
  suppressedCount: number;
  suppressedSince: number | null;
}

const dedupState = new Map<string, ConnectorDedupState>();

export function resetAudienceLegacyTokenDispatchAlertDedupForTests() {
  dedupState.clear();
}

async function recordHistory(
  payload: LegacyTokenDispatchEventPayload,
  result: AlertResult,
  errorMessage: string | null = null,
): Promise<void> {
  const occurredAt = new Date();
  try {
    await db.insert(audienceLegacyTokenDispatchAlerts).values({
      alertId: `lta_${occurredAt.getTime().toString(36)}_${randomUUID().slice(0, 8)}`,
      connectorId: payload.connectorId ?? null,
      connectorDisplayName: payload.connectorDisplayName ?? null,
      platform: payload.platform ?? null,
      commandId: payload.commandId ?? null,
      requestedAction: payload.requestedAction ?? null,
      apiAccessMode: payload.apiAccessMode ?? null,
      tokenSource: payload.tokenSource ?? null,
      platformSendApproved: Boolean(payload.platformSendApproved),
      recipients: result.recipients,
      notified: result.notified,
      reason: result.reason,
      dedupWindowMs: Math.max(0, Math.floor(result.dedupWindowMs) || 0),
      errorMessage,
      occurredAt,
    });
  } catch (err) {
    console.error(
      "[audience-legacy-token-dispatch-alert] failed to persist history entry:",
      (err as Error)?.message ?? err,
    );
  }
}

export interface LegacyTokenDispatchAlertHistoryEntry {
  id: string;
  connectorId: string | null;
  connectorDisplayName: string | null;
  platform: string | null;
  commandId: string | null;
  requestedAction: string | null;
  apiAccessMode: string | null;
  tokenSource: string | null;
  platformSendApproved: boolean;
  recipients: string[];
  notified: boolean;
  reason: AlertReason;
  dedupWindowMs: number;
  errorMessage: string | null;
  occurredAt: string;
}

const HISTORY_MAX = 50;

export async function getLegacyTokenDispatchAlertHistory(
  limit = 20,
): Promise<LegacyTokenDispatchAlertHistoryEntry[]> {
  const n = Math.max(1, Math.min(HISTORY_MAX, Math.floor(limit) || 20));
  try {
    const rows = await db
      .select()
      .from(audienceLegacyTokenDispatchAlerts)
      .orderBy(desc(audienceLegacyTokenDispatchAlerts.occurredAt))
      .limit(n);
    return rows.map((r) => ({
      id: r.alertId,
      connectorId: r.connectorId,
      connectorDisplayName: r.connectorDisplayName,
      platform: r.platform,
      commandId: r.commandId,
      requestedAction: r.requestedAction,
      apiAccessMode: r.apiAccessMode,
      tokenSource: r.tokenSource,
      platformSendApproved: r.platformSendApproved,
      recipients: r.recipients,
      notified: r.notified,
      reason: r.reason as AlertReason,
      dedupWindowMs: r.dedupWindowMs,
      errorMessage: r.errorMessage,
      occurredAt: (r.occurredAt instanceof Date
        ? r.occurredAt
        : new Date(r.occurredAt as any)
      ).toISOString(),
    }));
  } catch (err) {
    console.error(
      "[audience-legacy-token-dispatch-alert] failed to read history:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

/**
 * Task #549: bounded retention sweep — delete every legacy-token dispatch
 * alert row older than `cutoff`. Called from the audience retention sweeper
 * on the audit-window cadence so the history table can never grow without
 * bound. Returns the number of rows pruned.
 */
export async function pruneLegacyTokenDispatchAlertsOlderThan(
  cutoff: Date,
): Promise<number> {
  try {
    const res: any = await db
      .delete(audienceLegacyTokenDispatchAlerts)
      .where(lt(audienceLegacyTokenDispatchAlerts.occurredAt, cutoff));
    return (res?.rowCount as number) ?? 0;
  } catch (err) {
    console.error(
      "[audience-legacy-token-dispatch-alert] prune failed:",
      (err as Error)?.message ?? err,
    );
    throw err;
  }
}

export async function handleLegacyTokenDispatchEvent(
  payload: LegacyTokenDispatchEventPayload,
  configLoader: () => Promise<AudienceLegacyTokenDispatchAlertConfig> = getAudienceLegacyTokenDispatchAlertConfig,
  nowMs: () => number = () => Date.now(),
): Promise<AlertResult> {
  const cfg = await configLoader();
  const window = resolveLegacyTokenDispatchDedupWindowMs(cfg);
  const base = {
    recipients: cfg.recipients,
    connectorId: payload.connectorId ?? null,
    platform: payload.platform ?? null,
    dedupWindowMs: window,
  };
  if (payload.tokenSource !== "legacy_env_fallback") {
    const r: AlertResult = { notified: false, reason: "not_legacy_fallback", ...base };
    await recordHistory(payload, r);
    return r;
  }
  if (payload.apiAccessMode !== "official_api") {
    const r: AlertResult = { notified: false, reason: "not_official_api", ...base };
    await recordHistory(payload, r);
    return r;
  }
  if (!payload.platformSendApproved) {
    const r: AlertResult = { notified: false, reason: "not_approved", ...base };
    await recordHistory(payload, r);
    return r;
  }
  if (!payload.connectorId || !payload.platform) {
    const r: AlertResult = { notified: false, reason: "missing_connector", ...base };
    await recordHistory(payload, r);
    return r;
  }
  if (!cfg.enabled) {
    const r: AlertResult = { notified: false, reason: "disabled", ...base };
    await recordHistory(payload, r);
    return r;
  }
  if (cfg.recipients.length === 0) {
    const r: AlertResult = { notified: false, reason: "no_recipients", ...base };
    await recordHistory(payload, r);
    return r;
  }
  const now = nowMs();
  const key = payload.connectorId;
  const prev = dedupState.get(key);
  if (prev && window > 0 && now - prev.lastSentAt < window) {
    prev.suppressedCount += 1;
    if (prev.suppressedSince === null) prev.suppressedSince = prev.lastSentAt;
    const r: AlertResult = { notified: false, reason: "deduplicated", ...base };
    await recordHistory(payload, r);
    return r;
  }

  const burstCount = prev?.suppressedCount ?? 0;
  const burstSince = prev?.suppressedSince ?? null;
  const burstSuffix =
    burstCount > 0
      ? ` (${burstCount} similar dispatch${burstCount === 1 ? "" : "es"} suppressed since ${new Date(burstSince!).toISOString()})`
      : "";
  const displayName = payload.connectorDisplayName || payload.connectorId;
  const platformLabel = String(payload.platform);
  const subject = `[LEGACY TOKEN] ${displayName} (${platformLabel}) dispatched via shared env token`;
  const message = [
    `Connector "${displayName}" (connectorId: ${payload.connectorId}, platform: ${platformLabel}) just successfully dispatched a real moderation command using the shared AUDIENCE_GATEWAY_${platformLabel.toUpperCase()}_TOKEN env fallback.`,
    "",
    "This means no per-connector encrypted secret is installed for this connector. Flipping `AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_" +
      platformLabel.toUpperCase() +
      "=true` right now would break this connector with `platform_token_missing`.",
    "",
    "Suggested action: install a per-connector secret via the admin UI (Omni-Channel Audience → Connector Secrets), then re-run this dispatch to confirm it is served from the encrypted secret. After that, you can safely disable the env fallback for this platform.",
    "",
    `Command: ${payload.commandId ?? "—"}`,
    `Action: ${payload.requestedAction ?? "—"}`,
    `Suppressed since last alert: ${burstCount}`,
  ].join("\n");

  try {
    for (const to of cfg.recipients) {
      await emailService.sendAdminAlert(to, {
        title: subject + burstSuffix,
        severity: "warning",
        message,
        actionUrl: "/admin/omni-channel-audience#legacy-token-status",
      });
    }
    dedupState.set(key, {
      lastSentAt: now,
      suppressedCount: 0,
      suppressedSince: null,
    });
    const r: AlertResult = { notified: true, reason: "sent", ...base };
    await recordHistory(payload, r);
    return r;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(
      "[audience-legacy-token-dispatch-alert] email send failed:",
      msg,
    );
    const r: AlertResult = { notified: false, reason: "send_failed", ...base };
    await recordHistory(payload, r, msg);
    return r;
  }
}

let installed = false;
let unsubscribe: (() => void) | null = null;

export function installAudienceLegacyTokenDispatchAlert(): boolean {
  if (installed) return false;
  unsubscribe = neuralNewsroomBus.subscribe(
    "audience.gateway_send_dispatched",
    {
      id: "audience_legacy_token_dispatch_alert",
      type: "admin",
      handler: (event: { payload: unknown }) => {
        const payload = (event.payload ?? {}) as LegacyTokenDispatchEventPayload;
        handleLegacyTokenDispatchEvent(payload).catch((err) =>
          console.error(
            "[audience-legacy-token-dispatch-alert] handler error:",
            (err as Error)?.message ?? err,
          ),
        );
      },
    },
  );
  installed = true;
  console.log("[audience-legacy-token-dispatch-alert] installed");
  return true;
}

export function uninstallAudienceLegacyTokenDispatchAlert(): void {
  if (unsubscribe) {
    try {
      unsubscribe();
    } catch {
      /* noop */
    }
  }
  unsubscribe = null;
  installed = false;
}
