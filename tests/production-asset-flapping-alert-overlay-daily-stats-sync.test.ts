/**
 * Task #862 — Integration test that the Task #858
 * `/orphans/sweep/flapping/alerts/daily-stats` endpoint stays in sync
 * with the Task #851 `/config-history/daily-stats` endpoint.
 *
 * Both endpoints are consumed together by the founder UI to overlay
 * alert markers on top of the config-change bar chart. They are
 * supposed to return EXACTLY the same number of UTC-day buckets for
 * the same `windowDays`, with the same `day` strings in the same
 * order — otherwise the overlay desynchronizes by a day.
 *
 * Today that contract is only enforced by hand. This test seeds both
 * tables across a known UTC window and asserts:
 *   1. `buckets.map(b => b.day)` is identical for both endpoints for
 *      `windowDays` in {7, 14, 30, 90}.
 *   2. Bucket length === `windowDays` for each.
 *   3. Alert counts split correctly by alert type (one-shot vs digest).
 *   4. Config-history counts are non-zero where we seeded them.
 *   5. Rows older than the window do NOT leak into either series.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { db } from "../server/db";
import {
  platformAlerts,
  productionAssetOrphanSweepFlappingConfigHistory,
} from "@shared/schema";
import {
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
  listFlappingConfigHistoryDailyStats,
  listFlappingAlertDailyStats,
  clearFlappingConfigHistoryForTests,
} from "../server/services/production-asset-orphan-alert-service";

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayString(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

async function clearAll() {
  await clearFlappingConfigHistoryForTests();
  await db
    .delete(platformAlerts)
    .where(
      inArray(platformAlerts.type, [
        PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
        PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
      ]),
    );
}

async function seedConfigHistoryAt(occurredAt: Date, updatedBy: string) {
  const [row] = await db
    .insert(productionAssetOrphanSweepFlappingConfigHistory)
    .values({
      updatedBy,
      action: "updated",
      previousConfig: { flappingThreshold: 5, flappingWindowMs: 3_600_000 },
      newConfig: { flappingThreshold: 7, flappingWindowMs: 3_600_000 },
      changedFields: ["flappingThreshold"],
    } as any)
    .returning();
  await db
    .update(productionAssetOrphanSweepFlappingConfigHistory)
    .set({ occurredAt })
    .where(eq(productionAssetOrphanSweepFlappingConfigHistory.id, row.id));
}

async function seedPlatformAlertAt(
  createdAt: Date,
  type: string,
  message: string,
) {
  const [row] = await db
    .insert(platformAlerts)
    .values({
      type,
      severity: "warning",
      message,
      details: { seededBy: "task-862-test" },
      autoTriggered: true,
    } as any)
    .returning();
  await db
    .update(platformAlerts)
    .set({ createdAt })
    .where(eq(platformAlerts.id, row.id));
}

beforeEach(clearAll);
afterEach(clearAll);

test("alert-overlay endpoint shares UTC-day buckets with the config-history daily-stats endpoint", async () => {
  const today = todayUtcMs();

  // Seed config-history rows at known UTC offsets (today, -1d, -6d, -29d).
  const configOffsets = [0, 1, 6, 29];
  for (const off of configOffsets) {
    await seedConfigHistoryAt(
      new Date(today - off * DAY_MS + 12 * 60 * 60 * 1000),
      `actor_cfg_${off}`,
    );
  }
  // Plus an out-of-window row 95 days ago — must NOT appear.
  await seedConfigHistoryAt(new Date(today - 95 * DAY_MS), "actor_cfg_old");

  // Seed flapping alert + digest rows at known offsets.
  // alerts:  today, -2d, -13d, -29d   (4 rows)
  // digests: today, -2d, -13d         (3 rows)
  // plus a -95d alert that must NOT appear.
  const alertOffsets = [0, 2, 13, 29];
  const digestOffsets = [0, 2, 13];
  for (const off of alertOffsets) {
    await seedPlatformAlertAt(
      new Date(today - off * DAY_MS + 6 * 60 * 60 * 1000),
      PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
      `alert ${off}`,
    );
  }
  for (const off of digestOffsets) {
    await seedPlatformAlertAt(
      new Date(today - off * DAY_MS + 18 * 60 * 60 * 1000),
      PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
      `digest ${off}`,
    );
  }
  await seedPlatformAlertAt(
    new Date(today - 95 * DAY_MS),
    PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
    "out-of-window alert",
  );

  for (const windowDays of [7, 14, 30, 90]) {
    const cfg = await listFlappingConfigHistoryDailyStats(windowDays);
    const alerts = await listFlappingAlertDailyStats(windowDays);

    // 1. Same number of buckets.
    assert.equal(
      cfg.buckets.length,
      windowDays,
      `cfg buckets length for windowDays=${windowDays}`,
    );
    assert.equal(
      alerts.buckets.length,
      windowDays,
      `alert buckets length for windowDays=${windowDays}`,
    );

    // 2. Identical day arrays — the whole point of the overlay.
    const cfgDays = cfg.buckets.map((b) => b.day);
    const alertDays = alerts.buckets.map((b) => b.day);
    assert.deepEqual(
      alertDays,
      cfgDays,
      `bucket day arrays must match for windowDays=${windowDays}`,
    );

    // 3. Same windowDays / since echoed back.
    assert.equal(cfg.windowDays, windowDays);
    assert.equal(alerts.windowDays, windowDays);
    assert.equal(cfg.since, alerts.since);

    // 4. Last bucket is today (UTC); first bucket is today - (windowDays - 1).
    assert.equal(alertDays[alertDays.length - 1], utcDayString(new Date(today)));
    assert.equal(
      alertDays[0],
      utcDayString(new Date(today - (windowDays - 1) * DAY_MS)),
    );

    // 5. Alert/digest counts split correctly by type within the window.
    const expectedAlerts = alertOffsets.filter((o) => o < windowDays).length;
    const expectedDigests = digestOffsets.filter((o) => o < windowDays).length;
    assert.equal(
      alerts.totalAlertCount,
      expectedAlerts,
      `total alert count for windowDays=${windowDays}`,
    );
    assert.equal(
      alerts.totalDigestCount,
      expectedDigests,
      `total digest count for windowDays=${windowDays}`,
    );
    assert.equal(
      alerts.totalCount,
      expectedAlerts + expectedDigests,
      `combined total for windowDays=${windowDays}`,
    );

    // Per-bucket: each seeded alert day has alertCount=1, digest day has digestCount=1.
    const byDay = new Map(alerts.buckets.map((b) => [b.day, b]));
    for (const off of alertOffsets) {
      if (off >= windowDays) continue;
      const day = utcDayString(new Date(today - off * DAY_MS));
      const b = byDay.get(day);
      assert.ok(b, `bucket for ${day} exists`);
      assert.equal(b!.alertCount, 1, `alertCount on ${day}`);
    }
    for (const off of digestOffsets) {
      if (off >= windowDays) continue;
      const day = utcDayString(new Date(today - off * DAY_MS));
      const b = byDay.get(day);
      assert.ok(b);
      assert.equal(b!.digestCount, 1, `digestCount on ${day}`);
    }
    for (const b of alerts.buckets) {
      assert.equal(
        b.total,
        b.alertCount + b.digestCount,
        `total = alert + digest on ${b.day}`,
      );
    }

    // 6. Config-history non-zero where we seeded inside the window.
    const cfgByDay = new Map(cfg.buckets.map((b) => [b.day, b.count]));
    const expectedCfg = configOffsets.filter((o) => o < windowDays).length;
    assert.equal(
      cfg.totalCount,
      expectedCfg,
      `config-history total for windowDays=${windowDays}`,
    );
    for (const off of configOffsets) {
      if (off >= windowDays) continue;
      const day = utcDayString(new Date(today - off * DAY_MS));
      assert.equal(cfgByDay.get(day), 1, `cfg count on ${day}`);
    }

    // 7. Out-of-window rows did not leak.
    const farDay = utcDayString(new Date(today - 95 * DAY_MS));
    assert.equal(byDay.has(farDay), false);
    assert.equal(cfgByDay.has(farDay), false);
  }
});

test("alert-overlay endpoint shares NON-UTC day buckets with the config-history daily-stats endpoint (Task #884)", async () => {
  // Task #884 — Task #877 added a `timeZone` argument to BOTH
  // `listFlappingConfigHistoryDailyStats` and `listFlappingAlertDailyStats`.
  // The original Task #862 sync test above only covers the UTC default,
  // so a future regression that breaks non-UTC bucketing on only one of
  // the two endpoints would still pass that test while silently sliding
  // the overlay markers off the bars on a non-UTC founder chart.
  //
  // This test exercises a couple of non-UTC zones across all advertised
  // window sizes and asserts that both endpoints agree on the bucket
  // day strings, the echoed `timeZone`, and the echoed `since`.
  const today = todayUtcMs();

  // Seed a sparse mix of rows around local midnight in the target zones
  // so any off-by-one-day desync between the two endpoints would surface
  // as a different `buckets.map(b => b.day)` array.
  for (const off of [0, 1, 6, 13, 29]) {
    await seedConfigHistoryAt(
      new Date(today - off * DAY_MS + 23 * 60 * 60 * 1000),
      `actor_cfg_tz_${off}`,
    );
    await seedPlatformAlertAt(
      new Date(today - off * DAY_MS + 1 * 60 * 60 * 1000),
      PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
      `tz alert ${off}`,
    );
  }

  for (const tz of ["Asia/Tokyo", "America/Los_Angeles"]) {
    for (const windowDays of [7, 14, 30, 90]) {
      const cfg = await listFlappingConfigHistoryDailyStats(windowDays, tz);
      const alerts = await listFlappingAlertDailyStats(windowDays, tz);

      assert.equal(
        cfg.buckets.length,
        windowDays,
        `cfg buckets length tz=${tz} windowDays=${windowDays}`,
      );
      assert.equal(
        alerts.buckets.length,
        windowDays,
        `alert buckets length tz=${tz} windowDays=${windowDays}`,
      );

      const cfgDays = cfg.buckets.map((b) => b.day);
      const alertDays = alerts.buckets.map((b) => b.day);
      assert.deepEqual(
        alertDays,
        cfgDays,
        `bucket day arrays must match for tz=${tz} windowDays=${windowDays}`,
      );

      assert.equal(
        cfg.timeZone,
        tz,
        `cfg echoed timeZone for tz=${tz} windowDays=${windowDays}`,
      );
      assert.equal(
        alerts.timeZone,
        tz,
        `alerts echoed timeZone for tz=${tz} windowDays=${windowDays}`,
      );
      assert.equal(
        cfg.timeZone,
        alerts.timeZone,
        `cfg vs alerts timeZone for tz=${tz} windowDays=${windowDays}`,
      );

      assert.equal(
        cfg.since,
        alerts.since,
        `cfg vs alerts since for tz=${tz} windowDays=${windowDays}`,
      );

      assert.equal(cfg.windowDays, windowDays);
      assert.equal(alerts.windowDays, windowDays);
    }
  }
});

test("alert-overlay endpoint stays in sync with config-history when both tables are empty", async () => {
  for (const windowDays of [7, 14, 30, 90]) {
    const cfg = await listFlappingConfigHistoryDailyStats(windowDays);
    const alerts = await listFlappingAlertDailyStats(windowDays);
    assert.equal(cfg.buckets.length, windowDays);
    assert.equal(alerts.buckets.length, windowDays);
    assert.deepEqual(
      alerts.buckets.map((b) => b.day),
      cfg.buckets.map((b) => b.day),
    );
    assert.equal(cfg.totalCount, 0);
    assert.equal(alerts.totalCount, 0);
    assert.equal(alerts.totalAlertCount, 0);
    assert.equal(alerts.totalDigestCount, 0);
  }
});
