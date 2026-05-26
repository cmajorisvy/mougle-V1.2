import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve as pathResolve, join } from "node:path";
import express from "express";

import { registerBroadcastRoutes } from "../server/routes/broadcasts";
import { broadcastCompositorService } from "../server/services/broadcast-compositor-service";

function fakeRootAdmin(req: any, _res: any, next: any) {
  req.session = {
    isAdmin: true,
    adminActorType: "root_admin",
    adminRole: "super_admin",
    adminPermissions: ["*"],
    adminActorId: "test-root",
  };
  next();
}

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe("POST /api/admin/broadcasts/media/sweep orphan reconciliation", () => {
  let appServer: Server;
  let appUrl: string;
  let tmpRoot: string;
  let mediaDir: string;
  let prevPrivateDir: string | undefined;
  const origList = broadcastCompositorService.listBroadcastMediaBasenames;

  const KEEP_MP4 = "bc-keep-1.mp4";
  const KEEP_MANIFEST = "bc-keep-1.manifest.json";
  const ORPHAN_FILES = ["bc-orphan-a.mp4", "bc-orphan-b.manifest.json"];
  const KEEP_FILES = [KEEP_MP4, KEEP_MANIFEST];
  // Files the sweep must ignore entirely (wrong extension / random noise).
  const DISALLOWED_FILES = ["README.md", "bc-orphan-c.exe", "stray.txt"];

  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "media-sweep-"));
    prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;
    mediaDir = pathResolve(tmpRoot, "broadcasts");
    mkdirSync(mediaDir, { recursive: true });

    for (const name of [...ORPHAN_FILES, ...KEEP_FILES, ...DISALLOWED_FILES]) {
      writeFileSync(pathResolve(mediaDir, name), Buffer.from("xx"));
    }

    (broadcastCompositorService as any).listBroadcastMediaBasenames = async () => ({
      mp4: new Set<string>([KEEP_MP4]),
      manifest: new Set<string>([KEEP_MANIFEST]),
    });

    const app = express();
    app.use(express.json());
    app.use(fakeRootAdmin);
    registerBroadcastRoutes(app, (_req, _res, next) => next());
    ({ server: appServer, baseUrl: appUrl } = await listen(app));
  });

  after(async () => {
    await new Promise<void>((r) => appServer.close(() => r()));
    (broadcastCompositorService as any).listBroadcastMediaBasenames = origList;
    if (prevPrivateDir === undefined) {
      delete process.env.PRIVATE_OBJECT_DIR;
    } else {
      process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
    }
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  type SweepBody = {
    ok: boolean;
    dryRun?: boolean;
    orphanCount: number;
    removed?: number;
    bytesRemoved?: number;
    orphans: { file: string; kind: "mp4" | "manifest"; bytes: number }[];
    confirmToken?: string;
    confirmTokenTtlMs?: number;
    error?: string;
    message?: string;
  };

  async function dryRun(): Promise<SweepBody> {
    const r = await fetch(`${appUrl}/api/admin/broadcasts/media/sweep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 200);
    return (await r.json()) as SweepBody;
  }

  async function apply(
    body: Record<string, unknown>,
  ): Promise<{ status: number; body: SweepBody }> {
    const r = await fetch(`${appUrl}/api/admin/broadcasts/media/sweep?apply=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json()) as SweepBody };
  }

  it("dry-run reports only mp4/manifest orphans, returns a confirm token, and deletes nothing", async () => {
    const body = await dryRun();
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.removed, 0);

    const reportedFiles = body.orphans.map((o) => o.file).sort();
    assert.deepEqual(reportedFiles, [...ORPHAN_FILES].sort());
    assert.equal(body.orphanCount, ORPHAN_FILES.length);
    assert.ok(
      body.confirmToken && /^\d+\.[a-f0-9]+$/.test(body.confirmToken),
      "dry-run returns a confirm token",
    );
    assert.ok((body.confirmTokenTtlMs ?? 0) > 0, "dry-run returns a token TTL");

    const onDisk = readdirSync(mediaDir).sort();
    const expected = [...ORPHAN_FILES, ...KEEP_FILES, ...DISALLOWED_FILES].sort();
    assert.deepEqual(onDisk, expected, "dry-run must not delete anything");
  });

  it("apply=1 without a confirm token is rejected and deletes nothing", async () => {
    const { status, body } = await apply({});
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error, "missing_confirm_token");
    assert.ok(body.confirmToken, "rejection response includes a fresh token");

    for (const name of ORPHAN_FILES) {
      assert.ok(
        existsSync(pathResolve(mediaDir, name)),
        `orphan ${name} must still exist after rejected apply`,
      );
    }
  });

  it("apply=1 with a malformed token is rejected", async () => {
    const { status, body } = await apply({ confirmToken: "not-a-token" });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_confirm_token");
  });

  it("apply=1 is rejected when the orphan list changed between dry-run and apply", async () => {
    const stale = await dryRun();
    assert.ok(stale.confirmToken);

    // Simulate the orphan set changing: a previously-orphan mp4 is now
    // claimed by a real broadcast row.
    (broadcastCompositorService as any).listBroadcastMediaBasenames = async () => ({
      mp4: new Set<string>([KEEP_MP4, "bc-orphan-a.mp4"]),
      manifest: new Set<string>([KEEP_MANIFEST]),
    });
    try {
      const { status, body } = await apply({ confirmToken: stale.confirmToken });
      assert.equal(status, 409);
      assert.equal(body.ok, false);
      assert.equal(body.error, "orphan_set_changed");
      assert.ok(body.confirmToken && body.confirmToken !== stale.confirmToken);

      for (const name of ORPHAN_FILES) {
        assert.ok(
          existsSync(pathResolve(mediaDir, name)),
          `orphan ${name} must remain after rejected apply`,
        );
      }
    } finally {
      (broadcastCompositorService as any).listBroadcastMediaBasenames = async () => ({
        mp4: new Set<string>([KEEP_MP4]),
        manifest: new Set<string>([KEEP_MANIFEST]),
      });
    }
  });

  it("apply=1 with a matching confirm token deletes only orphan mp4/manifest files", async () => {
    const fresh = await dryRun();
    assert.ok(fresh.confirmToken);

    const { status, body } = await apply({ confirmToken: fresh.confirmToken });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, false);
    assert.equal(body.orphanCount, ORPHAN_FILES.length);
    assert.equal(body.removed, ORPHAN_FILES.length);

    for (const name of ORPHAN_FILES) {
      assert.equal(
        existsSync(pathResolve(mediaDir, name)),
        false,
        `orphan ${name} must be deleted`,
      );
    }
    for (const name of KEEP_FILES) {
      assert.ok(
        existsSync(pathResolve(mediaDir, name)),
        `referenced file ${name} must remain`,
      );
    }
    for (const name of DISALLOWED_FILES) {
      assert.ok(
        existsSync(pathResolve(mediaDir, name)),
        `non-mp4/non-manifest file ${name} must remain`,
      );
    }
  });
});
