import { storage } from "../storage";
import type { AgentKnowledgeSource, UserAgent } from "@shared/schema";
import { evaluateMemoryAccess, memoryAccessPolicyService, runPrivateMemoryBlockCheck, type MemoryContextType, type MemorySensitivity, type MemoryVaultType } from "./memory-access-policy";
import { sanitizeMemoryOutput } from "./memory-output-sanitizer";

const SOURCE_TYPES = ["text", "link"] as const;
const VAULT_TYPES = ["personal", "business", "public", "behavioral", "verified"] as const;

export type UserAgentPersonalityPreset =
  | "research_analyst"
  | "builder_planner"
  | "tutor_coach"
  | "creative_strategist"
  | "operations_assistant";

type BuilderSourceInput = {
  sourceType: string;
  title: string;
  content?: string;
  uri?: string;
  requestedVaultType?: string;
  businessUseApproved?: boolean;
};

type BuilderPayload = {
  name: string;
  industry?: string;
  category?: string;
  role?: string;
  personalityPreset: UserAgentPersonalityPreset;
  instructions: string;
  memoryConfirmed: boolean;
  sources?: BuilderSourceInput[];
};

export type BuilderSourceClassification = {
  vaultType: MemoryVaultType;
  sensitivity: MemorySensitivity;
  reason: string;
  allowedContexts: string[];
  blockedContexts: string[];
  requiresBusinessPermission: boolean;
  warnings: string[];
  sanitizedPreview: string;
};

const PERSONAL_PATTERN = /\b(my|family|home address|personal|private|medical|diagnosis|salary|income|tax|ssn|social security|bank|card|password|secret|token|api key)\b/i;
const BUSINESS_PATTERN = /\b(client|customer|lead|deal|revenue|strategy|roadmap|contract|proposal|pricing|sales|business|project|company|internal)\b/i;
const BEHAVIORAL_PATTERN = /\b(style|tone|preference|prefer|voice|writing style|be concise|be detailed|friendly|formal|coach|explain)\b/i;
const VERIFIED_PATTERN = /\b(evidence|source|citation|study|paper|report|verified|fact check|data)\b/i;
const PUBLIC_URL_PATTERN = /^https?:\/\//i;
const RESERVED_SYSTEM_AGENT_NAMES = new Set([
  "mougle",
  "aletheia",
  "arivu",
  "astraion",
  "mercurion",
  "dharma",
  "chronarch",
  "sentinel",
  "voxa",
  "architect",
  "contrarian",
]);

class BuilderServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const userAgentPersonalityPresets = {
  research_analyst: {
    label: "Research Analyst",
    description: "Evidence-first research, source awareness, careful uncertainty.",
    persona: "Evidence-first research analyst",
    skills: ["research", "analysis", "summarization"],
    temperature: 0.35,
    systemPrompt: "Act as a careful research analyst. Prioritize evidence, cite uncertainty, separate facts from assumptions, and avoid unsupported claims.",
  },
  builder_planner: {
    label: "Builder / Planner",
    description: "Structured planning, implementation steps, tradeoff clarity.",
    persona: "Structured builder and implementation planner",
    skills: ["planning", "analysis", "writing"],
    temperature: 0.45,
    systemPrompt: "Act as a practical builder and planner. Break work into clear steps, identify dependencies, and keep recommendations executable.",
  },
  tutor_coach: {
    label: "Tutor / Coach",
    description: "Patient explanations, guided learning, supportive feedback.",
    persona: "Patient tutor and coach",
    skills: ["teaching", "summarization", "writing"],
    temperature: 0.55,
    systemPrompt: "Act as a patient tutor. Explain ideas clearly, check assumptions, and help the user learn without overwhelming them.",
  },
  creative_strategist: {
    label: "Creative Strategist",
    description: "Concept generation, positioning, pattern finding.",
    persona: "Creative strategist",
    skills: ["ideation", "writing", "analysis"],
    temperature: 0.75,
    systemPrompt: "Act as a creative strategist. Generate useful options, connect patterns, and keep ideas tied to the user's goals.",
  },
  operations_assistant: {
    label: "Operations Assistant",
    description: "Reliable procedures, task tracking, low-risk execution support.",
    persona: "Reliable operations assistant",
    skills: ["operations", "summarization", "moderation"],
    temperature: 0.3,
    systemPrompt: "Act as a reliable operations assistant. Favor clear procedures, careful checklists, and low-risk execution support.",
  },
} as const;

const PUBLIC_CONTEXTS: MemoryContextType[] = ["public_debate", "podcast", "marketplace_export", "seo_generation", "clustering", "agent_behavior"];

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function requireString(value: unknown, name: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BuilderServiceError(`${name} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new BuilderServiceError(`${name} is too long`);
  }
  return trimmed;
}

function optionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function isVaultType(value: unknown): value is MemoryVaultType {
  return typeof value === "string" && (VAULT_TYPES as readonly string[]).includes(value);
}

function isSourceType(value: unknown): value is typeof SOURCE_TYPES[number] {
  return typeof value === "string" && (SOURCE_TYPES as readonly string[]).includes(value);
}

function previewFor(vaultType: MemoryVaultType, sensitivity: MemorySensitivity, businessApproved: boolean) {
  if (vaultType === "personal") {
    return {
      allowedContexts: ["owner_private"],
      blockedContexts: PUBLIC_CONTEXTS,
      requiresBusinessPermission: false,
      warnings: ["Personal/private memory stays out of public contexts."],
    };
  }

  if (vaultType === "business") {
    return {
      allowedContexts: businessApproved ? ["business_task with explicit permission"] : ["owner_private"],
      blockedContexts: PUBLIC_CONTEXTS,
      requiresBusinessPermission: true,
      warnings: businessApproved
        ? ["Business memory is approved for supervised business tasks only."]
        : ["Business memory needs explicit permission before supervised business tasks."],
    };
  }

  if (vaultType === "behavioral") {
    return {
      allowedContexts: ["agent_behavior as sanitized style hints"],
      blockedContexts: ["raw public output", "marketplace_export", "seo_generation", "clustering"],
      requiresBusinessPermission: false,
      warnings: ["Behavioral memory is converted into safe style/context hints."],
    };
  }

  if (vaultType === "public" || vaultType === "verified") {
    return {
      allowedContexts: ["agent_behavior", "public_debate", "podcast"],
      blockedContexts: sensitivity === "restricted" ? ["marketplace_export", "seo_generation", "clustering"] : [],
      requiresBusinessPermission: false,
      warnings: vaultType === "verified" ? ["Verified memory should keep source references attached."] : [],
    };
  }

  return {
    allowedContexts: ["owner_private"],
    blockedContexts: PUBLIC_CONTEXTS,
    requiresBusinessPermission: false,
    warnings: ["Unknown memory is restricted by default."],
  };
}

export function classifyBuilderSource(input: BuilderSourceInput): BuilderSourceClassification {
  const sourceType = isSourceType(input.sourceType) ? input.sourceType : "text";
  const title = optionalString(input.title, 160) || "Training source";
  const content = optionalString(input.content, 12000) || "";
  const uri = optionalString(input.uri, 1000) || "";
  const requestedVaultType = isVaultType(input.requestedVaultType) ? input.requestedVaultType : undefined;
  const combined = `${title}\n${content}\n${uri}`;
  const hasPublicUri = sourceType === "link" && PUBLIC_URL_PATTERN.test(uri);
  const hasSensitiveMarker = PERSONAL_PATTERN.test(combined);
  const businessApproved = input.businessUseApproved === true;

  let vaultType: MemoryVaultType = "business";
  let sensitivity: MemorySensitivity = "restricted";
  let reason = "No trusted public signal was found, so this source is restricted by default.";

  if (hasSensitiveMarker || requestedVaultType === "personal") {
    vaultType = "personal";
    sensitivity = "private";
    reason = "Personal or sensitive markers require personal/private handling.";
  } else if (requestedVaultType === "behavioral" || BEHAVIORAL_PATTERN.test(combined)) {
    vaultType = "behavioral";
    sensitivity = "internal";
    reason = "This source looks like style or preference memory.";
  } else if (requestedVaultType === "verified" && hasPublicUri && VERIFIED_PATTERN.test(combined)) {
    vaultType = "verified";
    sensitivity = "internal";
    reason = "This source has a public URL and evidence/verification signals.";
  } else if (requestedVaultType === "public" && hasPublicUri) {
    vaultType = "public";
    sensitivity = "public";
    reason = "The user marked a public URL as public knowledge.";
  } else if (requestedVaultType === "business" || BUSINESS_PATTERN.test(combined)) {
    vaultType = "business";
    sensitivity = "restricted";
    reason = "Business/project markers require restricted business-vault handling.";
  }

  if ((requestedVaultType === "public" || requestedVaultType === "verified") && vaultType !== requestedVaultType) {
    reason = `${reason} Public/verified classification was not accepted without clear source evidence.`;
  }

  const preview = previewFor(vaultType, sensitivity, businessApproved);
  const sanitized = sanitizeMemoryOutput(content || uri || title, {
    redactContactInfo: vaultType !== "personal",
    behavioralHintOnly: vaultType === "behavioral",
  });

  return {
    vaultType,
    sensitivity,
    reason,
    allowedContexts: preview.allowedContexts,
    blockedContexts: preview.blockedContexts,
    requiresBusinessPermission: preview.requiresBusinessPermission,
    warnings: [...new Set([...preview.warnings, ...sanitized.redactions.map((item) => `Redacted ${item} in previews.`)])],
    sanitizedPreview: sanitized.content.slice(0, 500),
  };
}

function normalizeSource(input: BuilderSourceInput, index: number) {
  const sourceType = isSourceType(input.sourceType) ? input.sourceType : null;
  if (!sourceType) throw new BuilderServiceError("Only text and link training sources are supported in this phase.");

  const title = requireString(input.title, "Source title", 160);
  const content = optionalString(input.content, 12000);
  const uri = optionalString(input.uri, 1000);
  if (sourceType === "text" && !content) throw new BuilderServiceError(`Text source ${index + 1} needs content.`);
  if (sourceType === "link" && (!uri || !PUBLIC_URL_PATTERN.test(uri))) throw new BuilderServiceError(`Link source ${index + 1} needs a valid public URL.`);

  return {
    sourceType,
    title,
    content,
    uri,
    requestedVaultType: isVaultType(input.requestedVaultType) ? input.requestedVaultType : undefined,
    businessUseApproved: input.businessUseApproved === true,
  };
}

function buildSystemPrompt(preset: (typeof userAgentPersonalityPresets)[UserAgentPersonalityPreset], instructions: string) {
  return [
    preset.systemPrompt,
    instructions ? `User instructions:\n${instructions}` : "",
    "Safety rules: this is a private user-owned Mougle agent. Do not claim to be MOUGLE or a system specialist. Do not publish, sell, export, or act publicly without explicit future approval. Respect memory vault rules and never reveal private memory in public contexts.",
  ].filter(Boolean).join("\n\n");
}

function buildTrainingStatus(agent: UserAgent, sources: AgentKnowledgeSource[]) {
  const personalCount = sources.filter((source) => source.vaultType === "personal").length;
  const businessCount = sources.filter((source) => source.vaultType === "business").length;
  const publicReadyCount = sources.filter((source) => source.vaultType === "public" || source.vaultType === "verified").length;
  const sourceWarnings = sources.flatMap((source) => {
    const metadata = asRecord(source.metadata);
    return Array.isArray(metadata.safetyWarnings) ? metadata.safetyWarnings : [];
  });

  return {
    status: agent.status,
    readyState: agent.status === "active_private" ? "private_ready" : agent.status,
    sourceCount: sources.length,
    personalCount,
    businessCount,
    publicReadyCount,
    warnings: [...new Set(sourceWarnings)],
    nextStep: sources.length === 0 ? "Add text or link knowledge when you are ready." : "Use test preview before relying on this agent for real work.",
  };
}

export async function createUserOwnedAgent(ownerId: string, payload: BuilderPayload) {
  const name = requireString(payload.name, "Agent name", 80);
  if (RESERVED_SYSTEM_AGENT_NAMES.has(name.toLowerCase())) {
    throw new BuilderServiceError("Choose a non-system agent name for user-owned agents.");
  }
  const instructions = requireString(payload.instructions, "Instructions", 4000);
  const preset = userAgentPersonalityPresets[payload.personalityPreset];
  if (!preset) throw new BuilderServiceError("Select a valid personality preset.");
  if (payload.memoryConfirmed !== true) throw new BuilderServiceError("Confirm memory visibility before creating this agent.");

  const sources = (payload.sources || []).slice(0, 10).map(normalizeSource);
  const now = new Date().toISOString();
  const industry = optionalString(payload.industry, 80);
  const category = optionalString(payload.category, 80);
  const role = optionalString(payload.role, 80);

  const agent = await storage.createUserAgent({
    ownerId,
    type: "personal",
    agentType: "user_owned",
    name,
    persona: preset.persona,
    skills: [...new Set([...preset.skills, "private_memory", "safe_simulation"])],
    model: "gpt-5.5",
    provider: "openai",
    systemPrompt: buildSystemPrompt(preset, instructions),
    temperature: preset.temperature,
    visibility: "private",
    marketplaceEnabled: false,
    exportable: false,
    status: "training",
    deploymentModes: ["private"],
    rateLimitPerMin: 30,
    tags: ["user-owned", "private", "phase-18"],
    industrySlug: industry,
    categorySlug: category,
    roleSlug: role,
  });

  const createdSources: AgentKnowledgeSource[] = [];
  for (const source of sources) {
    const classification = classifyBuilderSource(source);
    const created = await storage.createAgentKnowledgeSource({
      agentId: agent.id,
      sourceType: source.sourceType,
      title: source.title,
      content: source.content,
      uri: source.uri,
      vaultType: classification.vaultType,
      sensitivity: classification.sensitivity,
      status: "processed",
      metadata: {
        phase: "phase_18_user_agent_builder",
        requestedVaultType: source.requestedVaultType || null,
        classificationReason: classification.reason,
        confirmedByUser: true,
        confirmedAt: now,
        businessTaskApproved: classification.vaultType === "business" ? source.businessUseApproved === true : false,
        allowedContexts: classification.allowedContexts,
        blockedContexts: classification.blockedContexts,
        safetyWarnings: classification.warnings,
        sanitizedPreview: classification.sanitizedPreview,
      },
    });
    createdSources.push(created);
  }

  const updatedAgent = await storage.updateUserAgent(agent.id, {
    status: "active_private",
    visibility: "private",
    marketplaceEnabled: false,
    exportable: false,
    deploymentModes: ["private"],
  });

  return {
    agent: updatedAgent,
    sources: createdSources,
    trainingStatus: buildTrainingStatus(updatedAgent, createdSources),
    safetyPreview: buildSafetyPreview(createdSources),
  };
}

export async function getBuilderTrainingStatus(ownerId: string, agentId: string) {
  const agent = await storage.getUserAgent(agentId);
  if (!agent) throw new BuilderServiceError("Agent not found", 404);
  if (agent.ownerId !== ownerId) throw new BuilderServiceError("Forbidden", 403);
  const sources = await storage.getAgentKnowledgeSources(agentId);
  return {
    agent,
    sources,
    trainingStatus: buildTrainingStatus(agent, sources),
    safetyPreview: buildSafetyPreview(sources),
  };
}

function buildSafetyPreview(sources: AgentKnowledgeSource[]) {
  const contexts: MemoryContextType[] = ["owner_private", "business_task", "agent_behavior", "public_debate", "marketplace_export", "seo_generation", "clustering"];
  const sourceSummaries = sources.map((source) => {
    const metadata = asRecord(source.metadata);
    return {
      id: source.id,
      title: source.title,
      sourceType: source.sourceType,
      vaultType: source.vaultType,
      sensitivity: source.sensitivity,
      status: source.status,
      allowedContexts: Array.isArray(metadata.allowedContexts) ? metadata.allowedContexts : [],
      blockedContexts: Array.isArray(metadata.blockedContexts) ? metadata.blockedContexts : [],
      safetyWarnings: Array.isArray(metadata.safetyWarnings) ? metadata.safetyWarnings : [],
      businessTaskApproved: metadata.businessTaskApproved === true,
      sanitizedPreview: typeof metadata.sanitizedPreview === "string" ? metadata.sanitizedPreview : "",
    };
  });

  return {
    sourceSummaries,
    contextRules: contexts.map((context) => {
      const allowed = sources.filter((source) => {
        const metadata = asRecord(source.metadata);
        const decision = evaluateMemoryAccess({
          vaultType: source.vaultType,
          sensitivity: source.sensitivity,
          context,
          explicitUserPermission: context === "business_task" && metadata.businessTaskApproved === true,
          sourceType: "knowledge_source",
        });
        return decision.allowed;
      }).length;
      return {
        context,
        allowed,
        blocked: sources.length - allowed,
      };
    }),
    privateMemoryBlockCheck: runPrivateMemoryBlockCheck(),
  };
}

export async function simulateUserOwnedAgent(ownerId: string, agentId: string) {
  const agent = await storage.getUserAgent(agentId);
  if (!agent) throw new BuilderServiceError("Agent not found", 404);
  if (agent.ownerId !== ownerId) throw new BuilderServiceError("Forbidden", 403);

  const sources = await storage.getAgentKnowledgeSources(agentId);
  const businessTaskApproved = sources.some((source) => asRecord(source.metadata).businessTaskApproved === true);
  const publicDebate = await memoryAccessPolicyService.filterKnowledgeSourcesForContext({
    agentId,
    context: "public_debate",
    explicitUserPermission: false,
  });
  const businessTask = await memoryAccessPolicyService.filterKnowledgeSourcesForContext({
    agentId,
    context: "business_task",
    explicitUserPermission: businessTaskApproved,
  });
  const ownerPrivate = await memoryAccessPolicyService.filterKnowledgeSourcesForContext({
    agentId,
    context: "owner_private",
    explicitUserPermission: true,
  });

  return {
    mode: "simulate_only",
    autonomousActions: false,
    proposedAction: "test_prompt_preview",
    decision: "approved_for_private_test_only",
    publicActionDecision: "blocked",
    publicActionReason: "User-owned agents cannot publish or act publicly in this MVP.",
    memoryPolicy: {
      publicDebate: {
        allowed: publicDebate.records.length,
        denied: publicDebate.deniedCount,
        explanations: publicDebate.explanations,
        redactions: publicDebate.redactions,
      },
      businessTask: {
        allowed: businessTask.records.length,
        denied: businessTask.deniedCount,
        explanations: businessTask.explanations,
        redactions: businessTask.redactions,
      },
      ownerPrivate: {
        allowed: ownerPrivate.records.length,
        denied: ownerPrivate.deniedCount,
        explanations: ownerPrivate.explanations,
        redactions: ownerPrivate.redactions,
      },
      privateMemoryBlockCheck: runPrivateMemoryBlockCheck(),
    },
    safetyWarnings: [
      "No autonomous publishing is enabled.",
      "Marketplace clone/export is disabled for this agent.",
      "Public debates, SEO, clustering, and marketplace exports block personal/private memory.",
    ],
  };
}

export const userAgentBuilderService = {
  presets: userAgentPersonalityPresets,
  classifyBuilderSource,
  createUserOwnedAgent,
  getBuilderTrainingStatus,
  simulateUserOwnedAgent,
};
