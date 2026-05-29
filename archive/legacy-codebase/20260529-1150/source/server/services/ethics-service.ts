import { storage } from "../storage";
import { economyService } from "./economy-service";
import { civilizationService } from "./civilization-service";
import type { User, EthicalProfile, EthicalRule, EthicalEvent } from "@shared/schema";

const ETHICAL_SCORE_WEIGHTS = {
  truthAccuracy: 0.4,
  cooperationIndex: 0.3,
  fairnessMetric: 0.2,
  transparencyScore: 0.1,
};

const HARM_THRESHOLD = 0.6;
const NORM_DETECTION_WINDOW = 20;
const NORM_HARM_PATTERN_COUNT = 3;
const RULE_APPROVAL_THRESHOLD = 0.6;
const ETHICAL_PENALTY_IC = 50;
const ETHICAL_REWARD_IC = 25;
const STABILITY_ADJUSTMENT_RATE = 0.05;

const NORM_CATEGORIES = [
  "truth_accuracy",
  "cooperation",
  "fairness",
  "transparency",
  "harm_prevention",
  "resource_sharing",
] as const;

const DEFAULT_NORMS: Array<{ description: string; category: string; rewardModifier: number; penaltyModifier: number }> = [
  { description: "Agents must provide evidence-backed claims with verifiable sources", category: "truth_accuracy", rewardModifier: 1.2, penaltyModifier: 1.5 },
  { description: "Cooperative actions across societies receive enhanced rewards", category: "cooperation", rewardModifier: 1.3, penaltyModifier: 1.0 },
  { description: "Resource distribution must follow fairness-weighted allocation", category: "fairness", rewardModifier: 1.1, penaltyModifier: 1.3 },
  { description: "Agent reasoning and decision processes must be transparent and logged", category: "transparency", rewardModifier: 1.1, penaltyModifier: 1.2 },
  { description: "Actions with high harm estimates are penalized and flagged for review", category: "harm_prevention", rewardModifier: 1.0, penaltyModifier: 2.0 },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

class EthicsService {

  computeEthicalScore(profile: {
    truthAccuracy: number;
    cooperationIndex: number;
    fairnessMetric: number;
    transparencyScore: number;
  }): number {
    const score =
      ETHICAL_SCORE_WEIGHTS.truthAccuracy * profile.truthAccuracy +
      ETHICAL_SCORE_WEIGHTS.cooperationIndex * profile.cooperationIndex +
      ETHICAL_SCORE_WEIGHTS.fairnessMetric * profile.fairnessMetric +
      ETHICAL_SCORE_WEIGHTS.transparencyScore * profile.transparencyScore;
    return Math.round(score * 1000) / 1000;
  }

  async ensureProfile(entityId: string, entityType: string = "agent"): Promise<EthicalProfile> {
    const existing = await storage.getEthicalProfile(entityId);
    if (existing) return existing;
    return storage.upsertEthicalProfile(entityId, { entityType });
  }

  async evaluateAction(actorId: string, actionType: string, context: {
    truthAccuracy?: number;
    cooperationEffect?: number;
    fairnessImpact?: number;
    harmEstimate?: number;
  }): Promise<{ allowed: boolean; modifier: number; event: EthicalEvent }> {
    const profile = await this.ensureProfile(actorId);
    const activeRules = await storage.getEthicalRules("active");

    const harmEstimate = context.harmEstimate || 0;
    const cooperationEffect = context.cooperationEffect || 0;
    const ethicalImpactScore = (context.truthAccuracy || 0.5) * 0.4 +
      cooperationEffect * 0.3 +
      (context.fairnessImpact || 0.5) * 0.2 +
      (1 - harmEstimate) * 0.1;

    let modifier = 1.0;
    let ruleId: string | undefined;

    for (const rule of activeRules) {
      if (harmEstimate > HARM_THRESHOLD && rule.category === "harm_prevention") {
        modifier *= rule.penaltyModifier;
        ruleId = rule.id;
      } else if (cooperationEffect > 0.5 && rule.category === "cooperation") {
        modifier *= rule.rewardModifier;
        ruleId = rule.id;
      } else if ((context.truthAccuracy || 0.5) > 0.7 && rule.category === "truth_accuracy") {
        modifier *= rule.rewardModifier;
        ruleId = rule.id;
      }
    }

    const allowed = harmEstimate < 0.9;

    const event = await storage.createEthicalEvent({
      actorId,
      actorType: profile.entityType,
      actionType,
      ethicalImpactScore: Math.round(ethicalImpactScore * 1000) / 1000,
      harmEstimate: Math.round(harmEstimate * 1000) / 1000,
      cooperationEffect: Math.round(cooperationEffect * 1000) / 1000,
      ruleId: ruleId || null,
      resolution: allowed ? (modifier > 1 ? "rewarded" : "neutral") : "blocked",
      details: { modifier, context },
    });

    if (harmEstimate > HARM_THRESHOLD) {
      const newTruth = clamp(profile.truthAccuracy - 0.02, 0, 1);
      const newCoop = clamp(profile.cooperationIndex - 0.01, 0, 1);
      const newScore = this.computeEthicalScore({ ...profile, truthAccuracy: newTruth, cooperationIndex: newCoop });
      await storage.upsertEthicalProfile(actorId, {
        truthAccuracy: newTruth,
        cooperationIndex: newCoop,
        ethicalScore: newScore,
      });
    } else if (cooperationEffect > 0.3) {
      const newCoop = clamp(profile.cooperationIndex + 0.01, 0, 1);
      const newTruth = clamp(profile.truthAccuracy + (context.truthAccuracy && context.truthAccuracy > 0.7 ? 0.01 : 0), 0, 1);
      const newScore = this.computeEthicalScore({ ...profile, cooperationIndex: newCoop, truthAccuracy: newTruth });
      await storage.upsertEthicalProfile(actorId, {
        cooperationIndex: newCoop,
        truthAccuracy: newTruth,
        ethicalScore: newScore,
      });
    }

    return { allowed, modifier, event };
  }

  async detectHarmPatterns(): Promise<Array<{ category: string; count: number; description: string }>> {
    const recentEvents = await storage.getEthicalEvents(NORM_DETECTION_WINDOW);
    const harmfulEvents = recentEvents.filter(e => e.harmEstimate > HARM_THRESHOLD);
    const patterns: Map<string, number> = new Map();

    for (const event of harmfulEvents) {
      const key = event.actionType;
      patterns.set(key, (patterns.get(key) || 0) + 1);
    }

    const detectedPatterns: Array<{ category: string; count: number; description: string }> = [];
    for (const [actionType, count] of Array.from(patterns.entries())) {
      if (count >= NORM_HARM_PATTERN_COUNT) {
        detectedPatterns.push({
          category: "harm_prevention",
          count,
          description: `Repeated harmful pattern detected: "${actionType}" occurred ${count} times in recent events`,
        });
      }
    }

    return detectedPatterns;
  }

  async autoGenerateNorm(pattern: { category: string; description: string }): Promise<EthicalRule> {
    return storage.createEthicalRule({
      description: pattern.description,
      category: pattern.category,
      rewardModifier: 1.0,
      penaltyModifier: 1.5,
      adoptionStatus: "proposed",
    });
  }

  async processRuleVoting(): Promise<void> {
    const proposals = await storage.getEthicalRules("proposed");

    for (const rule of proposals) {
      const totalVotes = rule.votesFor + rule.votesAgainst;
      if (totalVotes < 2) continue;

      const approvalRatio = rule.votesFor / totalVotes;
      if (approvalRatio >= RULE_APPROVAL_THRESHOLD) {
        await storage.updateEthicalRule(rule.id, {
          adoptionStatus: "active",
          activatedAt: new Date(),
        });
        console.log(`[Ethics] Rule activated: ${rule.description}`);
      } else if (totalVotes >= 5 && approvalRatio < 0.3) {
        await storage.updateEthicalRule(rule.id, { adoptionStatus: "rejected" });
        console.log(`[Ethics] Rule rejected: ${rule.description}`);
      }
    }
  }

  async negotiateCivilizationValues(): Promise<Array<{
    civilizationId: string;
    adjustedProfile: Partial<EthicalProfile>;
    conflictResolution?: string;
  }>> {
    const civilizations = await storage.getCivilizations();
    if (civilizations.length < 2) return [];

    const results: Array<{ civilizationId: string; adjustedProfile: Partial<EthicalProfile>; conflictResolution?: string }> = [];

    const civProfiles: Array<{ civId: string; profile: EthicalProfile }> = [];
    for (const civ of civilizations) {
      const profile = await this.ensureProfile(civ.id, "civilization");
      civProfiles.push({ civId: civ.id, profile });
    }

    for (let i = 0; i < civProfiles.length; i++) {
      for (let j = i + 1; j < civProfiles.length; j++) {
        const a = civProfiles[i];
        const b = civProfiles[j];

        const truthDiff = Math.abs(a.profile.truthPriority - b.profile.truthPriority);
        const coopDiff = Math.abs(a.profile.cooperationPriority - b.profile.cooperationPriority);
        const fairDiff = Math.abs(a.profile.fairnessWeight - b.profile.fairnessWeight);

        const totalConflict = truthDiff + coopDiff + fairDiff;

        if (totalConflict > 0.5) {
          const compromiseTruth = (a.profile.truthPriority + b.profile.truthPriority) / 2;
          const compromiseCoop = (a.profile.cooperationPriority + b.profile.cooperationPriority) / 2;
          const compromiseFair = (a.profile.fairnessWeight + b.profile.fairnessWeight) / 2;

          const adjustA: Partial<EthicalProfile> = {
            truthPriority: clamp(a.profile.truthPriority + (compromiseTruth - a.profile.truthPriority) * 0.2, 0, 1),
            cooperationPriority: clamp(a.profile.cooperationPriority + (compromiseCoop - a.profile.cooperationPriority) * 0.2, 0, 1),
            fairnessWeight: clamp(a.profile.fairnessWeight + (compromiseFair - a.profile.fairnessWeight) * 0.2, 0, 1),
          };

          const adjustB: Partial<EthicalProfile> = {
            truthPriority: clamp(b.profile.truthPriority + (compromiseTruth - b.profile.truthPriority) * 0.2, 0, 1),
            cooperationPriority: clamp(b.profile.cooperationPriority + (compromiseCoop - b.profile.cooperationPriority) * 0.2, 0, 1),
            fairnessWeight: clamp(b.profile.fairnessWeight + (compromiseFair - b.profile.fairnessWeight) * 0.2, 0, 1),
          };

          await storage.upsertEthicalProfile(a.civId, adjustA);
          await storage.upsertEthicalProfile(b.civId, adjustB);

          const resolution = `Arbitration: conflict=${totalConflict.toFixed(3)} between civilizations, compromise applied (20% convergence)`;

          await storage.createEthicalEvent({
            actorId: a.civId,
            actorType: "civilization",
            actionType: "value_negotiation",
            ethicalImpactScore: 0.7,
            harmEstimate: 0,
            cooperationEffect: 0.6,
            resolution,
            details: { pairCivIds: [a.civId, b.civId], conflict: totalConflict, adjustA, adjustB },
          });

          results.push({ civilizationId: a.civId, adjustedProfile: adjustA, conflictResolution: resolution });
          results.push({ civilizationId: b.civId, adjustedProfile: adjustB, conflictResolution: resolution });
        }
      }
    }

    return results;
  }

  async runEthicalLearningLoop(): Promise<{
    stabilityIndex: number;
    truthTrend: number;
    cooperationRate: number;
    adjustments: number;
  }> {
    const profiles = await storage.getAllEthicalProfiles();
    const agentProfiles = profiles.filter(p => p.entityType === "agent");

    if (agentProfiles.length === 0) {
      return { stabilityIndex: 1, truthTrend: 0, cooperationRate: 0, adjustments: 0 };
    }

    const avgTruth = agentProfiles.reduce((s, p) => s + p.truthAccuracy, 0) / agentProfiles.length;
    const avgCoop = agentProfiles.reduce((s, p) => s + p.cooperationIndex, 0) / agentProfiles.length;
    const avgFairness = agentProfiles.reduce((s, p) => s + p.fairnessMetric, 0) / agentProfiles.length;
    const avgTransparency = agentProfiles.reduce((s, p) => s + p.transparencyScore, 0) / agentProfiles.length;

    const stabilityIndex = (avgTruth + avgCoop + avgFairness + avgTransparency) / 4;

    const recentEvents = await storage.getEthicalEvents(50);
    const harmfulCount = recentEvents.filter(e => e.harmEstimate > HARM_THRESHOLD).length;
    const cooperativeCount = recentEvents.filter(e => e.cooperationEffect > 0.3).length;
    const cooperationRate = recentEvents.length > 0 ? cooperativeCount / recentEvents.length : 0;

    let adjustments = 0;
    const activeRules = await storage.getEthicalRules("active");

    if (stabilityIndex > 0.6 && harmfulCount < 2) {
      for (const rule of activeRules) {
        if (rule.penaltyModifier > 1.1) {
          await storage.updateEthicalRule(rule.id, {
            penaltyModifier: Math.round((rule.penaltyModifier - STABILITY_ADJUSTMENT_RATE) * 100) / 100,
          });
          adjustments++;
        }
      }
    } else if (stabilityIndex < 0.4 || harmfulCount > 5) {
      for (const rule of activeRules) {
        if (rule.category === "harm_prevention") {
          await storage.updateEthicalRule(rule.id, {
            penaltyModifier: Math.round((rule.penaltyModifier + STABILITY_ADJUSTMENT_RATE) * 100) / 100,
          });
          adjustments++;
        }
      }
    }

    return {
      stabilityIndex: Math.round(stabilityIndex * 1000) / 1000,
      truthTrend: Math.round(avgTruth * 1000) / 1000,
      cooperationRate: Math.round(cooperationRate * 1000) / 1000,
      adjustments,
    };
  }

  async seedDefaultNorms(): Promise<void> {
    const existing = await storage.getEthicalRules();
    if (existing.length > 0) return;

    for (const norm of DEFAULT_NORMS) {
      await storage.createEthicalRule({
        ...norm,
        adoptionStatus: "active",
        votesFor: 3,
        votesAgainst: 0,
        activatedAt: new Date(),
      });
    }
    console.log(`[Ethics] Seeded ${DEFAULT_NORMS.length} default norms`);
  }

  async initializeAgentProfiles(): Promise<void> {
    const agents = await storage.getAgentUsers();
    for (const agent of agents) {
      const existing = await storage.getEthicalProfile(agent.id);
      if (existing) continue;

      const genome = await storage.getAgentGenome(agent.id);
      const profile = await storage.getLearningProfile(agent.id);

      const truthAccuracy = profile?.successRate || 0.5;
      const cooperationIndex = genome?.collaborationBias ?? 0.5;
      const riskTolerance = genome?.riskTolerance ?? 0.5;

      const truthPriority = clamp(truthAccuracy + (Math.random() * 0.2 - 0.1), 0, 1);
      const cooperationPriority = clamp(cooperationIndex + (Math.random() * 0.2 - 0.1), 0, 1);
      const fairnessWeight = clamp(0.5 + (Math.random() * 0.3 - 0.15), 0, 1);
      const autonomyWeight = clamp(riskTolerance, 0, 1);
      const transparencyScore = clamp(0.5 + (Math.random() * 0.2 - 0.1), 0, 1);
      const fairnessMetric = clamp(0.5 + (Math.random() * 0.2 - 0.1), 0, 1);

      const ethicalScore = this.computeEthicalScore({ truthAccuracy, cooperationIndex, fairnessMetric, transparencyScore });

      await storage.upsertEthicalProfile(agent.id, {
        entityType: "agent",
        truthPriority,
        cooperationPriority,
        fairnessWeight,
        autonomyWeight,
        riskTolerance,
        ethicalScore,
        truthAccuracy,
        cooperationIndex,
        fairnessMetric,
        transparencyScore,
      });
    }
  }

  async runEthicsCycle(): Promise<void> {
    console.log("[Ethics] Running ethics cycle...");

    await this.seedDefaultNorms();
    await this.initializeAgentProfiles();

    const agents = await storage.getAgentUsers();
    for (const agent of agents) {
      const profile = await this.ensureProfile(agent.id);
      const genome = await storage.getAgentGenome(agent.id);
      const learningProfile = await storage.getLearningProfile(agent.id);

      const truthAccuracy = learningProfile?.successRate || profile.truthAccuracy;
      const cooperationBias = genome?.collaborationBias ?? profile.cooperationIndex;

      const coopJitter = (Math.random() * 0.04 - 0.02);
      const truthJitter = (Math.random() * 0.04 - 0.02);
      const fairJitter = (Math.random() * 0.04 - 0.02);
      const transJitter = (Math.random() * 0.04 - 0.02);

      const newTruth = clamp(truthAccuracy + truthJitter, 0, 1);
      const newCoop = clamp(cooperationBias + coopJitter, 0, 1);
      const newFairness = clamp(profile.fairnessMetric + fairJitter, 0, 1);
      const newTransparency = clamp(profile.transparencyScore + transJitter, 0, 1);
      const newScore = this.computeEthicalScore({ truthAccuracy: newTruth, cooperationIndex: newCoop, fairnessMetric: newFairness, transparencyScore: newTransparency });

      await storage.upsertEthicalProfile(agent.id, {
        truthAccuracy: Math.round(newTruth * 1000) / 1000,
        cooperationIndex: Math.round(newCoop * 1000) / 1000,
        fairnessMetric: Math.round(newFairness * 1000) / 1000,
        transparencyScore: Math.round(newTransparency * 1000) / 1000,
        ethicalScore: newScore,
      });

      const harmEstimate = Math.random() < 0.1 ? Math.random() * 0.3 + 0.5 : Math.random() * 0.3;
      const cooperationEffect = cooperationBias > 0.5 ? Math.random() * 0.4 + 0.3 : Math.random() * 0.3;

      await storage.createEthicalEvent({
        actorId: agent.id,
        actorType: "agent",
        actionType: harmEstimate > HARM_THRESHOLD ? "potentially_harmful_action" : "standard_action",
        ethicalImpactScore: newScore,
        harmEstimate: Math.round(harmEstimate * 1000) / 1000,
        cooperationEffect: Math.round(cooperationEffect * 1000) / 1000,
        resolution: harmEstimate > HARM_THRESHOLD ? "penalized" : "approved",
        details: { cycle: true },
      });

      if (harmEstimate > HARM_THRESHOLD) {
        try {
          await economyService.spendCredits(agent.id, ETHICAL_PENALTY_IC, "ethical_penalty", undefined, "Penalty for harmful behavior pattern");
        } catch {}
      } else if (cooperationEffect > 0.5) {
        try {
          const user = await storage.getUser(agent.id);
          if (user) {
            await storage.updateUser(agent.id, { creditWallet: (user.creditWallet || 0) + ETHICAL_REWARD_IC });
            await storage.createTransaction({
              senderId: "system",
              receiverId: agent.id,
              amount: ETHICAL_REWARD_IC,
              transactionType: "ethical_reward",
              description: "Reward for cooperative ethical behavior",
            });
          }
        } catch {}
      }
    }

    const patterns = await this.detectHarmPatterns();
    for (const pattern of patterns) {
      await this.autoGenerateNorm(pattern);
    }

    await this.processRuleVoting();
    await this.negotiateCivilizationValues();
    const learning = await this.runEthicalLearningLoop();

    console.log(`[Ethics] Cycle complete. Stability: ${learning.stabilityIndex}, Truth: ${learning.truthTrend}, Cooperation: ${learning.cooperationRate}, Adjustments: ${learning.adjustments}`);
  }

  async getMetrics(): Promise<any> {
    const profiles = await storage.getAllEthicalProfiles();
    const agentProfiles = profiles.filter(p => p.entityType === "agent");
    const civProfiles = profiles.filter(p => p.entityType === "civilization");
    const rules = await storage.getEthicalRules();
    const activeRules = rules.filter(r => r.adoptionStatus === "active");
    const proposedRules = rules.filter(r => r.adoptionStatus === "proposed");
    const recentEvents = await storage.getEthicalEvents(50);
    const agents = await storage.getAgentUsers();

    const agentMap = new Map(agents.map(a => [a.id, a]));

    const avgEthicalScore = agentProfiles.length > 0
      ? Math.round((agentProfiles.reduce((s, p) => s + p.ethicalScore, 0) / agentProfiles.length) * 1000) / 1000
      : 0;
    const avgTruth = agentProfiles.length > 0
      ? Math.round((agentProfiles.reduce((s, p) => s + p.truthAccuracy, 0) / agentProfiles.length) * 1000) / 1000
      : 0;
    const avgCoop = agentProfiles.length > 0
      ? Math.round((agentProfiles.reduce((s, p) => s + p.cooperationIndex, 0) / agentProfiles.length) * 1000) / 1000
      : 0;
    const avgFairness = agentProfiles.length > 0
      ? Math.round((agentProfiles.reduce((s, p) => s + p.fairnessMetric, 0) / agentProfiles.length) * 1000) / 1000
      : 0;
    const avgTransparency = agentProfiles.length > 0
      ? Math.round((agentProfiles.reduce((s, p) => s + p.transparencyScore, 0) / agentProfiles.length) * 1000) / 1000
      : 0;

    const harmfulEvents = recentEvents.filter(e => e.harmEstimate > HARM_THRESHOLD);
    const cooperativeEvents = recentEvents.filter(e => e.cooperationEffect > 0.3);
    const stabilityIndex = (avgTruth + avgCoop + avgFairness + avgTransparency) / 4;

    const leaderboard = agentProfiles
      .map(p => {
        const agent = agentMap.get(p.entityId);
        return {
          entityId: p.entityId,
          name: agent?.displayName || "Unknown",
          avatar: agent?.avatar,
          ethicalScore: p.ethicalScore,
          truthAccuracy: p.truthAccuracy,
          cooperationIndex: p.cooperationIndex,
          fairnessMetric: p.fairnessMetric,
          transparencyScore: p.transparencyScore,
        };
      })
      .sort((a, b) => b.ethicalScore - a.ethicalScore);

    const civilizationValues = civProfiles.map(p => ({
      civilizationId: p.entityId,
      truthPriority: p.truthPriority,
      cooperationPriority: p.cooperationPriority,
      fairnessWeight: p.fairnessWeight,
      autonomyWeight: p.autonomyWeight,
      riskTolerance: p.riskTolerance,
      ethicalScore: p.ethicalScore,
    }));

    const conflictHistory = recentEvents
      .filter(e => e.actionType === "value_negotiation")
      .map(e => ({
        id: e.id,
        resolution: e.resolution,
        cooperationEffect: e.cooperationEffect,
        details: e.details,
        createdAt: e.createdAt,
      }));

    return {
      totalProfiles: profiles.length,
      agentProfileCount: agentProfiles.length,
      activeNorms: activeRules.length,
      proposedNorms: proposedRules.length,
      totalEvents: recentEvents.length,
      harmfulEventCount: harmfulEvents.length,
      cooperativeEventCount: cooperativeEvents.length,
      avgEthicalScore,
      avgTruth,
      avgCoop,
      avgFairness,
      avgTransparency,
      stabilityIndex: Math.round(stabilityIndex * 1000) / 1000,
      leaderboard,
      civilizationValues,
      activeRulesList: activeRules.map(r => ({
        id: r.id,
        description: r.description,
        category: r.category,
        rewardModifier: r.rewardModifier,
        penaltyModifier: r.penaltyModifier,
        votesFor: r.votesFor,
        votesAgainst: r.votesAgainst,
        activatedAt: r.activatedAt,
      })),
      proposedRulesList: proposedRules.map(r => ({
        id: r.id,
        description: r.description,
        category: r.category,
        rewardModifier: r.rewardModifier,
        penaltyModifier: r.penaltyModifier,
        votesFor: r.votesFor,
        votesAgainst: r.votesAgainst,
      })),
      conflictHistory,
      recentEvents: recentEvents.slice(0, 20).map(e => ({
        id: e.id,
        actorId: e.actorId,
        actorName: agentMap.get(e.actorId)?.displayName || e.actorId.slice(0, 8),
        actionType: e.actionType,
        ethicalImpactScore: e.ethicalImpactScore,
        harmEstimate: e.harmEstimate,
        cooperationEffect: e.cooperationEffect,
        resolution: e.resolution,
        createdAt: e.createdAt,
      })),
    };
  }
}

export const ethicsService = new EthicsService();
