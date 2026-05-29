import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  agentIdentities,
  knowledgeGraphEdges,
  knowledgeGraphNodes,
  userAgents,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@shared/schema";
import { memoryAccessPolicyService } from "./memory-access-policy";
import { sanitizeMemoryOutput } from "./memory-output-sanitizer";
import { unifiedEvolutionService } from "./unified-evolution-service";

export const agentGraphRequesterTypes = ["system_agent", "user_agent", "root_admin"] as const;
export const agentGraphAccessPurposes = [
  "reasoning",
  "debate_preparation",
  "evidence_validation",
  "synthesis",
  "learning_signal",
  "marketplace_review",
  "media_script_review",
] as const;

export type AgentGraphRequesterType = typeof agentGraphRequesterTypes[number];
export type AgentGraphAccessPurpose = typeof agentGraphAccessPurposes[number];
export type AgentGraphKnowledgeStatus = "fact" | "hypothesis" | "pattern";

export type AgentGraphAccessRequest = {
  requesterType: AgentGraphRequesterType;
  requesterAgentId?: string;
  purpose: AgentGraphAccessPurpose;
  query?: string;
  limit?: number;
  allowHypotheses?: boolean;
  explicitBusinessPermission?: boolean;
  minimumConfidence?: number;
};

export type AgentGraphAccessPolicySummary = {
  requesterType: AgentGraphRequesterType;
  purpose: AgentGraphAccessPurpose;
  allowedVaults: string[];
  allowedSensitivity: string[];
  minimumConfidence: number;
  hypothesesAllowed: boolean;
  businessPermissionRequired: boolean;
  explicitBusinessPermission: boolean;
  publicProjectionUsed: false;
  mutationAllowed: false;
};

export type AgentGraphContextNode = {
  id: string;
  nodeType: string;
  label: string;
  safeSummary: string | null;
  confidence: number;
  verificationStatus: string;
  vaultType: string;
  sensitivity: string;
  knowledgeStatus: AgentGraphKnowledgeStatus;
  provenanceSummary: string;
  sourceType: string;
};

export type AgentGraphContextEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  confidence: number;
  verificationStatus: string;
  vaultType: string;
  sensitivity: string;
  knowledgeStatus: AgentGraphKnowledgeStatus;
  provenanceSummary: string;
  sourceType: string;
};

export type AgentGraphAccessResult = {
  generatedAt: string;
  requester: {
    type: AgentGraphRequesterType;
    agentId: string | null;
    validated: boolean;
    role: string | null;
    systemAgent: boolean;
    userAgent: boolean;
    ues: {
      available: boolean;
      score: number | null;
      sourceQuality: string | null;
    };
  };
  policy: AgentGraphAccessPolicySummary;
  context: {
    nodes: AgentGraphContextNode[];
    edges: AgentGraphContextEdge[];
  };
  blockedCounts: {
    total: number;
    byReason: Record<string, number>;
  };
  explanations: string[];
  deterministicChecks: {
    publicVerifiedAllowed: DeterministicCheck;
    claimEvidenceAllowed: DeterministicCheck;
    privateBlocked: DeterministicCheck;
    businessBlockedWithoutPermission: DeterministicCheck;
    unknownBlocked: DeterministicCheck;
    unverifiedLabeledHypothesis: DeterministicCheck;
  };
  safeguards: {
    internalOnly: true;
    rootAdminTestOnly: true;
    noPublicApi: true;
    noPublicProjectionFilter: true;
    noRawPrivateMemory: true;
    noRawBusinessRestrictedMemory: true;
    noGraphMutation: true;
    noAutonomousLearning: true;
  };
};

type DeterministicCheck = {
  passed: boolean;
  expected: string;
  actual: string;
  explanation: string;
};

type ResolvedRequester = {
  validated: boolean;
  role: string | null;
  systemAgent: boolean;
  userAgent: boolean;
};

type PolicyDecision = {
  allowed: boolean;
  reason: string;
  knowledgeStatus: AgentGraphKnowledgeStatus | null;
  safeSummary: string | null;
  provenanceSummary: string;
  redactions: string[];
};

type GraphItem = {
  confidence: number;
  verificationStatus: string;
  vaultType: string;
  sensitivity: string;
  label?: string | null;
  summary?: string | null;
  sourceTable?: string | null;
  provenance?: unknown;
  metadata?: unknown;
};

const MAX_CONTEXT_LIMIT = 30;
const DEFAULT_LIMIT = 8;
const FACT_STATUSES = new Set(["approved", "verified", "supported", "consensus", "source_reference", "high_confidence", "scored", "exported", "published", "completed"]);
const HYPOTHESIS_STATUSES = new Set(["unverified", "pending", "pending_review", "admin_review", "internal_admin_review", "unscored", "active", "ready_for_review"]);
const BLOCKED_STATUSES = new Set(["rejected", "blocked", "failed", "contested", "revoked", "deleted"]);
const SECRET_REDACTIONS = new Set(["secret_field", "token_or_api_key", "ssn", "card_number", "banking"]);

class AgentGraphAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function clamp01(value: unknown, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function clampLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_CONTEXT_LIMIT);
}

function referenceId(prefix: "node" | "edge", key: string) {
  return `${prefix}_${crypto.createHash("sha256").update(key).digest("hex").slice(0, 18)}`;
}

function sourceTypeLabel(sourceTable: string | null | undefined) {
  const map: Record<string, string> = {
    reality_claims: "claim",
    claim_evidence: "evidence",
    consensus_records: "consensus",
    claims: "claim",
    evidence: "evidence",
    live_debates: "debate",
    debate_turns: "debate transcript",
    derived_topic: "topic",
    agent_knowledge_sources: "knowledge source",
    agent_memory: "behavioral pattern",
    truth_memories: "truth memory",
    agent_passports: "agent passport",
    agent_passport_exports: "agent passport export",
    agent_marketplace_clone_packages: "safe clone package",
    marketplace_listings: "marketplace listing",
    podcast_script_packages: "podcast script package",
    youtube_publishing_packages: "youtube publishing package",
    social_distribution_packages: "social distribution package",
    projects: "project",
    project_packages: "project package",
  };
  return map[sourceTable || ""] || "graph source";
}

function purposeMinimumConfidence(purpose: AgentGraphAccessPurpose) {
  switch (purpose) {
    case "evidence_validation":
      return 0.4;
    case "learning_signal":
      return 0.55;
    case "marketplace_review":
    case "media_script_review":
      return 0.65;
    case "debate_preparation":
      return 0.55;
    case "synthesis":
      return 0.6;
    case "reasoning":
    default:
      return 0.55;
  }
}

function resolvePolicy(request: AgentGraphAccessRequest): AgentGraphAccessPolicySummary {
  const requestedMinimum = request.minimumConfidence == null
    ? purposeMinimumConfidence(request.purpose)
    : clamp01(request.minimumConfidence, purposeMinimumConfidence(request.purpose));
  const userAgentFloor = request.requesterType === "user_agent" ? 0.7 : 0;
  const minimumConfidence = Math.max(requestedMinimum, userAgentFloor);
  const explicitBusinessPermission = request.explicitBusinessPermission === true;
  const systemLike = request.requesterType === "system_agent" || request.requesterType === "root_admin";
  const allowedVaults = ["public", "verified"];
  const allowedSensitivity = ["public", "low"];

  if (systemLike) {
    allowedVaults.push("behavioral");
    allowedSensitivity.push("internal");
  }

  if (explicitBusinessPermission) {
    allowedVaults.push("business");
    allowedSensitivity.push("restricted");
  }

  return {
    requesterType: request.requesterType,
    purpose: request.purpose,
    allowedVaults,
    allowedSensitivity,
    minimumConfidence,
    hypothesesAllowed: request.allowHypotheses === true,
    businessPermissionRequired: true,
    explicitBusinessPermission,
    publicProjectionUsed: false,
    mutationAllowed: false,
  };
}

function normalizeQuery(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function matchesQuery(item: GraphItem | KnowledgeGraphEdge, query: string) {
  if (!query) return true;
  const fields = [
    "label" in item ? item.label : "",
    "summary" in item ? item.summary : "",
    "nodeType" in item ? item.nodeType : "",
    "relationType" in item ? item.relationType : "",
    item.verificationStatus,
    item.vaultType,
    "sourceTable" in item ? item.sourceTable : asRecord(item.provenance).sourceTable,
    sourceTypeLabel("sourceTable" in item ? item.sourceTable : asRecord(item.provenance).sourceTable),
  ];
  return fields.some((field) => String(field || "").toLowerCase().includes(query));
}

function addBlocked(blocked: Record<string, number>, reason: string) {
  blocked[reason] = (blocked[reason] || 0) + 1;
}

function sanitizeForGraphContext(value: unknown, kind: AgentGraphKnowledgeStatus) {
  const output = sanitizeMemoryOutput(value || "", {
    redactContactInfo: true,
    behavioralHintOnly: kind === "pattern",
  });
  const hasSecretRedaction = output.redactions.some((redaction) => SECRET_REDACTIONS.has(redaction));
  return {
    content: output.content.replace(/\s+/g, " ").trim().slice(0, 420),
    redactions: output.redactions,
    hasSecretRedaction,
  };
}

function provenanceSummary(item: GraphItem) {
  const provenance = asRecord(item.provenance);
  const source = sourceTypeLabel(item.sourceTable || provenance.sourceTable);
  return `${source}; confidence ${Math.round(clamp01(item.confidence) * 100)}%; status ${item.verificationStatus}; raw source identifiers withheld.`;
}

function statusKnowledgeType(status: string, hypothesesAllowed: boolean): AgentGraphKnowledgeStatus | null {
  if (FACT_STATUSES.has(status)) return "fact";
  if (HYPOTHESIS_STATUSES.has(status)) return hypothesesAllowed ? "hypothesis" : null;
  return null;
}

function evaluateGraphItemAccess(item: GraphItem, policy: AgentGraphAccessPolicySummary): PolicyDecision {
  const vaultType = item.vaultType || "unknown";
  const sensitivity = item.sensitivity || "unknown";
  const memorySensitivity = sensitivity === "low" ? "public" : sensitivity;
  const metadata = asRecord(item.metadata);
  const memoryDecision = memoryAccessPolicyService.evaluate({
    vaultType,
    sensitivity: memorySensitivity,
    context: "business_task",
    explicitUserPermission: policy.explicitBusinessPermission,
    sourceType: "knowledge_source",
  });

  if (vaultType === "unknown" || sensitivity === "unknown" || memoryDecision.vaultType === "unknown" || memoryDecision.sensitivity === "unknown") {
    return { allowed: false, reason: "unknown_classification_blocked", knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: [] };
  }

  if (vaultType === "personal" || sensitivity === "private" || sensitivity === "secret") {
    return { allowed: false, reason: "personal_private_or_secret_blocked", knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: [] };
  }

  if (BLOCKED_STATUSES.has(item.verificationStatus)) {
    return { allowed: false, reason: "unsafe_verification_status_blocked", knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: [] };
  }

  if (item.confidence < policy.minimumConfidence) {
    return { allowed: false, reason: "below_minimum_confidence", knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: [] };
  }

  if (vaultType === "business" || sensitivity === "restricted") {
    if (!policy.explicitBusinessPermission) {
      return { allowed: false, reason: "business_or_restricted_requires_permission", knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: [] };
    }
  }

  if ((vaultType === "behavioral" || sensitivity === "internal") && policy.requesterType === "user_agent") {
    return { allowed: false, reason: "user_agent_internal_pattern_denied", knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: [] };
  }

  if (!memoryDecision.allowed) {
    return { allowed: false, reason: memoryDecision.reason, knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: [] };
  }

  const patternOnly = vaultType === "behavioral" || sensitivity === "internal";
  const knowledgeStatus = patternOnly
    ? "pattern"
    : statusKnowledgeType(item.verificationStatus, policy.hypothesesAllowed);

  if (!knowledgeStatus) {
    return { allowed: false, reason: "hypothesis_not_allowed", knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: [] };
  }

  if (metadata.rawMemoryContentStored === true || metadata.containsPrivateMemory === true || metadata.privateMemoryInvolved === true) {
    return { allowed: false, reason: "raw_private_memory_marker_blocked", knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: [] };
  }

  const safeText = sanitizeForGraphContext(item.summary || item.label || "Graph context available.", knowledgeStatus);
  if (safeText.hasSecretRedaction) {
    return { allowed: false, reason: "secret_or_credential_marker_blocked", knowledgeStatus: null, safeSummary: null, provenanceSummary: provenanceSummary(item), redactions: safeText.redactions };
  }

  return {
    allowed: true,
    reason: knowledgeStatus === "hypothesis"
      ? "Allowed as hypothesis only; not treated as fact."
      : knowledgeStatus === "pattern"
        ? "Allowed as sanitized internal pattern signal."
        : "Allowed as policy-approved graph fact.",
    knowledgeStatus,
    safeSummary: safeText.content || null,
    provenanceSummary: provenanceSummary(item),
    redactions: safeText.redactions,
  };
}

function relevanceScore(item: GraphItem | KnowledgeGraphEdge, query: string) {
  const text = [
    "label" in item ? item.label : "",
    "summary" in item ? item.summary : "",
    "nodeType" in item ? item.nodeType : "",
    "relationType" in item ? item.relationType : "",
    item.verificationStatus,
    item.vaultType,
  ].join(" ").toLowerCase();
  let score = clamp01(item.confidence);
  if (query && text.includes(query)) score += 1;
  if (FACT_STATUSES.has(item.verificationStatus)) score += 0.5;
  return score;
}

function summarizeAllowedVaults(policy: AgentGraphAccessPolicySummary) {
  return [...new Set(policy.allowedVaults)];
}

function summarizeAllowedSensitivity(policy: AgentGraphAccessPolicySummary) {
  return [...new Set(policy.allowedSensitivity)];
}

function toContextNode(node: KnowledgeGraphNode, decision: PolicyDecision): AgentGraphContextNode {
  return {
    id: referenceId("node", node.nodeKey),
    nodeType: node.nodeType,
    label: sanitizeForGraphContext(node.label, decision.knowledgeStatus || "hypothesis").content || "Graph node",
    safeSummary: decision.safeSummary,
    confidence: node.confidence,
    verificationStatus: node.verificationStatus,
    vaultType: node.vaultType,
    sensitivity: node.sensitivity,
    knowledgeStatus: decision.knowledgeStatus || "hypothesis",
    provenanceSummary: decision.provenanceSummary,
    sourceType: sourceTypeLabel(node.sourceTable),
  };
}

function toContextEdge(edge: KnowledgeGraphEdge, decision: PolicyDecision): AgentGraphContextEdge {
  return {
    id: referenceId("edge", edge.edgeKey),
    sourceId: referenceId("node", edge.sourceNodeKey),
    targetId: referenceId("node", edge.targetNodeKey),
    relationType: edge.relationType,
    confidence: edge.confidence,
    verificationStatus: edge.verificationStatus,
    vaultType: edge.vaultType,
    sensitivity: edge.sensitivity,
    knowledgeStatus: decision.knowledgeStatus || "hypothesis",
    provenanceSummary: decision.provenanceSummary,
    sourceType: sourceTypeLabel(asRecord(edge.provenance).sourceTable),
  };
}

function deterministicChecks(policy: AgentGraphAccessPolicySummary): AgentGraphAccessResult["deterministicChecks"] {
  const publicDecision = evaluateGraphItemAccess({
    confidence: 1,
    verificationStatus: "verified",
    vaultType: "verified",
    sensitivity: "public",
    label: "Verified public claim",
    summary: "Evidence-backed public knowledge.",
    sourceTable: "reality_claims",
    provenance: {},
    metadata: {},
  }, policy);
  const evidenceDecision = evaluateGraphItemAccess({
    confidence: 1,
    verificationStatus: "supported",
    vaultType: "public",
    sensitivity: "public",
    label: "Claim evidence relation",
    summary: "Evidence supports a claim.",
    sourceTable: "claim_evidence",
    provenance: {},
    metadata: {},
  }, policy);
  const privateDecision = evaluateGraphItemAccess({
    confidence: 0.99,
    verificationStatus: "verified",
    vaultType: "personal",
    sensitivity: "private",
    label: "Personal memory",
    summary: "Private user memory.",
    sourceTable: "agent_memory",
    provenance: {},
    metadata: {},
  }, policy);
  const businessDecision = evaluateGraphItemAccess({
    confidence: 0.9,
    verificationStatus: "approved",
    vaultType: "business",
    sensitivity: "restricted",
    label: "Business knowledge",
    summary: "Restricted business graph context.",
    sourceTable: "agent_knowledge_sources",
    provenance: {},
    metadata: {},
  }, { ...policy, explicitBusinessPermission: false });
  const unknownDecision = evaluateGraphItemAccess({
    confidence: 0.9,
    verificationStatus: "approved",
    vaultType: "unknown",
    sensitivity: "unknown",
    label: "Unknown graph row",
    summary: "Unknown classification.",
    sourceTable: "unknown",
    provenance: {},
    metadata: {},
  }, policy);
  const hypothesisPolicy = { ...policy, hypothesesAllowed: true };
  const hypothesisDecision = evaluateGraphItemAccess({
    confidence: Math.max(policy.minimumConfidence, 0.75),
    verificationStatus: "unverified",
    vaultType: "public",
    sensitivity: "public",
    label: "Unverified graph item",
    summary: "Unverified material for hypothesis handling.",
    sourceTable: "claims",
    provenance: {},
    metadata: {},
  }, hypothesisPolicy);

  return {
    publicVerifiedAllowed: {
      passed: publicDecision.allowed && publicDecision.knowledgeStatus === "fact",
      expected: "allowed fact",
      actual: publicDecision.allowed ? `allowed ${publicDecision.knowledgeStatus}` : `blocked ${publicDecision.reason}`,
      explanation: "Public/verified graph context should be shareable internally when confidence and status pass policy.",
    },
    claimEvidenceAllowed: {
      passed: evidenceDecision.allowed && evidenceDecision.knowledgeStatus === "fact",
      expected: "allowed fact",
      actual: evidenceDecision.allowed ? `allowed ${evidenceDecision.knowledgeStatus}` : `blocked ${evidenceDecision.reason}`,
      explanation: "Verified claim/evidence relationships should be available for internal evidence validation.",
    },
    privateBlocked: {
      passed: !privateDecision.allowed,
      expected: "blocked",
      actual: privateDecision.allowed ? "allowed" : "blocked",
      explanation: "Private/personal graph material must never be returned to agent graph context.",
    },
    businessBlockedWithoutPermission: {
      passed: !businessDecision.allowed,
      expected: "blocked",
      actual: businessDecision.allowed ? "allowed" : "blocked",
      explanation: "Business/restricted graph context requires explicit permission.",
    },
    unknownBlocked: {
      passed: !unknownDecision.allowed,
      expected: "blocked",
      actual: unknownDecision.allowed ? "allowed" : "blocked",
      explanation: "Unknown vault or sensitivity classifications are denied by default.",
    },
    unverifiedLabeledHypothesis: {
      passed: hypothesisDecision.allowed && hypothesisDecision.knowledgeStatus === "hypothesis",
      expected: "hypothesis",
      actual: hypothesisDecision.allowed ? String(hypothesisDecision.knowledgeStatus) : `blocked ${hypothesisDecision.reason}`,
      explanation: "Unverified content can be returned only as hypothesis when the request explicitly allows hypotheses.",
    },
  };
}

async function resolveRequester(request: AgentGraphAccessRequest): Promise<ResolvedRequester> {
  if (request.requesterType === "root_admin") {
    return { validated: true, role: "super_admin", systemAgent: false, userAgent: false };
  }

  if (!request.requesterAgentId?.trim()) {
    throw new AgentGraphAccessError(400, "requesterAgentId is required for agent requesters");
  }

  if (request.requesterType === "system_agent") {
    const [identity] = await db.select().from(agentIdentities).where(eq(agentIdentities.agentId, request.requesterAgentId)).limit(1);
    const strategyProfile = asRecord(identity?.strategyProfile);
    if (!identity || strategyProfile.systemAgent !== true || strategyProfile.enabled === false) {
      throw new AgentGraphAccessError(404, "Enabled system agent identity not found");
    }
    return {
      validated: true,
      role: typeof strategyProfile.role === "string" ? strategyProfile.role : null,
      systemAgent: true,
      userAgent: false,
    };
  }

  const [agent] = await db.select().from(userAgents).where(eq(userAgents.id, request.requesterAgentId)).limit(1);
  if (!agent) {
    throw new AgentGraphAccessError(404, "User-owned agent not found");
  }
  return {
    validated: true,
    role: agent.roleSlug || agent.type || "user_agent",
    systemAgent: false,
    userAgent: true,
  };
}

class AgentGraphAccessService {
  async retrieveRelevantGraphContext(request: AgentGraphAccessRequest): Promise<AgentGraphAccessResult> {
    const requester = await resolveRequester(request);
    const policy = resolvePolicy(request);
    const limit = clampLimit(request.limit);
    const query = normalizeQuery(request.query);
    const blockedByReason: Record<string, number> = {};

    const [nodeRows, edgeRows, ues] = await Promise.all([
      db.select().from(knowledgeGraphNodes).orderBy(desc(knowledgeGraphNodes.updatedAt)).limit(2000),
      db.select().from(knowledgeGraphEdges).orderBy(desc(knowledgeGraphEdges.updatedAt)).limit(3000),
      request.requesterAgentId
        ? unifiedEvolutionService.getAgentUes(request.requesterAgentId).catch(() => null)
        : Promise.resolve(null),
    ]);

    const evaluatedNodes = nodeRows
      .filter((node) => matchesQuery(node, query))
      .map((node) => ({ node, decision: evaluateGraphItemAccess(node, policy) }));

    for (const item of evaluatedNodes) {
      if (!item.decision.allowed) addBlocked(blockedByReason, item.decision.reason);
    }

    const allowedNodes = evaluatedNodes
      .filter((item): item is { node: KnowledgeGraphNode; decision: PolicyDecision & { allowed: true } } => item.decision.allowed)
      .sort((a, b) => relevanceScore(b.node, query) - relevanceScore(a.node, query))
      .slice(0, limit);

    const allowedNodeKeys = new Set(allowedNodes.map(({ node }) => node.nodeKey));
    const evaluatedEdges = edgeRows
      .filter((edge) => matchesQuery(edge, query) || allowedNodeKeys.has(edge.sourceNodeKey) || allowedNodeKeys.has(edge.targetNodeKey))
      .map((edge) => {
        const decision = evaluateGraphItemAccess({
          ...edge,
          sourceTable: asRecord(edge.provenance).sourceTable || edge.relationType,
          label: edge.relationType,
          summary: `${edge.relationType} relationship`,
        }, policy);
        if (decision.allowed && (!allowedNodeKeys.has(edge.sourceNodeKey) || !allowedNodeKeys.has(edge.targetNodeKey))) {
          return { edge, decision: { ...decision, allowed: false, reason: "connected_node_not_policy_approved" } as PolicyDecision };
        }
        return { edge, decision };
      });

    for (const item of evaluatedEdges) {
      if (!item.decision.allowed) addBlocked(blockedByReason, item.decision.reason);
    }

    const allowedEdges = evaluatedEdges
      .filter((item): item is { edge: KnowledgeGraphEdge; decision: PolicyDecision & { allowed: true } } => item.decision.allowed)
      .sort((a, b) => relevanceScore(b.edge, query) - relevanceScore(a.edge, query))
      .slice(0, limit);

    const explanations = [
      "Internal graph access uses policy-aware retrieval and does not use the Phase 24 public-safe projection filter.",
      "Returned context preserves confidence, verification status, and provenance summaries while withholding raw source identifiers.",
      policy.hypothesesAllowed
        ? "Unverified material may appear only as hypothesis, never fact."
        : "Unverified material is blocked because hypotheses are not allowed for this request.",
      policy.explicitBusinessPermission
        ? "Business/restricted material may be returned only as sanitized summaries for this request."
        : "Business/restricted material is blocked without explicit permission.",
      requester.userAgent ? "User-owned agent requester uses a stricter confidence floor and cannot access internal pattern rows." : "System/root requester may use sanitized internal pattern signals.",
    ];

    return {
      generatedAt: new Date().toISOString(),
      requester: {
        type: request.requesterType,
        agentId: request.requesterAgentId || null,
        validated: requester.validated,
        role: requester.role,
        systemAgent: requester.systemAgent,
        userAgent: requester.userAgent,
        ues: {
          available: !!ues,
          score: ues?.scores.UES ?? null,
          sourceQuality: ues?.sourceQuality.overall ?? null,
        },
      },
      policy: {
        ...policy,
        allowedVaults: summarizeAllowedVaults(policy),
        allowedSensitivity: summarizeAllowedSensitivity(policy),
      },
      context: {
        nodes: allowedNodes.map(({ node, decision }) => toContextNode(node, decision)),
        edges: allowedEdges.map(({ edge, decision }) => toContextEdge(edge, decision)),
      },
      blockedCounts: {
        total: Object.values(blockedByReason).reduce((sum, value) => sum + value, 0),
        byReason: blockedByReason,
      },
      explanations,
      deterministicChecks: deterministicChecks(policy),
      safeguards: {
        internalOnly: true,
        rootAdminTestOnly: true,
        noPublicApi: true,
        noPublicProjectionFilter: true,
        noRawPrivateMemory: true,
        noRawBusinessRestrictedMemory: true,
        noGraphMutation: true,
        noAutonomousLearning: true,
      },
    };
  }
}

export const agentGraphAccessService = new AgentGraphAccessService();
