/**
 * aiJobService — TypeScript-side job creation + persistence layer for the
 * Python worker scaffold. Backed by the Postgres `ai_jobs` table (see
 * shared/schema.ts).
 *
 * Responsibilities:
 *   1. Mint a JobEnvelope matching shared/aiJobContracts.ts (which mirrors
 *      python-workers/shared/contracts.py).
 *   2. Validate the user-vs-inhouse origin boundary defensively before storing.
 *   3. Persist jobs durably in the `ai_jobs` table so they survive restarts
 *      and can be consumed by Python workers later.
 *   4. Expose a status/result API the Python worker (or a future DB poller)
 *      can call to claim jobs and post back results.
 *
 * Permission model (defensive — primary auth lives in the route handlers):
 *   - user.* jobs require origin=user and a non-empty requestedByUserId.
 *   - inhouse.* jobs require origin=inhouse and a non-empty requestedByAdminId.
 *   - vector / media / eval pipelines accept either origin.
 *
 * The frontend never calls Python directly. The frontend hits the TypeScript
 * API; the route handler authenticates + authorizes + delegates here.
 */

import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { aiJobs, aiJobEvents, type AiJob, type AiJobEvent } from "@shared/schema";
import { aiWorkerService } from "./aiWorkerService";
import {
  INHOUSE_JOB_TYPES,
  JobOrigin,
  JobStatus,
  JobType,
  USER_JOB_TYPES,
  claimExtractionPayloadSchema,
  jobEnvelopeSchema,
  jobResultSchema,
  newsroomPackagePayloadSchema,
  semanticClusteringPayloadSchema,
  type AiJobView,
  type ClaimExtractionPayload,
  type JobEnvelope,
  type JobResult,
  type NewsroomPackagePayload,
  type SemanticClusteringPayload,
} from "@shared/aiJobContracts";

export class AiJobValidationError extends Error {
  readonly code = "AI_JOB_VALIDATION";
}
export class AiJobPermissionError extends Error {
  readonly code = "AI_JOB_PERMISSION";
}
export class AiJobNotFoundError extends Error {
  readonly code = "AI_JOB_NOT_FOUND";
}
export class AiJobLockError extends Error {
  readonly code = "AI_JOB_LOCK";
}
export class AiJobConflictError extends Error {
  readonly code = "AI_JOB_CONFLICT";
}

interface CreateJobInput<TPayload> {
  jobType: JobType;
  origin: JobOrigin;
  payload: TPayload;
  requestedByUserId?: string | null;
  requestedByAdminId?: string | null;
  requestId?: string;
  priority?: number;
  maxRetries?: number;
}

export interface ViewerContext {
  userId?: string | null;
  isAdmin?: boolean;
}

class AiJobService {
  // -------------------------------------------------------------------------
  // Audit logging (append-only)
  // -------------------------------------------------------------------------

  /**
   * Append one row to `ai_job_events`. Designed to be best-effort: a
   * failure here logs to console but does NOT throw, so the underlying
   * job state change is never reverted by an audit hiccup. Callers that
   * need atomicity should wrap both writes in a transaction explicitly.
   */
  private async logEvent(input: {
    jobId: string;
    eventType: string;
    actorType: "user" | "admin" | "worker" | "system";
    actorUserId?: string | null;
    actorAdminId?: string | null;
    actorWorkerId?: string | null;
    previousStatus?: string | null;
    newStatus?: string | null;
    message?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await db.insert(aiJobEvents).values({
        jobId: input.jobId,
        eventType: input.eventType,
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        actorAdminId: input.actorAdminId ?? null,
        actorWorkerId: input.actorWorkerId ?? null,
        previousStatus: input.previousStatus ?? null,
        newStatus: input.newStatus ?? null,
        message: input.message ? input.message.slice(0, 1000) : null,
        metadata: this.compactMetadata(input.metadata ?? {}),
      });
    } catch (err) {
      console.error("[aiJobService] audit log failed", input.eventType, input.jobId, err);
    }
  }

  /** Strip large or unsafe values from event metadata before persisting. */
  private compactMetadata(meta: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "string") out[k] = v.slice(0, 500);
      else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
      else if (Array.isArray(v)) out[k] = { count: v.length };
      else if (typeof v === "object") {
        const keys = Object.keys(v as Record<string, unknown>);
        out[k] = keys.length > 12 ? { keys: keys.slice(0, 12) } : v;
      }
    }
    return out;
  }

  /** Admin: list events for one job, oldest-first. */
  async listJobEvents(jobId: string, limit = 200): Promise<AiJobEvent[]> {
    const clamped = Math.max(1, Math.min(limit, 500));
    return db
      .select()
      .from(aiJobEvents)
      .where(eq(aiJobEvents.jobId, jobId))
      .orderBy(asc(aiJobEvents.createdAt))
      .limit(clamped);
  }

  /** Admin: list events across jobs with filters. */
  async listAllEvents(args: {
    jobId?: string;
    eventType?: string;
    actorType?: string;
    actorUserId?: string;
    actorAdminId?: string;
    actorWorkerId?: string;
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AiJobEvent[]> {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    const offset = Math.max(0, args.offset ?? 0);
    const where: SQL[] = [];
    if (args.jobId) where.push(eq(aiJobEvents.jobId, args.jobId));
    if (args.eventType) where.push(eq(aiJobEvents.eventType, args.eventType));
    if (args.actorType) where.push(eq(aiJobEvents.actorType, args.actorType));
    if (args.actorUserId) where.push(eq(aiJobEvents.actorUserId, args.actorUserId));
    if (args.actorAdminId) where.push(eq(aiJobEvents.actorAdminId, args.actorAdminId));
    if (args.actorWorkerId) where.push(eq(aiJobEvents.actorWorkerId, args.actorWorkerId));
    if (args.since) where.push(gte(aiJobEvents.createdAt, args.since));
    if (args.until) where.push(lte(aiJobEvents.createdAt, args.until));
    return db
      .select()
      .from(aiJobEvents)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(aiJobEvents.createdAt))
      .limit(limit)
      .offset(offset);
  }

  // -------------------------------------------------------------------------
  // Generic create
  // -------------------------------------------------------------------------

  async createJob<TPayload extends Record<string, unknown>>(
    input: CreateJobInput<TPayload>,
  ): Promise<JobEnvelope> {
    this.assertOriginMatchesType(input.jobType, input.origin);
    this.assertContextMatchesOrigin(
      input.origin,
      input.requestedByUserId,
      input.requestedByAdminId,
    );

    const now = new Date();
    const envelope: JobEnvelope = {
      jobId: randomUUID(),
      jobType: input.jobType,
      provenance: {
        origin: input.origin,
        requestedByUserId: input.requestedByUserId ?? null,
        requestedByAdminId: input.requestedByAdminId ?? null,
        requestId: input.requestId ?? randomUUID(),
        enqueuedAt: now.toISOString(),
      },
      payload: input.payload,
      priority: input.priority ?? 0,
    };

    // Re-parse to guarantee the envelope matches the wire schema exactly.
    const parsed = jobEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      throw new AiJobValidationError(parsed.error.message);
    }

    await db.insert(aiJobs).values({
      id: parsed.data.jobId,
      jobType: parsed.data.jobType,
      origin: parsed.data.provenance.origin,
      status: JobStatus.PENDING,
      payload: parsed.data.payload as Record<string, unknown>,
      provenance: parsed.data.provenance as unknown as Record<string, unknown>,
      requestedByUserId: parsed.data.provenance.requestedByUserId ?? null,
      requestedByAdminId: parsed.data.provenance.requestedByAdminId ?? null,
      requestId: parsed.data.provenance.requestId,
      priority: parsed.data.priority,
      maxRetries: input.maxRetries ?? 3,
      createdAt: now,
      updatedAt: now,
    });
    await this.logEvent({
      jobId: parsed.data.jobId,
      eventType: "job.created",
      actorType: input.origin === JobOrigin.INHOUSE ? "admin" : "user",
      actorUserId: input.requestedByUserId ?? null,
      actorAdminId: input.requestedByAdminId ?? null,
      newStatus: JobStatus.PENDING,
      message: `Job created (${input.jobType})`,
      metadata: { jobType: input.jobType, origin: input.origin, priority: parsed.data.priority },
    });
    return parsed.data;
  }

  // -------------------------------------------------------------------------
  // Three initial typed helpers (the routes use these)
  // -------------------------------------------------------------------------

  async createClaimExtractionJob(args: {
    payload: unknown;
    requestedByUserId: string;
    requestId?: string;
  }): Promise<JobEnvelope> {
    const payload = this.parsePayload(claimExtractionPayloadSchema, args.payload);
    return this.createJob<ClaimExtractionPayload>({
      jobType: JobType.USER_CLAIM_EXTRACTION,
      origin: JobOrigin.USER,
      payload,
      requestedByUserId: args.requestedByUserId,
      requestId: args.requestId,
    });
  }

  async createSemanticClusteringJob(args: {
    payload: unknown;
    origin: JobOrigin;
    requestedByUserId?: string;
    requestedByAdminId?: string;
    requestId?: string;
  }): Promise<JobEnvelope> {
    const payload = this.parsePayload(semanticClusteringPayloadSchema, args.payload);
    return this.createJob<SemanticClusteringPayload>({
      jobType: JobType.VECTOR_CLUSTERING,
      origin: args.origin,
      payload,
      requestedByUserId: args.requestedByUserId,
      requestedByAdminId: args.requestedByAdminId,
      requestId: args.requestId,
    });
  }

  async createNewsroomPackageJob(args: {
    payload: unknown;
    requestedByAdminId: string;
    requestId?: string;
  }): Promise<JobEnvelope> {
    const payload = this.parsePayload(newsroomPackagePayloadSchema, args.payload);
    return this.createJob<NewsroomPackagePayload>({
      jobType: JobType.INHOUSE_NEWSROOM,
      origin: JobOrigin.INHOUSE,
      payload,
      requestedByAdminId: args.requestedByAdminId,
      requestId: args.requestId,
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle (consumed by the future Python-worker bridge)
  // -------------------------------------------------------------------------

  /**
   * List pending jobs, oldest-first. Used by the worker bridge.
   * Does NOT acquire a lock — call markRunning(jobId, lockedBy) to claim a job.
   */
  async listPending(limit = 25): Promise<JobEnvelope[]> {
    const rows = await db
      .select()
      .from(aiJobs)
      .where(eq(aiJobs.status, JobStatus.PENDING))
      .orderBy(asc(aiJobs.createdAt))
      .limit(Math.max(1, Math.min(limit, 100)));
    return rows.map((row) => this.rowToEnvelope(row));
  }

  async getJob(jobId: string): Promise<AiJob> {
    const [row] = await db.select().from(aiJobs).where(eq(aiJobs.id, jobId)).limit(1);
    if (!row) throw new AiJobNotFoundError(jobId);
    return row;
  }

  /**
   * Frontend-safe view. If a viewer context is provided, enforces:
   *   - Non-admin viewers can only see jobs they own (requestedByUserId match).
   *   - Inhouse-origin jobs are hidden from non-admin viewers.
   *   - Admin viewers see everything.
   * If viewer is omitted, returns the view without filtering (server-internal use).
   */
  async getView(jobId: string, viewer?: ViewerContext): Promise<AiJobView> {
    const row = await this.getJob(jobId);
    if (viewer && !viewer.isAdmin) {
      const isOwnedByViewer =
        !!viewer.userId && row.requestedByUserId === viewer.userId;
      if (row.origin === JobOrigin.INHOUSE || !isOwnedByViewer) {
        throw new AiJobNotFoundError(jobId);
      }
    }
    return this.rowToView(row);
  }

  /**
   * Worker-side claim. Atomically transitions PENDING → RUNNING and stamps
   * locked_at / locked_by / started_at. Increments retry_count if the job was
   * already RUNNING (i.e. a previous attempt died before completing).
   *
   * Returns the resulting envelope or throws AiJobLockError if the job
   * cannot be claimed (e.g. another worker grabbed it first, or it is
   * already in a terminal state).
   */
  async markRunning(jobId: string, lockedBy = "python-worker"): Promise<JobEnvelope> {
    const now = new Date();
    const updated = await db
      .update(aiJobs)
      .set({
        status: JobStatus.RUNNING,
        lockedAt: now,
        lockedBy,
        startedAt: now,
        retryCount: sql`${aiJobs.retryCount} + CASE WHEN ${aiJobs.status} = ${JobStatus.RUNNING} THEN 1 ELSE 0 END`,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiJobs.id, jobId),
          sql`${aiJobs.status} IN (${JobStatus.PENDING}, ${JobStatus.RUNNING})`,
        ),
      )
      .returning();
    if (updated.length === 0) {
      throw new AiJobLockError(
        `Could not claim job ${jobId}: not found or already in a terminal state`,
      );
    }
    await this.logEvent({
      jobId,
      eventType: "job.claimed",
      actorType: "worker",
      actorWorkerId: lockedBy,
      newStatus: JobStatus.RUNNING,
      message: `Worker ${lockedBy} claimed job`,
      metadata: { retryCount: updated[0].retryCount },
    });
    await aiWorkerService.noteClaim(lockedBy, jobId);
    return this.rowToEnvelope(updated[0]);
  }

  /**
   * Persist a JobResult posted by the worker. Updates status, result/error,
   * completed_at or failed_at, duration_ms, metrics, and updated_at.
   */
  async recordResult(
    rawResult: unknown,
    workerContext?: { workerId: string } | null,
  ): Promise<JobResult> {
    const parsed = jobResultSchema.safeParse(rawResult);
    if (!parsed.success) throw new AiJobValidationError(parsed.error.message);
    const result = parsed.data;
    const now = new Date();

    const isTerminal =
      result.status === JobStatus.SUCCEEDED ||
      result.status === JobStatus.FAILED ||
      result.status === JobStatus.REJECTED;
    const isFailure =
      result.status === JobStatus.FAILED || result.status === JobStatus.REJECTED;

    // Guard against stale results: if the job has already been moved to a
    // terminal state by an admin (e.g. cancelled → REJECTED) or by a prior
    // successful worker run, do NOT let a late worker overwrite that state.
    // Only allow updates when the row is currently PENDING or RUNNING.
    const updated = await db
      .update(aiJobs)
      .set({
        status: result.status,
        result: (result.result ?? null) as Record<string, unknown> | null,
        error: result.error ?? null,
        durationMs: result.durationMs ?? null,
        metrics: (result.metrics ?? {}) as Record<string, unknown>,
        completedAt: isTerminal && !isFailure ? now : null,
        failedAt: isFailure ? now : null,
        lockedAt: null,
        lockedBy: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiJobs.id, result.jobId),
          sql`${aiJobs.status} IN (${JobStatus.PENDING}, ${JobStatus.RUNNING})`,
        ),
      )
      .returning();
    if (updated.length === 0) {
      // Distinguish missing vs. stale-after-cancel for clearer worker logs.
      const [existing] = await db
        .select()
        .from(aiJobs)
        .where(eq(aiJobs.id, result.jobId))
        .limit(1);
      if (!existing) throw new AiJobNotFoundError(result.jobId);
      await this.logEvent({
        jobId: result.jobId,
        eventType: "job.result_rejected",
        actorType: "worker",
        actorWorkerId: workerContext?.workerId ?? existing.lockedBy ?? null,
        previousStatus: existing.status,
        newStatus: existing.status,
        message: `Stale ${result.status} result rejected; row is already terminal (${existing.status})`,
        metadata: { attemptedStatus: result.status, durationMs: result.durationMs ?? null },
      });
      throw new AiJobConflictError(
        `Job ${result.jobId} is in terminal state '${existing.status}'; refusing to overwrite with worker result`,
      );
    }
    await this.logEvent({
      jobId: result.jobId,
      eventType:
        result.status === JobStatus.SUCCEEDED ? "job.succeeded"
        : result.status === JobStatus.FAILED ? "job.failed"
        : result.status === JobStatus.REJECTED ? "job.rejected"
        : "job.running",
      actorType: "worker",
      actorWorkerId: updated[0].lockedBy,
      previousStatus: JobStatus.RUNNING,
      newStatus: result.status,
      message: isFailure
        ? (result.error ? result.error.slice(0, 240) : "Job ended in failure")
        : `Worker reported ${result.status}`,
      metadata: { durationMs: result.durationMs ?? null },
    });
    await aiWorkerService.noteResult(
      updated[0].lockedBy,
      result.status === JobStatus.SUCCEEDED ? "succeeded" : "failed",
    );
    return result;
  }

  // -------------------------------------------------------------------------
  // Admin lifecycle controls (retry / cancel / stale-detect)
  // -------------------------------------------------------------------------

  /**
   * Admin-only: retry a failed or rejected job.
   * - Resets the row to PENDING so the worker can pick it up again.
   * - Clears locks, started/completed/failed timestamps, and the live error.
   * - Archives the previous error + result into `metrics.previousAttempts[]`
   *   so history is preserved without polluting the active fields.
   * - Increments `retryCount` and refuses once `retryCount >= maxRetries`.
   * - Records the admin who requested the retry in
   *   `metrics.lastRetryRequestedByAdminId`.
   * Throws AiJobConflictError if the job is not in a retryable state.
   */
  async retryJob(jobId: string, adminContext: { adminId: string }): Promise<AiJob> {
    const row = await this.getJob(jobId);
    if (row.status !== JobStatus.FAILED && row.status !== JobStatus.REJECTED) {
      throw new AiJobConflictError(
        `Job ${jobId} cannot be retried from status '${row.status}'`,
      );
    }
    const nextRetryCount = (row.retryCount ?? 0) + 1;
    if (nextRetryCount > (row.maxRetries ?? 3)) {
      throw new AiJobConflictError(
        `Job ${jobId} has reached maxRetries (${row.maxRetries})`,
      );
    }
    const now = new Date();
    const previousMetrics =
      row.metrics && typeof row.metrics === "object" ? (row.metrics as Record<string, unknown>) : {};
    const prevAttempts = Array.isArray(previousMetrics.previousAttempts)
      ? (previousMetrics.previousAttempts as unknown[])
      : [];
    const nextMetrics: Record<string, unknown> = {
      ...previousMetrics,
      previousAttempts: [
        ...prevAttempts,
        {
          attemptNumber: row.retryCount ?? 0,
          status: row.status,
          error: typeof row.error === "string" ? row.error.slice(0, 1000) : null,
          failedAt: row.failedAt?.toISOString() ?? null,
          completedAt: row.completedAt?.toISOString() ?? null,
          archivedAt: now.toISOString(),
        },
      ].slice(-10),
      lastRetryRequestedByAdminId: adminContext.adminId,
      lastRetryRequestedAt: now.toISOString(),
    };
    const [updated] = await db
      .update(aiJobs)
      .set({
        status: JobStatus.PENDING,
        error: null,
        result: null,
        durationMs: null,
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        retryCount: nextRetryCount,
        metrics: nextMetrics,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiJobs.id, jobId),
          sql`${aiJobs.status} IN (${JobStatus.FAILED}, ${JobStatus.REJECTED})`,
        ),
      )
      .returning();
    if (!updated) {
      // Lost the race — someone else changed the status.
      throw new AiJobConflictError(`Job ${jobId} state changed during retry`);
    }
    await this.logEvent({
      jobId,
      eventType: "job.retried",
      actorType: "admin",
      actorAdminId: adminContext.adminId,
      previousStatus: row.status,
      newStatus: JobStatus.PENDING,
      message: `Admin re-queued job (attempt ${nextRetryCount}/${row.maxRetries})`,
      metadata: { retryCount: nextRetryCount, maxRetries: row.maxRetries },
    });
    return updated;
  }

  /**
   * Admin-only: cancel a pending or running job.
   * - Pending jobs are safe to cancel — they have not been claimed.
   * - Running jobs are marked REJECTED with error="cancelled_by_admin".
   *   The Python worker may still post a late result; recordResult guards
   *   against that by only updating rows currently in PENDING/RUNNING.
   * - Succeeded/failed/already-rejected jobs cannot be cancelled.
   */
  async cancelJob(jobId: string, adminContext: { adminId: string }): Promise<AiJob> {
    const row = await this.getJob(jobId);
    if (row.status !== JobStatus.PENDING && row.status !== JobStatus.RUNNING) {
      throw new AiJobConflictError(
        `Job ${jobId} cannot be cancelled from status '${row.status}'`,
      );
    }
    const now = new Date();
    const previousMetrics =
      row.metrics && typeof row.metrics === "object" ? (row.metrics as Record<string, unknown>) : {};
    const [updated] = await db
      .update(aiJobs)
      .set({
        status: JobStatus.REJECTED,
        error: "cancelled_by_admin",
        failedAt: now,
        completedAt: null,
        lockedAt: null,
        lockedBy: null,
        metrics: {
          ...previousMetrics,
          cancelledByAdminId: adminContext.adminId,
          cancelledAt: now.toISOString(),
          cancelledFromStatus: row.status,
        },
        updatedAt: now,
      })
      .where(
        and(
          eq(aiJobs.id, jobId),
          sql`${aiJobs.status} IN (${JobStatus.PENDING}, ${JobStatus.RUNNING})`,
        ),
      )
      .returning();
    if (!updated) {
      throw new AiJobConflictError(`Job ${jobId} state changed during cancel`);
    }
    await this.logEvent({
      jobId,
      eventType: "job.cancelled",
      actorType: "admin",
      actorAdminId: adminContext.adminId,
      previousStatus: row.status,
      newStatus: JobStatus.REJECTED,
      message: "cancelled_by_admin",
      metadata: { cancelledFromStatus: row.status },
    });
    return updated;
  }

  /**
   * Identify jobs stuck in RUNNING beyond a configurable threshold.
   * Read-only — does NOT release or retry. Admins inspect the list and
   * decide what to do.
   */
  async listStaleRunningJobs(args: { olderThanMs?: number; limit?: number } = {}): Promise<AiJob[]> {
    const threshold = new Date(Date.now() - Math.max(60_000, args.olderThanMs ?? 15 * 60_000));
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const rows = await db
      .select()
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.status, JobStatus.RUNNING),
          lte(aiJobs.lockedAt, threshold),
        ),
      )
      .orderBy(asc(aiJobs.lockedAt))
      .limit(limit);
    // Best-effort: log a stale-detect event for each row so admins have
    // a paper trail. Bounded by limit so this is small.
    await Promise.all(
      rows.map((r) =>
        this.logEvent({
          jobId: r.id,
          eventType: "job.stale_detected",
          actorType: "system",
          previousStatus: r.status,
          newStatus: r.status,
          message: `Detected as stale (locked by ${r.lockedBy ?? "?"})`,
          metadata: {
            lockedBy: r.lockedBy,
            lockedAt: r.lockedAt?.toISOString() ?? null,
            retryCount: r.retryCount,
          },
        }),
      ),
    );
    return rows;
  }

  /** TEST-ONLY helper. Truncates the table. */
  async _resetForTests(): Promise<void> {
    await db.delete(aiJobs);
  }

  // -------------------------------------------------------------------------
  // List / history (user + admin)
  // -------------------------------------------------------------------------

  /**
   * List a single user's jobs (USER origin, requestedByUserId match).
   * Admin/INHOUSE jobs are never returned here even if filters disagree.
   */
  async listUserJobs(args: {
    userId: string;
    status?: string;
    jobType?: string;
    limit?: number;
    offset?: number;
    since?: Date;
    until?: Date;
  }): Promise<AiJobHistoryItem[]> {
    if (!args.userId) return [];
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
    const offset = Math.max(0, args.offset ?? 0);
    const where: SQL[] = [
      eq(aiJobs.requestedByUserId, args.userId),
      eq(aiJobs.origin, JobOrigin.USER),
    ];
    if (args.status) where.push(eq(aiJobs.status, args.status));
    if (args.jobType) where.push(eq(aiJobs.jobType, args.jobType));
    if (args.since) where.push(gte(aiJobs.createdAt, args.since));
    if (args.until) where.push(lte(aiJobs.createdAt, args.until));
    const rows = await db
      .select()
      .from(aiJobs)
      .where(and(...where))
      .orderBy(desc(aiJobs.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => this.rowToHistoryItem(r, { redactError: true }));
  }

  /**
   * Admin: list any jobs with optional filters across all origins/users.
   * Returns richer fields (locking, retry count, raw error) intended for
   * the admin job monitor only.
   */
  async listAdminJobs(args: {
    status?: string;
    jobType?: string;
    origin?: string;
    requestedByUserId?: string;
    requestedByAdminId?: string;
    lockedBy?: string;
    limit?: number;
    offset?: number;
    since?: Date;
    until?: Date;
  }): Promise<AiJobAdminItem[]> {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const offset = Math.max(0, args.offset ?? 0);
    const where: SQL[] = [];
    if (args.status) where.push(eq(aiJobs.status, args.status));
    if (args.jobType) where.push(eq(aiJobs.jobType, args.jobType));
    if (args.origin) where.push(eq(aiJobs.origin, args.origin));
    if (args.requestedByUserId) where.push(eq(aiJobs.requestedByUserId, args.requestedByUserId));
    if (args.requestedByAdminId) where.push(eq(aiJobs.requestedByAdminId, args.requestedByAdminId));
    if (args.lockedBy) where.push(eq(aiJobs.lockedBy, args.lockedBy));
    if (args.since) where.push(gte(aiJobs.createdAt, args.since));
    if (args.until) where.push(lte(aiJobs.createdAt, args.until));
    const rows = await db
      .select()
      .from(aiJobs)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(aiJobs.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => this.rowToAdminItem(r));
  }

  /**
   * Compact summary of a job's result blob, keyed by jobType. Returns the
   * minimum shape needed for a list-view summary, NEVER the full result.
   * Returns null when the job has no result yet.
   */
  summarizeResult(jobType: string, result: unknown): Record<string, unknown> | null {
    if (!result || typeof result !== "object") return null;
    const r = result as Record<string, any>;
    if (jobType === JobType.USER_CLAIM_EXTRACTION) {
      const claims = Array.isArray(r.claims) ? r.claims : [];
      return {
        claimCount: claims.length,
        topClaims: claims.slice(0, 3).map((c: any) => ({
          text: typeof c?.text === "string" ? c.text.slice(0, 240) : undefined,
          claim_type: c?.claim_type,
          confidence: typeof c?.confidence === "number" ? c.confidence : undefined,
        })),
      };
    }
    if (jobType === JobType.VECTOR_CLUSTERING) {
      const clusters = Array.isArray(r.clusters) ? r.clusters : [];
      return {
        clusterCount: clusters.length,
        labels: clusters.slice(0, 6).map((c: any) => c?.label ?? c?.cluster_id ?? "?"),
        engine: typeof r.engine === "string" ? r.engine : undefined,
      };
    }
    if (jobType === JobType.INHOUSE_NEWSROOM) {
      return {
        packageId: r.package_id,
        topClaimCount: Array.isArray(r.top_claims) ? r.top_claims.length : 0,
        clusterCount: Array.isArray(r.topic_clusters) ? r.topic_clusters.length : 0,
        riskFlagCount: Array.isArray(r.risk_flags) ? r.risk_flags.length : 0,
        confidence: typeof r.confidence === "number" ? r.confidence : undefined,
      };
    }
    // Unknown type — return shape hint only.
    return { keys: Object.keys(r).slice(0, 8) };
  }

  /** Compact summary of a job's payload (admin-side debug). Never echoes
   *  the full payload; just enough to identify the source set. */
  summarizePayload(jobType: string, payload: unknown): Record<string, unknown> | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, any>;
    const summary: Record<string, unknown> = {};
    if (Array.isArray(p.articles)) summary.articleCount = p.articles.length;
    if (Array.isArray(p.articleIds)) summary.articleIdCount = p.articleIds.length;
    if (Array.isArray(p.documents)) summary.documentCount = p.documents.length;
    if (Array.isArray(p.documentIds)) summary.documentIdCount = p.documentIds.length;
    if (Array.isArray(p.claims)) summary.claimCount = p.claims.length;
    if (Array.isArray(p.clusters)) summary.clusterCount = p.clusters.length;
    if (typeof p.verifiedKnowledgeId === "string") summary.verifiedKnowledgeId = p.verifiedKnowledgeId;
    if (typeof p.templateId === "string") summary.templateId = p.templateId;
    if (typeof p.postId === "string") summary.postId = p.postId;
    return Object.keys(summary).length ? summary : null;
  }

  private rowToHistoryItem(row: AiJob, opts: { redactError?: boolean } = {}): AiJobHistoryItem {
    const summary = this.summarizeResult(row.jobType, row.result);
    return {
      jobId: row.id,
      jobType: row.jobType,
      origin: row.origin as JobOrigin,
      status: row.status as JobStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      failedAt: row.failedAt?.toISOString() ?? null,
      sourceSummary: this.summarizePayload(row.jobType, row.payload),
      resultSummary: summary,
      statusUrl: `/api/ai-jobs/${row.id}`,
      error: opts.redactError ? (row.error ? "job failed" : null) : null,
    };
  }

  private rowToAdminItem(row: AiJob): AiJobAdminItem {
    return {
      ...this.rowToHistoryItem(row, { redactError: false }),
      requestedByUserId: row.requestedByUserId,
      requestedByAdminId: row.requestedByAdminId,
      lockedBy: row.lockedBy,
      lockedAt: row.lockedAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      // Admin sees error message but NEVER stack traces (we never store them).
      // The `error` column is a plain string set by the worker; pass through.
      error: typeof row.error === "string" ? row.error.slice(0, 1000) : null,
      durationMs: row.durationMs ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private rowToEnvelope(row: AiJob): JobEnvelope {
    return {
      jobId: row.id,
      jobType: row.jobType,
      provenance: {
        origin: row.origin as JobOrigin,
        requestedByUserId: row.requestedByUserId,
        requestedByAdminId: row.requestedByAdminId,
        requestId: row.requestId ?? row.id,
        enqueuedAt: row.createdAt.toISOString(),
      },
      payload: (row.payload ?? {}) as Record<string, unknown>,
      priority: row.priority,
    };
  }

  private rowToView(row: AiJob): AiJobView {
    return {
      jobId: row.id,
      jobType: row.jobType,
      origin: row.origin as JobOrigin,
      status: row.status as JobStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      error: row.error ?? null,
      durationMs: row.durationMs ?? null,
    };
  }

  private assertOriginMatchesType(jobType: JobType, origin: JobOrigin): void {
    if (USER_JOB_TYPES.has(jobType) && origin !== JobOrigin.USER) {
      throw new AiJobPermissionError(
        `Job type ${jobType} requires origin=user, got origin=${origin}`,
      );
    }
    if (INHOUSE_JOB_TYPES.has(jobType) && origin !== JobOrigin.INHOUSE) {
      throw new AiJobPermissionError(
        `Job type ${jobType} requires origin=inhouse, got origin=${origin}`,
      );
    }
  }

  private assertContextMatchesOrigin(
    origin: JobOrigin,
    userId?: string | null,
    adminId?: string | null,
  ): void {
    if (origin === JobOrigin.USER && !userId) {
      throw new AiJobPermissionError(
        "User-origin jobs require a non-empty requestedByUserId",
      );
    }
    if (origin === JobOrigin.INHOUSE && !adminId) {
      throw new AiJobPermissionError(
        "Inhouse-origin jobs require a non-empty requestedByAdminId",
      );
    }
  }

  private parsePayload<T>(
    schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } },
    raw: unknown,
  ): T {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new AiJobValidationError(parsed.error.message);
    return parsed.data;
  }
}

export const aiJobService = new AiJobService();

export interface AiJobHistoryItem {
  jobId: string;
  jobType: string;
  origin: JobOrigin;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  sourceSummary: Record<string, unknown> | null;
  resultSummary: Record<string, unknown> | null;
  statusUrl: string;
  error: string | null;
}

export interface AiJobAdminItem extends AiJobHistoryItem {
  requestedByUserId: string | null;
  requestedByAdminId: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  startedAt: string | null;
  retryCount: number;
  maxRetries: number;
  durationMs: number | null;
}
