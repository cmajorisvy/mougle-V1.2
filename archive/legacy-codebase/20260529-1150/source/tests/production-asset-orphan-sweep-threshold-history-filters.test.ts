/**
 * Task #854 — Pins the actor/date/offset filters + total count on
 * GET /api/admin/production-assets/orphan-sweep/threshold/history
 * (Task #849). Seeds several productionAssetOrphanSweepThresholdChanges
 * rows for different actors at different timestamps, then exercises both
 * the service helper (listSweepThresholdChanges) and the admin route to
 * lock in:
 *
 *   1. actorUserId narrows the result set + total to that actor's rows.
 *   2. from / to bound the changedAt window correctly.
 *   3. offset paginates without changing total (newest-first ordering).
 *   4. total reflects the *filtered* count, not the page size.
 *   5. limit is clamped server-side (1..50).
 *   6. The route 400s on a clearly invalid filter.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { inArray } from "drizzle-orm";

import { registerProductionAssetRoutes } from "../server/routes/admin/production-assets";
import { db, pool } from "../server/db";
import { productionAssetOrphanSweepThresholdChanges } from "../shared/schema";
import { productionAssetOrphanAlertService } from "../server/services/production-asset-orphan-alert-service";

const ACTOR_A = "task-854-actor-alpha";
const ACTOR_B = "task-854-actor-beta";
const ACTOR_C = "task-854-actor-gamma";
const SEED_ACTORS = [ACTOR_A, ACTOR_B, ACTOR_C];

let server: Server;
let base: string;

async function ensureThresholdHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_asset_orphan_sweep_threshold_changes (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      previous_value text,
      new_value text NOT NULL,
      actor_user_id varchar,
      changed_at timestamp NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_pa_sweep_thresh_changed_at"
      ON production_asset_orphan_sweep_threshold_changes (changed_at);
  `);
}

async function clearSeedRows() {
  await db
    .delete(productionAssetOrphanSweepThresholdChanges)
    .where(
      inArray(
        productionAssetOrphanSweepThresholdChanges.actorUserId,
        SEED_ACTORS,
      ),
    );
}

// Fixed reference instant so the from/to assertions are deterministic
// regardless of when the test runs.
const T0 = new Date("2026-01-01T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;

async function seedRows() {
  // Newest-first when ordered by changedAt desc:
  //   ACTOR_C @ T0 + 3h  (newValue=40)
  //   ACTOR_B @ T0 + 2h  (newValue=30)
  //   ACTOR_A @ T0 + 1h  (newValue=20)
  //   ACTOR_A @ T0       (newValue=10)
  await db.insert(productionAssetOrphanSweepThresholdChanges).values([
    {
      previousValue: null,
      newValue: "10",
      actorUserId: ACTOR_A,
      changedAt: T0,
    },
    {
      previousValue: "10",
      newValue: "20",
      actorUserId: ACTOR_A,
      changedAt: new Date(T0.getTime() + 1 * HOUR),
    },
    {
      previousValue: "20",
      newValue: "30",
      actorUserId: ACTOR_B,
      changedAt: new Date(T0.getTime() + 2 * HOUR),
    },
    {
      previousValue: "30",
      newValue: "40",
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
      adminActorId: "task-854-stub-admin",
      adminActorType: "root_admin",
      adminRole: "super_admin",
    };
    next();
  };
  registerProductionAssetRoutes(app, requireAdmin);
  return app;
}

before(async () => {
  await ensureThresholdHistoryTable();
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

async function getHistory(qs: string) {
  const res = await fetch(
    `${base}/api/admin/production-assets/orphan-sweep/threshold/history${qs}`,
  );
  return { status: res.status, body: await res.json() };
}

test("service: actorUserId narrows items + total to that actor", async () => {
  const out = await productionAssetOrphanAlertService.listSweepThresholdChanges(
    { actorUserId: ACTOR_A, limit: 50 },
  );
  assert.equal(out.total, 2);
  assert.equal(out.items.length, 2);
  assert.ok(out.items.every((r) => r.actorUserId === ACTOR_A));
  // Newest-first within the actor's rows.
  assert.equal(out.items[0].newValue, "20");
  assert.equal(out.items[1].newValue, "10");
});

test("service: from/to bound the changedAt window", async () => {
  const fromOnly = await productionAssetOrphanAlertService.listSweepThresholdChanges(
    { from: new Date(T0.getTime() + 2 * HOUR), limit: 50 },
  );
  assert.equal(fromOnly.total, 2);
  assert.deepEqual(
    fromOnly.items.map((r) => r.newValue),
    ["40", "30"],
  );

  const toOnly = await productionAssetOrphanAlertService.listSweepThresholdChanges(
    { to: new Date(T0.getTime() + 1 * HOUR), limit: 50 },
  );
  assert.equal(toOnly.total, 2);
  assert.deepEqual(
    toOnly.items.map((r) => r.newValue),
    ["20", "10"],
  );

  const windowed =
    await productionAssetOrphanAlertService.listSweepThresholdChanges({
      from: new Date(T0.getTime() + 1 * HOUR),
      to: new Date(T0.getTime() + 2 * HOUR),
      limit: 50,
    });
  assert.equal(windowed.total, 2);
  assert.deepEqual(
    windowed.items.map((r) => r.newValue),
    ["30", "20"],
  );
});

test("service: offset paginates while total stays constant", async () => {
  const page1 = await productionAssetOrphanAlertService.listSweepThresholdChanges(
    { limit: 2, offset: 0 },
  );
  assert.equal(page1.total, 4);
  assert.equal(page1.items.length, 2);
  assert.deepEqual(
    page1.items.map((r) => r.newValue),
    ["40", "30"],
  );

  const page2 = await productionAssetOrphanAlertService.listSweepThresholdChanges(
    { limit: 2, offset: 2 },
  );
  assert.equal(page2.total, 4);
  assert.equal(page2.items.length, 2);
  assert.deepEqual(
    page2.items.map((r) => r.newValue),
    ["20", "10"],
  );

  const past = await productionAssetOrphanAlertService.listSweepThresholdChanges(
    { limit: 2, offset: 10 },
  );
  assert.equal(past.total, 4);
  assert.equal(past.items.length, 0);
});

test("service: limit is clamped server-side to [1, 50]", async () => {
  const big = await productionAssetOrphanAlertService.listSweepThresholdChanges(
    { limit: 9999 },
  );
  assert.ok(big.items.length <= 50);
  // total still reflects the unbounded filtered count.
  assert.equal(big.total, 4);
});

test("route: actor + offset filters return matching items, total, limit, offset", async () => {
  const { status, body } = await getHistory(
    `?actorUserId=${encodeURIComponent(ACTOR_A)}&limit=1&offset=0`,
  );
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.total, 2);
  assert.equal(body.limit, 1);
  assert.equal(body.offset, 0);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].actorUserId, ACTOR_A);
  assert.equal(body.items[0].newValue, "20");

  const next = await getHistory(
    `?actorUserId=${encodeURIComponent(ACTOR_A)}&limit=1&offset=1`,
  );
  assert.equal(next.status, 200);
  assert.equal(next.body.total, 2);
  assert.equal(next.body.offset, 1);
  assert.equal(next.body.items.length, 1);
  assert.equal(next.body.items[0].newValue, "10");
});

test("route: from/to query params bound the window and total", async () => {
  const fromIso = new Date(T0.getTime() + 2 * HOUR).toISOString();
  const toIso = new Date(T0.getTime() + 3 * HOUR).toISOString();
  const { status, body } = await getHistory(
    `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
  );
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.total, 2);
  assert.deepEqual(
    body.items.map((r: any) => r.newValue),
    ["40", "30"],
  );
});

test("route: combined actor + date + offset filters narrow correctly", async () => {
  // Only ACTOR_A rows are within this window; offset=1 skips the newer one.
  const fromIso = T0.toISOString();
  const toIso = new Date(T0.getTime() + 1 * HOUR).toISOString();
  const { status, body } = await getHistory(
    `?actorUserId=${encodeURIComponent(ACTOR_A)}` +
      `&from=${encodeURIComponent(fromIso)}` +
      `&to=${encodeURIComponent(toIso)}` +
      `&limit=10&offset=1`,
  );
  assert.equal(status, 200);
  assert.equal(body.total, 2);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].newValue, "10");
});

test("route: rejects invalid filters with 400", async () => {
  const bad = await getHistory(`?from=not-a-real-date`);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.ok, false);
  assert.equal(bad.body.error, "invalid_history_filters");

  const negativeOffset = await getHistory(`?offset=-5`);
  assert.equal(negativeOffset.status, 400);
  assert.equal(negativeOffset.body.error, "invalid_history_filters");
});
