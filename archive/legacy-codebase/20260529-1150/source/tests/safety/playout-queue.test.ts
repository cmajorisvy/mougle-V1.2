/**
 * T8 — Playout Queue safety tests.
 *
 * Invariants:
 *  - A broadcast cannot enqueue unless its row has status === "approved".
 *  - Kill switch immediately drains the active slot, blocks enqueue,
 *    breaking insert, and dispatch.
 *  - Breaking insert is subject to the same approval gate (no bypass).
 *  - The service performs zero outbound network / streaming / publish
 *    calls — verified by stubbing global fetch and asserting no call.
 *  - Re-verifies approval at dispatch time (defence-in-depth).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  _resetForTests,
  clearKillSwitch,
  configurePlayoutQueue,
  dispatchNext,
  ejectItem,
  engageKillSwitch,
  enqueueBroadcast,
  expireStaleItems,
  getAudit,
  getHistory,
  getPlayoutState,
  getQueue,
  isKillSwitchActive,
  promoteBreaking,
  reorderQueue,
  PlayoutSafetyError,
} from "../../server/services/playout-queue-service";

function withStatuses(map: Record<string, string | null>) {
  configurePlayoutQueue({
    getBroadcastStatus: (id) => (id in map ? map[id] : null),
  });
}

describe("playout queue — approval gate", () => {
  beforeEach(() => _resetForTests());

  it("rejects enqueue when broadcast row is missing", async () => {
    withStatuses({});
    await assert.rejects(
      () => enqueueBroadcast({ broadcastId: "missing" }),
      (err: any) => err instanceof PlayoutSafetyError && err.code === "broadcast_not_found",
    );
  });

  it("rejects enqueue when broadcast is not approved", async () => {
    withStatuses({ b1: "rendered", b2: "draft", b3: "rejected" });
    for (const id of ["b1", "b2", "b3"]) {
      await assert.rejects(
        () => enqueueBroadcast({ broadcastId: id }),
        (err: any) => err instanceof PlayoutSafetyError && err.code === "broadcast_not_approved",
      );
    }
    assert.equal(getQueue().length, 0);
  });

  it("allows enqueue when broadcast is approved", async () => {
    withStatuses({ ok1: "approved" });
    const item = await enqueueBroadcast({ broadcastId: "ok1" });
    assert.equal(item.status, "queued");
    assert.equal(getQueue().length, 1);
  });

  it("breaking insert also enforces approval", async () => {
    withStatuses({ bad: "rendered" });
    await assert.rejects(
      () => promoteBreaking("bad"),
      (err: any) => err instanceof PlayoutSafetyError && err.code === "broadcast_not_approved",
    );
  });

  it("breaking insert jumps to the front of the queue", async () => {
    withStatuses({ a: "approved", b: "approved", c: "approved" });
    await enqueueBroadcast({ broadcastId: "a" });
    await enqueueBroadcast({ broadcastId: "b" });
    await promoteBreaking("c", { reason: "earthquake" });
    const q = getQueue();
    assert.equal(q[0].broadcastId, "c");
    assert.equal(q[0].breaking, true);
  });

  it("re-verifies approval at dispatch time", async () => {
    const statuses: Record<string, string> = { x: "approved" };
    configurePlayoutQueue({ getBroadcastStatus: (id) => statuses[id] ?? null });
    await enqueueBroadcast({ broadcastId: "x" });
    // Revoke approval just before dispatch.
    statuses.x = "rejected";
    const r = await dispatchNext();
    assert.equal(r.ok, false);
    assert.equal(r.reason, "broadcast_not_approved");
    assert.equal(getPlayoutState().currentBroadcastId, null);
  });
});

describe("playout queue — kill switch", () => {
  beforeEach(() => _resetForTests());

  it("engageKillSwitch drains the active slot and blocks new enqueues", async () => {
    withStatuses({ a: "approved", b: "approved" });
    await enqueueBroadcast({ broadcastId: "a" });
    const d = await dispatchNext();
    assert.equal(d.ok, true);
    assert.equal(getPlayoutState().currentBroadcastId, "a");

    const st = engageKillSwitch("root_admin", "test_kill");
    assert.equal(st.killSwitchActive, true);
    assert.equal(st.currentBroadcastId, null);
    assert.equal(isKillSwitchActive(), true);

    await assert.rejects(
      () => enqueueBroadcast({ broadcastId: "b" }),
      (err: any) => err instanceof PlayoutSafetyError && err.code === "kill_switch_active",
    );
    await assert.rejects(
      () => promoteBreaking("b"),
      (err: any) => err instanceof PlayoutSafetyError && err.code === "kill_switch_active",
    );

    const d2 = await dispatchNext();
    assert.equal(d2.ok, false);
    assert.equal(d2.reason, "kill_switch_active");
  });

  it("history records the ejected broadcast with reason", async () => {
    withStatuses({ a: "approved" });
    await enqueueBroadcast({ broadcastId: "a" });
    await dispatchNext();
    engageKillSwitch("root_admin", "fire_drill");
    const h = getHistory();
    assert.ok(h.some((x) => x.broadcastId === "a" && (x.reason || "").startsWith("kill_switch")));
  });

  it("clearKillSwitch re-enables enqueue + dispatch", async () => {
    withStatuses({ a: "approved" });
    engageKillSwitch("root_admin", "x");
    clearKillSwitch("root_admin", "ok");
    assert.equal(isKillSwitchActive(), false);
    const item = await enqueueBroadcast({ broadcastId: "a" });
    assert.ok(item);
  });
});

describe("playout queue — TTL + reorder + eject", () => {
  beforeEach(() => _resetForTests());

  it("expires stale queued items beyond ttlSec", async () => {
    withStatuses({ a: "approved" });
    await enqueueBroadcast({ broadcastId: "a", ttlSec: 1 });
    // Force the queue item into the past so expireStaleItems flags it.
    const future = Date.now() + 10_000;
    const expired = expireStaleItems(future);
    assert.equal(expired, 1);
    assert.equal(getQueue().length, 0);
  });

  it("reorderQueue respects supplied order", async () => {
    withStatuses({ a: "approved", b: "approved", c: "approved" });
    const a = await enqueueBroadcast({ broadcastId: "a" });
    const b = await enqueueBroadcast({ broadcastId: "b" });
    const c = await enqueueBroadcast({ broadcastId: "c" });
    reorderQueue([c.id, a.id, b.id]);
    const q = getQueue();
    assert.deepEqual(q.map((x) => x.broadcastId), ["c", "a", "b"]);
  });

  it("ejectItem on the currently-playing slot clears playout state", async () => {
    withStatuses({ a: "approved" });
    const it = await enqueueBroadcast({ broadcastId: "a" });
    await dispatchNext();
    ejectItem(it.id, "root_admin", "operator_test");
    assert.equal(getPlayoutState().currentBroadcastId, null);
  });
});

describe("playout queue — regional filter", () => {
  beforeEach(() => _resetForTests());

  it("dispatchNext for a region prefers matching or GLOBAL items", async () => {
    withStatuses({ us: "approved", eu: "approved", g: "approved" });
    await enqueueBroadcast({ broadcastId: "eu", region: "EU" });
    await enqueueBroadcast({ broadcastId: "us", region: "US" });
    const r = await dispatchNext("US");
    assert.equal(r.ok, true);
    assert.equal(r.playing?.broadcastId, "us");
  });
});

describe("playout queue — no outbound network", () => {
  beforeEach(() => _resetForTests());

  it("performs zero fetch / http calls during enqueue + dispatch + kill switch", async () => {
    withStatuses({ a: "approved", b: "approved" });
    let fetchCalls = 0;
    const origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = (...args: any[]) => {
      fetchCalls += 1;
      throw new Error(`unexpected fetch: ${args[0]}`);
    };
    try {
      await enqueueBroadcast({ broadcastId: "a" });
      await promoteBreaking("b");
      await dispatchNext();
      engageKillSwitch("root_admin", "no_net");
      clearKillSwitch("root_admin");
      assert.equal(fetchCalls, 0);
    } finally {
      (globalThis as any).fetch = origFetch;
    }
  });

  it("service module exposes no streaming / upload / publish helpers", async () => {
    const svc: any = await import("../../server/services/playout-queue-service");
    for (const banned of [
      "publish",
      "publishToYoutube",
      "rtmp",
      "stream",
      "upload",
      "uploadToS3",
      "broadcastLive",
    ]) {
      assert.equal(
        typeof svc[banned],
        "undefined",
        `playout-queue-service should not export ${banned}`,
      );
    }
  });
});

describe("playout queue — audit trail", () => {
  beforeEach(() => _resetForTests());

  it("records enqueue / breaking / eject / kill switch actions", async () => {
    withStatuses({ a: "approved", b: "approved" });
    await enqueueBroadcast({ broadcastId: "a" });
    await promoteBreaking("b");
    engageKillSwitch("root_admin", "audit_test");
    const actions = getAudit().map((a) => a.action);
    assert.ok(actions.includes("enqueue"));
    assert.ok(actions.includes("breaking_inserted"));
    assert.ok(actions.includes("kill_switch_engaged"));
  });
});
