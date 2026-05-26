/**
 * Task #676 — extend the "loosening alarm" email pattern (notify on
 * disable + 2x+ loosen, with per-control opt-out toggle) from the
 * audience restore-log rate threshold to three additional safety
 * thresholds: stale-rows backlog, archive-deletion notifier,
 * audit-export notifier.
 *
 * Coverage:
 *   • classify* helpers (pure)
 *   • notify-on-weakening getters/setters (DB-backed default ON)
 *   • end-to-end: setter -> EmailService.sendSafetyThresholdWeakenedEmail
 *     stub is invoked once per weakening, never on tightening / no-op /
 *     toggle OFF.
 */

import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../server/db";
import { adminStaff, systemSettings } from "@shared/schema";
import {
  AUDIENCE_RETENTION_STALE_ROWS_NOTIFY_ON_WEAKENING_SETTING_KEY,
  classifyStaleRowsWeakening,
  isStaleRowsNotifyOnWeakeningEnabled,
  setStaleRowsNotifyOnWeakeningEnabled,
  setStaleRowsThresholdOverride,
} from "../server/services/audience-retention-stale-rows-alert-service";
import {
  AUDIENCE_ARCHIVE_DELETION_NOTIFY_ON_WEAKENING_SETTING_KEY,
  classifyArchiveDeletionWeakening,
  isArchiveDeletionNotifyOnWeakeningEnabled,
  setArchiveDeletionNotifyOnWeakeningEnabled,
  setAudienceArchiveDeletionNotifierConfig,
} from "../server/services/audience-archive-deletion-notifier";
import {
  AUDIENCE_AUDIT_EXPORT_NOTIFY_ON_WEAKENING_SETTING_KEY,
  classifyAuditExportWeakening,
  isAuditExportNotifyOnWeakeningEnabled,
  setAuditExportNotifyOnWeakeningEnabled,
  setAudienceAuditExportNotifierConfig,
} from "../server/services/audience-audit-export-notifier";
import { EmailService } from "../server/services/email-service";

const TEST_ROOT_ADMIN_EMAIL = "task676-root@example.test";
const TEST_ROOT_ADMIN_USERNAME = "task676_root_admin";

type WeakenedArgs = Parameters<EmailService["sendSafetyThresholdWeakenedEmail"]>;
const origSend = EmailService.prototype.sendSafetyThresholdWeakenedEmail;
let calls: WeakenedArgs[] = [];

before(() => {
  EmailService.prototype.sendSafetyThresholdWeakenedEmail = async function (
    this: EmailService,
    ...args: WeakenedArgs
  ) {
    calls.push(args);
    return null as any;
  };
});

after(() => {
  EmailService.prototype.sendSafetyThresholdWeakenedEmail = origSend;
});

beforeEach(async () => {
  calls = [];
  await db
    .delete(systemSettings)
    .where(
      inArray(systemSettings.key, [
        AUDIENCE_RETENTION_STALE_ROWS_NOTIFY_ON_WEAKENING_SETTING_KEY,
        AUDIENCE_ARCHIVE_DELETION_NOTIFY_ON_WEAKENING_SETTING_KEY,
        AUDIENCE_AUDIT_EXPORT_NOTIFY_ON_WEAKENING_SETTING_KEY,
        "audience_retention_stale_rows_thresholds",
        "audience_archive_deletion_notifier",
        "audience_audit_export_notifier",
      ]),
    );
  await db
    .delete(adminStaff)
    .where(eq(adminStaff.email, TEST_ROOT_ADMIN_EMAIL));
  await db.execute(sql`
    INSERT INTO admin_staff (email, username, password_hash, display_name, role, active)
    VALUES (${TEST_ROOT_ADMIN_EMAIL}, ${TEST_ROOT_ADMIN_USERNAME}, 'x', 'Task 676 Root Admin', 'root_admin', true)
  `);
});

afterEach(async () => {
  await db
    .delete(adminStaff)
    .where(eq(adminStaff.email, TEST_ROOT_ADMIN_EMAIL));
});

// ---------------------------------------------------------------------
// stale-rows
// ---------------------------------------------------------------------

test("stale-rows: classify detects disable + 2x+ loosen per table", () => {
  const prior = { messages: 100, decisions: 200, commands: 50 };
  // Disable messages, loosen decisions 2x, leave commands.
  const next = { messages: 0, decisions: 400, commands: 50 };
  const out = classifyStaleRowsWeakening(prior, next);
  const fields = out.map((e) => `${e.table}:${e.reason}`).sort();
  assert.deepEqual(fields, ["decisions:loosened_2x", "messages:disabled"]);
});

test("stale-rows: tightening, no-op, and turning-on are not weakenings", () => {
  const prior = { messages: 100, decisions: 200, commands: 0 };
  assert.equal(
    classifyStaleRowsWeakening(prior, { messages: 50, decisions: 200, commands: 0 })
      .length,
    0,
  );
  assert.equal(
    classifyStaleRowsWeakening(prior, prior).length,
    0,
  );
  assert.equal(
    classifyStaleRowsWeakening(prior, { messages: 100, decisions: 200, commands: 500 })
      .length,
    0,
  );
});

test("stale-rows: notify-on-weakening default ON, survives toggle", async () => {
  assert.equal(await isStaleRowsNotifyOnWeakeningEnabled(), true);
  await setStaleRowsNotifyOnWeakeningEnabled(false, "alice");
  assert.equal(await isStaleRowsNotifyOnWeakeningEnabled(), false);
  await setStaleRowsNotifyOnWeakeningEnabled(true, "alice");
  assert.equal(await isStaleRowsNotifyOnWeakeningEnabled(), true);
});

test("stale-rows: loosening 2x+ emails root admins; toggle OFF suppresses", async () => {
  // seed prior thresholds.
  await setStaleRowsThresholdOverride({ messages: 100 }, "alice");
  calls = [];
  await setStaleRowsThresholdOverride({ messages: 250 }, "bob");
  assert.equal(calls.length, 1, "should email on 2x+ loosen");
  const [recipients, payload] = calls[0];
  assert.ok(recipients.includes(TEST_ROOT_ADMIN_EMAIL));
  assert.equal(payload.reason, "loosened_2x");
  assert.equal(payload.actor, "bob");
  assert.match(payload.controlLabel, /stale-rows/i);

  // Tightening triggers no email.
  calls = [];
  await setStaleRowsThresholdOverride({ messages: 100 }, "carol");
  assert.equal(calls.length, 0);

  // Disable -> emails again.
  calls = [];
  await setStaleRowsThresholdOverride({ messages: 0 }, "dave");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].reason, "disabled");

  // Toggle OFF -> no email.
  await setStaleRowsNotifyOnWeakeningEnabled(false, "alice");
  await setStaleRowsThresholdOverride({ messages: 500 }, "eve");
  calls = [];
  await setStaleRowsThresholdOverride({ messages: 9999 }, "frank");
  assert.equal(calls.length, 0, "toggle OFF should suppress weakening email");
});

// ---------------------------------------------------------------------
// archive-deletion notifier
// ---------------------------------------------------------------------

test("archive-deletion: classify detects disable + 2x+ loosen on file/bytes", () => {
  const prior = {
    enabled: true,
    postCleanupFileThreshold: 10,
    postCleanupBytesThreshold: 100 * 1024 * 1024,
  };
  // Notifier turned off + bytes loosened 2x.
  const next = {
    enabled: false,
    postCleanupFileThreshold: 10,
    postCleanupBytesThreshold: 200 * 1024 * 1024,
  };
  const out = classifyArchiveDeletionWeakening(prior, next);
  const reasons = out
    .map((e) => `${e.field}:${e.reason}`)
    .sort();
  assert.deepEqual(reasons, [
    "enabled:control_disabled",
    "postCleanupBytesThreshold:loosened_2x",
  ]);
});

test("archive-deletion: notify-on-weakening default ON, persists", async () => {
  assert.equal(await isArchiveDeletionNotifyOnWeakeningEnabled(), true);
  await setArchiveDeletionNotifyOnWeakeningEnabled(false, "alice");
  assert.equal(await isArchiveDeletionNotifyOnWeakeningEnabled(), false);
});

test("archive-deletion: disabling the notifier emails root admins", async () => {
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
    updatedBy: "alice",
  });
  calls = [];
  await setAudienceArchiveDeletionNotifierConfig({
    enabled: false,
    recipients: ["ops@example.com"],
    updatedBy: "bob",
  });
  assert.equal(calls.length, 1);
  const [recipients, payload] = calls[0];
  assert.ok(recipients.includes(TEST_ROOT_ADMIN_EMAIL));
  assert.equal(payload.reason, "control_disabled");
  assert.match(payload.controlLabel, /archive[- ]deletion/i);
});

// ---------------------------------------------------------------------
// audit-export notifier
// ---------------------------------------------------------------------

test("audit-export: classify detects disable + 2x+ minRowCount loosen", () => {
  // Notifier disabled.
  assert.deepEqual(
    classifyAuditExportWeakening(
      { enabled: true, minRowCount: 10 },
      { enabled: false, minRowCount: 10 },
    ).map((e) => `${e.field}:${e.reason}`),
    ["enabled:control_disabled"],
  );
  // 2x loosen.
  assert.deepEqual(
    classifyAuditExportWeakening(
      { enabled: true, minRowCount: 10 },
      { enabled: true, minRowCount: 20 },
    ).map((e) => `${e.field}:${e.reason}`),
    ["minRowCount:loosened_2x"],
  );
  // Going from 0 (notify-all, strict) to higher N is NOT a weakening
  // by our chosen semantics (0 already has no multiplier base).
  assert.equal(
    classifyAuditExportWeakening(
      { enabled: true, minRowCount: 0 },
      { enabled: true, minRowCount: 999 },
    ).length,
    0,
  );
  // Tightening (raising bar lower = fewer rows skipped = more emails)
  // is not a weakening either.
  assert.equal(
    classifyAuditExportWeakening(
      { enabled: true, minRowCount: 100 },
      { enabled: true, minRowCount: 50 },
    ).length,
    0,
  );
});

test("audit-export: notify-on-weakening default ON, persists", async () => {
  assert.equal(await isAuditExportNotifyOnWeakeningEnabled(), true);
  await setAuditExportNotifyOnWeakeningEnabled(false, "alice");
  assert.equal(await isAuditExportNotifyOnWeakeningEnabled(), false);
});

test("audit-export: loosening minRowCount 2x+ emails root admins", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["sec@example.com"],
    minRowCount: 10,
    suppressedActorIds: [],
    updatedBy: "alice",
  });
  calls = [];
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["sec@example.com"],
    minRowCount: 50,
    suppressedActorIds: [],
    updatedBy: "bob",
  });
  assert.equal(calls.length, 1);
  const [recipients, payload] = calls[0];
  assert.ok(recipients.includes(TEST_ROOT_ADMIN_EMAIL));
  assert.equal(payload.reason, "loosened_2x");
  assert.equal(payload.actor, "bob");
  assert.match(payload.controlLabel, /audit[- ]export/i);
});

test("audit-export: toggle OFF suppresses weakening email", async () => {
  await setAuditExportNotifyOnWeakeningEnabled(false, "alice");
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["sec@example.com"],
    minRowCount: 10,
    suppressedActorIds: [],
    updatedBy: "alice",
  });
  calls = [];
  await setAudienceAuditExportNotifierConfig({
    enabled: false,
    recipients: ["sec@example.com"],
    minRowCount: 10,
    suppressedActorIds: [],
    updatedBy: "bob",
  });
  assert.equal(calls.length, 0);
});
