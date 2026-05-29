/**
 * Remotion motion-graphic fallback adapter.
 *
 * Always succeeds. Returns a deterministic motion-graphic plan that the
 * downstream Remotion compositor (T6) can render. Treated as "owned" since
 * the motion graphic is generated entirely from Mougle assets/fonts.
 *
 * SAFETY: Free, in-process, no external calls. Never cost-bearing.
 */

import { type BrollCandidate, type BRollResolverConfig } from "../types";

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export async function search(
  query: string,
  _config: BRollResolverConfig,
): Promise<BrollCandidate[]> {
  return [
    {
      source: "remotion_motion",
      externalId: `motion-${hash(query)}`,
      url: `remotion://motion-graphic/${encodeURIComponent(query)}`,
      licenseStatus: "licensed",
      licenseTier: "owned",
      attribution: "Mougle Newsroom — Remotion motion-graphic fallback",
      rightsUrl: "https://www.remotion.dev/license",
      durationSec: 6,
      metadata: { query, template: "headline_motion_v1" },
    },
  ];
}
