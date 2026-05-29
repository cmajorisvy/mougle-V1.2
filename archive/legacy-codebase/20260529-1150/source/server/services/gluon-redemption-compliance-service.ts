import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  gluonLedgerEntries,
  gluonRedemptionEligibilityReviews,
  knowledgePacketAcceptances,
  knowledgePackets,
  userAgents,
  users,
  type GluonLedgerEntry,
  type GluonRedemptionEligibilityReview,
  type KnowledgePacket,
  type KnowledgePacketAcceptance,
  type User,
} from "@shared/schema";
import { gluonValueIndexService, type GviResult } from "./gluon-value-index-service";
import { riskManagementService } from "./risk-management-service";

const PLATFORM_CONVERSION_RATE = 0;
const VERIFIED_PACKET_STATUSES = new Set(["verified", "approved", "supported"]);
const ACCEPTED_PACKET_STATUSES = new Set(["accepted", "approved", "verified"]);
const PENDING_LEDGER_STATUSES = new Set(["simulated", "pending"]);
const INVALID_LEDGER_STATUSES = new Set(["revoked", "rejected", "blocked", "fraud", "invalid"]);
const REGULATED_PATTERN = /\b(medical|diagnosis|prescription|clinical|legal|lawsuit|contract|tax|investment|financial advice|loan|insurance|securities|bankruptcy)\b/i;

export type GluonRedemptionEligibilityInput = {
  userId: string;
  agentId?: string;
};

export type GluonRedemptionEligibilityPreview = {
  generatedAt: string;
  userId: string;
  agentId: string | null;
  validGluon: number;
  invalidGluon: number;
  pendingGluon: number;
  latestGviSnapshotId: string | null;
  latestGviScore: number;
  informationalEstimate: number;
  platformConversionRate: 0;
  eligibilityStatus: "disabled" | "not_eligible" | "needs_compliance" | "eligible_for_future_review";
  complianceChecklist: Record<string, any>;
  fraudSignals: Record<string, any>;
  sourceSummary: Record<string, any>;
  warnings: string[];
  safeguards: {
    gluonInternalContributionCreditOnly: true;
    nonConvertible: true;
    redemptionDisabled: true;
    noFundsMoved: true;
    noWalletCreditPayoutPaymentAffected: true;
    noPaymentProcessorCalled: true;
    noMarketplaceTransactionCreated: true;
    founderAdminReviewRequired: true;
  };
};

class GluonRedemptionComplianceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function round(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 10000) / 10000;
}

function normalizeId(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new GluonRedemptionComplianceError(400, `${label} is required.`);
  }
  return value.trim().slice(0, 120);
}

function normalizeOptionalId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : undefined;
}

function normalizeReason(value: unknown, required = false) {
  if (typeof value !== "string" || !value.trim()) {
    if (required) throw new GluonRedemptionComplianceError(400, "A non-empty review reason is required.");
    return null;
  }
  return value.trim().slice(0, 1000);
}

function safeUserSummary(user: User | null | undefined) {
  if (!user) {
    return {
      found: false,
      active: false,
      spamRestricted: false,
      accountFlags: ["user_not_found"],
    };
  }

  const flags = [
    user.isSpammer ? "spammer" : null,
    user.isShadowBanned ? "shadow_banned" : null,
  ].filter(Boolean);

  return {
    found: true,
    active: !user.isSpammer && !user.isShadowBanned,
    spamRestricted: Boolean(user.isSpammer || user.isShadowBanned),
    role: user.role,
    createdAt: user.createdAt?.toISOString?.() || null,
    accountFlags: flags,
  };
}

function packetBlockers(packet: KnowledgePacket | null | undefined) {
  return asArray(asRecord(packet?.safetyReport).blockers);
}

function packetWarnings(packet: KnowledgePacket | null | undefined) {
  return asArray(asRecord(packet?.safetyReport).warnings);
}

function hasRedactionOrPrivateWarning(packet: KnowledgePacket | null | undefined) {
  const report = asRecord(packet?.safetyReport);
  const serializedSignals = JSON.stringify({
    blockers: packetBlockers(packet),
    warnings: packetWarnings(packet),
    sanitizer: report.sanitizerReport,
    privacy: report.privacy,
  }).toLowerCase();
  return /private|personal|secret|redact|restricted|raw_memory/.test(serializedSignals);
}

function packetHasRegulatedRisk(packet: KnowledgePacket | null | undefined) {
  if (!packet) return false;
  const report = asRecord(packet.safetyReport);
  const tags = [
    ...(packet.domainTags || []),
    ...(packet.industryTags || []),
    ...(packet.professionTags || []),
    String(report.regulatedDomain || ""),
    String(report.claimCategory || ""),
  ].join(" ");
  const metadata = JSON.stringify({ blockers: packetBlockers(packet), warnings: packetWarnings(packet) });
  return REGULATED_PATTERN.test(`${tags}\n${metadata}`);
}

function packetIsAcceptedVerifiedSafe(packet: KnowledgePacket | null | undefined) {
  if (!packet) return false;
  const accepted = ACCEPTED_PACKET_STATUSES.has(packet.reviewStatus) || ACCEPTED_PACKET_STATUSES.has(packet.status);
  const verified = VERIFIED_PACKET_STATUSES.has(packet.verificationStatus);
  const noBlockers = packetBlockers(packet).length === 0;
  const lowRisk = round(packet.riskScore) <= 0.5;
  const compliant = round(packet.complianceScore) >= 0.5;
  const noChallenges = Number(packet.challengedByAgents || 0) === 0;
  const safeVault = !["personal", "private", "secret", "unknown"].includes(packet.vaultType) && !["private", "secret", "unknown"].includes(packet.sensitivity);
  return accepted && verified && noBlockers && lowRisk && compliant && noChallenges && safeVault && !hasRedactionOrPrivateWarning(packet);
}

function packetIsPending(packet: KnowledgePacket | null | undefined) {
  if (!packet) return true;
  if (packetIsAcceptedVerifiedSafe(packet)) return false;
  const accepted = ACCEPTED_PACKET_STATUSES.has(packet.reviewStatus) || ACCEPTED_PACKET_STATUSES.has(packet.status);
  const verificationPending = !VERIFIED_PACKET_STATUSES.has(packet.verificationStatus);
  return accepted || verificationPending || ["submitted", "pending_review", "needs_validation", "draft"].includes(packet.reviewStatus);
}

function packetIsUnsafeInvalid(packet: KnowledgePacket | null | undefined) {
  if (!packet) return true;
  if (["rejected", "blocked", "revoked", "deleted"].includes(packet.reviewStatus) || ["rejected", "blocked", "revoked", "deleted"].includes(packet.status)) return true;
  if (packetBlockers(packet).length > 0) return true;
  if (Number(packet.challengedByAgents || 0) > 0) return true;
  if (round(packet.riskScore) > 0.7) return true;
  if (round(packet.complianceScore) < 0.35) return true;
  if (hasRedactionOrPrivateWarning(packet)) return true;
  if (packetHasRegulatedRisk(packet) && !VERIFIED_PACKET_STATUSES.has(packet.verificationStatus)) return true;
  return false;
}

function categorizeLedgerEntry(entry: GluonLedgerEntry, packet: KnowledgePacket | null | undefined) {
  if (INVALID_LEDGER_STATUSES.has(entry.status) || !entry.nonConvertible || packetIsUnsafeInvalid(packet)) {
    return "invalid" as const;
  }
  if (entry.status === "awarded" && entry.nonConvertible && packetIsAcceptedVerifiedSafe(packet)) {
    return "valid" as const;
  }
  if (PENDING_LEDGER_STATUSES.has(entry.status) || packetIsPending(packet)) {
    return "pending" as const;
  }
  return "invalid" as const;
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount;
}

async function audit(action: string, actorId: string, outcome: "success" | "denied" | "error", details: Record<string, any>, resourceId?: string) {
  try {
    await riskManagementService.logAudit({
      actorId,
      actorType: "root_admin",
      action,
      resourceType: "gluon_redemption_eligibility_review",
      resourceId,
      outcome,
      riskLevel: outcome === "success" ? "medium" : "high",
      details,
    });
  } catch {
    // Audit logging must never activate or block any economic path.
  }
}

class GluonRedemptionComplianceService {
  async listEligibility() {
    const [reviews, candidateRows] = await Promise.all([
      db.select().from(gluonRedemptionEligibilityReviews)
        .orderBy(desc(gluonRedemptionEligibilityReviews.createdAt))
        .limit(50),
      db.select().from(gluonLedgerEntries)
        .orderBy(desc(gluonLedgerEntries.createdAt))
        .limit(400),
    ]);

    const grouped = new Map<string, {
      userId: string;
      agentId: string | null;
      totalGluon: number;
      awarded: number;
      pending: number;
      simulated: number;
      revokedOrInvalid: number;
      nonConvertibleOnly: boolean;
      ledgerEntries: number;
      latestLedgerAt: Date | null;
    }>();

    for (const row of candidateRows) {
      if (!row.userId) continue;
      const key = `${row.userId}:${row.agentId || ""}`;
      const current = grouped.get(key) || {
        userId: row.userId,
        agentId: row.agentId || null,
        totalGluon: 0,
        awarded: 0,
        pending: 0,
        simulated: 0,
        revokedOrInvalid: 0,
        nonConvertibleOnly: true,
        ledgerEntries: 0,
        latestLedgerAt: null,
      };
      current.totalGluon = round(current.totalGluon + round(row.amount));
      current.ledgerEntries += 1;
      current.nonConvertibleOnly = current.nonConvertibleOnly && row.nonConvertible === true;
      if (row.status === "awarded") current.awarded += 1;
      else if (row.status === "pending") current.pending += 1;
      else if (row.status === "simulated") current.simulated += 1;
      else if (INVALID_LEDGER_STATUSES.has(row.status)) current.revokedOrInvalid += 1;
      const created = row.createdAt ? new Date(row.createdAt) : null;
      if (created && (!current.latestLedgerAt || created > current.latestLedgerAt)) current.latestLedgerAt = created;
      grouped.set(key, current);
    }

    const candidates = [...grouped.values()].slice(0, 25).map((candidate) => ({
      ...candidate,
      totalGluon: round(candidate.totalGluon),
      latestLedgerAt: candidate.latestLedgerAt?.toISOString?.() || null,
      redemptionDisabled: true,
      platformConversionRate: PLATFORM_CONVERSION_RATE,
      note: "Candidate summary uses Gluon ledger metadata only. Root admin preview creates a disabled eligibility-review record.",
    }));

    return {
      reviews,
      candidates,
      warnings: this.requiredWarnings(),
      safeguards: this.safeguards(),
      moneySystemsAvoided: this.moneySystemsAvoided(),
    };
  }

  async getEligibilityReview(id: string) {
    const [review] = await db.select().from(gluonRedemptionEligibilityReviews)
      .where(eq(gluonRedemptionEligibilityReviews.id, id))
      .limit(1);
    if (!review) throw new GluonRedemptionComplianceError(404, "Gluon redemption eligibility review not found.");
    return {
      review,
      warnings: this.requiredWarnings(),
      safeguards: this.safeguards(),
      moneySystemsAvoided: this.moneySystemsAvoided(),
    };
  }

  async previewEligibility(input: GluonRedemptionEligibilityInput, actorId: string) {
    const userId = normalizeId(input.userId, "userId");
    const agentId = normalizeOptionalId(input.agentId);
    const preview = await this.calculateEligibility({ userId, agentId });

    const [review] = await db.insert(gluonRedemptionEligibilityReviews).values({
      userId,
      agentId: agentId || null,
      validGluon: preview.validGluon,
      invalidGluon: preview.invalidGluon,
      pendingGluon: preview.pendingGluon,
      latestGviSnapshotId: preview.latestGviSnapshotId,
      informationalEstimate: preview.informationalEstimate,
      platformConversionRate: preview.platformConversionRate,
      eligibilityStatus: preview.eligibilityStatus,
      complianceChecklist: preview.complianceChecklist,
      fraudSignals: preview.fraudSignals,
      sourceSummary: preview.sourceSummary,
      adminReviewStatus: "pending",
      updatedAt: new Date(),
    }).returning();

    await audit("gluon_redemption_eligibility_preview", actorId, "success", {
      userId,
      agentId: agentId || null,
      validGluon: preview.validGluon,
      pendingGluon: preview.pendingGluon,
      invalidGluon: preview.invalidGluon,
      platformConversionRate: PLATFORM_CONVERSION_RATE,
      noFundsMoved: true,
      noWalletOrPayoutTouched: true,
    }, review.id);

    return {
      review,
      preview,
      warnings: this.requiredWarnings(),
      safeguards: this.safeguards(),
    };
  }

  async markReviewed(id: string, actorId: string, reason?: unknown) {
    const note = normalizeReason(reason, false);
    const [existing] = await db.select().from(gluonRedemptionEligibilityReviews)
      .where(eq(gluonRedemptionEligibilityReviews.id, id))
      .limit(1);
    if (!existing) throw new GluonRedemptionComplianceError(404, "Gluon redemption eligibility review not found.");

    const [review] = await db.update(gluonRedemptionEligibilityReviews).set({
      adminReviewStatus: "reviewed",
      reviewedBy: actorId,
      reviewedAt: new Date(),
      rejectionReason: note,
      updatedAt: new Date(),
    }).where(eq(gluonRedemptionEligibilityReviews.id, id)).returning();

    await audit("gluon_redemption_eligibility_mark_reviewed", actorId, "success", {
      previousStatus: existing.adminReviewStatus,
      nextStatus: review.adminReviewStatus,
      reason: note,
      noFundsMoved: true,
    }, id);

    return {
      review,
      warnings: this.requiredWarnings(),
      safeguards: this.safeguards(),
    };
  }

  async reject(id: string, actorId: string, reason: unknown) {
    const rejectionReason = normalizeReason(reason, true);
    const [existing] = await db.select().from(gluonRedemptionEligibilityReviews)
      .where(eq(gluonRedemptionEligibilityReviews.id, id))
      .limit(1);
    if (!existing) throw new GluonRedemptionComplianceError(404, "Gluon redemption eligibility review not found.");

    const [review] = await db.update(gluonRedemptionEligibilityReviews).set({
      adminReviewStatus: "rejected",
      eligibilityStatus: "not_eligible",
      reviewedBy: actorId,
      reviewedAt: new Date(),
      rejectionReason,
      updatedAt: new Date(),
    }).where(eq(gluonRedemptionEligibilityReviews.id, id)).returning();

    await audit("gluon_redemption_eligibility_rejected", actorId, "success", {
      previousStatus: existing.adminReviewStatus,
      nextStatus: review.adminReviewStatus,
      reason: rejectionReason,
      noFundsMoved: true,
    }, id);

    return {
      review,
      warnings: this.requiredWarnings(),
      safeguards: this.safeguards(),
    };
  }

  private async calculateEligibility(input: GluonRedemptionEligibilityInput): Promise<GluonRedemptionEligibilityPreview> {
    const filters = [eq(gluonLedgerEntries.userId, input.userId)];
    if (input.agentId) filters.push(eq(gluonLedgerEntries.agentId, input.agentId));

    const [ledgerRows, gvi, userRows, agentRows] = await Promise.all([
      db.select().from(gluonLedgerEntries)
        .where(and(...filters))
        .orderBy(desc(gluonLedgerEntries.createdAt))
        .limit(1000),
      gluonValueIndexService.getCurrent(),
      db.select().from(users).where(eq(users.id, input.userId)).limit(1),
      input.agentId
        ? db.select().from(userAgents).where(eq(userAgents.id, input.agentId)).limit(1)
        : Promise.resolve([]),
    ]);

    const packetIds = [...new Set(ledgerRows.map((row) => row.packetId).filter(Boolean))];
    const packetRows = packetIds.length > 0
      ? await db.select().from(knowledgePackets).where(inArray(knowledgePackets.id, packetIds))
      : [];
    const packetMap = new Map(packetRows.map((packet) => [packet.id, packet]));
    const acceptances = packetIds.length > 0
      ? await db.select().from(knowledgePacketAcceptances).where(inArray(knowledgePacketAcceptances.packetId, packetIds))
      : [];
    const acceptancesByPacket = new Map<string, KnowledgePacketAcceptance[]>();
    for (const acceptance of acceptances) {
      const current = acceptancesByPacket.get(acceptance.packetId) || [];
      current.push(acceptance);
      acceptancesByPacket.set(acceptance.packetId, current);
    }

    let validGluon = 0;
    let invalidGluon = 0;
    let pendingGluon = 0;
    const ledgerCounts: Record<string, number> = {};
    const packetStatusCounts: Record<string, number> = {};
    const invalidReasons: Record<string, number> = {};
    const fingerprintCounts: Record<string, number> = {};
    let highRiskPacketCount = 0;
    let regulatedUnresolvedCount = 0;
    let unresolvedChallengeCount = 0;
    let selfAcceptanceFlags = 0;
    let sameOwnerManipulationFlags = 0;
    let privateOrSecretFlags = 0;

    for (const packet of packetRows) {
      increment(packetStatusCounts, packet.reviewStatus || "unknown");
      if (packet.sourceFingerprint) increment(fingerprintCounts, packet.sourceFingerprint);
      if (round(packet.riskScore) > 0.7 || packetBlockers(packet).length > 0) highRiskPacketCount += 1;
      if (packetHasRegulatedRisk(packet) && !VERIFIED_PACKET_STATUSES.has(packet.verificationStatus)) regulatedUnresolvedCount += 1;
      if (Number(packet.challengedByAgents || 0) > 0 || packet.reviewStatus === "challenged") unresolvedChallengeCount += 1;
      if (hasRedactionOrPrivateWarning(packet) || ["personal", "private", "secret", "unknown"].includes(packet.vaultType) || ["private", "secret", "unknown"].includes(packet.sensitivity)) privateOrSecretFlags += 1;

      for (const acceptance of acceptancesByPacket.get(packet.id) || []) {
        if (acceptance.acceptingAgentId === packet.creatorAgentId) selfAcceptanceFlags += 1;
        if (acceptance.acceptingUserId && acceptance.acceptingUserId === packet.creatorUserId) sameOwnerManipulationFlags += 1;
      }
    }

    for (const row of ledgerRows) {
      increment(ledgerCounts, row.status || "unknown");
      const packet = packetMap.get(row.packetId) || null;
      const amount = Math.max(0, round(row.amount));
      const category = categorizeLedgerEntry(row, packet);
      if (category === "valid") validGluon += amount;
      else if (category === "pending") pendingGluon += amount;
      else invalidGluon += amount;

      if (!row.nonConvertible) increment(invalidReasons, "convertible_or_legacy_gluon");
      if (!packet) increment(invalidReasons, "missing_source_packet");
      if (packet && packetBlockers(packet).length > 0) increment(invalidReasons, "safety_blockers");
      if (packet && Number(packet.challengedByAgents || 0) > 0) increment(invalidReasons, "unresolved_challenges");
      if (packet && hasRedactionOrPrivateWarning(packet)) increment(invalidReasons, "private_or_redacted_source");
      if (packet && packetHasRegulatedRisk(packet) && !VERIFIED_PACKET_STATUSES.has(packet.verificationStatus)) increment(invalidReasons, "regulated_unverified_claims");
    }

    validGluon = round(validGluon);
    invalidGluon = round(invalidGluon);
    pendingGluon = round(pendingGluon);

    const duplicateFingerprintCount = Object.values(fingerprintCounts).filter((count) => count > 1).length;
    const userSummary = safeUserSummary(userRows[0]);
    const agent = agentRows[0] || null;
    const agentOwnershipMismatch = Boolean(input.agentId && agent && agent.ownerId !== input.userId);
    const materialSafetyPasses = validGluon > 0
      && highRiskPacketCount === 0
      && regulatedUnresolvedCount === 0
      && unresolvedChallengeCount === 0
      && duplicateFingerprintCount === 0
      && selfAcceptanceFlags === 0
      && sameOwnerManipulationFlags === 0
      && privateOrSecretFlags === 0
      && !agentOwnershipMismatch
      && userSummary.active;

    const eligibilityStatus = validGluon <= 0
      ? "not_eligible"
      : materialSafetyPasses
        ? "eligible_for_future_review"
        : "needs_compliance";

    const informationalEstimate = round(validGluon * gvi.gviScore * PLATFORM_CONVERSION_RATE);
    const complianceChecklist = {
      validAwardedGluonExists: { passed: validGluon > 0, value: validGluon, explanation: "Only awarded, non-convertible Gluon linked to accepted + verified + safe packets can count." },
      packetsAcceptedVerifiedSafe: { passed: highRiskPacketCount === 0 && privateOrSecretFlags === 0, highRiskPacketCount, privateOrSecretFlags },
      noUnresolvedChallenges: { passed: unresolvedChallengeCount === 0, unresolvedChallengeCount },
      noHighRiskMedicalLegalFinancialUnresolvedClaims: { passed: regulatedUnresolvedCount === 0, regulatedUnresolvedCount },
      noDuplicateSpamFakeLoopFlags: { passed: duplicateFingerprintCount === 0, duplicateFingerprintCount },
      noSelfAcceptanceOrSameOwnerManipulationFlags: { passed: selfAcceptanceFlags === 0 && sameOwnerManipulationFlags === 0, selfAcceptanceFlags, sameOwnerManipulationFlags },
      creatorUserAccountActive: { passed: userSummary.active, user: userSummary },
      agentOwnedByCreatorUser: { passed: !agentOwnershipMismatch, agentFound: input.agentId ? Boolean(agent) : null, agentOwnershipMismatch },
      kycRequiredLater: { passed: false, status: "required_later_not_completed" },
      taxReviewRequiredLater: { passed: false, status: "required_later_not_completed" },
      revenuePoolUnavailableFutureRequired: { passed: false, status: "future_required_unavailable" },
      founderAdminApprovalRequired: { passed: false, status: "required_before_future_program" },
      redemptionDisabled: { passed: false, status: "disabled_by_design" },
    };

    const fraudSignals = {
      duplicateSourceFingerprintCount: duplicateFingerprintCount,
      duplicateSourceFingerprintBuckets: Object.entries(fingerprintCounts).filter(([, count]) => count > 1).length,
      selfAcceptanceFlags,
      sameOwnerManipulationFlags,
      unresolvedChallengeCount,
      highRiskPacketCount,
      regulatedUnresolvedCount,
      privateOrSecretFlags,
      invalidReasons,
      userAccountFlags: userSummary.accountFlags,
      agentOwnershipMismatch,
      fakeLoopRisk: selfAcceptanceFlags > 0 || sameOwnerManipulationFlags > 0 || duplicateFingerprintCount > 0,
    };

    const sourceSummary = {
      ledgerEntries: ledgerRows.length,
      ledgerCounts,
      packetCount: packetRows.length,
      packetStatusCounts,
      acceptanceCount: acceptances.length,
      validSourcePacketIdsCount: packetRows.filter(packetIsAcceptedVerifiedSafe).length,
      latestGviSnapshotId: gvi.latestSnapshotId,
      latestGviScore: gvi.gviScore,
      latestGviSnapshotAt: gvi.latestSnapshotAt,
      gviFallbackUsed: gvi.fallbackUsed,
      gviStale: gvi.stale,
      platformConversionRate: PLATFORM_CONVERSION_RATE,
      informationalEstimateFormula: "validGluon * latestGVI * platformConversionRate",
      disabledFormulaPreviewOnly: true,
      noFundsMoved: true,
      noWalletCreditPayoutPaymentAffected: true,
      noPaymentProcessorCalled: true,
      noMarketplaceTransactionCreated: true,
      sourceContentIncluded: false,
    };

    return {
      generatedAt: new Date().toISOString(),
      userId: input.userId,
      agentId: input.agentId || null,
      validGluon,
      invalidGluon,
      pendingGluon,
      latestGviSnapshotId: gvi.latestSnapshotId,
      latestGviScore: round(gvi.gviScore),
      informationalEstimate,
      platformConversionRate: PLATFORM_CONVERSION_RATE,
      eligibilityStatus,
      complianceChecklist,
      fraudSignals,
      sourceSummary,
      warnings: this.requiredWarnings(gvi),
      safeguards: this.safeguards(),
    };
  }

  private requiredWarnings(gvi?: GviResult) {
    return [
      "Gluon is an internal contribution credit, not withdrawable cash.",
      "GVI is an informational index, not a trading price.",
      "Redemption is disabled until legal, tax, KYC, anti-fraud, and revenue-pool approval.",
      "This page does not move funds or create a payable balance.",
      "Founder/admin review is required before any future redemption program.",
      ...(gvi?.warnings || []),
    ].filter((item, index, all) => all.indexOf(item) === index);
  }

  private safeguards() {
    return {
      gluonInternalContributionCreditOnly: true,
      nonConvertible: true,
      redemptionDisabled: true,
      noFundsMoved: true,
      noWalletCreditPayoutPaymentAffected: true,
      noPaymentProcessorCalled: true,
      noMarketplaceTransactionCreated: true,
      founderAdminReviewRequired: true,
    } as const;
  }

  private moneySystemsAvoided() {
    return {
      billingServiceCalled: false,
      economyServiceCalled: false,
      creditWalletMutated: false,
      transactionsMutated: false,
      creditPurchasesMutated: false,
      creditUsageLogMutated: false,
      agentPurchasesMutated: false,
      creatorPayoutAccountsMutated: false,
      marketplaceOrdersMutated: false,
      creatorEarningsMutated: false,
      stripeTouched: false,
      razorpayTouched: false,
      walletBalancesCreated: false,
      payableBalancesCreated: false,
      withdrawalRecordsCreated: false,
      payoutRecordsCreated: false,
      gluonConvertedToCredits: false,
      purchasePowerEnabled: false,
      marketplaceTransactionsEnabled: false,
    };
  }
}

export const gluonRedemptionComplianceService = new GluonRedemptionComplianceService();
