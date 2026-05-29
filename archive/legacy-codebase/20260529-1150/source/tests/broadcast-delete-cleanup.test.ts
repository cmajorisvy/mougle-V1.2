import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
} from "node:fs";
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

describe("DELETE /api/admin/broadcasts/:id filesystem cleanup", () => {
  let app: express.Express;
  let appServer: Server;
  let appUrl: string;

  let tmpRoot: string;
  let outsideRoot: string;
  let prevPrivateDir: string | undefined;
  const broadcastsStore = new Map<string, any>();
  const origGet = broadcastCompositorService.getBroadcast;
  const origUpdate = broadcastCompositorService.updateBroadcastMeta;
  const origDelete = broadcastCompositorService.deleteBroadcast;

  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "broadcast-delete-"));
    outsideRoot = mkdtempSync(join(tmpdir(), "broadcast-outside-"));
    prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;

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
    (broadcastCompositorService as any).deleteBroadcast = async (id: string) => {
      const row = broadcastsStore.get(id);
      if (!row) return null;
      broadcastsStore.delete(id);
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
    (broadcastCompositorService as any).deleteBroadcast = origDelete;
    if (prevPrivateDir === undefined) {
      delete process.env.PRIVATE_OBJECT_DIR;
    } else {
      process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
    }
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(outsideRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  async function uploadCover(id: string): Promise<void> {
    const form = new FormData();
    form.append("file", new Blob([PNG_BYTES], { type: "image/png" }), "cover.png");
    const r = await fetch(`${appUrl}/api/admin/broadcasts/${id}/cover/upload`, {
      method: "POST",
      body: form,
    });
    assert.equal(r.status, 200);
  }

  it("removes cover, mp4, and manifest files inside PRIVATE_OBJECT_DIR", async () => {
    const id = "bc-del-1";
    const broadcastsRoot = pathResolve(tmpRoot, "broadcasts");
    const renderDir = pathResolve(broadcastsRoot, id);
    mkdirSync(renderDir, { recursive: true });
    const mp4Path = pathResolve(renderDir, "render.mp4");
    const manifestPath = pathResolve(renderDir, "render.manifest.json");
    writeFileSync(mp4Path, Buffer.from([0, 1, 2, 3]));
    writeFileSync(manifestPath, JSON.stringify({ id }), "utf8");

    broadcastsStore.set(id, {
      id,
      title: "Delete Test",
      coverImageUrl: null,
      mp4Path,
      manifestPath,
    });
    await uploadCover(id);
    const coverPath = pathResolve(broadcastsRoot, "covers", `${id}.png`);
    assert.ok(existsSync(coverPath), "cover file should exist after upload");
    assert.ok(existsSync(mp4Path));
    assert.ok(existsSync(manifestPath));

    const r = await fetch(`${appUrl}/api/admin/broadcasts/${id}`, { method: "DELETE" });
    assert.equal(r.status, 200);
    const body = (await r.json()) as {
      ok: boolean;
      deleted: { id: string; coversRemoved: number; mp4Removed: boolean; manifestRemoved: boolean };
    };
    assert.equal(body.ok, true);
    assert.equal(body.deleted.id, id);
    assert.equal(body.deleted.coversRemoved, 1);
    assert.equal(body.deleted.mp4Removed, true);
    assert.equal(body.deleted.manifestRemoved, true);

    assert.equal(existsSync(coverPath), false, "cover file must be deleted");
    assert.equal(existsSync(mp4Path), false, "mp4 file must be deleted");
    assert.equal(existsSync(manifestPath), false, "manifest file must be deleted");
  });

  it("leaves mp4 and manifest files outside PRIVATE_OBJECT_DIR untouched", async () => {
    const id = "bc-del-2";
    const mp4Path = pathResolve(outsideRoot, "external.mp4");
    const manifestPath = pathResolve(outsideRoot, "external.manifest.json");
    writeFileSync(mp4Path, Buffer.from([4, 5, 6, 7]));
    writeFileSync(manifestPath, JSON.stringify({ id }), "utf8");

    broadcastsStore.set(id, {
      id,
      title: "External Paths",
      coverImageUrl: null,
      mp4Path,
      manifestPath,
    });

    const r = await fetch(`${appUrl}/api/admin/broadcasts/${id}`, { method: "DELETE" });
    assert.equal(r.status, 200);
    const body = (await r.json()) as {
      ok: boolean;
      deleted: { coversRemoved: number; mp4Removed: boolean; manifestRemoved: boolean };
    };
    assert.equal(body.ok, true);
    assert.equal(body.deleted.mp4Removed, false, "mp4 outside private root must not be deleted");
    assert.equal(body.deleted.manifestRemoved, false, "manifest outside private root must not be deleted");

    assert.ok(existsSync(mp4Path), "external mp4 must remain on disk");
    assert.ok(existsSync(manifestPath), "external manifest must remain on disk");
  });
});
