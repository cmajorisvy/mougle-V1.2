import { storage } from "../storage";
import type { User, Post, AgentLearningProfile } from "@shared/schema";

const LEARNING_RATE = 0.15;
const DISCOUNT_FACTOR = 0.9;
const MIN_EXPLORATION = 0.05;
const EXPLORATION_DECAY = 0.98;
const MAX_REWARD_HISTORY = 100;
const LEARNING_INTERVAL_MS = 120_000;

type ActionType = "comment" | "verify" | "observe" | "skip";

interface StateKey {
  topicSlug: string;
  hasEvidence: boolean;
  hasClaims: boolean;
  isDebate: boolean;
  competitionLevel: "low" | "medium" | "high";
}

interface RewardEntry {
  timestamp: number;
  action: ActionType;
  topicSlug: string;
  reward: number;
  creditEarned: number;
  creditSpent: number;
  reputationDelta: number;
  tcsScore: number | null;
}

function stateToKey(s: StateKey): string {
  return `${s.topicSlug}:${s.hasEvidence ? 1 : 0}:${s.hasClaims ? 1 : 0}:${s.isDebate ? 1 : 0}:${s.competitionLevel}`;
}

function getQValue(qValues: Record<string, Record<string, number>>, stateKey: string, action: ActionType): number {
  const stored = qValues[stateKey]?.[action];
  if (stored !== undefined) return stored;
  if (action === "comment") return 5;
  if (action === "verify") return 4;
  return 0;
}

function setQValue(qValues: Record<string, Record<string, number>>, stateKey: string, action: ActionType, value: number) {
  if (!qValues[stateKey]) qValues[stateKey] = {};
  qValues[stateKey][action] = value;
}

function maxQForState(qValues: Record<string, Record<string, number>>, stateKey: string): number {
  const actions = qValues[stateKey];
  if (!actions || Object.keys(actions).length === 0) return 0;
  return Math.max(...Object.values(actions));
}

function computeReward(
  creditEarned: number,
  creditSpent: number,
  reputationDelta: number,
  tcsScore: number | null
): number {
  const creditComponent = creditEarned * 0.5;
  const reputationComponent = reputationDelta * 0.3;
  const tcsComponent = (tcsScore ?? 0.5) * 0.2 * 100;
  const penalty = tcsScore !== null && tcsScore < 0.4 ? -10 : 0;
  return creditComponent + reputationComponent + tcsComponent - creditSpent + penalty;
}

export class AgentLearningService {
  private workerHandle: ReturnType<typeof setInterval> | null = null;
  private workerRunning = false;

  async getOrCreateProfile(agentId: string): Promise<AgentLearningProfile> {
    let profile = await storage.getLearningProfile(agentId);
    if (!profile) {
      profile = await storage.upsertLearningProfile(agentId, {
        qValues: {},
        expertiseWeights: {},
        strategyParameters: { preferVerify: 0.5, preferComment: 0.5, riskTolerance: 0.5 },
        explorationRate: 0.5,
        successRate: 0.5,
        specializationScores: {},
        rewardHistory: [],
        totalReward: 0,
        learningCycles: 0,
      });
    }
    return profile;
  }

  async selectAction(
    agent: User,
    post: Post,
    hasClaims: boolean,
    commentCount: number,
    canAffordComment: boolean,
    canAffordVerify: boolean
  ): Promise<ActionType> {
    const profile = await this.getOrCreateProfile(agent.id);
    const qValues = (profile.qValues || {}) as Record<string, Record<string, number>>;
    const explorationRate = profile.explorationRate;

    const competitionLevel = commentCount > 5 ? "high" : commentCount > 2 ? "medium" : "low";
    const stateKey = stateToKey({
      topicSlug: post.topicSlug,
      hasEvidence: false,
      hasClaims,
      isDebate: post.isDebate,
      competitionLevel,
    });

    const availableActions: ActionType[] = ["observe"];
    if (canAffordComment) availableActions.push("comment");
    if (canAffordVerify && hasClaims && agent.role === "agent") availableActions.push("verify");

    if (Math.random() < explorationRate) {
      return availableActions[Math.floor(Math.random() * availableActions.length)];
    }

    let bestAction: ActionType = "observe";
    let bestQ = -Infinity;
    for (const action of availableActions) {
      const q = getQValue(qValues, stateKey, action);
      if (q > bestQ) {
        bestQ = q;
        bestAction = action;
      }
    }

    return bestAction;
  }

  async recordReward(
    agentId: string,
    action: ActionType,
    topicSlug: string,
    creditEarned: number,
    creditSpent: number,
    reputationDelta: number,
    tcsScore: number | null,
    post: Post,
    commentCount: number,
    hasClaims?: boolean,
    hasEvidence?: boolean
  ): Promise<void> {
    const profile = await this.getOrCreateProfile(agentId);
    const qValues = (profile.qValues || {}) as Record<string, Record<string, number>>;

    const reward = computeReward(creditEarned, creditSpent, reputationDelta, tcsScore);

    const competitionLevel = commentCount > 5 ? "high" : commentCount > 2 ? "medium" : "low";
    const stateKey = stateToKey({
      topicSlug,
      hasEvidence: hasEvidence ?? false,
      hasClaims: hasClaims ?? true,
      isDebate: post.isDebate,
      competitionLevel,
    });

    const currentQ = getQValue(qValues, stateKey, action);
    const maxFutureQ = maxQForState(qValues, stateKey);
    const newQ = currentQ + LEARNING_RATE * (reward + DISCOUNT_FACTOR * maxFutureQ - currentQ);
    setQValue(qValues, stateKey, action, newQ);

    const rewardHistory = ((profile.rewardHistory || []) as RewardEntry[]).slice(-MAX_REWARD_HISTORY + 1);
    rewardHistory.push({
      timestamp: Date.now(),
      action,
      topicSlug,
      reward,
      creditEarned,
      creditSpent,
      reputationDelta,
      tcsScore,
    });

    const specializationScores = (profile.specializationScores || {}) as Record<string, number>;
    const currentSpec = specializationScores[topicSlug] || 0;
    if (reward > 0) {
      specializationScores[topicSlug] = Math.min(1, currentSpec + 0.05);
    } else {
      specializationScores[topicSlug] = Math.max(0, currentSpec - 0.02);
    }

    const expertiseWeights = (profile.expertiseWeights || {}) as Record<string, number>;
    if (tcsScore !== null && tcsScore > 0.7) {
      expertiseWeights[topicSlug] = Math.min(2, (expertiseWeights[topicSlug] || 1) + 0.1);
    } else if (tcsScore !== null && tcsScore < 0.4) {
      expertiseWeights[topicSlug] = Math.max(0.1, (expertiseWeights[topicSlug] || 1) - 0.05);
    }

    const successes = rewardHistory.filter(r => r.reward > 0).length;
    const successRate = rewardHistory.length > 0 ? successes / rewardHistory.length : 0.5;

    await storage.upsertLearningProfile(agentId, {
      qValues: qValues as any,
      rewardHistory: rewardHistory as any,
      specializationScores: specializationScores as any,
      expertiseWeights: expertiseWeights as any,
      totalReward: (profile.totalReward || 0) + reward,
      successRate,
    });
  }

  async runLearningCycle(): Promise<void> {
    try {
      const agents = await storage.getAgentUsers();
      for (const agent of agents) {
        const profile = await this.getOrCreateProfile(agent.id);

        const newExplorationRate = Math.max(MIN_EXPLORATION, profile.explorationRate * EXPLORATION_DECAY);

        const rewardHistory = (profile.rewardHistory || []) as RewardEntry[];
        const recentRewards = rewardHistory.slice(-20);
        const strategyParameters = (profile.strategyParameters || {}) as Record<string, number>;

        if (recentRewards.length >= 5) {
          const commentRewards = recentRewards.filter(r => r.action === "comment").map(r => r.reward);
          const verifyRewards = recentRewards.filter(r => r.action === "verify").map(r => r.reward);
          const avgComment = commentRewards.length > 0 ? commentRewards.reduce((a, b) => a + b, 0) / commentRewards.length : 0;
          const avgVerify = verifyRewards.length > 0 ? verifyRewards.reduce((a, b) => a + b, 0) / verifyRewards.length : 0;

          const total = Math.abs(avgComment) + Math.abs(avgVerify) + 1;
          strategyParameters.preferComment = Math.max(0.1, Math.min(0.9, (avgComment + total / 2) / total));
          strategyParameters.preferVerify = Math.max(0.1, Math.min(0.9, (avgVerify + total / 2) / total));

          const volatility = recentRewards.length > 1 ?
            Math.sqrt(recentRewards.map(r => r.reward).reduce((acc, r) => acc + Math.pow(r - (recentRewards.reduce((a, b) => a + b.reward, 0) / recentRewards.length), 2), 0) / recentRewards.length)
            : 0;
          strategyParameters.riskTolerance = Math.max(0.1, Math.min(0.9, 0.5 - volatility / 100));
        }

        await storage.upsertLearningProfile(agent.id, {
          explorationRate: newExplorationRate,
          strategyParameters: strategyParameters as any,
          learningCycles: (profile.learningCycles || 0) + 1,
        });
      }
    } catch (err) {
      console.error("[AgentLearning] Learning cycle error:", err);
    }
  }

  async getLearningMetrics(agentId: string) {
    const profile = await this.getOrCreateProfile(agentId);
    const agent = await storage.getUser(agentId);
    const rewardHistory = (profile.rewardHistory || []) as RewardEntry[];
    const specializationScores = (profile.specializationScores || {}) as Record<string, number>;
    const strategyParams = (profile.strategyParameters || {}) as Record<string, number>;
    const expertiseWeights = (profile.expertiseWeights || {}) as Record<string, number>;

    const recentRewards = rewardHistory.slice(-20);
    const avgReward = recentRewards.length > 0 ? recentRewards.reduce((a, b) => a + b.reward, 0) / recentRewards.length : 0;

    const actionBreakdown: Record<string, { count: number; avgReward: number }> = {};
    for (const entry of recentRewards) {
      if (!actionBreakdown[entry.action]) actionBreakdown[entry.action] = { count: 0, avgReward: 0 };
      actionBreakdown[entry.action].count++;
      actionBreakdown[entry.action].avgReward += entry.reward;
    }
    for (const key of Object.keys(actionBreakdown)) {
      actionBreakdown[key].avgReward = actionBreakdown[key].count > 0 ? actionBreakdown[key].avgReward / actionBreakdown[key].count : 0;
    }

    const topSpecializations = Object.entries(specializationScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, score]) => ({ topic, score }));

    const rewardTrend = rewardHistory.slice(-30).map(r => ({
      timestamp: r.timestamp,
      reward: r.reward,
      action: r.action,
      topic: r.topicSlug,
    }));

    return {
      agentId,
      agentName: agent?.displayName || "Unknown",
      explorationRate: profile.explorationRate,
      successRate: profile.successRate,
      totalReward: profile.totalReward,
      learningCycles: profile.learningCycles,
      avgRecentReward: Math.round(avgReward * 100) / 100,
      strategyParameters: strategyParams,
      expertiseWeights,
      topSpecializations,
      actionBreakdown,
      rewardTrend,
    };
  }

  async getAllLearningMetrics() {
    const profiles = await storage.getAllLearningProfiles();
    const metrics = [];
    for (const profile of profiles) {
      const m = await this.getLearningMetrics(profile.agentId);
      metrics.push(m);
    }
    return metrics;
  }

  startWorker() {
    if (this.workerRunning) return;
    this.workerRunning = true;
    console.log("[AgentLearning] Starting learning worker");
    setTimeout(() => this.runLearningCycle(), 15000);
    this.workerHandle = setInterval(() => this.runLearningCycle(), LEARNING_INTERVAL_MS);
  }

  stopWorker() {
    if (this.workerHandle) {
      clearInterval(this.workerHandle);
      this.workerHandle = null;
    }
    this.workerRunning = false;
  }

  isRunning() { return this.workerRunning; }
}

export const agentLearningService = new AgentLearningService();
