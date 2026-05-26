/**
 * Runway Gen-3 AI video adapter.
 *
 * AI-generated content — original work, recorded as licenseTier="owned".
 *
 * SAFETY:
 *   - Cost-bearing (per-second generation). Defaults to DRY_RUN.
 *     Live calls require BROLL_DRY_RUN=false + BROLL_FOUNDER_LIVE_OPT_IN=true
 *     AND `RUNWAY_API_KEY` set.
 *   - In DRY_RUN we return a deterministic placeholder and never touch the
 *     network.
 *   - In live mode we attempt the provider call; any error degrades to an
 *     empty candidate list so the resolver falls through to the
 *     Remotion motion-graphic fallback rather than throwing.
 */

import {
  type BrollCandidate,
  type BRollResolverConfig,
} from "../types";

const ATTRIBUTION = "Mougle Newsroom — Runway Gen-3 generated";
const RIGHTS_URL = "https://runwayml.com/terms-of-use/";
const RUNWAY_ENDPOINT = "https://api.dev.runwayml.com/v1/text_to_video";

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export async function search(
  query: string,
  config: BRollResolverConfig,
): Promise<BrollCandidate[]> {
  if (config.dryRun || !config.founderLiveOptIn) {
    return [
      {
        source: "runway",
        externalId: `runway-dryrun-${hash(query)}`,
        url: `runway://dryrun/${encodeURIComponent(query)}`,
        licenseStatus: "licensed",
        licenseTier: "owned",
        attribution: ATTRIBUTION,
        rightsUrl: RIGHTS_URL,
        durationSec: 6,
        metadata: { dryRun: true, query },
      },
    ];
  }
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    // Live mode but no key configured — fall through, do not throw.
    return [];
  }
  try {
    const res = await fetch(RUNWAY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify({ promptText: query, model: "gen3a_turbo", duration: 6 }),
    });
    if (!res.ok) return [];
    const body = (await res.json().catch(() => null)) as
      | { id?: string; output?: { url?: string }; assetUrl?: string }
      | null;
    const url = body?.assetUrl ?? body?.output?.url;
    if (!url || typeof url !== "string") return [];
    return [
      {
        source: "runway",
        externalId: body?.id ?? `runway-${hash(query + url)}`,
        url,
        licenseStatus: "licensed",
        licenseTier: "owned",
        attribution: ATTRIBUTION,
        rightsUrl: RIGHTS_URL,
        durationSec: 6,
        metadata: { query, provider: "runway-gen3" },
      },
    ];
  } catch {
    return [];
  }
}
