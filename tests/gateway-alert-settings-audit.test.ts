/**
 * Task #527 — lock in the threshold-change history CSV export behaviour
 * added by Task #489.
 *
 * Covers:
 *  - Service-level `gatewayAlertSettingsAuditService.listFiltered`:
 *    from/to/updatedBy filters and the empty-filter "return everything"
 *    path.
 *  - Route-level `GET /api/admin/newsroom/audience/gateway/alert-settings/audit-log/export`:
 *    correct CSV headers, comma/quote escaping, filter wiring, and the
 *    self-audit `action="export"` row that gets written to the same
 *    `gateway_alert_settings_audit` table on every download.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { gatewayAlertSettingsAuditService } from "../server/services/gateway-alert-settings-audit-service";
import { db } from "../server/db";
import { gatewayAlertSettingsAudit } from "../shared/omni-channel-audience-schema";
import { and, desc, eq, sql } from "drizzle-orm";

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  const stub: express.RequestHandler = (_req, _res, next) => next();
  registerOmniChannelAudienceRoutes(app, stub);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  await db.delete(gatewayAlertSettingsAudit);
});

/**
 * Insert a row with an explicit `updatedAt`. The service's `record()`
 * always stamps `updatedAt` via the column default, so tests that need
 * a specific timestamp insert directly.
 */
async function insertRow(opts: {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  action: "update" | "reset" | "export";
  updatedBy: string;
  updatedAt: Date;
}) {
  await db.insert(gatewayAlertSettingsAudit).values({
    field: opts.field,
    oldValue: opts.oldValue,
    newValue: opts.newValue,
    action: opts.action,
    updatedBy: opts.updatedBy,
    updatedAt: opts.updatedAt,
  });
}

// --- service-level tests -------------------------------------------------

test("listFiltered with no filters returns every row newest-first", async () => {
  const now = Date.now();
  await insertRow({
    field: "threshold",
    oldValue: "5",
    newValue: "10",
    action: "update",
    updatedBy: "alice@example.com",
    updatedAt: new Date(now - 3 * 60 * 60 * 1000),
  });
  await insertRow({
    field: "windowMs",
    oldValue: "60000",
    newValue: "120000",
    action: "update",
    updatedBy: "bob@example.com",
    updatedAt: new Date(now - 2 * 60 * 60 * 1000),
  });
  await insertRow({
    field: "all",
    oldValue: null,
    newValue: null,
    action: "reset",
    updatedBy: "alice@example.com",
    updatedAt: new Date(now - 1 * 60 * 60 * 1000),
  });

  const rows = await gatewayAlertSettingsAuditService.listFiltered();
  assert.equal(rows.length, 3);
  // newest first
  assert.equal(rows[0].action, "reset");
  assert.equal(rows[1].field, "windowMs");
  assert.equal(rows[2].field, "threshold");
});

test("listFiltered honors fromDate / toDate / updatedBy filters", async () => {
  const now = Date.now();
  await insertRow({
    field: "threshold",
    oldValue: "5",
    newValue: "10",
    action: "update",
    updatedBy: "alice@example.com",
    updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
  });
  await insertRow({
    field: "windowMs",
    oldValue: "60000",
    newValue: "120000",
    action: "update",
    updatedBy: "bob@example.com",
    updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
  });
  await insertRow({
    field: "dedupMs",
    oldValue: "1000",
    newValue: "5000",
    action: "update",
    updatedBy: "alice@example.com",
    updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
  });

  // fromDate excludes the 10-day-old row
  const fromOnly = await gatewayAlertSettingsAuditService.listFiltered({
    fromDate: new Date(now - 5 * 24 * 60 * 60 * 1000),
  });
  assert.equal(fromOnly.length, 2);
  assert.ok(fromOnly.every((r) => r.field !== "threshold"));

  // toDate excludes the 1-day-old row
  const toOnly = await gatewayAlertSettingsAuditService.listFiltered({
    toDate: new Date(now - 36 * 60 * 60 * 1000),
  });
  assert.equal(toOnly.length, 2);
  assert.ok(toOnly.every((r) => r.field !== "dedupMs"));

  // updatedBy narrows to alice's two rows
  const aliceOnly = await gatewayAlertSettingsAuditService.listFiltered({
    updatedBy: "alice@example.com",
  });
  assert.equal(aliceOnly.length, 2);
  assert.ok(aliceOnly.every((r) => r.updatedBy === "alice@example.com"));

  // Trimming + empty-string handling: whitespace-only updatedBy is ignored.
  const whitespace = await gatewayAlertSettingsAuditService.listFiltered({
    updatedBy: "   ",
  });
  assert.equal(whitespace.length, 3);

  // All filters together — only bob's middle row.
  const combo = await gatewayAlertSettingsAuditService.listFiltered({
    fromDate: new Date(now - 5 * 24 * 60 * 60 * 1000),
    toDate: new Date(now - 36 * 60 * 60 * 1000),
    updatedBy: "bob@example.com",
  });
  assert.equal(combo.length, 1);
  assert.equal(combo[0].field, "windowMs");
});

// --- route-level tests ---------------------------------------------------

const EXPORT_URL =
  "/api/admin/newsroom/audience/gateway/alert-settings/audit-log/export";

async function countExportRows(): Promise<number> {
  const rows = await db
    .select()
    .from(gatewayAlertSettingsAudit)
    .where(eq(gatewayAlertSettingsAudit.action, "export"));
  return rows.length;
}

test("CSV export returns the right headers, escapes commas/quotes, and writes a self-audit row", async () => {
  // newValue carries a comma, a quote and a newline so the escape path
  // is exercised by the route.
  await insertRow({
    field: "threshold",
    oldValue: "5",
    newValue: 'tricky, "value"\nwith newline',
    action: "update",
    updatedBy: "alice@example.com",
    updatedAt: new Date(Date.now() - 60 * 60 * 1000),
  });

  const r = await fetch(`${baseUrl}${EXPORT_URL}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(
    r.headers.get("content-disposition") ?? "",
    /attachment; filename="gateway-alert-settings-audit-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  assert.equal(r.headers.get("cache-control"), "no-store");

  const body = await r.text();
  assert.ok(
    body.startsWith("id,updatedAt,field,action,oldValue,newValue,updatedBy\n"),
    "expected header as first line",
  );
  // Exactly one data row (the update). The self-audit export row was
  // written *after* the rows were fetched, so it must not appear in the
  // CSV body. We assert by counting actor occurrences, since the
  // embedded newline in the escaped cell would otherwise inflate a naive
  // line-count.
  const actorMatches = body.match(/alice@example\.com/g) ?? [];
  assert.equal(actorMatches.length, 1);
  assert.ok(body.includes("threshold"));
  // Escaped CSV cell: double-quoted, internal quotes doubled, comma + newline preserved.
  assert.ok(
    body.includes('"tricky, ""value""\nwith newline"'),
    `expected escaped cell in body: ${body}`,
  );

  // Exactly one self-audit `export` row was written, pointing at the
  // actor fallback (no session middleware on the stub app => "root_admin")
  // and carrying the rowCount + filter snapshot in newValue.
  const exports = await db
    .select()
    .from(gatewayAlertSettingsAudit)
    .where(eq(gatewayAlertSettingsAudit.action, "export"))
    .orderBy(desc(gatewayAlertSettingsAudit.updatedAt));
  assert.equal(exports.length, 1);
  assert.equal(exports[0].field, "all");
  assert.equal(exports[0].updatedBy, "root_admin");
  const parsed = JSON.parse(exports[0].newValue ?? "{}");
  assert.equal(parsed.rowCount, 1);
  assert.equal(parsed.from, null);
  assert.equal(parsed.to, null);
  assert.equal(parsed.updatedBy, null);
});

test("CSV export honors from/to/updatedBy filters and records them on the self-audit row", async () => {
  const now = Date.now();
  await insertRow({
    field: "threshold",
    oldValue: "5",
    newValue: "10",
    action: "update",
    updatedBy: "alice@example.com",
    updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
  });
  await insertRow({
    field: "windowMs",
    oldValue: "60000",
    newValue: "120000",
    action: "update",
    updatedBy: "bob@example.com",
    updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
  });
  await insertRow({
    field: "dedupMs",
    oldValue: "1000",
    newValue: "5000",
    action: "update",
    updatedBy: "alice@example.com",
    updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
  });

  const from = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 60_000).toISOString();
  const url = `${baseUrl}${EXPORT_URL}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&updatedBy=${encodeURIComponent("alice@example.com")}`;
  const r = await fetch(url);
  assert.equal(r.status, 200);

  const body = await r.text();
  const dataLines = body.trimEnd().split("\n").slice(1);
  // Only alice's dedupMs row falls inside the window AND matches the actor.
  assert.equal(dataLines.length, 1);
  assert.ok(dataLines[0].includes("dedupMs"));
  assert.ok(dataLines[0].includes("alice@example.com"));
  assert.ok(!body.includes("windowMs"));
  assert.ok(!body.includes("\nthreshold,") && !body.includes(",threshold,"));

  // The self-audit row captures the row count AND the active filters.
  const [exportRow] = await db
    .select()
    .from(gatewayAlertSettingsAudit)
    .where(eq(gatewayAlertSettingsAudit.action, "export"))
    .orderBy(desc(gatewayAlertSettingsAudit.updatedAt))
    .limit(1);
  assert.ok(exportRow);
  const parsed = JSON.parse(exportRow.newValue ?? "{}");
  assert.equal(parsed.rowCount, 1);
  assert.equal(parsed.from, from);
  assert.equal(parsed.to, to);
  assert.equal(parsed.updatedBy, "alice@example.com");
  assert.equal(await countExportRows(), 1);
});

test("CSV export with an empty result set still emits the header and writes the self-audit row", async () => {
  const r = await fetch(`${baseUrl}${EXPORT_URL}`);
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.equal(
    body.trimEnd(),
    "id,updatedAt,field,action,oldValue,newValue,updatedBy",
  );
  // Even with zero matching rows, the export itself is audited.
  assert.equal(await countExportRows(), 1);
});

test("CSV export rejects an unparseable from query param with 400 and writes no audit row", async () => {
  const r = await fetch(`${baseUrl}${EXPORT_URL}?from=not-a-date`);
  assert.equal(r.status, 400);
  assert.equal(await countExportRows(), 0);
});
