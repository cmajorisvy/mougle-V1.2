/**
 * Newsroom T2 — Global Source Registry safety tests.
 *
 * Ensures:
 *   1. `licenseStatus === 'unknown'` is excluded from the active pipeline
 *      filter regardless of `enabled` value.
 *   2. Disabled rows are excluded even when license is known.
 *   3. Known-license enabled rows are included.
 *   4. The admin REST routes reject unauthenticated / non-root admin calls.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  filterActiveSources,
  isActiveLicense,
  publicProjection,
} from "../../server/services/news-source-registry";
import { registerNewsSourceRoutes } from "../../server/routes/news-sources";
import { runFeedTest, FEED_TEST_REASONS, __testHooks as feedTestHooks } from "../../server/services/feed-test";
import { storage } from "../../server/storage";

describe("news-source registry — license safety filter", () => {
  it("excludes unknown license even when enabled", () => {
    const rows = [
      { id: "a", enabled: true, licenseStatus: "unknown" },
      { id: "b", enabled: true, licenseStatus: "public_rss" },
    ];
    const out = filterActiveSources(rows);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "b");
  });

  it("excludes disabled rows even when license is known", () => {
    const rows = [
      { id: "a", enabled: false, licenseStatus: "licensed" },
      { id: "b", enabled: true, licenseStatus: "partner" },
    ];
    const out = filterActiveSources(rows);
    assert.deepEqual(out.map((r) => r.id), ["b"]);
  });

  it("isActiveLicense rejects unknown and falsy", () => {
    assert.equal(isActiveLicense("unknown"), false);
    assert.equal(isActiveLicense(""), false);
    assert.equal(isActiveLicense(null), false);
    assert.equal(isActiveLicense(undefined), false);
    assert.equal(isActiveLicense("public_rss"), true);
    assert.equal(isActiveLicense("licensed"), true);
    assert.equal(isActiveLicense("partner"), true);
    assert.equal(isActiveLicense("owned"), true);
  });

  it("publicProjection omits notes and timestamps", () => {
    const row: any = {
      id: "x", name: "Example", url: "https://e.example/feed.xml",
      type: "free", country: "global", language: "en",
      reliabilityScore: 0.8, licenseStatus: "public_rss", tier: "standard",
      enabled: true, notes: "internal admin notes — must not leak",
      createdAt: new Date(), updatedAt: new Date(),
    };
    const proj = publicProjection(row);
    assert.equal((proj as any).notes, undefined);
    assert.equal((proj as any).url, undefined);
    assert.equal((proj as any).createdAt, undefined);
    assert.equal((proj as any).updatedAt, undefined);
    assert.equal(proj.name, "Example");
    assert.equal(proj.licenseStatus, "public_rss");
  });
});

describe("news-source registry — admin route auth", () => {
  type AuthMode = "unauthenticated" | "non_root" | "root";
  function buildApp(mode: AuthMode, opts?: { withCsrf?: boolean }) {
    const app = express();
    app.use(express.json());
    if (opts?.withCsrf) {
      // Simulated CSRF middleware on /api/* (mirrors prod ordering: CSRF
      // runs before any route-level admin guard).
      app.use("/api", (req: Request, res: Response, next: NextFunction) => {
        if (req.method === "GET") return next();
        if (req.header("X-CSRF-Token") === "valid-token") return next();
        return res.status(403).json({ message: "CSRF token missing/invalid" });
      });
    }
    const requireRootAdmin = (_req: Request, res: Response, next: NextFunction) => {
      if (mode === "unauthenticated") return res.status(401).json({ message: "Unauthorized" });
      if (mode === "non_root") return res.status(403).json({ message: "Forbidden" });
      next();
    };
    registerNewsSourceRoutes(app, requireRootAdmin);
    return app;
  }

  async function callJson(
    app: express.Express,
    method: string,
    path: string,
    body?: any,
    extraHeaders?: Record<string, string>,
  ) {
    return await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const server = app.listen(0, async () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        try {
          const res = await fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
            body: body ? JSON.stringify(body) : undefined,
          });
          const json = await res.json().catch(() => ({}));
          server.close(() => resolve({ status: res.status, body: json }));
        } catch (err) {
          server.close(() => reject(err));
        }
      });
    });
  }

  const samplePayload = {
    name: "x", url: "https://x.example/rss", type: "free",
    country: "global", language: "en", reliabilityScore: 0.5,
    licenseStatus: "public_rss", tier: "standard", enabled: true,
  };

  it("rejects unauthenticated GET /api/admin/news-sources with 401", async () => {
    const app = buildApp("unauthenticated");
    const res = await callJson(app, "GET", "/api/admin/news-sources");
    assert.equal(res.status, 401);
  });

  it("rejects unauthenticated POST /api/admin/news-sources with 401", async () => {
    const app = buildApp("unauthenticated");
    const res = await callJson(app, "POST", "/api/admin/news-sources", samplePayload);
    assert.equal(res.status, 401);
  });

  it("rejects unauthenticated PATCH and disable with 401", async () => {
    const app = buildApp("unauthenticated");
    const r1 = await callJson(app, "PATCH", "/api/admin/news-sources/some-id", { enabled: false });
    assert.equal(r1.status, 401);
    const r2 = await callJson(app, "POST", "/api/admin/news-sources/some-id/disable");
    assert.equal(r2.status, 401);
  });

  it("rejects non-root admin with 403 on all mutating routes", async () => {
    const app = buildApp("non_root");
    const r1 = await callJson(app, "GET", "/api/admin/news-sources");
    assert.equal(r1.status, 403);
    const r2 = await callJson(app, "POST", "/api/admin/news-sources", samplePayload);
    assert.equal(r2.status, 403);
    const r3 = await callJson(app, "PATCH", "/api/admin/news-sources/some-id", { enabled: false });
    assert.equal(r3.status, 403);
    const r4 = await callJson(app, "POST", "/api/admin/news-sources/some-id/disable");
    assert.equal(r4.status, 403);
  });

  it("CSRF runs before admin guard: missing token returns 403 even with a valid root admin", async () => {
    const app = buildApp("root", { withCsrf: true });
    // No X-CSRF-Token header → CSRF layer rejects before requireRootAdmin runs.
    const res = await callJson(app, "POST", "/api/admin/news-sources", samplePayload);
    assert.equal(res.status, 403);
    assert.match(String(res.body?.message || ""), /csrf/i);
  });

  it("public projection route does not require CSRF (GET) and remains accessible", async () => {
    // Even with a CSRF gate on /api/*, the public GET is allowed through and
    // does not invoke the admin guard.
    const app = buildApp("unauthenticated", { withCsrf: true });
    const res = await callJson(app, "GET", "/api/news-sources/public");
    // Storage isn't wired in this isolated harness, so we accept either a
    // successful response or an internal failure — what we are asserting is
    // that neither the CSRF gate (403) nor the admin guard (401) blocked it.
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});

// --- Shared feed test helper ---------------------------------------------

function startHttpServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}/feed.xml`,
        close: () =>
          new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/**
 * Swap out the SSRF guard + safeFetch so we can hit a local in-process HTTP
 * server. Production code never reassigns these — this is test-only.
 */
function allowLocalFetch(): () => void {
  const origResolve = feedTestHooks.resolvePublicAddress;
  const origFetch = feedTestHooks.safeFetch;
  feedTestHooks.resolvePublicAddress = (async () => ({ address: "127.0.0.1", family: 4 })) as typeof origResolve;
  feedTestHooks.safeFetch = (async (rawUrl: string) => {
    const parsed = new URL(rawUrl);
    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: parsed.hostname,
          port: parsed.port || 80,
          path: parsed.pathname + parsed.search,
          method: "GET",
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode || 0,
              headers: {},
              body: Buffer.concat(chunks),
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    });
  }) as typeof origFetch;
  return () => {
    feedTestHooks.resolvePublicAddress = origResolve;
    feedTestHooks.safeFetch = origFetch;
  };
}

const VALID_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Test</title><link>http://example.com</link><description>x</description>
  <item><title>Hello</title><link>http://example.com/1</link><description>d</description></item>
</channel></rss>`;

const EMPTY_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Empty</title><link>http://example.com</link><description>x</description>
</channel></rss>`;

describe("runFeedTest — branches & safety", () => {
  it("rejects invalid URL with reason invalid_url", async () => {
    const r = await runFeedTest("not-a-url");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "invalid_url");
    assert.ok(r.testedAt);
  });

  it("rejects unsupported protocol with reason invalid_protocol", async () => {
    const r = await runFeedTest("ftp://example.com/feed.xml");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "invalid_protocol");
  });

  it("rejects loopback / private host with reason blocked_private_host", async () => {
    const r = await runFeedTest("http://127.0.0.1/feed.xml");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "blocked_private_host");
  });

  it("rejects unreachable DNS host with reason unreachable_host", async () => {
    // `.invalid` TLD is guaranteed by RFC 2606 to never resolve.
    const r = await runFeedTest("https://nonexistent-mougle-test.invalid/feed.xml");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "unreachable_host");
  });

  it("reports parse_failed for non-XML response", async () => {
    const srv = await startHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello world not xml");
    });
    const restore = allowLocalFetch();
    try {
      const r = await runFeedTest(srv.url);
      assert.equal(r.ok, false);
      assert.equal(r.reason, "parse_failed");
      assert.equal(r.statusCode, 200);
    } finally {
      restore();
      await srv.close();
    }
  });

  it("reports empty_feed for valid RSS with zero items", async () => {
    const srv = await startHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(EMPTY_RSS);
    });
    const restore = allowLocalFetch();
    try {
      const r = await runFeedTest(srv.url);
      assert.equal(r.ok, false);
      assert.equal(r.reason, "empty_feed");
      assert.equal(r.itemCount, 0);
    } finally {
      restore();
      await srv.close();
    }
  });

  it("returns ok for valid RSS feed with items (success path)", async () => {
    const srv = await startHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(VALID_RSS);
    });
    const restore = allowLocalFetch();
    try {
      const r = await runFeedTest(srv.url);
      assert.equal(r.ok, true);
      assert.equal(r.itemCount, 1);
      assert.equal(r.statusCode, 200);
      assert.ok(r.testedAt);
    } finally {
      restore();
      await srv.close();
    }
  });

  it("reports http_error for non-2xx HTTP response", async () => {
    const srv = await startHttpServer((_req, res) => {
      res.writeHead(503);
      res.end("upstream broken");
    });
    const restore = allowLocalFetch();
    try {
      const r = await runFeedTest(srv.url);
      assert.equal(r.ok, false);
      assert.equal(r.reason, "http_error");
      assert.equal(r.statusCode, 503);
    } finally {
      restore();
      await srv.close();
    }
  });

  it("never leaks raw error text — every reason is in the safe allowlist", async () => {
    const cases = [
      "not-a-url",
      "ftp://x/",
      "http://127.0.0.1/",
      "https://nonexistent-mougle-test.invalid/",
    ];
    for (const u of cases) {
      const r = await runFeedTest(u);
      assert.equal(r.ok, false);
      assert.ok(FEED_TEST_REASONS.includes(r.reason!), `reason ${r.reason} not allowlisted`);
      // No leaked hostname or IP from internal errors should appear in any
      // user-visible string — runFeedTest returns only the safe `reason` code.
      const json = JSON.stringify(r);
      assert.ok(!/Error:/i.test(json));
      assert.ok(!/ECONN|ENOTFOUND|EAI_/.test(json));
    }
  });
});

// --- Route enforcement (create / update / enable toggle) ------------------

interface FakeRow {
  id: string;
  name: string;
  url: string;
  type: string;
  country: string;
  language: string;
  reliabilityScore: number;
  licenseStatus: string;
  tier: string;
  enabled: boolean;
  notes?: string | null;
  lastCheckStatus?: string | null;
  lastCheckedAt?: Date | null;
  lastCheckError?: string | null;
  lastCheckItemCount?: number | null;
  lastCheckHttpStatus?: number | null;
  consecutiveFailures?: number;
}

function installFakeStorage(rows: FakeRow[]) {
  const original = {
    listNewsSources: storage.listNewsSources,
    getNewsSource: storage.getNewsSource,
    getNewsSourceByUrl: storage.getNewsSourceByUrl,
    createNewsSource: storage.createNewsSource,
    updateNewsSource: storage.updateNewsSource,
    disableNewsSource: storage.disableNewsSource,
    recordNewsSourceHealthCheck: storage.recordNewsSourceHealthCheck,
  };
  (storage as any).listNewsSources = async () => rows;
  (storage as any).getNewsSource = async (id: string) =>
    rows.find((r) => r.id === id);
  (storage as any).getNewsSourceByUrl = async (url: string) =>
    rows.find((r) => r.url === url);
  (storage as any).createNewsSource = async (data: any) => {
    const row: FakeRow = { id: `row-${rows.length + 1}`, ...data };
    rows.push(row);
    return row;
  };
  (storage as any).updateNewsSource = async (id: string, data: any) => {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error("not_found");
    Object.assign(row, data);
    return row;
  };
  (storage as any).disableNewsSource = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error("not_found");
    row.enabled = false;
    return row;
  };
  (storage as any).recordNewsSourceHealthCheck = async (
    id: string,
    data: any,
  ) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return undefined;
    row.lastCheckStatus = data.status;
    row.lastCheckedAt = new Date();
    row.lastCheckError = data.errorMessage;
    row.lastCheckItemCount = data.itemCount;
    row.lastCheckHttpStatus = data.httpStatus;
    if (data.resetFailure) row.consecutiveFailures = 0;
    else if (data.incrementFailure)
      row.consecutiveFailures = (row.consecutiveFailures ?? 0) + 1;
    return row;
  };
  return () => Object.assign(storage as any, original);
}

function rootApp() {
  const app = express();
  app.use(express.json());
  const requireRootAdmin = (_req: Request, _res: Response, next: NextFunction) =>
    next();
  registerNewsSourceRoutes(app, requireRootAdmin);
  return app;
}

async function withServer<T>(
  app: express.Express,
  fn: (port: number) => Promise<T>,
): Promise<T> {
  const server = app.listen(0);
  try {
    await new Promise((r) => server.once("listening", r));
    const port = (server.address() as AddressInfo).port;
    return await fn(port);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function callRoute(
  port: number,
  method: string,
  path: string,
  body?: any,
) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as any };
}

describe("news-source routes — enforce feed test on save/enable", () => {
  const samplePayload = (overrides: Partial<FakeRow> = {}) => ({
    name: "X",
    url: "https://nonexistent-mougle-test.invalid/feed.xml",
    type: "free",
    country: "global",
    language: "en",
    reliabilityScore: 0.5,
    licenseStatus: "public_rss",
    tier: "standard",
    enabled: true,
    ...overrides,
  });

  it("rejects creating an enabled feed when feed test fails (422 + exact shape)", async () => {
    const restore = installFakeStorage([]);
    try {
      const app = rootApp();
      await withServer(app, async (port) => {
        const r = await callRoute(port, "POST", "/api/admin/news-sources", samplePayload());
        assert.equal(r.status, 422);
        assert.equal(r.body.ok, false);
        assert.equal(r.body.error, "feed_test_failed");
        assert.ok(FEED_TEST_REASONS.includes(r.body.reason));
        assert.ok(typeof r.body.testedAt === "string");
        // No raw network error / hostname leakage in response body.
        const blob = JSON.stringify(r.body);
        assert.ok(!/ENOTFOUND|EAI_|stack/i.test(blob));
      });
    } finally {
      restore();
    }
  });

  it("allows creating a failing feed as disabled draft (200/201) and records failure", async () => {
    const rows: FakeRow[] = [];
    const restore = installFakeStorage(rows);
    try {
      const app = rootApp();
      await withServer(app, async (port) => {
        const r = await callRoute(
          port,
          "POST",
          "/api/admin/news-sources",
          samplePayload({ enabled: false }),
        );
        assert.equal(r.status, 201);
        assert.equal(r.body.ok, true);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].enabled, false);
        // Best-effort test result was persisted on the draft row.
        assert.equal(rows[0].lastCheckStatus, "error");
      });
    } finally {
      restore();
    }
  });

  it("rejects enabling a disabled feed with stale lastTestOk — always runs fresh test", async () => {
    const rows: FakeRow[] = [
      {
        id: "src-1",
        name: "Old",
        url: "https://nonexistent-mougle-test.invalid/feed.xml",
        type: "free",
        country: "global",
        language: "en",
        reliabilityScore: 0.5,
        licenseStatus: "public_rss",
        tier: "standard",
        enabled: false,
        // Stale prior success — must NOT be a bypass.
        lastCheckStatus: "ok",
        lastCheckedAt: new Date(Date.now() - 86_400_000),
        lastCheckItemCount: 10,
      },
    ];
    const restore = installFakeStorage(rows);
    try {
      const app = rootApp();
      await withServer(app, async (port) => {
        const r = await callRoute(port, "PATCH", "/api/admin/news-sources/src-1", {
          enabled: true,
        });
        assert.equal(r.status, 422);
        assert.equal(r.body.error, "feed_test_failed");
        assert.equal(rows[0].enabled, false, "row must stay disabled");
      });
    } finally {
      restore();
    }
  });

  it("rejects updating an enabled feed to a failing URL with 422", async () => {
    const rows: FakeRow[] = [
      {
        id: "src-2",
        name: "Existing",
        url: "http://127.0.0.1/originally-fine.xml",
        type: "free",
        country: "global",
        language: "en",
        reliabilityScore: 0.5,
        licenseStatus: "public_rss",
        tier: "standard",
        enabled: true,
      },
    ];
    const restore = installFakeStorage(rows);
    try {
      const app = rootApp();
      await withServer(app, async (port) => {
        const r = await callRoute(port, "PATCH", "/api/admin/news-sources/src-2", {
          url: "https://nonexistent-mougle-test.invalid/feed.xml",
        });
        assert.equal(r.status, 422);
        assert.equal(r.body.error, "feed_test_failed");
        assert.equal(
          rows[0].url,
          "http://127.0.0.1/originally-fine.xml",
          "URL must not be updated on failed test",
        );
      });
    } finally {
      restore();
    }
  });

  it("enables a disabled feed when fresh feed test passes (success path)", async () => {
    const srv = await startHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(VALID_RSS);
    });
    const rows: FakeRow[] = [
      {
        id: "src-3",
        name: "Will enable",
        url: srv.url,
        type: "free",
        country: "global",
        language: "en",
        reliabilityScore: 0.5,
        licenseStatus: "public_rss",
        tier: "standard",
        enabled: false,
      },
    ];
    const restore = installFakeStorage(rows);
    const restoreFetch = allowLocalFetch();
    try {
      const app = rootApp();
      await withServer(app, async (port) => {
        const r = await callRoute(port, "PATCH", "/api/admin/news-sources/src-3", {
          enabled: true,
        });
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.equal(rows[0].enabled, true);
        assert.equal(rows[0].lastCheckStatus, "ok");
      });
    } finally {
      restoreFetch();
      restore();
      await srv.close();
    }
  });
});
