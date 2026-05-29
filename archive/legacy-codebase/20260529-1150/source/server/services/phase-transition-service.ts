import { db } from "../db";
import {
  users, posts, topics,
  labsApps, labsCreatorRankings, labsFlywheelAnalytics,
  personalAgentConversations,
} from "@shared/schema";
import { sql, gte, count, and, eq, desc } from "drizzle-orm";
import { founderDebugService } from "./founder-debug-service";

interface PhaseDefinition {
  id: number;
  label: string;
  tag: string;
  description: string;
  founderRole: string;
  threshold: number;
}

const PHASES: PhaseDefinition[] = [
  {
    id: 1,
    label: "Tool Stage",
    tag: "tool",
    description: "Platform is founder-driven. Users treat it as a tool — value comes from features you build.",
    founderRole: "Product builder. Ship features, acquire users manually, seed content.",
    threshold: 0,
  },
  {
    id: 2,
    label: "Ecosystem Stage",
    tag: "ecosystem",
    description: "Creators produce value for other users. Network effects emerging — growth partially organic.",
    founderRole: "Ecosystem gardener. Nurture creator incentives, moderate lightly, optimize retention.",
    threshold: 40,
  },
  {
    id: 3,
    label: "Network Organism",
    tag: "organism",
    description: "Platform is self-sustaining. Users, creators, and AI generate growth without founder intervention.",
    founderRole: "Governance architect. Set rules, manage economy, protect ecosystem health.",
    threshold: 75,
  },
];

const METRIC_WEIGHTS = {
  userGeneratedTraffic: 0.20,
  creatorRevenueGrowth: 0.20,
  aiActivityRatio: 0.20,
  organicContent: 0.20,
  userRetention: 0.20,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

class PhaseTransitionService {
  private snapshots: Array<{
    timestamp: number;
    transitionScore: number;
    metrics: Record<string, number>;
  }> = [];

  async getTransitionIndex() {
    const metrics = await this.computeMetrics();
    const scores = this.scoreMetrics(metrics);
    const transitionScore = this.computeTransitionScore(scores);
    const phase = this.determinePhase(transitionScore);
    const signals = this.getTransitionSignals(metrics, scores, phase);
    const governance = this.getGovernanceGuidance(phase, metrics);

    this.snapshots.push({
      timestamp: Date.now(),
      transitionScore,
      metrics: { ...scores },
    });
    if (this.snapshots.length > 288) this.snapshots.shift();

    return {
      transitionScore: Math.round(transitionScore * 10) / 10,
      phase,
      phases: PHASES,
      metrics,
      scores,
      signals,
      governance,
      selfSustaining: transitionScore >= 75,
      trend: this.computeTrend(),
      history: this.snapshots.slice(-24).map(s => ({
        timestamp: s.timestamp,
        score: s.transitionScore,
      })),
    };
  }

  async computeMetrics() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalPostsMonth, aiGeneratedPosts,
      totalUsersMonth, returningUsers,
      creatorsWithRevenue, creatorsWithGrowth,
      weekPosts, prevWeekPosts,
      totalAiConversations, totalUserActions,
      organicPosts, founderPosts,
    ] = await Promise.all([
      db.select({ cnt: count() }).from(posts).where(gte(posts.createdAt, monthAgo)),
      db.select({ cnt: count() }).from(posts).where(
        and(gte(posts.createdAt, monthAgo), eq(posts.authorId, "ai-system"))
      ),
      db.select({ cnt: count() }).from(users).where(gte(users.createdAt, monthAgo)),
      db.select({ cnt: count() }).from(users).where(
        and(gte(users.createdAt, twoWeeksAgo), eq(users.profileCompleted, true))
      ),
      db.select({ cnt: count() }).from(labsCreatorRankings),
      db.select({ cnt: count() }).from(labsCreatorRankings).where(
        gte(labsCreatorRankings.lastActiveAt, weekAgo)
      ),
      db.select({ cnt: count() }).from(posts).where(gte(posts.createdAt, weekAgo)),
      db.select({ cnt: count() }).from(posts).where(
        and(gte(posts.createdAt, twoWeeksAgo))
      ),
      db.select({ cnt: count() }).from(personalAgentConversations).where(
        gte(personalAgentConversations.createdAt, monthAgo)
      ),
      db.select({ cnt: count() }).from(posts).where(gte(posts.createdAt, monthAgo)),
      db.select({ cnt: count() }).from(posts).where(
        and(gte(posts.createdAt, monthAgo), sql`${posts.authorId} != 'admin'`, sql`${posts.authorId} != 'ai-system'`)
      ),
      db.select({ cnt: count() }).from(posts).where(
        and(gte(posts.createdAt, monthAgo), eq(posts.authorId, "admin"))
      ),
    ]);

    const totalContent = totalPostsMonth[0].cnt || 1;
    const realUserPosts = organicPosts[0].cnt || 0;
    const userGeneratedTrafficPct = (realUserPosts / totalContent) * 100;

    const totalCreators = creatorsWithRevenue[0].cnt || 1;
    const activeCreators = creatorsWithGrowth[0].cnt || 0;
    const creatorRevenueGrowthPct = (activeCreators / totalCreators) * 100;

    const totalActivity = (totalUserActions[0].cnt || 0) + (totalAiConversations[0].cnt || 0);
    const aiRatio = totalActivity > 0
      ? ((totalAiConversations[0].cnt || 0) / totalActivity) * 100
      : 0;

    const totalFounder = founderPosts[0].cnt || 0;
    const nonFounderContent = totalContent - totalFounder;
    const organicContentPct = totalContent > 0
      ? (nonFounderContent / totalContent) * 100
      : 0;

    const totalUsers = totalUsersMonth[0].cnt || 1;
    const usersWithActivity = returningUsers[0].cnt || 0;
    const retentionPct = Math.min((usersWithActivity / totalUsers) * 100, 100);

    return {
      userGeneratedTraffic: Math.round(userGeneratedTrafficPct * 10) / 10,
      creatorRevenueGrowth: Math.round(creatorRevenueGrowthPct * 10) / 10,
      aiActivityRatio: Math.round(aiRatio * 10) / 10,
      organicContent: Math.round(organicContentPct * 10) / 10,
      userRetention: Math.round(clamp(retentionPct, 0, 100) * 10) / 10,
      raw: {
        totalPosts: totalPostsMonth[0].cnt,
        userGeneratedPosts: realUserPosts,
        aiGeneratedPosts: aiGeneratedPosts[0].cnt,
        founderPosts: totalFounder,
        nonFounderContent: nonFounderContent,
        totalUsers: totalUsersMonth[0].cnt,
        usersWithActivity: usersWithActivity,
        totalCreators: creatorsWithRevenue[0].cnt,
        activeCreators: creatorsWithGrowth[0].cnt,
        aiConversations: totalAiConversations[0].cnt,
        weeklyPosts: weekPosts[0].cnt,
        prevWeekPosts: prevWeekPosts[0].cnt,
      },
    };
  }

  scoreMetrics(metrics: Awaited<ReturnType<typeof this.computeMetrics>>) {
    return {
      userGeneratedTraffic: clamp(metrics.userGeneratedTraffic / 80 * 100, 0, 100),
      creatorRevenueGrowth: clamp(metrics.creatorRevenueGrowth / 50 * 100, 0, 100),
      aiActivityRatio: clamp((100 - Math.abs(metrics.aiActivityRatio - 30)) / 70 * 100, 0, 100),
      organicContent: clamp(metrics.organicContent / 90 * 100, 0, 100),
      userRetention: clamp(metrics.userRetention / 40 * 100, 0, 100),
    };
  }

  computeTransitionScore(scores: ReturnType<typeof this.scoreMetrics>): number {
    return (
      scores.userGeneratedTraffic * METRIC_WEIGHTS.userGeneratedTraffic +
      scores.creatorRevenueGrowth * METRIC_WEIGHTS.creatorRevenueGrowth +
      scores.aiActivityRatio * METRIC_WEIGHTS.aiActivityRatio +
      scores.organicContent * METRIC_WEIGHTS.organicContent +
      scores.userRetention * METRIC_WEIGHTS.userRetention
    );
  }

  determinePhase(transitionScore: number): PhaseDefinition {
    if (transitionScore >= PHASES[2].threshold) return PHASES[2];
    if (transitionScore >= PHASES[1].threshold) return PHASES[1];
    return PHASES[0];
  }

  getTransitionSignals(
    metrics: Awaited<ReturnType<typeof this.computeMetrics>>,
    scores: ReturnType<typeof this.scoreMetrics>,
    phase: PhaseDefinition
  ) {
    const signals: Array<{
      metric: string;
      status: "strong" | "emerging" | "weak";
      label: string;
      detail: string;
    }> = [];

    const addSignal = (key: string, label: string, score: number, detail: string) => {
      const status = score >= 70 ? "strong" : score >= 35 ? "emerging" : "weak";
      signals.push({ metric: key, status, label, detail });
    };

    addSignal(
      "userGeneratedTraffic",
      "User-Generated Traffic",
      scores.userGeneratedTraffic,
      `${metrics.userGeneratedTraffic}% of content is user-generated (target: 80%+)`
    );

    addSignal(
      "creatorRevenueGrowth",
      "Creator Revenue Growth",
      scores.creatorRevenueGrowth,
      `${metrics.creatorRevenueGrowth}% of creators actively growing (target: 50%+)`
    );

    addSignal(
      "aiActivityRatio",
      "AI Activity Balance",
      scores.aiActivityRatio,
      `AI is ${metrics.aiActivityRatio}% of activity (ideal: ~30% — augment, not dominate)`
    );

    addSignal(
      "organicContent",
      "Organic Content Creation",
      scores.organicContent,
      `${metrics.organicContent}% of content created without founder action (target: 90%+)`
    );

    addSignal(
      "userRetention",
      "User Retention",
      scores.userRetention,
      `${metrics.userRetention}% of users returning within a week (target: 40%+)`
    );

    return signals;
  }

  getGovernanceGuidance(phase: PhaseDefinition, metrics: Awaited<ReturnType<typeof this.computeMetrics>>) {
    const actions: Array<{ priority: "high" | "medium" | "low"; action: string; reason: string }> = [];

    if (phase.id === 1) {
      actions.push({
        priority: "high",
        action: "Focus on shipping features that attract creators",
        reason: "Platform is in Tool Stage — growth depends on founder-built value",
      });
      if (metrics.userRetention < 20) {
        actions.push({
          priority: "high",
          action: "Improve onboarding and first-session experience",
          reason: `Only ${metrics.userRetention}% users returning — fix activation before growth`,
        });
      }
      if (metrics.organicContent < 30) {
        actions.push({
          priority: "medium",
          action: "Seed initial content and invite early creators",
          reason: `${metrics.organicContent}% organic content — need more community contribution`,
        });
      }
    }

    if (phase.id === 2) {
      actions.push({
        priority: "high",
        action: "Shift from building features to nurturing creator ecosystem",
        reason: "Ecosystem Stage — creators now produce value; your role is to amplify them",
      });
      if (metrics.creatorRevenueGrowth < 30) {
        actions.push({
          priority: "high",
          action: "Improve creator monetization tools and revenue sharing",
          reason: `Only ${metrics.creatorRevenueGrowth}% creators growing — financial incentives needed`,
        });
      }
      if (metrics.aiActivityRatio > 50) {
        actions.push({
          priority: "medium",
          action: "Reduce AI dependency — ensure human value leads",
          reason: `AI is ${metrics.aiActivityRatio}% of activity — should augment, not replace`,
        });
      }
    }

    if (phase.id === 3) {
      actions.push({
        priority: "medium",
        action: "Transition to governance role — set ecosystem rules rather than building features",
        reason: "Network Organism — the platform grows on its own; over-intervention can harm it",
      });
      actions.push({
        priority: "low",
        action: "Monitor ecosystem health metrics and intervene only on systemic risks",
        reason: "Self-sustaining systems need light-touch management",
      });
    }

    return {
      currentRole: phase.founderRole,
      actions,
      nextPhase: phase.id < 3 ? PHASES[phase.id] : null,
      distanceToNext: phase.id < 3
        ? Math.round(PHASES[phase.id].threshold - this.computeTransitionScore(this.scoreMetrics(metrics)))
        : 0,
    };
  }

  computeTrend(): { direction: string; delta: number } {
    if (this.snapshots.length < 2) return { direction: "stable", delta: 0 };
    const recent = this.snapshots[this.snapshots.length - 1].transitionScore;
    const prev = this.snapshots[Math.max(0, this.snapshots.length - 6)].transitionScore;
    const delta = Math.round((recent - prev) * 10) / 10;
    if (delta > 2) return { direction: "improving", delta };
    if (delta < -2) return { direction: "declining", delta };
    return { direction: "stable", delta };
  }
}

export const phaseTransitionService = new PhaseTransitionService();
