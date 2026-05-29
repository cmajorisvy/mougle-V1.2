import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
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

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000100" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
);

describe("PATCH /api/admin/broadcasts/:id cover-clear filesystem cleanup", () => {
  let app: express.Express;
  let appServer: Server;
  let appUrl: string;

  let tmpRoot: string;
  let prevPrivateDir: string | undefined;
  const broadcastsStore = new Map<string, any>();
  const origGet = broadcastCompositorService.getBroadcast;
  const origUpdate = broadcastCompositorService.updateBroadcastMeta;

  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "cover-clear-"));
    prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;

    broadcastsStore.set("bc-clear-1", {
      id: "bc-clear-1",
      title: "Clear Test",
      coverImageUrl: null,
    });
    broadcastsStore.set("bc-clear-2", {
      id: "bc-clear-2",
      title: "Keep Test",
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

    app = express();
    app.use(express.json());
    app.use(fakeRootAdmin);
    registerBroadcastRoutes(app, (_req, _res, next) => next());
    ({ server: appServer, baseUrl: appUrl } = await listen(app));
  });

  after(async () => {
    await new Promise<void>((r) => appServer.close(() => r()));
    (broadcastCompositorService as any).getBroadcast = origGet;
    (broadcastCompositorService as any).updateBroadcastMeta = origUpdate;
    if (prevPrivateDir === undefined) {
      delete process.env.PRIVATE_OBJECT_DIR;
    } else {
      process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
    }
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  async function uploadCover(id: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([PNG_BYTES], { type: "image/png" }), "cover.png");
    const r = await fetch(`${appUrl}/api/admin/broadcasts/${id}/cover/upload`, {
      method: "POST",
      body: form,
    });
    assert.equal(r.status, 200);
    const body = (await r.json()) as { ok: boolean; coverImageUrl: string };
    assert.equal(body.ok, true);
    return body.coverImageUrl;
  }

  it("PATCH with coverImageUrl=null deletes the on-disk cover file", async () => {
    const coversDir = pathResolve(tmpRoot, "broadcasts", "covers");
    await uploadCover("bc-clear-1");
    const coverPath = pathResolve(coversDir, "bc-clear-1.png");
    assert.ok(existsSync(coverPath), "cover file should exist after upload");

    const r = await fetch(`${appUrl}/api/admin/broadcasts/bc-clear-1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImageUrl: null }),
    });
    assert.equal(r.status, 200);
    const body = (await r.json()) as { ok: boolean; broadcast: { coverImageUrl: string | null } };
    assert.equal(body.ok, true);
    assert.equal(body.broadcast.coverImageUrl, null);

    assert.equal(
      existsSync(coverPath),
      false,
      "cover file must be deleted when coverImageUrl is cleared",
    );
  });

  it("PATCH that does not touch coverImageUrl leaves the cover file intact", async () => {
    const coversDir = pathResolve(tmpRoot, "broadcasts", "covers");
    await uploadCover("bc-clear-2");
    const coverPath = pathResolve(coversDir, "bc-clear-2.png");
    assert.ok(existsSync(coverPath), "cover file should exist after upload");
    const bytesBefore = readFileSync(coverPath);

    const r = await fetch(`${appUrl}/api/admin/broadcasts/bc-clear-2`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed Only" }),
    });
    assert.equal(r.status, 200);
    const body = (await r.json()) as { ok: boolean; broadcast: { title: string | null } };
    assert.equal(body.ok, true);
    assert.equal(body.broadcast.title, "Renamed Only");

    assert.ok(
      existsSync(coverPath),
      "cover file must remain when PATCH does not touch coverImageUrl",
    );
    assert.ok(
      readFileSync(coverPath).equals(bytesBefore),
      "cover file bytes must be unchanged",
    );
  });
});
