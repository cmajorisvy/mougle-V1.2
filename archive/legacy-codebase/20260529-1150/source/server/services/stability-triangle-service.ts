import { founderDebugService } from "./founder-debug-service";
import { panicButtonService } from "./panic-button-service";

interface TriangleScore {
  value: number;
  label: string;
  metrics: Record<string, number>;
}

interface StabilityRecommendation {
  severity: "info" | "warning" | "critical";
  dimension: "freedom" | "automation" | "control";
  message: string;
  action: string;
}

interface StabilitySnapshot {
  timestamp: number;
  freedom: TriangleScore;
  automation: TriangleScore;
  control: TriangleScore;
  stabilityIndex: number;
  stabilityLabel: string;
  balance: { deviation: number; balanced: boolean };
  recommendations: StabilityRecommendation[];
  history: Array<{ timestamp: number; freedom: number; automation: number; control: number; index: number }>;
}

class StabilityTriangleService {
  private history: Array<{ timestamp: number; freedom: number; automation: number; control: number; index: number }> = [];
  private maxHistory = 288;
  private snapshotInterval: NodeJS.Timeout | null = null;

  initialize() {
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.snapshotInterval = setInterval(() => this.recordSnapshot(), 300000);
    this.recordSnapshot();
  }

  private recordSnapshot() {
    const scores = this.computeScores();
    const idx = this.computeStabilityIndex(scores.freedom.value, scores.automation.value, scores.control.value);
    this.history.push({
      timestamp: Date.now(),
      freedom: scores.freedom.value,
      automation: scores.automation.value,
      control: scores.control.value,
      index: idx,
    });
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  private computeScores(): { freedom: TriangleScore; automation: TriangleScore; control: TriangleScore } {
    const journey = founderDebugService.getJourneySummary();
    const aiStats = founderDebugService.getDailyAIStats();
    const economics = founderDebugService.getEconomicSnapshot();
    const config = founderDebugService.getConfig();
    const modePolicy = panicButtonService.getModePolicy();

    const creatorActions = (journey.funnelConversion?.appCreations || 0) +
      (journey.funnelConversion?.publishAttempts || 0) +
      (journey.funnelConversion?.pricingAnalyses || 0);
    const signups = journey.funnelConversion?.signups || 0;
    const exports = journey.eventCounts?.["export"] || 0;
    const uniqueUsers = journey.uniqueUsers || 0;

    const rawFreedom = Math.min(100, (
      Math.min(uniqueUsers * 5, 30) +
      Math.min(creatorActions * 3, 30) +
      Math.min(signups * 4, 20) +
      Math.min(exports * 5, 20)
    ));

    const aiRequests = aiStats.totalRequests || 0;
    const aiCost = aiStats.totalCost || 0;
    const aiTokens = aiStats.totalTokens || 0;
    const costLimit = config.aiUsageLimits.maxCostPerDayUsd || 10;

    const rawAutomation = Math.min(100, (
      Math.min((aiRequests / 10) * 5, 30) +
      Math.min((aiCost / costLimit) * 40, 40) +
      Math.min((aiTokens / 100000) * 10, 30)
    ));

    const moderationStats = founderDebugService.getModerationStats();
    const limitsEnabled = config.aiUsageLimits.enabled ? 12 : 0;
    const throttleEnabled = config.costThrottling.enabled ? 12 : 0;
    const modeRestriction = modePolicy.mode === "NORMAL" ? 0 :
      modePolicy.mode === "SAFE_MODE" ? 12 :
      modePolicy.mode === "ECONOMY_PROTECTION" ? 20 : 35;
    const disabledFeatures = Object.values(config.featureToggles).filter(v => v === false).length;
    const featureControl = Math.min(disabledFeatures * 4, 16);
    const marginPressure = economics.margin < config.marginConfig.alertBelowPercent ? 8 : 0;
    const moderationScore = Math.min(moderationStats.totalToday * 3, 17);

    const rawControl = Math.min(100, limitsEnabled + throttleEnabled + modeRestriction + featureControl + marginPressure + moderationScore);

    return {
      freedom: {
        value: Math.round(rawFreedom),
        label: rawFreedom > 60 ? "High" : rawFreedom > 30 ? "Moderate" : "Low",
        metrics: { uniqueUsers, creatorActions, signups, exports },
      },
      automation: {
        value: Math.round(rawAutomation),
        label: rawAutomation > 60 ? "High" : rawAutomation > 30 ? "Moderate" : "Low",
        metrics: { aiRequests, aiCost: Math.round(aiCost * 10000) / 10000, aiTokens },
      },
      control: {
        value: Math.round(rawControl),
        label: rawControl > 60 ? "Tight" : rawControl > 30 ? "Moderate" : "Loose",
        metrics: { limitsEnabled: limitsEnabled > 0 ? 1 : 0, throttleEnabled: throttleEnabled > 0 ? 1 : 0, platformMode: modeRestriction, disabledFeatures, moderationActionsToday: moderationStats.totalToday, usersModerated: moderationStats.uniqueUsersModerated },
      },
    };
  }

  private computeStabilityIndex(freedom: number, automation: number, control: number): number {
    const total = freedom + automation + control;
    if (total === 0) return 100;

    const idealRatio = total / 3;
    const deviation = Math.sqrt(
      (Math.pow(freedom - idealRatio, 2) + Math.pow(automation - idealRatio, 2) + Math.pow(control - idealRatio, 2)) / 3
    );
    const maxDeviation = total * 0.47;
    const normalized = maxDeviation > 0 ? 1 - (deviation / maxDeviation) : 1;
    return Math.round(Math.max(0, Math.min(100, normalized * 100)));
  }

  private generateRecommendations(freedom: number, automation: number, control: number): StabilityRecommendation[] {
    const recs: StabilityRecommendation[] = [];
    const avg = (freedom + automation + control) / 3;

    if (automation > freedom * 2 && automation > 40) {
      recs.push({
        severity: "warning",
        dimension: "automation",
        message: "AI automation significantly exceeds creator activity",
        action: "Increase creator engagement or reduce AI automation to maintain balance",
      });
    }

    if (control > 60 && freedom < 20) {
      recs.push({
        severity: "warning",
        dimension: "control",
        message: "Platform controls may be restricting creator freedom excessively",
        action: "Review feature toggles and system mode; consider relaxing restrictions",
      });
    }

    if (freedom > 70 && control < 20) {
      recs.push({
        severity: "warning",
        dimension: "freedom",
        message: "High creator activity with low platform controls may lead to instability",
        action: "Enable rate limiting and cost throttling as platform scales",
      });
    }

    if (automation > 70) {
      recs.push({
        severity: "critical",
        dimension: "automation",
        message: "AI costs are high relative to platform capacity",
        action: "Consider activating Economy Protection mode or tightening cost limits",
      });
    }

    if (freedom < 10 && automation < 10 && control < 10) {
      recs.push({
        severity: "info",
        dimension: "freedom",
        message: "Platform activity is very low across all dimensions",
        action: "Focus on growth and user acquisition to build ecosystem momentum",
      });
    }

    if (freedom > avg * 1.5 && freedom > 30) {
      recs.push({
        severity: "info",
        dimension: "freedom",
        message: "Creator activity is outpacing AI support and platform controls",
        action: "Scale AI capabilities and monitoring to match growing creator activity",
      });
    }

    if (control > avg * 1.5 && control > 30) {
      recs.push({
        severity: "info",
        dimension: "control",
        message: "High control relative to activity may indicate over-moderation",
        action: "Review if current restrictions are still necessary for platform health",
      });
    }

    const moderationStats = founderDebugService.getModerationStats();
    if (moderationStats.totalToday > 10) {
      recs.push({
        severity: "warning",
        dimension: "control",
        message: `High moderation activity today: ${moderationStats.totalToday} actions on ${moderationStats.uniqueUsersModerated} users`,
        action: "Review content policies and consider automated spam prevention improvements",
      });
    }

    return recs;
  }

  getSnapshot(): StabilitySnapshot {
    const scores = this.computeScores();
    const stabilityIndex = this.computeStabilityIndex(scores.freedom.value, scores.automation.value, scores.control.value);
    const recommendations = this.generateRecommendations(scores.freedom.value, scores.automation.value, scores.control.value);

    const avg = (scores.freedom.value + scores.automation.value + scores.control.value) / 3;
    const maxDev = Math.max(
      Math.abs(scores.freedom.value - avg),
      Math.abs(scores.automation.value - avg),
      Math.abs(scores.control.value - avg)
    );

    return {
      timestamp: Date.now(),
      freedom: scores.freedom,
      automation: scores.automation,
      control: scores.control,
      stabilityIndex,
      stabilityLabel: stabilityIndex >= 80 ? "Stable" : stabilityIndex >= 60 ? "Moderate" : stabilityIndex >= 40 ? "Unstable" : "Critical",
      balance: { deviation: Math.round(maxDev), balanced: maxDev <= 20 },
      recommendations,
      history: this.history.slice(-48),
    };
  }
}

export const stabilityTriangleService = new StabilityTriangleService();
