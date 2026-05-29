/**
 * Task #410 — Coverage for the audit-email preview path.
 *
 * Verifies:
 *   1. `audienceAuditEmailScheduler.previewNow()` returns subject / html /
 *      attachment manifest whose record counts mirror
 *      `omniChannelAudienceSafetyService.exportAuditTrail` for the schedule
 *      cadence, and does NOT insert into `audience_audit_email_runs` and
 *      does NOT invoke Resend (no outbound fetch).
 *   2. The POST /api/admin/newsroom/audience/email-schedule/preview route
 *      is gated by `requireRootAdmin` (401 when unauthenticated) and on
 *      success returns `platformSendAllowed:false` / `realSendAllowed:false`.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { audienceAuditEmailScheduler } from "../server/services/audience-audit-email-scheduler";
import { requireRootAdmin } from "../server/middleware/admin-auth";

const originalExport = (omniChannelAudienceSafetyService as any).exportAuditTrail.bind(
  omniChannelAudienceSafetyService,
);

const fakeExportPayload = {
  connectors: [
    { connectorId: "c_1", platform: "youtube", accountId: "y", displayName: "y",
      connectionStatus: "connected", apiAccessMode: "read_only", permissions: {} },
    { connectorId: "c_2", platform: "x", accountId: "x", displayName: "x",
      connectionStatus: "connected", apiAccessMode: "read_only", permissions: {} },
  ],
  messages: [
    { messageId: "m1" }, { messageId: "m2" }, { messageId: "m3" },
  ],
  decisions: [
    { decisionId: "d1" }, { decisionId: "d2" },
  ],
  commands: [
    { commandId: "cmd1" }, { commandId: "cmd2" }, { commandId: "cmd3" }, { commandId: "cmd4" },
  ],
  filters: { fromDate: null, toDate: null, platform: null, productionId: null },
  exportedAt: new Date("2026-05-20T12:34:56.789Z").toISOString(),
};

let exportCallCount = 0;
let lastExportFilters: any = null;

let serverStub: Server;
let baseUrlStub: string;
let serverReal: Server;
let baseUrlReal: string;

before(async () => {
  // Stub exportAuditTrail so the preview path doesn't depend on DB content.
  (omniChannelAudienceSafetyService as any).exportAuditTrail = async (filters: any) => {
    exportCallCount++;
    lastExportFilters = filters;
    return {
      ...fakeExportPayload,
      filters: {
        fromDate: filters?.fromDate ? filters.fromDate.toISOString() : null,
        toDate: filters?.toDate ? filters.toDate.toISOString() : null,
        platform: filters?.platform ?? null,
        productionId: filters?.productionId ?? null,
      },
    };
  };

  await audienceAuditEmailScheduler.resetForTests();
  // Configure a schedule with recipients so previewNow's downstream call
  // surface looks like the real Preview button scenario.
  await audienceAuditEmailScheduler.upsertSchedule({
    enabled: true,
    cadence: "weekly",
    recipients: ["compliance@example.com"],
    platform: null,
    productionId: null,
  });

  // App #1 — stubbed requireRootAdmin so the success path is exercised.
  const appStub = express();
  appStub.use(express.json());
  const stubRequire: express.RequestHandler = (_req, _res, next) => next();
  registerOmniChannelAudienceRoutes(appStub, stubRequire);
  serverStub = createServer(appStub);
  await new Promise<void>((r) => serverStub.listen(0, "127.0.0.1", r));
  const a1 = serverStub.address();
  if (!a1 || typeof a1 === "string") throw new Error("no address");
  baseUrlStub = `http://127.0.0.1:${a1.port}`;

  // App #2 — REAL requireRootAdmin so the auth-gating assertion is exercised.
  const appReal = express();
  appReal.use(express.json());
  registerOmniChannelAudienceRoutes(appReal, requireRootAdmin);
  serverReal = createServer(appReal);
  await new Promise<void>((r) => serverReal.listen(0, "127.0.0.1", r));
  const a2 = serverReal.address();
  if (!a2 || typeof a2 === "string") throw new Error("no address");
  baseUrlReal = `http://127.0.0.1:${a2.port}`;
});

after(async () => {
  (omniChannelAudienceSafetyService as any).exportAuditTrail = originalExport;
  await audienceAuditEmailScheduler.resetForTests();
  await new Promise<void>((r) => serverStub.close(() => r()));
  await new Promise<void>((r) => serverReal.close(() => r()));
});

beforeEach(() => {
  exportCallCount = 0;
  lastExportFilters = null;
});

test("previewNow() returns subject/html/attachment manifest with the same counts as exportAuditTrail", async () => {
  const preview = await audienceAuditEmailScheduler.previewNow();

  // Counts mirror the stubbed exportAuditTrail output.
  assert.equal(preview.connectorCount, fakeExportPayload.connectors.length);
  assert.equal(preview.messageCount, fakeExportPayload.messages.length);
  assert.equal(preview.decisionCount, fakeExportPayload.decisions.length);
  assert.equal(preview.commandCount, fakeExportPayload.commands.length);

  // Subject / html are populated and reflect the schedule cadence.
  assert.ok(preview.subject.includes("weekly"));
  assert.ok(preview.subject.includes("Mougle audience moderation audit"));
  assert.ok(preview.html.length > 0);
  assert.ok(preview.html.includes("Compliance audit export"));

  // Attachment manifest: JSON + CSV, both with non-zero sizes and the
  // expected audience-audit-trail filenames.
  assert.equal(preview.attachments.length, 2);
  const json = preview.attachments.find((a) => a.filename.endsWith(".json"));
  const csv = preview.attachments.find((a) => a.filename.endsWith(".csv"));
  assert.ok(json, "missing JSON attachment");
  assert.ok(csv, "missing CSV attachment");
  assert.ok(json!.filename.startsWith("audience-audit-trail-"));
  assert.ok(csv!.filename.startsWith("audience-audit-trail-"));
  assert.ok(json!.sizeBytes > 0);
  assert.ok(csv!.sizeBytes > 0);

  // exportAuditTrail was called once with the schedule's window/filter shape.
  assert.equal(exportCallCount, 1);
  assert.ok(lastExportFilters.fromDate instanceof Date);
  assert.ok(lastExportFilters.toDate instanceof Date);
  assert.equal(lastExportFilters.platform, undefined);
  assert.equal(lastExportFilters.productionId, undefined);

  // Recipients are echoed from the schedule.
  assert.deepEqual(preview.recipients, ["compliance@example.com"]);
});

test("previewNow() does NOT insert a row into audience_audit_email_runs and does NOT call Resend", async () => {
  const runsBefore = await audienceAuditEmailScheduler.listRuns(200);

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async (...args: any[]) => {
    fetchCalls++;
    return originalFetch(...(args as Parameters<typeof fetch>));
  }) as any;

  try {
    await audienceAuditEmailScheduler.previewNow();
  } finally {
    globalThis.fetch = originalFetch;
  }

  // No outbound HTTP at all — Resend client is never constructed because
  // previewNow only calls buildAudienceAuditExportEmail (pure builder).
  assert.equal(fetchCalls, 0, `previewNow() must not perform any outbound fetch (Resend), got ${fetchCalls}`);

  // Runs table is unchanged — preview never persists a run.
  const runsAfter = await audienceAuditEmailScheduler.listRuns(200);
  assert.equal(runsAfter.length, runsBefore.length);
});

test("POST /email-schedule/preview is gated by requireRootAdmin (401 unauthenticated)", async () => {
  const r = await fetch(`${baseUrlReal}/api/admin/newsroom/audience/email-schedule/preview`, {
    method: "POST",
  });
  assert.equal(r.status, 401);
  const body = await r.json();
  assert.equal(body.message, "Unauthorized");

  const r2 = await fetch(`${baseUrlReal}/api/admin/omni-channel-audience/email-schedule/preview`, {
    method: "POST",
  });
  assert.equal(r2.status, 401);
});

test("POST /email-schedule/preview returns platformSendAllowed:false / realSendAllowed:false on success", async () => {
  const r = await fetch(`${baseUrlStub}/api/admin/newsroom/audience/email-schedule/preview`, {
    method: "POST",
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.platformSendAllowed, false);
  assert.equal(body.realSendAllowed, false);
  assert.ok(body.preview);
  assert.equal(body.preview.messageCount, fakeExportPayload.messages.length);
  assert.equal(body.preview.decisionCount, fakeExportPayload.decisions.length);
  assert.equal(body.preview.commandCount, fakeExportPayload.commands.length);
  assert.equal(body.preview.connectorCount, fakeExportPayload.connectors.length);
  assert.equal(body.preview.attachments.length, 2);
});
