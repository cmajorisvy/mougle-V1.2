/**
 * Task #574 — Saved compliance audit filter presets.
 *
 * Persists a small named list of filter combinations (from / to / recipient)
 * for the audit-export history email panel so quarterly SOC2 / ISO audits
 * can reapply the same scope with one click. Shared across all root admins
 * because the config lives in `system_settings`, not per-user state.
 *
 * Hard rules:
 *  - Stored as a JSON array under the single
 *    `audience_audit_history_email_filter_presets` key. Reads always return
 *    [] on any parse error so a corrupt row never crashes the panel.
 *  - Max 25 presets total to keep the panel readable and the row small.
 *  - Names are trimmed, capped at 80 chars, deduped case-insensitively so
 *    "Q3 2025" can't shadow an existing "q3 2025".
 *  - At least one of from / to / recipient must be set; an all-empty preset
 *    is rejected (it would just clear filters, which already has its own
 *    button).
 *  - `from` / `to` are date strings (YYYY-MM-DD) as the panel exposes them.
 *  - Recipient is lowercased + trimmed for stable matching.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";

export const AUDIENCE_AUDIT_HISTORY_EMAIL_FILTER_PRESETS_SETTING_KEY =
  "audience_audit_history_email_filter_presets";

export const FILTER_PRESET_MAX_COUNT = 25;
export const FILTER_PRESET_NAME_MAX_LEN = 80;

export interface AudienceAuditHistoryEmailFilterPreset {
  id: string;
  name: string;
  from: string | null;
  to: string | null;
  recipient: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface SaveFilterPresetInput {
  name: string;
  from?: string | null;
  to?: string | null;
  recipient?: string | null;
  createdBy?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newId(): string {
  return `aud_hist_preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRecipient(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t === "" ? null : t;
}

function normalizeDate(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function isPreset(v: unknown): v is AudienceAuditHistoryEmailFilterPreset {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    (r.from === null || typeof r.from === "string") &&
    (r.to === null || typeof r.to === "string") &&
    (r.recipient === null || typeof r.recipient === "string") &&
    typeof r.createdAt === "string" &&
    (r.createdBy === null || typeof r.createdBy === "string")
  );
}

async function readRaw(): Promise<AudienceAuditHistoryEmailFilterPreset[]> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        eq(
          systemSettings.key,
          AUDIENCE_AUDIT_HISTORY_EMAIL_FILTER_PRESETS_SETTING_KEY,
        ),
      )
      .limit(1);
    if (rows.length === 0) return [];
    const parsed = JSON.parse(rows[0].value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPreset);
  } catch {
    return [];
  }
}

async function writeRaw(
  presets: AudienceAuditHistoryEmailFilterPreset[],
  updatedBy?: string | null,
): Promise<void> {
  const value = JSON.stringify(presets);
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_AUDIT_HISTORY_EMAIL_FILTER_PRESETS_SETTING_KEY,
      value,
      updatedBy: updatedBy ?? undefined,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value,
        updatedBy: updatedBy ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function listAudienceAuditHistoryEmailFilterPresets(): Promise<
  AudienceAuditHistoryEmailFilterPreset[]
> {
  const presets = await readRaw();
  return presets
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export async function saveAudienceAuditHistoryEmailFilterPreset(
  input: SaveFilterPresetInput,
): Promise<AudienceAuditHistoryEmailFilterPreset> {
  const name = (input.name ?? "").trim().slice(0, FILTER_PRESET_NAME_MAX_LEN);
  if (name.length === 0) {
    throw new Error("preset_name_required");
  }
  const from = normalizeDate(input.from);
  const to = normalizeDate(input.to);
  const recipient = normalizeRecipient(input.recipient);
  if (from && !DATE_RE.test(from)) {
    throw new Error("preset_from_invalid");
  }
  if (to && !DATE_RE.test(to)) {
    throw new Error("preset_to_invalid");
  }
  if (recipient && !EMAIL_RE.test(recipient)) {
    throw new Error("preset_recipient_invalid");
  }
  if (!from && !to && !recipient) {
    throw new Error("preset_filters_required");
  }

  const existing = await readRaw();
  if (
    existing.some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error("preset_name_duplicate");
  }
  if (existing.length >= FILTER_PRESET_MAX_COUNT) {
    throw new Error("preset_limit_reached");
  }

  const preset: AudienceAuditHistoryEmailFilterPreset = {
    id: newId(),
    name,
    from,
    to,
    recipient,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
  await writeRaw([...existing, preset], input.createdBy ?? null);
  return preset;
}

export interface UpdateFilterPresetInput {
  name?: string;
  from?: string | null;
  to?: string | null;
  recipient?: string | null;
  updatedBy?: string | null;
}

export async function updateAudienceAuditHistoryEmailFilterPreset(
  presetId: string,
  input: UpdateFilterPresetInput,
): Promise<AudienceAuditHistoryEmailFilterPreset> {
  if (typeof presetId !== "string" || presetId.trim() === "") {
    throw new Error("preset_not_found");
  }
  const existing = await readRaw();
  const idx = existing.findIndex((p) => p.id === presetId);
  if (idx === -1) {
    throw new Error("preset_not_found");
  }
  const current = existing[idx];

  const name =
    input.name === undefined
      ? current.name
      : input.name.trim().slice(0, FILTER_PRESET_NAME_MAX_LEN);
  if (name.length === 0) {
    throw new Error("preset_name_required");
  }

  const from =
    input.from === undefined ? current.from : normalizeDate(input.from);
  const to = input.to === undefined ? current.to : normalizeDate(input.to);
  const recipient =
    input.recipient === undefined
      ? current.recipient
      : normalizeRecipient(input.recipient);

  if (from && !DATE_RE.test(from)) {
    throw new Error("preset_from_invalid");
  }
  if (to && !DATE_RE.test(to)) {
    throw new Error("preset_to_invalid");
  }
  if (recipient && !EMAIL_RE.test(recipient)) {
    throw new Error("preset_recipient_invalid");
  }
  if (!from && !to && !recipient) {
    throw new Error("preset_filters_required");
  }
  if (
    existing.some(
      (p) =>
        p.id !== presetId &&
        p.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error("preset_name_duplicate");
  }

  const updated: AudienceAuditHistoryEmailFilterPreset = {
    ...current,
    name,
    from,
    to,
    recipient,
  };
  const next = existing.slice();
  next[idx] = updated;
  await writeRaw(next, input.updatedBy ?? null);
  return updated;
}

export async function deleteAudienceAuditHistoryEmailFilterPreset(
  presetId: string,
  updatedBy?: string | null,
): Promise<{ deleted: boolean }> {
  if (typeof presetId !== "string" || presetId.trim() === "") {
    return { deleted: false };
  }
  const existing = await readRaw();
  const next = existing.filter((p) => p.id !== presetId);
  if (next.length === existing.length) {
    return { deleted: false };
  }
  await writeRaw(next, updatedBy ?? null);
  return { deleted: true };
}

export async function clearAudienceAuditHistoryEmailFilterPresetsForTests(): Promise<void> {
  await db
    .delete(systemSettings)
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_AUDIT_HISTORY_EMAIL_FILTER_PRESETS_SETTING_KEY,
      ),
    );
}
