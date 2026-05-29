import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";
import { createServer, type Server } from "http";
import express from "express";

import { db } from "../server/db";
import {
  audienceAuditEmailRuns,
  audienceAuditEmailSchedules,
  audienceAuditExports,
  AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID,
} from "../shared/omni-channel-audience-schema";
import { audienceAuditHistoryEmailScheduler } from "../server/services/audience-audit-history-email-scheduler";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { emailService } from "../server/services/email-service";
import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";

type SendArgs = Parameters<typeof emailService.sendAudienceAuditHistoryExport>;
type SendCall = { recipients: SendArgs[0]; payload: SendArgs[1] };

const originalSend = emailService.sendAudienceAuditHistoryExport.bind(emailService);
let sendCalls: SendCall[] = [];
let sendImpl: (recipients: SendArgs[0], payload: SendArgs[1]) => Promise<any> =
  async () => ({ id: "mock_email_id" });

(emailService as any).sendAudienceAuditHistoryExport = async (
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
  // Reset audit-export meta table so we can assert the per-send log rows
  await db.delete(audienceAuditExports);
  await audienceAuditHistoryEmailScheduler.resetForTests();
});

afterEach(() => {
  sendImpl = async () => ({ id: "mock_email_id" });
});

process.on("exit", () => {
  (emailService as any).sendAudienceAuditHistoryExport = originalSend;
});

/* 1 */
test("upsertSchedule normalizes recipients and writes history scheduleId", async () => {
  const sched = await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["  Ops@Example.com ", "ops@example.com", "audit@example.com"],
  });
  assert.equal(sched.scheduleId, AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID);
  assert.deepEqual(sched.recipients, ["ops@example.com", "audit@example.com"]);
  assert.equal(sched.enabled, true);
  assert.equal(sched.cadence, "weekly");
  assert.ok(sched.nextRunAt);
});

/* 2 */
test("upsertSchedule rejects enabling with no recipients", async () => {
  await assert.rejects(
    () =>
      audienceAuditHistoryEmailScheduler.upsertSchedule({
        enabled: true,
        cadence: "monthly",
        recipients: ["  "],
      }),
    /at least one recipient/i,
  );
});

/* 3 */
test("runNow without recipients throws and does not call email service", async () => {
  await audienceAuditHistoryEmailScheduler.getSchedule();
  await assert.rejects(
    () => audienceAuditHistoryEmailScheduler.runNow("manual"),
    /no recipients/i,
  );
  assert.equal(sendCalls.length, 0);
});

/* 4 */
test("runNow success persists a run row, sends JSON+CSV attachments, and writes json-history + csv-history audit rows", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com", "audit@example.com"],
  });

  // Seed one prior on-demand export so listAllAuditExports() returns
  // something the history mail can attach.
  await omniChannelAudienceSafetyService.recordAuditExport({
    actorId: "admin-1",
    actorType: "staff",
    actorRole: "root_admin",
    format: "json",
    filters: { fromDate: null, toDate: null, platform: null, productionId: null },
    rowCounts: { connectors: 0, messages: 2, decisions: 0, commands: 0 },
  });

  const run = await audienceAuditHistoryEmailScheduler.runNow("manual");

  assert.equal(run.status, "success");
  assert.equal(run.triggeredBy, "manual");
  assert.equal(run.cadence, "weekly");
  assert.deepEqual(run.recipients, ["ops@example.com", "audit@example.com"]);
  // messageCount on the run row is reused to mean "history rows attached".
  assert.equal(run.messageCount, 1);

  // Email was called with both JSON+CSV attachments
  assert.equal(sendCalls.length, 1);
  const [call] = sendCalls;
  assert.deepEqual(call.recipients, ["ops@example.com", "audit@example.com"]);
  assert.ok(call.payload.jsonFilename.endsWith(".json"));
  assert.ok(call.payload.csvFilename.endsWith(".csv"));
  assert.equal(call.payload.totalExports, 1);
  assert.ok(call.payload.jsonContent.includes("platformSendAllowed"));
  assert.ok(call.payload.csvContent.includes("audience_audit_export_log"));

  // Each send writes one json-history + one csv-history meta-audit row
  // (in addition to the seeded "json" row).
  const auditRows = await db.select().from(audienceAuditExports);
  const formats = auditRows.map((r) => r.format).sort();
  assert.deepEqual(formats, ["csv-history", "json", "json-history"]);
  const scheduledRows = auditRows.filter((r) =>
    r.format === "json-history" || r.format === "csv-history",
  );
  for (const r of scheduledRows) {
    assert.equal(r.actorType, "scheduler");
    assert.equal(r.actorRole, "audience-audit-history-email");
    assert.equal((r.filters as any).productionId, "__audit_export_log__");
  }

  // Schedule's last-run state updated
  const [sched] = await db
    .select()
    .from(audienceAuditEmailSchedules)
    .where(
      eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID),
    );
  assert.equal(sched.lastRunStatus, "success");
  assert.ok(sched.nextRunAt);
});

/* 5 */
test("runNow failure persists a failed run row and surfaces error on schedule; writes no audit rows", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  sendImpl = async () => {
    throw new Error("resend_down");
  };

  const run = await audienceAuditHistoryEmailScheduler.runNow("manual");
  assert.equal(run.status, "failed");
  assert.ok(run.errorMessage && run.errorMessage.includes("resend_down"));

  const auditRows = await db.select().from(audienceAuditExports);
  assert.equal(auditRows.length, 0, "failed sends must not log audit rows");

  const [sched] = await db
    .select()
    .from(audienceAuditEmailSchedules)
    .where(
      eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID),
    );
  assert.equal(sched.lastRunStatus, "failed");
  assert.ok(sched.lastRunError && sched.lastRunError.includes("resend_down"));
});

/* 6 */
test("tick is a no-op when disabled or when nextRunAt is in the future", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: false,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.tick();
  assert.equal(sendCalls.length, 0);

  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  const future = new Date(Date.now() + 60 * 60 * 1000);
  await db
    .update(audienceAuditEmailSchedules)
    .set({ nextRunAt: future })
    .where(
      eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID),
    );
  await audienceAuditHistoryEmailScheduler.tick();
  assert.equal(sendCalls.length, 0);
});

/* 7 */
test("tick fires a scheduler-triggered run when due", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  await db
    .update(audienceAuditEmailSchedules)
    .set({ nextRunAt: new Date(Date.now() - 1000) })
    .where(
      eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID),
    );

  await audienceAuditHistoryEmailScheduler.tick();
  assert.equal(sendCalls.length, 1);
  const runs = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(
      eq(audienceAuditEmailRuns.scheduleId, AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID),
    );
  assert.equal(runs.length, 1);
  assert.equal(runs[0].triggeredBy, "scheduler");
  assert.equal(runs[0].status, "success");
  assert.equal(runs[0].isTest, false);
});

/* 8 */
test("sendTestNow uses only the admin email, marks isTest=true, and does NOT write meta-audit rows or advance schedule state", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  const before = await audienceAuditHistoryEmailScheduler.getSchedule();

  const testRun = await audienceAuditHistoryEmailScheduler.sendTestNow("Founder@Example.com");
  assert.equal(testRun.isTest, true);
  assert.deepEqual(testRun.recipients, ["founder@example.com"]);
  assert.equal(testRun.triggeredBy, "manual");

  const auditRows = await db.select().from(audienceAuditExports);
  assert.equal(auditRows.length, 0, "test sends must not log meta-audit rows");

  const after = await audienceAuditHistoryEmailScheduler.getSchedule();
  assert.equal(after.lastRunStatus, before.lastRunStatus);
  assert.equal(after.nextRunAt, before.nextRunAt);
});

/* 9 */
test("history schedule lives in a separate scheduleId row from the audit-trail schedule", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "monthly",
    recipients: ["hist@example.com"],
  });
  const rows = await db
    .select()
    .from(audienceAuditEmailSchedules)
    .where(
      eq(audienceAuditEmailSchedules.scheduleId, AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID),
    );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scheduleId, "history");
  assert.equal(rows[0].cadence, "monthly");
});

/* 10 */
test("getRunStats aggregates last-window sends, success/failure counts, and last successful delivery", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });

  const empty = await audienceAuditHistoryEmailScheduler.getRunStats({ windowDays: 30 });
  assert.equal(empty.totalSends, 0);
  assert.equal(empty.successCount, 0);
  assert.equal(empty.failureCount, 0);
  assert.equal(empty.lastSuccessfulRunAt, null);
  assert.equal(empty.lastSuccessfulRunAgeMs, null);
  assert.equal(empty.lastSuccessfulHistoryRows, null);
  assert.equal(empty.excludesTestRuns, true);

  // success #1
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  // failure
  sendImpl = async () => {
    throw new Error("smtp boom");
  };
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  sendImpl = async () => ({ id: "mock_email_id" });
  // success #2 — should be reflected as "last successful"
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  // test send — must NOT count by default
  await audienceAuditHistoryEmailScheduler.sendTestNow("founder@example.com");

  const stats = await audienceAuditHistoryEmailScheduler.getRunStats({ windowDays: 30 });
  assert.equal(stats.totalSends, 3, "test sends excluded by default");
  assert.equal(stats.successCount, 2);
  assert.equal(stats.failureCount, 1);
  assert.equal(stats.pendingCount, 0);
  assert.ok(stats.lastSuccessfulRunAt, "last successful run timestamp surfaced");
  assert.ok(
    stats.lastSuccessfulRunAgeMs !== null && stats.lastSuccessfulRunAgeMs >= 0,
    "last successful age is non-negative",
  );
  assert.equal(typeof stats.lastSuccessfulHistoryRows, "number");

  const withTests = await audienceAuditHistoryEmailScheduler.getRunStats({
    windowDays: 30,
    excludeTestRuns: false,
  });
  assert.equal(withTests.totalSends, 4);
  assert.equal(withTests.excludesTestRuns, false);
});

/* 11 */
test("listRecentRuns returns rows ordered newest-first within window", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  const rows = await audienceAuditHistoryEmailScheduler.listRecentRuns({ windowDays: 90 });
  assert.equal(rows.length, 2);
  assert.ok(
    new Date(rows[0].startedAt).getTime() >= new Date(rows[1].startedAt).getTime(),
    "rows are newest-first",
  );
});

/* 12 — Task #525: getRunStats filters by from/to date range */
test("getRunStats narrows by explicit from/to date range", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  // Three real sends, then we'll rewrite their startedAt so they
  // straddle a quarter boundary we can scope on.
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  const rows = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.scheduleId, AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID));
  // Q2 2025: in window; Q3 2025: in window; Q4 2025: outside window.
  const stamps = [
    new Date("2025-05-15T10:00:00.000Z"),
    new Date("2025-08-15T10:00:00.000Z"),
    new Date("2025-11-15T10:00:00.000Z"),
  ];
  for (let i = 0; i < rows.length; i++) {
    await db
      .update(audienceAuditEmailRuns)
      .set({ startedAt: stamps[i], completedAt: stamps[i] })
      .where(eq(audienceAuditEmailRuns.runId, rows[i].runId));
  }

  const q2q3 = await audienceAuditHistoryEmailScheduler.getRunStats({
    from: "2025-04-01T00:00:00.000Z",
    to: "2025-09-30T23:59:59.999Z",
  });
  assert.equal(q2q3.totalSends, 2);
  assert.equal(q2q3.usedExplicitRange, true);
  assert.equal(q2q3.windowEnd, "2025-09-30T23:59:59.999Z");

  const q3only = await audienceAuditHistoryEmailScheduler.getRunStats({
    from: "2025-07-01T00:00:00.000Z",
    to: "2025-09-30T23:59:59.999Z",
  });
  assert.equal(q3only.totalSends, 1);
});

/* 13 — Task #525: getRunStats filters by recipient inbox */
test("getRunStats narrows by recipient inbox under audit", async () => {
  // First schedule: ops + audit
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com", "audit@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  // Second schedule: only ops -> single recipient
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");

  const auditOnly = await audienceAuditHistoryEmailScheduler.getRunStats({
    recipient: "  AUDIT@Example.com ",
  });
  assert.equal(auditOnly.totalSends, 2);
  assert.equal(auditOnly.recipient, "audit@example.com");

  const opsOnly = await audienceAuditHistoryEmailScheduler.getRunStats({
    recipient: "ops@example.com",
  });
  assert.equal(opsOnly.totalSends, 3);

  const nobody = await audienceAuditHistoryEmailScheduler.getRunStats({
    recipient: "nobody@example.com",
  });
  assert.equal(nobody.totalSends, 0);
  assert.equal(nobody.lastSuccessfulRunAt, null);
});

/* 14 — Task #525: listRecentRuns honors from/to/recipient */
test("listRecentRuns honors from/to/recipient filters", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com", "audit@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");

  // Push one of the two-recipient runs far into the past.
  const rows = await db
    .select()
    .from(audienceAuditEmailRuns)
    .where(eq(audienceAuditEmailRuns.scheduleId, AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID))
    .orderBy(audienceAuditEmailRuns.startedAt);
  const oldStamp = new Date("2024-01-15T10:00:00.000Z");
  await db
    .update(audienceAuditEmailRuns)
    .set({ startedAt: oldStamp, completedAt: oldStamp })
    .where(eq(audienceAuditEmailRuns.runId, rows[0].runId));

  // Recipient + recent window: should exclude the pushed-back run.
  const auditRecent = await audienceAuditHistoryEmailScheduler.listRecentRuns({
    recipient: "audit@example.com",
    windowDays: 30,
  });
  assert.equal(auditRecent.length, 1);
  assert.ok(auditRecent[0].recipients.includes("audit@example.com"));

  // Explicit from/to that includes the old run picks it back up.
  const auditAll = await audienceAuditHistoryEmailScheduler.listRecentRuns({
    recipient: "audit@example.com",
    from: "2024-01-01T00:00:00.000Z",
    to: "2099-12-31T00:00:00.000Z",
  });
  assert.equal(auditAll.length, 2);
});

/* 15 — Task #525: listKnownRecipients dedups across runs (excl tests) */
test("listKnownRecipients returns unique inboxes excluding test sends", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com", "audit@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  // Test send to a never-otherwise-seen inbox should NOT leak in.
  await audienceAuditHistoryEmailScheduler.sendTestNow("founder@example.com");

  const known = await audienceAuditHistoryEmailScheduler.listKnownRecipients();
  assert.deepEqual(known, ["audit@example.com", "ops@example.com"]);

  const withTests = await audienceAuditHistoryEmailScheduler.listKnownRecipients({
    excludeTestRuns: false,
  });
  assert.deepEqual(withTests, ["audit@example.com", "founder@example.com", "ops@example.com"]);
});

/* 16 — Task #575: getRunStatsByRecipient fans out runs per inbox */
test("getRunStatsByRecipient breaks down sends per recipient with success rate and last success", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com", "audit@example.com"],
  });
  // 2 successful sends to ops+audit
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  // 1 failing send to ops+audit
  sendImpl = async () => {
    throw new Error("boom");
  };
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  sendImpl = async () => ({ id: "ok" });
  // 1 successful send to ops only
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  // Test send must NOT count.
  await audienceAuditHistoryEmailScheduler.sendTestNow("founder@example.com");

  const rows = await audienceAuditHistoryEmailScheduler.getRunStatsByRecipient();
  // Sorted by failure desc, then total desc, then alpha. Both inboxes
  // have 1 failure, so the higher-total (ops, 4) comes first.
  assert.equal(rows.length, 2);
  assert.equal(rows[0].recipient, "ops@example.com");
  assert.equal(rows[0].totalSends, 4);
  assert.equal(rows[0].successCount, 3);
  assert.equal(rows[0].failureCount, 1);
  assert.equal(rows[0].pendingCount, 0);
  assert.equal(rows[0].successRate, 3 / 4);
  assert.ok(rows[0].lastSuccessfulRunAt, "last success surfaced for ops");

  assert.equal(rows[1].recipient, "audit@example.com");
  assert.equal(rows[1].totalSends, 3);
  assert.equal(rows[1].successCount, 2);
  assert.equal(rows[1].failureCount, 1);
  assert.equal(rows[1].successRate, 2 / 3);
  assert.ok(rows[1].lastSuccessfulRunAt);

  // No founder@example.com leaked in from the test send.
  assert.ok(!rows.some((r) => r.recipient === "founder@example.com"));
});

/* 17 — Task #575: recipient filter narrows breakdown to that inbox */
test("getRunStatsByRecipient honors recipient filter (only that inbox returned)", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com", "audit@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");

  const filtered = await audienceAuditHistoryEmailScheduler.getRunStatsByRecipient({
    recipient: "  AUDIT@Example.com  ",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].recipient, "audit@example.com");
  assert.equal(filtered[0].totalSends, 2);
  assert.equal(filtered[0].successCount, 2);
  assert.equal(filtered[0].successRate, 1);
});

/* 18 — Task #575: failures sort to the top of the breakdown */
test("getRunStatsByRecipient sorts inbox with more failures first even with fewer sends", async () => {
  // First schedule: only flaky-audit (we'll fail it)
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["flaky-audit@example.com"],
  });
  sendImpl = async () => {
    throw new Error("smtp_down");
  };
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  sendImpl = async () => ({ id: "ok" });

  // Second schedule: high-volume ops (more sends, all successful)
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");

  const rows = await audienceAuditHistoryEmailScheduler.getRunStatsByRecipient();
  assert.equal(rows[0].recipient, "flaky-audit@example.com");
  assert.equal(rows[0].failureCount, 2);
  assert.equal(rows[0].successRate, 0);
  assert.equal(rows[0].lastSuccessfulRunAt, null);
  assert.equal(rows[1].recipient, "ops@example.com");
  assert.equal(rows[1].failureCount, 0);
  assert.equal(rows[1].successRate, 1);
});

/* 19 — Task #636: recipient-breakdown CSV export route matches getRunStatsByRecipient and honors filters */
let breakdownServer: Server;
let breakdownBaseUrl: string;
before(async () => {
  const app = express();
  const allowRoot: express.RequestHandler = (_req, _res, next) => next();
  registerOmniChannelAudienceRoutes(app, allowRoot);
  breakdownServer = createServer(app);
  await new Promise<void>((r) =>
    breakdownServer.listen(0, "127.0.0.1", r),
  );
  const addr = breakdownServer.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  breakdownBaseUrl = `http://127.0.0.1:${addr.port}`;
});
after(async () => {
  await new Promise<void>((r) => breakdownServer.close(() => r()));
});

const BREAKDOWN_ROUTE =
  "/api/admin/newsroom/audience/email-schedule-history/recipient-breakdown/export.csv";
const BREAKDOWN_HEADER =
  "recipient,totalSends,successCount,failureCount,successRate,lastSuccessfulRunAt";

test("recipient-breakdown CSV export route matches getRunStatsByRecipient output", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com", "audit@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  sendImpl = async () => {
    throw new Error("boom");
  };
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  sendImpl = async () => ({ id: "ok" });

  const expected = await audienceAuditHistoryEmailScheduler.getRunStatsByRecipient();
  assert.equal(expected.length, 2);

  const r = await fetch(`${breakdownBaseUrl}${BREAKDOWN_ROUTE}`);
  assert.equal(r.status, 200);
  assert.match(
    r.headers.get("content-type") ?? "",
    /^text\/csv;\s*charset=utf-8/i,
  );
  assert.match(
    r.headers.get("content-disposition") ?? "",
    /^attachment;\s*filename="audience-audit-history-email-recipient-breakdown-.+\.csv"$/,
  );
  const body = await r.text();
  const lines = body.replace(/\r\n/g, "\n").trim().split("\n");
  assert.ok(lines[0].startsWith("# audience_audit_history_email_recipient_breakdown"));
  assert.match(lines[0], /totalRecipients=2/);
  assert.equal(lines[1], BREAKDOWN_HEADER);
  assert.equal(lines.length, 2 + expected.length);
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const expectedRow = [
      e.recipient,
      String(e.totalSends),
      String(e.successCount),
      String(e.failureCount),
      String(e.successRate),
      e.lastSuccessfulRunAt ?? "",
    ].join(",");
    assert.equal(lines[2 + i], expectedRow);
  }
});

test("recipient-breakdown CSV export honors recipient filter", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com", "audit@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.runNow("manual");

  const expected = await audienceAuditHistoryEmailScheduler.getRunStatsByRecipient({
    recipient: "audit@example.com",
  });
  assert.equal(expected.length, 1);

  const r = await fetch(
    `${breakdownBaseUrl}${BREAKDOWN_ROUTE}?recipient=audit%40example.com`,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  const lines = body.replace(/\r\n/g, "\n").trim().split("\n");
  assert.match(lines[0], /recipient=audit@example\.com/);
  assert.match(lines[0], /totalRecipients=1/);
  assert.equal(lines[1], BREAKDOWN_HEADER);
  assert.equal(lines.length, 3);
  assert.ok(lines[2].startsWith("audit@example.com,"));
  // The ops row must not appear when the recipient filter is set.
  assert.ok(!body.includes("ops@example.com"));
});

test("recipient-breakdown CSV export excludes test runs by default and includes them when includeTests=true", async () => {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  await audienceAuditHistoryEmailScheduler.sendTestNow("founder@example.com");

  const defaultRes = await fetch(`${breakdownBaseUrl}${BREAKDOWN_ROUTE}`);
  const defaultBody = await defaultRes.text();
  assert.ok(defaultBody.includes("ops@example.com"));
  assert.ok(!defaultBody.includes("founder@example.com"));

  const inclRes = await fetch(
    `${breakdownBaseUrl}${BREAKDOWN_ROUTE}?includeTests=true`,
  );
  const inclBody = await inclRes.text();
  assert.match(inclBody, /includeTests=true/);
  assert.ok(inclBody.includes("ops@example.com"));
  assert.ok(inclBody.includes("founder@example.com"));
});

void and; // keep import used if drizzle tree-shakes
