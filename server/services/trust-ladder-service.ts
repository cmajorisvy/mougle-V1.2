import { db } from "../db";
import { trustLadderProfiles, users, creatorPublisherProfiles, creatorPromotionDeclarations, posts, comments, appModerationReports } from "@shared/schema";
import { eq, and, count, avg, sql, desc } from "drizzle-orm";

export type TrustLevelId = "visitor" | "explorer" | "participant" | "verified_creator" | "trusted_publisher" | "intelligence_builder" | "ecosystem_partner";

interface TrustLevelConfig {
  label: string;
  description: string;
  order: number;
  minScore: number;
  requirements: string[];
  capabilities: {
    canPublish: boolean;
    canSell: boolean;
    canPromote: boolean;
    canBuildEntities: boolean;
    canPartner: boolean;
  };
  color: string;
  icon: string;
}

const TRUST_LEVELS: Record<TrustLevelId, TrustLevelConfig> = {
  visitor: {
    label: "Visitor",
    description: "New to the platform. Browse and observe.",
    order: 0,
    minScore: 0,
    requirements: [],
    capabilities: { canPublish: false, canSell: false, canPromote: false, canBuildEntities: false, canPartner: false },
    color: "#6b7280",
    icon: "Eye",
  },
  explorer: {
    label: "Explorer",
    description: "Verified email. Can participate in discussions and topics.",
    order: 1,
    minScore: 10,
    requirements: ["Verify email address", "Complete profile"],
    capabilities: { canPublish: false, canSell: false, canPromote: false, canBuildEntities: false, canPartner: false },
    color: "#3b82f6",
    icon: "Compass",
  },
  participant: {
    label: "Participant",
    description: "Active contributor. Can create content and join debates.",
    order: 2,
    minScore: 30,
    requirements: ["5+ quality posts or comments", "No policy violations"],
    capabilities: { canPublish: false, canSell: false, canPromote: false, canBuildEntities: false, canPartner: false },
    color: "#8b5cf6",
    icon: "MessageSquare",
  },
  verified_creator: {
    label: "Verified Creator",
    description: "Identity verified. Can publish apps and create entities.",
    order: 3,
    minScore: 50,
    requirements: ["Complete publisher profile", "Accept publisher agreement", "Submit promotion declaration"],
    capabilities: { canPublish: true, canSell: false, canPromote: false, canBuildEntities: true, canPartner: false },
    color: "#10b981",
    icon: "BadgeCheck",
  },
  trusted_publisher: {
    label: "Trusted Publisher",
    description: "Established publisher. Can sell and promote apps.",
    order: 4,
    minScore: 70,
    requirements: ["3+ published apps", "Clean moderation record", "30+ days active", "Good ratings"],
    capabilities: { canPublish: true, canSell: true, canPromote: true, canBuildEntities: true, canPartner: false },
    color: "#f59e0b",
    icon: "ShieldCheck",
  },
  intelligence_builder: {
    label: "Intelligence Builder",
    description: "Expert builder. Full platform access with entity collaboration.",
    order: 5,
    minScore: 85,
    requirements: ["10+ published apps", "Average rating 4+", "No violations for 90 days", "Active entity contributions"],
    capabilities: { canPublish: true, canSell: true, canPromote: true, canBuildEntities: true, canPartner: false },
    color: "#ef4444",
    icon: "Brain",
  },
  ecosystem_partner: {
    label: "Ecosystem Partner",
    description: "Trusted ecosystem leader. Full access including partnership features.",
    order: 6,
    minScore: 95,
    requirements: ["Intelligence Builder status", "Significant platform contribution", "Clean record for 180+ days", "Community recognition"],
    capabilities: { canPublish: true, canSell: true, canPromote: true, canBuildEntities: true, canPartner: true },
    color: "#d946ef",
    icon: "Crown",
  },
};

const SIGNAL_WEIGHTS = {
  activityQuality: 0.25,
  identityVerification: 0.25,
  publisherAgreement: 0.20,
  ratings: 0.15,
  policyViolations: 0.15,
};

class TrustLadderService {

  getLevels() {
    return TRUST_LEVELS;
  }

  getLevelConfig(level: TrustLevelId): TrustLevelConfig {
    return TRUST_LEVELS[level] || TRUST_LEVELS.visitor;
  }

  async getStatus(userId: string) {
    let profile = await this.getProfile(userId);

    if (!profile) {
      profile = await this.initializeProfile(userId);
    }

    const currentLevel = profile.trustLevel as TrustLevelId;
    const levelConfig = this.getLevelConfig(currentLevel);
    const nextLevel = this.getNextLevel(currentLevel);
    const nextLevelConfig = nextLevel ? this.getLevelConfig(nextLevel) : null;

    const progressToNext = nextLevelConfig
      ? Math.min(100, Math.round(((profile.trustScore - levelConfig.minScore) / (nextLevelConfig.minScore - levelConfig.minScore)) * 100))
      : 100;

    return {
      userId,
      trustLevel: currentLevel,
      trustScore: Math.round(profile.trustScore * 10) / 10,
      levelConfig,
      signals: {
        activityQuality: { score: Math.round(profile.activityQuality * 10) / 10, weight: SIGNAL_WEIGHTS.activityQuality, label: "Activity Quality" },
        identityVerification: { score: Math.round(profile.identityVerification * 10) / 10, weight: SIGNAL_WEIGHTS.identityVerification, label: "Identity Verification" },
        publisherAgreement: { score: Math.round(profile.publisherAgreement * 10) / 10, weight: SIGNAL_WEIGHTS.publisherAgreement, label: "Publisher Agreement" },
        ratings: { score: Math.round(profile.ratings * 10) / 10, weight: SIGNAL_WEIGHTS.ratings, label: "Community Ratings" },
        policyViolations: { score: Math.round(profile.policyViolations * 10) / 10, weight: SIGNAL_WEIGHTS.policyViolations, label: "Policy Compliance" },
      },
      capabilities: {
        canPublish: profile.canPublish,
        canSell: profile.canSell,
        canPromote: profile.canPromote,
        canBuildEntities: profile.canBuildEntities,
        canPartner: profile.canPartner,
      },
      nextLevel: nextLevel ? {
        level: nextLevel,
        label: nextLevelConfig!.label,
        minScore: nextLevelConfig!.minScore,
        requirements: nextLevelConfig!.requirements,
        progress: Math.max(0, progressToNext),
      } : null,
      lastComputedAt: profile.lastComputedAt,
    };
  }

  async recompute(userId: string) {
    const signals = await this.computeSignals(userId);
    const trustScore = this.calculateTrustScore(signals);
    const trustLevel = this.determineTrustLevel(trustScore);
    const capabilities = TRUST_LEVELS[trustLevel].capabilities;

    let profile = await this.getProfile(userId);

    if (profile) {
      await db.update(trustLadderProfiles).set({
        trustLevel,
        trustScore,
        activityQuality: signals.activityQuality,
        identityVerification: signals.identityVerification,
        publisherAgreement: signals.publisherAgreement,
        ratings: signals.ratings,
        policyViolations: signals.policyViolations,
        ...capabilities,
        lastComputedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(trustLadderProfiles.userId, userId));
    } else {
      await db.insert(trustLadderProfiles).values({
        userId,
        trustLevel,
        trustScore,
        activityQuality: signals.activityQuality,
        identityVerification: signals.identityVerification,
        publisherAgreement: signals.publisherAgreement,
        ratings: signals.ratings,
        policyViolations: signals.policyViolations,
        ...capabilities,
      });
    }

    return this.getStatus(userId);
  }

  async getCapabilities(userId: string) {
    const profile = await this.getProfile(userId);
    if (!profile) {
      return TRUST_LEVELS.visitor.capabilities;
    }
    return {
      canPublish: profile.canPublish,
      canSell: profile.canSell,
      canPromote: profile.canPromote,
      canBuildEntities: profile.canBuildEntities,
      canPartner: profile.canPartner,
    };
  }

  async checkAccess(userId: string, capability: keyof typeof TRUST_LEVELS.visitor.capabilities): Promise<{ allowed: boolean; requiredLevel?: string }> {
    const caps = await this.getCapabilities(userId);
    if (caps[capability]) {
      return { allowed: true };
    }
    const requiredLevel = this.getMinLevelForCapability(capability);
    return { allowed: false, requiredLevel };
  }

  private getMinLevelForCapability(capability: string): string {
    for (const [level, config] of Object.entries(TRUST_LEVELS)) {
      if ((config.capabilities as any)[capability]) return config.label;
    }
    return "Ecosystem Partner";
  }

  private async computeSignals(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    const activityQuality = await this.computeActivityQuality(userId, user);
    const identityVerification = this.computeIdentityVerification(user);
    const publisherAgreement = await this.computePublisherAgreement(userId);
    const ratingsScore = await this.computeRatings(userId, user);
    const policyViolations = this.computePolicyViolations(user);

    return {
      activityQuality,
      identityVerification,
      publisherAgreement,
      ratings: ratingsScore,
      policyViolations,
    };
  }

  private async computeActivityQuality(userId: string, user: any): Promise<number> {
    if (!user) return 0;

    let score = 0;

    const [postResult] = await db.select({ count: count() }).from(posts).where(eq(posts.authorId, userId));
    const postCount = postResult?.count || 0;
    score += Math.min(30, postCount * 3);

    const [commentResult] = await db.select({ count: count() }).from(comments).where(eq(comments.authorId, userId));
    const commentCount = commentResult?.count || 0;
    score += Math.min(20, commentCount * 2);

    const reputation = user.reputation || 0;
    score += Math.min(30, reputation / 10);

    const accountAge = user.createdAt ? (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24) : 0;
    score += Math.min(20, accountAge / 5);

    return Math.min(100, score);
  }

  private computeIdentityVerification(user: any): number {
    if (!user) return 0;

    let score = 0;
    if (user.emailVerified) score += 40;
    if (user.profileCompleted) score += 30;
    if (user.displayName && user.displayName !== user.username) score += 10;
    if (user.bio) score += 10;
    if (user.avatar) score += 10;

    return Math.min(100, score);
  }

  private async computePublisherAgreement(userId: string): Promise<number> {
    let score = 0;

    const [publisherProfile] = await db.select().from(creatorPublisherProfiles)
      .where(eq(creatorPublisherProfiles.userId, userId)).limit(1);

    if (publisherProfile) {
      score += 30;
      if (publisherProfile.agreementVersion) score += 30;
      if (publisherProfile.isVerified) score += 20;
    }

    const [declaration] = await db.select().from(creatorPromotionDeclarations)
      .where(eq(creatorPromotionDeclarations.userId, userId))
      .orderBy(desc(creatorPromotionDeclarations.createdAt))
      .limit(1);

    if (declaration) {
      score += 20;
    }

    return Math.min(100, score);
  }

  private async computeRatings(userId: string, user: any): Promise<number> {
    if (!user) return 50;

    let score = 50;

    const reputation = user.reputation || 0;
    if (reputation >= 100) score += 20;
    else if (reputation >= 50) score += 10;
    else if (reputation >= 10) score += 5;

    const [postResult] = await db.select({ count: count() }).from(posts).where(eq(posts.authorId, userId));
    const postCount = postResult?.count || 0;
    if (postCount >= 10) score += 15;
    else if (postCount >= 5) score += 10;
    else if (postCount >= 1) score += 5;

    const xp = user.intelligenceXp || 0;
    score += Math.min(15, xp / 100);

    return Math.min(100, score);
  }

  private computePolicyViolations(user: any): number {
    if (!user) return 100;

    let score = 100;

    const violations = user.spamViolations || 0;
    score -= violations * 15;

    if (user.isSpammer) score -= 50;
    if (user.isShadowBanned) score -= 30;

    const spamScore = user.spamScore || 0;
    score -= Math.min(20, spamScore / 5);

    return Math.max(0, score);
  }

  private calculateTrustScore(signals: Record<string, number>): number {
    return (
      signals.activityQuality * SIGNAL_WEIGHTS.activityQuality +
      signals.identityVerification * SIGNAL_WEIGHTS.identityVerification +
      signals.publisherAgreement * SIGNAL_WEIGHTS.publisherAgreement +
      signals.ratings * SIGNAL_WEIGHTS.ratings +
      signals.policyViolations * SIGNAL_WEIGHTS.policyViolations
    );
  }

  private determineTrustLevel(score: number): TrustLevelId {
    const levels: TrustLevelId[] = ["ecosystem_partner", "intelligence_builder", "trusted_publisher", "verified_creator", "participant", "explorer", "visitor"];
    for (const level of levels) {
      if (score >= TRUST_LEVELS[level].minScore) return level;
    }
    return "visitor";
  }

  private getNextLevel(current: TrustLevelId): TrustLevelId | null {
    const order: TrustLevelId[] = ["visitor", "explorer", "participant", "verified_creator", "trusted_publisher", "intelligence_builder", "ecosystem_partner"];
    const idx = order.indexOf(current);
    if (idx < 0 || idx >= order.length - 1) return null;
    return order[idx + 1];
  }

  private async getProfile(userId: string) {
    const [profile] = await db.select().from(trustLadderProfiles)
      .where(eq(trustLadderProfiles.userId, userId)).limit(1);
    return profile || null;
  }

  private async initializeProfile(userId: string) {
    const [existing] = await db.select().from(trustLadderProfiles)
      .where(eq(trustLadderProfiles.userId, userId)).limit(1);
    if (existing) return existing;

    const [profile] = await db.insert(trustLadderProfiles).values({
      userId,
      trustLevel: "visitor",
      trustScore: 0,
      activityQuality: 0,
      identityVerification: 0,
      publisherAgreement: 0,
      ratings: 0,
      policyViolations: 100,
    }).returning();

    return profile;
  }
}

export const trustLadderService = new TrustLadderService();
