/**
 * Audience Platform Gateway Service (Task #374).
 *
 * The single gated path that can actually dispatch an
 * `AudienceModerationCommand` to a real platform (YouTube Data API,
 * Facebook Graph, X v2, Telegram Bot API, etc.). Every other layer
 * (`omni-channel-audience-safety-service`) stays simulation-only.
 *
 * Hard rules preserved from Task #371:
 *   - Official APIs only — adapters describe the official endpoint; no
 *     scraping, no rate-limit bypass.
 *   - Per-connector root-admin opt-in via `platformSendApproved` on the
 *     connector row. Default false. The gateway refuses without it.
 *   - Re-validate the `AudienceSafetyDecision` immediately before send —
 *     the decision's fingerprint must match the one captured when the
 *     command was built.
 *   - Per-platform official rate-limits enforced in-process (token bucket
 *     per minute). No bypass.
 *   - Admin-field redaction on the bus is unchanged.
 *
 * Live dispatch is disabled by default. A platform adapter only performs
 * a real HTTP call when `connector.apiAccessMode === "official_api"` AND
 * `process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH === "true"` AND a per-platform
 * access-token secret has been provided. In every other case the adapter
 * returns `dispatched:false, simulated:true` and the gateway emits
 * `audience.gateway_send_simulated` instead of `audience.gateway_send_dispatched`.
 */

import {
  type AudienceChannelConnector,
  type AudienceModerationCommand,
  type AudiencePlatform,
  type AudienceSafetyDecision,
  type RequestedModerationAction,
} from "../../shared/omni-channel-audience-schema";
import {
  omniChannelAudienceSafetyService,
  OmniChannelAudienceSafetyService,
} from "./omni-channel-audience-safety-service";
import {
  audienceConnectorSecretsService,
  AudienceConnectorSecretsService,
} from "./audience-connector-secrets-service";
import { neuralNewsroomBus } from "./neural-newsroom-bus";
import { recordGatewayEvent } from "./audience-gateway-event-log-service";
import {
  legacyTokenKillSwitchAuditService,
  encodeKillSwitchValue,
} from "./audience-legacy-token-kill-switch-audit-service";
import { notifyLegacyTokenKillSwitchFlip } from "./audience-legacy-token-kill-switch-notifier";
import { db } from "../db";
import { systemSettings } from "../../shared/schema";
import { eq } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Per-platform official rate limits (requests per minute).           */
/* ------------------------------------------------------------------ */
const RATE_LIMITS_PER_MINUTE: Record<AudiencePlatform, number> = {
  youtube: 60,
  facebook: 60,
  x: 50,
  telegram: 30,
  instagram: 60,
  tiktok: 30,
  linkedin: 30,
  reddit: 60,
  custom: 30,
};

/* ------------------------------------------------------------------ */
/* Adapter contract                                                    */
/* ------------------------------------------------------------------ */
export interface PlatformAdapterRequest {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body: Record<string, unknown> | null;
}

export interface PlatformAdapter {
  platform: AudiencePlatform;
  buildRequest(
    cmd: AudienceModerationCommand,
    connector: AudienceChannelConnector,
  ): PlatformAdapterRequest;
}

/* ------------------------------------------------------------------ */
/* Adapters (official endpoints; no scraping, no bypass).             */
/* ------------------------------------------------------------------ */
const YouTubeAdapter: PlatformAdapter = {
  platform: "youtube",
  buildRequest(cmd) {
    switch (cmd.requestedAction) {
      case "delete_comment":
        return {
          url: `https://youtube.googleapis.com/youtube/v3/comments?id=${encodeURIComponent(cmd.externalMessageId)}`,
          method: "DELETE",
          body: null,
        };
      case "hide_comment":
        return {
          url: "https://youtube.googleapis.com/youtube/v3/comments/setModerationStatus",
          method: "POST",
          body: { id: cmd.externalMessageId, moderationStatus: "rejected" },
        };
      case "ban_user":
      case "timeout_user":
        return {
          url: "https://youtube.googleapis.com/youtube/v3/liveChat/bans",
          method: "POST",
          body: {
            snippet: {
              type: cmd.requestedAction === "ban_user" ? "permanent" : "temporary",
              bannedUserDetails: { externalMessageId: cmd.externalMessageId },
            },
          },
        };
      case "reply":
        return {
          url: "https://youtube.googleapis.com/youtube/v3/comments",
          method: "POST",
          body: { snippet: { parentId: cmd.externalMessageId, textOriginal: "" } },
        };
      default:
        return { url: "noop://youtube", method: "GET", body: null };
    }
  },
};

const FacebookAdapter: PlatformAdapter = {
  platform: "facebook",
  buildRequest(cmd) {
    switch (cmd.requestedAction) {
      case "hide_comment":
        return {
          url: `https://graph.facebook.com/v19.0/${encodeURIComponent(cmd.externalMessageId)}`,
          method: "POST",
          body: { is_hidden: true },
        };
      case "delete_comment":
        return {
          url: `https://graph.facebook.com/v19.0/${encodeURIComponent(cmd.externalMessageId)}`,
          method: "DELETE",
          body: null,
        };
      case "reply":
        return {
          url: `https://graph.facebook.com/v19.0/${encodeURIComponent(cmd.externalMessageId)}/comments`,
          method: "POST",
          body: { message: "" },
        };
      default:
        return { url: "noop://facebook", method: "GET", body: null };
    }
  },
};

const XAdapter: PlatformAdapter = {
  platform: "x",
  buildRequest(cmd) {
    switch (cmd.requestedAction) {
      case "delete_comment":
      case "hide_comment":
        return {
          url: `https://api.x.com/2/tweets/${encodeURIComponent(cmd.externalMessageId)}/hidden`,
          method: "PUT",
          body: { hidden: true },
        };
      case "reply":
        return {
          url: "https://api.x.com/2/tweets",
          method: "POST",
          body: { reply: { in_reply_to_tweet_id: cmd.externalMessageId }, text: "" },
        };
      default:
        return { url: "noop://x", method: "GET", body: null };
    }
  },
};

const TelegramAdapter: PlatformAdapter = {
  platform: "telegram",
  buildRequest(cmd, connector) {
    const base = `https://api.telegram.org/bot<TOKEN>/`;
    switch (cmd.requestedAction) {
      case "delete_comment":
      case "hide_comment":
        return {
          url: `${base}deleteMessage`,
          method: "POST",
          body: { chat_id: connector.accountId, message_id: cmd.externalMessageId },
        };
      case "ban_user":
        return {
          url: `${base}banChatMember`,
          method: "POST",
          body: { chat_id: connector.accountId, user_id: cmd.externalMessageId },
        };
      case "timeout_user":
        return {
          url: `${base}restrictChatMember`,
          method: "POST",
          body: { chat_id: connector.accountId, user_id: cmd.externalMessageId, until_date: 0 },
        };
      case "reply":
        return {
          url: `${base}sendMessage`,
          method: "POST",
          body: { chat_id: connector.accountId, reply_to_message_id: cmd.externalMessageId, text: "" },
        };
      default:
        return { url: "noop://telegram", method: "GET", body: null };
    }
  },
};

const NoopAdapter = (platform: AudiencePlatform): PlatformAdapter => ({
  platform,
  buildRequest() {
    return { url: `noop://${platform}`, method: "GET", body: null };
  },
});

/* ------------------------------------------------------------------ */
/* Per-platform token reading + injection                              */
/* ------------------------------------------------------------------ */
const TOKEN_ENV_KEYS: Record<AudiencePlatform, string> = {
  youtube: "AUDIENCE_GATEWAY_YOUTUBE_TOKEN",
  facebook: "AUDIENCE_GATEWAY_FACEBOOK_TOKEN",
  x: "AUDIENCE_GATEWAY_X_TOKEN",
  telegram: "AUDIENCE_GATEWAY_TELEGRAM_TOKEN",
  instagram: "AUDIENCE_GATEWAY_INSTAGRAM_TOKEN",
  tiktok: "AUDIENCE_GATEWAY_TIKTOK_TOKEN",
  linkedin: "AUDIENCE_GATEWAY_LINKEDIN_TOKEN",
  reddit: "AUDIENCE_GATEWAY_REDDIT_TOKEN",
  custom: "AUDIENCE_GATEWAY_CUSTOM_TOKEN",
};

/**
 * Per-platform feature flag that disables the legacy env-token fallback.
 * Setting `AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_<PLATFORM>=true` forces
 * the gateway to use ONLY the per-connector encrypted secret for that
 * platform; if no secret is stored the dispatch fails closed with
 * `platform_token_missing`. This lets operators turn off the bridge
 * one platform at a time as each is migrated off the shared env token.
 */
const ENV_FALLBACK_DISABLE_KEYS: Record<AudiencePlatform, string> = {
  youtube: "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_YOUTUBE",
  facebook: "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_FACEBOOK",
  x: "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_X",
  telegram: "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_TELEGRAM",
  instagram: "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_INSTAGRAM",
  tiktok: "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_TIKTOK",
  linkedin: "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_LINKEDIN",
  reddit: "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_REDDIT",
  custom: "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_CUSTOM",
};

function readPlatformToken(platform: AudiencePlatform): string | null {
  const v = process.env[TOKEN_ENV_KEYS[platform]];
  return v && v.trim().length > 0 ? v : null;
}

/**
 * Task #501 — DB-backed per-platform override for the env-fallback disable
 * flag. Persisted in `system_settings` under
 * `audience_gateway_env_fallback_disabled` as a JSON object mapping
 * `AudiencePlatform` → `boolean`. Precedence:
 *   admin override (true|false) > env flag > default false.
 *
 * Setting `null` / removing a platform from the override map restores the
 * env / default behavior for that platform without changing the others.
 */
const ENV_FALLBACK_OVERRIDE_SETTING_KEY = "audience_gateway_env_fallback_disabled";

export type EnvFallbackDisabledOverride = Partial<Record<AudiencePlatform, boolean>>;

function envFallbackDisabledFromEnv(platform: AudiencePlatform): boolean {
  const v = process.env[ENV_FALLBACK_DISABLE_KEYS[platform]];
  return typeof v === "string" && v.trim().toLowerCase() === "true";
}

export async function readEnvFallbackDisabledOverride(): Promise<EnvFallbackDisabledOverride> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, ENV_FALLBACK_OVERRIDE_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) return {};
    const parsed = JSON.parse(rows[0].value);
    if (!parsed || typeof parsed !== "object") return {};
    const out: EnvFallbackDisabledOverride = {};
    for (const p of Object.keys(TOKEN_ENV_KEYS) as AudiencePlatform[]) {
      const v = (parsed as Record<string, unknown>)[p];
      if (typeof v === "boolean") out[p] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeEnvFallbackDisabledOverride(
  next: EnvFallbackDisabledOverride,
  updatedBy?: string | null,
): Promise<void> {
  const hasAny = Object.keys(next).length > 0;
  if (!hasAny) {
    await db
      .delete(systemSettings)
      .where(eq(systemSettings.key, ENV_FALLBACK_OVERRIDE_SETTING_KEY));
    return;
  }
  const value = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({ key: ENV_FALLBACK_OVERRIDE_SETTING_KEY, value, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedBy: updatedBy ?? null, updatedAt: new Date() },
    });
}

export async function setEnvFallbackDisabledOverride(
  platform: AudiencePlatform,
  disabled: boolean | null,
  updatedBy?: string | null,
): Promise<EnvFallbackDisabledOverride> {
  if (!(platform in TOKEN_ENV_KEYS)) {
    throw new Error(`unknown_platform_${platform}`);
  }
  const current = await readEnvFallbackDisabledOverride();
  const next: EnvFallbackDisabledOverride = { ...current };
  const previousOverride =
    platform in current ? (current[platform] as boolean) : null;
  if (disabled === null) delete next[platform];
  else next[platform] = disabled;
  await writeEnvFallbackDisabledOverride(next, updatedBy);

  // Task #558 — append-only audit row for every kill-switch change so
  // founders can review who flipped what when after the fact. Record the
  // override-level value (true / false / cleared) the admin actually
  // selected; the live status card already shows the resolved value +
  // source ("admin" / "env" / "default"). Audit insert failures are
  // swallowed inside the service so a broken audit log can never block
  // an actual kill-switch change.
  const previousValue = encodeKillSwitchValue(previousOverride);
  const newValue = encodeKillSwitchValue(disabled);
  if (previousValue !== newValue) {
    const actor = updatedBy ?? "root_admin";
    await legacyTokenKillSwitchAuditService.record({
      platform,
      previousValue,
      newValue,
      updatedBy: actor,
    });
    // Task #608 — real-time founder/security email for every kill-switch flip.
    notifyLegacyTokenKillSwitchFlip({
      platform,
      previousValue,
      newValue,
      updatedBy: actor,
      batchId: null,
      flippedAt: new Date().toISOString(),
    });
  }

  return next;
}

/**
 * Task #559 — bulk apply per-platform overrides in a single write. Validates
 * every platform first so a single bad entry aborts the whole batch (no
 * partial writes). `disabled: null` clears the override for that platform.
 * Returns the resulting override map.
 */
export async function setEnvFallbackDisabledOverridesBulk(
  updates: Array<{ platform: AudiencePlatform; disabled: boolean | null }>,
  updatedBy?: string | null,
): Promise<EnvFallbackDisabledOverride> {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error("no_updates");
  }
  for (const u of updates) {
    if (!(u.platform in TOKEN_ENV_KEYS)) {
      throw new Error(`unknown_platform_${u.platform}`);
    }
  }
  const current = await readEnvFallbackDisabledOverride();
  const next: EnvFallbackDisabledOverride = { ...current };
  const changes: Array<{
    platform: AudiencePlatform;
    previousValue: ReturnType<typeof encodeKillSwitchValue>;
    newValue: ReturnType<typeof encodeKillSwitchValue>;
  }> = [];
  for (const u of updates) {
    const previousOverride =
      u.platform in next ? (next[u.platform] as boolean) : null;
    if (u.disabled === null) delete next[u.platform];
    else next[u.platform] = u.disabled;
    const previousValue = encodeKillSwitchValue(previousOverride);
    const newValue = encodeKillSwitchValue(u.disabled);
    if (previousValue !== newValue) {
      changes.push({ platform: u.platform, previousValue, newValue });
    }
  }
  await writeEnvFallbackDisabledOverride(next, updatedBy);

  // Task #604 — bulk writes record one audit row per actually-changed
  // platform, all sharing the same `batchId` so the dashboard can collapse
  // them into a single grouped entry instead of N separate rows. Audit
  // failures are swallowed inside the service.
  if (changes.length > 0) {
    const batchId =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `batch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const actor = updatedBy ?? "root_admin";
    const flippedAt = new Date().toISOString();
    for (const c of changes) {
      await legacyTokenKillSwitchAuditService.record({
        platform: c.platform,
        previousValue: c.previousValue,
        newValue: c.newValue,
        updatedBy: actor,
        batchId,
      });
      // Task #608 — fire a per-platform notifier for every changed entry.
      // Dedup inside the notifier collapses repeated identical flips into
      // one email and reports the suppressed count on the next send.
      notifyLegacyTokenKillSwitchFlip({
        platform: c.platform,
        previousValue: c.previousValue,
        newValue: c.newValue,
        updatedBy: actor,
        batchId,
        flippedAt,
      });
    }
  }

  return next;
}

async function isEnvFallbackDisabled(platform: AudiencePlatform): Promise<boolean> {
  const override = await readEnvFallbackDisabledOverride();
  if (typeof override[platform] === "boolean") return override[platform]!;
  return envFallbackDisabledFromEnv(platform);
}

function isEnvFallbackDisabledFromState(
  platform: AudiencePlatform,
  override: EnvFallbackDisabledOverride,
): boolean {
  if (typeof override[platform] === "boolean") return override[platform]!;
  return envFallbackDisabledFromEnv(platform);
}

function envFallbackDisabledSource(
  platform: AudiencePlatform,
  override: EnvFallbackDisabledOverride,
): "admin" | "env" | "default" {
  if (typeof override[platform] === "boolean") return "admin";
  return envFallbackDisabledFromEnv(platform) ? "env" : "default";
}

function buildAuthHeaders(platform: AudiencePlatform, token: string): Record<string, string> {
  switch (platform) {
    case "telegram":
      // Telegram embeds the token in the URL, not the headers.
      return {};
    case "facebook":
      // Facebook Graph accepts ?access_token=… or the Bearer header; use Bearer.
      return { Authorization: `Bearer ${token}` };
    default:
      return { Authorization: `Bearer ${token}` };
  }
}

/**
 * Returns the real URL used at the transport boundary. The token is only
 * substituted in this private helper — it is NEVER attached to the
 * `PlatformAdapterRequest` that is returned to callers, emitted on the
 * bus, persisted in audit history, or surfaced in API responses.
 */
function transportUrl(platform: AudiencePlatform, request: PlatformAdapterRequest, token: string): string {
  if (platform === "telegram") {
    return request.url.replace("<TOKEN>", encodeURIComponent(token));
  }
  return request.url;
}

/**
 * Returns a public-safe copy of the request descriptor. The token-bearing
 * `<TOKEN>` placeholder is replaced with a fixed redaction marker so
 * downstream loggers / event subscribers / API responses can never see
 * the secret.
 */
function sanitizeRequest(request: PlatformAdapterRequest): PlatformAdapterRequest {
  return {
    ...request,
    url: request.url.replace("<TOKEN>", "<redacted>"),
  };
}

/* ------------------------------------------------------------------ */
/* Rate-limit token buckets (per connector, per minute).              */
/* ------------------------------------------------------------------ */
interface BucketState {
  windowStartMs: number;
  used: number;
  limit: number;
}

/* ------------------------------------------------------------------ */
/* Gateway                                                             */
/* ------------------------------------------------------------------ */
export interface GatewayDispatchResult {
  commandId: string;
  dispatched: boolean;
  simulated: boolean;
  blockerReason: string | null;
  request: PlatformAdapterRequest | null;
  rateLimitRemaining: number | null;
}

export class AudiencePlatformGatewayService {
  private adapters: Map<AudiencePlatform, PlatformAdapter> = new Map();
  private buckets: Map<string, BucketState> = new Map();
  private safety: OmniChannelAudienceSafetyService;
  private secrets: AudienceConnectorSecretsService;

  constructor(
    safety: OmniChannelAudienceSafetyService,
    secrets: AudienceConnectorSecretsService = audienceConnectorSecretsService,
  ) {
    this.safety = safety;
    this.secrets = secrets;
    this.adapters.set("youtube", YouTubeAdapter);
    this.adapters.set("facebook", FacebookAdapter);
    this.adapters.set("x", XAdapter);
    this.adapters.set("telegram", TelegramAdapter);
    // Platforms without a published adapter in this phase still get a noop
    // descriptor so the gateway can fail closed with a clear reason.
    for (const p of ["instagram", "tiktok", "linkedin", "reddit", "custom"] as AudiencePlatform[]) {
      this.adapters.set(p, NoopAdapter(p));
    }
  }

  /** Test/admin: reset rate-limit buckets. */
  resetRateLimits(): void {
    this.buckets.clear();
  }

  /** PUBLIC: try to dispatch a moderation command through the real platform. */
  async dispatch(commandId: string, opts: { adminId?: string | null } = {}): Promise<GatewayDispatchResult> {
    const cmd = await this.safety.getCommand(commandId);
    if (!cmd) {
      return this.blocked(commandId, "command_not_found", null, null);
    }
    const decision = await this.safety.getDecision(cmd.decisionId);
    const message = decision ? await this.safety.getMessage(decision.messageId) : null;
    const connector = message ? await this.safety.getConnector(message.connectorId) : null;

    if (!decision) return this.blocked(commandId, "decision_not_found", null, null);
    if (!message) return this.blocked(commandId, "message_not_found", null, null);
    if (!connector) return this.blocked(commandId, "connector_not_registered", null, null);
    // From here on, all `blocked()` paths can attribute the failure to a
    // specific connector. Pass it explicitly so the gateway-block alert
    // service (Task #381 / #419) can identify the top offending
    // connector(s), not just the platform.

    const cid = connector.connectorId;
    // 1. Mode gate — only the explicit future-platform mode may reach here.
    if (cmd.commandMode !== "future_platform_gateway") {
      return this.blocked(commandId, `command_mode_${cmd.commandMode}`, null, null, cid);
    }
    // 2. Command-level allow gate.
    if (!cmd.commandAllowed) {
      return this.blocked(commandId, cmd.blockerReason ?? "command_not_allowed", null, null, cid);
    }
    // 3. Connector opt-in gate.
    if (!connector.platformSendApproved) {
      return this.blocked(commandId, "connector_not_platform_send_approved", null, null, cid);
    }
    if (connector.apiAccessMode === "disabled" || connector.apiAccessMode === "manual_import") {
      return this.blocked(commandId, `api_access_mode_${connector.apiAccessMode}`, null, null, cid);
    }
    // 4. Re-check permission immediately before send.
    const perm = await this.safety.validatePlatformPermission(message.connectorId, cmd.requestedAction);
    if (!perm.allowed) {
      return this.blocked(commandId, perm.reason ?? "permission_missing", null, null, cid);
    }
    // 5. Re-validate decision fingerprint (tamper detection).
    const liveDecision = await this.safety.getDecision(cmd.decisionId);
    if (!liveDecision) return this.blocked(commandId, "decision_not_found", null, null, cid);
    const liveFp = this.safety.fingerprintDecision(liveDecision);
    if (liveFp !== cmd.decisionFingerprint) {
      return this.blocked(commandId, "decision_changed_since_build", null, null, cid);
    }
    // 5b. Decision must still authorize a moderation action.
    if (!liveDecision.allowedForModerationAction && cmd.requestedAction !== "no_action") {
      return this.blocked(commandId, "decision_not_action_eligible", null, null, cid);
    }
    // 5c. Decision must not require unresolved human review for destructive actions.
    if (liveDecision.requiresHumanReview && cmd.requiresHumanApproval) {
      return this.blocked(commandId, "human_approval_required", null, null, cid);
    }
    // 6. Per-platform rate limit.
    const bucket = this.consume(connector);
    if (!bucket.allowed) {
      return this.blocked(commandId, "rate_limit_exceeded", null, bucket.remaining, cid);
    }
    // 7. Adapter must exist and produce a non-noop request for this action.
    const adapter = this.adapters.get(message.platform);
    if (!adapter) {
      return this.blocked(commandId, "no_adapter_for_platform", null, bucket.remaining, cid);
    }
    const request = adapter.buildRequest(cmd, connector);
    if (request.url.startsWith("noop://")) {
      return this.blocked(commandId, "action_not_supported_by_adapter", request, bucket.remaining, cid);
    }

    // 8. Dispatch. Live HTTP is disabled by default — the gateway only calls
    // a real platform when (a) `AUDIENCE_GATEWAY_LIVE_DISPATCH === "true"`
    // is set by a root admin AND (b) a per-platform access token is wired
    // in via env (`AUDIENCE_GATEWAY_<PLATFORM>_TOKEN`). Anything else is a
    // safe simulation: same gates, same emitted events, but no `fetch`.
    const liveDispatch = process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH === "true";
    if (!liveDispatch) {
      const publicRequest = sanitizeRequest(request);
      neuralNewsroomBus.emit("audience.gateway_send_simulated", {
        commandId,
        platform: message.platform,
        requestedAction: cmd.requestedAction,
        url: publicRequest.url,
        method: publicRequest.method,
        adminId: opts.adminId ?? null,
      });
      await recordGatewayEvent({
        name: "audience.gateway_send_simulated",
        commandId,
        connectorId: cid,
        platform: message.platform,
        requestedAction: cmd.requestedAction,
        url: publicRequest.url,
        method: publicRequest.method,
        adminId: opts.adminId ?? null,
      });
      return {
        commandId,
        dispatched: false,
        simulated: true,
        blockerReason: null,
        request: publicRequest,
        rateLimitRemaining: bucket.remaining,
      };
    }
    // Live branch — fail closed if no token has been configured. The
    // gateway prefers the per-connector encrypted secret (Task #380) and
    // falls back to the per-platform env variable for legacy deployments.
    // Neither path mirrors the raw token onto the connector row, the
    // event payload, the audit history, or any API response.
    const perConnectorToken = await this.secrets.getDecryptedToken(connector.connectorId);
    const envFallbackAllowed = !(await isEnvFallbackDisabled(message.platform));
    const envToken = envFallbackAllowed ? readPlatformToken(message.platform) : null;
    const token = perConnectorToken ?? envToken;
    if (!token) {
      return this.blocked(commandId, "platform_token_missing", request, bucket.remaining, cid);
    }
    // Task #500 — capture which token source served this dispatch so a
    // downstream alert can warn the founder when an approved connector
    // is still leaning on the shared `AUDIENCE_GATEWAY_<P>_TOKEN`
    // fallback. NEVER carries token material.
    const tokenSource: "per_connector_secret" | "legacy_env_fallback" =
      perConnectorToken !== null ? "per_connector_secret" : "legacy_env_fallback";
    // Build the transport URL (only place the secret touches). Every value
    // returned to callers, emitted on the bus, or surfaced via API uses the
    // sanitized descriptor below — it never contains the raw token.
    const realUrl = transportUrl(message.platform, request, token);
    const publicRequest = sanitizeRequest(request);
    const headers: Record<string, string> = buildAuthHeaders(message.platform, token);
    if (request.body !== null) headers["Content-Type"] = "application/json";
    try {
      const response = await fetch(realUrl, {
        method: request.method,
        headers,
        body: request.body === null ? undefined : JSON.stringify(request.body),
      });
      if (!response.ok) {
        return this.blocked(
          commandId,
          `platform_http_${response.status}`,
          publicRequest,
          bucket.remaining,
          cid,
        );
      }
      neuralNewsroomBus.emit("audience.gateway_send_dispatched", {
        commandId,
        connectorId: connector.connectorId,
        platform: message.platform,
        requestedAction: cmd.requestedAction,
        url: publicRequest.url,
        method: publicRequest.method,
        status: response.status,
        adminId: opts.adminId ?? null,
        tokenSource,
        connectorDisplayName: connector.displayName,
        apiAccessMode: connector.apiAccessMode,
        platformSendApproved: !!connector.platformSendApproved,
      });
      await recordGatewayEvent({
        name: "audience.gateway_send_dispatched",
        commandId,
        connectorId: cid,
        platform: message.platform,
        requestedAction: cmd.requestedAction,
        url: publicRequest.url,
        method: publicRequest.method,
        status: response.status,
        adminId: opts.adminId ?? null,
      });
      return {
        commandId,
        dispatched: true,
        simulated: false,
        blockerReason: null,
        request: publicRequest,
        rateLimitRemaining: bucket.remaining,
      };
    } catch (e: any) {
      return this.blocked(
        commandId,
        `platform_fetch_error_${(e?.name as string) ?? "unknown"}`,
        publicRequest,
        bucket.remaining,
        cid,
      );
    }
  }

  /**
   * Snapshot of which connectors are still on the legacy shared env-token
   * fallback vs. having a per-connector encrypted secret installed
   * (Task #462). Lets admins see — without ever exposing token material
   * — whether flipping `AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_<PLATFORM>`
   * on right now would break any approved connector.
   *
   * Per connector: `tokenSource` is one of:
   *   - `"per_connector_secret"`: encrypted secret stored, no env reliance.
   *   - `"legacy_env_fallback"`: no per-connector secret but the
   *     platform's `AUDIENCE_GATEWAY_<PLATFORM>_TOKEN` env var is set.
   *   - `"no_token"`: neither source has a token — dispatch already fails.
   *
   * `wouldBreakIfEnvFallbackDisabled` is the subset of `legacy_env_fallback`
   * connectors that are also `platformSendApproved` AND on `official_api`,
   * grouped by platform. These are the rows that would silently start
   * failing `platform_token_missing` the moment the disable flag is on.
   */
  async getLegacyTokenStatus(): Promise<{
    connectors: Array<{
      connectorId: string;
      platform: AudiencePlatform;
      displayName: string;
      apiAccessMode: string;
      platformSendApproved: boolean;
      tokenSource: "per_connector_secret" | "legacy_env_fallback" | "no_token";
      envFallbackDisabled: boolean;
      envTokenConfigured: boolean;
      perConnectorSecretInstalled: boolean;
      secretRotatedAt: string | null;
      secretRotationCount: number;
    }>;
    platforms: Array<{
      platform: AudiencePlatform;
      envFallbackDisabled: boolean;
      envFallbackDisabledSource: "admin" | "env" | "default";
      envFallbackDisabledOverride: boolean | null;
      envFallbackDisabledFromEnv: boolean;
      envTokenConfigured: boolean;
      envDisableKey: string;
      envTokenKey: string;
      connectorCount: number;
      perConnectorSecretCount: number;
      legacyEnvFallbackCount: number;
      noTokenCount: number;
    }>;
    wouldBreakIfEnvFallbackDisabled: Array<{
      platform: AudiencePlatform;
      envFallbackDisabled: boolean;
      connectors: Array<{
        connectorId: string;
        displayName: string;
        apiAccessMode: string;
        platformSendApproved: boolean;
      }>;
    }>;
    secretsKeyConfigured: boolean;
  }> {
    const connectors = await this.safety.listConnectors();
    const secretMetas = await this.secrets.listMetadata();
    const secretsByConnector = new Map(secretMetas.map((m) => [m.connectorId, m]));
    const allPlatforms = Object.keys(TOKEN_ENV_KEYS) as AudiencePlatform[];
    const override = await readEnvFallbackDisabledOverride();

    const connectorRows = connectors.map((c) => {
      const meta = secretsByConnector.get(c.connectorId) ?? null;
      const perConnectorSecretInstalled = meta !== null;
      const envTokenConfigured = readPlatformToken(c.platform) !== null;
      const envFallbackDisabled = isEnvFallbackDisabledFromState(c.platform, override);
      let tokenSource: "per_connector_secret" | "legacy_env_fallback" | "no_token";
      if (perConnectorSecretInstalled) {
        tokenSource = "per_connector_secret";
      } else if (envTokenConfigured && !envFallbackDisabled) {
        tokenSource = "legacy_env_fallback";
      } else if (envTokenConfigured && envFallbackDisabled) {
        // env token exists but is currently shut off — connector would not
        // be served by it right now.
        tokenSource = "no_token";
      } else {
        tokenSource = "no_token";
      }
      return {
        connectorId: c.connectorId,
        platform: c.platform,
        displayName: c.displayName,
        apiAccessMode: c.apiAccessMode,
        platformSendApproved: !!c.platformSendApproved,
        tokenSource,
        envFallbackDisabled,
        envTokenConfigured,
        perConnectorSecretInstalled,
        secretRotatedAt: meta?.lastRotatedAt ?? null,
        secretRotationCount: meta?.rotationCount ?? 0,
      };
    });

    const platforms = allPlatforms.map((p) => {
      const subset = connectorRows.filter((r) => r.platform === p);
      const overrideValue =
        typeof override[p] === "boolean" ? (override[p] as boolean) : null;
      return {
        platform: p,
        envFallbackDisabled: isEnvFallbackDisabledFromState(p, override),
        envFallbackDisabledSource: envFallbackDisabledSource(p, override),
        envFallbackDisabledOverride: overrideValue,
        envFallbackDisabledFromEnv: envFallbackDisabledFromEnv(p),
        envTokenConfigured: readPlatformToken(p) !== null,
        envDisableKey: ENV_FALLBACK_DISABLE_KEYS[p],
        envTokenKey: TOKEN_ENV_KEYS[p],
        connectorCount: subset.length,
        perConnectorSecretCount: subset.filter(
          (r) => r.tokenSource === "per_connector_secret",
        ).length,
        legacyEnvFallbackCount: subset.filter(
          (r) => r.tokenSource === "legacy_env_fallback",
        ).length,
        noTokenCount: subset.filter((r) => r.tokenSource === "no_token").length,
      };
    });

    const wouldBreak = allPlatforms
      .map((p) => {
        const rows = connectorRows.filter(
          (r) =>
            r.platform === p &&
            r.tokenSource === "legacy_env_fallback" &&
            r.platformSendApproved &&
            r.apiAccessMode === "official_api",
        );
        return {
          platform: p,
          envFallbackDisabled: isEnvFallbackDisabledFromState(p, override),
          connectors: rows.map((r) => ({
            connectorId: r.connectorId,
            displayName: r.displayName,
            apiAccessMode: r.apiAccessMode,
            platformSendApproved: r.platformSendApproved,
          })),
        };
      })
      .filter((p) => p.connectors.length > 0);

    return {
      connectors: connectorRows,
      platforms,
      wouldBreakIfEnvFallbackDisabled: wouldBreak,
      secretsKeyConfigured: this.secrets.isConfigured(),
    };
  }

  /** Read the current bucket state without consuming. */
  async peekRateLimit(connectorId: string): Promise<{
    used: number;
    limit: number;
    remaining: number;
    windowMs: number;
    resetAt: string;
  } | null> {
    const c = await this.safety.getConnector(connectorId);
    if (!c) return null;
    const b = this.buckets.get(connectorId);
    const limit = RATE_LIMITS_PER_MINUTE[c.platform];
    const now = Date.now();
    if (!b || now - b.windowStartMs >= 60_000) {
      return {
        used: 0,
        limit,
        remaining: limit,
        windowMs: 60_000,
        resetAt: new Date(now + 60_000).toISOString(),
      };
    }
    return {
      used: b.used,
      limit,
      remaining: Math.max(0, limit - b.used),
      windowMs: 60_000,
      resetAt: new Date(b.windowStartMs + 60_000).toISOString(),
    };
  }

  private consume(connector: AudienceChannelConnector): { allowed: boolean; remaining: number } {
    const limit = RATE_LIMITS_PER_MINUTE[connector.platform];
    const now = Date.now();
    let b = this.buckets.get(connector.connectorId);
    if (!b || now - b.windowStartMs >= 60_000) {
      b = { windowStartMs: now, used: 0, limit };
      this.buckets.set(connector.connectorId, b);
    }
    if (b.used >= limit) return { allowed: false, remaining: 0 };
    b.used += 1;
    return { allowed: true, remaining: Math.max(0, limit - b.used) };
  }

  private async blocked(
    commandId: string,
    reason: string,
    request: PlatformAdapterRequest | null,
    remaining: number | null,
    connectorId: string | null = null,
  ): Promise<GatewayDispatchResult> {
    const cmd = await this.safety.getCommand(commandId);
    neuralNewsroomBus.emit("audience.gateway_send_blocked", {
      commandId,
      platform: cmd?.platform ?? null,
      connectorId: connectorId ?? cmd?.connectorId ?? null,
      requestedAction: cmd?.requestedAction ?? null,
      reason,
    });
    await recordGatewayEvent({
      name: "audience.gateway_send_blocked",
      commandId,
      connectorId: connectorId ?? cmd?.connectorId ?? null,
      platform: cmd?.platform ?? null,
      requestedAction: cmd?.requestedAction ?? null,
      reason,
    });
    return {
      commandId,
      dispatched: false,
      simulated: false,
      blockerReason: reason,
      request,
      rateLimitRemaining: remaining,
    };
  }
}

export const audiencePlatformGatewayService = new AudiencePlatformGatewayService(
  omniChannelAudienceSafetyService,
);

/** Test helper: re-export adapters for inspection. */
export const __testing = {
  RATE_LIMITS_PER_MINUTE,
  YouTubeAdapter,
  FacebookAdapter,
  XAdapter,
  TelegramAdapter,
  TOKEN_ENV_KEYS,
  ENV_FALLBACK_DISABLE_KEYS,
  ENV_FALLBACK_OVERRIDE_SETTING_KEY,
  isEnvFallbackDisabled,
};
