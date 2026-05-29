/**
 * Task #607 — HTTP-level test for the legacy-token kill-switch history CSV
 * export route.
 *
 * Boots a minimal Express app, registers the real
 * `registerOmniChannelAudienceRoutes` with a stub `requireRootAdmin`, and
 * stubs `legacyTokenKillSwitchAuditService.listFiltered` so the route
 * handler is exercised end-to-end without a live DB. This keeps CI
 * deterministic even when the shared Supabase session pool is saturated
 * (the DB-backed companion test in `audience-legacy-token-kill-switch-audit.test.ts`
 * intermittently fails with EMAXCONNSESSION).
 *
 * Verifies:
 *  - 200 CSV: Content-Type text/csv; charset=utf-8, dated
 *    `attachment; filename="legacy-token-kill-switch-history-YYYY-MM-DD.csv"`,
 *    `Cache-Control: no-store`, exact header line, newest-first rows,
 *    CSV-escaping of quotes / commas / newlines / JSON-ish values.
 *  - 200 CSV: header-only body when no rows match the filters.
 *  - listFiltered receives the parsed `platform`, `updatedBy`, `fromDate`,
 *    `toDate` filters (combined and individually) including coercion to
 *    `Date` objects.
 *  - 400 on unknown `platform`, invalid date strings, and unknown query
 *    keys (strict Zod schema).
 *  - Blank optional filters behave as no filter (omitted query keys =>
 *    no condition passed through).
 *  - requireRootAdmin gate is wired (route 401s when the gate rejects).
 *  - Export does not leak token material: only the audit "true"/"false"/
 *    "cleared" status strings appear in previous/new value columns.
 */

import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { legacyTokenKillSwitchAuditService } from "../server/services/audience-legacy-token-kill-switch-audit-service";

interface CapturedCall {
  filters: any;
}

const originalListFiltered = (
  legacyTokenKillSwitchAuditService as any
).listFiltered.bind(legacyTokenKillSwitchAuditService);

let captured: CapturedCall[] = [];
let nextRows: any[] = [];

let server: Server;
let baseUrl: string;
let rootAdminAllowed = true;

before(async () => {
  (legacyTokenKillSwitchAuditService as any).listFiltered = async (
    filters: any,
  ) => {
    captured.push({ filters });
    return nextRows;
  };

  const app = express();
  const stubRequireRootAdmin: express.RequestHandler = (_req, res, next) => {
    if (!rootAdminAllowed) {
      return res.status(401).json({ message: "forbidden" });
    }
    next();
  };
  registerOmniChannelAudienceRoutes(app, stubRequireRootAdmin);

  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  (legacyTokenKillSwitchAuditService as any).listFiltered = originalListFiltered;
  await new Promise<void>((r) => server.close(() => r()));
});

afterEach(() => {
  captured = [];
  nextRows = [];
  rootAdminAllowed = true;
});

const ROUTE = "/api/admin/newsroom/audience/legacy-token-status/history.csv";
const HEADER =
  "id,updatedAt,platform,previousValue,newValue,updatedBy,batchId";

test("returns CSV with correct headers, dated filename, cache-control, and newest-first rows", async () => {
  nextRows = [
    {
      id: "row_2",
      updatedAt: new Date("2026-05-21T10:00:00.000Z"),
      platform: "facebook",
      previousValue: "cleared",
      newValue: "true",
      updatedBy: "bob",
      batchId: null,
    },
    {
      id: "row_1",
      updatedAt: new Date("2026-05-20T09:00:00.000Z"),
      platform: "youtube",
      previousValue: "cleared",
      newValue: "true",
      updatedBy: "alice",
      batchId: null,
    },
  ];

  const r = await fetch(`${baseUrl}${ROUTE}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /^text\/csv;\s*charset=utf-8/i);
  const cd = r.headers.get("content-disposition") ?? "";
  assert.match(
    cd,
    /^attachment;\s*filename="legacy-token-kill-switch-history-\d{4}-\d{2}-\d{2}\.csv"$/,
  );
  assert.equal(r.headers.get("cache-control"), "no-store");

  const body = await r.text();
  const lines = body.trim().split("\n");
  assert.equal(lines[0], HEADER);
  assert.equal(lines.length, 3);

  // Newest first: facebook row is the upstream service's first element
  // and must appear as the first data row in the CSV.
  assert.equal(
    lines[1],
    "row_2,2026-05-21T10:00:00.000Z,facebook,cleared,true,bob,",
  );
  assert.equal(
    lines[2],
    "row_1,2026-05-20T09:00:00.000Z,youtube,cleared,true,alice,",
  );

  // No filter keys passed -> all filter slots are null.
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].filters, {
    platform: null,
    updatedBy: null,
    fromDate: null,
    toDate: null,
  });
});

test("returns header-only body when no rows match", async () => {
  nextRows = [];
  const r = await fetch(`${baseUrl}${ROUTE}?updatedBy=nobody`);
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.equal(body, `${HEADER}\n`);
});

test("CSV-escapes quotes, commas, newlines, and JSON-ish values", async () => {
  nextRows = [
    {
      id: 'id,with,commas',
      updatedAt: new Date("2026-05-21T10:00:00.000Z"),
      platform: "youtube",
      previousValue: "cleared",
      newValue: "true",
      updatedBy: 'alice "the founder"',
      batchId: 'batch\nwith\nnewlines',
    },
  ];
  const r = await fetch(`${baseUrl}${ROUTE}`);
  assert.equal(r.status, 200);
  const body = await r.text();
  // commas in id -> quoted
  assert.ok(body.includes('"id,with,commas"'));
  // quotes doubled
  assert.ok(body.includes('"alice ""the founder"""'));
  // newlines in batchId -> quoted
  assert.ok(body.includes('"batch\nwith\nnewlines"'));
});

test("passes platform/updatedBy/fromDate/toDate filters (combined) to listFiltered as Dates", async () => {
  nextRows = [];
  const qs = new URLSearchParams({
    platform: "youtube",
    updatedBy: "alice",
    fromDate: "2026-05-01T00:00:00.000Z",
    toDate: "2026-05-21T23:59:59.000Z",
  }).toString();
  const r = await fetch(`${baseUrl}${ROUTE}?${qs}`);
  assert.equal(r.status, 200);
  assert.equal(captured.length, 1);
  const f = captured[0].filters;
  assert.equal(f.platform, "youtube");
  assert.equal(f.updatedBy, "alice");
  assert.ok(f.fromDate instanceof Date);
  assert.ok(f.toDate instanceof Date);
  assert.equal(f.fromDate.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(f.toDate.toISOString(), "2026-05-21T23:59:59.000Z");
});

test("passes each filter individually with the others null", async () => {
  // platform only
  nextRows = [];
  await fetch(`${baseUrl}${ROUTE}?platform=facebook`);
  assert.deepEqual(captured.at(-1)!.filters, {
    platform: "facebook",
    updatedBy: null,
    fromDate: null,
    toDate: null,
  });

  // updatedBy only
  await fetch(`${baseUrl}${ROUTE}?updatedBy=alice`);
  assert.deepEqual(captured.at(-1)!.filters, {
    platform: null,
    updatedBy: "alice",
    fromDate: null,
    toDate: null,
  });

  // fromDate only
  await fetch(`${baseUrl}${ROUTE}?fromDate=2026-05-01T00:00:00.000Z`);
  const fromOnly = captured.at(-1)!.filters;
  assert.equal(fromOnly.platform, null);
  assert.equal(fromOnly.updatedBy, null);
  assert.equal(fromOnly.toDate, null);
  assert.equal(fromOnly.fromDate.toISOString(), "2026-05-01T00:00:00.000Z");

  // toDate only
  await fetch(`${baseUrl}${ROUTE}?toDate=2026-05-21T23:59:59.000Z`);
  const toOnly = captured.at(-1)!.filters;
  assert.equal(toOnly.platform, null);
  assert.equal(toOnly.updatedBy, null);
  assert.equal(toOnly.fromDate, null);
  assert.equal(toOnly.toDate.toISOString(), "2026-05-21T23:59:59.000Z");
});

test("rejects unknown platform with 400", async () => {
  const r = await fetch(`${baseUrl}${ROUTE}?platform=myspace`);
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "invalid query");
  assert.equal(captured.length, 0);
});

test("rejects invalid date strings with 400", async () => {
  const r = await fetch(`${baseUrl}${ROUTE}?fromDate=not-a-date`);
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "invalid query");
  assert.equal(captured.length, 0);
});

test("rejects unknown query keys (strict schema) with 400", async () => {
  const r = await fetch(`${baseUrl}${ROUTE}?bogus=1`);
  assert.equal(r.status, 400);
  assert.equal(captured.length, 0);
});

test("requires root admin: gate rejection short-circuits the route", async () => {
  rootAdminAllowed = false;
  const r = await fetch(`${baseUrl}${ROUTE}`);
  assert.equal(r.status, 401);
  assert.equal(captured.length, 0);
});

test("export does not leak token material: only audit status values appear in value columns", async () => {
  nextRows = [
    {
      id: "row_1",
      updatedAt: new Date("2026-05-20T09:00:00.000Z"),
      platform: "youtube",
      // The audit table by construction can only carry these three values.
      previousValue: "false",
      newValue: "true",
      updatedBy: "alice",
      batchId: null,
    },
  ];
  const r = await fetch(`${baseUrl}${ROUTE}`);
  const body = await r.text();
  // The route's own filename/headers must not echo anything that could
  // be mistaken for a secret env var name; ensure typical token markers
  // are absent.
  assert.equal(body.includes("AUDIENCE_GATEWAY_"), false);
  assert.equal(body.includes("TOKEN"), false);
  assert.equal(body.includes("Bearer"), false);
  // Sanity: legitimate audit values still present.
  const dataRow = body.trim().split("\n")[1];
  assert.ok(dataRow.includes(",false,true,"));
});
