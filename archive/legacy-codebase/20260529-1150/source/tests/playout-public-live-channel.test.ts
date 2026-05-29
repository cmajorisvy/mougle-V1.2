import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";

import {
  registerPlayoutQueueRoutes,
  invalidateBroadcastMetaCache,
  _setBroadcastMetaLookupForTests,
} from "../server/routes/playout";
import {
  _resetForTests,
  configurePlayoutQueue,
  dispatchNext,
  enqueueBroadcast,
  engageKillSwitch,
} from "../server/services/playout-queue-service";

const PUBLIC_ALLOWED_TOP = new Set([
  "ok",
  "killSwitchActive",
  "current",
  "upNext",
  "updatedAt",
]);
const ITEM_ALLOWED_BASE = new Set([
  "broadcastId",
  "region",
  "scheduledAt",
  "breaking",
  "title",
  "thumbnailUrl",
]);
const CURRENT_ALLOWED = new Set([...ITEM_ALLOWED_BASE, "startedAt"]);

// Fields the public endpoint must NEVER expose, regardless of state.
const FORBIDDEN_KEYS = [
  "id",
  "queueItemId",
  "currentQueueItemId",
  "enqueuedBy",
  "priority",
  "ttlSec",
  "status",
  "createdAt",
  "endedAt",
  "ejectedBy",
  "ejectReason",
  "killSwitchActivatedBy",
  "killSwitchAt",
  "killSwitchReason",
  "audit",
  "events",
  "history",
  "queue",
  "all",
  "state",
];

function deepKeys(obj: unknown, acc: string[] = []): string[] {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      acc.push(k);
      if (v && typeof v === "object") deepKeys(v, acc);
    }
  }
  return acc;
}

async function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

let ctx: { server: Server; base: string };

before(async () => {
  const app = express();
  app.use(express.json());
  // Public endpoint requires NO admin auth and NO session; mount a no-op
  // requireRootAdmin so the admin routes registered alongside it would 403
  // rather than crash. The public endpoint never hits this middleware.
  const denyAdmin: express.RequestHandler = (_req, res) =>
    res.status(403).json({ message: "Forbidden" });
  registerPlayoutQueueRoutes(app, denyAdmin);
  ctx = await listen(app);
});

after(async () => {
  await new Promise<void>((r) => ctx.server.close(() => r()));
});

beforeEach(() => {
  _resetForTests();
  _setBroadcastMetaLookupForTests(null);
  configurePlayoutQueue({
    // Every broadcast is "approved" in test mode so we can seed freely.
    getBroadcastStatus: async () => "approved",
    // Mirror the production wiring so queue mutations invalidate the
    // public-endpoint TTL cache. Without this, the dispatch-boundary
    // assertion below would always pass for the wrong reason.
    onInvalidateBroadcast: (broadcastId) => {
      invalidateBroadcastMetaCache(broadcastId ? [broadcastId] : undefined);
    },
  });
});

describe("GET /api/public/live-channel — public Live Channel contract", () => {
  it("returns ONLY allow-listed fields when a broadcast is playing with several queued items", async () => {
    // Seed: 1 broadcast we will dispatch into "playing", plus 6 queued items
    // (the public endpoint caps upNext at 5, so we want >5 to prove the cap).
    await enqueueBroadcast({ broadcastId: "bcast-playing", region: "us", enqueuedBy: "alice" });
    const dispatched = await dispatchNext("GLOBAL", "scheduler");
    assert.equal(dispatched.ok, true, "dispatch should succeed");

    for (let i = 0; i < 6; i++) {
      await enqueueBroadcast({
        broadcastId: `bcast-queued-${i}`,
        region: i % 2 === 0 ? "eu" : "us",
        enqueuedBy: `actor-${i}`,
        breaking: i === 0, // a breaking one to prove `breaking` is exposed
      });
    }

    const res = await fetch(`${ctx.base}/api/public/live-channel`);
    assert.equal(res.status, 200);
    const body = await res.json();

    // Top-level keys must be exactly the allow-list.
    const topKeys = Object.keys(body);
    for (const k of topKeys) {
      assert.ok(
        PUBLIC_ALLOWED_TOP.has(k),
        `unexpected top-level key "${k}" in public live-channel response`,
      );
    }
    assert.equal(typeof body.killSwitchActive, "boolean");
    assert.equal(body.killSwitchActive, false);
    assert.ok(typeof body.updatedAt === "string" && body.updatedAt.length > 0);

    // current: shape + allow-list
    assert.ok(body.current, "expected a current item while playing");
    for (const k of Object.keys(body.current)) {
      assert.ok(
        CURRENT_ALLOWED.has(k),
        `unexpected key "${k}" on current item`,
      );
    }
    assert.equal(body.current.broadcastId, "bcast-playing");
    assert.equal(body.current.region, "US");
    assert.equal(typeof body.current.scheduledAt, "string");
    assert.equal(typeof body.current.startedAt, "string");
    assert.equal(body.current.breaking, false);

    // upNext: capped at 5, and each item only has the base allow-list.
    assert.ok(Array.isArray(body.upNext));
    assert.equal(body.upNext.length, 5, "upNext must be capped at 5");
    for (const item of body.upNext) {
      for (const k of Object.keys(item)) {
        assert.ok(
          ITEM_ALLOWED_BASE.has(k),
          `unexpected key "${k}" on upNext item`,
        );
      }
      assert.equal(typeof item.broadcastId, "string");
      assert.equal(typeof item.region, "string");
      assert.equal(typeof item.scheduledAt, "string");
      assert.equal(typeof item.breaking, "boolean");
    }

    // Defence in depth: no forbidden key may appear anywhere in the response.
    const allKeys = new Set(deepKeys(body));
    for (const forbidden of FORBIDDEN_KEYS) {
      assert.ok(
        !allKeys.has(forbidden),
        `forbidden key "${forbidden}" leaked in public response`,
      );
    }
    // And the raw body string must not contain any actor/queue-item-id hint.
    const raw = JSON.stringify(body);
    assert.ok(!/alice|actor-\d/.test(raw), "enqueuedBy actor names leaked into response");
  });

  it("returns current=null and upNext=[] when the kill switch is engaged", async () => {
    await enqueueBroadcast({ broadcastId: "bcast-playing-2", enqueuedBy: "ops" });
    const dispatched = await dispatchNext("GLOBAL", "scheduler");
    assert.equal(dispatched.ok, true);
    await enqueueBroadcast({ broadcastId: "bcast-q-a", enqueuedBy: "ops" });
    await enqueueBroadcast({ broadcastId: "bcast-q-b", enqueuedBy: "ops" });

    engageKillSwitch("root_admin", "test_kill");

    const res = await fetch(`${ctx.base}/api/public/live-channel`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.killSwitchActive, true);
    assert.equal(body.current, null);
    assert.deepEqual(body.upNext, []);

    // Even with kill switch engaged, no kill-switch metadata may leak.
    const raw = JSON.stringify(body);
    assert.ok(!/killSwitchActivatedBy|killSwitchReason|killSwitchAt|test_kill|root_admin/.test(raw));
  });

  it("never serves a stale title across a dispatch boundary (cache busts on invalidate)", async () => {
    // Backing store the spy reads from. Mutating this between polls
    // simulates a producer updating a broadcast row in the DB between
    // viewer polls — exactly the race the TTL cache must handle.
    const titles = new Map<string, string>([
      ["bcast-A", "TITLE A"],
      ["bcast-B", "OLD STALE TITLE"],
    ]);

    let lookupCalls = 0;
    const idsSeen: string[][] = [];
    _setBroadcastMetaLookupForTests(async (ids) => {
      lookupCalls += 1;
      idsSeen.push([...ids]);
      const out = new Map<string, { title: string | null; thumbnailUrl: string | null }>();
      for (const id of ids) {
        out.set(id, { title: titles.get(id) ?? null, thumbnailUrl: null });
      }
      return out;
    });

    // ── Step 1: A is playing, B is queued up next. Prime the cache so
    //          BOTH ids are warm in the TTL cache (including B's old
    //          title). This is the setup that, without invalidation,
    //          would cause the stale-title flash on the next dispatch.
    await enqueueBroadcast({ broadcastId: "bcast-A", enqueuedBy: "ops" });
    const r1 = await dispatchNext("GLOBAL", "scheduler");
    assert.equal(r1.ok, true);
    await enqueueBroadcast({ broadcastId: "bcast-B", enqueuedBy: "ops" });

    const callsBeforePoll1 = lookupCalls;
    const poll1 = await (await fetch(`${ctx.base}/api/public/live-channel`)).json();
    assert.equal(poll1.current.broadcastId, "bcast-A");
    assert.equal(poll1.current.title, "TITLE A");
    assert.equal(poll1.upNext[0].broadcastId, "bcast-B");
    assert.equal(poll1.upNext[0].title, "OLD STALE TITLE");
    assert.ok(
      lookupCalls > callsBeforePoll1,
      "first poll must hit the lookup at least once to warm the cache",
    );

    // ── Step 2: Re-poll. Both ids are cached — must be ZERO new lookups.
    const callsBeforePoll2 = lookupCalls;
    await fetch(`${ctx.base}/api/public/live-channel`);
    assert.equal(
      lookupCalls,
      callsBeforePoll2,
      "second poll must be served entirely from the TTL cache (no DB lookup)",
    );

    // ── Step 3: Producer updates B's title (e.g. headline finalised).
    //          Then dispatch B — the invalidate hook MUST bust the
    //          cached "OLD STALE TITLE" so the very next poll cannot
    //          render the stale title against the new current id.
    titles.set("bcast-B", "TITLE B");
    const r2 = await dispatchNext("GLOBAL", "scheduler");
    assert.equal(r2.ok, true);

    const callsBeforePoll3 = lookupCalls;
    const poll3 = await (await fetch(`${ctx.base}/api/public/live-channel`)).json();
    assert.equal(
      poll3.current.broadcastId,
      "bcast-B",
      "current must reflect the newly-dispatched broadcast",
    );
    assert.equal(
      poll3.current.title,
      "TITLE B",
      "title must match the new broadcast id — no stale-title flash across the boundary",
    );
    assert.notEqual(
      poll3.current.title,
      "OLD STALE TITLE",
      "the cache MUST have been invalidated; the stale pre-dispatch title leaked through",
    );

    // The boundary poll must have run a fresh lookup, and it must have
    // asked for bcast-B specifically.
    assert.ok(
      lookupCalls > callsBeforePoll3,
      "dispatch boundary must trigger a fresh lookup (cache was not invalidated)",
    );
    const lastIds = idsSeen[idsSeen.length - 1];
    assert.ok(
      lastIds.includes("bcast-B"),
      "fresh lookup after invalidation must request the new broadcast id",
    );

    // ── Step 4: Re-poll once more. The boundary poll repopulated the
    //          cache, so this poll must NOT trigger another lookup.
    const callsBeforePoll4 = lookupCalls;
    const poll4 = await (await fetch(`${ctx.base}/api/public/live-channel`)).json();
    assert.equal(poll4.current.title, "TITLE B");
    assert.equal(
      lookupCalls,
      callsBeforePoll4,
      "cache must be repopulated by the boundary poll; subsequent polls must NOT hit the lookup again",
    );
  });

  it("rejects write verbs on the public path (POST/PUT/DELETE)", async () => {
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const res = await fetch(`${ctx.base}/api/public/live-channel`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : "{}",
      });
      assert.ok(
        res.status >= 400 && res.status < 500,
        `${method} /api/public/live-channel must not succeed (got ${res.status})`,
      );
      assert.notEqual(res.status, 200, `${method} must not return 200`);
      assert.notEqual(res.status, 201, `${method} must not return 201`);
      assert.notEqual(res.status, 204, `${method} must not return 204`);
    }
  });
});
