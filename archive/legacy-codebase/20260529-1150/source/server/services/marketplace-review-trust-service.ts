import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { riskManagementService } from "./risk-management-service";
import { sanitizeMemoryOutput } from "./memory-output-sanitizer";
import { unifiedEvolutionService } from "./unified-evolution-service";
import {
  agentMarketplaceClonePackages,
  agentReviews,
  gluonLedgerEntries,
  knowledgePackets,
  marketplaceListings,
  riskAuditLogs,
  userAgents,
  users,
  type AgentMarketplaceClonePackage,
  type AgentReview,
  type MarketplaceListing,
  type User,
  type UserAgent,
} from "@shared/schema";
import { GLUON_SHORT_BADGE, stripPublicGluonForbiddenFields } from "@shared/gluon-presentation";

type RankingLabel = "new" | "trusted" | "high-trust" | "needs-review" | "sandbox-only";
type ModerationStatus = "pending_review" | "approved" | "hidden" | "rejected";

type PublicListingOptions = {
  category?: string;
  query?: string;
  featuredOnly?: boolean;
  limit?: number;
  sort?: "trust" | "recent" | "sandbox";
};

type CreateReviewInput = {
  listingId: string;
  rating: number;
  title?: string;
  content?: string;
};

class MarketplaceReviewTrustError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function countSql() {
  return sql<number>`count(*)::int`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function safeArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function sanitizeReviewText(value: unknown, maxLength: number) {
  const normalized = normalizeString(value, maxLength);
  const sanitized = sanitizeMemoryOutput(normalized, { redactContactInfo: true });
  return {
    text: sanitized.content.replace(/[<>]/g, "").trim().slice(0, maxLength),
    redactions: sanitized.redactions,
    transformed: sanitized.transformed,
  };
}

function publicMarketplaceAgentSummary(agent: UserAgent | null | undefined) {
  if (!agent) return null;
  return {
    id: agent.id,
    name: agent.name,
    persona: agent.persona,
    avatarUrl: agent.avatarUrl,
    skills: agent.skills || [],
    tags: agent.tags || [],
    industrySlug: agent.industrySlug,
    categorySlug: agent.categorySlug,
    roleSlug: agent.roleSlug,
    trustScore: agent.trustScore,
    qualityScore: agent.qualityScore,
    rating: agent.rating,
    ratingCount: agent.ratingCount,
    version: agent.version,
  };
}

function publicClonePackageSummary(pkg: AgentMarketplaceClonePackage | null | undefined) {
  if (!pkg) return null;
  return {
    id: pkg.id,
    exportMode: pkg.exportMode,
    status: pkg.status,
    reviewStatus: pkg.reviewStatus,
    includedVaultSummary: {
      total: asRecord(pkg.includedVaultSummary).total || 0,
      vaults: asRecord(asRecord(pkg.includedVaultSummary).vaults),
      sensitivities: asRecord(asRecord(pkg.includedVaultSummary).sensitivities),
    },
    excludedVaultSummary: {
      total: asRecord(pkg.excludedVaultSummary).total || 0,
      vaults: asRecord(asRecord(pkg.excludedVaultSummary).vaults),
      sensitivities: asRecord(asRecord(pkg.excludedVaultSummary).sensitivities),
    },
    safetyReport: {
      canSubmitForReview: asRecord(pkg.safetyReport).canSubmitForReview === true,
      blockerCount: safeArray(asRecord(pkg.safetyReport).blockers).length,
      warningCount: safeArray(asRecord(pkg.safetyReport).warnings).length,
      rules: safeArray(asRecord(pkg.safetyReport).rules).slice(0, 8),
    },
    sanitizerReport: {
      transformedSources: asRecord(pkg.sanitizerReport).transformedSources || 0,
      redactionCount: safeArray(asRecord(pkg.sanitizerReport).redactions).length,
      behavioralSourcesConverted: asRecord(pkg.sanitizerReport).behavioralSourcesConverted || 0,
      rawPrivateMemoryReturned: false,
    },
    contributionHistory: {
      available: true,
      label: "Reviewed contribution history available",
      use: GLUON_SHORT_BADGE,
    },
  };
}

function safeTrustSignals(value: unknown) {
  const record = asRecord(value);
  const ues = asRecord(record.ues);
  return {
    source: record.source || "read_only_safe_clone_signals",
    agentTrustScore: Number(record.agentTrustScore || 0),
    qualityScore: Number(record.qualityScore || 0),
    rating: Number(record.rating || 0),
    ratingCount: Number(record.ratingCount || 0),
    ues: ues.UES !== undefined ? {
      UES: Number(ues.UES || 0),
      P: Number(ues.P || 0),
      D: Number(ues.D || 0),
      Omega: Number(ues.Omega || 0),
      Xi: Number(ues.Xi || 0),
      sourceQuality: ues.sourceQuality || null,
      collapseRisk: ues.collapseRisk || null,
    } : null,
  };
}

function approvedReviews(reviews: AgentReview[]) {
  return reviews.filter((review) => review.moderationStatus === "approved");
}

function reviewStats(reviews: AgentReview[]) {
  const approved = approvedReviews(reviews);
  const averageRating = approved.length
    ? approved.reduce((total, review) => total + review.rating, 0) / approved.length
    : 0;
  const helpfulTotal = approved.reduce((total, review) => total + review.helpful, 0);
  return {
    approvedCount: approved.length,
    pendingCount: reviews.filter((review) => review.moderationStatus === "pending_review").length,
    hiddenCount: reviews.filter((review) => review.moderationStatus === "hidden").length,
    rejectedCount: reviews.filter((review) => review.moderationStatus === "rejected").length,
    averageRating: round(averageRating, 2),
    helpfulTotal,
  };
}

async function sandboxTestCountForPackage(packageId: string) {
  const [row] = await db.select({ count: countSql() }).from(riskAuditLogs)
    .where(and(
      eq(riskAuditLogs.resourceType, "agent_marketplace_clone_package"),
      eq(riskAuditLogs.resourceId, packageId),
      eq(riskAuditLogs.action, "marketplace_clone_sandbox_test"),
      eq(riskAuditLogs.outcome, "success"),
    ));
  return Number(row?.count || 0);
}

async function userSandboxedPackage(userId: string, packageId: string) {
  const [row] = await db.select({ id: riskAuditLogs.id }).from(riskAuditLogs)
    .where(and(
      eq(riskAuditLogs.actorId, userId),
      eq(riskAuditLogs.actorType, "user"),
      eq(riskAuditLogs.resourceType, "agent_marketplace_clone_package"),
      eq(riskAuditLogs.resourceId, packageId),
      eq(riskAuditLogs.action, "marketplace_clone_sandbox_test"),
      eq(riskAuditLogs.outcome, "success"),
    ))
    .limit(1);
  return !!row;
}

async function knowledgePacketSignalForCreator(creatorUserId: string) {
  const [packetRow] = await db.select({
    count: countSql(),
    weightedAcceptance: sql<number>`coalesce(sum(${knowledgePackets.weightedAcceptance}), 0)`,
    gluonEarned: sql<number>`coalesce(sum(${knowledgePackets.gluonEarned}), 0)`,
  }).from(knowledgePackets)
    .where(and(
      eq(knowledgePackets.creatorUserId, creatorUserId),
      inArray(knowledgePackets.reviewStatus, ["accepted", "approved", "verified"]),
      inArray(knowledgePackets.verificationStatus, ["verified", "approved"]),
    ));

  const [ledgerRow] = await db.select({
    amount: sql<number>`coalesce(sum(${gluonLedgerEntries.amount}), 0)`,
  }).from(gluonLedgerEntries)
    .where(and(
      eq(gluonLedgerEntries.userId, creatorUserId),
      eq(gluonLedgerEntries.nonConvertible, true),
      inArray(gluonLedgerEntries.status, ["simulated", "pending", "awarded"]),
    ));

  const packetCount = Number(packetRow?.count || 0);
  const weightedAcceptance = Number(packetRow?.weightedAcceptance || 0);
  const gluonEarned = Math.max(Number(packetRow?.gluonEarned || 0), Number(ledgerRow?.amount || 0));
  const score = clamp01((Math.log1p(weightedAcceptance) / 4) * 0.55 + (Math.log1p(gluonEarned) / 5) * 0.35 + Math.min(packetCount, 10) / 10 * 0.1);

  return {
    packetCount,
    weightedAcceptance: round(weightedAcceptance, 3),
    gluonEarned: round(gluonEarned, 3),
    score,
    nonCashoutInformationalOnly: true,
  };
}

async function uesTrustSignal(agent: UserAgent | null | undefined, clonePackage: AgentMarketplaceClonePackage | null | undefined) {
  const cloneSignals = safeTrustSignals(clonePackage?.trustSignals);
  const trustFallback = clamp01(((agent?.trustScore || 0) / 100) * 0.7 + ((agent?.qualityScore || 0) / 100) * 0.3);
  let uesScore = cloneSignals.ues?.UES;
  try {
    if (agent?.id) {
      const result = await unifiedEvolutionService.getAgentUes(agent.id);
      uesScore = result.scores.UES;
    }
  } catch {
    // User-owned marketplace agents may not have full UES data yet; use read-only trust fields.
  }

  const uesNormalized = typeof uesScore === "number" ? clamp01(uesScore) : trustFallback;
  return {
    score: clamp01(uesNormalized * 0.6 + trustFallback * 0.4),
    uesAvailable: typeof uesScore === "number",
    trustFallback: round(trustFallback, 3),
  };
}

async function creatorReputationScore(creatorUserId: string) {
  const [creator] = await db.select().from(users).where(eq(users.id, creatorUserId)).limit(1);
  if (!creator) return { score: 0.35, displayName: "Creator" };
  return {
    score: clamp01((creator.reputation || 0) / 1000),
    displayName: creator.displayName || creator.username || "Creator",
  };
}

function safeCloneSafetyScore(pkg: AgentMarketplaceClonePackage | null | undefined) {
  if (!pkg) return 0;
  const safety = asRecord(pkg.safetyReport);
  const sanitizer = asRecord(pkg.sanitizerReport);
  const blockers = safeArray(safety.blockers).length;
  const warnings = safeArray(safety.warnings).length;
  const redactions = safeArray(sanitizer.redactions).length;
  const base = pkg.reviewStatus === "approved" ? 0.85 : pkg.reviewStatus === "pending_review" ? 0.45 : 0.25;
  return clamp01(base - blockers * 0.25 - warnings * 0.04 - redactions * 0.02);
}

function blockedChallengePenalty(pkg: AgentMarketplaceClonePackage | null | undefined, reviews: AgentReview[]) {
  const safety = asRecord(pkg?.safetyReport);
  const blockers = safeArray(safety.blockers).length;
  const rejectedReviews = reviews.filter((review) => review.moderationStatus === "rejected" || review.moderationStatus === "hidden").length;
  return clamp01((blockers + rejectedReviews) / 6);
}

function labelForScore(score: number, stats: ReturnType<typeof reviewStats>, pkg: AgentMarketplaceClonePackage | null | undefined): RankingLabel {
  if (!pkg || pkg.reviewStatus !== "approved") return "sandbox-only";
  if (stats.pendingCount > 0 || blockedChallengePenalty(pkg, []) > 0.25) return "needs-review";
  if (stats.approvedCount < 2) return "new";
  if (score >= 0.82) return "high-trust";
  if (score >= 0.6) return "trusted";
  return "sandbox-only";
}

async function calculateTrustRanking(params: {
  listing: MarketplaceListing;
  clonePackage: AgentMarketplaceClonePackage | null;
  agent: UserAgent | null;
  reviews: AgentReview[];
}) {
  const stats = reviewStats(params.reviews);
  const sandboxTestCount = params.clonePackage ? await sandboxTestCountForPackage(params.clonePackage.id) : 0;
  const ues = await uesTrustSignal(params.agent, params.clonePackage);
  const creator = await creatorReputationScore(params.listing.sellerId);
  const knowledge = await knowledgePacketSignalForCreator(params.listing.sellerId);
  const safety = safeCloneSafetyScore(params.clonePackage);
  const penalty = blockedChallengePenalty(params.clonePackage, params.reviews);

  const components = {
    approvedReviewRating: clamp01(stats.averageRating / 5),
    reviewHelpfulness: clamp01(Math.log1p(stats.helpfulTotal) / 3),
    uesTrustSignals: ues.score,
    safetyScore: safety,
    sandboxTestCount: clamp01(Math.log1p(sandboxTestCount) / 3),
    blockedChallengePenalty: penalty,
    creatorReputation: creator.score,
    knowledgePacketGluonSignal: knowledge.score,
  };

  const score = clamp01(
    components.approvedReviewRating * 0.25 +
    components.reviewHelpfulness * 0.10 +
    components.uesTrustSignals * 0.20 +
    components.safetyScore * 0.20 +
    components.sandboxTestCount * 0.10 -
    components.blockedChallengePenalty * 0.05 +
    components.creatorReputation * 0.05 +
    components.knowledgePacketGluonSignal * 0.05,
  );

  return {
    score: round(score * 100, 1),
    normalizedScore: round(score, 4),
    label: labelForScore(score, stats, params.clonePackage),
    formula: "25% reviews + 10% helpfulness + 20% UES/trust + 20% safety + 10% sandbox tests - 5% blockers + 5% creator reputation + 5% knowledge/Gluon signal",
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value, 4)])),
    reviewSummary: stats,
    sandboxTestCount,
    creatorReputation: {
      score: round(creator.score, 4),
      displayName: creator.displayName,
    },
    knowledgeSignal: {
      ...knowledge,
      score: round(knowledge.score, 4),
    },
    safety: {
      safeCloneSafetyScore: round(safety, 4),
      blockerPenalty: round(penalty, 4),
      noPurchaseRequired: true,
      sandboxOnly: true,
    },
  };
}

function publicTrustRankingSummary(ranking: Awaited<ReturnType<typeof calculateTrustRanking>>) {
  return stripPublicGluonForbiddenFields({
    score: ranking.score,
    label: ranking.label,
    reviewSummary: ranking.reviewSummary,
    sandboxTestCount: ranking.sandboxTestCount,
    safety: {
      noPurchaseRequired: true,
      sandboxOnly: true,
    },
    contributionHistory: {
      available: true,
      label: "Reviewed contribution history available",
      use: GLUON_SHORT_BADGE,
    },
  });
}

async function loadListingBundle(listingId: string) {
  const [listing] = await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, listingId)).limit(1);
  if (!listing || listing.status !== "approved") throw new MarketplaceReviewTrustError(404, "Marketplace listing not found.");
  const [clonePackage, agent, seller, reviews] = await Promise.all([
    db.select().from(agentMarketplaceClonePackages).where(eq(agentMarketplaceClonePackages.marketplaceListingId, listing.id)).limit(1).then((rows) => rows[0] || null),
    db.select().from(userAgents).where(eq(userAgents.id, listing.agentId)).limit(1).then((rows) => rows[0] || null),
    db.select().from(users).where(eq(users.id, listing.sellerId)).limit(1).then((rows) => rows[0] || null),
    db.select().from(agentReviews).where(eq(agentReviews.listingId, listing.id)).orderBy(desc(agentReviews.createdAt)),
  ]);
  if (!clonePackage || clonePackage.status !== "approved" || clonePackage.reviewStatus !== "approved") {
    throw new MarketplaceReviewTrustError(404, "Safe-clone listing not found.");
  }
  return { listing, clonePackage, agent, seller, reviews };
}

async function enrichPublicListing(listing: MarketplaceListing) {
  const [agent, seller, clonePackage, reviews] = await Promise.all([
    db.select().from(userAgents).where(eq(userAgents.id, listing.agentId)).limit(1).then((rows) => rows[0] || null),
    db.select().from(users).where(eq(users.id, listing.sellerId)).limit(1).then((rows) => rows[0] || null),
    db.select().from(agentMarketplaceClonePackages).where(eq(agentMarketplaceClonePackages.marketplaceListingId, listing.id)).limit(1).then((rows) => rows[0] || null),
    db.select().from(agentReviews).where(eq(agentReviews.listingId, listing.id)),
  ]);
  const trustRanking = publicTrustRankingSummary(await calculateTrustRanking({ listing, clonePackage, agent, reviews }));
  return {
    ...listing,
    totalSales: 0,
    totalRevenue: 0,
    priceCredits: 0,
    monthlyCredits: null,
    perUseCredits: null,
    revenueSplit: 0,
    agent: publicMarketplaceAgentSummary(agent),
    sellerName: seller?.displayName || seller?.username || "Creator",
    safeCloneOnly: true,
    transactionsEnabled: false,
    checkoutEnabled: false,
    purchaseEnabled: false,
    productionDeploymentEnabled: false,
    clonePackage: publicClonePackageSummary(clonePackage),
    trustRanking,
    trustLabel: trustRanking.label,
    sandboxReviewSummary: trustRanking.reviewSummary,
    noPurchaseNotice: "Sandbox preview only. Purchases, checkout, ownership transfer, creator earnings, and production deployment are disabled.",
  };
}

async function listPublicListings(options: PublicListingOptions = {}) {
  const limit = Math.max(1, Math.min(100, options.limit || 50));
  const filters = [eq(marketplaceListings.status, "approved")];
  if (options.category) filters.push(eq(marketplaceListings.category, options.category));
  if (options.featuredOnly) filters.push(eq(marketplaceListings.featured, true));
  if (options.query?.trim()) {
    const search = `%${options.query.trim()}%`;
    filters.push(sql`(${marketplaceListings.title} ilike ${search} or ${marketplaceListings.description} ilike ${search})`);
  }

  const rows = await db.select().from(marketplaceListings)
    .where(and(...filters))
    .orderBy(desc(marketplaceListings.updatedAt))
    .limit(limit);
  const enriched = await Promise.all(rows.map((listing) => enrichPublicListing(listing)));

  const safeCloneListings = enriched.filter((listing) => (
    listing.clonePackage?.status === "approved" &&
    listing.clonePackage?.reviewStatus === "approved"
  ));

  if (options.sort === "recent") {
    return safeCloneListings;
  }
  if (options.sort === "sandbox") {
    return safeCloneListings.sort((a, b) => b.trustRanking.sandboxTestCount - a.trustRanking.sandboxTestCount);
  }
  return safeCloneListings.sort((a, b) => b.trustRanking.score - a.trustRanking.score);
}

async function getPublicListing(listingId: string) {
  const { listing } = await loadListingBundle(listingId);
  return enrichPublicListing(listing);
}

function publicReview(review: AgentReview, reviewer: User | null | undefined) {
  return {
    id: review.id,
    listingId: review.listingId,
    clonePackageId: review.clonePackageId,
    rating: review.rating,
    title: review.title,
    content: review.content,
    helpful: review.helpful,
    moderationStatus: "approved",
    sandboxOnly: true,
    reviewerName: reviewer?.displayName || "Sandbox tester",
    reviewerAvatar: reviewer?.avatar || null,
    createdAt: review.createdAt,
  };
}

async function listPublicReviews(listingId: string) {
  const { listing } = await loadListingBundle(listingId);
  const reviews = await db.select().from(agentReviews)
    .where(and(eq(agentReviews.listingId, listing.id), eq(agentReviews.moderationStatus, "approved")))
    .orderBy(desc(agentReviews.createdAt));
  return Promise.all(reviews.map(async (review) => {
    const [reviewer] = await db.select().from(users).where(eq(users.id, review.reviewerId)).limit(1);
    return publicReview(review, reviewer || null);
  }));
}

async function updateListingReviewStats(listingId: string) {
  const reviews = await db.select().from(agentReviews).where(eq(agentReviews.listingId, listingId));
  const stats = reviewStats(reviews);
  const [updated] = await db.update(marketplaceListings)
    .set({ averageRating: stats.averageRating, reviewCount: stats.approvedCount, updatedAt: new Date() })
    .where(eq(marketplaceListings.id, listingId))
    .returning();

  if (updated?.agentId) {
    await db.update(userAgents)
      .set({ rating: stats.averageRating, ratingCount: stats.approvedCount, updatedAt: new Date() })
      .where(eq(userAgents.id, updated.agentId));
  }
  return stats;
}

async function createReview(reviewerId: string, input: CreateReviewInput) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new MarketplaceReviewTrustError(400, "Rating must be between 1 and 5.");
  }

  const { listing, clonePackage, agent } = await loadListingBundle(input.listingId);
  if (!clonePackage || clonePackage.reviewStatus !== "approved" || clonePackage.status !== "approved") {
    throw new MarketplaceReviewTrustError(403, "Reviews are available only for approved safe-clone packages.");
  }
  if (listing.sellerId === reviewerId || clonePackage.creatorUserId === reviewerId || agent?.ownerId === reviewerId) {
    throw new MarketplaceReviewTrustError(403, "Creators cannot review their own safe-clone listings.");
  }

  const sandboxed = await userSandboxedPackage(reviewerId, clonePackage.id);
  if (!sandboxed) {
    throw new MarketplaceReviewTrustError(403, "Run a sandbox test before reviewing this safe-clone listing.");
  }

  const [existing] = await db.select().from(agentReviews)
    .where(and(eq(agentReviews.listingId, listing.id), eq(agentReviews.reviewerId, reviewerId)))
    .limit(1);
  if (existing) throw new MarketplaceReviewTrustError(409, "You have already submitted a review for this listing.");

  const title = sanitizeReviewText(input.title, 120);
  const content = sanitizeReviewText(input.content, 1200);
  if (!title.text || !content.text) {
    throw new MarketplaceReviewTrustError(400, "Review title and content are required.");
  }

  const safetyReport = {
    sanitized: title.transformed || content.transformed,
    redactions: [...new Set([...title.redactions, ...content.redactions])],
    privateMemoryExposed: false,
    rawSandboxTranscriptIncluded: false,
    sandboxInteractionVerified: true,
    moderationRequired: true,
  };

  const [created] = await db.insert(agentReviews).values({
    agentId: listing.agentId,
    listingId: listing.id,
    clonePackageId: clonePackage.id,
    reviewerId,
    rating,
    title: title.text,
    content: content.text,
    moderationStatus: "pending_review",
    sandboxOnly: true,
    safetyReport,
  }).returning();

  await riskManagementService.logAudit({
    actorId: reviewerId,
    actorType: "user",
    action: "marketplace_review_submitted",
    resourceType: "agent_review",
    resourceId: created.id,
    outcome: "success",
    riskLevel: "medium",
    details: {
      listingId: listing.id,
      clonePackageId: clonePackage.id,
      rating,
      moderationStatus: "pending_review",
      redactions: safetyReport.redactions,
      sandboxOnly: true,
      noPurchaseRequired: true,
    },
  });

  return {
    review: {
      id: created.id,
      moderationStatus: created.moderationStatus,
      sandboxOnly: true,
      rating: created.rating,
      title: created.title,
      createdAt: created.createdAt,
    },
    message: "Review submitted for admin moderation.",
  };
}

async function listAdminReviews(status?: string) {
  const filters = status ? [eq(agentReviews.moderationStatus, status)] : [];
  const rows = await db.select().from(agentReviews)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(agentReviews.createdAt))
    .limit(100);

  return Promise.all(rows.map(async (review) => {
    const [listing, clonePackage, reviewer] = await Promise.all([
      db.select().from(marketplaceListings).where(eq(marketplaceListings.id, review.listingId)).limit(1).then((r) => r[0] || null),
      review.clonePackageId
        ? db.select().from(agentMarketplaceClonePackages).where(eq(agentMarketplaceClonePackages.id, review.clonePackageId)).limit(1).then((r) => r[0] || null)
        : db.select().from(agentMarketplaceClonePackages).where(eq(agentMarketplaceClonePackages.marketplaceListingId, review.listingId)).limit(1).then((r) => r[0] || null),
      db.select().from(users).where(eq(users.id, review.reviewerId)).limit(1).then((r) => r[0] || null),
    ]);
    const reviews = listing ? await db.select().from(agentReviews).where(eq(agentReviews.listingId, listing.id)) : [];
    const agent = listing ? await db.select().from(userAgents).where(eq(userAgents.id, listing.agentId)).limit(1).then((r) => r[0] || null) : null;
    const trustRanking = listing ? await calculateTrustRanking({ listing, clonePackage, agent, reviews }) : null;
    return {
      ...review,
      reviewer: reviewer ? { id: reviewer.id, displayName: reviewer.displayName || reviewer.username } : null,
      listing: listing ? { id: listing.id, title: listing.title, status: listing.status } : null,
      clonePackage: clonePackage ? { id: clonePackage.id, reviewStatus: clonePackage.reviewStatus, status: clonePackage.status } : null,
      trustRanking,
      auditSafe: true,
    };
  }));
}

async function moderateReview(reviewId: string, status: Exclude<ModerationStatus, "pending_review">, actorId: string) {
  const [review] = await db.select().from(agentReviews).where(eq(agentReviews.id, reviewId)).limit(1);
  if (!review) throw new MarketplaceReviewTrustError(404, "Review not found.");
  const [updated] = await db.update(agentReviews).set({
    moderationStatus: status,
    reviewedBy: actorId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(agentReviews.id, reviewId)).returning();

  const stats = await updateListingReviewStats(updated.listingId);
  await riskManagementService.logAudit({
    actorId,
    actorType: "root_admin",
    action: `marketplace_review_${status}`,
    resourceType: "agent_review",
    resourceId: reviewId,
    outcome: "success",
    riskLevel: status === "approved" ? "medium" : "high",
    details: {
      listingId: updated.listingId,
      clonePackageId: updated.clonePackageId,
      previousStatus: review.moderationStatus,
      nextStatus: status,
      reviewStats: stats,
      auditDataRetained: true,
    },
  });

  return { review: updated, reviewStats: stats };
}

async function listCreatorReviewSummaries(creatorUserId: string) {
  const packages = await db.select().from(agentMarketplaceClonePackages)
    .where(eq(agentMarketplaceClonePackages.creatorUserId, creatorUserId))
    .orderBy(desc(agentMarketplaceClonePackages.createdAt));

  return Promise.all(packages.map(async (pkg) => {
    const listing = pkg.marketplaceListingId
      ? await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, pkg.marketplaceListingId)).limit(1).then((rows) => rows[0] || null)
      : null;
    const reviews = listing
      ? await db.select().from(agentReviews).where(eq(agentReviews.listingId, listing.id))
      : [];
    const agent = listing
      ? await db.select().from(userAgents).where(eq(userAgents.id, listing.agentId)).limit(1).then((rows) => rows[0] || null)
      : null;
    const ranking = listing ? publicTrustRankingSummary(await calculateTrustRanking({ listing, clonePackage: pkg, agent, reviews })) : null;
    const stats = reviewStats(reviews);
    return {
      clonePackageId: pkg.id,
      listingId: pkg.marketplaceListingId,
      title: asRecord(pkg.packageMetadata).listing?.title || listing?.title || "Safe clone package",
      reviewStatus: pkg.reviewStatus,
      status: pkg.status,
      trustRanking: ranking,
      reviewSummary: stats,
      reviews: approvedReviews(reviews).slice(0, 5).map((review) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        content: review.content,
        createdAt: review.createdAt,
      })),
    };
  }));
}

export const marketplaceReviewTrustService = {
  listPublicListings,
  getPublicListing,
  enrichPublicListing,
  listPublicReviews,
  createReview,
  listAdminReviews,
  moderateReview,
  listCreatorReviewSummaries,
  calculateTrustRanking,
};
