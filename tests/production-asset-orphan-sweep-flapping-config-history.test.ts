/**
 * Task #825 — Flapping config-change history + snooze suppression
 * counter coverage for the production-asset orphan-sweep notifier.
 *
 * Verifies:
 *   1. Every change to the flapping alert/snooze config (flapping
 *      threshold + flapping window) writes a sanitized history row
 *      to `production_asset_orphan_sweep_flapping_config_history`
 *      with updatedBy / occurredAt / previousConfig / newConfig /
 *      changedFields.
 *   2. A no-op save (same value re-applied) does NOT write a noisy
 *      duplicate row.
 *   3. The combined setter captures multiple changed fields in a
 *      single row.
 *   4. The list helper is newest-first and bounded.
 *   5. A history-write failure does not crash the live config setter.
 *   6. When the flapping snooze swallows a would-be flapping alert,
 *      `suppressedCount` on the active `set` row is incremented.
 *   7. The end-of-window audit row (cleared / replaced / expired)
 *      captures the final suppressed count.
 *   8. Non-snoozed alert sends still run the alert path normally and
 *      do NOT increment the suppression counter on any historical
 *      `set` row.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "../server/db";
import {
  productionAssetOrphanSweepFlappingConfigHistory,
  productionAssetOrphanSweepFlappingSnoozes,
  systemSettings,
} from "@shared/schema";
import {
  productionAssetOrphanAlertService,
  recordFlappingConfigChange,
  listFlappingConfigHistory,
  clearFlappingConfigHistoryForTests,
  readFlappingConfig,
} from "../server/services/production-asset-orphan-alert-service";
import { panicButtonService } from "../server/services/panic-button-service";
import { EmailService } from "../server/services/email-service";

const svc = productionAssetOrphanAlertService as any;
const FLAPPING_THRESHOLD_KEY =
  "production_asset_orphan_sweep_flapping_threshold";
const FLAPPING_WINDOW_MS_KEY =
  "production_asset_orphan_sweep_flapping_window_ms";
const FLAPPING_SNOOZE_UNTIL_KEY =
  "production_asset_orphan_sweep_flapping_snooze_until";

async function clearLiveConfig() {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, FLAPPING_THRESHOLD_KEY));
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, FLAPPING_WINDOW_MS_KEY));
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, FLAPPING_SNOOZE_UNTIL_KEY));
}

async function clearSnoozeLog() {
  try {
    await db.delete(productionAssetOrphanSweepFlappingSnoozes);
  } catch {
    /* best-effort */
  }
}

const origCreateAlert = panicButtonService.createAlert.bind(panicButtonService);
const origSendAdminAlert = EmailService.prototype.sendAdminAlert;
let createAlertCalls: Array<{ type: string }> = [];
let emailCalls: Array<{ title: string }> = [];

beforeEach(async () => {
  await clearLiveConfig();
  await clearSnoozeLog();
  await clearFlappingConfigHistoryForTests();
  createAlertCalls = [];
  emailCalls = [];
  panicButtonService.createAlert = (async (arg: any) => {
    createAlertCalls.push({ type: arg?.type });
    return { id: "stub" } as any;
  }) as typeof panicButtonService.createAlert;
  EmailService.prototype.sendAdminAlert = (async function (
    this: any,
    _to: string,
    payload: any,
  ) {
    emailCalls.push({ title: payload?.title ?? "" });
    return { ok: true } as any;
  }) as typeof EmailService.prototype.sendAdminAlert;
  svc.wasFlapping = false;
});

afterEach(async () => {
  panicButtonService.createAlert = origCreateAlert;
  EmailService.prototype.sendAdminAlert = origSendAdminAlert;
  await clearLiveConfig();
  await clearSnoozeLog();
  await clearFlappingConfigHistoryForTests();
});

test("flapping threshold change writes one history row with actor + diff", async () => {
  const before = await readFlappingConfig();
  await productionAssetOrphanAlertService.setSweepFlappingThreshold(
    before.flappingThreshold + 2,
    "admin_founder",
  );
  const history = await listFlappingConfigHistory(10);
  assert.equal(history.length, 1);
  const [row] = history;
  assert.equal(row.updatedBy, "admin_founder");
  assert.deepEqual(row.changedFields, ["flappingThreshold"]);
  assert.equal(row.previousConfig?.flappingThreshold, before.flappingThreshold);
  assert.equal(
    row.newConfig?.flappingThreshold,
    before.flappingThreshold + 2,
  );
  assert.equal(
    row.previousConfig?.flappingWindowMs,
    row.newConfig?.flappingWindowMs,
  );
  assert.ok(Date.parse(row.occurredAt) > 0);
  assert.ok(["updated", "restored_default"].includes(row.action));
});

test("flapping window change writes its own history row", async () => {
  const before = await readFlappingConfig();
  const next = before.flappingWindowMs === 3600_000 ? 7200_000 : 3600_000;
  await productionAssetOrphanAlertService.setSweepFlappingWindowMs(
    next,
    "admin_founder",
  );
  const history = await listFlappingConfigHistory(10);
  assert.equal(history.length, 1);
  assert.deepEqual(history[0].changedFields, ["flappingWindowMs"]);
  assert.equal(history[0].newConfig?.flappingWindowMs, next);
});

test("no-op save does not write a duplicate row", async () => {
  const before = await readFlappingConfig();
  await productionAssetOrphanAlertService.setSweepFlappingThreshold(
    before.flappingThreshold + 1,
    "admin_founder",
  );
  const first = await listFlappingConfigHistory(10);
  assert.equal(first.length, 1);
  // Re-save the SAME value — should be a no-op for history.
  await productionAssetOrphanAlertService.setSweepFlappingThreshold(
    before.flappingThreshold + 1,
    "admin_founder",
  );
  const after = await listFlappingConfigHistory(10);
  assert.equal(after.length, 1, "no-op save must not spam history");
});

test("combined setter captures multiple changed fields in one row", async () => {
  const before = await readFlappingConfig();
  await productionAssetOrphanAlertService.setSweepFlappingConfig({
    flappingThreshold: before.flappingThreshold + 5,
    flappingWindowMs: before.flappingWindowMs + 60_000,
    updatedBy: "admin_founder",
  });
  const history = await listFlappingConfigHistory(10);
  assert.equal(history.length, 1);
  assert.ok(history[0].changedFields.includes("flappingThreshold"));
  assert.ok(history[0].changedFields.includes("flappingWindowMs"));
  assert.equal(history[0].changedFields.length, 2);
});

test("listFlappingConfigHistory is newest-first and bounded", async () => {
  const before = await readFlappingConfig();
  for (let i = 1; i <= 3; i++) {
    await productionAssetOrphanAlertService.setSweepFlappingThreshold(
      before.flappingThreshold + i,
      `actor_${i}`,
    );
  }
  const all = await listFlappingConfigHistory(50);
  assert.equal(all.length, 3);
  for (let i = 1; i < all.length; i++) {
    assert.ok(
      Date.parse(all[i - 1].occurredAt) >= Date.parse(all[i].occurredAt),
    );
  }
  const one = await listFlappingConfigHistory(1);
  assert.equal(one.length, 1);
  // newest = actor_3
  assert.equal(one[0].updatedBy, "actor_3");
  const huge = await listFlappingConfigHistory(9999);
  assert.ok(huge.length <= 50);
});

test("history-write failure does not block the live config setter", async () => {
  const before = await readFlappingConfig();
  const origInsert = (db as any).insert;
  let calls = 0;
  // Force the first history-table insert to throw; live system_settings
  // upserts must still succeed.
  (db as any).insert = function (table: any) {
    if (table === productionAssetOrphanSweepFlappingConfigHistory && calls === 0) {
      calls++;
      return {
        values: () => ({
          returning: async () => {
            throw new Error("simulated history write failure");
          },
        }),
      };
    }
    return origInsert.call(this, table);
  };
  try {
    const v = await productionAssetOrphanAlertService.setSweepFlappingThreshold(
      before.flappingThreshold + 9,
      "admin_founder",
    );
    assert.equal(v, before.flappingThreshold + 9);
    const live = await readFlappingConfig();
    assert.equal(live.flappingThreshold, before.flappingThreshold + 9);
  } finally {
    (db as any).insert = origInsert;
  }
});

test("snooze swallows flapping alert and bumps suppressedCount", async () => {
  // Arm a 1h snooze.
  const until = Date.now() + 60 * 60 * 1000;
  await productionAssetOrphanAlertService.setFlappingSnooze({
    untilMs: until,
    updatedBy: "admin_founder",
    reason: "ack",
  });

  // Simulate two flapping fires while snoozed — no platform alert /
  // email, but suppressedCount should bump twice.
  await svc.fireFlappingAlert(5, 3, 60 * 60 * 1000);
  await svc.fireFlappingAlert(6, 3, 60 * 60 * 1000);

  assert.equal(
    createAlertCalls.filter((c) =>
      c.type.includes("production_asset_orphan_sweep_flapping"),
    ).length,
    0,
    "no platform_alerts row while snoozed",
  );
  assert.equal(emailCalls.length, 0, "no email while snoozed");

  const setRow = (
    await db
      .select()
      .from(productionAssetOrphanSweepFlappingSnoozes)
      .where(eq(productionAssetOrphanSweepFlappingSnoozes.action, "set"))
      .orderBy(desc(productionAssetOrphanSweepFlappingSnoozes.occurredAt))
      .limit(1)
  )[0];
  assert.ok(setRow, "active set row exists");
  assert.equal(setRow.suppressedCount, 2);
});

test("clear / replace end-of-window rows record the final suppressed count", async () => {
  await productionAssetOrphanAlertService.setFlappingSnooze({
    untilMs: Date.now() + 60 * 60 * 1000,
    updatedBy: "founder",
  });
  await svc.fireFlappingAlert(5, 3, 60 * 60 * 1000);
  await svc.fireFlappingAlert(6, 3, 60 * 60 * 1000);
  await svc.fireFlappingAlert(7, 3, 60 * 60 * 1000);

  // Replace with a new snooze window — the old one should close with a
  // `replaced` row carrying the final count.
  await productionAssetOrphanAlertService.setFlappingSnooze({
    untilMs: Date.now() + 2 * 60 * 60 * 1000,
    updatedBy: "founder",
  });
  const replaced = (
    await db
      .select()
      .from(productionAssetOrphanSweepFlappingSnoozes)
      .where(eq(productionAssetOrphanSweepFlappingSnoozes.action, "replaced"))
      .limit(1)
  )[0];
  assert.ok(replaced, "replaced row written on snooze swap");
  assert.equal(replaced.suppressedCount, 3);

  // Bump the new window once, then clear it.
  await svc.fireFlappingAlert(8, 3, 60 * 60 * 1000);
  await productionAssetOrphanAlertService.clearFlappingSnooze("founder");
  const cleared = (
    await db
      .select()
      .from(productionAssetOrphanSweepFlappingSnoozes)
      .where(eq(productionAssetOrphanSweepFlappingSnoozes.action, "cleared"))
      .limit(1)
  )[0];
  assert.ok(cleared, "cleared row written");
  assert.equal(cleared.suppressedCount, 1);
});

test("non-snoozed flapping path still fires alert and does not bump any set row", async () => {
  // Arm + bump the counter on an active snooze.
  await productionAssetOrphanAlertService.setFlappingSnooze({
    untilMs: Date.now() + 60 * 60 * 1000,
    updatedBy: "founder",
  });
  await svc.fireFlappingAlert(5, 3, 60 * 60 * 1000);
  await productionAssetOrphanAlertService.clearFlappingSnooze("founder");

  const beforeBump = (
    await db
      .select()
      .from(productionAssetOrphanSweepFlappingSnoozes)
      .where(eq(productionAssetOrphanSweepFlappingSnoozes.action, "set"))
      .limit(1)
  )[0];
  assert.ok(beforeBump);
  const beforeCount = beforeBump.suppressedCount;

  // No active snooze — flapping fire should hit the live alert path.
  await svc.fireFlappingAlert(4, 3, 60 * 60 * 1000);
  assert.ok(
    createAlertCalls.some((c) =>
      c.type.includes("production_asset_orphan_sweep_flapping"),
    ),
    "live flapping path fires when not snoozed",
  );

  const afterBump = (
    await db
      .select()
      .from(productionAssetOrphanSweepFlappingSnoozes)
      .where(eq(productionAssetOrphanSweepFlappingSnoozes.id, beforeBump.id))
      .limit(1)
  )[0];
  assert.equal(
    afterBump.suppressedCount,
    beforeCount,
    "historical set row must not be bumped when alert is NOT suppressed",
  );
});

test("recordFlappingConfigChange is a pure no-op when nothing changed", async () => {
  const snap = { flappingThreshold: 5, flappingWindowMs: 3_600_000 };
  const result = await recordFlappingConfigChange({
    previous: snap,
    next: { ...snap },
    updatedBy: "founder",
  });
  assert.equal(result, null);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productionAssetOrphanSweepFlappingConfigHistory);
  assert.equal(rows[0]?.n ?? 0, 0);
});
