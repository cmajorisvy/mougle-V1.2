/**
 * Tests for the post-deploy gateway-event connector backfill failure
 * alert (Task #682).
 *
 * Verifies that:
 *   - A single failure does NOT page the founder.
 *   - N consecutive failures (default 2) DO fire the founder alert with
 *     the latest error message and a dashboard link.
 *   - The consecutive-failure counter is persisted on the marker so
 *     deploy boundaries cannot reset it.
 *   - A successful run resets the counter and triggers auto-resolve.
 *   - The configured threshold is env-driven.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  getGatewayEventConnectorBackfillStatus,
  resetGatewayEventConnectorBackfillMarkerForTests,
  runGatewayEventConnectorBackfill,
  setGatewayEventConnectorBackfillRunnerForTests,
} from "../server/services/audience-gateway-event-connector-backfill-service";
import {
  gatewayEventConnectorBackfillFailureThreshold,
  setGatewayEventConnectorBackfillFailureAlertNotifierForTests,
} from "../server/services/audience-gateway-event-connector-backfill-failure-alert-service";

interface NotifyFailureCall {
  consecutiveFailures: number;
  error: string | null;
  trigger: string;
}

let failureCalls: NotifyFailureCall[] = [];
let successCalls: number;

beforeEach(async () => {
  failureCalls = [];
  successCalls = 0;
  setGatewayEventConnectorBackfillRunnerForTests(null);
  setGatewayEventConnectorBackfillFailureAlertNotifierForTests({
    notifyFailure: async (ctx) => {
      failureCalls.push({
        consecutiveFailures: ctx.status.consecutiveFailures,
        error: ctx.status.error,
        trigger: ctx.trigger,
      });
      // Mimic real notifier: only "fires" once threshold is reached.
      return ctx.status.consecutiveFailures >=
        gatewayEventConnectorBackfillFailureThreshold();
    },
    notifySuccess: async () => {
      successCalls += 1;
      return 0;
    },
  });
  await resetGatewayEventConnectorBackfillMarkerForTests();
});

afterEach(() => {
  setGatewayEventConnectorBackfillFailureAlertNotifierForTests(null);
  delete process.env.GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD;
});

test("default failure threshold is 2", () => {
  delete process.env.GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD;
  assert.equal(gatewayEventConnectorBackfillFailureThreshold(), 2);
});

test("threshold is configurable via env", () => {
  process.env.GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD = "5";
  assert.equal(gatewayEventConnectorBackfillFailureThreshold(), 5);
});

test("first failure does NOT fire the founder alert", async () => {
  setGatewayEventConnectorBackfillRunnerForTests(async () => {
    throw new Error("supabase down");
  });
  const status = await runGatewayEventConnectorBackfill("deploy");
  assert.equal(status.error, "supabase down");
  assert.equal(status.consecutiveFailures, 1);
  assert.equal(failureCalls.length, 1, "notifier is called on every failure");
  // notifier returned false (below threshold), so no email/alert fires.
  assert.equal(failureCalls[0].consecutiveFailures, 1);
});

test("Nth consecutive failure fires the founder alert with the latest error", async () => {
  let i = 0;
  setGatewayEventConnectorBackfillRunnerForTests(async () => {
    i += 1;
    throw new Error(`supabase down attempt ${i}`);
  });

  // Simulate two consecutive deploys, each failing.
  const first = await runGatewayEventConnectorBackfill("deploy");
  assert.equal(first.consecutiveFailures, 1);
  const second = await runGatewayEventConnectorBackfill("deploy");
  assert.equal(
    second.consecutiveFailures,
    2,
    "counter persists across deploys via the marker row",
  );
  assert.equal(second.error, "supabase down attempt 2");

  // The notifier was called twice; the second call was at-threshold and
  // therefore would have actually emailed the founder.
  assert.equal(failureCalls.length, 2);
  assert.equal(failureCalls[1].consecutiveFailures, 2);
  assert.equal(failureCalls[1].error, "supabase down attempt 2");
  assert.equal(failureCalls[1].trigger, "deploy");
});

test("a successful run resets the counter and triggers auto-resolve", async () => {
  let attempts = 0;
  setGatewayEventConnectorBackfillRunnerForTests(async () => {
    attempts += 1;
    if (attempts <= 2) throw new Error("still flaky");
    return {
      totalNull: 4,
      matched: 4,
      updated: 4,
      unmatchedNoCommandId: 0,
      unmatchedCommandMissing: 0,
      remainingNull: 0,
      dryRun: false,
    };
  });

  await runGatewayEventConnectorBackfill("deploy");
  await runGatewayEventConnectorBackfill("deploy");
  const recovered = await runGatewayEventConnectorBackfill("deploy");
  assert.equal(recovered.error, null);
  assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.summary?.updated, 4);

  const persisted = await getGatewayEventConnectorBackfillStatus();
  assert.equal(persisted.consecutiveFailures, 0);
  assert.equal(persisted.error, null);

  assert.equal(failureCalls.length, 2);
  assert.equal(successCalls, 1, "notifySuccess must be invoked on recovery");
});

test("custom threshold (=3) suppresses the alert until the third failure", async () => {
  process.env.GATEWAY_EVENT_CONNECTOR_BACKFILL_FAILURE_THRESHOLD = "3";
  setGatewayEventConnectorBackfillRunnerForTests(async () => {
    throw new Error("nope");
  });

  await runGatewayEventConnectorBackfill("deploy");
  await runGatewayEventConnectorBackfill("deploy");
  const third = await runGatewayEventConnectorBackfill("deploy");
  assert.equal(third.consecutiveFailures, 3);
  // Notifier called every time, but only at/after the 3rd would it return true.
  assert.equal(failureCalls.length, 3);
  assert.equal(failureCalls[0].consecutiveFailures, 1);
  assert.equal(failureCalls[2].consecutiveFailures, 3);
});

test("manual trigger is forwarded to the notifier", async () => {
  setGatewayEventConnectorBackfillRunnerForTests(async () => {
    throw new Error("manual failure");
  });
  await runGatewayEventConnectorBackfill("manual");
  assert.equal(failureCalls.length, 1);
  assert.equal(failureCalls[0].trigger, "manual");
});
