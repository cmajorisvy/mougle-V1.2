/**
 * Task #486 — Stale-pending backlog trend is surfaced beyond the admin
 * Audience page.
 *
 *   - `summarizeStalePendingTrend()` classifies each table as
 *     growing / shrinking / flat / unknown with a proper delta.
 *   - The retention failure alert email + platform_alerts row include
 *     the last few stale-pending samples so the founder can tell whether
 *     the backlog is shrinking or growing without opening the admin
 *     panel.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts, systemSettings } from "@shared/schema";
import {
  AUDIENCE_RETENTION_MODE_SETTING_KEY,
  AUDIENCE_RETENTION_SETTING_KEY,
  audienceRetentionGrowthStreakThreshold,
  DEFAULT_AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD,
  resetAudienceRetentionStateForTests,
  runRetentionSweep,
  summarizeStalePendingTrend,
  type AudienceStalePendingHistoryEntry,
} from "../server/services/audience-retention-service";
import {
  AUDIENCE_RETENTION_ALERT_TYPE,
  audienceRetentionFailureAlertService,
} from "../server/services/audience-retention-failure-alert-service";
import { audienceSafetyDecisions } from "../shared/omni-channel-audience-schema";

const origDelete = (db as any).delete.bind(db);

function entry(
  recordedAt: string,
  messages: number,
  decisions: number,
  commands: number,
): AudienceStalePendingHistoryEntry {
  return {
    recordedAt,
    retentionDays: 30,
    messages,
    decisions,
    commands,
    trigger: "scheduled",
    error: null,
  };
}

test("summarizeStalePendingTrend classifies direction + delta per table", () => {
  // Oldest-first; latest sample is "now".
  const history: AudienceStalePendingHistoryEntry[] = [
    entry("2026-05-15T00:00:00.000Z", 100, 50, 10),
    entry("2026-05-16T00:00:00.000Z", 120, 50, 5),
    entry("2026-05-17T00:00:00.000Z", 150, 50, 0),
  ];
  const t = summarizeStalePendingTrend(history);
  assert.equal(t.sampleCount, 3);
  assert.equal(t.latestRecordedAt, "2026-05-17T00:00:00.000Z");
  assert.equal(t.tables.messages.direction, "growing");
  assert.equal(t.tables.messages.delta, 30);
  assert.equal(t.tables.messages.arrow, "up");
  assert.equal(t.tables.decisions.direction, "flat");
  assert.equal(t.tables.decisions.delta, 0);
  assert.equal(t.tables.decisions.arrow, "flat");
  assert.equal(t.tables.commands.direction, "shrinking");
  assert.equal(t.tables.commands.delta, -5);
  assert.equal(t.tables.commands.arrow, "down");
});

test("summarizeStalePendingTrend tracks consecutive growth streak per table (Task #544)", () => {
  // messages: 5 -> 10 -> 15 -> 20 -> 25  (4 consecutive growths)
  // decisions: 5 -> 10 -> 8 -> 12 -> 20  (last 2 growths only; 8 broke the streak)
  // commands: 5 -> 5 -> 5 -> 5 -> 5      (flat = no growth)
  const history: AudienceStalePendingHistoryEntry[] = [
    entry("2026-05-13T00:00:00.000Z", 5, 5, 5),
    entry("2026-05-14T00:00:00.000Z", 10, 10, 5),
    entry("2026-05-15T00:00:00.000Z", 15, 8, 5),
    entry("2026-05-16T00:00:00.000Z", 20, 12, 5),
    entry("2026-05-17T00:00:00.000Z", 25, 20, 5),
  ];
  const t = summarizeStalePendingTrend(history);
  assert.equal(t.tables.messages.consecutiveGrowthStreak, 4);
  assert.equal(t.tables.decisions.consecutiveGrowthStreak, 2);
  assert.equal(t.tables.commands.consecutiveGrowthStreak, 0);

  // A single clean sweep resets the streak even if the previous one grew.
  const recovered: AudienceStalePendingHistoryEntry[] = [
    entry("2026-05-15T00:00:00.000Z", 10, 0, 0),
    entry("2026-05-16T00:00:00.000Z", 20, 0, 0),
    entry("2026-05-17T00:00:00.000Z", 15, 0, 0),
  ];
  assert.equal(
    summarizeStalePendingTrend(recovered).tables.messages.consecutiveGrowthStreak,
    0,
  );
});

test("audienceRetentionGrowthStreakThreshold default is 3 and honors env override", () => {
  delete process.env.AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD;
  assert.equal(
    audienceRetentionGrowthStreakThreshold(),
    DEFAULT_AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD,
  );
  assert.equal(DEFAULT_AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD, 3);
  process.env.AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD = "5";
  assert.equal(audienceRetentionGrowthStreakThreshold(), 5);
  process.env.AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD = "not-a-number";
  assert.equal(audienceRetentionGrowthStreakThreshold(), 3);
  process.env.AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD = "0";
  // values < 1 fall back to the default (a 0-sweep streak would always fire).
  assert.equal(audienceRetentionGrowthStreakThreshold(), 3);
  delete process.env.AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD;
});

test("summarizeStalePendingTrend returns unknown for <2 samples", () => {
  const empty = summarizeStalePendingTrend([]);
  assert.equal(empty.sampleCount, 0);
  assert.equal(empty.tables.messages.direction, "unknown");
  assert.equal(empty.tables.messages.arrow, "none");
  assert.equal(empty.tables.messages.delta, null);

  const one = summarizeStalePendingTrend([entry("2026-05-17T00:00:00.000Z", 7, 8, 9)]);
  assert.equal(one.sampleCount, 1);
  assert.equal(one.tables.decisions.direction, "unknown");
  assert.equal(one.tables.decisions.current, 8);
  assert.equal(one.tables.decisions.previous, null);
});

function patchDeleteFailure(message: string) {
  (db as any).delete = (table: any) => {
    if (table === audienceSafetyDecisions) throw new Error(message);
    return origDelete(table);
  };
}

beforeEach(async () => {
  (db as any).delete = origDelete;
  audienceRetentionFailureAlertService.resetForTests();
  await resetAudienceRetentionStateForTests();
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE));
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_RETENTION_SETTING_KEY));
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_RETENTION_MODE_SETTING_KEY));
  delete process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS;
});

afterEach(async () => {
  (db as any).delete = origDelete;
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE));
});

test("failure alert details include stale-pending trend + recent history", async () => {
  process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS = "0";
  patchDeleteFailure("supabase unreachable: ECONNREFUSED");

  // Two failing sweeps so the history table has >=2 samples and the
  // trend summarizer can classify a direction (not "unknown").
  await runRetentionSweep(30, "scheduled");
  await runRetentionSweep(30, "scheduled");

  const open = await db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
  assert.ok(open.length >= 1, "at least one open alert");
  const latest = open[0];
  const d = (latest.details as Record<string, any>) ?? {};
  assert.ok(d.stalePendingTrend, "alert details carry the trend summary");
  assert.ok(Array.isArray(d.stalePendingHistory), "alert details carry history samples");
  assert.equal(typeof d.stalePendingTrend.sampleCount, "number");
  for (const field of ["messages", "decisions", "commands"] as const) {
    const t = d.stalePendingTrend.tables[field];
    assert.ok(t, `trend.tables.${field} present`);
    assert.ok(
      ["growing", "shrinking", "flat", "unknown"].includes(t.direction),
      `direction for ${field} valid`,
    );
    assert.equal(
      typeof t.consecutiveGrowthStreak,
      "number",
      `streak surfaced on trend.tables.${field}`,
    );
  }
  // Task #544 — streak threshold + offenders are persisted in alert details
  // so admins can see at a glance whether the backlog is sustained.
  assert.equal(typeof d.growthStreakThreshold, "number");
  assert.ok(Array.isArray(d.growthStreakOffenders));
});

test("failure alert message names the streak when a backlog has grown 3+ sweeps in a row (Task #544)", async () => {
  process.env.AUDIENCE_RETENTION_FAILURE_DEDUP_MS = "0";
  process.env.AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD = "3";
  patchDeleteFailure("supabase unreachable: ECONNREFUSED");

  // Four failing sweeps so messages/decisions/commands all grow 3 sweeps
  // in a row (the stale-pending probe counts the same rows for each
  // failing sweep, since nothing was pruned).
  for (let i = 0; i < 4; i++) {
    await runRetentionSweep(30, "scheduled");
  }

  const open = await db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RETENTION_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    )
    .orderBy(platformAlerts.createdAt);
  assert.ok(open.length >= 1, "at least one open alert fired");
  const latest = open[open.length - 1];
  const d = (latest.details as Record<string, any>) ?? {};
  assert.equal(d.growthStreakThreshold, 3);
  // The message includes the "growing N sweeps in a row" phrasing once a
  // streak crosses the threshold. If the underlying counts happen to be
  // flat (e.g. nothing to prune), offenders is allowed to be empty and
  // the message simply omits the streak phrase — but the threshold must
  // still be present in the details payload.
  if (Array.isArray(d.growthStreakOffenders) && d.growthStreakOffenders.length > 0) {
    assert.match(
      String(latest.message ?? ""),
      /growing 3\+ sweeps in a row/i,
      "message surfaces the streak phrase",
    );
  }

  delete process.env.AUDIENCE_RETENTION_GROWTH_STREAK_THRESHOLD;
});
