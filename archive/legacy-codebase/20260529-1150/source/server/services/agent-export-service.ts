import crypto from "crypto";
import { storage } from "../storage";
import { personalAgentService } from "./personal-agent-service";
import { memoryAccessPolicyService } from "./memory-access-policy";

export type AgentPassportPayload = {
  format: "mougle-agent";
  exportVersion: number;
  origin: "mougle.com";
  passportStandard: "MAP-1";
  capabilities: string[];
  exportId: string;
  metadata: {
    name: string;
    version: string;
    ownerIdHash: string;
    model: string;
    provider: string;
    exportedAt: string;
  };
  behavior: {
    persona?: string | null;
    systemPrompt?: string | null;
    temperature?: number | null;
    skills?: string[] | null;
    tags?: string[] | null;
  };
  editableMemory: Record<string, any>;
  knowledgeReferences: Record<string, any>;
  toolConfig: Record<string, any>;
  workflows: Record<string, any>;
  compatibleModels: {
    model: string;
    provider: string;
  };
};

const EXPORT_WINDOW_MS = 60_000;
const lastExportByUser = new Map<string, number>();

function getExportSecret(): string {
  const secret = process.env.AGENT_EXPORT_SECRET;
  if (!secret) {
    throw new Error("AGENT_EXPORT_SECRET must be set for agent exports.");
  }
  return secret;
}

function hashOwnerId(ownerId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(ownerId).digest("hex");
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptPayload(plaintext: string, secret: string) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function signPayload(plaintext: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(plaintext).digest("hex");
}

function hashPassportContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function enforceRateLimit(userId: string) {
  const now = Date.now();
  const last = lastExportByUser.get(userId) || 0;
  if (now - last < EXPORT_WINDOW_MS) {
    const retryAfter = Math.ceil((EXPORT_WINDOW_MS - (now - last)) / 1000);
    const err: any = new Error("Export rate limit exceeded");
    err.status = 429;
    err.retryAfter = retryAfter;
    throw err;
  }
  lastExportByUser.set(userId, now);
}

export async function exportAgent(agentId: string, sessionUserId: string) {
  enforceRateLimit(sessionUserId);

  if (agentId === "personal" || agentId === "personal-agent") {
    const secret = getExportSecret();
    const personalProfile = await personalAgentService.getOrCreateProfile(sessionUserId);
    const exportId = crypto.randomUUID();
    const payload: AgentPassportPayload = {
      format: "mougle-agent",
      exportVersion: 1,
      origin: "mougle.com",
      passportStandard: "MAP-1",
      capabilities: ["memory", "tools", "workflow"],
      exportId,
      metadata: {
        name: personalProfile.agentName || "Personal Intelligence",
        version: "1.0.0",
        ownerIdHash: hashOwnerId(sessionUserId, secret),
        model: "gpt-5.5",
        provider: "openai",
        exportedAt: new Date().toISOString(),
      },
      behavior: {
        persona: personalProfile.agentName || null,
        systemPrompt: null,
        temperature: null,
        skills: null,
        tags: null,
      },
      editableMemory: {
        blocked: true,
        vaultType: "personal",
        sensitivity: "private",
        reason: "Personal vault memory is not included in agent passport exports.",
      },
      knowledgeReferences: {},
      toolConfig: personalProfile.preferences || {},
      workflows: {},
      compatibleModels: {
        model: "gpt-5.5",
        provider: "openai",
      },
    };

    const plaintext = JSON.stringify(payload);
    const encrypted = encryptPayload(plaintext, secret);
    const signature = signPayload(plaintext, secret);

    const content = JSON.stringify({
      format: "mougle-agent-passport",
      version: 1,
      encryption: {
        algorithm: "aes-256-gcm",
        iv: encrypted.iv,
        tag: encrypted.tag,
        keyHint: "AGENT_EXPORT_SECRET",
      },
      signature: {
        algorithm: "hmac-sha256",
        value: signature,
        keyHint: "AGENT_EXPORT_SECRET",
      },
      payload: encrypted.ciphertext,
    });
    const passportHash = hashPassportContent(content);

    await storage.createAgentPassportExport({
      agentId: `personal:${sessionUserId}`,
      ownerId: sessionUserId,
      exportVersion: payload.exportVersion,
      exportHash: passportHash,
      exportedAt: new Date(),
      revoked: false,
    });

    await storage.createPlatformEvent({
      eventType: "agent_export",
      actorId: sessionUserId,
      entityType: "personal_agent",
      entityId: sessionUserId,
      payload: { agentId, exportVersion: payload.exportVersion, passportHash, exportId },
      severity: "info",
    });

    return {
      filename: `mougle_personal_agent_${sessionUserId}.mougle-agent`,
      content,
    };
  }

  const agent = await storage.getUserAgent(agentId);
  if (!agent) {
    const err: any = new Error("Agent not found");
    err.status = 404;
    throw err;
  }
  if (agent.ownerId !== sessionUserId) {
    const err: any = new Error("Forbidden");
    err.status = 403;
    throw err;
  }

  const agentType = (agent as any).agentType || (agent as any).type || "business";
  const exportable = (agent as any).exportable !== false;
  if (agentType !== "personal" || !exportable) {
    const err: any = new Error("Agent export not permitted");
    err.status = 403;
    throw err;
  }

  const secret = getExportSecret();
  const knowledgePolicy = await memoryAccessPolicyService.filterKnowledgeSourcesForContext({
    agentId,
    context: "marketplace_export",
  });

  const exportId = crypto.randomUUID();
  const payload: AgentPassportPayload = {
    format: "mougle-agent",
    exportVersion: (agent as any).exportVersion || 1,
    origin: "mougle.com",
    passportStandard: "MAP-1",
    capabilities: ["memory", "tools", "workflow"],
    exportId,
    metadata: {
      name: agent.name,
      version: agent.version || "1.0.0",
      ownerIdHash: hashOwnerId(agent.ownerId, secret),
      model: agent.model,
      provider: agent.provider,
      exportedAt: new Date().toISOString(),
    },
    behavior: {
      persona: agent.persona || null,
      systemPrompt: agent.systemPrompt || null,
      temperature: agent.temperature || null,
      skills: agent.skills || null,
      tags: agent.tags || null,
    },
    editableMemory: {},
    knowledgeReferences: {
      sources: knowledgePolicy.records,
      memoryPolicy: {
        deniedCount: knowledgePolicy.deniedCount,
        explanations: knowledgePolicy.explanations,
        redactions: knowledgePolicy.redactions,
      },
    },
    toolConfig: {},
    workflows: {},
    compatibleModels: {
      model: agent.model,
      provider: agent.provider,
    },
  };

  const plaintext = JSON.stringify(payload);
  const encrypted = encryptPayload(plaintext, secret);
  const signature = signPayload(plaintext, secret);

  const content = JSON.stringify({
    format: "mougle-agent-passport",
    version: 1,
    encryption: {
      algorithm: "aes-256-gcm",
      iv: encrypted.iv,
      tag: encrypted.tag,
      keyHint: "AGENT_EXPORT_SECRET",
    },
    signature: {
      algorithm: "hmac-sha256",
      value: signature,
      keyHint: "AGENT_EXPORT_SECRET",
    },
    payload: encrypted.ciphertext,
  });
  const passportHash = hashPassportContent(content);

  await storage.createAgentPassportExport({
    agentId,
    ownerId: sessionUserId,
    exportVersion: payload.exportVersion,
    exportHash: passportHash,
    exportedAt: new Date(),
    revoked: false,
  });

  await storage.createPlatformEvent({
    eventType: "agent_export",
    actorId: sessionUserId,
    entityType: "agent",
    entityId: agentId,
    payload: { agentId, exportVersion: payload.exportVersion, passportHash, exportId },
    severity: "info",
  });

  return {
    filename: `mougle_agent_${agentId}.mougle-agent`,
    content,
  };
}

export const agentExportService = {
  exportAgent,
};
