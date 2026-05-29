/**
 * Task #440 — Audience-retention stale-rows backlog alert.
 *
 * Verifies that when any audit table's stale-pending-archive count
 * crosses its configured threshold, a founder `platform_alerts` row
 * fires with the offender details, repeated checks inside the dedup
 * window are suppressed, and the alert auto-resolves once the backlog
 * drops back below threshold.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts, systemSettings } from "@shared/schema";
import {
  AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE,
  AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY,
  DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
  audienceRetentionStaleRowsAlertService,
  getEffectiveStaleRowsThresholds,
  setStaleRowsThresholdOverride,
} from "../server/services/audience-retention-stale-rows-alert-service";

async function clearOurAlerts() {
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE));
}

beforeEach(async () => {
  audienceRetentionStaleRowsAlertService.resetForTests();
  await clearOurAlerts();
  await db
    .delete(systemSettings)
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY,
      ),
    );
  delete process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS;
  delete process.env.AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD;
});

afterEach(async () => {
  await clearOurAlerts();
});

async function openAlerts() {
  return db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
}

test("default threshold is 10,000 rows per table", async () => {
  const eff = await getEffectiveStaleRowsThresholds();
  assert.equal(
    eff.thresholds.messages,
    DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
  );
  assert.equal(
    eff.thresholds.decisions,
    DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
  );
  assert.equal(
    eff.thresholds.commands,
    DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
  );
  assert.equal(eff.override, null);
});

test("env var lowers the default threshold", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD = "500";
  const eff = await getEffectiveStaleRowsThresholds();
  assert.equal(eff.thresholds.messages, 500);
  assert.equal(eff.envFallback, 500);
});

test("admin override beats env, per-table beats default", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD = "500";
  await setStaleRowsThresholdOverride({ default: 1000, messages: 50 }, "tester");
  const eff = await getEffectiveStaleRowsThresholds();
  assert.equal(eff.thresholds.messages, 50);
  assert.equal(eff.thresholds.decisions, 1000);
  assert.equal(eff.thresholds.commands, 1000);
});

test("effective thresholds surface updatedBy + updatedAt from the override row", async () => {
  const before = await getEffectiveStaleRowsThresholds();
  assert.equal(before.updatedBy, null);
  assert.equal(before.updatedAt, null);
  await setStaleRowsThresholdOverride({ default: 2500 }, "founder-1");
  const after = await getEffectiveStaleRowsThresholds();
  assert.equal(after.updatedBy, "founder-1");
  assert.ok(after.updatedAt, "updatedAt should be populated");
  assert.ok(
    !Number.isNaN(new Date(after.updatedAt!).getTime()),
    "updatedAt should be ISO-parseable",
  );
  await setStaleRowsThresholdOverride(null, "founder-1");
  const cleared = await getEffectiveStaleRowsThresholds();
  assert.equal(cleared.override, null);
  assert.equal(cleared.updatedBy, null);
  assert.equal(cleared.updatedAt, null);
});

test("below-threshold backlog does NOT fire an alert", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS = "0";
  await setStaleRowsThresholdOverride({ default: 100 }, "tester");
  const fired = await audienceRetentionStaleRowsAlertService.checkAndNotify({
    stalePendingArchive: { messages: 10, decisions: 5, commands: 0 },
    retentionDays: 90,
    trigger: "scheduled",
  });
  assert.equal(fired, false);
  assert.equal((await openAlerts()).length, 0);
});

test("over-threshold backlog fires a founder alert with offender detail", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS = "0";
  await setStaleRowsThresholdOverride({ default: 100 }, "tester");
  const fired = await audienceRetentionStaleRowsAlertService.checkAndNotify({
    stalePendingArchive: { messages: 500, decisions: 50, commands: 200 },
    retentionDays: 90,
    trigger: "scheduled",
  });
  assert.equal(fired, true);
  const open = await openAlerts();
  assert.equal(open.length, 1);
  assert.match(open[0].message, /stale-rows backlog over threshold/i);
  assert.match(open[0].message, /messages=500\/100/);
  assert.match(open[0].message, /commands=200\/100/);
  const d = (open[0].details as Record<string, any>) ?? {};
  assert.equal(d.source, "audience-retention-stale-rows-alert-service");
  assert.deepEqual(d.offenders.sort(), ["commands", "messages"]);
  assert.equal(d.retentionDays, 90);
  assert.equal(d.trigger, "scheduled");
  assert.equal(d.consecutiveOver, 1);
});

test("repeated over-threshold checks inside dedup window are suppressed", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS = String(60 * 60 * 1000);
  await setStaleRowsThresholdOverride({ default: 100 }, "tester");
  const ctx = {
    stalePendingArchive: { messages: 500, decisions: 0, commands: 0 },
    retentionDays: 90,
    trigger: "scheduled" as const,
  };
  const first = await audienceRetentionStaleRowsAlertService.checkAndNotify(ctx);
  const second = await audienceRetentionStaleRowsAlertService.checkAndNotify(ctx);
  const third = await audienceRetentionStaleRowsAlertService.checkAndNotify(ctx);
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(third, false);
  assert.equal((await openAlerts()).length, 1);
});

test("dedup window of 0 disables suppression", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS = "0";
  await setStaleRowsThresholdOverride({ default: 100 }, "tester");
  const ctx = {
    stalePendingArchive: { messages: 500, decisions: 0, commands: 0 },
    retentionDays: 90,
    trigger: "scheduled" as const,
  };
  assert.equal(await audienceRetentionStaleRowsAlertService.checkAndNotify(ctx), true);
  assert.equal(await audienceRetentionStaleRowsAlertService.checkAndNotify(ctx), true);
  assert.equal((await openAlerts()).length, 2);
});

test("backlog dropping below threshold auto-resolves the open alert", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS = "0";
  await setStaleRowsThresholdOverride({ default: 100 }, "tester");
  await audienceRetentionStaleRowsAlertService.checkAndNotify({
    stalePendingArchive: { messages: 500, decisions: 0, commands: 0 },
    retentionDays: 90,
    trigger: "scheduled",
  });
  const before = await openAlerts();
  assert.equal(before.length, 1);
  const alertId = before[0].id;

  const fired = await audienceRetentionStaleRowsAlertService.checkAndNotify({
    stalePendingArchive: { messages: 5, decisions: 0, commands: 0 },
    retentionDays: 90,
    trigger: "scheduled",
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
  assert.equal(d.autoResolvedTrigger, "scheduled");
});

test("acknowledgeOpenAlerts marks every open backlog alert as acknowledged", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS = "0";
  await setStaleRowsThresholdOverride({ default: 100 }, "tester");
  await audienceRetentionStaleRowsAlertService.checkAndNotify({
    stalePendingArchive: { messages: 500, decisions: 0, commands: 0 },
    retentionDays: 90,
    trigger: "scheduled",
  });
  await audienceRetentionStaleRowsAlertService.checkAndNotify({
    stalePendingArchive: { messages: 600, decisions: 0, commands: 0 },
    retentionDays: 90,
    trigger: "scheduled",
  });
  assert.equal((await openAlerts()).length, 2);

  const ack =
    await audienceRetentionStaleRowsAlertService.acknowledgeOpenAlerts(
      "user_root",
    );
  assert.equal(ack, 2);
  assert.equal((await openAlerts()).length, 0);

  const all = await db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.type, AUDIENCE_RETENTION_STALE_ROWS_ALERT_TYPE));
  for (const row of all) {
    assert.equal(row.acknowledged, true);
    assert.equal(row.acknowledgedBy, "user_root");
    const d = (row.details as Record<string, any>) ?? {};
    assert.equal(d.manuallyAcknowledged, true);
    assert.equal(d.manuallyAcknowledgedBy, "user_root");
  }
});

test("acknowledgeOpenAlerts on a healthy backlog returns 0 and is a no-op", async () => {
  const ack =
    await audienceRetentionStaleRowsAlertService.acknowledgeOpenAlerts(
      "user_root",
    );
  assert.equal(ack, 0);
  assert.equal((await openAlerts()).length, 0);
});

test("acknowledging clears dedup so a fresh backlog can re-alert immediately", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS = String(60 * 60 * 1000);
  await setStaleRowsThresholdOverride({ default: 100 }, "tester");
  const ctx = {
    stalePendingArchive: { messages: 500, decisions: 0, commands: 0 },
    retentionDays: 90,
    trigger: "scheduled" as const,
  };
  assert.equal(
    await audienceRetentionStaleRowsAlertService.checkAndNotify(ctx),
    true,
  );
  // Dedup would normally suppress a second alert in the same window.
  assert.equal(
    await audienceRetentionStaleRowsAlertService.checkAndNotify(ctx),
    false,
  );
  await audienceRetentionStaleRowsAlertService.acknowledgeOpenAlerts(
    "user_root",
  );
  // After acknowledging, the next over-threshold check should fire a
  // fresh alert immediately even though we are still inside the
  // original dedup window.
  assert.equal(
    await audienceRetentionStaleRowsAlertService.checkAndNotify(ctx),
    true,
  );
  assert.equal((await openAlerts()).length, 1);
});

test("threshold of 0 means a table is never flagged regardless of backlog", async () => {
  process.env.AUDIENCE_RETENTION_STALE_ROWS_DEDUP_MS = "0";
  await setStaleRowsThresholdOverride(
    { messages: 0, decisions: 0, commands: 0 },
    "tester",
  );
  const fired = await audienceRetentionStaleRowsAlertService.checkAndNotify({
    stalePendingArchive: { messages: 999_999, decisions: 999_999, commands: 999_999 },
    retentionDays: 90,
    trigger: "manual",
  });
  assert.equal(fired, false);
  assert.equal((await openAlerts()).length, 0);
});
