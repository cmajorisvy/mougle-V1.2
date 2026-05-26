/**
 * Task #850 — Retention helper for the orphan-sweep alert threshold
 * change history table (Task #845).
 *
 * Verifies that `pruneSweepThresholdChangesOlderThan` removes only rows
 * strictly older than the supplied cutoff, returns the count of rows
 * deleted, and leaves newer rows untouched. Mirrors
 * `tests/production-asset-orphan-flapping-retention.test.ts`.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "../server/db";
import { productionAssetOrphanSweepThresholdChanges } from "@shared/schema";
import {
  pruneSweepThresholdChangesOlderThan,
  clearSweepThresholdChangesForTests,
} from "../server/services/production-asset-orphan-alert-service";

beforeEach(clearSweepThresholdChangesForTests);
afterEach(clearSweepThresholdChangesForTests);

const YEAR_AGO = () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
const NINETY_DAYS_AGO = () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

test("pruneSweepThresholdChangesOlderThan removes old rows and preserves newer ones", async () => {
  await db.insert(productionAssetOrphanSweepThresholdChanges).values({
    previousValue: "5",
    newValue: "7",
    actorUserId: "old_actor",
  } as any);
  await db
    .update(productionAssetOrphanSweepThresholdChanges)
    .set({ changedAt: YEAR_AGO() });

  await db.insert(productionAssetOrphanSweepThresholdChanges).values({
    previousValue: "7",
    newValue: "9",
    actorUserId: "new_actor",
  } as any);

  const pruned = await pruneSweepThresholdChangesOlderThan(NINETY_DAYS_AGO());
  assert.equal(pruned, 1);

  const remaining = await db
    .select()
    .from(productionAssetOrphanSweepThresholdChanges);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].actorUserId, "new_actor");
});

test("pruneSweepThresholdChangesOlderThan returns 0 when no rows are older than cutoff", async () => {
  await db.insert(productionAssetOrphanSweepThresholdChanges).values({
    previousValue: "3",
    newValue: "4",
    actorUserId: "fresh",
  } as any);
  const pruned = await pruneSweepThresholdChangesOlderThan(NINETY_DAYS_AGO());
  assert.equal(pruned, 0);
  const remaining = await db
    .select()
    .from(productionAssetOrphanSweepThresholdChanges);
  assert.equal(remaining.length, 1);
});

test("pruneSweepThresholdChangesOlderThan returns 0 on empty table", async () => {
  const pruned = await pruneSweepThresholdChangesOlderThan(NINETY_DAYS_AGO());
  assert.equal(pruned, 0);
});
