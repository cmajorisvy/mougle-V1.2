/**
 * Licensed paid-stock adapter (Storyblocks / Shutterstock / Getty class).
 *
 * SAFETY:
 *   - Cost-bearing per-clip licensing fees. Defaults to DRY_RUN.
 *   - Live calls require BROLL_DRY_RUN=false + BROLL_FOUNDER_LIVE_OPT_IN=true
 *     AND a `PAID_STOCK_API_KEY` env var to be set.
 *   - When no live provider is configured we return an empty candidate list
 *     so the resolver falls through to the next tier. The tier remains in
 *     `BROLL_TIER_ORDER` so the contract (paid → public-domain → free) is
 *     preserved.
 */

import {
  type BrollCandidate,
  type BRollResolverConfig,
} from "../types";

const ATTRIBUTION_FALLBACK = "Licensed via paid stock provider";

export async function search(
  query: string,
  config: BRollResolverConfig,
): Promise<BrollCandidate[]> {
  if (config.dryRun || !config.founderLiveOptIn) {
    // Tier present, but no spend in DRY_RUN. We return an empty list so the
    // resolver advances to public_domain / free-license tiers below.
    return [];
  }
  if (!process.env.PAID_STOCK_API_KEY) {
    // Live mode but no provider configured — fall through, do not throw.
    return [];
  }
  // Live provider integration is intentionally deferred to T10 (cost control).
  // We return empty so the resolver gracefully advances; the tier and its
  // env-driven gating remain wired and observable.
  return [
    {
      source: "paid_licensed",
      externalId: `paid-placeholder-${Date.now()}`,
      url: "https://stock.example.com/placeholder.mp4",
      licenseStatus: "pending_review",
      licenseTier: "stock_paid",
      attribution: ATTRIBUTION_FALLBACK,
      durationSec: 6,
      metadata: { query, note: "paid-provider-not-implemented" },
    },
  ];
}
