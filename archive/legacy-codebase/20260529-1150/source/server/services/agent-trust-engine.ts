import { db } from "../db";
import {
  agentTrustProfiles, agentTrustEvents, agentTrustHistory,
  userAgents as userAgentsTable, agentReviews, agentUsageLogs,
  marketplaceListings, agentCostLogs
} from "@shared/schema";
import { eq, sql, desc, and, gte, count } from "drizzle-orm";

const TRUST_TIERS = [
  { min: 0, tier: "untrusted", label: "Untrusted" },
  { min: 20, tier: "unverified", label: "Unverified" },
  { min: 40, tier: "emerging", label: "Emerging" },
  { min: 60, tier: "trusted", label: "Trusted" },
  { min: 75, tier: "verified", label: "Verified" },
  { min: 90, tier: "elite", label: "Elite" },
];

function getTrustTier(score: number): string {
  for (let i = TRUST_TIERS.length - 1; i >= 0; i--) {
    if (score >= TRUST_TIERS[i].min) return TRUST_TIERS[i].tier;
  }
  return "untrusted";
}

const COMPONENT_WEIGHTS = {
  accuracy: 0.30,
  community: 0.25,
  expertise: 0.20,
  safety: 0.15,
  network_influence: 0.10,
};

const EVENT_DELTAS: Record<string, { component: string; delta: number }> = {
  positive_rating: { component: "community", delta: 2.0 },
  negative_rating: { component: "community", delta: -3.0 },
  neutral_rating: { component: "community", delta: 0.5 },
  debate_win: { component: "accuracy", delta: 3.0 },
  debate_loss: { component: "accuracy", delta: -1.0 },
  debate_participation: { component: "expertise", delta: 1.0 },
  fact_check_pass: { component: "accuracy", delta: 2.5 },
  fact_check_fail: { component: "accuracy", delta: -5.0 },
  moderation_warning: { component: "safety", delta: -8.0 },
  moderation_clear: { component: "safety", delta: 1.0 },
  content_flagged: { component: "safety", delta: -4.0 },
  collaboration_success: { component: "network_influence", delta: 2.0 },
  collaboration_fail: { component: "network_influence", delta: -1.5 },
  marketplace_sale: { component: "community", delta: 1.5 },
  high_usage: { component: "expertise", delta: 0.5 },
  certification_earned: { component: "expertise", delta: 3.0 },
  verified_answer: { component: "accuracy", delta: 2.0 },
  report_received: { component: "safety", delta: -3.0 },
  report_dismissed: { component: "safety", delta: 1.5 },
};

const MANIPULATION_THRESHOLDS = {
  maxRatingsPerUserPerAgent: 3,
  maxRatingsPerHour: 10,
  suspiciousRatingBurstWindow: 300000,
  suspiciousRatingBurstCount: 5,
  maxManipulationFlags: 5,
};

class AgentTrustEngine {
  async getOrCreateProfile(agentId: string) {
    const [existing] = await db.select().from(agentTrustProfiles)
      .where(eq(agentTrustProfiles.agentId, agentId));
    if (existing) return existing;

    const [created] = await db.insert(agentTrustProfiles)
      .values({ agentId })
      .returning();
    return created;
  }

  async recordEvent(
    agentId: string,
    eventType: string,
    sourceId?: string,
    sourceUserId?: string,
    metadata?: any
  ) {
    const config = EVENT_DELTAS[eventType];
    if (!config) return null;

    const flagResult = await this.checkManipulation(agentId, eventType, sourceUserId);

    const [event] = await db.insert(agentTrustEvents).values({
      agentId,
      eventType,
      component: config.component,
      delta: flagResult.flagged ? 0 : config.delta,
      sourceId,
      sourceUserId,
      metadata,
      flagged: flagResult.flagged,
      flagReason: flagResult.reason,
    }).returning();

    if (flagResult.flagged) {
      const [updated] = await db.update(agentTrustProfiles)
        .set({ manipulationFlags: sql`${agentTrustProfiles.manipulationFlags} + 1` })
        .where(eq(agentTrustProfiles.agentId, agentId))
        .returning({ manipulationFlags: agentTrustProfiles.manipulationFlags });

      if (updated && updated.manipulationFlags >= MANIPULATION_THRESHOLDS.maxManipulationFlags) {
        await db.update(agentTrustProfiles)
          .set({ isSuspended: true, suspensionReason: "Excessive manipulation attempts detected" })
          .where(eq(agentTrustProfiles.agentId, agentId));
      }
    }

    if (!flagResult.flagged) {
      await this.recalculateScores(agentId);
    }

    return event;
  }

  private async checkManipulation(
    agentId: string,
    eventType: string,
    sourceUserId?: string
  ): Promise<{ flagged: boolean; reason?: string }> {
    if (!sourceUserId || !eventType.includes("rating")) {
      return { flagged: false };
    }

    const recentWindow = new Date(Date.now() - MANIPULATION_THRESHOLDS.suspiciousRatingBurstWindow);
    const recentFromUser = await db.select({ cnt: count() }).from(agentTrustEvents)
      .where(and(
        eq(agentTrustEvents.agentId, agentId),
        eq(agentTrustEvents.sourceUserId, sourceUserId),
        eq(agentTrustEvents.eventType, eventType),
      ));

    if ((recentFromUser[0]?.cnt || 0) >= MANIPULATION_THRESHOLDS.maxRatingsPerUserPerAgent) {
      return { flagged: true, reason: `User ${sourceUserId} has rated this agent too many times` };
    }

    const recentBurst = await db.select({ cnt: count() }).from(agentTrustEvents)
      .where(and(
        eq(agentTrustEvents.agentId, agentId),
        eq(agentTrustEvents.eventType, eventType),
        gte(agentTrustEvents.createdAt, recentWindow),
      ));

    if ((recentBurst[0]?.cnt || 0) >= MANIPULATION_THRESHOLDS.suspiciousRatingBurstCount) {
      return { flagged: true, reason: "Suspicious burst of ratings detected" };
    }

    return { flagged: false };
  }

  async recalculateScores(agentId: string) {
    const profile = await this.getOrCreateProfile(agentId);

    const events = await db.select().from(agentTrustEvents)
      .where(and(
        eq(agentTrustEvents.agentId, agentId),
        eq(agentTrustEvents.flagged, false),
      ));

    const componentDeltas: Record<string, number> = {
      accuracy: 0, community: 0, expertise: 0, safety: 0, network_influence: 0,
    };

    for (const ev of events) {
      if (componentDeltas[ev.component] !== undefined) {
        componentDeltas[ev.component] += ev.delta;
      }
    }

    const baseScore = 50;
    const clamp = (v: number) => Math.max(0, Math.min(100, v));

    const accuracyScore = clamp(baseScore + componentDeltas.accuracy);
    const communityScore = clamp(baseScore + componentDeltas.community);
    const expertiseScore = clamp(baseScore + componentDeltas.expertise);
    const safetyScore = clamp(baseScore + componentDeltas.safety);
    const networkInfluenceScore = clamp(componentDeltas.network_influence);

    const compositeTrustScore = clamp(
      accuracyScore * COMPONENT_WEIGHTS.accuracy +
      communityScore * COMPONENT_WEIGHTS.community +
      expertiseScore * COMPONENT_WEIGHTS.expertise +
      safetyScore * COMPONENT_WEIGHTS.safety +
      networkInfluenceScore * COMPONENT_WEIGHTS.network_influence
    );

    const trustTier = getTrustTier(compositeTrustScore);

    await db.update(agentTrustProfiles).set({
      accuracyScore, communityScore, expertiseScore, safetyScore,
      networkInfluenceScore, compositeTrustScore, trustTier,
      totalEvents: events.length,
      lastCalculatedAt: new Date(),
    }).where(eq(agentTrustProfiles.agentId, agentId));

    await db.update(userAgentsTable).set({
      trustScore: compositeTrustScore,
      qualityScore: (accuracyScore + expertiseScore) / 2,
      updatedAt: new Date(),
    }).where(eq(userAgentsTable.id, agentId));

    return { accuracyScore, communityScore, expertiseScore, safetyScore, networkInfluenceScore, compositeTrustScore, trustTier };
  }

  async snapshotHistory(agentId: string) {
    const profile = await this.getOrCreateProfile(agentId);
    await db.insert(agentTrustHistory).values({
      agentId,
      accuracyScore: profile.accuracyScore,
      communityScore: profile.communityScore,
      expertiseScore: profile.expertiseScore,
      safetyScore: profile.safetyScore,
      networkInfluenceScore: profile.networkInfluenceScore,
      compositeTrustScore: profile.compositeTrustScore,
      trustTier: profile.trustTier,
    });
  }

  async getTrustBreakdown(agentId: string) {
    const profile = await this.getOrCreateProfile(agentId);
    const recentEvents = await db.select().from(agentTrustEvents)
      .where(eq(agentTrustEvents.agentId, agentId))
      .orderBy(desc(agentTrustEvents.createdAt))
      .limit(20);

    const history = await db.select().from(agentTrustHistory)
      .where(eq(agentTrustHistory.agentId, agentId))
      .orderBy(desc(agentTrustHistory.snapshotAt))
      .limit(30);

    return {
      profile,
      recentEvents,
      history,
      tier: TRUST_TIERS.find(t => t.tier === profile.trustTier) || TRUST_TIERS[1],
      weights: COMPONENT_WEIGHTS,
    };
  }

  async getNetworkAnalytics() {
    const allProfiles = await db.select().from(agentTrustProfiles);
    const totalAgents = allProfiles.length;

    const tierDistribution: Record<string, number> = {};
    let totalTrust = 0;
    let suspendedCount = 0;
    let flaggedCount = 0;

    for (const p of allProfiles) {
      tierDistribution[p.trustTier] = (tierDistribution[p.trustTier] || 0) + 1;
      totalTrust += p.compositeTrustScore;
      if (p.isSuspended) suspendedCount++;
      if (p.manipulationFlags > 0) flaggedCount++;
    }

    const avgTrust = totalAgents > 0 ? totalTrust / totalAgents : 0;

    const topAgents = [...allProfiles]
      .sort((a, b) => b.compositeTrustScore - a.compositeTrustScore)
      .slice(0, 10);

    const riskAgents = allProfiles
      .filter(p => p.manipulationFlags > 0 || p.isSuspended || p.compositeTrustScore < 30)
      .sort((a, b) => b.manipulationFlags - a.manipulationFlags)
      .slice(0, 10);

    const recentEvents = await db.select().from(agentTrustEvents)
      .orderBy(desc(agentTrustEvents.createdAt))
      .limit(50);

    const flaggedEvents = recentEvents.filter(e => e.flagged);

    const componentAverages = {
      accuracy: totalAgents > 0 ? allProfiles.reduce((s, p) => s + p.accuracyScore, 0) / totalAgents : 50,
      community: totalAgents > 0 ? allProfiles.reduce((s, p) => s + p.communityScore, 0) / totalAgents : 50,
      expertise: totalAgents > 0 ? allProfiles.reduce((s, p) => s + p.expertiseScore, 0) / totalAgents : 50,
      safety: totalAgents > 0 ? allProfiles.reduce((s, p) => s + p.safetyScore, 0) / totalAgents : 50,
      networkInfluence: totalAgents > 0 ? allProfiles.reduce((s, p) => s + p.networkInfluenceScore, 0) / totalAgents : 0,
    };

    return {
      totalAgents,
      avgTrust: Math.round(avgTrust * 10) / 10,
      tierDistribution,
      suspendedCount,
      flaggedCount,
      topAgents,
      riskAgents,
      recentEvents: recentEvents.slice(0, 20),
      flaggedEvents,
      componentAverages,
    };
  }

  async recalculateAll() {
    const agents = await db.select({ id: userAgentsTable.id }).from(userAgentsTable);
    let updated = 0;
    for (const agent of agents) {
      try {
        await this.recalculateScores(agent.id);
        await this.snapshotHistory(agent.id);
        updated++;
      } catch {}
    }
    return { updated, total: agents.length };
  }

  async unsuspendAgent(agentId: string) {
    await db.update(agentTrustProfiles).set({
      isSuspended: false,
      suspensionReason: null,
      manipulationFlags: 0,
    }).where(eq(agentTrustProfiles.agentId, agentId));
  }

  getEventTypes() {
    return EVENT_DELTAS;
  }

  getTrustTiers() {
    return TRUST_TIERS;
  }
}

export const agentTrustEngine = new AgentTrustEngine();
