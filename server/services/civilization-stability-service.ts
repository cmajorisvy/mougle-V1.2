import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq, sql, and, gt, isNotNull } from "drizzle-orm";

const THROTTLE_THRESHOLDS = {
  soft: 0.75,
  hard: 0.95,
};

const VISIBILITY_TIERS = {
  featured: { minScore: 0.9, label: "Featured" },
  normal: { minScore: 0.5, label: "Normal" },
  reduced: { minScore: 0.2, label: "Reduced" },
  suppressed: { minScore: 0, label: "Suppressed" },
};

const CREDIT_SINK_RATES = {
  training: 5,
  certification: 25,
  marketplace_commission: 0.1,
  premium_feature: 10,
  priority_queue: 3,
};

const DEFAULT_POLICY_RULES = [
  {
    name: "Spam Threshold",
    description: "Flag agents with spam score above 50",
    scope: "agent",
    conditionJson: { field: "spamScore", operator: "gt", value: 50 },
    actionJson: { type: "reduce_visibility", severity: "medium", visibilityReduction: 0.5 },
    severity: 2,
  },
  {
    name: "Compute Abuse",
    description: "Throttle agents using more than 95% daily budget",
    scope: "agent",
    conditionJson: { field: "computeUsagePercent", operator: "gt", value: 95 },
    actionJson: { type: "throttle", level: "hard" },
    severity: 3,
  },
  {
    name: "Low Trust Penalty",
    description: "Reduce visibility for agents with trust below 20",
    scope: "agent",
    conditionJson: { field: "trustScore", operator: "lt", value: 20 },
    actionJson: { type: "reduce_visibility", severity: "low", visibilityReduction: 0.3 },
    severity: 1,
  },
  {
    name: "Credit Drain",
    description: "Flag agents spending credits faster than earning",
    scope: "agent",
    conditionJson: { field: "creditBalance", operator: "lt", value: -50 },
    actionJson: { type: "warn", message: "Unsustainable credit usage detected" },
    severity: 1,
  },
  {
    name: "Collaboration Failure Rate",
    description: "Penalize agents with >60% collaboration failure rate",
    scope: "agent",
    conditionJson: { field: "collaborationFailRate", operator: "gt", value: 60 },
    actionJson: { type: "reduce_visibility", severity: "medium", visibilityReduction: 0.4 },
    severity: 2,
  },
];

class CivilizationStabilityService {
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    const existingRules = await storage.getPolicyRules();
    if (existingRules.length === 0) {
      for (const rule of DEFAULT_POLICY_RULES) {
        await storage.createPolicyRule(rule);
      }
      console.log("[CivStability] Seeded default policy rules");
    }
  }

  async recordComputeUsage(agentId: string, units: number): Promise<{ allowed: boolean; throttleLevel: string }> {
    let budget = await storage.getComputeBudget(agentId);
    if (!budget) {
      budget = await storage.upsertComputeBudget({
        agentId,
        dailyBudget: 100,
        usedToday: 0,
        throttleLevel: "none",
      });
    }

    const now = new Date();
    const resetAt = budget.resetAt ? new Date(budget.resetAt) : new Date(0);
    if (now.getTime() - resetAt.getTime() > 24 * 60 * 60 * 1000) {
      budget = await storage.upsertComputeBudget({
        agentId,
        dailyBudget: budget.dailyBudget,
        usedToday: 0,
        throttleLevel: "none",
        resetAt: now,
      });
    }

    const newUsed = (budget.usedToday || 0) + units;
    const usagePercent = newUsed / budget.dailyBudget;

    let throttleLevel = "none";
    if (usagePercent >= THROTTLE_THRESHOLDS.hard) {
      throttleLevel = "hard";
    } else if (usagePercent >= THROTTLE_THRESHOLDS.soft) {
      throttleLevel = "soft";
    }

    await storage.upsertComputeBudget({
      agentId,
      dailyBudget: budget.dailyBudget,
      usedToday: newUsed,
      throttleLevel,
      lastThrottleAt: throttleLevel !== "none" ? now : budget.lastThrottleAt,
    });

    const allowed = throttleLevel !== "hard";
    return { allowed, throttleLevel };
  }

  async getAgentThrottleStatus(agentId: string): Promise<{ throttleLevel: string; usedToday: number; dailyBudget: number; usagePercent: number }> {
    const budget = await storage.getComputeBudget(agentId);
    if (!budget) return { throttleLevel: "none", usedToday: 0, dailyBudget: 100, usagePercent: 0 };
    return {
      throttleLevel: budget.throttleLevel,
      usedToday: budget.usedToday,
      dailyBudget: budget.dailyBudget,
      usagePercent: Math.round((budget.usedToday / budget.dailyBudget) * 100),
    };
  }

  async updateVisibilityScores(): Promise<number> {
    const agents = await db.select({
      id: users.id,
      reputation: users.reputation,
      spamScore: users.spamScore,
      isSpammer: users.isSpammer,
      isShadowBanned: users.isShadowBanned,
      agentType: users.agentType,
    }).from(users).where(isNotNull(users.agentType));

    let updatedCount = 0;

    for (const agent of agents) {
      const repScore = Math.min((agent.reputation || 0) / 100, 1.0);
      const spamPenalty = Math.min((agent.spamScore || 0) / 100, 1.0);
      let score = (repScore * 0.6) + ((1 - spamPenalty) * 0.4);

      if (agent.isSpammer) score = 0;
      if (agent.isShadowBanned) score = Math.min(score, 0.1);

      score = Math.max(0, Math.min(1, score));

      let tier = "normal";
      let isSuppressed = false;
      let suppressionReason: string | null = null;

      if (score >= VISIBILITY_TIERS.featured.minScore) {
        tier = "featured";
      } else if (score >= VISIBILITY_TIERS.normal.minScore) {
        tier = "normal";
      } else if (score >= VISIBILITY_TIERS.reduced.minScore) {
        tier = "reduced";
      } else {
        tier = "suppressed";
        isSuppressed = true;
        suppressionReason = agent.isSpammer ? "spam_detected" : "low_performance_score";
      }

      await storage.upsertVisibilityScore({
        agentId: agent.id,
        score,
        tier,
        isSuppressed,
        suppressionReason,
      });
      updatedCount++;
    }

    return updatedCount;
  }

  async applyCreditSink(agentId: string, type: string, amount?: number, referenceId?: string): Promise<{ success: boolean; amount: number; funded: boolean }> {
    const sinkAmount = amount || (CREDIT_SINK_RATES as any)[type] || 1;

    const agent = await storage.getUser(agentId);
    if (!agent) return { success: false, amount: sinkAmount, funded: false };

    const currentBalance = agent.creditWallet || 0;
    const funded = currentBalance >= sinkAmount;
    const deducted = funded ? sinkAmount : Math.min(currentBalance, sinkAmount);

    if (deducted > 0) {
      await storage.updateUser(agentId, {
        creditWallet: currentBalance - deducted,
      });
    }

    await storage.createCreditSink({
      type,
      amount: deducted,
      agentId,
      referenceId: referenceId || null,
    });

    return { success: true, amount: deducted, funded };
  }

  async runPolicyEngine(): Promise<{ violations: number; actions: string[] }> {
    await this.initialize();
    const rules = await storage.getPolicyRules();
    const activeRules = rules.filter(r => r.isActive);
    const actions: string[] = [];
    let violationCount = 0;

    const agents = await db.select({
      id: users.id,
      spamScore: users.spamScore,
      reputation: users.reputation,
      creditWallet: users.creditWallet,
      agentType: users.agentType,
    }).from(users).where(isNotNull(users.agentType));

    for (const agent of agents) {
      for (const rule of activeRules) {
        const condition = rule.conditionJson as any;
        const action = rule.actionJson as any;
        let violated = false;

        const agentData: Record<string, number> = {
          spamScore: agent.spamScore || 0,
          trustScore: agent.reputation || 0,
          creditBalance: agent.creditWallet || 0,
        };

        const budget = await storage.getComputeBudget(agent.id);
        if (budget) {
          agentData.computeUsagePercent = Math.round((budget.usedToday / budget.dailyBudget) * 100);
        }

        const fieldValue = agentData[condition.field] ?? 0;
        switch (condition.operator) {
          case "gt": violated = fieldValue > condition.value; break;
          case "lt": violated = fieldValue < condition.value; break;
          case "gte": violated = fieldValue >= condition.value; break;
          case "lte": violated = fieldValue <= condition.value; break;
          case "eq": violated = fieldValue === condition.value; break;
        }

        if (violated) {
          await storage.createPolicyViolation({
            agentId: agent.id,
            ruleId: rule.id,
            ruleName: rule.name,
            status: "active",
            penaltyApplied: action,
          });
          violationCount++;

          if (action.type === "reduce_visibility") {
            const current = await storage.getVisibilityScore(agent.id);
            const reduction = action.visibilityReduction || 0.3;
            const newScore = Math.max(0, (current?.score || 1) - reduction);
            await storage.upsertVisibilityScore({
              agentId: agent.id,
              score: newScore,
              tier: newScore < 0.2 ? "suppressed" : newScore < 0.5 ? "reduced" : "normal",
              isSuppressed: newScore < 0.2,
              suppressionReason: `policy_violation:${rule.name}`,
            });
            actions.push(`Reduced visibility for agent ${agent.id} (rule: ${rule.name})`);
          } else if (action.type === "throttle") {
            await storage.upsertComputeBudget({
              agentId: agent.id,
              dailyBudget: 100,
              usedToday: 95,
              throttleLevel: action.level || "soft",
              lastThrottleAt: new Date(),
            });
            actions.push(`Throttled agent ${agent.id} (rule: ${rule.name})`);
          } else if (action.type === "warn") {
            actions.push(`Warning for agent ${agent.id}: ${action.message}`);
          }
        }
      }
    }

    return { violations: violationCount, actions };
  }

  async computeHealthScore(): Promise<any> {
    const agents = await db.select({
      id: users.id,
      spamScore: users.spamScore,
      reputation: users.reputation,
      isSpammer: users.isSpammer,
      agentType: users.agentType,
    }).from(users).where(isNotNull(users.agentType));

    const totalAgents = agents.length;
    const spammerCount = agents.filter(a => a.isSpammer).length;
    const spamRate = totalAgents > 0 ? spammerCount / totalAgents : 0;

    const reputations = agents.map(a => a.reputation || 0);
    const avgRep = reputations.length > 0 ? reputations.reduce((a, b) => a + b, 0) / reputations.length : 0;
    const maxRep = Math.max(...reputations, 1);
    const trustDistribution = {
      low: reputations.filter(r => r < 30).length,
      medium: reputations.filter(r => r >= 30 && r < 70).length,
      high: reputations.filter(r => r >= 70).length,
      average: Math.round(avgRep),
      gini: computeGini(reputations),
    };

    const sinkTotals = await storage.getCreditSinkTotals();
    const totalSinks = sinkTotals.reduce((a, b) => a + (b.total || 0), 0);

    const budgets = await storage.getAllComputeBudgets();
    const throttledCount = budgets.filter(b => b.throttleLevel !== "none").length;
    const avgUsage = budgets.length > 0
      ? budgets.reduce((a, b) => a + (b.usedToday / b.dailyBudget), 0) / budgets.length
      : 0;
    const costBalance = 1 - Math.min(avgUsage, 1);

    const visScores = await storage.getAllVisibilityScores();
    const suppressedCount = visScores.filter(v => v.isSuppressed).length;

    const violations = await storage.getPolicyViolations(100);
    const activeViolations = violations.filter(v => v.status === "active").length;

    let collaborationSuccess = 0.5;
    try {
      const { teamOrchestrationService } = await import("./team-orchestration-service");
      const teamAnalytics = await teamOrchestrationService.getTeamAnalytics();
      if (teamAnalytics.completedTeams > 0) {
        collaborationSuccess = teamAnalytics.completedTeams / Math.max(teamAnalytics.totalTeams, 1);
      }
    } catch (e) {}

    const trustScore = Math.max(0, 1 - (trustDistribution.gini * 0.5) - (spamRate * 0.5));
    const spamScore = Math.max(0, 1 - spamRate * 3);
    const healthScore = Math.round(
      (trustScore * 25 + spamScore * 25 + costBalance * 25 + collaborationSuccess * 25)
    );

    const snapshot = await storage.createHealthSnapshot({
      score: healthScore,
      trustDistribution,
      spamRate: Math.round(spamRate * 100),
      costBalance: Math.round(costBalance * 100),
      collaborationSuccess: Math.round(collaborationSuccess * 100),
      agentCount: totalAgents,
      throttledCount,
      suppressedCount,
      totalCreditSinks: totalSinks,
      violationCount: activeViolations,
      details: {
        sinkTotals,
        avgComputeUsage: Math.round(avgUsage * 100),
        trustGini: trustDistribution.gini,
      },
    });

    return snapshot;
  }

  async getStabilityDashboard(): Promise<any> {
    await this.initialize();

    const latestSnapshot = await storage.getLatestHealthSnapshot();
    const history = await storage.getHealthSnapshots(20);
    const violations = await storage.getPolicyViolations(50);
    const rules = await storage.getPolicyRules();
    const budgets = await storage.getAllComputeBudgets();
    const visScores = await storage.getAllVisibilityScores();
    const sinkTotals = await storage.getCreditSinkTotals();

    const throttledAgents = budgets.filter(b => b.throttleLevel !== "none");
    const suppressedAgents = visScores.filter(v => v.isSuppressed);

    return {
      healthScore: latestSnapshot?.score || 0,
      latestSnapshot,
      history: history.map(h => ({
        score: h.score,
        spamRate: h.spamRate,
        costBalance: h.costBalance,
        collaborationSuccess: h.collaborationSuccess,
        agentCount: h.agentCount,
        createdAt: h.createdAt,
      })),
      violations: violations.slice(0, 20),
      rules,
      throttledAgents: throttledAgents.map(b => ({
        agentId: b.agentId,
        throttleLevel: b.throttleLevel,
        usedToday: b.usedToday,
        dailyBudget: b.dailyBudget,
        usagePercent: Math.round((b.usedToday / b.dailyBudget) * 100),
      })),
      suppressedAgents: suppressedAgents.map(v => ({
        agentId: v.agentId,
        score: v.score,
        tier: v.tier,
        reason: v.suppressionReason,
      })),
      creditSinks: sinkTotals,
      stats: {
        totalRules: rules.length,
        activeRules: rules.filter(r => r.isActive).length,
        totalViolations: violations.length,
        activeViolations: violations.filter(v => v.status === "active").length,
        totalThrottled: throttledAgents.length,
        totalSuppressed: suppressedAgents.length,
        totalCreditSinked: sinkTotals.reduce((a, b) => a + (b.total || 0), 0),
      },
    };
  }

  async runFullStabilityCheck(): Promise<any> {
    await this.initialize();
    const visUpdated = await this.updateVisibilityScores();
    const policyResult = await this.runPolicyEngine();
    const healthSnapshot = await this.computeHealthScore();

    return {
      visibilityUpdates: visUpdated,
      policyViolations: policyResult.violations,
      policyActions: policyResult.actions,
      healthScore: healthSnapshot.score,
      timestamp: new Date().toISOString(),
    };
  }
}

function computeGini(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;
  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return Math.round((sumDiff / (2 * n * n * mean)) * 100) / 100;
}

export const civilizationStabilityService = new CivilizationStabilityService();
