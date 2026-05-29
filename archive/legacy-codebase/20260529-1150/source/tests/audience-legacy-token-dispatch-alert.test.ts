import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import { emailService } from "../server/services/email-service";
import {
  AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_SETTING_KEY,
  DEFAULT_LEGACY_TOKEN_DISPATCH_DEDUP_MS,
  getAudienceLegacyTokenDispatchAlertConfig,
  getLegacyTokenDispatchAlertHistory,
  handleLegacyTokenDispatchEvent,
  installAudienceLegacyTokenDispatchAlert,
  pruneLegacyTokenDispatchAlertsOlderThan,
  resetAudienceLegacyTokenDispatchAlertDedupForTests,
  setAudienceLegacyTokenDispatchAlertConfig,
  uninstallAudienceLegacyTokenDispatchAlert,
  type LegacyTokenDispatchEventPayload,
} from "../server/services/audience-legacy-token-dispatch-alert-service";
import { audienceLegacyTokenDispatchAlerts } from "../shared/omni-channel-audience-schema";
import { neuralNewsroomBus } from "../server/services/neural-newsroom-bus";

type AlertArgs = Parameters<typeof emailService.sendAdminAlert>;
type AlertCall = { to: AlertArgs[0]; alert: AlertArgs[1] };

const originalSend = emailService.sendAdminAlert.bind(emailService);
let alertCalls: AlertCall[] = [];
let sendImpl: (to: AlertArgs[0], alert: AlertArgs[1]) => Promise<any> =
  async () => ({ id: "mock_alert" });

(emailService as any).sendAdminAlert = async (
  to: AlertArgs[0],
  alert: AlertArgs[1],
) => {
  alertCalls.push({ to, alert });
  return sendImpl(to, alert);
};

process.on("exit", () => {
  (emailService as any).sendAdminAlert = originalSend;
});

async function clearConfig() {
  await db
    .delete(systemSettings)
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_LEGACY_TOKEN_DISPATCH_ALERT_SETTING_KEY,
      ),
    );
}

function buildPayload(
  overrides: Partial<LegacyTokenDispatchEventPayload> = {},
): LegacyTokenDispatchEventPayload {
  return {
    commandId: "cmd_1",
    connectorId: "conn_yt_1",
    platform: "youtube",
    requestedAction: "hide_comment",
    tokenSource: "legacy_env_fallback",
    connectorDisplayName: "Main YouTube",
    apiAccessMode: "official_api",
    platformSendApproved: true,
    ...overrides,
  };
}

beforeEach(async () => {
  alertCalls = [];
  sendImpl = async () => ({ id: "mock_alert" });
  resetAudienceLegacyTokenDispatchAlertDedupForTests();
  delete process.env.AUDIENCE_LEGACY_TOKEN_DISPATCH_DEDUP_MS;
  await clearConfig();
  await db.delete(audienceLegacyTokenDispatchAlerts);
});

afterEach(() => {
  uninstallAudienceLegacyTokenDispatchAlert();
});

test("default config is disabled with empty recipients", async () => {
  const cfg = await getAudienceLegacyTokenDispatchAlertConfig();
  assert.equal(cfg.enabled, false);
  assert.deepEqual(cfg.recipients, []);
  assert.equal(cfg.dedupWindowMs, null);
});

test("normalizes recipients and persists config", async () => {
  const cfg = await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["  Founder@Example.com  ", "bad", "founder@example.com"],
    dedupWindowMs: 60_000,
    updatedBy: "root_admin",
  });
  assert.equal(cfg.enabled, true);
  assert.deepEqual(cfg.recipients, ["founder@example.com"]);
  assert.equal(cfg.dedupWindowMs, 60_000);
  const reloaded = await getAudienceLegacyTokenDispatchAlertConfig();
  assert.deepEqual(reloaded.recipients, ["founder@example.com"]);
});

test("rejects enabling with no valid recipients", async () => {
  await assert.rejects(
    setAudienceLegacyTokenDispatchAlertConfig({
      enabled: true,
      recipients: ["bad-not-an-email"],
    }),
    /at least one recipient/,
  );
});

test("ignores events that did not use the legacy env fallback", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  const r = await handleLegacyTokenDispatchEvent(
    buildPayload({ tokenSource: "per_connector_secret" }),
  );
  assert.equal(r.notified, false);
  assert.equal(r.reason, "not_legacy_fallback");
  assert.equal(alertCalls.length, 0);
});

test("ignores connectors that are not on official_api or not approved", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  const a = await handleLegacyTokenDispatchEvent(
    buildPayload({ apiAccessMode: "limited_api" }),
  );
  assert.equal(a.reason, "not_official_api");
  const b = await handleLegacyTokenDispatchEvent(
    buildPayload({ platformSendApproved: false }),
  );
  assert.equal(b.reason, "not_approved");
  assert.equal(alertCalls.length, 0);
});

test("does not send when disabled or no recipients", async () => {
  const a = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(a.reason, "disabled");
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: false,
    recipients: ["founder@example.com"],
  });
  const b = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(b.reason, "disabled");
  assert.equal(alertCalls.length, 0);
});

test("sends one email per recipient when legacy fallback served the dispatch", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com", "ops@example.com"],
  });
  const r = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(r.notified, true);
  assert.equal(r.reason, "sent");
  assert.equal(alertCalls.length, 2);
  const subjects = alertCalls.map((c) => c.alert.title);
  for (const s of subjects) {
    assert.match(s, /\[LEGACY TOKEN\]/);
    assert.match(s, /Main YouTube/);
    assert.match(s, /youtube/);
  }
  // Message body must guide the founder to install a per-connector secret
  // and must NOT leak any token material.
  for (const call of alertCalls) {
    assert.match(call.alert.message, /per-connector secret/i);
    assert.doesNotMatch(call.alert.message, /AUDIENCE_GATEWAY_YOUTUBE_TOKEN=/);
  }
});

test("dedupes repeat dispatches from the same connector within the window", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 60_000,
  });
  let now = 1_000_000;
  const tick = () => now;
  const first = await handleLegacyTokenDispatchEvent(
    buildPayload(),
    undefined,
    tick,
  );
  assert.equal(first.reason, "sent");
  now += 30_000;
  const second = await handleLegacyTokenDispatchEvent(
    buildPayload({ commandId: "cmd_2" }),
    undefined,
    tick,
  );
  assert.equal(second.reason, "deduplicated");
  assert.equal(alertCalls.length, 1);
  // Past the dedup window — fires again, and the subject mentions the
  // suppressed burst.
  now += 60_001;
  const third = await handleLegacyTokenDispatchEvent(
    buildPayload({ commandId: "cmd_3" }),
    undefined,
    tick,
  );
  assert.equal(third.reason, "sent");
  assert.equal(alertCalls.length, 2);
  assert.match(alertCalls[1].alert.title, /suppressed/);
});

test("a different connector fires immediately even within the window", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 60_000,
  });
  const r1 = await handleLegacyTokenDispatchEvent(
    buildPayload({ connectorId: "conn_a" }),
  );
  assert.equal(r1.reason, "sent");
  const r2 = await handleLegacyTokenDispatchEvent(
    buildPayload({ connectorId: "conn_b" }),
  );
  assert.equal(r2.reason, "sent");
  assert.equal(alertCalls.length, 2);
});

test("dedup window resolves admin override > env > default", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  // No override, no env → default 24h
  const r1 = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(r1.dedupWindowMs, DEFAULT_LEGACY_TOKEN_DISPATCH_DEDUP_MS);
  resetAudienceLegacyTokenDispatchAlertDedupForTests();
  // Env wins over default
  process.env.AUDIENCE_LEGACY_TOKEN_DISPATCH_DEDUP_MS = "5000";
  const r2 = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(r2.dedupWindowMs, 5_000);
  resetAudienceLegacyTokenDispatchAlertDedupForTests();
  // Admin override wins over env
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
    dedupWindowMs: 1234,
  });
  const r3 = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(r3.dedupWindowMs, 1234);
});

test("send failures never throw and are reported as send_failed", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  sendImpl = async () => {
    throw new Error("resend boom");
  };
  const r = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(r.notified, false);
  assert.equal(r.reason, "send_failed");
});

test("bus install path catches dispatched events and triggers the alert", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  installAudienceLegacyTokenDispatchAlert();
  neuralNewsroomBus.emit(
    "audience.gateway_send_dispatched",
    buildPayload({ commandId: "cmd_bus" }),
  );
  // Handler is fire-and-forget; poll until the async handler completes.
  for (let i = 0; i < 50 && alertCalls.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(alertCalls.length, 1);
  assert.match(alertCalls[0].alert.title, /\[LEGACY TOKEN\]/);
});

test("per_connector_secret dispatches on the bus never fire the alert", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  installAudienceLegacyTokenDispatchAlert();
  neuralNewsroomBus.emit(
    "audience.gateway_send_dispatched",
    buildPayload({ tokenSource: "per_connector_secret" }),
  );
  // Give the async handler time to complete (it should bail out early
  // because tokenSource !== "legacy_env_fallback").
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(alertCalls.length, 0);
});

test("persists a history row for every decision and reads them newest-first", async () => {
  // not_legacy_fallback (skips all subsequent gates)
  const r1 = await handleLegacyTokenDispatchEvent(
    buildPayload({ tokenSource: "per_connector_secret" }),
  );
  assert.equal(r1.reason, "not_legacy_fallback");
  // disabled
  const r2 = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(r2.reason, "disabled");
  // sent
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  const r3 = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(r3.reason, "sent");
  // deduplicated
  const r4 = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(r4.reason, "deduplicated");

  const history = await getLegacyTokenDispatchAlertHistory(10);
  assert.equal(history.length, 4);
  // newest-first
  assert.deepEqual(
    history.map((h) => h.reason),
    ["deduplicated", "sent", "disabled", "not_legacy_fallback"],
  );
  const sent = history.find((h) => h.reason === "sent")!;
  assert.equal(sent.connectorId, "conn_yt_1");
  assert.equal(sent.platform, "youtube");
  assert.equal(sent.notified, true);
  assert.deepEqual(sent.recipients, ["founder@example.com"]);
  assert.ok(sent.id.startsWith("lta_"));
});

test("send_failed history rows capture the error message", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  sendImpl = async () => {
    throw new Error("resend boom");
  };
  const r = await handleLegacyTokenDispatchEvent(buildPayload());
  assert.equal(r.reason, "send_failed");
  const history = await getLegacyTokenDispatchAlertHistory(5);
  assert.equal(history.length, 1);
  assert.equal(history[0].reason, "send_failed");
  assert.equal(history[0].notified, false);
  assert.equal(history[0].errorMessage, "resend boom");
});

test("history limit is clamped to [1, 50]", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  for (let i = 0; i < 3; i++) {
    await handleLegacyTokenDispatchEvent(
      buildPayload({ connectorId: `conn_${i}` }),
    );
  }
  const tooSmall = await getLegacyTokenDispatchAlertHistory(0);
  assert.equal(tooSmall.length, 3); // 0 -> default 20, capped by row count
  const tooBig = await getLegacyTokenDispatchAlertHistory(9999);
  assert.equal(tooBig.length, 3);
  const limited = await getLegacyTokenDispatchAlertHistory(2);
  assert.equal(limited.length, 2);
});

test("pruneLegacyTokenDispatchAlertsOlderThan drops rows older than cutoff", async () => {
  await setAudienceLegacyTokenDispatchAlertConfig({
    enabled: true,
    recipients: ["founder@example.com"],
  });
  // Insert an "old" row directly so we can prune it.
  await db.insert(audienceLegacyTokenDispatchAlerts).values({
    alertId: "lta_old_1",
    connectorId: "conn_old",
    platform: "youtube",
    reason: "sent",
    notified: true,
    recipients: ["founder@example.com"],
    platformSendApproved: true,
    dedupWindowMs: 0,
    occurredAt: new Date("2000-01-01T00:00:00.000Z"),
  });
  // And one "fresh" row through the normal path.
  const r = await handleLegacyTokenDispatchEvent(
    buildPayload({ connectorId: "conn_fresh" }),
  );
  assert.equal(r.reason, "sent");

  const before = await getLegacyTokenDispatchAlertHistory(10);
  assert.equal(before.length, 2);

  const pruned = await pruneLegacyTokenDispatchAlertsOlderThan(
    new Date("2020-01-01T00:00:00.000Z"),
  );
  assert.equal(pruned, 1);
  const after = await getLegacyTokenDispatchAlertHistory(10);
  assert.equal(after.length, 1);
  assert.equal(after[0].connectorId, "conn_fresh");
});
