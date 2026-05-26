import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { emailService } from "../server/services/email-service";
import {
  DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_CONFIG,
  getLegacyTokenKillSwitchNotificationHistory,
  handleLegacyTokenKillSwitchFlip,
  resetLegacyTokenKillSwitchNotifierDedupForTests,
  type AudienceLegacyTokenKillSwitchNotifierConfig,
  type LegacyTokenKillSwitchFlipEvent,
} from "../server/services/audience-legacy-token-kill-switch-notifier";

type SendArgs = Parameters<
  typeof emailService.sendAudienceLegacyTokenKillSwitchNotification
>;
type SendCall = {
  recipients: SendArgs[0];
  event: SendArgs[1];
  opts: SendArgs[2];
};

const originalSend =
  emailService.sendAudienceLegacyTokenKillSwitchNotification.bind(emailService);
let sendCalls: SendCall[] = [];
let sendImpl: (
  recipients: SendArgs[0],
  event: SendArgs[1],
  opts?: SendArgs[2],
) => Promise<any> = async () => ({ id: "mock_email_id" });

(emailService as any).sendAudienceLegacyTokenKillSwitchNotification = async (
  recipients: SendArgs[0],
  event: SendArgs[1],
  opts?: SendArgs[2],
) => {
  sendCalls.push({ recipients, event, opts: opts ?? {} });
  return sendImpl(recipients, event, opts);
};

process.on("exit", () => {
  (emailService as any).sendAudienceLegacyTokenKillSwitchNotification =
    originalSend;
});

function cfg(
  overrides: Partial<AudienceLegacyTokenKillSwitchNotifierConfig> = {},
): AudienceLegacyTokenKillSwitchNotifierConfig {
  return {
    ...DEFAULT_AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_NOTIFIER_CONFIG,
    ...overrides,
  };
}

function loader(c: AudienceLegacyTokenKillSwitchNotifierConfig) {
  return async () => c;
}

function buildEvent(
  overrides: Partial<LegacyTokenKillSwitchFlipEvent> = {},
): LegacyTokenKillSwitchFlipEvent {
  return {
    platform: "youtube",
    previousValue: "false",
    newValue: "true",
    updatedBy: "admin_user_1",
    batchId: null,
    flippedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  sendCalls = [];
  sendImpl = async () => ({ id: "mock_email_id" });
  resetLegacyTokenKillSwitchNotifierDedupForTests();
  delete process.env.AUDIENCE_LEGACY_TOKEN_KILL_SWITCH_DEDUP_MS;
});

afterEach(() => {
  sendImpl = async () => ({ id: "mock_email_id" });
});

test("disabled config does nothing", async () => {
  const result = await handleLegacyTokenKillSwitchFlip(
    buildEvent(),
    loader(cfg({ enabled: false, recipients: ["x@y.com"] })),
  );
  assert.equal(result.notified, false);
  assert.equal(result.reason, "disabled");
  assert.equal(sendCalls.length, 0);
});

test("enabled but no recipients yields no_recipients", async () => {
  const result = await handleLegacyTokenKillSwitchFlip(
    buildEvent(),
    loader(cfg({ enabled: true, recipients: [] })),
  );
  assert.equal(result.notified, false);
  assert.equal(result.reason, "no_recipients");
  assert.equal(sendCalls.length, 0);
});

test("sends an email when enabled and actor is not suppressed", async () => {
  const result = await handleLegacyTokenKillSwitchFlip(
    buildEvent({ updatedBy: "admin_other" }),
    loader(
      cfg({
        enabled: true,
        recipients: ["founder@mougle.com"],
        suppressedActorIds: ["admin_founder"],
      }),
    ),
  );
  assert.equal(result.notified, true);
  assert.equal(result.reason, "sent");
  assert.equal(sendCalls.length, 1);
  assert.deepEqual(sendCalls[0].recipients, ["founder@mougle.com"]);
  assert.equal(sendCalls[0].event.platform, "youtube");
  assert.equal(sendCalls[0].event.newValue, "true");
  assert.equal(sendCalls[0].event.updatedBy, "admin_other");
});

test("suppresses when actor is configured as suppressed", async () => {
  const result = await handleLegacyTokenKillSwitchFlip(
    buildEvent({ updatedBy: "admin_founder" }),
    loader(
      cfg({
        enabled: true,
        recipients: ["founder@mougle.com"],
        suppressedActorIds: ["admin_founder"],
      }),
    ),
  );
  assert.equal(result.notified, false);
  assert.equal(result.reason, "actor_suppressed");
  assert.equal(sendCalls.length, 0);
});

test("send_failed when Resend throws and does not rethrow", async () => {
  sendImpl = async () => {
    throw new Error("resend down");
  };
  const result = await handleLegacyTokenKillSwitchFlip(
    buildEvent(),
    loader(cfg({ enabled: true, recipients: ["founder@mougle.com"] })),
  );
  assert.equal(result.notified, false);
  assert.equal(result.reason, "send_failed");
  assert.equal(result.errorMessage, "resend down");
});

test("dedup window collapses repeated identical flips into one email", async () => {
  const load = loader(
    cfg({
      enabled: true,
      recipients: ["founder@mougle.com"],
      dedupWindowMs: 60_000,
    }),
  );
  const r1 = await handleLegacyTokenKillSwitchFlip(buildEvent(), load);
  assert.equal(r1.reason, "sent");
  const r2 = await handleLegacyTokenKillSwitchFlip(buildEvent(), load);
  assert.equal(r2.reason, "deduplicated");
  assert.equal(r2.suppressedCount, 1);
  assert.equal(typeof r2.suppressedSince, "string");
  const r3 = await handleLegacyTokenKillSwitchFlip(buildEvent(), load);
  assert.equal(r3.reason, "deduplicated");
  assert.equal(r3.suppressedCount, 2);
  assert.equal(sendCalls.length, 1);
});

test("dedup is bypassed for a different platform", async () => {
  const load = loader(
    cfg({
      enabled: true,
      recipients: ["founder@mougle.com"],
      dedupWindowMs: 60_000,
    }),
  );
  await handleLegacyTokenKillSwitchFlip(buildEvent({ platform: "youtube" }), load);
  await handleLegacyTokenKillSwitchFlip(buildEvent({ platform: "facebook" }), load);
  assert.equal(sendCalls.length, 2);
  assert.equal(sendCalls[1].event.platform, "facebook");
});

test("dedup is bypassed for a different newValue", async () => {
  const load = loader(
    cfg({
      enabled: true,
      recipients: ["founder@mougle.com"],
      dedupWindowMs: 60_000,
    }),
  );
  await handleLegacyTokenKillSwitchFlip(buildEvent({ newValue: "true" }), load);
  await handleLegacyTokenKillSwitchFlip(
    buildEvent({ previousValue: "true", newValue: "false" }),
    load,
  );
  assert.equal(sendCalls.length, 2);
  assert.equal(sendCalls[1].event.newValue, "false");
});

test("dedup is bypassed for a different actor", async () => {
  const load = loader(
    cfg({
      enabled: true,
      recipients: ["founder@mougle.com"],
      dedupWindowMs: 60_000,
    }),
  );
  await handleLegacyTokenKillSwitchFlip(
    buildEvent({ updatedBy: "admin_a" }),
    load,
  );
  await handleLegacyTokenKillSwitchFlip(
    buildEvent({ updatedBy: "admin_b" }),
    load,
  );
  assert.equal(sendCalls.length, 2);
  assert.equal(sendCalls[1].event.updatedBy, "admin_b");
});

test("dedupWindowMs=0 disables dedup entirely", async () => {
  const load = loader(
    cfg({
      enabled: true,
      recipients: ["founder@mougle.com"],
      dedupWindowMs: 0,
    }),
  );
  await handleLegacyTokenKillSwitchFlip(buildEvent(), load);
  await handleLegacyTokenKillSwitchFlip(buildEvent(), load);
  await handleLegacyTokenKillSwitchFlip(buildEvent(), load);
  assert.equal(sendCalls.length, 3);
});

test("history records every outcome newest-first", async () => {
  const load = loader(
    cfg({
      enabled: true,
      recipients: ["founder@mougle.com"],
      suppressedActorIds: ["admin_founder"],
      dedupWindowMs: 0,
    }),
  );
  await handleLegacyTokenKillSwitchFlip(
    buildEvent({ updatedBy: "admin_a" }),
    load,
  );
  await handleLegacyTokenKillSwitchFlip(
    buildEvent({ updatedBy: "admin_founder" }),
    load,
  );
  const history = getLegacyTokenKillSwitchNotificationHistory(10);
  assert.equal(history.length, 2);
  assert.equal(history[0].reason, "actor_suppressed");
  assert.equal(history[1].reason, "sent");
});
