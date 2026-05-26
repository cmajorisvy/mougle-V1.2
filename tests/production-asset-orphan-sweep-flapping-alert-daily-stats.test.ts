/**
 * Task #872 — Pin the day-bucket math in `listFlappingAlertDailyStats`
 * (the alert-storm overlay rendered on the same chart as Task #865's
 * config-change series). The function currently buckets by hard-coded
 * UTC day; this test locks that contract so:
 *   - A future refactor that flips it to local-time without updating
 *     both the SQL `date_trunc(... AT TIME ZONE 'UTC')` *and* the JS
 *     empty-bucket walker can't silently re-introduce a "spill" bug.
 *   - The empty-bucket walker still produces exactly `windowDays`
 *     buckets that step by one calendar day (no 23h/25h drift), even
 *     when the window straddles a US DST transition.
 *
 * Note: `listFlappingAlertDailyStats` reads wall time via `new Date()`,
 * which V8 does NOT route through `Date.now`, so we can't mock "now"
 * the way Task #865's test does. Instead we anchor expectations to the
 * real current UTC day and insert rows relative to it.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts } from "@shared/schema";
import { listFlappingAlertDailyStats } from "../server/services/production-asset-orphan-alert-service";

const PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE =
  "production_asset_orphan_sweep_flapping";
const PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE =
  "production_asset_orphan_sweep_flapping_digest";

const FLAPPING_TYPES = [
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
];

const DAY_MS = 24 * 60 * 60 * 1000;

async function clear() {
  await db
    .delete(platformAlerts)
    .where(inArray(platformAlerts.type, FLAPPING_TYPES));
}

async function insertAlertAt(
  iso: string,
  kind: "alert" | "digest" = "alert",
) {
  await db.insert(platformAlerts).values({
    type:
      kind === "digest"
        ? PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE
        : PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
    severity: "warning",
    message: "task-872 fixture",
    createdAt: new Date(iso),
  } as any);
}

function utcDayString(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayUtcMidnightMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

beforeEach(async () => {
  await clear();
});

afterEach(async () => {
  await clear();
});

test("Task #872 — boundary alert + digest rows bucket by UTC day (current contract)", async () => {
  const todayMs = todayUtcMidnightMs();
  // Pick a target day two days ago so the window comfortably contains it.
  const targetMs = todayMs - 2 * DAY_MS;
  const targetDay = utcDayString(targetMs);
  const prevDay = utcDayString(targetMs - DAY_MS);

  // 05:30Z on the target day: still the target UTC day, but the previous
  // calendar day in any UTC-08:00 zone like America/Los_Angeles in
  // January. The current contract is UTC bucketing → targetDay.
  const earlyMorningIso = new Date(targetMs + 5 * 3600 * 1000 + 30 * 60 * 1000)
    .toISOString();
  // 23:30Z on the previous day must land in `prevDay`, not `targetDay`,
  // even though it is the same local day in any positive-offset zone.
  const lateEveningIso = new Date(targetMs - 30 * 60 * 1000).toISOString();

  await insertAlertAt(earlyMorningIso, "alert");
  await insertAlertAt(earlyMorningIso, "digest");
  await insertAlertAt(lateEveningIso, "alert");

  const stats = await listFlappingAlertDailyStats(14);
  assert.equal(stats.windowDays, 14);
  assert.equal(stats.totalAlertCount, 2);
  assert.equal(stats.totalDigestCount, 1);
  assert.equal(stats.totalCount, 3);

  const byDay = new Map(stats.buckets.map((b) => [b.day, b]));
  const target = byDay.get(targetDay);
  const prev = byDay.get(prevDay);
  assert.ok(target, `expected bucket for ${targetDay}`);
  assert.ok(prev, `expected bucket for ${prevDay}`);
  assert.equal(target!.alertCount, 1, "05:30Z must bucket as targetDay");
  assert.equal(target!.digestCount, 1);
  assert.equal(target!.total, 2);
  assert.equal(
    prev!.alertCount,
    1,
    "23:30Z of the previous UTC day must NOT spill into targetDay",
  );
  assert.equal(prev!.digestCount, 0);
  assert.equal(prev!.total, 1);
});

test("Task #872 — empty-bucket walker emits exactly windowDays consecutive UTC-day buckets ending today", async () => {
  const windowDays = 10;
  const stats = await listFlappingAlertDailyStats(windowDays);
  assert.equal(stats.windowDays, windowDays);
  assert.equal(
    stats.buckets.length,
    windowDays,
    "walker must emit exactly windowDays buckets",
  );

  const days = stats.buckets.map((b) => b.day);
  for (let i = 1; i < days.length; i++) {
    const prev = Date.parse(`${days[i - 1]}T00:00:00Z`);
    const cur = Date.parse(`${days[i]}T00:00:00Z`);
    assert.equal(
      cur - prev,
      DAY_MS,
      `consecutive buckets must differ by exactly one UTC day: ${days[i - 1]} -> ${days[i]}`,
    );
  }

  const todayMs = todayUtcMidnightMs();
  assert.equal(
    days[days.length - 1],
    utcDayString(todayMs),
    "last bucket must be the UTC 'today' anchor",
  );
  assert.equal(
    days[0],
    utcDayString(todayMs - (windowDays - 1) * DAY_MS),
    "first bucket must be windowDays-1 UTC days before today",
  );
});

test("Task #877 — non-UTC zone buckets boundary rows by the requested local day, not UTC", async () => {
  // The Task #872 fixture used UTC bucketing on purpose to pin the old
  // contract. Task #877 extends `listFlappingAlertDailyStats` with a
  // `timeZone` argument that mirrors `listFlappingConfigHistoryDailyStats`,
  // so a non-UTC founder sees overlay markers anchored to the same local
  // day the underlying changes-per-day series uses. We pick
  // "Asia/Tokyo" (UTC+09:00, no DST) so the offset is deterministic
  // regardless of when the test runs.
  const tz = "Asia/Tokyo";
  const tzOffsetMs = 9 * 3600 * 1000;
  const DAY = DAY_MS;

  // Anchor on Tokyo's "today midnight" so the window comfortably
  // contains every fixture row. Then pick a target *local* day two
  // Tokyo days ago.
  const nowUtcMs = Date.now();
  // Tokyo-local wall-clock for "now" — derive Tokyo midnight today.
  const tokyoNowMs = nowUtcMs + tzOffsetMs;
  const tokyoTodayMidnightUtcMs =
    Math.floor(tokyoNowMs / DAY) * DAY - tzOffsetMs;
  const targetUtcMs = tokyoTodayMidnightUtcMs - 2 * DAY;
  const tokyoDayString = (utcMs: number) => {
    const d = new Date(utcMs + tzOffsetMs);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const targetTokyoDay = tokyoDayString(targetUtcMs);
  const prevTokyoDay = tokyoDayString(targetUtcMs - DAY);

  // 16:30 UTC sits at 01:30 the NEXT day in Tokyo. We place this row
  // 16h30 BEFORE Tokyo-midnight of the target day, so its UTC stamp is
  // on prevTokyoDay in UTC but on targetTokyoDay in Tokyo. UTC bucketing
  // would put it on prevTokyoDay; Tokyo bucketing must put it on
  // targetTokyoDay. This is the boundary that exercises the fix.
  const tokyoLocalIso = new Date(targetUtcMs + 1 * 3600 * 1000 + 30 * 60 * 1000)
    .toISOString();
  // A second row clearly inside targetTokyoDay in both zones (12:00 local).
  const tokyoMiddayIso = new Date(targetUtcMs + 12 * 3600 * 1000).toISOString();

  await insertAlertAt(tokyoLocalIso, "alert");
  await insertAlertAt(tokyoMiddayIso, "digest");

  const stats = await listFlappingAlertDailyStats(14, tz);
  assert.equal(stats.windowDays, 14);
  assert.equal(stats.timeZone, tz);
  assert.equal(stats.totalAlertCount, 1);
  assert.equal(stats.totalDigestCount, 1);
  assert.equal(stats.totalCount, 2);

  const byDay = new Map(stats.buckets.map((b) => [b.day, b]));
  const target = byDay.get(targetTokyoDay);
  assert.ok(target, `expected Tokyo-local bucket for ${targetTokyoDay}`);
  assert.equal(
    target!.alertCount,
    1,
    "boundary row must bucket into targetTokyoDay under Asia/Tokyo, not the UTC prev day",
  );
  assert.equal(target!.digestCount, 1);
  assert.equal(target!.total, 2);

  // The prev-Tokyo-day bucket must exist (the walker still emits a full
  // windowDays-long series) but must contain none of the boundary rows.
  const prev = byDay.get(prevTokyoDay);
  assert.ok(prev, `expected Tokyo-local bucket for ${prevTokyoDay}`);
  assert.equal(prev!.total, 0);

  // The walker must still emit exactly windowDays consecutive local
  // calendar days (mirrors the Task #872 invariant, now in Tokyo).
  assert.equal(stats.buckets.length, 14);
  const days = stats.buckets.map((b) => b.day);
  for (let i = 1; i < days.length; i++) {
    const prevMs = Date.parse(`${days[i - 1]}T00:00:00Z`);
    const curMs = Date.parse(`${days[i]}T00:00:00Z`);
    assert.equal(
      curMs - prevMs,
      DAY,
      `consecutive Tokyo-local buckets must differ by exactly 24h: ${days[i - 1]} -> ${days[i]}`,
    );
  }
  assert.equal(
    days[days.length - 1],
    tokyoDayString(tokyoTodayMidnightUtcMs),
    "last bucket must be Tokyo 'today' anchor, not UTC today",
  );
});

test("Task #872 — DST-straddling window still yields exactly windowDays consecutive UTC-day buckets", async () => {
  // The UTC-day math must be invariant under DST in any local zone.
  // We assert that for the largest supported window (90 days), the
  // returned series is still exactly 90 buckets stepping by 24h.
  // Across 90 days, at least one US DST transition is guaranteed to
  // fall inside the window regardless of when the test runs.
  const windowDays = 90;
  const stats = await listFlappingAlertDailyStats(windowDays);
  assert.equal(
    stats.buckets.length,
    windowDays,
    "DST-straddling window must still emit exactly windowDays buckets",
  );
  const days = stats.buckets.map((b) => b.day);
  for (let i = 1; i < days.length; i++) {
    const prev = Date.parse(`${days[i - 1]}T00:00:00Z`);
    const cur = Date.parse(`${days[i]}T00:00:00Z`);
    assert.equal(
      cur - prev,
      DAY_MS,
      `consecutive UTC days must differ by exactly 24h across DST: ${days[i - 1]} -> ${days[i]}`,
    );
  }
});
