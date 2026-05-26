/**
 * Mapbox static/satellite fly-in adapter.
 *
 * Used as a geo-aware fallback for beats that carry a `location`. Returns a
 * tokenless descriptor URL that downstream Remotion compositors can fly-over
 * via the server-side mapbox proxy (see `server/routes/broll.ts`).
 *
 * SAFETY:
 *   - Mapbox Static API is cost-bearing past free tier; defaults to DRY_RUN.
 *     Live calls require founder opt-in + MAPBOX_TOKEN.
 *   - The Mapbox API key MUST NOT be persisted in `broll_clips.url` or
 *     returned by admin APIs. We store a stable `mapbox-tile://` descriptor
 *     and only inject the token at render time via the proxy route.
 */

import {
  type BrollCandidate,
  type BRollResolverConfig,
} from "../types";

const ATTRIBUTION = "© Mapbox © OpenStreetMap";
const RIGHTS_URL = "https://www.mapbox.com/about/maps/";

/** Tokenless URL persisted in DB and returned by API. */
function descriptorUrl(lat: number, lon: number, zoom: number): string {
  return `mapbox-tile://satellite-streets-v12/${lon},${lat},${zoom}/1280x720`;
}

/**
 * Build the live Mapbox URL by injecting the server-side token. Called only
 * by the proxy route (`/api/admin/broll/mapbox-proxy/:clipId`) on render —
 * never persisted, never returned to the client.
 */
export function buildSignedUrl(descriptor: {
  lat: number;
  lon: number;
  zoom: number;
}): string | null {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${descriptor.lon},${descriptor.lat},${descriptor.zoom}/1280x720?access_token=${token}`;
}

export async function search(
  query: string,
  config: BRollResolverConfig,
  opts?: { lat?: number; lon?: number; zoom?: number },
): Promise<BrollCandidate[]> {
  const lat = opts?.lat;
  const lon = opts?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") {
    return [];
  }
  const zoom = opts?.zoom ?? 8;
  const url = descriptorUrl(lat, lon, zoom);
  if (config.dryRun || !config.founderLiveOptIn) {
    return [
      {
        source: "mapbox",
        externalId: `mapbox-dryrun-${lat.toFixed(3)}-${lon.toFixed(3)}-${zoom}`,
        url,
        licenseStatus: "licensed",
        licenseTier: "stock_paid",
        attribution: ATTRIBUTION,
        rightsUrl: RIGHTS_URL,
        durationSec: 6,
        metadata: { dryRun: true, query, lat, lon, zoom },
      },
    ];
  }
  if (!process.env.MAPBOX_TOKEN) {
    // Live mode but no token — fall through; do not throw.
    return [];
  }
  return [
    {
      source: "mapbox",
      externalId: `mapbox-${lat}-${lon}-${zoom}`,
      url,
      licenseStatus: "licensed",
      licenseTier: "stock_paid",
      attribution: ATTRIBUTION,
      rightsUrl: RIGHTS_URL,
      durationSec: 6,
      width: 1280,
      height: 720,
      metadata: { query, lat, lon, zoom },
    },
  ];
}
