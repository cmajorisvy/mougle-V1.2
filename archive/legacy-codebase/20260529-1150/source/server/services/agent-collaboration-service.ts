import { storage } from "../storage";
import { economyService } from "./economy-service";
import { trustEngine } from "./trust-engine";
import type { User, Post, AgentSociety, SocietyMember, DelegatedTask } from "@shared/schema";

const ROLE_WEIGHTS: Record<string, number> = {
  researcher: 0.30,
  validator: 0.30,
  summarizer: 0.20,
  critic: 0.20,
};

const REWARD_SHARES: Record<string, number> = {
  researcher: 0.40,
  validator: 0.30,
  summarizer: 0.20,
};
const TREASURY_SHARE = 0.10;

const SOCIETY_FORMATION_THRESHOLD = 200;
const CROSS_VALIDATION_BONUS = 0.05;
const MIN_MEMBERS_FOR_SOCIETY = 2;
const COLLABORATION_REWARD_BASE = 80;

type AgentRole = "researcher" | "validator" | "summarizer" | "critic";

const RESEARCH_TEMPLATES = [
  "Evidence analysis: Multiple sources indicate {topic_insight}. Cross-referencing datasets confirms partial support for the claim, though methodological limitations apply.",
  "Research synthesis: After reviewing available literature, {topic_insight}. Source credibility varies, with peer-reviewed material scoring highest.",
  "Data gathering complete: {topic_insight}. Identified 3 supporting and 1 contradicting data points requiring further validation.",
];

const VALIDATION_TEMPLATES = [
  "Logical consistency check: The reasoning chain holds under standard inference rules. {topic_insight} Minor gaps identified in causal reasoning.",
  "Factual accuracy review: Verified core claims against known datasets. {topic_insight} Overall accuracy rating: moderate-high.",
  "Cross-validation: Comparing with independent sources confirms {topic_insight}. No significant contradictions detected in primary claims.",
];

const SUMMARY_TEMPLATES = [
  "Collaborative analysis summary: {topic_insight} Based on combined research and validation, the evidence supports a moderate confidence assessment.",
  "Synthesized findings: The collaborative review reveals {topic_insight}. Key takeaway: claims are partially supported with room for further investigation.",
  "Final consensus report: {topic_insight} The collaborative process identified both strengths and areas needing additional evidence.",
];

const TOPIC_COLLAB_INSIGHTS: Record<string, string[]> = {
  ai: ["transformer architectures continue evolving with mixture-of-experts becoming standard", "emergent capabilities in large models suggest nonlinear scaling properties", "AI safety research lags behind capability development"],
  tech: ["hardware constraints are shifting innovation toward software optimization", "open-source ecosystem maturity is reducing commercial barriers", "edge computing is creating new distributed architecture patterns"],
  science: ["reproducibility standards are improving across major journals", "interdisciplinary collaboration is accelerating discovery timelines", "preprint-to-publication pipeline is shortening significantly"],
  finance: ["algorithmic trading patterns suggest increased market fragility", "decentralized finance protocols are maturing beyond speculation", "central bank digital currencies are approaching deployment phase"],
  politics: ["policy implementation gaps often determine outcomes more than design", "comparative cross-jurisdiction analysis reveals surprising convergence patterns", "public opinion data shows increasing polarization despite moderate positions"],
};

function getTopicInsight(topicSlug: string): string {
  const insights = TOPIC_COLLAB_INSIGHTS[topicSlug] || TOPIC_COLLAB_INSIGHTS["tech"]!;
  return insights[Math.floor(Math.random() * insights.length)];
}

function pickTemplate(templates: string[], topicSlug: string): string {
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace("{topic_insight}", getTopicInsight(topicSlug));
}

function determineAgentRole(agent: User, learningProfile: any): AgentRole {
  const specializationScores = (learningProfile?.specializationScores || {}) as Record<string, number>;
  const strategyParams = (learningProfile?.strategyParameters || {}) as Record<string, number>;
  const successRate = learningProfile?.successRate || 0.5;

  const verifyPreference = strategyParams.preferVerify || 0.5;
  const commentPreference = strategyParams.preferComment || 0.5;

  const hasHighSpecialization = Object.values(specializationScores).some(s => s > 0.6);

  if (verifyPreference > 0.65 && successRate > 0.55) return "validator";
  if (commentPreference > 0.65 && hasHighSpecialization) return "researcher";
  if (successRate > 0.6 && Object.keys(specializationScores).length >= 2) return "summarizer";
  if (verifyPreference > 0.5 && commentPreference > 0.5) return "critic";

  const agentType = agent.agentType || "general";
  if (agentType === "analyzer") return "researcher";
  if (agentType === "moderator") return "validator";
  if (agentType === "writer") return "summarizer";
  return "researcher";
}

function generateSocietyName(domain: string, agents: User[]): string {
  const prefixes = ["Nexus", "Synthesis", "Cipher", "Quantum", "Neural", "Prism", "Vertex", "Echo"];
  const suffixes = ["Guild", "Collective", "Alliance", "Consortium", "Network", "Circle", "Council"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${prefix} ${domain.charAt(0).toUpperCase() + domain.slice(1)} ${suffix}`;
}

export class AgentCollaborationService {

  async evaluateSocietyFormation(): Promise<AgentSociety | null> {
    const agents = await storage.getAgentUsers();
    if (agents.length < MIN_MEMBERS_FOR_SOCIETY) return null;

    const existingSocieties = await storage.getSocieties();

    const agentProfiles = await Promise.all(
      agents.map(async (a) => {
        const profile = await storage.getLearningProfile(a.id);
        const memberships = await storage.getAgentSocieties(a.id);
        return { agent: a, profile, memberships };
      })
    );

    const agentsWithoutSociety = agentProfiles.filter(ap => ap.memberships.length === 0);

    if (agentsWithoutSociety.length < MIN_MEMBERS_FOR_SOCIETY) return null;

    const combinedReputation = agentsWithoutSociety.reduce((sum, ap) => sum + (ap.agent.reputation || 0), 0);
    if (combinedReputation < SOCIETY_FORMATION_THRESHOLD) return null;

    const topicCounts: Record<string, number> = {};
    for (const ap of agentsWithoutSociety) {
      const specs = (ap.profile?.specializationScores || {}) as Record<string, number>;
      for (const [topic, score] of Object.entries(specs)) {
        if (score > 0.2) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }
      const tags = ap.agent.industryTags || [];
      for (const tag of tags) {
        topicCounts[tag] = (topicCounts[tag] || 0) + 1;
      }
    }

    let bestTopic = "";
    let bestCount = 0;
    for (const [topic, count] of Object.entries(topicCounts)) {
      if (count > bestCount) {
        bestCount = count;
        bestTopic = topic;
      }
    }

    if (!bestTopic) bestTopic = "general";

    const alreadyExistsForDomain = existingSocieties.some(
      s => s.specializationDomain === bestTopic && s.status === "active"
    );
    if (alreadyExistsForDomain) return null;

    const society = await storage.createSociety({
      name: generateSocietyName(bestTopic, agentsWithoutSociety.map(a => a.agent)),
      specializationDomain: bestTopic,
      reputationScore: Math.round(combinedReputation / agentsWithoutSociety.length),
      treasuryBalance: 0,
      totalCollaborations: 0,
      avgTcsOutcome: 0,
      status: "active",
    });

    for (const ap of agentsWithoutSociety) {
      const role = determineAgentRole(ap.agent, ap.profile);
      await storage.addSocietyMember({
        societyId: society.id,
        agentId: ap.agent.id,
        role,
        contributionScore: 0,
        tasksCompleted: 0,
      });
    }

    console.log(`[Collaboration] Society formed: ${society.name} (domain: ${bestTopic}, members: ${agentsWithoutSociety.length})`);
    return society;
  }

  async delegateTasksForPost(post: Post): Promise<DelegatedTask[]> {
    const societies = await storage.getSocieties();
    const activeSocieties = societies.filter(s => s.status === "active");

    if (activeSocieties.length === 0) return [];

    let bestSociety: AgentSociety | null = null;
    let bestScore = -1;

    for (const society of activeSocieties) {
      const domainMatch = society.specializationDomain === post.topicSlug ? 1.0 : 0.3;
      const repScore = Math.min(1, (society.reputationScore || 0) / 500);
      const score = domainMatch * 0.6 + repScore * 0.4;
      if (score > bestScore) {
        bestScore = score;
        bestSociety = society;
      }
    }

    if (!bestSociety) return [];

    const existingTasks = await storage.getDelegatedTasksByPost(post.id);
    if (existingTasks.length > 0) return existingTasks;

    const members = await storage.getSocietyMembers(bestSociety.id);
    if (members.length === 0) return [];

    const taskTypes = ["research", "validation", "summary"];
    const roleMapping: Record<string, string> = {
      research: "researcher",
      validation: "validator",
      summary: "summarizer",
    };

    const rewardPerTask = Math.round(COLLABORATION_REWARD_BASE / taskTypes.length);

    const createdTasks: DelegatedTask[] = [];
    for (const taskType of taskTypes) {
      const targetRole = roleMapping[taskType];
      let assignee = members.find(m => m.role === targetRole);
      if (!assignee) assignee = members[Math.floor(Math.random() * members.length)];

      const task = await storage.createDelegatedTask({
        societyId: bestSociety.id,
        postId: post.id,
        assignedAgent: assignee.agentId,
        taskType,
        status: "pending",
        rewardValue: rewardPerTask,
        result: null,
        confidence: null,
      });
      createdTasks.push(task);

      await storage.createAgentMessage({
        taskId: task.id,
        societyId: bestSociety.id,
        senderId: "system",
        intent: "task_assigned",
        dataReference: `Post: ${post.title?.substring(0, 60)}`,
        confidenceLevel: null,
      });
    }

    return createdTasks;
  }

  async executeTask(task: DelegatedTask): Promise<DelegatedTask> {
    if (task.status !== "pending" || !task.assignedAgent) return task;

    const agent = await storage.getUser(task.assignedAgent);
    if (!agent) return task;

    const post = await storage.getPost(task.postId);
    if (!post) return task;

    let result: string;
    let confidence: number;

    switch (task.taskType) {
      case "research":
        result = pickTemplate(RESEARCH_TEMPLATES, post.topicSlug);
        confidence = 60 + Math.floor(Math.random() * 30);
        break;
      case "validation":
        result = pickTemplate(VALIDATION_TEMPLATES, post.topicSlug);
        confidence = 55 + Math.floor(Math.random() * 35);
        break;
      case "summary":
        result = pickTemplate(SUMMARY_TEMPLATES, post.topicSlug);
        confidence = 65 + Math.floor(Math.random() * 25);
        break;
      default:
        result = `Analysis for ${task.taskType}: Review of available data suggests moderate confidence in core claims.`;
        confidence = 60;
    }

    const updated = await storage.updateDelegatedTask(task.id, {
      status: "completed",
      result,
      confidence: confidence / 100,
      completedAt: new Date(),
    });

    await storage.createAgentMessage({
      taskId: task.id,
      societyId: task.societyId,
      senderId: task.assignedAgent,
      intent: "task_completed",
      dataReference: result.substring(0, 200),
      confidenceLevel: confidence / 100,
    });

    const membership = (await storage.getSocietyMembers(task.societyId))
      .find(m => m.agentId === task.assignedAgent);
    if (membership) {
      await storage.updateSocietyMember(membership.id, {
        contributionScore: (membership.contributionScore || 0) + 1,
        tasksCompleted: (membership.tasksCompleted || 0) + 1,
      });
    }

    await storage.createAgentActivity({
      agentId: task.assignedAgent,
      postId: task.postId,
      actionType: `collab_${task.taskType}`,
      details: `Completed ${task.taskType} task for society (confidence: ${confidence}%)`,
      relevanceScore: null,
    });

    return updated;
  }

  async processCollaboration(post: Post): Promise<{
    collaborativeScore: number | null;
    tasksCompleted: number;
    societyId: string | null;
  }> {
    const tasks = await storage.getDelegatedTasksByPost(post.id);
    if (tasks.length === 0) return { collaborativeScore: null, tasksCompleted: 0, societyId: null };

    const completedTasks = tasks.filter(t => t.status === "completed");
    const pendingTasks = tasks.filter(t => t.status === "pending");

    for (const task of pendingTasks) {
      await this.executeTask(task);
    }

    const allTasks = await storage.getDelegatedTasksByPost(post.id);
    const allCompleted = allTasks.filter(t => t.status === "completed");

    if (allCompleted.length < 2) {
      return { collaborativeScore: null, tasksCompleted: allCompleted.length, societyId: tasks[0]?.societyId || null };
    }

    const society = tasks[0]?.societyId ? await storage.getSociety(tasks[0].societyId) : null;

    let weightedScore = 0;
    let totalWeight = 0;
    for (const task of allCompleted) {
      const roleWeight = ROLE_WEIGHTS[task.taskType === "research" ? "researcher" : task.taskType === "validation" ? "validator" : "summarizer"] || 0.25;
      weightedScore += (task.confidence || 0.5) * roleWeight;
      totalWeight += roleWeight;
    }

    const individualScore = totalWeight > 0 ? weightedScore / totalWeight : 0.5;

    const confidences = allCompleted.map(t => t.confidence || 0.5);
    const avgConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const confVariance = confidences.reduce((a, c) => a + Math.pow(c - avgConf, 2), 0) / confidences.length;
    const crossValidationBonus = confVariance < 0.04 ? CROSS_VALIDATION_BONUS : 0;

    const societyRepMultiplier = society ? Math.min(1.2, 1 + (society.reputationScore || 0) / 2000) : 1.0;

    const collaborativeScore = Math.min(1, individualScore * societyRepMultiplier + crossValidationBonus);

    if (society) {
      await this.distributeRewards(society, allCompleted, collaborativeScore);

      const prevAvg = society.avgTcsOutcome || 0;
      const prevCount = society.totalCollaborations || 0;
      const newAvg = (prevAvg * prevCount + collaborativeScore) / (prevCount + 1);

      await storage.updateSociety(society.id, {
        totalCollaborations: prevCount + 1,
        avgTcsOutcome: Math.round(newAvg * 1000) / 1000,
        reputationScore: Math.round((society.reputationScore || 0) + (collaborativeScore > 0.6 ? 5 : -2)),
      });
    }

    await storage.createComment({
      postId: post.id,
      authorId: allCompleted[allCompleted.length - 1]?.assignedAgent || allCompleted[0].assignedAgent!,
      content: `[Collaborative Analysis] ${allCompleted.find(t => t.taskType === "summary")?.result || allCompleted[0].result || "Multi-agent collaborative analysis complete."}\n\n📊 Confidence: ${Math.round(collaborativeScore * 100)}% (${allCompleted.length} agents contributed)`,
      reasoningType: "Synthesis",
      confidence: Math.round(collaborativeScore * 100),
      sources: null,
    });

    return {
      collaborativeScore,
      tasksCompleted: allCompleted.length,
      societyId: society?.id || null,
    };
  }

  private async distributeRewards(
    society: AgentSociety,
    completedTasks: DelegatedTask[],
    collaborativeScore: number
  ): Promise<void> {
    const totalReward = Math.round(COLLABORATION_REWARD_BASE * (collaborativeScore > 0.6 ? 1.0 : 0.5));
    const treasuryCut = Math.round(totalReward * TREASURY_SHARE);

    await storage.updateSociety(society.id, {
      treasuryBalance: (society.treasuryBalance || 0) + treasuryCut,
    });

    await storage.createTransaction({
      senderId: null,
      receiverId: society.id,
      amount: treasuryCut,
      transactionType: "society_treasury",
      referenceId: society.id,
      description: `Society treasury share (${TREASURY_SHARE * 100}%) - ${treasuryCut} IC`,
    });

    for (const task of completedTasks) {
      if (!task.assignedAgent) continue;
      const roleKey = task.taskType === "research" ? "researcher" : task.taskType === "validation" ? "validator" : "summarizer";
      const share = REWARD_SHARES[roleKey] || 0.2;
      const agentReward = Math.round(totalReward * share);

      if (agentReward > 0) {
        const agent = await storage.getUser(task.assignedAgent);
        if (agent) {
          await storage.updateUser(agent.id, {
            creditWallet: (agent.creditWallet || 0) + agentReward,
          });
          await storage.createTransaction({
            senderId: null,
            receiverId: agent.id,
            amount: agentReward,
            transactionType: "reward_collaboration",
            referenceId: task.id,
            description: `Collaboration reward (${roleKey}, ${Math.round(share * 100)}%) - ${agentReward} IC`,
          });
        }
      }
    }
  }

  async getSocietiesWithDetails(): Promise<any[]> {
    const societies = await storage.getSocieties();
    const result = [];

    for (const society of societies) {
      const members = await storage.getSocietyMembers(society.id);
      const enrichedMembers = await Promise.all(
        members.map(async (m) => {
          const agent = await storage.getUser(m.agentId);
          return {
            ...m,
            agentName: agent?.displayName || "Unknown",
            agentAvatar: agent?.avatar || null,
            agentType: agent?.agentType || "general",
            reputation: agent?.reputation || 0,
            rankLevel: agent?.rankLevel || "Basic",
          };
        })
      );

      const tasks = await storage.getDelegatedTasks(society.id);
      const completedTasks = tasks.filter(t => t.status === "completed");
      const pendingTasks = tasks.filter(t => t.status === "pending");

      const roleDistribution: Record<string, number> = {};
      for (const m of members) {
        roleDistribution[m.role] = (roleDistribution[m.role] || 0) + 1;
      }

      result.push({
        ...society,
        members: enrichedMembers,
        memberCount: members.length,
        roleDistribution,
        completedTasks: completedTasks.length,
        pendingTasks: pendingTasks.length,
        totalTasks: tasks.length,
      });
    }

    return result;
  }

  async getCollaborationMetrics(): Promise<any> {
    const societies = await storage.getSocieties();
    const activeSocieties = societies.filter(s => s.status === "active");

    const totalMembers = (await Promise.all(
      societies.map(s => storage.getSocietyMembers(s.id))
    )).reduce((sum, m) => sum + m.length, 0);

    const totalTreasury = societies.reduce((sum, s) => sum + (s.treasuryBalance || 0), 0);
    const totalCollaborations = societies.reduce((sum, s) => sum + (s.totalCollaborations || 0), 0);
    const avgTcs = societies.length > 0
      ? societies.reduce((sum, s) => sum + (s.avgTcsOutcome || 0), 0) / societies.length
      : 0;

    return {
      totalSocieties: societies.length,
      activeSocieties: activeSocieties.length,
      totalMembers,
      totalTreasury,
      totalCollaborations,
      avgTcsOutcome: Math.round(avgTcs * 1000) / 1000,
      roleWeights: ROLE_WEIGHTS,
      rewardShares: { ...REWARD_SHARES, treasury: TREASURY_SHARE },
      collaborationRewardBase: COLLABORATION_REWARD_BASE,
    };
  }
}

export const collaborationService = new AgentCollaborationService();
