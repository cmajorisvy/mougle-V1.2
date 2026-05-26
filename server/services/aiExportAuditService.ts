/**
 * Audit log for admin CSV exports. Persists only metadata —
 * never the exported CSV bytes, never secrets, never raw rows.
 * Failures to insert an audit row must not break the export
 * request the admin made.
 */

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db";
import { aiExportEvents, type AiExportEvent } from "@shared/schema";

export type ExportType = "ai_ops_snapshots_csv" | "ai_retention_runs_csv";
export type ExportStatus = "succeeded" | "failed";

const ERROR_MAX = 500;

function truncateError(err: unknown): string {
  if (!err) return "unknown error";
  const msg = err instanceof Error ? err.message || err.name : String(err);
  return msg.length > ERROR_MAX ? msg.slice(0, ERROR_MAX) + "…" : msg;
}

function safeFilters(filters: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!filters) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    // Defence in depth: never persist anything that looks like a secret.
    if (/secret|token|password|api[_-]?key/i.test(k)) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export class AiExportAuditService {
  async logExportSucceeded(params: {
    exportType: ExportType;
    adminId: string | null;
    filters: Record<string, unknown> | null;
    rowCount: number;
    filename: string;
  }): Promise<string> {
    return this.insert({
      exportType: params.exportType,
      adminId: params.adminId,
      filters: params.filters,
      rowCount: Math.max(0, Math.floor(params.rowCount)),
      filename: params.filename,
      status: "succeeded",
      error: null,
    });
  }

  async logExportFailed(params: {
    exportType: ExportType;
    adminId: string | null;
    filters: Record<string, unknown> | null;
    filename: string;
    error: unknown;
  }): Promise<string> {
    return this.insert({
      exportType: params.exportType,
      adminId: params.adminId,
      filters: params.filters,
      rowCount: 0,
      filename: params.filename,
      status: "failed",
      error: truncateError(params.error),
    });
  }

  private async insert(row: {
    exportType: ExportType;
    adminId: string | null;
    filters: Record<string, unknown> | null;
    rowCount: number;
    filename: string;
    status: ExportStatus;
    error: string | null;
  }): Promise<string> {
    const exportId = randomUUID();
    try {
      await db.insert(aiExportEvents).values({
        exportId,
        exportType: row.exportType,
        adminId: row.adminId,
        filters: safeFilters(row.filters),
        rowCount: row.rowCount,
        filename: row.filename,
        status: row.status,
        error: row.error,
      });
    } catch (err: any) {
      // Audit failure must never break the export. Log only the
      // safe message (no stack), then swallow.
      console.error("[aiExportAuditService] insert failed:", err?.message ?? "unknown");
    }
    return exportId;
  }

  async listExportEvents(filters: {
    exportType?: string;
    adminId?: string;
    status?: string;
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<AiExportEvent[]> {
    const where = [] as any[];
    if (filters.exportType) where.push(eq(aiExportEvents.exportType, filters.exportType));
    if (filters.adminId) where.push(eq(aiExportEvents.adminId, filters.adminId));
    if (filters.status) where.push(eq(aiExportEvents.status, filters.status));
    if (filters.since) where.push(gte(aiExportEvents.createdAt, filters.since));
    if (filters.until) where.push(lte(aiExportEvents.createdAt, filters.until));
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    return db
      .select()
      .from(aiExportEvents)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(aiExportEvents.createdAt))
      .limit(limit)
      .offset(offset);
  }
}

export const aiExportAuditService = new AiExportAuditService();
