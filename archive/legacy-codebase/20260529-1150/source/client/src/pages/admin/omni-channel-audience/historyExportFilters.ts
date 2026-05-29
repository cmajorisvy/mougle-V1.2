/**
 * Task #588 — localStorage + URL helpers for the history-export filter
 * bar in the Omni-Channel Audience admin page. Extracted from the main
 * `OmniChannelAudience.tsx` so the persistence rules can be unit-tested
 * without mounting the whole page.
 *
 * Persistence precedence (read):
 *   1. If ANY of the six filter keys is present in `window.location.search`,
 *      URL wins for ALL fields (missing keys read as empty string). This
 *      lets an admin share a filtered view by link without their
 *      recipient's saved filters bleeding in.
 *   2. Otherwise fall back to the JSON blob in localStorage under
 *      `HISTORY_EXPORT_FILTER_STORAGE_KEY`.
 *   3. Otherwise empty string.
 *
 * Write rules:
 *   - If every field is empty, REMOVE the localStorage key (don't store
 *     an empty `{}`).
 *   - Otherwise store the full object as JSON.
 *   - Quota / privacy-mode errors are swallowed.
 */

export const HISTORY_EXPORT_FILTER_STORAGE_KEY =
  "mougle.omniChannelAudience.historyExportFilters.v2";

export type HistoryExportPersistedField =
  | "actorId"
  | "from"
  | "to"
  | "platform"
  | "formatFilter"
  | "minRows";

export interface HistoryExportFilterValues {
  actorId: string;
  from: string;
  to: string;
  platform: string;
  formatFilter: string;
  minRows: string;
}

export const HISTORY_EXPORT_URL_KEYS: readonly HistoryExportPersistedField[] = [
  "actorId",
  "from",
  "to",
  "platform",
  "formatFilter",
  "minRows",
];

export function readHistoryExportFilter(
  field: HistoryExportPersistedField,
): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(HISTORY_EXPORT_FILTER_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const value = parsed?.[field];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

export function readHistoryExportUrlFilter(
  field: HistoryExportPersistedField,
): string {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(field);
    return v ?? "";
  } catch {
    return "";
  }
}

export function hasAnyHistoryExportUrlFilter(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return HISTORY_EXPORT_URL_KEYS.some((k) => params.get(k) !== null);
  } catch {
    return false;
  }
}

export function readHistoryExportFilterInitial(
  field: HistoryExportPersistedField,
): string {
  if (hasAnyHistoryExportUrlFilter()) {
    return readHistoryExportUrlFilter(field);
  }
  return readHistoryExportFilter(field);
}

export function writeHistoryExportFilters(
  values: HistoryExportFilterValues,
): void {
  if (typeof window === "undefined") return;
  try {
    if (
      !values.actorId &&
      !values.from &&
      !values.to &&
      !values.platform &&
      !values.formatFilter &&
      !values.minRows
    ) {
      window.localStorage.removeItem(HISTORY_EXPORT_FILTER_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      HISTORY_EXPORT_FILTER_STORAGE_KEY,
      JSON.stringify(values),
    );
  } catch {
    // ignore quota / privacy-mode errors
  }
}
