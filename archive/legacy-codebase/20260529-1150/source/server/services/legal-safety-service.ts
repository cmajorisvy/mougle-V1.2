import { db } from "../db";
import {
  appModerationReports, appRiskDisclaimers, aiUsageViolations,
  dailyCreationLimits, labsApps, creatorPublisherProfiles
} from "@shared/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";

const RISK_CATEGORIES: Record<string, {
  level: string;
  disclaimer: string;
  regulatoryTags: string[];
}> = {
  healthcare: {
    level: "critical",
    disclaimer: "This application is NOT a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of a qualified healthcare provider. The creator of this application is solely responsible for its medical-related content and functionality. This app has NOT been reviewed or approved by any medical regulatory authority. Mougle provides technology infrastructure only.",
    regulatoryTags: ["HIPAA", "DPDP", "Medical Devices Act"],
  },
  finance: {
    level: "high",
    disclaimer: "This application does NOT constitute financial advice, investment recommendation, or banking service. Any financial decisions made using this app are at your own risk. The creator is responsible for compliance with applicable financial regulations. Mougle is a technology platform and does not provide financial services.",
    regulatoryTags: ["RBI", "SEBI", "PCI-DSS", "DPDP"],
  },
  legal: {
    level: "high",
    disclaimer: "This application does NOT provide legal advice and should not be relied upon as a substitute for professional legal counsel. The creator is responsible for accuracy of legal information. Mougle provides technology infrastructure only and does not practice law.",
    regulatoryTags: ["Bar Council", "DPDP"],
  },
  education: {
    level: "medium",
    disclaimer: "This educational application is created by an independent publisher. Educational content accuracy and appropriateness are the sole responsibility of the creator. This app may collect student data — the creator is responsible for compliance with applicable education data protection laws. Mougle provides infrastructure only.",
    regulatoryTags: ["FERPA", "COPPA", "DPDP"],
  },
  ecommerce: {
    level: "medium",
    disclaimer: "This marketplace/e-commerce application is operated by an independent creator. All transactions, product quality, delivery, and customer service are the responsibility of the creator/seller. Mougle provides technology infrastructure and payment processing only, and is not a party to transactions between buyers and sellers.",
    regulatoryTags: ["Consumer Protection Act", "E-Commerce Rules", "PCI-DSS"],
  },
  "real-estate": {
    level: "medium",
    disclaimer: "Property listings and real estate information in this application are provided by the creator. Mougle does not verify property details, ownership, or legality. Users should conduct independent verification before making property-related decisions.",
    regulatoryTags: ["RERA", "DPDP"],
  },
  "ai-automation": {
    level: "high",
    disclaimer: "This application uses artificial intelligence which may produce inaccurate, biased, or inappropriate outputs. AI-generated content should not be relied upon for critical decisions without human review. The creator is responsible for AI behavior, training data, and output quality. Mougle provides AI infrastructure only.",
    regulatoryTags: ["AI Act", "DPDP", "IT Act"],
  },
  social: {
    level: "medium",
    disclaimer: "This social application is operated by an independent creator who is responsible for content moderation, user safety, and data handling. Users should exercise caution when sharing personal information. Mougle provides technology infrastructure only.",
    regulatoryTags: ["IT Act", "DPDP", "COPPA"],
  },
  general: {
    level: "low",
    disclaimer: "This application is published and operated by an independent creator on Mougle Labs. Mougle provides the technology infrastructure only and does not operate, endorse, or assume responsibility for this application's functionality, content, or data handling.",
    regulatoryTags: ["DPDP"],
  },
};

const REPORT_CATEGORIES = [
  "misleading_content",
  "privacy_violation",
  "harmful_content",
  "copyright_infringement",
  "scam_fraud",
  "ai_misuse",
  "inappropriate_content",
  "broken_functionality",
  "data_harvesting",
  "other",
];

const REPORT_CATEGORY_LABELS: Record<string, string> = {
  misleading_content: "Misleading or False Content",
  privacy_violation: "Privacy Violation",
  harmful_content: "Harmful or Dangerous Content",
  copyright_infringement: "Copyright Infringement",
  scam_fraud: "Scam or Fraud",
  ai_misuse: "AI Misuse or Abuse",
  inappropriate_content: "Inappropriate Content",
  broken_functionality: "Broken or Non-functional",
  data_harvesting: "Unauthorized Data Collection",
  other: "Other Concern",
};

const AI_POLICY_RULES = [
  { id: "no_medical_diagnosis", pattern: /diagnos(e|is|ing)|prescription|dosage|medication\s+for/i, category: "healthcare", severity: "critical" as const },
  { id: "no_legal_advice", pattern: /legal\s+advice|you\s+should\s+sue|file\s+a\s+lawsuit/i, category: "legal", severity: "high" as const },
  { id: "no_financial_advice", pattern: /invest\s+in|guaranteed\s+returns|buy\s+this\s+stock/i, category: "finance", severity: "high" as const },
  { id: "no_impersonation", pattern: /i\s+am\s+a\s+(doctor|lawyer|financial\s+advisor)/i, category: "impersonation", severity: "critical" as const },
  { id: "no_harmful_instructions", pattern: /how\s+to\s+(hack|exploit|steal|harm|attack)/i, category: "harmful", severity: "critical" as const },
  { id: "no_personal_data_collection", pattern: /(social\s+security|ssn|aadhaar|pan\s+card)\s+number/i, category: "privacy", severity: "critical" as const },
];

const DAILY_LIMITS = {
  free: { apps: 2, builds: 5 },
  pro: { apps: 10, builds: 25 },
  creator: { apps: 25, builds: 50 },
};

class LegalSafetyService {

  async generateRiskDisclaimer(appId: string, industry: string, category?: string) {
    const riskKey = industry.toLowerCase().replace(/\s+/g, "-");
    const riskConfig = RISK_CATEGORIES[riskKey] || RISK_CATEGORIES["general"];

    const existing = await db.select().from(appRiskDisclaimers)
      .where(eq(appRiskDisclaimers.appId, appId)).limit(1);

    if (existing.length > 0) {
      await db.update(appRiskDisclaimers).set({
        riskCategory: riskKey,
        riskLevel: riskConfig.level,
        disclaimerText: riskConfig.disclaimer,
        regulatoryTags: riskConfig.regulatoryTags,
      }).where(eq(appRiskDisclaimers.id, existing[0].id));
      const [updated] = await db.select().from(appRiskDisclaimers)
        .where(eq(appRiskDisclaimers.id, existing[0].id));
      return updated;
    }

    const [disclaimer] = await db.insert(appRiskDisclaimers).values({
      appId,
      riskCategory: riskKey,
      riskLevel: riskConfig.level,
      disclaimerText: riskConfig.disclaimer,
      regulatoryTags: riskConfig.regulatoryTags,
      autoGenerated: true,
    }).returning();
    return disclaimer;
  }

  async getAppDisclaimer(appId: string) {
    const [disclaimer] = await db.select().from(appRiskDisclaimers)
      .where(eq(appRiskDisclaimers.appId, appId)).limit(1);

    if (disclaimer) return disclaimer;

    const [app] = await db.select().from(labsApps).where(eq(labsApps.id, appId)).limit(1);
    if (!app) return null;

    return this.generateRiskDisclaimer(appId, app.industry, app.category);
  }

  async submitReport(data: {
    appId: string;
    reporterId: string;
    reason: string;
    category: string;
    description?: string;
    evidence?: string;
  }) {
    if (!REPORT_CATEGORIES.includes(data.category)) {
      throw new Error("Invalid report category");
    }
    const [report] = await db.insert(appModerationReports).values({
      ...data,
      status: "pending",
    }).returning();
    return report;
  }

  async getReportsForApp(appId: string) {
    return db.select().from(appModerationReports)
      .where(eq(appModerationReports.appId, appId))
      .orderBy(desc(appModerationReports.createdAt));
  }

  async getAllPendingReports() {
    return db.select().from(appModerationReports)
      .where(eq(appModerationReports.status, "pending"))
      .orderBy(desc(appModerationReports.createdAt));
  }

  async getAllReports(status?: string) {
    if (status) {
      return db.select().from(appModerationReports)
        .where(eq(appModerationReports.status, status))
        .orderBy(desc(appModerationReports.createdAt));
    }
    return db.select().from(appModerationReports)
      .orderBy(desc(appModerationReports.createdAt));
  }

  async resolveReport(reportId: string, moderatorId: string, action: string, notes?: string) {
    await db.update(appModerationReports).set({
      status: "resolved",
      moderatorId,
      actionTaken: action,
      moderatorNotes: notes || null,
      resolvedAt: new Date(),
    }).where(eq(appModerationReports.id, reportId));

    const [updated] = await db.select().from(appModerationReports)
      .where(eq(appModerationReports.id, reportId));

    if (action === "app_suspended" && updated) {
      await db.update(labsApps).set({ status: "suspended" })
        .where(eq(labsApps.id, updated.appId));
    }

    return updated;
  }

  async dismissReport(reportId: string, moderatorId: string, notes?: string) {
    await db.update(appModerationReports).set({
      status: "dismissed",
      moderatorId,
      actionTaken: "dismissed",
      moderatorNotes: notes || null,
      resolvedAt: new Date(),
    }).where(eq(appModerationReports.id, reportId));

    const [updated] = await db.select().from(appModerationReports)
      .where(eq(appModerationReports.id, reportId));
    return updated;
  }

  checkAiContent(content: string, appId?: string, userId?: string): {
    passed: boolean;
    violations: Array<{ ruleId: string; category: string; severity: string }>;
  } {
    const violations: Array<{ ruleId: string; category: string; severity: string }> = [];

    for (const rule of AI_POLICY_RULES) {
      if (rule.pattern.test(content)) {
        violations.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
        });
      }
    }

    if (violations.length > 0 && (appId || userId)) {
      for (const v of violations) {
        db.insert(aiUsageViolations).values({
          appId: appId || null,
          userId: userId || null,
          violationType: v.ruleId,
          severity: v.severity,
          description: `AI policy violation: ${v.category} (${v.ruleId})`,
          outputContent: content.substring(0, 500),
          actionTaken: v.severity === "critical" ? "blocked" : "warned",
        }).catch(() => {});
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  async getAiViolations(appId?: string, limit = 50) {
    if (appId) {
      return db.select().from(aiUsageViolations)
        .where(eq(aiUsageViolations.appId, appId))
        .orderBy(desc(aiUsageViolations.createdAt))
        .limit(limit);
    }
    return db.select().from(aiUsageViolations)
      .orderBy(desc(aiUsageViolations.createdAt))
      .limit(limit);
  }

  async checkCreationLimit(userId: string, tier: string = "free"): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
    used: number;
  }> {
    const today = new Date().toISOString().split("T")[0];
    const limits = DAILY_LIMITS[tier as keyof typeof DAILY_LIMITS] || DAILY_LIMITS.free;

    const [existing] = await db.select().from(dailyCreationLimits)
      .where(and(
        eq(dailyCreationLimits.userId, userId),
        eq(dailyCreationLimits.date, today)
      )).limit(1);

    const used = existing?.appsCreated || 0;
    const remaining = Math.max(0, limits.apps - used);

    return {
      allowed: used < limits.apps,
      remaining,
      limit: limits.apps,
      used,
    };
  }

  async incrementCreationCount(userId: string, type: "app" | "build" = "app") {
    const today = new Date().toISOString().split("T")[0];

    const [existing] = await db.select().from(dailyCreationLimits)
      .where(and(
        eq(dailyCreationLimits.userId, userId),
        eq(dailyCreationLimits.date, today)
      )).limit(1);

    if (existing) {
      const updates: any = { updatedAt: new Date() };
      if (type === "app") updates.appsCreated = (existing.appsCreated || 0) + 1;
      else updates.buildsStarted = (existing.buildsStarted || 0) + 1;

      await db.update(dailyCreationLimits).set(updates)
        .where(eq(dailyCreationLimits.id, existing.id));
    } else {
      await db.insert(dailyCreationLimits).values({
        userId,
        date: today,
        appsCreated: type === "app" ? 1 : 0,
        buildsStarted: type === "build" ? 1 : 0,
      });
    }
  }

  async canPublishApp(userId: string, appId: string): Promise<{
    allowed: boolean;
    checks: Array<{ name: string; passed: boolean; reason?: string }>;
  }> {
    const checks: Array<{ name: string; passed: boolean; reason?: string }> = [];

    const [profile] = await db.select().from(creatorPublisherProfiles)
      .where(eq(creatorPublisherProfiles.userId, userId)).limit(1);

    checks.push({
      name: "Publisher Profile",
      passed: !!profile?.publisherName && !!profile?.supportEmail && !!profile?.address,
      reason: !profile ? "No publisher profile found" : (!profile.publisherName || !profile.supportEmail || !profile.address) ? "Incomplete profile" : undefined,
    });

    checks.push({
      name: "Agreement Signed",
      passed: !!profile?.agreementVersion,
      reason: !profile?.agreementVersion ? "Publisher agreement not accepted" : undefined,
    });

    checks.push({
      name: "Account Active",
      passed: profile?.isActive !== false,
      reason: profile?.isActive === false ? "Account suspended" : undefined,
    });

    const pendingReports = await db.select({ cnt: count() }).from(appModerationReports)
      .where(and(
        eq(appModerationReports.appId, appId),
        eq(appModerationReports.status, "pending")
      ));
    const reportCount = pendingReports[0]?.cnt || 0;
    checks.push({
      name: "No Pending Reports",
      passed: reportCount === 0,
      reason: reportCount > 0 ? `${reportCount} unresolved reports against this app` : undefined,
    });

    return {
      allowed: checks.every(c => c.passed),
      checks,
    };
  }

  async getModerationStats() {
    const [pending] = await db.select({ cnt: count() }).from(appModerationReports)
      .where(eq(appModerationReports.status, "pending"));
    const [resolved] = await db.select({ cnt: count() }).from(appModerationReports)
      .where(eq(appModerationReports.status, "resolved"));
    const [dismissed] = await db.select({ cnt: count() }).from(appModerationReports)
      .where(eq(appModerationReports.status, "dismissed"));
    const [totalViolations] = await db.select({ cnt: count() }).from(aiUsageViolations);
    const [criticalViolations] = await db.select({ cnt: count() }).from(aiUsageViolations)
      .where(eq(aiUsageViolations.severity, "critical"));
    const [totalDisclaimers] = await db.select({ cnt: count() }).from(appRiskDisclaimers);
    const [verifiedPublishers] = await db.select({ cnt: count() }).from(creatorPublisherProfiles)
      .where(eq(creatorPublisherProfiles.isActive, true));

    return {
      reports: {
        pending: pending?.cnt || 0,
        resolved: resolved?.cnt || 0,
        dismissed: dismissed?.cnt || 0,
        total: (pending?.cnt || 0) + (resolved?.cnt || 0) + (dismissed?.cnt || 0),
      },
      violations: {
        total: totalViolations?.cnt || 0,
        critical: criticalViolations?.cnt || 0,
      },
      disclaimers: totalDisclaimers?.cnt || 0,
      verifiedPublishers: verifiedPublishers?.cnt || 0,
    };
  }

  getRiskCategories() {
    return Object.entries(RISK_CATEGORIES).map(([key, config]) => ({
      id: key,
      level: config.level,
      regulatoryTags: config.regulatoryTags,
      disclaimerPreview: config.disclaimer.substring(0, 100) + "...",
    }));
  }

  getReportCategories() {
    return REPORT_CATEGORIES.map(cat => ({
      id: cat,
      label: REPORT_CATEGORY_LABELS[cat] || cat,
    }));
  }

  getAiPolicyRules() {
    return AI_POLICY_RULES.map(r => ({
      id: r.id,
      category: r.category,
      severity: r.severity,
    }));
  }

  getDailyLimits() {
    return DAILY_LIMITS;
  }
}

export const legalSafetyService = new LegalSafetyService();
