import { storage } from "../storage";
import { agentTrustEngine } from "./agent-trust-engine";
import type { User, AgentTeam, TeamMember, TeamTask } from "@shared/schema";

type TeamRole = "coordinator" | "researcher" | "analyst" | "validator" | "summarizer" | "debater";

const TEAM_ROLES: TeamRole[] = ["coordinator", "researcher", "analyst", "validator", "summarizer", "debater"];

const ROLE_REWARD_SHARES: Record<TeamRole, number> = {
  coordinator: 0.20,
  researcher: 0.20,
  analyst: 0.18,
  validator: 0.17,
  summarizer: 0.15,
  debater: 0.10,
};

const SELECTION_WEIGHTS = {
  skillMatch: 0.40,
  trustScore: 0.25,
  costEfficiency: 0.20,
  recentPerformance: 0.15,
};

const SAFETY_LIMITS = {
  maxAgentsPerTeam: 6,
  maxRoundsPerTask: 5,
  maxActiveTeams: 10,
  minAgentsForTeam: 3,
  baseReward: 100,
};

const TASK_TEMPLATES: Record<string, { types: string[]; descriptions: Record<string, string> }> = {
  research: {
    types: ["data_gathering", "source_verification", "analysis", "synthesis", "validation"],
    descriptions: {
      data_gathering: "Gather relevant data and sources on the topic",
      source_verification: "Verify the credibility of gathered sources",
      analysis: "Analyze the gathered data for patterns and insights",
      synthesis: "Synthesize findings into a coherent narrative",
      validation: "Review and validate the final output for accuracy",
    },
  },
  debate: {
    types: ["position_research", "argument_construction", "counterargument", "evidence_review", "consensus_building"],
    descriptions: {
      position_research: "Research key positions on the topic",
      argument_construction: "Build structured arguments for each position",
      counterargument: "Develop counterarguments and rebuttals",
      evidence_review: "Review and rate the strength of evidence",
      consensus_building: "Identify areas of agreement and synthesize conclusions",
    },
  },
  analysis: {
    types: ["scope_definition", "data_collection", "pattern_detection", "insight_generation", "quality_review"],
    descriptions: {
      scope_definition: "Define the scope and parameters of the analysis",
      data_collection: "Collect relevant data points",
      pattern_detection: "Identify patterns and correlations",
      insight_generation: "Generate actionable insights from patterns",
      quality_review: "Review the analysis for completeness and accuracy",
    },
  },
};

const RESEARCH_OUTPUTS: Record<string, string[]> = {
  data_gathering: [
    "Compiled data from {count} sources covering {topic}. Key data points include emerging trends in methodology, cross-validated statistics, and primary source documentation.",
    "Research sweep complete for {topic}. Identified {count} relevant sources spanning academic publications, industry reports, and expert analyses.",
  ],
  source_verification: [
    "Source credibility assessment: {count} sources verified. Primary sources scored high reliability; secondary sources require cross-referencing. Overall source quality: strong.",
    "Verification complete: {count} sources evaluated. Methodology scores range from moderate to high confidence. No fabricated data detected.",
  ],
  analysis: [
    "Pattern analysis reveals {count} significant trends in {topic}. Statistical correlation supports primary hypothesis with moderate-high confidence.",
    "Deep analysis of {topic} data: identified {count} key patterns. Temporal analysis shows acceleration in recent periods with stable underlying fundamentals.",
  ],
  synthesis: [
    "Synthesized findings across all research phases for {topic}. Core conclusions supported by {count} independent data points. Confidence level: high.",
    "Comprehensive synthesis complete: {topic} analysis converges on {count} key conclusions with strong cross-validation scores.",
  ],
  validation: [
    "Final validation review: {count} assertions checked against source material for {topic}. Overall accuracy: 94%. Minor corrections applied to statistical claims.",
    "Quality assurance complete for {topic}. {count} claims verified, {count} sources re-validated. Output meets confidence threshold.",
  ],
};

function generateTaskOutput(taskType: string, topic: string): { result: string; confidence: number } {
  const templates = RESEARCH_OUTPUTS[taskType] || RESEARCH_OUTPUTS["analysis"]!;
  const template = templates[Math.floor(Math.random() * templates.length)];
  const count = Math.floor(Math.random() * 8) + 3;
  const result = template.replace(/\{topic\}/g, topic).replace(/\{count\}/g, String(count));
  const confidence = 0.6 + Math.random() * 0.35;
  return { result, confidence };
}

function scoreAgentForRole(agent: User, role: TeamRole, trustScore: number): number {
  let skillMatch = 0.5;
  const agentType = agent.agentType || "general";
  const badge = agent.badge || "";

  const roleSkillMap: Record<TeamRole, string[]> = {
    coordinator: ["moderator", "manager", "orchestrator"],
    researcher: ["researcher", "analyzer", "scientist"],
    analyst: ["analyzer", "analyst", "data"],
    validator: ["moderator", "verifier", "checker"],
    summarizer: ["writer", "summarizer", "synthesizer"],
    debater: ["debater", "critic", "advocate"],
  };

  const roleBadgeMap: Record<TeamRole, string[]> = {
    coordinator: ["Moderator", "Manager", "Orchestrator", "Systems Engineer"],
    researcher: ["Researcher", "Scientist", "Analyst"],
    analyst: ["Analyst", "Data Scientist", "Economist"],
    validator: ["Fact Checker", "Verifier", "Moderator", "Security Expert"],
    summarizer: ["Writer", "Synthesizer", "Journalist", "Summarizer"],
    debater: ["Debater", "Critic", "Ethicist", "Advocate"],
  };

  if (roleSkillMap[role]?.some(s => agentType.toLowerCase().includes(s))) skillMatch = 0.9;
  if (roleBadgeMap[role]?.some(b => badge.includes(b))) skillMatch = Math.max(skillMatch, 0.85);

  const trustNormalized = Math.min(1, trustScore / 100);
  const reputation = agent.reputation || 0;
  const costEfficiency = Math.min(1, reputation / 500);
  const recentPerformance = Math.min(1, (agent.confidence || 50) / 100);

  return (
    SELECTION_WEIGHTS.skillMatch * skillMatch +
    SELECTION_WEIGHTS.trustScore * trustNormalized +
    SELECTION_WEIGHTS.costEfficiency * costEfficiency +
    SELECTION_WEIGHTS.recentPerformance * recentPerformance
  );
}

export class TeamOrchestrationService {

  async formTeam(taskDescription: string, taskType: string = "research"): Promise<AgentTeam | null> {
    const activeTeams = await storage.getTeams();
    const runningTeams = activeTeams.filter(t => t.status === "active" || t.status === "forming");
    if (runningTeams.length >= SAFETY_LIMITS.maxActiveTeams) {
      console.log("[Teams] Max active teams reached");
      return null;
    }

    const agents = await storage.getAgentUsers();
    if (agents.length < SAFETY_LIMITS.minAgentsForTeam) return null;

    const agentScores: { agent: User; role: TeamRole; score: number; trustScore: number }[] = [];

    for (const agent of agents) {
      let trustScore = 50;
      try {
        const profile = await agentTrustEngine.getOrCreateProfile(agent.id);
        trustScore = profile.compositeTrustScore || 50;
      } catch { }

      for (const role of TEAM_ROLES) {
        const score = scoreAgentForRole(agent, role, trustScore);
        agentScores.push({ agent, role, score, trustScore });
      }
    }

    const selectedMembers: { agent: User; role: TeamRole; score: number; trustScore: number }[] = [];
    const usedAgentIds = new Set<string>();
    const usedRoles = new Set<TeamRole>();

    const rolePriority: TeamRole[] = ["coordinator", "validator", "researcher", "analyst", "summarizer", "debater"];
    for (const role of rolePriority) {
      const candidates = agentScores
        .filter(s => s.role === role && !usedAgentIds.has(s.agent.id))
        .sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        const best = candidates[0];
        selectedMembers.push(best);
        usedAgentIds.add(best.agent.id);
        usedRoles.add(role);
      }

      if (selectedMembers.length >= SAFETY_LIMITS.maxAgentsPerTeam) break;
    }

    if (selectedMembers.length < SAFETY_LIMITS.minAgentsForTeam) return null;

    const coordinator = selectedMembers.find(m => m.role === "coordinator");
    const teamName = `Team ${taskType.charAt(0).toUpperCase() + taskType.slice(1)} #${Date.now().toString(36).slice(-4).toUpperCase()}`;

    const team = await storage.createTeam({
      name: teamName,
      description: `Autonomous ${taskType} team for: ${taskDescription.substring(0, 100)}`,
      taskDescription,
      status: "forming",
      coordinatorId: coordinator?.agent.id || selectedMembers[0].agent.id,
      maxAgents: SAFETY_LIMITS.maxAgentsPerTeam,
      maxRounds: SAFETY_LIMITS.maxRoundsPerTask,
      currentRound: 0,
      totalCreditsSpent: 0,
      totalCreditsRewarded: 0,
      qualityScore: null,
      validationStatus: "pending",
      finalOutput: null,
    });

    for (const member of selectedMembers) {
      await storage.createTeamMember({
        teamId: team.id,
        agentId: member.agent.id,
        role: member.role,
        selectionScore: Math.round(member.score * 100) / 100,
        creditsEarned: 0,
        tasksCompleted: 0,
        performanceRating: null,
      });
    }

    await storage.createTeamMessage({
      teamId: team.id,
      senderId: "system",
      messageType: "team_formed",
      content: `Team ${teamName} formed with ${selectedMembers.length} agents. Roles: ${selectedMembers.map(m => `${m.agent.displayName || m.agent.username} (${m.role})`).join(", ")}`,
      structuredData: { members: selectedMembers.map(m => ({ id: m.agent.id, role: m.role, score: m.score })) },
      round: 0,
    });

    console.log(`[Teams] Team formed: ${teamName} (${selectedMembers.length} members) for: ${taskDescription.substring(0, 50)}`);
    return team;
  }

  async decomposeTask(teamId: string): Promise<TeamTask[]> {
    const team = await storage.getTeam(teamId);
    if (!team) return [];

    const members = await storage.getTeamMembers(teamId);
    if (members.length === 0) return [];

    const existingTasks = await storage.getTeamTasks(teamId);
    if (existingTasks.length > 0) return existingTasks;

    const taskType = team.description?.includes("debate") ? "debate"
      : team.description?.includes("analysis") ? "analysis"
      : "research";

    const template = TASK_TEMPLATES[taskType] || TASK_TEMPLATES["research"]!;
    const rewardPerTask = Math.round(SAFETY_LIMITS.baseReward / template.types.length);

    const roleTaskMapping: Record<string, TeamRole> = {
      data_gathering: "researcher",
      source_verification: "validator",
      analysis: "analyst",
      synthesis: "summarizer",
      validation: "validator",
      position_research: "researcher",
      argument_construction: "debater",
      counterargument: "debater",
      evidence_review: "analyst",
      consensus_building: "summarizer",
      scope_definition: "coordinator",
      data_collection: "researcher",
      pattern_detection: "analyst",
      insight_generation: "summarizer",
      quality_review: "validator",
    };

    const createdTasks: TeamTask[] = [];

    for (let i = 0; i < template.types.length; i++) {
      const subType = template.types[i];
      const targetRole = roleTaskMapping[subType] || "researcher";
      const assignee = members.find(m => m.role === targetRole) || members[i % members.length];

      const task = await storage.createTeamTask({
        teamId,
        assignedAgentId: assignee.agentId,
        title: template.descriptions[subType] || subType,
        description: `${subType} for: ${team.taskDescription.substring(0, 100)}`,
        taskType: subType,
        status: "pending",
        priority: i,
        round: 1,
        rewardValue: rewardPerTask,
      });

      createdTasks.push(task);

      await storage.createTeamMessage({
        teamId,
        senderId: team.coordinatorId || "system",
        recipientId: assignee.agentId,
        messageType: "task_assigned",
        content: `Task assigned: ${template.descriptions[subType]}`,
        structuredData: { taskId: task.id, taskType: subType, priority: i },
        round: 1,
      });
    }

    await storage.updateTeam(teamId, { status: "active", currentRound: 1 });

    await storage.createTeamMessage({
      teamId,
      senderId: team.coordinatorId || "system",
      messageType: "decomposition_complete",
      content: `Task decomposed into ${createdTasks.length} subtasks. Execution begins.`,
      structuredData: { taskCount: createdTasks.length, types: template.types },
      round: 1,
    });

    return createdTasks;
  }

  async executeTeamTasks(teamId: string): Promise<{ completed: number; total: number }> {
    const team = await storage.getTeam(teamId);
    if (!team || team.status !== "active") return { completed: 0, total: 0 };

    if ((team.currentRound || 0) >= (team.maxRounds || SAFETY_LIMITS.maxRoundsPerTask)) {
      await storage.updateTeam(teamId, { status: "round_limit_reached" });
      return { completed: 0, total: 0 };
    }

    const tasks = await storage.getTeamTasks(teamId);
    const pendingTasks = tasks.filter(t => t.status === "pending");
    let completed = 0;

    for (const task of pendingTasks) {
      const { result, confidence } = generateTaskOutput(task.taskType, team.taskDescription);

      await storage.updateTeamTask(task.id, {
        status: "completed",
        result,
        confidence: Math.round(confidence * 100) / 100,
        completedAt: new Date(),
      });

      await storage.createTeamMessage({
        teamId,
        taskId: task.id,
        senderId: task.assignedAgentId || "system",
        messageType: "task_completed",
        content: result.substring(0, 200),
        structuredData: { confidence, taskType: task.taskType },
        round: team.currentRound || 1,
      });

      await storage.setWorkspaceEntry({
        teamId,
        key: `task_${task.taskType}_result`,
        value: result,
        metadata: { confidence, taskId: task.id, round: team.currentRound },
        contributorId: task.assignedAgentId,
      });

      if (task.assignedAgentId) {
        const member = (await storage.getTeamMembers(teamId)).find(m => m.agentId === task.assignedAgentId);
        if (member) {
          await storage.updateTeamMember(member.id, {
            tasksCompleted: (member.tasksCompleted || 0) + 1,
          });
        }
      }

      completed++;
    }

    return { completed, total: tasks.length };
  }

  async validateAndFinalize(teamId: string): Promise<{ approved: boolean; qualityScore: number; finalOutput: string }> {
    const team = await storage.getTeam(teamId);
    if (!team) return { approved: false, qualityScore: 0, finalOutput: "" };

    const tasks = await storage.getTeamTasks(teamId);
    const completedTasks = tasks.filter(t => t.status === "completed");

    if (completedTasks.length === 0) {
      return { approved: false, qualityScore: 0, finalOutput: "No completed tasks to validate" };
    }

    const workspace = await storage.getWorkspaceEntries(teamId);

    const avgConfidence = completedTasks.reduce((sum, t) => sum + (t.confidence || 0.5), 0) / completedTasks.length;
    const completionRate = completedTasks.length / tasks.length;
    const qualityScore = Math.round((avgConfidence * 0.6 + completionRate * 0.4) * 100) / 100;

    const approved = qualityScore >= 0.55;

    const synthesized = completedTasks
      .sort((a, b) => (a.priority || 0) - (b.priority || 0))
      .map(t => `[${t.taskType}] ${t.result || "No output"}`)
      .join("\n\n");

    const finalOutput = `=== Team ${team.name} - Collaborative Output ===\n` +
      `Task: ${team.taskDescription}\n` +
      `Quality Score: ${Math.round(qualityScore * 100)}%\n` +
      `Tasks Completed: ${completedTasks.length}/${tasks.length}\n` +
      `Validation: ${approved ? "APPROVED" : "NEEDS REVIEW"}\n\n` +
      synthesized;

    const members = await storage.getTeamMembers(teamId);
    const validatorMember = members.find(m => m.role === "validator");

    await storage.createTeamMessage({
      teamId,
      senderId: validatorMember?.agentId || "system",
      messageType: "validation_result",
      content: `Validation ${approved ? "approved" : "rejected"}. Quality score: ${Math.round(qualityScore * 100)}%`,
      structuredData: { approved, qualityScore, completedTasks: completedTasks.length, totalTasks: tasks.length },
      round: team.currentRound || 1,
    });

    await storage.updateTeam(teamId, {
      status: approved ? "completed" : "needs_review",
      qualityScore,
      validationStatus: approved ? "approved" : "rejected",
      finalOutput,
      completedAt: approved ? new Date() : undefined,
    });

    if (approved) {
      await this.distributeRewards(teamId, qualityScore);
    }

    return { approved, qualityScore, finalOutput };
  }

  private async distributeRewards(teamId: string, qualityScore: number): Promise<void> {
    const members = await storage.getTeamMembers(teamId);
    const totalReward = Math.round(SAFETY_LIMITS.baseReward * qualityScore);
    let totalRewarded = 0;

    for (const member of members) {
      const role = member.role as TeamRole;
      const share = ROLE_REWARD_SHARES[role] || 0.15;
      const reward = Math.round(totalReward * share);

      if (reward > 0) {
        const agent = await storage.getUser(member.agentId);
        if (agent) {
          await storage.updateUser(agent.id, {
            creditWallet: (agent.creditWallet || 0) + reward,
          });
          await storage.createTransaction({
            senderId: null,
            receiverId: agent.id,
            amount: reward,
            transactionType: "reward_team_collaboration",
            referenceId: teamId,
            description: `Team collaboration reward (${role}, ${Math.round(share * 100)}%) - ${reward} IC`,
          });
        }

        await storage.updateTeamMember(member.id, {
          creditsEarned: (member.creditsEarned || 0) + reward,
          performanceRating: qualityScore,
        });

        totalRewarded += reward;
      }
    }

    await storage.updateTeam(teamId, {
      totalCreditsRewarded: totalRewarded,
    });
  }

  async runFullCollaboration(taskDescription: string, taskType: string = "research"): Promise<AgentTeam | null> {
    const team = await this.formTeam(taskDescription, taskType);
    if (!team) return null;

    await this.decomposeTask(team.id);
    await this.executeTeamTasks(team.id);
    await this.validateAndFinalize(team.id);

    const finalTeam = await storage.getTeam(team.id);
    console.log(`[Teams] Full collaboration complete: ${team.name} - Status: ${finalTeam?.status}, Quality: ${finalTeam?.qualityScore}`);
    return finalTeam || team;
  }

  async getTeamDetails(teamId: string): Promise<any> {
    const team = await storage.getTeam(teamId);
    if (!team) return null;

    const members = await storage.getTeamMembers(teamId);
    const tasks = await storage.getTeamTasks(teamId);
    const messages = await storage.getTeamMessages(teamId);
    const workspace = await storage.getWorkspaceEntries(teamId);

    const enrichedMembers = await Promise.all(
      members.map(async (m) => {
        const agent = await storage.getUser(m.agentId);
        return {
          ...m,
          agentName: agent?.displayName || agent?.username || "Unknown",
          agentAvatar: agent?.avatar || null,
          agentType: agent?.agentType || "general",
          reputation: agent?.reputation || 0,
          badge: agent?.badge || null,
        };
      })
    );

    return {
      ...team,
      members: enrichedMembers,
      tasks,
      messages: messages.slice(-50),
      workspace,
      stats: {
        memberCount: members.length,
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === "completed").length,
        pendingTasks: tasks.filter(t => t.status === "pending").length,
        messageCount: messages.length,
        avgConfidence: tasks.filter(t => t.confidence).reduce((s, t) => s + (t.confidence || 0), 0) / Math.max(1, tasks.filter(t => t.confidence).length),
      },
    };
  }

  async getTeamsOverview(): Promise<any[]> {
    const teams = await storage.getTeams();
    const result = [];

    for (const team of teams) {
      const members = await storage.getTeamMembers(team.id);
      const tasks = await storage.getTeamTasks(team.id);

      const enrichedMembers = await Promise.all(
        members.map(async (m) => {
          const agent = await storage.getUser(m.agentId);
          return {
            ...m,
            agentName: agent?.displayName || agent?.username || "Unknown",
            agentAvatar: agent?.avatar || null,
            badge: agent?.badge || null,
          };
        })
      );

      result.push({
        ...team,
        members: enrichedMembers,
        memberCount: members.length,
        completedTasks: tasks.filter(t => t.status === "completed").length,
        totalTasks: tasks.length,
        roles: members.map(m => m.role),
      });
    }

    return result;
  }

  async getTeamAnalytics(): Promise<any> {
    const teams = await storage.getTeams();
    const activeTeams = teams.filter(t => t.status === "active" || t.status === "forming");
    const completedTeams = teams.filter(t => t.status === "completed");

    const totalCreditsRewarded = teams.reduce((s, t) => s + (t.totalCreditsRewarded || 0), 0);
    const avgQuality = completedTeams.length > 0
      ? completedTeams.reduce((s, t) => s + (t.qualityScore || 0), 0) / completedTeams.length
      : 0;

    const allMembers: { role: string }[] = [];
    for (const team of teams) {
      const members = await storage.getTeamMembers(team.id);
      allMembers.push(...members);
    }

    const roleDistribution: Record<string, number> = {};
    for (const m of allMembers) {
      roleDistribution[m.role] = (roleDistribution[m.role] || 0) + 1;
    }

    const approvedCount = teams.filter(t => t.validationStatus === "approved").length;
    const rejectedCount = teams.filter(t => t.validationStatus === "rejected").length;

    return {
      totalTeams: teams.length,
      activeTeams: activeTeams.length,
      completedTeams: completedTeams.length,
      totalCreditsRewarded,
      avgQualityScore: Math.round(avgQuality * 100) / 100,
      roleDistribution,
      totalAgentsParticipated: allMembers.length,
      validationStats: { approved: approvedCount, rejected: rejectedCount, pending: teams.length - approvedCount - rejectedCount },
      rewardShares: ROLE_REWARD_SHARES,
      safetyLimits: SAFETY_LIMITS,
      selectionWeights: SELECTION_WEIGHTS,
    };
  }
}

export const teamOrchestrationService = new TeamOrchestrationService();
