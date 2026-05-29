import { db } from "../db";
import { users, posts, topics, transactions, marketplaceListings, labsApps } from "@shared/schema";
import { sql, gte, count, and, eq, desc, lt } from "drizzle-orm";

interface PNRStage {
  id: number;
  label: string;
  tag: string;
  description: string;
  threshold: number;
  color: string;
}

const PNR_STAGES: PNRStage[] = [
  { id: 1, label: "Early Stage", tag: "early", description: "Platform relies on founder-driven growth. Users are experimenting, content is seeded, and monetization is nascent.", threshold: 0, color: "#6b7280" },
  { id: 2, label: "Growth Stage", tag: "growth", description: "User acquisition accelerating. Creators earning revenue, content production rising, and retention improving.", threshold: 30, color: "#4f7df9" },
  { id: 3, label: "Approaching Transition", tag: "transition", description: "Network effects visible. Organic growth dominates, creators self-sustain, AI optimizes effectively.", threshold: 60, color: "#eab308" },
  { id: 4, label: "Self-Sustaining Network", tag: "self-sustaining", description: "Point of No Return reached. Platform grows and earns independently without founder intervention.", threshold: 85, color: "#10b981" },
];

const METRIC_WEIGHTS = {
  organicGrowth: 0.25,
  creatorEarnings: 0.20,
  dailyUGC: 0.20,
  aiOptimization: 0.15,
  userRetention: 0.20,
};

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

class PNRMonitorService {
  private snapshots: Array<{ timestamp: number; pnrIndex: number; metrics: Record<string, number> }> = [];

  async computeSnapshot() {
    const metrics = await this.gatherMetrics();
    const scores = this.scoreMetrics(metrics);
    const pnrIndex = this.computePNRIndex(scores);
    const stage = this.determineStage(pnrIndex);
    const insights = this.generateInsights(metrics, scores, stage);

    this.snapshots.push({ timestamp: Date.now(), pnrIndex, metrics: { ...scores } });
    if (this.snapshots.length > 336) this.snapshots.shift();

    return {
      pnrIndex: Math.round(pnrIndex * 10) / 10,
      stage,
      stages: PNR_STAGES,
      metrics,
      scores,
      insights,
      selfSustaining: pnrIndex >= 85,
      trend: this.computeTrend(),
      history: this.snapshots.slice(-48).map(s => ({ timestamp: s.timestamp, score: s.pnrIndex })),
      distanceToSelfSustaining: Math.max(0, Math.round(85 - pnrIndex)),
      generatedAt: new Date().toISOString(),
    };
  }

  private async gatherMetrics() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersThisWeek,
      newUsersPrevWeek,
      newUsersMonth,
      postsToday,
      postsThisWeek,
      postsPrevWeek,
      postsMonth,
      aiPosts,
      activeCreators,
      totalTransactions,
      recentTransactions,
      returningUsers,
      totalListings,
    ] = await Promise.all([
      db.select({ cnt: count() }).from(users),
      db.select({ cnt: count() }).from(users).where(gte(users.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(users).where(and(gte(users.createdAt, twoWeeksAgo), lt(users.createdAt, weekAgo))),
      db.select({ cnt: count() }).from(users).where(gte(users.createdAt, monthAgo)),
      db.select({ cnt: count() }).from(posts).where(gte(posts.createdAt, dayAgo)),
      db.select({ cnt: count() }).from(posts).where(gte(posts.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(posts).where(and(gte(posts.createdAt, twoWeeksAgo), lt(posts.createdAt, weekAgo))),
      db.select({ cnt: count() }).from(posts).where(gte(posts.createdAt, monthAgo)),
      db.select({ cnt: count() }).from(posts).where(and(gte(posts.createdAt, monthAgo), eq(posts.authorId, "ai-system"))),
      db.select({ cnt: count() }).from(users).where(and(eq(users.role, "human"), gte(users.createdAt, monthAgo), eq(users.profileCompleted, true))),
      db.select({ cnt: count() }).from(transactions),
      db.select({ cnt: count() }).from(transactions).where(gte(transactions.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(users).where(and(eq(users.profileCompleted, true))),
      db.select({ cnt: count() }).from(marketplaceListings),
    ]);

    let labsAppCount = 0;
    try {
      const [r] = await db.select({ cnt: count() }).from(labsApps);
      labsAppCount = r?.cnt || 0;
    } catch {}

    const total = totalUsers[0]?.cnt || 0;
    const weekNew = newUsersThisWeek[0]?.cnt || 0;
    const prevWeekNew = newUsersPrevWeek[0]?.cnt || 0;
    const monthNew = newUsersMonth[0]?.cnt || 0;
    const todayPosts = postsToday[0]?.cnt || 0;
    const weekPosts = postsThisWeek[0]?.cnt || 0;
    const prevWeekPosts = postsPrevWeek[0]?.cnt || 0;
    const monthPosts = postsMonth[0]?.cnt || 0;
    const aiPostCount = aiPosts[0]?.cnt || 0;
    const creators = activeCreators[0]?.cnt || 0;
    const txTotal = totalTransactions[0]?.cnt || 0;
    const txRecent = recentTransactions[0]?.cnt || 0;
    const returning = returningUsers[0]?.cnt || 0;
    const listings = totalListings[0]?.cnt || 0;

    const organicGrowthPct = prevWeekNew > 0 ? Math.round(((weekNew - prevWeekNew) / prevWeekNew) * 100) : weekNew > 0 ? 100 : 0;
    const humanPosts = monthPosts - aiPostCount;
    const ugcRatio = monthPosts > 0 ? Math.round((humanPosts / monthPosts) * 100) : 0;
    const contentGrowthPct = prevWeekPosts > 0 ? Math.round(((weekPosts - prevWeekPosts) / prevWeekPosts) * 100) : weekPosts > 0 ? 100 : 0;
    const retentionRate = total > 0 ? Math.round((returning / total) * 100) : 0;
    const creatorsEarning = txRecent > 0 ? Math.min(creators, txRecent) : 0;
    const aiOptRate = monthPosts > 0 ? Math.round((aiPostCount / monthPosts) * 100) : 0;

    return {
      organicGrowth: { percentage: organicGrowthPct, newUsersThisWeek: weekNew, newUsersPrevWeek: prevWeekNew, totalUsers: total },
      creatorEarnings: { activeCreators: creators, creatorsEarning, totalTransactions: txTotal, recentTransactions: txRecent, listings },
      dailyUGC: { postsToday: todayPosts, postsThisWeek: weekPosts, monthlyPosts: monthPosts, ugcRatio, contentGrowthPct },
      aiOptimization: { aiGeneratedPosts: aiPostCount, totalPosts: monthPosts, aiContributionRate: aiOptRate, labsApps: labsAppCount },
      userRetention: { retentionRate, returningUsers: returning, totalUsers: total, monthlyNewUsers: monthNew },
    };
  }

  private scoreMetrics(metrics: Awaited<ReturnType<typeof this.gatherMetrics>>): Record<string, number> {
    const organicScore = clamp(
      metrics.organicGrowth.percentage > 0
        ? Math.min(100, 30 + metrics.organicGrowth.percentage * 0.7)
        : metrics.organicGrowth.newUsersThisWeek > 0 ? 20 : 5
    );

    const earningsScore = clamp(
      metrics.creatorEarnings.creatorsEarning >= 10 ? 90
        : metrics.creatorEarnings.creatorsEarning >= 5 ? 70
        : metrics.creatorEarnings.creatorsEarning >= 1 ? 40
        : metrics.creatorEarnings.listings > 0 ? 15 : 5
    );

    const ugcScore = clamp(
      metrics.dailyUGC.postsToday >= 50 ? 95
        : metrics.dailyUGC.postsToday >= 20 ? 80
        : metrics.dailyUGC.postsToday >= 10 ? 60
        : metrics.dailyUGC.postsToday >= 3 ? 40
        : metrics.dailyUGC.postsToday >= 1 ? 20 : 5
    );

    const aiScore = clamp(
      metrics.aiOptimization.aiContributionRate >= 10 && metrics.aiOptimization.aiContributionRate <= 40 ? 90
        : metrics.aiOptimization.aiContributionRate > 40 ? 60
        : metrics.aiOptimization.labsApps > 0 ? 30 : 10
    );

    const retentionScore = clamp(
      metrics.userRetention.retentionRate >= 60 ? 95
        : metrics.userRetention.retentionRate >= 40 ? 75
        : metrics.userRetention.retentionRate >= 20 ? 50
        : metrics.userRetention.retentionRate >= 10 ? 30 : 10
    );

    return {
      organicGrowth: organicScore,
      creatorEarnings: earningsScore,
      dailyUGC: ugcScore,
      aiOptimization: aiScore,
      userRetention: retentionScore,
    };
  }

  private computePNRIndex(scores: Record<string, number>): number {
    return Object.entries(METRIC_WEIGHTS).reduce(
      (sum, [key, weight]) => sum + (scores[key] || 0) * weight, 0
    );
  }

  private determineStage(pnrIndex: number): PNRStage {
    for (let i = PNR_STAGES.length - 1; i >= 0; i--) {
      if (pnrIndex >= PNR_STAGES[i].threshold) return PNR_STAGES[i];
    }
    return PNR_STAGES[0];
  }

  private generateInsights(
    metrics: Awaited<ReturnType<typeof this.gatherMetrics>>,
    scores: Record<string, number>,
    stage: PNRStage
  ): Array<{ type: "strength" | "weakness" | "opportunity"; message: string }> {
    const insights: Array<{ type: "strength" | "weakness" | "opportunity"; message: string }> = [];

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const strongest = entries[0];
    const weakest = entries[entries.length - 1];

    if (strongest[1] >= 70) {
      const labels: Record<string, string> = { organicGrowth: "Organic growth", creatorEarnings: "Creator earnings", dailyUGC: "Daily content", aiOptimization: "AI optimization", userRetention: "User retention" };
      insights.push({ type: "strength", message: `${labels[strongest[0]] || strongest[0]} is your strongest metric at ${Math.round(strongest[1])}%` });
    }

    if (weakest[1] < 40) {
      const actions: Record<string, string> = {
        organicGrowth: "Focus on referral incentives and shareable content to boost organic signups",
        creatorEarnings: "Improve creator monetization tools — marketplace listings and revenue sharing",
        dailyUGC: "Encourage daily posting with prompts, challenges, and gamification",
        aiOptimization: "Expand AI agent contributions to augment user-generated content",
        userRetention: "Improve onboarding flow and add re-engagement notifications",
      };
      insights.push({ type: "weakness", message: actions[weakest[0]] || `${weakest[0]} needs improvement (${Math.round(weakest[1])}%)` });
    }

    if (stage.id < 4) {
      const nextStage = PNR_STAGES[stage.id];
      insights.push({ type: "opportunity", message: `${Math.round(nextStage.threshold - this.computePNRIndex(scores))} points to reach "${nextStage.label}" — focus on weakest metrics` });
    }

    if (metrics.dailyUGC.contentGrowthPct > 20) {
      insights.push({ type: "strength", message: `Content production growing ${metrics.dailyUGC.contentGrowthPct}% week-over-week` });
    }

    if (metrics.userRetention.retentionRate < 30 && metrics.organicGrowth.totalUsers > 10) {
      insights.push({ type: "weakness", message: `Retention at ${metrics.userRetention.retentionRate}% — users aren't sticking. Improve value delivery.` });
    }

    return insights;
  }

  private computeTrend(): { direction: string; delta: number } {
    if (this.snapshots.length < 2) return { direction: "stable", delta: 0 };
    const recent = this.snapshots[this.snapshots.length - 1].pnrIndex;
    const prev = this.snapshots[Math.max(0, this.snapshots.length - 6)].pnrIndex;
    const delta = Math.round((recent - prev) * 10) / 10;
    if (delta > 1.5) return { direction: "improving", delta };
    if (delta < -1.5) return { direction: "declining", delta };
    return { direction: "stable", delta };
  }
}

export const pnrMonitorService = new PNRMonitorService();
