/**
 * Task #865 — Pin the day-bucket math in
 * `listFlappingConfigHistoryDailyStats` so a future refactor of either
 *   - the SQL: `(occurred_at AT TIME ZONE 'UTC') AT TIME ZONE $tz`, or
 *   - the JS local-midnight walker that builds the empty buckets
 * can't silently re-introduce the UTC "spill" bug Task #859 fixed.
 *
 * Covers:
 *   1. A row at 2026-01-15T05:30:00Z lands in the 2026-01-15 bucket
 *      when timeZone=UTC but in the 2026-01-14 bucket when
 *      timeZone=America/Los_Angeles (offset −08:00 in January).
 *   2. A US spring-forward DST transition day (2026-03-08 in
 *      America/Los_Angeles) still yields exactly `windowDays` empty
 *      buckets that step by one calendar day.
 *   3. An invalid IANA time-zone string falls back to UTC (covered by
 *      `normalizeFlappingDailyStatsTimeZone`).
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "../server/db";
import { productionAssetOrphanSweepFlappingConfigHistory } from "@shared/schema";
import {
  listFlappingConfigHistoryDailyStats,
  clearFlappingConfigHistoryForTests,
} from "../server/services/production-asset-orphan-alert-service";

const realDateNow = Date.now;

async function insertAt(iso: string) {
  await db
    .insert(productionAssetOrphanSweepFlappingConfigHistory)
    .values({
      occurredAt: new Date(iso),
      action: "updated",
      updatedBy: "test_task_865",
    });
}

beforeEach(async () => {
  await clearFlappingConfigHistoryForTests();
});

afterEach(async () => {
  Date.now = realDateNow;
  await clearFlappingConfigHistoryForTests();
});

test("Task #865 — boundary row lands in different day buckets for UTC vs America/Los_Angeles", async () => {
  // Pin "now" so the 14-day window includes 2026-01-15 in both zones.
  Date.now = () => Date.parse("2026-01-20T12:00:00Z");

  await insertAt("2026-01-15T05:30:00Z");

  const utcStats = await listFlappingConfigHistoryDailyStats(14, "UTC");
  assert.equal(utcStats.timeZone, "UTC");
  assert.equal(utcStats.totalCount, 1);
  const utcHits = utcStats.buckets.filter((b) => b.count > 0);
  assert.equal(utcHits.length, 1, "exactly one non-empty UTC bucket");
  assert.equal(
    utcHits[0].day,
    "2026-01-15",
    "UTC wall time of 05:30Z must bucket as 2026-01-15",
  );

  const laStats = await listFlappingConfigHistoryDailyStats(
    14,
    "America/Los_Angeles",
  );
  assert.equal(laStats.timeZone, "America/Los_Angeles");
  assert.equal(laStats.totalCount, 1);
  const laHits = laStats.buckets.filter((b) => b.count > 0);
  assert.equal(laHits.length, 1, "exactly one non-empty LA bucket");
  assert.equal(
    laHits[0].day,
    "2026-01-14",
    "05:30Z = 21:30 PST on the previous local day, must bucket as 2026-01-14",
  );
});

test("Task #865 — DST spring-forward day still yields exactly windowDays consecutive local-calendar buckets", async () => {
  // US spring-forward in 2026 is 2026-03-08 in America/Los_Angeles.
  Date.now = () => Date.parse("2026-03-10T12:00:00Z");

  const windowDays = 10;
  const stats = await listFlappingConfigHistoryDailyStats(
    windowDays,
    "America/Los_Angeles",
  );
  assert.equal(stats.timeZone, "America/Los_Angeles");
  assert.equal(
    stats.buckets.length,
    windowDays,
    "DST walker must still emit exactly windowDays buckets",
  );

  const days = stats.buckets.map((b) => b.day);
  for (let i = 1; i < days.length; i++) {
    const prev = Date.parse(`${days[i - 1]}T00:00:00Z`);
    const cur = Date.parse(`${days[i]}T00:00:00Z`);
    assert.equal(
      cur - prev,
      24 * 60 * 60 * 1000,
      `consecutive local-calendar days must differ by exactly one day: ${days[i - 1]} -> ${days[i]}`,
    );
  }

  assert.ok(
    days.includes("2026-03-08"),
    `expected the DST transition day in the window, got [${days.join(", ")}]`,
  );
  assert.equal(
    days[days.length - 1],
    "2026-03-10",
    "last bucket must be the local 'today' anchor",
  );
});

test("Task #871 — successful aggregation returns queryFailed=false and errorReason=null", async () => {
  // Pin "now" so the window is deterministic.
  Date.now = () => Date.parse("2026-01-20T12:00:00Z");
  await insertAt("2026-01-19T10:00:00Z");

  const stats = await listFlappingConfigHistoryDailyStats(7, "UTC");
  assert.equal(
    stats.queryFailed,
    false,
    "successful queries must surface queryFailed=false so the admin chart can distinguish them from the SQL-failure fallback",
  );
  assert.equal(
    stats.errorReason,
    null,
    "successful queries must not attach an errorReason",
  );
});

test("Task #865 — invalid IANA time-zone string falls back to UTC bucketing", async () => {
  Date.now = () => Date.parse("2026-01-20T12:00:00Z");

  await insertAt("2026-01-15T05:30:00Z");

  const stats = await listFlappingConfigHistoryDailyStats(
    14,
    "Not/AReal_Zone",
  );
  assert.equal(
    stats.timeZone,
    "UTC",
    "rejected zones must fall back to the UTC default",
  );
  assert.equal(stats.totalCount, 1);
  const hits = stats.buckets.filter((b) => b.count > 0);
  assert.equal(hits.length, 1);
  assert.equal(
    hits[0].day,
    "2026-01-15",
    "fallback must bucket using UTC, matching timeZone=UTC explicitly",
  );
});
