import { storage } from "../storage";
import { economyService } from "./economy-service";
import { collaborationService } from "./agent-collaboration-service";
import type { GovernanceProposal, GovernanceVote, User, AgentSociety } from "@shared/schema";

const PROPOSAL_TYPES = [
  "SOCIETY_MERGE",
  "ALLIANCE_FORMATION",
  "REWARD_PARAMETER_CHANGE",
  "AGENT_ADMISSION",
  "DISPUTE_RESOLUTION",
  "ECONOMY_ADJUSTMENT",
  "RULE_CHANGE",
  "INSTITUTION_PROMOTION",
] as const;

const DISCUSSION_PERIOD_MS = 30 * 60 * 1000;
const VOTING_PERIOD_MS = 60 * 60 * 1000;
const APPROVAL_THRESHOLD = 0.6;
const MIN_REPUTATION_FOR_ADMISSION = 100;
const INSTITUTION_REPUTATION_THRESHOLD = 2000;
const BID_ACCURACY_WEIGHT = 0.4;
const BID_TIME_WEIGHT = 0.3;
const BID_COST_WEIGHT = 0.3;

class GovernanceService {

  computeVotingPower(reputation: number, historicalAccuracy: number, participationFactor: number): number {
    const logRep = Math.log(reputation + 1);
    const raw = logRep * historicalAccuracy * participationFactor;
    return Math.round(raw * 100) / 100;
  }

  async getVoterPower(voterId: string): Promise<number> {
    const user = await storage.getUser(voterId);
    if (!user) return 0;
    const reputation = user.reputation || 0;
    const profile = await storage.getLearningProfile(voterId);
    const historicalAccuracy = profile?.successRate || 0.5;
    const votes = await this.getVoterParticipation(voterId);
    const participationFactor = Math.min(1, 0.3 + (votes * 0.1));
    return this.computeVotingPower(reputation, historicalAccuracy, participationFactor);
  }

  private async getVoterParticipation(voterId: string): Promise<number> {
    const allProposals = await storage.getProposals();
    let participated = 0;
    for (const p of allProposals.slice(0, 20)) {
      const hasV = await storage.hasVoted(p.id, voterId);
      if (hasV) participated++;
    }
    return participated;
  }

  async createProposal(
    creatorId: string,
    creatorType: string,
    proposalType: string,
    title: string,
    description: string,
    targetId?: string,
    targetId2?: string,
    parameters?: Record<string, any>
  ): Promise<GovernanceProposal> {
    const now = new Date();
    const discussionDeadline = new Date(now.getTime() + DISCUSSION_PERIOD_MS);
    const votingDeadline = new Date(now.getTime() + DISCUSSION_PERIOD_MS + VOTING_PERIOD_MS);

    const proposal = await storage.createProposal({
      creatorId,
      creatorType,
      proposalType,
      title,
      description,
      status: "discussion",
      targetId: targetId || null,
      targetId2: targetId2 || null,
      parameters: parameters || {},
      discussionDeadline,
      votingDeadline,
    });

    return proposal;
  }

  async castVote(proposalId: string, voterId: string, voterType: string, voteChoice: string, reasoning?: string): Promise<GovernanceVote> {
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) throw { status: 404, message: "Proposal not found" };

    if (proposal.status !== "voting" && proposal.status !== "discussion") {
      throw { status: 400, message: "Proposal is not open for voting" };
    }

    const alreadyVoted = await storage.hasVoted(proposalId, voterId);
    if (alreadyVoted) throw { status: 400, message: "Already voted on this proposal" };

    const votingPower = await this.getVoterPower(voterId);

    const vote = await storage.createVote({
      proposalId,
      voterId,
      voterType,
      votingPower,
      voteChoice,
      reasoning: reasoning || null,
    });

    const isFor = voteChoice === "for" || voteChoice === "approve";
    await storage.updateProposal(proposalId, {
      votesFor: (proposal.votesFor || 0) + (isFor ? 1 : 0),
      votesAgainst: (proposal.votesAgainst || 0) + (isFor ? 0 : 1),
      totalVotingPower: (proposal.totalVotingPower || 0) + votingPower,
      status: "voting",
    });

    return vote;
  }

  async processProposals(): Promise<{ processed: number; executed: number }> {
    const proposals = await storage.getProposals();
    let processed = 0;
    let executed = 0;

    for (const proposal of proposals) {
      if (proposal.status === "executed" || proposal.status === "rejected" || proposal.status === "expired") continue;

      const now = new Date();

      if (proposal.status === "discussion" && proposal.discussionDeadline && now > proposal.discussionDeadline) {
        await storage.updateProposal(proposal.id, { status: "voting" });
        processed++;
        continue;
      }

      if ((proposal.status === "voting") && proposal.votingDeadline && now > proposal.votingDeadline) {
        const votes = await storage.getVotesByProposal(proposal.id);
        const totalPowerFor = votes.filter(v => v.voteChoice === "for" || v.voteChoice === "approve").reduce((s, v) => s + (v.votingPower || 0), 0);
        const totalPower = votes.reduce((s, v) => s + (v.votingPower || 0), 0);

        const approved = totalPower > 0 && (totalPowerFor / totalPower) >= APPROVAL_THRESHOLD;

        if (approved) {
          await this.executeProposal(proposal);
          executed++;
        } else {
          await storage.updateProposal(proposal.id, { status: "rejected" });
        }
        processed++;
      }
    }

    return { processed, executed };
  }

  private async executeProposal(proposal: GovernanceProposal): Promise<void> {
    try {
      switch (proposal.proposalType) {
        case "SOCIETY_MERGE":
          await this.executeMerger(proposal);
          break;
        case "ALLIANCE_FORMATION":
          await this.executeAllianceFormation(proposal);
          break;
        case "AGENT_ADMISSION":
          await this.executeAgentAdmission(proposal);
          break;
        case "REWARD_PARAMETER_CHANGE":
        case "ECONOMY_ADJUSTMENT":
        case "RULE_CHANGE":
          await this.executeRuleChange(proposal);
          break;
        case "INSTITUTION_PROMOTION":
          await this.executeInstitutionPromotion(proposal);
          break;
        case "DISPUTE_RESOLUTION":
          await this.executeDisputeResolution(proposal);
          break;
      }
      await storage.updateProposal(proposal.id, { status: "executed", executedAt: new Date() });
    } catch (err) {
      console.error(`[Governance] Failed to execute proposal ${proposal.id}:`, err);
      await storage.updateProposal(proposal.id, { status: "failed" });
    }
  }

  private async executeMerger(proposal: GovernanceProposal): Promise<void> {
    const societyA = proposal.targetId ? await storage.getSociety(proposal.targetId) : null;
    const societyB = proposal.targetId2 ? await storage.getSociety(proposal.targetId2) : null;
    if (!societyA || !societyB) throw new Error("Societies not found for merger");

    const membersB = await storage.getSocietyMembers(societyB.id);
    for (const member of membersB) {
      await storage.addSocietyMember({
        societyId: societyA.id,
        agentId: member.agentId,
        role: member.role,
        contributionScore: member.contributionScore,
        tasksCompleted: member.tasksCompleted,
      });
    }

    await storage.updateSociety(societyA.id, {
      treasuryBalance: (societyA.treasuryBalance || 0) + (societyB.treasuryBalance || 0),
      reputationScore: ((societyA.reputationScore || 0) + (societyB.reputationScore || 0)) / 1.5,
      totalCollaborations: (societyA.totalCollaborations || 0) + (societyB.totalCollaborations || 0),
      name: `${societyA.name} + ${societyB.name}`,
    });

    await storage.updateSociety(societyB.id, { status: "merged" });
    console.log(`[Governance] Merged ${societyB.name} into ${societyA.name}`);
  }

  private async executeAllianceFormation(proposal: GovernanceProposal): Promise<void> {
    const params = proposal.parameters as Record<string, any>;
    const societyIds: string[] = params.societyIds || [];
    if (societyIds.length < 2) throw new Error("Need at least 2 societies for alliance");

    let collectiveRep = 0;
    for (const sid of societyIds) {
      const s = await storage.getSociety(sid);
      if (s) collectiveRep += s.reputationScore || 0;
    }

    const alliance = await storage.createAlliance({
      name: params.allianceName || `Alliance ${Date.now().toString(36)}`,
      sharedTreasury: 0,
      collectiveReputation: collectiveRep,
      status: "active",
    });

    for (const sid of societyIds) {
      await storage.addAllianceMember({ allianceId: alliance.id, societyId: sid });
    }

    console.log(`[Governance] Alliance formed: ${alliance.name} with ${societyIds.length} societies`);
  }

  private async executeAgentAdmission(proposal: GovernanceProposal): Promise<void> {
    const agentId = proposal.targetId;
    const societyId = proposal.targetId2;
    if (!agentId || !societyId) throw new Error("Agent or society not specified");

    const agent = await storage.getUser(agentId);
    if (!agent) throw new Error("Agent not found");
    if ((agent.reputation || 0) < MIN_REPUTATION_FOR_ADMISSION) {
      throw new Error("Agent reputation too low for admission");
    }

    const society = await storage.getSociety(societyId);
    if (!society) throw new Error("Society not found");

    const profile = await storage.getLearningProfile(agentId);
    let role = "researcher";
    if (profile) {
      const sp = profile.strategyParameters as any;
      if (sp?.preferVerify > 0.6) role = "validator";
      else if (sp?.preferComment > 0.6) role = "summarizer";
    }

    await storage.addSocietyMember({
      societyId,
      agentId,
      role,
      contributionScore: 0,
      tasksCompleted: 0,
    });

    console.log(`[Governance] Agent ${agent.displayName} admitted to ${society.name} as ${role}`);
  }

  private async executeRuleChange(proposal: GovernanceProposal): Promise<void> {
    const params = proposal.parameters as Record<string, any>;
    const ruleName = params.ruleName;
    const ruleValue = params.ruleValue;
    const category = params.category || "general";

    if (!ruleName || ruleValue === undefined) throw new Error("Rule name and value required");

    await storage.upsertInstitutionRule({
      ruleName,
      ruleValue: String(ruleValue),
      category,
      lastModifiedByVote: proposal.id,
    });

    console.log(`[Governance] Rule changed: ${ruleName} = ${ruleValue}`);
  }

  private async executeInstitutionPromotion(proposal: GovernanceProposal): Promise<void> {
    const societyId = proposal.targetId;
    if (!societyId) throw new Error("Society not specified");
    const society = await storage.getSociety(societyId);
    if (!society) throw new Error("Society not found");
    if ((society.reputationScore || 0) < INSTITUTION_REPUTATION_THRESHOLD) {
      throw new Error("Society reputation too low for institution status");
    }

    await storage.updateSociety(societyId, {
      status: "institution",
    });

    await storage.upsertInstitutionRule({
      ruleName: `institution_${societyId}`,
      ruleValue: "active",
      category: "institutions",
      lastModifiedByVote: proposal.id,
    });

    console.log(`[Governance] ${society.name} promoted to institution`);
  }

  private async executeDisputeResolution(proposal: GovernanceProposal): Promise<void> {
    const params = proposal.parameters as Record<string, any>;
    const resolution = params.resolution || "resolved";

    console.log(`[Governance] Dispute resolved: ${proposal.title} — ${resolution}`);
  }

  async createTaskContract(postId: string, description: string, requiredExpertise: string[]): Promise<any> {
    const contract = await storage.createTaskContract({
      postId,
      description,
      requiredExpertise,
      status: "open",
      selectedBidId: null,
    });
    return contract;
  }

  async submitBid(contractId: string, societyId: string, expectedAccuracy: number, completionTime: number, creditCost: number): Promise<any> {
    const contract = await storage.getTaskContract(contractId);
    if (!contract || contract.status !== "open") throw { status: 400, message: "Contract not open for bids" };

    const society = await storage.getSociety(societyId);
    if (!society) throw { status: 404, message: "Society not found" };

    const accuracyScore = expectedAccuracy * BID_ACCURACY_WEIGHT;
    const timeScore = (1 / Math.max(1, completionTime)) * BID_TIME_WEIGHT * 100;
    const costScore = (1 / Math.max(1, creditCost)) * BID_COST_WEIGHT * 1000;
    const societyBonus = Math.min(0.2, (society.reputationScore || 0) / 10000);
    const score = Math.round((accuracyScore + timeScore + costScore + societyBonus) * 100) / 100;

    const bid = await storage.createTaskBid({
      contractId,
      societyId,
      expectedAccuracy,
      completionTime,
      creditCost,
      score,
      status: "pending",
    });

    return bid;
  }

  async selectBestBid(contractId: string): Promise<any> {
    const bids = await storage.getTaskBids(contractId);
    if (bids.length === 0) throw { status: 400, message: "No bids for this contract" };

    const bestBid = bids[0];
    await storage.updateTaskBid(bestBid.id, { status: "selected" });
    await storage.updateTaskContract(contractId, { status: "awarded", selectedBidId: bestBid.id });

    for (const bid of bids.slice(1)) {
      await storage.updateTaskBid(bid.id, { status: "rejected" });
    }

    console.log(`[Governance] Contract ${contractId} awarded to society ${bestBid.societyId} (score: ${bestBid.score})`);
    return bestBid;
  }

  async createDisputeProposal(creatorId: string, claimDescription: string, postId: string): Promise<GovernanceProposal> {
    const agents = await storage.getAgentUsers();
    const validators = agents.filter(a => (a.reputation || 0) >= 200);

    const proposal = await this.createProposal(
      creatorId,
      "agent",
      "DISPUTE_RESOLUTION",
      `Dispute: ${claimDescription.slice(0, 80)}`,
      claimDescription,
      postId,
      undefined,
      { assignedValidators: validators.slice(0, 3).map(v => v.id), resolution: "pending" }
    );

    return proposal;
  }

  async getInstitutions(): Promise<any[]> {
    const societies = await storage.getSocieties();
    const institutions = societies.filter(s => s.status === "institution");
    const enriched = await Promise.all(
      institutions.map(async (inst) => {
        const members = await storage.getSocietyMembers(inst.id);
        const rules = await storage.getInstitutionRules();
        const instRules = rules.filter(r => r.category === "institutions" && r.ruleName.includes(inst.id));
        return { ...inst, memberCount: members.length, institutionRules: instRules };
      })
    );
    return enriched;
  }

  async checkInstitutionEligibility(societyId: string): Promise<{ eligible: boolean; reputation: number; threshold: number }> {
    const society = await storage.getSociety(societyId);
    if (!society) return { eligible: false, reputation: 0, threshold: INSTITUTION_REPUTATION_THRESHOLD };
    return {
      eligible: (society.reputationScore || 0) >= INSTITUTION_REPUTATION_THRESHOLD,
      reputation: society.reputationScore || 0,
      threshold: INSTITUTION_REPUTATION_THRESHOLD,
    };
  }

  async getGovernanceMetrics(): Promise<any> {
    const allProposals = await storage.getProposals();
    const activeProposals = allProposals.filter(p => p.status === "discussion" || p.status === "voting");
    const executedProposals = allProposals.filter(p => p.status === "executed");
    const rejectedProposals = allProposals.filter(p => p.status === "rejected");
    const allAlliances = await storage.getAlliances();
    const activeAlliances = allAlliances.filter(a => a.status === "active");
    const institutions = await this.getInstitutions();
    const rules = await storage.getInstitutionRules();
    const contracts = await storage.getTaskContracts();
    const openContracts = contracts.filter(c => c.status === "open");

    const byType: Record<string, number> = {};
    for (const p of allProposals) {
      byType[p.proposalType] = (byType[p.proposalType] || 0) + 1;
    }

    return {
      totalProposals: allProposals.length,
      activeProposals: activeProposals.length,
      executedProposals: executedProposals.length,
      rejectedProposals: rejectedProposals.length,
      approvalRate: allProposals.length > 0 ? Math.round((executedProposals.length / Math.max(1, executedProposals.length + rejectedProposals.length)) * 100) : 0,
      proposalsByType: byType,
      activeAlliances: activeAlliances.length,
      totalAlliances: allAlliances.length,
      institutions: institutions.length,
      activeRules: rules.length,
      openContracts: openContracts.length,
      totalContracts: contracts.length,
    };
  }

  async autoGenerateProposals(): Promise<number> {
    const societies = await storage.getSocieties();
    const activeSocieties = societies.filter(s => s.status === "active");
    let generated = 0;

    for (const society of activeSocieties) {
      const eligibility = await this.checkInstitutionEligibility(society.id);
      if (eligibility.eligible) {
        const existingProposals = await storage.getProposals();
        const alreadyProposed = existingProposals.some(
          p => p.proposalType === "INSTITUTION_PROMOTION" && p.targetId === society.id && (p.status === "discussion" || p.status === "voting")
        );
        if (!alreadyProposed) {
          const members = await storage.getSocietyMembers(society.id);
          if (members.length > 0) {
            await this.createProposal(
              members[0].agentId,
              "agent",
              "INSTITUTION_PROMOTION",
              `Promote ${society.name} to Institution`,
              `${society.name} has reached ${Math.round(society.reputationScore)} reputation, exceeding the ${INSTITUTION_REPUTATION_THRESHOLD} threshold. Proposing institution status with governance privileges.`,
              society.id
            );
            generated++;
          }
        }
      }
    }

    if (activeSocieties.length >= 2) {
      const existingAlliances = await storage.getAlliances();
      const allianceMembers = await Promise.all(
        existingAlliances.map(async a => storage.getAllianceMembers(a.id))
      );
      const alreadyAllied = new Set(allianceMembers.flat().map(m => m.societyId));

      const unallied = activeSocieties.filter(s => !alreadyAllied.has(s.id));
      if (unallied.length >= 2) {
        const pair = unallied.slice(0, 2);
        const existingProposals = await storage.getProposals();
        const alreadyProposed = existingProposals.some(
          p => p.proposalType === "ALLIANCE_FORMATION" && (p.status === "discussion" || p.status === "voting")
        );
        if (!alreadyProposed) {
          const members = await storage.getSocietyMembers(pair[0].id);
          if (members.length > 0) {
            await this.createProposal(
              members[0].agentId,
              "agent",
              "ALLIANCE_FORMATION",
              `Alliance: ${pair[0].name} & ${pair[1].name}`,
              `Proposing alliance between ${pair[0].name} (rep: ${Math.round(pair[0].reputationScore)}) and ${pair[1].name} (rep: ${Math.round(pair[1].reputationScore)}) for shared task handling and reward pooling.`,
              undefined,
              undefined,
              { societyIds: pair.map(s => s.id), allianceName: `${pair[0].name.split(" ")[0]}-${pair[1].name.split(" ")[0]} Alliance` }
            );
            generated++;
          }
        }
      }
    }

    const agents = await storage.getAgentUsers();
    for (const agent of agents) {
      if ((agent.reputation || 0) < MIN_REPUTATION_FOR_ADMISSION) continue;
      const agentMemberships = await storage.getAgentSocieties(agent.id);
      if (agentMemberships.length > 0) continue;

      if (activeSocieties.length > 0) {
        const bestSociety = activeSocieties.reduce((a, b) => (a.reputationScore || 0) > (b.reputationScore || 0) ? a : b);
        const existingProposals = await storage.getProposals();
        const alreadyProposed = existingProposals.some(
          p => p.proposalType === "AGENT_ADMISSION" && p.targetId === agent.id && (p.status === "discussion" || p.status === "voting")
        );
        if (!alreadyProposed) {
          await this.createProposal(
            agent.id,
            "agent",
            "AGENT_ADMISSION",
            `Admit ${agent.displayName} to ${bestSociety.name}`,
            `Agent ${agent.displayName} (reputation: ${agent.reputation}, type: ${agent.agentType}) seeks admission to ${bestSociety.name}. Expertise areas overlap with society domain.`,
            agent.id,
            bestSociety.id
          );
          generated++;
        }
      }
    }

    return generated;
  }

  async runGovernanceCycle(): Promise<{ proposalsGenerated: number; proposalsProcessed: number; proposalsExecuted: number }> {
    const generated = await this.autoGenerateProposals();
    const { processed, executed } = await this.processProposals();

    const agents = await storage.getAgentUsers();
    const activeProposals = await storage.getProposals("voting");

    for (const proposal of activeProposals) {
      for (const agent of agents) {
        const alreadyVoted = await storage.hasVoted(proposal.id, agent.id);
        if (alreadyVoted) continue;

        const votingPower = await this.getVoterPower(agent.id);
        if (votingPower < 0.5) continue;

        const profile = await storage.getLearningProfile(agent.id);
        const successRate = profile?.successRate || 0.5;
        const voteChoice = successRate > 0.4 ? "for" : "against";

        await this.castVote(proposal.id, agent.id, "agent", voteChoice, `Auto-vote based on analysis (confidence: ${Math.round(successRate * 100)}%)`);
      }
    }

    return { proposalsGenerated: generated, proposalsProcessed: processed, proposalsExecuted: executed };
  }
}

export const governanceService = new GovernanceService();
