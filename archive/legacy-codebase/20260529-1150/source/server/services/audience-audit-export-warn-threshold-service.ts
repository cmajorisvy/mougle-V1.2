/**
 * Audience audit-trail export download warn threshold (Task #597).
 *
 * Persists the soft "this will download N rows — continue?" threshold used
 * by the Omni-Channel Audience UI's history download buttons. Stored
 * server-side in `system_settings` under
 * `audience_audit_export_warn_threshold` so a founder can set the
 * team-wide guardrail once and have it apply for every admin, browser,
 * and incognito session.
 *
 * Value semantics:
 *   - Default = 10,000 rows.
 *   - `0` disables the soft warning entirely (admins can download any
 *     size without confirmation).
 *   - Otherwise: clamped to a non-negative integer.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";

export const AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD_SETTING_KEY =
  "audience_audit_export_warn_threshold";
export const DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD = 10000;
const MAX_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD = 10_000_000;

export interface AudienceAuditExportWarnThresholdConfig {
  threshold: number;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface StoredRecord {
  threshold: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

function clampThreshold(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) {
    return DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD;
  }
  const floored = Math.floor(v);
  if (floored > MAX_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD) {
    return MAX_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD;
  }
  return floored;
}

function parseStored(raw: string | null | undefined): StoredRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.threshold === undefined || parsed.threshold === null) return null;
    const t = Number(parsed.threshold);
    if (!Number.isFinite(t) || t < 0) return null;
    return {
      threshold: Math.floor(t),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy:
        typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
    };
  } catch {
    return null;
  }
}

export async function getAudienceAuditExportWarnThreshold(): Promise<AudienceAuditExportWarnThresholdConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD_SETTING_KEY,
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      return {
        threshold: DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD,
        isDefault: true,
        updatedAt: null,
        updatedBy: null,
      };
    }
    const stored = parseStored(rows[0].value);
    if (!stored) {
      return {
        threshold: DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD,
        isDefault: true,
        updatedAt: null,
        updatedBy: null,
      };
    }
    return {
      threshold: stored.threshold,
      isDefault:
        stored.threshold === DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD,
      updatedAt: stored.updatedAt,
      updatedBy: stored.updatedBy,
    };
  } catch (err) {
    console.error(
      "[audience-audit-export-warn-threshold] failed to load:",
      (err as Error)?.message ?? err,
    );
    return {
      threshold: DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD,
      isDefault: true,
      updatedAt: null,
      updatedBy: null,
    };
  }
}

export async function setAudienceAuditExportWarnThreshold(input: {
  threshold: number | null | undefined;
  updatedBy?: string | null;
}): Promise<AudienceAuditExportWarnThresholdConfig> {
  const next: StoredRecord = {
    threshold:
      input.threshold === null || input.threshold === undefined
        ? DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD
        : clampThreshold(input.threshold),
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? null,
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD_SETTING_KEY,
      value: stored,
      updatedBy: input.updatedBy ?? undefined,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: stored,
        updatedBy: input.updatedBy ?? undefined,
        updatedAt: new Date(),
      },
    });
  return {
    threshold: next.threshold,
    isDefault:
      next.threshold === DEFAULT_AUDIENCE_AUDIT_EXPORT_WARN_THRESHOLD,
    updatedAt: next.updatedAt,
    updatedBy: next.updatedBy,
  };
}
