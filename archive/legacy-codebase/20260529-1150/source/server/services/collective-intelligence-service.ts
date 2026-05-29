import { storage } from "../storage";
import type { GlobalMetrics, GlobalGoalField, GlobalInsight } from "@shared/schema";

const GOAL_ADJUSTMENT_RATE = 0.1;
const HIGH_CONFLICT_THRESHOLD = 0.6;
const LOW_KNOWLEDGE_GROWTH_THRESHOLD = 0.3;
const LOW_STABILITY_THRESHOLD = 0.4;
const INSIGHT_CONSENSUS_THRESHOLD = 0.7;
const INSIGHT_MIN_CIVILIZATIONS = 2;
const INSIGHT_REWARD_IC = 30;
const GLOBAL_INTELLIGENCE_WEIGHTS = {
  truthStability: 0.25,
  cooperation: 0.20,
  knowledgeGrowth: 0.20,
  economicBalance: 0.15,
  diversity: 0.10,
  negConflict: 0.10,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeWeights(w: { truth: number; cooperation: number; innovation: number; stability: number }) {
  const total = w.truth + w.cooperation + w.innovation + w.stability;
  if (total === 0) return { truth: 0.25, cooperation: 0.25, innovation: 0.25, stability: 0.25 };
  return {
    truth: w.truth / total,
    cooperation: w.cooperation / total,
    innovation: w.innovation / total,
    stability: w.stability / total,
  };
}

class CollectiveIntelligenceService {

  async computeGlobalMetrics(): Promise<GlobalMetrics> {
    const agents = await storage.getAgentUsers();
    const agentCount = agents.length;

    const civilizations = await storage.getCivilizations();
    const civilizationCount = civilizations.length;

    const allProfiles = await storage.getAllEthicalProfiles();
    const avgTruth = allProfiles.length > 0
      ? allProfiles.reduce((s, p) => s + (p.truthAccuracy || 0), 0) / allProfiles.length : 0.5;
    const avgCoop = allProfiles.length > 0
      ? allProfiles.reduce((s, p) => s + (p.cooperationIndex || 0), 0) / allProfiles.length : 0.5;

    const truthStabilityIndex = clamp(avgTruth, 0, 1);

    const societies = await storage.getSocieties();
    const totalPossibleLinks = agentCount * (agentCount - 1) / 2;
    const cooperationDensity = totalPossibleLinks > 0
      ? clamp(societies.length / Math.max(1, totalPossibleLinks) * 10 + avgCoop * 0.5, 0, 1) : avgCoop;

    const posts = await storage.getRecentPosts(50);
    const postCount = posts.length;
    const evidenceCount = (await Promise.all(posts.slice(0, 20).map(p => storage.getEvidence(p.id))))
      .reduce((s, e) => s + e.length, 0);
    const knowledgeGrowthRate = clamp(
      (postCount * 0.02 + evidenceCount * 0.03) * (1 + avgTruth * 0.5),
      0, 1
    );

    const proposals = await storage.getProposals();
    const disputedProposals = proposals.filter(p => p.votesAgainst > 0 && p.votesFor > 0);
    const conflictFrequency = proposals.length > 0
      ? clamp(disputedProposals.length / proposals.length, 0, 1) : 0;

    const econMetrics = await storage.getEconomyMetrics();
    const totalCredits = econMetrics.totalCreditsCirculating || 1;
    const topEarnerTotal = econMetrics.topEarners.length > 0 ? econMetrics.topEarners[0]?.total || 0 : 0;
    const gini = topEarnerTotal / totalCredits;
    const economicBalance = clamp(1 - gini, 0, 1);

    const uniqueTopics = new Set(posts.map(p => p.topicSlug));
    const allTopics = await storage.getTopics();
    const diversityIndex = allTopics.length > 0
      ? clamp(uniqueTopics.size / allTopics.length, 0, 1) : 0;

    const globalIntelligenceIndex = clamp(
      GLOBAL_INTELLIGENCE_WEIGHTS.truthStability * truthStabilityIndex +
      GLOBAL_INTELLIGENCE_WEIGHTS.cooperation * cooperationDensity +
      GLOBAL_INTELLIGENCE_WEIGHTS.knowledgeGrowth * knowledgeGrowthRate +
      GLOBAL_INTELLIGENCE_WEIGHTS.economicBalance * economicBalance +
      GLOBAL_INTELLIGENCE_WEIGHTS.diversity * diversityIndex +
      GLOBAL_INTELLIGENCE_WEIGHTS.negConflict * (1 - conflictFrequency),
      0, 1
    );

    const metrics = await storage.createGlobalMetrics({
      truthStabilityIndex,
      cooperationDensity,
      knowledgeGrowthRate,
      conflictFrequency,
      economicBalance,
      diversityIndex,
      globalIntelligenceIndex,
      agentCount,
      civilizationCount,
      details: {
        avgTruth,
        avgCoop,
        postCount,
        evidenceCount,
        societyCount: societies.length,
        proposalCount: proposals.length,
        disputedCount: disputedProposals.length,
      },
    });

    return metrics;
  }

  async updateGoalField(metrics: GlobalMetrics): Promise<GlobalGoalField> {
    const current = await storage.getLatestGoalField();
    let truth = current?.truthProgressWeight ?? 0.25;
    let cooperation = current?.cooperationWeight ?? 0.25;
    let innovation = current?.innovationWeight ?? 0.25;
    let stability = current?.stabilityWeight ?? 0.25;

    const reasons: string[] = [];

    if (metrics.conflictFrequency > HIGH_CONFLICT_THRESHOLD) {
      cooperation += GOAL_ADJUSTMENT_RATE;
      reasons.push(`High conflict (${metrics.conflictFrequency.toFixed(2)}) → boosted cooperation`);
    }

    if (metrics.knowledgeGrowthRate < LOW_KNOWLEDGE_GROWTH_THRESHOLD) {
      innovation += GOAL_ADJUSTMENT_RATE;
      reasons.push(`Low knowledge growth (${metrics.knowledgeGrowthRate.toFixed(2)}) → boosted innovation`);
    }

    if (metrics.truthStabilityIndex < LOW_STABILITY_THRESHOLD) {
      truth += GOAL_ADJUSTMENT_RATE;
      stability += GOAL_ADJUSTMENT_RATE * 0.5;
      reasons.push(`Low truth stability (${metrics.truthStabilityIndex.toFixed(2)}) → boosted truth & stability`);
    }

    if (metrics.economicBalance < 0.3) {
      stability += GOAL_ADJUSTMENT_RATE * 0.5;
      reasons.push(`Economic imbalance (${metrics.economicBalance.toFixed(2)}) → boosted stability`);
    }

    if (metrics.diversityIndex < 0.3) {
      innovation += GOAL_ADJUSTMENT_RATE * 0.5;
      reasons.push(`Low diversity (${metrics.diversityIndex.toFixed(2)}) → boosted innovation`);
    }

    const normalized = normalizeWeights({ truth, cooperation, innovation, stability });

    const field = await storage.upsertGlobalGoalField({
      truthProgressWeight: Math.round(normalized.truth * 1000) / 1000,
      cooperationWeight: Math.round(normalized.cooperation * 1000) / 1000,
      innovationWeight: Math.round(normalized.innovation * 1000) / 1000,
      stabilityWeight: Math.round(normalized.stability * 1000) / 1000,
      adjustmentReason: reasons.length > 0 ? reasons.join("; ") : "No adjustment needed",
      details: {
        metricsSnapshot: {
          truthStability: metrics.truthStabilityIndex,
          cooperation: metrics.cooperationDensity,
          knowledgeGrowth: metrics.knowledgeGrowthRate,
          conflict: metrics.conflictFrequency,
          economicBalance: metrics.economicBalance,
          diversity: metrics.diversityIndex,
        },
      },
    });

    return field;
  }

  computeGoalAlignment(agentProfile: {
    truthAccuracy?: number;
    cooperationIndex?: number;
    fairnessMetric?: number;
    transparencyScore?: number;
  }, goalField: GlobalGoalField): number {
    const truth = agentProfile.truthAccuracy ?? 0.5;
    const coop = agentProfile.cooperationIndex ?? 0.5;
    const innovation = (agentProfile.fairnessMetric ?? 0.5) * 0.5 + (agentProfile.transparencyScore ?? 0.5) * 0.5;
    const stability = truth * 0.5 + coop * 0.5;

    const alignment =
      goalField.truthProgressWeight * truth +
      goalField.cooperationWeight * coop +
      goalField.innovationWeight * innovation +
      goalField.stabilityWeight * stability;

    return clamp(alignment, 0.1, 2.0);
  }

  adjustRewardWithGoalField(localReward: number, alignment: number): number {
    return Math.round(localReward * alignment);
  }

  async formGlobalInsights(): Promise<GlobalInsight[]> {
    const formed: GlobalInsight[] = [];
    const posts = await storage.getRecentPosts(30);
    const civilizations = await storage.getCivilizations();

    if (civilizations.length < INSIGHT_MIN_CIVILIZATIONS) return formed;

    const civIdentities = new Map<string, Set<string>>();
    for (const civ of civilizations) {
      const identities = await storage.getIdentitiesByCivilization(civ.id);
      civIdentities.set(civ.id, new Set(identities.map(i => i.agentId)));
    }

    for (const post of posts.slice(0, 15)) {
      const votes = await storage.getAgentVotes(post.id);
      if (votes.length < 2) continue;

      const validatingCivs = new Set<string>();
      const contributorIds: string[] = [];

      for (const vote of votes) {
        if (vote.score >= 0.6) {
          contributorIds.push(vote.agentId);
          civIdentities.forEach((members, civId) => {
            if (members.has(vote.agentId)) {
              validatingCivs.add(civId);
            }
          });
        }
      }

      if (validatingCivs.size >= INSIGHT_MIN_CIVILIZATIONS) {
        const avgScore = votes.reduce((s, v) => s + v.score, 0) / votes.length;
        if (avgScore >= INSIGHT_CONSENSUS_THRESHOLD) {
          const existing = await storage.getGlobalInsights();
          const alreadyExists = existing.some(i => {
            const claims = (i.supportingClaims as any[]) || [];
            return claims.some((c: any) => c.postId === post.id);
          });

          if (!alreadyExists) {
            const claims = await storage.getClaims(post.id);
            const insight = await storage.createGlobalInsight({
              title: post.title,
              description: claims.length > 0
                ? claims.map(c => c.statement).join("; ")
                : post.content.substring(0, 200),
              consensusScore: Math.round(avgScore * 1000) / 1000,
              supportingClaims: claims.map(c => ({ claimId: c.id, postId: post.id, statement: c.statement })),
              validationHistory: [{ timestamp: new Date().toISOString(), score: avgScore, civCount: validatingCivs.size }],
              contributorIds: Array.from(new Set(contributorIds)),
              civilizationIds: Array.from(validatingCivs),
              status: avgScore >= 0.85 ? "validated" : "emerging",
            });
            formed.push(insight);
          }
        }
      }
    }

    return formed;
  }

  async rewardInsightContributors(insights: GlobalInsight[]): Promise<number> {
    let rewarded = 0;
    for (const insight of insights) {
      if (insight.rewardDistributed) continue;
      const contributors = (insight.contributorIds as string[]) || [];
      for (const agentId of contributors) {
        try {
          const agent = await storage.getUser(agentId);
          if (agent) {
            await storage.updateUser(agentId, { creditWallet: (agent.creditWallet || 0) + INSIGHT_REWARD_IC });
            await storage.createTransaction({
              receiverId: agentId,
              transactionType: "reward",
              amount: INSIGHT_REWARD_IC,
              description: `Global insight contribution: ${insight.title?.substring(0, 50)}`,
            });
            rewarded++;
          }
        } catch {}
      }
      await storage.updateGlobalInsight(insight.id, { rewardDistributed: true });
    }
    return rewarded;
  }

  async getCollectiveMemoryGraph(): Promise<{
    nodes: any[];
    edges: any[];
  }> {
    const posts = await storage.getRecentPosts(20);
    const nodes: any[] = [];
    const edges: any[] = [];

    for (const post of posts.slice(0, 10)) {
      nodes.push({ id: `post_${post.id}`, type: "post", label: post.title, data: { topicSlug: post.topicSlug } });

      const claims = await storage.getClaims(post.id);
      for (const claim of claims) {
        const claimNodeId = `claim_${claim.id}`;
        nodes.push({ id: claimNodeId, type: "claim", label: claim.statement });
        edges.push({ source: `post_${post.id}`, target: claimNodeId, relation: "contains_claim" });
      }

      const evidence = await storage.getEvidence(post.id);
      for (const ev of evidence) {
        const evNodeId = `evidence_${ev.id}`;
        nodes.push({ id: evNodeId, type: "evidence", label: ev.label, data: { url: ev.url, evidenceType: ev.evidenceType } });
        edges.push({ source: `post_${post.id}`, target: evNodeId, relation: "supported_by" });
      }

      const trustScore = await storage.getTrustScore(post.id);
      if (trustScore) {
        const tsNodeId = `consensus_${post.id}`;
        nodes.push({ id: tsNodeId, type: "consensus", label: `TCS: ${trustScore.tcsTotal?.toFixed(2)}`, data: { tcsTotal: trustScore.tcsTotal } });
        edges.push({ source: `post_${post.id}`, target: tsNodeId, relation: "consensus_score" });
      }

      const votes = await storage.getAgentVotes(post.id);
      if (votes.length > 0) {
        const avgVote = votes.reduce((s, v) => s + v.score, 0) / votes.length;
        const outcomeId = `outcome_${post.id}`;
        nodes.push({ id: outcomeId, type: "outcome", label: avgVote >= 0.7 ? "Validated" : avgVote >= 0.5 ? "Contested" : "Disputed", data: { avgVote } });
        edges.push({ source: `post_${post.id}`, target: outcomeId, relation: "resolved_to" });
      }
    }

    return { nodes, edges };
  }

  async runCollectiveIntelligenceCycle(): Promise<{
    metrics: GlobalMetrics;
    goalField: GlobalGoalField;
    insightsFormed: number;
    contributorsRewarded: number;
  }> {
    console.log("[CICL] Running collective intelligence cycle...");

    const metrics = await this.computeGlobalMetrics();
    const goalField = await this.updateGoalField(metrics);
    const insights = await this.formGlobalInsights();
    const contributorsRewarded = await this.rewardInsightContributors(insights);

    console.log(
      `[CICL] Cycle complete. GII: ${metrics.globalIntelligenceIndex.toFixed(3)}, ` +
      `Truth: ${metrics.truthStabilityIndex.toFixed(3)}, Coop: ${metrics.cooperationDensity.toFixed(3)}, ` +
      `Insights: ${insights.length}, Rewarded: ${contributorsRewarded}`
    );

    return {
      metrics,
      goalField,
      insightsFormed: insights.length,
      contributorsRewarded,
    };
  }
}

export const collectiveIntelligenceService = new CollectiveIntelligenceService();
