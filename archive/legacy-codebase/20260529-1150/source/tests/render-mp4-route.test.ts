import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";
import { createServer, type Server } from "http";
import express from "express";
import { createPreviewMp4Handler } from "../server/services/render-srt-service";

const RENDER_DIR = resolve(process.cwd(), ".local/media-assets/render");
const VALID_FILENAME = "rj_999_test_route.mp4";
const VALID_LOCAL_PATH = resolve(RENDER_DIR, VALID_FILENAME);
const MP4_BODY = Buffer.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
]);

type FakeJob = { previewMetadata?: { renderBaseline?: { mp4Artifact?: any } } };

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
    [1, { previewMetadata: { renderBaseline: { mp4Artifact: { storageKey: `renders/${VALID_FILENAME}` } } } }],
    [2, { previewMetadata: { renderBaseline: { mp4Artifact: { storageKey: "renders/rj_2_missing.mp4" } } } }],
    [3, { previewMetadata: { renderBaseline: { mp4Artifact: { storageKey: "renders/../../../etc/passwd" } } } }],
    [4, { previewMetadata: { renderBaseline: { mp4Artifact: { storageKey: "renders/rj_4_evil.srt" } } } }],
    [5, { previewMetadata: { renderBaseline: {} } }],
  ]);
}

function buildApp() {
  const app = express();
  const jobs = buildJobs();
  // Stubbed admin auth — emulates requireRootAdmin by always allowing in tests
  app.use((_req, _res, next) => next());
  app.get(
    "/api/admin/video-render/jobs/:id/preview.mp4",
    createPreviewMp4Handler({
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
  writeFileSync(VALID_LOCAL_PATH, MP4_BODY);

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

describe("GET /api/admin/video-render/jobs/:id/preview.mp4 (real HTTP)", () => {
  it("returns 400 when storageKey resolves to a path-traversal filename", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/3/preview.mp4`);
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.match(body.message, /Invalid preview filename/);
  });

  it("returns 400 when storageKey points to a non-mp4 extension", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/4/preview.mp4`);
    assert.equal(r.status, 400);
  });

  it("returns 400 when the route :id param is not a number", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/not-an-int/preview.mp4`);
    assert.equal(r.status, 400);
  });

  it("returns 404 when the job has no mp4 artifact", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/5/preview.mp4`);
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.match(body.message, /not generated yet/);
  });

  it("returns 404 when the mp4 file is missing on disk", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/2/preview.mp4`);
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.match(body.message, /missing on disk/);
  });

  it("returns 404 when the job itself does not exist", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/9999/preview.mp4`);
    assert.equal(r.status, 404);
  });

  it("returns 200 inline by default with proper headers and body", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/1/preview.mp4`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "video/mp4");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-admin-only-stream"), "1");
    assert.equal(r.headers.get("accept-ranges"), "bytes");
    assert.equal(r.headers.get("content-length"), String(MP4_BODY.length));
    assert.equal(
      r.headers.get("content-disposition"),
      `inline; filename="${VALID_FILENAME}"`,
    );
    const buf = Buffer.from(await r.arrayBuffer());
    assert.deepEqual(buf, MP4_BODY);
  });

  it("returns 200 with attachment disposition when ?download=1", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/1/preview.mp4?download=1`);
    assert.equal(r.status, 200);
    assert.equal(
      r.headers.get("content-disposition"),
      `attachment; filename="${VALID_FILENAME}"`,
    );
    const buf = Buffer.from(await r.arrayBuffer());
    assert.deepEqual(buf, MP4_BODY);
  });

  it("returns 206 with Content-Range for byte-range requests", async () => {
    const r = await fetch(`${baseUrl}/api/admin/video-render/jobs/1/preview.mp4`, {
      headers: { Range: "bytes=0-7" },
    });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get("content-range"), `bytes 0-7/${MP4_BODY.length}`);
    assert.equal(r.headers.get("content-length"), "8");
    const buf = Buffer.from(await r.arrayBuffer());
    assert.deepEqual(buf, MP4_BODY.subarray(0, 8));
  });
});

describe("requireRootAdmin gate on preview.mp4 route", () => {
  // Verifies the auth middleware contract by mounting createPreviewMp4Handler
  // behind a deny-all middleware that mimics requireRootAdmin rejecting an
  // unauthenticated request. This catches regressions where the route is
  // accidentally registered without an admin guard.
  let denyServer: Server;
  let denyBaseUrl: string;

  before(async () => {
    const app = express();
    app.use("/api/admin", (_req, res, _next) => res.status(401).json({ message: "Unauthorized" }));
    app.get(
      "/api/admin/video-render/jobs/:id/preview.mp4",
      createPreviewMp4Handler({ getJob: async () => null }),
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
    const r = await fetch(`${denyBaseUrl}/api/admin/video-render/jobs/1/preview.mp4`);
    assert.equal(r.status, 401);
  });
});
