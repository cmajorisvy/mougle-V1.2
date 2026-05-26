import { count, sql } from "drizzle-orm";
import { db } from "../db";
import {
  agentCostLogs,
  agentKnowledgeSources,
  agentMarketplaceClonePackages,
  agentMemory,
  agentTrustProfiles,
  claimEvidence,
  debateTurns,
  liveDebates,
  personalAgentMemories,
  podcastAudioJobs,
  podcastScriptPackages,
  policyViolations,
  realityClaims,
  riskAuditLogs,
  socialDistributionPackages,
  truthMemories,
  userAgents,
  users,
  youtubePublishingPackages,
} from "@shared/schema";
import { riskManagementService } from "./risk-management-service";
import { unifiedEvolutionService, type UesSourceQuality } from "./unified-evolution-service";

export type CivilizationHealthLevel = "low" | "medium" | "high" | "critical";
export type CivilizationHealthStatus = "healthy" | "watch" | "risk" | "critical";
export type SafeModeRecommendation =
  | "monitor"
  | "founder review recommended"
  | "pause autonomous publishing recommended"
  | "pause marketplace approvals recommended"
  | "pause external agents recommended";

type HealthMetric = {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  unit?: string;
  sourceQuality: UesSourceQuality;
  dataPoints: number;
  status: CivilizationHealthStatus;
  explanation: string;
};

type HealthSection = {
  key: string;
  title: string;
  summary: string;
  status: CivilizationHealthStatus;
  sourceQuality: UesSourceQuality;
  metrics: HealthMetric[];
  details?: Record<string, unknown>;
};

type CollapseSignal = {
  key: string;
  label: string;
  value: number;
  status: CivilizationHealthStatus;
  weight: number;
  explanation: string;
};

export type CivilizationHealthDashboard = {
  generatedAt: string;
  readOnly: true;
  summary: {
    score: number;
    displayScore: string;
    collapseRiskLevel: CivilizationHealthLevel;
    founderReviewNeeded: boolean;
    safeModeRecommendationStatus: SafeModeRecommendation[];
    explanation: string;
  };
  ues: {
    averageUES: number;
    averageP: number;
    averageD: number;
    averageOmega: number;
    averageXi: number;
    correctionCapacity: number;
    sourceQuality: {
      calculated: number;
      partial: number;
      fallback: number;
      total: number;
      overall: UesSourceQuality;
    };
  };
  sections: HealthSection[];
  collapseRisk: {
    score: number;
    level: CivilizationHealthLevel;
    sourceQuality: UesSourceQuality;
    signals: CollapseSignal[];
    phase12Distribution: Record<CivilizationHealthLevel, number>;
    readOnly: true;
  };
  recommendations: Array<{
    key: string;
    label: SafeModeRecommendation;
    reason: string;
    readOnly: true;
  }>;
  dataQuality: {
    calculated: number;
    partial: number;
    fallback: number;
    total: number;
    overall: UesSourceQuality;
  };
  safeguards: {
    rootAdminOnly: true;
    readOnly: true;
    noPrivateMemoryContent: true;
    noAutomaticSafeMode: true;
    noPublishingChanges: true;
    noMarketplaceActions: true;
  };
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * ONE_DAY_MS;

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(value: number) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function displayCount(value: number) {
  return Math.round(value).toLocaleString();
}

function displayCredits(value: number) {
  return `${Math.round(value).toLocaleString()} credits`;
}

function statusFromRisk(risk: number): CivilizationHealthStatus {
  if (risk >= 0.8) return "critical";
  if (risk >= 0.6) return "risk";
  if (risk >= 0.35) return "watch";
  return "healthy";
}

function statusFromScore(score: number): CivilizationHealthStatus {
  if (score < 0.3) return "critical";
  if (score < 0.5) return "risk";
  if (score < 0.7) return "watch";
  return "healthy";
}

function sourceQuality(dataPoints: number, minCalculatedPoints = 3): UesSourceQuality {
  if (dataPoints <= 0) return "fallback";
  if (dataPoints < minCalculatedPoints) return "partial";
  return "calculated";
}

function combineSourceQuality(qualities: UesSourceQuality[]): UesSourceQuality {
  if (qualities.length === 0) return "fallback";
  if (qualities.every((quality) => quality === "calculated")) return "calculated";
  if (qualities.every((quality) => quality === "fallback")) return "fallback";
  return "partial";
}

function healthMetric(input: {
  key: string;
  label: string;
  value: number;
  displayValue?: string;
  unit?: string;
  dataPoints: number;
  explanation: string;
  sourceQuality?: UesSourceQuality;
  status?: CivilizationHealthStatus;
  minCalculatedPoints?: number;
}) {
  const quality = input.sourceQuality || sourceQuality(input.dataPoints, input.minCalculatedPoints);
  return {
    key: input.key,
    label: input.label,
    value: round(input.value),
    displayValue: input.displayValue || percent(input.value),
    unit: input.unit,
    sourceQuality: quality,
    dataPoints: Math.max(0, Math.round(input.dataPoints)),
    status: input.status || statusFromScore(input.value),
    explanation: input.explanation,
  };
}

function section(input: Omit<HealthSection, "sourceQuality">): HealthSection {
  return {
    ...input,
    sourceQuality: combineSourceQuality(input.metrics.map((metric) => metric.sourceQuality)),
  };
}

function riskValueForStatus(status: CivilizationHealthStatus) {
  if (status === "critical") return 1;
  if (status === "risk") return 0.72;
  if (status === "watch") return 0.42;
  return 0.12;
}

function levelFromRisk(score: number): CivilizationHealthLevel {
  if (score >= 0.82) return "critical";
  if (score >= 0.62) return "high";
  if (score >= 0.38) return "medium";
  return "low";
}

function phase12RiskScore(level: CivilizationHealthLevel) {
  if (level === "critical") return 0.95;
  if (level === "high") return 0.72;
  if (level === "medium") return 0.45;
  return 0.16;
}

function normalizeTrust(value: number) {
  return clamp01(value > 1 ? value / 100 : value);
}

function hasBlockingJsonMarker(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const text = JSON.stringify(value).toLowerCase();
  return text.includes("blocking") || text.includes("blocked") || text.includes("high-risk") || text.includes("high_risk");
}

async function getAgentStats() {
  const [systemStats] = await db.select({
    systemAgents: sql<number>`COUNT(*) FILTER (WHERE ${users.role} = 'agent')`,
    activeSystemAgents: sql<number>`COUNT(*) FILTER (WHERE ${users.role} = 'agent' AND ${users.isShadowBanned} = false AND ${users.isSpammer} = false)`,
  }).from(users);

  const [userAgentStats] = await db.select({
    total: count(),
    active: sql<number>`COUNT(*) FILTER (WHERE ${userAgents.status} IN ('active_private', 'active', 'ready'))`,
    privateOnly: sql<number>`COUNT(*) FILTER (WHERE ${userAgents.visibility} = 'private')`,
  }).from(userAgents);

  return {
    systemAgents: asNumber(systemStats?.systemAgents),
    activeSystemAgents: asNumber(systemStats?.activeSystemAgents),
    userOwnedAgents: asNumber(userAgentStats?.total),
    activeUserOwnedAgents: asNumber(userAgentStats?.active),
    privateUserOwnedAgents: asNumber(userAgentStats?.privateOnly),
  };
}

async function getTrustStats() {
  const [stats] = await db.select({
    total: count(),
    high: sql<number>`COUNT(*) FILTER (WHERE ${agentTrustProfiles.compositeTrustScore} >= 75)`,
    medium: sql<number>`COUNT(*) FILTER (WHERE ${agentTrustProfiles.compositeTrustScore} >= 50 AND ${agentTrustProfiles.compositeTrustScore} < 75)`,
    low: sql<number>`COUNT(*) FILTER (WHERE ${agentTrustProfiles.compositeTrustScore} < 50)`,
    suspended: sql<number>`COUNT(*) FILTER (WHERE ${agentTrustProfiles.isSuspended} = true)`,
    manipulationFlags: sql<number>`COALESCE(SUM(${agentTrustProfiles.manipulationFlags}), 0)`,
    avgTrust: sql<number>`COALESCE(AVG(${agentTrustProfiles.compositeTrustScore}), 0)`,
  }).from(agentTrustProfiles);

  const total = asNumber(stats?.total);
  return {
    total,
    high: asNumber(stats?.high),
    medium: asNumber(stats?.medium),
    low: asNumber(stats?.low),
    suspended: asNumber(stats?.suspended),
    manipulationFlags: asNumber(stats?.manipulationFlags),
    avgTrust: normalizeTrust(asNumber(stats?.avgTrust)),
  };
}

async function getTruthStats(weekAgo: Date) {
  const [claimStats] = await db.select({
    total: count(),
    recent: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.createdAt} >= ${weekAgo})`,
    unverified: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'unverified')`,
    contested: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'contested')`,
    supported: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} IN ('supported', 'consensus'))`,
    avgConfidence: sql<number>`COALESCE(AVG(${realityClaims.confidenceScore}), 0)`,
    avgEvidenceStrength: sql<number>`COALESCE(AVG(${realityClaims.evidenceStrength}), 0)`,
    contradictions: sql<number>`COALESCE(SUM(${realityClaims.contradictionCount}), 0)`,
  }).from(realityClaims);

  const [evidenceStats] = await db.select({
    total: count(),
    recent: sql<number>`COUNT(*) FILTER (WHERE ${claimEvidence.createdAt} >= ${weekAgo})`,
    avgTrust: sql<number>`COALESCE(AVG(${claimEvidence.trustScore}), 0)`,
  }).from(claimEvidence);

  const totalClaims = asNumber(claimStats?.total);
  const contested = asNumber(claimStats?.contested);
  const unverified = asNumber(claimStats?.unverified);
  const evidenceCount = asNumber(evidenceStats?.total);
  const evidenceCoverage = totalClaims > 0 ? clamp01(evidenceCount / totalClaims) : 0;
  const weakEvidence = 1 - clamp01((evidenceCoverage + asNumber(claimStats?.avgEvidenceStrength) + asNumber(evidenceStats?.avgTrust)) / 3);
  const misinformationRisk = totalClaims > 0
    ? clamp01(
      (0.35 * (unverified / totalClaims))
      + (0.35 * (contested / totalClaims))
      + (0.20 * weakEvidence)
      + (0.10 * clamp01(asNumber(claimStats?.contradictions) / Math.max(totalClaims, 1))),
    )
    : 0.35;

  return {
    totalClaims,
    recentClaims: asNumber(claimStats?.recent),
    unverified,
    contested,
    supported: asNumber(claimStats?.supported),
    avgConfidence: asNumber(claimStats?.avgConfidence),
    avgEvidenceStrength: asNumber(claimStats?.avgEvidenceStrength),
    contradictions: asNumber(claimStats?.contradictions),
    evidenceCount,
    recentEvidence: asNumber(evidenceStats?.recent),
    avgEvidenceTrust: asNumber(evidenceStats?.avgTrust),
    evidenceCoverage,
    misinformationRisk,
  };
}

async function getPolicyStats(weekAgo: Date) {
  const [policyStats] = await db.select({
    total: count(),
    active: sql<number>`COUNT(*) FILTER (WHERE ${policyViolations.status} = 'active')`,
    recent: sql<number>`COUNT(*) FILTER (WHERE ${policyViolations.detectedAt} >= ${weekAgo})`,
    resolved: sql<number>`COUNT(*) FILTER (WHERE ${policyViolations.status} <> 'active')`,
  }).from(policyViolations);

  const [auditStats] = await db.select({
    total: count(),
    recent: sql<number>`COUNT(*) FILTER (WHERE ${riskAuditLogs.createdAt} >= ${weekAgo})`,
    high: sql<number>`COUNT(*) FILTER (WHERE ${riskAuditLogs.createdAt} >= ${weekAgo} AND ${riskAuditLogs.riskLevel} IN ('high', 'critical'))`,
    denied: sql<number>`COUNT(*) FILTER (WHERE ${riskAuditLogs.createdAt} >= ${weekAgo} AND ${riskAuditLogs.outcome} IN ('denied', 'error'))`,
  }).from(riskAuditLogs);

  const total = asNumber(policyStats?.total);
  const recent = asNumber(policyStats?.recent);
  const active = asNumber(policyStats?.active);
  const highAudit = asNumber(auditStats?.high);
  const policyTrendRisk = clamp01((active / Math.max(total, 1) * 0.45) + (recent / 25 * 0.35) + (highAudit / 10 * 0.20));

  return {
    total,
    active,
    recent,
    resolved: asNumber(policyStats?.resolved),
    auditTotal: asNumber(auditStats?.total),
    auditRecent: asNumber(auditStats?.recent),
    highRiskAuditRecent: highAudit,
    deniedAuditRecent: asNumber(auditStats?.denied),
    policyTrendRisk,
  };
}

async function getCostStats(dayAgo: Date, weekAgo: Date) {
  const [stats] = await db.select({
    total: count(),
    requests24h: sql<number>`COUNT(*) FILTER (WHERE ${agentCostLogs.createdAt} >= ${dayAgo})`,
    requests7d: sql<number>`COUNT(*) FILTER (WHERE ${agentCostLogs.createdAt} >= ${weekAgo})`,
    credits24h: sql<number>`COALESCE(SUM(${agentCostLogs.creditsCharged}) FILTER (WHERE ${agentCostLogs.createdAt} >= ${dayAgo}), 0)`,
    credits7d: sql<number>`COALESCE(SUM(${agentCostLogs.creditsCharged}) FILTER (WHERE ${agentCostLogs.createdAt} >= ${weekAgo}), 0)`,
    tokens24h: sql<number>`COALESCE(SUM(${agentCostLogs.tokensUsed}) FILTER (WHERE ${agentCostLogs.createdAt} >= ${dayAgo}), 0)`,
    failed7d: sql<number>`COUNT(*) FILTER (WHERE ${agentCostLogs.createdAt} >= ${weekAgo} AND ${agentCostLogs.status} <> 'completed')`,
  }).from(agentCostLogs);

  const credits24h = asNumber(stats?.credits24h);
  const credits7d = asNumber(stats?.credits7d);
  const dailyAverage = credits7d / 7;
  const burnRisk = clamp01((dailyAverage / 2500) * 0.55 + (credits24h / 5000) * 0.30 + (asNumber(stats?.failed7d) / Math.max(asNumber(stats?.requests7d), 1)) * 0.15);

  return {
    total: asNumber(stats?.total),
    requests24h: asNumber(stats?.requests24h),
    requests7d: asNumber(stats?.requests7d),
    credits24h,
    credits7d,
    tokens24h: asNumber(stats?.tokens24h),
    failed7d: asNumber(stats?.failed7d),
    dailyAverage,
    burnRisk,
  };
}

async function getDebateStats(weekAgo: Date) {
  const [debateStats] = await db.select({
    total: count(),
    recent: sql<number>`COUNT(*) FILTER (WHERE ${liveDebates.createdAt} >= ${weekAgo})`,
    completed: sql<number>`COUNT(*) FILTER (WHERE ${liveDebates.status} IN ('completed', 'ended', 'closed'))`,
    internalDrafts: sql<number>`COUNT(*) FILTER (WHERE ${liveDebates.status} IN ('draft', 'internal', 'admin_review'))`,
    withConsensus: sql<number>`COUNT(*) FILTER (WHERE ${liveDebates.consensusSummary} IS NOT NULL)`,
    avgConfidence: sql<number>`COALESCE(AVG(${liveDebates.confidenceScore}), 0)`,
  }).from(liveDebates);

  const [turnStats] = await db.select({
    total: count(),
    recent: sql<number>`COUNT(*) FILTER (WHERE ${debateTurns.createdAt} >= ${weekAgo})`,
    avgTcs: sql<number>`COALESCE(AVG(${debateTurns.tcsScore}), 0)`,
  }).from(debateTurns);

  const total = asNumber(debateStats?.total);
  const turnCount = asNumber(turnStats?.total);
  const consensusCoverage = total > 0 ? asNumber(debateStats?.withConsensus) / total : 0;
  const turnDensity = total > 0 ? clamp01(turnCount / Math.max(total * 3, 1)) : 0;
  const avgConfidence = asNumber(debateStats?.avgConfidence);
  const avgTcs = asNumber(turnStats?.avgTcs);
  const debateQuality = total > 0
    ? clamp01((0.30 * avgConfidence) + (0.25 * consensusCoverage) + (0.25 * turnDensity) + (0.20 * (avgTcs || 0.5)))
    : 0.5;

  return {
    total,
    recent: asNumber(debateStats?.recent),
    completed: asNumber(debateStats?.completed),
    internalDrafts: asNumber(debateStats?.internalDrafts),
    withConsensus: asNumber(debateStats?.withConsensus),
    avgConfidence,
    turns: turnCount,
    recentTurns: asNumber(turnStats?.recent),
    avgTcs,
    debateQuality,
  };
}

async function getKnowledgeStats(weekAgo: Date) {
  const [agentMemoryStats] = await db.select({
    total: count(),
    recent: sql<number>`COUNT(*) FILTER (WHERE ${agentMemory.createdAt} >= ${weekAgo})`,
    personal: sql<number>`COUNT(*) FILTER (WHERE ${agentMemory.vaultType} = 'personal')`,
    business: sql<number>`COUNT(*) FILTER (WHERE ${agentMemory.vaultType} = 'business')`,
    publicVault: sql<number>`COUNT(*) FILTER (WHERE ${agentMemory.vaultType} = 'public')`,
    behavioral: sql<number>`COUNT(*) FILTER (WHERE ${agentMemory.vaultType} = 'behavioral')`,
    verified: sql<number>`COUNT(*) FILTER (WHERE ${agentMemory.vaultType} = 'verified')`,
    privateCount: sql<number>`COUNT(*) FILTER (WHERE ${agentMemory.sensitivity} = 'private')`,
    restricted: sql<number>`COUNT(*) FILTER (WHERE ${agentMemory.sensitivity} = 'restricted')`,
    internal: sql<number>`COUNT(*) FILTER (WHERE ${agentMemory.sensitivity} = 'internal')`,
  }).from(agentMemory);

  const [sourceStats] = await db.select({
    total: count(),
    recent: sql<number>`COUNT(*) FILTER (WHERE ${agentKnowledgeSources.createdAt} >= ${weekAgo})`,
    publicVault: sql<number>`COUNT(*) FILTER (WHERE ${agentKnowledgeSources.vaultType} = 'public')`,
    business: sql<number>`COUNT(*) FILTER (WHERE ${agentKnowledgeSources.vaultType} = 'business')`,
    verified: sql<number>`COUNT(*) FILTER (WHERE ${agentKnowledgeSources.vaultType} = 'verified')`,
    privateCount: sql<number>`COUNT(*) FILTER (WHERE ${agentKnowledgeSources.sensitivity} = 'private')`,
    restricted: sql<number>`COUNT(*) FILTER (WHERE ${agentKnowledgeSources.sensitivity} = 'restricted')`,
    processed: sql<number>`COUNT(*) FILTER (WHERE ${agentKnowledgeSources.status} = 'processed')`,
  }).from(agentKnowledgeSources);

  const [personalStats] = await db.select({
    total: count(),
    recent: sql<number>`COUNT(*) FILTER (WHERE ${personalAgentMemories.createdAt} >= ${weekAgo})`,
    personal: sql<number>`COUNT(*) FILTER (WHERE ${personalAgentMemories.vaultType} = 'personal')`,
    privateCount: sql<number>`COUNT(*) FILTER (WHERE ${personalAgentMemories.sensitivity} = 'private')`,
    confirmed: sql<number>`COUNT(*) FILTER (WHERE ${personalAgentMemories.confirmed} = true)`,
  }).from(personalAgentMemories);

  const [truthStats] = await db.select({
    total: count(),
    recent: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.createdAt} >= ${weekAgo})`,
    personal: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.vaultType} = 'personal')`,
    publicVault: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.vaultType} = 'public')`,
    verified: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.vaultType} = 'verified')`,
    privateCount: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.sensitivity} = 'private')`,
    avgConfidence: sql<number>`COALESCE(AVG(${truthMemories.confidenceScore}), 0)`,
  }).from(truthMemories);

  const total = asNumber(agentMemoryStats?.total) + asNumber(sourceStats?.total) + asNumber(personalStats?.total) + asNumber(truthStats?.total);
  const recent = asNumber(agentMemoryStats?.recent) + asNumber(sourceStats?.recent) + asNumber(personalStats?.recent) + asNumber(truthStats?.recent);
  const restrictedCount =
    asNumber(agentMemoryStats?.privateCount)
    + asNumber(agentMemoryStats?.restricted)
    + asNumber(sourceStats?.privateCount)
    + asNumber(sourceStats?.restricted)
    + asNumber(personalStats?.privateCount)
    + asNumber(truthStats?.privateCount);
  const publicSafeCount = asNumber(agentMemoryStats?.publicVault) + asNumber(agentMemoryStats?.verified) + asNumber(sourceStats?.publicVault) + asNumber(sourceStats?.verified) + asNumber(truthStats?.publicVault) + asNumber(truthStats?.verified);
  const classificationSafety = total > 0 ? clamp01((restrictedCount + publicSafeCount) / total) : 0.5;

  return {
    total,
    recent,
    restrictedCount,
    publicSafeCount,
    classificationSafety,
    agentMemory: agentMemoryStats,
    knowledgeSources: sourceStats,
    personalMemories: personalStats,
    truthMemories: truthStats,
  };
}

async function getMarketplaceStats() {
  const packages = await db.select({
    id: agentMarketplaceClonePackages.id,
    status: agentMarketplaceClonePackages.status,
    reviewStatus: agentMarketplaceClonePackages.reviewStatus,
    safetyReport: agentMarketplaceClonePackages.safetyReport,
    sanitizerReport: agentMarketplaceClonePackages.sanitizerReport,
  }).from(agentMarketplaceClonePackages);

  const total = packages.length;
  const approved = packages.filter((pkg) => pkg.reviewStatus === "approved" || pkg.status === "approved").length;
  const pending = packages.filter((pkg) => ["draft", "pending_review", "sandbox_only"].includes(pkg.reviewStatus) || ["draft", "pending_review", "sandbox_only"].includes(pkg.status)).length;
  const rejected = packages.filter((pkg) => pkg.reviewStatus === "rejected" || pkg.status === "rejected").length;
  const blockers = packages.filter((pkg) => hasBlockingJsonMarker(pkg.safetyReport) || hasBlockingJsonMarker(pkg.sanitizerReport)).length;
  const quality = total > 0 ? clamp01((approved + pending * 0.35) / total - blockers / Math.max(total, 1) * 0.4) : 0.5;

  return { total, approved, pending, rejected, blockers, quality };
}

async function getMediaStats() {
  const [scriptStats] = await db.select({
    total: count(),
    approved: sql<number>`COUNT(*) FILTER (WHERE ${podcastScriptPackages.status} IN ('approved', 'admin_review'))`,
    blocked: sql<number>`COUNT(*) FILTER (WHERE ${podcastScriptPackages.status} IN ('blocked', 'failed', 'rejected'))`,
  }).from(podcastScriptPackages);
  const [audioStats] = await db.select({
    total: count(),
    completed: sql<number>`COUNT(*) FILTER (WHERE ${podcastAudioJobs.status} IN ('completed', 'mock'))`,
    blocked: sql<number>`COUNT(*) FILTER (WHERE ${podcastAudioJobs.status} IN ('failed', 'blocked'))`,
  }).from(podcastAudioJobs);
  const [youtubeStats] = await db.select({
    total: count(),
    approved: sql<number>`COUNT(*) FILTER (WHERE ${youtubePublishingPackages.approvalStatus} = 'approved')`,
    blocked: sql<number>`COUNT(*) FILTER (WHERE ${youtubePublishingPackages.status} IN ('blocked', 'failed') OR ${youtubePublishingPackages.uploadStatus} = 'failed')`,
  }).from(youtubePublishingPackages);
  const [socialStats] = await db.select({
    total: count(),
    approved: sql<number>`COUNT(*) FILTER (WHERE ${socialDistributionPackages.approvalStatus} = 'approved')`,
    blocked: sql<number>`COUNT(*) FILTER (WHERE ${socialDistributionPackages.status} IN ('blocked', 'blocked_by_safety_gate', 'failed') OR ${socialDistributionPackages.postingStatus} = 'failed')`,
  }).from(socialDistributionPackages);

  const total = asNumber(scriptStats?.total) + asNumber(audioStats?.total) + asNumber(youtubeStats?.total) + asNumber(socialStats?.total);
  const approved = asNumber(scriptStats?.approved) + asNumber(audioStats?.completed) + asNumber(youtubeStats?.approved) + asNumber(socialStats?.approved);
  const blocked = asNumber(scriptStats?.blocked) + asNumber(audioStats?.blocked) + asNumber(youtubeStats?.blocked) + asNumber(socialStats?.blocked);
  const health = total > 0 ? clamp01((approved + (total - approved - blocked) * 0.45) / total - blocked / Math.max(total, 1) * 0.35) : 0.5;

  return {
    total,
    approved,
    blocked,
    health,
    podcastScripts: scriptStats,
    audioJobs: audioStats,
    youtubePackages: youtubeStats,
    socialPackages: socialStats,
  };
}

function collapseSignal(input: CollapseSignal): CollapseSignal {
  return { ...input, value: round(input.value) };
}

function buildRecommendations(signals: CollapseSignal[], level: CivilizationHealthLevel): CivilizationHealthDashboard["recommendations"] {
  const recommendations = new Map<SafeModeRecommendation, string>();

  if (level === "low" && signals.every((signal) => signal.status === "healthy" || signal.status === "watch")) {
    recommendations.set("monitor", "Current aggregate health does not require founder intervention.");
  }

  if (level === "medium" || level === "high" || level === "critical" || signals.some((signal) => signal.status === "risk" || signal.status === "critical")) {
    recommendations.set("founder review recommended", "One or more civilization health signals need founder review before expanding automation.");
  }

  if (signals.some((signal) => ["misinformation_risk", "policy_violation_trend", "media_pipeline_blockers"].includes(signal.key) && (signal.status === "risk" || signal.status === "critical"))) {
    recommendations.set("pause autonomous publishing recommended", "Truth, policy, or media pipeline signals indicate publishing should remain manually controlled.");
  }

  if (signals.some((signal) => signal.key === "marketplace_safety_blockers" && (signal.status === "risk" || signal.status === "critical"))) {
    recommendations.set("pause marketplace approvals recommended", "Marketplace safe-clone review has blockers or rejection pressure.");
  }

  if (signals.some((signal) => ["agent_trust_pressure", "phase12_collapse_risk"].includes(signal.key) && (signal.status === "risk" || signal.status === "critical"))) {
    recommendations.set("pause external agents recommended", "Agent trust or UES collapse signals suggest external agent expansion should wait.");
  }

  if (recommendations.size === 0) {
    recommendations.set("monitor", "No read-only safe-mode recommendation was triggered.");
  }

  return Array.from(recommendations.entries()).map(([label, reason]) => ({
    key: label.replace(/\s+/g, "_"),
    label,
    reason,
    readOnly: true as const,
  }));
}

async function getCivilizationHealthDashboard(): Promise<CivilizationHealthDashboard> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - ONE_DAY_MS);
  const weekAgo = new Date(now.getTime() - WEEK_MS);

  const [
    globalScore,
    phase12Health,
    riskOverview,
    agentStats,
    trustStats,
    truthStats,
    policyStats,
    costStats,
    debateStats,
    knowledgeStats,
    marketplaceStats,
    mediaStats,
  ] = await Promise.all([
    unifiedEvolutionService.getGlobalScore(),
    unifiedEvolutionService.getCivilizationHealth(),
    riskManagementService.getRiskOverview().catch(() => null),
    getAgentStats(),
    getTrustStats(),
    getTruthStats(weekAgo),
    getPolicyStats(weekAgo),
    getCostStats(dayAgo, weekAgo),
    getDebateStats(weekAgo),
    getKnowledgeStats(weekAgo),
    getMarketplaceStats(),
    getMediaStats(),
  ]);

  const activeAgents = agentStats.activeSystemAgents + agentStats.activeUserOwnedAgents;
  const totalAgents = agentStats.systemAgents + agentStats.userOwnedAgents;
  const lowTrustRatio = trustStats.total > 0 ? (trustStats.low + trustStats.suspended) / trustStats.total : 0;
  const agentTrustPressure = clamp01((lowTrustRatio * 0.55) + (trustStats.manipulationFlags / Math.max(trustStats.total * 3, 1) * 0.25) + ((1 - trustStats.avgTrust) * 0.20));
  const marketplaceBlockerRisk = marketplaceStats.total > 0 ? clamp01((marketplaceStats.blockers + marketplaceStats.rejected) / marketplaceStats.total) : 0;
  const mediaBlockerRisk = mediaStats.total > 0 ? clamp01(mediaStats.blocked / mediaStats.total) : 0;
  const phase12Risk = phase12RiskScore(phase12Health.collapseRisk.level);
  const weakEvidenceSignal = truthStats.totalClaims > 0 ? 1 - truthStats.evidenceCoverage : 0.35;

  const uesSection = section({
    key: "ues",
    title: "Truth Evolution",
    summary: "Phase 12 UES averages are the primary civilization health signal.",
    status: statusFromScore(phase12Health.score),
    metrics: [
      healthMetric({ key: "average_ues", label: "Average UES", value: globalScore.averageUES, dataPoints: globalScore.agentCount, explanation: "Average Unified Evolution Score across current agent identities.", sourceQuality: globalScore.sourceQuality.overall }),
      healthMetric({ key: "average_p", label: "Average P", value: globalScore.averageP, dataPoints: globalScore.agentCount, explanation: "Purity / truth-intent / signal integrity from the UES engine.", sourceQuality: globalScore.sourceQuality.overall }),
      healthMetric({ key: "average_d", label: "Average D", value: globalScore.averageD, dataPoints: globalScore.agentCount, explanation: "Detachment / independent reasoning from the UES engine.", sourceQuality: globalScore.sourceQuality.overall }),
      healthMetric({ key: "average_omega", label: "Average Omega", value: globalScore.averageOmega, dataPoints: globalScore.agentCount, explanation: "Constructive resonance / engagement quality from the UES engine.", sourceQuality: globalScore.sourceQuality.overall }),
      healthMetric({ key: "average_xi", label: "Average Xi", value: globalScore.averageXi, dataPoints: globalScore.agentCount, explanation: "Governance integrity / policy compliance from the UES engine.", sourceQuality: globalScore.sourceQuality.overall }),
      healthMetric({ key: "correction_capacity", label: "Correction Capacity", value: globalScore.averageCorrectionCapacity, dataPoints: globalScore.agentCount, explanation: "Readiness to correct weak or disputed knowledge signals.", sourceQuality: globalScore.sourceQuality.overall }),
    ],
    details: {
      topAgents: globalScore.topAgents,
      atRiskAgents: globalScore.atRiskAgents,
    },
  });

  const agentSection = section({
    key: "agents",
    title: "Agents and Trust",
    summary: "System and user-owned agent counts plus trust distribution.",
    status: statusFromRisk(agentTrustPressure),
    metrics: [
      healthMetric({ key: "active_agents", label: "Active Agents", value: activeAgents, displayValue: displayCount(activeAgents), dataPoints: totalAgents, explanation: "Active system agents plus active private user-owned agents.", status: activeAgents > 0 ? "healthy" : "watch" }),
      healthMetric({ key: "system_agents", label: "System Agents", value: agentStats.systemAgents, displayValue: displayCount(agentStats.systemAgents), dataPoints: agentStats.systemAgents, explanation: "Platform agent identities stored as agent users." }),
      healthMetric({ key: "user_owned_agents", label: "User-Owned Agents", value: agentStats.userOwnedAgents, displayValue: displayCount(agentStats.userOwnedAgents), dataPoints: agentStats.userOwnedAgents, explanation: "User-owned agents from the agent builder system." }),
      healthMetric({ key: "average_trust", label: "Average Trust", value: trustStats.avgTrust, dataPoints: trustStats.total, explanation: "Average composite trust score from agent trust profiles." }),
      healthMetric({ key: "agent_trust_pressure", label: "Trust Pressure", value: agentTrustPressure, dataPoints: trustStats.total, explanation: "Pressure from low trust, suspended agents, and manipulation flags.", status: statusFromRisk(agentTrustPressure) }),
    ],
    details: {
      trustDistribution: {
        high: trustStats.high,
        medium: trustStats.medium,
        low: trustStats.low,
        suspended: trustStats.suspended,
        manipulationFlags: trustStats.manipulationFlags,
      },
    },
  });

  const truthSection = section({
    key: "truth",
    title: "Truth and Debate Quality",
    summary: "Misinformation risk, evidence coverage, and debate quality.",
    status: statusFromRisk(truthStats.misinformationRisk),
    metrics: [
      healthMetric({ key: "misinformation_risk", label: "Misinformation Risk", value: truthStats.misinformationRisk, dataPoints: truthStats.totalClaims, explanation: "Composite risk from unverified/contested claims, contradiction pressure, and weak evidence coverage.", status: statusFromRisk(truthStats.misinformationRisk) }),
      healthMetric({ key: "evidence_coverage", label: "Evidence Coverage", value: truthStats.evidenceCoverage, dataPoints: truthStats.evidenceCount, explanation: "Claim evidence references compared with total reality claims." }),
      healthMetric({ key: "debate_quality", label: "Debate Quality", value: debateStats.debateQuality, dataPoints: debateStats.total, explanation: "Read-only quality signal from debate confidence, consensus coverage, turn density, and TCS where available." }),
      healthMetric({ key: "recent_claims", label: "Recent Claims", value: truthStats.recentClaims, displayValue: displayCount(truthStats.recentClaims), dataPoints: truthStats.totalClaims, explanation: "Reality claims added in the last 7 days." }),
      healthMetric({ key: "recent_debates", label: "Recent Debates", value: debateStats.recent, displayValue: displayCount(debateStats.recent), dataPoints: debateStats.total, explanation: "Debates created in the last 7 days." }),
    ],
    details: {
      claims: {
        total: truthStats.totalClaims,
        unverified: truthStats.unverified,
        contested: truthStats.contested,
        supported: truthStats.supported,
        contradictions: truthStats.contradictions,
      },
      debates: {
        total: debateStats.total,
        completed: debateStats.completed,
        internalDrafts: debateStats.internalDrafts,
        withConsensus: debateStats.withConsensus,
        turns: debateStats.turns,
      },
    },
  });

  const governanceSection = section({
    key: "governance",
    title: "Policy and Risk",
    summary: "Policy violation trend and broader risk posture.",
    status: statusFromRisk(Math.max(policyStats.policyTrendRisk, (riskOverview?.overallScore || 0) / 100)),
    metrics: [
      healthMetric({ key: "policy_violation_trend", label: "Policy Violation Trend", value: policyStats.policyTrendRisk, dataPoints: policyStats.total + policyStats.auditTotal, explanation: "Risk from active/recent policy violations and high-risk audit log entries.", status: statusFromRisk(policyStats.policyTrendRisk) }),
      healthMetric({ key: "active_policy_violations", label: "Active Violations", value: policyStats.active, displayValue: displayCount(policyStats.active), dataPoints: policyStats.total, explanation: "Currently active policy violation records." }),
      healthMetric({ key: "recent_high_risk_audits", label: "High-Risk Audit Events", value: policyStats.highRiskAuditRecent, displayValue: displayCount(policyStats.highRiskAuditRecent), dataPoints: policyStats.auditTotal, explanation: "High or critical audit events in the last 7 days." }),
      healthMetric({ key: "risk_overview", label: "Risk Overview", value: clamp01((riskOverview?.overallScore || 0) / 100), dataPoints: riskOverview ? riskOverview.indicators.length : 0, explanation: "Existing risk management overview normalized from technical, economic, privacy, ecosystem, and legal indicators.", status: statusFromRisk((riskOverview?.overallScore || 0) / 100) }),
    ],
    details: {
      riskOverviewStatus: riskOverview?.overallStatus || "unavailable",
      categoryScores: riskOverview?.categoryScores || {},
    },
  });

  const costSection = section({
    key: "cost",
    title: "Cost Burn",
    summary: "AI/agent cost pressure based on credit and token usage.",
    status: statusFromRisk(costStats.burnRisk),
    metrics: [
      healthMetric({ key: "cost_burn_rate", label: "Cost Burn Rate", value: costStats.burnRisk, dataPoints: costStats.requests7d, explanation: "Risk score from 24h and 7d credit burn plus failed cost events.", status: statusFromRisk(costStats.burnRisk) }),
      healthMetric({ key: "credits_24h", label: "Credits 24h", value: costStats.credits24h, displayValue: displayCredits(costStats.credits24h), dataPoints: costStats.requests24h, explanation: "Credits charged to agent cost logs in the last 24 hours." }),
      healthMetric({ key: "daily_average_credits", label: "Daily Average", value: costStats.dailyAverage, displayValue: displayCredits(costStats.dailyAverage), dataPoints: costStats.requests7d, explanation: "Average daily credits charged over the last 7 days." }),
    ],
    details: {
      requests24h: costStats.requests24h,
      requests7d: costStats.requests7d,
      credits7d: costStats.credits7d,
      tokens24h: costStats.tokens24h,
      failed7d: costStats.failed7d,
    },
  });

  const knowledgeSection = section({
    key: "knowledge",
    title: "Knowledge and Memory Safety",
    summary: "Knowledge growth and vault classification health. Raw private memory is never returned.",
    status: statusFromScore(knowledgeStats.classificationSafety),
    metrics: [
      healthMetric({ key: "knowledge_growth", label: "Knowledge Growth", value: knowledgeStats.recent, displayValue: displayCount(knowledgeStats.recent), dataPoints: knowledgeStats.total, explanation: "Memory and knowledge records added in the last 7 days, counted only." }),
      healthMetric({ key: "classification_safety", label: "Classification Safety", value: knowledgeStats.classificationSafety, dataPoints: knowledgeStats.total, explanation: "Aggregate vault/sensitivity coverage across memory-bearing tables. No raw content is included." }),
      healthMetric({ key: "restricted_records", label: "Restricted Records", value: knowledgeStats.restrictedCount, displayValue: displayCount(knowledgeStats.restrictedCount), dataPoints: knowledgeStats.total, explanation: "Personal/private/restricted/internal records counted for safety visibility only." }),
      healthMetric({ key: "public_verified_records", label: "Public/Verified Records", value: knowledgeStats.publicSafeCount, displayValue: displayCount(knowledgeStats.publicSafeCount), dataPoints: knowledgeStats.total, explanation: "Public or verified vault records available for public-safe contexts when policy permits." }),
    ],
    details: {
      totalRecords: knowledgeStats.total,
      rawPrivateMemoryReturned: false,
      tableCounts: {
        agentMemory: asNumber(knowledgeStats.agentMemory?.total),
        agentKnowledgeSources: asNumber(knowledgeStats.knowledgeSources?.total),
        personalAgentMemories: asNumber(knowledgeStats.personalMemories?.total),
        truthMemories: asNumber(knowledgeStats.truthMemories?.total),
      },
    },
  });

  const marketplaceSection = section({
    key: "marketplace",
    title: "Marketplace Quality",
    summary: "Safe-clone package status and safety blocker pressure.",
    status: statusFromScore(marketplaceStats.quality),
    metrics: [
      healthMetric({ key: "marketplace_quality", label: "Marketplace Quality", value: marketplaceStats.quality, dataPoints: marketplaceStats.total, explanation: "Quality from approved/pending safe-clone packages minus safety blocker pressure." }),
      healthMetric({ key: "safe_clone_packages", label: "Safe-Clone Packages", value: marketplaceStats.total, displayValue: displayCount(marketplaceStats.total), dataPoints: marketplaceStats.total, explanation: "Total safe-clone packages prepared for sandbox marketplace review." }),
      healthMetric({ key: "marketplace_safety_blockers", label: "Safety Blockers", value: marketplaceBlockerRisk, dataPoints: marketplaceStats.total, explanation: "Rejected packages and safety/sanitizer blocker markers in safe-clone package reports.", status: statusFromRisk(marketplaceBlockerRisk) }),
    ],
    details: marketplaceStats,
  });

  const mediaSection = section({
    key: "media_pipeline",
    title: "Media and Growth Pipeline",
    summary: "Podcast, voice, YouTube, and social distribution package health.",
    status: statusFromScore(mediaStats.health),
    metrics: [
      healthMetric({ key: "media_pipeline_health", label: "Pipeline Health", value: mediaStats.health, dataPoints: mediaStats.total, explanation: "Pipeline health across script, voice, YouTube, and social distribution package statuses." }),
      healthMetric({ key: "media_packages", label: "Pipeline Packages", value: mediaStats.total, displayValue: displayCount(mediaStats.total), dataPoints: mediaStats.total, explanation: "Total packages/jobs across the media and growth pipeline." }),
      healthMetric({ key: "media_pipeline_blockers", label: "Pipeline Blockers", value: mediaBlockerRisk, dataPoints: mediaStats.total, explanation: "Blocked or failed package/job statuses across media and growth workflows.", status: statusFromRisk(mediaBlockerRisk) }),
    ],
    details: mediaStats,
  });

  const sections = [
    uesSection,
    agentSection,
    truthSection,
    governanceSection,
    costSection,
    knowledgeSection,
    marketplaceSection,
    mediaSection,
  ];

  const signals: CollapseSignal[] = [
    collapseSignal({ key: "phase12_collapse_risk", label: "Phase 12 Collapse Risk", value: phase12Risk, status: statusFromRisk(phase12Risk), weight: 1.5, explanation: `Phase 12 global UES collapse level is ${phase12Health.collapseRisk.level}.` }),
    collapseSignal({ key: "low_purity", label: "Low P", value: 1 - globalScore.averageP, status: statusFromScore(globalScore.averageP), weight: 1.0, explanation: "Low average P reduces truth stability." }),
    collapseSignal({ key: "low_omega", label: "Low Omega", value: 1 - globalScore.averageOmega, status: statusFromScore(globalScore.averageOmega), weight: 0.9, explanation: "Low constructive resonance can amplify unhealthy debate dynamics." }),
    collapseSignal({ key: "low_correction_capacity", label: "Low Correction Capacity", value: 1 - globalScore.averageCorrectionCapacity, status: statusFromScore(globalScore.averageCorrectionCapacity), weight: 1.0, explanation: "Low correction capacity makes weak claims harder to repair." }),
    collapseSignal({ key: "policy_violation_trend", label: "Policy Violation Trend", value: policyStats.policyTrendRisk, status: statusFromRisk(policyStats.policyTrendRisk), weight: 0.9, explanation: "Active/recent policy violations and high-risk audit events." }),
    collapseSignal({ key: "misinformation_risk", label: "Misinformation Risk", value: truthStats.misinformationRisk, status: statusFromRisk(truthStats.misinformationRisk), weight: 1.1, explanation: "Unverified/contested claims, contradictions, and weak evidence coverage." }),
    collapseSignal({ key: "weak_evidence_coverage", label: "Weak Evidence Coverage", value: weakEvidenceSignal, status: statusFromRisk(weakEvidenceSignal), weight: 0.75, explanation: "Claims without enough evidence coverage increase truth risk." }),
    collapseSignal({ key: "high_cost_burn", label: "High Cost Burn", value: costStats.burnRisk, status: statusFromRisk(costStats.burnRisk), weight: 0.55, explanation: "High credit burn or failed cost events can pressure platform health." }),
    collapseSignal({ key: "marketplace_safety_blockers", label: "Marketplace Safety Blockers", value: marketplaceBlockerRisk, status: statusFromRisk(marketplaceBlockerRisk), weight: 0.75, explanation: "Safe-clone package blockers or rejections." }),
    collapseSignal({ key: "media_pipeline_blockers", label: "Media Pipeline Blockers", value: mediaBlockerRisk, status: statusFromRisk(mediaBlockerRisk), weight: 0.65, explanation: "Blocked or failed publishing-package pipeline states." }),
    collapseSignal({ key: "agent_trust_pressure", label: "Agent Trust Pressure", value: agentTrustPressure, status: statusFromRisk(agentTrustPressure), weight: 0.85, explanation: "Low trust, suspended agents, and manipulation flags." }),
  ];

  const weightedRisk = signals.reduce((sum, signal) => sum + riskValueForStatus(signal.status) * signal.weight, 0);
  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const collapseRiskScore = clamp01(weightedRisk / Math.max(totalWeight, 1));
  const collapseRiskLevel = levelFromRisk(collapseRiskScore);
  const recommendations = buildRecommendations(signals, collapseRiskLevel);
  const dataQualityCounts = sections.flatMap((item) => item.metrics).reduce(
    (acc, metric) => {
      acc[metric.sourceQuality] += 1;
      acc.total += 1;
      return acc;
    },
    { calculated: 0, partial: 0, fallback: 0, total: 0 },
  );
  const dataQuality = {
    ...dataQualityCounts,
    overall: combineSourceQuality(sections.flatMap((item) => item.metrics).map((metric) => metric.sourceQuality)),
  };
  const founderReviewNeeded = collapseRiskLevel === "high" || collapseRiskLevel === "critical" || recommendations.some((rec) => rec.label !== "monitor");

  return {
    generatedAt: now.toISOString(),
    readOnly: true,
    summary: {
      score: phase12Health.score,
      displayScore: percent(phase12Health.score),
      collapseRiskLevel,
      founderReviewNeeded,
      safeModeRecommendationStatus: recommendations.map((rec) => rec.label),
      explanation: "Read-only founder dashboard combining Phase 12 UES with aggregate risk, cost, truth, memory classification, marketplace, and media pipeline signals. It never enforces safe mode or changes publishing/marketplace state.",
    },
    ues: {
      averageUES: globalScore.averageUES,
      averageP: globalScore.averageP,
      averageD: globalScore.averageD,
      averageOmega: globalScore.averageOmega,
      averageXi: globalScore.averageXi,
      correctionCapacity: globalScore.averageCorrectionCapacity,
      sourceQuality: globalScore.sourceQuality,
    },
    sections,
    collapseRisk: {
      score: round(collapseRiskScore),
      level: collapseRiskLevel,
      sourceQuality: dataQuality.overall,
      signals,
      phase12Distribution: phase12Health.collapseRisk.distribution,
      readOnly: true,
    },
    recommendations,
    dataQuality,
    safeguards: {
      rootAdminOnly: true,
      readOnly: true,
      noPrivateMemoryContent: true,
      noAutomaticSafeMode: true,
      noPublishingChanges: true,
      noMarketplaceActions: true,
    },
  };
}

export const civilizationHealthService = {
  getCivilizationHealthDashboard,
};
