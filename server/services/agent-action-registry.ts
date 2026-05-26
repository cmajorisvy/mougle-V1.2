export const agentActionTypes = [
  "stay_idle",
  "research_topic",
  "post_message",
  "comment_on_post",
  "attach_claim",
  "attach_evidence",
  "join_debate",
  "challenge_claim",
  "summarize_debate",
  "generate_news_script",
  "collaborate_agent",
  "ask_user_approval",
  "request_admin_review",
] as const;

export type AgentActionType = typeof agentActionTypes[number];
export type AgentExecutionMode = "log_only" | "simulate_only" | "blocked_in_mvp";

export type AgentActionDefinition = {
  type: AgentActionType;
  label: string;
  description: string;
  requiredPermissions: string[];
  baseRisk: number;
  allowedRisk: number;
  baseCost: number;
  maxCost: number;
  executionMode: AgentExecutionMode;
  publicWrite: boolean;
  requiresAdminReview?: boolean;
  defaultMetrics: {
    goalAlignment: number;
    trustImpact: number;
    userValue: number;
    rewardPotential: number;
  };
};

export const AGENT_ACTION_REGISTRY: Record<AgentActionType, AgentActionDefinition> = {
  stay_idle: {
    type: "stay_idle",
    label: "Stay Idle",
    description: "Take no external action and record that the safest choice was to wait.",
    requiredPermissions: [],
    baseRisk: 0,
    allowedRisk: 1,
    baseCost: 0,
    maxCost: 0.05,
    executionMode: "log_only",
    publicWrite: false,
    defaultMetrics: { goalAlignment: 0.5, trustImpact: 0.2, userValue: 0.2, rewardPotential: 0.1 },
  },
  research_topic: {
    type: "research_topic",
    label: "Research Topic",
    description: "Prepare a private research direction for later review without publishing.",
    requiredPermissions: [
      "canResearchTechnology",
      "canValidateEvidence",
      "canAnalyzeLogic",
      "canProvideContext",
      "canAnalyzeEconomics",
      "canReviewGovernance",
      "canFlagRisk",
      "canGenerateSpecs",
      "canStressTest",
      "canDebate",
    ],
    baseRisk: 0.12,
    allowedRisk: 0.55,
    baseCost: 0.22,
    maxCost: 0.6,
    executionMode: "simulate_only",
    publicWrite: false,
    defaultMetrics: { goalAlignment: 0.68, trustImpact: 0.45, userValue: 0.55, rewardPotential: 0.28 },
  },
  post_message: {
    type: "post_message",
    label: "Post Message",
    description: "Public message publishing is blocked in the MVP and must go through later approval paths.",
    requiredPermissions: ["canPost"],
    baseRisk: 0.55,
    allowedRisk: 0.25,
    baseCost: 0.28,
    maxCost: 0.45,
    executionMode: "blocked_in_mvp",
    publicWrite: true,
    requiresAdminReview: true,
    defaultMetrics: { goalAlignment: 0.52, trustImpact: 0.2, userValue: 0.42, rewardPotential: 0.35 },
  },
  comment_on_post: {
    type: "comment_on_post",
    label: "Comment On Post",
    description: "Public comment publishing is blocked in the MVP and must go through later approval paths.",
    requiredPermissions: ["canPost", "canDebate"],
    baseRisk: 0.45,
    allowedRisk: 0.3,
    baseCost: 0.18,
    maxCost: 0.35,
    executionMode: "blocked_in_mvp",
    publicWrite: true,
    requiresAdminReview: true,
    defaultMetrics: { goalAlignment: 0.5, trustImpact: 0.25, userValue: 0.38, rewardPotential: 0.28 },
  },
  attach_claim: {
    type: "attach_claim",
    label: "Attach Claim",
    description: "Claim attachment changes public knowledge state, so it is blocked in this MVP.",
    requiredPermissions: ["canValidateEvidence", "canAnalyzeLogic", "canDebate"],
    baseRisk: 0.42,
    allowedRisk: 0.3,
    baseCost: 0.2,
    maxCost: 0.4,
    executionMode: "blocked_in_mvp",
    publicWrite: true,
    requiresAdminReview: true,
    defaultMetrics: { goalAlignment: 0.58, trustImpact: 0.35, userValue: 0.45, rewardPotential: 0.25 },
  },
  attach_evidence: {
    type: "attach_evidence",
    label: "Attach Evidence",
    description: "Evidence attachment can be evaluated but not published by this MVP.",
    requiredPermissions: ["canValidateEvidence"],
    baseRisk: 0.3,
    allowedRisk: 0.35,
    baseCost: 0.22,
    maxCost: 0.45,
    executionMode: "simulate_only",
    publicWrite: true,
    requiresAdminReview: true,
    defaultMetrics: { goalAlignment: 0.7, trustImpact: 0.5, userValue: 0.48, rewardPotential: 0.22 },
  },
  join_debate: {
    type: "join_debate",
    label: "Join Debate",
    description: "Debate participation is simulated only until approval and turn controls are built.",
    requiredPermissions: ["canDebate"],
    baseRisk: 0.28,
    allowedRisk: 0.4,
    baseCost: 0.24,
    maxCost: 0.5,
    executionMode: "simulate_only",
    publicWrite: true,
    requiresAdminReview: true,
    defaultMetrics: { goalAlignment: 0.62, trustImpact: 0.32, userValue: 0.5, rewardPotential: 0.32 },
  },
  challenge_claim: {
    type: "challenge_claim",
    label: "Challenge Claim",
    description: "Claim challenges are simulated only because they can affect public debate state.",
    requiredPermissions: ["canDebate", "canStressTest", "canAnalyzeLogic"],
    baseRisk: 0.36,
    allowedRisk: 0.34,
    baseCost: 0.2,
    maxCost: 0.45,
    executionMode: "simulate_only",
    publicWrite: true,
    requiresAdminReview: true,
    defaultMetrics: { goalAlignment: 0.6, trustImpact: 0.35, userValue: 0.42, rewardPotential: 0.25 },
  },
  summarize_debate: {
    type: "summarize_debate",
    label: "Summarize Debate",
    description: "Generate an internal summary proposal without publishing.",
    requiredPermissions: ["canDebate", "canPresentValidatedNews", "canAnalyzeLogic", "canProvideContext"],
    baseRisk: 0.18,
    allowedRisk: 0.45,
    baseCost: 0.25,
    maxCost: 0.55,
    executionMode: "simulate_only",
    publicWrite: false,
    defaultMetrics: { goalAlignment: 0.66, trustImpact: 0.42, userValue: 0.55, rewardPotential: 0.22 },
  },
  generate_news_script: {
    type: "generate_news_script",
    label: "Generate News Script",
    description: "Draft a private script proposal for later editorial review.",
    requiredPermissions: ["canPresentValidatedNews"],
    baseRisk: 0.25,
    allowedRisk: 0.4,
    baseCost: 0.32,
    maxCost: 0.65,
    executionMode: "simulate_only",
    publicWrite: false,
    requiresAdminReview: true,
    defaultMetrics: { goalAlignment: 0.66, trustImpact: 0.38, userValue: 0.52, rewardPotential: 0.3 },
  },
  collaborate_agent: {
    type: "collaborate_agent",
    label: "Collaborate With Agent",
    description: "Simulate an internal collaboration request without dispatching autonomous work.",
    requiredPermissions: ["canDebate", "canResearchTechnology", "canGenerateSpecs", "canReviewGovernance", "canFlagRisk"],
    baseRisk: 0.22,
    allowedRisk: 0.45,
    baseCost: 0.2,
    maxCost: 0.5,
    executionMode: "simulate_only",
    publicWrite: false,
    defaultMetrics: { goalAlignment: 0.6, trustImpact: 0.35, userValue: 0.42, rewardPotential: 0.35 },
  },
  ask_user_approval: {
    type: "ask_user_approval",
    label: "Ask User Approval",
    description: "Record that the agent should ask the affected user before any real action.",
    requiredPermissions: [],
    baseRisk: 0.05,
    allowedRisk: 0.6,
    baseCost: 0.05,
    maxCost: 0.2,
    executionMode: "log_only",
    publicWrite: false,
    defaultMetrics: { goalAlignment: 0.55, trustImpact: 0.5, userValue: 0.45, rewardPotential: 0.12 },
  },
  request_admin_review: {
    type: "request_admin_review",
    label: "Request Admin Review",
    description: "Escalate the proposed action for founder/admin inspection.",
    requiredPermissions: [],
    baseRisk: 0.04,
    allowedRisk: 0.7,
    baseCost: 0.05,
    maxCost: 0.2,
    executionMode: "log_only",
    publicWrite: false,
    defaultMetrics: { goalAlignment: 0.58, trustImpact: 0.55, userValue: 0.5, rewardPotential: 0.1 },
  },
};

export function getAgentActionDefinition(type: AgentActionType) {
  return AGENT_ACTION_REGISTRY[type];
}

export function isAgentActionType(value: unknown): value is AgentActionType {
  return typeof value === "string" && agentActionTypes.includes(value as AgentActionType);
}
