/**
 * Newsroom T4 — Legal B-Roll Resolver core.
 *
 * Orchestrates the tier order and produces a BRollPlan with per-beat clip
 * assignments. Every accepted clip is run through `assertLicensed` from the
 * safety harness and the copyrighted-source blocklist.
 *
 * Tier order (enforced; no skipping):
 *   1. paid_licensed         (licensed paid stock — adapter slot, no live
 *                             provider yet; returns empty in DRY_RUN so the
 *                             resolver advances)
 *   2. public_domain         (Wikimedia / NASA / archive.org class)
 *   3. pexels                (free-license stock)
 *   4. pixabay               (free-license stock)
 *   5. mapbox                (map/satellite fly-in — only if beat has location)
 *   6. runway                (AI-generated)
 *   7. remotion_motion       (always-succeeds motion-graphic fallback)
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { brollClips, brollPlans, type BrollClip, type BrollPlan } from "@shared/schema";
import { assertLicensed, SafetyGateError } from "../../safety";
import type { LicenseStatus, LicenseTier, MediaLicense } from "../../../shared/safety-types";
import {
  type BrollBeat,
  type BrollCandidate,
  type BrollSource,
  type BRollResolverConfig,
  type ResolvedBeat,
  BROLL_TIER_ORDER,
  BrollAdapterRefusedError,
  resolveBrollConfig,
} from "./types";
import { blocklistMatch } from "./blocklist";
import { canSpend as costCanSpend } from "../cost-control-service";

// Cost-bearing sources gated by T10. `public_domain` and `remotion_motion`
// never hit a paid API so they bypass the gate. `mapbox` is included
// because Mapbox tile requests bill per call once live.
const COST_BEARING_BROLL: ReadonlySet<BrollSource> = new Set([
  "paid_licensed",
  "pexels",
  "pixabay",
  "mapbox",
  "runway",
]);
import * as paidLicensed from "./adapters/paid-licensed";
import * as publicDomain from "./adapters/public-domain";
import * as pexels from "./adapters/pexels";
import * as pixabay from "./adapters/pixabay";
import * as mapbox from "./adapters/mapbox";
import * as runway from "./adapters/runway";
import * as remotionMotion from "./adapters/remotion-motion";

type AdapterFn = (
  query: string,
  config: BRollResolverConfig,
  opts?: { lat?: number; lon?: number; zoom?: number },
) => Promise<BrollCandidate[]>;

const DEFAULT_ADAPTERS: Record<BrollSource, AdapterFn> = {
  paid_licensed: (q, c) => paidLicensed.search(q, c),
  public_domain: (q, c) => publicDomain.search(q, c),
  pexels: (q, c) => pexels.search(q, c),
  pixabay: (q, c) => pixabay.search(q, c),
  mapbox: (q, c, opts) => mapbox.search(q, c, opts),
  runway: (q, c) => runway.search(q, c),
  remotion_motion: (q, c) => remotionMotion.search(q, c),
};

const VALID_LICENSE_STATUSES: ReadonlySet<LicenseStatus> = new Set([
  "licensed",
  "unlicensed",
  "pending_review",
  "expired",
  "revoked",
]);
const VALID_LICENSE_TIERS: ReadonlySet<LicenseTier> = new Set([
  "owned",
  "stock_paid",
  "creative_commons",
  "fair_use_claim",
  "unknown",
]);

function toMediaLicense(c: BrollCandidate): MediaLicense {
  return {
    mediaId: `${c.source}:${c.externalId}`,
    status: c.licenseStatus,
    tier: c.licenseTier,
    source: c.source,
    attribution: c.attribution,
    licenseUrl: c.rightsUrl,
  };
}

/**
 * Hard adapter-layer validation. Even if an adapter claims a candidate is
 * licensed, the resolver re-checks the metadata shape, runs the blocklist,
 * and invokes the safety harness. Any failure removes the candidate.
 */
function validateCandidate(
  c: BrollCandidate,
): { ok: true } | { ok: false; reason: string } {
  if (!c.licenseStatus || !VALID_LICENSE_STATUSES.has(c.licenseStatus)) {
    return { ok: false, reason: "missing_or_invalid_license_status" };
  }
  if (!c.licenseTier || !VALID_LICENSE_TIERS.has(c.licenseTier)) {
    return { ok: false, reason: "missing_or_invalid_license_tier" };
  }
  if (!c.attribution || !c.attribution.trim()) {
    return { ok: false, reason: "missing_attribution" };
  }
  if (!c.url || !c.url.trim()) {
    return { ok: false, reason: "missing_url" };
  }
  const blocked = blocklistMatch(c.url);
  if (blocked) {
    return { ok: false, reason: `blocklisted_domain:${blocked}` };
  }
  try {
    assertLicensed(toMediaLicense(c));
  } catch (err) {
    if (err instanceof SafetyGateError) {
      return { ok: false, reason: `safety_gate:${err.gateId}` };
    }
    return { ok: false, reason: "safety_check_threw" };
  }
  return { ok: true };
}

async function upsertCachedClip(
  c: BrollCandidate,
  query: string,
): Promise<BrollClip> {
  const existing = await db
    .select()
    .from(brollClips)
    .where(and(eq(brollClips.source, c.source), eq(brollClips.externalId, c.externalId)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(brollClips)
    .values({
      source: c.source,
      externalId: c.externalId,
      query,
      url: c.url,
      thumbnailUrl: c.thumbnailUrl ?? null,
      licenseStatus: c.licenseStatus,
      licenseTier: c.licenseTier,
      attribution: c.attribution,
      rightsUrl: c.rightsUrl ?? null,
      durationSec: c.durationSec ?? 0,
      width: c.width ?? null,
      height: c.height ?? null,
      metadata: c.metadata ?? {},
    })
    .returning();
  return row;
}

/**
 * Build a deterministic cache key that includes geo coordinates for
 * location-sensitive sources (mapbox). Without this, two beats with the
 * same `query` but different coordinates would share a cached clip and
 * the second beat would render the wrong location.
 */
function cacheKeyForQuery(
  source: BrollSource,
  query: string,
  location?: BrollBeat["location"],
): string {
  if (source === "mapbox" && location && typeof location.lat === "number" && typeof location.lon === "number") {
    const zoom = typeof location.zoom === "number" ? location.zoom : 8;
    return `${query}::geo:${location.lat.toFixed(4)},${location.lon.toFixed(4)},${zoom}`;
  }
  return query;
}

async function loadCachedCandidate(
  source: BrollSource,
  query: string,
): Promise<BrollClip | null> {
  const rows = await db
    .select()
    .from(brollClips)
    .where(and(eq(brollClips.source, source), eq(brollClips.query, query)))
    .orderBy(desc(brollClips.indexedAt))
    .limit(1);
  return rows[0] ?? null;
}

function clipToResolved(
  beat: BrollBeat,
  clip: BrollClip,
  tierTried: BrollSource[],
  rejected: ResolvedBeat["rejected"],
): ResolvedBeat {
  return {
    beatId: beat.beatId,
    query: beat.query,
    durationSec: beat.durationSec,
    clipId: clip.id,
    source: clip.source as BrollSource,
    licenseStatus: clip.licenseStatus as LicenseStatus,
    licenseTier: clip.licenseTier as LicenseTier,
    attribution: clip.attribution,
    rightsUrl: clip.rightsUrl,
    url: clip.url,
    tierTried,
    rejected,
  };
}

export interface ResolveOptions {
  config?: BRollResolverConfig;
  /** Optional logger sink — used by tests to assert tier order in logs. */
  log?: (line: string) => void;
  /** When true, skip the DB cache (always re-query adapters). */
  bypassCache?: boolean;
  /** Optional list of DB-backed candidates to use instead of live db lookups (for tests). */
  cacheGetter?: (source: BrollSource, query: string) => Promise<BrollClip | null>;
  /** Optional insert function override (for tests). */
  cacheUpsert?: (c: BrollCandidate, query: string) => Promise<BrollClip>;
  /** Optional per-source adapter overrides (for tests). */
  adapters?: Partial<Record<BrollSource, AdapterFn>>;
  /** Brief id, used by the T10 cost gate. When set, paid adapters are gated. */
  briefId?: string;
  /** Skip cost gating entirely (used by safety tests). */
  bypassCostGate?: boolean;
  /** Per-tier estimated USD cost for cost gating. */
  estCostUsdPerCall?: number;
}

/**
 * Resolve a sequence of beats into a BRollPlan.
 *
 * Tier order is strictly enforced. For each beat we walk
 * `BROLL_TIER_ORDER`, ask each adapter for candidates, validate every one
 * against the blocklist and license harness, and accept the first that
 * passes. The motion-graphic fallback always succeeds, so a beat will
 * never come back without a clip unless the entire pipeline errors.
 */
export async function resolveForBeats(
  beats: BrollBeat[],
  opts: ResolveOptions = {},
): Promise<{
  beats: ResolvedBeat[];
  totalDurationSec: number;
}> {
  const config = opts.config ?? resolveBrollConfig();
  const log = opts.log ?? ((line) => console.log(`[broll-resolver] ${line}`));
  const cacheGetter = opts.cacheGetter ?? loadCachedCandidate;
  const cacheUpsert = opts.cacheUpsert ?? upsertCachedClip;
  const adapters: Record<BrollSource, AdapterFn> = { ...DEFAULT_ADAPTERS, ...(opts.adapters ?? {}) };

  log(`config dryRun=${config.dryRun} founderLiveOptIn=${config.founderLiveOptIn}`);

  const resolved: ResolvedBeat[] = [];
  let total = 0;

  for (const beat of beats) {
    const tierTried: BrollSource[] = [];
    const rejected: ResolvedBeat["rejected"] = [];
    let placed: ResolvedBeat | null = null;

    for (const source of BROLL_TIER_ORDER) {
      tierTried.push(source);

      // Skip mapbox if the beat carries no location.
      if (source === "mapbox" && !beat.location) {
        rejected.push({ source, reason: "no_location_on_beat" });
        log(`beat=${beat.beatId} tier=${source} skipped:no_location`);
        continue;
      }

      // Try cache first — use a location-aware key for geo-sensitive sources
      // so two beats with the same query but different coordinates do not
      // share a cached clip.
      const cacheKey = cacheKeyForQuery(source, beat.query, beat.location);
      if (!opts.bypassCache) {
        const cached = await cacheGetter(source, cacheKey);
        if (cached) {
          const c: BrollCandidate = {
            source: cached.source as BrollSource,
            externalId: cached.externalId,
            url: cached.url,
            thumbnailUrl: cached.thumbnailUrl ?? undefined,
            licenseStatus: cached.licenseStatus as LicenseStatus,
            licenseTier: cached.licenseTier as LicenseTier,
            attribution: cached.attribution,
            rightsUrl: cached.rightsUrl ?? undefined,
            durationSec: cached.durationSec,
            width: cached.width ?? undefined,
            height: cached.height ?? undefined,
            metadata: cached.metadata,
          };
          const v = validateCandidate(c);
          if (v.ok) {
            log(`beat=${beat.beatId} tier=${source} hit=cache id=${cached.id}`);
            placed = clipToResolved(beat, cached, [...tierTried], rejected);
            break;
          }
          rejected.push({ source, reason: `cache:${v.reason}` });
          log(`beat=${beat.beatId} tier=${source} cache_rejected:${v.reason}`);
        }
      }

      // T10 cost gate: refuse before any paid adapter is touched.
      if (!opts.bypassCostGate && COST_BEARING_BROLL.has(source) && !config.dryRun) {
        const gate = await costCanSpend({
          kind: source === "runway" ? "broll_runway" : "broll_paid",
          briefId: opts.briefId ?? null,
          estUsd: opts.estCostUsdPerCall ?? 0.05,
          metadata: { source, beatId: beat.beatId, query: beat.query },
        });
        if (!gate.allowed) {
          rejected.push({ source, reason: `cost_blocked:${gate.reasons.join("|")}` });
          log(`beat=${beat.beatId} tier=${source} cost_blocked:${gate.reasons.join(",")}`);
          continue;
        }
      }

      // Live adapter call.
      let candidates: BrollCandidate[] = [];
      try {
        candidates = await adapters[source](beat.query, config, beat.location);
      } catch (err) {
        const msg = err instanceof BrollAdapterRefusedError
          ? err.reason
          : err instanceof Error ? err.message : String(err);
        rejected.push({ source, reason: `adapter_refused:${msg}` });
        log(`beat=${beat.beatId} tier=${source} adapter_refused:${msg}`);
        continue;
      }

      let accepted: BrollCandidate | null = null;
      for (const c of candidates) {
        const v = validateCandidate(c);
        if (!v.ok) {
          rejected.push({ source, reason: v.reason });
          log(`beat=${beat.beatId} tier=${source} candidate_rejected:${v.reason}`);
          continue;
        }
        accepted = c;
        break;
      }
      if (!accepted) {
        log(`beat=${beat.beatId} tier=${source} no_acceptable_candidate`);
        continue;
      }

      const clip = await cacheUpsert(accepted, cacheKey);
      log(`beat=${beat.beatId} tier=${source} accepted id=${clip.id}`);
      placed = clipToResolved(beat, clip, [...tierTried], rejected);
      break;
    }

    if (!placed) {
      // The motion-graphic fallback should always succeed; if it didn't,
      // we surface an explicit unfilled beat rather than fabricating data.
      placed = {
        beatId: beat.beatId,
        query: beat.query,
        durationSec: beat.durationSec,
        clipId: null,
        source: null,
        licenseStatus: null,
        licenseTier: null,
        attribution: null,
        rightsUrl: null,
        url: null,
        tierTried,
        rejected,
      };
      log(`beat=${beat.beatId} UNFILLED`);
    }

    resolved.push(placed);
    total += beat.durationSec;
  }

  return { beats: resolved, totalDurationSec: total };
}

/**
 * Resolve a brief end-to-end and persist a `broll_plans` row.
 */
export async function resolveAndPersistPlan(args: {
  briefId: string;
  beats: BrollBeat[];
  createdBy: string;
  config?: BRollResolverConfig;
}): Promise<BrollPlan> {
  const { beats, totalDurationSec } = await resolveForBeats(args.beats, {
    config: args.config,
  });
  const [row] = await db
    .insert(brollPlans)
    .values({
      briefId: args.briefId,
      beats,
      totalDurationSec,
      status: "draft",
      createdBy: args.createdBy,
    })
    .returning();
  return row;
}

export async function getPlansForBrief(briefId: string): Promise<BrollPlan[]> {
  return db
    .select()
    .from(brollPlans)
    .where(eq(brollPlans.briefId, briefId))
    .orderBy(desc(brollPlans.createdAt));
}

export async function swapClipInPlan(args: {
  planId: string;
  beatId: string;
  clipId: string;
}): Promise<BrollPlan> {
  const [plan] = await db.select().from(brollPlans).where(eq(brollPlans.id, args.planId)).limit(1);
  if (!plan) throw new Error(`Plan ${args.planId} not found`);
  const [clip] = await db.select().from(brollClips).where(eq(brollClips.id, args.clipId)).limit(1);
  if (!clip) throw new Error(`Clip ${args.clipId} not found`);

  // Re-run the full safety check on the swap target.
  const v = validateCandidate({
    source: clip.source as BrollSource,
    externalId: clip.externalId,
    url: clip.url,
    licenseStatus: clip.licenseStatus as LicenseStatus,
    licenseTier: clip.licenseTier as LicenseTier,
    attribution: clip.attribution,
    rightsUrl: clip.rightsUrl ?? undefined,
    durationSec: clip.durationSec,
  });
  if (!v.ok) throw new Error(`Clip ${args.clipId} failed safety check: ${v.reason}`);

  const newBeats = plan.beats.map((b) =>
    b.beatId === args.beatId
      ? {
          ...b,
          clipId: clip.id,
          source: clip.source,
          licenseStatus: clip.licenseStatus,
          licenseTier: clip.licenseTier,
          attribution: clip.attribution,
          rightsUrl: clip.rightsUrl,
          url: clip.url,
        }
      : b,
  );
  const [updated] = await db
    .update(brollPlans)
    .set({ beats: newBeats, updatedAt: new Date() })
    .where(eq(brollPlans.id, args.planId))
    .returning();
  return updated;
}
