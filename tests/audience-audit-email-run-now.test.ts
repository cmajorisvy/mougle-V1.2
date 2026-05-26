/**
 * Task #411 — Coverage for the manual "Send Now" audit-email path.
 *
 * Verifies:
 *   1. `audienceAuditEmailScheduler.runNow('manual')` inserts exactly one
 *      `audience_audit_email_runs` row with status 'success' and counts
 *      that mirror `omniChannelAudienceSafetyService.exportAuditTrail`.
 *   2. On a thrown sender, the run row is written with status 'failed' and
 *      the schedule's `lastRunStatus`/`lastRunError` reflect the failure
 *      while `nextRunAt` still advances (scheduler keeps marching).
 *   3. `runNow` throws and POST /email-schedule/run-now returns 400 when
 *      the schedule has no recipients.
 *   4. POST /email-schedule/run-now is gated by `requireRootAdmin` (401
 *      when unauthenticated).
 *   5. Resend is stubbed (no outbound fetch) and the schedule row's
 *      `lastRunAt` / `lastRunStatus` / `nextRunAt` are updated on success.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import {
  audienceAuditEmailRuns,
  audienceAuditEmailSchedules,
  AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID,
} from "../shared/omni-channel-audience-schema";
import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { audienceAuditEmailScheduler } from "../server/services/audience-audit-email-scheduler";
import { emailService } from "../server/services/email-service";
import { requireRootAdmin } from "../server/middleware/admin-auth";

const originalExport = (omniChannelAudienceSafetyService as any).exportAuditTrail.bind(
  omniChannelAudienceSafetyService,
);
const originalSend = emailService.sendAudienceAuditExport.bind(emailService);

const fakeExportPayload = {
  connectors: [
    { connectorId: "c_1", platform: "youtube", accountId: "y", displayName: "y",
      connectionStatus: "connected", apiAccessMode: "read_only", permissions: {} },
    { connectorId: "c_2", platform: "x", accountId: "x", displayName: "x",
      connectionStatus: "connected", apiAccessMode: "read_only", permissions: {} },
  ],
  messages: [
    { messageId: "m1" }, { messageId: "m2" }, { messageId: "m3" }, { messageId: "m4" },
  ],
  decisions: [
    { decisionId: "d1" }, { decisionId: "d2" }, { decisionId: "d3" },
  ],
  commands: [
    { commandId: "cmd1" }, { commandId: "cmd2" },
  ],
  filters: { fromDate: null, toDate: null, platform: null, productionId: null },
  exportedAt: new Date("2026-05-20T12:34:56.789Z").toISOString(),
};

type SendArgs = Parameters<typeof emailService.sendAudienceAuditExport>;
type SendCall = { recipients: SendArgs[0]; payload: SendArgs[1] };

let sendCalls: SendCall[] = [];
let sendImpl: (recipients: SendArgs[0], payload: SendArgs[1]) => Promise<any> =
  async () => ({ id: "mock_email_id" });

let outboundFetchCalls = 0;
let originalFetch: typeof globalThis.fetch;
const isLocalTestUrl = (u: unknown) =>
  typeof u === "string" && u.startsWith("http://127.0.0.1:");

let serverStub: Server;
let baseUrlStub: string;
let serverReal: Server;
let baseUrlReal: string;

before(async () => {
  // Stub exportAuditTrail so the run path doesn't depend on DB content
  // and so we can assert that the persisted counts mirror the export.
  (omniChannelAudienceSafetyService as any).exportAuditTrail = async (filters: any) => ({
    ...fakeExportPayload,
    filters: {
      fromDate: filters?.fromDate ? filters.fromDate.toISOString() : null,
      toDate: filters?.toDate ? filters.toDate.toISOString() : null,
      platform: filters?.platform ?? null,
      productionId: filters?.productionId ?? null,
    },
  });

  // Stub Resend at the email-service boundary — no outbound HTTP.
  (emailService as any).sendAudienceAuditExport = async (
    recipients: SendArgs[0],
    payload: SendArgs[1],
  ) => {
    sendCalls.push({ recipients, payload });
    return sendImpl(recipients, payload);
  };

  // Hard guard against any accidental outbound HTTP during these tests.
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: any[]) => {
    const target = args[0];
    const url = typeof target === "string" ? target : (target as any)?.url;
    if (!isLocalTestUrl(url)) outboundFetchCalls++;
    return originalFetch(...(args as Parameters<typeof fetch>));
  }) as any;

  await audienceAuditEmailScheduler.resetForTests();

  // App #1 — stubbed requireRootAdmin so the success path is exercised.
  const appStub = express();
  appStub.use(express.json());
  const stubRequire: express.RequestHandler = (_req, _res, next) => next();
  registerOmniChannelAudienceRoutes(appStub, stubRequire);
  serverStub = createServer(appStub);
  await new Promise<void>((r) => serverStub.listen(0, "127.0.0.1", r));
  const a1 = serverStub.address();
  if (!a1 || typeof a1 === "string") throw new Error("no address");
  baseUrlStub = `http://127.0.0.1:${a1.port}`;

  // App #2 — REAL requireRootAdmin so the auth-gating assertion is exercised.
  const appReal = express();
  appReal.use(express.json());
  registerOmniChannelAudienceRoutes(appReal, requireRootAdmin);
  serverReal = createServer(appReal);
  await new Promise<void>((r) => serverReal.listen(0, "127.0.0.1", r));
  const a2 = serverReal.address();
  if (!a2 || typeof a2 === "string") throw new Error("no address");
  baseUrlReal = `http://127.0.0.1:${a2.port}`;
});

after(async () => {
  (omniChannelAudienceSafetyService as any).exportAuditTrail = originalExport;
  (emailService as any).sendAudienceAuditExport = originalSend;
  globalThis.fetch = originalFetch;
  await audienceAuditEmailScheduler.resetForTests();
  await new Promise<void>((r) => serverStub.close(() => r()));
  await new Promise<void>((r) => serverReal.close(() => r()));
});

beforeEach(async () => {
  sendCalls = [];
  sendImpl = async () => ({ id: "mock_email_id" });
  outboundFetchCalls = 0;
  await audienceAuditEmailScheduler.resetForTests();
});

test("runNow('manual') inserts exactly one success run with counts matching exportAuditTrail", async () => {
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["compliance@example.com", "ops@example.com"],
  });

  const run = await audienceAuditEmailScheduler.runNow("manual");

  // Run shape mirrors the stubbed export counts.
  assert.equal(run.status, "success");
  assert.equal(run.errorMessage, null);
  assert.equal(run.triggeredBy, "manual");
  assert.equal(run.messageCount, fakeExportPayload.messages.length);
  assert.equal(run.decisionCount, fakeExportPayload.decisions.length);
  assert.equal(run.commandCount, fakeExportPayload.commands.length);
  assert.equal(run.connectorCount, fakeExportPayload.connectors.length);
  assert.deepEqual(run.recipients, ["compliance@example.com", "ops@example.com"]);

  // Exactly one persisted row for this schedule.
  const rows = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].runId, run.runId);
  assert.equal(rows[0].status, "success");
  assert.equal(rows[0].messageCount, fakeExportPayload.messages.length);
  assert.equal(rows[0].decisionCount, fakeExportPayload.decisions.length);
  assert.equal(rows[0].commandCount, fakeExportPayload.commands.length);
  assert.equal(rows[0].connectorCount, fakeExportPayload.connectors.length);
  assert.ok(rows[0].completedAt);

  // Email-service stub was invoked once with the schedule recipients;
  // no real outbound HTTP happened.
  assert.equal(sendCalls.length, 1);
  assert.deepEqual(sendCalls[0].recipients, ["compliance@example.com", "ops@example.com"]);
  assert.equal(sendCalls[0].payload.cadence, "weekly");
  assert.equal(sendCalls[0].payload.triggeredBy, "manual");
  assert.equal(outboundFetchCalls, 0, "Send Now must not trigger outbound fetch");

  // Schedule row's last-run state updated and nextRunAt advanced.
  const [sched] = await db
    .select()
    .from(audienceAuditEmailSchedules)
    .where(eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(sched.lastRunStatus, "success");
  assert.equal(sched.lastRunError, null);
  assert.ok(sched.lastRunAt, "lastRunAt should be set");
  assert.ok(sched.nextRunAt, "nextRunAt should be advanced for enabled schedule");
});

test("runNow('manual') on a thrown sender persists status='failed' with counts and surfaces error on schedule", async () => {
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["compliance@example.com"],
  });

  sendImpl = async () => {
    throw new Error("resend_unavailable");
  };

  const run = await audienceAuditEmailScheduler.runNow("manual");

  assert.equal(run.status, "failed");
  assert.ok(run.errorMessage && run.errorMessage.includes("resend_unavailable"));
  assert.equal(run.triggeredBy, "manual");

  // Counts are captured from the export call before the sender threw.
  assert.equal(run.messageCount, fakeExportPayload.messages.length);
  assert.equal(run.decisionCount, fakeExportPayload.decisions.length);
  assert.equal(run.commandCount, fakeExportPayload.commands.length);
  assert.equal(run.connectorCount, fakeExportPayload.connectors.length);

  const rows = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  assert.ok(rows[0].errorMessage && rows[0].errorMessage.includes("resend_unavailable"));
  assert.ok(rows[0].completedAt);

  const [sched] = await db
    .select()
    .from(audienceAuditEmailSchedules)
    .where(eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(sched.lastRunStatus, "failed");
  assert.ok(sched.lastRunError && sched.lastRunError.includes("resend_unavailable"));
  assert.ok(sched.nextRunAt, "scheduler still advances nextRunAt after failure");
  assert.equal(outboundFetchCalls, 0);
});

test("runNow throws and POST /email-schedule/run-now returns 400 when recipients are empty", async () => {
  await audienceAuditEmailScheduler.getSchedule(); // creates default empty-recipient schedule

  await assert.rejects(
    () => audienceAuditEmailScheduler.runNow("manual"),
    /no recipients/i,
  );
  assert.equal(sendCalls.length, 0);

  const before = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));

  const r = await fetch(`${baseUrlStub}/api/admin/newsroom/audience/email-schedule/run-now`, {
    method: "POST",
  });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.match(String(body.message ?? ""), /no recipients/i);

  // No new run row was written by the failed route call.
  const after = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(after.length, before.length);
  assert.equal(sendCalls.length, 0);
});

test("POST /email-schedule/run-now is gated by requireRootAdmin (401 unauthenticated)", async () => {
  const r = await fetch(`${baseUrlReal}/api/admin/newsroom/audience/email-schedule/run-now`, {
    method: "POST",
  });
  assert.equal(r.status, 401);
  const body = await r.json();
  assert.equal(body.message, "Unauthorized");

  const r2 = await fetch(`${baseUrlReal}/api/admin/omni-channel-audience/email-schedule/run-now`, {
    method: "POST",
  });
  assert.equal(r2.status, 401);

  // Auth-gated routes must never reach the scheduler.
  assert.equal(sendCalls.length, 0);
});

test("POST /email-schedule/run-now returns the persisted run on success and updates schedule state", async () => {
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["compliance@example.com"],
  });

  const r = await fetch(`${baseUrlStub}/api/admin/newsroom/audience/email-schedule/run-now`, {
    method: "POST",
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.run);
  assert.equal(body.run.status, "success");
  assert.equal(body.run.triggeredBy, "manual");
  assert.equal(body.run.messageCount, fakeExportPayload.messages.length);
  assert.equal(body.run.decisionCount, fakeExportPayload.decisions.length);
  assert.equal(body.run.commandCount, fakeExportPayload.commands.length);
  assert.equal(body.run.connectorCount, fakeExportPayload.connectors.length);
  assert.deepEqual(body.run.recipients, ["compliance@example.com"]);

  assert.equal(sendCalls.length, 1);
  assert.equal(outboundFetchCalls, 0);

  const [sched] = await db
    .select()
    .from(audienceAuditEmailSchedules)
    .where(eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID));
  assert.equal(sched.lastRunStatus, "success");
  assert.ok(sched.lastRunAt);
  assert.ok(sched.nextRunAt);
});
