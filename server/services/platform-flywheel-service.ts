import OpenAI from "openai";
import { storage } from "../storage";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY must be set in the environment.");
  }

  openaiClient = new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
  return openaiClient;
}

const INTELLIGENCE_AGENTS = [
  {
    agentType: "growth_analyst",
    name: "Growth Analyst",
    description: "Analyzes user acquisition, engagement trends, content virality, and platform growth metrics to recommend growth optimizations.",
  },
  {
    agentType: "cost_analyst",
    name: "Cost Analyst",
    description: "Monitors compute costs, AI API usage, credit burn rates, and resource efficiency to recommend cost optimizations.",
  },
  {
    agentType: "quality_auditor",
    name: "Quality Auditor",
    description: "Evaluates content quality, spam rates, moderation effectiveness, and user satisfaction to recommend quality improvements.",
  },
  {
    agentType: "economy_analyst",
    name: "Economy Analyst",
    description: "Tracks credit circulation, marketplace activity, reward distribution, and economic health to recommend economy balancing.",
  },
  {
    agentType: "trust_auditor",
    name: "Trust Auditor",
    description: "Monitors trust score distribution, verification rates, reputation fairness, and agent reliability to recommend trust improvements.",
  },
];

const SAFE_AUTOPILOT_ACTIONS = [
  "adjust_agent_visibility",
  "reset_compute_budget",
  "flag_low_quality_content",
  "send_notification",
  "adjust_credit_reward",
];

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });
    return response.choices[0]?.message?.content || "{}";
  } catch (e: any) {
    console.error("[PlatformFlywheel] AI call failed:", e.message);
    return "{}";
  }
}

function safeParseJSON(raw: string): any {
  try { return JSON.parse(raw); } catch { return null; }
}

class PlatformFlywheelService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    for (const agent of INTELLIGENCE_AGENTS) {
      const existing = await storage.getFlywheelAgentByType(agent.agentType);
      if (!existing) {
        await storage.createFlywheelAgent(agent);
      }
    }

    const config = await storage.getFlywheelAutomationConfig();
    if (!config) {
      await storage.upsertFlywheelAutomationConfig({
        mode: "manual",
        safeActions: SAFE_AUTOPILOT_ACTIONS,
        thresholds: { minPriority: 70, maxAutoActions: 5 },
      });
    }
    console.log("[PlatformFlywheel] Initialized with 5 intelligence agents");
  }

  async logEvent(eventType: string, actorId?: string, entityType?: string, entityId?: string, payload?: any, severity?: string): Promise<void> {
    try {
      await storage.createPlatformEvent({
        eventType,
        actorId: actorId || null,
        entityType: entityType || null,
        entityId: entityId || null,
        payload: payload || null,
        severity: severity || "info",
      });
    } catch (e: any) {
      console.error("[PlatformFlywheel] Event log failed:", e.message);
    }
  }

  async gatherPlatformSnapshot(): Promise<any> {
    const [users, posts, events, eventCounts, economyMetrics] = await Promise.all([
      storage.getUsers(),
      storage.getPosts(),
      storage.getPlatformEvents(200),
      storage.getPlatformEventCounts(),
      storage.getEconomyMetrics(),
    ]);

    const agents = users.filter(u => u.agentType);
    const humanUsers = users.filter(u => !u.agentType);
    const recentEvents = events.filter(e => e.createdAt && e.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000));

    return {
      totalUsers: users.length,
      totalAgents: agents.length,
      totalHumans: humanUsers.length,
      totalPosts: posts.length,
      recentEventCount: recentEvents.length,
      eventBreakdown: eventCounts,
      economy: economyMetrics,
      avgReputation: users.length > 0 ? Math.round(users.reduce((s, u) => s + (u.reputation || 0), 0) / users.length) : 0,
      avgCredits: users.length > 0 ? Math.round(users.reduce((s, u) => s + (u.creditWallet || 0), 0) / users.length) : 0,
      topAgentsByReputation: agents.sort((a, b) => (b.reputation || 0) - (a.reputation || 0)).slice(0, 5).map(a => ({ name: a.username, reputation: a.reputation })),
    };
  }

  async runAnalysisCycle(): Promise<{ recommendations: number; autoApplied: number }> {
    await this.initialize();
    const snapshot = await this.gatherPlatformSnapshot();
    const agents = await storage.getFlywheelAgents();
    const activeAgents = agents.filter(a => a.active);
    let totalRecs = 0;
    let autoApplied = 0;

    for (const agent of activeAgents) {
      try {
        const recommendations = await this.runIntelligenceAgent(agent.agentType, snapshot);
        for (const rec of recommendations) {
          await storage.createFlywheelRecommendation({
            agentType: agent.agentType,
            title: rec.title,
            rationale: rec.rationale,
            impactArea: rec.impactArea || agent.agentType.replace("_", " "),
            severity: rec.severity || "medium",
            priority: rec.priority || 50,
            recommendedAction: rec.action || null,
            status: "pending",
          });
          totalRecs++;
        }
        await storage.updateFlywheelAgent(agent.id, {
          lastRunAt: new Date(),
          lastResult: { recommendationCount: recommendations.length, snapshot: { totalUsers: snapshot.totalUsers, totalPosts: snapshot.totalPosts } },
        });
      } catch (e: any) {
        console.error(`[PlatformFlywheel] Agent ${agent.agentType} failed:`, e.message);
      }
    }

    const config = await storage.getFlywheelAutomationConfig();
    if (config?.mode === "autopilot") {
      autoApplied = await this.autoApplySafeRecommendations(config);
    }

    await this.logEvent("flywheel_cycle_complete", undefined, "system", undefined, { totalRecs, autoApplied });
    return { recommendations: totalRecs, autoApplied };
  }

  private async runIntelligenceAgent(agentType: string, snapshot: any): Promise<any[]> {
    const prompts: Record<string, { system: string; focus: string }> = {
      growth_analyst: {
        system: "You are a Growth Analyst for an AI-human discussion platform. Analyze growth metrics and suggest optimizations. Return JSON: {\"recommendations\": [{\"title\": string, \"rationale\": string, \"severity\": \"low\"|\"medium\"|\"high\"|\"critical\", \"priority\": number 1-100, \"impactArea\": \"growth\", \"action\": {\"type\": string, \"params\": object}}]}",
        focus: `User growth: ${snapshot.totalUsers} users (${snapshot.totalHumans} humans, ${snapshot.totalAgents} agents). Posts: ${snapshot.totalPosts}. Recent events: ${snapshot.recentEventCount}. Top agents: ${JSON.stringify(snapshot.topAgentsByReputation)}.`,
      },
      cost_analyst: {
        system: "You are a Cost Analyst for an AI-human discussion platform. Analyze resource usage and costs. Return JSON: {\"recommendations\": [{\"title\": string, \"rationale\": string, \"severity\": \"low\"|\"medium\"|\"high\"|\"critical\", \"priority\": number 1-100, \"impactArea\": \"cost\", \"action\": {\"type\": string, \"params\": object}}]}",
        focus: `Economy: ${JSON.stringify(snapshot.economy)}. Avg credits per user: ${snapshot.avgCredits}. Agents: ${snapshot.totalAgents}.`,
      },
      quality_auditor: {
        system: "You are a Quality Auditor for an AI-human discussion platform. Evaluate content and moderation quality. Return JSON: {\"recommendations\": [{\"title\": string, \"rationale\": string, \"severity\": \"low\"|\"medium\"|\"high\"|\"critical\", \"priority\": number 1-100, \"impactArea\": \"quality\", \"action\": {\"type\": string, \"params\": object}}]}",
        focus: `Posts: ${snapshot.totalPosts}. Users: ${snapshot.totalUsers}. Event breakdown: ${JSON.stringify(snapshot.eventBreakdown)}.`,
      },
      economy_analyst: {
        system: "You are an Economy Analyst for an AI-human discussion platform. Analyze the credit economy health. Return JSON: {\"recommendations\": [{\"title\": string, \"rationale\": string, \"severity\": \"low\"|\"medium\"|\"high\"|\"critical\", \"priority\": number 1-100, \"impactArea\": \"economy\", \"action\": {\"type\": string, \"params\": object}}]}",
        focus: `Economy metrics: ${JSON.stringify(snapshot.economy)}. Avg credits: ${snapshot.avgCredits}. Avg reputation: ${snapshot.avgReputation}.`,
      },
      trust_auditor: {
        system: "You are a Trust Auditor for an AI-human discussion platform. Analyze trust distribution and fairness. Return JSON: {\"recommendations\": [{\"title\": string, \"rationale\": string, \"severity\": \"low\"|\"medium\"|\"high\"|\"critical\", \"priority\": number 1-100, \"impactArea\": \"trust\", \"action\": {\"type\": string, \"params\": object}}]}",
        focus: `Users: ${snapshot.totalUsers}. Agents: ${snapshot.totalAgents}. Avg reputation: ${snapshot.avgReputation}. Top agents: ${JSON.stringify(snapshot.topAgentsByReputation)}.`,
      },
    };

    const config = prompts[agentType];
    if (!config) return [];

    const raw = await callAI(config.system, config.focus);
    const parsed = safeParseJSON(raw);
    if (!parsed?.recommendations || !Array.isArray(parsed.recommendations)) return [];

    return parsed.recommendations.slice(0, 3);
  }

  private async autoApplySafeRecommendations(config: any): Promise<number> {
    const safeActions: string[] = config.safeActions || SAFE_AUTOPILOT_ACTIONS;
    const thresholds = config.thresholds || { minPriority: 70, maxAutoActions: 5 };
    const pending = await storage.getFlywheelRecommendations("pending");
    let applied = 0;

    for (const rec of pending) {
      if (applied >= (thresholds.maxAutoActions || 5)) break;
      if ((rec.priority || 0) < (thresholds.minPriority || 70)) continue;

      const action = rec.recommendedAction as any;
      if (!action?.type || !safeActions.includes(action.type)) continue;

      await storage.updateFlywheelRecommendation(rec.id, {
        status: "auto_applied",
        appliedAt: new Date(),
      });
      await storage.createFlywheelOutcome({
        recommendationId: rec.id,
        actionTaken: `Auto-applied: ${action.type}`,
        outcomeMetrics: { autoApplied: true, mode: "autopilot" },
        success: true,
        notes: "Applied automatically by autopilot mode",
      });
      applied++;
    }
    return applied;
  }

  async applyRecommendation(recId: string, notes?: string): Promise<any> {
    const rec = (await storage.getFlywheelRecommendations()).find(r => r.id === recId);
    if (!rec) return null;

    await storage.updateFlywheelRecommendation(recId, {
      status: "applied",
      appliedAt: new Date(),
    });

    const outcome = await storage.createFlywheelOutcome({
      recommendationId: recId,
      actionTaken: `Manually applied: ${rec.title}`,
      outcomeMetrics: { manual: true },
      success: true,
      notes: notes || "Manually applied by founder",
    });

    await this.logEvent("recommendation_applied", undefined, "recommendation", recId, { title: rec.title });
    return outcome;
  }

  async dismissRecommendation(recId: string, reason?: string): Promise<any> {
    const rec = (await storage.getFlywheelRecommendations()).find(r => r.id === recId);
    if (!rec) return null;

    await storage.updateFlywheelRecommendation(recId, {
      status: "dismissed",
      dismissedAt: new Date(),
    });

    await storage.createFlywheelOutcome({
      recommendationId: recId,
      actionTaken: "Dismissed",
      outcomeMetrics: { dismissed: true },
      success: false,
      notes: reason || "Dismissed by founder",
    });

    return { dismissed: true };
  }

  async getOverview(): Promise<any> {
    await this.initialize();

    const [agents, config, eventCounts, pendingRecs, allRecs, outcomes] = await Promise.all([
      storage.getFlywheelAgents(),
      storage.getFlywheelAutomationConfig(),
      storage.getPlatformEventCounts(),
      storage.getFlywheelRecommendations("pending"),
      storage.getFlywheelRecommendations(),
      storage.getFlywheelOutcomes(20),
    ]);

    const appliedCount = allRecs.filter(r => r.status === "applied" || r.status === "auto_applied").length;
    const dismissedCount = allRecs.filter(r => r.status === "dismissed").length;
    const successRate = outcomes.length > 0
      ? Math.round((outcomes.filter(o => o.success).length / outcomes.length) * 100)
      : 0;

    return {
      mode: config?.mode || "manual",
      config,
      agents,
      eventCounts,
      totalEvents: eventCounts.reduce((s: number, e: any) => s + e.count, 0),
      pendingRecommendations: pendingRecs,
      recentRecommendations: allRecs.slice(0, 20),
      outcomes,
      stats: {
        totalRecommendations: allRecs.length,
        pending: pendingRecs.length,
        applied: appliedCount,
        dismissed: dismissedCount,
        successRate,
      },
    };
  }

  async updateMode(mode: string): Promise<any> {
    if (!["manual", "assisted", "autopilot"].includes(mode)) {
      throw new Error("Invalid mode. Must be manual, assisted, or autopilot");
    }
    const config = await storage.upsertFlywheelAutomationConfig({ mode });
    await this.logEvent("mode_changed", undefined, "config", undefined, { newMode: mode });
    return config;
  }
}

export const platformFlywheelService = new PlatformFlywheelService();
