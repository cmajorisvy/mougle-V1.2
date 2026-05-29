import { storage } from "../storage";
import type { AnomalyEvent } from "@shared/schema";

type Severity = "LOW" | "MEDIUM" | "HIGH";

interface AnomalyThresholds {
  mediumZScore: number;
  highZScore: number;
}

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  mediumZScore: 2.0,
  highZScore: 3.0,
};

const METRIC_LABELS: Record<string, string> = {
  posting_frequency: "Posting Frequency",
  engagement_velocity: "Engagement Velocity",
  debate_creation_rate: "Debate Creation Rate",
  promotion_rate: "Promotion Rate",
  ai_usage_cost: "AI Usage Cost",
  traffic_spikes: "Traffic Spikes",
};

function computeStats(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}

function classifySeverity(zScore: number, thresholds: AnomalyThresholds): Severity | null {
  const absZ = Math.abs(zScore);
  if (absZ >= thresholds.highZScore) return "HIGH";
  if (absZ >= thresholds.mediumZScore) return "MEDIUM";
  if (absZ >= 1.5) return "LOW";
  return null;
}

function generateMessage(metricKey: string, severity: Severity, current: number, baseline: number, zScore: number): string {
  const label = METRIC_LABELS[metricKey] || metricKey;
  const direction = current > baseline ? "spike" : "drop";
  const pctChange = baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : 0;

  switch (severity) {
    case "HIGH":
      return `Critical ${direction} in ${label}: ${current.toFixed(1)} vs baseline ${baseline.toFixed(1)} (${pctChange > 0 ? '+' : ''}${pctChange}%, z-score: ${zScore.toFixed(2)}). Immediate attention required.`;
    case "MEDIUM":
      return `Unusual ${direction} in ${label}: ${current.toFixed(1)} vs baseline ${baseline.toFixed(1)} (${pctChange > 0 ? '+' : ''}${pctChange}%, z-score: ${zScore.toFixed(2)}). Monitoring recommended.`;
    case "LOW":
      return `Minor ${direction} in ${label}: ${current.toFixed(1)} vs baseline ${baseline.toFixed(1)} (z-score: ${zScore.toFixed(2)}).`;
  }
}

async function detectAnomaliesForMetric(
  metricKey: string,
  thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS
): Promise<AnomalyEvent | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const history = await storage.getActivityMetrics(metricKey, since);

  if (history.length < 3) return null;

  const [latest, ...rest] = history;
  const values = rest.map((m) => m.value);
  const { mean, stddev } = computeStats(values);

  if (stddev === 0) return null;

  const zScore = (latest.value - mean) / stddev;
  const severity = classifySeverity(zScore, thresholds);

  if (!severity) return null;

  const message = generateMessage(metricKey, severity, latest.value, mean, zScore);

  const anomaly = await storage.createAnomalyEvent({
    metricKey,
    severity,
    deviationScore: Math.abs(zScore),
    baselineValue: mean,
    currentValue: latest.value,
    message,
    status: "open",
    detectedAt: new Date(),
  });

  console.log(`[AnomalyDetector] ${severity} anomaly detected: ${metricKey} (z=${zScore.toFixed(2)})`);
  return anomaly;
}

const MONITORED_METRICS = [
  "posting_frequency",
  "engagement_velocity",
  "debate_creation_rate",
  "promotion_rate",
  "ai_usage_cost",
  "traffic_spikes",
];

let detectorInterval: NodeJS.Timeout | null = null;

export const anomalyDetectorService = {
  async runDetection(thresholds?: AnomalyThresholds): Promise<AnomalyEvent[]> {
    const detected: AnomalyEvent[] = [];
    for (const metricKey of MONITORED_METRICS) {
      try {
        const anomaly = await detectAnomaliesForMetric(metricKey, thresholds);
        if (anomaly) detected.push(anomaly);
      } catch (err) {
        console.error(`[AnomalyDetector] Error detecting anomaly for ${metricKey}:`, err);
      }
    }
    return detected;
  },

  async getOpenAnomalies() {
    return storage.getOpenAnomalies();
  },

  async getAllAnomalies(limit?: number) {
    return storage.getAllAnomalies(limit);
  },

  async acknowledgeAnomaly(id: number) {
    return storage.updateAnomalyStatus(id, "acknowledged");
  },

  async resolveAnomaly(id: number) {
    return storage.updateAnomalyStatus(id, "resolved", new Date());
  },

  start(intervalMs = 5 * 60 * 1000) {
    if (detectorInterval) return;
    console.log(`[AnomalyDetector] Starting anomaly detection (every ${intervalMs / 1000}s)`);
    detectorInterval = setInterval(() => {
      this.runDetection().catch(console.error);
    }, intervalMs);
  },

  stop() {
    if (detectorInterval) {
      clearInterval(detectorInterval);
      detectorInterval = null;
    }
  },
};
