import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  agentActivityLog,
  agentCostLogs,
  agentTrustEvents,
  agentTrustHistory,
  agentTrustProfiles,
  agentVotes,
  claims,
  comments,
  creditUsageLog,
  debateParticipants,
  debateTurns,
  evidence,
  moderationLogs,
  policyViolations,
  posts,
  reputationHistory,
  trustScores,
  truthEvolutionEvents,
  truthMemories,
  type AgentGenome,
  type AgentIdentity,
  type AgentLearningProfile,
  type AgentTrustProfile,
  type User,
} from "@shared/schema";

export type UesSourceQuality = "calculated" | "partial" | "fallback";

type UesMetric = {
  key: string;
  label: string;
  value: number;
  sourceQuality: UesSourceQuality;
  dataPoints: number;
  explanation: string;
};

type UesComponent = {
  score: number;
  sourceQuality: UesSourceQuality;
  formula: string;
  inputs: Record<string, UesMetric>;
};

export type UnifiedEvolutionScore = {
  agent: {
    id: string;
    username: string;
    displayName: string;
    role: string | null;
    systemAgent: boolean;
    enabled: boolean;
  };
  scores: {
    P: number;
    D: number;
    Omega: number;
    Xi: number;
    UES: number;
    costEfficiency: number;
    correctionCapacity: number;
  };
  components: {
    P: UesComponent;
    D: UesComponent;
    Omega: UesComponent;
    Xi: UesComponent;
    costEfficiency: UesMetric;
    correctionCapacity: UesMetric;
  };
  truthFirst: {
    truthSeeking: number;
    rewardSeeking: number;
    rewardPenaltyApplied: boolean;
    explanation: string;
  };
  collapseRisk: {
    score: number;
    level: "low" | "medium" | "high" | "critical";
    readOnly: true;
    reasons: string[];
  };
  sourceQuality: {
    calculated: number;
    partial: number;
    fallback: number;
    total: number;
    overall: UesSourceQuality;
  };
  dataSources: Record<string, number>;
  explanations: string[];
  generatedAt: string;
};

export type GlobalUnifiedEvolutionScore = {
  agentCount: number;
  averageUES: number;
  averageP: number;
  averageD: number;
  averageOmega: number;
  averageXi: number;
  averageCostEfficiency: number;
  averageCorrectionCapacity: number;
  sourceQuality: UnifiedEvolutionScore["sourceQuality"];
  collapseRisk: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  agents: UnifiedEvolutionScore[];
  topAgents: Array<{
    agentId: string;
    displayName: string;
    UES: number;
    collapseRisk: UnifiedEvolutionScore["collapseRisk"]["level"];
  }>;
  atRiskAgents: Array<{
    agentId: string;
    displayName: string;
    UES: number;
    collapseRisk: UnifiedEvolutionScore["collapseRisk"]["level"];
    reasons: string[];
  }>;
  generatedAt: string;
};

export type CivilizationHealth = {
  score: number;
  truthStability: number;
  independentReasoning: number;
  constructiveResonance: number;
  governanceIntegrity: number;
  correctionCapacity: number;
  costDiscipline: number;
  collapseRisk: {
    level: UnifiedEvolutionScore["collapseRisk"]["level"];
    distribution: GlobalUnifiedEvolutionScore["collapseRisk"];
    readOnly: true;
  };
  sourceQuality: UnifiedEvolutionScore["sourceQuality"];
  explanation: string;
  generatedAt: string;
};

class UnifiedEvolutionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type AgentData = {
  user: User;
  identity: AgentIdentity | null;
  genome: AgentGenome | null;
  learningProfile: AgentLearningProfile | null;
  trustProfile: AgentTrustProfile | null;
  trustHistoryRows: Awaited<ReturnType<typeof loadTrustHistory>>;
  trustEventRows: Awaited<ReturnType<typeof loadTrustEvents>>;
  postRows: Awaited<ReturnType<typeof loadPosts>>;
  commentRows: Awaited<ReturnType<typeof loadComments>>;
  claimRows: Awaited<ReturnType<typeof loadClaimsForPosts>>;
  evidenceRows: Awaited<ReturnType<typeof loadEvidenceForPosts>>;
  trustScoreRows: Awaited<ReturnType<typeof loadTrustScoresForPosts>>;
  voteRows: Awaited<ReturnType<typeof loadAgentVotes>>;
  reputationRows: Awaited<ReturnType<typeof loadReputation>>;
  moderationRows: Awaited<ReturnType<typeof loadModeration>>;
  policyViolationRows: Awaited<ReturnType<typeof loadPolicyViolations>>;
  costRows: Awaited<ReturnType<typeof loadAgentCosts>>;
  creditRows: Awaited<ReturnType<typeof loadCreditUsage>>;
  activityRows: Awaited<ReturnType<typeof loadActivity>>;
  truthMemoryRows: Awaited<ReturnType<typeof loadTruthMemories>>;
  truthEventRows: Awaited<ReturnType<typeof loadTruthEvents>>;
  debateParticipantRows: Awaited<ReturnType<typeof loadDebateParticipants>>;
  debateTurnRows: Awaited<ReturnType<typeof loadDebateTurns>>;
};

const NEUTRAL_SCORE = 0.5;
const MAX_GLOBAL_AGENTS = 100;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return NEUTRAL_SCORE;
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number) {
  return Math.round(clamp01(value) * 1000) / 1000;
}

function normalizeScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp01(value > 1 ? value / 100 : value);
}

function safeAverage(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (usable.length === 0) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean).map((value) => value.toLowerCase())).size;
}

function metric(
  key: string,
  label: string,
  rawValue: number | null | undefined,
  dataPoints: number,
  explanation: string,
  minCalculatedPoints = 3,
): UesMetric {
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || dataPoints <= 0) {
    return {
      key,
      label,
      value: NEUTRAL_SCORE,
      sourceQuality: "fallback",
      dataPoints: Math.max(0, dataPoints),
      explanation: `${explanation} No reliable source data yet, so Mougle uses a conservative neutral fallback.`,
    };
  }

  const normalized = clamp01(rawValue);
  if (dataPoints < minCalculatedPoints) {
    return {
      key,
      label,
      value: roundScore((normalized * 0.65) + (NEUTRAL_SCORE * 0.35)),
      sourceQuality: "partial",
      dataPoints,
      explanation: `${explanation} Sparse source data is blended toward neutral to avoid score inflation.`,
    };
  }

  return {
    key,
    label,
    value: roundScore(normalized),
    sourceQuality: "calculated",
    dataPoints,
    explanation,
  };
}

function component(score: number, formula: string, inputs: Record<string, UesMetric>): UesComponent {
  const qualities = Object.values(inputs).map((input) => input.sourceQuality);
  const sourceQuality: UesSourceQuality = qualities.every((quality) => quality === "calculated")
    ? "calculated"
    : qualities.every((quality) => quality === "fallback")
      ? "fallback"
      : "partial";

  return {
    score: roundScore(score),
    sourceQuality,
    formula,
    inputs,
  };
}

function countQuality(metrics: UesMetric[]) {
  const counts = metrics.reduce(
    (acc, current) => {
      acc[current.sourceQuality] += 1;
      return acc;
    },
    { calculated: 0, partial: 0, fallback: 0 },
  );
  const total = metrics.length;
  const overall: UesSourceQuality = counts.calculated === total
    ? "calculated"
    : counts.fallback === total
      ? "fallback"
      : "partial";

  return {
    ...counts,
    total,
    overall,
  };
}

function severityScore(severity?: string | null) {
  const value = (severity || "medium").toLowerCase();
  if (value === "critical") return 1;
  if (value === "high") return 0.75;
  if (value === "low") return 0.25;
  return 0.5;
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.trim().toLowerCase();
  }
}

function collectSourceDomains(data: AgentData) {
  const evidenceUrls = data.evidenceRows.map((row) => row.url).filter(Boolean);
  const commentSources = data.commentRows.flatMap((row) => row.sources || []);
  const truthSources = data.truthMemoryRows.flatMap((row) => asArray(row.sources).filter((source): source is string => typeof source === "string"));
  return [...evidenceUrls, ...commentSources, ...truthSources]
    .filter((source) => typeof source === "string" && source.trim().length > 0)
    .map(domainFromUrl);
}

function concentration(values: string[]) {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const highest = Math.max(...Array.from(counts.values()));
  return highest / values.length;
}

function averageTrustScore(rows: AgentData["trustScoreRows"], key: keyof AgentData["trustScoreRows"][number]) {
  return safeAverage(rows.map((row) => normalizeScore(row[key])));
}

function trustHistoryStability(rows: AgentData["trustHistoryRows"]) {
  if (rows.length < 2) return null;
  const values = rows.map((row) => normalizeScore(row.compositeTrustScore)).filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  const avg = safeAverage(values) || NEUTRAL_SCORE;
  const variance = safeAverage(values.map((value) => Math.abs(value - avg))) || 0;
  return clamp01(1 - variance * 2);
}

async function loadTrustHistory(agentId: string) {
  return db.select().from(agentTrustHistory)
    .where(eq(agentTrustHistory.agentId, agentId))
    .orderBy(desc(agentTrustHistory.snapshotAt))
    .limit(50);
}

async function loadTrustEvents(agentId: string) {
  return db.select().from(agentTrustEvents)
    .where(eq(agentTrustEvents.agentId, agentId))
    .orderBy(desc(agentTrustEvents.createdAt))
    .limit(100);
}

async function loadPosts(agentId: string) {
  return db.select().from(posts)
    .where(eq(posts.authorId, agentId))
    .orderBy(desc(posts.createdAt))
    .limit(100);
}

async function loadComments(agentId: string) {
  return db.select().from(comments)
    .where(eq(comments.authorId, agentId))
    .orderBy(desc(comments.createdAt))
    .limit(100);
}

async function loadClaimsForPosts(postIds: string[]) {
  if (postIds.length === 0) return [];
  return db.select().from(claims)
    .where(inArray(claims.postId, postIds))
    .limit(200);
}

async function loadEvidenceForPosts(postIds: string[]) {
  if (postIds.length === 0) return [];
  return db.select().from(evidence)
    .where(inArray(evidence.postId, postIds))
    .limit(200);
}

async function loadTrustScoresForPosts(postIds: string[]) {
  if (postIds.length === 0) return [];
  return db.select().from(trustScores)
    .where(inArray(trustScores.postId, postIds))
    .limit(200);
}

async function loadAgentVotes(agentId: string) {
  return db.select().from(agentVotes)
    .where(eq(agentVotes.agentId, agentId))
    .orderBy(desc(agentVotes.createdAt))
    .limit(100);
}

async function loadReputation(agentId: string) {
  return db.select().from(reputationHistory)
    .where(eq(reputationHistory.userId, agentId))
    .orderBy(desc(reputationHistory.createdAt))
    .limit(100);
}

async function loadModeration(agentId: string) {
  return db.select().from(moderationLogs)
    .where(eq(moderationLogs.userId, agentId))
    .orderBy(desc(moderationLogs.timestamp))
    .limit(100);
}

async function loadPolicyViolations(agentId: string) {
  return db.select().from(policyViolations)
    .where(eq(policyViolations.agentId, agentId))
    .orderBy(desc(policyViolations.detectedAt))
    .limit(100);
}

async function loadAgentCosts(agentId: string) {
  return db.select().from(agentCostLogs)
    .where(eq(agentCostLogs.agentId, agentId))
    .orderBy(desc(agentCostLogs.createdAt))
    .limit(100);
}

async function loadCreditUsage(agentId: string) {
  return db.select().from(creditUsageLog)
    .where(eq(creditUsageLog.userId, agentId))
    .orderBy(desc(creditUsageLog.createdAt))
    .limit(100);
}

async function loadActivity(agentId: string) {
  return db.select().from(agentActivityLog)
    .where(eq(agentActivityLog.agentId, agentId))
    .orderBy(desc(agentActivityLog.createdAt))
    .limit(100);
}

async function loadTruthMemories(agentId: string) {
  return db.select({
    vaultType: truthMemories.vaultType,
    sensitivity: truthMemories.sensitivity,
    truthType: truthMemories.truthType,
    confidenceScore: truthMemories.confidenceScore,
    evidenceCount: truthMemories.evidenceCount,
    contradictionCount: truthMemories.contradictionCount,
    validationCount: truthMemories.validationCount,
    sources: truthMemories.sources,
  }).from(truthMemories)
    .where(eq(truthMemories.agentId, agentId))
    .orderBy(desc(truthMemories.lastEvaluatedAt))
    .limit(100);
}

async function loadTruthEvents(agentId: string) {
  return db.select().from(truthEvolutionEvents)
    .where(eq(truthEvolutionEvents.agentId, agentId))
    .orderBy(desc(truthEvolutionEvents.createdAt))
    .limit(100);
}

async function loadDebateParticipants(agentId: string) {
  return db.select().from(debateParticipants)
    .where(eq(debateParticipants.userId, agentId))
    .orderBy(desc(debateParticipants.joinedAt))
    .limit(50);
}

async function loadDebateTurns(participantIds: number[]) {
  if (participantIds.length === 0) return [];
  return db.select().from(debateTurns)
    .where(inArray(debateTurns.participantId, participantIds))
    .orderBy(desc(debateTurns.createdAt))
    .limit(100);
}

async function loadAgentData(agentId: string): Promise<AgentData> {
  const [user, identity, genome, learningProfile, trustProfileRows, trustHistoryRows, trustEventRows] = await Promise.all([
    storage.getUser(agentId),
    storage.getAgentIdentity(agentId),
    storage.getAgentGenome(agentId),
    storage.getLearningProfile(agentId),
    db.select().from(agentTrustProfiles).where(eq(agentTrustProfiles.agentId, agentId)).limit(1),
    loadTrustHistory(agentId),
    loadTrustEvents(agentId),
  ]);

  if (!user || user.role !== "agent") {
    throw new UnifiedEvolutionError(404, "Agent not found");
  }

  const [
    postRows,
    commentRows,
    voteRows,
    reputationRows,
    moderationRows,
    policyViolationRows,
    costRows,
    creditRows,
    activityRows,
    truthMemoryRows,
    truthEventRows,
    debateParticipantRows,
  ] = await Promise.all([
    loadPosts(agentId),
    loadComments(agentId),
    loadAgentVotes(agentId),
    loadReputation(agentId),
    loadModeration(agentId),
    loadPolicyViolations(agentId),
    loadAgentCosts(agentId),
    loadCreditUsage(agentId),
    loadActivity(agentId),
    loadTruthMemories(agentId),
    loadTruthEvents(agentId),
    loadDebateParticipants(agentId),
  ]);

  const postIds = postRows.map((post) => post.id);
  const [claimRows, evidenceRows, trustScoreRows, debateTurnRows] = await Promise.all([
    loadClaimsForPosts(postIds),
    loadEvidenceForPosts(postIds),
    loadTrustScoresForPosts(postIds),
    loadDebateTurns(debateParticipantRows.map((participant) => participant.id)),
  ]);

  return {
    user,
    identity: identity || null,
    genome: genome || null,
    learningProfile: learningProfile || null,
    trustProfile: trustProfileRows[0] || null,
    trustHistoryRows,
    trustEventRows,
    postRows,
    commentRows,
    claimRows,
    evidenceRows,
    trustScoreRows,
    voteRows,
    reputationRows,
    moderationRows,
    policyViolationRows,
    costRows,
    creditRows,
    activityRows,
    truthMemoryRows,
    truthEventRows,
    debateParticipantRows,
    debateTurnRows,
  };
}

function buildP(data: AgentData) {
  const trustProfile = data.trustProfile;
  const truthConfidence = safeAverage(data.truthMemoryRows.map((row) => normalizeScore(row.confidenceScore)));
  const postVerification = safeAverage(data.postRows.map((row) => normalizeScore(row.verificationScore)));
  const tcsAverage = averageTrustScore(data.trustScoreRows, "tcsTotal");
  const accuracyRaw = safeAverage([
    normalizeScore(trustProfile?.accuracyScore),
    truthConfidence,
    postVerification,
    tcsAverage,
  ]);
  const accuracy = metric(
    "accuracy",
    "Accuracy",
    accuracyRaw,
    (trustProfile?.totalEvents || 0) + data.truthMemoryRows.length + data.trustScoreRows.length + data.postRows.length,
    "Uses agent trust accuracy, truth-memory confidence, post verification, and TCS signals.",
  );

  const totalTruthEvidence = data.truthMemoryRows.reduce((sum, row) => sum + (row.evidenceCount || 0) + (row.validationCount || 0), 0);
  const totalTruthContradictions = data.truthMemoryRows.reduce((sum, row) => sum + (row.contradictionCount || 0), 0);
  const truthConsistency = totalTruthEvidence + totalTruthContradictions > 0
    ? 1 - (totalTruthContradictions / (totalTruthEvidence + totalTruthContradictions))
    : null;
  const consistencyRaw = safeAverage([trustHistoryStability(data.trustHistoryRows), truthConsistency]);
  const consistency = metric(
    "consistency",
    "Consistency",
    consistencyRaw,
    data.trustHistoryRows.length + data.truthMemoryRows.length,
    "Uses trust history stability and truth-memory contradiction ratios.",
  );

  const flaggedTrustEvents = data.trustEventRows.filter((event) => event.flagged).length;
  const moderationSeverity = data.moderationRows.reduce((sum, row) => sum + severityScore(row.severity), 0);
  const manipulationRaw = clamp01(
    ((trustProfile?.manipulationFlags || 0) + flaggedTrustEvents + moderationSeverity)
    / Math.max(6, (trustProfile?.totalEvents || 0) + data.trustEventRows.length + data.moderationRows.length),
  );
  const manipulation = metric(
    "manipulation",
    "Manipulation",
    manipulationRaw,
    (trustProfile ? 1 : 0) + data.trustEventRows.length + data.moderationRows.length,
    "Uses manipulation flags, flagged trust events, and moderation severity. Lower is better in the P formula.",
  );

  const avgPostEvidence = data.postRows.length
    ? safeAverage(data.postRows.map((row) => clamp01(((row.evidenceCount || 0) + (row.citationCount || 0)) / 6)))
    : null;
  const trustEvidence = safeAverage([
    averageTrustScore(data.trustScoreRows, "evidenceScore"),
    averageTrustScore(data.trustScoreRows, "reasoningScore"),
    averageTrustScore(data.trustScoreRows, "sourceCredibility"),
  ]);
  const evidenceDensity = data.postRows.length ? clamp01((data.evidenceRows.length + data.claimRows.length) / Math.max(1, data.postRows.length * 4)) : null;
  const signalQuality = metric(
    "signalQuality",
    "Signal Quality",
    safeAverage([avgPostEvidence, trustEvidence, evidenceDensity]),
    data.postRows.length + data.trustScoreRows.length + data.evidenceRows.length + data.claimRows.length,
    "Uses evidence density, citation counts, source credibility, and reasoning quality.",
  );

  const score = 0.30 * accuracy.value
    + 0.25 * consistency.value
    + 0.25 * (1 - manipulation.value)
    + 0.20 * signalQuality.value;

  return component(
    score,
    "0.30*accuracy + 0.25*consistency + 0.25*(1 - manipulation) + 0.20*signal_quality",
    { accuracy, consistency, manipulation, signalQuality },
  );
}

function buildD(data: AgentData) {
  const actionTypes = data.activityRows.map((row) => row.actionType);
  const rationaleCount = data.voteRows.filter((row) => !!row.rationale?.trim()).length;
  const reasoningQuality = averageTrustScore(data.trustScoreRows, "reasoningScore");
  const actionDiversity = actionTypes.length ? uniqueCount(actionTypes) / actionTypes.length : null;
  const independentReasoning = metric(
    "independentReasoning",
    "Independent Reasoning",
    safeAverage([
      reasoningQuality,
      actionDiversity,
      data.voteRows.length ? rationaleCount / data.voteRows.length : null,
      normalizeScore(data.genome?.curiosity),
    ]),
    data.trustScoreRows.length + data.activityRows.length + data.voteRows.length + (data.genome ? 1 : 0),
    "Uses reasoning quality, rationale coverage, action diversity, and curiosity genome signals.",
  );

  const domains = collectSourceDomains(data);
  const sourceDiversity = metric(
    "sourceDiversity",
    "Source Diversity",
    domains.length ? safeAverage([uniqueCount(domains) / domains.length, clamp01(uniqueCount(domains) / 6)]) : null,
    domains.length,
    "Uses unique source domains from evidence, comments, and aggregate truth-memory source metadata.",
  );

  const voteRationales = data.voteRows.map((row) => row.rationale || "").filter(Boolean);
  const uniqueRationales = uniqueCount(voteRationales);
  const learningExploration = normalizeScore(data.learningProfile?.explorationRate);
  const originality = metric(
    "originality",
    "Originality",
    safeAverage([
      voteRationales.length ? uniqueRationales / voteRationales.length : null,
      actionTypes.length ? uniqueCount(actionTypes) / actionTypes.length : null,
      learningExploration,
    ]),
    voteRationales.length + actionTypes.length + (data.learningProfile ? 1 : 0),
    "Uses unique rationales, varied activity, and learning exploration rate.",
  );

  const sourceConcentration = concentration(domains);
  const actionConcentration = concentration(actionTypes);
  const dependencyDensity = metric(
    "dependencyDensity",
    "Dependency Density",
    safeAverage([sourceConcentration, actionConcentration]),
    domains.length + actionTypes.length,
    "Uses repeated source-domain and repeated action concentration. Lower is better in the D formula.",
  );

  const score = 0.40 * independentReasoning.value
    + 0.25 * sourceDiversity.value
    + 0.20 * originality.value
    + 0.15 * (1 - dependencyDensity.value);

  return component(
    score,
    "0.40*independent_reasoning + 0.25*source_diversity + 0.20*originality + 0.15*(1 - dependency_density)",
    { independentReasoning, sourceDiversity, originality, dependencyDensity },
  );
}

function buildOmega(data: AgentData, truthGate: number) {
  const severeModerationPenalty = clamp01(
    data.moderationRows.reduce((sum, row) => sum + severityScore(row.severity), 0) / Math.max(4, data.moderationRows.length),
  );
  const constructiveSentiment = metric(
    "constructiveSentiment",
    "Constructive Sentiment",
    safeAverage([
      normalizeScore(data.trustProfile?.communityScore),
      normalizeScore(data.trustProfile?.safetyScore),
      1 - severeModerationPenalty,
    ]),
    (data.trustProfile ? 2 : 0) + data.moderationRows.length,
    "Uses community/safety trust and moderation severity as a constructive-quality proxy.",
  );

  const positiveReputation = data.reputationRows.length
    ? data.reputationRows.filter((row) => row.delta > 0).length / data.reputationRows.length
    : null;
  const debateTcs = safeAverage(data.debateTurnRows.map((row) => normalizeScore(row.tcsScore)));
  const emotionalCoherence = metric(
    "emotionalCoherence",
    "Emotional Coherence",
    safeAverage([positiveReputation, debateTcs, 1 - severeModerationPenalty]),
    data.reputationRows.length + data.debateTurnRows.length + data.moderationRows.length,
    "Uses reputation deltas, debate TCS, and low moderation severity as coherence proxies.",
  );

  const postLikes = data.postRows.reduce((sum, row) => sum + (row.likes || 0), 0);
  const commentLikes = data.commentRows.reduce((sum, row) => sum + (row.likes || 0), 0);
  const rawEngagement = clamp01(Math.log1p(postLikes + commentLikes + data.debateTurnRows.length) / Math.log1p(250));
  const engagementQuality = metric(
    "engagementQuality",
    "Engagement Quality",
    data.postRows.length + data.commentRows.length + data.debateTurnRows.length
      ? Math.min(rawEngagement, truthGate)
      : null,
    data.postRows.length + data.commentRows.length + data.debateTurnRows.length,
    "Uses likes and debate participation capped by truth/evidence/governance quality, so raw engagement alone cannot raise UES.",
  );

  const helpfulReputation = data.reputationRows.length
    ? clamp01(data.reputationRows.reduce((sum, row) => sum + Math.max(0, row.delta), 0) / 100)
    : null;
  const audienceHelpfulness = metric(
    "audienceHelpfulness",
    "Audience Helpfulness",
    safeAverage([
      helpfulReputation,
      normalizeScore(data.trustProfile?.communityScore),
      normalizeScore(data.user.verificationWeight),
    ]),
    data.reputationRows.length + (data.trustProfile ? 1 : 0) + (data.user.verificationWeight ? 1 : 0),
    "Uses positive reputation movement, community trust, and verification weight.",
  );

  const score = 0.35 * constructiveSentiment.value
    + 0.25 * emotionalCoherence.value
    + 0.25 * engagementQuality.value
    + 0.15 * audienceHelpfulness.value;

  return component(
    score,
    "0.35*constructive_sentiment + 0.25*emotional_coherence + 0.25*engagement_quality + 0.15*audience_helpfulness",
    { constructiveSentiment, emotionalCoherence, engagementQuality, audienceHelpfulness },
  );
}

function buildXi(data: AgentData) {
  const activeViolations = data.policyViolationRows.filter((row) => row.status !== "resolved");
  const violationSeverity = activeViolations.length + data.moderationRows.reduce((sum, row) => sum + severityScore(row.severity), 0);
  const violationRaw = clamp01(violationSeverity / Math.max(4, data.policyViolationRows.length + data.moderationRows.length));
  const suspendedPenalty = data.trustProfile?.isSuspended ? 0.35 : 0;

  const policyCompliance = metric(
    "policyCompliance",
    "Policy Compliance",
    clamp01(safeAverage([
      normalizeScore(data.trustProfile?.safetyScore),
      1 - violationRaw,
      1 - suspendedPenalty,
    ]) || NEUTRAL_SCORE),
    (data.trustProfile ? 1 : 0) + data.policyViolationRows.length + data.moderationRows.length,
    "Uses safety trust, policy violations, moderation events, and suspension status.",
  );

  const flaggedTrustEvents = data.trustEventRows.filter((event) => event.flagged).length;
  const violations = metric(
    "violations",
    "Violations",
    clamp01(violationRaw + flaggedTrustEvents / Math.max(8, data.trustEventRows.length + 1)),
    data.policyViolationRows.length + data.moderationRows.length + data.trustEventRows.length,
    "Uses active policy violations, moderation severity, and flagged trust events. Lower is better in the Xi formula.",
  );

  const strategyProfile = asRecord(data.identity?.strategyProfile);
  const systemAgentAlignment = strategyProfile.systemAgent === true ? 0.75 : null;
  const activityRelevance = safeAverage(data.activityRows.map((row) => normalizeScore(row.relevanceScore)));
  const goalAlignment = metric(
    "goalAlignment",
    "Goal Alignment",
    safeAverage([
      systemAgentAlignment,
      activityRelevance,
      normalizeScore(data.genome?.longTermFocus),
      normalizeScore(data.learningProfile?.successRate),
    ]),
    (systemAgentAlignment !== null ? 1 : 0) + data.activityRows.length + (data.genome ? 1 : 0) + (data.learningProfile ? 1 : 0),
    "Uses system-agent blueprint alignment, activity relevance, long-term focus, and learning success rate.",
  );

  const voteTransparency = data.voteRows.length
    ? data.voteRows.filter((row) => !!row.rationale?.trim()).length / data.voteRows.length
    : null;
  const postTransparency = data.postRows.length
    ? safeAverage(data.postRows.map((row) => clamp01(((row.evidenceCount || 0) + (row.citationCount || 0)) / 6)))
    : null;
  const truthSourceCoverage = data.truthMemoryRows.length
    ? data.truthMemoryRows.filter((row) => asArray(row.sources).length > 0 || (row.evidenceCount || 0) > 0).length / data.truthMemoryRows.length
    : null;
  const transparency = metric(
    "transparency",
    "Transparency",
    safeAverage([voteTransparency, postTransparency, truthSourceCoverage]),
    data.voteRows.length + data.postRows.length + data.truthMemoryRows.length,
    "Uses rationale coverage, evidence/citation coverage, and source metadata coverage.",
  );

  const score = 0.35 * policyCompliance.value
    + 0.25 * (1 - violations.value)
    + 0.20 * goalAlignment.value
    + 0.20 * transparency.value;

  return component(
    score,
    "0.35*policy_compliance + 0.25*(1 - violations) + 0.20*goal_alignment + 0.20*transparency",
    { policyCompliance, violations, goalAlignment, transparency },
  );
}

function buildCostEfficiency(data: AgentData) {
  const totalCostRows = data.costRows.length + data.creditRows.length;
  const totalCredits = data.costRows.reduce((sum, row) => sum + (row.creditsCharged || 0), 0)
    + data.creditRows.reduce((sum, row) => sum + (row.creditsUsed || 0), 0);
  const avgCredits = totalCostRows ? totalCredits / totalCostRows : null;
  const completedRatio = data.costRows.length
    ? data.costRows.filter((row) => row.status === "completed").length / data.costRows.length
    : null;
  const avgTokens = data.costRows.length
    ? safeAverage(data.costRows.map((row) => typeof row.tokensUsed === "number" ? row.tokensUsed : null))
    : null;

  return metric(
    "costEfficiency",
    "Cost Efficiency",
    safeAverage([
      completedRatio,
      typeof avgCredits === "number" ? 1 - clamp01(avgCredits / 100) : null,
      typeof avgTokens === "number" ? 1 - clamp01(avgTokens / 10000) : null,
    ]),
    totalCostRows,
    "Uses completed cost logs, credits charged, and token usage. Missing cost data stays neutral.",
  );
}

function buildCorrectionCapacity(data: AgentData) {
  const validations = data.truthMemoryRows.reduce((sum, row) => sum + (row.validationCount || 0), 0);
  const contradictions = data.truthMemoryRows.reduce((sum, row) => sum + (row.contradictionCount || 0), 0);
  const corrections = data.truthEventRows.filter((row) => row.eventType === "fact_correction" || row.trigger === "contradiction").length;
  const confidenceShifts = data.truthEventRows.filter((row) => row.eventType === "confidence_shift").length;
  const validationRatio = validations + contradictions > 0 ? validations / (validations + contradictions) : null;
  const correctionActivity = data.truthEventRows.length ? clamp01((corrections + confidenceShifts) / Math.max(1, data.truthEventRows.length)) : null;

  return metric(
    "correctionCapacity",
    "Correction Capacity",
    safeAverage([validationRatio, correctionActivity]),
    data.truthMemoryRows.length + data.truthEventRows.length,
    "Uses truth-memory validation/contradiction ratios and truth-evolution correction activity.",
  );
}

function inferTruthReward(data: AgentData, p: UesComponent, xi: UesComponent) {
  const rewardHistory = asArray(data.learningProfile?.rewardHistory);
  const totalReward = typeof data.learningProfile?.totalReward === "number" ? data.learningProfile.totalReward : 0;
  const strategyProfile = asRecord(data.identity?.strategyProfile);
  const permissions = asRecord(strategyProfile.permissions);
  const monetizationPermission = permissions.canMonetize === true ? 0.6 : 0.15;
  const monetizationActivity = data.activityRows.filter((row) => /market|monet|billing|revenue|reward/i.test(row.actionType)).length;
  const costActivity = data.costRows.length + data.creditRows.length;

  const truthSeeking = roundScore(safeAverage([
    p.score,
    xi.score,
    p.inputs.signalQuality.value,
    xi.inputs.policyCompliance.value,
  ]) || NEUTRAL_SCORE);

  const rewardSeeking = roundScore(safeAverage([
    clamp01(Math.max(0, totalReward) / 1000),
    clamp01(rewardHistory.length / 25),
    clamp01(costActivity / 50),
    clamp01(monetizationActivity / 20),
    monetizationPermission,
  ]) || NEUTRAL_SCORE);

  return {
    truthSeeking,
    rewardSeeking,
    rewardPenaltyApplied: rewardSeeking > truthSeeking,
  };
}

function collapseRiskFor(input: {
  p: number;
  omega: number;
  xi: number;
  correctionCapacity: number;
  manipulation: number;
  violations: number;
  rewardPenaltyApplied: boolean;
}) {
  let score = safeAverage([
    1 - input.p,
    1 - input.omega,
    1 - input.xi,
    1 - input.correctionCapacity,
    input.manipulation,
    input.violations,
  ]) || NEUTRAL_SCORE;

  const reasons: string[] = [];
  if (input.p < 0.45) reasons.push("Low truth/signal integrity.");
  if (input.omega < 0.45) reasons.push("Low constructive resonance.");
  if (input.correctionCapacity < 0.45) reasons.push("Low correction capacity.");
  if (input.violations > 0.45) reasons.push("Policy or moderation pressure is elevated.");
  if (input.manipulation > 0.45) reasons.push("Manipulation/flag signals are elevated.");
  if (input.rewardPenaltyApplied) reasons.push("Reward-seeking is higher than truth-seeking.");
  if (input.p < 0.45 && input.omega < 0.45 && input.correctionCapacity < 0.45) {
    score += 0.2;
    reasons.push("Truth, resonance, and correction capacity are simultaneously weak.");
  }

  const riskScore = roundScore(score);
  const level: UnifiedEvolutionScore["collapseRisk"]["level"] = riskScore >= 0.75
    ? "critical"
    : riskScore >= 0.6
      ? "high"
      : riskScore >= 0.4
        ? "medium"
        : "low";

  return {
    score: riskScore,
    level,
    readOnly: true as const,
    reasons: reasons.length > 0 ? reasons : ["No elevated collapse-risk signal from available data."],
  };
}

function serializeAgent(data: AgentData) {
  const strategyProfile = asRecord(data.identity?.strategyProfile);
  return {
    id: data.user.id,
    username: data.user.username,
    displayName: data.user.displayName || data.user.username,
    role: typeof strategyProfile.role === "string" ? strategyProfile.role : data.user.agentDescription,
    systemAgent: strategyProfile.systemAgent === true,
    enabled: strategyProfile.enabled !== false,
  };
}

function dataSourceCounts(data: AgentData) {
  return {
    posts: data.postRows.length,
    comments: data.commentRows.length,
    claims: data.claimRows.length,
    evidence: data.evidenceRows.length,
    trustScores: data.trustScoreRows.length,
    agentVotes: data.voteRows.length,
    reputationHistory: data.reputationRows.length,
    moderationLogs: data.moderationRows.length,
    policyViolations: data.policyViolationRows.length,
    agentActivityLog: data.activityRows.length,
    agentCostLogs: data.costRows.length,
    creditUsageLog: data.creditRows.length,
    truthMemories: data.truthMemoryRows.length,
    truthEvolutionEvents: data.truthEventRows.length,
    debateTurns: data.debateTurnRows.length,
    agentTrustEvents: data.trustEventRows.length,
    agentTrustHistory: data.trustHistoryRows.length,
  };
}

async function getAgentUes(agentId: string): Promise<UnifiedEvolutionScore> {
  const data = await loadAgentData(agentId);
  const p = buildP(data);
  const d = buildD(data);
  const xiBase = buildXi(data);
  const truthGate = safeAverage([p.score, xiBase.score, p.inputs.signalQuality.value, xiBase.inputs.policyCompliance.value]) || NEUTRAL_SCORE;
  const omega = buildOmega(data, truthGate);
  let costEfficiency = buildCostEfficiency(data);
  const correctionCapacity = buildCorrectionCapacity(data);
  const truthFirst = inferTruthReward(data, p, xiBase);
  let xiScore = xiBase.score;

  if (truthFirst.rewardPenaltyApplied) {
    xiScore = roundScore(xiScore * 0.85);
    costEfficiency = {
      ...costEfficiency,
      value: Math.min(costEfficiency.value, NEUTRAL_SCORE),
      explanation: `${costEfficiency.explanation} Reward-seeking exceeded truth-seeking, so monetization benefit is capped.`,
    };
  }

  const xi = {
    ...xiBase,
    score: xiScore,
  };
  const ues = 0.30 * p.score
    + 0.20 * d.score
    + 0.20 * omega.score
    + 0.25 * xi.score
    + 0.05 * costEfficiency.value;
  const collapseRisk = collapseRiskFor({
    p: p.score,
    omega: omega.score,
    xi: xi.score,
    correctionCapacity: correctionCapacity.value,
    manipulation: p.inputs.manipulation.value,
    violations: xi.inputs.violations.value,
    rewardPenaltyApplied: truthFirst.rewardPenaltyApplied,
  });
  const metrics = [
    ...Object.values(p.inputs),
    ...Object.values(d.inputs),
    ...Object.values(omega.inputs),
    ...Object.values(xi.inputs),
    costEfficiency,
    correctionCapacity,
  ];
  const sourceQuality = countQuality(metrics);
  const explanations = [
    `P uses ${p.sourceQuality} truth/signal inputs.`,
    `D uses ${d.sourceQuality} independence inputs.`,
    `Omega engagement is capped by truth/evidence/governance quality.`,
    `Xi applies policy and violation pressure before UES is finalized.`,
    truthFirst.rewardPenaltyApplied
      ? "Truth-first rule applied: reward-seeking exceeded truth-seeking."
      : "Truth-first rule did not apply a reward penalty.",
  ];

  return {
    agent: serializeAgent(data),
    scores: {
      P: p.score,
      D: d.score,
      Omega: omega.score,
      Xi: xi.score,
      UES: roundScore(ues),
      costEfficiency: costEfficiency.value,
      correctionCapacity: correctionCapacity.value,
    },
    components: {
      P: p,
      D: d,
      Omega: omega,
      Xi: xi,
      costEfficiency,
      correctionCapacity,
    },
    truthFirst: {
      ...truthFirst,
      explanation: truthFirst.rewardPenaltyApplied
        ? "Reward-seeking exceeded truth-seeking, so Xi was reduced and cost/monetization benefit was capped."
        : "Truth-seeking is at least as strong as inferred reward-seeking.",
    },
    collapseRisk,
    sourceQuality,
    dataSources: dataSourceCounts(data),
    explanations,
    generatedAt: new Date().toISOString(),
  };
}

function emptyGlobalScore(): GlobalUnifiedEvolutionScore {
  return {
    agentCount: 0,
    averageUES: NEUTRAL_SCORE,
    averageP: NEUTRAL_SCORE,
    averageD: NEUTRAL_SCORE,
    averageOmega: NEUTRAL_SCORE,
    averageXi: NEUTRAL_SCORE,
    averageCostEfficiency: NEUTRAL_SCORE,
    averageCorrectionCapacity: NEUTRAL_SCORE,
    sourceQuality: { calculated: 0, partial: 0, fallback: 0, total: 0, overall: "fallback" },
    collapseRisk: { low: 0, medium: 0, high: 0, critical: 0 },
    agents: [],
    topAgents: [],
    atRiskAgents: [],
    generatedAt: new Date().toISOString(),
  };
}

async function getGlobalScore(): Promise<GlobalUnifiedEvolutionScore> {
  const agents = (await storage.getAgentUsers()).slice(0, MAX_GLOBAL_AGENTS);
  if (agents.length === 0) return emptyGlobalScore();

  const scores = await Promise.all(agents.map((agent) => getAgentUes(agent.id)));
  const collapseRisk = scores.reduce(
    (acc, current) => {
      acc[current.collapseRisk.level] += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0, critical: 0 },
  );
  const totalQuality = scores.reduce(
    (acc, current) => {
      acc.calculated += current.sourceQuality.calculated;
      acc.partial += current.sourceQuality.partial;
      acc.fallback += current.sourceQuality.fallback;
      acc.total += current.sourceQuality.total;
      return acc;
    },
    { calculated: 0, partial: 0, fallback: 0, total: 0 },
  );
  const sourceQuality = {
    ...totalQuality,
    overall: totalQuality.calculated === totalQuality.total
      ? "calculated" as const
      : totalQuality.fallback === totalQuality.total
        ? "fallback" as const
        : "partial" as const,
  };
  const sortedByUes = [...scores].sort((a, b) => b.scores.UES - a.scores.UES);
  const atRiskAgents = scores
    .filter((score) => score.collapseRisk.level === "high" || score.collapseRisk.level === "critical")
    .sort((a, b) => b.collapseRisk.score - a.collapseRisk.score)
    .slice(0, 5)
    .map((score) => ({
      agentId: score.agent.id,
      displayName: score.agent.displayName,
      UES: score.scores.UES,
      collapseRisk: score.collapseRisk.level,
      reasons: score.collapseRisk.reasons,
    }));

  return {
    agentCount: scores.length,
    averageUES: roundScore(safeAverage(scores.map((score) => score.scores.UES)) || NEUTRAL_SCORE),
    averageP: roundScore(safeAverage(scores.map((score) => score.scores.P)) || NEUTRAL_SCORE),
    averageD: roundScore(safeAverage(scores.map((score) => score.scores.D)) || NEUTRAL_SCORE),
    averageOmega: roundScore(safeAverage(scores.map((score) => score.scores.Omega)) || NEUTRAL_SCORE),
    averageXi: roundScore(safeAverage(scores.map((score) => score.scores.Xi)) || NEUTRAL_SCORE),
    averageCostEfficiency: roundScore(safeAverage(scores.map((score) => score.scores.costEfficiency)) || NEUTRAL_SCORE),
    averageCorrectionCapacity: roundScore(safeAverage(scores.map((score) => score.scores.correctionCapacity)) || NEUTRAL_SCORE),
    sourceQuality,
    collapseRisk,
    agents: scores,
    topAgents: sortedByUes.slice(0, 5).map((score) => ({
      agentId: score.agent.id,
      displayName: score.agent.displayName,
      UES: score.scores.UES,
      collapseRisk: score.collapseRisk.level,
    })),
    atRiskAgents,
    generatedAt: new Date().toISOString(),
  };
}

function resolveGlobalRiskLevel(distribution: GlobalUnifiedEvolutionScore["collapseRisk"]): UnifiedEvolutionScore["collapseRisk"]["level"] {
  if (distribution.critical > 0) return "critical";
  if (distribution.high > 0) return "high";
  if (distribution.medium > distribution.low) return "medium";
  return "low";
}

async function getCivilizationHealth(): Promise<CivilizationHealth> {
  const global = await getGlobalScore();
  const score = roundScore(
    0.30 * global.averageP
    + 0.20 * global.averageD
    + 0.20 * global.averageOmega
    + 0.20 * global.averageXi
    + 0.05 * global.averageCorrectionCapacity
    + 0.05 * global.averageCostEfficiency,
  );

  return {
    score,
    truthStability: global.averageP,
    independentReasoning: global.averageD,
    constructiveResonance: global.averageOmega,
    governanceIntegrity: global.averageXi,
    correctionCapacity: global.averageCorrectionCapacity,
    costDiscipline: global.averageCostEfficiency,
    collapseRisk: {
      level: resolveGlobalRiskLevel(global.collapseRisk),
      distribution: global.collapseRisk,
      readOnly: true,
    },
    sourceQuality: global.sourceQuality,
    explanation: "Read-only civilization health aggregates UES components across current agent identities without pausing agents or enforcing safe mode.",
    generatedAt: new Date().toISOString(),
  };
}

export const unifiedEvolutionService = {
  getAgentUes,
  getGlobalScore,
  getCivilizationHealth,
};
