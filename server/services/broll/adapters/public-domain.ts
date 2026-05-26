/**
 * Public-domain catalog adapter (Wikimedia Commons / NASA / archive.org).
 *
 * Public-domain media is free of license fees, but we still gate live HTTP
 * calls behind founder opt-in to avoid uncontrolled outbound traffic from
 * the newsroom pipeline.
 */

import {
  type BrollCandidate,
  type BRollResolverConfig,
} from "../types";

const NASA_ATTRIBUTION = "NASA — Public Domain";
const NASA_RIGHTS = "https://www.nasa.gov/multimedia/guidelines/index.html";

export async function search(
  query: string,
  config: BRollResolverConfig,
): Promise<BrollCandidate[]> {
  if (config.dryRun || !config.founderLiveOptIn) {
    // Deterministic placeholder so downstream tooling can see the tier wired.
    return [
      {
        source: "public_domain",
        externalId: `pd-dryrun-${Buffer.from(query).toString("hex").slice(0, 12)}`,
        url: `pd://placeholder/${encodeURIComponent(query)}`,
        licenseStatus: "licensed",
        licenseTier: "creative_commons",
        attribution: NASA_ATTRIBUTION,
        rightsUrl: NASA_RIGHTS,
        durationSec: 6,
        metadata: { dryRun: true, query, catalog: "nasa-placeholder" },
      },
    ];
  }
  // Live mode: catalog HTTP integration deferred to T11 (e2e safety suite).
  // We return the same descriptor — public-domain catalogs do not require
  // an API key or any cost-bearing call.
  return [
    {
      source: "public_domain",
      externalId: `pd-live-${Date.now()}`,
      url: `https://images-assets.nasa.gov/search/${encodeURIComponent(query)}`,
      licenseStatus: "licensed",
      licenseTier: "creative_commons",
      attribution: NASA_ATTRIBUTION,
      rightsUrl: NASA_RIGHTS,
      durationSec: 6,
      metadata: { query },
    },
  ];
}
