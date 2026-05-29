/**
 * Pixabay free-license video adapter.
 *
 * SAFETY: see pexels.ts — same DRY_RUN + founder opt-in contract.
 * Pixabay content is delivered under the Pixabay Content License (CC0-like)
 * — recorded here as licenseTier="creative_commons".
 */

import {
  type BrollCandidate,
  type BRollResolverConfig,
  BrollAdapterRefusedError,
} from "../types";
import { blocklistMatch } from "../blocklist";

const ATTRIBUTION = "Pixabay (Pixabay Content License)";
const RIGHTS_URL = "https://pixabay.com/service/license-summary/";

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function placeholder(query: string): BrollCandidate {
  return {
    source: "pixabay",
    externalId: `pixabay-dryrun-${hash(query)}`,
    url: `https://pixabay.com/videos/search/${encodeURIComponent(query)}/`,
    licenseStatus: "licensed",
    licenseTier: "creative_commons",
    attribution: ATTRIBUTION,
    rightsUrl: RIGHTS_URL,
    durationSec: 10,
    metadata: { dryRun: true, query },
  };
}

export async function search(
  query: string,
  config: BRollResolverConfig,
): Promise<BrollCandidate[]> {
  if (config.dryRun || !config.founderLiveOptIn) {
    return [placeholder(query)];
  }
  if (!process.env.PIXABAY_API_KEY) {
    throw new BrollAdapterRefusedError("pixabay", "PIXABAY_API_KEY not set");
  }
  const url = `https://pixabay.com/api/videos/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&per_page=5`;
  const res = await fetch(url);
  if (!res.ok) throw new BrollAdapterRefusedError("pixabay", `HTTP ${res.status}`);
  const data: any = await res.json();
  const out: BrollCandidate[] = [];
  for (const v of data.hits ?? []) {
    const file = v.videos?.medium ?? v.videos?.small;
    if (!file?.url) continue;
    if (blocklistMatch(file.url)) continue;
    out.push({
      source: "pixabay",
      externalId: `pixabay-${v.id}`,
      url: file.url,
      thumbnailUrl: v.picture_id ? `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg` : undefined,
      licenseStatus: "licensed",
      licenseTier: "creative_commons",
      attribution: `Pixabay — ${v.user ?? "unknown"}`,
      rightsUrl: RIGHTS_URL,
      durationSec: v.duration ?? 0,
      width: file.width,
      height: file.height,
      metadata: { query, pixabayId: v.id },
    });
  }
  return out;
}
