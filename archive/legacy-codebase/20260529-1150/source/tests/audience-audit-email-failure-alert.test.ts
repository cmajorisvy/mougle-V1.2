/**
 * Task #520 — Audit-trail compliance email failure alert.
 *
 * Mirrors the Task #482 history-email failure-alert test. Verifies
 * that after N consecutive failed scheduler runs of the audit-trail
 * compliance email, a `platform_alerts` row of type
 * `audience_audit_email_failure` is created, that repeated failures
 * inside the threshold do NOT fire, and that the next successful
 * scheduler run auto-resolves the open alert. Manual / test sends
 * never count toward the failure streak.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts } from "@shared/schema";
import { audienceAuditEmailScheduler } from "../server/services/audience-audit-email-scheduler";
import {
  AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_TYPE,
  audienceAuditEmailFailureAlertService,
} from "../server/services/audience-audit-email-failure-alert-service";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { emailService } from "../server/services/email-service";

type SendArgs = Parameters<typeof emailService.sendAudienceAuditExport>;
type SendImpl = (
  recipients: SendArgs[0],
  payload: SendArgs[1],
) => Promise<any>;

const originalSend = emailService.sendAudienceAuditExport.bind(emailService);
let sendImpl: SendImpl = async () => ({ id: "mock_email_id" });

(emailService as any).sendAudienceAuditExport = async (
  recipients: SendArgs[0],
  payload: SendArgs[1],
) => sendImpl(recipients, payload);

async function clearOurAlerts() {
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_TYPE));
}

beforeEach(async () => {
  sendImpl = async () => ({ id: "mock_email_id" });
  audienceAuditEmailFailureAlertService.resetForTests();
  await omniChannelAudienceSafetyService.reset();
  await audienceAuditEmailScheduler.resetForTests();
  await clearOurAlerts();
  delete process.env.AUDIENCE_AUDIT_EMAIL_FAILURE_THRESHOLD;
});

afterEach(async () => {
  sendImpl = async () => ({ id: "mock_email_id" });
  await clearOurAlerts();
  delete process.env.AUDIENCE_AUDIT_EMAIL_FAILURE_THRESHOLD;
});

process.on("exit", () => {
  (emailService as any).sendAudienceAuditExport = originalSend;
});

async function configureSchedule() {
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
}

async function listOpenAlerts() {
  return db
    .select()
    .from(platformAlerts)
    .where(
      and(
        eq(platformAlerts.type, AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_TYPE),
        eq(platformAlerts.acknowledged, false),
      ),
    );
}

test("one failed scheduler run does NOT fire the alert (threshold=2)", async () => {
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("resend_down_1");
  };

  const run = await audienceAuditEmailScheduler.runNow("scheduler");
  assert.equal(run.status, "failed");

  const open = await listOpenAlerts();
  assert.equal(open.length, 0, "first failure must not page the founder");
  assert.equal(
    audienceAuditEmailFailureAlertService._consecutiveFailuresForTests(),
    1,
  );
});

test("two consecutive failed scheduler runs fire one founder alert", async () => {
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("resend_rate_limited");
  };

  await audienceAuditEmailScheduler.runNow("scheduler");
  await audienceAuditEmailScheduler.runNow("scheduler");

  const open = await listOpenAlerts();
  assert.equal(open.length, 1, "exactly one open alert after 2 failures");
  const row = open[0];
  assert.match(row.message, /Audit-trail compliance email failed/);
  assert.match(row.message, /resend_rate_limited/);
  const d = (row.details as Record<string, any>) ?? {};
  assert.equal(d.source, "audience-audit-email-failure-alert-service");
  assert.equal(d.cadence, "weekly");
  assert.equal(d.consecutiveFailures, 2);
  assert.equal(d.threshold, 2);
  assert.deepEqual(d.recipients, ["ops@example.com"]);
  assert.equal(d.link, "/admin/omni-channel-audience#audit-trail-email");

  const exposed = await audienceAuditEmailFailureAlertService.getOpenAlert();
  assert.ok(exposed);
  assert.match(exposed!.message, /resend_rate_limited/);
});

test("further failures past the threshold keep an alert open", async () => {
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("still_down");
  };

  await audienceAuditEmailScheduler.runNow("scheduler");
  await audienceAuditEmailScheduler.runNow("scheduler");
  await audienceAuditEmailScheduler.runNow("scheduler");
  await audienceAuditEmailScheduler.runNow("scheduler");

  const open = await listOpenAlerts();
  assert.ok(open.length >= 1, "alert must be open while delivery keeps failing");
  for (const row of open) {
    const d = (row.details as Record<string, any>) ?? {};
    assert.ok(
      d.consecutiveFailures >= 2,
      "every alert must reflect at-or-past-threshold streak",
    );
  }
});

test("successful scheduler run after failures auto-resolves all open alerts and resets streak", async () => {
  await configureSchedule();

  sendImpl = async () => {
    throw new Error("transient_outage");
  };
  await audienceAuditEmailScheduler.runNow("scheduler");
  await audienceAuditEmailScheduler.runNow("scheduler");
  const openedBefore = await listOpenAlerts();
  assert.ok(openedBefore.length >= 1);

  // Recovery
  sendImpl = async () => ({ id: "mock_email_id" });
  const ok = await audienceAuditEmailScheduler.runNow("scheduler");
  assert.equal(ok.status, "success");

  const openedAfter = await listOpenAlerts();
  assert.equal(openedAfter.length, 0, "all open alerts must be auto-resolved");

  assert.equal(
    audienceAuditEmailFailureAlertService._consecutiveFailuresForTests(),
    0,
  );

  sendImpl = async () => {
    throw new Error("flaky_again");
  };
  await audienceAuditEmailScheduler.runNow("scheduler");
  const reopened = await listOpenAlerts();
  assert.equal(
    reopened.length,
    0,
    "one fresh failure after recovery must not re-page the founder",
  );

  const allRows = await db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.type, AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_TYPE));
  const acked = allRows.filter((r) => r.acknowledged);
  assert.ok(acked.length >= 1);
  for (const row of acked) {
    const d = (row.details as Record<string, any>) ?? {};
    assert.equal(d.autoResolved, true);
    assert.equal(d.autoResolvedCadence, "weekly");
    assert.equal(row.acknowledgedBy, "system");
  }
});

test("manual and test sends never count toward the failure streak", async () => {
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("nope");
  };

  await audienceAuditEmailScheduler.runNow("manual");
  await audienceAuditEmailScheduler.sendTestNow("me@example.com");

  assert.equal(
    audienceAuditEmailFailureAlertService._consecutiveFailuresForTests(),
    0,
    "manual/test failures must not bump the streak",
  );
  const open = await listOpenAlerts();
  assert.equal(open.length, 0);
});

test("AUDIENCE_AUDIT_EMAIL_FAILURE_THRESHOLD env override changes the trigger point", async () => {
  process.env.AUDIENCE_AUDIT_EMAIL_FAILURE_THRESHOLD = "1";
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("hot_path");
  };

  await audienceAuditEmailScheduler.runNow("scheduler");

  const open = await listOpenAlerts();
  assert.equal(open.length, 1, "threshold=1 must fire after the very first failure");
  const d = (open[0].details as Record<string, any>) ?? {};
  assert.equal(d.threshold, 1);
});
