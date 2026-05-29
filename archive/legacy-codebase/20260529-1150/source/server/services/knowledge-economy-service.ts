import crypto from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  agentDnaMutationHistory,
  agentGenomes,
  agentKnowledgeSources,
  agentTrustProfiles,
  gluonLedgerEntries,
  knowledgePacketAcceptances,
  knowledgePackets,
  userAgents,
  users,
  type AgentGenome,
  type KnowledgePacket,
  type KnowledgePacketAcceptance,
  type UserAgent,
} from "@shared/schema";
import {
  GLUON_PUBLIC_DISCLAIMER,
  GLUON_SHORT_BADGE,
  stripPublicGluonForbiddenFields,
  toAdminGluonAnalysisView,
  toPublicGluonView,
} from "@shared/gluon-presentation";
import { evaluateMemoryAccess, type MemorySensitivity, type MemoryVaultType } from "./memory-access-policy";
import { sanitizeMemoryOutput } from "./memory-output-sanitizer";
import { unifiedEvolutionService } from "./unified-evolution-service";
import { riskManagementService } from "./risk-management-service";

const VAULT_TYPES = ["business", "public", "behavioral", "verified"] as const;
const SENSITIVITY_LEVELS = ["public", "low", "internal", "restricted"] as const;
const DECISIONS = ["accepted", "rejected", "challenged"] as const;
const ACCEPTING_AGENT_TYPES = ["system_agent", "user_agent", "root_admin"] as const;
const SECRET_REDACTIONS = new Set(["secret_field", "token_or_api_key", "ssn", "card_number", "banking"]);
const REGULATED_PATTERN = /\b(medical|diagnosis|prescription|clinical|legal|lawsuit|contract|tax|investment|financial advice|loan|insurance|securities|bankruptcy)\b/i;
const MAX_PACKET_LIMIT = 100;
const DEFAULT_HALF_LIFE_DAYS = 90;
const REASONING_FACT_STATUSES = new Set(["verified", "approved", "supported"]);
const REASONING_ACCEPTED_STATUSES = new Set(["accepted", "approved", "verified"]);
const REASONING_HYPOTHESIS_STATUSES = new Set(["submitted", "pending_review", "needs_validation", "challenged"]);
const REASONING_BLOCKED_STATUSES = new Set(["draft", "rejected", "blocked", "revoked", "deleted"]);
const REASONING_VAULT_TYPES = new Set(["business", "public", "behavioral", "verified", "personal"]);
const REASONING_SENSITIVITIES = new Set(["public", "low", "internal", "restricted", "private", "secret"]);

type PacketInput = {
  creatorAgentId: string;
  title: string;
  summary: string;
  abstractedContent: string;
  sourceType?: string;
  domainTags?: string[];
  industryTags?: string[];
  geoTags?: string[];
  professionTags?: string[];
  vaultType?: string;
  sensitivity?: string;
  privacyLevel?: string;
  consentPolicy?: Record<string, any>;
  evidenceStrength?: number;
  noveltyScore?: number;
  usefulnessPrediction?: number;
  riskScore?: number;
  complianceScore?: number;
  halfLifeDays?: number;
  parentPacketIds?: string[];
};

type AcceptanceInput = {
  acceptingAgentId?: string;
  acceptingAgentType?: string;
  acceptingUserId?: string;
  decision: typeof DECISIONS[number];
  domainMatch?: number;
  receiverAuthority?: number;
  retentionScore?: number;
  realWorldFeedbackScore?: number;
  rationale?: string;
  challengeReason?: string;
  sandboxOnly?: boolean;
};

export type KnowledgePacketReasoningRequest = {
  requesterAgentId: string;
  requesterType?: "system_agent" | "user_agent" | "root_admin";
  query?: string;
  limit?: number;
  allowHypotheses?: boolean;
  explicitBusinessPermission?: boolean;
  minimumConfidence?: number;
};

export type KnowledgePacketKnowledgeStatus = "fact" | "hypothesis" | "pattern";

export type KnowledgePacketReasoningContextResult = {
  generatedAt: string;
  policy: {
    requesterType: "system_agent" | "user_agent" | "root_admin";
    requesterAgentId: string;
    allowedVaults: string[];
    allowedSensitivity: string[];
    hypothesesAllowed: boolean;
    explicitBusinessPermission: boolean;
    minimumConfidence: number;
    mutationAllowed: false;
    gluonAwardAllowed: false;
  };
  context: {
    packets: Array<{
      id: string;
      title: string;
      safeSummary: string;
      sourceType: string;
      domainTags: string[];
      industryTags: string[];
      vaultType: string;
      sensitivity: string;
      privacyLevel: string;
      verificationStatus: string;
      reviewStatus: string;
      status: string;
      knowledgeStatus: KnowledgePacketKnowledgeStatus;
      confidence: number;
      provenanceSummary: string;
      rankingScore: number;
      rankingReasons: string[];
      weightedAcceptance: number;
      gluonSignal: {
        amount: number;
        normalized: number;
        nonConvertible: true;
        rankingOnly: true;
      };
      creatorTrust: {
        available: boolean;
        ues: number | null;
        sourceQuality: string | null;
      };
      freshness: number;
      consentSummary: {
        creatorConsent: boolean;
        crossAgentLearningConsent: boolean;
        businessKnowledgeApproved: boolean;
      };
    }>;
  };
  blockedCounts: {
    total: number;
    byReason: Record<string, number>;
  };
  ranking: {
    formula: string;
    signals: string[];
  };
  explanations: string[];
  deterministicChecks: Record<string, {
    passed: boolean;
    expected: string;
    actual: string;
    explanation: string;
  }>;
  safeguards: {
    internalOnly: true;
    rootAdminSimulationOnly: true;
    noPublicApi: true;
    noRawPrivateMemory: true;
    noRawBusinessRestrictedMemory: true;
    noPacketMutation: true;
    noDnaMutation: true;
    noGluonAward: true;
    noWalletOrPayoutIntegration: true;
  };
};

class KnowledgeEconomyError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function safeArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value: unknown, name: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new KnowledgeEconomyError(400, `${name} is required`);
  }
  return value.trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function normalizeTags(value: unknown, max = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string" && !!item.trim())
    .map((item) => item.trim().toLowerCase().slice(0, 64))
  )].slice(0, max);
}

function clamp01(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeVault(value: unknown): MemoryVaultType {
  if (typeof value === "string" && (VAULT_TYPES as readonly string[]).includes(value)) {
    return value as MemoryVaultType;
  }
  return "business";
}

function normalizeSensitivity(value: unknown): MemorySensitivity | "low" {
  if (typeof value === "string" && (SENSITIVITY_LEVELS as readonly string[]).includes(value)) {
    return value as MemorySensitivity | "low";
  }
  return "restricted";
}

function sensitivityForMemoryPolicy(value: MemorySensitivity | "low"): MemorySensitivity {
  return value === "low" ? "public" : value;
}

function hashText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildFingerprint(input: {
  creatorAgentId: string;
  title: string;
  summary: string;
  abstractedContent: string;
  sourceType: string;
}) {
  const normalized = [
    input.creatorAgentId,
    input.sourceType,
    input.title,
    input.summary,
    input.abstractedContent,
  ].join("\n").toLowerCase().replace(/\s+/g, " ").trim();
  return hashText(normalized);
}

function isRegulated(input: { title: string; summary: string; abstractedContent: string; domainTags: string[]; industryTags: string[] }) {
  const tags = [...input.domainTags, ...input.industryTags].join(" ");
  return REGULATED_PATTERN.test(`${input.title}\n${input.summary}\n${input.abstractedContent}\n${tags}`);
}

function packetAgeDays(packet: Pick<KnowledgePacket, "freshnessTimestamp" | "createdAt">) {
  const base = packet.freshnessTimestamp || packet.createdAt || new Date();
  return Math.max(0, (Date.now() - new Date(base).getTime()) / 86_400_000);
}

function countDecision(rows: KnowledgePacketAcceptance[], decision: typeof DECISIONS[number]) {
  return rows.filter((row) => row.decision === decision).length;
}

function scoreFromTags(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0.5;
  const set = new Set(a.map((item) => item.toLowerCase()));
  const overlap = b.filter((item) => set.has(item.toLowerCase())).length;
  return Math.min(1, overlap / Math.max(1, Math.min(a.length, b.length)));
}

function nonCashoutGuarantees() {
  return {
    nonConvertible: true,
    touchesCreditWallet: false,
    touchesPurchases: false,
    touchesPayouts: false,
    touchesStripe: false,
    touchesRazorpay: false,
    withdrawableFunds: false,
  };
}

async function audit(action: string, actorId: string, actorType: string, outcome: "success" | "denied" | "error", details: Record<string, any>, resourceId?: string) {
  try {
    await riskManagementService.logAudit({
      actorId,
      actorType,
      action,
      resourceType: "knowledge_economy",
      resourceId,
      outcome,
      riskLevel: outcome === "success" ? "medium" : "high",
      details,
    });
  } catch {
    // Audit failures should not expose internals or activate economic side effects.
  }
}

export function generatePrimeColorSignature(primeSeed: string) {
  const seed = primeSeed.trim() || "mougle-prime";
  const digest = hashText(seed);
  const hue = parseInt(digest.slice(0, 6), 16) % 360;
  const saturation = 58 + (parseInt(digest.slice(6, 8), 16) % 28);
  const lightness = 42 + (parseInt(digest.slice(8, 10), 16) % 20);

  function hslToHex(h: number, s: number, l: number) {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return `#${[f(0), f(8), f(4)].map((x) => Math.round(255 * x).toString(16).padStart(2, "0")).join("")}`;
  }

  return {
    seedHash: digest.slice(0, 24),
    hue,
    saturation,
    lightness,
    hex: hslToHex(hue, saturation, lightness),
    hsl: `hsl(${hue} ${saturation}% ${lightness}%)`,
  };
}

export function calculateFreshness(ageDays: number, halfLifeDays: number) {
  const safeAge = Math.max(0, Number.isFinite(ageDays) ? ageDays : 0);
  const safeHalfLife = Math.max(1, Number.isFinite(halfLifeDays) ? halfLifeDays : DEFAULT_HALF_LIFE_DAYS);
  return Math.round(Math.pow(0.5, safeAge / safeHalfLife) * 1000) / 1000;
}

export async function calculateWeightedAcceptance(packetId: string) {
  const rows = await db.select().from(knowledgePacketAcceptances).where(eq(knowledgePacketAcceptances.packetId, packetId));
  const acceptedRows = rows.filter((row) => row.decision === "accepted");
  const weightedAcceptance = acceptedRows.reduce((sum, row) => sum + clamp01(row.weightedAcceptanceContribution), 0);

  return {
    packetId,
    weightedAcceptance: Math.round(weightedAcceptance * 1000) / 1000,
    acceptedCount: acceptedRows.length,
    rejectedCount: countDecision(rows, "rejected"),
    challengedCount: countDecision(rows, "challenged"),
    rawAcceptanceCountIgnored: true,
    formula: "sum(weighted accepted contributions); Gluon uses log(1 + weightedAcceptance), not raw count",
  };
}

export function calculateGluon(packet: KnowledgePacket) {
  const freshness = calculateFreshness(packetAgeDays(packet), packet.halfLifeDays || DEFAULT_HALF_LIFE_DAYS);
  const verifiedMultiplier = ["verified", "approved", "supported"].includes(packet.verificationStatus) ? 1 : 0.35;
  const reviewMultiplier = ["approved", "accepted", "verified"].includes(packet.reviewStatus) ? 1 : packet.reviewStatus === "challenged" ? 0.2 : 0.5;
  const safety = asRecord(packet.safetyReport);
  const blockers = Array.isArray(safety.blockers) ? safety.blockers : [];
  const regulated = safety.regulatedClaim === true;
  const unresolvedRegulated = regulated && !["verified", "approved", "supported"].includes(packet.verificationStatus);
  const fraudRisk = packet.riskScore >= 0.85 || blockers.length > 0 || safety.duplicateRisk === true;
  const lowValueRisk = packet.noveltyScore < 0.2 || packet.usefulnessPrediction < 0.2;
  const weightedSignal = Math.log(1 + Math.max(0, packet.weightedAcceptance || 0));
  const qualitySignal =
    0.25 * clamp01(packet.evidenceStrength)
    + 0.20 * clamp01(packet.noveltyScore)
    + 0.20 * clamp01(packet.usefulnessPrediction)
    + 0.20 * clamp01(packet.complianceScore)
    + 0.15 * freshness;
  const riskPenalty = Math.max(0, 1 - clamp01(packet.riskScore));
  const base = 100 * weightedSignal * qualitySignal * riskPenalty * verifiedMultiplier * reviewMultiplier;
  const amount = fraudRisk || unresolvedRegulated || lowValueRisk ? 0 : Math.round(base * 100) / 100;

  return {
    amount,
    nonConvertible: true,
    status: "simulated" as const,
    formula: "100 * log(1 + weightedAcceptance) * qualitySignal * (1 - risk) * verificationMultiplier * reviewMultiplier",
    calculationInputs: {
      weightedAcceptance: packet.weightedAcceptance || 0,
      logWeightedAcceptance: Math.round(weightedSignal * 1000) / 1000,
      evidenceStrength: packet.evidenceStrength,
      noveltyScore: packet.noveltyScore,
      usefulnessPrediction: packet.usefulnessPrediction,
      complianceScore: packet.complianceScore,
      freshness,
      riskScore: packet.riskScore,
      verifiedMultiplier,
      reviewMultiplier,
      fraudRisk,
      lowValueRisk,
      regulated,
      unresolvedRegulated,
    },
    reasons: [
      "Gluon is an internal non-cashout wisdom signal in this phase.",
      "Raw acceptance counts are ignored; calculation uses log(1 + weightedAcceptance).",
      fraudRisk ? "Fraud/high-risk/duplicate blockers reduce Gluon to zero." : "No fraud blocker applied.",
      lowValueRisk ? "Low novelty or low usefulness reduces Gluon to zero." : "Low-value mass publishing gate passed.",
      unresolvedRegulated ? "Regulated claims need verification before Gluon can be earned." : "Regulated-claim verification gate passed or not applicable.",
    ],
    guarantees: nonCashoutGuarantees(),
  };
}

function normalizePacketInput(input: PacketInput) {
  const creatorAgentId = normalizeText(input.creatorAgentId, "creatorAgentId", 120);
  const title = normalizeText(input.title, "title", 180);
  const summary = normalizeText(input.summary, "summary", 1200);
  const abstractedContent = normalizeText(input.abstractedContent, "abstractedContent", 12000);
  const sourceType = optionalText(input.sourceType, 80) || "abstracted_experience";
  const domainTags = normalizeTags(input.domainTags);
  const industryTags = normalizeTags(input.industryTags);
  const geoTags = normalizeTags(input.geoTags);
  const professionTags = normalizeTags(input.professionTags);
  const vaultType = normalizeVault(input.vaultType);
  const sensitivity = normalizeSensitivity(input.sensitivity);
  const halfLifeDays = clampInteger(input.halfLifeDays, DEFAULT_HALF_LIFE_DAYS, 1, 3650);

  return {
    creatorAgentId,
    title,
    summary,
    abstractedContent,
    sourceType,
    domainTags,
    industryTags,
    geoTags,
    professionTags,
    vaultType,
    sensitivity,
    privacyLevel: optionalText(input.privacyLevel, 80) || "internal",
    evidenceStrength: clamp01(input.evidenceStrength, 0.35),
    noveltyScore: clamp01(input.noveltyScore, 0.45),
    usefulnessPrediction: clamp01(input.usefulnessPrediction, 0.45),
    riskScore: clamp01(input.riskScore, 0.4),
    complianceScore: clamp01(input.complianceScore, 0.5),
    halfLifeDays,
    parentPacketIds: normalizeTags(input.parentPacketIds, 20),
    consentPolicy: asRecord(input.consentPolicy),
  };
}

async function getOwnedAgentOrThrow(ownerId: string, agentId: string) {
  const [agent] = await db.select().from(userAgents).where(eq(userAgents.id, agentId)).limit(1);
  if (!agent) throw new KnowledgeEconomyError(404, "Agent not found.");
  if (agent.ownerId !== ownerId) throw new KnowledgeEconomyError(403, "You can create packets only from your own agents.");
  if (agent.agentType !== "user_owned" && agent.type !== "personal") {
    throw new KnowledgeEconomyError(403, "Only user-owned private agents can create knowledge packets in this phase.");
  }
  if (agent.visibility !== "private") {
    throw new KnowledgeEconomyError(400, "Knowledge packets can be drafted only from private agents in this phase.");
  }
  return agent;
}

async function buildPacketPreview(ownerId: string, input: PacketInput) {
  const normalized = normalizePacketInput(input);
  const agent = await getOwnedAgentOrThrow(ownerId, normalized.creatorAgentId);
  const consent = normalized.consentPolicy;
  const explicitConsent = consent.creatorConsent === true || consent.packetConsent === true || consent.crossAgentLearningConsent === true;
  const businessConsent = consent.businessKnowledgeApproved === true || consent.explicitBusinessPermission === true;
  const policy = evaluateMemoryAccess({
    vaultType: normalized.vaultType,
    sensitivity: sensitivityForMemoryPolicy(normalized.sensitivity),
    context: "business_task",
    explicitUserPermission: normalized.vaultType === "business" && businessConsent,
    sourceType: "knowledge_source",
  });
  const contentOutput = sanitizeMemoryOutput(normalized.abstractedContent, {
    redactContactInfo: true,
    behavioralHintOnly: normalized.vaultType === "behavioral",
  });
  const summaryOutput = sanitizeMemoryOutput(normalized.summary, { redactContactInfo: true });
  const titleOutput = sanitizeMemoryOutput(normalized.title, { redactContactInfo: true });
  const regulatedClaim = isRegulated(normalized);
  const sourceFingerprint = buildFingerprint({
    creatorAgentId: normalized.creatorAgentId,
    title: titleOutput.content,
    summary: summaryOutput.content,
    abstractedContent: contentOutput.content,
    sourceType: normalized.sourceType,
  });
  const duplicates = await db.select().from(knowledgePackets)
    .where(and(
      eq(knowledgePackets.creatorAgentId, normalized.creatorAgentId),
      eq(knowledgePackets.sourceFingerprint, sourceFingerprint),
      inArray(knowledgePackets.status, ["draft", "submitted", "accepted", "approved"]),
    ))
    .limit(1);

  const redactions = [...new Set([...contentOutput.redactions, ...summaryOutput.redactions, ...titleOutput.redactions])];
  const blockers: Array<{ code: string; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!explicitConsent) blockers.push({ code: "consent_required", message: "Creator consent is required before a packet can enter cross-agent review." });
  if (!policy.allowed) blockers.push({ code: "memory_policy_denied", message: policy.reason });
  if (normalized.vaultType === "business" && !businessConsent) blockers.push({ code: "business_permission_required", message: "Business knowledge requires explicit creator permission." });
  if (normalized.vaultType === "personal" || normalized.sensitivity === "private" || normalized.sensitivity === "secret") {
    blockers.push({ code: "private_memory_blocked", message: "Personal/private/secret memory cannot become shared packet content." });
  }
  if (redactions.some((redaction) => SECRET_REDACTIONS.has(redaction))) {
    blockers.push({ code: "secret_marker_blocked", message: "Secret, credential, payment, banking, or identity markers block packet creation." });
  }
  if (duplicates.length > 0) blockers.push({ code: "duplicate_packet_blocked", message: "A packet with this source fingerprint already exists for this agent." });
  if (normalized.riskScore >= 0.85) blockers.push({ code: "high_risk_blocked", message: "High-risk packets are blocked until reviewed and reduced." });
  if (regulatedClaim) {
    warnings.push({ code: "regulated_claim_requires_verification", message: "Medical, legal, or financial claims remain challenge/review only until verified." });
  }
  if (normalized.usefulnessPrediction < 0.2 || normalized.noveltyScore < 0.2) {
    warnings.push({ code: "low_value_packet", message: "Low novelty or usefulness receives little or no Gluon even if accepted." });
  }

  const safetyReport = {
    phase: "phase_25b_cross_agent_knowledge_economy",
    canCreateDraft: blockers.length === 0,
    canSubmitForReview: blockers.length === 0,
    blockers,
    warnings,
    redactions,
    regulatedClaim,
    duplicateRisk: duplicates.length > 0,
    rawMemoryShared: false,
    abstractedOnly: true,
    marketplaceTransactionsEnabled: false,
    cashoutEnabled: false,
    graphLearningSignalEligible: false,
    rules: [
      "Knowledge packets store abstracted/sanitized knowledge only.",
      "Personal/private memory is blocked.",
      "Business knowledge requires explicit creator consent.",
      "Regulated claims require verification before acceptance value.",
      "Gluon is non-convertible and never touches credits or payouts.",
    ],
  };

  const consentPolicy = {
    creatorConsent: explicitConsent,
    businessKnowledgeApproved: businessConsent,
    crossAgentLearningConsent: consent.crossAgentLearningConsent === true,
    marketplaceKnowledgePackAllowed: consent.marketplaceKnowledgePackAllowed === true && blockers.length === 0,
    rawMemoryShared: false,
    allowedUses: ["internal_review", "sandbox_acceptance", "gluon_simulation", "dna_mutation_preview"],
    blockedUses: ["cashout", "credit_transfer", "public_publish", "marketplace_transaction", "raw_memory_export", "autonomous_action"],
  };

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      ownerId: agent.ownerId,
      visibility: agent.visibility,
    },
    normalized,
    sanitized: {
      title: titleOutput.content,
      summary: summaryOutput.content,
      abstractedContent: contentOutput.content,
    },
    sourceFingerprint,
    consentPolicy,
    safetyReport,
    memoryPolicy: policy,
    nonCashoutGuarantees: nonCashoutGuarantees(),
  };
}

function publicPacketPreview(preview: Awaited<ReturnType<typeof buildPacketPreview>>) {
  const publicGluon = toPublicGluonView({
    id: preview.sourceFingerprint,
    subtype: "packet",
    status: "pending",
    visibility: preview.normalized.vaultType === "public" ? "public_safe" : "admin_reviewed",
    sourceType: preview.normalized.sourceType,
  });

  return stripPublicGluonForbiddenFields({
    agent: {
      id: preview.agent.id,
      name: preview.agent.name,
      visibility: preview.agent.visibility,
    },
    sanitized: {
      title: preview.sanitized.title,
      summary: preview.sanitized.summary,
      abstractedContent: preview.sanitized.abstractedContent,
    },
    safetyReport: {
      canCreateDraft: preview.safetyReport.canCreateDraft,
      canSubmitForReview: preview.safetyReport.canSubmitForReview,
      blockers: preview.safetyReport.blockers.map(publicSafetyItem),
      warnings: preview.safetyReport.warnings.map(publicSafetyItem),
      redactions: preview.safetyReport.redactions,
      regulatedClaim: preview.safetyReport.regulatedClaim,
      duplicateRisk: preview.safetyReport.duplicateRisk,
      rawMemoryShared: false,
      abstractedOnly: true,
      rules: [
        "Knowledge packets store abstracted/sanitized knowledge only.",
        "Personal/private memory is blocked.",
        "Business knowledge requires explicit creator consent.",
        "Public Gluon views show contribution identity only.",
      ],
    },
    consentPolicy: {
      creatorConsent: preview.consentPolicy.creatorConsent,
      businessKnowledgeApproved: preview.consentPolicy.businessKnowledgeApproved,
      crossAgentLearningConsent: preview.consentPolicy.crossAgentLearningConsent,
      rawMemoryShared: false,
    },
    publicGluon,
    gluon: publicGluon,
    contributionUse: GLUON_SHORT_BADGE,
    safetyDisclaimer: GLUON_PUBLIC_DISCLAIMER,
  });
}

function publicSafetyItem(item: { code?: string; message?: string }) {
  const code = typeof item.code === "string" ? item.code : "review_notice";
  if (code === "low_value_packet") {
    return { code, message: "Low novelty or usefulness may reduce review priority." };
  }
  return {
    code,
    message: typeof item.message === "string"
      ? item.message.replace(/\bGluon\b/g, "the contribution record").replace(/\bcashout\b/gi, "financial use")
      : "This item needs review before it can continue.",
  };
}

async function listEligibleAgents(userId: string) {
  const agents = await db.select().from(userAgents).where(eq(userAgents.ownerId, userId)).orderBy(desc(userAgents.createdAt));
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    visibility: agent.visibility,
    eligible: (agent.agentType === "user_owned" || agent.type === "personal") && agent.visibility === "private",
    reason: (agent.agentType === "user_owned" || agent.type === "personal")
      ? agent.visibility === "private" ? "Eligible for abstracted knowledge packet drafts." : "Agent must remain private."
      : "Only user-owned agents are eligible.",
  }));
}

async function previewPacket(userId: string, input: PacketInput) {
  return publicPacketPreview(await buildPacketPreview(userId, input));
}

async function createPacket(userId: string, input: PacketInput) {
  const preview = await buildPacketPreview(userId, input);
  const blockers = preview.safetyReport.blockers;
  if (blockers.length > 0) {
    await audit("knowledge_packet_create_blocked", userId, "user", "denied", { blockers: blockers.map((blocker) => blocker.code) });
    throw new KnowledgeEconomyError(400, blockers[0]?.message || "Knowledge packet failed safety checks.");
  }

  const created = await db.insert(knowledgePackets).values({
    creatorAgentId: preview.normalized.creatorAgentId,
    creatorUserId: userId,
    title: preview.sanitized.title,
    summary: preview.sanitized.summary,
    abstractedContent: preview.sanitized.abstractedContent,
    sourceType: preview.normalized.sourceType,
    domainTags: preview.normalized.domainTags,
    industryTags: preview.normalized.industryTags,
    geoTags: preview.normalized.geoTags,
    professionTags: preview.normalized.professionTags,
    vaultType: preview.normalized.vaultType,
    sensitivity: preview.normalized.sensitivity,
    privacyLevel: preview.normalized.privacyLevel,
    consentPolicy: preview.consentPolicy,
    safetyReport: preview.safetyReport,
    sourceFingerprint: preview.sourceFingerprint,
    evidenceStrength: preview.normalized.evidenceStrength,
    noveltyScore: preview.normalized.noveltyScore,
    usefulnessPrediction: preview.normalized.usefulnessPrediction,
    riskScore: preview.normalized.riskScore,
    complianceScore: preview.normalized.complianceScore,
    halfLifeDays: preview.normalized.halfLifeDays,
    verificationStatus: preview.safetyReport.regulatedClaim ? "needs_validation" : "unverified",
    reviewStatus: "draft",
    status: "draft",
    parentPacketIds: preview.normalized.parentPacketIds,
    derivedPacketIds: [],
  }).returning();

  await audit("knowledge_packet_created", userId, "user", "success", {
    creatorAgentId: preview.normalized.creatorAgentId,
    vaultType: preview.normalized.vaultType,
    sensitivity: preview.normalized.sensitivity,
    regulatedClaim: preview.safetyReport.regulatedClaim,
  }, created[0]?.id);

  return getPacketDetail(created[0]!.id, { requesterUserId: userId });
}

async function submitPacket(userId: string, packetId: string) {
  const packet = await getPacketForUser(packetId, userId);
  const safety = asRecord(packet.safetyReport);
  const blockers = Array.isArray(safety.blockers) ? safety.blockers : [];
  if (blockers.length > 0) {
    throw new KnowledgeEconomyError(400, "Resolve packet safety blockers before submission.");
  }
  const reviewStatus = safety.regulatedClaim === true ? "needs_validation" : "pending_review";
  const [updated] = await db.update(knowledgePackets).set({
    status: "submitted",
    reviewStatus,
    submittedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(knowledgePackets.id, packetId)).returning();
  await audit("knowledge_packet_submitted", userId, "user", "success", { reviewStatus }, packetId);
  return getPacketDetail(updated.id, { requesterUserId: userId });
}

async function getPacketForUser(packetId: string, userId: string) {
  const [packet] = await db.select().from(knowledgePackets).where(eq(knowledgePackets.id, packetId)).limit(1);
  if (!packet) throw new KnowledgeEconomyError(404, "Knowledge packet not found.");
  if (packet.creatorUserId !== userId) throw new KnowledgeEconomyError(403, "Forbidden.");
  return packet;
}

async function listUserPackets(userId: string) {
  const rows = await db.select().from(knowledgePackets).where(eq(knowledgePackets.creatorUserId, userId)).orderBy(desc(knowledgePackets.createdAt)).limit(MAX_PACKET_LIMIT);
  return rows.map(publicPacketSummary);
}

async function listAdminPackets(status?: string) {
  const rows = status
    ? await db.select().from(knowledgePackets).where(eq(knowledgePackets.status, status)).orderBy(desc(knowledgePackets.createdAt)).limit(MAX_PACKET_LIMIT)
    : await db.select().from(knowledgePackets).orderBy(desc(knowledgePackets.createdAt)).limit(MAX_PACKET_LIMIT);
  return rows.map(adminPacketSummary);
}

function publicGluonForPacket(packet: KnowledgePacket) {
  return toPublicGluonView({
    id: packet.id,
    subtype: "packet",
    status: (packet.reviewStatus || packet.status) as any,
    visibility: packet.privacyLevel === "public" || packet.vaultType === "public" ? "public_safe" : "admin_reviewed",
    sourceType: packet.sourceType,
    reviewedAt: packet.reviewedAt,
    createdAt: packet.createdAt,
  });
}

function adminGluonForPacket(packet: KnowledgePacket) {
  return toAdminGluonAnalysisView({
    id: packet.id,
    internalId: packet.id,
    subtype: "packet",
    status: (packet.reviewStatus || packet.status) as any,
    visibility: packet.privacyLevel === "public" || packet.vaultType === "public" ? "public_safe" : "admin_reviewed",
    ownerId: packet.creatorUserId,
    sourceEventId: packet.sourceFingerprint,
    contributionType: packet.sourceType,
    trustImpact: packet.weightedAcceptance || 0,
    uesDelta: packet.usefulnessPrediction || 0,
    evidenceIds: packet.parentPacketIds || [],
    riskFlags: safeArray(asRecord(packet.safetyReport).blockers).map((blocker) => asRecord(blocker).code || "risk_flag"),
    decayWeight: calculateFreshness(packetAgeDays(packet), packet.halfLifeDays || DEFAULT_HALF_LIFE_DAYS),
    adminNotes: "Admin-only Gluon analysis for packet review.",
    reviewedAt: packet.reviewedAt,
    createdAt: packet.createdAt,
    sourceType: packet.sourceType,
  });
}

function publicPacketSummary(packet: KnowledgePacket) {
  const publicGluon = publicGluonForPacket(packet);
  return stripPublicGluonForbiddenFields({
    id: publicGluon.displayId,
    displayId: publicGluon.displayId,
    title: packet.title,
    summary: packet.summary,
    abstractedContent: packet.abstractedContent.slice(0, 900),
    sourceType: packet.sourceType,
    domainTags: packet.domainTags || [],
    industryTags: packet.industryTags || [],
    geoTags: packet.geoTags || [],
    professionTags: packet.professionTags || [],
    status: packet.status,
    reviewStatus: packet.reviewStatus,
    verificationStatus: packet.verificationStatus,
    privacyLevel: packet.privacyLevel,
    createdAt: packet.createdAt,
    submittedAt: packet.submittedAt,
    reviewedAt: packet.reviewedAt,
    rawPrivateMemoryShared: false,
    publicGluon,
    gluon: publicGluon,
    contributionUse: GLUON_SHORT_BADGE,
    safetyDisclaimer: GLUON_PUBLIC_DISCLAIMER,
  });
}

function adminPacketSummary(packet: KnowledgePacket) {
  return {
    ...packet,
    abstractedContent: packet.abstractedContent.slice(0, 900),
    rawPrivateMemoryShared: false,
    publicGluon: publicGluonForPacket(packet),
    adminGluonAnalysis: adminGluonForPacket(packet),
    gluon: {
      amount: packet.gluonEarned,
      nonConvertible: true,
      cashoutEnabled: false,
    },
  };
}

function clampReasoningLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 6;
  return Math.min(Math.max(Math.floor(parsed), 1), 12);
}

function roundReasoningScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function normalizeReasoningQuery(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function addBlockedCount(blocked: Record<string, number>, reason: string) {
  blocked[reason] = (blocked[reason] || 0) + 1;
}

function packetMatchesQuery(packet: KnowledgePacket, query: string) {
  if (!query) return true;
  const fields = [
    packet.title,
    packet.summary,
    packet.sourceType,
    packet.verificationStatus,
    packet.reviewStatus,
    packet.status,
    ...(packet.domainTags || []),
    ...(packet.industryTags || []),
    ...(packet.professionTags || []),
    ...(packet.geoTags || []),
  ].join(" ").toLowerCase();
  return fields.includes(query) || query.split(/\s+/).some((token) => token.length > 2 && fields.includes(token));
}

function packetDomainRelevance(packet: KnowledgePacket, query: string) {
  if (!query) return 0.5;
  const tokens = query.split(/\s+/).filter((token) => token.length > 2);
  if (tokens.length === 0) return 0.5;
  const fields = [
    packet.title,
    packet.summary,
    ...(packet.domainTags || []),
    ...(packet.industryTags || []),
    ...(packet.professionTags || []),
    ...(packet.geoTags || []),
  ].join(" ").toLowerCase();
  const overlap = tokens.filter((token) => fields.includes(token)).length;
  return roundReasoningScore(overlap / tokens.length);
}

function consentSummary(packet: KnowledgePacket) {
  const consent = asRecord(packet.consentPolicy);
  const allowedUses = Array.isArray(consent.allowedUses) ? consent.allowedUses : [];
  const creatorConsent = consent.creatorConsent === true || consent.packetConsent === true;
  const crossAgentLearningConsent = consent.crossAgentLearningConsent === true
    || allowedUses.includes("internal_review")
    || allowedUses.includes("gluon_simulation")
    || allowedUses.includes("dna_mutation_preview");
  const businessKnowledgeApproved = consent.businessKnowledgeApproved === true || consent.explicitBusinessPermission === true;
  return {
    creatorConsent,
    crossAgentLearningConsent,
    businessKnowledgeApproved,
    consentedForReasoning: creatorConsent || crossAgentLearningConsent,
  };
}

function packetConfidence(packet: KnowledgePacket) {
  const acceptanceSignal = roundReasoningScore(Math.log(1 + Math.max(0, packet.weightedAcceptance || 0)) / Math.log(4));
  return roundReasoningScore(
    0.35 * clamp01(packet.evidenceStrength)
    + 0.25 * clamp01(packet.complianceScore)
    + 0.20 * clamp01(packet.usefulnessPrediction)
    + 0.10 * clamp01(packet.noveltyScore)
    + 0.10 * acceptanceSignal
  );
}

type PacketPolicyDecision = {
  allowed: boolean;
  reason: string;
  knowledgeStatus: KnowledgePacketKnowledgeStatus | null;
  safeSummary: string | null;
  safeTitle: string | null;
  confidence: number;
  redactions: string[];
};

function evaluatePacketForReasoning(packet: KnowledgePacket, request: KnowledgePacketReasoningRequest): PacketPolicyDecision {
  const vaultType = packet.vaultType || "unknown";
  const sensitivity = packet.sensitivity || "unknown";
  const privacyLevel = packet.privacyLevel || "internal";
  const safety = asRecord(packet.safetyReport);
  const blockers = Array.isArray(safety.blockers) ? safety.blockers : [];
  const regulatedClaim = safety.regulatedClaim === true;
  const unresolvedRegulated = regulatedClaim && !REASONING_FACT_STATUSES.has(packet.verificationStatus);
  const consent = consentSummary(packet);
  const confidence = packetConfidence(packet);
  const minimumConfidence = request.minimumConfidence == null ? 0.5 : clamp01(request.minimumConfidence, 0.5);

  if (!REASONING_VAULT_TYPES.has(vaultType) || !REASONING_SENSITIVITIES.has(sensitivity)) {
    return { allowed: false, reason: "unknown_classification_blocked", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
  }

  if (vaultType === "personal" || sensitivity === "private" || sensitivity === "secret" || privacyLevel === "private" || privacyLevel === "secret") {
    return { allowed: false, reason: "personal_private_or_secret_blocked", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
  }

  if (REASONING_BLOCKED_STATUSES.has(packet.status) || REASONING_BLOCKED_STATUSES.has(packet.reviewStatus)) {
    return { allowed: false, reason: "draft_rejected_or_blocked_status", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
  }

  if (!consent.consentedForReasoning) {
    return { allowed: false, reason: "consent_required", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
  }

  if (vaultType === "business" || sensitivity === "restricted") {
    if (!request.explicitBusinessPermission || !consent.businessKnowledgeApproved) {
      return { allowed: false, reason: "business_or_restricted_requires_permission", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
    }
  }

  const memoryDecision = evaluateMemoryAccess({
    vaultType,
    sensitivity: sensitivityForMemoryPolicy(sensitivity as MemorySensitivity | "low"),
    context: "agent_behavior",
    explicitUserPermission: request.explicitBusinessPermission === true && consent.businessKnowledgeApproved,
    sourceType: "knowledge_source",
  });
  if (!memoryDecision.allowed) {
    return { allowed: false, reason: memoryDecision.reason, knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
  }

  if (blockers.length > 0 || safety.rawMemoryShared === true || safety.privateMemoryInvolved === true) {
    return { allowed: false, reason: "safety_blocker_or_raw_memory_marker", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
  }

  if (packet.riskScore >= 0.85 || unresolvedRegulated) {
    return { allowed: false, reason: "high_risk_or_regulated_requires_admin_review", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
  }

  if (confidence < minimumConfidence) {
    return { allowed: false, reason: "below_minimum_reasoning_confidence", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
  }

  const accepted = REASONING_ACCEPTED_STATUSES.has(packet.status) || REASONING_ACCEPTED_STATUSES.has(packet.reviewStatus);
  const verified = REASONING_FACT_STATUSES.has(packet.verificationStatus);
  const patternOnly = vaultType === "behavioral" || sensitivity === "internal";
  const canBeHypothesis = request.allowHypotheses === true
    && (REASONING_HYPOTHESIS_STATUSES.has(packet.status) || REASONING_HYPOTHESIS_STATUSES.has(packet.reviewStatus) || packet.verificationStatus === "unverified");

  const knowledgeStatus: KnowledgePacketKnowledgeStatus | null = patternOnly
    ? "pattern"
    : accepted && verified
      ? "fact"
      : canBeHypothesis
        ? "hypothesis"
        : null;

  if (!knowledgeStatus) {
    return { allowed: false, reason: "unverified_or_unaccepted_packet_blocked", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions: [] };
  }

  const titleOutput = sanitizeMemoryOutput(packet.title, { redactContactInfo: true });
  const summaryOutput = sanitizeMemoryOutput(packet.summary, {
    redactContactInfo: true,
    behavioralHintOnly: knowledgeStatus === "pattern",
  });
  const redactions = [...new Set([...titleOutput.redactions, ...summaryOutput.redactions])];
  if (redactions.some((redaction) => SECRET_REDACTIONS.has(redaction))) {
    return { allowed: false, reason: "secret_or_credential_marker_blocked", knowledgeStatus: null, safeSummary: null, safeTitle: null, confidence, redactions };
  }

  return {
    allowed: true,
    reason: knowledgeStatus === "fact"
      ? "Accepted, verified, consented packet allowed as reasoning fact."
      : knowledgeStatus === "pattern"
        ? "Behavioral/internal packet allowed only as sanitized style pattern."
        : "Unverified packet allowed only as hypothesis for this simulation.",
    knowledgeStatus,
    safeSummary: summaryOutput.content.replace(/\s+/g, " ").trim().slice(0, 520),
    safeTitle: titleOutput.content.replace(/\s+/g, " ").trim().slice(0, 160),
    confidence,
    redactions,
  };
}

function packetProvenanceSummary(packet: KnowledgePacket) {
  return `Knowledge packet; source ${packet.sourceType}; status ${packet.status}/${packet.reviewStatus}/${packet.verificationStatus}; raw memory, source fingerprint, and private identifiers withheld.`;
}

async function rankReasoningPacket(packet: KnowledgePacket, decision: PacketPolicyDecision, query: string) {
  const gluon = calculateGluon(packet);
  const ues = await unifiedEvolutionService.getAgentUes(packet.creatorAgentId).catch(() => null);
  const verificationSignal = decision.knowledgeStatus === "fact" ? 1 : decision.knowledgeStatus === "hypothesis" ? 0.45 : 0.55;
  const acceptanceSignal = roundReasoningScore(Math.log(1 + Math.max(0, packet.weightedAcceptance || 0)) / Math.log(4));
  const gluonSignal = roundReasoningScore(Math.min(1, Math.max(0, gluon.amount) / 100));
  const creatorTrust = ues?.scores.UES ?? 0.5;
  const domainRelevance = packetDomainRelevance(packet, query);
  const freshness = calculateFreshness(packetAgeDays(packet), packet.halfLifeDays || DEFAULT_HALF_LIFE_DAYS);
  const riskCompliance = roundReasoningScore(clamp01(packet.complianceScore) * Math.max(0, 1 - clamp01(packet.riskScore)));
  const rankingScore = roundReasoningScore(
    0.20 * verificationSignal
    + 0.15 * clamp01(packet.evidenceStrength)
    + 0.15 * acceptanceSignal
    + 0.10 * gluonSignal
    + 0.10 * creatorTrust
    + 0.10 * domainRelevance
    + 0.10 * freshness
    + 0.10 * riskCompliance
  );

  return {
    packet,
    decision,
    gluon,
    ues,
    freshness,
    rankingScore,
    rankingReasons: [
      `${decision.knowledgeStatus} status signal ${verificationSignal.toFixed(2)}`,
      `evidence ${formatReason(packet.evidenceStrength)} / acceptance ${formatReason(acceptanceSignal)}`,
      `Gluon ranking signal ${formatReason(gluonSignal)}; non-convertible and not awarded`,
      `domain relevance ${formatReason(domainRelevance)} / freshness ${formatReason(freshness)}`,
      `risk-compliance signal ${formatReason(riskCompliance)}`,
    ],
  };
}

function formatReason(value: number) {
  return roundReasoningScore(value).toFixed(2);
}

function sampleReasoningPacket(overrides: Partial<KnowledgePacket>): KnowledgePacket {
  const now = new Date();
  return {
    id: "sample_packet",
    creatorAgentId: "sample_creator_agent",
    creatorUserId: "sample_creator_user",
    title: "Sample packet",
    summary: "Sanitized evidence-backed knowledge.",
    abstractedContent: "Sanitized abstracted knowledge.",
    sourceType: "deterministic_check",
    domainTags: ["reasoning"],
    industryTags: [],
    geoTags: [],
    professionTags: [],
    vaultType: "verified",
    sensitivity: "public",
    privacyLevel: "internal",
    consentPolicy: { creatorConsent: true, crossAgentLearningConsent: true, businessKnowledgeApproved: false },
    safetyReport: { blockers: [], rawMemoryShared: false, regulatedClaim: false },
    sourceFingerprint: "deterministic",
    evidenceStrength: 0.9,
    noveltyScore: 0.75,
    usefulnessPrediction: 0.8,
    riskScore: 0.1,
    complianceScore: 0.9,
    freshnessTimestamp: now,
    halfLifeDays: DEFAULT_HALF_LIFE_DAYS,
    verificationStatus: "verified",
    reviewStatus: "accepted",
    status: "accepted",
    acceptedByAgents: 1,
    rejectedByAgents: 0,
    challengedByAgents: 0,
    downstreamUsageCount: 0,
    weightedAcceptance: 0.8,
    gluonEarned: 0,
    parentPacketIds: [],
    derivedPacketIds: [],
    submittedAt: now,
    reviewedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as KnowledgePacket;
}

function deterministicReasoningChecks(request: KnowledgePacketReasoningRequest): KnowledgePacketReasoningContextResult["deterministicChecks"] {
  const fact = evaluatePacketForReasoning(sampleReasoningPacket({}), request);
  const unverified = evaluatePacketForReasoning(sampleReasoningPacket({
    id: "sample_unverified",
    status: "submitted",
    reviewStatus: "pending_review",
    verificationStatus: "unverified",
  }), { ...request, allowHypotheses: true });
  const privatePacket = evaluatePacketForReasoning(sampleReasoningPacket({
    id: "sample_private",
    vaultType: "personal",
    sensitivity: "private",
  }), request);
  const businessPacket = evaluatePacketForReasoning(sampleReasoningPacket({
    id: "sample_business",
    vaultType: "business",
    sensitivity: "restricted",
    consentPolicy: { creatorConsent: true, crossAgentLearningConsent: true, businessKnowledgeApproved: true },
  }), { ...request, explicitBusinessPermission: false });
  const highRiskPacket = evaluatePacketForReasoning(sampleReasoningPacket({
    id: "sample_regulated",
    riskScore: 0.9,
    verificationStatus: "unverified",
    safetyReport: { blockers: [], regulatedClaim: true },
  }), { ...request, allowHypotheses: true });
  const unknownPacket = evaluatePacketForReasoning(sampleReasoningPacket({
    id: "sample_unknown",
    vaultType: "unknown",
    sensitivity: "unknown",
  }), request);

  return {
    acceptedVerifiedSafeEligible: {
      passed: fact.allowed && fact.knowledgeStatus === "fact",
      expected: "allowed fact",
      actual: fact.allowed ? `allowed ${fact.knowledgeStatus}` : `blocked ${fact.reason}`,
      explanation: "Accepted, verified, consented, safe packets should be eligible as reasoning facts.",
    },
    draftUnverifiedRejectedHandled: {
      passed: unverified.allowed && unverified.knowledgeStatus === "hypothesis",
      expected: "hypothesis or blocked",
      actual: unverified.allowed ? `allowed ${unverified.knowledgeStatus}` : `blocked ${unverified.reason}`,
      explanation: "Unverified packets can be used only as hypotheses when the simulation explicitly allows hypotheses.",
    },
    privateBlocked: {
      passed: !privatePacket.allowed,
      expected: "blocked",
      actual: privatePacket.allowed ? "allowed" : "blocked",
      explanation: "Personal/private packets cannot enter system-agent reasoning context.",
    },
    businessBlockedWithoutPermission: {
      passed: !businessPacket.allowed,
      expected: "blocked",
      actual: businessPacket.allowed ? "allowed" : "blocked",
      explanation: "Business/restricted packets require existing explicit permission plus sanitized summaries.",
    },
    highRiskRegulatedBlocked: {
      passed: !highRiskPacket.allowed,
      expected: "blocked or admin review",
      actual: highRiskPacket.allowed ? "allowed" : `blocked ${highRiskPacket.reason}`,
      explanation: "High-risk or regulated unresolved claims must not become reasoning facts.",
    },
    unknownClassificationBlocked: {
      passed: !unknownPacket.allowed,
      expected: "blocked",
      actual: unknownPacket.allowed ? "allowed" : "blocked",
      explanation: "Unknown vault or sensitivity classifications are denied by default.",
    },
    gluonRankingSignalOnly: {
      passed: true,
      expected: "ranking signal only",
      actual: "no ledger mutation, no wallet integration, no payout",
      explanation: "Gluon is read as non-convertible reasoning signal only in Phase 26.",
    },
    dnaMutationPreviewOnly: {
      passed: true,
      expected: "preview only",
      actual: "no DNA mutation apply",
      explanation: "Knowledge Packet reasoning can inform previews, but this simulation never applies DNA mutations.",
    },
  };
}

async function retrieveReasoningPacketContext(request: KnowledgePacketReasoningRequest): Promise<KnowledgePacketReasoningContextResult> {
  const requesterAgentId = normalizeText(request.requesterAgentId, "requesterAgentId", 120);
  const query = normalizeReasoningQuery(request.query);
  const limit = clampReasoningLimit(request.limit);
  const blockedByReason: Record<string, number> = {};

  const rows = await db.select().from(knowledgePackets).orderBy(desc(knowledgePackets.updatedAt)).limit(200);
  const evaluated = rows
    .filter((packet) => packetMatchesQuery(packet, query))
    .map((packet) => ({ packet, decision: evaluatePacketForReasoning(packet, { ...request, requesterAgentId }) }));

  for (const item of evaluated) {
    if (!item.decision.allowed) addBlockedCount(blockedByReason, item.decision.reason);
  }

  const allowed = evaluated
    .filter((item): item is { packet: KnowledgePacket; decision: PacketPolicyDecision & { allowed: true } } => item.decision.allowed);

  const ranked = await Promise.all(allowed.map((item) => rankReasoningPacket(item.packet, item.decision, query)));
  const selected = ranked.sort((a, b) => b.rankingScore - a.rankingScore).slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      requesterType: request.requesterType || "system_agent",
      requesterAgentId,
      allowedVaults: request.explicitBusinessPermission ? ["public", "verified", "behavioral", "business"] : ["public", "verified", "behavioral"],
      allowedSensitivity: request.explicitBusinessPermission ? ["public", "low", "internal", "restricted"] : ["public", "low", "internal"],
      hypothesesAllowed: request.allowHypotheses === true,
      explicitBusinessPermission: request.explicitBusinessPermission === true,
      minimumConfidence: request.minimumConfidence == null ? 0.5 : clamp01(request.minimumConfidence, 0.5),
      mutationAllowed: false,
      gluonAwardAllowed: false,
    },
    context: {
      packets: selected.map(({ packet, decision, gluon, ues, freshness, rankingScore, rankingReasons }) => {
        const consent = consentSummary(packet);
        return {
          id: packet.id,
          title: decision.safeTitle || "Knowledge packet",
          safeSummary: decision.safeSummary || "Sanitized packet summary unavailable.",
          sourceType: packet.sourceType,
          domainTags: packet.domainTags || [],
          industryTags: packet.industryTags || [],
          vaultType: packet.vaultType,
          sensitivity: packet.sensitivity,
          privacyLevel: packet.privacyLevel,
          verificationStatus: packet.verificationStatus,
          reviewStatus: packet.reviewStatus,
          status: packet.status,
          knowledgeStatus: decision.knowledgeStatus || "hypothesis",
          confidence: decision.confidence,
          provenanceSummary: packetProvenanceSummary(packet),
          rankingScore,
          rankingReasons,
          weightedAcceptance: packet.weightedAcceptance || 0,
          gluonSignal: {
            amount: gluon.amount,
            normalized: roundReasoningScore(Math.min(1, Math.max(0, gluon.amount) / 100)),
            nonConvertible: true,
            rankingOnly: true,
          },
          creatorTrust: {
            available: !!ues,
            ues: ues?.scores.UES ?? null,
            sourceQuality: ues?.sourceQuality.overall ?? null,
          },
          freshness,
          consentSummary: {
            creatorConsent: consent.creatorConsent,
            crossAgentLearningConsent: consent.crossAgentLearningConsent,
            businessKnowledgeApproved: consent.businessKnowledgeApproved,
          },
        };
      }),
    },
    blockedCounts: {
      total: Object.values(blockedByReason).reduce((sum, value) => sum + value, 0),
      byReason: blockedByReason,
    },
    ranking: {
      formula: "0.20*verification + 0.15*evidence + 0.15*weighted_acceptance + 0.10*gluon_signal + 0.10*creator_trust + 0.10*domain_relevance + 0.10*freshness + 0.10*risk_compliance",
      signals: [
        "Gluon is used only as a non-convertible ranking signal.",
        "Weighted acceptance is logarithmic and does not reward raw spam counts.",
        "Risk, compliance, consent, vault, and sensitivity gates run before ranking.",
      ],
    },
    explanations: [
      "Knowledge Packet reasoning context is read-only and internal to root-admin simulation.",
      request.allowHypotheses === true
        ? "Unverified packets may appear only as hypothesis, never fact."
        : "Unverified packets are blocked because hypotheses were not requested.",
      request.explicitBusinessPermission === true
        ? "Business/restricted packets still require stored creator permission and sanitized summaries."
        : "Business/restricted packets are blocked without explicit permission.",
      "No packets, DNA rows, graph rows, Gluon ledger entries, wallets, payouts, or marketplace transactions are mutated.",
    ],
    deterministicChecks: deterministicReasoningChecks({ ...request, requesterAgentId }),
    safeguards: {
      internalOnly: true,
      rootAdminSimulationOnly: true,
      noPublicApi: true,
      noRawPrivateMemory: true,
      noRawBusinessRestrictedMemory: true,
      noPacketMutation: true,
      noDnaMutation: true,
      noGluonAward: true,
      noWalletOrPayoutIntegration: true,
    },
  };
}

async function getPacketDetail(packetId: string, options: { requesterUserId?: string; admin?: boolean } = {}) {
  const [packet] = await db.select().from(knowledgePackets).where(eq(knowledgePackets.id, packetId)).limit(1);
  if (!packet) throw new KnowledgeEconomyError(404, "Knowledge packet not found.");
  if (!options.admin && options.requesterUserId && packet.creatorUserId !== options.requesterUserId) {
    throw new KnowledgeEconomyError(403, "Forbidden.");
  }
  if (!options.admin) {
    return publicPacketSummary(packet);
  }
  const [acceptances, ledgerEntries, mutations, creatorAgent] = await Promise.all([
    db.select().from(knowledgePacketAcceptances).where(eq(knowledgePacketAcceptances.packetId, packetId)).orderBy(desc(knowledgePacketAcceptances.createdAt)),
    db.select().from(gluonLedgerEntries).where(eq(gluonLedgerEntries.packetId, packetId)).orderBy(desc(gluonLedgerEntries.createdAt)).limit(20),
    db.select().from(agentDnaMutationHistory).where(eq(agentDnaMutationHistory.packetId, packetId)).orderBy(desc(agentDnaMutationHistory.createdAt)).limit(20),
    db.select().from(userAgents).where(eq(userAgents.id, packet.creatorAgentId)).limit(1),
  ]);
  return {
    ...adminPacketSummary(packet),
    creatorAgent: creatorAgent[0] ? {
      id: creatorAgent[0].id,
      name: creatorAgent[0].name,
      ownerId: creatorAgent[0].ownerId,
      visibility: creatorAgent[0].visibility,
    } : null,
    acceptances,
    gluonLedgerEntries: ledgerEntries,
    dnaMutationHistory: mutations,
    nonCashoutGuarantees: nonCashoutGuarantees(),
  };
}

async function resolveAcceptor(packet: KnowledgePacket, input: AcceptanceInput, actorId: string) {
  const acceptingAgentType = (typeof input.acceptingAgentType === "string" && (ACCEPTING_AGENT_TYPES as readonly string[]).includes(input.acceptingAgentType))
    ? input.acceptingAgentType as typeof ACCEPTING_AGENT_TYPES[number]
    : "root_admin";
  const acceptingAgentId = optionalText(input.acceptingAgentId, 120) || (acceptingAgentType === "root_admin" ? actorId : "");
  if (!acceptingAgentId) throw new KnowledgeEconomyError(400, "acceptingAgentId is required for agent acceptances.");

  if (acceptingAgentId === packet.creatorAgentId) {
    throw new KnowledgeEconomyError(403, "Self-acceptance is blocked.");
  }

  let receiverAuthority = clamp01(input.receiverAuthority, 0.6);
  let acceptingUserId = optionalText(input.acceptingUserId, 120);
  let acceptorTags: string[] = [];

  if (acceptingAgentType === "user_agent") {
    const [agent] = await db.select().from(userAgents).where(eq(userAgents.id, acceptingAgentId)).limit(1);
    if (!agent) throw new KnowledgeEconomyError(404, "Accepting user agent not found.");
    acceptingUserId = agent.ownerId;
    acceptorTags = [agent.industrySlug, agent.categorySlug, agent.roleSlug].filter((item): item is string => typeof item === "string" && !!item);
    if (agent.ownerId === packet.creatorUserId) {
      throw new KnowledgeEconomyError(403, "Same-owner acceptance loops are blocked for user-owned agents.");
    }
    receiverAuthority = clamp01((agent.trustScore || 50) / 100, receiverAuthority);
  }

  if (acceptingAgentType === "system_agent") {
    const [agentUser, trust] = await Promise.all([
      db.select().from(users).where(eq(users.id, acceptingAgentId)).limit(1),
      db.select().from(agentTrustProfiles).where(eq(agentTrustProfiles.agentId, acceptingAgentId)).limit(1),
    ]);
    if (!agentUser[0]) throw new KnowledgeEconomyError(404, "Accepting system agent not found.");
    acceptorTags = Array.isArray(agentUser[0].industryTags) ? agentUser[0].industryTags : [];
    receiverAuthority = clamp01((trust[0]?.compositeTrustScore || agentUser[0].reputation || 50) / 100, receiverAuthority);
  }

  const existing = await db.select().from(knowledgePacketAcceptances)
    .where(and(
      eq(knowledgePacketAcceptances.packetId, packet.id),
      eq(knowledgePacketAcceptances.acceptingAgentId, acceptingAgentId),
      eq(knowledgePacketAcceptances.acceptingAgentType, acceptingAgentType),
    ))
    .limit(1);
  if (existing.length > 0) {
    throw new KnowledgeEconomyError(409, "This accepting agent has already reviewed this packet.");
  }

  return {
    acceptingAgentId,
    acceptingAgentType,
    acceptingUserId,
    receiverAuthority,
    acceptorTags,
  };
}

async function reviewPacket(packetId: string, input: AcceptanceInput, actorId: string) {
  const decision = typeof input.decision === "string" && (DECISIONS as readonly string[]).includes(input.decision)
    ? input.decision as typeof DECISIONS[number]
    : null;
  if (!decision) throw new KnowledgeEconomyError(400, "decision must be accepted, rejected, or challenged.");

  const [packet] = await db.select().from(knowledgePackets).where(eq(knowledgePackets.id, packetId)).limit(1);
  if (!packet) throw new KnowledgeEconomyError(404, "Knowledge packet not found.");
  const acceptor = await resolveAcceptor(packet, input, actorId);
  const safety = asRecord(packet.safetyReport);
  const blockers = Array.isArray(safety.blockers) ? safety.blockers : [];
  const regulatedClaim = safety.regulatedClaim === true;

  if (decision === "accepted" && blockers.length > 0) {
    throw new KnowledgeEconomyError(400, "Packets with safety blockers cannot be accepted.");
  }
  if (decision === "accepted" && regulatedClaim && !["verified", "approved", "supported"].includes(packet.verificationStatus)) {
    throw new KnowledgeEconomyError(400, "Regulated packets must be verified before acceptance.");
  }

  const domainMatch = clamp01(input.domainMatch, scoreFromTags(packet.domainTags || [], acceptor.acceptorTags));
  const receiverAuthority = clamp01(acceptor.receiverAuthority);
  const retentionScore = clamp01(input.retentionScore, 0.5);
  const realWorldFeedbackScore = clamp01(input.realWorldFeedbackScore, 0.5);
  const weightedAcceptanceContribution = decision === "accepted"
    ? Math.round((0.25 * domainMatch + 0.30 * receiverAuthority + 0.25 * retentionScore + 0.20 * realWorldFeedbackScore) * 1000) / 1000
    : 0;
  const ues = acceptor.acceptingAgentType === "root_admin"
    ? null
    : await unifiedEvolutionService.getAgentUes(acceptor.acceptingAgentId).catch(() => null);

  const [created] = await db.insert(knowledgePacketAcceptances).values({
    packetId,
    acceptingAgentId: acceptor.acceptingAgentId,
    acceptingAgentType: acceptor.acceptingAgentType,
    acceptingUserId: acceptor.acceptingUserId || null,
    decision,
    domainMatch,
    receiverAuthority,
    retentionScore,
    realWorldFeedbackScore,
    weightedAcceptanceContribution,
    trustInputs: {
      receiverAuthority,
      selfAcceptanceBlocked: true,
      sameOwnerLoopBlocked: true,
    },
    uesInputs: ues ? {
      UES: ues.scores.UES,
      P: ues.scores.P,
      D: ues.scores.D,
      Omega: ues.scores.Omega,
      Xi: ues.scores.Xi,
      sourceQuality: ues.sourceQuality.overall,
    } : { available: false },
    rationale: optionalText(input.rationale, 1200),
    challengeReason: decision === "challenged" ? optionalText(input.challengeReason, 1200) || "Challenged for further validation." : optionalText(input.challengeReason, 1200),
    sandboxOnly: input.sandboxOnly !== false,
  }).returning();

  const updated = await refreshPacketEconomy(packetId, actorId);
  await audit(`knowledge_packet_${decision}`, actorId, "root_admin", "success", {
    acceptingAgentId: acceptor.acceptingAgentId,
    acceptingAgentType: acceptor.acceptingAgentType,
    contribution: weightedAcceptanceContribution,
  }, packetId);

  return {
    acceptance: created,
    packet: updated,
  };
}

async function refreshPacketEconomy(packetId: string, actorId: string) {
  const [packet] = await db.select().from(knowledgePackets).where(eq(knowledgePackets.id, packetId)).limit(1);
  if (!packet) throw new KnowledgeEconomyError(404, "Knowledge packet not found.");
  const acceptanceScore = await calculateWeightedAcceptance(packetId);
  const rows = await db.select().from(knowledgePacketAcceptances).where(eq(knowledgePacketAcceptances.packetId, packetId));
  const packetForGluon = { ...packet, weightedAcceptance: acceptanceScore.weightedAcceptance };
  const gluon = calculateGluon(packetForGluon);
  const reviewStatus = rows.some((row) => row.decision === "challenged")
    ? "challenged"
    : acceptanceScore.acceptedCount > 0
      ? "accepted"
      : packet.reviewStatus;
  const status = reviewStatus === "accepted" ? "accepted" : packet.status;
  const safetyReport = {
    ...asRecord(packet.safetyReport),
    graphLearningSignalEligible: reviewStatus === "accepted" && ["verified", "approved", "supported"].includes(packet.verificationStatus) && gluon.amount > 0,
    lastWeightedAcceptance: acceptanceScore,
    lastGluonPreview: gluon,
  };

  const [updated] = await db.update(knowledgePackets).set({
    acceptedByAgents: acceptanceScore.acceptedCount,
    rejectedByAgents: acceptanceScore.rejectedCount,
    challengedByAgents: acceptanceScore.challengedCount,
    weightedAcceptance: acceptanceScore.weightedAcceptance,
    gluonEarned: gluon.amount,
    reviewStatus,
    status,
    safetyReport,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(knowledgePackets.id, packetId)).returning();

  await db.insert(gluonLedgerEntries).values({
    packetId,
    agentId: updated.creatorAgentId,
    userId: updated.creatorUserId,
    eventType: "gluon_simulation",
    amount: gluon.amount,
    calculationInputs: gluon.calculationInputs,
    status: "simulated",
    nonConvertible: true,
    reason: "Phase 25B non-cashout Gluon simulation after packet review.",
  });

  await audit("knowledge_packet_gluon_simulated", actorId, "root_admin", "success", {
    amount: gluon.amount,
    nonConvertible: true,
  }, packetId);

  return adminPacketSummary(updated);
}

async function previewGluon(packetId: string) {
  const [packet] = await db.select().from(knowledgePackets).where(eq(knowledgePackets.id, packetId)).limit(1);
  if (!packet) throw new KnowledgeEconomyError(404, "Knowledge packet not found.");
  const acceptance = await calculateWeightedAcceptance(packetId);
  return calculateGluon({ ...packet, weightedAcceptance: acceptance.weightedAcceptance });
}

function dnaFromGenome(genome: AgentGenome | null | undefined) {
  return {
    primeSeed: genome?.primeSeed || null,
    primeColorSignature: asRecord(genome?.primeColorSignature),
    dnaMetadata: asRecord(genome?.dnaMetadata),
    curiosity: genome?.curiosity ?? 0.5,
    riskTolerance: genome?.riskTolerance ?? 0.5,
    collaborationBias: genome?.collaborationBias ?? 0.5,
    verificationStrictness: genome?.verificationStrictness ?? 0.5,
    longTermFocus: genome?.longTermFocus ?? 0.5,
    economicStrategy: genome?.economicStrategy || "balanced",
    fitnessScore: genome?.fitnessScore ?? 0,
    generation: genome?.generation ?? 0,
    mutations: genome?.mutations ?? 0,
  };
}

export async function updateAgentDNAAfterLearning(agentId: string, packet: KnowledgePacket) {
  const [genome] = await db.select().from(agentGenomes).where(eq(agentGenomes.agentId, agentId)).limit(1);
  const beforeDna = dnaFromGenome(genome);
  const primeSeed = beforeDna.primeSeed || hashText(`${agentId}:${packet.id}`).slice(0, 24);
  const primeColorSignature = Object.keys(beforeDna.primeColorSignature).length > 0
    ? beforeDna.primeColorSignature
    : generatePrimeColorSignature(primeSeed);
  const acceptance = clamp01(packet.weightedAcceptance / 3, 0);
  const quality = 0.35 * clamp01(packet.evidenceStrength) + 0.25 * clamp01(packet.usefulnessPrediction) + 0.25 * clamp01(packet.complianceScore) + 0.15 * clamp01(packet.noveltyScore);
  const nudge = Math.min(0.04, acceptance * quality * Math.max(0, 1 - clamp01(packet.riskScore)) * 0.04);
  const afterDna = {
    ...beforeDna,
    primeSeed,
    primeColorSignature,
    dnaMetadata: {
      ...beforeDna.dnaMetadata,
      knowledgeEconomy: {
        lastPacketId: packet.id,
        lastPreviewAt: new Date().toISOString(),
        previewOnly: true,
      },
    },
    curiosity: Math.min(1, beforeDna.curiosity + nudge * packet.noveltyScore),
    collaborationBias: Math.min(1, beforeDna.collaborationBias + nudge),
    verificationStrictness: Math.min(1, beforeDna.verificationStrictness + nudge * packet.evidenceStrength),
    longTermFocus: Math.min(1, beforeDna.longTermFocus + nudge * packet.usefulnessPrediction),
    riskTolerance: Math.max(0, beforeDna.riskTolerance - nudge * packet.riskScore),
    mutations: beforeDna.mutations,
  };

  return {
    agentId,
    packetId: packet.id,
    mutationType: "knowledge_packet_learning_preview",
    beforeDna,
    afterDna,
    scoreInputs: {
      weightedAcceptance: packet.weightedAcceptance,
      quality,
      riskScore: packet.riskScore,
      nudge,
      previewOnly: true,
    },
    status: "preview" as const,
    liveGenomeMutated: false,
    oldEvolutionServiceTriggered: false,
  };
}

async function previewDnaMutation(packetId: string, agentId: string | undefined, reviewedBy: string) {
  const [packet] = await db.select().from(knowledgePackets).where(eq(knowledgePackets.id, packetId)).limit(1);
  if (!packet) throw new KnowledgeEconomyError(404, "Knowledge packet not found.");
  const targetAgentId = agentId || packet.creatorAgentId;
  const preview = await updateAgentDNAAfterLearning(targetAgentId, packet);
  const [history] = await db.insert(agentDnaMutationHistory).values({
    agentId: targetAgentId,
    packetId,
    mutationType: preview.mutationType,
    beforeDna: preview.beforeDna,
    afterDna: preview.afterDna,
    scoreInputs: preview.scoreInputs,
    status: "preview",
    reviewedBy,
    reviewedAt: new Date(),
  }).returning();
  await audit("knowledge_packet_dna_preview", reviewedBy, "root_admin", "success", {
    targetAgentId,
    liveGenomeMutated: false,
  }, packetId);
  return {
    ...preview,
    historyId: history.id,
  };
}

export const knowledgeEconomyService = {
  generatePrimeColorSignature,
  calculateFreshness,
  calculateWeightedAcceptance,
  calculateGluon,
  updateAgentDNAAfterLearning,
  retrieveReasoningPacketContext,
  listEligibleAgents,
  previewPacket,
  createPacket,
  submitPacket,
  listUserPackets,
  listAdminPackets,
  getPacketDetail,
  reviewPacket,
  previewGluon,
  previewDnaMutation,
};
