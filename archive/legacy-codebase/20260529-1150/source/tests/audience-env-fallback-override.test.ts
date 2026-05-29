/**
 * Task #501 — Per-platform admin override for the legacy-token env-fallback
 * kill-switch.
 *
 * Verifies:
 *   1. `setEnvFallbackDisabledOverride(platform, true|false|null)` persists
 *      to / clears `system_settings.audience_gateway_env_fallback_disabled`.
 *   2. Override beats env beats default.
 *   3. `getLegacyTokenStatus()` surfaces the resolved value, the override
 *      itself, the env-only value, and the source ("admin"|"env"|"default").
 *   4. `PUT .../legacy-token-status/:platform/env-fallback-disabled`
 *      validates the platform path param and the body; happy path returns
 *      the refreshed status snapshot.
 *   5. Token material is never echoed back by the PUT response.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "../shared/schema";
import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { audienceConnectorSecretsService } from "../server/services/audience-connector-secrets-service";
import {
  audiencePlatformGatewayService,
  setEnvFallbackDisabledOverride,
  setEnvFallbackDisabledOverridesBulk,
  readEnvFallbackDisabledOverride,
  __testing as gatewayTesting,
} from "../server/services/audience-platform-gateway-service";

const SETTING_KEY = gatewayTesting.ENV_FALLBACK_OVERRIDE_SETTING_KEY;

const fakeConnectors = [
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
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_YOUTUBE",
  "AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_FACEBOOK",
] as const;
const origEnv: Record<string, string | undefined> = {};

let server: Server;
let baseUrl: string;

before(async () => {
  (omniChannelAudienceSafetyService as any).listConnectors = async () => fakeConnectors;
  (audienceConnectorSecretsService as any).listMetadata = async () => [];
  (audienceConnectorSecretsService as any).isConfigured = () => true;

  for (const k of ENV_KEYS) origEnv[k] = process.env[k];
  process.env.AUDIENCE_GATEWAY_YOUTUBE_TOKEN = "yt-shared-secret-value";
  delete process.env.AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_YOUTUBE;
  // Facebook env-disabled at the env layer so we can test "admin overrides env".
  process.env.AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_FACEBOOK = "true";

  const app = express();
  app.use(express.json());
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
  await db.delete(systemSettings).where(eq(systemSettings.key, SETTING_KEY));
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  await db.delete(systemSettings).where(eq(systemSettings.key, SETTING_KEY));
});

test("setEnvFallbackDisabledOverride persists and clears per-platform", async () => {
  await setEnvFallbackDisabledOverride("youtube", true, "tester");
  let stored = await readEnvFallbackDisabledOverride();
  assert.equal(stored.youtube, true);

  await setEnvFallbackDisabledOverride("telegram", false, "tester");
  stored = await readEnvFallbackDisabledOverride();
  assert.equal(stored.youtube, true);
  assert.equal(stored.telegram, false);

  await setEnvFallbackDisabledOverride("youtube", null, "tester");
  stored = await readEnvFallbackDisabledOverride();
  assert.equal(stored.youtube, undefined);
  assert.equal(stored.telegram, false);

  // Clearing the last entry removes the row entirely.
  await setEnvFallbackDisabledOverride("telegram", null, "tester");
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, SETTING_KEY));
  assert.equal(rows.length, 0);
});

test("setEnvFallbackDisabledOverride rejects unknown platform", async () => {
  await assert.rejects(
    () => setEnvFallbackDisabledOverride("myspace" as any, true, "tester"),
    /unknown_platform/,
  );
});

test("getLegacyTokenStatus reflects override precedence and source", async () => {
  // No override yet: youtube uses env (unset) → ON, facebook uses env true → OFF.
  let status = await audiencePlatformGatewayService.getLegacyTokenStatus();
  const before = new Map(status.platforms.map((p) => [p.platform, p]));
  const ytBefore = before.get("youtube")!;
  assert.equal(ytBefore.envFallbackDisabled, false);
  assert.equal(ytBefore.envFallbackDisabledSource, "default");
  assert.equal(ytBefore.envFallbackDisabledOverride, null);
  assert.equal(ytBefore.envFallbackDisabledFromEnv, false);

  const fbBefore = before.get("facebook")!;
  assert.equal(fbBefore.envFallbackDisabled, true);
  assert.equal(fbBefore.envFallbackDisabledSource, "env");
  assert.equal(fbBefore.envFallbackDisabledOverride, null);
  assert.equal(fbBefore.envFallbackDisabledFromEnv, true);

  // Admin override true on youtube; admin override false on facebook
  // (admin OFF beats env ON).
  await setEnvFallbackDisabledOverride("youtube", true, "tester");
  await setEnvFallbackDisabledOverride("facebook", false, "tester");

  status = await audiencePlatformGatewayService.getLegacyTokenStatus();
  const after = new Map(status.platforms.map((p) => [p.platform, p]));
  const ytAfter = after.get("youtube")!;
  assert.equal(ytAfter.envFallbackDisabled, true);
  assert.equal(ytAfter.envFallbackDisabledSource, "admin");
  assert.equal(ytAfter.envFallbackDisabledOverride, true);
  assert.equal(ytAfter.envFallbackDisabledFromEnv, false);

  const fbAfter = after.get("facebook")!;
  assert.equal(fbAfter.envFallbackDisabled, false);
  assert.equal(fbAfter.envFallbackDisabledSource, "admin");
  assert.equal(fbAfter.envFallbackDisabledOverride, false);
  assert.equal(fbAfter.envFallbackDisabledFromEnv, true);

  // Flipping youtube to disabled OFF the env-token-source connector means
  // its tokenSource collapses to "no_token" and it drops out of the
  // would-break list.
  const wb = new Map(
    status.wouldBreakIfEnvFallbackDisabled.map((p) => [p.platform, p]),
  );
  assert.equal(wb.has("youtube"), false);
});

test("PUT env-fallback-disabled rejects unknown platform with 400", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/myspace/env-fallback-disabled`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: true }),
    },
  );
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "unknown_platform");
});

test("PUT env-fallback-disabled rejects invalid body with 400", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/youtube/env-fallback-disabled`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: "yes" }),
    },
  );
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "invalid input");
});

test("PUT env-fallback-disabled returns refreshed status without token material", async () => {
  // Flip youtube override ON via the route.
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/youtube/env-fallback-disabled`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: true }),
    },
  );
  assert.equal(r.status, 200);
  const text = await r.text();
  // Never echo token material.
  assert.equal(text.includes("yt-shared-secret-value"), false);

  const body = JSON.parse(text);
  const yt = body.platforms.find((p: any) => p.platform === "youtube");
  assert.equal(yt.envFallbackDisabled, true);
  assert.equal(yt.envFallbackDisabledSource, "admin");
  assert.equal(yt.envFallbackDisabledOverride, true);

  // Clearing returns it to env/default.
  const r2 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/youtube/env-fallback-disabled`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: null }),
    },
  );
  assert.equal(r2.status, 200);
  const body2 = await r2.json();
  const yt2 = body2.platforms.find((p: any) => p.platform === "youtube");
  assert.equal(yt2.envFallbackDisabled, false);
  assert.equal(yt2.envFallbackDisabledSource, "default");
  assert.equal(yt2.envFallbackDisabledOverride, null);
});

test("setEnvFallbackDisabledOverridesBulk applies multiple platforms in one write", async () => {
  await setEnvFallbackDisabledOverridesBulk(
    [
      { platform: "youtube", disabled: true },
      { platform: "telegram", disabled: false },
      { platform: "facebook", disabled: true },
    ],
    "tester",
  );
  const stored = await readEnvFallbackDisabledOverride();
  assert.equal(stored.youtube, true);
  assert.equal(stored.telegram, false);
  assert.equal(stored.facebook, true);

  // null entries clear, true/false entries update — partial bulk update.
  await setEnvFallbackDisabledOverridesBulk(
    [
      { platform: "youtube", disabled: null },
      { platform: "facebook", disabled: false },
    ],
    "tester",
  );
  const after = await readEnvFallbackDisabledOverride();
  assert.equal(after.youtube, undefined);
  assert.equal(after.telegram, false);
  assert.equal(after.facebook, false);
});

test("setEnvFallbackDisabledOverridesBulk rejects unknown platform before writing", async () => {
  await setEnvFallbackDisabledOverride("youtube", true, "tester");
  await assert.rejects(
    () =>
      setEnvFallbackDisabledOverridesBulk(
        [
          { platform: "telegram", disabled: true },
          { platform: "myspace" as any, disabled: true },
        ],
        "tester",
      ),
    /unknown_platform/,
  );
  // Pre-existing override is preserved; the bad-batch should NOT have
  // persisted the telegram=true update either.
  const stored = await readEnvFallbackDisabledOverride();
  assert.equal(stored.youtube, true);
  assert.equal(stored.telegram, undefined);
});

test("setEnvFallbackDisabledOverridesBulk rejects empty updates", async () => {
  await assert.rejects(
    () => setEnvFallbackDisabledOverridesBulk([], "tester"),
    /no_updates/,
  );
});

test("PUT env-fallback-disabled-bulk applies overrides and returns refreshed status", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/env-fallback-disabled-bulk`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overrides: [
          { platform: "youtube", disabled: true },
          { platform: "facebook", disabled: false },
        ],
      }),
    },
  );
  assert.equal(r.status, 200);
  const text = await r.text();
  // Never echo token material.
  assert.equal(text.includes("yt-shared-secret-value"), false);
  const body = JSON.parse(text);
  const yt = body.platforms.find((p: any) => p.platform === "youtube");
  const fb = body.platforms.find((p: any) => p.platform === "facebook");
  assert.equal(yt.envFallbackDisabled, true);
  assert.equal(yt.envFallbackDisabledSource, "admin");
  assert.equal(fb.envFallbackDisabled, false);
  assert.equal(fb.envFallbackDisabledSource, "admin");

  // Clearing-all variant — pass `disabled: null` for every overridden
  // platform in one call.
  const r2 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/env-fallback-disabled-bulk`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overrides: [
          { platform: "youtube", disabled: null },
          { platform: "facebook", disabled: null },
        ],
      }),
    },
  );
  assert.equal(r2.status, 200);
  const body2 = await r2.json();
  const yt2 = body2.platforms.find((p: any) => p.platform === "youtube");
  const fb2 = body2.platforms.find((p: any) => p.platform === "facebook");
  assert.equal(yt2.envFallbackDisabledOverride, null);
  assert.equal(fb2.envFallbackDisabledOverride, null);
  // Env-derived state restored.
  assert.equal(yt2.envFallbackDisabled, false);
  assert.equal(fb2.envFallbackDisabled, true); // env says true
});

test("PUT env-fallback-disabled-bulk rejects unknown platform with 400", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/env-fallback-disabled-bulk`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overrides: [
          { platform: "youtube", disabled: true },
          { platform: "myspace", disabled: true },
        ],
      }),
    },
  );
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "invalid input");
});

test("PUT env-fallback-disabled-bulk rejects empty overrides with 400", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/legacy-token-status/env-fallback-disabled-bulk`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: [] }),
    },
  );
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "invalid input");
});

test("isEnvFallbackDisabled (live) reflects the admin override", async () => {
  // env DISABLE flag unset → default false.
  assert.equal(await gatewayTesting.isEnvFallbackDisabled("youtube"), false);
  await setEnvFallbackDisabledOverride("youtube", true, "tester");
  assert.equal(await gatewayTesting.isEnvFallbackDisabled("youtube"), true);
  // Override false beats env true.
  assert.equal(await gatewayTesting.isEnvFallbackDisabled("facebook"), true);
  await setEnvFallbackDisabledOverride("facebook", false, "tester");
  assert.equal(await gatewayTesting.isEnvFallbackDisabled("facebook"), false);
});
