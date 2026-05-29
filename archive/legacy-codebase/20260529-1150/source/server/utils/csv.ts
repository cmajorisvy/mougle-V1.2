/**
 * Tiny CSV helper — RFC 4180-ish. No external dependency.
 * - Wraps fields in double-quotes when they contain comma, quote,
 *   CR, or LF.
 * - Escapes embedded double-quotes by doubling them.
 * - Renders null/undefined as empty string.
 * - Renders objects/arrays as JSON.
 */

export type CsvValue = string | number | boolean | Date | null | undefined | Record<string, unknown> | unknown[];

function renderCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return ""; }
  }
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T extends Record<string, CsvValue>>(
  columns: ReadonlyArray<keyof T & string>,
  rows: ReadonlyArray<T>,
): string {
  const header = columns.map((c) => renderCell(c)).join(",");
  const body = rows.map((r) => columns.map((c) => renderCell(r[c])).join(",")).join("\n");
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

export function csvFilename(prefix: string): string {
  const d = new Date().toISOString().slice(0, 10);
  return `${prefix}-${d}.csv`;
}

export function setCsvHeaders(res: { setHeader: (k: string, v: string) => void }, filename: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
}
