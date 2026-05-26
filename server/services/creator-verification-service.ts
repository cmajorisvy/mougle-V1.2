import { db } from "../db";
import { creatorPublisherProfiles, creatorPromotionDeclarations } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

const TRUST_LEVELS = {
  explorer: {
    label: "Explorer",
    description: "New creator. Limited publishing capabilities.",
    requirements: [],
    maxAppsPerDay: 1,
    canPromote: false,
  },
  verified_creator: {
    label: "Verified Creator",
    description: "Verified identity with completed profile and signed agreement.",
    requirements: ["Complete publisher profile", "Accept publisher agreement", "Submit promotion declaration"],
    maxAppsPerDay: 5,
    canPromote: true,
  },
  trusted_publisher: {
    label: "Trusted Publisher",
    description: "Established publisher with clean moderation record and active apps.",
    requirements: ["Verified Creator status", "At least 3 published apps", "No unresolved moderation reports", "30+ days active"],
    maxAppsPerDay: 25,
    canPromote: true,
  },
};

const MARKETING_METHODS = [
  { id: "social_media", label: "Social Media (Instagram, Twitter, LinkedIn, etc.)" },
  { id: "email_marketing", label: "Email Marketing (newsletters, drip campaigns)" },
  { id: "content_marketing", label: "Content Marketing (blogs, videos, podcasts)" },
  { id: "paid_ads", label: "Paid Advertising (Google Ads, Meta Ads)" },
  { id: "seo", label: "Search Engine Optimization (SEO)" },
  { id: "word_of_mouth", label: "Word of Mouth / Referrals" },
  { id: "community_forums", label: "Community Forums & Groups" },
  { id: "influencer_partnerships", label: "Influencer / Partner Collaborations" },
  { id: "offline_events", label: "Offline Events & Conferences" },
  { id: "direct_outreach", label: "Direct Outreach (cold emails, messages)" },
];

const PROMOTION_CHANNELS = [
  { id: "instagram", label: "Instagram" },
  { id: "twitter", label: "Twitter / X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "reddit", label: "Reddit" },
  { id: "personal_website", label: "Personal Website / Blog" },
  { id: "email_list", label: "Email List" },
  { id: "other", label: "Other" },
];

const DECLARATION_VERSION = "1.0";

const RESPONSIBLE_PROMOTION_AGREEMENT = `
RESPONSIBLE PROMOTION DECLARATION — Mougle Labs
Version ${DECLARATION_VERSION}

By submitting this declaration, you ("Creator") acknowledge and agree to the following:

1. HONEST MARKETING
You will promote your applications truthfully and accurately. You will not make false claims about app functionality, performance, or results.

2. NO SPAM
You will not engage in unsolicited bulk messaging, comment spam, fake reviews, or any form of spam promotion. You will respect platform rules of all channels where you promote.

3. NO ILLEGAL PROMOTION
You will not use deceptive advertising, pyramid schemes, misleading testimonials, or any promotional tactic that violates applicable advertising and consumer protection laws.

4. DATA RESPONSIBILITY
You will not collect, scrape, or misuse personal data obtained through promotional activities. You will comply with applicable privacy laws (DPDP Act, GDPR, etc.).

5. PLATFORM RESPECT
You will not manipulate platform metrics, create fake accounts, or engage in any activity designed to artificially boost your app's visibility or downloads.

6. CONSEQUENCES
Violation of this declaration may result in trust level downgrade, app removal, or account suspension.
`.trim();

const DATA_COLLECTION_PRIVACY_NOTICE = `
WHY WE COLLECT THIS INFORMATION

1. IDENTITY VERIFICATION
Your name, business type, and contact details help us verify that you are a real person or organization, preventing anonymous abuse of the marketplace.

2. RESPONSIBLE PROMOTION
Your marketing method selections help us understand how creators promote apps, ensuring promotions meet community standards and legal requirements.

3. ACCOUNTABILITY
Your contact email and location ensure that users of your apps can reach you for support, and that legal obligations can be fulfilled in the relevant jurisdiction.

4. TRUST LEVELS
The information you provide determines your trust level (Explorer → Verified Creator → Trusted Publisher), unlocking more platform capabilities as you build credibility.

5. DATA HANDLING
Your information is stored securely and only used for platform operations. We do not sell your data to third parties. You can request data export or deletion at any time via the Privacy Center.

6. LEGAL BASIS
We collect this information to fulfill our legal obligations as a platform intermediary and to ensure compliance with applicable consumer protection and data protection laws.
`.trim();

class CreatorVerificationService {

  async getVerificationStatus(userId: string) {
    const profile = await this.getProfile(userId);
    const declaration = await this.getDeclaration(userId);

    const trustLevel = profile?.trustLevel || "explorer";
    const trustConfig = TRUST_LEVELS[trustLevel as keyof typeof TRUST_LEVELS] || TRUST_LEVELS.explorer;

    const checks = {
      profileComplete: !!(profile?.publisherName && profile?.supportEmail && profile?.address && profile?.businessType),
      agreementSigned: !!profile?.agreementVersion,
      promotionDeclared: !!declaration,
      accountActive: profile?.isActive !== false,
    };

    const canUpgrade = this.getUpgradeEligibility(trustLevel, checks);

    return {
      userId,
      trustLevel,
      trustConfig,
      checks,
      canUpgrade,
      profile: profile ? {
        name: profile.publisherName,
        company: profile.companyName,
        businessType: profile.businessType,
        email: profile.supportEmail,
        location: [profile.city, profile.state, profile.country].filter(Boolean).join(", "),
        verified: profile.isVerified,
      } : null,
      declaration: declaration ? {
        marketingMethods: declaration.marketingMethods,
        promotionChannels: declaration.promotionChannels,
        acceptedAt: declaration.acceptedAt,
      } : null,
    };
  }

  private getUpgradeEligibility(currentLevel: string, checks: Record<string, boolean>) {
    if (currentLevel === "explorer") {
      const eligible = checks.profileComplete && checks.agreementSigned && checks.promotionDeclared;
      return {
        nextLevel: "verified_creator",
        nextLabel: "Verified Creator",
        eligible,
        missing: [
          ...(!checks.profileComplete ? ["Complete publisher profile"] : []),
          ...(!checks.agreementSigned ? ["Accept publisher agreement"] : []),
          ...(!checks.promotionDeclared ? ["Submit promotion declaration"] : []),
        ],
      };
    }
    if (currentLevel === "verified_creator") {
      return {
        nextLevel: "trusted_publisher",
        nextLabel: "Trusted Publisher",
        eligible: false,
        missing: ["Publish at least 3 apps", "Maintain clean moderation record for 30+ days"],
      };
    }
    return { nextLevel: null, nextLabel: null, eligible: false, missing: [] };
  }

  async upgradeTrustLevel(userId: string): Promise<{ success: boolean; newLevel?: string; reason?: string }> {
    const status = await this.getVerificationStatus(userId);

    if (!status.canUpgrade.eligible) {
      return { success: false, reason: `Not eligible. Missing: ${status.canUpgrade.missing.join(", ")}` };
    }

    const newLevel = status.canUpgrade.nextLevel;
    if (!newLevel) return { success: false, reason: "Already at highest trust level" };

    await db.update(creatorPublisherProfiles).set({
      trustLevel: newLevel,
      isVerified: newLevel === "verified_creator" || newLevel === "trusted_publisher",
      updatedAt: new Date(),
    }).where(eq(creatorPublisherProfiles.userId, userId));

    return { success: true, newLevel };
  }

  async submitPromotionDeclaration(userId: string, data: {
    marketingMethods: string[];
    targetAudience?: string;
    promotionChannels?: string[];
    additionalNotes?: string;
    ipAddress?: string;
  }) {
    if (!data.marketingMethods || data.marketingMethods.length === 0) {
      throw new Error("At least one marketing method must be selected");
    }

    const existing = await this.getDeclaration(userId);

    if (existing) {
      await db.update(creatorPromotionDeclarations).set({
        marketingMethods: data.marketingMethods,
        targetAudience: data.targetAudience || null,
        promotionChannels: data.promotionChannels || null,
        additionalNotes: data.additionalNotes || null,
        spamAgreement: true,
        legalComplianceAgreement: true,
        dataUsageConsent: true,
        declarationVersion: DECLARATION_VERSION,
        acceptedAt: new Date(),
        ipAddress: data.ipAddress || null,
        updatedAt: new Date(),
      }).where(eq(creatorPromotionDeclarations.id, existing.id));

      const [updated] = await db.select().from(creatorPromotionDeclarations)
        .where(eq(creatorPromotionDeclarations.id, existing.id));
      return updated;
    }

    const [declaration] = await db.insert(creatorPromotionDeclarations).values({
      userId,
      marketingMethods: data.marketingMethods,
      targetAudience: data.targetAudience || null,
      promotionChannels: data.promotionChannels || null,
      spamAgreement: true,
      legalComplianceAgreement: true,
      dataUsageConsent: true,
      additionalNotes: data.additionalNotes || null,
      declarationVersion: DECLARATION_VERSION,
      ipAddress: data.ipAddress || null,
    }).returning();

    return declaration;
  }

  async getDeclaration(userId: string) {
    const [declaration] = await db.select().from(creatorPromotionDeclarations)
      .where(eq(creatorPromotionDeclarations.userId, userId))
      .orderBy(desc(creatorPromotionDeclarations.createdAt))
      .limit(1);
    return declaration || null;
  }

  private async getProfile(userId: string) {
    const [profile] = await db.select().from(creatorPublisherProfiles)
      .where(eq(creatorPublisherProfiles.userId, userId)).limit(1);
    return profile || null;
  }

  getTrustLevels() {
    return TRUST_LEVELS;
  }

  getMarketingMethods() {
    return MARKETING_METHODS;
  }

  getPromotionChannels() {
    return PROMOTION_CHANNELS;
  }

  getPromotionAgreement() {
    return {
      version: DECLARATION_VERSION,
      text: RESPONSIBLE_PROMOTION_AGREEMENT,
    };
  }

  getPrivacyNotice() {
    return DATA_COLLECTION_PRIVACY_NOTICE;
  }
}

export const creatorVerificationService = new CreatorVerificationService();
