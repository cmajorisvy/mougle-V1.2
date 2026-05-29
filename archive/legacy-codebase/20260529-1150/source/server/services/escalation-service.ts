import { storage } from "../storage";
import type { AnomalyEvent, AutomationPolicy } from "@shared/schema";

let cachedPolicy: AutomationPolicy | null = null;
let policyCacheTime = 0;
const POLICY_CACHE_TTL = 5000;

async function getPolicy(): Promise<AutomationPolicy> {
  const now = Date.now();
  if (cachedPolicy && now - policyCacheTime < POLICY_CACHE_TTL) {
    return cachedPolicy;
  }
  let policy = await storage.getAutomationPolicy();
  if (!policy) {
    policy = await storage.upsertAutomationPolicy({
      mode: "autopilot",
      safeMode: false,
      killSwitch: false,
    });
  }
  cachedPolicy = policy;
  policyCacheTime = now;
  return policy;
}

function invalidateCache() {
  cachedPolicy = null;
  policyCacheTime = 0;
}

function generateAIRecommendation(anomaly: AnomalyEvent): string {
  const severity = anomaly.severity;
  const metric = anomaly.metricKey;
  const current = anomaly.currentValue;
  const baseline = anomaly.baselineValue;
  const isSpike = current > baseline;

  const recommendations: Record<string, { spike: string; drop: string }> = {
    posting_frequency: {
      spike: "Recommend temporarily reducing automation_level to throttle automated posting. Consider enabling Safe Mode to require approval for new posts.",
      drop: "Content creation has slowed. Check if news pipeline and agent orchestrator are running. Consider increasing agent_intensity.",
    },
    engagement_velocity: {
      spike: "Engagement surge detected. This could indicate viral content or coordinated activity. Monitor for spam. Consider enabling founder review for promotions.",
      drop: "Engagement declining. Review content quality thresholds. Consider boosting promotion_aggressiveness temporarily.",
    },
    debate_creation_rate: {
      spike: "Unusual debate creation activity. Verify debate topics are relevant. Consider pausing auto-debate creation until reviewed.",
      drop: "Debate activity low. Check breaking news detection pipeline. Consider lowering debate creation thresholds.",
    },
    promotion_rate: {
      spike: "Excessive content promotion. Lower promotion_aggressiveness in Founder Controls. Enable Safe Mode to gate promotions.",
      drop: "Promotion rate dropped. Review promotion scoring thresholds. Check if content quality is meeting minimum standards.",
    },
    ai_usage_cost: {
      spike: "AI costs rising rapidly. Recommend enabling Safe Mode to pause non-essential AI operations. Lower resource_mode to conserve credits.",
      drop: "AI usage below expected levels. Check service health and connectivity.",
    },
    traffic_spikes: {
      spike: "Traffic surge detected. Could be organic growth or bot activity. Monitor server resources. Consider enabling rate limiting.",
      drop: "Traffic declining. Review content strategy and promotion effectiveness.",
    },
  };

  const metricRecs = recommendations[metric];
  if (!metricRecs) return "Review the anomaly and take appropriate action based on platform health.";

  const base = isSpike ? metricRecs.spike : metricRecs.drop;

  if (severity === "HIGH") {
    return `URGENT: ${base} Recommend switching to Founder Mode for manual oversight.`;
  }
  return base;
}

export const escalationService = {
  async getPolicy(): Promise<AutomationPolicy> {
    return getPolicy();
  },

  async setMode(mode: "autopilot" | "founder"): Promise<AutomationPolicy> {
    invalidateCache();
    return storage.upsertAutomationPolicy({ mode });
  },

  async setSafeMode(enabled: boolean): Promise<AutomationPolicy> {
    invalidateCache();
    return storage.upsertAutomationPolicy({ safeMode: enabled });
  },

  async setKillSwitch(enabled: boolean): Promise<AutomationPolicy> {
    invalidateCache();
    return storage.upsertAutomationPolicy({ killSwitch: enabled });
  },

  async updatePolicy(data: Partial<{ mode: string; safeMode: boolean; killSwitch: boolean }>): Promise<AutomationPolicy> {
    invalidateCache();
    return storage.upsertAutomationPolicy(data as any);
  },

  async handleAnomalies(anomalies: AnomalyEvent[]): Promise<void> {
    const policy = await getPolicy();

    for (const anomaly of anomalies) {
      if (anomaly.severity === "HIGH") {
        const recommendation = generateAIRecommendation(anomaly);

        await storage.createAutomationDecision({
          actionKey: `anomaly_${anomaly.metricKey}`,
          context: JSON.stringify({
            anomalyId: anomaly.id,
            metricKey: anomaly.metricKey,
            severity: anomaly.severity,
            currentValue: anomaly.currentValue,
            baselineValue: anomaly.baselineValue,
            deviationScore: anomaly.deviationScore,
          }),
          aiRecommendation: recommendation,
          anomalyId: anomaly.id,
          status: "pending",
        });

        if (policy.mode === "autopilot") {
          invalidateCache();
          await storage.upsertAutomationPolicy({ safeMode: true });
          console.log(`[Escalation] HIGH anomaly on ${anomaly.metricKey} — Safe Mode activated automatically`);
        }

        console.log(`[Escalation] HIGH severity escalation: ${anomaly.metricKey} (decision created for founder)`);
      }
    }
  },

  async getPendingDecisions() {
    return storage.getPendingDecisions();
  },

  async getAllDecisions(limit?: number) {
    return storage.getAllDecisions(limit);
  },

  async approveDecision(id: number, resolvedBy = "founder_admin") {
    const decision = await storage.resolveDecision(id, "approved", resolvedBy);
    if (decision.anomalyId) {
      await storage.updateAnomalyStatus(decision.anomalyId, "resolved", new Date());
    }
    return decision;
  },

  async rejectDecision(id: number, resolvedBy = "founder_admin") {
    const decision = await storage.resolveDecision(id, "rejected", resolvedBy);
    if (decision.anomalyId) {
      await storage.updateAnomalyStatus(decision.anomalyId, "resolved", new Date());
    }
    return decision;
  },

  shouldAllowAutomation(): Promise<boolean> {
    return getPolicy().then((p) => {
      if (p.killSwitch) return false;
      if (p.safeMode) return false;
      return true;
    });
  },

  async shouldRequireApproval(actionType: string): Promise<boolean> {
    const policy = await getPolicy();
    if (policy.killSwitch) return true;
    if (policy.mode === "founder") return true;
    if (policy.safeMode) {
      const criticalActions = [
        "publish_social",
        "auto_promote",
        "create_debate",
        "agent_action",
        "news_pipeline",
      ];
      return criticalActions.includes(actionType);
    }
    return false;
  },

  async requestApproval(actionKey: string, context: any, recommendation?: string): Promise<boolean> {
    const needsApproval = await this.shouldRequireApproval(actionKey);
    if (!needsApproval) return true;

    await storage.createAutomationDecision({
      actionKey,
      context: JSON.stringify(context),
      aiRecommendation: recommendation || `Action "${actionKey}" requires founder approval in current mode.`,
      status: "pending",
    });

    console.log(`[Escalation] Action "${actionKey}" queued for founder approval`);
    return false;
  },

  generateAIRecommendation,
};
