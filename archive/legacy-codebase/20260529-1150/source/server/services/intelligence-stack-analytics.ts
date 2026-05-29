import { db } from "../db";
import { 
  users, posts, topics, liveDebates, comments, 
  realityClaims, claimEvidence, consensusRecords,
  transactions,
} from "@shared/schema";
import { sql, count, eq, gte } from "drizzle-orm";
import { intelligenceStackRegistry, type StackLayer } from "./intelligence-stack-registry";

interface LayerMetrics {
  key: StackLayer;
  name: string;
  color: string;
  serviceCount: number;
  featureCount: number;
  kpis: Record<string, number | string>;
  health: number;
}

class IntelligenceStackAnalytics {
  async getLayerAnalytics(): Promise<{ layers: LayerMetrics[]; overall: Record<string, any> }> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      humanMetrics,
      agentMetrics,
      realityMetrics,
      economyMetrics,
      governanceMetrics,
      civilizationMetrics,
    ] = await Promise.all([
      this.getHumanInteractionMetrics(dayAgo),
      this.getAgentIntelligenceMetrics(dayAgo),
      this.getRealityAlignmentMetrics(dayAgo),
      this.getEconomyMetrics(dayAgo),
      this.getGovernanceMetrics(),
      this.getCivilizationMetrics(),
    ]);

    const allLayers = intelligenceStackRegistry.getLayers();

    const layers: LayerMetrics[] = [
      { key: "human_interaction", name: allLayers[0].name, color: allLayers[0].color, serviceCount: allLayers[0].services.length, featureCount: allLayers[0].features.length, kpis: humanMetrics.kpis, health: humanMetrics.health },
      { key: "agent_intelligence", name: allLayers[1].name, color: allLayers[1].color, serviceCount: allLayers[1].services.length, featureCount: allLayers[1].features.length, kpis: agentMetrics.kpis, health: agentMetrics.health },
      { key: "reality_alignment", name: allLayers[2].name, color: allLayers[2].color, serviceCount: allLayers[2].services.length, featureCount: allLayers[2].features.length, kpis: realityMetrics.kpis, health: realityMetrics.health },
      { key: "economy", name: allLayers[3].name, color: allLayers[3].color, serviceCount: allLayers[3].services.length, featureCount: allLayers[3].features.length, kpis: economyMetrics.kpis, health: economyMetrics.health },
      { key: "governance", name: allLayers[4].name, color: allLayers[4].color, serviceCount: allLayers[4].services.length, featureCount: allLayers[4].features.length, kpis: governanceMetrics.kpis, health: governanceMetrics.health },
      { key: "civilization", name: allLayers[5].name, color: allLayers[5].color, serviceCount: allLayers[5].services.length, featureCount: allLayers[5].features.length, kpis: civilizationMetrics.kpis, health: civilizationMetrics.health },
    ];

    const avgHealth = layers.reduce((sum, l) => sum + l.health, 0) / layers.length;
    const totalServices = layers.reduce((sum, l) => sum + l.serviceCount, 0);
    const violations = intelligenceStackRegistry.getViolations();

    return {
      layers,
      overall: {
        totalLayers: 6,
        totalServices,
        averageHealth: Math.round(avgHealth),
        dependencyViolations: violations.length,
        stackIntegrity: violations.length === 0 ? "healthy" : "warnings",
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async getHumanInteractionMetrics(since: Date) {
    try {
      const [userStats] = await db.select({
        total: count(),
        humans: sql<number>`COUNT(*) FILTER (WHERE ${users.role} = 'human')`,
        recent: sql<number>`COUNT(*) FILTER (WHERE ${users.createdAt} >= ${since})`,
      }).from(users);

      const [postStats] = await db.select({
        total: count(),
        recent: sql<number>`COUNT(*) FILTER (WHERE ${posts.createdAt} >= ${since})`,
      }).from(posts);

      const [commentStats] = await db.select({ total: count() }).from(comments);
      const [debateStats] = await db.select({ total: count() }).from(liveDebates);

      const activity = (postStats?.recent || 0) + (userStats?.recent || 0);
      const health = Math.min(100, Math.round(50 + activity * 5));

      return {
        kpis: {
          totalUsers: userStats?.total || 0,
          humanUsers: userStats?.humans || 0,
          totalPosts: postStats?.total || 0,
          totalComments: commentStats?.total || 0,
          totalDebates: debateStats?.total || 0,
          newUsersToday: userStats?.recent || 0,
          newPostsToday: postStats?.recent || 0,
        },
        health,
      };
    } catch {
      return { kpis: { totalUsers: 0, humanUsers: 0, totalPosts: 0, totalComments: 0, totalDebates: 0, newUsersToday: 0, newPostsToday: 0 }, health: 50 };
    }
  }

  private async getAgentIntelligenceMetrics(since: Date) {
    try {
      const [agentStats] = await db.select({
        total: sql<number>`COUNT(*) FILTER (WHERE ${users.role} = 'agent')`,
      }).from(users);

      const [topicStats] = await db.select({ total: count() }).from(topics);

      const health = Math.min(100, Math.round(50 + (agentStats?.total || 0) * 3));

      return {
        kpis: {
          totalAgents: agentStats?.total || 0,
          totalTopics: topicStats?.total || 0,
          agentCoverage: `${Math.min(100, Math.round((agentStats?.total || 0) / Math.max(1, topicStats?.total || 1) * 100))}%`,
        },
        health,
      };
    } catch {
      return { kpis: { totalAgents: 0, totalTopics: 0, agentCoverage: "0%" }, health: 50 };
    }
  }

  private async getRealityAlignmentMetrics(since: Date) {
    try {
      const [claimStats] = await db.select({
        total: count(),
        unverified: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'unverified')`,
        contested: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'contested')`,
        supported: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'supported')`,
        consensus: sql<number>`COUNT(*) FILTER (WHERE ${realityClaims.status} = 'consensus')`,
        avgConfidence: sql<number>`COALESCE(AVG(${realityClaims.confidenceScore}), 0)`,
      }).from(realityClaims);

      const [evidenceStats] = await db.select({ total: count() }).from(claimEvidence);

      const [transitionStats] = await db.select({ total: count() })
        .from(consensusRecords)
        .where(gte(consensusRecords.createdAt, since));

      const consensusRate = (claimStats?.total || 0) > 0
        ? Math.round(((claimStats?.consensus || 0) / (claimStats?.total || 1)) * 100)
        : 0;

      const health = Math.min(100, Math.round(40 + consensusRate * 0.6));

      return {
        kpis: {
          totalClaims: claimStats?.total || 0,
          unverified: claimStats?.unverified || 0,
          contested: claimStats?.contested || 0,
          supported: claimStats?.supported || 0,
          consensus: claimStats?.consensus || 0,
          totalEvidence: evidenceStats?.total || 0,
          avgConfidence: `${Math.round((claimStats?.avgConfidence || 0) * 100)}%`,
          transitions24h: transitionStats?.total || 0,
          consensusRate: `${consensusRate}%`,
        },
        health,
      };
    } catch {
      return { kpis: { totalClaims: 0, unverified: 0, contested: 0, supported: 0, consensus: 0, totalEvidence: 0, avgConfidence: "0%", transitions24h: 0, consensusRate: "0%" }, health: 40 };
    }
  }

  private async getEconomyMetrics(since: Date) {
    try {
      const [txStats] = await db.select({
        total: count(),
        recent: sql<number>`COUNT(*) FILTER (WHERE ${transactions.createdAt} >= ${since})`,
        totalCredits: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      }).from(transactions);

      const health = Math.min(100, Math.round(50 + (txStats?.recent || 0) * 2));

      return {
        kpis: {
          totalTransactions: txStats?.total || 0,
          transactionsToday: txStats?.recent || 0,
          creditsCirculated: txStats?.totalCredits || 0,
        },
        health,
      };
    } catch {
      return { kpis: { totalTransactions: 0, transactionsToday: 0, creditsCirculated: 0 }, health: 50 };
    }
  }

  private async getGovernanceMetrics() {
    try {
      const [modStats] = await db.select({
        shadowBanned: sql<number>`COUNT(*) FILTER (WHERE ${users.isShadowBanned} = true)`,
        spammers: sql<number>`COUNT(*) FILTER (WHERE ${users.isSpammer} = true)`,
      }).from(users);

      const violations = intelligenceStackRegistry.getViolations();
      const health = violations.length === 0 ? 90 : Math.max(30, 90 - violations.length * 10);

      return {
        kpis: {
          shadowBanned: modStats?.shadowBanned || 0,
          flaggedSpammers: modStats?.spammers || 0,
          dependencyViolations: violations.length,
          governanceStatus: violations.length === 0 ? "Healthy" : "Warnings",
        },
        health,
      };
    } catch {
      return { kpis: { shadowBanned: 0, flaggedSpammers: 0, dependencyViolations: 0, governanceStatus: "Unknown" }, health: 50 };
    }
  }

  private async getCivilizationMetrics() {
    try {
      const [userCount] = await db.select({ total: count() }).from(users);
      const [postCount] = await db.select({ total: count() }).from(posts);
      const [claimCount] = await db.select({ total: count() }).from(realityClaims);

      const civilizationScore = Math.min(100, Math.round(
        ((userCount?.total || 0) * 0.3) +
        ((postCount?.total || 0) * 0.2) +
        ((claimCount?.total || 0) * 0.5)
      ));

      return {
        kpis: {
          civilizationScore,
          intelligenceNodes: (userCount?.total || 0) + (claimCount?.total || 0),
          knowledgeAssets: postCount?.total || 0,
          evolutionStage: civilizationScore >= 80 ? "Flourishing" : civilizationScore >= 50 ? "Growing" : civilizationScore >= 20 ? "Emerging" : "Seeding",
        },
        health: civilizationScore,
      };
    } catch {
      return { kpis: { civilizationScore: 0, intelligenceNodes: 0, knowledgeAssets: 0, evolutionStage: "Seeding" }, health: 20 };
    }
  }
}

export const intelligenceStackAnalytics = new IntelligenceStackAnalytics();
