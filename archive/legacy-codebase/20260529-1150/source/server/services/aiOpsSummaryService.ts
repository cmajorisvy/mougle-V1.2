/**
 * AI ops summary — compact dashboard metrics for the founder/admin
 * console. Every value is a count or a small scalar; no raw payloads,
 * results, or error bodies are exposed.
 */

import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { aiJobs, aiJobEvents, aiWorkers, aiRetentionRuns, aiExportEvents } from "@shared/schema";
import { aiRetentionService, defaultPolicy } from "./aiRetentionService";

const STALE_RUNNING_AFTER_MS = 10 * 60 * 1000;  // 10 min
const WORKER_ONLINE_MAX_MS   = 90 * 1000;
const WORKER_STALE_MAX_MS    = 5 * 60 * 1000;

async function countWhere(table: any, where: any): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return Number(row?.n ?? 0);
}

export interface AiOpsSummary {
  jobs: {
    pendingJobs: number;
    runningJobs: number;
    succeededJobsLast24h: number;
    failedJobsLast24h: number;
    rejectedJobsLast24h: number;
    staleRunningJobs: number;
    retryableFailedJobs: number;
    totalJobsLast24h: number;
  };
  workers: {
    totalWorkers: number;
    onlineWorkers: number;
    staleWorkers: number;
    offlineWorkers: number;
    unhealthyWorkers: number;
    busyWorkers: number;
    idleWorkers: number;
  };
  audit: {
    auditEventsLast24h: number;
    lastCleanupAt: string | null;
    lastCleanupStatus: string | null;
    rowsDeletedLastCleanup: number | null;
    rowsDeletedLast7d: number;
    cleanupEligibleCounts: {
      completedJobs: number;
      failedJobs: number;
      auditEvents: number;
      staleWorkers: number;
    };
    csvExportsLast24h: number;
    failedCsvExportsLast24h: number;
  };
  health: {
    healthStatus: "healthy" | "degraded" | "attention_needed";
    healthReasons: string[];
  };
}

class AiOpsSummaryService {
  async getSummary(): Promise<AiOpsSummary> {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const staleRunningBefore = new Date(now.getTime() - STALE_RUNNING_AFTER_MS);

    // --- Jobs ----------------------------------------------------------
    const [
      pendingJobs, runningJobs,
      succeededJobsLast24h, failedJobsLast24h, rejectedJobsLast24h,
      staleRunningJobs, totalJobsLast24h,
    ] = await Promise.all([
      countWhere(aiJobs, eq(aiJobs.status, "pending")),
      countWhere(aiJobs, eq(aiJobs.status, "running")),
      countWhere(aiJobs, and(eq(aiJobs.status, "succeeded"), gte(aiJobs.updatedAt, since24h))),
      countWhere(aiJobs, and(eq(aiJobs.status, "failed"),    gte(aiJobs.updatedAt, since24h))),
      countWhere(aiJobs, and(eq(aiJobs.status, "rejected"),  gte(aiJobs.updatedAt, since24h))),
      countWhere(aiJobs, and(eq(aiJobs.status, "running"),   lt(aiJobs.updatedAt, staleRunningBefore))),
      countWhere(aiJobs, gte(aiJobs.createdAt, since24h)),
    ]);

    const [retryableRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiJobs)
      .where(
        and(
          inArray(aiJobs.status, ["failed", "rejected"]),
          sql`${aiJobs.retryCount} < ${aiJobs.maxRetries}`,
        ),
      );
    const retryableFailedJobs = Number(retryableRow?.n ?? 0);

    // --- Workers -------------------------------------------------------
    const workerRows = await db.select().from(aiWorkers);
    let onlineWorkers = 0, staleWorkers = 0, offlineWorkers = 0;
    let unhealthyWorkers = 0, busyWorkers = 0, idleWorkers = 0;
    for (const w of workerRows) {
      const age = now.getTime() - new Date(w.lastSeenAt).getTime();
      if (age <= WORKER_ONLINE_MAX_MS) onlineWorkers++;
      else if (age <= WORKER_STALE_MAX_MS) staleWorkers++;
      else offlineWorkers++;
      if (w.status === "unhealthy") unhealthyWorkers++;
      if (w.status === "busy" || w.currentJobId) busyWorkers++;
      if (w.status === "idle") idleWorkers++;
    }
    const totalWorkers = workerRows.length;

    // --- Audit / retention --------------------------------------------
    const auditEventsLast24h = await countWhere(aiJobEvents, gte(aiJobEvents.createdAt, since24h));

    const [lastRun] = await db
      .select()
      .from(aiRetentionRuns)
      .where(eq(aiRetentionRuns.dryRun, false))
      .orderBy(desc(aiRetentionRuns.createdAt))
      .limit(1);

    const rowsDeletedLastCleanup = lastRun?.deletedCounts
      ? sumCounts(lastRun.deletedCounts as Record<string, number>)
      : null;

    const recentExecuted = await db
      .select()
      .from(aiRetentionRuns)
      .where(
        and(
          eq(aiRetentionRuns.dryRun, false),
          eq(aiRetentionRuns.status, "succeeded"),
          gte(aiRetentionRuns.createdAt, since7d),
        ),
      );
    const rowsDeletedLast7d = recentExecuted.reduce(
      (acc, r) => acc + (r.deletedCounts ? sumCounts(r.deletedCounts as Record<string, number>) : 0),
      0,
    );

    const eligible = await aiRetentionService.previewCleanup(defaultPolicy());

    // --- CSV export audit (count-only) --------------------------------
    const [csvExportsLast24h, failedCsvExportsLast24h] = await Promise.all([
      countWhere(aiExportEvents, gte(aiExportEvents.createdAt, since24h)),
      countWhere(aiExportEvents, and(
        eq(aiExportEvents.status, "failed"),
        gte(aiExportEvents.createdAt, since24h),
      )),
    ]);

    // --- Health rollup -------------------------------------------------
    const reasons: string[] = [];
    if (staleRunningJobs > 0) reasons.push(`${staleRunningJobs} running job(s) appear stuck`);
    if (failedJobsLast24h >= 10) reasons.push(`${failedJobsLast24h} job failures in last 24h`);
    if (totalWorkers > 0 && onlineWorkers === 0 && pendingJobs > 0) {
      reasons.push("Pending jobs with no online worker");
    }
    if (unhealthyWorkers > 0) reasons.push(`${unhealthyWorkers} unhealthy worker(s)`);

    let healthStatus: AiOpsSummary["health"]["healthStatus"] = "healthy";
    if (
      staleRunningJobs > 0 ||
      (totalWorkers > 0 && onlineWorkers === 0 && pendingJobs > 0) ||
      failedJobsLast24h >= 10
    ) {
      healthStatus = "attention_needed";
    } else if (
      staleWorkers > 0 || offlineWorkers > 0 || unhealthyWorkers > 0 ||
      eligible.completedJobsEligible + eligible.failedJobsEligible +
        eligible.eventsEligible + eligible.workersEligible > 1000
    ) {
      healthStatus = "degraded";
      if (staleWorkers > 0) reasons.push(`${staleWorkers} stale worker(s)`);
      if (offlineWorkers > 0) reasons.push(`${offlineWorkers} offline worker(s)`);
    }

    return {
      jobs: {
        pendingJobs, runningJobs,
        succeededJobsLast24h, failedJobsLast24h, rejectedJobsLast24h,
        staleRunningJobs, retryableFailedJobs, totalJobsLast24h,
      },
      workers: {
        totalWorkers, onlineWorkers, staleWorkers, offlineWorkers,
        unhealthyWorkers, busyWorkers, idleWorkers,
      },
      audit: {
        auditEventsLast24h,
        lastCleanupAt: lastRun?.createdAt ? new Date(lastRun.createdAt).toISOString() : null,
        lastCleanupStatus: lastRun?.status ?? null,
        rowsDeletedLastCleanup,
        rowsDeletedLast7d,
        cleanupEligibleCounts: {
          completedJobs: eligible.completedJobsEligible,
          failedJobs: eligible.failedJobsEligible,
          auditEvents: eligible.eventsEligible,
          staleWorkers: eligible.workersEligible,
        },
        csvExportsLast24h,
        failedCsvExportsLast24h,
      },
      health: { healthStatus, healthReasons: reasons },
    };
  }
}

function sumCounts(c: Record<string, number>): number {
  return Object.values(c).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
}

export const aiOpsSummaryService = new AiOpsSummaryService();
