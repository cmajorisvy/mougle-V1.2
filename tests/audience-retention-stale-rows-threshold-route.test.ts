/**
 * Task #468 — HTTP route test for the stale-rows alert threshold admin
 * controls. Boots a minimal Express app, stubs root-admin auth, and
 * exercises GET + PUT /api/admin/newsroom/audience/retention/stale-rows-threshold
 * end-to-end against the real service (which persists to system_settings).
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { eq } from "drizzle-orm";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import {
  AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY,
  DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
} from "../server/services/audience-retention-stale-rows-alert-service";

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());
  const stubRequireRootAdmin: express.RequestHandler = (_req, _res, next) =>
    next();
  registerOmniChannelAudienceRoutes(app, stubRequireRootAdmin);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  await db
    .delete(systemSettings)
    .where(
      eq(
        systemSettings.key,
        AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY,
      ),
    );
  delete process.env.AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD;
});

const URL = `/api/admin/newsroom/audience/retention/stale-rows-threshold`;

test("GET returns the default thresholds with no override", async () => {
  const r = await fetch(`${baseUrl}${URL}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.override, null);
  assert.equal(
    body.thresholds.messages,
    DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
  );
  assert.equal(
    body.thresholds.decisions,
    DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
  );
  assert.equal(
    body.thresholds.commands,
    DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
  );
});

test("PUT persists a per-table + default override", async () => {
  const r = await fetch(`${baseUrl}${URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      override: { default: 5000, messages: 250, decisions: 1000 },
    }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.thresholds.messages, 250);
  assert.equal(body.thresholds.decisions, 1000);
  assert.equal(body.thresholds.commands, 5000);
  assert.equal(body.override.default, 5000);

  const r2 = await fetch(`${baseUrl}${URL}`);
  const body2 = await r2.json();
  assert.equal(body2.thresholds.messages, 250);
  assert.equal(body2.override.messages, 250);
});

test("PUT with override:null clears the override", async () => {
  await fetch(`${baseUrl}${URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ override: { messages: 42 } }),
  });
  const cleared = await fetch(`${baseUrl}${URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ override: null }),
  });
  assert.equal(cleared.status, 200);
  const body = await cleared.json();
  assert.equal(body.override, null);
  assert.equal(
    body.thresholds.messages,
    DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
  );
});

test("PUT rejects negative thresholds", async () => {
  const r = await fetch(`${baseUrl}${URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ override: { messages: -1 } }),
  });
  assert.equal(r.status, 400);
});

test("PUT with empty override object is treated as a clear", async () => {
  await fetch(`${baseUrl}${URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ override: { messages: 99 } }),
  });
  const r = await fetch(`${baseUrl}${URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ override: {} }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.override, null);
});

// Task #512: plural-form alias `/stale-rows-thresholds` must accept the
// same payload shape and read the same persisted override as the original
// singular path so the admin UI can hit either one interchangeably.
const PLURAL_URL = `/api/admin/newsroom/audience/retention/stale-rows-thresholds`;

test("plural alias: GET returns defaults with no override", async () => {
  const r = await fetch(`${baseUrl}${PLURAL_URL}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.override, null);
  assert.equal(
    body.thresholds.messages,
    DEFAULT_AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD,
  );
});

test("plural alias: PUT persists and is visible through the singular GET", async () => {
  const r = await fetch(`${baseUrl}${PLURAL_URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      override: { default: 7000, commands: 123 },
    }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.thresholds.commands, 123);
  assert.equal(body.thresholds.messages, 7000);
  assert.equal(body.thresholds.decisions, 7000);

  const singular = await fetch(`${baseUrl}${URL}`);
  const singularBody = await singular.json();
  assert.equal(singularBody.thresholds.commands, 123);
  assert.equal(singularBody.override.default, 7000);
});

test("plural alias: PUT rejects negative thresholds", async () => {
  const r = await fetch(`${baseUrl}${PLURAL_URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ override: { decisions: -5 } }),
  });
  assert.equal(r.status, 400);
});

test("plural alias: PUT override:null clears the override", async () => {
  await fetch(`${baseUrl}${PLURAL_URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ override: { messages: 88 } }),
  });
  const cleared = await fetch(`${baseUrl}${PLURAL_URL}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ override: null }),
  });
  assert.equal(cleared.status, 200);
  const body = await cleared.json();
  assert.equal(body.override, null);
});
