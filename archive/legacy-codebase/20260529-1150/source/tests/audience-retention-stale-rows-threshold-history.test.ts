/**
 * Task #556 — tests for the stale-rows alert threshold change history.
 * Covers: record-on-save (prior/new/by/at), clear records a transition
 * to null, the GET /history route returns newest-first capped at the
 * requested limit, and `pruneStaleRowsThresholdHistoryOlderThan` removes
 * old rows.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { eq } from "drizzle-orm";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import { db } from "../server/db";
import { systemSettings } from "@shared/schema";
import { audienceStaleRowsThresholdHistory } from "../shared/omni-channel-audience-schema";
import {
  AUDIENCE_RETENTION_STALE_ROWS_THRESHOLD_SETTING_KEY,
  getAllStaleRowsThresholdHistory,
  getStaleRowsThresholdHistory,
  pruneStaleRowsThresholdHistoryOlderThan,
  setStaleRowsThresholdOverride,
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
  await db.delete(audienceStaleRowsThresholdHistory);
});

test("setStaleRowsThresholdOverride records prior/new/by on every save", async () => {
  await setStaleRowsThresholdOverride({ messages: 500 }, "alice");
  await setStaleRowsThresholdOverride(
    { messages: 250, decisions: 1000 },
    "bob",
  );

  const history = await getStaleRowsThresholdHistory(10);
  assert.equal(history.length, 2);
  // Newest first.
  assert.equal(history[0].updatedBy, "bob");
  assert.deepEqual(history[0].priorOverride, { messages: 500 });
  assert.deepEqual(history[0].newOverride, {
    messages: 250,
    decisions: 1000,
  });
  assert.equal(history[1].updatedBy, "alice");
  assert.equal(history[1].priorOverride, null);
  assert.deepEqual(history[1].newOverride, { messages: 500 });
});

test("clearing the override records a transition to null", async () => {
  await setStaleRowsThresholdOverride({ messages: 250 }, "alice");
  await setStaleRowsThresholdOverride(null, "alice");

  const history = await getStaleRowsThresholdHistory(10);
  assert.equal(history.length, 2);
  assert.equal(history[0].newOverride, null);
  assert.deepEqual(history[0].priorOverride, { messages: 250 });
});

test("GET /stale-rows-thresholds/history returns newest-first entries with limit", async () => {
  for (let i = 0; i < 5; i++) {
    await setStaleRowsThresholdOverride({ messages: 100 + i }, `actor-${i}`);
  }

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history?limit=3`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.entries.length, 3);
  assert.equal(body.entries[0].updatedBy, "actor-4");
  assert.equal(body.entries[1].updatedBy, "actor-3");
  assert.equal(body.entries[2].updatedBy, "actor-2");
});

test("GET /stale-rows-thresholds/history defaults to a 10-row window", async () => {
  for (let i = 0; i < 12; i++) {
    await setStaleRowsThresholdOverride({ messages: 200 + i }, `actor-${i}`);
  }
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.entries.length, 10);
  assert.equal(body.entries[0].updatedBy, "actor-11");
});

test("getStaleRowsThresholdHistory filters by updatedBy", async () => {
  await setStaleRowsThresholdOverride({ messages: 100 }, "alice");
  await setStaleRowsThresholdOverride({ messages: 200 }, "bob");
  await setStaleRowsThresholdOverride({ messages: 300 }, "alice");

  const onlyAlice = await getStaleRowsThresholdHistory(10, {
    updatedBy: "alice",
  });
  assert.equal(onlyAlice.length, 2);
  assert(onlyAlice.every((e) => e.updatedBy === "alice"));

  const onlyBob = await getStaleRowsThresholdHistory(10, { updatedBy: "bob" });
  assert.equal(onlyBob.length, 1);
  assert.equal(onlyBob[0].updatedBy, "bob");

  // Empty / whitespace string is treated as no filter.
  const all = await getStaleRowsThresholdHistory(10, { updatedBy: "   " });
  assert.equal(all.length, 3);
});

test("getStaleRowsThresholdHistory filters by date range", async () => {
  await setStaleRowsThresholdOverride({ messages: 100 }, "alice");
  // Push the first row's occurredAt back in time so we have a stable boundary.
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db.update(audienceStaleRowsThresholdHistory).set({ occurredAt: past });
  await setStaleRowsThresholdOverride({ messages: 200 }, "bob");

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await getStaleRowsThresholdHistory(10, { fromDate: cutoff });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].updatedBy, "bob");

  const old = await getStaleRowsThresholdHistory(10, { toDate: cutoff });
  assert.equal(old.length, 1);
  assert.equal(old[0].updatedBy, "alice");

  // Invalid dates are ignored (returns the full list).
  const ignored = await getStaleRowsThresholdHistory(10, {
    fromDate: "not a date",
    toDate: "",
  });
  assert.equal(ignored.length, 2);
});

test("GET /stale-rows-thresholds/history honors updatedBy/from/to query params", async () => {
  await setStaleRowsThresholdOverride({ messages: 100 }, "alice");
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db.update(audienceStaleRowsThresholdHistory).set({ occurredAt: past });
  await setStaleRowsThresholdOverride({ messages: 200 }, "bob");
  await setStaleRowsThresholdOverride({ messages: 300 }, "alice");

  const byActor = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history?updatedBy=alice`,
  );
  assert.equal(byActor.status, 200);
  const actorBody = await byActor.json();
  assert.equal(actorBody.entries.length, 2);
  assert(
    actorBody.entries.every((e: any) => e.updatedBy === "alice"),
    "actor filter should only return alice rows",
  );

  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const byDate = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history?from=${encodeURIComponent(cutoffIso)}`,
  );
  assert.equal(byDate.status, 200);
  const dateBody = await byDate.json();
  assert.equal(dateBody.entries.length, 2);
  assert(
    dateBody.entries.every((e: any) => new Date(e.occurredAt) >= new Date(cutoffIso)),
    "from filter should drop rows older than cutoff",
  );

  const combined = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history?updatedBy=alice&from=${encodeURIComponent(cutoffIso)}`,
  );
  assert.equal(combined.status, 200);
  const combinedBody = await combined.json();
  assert.equal(combinedBody.entries.length, 1);
  assert.equal(combinedBody.entries[0].updatedBy, "alice");
});

test("getAllStaleRowsThresholdHistory returns every row newest-first (unbounded)", async () => {
  for (let i = 0; i < 25; i++) {
    await setStaleRowsThresholdOverride({ messages: 100 + i }, `actor-${i}`);
  }
  const all = await getAllStaleRowsThresholdHistory();
  assert.equal(all.length, 25);
  assert.equal(all[0].updatedBy, "actor-24");
  assert.equal(all[all.length - 1].updatedBy, "actor-0");
});

test("GET /stale-rows-thresholds/history.csv streams the full history as CSV", async () => {
  await setStaleRowsThresholdOverride({ messages: 500 }, "alice");
  await setStaleRowsThresholdOverride(
    { messages: 250, decisions: 1000 },
    'bob "the builder"',
  );
  await setStaleRowsThresholdOverride(null, "carol");

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history.csv`,
  );
  assert.equal(r.status, 200);
  assert.match(
    r.headers.get("content-type") ?? "",
    /text\/csv/,
  );
  assert.match(
    r.headers.get("content-disposition") ?? "",
    /attachment; filename="stale-rows-thresholds-history-.*\.csv"/,
  );
  assert.equal(
    r.headers.get("x-audit-export"),
    "audience-stale-rows-threshold-history",
  );

  const body = await r.text();
  const lines = body.trim().split(/\r\n/);
  assert.equal(lines[0], "occurredAt,updatedBy,priorOverride,newOverride");
  // Header + 3 data rows.
  assert.equal(lines.length, 4);
  // Newest first: carol's clear is first.
  assert.match(lines[1], /,carol,/);
  assert.match(
    lines[1],
    /"\{""messages"":250,""decisions"":1000\}",/,
  );
  // Quoted-with-escaped-quotes actor name survives the round trip.
  assert.match(lines[2], /"bob ""the builder"""/);
  // Alice's row (oldest) is last and has an empty prior override.
  assert.match(lines[3], /,alice,,"\{""messages"":500\}"/);
});

test("GET /history.csv honors the updatedBy filter", async () => {
  await setStaleRowsThresholdOverride({ messages: 100 }, "alice");
  await setStaleRowsThresholdOverride({ messages: 200 }, "bob");
  await setStaleRowsThresholdOverride({ messages: 300 }, "alice");

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history.csv?updatedBy=alice`,
  );
  assert.equal(r.status, 200);
  const lines = (await r.text()).trim().split(/\r\n/);
  // Header + 2 alice rows only (bob filtered out).
  assert.equal(lines.length, 3);
  assert.match(lines[1], /,alice,/);
  assert.match(lines[2], /,alice,/);
});

test("GET /history.csv treats whitespace updatedBy as no actor filter", async () => {
  await setStaleRowsThresholdOverride({ messages: 100 }, "alice");
  await setStaleRowsThresholdOverride({ messages: 200 }, "bob");

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history.csv?updatedBy=${encodeURIComponent("   ")}`,
  );
  const lines = (await r.text()).trim().split(/\r\n/);
  assert.equal(lines.length, 3);
});

test("GET /history.csv honors from/to filters", async () => {
  await setStaleRowsThresholdOverride({ messages: 100 }, "alice");
  // Backdate the alice row so a from-filter excludes it.
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db
    .update(audienceStaleRowsThresholdHistory)
    .set({ occurredAt: past });
  await setStaleRowsThresholdOverride({ messages: 200 }, "bob");

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rFrom = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history.csv?from=${encodeURIComponent(cutoff)}`,
  );
  const linesFrom = (await rFrom.text()).trim().split(/\r\n/);
  assert.equal(linesFrom.length, 2, "from-filter should drop the old alice row");
  assert.match(linesFrom[1], /,bob,/);

  // to-filter keeps only the old alice row.
  const rTo = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history.csv?to=${encodeURIComponent(cutoff)}`,
  );
  const linesTo = (await rTo.text()).trim().split(/\r\n/);
  assert.equal(linesTo.length, 2, "to-filter should drop the new bob row");
  assert.match(linesTo[1], /,alice,/);
});

test("GET /history.csv honors combined updatedBy + from + to", async () => {
  await setStaleRowsThresholdOverride({ messages: 100 }, "alice");
  await setStaleRowsThresholdOverride({ messages: 200 }, "bob");
  await setStaleRowsThresholdOverride({ messages: 300 }, "alice");

  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history.csv?updatedBy=alice&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  const lines = (await r.text()).trim().split(/\r\n/);
  // Header + 2 alice rows (bob filtered out by actor, window covers all).
  assert.equal(lines.length, 3);
  assert.match(lines[1], /,alice,/);
  assert.match(lines[2], /,alice,/);
});

test("GET /history.csv ignores invalid from/to and returns all rows", async () => {
  await setStaleRowsThresholdOverride({ messages: 100 }, "alice");
  await setStaleRowsThresholdOverride({ messages: 200 }, "bob");

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/stale-rows-thresholds/history.csv?from=not-a-date&to=also-bogus`,
  );
  assert.equal(r.status, 200);
  const lines = (await r.text()).trim().split(/\r\n/);
  // Header + both rows survive.
  assert.equal(lines.length, 3);
});

test("pruneStaleRowsThresholdHistoryOlderThan drops rows older than cutoff", async () => {
  await setStaleRowsThresholdOverride({ messages: 250 }, "alice");
  // Force the row's occurredAt back in time so the prune sees it as old.
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  await db
    .update(audienceStaleRowsThresholdHistory)
    .set({ occurredAt: past });
  await setStaleRowsThresholdOverride({ messages: 500 }, "bob");

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pruned = await pruneStaleRowsThresholdHistoryOlderThan(cutoff);
  assert.equal(pruned, 1);

  const remaining = await getStaleRowsThresholdHistory(10);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].updatedBy, "bob");
});
