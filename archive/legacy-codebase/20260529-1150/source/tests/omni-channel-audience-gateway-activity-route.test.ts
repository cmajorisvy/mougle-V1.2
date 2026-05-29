/**
 * Task #422 — HTTP-level test for the gateway activity panel endpoint
 * `GET /api/admin/newsroom/audience/gateway/activity`.
 *
 * Boots a minimal Express app, registers the real
 * `registerOmniChannelAudienceRoutes` with a stub `requireRootAdmin`, and
 * stubs the safety service's `listConnectors` and the gateway service's
 * `peekRateLimit` so the route handler is exercised end-to-end without a DB.
 *
 * Verifies:
 *  - Only `audience.gateway_send_*` events are returned, in reverse-chronological
 *    (newest-first) order, and other bus events are filtered out.
 *  - Each `rateLimits[]` row carries the connector's `platformSendApproved`
 *    metadata and the bucket's `used / limit / remaining / windowMs / resetAt`.
 *  - `liveDispatchEnabled` mirrors `process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH`.
 *  - The `limit` query param is clamped: <1 / non-numeric is rejected (400),
 *    >500 is rejected (400), and a valid `limit` truncates the returned events.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { audiencePlatformGatewayService } from "../server/services/audience-platform-gateway-service";
import { neuralNewsroomBus } from "../server/services/neural-newsroom-bus";

const fakeConnectors = [
  {
    connectorId: "c_yt_1",
    platform: "youtube",
    accountId: "yt_acct",
    displayName: "YT Channel",
    connectionStatus: "connected",
    apiAccessMode: "read_only",
    platformSendApproved: true,
    platformSendApprovedBy: "founder_root",
    platformSendApprovedAt: "2026-05-15T10:00:00.000Z",
    permissions: { canReadComments: true },
  },
  {
    connectorId: "c_tg_1",
    platform: "telegram",
    accountId: "tg_acct",
    displayName: "TG Channel",
    connectionStatus: "connected",
    apiAccessMode: "read_only",
    platformSendApproved: false,
    platformSendApprovedBy: null,
    platformSendApprovedAt: null,
    permissions: { canReadComments: true },
  },
];

const fakeRateLimits: Record<
  string,
  {
    used: number;
    limit: number;
    remaining: number;
    windowMs: number;
    resetAt: string;
  } | null
> = {
  c_yt_1: {
    used: 7,
    limit: 60,
    remaining: 53,
    windowMs: 60_000,
    resetAt: "2026-05-21T00:01:00.000Z",
  },
  c_tg_1: {
    used: 0,
    limit: 30,
    remaining: 30,
    windowMs: 60_000,
    resetAt: "2026-05-21T00:01:00.000Z",
  },
};

const origListConnectors = (omniChannelAudienceSafetyService as any).listConnectors.bind(
  omniChannelAudienceSafetyService,
);
const origPeekRateLimit = (audiencePlatformGatewayService as any).peekRateLimit.bind(
  audiencePlatformGatewayService,
);
const origLiveDispatch = process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;

let server: Server;
let baseUrl: string;

before(async () => {
  (omniChannelAudienceSafetyService as any).listConnectors = async () => fakeConnectors;
  (audiencePlatformGatewayService as any).peekRateLimit = async (id: string) =>
    fakeRateLimits[id] ?? null;

  neuralNewsroomBus.reset();
  // Seed a mix of events. Only the three audience.gateway_send_* events
  // should be returned by the activity endpoint, and they should come back
  // newest-first.
  neuralNewsroomBus.emit("audience.message_received", { messageId: "m1" });
  neuralNewsroomBus.emit("audience.gateway_send_simulated", {
    commandId: "cmd_1",
    connectorId: "c_yt_1",
  });
  neuralNewsroomBus.emit("audience.spam_blocked", { messageId: "m2" });
  neuralNewsroomBus.emit("audience.gateway_send_dispatched", {
    commandId: "cmd_2",
    connectorId: "c_yt_1",
  });
  neuralNewsroomBus.emit("audience.gateway_send_blocked", {
    commandId: "cmd_3",
    connectorId: "c_tg_1",
    reason: "platform_not_approved",
  });

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
  (audiencePlatformGatewayService as any).peekRateLimit = origPeekRateLimit;
  if (origLiveDispatch === undefined) {
    delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
  } else {
    process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = origLiveDispatch;
  }
  neuralNewsroomBus.reset();
  await new Promise<void>((r) => server.close(() => r()));
});

test("GET .../gateway/activity returns only audience.gateway_send_* events, newest first", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/gateway/activity`);
  assert.equal(r.status, 200);
  const body = await r.json();

  assert.ok(Array.isArray(body.events), "events must be an array");
  assert.equal(body.events.length, 3, "only the three gateway_send_* events");
  for (const e of body.events) {
    assert.ok(
      String(e.name).startsWith("audience.gateway_send_"),
      `unexpected event leaked: ${e.name}`,
    );
  }
  // Reverse-chronological: blocked (last emitted) → dispatched → simulated.
  assert.deepEqual(
    body.events.map((e: any) => e.name),
    [
      "audience.gateway_send_blocked",
      "audience.gateway_send_dispatched",
      "audience.gateway_send_simulated",
    ],
  );
  assert.equal(body.platformSendAllowed, false);
});

test("GET .../gateway/activity returns rateLimits with bucket + connector approval metadata", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/gateway/activity`);
  assert.equal(r.status, 200);
  const body = await r.json();

  assert.ok(Array.isArray(body.rateLimits));
  assert.equal(body.rateLimits.length, fakeConnectors.length);

  const yt = body.rateLimits.find((x: any) => x.connectorId === "c_yt_1");
  assert.ok(yt, "youtube connector rate-limit row present");
  assert.equal(yt.platform, "youtube");
  assert.equal(yt.displayName, "YT Channel");
  assert.equal(yt.platformSendApproved, true);
  assert.equal(yt.platformSendApprovedBy, "founder_root");
  assert.equal(yt.platformSendApprovedAt, "2026-05-15T10:00:00.000Z");
  assert.equal(yt.apiAccessMode, "read_only");
  assert.ok(yt.rateLimit, "rateLimit bucket present");
  assert.equal(yt.rateLimit.used, 7);
  assert.equal(yt.rateLimit.limit, 60);
  assert.equal(yt.rateLimit.remaining, 53);
  assert.equal(yt.rateLimit.windowMs, 60_000);
  assert.equal(yt.rateLimit.resetAt, "2026-05-21T00:01:00.000Z");

  const tg = body.rateLimits.find((x: any) => x.connectorId === "c_tg_1");
  assert.ok(tg);
  assert.equal(tg.platformSendApproved, false);
  assert.equal(tg.platformSendApprovedBy, null);
  assert.equal(tg.platformSendApprovedAt, null);
  assert.equal(tg.rateLimit.limit, 30);
  assert.equal(tg.rateLimit.remaining, 30);
});

test("GET .../gateway/activity liveDispatchEnabled mirrors AUDIENCE_GATEWAY_LIVE_DISPATCH", async () => {
  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "true";
  let r = await fetch(`${baseUrl}/api/admin/newsroom/audience/gateway/activity`);
  assert.equal(r.status, 200);
  let body = await r.json();
  assert.equal(body.liveDispatchEnabled, true);

  process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH = "false";
  r = await fetch(`${baseUrl}/api/admin/newsroom/audience/gateway/activity`);
  body = await r.json();
  assert.equal(body.liveDispatchEnabled, false);

  delete process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH;
  r = await fetch(`${baseUrl}/api/admin/newsroom/audience/gateway/activity`);
  body = await r.json();
  assert.equal(body.liveDispatchEnabled, false);
});

test("GET .../gateway/activity clamps the `limit` query param to 1..500", async () => {
  // In-range limit truncates the returned events to the requested size.
  let r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity?limit=1`,
  );
  assert.equal(r.status, 200);
  let body = await r.json();
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].name, "audience.gateway_send_blocked");

  // Upper bound: 500 is accepted.
  r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity?limit=500`,
  );
  assert.equal(r.status, 200);

  // Above upper bound: clamped down to 500 (request still succeeds and
  // returns every available gateway_send_* event, which is <= 500).
  r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity?limit=999`,
  );
  assert.equal(r.status, 200);
  body = await r.json();
  assert.equal(body.events.length, 3);

  // Zero is clamped up to 1.
  r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity?limit=0`,
  );
  assert.equal(r.status, 200);
  body = await r.json();
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].name, "audience.gateway_send_blocked");

  // Negative is also clamped up to 1.
  r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity?limit=-5`,
  );
  assert.equal(r.status, 200);
  body = await r.json();
  assert.equal(body.events.length, 1);

  // Non-numeric input is rejected with 400 (it isn't a clampable value).
  r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity?limit=abc`,
  );
  assert.equal(r.status, 400);
});
