/**
 * Real DB-backed `PlayoutPersistence` adapter.
 *
 * Extracted from `server/routes/playout.ts` so it can be exercised in
 * isolation by integration tests (task #144). The shape and behaviour
 * are unchanged — see the playout-queue-service interface for contract.
 *
 * Task #158: the adapter is now produced by a `createDbPlayoutPersistence`
 * factory that takes the `playout_state` row id to read/write. The live
 * server still uses the singleton row (`dbPlayoutPersistence`), but tests
 * can construct their own instance pointing at a unique row id so they
 * cannot perturb a running dev server's live state.
 *
 * SAFETY:
 *   - No streaming / network / publishing code paths.
 *   - Pure CRUD against `playout_queue`, `playout_history`,
 *     `playout_state` plus a small load() that filters terminal rows
 *     out of the live queue view.
 */

import { db } from "../db";
import {
  playoutQueue,
  playoutHistory,
  playoutState,
} from "../../shared/schema";
import { desc, eq } from "drizzle-orm";
import type {
  PlayoutHistoryItem,
  PlayoutPersistence,
  PlayoutQueueItem,
  PlayoutState,
} from "./playout-queue-service";

export const SINGLETON_STATE_ID = "singleton";

function toDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function rowToQueueItem(
  row: typeof playoutQueue.$inferSelect,
): PlayoutQueueItem {
  return {
    id: row.id,
    broadcastId: row.broadcastId,
    region: row.region,
    scheduledAt: row.scheduledAt.toISOString(),
    ttlSec: row.ttlSec,
    status: row.status as PlayoutQueueItem["status"],
    breaking: row.breaking,
    priority: row.priority,
    enqueuedBy: row.enqueuedBy,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    ejectedBy: row.ejectedBy ?? null,
    ejectReason: row.ejectReason ?? null,
  };
}

export function rowToHistory(
  row: typeof playoutHistory.$inferSelect,
): PlayoutHistoryItem {
  return {
    id: row.id,
    broadcastId: row.broadcastId,
    playedAt: row.playedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : row.playedAt.toISOString(),
    durationSec: row.durationSec,
    ejectedBy: row.ejectedBy ?? null,
    reason: row.reason ?? null,
    region: row.region,
    breaking: row.breaking,
  };
}

export function rowToState(
  row: typeof playoutState.$inferSelect | undefined,
): PlayoutState {
  if (!row) {
    return {
      currentBroadcastId: null,
      currentQueueItemId: null,
      currentStartedAt: null,
      killSwitchActive: false,
      killSwitchActivatedBy: null,
      killSwitchAt: null,
      killSwitchReason: null,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    currentBroadcastId: row.currentBroadcastId ?? null,
    currentQueueItemId: row.currentQueueItemId ?? null,
    currentStartedAt: row.currentStartedAt ? row.currentStartedAt.toISOString() : null,
    killSwitchActive: row.killSwitchActive,
    killSwitchActivatedBy: row.killSwitchActivatedBy ?? null,
    killSwitchAt: row.killSwitchAt ? row.killSwitchAt.toISOString() : null,
    killSwitchReason: row.killSwitchReason ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Build a `PlayoutPersistence` adapter that reads/writes the
 * `playout_state` row identified by `stateRowId`. The live server uses
 * `SINGLETON_STATE_ID`; tests should pass a unique id (e.g. a random
 * UUID) so concurrent test runs and a running dev server cannot trample
 * each other's state row.
 */
export function createDbPlayoutPersistence(
  stateRowId: string = SINGLETON_STATE_ID,
): PlayoutPersistence {
  return {
    async upsertQueueItem(item) {
      const values = {
        id: item.id,
        broadcastId: item.broadcastId,
        region: item.region,
        scheduledAt: new Date(item.scheduledAt),
        ttlSec: item.ttlSec,
        status: item.status,
        breaking: item.breaking,
        priority: item.priority,
        enqueuedBy: item.enqueuedBy,
        createdAt: new Date(item.createdAt),
        startedAt: toDate(item.startedAt),
        endedAt: toDate(item.endedAt ?? null),
        ejectedBy: item.ejectedBy ?? null,
        ejectReason: item.ejectReason ?? null,
      };
      await db
        .insert(playoutQueue)
        .values(values)
        .onConflictDoUpdate({
          target: playoutQueue.id,
          set: {
            region: values.region,
            scheduledAt: values.scheduledAt,
            ttlSec: values.ttlSec,
            status: values.status,
            breaking: values.breaking,
            priority: values.priority,
            startedAt: values.startedAt,
            endedAt: values.endedAt,
            ejectedBy: values.ejectedBy,
            ejectReason: values.ejectReason,
          },
        });
    },
    async insertHistory(h) {
      await db
        .insert(playoutHistory)
        .values({
          id: h.id,
          broadcastId: h.broadcastId,
          playedAt: new Date(h.playedAt),
          endedAt: toDate(h.endedAt),
          durationSec: h.durationSec,
          ejectedBy: h.ejectedBy,
          reason: h.reason,
          region: h.region,
          breaking: h.breaking,
        })
        .onConflictDoNothing();
    },
    async upsertState(s) {
      const values = {
        id: stateRowId,
        currentBroadcastId: s.currentBroadcastId,
        currentQueueItemId: s.currentQueueItemId,
        currentStartedAt: toDate(s.currentStartedAt),
        killSwitchActive: s.killSwitchActive,
        killSwitchActivatedBy: s.killSwitchActivatedBy,
        killSwitchAt: toDate(s.killSwitchAt),
        killSwitchReason: s.killSwitchReason,
        updatedAt: new Date(s.updatedAt),
      };
      await db
        .insert(playoutState)
        .values(values)
        .onConflictDoUpdate({
          target: playoutState.id,
          set: {
            currentBroadcastId: values.currentBroadcastId,
            currentQueueItemId: values.currentQueueItemId,
            currentStartedAt: values.currentStartedAt,
            killSwitchActive: values.killSwitchActive,
            killSwitchActivatedBy: values.killSwitchActivatedBy,
            killSwitchAt: values.killSwitchAt,
            killSwitchReason: values.killSwitchReason,
            updatedAt: values.updatedAt,
          },
        });
    },
    async load() {
      const [queueRows, historyRows, stateRows] = await Promise.all([
        db.select().from(playoutQueue),
        db
          .select()
          .from(playoutHistory)
          .orderBy(desc(playoutHistory.playedAt))
          .limit(500),
        db
          .select()
          .from(playoutState)
          .where(eq(playoutState.id, stateRowId))
          .limit(1),
      ]);
      const queue = queueRows
        .map(rowToQueueItem)
        // Only keep queue items still relevant — terminal states stay in
        // the DB for audit but do not need to be rehydrated into memory.
        .filter((q) => q.status === "queued" || q.status === "playing");
      const history = historyRows.map(rowToHistory).reverse();
      let state = rowToState(stateRows[0]);
      // If the row says something was playing but the queue item is gone
      // (e.g. it was finalised before crash), clear the active slot so we
      // don't reference a missing id.
      if (state.currentQueueItemId && !queue.some((q) => q.id === state.currentQueueItemId)) {
        state = {
          ...state,
          currentBroadcastId: null,
          currentQueueItemId: null,
          currentStartedAt: null,
          updatedAt: new Date().toISOString(),
        };
      }
      return { queue, history, state };
    },
  };
}

export const dbPlayoutPersistence: PlayoutPersistence =
  createDbPlayoutPersistence(SINGLETON_STATE_ID);
