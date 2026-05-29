interface AIActionLog {
  traceId: string;
  timestamp: number;
  model: string;
  action: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  decision?: string;
  durationMs: number;
  userId?: string;
  endpoint?: string;
}

interface UserJourneyEvent {
  userId: string;
  event: "signup" | "app_creation" | "pricing_analyze" | "publish_attempt" | "payment" | "export" | "login" | "agent_created";
  timestamp: number;
  traceId?: string;
  metadata?: Record<string, any>;
}

interface EconomicSnapshot {
  timestamp: number;
  totalAiCostUsd: number;
  totalRevenue: number;
  margin: number;
  totalRequests: number;
  avgCostPerRequest: number;
  lossApps: Array<{ appId: string; appName: string; cost: number; revenue: number; loss: number }>;
}

interface FounderConfig {
  aiUsageLimits: {
    maxDailyTokens: number;
    maxRequestsPerMinute: number;
    maxCostPerDayUsd: number;
    enabled: boolean;
  };
  costThrottling: {
    throttleAboveUsd: number;
    rejectAboveUsd: number;
    enabled: boolean;
  };
  featureToggles: Record<string, boolean>;
  marginConfig: {
    minimumMarginPercent: number;
    targetMarginPercent: number;
    alertBelowPercent: number;
  };
}

const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-5.5": { input: 0.0025, output: 0.01 },
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "default": { input: 0.001, output: 0.002 },
};

class FounderDebugService {
  private aiLogs: AIActionLog[] = [];
  private journeyEvents: UserJourneyEvent[] = [];
  private moderationActions: Array<{ type: string; timestamp: number; userId?: string }> = [];
  private maxLogs = 10000;
  private maxEvents = 50000;

  private config: FounderConfig = {
    aiUsageLimits: {
      maxDailyTokens: 10_000_000,
      maxRequestsPerMinute: 60,
      maxCostPerDayUsd: 50,
      enabled: true,
    },
    costThrottling: {
      throttleAboveUsd: 0.10,
      rejectAboveUsd: 1.00,
      enabled: true,
    },
    featureToggles: {
      ai_agents: true,
      labs_apps: true,
      pricing_engine: true,
      app_export: true,
      debates: true,
      content_flywheel: true,
      personal_agent: true,
      agent_marketplace: true,
    },
    marginConfig: {
      minimumMarginPercent: 50,
      targetMarginPercent: 65,
      alertBelowPercent: 40,
    },
  };

  logAIAction(log: AIActionLog) {
    this.aiLogs.push(log);
    if (this.aiLogs.length > this.maxLogs) {
      this.aiLogs = this.aiLogs.slice(-this.maxLogs);
    }
  }

  estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const costs = TOKEN_COSTS[model] || TOKEN_COSTS["default"];
    return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
  }

  trackJourneyEvent(event: UserJourneyEvent) {
    this.journeyEvents.push(event);
    if (this.journeyEvents.length > this.maxEvents) {
      this.journeyEvents = this.journeyEvents.slice(-this.maxEvents);
    }
  }

  getAILogs(filters?: { since?: number; model?: string; limit?: number }): AIActionLog[] {
    let logs = this.aiLogs;
    if (filters?.since) logs = logs.filter(l => l.timestamp >= filters.since!);
    if (filters?.model) logs = logs.filter(l => l.model === filters.model);
    const limit = filters?.limit || 100;
    return logs.slice(-limit).reverse();
  }

  getJourneyEvents(filters?: { userId?: string; event?: string; since?: number; limit?: number }): UserJourneyEvent[] {
    let events = this.journeyEvents;
    if (filters?.userId) events = events.filter(e => e.userId === filters.userId);
    if (filters?.event) events = events.filter(e => e.event === filters.event);
    if (filters?.since) events = events.filter(e => e.timestamp >= filters.since!);
    const limit = filters?.limit || 100;
    return events.slice(-limit).reverse();
  }

  getEconomicSnapshot(): EconomicSnapshot {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const recentLogs = this.aiLogs.filter(l => l.timestamp >= last24h);

    const totalAiCostUsd = recentLogs.reduce((sum, l) => sum + l.estimatedCostUsd, 0);
    const totalRequests = recentLogs.length;

    const appCosts = new Map<string, { cost: number; name: string }>();
    for (const log of recentLogs) {
      if (log.endpoint) {
        const existing = appCosts.get(log.endpoint) || { cost: 0, name: log.endpoint };
        existing.cost += log.estimatedCostUsd;
        appCosts.set(log.endpoint, existing);
      }
    }

    const revenueEvents = this.journeyEvents.filter(
      e => e.event === "payment" && e.timestamp >= last24h
    );
    const totalRevenue = revenueEvents.reduce(
      (sum, e) => sum + (e.metadata?.amount || 0), 0
    );

    const margin = totalRevenue > 0 ? ((totalRevenue - totalAiCostUsd) / totalRevenue) * 100 : 0;

    const lossApps = Array.from(appCosts.entries())
      .map(([appId, data]) => ({
        appId,
        appName: data.name,
        cost: data.cost,
        revenue: 0,
        loss: data.cost,
      }))
      .filter(a => a.loss > 0)
      .sort((a, b) => b.loss - a.loss)
      .slice(0, 10);

    return {
      timestamp: now,
      totalAiCostUsd: Math.round(totalAiCostUsd * 10000) / 10000,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      margin: Math.round(margin * 100) / 100,
      totalRequests,
      avgCostPerRequest: totalRequests > 0 ? Math.round((totalAiCostUsd / totalRequests) * 10000) / 10000 : 0,
      lossApps,
    };
  }

  getDailyAIStats() {
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayLogs = this.aiLogs.filter(l => l.timestamp >= todayStart);

    const totalTokens = todayLogs.reduce((sum, l) => sum + l.inputTokens + l.outputTokens, 0);
    const totalCost = todayLogs.reduce((sum, l) => sum + l.estimatedCostUsd, 0);
    const totalRequests = todayLogs.length;

    const byModel = new Map<string, { requests: number; tokens: number; cost: number }>();
    for (const log of todayLogs) {
      const existing = byModel.get(log.model) || { requests: 0, tokens: 0, cost: 0 };
      existing.requests++;
      existing.tokens += log.inputTokens + log.outputTokens;
      existing.cost += log.estimatedCostUsd;
      byModel.set(log.model, existing);
    }

    return {
      date: new Date(todayStart).toISOString().split("T")[0],
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalRequests,
      limitsUsed: {
        tokens: `${totalTokens}/${this.config.aiUsageLimits.maxDailyTokens}`,
        cost: `$${totalCost.toFixed(4)}/$${this.config.aiUsageLimits.maxCostPerDayUsd}`,
        tokensPercent: Math.round((totalTokens / this.config.aiUsageLimits.maxDailyTokens) * 100),
        costPercent: Math.round((totalCost / this.config.aiUsageLimits.maxCostPerDayUsd) * 100),
      },
      byModel: Object.fromEntries(byModel),
    };
  }

  getJourneySummary() {
    const now = Date.now();
    const last7d = now - 7 * 24 * 60 * 60 * 1000;
    const recentEvents = this.journeyEvents.filter(e => e.timestamp >= last7d);

    const eventCounts: Record<string, number> = {};
    const uniqueUsers = new Set<string>();
    const dailyBreakdown: Record<string, Record<string, number>> = {};

    for (const event of recentEvents) {
      eventCounts[event.event] = (eventCounts[event.event] || 0) + 1;
      uniqueUsers.add(event.userId);

      const day = new Date(event.timestamp).toISOString().split("T")[0];
      if (!dailyBreakdown[day]) dailyBreakdown[day] = {};
      dailyBreakdown[day][event.event] = (dailyBreakdown[day][event.event] || 0) + 1;
    }

    return {
      period: "last_7_days",
      totalEvents: recentEvents.length,
      uniqueUsers: uniqueUsers.size,
      eventCounts,
      dailyBreakdown,
      funnelConversion: {
        signups: eventCounts["signup"] || 0,
        appCreations: eventCounts["app_creation"] || 0,
        pricingAnalyses: eventCounts["pricing_analyze"] || 0,
        publishAttempts: eventCounts["publish_attempt"] || 0,
        payments: eventCounts["payment"] || 0,
      },
    };
  }

  getConfig(): FounderConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<FounderConfig>): FounderConfig {
    if (updates.aiUsageLimits) {
      this.config.aiUsageLimits = { ...this.config.aiUsageLimits, ...updates.aiUsageLimits };
    }
    if (updates.costThrottling) {
      this.config.costThrottling = { ...this.config.costThrottling, ...updates.costThrottling };
    }
    if (updates.featureToggles) {
      this.config.featureToggles = { ...this.config.featureToggles, ...updates.featureToggles };
    }
    if (updates.marginConfig) {
      this.config.marginConfig = { ...this.config.marginConfig, ...updates.marginConfig };
    }
    return this.getConfig();
  }

  checkAILimits(): { allowed: boolean; reason?: string } {
    if (!this.config.aiUsageLimits.enabled) return { allowed: true };

    const stats = this.getDailyAIStats();
    if (stats.totalTokens >= this.config.aiUsageLimits.maxDailyTokens) {
      return { allowed: false, reason: "Daily token limit reached" };
    }
    if (stats.totalCost >= this.config.aiUsageLimits.maxCostPerDayUsd) {
      return { allowed: false, reason: "Daily cost limit reached" };
    }
    return { allowed: true };
  }

  isFeatureEnabled(feature: string): boolean {
    return this.config.featureToggles[feature] !== false;
  }

  trackModerationAction(type: string, userId?: string) {
    this.moderationActions.push({ type, timestamp: Date.now(), userId });
    if (this.moderationActions.length > 10000) {
      this.moderationActions = this.moderationActions.slice(-5000);
    }
  }

  getModerationStats() {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const last7d = now - 7 * 24 * 60 * 60 * 1000;
    const recent = this.moderationActions.filter(a => a.timestamp >= last24h);
    const weekly = this.moderationActions.filter(a => a.timestamp >= last7d);
    const byType: Record<string, number> = {};
    for (const action of recent) {
      byType[action.type] = (byType[action.type] || 0) + 1;
    }
    return {
      totalToday: recent.length,
      totalWeekly: weekly.length,
      byType,
      uniqueUsersModerated: new Set(recent.filter(a => a.userId).map(a => a.userId)).size,
    };
  }

  getFullDebugSnapshot() {
    return {
      timestamp: Date.now(),
      aiStats: this.getDailyAIStats(),
      economics: this.getEconomicSnapshot(),
      journeySummary: this.getJourneySummary(),
      config: this.getConfig(),
      recentAILogs: this.getAILogs({ limit: 20 }),
      recentJourneyEvents: this.getJourneyEvents({ limit: 20 }),
      systemHealth: {
        logsStored: this.aiLogs.length,
        eventsStored: this.journeyEvents.length,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
    };
  }
}

export const founderDebugService = new FounderDebugService();
