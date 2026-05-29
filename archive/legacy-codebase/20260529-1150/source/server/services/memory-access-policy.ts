import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { agentMemory, truthMemories, type AgentKnowledgeSource, type AgentMemory, type TruthMemory } from "@shared/schema";
import { sanitizeMemoryOutput, type SanitizedOutput } from "./memory-output-sanitizer";

export const memoryVaultTypes = ["personal", "business", "public", "behavioral", "verified"] as const;
export const memorySensitivityLevels = ["public", "internal", "restricted", "private", "secret"] as const;
export const memoryContextTypes = [
  "agent_behavior",
  "public_debate",
  "podcast",
  "marketplace_export",
  "seo_generation",
  "clustering",
  "business_task",
  "owner_private",
  "admin_inspection",
] as const;

export type MemoryVaultType = typeof memoryVaultTypes[number];
export type MemorySensitivity = typeof memorySensitivityLevels[number];
export type MemoryContextType = typeof memoryContextTypes[number];
export type MemoryScope = "none" | "public" | "behavioral" | "private";

type MemorySourceType = "agent_memory" | "truth_memory" | "knowledge_source" | "personal_memory";

type MemoryAccessInput = {
  vaultType?: string | null;
  sensitivity?: string | null;
  context: MemoryContextType;
  explicitUserPermission?: boolean;
  sourceType?: MemorySourceType;
};

export type MemoryAccessDecision = {
  allowed: boolean;
  reason: string;
  vaultType: MemoryVaultType | "unknown";
  sensitivity: MemorySensitivity | "unknown";
  sanitized: boolean;
};

type SanitizedMemoryRecord<T> = T & {
  accessPolicy: MemoryAccessDecision & {
    redactions: string[];
  };
};

type PolicyCheckedResult<T> = {
  records: SanitizedMemoryRecord<T>[];
  deniedCount: number;
  requestAllowed: boolean;
  explanations: string[];
  redactions: string[];
};

const PUBLIC_CONTEXTS = new Set<MemoryContextType>([
  "agent_behavior",
  "public_debate",
  "podcast",
  "marketplace_export",
  "seo_generation",
  "clustering",
]);

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function normalizeVaultType(value: unknown, fallback: MemoryVaultType | "unknown"): MemoryVaultType | "unknown" {
  return isOneOf(value, memoryVaultTypes) ? value : fallback;
}

function normalizeSensitivity(value: unknown, fallback: MemorySensitivity | "unknown"): MemorySensitivity | "unknown" {
  return isOneOf(value, memorySensitivityLevels) ? value : fallback;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function recordPermission(record: unknown) {
  const metadata = asRecord(asRecord(record).metadata);
  return metadata.explicitUserPermission === true
    || metadata.businessUseApproved === true
    || metadata.exportAllowed === true
    || metadata.vaultPermissionGranted === true;
}

function fallbackVaultFor(sourceType?: MemorySourceType): MemoryVaultType | "unknown" {
  if (sourceType === "agent_memory") return "behavioral";
  if (sourceType === "knowledge_source") return "business";
  if (sourceType === "personal_memory") return "personal";
  if (sourceType === "truth_memory") return "personal";
  return "unknown";
}

function fallbackSensitivityFor(sourceType?: MemorySourceType): MemorySensitivity | "unknown" {
  if (sourceType === "agent_memory") return "internal";
  if (sourceType === "knowledge_source") return "restricted";
  if (sourceType === "personal_memory") return "private";
  if (sourceType === "truth_memory") return "private";
  return "unknown";
}

export function isPublicMemoryContext(context: MemoryContextType) {
  return PUBLIC_CONTEXTS.has(context);
}

export function evaluateMemoryAccess(input: MemoryAccessInput): MemoryAccessDecision {
  const vaultType = normalizeVaultType(input.vaultType, fallbackVaultFor(input.sourceType));
  const sensitivity = normalizeSensitivity(input.sensitivity, fallbackSensitivityFor(input.sourceType));
  const publicContext = isPublicMemoryContext(input.context);
  const sanitized = vaultType === "behavioral" || sensitivity === "internal" || sensitivity === "restricted";

  if (vaultType === "unknown" || sensitivity === "unknown") {
    return { allowed: false, reason: "Memory has no trusted vault classification.", vaultType, sensitivity, sanitized: false };
  }

  if (input.context === "owner_private") {
    return { allowed: true, reason: "Owner-private context allows this classified memory.", vaultType, sensitivity, sanitized };
  }

  if (sensitivity === "secret") {
    return { allowed: false, reason: "Secret memory is never exposed outside owner-private context.", vaultType, sensitivity, sanitized: false };
  }

  if (vaultType === "personal") {
    return { allowed: false, reason: publicContext ? "Personal memory is blocked in public contexts." : "Personal memory requires owner-private context.", vaultType, sensitivity, sanitized: false };
  }

  if (vaultType === "business") {
    if (input.explicitUserPermission) {
      return { allowed: true, reason: "Business memory allowed by explicit user permission.", vaultType, sensitivity, sanitized: true };
    }
    return { allowed: false, reason: "Business memory requires explicit user permission.", vaultType, sensitivity, sanitized: false };
  }

  if (vaultType === "behavioral") {
    if (sensitivity === "private" && publicContext) {
      return { allowed: false, reason: "Private behavioral memory is blocked in public contexts.", vaultType, sensitivity, sanitized: false };
    }
    return { allowed: true, reason: "Behavioral memory allowed only as sanitized style/context hints.", vaultType, sensitivity, sanitized: true };
  }

  if (vaultType === "public" || vaultType === "verified") {
    if (sensitivity === "private" && publicContext) {
      return { allowed: false, reason: "Private memory is blocked in public contexts.", vaultType, sensitivity, sanitized: false };
    }
    if (sensitivity === "restricted" && publicContext && vaultType !== "verified") {
      return { allowed: false, reason: "Restricted public memory is blocked in public contexts.", vaultType, sensitivity, sanitized: false };
    }
    return { allowed: true, reason: `${vaultType} memory is allowed for this context.`, vaultType, sensitivity, sanitized };
  }

  return { allowed: false, reason: "Memory policy denied this classification.", vaultType, sensitivity, sanitized: false };
}

function scopeAllows(scope: MemoryScope | undefined, decision: MemoryAccessDecision) {
  if (!scope || scope === "behavioral") return decision.vaultType === "behavioral" || decision.vaultType === "public" || decision.vaultType === "verified";
  if (scope === "none") return false;
  if (scope === "public") return decision.vaultType === "public" || decision.vaultType === "verified";
  return true;
}

function sanitizeRecordContent(value: unknown, decision: MemoryAccessDecision, context: MemoryContextType): SanitizedOutput {
  return sanitizeMemoryOutput(value, {
    redactContactInfo: isPublicMemoryContext(context),
    behavioralHintOnly: decision.vaultType === "behavioral",
  });
}

function buildResult<T>(records: SanitizedMemoryRecord<T>[], denied: MemoryAccessDecision[]): PolicyCheckedResult<T> {
  const redactions = records.flatMap((record) => record.accessPolicy.redactions);
  return {
    records,
    deniedCount: denied.length,
    requestAllowed: denied.length === 0,
    explanations: [...new Set([...records.map((record) => record.accessPolicy.reason), ...denied.map((decision) => decision.reason)])],
    redactions: [...new Set(redactions)],
  };
}

function sanitizeAgentMemory(memory: AgentMemory, decision: MemoryAccessDecision, context: MemoryContextType): SanitizedMemoryRecord<AgentMemory> {
  const contextOutput = sanitizeRecordContent(memory.contextData, decision, context);
  const decisionOutput = sanitizeMemoryOutput(memory.decisionTaken || "", { redactContactInfo: isPublicMemoryContext(context) });
  return {
    ...memory,
    contextData: {
      safeSummary: contextOutput.content,
      redactions: contextOutput.redactions,
      vaultType: decision.vaultType,
      sensitivity: decision.sensitivity,
    },
    decisionTaken: decisionOutput.content || null,
    accessPolicy: {
      ...decision,
      redactions: [...new Set([...contextOutput.redactions, ...decisionOutput.redactions])],
    },
  };
}

function sanitizeTruthMemory(memory: TruthMemory, decision: MemoryAccessDecision, context: MemoryContextType): SanitizedMemoryRecord<TruthMemory> {
  const output = sanitizeRecordContent(memory.content, decision, context);
  return {
    ...memory,
    content: output.content,
    metadata: {
      ...asRecord(memory.metadata),
      memoryPolicy: {
        redactions: output.redactions,
      },
    },
    accessPolicy: {
      ...decision,
      redactions: output.redactions,
    },
  };
}

function sanitizeKnowledgeSource(source: AgentKnowledgeSource, decision: MemoryAccessDecision, context: MemoryContextType): SanitizedMemoryRecord<AgentKnowledgeSource> {
  const contentOutput = sanitizeRecordContent(source.content || "", decision, context);
  const uriOutput = sanitizeMemoryOutput(source.uri || "", { redactContactInfo: isPublicMemoryContext(context) });
  return {
    ...source,
    content: contentOutput.content || null,
    uri: uriOutput.content || null,
    metadata: {
      memoryPolicy: {
        originalMetadataRedacted: true,
        redactions: [...new Set([...contentOutput.redactions, ...uriOutput.redactions])],
      },
    },
    accessPolicy: {
      ...decision,
      redactions: [...new Set([...contentOutput.redactions, ...uriOutput.redactions])],
    },
  };
}

class MemoryAccessPolicyService {
  evaluate = evaluateMemoryAccess;

  async getPolicyCheckedAgentMemories(params: {
    agentId: string;
    context: MemoryContextType;
    scope?: MemoryScope;
    eventType?: string;
    limit?: number;
    explicitUserPermission?: boolean;
  }): Promise<PolicyCheckedResult<AgentMemory>> {
    if (params.scope === "none") return buildResult([], []);

    const limit = Math.min(Math.max(params.limit || 50, 1), 100);
    const raw = params.eventType
      ? await storage.getAgentMemoriesByType(params.agentId, params.eventType, limit)
      : await storage.getAgentMemories(params.agentId, limit);

    const allowed: SanitizedMemoryRecord<AgentMemory>[] = [];
    const denied: MemoryAccessDecision[] = [];

    for (const memory of raw) {
      const decision = evaluateMemoryAccess({
        vaultType: memory.vaultType,
        sensitivity: memory.sensitivity,
        context: params.context,
        explicitUserPermission: params.explicitUserPermission,
        sourceType: "agent_memory",
      });
      if (!decision.allowed) {
        denied.push(decision);
        continue;
      }
      if (!scopeAllows(params.scope, decision)) continue;
      allowed.push(sanitizeAgentMemory(memory, decision, params.context));
    }

    return buildResult(allowed, denied);
  }

  async getPolicyCheckedTruthMemories(params: {
    agentId: string;
    context: MemoryContextType;
    truthType?: string;
    minConfidence?: number;
    limit?: number;
    explicitUserPermission?: boolean;
  }): Promise<PolicyCheckedResult<TruthMemory>> {
    const limit = Math.min(Math.max(params.limit || 50, 1), 100);
    const conditions = [eq(truthMemories.agentId, params.agentId)];
    if (params.truthType) conditions.push(eq(truthMemories.truthType, params.truthType));
    if (params.minConfidence != null) conditions.push(gte(truthMemories.confidenceScore, params.minConfidence));

    const raw = await db.select().from(truthMemories)
      .where(and(...conditions))
      .orderBy(desc(truthMemories.confidenceScore))
      .limit(limit);

    const allowed: SanitizedMemoryRecord<TruthMemory>[] = [];
    const denied: MemoryAccessDecision[] = [];

    for (const memory of raw) {
      const decision = evaluateMemoryAccess({
        vaultType: memory.vaultType,
        sensitivity: memory.sensitivity,
        context: params.context,
        explicitUserPermission: params.explicitUserPermission || recordPermission(memory),
        sourceType: "truth_memory",
      });
      if (!decision.allowed) {
        denied.push(decision);
        continue;
      }
      allowed.push(sanitizeTruthMemory(memory, decision, params.context));
    }

    return buildResult(allowed, denied);
  }

  async filterKnowledgeSourcesForContext(params: {
    agentId: string;
    context: MemoryContextType;
    explicitUserPermission?: boolean;
  }): Promise<PolicyCheckedResult<AgentKnowledgeSource>> {
    const raw = await storage.getAgentKnowledgeSources(params.agentId);
    const allowed: SanitizedMemoryRecord<AgentKnowledgeSource>[] = [];
    const denied: MemoryAccessDecision[] = [];

    for (const source of raw) {
      const decision = evaluateMemoryAccess({
        vaultType: source.vaultType,
        sensitivity: source.sensitivity,
        context: params.context,
        explicitUserPermission: params.explicitUserPermission || recordPermission(source),
        sourceType: "knowledge_source",
      });
      if (!decision.allowed) {
        denied.push(decision);
        continue;
      }
      allowed.push(sanitizeKnowledgeSource(source, decision, params.context));
    }

    return buildResult(allowed, denied);
  }
}

export function runPrivateMemoryBlockCheck() {
  const decision = evaluateMemoryAccess({
    vaultType: "personal",
    sensitivity: "private",
    context: "public_debate",
    sourceType: "personal_memory",
  });

  return {
    passed: !decision.allowed,
    vaultType: "personal" as const,
    sensitivity: "private" as const,
    context: "public_debate" as const,
    expected: "blocked",
    actual: decision.allowed ? "allowed" : "blocked",
    reason: decision.reason,
  };
}

export const memoryAccessPolicyService = new MemoryAccessPolicyService();
