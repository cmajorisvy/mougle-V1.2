/**
 * Task #560 — Audit-email failure alert snooze.
 *
 * Verifies that a founder-set snooze suppresses both the trail-email
 * and history-email failure alerts during a known outage without
 * disabling the schedule. Covers:
 *   - snooze during failure: notifyFailure short-circuits, no
 *     `platform_alerts` row is created, no email is sent.
 *   - resume-after-expiry: once the snooze has elapsed, the very next
 *     failure that crosses the threshold fires the alert again.
 *   - 90-day cap: a far-future request is clamped to ≈ now + 90d.
 *   - clear: passing `snoozeUntil: null` unsnoozes.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
// Task #729 — see `tests/helpers/db-cleanup.ts`. Pool sizing for the
// audience-audit suite is governed by `server/db.ts` under
// NODE_ENV=test and the `TEST_DB_POOL_MAX` env var.
import "./helpers/db-cleanup";
import {
  audienceAuditEmailFailureAlertSnoozes,
  platformAlerts,
  systemSettings,
} from "@shared/schema";
import {
  AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_TYPE,
  AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  audienceAuditEmailFailureAlertService,
} from "../server/services/audience-audit-email-failure-alert-service";
import {
  AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE,
  AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  audienceAuditHistoryEmailFailureAlertService,
} from "../server/services/audience-audit-history-email-failure-alert-service";
import {
  isAuditEmailFailureAlertSnoozed,
  listAuditEmailFailureAlertSnoozeHistory,
  pruneAuditEmailFailureAlertSnoozeHistoryOlderThan,
} from "../server/services/audit-email-failure-alert-snooze";
import { emailService } from "../server/services/email-service";

const originalSendAdminAlert = emailService.sendAdminAlert.bind(emailService);
let adminAlertCalls = 0;
(emailService as any).sendAdminAlert = async () => {
  adminAlertCalls += 1;
  return { id: "mock_email_id" };
};
process.on("exit", () => {
  (emailService as any).sendAdminAlert = originalSendAdminAlert;
});

async function cleanup() {
  await db
    .delete(platformAlerts)
    .where(eq(platformAlerts.type, AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_TYPE));
  await db
    .delete(platformAlerts)
    .where(
      eq(platformAlerts.type, AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE),
    );
  await db
    .delete(systemSettings)
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
      ),
    );
  await db
    .delete(systemSettings)
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
      ),
    );
  // Task #613 — wipe persisted snooze history for both alerts.
  await db
    .delete(audienceAuditEmailFailureAlertSnoozes)
    .where(
      eq(
        audienceAuditEmailFailureAlertSnoozes.alertKey,
        AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
      ),
    );
  await db
    .delete(audienceAuditEmailFailureAlertSnoozes)
    .where(
      eq(
        audienceAuditEmailFailureAlertSnoozes.alertKey,
        AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
      ),
    );
}

beforeEach(async () => {
  adminAlertCalls = 0;
  audienceAuditEmailFailureAlertService.resetForTests();
  audienceAuditHistoryEmailFailureAlertService.resetForTests();
  await cleanup();
  delete process.env.AUDIENCE_AUDIT_EMAIL_FAILURE_THRESHOLD;
  delete process.env.AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD;
});

afterEach(async () => {
  await cleanup();
});

async function listOpen(type: string) {
  return db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.type, type));
}

test("trail snooze: invalid + past timestamps rejected, future accepted, can be cleared", async () => {
  await assert.rejects(
    audienceAuditEmailFailureAlertService.setSnooze({
      snoozeUntil: "not-a-date",
    }),
    /invalid snoozeUntil/,
  );
  await assert.rejects(
    audienceAuditEmailFailureAlertService.setSnooze({
      snoozeUntil: new Date(Date.now() - 1000).toISOString(),
    }),
    /must be in the future/,
  );
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const c1 = await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: future,
    updatedBy: "founder@example.com",
  });
  assert.ok(c1.snoozeUntil);
  assert.equal(c1.updatedBy, "founder@example.com");
  const c2 = await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: null,
  });
  assert.equal(c2.snoozeUntil, null);
});

test("trail snooze: notifyFailure suppresses alert + email while snoozed", async () => {
  process.env.AUDIENCE_AUDIT_EMAIL_FAILURE_THRESHOLD = "1";
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  const before = adminAlertCalls;
  const fired = await audienceAuditEmailFailureAlertService.notifyFailure({
    runId: "r1",
    error: "resend_down",
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  assert.equal(fired, false, "snoozed notifyFailure must short-circuit");
  const open = await listOpen(AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_TYPE);
  assert.equal(open.length, 0, "no platform_alerts row written while snoozed");
  assert.equal(adminAlertCalls, before, "no admin email sent while snoozed");
  assert.ok(
    audienceAuditEmailFailureAlertService._consecutiveFailuresForTests() >= 1,
    "counter is left intact so alert can fire once snooze elapses",
  );
});

test("trail snooze: resumes alerting after the snooze window has elapsed", async () => {
  process.env.AUDIENCE_AUDIT_EMAIL_FAILURE_THRESHOLD = "1";
  // Simulate an already-expired snooze by writing a past timestamp directly.
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
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
  const fired = await audienceAuditEmailFailureAlertService.notifyFailure({
    runId: "r1",
    error: "resend_still_down",
    cadence: "weekly",
    recipients: ["ops@example.com"],
  });
  assert.equal(fired, true, "expired snooze must NOT suppress the alert");
  const open = await listOpen(AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_TYPE);
  assert.equal(open.length, 1, "alert must fire once snooze has expired");
});

test("trail snooze: far-future request is capped at 90 days", async () => {
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const c = await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: farFuture,
  });
  assert.ok(c.snoozeUntil);
  const dt = Date.parse(c.snoozeUntil!);
  const days = (dt - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(days <= 90.01, `expected ≤ 90 days, got ${days}`);
  assert.ok(days >= 89.99, `expected ≈ 90 days, got ${days}`);
});

test("history snooze: notifyFailure suppresses alert + email while snoozed, resumes after expiry, capped at 90 days", async () => {
  process.env.AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_THRESHOLD = "1";

  // Snoozed: no alert
  await audienceAuditHistoryEmailFailureAlertService.setSnooze({
    snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  const fired1 = await audienceAuditHistoryEmailFailureAlertService.notifyFailure({
    runId: "h1",
    error: "resend_down",
    cadence: "monthly",
    recipients: ["ops@example.com"],
  });
  assert.equal(fired1, false);
  let open = await listOpen(AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE);
  assert.equal(open.length, 0);

  // Expired snooze: next failure fires
  const past = new Date(Date.now() - 1000).toISOString();
  await db
    .update(systemSettings)
    .set({
      value: JSON.stringify({
        snoozeUntil: past,
        updatedAt: past,
        updatedBy: null,
      }),
    })
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
      ),
    );
  const fired2 = await audienceAuditHistoryEmailFailureAlertService.notifyFailure({
    runId: "h2",
    error: "resend_still_down",
    cadence: "monthly",
    recipients: ["ops@example.com"],
  });
  assert.equal(fired2, true);
  open = await listOpen(AUDIENCE_AUDIT_HISTORY_EMAIL_FAILURE_ALERT_TYPE);
  assert.equal(open.length, 1);

  // 90-day cap
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const capped = await audienceAuditHistoryEmailFailureAlertService.setSnooze({
    snoozeUntil: farFuture,
  });
  assert.ok(capped.snoozeUntil);
  const days =
    (Date.parse(capped.snoozeUntil!) - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(days <= 90.01 && days >= 89.99, `expected ≈ 90 days, got ${days}`);
});

test("Task #613: setSnooze appends a 'set' history row with updatedBy + snoozeUntil", async () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: future,
    updatedBy: "founder@example.com",
  });
  const history =
    await audienceAuditEmailFailureAlertService.getSnoozeHistory(10);
  assert.equal(history.length, 1);
  assert.equal(history[0].action, "set");
  assert.equal(history[0].updatedBy, "founder@example.com");
  assert.equal(history[0].alertKey, AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY);
  assert.ok(history[0].snoozeUntil);
});

test("Task #613: setSnooze(null) on an active snooze appends a 'cleared' row, but no-op clears are not logged", async () => {
  // No-op clear first: should not record anything
  await audienceAuditEmailFailureAlertService.setSnooze({ snoozeUntil: null });
  let history =
    await audienceAuditEmailFailureAlertService.getSnoozeHistory(10);
  assert.equal(history.length, 0, "no-op clear must not log");

  // Set then clear: should log 'cleared'
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: future,
    updatedBy: "founder",
  });
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: null,
    updatedBy: "founder",
  });
  history = await audienceAuditEmailFailureAlertService.getSnoozeHistory(10);
  assert.equal(history.length, 2, "set + cleared both logged");
  // Newest-first ordering
  assert.equal(history[0].action, "cleared");
  assert.equal(history[1].action, "set");
});

test("Task #613: passing a snooze observed-as-expired lazily appends an 'expired' row, idempotent", async () => {
  // Write a past snoozeUntil directly so isAuditEmailFailureAlertSnoozed
  // observes natural expiry.
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  await db
    .insert(systemSettings)
    .values({
      key: AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
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

  const r1 = await isAuditEmailFailureAlertSnoozed(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  );
  assert.equal(r1.snoozed, false);
  // Calling again must NOT add a duplicate (dedup_key uniqueness).
  await isAuditEmailFailureAlertSnoozed(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  );
  await isAuditEmailFailureAlertSnoozed(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
  );
  const history = await listAuditEmailFailureAlertSnoozeHistory(
    AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
    10,
  );
  const expired = history.filter((h) => h.action === "expired");
  assert.equal(expired.length, 1, "expired logged exactly once per window");
  assert.equal(expired[0].updatedBy, "founder");
});

test("Task #613: trail and history alert histories are isolated by alertKey", async () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: future,
    updatedBy: "founder-trail",
  });
  await audienceAuditHistoryEmailFailureAlertService.setSnooze({
    snoozeUntil: future,
    updatedBy: "founder-history",
  });
  const trail =
    await audienceAuditEmailFailureAlertService.getSnoozeHistory(10);
  const hist =
    await audienceAuditHistoryEmailFailureAlertService.getSnoozeHistory(10);
  assert.equal(trail.length, 1);
  assert.equal(hist.length, 1);
  assert.equal(trail[0].updatedBy, "founder-trail");
  assert.equal(hist[0].updatedBy, "founder-history");
});

test("Task #613: pruneAuditEmailFailureAlertSnoozeHistoryOlderThan drops rows older than cutoff", async () => {
  // Insert an old row directly.
  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db.insert(audienceAuditEmailFailureAlertSnoozes).values({
    alertKey: AUDIENCE_AUDIT_EMAIL_FAILURE_ALERT_SNOOZE_SETTING_KEY,
    action: "set",
    snoozeUntil: new Date(old.getTime() + 60 * 60 * 1000),
    updatedBy: "old",
    occurredAt: old,
    dedupKey: `set:test-old:${old.toISOString()}`,
  });
  // Insert a fresh row via the service.
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: future,
    updatedBy: "fresh",
  });

  const before = await audienceAuditEmailFailureAlertService.getSnoozeHistory(50);
  assert.ok(before.length >= 2);

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pruned = await pruneAuditEmailFailureAlertSnoozeHistoryOlderThan(cutoff);
  assert.ok(pruned >= 1, `expected to prune the old row, got ${pruned}`);

  const after = await audienceAuditEmailFailureAlertService.getSnoozeHistory(50);
  assert.ok(
    after.every((r) => r.updatedBy !== "old"),
    "old row must be gone",
  );
  assert.ok(
    after.some((r) => r.updatedBy === "fresh"),
    "fresh row must survive",
  );
});

test("trail snooze: getSnooze reflects the current persisted state", async () => {
  const empty = await audienceAuditEmailFailureAlertService.getSnooze();
  assert.equal(empty.snoozeUntil, null);
  const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await audienceAuditEmailFailureAlertService.setSnooze({
    snoozeUntil: future,
    updatedBy: "root_admin",
  });
  const after = await audienceAuditEmailFailureAlertService.getSnooze();
  assert.ok(after.snoozeUntil);
  assert.equal(after.updatedBy, "root_admin");
});
