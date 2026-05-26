import OpenAI from "openai";
import { db } from "../db";
import {
  complianceRules, complianceAuditLog, complianceNotifications, ecoEfficiencyMetrics,
  type ComplianceRule, type InsertComplianceRule,
} from "@shared/schema";
import { eq, desc, sql, gte, count, and } from "drizzle-orm";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY must be set in the environment.");
  }

  openaiClient = new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
  return openaiClient;
}

const LEGAL_CATEGORIES = [
  "data_privacy", "ai_regulation", "content_moderation", "digital_services",
  "consumer_protection", "tax_compliance", "intellectual_property", "accessibility",
];

const KNOWN_JURISDICTIONS = [
  { code: "IN", name: "India", region: "Asia" },
  { code: "US", name: "United States", region: "North America" },
  { code: "EU", name: "European Union", region: "Europe" },
  { code: "GB", name: "United Kingdom", region: "Europe" },
  { code: "SG", name: "Singapore", region: "Asia" },
  { code: "AU", name: "Australia", region: "Oceania" },
  { code: "CA", name: "Canada", region: "North America" },
  { code: "JP", name: "Japan", region: "Asia" },
  { code: "BR", name: "Brazil", region: "South America" },
  { code: "DE", name: "Germany", region: "Europe" },
];

const MODULE_MAP: Record<string, string[]> = {
  data_privacy: ["personal-agent", "user-data", "analytics", "ai-memory"],
  ai_regulation: ["agent-system", "ai-content", "personal-agent", "labs"],
  content_moderation: ["posts", "debates", "news", "flywheel"],
  digital_services: ["billing", "marketplace", "app-export"],
  consumer_protection: ["billing", "pricing-engine", "subscriptions"],
  tax_compliance: ["billing", "razorpay", "creator-earnings"],
  intellectual_property: ["labs", "app-export", "flywheel", "ai-content"],
  accessibility: ["frontend", "public-pages"],
};

class GCISService {
  private lastScanTimestamp = 0;
  private ecoCache: { timestamp: number; data: any } = { timestamp: 0, data: null };

  async scanLegalUpdates(countryCode?: string) {
    const countries = countryCode
      ? KNOWN_JURISDICTIONS.filter(j => j.code === countryCode)
      : KNOWN_JURISDICTIONS;

    const results: Array<{
      country: string;
      countryCode: string;
      updates: Array<{ category: string; title: string; description: string; severity: string; affectedModules: string[] }>;
    }> = [];

    for (const country of countries.slice(0, 3)) {
      try {
        const response = await getOpenAI().chat.completions.create({
          model: "gpt-5.5",
          max_completion_tokens: 2048,
          messages: [
            {
              role: "system",
              content: `You are a legal compliance analyst for a hybrid intelligence platform (Mougle) that operates AI agents, user-generated content, creator marketplace, and billing systems. Analyze current regulatory landscape for the given country.`,
            },
            {
              role: "user",
              content: `For ${country.name} (${country.code}), identify the top 2-3 most important current regulatory requirements or recent policy changes that affect an AI-powered content and marketplace platform. For each, provide:
- category (one of: ${LEGAL_CATEGORIES.join(", ")})
- title (short regulatory name)
- description (1-2 sentence summary)
- severity (critical, high, medium, low)

Respond in JSON: { "updates": [{ "category": "...", "title": "...", "description": "...", "severity": "..." }] }`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const parsed = JSON.parse(response.choices[0]?.message?.content || '{"updates":[]}');
        const updates = (parsed.updates || []).map((u: any) => ({
          ...u,
          affectedModules: MODULE_MAP[u.category] || [],
        }));

        results.push({ country: country.name, countryCode: country.code, updates });
      } catch (err) {
        results.push({ country: country.name, countryCode: country.code, updates: [] });
      }
    }

    this.lastScanTimestamp = Date.now();

    await this.logAudit("legal_scan", undefined, countryCode, "system", {
      countriesScanned: countries.length,
      updatesFound: results.reduce((sum, r) => sum + r.updates.length, 0),
    });

    return { scannedAt: new Date().toISOString(), results };
  }

  async ingestRule(data: {
    countryCode: string;
    countryName: string;
    category: string;
    title: string;
    description: string;
    severity: string;
    sourceUrl?: string;
    effectiveDate?: string;
  }) {
    const ruleKey = `${data.countryCode}_${data.category}_${data.title.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`;

    let aiSummary = "";
    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        max_completion_tokens: 1024,
        messages: [
          {
            role: "system",
            content: "You summarize legal/regulatory changes for a tech platform founder. Be concise and actionable.",
          },
          {
            role: "user",
            content: `Summarize this regulatory requirement for a hybrid AI platform operating in ${data.countryName}:
Title: ${data.title}
Description: ${data.description}
Category: ${data.category}

Provide: 1) What it means for the platform (1 sentence) 2) What action is needed (1 sentence) 3) Risk if non-compliant (1 sentence)`,
          },
        ],
      });
      aiSummary = response.choices[0]?.message?.content || "";
    } catch {}

    const affectedModules = MODULE_MAP[data.category] || [];
    const featureFlags: Record<string, boolean> = {};
    for (const mod of affectedModules) {
      featureFlags[`compliance_${data.countryCode.toLowerCase()}_${mod.replace(/-/g, "_")}`] = true;
    }

    const [rule] = await db.insert(complianceRules).values({
      countryCode: data.countryCode,
      countryName: data.countryName,
      category: data.category,
      ruleKey,
      title: data.title,
      description: data.description,
      sourceUrl: data.sourceUrl || null,
      aiSummary,
      affectedModules,
      featureFlags,
      status: "pending_approval",
      severity: data.severity,
      effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null,
    }).returning();

    await this.createNotification(
      "new_rule",
      `New Compliance Rule: ${data.title}`,
      `${data.countryName} (${data.category}): ${data.description}`,
      data.countryCode,
      rule.id,
      "founder"
    );

    await this.logAudit("rule_ingested", rule.id, data.countryCode, "system", {
      title: data.title,
      category: data.category,
      severity: data.severity,
    });

    return rule;
  }

  async approveRule(ruleId: string, approvedBy: string) {
    const [rule] = await db.update(complianceRules)
      .set({ status: "active", approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(complianceRules.id, ruleId))
      .returning();

    if (!rule) throw new Error("Rule not found");

    await this.createNotification(
      "rule_approved",
      `Compliance Rule Activated: ${rule.title}`,
      `${rule.countryName} rule is now active. Feature flags applied to: ${(rule.affectedModules || []).join(", ")}`,
      rule.countryCode,
      rule.id,
      "all"
    );

    await this.logAudit("rule_approved", ruleId, rule.countryCode, approvedBy, {
      title: rule.title,
      featureFlags: rule.featureFlags,
    });

    return rule;
  }

  async rejectRule(ruleId: string, rejectedBy: string, reason: string) {
    const [rule] = await db.update(complianceRules)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(complianceRules.id, ruleId))
      .returning();

    if (!rule) throw new Error("Rule not found");

    await this.logAudit("rule_rejected", ruleId, rule.countryCode, rejectedBy, { reason, title: rule.title });
    return rule;
  }

  async getRules(filters?: { status?: string; countryCode?: string; category?: string }) {
    let query = db.select().from(complianceRules).orderBy(desc(complianceRules.createdAt));

    const conditions = [];
    if (filters?.status) conditions.push(eq(complianceRules.status, filters.status));
    if (filters?.countryCode) conditions.push(eq(complianceRules.countryCode, filters.countryCode));
    if (filters?.category) conditions.push(eq(complianceRules.category, filters.category));

    if (conditions.length > 0) {
      return db.select().from(complianceRules)
        .where(and(...conditions))
        .orderBy(desc(complianceRules.createdAt));
    }

    return query;
  }

  async getActiveFeatureFlags(countryCode?: string) {
    const conditions = [eq(complianceRules.status, "active")];
    if (countryCode) conditions.push(eq(complianceRules.countryCode, countryCode));

    const rules = await db.select().from(complianceRules).where(and(...conditions));

    const flags: Record<string, boolean> = {};
    for (const rule of rules) {
      if (rule.featureFlags) {
        Object.assign(flags, rule.featureFlags);
      }
    }

    return { countryCode: countryCode || "global", flags, rulesApplied: rules.length };
  }

  async getAuditLog(limit = 50) {
    return db.select().from(complianceAuditLog)
      .orderBy(desc(complianceAuditLog.createdAt))
      .limit(limit);
  }

  async getNotifications(unreadOnly = false) {
    if (unreadOnly) {
      return db.select().from(complianceNotifications)
        .where(eq(complianceNotifications.read, false))
        .orderBy(desc(complianceNotifications.createdAt));
    }
    return db.select().from(complianceNotifications)
      .orderBy(desc(complianceNotifications.createdAt))
      .limit(50);
  }

  async markNotificationRead(id: string) {
    return db.update(complianceNotifications)
      .set({ read: true })
      .where(eq(complianceNotifications.id, id));
  }

  async getDashboard() {
    const [totalRules] = await db.select({ cnt: count() }).from(complianceRules);
    const [activeRules] = await db.select({ cnt: count() }).from(complianceRules).where(eq(complianceRules.status, "active"));
    const [pendingRules] = await db.select({ cnt: count() }).from(complianceRules).where(eq(complianceRules.status, "pending_approval"));
    const [unreadNotifs] = await db.select({ cnt: count() }).from(complianceNotifications).where(eq(complianceNotifications.read, false));

    const countryCoverage = await db.select({
      countryCode: complianceRules.countryCode,
      countryName: complianceRules.countryName,
      cnt: count(),
    }).from(complianceRules)
      .where(eq(complianceRules.status, "active"))
      .groupBy(complianceRules.countryCode, complianceRules.countryName);

    const categoryCoverage = await db.select({
      category: complianceRules.category,
      cnt: count(),
    }).from(complianceRules)
      .where(eq(complianceRules.status, "active"))
      .groupBy(complianceRules.category);

    const recentAudits = await db.select().from(complianceAuditLog)
      .orderBy(desc(complianceAuditLog.createdAt)).limit(10);

    const eco = await this.getEcoEfficiency();

    return {
      stats: {
        totalRules: totalRules.cnt,
        activeRules: activeRules.cnt,
        pendingApproval: pendingRules.cnt,
        unreadNotifications: unreadNotifs.cnt,
        countriesCovered: countryCoverage.length,
        lastScan: this.lastScanTimestamp ? new Date(this.lastScanTimestamp).toISOString() : null,
      },
      countryCoverage,
      categoryCoverage,
      recentAudits,
      ecoEfficiency: eco,
      jurisdictions: KNOWN_JURISDICTIONS,
      categories: LEGAL_CATEGORIES,
    };
  }

  async getEcoEfficiency() {
    if (this.ecoCache.data && Date.now() - this.ecoCache.timestamp < 5 * 60 * 1000) {
      return this.ecoCache.data;
    }

    const aiRequestsToday = await db.select({ cnt: count() })
      .from(complianceAuditLog)
      .where(gte(complianceAuditLog.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));

    const totalScans = aiRequestsToday[0].cnt;
    const estimatedTokensPerScan = 2000;
    const estimatedCostPerToken = 0.000003;
    const estimatedCost = totalScans * estimatedTokensPerScan * estimatedCostPerToken;
    const estimatedCO2PerToken = 0.0000004;
    const carbonFootprint = totalScans * estimatedTokensPerScan * estimatedCO2PerToken;

    const cachedScansAvoided = Math.max(0, totalScans * 2);
    const savingsFromCaching = cachedScansAvoided * estimatedTokensPerScan * estimatedCostPerToken;

    const recommendations = [];
    if (totalScans > 20) {
      recommendations.push("Consider reducing scan frequency — batch country scans weekly instead of daily");
    }
    if (carbonFootprint > 0.01) {
      recommendations.push("Carbon footprint elevated — use lighter models for routine compliance checks");
    }
    recommendations.push("Use cached compliance data for repeated country lookups to reduce compute waste");

    const eco = {
      aiRequestsToday: totalScans,
      estimatedCostUsd: Math.round(estimatedCost * 1000) / 1000,
      estimatedCarbonKg: Math.round(carbonFootprint * 10000) / 10000,
      cachedRequestsAvoided: cachedScansAvoided,
      savingsFromCachingUsd: Math.round(savingsFromCaching * 1000) / 1000,
      efficiencyScore: Math.min(100, Math.round((1 - (totalScans / Math.max(totalScans + cachedScansAvoided, 1))) * 100 + 50)),
      recommendations,
    };

    this.ecoCache = { timestamp: Date.now(), data: eco };

    await db.insert(ecoEfficiencyMetrics).values({
      metricType: "daily_compliance_compute",
      value: estimatedCost,
      unit: "usd",
      savings: savingsFromCaching,
      recommendation: recommendations[0] || null,
    });

    return eco;
  }

  async autoIngestFromScan(countryCode?: string) {
    const scan = await this.scanLegalUpdates(countryCode);
    const ingested: ComplianceRule[] = [];

    for (const result of scan.results) {
      for (const update of result.updates) {
        try {
          const rule = await this.ingestRule({
            countryCode: result.countryCode,
            countryName: result.country,
            category: update.category,
            title: update.title,
            description: update.description,
            severity: update.severity,
          });
          ingested.push(rule);
        } catch {}
      }
    }

    return { scan, ingested: ingested.length, rules: ingested };
  }

  private async createNotification(
    type: string, title: string, message: string,
    countryCode: string | null, ruleId: string | null, targetAudience: string
  ) {
    await db.insert(complianceNotifications).values({
      type,
      title,
      message,
      countryCode,
      ruleId,
      targetAudience,
    });
  }

  private async logAudit(
    action: string, ruleId: string | undefined,
    countryCode: string | undefined, performedBy: string,
    details: Record<string, any>
  ) {
    await db.insert(complianceAuditLog).values({
      action,
      ruleId: ruleId || null,
      countryCode: countryCode || null,
      performedBy,
      details,
    });
  }
}

export const gcisService = new GCISService();
