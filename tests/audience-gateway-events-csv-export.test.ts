/**
 * Task #492 — HTTP-level test for the gateway events CSV export route
 * `GET /api/admin/newsroom/audience/gateway/activity/export`.
 *
 * Seeds the real `audience_gateway_events` table (also used by Task #421
 * tests) and exercises the route against a minimal Express app with a
 * stub `requireRootAdmin` so the handler is wired end-to-end. Verifies:
 *  - 200 + `text/csv` Content-Type + `attachment` Content-Disposition.
 *  - The CSV body contains the meta header and one row per matching
 *    event, with from/to filters honored.
 *  - The download is recorded in the audit-export trail with
 *    `format:"csv"` and a `__gateway_activity__` sentinel productionId.
 *  - 400 on `from > to` and on an unparseable from.
 *  - The CSV builder's `truncated` flag round-trips into the meta row
 *    and the `X-Audit-Export-Truncated` response header.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";
import { recordGatewayEvent } from "../server/services/audience-gateway-event-log-service";
import { db } from "../server/db";
import {
  audienceGatewayEvents,
  audienceAuditExports,
} from "../shared/omni-channel-audience-schema";
import { desc, sql } from "drizzle-orm";
import { buildAudienceGatewayEventsCsv } from "../server/services/audience-audit-csv";

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  const stub: express.RequestHandler = (_req, _res, next) => next();
  registerOmniChannelAudienceRoutes(app, stub);
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
  await omniChannelAudienceSafetyService.reset();
  await db.delete(audienceGatewayEvents);
  // Drop any meta-audit rows left by prior gateway-activity exports so
  // each test sees a clean slate. `filters` is a JSONB column, so we
  // match on the productionId field with a Postgres JSON operator
  // instead of `like` on the whole object.
  await db
    .delete(audienceAuditExports)
    .where(sql`${audienceAuditExports.filters}->>'productionId' LIKE '__gateway_activity__%'`);
});

async function seedThreeEvents(now: number) {
  await recordGatewayEvent({
    name: "audience.gateway_send_simulated",
    commandId: "cmd_old",
    platform: "youtube",
    connectorId: "yt_channel_a",
    requestedAction: "hide_comment",
    emittedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_dispatched",
    commandId: "cmd_mid",
    platform: "facebook",
    connectorId: "fb_page_main",
    requestedAction: "delete_comment",
    status: 200,
    method: "POST",
    url: "https://api.fb.example/comments/del",
    adminId: "admin_1",
    emittedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
  });
  await recordGatewayEvent({
    name: "audience.gateway_send_blocked",
    commandId: "cmd_new",
    platform: "x",
    connectorId: "x_account_news",
    requestedAction: "ban_user",
    reason: "rate_limit_exceeded",
    emittedAt: new Date(now - 30 * 60 * 1000),
  });
}

async function latestGatewayAuditExport() {
  const [row] = await db
    .select()
    .from(audienceAuditExports)
    .where(sql`${audienceAuditExports.filters}->>'productionId' LIKE '__gateway_activity__%'`)
    .orderBy(desc(audienceAuditExports.exportedAt))
    .limit(1);
  return row ?? null;
}

test("export streams CSV with one row per event and logs the meta-audit", async () => {
  const now = Date.now();
  await seedThreeEvents(now);

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export`,
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(
    r.headers.get("content-disposition") ?? "",
    /attachment; filename="audience-gateway-events-/,
  );
  assert.equal(r.headers.get("x-audit-export"), "audience-gateway-events");
  assert.ok((r.headers.get("x-audit-export-id") ?? "").startsWith("aud_exp"));
  assert.equal(r.headers.get("x-audit-export-truncated"), "false");
  assert.equal(r.headers.get("x-audit-export-row-cap"), "100000");

  const body = await r.text();
  assert.ok(body.includes("# audience_gateway_events_export"));
  assert.ok(body.includes("# gateway_events"));
  assert.ok(body.includes("audience.gateway_send_simulated"));
  assert.ok(body.includes("audience.gateway_send_dispatched"));
  assert.ok(body.includes("audience.gateway_send_blocked"));
  assert.ok(body.includes("cmd_old"));
  assert.ok(body.includes("cmd_mid"));
  assert.ok(body.includes("cmd_new"));
  assert.ok(body.includes("rate_limit_exceeded"));

  const audit = await latestGatewayAuditExport();
  assert.ok(audit, "expected a meta-audit row");
  assert.equal(audit.format, "csv");
  assert.equal((audit.filters as any).productionId, "__gateway_activity__");
  assert.equal((audit.filters as any).fromDate, null);
  assert.equal((audit.filters as any).toDate, null);
  assert.equal(audit.messageCount, 3);
});

test("export honors from/to filters and records them on the meta-audit row", async () => {
  const now = Date.now();
  await seedThreeEvents(now);

  // Window covers only cmd_mid (2 days ago) and cmd_new (30 min ago).
  const from = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 60 * 1000).toISOString();
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes("cmd_mid"));
  assert.ok(body.includes("cmd_new"));
  assert.ok(!body.includes("cmd_old"), "cmd_old must be filtered out");

  const audit = await latestGatewayAuditExport();
  assert.ok(audit);
  assert.equal((audit.filters as any).fromDate, from);
  assert.equal((audit.filters as any).toDate, to);
  assert.equal(audit.messageCount, 2);
});

test("export honors platform filter and records it on the meta-audit row", async () => {
  const now = Date.now();
  await seedThreeEvents(now);

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?platform=facebook`,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes("cmd_mid"));
  assert.ok(!body.includes("cmd_old"));
  assert.ok(!body.includes("cmd_new"));

  const audit = await latestGatewayAuditExport();
  assert.ok(audit);
  assert.equal((audit.filters as any).platform, "facebook");
  assert.equal((audit.filters as any).productionId, "__gateway_activity__");
  assert.equal(audit.messageCount, 1);
});

test("export honors kind filter and surfaces it on the sentinel productionId", async () => {
  const now = Date.now();
  await seedThreeEvents(now);

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?kind=blocked`,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes("cmd_new"));
  assert.ok(body.includes("audience.gateway_send_blocked"));
  assert.ok(!body.includes("cmd_old"));
  assert.ok(!body.includes("cmd_mid"));

  const audit = await latestGatewayAuditExport();
  assert.ok(audit);
  assert.equal((audit.filters as any).productionId, "__gateway_activity__:kind=blocked");
  assert.equal(audit.messageCount, 1);
});

test("export rejects an invalid platform/kind value with 400", async () => {
  const r1 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?platform=myspace`,
  );
  assert.equal(r1.status, 400);
  const r2 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?kind=unknown`,
  );
  assert.equal(r2.status, 400);
});

test("export rejects from > to with 400 and writes no meta-audit row", async () => {
  const from = "2026-06-01T00:00:00.000Z";
  const to = "2026-05-01T00:00:00.000Z";
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?from=${from}&to=${to}`,
  );
  assert.equal(r.status, 400);
  assert.equal(await latestGatewayAuditExport(), null);
});

test("export rejects an unparseable from with 400", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?from=not-a-date`,
  );
  assert.equal(r.status, 400);
});

test("export honors adminId filter and surfaces it on the sentinel productionId", async () => {
  const now = Date.now();
  await seedThreeEvents(now);
  // Only cmd_mid was recorded with adminId="admin_1".
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?adminId=admin_1`,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes("cmd_mid"));
  assert.ok(body.includes("admin_1"));
  assert.ok(!body.includes("cmd_old"));
  assert.ok(!body.includes("cmd_new"));

  const audit = await latestGatewayAuditExport();
  assert.ok(audit);
  assert.equal((audit.filters as any).adminId, "admin_1");
  assert.equal(
    (audit.filters as any).productionId,
    "__gateway_activity__:admin=admin_1",
  );
  assert.equal(audit.messageCount, 1);
});

test("gateway/activity route honors adminId filter", async () => {
  const now = Date.now();
  await seedThreeEvents(now);
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity?adminId=admin_1`,
  );
  assert.equal(r.status, 200);
  const body = (await r.json()) as {
    events: any[];
    total: number;
    filters: { adminId: string | null };
  };
  assert.equal(body.total, 1);
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].payload.commandId, "cmd_mid");
  assert.equal(body.events[0].payload.adminId, "admin_1");
  assert.equal(body.filters.adminId, "admin_1");
});

test("export combines kind + adminId on the sentinel and meta-audit row", async () => {
  const now = Date.now();
  await seedThreeEvents(now);
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?kind=dispatched&adminId=admin_1`,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes("cmd_mid"));
  assert.ok(body.includes("admin_1"));
  const audit = await latestGatewayAuditExport();
  assert.ok(audit);
  assert.equal((audit.filters as any).adminId, "admin_1");
  assert.equal(
    (audit.filters as any).productionId,
    "__gateway_activity__:kind=dispatched:admin=admin_1",
  );
});

test("export honors platform + kind filters and records them in the meta-audit row", async () => {
  const now = Date.now();
  await seedThreeEvents(now);

  // platform=facebook narrows to cmd_mid only; kind=dispatched matches it.
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?platform=facebook&kind=dispatched`,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes("cmd_mid"));
  assert.ok(!body.includes("cmd_old"), "cmd_old (youtube) must be filtered out");
  assert.ok(!body.includes("cmd_new"), "cmd_new (x) must be filtered out");
  // The CSV meta row carries the filter values.
  assert.ok(body.includes("facebook"));
  assert.ok(body.includes("dispatched"));

  const audit = await latestGatewayAuditExport();
  assert.ok(audit);
  assert.equal((audit.filters as any).platform, "facebook");
  assert.equal(
    (audit.filters as any).productionId,
    "__gateway_activity__:kind=dispatched",
  );
  assert.equal(audit.messageCount, 1);
});

test("export honors connectorId filter and records it on the meta-audit row", async () => {
  const now = Date.now();
  await seedThreeEvents(now);

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?connectorId=yt_channel_a`,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes("cmd_old"));
  assert.ok(!body.includes("cmd_mid"));
  assert.ok(!body.includes("cmd_new"));
  assert.ok(body.includes("yt_channel_a"), "CSV meta row should carry connectorId");

  const audit = await latestGatewayAuditExport();
  assert.ok(audit);
  assert.equal((audit.filters as any).connectorId, "yt_channel_a");
  assert.equal(
    (audit.filters as any).productionId,
    "__gateway_activity__:connector=yt_channel_a",
  );
  assert.equal(audit.messageCount, 1);
});

test("export honors platform + connectorId + kind filters together", async () => {
  const now = Date.now();
  await seedThreeEvents(now);

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?platform=facebook&connectorId=fb_page_main&kind=dispatched`,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes("cmd_mid"));
  assert.ok(!body.includes("cmd_old"));
  assert.ok(!body.includes("cmd_new"));

  const audit = await latestGatewayAuditExport();
  assert.ok(audit);
  assert.equal((audit.filters as any).platform, "facebook");
  assert.equal((audit.filters as any).connectorId, "fb_page_main");
  assert.equal(
    (audit.filters as any).productionId,
    "__gateway_activity__:kind=dispatched:connector=fb_page_main",
  );
  assert.equal(audit.messageCount, 1);
});

test("export rejects empty connectorId with 400", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?connectorId=`,
  );
  assert.equal(r.status, 400);
});

test("export rejects an unknown platform / kind value with 400", async () => {
  const r1 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?platform=myspace`,
  );
  assert.equal(r1.status, 400);
  const r2 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/gateway/activity/export?kind=exploded`,
  );
  assert.equal(r2.status, 400);
});

test("CSV builder surfaces truncated:true + rowCap in the meta row", () => {
  const csv = buildAudienceGatewayEventsCsv({
    events: [
      {
        id: "ev_1",
        name: "audience.gateway_send_blocked",
        emittedAt: "2026-05-20T10:00:00.000Z",
        payload: {
          commandId: "cmd_1",
          platform: "youtube",
          requestedAction: "hide_comment",
          reason: "rate_limit_exceeded",
          status: null,
          method: null,
          url: null,
          adminId: null,
        },
      },
    ],
    filters: { fromDate: null, toDate: null },
    exportedAt: "2026-05-21T00:00:00.000Z",
    totalEvents: 250_000,
    truncated: true,
    rowCap: 100_000,
  });
  assert.ok(csv.includes("# audience_gateway_events_export"));
  // The meta data row carries the truncated flag and the row cap.
  assert.ok(csv.includes("250000"));
  assert.ok(csv.includes("true"));
  assert.ok(csv.includes("100000"));
  assert.ok(csv.includes("ev_1"));
  assert.ok(csv.includes("audience.gateway_send_blocked"));
});
