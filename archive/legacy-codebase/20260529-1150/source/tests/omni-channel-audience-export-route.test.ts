/**
 * Task #391 — HTTP-level test for the audience moderation audit export route.
 *
 * Boots a minimal Express app, registers the real
 * `registerOmniChannelAudienceRoutes` with a stub `requireRootAdmin`, and
 * stubs `omniChannelAudienceSafetyService.exportAuditTrail` so the route
 * handler is exercised end-to-end without a DB.
 *
 * Verifies:
 *  - 200 JSON: Content-Type application/json, Content-Disposition with
 *    audience-audit-trail-*.json filename, body includes
 *    platformSendAllowed:false and uses the hashed/redacted records.
 *  - 200 CSV: Content-Type text/csv, audience-audit-trail-*.csv filename,
 *    all four sections present, no raw PII strings (email/phone/IP/raw author id).
 *  - 400 on invalid platform, invalid date, and from > to.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { omniChannelAudienceSafetyService } from "../server/services/omni-channel-audience-safety-service";

const RAW_EMAIL = "victim@example.com";
const RAW_PHONE = "+1-415-555-0199";
const RAW_IP = "203.0.113.7";
const RAW_AUTHOR_ID = "yt_user_raw_42";

const fakeExport = {
  connectors: [
    {
      connectorId: "c_yt_1",
      platform: "youtube",
      accountId: "yt_acct",
      displayName: "YT Channel",
      connectionStatus: "connected",
      apiAccessMode: "read_only",
      permissions: { canReadComments: true },
    },
  ],
  messages: [
    {
      messageId: "msg_1",
      connectorId: "c_yt_1",
      platform: "youtube",
      externalMessageId: "ext_1",
      externalAuthorIdHash: "a".repeat(32),
      authorDisplayNameSafe: "Author",
      messageText: "hello world",
      messageType: "comment",
      receivedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
      storyId: null,
      productionId: "prod_1",
      broadcastBriefId: null,
      giftValue: null,
      rawMetadataRedacted: { email: "[REDACTED:EMAIL]", phone: "[REDACTED:PHONE]" },
    },
  ],
  decisions: [
    {
      decisionId: "dec_1",
      messageId: "msg_1",
      platform: "youtube",
      action: "allow",
      reasonCodes: [],
      scores: { toxicity: 0 },
      giftValue: null,
      allowedForRobotSpeech: true,
      allowedForAnchorSpeech: true,
      allowedForScreenDisplay: true,
      allowedForAutoReply: true,
      allowedForModerationAction: false,
      requiresHumanReview: false,
      sensitivityOverride: null,
      cAudienceSafety: 1,
    },
  ],
  commands: [
    {
      commandId: "cmd_1",
      decisionId: "dec_1",
      platform: "youtube",
      connectorId: "c_yt_1",
      externalMessageId: "ext_1",
      requestedAction: "no_action",
      requestedBy: "ai_moderator",
      commandMode: "simulation_only",
      commandAllowed: true,
      blockerReason: null,
      requiresHumanApproval: false,
      platformSendAllowed: false,
    },
  ],
  filters: {
    fromDate: null,
    toDate: null,
    platform: null,
    productionId: null,
  },
  exportedAt: new Date("2026-05-20T12:34:56.789Z").toISOString(),
};

let lastFilters: any = null;
const originalExport = (omniChannelAudienceSafetyService as any).exportAuditTrail.bind(
  omniChannelAudienceSafetyService,
);

let server: Server;
let baseUrl: string;

before(async () => {
  (omniChannelAudienceSafetyService as any).exportAuditTrail = async (filters: any) => {
    lastFilters = filters;
    return {
      ...fakeExport,
      filters: {
        fromDate: filters.fromDate ? filters.fromDate.toISOString() : null,
        toDate: filters.toDate ? filters.toDate.toISOString() : null,
        platform: filters.platform ?? null,
        productionId: filters.productionId ?? null,
      },
    };
  };

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
  (omniChannelAudienceSafetyService as any).exportAuditTrail = originalExport;
  await new Promise<void>((r) => server.close(() => r()));
});

function noRawPii(text: string) {
  assert.ok(!text.includes(RAW_EMAIL), "raw email leaked");
  assert.ok(!text.includes(RAW_PHONE), "raw phone leaked");
  assert.ok(!text.includes(RAW_IP), "raw IP leaked");
  assert.ok(!text.includes(RAW_AUTHOR_ID), "raw author id leaked");
}

test("GET /api/admin/newsroom/audience/export?format=json streams JSON with correct headers and redacted body", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/export?format=json`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /^application\/json/);
  const cd = r.headers.get("content-disposition") ?? "";
  assert.match(cd, /^attachment; filename="audience-audit-trail-.+\.json"$/);
  assert.equal(r.headers.get("x-audit-export"), "audience-moderation");

  const bodyText = await r.text();
  noRawPii(bodyText);
  const body = JSON.parse(bodyText);
  assert.equal(body.platformSendAllowed, false);
  assert.equal(body.realSendAllowed, false);
  assert.equal(body.messages[0].externalAuthorIdHash, "a".repeat(32));
  assert.equal(body.messages[0].rawMetadataRedacted.email, "[REDACTED:EMAIL]");
  assert.equal(body.commands[0].platformSendAllowed, false);
  assert.equal(body.commands[0].commandMode, "simulation_only");
  assert.ok(typeof body.notice === "string" && body.notice.includes("redacted"));
});

test("GET .../export?format=csv streams CSV with correct headers, all sections, and no PII", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/export?format=csv`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /^text\/csv/);
  const cd = r.headers.get("content-disposition") ?? "";
  assert.match(cd, /^attachment; filename="audience-audit-trail-.+\.csv"$/);
  assert.equal(r.headers.get("x-audit-export"), "audience-moderation");

  const csv = await r.text();
  noRawPii(csv);
  assert.ok(csv.includes("# audience_audit_export"));
  assert.ok(csv.includes("# connectors"));
  assert.ok(csv.includes("# messages"));
  assert.ok(csv.includes("# decisions"));
  assert.ok(csv.includes("# commands"));
  // platformSendAllowed column for the meta row is the literal "false"
  assert.ok(/false,false\r?\n/.test(csv));
  // hashed author id and redacted metadata propagate to CSV
  assert.ok(csv.includes("a".repeat(32)));
  assert.ok(csv.includes("[REDACTED:EMAIL]"));
});

test("GET .../export defaults to JSON when format is omitted", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/export`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /^application\/json/);
  assert.match(
    r.headers.get("content-disposition") ?? "",
    /audience-audit-trail-.+\.json/,
  );
});

test("GET .../export forwards filters to the service", async () => {
  lastFilters = null;
  const url =
    `${baseUrl}/api/admin/newsroom/audience/export` +
    `?format=json` +
    `&from=2026-01-01T00:00:00.000Z` +
    `&to=2026-02-01T00:00:00.000Z` +
    `&platform=youtube` +
    `&productionId=prod_1`;
  const r = await fetch(url);
  assert.equal(r.status, 200);
  assert.ok(lastFilters);
  assert.equal(lastFilters.platform, "youtube");
  assert.equal(lastFilters.productionId, "prod_1");
  assert.ok(lastFilters.fromDate instanceof Date);
  assert.ok(lastFilters.toDate instanceof Date);
  assert.equal(lastFilters.fromDate.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("GET .../export returns 400 on invalid platform", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/export?platform=myspace`,
  );
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "invalid query");
});

test("GET .../export returns 400 on invalid date format", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/export?from=not-a-date`,
  );
  assert.equal(r.status, 400);
});

test("GET .../export returns 400 when from > to", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/export` +
      `?from=2026-06-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z`,
  );
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.message, "from must be <= to");
});

test("GET .../export returns 400 on invalid format value", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/export?format=xml`,
  );
  assert.equal(r.status, 400);
});

test("alias mount /api/admin/omni-channel-audience/export also streams the export", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/omni-channel-audience/export?format=csv`,
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /^text\/csv/);
  assert.match(
    r.headers.get("content-disposition") ?? "",
    /audience-audit-trail-.+\.csv/,
  );
});

/* ------------------------------------------------------------------ *
 * Task #702 — HTTP-level proof that audit-trail downloads stop at the
 * 100,000-row cap. Stubs the service to report `truncated:true` and
 * asserts the JSON envelope, CSV meta row, and response headers all
 * carry the truncation signal end-to-end. Also exercises the
 * `/export/count` preflight and the two `/export-log/export*` routes.
 * ------------------------------------------------------------------ */

const ROW_CAP = 100_000;

const originalCountAuditTrail = (
  omniChannelAudienceSafetyService as any
).countAuditTrail.bind(omniChannelAudienceSafetyService);
const originalListAllBounded = (
  omniChannelAudienceSafetyService as any
).listAllAuditExportsBounded.bind(omniChannelAudienceSafetyService);
const originalListFilteredBounded = (
  omniChannelAudienceSafetyService as any
).listAllFilteredAuditExportsBounded.bind(omniChannelAudienceSafetyService);

function stubExportTruncated(truncated: boolean) {
  (omniChannelAudienceSafetyService as any).exportAuditTrail = async (
    filters: any,
  ) => {
    lastFilters = filters;
    return {
      ...fakeExport,
      filters: {
        fromDate: filters.fromDate ? filters.fromDate.toISOString() : null,
        toDate: filters.toDate ? filters.toDate.toISOString() : null,
        platform: filters.platform ?? null,
        productionId: filters.productionId ?? null,
      },
      truncated,
      rowCap: ROW_CAP,
    };
  };
}

function restoreExportStub() {
  (omniChannelAudienceSafetyService as any).exportAuditTrail = async (
    filters: any,
  ) => {
    lastFilters = filters;
    return {
      ...fakeExport,
      filters: {
        fromDate: filters.fromDate ? filters.fromDate.toISOString() : null,
        toDate: filters.toDate ? filters.toDate.toISOString() : null,
        platform: filters.platform ?? null,
        productionId: filters.productionId ?? null,
      },
    };
  };
}

test("Task #702: /export JSON surfaces truncated:true, rowCap, and X-Audit-Export-* headers when the cap is hit", async () => {
  stubExportTruncated(true);
  try {
    const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/export?format=json`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-audit-export-truncated"), "true");
    assert.equal(r.headers.get("x-audit-export-row-cap"), String(ROW_CAP));
    const body = await r.json();
    assert.equal(body.truncated, true);
    assert.equal(body.rowCap, ROW_CAP);
  } finally {
    restoreExportStub();
  }
});

test("Task #702: /export CSV surfaces truncated + rowCap meta columns and X-Audit-Export-* headers when the cap is hit", async () => {
  stubExportTruncated(true);
  try {
    const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/export?format=csv`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-audit-export-truncated"), "true");
    assert.equal(r.headers.get("x-audit-export-row-cap"), String(ROW_CAP));
    const csv = await r.text();
    // Meta header row contains the truncated + rowCap columns.
    assert.match(csv, /truncated/);
    assert.match(csv, /rowCap/);
    // Meta value row has truncated=true and the row-cap literal.
    assert.ok(
      csv.split(/\r?\n/).some((line) => /true/.test(line) && line.includes(String(ROW_CAP))),
      "expected a CSV row with truncated=true and the row cap",
    );
  } finally {
    restoreExportStub();
  }
});

test("Task #702: /export JSON reports truncated:false when the service says it didn't hit the cap", async () => {
  stubExportTruncated(false);
  try {
    const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/export?format=json`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-audit-export-truncated"), "false");
    assert.equal(r.headers.get("x-audit-export-row-cap"), String(ROW_CAP));
    const body = await r.json();
    assert.equal(body.truncated, false);
    assert.equal(body.rowCap, ROW_CAP);
  } finally {
    restoreExportStub();
  }
});

test("Task #702: /export/count flips wouldTruncate when any section is above the cap", async () => {
  (omniChannelAudienceSafetyService as any).countAuditTrail = async () => ({
    connectors: 3,
    messages: ROW_CAP + 1,
    decisions: 10,
    commands: 5,
    total: ROW_CAP + 19,
  });
  try {
    const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/export/count`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.rowCap, ROW_CAP);
    assert.equal(body.wouldTruncate, true);
    assert.equal(body.messages, ROW_CAP + 1);
  } finally {
    (omniChannelAudienceSafetyService as any).countAuditTrail = originalCountAuditTrail;
  }
});

test("Task #702: /export/count reports wouldTruncate:false when every section is under the cap", async () => {
  (omniChannelAudienceSafetyService as any).countAuditTrail = async () => ({
    connectors: 1,
    messages: 10,
    decisions: 10,
    commands: 10,
    total: 31,
  });
  try {
    const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/export/count`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.rowCap, ROW_CAP);
    assert.equal(body.wouldTruncate, false);
  } finally {
    (omniChannelAudienceSafetyService as any).countAuditTrail = originalCountAuditTrail;
  }
});

const fakeExportLogRow = {
  exportId: "aud_exp_1",
  actorId: "actor_1",
  actorType: "staff",
  actorRole: "root_admin",
  format: "json",
  filters: { fromDate: null, toDate: null, platform: null, productionId: null },
  rowCounts: { connectors: 0, messages: 1, decisions: 0, commands: 0 },
  totalRowCount: 1,
  riskSignals: [],
  exportedAt: new Date("2026-05-19T00:00:00.000Z").toISOString(),
};

test("Task #702: /export-log/export (JSON) surfaces truncated:true + rowCap + headers when the bounded list hits the cap", async () => {
  (omniChannelAudienceSafetyService as any).listAllAuditExportsBounded = async (
    opts: any,
  ) => {
    assert.equal(opts.limit, ROW_CAP);
    return { rows: [fakeExportLogRow], truncated: true, rowCap: ROW_CAP };
  };
  try {
    const r = await fetch(
      `${baseUrl}/api/admin/newsroom/audience/export-log/export?format=json`,
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-audit-export-truncated"), "true");
    assert.equal(r.headers.get("x-audit-export-row-cap"), String(ROW_CAP));
    const body = await r.json();
    assert.equal(body.truncated, true);
    assert.equal(body.rowCap, ROW_CAP);
  } finally {
    (omniChannelAudienceSafetyService as any).listAllAuditExportsBounded =
      originalListAllBounded;
  }
});

test("Task #702: /export-log/export (CSV) emits truncated + rowCap meta and headers when the bounded list hits the cap", async () => {
  (omniChannelAudienceSafetyService as any).listAllAuditExportsBounded = async () => ({
    rows: [fakeExportLogRow],
    truncated: true,
    rowCap: ROW_CAP,
  });
  try {
    const r = await fetch(
      `${baseUrl}/api/admin/newsroom/audience/export-log/export?format=csv`,
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-audit-export-truncated"), "true");
    assert.equal(r.headers.get("x-audit-export-row-cap"), String(ROW_CAP));
    const csv = await r.text();
    assert.match(csv, /truncated/);
    assert.match(csv, /rowCap/);
    assert.ok(
      csv.split(/\r?\n/).some((line) => /true/.test(line) && line.includes(String(ROW_CAP))),
      "expected an export-log CSV row with truncated=true and the row cap",
    );
  } finally {
    (omniChannelAudienceSafetyService as any).listAllAuditExportsBounded =
      originalListAllBounded;
  }
});

test("Task #702: /export-log/export-filtered (JSON) surfaces truncated:true + rowCap + headers when bounded filtered list hits the cap", async () => {
  (omniChannelAudienceSafetyService as any).listAllFilteredAuditExportsBounded =
    async (opts: any) => {
      assert.equal(opts.limit, ROW_CAP);
      return { rows: [fakeExportLogRow], truncated: true, rowCap: ROW_CAP };
    };
  try {
    const r = await fetch(
      `${baseUrl}/api/admin/newsroom/audience/export-log/export-filtered?format=json`,
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-audit-export-truncated"), "true");
    assert.equal(r.headers.get("x-audit-export-row-cap"), String(ROW_CAP));
    const body = await r.json();
    assert.equal(body.truncated, true);
    assert.equal(body.rowCap, ROW_CAP);
  } finally {
    (omniChannelAudienceSafetyService as any).listAllFilteredAuditExportsBounded =
      originalListFilteredBounded;
  }
});

test("Task #702: /export-log/export-filtered (CSV) emits truncated + rowCap meta and headers when bounded filtered list hits the cap", async () => {
  (omniChannelAudienceSafetyService as any).listAllFilteredAuditExportsBounded =
    async () => ({
      rows: [fakeExportLogRow],
      truncated: true,
      rowCap: ROW_CAP,
    });
  try {
    const r = await fetch(
      `${baseUrl}/api/admin/newsroom/audience/export-log/export-filtered?format=csv`,
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-audit-export-truncated"), "true");
    assert.equal(r.headers.get("x-audit-export-row-cap"), String(ROW_CAP));
    const csv = await r.text();
    assert.match(csv, /truncated/);
    assert.match(csv, /rowCap/);
    assert.ok(
      csv.split(/\r?\n/).some((line) => /true/.test(line) && line.includes(String(ROW_CAP))),
      "expected a filtered export-log CSV row with truncated=true and the row cap",
    );
  } finally {
    (omniChannelAudienceSafetyService as any).listAllFilteredAuditExportsBounded =
      originalListFilteredBounded;
  }
});
