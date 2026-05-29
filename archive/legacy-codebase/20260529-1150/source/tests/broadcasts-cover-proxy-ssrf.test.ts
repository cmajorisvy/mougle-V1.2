import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPrivateIp,
  resolvePublicAddress,
  safeImageFetch,
  SafeFetchError,
} from "../server/lib/safe-image-fetch";

describe("cover-proxy SSRF guard: isPrivateIp", () => {
  it("flags loopback, link-local, private, ULA and multicast ranges", () => {
    assert.equal(isPrivateIp("127.0.0.1"), true);
    assert.equal(isPrivateIp("0.0.0.0"), true);
    assert.equal(isPrivateIp("10.1.2.3"), true);
    assert.equal(isPrivateIp("172.16.5.4"), true);
    assert.equal(isPrivateIp("172.31.255.255"), true);
    assert.equal(isPrivateIp("192.168.0.1"), true);
    assert.equal(isPrivateIp("169.254.169.254"), true);
    assert.equal(isPrivateIp("100.64.0.1"), true);
    assert.equal(isPrivateIp("224.0.0.1"), true);
    assert.equal(isPrivateIp("::1"), true);
    assert.equal(isPrivateIp("fe80::1"), true);
    assert.equal(isPrivateIp("fc00::1"), true);
    assert.equal(isPrivateIp("fd12:3456::1"), true);
    assert.equal(isPrivateIp("ff02::1"), true);
    assert.equal(isPrivateIp("::ffff:127.0.0.1"), true);
    assert.equal(isPrivateIp("not-an-ip"), true);
  });

  it("permits ordinary public addresses", () => {
    assert.equal(isPrivateIp("8.8.8.8"), false);
    assert.equal(isPrivateIp("1.1.1.1"), false);
    assert.equal(isPrivateIp("172.15.0.1"), false);
    assert.equal(isPrivateIp("172.32.0.1"), false);
    assert.equal(isPrivateIp("2606:4700:4700::1111"), false);
  });
});

describe("cover-proxy SSRF guard: resolvePublicAddress", () => {
  it("rejects literal loopback IPv4", async () => {
    await assert.rejects(
      () => resolvePublicAddress("127.0.0.1"),
      (e: unknown) => e instanceof SafeFetchError && (e as SafeFetchError).code === "blocked_private_address",
    );
  });

  it("rejects the cloud-metadata link-local address", async () => {
    await assert.rejects(
      () => resolvePublicAddress("169.254.169.254"),
      (e: unknown) => e instanceof SafeFetchError && (e as SafeFetchError).code === "blocked_private_address",
    );
  });

  it("rejects literal IPv6 loopback", async () => {
    await assert.rejects(
      () => resolvePublicAddress("::1"),
      (e: unknown) => e instanceof SafeFetchError && (e as SafeFetchError).code === "blocked_private_address",
    );
  });
});

describe("cover-proxy SSRF guard: safeImageFetch end-to-end", () => {
  it("refuses to fetch http://127.0.0.1 before opening any socket", async () => {
    await assert.rejects(
      () =>
        safeImageFetch("http://127.0.0.1:1/cover.png", {
          maxBytes: 1024,
          timeoutMs: 1000,
        }),
      (e: unknown) =>
        e instanceof SafeFetchError && (e as SafeFetchError).code === "blocked_private_address",
    );
  });

  it("refuses to fetch the AWS metadata endpoint", async () => {
    await assert.rejects(
      () =>
        safeImageFetch("http://169.254.169.254/latest/meta-data/", {
          maxBytes: 1024,
          timeoutMs: 1000,
        }),
      (e: unknown) =>
        e instanceof SafeFetchError && (e as SafeFetchError).code === "blocked_private_address",
    );
  });

  it("refuses non-http(s) protocols", async () => {
    await assert.rejects(
      () =>
        safeImageFetch("file:///etc/passwd", {
          maxBytes: 1024,
          timeoutMs: 1000,
        }),
      (e: unknown) =>
        e instanceof SafeFetchError && (e as SafeFetchError).code === "invalid_protocol",
    );
  });
});
