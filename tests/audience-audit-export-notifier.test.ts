import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import { emailService } from "../server/services/email-service";
import {
  AUDIENCE_AUDIT_EXPORT_NOTIFIER_SETTING_KEY,
  clearAuditExportNotificationHistory,
  getAudienceAuditExportNotifierConfig,
  getAuditExportNotificationHistory,
  handleAuditExportEvent,
  installAudienceAuditExportNotifier,
  pruneAuditExportNotificationsOlderThan,
  resetAudienceAuditExportNotifierDedupForTests,
  sendTestAuditExportNotification,
  setAudienceAuditExportNotifierConfig,
  uninstallAudienceAuditExportNotifier,
} from "../server/services/audience-audit-export-notifier";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import {
  audienceAuditExportNotifications,
  type AudienceAuditExportRecord,
} from "../shared/omni-channel-audience-schema";

type SendArgs = Parameters<typeof emailService.sendAudienceAuditExportNotification>;
type SendCall = { recipients: SendArgs[0]; payload: SendArgs[1] };

const originalSend = emailService.sendAudienceAuditExportNotification.bind(emailService);
let sendCalls: SendCall[] = [];
let sendImpl: (recipients: SendArgs[0], payload: SendArgs[1]) => Promise<any> =
  async () => ({ id: "mock_email_id" });

(emailService as any).sendAudienceAuditExportNotification = async (
  recipients: SendArgs[0],
  payload: SendArgs[1],
) => {
  sendCalls.push({ recipients, payload });
  return sendImpl(recipients, payload);
};

process.on("exit", () => {
  (emailService as any).sendAudienceAuditExportNotification = originalSend;
});

async function clearConfig() {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_AUDIT_EXPORT_NOTIFIER_SETTING_KEY));
}

function buildRecord(overrides: Partial<AudienceAuditExportRecord> = {}): AudienceAuditExportRecord {
  return {
    exportId: "aud_exp_test_1",
    actorId: "admin_user_1",
    actorType: "root_admin",
    actorRole: "super_admin",
    format: "json",
    filters: {
      fromDate: null,
      toDate: null,
      platform: null,
      productionId: null,
    },
    rowCounts: { connectors: 1, messages: 5, decisions: 5, commands: 2, total: 13 },
    riskSignals: [],
    exportedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(async () => {
  sendCalls = [];
  sendImpl = async () => ({ id: "mock_email_id" });
  resetAudienceAuditExportNotifierDedupForTests();
  delete process.env.AUDIENCE_AUDIT_EXPORT_DEDUP_MS;
  await clearConfig();
  await clearAuditExportNotificationHistory();
});

afterEach(() => {
  sendImpl = async () => ({ id: "mock_email_id" });
});

test("default config is disabled with no recipients", async () => {
  const cfg = await getAudienceAuditExportNotifierConfig();
  assert.equal(cfg.enabled, false);
  assert.deepEqual(cfg.recipients, []);
  assert.equal(cfg.minRowCount, 0);
  assert.deepEqual(cfg.suppressedActorIds, []);
  assert.equal(cfg.dedupWindowMs, null);
});

test("setConfig normalizes recipients (trim/lowercase/dedupe) and rejects enable without recipients", async () => {
  await assert.rejects(
    setAudienceAuditExportNotifierConfig({
      enabled: true,
      recipients: [],
      minRowCount: 0,
      updatedBy: "tester",
    }),
    /recipient/,
  );
  const cfg = await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["  Founder@Mougle.com ", "founder@mougle.com", "Security@Mougle.com", "not an email"],
    minRowCount: 25,
    suppressedActorIds: ["  admin_founder  ", "admin_founder", ""],
    updatedBy: "tester",
  });
  assert.deepEqual(cfg.recipients, ["founder@mougle.com", "security@mougle.com"]);
  assert.deepEqual(cfg.suppressedActorIds, ["admin_founder"]);
  assert.equal(cfg.minRowCount, 25);
  assert.equal(cfg.updatedBy, "tester");
});

test("handleAuditExportEvent does nothing when disabled", async () => {
  const result = await handleAuditExportEvent(buildRecord());
  assert.equal(result.notified, false);
  assert.equal(result.reason, "disabled");
  assert.equal(sendCalls.length, 0);
});

test("handleAuditExportEvent sends an email when enabled, threshold met, actor not suppressed", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 10,
    suppressedActorIds: ["admin_founder"],
    updatedBy: "tester",
  });
  const result = await handleAuditExportEvent(buildRecord({ actorId: "admin_other", rowCounts: { connectors: 1, messages: 5, decisions: 5, commands: 2, total: 13 } }));
  assert.equal(result.notified, true);
  assert.equal(result.reason, "sent");
  assert.equal(sendCalls.length, 1);
  assert.deepEqual(sendCalls[0].recipients, ["founder@mougle.com"]);
  assert.equal(sendCalls[0].payload.exportId, "aud_exp_test_1");
  assert.equal(sendCalls[0].payload.actorId, "admin_other");
  assert.equal(sendCalls[0].payload.thresholdExceeded, true);
});

test("handleAuditExportEvent suppresses when actor is the founder", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    suppressedActorIds: ["admin_founder"],
    updatedBy: "tester",
  });
  const result = await handleAuditExportEvent(buildRecord({ actorId: "admin_founder" }));
  assert.equal(result.notified, false);
  assert.equal(result.reason, "actor_suppressed");
  assert.equal(sendCalls.length, 0);
});

test("handleAuditExportEvent skips exports below the row-count threshold", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 100,
    updatedBy: "tester",
  });
  const result = await handleAuditExportEvent(buildRecord({
    rowCounts: { connectors: 1, messages: 1, decisions: 1, commands: 1, total: 4 },
  }));
  assert.equal(result.notified, false);
  assert.equal(result.reason, "below_threshold");
  assert.equal(sendCalls.length, 0);
});

test("handleAuditExportEvent reports send_failed when Resend throws and does not rethrow", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    updatedBy: "tester",
  });
  sendImpl = async () => {
    throw new Error("resend down");
  };
  const result = await handleAuditExportEvent(buildRecord());
  assert.equal(result.notified, false);
  assert.equal(result.reason, "send_failed");
});

test("risk signals are forwarded to the email payload (Task #426)", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    updatedBy: "tester",
  });
  const result = await handleAuditExportEvent(
    buildRecord({
      riskSignals: ["full_trail", "first_export_by_actor", "no_date_window"],
    }),
  );
  assert.equal(result.notified, true);
  assert.equal(sendCalls.length, 1);
  assert.deepEqual(sendCalls[0].payload.riskSignals, [
    "full_trail",
    "first_export_by_actor",
    "no_date_window",
  ]);
});

test("installAudienceAuditExportNotifier reacts to recordAuditExport via the bus", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    updatedBy: "tester",
  });
  installAudienceAuditExportNotifier();
  try {
    await omniChannelAudienceSafetyService.recordAuditExport({
      actorId: "admin_pen_test",
      actorType: "root_admin",
      actorRole: "super_admin",
      format: "csv",
      filters: { fromDate: null, toDate: null, platform: null, productionId: null },
      rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0 },
    });
    // The bus subscriber fires-and-forgets; give the microtask queue a
    // chance to flush the async handler before asserting.
    // Bus handler awaits a DB config read + email send; give it ample time.
    for (let i = 0; i < 50 && sendCalls.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(sendCalls.length, 1);
    assert.equal(sendCalls[0].payload.actorId, "admin_pen_test");
    assert.equal(sendCalls[0].payload.format, "csv");
  } finally {
    uninstallAudienceAuditExportNotifier();
  }
});

test("dedup window collapses repeated exports by same actor with same filters into one email", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 60_000,
    updatedBy: "tester",
  });
  const r1 = await handleAuditExportEvent(buildRecord({ exportId: "exp_1" }));
  assert.equal(r1.notified, true);
  assert.equal(r1.reason, "sent");
  assert.equal(sendCalls.length, 1);

  const r2 = await handleAuditExportEvent(buildRecord({ exportId: "exp_2" }));
  assert.equal(r2.notified, false);
  assert.equal(r2.reason, "deduplicated");
  assert.equal(r2.suppressedCount, 1);
  assert.equal(typeof r2.suppressedSince, "string");

  const r3 = await handleAuditExportEvent(buildRecord({ exportId: "exp_3" }));
  assert.equal(r3.notified, false);
  assert.equal(r3.reason, "deduplicated");
  assert.equal(r3.suppressedCount, 2);
  assert.equal(sendCalls.length, 1);
});

test("dedup is bypassed for a different actor", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 60_000,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ actorId: "admin_a", exportId: "a1" }));
  await handleAuditExportEvent(buildRecord({ actorId: "admin_b", exportId: "b1" }));
  assert.equal(sendCalls.length, 2);
  assert.equal(sendCalls[1].payload.actorId, "admin_b");
});

test("dedup is bypassed when filters change", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 60_000,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "f1" }));
  const r = await handleAuditExportEvent(
    buildRecord({
      exportId: "f2",
      filters: {
        fromDate: "2025-01-01T00:00:00.000Z",
        toDate: null,
        platform: null,
        productionId: null,
      },
    }),
  );
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(sendCalls.length, 2);
});

test("dedup is bypassed when row count jumps to >=2x the previous send", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 60_000,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(
    buildRecord({
      exportId: "j1",
      rowCounts: { connectors: 0, messages: 5, decisions: 5, commands: 0, total: 10 },
    }),
  );
  const r = await handleAuditExportEvent(
    buildRecord({
      exportId: "j2",
      rowCounts: { connectors: 0, messages: 50, decisions: 50, commands: 0, total: 100 },
    }),
  );
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(sendCalls.length, 2);
});

test("next email after a dedup burst surfaces suppressed count + since timestamp", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 60_000,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "burst_1" }));
  await handleAuditExportEvent(buildRecord({ exportId: "burst_2" }));
  await handleAuditExportEvent(buildRecord({ exportId: "burst_3" }));
  assert.equal(sendCalls.length, 1);

  // Bypass via row-count jump to flush the burst.
  const r = await handleAuditExportEvent(
    buildRecord({
      exportId: "burst_4",
      rowCounts: { connectors: 0, messages: 100, decisions: 100, commands: 0, total: 200 },
    }),
  );
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(r.suppressedCount, 2);
  assert.equal(typeof r.suppressedSince, "string");
  assert.equal(sendCalls.length, 2);
  assert.equal(sendCalls[1].payload.suppressedCount, 2);
  assert.equal(typeof sendCalls[1].payload.suppressedSince, "string");
});

test("dedupWindowMs=0 disables dedup entirely", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 0,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "z1" }));
  await handleAuditExportEvent(buildRecord({ exportId: "z2" }));
  await handleAuditExportEvent(buildRecord({ exportId: "z3" }));
  assert.equal(sendCalls.length, 3);
});

test("history persists to DB and is returned newest-first with limit cap (Task #448)", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 0,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "h1", actorId: "u1" }));
  await handleAuditExportEvent(buildRecord({ exportId: "h2", actorId: "u2" }));
  await handleAuditExportEvent(buildRecord({ exportId: "h3", actorId: "u3" }));

  const all = await getAuditExportNotificationHistory(50);
  assert.equal(all.length, 3);
  assert.equal(all[0].exportId, "h3");
  assert.equal(all[1].exportId, "h2");
  assert.equal(all[2].exportId, "h1");
  assert.equal(all[0].reason, "sent");
  assert.equal(all[0].notified, true);
  assert.deepEqual(all[0].recipients, ["founder@mougle.com"]);

  const limited = await getAuditExportNotificationHistory(1);
  assert.equal(limited.length, 1);
  assert.equal(limited[0].exportId, "h3");
});

test("history survives across recordHistory + getHistory call boundaries (DB-backed)", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: false,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    updatedBy: "tester",
  });
  // Even disabled exports get a "disabled" history row so the founder
  // can audit suppressed alerts after a restart.
  await handleAuditExportEvent(buildRecord({ exportId: "disabled_1" }));
  const history = await getAuditExportNotificationHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].reason, "disabled");
  assert.equal(history[0].notified, false);
  assert.equal(history[0].exportId, "disabled_1");
});

test("pruneAuditExportNotificationsOlderThan deletes rows older than cutoff", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 0,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "old", actorId: "u_old" }));
  await handleAuditExportEvent(buildRecord({ exportId: "fresh", actorId: "u_fresh" }));

  // Backdate the "old" row to 30 days ago directly in the DB.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db
    .update(audienceAuditExportNotifications)
    .set({ occurredAt: thirtyDaysAgo })
    .where(eq(audienceAuditExportNotifications.exportId, "old"));

  // Prune everything older than 7 days.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pruned = await pruneAuditExportNotificationsOlderThan(cutoff);
  assert.equal(pruned, 1);

  const remaining = await getAuditExportNotificationHistory(50);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].exportId, "fresh");
});

test("admin dedup override takes precedence over env", async () => {
  process.env.AUDIENCE_AUDIT_EXPORT_DEDUP_MS = "0";
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 60_000,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "o1" }));
  const r = await handleAuditExportEvent(buildRecord({ exportId: "o2" }));
  assert.equal(r.reason, "deduplicated");
  assert.equal(sendCalls.length, 1);
});

test("sendTestAuditExportNotification rejects when no recipients are configured", async () => {
  await assert.rejects(
    sendTestAuditExportNotification({ triggeredBy: "admin_tester" }),
    /no_recipients_configured/,
  );
  assert.equal(sendCalls.length, 0);
  assert.equal((await getAuditExportNotificationHistory()).length, 0);
});

test("sendTestAuditExportNotification records a history entry with isTest:true and reason:'sent'", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    updatedBy: "tester",
  });
  const result = await sendTestAuditExportNotification({ triggeredBy: "admin_tester" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.recipients, ["founder@mougle.com"]);
  assert.equal(sendCalls.length, 1);
  const hist = await getAuditExportNotificationHistory();
  assert.equal(hist.length, 1);
  assert.equal(hist[0].isTest, true);
  assert.equal(hist[0].reason, "sent");
  assert.equal(hist[0].notified, true);
  assert.equal(hist[0].actorId, "admin_tester");
  assert.equal(hist[0].id, result.entry.id);
});

test("handleAuditExportEvent appends exactly one history entry per outcome (disabled/suppressed/below_threshold/sent/send_failed)", async () => {
  // disabled
  const rDisabled = await handleAuditExportEvent(buildRecord({ exportId: "h_disabled" }));
  assert.equal(rDisabled.reason, "disabled");
  let hist = await getAuditExportNotificationHistory();
  assert.equal(hist.length, 1);
  assert.equal(hist[0].reason, "disabled");
  assert.equal(hist[0].isTest, false);
  assert.equal(hist[0].exportId, "h_disabled");

  // actor_suppressed
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    suppressedActorIds: ["admin_founder"],
    updatedBy: "tester",
  });
  const rSuppressed = await handleAuditExportEvent(
    buildRecord({ exportId: "h_supp", actorId: "admin_founder" }),
  );
  assert.equal(rSuppressed.reason, "actor_suppressed");
  hist = await getAuditExportNotificationHistory();
  assert.equal(hist.length, 2);
  assert.equal(hist[0].reason, "actor_suppressed");
  assert.equal(hist[0].exportId, "h_supp");

  // below_threshold
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 1000,
    updatedBy: "tester",
  });
  const rBelow = await handleAuditExportEvent(
    buildRecord({
      exportId: "h_below",
      actorId: "admin_below",
      rowCounts: { connectors: 0, messages: 1, decisions: 0, commands: 0, total: 1 },
    }),
  );
  assert.equal(rBelow.reason, "below_threshold");
  hist = await getAuditExportNotificationHistory();
  assert.equal(hist.length, 3);
  assert.equal(hist[0].reason, "below_threshold");
  assert.equal(hist[0].exportId, "h_below");

  // sent
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    updatedBy: "tester",
  });
  const rSent = await handleAuditExportEvent(
    buildRecord({ exportId: "h_sent", actorId: "admin_sent" }),
  );
  assert.equal(rSent.reason, "sent");
  hist = await getAuditExportNotificationHistory();
  assert.equal(hist.length, 4);
  assert.equal(hist[0].reason, "sent");
  assert.equal(hist[0].notified, true);
  assert.equal(hist[0].exportId, "h_sent");

  // send_failed
  sendImpl = async () => {
    throw new Error("smtp blew up");
  };
  const rFailed = await handleAuditExportEvent(
    buildRecord({ exportId: "h_fail", actorId: "admin_fail" }),
  );
  assert.equal(rFailed.reason, "send_failed");
  hist = await getAuditExportNotificationHistory();
  assert.equal(hist.length, 5);
  assert.equal(hist[0].reason, "send_failed");
  assert.equal(hist[0].notified, false);
  assert.equal(hist[0].errorMessage, "smtp blew up");
  assert.equal(hist[0].exportId, "h_fail");
});

test("getAuditExportNotificationHistory filters by actorId (Task #487)", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 0,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "f_a1", actorId: "actor_a" }));
  await handleAuditExportEvent(buildRecord({ exportId: "f_b1", actorId: "actor_b" }));
  await handleAuditExportEvent(buildRecord({ exportId: "f_a2", actorId: "actor_a" }));

  const onlyA = await getAuditExportNotificationHistory(50, { actorId: "actor_a" });
  assert.equal(onlyA.length, 2);
  for (const entry of onlyA) assert.equal(entry.actorId, "actor_a");

  const onlyB = await getAuditExportNotificationHistory(50, { actorId: "actor_b" });
  assert.equal(onlyB.length, 1);
  assert.equal(onlyB[0].actorId, "actor_b");

  // Empty / whitespace actorId is treated as no filter.
  const noFilter = await getAuditExportNotificationHistory(50, { actorId: "  " });
  assert.equal(noFilter.length, 3);

  const missing = await getAuditExportNotificationHistory(50, { actorId: "nobody" });
  assert.equal(missing.length, 0);
});

test("getAuditExportNotificationHistory filters by fromDate/toDate window (Task #487)", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 0,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "d_old", actorId: "u_old" }));
  await handleAuditExportEvent(buildRecord({ exportId: "d_mid", actorId: "u_mid" }));
  await handleAuditExportEvent(buildRecord({ exportId: "d_new", actorId: "u_new" }));

  const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const midDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  await db
    .update(audienceAuditExportNotifications)
    .set({ occurredAt: oldDate })
    .where(eq(audienceAuditExportNotifications.exportId, "d_old"));
  await db
    .update(audienceAuditExportNotifications)
    .set({ occurredAt: midDate })
    .where(eq(audienceAuditExportNotifications.exportId, "d_mid"));

  const fromCutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const recent = await getAuditExportNotificationHistory(50, {
    fromDate: fromCutoff.toISOString(),
  });
  assert.equal(recent.length, 2);
  assert.deepEqual(recent.map((r) => r.exportId).sort(), ["d_mid", "d_new"].sort());

  const toCutoff = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  const older = await getAuditExportNotificationHistory(50, {
    toDate: toCutoff.toISOString(),
  });
  assert.equal(older.length, 2);
  assert.deepEqual(older.map((r) => r.exportId).sort(), ["d_mid", "d_old"].sort());

  const windowed = await getAuditExportNotificationHistory(50, {
    fromDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    toDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(windowed.length, 1);
  assert.equal(windowed[0].exportId, "d_mid");

  // Invalid date strings are ignored, returning all rows.
  const garbage = await getAuditExportNotificationHistory(50, {
    fromDate: "not-a-date",
    toDate: "also-bad",
  });
  assert.equal(garbage.length, 3);
});

test("getAuditExportNotificationHistory filters by reason (Task #487)", async () => {
  // sent
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 0,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "r_sent", actorId: "ra" }));

  // send_failed
  sendImpl = async () => {
    throw new Error("smtp down");
  };
  await handleAuditExportEvent(buildRecord({ exportId: "r_failed", actorId: "rb" }));
  sendImpl = async () => ({ id: "mock_email_id" });

  // below_threshold
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 1_000_000,
    dedupWindowMs: 0,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(
    buildRecord({
      exportId: "r_below",
      actorId: "rc",
      rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0, total: 0 },
    }),
  );

  const sent = await getAuditExportNotificationHistory(50, { reason: "sent" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].exportId, "r_sent");

  const failed = await getAuditExportNotificationHistory(50, { reason: "send_failed" });
  assert.equal(failed.length, 1);
  assert.equal(failed[0].exportId, "r_failed");

  const below = await getAuditExportNotificationHistory(50, { reason: "below_threshold" });
  assert.equal(below.length, 1);
  assert.equal(below[0].exportId, "r_below");

  const dedup = await getAuditExportNotificationHistory(50, { reason: "deduplicated" });
  assert.equal(dedup.length, 0);
});

test("getAuditExportNotificationHistory combines actor + reason + date filters (Task #487)", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 0,
    dedupWindowMs: 0,
    updatedBy: "tester",
  });
  await handleAuditExportEvent(buildRecord({ exportId: "c_keep", actorId: "alice" }));
  await handleAuditExportEvent(buildRecord({ exportId: "c_skip_actor", actorId: "bob" }));
  sendImpl = async () => {
    throw new Error("oops");
  };
  await handleAuditExportEvent(buildRecord({ exportId: "c_skip_reason", actorId: "alice" }));
  sendImpl = async () => ({ id: "mock_email_id" });

  const fromCutoff = new Date(Date.now() - 60 * 1000).toISOString();
  const filtered = await getAuditExportNotificationHistory(50, {
    actorId: "alice",
    reason: "sent",
    fromDate: fromCutoff,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].exportId, "c_keep");
});

test("history ring buffer is capped at 50 entries (newest first)", async () => {
  await setAudienceAuditExportNotifierConfig({
    enabled: true,
    recipients: ["founder@mougle.com"],
    minRowCount: 1_000_000,
    updatedBy: "tester",
  });
  for (let i = 0; i < 60; i++) {
    await handleAuditExportEvent(
      buildRecord({
        exportId: `cap_${i}`,
        actorId: `admin_cap_${i}`,
        rowCounts: { connectors: 0, messages: 0, decisions: 0, commands: 0, total: 0 },
      }),
    );
  }
  const hist = await getAuditExportNotificationHistory(50);
  assert.equal(hist.length, 50);
  assert.equal(hist[0].exportId, "cap_59");
  assert.equal(hist[49].exportId, "cap_10");
  for (const entry of hist) {
    assert.equal(entry.reason, "below_threshold");
  }
});
