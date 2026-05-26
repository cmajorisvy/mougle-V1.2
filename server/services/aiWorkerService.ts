/**
 * AI Worker registry service.
 *
 * Tracks Python AI worker heartbeats and per-worker counters in
 * `ai_workers`. Worker rows are upserted by `worker_id` on every
 * heartbeat from the Python side, and are mutated from inside
 * `aiJobService` when a worker claims a job or posts a terminal
 * result so admins can see per-worker throughput at a glance.
 *
 * All writes are best-effort: a failure in this service must never
 * abort a real job state change. Callers should wrap counter bumps
 * in try/catch and ignore failures.
 */

import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { aiWorkers, type AiWorker } from "@shared/schema";

const ALLOWED_STATUSES = new Set([
  "online",
  "idle",
  "busy",
  "draining",
  "offline",
  "unhealthy",
]);

const STALE_AFTER_MS = 90_000;   // > 3× expected heartbeat interval
const OFFLINE_AFTER_MS = 5 * 60_000;

export type DerivedStatus = "online" | "stale" | "offline";

export interface HeartbeatInput {
  workerId: string;
  status?: string;
  hostname?: string | null;
  processId?: string | null;
  version?: string | null;
  capabilities?: string[] | null;
  currentJobId?: string | null;
  lastError?: string | null;
  metadata?: Record<string, unknown> | null;
}

function compactMetadata(meta: Record<string, unknown>): Record<string, unknown> {
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

class AiWorkerService {
  /** Upsert one worker's heartbeat. Returns the persisted row. */
  async recordHeartbeat(input: HeartbeatInput): Promise<AiWorker> {
    const workerId = input.workerId?.trim();
    if (!workerId) throw new Error("workerId is required");
    const status = input.status && ALLOWED_STATUSES.has(input.status) ? input.status : "online";
    const now = new Date();
    const values = {
      workerId,
      status,
      hostname: input.hostname ?? null,
      processId: input.processId ?? null,
      version: input.version ?? null,
      capabilities: Array.isArray(input.capabilities)
        ? input.capabilities.slice(0, 32).map((c) => String(c).slice(0, 80))
        : [],
      currentJobId: input.currentJobId ?? null,
      lastError: input.lastError ? input.lastError.slice(0, 1000) : null,
      metadata: input.metadata ? compactMetadata(input.metadata) : {},
      lastSeenAt: now,
      startedAt: now,
      updatedAt: now,
    };
    const [row] = await db
      .insert(aiWorkers)
      .values(values)
      .onConflictDoUpdate({
        target: aiWorkers.workerId,
        set: {
          status: values.status,
          hostname: values.hostname,
          processId: values.processId,
          version: values.version,
          capabilities: values.capabilities,
          currentJobId: values.currentJobId,
          lastError: values.lastError,
          metadata: values.metadata,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning();
    return row;
  }

  /** Bump claimed counter and set current job. Best-effort. */
  async noteClaim(workerId: string | null | undefined, jobId: string): Promise<void> {
    if (!workerId) return;
    try {
      await db
        .insert(aiWorkers)
        .values({
          workerId,
          status: "busy",
          currentJobId: jobId,
          jobsClaimedCount: 1,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: aiWorkers.workerId,
          set: {
            status: "busy",
            currentJobId: jobId,
            jobsClaimedCount: sql`${aiWorkers.jobsClaimedCount} + 1`,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.error("[aiWorkerService] noteClaim failed", workerId, err);
    }
  }

  /** Bump success/failure counter and clear current job. Best-effort. */
  async noteResult(
    workerId: string | null | undefined,
    outcome: "succeeded" | "failed",
  ): Promise<void> {
    if (!workerId) return;
    try {
      const inc = outcome === "succeeded"
        ? { jobsSucceededCount: sql`${aiWorkers.jobsSucceededCount} + 1` }
        : { jobsFailedCount: sql`${aiWorkers.jobsFailedCount} + 1` };
      await db
        .update(aiWorkers)
        .set({
          ...inc,
          currentJobId: null,
          status: "idle",
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiWorkers.workerId, workerId));
    } catch (err) {
      console.error("[aiWorkerService] noteResult failed", workerId, err);
    }
  }

  /** Admin: list all known workers, most-recently-seen first. */
  async listAll(): Promise<Array<AiWorker & { derivedStatus: DerivedStatus }>> {
    const rows = await db.select().from(aiWorkers).orderBy(sql`${aiWorkers.lastSeenAt} DESC`);
    const now = Date.now();
    return rows.map((r) => ({ ...r, derivedStatus: this.deriveStatus(r.lastSeenAt, now) }));
  }

  async getOne(
    workerId: string,
  ): Promise<(AiWorker & { derivedStatus: DerivedStatus }) | null> {
    const [row] = await db
      .select()
      .from(aiWorkers)
      .where(eq(aiWorkers.workerId, workerId))
      .limit(1);
    if (!row) return null;
    return { ...row, derivedStatus: this.deriveStatus(row.lastSeenAt, Date.now()) };
  }

  private deriveStatus(lastSeenAt: Date | null, nowMs: number): DerivedStatus {
    if (!lastSeenAt) return "offline";
    const age = nowMs - lastSeenAt.getTime();
    if (age > OFFLINE_AFTER_MS) return "offline";
    if (age > STALE_AFTER_MS) return "stale";
    return "online";
  }
}

export const aiWorkerService = new AiWorkerService();
