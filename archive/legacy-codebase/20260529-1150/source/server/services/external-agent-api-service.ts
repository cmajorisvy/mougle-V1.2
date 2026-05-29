import crypto from "crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { riskManagementService } from "./risk-management-service";
import { safeModeService } from "./safe-mode-service";
import {
  externalAgentApiKeys,
  riskAuditLogs,
  type ExternalAgentApiKey,
  type InsertRiskAuditLog,
} from "@shared/schema";

export const externalAgentCapabilities = [
  "read_public_context",
  "submit_claim",
  "attach_evidence",
  "join_sandbox_debate",
  "request_collaboration",
  "sandbox_action_simulation",
  "read_public_graph",
  "read_public_passport",
] as const;

export type ExternalAgentCapability = typeof externalAgentCapabilities[number];

export const forbiddenExternalAgentCapabilities = [
  "access_private_memory",
  "access_business_memory_without_permission",
  "mutate_user_data",
  "perform_payment",
  "publish_public_content",
  "create_marketplace_transaction",
  "bypass_admin_review",
  "execute_live_actions",
  "live_debate_execution",
] as const;

type ExternalAgentKeyCreateInput = {
  userId?: string | null;
  agentId?: string | null;
  label: string;
  capabilities?: string[];
  sandboxMode?: boolean;
  active?: boolean;
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
};

type ExternalAgentKeyUpdateInput = Partial<Omit<ExternalAgentKeyCreateInput, "label">> & {
  label?: string;
};

type ExternalAgentActor = {
  id: string;
  type: string;
};

type RateBucket = {
  minuteStart: number;
  minuteCount: number;
  dayStart: number;
  dayCount: number;
};

export type ExternalAgentAuthContext = {
  key: ExternalAgentApiKey;
  capability: ExternalAgentCapability | null;
  safeMode: {
    globalSafeMode: boolean;
    pauseExternalAgentActions: boolean;
  };
};

class ExternalAgentApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const capabilitySet = new Set<string>(externalAgentCapabilities);
const forbiddenCapabilitySet = new Set<string>(forbiddenExternalAgentCapabilities);
const rateBuckets = new Map<string, RateBucket>();

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function optionalHash(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return hashValue(value.trim());
}

function clampLimit(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizeLabel(label: unknown) {
  if (typeof label !== "string" || !label.trim()) {
    throw new ExternalAgentApiError(400, "External agent key label is required.");
  }
  return label.trim().slice(0, 120);
}

function normalizeOptionalId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 160) : null;
}

function normalizeCapabilities(input?: string[]) {
  const requested = Array.isArray(input) && input.length > 0
    ? input
    : ["read_public_context", "read_public_graph", "read_public_passport", "sandbox_action_simulation"];
  const normalized = new Set<ExternalAgentCapability>();

  for (const capability of requested) {
    if (forbiddenCapabilitySet.has(capability)) {
      throw new ExternalAgentApiError(400, `Forbidden external-agent capability requested: ${capability}`);
    }
    if (!capabilitySet.has(capability)) {
      throw new ExternalAgentApiError(400, `Unknown external-agent capability: ${capability}`);
    }
    normalized.add(capability as ExternalAgentCapability);
  }

  return [...normalized];
}

function serializeKey(key: ExternalAgentApiKey) {
  const { tokenHash, ...safeKey } = key;
  return {
    ...safeKey,
    tokenHashStored: Boolean(tokenHash),
    rawTokenAvailable: false,
  };
}

function makeToken() {
  const idPart = crypto.randomBytes(6).toString("hex");
  const secret = crypto.randomBytes(32).toString("base64url");
  return {
    rawToken: `mext_${idPart}_${secret}`,
    tokenPrefix: `mext_${idPart}`,
  };
}

function retryAfterMs(bucket: RateBucket, windowMs: number) {
  return Math.max(1000, windowMs - (Date.now() - bucket.minuteStart));
}

class ExternalAgentApiService {
  async createKey(input: ExternalAgentKeyCreateInput, actor: ExternalAgentActor) {
    const { rawToken, tokenPrefix } = makeToken();
    const [created] = await db.insert(externalAgentApiKeys).values({
      userId: normalizeOptionalId(input.userId),
      agentId: normalizeOptionalId(input.agentId || input.userId),
      label: normalizeLabel(input.label),
      tokenPrefix,
      tokenHash: hashValue(rawToken),
      capabilities: normalizeCapabilities(input.capabilities),
      sandboxMode: input.sandboxMode !== false,
      active: input.active !== false,
      rateLimitPerMinute: clampLimit(input.rateLimitPerMinute, 60, 1, 600),
      rateLimitPerDay: clampLimit(input.rateLimitPerDay, 1000, 1, 100000),
      createdBy: actor.id,
      updatedAt: new Date(),
    }).returning();

    await this.audit({
      key: created,
      actorId: actor.id,
      actorType: actor.type,
      action: "external_agent_key_created",
      outcome: "success",
      riskLevel: "medium",
      details: {
        tokenPrefix: created.tokenPrefix,
        capabilities: created.capabilities,
        sandboxMode: created.sandboxMode,
        rateLimitPerMinute: created.rateLimitPerMinute,
        rateLimitPerDay: created.rateLimitPerDay,
        rawTokenReturnedOnce: true,
      },
    });

    return {
      key: serializeKey(created),
      rawToken,
      tokenShownOnce: true,
      warning: "Store this token now. Mougle stores only the token hash and cannot display the raw token again.",
    };
  }

  async updateKey(id: string, input: ExternalAgentKeyUpdateInput, actor: ExternalAgentActor) {
    const existing = await this.getKeyOrThrow(id);
    const update: Partial<typeof externalAgentApiKeys.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.label !== undefined) update.label = normalizeLabel(input.label);
    if (input.userId !== undefined) update.userId = normalizeOptionalId(input.userId);
    if (input.agentId !== undefined) update.agentId = normalizeOptionalId(input.agentId);
    if (input.capabilities !== undefined) update.capabilities = normalizeCapabilities(input.capabilities);
    if (input.sandboxMode !== undefined) update.sandboxMode = input.sandboxMode !== false;
    if (input.active !== undefined) update.active = input.active === true;
    if (input.rateLimitPerMinute !== undefined) update.rateLimitPerMinute = clampLimit(input.rateLimitPerMinute, 60, 1, 600);
    if (input.rateLimitPerDay !== undefined) update.rateLimitPerDay = clampLimit(input.rateLimitPerDay, 1000, 1, 100000);

    const [updated] = await db
      .update(externalAgentApiKeys)
      .set(update)
      .where(eq(externalAgentApiKeys.id, id))
      .returning();

    await this.audit({
      key: updated,
      actorId: actor.id,
      actorType: actor.type,
      action: "external_agent_key_updated",
      outcome: "success",
      riskLevel: "medium",
      details: {
        previous: serializeKey(existing),
        next: serializeKey(updated),
        changedFields: Object.keys(update).filter((field) => field !== "updatedAt"),
      },
    });

    return serializeKey(updated);
  }

  async revokeKey(id: string, actor: ExternalAgentActor, reason?: string) {
    const existing = await this.getKeyOrThrow(id);
    const [updated] = await db
      .update(externalAgentApiKeys)
      .set({
        active: false,
        revokedAt: new Date(),
        revokedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(externalAgentApiKeys.id, id))
      .returning();

    await this.audit({
      key: updated,
      actorId: actor.id,
      actorType: actor.type,
      action: "external_agent_key_revoked",
      outcome: "success",
      riskLevel: "high",
      details: {
        reason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : "No reason provided",
        previous: serializeKey(existing),
        next: serializeKey(updated),
      },
    });

    return serializeKey(updated);
  }

  async listKeys() {
    const rows = await db.select().from(externalAgentApiKeys).orderBy(desc(externalAgentApiKeys.createdAt)).limit(200);
    const recentAudit = await this.listAudit(30);
    return {
      keys: rows.map(serializeKey),
      recentAudit,
      safeguards: {
        hashedTokensOnly: true,
        rawTokenReturnedOnce: true,
        sandboxOnly: true,
        noPrivateMemoryAccess: true,
        genericBearerDoesNotSatisfyUserAuth: true,
      },
    };
  }

  async listAudit(limit = 50) {
    const rows = await db
      .select()
      .from(riskAuditLogs)
      .where(sql`${riskAuditLogs.action} like 'external_agent_%'`)
      .orderBy(desc(riskAuditLogs.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows;
  }

  async authenticate(input: {
    authorizationHeader?: string;
    requiredCapability?: ExternalAgentCapability;
    ip?: string;
    userAgent?: string;
    route: string;
    method: string;
    actionLike?: boolean;
  }): Promise<ExternalAgentAuthContext> {
    if (!input.authorizationHeader?.startsWith("Bearer ")) {
      await this.auditUnknown("external_agent_auth_blocked", "denied", "medium", {
        route: input.route,
        method: input.method,
        reason: "missing_bearer_token",
      });
      throw new ExternalAgentApiError(401, "External agent bearer token required.");
    }

    const rawToken = input.authorizationHeader.slice(7).trim();
    if (!rawToken) {
      await this.auditUnknown("external_agent_auth_blocked", "denied", "medium", {
        route: input.route,
        method: input.method,
        reason: "empty_bearer_token",
      });
      throw new ExternalAgentApiError(401, "External agent bearer token required.");
    }

    const [key] = await db
      .select()
      .from(externalAgentApiKeys)
      .where(eq(externalAgentApiKeys.tokenHash, hashValue(rawToken)))
      .limit(1);

    if (!key) {
      await this.auditUnknown("external_agent_auth_blocked", "denied", "high", {
        route: input.route,
        method: input.method,
        reason: "invalid_token_hash",
      });
      throw new ExternalAgentApiError(401, "Invalid external agent token.");
    }

    if (!key.active || key.revokedAt) {
      await this.audit({
        key,
        action: "external_agent_call_blocked",
        outcome: "denied",
        riskLevel: "high",
        details: { route: input.route, method: input.method, reason: "inactive_or_revoked_key" },
      });
      throw new ExternalAgentApiError(403, "External agent key is inactive or revoked.");
    }

    if (input.requiredCapability && !key.capabilities.includes(input.requiredCapability)) {
      await this.audit({
        key,
        action: "external_agent_call_blocked",
        outcome: "denied",
        riskLevel: "medium",
        details: {
          route: input.route,
          method: input.method,
          reason: "missing_capability",
          requiredCapability: input.requiredCapability,
          capabilities: key.capabilities,
        },
      });
      throw new ExternalAgentApiError(403, `External agent key missing capability: ${input.requiredCapability}`);
    }

    this.enforceRateLimit(key, input.route, input.method);

    const safeModeStatus = await safeModeService.getStatus();
    if (input.actionLike) {
      try {
        await safeModeService.assertCapabilityAllowed("external_agent_action", key.id);
      } catch (err: any) {
        await this.audit({
          key,
          action: "external_agent_call_blocked",
          outcome: "denied",
          riskLevel: "medium",
          details: {
            route: input.route,
            method: input.method,
            reason: "safe_mode_external_actions_paused",
            message: err?.message || "External agent actions are paused.",
          },
        });
        throw err;
      }
    }

    await db.update(externalAgentApiKeys)
      .set({
        lastUsedAt: new Date(),
        lastUsedIpHash: optionalHash(input.ip),
        lastUsedUserAgentHash: optionalHash(input.userAgent),
        updatedAt: new Date(),
      })
      .where(eq(externalAgentApiKeys.id, key.id));

    await this.audit({
      key,
      action: "external_agent_call_allowed",
      outcome: "success",
      riskLevel: input.actionLike ? "medium" : "low",
      details: {
        route: input.route,
        method: input.method,
        capability: input.requiredCapability || null,
        sandboxMode: key.sandboxMode,
        actionLike: input.actionLike === true,
      },
    });

    return {
      key,
      capability: input.requiredCapability || null,
      safeMode: {
        globalSafeMode: safeModeStatus.controls.globalSafeMode,
        pauseExternalAgentActions: safeModeStatus.controls.pauseExternalAgentActions,
      },
    };
  }

  async recordSandboxProposal(input: {
    context: ExternalAgentAuthContext;
    proposalType: string;
    route: string;
    payload: Record<string, any>;
  }) {
    const proposalId = `sandbox_${crypto.randomBytes(10).toString("hex")}`;
    await this.audit({
      key: input.context.key,
      action: "external_agent_sandbox_proposal_recorded",
      outcome: "success",
      riskLevel: "medium",
      details: {
        proposalId,
        proposalType: input.proposalType,
        route: input.route,
        sandboxOnly: true,
        adminReviewRequired: true,
        payload: input.payload,
      },
    });
    return {
      proposalId,
      status: "pending_admin_review",
      sandboxOnly: true,
      executed: false,
      persistedAsPublicContent: false,
      message: "Sandbox proposal recorded for internal/admin review. No public content or live action was created.",
    };
  }

  private async getKeyOrThrow(id: string) {
    const [key] = await db.select().from(externalAgentApiKeys).where(eq(externalAgentApiKeys.id, id)).limit(1);
    if (!key) throw new ExternalAgentApiError(404, "External agent key not found.");
    return key;
  }

  private enforceRateLimit(key: ExternalAgentApiKey, route: string, method: string) {
    const now = Date.now();
    const minuteWindow = 60_000;
    const dayWindow = 24 * 60 * 60_000;
    const existing = rateBuckets.get(key.id);
    const bucket = existing && now - existing.minuteStart < minuteWindow
      ? existing
      : {
        minuteStart: now,
        minuteCount: 0,
        dayStart: existing && now - existing.dayStart < dayWindow ? existing.dayStart : now,
        dayCount: existing && now - existing.dayStart < dayWindow ? existing.dayCount : 0,
      };

    if (now - bucket.dayStart >= dayWindow) {
      bucket.dayStart = now;
      bucket.dayCount = 0;
    }

    if (bucket.minuteCount >= key.rateLimitPerMinute) {
      this.audit({
        key,
        action: "external_agent_rate_limit_blocked",
        outcome: "denied",
        riskLevel: "medium",
        details: { route, method, window: "minute", limit: key.rateLimitPerMinute },
      }).catch(() => {});
      throw new ExternalAgentApiError(429, `External agent rate limit exceeded. Retry after ${retryAfterMs(bucket, minuteWindow)}ms.`);
    }

    if (bucket.dayCount >= key.rateLimitPerDay) {
      this.audit({
        key,
        action: "external_agent_rate_limit_blocked",
        outcome: "denied",
        riskLevel: "medium",
        details: { route, method, window: "day", limit: key.rateLimitPerDay },
      }).catch(() => {});
      throw new ExternalAgentApiError(429, "External agent daily rate limit exceeded.");
    }

    bucket.minuteCount += 1;
    bucket.dayCount += 1;
    rateBuckets.set(key.id, bucket);
  }

  private async audit(input: {
    key: ExternalAgentApiKey;
    action: string;
    outcome: InsertRiskAuditLog["outcome"];
    riskLevel: InsertRiskAuditLog["riskLevel"];
    details: Record<string, any>;
    actorId?: string;
    actorType?: string;
  }) {
    await riskManagementService.logAudit({
      actorId: input.actorId || input.key.id,
      actorType: input.actorType || "external_agent",
      action: input.action,
      resourceType: "external_agent_api_key",
      resourceId: input.key.id,
      outcome: input.outcome,
      riskLevel: input.riskLevel,
      details: {
        ...input.details,
        keyId: input.key.id,
        tokenPrefix: input.key.tokenPrefix,
        userId: input.key.userId,
        agentId: input.key.agentId,
      },
    });
  }

  private async auditUnknown(action: string, outcome: InsertRiskAuditLog["outcome"], riskLevel: InsertRiskAuditLog["riskLevel"], details: Record<string, any>) {
    await riskManagementService.logAudit({
      actorId: "unknown-external-agent",
      actorType: "external_agent",
      action,
      resourceType: "external_agent_api_key",
      resourceId: null,
      outcome,
      riskLevel,
      details,
    });
  }
}

export const externalAgentApiService = new ExternalAgentApiService();
