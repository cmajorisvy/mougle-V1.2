import { db } from "../db";
import { creatorPublisherProfiles, labsApps } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const CURRENT_AGREEMENT_VERSION = "1.0";

const PUBLISHER_AGREEMENT_TEXT = `
CREATOR PUBLISHER AGREEMENT — Mougle Labs
Version ${CURRENT_AGREEMENT_VERSION}

By publishing an application on Mougle Labs, you ("Creator", "Publisher") acknowledge and agree to the following:

1. APPLICATION RESPONSIBILITY
You are solely responsible for the functionality, performance, accuracy, and quality of the application you publish. Mougle provides the technology infrastructure and does not operate, control, or endorse your application.

2. PROMPT & CONTENT MODIFICATIONS
Any modifications you make to AI prompts, configurations, data inputs, or application logic are your responsibility. You must ensure modifications do not produce harmful, misleading, or illegal outputs.

3. LEGAL COMPLIANCE
You are responsible for ensuring your application complies with all applicable laws and regulations, including but not limited to: data protection laws (DPDP Act, GDPR), consumer protection laws, industry-specific regulations (HIPAA, PCI-DSS, FERPA, etc.), intellectual property rights, and local business licensing requirements.

4. USER ENQUIRIES & SUPPORT
You must provide a valid support email and respond to user enquiries, complaints, and issues related to your application within a reasonable timeframe.

5. DATA HANDLING
You are responsible for how your application collects, processes, stores, and shares user data. You must maintain a privacy policy and obtain appropriate consent where required. Mougle does not access, control, or process end-user data within your application.

6. INDEMNIFICATION
You agree to indemnify and hold harmless Mougle, its affiliates, officers, and employees from any claims, damages, or liabilities arising from your application.

7. PLATFORM ROLE
Mougle is a technology platform that provides infrastructure, tools, and distribution services. Mougle does not operate published applications and bears no responsibility for application-specific outcomes, decisions, or data handling practices.

8. TERMINATION
Mougle reserves the right to remove any application that violates this agreement, applicable laws, or platform policies.
`.trim();

const PLATFORM_DISCLAIMER = `This application is published and operated by an independent creator on Mougle Labs. Mougle provides the technology infrastructure only and does not operate, endorse, or assume responsibility for this application's functionality, content, data handling, or outputs. For support, contact the publisher directly.`;

class PublisherResponsibilityService {

  async getProfile(userId: string) {
    const [profile] = await db.select().from(creatorPublisherProfiles)
      .where(eq(creatorPublisherProfiles.userId, userId)).limit(1);
    return profile || null;
  }

  async createOrUpdateProfile(userId: string, data: {
    publisherName: string;
    companyName?: string;
    businessType: string;
    address: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    supportEmail: string;
    supportPhone?: string;
    websiteUrl?: string;
  }) {
    const existing = await this.getProfile(userId);

    if (existing) {
      await db.update(creatorPublisherProfiles).set({
        ...data,
        updatedAt: new Date(),
      }).where(eq(creatorPublisherProfiles.id, existing.id));
      const [updated] = await db.select().from(creatorPublisherProfiles)
        .where(eq(creatorPublisherProfiles.id, existing.id)).limit(1);
      return updated;
    }

    const [profile] = await db.insert(creatorPublisherProfiles).values({
      userId,
      ...data,
      isActive: true,
    }).returning();
    return profile;
  }

  async acceptAgreement(userId: string, ipAddress?: string) {
    const profile = await this.getProfile(userId);
    if (!profile) throw new Error("Publisher profile required before accepting agreement");

    await db.update(creatorPublisherProfiles).set({
      agreementVersion: CURRENT_AGREEMENT_VERSION,
      agreementAcceptedAt: new Date(),
      agreementIpAddress: ipAddress || "unknown",
      updatedAt: new Date(),
    }).where(eq(creatorPublisherProfiles.id, profile.id));

    const [updated] = await db.select().from(creatorPublisherProfiles)
      .where(eq(creatorPublisherProfiles.id, profile.id)).limit(1);
    return updated;
  }

  async canPublish(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const profile = await this.getProfile(userId);
    if (!profile) return { allowed: false, reason: "Publisher profile not created" };
    if (!profile.publisherName || !profile.supportEmail || !profile.address) {
      return { allowed: false, reason: "Publisher profile incomplete — name, email, and address required" };
    }
    if (!profile.agreementVersion || profile.agreementVersion !== CURRENT_AGREEMENT_VERSION) {
      return { allowed: false, reason: "Publisher agreement not accepted or outdated" };
    }
    if (!profile.isActive) {
      return { allowed: false, reason: "Publisher account is suspended" };
    }
    return { allowed: true };
  }

  async getPublisherInfoForApp(appId: string) {
    const [app] = await db.select().from(labsApps).where(eq(labsApps.id, appId)).limit(1);
    if (!app) return null;

    const profile = await this.getProfile(app.creatorId);
    if (!profile) return { disclaimer: PLATFORM_DISCLAIMER, publisher: null };

    return {
      disclaimer: PLATFORM_DISCLAIMER,
      publisher: {
        name: profile.publisherName,
        company: profile.companyName,
        businessType: profile.businessType,
        supportEmail: profile.supportEmail,
        supportPhone: profile.supportPhone,
        website: profile.websiteUrl,
        country: profile.country,
        verified: profile.isVerified,
        agreementAccepted: !!profile.agreementAcceptedAt,
      },
    };
  }

  getAgreementText() {
    return {
      version: CURRENT_AGREEMENT_VERSION,
      text: PUBLISHER_AGREEMENT_TEXT,
    };
  }

  getPlatformDisclaimer() {
    return PLATFORM_DISCLAIMER;
  }
}

export const publisherResponsibilityService = new PublisherResponsibilityService();
