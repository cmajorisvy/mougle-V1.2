/**
 * Audience risk-signal rules (Task #459).
 *
 * Founder-tunable rules for the audit-trail risk-signal detector and the
 * notifier email. Persisted under `system_settings.audience_risk_signal_rules`
 * and hot-reloaded on every export (no process restart required).
 *
 * Three knobs:
 *   - `wideDateWindowDays` — explicit-window-too-wide threshold used by the
 *     detector when both endpoints are present. Default 90 (matches the
 *     legacy `WIDE_DATE_WINDOW_DAYS` constant so behavior is unchanged
 *     until an admin tunes it).
 *   - `loudSignals` — signals loud enough to appear in the email subject
 *     `[RISK: ...]` prefix. Default = every known signal (today's behavior).
 *     Signals NOT in this list still appear in the email body block, just
 *     not in the subject prefix.
 *   - `mutedSignals` — signals hidden from the email entirely (subject AND
 *     body). Still persisted on the audit row so the admin UI can flag
 *     suspicious pulls after the fact. Default = empty.
 *
 * Hard rules:
 *   - Defaults preserve today's behavior byte-for-byte. The detector still
 *     persists every detected signal; only the email is gated.
 *   - `mutedSignals` always wins over `loudSignals` for the same signal —
 *     a muted signal is silent in the email regardless of "loudness".
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import {
  AudienceAuditExportRiskSignalSchema,
  type AudienceAuditExportRiskSignal,
} from "../../shared/omni-channel-audience-schema";

export const AUDIENCE_RISK_SIGNAL_RULES_SETTING_KEY =
  "audience_risk_signal_rules";

export const DEFAULT_WIDE_DATE_WINDOW_DAYS = 90;
export const MIN_WIDE_DATE_WINDOW_DAYS = 1;
export const MAX_WIDE_DATE_WINDOW_DAYS = 3650;

export const ALL_RISK_SIGNALS: AudienceAuditExportRiskSignal[] = [
  "full_trail",
  "no_date_window",
  "wide_date_window",
  "first_export_by_actor",
  "new_production_for_actor",
  "format_change",
];

export interface AudienceRiskSignalRules {
  wideDateWindowDays: number;
  loudSignals: AudienceAuditExportRiskSignal[];
  mutedSignals: AudienceAuditExportRiskSignal[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_AUDIENCE_RISK_SIGNAL_RULES: AudienceRiskSignalRules = {
  wideDateWindowDays: DEFAULT_WIDE_DATE_WINDOW_DAYS,
  loudSignals: [...ALL_RISK_SIGNALS],
  mutedSignals: [],
  updatedAt: null,
  updatedBy: null,
};

function clampDays(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_WIDE_DATE_WINDOW_DAYS;
  const floored = Math.floor(v);
  if (floored < MIN_WIDE_DATE_WINDOW_DAYS) return MIN_WIDE_DATE_WINDOW_DAYS;
  if (floored > MAX_WIDE_DATE_WINDOW_DAYS) return MAX_WIDE_DATE_WINDOW_DAYS;
  return floored;
}

function normalizeSignals(input: unknown): AudienceAuditExportRiskSignal[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<AudienceAuditExportRiskSignal>();
  for (const raw of input) {
    const parsed = AudienceAuditExportRiskSignalSchema.safeParse(raw);
    if (parsed.success) seen.add(parsed.data);
  }
  return Array.from(seen).sort();
}

function parseStored(raw: string | null | undefined): AudienceRiskSignalRules {
  if (!raw) return { ...DEFAULT_AUDIENCE_RISK_SIGNAL_RULES };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_AUDIENCE_RISK_SIGNAL_RULES };
    }
    const wideDateWindowDays = clampDays(
      parsed.wideDateWindowDays ?? DEFAULT_WIDE_DATE_WINDOW_DAYS,
    );
    const loud = parsed.loudSignals === undefined
      ? [...ALL_RISK_SIGNALS]
      : normalizeSignals(parsed.loudSignals);
    const muted = normalizeSignals(parsed.mutedSignals);
    return {
      wideDateWindowDays,
      loudSignals: loud,
      mutedSignals: muted,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
    };
  } catch {
    return { ...DEFAULT_AUDIENCE_RISK_SIGNAL_RULES };
  }
}

export async function getAudienceRiskSignalRules(): Promise<AudienceRiskSignalRules> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, AUDIENCE_RISK_SIGNAL_RULES_SETTING_KEY))
      .limit(1);
    if (rows.length === 0) {
      return { ...DEFAULT_AUDIENCE_RISK_SIGNAL_RULES };
    }
    return parseStored(rows[0].value);
  } catch (err) {
    console.error(
      "[audience-risk-signal-rules] failed to load rules:",
      (err as Error)?.message ?? err,
    );
    return { ...DEFAULT_AUDIENCE_RISK_SIGNAL_RULES };
  }
}

export async function setAudienceRiskSignalRules(input: {
  wideDateWindowDays: number;
  loudSignals: AudienceAuditExportRiskSignal[];
  mutedSignals: AudienceAuditExportRiskSignal[];
  updatedBy?: string | null;
}): Promise<AudienceRiskSignalRules> {
  const next: AudienceRiskSignalRules = {
    wideDateWindowDays: clampDays(input.wideDateWindowDays),
    loudSignals: normalizeSignals(input.loudSignals),
    mutedSignals: normalizeSignals(input.mutedSignals),
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? null,
  };
  const stored = JSON.stringify(next);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_RISK_SIGNAL_RULES_SETTING_KEY,
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
  return next;
}

export interface RiskSignalPartition {
  bodySignals: AudienceAuditExportRiskSignal[];
  subjectSignals: AudienceAuditExportRiskSignal[];
  mutedFromEmail: AudienceAuditExportRiskSignal[];
}

/**
 * Split the persisted risk signals into the subset that goes in the email
 * body (everything not muted) and the subset that gets the loud `[RISK: ...]`
 * subject prefix (loud AND not muted).
 *
 * Order is preserved from the input so existing tests that assert on
 * signal order keep passing.
 */
export function partitionRiskSignalsForEmail(
  signals: ReadonlyArray<AudienceAuditExportRiskSignal>,
  rules: AudienceRiskSignalRules,
): RiskSignalPartition {
  const muted = new Set(rules.mutedSignals);
  const loud = new Set(rules.loudSignals);
  const bodySignals: AudienceAuditExportRiskSignal[] = [];
  const subjectSignals: AudienceAuditExportRiskSignal[] = [];
  const mutedFromEmail: AudienceAuditExportRiskSignal[] = [];
  for (const s of signals) {
    if (muted.has(s)) {
      mutedFromEmail.push(s);
      continue;
    }
    bodySignals.push(s);
    if (loud.has(s)) subjectSignals.push(s);
  }
  return { bodySignals, subjectSignals, mutedFromEmail };
}
