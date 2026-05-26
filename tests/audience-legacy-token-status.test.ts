/**
 * Task #462 — HTTP-level test for the legacy-token visibility endpoint
 * `GET /api/admin/newsroom/audience/legacy-token-status`.
 *
 * Stubs the safety service's `listConnectors` and the connector-secrets
 * service's `listMetadata` / `isConfigured` so the route handler is
 * exercised end-to-end without a DB. Verifies per-connector token-source
 * classification, per-platform env-fallback / env-token surfacing, and
 * the "would-break-if-env-fallback-disabled" subset.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { audienceConnectorSecretsService } from "../server/services/audience-connector-secrets-service";

const fakeConnectors = [
  // YouTube — has per-connector secret. Should never be in "would break".
  {
    connectorId: "c_yt_secret",
    platform: "youtube",
    accountId: "yt1",
    displayName: "YT Migrated",
    connectionStatus: "connected",
    apiAccessMode: "official_api",
    platformSendApproved: true,
    platformSendApprovedBy: "root",
    platformSendApprovedAt: "2026-05-01T00:00:00.000Z",
    permissions: {},
    safetyEnvelope: {},
    featureFlags: { multilingualLexicons: [], aiModerationSecondOpinion: false },
  },
  // YouTube — no secret, env token present, env fallback ON, approved
  // official_api -> would break.
  {
    connectorId: "c_yt_legacy",
    platform: "youtube",
    accountId: "yt2",
    displayName: "YT Legacy",
    connectionStatus: "connected",
    apiAccessMode: "official_api",
    platformSendApproved: true,
    platformSendApprovedBy: "root",
    platformSendApprovedAt: "2026-05-02T00:00:00.000Z",
    permissions: {},
    safetyEnvelope: {},
    featureFlags: { multilingualLexicons: [], aiModerationSecondOpinion: false },
  },
  // Telegram — no secret, env token present, env fallback DISABLED ->
  // tokenSource collapses to "no_token", NOT counted as would-break.
  {
    connectorId: "c_tg_envoff",
    platform: "telegram",
    accountId: "tg1",
    displayName: "TG EnvOff",
    connectionStatus: "connected",
    apiAccessMode: "official_api",
    platformSendApproved: true,
    platformSendApprovedBy: "root",
    platformSendApprovedAt: "2026-05-03T00:00:00.000Z",
    permissions: {},
    safetyEnvelope: {},
    featureFlags: { multilingualLexicons: [], aiModerationSecondOpinion: false },
  },
  // Facebook — legacy env fallback but NOT approved -> not in would-break.
  {
    connectorId: "c_fb_unapproved",
    platform: "facebook",
    accountId: "fb1",
    displayName: "FB Unapproved",
    connectionStatus: "connected",
    apiAccessMode: "official_api",
    platformSendApproved: false,
    platformSendApprovedBy: null,
    platformSendApprovedAt: null,
    permissions: {},
    safetyEnvelope: {},
    featureFlags: { multilingualLexicons: [], aiModerationSecondOpinion: false },
  },
  // X — approved, legacy env fallback, but apiAccessMode is read_only ->
  // not in would-break (the live-dispatch path is already blocked).
  {
    connectorId: "c_x_readonly",
    platform: "x",
    accountId: "x1",
    displayName: "X ReadOnly",
    connectionStatus: "connected",
    apiAccessMode: "read_only",
    platformSendApproved: true,
    platformSendApprovedBy: "root",
    platformSendApprovedAt: "2026-05-04T00:00:00.000Z",
    permissions: {},
    safetyEnvelope: {},
    featureFlags: { multilingualLexicons: [], aiModerationSecondOpinion: false },
  },
];

const fakeSecretMetas = [
  {
    connectorId: "c_yt_secret",
    platform: "youtube" as const,
    keyVersion: 1,
    rotationCount: 3,
    lastRotatedBy: "root",
    lastRotatedAt: "2026-05-10T12:00:00.000Z",
    createdAt: "2026-04-01T00:00:00.000Z",
  },
];

const origListConnectors = (omniChannelAudienceSafetyService as any).listConnectors.bind(
  omniChannelAudienceSafetyService,
);
const origListMetadata = (audienceConnectorSecretsService as any).listMetadata.bind(
  audienceConnectorSecretsService,
);
const origIsConfigured = (audienceConnectorSecretsService as any).isConfigured.bind(
  audienceConnectorSecretsService,
);

const ENV_KEYS = [
  "AUDIENCE_GATEWAY_YOUTUBE_TOKEN",
  "AUDIENCE_GATEWAY_TELEGRAM_TOKEN",
  "AUDIENCE_GATEWAY_FACEBOOK_TOKEN",
  "AUDIENCE_GATEWAY_X_TOKEN",
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_YOUTUBE",
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_TELEGRAM",
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_FACEBOOK",
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_X",
] as const;
const origEnv: Record<string, string | undefined> = {};

let server: Server;
let baseUrl: string;

before(async () => {
  (omniChannelAudienceSafetyService as any).listConnectors = async () => fakeConnectors;
  (audienceConnectorSecretsService as any).listMetadata = async () => fakeSecretMetas;
  (audienceConnectorSecretsService as any).isConfigured = () => true;

  for (const k of ENV_KEYS) origEnv[k] = process.env[k];
  process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN = "yt-shared-token";
  process.env.AUDIENCE_GATEWAY_TELEGRAM_TOKEN = "tg-shared-token";
  process.env.AUDIENCE_GATEWAY_FACEBOOK_TOKEN = "fb-shared-token";
  process.env.AUDIENCE_GATEWAY_X_TOKEN = "x-shared-token";
  // Telegram env fallback is OFF; others ON.
  process.env.AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_TELEGRAM = "true";
  delete process.env.AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_YOUTUBE;
  delete process.env.AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_FACEBOOK;
  delete process.env.AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_X;

  const app = express();
  const stubRequireRootAdmin: express.RequestHandler = (_req, _res, next) => next();
  registerOmniChannelAudienceRoutes(app, stubRequireRootAdmin);

  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  (omniChannelAudienceSafetyService as any).listConnectors = origListConnectors;
  (audienceConnectorSecretsService as any).listMetadata = origListMetadata;
  (audienceConnectorSecretsService as any).isConfigured = origIsConfigured;
  for (const k of ENV_KEYS) {
    if (origEnv[k] === undefined) delete process.env[k];
    else process.env[k] = origEnv[k];
  }
  await new Promise<void>((r) => server.close(() => r()));
});

test("GET .../legacy-token-status classifies tokenSource per connector", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/legacy-token-status`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.secretsKeyConfigured, true);

  const byId = new Map<string, any>(
    body.connectors.map((c: any) => [c.connectorId, c]),
  );

  // Per-connector secret installed.
  const yt1 = byId.get("c_yt_secret");
  assert.equal(yt1.tokenSource, "per_connector_secret");
  assert.equal(yt1.perConnectorSecretInstalled, true);
  assert.equal(yt1.secretRotationCount, 3);
  assert.equal(yt1.secretRotatedAt, "2026-05-10T12:00:00.000Z");

  // No secret, env token present, fallback ON.
  const yt2 = byId.get("c_yt_legacy");
  assert.equal(yt2.tokenSource, "legacy_env_fallback");
  assert.equal(yt2.envTokenConfigured, true);
  assert.equal(yt2.envFallbackDisabled, false);
  assert.equal(yt2.perConnectorSecretInstalled, false);

  // No secret, env token present, fallback OFF -> no_token.
  const tg = byId.get("c_tg_envoff");
  assert.equal(tg.tokenSource, "no_token");
  assert.equal(tg.envTokenConfigured, true);
  assert.equal(tg.envFallbackDisabled, true);

  // Unapproved still classifies its token source.
  const fb = byId.get("c_fb_unapproved");
  assert.equal(fb.tokenSource, "legacy_env_fallback");
  assert.equal(fb.platformSendApproved, false);

  // Read-only mode does not affect tokenSource classification itself.
  const x = byId.get("c_x_readonly");
  assert.equal(x.tokenSource, "legacy_env_fallback");
  assert.equal(x.apiAccessMode, "read_only");
});

test("GET .../legacy-token-status surfaces per-platform env-fallback + token state", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/legacy-token-status`);
  const body = await r.json();
  const byPlatform = new Map<string, any>(
    body.platforms.map((p: any) => [p.platform, p]),
  );

  const yt = byPlatform.get("youtube");
  assert.equal(yt.envFallbackDisabled, false);
  assert.equal(yt.envTokenConfigured, true);
  assert.equal(yt.envDisableKey, "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_YOUTUBE");
  assert.equal(yt.envTokenKey, "AUDIENCE_GATEWAY_YOUTUBE_TOKEN");
  assert.equal(yt.connectorCount, 2);
  assert.equal(yt.perConnectorSecretCount, 1);
  assert.equal(yt.legacyEnvFallbackCount, 1);
  assert.equal(yt.noTokenCount, 0);

  const tg = byPlatform.get("telegram");
  assert.equal(tg.envFallbackDisabled, true);
  assert.equal(tg.envTokenConfigured, true);
  assert.equal(tg.connectorCount, 1);
  assert.equal(tg.legacyEnvFallbackCount, 0);
  assert.equal(tg.noTokenCount, 1);

  // Every platform we know about must appear, even if no connector uses it.
  for (const p of [
    "youtube",
    "facebook",
    "x",
    "telegram",
    "instagram",
    "tiktok",
    "linkedin",
    "reddit",
    "custom",
  ]) {
    assert.ok(byPlatform.has(p), `missing platform ${p}`);
  }
});

test("GET .../legacy-token-status would-break list is exactly approved+official_api+legacy", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/legacy-token-status`);
  const body = await r.json();

  // Only youtube qualifies (c_yt_legacy). c_yt_secret is migrated, c_fb_unapproved
  // is not approved, c_x_readonly is not official_api, c_tg_envoff already in
  // "env fallback OFF" state -> tokenSource=no_token, not legacy_env_fallback.
  assert.equal(body.wouldBreakIfEnvFallbackDisabled.length, 1);
  const yt = body.wouldBreakIfEnvFallbackDisabled[0];
  assert.equal(yt.platform, "youtube");
  assert.equal(yt.envFallbackDisabled, false);
  assert.equal(yt.connectors.length, 1);
  assert.equal(yt.connectors[0].connectorId, "c_yt_legacy");
  assert.equal(yt.connectors[0].displayName, "YT Legacy");
  assert.equal(yt.connectors[0].apiAccessMode, "official_api");
  assert.equal(yt.connectors[0].platformSendApproved, true);
});

test("GET .../legacy-token-status never returns token material", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/legacy-token-status`);
  const text = await r.text();
  assert.equal(text.includes("yt-shared-token"), false);
  assert.equal(text.includes("tg-shared-token"), false);
  assert.equal(text.includes("fb-shared-token"), false);
  assert.equal(text.includes("x-shared-token"), false);
});
