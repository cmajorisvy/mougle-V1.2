/**
 * Task #426: unit tests for the pure risk-signal detector used by the
 * audience audit-trail export notifier. The detector is pure with respect
 * to its arguments, so these tests do not touch the DB or the bus.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectAuditExportRiskSignals,
  WIDE_DATE_WINDOW_DAYS,
} from "../server/services/omni-channel-audience-safety-service";
import type { AudienceAuditExportRecord } from "../shared/omni-channel-audience-schema";

type Prior = Pick<AudienceAuditExportRecord, "format" | "filters" | "exportedAt">;

const NO_FILTERS = {
  fromDate: null,
  toDate: null,
  platform: null,
  productionId: null,
} as const;

function prior(overrides: Partial<Prior> = {}): Prior {
  return {
    format: "json",
    filters: { ...NO_FILTERS, productionId: "prod_known" },
    exportedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("flags full_trail + no_date_window + first_export_by_actor for an unfiltered first pull", () => {
  const signals = detectAuditExportRiskSignals(
    { format: "json", filters: NO_FILTERS },
    [],
  );
  assert.deepEqual(signals, [
    "first_export_by_actor",
    "full_trail",
    "no_date_window",
  ]);
});

test("does NOT flag full_trail when any filter is set, but still flags no_date_window", () => {
  const signals = detectAuditExportRiskSignals(
    {
      format: "json",
      filters: { ...NO_FILTERS, platform: "youtube" },
    },
    [prior()],
  );
  assert.ok(!signals.includes("full_trail"));
  assert.ok(signals.includes("no_date_window"));
});

test("flags wide_date_window when both endpoints span more than 90 days", () => {
  const from = "2026-01-01T00:00:00.000Z";
  const to = new Date(
    Date.parse(from) + (WIDE_DATE_WINDOW_DAYS + 1) * 86_400_000,
  ).toISOString();
  const signals = detectAuditExportRiskSignals(
    {
      format: "json",
      filters: { fromDate: from, toDate: to, platform: "youtube", productionId: "prod_a" },
    },
    [prior({ filters: { ...NO_FILTERS, productionId: "prod_a" } })],
  );
  assert.ok(signals.includes("wide_date_window"));
  assert.ok(!signals.includes("no_date_window"));
});

test("does not flag wide_date_window for a sub-90-day window", () => {
  const from = "2026-01-01T00:00:00.000Z";
  const to = new Date(
    Date.parse(from) + (WIDE_DATE_WINDOW_DAYS - 1) * 86_400_000,
  ).toISOString();
  const signals = detectAuditExportRiskSignals(
    {
      format: "json",
      filters: { fromDate: from, toDate: to, platform: "youtube", productionId: "prod_a" },
    },
    [prior({ filters: { ...NO_FILTERS, productionId: "prod_a" } })],
  );
  assert.ok(!signals.includes("wide_date_window"));
  assert.ok(!signals.includes("no_date_window"));
});

test("flags new_production_for_actor when productionId is unseen", () => {
  const signals = detectAuditExportRiskSignals(
    {
      format: "json",
      filters: { ...NO_FILTERS, productionId: "prod_brand_new" },
    },
    [prior({ filters: { ...NO_FILTERS, productionId: "prod_known" } })],
  );
  assert.ok(signals.includes("new_production_for_actor"));
});

test("does NOT flag new_production_for_actor when the actor has seen that productionId before", () => {
  const signals = detectAuditExportRiskSignals(
    {
      format: "json",
      filters: { ...NO_FILTERS, productionId: "prod_known" },
    },
    [prior({ filters: { ...NO_FILTERS, productionId: "prod_known" } })],
  );
  assert.ok(!signals.includes("new_production_for_actor"));
});

test("flags format_change when the actor's last format differs", () => {
  const signals = detectAuditExportRiskSignals(
    {
      format: "csv",
      filters: { ...NO_FILTERS, productionId: "prod_known" },
    },
    [
      prior({
        format: "json",
        exportedAt: "2026-02-01T00:00:00.000Z",
      }),
    ],
  );
  assert.ok(signals.includes("format_change"));
});

test("uses the MOST RECENT prior format, not the oldest, for format_change detection", () => {
  const signals = detectAuditExportRiskSignals(
    {
      format: "csv",
      filters: { ...NO_FILTERS, productionId: "prod_known" },
    },
    [
      prior({ format: "json", exportedAt: "2026-01-01T00:00:00.000Z" }),
      prior({ format: "csv", exportedAt: "2026-02-01T00:00:00.000Z" }),
    ],
  );
  assert.ok(!signals.includes("format_change"));
});

test("returns no signals for csv-history meta-exports (audit-of-audit, never flagged)", () => {
  const signals = detectAuditExportRiskSignals(
    { format: "csv-history", filters: NO_FILTERS },
    [],
  );
  assert.deepEqual(signals, []);
});

test("returns no signals when productionId is the audit-log sentinel", () => {
  const signals = detectAuditExportRiskSignals(
    {
      format: "json",
      filters: { ...NO_FILTERS, productionId: "__audit_export_log__" },
    },
    [],
  );
  assert.deepEqual(signals, []);
});

test("ignores prior history-format meta-exports when deciding first_export_by_actor", () => {
  const signals = detectAuditExportRiskSignals(
    { format: "json", filters: NO_FILTERS },
    [
      prior({ format: "csv-history", filters: { ...NO_FILTERS, productionId: "__audit_export_log__" } }),
    ],
  );
  assert.ok(signals.includes("first_export_by_actor"));
});

test("returned signal array is sorted alphabetically and deduplicated", () => {
  const signals = detectAuditExportRiskSignals(
    { format: "json", filters: NO_FILTERS },
    [],
  );
  const sorted = [...signals].sort();
  assert.deepEqual(signals, sorted);
  assert.equal(new Set(signals).size, signals.length);
});
