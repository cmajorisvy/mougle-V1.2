/**
 * Task #885 — Regression test for the sibling CSV export
 * `GET /api/admin/production-assets/orphans/sweep/flapping-config/history.csv`.
 *
 * Mirrors the Task #883 coverage of the threshold-history CSV to lock
 * in the same Task #879-style behaviors on the flapping-config row
 * formatter before someone refactors it:
 *
 *   1. Default (no `timeZone`): header includes
 *      `changed_at,changed_at_local,time_zone`, the `time_zone`
 *      column is `UTC`, the `X-Export-Time-Zone` response header is
 *      `UTC`, and the filename ends in `-UTC.csv`.
 *   2. Valid `timeZone` (e.g. `America/Los_Angeles`): the resolved
 *      zone appears in the `time_zone` column for every row, in the
 *      `X-Export-Time-Zone` header, and as a `-<zone-slug>.csv`
 *      filename suffix. The `changed_at_local` column differs from
 *      the raw UTC `changed_at` value.
 *   3. Invalid `timeZone` (e.g. `Not/A_Real_Zone`): the request still
 *      succeeds with 200 and falls back to UTC instead of 400-ing.
 *   4. `from` / `to` / `actorUserId` filters narrow the row set just
 *      like the JSON history route, and `X-Export-Row-Count` matches.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { inArray } from "drizzle-orm";

import { registerProductionAssetRoutes } from "../server/routes/admin/production-assets";
import { db, pool } from "../server/db";
import { productionAssetSweepFlappingConfigChanges } from "../shared/schema";

const ACTOR_A = "task-885-actor-alpha";
const ACTOR_B = "task-885-actor-beta";
const ACTOR_C = "task-885-actor-gamma";
const SEED_ACTORS = [ACTOR_A, ACTOR_B, ACTOR_C];

let server: Server;
let base: string;

async function ensureFlappingHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_asset_sweep_flapping_config_changes (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      setting text NOT NULL,
      previous_value text,
      new_value text NOT NULL,
      actor_user_id varchar,
      changed_at timestamp NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_pa_sweep_flap_cfg_changed_at"
      ON production_asset_sweep_flapping_config_changes (changed_at);
  `);
}

async function clearSeedRows() {
  await db
    .delete(productionAssetSweepFlappingConfigChanges)
    .where(
      inArray(
        productionAssetSweepFlappingConfigChanges.actorUserId,
        SEED_ACTORS,
      ),
    );
}

const T0 = new Date("2026-01-01T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;

async function seedRows() {
  await db.insert(productionAssetSweepFlappingConfigChanges).values([
    {
      setting: "flapping_threshold",
      previousValue: null,
      newValue: "3",
      actorUserId: ACTOR_A,
      changedAt: T0,
    },
    {
      setting: "flapping_threshold",
      previousValue: "3",
      newValue: "5",
      actorUserId: ACTOR_A,
      changedAt: new Date(T0.getTime() + 1 * HOUR),
    },
    {
      setting: "flapping_window_ms",
      previousValue: "3600000",
      newValue: "7200000",
      actorUserId: ACTOR_B,
      changedAt: new Date(T0.getTime() + 2 * HOUR),
    },
    {
      setting: "flapping_threshold",
      previousValue: "5",
      newValue: "7",
      actorUserId: ACTOR_C,
      changedAt: new Date(T0.getTime() + 3 * HOUR),
    },
  ]);
}

function appWithStubAdmin() {
  const app = express();
  app.use(express.json());
  const requireAdmin: express.RequestHandler = (req: any, _res, next) => {
    req.session = {
      isAdmin: true,
      adminActorId: "task-885-stub-admin",
      adminActorType: "root_admin",
      adminRole: "super_admin",
    };
    next();
  };
  registerProductionAssetRoutes(app, requireAdmin);
  return app;
}

before(async () => {
  await ensureFlappingHistoryTable();
  const app = appWithStubAdmin();
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await clearSeedRows();
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  await clearSeedRows();
  await seedRows();
});

async function getCsv(qs: string) {
  const res = await fetch(
    `${base}/api/admin/production-assets/orphans/sweep/flapping-config/history.csv${qs}`,
  );
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

// The flapping-config table is shared with the live service and other
// concurrent test files. Scope assertions to the seed window so a
// parallel test that calls `setSweepFlappingThreshold` (which writes
// into the same table) can't inflate our row counts. Tests that
// specifically exercise from/to/actor filters compose with this scope.
const SEED_FROM = T0;
const SEED_TO = new Date(T0.getTime() + 3 * HOUR);
const SCOPE_FROM = encodeURIComponent(SEED_FROM.toISOString());
const SCOPE_TO = encodeURIComponent(SEED_TO.toISOString());
function withScope(qs: string): string {
  const sep = qs ? "&" : "?";
  return `${qs}${sep}from=${SCOPE_FROM}&to=${SCOPE_TO}`;
}

function parseCsvRows(text: string): string[][] {
  // Sufficient for this test: no embedded newlines inside quoted fields
  // in any seeded row.
  return text
    .replace(/\r\n$/, "")
    .split("\r\n")
    .map((line) => line.split(","));
}

test("csv: default (no timeZone) emits UTC columns + UTC header + UTC filename", async () => {
  const { status, headers, text } = await getCsv(withScope(""));
  assert.equal(status, 200);
  assert.match(headers.get("content-type") || "", /text\/csv/);
  assert.equal(headers.get("x-export-time-zone"), "UTC");
  assert.equal(headers.get("x-export-row-count"), "4");
  const disp = headers.get("content-disposition") || "";
  assert.match(
    disp,
    /attachment;\s*filename="orphan-sweep-flapping-config-history-.*-UTC\.csv"/,
  );

  const rows = parseCsvRows(text);
  assert.deepEqual(rows[0], [
    "id",
    "changed_at",
    "changed_at_local",
    "time_zone",
    "setting",
    "previous_value",
    "new_value",
    "actor_user_id",
  ]);
  assert.equal(rows.length, 1 + 4);
  for (const r of rows.slice(1)) {
    assert.equal(r[3], "UTC");
  }
});

test("csv: valid timeZone surfaces in column, header, filename; local != UTC", async () => {
  const tz = "America/Los_Angeles";
  const { status, headers, text } = await getCsv(
    withScope(`?timeZone=${encodeURIComponent(tz)}`),
  );
  assert.equal(status, 200);
  assert.equal(headers.get("x-export-time-zone"), tz);
  const disp = headers.get("content-disposition") || "";
  // Slug replaces `/` with `_`.
  assert.match(
    disp,
    /attachment;\s*filename="orphan-sweep-flapping-config-history-.*-America_Los_Angeles\.csv"/,
  );

  const rows = parseCsvRows(text);
  // Header still includes the zoned columns.
  assert.equal(rows[0][2], "changed_at_local");
  assert.equal(rows[0][3], "time_zone");
  assert.equal(rows.length, 1 + 4);
  for (const r of rows.slice(1)) {
    assert.equal(r[3], tz);
    // The local rendering must differ from the raw UTC ISO; LA is
    // 8h behind UTC in January, and the formatter uses
    // `YYYY-MM-DD HH:MM:SS` with no trailing `Z`.
    assert.notEqual(r[2], r[1]);
    assert.ok(r[2].length > 0);
    assert.doesNotMatch(r[2], /Z$/);
  }
});

test("csv: invalid timeZone falls back to UTC instead of 400-ing", async () => {
  const { status, headers, text } = await getCsv(
    withScope(`?timeZone=${encodeURIComponent("Not/A_Real_Zone")}`),
  );
  assert.equal(status, 200);
  assert.equal(headers.get("x-export-time-zone"), "UTC");
  const disp = headers.get("content-disposition") || "";
  assert.match(disp, /-UTC\.csv"/);
  const rows = parseCsvRows(text);
  for (const r of rows.slice(1)) {
    assert.equal(r[3], "UTC");
  }
});

test("csv: from/to filters narrow the row set + X-Export-Row-Count", async () => {
  const fromIso = new Date(T0.getTime() + 2 * HOUR).toISOString();
  const toIso = new Date(T0.getTime() + 3 * HOUR).toISOString();
  const { status, headers, text } = await getCsv(
    `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
  );
  assert.equal(status, 200);
  assert.equal(headers.get("x-export-row-count"), "2");
  const rows = parseCsvRows(text);
  assert.equal(rows.length, 1 + 2);
  const newValues = rows.slice(1).map((r) => r[6]).sort();
  assert.deepEqual(newValues, ["7", "7200000"]);
});

test("csv: actorUserId filter narrows to that actor's rows only", async () => {
  const { status, headers, text } = await getCsv(
    `?actorUserId=${encodeURIComponent(ACTOR_A)}`,
  );
  assert.equal(status, 200);
  assert.equal(headers.get("x-export-row-count"), "2");
  const rows = parseCsvRows(text);
  assert.equal(rows.length, 1 + 2);
  for (const r of rows.slice(1)) {
    assert.equal(r[7], ACTOR_A);
  }
  const newValues = rows.slice(1).map((r) => r[6]).sort();
  assert.deepEqual(newValues, ["3", "5"]);
});

test("csv: combined actor+from+to+timeZone filters compose correctly", async () => {
  const fromIso = T0.toISOString();
  const toIso = new Date(T0.getTime() + 1 * HOUR).toISOString();
  const tz = "Asia/Tokyo";
  const { status, headers, text } = await getCsv(
    `?actorUserId=${encodeURIComponent(ACTOR_A)}` +
      `&from=${encodeURIComponent(fromIso)}` +
      `&to=${encodeURIComponent(toIso)}` +
      `&timeZone=${encodeURIComponent(tz)}`,
  );
  assert.equal(status, 200);
  assert.equal(headers.get("x-export-time-zone"), tz);
  assert.equal(headers.get("x-export-row-count"), "2");
  const rows = parseCsvRows(text);
  assert.equal(rows.length, 1 + 2);
  for (const r of rows.slice(1)) {
    assert.equal(r[3], tz);
    assert.equal(r[7], ACTOR_A);
  }
});

test("csv: setting column carries the per-row setting name", async () => {
  // Scope to our seed window so concurrent test files writing into the
  // same shared table can't pollute the assertion.
  const fromIso = T0.toISOString();
  const toIso = new Date(T0.getTime() + 3 * HOUR).toISOString();
  const { status, text } = await getCsv(
    `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
  );
  assert.equal(status, 200);
  const rows = parseCsvRows(text);
  const settings = rows.slice(1).map((r) => r[4]).sort();
  assert.deepEqual(settings, [
    "flapping_threshold",
    "flapping_threshold",
    "flapping_threshold",
    "flapping_window_ms",
  ]);
});

test("csv: rejects malformed filters with 400", async () => {
  const bad = await getCsv(`?from=not-a-real-date`);
  assert.equal(bad.status, 400);
});
