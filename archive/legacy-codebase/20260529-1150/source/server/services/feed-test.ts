/**
 * Shared news-source feed test helper.
 *
 * Centralises URL validation + DNS/private-host check + safe fetch + RSS/Atom
 * parse + non-empty check used by the admin preview button, the daily health
 * scheduler, and the save/enable enforcement gate.
 *
 * Always returns a normalised result with a safe `reason` code drawn from a
 * fixed allowlist — internal network error strings (host names, IPs, stack
 * traces, raw `err.message`) are NEVER passed through to the caller, so
 * responses cannot leak server-side internals or secrets to admins.
 */

import Parser from "rss-parser";
import { safeFetch, SafeFetchError, resolvePublicAddress } from "../lib/safe-image-fetch";

/**
 * Test-only injection hooks. Production code must NEVER reassign these — they
 * exist solely so the safety test suite can swap in an in-process HTTP server
 * without disabling the SSRF / private-IP guard in `safe-image-fetch.ts`.
 */
export const __testHooks: {
  resolvePublicAddress: typeof resolvePublicAddress;
  safeFetch: typeof safeFetch;
} = {
  resolvePublicAddress,
  safeFetch,
};

export const FEED_TEST_REASONS = [
  "invalid_url",
  "invalid_protocol",
  "blocked_private_host",
  "unreachable_host",
  "http_error",
  "parse_failed",
  "empty_feed",
  "fetch_failed",
  "unknown",
] as const;

export type FeedTestReason = (typeof FEED_TEST_REASONS)[number];

export interface FeedTestResult {
  ok: boolean;
  reason?: FeedTestReason;
  statusCode?: number;
  testedAt: string;
  itemCount?: number;
  sampleTitle?: string;
}

const REASON_MESSAGES: Record<FeedTestReason, string> = {
  invalid_url: "URL is not valid. Use a full https:// or http:// address.",
  invalid_protocol: "Feed URL must use http:// or https://.",
  blocked_private_host:
    "This URL resolves to a private, loopback, or internal host and was rejected.",
  unreachable_host:
    "This host could not be resolved via DNS. Check the URL — it may be unreachable.",
  http_error: "Feed returned a non-2xx HTTP response.",
  parse_failed:
    "Response did not parse as a valid RSS or Atom feed.",
  empty_feed: "Feed parsed but contained zero items.",
  fetch_failed: "Fetch failed before a response was received.",
  unknown: "Feed test failed for an unknown reason.",
};

export function feedTestMessage(reason: FeedTestReason): string {
  return REASON_MESSAGES[reason];
}

function mapSafeFetchError(code: string): FeedTestReason {
  switch (code) {
    case "invalid_url":
      return "invalid_url";
    case "invalid_protocol":
      return "invalid_protocol";
    case "blocked_private_address":
      return "blocked_private_host";
    case "dns_lookup_failed":
    case "dns_no_records":
      return "unreachable_host";
    default:
      return "fetch_failed";
  }
}

export async function runFeedTest(rawUrl: string): Promise<FeedTestResult> {
  const testedAt = new Date().toISOString();
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url", testedAt };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "invalid_protocol", testedAt };
  }
  try {
    await __testHooks.resolvePublicAddress(parsed.hostname);
  } catch (err) {
    const code = err instanceof SafeFetchError ? err.code : "dns_lookup_failed";
    return { ok: false, reason: mapSafeFetchError(code), testedAt };
  }

  let fetched: Awaited<ReturnType<typeof safeFetch>>;
  try {
    fetched = await __testHooks.safeFetch(rawUrl, {
      maxBytes: 10 * 1024 * 1024,
      timeoutMs: 15_000,
      maxRedirects: 3,
      userAgent: "Mougle-NewsBot/2.0",
      acceptHeader:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    });
  } catch (err) {
    if (err instanceof SafeFetchError) {
      return {
        ok: false,
        reason: mapSafeFetchError(err.code),
        testedAt,
      };
    }
    return { ok: false, reason: "fetch_failed", testedAt };
  }

  if (fetched.status >= 400) {
    return {
      ok: false,
      reason: "http_error",
      statusCode: fetched.status,
      testedAt,
    };
  }

  const xml = fetched.body.toString("utf-8");
  let itemCount = 0;
  let sampleTitle: string | undefined;
  try {
    const parser = new Parser();
    const result = await parser.parseString(xml);
    const items = result.items || [];
    itemCount = items.length;
    sampleTitle =
      typeof items[0]?.title === "string"
        ? items[0].title.trim().slice(0, 200)
        : undefined;
  } catch {
    return {
      ok: false,
      reason: "parse_failed",
      statusCode: fetched.status,
      testedAt,
    };
  }

  if (itemCount === 0) {
    return {
      ok: false,
      reason: "empty_feed",
      statusCode: fetched.status,
      itemCount: 0,
      testedAt,
    };
  }

  return {
    ok: true,
    statusCode: fetched.status,
    itemCount,
    sampleTitle,
    testedAt,
  };
}
