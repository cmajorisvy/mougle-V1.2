import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import {
  audienceAuditEmailRuns,
  audienceAuditEmailSchedules,
  AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID,
} from "../shared/omni-channel-audience-schema";
import { audienceAuditEmailScheduler } from "../server/services/audience-audit-email-scheduler";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { emailService } from "../server/services/email-service";

type SendArgs = Parameters<typeof emailService.sendAudienceAuditExport>;
type SendCall = { recipients: SendArgs[0]; payload: SendArgs[1] };

const originalSend = emailService.sendAudienceAuditExport.bind(emailService);
let sendCalls: SendCall[] = [];
let sendImpl: (recipients: SendArgs[0], payload: SendArgs[1]) => Promise<any> =
  async () => ({ id: "mock_email_id" });

(emailService as any).sendAudienceAuditExport = async (
  recipients: SendArgs[0],
  payload: SendArgs[1],
) => {
  sendCalls.push({ recipients, payload });
  return sendImpl(recipients, payload);
};

beforeEach(async () => {
  sendCalls = [];
  sendImpl = async () => ({ id: "mock_email_id" });
  await omniChannelAudienceSafetyService.reset();
  await audienceAuditEmailScheduler.resetForTests();
});

afterEach(() => {
  sendImpl = async () => ({ id: "mock_email_id" });
});

process.on("exit", () => {
  (emailService as any).sendAudienceAuditExport = originalSend;
});

/* 1 */
test("upsertSchedule normalizes recipients (trim/lowercase/dedupe)", async () => {
  const sched = await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["  Ops@Example.com ", "ops@example.com", "audit@example.com"],
  });
  assert.deepEqual(sched.recipients, ["ops@example.com", "audit@example.com"]);
  assert.equal(sched.enabled, true);
  assert.equal(sched.cadence, "weekly");
  assert.ok(sched.nextRunAt, "nextRunAt should be set when enabled");
});

/* 2 */
test("upsertSchedule rejects enabling with no recipients", async () => {
  await assert.rejects(
    () =>
      audienceAuditEmailScheduler.upsertSchedule({
        enabled: true,
        cadence: "weekly",
        recipients: ["   "],
      }),
    /at least one recipient/i,
  );
});

/* 3 */
test("upsertSchedule clears nextRunAt when disabling", async () => {
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  const disabled = await audienceAuditEmailScheduler.upsertSchedule({
    enabled: false,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.nextRunAt, null);
});

/* 4 */
test("runNow without recipients throws and does not call email service", async () => {
  await audienceAuditEmailScheduler.getSchedule(); // creates default empty schedule
  await assert.rejects(
    () => audienceAuditEmailScheduler.runNow("manual"),
    /no recipients/i,
  );
  assert.equal(sendCalls.length, 0);
});

/* 5 */
test("runNow success persists a run row and calls the email service with computed weekly window", async () => {
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com", "audit@example.com"],
  });

  const before = Date.now();
  const run = await audienceAuditEmailScheduler.runNow("manual");
  const after = Date.now();

  assert.equal(run.status, "success");
  assert.equal(run.errorMessage, null);
  assert.equal(run.triggeredBy, "manual");
  assert.equal(run.cadence, "weekly");
  assert.deepEqual(run.recipients, ["ops@example.com", "audit@example.com"]);

  const windowFromMs = new Date(run.windowFrom).getTime();
  const windowToMs = new Date(run.windowTo).getTime();
  assert.ok(windowToMs >= before && windowToMs <= after, "windowTo near now");
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  assert.ok(
    Math.abs(windowToMs - windowFromMs - weekMs) < 1000,
    `weekly window should be ~7 days; got ${windowToMs - windowFromMs}`,
  );

  // Run row persisted with completion details
  const rows = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.runId, run.runId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "success");
  assert.ok(rows[0].completedAt);

  // Schedule's last-run state updated
  const [schedRow] = await db
    .select()
    .from(audienceAuditEmailSchedules)
    .where(eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(schedRow.lastRunStatus, "success");
  assert.equal(schedRow.lastRunError, null);
  assert.ok(schedRow.lastRunAt);
  assert.ok(schedRow.nextRunAt, "nextRunAt should be advanced for enabled schedule");

  // Email service got the right inputs
  assert.equal(sendCalls.length, 1);
  const [call] = sendCalls;
  assert.deepEqual(call.recipients, ["ops@example.com", "audit@example.com"]);
  assert.equal(call.payload.cadence, "weekly");
  assert.equal(call.payload.triggeredBy, "manual");
  assert.ok(call.payload.jsonFilename.endsWith(".json"));
  assert.ok(call.payload.csvFilename.endsWith(".csv"));
  assert.ok(call.payload.jsonContent.includes("platformSendAllowed"));
  assert.equal(typeof call.payload.csvContent, "string");
});

/* 6 */
test("runNow failure still writes a failed run row and surfaces error on schedule", async () => {
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });

  sendImpl = async () => {
    throw new Error("resend_down");
  };

  const run = await audienceAuditEmailScheduler.runNow("manual");

  assert.equal(run.status, "failed");
  assert.ok(run.errorMessage && run.errorMessage.includes("resend_down"));

  const [persisted] = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.runId, run.runId));
  assert.equal(persisted.status, "failed");
  assert.ok(persisted.errorMessage && persisted.errorMessage.includes("resend_down"));
  assert.ok(persisted.completedAt);

  const [sched] = await db
    .select()
    .from(audienceAuditEmailSchedules)
    .where(eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(sched.lastRunStatus, "failed");
  assert.ok(sched.lastRunError && sched.lastRunError.includes("resend_down"));
  assert.ok(sched.nextRunAt, "scheduler keeps marching forward after a failure");
});

/* 7 */
test("tick is a no-op when disabled or when nextRunAt is in the future", async () => {
  // Disabled: should not call email service even if recipients exist
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: false,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  await audienceAuditEmailScheduler.tick();
  assert.equal(sendCalls.length, 0);

  // Enabled but next run in the future
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  // Force a future nextRunAt directly
  const future = new Date(Date.now() + 60 * 60 * 1000);
  await db
    .update(audienceAuditEmailSchedules)
    .set({ nextRunAt: future })
    .where(eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));

  await audienceAuditEmailScheduler.tick();
  assert.equal(sendCalls.length, 0);

  const runs = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(runs.length, 0);
});

/* 8 */
test("tick executes a scheduler-triggered run when due", async () => {
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  // Force nextRunAt into the past so tick fires now
  await db
    .update(audienceAuditEmailSchedules)
    .set({ nextRunAt: new Date(Date.now() - 1000) })
    .where(eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));

  await audienceAuditEmailScheduler.tick();

  assert.equal(sendCalls.length, 1);
  const runs = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(runs.length, 1);
  assert.equal(runs[0].triggeredBy, "scheduler");
  assert.equal(runs[0].status, "success");
  assert.equal(runs[0].isTest, false);
});

/* 9 — Task #416 */
test("sendTestNow persists isTest=true; runNow persists isTest=false", async () => {
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });

  const real = await audienceAuditEmailScheduler.runNow("manual");
  assert.equal(real.isTest, false);

  const testRun = await audienceAuditEmailScheduler.sendTestNow("Founder@Example.com");
  assert.equal(testRun.isTest, true);
  assert.deepEqual(testRun.recipients, ["founder@example.com"]);
  assert.equal(testRun.triggeredBy, "manual");

  const [realRow] = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.runId, real.runId));
  assert.equal(realRow.isTest, false);

  const [testRow] = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.runId, testRun.runId));
  assert.equal(testRow.isTest, true);
});
