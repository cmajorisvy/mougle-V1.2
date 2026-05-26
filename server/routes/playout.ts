/**
 * Newsroom T8 — Playout queue admin routes.
 *
 * SAFETY:
 *   - Every route requires root admin (`requireRootAdmin`).
 *   - CSRF enforced globally on `/api/*` in server/index.ts.
 *   - No streaming / publish / external upload code paths.
 *   - Enqueue rejects any broadcast whose row is not status="approved".
 *   - Kill switch is the single switch that drains the active slot and
 *     blocks future enqueue + dispatch until cleared by root admin.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  broadcasts,
  brollPlans,
  brollClips,
} from "../../shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
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
  PlayoutSafetyError,
  promoteBreaking,
  rehydratePlayoutQueue,
  reorderQueue,
  getRehydrateInfo,
  acknowledgeRehydrate,
  getRehydrateFailureInfo,
  acknowledgeRehydrateFailure,
} from "../services/playout-queue-service";
import { dbPlayoutPersistence } from "../services/playout-persistence-db";

const EnqueueBodySchema = z.object({
  broadcastId: z.string().min(1).max(120),
  region: z.string().max(32).optional(),
  ttlSec: z.number().int().min(1).max(24 * 60 * 60).optional(),
  breaking: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional(),
});

const BreakingBodySchema = z.object({
  broadcastId: z.string().min(1).max(120),
  region: z.string().max(32).optional(),
  ttlSec: z.number().int().min(1).max(24 * 60 * 60).optional(),
  reason: z.string().max(400).optional(),
});

const ReorderBodySchema = z.object({
  orderedIds: z.array(z.string().min(1).max(120)).max(500),
});

const KillSwitchBodySchema = z.object({
  reason: z.string().max(400).optional(),
});

const DispatchBodySchema = z.object({
  region: z.string().max(32).optional(),
});

const EjectBodySchema = z.object({
  reason: z.string().max(400).optional(),
});

let configured = false;
let rehydratePromise: Promise<unknown> | null = null;
function ensureConfigured() {
  if (configured) return;
  configurePlayoutQueue({
    getBroadcastStatus: async (broadcastId) => {
      try {
        const rows = await db
          .select({ status: broadcasts.status })
          .from(broadcasts)
          .where(eq(broadcasts.id, broadcastId))
          .limit(1);
        return rows[0]?.status ?? null;
      } catch {
        return null;
      }
    },
    persistence: dbPlayoutPersistence,
    onInvalidateBroadcast: (broadcastId) => {
      invalidateBroadcastMetaCache(broadcastId ? [broadcastId] : undefined);
    },
  });
  configured = true;
  // Rehydrate state from the DB so a server restart resumes where it
  // left off. Errors are swallowed inside rehydratePlayoutQueue and
  // logged to the audit trail.
  rehydratePromise = rehydratePlayoutQueue().catch(() => null);
}

// In-process TTL cache for the public Live Channel enrichment lookups.
// The public /api/public/live-channel endpoint is polled every ~5s by many
// viewers; without this, each poll runs 3 separate DB queries (broadcasts,
// brollPlans, brollClips). The cache is intentionally tiny, in-process,
// and cleared on every queue mutation so transitions don't briefly render
// the old title against the new broadcast id.
interface CachedMeta {
  meta: BroadcastPublicMeta;
  expiresAt: number;
}
const META_TTL_MS = 45 * 1000;
const META_CACHE_MAX = 500;
const broadcastMetaCache = new Map<string, CachedMeta>();

export function invalidateBroadcastMetaCache(ids?: string[]): void {
  if (!ids || ids.length === 0) {
    broadcastMetaCache.clear();
    return;
  }
  for (const id of ids) broadcastMetaCache.delete(id);
}

// The "lookup" is the DB-touching half of loadBroadcastMeta. It is split
// out so tests can inject a spy that counts how many times the public
// endpoint actually hit the database (vs. served the cache). The default
// lookup is the real DB query defined below as defaultBroadcastMetaLookup.
export type BroadcastMetaLookup = (
  ids: string[],
) => Promise<Map<string, BroadcastPublicMeta>>;

let broadcastMetaLookup: BroadcastMetaLookup | null = null;

export function _setBroadcastMetaLookupForTests(
  fn: BroadcastMetaLookup | null,
): void {
  broadcastMetaLookup = fn;
  // Always start tests with an empty cache so the next poll is a true
  // miss and the spy is guaranteed to be invoked.
  broadcastMetaCache.clear();
}

export function registerPlayoutQueueRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  ensureConfigured();

  // Public Live Channel read-only endpoint.
  // Returns ONLY the viewer-safe subset: current broadcastId/region/scheduledAt/breaking,
  // an "up next" preview, and the kill-switch boolean. Never exposes audit log,
  // enqueuedBy, internal priorities, history, or the queue item IDs. No write
  // surface — admin orchestration endpoints remain behind requireRootAdmin.
  app.get("/api/public/live-channel", async (_req, res) => {
    expireStaleItems();
    const playout = getPlayoutState();
    const killSwitchActive = !!playout.killSwitchActive;
    const queue = getQueue();

    const currentItem = playout.currentQueueItemId
      ? queue.find((q) => q.id === playout.currentQueueItemId && q.status === "playing")
      : null;

    const upNextItems = killSwitchActive
      ? []
      : queue.filter((q) => q.status === "queued").slice(0, 5);

    const broadcastIds = Array.from(
      new Set(
        [
          ...(currentItem && !killSwitchActive ? [currentItem.broadcastId] : []),
          ...upNextItems.map((q) => q.broadcastId),
        ].filter(Boolean),
      ),
    );

    const meta = await loadBroadcastMeta(broadcastIds);

    const current = !killSwitchActive && currentItem
      ? {
          broadcastId: currentItem.broadcastId,
          title: meta.get(currentItem.broadcastId)?.title ?? null,
          thumbnailUrl: meta.get(currentItem.broadcastId)?.thumbnailUrl ?? null,
          region: currentItem.region,
          scheduledAt: currentItem.scheduledAt,
          breaking: !!currentItem.breaking,
          startedAt: playout.currentStartedAt,
        }
      : null;

    const upNext = upNextItems.map((q) => ({
      broadcastId: q.broadcastId,
      title: meta.get(q.broadcastId)?.title ?? null,
      thumbnailUrl: meta.get(q.broadcastId)?.thumbnailUrl ?? null,
      region: q.region,
      scheduledAt: q.scheduledAt,
      breaking: !!q.breaking,
    }));

    res.json({
      ok: true,
      killSwitchActive,
      current,
      upNext,
      updatedAt: playout.updatedAt,
    });
  });

  app.get("/api/admin/playout/state", requireRootAdmin, (_req, res) => {
    expireStaleItems();
    res.json({
      ok: true,
      state: getPlayoutState(),
      queue: getQueue(),
      history: getHistory(50),
      rehydrate: getRehydrateInfo(),
      rehydrateFailure: getRehydrateFailureInfo(),
    });
  });

  app.post(
    "/api/admin/playout/rehydrate/acknowledge",
    requireRootAdmin,
    (req, res) => {
      const info = acknowledgeRehydrate(actorFromReq(req));
      res.json({ ok: true, rehydrate: info });
    },
  );

  app.post(
    "/api/admin/playout/rehydrate-failure/acknowledge",
    requireRootAdmin,
    (req, res) => {
      const info = acknowledgeRehydrateFailure(actorFromReq(req));
      res.json({ ok: true, rehydrateFailure: info });
    },
  );

  app.get("/api/admin/playout/audit", requireRootAdmin, (req, res) => {
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500));
    res.json({ ok: true, events: getAudit(limit) });
  });

  app.get("/api/admin/playout/queue", requireRootAdmin, (_req, res) => {
    expireStaleItems();
    res.json({ ok: true, queue: getQueue(), all: getFullQueue() });
  });

  app.post("/api/admin/playout/enqueue", requireRootAdmin, async (req, res) => {
    const parsed = EnqueueBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    try {
      const item = await enqueueBroadcast({
        ...parsed.data,
        enqueuedBy: actorFromReq(req),
      });
      return res.json({ ok: true, item, state: getPlayoutState() });
    } catch (err) {
      return safetyError(res, err);
    }
  });

  app.post("/api/admin/playout/breaking", requireRootAdmin, async (req, res) => {
    const parsed = BreakingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    try {
      const item = await promoteBreaking(parsed.data.broadcastId, {
        actor: actorFromReq(req),
        region: parsed.data.region,
        ttlSec: parsed.data.ttlSec,
        reason: parsed.data.reason,
      });
      return res.json({ ok: true, item, state: getPlayoutState() });
    } catch (err) {
      return safetyError(res, err);
    }
  });

  app.post("/api/admin/playout/reorder", requireRootAdmin, (req, res) => {
    const parsed = ReorderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const queue = reorderQueue(parsed.data.orderedIds, actorFromReq(req));
    return res.json({ ok: true, queue });
  });

  app.post("/api/admin/playout/eject/:id", requireRootAdmin, (req, res) => {
    const parsed = EjectBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const it = ejectItem(String(req.params.id || ""), actorFromReq(req), parsed.data.reason || "manual_eject");
    if (!it) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, item: it, state: getPlayoutState() });
  });

  app.post("/api/admin/playout/dispatch", requireRootAdmin, async (req, res) => {
    const parsed = DispatchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const region = typeof parsed.data.region === "string" ? parsed.data.region : "GLOBAL";
    const r = await dispatchNext(region || "GLOBAL", actorFromReq(req));
    return res.status(r.ok ? 200 : 409).json(r);
  });

  app.post("/api/admin/playout/kill-switch", requireRootAdmin, (req, res) => {
    const parsed = KillSwitchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const st = engageKillSwitch(actorFromReq(req), parsed.data.reason || "engaged via admin route");
    return res.json({ ok: true, state: st });
  });

  app.post("/api/admin/playout/kill-switch/clear", requireRootAdmin, (req, res) => {
    const parsed = KillSwitchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const st = clearKillSwitch(actorFromReq(req), parsed.data.reason || "cleared via admin route");
    return res.json({ ok: true, state: st });
  });
}

interface BroadcastPublicMeta {
  title: string | null;
  thumbnailUrl: string | null;
}

async function loadBroadcastMeta(
  ids: string[],
): Promise<Map<string, BroadcastPublicMeta>> {
  const out = new Map<string, BroadcastPublicMeta>();
  if (ids.length === 0) return out;

  const now = Date.now();
  const missing: string[] = [];
  for (const id of ids) {
    const hit = broadcastMetaCache.get(id);
    if (hit && hit.expiresAt > now) {
      out.set(id, { ...hit.meta });
    } else {
      if (hit) broadcastMetaCache.delete(id);
      missing.push(id);
    }
  }
  if (missing.length === 0) return out;

  let fetched: Map<string, BroadcastPublicMeta>;
  try {
    fetched = await (broadcastMetaLookup ?? defaultBroadcastMetaLookup)(missing);
  } catch {
    // On any DB error, fall back to whatever we have (possibly empty); the
    // public endpoint must never 500 just because enrichment failed. We
    // intentionally do NOT cache failed lookups so the next poll retries.
    return out;
  }
  for (const [k, v] of fetched) out.set(k, { ...v });

  // Cache every id we attempted to load (including ones the lookup returned
  // no row for — represented as a null meta — so we don't re-query missing
  // rows every 5 seconds).
  const expiresAt = now + META_TTL_MS;
  for (const id of missing) {
    const meta = out.get(id) ?? { title: null, thumbnailUrl: null };
    broadcastMetaCache.set(id, { meta: { ...meta }, expiresAt });
  }
  if (broadcastMetaCache.size > META_CACHE_MAX) {
    const overflow = broadcastMetaCache.size - META_CACHE_MAX;
    let i = 0;
    for (const key of broadcastMetaCache.keys()) {
      if (i++ >= overflow) break;
      broadcastMetaCache.delete(key);
    }
  }
  return out;
}

const defaultBroadcastMetaLookup: BroadcastMetaLookup = async (missing) => {
  const out = new Map<string, BroadcastPublicMeta>();
  if (missing.length === 0) return out;

  const rows = await db
    .select({
      id: broadcasts.id,
      brollPlanId: broadcasts.brollPlanId,
      manifestJson: broadcasts.manifestJson,
      title: broadcasts.title,
      coverImageUrl: broadcasts.coverImageUrl,
    })
    .from(broadcasts)
    .where(inArray(broadcasts.id, missing));

  const planIdToBroadcastIds = new Map<string, string[]>();
  for (const r of rows) {
    const explicitTitle =
      typeof r.title === "string" && r.title.trim()
        ? r.title.trim().slice(0, 200)
        : null;
    const headline =
      typeof r.manifestJson?.headline === "string" && r.manifestJson.headline.trim()
        ? r.manifestJson.headline.trim().slice(0, 200)
        : null;
    const explicitCover =
      typeof r.coverImageUrl === "string" && r.coverImageUrl.trim()
        ? r.coverImageUrl.trim()
        : null;
    out.set(r.id, {
      title: explicitTitle ?? headline,
      thumbnailUrl: explicitCover,
    });
    // Only fall back to b-roll thumbnail when no explicit cover image was set.
    if (!explicitCover && r.brollPlanId) {
      const arr = planIdToBroadcastIds.get(r.brollPlanId) ?? [];
      arr.push(r.id);
      planIdToBroadcastIds.set(r.brollPlanId, arr);
    }
  }

  const planIds = Array.from(planIdToBroadcastIds.keys());
  if (planIds.length === 0) return out;

  const planRows = await db
    .select({ id: brollPlans.id, beats: brollPlans.beats })
    .from(brollPlans)
    .where(inArray(brollPlans.id, planIds));

  const clipIdToPlanIds = new Map<string, string[]>();
  for (const p of planRows) {
    const firstClipId = Array.isArray(p.beats)
      ? p.beats.find((b) => b && typeof b.clipId === "string" && b.clipId)?.clipId
      : null;
    if (firstClipId) {
      const arr = clipIdToPlanIds.get(firstClipId) ?? [];
      arr.push(p.id);
      clipIdToPlanIds.set(firstClipId, arr);
    }
  }

  const clipIds = Array.from(clipIdToPlanIds.keys());
  if (clipIds.length === 0) return out;

  const clipRows = await db
    .select({ id: brollClips.id, thumbnailUrl: brollClips.thumbnailUrl })
    .from(brollClips)
    .where(inArray(brollClips.id, clipIds));

  for (const c of clipRows) {
    const thumb = typeof c.thumbnailUrl === "string" && c.thumbnailUrl.trim()
      ? c.thumbnailUrl.trim()
      : null;
    if (!thumb) continue;
    const owningPlans = clipIdToPlanIds.get(c.id) ?? [];
    for (const planId of owningPlans) {
      const bIds = planIdToBroadcastIds.get(planId) ?? [];
      for (const bId of bIds) {
        const existing = out.get(bId);
        if (existing && !existing.thumbnailUrl) {
          existing.thumbnailUrl = thumb;
        }
      }
    }
  }

  return out;
};

function actorFromReq(req: any): string {
  return (
    req.session?.adminActorId ||
    req.session?.adminRole ||
    "root_admin"
  );
}

function safetyError(res: any, err: unknown) {
  if (err instanceof PlayoutSafetyError) {
    const status = err.code === "kill_switch_active" ? 423 : 409;
    return res.status(status).json({ ok: false, error: err.code, message: err.message });
  }
  return res.status(500).json({ ok: false, error: "internal", message: String((err as Error)?.message || err) });
}
