import { db } from "../db";
import {
  labsFlywheelAnalytics, labsReferrals, labsCreatorRankings, labsLandingPages,
  labsOpportunities, labsApps, labsInstallations, labsReviews,
  type LabsFlywheelAnalytics, type LabsReferral, type LabsCreatorRanking, type LabsLandingPage,
  type LabsApp,
} from "@shared/schema";
import { eq, desc, sql, and, gte, count } from "drizzle-orm";
import { labsService } from "./labs-service";

const CREATOR_TIERS = [
  { minRevenue: 0, minApps: 0, tier: "starter", label: "Starter" },
  { minRevenue: 100, minApps: 2, tier: "builder", label: "Builder" },
  { minRevenue: 1000, minApps: 5, tier: "creator", label: "Creator" },
  { minRevenue: 5000, minApps: 10, tier: "pro", label: "Pro Creator" },
  { minRevenue: 25000, minApps: 20, tier: "elite", label: "Elite" },
];

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let code = "d8-";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function determineTier(totalRevenue: number, totalApps: number): string {
  let result = "starter";
  for (const t of CREATOR_TIERS) {
    if (totalRevenue >= t.minRevenue && totalApps >= t.minApps) {
      result = t.tier;
    }
  }
  return result;
}

class LabsFlywheelService {
  private dailyGenerationTimer: NodeJS.Timeout | null = null;

  startDailyGeneration() {
    console.log("[LabsFlywheel] Starting daily opportunity generation scheduler");
    this.runDailyGeneration();
    this.dailyGenerationTimer = setInterval(() => {
      this.runDailyGeneration();
    }, 24 * 60 * 60 * 1000);
  }

  async runDailyGeneration(): Promise<{ generated: number; date: string }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await db.select({ cnt: count() })
        .from(labsOpportunities)
        .where(gte(labsOpportunities.createdAt, today));

      if (existing[0].cnt >= 20) {
        console.log(`[LabsFlywheel] Already ${existing[0].cnt} opportunities today, skipping`);
        return { generated: 0, date: today.toISOString() };
      }

      const opportunities = await labsService.generateDailyOpportunities();
      console.log(`[LabsFlywheel] Generated ${opportunities.length} new opportunities`);

      await this.snapshotAnalytics();

      return { generated: opportunities.length, date: today.toISOString() };
    } catch (error) {
      console.error("[LabsFlywheel] Daily generation error:", error);
      return { generated: 0, date: new Date().toISOString() };
    }
  }

  async snapshotAnalytics(): Promise<LabsFlywheelAnalytics> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [oppCount] = await db.select({ cnt: count() }).from(labsOpportunities);
    const [buildCount] = await db.select({ total: sql<number>`COALESCE(SUM(build_count), 0)` }).from(labsOpportunities);
    const [publishedCount] = await db.select({ cnt: count() }).from(labsApps).where(eq(labsApps.status, "published"));
    const [installCount] = await db.select({ cnt: count() }).from(labsInstallations);
    const [referralCount] = await db.select({ total: sql<number>`COALESCE(SUM(signups), 0)` }).from(labsReferrals);

    const creatorIds = await db.selectDistinct({ id: labsApps.creatorId }).from(labsApps);

    const topIndustryResult = await db.select({
      industry: labsOpportunities.industry,
      cnt: count(),
    }).from(labsOpportunities)
      .groupBy(labsOpportunities.industry)
      .orderBy(desc(count()))
      .limit(1);

    const topCategoryResult = await db.select({
      category: labsOpportunities.category,
      cnt: count(),
    }).from(labsOpportunities)
      .groupBy(labsOpportunities.category)
      .orderBy(desc(count()))
      .limit(1);

    const totalBuilds = Number(buildCount.total) || 0;
    const totalPublished = publishedCount.cnt;
    const conversionRate = totalBuilds > 0 ? (totalPublished / totalBuilds) * 100 : 0;

    const [snapshot] = await db.insert(labsFlywheelAnalytics).values({
      date: today,
      totalOpportunities: oppCount.cnt,
      totalBuilds,
      totalPublished,
      totalInstalls: installCount.cnt,
      totalRevenue: 0,
      activeCreators: creatorIds.length,
      newUsers: 0,
      referralSignups: Number(referralCount.total) || 0,
      retentionRate: 0,
      conversionRate: Math.round(conversionRate * 10) / 10,
      topIndustry: topIndustryResult[0]?.industry || null,
      topCategory: topCategoryResult[0]?.category || null,
    }).returning();

    return snapshot;
  }

  async getAnalytics(days: number = 30): Promise<LabsFlywheelAnalytics[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return db.select().from(labsFlywheelAnalytics)
      .where(gte(labsFlywheelAnalytics.date, since))
      .orderBy(desc(labsFlywheelAnalytics.date));
  }

  async getLatestAnalytics(): Promise<LabsFlywheelAnalytics | undefined> {
    const [latest] = await db.select().from(labsFlywheelAnalytics).orderBy(desc(labsFlywheelAnalytics.date)).limit(1);
    return latest;
  }

  async getFlywheelSummary() {
    const latest = await this.getLatestAnalytics();
    const history = await this.getAnalytics(7);
    const topCreators = await this.getCreatorRankings(10);
    const topReferrals = await this.getTopReferrals(5);

    const successRate = latest
      ? latest.totalBuilds > 0
        ? Math.round((latest.totalPublished / latest.totalBuilds) * 100)
        : 0
      : 0;

    return {
      current: latest || {
        totalOpportunities: 0,
        totalBuilds: 0,
        totalPublished: 0,
        totalInstalls: 0,
        totalRevenue: 0,
        activeCreators: 0,
        referralSignups: 0,
        conversionRate: 0,
        retentionRate: 0,
      },
      successRate,
      history,
      topCreators,
      topReferrals,
      growthLoop: {
        opportunities: latest?.totalOpportunities || 0,
        builds: latest?.totalBuilds || 0,
        published: latest?.totalPublished || 0,
        installs: latest?.totalInstalls || 0,
        referrals: latest?.referralSignups || 0,
      },
    };
  }

  async createReferral(appId: string, creatorId: string): Promise<LabsReferral> {
    const existing = await db.select().from(labsReferrals)
      .where(and(eq(labsReferrals.appId, appId), eq(labsReferrals.creatorId, creatorId)));
    if (existing.length > 0) return existing[0];

    const referralCode = generateReferralCode();
    const [referral] = await db.insert(labsReferrals).values({
      appId,
      creatorId,
      referralCode,
    }).returning();
    return referral;
  }

  async trackReferralClick(referralCode: string): Promise<void> {
    await db.update(labsReferrals)
      .set({ clicks: sql`${labsReferrals.clicks} + 1` })
      .where(eq(labsReferrals.referralCode, referralCode));
  }

  async trackReferralSignup(referralCode: string): Promise<void> {
    await db.update(labsReferrals)
      .set({ signups: sql`${labsReferrals.signups} + 1` })
      .where(eq(labsReferrals.referralCode, referralCode));
  }

  async getReferral(code: string): Promise<LabsReferral | undefined> {
    const [ref] = await db.select().from(labsReferrals).where(eq(labsReferrals.referralCode, code));
    return ref;
  }

  async getAppReferrals(appId: string): Promise<LabsReferral[]> {
    return db.select().from(labsReferrals).where(eq(labsReferrals.appId, appId));
  }

  async getCreatorReferrals(creatorId: string): Promise<LabsReferral[]> {
    return db.select().from(labsReferrals).where(eq(labsReferrals.creatorId, creatorId));
  }

  async getTopReferrals(limit: number = 10): Promise<LabsReferral[]> {
    return db.select().from(labsReferrals).orderBy(desc(labsReferrals.signups)).limit(limit);
  }

  async updateCreatorRanking(creatorId: string): Promise<LabsCreatorRanking> {
    const apps = await db.select().from(labsApps).where(eq(labsApps.creatorId, creatorId));
    const totalApps = apps.length;
    const totalInstalls = apps.reduce((sum, a) => sum + (a.installCount || 0), 0);
    const totalRating = apps.reduce((sum, a) => sum + (a.rating || 0), 0);
    const avgRating = totalApps > 0 ? Math.round((totalRating / totalApps) * 10) / 10 : 0;

    const referrals = await db.select({
      total: sql<number>`COALESCE(SUM(signups), 0)`
    }).from(labsReferrals).where(eq(labsReferrals.creatorId, creatorId));
    const totalReferrals = Number(referrals[0]?.total) || 0;

    const tier = determineTier(0, totalApps);

    const existing = await db.select().from(labsCreatorRankings)
      .where(eq(labsCreatorRankings.creatorId, creatorId));

    if (existing.length > 0) {
      const [updated] = await db.update(labsCreatorRankings).set({
        totalApps,
        totalInstalls,
        totalRevenue: 0,
        totalReferrals,
        avgRating,
        tier,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(labsCreatorRankings.creatorId, creatorId)).returning();
      return updated;
    }

    const [created] = await db.insert(labsCreatorRankings).values({
      creatorId,
      totalApps,
      totalInstalls,
      totalRevenue: 0,
      totalReferrals,
      avgRating,
      tier,
      rank: 0,
    }).returning();
    return created;
  }

  async recalculateAllRankings(): Promise<void> {
    const creators = await db.selectDistinct({ id: labsApps.creatorId }).from(labsApps);
    for (const c of creators) {
      await this.updateCreatorRanking(c.id);
    }

    const rankings = await db.select().from(labsCreatorRankings)
      .orderBy(desc(labsCreatorRankings.totalInstalls));
    for (let i = 0; i < rankings.length; i++) {
      await db.update(labsCreatorRankings)
        .set({ rank: i + 1 })
        .where(eq(labsCreatorRankings.id, rankings[i].id));
    }
  }

  async getCreatorRankings(limit: number = 20): Promise<LabsCreatorRanking[]> {
    return db.select().from(labsCreatorRankings)
      .orderBy(labsCreatorRankings.rank)
      .limit(limit);
  }

  async getCreatorRanking(creatorId: string): Promise<LabsCreatorRanking | undefined> {
    const [ranking] = await db.select().from(labsCreatorRankings)
      .where(eq(labsCreatorRankings.creatorId, creatorId));
    return ranking;
  }

  async generateLandingPage(appId: string): Promise<LabsLandingPage> {
    const app = await db.select().from(labsApps).where(eq(labsApps.id, appId));
    if (!app.length) throw new Error("App not found");

    const a = app[0];
    const slug = a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const referralCode = generateReferralCode();

    const existing = await db.select().from(labsLandingPages).where(eq(labsLandingPages.appId, appId));
    if (existing.length > 0) return existing[0];

    const [page] = await db.insert(labsLandingPages).values({
      appId,
      slug,
      headline: a.name,
      subheadline: a.description,
      features: [],
      ctaText: a.pricingModel === "free" ? "Get It Free" : "Get Started",
      ctaUrl: a.liveUrl || `/labs/apps`,
      socialProof: { installs: a.installCount, rating: a.rating || 0, reviews: a.reviewCount },
      referralCode,
    }).returning();

    await db.insert(labsReferrals).values({
      appId,
      creatorId: a.creatorId,
      referralCode,
    }).onConflictDoNothing();

    return page;
  }

  async getLandingPage(slug: string): Promise<LabsLandingPage | undefined> {
    const [page] = await db.select().from(labsLandingPages).where(eq(labsLandingPages.slug, slug));
    if (page) {
      await db.update(labsLandingPages)
        .set({ views: sql`${labsLandingPages.views} + 1` })
        .where(eq(labsLandingPages.id, page.id));
    }
    return page;
  }

  async getLandingPageByAppId(appId: string): Promise<LabsLandingPage | undefined> {
    const [page] = await db.select().from(labsLandingPages).where(eq(labsLandingPages.appId, appId));
    return page;
  }

  async trackConversion(slug: string): Promise<void> {
    await db.update(labsLandingPages)
      .set({ conversions: sql`${labsLandingPages.conversions} + 1` })
      .where(eq(labsLandingPages.slug, slug));
  }

  async getGrowthLoopMetrics() {
    const [oppCount] = await db.select({ cnt: count() }).from(labsOpportunities);
    const [buildSum] = await db.select({ total: sql<number>`COALESCE(SUM(build_count), 0)` }).from(labsOpportunities);
    const [publishedCount] = await db.select({ cnt: count() }).from(labsApps).where(eq(labsApps.status, "published"));
    const [installCount] = await db.select({ cnt: count() }).from(labsInstallations);
    const [referralSum] = await db.select({ total: sql<number>`COALESCE(SUM(signups), 0)` }).from(labsReferrals);
    const [clickSum] = await db.select({ total: sql<number>`COALESCE(SUM(clicks), 0)` }).from(labsReferrals);
    const [landingViews] = await db.select({ total: sql<number>`COALESCE(SUM(views), 0)` }).from(labsLandingPages);
    const [landingConversions] = await db.select({ total: sql<number>`COALESCE(SUM(conversions), 0)` }).from(labsLandingPages);

    return {
      stages: [
        { name: "Opportunities", value: oppCount.cnt, icon: "beaker" },
        { name: "Builds Started", value: Number(buildSum.total) || 0, icon: "rocket" },
        { name: "Apps Published", value: publishedCount.cnt, icon: "globe" },
        { name: "Total Installs", value: installCount.cnt, icon: "download" },
        { name: "Landing Views", value: Number(landingViews.total) || 0, icon: "eye" },
        { name: "Referral Clicks", value: Number(clickSum.total) || 0, icon: "link" },
        { name: "New Signups", value: Number(referralSum.total) || 0, icon: "user-plus" },
      ],
      conversionFunnel: {
        opportunitiesToBuilds: oppCount.cnt > 0
          ? Math.round(((Number(buildSum.total) || 0) / oppCount.cnt) * 100)
          : 0,
        buildsToPublished: (Number(buildSum.total) || 0) > 0
          ? Math.round((publishedCount.cnt / (Number(buildSum.total) || 1)) * 100)
          : 0,
        publishedToInstalls: publishedCount.cnt > 0
          ? Math.round((installCount.cnt / publishedCount.cnt) * 100)
          : 0,
        viewsToConversions: (Number(landingViews.total) || 0) > 0
          ? Math.round(((Number(landingConversions.total) || 0) / (Number(landingViews.total) || 1)) * 100)
          : 0,
      },
    };
  }
}

export const labsFlywheelService = new LabsFlywheelService();
