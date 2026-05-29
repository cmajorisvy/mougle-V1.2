import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
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

// Minimal 1x1 PNG (transparent).
const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000100" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
);

describe("saved-cover re-crop flow: cover-proxy + overwrite upload", () => {
  let app: express.Express;
  let appServer: Server;
  let appUrl: string;

  // Upstream mock server used by the proxy.
  let upstream: Server;
  let upstreamUrl: string;
  let upstreamMode: "image" | "html" | "error" = "image";

  // Temp PRIVATE_OBJECT_DIR + service patches.
  let tmpRoot: string;
  let prevPrivateDir: string | undefined;
  const broadcastsStore = new Map<string, any>();
  const origGet = broadcastCompositorService.getBroadcast;
  const origUpdate = broadcastCompositorService.updateBroadcastMeta;

  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "cover-recrop-"));
    prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;

    // Patch the service so we don't touch the real DB.
    broadcastsStore.set("bc-test-1", {
      id: "bc-test-1",
      title: "Test",
      coverImageUrl: null,
    });
    (broadcastCompositorService as any).getBroadcast = async (id: string) =>
      broadcastsStore.get(id) ?? null;
    (broadcastCompositorService as any).updateBroadcastMeta = async (
      id: string,
      patch: { title?: string | null; coverImageUrl?: string | null },
    ) => {
      const row = broadcastsStore.get(id);
      if (!row) return null;
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.coverImageUrl !== undefined) row.coverImageUrl = patch.coverImageUrl;
      broadcastsStore.set(id, row);
      return row;
    };

    upstream = createServer((req, res) => {
      if (upstreamMode === "image") {
        res.setHeader("Content-Type", "image/png");
        res.end(PNG_BYTES);
      } else if (upstreamMode === "html") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end("<html>not an image</html>");
      } else {
        res.statusCode = 500;
        res.end("boom");
      }
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    const uaddr = upstream.address();
    if (!uaddr || typeof uaddr === "string") throw new Error("no upstream address");
    upstreamUrl = `http://127.0.0.1:${uaddr.port}`;

    app = express();
    app.use(fakeRootAdmin);
    registerBroadcastRoutes(app, (_req, _res, next) => next());
    ({ server: appServer, baseUrl: appUrl } = await listen(app));
  });

  after(async () => {
    await Promise.all([
      new Promise<void>((r) => appServer.close(() => r())),
      new Promise<void>((r) => upstream.close(() => r())),
    ]);
    (broadcastCompositorService as any).getBroadcast = origGet;
    (broadcastCompositorService as any).updateBroadcastMeta = origUpdate;
    if (prevPrivateDir === undefined) {
      delete process.env.PRIVATE_OBJECT_DIR;
    } else {
      process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
    }
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("cover-proxy streams an http upstream image with image content-type", async () => {
    upstreamMode = "image";
    const target = encodeURIComponent(`${upstreamUrl}/cover.png`);
    const r = await fetch(`${appUrl}/api/admin/broadcasts/cover-proxy?url=${target}`);
    assert.equal(r.status, 200);
    assert.equal((r.headers.get("content-type") || "").split(";")[0].trim(), "image/png");
    const body = Buffer.from(await r.arrayBuffer());
    assert.equal(body.length, PNG_BYTES.length);
    assert.ok(body.equals(PNG_BYTES));
  });

  it("cover-proxy rejects upstreams whose content-type is not image/*", async () => {
    upstreamMode = "html";
    const target = encodeURIComponent(`${upstreamUrl}/page.html`);
    const r = await fetch(`${appUrl}/api/admin/broadcasts/cover-proxy?url=${target}`);
    assert.equal(r.status, 415);
    const body = (await r.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "not_an_image");
  });

  it("re-uploading a cropped cover overwrites the previous file and refreshes the cache-buster", async () => {
    const coversDir = pathResolve(tmpRoot, "broadcasts", "covers");

    // First upload: PNG bytes.
    const form1 = new FormData();
    form1.append(
      "file",
      new Blob([PNG_BYTES], { type: "image/png" }),
      "cover.png",
    );
    const r1 = await fetch(`${appUrl}/api/admin/broadcasts/bc-test-1/cover/upload`, {
      method: "POST",
      body: form1,
    });
    assert.equal(r1.status, 200);
    const body1 = (await r1.json()) as {
      ok: boolean;
      coverImageUrl: string;
      broadcast: { coverImageUrl: string };
    };
    assert.equal(body1.ok, true);
    assert.match(body1.coverImageUrl, /^\/api\/public\/broadcasts\/bc-test-1\/cover\?v=\d+$/);
    const firstUrl = body1.coverImageUrl;
    const firstV = Number(firstUrl.split("v=")[1]);
    assert.equal(body1.broadcast.coverImageUrl, firstUrl);

    // File should exist on disk with original bytes.
    const firstPath = pathResolve(coversDir, "bc-test-1.png");
    assert.ok(existsSync(firstPath), "expected first cover file on disk");
    assert.ok(readFileSync(firstPath).equals(PNG_BYTES));

    // Re-upload with different bytes (mimic the re-crop overwrite).
    const recroppedBytes = Buffer.concat([PNG_BYTES, Buffer.from([0x00, 0x11, 0x22, 0x33])]);
    // Wait long enough that Date.now() advances past the previous cache-buster value.
    await new Promise((r) => setTimeout(r, 5));
    const form2 = new FormData();
    form2.append(
      "file",
      new Blob([recroppedBytes], { type: "image/png" }),
      "cover.png",
    );
    const r2 = await fetch(`${appUrl}/api/admin/broadcasts/bc-test-1/cover/upload`, {
      method: "POST",
      body: form2,
    });
    assert.equal(r2.status, 200);
    const body2 = (await r2.json()) as {
      ok: boolean;
      coverImageUrl: string;
      broadcast: { coverImageUrl: string };
    };
    assert.equal(body2.ok, true);
    const secondUrl = body2.coverImageUrl;
    const secondV = Number(secondUrl.split("v=")[1]);
    assert.notEqual(secondUrl, firstUrl, "cache-buster URL must change after re-upload");
    assert.ok(secondV > firstV, "cache-buster must advance");
    assert.equal(body2.broadcast.coverImageUrl, secondUrl);

    // Same path, but now contains the new (overwritten) bytes.
    assert.ok(existsSync(firstPath), "re-upload must overwrite at the same path");
    assert.ok(
      readFileSync(firstPath).equals(recroppedBytes),
      "file contents must match the re-cropped upload",
    );

    // Exactly one cover file for this broadcast remains in the covers dir.
    const remaining = readdirSync(coversDir).filter((n) => n.startsWith("bc-test-1."));
    assert.deepEqual(remaining, ["bc-test-1.png"]);
  });
});
