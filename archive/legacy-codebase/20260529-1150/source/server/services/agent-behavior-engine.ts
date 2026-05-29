import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { agentDnaMutationHistory, agentTrustProfiles, type AgentGenome, type AgentIdentity, type AgentLearningProfile, type AgentMemory, type AgentTrustProfile, type User } from "@shared/schema";
import { getAgentActionDefinition, type AgentActionDefinition, type AgentActionType } from "./agent-action-registry";
import { agentGraphAccessService, type AgentGraphAccessPurpose, type AgentGraphAccessResult } from "./agent-graph-access-service";
import { knowledgeEconomyService, type KnowledgePacketReasoningContextResult } from "./knowledge-economy-service";
import { memoryAccessPolicyService, runPrivateMemoryBlockCheck, type MemoryScope } from "./memory-access-policy";

type BehaviorMetricInput = {
  goalAlignment?: number;
  trustImpact?: number;
  userValue?: number;
  rewardPotential?: number;
  risk?: number;
  cost?: number;
};

export type AgentBehaviorSimulationInput = {
  agentId: string;
  actionType?: AgentActionType;
  event?: {
    type?: string;
    topic?: string;
    targetId?: string;
    content?: string;
  };
  metrics?: BehaviorMetricInput;
  costBudget?: number;
  memoryScope?: MemoryScope;
  allowPrivateMemory?: boolean;
  includeGraphContext?: boolean;
  graphQuery?: string;
  graphPurpose?: AgentGraphAccessPurpose;
  graphAllowHypotheses?: boolean;
  graphExplicitBusinessPermission?: boolean;
  graphMinimumConfidence?: number;
  includeKnowledgePacketContext?: boolean;
  knowledgePacketQuery?: string;
  knowledgePacketAllowHypotheses?: boolean;
  knowledgePacketExplicitBusinessPermission?: boolean;
  knowledgePacketMinimumConfidence?: number;
  knowledgePacketLimit?: number;
};

type ScoreInputs = Required<BehaviorMetricInput>;

type PolicyCheck = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

type DecisionStatus = "approved" | "blocked" | "request_admin_review";

export type AgentBehaviorSimulationResult = {
  agent: {
    id: string;
    username: string;
    displayName: string;
    role: string | null;
    enabled: boolean;
  };
  event: {
    type: string;
    topic: string | null;
    targetId: string | null;
    content: string | null;
  };
  context: {
    identityLoaded: boolean;
    genomeLoaded: boolean;
    learningProfileLoaded: boolean;
    trustProfileLoaded: boolean;
    memoryScope: MemoryScope;
    memoryAccessAllowed: boolean;
    memoriesRetrieved: number;
    privateMemoryRequested: boolean;
    memoryDeniedCount: number;
    policyExplanations: string[];
    sanitizerRedactions: string[];
  };
  proposedAction: {
    type: AgentActionType;
    label: string;
    description: string;
    executionMode: AgentActionDefinition["executionMode"];
    publicWrite: boolean;
  };
  scoring: {
    formula: string;
    threshold: number;
    inputs: ScoreInputs;
    score: number;
  };
  policyChecks: PolicyCheck[];
  decision: {
    status: DecisionStatus;
    reason: string;
    executable: boolean;
    executionMode: AgentActionDefinition["executionMode"];
  };
  outcomeLog: {
    id: string | null;
    actionType: string;
  };
  graphContext: {
    enabled: boolean;
    nodesRetrieved: number;
    edgesRetrieved: number;
    blockedCounts: AgentGraphAccessResult["blockedCounts"];
    policy: AgentGraphAccessResult["policy"] | null;
    explanations: string[];
    deterministicChecks: AgentGraphAccessResult["deterministicChecks"] | null;
  };
  knowledgePacketContext: {
    enabled: boolean;
    knowledgePacketsConsidered: number;
    knowledgePacketsUsed: number;
    packetRankingReasons: string[];
    blockedPacketCounts: KnowledgePacketReasoningContextResult["blockedCounts"];
    policy: KnowledgePacketReasoningContextResult["policy"] | null;
    packets: KnowledgePacketReasoningContextResult["context"]["packets"];
    simulatedGluonSignals: Array<{
      packetId: string;
      title: string;
      amount: number;
      normalized: number;
      weightedAcceptance: number;
      nonConvertible: true;
      rankingOnly: true;
    }>;
    hypothesisItems: Array<{
      packetId: string;
      title: string;
      reason: string;
    }>;
    blockedItems: {
      total: number;
      byReason: Record<string, number>;
    };
    explanations: string[];
    deterministicChecks: KnowledgePacketReasoningContextResult["deterministicChecks"] | null;
  };
  dnaContext: {
    enabled: boolean;
    primeColorSignature: Record<string, any>;
    knowledgeDomains: string[];
    behaviorStyle: Record<string, number | string>;
    trustEconomicGenome: Record<string, number | string | boolean>;
    dnaMetadata: Record<string, any>;
    mutationHistorySummary: {
      totalRecent: number;
      preview: number;
      applied: number;
      rejected: number;
      latestPreviewAt: string | null;
    };
    mutationPreviewOnly: true;
    liveGenomeMutated: false;
    oldEvolutionServiceTriggered: false;
    explanations: string[];
  };
  reasoningTraceSummary: {
    graphContextUsed: boolean;
    knowledgePacketContextUsed: boolean;
    dnaContextUsed: boolean;
    reasoningInputsUsed: string[];
    safetyGatesApplied: string[];
    noMutationConfirmation: {
      graphMutation: false;
      packetMutation: false;
      dnaMutationApply: false;
      gluonAward: false;
      walletOrPayout: false;
      autonomousExecution: false;
      publicPublishing: false;
    };
  };
  blockedUnsafeActionCheck: {
    passed: boolean;
    actionType: AgentActionType;
    expected: DecisionStatus;
    actual: DecisionStatus;
    reason: string;
  };
  privateMemoryBlockCheck: {
    passed: boolean;
    vaultType: "personal";
    sensitivity: "private";
    context: "public_debate";
    expected: string;
    actual: string;
    reason: string;
  };
};

const SCORE_THRESHOLD = 0.45;
const DEFAULT_COST_BUDGET = 0.55;

class AgentBehaviorEngineError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeEvent(event: AgentBehaviorSimulationInput["event"]) {
  return {
    type: event?.type?.trim() || "admin_behavior_simulation",
    topic: event?.topic?.trim() || null,
    targetId: event?.targetId?.trim() || null,
    content: event?.content?.trim() || null,
  };
}

function normalizeMetrics(action: AgentActionDefinition, metrics?: BehaviorMetricInput): ScoreInputs {
  return {
    goalAlignment: clamp01(metrics?.goalAlignment ?? action.defaultMetrics.goalAlignment),
    trustImpact: clamp01(metrics?.trustImpact ?? action.defaultMetrics.trustImpact),
    userValue: clamp01(metrics?.userValue ?? action.defaultMetrics.userValue),
    rewardPotential: clamp01(metrics?.rewardPotential ?? action.defaultMetrics.rewardPotential),
    risk: clamp01(metrics?.risk ?? action.baseRisk),
    cost: clamp01(metrics?.cost ?? action.baseCost),
  };
}

export function calculateAgentActionScore(input: ScoreInputs) {
  return roundScore(clamp01(
    0.30 * input.goalAlignment
    + 0.25 * input.trustImpact
    + 0.15 * input.userValue
    + 0.15 * input.rewardPotential
    - 0.20 * input.risk
    - 0.15 * input.cost
  ));
}

function resolveAgentEnabled(identity: AgentIdentity | null) {
  const strategyProfile = asRecord(identity?.strategyProfile);
  return strategyProfile.systemAgent === true && strategyProfile.enabled !== false;
}

function resolvePermissions(identity: AgentIdentity | null) {
  const strategyProfile = asRecord(identity?.strategyProfile);
  const rawPermissions = asRecord(strategyProfile.permissions);
  return Object.fromEntries(
    Object.entries(rawPermissions).filter(([, value]) => value === true)
  ) as Record<string, boolean>;
}

function hasActionPermission(action: AgentActionDefinition, permissions: Record<string, boolean>) {
  if (action.requiredPermissions.length === 0) return true;
  return action.requiredPermissions.some((permission) => permissions[permission] === true);
}

function evaluatePolicy({
  action,
  agentEnabled,
  permissionAllowed,
  memoryAccessAllowed,
  score,
  metrics,
  costBudget,
}: {
  action: AgentActionDefinition;
  agentEnabled: boolean;
  permissionAllowed: boolean;
  memoryAccessAllowed: boolean;
  score: number;
  metrics: ScoreInputs;
  costBudget: number;
}) {
  const effectiveCostLimit = Math.min(action.maxCost, costBudget);
  const checks: PolicyCheck[] = [
    {
      key: "agent_enabled",
      label: "Agent enabled",
      passed: agentEnabled,
      detail: agentEnabled ? "System agent is enabled." : "System agent is disabled or not a seeded system identity.",
    },
    {
      key: "permission_allowed",
      label: "Permission allowed",
      passed: permissionAllowed,
      detail: permissionAllowed
        ? "Agent has at least one required permission for this action."
        : `Requires one of: ${action.requiredPermissions.join(", ") || "none"}.`,
    },
    {
      key: "risk_limit",
      label: "Risk within limit",
      passed: metrics.risk <= action.allowedRisk,
      detail: `Risk ${roundScore(metrics.risk)} must be <= allowed risk ${roundScore(action.allowedRisk)}.`,
    },
    {
      key: "cost_limit",
      label: "Cost within budget",
      passed: metrics.cost <= effectiveCostLimit,
      detail: `Cost ${roundScore(metrics.cost)} must be <= budget ${roundScore(effectiveCostLimit)}.`,
    },
    {
      key: "memory_context_allowed",
      label: "Memory/context allowed",
      passed: memoryAccessAllowed,
      detail: memoryAccessAllowed ? "Requested memory scope is allowed." : "Private memory access is not allowed for this request.",
    },
    {
      key: "mvp_execution_mode",
      label: "MVP execution mode",
      passed: action.executionMode !== "blocked_in_mvp",
      detail: action.executionMode === "blocked_in_mvp"
        ? "This action is intentionally blocked in the MVP."
        : `This action is ${action.executionMode.replace("_", " ")} in the MVP.`,
    },
  ];

  const failedChecks = checks.filter((check) => !check.passed);
  if (failedChecks.length > 0) {
    return {
      checks,
      status: "blocked" as DecisionStatus,
      reason: failedChecks.map((check) => check.label).join(", "),
    };
  }

  if (score < SCORE_THRESHOLD || action.requiresAdminReview) {
    return {
      checks,
      status: "request_admin_review" as DecisionStatus,
      reason: action.requiresAdminReview
        ? "Action requires admin review before any real execution."
        : `Score ${score} is below approval threshold ${SCORE_THRESHOLD}.`,
    };
  }

  return {
    checks,
    status: "approved" as DecisionStatus,
    reason: "All policy checks passed for the fixed MVP action path.",
  };
}

function proposeAction(input: AgentBehaviorSimulationInput): AgentActionType {
  return input.actionType || "stay_idle";
}

function graphPurposeForAction(action: AgentActionDefinition): AgentGraphAccessPurpose {
  if (["attach_claim", "attach_evidence", "challenge_claim"].includes(action.type)) return "evidence_validation";
  if (["join_debate", "summarize_debate"].includes(action.type)) return "debate_preparation";
  if (action.type === "generate_news_script") return "media_script_review";
  if (action.type === "collaborate_agent") return "synthesis";
  return "reasoning";
}

async function loadAgentContext(agentId: string) {
  const [user, identity, genome, learningProfile] = await Promise.all([
    storage.getUser(agentId),
    storage.getAgentIdentity(agentId),
    storage.getAgentGenome(agentId),
    storage.getLearningProfile(agentId),
  ]);

  const [trustProfile] = await db.select().from(agentTrustProfiles).where(eq(agentTrustProfiles.agentId, agentId));

  return {
    user: user || null,
    identity: identity || null,
    genome: genome || null,
    learningProfile: learningProfile || null,
    trustProfile: trustProfile || null,
  };
}

async function retrievePermittedMemory(
  agentId: string,
  scope: MemoryScope,
  explicitUserPermission: boolean,
) {
  return memoryAccessPolicyService.getPolicyCheckedAgentMemories({
    agentId,
    context: "agent_behavior",
    scope,
    limit: 5,
    explicitUserPermission,
  });
}

async function buildDnaContext(agentId: string, genome: AgentGenome | null, identity: AgentIdentity | null): Promise<AgentBehaviorSimulationResult["dnaContext"]> {
  const strategyProfile = asRecord(identity?.strategyProfile);
  const dnaMetadata = asRecord(genome?.dnaMetadata);
  const mutationRows = await db.select().from(agentDnaMutationHistory)
    .where(eq(agentDnaMutationHistory.agentId, agentId))
    .orderBy(desc(agentDnaMutationHistory.createdAt))
    .limit(20);
  const countByStatus = (status: string) => mutationRows.filter((row) => row.status === status).length;
  const knowledgeDomains = [
    ...(Array.isArray(strategyProfile.domains) ? strategyProfile.domains : []),
    ...(Array.isArray(strategyProfile.domainTags) ? strategyProfile.domainTags : []),
    ...(Array.isArray(dnaMetadata.knowledgeDomains) ? dnaMetadata.knowledgeDomains : []),
  ].filter((item): item is string => typeof item === "string" && !!item.trim());

  return {
    enabled: true,
    primeColorSignature: asRecord(genome?.primeColorSignature),
    knowledgeDomains: [...new Set(knowledgeDomains)].slice(0, 12),
    behaviorStyle: {
      curiosity: roundScore(genome?.curiosity ?? 0.5),
      riskTolerance: roundScore(genome?.riskTolerance ?? 0.5),
      collaborationBias: roundScore(genome?.collaborationBias ?? 0.5),
      verificationStrictness: roundScore(genome?.verificationStrictness ?? 0.5),
      longTermFocus: roundScore(genome?.longTermFocus ?? 0.5),
      economicStrategy: genome?.economicStrategy || "balanced",
    },
    trustEconomicGenome: {
      fitnessScore: roundScore(genome?.fitnessScore ?? 0),
      generation: genome?.generation ?? 0,
      mutations: genome?.mutations ?? 0,
      liveEvolutionEnabled: false,
    },
    dnaMetadata,
    mutationHistorySummary: {
      totalRecent: mutationRows.length,
      preview: countByStatus("preview"),
      applied: countByStatus("applied"),
      rejected: countByStatus("rejected"),
      latestPreviewAt: mutationRows.find((row) => row.status === "preview")?.createdAt?.toISOString?.() || null,
    },
    mutationPreviewOnly: true,
    liveGenomeMutated: false,
    oldEvolutionServiceTriggered: false,
    explanations: [
      "Agent DNA context is read-only in this simulation.",
      "Prime color, behavior style, and mutation history summarize identity without applying mutations.",
      "DNA mutation remains preview/admin-controlled; no evolution or reproduction service is triggered.",
    ],
  };
}

function buildKnowledgePacketContext(packetAccess: KnowledgePacketReasoningContextResult | null): AgentBehaviorSimulationResult["knowledgePacketContext"] {
  if (!packetAccess) {
    return {
      enabled: false,
      knowledgePacketsConsidered: 0,
      knowledgePacketsUsed: 0,
      packetRankingReasons: [],
      blockedPacketCounts: { total: 0, byReason: {} },
      policy: null,
      packets: [],
      simulatedGluonSignals: [],
      hypothesisItems: [],
      blockedItems: { total: 0, byReason: {} },
      explanations: ["Knowledge Packet reasoning context was not requested for this simulation."],
      deterministicChecks: null,
    };
  }

  return {
    enabled: true,
    knowledgePacketsConsidered: packetAccess.context.packets.length + packetAccess.blockedCounts.total,
    knowledgePacketsUsed: packetAccess.context.packets.length,
    packetRankingReasons: packetAccess.ranking.signals,
    blockedPacketCounts: packetAccess.blockedCounts,
    policy: packetAccess.policy,
    packets: packetAccess.context.packets,
    simulatedGluonSignals: packetAccess.context.packets.map((packet) => ({
      packetId: packet.id,
      title: packet.title,
      amount: packet.gluonSignal.amount,
      normalized: packet.gluonSignal.normalized,
      weightedAcceptance: packet.weightedAcceptance,
      nonConvertible: true,
      rankingOnly: true,
    })),
    hypothesisItems: packetAccess.context.packets
      .filter((packet) => packet.knowledgeStatus === "hypothesis")
      .map((packet) => ({
        packetId: packet.id,
        title: packet.title,
        reason: "Included as hypothesis only; not treated as verified fact.",
      })),
    blockedItems: packetAccess.blockedCounts,
    explanations: packetAccess.explanations,
    deterministicChecks: packetAccess.deterministicChecks,
  };
}

function buildReasoningTraceSummary(input: {
  graphContext: AgentBehaviorSimulationResult["graphContext"];
  knowledgePacketContext: AgentBehaviorSimulationResult["knowledgePacketContext"];
  dnaContext: AgentBehaviorSimulationResult["dnaContext"];
}) {
  const reasoningInputsUsed = [
    "policy-checked memory summary",
    input.graphContext.enabled ? "internal policy-aware graph context" : null,
    input.knowledgePacketContext.enabled ? "Knowledge Packet reasoning context" : null,
    input.dnaContext.enabled ? "read-only Agent DNA context" : null,
    input.knowledgePacketContext.simulatedGluonSignals.length > 0 ? "non-convertible Gluon ranking signals" : null,
  ].filter((item): item is string => !!item);

  return {
    graphContextUsed: input.graphContext.enabled,
    knowledgePacketContextUsed: input.knowledgePacketContext.enabled,
    dnaContextUsed: input.dnaContext.enabled,
    reasoningInputsUsed,
    safetyGatesApplied: [
      "root-admin simulation endpoint only",
      "internal graph access policy, not public projection filter",
      "memory vault and sensitivity checks",
      "Knowledge Packet consent and safety checks",
      "business/restricted permission checks",
      "hypothesis-vs-fact labeling",
      "Gluon read as ranking signal only",
      "DNA context read-only with mutation preview disabled",
    ],
    noMutationConfirmation: {
      graphMutation: false as const,
      packetMutation: false as const,
      dnaMutationApply: false as const,
      gluonAward: false as const,
      walletOrPayout: false as const,
      autonomousExecution: false as const,
      publicPublishing: false as const,
    },
  };
}

function buildLogDetails(input: {
  event: AgentBehaviorSimulationResult["event"];
  context: AgentBehaviorSimulationResult["context"];
  proposedAction: AgentBehaviorSimulationResult["proposedAction"];
  scoring: AgentBehaviorSimulationResult["scoring"];
  policyChecks: PolicyCheck[];
  decision: AgentBehaviorSimulationResult["decision"];
  graphContext: AgentBehaviorSimulationResult["graphContext"];
  knowledgePacketContext: AgentBehaviorSimulationResult["knowledgePacketContext"];
  dnaContext: AgentBehaviorSimulationResult["dnaContext"];
  reasoningTraceSummary: AgentBehaviorSimulationResult["reasoningTraceSummary"];
}) {
  return JSON.stringify({
    phase: "phase_26_agent_reasoning_knowledge_packets",
    event: input.event,
    context: input.context,
    proposedAction: input.proposedAction,
    scoring: input.scoring,
    policyChecks: input.policyChecks,
    decision: input.decision,
    graphContext: input.graphContext,
    knowledgePacketContext: {
      enabled: input.knowledgePacketContext.enabled,
      knowledgePacketsUsed: input.knowledgePacketContext.knowledgePacketsUsed,
      blockedPacketCounts: input.knowledgePacketContext.blockedPacketCounts,
      simulatedGluonSignals: input.knowledgePacketContext.simulatedGluonSignals,
    },
    dnaContext: {
      enabled: input.dnaContext.enabled,
      mutationPreviewOnly: input.dnaContext.mutationPreviewOnly,
      liveGenomeMutated: input.dnaContext.liveGenomeMutated,
    },
    reasoningTraceSummary: input.reasoningTraceSummary,
    safety: {
      autonomousExecution: false,
      directLlmExecution: false,
      publicPublishing: false,
      graphContextReadOnly: input.graphContext.enabled,
      knowledgePacketContextReadOnly: input.knowledgePacketContext.enabled,
      dnaContextReadOnly: input.dnaContext.enabled,
      gluonAwarded: false,
      walletOrPayoutTouched: false,
    },
  });
}

function serializeAgent(user: User, identity: AgentIdentity | null, enabled: boolean) {
  const strategyProfile = asRecord(identity?.strategyProfile);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: typeof strategyProfile.role === "string" ? strategyProfile.role : user.agentDescription,
    enabled,
  };
}

function buildContextSummary(input: {
  identity: AgentIdentity | null;
  genome: AgentGenome | null;
  learningProfile: AgentLearningProfile | null;
  trustProfile: AgentTrustProfile | null;
  memoryScope: AgentBehaviorSimulationResult["context"]["memoryScope"];
  memoryAccessAllowed: boolean;
  memories: AgentMemory[];
  memoryDeniedCount: number;
  policyExplanations: string[];
  sanitizerRedactions: string[];
}) {
  return {
    identityLoaded: !!input.identity,
    genomeLoaded: !!input.genome,
    learningProfileLoaded: !!input.learningProfile,
    trustProfileLoaded: !!input.trustProfile,
    memoryScope: input.memoryScope,
    memoryAccessAllowed: input.memoryAccessAllowed,
    memoriesRetrieved: input.memories.length,
    privateMemoryRequested: input.memoryScope === "private",
    memoryDeniedCount: input.memoryDeniedCount,
    policyExplanations: input.policyExplanations,
    sanitizerRedactions: input.sanitizerRedactions,
  };
}

export function runBlockedUnsafeActionCheck() {
  const action = getAgentActionDefinition("post_message");
  const metrics = normalizeMetrics(action, { risk: 0.95, cost: 0.2, goalAlignment: 1, trustImpact: 1, userValue: 1, rewardPotential: 1 });
  const score = calculateAgentActionScore(metrics);
  const policy = evaluatePolicy({
    action,
    agentEnabled: true,
    permissionAllowed: true,
    memoryAccessAllowed: true,
    score,
    metrics,
    costBudget: 1,
  });

  return {
    passed: policy.status === "blocked",
    actionType: action.type,
    expected: "blocked" as DecisionStatus,
    actual: policy.status,
    reason: policy.reason,
  };
}

export async function simulateAgentBehaviorDecision(input: AgentBehaviorSimulationInput): Promise<AgentBehaviorSimulationResult> {
  const agentId = input.agentId.trim();
  if (!agentId) {
    throw new AgentBehaviorEngineError(400, "agentId is required");
  }

  const { user, identity, genome, learningProfile, trustProfile } = await loadAgentContext(agentId);
  if (!user || user.role !== "agent") {
    throw new AgentBehaviorEngineError(404, "System agent not found");
  }

  const action = getAgentActionDefinition(proposeAction(input));
  const event = normalizeEvent(input.event);
  const permissions = resolvePermissions(identity);
  const agentEnabled = resolveAgentEnabled(identity);
  const permissionAllowed = hasActionPermission(action, permissions);
  const memoryScope = input.memoryScope || "behavioral";
  const memoryPolicy = await retrievePermittedMemory(agentId, memoryScope, input.allowPrivateMemory === true);
  const graphAccess = input.includeGraphContext
    ? await agentGraphAccessService.retrieveRelevantGraphContext({
      requesterType: "system_agent",
      requesterAgentId: agentId,
      purpose: input.graphPurpose || graphPurposeForAction(action),
      query: input.graphQuery || event.topic || event.content || action.label,
      limit: 6,
      allowHypotheses: input.graphAllowHypotheses === true,
      explicitBusinessPermission: input.graphExplicitBusinessPermission === true,
      minimumConfidence: input.graphMinimumConfidence,
    })
    : null;
  const graphContext: AgentBehaviorSimulationResult["graphContext"] = graphAccess
    ? {
      enabled: true,
      nodesRetrieved: graphAccess.context.nodes.length,
      edgesRetrieved: graphAccess.context.edges.length,
      blockedCounts: graphAccess.blockedCounts,
      policy: graphAccess.policy,
      explanations: graphAccess.explanations,
      deterministicChecks: graphAccess.deterministicChecks,
    }
    : {
      enabled: false,
      nodesRetrieved: 0,
      edgesRetrieved: 0,
      blockedCounts: { total: 0, byReason: {} },
      policy: null,
      explanations: ["Internal graph context retrieval was not requested for this simulation."],
      deterministicChecks: null,
    };
  const packetAccess = input.includeKnowledgePacketContext
    ? await knowledgeEconomyService.retrieveReasoningPacketContext({
      requesterType: "system_agent",
      requesterAgentId: agentId,
      query: input.knowledgePacketQuery || event.topic || event.content || input.graphQuery || action.label,
      limit: input.knowledgePacketLimit || 6,
      allowHypotheses: input.knowledgePacketAllowHypotheses === true,
      explicitBusinessPermission: input.knowledgePacketExplicitBusinessPermission === true,
      minimumConfidence: input.knowledgePacketMinimumConfidence,
    })
    : null;
  const knowledgePacketContext = buildKnowledgePacketContext(packetAccess);
  const dnaContext = await buildDnaContext(agentId, genome, identity);
  const reasoningTraceSummary = buildReasoningTraceSummary({ graphContext, knowledgePacketContext, dnaContext });
  const memories = memoryPolicy.records;
  const memoryAccessAllowed = memoryPolicy.requestAllowed;
  const context = buildContextSummary({
    identity,
    genome,
    learningProfile,
    trustProfile,
    memoryScope,
    memoryAccessAllowed,
    memories,
    memoryDeniedCount: memoryPolicy.deniedCount,
    policyExplanations: memoryPolicy.explanations,
    sanitizerRedactions: memoryPolicy.redactions,
  });
  const metrics = normalizeMetrics(action, input.metrics);
  const score = calculateAgentActionScore(metrics);
  const costBudget = clamp01(input.costBudget ?? DEFAULT_COST_BUDGET);
  const policy = evaluatePolicy({
    action,
    agentEnabled,
    permissionAllowed,
    memoryAccessAllowed,
    score,
    metrics,
    costBudget,
  });
  const proposedAction = {
    type: action.type,
    label: action.label,
    description: action.description,
    executionMode: action.executionMode,
    publicWrite: action.publicWrite,
  };
  const scoring = {
    formula: "0.30*goal_alignment + 0.25*trust_impact + 0.15*user_value + 0.15*reward_potential - 0.20*risk - 0.15*cost",
    threshold: SCORE_THRESHOLD,
    inputs: metrics,
    score,
  };
  const decision = {
    status: policy.status,
    reason: policy.reason,
    executable: policy.status === "approved" && action.executionMode === "log_only",
    executionMode: action.executionMode,
  };

  const details = buildLogDetails({
    event,
    context,
    proposedAction,
    scoring,
    policyChecks: policy.checks,
    decision,
    graphContext,
    knowledgePacketContext,
    dnaContext,
    reasoningTraceSummary,
  });
  const activity = await storage.createAgentActivity({
    agentId,
    postId: event.targetId,
    actionType: `behavior_${action.type}_${decision.status}`,
    details,
    relevanceScore: score,
  });

  return {
    agent: serializeAgent(user, identity, agentEnabled),
    event,
    context,
    proposedAction,
    scoring,
    policyChecks: policy.checks,
    decision,
    outcomeLog: {
      id: activity.id,
      actionType: activity.actionType,
    },
    graphContext,
    knowledgePacketContext,
    dnaContext,
    reasoningTraceSummary,
    blockedUnsafeActionCheck: runBlockedUnsafeActionCheck(),
    privateMemoryBlockCheck: runPrivateMemoryBlockCheck(),
  };
}
