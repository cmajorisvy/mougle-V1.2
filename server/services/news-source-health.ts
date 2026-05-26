/**
 * Newsroom T2 — News source health check.
 *
 * Runs the shared `runFeedTest` helper (the same one the admin "Test feed"
 * button and the save/enable gate use) on a daily schedule against every
 * enabled source. Stores the last-known result (status, item count, last
 * error code, last checked at) so the registry UI can surface red/yellow
 * badges before a feed silently rots.
 */

import { storage } from "../storage";
import type { NewsSource } from "@shared/schema";
import { runFeedTest, feedTestMessage, type FeedTestReason } from "./feed-test";

export type CheckStatus = "ok" | "warning" | "error";

export interface FeedCheckResult {
  status: CheckStatus;
  httpStatus?: number;
  itemCount?: number;
  errorCode?: FeedTestReason;
  errorMessage?: string;
  sampleTitle?: string;
}

export async function runFeedCheck(rawUrl: string): Promise<FeedCheckResult> {
  const result = await runFeedTest(rawUrl);
  if (result.ok) {
    return {
      status: "ok",
      httpStatus: result.statusCode,
      itemCount: result.itemCount,
      sampleTitle: result.sampleTitle,
    };
  }
  const reason = result.reason ?? "unknown";
  return {
    status: reason === "empty_feed" ? "warning" : "error",
    httpStatus: result.statusCode,
    itemCount: result.itemCount,
    errorCode: reason,
    errorMessage: feedTestMessage(reason),
  };
}

async function checkAndRecord(source: NewsSource): Promise<FeedCheckResult> {
  const result = await runFeedCheck(source.url);
  const passed = result.status === "ok";
  await storage.recordNewsSourceHealthCheck(source.id, {
    status: result.status,
    httpStatus: result.httpStatus ?? null,
    itemCount: result.itemCount ?? null,
    errorMessage: result.errorMessage ?? null,
    incrementFailure: !passed,
    resetFailure: passed,
  });
  return result;
}

export const newsSourceHealthService = {
  async runOnce(): Promise<{ checked: number; broken: number }> {
    const sources = await storage.listNewsSources({ enabledOnly: true });
    let broken = 0;
    for (const source of sources) {
      try {
        const result = await checkAndRecord(source);
        if (result.status === "error") broken++;
      } catch (err) {
        console.error(
          `[NewsSourceHealth] check failed for ${source.name}:`,
          (err as Error).message,
        );
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(
      `[NewsSourceHealth] daily check complete — ${sources.length} sources checked, ${broken} broken`,
    );
    return { checked: sources.length, broken };
  },

  async checkOne(id: string): Promise<FeedCheckResult | null> {
    const source = await storage.getNewsSource(id);
    if (!source) return null;
    return checkAndRecord(source);
  },

  startScheduler(intervalHours = 24) {
    if ((this as any)._handle) return;
    console.log(
      `[NewsSourceHealth] scheduler started — checking every ${intervalHours} hour(s)`,
    );
    setTimeout(() => {
      this.runOnce().catch((err) =>
        console.error("[NewsSourceHealth] initial run failed:", (err as Error).message),
      );
    }, 60_000);
    (this as any)._handle = setInterval(() => {
      this.runOnce().catch((err) =>
        console.error("[NewsSourceHealth] scheduled run failed:", (err as Error).message),
      );
    }, intervalHours * 60 * 60 * 1000);
  },

  stopScheduler() {
    const h = (this as any)._handle as NodeJS.Timeout | undefined;
    if (h) {
      clearInterval(h);
      (this as any)._handle = null;
      console.log("[NewsSourceHealth] scheduler stopped");
    }
  },
};
