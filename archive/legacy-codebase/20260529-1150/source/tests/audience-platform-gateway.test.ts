import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  OmniChannelAudienceSafetyService,
} from "../server/services/omni-channel-audience-safety-service";
import {
  AudiencePlatformGatewayService,
  __testing as gatewayTesting,
} from "../server/services/audience-platform-gateway-service";
import { neuralNewsroomBus } from "../server/services/neural-newsroom-bus";
import type {
  AudiencePlatform,
  RequestedModerationAction,
} from "../shared/omni-channel-audience-schema";

function fullPerms() {
  return {
    canReadComments: true,
    canReadLiveChat: true,
    canHideComment: true,
    canDeleteComment: true,
    canReply: true,
    canPin: true,
    canBanUser: true,
    canTimeoutUser: true,
    canEditOwnReply: true,
  };
}

let safety: OmniChannelAudienceSafetyService;
let gateway: AudiencePlatformGatewayService;

beforeEach(async () => {
  safety = new OmniChannelAudienceSafetyService();
  gateway = new AudiencePlatformGatewayService(safety);
  await safety.reset();
  delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
  delete process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN;
  delete process.env.AUDIENCE_GATEWAY_TELEGRAM_TOKEN;
});

async function setupAbusiveYoutube(opts: {
  approve?: boolean;
  apiAccessMode?: AudiencePlatform extends never ? never : "official_api" | "webhook" | "manual_import" | "disabled";
} = {}) {
  await safety.registerConnector({
    connectorId: "c_yt",
    platform: "youtube",
    accountId: "yt_acct",
    displayName: "yt",
    permissions: fullPerms(),
    apiAccessMode: (opts.apiAccessMode as any) ?? "official_api",
  });
  if (opts.approve) await safety.approvePlatformSend("c_yt", true, "root_admin_1");
  const m = await safety.ingestAudienceMessage({
    connectorId: "c_yt",
    platform: "youtube",
    externalMessageId: "ext_yt_1",
    externalAuthorId: "author_a",
    authorDisplayName: "A",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await safety.evaluateAudienceSafety(m.messageId);
  return { m, d };
}

async function buildCmd(decisionId: string, action: RequestedModerationAction, mode: "simulation_only" | "future_platform_gateway" = "future_platform_gateway") {
  return safety.buildAudienceModerationCommand({
    decisionId,
    requestedAction: action,
    requestedBy: "root_admin",
    commandMode: mode,
  });
}

/* 1 */
test("gateway refuses when connector is not platform-send-approved", async () => {
  const { d } = await setupAbusiveYoutube({ approve: false });
  const cmd = await buildCmd(d.decisionId, "hide_comment");
  const r = await gateway.dispatch(cmd.commandId);
  assert.equal(r.dispatched, false);
  assert.equal(r.simulated, false);
  assert.equal(r.blockerReason, "connector_not_platform_send_approved");
});

/* 2 */
test("gateway dispatches (simulation) when fully approved + permission present", async () => {
  const { d } = await setupAbusiveYoutube({ approve: true });
  const cmd = await buildCmd(d.decisionId, "hide_comment");
  const r = await gateway.dispatch(cmd.commandId);
  assert.equal(r.simulated, true);
  assert.equal(r.dispatched, false);
  assert.equal(r.blockerReason, null);
  assert.ok(r.request);
  assert.ok(r.request!.url.startsWith("https://youtube.googleapis.com/"));
});

/* 3 */
test("gateway refuses simulation_only commands (mode gate)", async () => {
  const { d } = await setupAbusiveYoutube({ approve: true });
  const cmd = await buildCmd(d.decisionId, "hide_comment", "simulation_only");
  const r = await gateway.dispatch(cmd.commandId);
  assert.equal(r.dispatched, false);
  assert.equal(r.blockerReason, "command_mode_simulation_only");
});

/* 4 */
test("gateway refuses when connector lacks the required permission", async () => {
  await safety.registerConnector({
    connectorId: "c_fb",
    platform: "facebook",
    accountId: "fb",
    displayName: "fb",
    permissions: { canReadComments: true }, // no hide/delete
  });
  await safety.approvePlatformSend("c_fb", true, "root_admin_1");
  const m = await safety.ingestAudienceMessage({
    connectorId: "c_fb",
    platform: "facebook",
    externalMessageId: "ext_fb_1",
    externalAuthorId: "a",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await safety.evaluateAudienceSafety(m.messageId);
  const cmd = await buildCmd(d.decisionId, "hide_comment");
  // The command itself is blocked at build-time (commandAllowed:false).
  assert.equal(cmd.commandAllowed, false);
  const r = await gateway.dispatch(cmd.commandId);
  assert.equal(r.dispatched, false);
  assert.ok(r.blockerReason && r.blockerReason.includes("permission_missing"));
});

/* 5 */
test("gateway refuses when the decision changed after command was built", async () => {
  const { d } = await setupAbusiveYoutube({ approve: true });
  const cmd = await buildCmd(d.decisionId, "hide_comment");
  // Mutate the live decision row directly in the DB to simulate a change
  // since the command was built (e.g. reviewer downgrade, score rescore).
  // This shifts the fingerprint and the gateway must fail closed.
  const { db } = await import("../server/db");
  const { audienceSafetyDecisions } = await import("../shared/omni-channel-audience-schema");
  const { eq, sql } = await import("drizzle-orm");
  await db
    .update(audienceSafetyDecisions)
    .set({ reasonCodes: sql`array_append(${audienceSafetyDecisions.reasonCodes}, 'synthetic_change')` })
    .where(eq(audienceSafetyDecisions.decisionId, d.decisionId));
  const r = await gateway.dispatch(cmd.commandId);
  assert.equal(r.dispatched, false);
  assert.equal(r.blockerReason, "decision_changed_since_build");
});

/* 6 */
test("gateway respects per-platform rate limit (telegram = 30/min)", async () => {
  await safety.registerConnector({
    connectorId: "c_tg",
    platform: "telegram",
    accountId: "tg_chat",
    displayName: "tg",
    permissions: fullPerms(),
  });
  await safety.approvePlatformSend("c_tg", true, "root_admin_1");
  // Use a clean (non-abusive) message so the decision allows moderation only
  // via no_action. We test rate-limit consumption with hide_comment using an
  // abusive message instead.
  const limit = gatewayTesting.RATE_LIMITS_PER_MINUTE.telegram;
  let consumed = 0;
  for (let i = 0; i < limit; i++) {
    const m = await safety.ingestAudienceMessage({
      connectorId: "c_tg",
      platform: "telegram",
      externalMessageId: `ext_tg_${i}`,
      externalAuthorId: `a_${i}`,
      messageText: "you are an idiot",
      messageType: "comment",
    });
    const d = await safety.evaluateAudienceSafety(m.messageId);
    const cmd = await buildCmd(d.decisionId, "hide_comment");
    const r = await gateway.dispatch(cmd.commandId);
    if (r.simulated) consumed++;
  }
  assert.equal(consumed, limit);
  // One more should be refused with rate_limit_exceeded.
  const mExtra = await safety.ingestAudienceMessage({
    connectorId: "c_tg",
    platform: "telegram",
    externalMessageId: "ext_tg_overflow",
    externalAuthorId: "a_overflow",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const dExtra = await safety.evaluateAudienceSafety(mExtra.messageId);
  const cmdExtra = await buildCmd(dExtra.decisionId, "hide_comment");
  const overflow = await gateway.dispatch(cmdExtra.commandId);
  assert.equal(overflow.dispatched, false);
  assert.equal(overflow.blockerReason, "rate_limit_exceeded");
});

/* 7 */
test("gateway refuses unsupported actions per adapter (instagram is noop)", async () => {
  await safety.registerConnector({
    connectorId: "c_ig",
    platform: "instagram",
    accountId: "ig",
    displayName: "ig",
    permissions: fullPerms(),
  });
  await safety.approvePlatformSend("c_ig", true, "root_admin_1");
  const m = await safety.ingestAudienceMessage({
    connectorId: "c_ig",
    platform: "instagram",
    externalMessageId: "ext_ig_1",
    externalAuthorId: "a",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await safety.evaluateAudienceSafety(m.messageId);
  const cmd = await buildCmd(d.decisionId, "hide_comment");
  const r = await gateway.dispatch(cmd.commandId);
  assert.equal(r.dispatched, false);
  assert.equal(r.blockerReason, "action_not_supported_by_adapter");
});

/* 8 */
test("gateway refuses connectors with apiAccessMode=disabled/manual_import", async () => {
  // manual_import: ingest is allowed but real-send is not.
  const { d } = await setupAbusiveYoutube({ approve: true, apiAccessMode: "manual_import" as any });
  const cmd = await buildCmd(d.decisionId, "hide_comment");
  const r = await gateway.dispatch(cmd.commandId);
  assert.equal(r.dispatched, false);
  assert.equal(r.blockerReason, "api_access_mode_manual_import");
});

/* 9 */
test("gateway never calls fetch (no real network) in simulation phase", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as any;
  try {
    const { d } = await setupAbusiveYoutube({ approve: true });
    const cmd = await buildCmd(d.decisionId, "delete_comment");
    const r = await gateway.dispatch(cmd.commandId);
    assert.equal(r.simulated, true);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* 10 */
test("gateway emits audience.gateway_send_blocked on refusal", async () => {
  const { d } = await setupAbusiveYoutube({ approve: false });
  const cmd = await buildCmd(d.decisionId, "hide_comment");
  await gateway.dispatch(cmd.commandId);
  // Inspect the bus audit history rather than a live subscriber. The audit
  // log is a deterministic record of every emit and avoids any subscriber
  // setup races inside the node:test runner.
  const matching = neuralNewsroomBus
    .history(500)
    .filter((e) => e.name === "audience.gateway_send_blocked"
      && (e.payload as any).commandId === cmd.commandId);
  assert.equal(matching.length, 1);
  assert.equal((matching[0].payload as any).reason, "connector_not_platform_send_approved");
});

/* 11 */
test("approvePlatformSend defaults are false; round-trip toggles correctly", async () => {
  await safety.registerConnector({
    connectorId: "c_x",
    platform: "x",
    accountId: "x",
    displayName: "x",
    permissions: fullPerms(),
  });
  const c0 = await safety.getConnector("c_x")!;
  assert.equal(c0.platformSendApproved, false);
  assert.equal(c0.platformSendApprovedAt, null);
  const c1 = await safety.approvePlatformSend("c_x", true, "root_admin_1");
  assert.equal(c1.platformSendApproved, true);
  assert.equal(c1.platformSendApprovedBy, "root_admin_1");
  assert.ok(c1.platformSendApprovedAt);
  const c2 = await safety.approvePlatformSend("c_x", false, "root_admin_1");
  assert.equal(c2.platformSendApproved, false);
  assert.equal(c2.platformSendApprovedBy, null);
  assert.equal(c2.platformSendApprovedAt, null);
});

/* 12 — live branch: real fetch is issued exactly once when env opt-in + token are both set */
test("gateway live branch issues one fetch with adapter URL/method/body and emits dispatched event", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: string | undefined; auth: string | undefined }> = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? "GET"),
      body: init.body,
      auth: init.headers?.Authorization,
    });
    return new Response("{}", { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN = "yt_secret_token";
  const events: string[] = [];
  const unsub = neuralNewsroomBus.subscribe("audience.gateway_send_dispatched", {
    id: "test_gw_disp",
    type: "admin",
    handler: (e) => events.push(e.name),
  });
  try {
    const { d } = await setupAbusiveYoutube({ approve: true });
    const cmd = await buildCmd(d.decisionId, "hide_comment");
    const r = await gateway.dispatch(cmd.commandId);
    assert.equal(r.dispatched, true);
    assert.equal(r.simulated, false);
    assert.equal(r.blockerReason, null);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith("https://youtube.googleapis.com/"));
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].auth, "Bearer yt_secret_token");
    assert.ok(calls[0].body && calls[0].body.includes("moderationStatus"));
    assert.equal(events.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
    delete process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN;
    unsub();
  }
});

/* 13 — live branch: missing token fails closed with platform_token_missing */
test("gateway live branch fails closed when no platform token is configured", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  delete process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN;
  try {
    const { d } = await setupAbusiveYoutube({ approve: true });
    const cmd = await buildCmd(d.decisionId, "hide_comment");
    const r = await gateway.dispatch(cmd.commandId);
    assert.equal(r.dispatched, false);
    assert.equal(r.simulated, false);
    assert.equal(r.blockerReason, "platform_token_missing");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
  }
});

/* 14 — live branch: non-2xx response is treated as a block, not a success */
test("gateway live branch treats HTTP failure as platform_http_<status>", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("forbidden", { status: 403 })) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN = "yt_secret_token";
  try {
    const { d } = await setupAbusiveYoutube({ approve: true });
    const cmd = await buildCmd(d.decisionId, "hide_comment");
    const r = await gateway.dispatch(cmd.commandId);
    assert.equal(r.dispatched, false);
    assert.equal(r.blockerReason, "platform_http_403");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
    delete process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN;
  }
});

/* 15 — live branch: fetch throwing is caught and reported as a block */
test("gateway live branch catches fetch errors and emits a block, not a dispatch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("network down"); }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN = "yt_secret_token";
  try {
    const { d } = await setupAbusiveYoutube({ approve: true });
    const cmd = await buildCmd(d.decisionId, "hide_comment");
    const r = await gateway.dispatch(cmd.commandId);
    assert.equal(r.dispatched, false);
    assert.ok(r.blockerReason && r.blockerReason.startsWith("platform_fetch_error_"));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
    delete process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN;
  }
});

/* 16 — telegram live branch uses the token at transport but NEVER leaks it. */
test("gateway live branch uses telegram token only at transport (no leak in result/events)", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; auth: string | undefined }> = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({ url: String(url), auth: init.headers?.Authorization });
    return new Response("{}", { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_TELEGRAM_TOKEN = "tg_bot_secret_xyz";
  const events: Array<{ name: string; payload: any }> = [];
  const unsub = neuralNewsroomBus.subscribe("audience.gateway_send_dispatched", {
    id: "test_tg_disp",
    type: "admin",
    handler: (e) => events.push({ name: e.name, payload: e.payload }),
  });
  try {
    await safety.registerConnector({
      connectorId: "c_tg2",
      platform: "telegram",
      accountId: "tg_chat",
      displayName: "tg",
      permissions: fullPerms(),
    });
    await safety.approvePlatformSend("c_tg2", true, "root_admin_1");
    const m = await safety.ingestAudienceMessage({
      connectorId: "c_tg2",
      platform: "telegram",
      externalMessageId: "ext_tg_1",
      externalAuthorId: "a",
      messageText: "you are an idiot",
      messageType: "comment",
    });
    const d = await safety.evaluateAudienceSafety(m.messageId);
    const cmd = await buildCmd(d.decisionId, "hide_comment");
    const r = await gateway.dispatch(cmd.commandId);
    assert.equal(r.dispatched, true);
    // Transport URL DID contain the token (private boundary only).
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes("/bottg_bot_secret_xyz/"));
    assert.equal(calls[0].auth, undefined);
    // Public-facing result + bus event MUST NOT contain the raw token.
    assert.ok(r.request);
    assert.equal(r.request!.url.includes("tg_bot_secret_xyz"), false);
    assert.ok(r.request!.url.includes("<redacted>"));
    assert.equal(events.length, 1);
    const payload = events[0].payload as any;
    assert.equal(JSON.stringify(payload).includes("tg_bot_secret_xyz"), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
    delete process.env.AUDIENCE_GATEWAY_TELEGRAM_TOKEN;
    unsub();
  }
});

/* 16b — simulation branch also sanitizes the telegram URL placeholder. */
test("gateway simulation branch never exposes telegram <TOKEN> placeholder verbatim", async () => {
  await safety.registerConnector({
    connectorId: "c_tg3",
    platform: "telegram",
    accountId: "tg_chat",
    displayName: "tg",
    permissions: fullPerms(),
  });
  await safety.approvePlatformSend("c_tg3", true, "root_admin_1");
  const m = await safety.ingestAudienceMessage({
    connectorId: "c_tg3",
    platform: "telegram",
    externalMessageId: "ext_tg_2",
    externalAuthorId: "a",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await safety.evaluateAudienceSafety(m.messageId);
  const cmd = await buildCmd(d.decisionId, "hide_comment");
  const r = await gateway.dispatch(cmd.commandId);
  assert.equal(r.simulated, true);
  assert.ok(r.request);
  assert.equal(r.request!.url.includes("<TOKEN>"), false);
  assert.ok(r.request!.url.includes("<redacted>"));
});

/* 17 */
test("command carries decisionFingerprint and command record still has platformSendAllowed:false", async () => {
  const { d } = await setupAbusiveYoutube({ approve: true });
  const cmd = await buildCmd(d.decisionId, "hide_comment");
  assert.ok(cmd.decisionFingerprint && cmd.decisionFingerprint.length === 32);
  assert.equal(cmd.platformSendAllowed, false);
  assert.equal(cmd.realSendAllowed, false);
  assert.equal(cmd.executionEnabled, false);
  assert.equal(cmd.safetyEnvelope.platformSendAllowed, false);
});
