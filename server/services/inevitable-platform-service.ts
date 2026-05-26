import { db } from "../db";
import {
  users, posts, knowledgePages, marketplaceListings, marketplaceOrders,
  labsApps, labsInstallations, creatorEarnings, inevitablePlatformSnapshots,
  topicClusters, seoPages, marketingArticles
} from "@shared/schema";
import { eq, gte, count, sql, desc, and, lt } from "drizzle-orm";

type PlatformStage = "Early Platform" | "Growing Ecosystem" | "Emerging Infrastructure" | "Inevitable Platform";

interface PlatformMetrics {
  creatorRetentionRate: number;
  organicAcquisitionRate: number;
  knowledgeGrowthRate: number;
  marketplaceTransactionCount: number;
  userReturnFrequency: number;
  totalCreators: number;
  activeCreators30d: number;
  activeCreators60d: number;
  returningUsers: number;
  newUsersThisWeek: number;
  totalUsers: number;
  knowledgePageTotal: number;
  knowledgePagesLastMonth: number;
  marketplaceRevenue: number;
  publishedApps: number;
  totalInstallations: number;
}

interface InevitabilityResult {
  inevitabilityIndex: number;
  platformStage: PlatformStage;
  metrics: PlatformMetrics;
  velocityScore: number;
  breakdown: { category: string; score: number; weight: number; weighted: number }[];
  insights: string[];
  stageProgress: { current: PlatformStage; nextStage: PlatformStage | null; progressToNext: number };
}

const WEIGHTS = {
  creatorRetention: 0.25,
  organicAcquisition: 0.20,
  knowledgeGrowth: 0.20,
  marketplaceActivity: 0.15,
  userReturn: 0.20,
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function normalizeLog(value: number, target: number): number {
  if (value <= 0) return 0;
  return clamp(Math.log(1 + value) / Math.log(1 + target) * 100, 0, 100);
}

class InevitablePlatformService {

  async gatherMetrics(): Promise<PlatformMetrics> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [totalUsers] = await db.select({ cnt: count() }).from(users);
    const [newThisWeek] = await db.select({ cnt: count() }).from(users).where(gte(users.createdAt, weekAgo));

    const [activeCreators30d] = await db.select({
      cnt: sql<number>`COUNT(DISTINCT ${posts.authorId})`,
    }).from(posts).where(gte(posts.createdAt, monthAgo));

    const [activeCreators60d] = await db.select({
      cnt: sql<number>`COUNT(DISTINCT ${posts.authorId})`,
    }).from(posts).where(and(gte(posts.createdAt, twoMonthsAgo), lt(posts.createdAt, monthAgo)));

    const ac30 = Number(activeCreators30d?.cnt || 0);
    const ac60 = Number(activeCreators60d?.cnt || 0);
    const creatorRetentionRate = ac60 > 0 ? clamp((ac30 / ac60) * 100, 0, 100) : (ac30 > 0 ? 100 : 0);

    const totalUserCount = totalUsers?.cnt || 0;
    const newUserCount = newThisWeek?.cnt || 0;

    const [returningPosts] = await db.select({
      cnt: sql<number>`COUNT(DISTINCT ${posts.authorId})`,
    }).from(posts).where(and(
      gte(posts.createdAt, weekAgo),
    ));
    const returningUsers = Number(returningPosts?.cnt || 0);

    const userReturnFrequency = totalUserCount > 0 ? clamp((returningUsers / totalUserCount) * 100, 0, 100) : 0;

    const organicAcquisitionRate = totalUserCount > 0 ? clamp((newUserCount / Math.max(totalUserCount, 1)) * 100, 0, 100) : 0;

    const [kpTotal] = await db.select({ cnt: count() }).from(knowledgePages);
    const [kpLastMonth] = await db.select({ cnt: count() }).from(knowledgePages).where(gte(knowledgePages.createdAt, monthAgo));
    const [seoCount] = await db.select({ cnt: count() }).from(seoPages);
    const [artCount] = await db.select({ cnt: count() }).from(marketingArticles);
    const knowledgeTotal = (kpTotal?.cnt || 0) + (seoCount?.cnt || 0) + (artCount?.cnt || 0);
    const knowledgeGrowthRate = knowledgeTotal > 0 ? clamp(((kpLastMonth?.cnt || 0) / Math.max(knowledgeTotal, 1)) * 100, 0, 100) : 0;

    const [orderCount] = await db.select({ cnt: count() }).from(marketplaceOrders);
    const [installCount] = await db.select({ cnt: count() }).from(labsInstallations);
    const marketplaceTransactionCount = (orderCount?.cnt || 0) + (installCount?.cnt || 0);

    const earningsSum = await db.select({
      total: sql<number>`COALESCE(SUM(${creatorEarnings.amount}), 0)`,
    }).from(creatorEarnings);

    const [appsCount] = await db.select({ cnt: count() }).from(labsApps).where(eq(labsApps.status, "published"));

    return {
      creatorRetentionRate: Math.round(creatorRetentionRate * 10) / 10,
      organicAcquisitionRate: Math.round(organicAcquisitionRate * 10) / 10,
      knowledgeGrowthRate: Math.round(knowledgeGrowthRate * 10) / 10,
      marketplaceTransactionCount,
      userReturnFrequency: Math.round(userReturnFrequency * 10) / 10,
      totalCreators: ac30,
      activeCreators30d: ac30,
      activeCreators60d: ac60,
      returningUsers,
      newUsersThisWeek: newUserCount,
      totalUsers: totalUserCount,
      knowledgePageTotal: knowledgeTotal,
      knowledgePagesLastMonth: kpLastMonth?.cnt || 0,
      marketplaceRevenue: Number(earningsSum[0]?.total || 0),
      publishedApps: appsCount?.cnt || 0,
      totalInstallations: installCount?.cnt || 0,
    };
  }

  calculateIndex(m: PlatformMetrics): { inevitabilityIndex: number; breakdown: InevitabilityResult["breakdown"] } {
    const retentionScore = clamp(m.creatorRetentionRate, 0, 100);
    const acquisitionScore = normalizeLog(m.newUsersThisWeek, 500);
    const knowledgeScore = normalizeLog(m.knowledgePageTotal, 200);
    const marketplaceScore = normalizeLog(m.marketplaceTransactionCount, 1000);
    const returnScore = clamp(m.userReturnFrequency * 2, 0, 100);

    const breakdown = [
      { category: "Creator Retention", score: Math.round(retentionScore), weight: WEIGHTS.creatorRetention, weighted: Math.round(retentionScore * WEIGHTS.creatorRetention * 10) / 10 },
      { category: "Organic Acquisition", score: Math.round(acquisitionScore), weight: WEIGHTS.organicAcquisition, weighted: Math.round(acquisitionScore * WEIGHTS.organicAcquisition * 10) / 10 },
      { category: "Knowledge Growth", score: Math.round(knowledgeScore), weight: WEIGHTS.knowledgeGrowth, weighted: Math.round(knowledgeScore * WEIGHTS.knowledgeGrowth * 10) / 10 },
      { category: "Marketplace Activity", score: Math.round(marketplaceScore), weight: WEIGHTS.marketplaceActivity, weighted: Math.round(marketplaceScore * WEIGHTS.marketplaceActivity * 10) / 10 },
      { category: "User Return Rate", score: Math.round(returnScore), weight: WEIGHTS.userReturn, weighted: Math.round(returnScore * WEIGHTS.userReturn * 10) / 10 },
    ];

    const inevitabilityIndex = Math.round(breakdown.reduce((s, b) => s + b.weighted, 0) * 10) / 10;
    return { inevitabilityIndex, breakdown };
  }

  determineStage(index: number): PlatformStage {
    if (index >= 75) return "Inevitable Platform";
    if (index >= 50) return "Emerging Infrastructure";
    if (index >= 25) return "Growing Ecosystem";
    return "Early Platform";
  }

  getStageProgress(index: number): InevitabilityResult["stageProgress"] {
    const stages: PlatformStage[] = ["Early Platform", "Growing Ecosystem", "Emerging Infrastructure", "Inevitable Platform"];
    const thresholds = [0, 25, 50, 75];
    const current = this.determineStage(index);
    const currentIdx = stages.indexOf(current);
    const nextStage = currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;
    const low = thresholds[currentIdx];
    const high = currentIdx < thresholds.length - 1 ? thresholds[currentIdx + 1] : 100;
    const progressToNext = Math.round(((index - low) / (high - low)) * 100);
    return { current, nextStage, progressToNext: clamp(progressToNext, 0, 100) };
  }

  async calculateVelocity(currentIndex: number): Promise<number> {
    const prev = await db.select().from(inevitablePlatformSnapshots)
      .orderBy(desc(inevitablePlatformSnapshots.createdAt)).limit(2);
    if (prev.length < 2) return 0;
    return Math.round((currentIndex - (prev[1]?.inevitabilityIndex || 0)) * 10) / 10;
  }

  generateInsights(m: PlatformMetrics, breakdown: InevitabilityResult["breakdown"], stage: PlatformStage): string[] {
    const insights: string[] = [];
    const weakest = [...breakdown].sort((a, b) => a.score - b.score)[0];

    if (weakest.score < 25) {
      insights.push(`${weakest.category} is the biggest bottleneck at ${weakest.score}/100. Prioritize this for fastest index growth.`);
    }

    if (m.creatorRetentionRate < 50) insights.push("Creator retention below 50% — focus on creator tools, rewards, and community features.");
    else if (m.creatorRetentionRate >= 80) insights.push("Strong creator retention at " + m.creatorRetentionRate + "% signals healthy ecosystem stickiness.");

    if (m.organicAcquisitionRate < 5) insights.push("Organic acquisition is low — invest in SEO content and knowledge pages.");
    if (m.knowledgePageTotal < 20) insights.push("Expand knowledge base to at least 20+ pages for search authority.");
    if (m.marketplaceTransactionCount < 10) insights.push("Marketplace transactions are minimal — encourage app publishing and purchases.");
    if (m.userReturnFrequency < 10) insights.push("User return frequency is low — implement engagement hooks and daily updates.");

    if (stage === "Early Platform") insights.push("Platform is in early stage. Focus on content creation and creator onboarding.");
    if (stage === "Growing Ecosystem") insights.push("Ecosystem is growing. Double down on retention and marketplace activity.");
    if (stage === "Emerging Infrastructure") insights.push("Infrastructure is forming. Focus on making the platform indispensable.");
    if (stage === "Inevitable Platform") insights.push("Platform shows signs of inevitability. Maintain growth momentum and monitor sustainability.");

    if (m.publishedApps > 0 && m.totalInstallations > m.publishedApps * 5) {
      insights.push(`Apps averaging ${Math.round(m.totalInstallations / m.publishedApps)} installs each — strong marketplace demand signal.`);
    }

    return insights.slice(0, 6);
  }

  async getFullAnalysis(): Promise<InevitabilityResult> {
    const metrics = await this.gatherMetrics();
    const { inevitabilityIndex, breakdown } = this.calculateIndex(metrics);
    const platformStage = this.determineStage(inevitabilityIndex);
    const velocityScore = await this.calculateVelocity(inevitabilityIndex);
    const stageProgress = this.getStageProgress(inevitabilityIndex);
    const insights = this.generateInsights(metrics, breakdown, platformStage);

    return { inevitabilityIndex, platformStage, metrics, velocityScore, breakdown, insights, stageProgress };
  }

  async captureSnapshot(): Promise<any> {
    const analysis = await this.getFullAnalysis();
    const m = analysis.metrics;

    const [snapshot] = await db.insert(inevitablePlatformSnapshots).values({
      inevitabilityIndex: analysis.inevitabilityIndex,
      platformStage: analysis.platformStage,
      creatorRetentionRate: m.creatorRetentionRate,
      organicAcquisitionRate: m.organicAcquisitionRate,
      knowledgeGrowthRate: m.knowledgeGrowthRate,
      marketplaceTransactionCount: m.marketplaceTransactionCount,
      userReturnFrequency: m.userReturnFrequency,
      totalCreators: m.totalCreators,
      returningUsers: m.returningUsers,
      newUsersThisWeek: m.newUsersThisWeek,
      knowledgePageTotal: m.knowledgePageTotal,
      marketplaceRevenue: m.marketplaceRevenue,
      velocityScore: analysis.velocityScore,
      metrics: m as any,
    }).returning();

    return { snapshot, analysis };
  }

  async getHistory(limit = 30): Promise<any[]> {
    return db.select().from(inevitablePlatformSnapshots)
      .orderBy(desc(inevitablePlatformSnapshots.createdAt)).limit(limit);
  }
}

export const inevitablePlatformService = new InevitablePlatformService();
