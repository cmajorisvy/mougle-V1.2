// Task #825 — Lock the audit-write contract of the flapping-config
// setters (Task #810). The audit row is written silently inside
// `setSweepFlappingThreshold` / `setSweepFlappingWindowMs`; if a future
// refactor moves the upsert out of those methods (or short-circuits
// when the value matches), nobody notices until a founder needs to read
// `listFlappingConfigChanges` and finds the history dark.
//
// What this test guards:
//   1. A real change to the threshold writes exactly one row whose
//      setting/previous/new/actor fields match.
//   2. A real change to the window writes exactly one row, same shape.
//   3. A no-op save (calling the setter with the value already in
//      system_settings) writes zero rows.
//   4. `listFlappingConfigChanges` returns newest-first and respects
//      the caller-supplied limit.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { productionAssetOrphanAlertService } from "../server/services/production-asset-orphan-alert-service";
import { db, pool } from "../server/db";
import {
  productionAssetSweepFlappingConfigChanges,
  systemSettings,
} from "../shared/schema";

const THRESHOLD_KEY = "production_asset_orphan_sweep_flapping_threshold";
const WINDOW_MS_KEY = "production_asset_orphan_sweep_flapping_window_ms";

const ACTOR_A = "test-admin-task-825-a";
const ACTOR_B = "test-admin-task-825-b";

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      key text NOT NULL UNIQUE,
      value text NOT NULL,
      updated_by varchar,
      updated_at timestamp DEFAULT now()
    );
  `);
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
}

async function purgeFlappingSettings() {
  await db
    .delete(systemSettings)
    .where(inArray(systemSettings.key, [THRESHOLD_KEY, WINDOW_MS_KEY]));
}

async function purgeFlappingHistoryForActors(actors: string[]) {
  await db
    .delete(productionAssetSweepFlappingConfigChanges)
    .where(inArray(productionAssetSweepFlappingConfigChanges.actorUserId, actors));
}

async function countHistoryFor(setting: string, actor: string): Promise<number> {
  const rows = await db
    .select()
    .from(productionAssetSweepFlappingConfigChanges)
    .where(eq(productionAssetSweepFlappingConfigChanges.actorUserId, actor));
  return rows.filter((r) => r.setting === setting).length;
}

before(async () => {
  await ensureTables();
  await purgeFlappingSettings();
  await purgeFlappingHistoryForActors([ACTOR_A, ACTOR_B]);
});

after(async () => {
  try {
    await purgeFlappingHistoryForActors([ACTOR_A, ACTOR_B]);
    await purgeFlappingSettings();
  } catch {
    /* never fail a test on cleanup */
  }
});

describe("Task #825 — flapping-config setters write to the audit table", () => {
  it("setSweepFlappingThreshold writes exactly one audit row on a real change", async () => {
    const before = await countHistoryFor("flapping_threshold", ACTOR_A);
    const returned = await productionAssetOrphanAlertService.setSweepFlappingThreshold(
      5,
      ACTOR_A,
    );
    assert.equal(returned, 5);

    const after = await countHistoryFor("flapping_threshold", ACTOR_A);
    assert.equal(after - before, 1, "exactly one audit row per real change");

    const rows = await db
      .select()
      .from(productionAssetSweepFlappingConfigChanges)
      .where(eq(productionAssetSweepFlappingConfigChanges.actorUserId, ACTOR_A));
    const row = rows.find((r) => r.setting === "flapping_threshold" && r.newValue === "5");
    assert.ok(row, "audit row must record the new value");
    assert.equal(row!.previousValue, null, "first write has no prior value");
    assert.equal(row!.actorUserId, ACTOR_A);
  });

  it("setSweepFlappingThreshold called with the same value writes zero rows (no-op)", async () => {
    const before = await countHistoryFor("flapping_threshold", ACTOR_A);
    const returned = await productionAssetOrphanAlertService.setSweepFlappingThreshold(
      5,
      ACTOR_A,
    );
    assert.equal(returned, 5);
    const after = await countHistoryFor("flapping_threshold", ACTOR_A);
    assert.equal(after, before, "no-op save must not insert an audit row");
  });

  it("setSweepFlappingWindowMs writes exactly one audit row on a real change", async () => {
    const before = await countHistoryFor("flapping_window_ms", ACTOR_B);
    const newWindow = 6 * 60 * 60 * 1000; // 6h, well inside the bounded range
    const returned = await productionAssetOrphanAlertService.setSweepFlappingWindowMs(
      newWindow,
      ACTOR_B,
    );
    assert.equal(returned, newWindow);

    const after = await countHistoryFor("flapping_window_ms", ACTOR_B);
    assert.equal(after - before, 1, "exactly one audit row per real change");

    const rows = await db
      .select()
      .from(productionAssetSweepFlappingConfigChanges)
      .where(eq(productionAssetSweepFlappingConfigChanges.actorUserId, ACTOR_B));
    const row = rows.find(
      (r) => r.setting === "flapping_window_ms" && r.newValue === String(newWindow),
    );
    assert.ok(row, "audit row must record the new window value");
    assert.equal(row!.actorUserId, ACTOR_B);
  });

  it("setSweepFlappingWindowMs called with the same value writes zero rows (no-op)", async () => {
    const before = await countHistoryFor("flapping_window_ms", ACTOR_B);
    const newWindow = 6 * 60 * 60 * 1000;
    const returned = await productionAssetOrphanAlertService.setSweepFlappingWindowMs(
      newWindow,
      ACTOR_B,
    );
    assert.equal(returned, newWindow);
    const after = await countHistoryFor("flapping_window_ms", ACTOR_B);
    assert.equal(after, before, "no-op save must not insert an audit row");
  });

  it("subsequent real change records the previous value and listFlappingConfigChanges returns newest-first", async () => {
    // Change threshold A second time so previousValue is observed.
    const beforeChange = await countHistoryFor("flapping_threshold", ACTOR_A);
    await productionAssetOrphanAlertService.setSweepFlappingThreshold(7, ACTOR_A);
    const afterChange = await countHistoryFor("flapping_threshold", ACTOR_A);
    assert.equal(afterChange - beforeChange, 1);

    const history = await productionAssetOrphanAlertService.listFlappingConfigChanges({
      limit: 50,
    });

    // Filter to rows produced by this test so we don't depend on shared
    // dev-DB history outside our actor namespace.
    const ours = history.filter(
      (r) => r.actorUserId === ACTOR_A || r.actorUserId === ACTOR_B,
    );

    // We should observe at least three of our writes (threshold #1,
    // window #1, threshold #2). The two no-op saves must NOT appear.
    assert.ok(ours.length >= 3, `expected ≥3 of our rows, got ${ours.length}`);

    // Newest-first ordering: each timestamp should be ≥ the next.
    for (let i = 1; i < ours.length; i++) {
      assert.ok(
        new Date(ours[i - 1].changedAt).getTime() >=
          new Date(ours[i].changedAt).getTime(),
        "listFlappingConfigChanges must be newest-first",
      );
    }

    const secondThreshold = ours.find(
      (r) =>
        r.actorUserId === ACTOR_A &&
        r.setting === "flapping_threshold" &&
        r.newValue === "7",
    );
    assert.ok(secondThreshold, "second threshold change must be in the history");
    assert.equal(
      secondThreshold!.previousValue,
      "5",
      "second change must record the prior value (5)",
    );

    // Limit clamps to caller value.
    const limited = await productionAssetOrphanAlertService.listFlappingConfigChanges({
      limit: 1,
    });
    assert.equal(limited.length, 1, "limit must clamp the result count");
  });
});
