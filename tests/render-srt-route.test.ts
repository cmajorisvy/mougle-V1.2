import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";
import { createServer, type Server } from "http";
import express from "express";
import { createCaptionsSrtHandler } from "../server/services/render-srt-service";

const RENDER_DIR = resolve(process.cwd(), ".local/media-assets/render");
const VALID_FILENAME = "rj_999_test_route.srt";
const VALID_LOCAL_PATH = resolve(RENDER_DIR, VALID_FILENAME);
const SRT_BODY = "1\n00:00:00,000 --> 00:00:01,000\nhello route\n";

type FakeJob = { previewMetadata?: { renderBaseline?: { captionsArtifact?: any } } };

async function closeHttpServer(s: Server): Promise<void> {
  await new Promise<void>((resolveClose) => {
    s.close(() => resolveClose());
    s.closeAllConnections?.();
    s.closeIdleConnections?.();
  });
  await new Promise((resolveTick) => setImmediate(resolveTick));
}

function buildJobs(): Map<number, FakeJob> {
  return new Map<number, FakeJob>([
    [1, { previewMetadata: { renderBaseline: { captionsArtifact: { storageKey: `renders/${VALID_FILENAME}` } } } }],
    [2, { previewMetadata: { renderBaseline: { captionsArtifact: { storageKey: "renders/rj_2_missing.srt" } } } }],
    [3, { previewMetadata: { renderBaseline: { captionsArtifact: { storageKey: "renders/../../../etc/passwd" } } } }],
    [4, { previewMetadata: { renderBaseline: { captionsArtifact: { storageKey: "renders/rj_4_evil.mp4" } } } }],
    [5, { previewMetadata: { renderBaseline: {} } }],
  ]);
}

function buildApp() {
  const app = express();
  const jobs = buildJobs();
  // Stubbed admin auth — emulates requireRootAdmin by always allowing in tests
  app.use((_req, _res, next) => next());
  app.get(
    "/api/admin/video-render/jobs/:id/captions.srt",
    createCaptionsSrtHandler({
      getJob: async (id: number) => jobs.get(id) ?? null,
      onError: (res, err) => res.status(500).json({ message: (err as Error)?.message || "err" }),
    }),
  );
  return app;
}

let server: Server;
let baseUrl: string;

before(async () => {
  mkdirSync(RENDER_DIR, { recursive: true });
  writeFileSync(VALID_LOCAL_PATH, SRT_BODY, "utf8");

  const app = buildApp();
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await closeHttpServer(server);
  if (existsSync(VALID_LOCAL_PATH)) unlinkSync(VALID_LOCAL_PATH);
});

describe("GET /api/admin/video-render/jobs/:id/captions.srt (real HTTP)", () => {
  it("returns 400 when storageKey resolves to a path-traversal filename", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/3/captions.srt`);
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.match(body.message, /Invalid captions filename/);
  });

  it("returns 400 when storageKey points to a non-srt extension", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/4/captions.srt`);
    assert.equal(r.status, 400);
  });

  it("returns 400 when the route :id param is not a number", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/not-an-int/captions.srt`);
    assert.equal(r.status, 400);
  });

  it("returns 404 when the job has no captions artifact", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/5/captions.srt`);
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.match(body.message, /not generated yet/);
  });

  it("returns 404 when the captions file is missing on disk", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/2/captions.srt`);
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.match(body.message, /missing on disk/);
  });

  it("returns 404 when the job itself does not exist", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/9999/captions.srt`);
    assert.equal(r.status, 404);
  });

  it("returns 200 with proper headers and body when artifact + file exist", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/1/captions.srt`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/x-subrip; charset=utf-8");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-admin-only-stream"), "1");
    assert.equal(
      r.headers.get("content-disposition"),
      `attachment; filename="${VALID_FILENAME}"`,
    );
    const text = await r.text();
    assert.equal(text, SRT_BODY);
  });
});

describe("requireRootAdmin gate on captions.srt route", () => {
  // Verifies the auth middleware contract by mounting createCaptionsSrtHandler
  // behind a deny-all middleware that mimics requireRootAdmin rejecting an
  // unauthenticated request. This catches regressions where the route is
  // accidentally registered without an admin guard.
  let denyServer: Server;
  let denyBaseUrl: string;

  before(async () => {
    const app = express();
    app.use("/api/admin", (_req, res, _next) => res.status(401).json({ message: "Unauthorized" }));
    app.get(
      "/api/admin/video-render/jobs/:id/captions.srt",
      createCaptionsSrtHandler({ getJob: async () => null }),
    );
    denyServer = createServer(app);
    await new Promise<void>((r) => denyServer.listen(0, "127.0.0.1", r));
    const addr = denyServer.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    denyBaseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await closeHttpServer(denyServer);
  });

  it("returns 401 when the admin middleware rejects the request", async () => {
    const r = await fetch(`${denyBaseUrl}/api/admin/video-render/jobs/1/captions.srt`);
    assert.equal(r.status, 401);
  });
});
