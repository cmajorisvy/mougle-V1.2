import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";

const METRIC_KEYS = [
  "posting_frequency",
  "engagement_velocity",
  "debate_creation_rate",
  "promotion_rate",
  "ai_usage_cost",
  "traffic_spikes",
] as const;

type MetricKey = typeof METRIC_KEYS[number];

async function countRecentRows(table: string, timeColumn: string, minutesAgo: number): Promise<number> {
  const result = await db.execute(sql.raw(
    `SELECT COUNT(*)::int as count FROM ${table} WHERE ${timeColumn} > NOW() - INTERVAL '${minutesAgo} minutes'`
  ));
  return (result as any)?.[0]?.count || 0;
}

async function computeMetric(key: MetricKey): Promise<number> {
  const window = 60;
  switch (key) {
    case "posting_frequency":
      return countRecentRows("posts", "created_at", window);
    case "engagement_velocity": {
      const comments = await countRecentRows("comments", "created_at", window);
      const reactions = await countRecentRows("news_reactions", "created_at", window);
      return comments + reactions;
    }
    case "debate_creation_rate":
      return countRecentRows("live_debates", "created_at", window);
    case "promotion_rate":
      return countRecentRows("promotion_scores", "evaluated_at", window);
    case "ai_usage_cost": {
      const txCount = await countRecentRows("transactions", "created_at", window);
      return txCount * 0.01;
    }
    case "traffic_spikes": {
      const posts = await countRecentRows("posts", "created_at", window);
      const comments = await countRecentRows("comments", "created_at", window);
      return posts + comments;
    }
    default:
      return 0;
  }
}

async function collectAllMetrics() {
  const results: { key: MetricKey; value: number }[] = [];
  for (const key of METRIC_KEYS) {
    try {
      const value = await computeMetric(key);
      results.push({ key, value });
      await storage.recordActivityMetric({
        metricKey: key,
        value,
        window: "1h",
        observedAt: new Date(),
      });
    } catch (err) {
      console.error(`[ActivityMonitor] Error computing ${key}:`, err);
    }
  }
  return results;
}

let monitorInterval: NodeJS.Timeout | null = null;

export const activityMonitorService = {
  METRIC_KEYS,

  async collectMetrics() {
    return collectAllMetrics();
  },

  async getLatestMetrics() {
    return storage.getLatestMetrics();
  },

  async getMetricHistory(metricKey: string, since?: Date) {
    return storage.getActivityMetrics(metricKey, since);
  },

  start(intervalMs = 5 * 60 * 1000) {
    if (monitorInterval) return;
    console.log(`[ActivityMonitor] Starting activity monitor (every ${intervalMs / 1000}s)`);
    collectAllMetrics().catch(console.error);
    monitorInterval = setInterval(() => {
      collectAllMetrics().catch(console.error);
    }, intervalMs);
  },

  stop() {
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }
  },
};
