import { db } from "../db";
import {
  superLoopCycles, superLoopMetrics,
  personalAgentConversations, personalAgentMessages,
  realityClaims, consensusRecords, claimEvidence,
  labsOpportunities, labsApps, labsInstallations,
  labsFlywheelAnalytics, labsReferrals,
  type SuperLoopCycle, type SuperLoopMetrics,
} from "@shared/schema";
import { eq, desc, sql, gte, count, and, sum } from "drizzle-orm";

const LOOP_STAGES = [
  { key: "interaction", label: "Personal Intelligence", pillar: "personal", order: 1 },
  { key: "debate", label: "Collective Intelligence", pillar: "collective", order: 2 },
  { key: "reality", label: "Reality Alignment", pillar: "collective", order: 3 },
  { key: "opportunity", label: "Labs Opportunity", pillar: "labs", order: 4 },
  { key: "app", label: "App Published", pillar: "labs", order: 5 },
  { key: "revenue", label: "Revenue Generated", pillar: "economy", order: 6 },
];

const PILLAR_WEIGHTS = {
  personal: { interactions: 0.4, memories: 0.3, tasks: 0.3 },
  collective: { debates: 0.3, claims: 0.3, consensus: 0.4 },
  labs: { opportunities: 0.3, apps: 0.4, installs: 0.3 },
  economy: { revenue: 0.4, referrals: 0.3, creators: 0.3 },
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

class SuperLoopService {

  async getSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [interactions, claims, consensus, opportunities, apps, installs] = await Promise.all([
      db.select({ cnt: count() }).from(personalAgentConversations).where(gte(personalAgentConversations.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(realityClaims).where(gte(realityClaims.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(consensusRecords).where(gte(consensusRecords.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(labsOpportunities).where(gte(labsOpportunities.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(labsApps).where(and(eq(labsApps.status, "published"), gte(labsApps.createdAt, weekAgo))),
      db.select({ cnt: count() }).from(labsInstallations).where(gte(labsInstallations.createdAt, weekAgo)),
    ]);

    const revenueResult = await db.select({ total: sql<number>`COALESCE(SUM(total_revenue), 0)` })
      .from(labsFlywheelAnalytics).where(gte(labsFlywheelAnalytics.date, weekAgo));

    const activeCycles = await db.select({ cnt: count() }).from(superLoopCycles).where(eq(superLoopCycles.status, "active"));
    const completedCycles = await db.select({ cnt: count() }).from(superLoopCycles).where(eq(superLoopCycles.status, "completed"));

    const pillarHealth = await this.calculatePillarHealth();
    const velocity = await this.calculateVelocity();
    const reinforcement = this.calculateReinforcementScore(pillarHealth);

    return {
      period: "7d",
      stages: {
        interactions: interactions[0].cnt,
        claims: claims[0].cnt,
        consensus: consensus[0].cnt,
        opportunities: opportunities[0].cnt,
        appsPublished: apps[0].cnt,
        installs: installs[0].cnt,
        revenue: Number(revenueResult[0]?.total || 0),
      },
      cycles: {
        active: activeCycles[0].cnt,
        completed: completedCycles[0].cnt,
      },
      velocity,
      reinforcementScore: reinforcement,
      pillarHealth,
      loopStages: LOOP_STAGES,
    };
  }

  async getHealth() {
    const pillarHealth = await this.calculatePillarHealth();
    const velocity = await this.calculateVelocity();
    const reinforcement = this.calculateReinforcementScore(pillarHealth);
    const overallHealth = (pillarHealth.personal + pillarHealth.collective + pillarHealth.labs + pillarHealth.economy) / 4;

    const bottlenecks = this.identifyBottlenecks(pillarHealth);
    const recommendations = this.generateRecommendations(pillarHealth, velocity);

    return {
      overall: Math.round(overallHealth * 100),
      velocity: Math.round(velocity * 100) / 100,
      reinforcement: Math.round(reinforcement * 100),
      pillars: {
        personal: { score: Math.round(pillarHealth.personal * 100), status: this.getStatus(pillarHealth.personal) },
        collective: { score: Math.round(pillarHealth.collective * 100), status: this.getStatus(pillarHealth.collective) },
        labs: { score: Math.round(pillarHealth.labs * 100), status: this.getStatus(pillarHealth.labs) },
        economy: { score: Math.round(pillarHealth.economy * 100), status: this.getStatus(pillarHealth.economy) },
      },
      bottlenecks,
      recommendations,
    };
  }

  async getCycles(limit = 20) {
    return db.select().from(superLoopCycles).orderBy(desc(superLoopCycles.createdAt)).limit(limit);
  }

  async getCycleFunnel() {
    const stages = await Promise.all(
      LOOP_STAGES.map(async (stage) => {
        const result = await db.select({ cnt: count() })
          .from(superLoopCycles)
          .where(eq(superLoopCycles.stage, stage.key));
        return { ...stage, count: result[0].cnt };
      })
    );

    const maxCount = Math.max(1, ...stages.map(s => s.count));
    return stages.map(s => ({
      ...s,
      percentage: Math.round((s.count / maxCount) * 100),
    }));
  }

  async getRevenueAttribution() {
    const byPillar = await db.select({
      pillar: superLoopCycles.pillar,
      total: sql<number>`COALESCE(SUM(revenue_attributed), 0)`,
      cycles: count(),
    }).from(superLoopCycles)
      .groupBy(superLoopCycles.pillar);

    const byStage = await db.select({
      stage: superLoopCycles.stage,
      total: sql<number>`COALESCE(SUM(revenue_attributed), 0)`,
      cycles: count(),
    }).from(superLoopCycles)
      .groupBy(superLoopCycles.stage);

    return { byPillar, byStage };
  }

  async getTimeline(days = 14) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    return db.select().from(superLoopMetrics)
      .where(gte(superLoopMetrics.date, startDate))
      .orderBy(superLoopMetrics.date);
  }

  async captureSnapshot(): Promise<SuperLoopMetrics> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [interactions, claims, consensus, opportunities, apps, installs] = await Promise.all([
      db.select({ cnt: count() }).from(personalAgentConversations),
      db.select({ cnt: count() }).from(realityClaims),
      db.select({ cnt: count() }).from(consensusRecords),
      db.select({ cnt: count() }).from(labsOpportunities),
      db.select({ cnt: count() }).from(labsApps).where(eq(labsApps.status, "published")),
      db.select({ cnt: count() }).from(labsInstallations),
    ]);

    const revenueResult = await db.select({ total: sql<number>`COALESCE(SUM(total_revenue), 0)` })
      .from(labsFlywheelAnalytics);

    const completedCycles = await db.select({ cnt: count() })
      .from(superLoopCycles).where(eq(superLoopCycles.status, "completed"));

    const pillarHealth = await this.calculatePillarHealth();
    const velocity = await this.calculateVelocity();
    const reinforcement = this.calculateReinforcementScore(pillarHealth);

    const knowledgeFeedback = consensus[0].cnt + claims[0].cnt;

    const [snapshot] = await db.insert(superLoopMetrics).values({
      date: today,
      personalInteractions: interactions[0].cnt,
      debatesActive: 0,
      realityClaims: claims[0].cnt,
      consensusReached: consensus[0].cnt,
      labsOpportunities: opportunities[0].cnt,
      appsPublished: apps[0].cnt,
      appsInstalled: installs[0].cnt,
      totalRevenue: Number(revenueResult[0]?.total || 0),
      knowledgeFeedback,
      loopVelocity: velocity,
      reinforcementScore: reinforcement,
      pillarHealth,
      cycleCompletions: completedCycles[0].cnt,
      avgCycleTime: velocity > 0 ? 1 / velocity : 0,
    }).returning();

    return snapshot;
  }

  async recordCycleEvent(data: {
    stage: string;
    sourceType: string;
    sourceId?: string;
    targetType?: string;
    targetId?: string;
    pillar: string;
    metadata?: Record<string, any>;
    revenueAttributed?: number;
  }) {
    const stageIndex = LOOP_STAGES.findIndex(s => s.key === data.stage);
    const [cycle] = await db.insert(superLoopCycles).values({
      stage: data.stage,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      targetType: data.targetType,
      targetId: data.targetId,
      pillar: data.pillar,
      metadata: data.metadata,
      revenueAttributed: data.revenueAttributed || 0,
      completedStages: stageIndex + 1,
      totalStages: 6,
      velocity: 0,
      status: stageIndex >= 5 ? "completed" : "active",
    }).returning();
    return cycle;
  }

  async triggerLoopScan() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const generated: SuperLoopCycle[] = [];

    const recentConversations = await db.select({ cnt: count() })
      .from(personalAgentConversations)
      .where(gte(personalAgentConversations.createdAt, today));
    if (recentConversations[0].cnt > 0) {
      const cycle = await this.recordCycleEvent({
        stage: "interaction",
        sourceType: "personal_agent",
        pillar: "personal",
        metadata: { conversationCount: recentConversations[0].cnt, date: today.toISOString() },
      });
      generated.push(cycle);
    }

    const recentClaims = await db.select().from(realityClaims)
      .where(gte(realityClaims.createdAt, today)).limit(5);
    for (const claim of recentClaims) {
      const cycle = await this.recordCycleEvent({
        stage: "reality",
        sourceType: "reality_claim",
        sourceId: claim.id,
        pillar: "collective",
        metadata: { confidence: claim.confidenceScore, status: claim.status },
      });
      generated.push(cycle);
    }

    const recentApps = await db.select().from(labsApps)
      .where(and(eq(labsApps.status, "published"), gte(labsApps.createdAt, today)));
    for (const app of recentApps) {
      const cycle = await this.recordCycleEvent({
        stage: "app",
        sourceType: "labs_app",
        sourceId: app.id,
        pillar: "labs",
        metadata: { name: app.name, industry: app.industry },
      });
      generated.push(cycle);
    }

    return { scanned: true, cyclesCreated: generated.length, date: today.toISOString() };
  }

  private async calculatePillarHealth(): Promise<{ personal: number; collective: number; labs: number; economy: number }> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [conversations, claims, consensus, opportunities, apps, installs, referrals] = await Promise.all([
      db.select({ cnt: count() }).from(personalAgentConversations).where(gte(personalAgentConversations.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(realityClaims).where(gte(realityClaims.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(consensusRecords).where(gte(consensusRecords.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(labsOpportunities).where(gte(labsOpportunities.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(labsApps).where(gte(labsApps.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(labsInstallations).where(gte(labsInstallations.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(labsReferrals).where(gte(labsReferrals.createdAt, weekAgo)),
    ]);

    const personal = clamp(
      (conversations[0].cnt / 50) * PILLAR_WEIGHTS.personal.interactions +
      (conversations[0].cnt / 100) * PILLAR_WEIGHTS.personal.memories +
      (conversations[0].cnt / 30) * PILLAR_WEIGHTS.personal.tasks,
      0, 1
    );

    const collective = clamp(
      (claims[0].cnt / 20) * PILLAR_WEIGHTS.collective.claims +
      (consensus[0].cnt / 10) * PILLAR_WEIGHTS.collective.consensus +
      (claims[0].cnt / 15) * PILLAR_WEIGHTS.collective.debates,
      0, 1
    );

    const labs = clamp(
      (opportunities[0].cnt / 30) * PILLAR_WEIGHTS.labs.opportunities +
      (apps[0].cnt / 10) * PILLAR_WEIGHTS.labs.apps +
      (installs[0].cnt / 20) * PILLAR_WEIGHTS.labs.installs,
      0, 1
    );

    const economy = clamp(
      (referrals[0].cnt / 15) * PILLAR_WEIGHTS.economy.referrals +
      (installs[0].cnt / 20) * PILLAR_WEIGHTS.economy.revenue +
      (apps[0].cnt / 10) * PILLAR_WEIGHTS.economy.creators,
      0, 1
    );

    return { personal, collective, labs, economy };
  }

  private async calculateVelocity(): Promise<number> {
    const completedCycles = await db.select({
      cnt: count(),
    }).from(superLoopCycles).where(eq(superLoopCycles.status, "completed"));

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCompleted = await db.select({
      cnt: count(),
    }).from(superLoopCycles)
      .where(and(eq(superLoopCycles.status, "completed"), gte(superLoopCycles.createdAt, weekAgo)));

    return recentCompleted[0].cnt > 0 ? recentCompleted[0].cnt / 7 : 0;
  }

  private calculateReinforcementScore(health: { personal: number; collective: number; labs: number; economy: number }): number {
    const avgHealth = (health.personal + health.collective + health.labs + health.economy) / 4;
    const minHealth = Math.min(health.personal, health.collective, health.labs, health.economy);
    const balance = minHealth / Math.max(avgHealth, 0.01);
    return clamp(avgHealth * 0.6 + balance * 0.4, 0, 1);
  }

  private getStatus(score: number): string {
    if (score >= 0.7) return "healthy";
    if (score >= 0.4) return "moderate";
    return "needs_attention";
  }

  private identifyBottlenecks(health: { personal: number; collective: number; labs: number; economy: number }): string[] {
    const bottlenecks: string[] = [];
    if (health.personal < 0.3) bottlenecks.push("Low personal agent interaction volume");
    if (health.collective < 0.3) bottlenecks.push("Insufficient debate and reality alignment activity");
    if (health.labs < 0.3) bottlenecks.push("Few apps being built from opportunities");
    if (health.economy < 0.3) bottlenecks.push("Revenue and referral channels underperforming");
    if (health.labs > 0.6 && health.economy < 0.3) bottlenecks.push("Apps exist but monetization is weak");
    if (health.collective > 0.6 && health.labs < 0.3) bottlenecks.push("Knowledge created but not converted to apps");
    return bottlenecks;
  }

  private generateRecommendations(health: { personal: number; collective: number; labs: number; economy: number }, velocity: number): string[] {
    const recs: string[] = [];
    if (velocity < 0.5) recs.push("Increase loop velocity by generating more opportunities from verified claims");
    if (health.personal < 0.4) recs.push("Encourage users to engage with personal intelligence agents");
    if (health.collective < 0.4) recs.push("Promote debate participation to generate more verified knowledge");
    if (health.labs < 0.4) recs.push("Auto-generate more app opportunities from consensus-verified insights");
    if (health.economy < 0.4) recs.push("Create referral incentives and improve app marketplace visibility");
    if (recs.length === 0) recs.push("System healthy — maintain current engagement levels");
    return recs;
  }
}

export const superLoopService = new SuperLoopService();
