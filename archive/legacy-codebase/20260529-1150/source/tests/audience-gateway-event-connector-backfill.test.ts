/**
 * Tests for the run-once-after-deploy gateway-event connector backfill
 * wrapper (Task #635).
 *
 * Covers the marker-write idempotency, error retry semantics, manual
 * re-run, and admin route exposure of the status.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import {
  GATEWAY_EVENT_CONNECTOR_BACKFILL_SETTING_KEY,
  getGatewayEventConnectorBackfillStatus,
  getGatewayEventConnectorCurrentNullCount,
  resetGatewayEventConnectorBackfillMarkerForTests,
  runGatewayEventConnectorBackfill,
  runGatewayEventConnectorBackfillDryRun,
  runGatewayEventConnectorBackfillOnceOnBoot,
  setGatewayEventConnectorBackfillCurrentNullCountFnForTests,
  setGatewayEventConnectorBackfillRunnerForTests,
} from "../server/services/audience-gateway-event-connector-backfill-service";

beforeEach(async () => {
  setGatewayEventConnectorBackfillRunnerForTests(null);
  setGatewayEventConnectorBackfillCurrentNullCountFnForTests(null);
  await resetGatewayEventConnectorBackfillMarkerForTests();
});

test("status is empty when no marker has been written", async () => {
  const status = await getGatewayEventConnectorBackfillStatus();
  assert.equal(status.ranAt, null);
  assert.equal(status.summary, null);
  assert.equal(status.error, null);
  assert.equal(status.trigger, null);
});

test("on-boot run executes once, persists summary, and is a no-op on second call", async () => {
  let invocations = 0;
  setGatewayEventConnectorBackfillRunnerForTests(async () => {
    invocations++;
    return {
      totalNull: 10,
      matched: 7,
      updated: 7,
      unmatchedNoCommandId: 2,
      unmatchedCommandMissing: 1,
      remainingNull: 3,
      dryRun: false,
    };
  });

  const first = await runGatewayEventConnectorBackfillOnceOnBoot();
  assert.equal(first.ran, true);
  assert.equal(first.status.trigger, "deploy");
  assert.equal(first.status.summary?.updated, 7);
  assert.equal(first.status.summary?.remainingNull, 3);
  assert.equal(first.status.error, null);
  assert.ok(first.status.ranAt);
  assert.equal(invocations, 1);

  const second = await runGatewayEventConnectorBackfillOnceOnBoot();
  assert.equal(second.ran, false);
  assert.equal(second.status.summary?.updated, 7);
  assert.equal(invocations, 1, "second boot must NOT re-invoke the backfill");

  const stored = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, GATEWAY_EVENT_CONNECTOR_BACKFILL_SETTING_KEY));
  assert.equal(stored.length, 1);
  const parsed = JSON.parse(stored[0].value);
  assert.equal(parsed.trigger, "deploy");
  assert.equal(parsed.summary.updated, 7);
});

test("a failed deploy run records the error and retries on the next boot", async () => {
  let invocations = 0;
  setGatewayEventConnectorBackfillRunnerForTests(async () => {
    invocations++;
    if (invocations === 1) {
      throw new Error("supabase down");
    }
    return {
      totalNull: 5,
      matched: 5,
      updated: 5,
      unmatchedNoCommandId: 0,
      unmatchedCommandMissing: 0,
      remainingNull: 0,
      dryRun: false,
    };
  });

  const first = await runGatewayEventConnectorBackfillOnceOnBoot();
  assert.equal(first.ran, true);
  assert.equal(first.status.error, "supabase down");
  assert.equal(first.status.summary, null);

  const second = await runGatewayEventConnectorBackfillOnceOnBoot();
  assert.equal(second.ran, true, "errored prior run must retry on next boot");
  assert.equal(second.status.error, null);
  assert.equal(second.status.summary?.updated, 5);
  assert.equal(invocations, 2);

  const third = await runGatewayEventConnectorBackfillOnceOnBoot();
  assert.equal(third.ran, false, "after a clean run, subsequent boots no-op");
  assert.equal(invocations, 2);
});

test("manual run overwrites the marker with trigger=manual and records triggeredBy (Task #681)", async () => {
  setGatewayEventConnectorBackfillRunnerForTests(async () => ({
    totalNull: 2,
    matched: 2,
    updated: 2,
    unmatchedNoCommandId: 0,
    unmatchedCommandMissing: 0,
    remainingNull: 0,
    dryRun: false,
  }));

  await runGatewayEventConnectorBackfillOnceOnBoot();
  const manual = await runGatewayEventConnectorBackfill("manual", "founder_alice");
  assert.equal(manual.trigger, "manual");
  assert.equal(manual.summary?.updated, 2);
  assert.equal(manual.triggeredBy, "founder_alice");

  const status = await getGatewayEventConnectorBackfillStatus();
  assert.equal(status.trigger, "manual");
  assert.equal(status.triggeredBy, "founder_alice");
});

test("dry run reports counts without persisting a marker (Task #681)", async () => {
  let invocations = 0;
  setGatewayEventConnectorBackfillRunnerForTests(async ({ dryRun }) => {
    invocations++;
    assert.equal(dryRun, true, "dry-run must call the underlying runner with dryRun:true");
    return {
      totalNull: 12,
      matched: 8,
      updated: 0,
      unmatchedNoCommandId: 3,
      unmatchedCommandMissing: 1,
      remainingNull: 12,
      dryRun: true,
    };
  });

  const result = await runGatewayEventConnectorBackfillDryRun("founder_bob");
  assert.equal(result.summary.matched, 8);
  assert.equal(result.summary.updated, 0);
  assert.equal(result.summary.remainingNull, 12);
  assert.equal(result.triggeredBy, "founder_bob");
  assert.equal(invocations, 1);

  const status = await getGatewayEventConnectorBackfillStatus();
  assert.equal(status.ranAt, null, "dry-run must NOT write a marker row");
  assert.equal(status.summary, null);
});

test("currentNullCount returns the live COUNT and tolerates DB errors", async () => {
  setGatewayEventConnectorBackfillCurrentNullCountFnForTests(async () => 42);
  assert.equal(await getGatewayEventConnectorCurrentNullCount(), 42);

  setGatewayEventConnectorBackfillCurrentNullCountFnForTests(async () => 0);
  assert.equal(await getGatewayEventConnectorCurrentNullCount(), 0);

  setGatewayEventConnectorBackfillCurrentNullCountFnForTests(async () => null);
  assert.equal(
    await getGatewayEventConnectorCurrentNullCount(),
    null,
    "DB failure surfaces as null so the dashboard tile never crashes",
  );
});

test("getStatus tolerates a corrupt marker row", async () => {
  await db.insert(systemSettings).values({
    key: GATEWAY_EVENT_CONNECTOR_BACKFILL_SETTING_KEY,
    value: "not-json{{",
    updatedBy: "system",
  });
  const status = await getGatewayEventConnectorBackfillStatus();
  assert.equal(status.ranAt, null);
  assert.equal(status.summary, null);
});
