/**
 * T8 follow-up — Playout Queue persistence / rehydrate safety tests.
 *
 * Task #123 added a `PlayoutPersistence` adapter so the live channel
 * survives a server restart, but the existing safety suite never
 * exercised it. These tests inject an in-memory adapter, drive the
 * service through enqueue / dispatch / kill-switch, then simulate a
 * restart (`_resetForTests()` + reconfigure + `rehydratePlayoutQueue()`)
 * and assert the queue, currently-playing slot, and kill-switch state
 * all come back. Terminal items (played / expired / ejected) must
 * NOT be rehydrated into the live queue view.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  _resetForTests,
  acknowledgeRehydrateFailure,
  clearKillSwitch,
  configurePlayoutQueue,
  dispatchNext,
  ejectItem,
  engageKillSwitch,
  enqueueBroadcast,
  expireStaleItems,
  getAudit,
  getFullQueue,
  getHistory,
  getPlayoutState,
  getQueue,
  getRehydrateFailureInfo,
  isKillSwitchActive,
  rehydratePlayoutQueue,
  type PlayoutHistoryItem,
  type PlayoutPersistence,
  type PlayoutQueueItem,
  type PlayoutState,
} from "../../server/services/playout-queue-service";

/** Minimal in-memory stub of the persistence adapter. Mirrors what a
 *  real DB-backed adapter would do, but lives entirely in the test. */
function makeStore(): {
  adapter: PlayoutPersistence;
  queue: Map<string, PlayoutQueueItem>;
  history: PlayoutHistoryItem[];
  state: PlayoutState;
} {
  const queue = new Map<string, PlayoutQueueItem>();
  const history: PlayoutHistoryItem[] = [];
  const store = {
    queue,
    history,
    state: {
      currentBroadcastId: null,
      currentQueueItemId: null,
      currentStartedAt: null,
      killSwitchActive: false,
      killSwitchActivatedBy: null,
      killSwitchAt: null,
      killSwitchReason: null,
      updatedAt: new Date(0).toISOString(),
    } as PlayoutState,
    adapter: null as unknown as PlayoutPersistence,
  };
  store.adapter = {
    async upsertQueueItem(item) {
      queue.set(item.id, { ...item });
    },
    async insertHistory(h) {
      history.push({ ...h });
    },
    async upsertState(s) {
      store.state = { ...s };
    },
    async load() {
      return {
        queue: [...queue.values()].map((q) => ({ ...q })),
        history: history.map((h) => ({ ...h })),
        state: { ...store.state },
      };
    },
  };
  return store;
}

/** Allow fire-and-forget persistence writes (the service uses
 *  `void p.upsert(...).catch(...)`) to drain before we "restart". */
async function flushPersistence(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
}

/** Tear down in-memory state and reload from the (still-populated)
 *  persistence store — this is the moral equivalent of a server boot. */
async function simulateRestart(
  store: ReturnType<typeof makeStore>,
  statuses: Record<string, string>,
): Promise<ReturnType<typeof rehydratePlayoutQueue> extends Promise<infer R> ? R : never> {
  await flushPersistence();
  _resetForTests();
  configurePlayoutQueue({
    getBroadcastStatus: (id) => (id in statuses ? statuses[id] : null),
    persistence: store.adapter,
  });
  return rehydratePlayoutQueue();
}

describe("playout queue — persistence survives restart", () => {
  beforeEach(() => _resetForTests());

  it("rehydrates queued items after a restart", async () => {
    const store = makeStore();
    const statuses: Record<string, string> = { a: "approved", b: "approved" };
    configurePlayoutQueue({
      getBroadcastStatus: (id) => statuses[id] ?? null,
      persistence: store.adapter,
    });

    const a = await enqueueBroadcast({ broadcastId: "a" });
    const b = await enqueueBroadcast({ broadcastId: "b" });
    assert.equal(getQueue().length, 2);

    const summary = await simulateRestart(store, statuses);
    assert.ok(summary, "rehydrate should run when persistence is configured");
    assert.equal(summary!.queueCount, 2);

    const q = getQueue();
    assert.equal(q.length, 2);
    assert.deepEqual(
      q.map((x) => x.broadcastId).sort(),
      ["a", "b"],
    );
    const ids = q.map((x) => x.id).sort();
    assert.deepEqual(ids, [a.id, b.id].sort());
  });

  it("rehydrates the currently-playing slot after a restart", async () => {
    const store = makeStore();
    const statuses: Record<string, string> = { live: "approved" };
    configurePlayoutQueue({
      getBroadcastStatus: (id) => statuses[id] ?? null,
      persistence: store.adapter,
    });

    const item = await enqueueBroadcast({ broadcastId: "live" });
    const d = await dispatchNext();
    assert.equal(d.ok, true);
    assert.equal(getPlayoutState().currentBroadcastId, "live");

    await simulateRestart(store, statuses);

    const ps = getPlayoutState();
    assert.equal(ps.currentBroadcastId, "live");
    assert.equal(ps.currentQueueItemId, item.id);
    assert.ok(ps.currentStartedAt, "currentStartedAt must be preserved");

    // The playing item must still be visible in the live queue view.
    const live = getQueue().find((q) => q.id === item.id);
    assert.ok(live, "playing item must be present after rehydrate");
    assert.equal(live!.status, "playing");
  });

  it("rehydrates kill-switch state after a restart", async () => {
    const store = makeStore();
    const statuses: Record<string, string> = { x: "approved" };
    configurePlayoutQueue({
      getBroadcastStatus: (id) => statuses[id] ?? null,
      persistence: store.adapter,
    });

    await enqueueBroadcast({ broadcastId: "x" });
    await dispatchNext();
    engageKillSwitch("root_admin", "restart_test");
    assert.equal(isKillSwitchActive(), true);

    const summary = await simulateRestart(store, statuses);
    assert.ok(summary);
    assert.equal(summary!.killSwitchActive, true);

    assert.equal(isKillSwitchActive(), true);
    const ps = getPlayoutState();
    assert.equal(ps.killSwitchActive, true);
    assert.equal(ps.killSwitchActivatedBy, "root_admin");
    assert.equal(ps.killSwitchReason, "restart_test");
    assert.equal(ps.currentBroadcastId, null);

    // Enqueue must still be blocked post-restart while kill switch is on.
    await assert.rejects(
      () => enqueueBroadcast({ broadcastId: "x" }),
      (err: any) => err?.code === "kill_switch_active",
    );

    // Clearing the kill switch then re-engages normal flow.
    clearKillSwitch("root_admin", "all_clear");
    const item = await enqueueBroadcast({ broadcastId: "x" });
    assert.equal(item.status, "queued");
  });

  it("does NOT rehydrate terminal items into the live queue", async () => {
    const store = makeStore();
    const statuses: Record<string, string> = {
      played: "approved",
      ejected: "approved",
      expired: "approved",
      live: "approved",
    };
    configurePlayoutQueue({
      getBroadcastStatus: (id) => statuses[id] ?? null,
      persistence: store.adapter,
    });

    // played: dispatch then dispatch again to close it out.
    await enqueueBroadcast({ broadcastId: "played" });
    await dispatchNext();
    // Enqueue a second item and dispatch to push the first into "played".
    await enqueueBroadcast({ broadcastId: "live" });
    await dispatchNext();
    assert.equal(getPlayoutState().currentBroadcastId, "live");

    // ejected: enqueue then eject before it ever plays.
    const ejectMe = await enqueueBroadcast({ broadcastId: "ejected" });
    ejectItem(ejectMe.id, "root_admin", "test_eject");

    // expired: enqueue with tiny TTL and force expiry.
    await enqueueBroadcast({ broadcastId: "expired", ttlSec: 1 });
    const expiredCount = expireStaleItems(Date.now() + 10_000);
    assert.equal(expiredCount, 1);

    // Sanity: full in-memory queue has all four rows in mixed statuses.
    const beforeFull = getFullQueue();
    const beforeStatuses = beforeFull
      .map((q) => `${q.broadcastId}:${q.status}`)
      .sort();
    assert.deepEqual(beforeStatuses, [
      "ejected:ejected",
      "expired:expired",
      "live:playing",
      "played:played",
    ]);

    await simulateRestart(store, statuses);

    // The live queue view should only show queued + playing rows —
    // terminal rows (played / ejected / expired) must NOT leak in.
    const live = getQueue();
    assert.equal(live.length, 1);
    assert.equal(live[0].broadcastId, "live");
    assert.equal(live[0].status, "playing");

    // History rows for the closed-out item must survive the restart.
    const history = getHistory();
    const histIds = history.map((h) => h.broadcastId);
    assert.ok(histIds.includes("played"));

    // The full queue (including terminal rows) is also restored so the
    // admin "recent items" view keeps working, but their statuses are
    // preserved as terminal — none of them flipped back to "queued".
    const fullAfter = getFullQueue();
    for (const row of fullAfter) {
      if (row.broadcastId === "played") assert.equal(row.status, "played");
      if (row.broadcastId === "ejected") assert.equal(row.status, "ejected");
      if (row.broadcastId === "expired") assert.equal(row.status, "expired");
    }
  });
});

/** A persistence adapter whose `load()` always rejects — simulates the
 *  DB being unreachable on boot. Other methods are no-ops because the
 *  failure-banner contract is only about the load path. */
function makeFailingAdapter(errorMsg: string): PlayoutPersistence {
  return {
    async upsertQueueItem() {},
    async insertHistory() {},
    async upsertState() {},
    async load() {
      throw new Error(errorMsg);
    },
  };
}

describe("playout queue — rehydrate failure banner", () => {
  beforeEach(() => _resetForTests());

  it("populates getRehydrateFailureInfo() when load() throws, logs the audit event, and clears on acknowledge", async () => {
    const errMsg = "ECONNREFUSED: database unreachable";
    configurePlayoutQueue({
      getBroadcastStatus: () => null,
      persistence: makeFailingAdapter(errMsg),
    });

    const summary = await rehydratePlayoutQueue();
    assert.equal(summary, null, "rehydrate should return null when load() throws");

    const info = getRehydrateFailureInfo();
    assert.ok(info, "failure info must be populated after a failed boot rehydrate");
    assert.equal(info!.error, errMsg);
    assert.equal(info!.acknowledgedAt, null);
    assert.equal(info!.acknowledgedBy, null);
    assert.ok(info!.ttlSec > 0);
    assert.ok(info!.at, "failure timestamp must be set");

    // The audit trail must record the failure so operators can trace it.
    const audit = getAudit(50);
    const failureEvent = audit.find((e) => e.action === "rehydrate_failed");
    assert.ok(failureEvent, "rehydrate_failed audit event must be logged");
    assert.equal(failureEvent!.actor, "boot");
    assert.ok(
      failureEvent!.detail.includes("ECONNREFUSED"),
      "audit detail should include the underlying error message",
    );

    // Acknowledging clears the banner so it stops nagging the operator.
    const acked = acknowledgeRehydrateFailure("root_admin");
    assert.ok(acked, "acknowledge should return the previously-active info");
    assert.equal(acked!.acknowledgedBy, "root_admin");
    assert.ok(acked!.acknowledgedAt, "acknowledgedAt must be stamped");

    assert.equal(
      getRehydrateFailureInfo(),
      null,
      "failure banner must disappear once acknowledged",
    );
  });

  it("retries a transient load() failure and silently recovers without raising the banner", async () => {
    let calls = 0;
    const flakyAdapter: PlayoutPersistence = {
      async upsertQueueItem() {},
      async insertHistory() {},
      async upsertState() {},
      async load() {
        calls += 1;
        if (calls === 1) {
          throw new Error("ECONNRESET: transient blip");
        }
        return {
          queue: [],
          history: [],
          state: {
            currentBroadcastId: null,
            currentQueueItemId: null,
            currentStartedAt: null,
            killSwitchActive: false,
            killSwitchActivatedBy: null,
            killSwitchAt: null,
            killSwitchReason: null,
            updatedAt: new Date(0).toISOString(),
          },
        };
      },
    };
    configurePlayoutQueue({
      getBroadcastStatus: () => null,
      persistence: flakyAdapter,
    });

    const summary = await rehydratePlayoutQueue();
    assert.ok(summary, "rehydrate should succeed after a transient retry");
    assert.equal(calls, 2, "load() should have been retried exactly once");

    // No failure banner — the operator must not have been alerted.
    assert.equal(
      getRehydrateFailureInfo(),
      null,
      "no failure banner should appear when retry succeeds",
    );

    const audit = getAudit(50);
    assert.equal(
      audit.find((e) => e.action === "rehydrate_failed"),
      undefined,
      "no rehydrate_failed event should be recorded when retry succeeds",
    );
    const retryEvent = audit.find((e) => e.action === "rehydrate_retry");
    assert.ok(retryEvent, "the transient failure should be logged as a retry attempt");
    const successEvent = audit.find((e) => e.action === "rehydrate");
    assert.ok(successEvent, "successful rehydrate must be audited");
    assert.ok(
      successEvent!.detail.includes("attempts=2"),
      "rehydrate audit detail should record how many attempts it took",
    );
    assert.ok(
      /elapsedMs=\d+/.test(successEvent!.detail),
      "rehydrate audit detail should record total elapsed time",
    );
  });

  it("records attempt count and elapsed time in the failure audit when all retries fail", async () => {
    let calls = 0;
    const alwaysFails: PlayoutPersistence = {
      async upsertQueueItem() {},
      async insertHistory() {},
      async upsertState() {},
      async load() {
        calls += 1;
        throw new Error("db down");
      },
    };
    configurePlayoutQueue({
      getBroadcastStatus: () => null,
      persistence: alwaysFails,
    });

    const summary = await rehydratePlayoutQueue();
    assert.equal(summary, null);
    assert.ok(calls >= 3, "load() should be retried up to the bounded attempt cap");

    const audit = getAudit(50);
    const failureEvent = audit.find((e) => e.action === "rehydrate_failed");
    assert.ok(failureEvent, "rehydrate_failed must still fire when all retries fail");
    assert.ok(
      failureEvent!.detail.includes("attempts="),
      "failure audit should include attempt count",
    );
    assert.ok(
      /elapsedMs=\d+/.test(failureEvent!.detail),
      "failure audit should include elapsed time",
    );
  });

  it("hides the failure banner once the TTL has elapsed", async () => {
    configurePlayoutQueue({
      getBroadcastStatus: () => null,
      persistence: makeFailingAdapter("boom"),
    });

    await rehydratePlayoutQueue();
    const info = getRehydrateFailureInfo();
    assert.ok(info, "failure info must be populated");

    // Just inside the TTL window: still visible.
    const justInside =
      new Date(info!.at).getTime() + info!.ttlSec * 1000 - 1_000;
    assert.ok(
      getRehydrateFailureInfo(justInside),
      "banner should still be visible just before TTL expiry",
    );

    // Past the TTL window: gone.
    const wellPast =
      new Date(info!.at).getTime() + info!.ttlSec * 1000 + 1_000;
    assert.equal(
      getRehydrateFailureInfo(wellPast),
      null,
      "banner must disappear once `now` is past the TTL",
    );
  });
});
