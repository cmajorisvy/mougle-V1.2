import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import {
  requireRootAdmin,
  requireAnyAdminPermission,
} from "../server/middleware/admin-auth";
import { csrfMiddleware } from "../server/middleware/csrf";

// Per server/routes.ts:
//  - POST /api/news/trigger uses requireAnyAdminPermission(CONTENT_MANAGE_PERMISSIONS)
//  - POST /api/admin/news-to-debate/generate uses requireRootAdmin
//  - POST /api/admin/podcast-scripts/generate uses requireRootAdmin
const CONTENT_MANAGE_PERMISSIONS = ["content:manage", "news:manage"] as const;

type SessionKind = "none" | "staff-no-perm" | "staff-with-perm" | "root";

function fakeSession(kind: SessionKind) {
  return (req: any, _res: any, next: any) => {
    if (kind === "none") {
      req.session = {};
    } else if (kind === "staff-no-perm") {
      req.session = {
        isAdmin: true,
        adminActorType: "staff",
        adminRole: "support",
        adminPermissions: ["support:view"],
        adminActorId: "staff-1",
      };
    } else if (kind === "staff-with-perm") {
      req.session = {
        isAdmin: true,
        adminActorType: "staff",
        adminRole: "content_editor",
        adminPermissions: ["content:manage"],
        adminActorId: "staff-2",
      };
    } else {
      req.session = {
        isAdmin: true,
        adminActorType: "root_admin",
        adminRole: "super_admin",
        adminPermissions: ["*"],
        adminActorId: "env-root-admin",
      };
    }
    next();
  };
}

function buildApp(sessionKind: SessionKind) {
  const app = express();
  app.use(express.json());
  app.use(fakeSession(sessionKind));
  // Mirror real routes from server/routes.ts with the REAL middleware imports.
  app.post(
    "/api/news/trigger",
    requireAnyAdminPermission(CONTENT_MANAGE_PERMISSIONS),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  app.post(
    "/api/admin/news-to-debate/generate",
    requireRootAdmin,
    (_req, res) => res.status(200).json({ ok: true }),
  );
  app.post(
    "/api/admin/podcast-scripts/generate",
    requireRootAdmin,
    (_req, res) => res.status(200).json({ ok: true }),
  );
  return app;
}

async function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

async function post(base: string, p: string) {
  const res = await fetch(`${base}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const ROUTES = [
  "/api/news/trigger",
  "/api/admin/news-to-debate/generate",
  "/api/admin/podcast-scripts/generate",
] as const;

describe("admin POST auth ordering — real middleware from server/middleware/admin-auth.ts", () => {
  describe("anonymous => 401 on every flagged route (not 403)", () => {
    let ctx: { server: Server; base: string };
    before(async () => { ctx = await listen(buildApp("none")); });
    after(async () => { await new Promise<void>((r) => ctx.server.close(() => r())); });

    for (const route of ROUTES) {
      it(`POST ${route} returns 401 for unauthenticated`, async () => {
        const { status, body } = await post(ctx.base, route);
        assert.equal(status, 401, `${route} expected 401, got ${status}`);
        assert.equal(body.message, "Unauthorized");
      });
    }
  });

  describe("authenticated staff WITHOUT required permission/role => 403", () => {
    let ctx: { server: Server; base: string };
    before(async () => { ctx = await listen(buildApp("staff-no-perm")); });
    after(async () => { await new Promise<void>((r) => ctx.server.close(() => r())); });

    for (const route of ROUTES) {
      it(`POST ${route} returns 403 for staff missing perm/role`, async () => {
        const { status, body } = await post(ctx.base, route);
        assert.equal(status, 403, `${route} expected 403, got ${status}`);
        assert.equal(body.message, "Forbidden");
      });
    }
  });

  describe("authenticated staff WITH content:manage permission", () => {
    let ctx: { server: Server; base: string };
    before(async () => { ctx = await listen(buildApp("staff-with-perm")); });
    after(async () => { await new Promise<void>((r) => ctx.server.close(() => r())); });

    it("POST /api/news/trigger => 200 (requireAnyAdminPermission accepts content:manage)", async () => {
      const { status } = await post(ctx.base, "/api/news/trigger");
      assert.equal(status, 200);
    });
    it("POST /api/admin/news-to-debate/generate => 403 (requireRootAdmin rejects staff)", async () => {
      const { status } = await post(ctx.base, "/api/admin/news-to-debate/generate");
      assert.equal(status, 403);
    });
    it("POST /api/admin/podcast-scripts/generate => 403 (requireRootAdmin rejects staff)", async () => {
      const { status } = await post(ctx.base, "/api/admin/podcast-scripts/generate");
      assert.equal(status, 403);
    });
  });

  describe("root admin => 200 on every flagged route", () => {
    let ctx: { server: Server; base: string };
    before(async () => { ctx = await listen(buildApp("root")); });
    after(async () => { await new Promise<void>((r) => ctx.server.close(() => r())); });

    for (const route of ROUTES) {
      it(`POST ${route} returns 200 for root admin`, async () => {
        const { status } = await post(ctx.base, route);
        assert.equal(status, 200);
      });
    }
  });
});

describe("CSRF precedence — locks in the incident explanation", () => {
  // The production app mounts csrfMiddleware on /api BEFORE any admin/permission
  // middleware (see server/index.ts: app.use('/api', csrfMiddleware)). So an
  // anonymous POST without a CSRF token will short-circuit at 403 from CSRF —
  // NOT from the admin-permission middleware. This test pins that behaviour so
  // the next operator who sees a 403 on an unauthenticated POST knows it's CSRF.
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    // Memory session shim so csrfMiddleware can read/write req.session.csrfToken.
    const sessions = new Map<string, any>();
    app.use((req: any, _res: any, next: any) => {
      const sid = (req.headers["x-test-sid"] as string) || "default";
      if (!sessions.has(sid)) sessions.set(sid, {});
      req.session = sessions.get(sid);
      next();
    });
    app.use("/api", csrfMiddleware);
    // Even without admin gate, CSRF should fire first on unsafe methods.
    app.post(
      "/api/news/trigger",
      requireAnyAdminPermission(CONTENT_MANAGE_PERMISSIONS),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    ({ server, base } = await listen(app));
  });
  after(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it("POST without csrf token returns 403 'Invalid CSRF token' (NOT 401)", async () => {
    const res = await fetch(`${base}/api/news/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-sid": "a" },
      body: "{}",
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.message, "Invalid CSRF token");
  });

  it("POST with valid csrf token but no admin session returns 401 (admin gate now reachable)", async () => {
    // Prime: GET to mint a csrf token in the session.
    const primeRes = await fetch(`${base}/api/news/trigger`, {
      method: "GET",
      headers: { "x-test-sid": "b" },
    });
    const token = primeRes.headers.get("x-csrf-token");
    assert.ok(token, "expected X-CSRF-Token header");

    const res = await fetch(`${base}/api/news/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-sid": "b",
        "x-csrf-token": token!,
      },
      body: "{}",
    });
    assert.equal(res.status, 401, "with valid CSRF, admin gate should report 401");
    const body = await res.json();
    assert.equal(body.message, "Unauthorized");
  });
});

describe("cinema-control route alias (App.tsx)", () => {
  const appSourcePath = path.join(process.cwd(), "client/src/App.tsx");
  const source = fs.readFileSync(appSourcePath, "utf8");

  it("/admin/4d-cinema-control -> CinemaControl (original, preserved)", () => {
    assert.match(
      source,
      /<Route\s+path="\/admin\/4d-cinema-control"\s+component=\{CinemaControl\}\s*\/>/,
    );
  });

  it("/admin/cinema-control -> CinemaControl (alias)", () => {
    assert.match(
      source,
      /<Route\s+path="\/admin\/cinema-control"\s+component=\{CinemaControl\}\s*\/>/,
    );
  });

  it("CinemaControl is imported exactly once (single component, two routes)", () => {
    const importMatches = source.match(
      /import\s+CinemaControl\s+from\s+["']@\/pages\/admin\/CinemaControl["'];?/g,
    ) || [];
    assert.equal(importMatches.length, 1);
  });
});
