import { storage } from "../storage";
import { db } from "../db";
import { users as usersTable, intelligenceXpLogs } from "@shared/schema";
import { eq, sql, desc, and, gte } from "drizzle-orm";

type IntelligenceStage = "explorer" | "assistant_user" | "power_user" | "agent_creator" | "agent_entrepreneur" | "ai_collaborator" | "digital_architect";

interface StageDefinition {
  id: IntelligenceStage;
  label: string;
  xpRequired: number;
  description: string;
  features: string[];
}

const STAGES: StageDefinition[] = [
  {
    id: "explorer",
    label: "Explorer",
    xpRequired: 0,
    description: "Discovering the platform and its basic features",
    features: ["Browse topics", "Read posts", "Basic profile", "View debates"],
  },
  {
    id: "assistant_user",
    label: "Intelligence User",
    xpRequired: 100,
    description: "Using intelligence features for discussions and insights",
    features: ["AI-powered insights", "Post creation", "Comment with analysis", "Join debates"],
  },
  {
    id: "power_user",
    label: "Power User",
    xpRequired: 500,
    description: "Advanced engagement with reputation and verification",
    features: ["Trust scoring", "Verification voting", "Reputation tracking", "Advanced analytics"],
  },
  {
    id: "agent_creator",
    label: "Entity Creator",
    xpRequired: 1500,
    description: "Building and training custom intelligent entities",
    features: ["Create entities", "Entity training", "Custom system prompts", "Entity skill trees"],
  },
  {
    id: "agent_entrepreneur",
    label: "Entity Entrepreneur",
    xpRequired: 4000,
    description: "Monetizing and scaling intelligent entity operations",
    features: ["Intelligence Exchange", "Credit economy", "Entity billing", "Revenue analytics"],
  },
  {
    id: "ai_collaborator",
    label: "Intelligence Collaborator",
    xpRequired: 8000,
    description: "Orchestrating multi-entity collaboration teams",
    features: ["Multi-entity teams", "Collaboration workflows", "Task orchestration", "Team analytics"],
  },
  {
    id: "digital_architect",
    label: "Digital Architect",
    xpRequired: 15000,
    description: "Full platform mastery with governance and architecture access",
    features: ["Governance voting", "Network dashboard", "Founder analytics", "Platform flywheel", "Civilization metrics"],
  },
];

const XP_SOURCES: Record<string, { amount: number; dailyLimit: number; label: string }> = {
  conversation: { amount: 5, dailyLimit: 50, label: "Conversations" },
  post_create: { amount: 15, dailyLimit: 75, label: "Creating Posts" },
  comment: { amount: 5, dailyLimit: 50, label: "Commenting" },
  memory_usage: { amount: 3, dailyLimit: 30, label: "Memory Usage" },
  daily_login: { amount: 10, dailyLimit: 10, label: "Daily Login" },
  agent_create: { amount: 50, dailyLimit: 100, label: "Creating Agents" },
  agent_train: { amount: 20, dailyLimit: 60, label: "Training Agents" },
  debate_participate: { amount: 25, dailyLimit: 75, label: "Debate Participation" },
  debate_create: { amount: 30, dailyLimit: 60, label: "Creating Debates" },
  verification: { amount: 10, dailyLimit: 50, label: "Verification" },
  collaboration: { amount: 15, dailyLimit: 45, label: "Team Collaboration" },
  trust_action: { amount: 8, dailyLimit: 40, label: "Trust Actions" },
};

const FEATURE_FLAGS: Record<string, IntelligenceStage> = {
  browse_topics: "explorer",
  read_posts: "explorer",
  basic_profile: "explorer",
  view_debates: "explorer",
  ai_insights: "assistant_user",
  create_posts: "assistant_user",
  comment_analysis: "assistant_user",
  join_debates: "assistant_user",
  trust_scoring: "power_user",
  verification_voting: "power_user",
  reputation_tracking: "power_user",
  advanced_analytics: "power_user",
  create_agents: "agent_creator",
  agent_training: "agent_creator",
  custom_prompts: "agent_creator",
  skill_trees: "agent_creator",
  agent_marketplace: "agent_entrepreneur",
  credit_economy: "agent_entrepreneur",
  agent_billing: "agent_entrepreneur",
  revenue_analytics: "agent_entrepreneur",
  multi_agent_teams: "ai_collaborator",
  collaboration_workflows: "ai_collaborator",
  task_orchestration: "ai_collaborator",
  team_analytics: "ai_collaborator",
  governance_voting: "digital_architect",
  network_dashboard: "digital_architect",
  founder_analytics: "digital_architect",
  platform_flywheel: "digital_architect",
  civilization_metrics: "digital_architect",
};

function getStageIndex(stage: IntelligenceStage): number {
  return STAGES.findIndex(s => s.id === stage);
}

function getStageForXp(xp: number): IntelligenceStage {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (xp >= STAGES[i].xpRequired) return STAGES[i].id;
  }
  return "explorer";
}

class IntelligenceRoadmapService {
  getStages(): StageDefinition[] {
    return STAGES;
  }

  async getUserProgress(userId: string): Promise<{
    currentStage: StageDefinition;
    currentXp: number;
    nextStage: StageDefinition | null;
    xpToNext: number;
    progressPercent: number;
    unlockedFeatures: string[];
    stageHistory: StageDefinition[];
  }> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const stage = (user.intelligenceStage || "explorer") as IntelligenceStage;
    const xp = user.intelligenceXp || 0;
    const stageIdx = getStageIndex(stage);
    const currentStage = STAGES[stageIdx] || STAGES[0];
    const nextStage = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;

    const xpToNext = nextStage ? nextStage.xpRequired - xp : 0;
    const progressPercent = nextStage
      ? Math.min(100, Math.round(((xp - currentStage.xpRequired) / (nextStage.xpRequired - currentStage.xpRequired)) * 100))
      : 100;

    const unlockedFeatures: string[] = [];
    for (let i = 0; i <= stageIdx; i++) {
      unlockedFeatures.push(...STAGES[i].features);
    }

    const stageHistory = STAGES.slice(0, stageIdx + 1);

    return { currentStage, currentXp: xp, nextStage, xpToNext, progressPercent, unlockedFeatures, stageHistory };
  }

  async awardXp(userId: string, source: string, description?: string): Promise<{
    xpAwarded: number;
    newTotal: number;
    stageChanged: boolean;
    newStage?: string;
  }> {
    const srcConfig = XP_SOURCES[source];
    if (!srcConfig) return { xpAwarded: 0, newTotal: 0, stageChanged: false };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [dailyResult] = await db.select({ total: sql<number>`COALESCE(SUM(${intelligenceXpLogs.xpAmount}), 0)` })
      .from(intelligenceXpLogs)
      .where(and(
        eq(intelligenceXpLogs.userId, userId),
        eq(intelligenceXpLogs.source, source),
        gte(intelligenceXpLogs.createdAt, startOfDay)
      ));

    const dailyUsed = Number(dailyResult?.total || 0);
    if (dailyUsed >= srcConfig.dailyLimit) {
      return { xpAwarded: 0, newTotal: 0, stageChanged: false };
    }

    const xpToAward = Math.min(srcConfig.amount, srcConfig.dailyLimit - dailyUsed);

    await db.insert(intelligenceXpLogs).values({
      userId,
      source,
      xpAmount: xpToAward,
      description: description || srcConfig.label,
    });

    const [updated] = await db.update(usersTable)
      .set({ intelligenceXp: sql`${usersTable.intelligenceXp} + ${xpToAward}` })
      .where(eq(usersTable.id, userId))
      .returning({ intelligenceXp: usersTable.intelligenceXp, intelligenceStage: usersTable.intelligenceStage });

    const newXp = updated.intelligenceXp;
    const currentStage = updated.intelligenceStage as IntelligenceStage;
    const correctStage = getStageForXp(newXp);

    let stageChanged = false;
    if (correctStage !== currentStage && getStageIndex(correctStage) > getStageIndex(currentStage)) {
      await db.update(usersTable)
        .set({ intelligenceStage: correctStage })
        .where(eq(usersTable.id, userId));
      stageChanged = true;
    }

    return { xpAwarded: xpToAward, newTotal: newXp, stageChanged, newStage: stageChanged ? correctStage : undefined };
  }

  isFeatureUnlocked(userStage: string, featureFlag: string): boolean {
    const requiredStage = FEATURE_FLAGS[featureFlag];
    if (!requiredStage) return true;
    return getStageIndex(userStage as IntelligenceStage) >= getStageIndex(requiredStage);
  }

  getFeatureFlags(userStage: string): Record<string, boolean> {
    const flags: Record<string, boolean> = {};
    for (const [feature, requiredStage] of Object.entries(FEATURE_FLAGS)) {
      flags[feature] = getStageIndex(userStage as IntelligenceStage) >= getStageIndex(requiredStage);
    }
    return flags;
  }

  async getXpBreakdown(userId: string, days = 30): Promise<{
    sources: Record<string, { total: number; label: string; dailyLimit: number }>;
    recentLogs: Array<{ source: string; xpAmount: number; description: string | null; createdAt: Date | null }>;
    totalXp: number;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await db.select()
      .from(intelligenceXpLogs)
      .where(and(
        eq(intelligenceXpLogs.userId, userId),
        gte(intelligenceXpLogs.createdAt, since)
      ))
      .orderBy(desc(intelligenceXpLogs.createdAt))
      .limit(100);

    const sources: Record<string, { total: number; label: string; dailyLimit: number }> = {};
    for (const [key, config] of Object.entries(XP_SOURCES)) {
      sources[key] = { total: 0, label: config.label, dailyLimit: config.dailyLimit };
    }
    for (const log of logs) {
      if (sources[log.source]) sources[log.source].total += log.xpAmount;
    }

    const user = await storage.getUser(userId);
    return { sources, recentLogs: logs.slice(0, 20), totalXp: user?.intelligenceXp || 0 };
  }

  async getLeaderboard(limit = 20): Promise<Array<{
    id: string;
    displayName: string;
    username: string;
    stage: string;
    xp: number;
  }>> {
    const topUsers = await db.select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
      stage: usersTable.intelligenceStage,
      xp: usersTable.intelligenceXp,
    })
      .from(usersTable)
      .where(eq(usersTable.role, "human"))
      .orderBy(desc(usersTable.intelligenceXp))
      .limit(limit);

    return topUsers;
  }

  getXpSources() {
    return XP_SOURCES;
  }
}

export const intelligenceRoadmapService = new IntelligenceRoadmapService();
