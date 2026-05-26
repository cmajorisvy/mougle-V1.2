/**
 * Task #637 — Per-recipient inbox silence alert for the audit-export
 * history email.
 *
 * The aggregate scheduler can keep reporting Success while one inbox
 * is silently never receiving the email (recipient list rewrite,
 * mail-provider block on one address, etc). These tests verify:
 *
 *   1. When one inbox in `listKnownRecipients` has no success within
 *      the cadence + grace window, a per-recipient platform_alerts
 *      row is created and the message names that inbox.
 *   2. When all known inboxes are fresh, no alert fires.
 *   3. When a previously-silent inbox gets a fresh successful
 *      delivery, the open per-recipient alert auto-resolves (mirrors
 *      the run-level stale alert's autoResolve).
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts } from "@shared/schema";
import {
  audienceAuditEmailRuns,
  AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID,
} from "../shared/omni-channel-audience-schema";
import { audienceAuditHistoryEmailScheduler } from "../server/services/audience-audit-history-email-scheduler";
import {
  AUDIENCE_AUDIT_HISTORY_EMAIL_RECIPIENT_STALE_ALERT_TYPE,
  AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_ALERT_TYPE,
  audienceAuditHistoryEmailStaleAlertService,
  setAudienceAuditHistoryEmailStaleSnooze,
} from "../server/services/audience-audit-history-email-stale-alert-service";
import { emailService } from "../server/services/email-service";

const DAY_MS = 24 * 60 * 60 * 1000;

// Stub the outbound email so seed runs don't actually fire mail.
type SendArgs = Parameters<typeof emailService.sendAudienceAuditHistoryExport>;
type SendImpl = (
  recipients: SendArgs[0],
  payload: SendArgs[1],
) => Promise<any>;
const originalSend = emailService.sendAudienceAuditHistoryExport.bind(emailService);
let sendImpl: SendImpl = async () => ({ id: "mock_email_id" });
(emailService as any).sendAudienceAuditHistoryExport = async (
  recipients: SendArgs[0],
  payload: SendArgs[1],
) => sendImpl(recipients, payload);

const originalAdminAlert = emailService.sendAdminAlert.bind(emailService);
(emailService as any).sendAdminAlert = async () => ({ id: "mock_admin_alert" });

process.on("exit", () => {
  (emailService as any).sendAudienceAuditHistoryExport = originalSend;
  (emailService as any).sendAdminAlert = originalAdminAlert;
});

async function clearOurAlerts() {
  await db
    .delete(platformAlerts)
    .where(
      eq(
        platformAlerts.type,
        AUDIENCE_AUDIT_HISTORY_EMAIL_RECIPIENT_STALE_ALERT_TYPE,
      ),
    );
  await db
    .delete(platformAlerts)
    .where(
      eq(
        platformAlerts.type,
        AUDIENCE_AUDIT_HISTORY_EMAIL_STALE_ALERT_TYPE,
      ),
    );
}

async function listOpenRecipientAlerts() {
  return db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(
          platformAlerts.type,
          AUDIENCE_AUDIT_HISTORY_EMAIL_RECIPIENT_STALE_ALERT_TYPE,
        ),
        eq(platformAlerts.acknowledged, false),
      ),
    );
}

/**
 * Directly insert a synthetic past run so we can age individual
 * inboxes without relying on real wall-clock time.
 */
async function seedSuccessfulRun(opts: {
  recipients: string[];
  at: Date;
  cadence?: "weekly" | "monthly";
}): Promise<void> {
  await db.insert(audienceAuditEmailRuns).values({
    runId: `seed_${Math.random().toString(36).slice(2)}_${opts.at.getTime()}`,
    scheduleId: AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID,
    cadence: opts.cadence ?? "weekly",
    triggeredBy: "scheduler",
    isTest: false,
    windowFrom: opts.at,
    windowTo: opts.at,
    recipients: opts.recipients,
    status: "success",
    messageCount: 0,
    decisionCount: 0,
    commandCount: 0,
    connectorCount: 0,
    startedAt: opts.at,
    completedAt: opts.at,
  });
}

beforeEach(async () => {
  sendImpl = async () => ({ id: "mock_email_id" });
  audienceAuditHistoryEmailStaleAlertService.resetForTests();
  await audienceAuditHistoryEmailScheduler.resetForTests();
  await clearOurAlerts();
  await setAudienceAuditHistoryEmailStaleSnooze({ snoozeUntil: null });
});

afterEach(async () => {
  sendImpl = async () => ({ id: "mock_email_id" });
  await clearOurAlerts();
});

async function configureSchedule(
  recipients: string[],
  cadence: "weekly" | "monthly" = "weekly",
): Promise<void> {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
    enabled: true,
    cadence,
    recipients,
  });
}

test("Task #637 — single silent inbox fires a per-recipient alert even when another inbox is fresh", async () => {
  await configureSchedule(["good@example.com", "bad@example.com"]);

  // The aggregate scheduler ran 9 days ago against both inboxes…
  const longAgo = new Date(Date.now() - 9 * DAY_MS);
  await seedSuccessfulRun({
    recipients: ["good@example.com", "bad@example.com"],
    at: longAgo,
  });
  // …and yesterday only good@ still got a successful delivery
  // (e.g. bad@ was silently rejected). Aggregate "lastSuccess" looks
  // healthy — the per-inbox sweep is the only thing that catches
  // bad@ going dark.
  const recent = new Date(Date.now() - 1 * DAY_MS);
  await seedSuccessfulRun({ recipients: ["good@example.com"], at: recent });

  const out = await audienceAuditHistoryEmailStaleAlertService.tickRecipients();

  assert.equal(out.fired, 1, "exactly one per-recipient alert should fire");
  assert.equal(out.resolved, 0);
  assert.deepEqual(out.silentRecipients, ["bad@example.com"]);

  const open = await listOpenRecipientAlerts();
  assert.equal(open.length, 1);
  const row = open[0];
  assert.match(row.message, /history inbox has gone silent/i);
  assert.match(row.message, /bad@example\.com/);
  const d = (row.details as Record<string, any>) ?? {};
  assert.equal(d.scope, "recipient");
  assert.equal(d.recipient, "bad@example.com");
  assert.equal(d.cadence, "weekly");
  assert.equal(d.allowedAgeDays, 8);
  assert.equal(d.hasEverSucceeded, true);
  assert.equal(d.reason, "stale_overdue");
  assert.equal(d.link, "/admin/omni-channel-audience#audit-history");

  // Aggregate run-level evaluation is *not* stale here — the whole
  // point of Task #637 is that the run-level check would miss this.
  const runLevel = await audienceAuditHistoryEmailStaleAlertService.evaluate();
  assert.equal(runLevel.stale, false);

  // Re-tick must not duplicate the open alert.
  const second = await audienceAuditHistoryEmailStaleAlertService.tickRecipients();
  assert.equal(second.fired, 0);
  assert.equal((await listOpenRecipientAlerts()).length, 1);
});

test("Task #637 — all inboxes fresh: no per-recipient alert fires", async () => {
  await configureSchedule(["a@example.com", "b@example.com"]);

  const recent = new Date(Date.now() - 1 * DAY_MS);
  await seedSuccessfulRun({
    recipients: ["a@example.com", "b@example.com"],
    at: recent,
  });

  const out = await audienceAuditHistoryEmailStaleAlertService.tickRecipients();
  assert.equal(out.fired, 0);
  assert.equal(out.resolved, 0);
  assert.deepEqual(out.silentRecipients, []);
  assert.equal((await listOpenRecipientAlerts()).length, 0);

  const evaluation =
    await audienceAuditHistoryEmailStaleAlertService.evaluateRecipients();
  assert.equal(evaluation.recipients.length, 2);
  for (const r of evaluation.recipients) {
    assert.equal(r.silent, false);
    assert.equal(r.reason, "fresh");
  }
});

test("Task #637 — fresh delivery to a previously-silent inbox auto-resolves the alert", async () => {
  await configureSchedule(["good@example.com", "bad@example.com"]);

  // Seed: bad@ went silent ~10d ago, good@ stayed fresh.
  await seedSuccessfulRun({
    recipients: ["good@example.com", "bad@example.com"],
    at: new Date(Date.now() - 10 * DAY_MS),
  });
  await seedSuccessfulRun({
    recipients: ["good@example.com"],
    at: new Date(Date.now() - 1 * DAY_MS),
  });

  // First tick fires the per-recipient alert.
  const fired = await audienceAuditHistoryEmailStaleAlertService.tickRecipients();
  assert.equal(fired.fired, 1);
  assert.deepEqual(fired.silentRecipients, ["bad@example.com"]);
  assert.equal((await listOpenRecipientAlerts()).length, 1);

  // Operator fixes the inbox and a fresh successful delivery to bad@
  // lands.
  await seedSuccessfulRun({
    recipients: ["good@example.com", "bad@example.com"],
    at: new Date(),
  });

  const recovered =
    await audienceAuditHistoryEmailStaleAlertService.tickRecipients();
  assert.equal(recovered.fired, 0);
  assert.equal(recovered.resolved, 1);
  assert.deepEqual(recovered.silentRecipients, []);
  assert.equal((await listOpenRecipientAlerts()).length, 0);

  // The acked row carries the autoResolved annotation, mirroring the
  // run-level alert's autoResolve semantics.
  const all = await db
    .select()
    .from(platformAlerts)
    .where(
      eq(
        platformAlerts.type,
        AUDIENCE_AUDIT_HISTORY_EMAIL_RECIPIENT_STALE_ALERT_TYPE,
      ),
    );
  const acked = all.filter((r) => r.acknowledged);
  assert.equal(acked.length, 1);
  const d = (acked[0].details as Record<string, any>) ?? {};
  assert.equal(d.autoResolved, true);
  assert.equal(acked[0].acknowledgedBy, "system");
  assert.ok(d.autoResolvedAt);
  assert.ok(
    typeof d.autoResolvedNote === "string" &&
      d.autoResolvedNote.includes("bad@example.com"),
  );
});
