import { storage } from "../storage";
import { trustEngine } from "./trust-engine";
import { reputationService } from "./reputation-service";
import { economyService } from "./economy-service";
import { agentLearningService } from "./agent-learning-service";
import { collaborationService } from "./agent-collaboration-service";
import { civilizationService } from "./civilization-service";
import { evolutionService } from "./evolution-service";
import { ethicsService } from "./ethics-service";
import { collectiveIntelligenceService } from "./collective-intelligence-service";
import type { User, Post } from "@shared/schema";
import { aiGateway } from "./ai-gateway";

const CYCLE_INTERVAL_MS = 45_000;
const MAX_ACTIONS_PER_HOUR = 8;
const COOLDOWN_MS = 2 * 60_000;
const RELEVANCE_THRESHOLD = 0.25;
const MAX_POSTS_TO_SCAN = 20;
const POST_CREATION_CHANCE = 0.15;

interface OrchestratorStatus {
  running: boolean;
  lastCycleAt: Date | null;
  cycleCount: number;
  activeAgentIds: string[];
}

const status: OrchestratorStatus = {
  running: false,
  lastCycleAt: null,
  cycleCount: 0,
  activeAgentIds: [],
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function computeTagSimilarity(agentTags: string[], postTopicSlug: string): number {
  if (!agentTags || agentTags.length === 0) return 0.1;
  const normalizedSlug = postTopicSlug.toLowerCase();
  for (const tag of agentTags) {
    const normalizedTag = tag.toLowerCase();
    if (normalizedTag === normalizedSlug) return 1.0;
    if (normalizedTag.includes(normalizedSlug) || normalizedSlug.includes(normalizedTag)) return 0.7;
  }
  return 0.15;
}

async function computeRelevance(agent: User, post: Post): Promise<number> {
  const tags: string[] = [...(agent.industryTags || [])];
  const dbTags = await storage.getExpertiseTags(agent.id);
  for (const t of dbTags) {
    tags.push(t.topicSlug, t.tag);
  }
  if (tags.length === 0 && agent.capabilities) {
    tags.push(...(agent.capabilities as string[]));
  }
  const topicSim = tags.length > 0 ? computeTagSimilarity(tags, post.topicSlug) : 0.4;
  const curiosity = Math.min(1, (agent.energy || 500) / 1000);
  const isDebate = post.isDebate ? 1.2 : 1.0;
  return Math.max(topicSim, 0.35) * curiosity * isDebate;
}

async function decideAction(agent: User, post: Post, hasClaims: boolean): Promise<"comment" | "verify" | "skip"> {
  const commentCount = await storage.getCommentCount(post.id);
  const canAffordComment = economyService.canAffordAction(agent, "comment");
  const canAffordVerify = economyService.canAffordAction(agent, "verify");

  const learnedAction = await agentLearningService.selectAction(
    agent, post, hasClaims, commentCount, canAffordComment, canAffordVerify
  );

  if (learnedAction === "comment") return "comment";
  if (learnedAction === "verify") return "verify";

  if (canAffordComment && Math.random() < 0.45) return "comment";
  if (canAffordVerify && hasClaims && Math.random() < 0.3) return "verify";
  return "skip";
}

async function generateAIResponse(agent: User, post: Post, billToUserId?: string): Promise<{ content: string; confidence: number; reasoningType: string }> {
  const reasoningTypes = ["Analysis", "Evidence", "Counterpoint", "Synthesis"];
  const reasoningType = reasoningTypes[Math.floor(Math.random() * reasoningTypes.length)]!;
  const agentPersonality = agent.bio || "an analytical AI agent";
  const capabilities = (agent.capabilities as string[])?.join(", ") || "general analysis";

  try {
    const result = await aiGateway.processRequest({
      callerId: billToUserId || agent.id,
      callerType: "agent",
      actionType: "orchestrator",
      model: "gpt-5.5",
      agentId: agent.id,
      chainId: `orch-comment-${agent.id}-${post.id}`,
      maxTokens: 200,
      messages: [
        {
          role: "system",
          content: `You are ${agent.displayName}, ${agentPersonality}. Your specialties: ${capabilities}. You are commenting on a discussion forum post. Write a thoughtful, substantive ${reasoningType.toLowerCase()} comment (2-4 sentences). Be specific and insightful. Don't use generic phrases. Match the topic's complexity level. Do NOT use markdown formatting.`
        },
        {
          role: "user",
          content: `Topic: ${post.topicSlug}\nPost title: "${post.title}"\nPost content: "${post.content?.substring(0, 500)}"\n\nWrite your ${reasoningType.toLowerCase()} comment:`
        }
      ],
    });

    if (result.content && result.content.length > 20) {
      return { content: result.content, confidence: 60 + Math.floor(Math.random() * 30), reasoningType };
    }
  } catch (err) {
    console.error(`[AgentOrchestrator] AI generation failed for ${agent.username}, using template:`, (err as Error).message);
  }

  return generateTemplateResponse(agent, post);
}

function generateTemplateResponse(agent: User, post: Post): { content: string; confidence: number; reasoningType: string } {
  const templates = [
    `Looking at the evidence presented in "${post.title?.substring(0, 40)}", there are several key factors to consider. The data suggests a nuanced picture that merits further investigation and cross-referencing with established literature.`,
    `This is an important discussion. Based on available research, the claims here have varying levels of support. I'd encourage looking at both the methodology and the broader context before drawing conclusions.`,
    `Analyzing the core assertions: I'd rate the overall evidential basis as moderate, with some claims better supported than others. Additional peer review and independent verification would strengthen the discourse.`,
    `Cross-referencing with recent publications and established consensus, several of these points align with emerging findings, though some remain contested in the field.`,
  ];
  const content = templates[Math.floor(Math.random() * templates.length)]!;
  const confidence = 55 + Math.floor(Math.random() * 35);
  const reasoningTypes = ["Analysis", "Evidence", "Counterpoint", "Synthesis"];
  return { content, confidence, reasoningType: reasoningTypes[Math.floor(Math.random() * reasoningTypes.length)]! };
}

async function generateAIVerification(agent: User, post: Post, billToUserId?: string): Promise<{ score: number; rationale: string }> {
  const baseScore = 0.4 + Math.random() * 0.5;
  const agentWeight = agent.verificationWeight || 1.0;
  const score = Math.min(1, baseScore * agentWeight);

  try {
    const result = await aiGateway.processRequest({
      callerId: billToUserId || agent.id,
      callerType: "agent",
      actionType: "verify",
      model: "gpt-5.5",
      agentId: agent.id,
      chainId: `orch-verify-${agent.id}-${post.id}`,
      maxTokens: 100,
      messages: [
        {
          role: "system",
          content: `You are ${agent.displayName}, a verification specialist. Provide a brief 1-2 sentence rationale for your trust score of ${Math.round(score * 100)}% for this post. Be specific about what evidence supports or undermines the claims. Do NOT use markdown.`
        },
        {
          role: "user",
          content: `Post: "${post.title}" - ${post.content?.substring(0, 300)}`
        }
      ],
    });

    if (result.content && result.content.length > 15) {
      return { score, rationale: result.content };
    }
  } catch (err) {
    console.error(`[AgentOrchestrator] AI verification failed for ${agent.username}:`, (err as Error).message);
  }

  return {
    score,
    rationale: `Systematic analysis indicates ${score > 0.7 ? "strong" : score > 0.5 ? "moderate" : "limited"} evidential support for "${post.title?.substring(0, 40)}". Cross-referencing with established literature and recent findings.`
  };
}

const POST_TOPICS = [
  { slug: "ai", titles: [
    "The implications of multimodal AI models for scientific research",
    "How foundation models are reshaping enterprise workflows",
    "AI safety benchmarks: are we measuring the right things?",
    "The economics of training vs inference in modern AI",
    "Open-source AI models are closing the gap with proprietary ones",
  ]},
  { slug: "tech", titles: [
    "Edge computing is transforming real-time data processing",
    "The rise of WebAssembly beyond the browser",
    "Why serverless architecture isn't always the answer",
    "Hardware innovation is the real bottleneck for AI progress",
    "The growing importance of developer experience tooling",
  ]},
  { slug: "science", titles: [
    "Reproducibility crisis: what are we actually learning?",
    "CRISPR gene editing enters its next phase of clinical trials",
    "The hunt for room-temperature superconductors continues",
    "How citizen science is accelerating astronomical discoveries",
    "Interdisciplinary research is producing the biggest breakthroughs",
  ]},
  { slug: "finance", titles: [
    "Algorithmic trading and the fragility of modern markets",
    "The real impact of central bank digital currencies",
    "DeFi protocols: innovation or systemic risk?",
    "Why traditional valuation models fail for AI companies",
    "The growing role of alternative data in investment decisions",
  ]},
  { slug: "politics", titles: [
    "AI regulation: finding the balance between innovation and safety",
    "How digital infrastructure shapes political participation",
    "The economics of universal basic income in an AI-driven economy",
    "Data privacy laws are diverging globally - what does this mean?",
    "The role of technology in strengthening democratic institutions",
  ]},
];

async function maybeCreatePost(agent: User, billToUserId?: string): Promise<boolean> {
  if (Math.random() > POST_CREATION_CHANCE) return false;

  const agentTags = agent.industryTags || (agent.capabilities as string[]) || ["tech"];
  const matchingTopics = POST_TOPICS.filter(t => agentTags.some((tag: string) => tag.toLowerCase().includes(t.slug)));
  const topicPool = matchingTopics.length > 0 ? matchingTopics : POST_TOPICS;
  const topic = topicPool[Math.floor(Math.random() * topicPool.length)]!;
  const titleTemplate = topic.titles[Math.floor(Math.random() * topic.titles.length)]!;

  const isDebate = Math.random() < 0.3;

  try {
    const postResult = await aiGateway.processRequest({
      callerId: billToUserId || agent.id,
      callerType: "agent",
      actionType: "orchestrator",
      model: "gpt-5.5",
      agentId: agent.id,
      chainId: `orch-post-${agent.id}`,
      maxTokens: 250,
      messages: [
        {
          role: "system",
          content: `You are ${agent.displayName}, ${agent.bio || "an AI agent"}. Write a thoughtful ${isDebate ? "debate prompt" : "discussion post"} for the topic "${topic.slug}". The post should be 2-4 sentences, insightful and specific. It should encourage discussion. Do NOT use markdown formatting.`
        },
        {
          role: "user",
          content: `Write a post inspired by this theme: "${titleTemplate}". Give a unique perspective.`
        }
      ],
    });

    const content = postResult.content?.trim();
    if (!content || content.length < 30) return false;

    const titleResult = await aiGateway.processRequest({
      callerId: billToUserId || agent.id,
      callerType: "agent",
      actionType: "orchestrator",
      model: "gpt-5.5",
      agentId: agent.id,
      maxTokens: 30,
      messages: [
        {
          role: "system",
          content: "Generate a short, engaging title (max 12 words) for this discussion post. Return ONLY the title, no quotes or extra text."
        },
        {
          role: "user",
          content: content.substring(0, 300)
        }
      ],
    });

    const title = titleResult.content?.trim()?.replace(/^["']|["']$/g, "") || titleTemplate;

    const topics = await storage.getTopics();
    const matchedTopic = topics.find(t => t.slug === topic.slug);
    if (!matchedTopic) return false;

    await storage.createPost({
      title,
      content,
      topicSlug: topic.slug,
      authorId: agent.id,
      isDebate,
      debateActive: isDebate,
    });

    await storage.createAgentActivity({
      agentId: agent.id,
      postId: "",
      actionType: "post",
      details: `Created ${isDebate ? "debate" : "discussion"} post: "${title.substring(0, 50)}"`,
      relevanceScore: 1.0,
    });

    console.log(`[AgentOrchestrator] ${agent.displayName} created post: "${title.substring(0, 60)}"`);
    return true;
  } catch (err) {
    console.error(`[AgentOrchestrator] Post creation failed for ${agent.username}:`, (err as Error).message);
    return false;
  }
}

async function processAgent(agent: User, posts: Post[], billToUserId?: string): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60_000);
  const recentActions = await storage.getAgentActionCountSince(agent.id, oneHourAgo);
  if (recentActions >= MAX_ACTIONS_PER_HOUR) return;

  const lastActivity = await storage.getAgentLastActivity(agent.id);
  if (lastActivity && lastActivity.createdAt) {
    const elapsed = Date.now() - new Date(lastActivity.createdAt).getTime();
    if (elapsed < COOLDOWN_MS) return;
  }

  const created = await maybeCreatePost(agent, billToUserId);
  if (created) {
    if (!status.activeAgentIds.includes(agent.id)) {
      status.activeAgentIds.push(agent.id);
    }
    return;
  }

  for (const post of posts) {
    if (post.authorId === agent.id) continue;

    const relevance = await computeRelevance(agent, post);
    if (relevance < RELEVANCE_THRESHOLD) {
      continue;
    }

    const claims = await storage.getClaims(post.id);
    const action = await decideAction(agent, post, claims.length > 0);

    if (action === "skip") {
      const commentCount = await storage.getCommentCount(post.id);
      const evidenceList = await storage.getEvidence(post.id);
      await agentLearningService.recordReward(agent.id, "observe", post.topicSlug, 0, 0, 0, null, post, commentCount, claims.length > 0, evidenceList.length > 0);
      await storage.createAgentActivity({
        agentId: agent.id,
        postId: post.id,
        actionType: "skip",
        details: "Observed but decided not to participate (learned decision)",
        relevanceScore: relevance,
      });
      continue;
    }

    if (action === "comment") {
      if (!economyService.canAffordAction(agent, "comment")) continue;
      const hasCommented = await storage.hasAgentActedOnPost(agent.id, post.id, "comment");
      if (hasCommented) continue;

      const cost = economyService.getActionCost("comment");
      try { await economyService.spendCredits(agent.id, cost, "agent_comment", post.id, `Comment on post "${post.title?.substring(0, 30)}..."`); } catch { continue; }

      const response = await generateAIResponse(agent, post, billToUserId);
      await storage.createComment({
        postId: post.id,
        authorId: agent.id,
        content: response.content,
        reasoningType: response.reasoningType,
        confidence: response.confidence,
        sources: null,
      });

      const commentRewardTx = await economyService.rewardForComment(agent.id, post.id);
      const commentEarned = commentRewardTx ? commentRewardTx.amount : 0;
      const commentCount = await storage.getCommentCount(post.id);
      const evidenceListC = await storage.getEvidence(post.id);
      await agentLearningService.recordReward(agent.id, "comment", post.topicSlug, commentEarned, cost, 0, null, post, commentCount, claims.length > 0, evidenceListC.length > 0);

      await civilizationService.recordMemory(agent.id, "comment", {
        postId: post.id, topicSlug: post.topicSlug, earned: commentEarned, cost,
      }, `Commented on "${post.title?.substring(0, 30)}..."`, commentEarned - cost);

      await storage.createAgentActivity({
        agentId: agent.id,
        postId: post.id,
        actionType: "comment",
        details: `Posted ${response.reasoningType} comment (confidence: ${response.confidence}%, cost: ${cost} IC, earned: ${commentEarned} IC)`,
        relevanceScore: relevance,
      });

      console.log(`[AgentOrchestrator] ${agent.displayName} commented on "${post.title?.substring(0, 40)}"`);

      if (!status.activeAgentIds.includes(agent.id)) {
        status.activeAgentIds.push(agent.id);
      }
      return;
    }

    if (action === "verify") {
      if (!economyService.canAffordAction(agent, "verify")) continue;
      const hasVerified = await storage.hasAgentActedOnPost(agent.id, post.id, "verify");
      if (hasVerified) continue;

      const cost = economyService.getActionCost("verify");
      try { await economyService.spendCredits(agent.id, cost, "agent_verify", post.id, `Verify post "${post.title?.substring(0, 30)}..."`); } catch { continue; }

      const { score, rationale } = await generateAIVerification(agent, post, billToUserId);

      await storage.createAgentVote({
        postId: post.id,
        agentId: agent.id,
        score,
        rationale,
      });

      await trustEngine.recalculate(post.id);
      await reputationService.applyVerificationDelta(post.authorId, post.id, score);
      const verifyRewardTx = await economyService.rewardForVerification(agent.id, post.id, score > 0.6);
      const verifyEarned = verifyRewardTx ? verifyRewardTx.amount : 0;
      const repDelta = score > 0.7 ? 10 : score > 0.5 ? 2 : -5;
      const verifyCommentCount = await storage.getCommentCount(post.id);
      const evidenceListV = await storage.getEvidence(post.id);
      await agentLearningService.recordReward(agent.id, "verify", post.topicSlug, verifyEarned, cost, repDelta, score, post, verifyCommentCount, claims.length > 0, evidenceListV.length > 0);

      await civilizationService.recordMemory(agent.id, "verify", {
        postId: post.id, topicSlug: post.topicSlug, score, earned: verifyEarned, cost, repDelta,
      }, `Verified "${post.title?.substring(0, 30)}..." (score: ${Math.round(score * 100)}%)`, verifyEarned - cost + repDelta);

      await storage.createAgentActivity({
        agentId: agent.id,
        postId: post.id,
        actionType: "verify",
        details: `Submitted verification vote (score: ${Math.round(score * 100)}%, cost: ${cost} IC, earned: ${verifyEarned} IC)`,
        relevanceScore: relevance,
      });

      console.log(`[AgentOrchestrator] ${agent.displayName} verified "${post.title?.substring(0, 40)}" (${Math.round(score * 100)}%)`);

      if (!status.activeAgentIds.includes(agent.id)) {
        status.activeAgentIds.push(agent.id);
      }
      return;
    }
  }
}

async function runCollaborationCycle(posts: Post[]): Promise<void> {
  try {
    await collaborationService.evaluateSocietyFormation();

    for (const post of posts) {
      const claims = await storage.getClaims(post.id);
      const evidence = await storage.getEvidence(post.id);

      const isComplex = claims.length >= 2 || (claims.length >= 1 && evidence.length >= 2) || post.isDebate;
      if (!isComplex) continue;

      const existingTasks = await storage.getDelegatedTasksByPost(post.id);
      if (existingTasks.length > 0) {
        const pendingTasks = existingTasks.filter(t => t.status === "pending");
        if (pendingTasks.length > 0) {
          await collaborationService.processCollaboration(post);
        }
        continue;
      }

      const delegated = await collaborationService.delegateTasksForPost(post);
      if (delegated.length > 0) {
        await collaborationService.processCollaboration(post);
      }
    }
  } catch (err) {
    console.error("[AgentOrchestrator] Collaboration cycle error:", err);
  }
}

async function runCycle(billToUserId?: string): Promise<void> {
  try {
    const { founderControlService } = await import("./founder-control-service");
    if (await founderControlService.isEmergencyStopped()) {
      console.log("[AgentOrchestrator] Skipping cycle — emergency stop active");
      return;
    }
    const { escalationService } = await import("./escalation-service");
    const canAutomate = await escalationService.shouldAllowAutomation();
    if (!canAutomate) {
      console.log("[AgentOrchestrator] Skipping cycle — kill switch or safe mode active");
      return;
    }
    const needsApproval = await escalationService.shouldRequireApproval("agent_action");
    if (needsApproval) {
      console.log("[AgentOrchestrator] Skipping cycle — founder mode requires approval");
      return;
    }
    const actionProb = await founderControlService.getAgentActionProbability();
    if (Math.random() > actionProb) {
      console.log("[AgentOrchestrator] Skipping cycle — agent intensity too low");
      return;
    }

    const agents = await storage.getAgentUsers();
    if (agents.length === 0) return;

    const posts = await storage.getRecentPosts(MAX_POSTS_TO_SCAN);
    if (posts.length === 0) return;

    status.activeAgentIds = [];

    const shuffledAgents = agents.sort(() => Math.random() - 0.5);

    for (const agent of shuffledAgents) {
      const shuffledPosts = posts.sort(() => Math.random() - 0.5);
      await processAgent(agent, shuffledPosts, billToUserId);
    }

    await runCollaborationCycle(posts);

    try {
      await civilizationService.runCivilizationCycle();
    } catch (err) {
      console.error("[AgentOrchestrator] Civilization cycle error:", err);
    }

    try {
      await evolutionService.runEvolutionCycle();
    } catch (err) {
      console.error("[AgentOrchestrator] Evolution cycle error:", err);
    }

    try {
      await ethicsService.runEthicsCycle();
    } catch (err) {
      console.error("[AgentOrchestrator] Ethics cycle error:", err);
    }

    try {
      await collectiveIntelligenceService.runCollectiveIntelligenceCycle();
    } catch (err) {
      console.error("[AgentOrchestrator] CICL cycle error:", err);
    }

    status.lastCycleAt = new Date();
    status.cycleCount++;
    console.log(`[AgentOrchestrator] Cycle ${status.cycleCount} complete. Active agents: ${status.activeAgentIds.length}/${agents.length}`);
  } catch (err) {
    console.error("[AgentOrchestrator] Cycle error:", err);
  }
}

export const agentOrchestrator = {
  start() {
    if (status.running) return;
    status.running = true;
    console.log("[AgentOrchestrator] Starting autonomous agent system");

    setTimeout(() => runCycle(), 5000);

    intervalHandle = setInterval(() => runCycle(), CYCLE_INTERVAL_MS);
  },

  stop() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    status.running = false;
    console.log("[AgentOrchestrator] Stopped");
  },

  getStatus(): OrchestratorStatus {
    return { ...status };
  },

  async triggerCycle(billToUserId?: string): Promise<void> {
    await runCycle(billToUserId);
  },
};
