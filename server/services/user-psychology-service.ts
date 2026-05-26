import { db } from "../db";
import { users as usersTable, userPsychologyProfiles, psychologySnapshots, personalAgentMessages, personalAgentMemories, personalAgentUsage, intelligenceXpLogs, posts as postsTable, comments as commentsTable } from "@shared/schema";
import { eq, sql, desc, and, gte, count } from "drizzle-orm";

type PsychologyStage = "curious" | "exploring" | "engaged" | "invested" | "habitual" | "advocate" | "dependent";

interface StageDefinition {
  id: PsychologyStage;
  label: string;
  description: string;
  thresholds: {
    minEngagementScore: number;
    minReturnFrequency: number;
    minConversationsPerDay: number;
    minMemorySaves: number;
    minPersonalAgentUsage: number;
  };
  nudge: string;
}

const PSYCHOLOGY_STAGES: StageDefinition[] = [
  {
    id: "curious",
    label: "Curious Visitor",
    description: "Just discovered the platform",
    thresholds: { minEngagementScore: 0, minReturnFrequency: 0, minConversationsPerDay: 0, minMemorySaves: 0, minPersonalAgentUsage: 0 },
    nudge: "Welcome! Try starting a conversation to see what the platform can do.",
  },
  {
    id: "exploring",
    label: "Active Explorer",
    description: "Trying out features and engaging with content",
    thresholds: { minEngagementScore: 10, minReturnFrequency: 0.1, minConversationsPerDay: 0.5, minMemorySaves: 0, minPersonalAgentUsage: 0 },
    nudge: "You're discovering great features. Try saving a memory to personalize your experience.",
  },
  {
    id: "engaged",
    label: "Engaged Member",
    description: "Regular participation and feature usage",
    thresholds: { minEngagementScore: 30, minReturnFrequency: 0.3, minConversationsPerDay: 1, minMemorySaves: 3, minPersonalAgentUsage: 1 },
    nudge: "Your assistant is learning your preferences. The more you share, the smarter it gets.",
  },
  {
    id: "invested",
    label: "Invested User",
    description: "Deep engagement with personalized experiences",
    thresholds: { minEngagementScore: 55, minReturnFrequency: 0.5, minConversationsPerDay: 2, minMemorySaves: 10, minPersonalAgentUsage: 5 },
    nudge: "Your personal AI knows you well. Have you tried voice conversations?",
  },
  {
    id: "habitual",
    label: "Daily Habit",
    description: "Platform is part of daily routine",
    thresholds: { minEngagementScore: 75, minReturnFrequency: 0.7, minConversationsPerDay: 3, minMemorySaves: 25, minPersonalAgentUsage: 15 },
    nudge: "You're a power user! Your AI assistant evolves with every interaction.",
  },
  {
    id: "advocate",
    label: "Platform Advocate",
    description: "High engagement with community leadership",
    thresholds: { minEngagementScore: 90, minReturnFrequency: 0.85, minConversationsPerDay: 5, minMemorySaves: 50, minPersonalAgentUsage: 30 },
    nudge: "You're shaping the platform's intelligence. Your contributions matter.",
  },
  {
    id: "dependent",
    label: "Core Member",
    description: "Deep platform integration into workflow",
    thresholds: { minEngagementScore: 98, minReturnFrequency: 0.95, minConversationsPerDay: 8, minMemorySaves: 100, minPersonalAgentUsage: 60 },
    nudge: "You and your AI are in perfect sync. Together, unstoppable.",
  },
];

function getStageIndex(stageId: string): number {
  return PSYCHOLOGY_STAGES.findIndex(s => s.id === stageId);
}

function calculateStage(metrics: {
  engagementScore: number;
  returnFrequency: number;
  conversationsPerDay: number;
  memorySaves: number;
  personalAgentUsage: number;
}): PsychologyStage {
  let bestStage: PsychologyStage = "curious";
  for (const stage of PSYCHOLOGY_STAGES) {
    const t = stage.thresholds;
    const meetsAll =
      metrics.engagementScore >= t.minEngagementScore &&
      metrics.returnFrequency >= t.minReturnFrequency &&
      metrics.conversationsPerDay >= t.minConversationsPerDay &&
      metrics.memorySaves >= t.minMemorySaves &&
      metrics.personalAgentUsage >= t.minPersonalAgentUsage;
    if (meetsAll) bestStage = stage.id;
  }
  return bestStage;
}

function calculateRetentionRisk(metrics: {
  returnFrequency: number;
  streakDays: number;
  engagementScore: number;
  daysSinceLastActive: number;
}): "low" | "medium" | "high" | "critical" | "neutral" {
  if (metrics.daysSinceLastActive > 14) return "critical";
  if (metrics.daysSinceLastActive > 7) return "high";
  if (metrics.returnFrequency < 0.2 && metrics.engagementScore < 20) return "high";
  if (metrics.returnFrequency < 0.4 && metrics.engagementScore < 40) return "medium";
  if (metrics.returnFrequency > 0.6 && metrics.streakDays > 3) return "low";
  return "neutral";
}

function calculateEngagementScore(metrics: {
  conversationsPerDay: number;
  memorySaves: number;
  returnFrequency: number;
  personalAgentUsage: number;
  featureUnlockStage: string;
  streakDays: number;
}): number {
  const stageWeights: Record<string, number> = {
    explorer: 0, assistant_user: 5, power_user: 12, agent_creator: 20,
    agent_entrepreneur: 30, ai_collaborator: 40, digital_architect: 50,
  };
  const convScore = Math.min(metrics.conversationsPerDay * 8, 25);
  const memoryScore = Math.min(metrics.memorySaves * 0.5, 15);
  const returnScore = metrics.returnFrequency * 20;
  const agentScore = Math.min(metrics.personalAgentUsage * 0.3, 15);
  const stageScore = stageWeights[metrics.featureUnlockStage] || 0;
  const streakBonus = Math.min(metrics.streakDays * 0.5, 10);
  const rawScore = convScore + memoryScore + returnScore + agentScore + stageScore + streakBonus;
  return Math.min(Math.round(rawScore * 10) / 10, 100);
}

class UserPsychologyService {
  getStages(): StageDefinition[] {
    return PSYCHOLOGY_STAGES;
  }

  async getOrCreateProfile(userId: string) {
    const [existing] = await db.select().from(userPsychologyProfiles).where(eq(userPsychologyProfiles.userId, userId)).limit(1);
    if (existing) return existing;
    const [created] = await db.insert(userPsychologyProfiles).values({ userId }).returning();
    return created;
  }

  async computeMetrics(userId: string) {
    const profile = await this.getOrCreateProfile(userId);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [conversationCount] = await db.select({ count: count() }).from(personalAgentMessages)
      .where(and(eq(personalAgentMessages.userId, userId), eq(personalAgentMessages.role, "user"), gte(personalAgentMessages.createdAt, sevenDaysAgo)));
    const convPerDay = (conversationCount?.count || 0) / 7;

    const [memoryCount] = await db.select({ count: count() }).from(personalAgentMemories)
      .where(eq(personalAgentMemories.userId, userId));

    const [postCount] = await db.select({ count: count() }).from(postsTable)
      .where(and(eq(postsTable.authorId, userId), gte(postsTable.createdAt, thirtyDaysAgo)));
    const [commentCount] = await db.select({ count: count() }).from(commentsTable)
      .where(and(eq(commentsTable.authorId, userId), gte(commentsTable.createdAt, thirtyDaysAgo)));

    const [agentUsageCount] = await db.select({ count: count() }).from(personalAgentMessages)
      .where(and(eq(personalAgentMessages.userId, userId), eq(personalAgentMessages.role, "user"), gte(personalAgentMessages.createdAt, thirtyDaysAgo)));

    const activeDayRows = await db.select({ day: sql<string>`DATE(${intelligenceXpLogs.createdAt})` })
      .from(intelligenceXpLogs)
      .where(and(eq(intelligenceXpLogs.userId, userId), gte(intelligenceXpLogs.createdAt, thirtyDaysAgo)));
    const activeDays = Math.max(1, new Set(activeDayRows.map(r => r.day)).size);
    const returnFreq = Math.min(activeDays / 30, 1);

    const [user] = await db.select({ intelligenceStage: usersTable.intelligenceStage }).from(usersTable).where(eq(usersTable.id, userId));
    const featureStage = user?.intelligenceStage || "explorer";

    const engagementScore = calculateEngagementScore({
      conversationsPerDay: convPerDay,
      memorySaves: memoryCount?.count || 0,
      returnFrequency: returnFreq,
      personalAgentUsage: agentUsageCount?.count || 0,
      featureUnlockStage: featureStage,
      streakDays: profile.streakDays,
    });

    const newStage = calculateStage({
      engagementScore,
      returnFrequency: returnFreq,
      conversationsPerDay: convPerDay,
      memorySaves: memoryCount?.count || 0,
      personalAgentUsage: agentUsageCount?.count || 0,
    });

    const daysSinceActive = profile.lastActiveAt
      ? Math.floor((now.getTime() - new Date(profile.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
      : 30;

    const retentionRisk = calculateRetentionRisk({
      returnFrequency: returnFreq,
      streakDays: profile.streakDays,
      engagementScore,
      daysSinceLastActive: daysSinceActive,
    });

    await db.update(userPsychologyProfiles)
      .set({
        psychologyStage: newStage,
        conversationsPerDay: Math.round(convPerDay * 100) / 100,
        memorySaves: memoryCount?.count || 0,
        returnFrequency: Math.round(returnFreq * 100) / 100,
        personalAgentUsage: agentUsageCount?.count || 0,
        featureUnlockStage: featureStage,
        engagementScore,
        retentionRisk,
        updatedAt: now,
      })
      .where(eq(userPsychologyProfiles.userId, userId));

    return {
      ...profile,
      psychologyStage: newStage,
      conversationsPerDay: Math.round(convPerDay * 100) / 100,
      memorySaves: memoryCount?.count || 0,
      returnFrequency: Math.round(returnFreq * 100) / 100,
      personalAgentUsage: agentUsageCount?.count || 0,
      featureUnlockStage: featureStage,
      engagementScore,
      retentionRisk,
    };
  }

  async getUserIndicators(userId: string) {
    const profile = await this.computeMetrics(userId);
    const stageIdx = getStageIndex(profile.psychologyStage);
    const currentStage = PSYCHOLOGY_STAGES[stageIdx];
    const nextStage = PSYCHOLOGY_STAGES[stageIdx + 1] || null;

    let progressToNext = 100;
    if (nextStage) {
      const currentThresh = currentStage.thresholds.minEngagementScore;
      const nextThresh = nextStage.thresholds.minEngagementScore;
      const range = nextThresh - currentThresh;
      progressToNext = range > 0 ? Math.min(Math.round(((profile.engagementScore - currentThresh) / range) * 100), 100) : 0;
    }

    return {
      stage: {
        id: currentStage.id,
        label: currentStage.label,
        description: currentStage.description,
        nudge: currentStage.nudge,
      },
      nextStage: nextStage ? { id: nextStage.id, label: nextStage.label } : null,
      progressToNext,
      metrics: {
        engagementScore: profile.engagementScore,
        streakDays: profile.streakDays,
        longestStreak: profile.longestStreak,
        conversationsPerDay: profile.conversationsPerDay,
        memorySaves: profile.memorySaves,
        returnFrequency: profile.returnFrequency,
      },
      growthIndicators: this.getGrowthIndicators(profile),
    };
  }

  private getGrowthIndicators(profile: any) {
    const indicators: { icon: string; label: string; value: string; trend: "up" | "stable" | "new" }[] = [];
    if (profile.streakDays >= 3) {
      indicators.push({ icon: "flame", label: "Active Streak", value: `${profile.streakDays} days`, trend: "up" });
    }
    if (profile.memorySaves > 0) {
      indicators.push({ icon: "brain", label: "AI Memory", value: `${profile.memorySaves} saved`, trend: profile.memorySaves > 5 ? "up" : "new" });
    }
    if (profile.conversationsPerDay >= 1) {
      indicators.push({ icon: "message", label: "Daily Conversations", value: `${profile.conversationsPerDay}/day`, trend: "up" });
    }
    if (profile.engagementScore > 0) {
      indicators.push({ icon: "chart", label: "Engagement", value: `${Math.round(profile.engagementScore)}%`, trend: profile.engagementScore > 50 ? "up" : "stable" });
    }
    if (profile.longestStreak > 5) {
      indicators.push({ icon: "trophy", label: "Best Streak", value: `${profile.longestStreak} days`, trend: "stable" });
    }
    return indicators;
  }

  async getFounderAnalytics() {
    const profiles = await db.select().from(userPsychologyProfiles);
    const stageDistribution: Record<string, number> = {};
    const riskDistribution: Record<string, number> = {};
    let totalEngagement = 0;
    let totalReturn = 0;
    let totalConv = 0;

    for (const p of profiles) {
      stageDistribution[p.psychologyStage] = (stageDistribution[p.psychologyStage] || 0) + 1;
      riskDistribution[p.retentionRisk] = (riskDistribution[p.retentionRisk] || 0) + 1;
      totalEngagement += p.engagementScore;
      totalReturn += p.returnFrequency;
      totalConv += p.conversationsPerDay;
    }

    const total = profiles.length || 1;
    const stageFlow = PSYCHOLOGY_STAGES.map(s => ({
      id: s.id,
      label: s.label,
      count: stageDistribution[s.id] || 0,
      percentage: Math.round(((stageDistribution[s.id] || 0) / total) * 100),
    }));

    const recentSnapshots = await db.select().from(psychologySnapshots)
      .orderBy(desc(psychologySnapshots.snapshotDate)).limit(30);

    return {
      totalTracked: profiles.length,
      avgEngagementScore: Math.round((totalEngagement / total) * 10) / 10,
      avgReturnFrequency: Math.round((totalReturn / total) * 100) / 100,
      avgConversationsPerDay: Math.round((totalConv / total) * 100) / 100,
      stageFlow,
      riskDistribution: {
        low: riskDistribution["low"] || 0,
        neutral: riskDistribution["neutral"] || 0,
        medium: riskDistribution["medium"] || 0,
        high: riskDistribution["high"] || 0,
        critical: riskDistribution["critical"] || 0,
      },
      topUsers: profiles
        .sort((a, b) => b.engagementScore - a.engagementScore)
        .slice(0, 10)
        .map(p => ({
          userId: p.userId,
          stage: p.psychologyStage,
          engagementScore: p.engagementScore,
          streakDays: p.streakDays,
          returnFrequency: p.returnFrequency,
        })),
      historicalSnapshots: recentSnapshots.reverse(),
    };
  }

  async takeSnapshot() {
    const profiles = await db.select().from(userPsychologyProfiles);
    const stageDistribution: Record<string, number> = {};
    const riskDistribution: Record<string, number> = {};
    let totalEngagement = 0;
    let totalReturn = 0;
    let totalConv = 0;

    for (const p of profiles) {
      stageDistribution[p.psychologyStage] = (stageDistribution[p.psychologyStage] || 0) + 1;
      riskDistribution[p.retentionRisk] = (riskDistribution[p.retentionRisk] || 0) + 1;
      totalEngagement += p.engagementScore;
      totalReturn += p.returnFrequency;
      totalConv += p.conversationsPerDay;
    }

    const total = profiles.length || 1;
    const [snapshot] = await db.insert(psychologySnapshots).values({
      totalUsers: profiles.length,
      stageDistribution,
      avgEngagementScore: Math.round((totalEngagement / total) * 10) / 10,
      avgReturnFrequency: Math.round((totalReturn / total) * 100) / 100,
      avgConversationsPerDay: Math.round((totalConv / total) * 100) / 100,
      retentionRiskDistribution: riskDistribution,
      stageTransitions: [],
    }).returning();

    return snapshot;
  }

  async recordActivity(userId: string) {
    const profile = await this.getOrCreateProfile(userId);
    const now = new Date();
    const daysSinceActive = profile.lastActiveAt
      ? Math.floor((now.getTime() - new Date(profile.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
      : 30;

    let streakDays = profile.streakDays;
    if (daysSinceActive === 0) {
      // Same day, no change
    } else if (daysSinceActive === 1) {
      streakDays = profile.streakDays + 1;
    } else {
      streakDays = 1;
    }
    const longestStreak = Math.max(profile.longestStreak, streakDays);
    const totalSessions = profile.totalSessions + 1;

    await db.update(userPsychologyProfiles)
      .set({ lastActiveAt: now, streakDays, longestStreak, totalSessions, updatedAt: now })
      .where(eq(userPsychologyProfiles.userId, userId));
  }
}

export const userPsychologyService = new UserPsychologyService();
