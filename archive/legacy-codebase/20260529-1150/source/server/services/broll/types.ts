/**
 * Newsroom T4 — Legal B-Roll Resolver — shared types.
 *
 * Contracts shared between resolver, adapters, routes, and tests.
 */

import type { LicenseStatus, LicenseTier } from "../../../shared/safety-types";

/** Adapter source identifier. New adapters MUST be added here. */
export type BrollSource =
  | "paid_licensed"
  | "public_domain"
  | "pexels"
  | "pixabay"
  | "mapbox"
  | "runway"
  | "remotion_motion";

/**
 * Tier ordering enforced by the resolver. Lower index = preferred.
 *
 * Contract from the task spec:
 *   licensed paid → public-domain → free-license stock → map/satellite
 *     → Runway AI → Remotion motion-graphic fallback
 */
export const BROLL_TIER_ORDER: BrollSource[] = [
  // 1. Licensed paid stock (Storyblocks/Shutterstock/Getty — adapter slot,
  //    refuses live without founder opt-in; today returns no candidates so
  //    resolution continues, but the tier exists in ordering semantics).
  "paid_licensed",
  // 2. Public-domain catalogs (Wikimedia Commons / NASA / archive.org).
  "public_domain",
  // 3. Free-license stock catalogs.
  "pexels",
  "pixabay",
  // 4. Map / satellite fly-in.
  "mapbox",
  // 5. AI-generated.
  "runway",
  // 6. Motion-graphic fallback (always succeeds).
  "remotion_motion",
];

export interface BrollBeat {
  beatId: string;
  query: string;
  /** Desired clip duration in seconds. Resolver will trim/extend metadata. */
  durationSec: number;
  /** Optional location for map/satellite tier. */
  location?: {
    lat: number;
    lon: number;
    zoom?: number;
    label?: string;
  };
  /** Optional explicit tier hint — resolver still enforces tier order. */
  preferredTier?: BrollSource;
}

export interface BrollCandidate {
  /** Adapter that produced the candidate. */
  source: BrollSource;
  /** Provider-side identifier (used for cache de-duplication). */
  externalId: string;
  url: string;
  thumbnailUrl?: string;
  /** REQUIRED — adapters MUST set both. Missing -> safety-harness rejection. */
  licenseStatus: LicenseStatus;
  licenseTier: LicenseTier;
  /** Human-readable attribution string. REQUIRED. */
  attribution: string;
  /** Rights / license URL. Strongly recommended. */
  rightsUrl?: string;
  durationSec: number;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}

export interface ResolvedBeat {
  beatId: string;
  query: string;
  durationSec: number;
  clipId: string | null;
  source: BrollSource | null;
  licenseStatus: LicenseStatus | null;
  licenseTier: LicenseTier | null;
  attribution: string | null;
  rightsUrl: string | null;
  url: string | null;
  /** Adapter sources tried, in order. */
  tierTried: BrollSource[];
  /** Per-source rejection log (blocklist hit, missing license, adapter dry-run, etc.). */
  rejected: Array<{ source: BrollSource | "blocklist" | "license"; reason: string }>;
}

export interface BRollPlan {
  briefId: string;
  beats: ResolvedBeat[];
  totalDurationSec: number;
  status: "draft" | "approved" | "archived";
  generatedAt: string;
}

export interface BRollResolverConfig {
  /** When true, cost-bearing adapters MUST refuse to make live calls. */
  dryRun: boolean;
  /** Founder env flag required to make live cost-bearing calls. */
  founderLiveOptIn: boolean;
}

/**
 * Resolve the resolver's runtime config from environment variables.
 *
 * Defaults:
 *   - dryRun = true                          (cost-safe default)
 *   - founderLiveOptIn = false               (no live calls)
 *
 * Live calls require BOTH:
 *   - BROLL_DRY_RUN=false
 *   - BROLL_FOUNDER_LIVE_OPT_IN=true
 */
export function resolveBrollConfig(env: NodeJS.ProcessEnv = process.env): BRollResolverConfig {
  const dryRunRaw = (env.BROLL_DRY_RUN ?? "true").toLowerCase();
  const optInRaw = (env.BROLL_FOUNDER_LIVE_OPT_IN ?? "false").toLowerCase();
  const dryRun = dryRunRaw !== "false";
  const founderLiveOptIn = optInRaw === "true";
  return { dryRun, founderLiveOptIn };
}

export class BrollAdapterRefusedError extends Error {
  readonly source: BrollSource;
  readonly reason: string;
  constructor(source: BrollSource, reason: string) {
    super(`[broll:${source}] refused: ${reason}`);
    this.name = "BrollAdapterRefusedError";
    this.source = source;
    this.reason = reason;
  }
}
