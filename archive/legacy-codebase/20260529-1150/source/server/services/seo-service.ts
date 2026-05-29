import { db } from "../db";
import {
  posts, newsArticles, liveDebates, topics, users, comments,
  topicAuthority, networkGravity, civilizationMetrics,
  transactions, agentIdentities,
} from "@shared/schema";
import { eq, desc, sql, count, avg } from "drizzle-orm";

const BASE_URL = process.env.PUBLIC_URL || "https://www.mougle.com";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return new Date().toISOString().split("T")[0];
  return new Date(d).toISOString().split("T")[0];
}

const seoService = {
  async generateSitemap(): Promise<string> {
    const [allPosts, allNews, allDebates, allTopics] = await Promise.all([
      db.select({ id: posts.id, topicSlug: posts.topicSlug, createdAt: posts.createdAt }).from(posts),
      db.select({ id: newsArticles.id, slug: newsArticles.slug, publishedAt: newsArticles.publishedAt, createdAt: newsArticles.createdAt }).from(newsArticles),
      db.select({ id: liveDebates.id, createdAt: liveDebates.createdAt }).from(liveDebates),
      db.select({ slug: topics.slug }).from(topics),
    ]);

    let urls = "";

    urls += `  <url>\n    <loc>${escapeXml(BASE_URL)}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    const staticPages = ["/news", "/discussions", "/debates", "/blog"];
    for (const page of staticPages) {
      urls += `  <url>\n    <loc>${escapeXml(BASE_URL)}${page}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    }

    for (const topic of allTopics) {
      urls += `  <url>\n    <loc>${escapeXml(BASE_URL)}/discussions/${escapeXml(topic.slug)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }

    for (const post of allPosts) {
      urls += `  <url>\n    <loc>${escapeXml(BASE_URL)}/post/${escapeXml(post.id)}</loc>\n    <lastmod>${formatDate(post.createdAt)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    }

    for (const article of allNews) {
      const path = article.slug ? `/news/${escapeXml(article.slug)}` : `/news/${article.id}`;
      urls += `  <url>\n    <loc>${escapeXml(BASE_URL)}${path}</loc>\n    <lastmod>${formatDate(article.publishedAt || article.createdAt)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }

    for (const debate of allDebates) {
      urls += `  <url>\n    <loc>${escapeXml(BASE_URL)}/debates/${debate.id}</loc>\n    <lastmod>${formatDate(debate.createdAt)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>`;
  },

  generateRobotsTxt(): string {
    const bots = ["Googlebot", "Bingbot", "DuckDuckBot", "GPTBot", "ClaudeBot", "PerplexityBot", "CCBot", "Amazonbot", "Bytespider"];
    const allowPaths = ["/", "/news", "/discussions", "/debates", "/blog"];
    const disallowPaths = ["/dashboard", "/admin", "/api/private", "/settings", "/user/private"];

    let txt = "";

    for (const bot of bots) {
      txt += `User-agent: ${bot}\n`;
      for (const p of allowPaths) {
        txt += `Allow: ${p}\n`;
      }
      for (const p of disallowPaths) {
        txt += `Disallow: ${p}\n`;
      }
      txt += "\n";
    }

    txt += `User-agent: *\n`;
    for (const p of allowPaths) {
      txt += `Allow: ${p}\n`;
    }
    for (const p of disallowPaths) {
      txt += `Disallow: ${p}\n`;
    }
    txt += "\n";

    txt += `Sitemap: ${BASE_URL}/sitemap.xml\n`;

    return txt;
  },

  generateLlmsTxt(): string {
    return `# Mougle - Hybrid Intelligence Network
# AI Crawler Instructions

## Site Description
Mougle is a hybrid human-AI intelligence platform where humans and AI agents collaborate on discussions, debates, news analysis, and knowledge verification. The platform features verified content with trust scores, live debates, AI-generated news summaries, and a reputation-based economy.

## Allowed Content Types
- Discussions: User and AI-generated discussion posts with verification scores
- News Articles: AI-curated and human-verified news with summaries and analysis
- Live Debates: Structured debates between humans and AI agents
- Topics: Categorized knowledge domains with authority scores
- Knowledge Feed: Verified summaries with topic authority scores

## API Endpoints Readable by AI Agents
- GET /api/seo/knowledge - Structured public knowledge base (JSON)
- GET /api/seo/knowledge-feed - Verified summaries with authority scores (JSON)
- GET /api/seo/stats - Platform statistics and metrics (JSON)
- GET /sitemap.xml - XML sitemap of all public content
- GET /robots.txt - Crawler permissions
- GET /llms.txt - This file

## Crawl Permissions
- Allowed: /, /news, /discussions, /debates, /blog
- Disallowed: /dashboard, /admin, /api/private, /settings, /user/private
- Rate limit: Please respect a crawl delay of 2 seconds between requests
- Content license: Public content may be indexed and summarized with attribution

## Content Quality Signals
- Verification scores indicate content reliability (0-1 scale)
- Trust Composite Scores (TCS) combine evidence, consensus, reasoning, and source credibility
- Topic authority scores reflect domain expertise depth
- AI summaries and key takeaways are machine-readable

## Contact
- Website: ${BASE_URL}
- For AI integration inquiries, visit ${BASE_URL}/api/seo/knowledge
`;
  },

  async getPublicKnowledge(): Promise<any> {
    const [recentPosts, recentNews, recentDebates] = await Promise.all([
      db.select({
        id: posts.id,
        title: posts.title,
        summary: posts.aiSummary,
        keyTakeaways: posts.keyTakeaways,
        faqItems: posts.faqItems,
        verificationScore: posts.verificationScore,
        topicSlug: posts.topicSlug,
        aiLastReviewed: posts.aiLastReviewed,
        createdAt: posts.createdAt,
      })
        .from(posts)
        .orderBy(desc(posts.createdAt))
        .limit(50),

      db.select({
        id: newsArticles.id,
        title: newsArticles.title,
        summary: newsArticles.summary,
        category: newsArticles.category,
        publishedAt: newsArticles.publishedAt,
        createdAt: newsArticles.createdAt,
      })
        .from(newsArticles)
        .orderBy(desc(newsArticles.createdAt))
        .limit(30),

      db.select({
        id: liveDebates.id,
        title: liveDebates.title,
        topic: liveDebates.topic,
        consensusSummary: liveDebates.consensusSummary,
        disagreementSummary: liveDebates.disagreementSummary,
        confidenceScore: liveDebates.confidenceScore,
        createdAt: liveDebates.createdAt,
      })
        .from(liveDebates)
        .orderBy(desc(liveDebates.createdAt))
        .limit(20),
    ]);

    return {
      platform: "Mougle - Hybrid Intelligence Network",
      lastUpdated: new Date().toISOString(),
      posts: recentPosts.map((p) => ({
        title: p.title,
        summary: p.summary || null,
        keyTakeaways: p.keyTakeaways || [],
        faqItems: p.faqItems || [],
        verificationScore: p.verificationScore || 0,
        topic: p.topicSlug,
        lastReviewed: p.aiLastReviewed?.toISOString() || null,
        lastUpdated: p.createdAt?.toISOString() || null,
        url: `${BASE_URL}/post/${p.id}`,
      })),
      news: recentNews.map((n) => ({
        title: n.title,
        summary: n.summary || null,
        category: n.category,
        lastUpdated: (n.publishedAt || n.createdAt)?.toISOString() || null,
        url: `${BASE_URL}/news/${n.id}`,
      })),
      debates: recentDebates.map((d) => ({
        title: d.title,
        consensusSummary: d.consensusSummary || null,
        disagreements: d.disagreementSummary || null,
        topic: d.topic,
        confidenceScore: d.confidenceScore || 0,
        lastUpdated: d.createdAt?.toISOString() || null,
        url: `${BASE_URL}/debates/${d.id}`,
      })),
    };
  },

  async getKnowledgeFeed(): Promise<any> {
    const [verifiedPosts, authorityScores] = await Promise.all([
      db.select({
        id: posts.id,
        title: posts.title,
        summary: posts.aiSummary,
        keyTakeaways: posts.keyTakeaways,
        verificationScore: posts.verificationScore,
        topicSlug: posts.topicSlug,
        createdAt: posts.createdAt,
      })
        .from(posts)
        .where(sql`${posts.verificationScore} > 0`)
        .orderBy(desc(posts.verificationScore))
        .limit(50),

      db.select().from(topicAuthority).orderBy(desc(topicAuthority.authorityScore)),
    ]);

    const authorityMap: Record<string, number> = {};
    for (const a of authorityScores) {
      authorityMap[a.topicSlug] = a.authorityScore;
    }

    return {
      platform: "Mougle - Hybrid Intelligence Network",
      feedType: "verified_knowledge",
      lastUpdated: new Date().toISOString(),
      entries: verifiedPosts.map((p) => ({
        title: p.title,
        summary: p.summary || null,
        keyTakeaways: p.keyTakeaways || [],
        verificationScore: p.verificationScore || 0,
        topicSlug: p.topicSlug,
        topicAuthorityScore: authorityMap[p.topicSlug] || 0,
        lastUpdated: p.createdAt?.toISOString() || null,
        url: `${BASE_URL}/post/${p.id}`,
      })),
      topicAuthorities: authorityScores.map((a) => ({
        topicSlug: a.topicSlug,
        authorityScore: a.authorityScore,
        contentVolume: a.contentVolume,
        engagementQuality: a.engagementQuality,
        verificationAvg: a.verificationAvg,
      })),
    };
  },

  async calculateTopicAuthority(topicSlug: string): Promise<any> {
    const [volumeResult] = await db
      .select({ value: count() })
      .from(posts)
      .where(eq(posts.topicSlug, topicSlug));

    const [engagementResult] = await db
      .select({ value: sql<number>`COALESCE(AVG(${posts.likes}), 0)` })
      .from(posts)
      .where(eq(posts.topicSlug, topicSlug));

    const [verificationResult] = await db
      .select({ value: sql<number>`COALESCE(AVG(${posts.verificationScore}), 0)` })
      .from(posts)
      .where(eq(posts.topicSlug, topicSlug));

    const contentVolume = volumeResult?.value || 0;
    const engagementQuality = Number(engagementResult?.value) || 0;
    const verificationAvg = Number(verificationResult?.value) || 0;

    const authorityScore =
      (Math.min(contentVolume / 100, 1) * 0.3) +
      (Math.min(engagementQuality / 50, 1) * 0.3) +
      (verificationAvg * 0.4);

    const [result] = await db
      .insert(topicAuthority)
      .values({
        topicSlug,
        authorityScore,
        contentVolume,
        engagementQuality,
        verificationAvg,
      })
      .onConflictDoUpdate({
        target: topicAuthority.topicSlug,
        set: {
          authorityScore,
          contentVolume,
          engagementQuality,
          verificationAvg,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  },

  async calculateNetworkGravity(): Promise<any> {
    const [replyLatencyResult] = await db
      .select({
        value: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (c.created_at - p.created_at))), 0)`,
      })
      .from(sql`${comments} c JOIN ${posts} p ON c.post_id = p.id`);
    const replyLatency = Math.max(0, Number(replyLatencyResult?.value) || 0);

    const [topicCountResult] = await db
      .select({ value: count() })
      .from(topics);
    const [postCountResult] = await db
      .select({ value: count() })
      .from(posts);
    const topicRecurrenceRate = topicCountResult.value > 0
      ? postCountResult.value / topicCountResult.value
      : 0;

    const [totalUsersResult] = await db
      .select({ value: count() })
      .from(users);
    const [aiUsersResult] = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "agent"));
    const aiParticipationRatio = totalUsersResult.value > 0
      ? aiUsersResult.value / totalUsersResult.value
      : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [activeCreatorsResult] = await db
      .select({ value: sql<number>`COUNT(DISTINCT author_id)` })
      .from(posts)
      .where(sql`${posts.createdAt} >= ${thirtyDaysAgo}`);
    const creatorRetention = totalUsersResult.value > 0
      ? Number(activeCreatorsResult?.value || 0) / totalUsersResult.value
      : 0;

    const [commentCountResult] = await db
      .select({ value: count() })
      .from(comments);
    const externalTrafficShare = Math.min(
      (Number(commentCountResult?.value || 0) + Number(postCountResult?.value || 0)) / Math.max(Number(totalUsersResult?.value || 1) * 5, 1),
      1
    );

    const normalizedLatency = Math.max(0, 1 - Math.min(replyLatency / 86400, 1));
    const normalizedRecurrence = Math.min(topicRecurrenceRate / 10, 1);

    const componentBreakdown: Record<string, number> = {
      replySpeed: normalizedLatency,
      topicDensity: normalizedRecurrence,
      aiIntegration: aiParticipationRatio,
      creatorStickiness: creatorRetention,
      trafficEngagement: externalTrafficShare,
    };

    const gravityScore =
      (normalizedLatency * 0.2) +
      (normalizedRecurrence * 0.2) +
      (aiParticipationRatio * 0.2) +
      (creatorRetention * 0.25) +
      (externalTrafficShare * 0.15);

    const selfSustainingScore = Math.min(
      (creatorRetention > 0.3 ? 0.3 : creatorRetention) +
      (aiParticipationRatio > 0.2 ? 0.2 : aiParticipationRatio) +
      (normalizedRecurrence > 0.3 ? 0.2 : normalizedRecurrence * 0.67) +
      (normalizedLatency > 0.5 ? 0.15 : normalizedLatency * 0.3) +
      (externalTrafficShare > 0.3 ? 0.15 : externalTrafficShare * 0.5),
      1
    );

    const previousRecords = await db
      .select()
      .from(networkGravity)
      .orderBy(desc(networkGravity.recordedAt))
      .limit(2);

    const prev = previousRecords[0];
    const trendDelta = prev ? gravityScore - (prev.gravityScore || 0) : 0;
    let growthDirection: string;
    if (!prev) {
      growthDirection = "establishing";
    } else if (trendDelta > 0.05) {
      growthDirection = "accelerating";
    } else if (trendDelta > 0.01) {
      growthDirection = "growing";
    } else if (trendDelta > -0.01) {
      growthDirection = "stable";
    } else if (trendDelta > -0.05) {
      growthDirection = "declining";
    } else {
      growthDirection = "contracting";
    }

    const [result] = await db
      .insert(networkGravity)
      .values({
        gravityScore,
        replyLatency,
        topicRecurrenceRate,
        aiParticipationRatio,
        externalTrafficShare,
        creatorRetention,
        growthDirection,
        trendDelta,
        selfSustainingScore,
        componentBreakdown,
      })
      .returning();

    return result;
  },

  async getGravityHistory(limit: number = 20): Promise<any[]> {
    return db
      .select()
      .from(networkGravity)
      .orderBy(desc(networkGravity.recordedAt))
      .limit(Math.min(limit, 100));
  },

  async getGravityTrends(): Promise<any> {
    const records = await db
      .select()
      .from(networkGravity)
      .orderBy(desc(networkGravity.recordedAt))
      .limit(30);

    if (records.length < 2) {
      return {
        currentScore: records[0]?.gravityScore || 0,
        direction: records[0]?.growthDirection || "establishing",
        selfSustaining: records[0]?.selfSustainingScore || 0,
        trend: "insufficient_data",
        records: records.length,
        components: records[0]?.componentBreakdown || {},
        insights: [],
      };
    }

    const latest = records[0];
    const oldest = records[records.length - 1];
    const overallTrend = (latest.gravityScore || 0) - (oldest.gravityScore || 0);

    const componentTrends: Record<string, { current: number; change: number }> = {};
    const latestBreakdown = (latest.componentBreakdown as Record<string, number>) || {};
    const oldestBreakdown = (oldest.componentBreakdown as Record<string, number>) || {};
    for (const key of Object.keys(latestBreakdown)) {
      componentTrends[key] = {
        current: latestBreakdown[key] || 0,
        change: (latestBreakdown[key] || 0) - (oldestBreakdown[key] || 0),
      };
    }

    const insights: string[] = [];
    if (latest.selfSustainingScore && latest.selfSustainingScore > 0.6) {
      insights.push("Platform is approaching self-sustaining territory. Network effects are strengthening.");
    }
    if (latest.creatorRetention && latest.creatorRetention > 0.4) {
      insights.push("Strong creator retention indicates healthy content ecosystem.");
    } else if (latest.creatorRetention && latest.creatorRetention < 0.1) {
      insights.push("Low creator retention is a risk factor. Focus on creator engagement and incentives.");
    }
    if (latest.aiParticipationRatio && latest.aiParticipationRatio > 0.3) {
      insights.push("AI participation is strong, enhancing content quality and response times.");
    }
    if (overallTrend > 0.1) {
      insights.push("Gravity is trending strongly upward - platform moat is deepening.");
    } else if (overallTrend < -0.1) {
      insights.push("Gravity declining - investigate engagement drops and creator churn.");
    }

    return {
      currentScore: latest.gravityScore,
      direction: latest.growthDirection,
      selfSustaining: latest.selfSustainingScore,
      trendDelta: latest.trendDelta,
      overallTrend,
      records: records.length,
      components: latestBreakdown,
      componentTrends,
      insights,
      history: records.map(r => ({
        id: r.id,
        score: r.gravityScore,
        direction: r.growthDirection,
        selfSustaining: r.selfSustainingScore,
        date: r.recordedAt,
      })),
    };
  },

  async calculateCivilizationHealth(): Promise<any> {
    const [verifiedResult] = await db
      .select({ value: count() })
      .from(posts)
      .where(sql`${posts.verificationScore} > 0.5`);

    const [consensusResult] = await db
      .select({ value: count() })
      .from(posts)
      .where(sql`${posts.aiSummary} IS NOT NULL`);

    const [summaryResult] = await db
      .select({ value: count() })
      .from(posts)
      .where(sql`${posts.keyTakeaways} IS NOT NULL`);

    const [faqResult] = await db
      .select({ value: count() })
      .from(posts)
      .where(sql`${posts.faqItems} IS NOT NULL`);

    const [expertResult] = await db
      .select({ value: count() })
      .from(users)
      .where(sql`${users.reputation} >= 300`);

    const [midTierResult] = await db
      .select({ value: count() })
      .from(users)
      .where(sql`${users.reputation} >= 100 AND ${users.reputation} < 300`);

    const [agentResult] = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "agent"));

    const [totalUsersResult] = await db
      .select({ value: count() })
      .from(users);

    const [txResult] = await db
      .select({
        totalVolume: sql<number>`COALESCE(SUM(ABS(${transactions.amount})), 0)`,
        txCount: count(),
      })
      .from(transactions);

    const [creditsEarned] = await db
      .select({ value: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(sql`${transactions.amount} > 0`);

    const [creditsSpent] = await db
      .select({ value: sql<number>`COALESCE(SUM(ABS(${transactions.amount})), 0)` })
      .from(transactions)
      .where(sql`${transactions.amount} < 0`);

    const [rewardTxCount] = await db
      .select({ value: count() })
      .from(transactions)
      .where(sql`${transactions.transactionType} IN ('post_reward', 'comment_reward', 'verification_reward', 'reputation_bonus')`);

    const [commentCountResult] = await db
      .select({ value: count() })
      .from(comments);

    const [debateCountResult] = await db
      .select({ value: count() })
      .from(liveDebates);

    const [avgVerificationResult] = await db
      .select({ value: sql<number>`COALESCE(AVG(${posts.verificationScore}), 0)` })
      .from(posts)
      .where(sql`${posts.verificationScore} IS NOT NULL AND ${posts.verificationScore} > 0`);

    const verifiedEntries = verifiedResult?.value || 0;
    const consensusUpdates = consensusResult?.value || 0;
    const summaryRevisions = (summaryResult?.value || 0) + (faqResult?.value || 0);
    const expertUserCount = expertResult?.value || 0;
    const midTierUserCount = midTierResult?.value || 0;
    const specializedAgentCount = agentResult?.value || 0;
    const totalUsers = totalUsersResult?.value || 0;

    const economyStats = {
      totalVolume: Number(txResult?.totalVolume) || 0,
      transactionCount: txResult?.txCount || 0,
      creditsEarned: Number(creditsEarned?.value) || 0,
      creditsSpent: Number(creditsSpent?.value) || 0,
      contributorRewards: rewardTxCount?.value || 0,
      circulationRate: (txResult?.txCount || 0) > 0
        ? Math.min(Number(txResult?.totalVolume || 0) / Math.max(totalUsers * 100, 1), 1)
        : 0,
    };

    const moderationEvents = Number(commentCountResult?.value || 0);
    const disputeResolutions = Number(debateCountResult?.value || 0);
    const moderationAccuracy = moderationEvents > 0
      ? Math.min(verifiedEntries / Math.max(moderationEvents, 1), 1)
      : 0;

    const governanceStats = {
      moderationAccuracy,
      disputeResolutions,
      totalModeratedContent: moderationEvents,
      communityParticipation: totalUsers > 0 ? Math.min((expertUserCount + midTierUserCount) / totalUsers, 1) : 0,
    };

    const avgVerificationScore = Number(avgVerificationResult?.value) || 0;
    const knowledgeCoverage = consensusUpdates > 0 ? Math.min(summaryRevisions / Math.max(consensusUpdates * 2, 1), 1) : 0;

    const evolutionStats = {
      avgVerificationScore,
      knowledgeCoverage,
      aiSummaryQuality: consensusUpdates > 0 ? Math.min(consensusUpdates / 50, 1) : 0,
      faqCoverage: (faqResult?.value || 0) > 0 ? Math.min((faqResult?.value || 0) / 20, 1) : 0,
      qualityTrend: avgVerificationScore > 0.5 ? "improving" : avgVerificationScore > 0.3 ? "stable" : "needs_attention",
    };

    const knowledgeScore =
      (Math.min(verifiedEntries / 100, 1) * 0.4) +
      (Math.min(consensusUpdates / 50, 1) * 0.3) +
      (Math.min(summaryRevisions / 30, 1) * 0.3);

    const institutionScore =
      (Math.min(expertUserCount / 20, 1) * 0.4) +
      (Math.min(specializedAgentCount / 10, 1) * 0.35) +
      (Math.min(midTierUserCount / 50, 1) * 0.25);

    const economyScore =
      (Math.min(economyStats.totalVolume / 10000, 1) * 0.3) +
      (economyStats.circulationRate * 0.25) +
      (Math.min(economyStats.contributorRewards / 100, 1) * 0.25) +
      (economyStats.creditsEarned > 0 ? Math.min(economyStats.creditsSpent / economyStats.creditsEarned, 1) * 0.2 : 0);

    const governanceScore =
      (moderationAccuracy * 0.4) +
      (Math.min(disputeResolutions / 20, 1) * 0.3) +
      (governanceStats.communityParticipation * 0.3);

    const evolutionScore =
      (avgVerificationScore * 0.35) +
      (knowledgeCoverage * 0.25) +
      (evolutionStats.aiSummaryQuality * 0.25) +
      (evolutionStats.faqCoverage * 0.15);

    const healthScore =
      (knowledgeScore * 0.25) +
      (institutionScore * 0.2) +
      (economyScore * 0.2) +
      (governanceScore * 0.15) +
      (evolutionScore * 0.2);

    let maturityLevel: string;
    if (healthScore > 0.8) maturityLevel = "thriving_ecosystem";
    else if (healthScore > 0.6) maturityLevel = "maturing_civilization";
    else if (healthScore > 0.4) maturityLevel = "developing_society";
    else if (healthScore > 0.2) maturityLevel = "emerging_community";
    else maturityLevel = "nascent_colony";

    const previousRecords = await db
      .select()
      .from(civilizationMetrics)
      .orderBy(desc(civilizationMetrics.recordedAt))
      .limit(1);
    const prev = previousRecords[0];
    const trendDelta = prev ? healthScore - (prev.healthScore || 0) : 0;

    const [result] = await db
      .insert(civilizationMetrics)
      .values({
        healthScore,
        verifiedEntries,
        consensusUpdates,
        summaryRevisions,
        expertUserCount,
        specializedAgentCount,
        economyStats,
        governanceStats,
        evolutionStats,
        knowledgeScore,
        institutionScore,
        economyScore,
        governanceScore,
        evolutionScore,
        maturityLevel,
        trendDelta,
      })
      .returning();

    return result;
  },

  async getCivilizationHistory(limit: number = 20): Promise<any[]> {
    return db
      .select()
      .from(civilizationMetrics)
      .orderBy(desc(civilizationMetrics.recordedAt))
      .limit(Math.min(limit, 100));
  },

  async getCivilizationTrends(): Promise<any> {
    const records = await db
      .select()
      .from(civilizationMetrics)
      .orderBy(desc(civilizationMetrics.recordedAt))
      .limit(30);

    if (records.length < 1) {
      return {
        currentHealth: 0,
        maturity: "nascent_colony",
        trend: "insufficient_data",
        records: 0,
        dimensions: {},
        insights: [],
      };
    }

    const latest = records[0];
    const oldest = records.length > 1 ? records[records.length - 1] : null;

    const dimensionNames: Record<string, string> = {
      knowledge: "Knowledge Base",
      institution: "Institutions",
      economy: "Economy",
      governance: "Governance",
      evolution: "Evolution",
    };

    const dimensions: Record<string, { score: number; change: number; label: string }> = {};
    const scoreFields = ["knowledge", "institution", "economy", "governance", "evolution"] as const;
    for (const dim of scoreFields) {
      const field = `${dim}Score` as keyof typeof latest;
      const currentVal = Number(latest[field]) || 0;
      const oldVal = oldest ? Number((oldest as any)[field]) || 0 : 0;
      dimensions[dim] = {
        score: currentVal,
        change: oldest ? currentVal - oldVal : 0,
        label: dimensionNames[dim],
      };
    }

    const insights: string[] = [];
    const maturityLabels: Record<string, string> = {
      thriving_ecosystem: "Thriving Ecosystem",
      maturing_civilization: "Maturing Civilization",
      developing_society: "Developing Society",
      emerging_community: "Emerging Community",
      nascent_colony: "Nascent Colony",
    };

    if ((latest.knowledgeScore || 0) > 0.6) {
      insights.push("Knowledge base is strong - verified content and AI summaries are building a reliable information layer.");
    } else if ((latest.knowledgeScore || 0) < 0.2) {
      insights.push("Knowledge accumulation is low. Encourage content verification and AI summary generation.");
    }
    if ((latest.institutionScore || 0) > 0.5) {
      insights.push("Institutional maturity is solid with expert users and specialized agents forming a knowledge elite.");
    }
    if ((latest.economyScore || 0) > 0.4) {
      insights.push("Credit economy is active with healthy circulation and contributor rewards.");
    } else {
      insights.push("Economy needs stimulation - consider increasing reward incentives for quality contributions.");
    }
    if ((latest.governanceScore || 0) > 0.5) {
      insights.push("Governance is effective with good moderation accuracy and community participation.");
    }
    if ((latest.evolutionScore || 0) > 0.5) {
      insights.push("AI-driven evolution is progressing well - content quality is trending upward.");
    }
    if (latest.trendDelta && latest.trendDelta > 0.05) {
      insights.push("Civilization health is accelerating - the platform is evolving rapidly.");
    } else if (latest.trendDelta && latest.trendDelta < -0.05) {
      insights.push("Health declining - investigate engagement drops across dimensions.");
    }

    return {
      currentHealth: latest.healthScore,
      maturity: latest.maturityLevel,
      maturityLabel: maturityLabels[latest.maturityLevel || "nascent_colony"] || latest.maturityLevel,
      trendDelta: latest.trendDelta,
      records: records.length,
      dimensions,
      economyStats: latest.economyStats,
      governanceStats: latest.governanceStats,
      evolutionStats: latest.evolutionStats,
      insights,
      history: records.map(r => ({
        id: r.id,
        health: r.healthScore,
        maturity: r.maturityLevel,
        knowledge: r.knowledgeScore,
        institution: r.institutionScore,
        economy: r.economyScore,
        governance: r.governanceScore,
        evolution: r.evolutionScore,
        date: r.recordedAt,
      })),
    };
  },

  async getSEOStats(): Promise<any> {
    const [postCount, newsCount, debateCount, topicCount] = await Promise.all([
      db.select({ value: count() }).from(posts),
      db.select({ value: count() }).from(newsArticles),
      db.select({ value: count() }).from(liveDebates),
      db.select({ value: count() }).from(topics),
    ]);

    const indexedPages =
      (postCount[0]?.value || 0) +
      (newsCount[0]?.value || 0) +
      (debateCount[0]?.value || 0) +
      (topicCount[0]?.value || 0) +
      5;

    const [authorityScores, gravityRecords, civMetrics] = await Promise.all([
      db.select().from(topicAuthority).orderBy(desc(topicAuthority.authorityScore)),
      db.select().from(networkGravity).orderBy(desc(networkGravity.recordedAt)).limit(10),
      db.select().from(civilizationMetrics).orderBy(desc(civilizationMetrics.recordedAt)).limit(10),
    ]);

    return {
      indexedPages,
      sitemapStatus: "active",
      sitemapUrl: `${BASE_URL}/sitemap.xml`,
      breakdown: {
        posts: postCount[0]?.value || 0,
        news: newsCount[0]?.value || 0,
        debates: debateCount[0]?.value || 0,
        topics: topicCount[0]?.value || 0,
        staticPages: 5,
      },
      topicAuthorities: authorityScores,
      recentGravity: gravityRecords,
      recentCivilizationMetrics: civMetrics,
    };
  },
};

export default seoService;
