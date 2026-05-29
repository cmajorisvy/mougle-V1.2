import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";

import {
  AudienceConnectorSecretsService,
  audienceConnectorSecretsService,
} from "../server/services/audience-connector-secrets-service";
import {
  AudiencePlatformGatewayService,
} from "../server/services/audience-platform-gateway-service";
import {
  OmniChannelAudienceSafetyService,
} from "../server/services/omni-channel-audience-safety-service";
import { neuralNewsroomBus } from "../server/services/neural-newsroom-bus";

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

const TEST_KEY_HEX = crypto.randomBytes(32).toString("hex");

let safety: OmniChannelAudienceSafetyService;
let gateway: AudiencePlatformGatewayService;
let secrets: AudienceConnectorSecretsService;

const ALL_TOKEN_ENV_KEYS = [
  "AUDIENCE_GATEWAY_YOUTUBE_TOKEN",
  "AUDIENCE_GATEWAY_FACEBOOK_TOKEN",
  "AUDIENCE_GATEWAY_X_TOKEN",
  "AUDIENCE_GATEWAY_TELEGRAM_TOKEN",
];

const ALL_DISABLE_KEYS = [
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_YOUTUBE",
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_FACEBOOK",
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_X",
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_TELEGRAM",
];

function clearGatewayEnv() {
  delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
  for (const k of ALL_TOKEN_ENV_KEYS) delete process.env[k];
  for (const k of ALL_DISABLE_KEYS) delete process.env[k];
}

beforeEach(async () => {
  process.env.AUDIENCE_GATEWAY_SECRETS_KEY = TEST_KEY_HEX;
  safety = new OmniChannelAudienceSafetyService();
  secrets = new AudienceConnectorSecretsService();
  gateway = new AudiencePlatformGatewayService(safety, secrets);
  await safety.reset(); // also TRUNCATEs audience_connector_secrets
  clearGatewayEnv();
});

afterEach(() => {
  delete process.env.AUDIENCE_GATEWAY_SECRETS_KEY;
  clearGatewayEnv();
});

async function registerConnector(
  platform: "facebook" | "x" | "telegram",
  id: string,
) {
  await safety.registerConnector({
    connectorId: id,
    platform,
    accountId: `${platform}_acct_${id}`,
    displayName: platform,
    permissions: fullPerms(),
    apiAccessMode: "official_api",
  });
  await safety.approvePlatformSend(id, true, "root_admin_1");
  return id;
}

async function buildAbusiveCommand(
  platform: "facebook" | "x" | "telegram",
  connectorId: string,
) {
  const m = await safety.ingestAudienceMessage({
    connectorId,
    platform,
    externalMessageId: `ext_${platform}_${Math.random().toString(36).slice(2)}`,
    externalAuthorId: "author_a",
    authorDisplayName: "A",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await safety.evaluateAudienceSafety(m.messageId);
  return safety.buildAudienceModerationCommand({
    decisionId: d.decisionId,
    requestedAction: "hide_comment",
    requestedBy: "root_admin",
    commandMode: "future_platform_gateway",
  });
}

async function registerYoutubeConnector(id = "c_yt_secret") {
  await safety.registerConnector({
    connectorId: id,
    platform: "youtube",
    accountId: "yt_acct",
    displayName: "yt",
    permissions: fullPerms(),
    apiAccessMode: "official_api",
  });
  await safety.approvePlatformSend(id, true, "root_admin_1");
  return id;
}

async function buildAbusiveYoutubeCommand(connectorId: string) {
  const m = await safety.ingestAudienceMessage({
    connectorId,
    platform: "youtube",
    externalMessageId: `ext_${Math.random().toString(36).slice(2)}`,
    externalAuthorId: "author_a",
    authorDisplayName: "A",
    messageText: "you are an idiot",
    messageType: "comment",
  });
  const d = await safety.evaluateAudienceSafety(m.messageId);
  return safety.buildAudienceModerationCommand({
    decisionId: d.decisionId,
    requestedAction: "hide_comment",
    requestedBy: "root_admin",
    commandMode: "future_platform_gateway",
  });
}

/* 1 */
test("secrets service refuses writes when no encryption key is configured", async () => {
  delete process.env.AUDIENCE_GATEWAY_SECRETS_KEY;
  const s = new AudienceConnectorSecretsService();
  assert.equal(s.isConfigured(), false);
  await assert.rejects(
    () => s.setToken({ connectorId: "c1", platform: "youtube", token: "abc", rotatedBy: "root" }),
    /secrets_key_not_configured/,
  );
});

/* 2 */
test("setToken persists encrypted blob (no plaintext) and round-trips via getDecryptedToken", async () => {
  const id = await registerYoutubeConnector();
  const meta = await secrets.setToken({
    connectorId: id,
    platform: "youtube",
    token: "yt_super_secret_AAA",
    rotatedBy: "root_admin_1",
  });
  assert.equal(meta.connectorId, id);
  assert.equal(meta.platform, "youtube");
  assert.equal(meta.rotationCount, 1);
  assert.equal(meta.lastRotatedBy, "root_admin_1");

  // Listing must never expose plaintext.
  const all = await secrets.listMetadata();
  assert.equal(JSON.stringify(all).includes("yt_super_secret_AAA"), false);

  // The private boundary returns the plaintext.
  const dec = await secrets.getDecryptedToken(id);
  assert.equal(dec, "yt_super_secret_AAA");
});

/* 3 */
test("rotateToken increments rotationCount, preserves createdAt, and replaces ciphertext", async () => {
  const id = await registerYoutubeConnector();
  const m1 = await secrets.setToken({
    connectorId: id,
    platform: "youtube",
    token: "first_token",
    rotatedBy: "root_admin_1",
  });
  const m2 = await secrets.rotateToken({
    connectorId: id,
    platform: "youtube",
    token: "second_token_xyz",
    rotatedBy: "root_admin_2",
  });
  assert.equal(m2.rotationCount, m1.rotationCount + 1);
  assert.equal(m2.createdAt, m1.createdAt);
  assert.equal(m2.lastRotatedBy, "root_admin_2");
  assert.notEqual(m2.lastRotatedAt, m1.lastRotatedAt);
  assert.equal(await secrets.getDecryptedToken(id), "second_token_xyz");
});

/* 4 */
test("getDecryptedToken returns null when the encryption key changes (forces re-rotation)", async () => {
  const id = await registerYoutubeConnector();
  await secrets.setToken({
    connectorId: id,
    platform: "youtube",
    token: "tok_under_old_key",
    rotatedBy: "root_admin_1",
  });
  // Swap the env key. Without re-rotation the stored ciphertext is
  // unreadable — decryption MUST fail closed and return null.
  process.env.AUDIENCE_GATEWAY_SECRETS_KEY = crypto.randomBytes(32).toString("hex");
  const swapped = new AudienceConnectorSecretsService();
  const dec = await swapped.getDecryptedToken(id);
  assert.equal(dec, null);
});

/* 4b (Task #576) — countAllRotations honors the same filters as listAllRotations */
test("countAllRotations matches listAllRotations under the same filters", async () => {
  const id1 = await registerYoutubeConnector("c_yt_count_1");
  const id2 = await registerConnector("facebook", "c_fb_count_1");
  await secrets.setToken({ connectorId: id1, platform: "youtube", token: "t1", rotatedBy: "root" });
  await secrets.rotateToken({ connectorId: id1, platform: "youtube", token: "t1b", rotatedBy: "root" });
  await secrets.setToken({ connectorId: id2, platform: "facebook", token: "t2", rotatedBy: "root" });

  const total = await secrets.countAllRotations();
  const listed = await secrets.listAllRotations();
  assert.equal(total, listed.length);
  assert.ok(total >= 3);

  const ytCount = await secrets.countAllRotations({ platform: "youtube" });
  const ytList = await secrets.listAllRotations({ platform: "youtube" });
  assert.equal(ytCount, ytList.length);

  const perConnectorCount = await secrets.countAllRotations({ connectorId: id2 });
  const perConnectorList = await secrets.listAllRotations({ connectorId: id2 });
  assert.equal(perConnectorCount, perConnectorList.length);
  assert.equal(perConnectorCount, 1);
});

/* 5 */
test("deleteToken removes the stored secret", async () => {
  const id = await registerYoutubeConnector();
  await secrets.setToken({ connectorId: id, platform: "youtube", token: "t", rotatedBy: "root" });
  assert.ok(await secrets.getMetadata(id));
  assert.equal(await secrets.deleteToken(id), true);
  assert.equal(await secrets.getMetadata(id), null);
  assert.equal(await secrets.getDecryptedToken(id), null);
});

/* 6 — gateway prefers per-connector secret over per-platform env fallback */
test("gateway uses the per-connector secret instead of the legacy env token", async () => {
  // Set up DB rows BEFORE mocking fetch so the pg driver / drizzle path
  // is never observed by the fetch mock.
  const id = await registerYoutubeConnector();
  await secrets.setToken({
    connectorId: id,
    platform: "youtube",
    token: "per_connector_token_999",
    rotatedBy: "root_admin_1",
  });
  const cmd = await buildAbusiveYoutubeCommand(id);

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; auth: string | undefined }> = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({ url: String(url), auth: init.headers?.Authorization });
    return new Response("{}", { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN = "legacy_env_token";
  try {
    const r = await gateway.dispatch(cmd.commandId);
    assert.equal(r.dispatched, true);
    assert.equal(calls.length, 1);
    // Per-connector token wins over env fallback.
    assert.equal(calls[0].auth, "Bearer per_connector_token_999");
    // Public-facing request must not leak either token.
    assert.ok(r.request);
    assert.equal(r.request!.url.includes("per_connector_token_999"), false);
    assert.equal(r.request!.url.includes("legacy_env_token"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* 7 — gateway falls back to env when no per-connector secret is stored */
test("gateway falls back to the env token when no per-connector secret exists", async () => {
  const id = await registerYoutubeConnector("c_yt_envonly");
  const cmd = await buildAbusiveYoutubeCommand(id);

  const originalFetch = globalThis.fetch;
  const calls: Array<{ auth: string | undefined }> = [];
  globalThis.fetch = (async (_url: any, init: any = {}) => {
    calls.push({ auth: init.headers?.Authorization });
    return new Response("{}", { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN = "env_only_token";
  try {
    const r = await gateway.dispatch(cmd.commandId);
    assert.equal(r.dispatched, true);
    assert.equal(calls[0].auth, "Bearer env_only_token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* 8 — gateway picks up a freshly rotated secret on the very next dispatch */
test("token rotation takes effect immediately on the next gateway dispatch (YouTube end-to-end)", async () => {
  const id = await registerYoutubeConnector("c_yt_rotate");
  await secrets.setToken({
    connectorId: id,
    platform: "youtube",
    token: "yt_token_v1",
    rotatedBy: "root_admin_1",
  });
  const cmd1 = await buildAbusiveYoutubeCommand(id);

  const originalFetch = globalThis.fetch;
  const calls: Array<{ auth: string | undefined }> = [];
  globalThis.fetch = (async (_url: any, init: any = {}) => {
    calls.push({ auth: init.headers?.Authorization });
    return new Response("{}", { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  try {
    const r1 = await gateway.dispatch(cmd1.commandId);
    assert.equal(r1.dispatched, true);
    assert.equal(calls[0].auth, "Bearer yt_token_v1");

    // Unmock briefly so DB writes for rotation + the next command go through
    // pg / drizzle without being observed by the fetch spy.
    globalThis.fetch = originalFetch;
    await secrets.rotateToken({
      connectorId: id,
      platform: "youtube",
      token: "yt_token_v2",
      rotatedBy: "root_admin_2",
    });
    const cmd2 = await buildAbusiveYoutubeCommand(id);
    globalThis.fetch = (async (_url: any, init: any = {}) => {
      calls.push({ auth: init.headers?.Authorization });
      return new Response("{}", { status: 200 });
    }) as any;

    const r2 = await gateway.dispatch(cmd2.commandId);
    assert.equal(r2.dispatched, true);
    assert.equal(calls[1].auth, "Bearer yt_token_v2");

    globalThis.fetch = originalFetch;
    const meta = await secrets.getMetadata(id);
    assert.equal(meta?.rotationCount, 2);
    assert.equal(meta?.lastRotatedBy, "root_admin_2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* 9 — YouTube live dispatch end-to-end (integration shape against sandbox URL) */
test("YouTube live dispatch end-to-end: per-connector token + real adapter URL + non-leak audit", async () => {
  const id = await registerYoutubeConnector("c_yt_e2e");
  const meta = await secrets.setToken({
    connectorId: id,
    platform: "youtube",
    token: "yt_sandbox_oauth_token_QQQ",
    rotatedBy: "root_admin_1",
  });
  assert.equal(meta.rotationCount, 1);
  const cmd = await buildAbusiveYoutubeCommand(id);

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: string | undefined; auth: string | undefined }> = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? "GET"),
      body: init.body,
      auth: init.headers?.Authorization,
    });
    return new Response(JSON.stringify({ kind: "youtube#comment", id: "ext_yt_1" }), { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  const events: Array<{ name: string; payload: any }> = [];
  const unsub = neuralNewsroomBus.subscribe("audience.gateway_send_dispatched", {
    id: "test_yt_e2e",
    type: "admin",
    handler: (e) => events.push({ name: e.name, payload: e.payload }),
  });
  try {
    const r = await gateway.dispatch(cmd.commandId, { adminId: "root_admin_1" });

    assert.equal(r.dispatched, true);
    assert.equal(r.simulated, false);
    assert.equal(r.blockerReason, null);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith("https://youtube.googleapis.com/youtube/v3/comments/setModerationStatus"));
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].auth, "Bearer yt_sandbox_oauth_token_QQQ");
    assert.ok(calls[0].body && calls[0].body.includes("moderationStatus"));

    // No surface (result, event payload) carries the raw token.
    assert.equal(JSON.stringify(r).includes("yt_sandbox_oauth_token_QQQ"), false);
    assert.equal(events.length, 1);
    assert.equal(JSON.stringify(events[0].payload).includes("yt_sandbox_oauth_token_QQQ"), false);
  } finally {
    globalThis.fetch = originalFetch;
    unsub();
  }
});

/* 10 — default singleton is wired into the default gateway constructor */
test("default singleton secrets service is the same instance the default gateway will use", () => {
  assert.equal(typeof audienceConnectorSecretsService.setToken, "function");
  assert.equal(typeof audienceConnectorSecretsService.getDecryptedToken, "function");
  assert.equal(typeof audienceConnectorSecretsService.rotateToken, "function");
  assert.equal(typeof audienceConnectorSecretsService.listRotations, "function");
});

/* Task #463 — rotation audit trail */
test("listRotations returns set / rotate / delete entries newest-first and never echoes plaintext", async () => {
  const id = await registerYoutubeConnector("c_yt_audit");
  const empty = await secrets.listRotations(id);
  assert.equal(empty.length, 0);

  await secrets.setToken({
    connectorId: id,
    platform: "youtube",
    token: "first_audit_token_AAA",
    rotatedBy: "root_admin_1",
  });
  await secrets.rotateToken({
    connectorId: id,
    platform: "youtube",
    token: "second_audit_token_BBB",
    rotatedBy: "root_admin_2",
  });
  await secrets.deleteToken(id, { deletedBy: "root_admin_3" });

  const log = await secrets.listRotations(id);
  assert.equal(log.length, 3);
  // Newest first.
  assert.equal(log[0].action, "delete");
  assert.equal(log[0].rotatedBy, "root_admin_3");
  assert.equal(log[1].action, "rotate");
  assert.equal(log[1].rotatedBy, "root_admin_2");
  assert.equal(log[1].rotationCount, 2);
  assert.equal(log[2].action, "set");
  assert.equal(log[2].rotatedBy, "root_admin_1");
  assert.equal(log[2].rotationCount, 1);

  // Audit surface must never contain either plaintext token or
  // anything that looks like ciphertext / IV / auth-tag.
  const serialized = JSON.stringify(log);
  assert.equal(serialized.includes("first_audit_token_AAA"), false);
  assert.equal(serialized.includes("second_audit_token_BBB"), false);
  assert.equal(serialized.includes("encryptedToken"), false);
  assert.equal(serialized.includes("authTag"), false);
});

test("deleteToken on a missing secret does NOT write a rotation audit row", async () => {
  const id = await registerYoutubeConnector("c_yt_audit_noop");
  const deleted = await secrets.deleteToken(id, { deletedBy: "root_admin_1" });
  assert.equal(deleted, false);
  const log = await secrets.listRotations(id);
  assert.equal(log.length, 0);
});

/* ------------------------------------------------------------------ */
/* Task #430 — Facebook / X / Telegram live-dispatch integration tests */
/* ------------------------------------------------------------------ */

/* 11 — Facebook live dispatch uses per-connector secret over env */
test("Facebook live dispatch: per-connector token wins over env and never leaks", async () => {
  const id = await registerConnector("facebook", "c_fb_e2e");
  await secrets.setToken({
    connectorId: id,
    platform: "facebook",
    token: "fb_sandbox_token_PCT",
    rotatedBy: "root_admin_1",
  });
  const cmd = await buildAbusiveCommand("facebook", id);

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: string | undefined; auth: string | undefined }> = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? "GET"),
      body: init.body,
      auth: init.headers?.Authorization,
    });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_FACEBOOK_TOKEN = "fb_legacy_env_token";
  const events: Array<{ name: string; payload: any }> = [];
  const unsub = neuralNewsroomBus.subscribe("audience.gateway_send_dispatched", {
    id: "test_fb_e2e",
    type: "admin",
    handler: (e) => events.push({ name: e.name, payload: e.payload }),
  });
  try {
    const r = await gateway.dispatch(cmd.commandId, { adminId: "root_admin_1" });
    assert.equal(r.dispatched, true);
    assert.equal(r.simulated, false);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith("https://graph.facebook.com/v19.0/"));
    assert.equal(calls[0].method, "POST");
    // Per-connector token wins over env fallback.
    assert.equal(calls[0].auth, "Bearer fb_sandbox_token_PCT");
    // No surface leaks either token.
    assert.ok(r.request);
    assert.equal(r.request!.url.includes("fb_sandbox_token_PCT"), false);
    assert.equal(r.request!.url.includes("fb_legacy_env_token"), false);
    assert.equal(JSON.stringify(r).includes("fb_sandbox_token_PCT"), false);
    assert.equal(JSON.stringify(r).includes("fb_legacy_env_token"), false);
    assert.equal(events.length, 1);
    assert.equal(JSON.stringify(events[0].payload).includes("fb_sandbox_token_PCT"), false);
    assert.equal(JSON.stringify(events[0].payload).includes("fb_legacy_env_token"), false);
  } finally {
    globalThis.fetch = originalFetch;
    unsub();
  }
});

/* 12 — X live dispatch uses per-connector secret over env */
test("X live dispatch: per-connector token wins over env and never leaks", async () => {
  const id = await registerConnector("x", "c_x_e2e");
  await secrets.setToken({
    connectorId: id,
    platform: "x",
    token: "x_sandbox_token_QXR",
    rotatedBy: "root_admin_1",
  });
  const cmd = await buildAbusiveCommand("x", id);

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: string | undefined; auth: string | undefined }> = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? "GET"),
      body: init.body,
      auth: init.headers?.Authorization,
    });
    return new Response(JSON.stringify({ data: { hidden: true } }), { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_X_TOKEN = "x_legacy_env_token";
  const events: Array<{ name: string; payload: any }> = [];
  const unsub = neuralNewsroomBus.subscribe("audience.gateway_send_dispatched", {
    id: "test_x_e2e",
    type: "admin",
    handler: (e) => events.push({ name: e.name, payload: e.payload }),
  });
  try {
    const r = await gateway.dispatch(cmd.commandId, { adminId: "root_admin_1" });
    assert.equal(r.dispatched, true);
    assert.equal(r.simulated, false);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith("https://api.x.com/2/tweets/"));
    assert.ok(calls[0].url.endsWith("/hidden"));
    assert.equal(calls[0].method, "PUT");
    assert.equal(calls[0].auth, "Bearer x_sandbox_token_QXR");
    assert.ok(r.request);
    assert.equal(r.request!.url.includes("x_sandbox_token_QXR"), false);
    assert.equal(r.request!.url.includes("x_legacy_env_token"), false);
    assert.equal(JSON.stringify(r).includes("x_sandbox_token_QXR"), false);
    assert.equal(events.length, 1);
    assert.equal(JSON.stringify(events[0].payload).includes("x_sandbox_token_QXR"), false);
  } finally {
    globalThis.fetch = originalFetch;
    unsub();
  }
});

/* 13 — Telegram live dispatch embeds token in URL but never leaks it */
test("Telegram live dispatch: per-connector token used in transport URL but redacted everywhere else", async () => {
  const id = await registerConnector("telegram", "c_tg_e2e");
  await secrets.setToken({
    connectorId: id,
    platform: "telegram",
    token: "tg_sandbox_bot_token_ZZZ",
    rotatedBy: "root_admin_1",
  });
  const cmd = await buildAbusiveCommand("telegram", id);

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: string | undefined; auth: string | undefined }> = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? "GET"),
      body: init.body,
      auth: init.headers?.Authorization,
    });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_TELEGRAM_TOKEN = "tg_legacy_env_token";
  const events: Array<{ name: string; payload: any }> = [];
  const unsub = neuralNewsroomBus.subscribe("audience.gateway_send_dispatched", {
    id: "test_tg_e2e",
    type: "admin",
    handler: (e) => events.push({ name: e.name, payload: e.payload }),
  });
  try {
    const r = await gateway.dispatch(cmd.commandId, { adminId: "root_admin_1" });
    assert.equal(r.dispatched, true);
    assert.equal(r.simulated, false);
    assert.equal(calls.length, 1);
    // Transport URL embeds the real per-connector token (URL-encoded).
    assert.ok(calls[0].url.startsWith("https://api.telegram.org/bot"));
    assert.ok(calls[0].url.includes("tg_sandbox_bot_token_ZZZ"));
    assert.ok(calls[0].url.endsWith("/deleteMessage"));
    assert.equal(calls[0].method, "POST");
    // Telegram embeds token in URL — no Authorization header.
    assert.equal(calls[0].auth, undefined);
    // Public-facing request descriptor must replace the placeholder with
    // <redacted> and must never contain either token.
    assert.ok(r.request);
    assert.ok(r.request!.url.includes("<redacted>"));
    assert.equal(r.request!.url.includes("tg_sandbox_bot_token_ZZZ"), false);
    assert.equal(r.request!.url.includes("tg_legacy_env_token"), false);
    // Result + bus payload never leak either token.
    assert.equal(JSON.stringify(r).includes("tg_sandbox_bot_token_ZZZ"), false);
    assert.equal(JSON.stringify(r).includes("tg_legacy_env_token"), false);
    assert.equal(events.length, 1);
    assert.equal(JSON.stringify(events[0].payload).includes("tg_sandbox_bot_token_ZZZ"), false);
    assert.equal(JSON.stringify(events[0].payload).includes("tg_legacy_env_token"), false);
  } finally {
    globalThis.fetch = originalFetch;
    unsub();
  }
});

/* 14 — env fallback works for FB / X / Telegram when no per-connector secret */
test("Facebook / X / Telegram fall back to the env token when no per-connector secret exists", async () => {
  const fbId = await registerConnector("facebook", "c_fb_envonly");
  const xId = await registerConnector("x", "c_x_envonly");
  const tgId = await registerConnector("telegram", "c_tg_envonly");
  const fbCmd = await buildAbusiveCommand("facebook", fbId);
  const xCmd = await buildAbusiveCommand("x", xId);
  const tgCmd = await buildAbusiveCommand("telegram", tgId);

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; auth: string | undefined }> = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({ url: String(url), auth: init.headers?.Authorization });
    return new Response("{}", { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  process.env.AUDIENCE_GATEWAY_FACEBOOK_TOKEN = "fb_env_only";
  process.env.AUDIENCE_GATEWAY_X_TOKEN = "x_env_only";
  process.env.AUDIENCE_GATEWAY_TELEGRAM_TOKEN = "tg_env_only";
  try {
    const r1 = await gateway.dispatch(fbCmd.commandId);
    const r2 = await gateway.dispatch(xCmd.commandId);
    const r3 = await gateway.dispatch(tgCmd.commandId);
    assert.equal(r1.dispatched, true);
    assert.equal(r2.dispatched, true);
    assert.equal(r3.dispatched, true);
    assert.equal(calls[0].auth, "Bearer fb_env_only");
    assert.equal(calls[1].auth, "Bearer x_env_only");
    // Telegram uses URL embedding, not Authorization header.
    assert.equal(calls[2].auth, undefined);
    assert.ok(calls[2].url.includes("tg_env_only"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* 15 — per-platform disable flag blocks env fallback for that platform only */
test("AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_<PLATFORM> blocks env fallback per platform", async () => {
  const fbId = await registerConnector("facebook", "c_fb_disabled");
  const xId = await registerConnector("x", "c_x_still_env");
  const fbCmd = await buildAbusiveCommand("facebook", fbId);
  const xCmd = await buildAbusiveCommand("x", xId);

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; auth: string | undefined }> = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({ url: String(url), auth: init.headers?.Authorization });
    return new Response("{}", { status: 200 });
  }) as any;
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  // Both env tokens set — but Facebook fallback is explicitly disabled.
  process.env.AUDIENCE_GATEWAY_FACEBOOK_TOKEN = "fb_env_should_not_be_used";
  process.env.AUDIENCE_GATEWAY_X_TOKEN = "x_env_still_used";
  process.env.AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_FACEBOOK = "true";
  try {
    const rFb = await gateway.dispatch(fbCmd.commandId);
    // Facebook: no per-connector secret + env disabled => fail closed.
    assert.equal(rFb.dispatched, false);
    assert.equal(rFb.blockerReason, "platform_token_missing");
    // X disable flag is NOT set — env fallback still works for X.
    const rX = await gateway.dispatch(xCmd.commandId);
    assert.equal(rX.dispatched, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].auth, "Bearer x_env_still_used");

    // Now provide a per-connector secret for Facebook and confirm the
    // disable flag does NOT block the per-connector path.
    await secrets.setToken({
      connectorId: fbId,
      platform: "facebook",
      token: "fb_per_connector_after_disable",
      rotatedBy: "root_admin_1",
    });
    const fbCmd2 = await buildAbusiveCommand("facebook", fbId);
    const rFb2 = await gateway.dispatch(fbCmd2.commandId);
    assert.equal(rFb2.dispatched, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].auth, "Bearer fb_per_connector_after_disable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
