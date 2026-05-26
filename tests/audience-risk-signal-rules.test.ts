/**
 * Task #459: founder-tunable risk-signal rules.
 *
 * Covers:
 *   - default rules match today's behavior (no DB row)
 *   - set + get round-trip persistence
 *   - normalization rejects unknown signals and clamps days
 *   - detector honors a custom `wideDateWindowDays`
 *   - notifier partitions signals into body / subject by mute + loud
 *   - email payload sees loud-only subject signals and body-only signals
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import { emailService } from "../server/services/email-service";
import {
  AUDIENCE_RISK_SIGNAL_RULES_SETTING_KEY,
  ALL_RISK_SIGNALS,
  DEFAULT_AUDIENCE_RISK_SIGNAL_RULES,
  DEFAULT_WIDE_DATE_WINDOW_DAYS,
  MAX_WIDE_DATE_WINDOW_DAYS,
  MIN_WIDE_DATE_WINDOW_DAYS,
  getAudienceRiskSignalRules,
  setAudienceRiskSignalRules,
  partitionRiskSignalsForEmail,
} from "../server/services/audience-risk-signal-rules-service";
import {
  AUDIENCE_AUDIT_EXPORT_NOTIFIER_SETTING_KEY,
  clearAuditExportNotificationHistory,
  handleAuditExportEvent,
  resetAudienceAuditExportNotifierDedupForTests,
  setAudienceAuditExportNotifierConfig,
} from "../server/services/audience-audit-export-notifier";
import { detectAuditExportRiskSignals } from "../server/services/omni-channel-audience-safety-service";
import type { AudienceAuditExportRecord } from "../shared/omni-channel-audience-schema";

type SendArgs = Parameters<typeof emailService.sendAudienceAuditExportNotification>;
type SendCall = { recipients: SendArgs[0]; payload: SendArgs[1] };

const originalSend = emailService.sendAudienceAuditExportNotification.bind(emailService);
let sendCalls: SendCall[] = [];

(emailService as any).sendAudienceAuditExportNotification = async (
  recipients: SendArgs[0],
  payload: SendArgs[1],
) => {
  sendCalls.push({ recipients, payload });
  return { id: "mock_email_id" };
};

process.on("exit", () => {
  (emailService as any).sendAudienceAuditExportNotification = originalSend;
});

async function clearAll() {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_RISK_SIGNAL_RULES_SETTING_KEY));
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_AUDIT_EXPORT_NOTIFIER_SETTING_KEY));
}

beforeEach(async () => {
  sendCalls = [];
  resetAudienceAuditExportNotifierDedupForTests();
  clearAuditExportNotificationHistory();
  await clearAll();
});

afterEach(async () => {
  await clearAll();
});

test("defaults preserve today's behavior (no DB row) — every signal loud, none muted, 90d threshold", async () => {
  const rules = await getAudienceRiskSignalRules();
  assert.equal(rules.wideDateWindowDays, DEFAULT_WIDE_DATE_WINDOW_DAYS);
  assert.deepEqual([...rules.loudSignals].sort(), [...ALL_RISK_SIGNALS].sort());
  assert.deepEqual(rules.mutedSignals, []);
  assert.equal(rules.updatedAt, null);
  assert.equal(rules.updatedBy, null);
});

test("set + get round-trip persists wideDateWindowDays / loud / muted", async () => {
  await setAudienceRiskSignalRules({
    wideDateWindowDays: 30,
    loudSignals: ["full_trail", "wide_date_window"],
    mutedSignals: ["format_change"],
    updatedBy: "tester",
  });
  const got = await getAudienceRiskSignalRules();
  assert.equal(got.wideDateWindowDays, 30);
  assert.deepEqual(got.loudSignals, ["full_trail", "wide_date_window"]);
  assert.deepEqual(got.mutedSignals, ["format_change"]);
  assert.equal(got.updatedBy, "tester");
  assert.ok(got.updatedAt);
});

test("setRules clamps days into [min, max] and drops unknown signal values", async () => {
  await setAudienceRiskSignalRules({
    wideDateWindowDays: 999_999,
    loudSignals: ["full_trail", "not_a_real_signal" as any],
    mutedSignals: [],
    updatedBy: "tester",
  });
  const a = await getAudienceRiskSignalRules();
  assert.equal(a.wideDateWindowDays, MAX_WIDE_DATE_WINDOW_DAYS);
  assert.deepEqual(a.loudSignals, ["full_trail"]);

  await setAudienceRiskSignalRules({
    wideDateWindowDays: -5,
    loudSignals: [],
    mutedSignals: [],
    updatedBy: "tester",
  });
  const b = await getAudienceRiskSignalRules();
  assert.equal(b.wideDateWindowDays, MIN_WIDE_DATE_WINDOW_DAYS);
});

test("detector honors a custom wideDateWindowDays — 30d threshold flags a 60d window", () => {
  const from = "2026-01-01T00:00:00.000Z";
  const to = new Date(Date.parse(from) + 60 * 86_400_000).toISOString();
  const filters = { fromDate: from, toDate: to, platform: "youtube" as const, productionId: "prod_a" };

  // With the default 90d threshold, a 60d window is NOT wide.
  const defaultSignals = detectAuditExportRiskSignals(
    { format: "json", filters },
    [{ format: "json", filters: { ...filters, fromDate: null, toDate: null }, exportedAt: "2026-02-01T00:00:00.000Z" }],
  );
  assert.ok(!defaultSignals.includes("wide_date_window"));

  // With a 30d threshold, the same 60d window IS flagged.
  const tunedSignals = detectAuditExportRiskSignals(
    { format: "json", filters },
    [{ format: "json", filters: { ...filters, fromDate: null, toDate: null }, exportedAt: "2026-02-01T00:00:00.000Z" }],
    { wideDateWindowDays: 30 },
  );
  assert.ok(tunedSignals.includes("wide_date_window"));
});

test("partitionRiskSignalsForEmail respects mute (wins) and loud separately", () => {
  const rules = {
    ...DEFAULT_AUDIENCE_RISK_SIGNAL_RULES,
    loudSignals: ["full_trail", "wide_date_window"] as any[],
    mutedSignals: ["format_change"] as any[],
  };
  const partition = partitionRiskSignalsForEmail(
    ["full_trail", "wide_date_window", "first_export_by_actor", "format_change"],
    rules,
  );
  // Muted signal disappears from body and subject.
  assert.deepEqual(partition.bodySignals, [
    "full_trail",
    "wide_date_window",
    "first_export_by_actor",
  ]);
  assert.deepEqual(partition.subjectSignals, ["full_trail", "wide_date_window"]);
  assert.deepEqual(partition.mutedFromEmail, ["format_change"]);
});

test("partition: a signal that is both loud and muted stays muted (mute wins)", () => {
  const rules = {
    ...DEFAULT_AUDIENCE_RISK_SIGNAL_RULES,
    loudSignals: ["full_trail"] as any[],
    mutedSignals: ["full_trail"] as any[],
  };
  const partition = partitionRiskSignalsForEmail(["full_trail"], rules);
  assert.deepEqual(partition.bodySignals, []);
  assert.deepEqual(partition.subjectSignals, []);
  assert.deepEqual(partition.mutedFromEmail, ["full_trail"]);
});

test("handleAuditExportEvent passes loud-only subject signals and drops muted from body", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    updatedBy: "tester",
  });
  await setAudienceRiskSignalRules({
    wideDateWindowDays: 90,
    loudSignals: ["full_trail"],
    mutedSignals: ["format_change"],
    updatedBy: "tester",
  });

  const record: AudienceAuditExportRecord = {
    exportId: "aud_exp_rules_1",
    actorId: "admin_rules_test",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "csv",
    filters: { fromDate: null, toDate: null, platform: null, productionId: null },
    rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0, total: 0 },
    riskSignals: [
      "full_trail",
      "first_export_by_actor",
      "no_date_window",
      "format_change",
    ],
    exportedAt: new Date().toISOString(),
  };

  const result = await handleAuditExportEvent(record);
  assert.equal(result.notified, true);
  assert.equal(sendCalls.length, 1);
  // Muted format_change dropped from body; only full_trail is loud in subject.
  assert.deepEqual(sendCalls[0].payload.riskSignals, [
    "full_trail",
    "first_export_by_actor",
    "no_date_window",
  ]);
  assert.deepEqual(sendCalls[0].payload.riskSubjectSignals, ["full_trail"]);
});

test("handleAuditExportEvent with default rules keeps every signal loud (today's behavior)", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    updatedBy: "tester",
  });
  // No setAudienceRiskSignalRules call → defaults apply.

  const record: AudienceAuditExportRecord = {
    exportId: "aud_exp_rules_2",
    actorId: "admin_default_test",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "json",
    filters: { fromDate: null, toDate: null, platform: null, productionId: null },
    rowCounts: { connectors: 0, messages: 1, decisions: 1, commands: 0, total: 2 },
    riskSignals: ["full_trail", "no_date_window"],
    exportedAt: new Date().toISOString(),
  };

  const result = await handleAuditExportEvent(record);
  assert.equal(result.notified, true);
  assert.deepEqual(sendCalls[0].payload.riskSignals, [
    "full_trail",
    "no_date_window",
  ]);
  assert.deepEqual(sendCalls[0].payload.riskSubjectSignals, [
    "full_trail",
    "no_date_window",
  ]);
});
