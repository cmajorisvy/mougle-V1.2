/**
 * Audience audit-export hard row caps (Task #703).
 *
 * Founder-configurable replacement for the hardcoded
 * `AUDIT_TRAIL_ROW_CAP = 100_000` and
 * `AUDIT_EXPORT_HISTORY_ROW_CAP = 100_000` constants that previously
 * lived in `server/routes/omni-channel-audience-routes.ts`.
 *
 * Two independent caps are persisted in `system_settings`:
 *   - `audience_audit_trail_row_cap`        — per-section cap on the
 *     compliance audit-trail export (messages / decisions / commands).
 *   - `audience_audit_export_history_row_cap` — cap on the full and
 *     filtered audit-export history downloads.
 *
 * Bounds: 1,000 .. 1,000,000. A value of `null` resets to the default
 * (100,000). Invalid / NaN / negative inputs clamp to the default.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";

export const AUDIENCE_AUDIT_TRAIL_ROW_CAP_SETTING_KEY =
  "audience_audit_trail_row_cap";
export const AUDIENCE_AUDIT_EXPORT_HISTORY_ROW_CAP_SETTING_KEY =
  "audience_audit_export_history_row_cap";

export const DEFAULT_AUDIENCE_AUDIT_ROW_CAP = 100_000;
export const MIN_AUDIENCE_AUDIT_ROW_CAP = 1_000;
export const MAX_AUDIENCE_AUDIT_ROW_CAP = 1_000_000;

export type AudienceAuditRowCapKind = "trail" | "history";

export interface AudienceAuditRowCapConfig {
  rowCap: number;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface StoredRecord {
  rowCap: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

function settingKey(kind: AudienceAuditRowCapKind): string {
  return kind === "trail"
    ? AUDIENCE_AUDIT_TRAIL_ROW_CAP_SETTING_KEY
    : AUDIENCE_AUDIT_EXPORT_HISTORY_ROW_CAP_SETTING_KEY;
}

function clampRowCap(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_AUDIENCE_AUDIT_ROW_CAP;
  const floored = Math.floor(v);
  if (floored < MIN_AUDIENCE_AUDIT_ROW_CAP) return MIN_AUDIENCE_AUDIT_ROW_CAP;
  if (floored > MAX_AUDIENCE_AUDIT_ROW_CAP) return MAX_AUDIENCE_AUDIT_ROW_CAP;
  return floored;
}

function parseStored(raw: string | null | undefined): StoredRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.rowCap === undefined || parsed.rowCap === null) return null;
    const t = Number(parsed.rowCap);
    if (!Number.isFinite(t)) return null;
    const clamped = clampRowCap(t);
    return {
      rowCap: clamped,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy:
        typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
    };
  } catch {
    return null;
  }
}

export async function getAudienceAuditRowCap(
  kind: AudienceAuditRowCapKind,
): Promise<AudienceAuditRowCapConfig> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, settingKey(kind)))
      .limit(1);
    if (rows.length === 0) {
      return {
        rowCap: DEFAULT_AUDIENCE_AUDIT_ROW_CAP,
        isDefault: true,
        updatedAt: null,
        updatedBy: null,
      };
    }
    const stored = parseStored(rows[0].value);
    if (!stored) {
      return {
        rowCap: DEFAULT_AUDIENCE_AUDIT_ROW_CAP,
        isDefault: true,
        updatedAt: null,
        updatedBy: null,
      };
    }
    return {
      rowCap: stored.rowCap,
      isDefault: stored.rowCap === DEFAULT_AUDIENCE_AUDIT_ROW_CAP,
      updatedAt: stored.updatedAt,
      updatedBy: stored.updatedBy,
    };
  } catch (err) {
    console.error(
      `[audience-audit-row-cap:${kind}] failed to load:`,
      (err as Error)?.message ?? err,
    );
    return {
      rowCap: DEFAULT_AUDIENCE_AUDIT_ROW_CAP,
      isDefault: true,
      updatedAt: null,
      updatedBy: null,
    };
  }
}

export async function setAudienceAuditRowCap(
  kind: AudienceAuditRowCapKind,
  input: { rowCap: number | null | undefined; updatedBy?: string | null },
): Promise<AudienceAuditRowCapConfig> {
  const next: StoredRecord = {
    rowCap:
      input.rowCap === null || input.rowCap === undefined
        ? DEFAULT_AUDIENCE_AUDIT_ROW_CAP
        : clampRowCap(input.rowCap),
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? null,
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: settingKey(kind),
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
    rowCap: next.rowCap,
    isDefault: next.rowCap === DEFAULT_AUDIENCE_AUDIT_ROW_CAP,
    updatedAt: next.updatedAt,
    updatedBy: next.updatedBy,
  };
}

export async function getAudienceAuditRowCaps(): Promise<{
  trail: AudienceAuditRowCapConfig;
  history: AudienceAuditRowCapConfig;
}> {
  const [trail, history] = await Promise.all([
    getAudienceAuditRowCap("trail"),
    getAudienceAuditRowCap("history"),
  ]);
  return { trail, history };
}
