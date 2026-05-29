/**
 * Task #409 — HTTP-level test for the "Send test to me" route.
 *
 * Boots a minimal Express app, registers the real
 * `registerOmniChannelAudienceRoutes` with a stub `requireRootAdmin` that
 * seeds session fields, and stubs `audienceAuditEmailScheduler.sendTestNow`
 * to avoid hitting the DB or Resend.
 *
 * Verifies:
 *  - 200: resolves the admin's email (FOUNDER_EMAIL for root admin) and
 *    forwards exactly that single recipient to sendTestNow; response body
 *    includes the recipient + the persisted run row.
 *  - 400: when no admin email is configured the route returns a clear
 *    "no admin email configured" error and the scheduler is NOT called.
 *  - sendTestNow itself validates the email argument.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { audienceAuditEmailScheduler } from "../server/services/audience-audit-email-scheduler";

let server: Server;
let baseUrl: string;
let sessionStub: any = {};
let lastSendTestArg: string | null = null;
const originalSendTestNow = (audienceAuditEmailScheduler as any).sendTestNow.bind(
  audienceAuditEmailScheduler,
);
const originalFounderEmail = process.env.FOUNDER_EMAIL;
const originalAdminUsername = process.env.ADMIN_USERNAME;

before(async () => {
  (audienceAuditEmailScheduler as any).sendTestNow = async (email: string) => {
    lastSendTestArg = email;
    return {
      runId: "aud_run_test_1",
      scheduleId: "audience_audit_email",
      cadence: "weekly",
      triggeredBy: "manual",
      isTest: true,
      windowFrom: new Date("2026-05-01T00:00:00.000Z").toISOString(),
      windowTo: new Date("2026-05-08T00:00:00.000Z").toISOString(),
      recipients: [email],
      status: "success",
      errorMessage: null,
      messageCount: 0,
      decisionCount: 0,
      commandCount: 0,
      connectorCount: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  };

  const app = express();
  app.use(express.json());
  const stubRequireRootAdmin: express.RequestHandler = (req, _res, next) => {
    (req as any).session = sessionStub;
    next();
  };
  registerOmniChannelAudienceRoutes(app, stubRequireRootAdmin);

  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  (audienceAuditEmailScheduler as any).sendTestNow = originalSendTestNow;
  if (originalFounderEmail === undefined) delete process.env.FOUNDER_EMAIL;
  else process.env.FOUNDER_EMAIL = originalFounderEmail;
  if (originalAdminUsername === undefined) delete process.env.ADMIN_USERNAME;
  else process.env.ADMIN_USERNAME = originalAdminUsername;
  await new Promise<void>((r) => server.close(() => r()));
});

test("POST .../email-schedule/preview/send-test resolves root-admin FOUNDER_EMAIL and forwards it as the sole recipient", async () => {
  sessionStub = { adminActorType: "root_admin", adminActorId: "env-root-admin" };
  process.env.FOUNDER_EMAIL = "Founder@Example.com";
  delete process.env.ADMIN_USERNAME;
  lastSendTestArg = null;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/email-schedule/preview/send-test`,
    { method: "POST" },
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.recipient, "founder@example.com");
  assert.equal(lastSendTestArg, "founder@example.com");
  assert.deepEqual(body.run.recipients, ["founder@example.com"]);
  assert.equal(body.run.triggeredBy, "manual");
  assert.equal(body.run.isTest, true);
  assert.equal(body.run.status, "success");
});

test("POST .../email-schedule/preview/send-test falls back to ADMIN_USERNAME when it looks like an email", async () => {
  sessionStub = { adminActorType: "root_admin", adminActorId: "env-root-admin" };
  delete process.env.FOUNDER_EMAIL;
  process.env.ADMIN_USERNAME = "ops@example.com";
  lastSendTestArg = null;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/email-schedule/preview/send-test`,
    { method: "POST" },
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.recipient, "ops@example.com");
  assert.equal(lastSendTestArg, "ops@example.com");
});

test("POST .../email-schedule/preview/send-test returns 400 when no admin email is configured", async () => {
  sessionStub = { adminActorType: "root_admin", adminActorId: "env-root-admin" };
  delete process.env.FOUNDER_EMAIL;
  process.env.ADMIN_USERNAME = "rootuser"; // not email-shaped
  lastSendTestArg = null;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/email-schedule/preview/send-test`,
    { method: "POST" },
  );
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.match(String(body.message), /no admin email configured/);
  assert.equal(lastSendTestArg, null);
});

test("sendTestNow rejects an invalid email string", async () => {
  // Bypass the stub for this assertion
  (audienceAuditEmailScheduler as any).sendTestNow = originalSendTestNow;
  await assert.rejects(
    () => audienceAuditEmailScheduler.sendTestNow("not-an-email"),
    /invalid admin email/,
  );
  // Re-install the stub for any remaining tests
  (audienceAuditEmailScheduler as any).sendTestNow = async (email: string) => {
    lastSendTestArg = email;
    return {} as any;
  };
});
