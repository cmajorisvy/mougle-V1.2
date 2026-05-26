import OpenAI from "openai";
import { db } from "../db";
import {
  sdhAccounts, sdhPosts, sdhConfig,
  knowledgePages, labsApps, topics
} from "@shared/schema";
import { eq, desc, sql, count, and, gte, lte } from "drizzle-orm";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "missing",
    });
  }
  return _openai;
}

const PLATFORM_LIMITS: Record<string, { maxChars: number; maxHashtags: number; maxPostsPerHour: number }> = {
  twitter: { maxChars: 280, maxHashtags: 5, maxPostsPerHour: 3 },
  facebook: { maxChars: 2000, maxHashtags: 10, maxPostsPerHour: 2 },
  linkedin: { maxChars: 3000, maxHashtags: 5, maxPostsPerHour: 2 },
  bluesky: { maxChars: 300, maxHashtags: 5, maxPostsPerHour: 3 },
};

class SocialDistributionService {

  async addAccount(data: {
    platform: string;
    accountName: string;
    accountHandle?: string;
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    apiSecret?: string;
  }) {
    const [account] = await db.insert(sdhAccounts).values({
      platform: data.platform,
      accountName: data.accountName,
      accountHandle: data.accountHandle || "",
      accessToken: data.accessToken || null,
      refreshToken: data.refreshToken || null,
      apiKey: data.apiKey || null,
      apiSecret: data.apiSecret || null,
      isActive: true,
    }).returning();
    return account;
  }

  async getAccounts() {
    return db.select({
      id: sdhAccounts.id,
      platform: sdhAccounts.platform,
      accountName: sdhAccounts.accountName,
      accountHandle: sdhAccounts.accountHandle,
      isActive: sdhAccounts.isActive,
      lastPostedAt: sdhAccounts.lastPostedAt,
      postCount: sdhAccounts.postCount,
      createdAt: sdhAccounts.createdAt,
    }).from(sdhAccounts).orderBy(desc(sdhAccounts.createdAt));
  }

  async toggleAccount(id: string, active: boolean) {
    const [updated] = await db.update(sdhAccounts).set({ isActive: active }).where(eq(sdhAccounts.id, id)).returning();
    return updated;
  }

  async deleteAccount(id: string) {
    await db.delete(sdhAccounts).where(eq(sdhAccounts.id, id));
    return { success: true };
  }

  async getConfig() {
    const configs = await db.select().from(sdhConfig).limit(1);
    if (configs.length > 0) return configs[0];
    const [newConfig] = await db.insert(sdhConfig).values({
      postsPerDay: 3,
      minQualityScore: 0.6,
      autoPost: false,
      includeImages: true,
      platforms: ["twitter", "linkedin"],
      contentTypes: ["knowledge", "apps", "updates"],
      postingStartHour: 9,
      postingEndHour: 21,
      timezone: "UTC",
    }).returning();
    return newConfig;
  }

  async updateConfig(updates: Partial<{
    postsPerDay: number;
    minQualityScore: number;
    autoPost: boolean;
    includeImages: boolean;
    platforms: string[];
    contentTypes: string[];
    postingStartHour: number;
    postingEndHour: number;
    timezone: string;
  }>) {
    const config = await this.getConfig();
    const [updated] = await db.update(sdhConfig).set({
      ...updates,
      updatedAt: new Date(),
    }).where(eq(sdhConfig.id, config.id)).returning();
    return updated;
  }

  async detectImportantContent(): Promise<{
    type: string;
    id: string;
    title: string;
    description: string;
    url: string;
    qualityScore: number;
  }[]> {
    const content: any[] = [];

    try {
      const kPages = await db.select().from(knowledgePages)
        .where(eq(knowledgePages.status, "published"))
        .orderBy(desc(knowledgePages.updatedAt))
        .limit(10);
      for (const p of kPages) {
        content.push({
          type: "knowledge",
          id: p.id?.toString() || "",
          title: p.title,
          description: p.summary || p.title,
          url: `/knowledge/${p.slug}`,
          qualityScore: Math.min(1, (p.schemaMarkupTypes?.length || 0) * 0.25 + 0.5),
        });
      }
    } catch {}

    try {
      const apps = await db.select().from(labsApps)
        .where(eq(labsApps.status, "published"))
        .orderBy(desc(labsApps.createdAt))
        .limit(10);
      for (const a of apps) {
        content.push({
          type: "app",
          id: a.id?.toString() || "",
          title: a.name,
          description: a.description || a.name,
          url: `/labs/app/${a.id}`,
          qualityScore: 0.7,
        });
      }
    } catch {}

    try {
      const topicList = await db.select().from(topics).limit(10);
      for (const t of topicList) {
        content.push({
          type: "topic",
          id: t.id?.toString() || "",
          title: t.label,
          description: t.description || t.label,
          url: `/topic/${t.slug}`,
          qualityScore: 0.6,
        });
      }
    } catch {}

    return content.sort((a, b) => b.qualityScore - a.qualityScore);
  }

  async generatePost(data: {
    platform: string;
    sourceType: string;
    sourceId: string;
    title: string;
    description: string;
    url: string;
  }) {
    const limits = PLATFORM_LIMITS[data.platform] || PLATFORM_LIMITS.twitter;

    try {
      const resp = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [{
          role: "user",
          content: `Generate a social media post for ${data.platform}. The post should promote this content:

Title: ${data.title}
Description: ${data.description}
URL: ${data.url}

Rules:
- Maximum ${limits.maxChars} characters total (including hashtags and URL)
- Maximum ${limits.maxHashtags} hashtags
- Engaging, professional tone
- Include a call to action
- Make it shareable

Return JSON with:
- "body": The full post text (without hashtags)
- "hashtags": Array of hashtags (without # symbol)
- "title": Optimized title (short, catchy)`,
        }],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const result = JSON.parse(resp.choices[0].message.content || "{}");
      return {
        title: result.title || data.title,
        body: result.body || `Check out: ${data.title} - ${data.description}`,
        hashtags: (result.hashtags || []).slice(0, limits.maxHashtags),
        qualityScore: 0.8,
      };
    } catch (err) {
      console.error("[SDH] AI generation error:", err);
      return {
        title: data.title,
        body: `${data.title}\n\n${data.description.slice(0, 100)}${data.description.length > 100 ? "..." : ""}\n\n${data.url}`,
        hashtags: ["mougle", "knowledge", data.sourceType],
        qualityScore: 0.5,
      };
    }
  }

  async createPost(data: {
    accountId: string;
    platform: string;
    sourceType: string;
    sourceId?: string;
    sourceUrl?: string;
    title: string;
    body: string;
    hashtags?: string[];
    imageUrl?: string;
    status?: string;
    scheduledAt?: string;
    qualityScore?: number;
  }) {
    const [post] = await db.insert(sdhPosts).values({
      accountId: data.accountId,
      platform: data.platform,
      sourceType: data.sourceType,
      sourceId: data.sourceId || null,
      sourceUrl: data.sourceUrl || null,
      title: data.title,
      body: data.body,
      hashtags: data.hashtags || [],
      imageUrl: data.imageUrl || null,
      status: data.status || "draft",
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      qualityScore: data.qualityScore || 0.5,
    }).returning();
    return post;
  }

  async getPosts(filters?: { status?: string; platform?: string; limit?: number }) {
    let query = db.select().from(sdhPosts).orderBy(desc(sdhPosts.createdAt));
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(sdhPosts.status, filters.status));
    if (filters?.platform) conditions.push(eq(sdhPosts.platform, filters.platform));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return (query as any).limit(filters?.limit || 50);
  }

  async updatePostStatus(id: string, status: string, extras?: { postUrl?: string; errorMessage?: string }) {
    const update: any = { status };
    if (status === "published") update.publishedAt = new Date();
    if (extras?.postUrl) update.postUrl = extras.postUrl;
    if (extras?.errorMessage) update.errorMessage = extras.errorMessage;

    const [updated] = await db.update(sdhPosts).set(update).where(eq(sdhPosts.id, id)).returning();

    if (status === "published" && updated) {
      await db.update(sdhAccounts).set({
        postCount: sql`${sdhAccounts.postCount} + 1`,
        lastPostedAt: new Date(),
      }).where(eq(sdhAccounts.id, updated.accountId));
    }

    return updated;
  }

  async deletePost(id: string) {
    await db.delete(sdhPosts).where(eq(sdhPosts.id, id));
    return { success: true };
  }

  async publishPost(id: string) {
    const [post] = await db.select().from(sdhPosts).where(eq(sdhPosts.id, id));
    if (!post) throw { status: 404, message: "Post not found" };

    const [account] = await db.select().from(sdhAccounts).where(eq(sdhAccounts.id, post.accountId));
    if (!account) throw { status: 404, message: "Account not found" };

    if (!account.isActive) throw { status: 400, message: "Account is disabled" };

    const limits = PLATFORM_LIMITS[account.platform] || PLATFORM_LIMITS.twitter;
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3600000);

    const recentPosts = await db.select({ cnt: count() }).from(sdhPosts)
      .where(and(
        eq(sdhPosts.accountId, account.id),
        eq(sdhPosts.status, "published"),
        gte(sdhPosts.publishedAt, hourAgo)
      ));

    if ((recentPosts[0]?.cnt || 0) >= limits.maxPostsPerHour) {
      return this.updatePostStatus(id, "rate_limited", {
        errorMessage: `Rate limit: max ${limits.maxPostsPerHour} posts per hour on ${account.platform}`,
      });
    }

    const hasCredentials = account.accessToken || account.apiKey;
    if (!hasCredentials) {
      return this.updatePostStatus(id, "pending_credentials", {
        errorMessage: "No API credentials configured for this account",
      });
    }

    return this.updatePostStatus(id, "published");
  }

  async getAnalytics() {
    const totalPosts = await db.select({ cnt: count() }).from(sdhPosts);
    const publishedPosts = await db.select({ cnt: count() }).from(sdhPosts).where(eq(sdhPosts.status, "published"));
    const draftPosts = await db.select({ cnt: count() }).from(sdhPosts).where(eq(sdhPosts.status, "draft"));
    const scheduledPosts = await db.select({ cnt: count() }).from(sdhPosts).where(eq(sdhPosts.status, "scheduled"));

    const totalImpressions = await db.select({
      sum: sql<number>`COALESCE(SUM(${sdhPosts.impressions}), 0)`,
    }).from(sdhPosts);
    const totalClicks = await db.select({
      sum: sql<number>`COALESCE(SUM(${sdhPosts.clicks}), 0)`,
    }).from(sdhPosts);
    const totalEngagement = await db.select({
      sum: sql<number>`COALESCE(SUM(${sdhPosts.engagement}), 0)`,
    }).from(sdhPosts);

    const platformBreakdown = await db.select({
      platform: sdhPosts.platform,
      cnt: count(),
    }).from(sdhPosts).groupBy(sdhPosts.platform);

    const sourceBreakdown = await db.select({
      sourceType: sdhPosts.sourceType,
      cnt: count(),
    }).from(sdhPosts).groupBy(sdhPosts.sourceType);

    const recentPosts = await db.select().from(sdhPosts)
      .orderBy(desc(sdhPosts.createdAt)).limit(10);

    const accounts = await this.getAccounts();

    return {
      totalPosts: totalPosts[0]?.cnt || 0,
      publishedPosts: publishedPosts[0]?.cnt || 0,
      draftPosts: draftPosts[0]?.cnt || 0,
      scheduledPosts: scheduledPosts[0]?.cnt || 0,
      totalImpressions: Number(totalImpressions[0]?.sum || 0),
      totalClicks: Number(totalClicks[0]?.sum || 0),
      totalEngagement: Number(totalEngagement[0]?.sum || 0),
      platformBreakdown: platformBreakdown.map(p => ({ platform: p.platform, count: p.cnt })),
      sourceBreakdown: sourceBreakdown.map(s => ({ sourceType: s.sourceType, count: s.cnt })),
      recentPosts,
      accounts,
    };
  }

  async autoDetectAndGenerate() {
    const config = await this.getConfig();
    const accounts = await db.select().from(sdhAccounts).where(eq(sdhAccounts.isActive, true));
    if (accounts.length === 0) return { generated: 0, message: "No active accounts" };

    const content = await this.detectImportantContent();
    const eligible = content.filter(c => c.qualityScore >= (config.minQualityScore || 0.6));

    let generated = 0;
    const maxToGenerate = config.postsPerDay || 3;

    for (const item of eligible.slice(0, maxToGenerate)) {
      for (const account of accounts) {
        if (config.platforms && !config.platforms.includes(account.platform)) continue;
        if (config.contentTypes && !config.contentTypes.includes(item.type)) continue;

        const existing = await db.select({ cnt: count() }).from(sdhPosts)
          .where(and(
            eq(sdhPosts.sourceId, item.id),
            eq(sdhPosts.accountId, account.id),
          ));
        if ((existing[0]?.cnt || 0) > 0) continue;

        const postContent = await this.generatePost({
          platform: account.platform,
          sourceType: item.type,
          sourceId: item.id,
          title: item.title,
          description: item.description,
          url: item.url,
        });

        if (postContent.qualityScore >= (config.minQualityScore || 0.6)) {
          await this.createPost({
            accountId: account.id,
            platform: account.platform,
            sourceType: item.type,
            sourceId: item.id,
            sourceUrl: item.url,
            title: postContent.title,
            body: postContent.body,
            hashtags: postContent.hashtags,
            status: config.autoPost ? "scheduled" : "draft",
            qualityScore: postContent.qualityScore,
          });
          generated++;
        }
      }
    }

    return { generated, message: `Generated ${generated} posts from ${eligible.length} content items` };
  }

  async getSchedulerStatus() {
    const config = await this.getConfig();
    const accounts = await this.getAccounts();
    const activeAccounts = accounts.filter(a => a.isActive);
    const now = new Date();
    const hour = now.getUTCHours();
    const isPostingWindow = hour >= (config.postingStartHour || 9) && hour < (config.postingEndHour || 21);

    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayPosts = await db.select({ cnt: count() }).from(sdhPosts)
      .where(and(
        eq(sdhPosts.status, "published"),
        gte(sdhPosts.publishedAt, todayStart),
      ));

    return {
      isPostingWindow,
      currentHourUTC: hour,
      postingStartHour: config.postingStartHour || 9,
      postingEndHour: config.postingEndHour || 21,
      timezone: config.timezone || "UTC",
      postsToday: todayPosts[0]?.cnt || 0,
      postsPerDayLimit: config.postsPerDay || 3,
      activeAccounts: activeAccounts.length,
      autoPost: config.autoPost || false,
    };
  }
}

export const socialDistributionService = new SocialDistributionService();
