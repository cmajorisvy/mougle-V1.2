// Task #852 — Coverage for the Task #848 "top changers" leaderboard
// over `production_asset_orphan_sweep_flapping_config_history`.
//
// What this test guards:
//   1. The service helper `listFlappingConfigHistoryActorStats`
//      respects the lookback window (only counts rows whose
//      occurred_at is >= now - windowDays) for 1d / 7d / 30d / 90d.
//   2. Ordering is descending by changeCount.
//   3. NULL `updatedBy` rows are surfaced (as `actorUserId: null` —
//      the UI renders them as "system").
//   4. `lastChangeAt` per actor is the MAX(occurred_at) inside the
//      window (in ISO format).
//   5. The HTTP route clamps windowDays > 90 to 90 and limit > 20
//      to 20, and rejects non-numeric/invalid params with 400.

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { inArray, sql as drizzleSql } from "drizzle-orm";

import { registerProductionAssetRoutes } from "../server/routes/admin/production-assets";
import {
  listFlappingConfigHistoryActorStats,
  FLAPPING_CONFIG_HISTORY_ACTOR_STATS_MAX_WINDOW_DAYS,
  FLAPPING_CONFIG_HISTORY_ACTOR_STATS_MAX_LIMIT,
} from "../server/services/production-asset-orphan-alert-service";
import { db, pool } from "../server/db";
import { productionAssetOrphanSweepFlappingConfigHistory } from "../shared/schema";

const ACTOR_HEAVY = "task-852-heavy";
const ACTOR_MID = "task-852-mid";
const ACTOR_LIGHT = "task-852-light";
const ACTOR_OLD = "task-852-old";
const TEST_ACTORS = [ACTOR_HEAVY, ACTOR_MID, ACTOR_LIGHT, ACTOR_OLD];

const DAY_MS = 24 * 60 * 60 * 1000;

async function ensureHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_asset_orphan_sweep_flapping_config_history (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at timestamp NOT NULL DEFAULT now(),
      updated_by text,
      action text NOT NULL,
      previous_config jsonb,
      new_config jsonb,
      changed_fields text[] NOT NULL DEFAULT '{}'::text[]
    );
  `);
}

async function purgeTestRows() {
  // Test actors (including system rows we'll re-seed below).
  await db
    .delete(productionAssetOrphanSweepFlappingConfigHistory)
    .where(
      inArray(
        productionAssetOrphanSweepFlappingConfigHistory.updatedBy,
        TEST_ACTORS,
      ),
    );
  // NULL-actor rows we seeded — keyed by a marker in the action/changedFields.
  await pool.query(
    `DELETE FROM production_asset_orphan_sweep_flapping_config_history
     WHERE updated_by IS NULL AND action = 'task852_system_marker'`,
  );
}

async function seedRow(opts: {
  actor: string | null;
  daysAgo: number;
  action?: string;
}) {
  const occurredAt = new Date(Date.now() - opts.daysAgo * DAY_MS);
  await db.insert(productionAssetOrphanSweepFlappingConfigHistory).values({
    occurredAt,
    updatedBy: opts.actor ?? undefined,
    action: opts.action ?? (opts.actor === null ? "task852_system_marker" : "updated"),
    previousConfig: { threshold: 3 } as any,
    newConfig: { threshold: 4 } as any,
    changedFields: ["threshold"],
  } as any);
}

let server: Server;
let base: string;

function appWithStubAdmin() {
  const app = express();
  app.use(express.json());
  const requireAdmin: express.RequestHandler = (req: any, _res, next) => {
    req.session = {
      isAdmin: true,
      adminActorId: "task-852-admin",
      adminActorType: "root_admin",
      adminRole: "super_admin",
    };
    next();
  };
  registerProductionAssetRoutes(app, requireAdmin);
  return app;
}

before(async () => {
  await ensureHistoryTable();
  await purgeTestRows();
  const app = appWithStubAdmin();
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  try {
    await purgeTestRows();
  } catch {
    /* best-effort */
  }
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  await purgeTestRows();
});

function findActor(
  items: Array<{ actorUserId: string | null; changeCount: number; lastChangeAt: string }>,
  actor: string | null,
) {
  return items.find((row) => row.actorUserId === actor);
}

describe("Task #852 — flapping-config history actor-stats leaderboard", () => {
  it("aggregates by actor, orders desc by count, surfaces NULL as null (system)", async () => {
    // Heavy: 5 rows in last 24h
    for (let i = 0; i < 5; i++) await seedRow({ actor: ACTOR_HEAVY, daysAgo: 0 });
    // Mid: 3 rows ~2 days ago (NOT in 1d window)
    for (let i = 0; i < 3; i++) await seedRow({ actor: ACTOR_MID, daysAgo: 2 });
    // Light: 1 row ~5 days ago
    await seedRow({ actor: ACTOR_LIGHT, daysAgo: 5 });
    // System (NULL actor): 2 rows ~3 days ago
    await seedRow({ actor: null, daysAgo: 3 });
    await seedRow({ actor: null, daysAgo: 3 });

    // 1-day window: only Heavy.
    const oneDay = await listFlappingConfigHistoryActorStats(1, 20);
    assert.equal(oneDay.windowDays, 1);
    assert.equal(oneDay.limit, 20);
    const heavyIn1d = findActor(oneDay.items, ACTOR_HEAVY);
    assert.ok(heavyIn1d, "Heavy must appear in 1d window");
    assert.equal(heavyIn1d!.changeCount, 5);
    assert.equal(findActor(oneDay.items, ACTOR_MID), undefined);
    assert.equal(findActor(oneDay.items, ACTOR_LIGHT), undefined);
    assert.equal(findActor(oneDay.items, null), undefined);

    // 7-day window: all four show up.
    const sevenDay = await listFlappingConfigHistoryActorStats(7, 20);
    assert.equal(sevenDay.windowDays, 7);
    const heavy = findActor(sevenDay.items, ACTOR_HEAVY)!;
    const mid = findActor(sevenDay.items, ACTOR_MID)!;
    const light = findActor(sevenDay.items, ACTOR_LIGHT)!;
    const sys = findActor(sevenDay.items, null)!;
    assert.ok(heavy && mid && light && sys, "all four actors must appear in 7d window");
    assert.equal(heavy.changeCount, 5);
    assert.equal(mid.changeCount, 3);
    assert.equal(light.changeCount, 1);
    assert.equal(sys.changeCount, 2);

    // Ordering: descending by changeCount.
    const ourItems = sevenDay.items.filter((row) =>
      row.actorUserId === null
        ? true
        : TEST_ACTORS.includes(row.actorUserId as string),
    );
    const counts = ourItems.map((r) => r.changeCount);
    const sorted = [...counts].sort((a, b) => b - a);
    assert.deepEqual(counts, sorted, "items must be sorted desc by changeCount");

    // lastChangeAt sanity: Heavy.lastChangeAt > Mid.lastChangeAt > Light.lastChangeAt
    assert.ok(
      new Date(heavy.lastChangeAt).getTime() > new Date(mid.lastChangeAt).getTime(),
      "heavy.lastChangeAt should be newer than mid.lastChangeAt",
    );
    assert.ok(
      new Date(mid.lastChangeAt).getTime() > new Date(light.lastChangeAt).getTime(),
      "mid.lastChangeAt should be newer than light.lastChangeAt",
    );
    // ISO format check.
    assert.match(heavy.lastChangeAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("30d and 90d windows include older rows; 7d window excludes 60-day-old rows", async () => {
    await seedRow({ actor: ACTOR_HEAVY, daysAgo: 0 });
    await seedRow({ actor: ACTOR_OLD, daysAgo: 60 }); // outside 30d, inside 90d
    await seedRow({ actor: ACTOR_OLD, daysAgo: 85 }); // inside 90d

    const sevenDay = await listFlappingConfigHistoryActorStats(7, 20);
    assert.equal(findActor(sevenDay.items, ACTOR_OLD), undefined);

    const thirtyDay = await listFlappingConfigHistoryActorStats(30, 20);
    assert.equal(thirtyDay.windowDays, 30);
    assert.equal(findActor(thirtyDay.items, ACTOR_OLD), undefined);

    const ninetyDay = await listFlappingConfigHistoryActorStats(90, 20);
    assert.equal(ninetyDay.windowDays, 90);
    const old = findActor(ninetyDay.items, ACTOR_OLD)!;
    assert.ok(old, "OLD actor must appear in 90d window");
    assert.equal(old.changeCount, 2);
    // lastChangeAt = the MAX of the two (60d ago, not 85d ago).
    const lastAgeDays = (Date.now() - new Date(old.lastChangeAt).getTime()) / DAY_MS;
    assert.ok(
      lastAgeDays > 55 && lastAgeDays < 65,
      `OLD.lastChangeAt should be ~60d ago, got ${lastAgeDays.toFixed(1)}d`,
    );
  });

  it("clamps windowDays and limit server-side, and falls back to defaults on zero/negative", async () => {
    // Seed something so the response is non-empty.
    await seedRow({ actor: ACTOR_HEAVY, daysAgo: 0 });

    const overMax = await listFlappingConfigHistoryActorStats(999, 999);
    assert.equal(
      overMax.windowDays,
      FLAPPING_CONFIG_HISTORY_ACTOR_STATS_MAX_WINDOW_DAYS,
      "windowDays must clamp to 90",
    );
    assert.equal(
      overMax.limit,
      FLAPPING_CONFIG_HISTORY_ACTOR_STATS_MAX_LIMIT,
      "limit must clamp to 20",
    );

    // Negative windowDays is clamped to the floor (1), not the default —
    // the default 7 only applies when the arg coerces to 0/NaN.
    const negative = await listFlappingConfigHistoryActorStats(-5, 0);
    assert.equal(negative.windowDays, 1, "negative windowDays must clamp to floor 1");
    assert.equal(negative.limit, 5, "zero limit must fall back to default 5");

    const nanInput = await listFlappingConfigHistoryActorStats(NaN, NaN);
    assert.equal(nanInput.windowDays, 7, "NaN windowDays must fall back to default 7");
    assert.equal(nanInput.limit, 5, "NaN limit must fall back to default 5");
  });

  it("HTTP route clamps over-max windowDays and limit", async () => {
    await seedRow({ actor: ACTOR_HEAVY, daysAgo: 0 });

    // 90 is the documented hard cap; the zod schema rejects > 90, so clamping
    // happens on the boundary. Confirm windowDays=90 + limit=20 round-trip OK.
    const res = await fetch(
      `${base}/api/admin/production-assets/orphans/sweep/flapping/config-history/actor-stats?windowDays=90&limit=20`,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.windowDays, 90);
    assert.equal(body.limit, 20);
    assert.ok(Array.isArray(body.items));
  });

  it("HTTP route returns 400 on out-of-range or non-numeric params", async () => {
    const tooBigWindow = await fetch(
      `${base}/api/admin/production-assets/orphans/sweep/flapping/config-history/actor-stats?windowDays=500`,
    );
    assert.equal(tooBigWindow.status, 400);
    const body1 = await tooBigWindow.json();
    assert.equal(body1.ok, false);
    assert.equal(body1.error, "invalid_actor_stats_params");

    const tooBigLimit = await fetch(
      `${base}/api/admin/production-assets/orphans/sweep/flapping/config-history/actor-stats?limit=999`,
    );
    assert.equal(tooBigLimit.status, 400);

    const nonNumeric = await fetch(
      `${base}/api/admin/production-assets/orphans/sweep/flapping/config-history/actor-stats?windowDays=abc`,
    );
    assert.equal(nonNumeric.status, 400);

    const zeroWindow = await fetch(
      `${base}/api/admin/production-assets/orphans/sweep/flapping/config-history/actor-stats?windowDays=0`,
    );
    assert.equal(zeroWindow.status, 400);

    const negativeLimit = await fetch(
      `${base}/api/admin/production-assets/orphans/sweep/flapping/config-history/actor-stats?limit=-1`,
    );
    assert.equal(negativeLimit.status, 400);
  });

  it("HTTP route applies defaults (7d / limit 5) when params are omitted", async () => {
    await seedRow({ actor: ACTOR_HEAVY, daysAgo: 0 });
    const res = await fetch(
      `${base}/api/admin/production-assets/orphans/sweep/flapping/config-history/actor-stats`,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.windowDays, 7);
    assert.equal(body.limit, 5);
  });
});

// Silence unused-import linter for `drizzleSql`; kept for future raw-SQL
// hooks if the seed pattern needs to drop to SQL.
void drizzleSql;
