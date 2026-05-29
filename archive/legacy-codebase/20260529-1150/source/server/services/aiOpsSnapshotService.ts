/**
 * AI ops snapshots — admin-captured daily rollups of the summary
 * metrics so trends can be inspected over time. Manual capture only;
 * no cron, no auto-scheduling.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { aiOpsSnapshots, type AiOpsSnapshot } from "@shared/schema";
import { aiOpsSummaryService, type AiOpsSummary } from "./aiOpsSummaryService";
import { aiOpsNotificationsService } from "./aiOpsNotificationsService";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(d?: string | null): string {
  if (!d) return todayUtc();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("date must be YYYY-MM-DD");
  return d;
}

function severityCounts(notifications: { severity: string }[]): Record<string, number> {
  const acc = { info: 0, warning: 0, critical: 0, total: notifications.length };
  for (const n of notifications) {
    if (n.severity === "info" || n.severity === "warning" || n.severity === "critical") {
      acc[n.severity] += 1;
    }
  }
  return acc;
}

class AiOpsSnapshotService {
  async generateSnapshot(opts: {
    adminId?: string | null;
    date?: string | null;
    force?: boolean;
  }): Promise<{ snapshot: AiOpsSnapshot; created: boolean }> {
    const date = normalizeDate(opts.date);
    const force = !!opts.force;

    const [existing] = await db
      .select()
      .from(aiOpsSnapshots)
      .where(eq(aiOpsSnapshots.snapshotDate, date))
      .limit(1);

    if (existing && !force) return { snapshot: existing, created: false };

    const summary: AiOpsSummary = await aiOpsSummaryService.getSummary();
    const notifications = await aiOpsNotificationsService.list();
    const notificationMetrics = severityCounts(notifications);

    const values = {
      snapshotId: randomUUID(),
      snapshotDate: date,
      generatedByAdminId: opts.adminId ?? null,
      healthStatus: summary.health.healthStatus,
      healthReasons: summary.health.healthReasons,
      jobMetrics: summary.jobs as unknown as Record<string, number>,
      workerMetrics: summary.workers as unknown as Record<string, number>,
      retentionMetrics: summary.audit as unknown as Record<string, unknown>,
      notificationMetrics,
      rawSummary: summary as unknown as Record<string, unknown>,
    };

    if (existing && force) {
      const [updated] = await db
        .update(aiOpsSnapshots)
        .set({ ...values, createdAt: new Date() })
        .where(eq(aiOpsSnapshots.id, existing.id))
        .returning();
      return { snapshot: updated, created: false };
    }

    const [inserted] = await db.insert(aiOpsSnapshots).values(values).returning();
    return { snapshot: inserted, created: true };
  }

  async listSnapshots(opts: {
    since?: string | null;
    until?: string | null;
    healthStatus?: string | null;
    limit?: number;
    offset?: number;
  } = {}): Promise<AiOpsSnapshot[]> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where: any[] = [];
    if (opts.since) where.push(gte(aiOpsSnapshots.snapshotDate, normalizeDate(opts.since)));
    if (opts.until) where.push(lte(aiOpsSnapshots.snapshotDate, normalizeDate(opts.until)));
    if (opts.healthStatus) where.push(eq(aiOpsSnapshots.healthStatus, opts.healthStatus));

    const q = db.select().from(aiOpsSnapshots);
    const filtered = where.length ? q.where(and(...where)) : q;
    return filtered.orderBy(desc(aiOpsSnapshots.snapshotDate)).limit(limit).offset(offset);
  }

  async getSnapshot(snapshotId: string): Promise<AiOpsSnapshot | null> {
    const [row] = await db
      .select()
      .from(aiOpsSnapshots)
      .where(eq(aiOpsSnapshots.snapshotId, snapshotId))
      .limit(1);
    return row ?? null;
  }
}

export const aiOpsSnapshotService = new AiOpsSnapshotService();
