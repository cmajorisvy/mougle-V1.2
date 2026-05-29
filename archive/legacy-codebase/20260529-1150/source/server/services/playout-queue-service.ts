/**
 * Newsroom T8 — 24/7 Playout Queue Service.
 *
 * SAFETY:
 *   - No streaming / RTMP / HLS / YouTube / social posting code paths.
 *   - No outbound network calls. Pure in-process orchestration of an
 *     ordered queue + `currentlyPlaying` slot + kill switch.
 *   - Approval is server-enforced: a broadcast may be enqueued ONLY when
 *     `broadcasts.status === "approved"`. The check is done via the
 *     injected `getBroadcastStatus()` so tests do not need a DB.
 *   - The kill switch is the ONLY way to wipe the active slot and pause
 *     dispatch. While engaged, enqueue + breaking-promote + dispatch are
 *     all blocked, regardless of mode.
 *   - All mutations record an in-memory audit event so the admin UI can
 *     trace who did what.
 *
 * PERSISTENCE (T8 follow-up — survives server restart):
 *   - State lives in process memory for hot-path reads, but every
 *     enqueue / dispatch / eject / kill-switch mutation is also
 *     written through an injected `PlayoutPersistence` adapter to
 *     `playout_queue`, `playout_history`, and `playout_state`.
 *   - Persistence is OPTIONAL — if no adapter is configured (e.g. in
 *     unit tests), the service behaves exactly as before.
 *   - Writes are fire-and-forget (errors are swallowed and audited) so
 *     a transient DB blip can never break the live channel.
 *   - On boot, `rehydratePlayoutQueue()` reloads queue + current slot +
 *     kill-switch state so a restart resumes where it left off.
 */

import { randomUUID } from "crypto";

export type PlayoutItemStatus =
  | "queued"
  | "playing"
  | "played"
  | "expired"
  | "ejected";

export interface PlayoutQueueItem {
  id: string;
  broadcastId: string;
  region: string;
  scheduledAt: string;
  ttlSec: number;
  status: PlayoutItemStatus;
  breaking: boolean;
  priority: number;
  enqueuedBy: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  ejectedBy?: string | null;
  ejectReason?: string | null;
}

export interface PlayoutHistoryItem {
  id: string;
  broadcastId: string;
  playedAt: string;
  endedAt: string;
  durationSec: number;
  ejectedBy: string | null;
  reason: string | null;
  region: string;
  breaking: boolean;
}

export interface PlayoutState {
  currentBroadcastId: string | null;
  currentQueueItemId: string | null;
  currentStartedAt: string | null;
  killSwitchActive: boolean;
  killSwitchActivatedBy: string | null;
  killSwitchAt: string | null;
  killSwitchReason: string | null;
  updatedAt: string;
}

export interface PlayoutRehydrateInfo {
  at: string;
  queueCount: number;
  historyCount: number;
  killSwitchActive: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  ttlSec: number;
}

export interface PlayoutRehydrateFailureInfo {
  at: string;
  error: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  ttlSec: number;
}

export interface PlayoutAuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  broadcastId: string | null;
  queueItemId: string | null;
  detail: string;
}

export class PlayoutSafetyError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "PlayoutSafetyError";
  }
}

/** Hook for looking up the canonical status of a broadcast row. Returning
 * `null` means "broadcast not found" — enqueue is rejected. */
export type BroadcastStatusLookup = (
  broadcastId: string,
) => Promise<string | null> | string | null;

/** Persistence adapter — optional. When supplied, every state-changing
 *  mutation is mirrored to the underlying store so the channel can be
 *  rehydrated after a restart. */
export interface PlayoutPersistence {
  upsertQueueItem(item: PlayoutQueueItem): Promise<void>;
  insertHistory(h: PlayoutHistoryItem): Promise<void>;
  upsertState(s: PlayoutState): Promise<void>;
  load(): Promise<{
    queue: PlayoutQueueItem[];
    history: PlayoutHistoryItem[];
    state: PlayoutState;
  }>;
}

/** Hook fired whenever a broadcast's queue/playout situation changes
 * (enqueue, dispatch, eject, expire, kill-switch). The route layer uses
 * this to invalidate its short-lived public-meta cache so that viewers
 * never see a stale title rendered against a freshly-dispatched broadcast.
 * If `broadcastId` is null, the consumer should invalidate ALL entries. */
export type InvalidateBroadcastHook = (broadcastId: string | null) => void;

/* ------------------------------------------------------------------ */
/* In-memory state                                                     */
/* ------------------------------------------------------------------ */

const DEFAULT_TTL_SEC = 60 * 60; // 1 hour
const MAX_AUDIT = 2000;
const MAX_HISTORY = 1000;

const BREAKING_PRIORITY = 1; // lower number = higher priority
const NORMAL_PRIORITY = 100;
const LOOP_PRIORITY = 200;

function freshPlayoutState(): PlayoutState {
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

const REHYDRATE_BANNER_TTL_SEC = (() => {
  const raw = parseInt(process.env.PLAYOUT_REHYDRATE_BANNER_TTL_SEC ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 24 * 60 * 60; // 24h default
})();

const state: {
  queue: PlayoutQueueItem[];
  history: PlayoutHistoryItem[];
  audit: PlayoutAuditEvent[];
  playout: PlayoutState;
  lastDispatchAt: string | null;
  getBroadcastStatus: BroadcastStatusLookup;
  persistence: PlayoutPersistence | null;
  onInvalidateBroadcast: InvalidateBroadcastHook;
  lastRehydrate: PlayoutRehydrateInfo | null;
  lastRehydrateFailure: PlayoutRehydrateFailureInfo | null;
  rehydrateFailureEmailSent: boolean;
} = {
  queue: [],
  history: [],
  audit: [],
  playout: freshPlayoutState(),
  lastDispatchAt: null,
  // Default lookup rejects everything until wired by the route layer or test.
  getBroadcastStatus: () => null,
  persistence: null,
  onInvalidateBroadcast: () => {},
  lastRehydrate: null,
  lastRehydrateFailure: null,
  rehydrateFailureEmailSent: false,
};

function invalidateMetaCache(broadcastId: string | null): void {
  try {
    state.onInvalidateBroadcast(broadcastId);
  } catch {
    // Invalidation hook must never break queue mutations.
  }
}

/* ------------------------------------------------------------------ */
/* Audit helper                                                        */
/* ------------------------------------------------------------------ */

function recordAudit(
  action: string,
  actor: string,
  detail: string,
  broadcastId: string | null = null,
  queueItemId: string | null = null,
): PlayoutAuditEvent {
  const ev: PlayoutAuditEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
    broadcastId,
    queueItemId,
    detail: detail.slice(0, 400),
  };
  state.audit.push(ev);
  if (state.audit.length > MAX_AUDIT) {
    state.audit.splice(0, state.audit.length - MAX_AUDIT);
  }
  return ev;
}

/* ------------------------------------------------------------------ */
/* Persistence helpers (fire-and-forget)                               */
/* ------------------------------------------------------------------ */

function persistItem(item: PlayoutQueueItem): void {
  const p = state.persistence;
  if (!p) return;
  const snapshot = { ...item };
  void p.upsertQueueItem(snapshot).catch((err) => {
    recordAudit(
      "persist_failed",
      "persistence",
      `upsertQueueItem:${String((err as Error)?.message || err).slice(0, 200)}`,
      snapshot.broadcastId,
      snapshot.id,
    );
  });
}

function persistHistory(h: PlayoutHistoryItem): void {
  const p = state.persistence;
  if (!p) return;
  const snapshot = { ...h };
  void p.insertHistory(snapshot).catch((err) => {
    recordAudit(
      "persist_failed",
      "persistence",
      `insertHistory:${String((err as Error)?.message || err).slice(0, 200)}`,
      snapshot.broadcastId,
      null,
    );
  });
}

function persistState(): void {
  const p = state.persistence;
  if (!p) return;
  const snapshot = { ...state.playout };
  void p.upsertState(snapshot).catch((err) => {
    recordAudit(
      "persist_failed",
      "persistence",
      `upsertState:${String((err as Error)?.message || err).slice(0, 200)}`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export function configurePlayoutQueue(opts: {
  getBroadcastStatus?: BroadcastStatusLookup;
  persistence?: PlayoutPersistence | null;
  onInvalidateBroadcast?: InvalidateBroadcastHook;
}): void {
  if (opts.getBroadcastStatus) {
    state.getBroadcastStatus = opts.getBroadcastStatus;
  }
  if (opts.persistence !== undefined) {
    state.persistence = opts.persistence;
  }
  if (opts.onInvalidateBroadcast) {
    state.onInvalidateBroadcast = opts.onInvalidateBroadcast;
  }
}

/** Rebuild in-memory state from the persistence layer. Called once at
 *  boot by the route layer so a server restart resumes the channel. */
/** Number of `load()` attempts before we give up and raise the failure
 *  banner. Tuned small on purpose: real outages should escalate fast,
 *  but a single transient blip (DB cold start, brief network hiccup)
 *  must not page the operator. */
const REHYDRATE_MAX_ATTEMPTS = 3;
/** Base backoff between retry attempts in ms. The Nth retry waits
 *  `BASE * 2^(N-1)` ms (so 100ms, 200ms with the default of 3 attempts). */
const REHYDRATE_RETRY_BASE_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function rehydratePlayoutQueue(): Promise<{
  queueCount: number;
  historyCount: number;
  killSwitchActive: boolean;
} | null> {
  const p = state.persistence;
  if (!p) return null;
  const startedAt = Date.now();
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= REHYDRATE_MAX_ATTEMPTS; attempt++) {
    try {
      const loaded = await p.load();
      state.queue = loaded.queue.map((q) => ({ ...q }));
      state.history = loaded.history.map((h) => ({ ...h }));
      state.playout = { ...loaded.state };
      sortQueue();
      const elapsedMs = Date.now() - startedAt;
      const ev = recordAudit(
        "rehydrate",
        "boot",
        `queue=${state.queue.length} history=${state.history.length} kill=${state.playout.killSwitchActive} attempts=${attempt} elapsedMs=${elapsedMs}`,
      );
      state.lastRehydrate = {
        at: ev.at,
        queueCount: state.queue.length,
        historyCount: state.history.length,
        killSwitchActive: state.playout.killSwitchActive,
        acknowledgedAt: null,
        acknowledgedBy: null,
        ttlSec: REHYDRATE_BANNER_TTL_SEC,
      };
      return {
        queueCount: state.queue.length,
        historyCount: state.history.length,
        killSwitchActive: state.playout.killSwitchActive,
      };
    } catch (err) {
      lastErr = err;
      if (attempt < REHYDRATE_MAX_ATTEMPTS) {
        const backoff = REHYDRATE_RETRY_BASE_MS * 2 ** (attempt - 1);
        recordAudit(
          "rehydrate_retry",
          "boot",
          `attempt=${attempt}/${REHYDRATE_MAX_ATTEMPTS} backoffMs=${backoff} err=${String((err as Error)?.message || err).slice(0, 200)}`,
        );
        await sleep(backoff);
      }
    }
  }
  const elapsedMs = Date.now() - startedAt;
  const errMsg = String((lastErr as Error)?.message || lastErr).slice(0, 400);
  const ev = recordAudit(
    "rehydrate_failed",
    "boot",
    `attempts=${REHYDRATE_MAX_ATTEMPTS} elapsedMs=${elapsedMs} err=${errMsg}`,
  );
  state.lastRehydrateFailure = {
    at: ev.at,
    error: errMsg,
    acknowledgedAt: null,
    acknowledgedBy: null,
    ttlSec: REHYDRATE_BANNER_TTL_SEC,
  };
  void notifyFounderOfRehydrateFailure(errMsg, ev.at);
  return null;
}

/** Fire-and-forget founder alert email for a `rehydrate_failed` event.
 *  Throttled to a single email per process lifetime so a crash-loop
 *  cannot spam the inbox. Records an audit entry for both the send and
 *  the suppressed case so operators can trace what happened. */
async function notifyFounderOfRehydrateFailure(
  errMsg: string,
  failedAt: string,
): Promise<void> {
  if (state.rehydrateFailureEmailSent) {
    recordAudit(
      "rehydrate_failure_email_suppressed",
      "boot",
      `already_sent_this_boot at=${failedAt}`,
    );
    return;
  }
  state.rehydrateFailureEmailSent = true;
  const founderEmail = (
    process.env.FOUNDER_ALERT_EMAIL ||
    process.env.FOUNDER_EMAIL ||
    ""
  ).trim();
  if (!founderEmail) {
    recordAudit(
      "rehydrate_failure_email_suppressed",
      "boot",
      "no_founder_email_configured",
    );
    return;
  }
  try {
    const { emailService } = await import("./email-service");
    // `sendAdminAlert` currently swallows internal Resend errors and
    // resolves to `undefined` on failure, so we treat a missing/error
    // result as a failed delivery to keep the audit trustworthy.
    const result = (await emailService.sendAdminAlert(founderEmail, {
      title: "Playout queue failed to recover on boot",
      severity: "critical",
      message:
        `The 24/7 playout queue could not be rehydrated from the database after a server boot at ${failedAt}. ` +
        `Live dispatch is paused until an admin acknowledges the failure banner in the Playout Queue panel.\n\n` +
        `Error: ${errMsg}`,
    })) as { error?: unknown } | undefined;
    if (!result || (result as { error?: unknown }).error) {
      recordAudit(
        "rehydrate_failure_email_failed",
        "boot",
        `to=${founderEmail} resend_swallowed_or_errored`,
      );
      return;
    }
    recordAudit(
      "rehydrate_failure_email_sent",
      "boot",
      `to=${founderEmail} at=${failedAt}`,
    );
  } catch (mailErr) {
    recordAudit(
      "rehydrate_failure_email_failed",
      "boot",
      `to=${founderEmail} err=${String((mailErr as Error)?.message || mailErr).slice(0, 200)}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Queue ordering                                                      */
/* ------------------------------------------------------------------ */

function sortQueue(): void {
  state.queue.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

export interface EnqueueInput {
  broadcastId: string;
  region?: string;
  ttlSec?: number;
  breaking?: boolean;
  scheduledAt?: string;
  enqueuedBy?: string;
}

export async function enqueueBroadcast(
  input: EnqueueInput,
): Promise<PlayoutQueueItem> {
  if (state.playout.killSwitchActive) {
    throw new PlayoutSafetyError(
      "kill_switch_active",
      "Kill switch is engaged; new playout items cannot be enqueued.",
    );
  }
  const status = await Promise.resolve(state.getBroadcastStatus(input.broadcastId));
  if (status == null) {
    throw new PlayoutSafetyError(
      "broadcast_not_found",
      `Broadcast ${input.broadcastId} does not exist.`,
    );
  }
  if (status !== "approved") {
    throw new PlayoutSafetyError(
      "broadcast_not_approved",
      `Broadcast ${input.broadcastId} has status="${status}", required "approved".`,
    );
  }
  const now = new Date().toISOString();
  const item: PlayoutQueueItem = {
    id: randomUUID(),
    broadcastId: input.broadcastId,
    region: (input.region || "GLOBAL").toUpperCase().slice(0, 32),
    scheduledAt: input.scheduledAt || now,
    ttlSec: Math.max(1, Math.min(input.ttlSec ?? DEFAULT_TTL_SEC, 24 * 60 * 60)),
    status: "queued",
    breaking: !!input.breaking,
    priority: input.breaking ? BREAKING_PRIORITY : NORMAL_PRIORITY,
    enqueuedBy: input.enqueuedBy || "root_admin",
    createdAt: now,
    startedAt: null,
    endedAt: null,
    ejectedBy: null,
    ejectReason: null,
  };
  state.queue.push(item);
  sortQueue();
  recordAudit(
    "enqueue",
    item.enqueuedBy,
    `region=${item.region} breaking=${item.breaking} ttlSec=${item.ttlSec}`,
    item.broadcastId,
    item.id,
  );
  persistItem(item);
  invalidateMetaCache(item.broadcastId);
  return { ...item };
}

/** Insert a breaking-news item AT THE FRONT. Same approval gate applies. */
export async function promoteBreaking(
  broadcastId: string,
  opts: { actor?: string; region?: string; ttlSec?: number; reason?: string } = {},
): Promise<PlayoutQueueItem> {
  const item = await enqueueBroadcast({
    broadcastId,
    region: opts.region,
    ttlSec: opts.ttlSec,
    breaking: true,
    enqueuedBy: opts.actor || "root_admin",
  });
  recordAudit(
    "breaking_inserted",
    opts.actor || "root_admin",
    opts.reason || "breaking_news",
    broadcastId,
    item.id,
  );
  return item;
}

/* ------------------------------------------------------------------ */
/* Reorder + eject                                                     */
/* ------------------------------------------------------------------ */

export function reorderQueue(
  orderedIds: string[],
  actor = "root_admin",
): PlayoutQueueItem[] {
  const byId = new Map(state.queue.filter((q) => q.status === "queued").map((q) => [q.id, q]));
  const reordered: PlayoutQueueItem[] = [];
  let priority = NORMAL_PRIORITY;
  for (const id of orderedIds) {
    const it = byId.get(id);
    if (!it) continue;
    it.priority = priority++;
    reordered.push(it);
    byId.delete(id);
  }
  // Any queued items the client did not include keep their existing
  // priority but get pushed after the reordered tail.
  for (const remaining of byId.values()) {
    remaining.priority = priority++;
    reordered.push(remaining);
  }
  // Re-attach any non-queued items (playing / played etc.) untouched.
  const others = state.queue.filter((q) => q.status !== "queued");
  state.queue = [...reordered, ...others];
  sortQueue();
  recordAudit("reorder_queue", actor, `count=${orderedIds.length}`);
  for (const it of reordered) persistItem(it);
  invalidateMetaCache(null);
  return getQueue();
}

export function ejectItem(
  queueItemId: string,
  actor = "root_admin",
  reason = "manual_eject",
): PlayoutQueueItem | null {
  const it = state.queue.find((q) => q.id === queueItemId);
  if (!it) return null;
  const wasPlaying = it.status === "playing";
  it.status = "ejected";
  it.endedAt = new Date().toISOString();
  it.ejectedBy = actor;
  it.ejectReason = reason;
  if (wasPlaying) {
    state.playout.currentBroadcastId = null;
    state.playout.currentQueueItemId = null;
    state.playout.currentStartedAt = null;
    state.playout.updatedAt = new Date().toISOString();
    const h: PlayoutHistoryItem = {
      id: randomUUID(),
      broadcastId: it.broadcastId,
      playedAt: it.startedAt || it.createdAt,
      endedAt: it.endedAt,
      durationSec: it.startedAt
        ? Math.max(0, Math.floor((Date.parse(it.endedAt) - Date.parse(it.startedAt)) / 1000))
        : 0,
      ejectedBy: actor,
      reason,
      region: it.region,
      breaking: it.breaking,
    };
    state.history.push(h);
    if (state.history.length > MAX_HISTORY) {
      state.history.splice(0, state.history.length - MAX_HISTORY);
    }
    persistHistory(h);
    persistState();
  }
  recordAudit("eject", actor, reason, it.broadcastId, it.id);
  persistItem(it);
  invalidateMetaCache(it.broadcastId);
  return { ...it };
}

/* ------------------------------------------------------------------ */
/* TTL expiry                                                          */
/* ------------------------------------------------------------------ */

export function expireStaleItems(now: number = Date.now()): number {
  let expired = 0;
  for (const it of state.queue) {
    if (it.status !== "queued") continue;
    const ageSec = Math.floor((now - Date.parse(it.scheduledAt)) / 1000);
    if (ageSec > it.ttlSec) {
      it.status = "expired";
      it.endedAt = new Date(now).toISOString();
      recordAudit("expire", "scheduler", `ageSec=${ageSec} ttlSec=${it.ttlSec}`, it.broadcastId, it.id);
      persistItem(it);
      invalidateMetaCache(it.broadcastId);
      expired += 1;
    }
  }
  return expired;
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

/** Pull the next queued item matching the requested region (or GLOBAL). */
function pickNext(region: string): PlayoutQueueItem | null {
  const r = region.toUpperCase();
  for (const it of state.queue) {
    if (it.status !== "queued") continue;
    if (it.region === r || it.region === "GLOBAL" || r === "GLOBAL") {
      return it;
    }
  }
  return null;
}

export interface DispatchResult {
  ok: boolean;
  reason?: string;
  state: PlayoutState;
  playing: PlayoutQueueItem | null;
}

/** Move the next queued item into the active slot.
 *  Closes the currently-playing item to history when present. */
export async function dispatchNext(
  region = "GLOBAL",
  actor = "scheduler",
): Promise<DispatchResult> {
  if (state.playout.killSwitchActive) {
    return { ok: false, reason: "kill_switch_active", state: getPlayoutState(), playing: null };
  }
  expireStaleItems();

  // Close out any currently-playing item.
  if (state.playout.currentQueueItemId) {
    const cur = state.queue.find((q) => q.id === state.playout.currentQueueItemId);
    if (cur && cur.status === "playing") {
      invalidateMetaCache(cur.broadcastId);
      cur.status = "played";
      cur.endedAt = new Date().toISOString();
      const h: PlayoutHistoryItem = {
        id: randomUUID(),
        broadcastId: cur.broadcastId,
        playedAt: cur.startedAt || cur.createdAt,
        endedAt: cur.endedAt,
        durationSec: cur.startedAt
          ? Math.max(0, Math.floor((Date.parse(cur.endedAt) - Date.parse(cur.startedAt)) / 1000))
          : 0,
        ejectedBy: null,
        reason: null,
        region: cur.region,
        breaking: cur.breaking,
      };
      state.history.push(h);
      if (state.history.length > MAX_HISTORY) {
        state.history.splice(0, state.history.length - MAX_HISTORY);
      }
      persistItem(cur);
      persistHistory(h);
    }
  }

  const next = pickNext(region);
  if (!next) {
    // Loop the latest played item if available (looping latest content).
    const last = [...state.history].reverse().find((h) => !h.ejectedBy);
    if (last) {
      // Re-verify approval before looping back.
      const status = await Promise.resolve(state.getBroadcastStatus(last.broadcastId));
      if (status === "approved") {
        const now = new Date().toISOString();
        const loopItem: PlayoutQueueItem = {
          id: randomUUID(),
          broadcastId: last.broadcastId,
          region: last.region,
          scheduledAt: now,
          ttlSec: DEFAULT_TTL_SEC,
          status: "playing",
          breaking: false,
          priority: LOOP_PRIORITY,
          enqueuedBy: "loop",
          createdAt: now,
          startedAt: now,
          endedAt: null,
          ejectedBy: null,
          ejectReason: null,
        };
        state.queue.push(loopItem);
        state.playout.currentBroadcastId = loopItem.broadcastId;
        state.playout.currentQueueItemId = loopItem.id;
        state.playout.currentStartedAt = now;
        state.playout.updatedAt = now;
        state.lastDispatchAt = now;
        recordAudit("loop_dispatch", actor, "looped_latest", loopItem.broadcastId, loopItem.id);
        persistItem(loopItem);
        persistState();
        invalidateMetaCache(loopItem.broadcastId);
        return { ok: true, state: getPlayoutState(), playing: { ...loopItem } };
      }
    }
    state.playout.currentBroadcastId = null;
    state.playout.currentQueueItemId = null;
    state.playout.currentStartedAt = null;
    state.playout.updatedAt = new Date().toISOString();
    persistState();
    return { ok: false, reason: "queue_empty", state: getPlayoutState(), playing: null };
  }

  // Re-verify approval at dispatch time — defence-in-depth.
  const status = await Promise.resolve(state.getBroadcastStatus(next.broadcastId));
  if (status !== "approved") {
    next.status = "ejected";
    next.endedAt = new Date().toISOString();
    next.ejectedBy = "scheduler";
    next.ejectReason = `not_approved_at_dispatch:${status}`;
    recordAudit(
      "dispatch_blocked",
      actor,
      `not_approved:${status}`,
      next.broadcastId,
      next.id,
    );
    persistItem(next);
    return { ok: false, reason: "broadcast_not_approved", state: getPlayoutState(), playing: null };
  }

  const now = new Date().toISOString();
  next.status = "playing";
  next.startedAt = now;
  state.playout.currentBroadcastId = next.broadcastId;
  state.playout.currentQueueItemId = next.id;
  state.playout.currentStartedAt = now;
  state.playout.updatedAt = now;
  state.lastDispatchAt = now;
  recordAudit(
    next.breaking ? "dispatch_breaking" : "dispatch",
    actor,
    `region=${next.region}`,
    next.broadcastId,
    next.id,
  );
  persistItem(next);
  persistState();
  invalidateMetaCache(next.broadcastId);
  return { ok: true, state: getPlayoutState(), playing: { ...next } };
}

/* ------------------------------------------------------------------ */
/* Kill switch                                                         */
/* ------------------------------------------------------------------ */

export function engageKillSwitch(actor: string, reason: string): PlayoutState {
  state.playout.killSwitchActive = true;
  state.playout.killSwitchActivatedBy = actor;
  state.playout.killSwitchAt = new Date().toISOString();
  state.playout.killSwitchReason = reason.slice(0, 400);

  // Drain the active slot.
  if (state.playout.currentQueueItemId) {
    const cur = state.queue.find((q) => q.id === state.playout.currentQueueItemId);
    if (cur && cur.status === "playing") {
      invalidateMetaCache(cur.broadcastId);
      cur.status = "ejected";
      cur.endedAt = new Date().toISOString();
      cur.ejectedBy = actor;
      cur.ejectReason = `kill_switch:${reason}`;
      const h: PlayoutHistoryItem = {
        id: randomUUID(),
        broadcastId: cur.broadcastId,
        playedAt: cur.startedAt || cur.createdAt,
        endedAt: cur.endedAt,
        durationSec: cur.startedAt
          ? Math.max(0, Math.floor((Date.parse(cur.endedAt) - Date.parse(cur.startedAt)) / 1000))
          : 0,
        ejectedBy: actor,
        reason: `kill_switch:${reason}`,
        region: cur.region,
        breaking: cur.breaking,
      };
      state.history.push(h);
      persistItem(cur);
      persistHistory(h);
    }
  }
  state.playout.currentBroadcastId = null;
  state.playout.currentQueueItemId = null;
  state.playout.currentStartedAt = null;
  state.playout.updatedAt = new Date().toISOString();
  recordAudit("kill_switch_engaged", actor, reason);
  persistState();
  return getPlayoutState();
}

export function clearKillSwitch(actor: string, reason = "cleared"): PlayoutState {
  state.playout.killSwitchActive = false;
  state.playout.killSwitchActivatedBy = null;
  state.playout.killSwitchAt = null;
  state.playout.killSwitchReason = null;
  state.playout.updatedAt = new Date().toISOString();
  recordAudit("kill_switch_cleared", actor, reason);
  persistState();
  return getPlayoutState();
}

/* ------------------------------------------------------------------ */
/* Read accessors                                                      */
/* ------------------------------------------------------------------ */

export function getQueue(): PlayoutQueueItem[] {
  return state.queue
    .filter((q) => q.status === "queued" || q.status === "playing")
    .map((q) => ({ ...q }));
}

export function getFullQueue(): PlayoutQueueItem[] {
  return state.queue.map((q) => ({ ...q }));
}

export function getHistory(limit = 50): PlayoutHistoryItem[] {
  return state.history.slice(-limit).map((h) => ({ ...h }));
}

export function getAudit(limit = 100): PlayoutAuditEvent[] {
  return state.audit.slice(-limit).map((a) => ({ ...a }));
}

export function getPlayoutState(): PlayoutState {
  return { ...state.playout };
}

/** Returns rehydrate banner info if a rehydrate happened recently and
 *  hasn't been acknowledged or expired by TTL. Otherwise null. */
export function getRehydrateInfo(now: number = Date.now()): PlayoutRehydrateInfo | null {
  const info = state.lastRehydrate;
  if (!info) return null;
  if (info.acknowledgedAt) return null;
  const ageSec = (now - new Date(info.at).getTime()) / 1000;
  if (ageSec > info.ttlSec) return null;
  return { ...info };
}

export function acknowledgeRehydrate(actor: string): PlayoutRehydrateInfo | null {
  const info = state.lastRehydrate;
  if (!info || info.acknowledgedAt) return info ? { ...info } : null;
  info.acknowledgedAt = new Date().toISOString();
  info.acknowledgedBy = actor;
  recordAudit("rehydrate_acknowledged", actor, `at=${info.at} queue=${info.queueCount}`);
  return { ...info };
}

/** Returns rehydrate failure banner info if the most recent boot's
 *  rehydrate threw and it hasn't been acknowledged or expired by TTL. */
export function getRehydrateFailureInfo(
  now: number = Date.now(),
): PlayoutRehydrateFailureInfo | null {
  const info = state.lastRehydrateFailure;
  if (!info) return null;
  if (info.acknowledgedAt) return null;
  const ageSec = (now - new Date(info.at).getTime()) / 1000;
  if (ageSec > info.ttlSec) return null;
  return { ...info };
}

export function acknowledgeRehydrateFailure(
  actor: string,
): PlayoutRehydrateFailureInfo | null {
  const info = state.lastRehydrateFailure;
  if (!info || info.acknowledgedAt) return info ? { ...info } : null;
  info.acknowledgedAt = new Date().toISOString();
  info.acknowledgedBy = actor;
  recordAudit("rehydrate_failure_acknowledged", actor, `at=${info.at}`);
  return { ...info };
}

export function isKillSwitchActive(): boolean {
  return state.playout.killSwitchActive;
}

/* ------------------------------------------------------------------ */
/* Test helper                                                         */
/* ------------------------------------------------------------------ */

export function _resetForTests(): void {
  state.queue = [];
  state.history = [];
  state.audit = [];
  state.playout = freshPlayoutState();
  state.lastDispatchAt = null;
  state.getBroadcastStatus = () => null;
  state.persistence = null;
  state.onInvalidateBroadcast = () => {};
  state.lastRehydrate = null;
  state.lastRehydrateFailure = null;
  state.rehydrateFailureEmailSent = false;
}
