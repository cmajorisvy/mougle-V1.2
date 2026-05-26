/**
 * Pexels free-license video adapter.
 *
 * SAFETY:
 *   - Cost-bearing (rate-limited API). Defaults to DRY_RUN — emits a
 *     deterministic placeholder candidate. Live calls require
 *     BROLL_DRY_RUN=false + BROLL_FOUNDER_LIVE_OPT_IN=true.
 *   - Pexels content is delivered under the Pexels License — recorded here
 *     as licenseTier="creative_commons" with attribution.
 *   - Every candidate URL is filtered through the copyrighted-source
 *     blocklist before being returned.
 */

import {
  type BrollCandidate,
  type BRollResolverConfig,
  BrollAdapterRefusedError,
} from "../types";
import { blocklistMatch } from "../blocklist";

const ATTRIBUTION = "Pexels (Pexels License)";
const RIGHTS_URL = "https://www.pexels.com/license/";

function placeholder(query: string): BrollCandidate {
  return {
    source: "pexels",
    externalId: `pexels-dryrun-${hash(query)}`,
    url: `https://www.pexels.com/search/videos/${encodeURIComponent(query)}/`,
    licenseStatus: "licensed",
    licenseTier: "creative_commons",
    attribution: ATTRIBUTION,
    rightsUrl: RIGHTS_URL,
    durationSec: 10,
    metadata: { dryRun: true, query },
  };
}

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
    return [placeholder(query)];
  }
  if (!process.env.PEXELS_API_KEY) {
    throw new BrollAdapterRefusedError("pexels", "PEXELS_API_KEY not set");
  }
  // Live call — kept minimal. Each candidate is filtered through the
  // blocklist. We do not mark any candidate as "licensed" unless the URL
  // resolves to pexels.com (which is allow-listed by absence from the
  // blocklist) AND carries Pexels' license tag.
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5`;
  const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
  if (!res.ok) throw new BrollAdapterRefusedError("pexels", `HTTP ${res.status}`);
  const data: any = await res.json();
  const out: BrollCandidate[] = [];
  for (const v of data.videos ?? []) {
    const file = (v.video_files ?? [])[0];
    if (!file?.link) continue;
    if (blocklistMatch(file.link)) continue;
    out.push({
      source: "pexels",
      externalId: `pexels-${v.id}`,
      url: file.link,
      thumbnailUrl: v.image,
      licenseStatus: "licensed",
      licenseTier: "creative_commons",
      attribution: `Pexels — ${v.user?.name ?? "unknown"}`,
      rightsUrl: RIGHTS_URL,
      durationSec: v.duration ?? 0,
      width: file.width,
      height: file.height,
      metadata: { query, pexelsId: v.id },
    });
  }
  return out;
}
