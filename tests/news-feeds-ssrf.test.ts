/**
 * SSRF spot tests for non-broadcasts server-side URL fetchers.
 *
 * Task #173: every server-side fetcher that takes an admin- or user-supplied
 * URL must route through `safeFetch` / `safeImageFetch` so private,
 * loopback, and link-local hosts are refused before connect. These tests
 * cover the RSS news ingestion path (`newsService` and `news-pipeline-service`)
 * by directly exercising the shared helper that both now use.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeFetch, SafeFetchError } from "../server/lib/safe-image-fetch";

describe("news feeds SSRF guard (shared safeFetch helper)", () => {
  it("refuses to fetch the AWS metadata endpoint as an RSS feed", async () => {
    await assert.rejects(
      () =>
        safeFetch("http://169.254.169.254/latest/meta-data/", {
          maxBytes: 1024,
          timeoutMs: 1000,
        }),
      (e: unknown) =>
        e instanceof SafeFetchError &&
        (e as SafeFetchError).code === "blocked_private_address",
    );
  });

  it("refuses to fetch http://127.0.0.1 as an RSS feed", async () => {
    await assert.rejects(
      () =>
        safeFetch("http://127.0.0.1:1/feed.xml", {
          maxBytes: 1024,
          timeoutMs: 1000,
        }),
      (e: unknown) =>
        e instanceof SafeFetchError &&
        (e as SafeFetchError).code === "blocked_private_address",
    );
  });

  it("refuses to fetch an RFC1918 private host as an RSS feed", async () => {
    await assert.rejects(
      () =>
        safeFetch("http://10.0.0.1/feed.xml", {
          maxBytes: 1024,
          timeoutMs: 1000,
        }),
      (e: unknown) =>
        e instanceof SafeFetchError &&
        (e as SafeFetchError).code === "blocked_private_address",
    );
  });

  it("refuses non-http(s) protocols (file:// cannot be used as a feed URL)", async () => {
    await assert.rejects(
      () =>
        safeFetch("file:///etc/passwd", {
          maxBytes: 1024,
          timeoutMs: 1000,
        }),
      (e: unknown) =>
        e instanceof SafeFetchError &&
        (e as SafeFetchError).code === "invalid_protocol",
    );
  });
});
