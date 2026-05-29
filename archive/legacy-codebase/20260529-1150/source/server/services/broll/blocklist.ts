/**
 * Newsroom T4 — Copyrighted-source blocklist.
 *
 * Hostnames in this list are dropped at the adapter layer even if a candidate
 * arrives with a "licensed" tag, because we cannot legally rebroadcast their
 * footage from a stock-search result alone. This is intentionally a wide net.
 *
 * Universal safety gate #1 ("no copyrighted footage reuse") from the
 * newsroom master plan is enforced here.
 */

const BLOCKED_DOMAINS = [
  // Wire services / major broadcasters
  "cnn.com",
  "edition.cnn.com",
  "reuters.com",
  "reutersagency.com",
  "apnews.com",
  "ap.org",
  "bbc.com",
  "bbc.co.uk",
  "nbcnews.com",
  "msnbc.com",
  "abcnews.go.com",
  "cbsnews.com",
  "foxnews.com",
  "skynews.com",
  "news.sky.com",
  "aljazeera.com",
  "rt.com",
  "dw.com",
  "france24.com",
  "euronews.com",
  "nytimes.com",
  "washingtonpost.com",
  "wsj.com",
  "ft.com",
  "bloomberg.com",
  "afp.com",
  // Major video / studio platforms whose footage is almost always non-licensed
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "netflix.com",
  "hbo.com",
  "disneyplus.com",
  "primevideo.com",
] as const;

export const BLOCKED_DOMAIN_LIST: readonly string[] = BLOCKED_DOMAINS;

/** Returns the blocked domain if `url` matches the blocklist, else null. */
export function blocklistMatch(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // Malformed URL — treat as blocked rather than silently allow.
    return "__malformed_url__";
  }
  for (const blocked of BLOCKED_DOMAINS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) {
      return blocked;
    }
  }
  return null;
}

export function isBlockedUrl(url: string | null | undefined): boolean {
  return blocklistMatch(url) !== null;
}
