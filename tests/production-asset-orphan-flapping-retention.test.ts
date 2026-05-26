/**
 * Task #840 — Retention helpers for the production-asset orphan-sweep
 * flapping audit tables.
 *
 * Verifies that `pruneFlappingConfigHistoryOlderThan` and
 * `pruneFlappingSnoozeLogOlderThan` remove only rows strictly older
 * than the supplied cutoff, return the count of rows deleted, and
 * leave newer rows untouched. Mirrors
 * `tests/audience-audit-export-notifier-config-history.test.ts`.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import {
  productionAssetOrphanSweepFlappingConfigHistory,
  productionAssetOrphanSweepFlappingSnoozes,
} from "@shared/schema";
import {
  pruneFlappingConfigHistoryOlderThan,
  pruneFlappingSnoozeLogOlderThan,
  recordFlappingConfigChange,
  listFlappingConfigHistory,
  clearFlappingConfigHistoryForTests,
} from "../server/services/production-asset-orphan-alert-service";

async function clearAll() {
  await clearFlappingConfigHistoryForTests();
  try {
    await db.delete(productionAssetOrphanSweepFlappingSnoozes);
  } catch {
    /* best-effort */
  }
}

beforeEach(clearAll);
afterEach(clearAll);

const YEAR_AGO = () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
const NINETY_DAYS_AGO = () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

test("pruneFlappingConfigHistoryOlderThan removes old rows and preserves newer ones", async () => {
  // Insert an "old" row, then a "new" row, then backdate the first.
  await recordFlappingConfigChange({
    previous: { flappingThreshold: 3, flappingWindowMs: 86_400_000 },
    next: { flappingThreshold: 5, flappingWindowMs: 86_400_000 },
    updatedBy: "old_actor",
  });
  // Backdate the single existing row to 1 year ago.
  await db
    .update(productionAssetOrphanSweepFlappingConfigHistory)
    .set({ occurredAt: YEAR_AGO() });

  await recordFlappingConfigChange({
    previous: { flappingThreshold: 5, flappingWindowMs: 86_400_000 },
    next: { flappingThreshold: 7, flappingWindowMs: 86_400_000 },
    updatedBy: "new_actor",
  });

  const cutoff = NINETY_DAYS_AGO();
  const pruned = await pruneFlappingConfigHistoryOlderThan(cutoff);
  assert.equal(pruned, 1);

  const after = await listFlappingConfigHistory(50);
  assert.equal(after.length, 1);
  assert.equal(after[0].updatedBy, "new_actor");
});

test("pruneFlappingConfigHistoryOlderThan returns 0 when no rows are older than cutoff", async () => {
  await recordFlappingConfigChange({
    previous: { flappingThreshold: 3, flappingWindowMs: 86_400_000 },
    next: { flappingThreshold: 4, flappingWindowMs: 86_400_000 },
    updatedBy: "fresh",
  });
  const pruned = await pruneFlappingConfigHistoryOlderThan(NINETY_DAYS_AGO());
  assert.equal(pruned, 0);
  const after = await listFlappingConfigHistory(10);
  assert.equal(after.length, 1);
});

test("pruneFlappingConfigHistoryOlderThan returns 0 on empty table", async () => {
  const pruned = await pruneFlappingConfigHistoryOlderThan(NINETY_DAYS_AGO());
  assert.equal(pruned, 0);
});

test("pruneFlappingSnoozeLogOlderThan removes old rows and preserves newer ones", async () => {
  // Old snooze-log row (will be backdated to a year ago).
  const oldId = "00000000-0000-0000-0000-000000000a01";
  await db.insert(productionAssetOrphanSweepFlappingSnoozes).values({
    id: oldId,
    action: "set",
    snoozeUntil: new Date(Date.now() + 60_000),
    updatedBy: "old_admin",
    reason: "old",
    suppressedCount: 0,
  } as any);
  await db
    .update(productionAssetOrphanSweepFlappingSnoozes)
    .set({ occurredAt: YEAR_AGO() })
    .where(eq(productionAssetOrphanSweepFlappingSnoozes.id, oldId));

  // Newer row.
  await db.insert(productionAssetOrphanSweepFlappingSnoozes).values({
    action: "cleared",
    snoozeUntil: null,
    updatedBy: "new_admin",
    reason: "fresh",
    suppressedCount: 0,
  } as any);

  const pruned = await pruneFlappingSnoozeLogOlderThan(NINETY_DAYS_AGO());
  assert.equal(pruned, 1);

  const remaining = await db
    .select()
    .from(productionAssetOrphanSweepFlappingSnoozes);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].updatedBy, "new_admin");
});

test("pruneFlappingSnoozeLogOlderThan returns 0 when no rows are older than cutoff", async () => {
  await db.insert(productionAssetOrphanSweepFlappingSnoozes).values({
    action: "set",
    snoozeUntil: new Date(Date.now() + 60_000),
    updatedBy: "fresh_admin",
    reason: null,
    suppressedCount: 0,
  } as any);
  const pruned = await pruneFlappingSnoozeLogOlderThan(NINETY_DAYS_AGO());
  assert.equal(pruned, 0);
  const remaining = await db
    .select()
    .from(productionAssetOrphanSweepFlappingSnoozes);
  assert.equal(remaining.length, 1);
});

test("pruneFlappingSnoozeLogOlderThan returns 0 on empty table", async () => {
  const pruned = await pruneFlappingSnoozeLogOlderThan(NINETY_DAYS_AGO());
  assert.equal(pruned, 0);
});
