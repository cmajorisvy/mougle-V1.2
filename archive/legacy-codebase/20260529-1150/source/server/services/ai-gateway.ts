import OpenAI from "openai";
import { storage } from "../storage";
import { billingService } from "./billing-service";
import { db } from "../db";
import { users as usersTable, agentCostLogs } from "@shared/schema";
import { eq, sql, and, gte } from "drizzle-orm";

function getDefaultClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY must be set in the environment.");
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_API_KEY ? "https://api.openai.com/v1" : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1"),
  });
}

const COST_PER_MODEL: Record<string, number> = {
  "gpt-5.5": 5,
  "gpt-5": 8,
  "gpt-5-nano": 1,
};

const ACTION_COSTS: Record<string, number> = {
  chat: 3,
  comment: 2,
  verify: 3,
  debate_turn: 4,
  training_embed: 10,
  training_process: 15,
  summarize: 2,
  demo: 1,
  orchestrator: 2,
  tts: 3,
};

const RATE_LIMITS: Record<string, { perMinute: number; perHour: number }> = {
  user: { perMinute: 15, perHour: 120 },
  agent: { perMinute: 10, perHour: 80 },
  system: { perMinute: 30, perHour: 300 },
  debate: { perMinute: 20, perHour: 200 },
};

const TRAINING_LIMITS = {
  maxSourcesPerAgent: 20,
  maxFileSizeMB: 10,
  maxCharsPerSource: 100_000,
  dailyTrainingQuota: 5,
  maxTotalTrainingCreditsPerDay: 200,
};

const LOOP_LIMITS = {
  maxTurnsPerConversation: 50,
  maxChainDepth: 5,
  maxAgentToAgentTurns: 10,
  contextWindowTokens: 8000,
  summarizeAfterTokens: 6000,
};

const DEBATE_LIMITS = {
  maxSimultaneousSpeakers: 1,
  maxAISpeakersPerDebate: 8,
  maxTurnDurationSeconds: 90,
  maxRoundsPerDebate: 15,
  maxTotalDebateMinutes: 60,
  cooldownBetweenTurnsMs: 2000,
};

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, { minute: RateLimitEntry; hour: RateLimitEntry }>();

let globalMetrics = {
  totalRequests: 0,
  totalTokensUsed: 0,
  totalCreditsCharged: 0,
  requestsThisMinute: 0,
  requestsThisHour: 0,
  minuteStart: Date.now(),
  hourStart: Date.now(),
  failedRequests: 0,
  blockedByCredits: 0,
  blockedByRateLimit: 0,
  activeChains: new Map<string, number>(),
  activeDebateTurns: new Map<number, { speakers: number; rounds: number; startedAt: number }>(),
};

function resetMinuteCounter() {
  const now = Date.now();
  if (now - globalMetrics.minuteStart > 60_000) {
    globalMetrics.requestsThisMinute = 0;
    globalMetrics.minuteStart = now;
  }
}

function resetHourCounter() {
  const now = Date.now();
  if (now - globalMetrics.hourStart > 3_600_000) {
    globalMetrics.requestsThisHour = 0;
    globalMetrics.hourStart = now;
  }
}

function checkRateLimit(entityId: string, entityType: string): { allowed: boolean; retryAfterMs?: number } {
  const limits = RATE_LIMITS[entityType] || RATE_LIMITS.user;
  const now = Date.now();
  let entry = rateLimitStore.get(entityId);

  if (!entry) {
    entry = {
      minute: { count: 0, windowStart: now },
      hour: { count: 0, windowStart: now },
    };
    rateLimitStore.set(entityId, entry);
  }

  if (now - entry.minute.windowStart > 60_000) {
    entry.minute = { count: 0, windowStart: now };
  }
  if (now - entry.hour.windowStart > 3_600_000) {
    entry.hour = { count: 0, windowStart: now };
  }

  if (entry.minute.count >= limits.perMinute) {
    globalMetrics.blockedByRateLimit++;
    return { allowed: false, retryAfterMs: 60_000 - (now - entry.minute.windowStart) };
  }

  if (entry.hour.count >= limits.perHour) {
    globalMetrics.blockedByRateLimit++;
    return { allowed: false, retryAfterMs: 3_600_000 - (now - entry.hour.windowStart) };
  }

  const loadFactor = globalMetrics.requestsThisMinute / 100;
  if (loadFactor > 0.8 && entityType !== "system") {
    const throttleChance = (loadFactor - 0.8) * 5;
    if (Math.random() < throttleChance) {
      globalMetrics.blockedByRateLimit++;
      return { allowed: false, retryAfterMs: 5000 };
    }
  }

  entry.minute.count++;
  entry.hour.count++;
  return { allowed: true };
}

function getChainDepth(chainId: string): number {
  return globalMetrics.activeChains.get(chainId) || 0;
}

function incrementChain(chainId: string): number {
  const depth = (globalMetrics.activeChains.get(chainId) || 0) + 1;
  globalMetrics.activeChains.set(chainId, depth);
  return depth;
}

function releaseChain(chainId: string) {
  globalMetrics.activeChains.delete(chainId);
}

export function shouldSummarize(tokenCount: number): boolean {
  return tokenCount > LOOP_LIMITS.summarizeAfterTokens;
}

export async function summarizeConversation(
  messages: OpenAI.ChatCompletionMessageParam[]
): Promise<OpenAI.ChatCompletionMessageParam[]> {
  if (messages.length <= 4) return messages;

  const client = getDefaultClient();
  const toSummarize = messages.slice(0, -2);
  const recent = messages.slice(-2);

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: "Summarize this conversation concisely in 3-5 sentences, preserving key facts, decisions, and context:" },
        ...toSummarize,
      ],
      max_completion_tokens: 300,
    });

    const summary = completion.choices[0]?.message?.content || "";
    return [
      { role: "system", content: `Previous conversation summary: ${summary}` },
      ...recent,
    ];
  } catch {
    return messages.slice(-6);
  }
}

function estimateTokens(messages: OpenAI.ChatCompletionMessageParam[]): number {
  let total = 0;
  for (const m of messages) {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    total += Math.ceil((content?.length || 0) / 4);
  }
  return total;
}

export interface GatewayRequest {
  callerId: string;
  callerType: "user" | "agent" | "system" | "debate";
  actionType: string;
  model?: string;
  messages: OpenAI.ChatCompletionMessageParam[];
  maxTokens?: number;
  temperature?: number;
  chainId?: string;
  agentId?: string;
  debateId?: number;
  skipCreditCheck?: boolean;
}

export interface GatewayResponse {
  content: string;
  tokensUsed: number;
  creditsCharged: number;
  wasSummarized: boolean;
  chainDepth: number;
}

export async function processRequest(req: GatewayRequest): Promise<GatewayResponse> {
  resetMinuteCounter();
  resetHourCounter();
  globalMetrics.totalRequests++;
  globalMetrics.requestsThisMinute++;
  globalMetrics.requestsThisHour++;

  const rateCheck = checkRateLimit(req.callerId, req.callerType);
  if (!rateCheck.allowed) {
    globalMetrics.failedRequests++;
    throw new Error(`Rate limited. Try again in ${Math.ceil((rateCheck.retryAfterMs || 5000) / 1000)}s.`);
  }

  let chainDepth = 0;
  if (req.chainId) {
    chainDepth = incrementChain(req.chainId);
    if (chainDepth > LOOP_LIMITS.maxChainDepth) {
      releaseChain(req.chainId);
      throw new Error(`Chain depth limit (${LOOP_LIMITS.maxChainDepth}) exceeded. Stopping to prevent runaway loops.`);
    }
  }

  if (req.debateId) {
    validateDebateLimits(req.debateId);
  }

  const model = req.model || "gpt-5.5";
  let isPro = false;
  if (!req.skipCreditCheck && req.callerType !== "system") {
    const { plan, isActive } = await billingService.getSubscriptionStatus(req.callerId);
    isPro = !!(isActive && plan && (plan.name === "pro" || plan.name === "expert"));
  }
  const creditCost = req.skipCreditCheck ? 0 : (isPro ? 0 : (COST_PER_MODEL[model] || ACTION_COSTS[req.actionType] || 3));

  if (creditCost > 0 && !req.skipCreditCheck) {
    const [updated] = await db.update(usersTable)
      .set({ creditWallet: sql`COALESCE(${usersTable.creditWallet}, 0) - ${creditCost}` })
      .where(and(
        eq(usersTable.id, req.callerId),
        gte(usersTable.creditWallet, creditCost)
      ))
      .returning({ id: usersTable.id, creditWallet: usersTable.creditWallet });

    if (!updated) {
      globalMetrics.blockedByCredits++;
      globalMetrics.failedRequests++;
      if (req.chainId) releaseChain(req.chainId);
      throw new Error("Insufficient credits. Add credits to continue.");
    }
  }

  let messages = [...req.messages];
  let wasSummarized = false;

  const tokenEstimate = estimateTokens(messages);
  if (tokenEstimate > LOOP_LIMITS.summarizeAfterTokens && messages.length > 4) {
    messages = await summarizeConversation(messages);
    wasSummarized = true;
  }

  if (messages.length > LOOP_LIMITS.maxTurnsPerConversation) {
    messages = [messages[0], ...messages.slice(-10)];
    wasSummarized = true;
  }

  let content = "";
  let tokensUsed = 0;

  try {
    const client = getDefaultClient();
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: req.temperature ?? 0.7,
      max_completion_tokens: Math.min(req.maxTokens || 2048, 4096),
    });

    content = completion.choices[0]?.message?.content || "";
    tokensUsed = completion.usage?.total_tokens || 0;
  } catch (err: any) {
    if (creditCost > 0 && !req.skipCreditCheck) {
      await db.update(usersTable)
        .set({ creditWallet: sql`COALESCE(${usersTable.creditWallet}, 0) + ${creditCost}` })
        .where(eq(usersTable.id, req.callerId));
    }
    globalMetrics.failedRequests++;
    if (req.chainId) releaseChain(req.chainId);
    throw new Error(`AI call failed: ${err.message}`);
  }

  globalMetrics.totalTokensUsed += tokensUsed;
  globalMetrics.totalCreditsCharged += creditCost;

  if (req.agentId && creditCost > 0) {
    await db.insert(agentCostLogs).values({
      agentId: req.agentId,
      ownerId: req.callerId,
      actionType: req.actionType,
      creditsCharged: creditCost,
      tokensUsed,
      model,
      status: "completed",
    }).catch(() => {});
  }

  if (!req.skipCreditCheck && req.callerType !== "system") {
    const referenceId = req.agentId ? `agent:${req.agentId}` : (req.debateId ? `debate:${req.debateId}` : (req.chainId || null));
    await storage.createCreditUsage({
      userId: req.callerId,
      creditsUsed: creditCost,
      actionType: req.actionType,
      actionLabel: `ai-gateway:${req.actionType}`,
      referenceId,
    }).catch(() => {});
  }

  if (req.chainId) releaseChain(req.chainId);

  return { content, tokensUsed, creditsCharged: creditCost, wasSummarized, chainDepth };
}

function validateDebateLimits(debateId: number) {
  let state = globalMetrics.activeDebateTurns.get(debateId);
  if (!state) {
    state = { speakers: 0, rounds: 0, startedAt: Date.now() };
    globalMetrics.activeDebateTurns.set(debateId, state);
  }

  const elapsedMinutes = (Date.now() - state.startedAt) / 60_000;
  if (elapsedMinutes > DEBATE_LIMITS.maxTotalDebateMinutes) {
    throw new Error(`Debate time limit (${DEBATE_LIMITS.maxTotalDebateMinutes} min) exceeded.`);
  }

  if (state.rounds >= DEBATE_LIMITS.maxRoundsPerDebate) {
    throw new Error(`Debate round limit (${DEBATE_LIMITS.maxRoundsPerDebate}) exceeded.`);
  }
}

export function recordDebateRound(debateId: number) {
  const state = globalMetrics.activeDebateTurns.get(debateId);
  if (state) state.rounds++;
}

export function endDebateTracking(debateId: number) {
  globalMetrics.activeDebateTurns.delete(debateId);
}

export function validateTrainingLimits(opts: {
  sourceCount: number;
  totalChars: number;
  fileSizeMB?: number;
}): { valid: boolean; error?: string } {
  if (opts.sourceCount > TRAINING_LIMITS.maxSourcesPerAgent) {
    return { valid: false, error: `Max ${TRAINING_LIMITS.maxSourcesPerAgent} sources per agent.` };
  }
  if (opts.totalChars > TRAINING_LIMITS.maxCharsPerSource * opts.sourceCount) {
    return { valid: false, error: `Content exceeds ${TRAINING_LIMITS.maxCharsPerSource} chars per source.` };
  }
  if (opts.fileSizeMB && opts.fileSizeMB > TRAINING_LIMITS.maxFileSizeMB) {
    return { valid: false, error: `File size exceeds ${TRAINING_LIMITS.maxFileSizeMB}MB limit.` };
  }
  return { valid: true };
}

export function getGatewayMetrics() {
  return {
    totalRequests: globalMetrics.totalRequests,
    totalTokensUsed: globalMetrics.totalTokensUsed,
    totalCreditsCharged: globalMetrics.totalCreditsCharged,
    requestsThisMinute: globalMetrics.requestsThisMinute,
    requestsThisHour: globalMetrics.requestsThisHour,
    failedRequests: globalMetrics.failedRequests,
    blockedByCredits: globalMetrics.blockedByCredits,
    blockedByRateLimit: globalMetrics.blockedByRateLimit,
    activeChains: globalMetrics.activeChains.size,
    activeDebates: globalMetrics.activeDebateTurns.size,
    rateLimits: RATE_LIMITS,
    trainingLimits: TRAINING_LIMITS,
    loopLimits: LOOP_LIMITS,
    debateLimits: DEBATE_LIMITS,
    costPerModel: COST_PER_MODEL,
    actionCosts: ACTION_COSTS,
  };
}

export function estimateCost(model: string, actionType: string): number {
  return COST_PER_MODEL[model] || ACTION_COSTS[actionType] || 3;
}

export function resetMetrics() {
  globalMetrics = {
    totalRequests: 0,
    totalTokensUsed: 0,
    totalCreditsCharged: 0,
    requestsThisMinute: 0,
    requestsThisHour: 0,
    minuteStart: Date.now(),
    hourStart: Date.now(),
    failedRequests: 0,
    blockedByCredits: 0,
    blockedByRateLimit: 0,
    activeChains: new Map(),
    activeDebateTurns: new Map(),
  };
}

setInterval(() => {
  for (const [key, entry] of rateLimitStore.entries()) {
    const now = Date.now();
    if (now - entry.hour.windowStart > 7_200_000) {
      rateLimitStore.delete(key);
    }
  }
}, 300_000);

export const aiGateway = {
  processRequest,
  getGatewayMetrics,
  estimateCost,
  shouldSummarize,
  summarizeConversation,
  validateTrainingLimits,
  validateDebateLimits,
  recordDebateRound,
  endDebateTracking,
  resetMetrics,
  COST_PER_MODEL,
  ACTION_COSTS,
  RATE_LIMITS,
  TRAINING_LIMITS,
  LOOP_LIMITS,
  DEBATE_LIMITS,
};
