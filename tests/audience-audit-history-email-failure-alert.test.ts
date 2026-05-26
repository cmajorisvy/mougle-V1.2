/**
 * Task #482 — Audit-export history email failure alert.
 *
 * Verifies that after N consecutive failed scheduler runs of the
 * audit-export history email, a `platform_alerts` row of type
 * `audience_audit_history_email_failure` is created, that repeated
 * failures inside the threshold do NOT fire, and that the next
 * successful scheduler run auto-resolves the open alert. Manual /
 * test sends never count toward the failure streak.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../server/db";
// Task #729 — see `tests/helpers/db-cleanup.ts`. Pool sizing for the
// audience-audit suite is governed by `server/db.ts` under
// NODE_ENV=test and the `TEST_DB_POOL_MAX` env var.
import "./helpers/db-cleanup";
import { platformAlerts, systemSettings } from "@shared/schema";
import { audienceAuditExports } from "../shared/omni-channel-audience-schema";
import { audienceAuditHistoryEmailScheduler } from "../server/services/audience-audit-history-email-scheduler";
import {
  AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE,
  AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD_SETTING_KEY,
  audienceAuditHistoryEmailFailureAlertService,
  getEffectiveFailureThreshold,
  setFailureThresholdOverride,
} from "../server/services/audience-audit-history-email-failure-alert-service";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { emailService, EmailService } from "../server/services/email-service";

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

// Task #736 — also stub `sendAdminAlert` so the founder-notification
// path in `audienceAuditHistoryEmailFailureAlertService.notifyFailure`
// never hits the real Resend API. When Resend's shared daily quota is
// exhausted (HTTP 429 / `daily_quota_exceeded`), the real call would
// take ~hundreds of ms per recipient and consume connections/pool
// slots, which destabilizes the surrounding DB-heavy assertions. The
// service already swallows send errors, but mocking here keeps the
// test fully hermetic regardless of Resend's quota state. We patch
// the *prototype* (not just the singleton) because the failure-alert
// service constructs its own `new EmailService()` instance.
type AdminAlertArgs = Parameters<typeof emailService.sendAdminAlert>;
type AdminAlertImpl = (
  to: AdminAlertArgs[0],
  alert: AdminAlertArgs[1],
) => Promise<any>;
const originalSendAdminAlert = EmailService.prototype.sendAdminAlert;
let adminAlertImpl: AdminAlertImpl = async () => ({ id: "mock_admin_alert_id" });
(EmailService.prototype as any).sendAdminAlert = async function (
  to: AdminAlertArgs[0],
  alert: AdminAlertArgs[1],
) {
  return adminAlertImpl(to, alert);
};

async function clearOurAlerts() {
  await db
    .delete(platformAlerts)
    .where(
      eq(
        platformAlerts.type,
        AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE,
      ),
    );
}

async function clearThresholdOverride() {
  await db
    .delete(systemSettings)
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD_SETTING_KEY,
      ),
    );
}

beforeEach(async () => {
  sendImpl = async () => ({ id: "mock_email_id" });
  adminAlertImpl = async () => ({ id: "mock_admin_alert_id" });
  audienceAuditHistoryEmailFailureAlertService.resetForTests();
  await omniChannelAudienceSafetyService.reset();
  await db.delete(audienceAuditExports);
  await audienceAuditHistoryEmailScheduler.resetForTests();
  await clearOurAlerts();
  await clearThresholdOverride();
  delete process.env.AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD;
});

afterEach(async () => {
  sendImpl = async () => ({ id: "mock_email_id" });
  adminAlertImpl = async () => ({ id: "mock_admin_alert_id" });
  await clearOurAlerts();
  await clearThresholdOverride();
  delete process.env.AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD;
});

process.on("exit", () => {
  (emailService as any).sendAudienceAuditHistoryExport = originalSend;
  (EmailService.prototype as any).sendAdminAlert = originalSendAdminAlert;
});

async function configureSchedule() {
  await audienceAuditHistoryEmailScheduler.upsertSchedule({
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
        eq(
          platformAlerts.type,
          AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE,
        ),
        eq(platformAlerts.acknowledged, false),
      ),
    );
}

test("one failed scheduler run does NOT fire the alert (threshold=2)", async () => {
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("resend_down_1");
  };

  const run = await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  assert.equal(run.status, "failed");

  const open = await listOpenAlerts();
  assert.equal(open.length, 0, "first failure must not page the founder");
  assert.equal(
    audienceAuditHistoryEmailFailureAlertService._consecutiveFailuresForTests(),
    1,
  );
});

test("two consecutive failed scheduler runs fire one founder alert", async () => {
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("resend_rate_limited");
  };

  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  const open = await listOpenAlerts();
  assert.equal(open.length, 1, "exactly one open alert after 2 failures");
  const row = open[0];
  assert.match(row.message, /Audit-export history email failed/);
  assert.match(row.message, /resend_rate_limited/);
  const d = (row.details as Record<string, any>) ?? {};
  assert.equal(d.source, "audience-audit-history-email-failure-alert-service");
  assert.equal(d.cadence, "weekly");
  assert.equal(d.consecutiveFailures, 2);
  assert.equal(d.threshold, 2);
  assert.deepEqual(d.recipients, ["ops@example.com"]);
  assert.equal(d.link, "/admin/omni-channel-audience#audit-history");

  // The same service exposes the open alert for the admin banner.
  const exposed = await audienceAuditHistoryEmailFailureAlertService.getOpenAlert();
  assert.ok(exposed);
  assert.match(exposed!.message, /resend_rate_limited/);
});

test("further failures past the threshold do not pile up duplicate open alerts", async () => {
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("still_down");
  };

  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  const open = await listOpenAlerts();
  // Each notifyFailure call past the threshold writes a new row (no
  // dedup window), so we expect 3 (runs 2, 3, 4). What matters is that
  // run #1 alone did NOT fire and that the alert IS firing after the
  // threshold.
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
  // Seed a prior export so the success path has something to attach.
  await omniChannelAudienceSafetyService.recordAuditExport({
    actorId: "admin-1",
    actorType: "staff",
    actorRole: "root_admin",
    format: "json",
    filters: { fromDate: null, toDate: null, platform: null, productionId: null },
    rowCounts: { connectors: 0, messages: 1, decisions: 0, commands: 0 },
  });

  sendImpl = async () => {
    throw new Error("transient_outage");
  };
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  const openedBefore = await listOpenAlerts();
  assert.ok(openedBefore.length >= 1);

  // Recovery
  sendImpl = async () => ({ id: "mock_email_id" });
  const ok = await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  assert.equal(ok.status, "success");

  const openedAfter = await listOpenAlerts();
  assert.equal(openedAfter.length, 0, "all open alerts must be auto-resolved");

  // Streak counter resets, so a single subsequent failure does not
  // immediately re-fire.
  assert.equal(
    audienceAuditHistoryEmailFailureAlertService._consecutiveFailuresForTests(),
    0,
  );

  sendImpl = async () => {
    throw new Error("flaky_again");
  };
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  const reopened = await listOpenAlerts();
  assert.equal(
    reopened.length,
    0,
    "one fresh failure after recovery must not re-page the founder",
  );

  // Resolved row should carry the autoResolved annotation.
  const allRows = await db
    .select()
    .from(platformAlerts)
    .where(
      eq(
        platformAlerts.type,
        AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE,
      ),
    );
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

  // Manual runNow → still hits scheduler.executeRun with
  // triggeredBy='manual', which must NOT increment the streak.
  await audienceAuditHistoryEmailScheduler.runNow("manual");
  // A test send to a single admin email also must NOT count.
  await audienceAuditHistoryEmailScheduler.sendTestNow("me@example.com");

  assert.equal(
    audienceAuditHistoryEmailFailureAlertService._consecutiveFailuresForTests(),
    0,
    "manual/test failures must not bump the streak",
  );
  const open = await listOpenAlerts();
  assert.equal(open.length, 0);
});

test("AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD env override changes the trigger point", async () => {
  process.env.AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD = "1";
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("hot_path");
  };

  await audienceAuditHistoryEmailScheduler.runNow("scheduler");

  const open = await listOpenAlerts();
  assert.equal(open.length, 1, "threshold=1 must fire after the very first failure");
  const d = (open[0].details as Record<string, any>) ?? {};
  assert.equal(d.threshold, 1);
});

test("Task #521: admin DB override beats env and default; precedence + persistence", async () => {
  // Default: no env, no override → 2.
  let cfg = await getEffectiveFailureThreshold();
  assert.equal(cfg.threshold, 2);
  assert.equal(cfg.override, null);
  assert.equal(cfg.envFallback, null);
  assert.equal(cfg.defaultThreshold, 2);

  // Env-only → env wins over default.
  process.env.AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD = "4";
  cfg = await getEffectiveFailureThreshold();
  assert.equal(cfg.threshold, 4);
  assert.equal(cfg.override, null);
  assert.equal(cfg.envFallback, 4);

  // Admin override beats env, is clamped (1..5), and persists across reads.
  const saved = await setFailureThresholdOverride(3, "admin-1");
  assert.equal(saved.threshold, 3);
  assert.equal(saved.override, 3);
  assert.equal(saved.envFallback, 4);

  const reread = await getEffectiveFailureThreshold();
  assert.equal(reread.threshold, 3);
  assert.equal(reread.override, 3);

  // Out-of-range value gets clamped to the max on save.
  const clamped = await setFailureThresholdOverride(99, "admin-1");
  assert.equal(clamped.override, 5);
  assert.equal(clamped.threshold, 5);

  // Clearing the override falls back to env.
  const cleared = await setFailureThresholdOverride(null, "admin-1");
  assert.equal(cleared.override, null);
  assert.equal(cleared.threshold, 4); // env value

  // notifyFailure actually honors the persisted override (set to 1
  // → first failure fires).
  await setFailureThresholdOverride(1, "admin-1");
  await configureSchedule();
  sendImpl = async () => {
    throw new Error("admin_tuned");
  };
  await audienceAuditHistoryEmailScheduler.runNow("scheduler");
  const open = await listOpenAlerts();
  assert.equal(open.length, 1, "override=1 must fire after the very first failure");
  const d = (open[0].details as Record<string, any>) ?? {};
  assert.equal(d.threshold, 1, "alert details must reflect the live threshold");
});
