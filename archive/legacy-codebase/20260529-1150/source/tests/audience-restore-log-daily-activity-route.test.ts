/**
 * Task #629 — HTTP route test for the daily-activity window endpoint added in
 * Task #578. Boots a minimal Express app, gates root-admin via a header so we
 * can verify both happy-path and rejected callers, and exercises the clamp /
 * 400-on-bad-input / response-shape contract end-to-end.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import {
  DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
  MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS,
} from "../server/services/audience-restore-log-rate-alert-service";

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());
  const requireRootAdmin: express.RequestHandler = (req, res, next) => {
    if (req.headers["x-test-admin"] === "true") return next();
    return res.status(403).json({ message: "forbidden" });
  };
  registerOmniChannelAudienceRoutes(app, requireRootAdmin);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const URL = `/api/admin/newsroom/audience/retention/restore-log/daily-activity`;
const ADMIN = { "x-test-admin": "true" } as const;

async function get(query: string) {
  return fetch(`${baseUrl}${URL}${query}`, { headers: ADMIN });
}

test("non-root-admin callers are rejected", async () => {
  const r = await fetch(`${baseUrl}${URL}?days=7`);
  assert.equal(r.status, 403);
});

test("no `days` query param falls back to the default window", async () => {
  const r = await get("");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.days, DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
  assert.equal(body.defaultDays, DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
  assert.equal(body.maxDays, MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
  assert.ok(Array.isArray(body.dailyActivity));
  assert.equal(body.dailyActivity.length, DEFAULT_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
});

test("days=0 clamps up to 1", async () => {
  const r = await get("?days=0");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.days, 1);
  assert.equal(body.dailyActivity.length, 1);
});

test("days=7 is honored exactly", async () => {
  const r = await get("?days=7");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.days, 7);
  assert.equal(body.dailyActivity.length, 7);
});

test("days=30 is honored at the upper bound", async () => {
  const r = await get("?days=30");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.days, MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
  assert.equal(body.dailyActivity.length, MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
});

test("days=9999 clamps down to the max window", async () => {
  const r = await get("?days=9999");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.days, MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
  assert.equal(body.dailyActivity.length, MAX_RESTORE_LOG_DAILY_ACTIVITY_DAYS);
});

test("days=abc (non-numeric) is rejected with 400", async () => {
  const r = await get("?days=abc");
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "invalid days");
});
