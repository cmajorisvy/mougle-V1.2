import OpenAI from "openai";
import { storage } from "../storage";
import { db } from "../db";
import { users as usersTable, userAgents as userAgentsTable, agentCostLogs, agentSpecializations } from "@shared/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { agentProgressionService } from "./agent-progression-service";
import { agentTrustEngine } from "./agent-trust-engine";
import { billingService } from "./billing-service";

function getDefaultClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
}

function getByoaiClient(provider: string, apiKey: string): OpenAI {
  const baseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    together: "https://api.together.xyz/v1",
    groq: "https://api.groq.com/openai/v1",
  };
  return new OpenAI({
    apiKey,
    baseURL: baseUrls[provider] || baseUrls.openai,
  });
}

const CREDIT_COSTS: Record<string, number> = {
  "gpt-5.5": 5,
  "gpt-5": 8,
  "gpt-5-nano": 1,
  "claude-sonnet": 5,
  "gemini-pro": 4,
  chat: 3,
  training_embed: 10,
  training_process: 15,
  demo: 2,
};

export function estimateCost(model: string, actionType: string): number {
  return CREDIT_COSTS[model] || CREDIT_COSTS[actionType] || 3;
}

export function estimateTrainingCost(sourceCount: number, totalChars: number): { embedCredits: number; processCredits: number; total: number } {
  const embedCredits = Math.max(5, Math.ceil(totalChars / 1000) * 2);
  const processCredits = sourceCount * CREDIT_COSTS.training_process;
  return { embedCredits, processCredits, total: embedCredits + processCredits };
}

interface RunAgentResult {
  response: string;
  creditsCharged: number;
  tokensUsed: number;
  byoai: boolean;
}

export async function runAgent(
  agentId: string,
  userMessage: string,
  callerId: string
): Promise<RunAgentResult> {
  const agent = await storage.getUserAgent(agentId);
  if (!agent) throw new Error("Agent not found");

  if (agent.status === "paused") {
    throw new Error("Agent is paused due to insufficient credits. Add credits and resume to continue.");
  }

  const caller = await storage.getUser(callerId);
  if (!caller) throw new Error("User not found");

  const usingByoai = !!(caller.byoaiProvider && caller.byoaiApiKey);
  const { plan, isActive } = await billingService.getSubscriptionStatus(callerId);
  const isPro = !!(isActive && plan && (plan.name === "pro" || plan.name === "expert"));
  const costEstimate = (usingByoai || isPro) ? 0 : estimateCost(agent.model, "chat");

  const result = await db.transaction(async (tx) => {
    if (costEstimate > 0) {
      const [updatedCaller] = await tx.update(usersTable)
        .set({ creditWallet: sql`COALESCE(${usersTable.creditWallet}, 0) - ${costEstimate}` })
        .where(and(
          eq(usersTable.id, callerId),
          gte(usersTable.creditWallet, costEstimate)
        ))
        .returning({ id: usersTable.id, creditWallet: usersTable.creditWallet });

      if (!updatedCaller) {
        throw new Error("Insufficient credits. Please add credits to your wallet.");
      }
    }

    const client = usingByoai
      ? getByoaiClient(caller.byoaiProvider!, caller.byoaiApiKey!)
      : getDefaultClient();

    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    let systemPrompt = agent.systemPrompt || "";

    try {
      const [spec] = await db.select().from(agentSpecializations).where(eq(agentSpecializations.agentId, agentId));
      if (spec) {
        if (spec.industrySystemPrompt) {
          systemPrompt = spec.industrySystemPrompt + "\n\n" + systemPrompt;
        }
        if (spec.complianceDisclaimer) {
          systemPrompt += `\n\nIMPORTANT COMPLIANCE NOTICE: ${spec.complianceDisclaimer} Always include appropriate disclaimers in your responses.`;
        }
        const effects = await agentProgressionService.getSkillEffects(agentId);
        if (Object.keys(effects).length > 0) {
          systemPrompt += `\n\nActive skill modifiers: ${JSON.stringify(effects)}. Adapt your responses according to these enhanced capabilities.`;
        }
      }
    } catch {}

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userMessage });

    let responseText = "";
    let tokensUsed = 0;

    try {
      const completion = await client.chat.completions.create({
        model: agent.model || "gpt-5.5",
        messages,
        temperature: agent.temperature,
        max_completion_tokens: 2048,
      });

      responseText = completion.choices[0]?.message?.content || "No response generated.";
      tokensUsed = completion.usage?.total_tokens || 0;
    } catch (err: any) {
      if (costEstimate > 0) {
        await tx.update(usersTable)
          .set({ creditWallet: sql`COALESCE(${usersTable.creditWallet}, 0) + ${costEstimate}` })
          .where(eq(usersTable.id, callerId));
      }

      await tx.insert(agentCostLogs).values({
        agentId,
        ownerId: callerId,
        actionType: "chat",
        creditsCharged: 0,
        tokensUsed: 0,
        model: agent.model,
        status: "failed",
      });

      throw new Error(`AI call failed: ${err.message}`);
    }

    await tx.insert(agentCostLogs).values({
      agentId,
      ownerId: callerId,
      actionType: usingByoai ? "chat_byoai" : "chat",
      creditsCharged: costEstimate,
      tokensUsed,
      model: agent.model,
      status: "completed",
    });

    await tx.update(userAgentsTable)
      .set({ totalUsageCount: sql`${userAgentsTable.totalUsageCount} + 1` })
      .where(eq(userAgentsTable.id, agentId));

    return { response: responseText, creditsCharged: costEstimate, tokensUsed, byoai: usingByoai };
  });

  agentProgressionService.awardXp(agentId, "interaction", undefined, result.response?.length || 50).catch(() => {});
  agentTrustEngine.recordEvent(agentId, "high_usage", undefined, callerId).catch(() => {});

  if (!usingByoai) {
    await storage.createCreditUsage({
      userId: callerId,
      creditsUsed: result.creditsCharged,
      actionType: "agent_chat",
      actionLabel: `Agent chat: ${agentId}`,
      referenceId: `agent:${agentId}`,
    }).catch(() => {});
  }

  if (!usingByoai) {
    await checkAndAutoPause(callerId);
  }

  return result;
}

export async function trainAgent(
  agentId: string,
  ownerId: string,
  sources: Array<{ sourceType: string; title: string; content?: string; uri?: string; charCount: number }>
): Promise<{ creditsCharged: number; sourcesProcessed: number }> {
  const agent = await storage.getUserAgent(agentId);
  if (!agent) throw new Error("Agent not found");
  if (agent.ownerId !== ownerId) throw new Error("Not authorized to train this agent");

  const sub = await storage.getUserSubscription(ownerId);
  const hasPro = sub && sub.status === "active" && sub.planId !== "free";
  if (!hasPro) {
    throw new Error("Pro subscription required for agent training. Upgrade your plan to unlock training features.");
  }

  const owner = await storage.getUser(ownerId);
  if (!owner) throw new Error("User not found");
  const usingByoai = !!(owner.byoaiProvider && owner.byoaiApiKey);

  const totalChars = sources.reduce((sum, s) => sum + (s.charCount || 0), 0);
  const cost = estimateTrainingCost(sources.length, totalChars);
  const totalCredits = (usingByoai || hasPro) ? 0 : cost.total;

  const result = await db.transaction(async (tx) => {
    if (totalCredits > 0) {
      const [updated] = await tx.update(usersTable)
        .set({ creditWallet: sql`COALESCE(${usersTable.creditWallet}, 0) - ${totalCredits}` })
        .where(and(
          eq(usersTable.id, ownerId),
          gte(usersTable.creditWallet, totalCredits)
        ))
        .returning({ id: usersTable.id, creditWallet: usersTable.creditWallet });

      if (!updated) {
        throw new Error(`Insufficient credits. Training requires ${totalCredits} credits.`);
      }
    }

    await tx.insert(agentCostLogs).values({
      agentId,
      ownerId,
      actionType: "training",
      creditsCharged: totalCredits,
      tokensUsed: 0,
      model: agent.model,
      status: "completed",
    });

    return { creditsCharged: totalCredits, sourcesProcessed: sources.length };
  });

  if (!usingByoai) {
    await storage.createCreditUsage({
      userId: ownerId,
      creditsUsed: result.creditsCharged,
      actionType: "agent_training",
      actionLabel: `Agent training: ${agentId}`,
      referenceId: `agent:${agentId}`,
    }).catch(() => {});
  }

  if (!usingByoai) {
    await checkAndAutoPause(ownerId);
  }

  return result;
}

async function checkAndAutoPause(userId: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user || (user.creditWallet || 0) > 0) return;

  const agents = await storage.getUserAgentsByOwner(userId);
  const activeAgents = agents.filter(a => a.status === "active");

  for (const agent of activeAgents) {
    await storage.updateUserAgent(agent.id, { status: "paused" });
  }
}

export async function resumeAgents(ownerId: string): Promise<{ resumed: number }> {
  const user = await storage.getUser(ownerId);
  if (!user) throw new Error("User not found");

  if ((user.creditWallet || 0) <= 0) {
    throw new Error("Cannot resume agents with zero credits. Please add credits first.");
  }

  const agents = await storage.getUserAgentsByOwner(ownerId);
  const pausedAgents = agents.filter(a => a.status === "paused");
  let resumed = 0;

  for (const agent of pausedAgents) {
    await storage.updateUserAgent(agent.id, { status: "active" });
    resumed++;
  }

  return { resumed };
}

export async function setByoaiKey(userId: string, provider: string, apiKey: string): Promise<{ success: boolean }> {
  const validProviders = ["openai", "together", "groq"];
  if (!validProviders.includes(provider)) {
    throw new Error(`Invalid BYOAI provider. Supported: ${validProviders.join(", ")}`);
  }

  try {
    const client = getByoaiClient(provider, apiKey);
    await client.chat.completions.create({
      model: "gpt-5.5",
      messages: [{ role: "user", content: "test" }],
      max_completion_tokens: 5,
    });
  } catch (err: any) {
    throw new Error(`API key validation failed: ${err.message}`);
  }

  await db.update(usersTable)
    .set({ byoaiProvider: provider, byoaiApiKey: apiKey })
    .where(eq(usersTable.id, userId));

  return { success: true };
}

export async function removeByoaiKey(userId: string): Promise<{ success: boolean }> {
  await db.update(usersTable)
    .set({ byoaiProvider: null, byoaiApiKey: null })
    .where(eq(usersTable.id, userId));
  return { success: true };
}

export async function getWalletStatus(userId: string): Promise<{
  creditWallet: number;
  byoaiEnabled: boolean;
  byoaiProvider: string | null;
  activeAgents: number;
  pausedAgents: number;
  totalSpent: number;
}> {
  const user = await storage.getUser(userId);
  if (!user) throw new Error("User not found");

  const agents = await storage.getUserAgentsByOwner(userId);
  const costLogs = await storage.getAgentCostLogs(userId, 500);
  const totalSpent = costLogs.reduce((sum, l) => sum + l.creditsCharged, 0);

  return {
    creditWallet: user.creditWallet || 0,
    byoaiEnabled: !!(user.byoaiProvider && user.byoaiApiKey),
    byoaiProvider: user.byoaiProvider || null,
    activeAgents: agents.filter(a => a.status === "active").length,
    pausedAgents: agents.filter(a => a.status === "paused").length,
    totalSpent,
  };
}

export async function getPlatformCostAnalytics(): Promise<{
  totalAgents: number;
  activeAgents: number;
  pausedAgents: number;
  totalUsage: number;
  totalCreditsCharged: number;
  byoaiUsers: number;
  creditCosts: Record<string, number>;
  costByModel: Record<string, number>;
  costByAction: Record<string, number>;
}> {
  const allAgents = await db.select().from(userAgentsTable);
  const allCostLogs = await db.select().from(agentCostLogs);
  const allUsers = await db.select({ id: usersTable.id, byoaiProvider: usersTable.byoaiProvider }).from(usersTable);

  const costByModel: Record<string, number> = {};
  const costByAction: Record<string, number> = {};
  let totalCreditsCharged = 0;

  for (const log of allCostLogs) {
    totalCreditsCharged += log.creditsCharged;
    costByModel[log.model || "unknown"] = (costByModel[log.model || "unknown"] || 0) + log.creditsCharged;
    costByAction[log.actionType] = (costByAction[log.actionType] || 0) + log.creditsCharged;
  }

  return {
    totalAgents: allAgents.length,
    activeAgents: allAgents.filter(a => a.status === "active").length,
    pausedAgents: allAgents.filter(a => a.status === "paused").length,
    totalUsage: allAgents.reduce((sum, a) => sum + a.totalUsageCount, 0),
    totalCreditsCharged,
    byoaiUsers: allUsers.filter(u => u.byoaiProvider).length,
    creditCosts: CREDIT_COSTS,
    costByModel,
    costByAction,
  };
}

export async function runDemoInteraction(
  agentId: string,
  userMessage: string
): Promise<{ response: string }> {
  const agent = await storage.getUserAgent(agentId);
  if (!agent) throw new Error("Agent not found");

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (agent.systemPrompt) {
    messages.push({ role: "system", content: agent.systemPrompt + "\n\nThis is a demo interaction. Keep responses concise (under 150 words)." });
  } else {
    messages.push({ role: "system", content: `You are ${agent.name}. This is a demo interaction. Keep responses concise (under 150 words).` });
  }
  messages.push({ role: "user", content: userMessage });

  try {
    const client = getDefaultClient();
    const completion = await client.chat.completions.create({
      model: "gpt-5.5",
      messages,
      temperature: agent.temperature,
      max_completion_tokens: 512,
    });
    return { response: completion.choices[0]?.message?.content || "No response generated." };
  } catch (err: any) {
    return { response: `Demo unavailable: ${err.message}` };
  }
}

export function computeTrustScore(agent: {
  rating: number;
  ratingCount: number;
  totalUsageCount: number;
  totalCreditsEarned: number;
}): number {
  const ratingFactor = Math.min(agent.rating / 5, 1) * 30;
  const usageFactor = Math.min(agent.totalUsageCount / 100, 1) * 25;
  const earningsFactor = Math.min(agent.totalCreditsEarned / 500, 1) * 20;
  const reviewFactor = Math.min(agent.ratingCount / 20, 1) * 15;
  const baseTrust = 10;
  return Math.round(baseTrust + ratingFactor + usageFactor + earningsFactor + reviewFactor);
}

export function computeQualityScore(listing: {
  totalSales: number;
  averageRating: number;
  reviewCount: number;
}): number {
  const salesScore = Math.min(listing.totalSales / 50, 1) * 40;
  const ratingScore = (listing.averageRating / 5) * 35;
  const reviewScore = Math.min(listing.reviewCount / 10, 1) * 25;
  return Math.round(salesScore + ratingScore + reviewScore);
}

export const agentRunnerService = {
  runAgent,
  runDemoInteraction,
  trainAgent,
  resumeAgents,
  setByoaiKey,
  removeByoaiKey,
  getWalletStatus,
  getPlatformCostAnalytics,
  checkAndAutoPause,
  estimateCost,
  estimateTrainingCost,
  computeTrustScore,
  computeQualityScore,
  CREDIT_COSTS,
};
