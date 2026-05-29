/**
 * Task #144 — Real DB-backed `PlayoutPersistence` adapter round-trip test.
 *
 * Task #140 / #123 added the in-memory persistence stub tests
 * (`playout-queue-persistence.test.ts`), but the *real* adapter that the
 * server actually boots with — `dbPlayoutPersistence` — was untested.
 * If that adapter ever drifts from the `PlayoutPersistence` interface
 * (column renamed, status enum changed, JSON shape mismatch) the live
 * channel would silently fail to rehydrate after a restart while the
 * in-memory test kept passing.
 *
 * This test exercises the real adapter against the configured database:
 *   - Inserts a temporary `broadcasts` row so the FK is satisfied.
 *   - Writes a queued item, a playing item, a history row, and a
 *     kill-switch state through a test-scoped adapter instance.
 *   - Calls `load()` and asserts every field round-trips byte-for-byte.
 *   - Cleans up every row it created so the test is safe to run against
 *     a shared dev DB.
 *
 * SAFETY (task #158):
 *   - DO NOT revert this test to use the production `dbPlayoutPersistence`
 *     instance or the `SINGLETON_STATE_ID` row. The live server's
 *     playout-queue-service writes the singleton `playout_state` row on
 *     every tick; if this test snapshots and restores that row while a
 *     dev server is running, the two will trample each other (the test's
 *     restored snapshot can be overwritten by the live service moments
 *     later, or vice versa). Instead, this test constructs its own
 *     `createDbPlayoutPersistence(TEST_STATE_ROW_ID)` instance pointing
 *     at a per-test `playout_state` row id (random UUID) that the running
 *     server never touches. Queue / history rows are similarly isolated
 *     by per-test ids and cleaned up in `after()`.
 *   - No network / streaming / publishing code paths.
 *   - All inserts are tagged with a unique broadcast id; the test
 *     filters loaded rows by that id before asserting, so other rows in
 *     the DB cannot cause false positives or false negatives.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, pool } from "../../server/db";
import {
  broadcasts,
  playoutHistory,
  playoutQueue,
  playoutState,
  type BroadcastManifest,
} from "../../shared/schema";
import {
  createDbPlayoutPersistence,
} from "../../server/services/playout-persistence-db";
import type {
  PlayoutHistoryItem,
  PlayoutQueueItem,
  PlayoutState,
} from "../../server/services/playout-queue-service";

const BROADCAST_ID = `t144-${randomUUID()}`;
const QUEUED_ITEM_ID = `t144-q-${randomUUID()}`;
const PLAYING_ITEM_ID = `t144-p-${randomUUID()}`;
const HISTORY_ID = `t144-h-${randomUUID()}`;
// Per-test playout_state row id so we never touch the singleton row a
// running dev server may be actively writing. See SAFETY note above.
const TEST_STATE_ROW_ID = `t158-state-${randomUUID()}`;

const testPersistence = createDbPlayoutPersistence(TEST_STATE_ROW_ID);

function makeManifest(): BroadcastManifest {
  return {
    schemaVersion: 1,
    packageId: "t144-package",
    brollPlanId: null,
    anchorVideoUrl: null,
    mp4Filename: "t144.mp4",
    dryRun: true,
    generatedAt: new Date().toISOString(),
    generatedBy: "task-144-test",
    canvas: { width: 1920, height: 1080, fps: 30, durationSec: 10 },
    layers: [],
    headline: "task-144 round-trip",
    kicker: "test",
    confidence: { level: "low", score: 0 },
    sources: [],
    safety: {
      publicPublishing: false,
      youtubeUpload: false,
      socialPosting: false,
      externalUpload: false,
      requiresFounderApprovalForLive: true,
    },
  };
}

before(async () => {
  // Insert the broadcast row that all our queue items reference. The
  // playout_queue.broadcast_id column has an FK to broadcasts.id.
  // Use raw SQL (rather than drizzle) so this test is tolerant of
  // pending column additions on the `broadcasts` schema that may not
  // yet be reflected in every deployed DB — the only fields this test
  // needs are the ones referenced by the FK.
  await pool.query(
    `INSERT INTO broadcasts
       (id, package_id, mp4_path, manifest_path, manifest_json, status, dry_run, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
    [
      BROADCAST_ID,
      "t144-package",
      "/tmp/t144.mp4",
      "/tmp/t144.json",
      JSON.stringify(makeManifest()),
      "approved",
      true,
      "task-144-test",
    ],
  );
});

after(async () => {
  // Order matters — queue rows reference broadcasts via FK.
  await db.delete(playoutQueue).where(eq(playoutQueue.broadcastId, BROADCAST_ID));
  await db.delete(playoutHistory).where(eq(playoutHistory.broadcastId, BROADCAST_ID));
  // FK is ON DELETE CASCADE for playoutQueue→broadcasts, but we already
  // cleared queue rows by id above; deleting the broadcast is safe.
  await db.delete(broadcasts).where(eq(broadcasts.id, BROADCAST_ID));

  // Drop the per-test state row. We never touched the singleton row, so
  // there is nothing to restore there — a running dev server's live
  // state is untouched by this test.
  await db.delete(playoutState).where(eq(playoutState.id, TEST_STATE_ROW_ID));
});

describe("dbPlayoutPersistence — real adapter round-trips against the DB", () => {
  it("round-trips a queued item through upsertQueueItem + load()", async () => {
    const now = new Date();
    // Truncate to ms — Postgres `timestamp` resolves to microseconds but
    // JS Date is millisecond-precision, and the adapter converts both
    // ways via toISOString(), so the comparison only needs ms-equality.
    now.setMilliseconds(123);
    const scheduled = new Date(now.getTime() - 60_000);
    const created = new Date(now.getTime() - 120_000);

    const item: PlayoutQueueItem = {
      id: QUEUED_ITEM_ID,
      broadcastId: BROADCAST_ID,
      region: "GLOBAL",
      scheduledAt: scheduled.toISOString(),
      ttlSec: 1800,
      status: "queued",
      breaking: false,
      priority: 100,
      enqueuedBy: "task-144-test",
      createdAt: created.toISOString(),
      startedAt: null,
      endedAt: null,
      ejectedBy: null,
      ejectReason: null,
    };

    await testPersistence.upsertQueueItem(item);

    const loaded = await testPersistence.load();
    const got = loaded.queue.find((q) => q.id === QUEUED_ITEM_ID);
    assert.ok(got, "queued item should be present after upsert+load");
    assert.deepEqual(got, item);
  });

  it("round-trips a playing item with startedAt populated", async () => {
    const started = new Date();
    started.setMilliseconds(456);

    const item: PlayoutQueueItem = {
      id: PLAYING_ITEM_ID,
      broadcastId: BROADCAST_ID,
      region: "US",
      scheduledAt: new Date(started.getTime() - 30_000).toISOString(),
      ttlSec: 600,
      status: "playing",
      breaking: true,
      priority: 1,
      enqueuedBy: "task-144-test",
      createdAt: new Date(started.getTime() - 90_000).toISOString(),
      startedAt: started.toISOString(),
      endedAt: null,
      ejectedBy: null,
      ejectReason: null,
    };

    await testPersistence.upsertQueueItem(item);

    const loaded = await testPersistence.load();
    const got = loaded.queue.find((q) => q.id === PLAYING_ITEM_ID);
    assert.ok(got, "playing item should be present after upsert+load");
    assert.deepEqual(got, item);
  });

  it("upsertQueueItem updates an existing row in place", async () => {
    // Re-write the queued item with a few fields mutated; load() must
    // reflect the update (proving the onConflictDoUpdate path works).
    const baseline = (await testPersistence.load()).queue.find(
      (q) => q.id === QUEUED_ITEM_ID,
    );
    assert.ok(baseline, "queued item should exist from earlier test");

    const updated: PlayoutQueueItem = {
      ...baseline,
      status: "ejected",
      endedAt: new Date().toISOString(),
      ejectedBy: "task-144-test",
      ejectReason: "round-trip-update",
    };
    await testPersistence.upsertQueueItem(updated);

    // Direct DB read — load() filters terminal states out of the queue
    // view, so we read the row directly to confirm the update landed.
    const rows = await db
      .select()
      .from(playoutQueue)
      .where(eq(playoutQueue.id, QUEUED_ITEM_ID));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "ejected");
    assert.equal(rows[0].ejectedBy, "task-144-test");
    assert.equal(rows[0].ejectReason, "round-trip-update");

    // And load() must NOT surface the now-terminal row.
    const live = await testPersistence.load();
    assert.equal(
      live.queue.some((q) => q.id === QUEUED_ITEM_ID),
      false,
      "terminal rows must not appear in the rehydrated queue",
    );
  });

  it("round-trips a history row through insertHistory + load()", async () => {
    const played = new Date();
    played.setMilliseconds(789);
    const ended = new Date(played.getTime() + 5_000);

    const h: PlayoutHistoryItem = {
      id: HISTORY_ID,
      broadcastId: BROADCAST_ID,
      playedAt: played.toISOString(),
      endedAt: ended.toISOString(),
      durationSec: 5,
      ejectedBy: null,
      reason: null,
      region: "GLOBAL",
      breaking: false,
    };
    await testPersistence.insertHistory(h);

    const loaded = await testPersistence.load();
    const got = loaded.history.find((row) => row.id === HISTORY_ID);
    assert.ok(got, "history row should be present after insert+load");
    assert.deepEqual(got, h);
  });

  it("round-trips the singleton state row through upsertState + load()", async () => {
    const startedAt = new Date();
    startedAt.setMilliseconds(321);
    const killAt = new Date(startedAt.getTime() + 1_000);
    const updatedAt = new Date(startedAt.getTime() + 2_000);

    const stateIn: PlayoutState = {
      currentBroadcastId: BROADCAST_ID,
      currentQueueItemId: PLAYING_ITEM_ID,
      currentStartedAt: startedAt.toISOString(),
      killSwitchActive: true,
      killSwitchActivatedBy: "task-144-test",
      killSwitchAt: killAt.toISOString(),
      killSwitchReason: "round-trip",
      updatedAt: updatedAt.toISOString(),
    };
    await testPersistence.upsertState(stateIn);

    const loaded = await testPersistence.load();
    assert.deepEqual(loaded.state, stateIn);

    // Sanity: nullable fields must also round-trip as null, not undefined
    // or the empty string.
    const cleared: PlayoutState = {
      currentBroadcastId: null,
      currentQueueItemId: null,
      currentStartedAt: null,
      killSwitchActive: false,
      killSwitchActivatedBy: null,
      killSwitchAt: null,
      killSwitchReason: null,
      updatedAt: new Date(updatedAt.getTime() + 1_000).toISOString(),
    };
    await testPersistence.upsertState(cleared);
    const loaded2 = await testPersistence.load();
    assert.deepEqual(loaded2.state, cleared);
  });
});
