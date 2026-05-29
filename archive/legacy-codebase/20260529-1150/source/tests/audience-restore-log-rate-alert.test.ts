/**
 * Task #470 — Audience restore-log rate-of-growth alert.
 *
 * Verifies that when today's `audience_restore_log` insert count
 * crosses the configured threshold, a founder `platform_alerts` row
 * fires with the offender detail, repeated checks inside the dedup
 * window are suppressed, and the alert auto-resolves once the rate
 * drops back below the threshold.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts, systemSettings } from "@shared/schema";
import { audienceRestoreLog } from "../shared/omni-channel-audience-schema";
import {
  AUDIENCE_RESTORE_LOG_RATE_ALERT_TYPE,
  AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY,
  DEFAULT_AUDIENCE_RESTORE_LOG_RATE_THRESHOLD,
  DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
  MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
  audienceRestoreLogRateAlertService,
  getEffectiveRestoreLogRateThreshold,
  getRestoreLogDailyActivity,
  getRestoreLogRateStats,
  setRestoreLogRateThresholdOverride,
} from "../server/services/audience-restore-log-rate-alert-service";

async function clearOurAlerts() {
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, AUDIENCE_RESTORE_LOG_RATE_ALERT_TYPE));
}

async function seedRestoreRows(count: number, restoredBy = "tester") {
  for (let i = 0; i < count; i++) {
    await db.insert(audienceRestoreLog).values({
      restoredAt: new Date(),
      archivePath: `audience-archive/messages/seed-${i}.jsonl.gz`,
      tableName: "messages",
      restoredBy,
      rowsParsed: 0,
      rowsInserted: 0,
      rowsSkipped: 0,
      error: null,
    });
  }
}

beforeEach(async () => {
  audienceRestoreLogRateAlertService.resetForTests();
  await clearOurAlerts();
  await db.delete(audienceRestoreLog);
  await db
    .delete(systemSettings)
    .where(
      eq(systemSettings.key, AUDIENCE_RESTORE_LOG_RATE_THRESHOLD_SETTING_KEY),
    );
  delete process.env.AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS;
  delete process.env.AUDIENCE_RESTORE_LOG_RATE_THRESHOLD;
});

afterEach(async () => {
  await clearOurAlerts();
  await db.delete(audienceRestoreLog);
});

async function openAlerts() {
  return db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RESTORE_LOG_RATE_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
}

test("default threshold is 50 inserts/day", async () => {
  const eff = await getEffectiveRestoreLogRateThreshold();
  assert.equal(eff.threshold, DEFAULT_AUDIENCE_RESTORE_LOG_RATE_THRESHOLD);
  assert.equal(eff.threshold, 50);
  assert.equal(eff.override, null);
  assert.equal(eff.envFallback, null);
});

test("env var lowers the default threshold", async () => {
  process.env.AUDIENCE_RESTORE_LOG_RATE_THRESHOLD = "5";
  const eff = await getEffectiveRestoreLogRateThreshold();
  assert.equal(eff.threshold, 5);
  assert.equal(eff.envFallback, 5);
});

test("admin override beats env fallback", async () => {
  process.env.AUDIENCE_RESTORE_LOG_RATE_THRESHOLD = "5";
  await setRestoreLogRateThresholdOverride(20, "tester");
  const eff = await getEffectiveRestoreLogRateThreshold();
  assert.equal(eff.threshold, 20);
  assert.equal(eff.override, 20);
  assert.equal(eff.envFallback, 5);
});

test("below-threshold rate does NOT fire an alert", async () => {
  process.env.AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS = "0";
  await setRestoreLogRateThresholdOverride(10, "tester");
  await seedRestoreRows(3);
  const fired = await audienceRestoreLogRateAlertService.checkAndNotify({
    restoredBy: "alice",
  });
  assert.equal(fired, false);
  assert.equal((await openAlerts()).length, 0);
});

test("over-threshold rate fires a founder alert with today's count", async () => {
  process.env.AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS = "0";
  await setRestoreLogRateThresholdOverride(5, "tester");
  await seedRestoreRows(7);
  const fired = await audienceRestoreLogRateAlertService.checkAndNotify({
    restoredBy: "alice",
  });
  assert.equal(fired, true);
  const open = await openAlerts();
  assert.equal(open.length, 1);
  assert.match(open[0].message, /filling up unusually fast/i);
  assert.match(open[0].message, /7 restores today/);
  assert.match(open[0].message, /threshold=5/);
  const d = (open[0].details as Record<string, any>) ?? {};
  assert.equal(d.source, "audience-restore-log-rate-alert-service");
  assert.equal(d.todayCount, 7);
  assert.equal(d.threshold, 5);
  assert.equal(d.restoredBy, "alice");
  assert.equal(d.consecutiveOver, 1);
});

test("repeated over-threshold checks inside dedup window are suppressed", async () => {
  process.env.AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS = String(60 * 60 * 1000);
  await setRestoreLogRateThresholdOverride(5, "tester");
  await seedRestoreRows(10);
  const first = await audienceRestoreLogRateAlertService.checkAndNotify({
    restoredBy: "alice",
  });
  const second = await audienceRestoreLogRateAlertService.checkAndNotify({
    restoredBy: "alice",
  });
  const third = await audienceRestoreLogRateAlertService.checkAndNotify({
    restoredBy: "alice",
  });
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(third, false);
  assert.equal((await openAlerts()).length, 1);
});

test("dedup window of 0 disables suppression", async () => {
  process.env.AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS = "0";
  await setRestoreLogRateThresholdOverride(5, "tester");
  await seedRestoreRows(10);
  assert.equal(
    await audienceRestoreLogRateAlertService.checkAndNotify({
      restoredBy: "alice",
    }),
    true,
  );
  assert.equal(
    await audienceRestoreLogRateAlertService.checkAndNotify({
      restoredBy: "alice",
    }),
    true,
  );
  assert.equal((await openAlerts()).length, 2);
});

test("rate dropping below threshold auto-resolves the open alert", async () => {
  process.env.AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS = "0";
  await setRestoreLogRateThresholdOverride(5, "tester");
  await seedRestoreRows(10);
  await audienceRestoreLogRateAlertService.checkAndNotify({
    restoredBy: "alice",
  });
  const before = await openAlerts();
  assert.equal(before.length, 1);
  const alertId = before[0].id;

  await db.delete(audienceRestoreLog);

  const fired = await audienceRestoreLogRateAlertService.checkAndNotify({
    restoredBy: "alice",
  });
  assert.equal(fired, false);

  const rows = await db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.id, alertId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].acknowledged, true);
  assert.equal(rows[0].acknowledgedBy, "system");
  const d = (rows[0].details as Record<string, any>) ?? {};
  assert.equal(d.autoResolved, true);
  assert.equal(d.autoResolvedThreshold, 5);
});

test("threshold of 0 disables alerting regardless of rate", async () => {
  process.env.AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS = "0";
  await setRestoreLogRateThresholdOverride(0, "tester");
  await seedRestoreRows(20);
  const fired = await audienceRestoreLogRateAlertService.checkAndNotify({
    restoredBy: "alice",
  });
  assert.equal(fired, false);
  assert.equal((await openAlerts()).length, 0);
});

test("getRestoreLogRateStats returns today's count + threshold for the dashboard", async () => {
  await setRestoreLogRateThresholdOverride(25, "tester");
  await seedRestoreRows(3);
  const stats = await getRestoreLogRateStats();
  assert.equal(stats.todayCount, 3);
  assert.equal(stats.threshold, 25);
  assert.equal(stats.override, 25);
  assert.equal(stats.defaultThreshold, DEFAULT_AUDIENCE_RESTORE_LOG_RATE_THRESHOLD);
  assert.equal(stats.alertActive, false);
  assert.equal(typeof stats.windowStartIso, "string");
  assert.ok(stats.windowStartIso.endsWith("T00:00:00.000Z"));
});

test("alertActive flips true once the platform alert is open", async () => {
  process.env.AUDIENCE_RESTORE_LOG_RATE_DEDUP_MS = "0";
  await setRestoreLogRateThresholdOverride(5, "tester");
  await seedRestoreRows(10);
  await audienceRestoreLogRateAlertService.checkAndNotify({
    restoredBy: "alice",
  });
  const stats = await getRestoreLogRateStats();
  assert.equal(stats.alertActive, true);
});

// Task #528 — 7-day restore activity chart.

async function seedRestoreOnDay(daysAgo: number, count: number) {
  const now = new Date();
  const day = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysAgo,
      12,
      0,
      0,
    ),
  );
  for (let i = 0; i < count; i++) {
    await db.insert(audienceRestoreLog).values({
      restoredAt: day,
      archivePath: `audience-archive/messages/seed-d${daysAgo}-${i}.jsonl.gz`,
      tableName: "messages",
      restoredBy: "tester",
      rowsParsed: 0,
      rowsInserted: 0,
      rowsSkipped: 0,
      error: null,
    });
  }
}

test("getRestoreLogDailyActivity buckets/zero-fills/clamps + flows into getRestoreLogRateStats", async () => {
  // empty: zero-filled, oldest→newest, last bucket = today UTC, all counts 0
  const empty = await getRestoreLogDailyActivity();
  assert.equal(empty.length, DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
  for (const b of empty) {
    assert.equal(b.count, 0);
    assert.ok(b.dayStartIso.endsWith("T00:00:00.000Z"));
  }
  for (let i = 1; i < empty.length; i++) {
    const prev = new Date(empty[i - 1].dayStartIso).getTime();
    const cur = new Date(empty[i].dayStartIso).getTime();
    assert.equal(cur - prev, 24 * 60 * 60 * 1000);
  }
  const today = new Date();
  const todayIso = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  ).toISOString();
  assert.equal(empty[empty.length - 1].dayStartIso, todayIso);

  // bounds clamp
  assert.equal((await getRestoreLogDailyActivity(0)).length, 1);
  assert.equal(
    (await getRestoreLogDailyActivity(9999)).length,
    MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
  );

  // seeded data: groups by UTC day, zero-fills gaps, excludes rows outside window
  await seedRestoreOnDay(0, 4); // today
  await seedRestoreOnDay(2, 7); // 2 days ago
  await seedRestoreOnDay(6, 1); // 6 days ago (edge of 7-day window)
  await seedRestoreOnDay(8, 99); // outside the window — must be excluded
  const seeded = await getRestoreLogDailyActivity(7);
  assert.equal(seeded.length, 7);
  assert.equal(seeded[0].count, 1, "6 days ago");
  assert.equal(seeded[1].count, 0);
  assert.equal(seeded[2].count, 0);
  assert.equal(seeded[3].count, 0);
  assert.equal(seeded[4].count, 7, "2 days ago");
  assert.equal(seeded[5].count, 0);
  assert.equal(seeded[6].count, 4, "today");
  assert.equal(
    seeded.reduce((a, b) => a + b.count, 0),
    12,
    "8-day-old row excluded",
  );

  // and it flows into the dashboard stats blob — last bucket matches todayCount
  const stats = await getRestoreLogRateStats();
  assert.ok(Array.isArray(stats.dailyActivity));
  assert.equal(stats.dailyActivity.length, DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
  const last = stats.dailyActivity[stats.dailyActivity.length - 1];
  assert.equal(last.count, stats.todayCount);
  assert.equal(last.count, 4);
});
