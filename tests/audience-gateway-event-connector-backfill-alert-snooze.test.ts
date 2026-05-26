/**
 * Task #694 — Founder-controlled snooze for the post-deploy gateway-event
 * connector backfill failure alert.
 *
 * Verifies that:
 *   - A snoozed alert short-circuits notifyFailure (no email, no
 *     `platform_alerts` row) but the persisted `consecutiveFailures`
 *     counter still ticks so the first post-snooze send is accurate.
 *   - Once the snooze window has elapsed, the next at-threshold failure
 *     fires the alert again.
 *   - Setting a snooze logs an audit row; clearing an active snooze logs
 *     a `cleared` row; the dashboard reads newest-first via
 *     `listGatewayEventConnectorBackfillAlertSnoozeHistory`.
 *   - Invalid / past timestamps are rejected; null clears.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import {
  audienceAuditEmailFailureAlertSnoozes,
  platformAlerts,
  systemSettings,
} from "@shared/schema";
import {
  GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_SNOOZE_KEY,
  GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_TYPE,
  gatewayEventConnectorBackfillFailureAlertService,
  getGatewayEventConnectorBackfillAlertSnooze,
  listGatewayEventConnectorBackfillAlertSnoozeHistory,
  setGatewayEventConnectorBackfillAlertSnooze,
} from "../server/services/audience-gateway-event-connector-backfill-failure-alert-service";
import {
  getGatewayEventConnectorBackfillStatus,
  resetGatewayEventConnectorBackfillMarkerForTests,
  runGatewayEventConnectorBackfill,
  setGatewayEventConnectorBackfillRunnerForTests,
} from "../server/services/audience-gateway-event-connector-backfill-service";
import { EmailService } from "../server/services/email-service";

const originalSendAdminAlert = EmailService.prototype.sendAdminAlert;
let adminAlertCalls = 0;
(EmailService.prototype as any).sendAdminAlert = async () => {
  adminAlertCalls += 1;
  return { id: "mock_email_id" };
};
process.on("exit", () => {
  (EmailService.prototype as any).sendAdminAlert = originalSendAdminAlert;
});

async function cleanup() {
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_TYPE));
  await db
    .delete(systemSettings)
    .where(
      eq(systemSettings.key, GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_SNOOZE_KEY),
    );
  await db
    .delete(audienceAuditEmailFailureAlertSnoozes)
    .where(
      eq(
        audienceAuditEmailFailureAlertSnoozes.alertKey,
        GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_SNOOZE_KEY,
      ),
    );
  await resetGatewayEventConnectorBackfillMarkerForTests();
}

beforeEach(async () => {
  adminAlertCalls = 0;
  await cleanup();
  setGatewayEventConnectorBackfillRunnerForTests(null);
  delete process.env.GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD;
});

afterEach(async () => {
  setGatewayEventConnectorBackfillRunnerForTests(null);
  await cleanup();
});

test("snooze: invalid + past timestamps rejected, future accepted, null clears", async () => {
  await assert.rejects(
    setGatewayEventConnectorBackfillAlertSnooze({ snoozeUntil: "not-a-date" }),
    /invalid snoozeUntil/,
  );
  await assert.rejects(
    setGatewayEventConnectorBackfillAlertSnooze({
      snoozeUntil: new Date(Date.now() - 1000).toISOString(),
    }),
    /must be in the future/,
  );
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const c1 = await setGatewayEventConnectorBackfillAlertSnooze({
    snoozeUntil: future,
    updatedBy: "founder@example.com",
  });
  assert.ok(c1.snoozeUntil);
  assert.equal(c1.updatedBy, "founder@example.com");
  const c2 = await setGatewayEventConnectorBackfillAlertSnooze({
    snoozeUntil: null,
  });
  assert.equal(c2.snoozeUntil, null);
});

test("snooze: notifyFailure short-circuits while snoozed (no email, no platform_alerts)", async () => {
  process.env.GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD = "1";
  await setGatewayEventConnectorBackfillAlertSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    updatedBy: "founder@example.com",
  });
  const before = adminAlertCalls;

  const fired = await gatewayEventConnectorBackfillFailureAlertService.notifyFailure({
    status: {
      ranAt: new Date().toISOString(),
      version: 1,
      trigger: "deploy",
      summary: null,
      error: "supabase maintenance",
      consecutiveFailures: 3,
      triggeredBy: null,
    },
    trigger: "deploy",
  });
  assert.equal(fired, false, "snoozed notifyFailure must return false");
  assert.equal(adminAlertCalls, before, "no admin email sent while snoozed");
  const open = await db
    .select()
    .from(platformAlerts)
    .where(
      eq(platformAlerts.type, GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_TYPE),
    );
  assert.equal(open.length, 0, "no platform_alerts row written while snoozed");
});

test("snooze: persisted consecutiveFailures counter ticks even while snoozed", async () => {
  process.env.GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD = "2";
  await setGatewayEventConnectorBackfillAlertSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    updatedBy: "founder@example.com",
  });
  setGatewayEventConnectorBackfillRunnerForTests(async () => {
    throw new Error("supabase down");
  });
  await runGatewayEventConnectorBackfill("deploy");
  await runGatewayEventConnectorBackfill("deploy");
  await runGatewayEventConnectorBackfill("deploy");
  const persisted = await getGatewayEventConnectorBackfillStatus();
  assert.equal(
    persisted.consecutiveFailures,
    3,
    "counter must persist across runs even while alert is snoozed",
  );
  assert.equal(adminAlertCalls, 0, "snoozed runs must not email anyone");
  const open = await db
    .select()
    .from(platformAlerts)
    .where(
      eq(platformAlerts.type, GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_TYPE),
    );
  assert.equal(open.length, 0, "no platform_alerts written under snooze");
});

test("snooze: alerts resume once the window has elapsed and carry the real counter", async () => {
  process.env.GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD = "1";
  // Seed an expired snooze directly (cannot setSnooze a past timestamp).
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  await db
    .insert(systemSettings)
    .values({
      key: GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_SNOOZE_KEY,
      value: JSON.stringify({
        snoozeUntil: past,
        updatedAt: past,
        updatedBy: "founder",
      }),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: JSON.stringify({
          snoozeUntil: past,
          updatedAt: past,
          updatedBy: "founder",
        }),
      },
    });

  const fired = await gatewayEventConnectorBackfillFailureAlertService.notifyFailure({
    status: {
      ranAt: new Date().toISOString(),
      version: 1,
      trigger: "deploy",
      summary: null,
      error: "still down after window",
      consecutiveFailures: 5,
      triggeredBy: null,
    },
    trigger: "deploy",
  });
  assert.equal(fired, true, "expired snooze must not suppress the alert");
  const open = await db
    .select()
    .from(platformAlerts)
    .where(
      eq(platformAlerts.type, GATEWAY_EVENT_CONNECTOR_BACKFILL_ALERT_TYPE),
    );
  assert.equal(open.length, 1, "alert fires after the snooze window elapses");
  const details = open[0].details as Record<string, any>;
  assert.equal(
    details.consecutiveFailures,
    5,
    "first post-snooze send carries the real persisted counter",
  );
});

test("snooze history: set + cleared actions are logged newest-first", async () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await setGatewayEventConnectorBackfillAlertSnooze({
    snoozeUntil: future,
    updatedBy: "founder@example.com",
  });
  await setGatewayEventConnectorBackfillAlertSnooze({
    snoozeUntil: null,
    updatedBy: "founder@example.com",
  });
  const history = await listGatewayEventConnectorBackfillAlertSnoozeHistory(10);
  assert.ok(history.length >= 2, "expected both set + cleared rows logged");
  assert.equal(history[0].action, "cleared", "newest first");
  assert.equal(history[1].action, "set");
  assert.equal(history[1].updatedBy, "founder@example.com");
  // The live snooze row is back to null.
  const live = await getGatewayEventConnectorBackfillAlertSnooze();
  assert.equal(live.snoozeUntil, null);
});
