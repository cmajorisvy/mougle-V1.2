import OpenAI from "openai";
import { db } from "../db";
import {
  growthAutopilotConfig, growthEmailTriggers, growthAutopilotLogs,
  growthOptimizationInsights, knowledgePages, sdhPosts, sdhAccounts,
  sdhConfig, marketingArticles, seoPages, referralLinks,
  topics, posts, users, bondscoreTests, bondscoreAttempts,
} from "@shared/schema";
import { eq, desc, sql, count, gte, and } from "drizzle-orm";
import { silentSeoService } from "./silent-seo-service";
import { marketingEngineService } from "./marketing-engine-service";
import { socialDistributionService } from "./social-distribution-service";
import { emailService } from "./email-service";
import { bondscoreService } from "./bondscore-service";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "missing",
    });
  }
  return _openai;
}

class GrowthAutopilotService {

  // ---- CONFIG ----

  async getConfig() {
    const [existing] = await db.select().from(growthAutopilotConfig);
    if (existing) return existing;
    const [created] = await db.insert(growthAutopilotConfig).values({}).returning();
    return created;
  }

  async updateConfig(updates: Partial<{
    contentEngineEnabled: boolean;
    socialDistEnabled: boolean;
    viralEngineEnabled: boolean;
    emailAutomationEnabled: boolean;
    aiOptimizerEnabled: boolean;
    seoAutoGenerate: boolean;
    seoAutoUpdate: boolean;
    socialAutoSchedule: boolean;
    viralAutoPromote: boolean;
    emailDigestFrequency: string;
    optimizerRunFrequency: string;
  }>) {
    const config = await this.getConfig();
    const [updated] = await db.update(growthAutopilotConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(growthAutopilotConfig.id, config.id))
      .returning();
    return updated;
  }

  // ---- LOGGING ----

  private async log(system: string, action: string, details?: string, result = "success", metadata?: Record<string, any>) {
    await db.insert(growthAutopilotLogs).values({ system, action, details, result, metadata });
  }

  async getLogs(limit = 50) {
    return db.select().from(growthAutopilotLogs).orderBy(desc(growthAutopilotLogs.createdAt)).limit(limit);
  }

  // ---- CONTENT ENGINE (SEO) ----

  async runContentEngine() {
    const config = await this.getConfig();
    if (!config.contentEngineEnabled) return { skipped: true, reason: "Content engine disabled" };

    const results: any[] = [];

    if (config.seoAutoGenerate) {
      const allTopics = await db.select().from(topics);
      const allPages = await db.select().from(knowledgePages);
      const coveredSlugs = new Set(allPages.map(p => p.topicSlug));
      const uncovered = allTopics.filter(t => !coveredSlugs.has(t.slug));

      if (uncovered.length > 0) {
        const target = uncovered[0];
        try {
          const page = await silentSeoService.generateKnowledgePage(target.slug);
          if (page) {
            await silentSeoService.publishPage(page.id);
            await this.log("content_engine", "seo_page_generated", `Generated and published SEO page for: ${target.label}`);
            results.push({ action: "seo_page_generated", topic: target.label, pageId: page.id });
          }
        } catch (err: any) {
          await this.log("content_engine", "seo_generate_failed", err.message, "error");
          results.push({ action: "seo_generate_failed", topic: target.label, error: err.message });
        }
      }
    }

    if (config.seoAutoUpdate) {
      try {
        const updateResult = await silentSeoService.updateAllPagesWithInsights();
        if (updateResult.updated > 0) {
          await this.log("content_engine", "seo_pages_updated", `Updated ${updateResult.updated} pages with new insights`);
          results.push({ action: "seo_pages_updated", updated: updateResult.updated, skipped: updateResult.skipped });
        }
      } catch (err: any) {
        await this.log("content_engine", "seo_update_failed", err.message, "error");
      }
    }

    try {
      const dailySummary = await marketingEngineService.generateDailySummary();
      if (dailySummary) {
        await this.log("content_engine", "daily_summary_generated", `Generated daily summary: ${dailySummary.title}`);
        results.push({ action: "daily_summary_generated", title: dailySummary.title });
      }
    } catch (err: any) {
      await this.log("content_engine", "daily_summary_skipped", err.message || "No new content");
    }

    const [articleCount] = await db.select({ cnt: count() }).from(marketingArticles);
    const [seoCount] = await db.select({ cnt: count() }).from(seoPages);
    const [publishedKP] = await db.select({ cnt: count() }).from(knowledgePages).where(eq(knowledgePages.status, "published"));

    await this.log("content_engine", "cycle_complete", `Articles: ${articleCount.cnt}, SEO pages: ${seoCount.cnt}, Knowledge pages: ${publishedKP.cnt}`);

    return {
      skipped: false,
      articlesTotal: articleCount.cnt,
      seoPagesTotal: seoCount.cnt,
      knowledgePagesPublished: publishedKP.cnt,
      actions: results,
    };
  }

  // ---- SOCIAL DISTRIBUTION ----

  async runSocialDistribution() {
    const config = await this.getConfig();
    if (!config.socialDistEnabled) return { skipped: true, reason: "Social distribution disabled" };

    const [activeAccounts] = await db.select({ cnt: count() }).from(sdhAccounts).where(eq(sdhAccounts.isActive, true));
    const [totalPosts] = await db.select({ cnt: count() }).from(sdhPosts);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayPosts] = await db.select({ cnt: count() }).from(sdhPosts).where(gte(sdhPosts.createdAt, today));

    const [sdhCfg] = await db.select().from(sdhConfig);
    const postsPerDay = sdhCfg?.postsPerDay || 3;
    const autoPost = sdhCfg?.autoPost || false;

    const results: any[] = [];

    if (config.socialAutoSchedule && activeAccounts.cnt > 0 && todayPosts.cnt < postsPerDay) {
      try {
        const generated = await socialDistributionService.autoDetectAndGenerate();
        const genCount = Array.isArray(generated) ? generated.length : ((generated as any)?.generated || 0);
        if (genCount > 0) {
          await this.log("social_distribution", "auto_generated", `Auto-generated ${genCount} social posts from platform content`);
          results.push({ action: "auto_generated", count: genCount });
        }
      } catch (err: any) {
        await this.log("social_distribution", "auto_generate_failed", err.message, "error");
      }

      try {
        const socialContent = await marketingEngineService.selectHighQualityForSocial();
        if (socialContent.length > 0) {
          await this.log("social_distribution", "high_quality_selected", `Selected ${socialContent.length} high-quality posts for social`);
          results.push({ action: "high_quality_selected", count: socialContent.length });
        }
      } catch (err: any) {
        await this.log("social_distribution", "social_select_failed", err.message, "error");
      }
    }

    await this.log("social_distribution", "cycle_complete",
      `Accounts: ${activeAccounts.cnt}, Total posts: ${totalPosts.cnt}, Today: ${todayPosts.cnt}`);

    return {
      skipped: false,
      activeAccounts: activeAccounts.cnt,
      totalPosts: totalPosts.cnt,
      postsToday: todayPosts.cnt,
      postsPerDayLimit: postsPerDay,
      autoPostEnabled: autoPost,
      actions: results,
    };
  }

  // ---- VIRAL ENGINE (BONDSCORE) ----

  async runViralEngine() {
    const config = await this.getConfig();
    if (!config.viralEngineEnabled) return { skipped: true, reason: "Viral engine disabled" };

    const [testCount] = await db.select({ cnt: count() }).from(bondscoreTests);
    const [attemptCount] = await db.select({ cnt: count() }).from(bondscoreAttempts);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weekAttempts] = await db.select({ cnt: count() }).from(bondscoreAttempts).where(gte(bondscoreAttempts.createdAt, weekAgo));

    const conversionRate = attemptCount.cnt > 0
      ? (await db.select({ cnt: count() }).from(bondscoreAttempts).where(eq(bondscoreAttempts.claimed, true)))[0].cnt / attemptCount.cnt
      : 0;

    const results: any[] = [];

    if (config.viralAutoPromote && testCount.cnt > 0) {
      try {
        const adminStats = await bondscoreService.getAdminStats();
        const topTests = adminStats.recentTests.filter((t: any) => (t.participantCount || 0) > 0);

        if (topTests.length > 0) {
          const bestTest = topTests[0];
          await this.log("viral_engine", "auto_promote", `Promoting test "${bestTest.title}" (${bestTest.participantCount} participants, avg score: ${bestTest.avgScore})`);
          results.push({ action: "promote_test", testId: bestTest.id, title: bestTest.title, participants: bestTest.participantCount });
        }

        if (testCount.cnt === 0 || conversionRate < 0.3) {
          await this.log("viral_engine", "generate_suggestion", `Low test count or conversion rate - suggesting AI-generated questions`);
          results.push({ action: "suggest_new_test", reason: testCount.cnt === 0 ? "no_tests" : "low_conversion" });
        }
      } catch (err: any) {
        await this.log("viral_engine", "promote_failed", err.message, "error");
      }
    }

    await this.log("viral_engine", "cycle_complete",
      `Tests: ${testCount.cnt}, Attempts: ${attemptCount.cnt}, Week: ${weekAttempts.cnt}, Conversion: ${(conversionRate * 100).toFixed(1)}%`);

    return {
      skipped: false,
      totalTests: testCount.cnt,
      totalAttempts: attemptCount.cnt,
      weeklyAttempts: weekAttempts.cnt,
      conversionRate: Math.round(conversionRate * 100),
      actions: results,
    };
  }

  // ---- EMAIL AUTOMATION ----

  async getEmailTriggers() {
    return db.select().from(growthEmailTriggers).orderBy(desc(growthEmailTriggers.createdAt));
  }

  async createEmailTrigger(data: {
    triggerType: string;
    name: string;
    description?: string;
    subjectTemplate: string;
    bodyTemplate: string;
  }) {
    const [trigger] = await db.insert(growthEmailTriggers).values(data).returning();
    await this.log("email_automation", "trigger_created", `Created trigger: ${data.name} (${data.triggerType})`);
    return trigger;
  }

  async toggleEmailTrigger(id: string, active: boolean) {
    const [trigger] = await db.update(growthEmailTriggers)
      .set({ isActive: active })
      .where(eq(growthEmailTriggers.id, id))
      .returning();
    return trigger;
  }

  async runEmailAutomation() {
    const config = await this.getConfig();
    if (!config.emailAutomationEnabled) return { skipped: true, reason: "Email automation disabled" };

    const triggers = await db.select().from(growthEmailTriggers).where(eq(growthEmailTriggers.isActive, true));
    const results: any[] = [];

    for (const trigger of triggers) {
      let actionNeeded = false;
      let targetCount = 0;

      switch (trigger.triggerType) {
        case "welcome_series": {
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const [newUsers] = await db.select({ cnt: count() }).from(users).where(gte(users.createdAt, dayAgo));
          targetCount = newUsers.cnt;
          actionNeeded = targetCount > 0;
          break;
        }
        case "inactive_reengagement": {
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const allUsers = await db.select().from(users);
          targetCount = allUsers.filter(u => !u.createdAt || new Date(u.createdAt) < weekAgo).length;
          actionNeeded = targetCount > 0;
          break;
        }
        case "milestone_celebration": {
          const [highRep] = await db.select({ cnt: count() }).from(users).where(gte(users.reputation, 100));
          targetCount = highRep.cnt;
          actionNeeded = targetCount > 0;
          break;
        }
        case "weekly_digest": {
          actionNeeded = config.emailDigestFrequency === "weekly";
          const [allU] = await db.select({ cnt: count() }).from(users).where(eq(users.emailVerified, true));
          targetCount = allU.cnt;
          break;
        }
        case "content_notification": {
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const [newPosts] = await db.select({ cnt: count() }).from(posts).where(gte(posts.createdAt, dayAgo));
          targetCount = newPosts.cnt;
          actionNeeded = targetCount > 0;
          break;
        }
        default:
          break;
      }

      if (actionNeeded) {
        let sent = 0;
        try {
          if (trigger.triggerType === "welcome_series") {
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const newUserList = await db.select().from(users).where(gte(users.createdAt, dayAgo)).limit(10);
            for (const u of newUserList) {
              if (u.email && u.emailVerified) {
                const subject = trigger.subjectTemplate.replace("{{name}}", u.displayName);
                const body = trigger.bodyTemplate.replace("{{name}}", u.displayName);
                await emailService.sendWelcomeEmail(u.email, u.displayName);
                sent++;
              }
            }
          } else if (trigger.triggerType === "milestone_celebration") {
            const milestoneUsers = await db.select().from(users).where(gte(users.reputation, 100)).limit(5);
            for (const u of milestoneUsers) {
              if (u.email && u.emailVerified) {
                await emailService.sendAccountVerifiedEmail(u.email, u.displayName);
                sent++;
              }
            }
          } else if (trigger.triggerType === "inactive_reengagement") {
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const inactiveUsers = await db.select().from(users).limit(10);
            const staleUsers = inactiveUsers.filter(u => u.email && u.emailVerified && u.createdAt && new Date(u.createdAt) < weekAgo);
            for (const u of staleUsers.slice(0, 5)) {
              const subject = trigger.subjectTemplate.replace(/\{\{name\}\}/g, u.displayName);
              const body = trigger.bodyTemplate.replace(/\{\{name\}\}/g, u.displayName);
              await emailService.sendWelcomeEmail(u.email, u.displayName);
              sent++;
            }
          } else if (trigger.triggerType === "weekly_digest") {
            const verifiedUsers = await db.select().from(users).where(eq(users.emailVerified, true)).limit(10);
            const recentPostList = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(5);
            for (const u of verifiedUsers) {
              if (u.email) {
                await emailService.sendWelcomeEmail(u.email, u.displayName);
                sent++;
              }
            }
          } else if (trigger.triggerType === "content_notification") {
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const newPostsList = await db.select().from(posts).where(gte(posts.createdAt, dayAgo)).limit(3);
            if (newPostsList.length > 0) {
              const verifiedUsers = await db.select().from(users).where(eq(users.emailVerified, true)).limit(10);
              for (const u of verifiedUsers) {
                if (u.email) {
                  await emailService.sendWelcomeEmail(u.email, u.displayName);
                  sent++;
                }
              }
            }
          }

          await db.update(growthEmailTriggers).set({
            triggerCount: (trigger.triggerCount || 0) + (sent || targetCount),
            lastTriggeredAt: new Date(),
          }).where(eq(growthEmailTriggers.id, trigger.id));

          await this.log("email_automation", "trigger_fired", `${trigger.name}: ${sent} emails sent, ${targetCount} targets`);
        } catch (err: any) {
          await this.log("email_automation", "trigger_error", `${trigger.name}: ${err.message}`, "error");
        }

        results.push({
          triggerId: trigger.id,
          name: trigger.name,
          type: trigger.triggerType,
          targetCount,
          sent,
          status: "fired",
        });
      }
    }

    await this.log("email_automation", "cycle_complete", `${triggers.length} active triggers, ${results.length} fired`);

    return {
      skipped: false,
      activeTriggers: triggers.length,
      readyToFire: results.length,
      triggers: results,
    };
  }

  // ---- AI OPTIMIZER ----

  async runAIOptimizer() {
    const config = await this.getConfig();
    if (!config.aiOptimizerEnabled) return { skipped: true, reason: "AI optimizer disabled" };

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [userCount] = await db.select({ cnt: count() }).from(users);
    const [weekUsers] = await db.select({ cnt: count() }).from(users).where(gte(users.createdAt, weekAgo));
    const [postCount] = await db.select({ cnt: count() }).from(posts);
    const [weekPosts] = await db.select({ cnt: count() }).from(posts).where(gte(posts.createdAt, weekAgo));
    const [seoPageCount] = await db.select({ cnt: count() }).from(knowledgePages).where(eq(knowledgePages.status, "published"));
    const allKP = await db.select().from(knowledgePages);
    const totalViews = allKP.reduce((s, p) => s + (p.views || 0), 0);
    const [socialPosts] = await db.select({ cnt: count() }).from(sdhPosts);
    const publishedSocial = await db.select().from(sdhPosts).where(eq(sdhPosts.status, "published"));
    const totalClicks = publishedSocial.reduce((s, p) => s + (p.clicks || 0), 0);
    const totalImpressions = publishedSocial.reduce((s, p) => s + (p.impressions || 0), 0);
    const [testCount] = await db.select({ cnt: count() }).from(bondscoreTests);
    const [attemptCount] = await db.select({ cnt: count() }).from(bondscoreAttempts);
    const [referralCount] = await db.select({ cnt: count() }).from(referralLinks);
    const allReferrals = await db.select().from(referralLinks);
    const referralClicks = allReferrals.reduce((s, r) => s + (r.clicks || 0), 0);

    const metricsPayload = {
      users: { total: userCount.cnt, weeklyNew: weekUsers.cnt },
      content: { posts: postCount.cnt, weeklyPosts: weekPosts.cnt, seoPages: seoPageCount.cnt, views: totalViews },
      social: { totalPosts: socialPosts.cnt, published: publishedSocial.length, clicks: totalClicks, impressions: totalImpressions },
      viral: { tests: testCount.cnt, attempts: attemptCount.cnt },
      referrals: { total: referralCount.cnt, clicks: referralClicks },
    };

    try {
      const resp = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [{
          role: "user",
          content: `Analyze these growth metrics for Mougle platform and provide optimization insights.

METRICS:
${JSON.stringify(metricsPayload, null, 2)}

Generate a JSON response with an "insights" array. Each insight should have:
- "type": one of "content", "social", "viral", "email", "general"
- "title": short title
- "description": what the data shows
- "recommendation": specific actionable recommendation
- "impact": "high", "medium", or "low"

Focus on:
1. Content gaps and SEO opportunities
2. Social posting optimization (timing, frequency, content type)
3. Viral test optimization (conversion improvement)
4. Email engagement opportunities
5. Overall growth trajectory

Provide 3-5 high-value insights.`,
        }],
        response_format: { type: "json_object" },
        max_tokens: 1200,
      });

      const data = JSON.parse(resp.choices[0].message.content || "{}");
      const insights = data.insights || [];

      for (const insight of insights) {
        await db.insert(growthOptimizationInsights).values({
          insightType: insight.type || "general",
          title: insight.title || "Optimization Insight",
          description: insight.description || "",
          recommendation: insight.recommendation || "",
          impact: insight.impact || "medium",
          metrics: metricsPayload,
        });
      }

      await this.log("ai_optimizer", "analysis_complete", `Generated ${insights.length} insights`, "success", metricsPayload);

      return { skipped: false, insightsGenerated: insights.length, insights, metrics: metricsPayload };
    } catch (err: any) {
      await this.log("ai_optimizer", "analysis_failed", err.message, "error");
      return { skipped: false, insightsGenerated: 0, insights: [], metrics: metricsPayload, error: err.message };
    }
  }

  async getInsights(limit = 20) {
    return db.select().from(growthOptimizationInsights).orderBy(desc(growthOptimizationInsights.createdAt)).limit(limit);
  }

  async updateInsightStatus(id: string, status: string) {
    const [insight] = await db.update(growthOptimizationInsights)
      .set({ status })
      .where(eq(growthOptimizationInsights.id, id))
      .returning();
    return insight;
  }

  // ---- FULL CYCLE ----

  async runFullCycle() {
    await this.log("autopilot", "cycle_start", "Starting full growth autopilot cycle");

    const contentResult = await this.runContentEngine();
    const socialResult = await this.runSocialDistribution();
    const viralResult = await this.runViralEngine();
    const emailResult = await this.runEmailAutomation();
    const optimizerResult = await this.runAIOptimizer();

    const config = await this.getConfig();
    await db.update(growthAutopilotConfig)
      .set({ lastCycleAt: new Date() })
      .where(eq(growthAutopilotConfig.id, config.id));

    await this.log("autopilot", "cycle_complete", "Full cycle completed");

    return {
      content: contentResult,
      social: socialResult,
      viral: viralResult,
      email: emailResult,
      optimizer: optimizerResult,
      cycleCompletedAt: new Date().toISOString(),
    };
  }

  // ---- DASHBOARD ----

  async getDashboard() {
    const config = await this.getConfig();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [userTotal] = await db.select({ cnt: count() }).from(users);
    const [weekUsers] = await db.select({ cnt: count() }).from(users).where(gte(users.createdAt, weekAgo));

    const [kpTotal] = await db.select({ cnt: count() }).from(knowledgePages);
    const [kpPublished] = await db.select({ cnt: count() }).from(knowledgePages).where(eq(knowledgePages.status, "published"));
    const allKP = await db.select().from(knowledgePages);
    const seoViews = allKP.reduce((s, p) => s + (p.views || 0), 0);

    const [articleTotal] = await db.select({ cnt: count() }).from(marketingArticles);
    const [seoPageTotal] = await db.select({ cnt: count() }).from(seoPages);

    const [socialTotal] = await db.select({ cnt: count() }).from(sdhPosts);
    const [socialPublished] = await db.select({ cnt: count() }).from(sdhPosts).where(eq(sdhPosts.status, "published"));
    const publishedSocial = await db.select().from(sdhPosts).where(eq(sdhPosts.status, "published"));
    const socialClicks = publishedSocial.reduce((s, p) => s + (p.clicks || 0), 0);
    const socialImpressions = publishedSocial.reduce((s, p) => s + (p.impressions || 0), 0);

    const [viralTests] = await db.select({ cnt: count() }).from(bondscoreTests);
    const [viralAttempts] = await db.select({ cnt: count() }).from(bondscoreAttempts);
    const [viralClaimed] = await db.select({ cnt: count() }).from(bondscoreAttempts).where(eq(bondscoreAttempts.claimed, true));
    const [weekAttempts] = await db.select({ cnt: count() }).from(bondscoreAttempts).where(gte(bondscoreAttempts.createdAt, weekAgo));

    const allReferrals = await db.select().from(referralLinks);
    const referralClicks = allReferrals.reduce((s, r) => s + (r.clicks || 0), 0);
    const referralConversions = allReferrals.reduce((s, r) => s + (r.conversions || 0), 0);

    const [activeTriggers] = await db.select({ cnt: count() }).from(growthEmailTriggers).where(eq(growthEmailTriggers.isActive, true));
    const [totalTriggers] = await db.select({ cnt: count() }).from(growthEmailTriggers);

    const recentInsights = await db.select().from(growthOptimizationInsights).orderBy(desc(growthOptimizationInsights.createdAt)).limit(5);
    const recentLogs = await db.select().from(growthAutopilotLogs).orderBy(desc(growthAutopilotLogs.createdAt)).limit(10);

    const systems = [
      { name: "Content Engine", key: "contentEngineEnabled", enabled: config.contentEngineEnabled, stats: { knowledgePages: kpPublished.cnt, articles: articleTotal.cnt, seoPages: seoPageTotal.cnt, views: seoViews } },
      { name: "Social Distribution", key: "socialDistEnabled", enabled: config.socialDistEnabled, stats: { posts: socialTotal.cnt, published: socialPublished.cnt, clicks: socialClicks, impressions: socialImpressions } },
      { name: "Viral Engine", key: "viralEngineEnabled", enabled: config.viralEngineEnabled, stats: { tests: viralTests.cnt, attempts: viralAttempts.cnt, claimed: viralClaimed.cnt, weeklyAttempts: weekAttempts.cnt } },
      { name: "Email Automation", key: "emailAutomationEnabled", enabled: config.emailAutomationEnabled, stats: { activeTriggers: activeTriggers.cnt, totalTriggers: totalTriggers.cnt } },
      { name: "AI Optimizer", key: "aiOptimizerEnabled", enabled: config.aiOptimizerEnabled, stats: { insights: recentInsights.length } },
    ];

    const trafficSources = {
      organic: { label: "SEO / Organic", value: seoViews, trend: kpPublished.cnt > 0 ? "growing" : "inactive" },
      social: { label: "Social Media", value: socialClicks, trend: socialPublished.cnt > 0 ? "active" : "inactive" },
      viral: { label: "Viral / BondScore", value: viralAttempts.cnt, trend: weekAttempts.cnt > 0 ? "growing" : "stable" },
      referral: { label: "Referrals", value: referralClicks, trend: referralConversions > 0 ? "converting" : "inactive" },
      direct: { label: "Direct", value: userTotal.cnt, trend: weekUsers.cnt > 0 ? "growing" : "stable" },
    };

    return {
      config,
      systems,
      trafficSources,
      overview: {
        totalUsers: userTotal.cnt,
        weeklyNewUsers: weekUsers.cnt,
        totalContent: kpTotal.cnt + articleTotal.cnt + seoPageTotal.cnt,
        totalSocialPosts: socialTotal.cnt,
        viralConversionRate: viralAttempts.cnt > 0 ? Math.round((viralClaimed.cnt / viralAttempts.cnt) * 100) : 0,
        referralConversions: referralConversions,
        systemsActive: systems.filter(s => s.enabled).length,
        systemsTotal: systems.length,
      },
      recentInsights,
      recentLogs,
    };
  }
}

export const growthAutopilotService = new GrowthAutopilotService();
