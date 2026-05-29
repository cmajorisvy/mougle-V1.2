import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { requireRootAdmin } from "../server/middleware/admin-auth";
import { createCaptionsSrtHandler } from "../server/services/render-srt-service";

function fakeSession(spec: { kind: "none" | "user" | "staff" | "root" }) {
  return (req: any, _res: any, next: any) => {
    if (spec.kind === "none") {
      req.session = {};
    } else if (spec.kind === "user") {
      req.session = { userId: "u-1" };
    } else if (spec.kind === "staff") {
      req.session = {
        isAdmin: true,
        adminActorType: "staff",
        adminRole: "support",
        adminPermissions: ["support:view"],
        adminActorId: "staff-1",
      };
    } else if (spec.kind === "root") {
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

const noop = async (_req: any, res: any) => res.status(200).json({ ok: true });

function buildApp(sessionKind: "none" | "user" | "staff" | "root") {
  const app = express();
  app.use(fakeSession({ kind: sessionKind }));
  // Mirror the real route registrations from server/routes.ts:
  // every admin video-render download/control endpoint must be guarded by requireRootAdmin.
  app.get(
    "/api/admin/video-render/jobs/:id/captions.srt",
    requireRootAdmin,
    createCaptionsSrtHandler({ getJob: async () => null }),
  );
  app.get("/api/admin/video-render/jobs/:id/preview.mp4", requireRootAdmin, noop);
  app.post("/api/admin/video-render/jobs/:id/preview", requireRootAdmin, noop);
  app.post("/api/admin/video-render/jobs/:id/render", requireRootAdmin, noop);
  app.post("/api/admin/video-render/jobs/:id/cancel", requireRootAdmin, noop);
  app.get("/api/admin/video-render/jobs/:id", requireRootAdmin, noop);
  return app;
}

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

const ADMIN_DOWNLOAD_ROUTES: Array<{ method: "GET" | "POST"; path: string }> = [
  { method: "GET", path: "/api/admin/video-render/jobs/1/captions.srt" },
  { method: "GET", path: "/api/admin/video-render/jobs/1/preview.mp4" },
  { method: "GET", path: "/api/admin/video-render/jobs/1" },
  { method: "POST", path: "/api/admin/video-render/jobs/1/preview" },
  { method: "POST", path: "/api/admin/video-render/jobs/1/render" },
  { method: "POST", path: "/api/admin/video-render/jobs/1/cancel" },
];

describe("Admin-only video-render routes block non-admins (real requireRootAdmin)", () => {
  let unauthServer: Server;
  let unauthUrl: string;
  let userServer: Server;
  let userUrl: string;
  let staffServer: Server;
  let staffUrl: string;
  let rootServer: Server;
  let rootUrl: string;

  before(async () => {
    ({ server: unauthServer, baseUrl: unauthUrl } = await listen(buildApp("none")));
    ({ server: userServer, baseUrl: userUrl } = await listen(buildApp("user")));
    ({ server: staffServer, baseUrl: staffUrl } = await listen(buildApp("staff")));
    ({ server: rootServer, baseUrl: rootUrl } = await listen(buildApp("root")));
  });

  after(async () => {
    await Promise.all([
      new Promise<void>((r) => unauthServer.close(() => r())),
      new Promise<void>((r) => userServer.close(() => r())),
      new Promise<void>((r) => staffServer.close(() => r())),
      new Promise<void>((r) => rootServer.close(() => r())),
    ]);
  });

  for (const route of ADMIN_DOWNLOAD_ROUTES) {
    it(`returns 401 for unauthenticated ${route.method} ${route.path}`, async () => {
      const r = await fetch(`${unauthUrl}${route.path}`, { method: route.method });
      assert.equal(r.status, 401, `expected 401 for ${route.method} ${route.path}`);
      const body = await r.json();
      assert.equal(body.message, "Unauthorized");
    });

    it(`returns 401 for logged-in non-admin user on ${route.method} ${route.path}`, async () => {
      const r = await fetch(`${userUrl}${route.path}`, { method: route.method });
      assert.equal(r.status, 401, `expected 401 for ${route.method} ${route.path}`);
    });

    it(`returns 403 for non-root admin (staff session) on ${route.method} ${route.path}`, async () => {
      const r = await fetch(`${staffUrl}${route.path}`, { method: route.method });
      assert.equal(r.status, 403, `expected 403 for ${route.method} ${route.path}`);
      const body = await r.json();
      assert.equal(body.message, "Forbidden");
    });

    it(`allows root admin past the guard on ${route.method} ${route.path}`, async () => {
      const r = await fetch(`${rootUrl}${route.path}`, { method: route.method });
      // Past the guard the handler should respond with something other than 401/403.
      assert.notEqual(r.status, 401, `root admin unexpectedly got 401 on ${route.method} ${route.path}`);
      assert.notEqual(r.status, 403, `root admin unexpectedly got 403 on ${route.method} ${route.path}`);
    });
  }
});

describe("server/routes.ts wires requireRootAdmin on every admin video-render route", () => {
  // Static safety net: catches a regression where a sibling /api/admin/video-render
  // route is added without requireRootAdmin in server/routes.ts itself.
  it("each registered /api/admin/video-render route includes requireRootAdmin", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const source = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

    const routeRegex =
      /app\.(get|post|put|patch|delete)\(\s*(["'`])(\/api\/admin\/video-render[^"'`]*)\2\s*,([\s\S]*?)\)/g;
    const offenders: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = routeRegex.exec(source)) !== null) {
      const [, method, , path, tail] = m;
      // Look only at the immediate middleware list (up to the next ");" / handler arrow).
      const head = tail.split("=>")[0];
      if (!head.includes("requireRootAdmin")) {
        offenders.push(`${method.toUpperCase()} ${path}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Found /api/admin/video-render routes without requireRootAdmin: ${offenders.join(", ")}`,
    );
  });
});
