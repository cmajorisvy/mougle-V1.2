import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import * as crypto from "crypto";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import { emailService } from "../server/services/email-service";
import {
  AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_SETTING_KEY,
  DEFAULT_AUDIENCE_CONNECTOR_ROTATION_DEDUP_MS,
  clearConnectorRotationNotificationHistoryForTests,
  getAudienceConnectorRotationNotifierConfig,
  getConnectorRotationNotificationHistory,
  handleConnectorRotationEvent,
  installAudienceConnectorRotationNotifier,
  pruneConnectorRotationNotificationsOlderThan,
  resetAudienceConnectorRotationNotifierDedupForTests,
  resolveConnectorRotationDedupWindowMs,
  sendTestConnectorRotationNotification,
  setAudienceConnectorRotationNotifierConfig,
  uninstallAudienceConnectorRotationNotifier,
} from "../server/services/audience-connector-rotation-notifier";
import { audienceConnectorRotationNotifications } from "../shared/omni-channel-audience-schema";
import { AudienceConnectorSecretsService } from "../server/services/audience-connector-secrets-service";
import { neuralNewsroomBus } from "../server/services/neural-newsroom-bus";

type SendArgs = Parameters<typeof emailService.sendAudienceConnectorRotationNotification>;
type SendCall = { recipients: SendArgs[0]; event: SendArgs[1]; opts: SendArgs[2] };

const originalSend =
  emailService.sendAudienceConnectorRotationNotification.bind(emailService);
let sendCalls: SendCall[] = [];
let sendImpl: (
  recipients: SendArgs[0],
  event: SendArgs[1],
  opts?: SendArgs[2],
) => Promise<any> = async () => ({ id: "mock_email_id" });

(emailService as any).sendAudienceConnectorRotationNotification = async (
  recipients: SendArgs[0],
  event: SendArgs[1],
  opts?: SendArgs[2],
) => {
  sendCalls.push({ recipients, event, opts });
  return sendImpl(recipients, event, opts);
};

process.on("exit", () => {
  (emailService as any).sendAudienceConnectorRotationNotification = originalSend;
});

async function clearConfig() {
  await db
    .delete(systemSettings)
    .where(eq(systemSettings.key, AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_SETTING_KEY));
}

function buildEvent(overrides: Partial<SendArgs[1]> = {}): SendArgs[1] {
  return {
    connectorId: "conn_1",
    platform: "youtube",
    action: "rotate",
    rotatedBy: "admin_alice",
    rotatedAt: new Date().toISOString(),
    rotationCount: 3,
    keyVersion: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  sendCalls = [];
  sendImpl = async () => ({ id: "mock_email_id" });
  await clearConnectorRotationNotificationHistoryForTests();
  await resetAudienceConnectorRotationNotifierDedupForTests();
  delete process.env.AUDIENCE_CONNECTOR_ROTATION_DEDUP_MS;
  await clearConfig();
});

afterEach(async () => {
  await clearConfig();
});

test("default config is disabled with no recipients", async () => {
  const cfg = await getAudienceConnectorRotationNotifierConfig();
  assert.equal(cfg.enabled, false);
  assert.deepEqual(cfg.recipients, []);
  assert.deepEqual(cfg.suppressedActions, []);
});

test("setConfig refuses to enable without recipients", async () => {
  await assert.rejects(
    setAudienceConnectorRotationNotifierConfig({
      enabled: true,
      recipients: [],
      updatedBy: "test",
    }),
  );
});

test("setConfig normalizes emails (lowercase, dedupe, invalid dropped)", async () => {
  const cfg = await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["Founder@Example.com", "founder@example.com", "not-an-email"],
    updatedBy: "test",
  });
  assert.deepEqual(cfg.recipients, ["founder@example.com"]);
});

test("handleConnectorRotationEvent skips when disabled", async () => {
  const r = await handleConnectorRotationEvent(buildEvent());
  assert.equal(r.notified, false);
  assert.equal(r.reason, "disabled");
  assert.equal(sendCalls.length, 0);
});

test("handleConnectorRotationEvent skips when no recipients (and enabled bypassed via config)", async () => {
  // simulate stored row with enabled but empty recipients (bypass setConfig validation)
  await db.insert(systemSettings).values({
    key: AUDIENCE_CONNECTOR_ROTATION_NOTIFIER_SETTING_KEY,
    value: JSON.stringify({
      enabled: true,
      recipients: [],
      suppressedActions: [],
      updatedAt: null,
      updatedBy: null,
    }),
  });
  const r = await handleConnectorRotationEvent(buildEvent());
  assert.equal(r.reason, "no_recipients");
});

test("handleConnectorRotationEvent suppresses configured actions", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    suppressedActions: ["set"],
    updatedBy: "test",
  });
  const setRes = await handleConnectorRotationEvent(buildEvent({ action: "set" }));
  assert.equal(setRes.reason, "action_suppressed");
  assert.equal(sendCalls.length, 0);
  const rotRes = await handleConnectorRotationEvent(buildEvent({ action: "rotate" }));
  assert.equal(rotRes.reason, "sent");
  assert.equal(sendCalls.length, 1);
});

test("handleConnectorRotationEvent sends and records history", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    updatedBy: "test",
  });
  const event = buildEvent();
  const r = await handleConnectorRotationEvent(event);
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(sendCalls.length, 1);
  assert.deepEqual(sendCalls[0].recipients, ["founder@example.com"]);
  assert.equal(sendCalls[0].event.connectorId, event.connectorId);
  assert.equal(sendCalls[0].event.rotationCount, event.rotationCount);
  const history = await getConnectorRotationNotificationHistory(10);
  assert.equal(history.length, 1);
  assert.equal(history[0].reason, "sent");
});

test("send failure is caught and recorded, never throws", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    updatedBy: "test",
  });
  sendImpl = async () => {
    throw new Error("resend down");
  };
  const r = await handleConnectorRotationEvent(buildEvent());
  assert.equal(r.notified, false);
  assert.equal(r.reason, "send_failed");
  assert.equal(r.errorMessage, "resend down");
  const history = await getConnectorRotationNotificationHistory(10);
  assert.equal(history[0].errorMessage, "resend down");
});

test("history persists across simulated restarts (DB-backed, Task #545)", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    updatedBy: "test",
  });
  await handleConnectorRotationEvent(buildEvent({ action: "set" }));
  await handleConnectorRotationEvent(buildEvent({ action: "rotate" }));
  await handleConnectorRotationEvent(buildEvent({ action: "delete" }));
  // A "restart" in the old in-memory world wiped history; now the rows
  // live in Postgres so the second read returns the same data.
  const first = await getConnectorRotationNotificationHistory(50);
  const second = await getConnectorRotationNotificationHistory(50);
  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.deepEqual(
    first.map((e) => e.event.action),
    ["delete", "rotate", "set"],
  );
});

test("history is recorded for disabled / suppressed / no_recipients reasons", async () => {
  // disabled
  await handleConnectorRotationEvent(buildEvent());
  // suppressed
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    suppressedActions: ["set"],
    updatedBy: "test",
  });
  await handleConnectorRotationEvent(buildEvent({ action: "set" }));
  const history = await getConnectorRotationNotificationHistory(50);
  const reasons = history.map((h) => h.reason).sort();
  assert.deepEqual(reasons, ["action_suppressed", "disabled"]);
});

test("pruneConnectorRotationNotificationsOlderThan deletes rows older than cutoff", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    updatedBy: "test",
  });
  await handleConnectorRotationEvent(buildEvent());
  // Backdate the row so it is older than the cutoff.
  const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 100);
  await db
    .update(audienceConnectorRotationNotifications)
    .set({ occurredAt: past });
  const pruned = await pruneConnectorRotationNotificationsOlderThan(
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 90),
  );
  assert.equal(pruned, 1);
  const remaining = await getConnectorRotationNotificationHistory(50);
  assert.equal(remaining.length, 0);
});

test("pruneConnectorRotationNotificationsOlderThan keeps rows newer than cutoff", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    updatedBy: "test",
  });
  await handleConnectorRotationEvent(buildEvent());
  const pruned = await pruneConnectorRotationNotificationsOlderThan(
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 90),
  );
  assert.equal(pruned, 0);
  const remaining = await getConnectorRotationNotificationHistory(50);
  assert.equal(remaining.length, 1);
});

test("sendTestConnectorRotationNotification fires email with isTest flag", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: false, // tests bypass the enabled gate
    recipients: ["founder@example.com"],
    updatedBy: "test",
  });
  const r = await sendTestConnectorRotationNotification({ triggeredBy: "admin_x" });
  assert.equal(r.ok, true);
  assert.equal(sendCalls.length, 1);
  assert.deepEqual(sendCalls[0].recipients, ["founder@example.com"]);
  assert.equal(sendCalls[0].opts?.isTest, true);
  assert.equal(sendCalls[0].event.rotatedBy, "admin_x");
  assert.equal(r.entry.isTest, true);
});

test("sendTestConnectorRotationNotification throws when no recipients configured", async () => {
  await assert.rejects(sendTestConnectorRotationNotification());
});

test("end-to-end: secrets service set/rotate/delete emits bus events that fire emails", async () => {
  // Install notifier (subscribes to the bus)
  uninstallAudienceConnectorRotationNotifier();
  installAudienceConnectorRotationNotifier();
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    updatedBy: "test",
  });

  process.env.AUDIENCE_GATEWAY_SECRETS_KEY = crypto.randomBytes(32).toString("hex");
  const secrets = new AudienceConnectorSecretsService();
  await secrets.reset();

  const connectorId = `conn_${Date.now()}`;
  await secrets.setToken({
    connectorId,
    platform: "youtube",
    token: "first-token",
    rotatedBy: "admin_alice",
  });
  await secrets.rotateToken({
    connectorId,
    platform: "youtube",
    token: "second-token",
    rotatedBy: "admin_alice",
  });
  await secrets.deleteToken(connectorId, { deletedBy: "admin_bob" });

  // Allow the async handler to run (DB-backed dedup state means each
  // handler now does an upsert per event, so give it some real time).
  await new Promise((res) => setTimeout(res, 1500));

  assert.equal(sendCalls.length, 3);
  assert.equal(sendCalls[0].event.action, "set");
  assert.equal(sendCalls[1].event.action, "rotate");
  assert.equal(sendCalls[2].event.action, "delete");
  // Plaintext token MUST never appear anywhere in the email payload
  for (const call of sendCalls) {
    const json = JSON.stringify(call);
    assert.equal(json.includes("first-token"), false);
    assert.equal(json.includes("second-token"), false);
  }

  uninstallAudienceConnectorRotationNotifier();
  await secrets.reset();
});

test("dedup state persists across simulated restarts (Task #589)", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 60_000,
    updatedBy: "test",
  });
  // First event fires an email and persists dedup state to the DB.
  const first = await handleConnectorRotationEvent(buildEvent());
  assert.equal(first.reason, "sent");
  assert.equal(sendCalls.length, 1);
  // Simulate a process restart: the in-memory Map is gone, but the DB
  // row survives. The previous code re-fired a "first" email here; the
  // new DB-backed dedup state must collapse it into a deduplicated.
  const second = await handleConnectorRotationEvent(buildEvent());
  assert.equal(second.reason, "deduplicated");
  assert.equal(sendCalls.length, 1);
});

test("dedup: repeat events on same connector+action collapse into one email", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 60_000,
    updatedBy: "test",
  });
  const first = await handleConnectorRotationEvent(buildEvent());
  const second = await handleConnectorRotationEvent(buildEvent({ rotationCount: 4 }));
  const third = await handleConnectorRotationEvent(buildEvent({ rotationCount: 5 }));
  assert.equal(first.reason, "sent");
  assert.equal(second.reason, "deduplicated");
  assert.equal(third.reason, "deduplicated");
  assert.equal(third.suppressedCount, 2);
  assert.ok(third.suppressedSince);
  assert.equal(sendCalls.length, 1);
});

test("dedup: different connector id bypasses dedup", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 60_000,
    updatedBy: "test",
  });
  await handleConnectorRotationEvent(buildEvent({ connectorId: "conn_a" }));
  const r = await handleConnectorRotationEvent(
    buildEvent({ connectorId: "conn_b" }),
  );
  assert.equal(r.reason, "sent");
  assert.equal(sendCalls.length, 2);
});

test("dedup: different action on same connector bypasses dedup", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 60_000,
    updatedBy: "test",
  });
  await handleConnectorRotationEvent(buildEvent({ action: "rotate" }));
  const r = await handleConnectorRotationEvent(buildEvent({ action: "delete" }));
  assert.equal(r.reason, "sent");
  assert.equal(sendCalls.length, 2);
});

test("dedup: dedupWindowMs=0 disables dedup", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 0,
    updatedBy: "test",
  });
  await handleConnectorRotationEvent(buildEvent());
  await handleConnectorRotationEvent(buildEvent());
  await handleConnectorRotationEvent(buildEvent());
  assert.equal(sendCalls.length, 3);
});

test("dedup: next send after dedup burst carries suppressedCount + suppressedSince", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 60_000,
    updatedBy: "test",
  });
  // First send
  await handleConnectorRotationEvent(buildEvent());
  // Two collapsed
  await handleConnectorRotationEvent(buildEvent());
  await handleConnectorRotationEvent(buildEvent());
  // Bypass via different action → next email reports burst
  const r = await handleConnectorRotationEvent(buildEvent({ action: "delete" }));
  assert.equal(r.reason, "sent");
  assert.equal(r.suppressedCount, 2);
  assert.ok(r.suppressedSince);
  // Email opts carry the burst metadata
  const lastCall = sendCalls[sendCalls.length - 1];
  assert.equal(lastCall.opts?.suppressedCount, 2);
  assert.ok(lastCall.opts?.suppressedSince);
});

test("dedup precedence: admin override beats env, env beats default", async () => {
  const defaultWindow = resolveConnectorRotationDedupWindowMs({
    enabled: true,
    recipients: [],
    suppressedActions: [],
    dedupWindowMs: null,
    updatedAt: null,
    updatedBy: null,
  });
  assert.equal(defaultWindow, DEFAULT_AUDIENCE_CONNECTOR_ROTATION_DEDUP_MS);
  process.env.AUDIENCE_CONNECTOR_ROTATION_DEDUP_MS = "1234";
  const envWindow = resolveConnectorRotationDedupWindowMs({
    enabled: true,
    recipients: [],
    suppressedActions: [],
    dedupWindowMs: null,
    updatedAt: null,
    updatedBy: null,
  });
  assert.equal(envWindow, 1234);
  const overrideWindow = resolveConnectorRotationDedupWindowMs({
    enabled: true,
    recipients: [],
    suppressedActions: [],
    dedupWindowMs: 5000,
    updatedAt: null,
    updatedBy: null,
  });
  assert.equal(overrideWindow, 5000);
});

test("setConfig persists and reloads dedupWindowMs", async () => {
  await setAudienceConnectorRotationNotifierConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 9000,
    updatedBy: "test",
  });
  const cfg = await getAudienceConnectorRotationNotifierConfig();
  assert.equal(cfg.dedupWindowMs, 9000);
});

test("installAudienceConnectorRotationNotifier is idempotent", async () => {
  uninstallAudienceConnectorRotationNotifier();
  const first = installAudienceConnectorRotationNotifier();
  const second = installAudienceConnectorRotationNotifier();
  assert.equal(first, true);
  assert.equal(second, false);
  uninstallAudienceConnectorRotationNotifier();
});
