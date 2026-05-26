import { db } from "../db";
import {
  knowledgePages, topicClusters, labsApps, users, posts,
  marketingArticles, seoPages, authorityFlywheelSnapshots
} from "@shared/schema";
import { eq, gte, count, sql, desc, and } from "drizzle-orm";

type FlywheelStatus = "Starting" | "Building Momentum" | "Accelerating" | "Dominant Growth";

interface FlywheelMetrics {
  knowledgePageCount: number;
  publishedAppCount: number;
  activeCreatorCount: number;
  organicTrafficScore: number;
  contentUpdateFrequency: number;
  indexedPageCount: number;
  totalCitations: number;
  totalViews: number;
  seoPageCount: number;
  articleCount: number;
  clusterCount: number;
}

interface AuthorityResult {
  authorityIndex: number;
  flywheelStatus: FlywheelStatus;
  metrics: FlywheelMetrics;
  velocityScore: number;
  breakdown: { category: string; score: number; weight: number; weighted: number }[];
  recommendations: string[];
}

const WEIGHTS = {
  knowledgePages: 0.25,
  appsPublished: 0.15,
  creatorActivity: 0.20,
  organicTraffic: 0.20,
  contentUpdates: 0.20,
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function normalizeLog(value: number, target: number): number {
  if (value <= 0) return 0;
  return clamp(Math.log(1 + value) / Math.log(1 + target) * 100, 0, 100);
}

class AuthorityFlywheelService {

  async gatherMetrics(): Promise<FlywheelMetrics> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [kpCount] = await db.select({ cnt: count() }).from(knowledgePages);
    const [indexedCount] = await db.select({ cnt: count() }).from(knowledgePages).where(eq(knowledgePages.indexed, true));

    const allKp = await db.select({
      totalViews: sql<number>`COALESCE(SUM(${knowledgePages.views}), 0)`,
      totalCitations: sql<number>`COALESCE(SUM(${knowledgePages.citationCount}), 0)`,
      totalUpdates: sql<number>`COALESCE(SUM(${knowledgePages.updateCount}), 0)`,
    }).from(knowledgePages);

    const [recentUpdates] = await db.select({ cnt: count() }).from(knowledgePages)
      .where(gte(knowledgePages.updatedAt, weekAgo));

    const [appsCount] = await db.select({ cnt: count() }).from(labsApps)
      .where(eq(labsApps.status, "published"));

    const [activeCreators] = await db.select({ cnt: count() }).from(posts)
      .where(gte(posts.createdAt, monthAgo));

    const [seoCount] = await db.select({ cnt: count() }).from(seoPages);
    const [artCount] = await db.select({ cnt: count() }).from(marketingArticles);
    const [clCount] = await db.select({ cnt: count() }).from(topicClusters);

    const seoViews = await db.select({
      total: sql<number>`COALESCE(SUM(${seoPages.views}), 0)`,
    }).from(seoPages);
    const artViews = await db.select({
      total: sql<number>`COALESCE(SUM(${marketingArticles.views}), 0)`,
    }).from(marketingArticles);

    const totalViews = Number(allKp[0]?.totalViews || 0) + Number(seoViews[0]?.total || 0) + Number(artViews[0]?.total || 0);
    const organicTrafficScore = totalViews;

    const totalKpUpdates = Number(allKp[0]?.totalUpdates || 0);
    const kpTotal = kpCount?.cnt || 0;
    const contentUpdateFrequency = kpTotal > 0 ? (recentUpdates?.cnt || 0) / Math.max(kpTotal, 1) * 100 : 0;

    return {
      knowledgePageCount: kpTotal,
      publishedAppCount: appsCount?.cnt || 0,
      activeCreatorCount: activeCreators?.cnt || 0,
      organicTrafficScore,
      contentUpdateFrequency: Math.round(contentUpdateFrequency * 10) / 10,
      indexedPageCount: indexedCount?.cnt || 0,
      totalCitations: Number(allKp[0]?.totalCitations || 0),
      totalViews,
      seoPageCount: seoCount?.cnt || 0,
      articleCount: artCount?.cnt || 0,
      clusterCount: clCount?.cnt || 0,
    };
  }

  calculateAuthorityIndex(m: FlywheelMetrics): { authorityIndex: number; breakdown: AuthorityResult["breakdown"] } {
    const kpScore = normalizeLog(m.knowledgePageCount + m.indexedPageCount * 0.5, 100);
    const appScore = normalizeLog(m.publishedAppCount, 50);
    const creatorScore = normalizeLog(m.activeCreatorCount, 200);
    const trafficScore = normalizeLog(m.organicTrafficScore, 10000);
    const updateScore = clamp(m.contentUpdateFrequency, 0, 100);

    const breakdown = [
      { category: "Knowledge Pages", score: Math.round(kpScore), weight: WEIGHTS.knowledgePages, weighted: Math.round(kpScore * WEIGHTS.knowledgePages * 10) / 10 },
      { category: "Apps Published", score: Math.round(appScore), weight: WEIGHTS.appsPublished, weighted: Math.round(appScore * WEIGHTS.appsPublished * 10) / 10 },
      { category: "Creator Activity", score: Math.round(creatorScore), weight: WEIGHTS.creatorActivity, weighted: Math.round(creatorScore * WEIGHTS.creatorActivity * 10) / 10 },
      { category: "Organic Traffic", score: Math.round(trafficScore), weight: WEIGHTS.organicTraffic, weighted: Math.round(trafficScore * WEIGHTS.organicTraffic * 10) / 10 },
      { category: "Content Updates", score: Math.round(updateScore), weight: WEIGHTS.contentUpdates, weighted: Math.round(updateScore * WEIGHTS.contentUpdates * 10) / 10 },
    ];

    const authorityIndex = Math.round(breakdown.reduce((s, b) => s + b.weighted, 0) * 10) / 10;
    return { authorityIndex, breakdown };
  }

  determineStatus(index: number): FlywheelStatus {
    if (index >= 75) return "Dominant Growth";
    if (index >= 50) return "Accelerating";
    if (index >= 25) return "Building Momentum";
    return "Starting";
  }

  async calculateVelocity(currentIndex: number): Promise<number> {
    const prev = await db.select().from(authorityFlywheelSnapshots)
      .orderBy(desc(authorityFlywheelSnapshots.createdAt)).limit(2);

    if (prev.length < 2) return 0;
    const delta = currentIndex - (prev[1]?.authorityIndex || 0);
    return Math.round(delta * 10) / 10;
  }

  generateRecommendations(m: FlywheelMetrics, breakdown: AuthorityResult["breakdown"]): string[] {
    const recs: string[] = [];
    const sorted = [...breakdown].sort((a, b) => a.score - b.score);

    if (sorted[0].score < 30) {
      recs.push(`Focus on improving ${sorted[0].category} (currently ${sorted[0].score}/100) for biggest authority gains.`);
    }

    if (m.knowledgePageCount < 10) recs.push("Generate more knowledge pages to build topical authority.");
    if (m.indexedPageCount < m.knowledgePageCount * 0.5) recs.push("Publish more draft pages — less than 50% are indexed.");
    if (m.publishedAppCount < 5) recs.push("Encourage more app publishing to strengthen platform credibility.");
    if (m.activeCreatorCount < 10) recs.push("Boost creator engagement — active creators drive organic authority.");
    if (m.contentUpdateFrequency < 20) recs.push("Increase content update frequency — fresh content signals authority.");
    if (m.clusterCount < 3) recs.push("Create more topic clusters for stronger internal linking structure.");
    if (m.totalCitations < 5) recs.push("Build citation count through high-quality, referenceable content.");

    if (recs.length === 0) recs.push("Authority growth is on track. Continue current strategies.");

    return recs.slice(0, 5);
  }

  async getFullAnalysis(): Promise<AuthorityResult> {
    const metrics = await this.gatherMetrics();
    const { authorityIndex, breakdown } = this.calculateAuthorityIndex(metrics);
    const flywheelStatus = this.determineStatus(authorityIndex);
    const velocityScore = await this.calculateVelocity(authorityIndex);
    const recommendations = this.generateRecommendations(metrics, breakdown);

    return { authorityIndex, flywheelStatus, metrics, velocityScore, breakdown, recommendations };
  }

  async captureSnapshot(): Promise<any> {
    const analysis = await this.getFullAnalysis();

    const [snapshot] = await db.insert(authorityFlywheelSnapshots).values({
      authorityIndex: analysis.authorityIndex,
      flywheelStatus: analysis.flywheelStatus,
      knowledgePageCount: analysis.metrics.knowledgePageCount,
      publishedAppCount: analysis.metrics.publishedAppCount,
      activeCreatorCount: analysis.metrics.activeCreatorCount,
      organicTrafficScore: analysis.metrics.organicTrafficScore,
      contentUpdateFrequency: analysis.metrics.contentUpdateFrequency,
      indexedPageCount: analysis.metrics.indexedPageCount,
      totalCitations: analysis.metrics.totalCitations,
      totalViews: analysis.metrics.totalViews,
      seoPageCount: analysis.metrics.seoPageCount,
      articleCount: analysis.metrics.articleCount,
      clusterCount: analysis.metrics.clusterCount,
      velocityScore: analysis.velocityScore,
      metrics: analysis.metrics as any,
    }).returning();

    return { snapshot, analysis };
  }

  async getHistory(limit = 30): Promise<any[]> {
    return db.select().from(authorityFlywheelSnapshots)
      .orderBy(desc(authorityFlywheelSnapshots.createdAt)).limit(limit);
  }
}

export const authorityFlywheelService = new AuthorityFlywheelService();
