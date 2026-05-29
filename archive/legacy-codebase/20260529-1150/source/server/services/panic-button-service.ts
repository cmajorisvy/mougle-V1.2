import { db } from "../db";
import { systemSettings, platformAlerts } from "@shared/schema";
import { and, eq, desc, gte, or, sql } from "drizzle-orm";
import { founderDebugService } from "./founder-debug-service";

export type PlatformMode = "NORMAL" | "SAFE_MODE" | "ECONOMY_PROTECTION" | "EMERGENCY_FREEZE";

interface ModePolicy {
  label: string;
  description: string;
  aiAllowed: boolean;
  agentsAllowed: boolean;
  publishingAllowed: boolean;
  maxAiCostPerRequestUsd: number;
  color: string;
}

const MODE_POLICIES: Record<PlatformMode, ModePolicy> = {
  NORMAL: {
    label: "Normal",
    description: "All systems operational. No restrictions.",
    aiAllowed: true,
    agentsAllowed: true,
    publishingAllowed: true,
    maxAiCostPerRequestUsd: Infinity,
    color: "green",
  },
  SAFE_MODE: {
    label: "Safe Mode",
    description: "AI operations limited. High-cost actions require review.",
    aiAllowed: true,
    agentsAllowed: true,
    publishingAllowed: true,
    maxAiCostPerRequestUsd: 0.10,
    color: "yellow",
  },
  ECONOMY_PROTECTION: {
    label: "Economy Protection",
    description: "Cost controls active. Agent creation paused. Publishing restricted.",
    aiAllowed: true,
    agentsAllowed: false,
    publishingAllowed: false,
    maxAiCostPerRequestUsd: 0.05,
    color: "orange",
  },
  EMERGENCY_FREEZE: {
    label: "Emergency Freeze",
    description: "All AI, agent, and publishing operations halted immediately.",
    aiAllowed: false,
    agentsAllowed: false,
    publishingAllowed: false,
    maxAiCostPerRequestUsd: 0,
    color: "red",
  },
};

interface AlertThresholds {
  aiCostSpikeUsd: number;
  agentActivityPerMinute: number;
  marginDropPercent: number;
}

class PanicButtonService {
  private currentMode: PlatformMode = "NORMAL";
  private modeLoadedFromDb = false;
  private thresholds: AlertThresholds = {
    aiCostSpikeUsd: 5.0,
    agentActivityPerMinute: 100,
    marginDropPercent: 30,
  };
  private alertCheckInterval: NodeJS.Timeout | null = null;

  async initialize() {
    try {
      const setting = await db.select().from(systemSettings).where(eq(systemSettings.key, "platform_mode")).limit(1);
      if (setting.length > 0 && this.isValidMode(setting[0].value)) {
        this.currentMode = setting[0].value as PlatformMode;
      } else {
        await db.insert(systemSettings).values({
          key: "platform_mode",
          value: "NORMAL",
        }).onConflictDoNothing();
      }

      const thresholdSetting = await db.select().from(systemSettings).where(eq(systemSettings.key, "alert_thresholds")).limit(1);
      if (thresholdSetting.length > 0) {
        try {
          this.thresholds = { ...this.thresholds, ...JSON.parse(thresholdSetting[0].value) };
        } catch {}
      }

      this.modeLoadedFromDb = true;
      this.startAlertMonitor();
    } catch (err) {
      console.error("[PanicButton] Failed to initialize:", err);
      this.currentMode = "NORMAL";
      this.modeLoadedFromDb = true;
    }
  }

  private isValidMode(mode: string): mode is PlatformMode {
    return ["NORMAL", "SAFE_MODE", "ECONOMY_PROTECTION", "EMERGENCY_FREEZE"].includes(mode);
  }

  getMode(): PlatformMode {
    return this.currentMode;
  }

  getModePolicy(): ModePolicy & { mode: PlatformMode } {
    return { ...MODE_POLICIES[this.currentMode], mode: this.currentMode };
  }

  getAllModes(): Array<ModePolicy & { mode: PlatformMode }> {
    return Object.entries(MODE_POLICIES).map(([mode, policy]) => ({
      ...policy,
      mode: mode as PlatformMode,
    }));
  }

  async setMode(mode: PlatformMode, updatedBy?: string): Promise<{ previousMode: PlatformMode; newMode: PlatformMode; policy: ModePolicy }> {
    if (!this.isValidMode(mode)) {
      throw { status: 400, message: `Invalid mode: ${mode}. Valid: NORMAL, SAFE_MODE, ECONOMY_PROTECTION, EMERGENCY_FREEZE` };
    }

    const previousMode = this.currentMode;
    this.currentMode = mode;

    await db.insert(systemSettings).values({
      key: "platform_mode",
      value: mode,
      updatedBy,
    }).onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: mode, updatedBy, updatedAt: new Date() },
    });

    await this.createAlert({
      type: "mode_change",
      severity: mode === "EMERGENCY_FREEZE" ? "critical" : mode === "NORMAL" ? "info" : "warning",
      message: `Platform mode changed: ${previousMode} → ${mode}`,
      details: { previousMode, newMode: mode, updatedBy, timestamp: Date.now() },
      autoTriggered: false,
    });

    founderDebugService.trackJourneyEvent({
      userId: updatedBy || "system",
      event: "publish_attempt",
      timestamp: Date.now(),
      metadata: { action: "mode_change", from: previousMode, to: mode },
    });

    return { previousMode, newMode: mode, policy: MODE_POLICIES[mode] };
  }

  checkAction(actionType: "ai" | "agent" | "publishing"): { allowed: boolean; reason?: string; mode: PlatformMode } {
    const policy = MODE_POLICIES[this.currentMode];

    if (actionType === "ai" && !policy.aiAllowed) {
      return { allowed: false, reason: `AI operations blocked in ${policy.label} mode`, mode: this.currentMode };
    }
    if (actionType === "agent" && !policy.agentsAllowed) {
      return { allowed: false, reason: `Agent operations blocked in ${policy.label} mode`, mode: this.currentMode };
    }
    if (actionType === "publishing" && !policy.publishingAllowed) {
      return { allowed: false, reason: `Publishing blocked in ${policy.label} mode`, mode: this.currentMode };
    }

    return { allowed: true, mode: this.currentMode };
  }

  async createAlert(alert: { type: string; severity: string; message: string; details?: any; autoTriggered?: boolean }) {
    try {
      const [created] = await db.insert(platformAlerts).values({
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        details: alert.details || {},
        autoTriggered: alert.autoTriggered ?? true,
      }).returning();
      return created;
    } catch (err) {
      console.error("[PanicButton] Failed to create alert:", err);
    }
  }

  async getAlerts(limit = 50, includeAcknowledged = false) {
    if (includeAcknowledged) {
      return db.select().from(platformAlerts).orderBy(desc(platformAlerts.createdAt)).limit(limit);
    }
    // Default view: open alerts + alerts that were auto-cleared by the system in
    // the last 24h, so admins can still see "auto-resolved by sweep" rows
    // without having to flip a toggle.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return db
      .select()
      .from(platformAlerts)
      .where(
        or(
          eq(platformAlerts.acknowledged, false),
          and(
            eq(platformAlerts.acknowledgedBy, "system"),
            gte(platformAlerts.acknowledgedAt, cutoff),
            sql`(${platformAlerts.details} ->> 'autoResolved') = 'true'`,
          ),
        ),
      )
      .orderBy(desc(platformAlerts.createdAt))
      .limit(limit);
  }

  async acknowledgeAlert(alertId: string, acknowledgedBy: string) {
    const [updated] = await db.update(platformAlerts)
      .set({ acknowledged: true, acknowledgedBy, acknowledgedAt: new Date() })
      .where(eq(platformAlerts.id, alertId))
      .returning();
    return updated;
  }

  getThresholds(): AlertThresholds {
    return { ...this.thresholds };
  }

  async updateThresholds(updates: Partial<AlertThresholds>) {
    this.thresholds = { ...this.thresholds, ...updates };
    await db.insert(systemSettings).values({
      key: "alert_thresholds",
      value: JSON.stringify(this.thresholds),
    }).onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: JSON.stringify(this.thresholds), updatedAt: new Date() },
    });
    return this.thresholds;
  }

  private startAlertMonitor() {
    if (this.alertCheckInterval) clearInterval(this.alertCheckInterval);

    this.alertCheckInterval = setInterval(async () => {
      try {
        await this.checkAlertConditions();
      } catch (err) {
        console.error("[PanicButton] Alert check error:", err);
      }
    }, 60000);
  }

  stop() {
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
      this.alertCheckInterval = null;
      console.log("[PanicButton] Alert monitor stopped");
    }
  }

  private async checkAlertConditions() {
    try {
      const { shortsBacklogAlertService } = await import("./shorts-backlog-alert-service");
      await shortsBacklogAlertService.check();
    } catch (err) {
      console.error("[PanicButton] shorts backlog check failed:", err);
    }

    const economics = founderDebugService.getEconomicSnapshot();
    const aiStats = founderDebugService.getDailyAIStats();

    if (aiStats.totalCost > this.thresholds.aiCostSpikeUsd) {
      await this.createAlert({
        type: "ai_cost_spike",
        severity: "critical",
        message: `AI cost spike detected: $${aiStats.totalCost.toFixed(4)} exceeds threshold of $${this.thresholds.aiCostSpikeUsd}`,
        details: { currentCost: aiStats.totalCost, threshold: this.thresholds.aiCostSpikeUsd, requests: aiStats.totalRequests },
      });
    }

    if (economics.margin < this.thresholds.marginDropPercent && economics.totalRevenue > 0) {
      await this.createAlert({
        type: "margin_drop",
        severity: "warning",
        message: `Platform margin dropped to ${economics.margin.toFixed(1)}% (below ${this.thresholds.marginDropPercent}% threshold)`,
        details: { currentMargin: economics.margin, threshold: this.thresholds.marginDropPercent, revenue: economics.totalRevenue, cost: economics.totalAiCostUsd },
      });
    }

    if (aiStats.totalRequests > this.thresholds.agentActivityPerMinute * 60) {
      await this.createAlert({
        type: "agent_activity_spike",
        severity: "warning",
        message: `High activity detected: ${aiStats.totalRequests} requests today exceeds daily threshold`,
        details: { requests: aiStats.totalRequests, threshold: this.thresholds.agentActivityPerMinute * 60 },
      });
    }
  }

  getStatus() {
    const policy = MODE_POLICIES[this.currentMode];
    const aiStats = founderDebugService.getDailyAIStats();
    const economics = founderDebugService.getEconomicSnapshot();

    return {
      mode: this.currentMode,
      policy,
      health: {
        aiCostToday: aiStats.totalCost,
        aiRequests: aiStats.totalRequests,
        margin: economics.margin,
        revenue: economics.totalRevenue,
      },
      thresholds: this.thresholds,
      alerts: {
        aiCostWarning: aiStats.totalCost > this.thresholds.aiCostSpikeUsd * 0.8,
        marginWarning: economics.totalRevenue > 0 && economics.margin < this.thresholds.marginDropPercent * 1.2,
        activityWarning: aiStats.totalRequests > this.thresholds.agentActivityPerMinute * 60 * 0.8,
      },
    };
  }
}

export const panicButtonService = new PanicButtonService();
