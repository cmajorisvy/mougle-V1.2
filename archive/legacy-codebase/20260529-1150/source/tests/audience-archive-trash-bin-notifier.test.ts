import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import { emailService } from "../server/services/email-service";
import {
  AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_SETTING_KEY,
  getAudienceArchiveTrashBinNotifierConfig,
  setAudienceArchiveTrashBinNotifierConfig,
  setAudienceArchiveTrashBinNotifierSnooze,
  runTrashBinAlert,
  sendTestTrashBinAlertEmail,
  getAudienceArchiveTrashBinNotifierHistory,
  resetAudienceArchiveTrashBinNotifierHistoryForTests,
} from "../server/services/audience-archive-trash-bin-notifier";
import type { AudienceArchiveTrashStats } from "../server/services/audience-retention-service";

type AlertArgs = Parameters<typeof emailService.sendAudienceArchiveTrashBinAlert>;
const originalAlert = emailService.sendAudienceArchiveTrashBinAlert.bind(emailService);
let alertCalls: { recipients: AlertArgs[0]; payload: AlertArgs[1] }[] = [];
let alertImpl: (r: AlertArgs[0], p: AlertArgs[1]) => Promise<any> = async () => ({
  id: "mock",
});

(emailService as any).sendAudienceArchiveTrashBinAlert = async (
  recipients: AlertArgs[0],
  payload: AlertArgs[1],
) => {
  alertCalls.push({ recipients, payload });
  return alertImpl(recipients, payload);
};
process.on("exit", () => {
  (emailService as any).sendAudienceArchiveTrashBinAlert = originalAlert;
});

async function clearConfig() {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_SETTING_KEY));
}

function buildStats(over: Partial<AudienceArchiveTrashStats> = {}): AudienceArchiveTrashStats {
  return {
    trashFileCount: 250,
    totalTrashBytes: 200 * 1024 * 1024,
    oldestPendingDeletedAtIso: new Date("2026-05-01T00:00:00Z").toISOString(),
    nextPurgeAtIso: new Date("2026-06-01T00:00:00Z").toISOString(),
    graceDays: 30,
    graceDaysSource: "default",
    graceDaysEnvFallback: null,
    defaultGraceDays: 30,
    trashWarnFileCount: 100,
    trashWarnBytes: 100 * 1024 * 1024,
    trashFileCountExceeded: true,
    trashBytesExceeded: true,
    ...over,
  };
}

beforeEach(async () => {
  alertCalls = [];
  alertImpl = async () => ({ id: "mock" });
  resetAudienceArchiveTrashBinNotifierHistoryForTests();
  await clearConfig();
});

afterEach(async () => {
  await clearConfig();
});

test("default config is disabled with no recipients", async () => {
  const cfg = await getAudienceArchiveTrashBinNotifierConfig();
  assert.equal(cfg.enabled, false);
  assert.deepEqual(cfg.recipients, []);
  assert.equal(cfg.alertIntervalHours, 24);
  assert.equal(cfg.snoozeUntil, null);
});

test("enabling without recipients throws", async () => {
  await assert.rejects(
    () => setAudienceArchiveTrashBinNotifierConfig({ enabled: true, recipients: [] }),
    /at least one recipient/i,
  );
});

test("normalizes and dedupes recipient emails on save", async () => {
  const cfg = await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["A@Example.com ", "a@example.com", "b@x.io", "not-an-email"],
  });
  assert.deepEqual(cfg.recipients, ["a@example.com", "b@x.io"]);
});

test("disabled config skips sending and records history", async () => {
  const r = await runTrashBinAlert({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "disabled");
  assert.equal(alertCalls.length, 0);
  const hist = getAudienceArchiveTrashBinNotifierHistory();
  assert.equal(hist[0].reason, "disabled");
});

test("enabled with no recipients short-circuits to no_recipients", async () => {
  // Bypass validation by writing the config directly to simulate
  // a state where enabled flipped on but recipients got cleared.
  await db.insert(systemSettings).values({
    key: AUDIENCE_ARCHIVE_TRASH_BIN_NOTIFIER_SETTING_KEY,
    value: JSON.stringify({ enabled: true, recipients: [] }),
  });
  const r = await runTrashBinAlert({ statsLoader: async () => buildStats() });
  assert.equal(r.reason, "no_recipients");
  assert.equal(alertCalls.length, 0);
});

test("below threshold does not send", async () => {
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
  });
  const r = await runTrashBinAlert({
    statsLoader: async () =>
      buildStats({
        trashFileCount: 10,
        totalTrashBytes: 1024,
        trashFileCountExceeded: false,
        trashBytesExceeded: false,
      }),
  });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "below_threshold");
  assert.equal(alertCalls.length, 0);
});

test("threshold exceeded sends an alert and persists dedup state", async () => {
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
  });
  const r = await runTrashBinAlert({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(alertCalls.length, 1);
  assert.deepEqual(alertCalls[0].recipients, ["ops@example.com"]);
  assert.equal(alertCalls[0].payload.trashFileCountExceeded, true);
  assert.equal(alertCalls[0].payload.trashBytesExceeded, true);

  const cfg = await getAudienceArchiveTrashBinNotifierConfig();
  assert.ok(cfg.lastAlertAt);
  assert.ok(cfg.lastAlertSignature);
});

test("dedup suppresses identical breach within interval", async () => {
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
    alertIntervalHours: 24,
  });
  await runTrashBinAlert({ statsLoader: async () => buildStats() });
  assert.equal(alertCalls.length, 1);
  // Same stats -> same signature, within 24h -> dedup
  const r = await runTrashBinAlert({ statsLoader: async () => buildStats() });
  assert.equal(r.reason, "deduplicated");
  assert.equal(alertCalls.length, 1);
});

test("dedup bypassed when breach signature materially changes", async () => {
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
    alertIntervalHours: 24,
  });
  await runTrashBinAlert({ statsLoader: async () => buildStats() });
  // Bump trash way past previous bucket — should re-send.
  const r = await runTrashBinAlert({
    statsLoader: async () =>
      buildStats({
        trashFileCount: 9000,
        totalTrashBytes: 2 * 1024 * 1024 * 1024,
      }),
  });
  assert.equal(r.reason, "sent");
  assert.equal(alertCalls.length, 2);
});

test("dedup bypassed once interval window elapses", async () => {
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
    alertIntervalHours: 1,
  });
  const now1 = new Date("2026-05-22T00:00:00Z");
  await runTrashBinAlert({ statsLoader: async () => buildStats(), now: now1 });
  assert.equal(alertCalls.length, 1);
  // Two hours later, same signature — interval has elapsed.
  const now2 = new Date("2026-05-22T02:00:00Z");
  const r = await runTrashBinAlert({
    statsLoader: async () => buildStats(),
    now: now2,
  });
  assert.equal(r.reason, "sent");
  assert.equal(alertCalls.length, 2);
});

test("snooze suppresses send while active and resumes after expiry", async () => {
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
  });
  const now = new Date("2026-05-22T00:00:00Z");
  const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  await setAudienceArchiveTrashBinNotifierSnooze({
    snoozeUntil: future,
    now,
  });
  const r1 = await runTrashBinAlert({
    statsLoader: async () => buildStats(),
    now,
  });
  assert.equal(r1.reason, "snoozed");
  assert.equal(alertCalls.length, 0);

  // After expiry, sends.
  const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const r2 = await runTrashBinAlert({
    statsLoader: async () => buildStats(),
    now: later,
  });
  assert.equal(r2.reason, "sent");
  assert.equal(alertCalls.length, 1);
});

test("snooze rejects past timestamps and caps at 90 days", async () => {
  const now = new Date("2026-05-22T00:00:00Z");
  await assert.rejects(
    () =>
      setAudienceArchiveTrashBinNotifierSnooze({
        snoozeUntil: new Date(now.getTime() - 1000).toISOString(),
        now,
      }),
    /future/i,
  );
  await assert.rejects(
    () =>
      setAudienceArchiveTrashBinNotifierSnooze({
        snoozeUntil: "not-a-date",
        now,
      }),
    /invalid/i,
  );
  // 200 days in the future — should clamp to 90.
  const farFuture = new Date(now.getTime() + 200 * 24 * 60 * 60 * 1000).toISOString();
  const cfg = await setAudienceArchiveTrashBinNotifierSnooze({
    snoozeUntil: farFuture,
    now,
  });
  const cappedMs = Date.parse(cfg.snoozeUntil!);
  const maxMs = now.getTime() + 90 * 24 * 60 * 60 * 1000;
  assert.equal(cappedMs, maxMs);
});

test("snooze can be cleared with null", async () => {
  const now = new Date("2026-05-22T00:00:00Z");
  await setAudienceArchiveTrashBinNotifierSnooze({
    snoozeUntil: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    now,
  });
  const cfg = await setAudienceArchiveTrashBinNotifierSnooze({
    snoozeUntil: null,
    now,
  });
  assert.equal(cfg.snoozeUntil, null);
});

test("send failure is caught, logged, and dedup state not advanced", async () => {
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
  });
  alertImpl = async () => {
    throw new Error("resend down");
  };
  const r = await runTrashBinAlert({ statsLoader: async () => buildStats() });
  assert.equal(r.notified, false);
  assert.equal(r.reason, "send_failed");

  const cfg = await getAudienceArchiveTrashBinNotifierConfig();
  assert.equal(cfg.lastAlertAt, null);
  assert.equal(cfg.lastAlertSignature, null);

  // Next tick with working email should still send.
  alertImpl = async () => ({ id: "mock" });
  const r2 = await runTrashBinAlert({ statsLoader: async () => buildStats() });
  assert.equal(r2.reason, "sent");
});

test("stats loader failure is caught and recorded", async () => {
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
  });
  const r = await runTrashBinAlert({
    statsLoader: async () => {
      throw new Error("db down");
    },
  });
  assert.equal(r.reason, "stats_failed");
  assert.equal(alertCalls.length, 0);
});

test("test send requires recipients and bypasses dedup/snooze", async () => {
  await assert.rejects(
    () => sendTestTrashBinAlertEmail({ statsLoader: async () => buildStats() }),
    /no_recipients_configured/,
  );
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: false,
    recipients: ["ops@example.com"],
  });
  const r = await sendTestTrashBinAlertEmail({
    statsLoader: async () => buildStats(),
  });
  assert.equal(r.ok, true);
  assert.equal(alertCalls.length, 1);
  assert.equal(alertCalls[0].payload.isTest, true);
});

test("history is newest-first and bounded by limit", async () => {
  await setAudienceArchiveTrashBinNotifierConfig({
    enabled: true,
    recipients: ["ops@example.com"],
    alertIntervalHours: 24,
  });
  for (let i = 0; i < 5; i++) {
    await runTrashBinAlert({ statsLoader: async () => buildStats() });
  }
  const hist = getAudienceArchiveTrashBinNotifierHistory(3);
  assert.equal(hist.length, 3);
  // First run sent, the rest deduplicated.
  assert.equal(hist[0].reason, "deduplicated");
});
