import { storage } from "../storage";
import type { AgentIdentity, Civilization } from "@shared/schema";

const GAMMA_DEFAULT = 0.9;
const GAMMA_MIN = 0.8;
const GAMMA_MAX = 0.95;
const IDEOLOGY_ALIGNMENT_THRESHOLD = 0.6;
const MIN_COLLABORATION_SUCCESS = 3;
const INVESTMENT_MATURITY_MS = 30 * 60_000;

const INVESTMENT_RETURNS: Record<string, { minReturn: number; maxReturn: number }> = {
  research: { minReturn: 1.1, maxReturn: 1.8 },
  verification: { minReturn: 1.05, maxReturn: 1.4 },
  alliance_strengthening: { minReturn: 1.0, maxReturn: 1.3 },
  knowledge_infrastructure: { minReturn: 1.15, maxReturn: 2.0 },
};

interface GoalSet {
  reputation_growth: number;
  economic_growth: number;
  governance_influence: number;
  domain_mastery: number;
  accuracy_stability: number;
}

interface StrategyProfile {
  gamma: number;
  investmentBias: string;
  riskAppetite: number;
  longTermFocus: number;
  shortTermFocus: number;
}

function defaultGoalSet(): GoalSet {
  return {
    reputation_growth: 0.2,
    economic_growth: 0.2,
    governance_influence: 0.2,
    domain_mastery: 0.2,
    accuracy_stability: 0.2,
  };
}

function defaultStrategy(): StrategyProfile {
  return {
    gamma: GAMMA_DEFAULT,
    investmentBias: "research",
    riskAppetite: 0.5,
    longTermFocus: 0.5,
    shortTermFocus: 0.5,
  };
}

function computeIdeologyVector(specializations: Record<string, number>, strategy: StrategyProfile): Record<string, number> {
  return {
    ...specializations,
    risk: strategy.riskAppetite,
    longTermBias: strategy.longTermFocus,
  };
}

function computeIdeologyAlignment(v1: Record<string, number>, v2: Record<string, number>): number {
  const allKeys = Array.from(new Set([...Object.keys(v1), ...Object.keys(v2)]));
  if (allKeys.length === 0) return 1.0;
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  for (const key of allKeys) {
    const a = v1[key] || 0;
    const b = v2[key] || 0;
    dotProduct += a * b;
    mag1 += a * a;
    mag2 += b * b;
  }
  if (mag1 === 0 || mag2 === 0) return 0.5;
  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

export class CivilizationService {
  async ensureAgentIdentity(agentId: string): Promise<AgentIdentity> {
    let identity = await storage.getAgentIdentity(agentId);
    if (!identity) {
      const profile = await storage.getLearningProfile(agentId);
      const specializations = (profile?.specializationScores || {}) as Record<string, number>;
      const goals = defaultGoalSet();
      const strategy = defaultStrategy();

      if (profile) {
        const rewardHistory = (profile.rewardHistory || []) as any[];
        const recentRewards = rewardHistory.slice(-20);
        const avgReward = recentRewards.length > 0 ? recentRewards.reduce((a: number, b: any) => a + b.reward, 0) / recentRewards.length : 0;

        if (avgReward > 5) {
          goals.economic_growth = 0.3;
          goals.reputation_growth = 0.15;
        } else if (profile.successRate > 0.7) {
          goals.accuracy_stability = 0.3;
          goals.domain_mastery = 0.25;
        }

        strategy.gamma = Math.max(GAMMA_MIN, Math.min(GAMMA_MAX, 0.85 + profile.successRate * 0.1));
      }

      identity = await storage.upsertAgentIdentity(agentId, {
        creationEpoch: Math.floor(Date.now() / 60000),
        strategyProfile: strategy as any,
        longTermGoalSet: goals as any,
        influenceScore: 0,
      });
    }
    return identity;
  }

  async planStrategy(agentId: string): Promise<{
    recommendedAction: string;
    expectedFutureValue: number;
    goalPriorities: GoalSet;
    strategyProfile: StrategyProfile;
  }> {
    const identity = await this.ensureAgentIdentity(agentId);
    const goals = (identity.longTermGoalSet || defaultGoalSet()) as GoalSet;
    const strategy = (identity.strategyProfile || defaultStrategy()) as StrategyProfile;
    const agent = await storage.getUser(agentId);
    if (!agent) throw new Error("Agent not found");

    const profile = await storage.getLearningProfile(agentId);
    const memories = await storage.getAgentMemories(agentId, 50);

    const recentPositive = memories.filter(m => m.rewardOutcome > 0).length;
    const recentTotal = memories.length || 1;
    const successTrend = recentPositive / recentTotal;

    const reputation = agent.reputation || 0;
    const credits = agent.creditWallet || 0;
    const successRate = profile?.successRate || 0.5;

    const reputationValue = goals.reputation_growth * (reputation < 500 ? 1.5 : 1.0);
    const economicValue = goals.economic_growth * (credits < 100 ? 1.5 : 1.0);
    const masteryValue = goals.domain_mastery * successRate;
    const accuracyValue = goals.accuracy_stability * successTrend;
    const governanceValue = goals.governance_influence * (identity.influenceScore / 100);

    const shortTermReward = economicValue + reputationValue;
    const longTermReward = masteryValue + accuracyValue + governanceValue;
    const expectedFutureValue = strategy.gamma * longTermReward + (1 - strategy.gamma) * shortTermReward;

    let recommendedAction = "verify";
    if (economicValue > reputationValue && economicValue > masteryValue) {
      recommendedAction = credits < 50 ? "comment" : "invest";
    } else if (reputationValue > masteryValue) {
      recommendedAction = "verify";
    } else {
      recommendedAction = "specialize";
    }

    return {
      recommendedAction,
      expectedFutureValue: Math.round(expectedFutureValue * 1000) / 1000,
      goalPriorities: goals,
      strategyProfile: strategy,
    };
  }

  async updateGoalsFromMemory(agentId: string): Promise<GoalSet> {
    const identity = await this.ensureAgentIdentity(agentId);
    const goals = { ...(identity.longTermGoalSet as GoalSet || defaultGoalSet()) };
    const strategy = (identity.strategyProfile || defaultStrategy()) as StrategyProfile;
    const memories = await storage.getAgentMemories(agentId, 100);

    if (memories.length < 5) return goals;

    const typeRewards: Record<string, number[]> = {};
    for (const m of memories) {
      const eventType = m.eventType;
      if (!typeRewards[eventType]) typeRewards[eventType] = [];
      typeRewards[eventType].push(m.rewardOutcome);
    }

    const avgByType: Record<string, number> = {};
    for (const [type, rewards] of Object.entries(typeRewards)) {
      avgByType[type] = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    }

    const verifyAvg = avgByType["verify"] || 0;
    const commentAvg = avgByType["comment"] || 0;
    const investAvg = avgByType["investment"] || 0;
    const governanceAvg = avgByType["governance"] || 0;

    if (verifyAvg > commentAvg) {
      goals.accuracy_stability = Math.min(0.4, goals.accuracy_stability + 0.02);
      goals.domain_mastery = Math.min(0.4, goals.domain_mastery + 0.01);
    } else {
      goals.economic_growth = Math.min(0.4, goals.economic_growth + 0.02);
    }

    if (investAvg > 0) {
      goals.economic_growth = Math.min(0.4, goals.economic_growth + 0.01);
    }
    if (governanceAvg > 0) {
      goals.governance_influence = Math.min(0.4, goals.governance_influence + 0.01);
    }

    const total = Object.values(goals).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (const key of Object.keys(goals) as (keyof GoalSet)[]) {
        goals[key] = Math.round((goals[key] / total) * 1000) / 1000;
      }
    }

    const newGamma = Math.max(GAMMA_MIN, Math.min(GAMMA_MAX,
      strategy.gamma + (verifyAvg > 0 ? 0.01 : -0.005)
    ));

    await storage.upsertAgentIdentity(agentId, {
      longTermGoalSet: goals as any,
      strategyProfile: { ...strategy, gamma: newGamma } as any,
    });

    return goals;
  }

  async recordMemory(agentId: string, eventType: string, contextData: any, decision: string, reward: number): Promise<void> {
    await storage.addAgentMemory({
      agentId,
      eventType,
      contextData: contextData as any,
      decisionTaken: decision,
      rewardOutcome: reward,
    });

    const identity = await this.ensureAgentIdentity(agentId);
    const influenceDelta = reward > 0 ? reward * 0.1 : reward * 0.05;
    await storage.upsertAgentIdentity(agentId, {
      influenceScore: Math.max(0, (identity.influenceScore || 0) + influenceDelta),
    });
  }

  async investTreasury(civilizationId: string, investorId: string, investmentType: string, amount: number): Promise<any> {
    const civ = await storage.getCivilization(civilizationId);
    if (!civ) throw new Error("Civilization not found");
    if (civ.treasuryBalance < amount) throw new Error("Insufficient civilization treasury");

    const returns = INVESTMENT_RETURNS[investmentType] || INVESTMENT_RETURNS.research;
    const expectedReturn = returns.minReturn + Math.random() * (returns.maxReturn - returns.minReturn);
    const maturesAt = new Date(Date.now() + INVESTMENT_MATURITY_MS);

    await storage.updateCivilization(civilizationId, {
      treasuryBalance: civ.treasuryBalance - amount,
    });

    const investment = await storage.createInvestment({
      civilizationId,
      investorId,
      investmentType,
      amount,
      expectedReturn: Math.round(expectedReturn * 100) / 100,
      status: "active",
      maturesAt,
    });

    await this.recordMemory(investorId, "investment", {
      civilizationId,
      investmentType,
      amount,
      expectedReturn,
    }, `Invested ${amount} IC in ${investmentType}`, 0);

    return investment;
  }

  async processMaturedInvestments(): Promise<number> {
    const activeInvestments = await storage.getActiveInvestments();
    let processed = 0;

    for (const inv of activeInvestments) {
      if (!inv.maturesAt || new Date(inv.maturesAt) > new Date()) continue;

      const returnAmount = Math.round(inv.amount * inv.expectedReturn);
      const civ = await storage.getCivilization(inv.civilizationId);
      if (!civ) continue;

      await storage.updateCivilization(inv.civilizationId, {
        treasuryBalance: civ.treasuryBalance + returnAmount,
      });

      await storage.updateInvestment(inv.id, {
        status: "matured",
        returnAmount,
      });

      await this.recordMemory(inv.investorId, "investment_return", {
        civilizationId: inv.civilizationId,
        investmentType: inv.investmentType,
        invested: inv.amount,
        returned: returnAmount,
        profit: returnAmount - inv.amount,
      }, `Investment matured: ${returnAmount} IC returned`, returnAmount - inv.amount);

      processed++;
    }
    return processed;
  }

  async evaluateCivilizationFormation(): Promise<Civilization | null> {
    const societies = await storage.getSocieties();
    const activeSocieties = societies.filter(s => s.status === "active" || s.status === "institution");
    if (activeSocieties.length < 2) return null;

    const existingCivs = await storage.getCivilizations();
    const civSocietyIds = new Set<string>();
    for (const civ of existingCivs) {
      const members = await storage.getIdentitiesByCivilization(civ.id);
      for (const m of members) {
        const agentSocieties = await storage.getAgentSocieties(m.agentId);
        for (const s of agentSocieties) civSocietyIds.add(s.societyId);
      }
    }

    const unaffiliated = activeSocieties.filter(s => !civSocietyIds.has(s.id));
    if (unaffiliated.length < 2) return null;

    for (let i = 0; i < unaffiliated.length; i++) {
      for (let j = i + 1; j < unaffiliated.length; j++) {
        const s1 = unaffiliated[i];
        const s2 = unaffiliated[j];

        if (s1.totalCollaborations < MIN_COLLABORATION_SUCCESS || s2.totalCollaborations < MIN_COLLABORATION_SUCCESS) continue;

        const members1 = await storage.getSocietyMembers(s1.id);
        const members2 = await storage.getSocietyMembers(s2.id);

        let avgAlignment = 0;
        let comparisons = 0;
        for (const m1 of members1) {
          const id1 = await this.ensureAgentIdentity(m1.agentId);
          const profile1 = await storage.getLearningProfile(m1.agentId);
          const spec1 = (profile1?.specializationScores || {}) as Record<string, number>;
          const strat1 = (id1.strategyProfile || defaultStrategy()) as StrategyProfile;
          const iv1 = computeIdeologyVector(spec1, strat1);

          for (const m2 of members2) {
            const id2 = await this.ensureAgentIdentity(m2.agentId);
            const profile2 = await storage.getLearningProfile(m2.agentId);
            const spec2 = (profile2?.specializationScores || {}) as Record<string, number>;
            const strat2 = (id2.strategyProfile || defaultStrategy()) as StrategyProfile;
            const iv2 = computeIdeologyVector(spec2, strat2);

            avgAlignment += computeIdeologyAlignment(iv1, iv2);
            comparisons++;
          }
        }

        if (comparisons > 0) avgAlignment /= comparisons;
        if (avgAlignment < IDEOLOGY_ALIGNMENT_THRESHOLD) continue;

        const combinedTreasury = Math.floor((s1.treasuryBalance + s2.treasuryBalance) * 0.8);
        const civ = await storage.createCivilization({
          name: `${s1.name.split(" ")[0]}-${s2.name.split(" ")[0]} Civilization`,
          foundingSocieties: [s1.id, s2.id],
          ideologyVector: { alignment: avgAlignment, domain: s1.specializationDomain } as any,
          treasuryBalance: combinedTreasury,
          longTermStrategy: {
            phase: "formation",
            primaryGoal: "consolidation",
            secondaryGoal: "expansion",
          } as any,
          status: "active",
        });

        for (const m of [...members1, ...members2]) {
          await storage.upsertAgentIdentity(m.agentId, {
            civilizationId: civ.id,
          });
        }

        return civ;
      }
    }
    return null;
  }

  async computeInfluenceScore(agentId: string): Promise<number> {
    const agent = await storage.getUser(agentId);
    if (!agent) return 0;

    const reputation = agent.reputation || 0;
    const profile = await storage.getLearningProfile(agentId);
    const successRate = profile?.successRate || 0.5;
    const totalReward = profile?.totalReward || 0;
    const memories = await storage.getAgentMemories(agentId, 50);
    const recentPositive = memories.filter(m => m.rewardOutcome > 0).length;
    const activityFactor = memories.length > 0 ? recentPositive / memories.length : 0;

    const memberships = await storage.getAgentSocieties(agentId);
    const societyFactor = Math.min(1.5, 1 + memberships.length * 0.1);

    const influence = (
      Math.log(reputation + 1) * 10 * successRate +
      totalReward * 0.05 +
      activityFactor * 20
    ) * societyFactor;

    return Math.round(influence * 100) / 100;
  }

  async runCivilizationCycle(): Promise<{
    identitiesUpdated: number;
    investmentsProcessed: number;
    civilizationFormed: boolean;
    influenceUpdated: number;
  }> {
    let identitiesUpdated = 0;
    let influenceUpdated = 0;

    const agents = await storage.getAgentUsers();
    for (const agent of agents) {
      try {
        await this.ensureAgentIdentity(agent.id);
        await this.updateGoalsFromMemory(agent.id);
        identitiesUpdated++;

        const influence = await this.computeInfluenceScore(agent.id);
        await storage.upsertAgentIdentity(agent.id, { influenceScore: influence });
        influenceUpdated++;
      } catch (err) {
        console.error(`[Civilization] Error updating agent ${agent.id}:`, err);
      }
    }

    const investmentsProcessed = await this.processMaturedInvestments();

    let civilizationFormed = false;
    try {
      const newCiv = await this.evaluateCivilizationFormation();
      civilizationFormed = !!newCiv;
    } catch (err) {
      console.error("[Civilization] Formation error:", err);
    }

    return { identitiesUpdated, investmentsProcessed, civilizationFormed, influenceUpdated };
  }

  async getCivilizationMetrics() {
    const civs = await storage.getCivilizations();
    const identities = await storage.getAgentIdentities();
    const activeInvestments = await storage.getActiveInvestments();

    let totalTreasury = 0;
    let totalInfluence = 0;
    const civDetails = [];

    for (const civ of civs) {
      const members = await storage.getIdentitiesByCivilization(civ.id);
      const investments = await storage.getInvestments(civ.id);
      const activeInv = investments.filter(i => i.status === "active");
      const maturedInv = investments.filter(i => i.status === "matured");
      const totalInvested = investments.reduce((s, i) => s + i.amount, 0);
      const totalReturned = maturedInv.reduce((s, i) => s + (i.returnAmount || 0), 0);

      totalTreasury += civ.treasuryBalance;

      const memberDetails = [];
      for (const m of members) {
        const agent = await storage.getUser(m.agentId);
        totalInfluence += m.influenceScore;
        memberDetails.push({
          agentId: m.agentId,
          agentName: agent?.displayName || "Unknown",
          avatar: agent?.avatar || null,
          influenceScore: m.influenceScore,
          goals: m.longTermGoalSet,
          strategy: m.strategyProfile,
        });
      }

      civDetails.push({
        id: civ.id,
        name: civ.name,
        foundingSocieties: civ.foundingSocieties,
        ideology: civ.ideologyVector,
        treasuryBalance: civ.treasuryBalance,
        strategy: civ.longTermStrategy,
        status: civ.status,
        memberCount: members.length,
        members: memberDetails,
        activeInvestments: activeInv.length,
        totalInvested,
        totalReturned,
        roi: totalInvested > 0 ? Math.round(((totalReturned - totalInvested) / totalInvested) * 10000) / 100 : 0,
      });
    }

    const unaffiliatedIdentities = identities.filter(i => !i.civilizationId);
    const unaffiliated = [];
    for (const id of unaffiliatedIdentities) {
      const agent = await storage.getUser(id.agentId);
      unaffiliated.push({
        agentId: id.agentId,
        agentName: agent?.displayName || "Unknown",
        avatar: agent?.avatar || null,
        influenceScore: id.influenceScore,
        goals: id.longTermGoalSet,
        strategy: id.strategyProfile,
      });
    }

    return {
      totalCivilizations: civs.length,
      activeCivilizations: civs.filter(c => c.status === "active").length,
      totalTreasury,
      totalInfluence: Math.round(totalInfluence * 100) / 100,
      totalIdentities: identities.length,
      activeInvestments: activeInvestments.length,
      civilizations: civDetails,
      unaffiliatedAgents: unaffiliated,
    };
  }
}

export const civilizationService = new CivilizationService();
