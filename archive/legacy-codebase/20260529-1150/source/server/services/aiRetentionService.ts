/**
 * AI retention & cleanup service.
 *
 * Lets root admins prune old AI operational data from three tables:
 *   - ai_jobs           (terminal jobs only — pending/running are NEVER touched)
 *   - ai_job_events     (audit rows older than the event retention)
 *   - ai_workers        (rows long-since offline with no current job)
 *
 * All read+delete pairs live behind the admin route. The service itself
 * has no scheduler — cleanup runs only when an admin calls it. Defaults
 * are conservative; a dry-run preview is always available and is the
 * default the UI sends.
 */

import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db";
import { aiJobs, aiJobEvents, aiWorkers, aiRetentionRuns, type AiRetentionRun } from "@shared/schema";

export interface RetentionPolicy {
  completedRetentionDays: number;
  failedRetentionDays: number;
  eventRetentionDays: number;
  workerStaleRetentionDays: number;
}

export interface RetentionCounts {
  completedJobsEligible: number;
  failedJobsEligible: number;
  eventsEligible: number;
  workersEligible: number;
}

export interface RetentionRunResult {
  policy: RetentionPolicy;
  eligible: RetentionCounts;
  deleted: RetentionCounts | null;
  dryRun: boolean;
}

const MIN_DAYS = {
  completedRetentionDays: 7,
  failedRetentionDays: 7,
  eventRetentionDays: 7,
  workerStaleRetentionDays: 1,
} as const;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function defaultPolicy(): RetentionPolicy {
  return {
    completedRetentionDays: envInt("AI_JOB_COMPLETED_RETENTION_DAYS", 90),
    failedRetentionDays: envInt("AI_JOB_FAILED_RETENTION_DAYS", 180),
    eventRetentionDays: envInt("AI_JOB_EVENT_RETENTION_DAYS", 180),
    workerStaleRetentionDays: envInt("AI_WORKER_STALE_RETENTION_DAYS", 30),
  };
}

/** Clamp every field to its safe minimum and coerce non-finite to default. */
export function normalizePolicy(input: Partial<RetentionPolicy> | undefined): RetentionPolicy {
  const base = defaultPolicy();
  const merged: RetentionPolicy = { ...base, ...(input ?? {}) };
  const out: RetentionPolicy = {
    completedRetentionDays: Math.max(MIN_DAYS.completedRetentionDays, Math.floor(merged.completedRetentionDays)),
    failedRetentionDays: Math.max(MIN_DAYS.failedRetentionDays, Math.floor(merged.failedRetentionDays)),
    eventRetentionDays: Math.max(MIN_DAYS.eventRetentionDays, Math.floor(merged.eventRetentionDays)),
    workerStaleRetentionDays: Math.max(MIN_DAYS.workerStaleRetentionDays, Math.floor(merged.workerStaleRetentionDays)),
  };
  for (const k of Object.keys(out) as Array<keyof RetentionPolicy>) {
    if (!Number.isFinite(out[k])) out[k] = base[k];
  }
  return out;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

class AiRetentionService {
  /** Count rows that would be deleted under the given policy. */
  async previewCleanup(policy: RetentionPolicy): Promise<RetentionCounts> {
    const completedBefore = daysAgo(policy.completedRetentionDays);
    const failedBefore = daysAgo(policy.failedRetentionDays);
    const eventsBefore = daysAgo(policy.eventRetentionDays);
    const workersBefore = daysAgo(policy.workerStaleRetentionDays);

    const [completed] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiJobs)
      .where(
        and(
          inArray(aiJobs.status, ["succeeded"]),
          lt(aiJobs.updatedAt, completedBefore),
        ),
      );

    const [failed] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiJobs)
      .where(
        and(
          inArray(aiJobs.status, ["failed", "rejected"]),
          lt(aiJobs.updatedAt, failedBefore),
        ),
      );

    const [events] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiJobEvents)
      .where(lt(aiJobEvents.createdAt, eventsBefore));

    const [workers] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiWorkers)
      .where(
        and(
          lt(aiWorkers.lastSeenAt, workersBefore),
          isNull(aiWorkers.currentJobId),
        ),
      );

    return {
      completedJobsEligible: Number(completed?.n ?? 0),
      failedJobsEligible: Number(failed?.n ?? 0),
      eventsEligible: Number(events?.n ?? 0),
      workersEligible: Number(workers?.n ?? 0),
    };
  }

  /**
   * Run the cleanup. If dryRun is true (the default for safety), returns
   * the preview without deleting. Pending and running jobs are NEVER
   * touched, regardless of age. Workers with a current_job_id are NEVER
   * touched, regardless of last-seen age.
   *
   * Every invocation (dry-run OR real) is persisted to ai_retention_runs
   * so admins can review who ran cleanup, when, with what policy, and
   * what was eligible/deleted.
   */
  async runCleanup(
    inputPolicy: Partial<RetentionPolicy> | undefined,
    opts: { adminId: string; dryRun: boolean },
  ): Promise<RetentionRunResult & { runId: string }> {
    const policy = normalizePolicy(inputPolicy);
    const runId = await this.createRetentionRun({ adminId: opts.adminId, dryRun: opts.dryRun, policy });
    let eligible: RetentionCounts;
    try {
      eligible = await this.previewCleanup(policy);
    } catch (err) {
      await this.failRetentionRun(runId, safeErrorMessage(err));
      throw err;
    }
    if (opts.dryRun) {
      await this.completeRetentionRun(runId, { eligible, deleted: null });
      return { runId, policy, eligible, deleted: null, dryRun: true };
    }

    const completedBefore = daysAgo(policy.completedRetentionDays);
    const failedBefore = daysAgo(policy.failedRetentionDays);
    const eventsBefore = daysAgo(policy.eventRetentionDays);
    const workersBefore = daysAgo(policy.workerStaleRetentionDays);

    let deleted: RetentionCounts;
    try {
      deleted = await db.transaction(async (tx) => {
      const completedRows = await tx
        .delete(aiJobs)
        .where(
          and(
            eq(aiJobs.status, "succeeded"),
            lt(aiJobs.updatedAt, completedBefore),
          ),
        )
        .returning({ id: aiJobs.id });

      const failedRows = await tx
        .delete(aiJobs)
        .where(
          and(
            inArray(aiJobs.status, ["failed", "rejected"]),
            lt(aiJobs.updatedAt, failedBefore),
          ),
        )
        .returning({ id: aiJobs.id });

      const eventsRows = await tx
        .delete(aiJobEvents)
        .where(lt(aiJobEvents.createdAt, eventsBefore))
        .returning({ id: aiJobEvents.id });

      const workerRows = await tx
        .delete(aiWorkers)
        .where(
          and(
            lt(aiWorkers.lastSeenAt, workersBefore),
            isNull(aiWorkers.currentJobId),
          ),
        )
        .returning({ id: aiWorkers.id });

        return {
          completedJobsEligible: completedRows.length,
          failedJobsEligible: failedRows.length,
          eventsEligible: eventsRows.length,
          workersEligible: workerRows.length,
        } as RetentionCounts;
      });
    } catch (err) {
      await this.failRetentionRun(runId, safeErrorMessage(err));
      throw err;
    }

    await this.completeRetentionRun(runId, { eligible, deleted });
    console.log("[aiRetentionService] cleanup executed", { runId, adminId: opts.adminId, policy, deleted });
    return { runId, policy, eligible, deleted, dryRun: false };
  }

  // ---- retention run history ------------------------------------------

  async createRetentionRun(args: {
    adminId: string;
    dryRun: boolean;
    policy: RetentionPolicy;
  }): Promise<string> {
    const runId = randomUUID();
    await db.insert(aiRetentionRuns).values({
      runId,
      adminId: args.adminId,
      dryRun: args.dryRun,
      policy: args.policy as unknown as Record<string, number>,
      eligibleCounts: {} as Record<string, number>,
      status: "started",
    });
    return runId;
  }

  async completeRetentionRun(
    runId: string,
    args: { eligible: RetentionCounts; deleted: RetentionCounts | null },
  ): Promise<void> {
    await db
      .update(aiRetentionRuns)
      .set({
        status: "succeeded",
        eligibleCounts: args.eligible as unknown as Record<string, number>,
        deletedCounts: (args.deleted ?? null) as unknown as Record<string, number> | null,
        completedAt: new Date(),
      })
      .where(eq(aiRetentionRuns.runId, runId));
  }

  async failRetentionRun(runId: string, error: string): Promise<void> {
    await db
      .update(aiRetentionRuns)
      .set({
        status: "failed",
        error: error.slice(0, 1000),
        completedAt: new Date(),
      })
      .where(eq(aiRetentionRuns.runId, runId));
  }

  async listRetentionRuns(filters: {
    dryRun?: boolean;
    status?: string;
    adminId?: string;
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<AiRetentionRun[]> {
    const where = [] as any[];
    if (typeof filters.dryRun === "boolean") where.push(eq(aiRetentionRuns.dryRun, filters.dryRun));
    if (filters.status) where.push(eq(aiRetentionRuns.status, filters.status));
    if (filters.adminId) where.push(eq(aiRetentionRuns.adminId, filters.adminId));
    if (filters.since) where.push(gte(aiRetentionRuns.createdAt, filters.since));
    if (filters.until) where.push(lte(aiRetentionRuns.createdAt, filters.until));
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const q = db
      .select()
      .from(aiRetentionRuns)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(aiRetentionRuns.createdAt))
      .limit(limit)
      .offset(offset);
    return q;
  }
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || "unknown error";
  if (typeof err === "string") return err;
  return "unknown error";
}

export const aiRetentionService = new AiRetentionService();
