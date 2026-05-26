/**
 * Task #614 — Snooze-about-to-expire reminder.
 *
 * Verifies the daily reminder tick that warns founders ~24h before an
 * audit-email failure-alert snooze elapses. Covers:
 *   - sends once when snooze falls inside the 24h reminder window
 *   - dedup: a second tick within the same window does not re-send
 *   - extending the snooze (new setSnooze call) resets the dedup so a
 *     new reminder fires
 *   - silent skip when no snooze is set
 *   - silent skip when the snooze is still > 24h away
 *   - silent skip when the snooze is already expired
 *   - both trail and history keys are scanned independently
 *   - email failure does NOT stamp the receipt, so the next tick
 *     retries
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import {
  AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  audienceAuditEmailFailureAlertService,
} from "../server/services/audience-audit-email-failure-alert-service";
import {
  AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  audienceAuditHistoryEmailFailureAlertService,
} from "../server/services/audience-audit-history-email-failure-alert-service";
import {
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
  setProductionAssetOrphanSweepFlappingDigestSnooze,
} from "../server/services/production-asset-orphan-alert-service";
import {
  auditEmailFailureAlertSnoozeExpiryReminderService,
  REMINDER_WINDOW_MS,
} from "../server/services/audit-email-failure-alert-snooze-expiry-reminder-service";
import { getAuditEmailFailureAlertSnooze } from "../server/services/audit-email-failure-alert-snooze";
import { EmailService } from "../server/services/email-service";

const SNOOZE_KEYS = [
  AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
];

const reminderSvc = auditEmailFailureAlertSnoozeExpiryReminderService as any;
const originalSendAdminAlert = EmailService.prototype.sendAdminAlert;
let sendCalls: Array<{ to: string; subject: string; message: string }> = [];
let shouldFailNextSend = false;

(EmailService.prototype as any).sendAdminAlert = async function (
  to: string,
  alert: { title: string; message: string },
) {
  if (shouldFailNextSend) {
    shouldFailNextSend = false;
    throw new Error("resend_unavailable");
  }
  sendCalls.push({ to, subject: alert.title, message: alert.message });
  return { id: "mock_email_id" };
};

process.on("exit", () => {
  EmailService.prototype.sendAdminAlert = originalSendAdminAlert;
});

// Stub the root-admin loader so the test does not depend on whatever
// `admin_staff` rows happen to be in the dev DB.
let stubAdmins = ["root1@example.com", "root2@example.com"];
const originalLoad = reminderSvc.loadRootAdminEmails?.bind(reminderSvc);
reminderSvc.loadRootAdminEmails = async () => [...stubAdmins];

async function cleanup() {
  await db.delete(systemSettings).where(inArray(systemSettings.key, SNOOZE_KEYS));
}

beforeEach(async () => {
  sendCalls = [];
  shouldFailNextSend = false;
  stubAdmins = ["root1@example.com", "root2@example.com"];
  await cleanup();
});

afterEach(async () => {
  await cleanup();
});

test("reminder: no snooze => silent skip, no emails sent", async () => {
  const r = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r.reminded, 0);
  assert.equal(sendCalls.length, 0);
  assert.ok(r.skipped.every((s: any) => s.reason === "no_snooze"));
});

test("reminder: snooze > 24h away => silent skip", async () => {
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const r = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r.reminded, 0);
  assert.equal(sendCalls.length, 0);
  assert.ok(
    r.skipped.some(
      (s: any) =>
        s.key === AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY &&
        s.reason === "outside_window",
    ),
  );
});

test("reminder: snooze inside 24h window => emails every root admin once, stamps receipt", async () => {
  const snoozeUntil = new Date(Date.now() + 6 * 60 * 60 * 1000);
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: snoozeUntil.toISOString(),
    updatedBy: "founder@example.com",
  });
  const r = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r.reminded, 1);
  assert.equal(sendCalls.length, 2, "one email per root admin");
  for (const c of sendCalls) {
    assert.match(c.subject, /Audit-alert snooze expires/);
    assert.match(c.message, /Audit-trail compliance email failure alert/);
  }
  const stamped = await getAuditEmailFailureAlertSnooze(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  );
  assert.ok(stamped.expiryReminderSentAt, "expiryReminderSentAt must be set");
  // Snooze window itself must be unchanged.
  assert.equal(stamped.snoozeUntil, snoozeUntil.toISOString());
  assert.equal(stamped.updatedBy, "founder@example.com");
});

test("reminder: dedup — second tick within the same window does NOT re-send", async () => {
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  });
  await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  const after1 = sendCalls.length;
  assert.equal(after1, 2);
  const r2 = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(sendCalls.length, after1, "no extra emails on second tick");
  assert.equal(r2.reminded, 0);
  assert.ok(
    r2.skipped.some(
      (s: any) =>
        s.key === AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY &&
        s.reason === "already_reminded",
    ),
  );
});

test("reminder: extending the snooze (new setSnooze) resets receipt so a fresh reminder fires", async () => {
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  });
  await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(sendCalls.length, 2);

  // Founder extends the snooze. The next reminder window (still ≤ 24h
  // because we picked +12h) must fire a fresh email.
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  });
  const before = sendCalls.length;
  const r = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r.reminded, 1);
  assert.equal(sendCalls.length, before + 2, "fresh reminder per root admin");
});

test("reminder: already-expired snooze is silently skipped, no email", async () => {
  // Write an expired snooze directly (setAuditEmailFailureAlertSnooze
  // rejects past timestamps).
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  await db.insert(systemSettings).values({
    key: AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
    value: JSON.stringify({
      snoozeUntil: past,
      updatedAt: past,
      updatedBy: "founder",
      expiryReminderSentAt: null,
    }),
  });
  const r = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r.reminded, 0);
  assert.equal(sendCalls.length, 0);
  assert.ok(
    r.skipped.some(
      (s: any) =>
        s.key === AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY &&
        s.reason === "already_expired",
    ),
  );
});

test("reminder: scans both trail and history keys independently", async () => {
  // Only history key gets a snooze inside the reminder window.
  await audienceAuditHistoryEmailFailureAlertService.setSnooze({
    snoozeUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  });
  const r = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r.reminded, 1);
  assert.equal(sendCalls.length, 2);
  for (const c of sendCalls) {
    assert.match(c.message, /Audit-export history email failure alert/);
  }
  const trailCfg = await getAuditEmailFailureAlertSnooze(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  );
  assert.equal(trailCfg.snoozeUntil, null);
  assert.equal(trailCfg.expiryReminderSentAt, null);
});

test("reminder: send failure does NOT stamp receipt so the next tick retries", async () => {
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  });
  // First admin send throws; second send (and the dedup stamp) must
  // not happen for *this* tick, but a retry should send cleanly.
  shouldFailNextSend = true;
  const r1 = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r1.reminded, 0);
  assert.ok(r1.errors.length >= 1);
  const stampedFail = await getAuditEmailFailureAlertSnooze(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  );
  assert.equal(
    stampedFail.expiryReminderSentAt,
    null,
    "failed send must NOT stamp the receipt",
  );
  // Retry succeeds.
  const r2 = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r2.reminded, 1);
  const stampedOk = await getAuditEmailFailureAlertSnooze(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  );
  assert.ok(stampedOk.expiryReminderSentAt);
});

test("reminder: flapping-digest snooze fires once inside 24h window and dedups on second tick", async () => {
  await setProductionAssetOrphanSweepFlappingDigestSnooze({
    snoozeUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    updatedBy: "founder@example.com",
  });
  const r1 = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r1.reminded, 1);
  assert.equal(sendCalls.length, 2, "one email per root admin");
  for (const c of sendCalls) {
    assert.match(c.subject, /Audit-alert snooze expires/);
    assert.match(c.message, /Production-asset orphan-sweep flapping digest/);
  }
  const stamped = await getAuditEmailFailureAlertSnooze(
    PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
  );
  assert.ok(stamped.expiryReminderSentAt, "expiryReminderSentAt must be set");

  const r2 = await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  assert.equal(r2.reminded, 0, "second tick must not re-send for same window");
  assert.equal(sendCalls.length, 2);
  assert.ok(
    r2.skipped.some(
      (s: any) =>
        s.key === PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY &&
        s.reason === "already_reminded",
    ),
  );
});

test("snooze helper: setSnooze always resets expiryReminderSentAt to null", async () => {
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  });
  await auditEmailFailureAlertSnoozeExpiryReminderService.runTick();
  const stamped = await getAuditEmailFailureAlertSnooze(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  );
  assert.ok(stamped.expiryReminderSentAt);

  // Clearing then re-snoozing must reset the receipt.
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: null,
  });
  const cleared = await getAuditEmailFailureAlertSnooze(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  );
  assert.equal(cleared.expiryReminderSentAt, null);
});
