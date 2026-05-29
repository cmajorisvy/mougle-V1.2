import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { resolve } from "path";
import {
  buildAdminOnlyAssetMetadata,
  getStorageReport,
  stableStorageKeyForAsset,
  persistentStorageService,
  uploadIfConfigured,
} from "../server/services/persistent-storage-service";
import { requireRootAdmin } from "../server/middleware/admin-auth";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const FIXTURE_DIR = resolve(process.cwd(), ".local/media-assets/render");
const FIXTURE_FILE = resolve(FIXTURE_DIR, "test_fixture_123.mp4");

function ensureFixture() {
  if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });
  if (!existsSync(FIXTURE_FILE)) writeFileSync(FIXTURE_FILE, "fake-mp4");
}

function fakeSession(spec: { kind: "none" | "user" | "staff" | "root" }) {
  return (req: any, _res: any, next: any) => {
    if (spec.kind === "none") req.session = {};
    else if (spec.kind === "user") req.session = { userId: "u-1" };
    else if (spec.kind === "staff")
      req.session = {
        isAdmin: true,
        adminActorType: "staff",
        adminRole: "support",
        adminPermissions: ["support:view"],
        adminActorId: "staff-1",
      };
    else
      req.session = {
        isAdmin: true,
        adminActorType: "root_admin",
        adminRole: "super_admin",
        adminPermissions: ["*"],
        adminActorId: "env-root-admin",
      };
    next();
  };
}

function buildApp(sessionKind: "none" | "user" | "staff" | "root") {
  const app = express();
  app.use(fakeSession({ kind: sessionKind }));
  app.get("/api/admin/storage/status", requireRootAdmin, (_req, res) => {
    const report = getStorageReport();
    res.json({
      ...report,
      bucket: null,
      bucketIdConfigured: !!report.bucketIdConfigured,
      publicSafe: !!report.publicSafe,
    });
  });
  return app;
}

async function listen(
  app: express.Express,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

/* ------------------------------------------------------------------ */
/* stableStorageKeyForAsset — no path traversal                       */
/* ------------------------------------------------------------------ */

describe("stableStorageKeyForAsset — path-traversal guard", () => {
  it("rejects forward-slash path components", () => {
    assert.equal(stableStorageKeyForAsset("render", "a/b.mp4"), null);
    assert.equal(stableStorageKeyForAsset("voice", "a/b.mp3"), null);
  });

  it("rejects backslash path components", () => {
    assert.equal(stableStorageKeyForAsset("render", "a\\b.mp4"), null);
    assert.equal(stableStorageKeyForAsset("voice", "a\\b.mp3"), null);
  });

  it("rejects parent-directory references", () => {
    assert.equal(stableStorageKeyForAsset("render", "..mp4"), null);
    assert.equal(stableStorageKeyForAsset("render", "../etc/passwd"), null);
    assert.equal(stableStorageKeyForAsset("render", "foo/../bar.mp4"), null);
  });

  it("rejects disallowed mime extensions", () => {
    assert.equal(stableStorageKeyForAsset("render", "foo.exe"), null);
    assert.equal(stableStorageKeyForAsset("voice", "foo.mp4"), null);
    assert.equal(stableStorageKeyForAsset("voice", "foo.exe"), null);
  });

  it("rejects empty / non-string / overlong names", () => {
    assert.equal(stableStorageKeyForAsset("render", ""), null);
    // 129 chars before extension → over the 128-char allowance
    const long = "a".repeat(129) + ".mp4";
    assert.equal(stableStorageKeyForAsset("render", long), null);
    assert.equal(
      stableStorageKeyForAsset("render", null as unknown as string),
      null,
    );
  });

  it("rejects mixed-case / disallowed character names", () => {
    assert.equal(stableStorageKeyForAsset("render", "Bad-Name.mp4"), null);
    assert.equal(stableStorageKeyForAsset("render", "bad name.mp4"), null);
  });

  it("accepts well-formed names and emits a stable, prefixed key", () => {
    const k = stableStorageKeyForAsset("render", "rj_1_abc.mp4");
    assert.equal(k, "mougle-media/render/rj_1_abc.mp4");
    const k2 = stableStorageKeyForAsset("voice", "vc_1_abc.mp3");
    assert.equal(k2, "mougle-media/voice/vc_1_abc.mp3");
    // Determinism — same input, same key.
    assert.equal(stableStorageKeyForAsset("render", "rj_1_abc.mp4"), k);
  });
});

/* ------------------------------------------------------------------ */
/* buildAdminOnlyAssetMetadata — required shape + no public URL        */
/* ------------------------------------------------------------------ */

describe("buildAdminOnlyAssetMetadata", () => {
  before(() => ensureFixture());
  after(() => {
    try {
      rmSync(FIXTURE_FILE);
    } catch {
      /* ignore */
    }
  });

  it("returns every required metadata field + no public URL", () => {
    const m = buildAdminOnlyAssetMetadata({
      kind: "render",
      filename: "test_fixture_123.mp4",
      localPath: FIXTURE_FILE,
    });
    assert.equal(m.storageKey, "mougle-media/render/test_fixture_123.mp4");
    assert.equal(m.mimeType, "video/mp4");
    assert.equal(typeof m.size, "number");
    assert.ok(m.size > 0);
    assert.equal(m.size, m.fileSize);
    assert.equal(typeof m.createdAt, "string");
    assert.ok(!Number.isNaN(Date.parse(m.createdAt)));
    assert.equal(m.accessMode, "admin_only_stream");
    assert.equal(m.previewAccessMode, "admin_only_stream");
    assert.equal(m.adminOnly, true);
    assert.equal(m.publicUrl, null);
    assert.equal(m.publicUrlAvailable, false);
  });

  it("flags localFallback when no persisted key is supplied", () => {
    const m = buildAdminOnlyAssetMetadata({
      kind: "render",
      filename: "test_fixture_123.mp4",
      localPath: FIXTURE_FILE,
    });
    assert.equal(m.persisted, false);
    assert.equal(m.localFallback, true);
    assert.equal(m.persistedStorageKey, null);
    assert.equal(m.storageDriver, "internal_local_storage");
  });

  it("marks persisted=true and uses object-storage driver when key is supplied", () => {
    const m = buildAdminOnlyAssetMetadata({
      kind: "render",
      filename: "test_fixture_123.mp4",
      localPath: FIXTURE_FILE,
      persistedStorageKey: "mougle-media/render/test_fixture_123.mp4",
    });
    assert.equal(m.persisted, true);
    assert.equal(m.localFallback, false);
    assert.equal(m.storageDriver, "replit_object_storage_adapter");
    assert.equal(m.publicUrl, null);
    assert.equal(m.publicUrlAvailable, false);
  });

  it("throws on traversal-bait filename rather than producing a key", () => {
    assert.throws(
      () =>
        buildAdminOnlyAssetMetadata({
          kind: "render",
          filename: "../etc/passwd",
          localPath: FIXTURE_FILE,
        }),
      /invalid_media_asset_filename/,
    );
  });

  it("throws on missing local file (defense-in-depth)", () => {
    assert.throws(() =>
      buildAdminOnlyAssetMetadata({
        kind: "render",
        filename: "does_not_exist_xyz.mp4",
        localPath: resolve(FIXTURE_DIR, "does_not_exist_xyz.mp4"),
      }),
    );
  });
});

/* ------------------------------------------------------------------ */
/* getStorageReport — no secret values returned                        */
/* ------------------------------------------------------------------ */

describe("getStorageReport — secret hygiene", () => {
  const SAVED = {
    bucket: process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID,
    defaultBucket: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
    sidecar: process.env.REPLIT_SIDECAR_ENDPOINT,
  };
  after(() => {
    if (SAVED.bucket === undefined) delete process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID;
    else process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID = SAVED.bucket;
    if (SAVED.defaultBucket === undefined) delete process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    else process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = SAVED.defaultBucket;
    if (SAVED.sidecar === undefined) delete process.env.REPLIT_SIDECAR_ENDPOINT;
    else process.env.REPLIT_SIDECAR_ENDPOINT = SAVED.sidecar;
  });

  it("always returns publicSafe:false and bucket:null", () => {
    const r = getStorageReport();
    assert.equal(r.bucket, null, "bucket value must never be exposed");
    assert.equal(r.publicSafe, false);
  });

  it("reports bucketIdConfigured as a boolean only, never the literal value", () => {
    const SECRET = "super-secret-bucket-id-do-not-leak";
    process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID = SECRET;
    try {
      const r = getStorageReport();
      assert.equal(typeof r.bucketIdConfigured, "boolean");
      assert.equal(r.bucketIdConfigured, true);
      assert.equal(r.bucket, null);
      // The secret value must not appear anywhere in the serialised payload.
      const json = JSON.stringify(r);
      assert.equal(
        json.includes(SECRET),
        false,
        "report payload leaked the bucket secret value",
      );
    } finally {
      delete process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID;
    }
  });

  it("falls back to local_dev_only when no object-storage is configured", () => {
    delete process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID;
    delete process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    delete process.env.REPLIT_SIDECAR_ENDPOINT;
    const r = getStorageReport();
    assert.equal(r.bucketIdConfigured, false);
    assert.equal(r.bucket, null);
    assert.equal(r.publicSafe, false);
    // status is one of the non-persistent states.
    assert.ok(
      ["local_dev_only", "package_installed_bucket_missing", "setup_required"].includes(
        r.status,
      ),
      `unexpected status: ${r.status}`,
    );
    assert.equal(r.driver, "internal_local_storage");
  });
});

/* ------------------------------------------------------------------ */
/* uploadIfConfigured — local-only fallback contract                   */
/* ------------------------------------------------------------------ */

describe("uploadIfConfigured — local-only fallback", () => {
  const SAVED = {
    bucket: process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID,
    defaultBucket: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
    sidecar: process.env.REPLIT_SIDECAR_ENDPOINT,
  };
  before(() => ensureFixture());
  after(() => {
    if (SAVED.bucket === undefined) delete process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID;
    else process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID = SAVED.bucket;
    if (SAVED.defaultBucket === undefined) delete process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    else process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = SAVED.defaultBucket;
    if (SAVED.sidecar === undefined) delete process.env.REPLIT_SIDECAR_ENDPOINT;
    else process.env.REPLIT_SIDECAR_ENDPOINT = SAVED.sidecar;
    try {
      rmSync(FIXTURE_FILE);
    } catch {
      /* ignore */
    }
  });

  it("returns attempted:false + internal_local_storage when no env vars set", async () => {
    delete process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID;
    delete process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    delete process.env.REPLIT_SIDECAR_ENDPOINT;
    const r = await uploadIfConfigured(FIXTURE_FILE, "test_fixture_123.mp4");
    assert.equal(r.attempted, false);
    assert.equal(r.ok, false);
    assert.equal(r.driver, "internal_local_storage");
    assert.equal(r.storageKey, null);
    assert.equal(typeof r.reason, "string");
  });

  it("never throws even when the local file does not exist", async () => {
    delete process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID;
    delete process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    delete process.env.REPLIT_SIDECAR_ENDPOINT;
    const r = await uploadIfConfigured(
      resolve(FIXTURE_DIR, "does_not_exist_xyz.mp4"),
      "does_not_exist_xyz.mp4",
    );
    assert.equal(r.attempted, false);
    assert.equal(r.ok, false);
    assert.equal(r.driver, "internal_local_storage");
  });
});

/* ------------------------------------------------------------------ */
/* /api/admin/storage/status — admin-only stream guard                 */
/* ------------------------------------------------------------------ */

describe("/api/admin/storage/status — admin-only stream", () => {
  const servers: Server[] = [];
  const urls: Record<string, string> = {};

  before(async () => {
    for (const k of ["none", "user", "staff", "root"] as const) {
      const { server, baseUrl } = await listen(buildApp(k));
      servers.push(server);
      urls[k] = baseUrl;
    }
  });
  after(async () => {
    await Promise.all(
      servers.map(
        (s) => new Promise<void>((res) => s.close(() => res())),
      ),
    );
  });

  it("rejects unauthenticated requests", async () => {
    const r = await fetch(`${urls.none}/api/admin/storage/status`);
    assert.equal(r.status, 401);
  });

  it("rejects regular-user sessions", async () => {
    const r = await fetch(`${urls.user}/api/admin/storage/status`);
    assert.ok(r.status === 401 || r.status === 403, `got ${r.status}`);
  });

  it("rejects staff (non-root) admin sessions", async () => {
    const r = await fetch(`${urls.staff}/api/admin/storage/status`);
    assert.ok(r.status === 401 || r.status === 403, `got ${r.status}`);
  });

  it("allows root admin and returns the locked-down report shape", async () => {
    const r = await fetch(`${urls.root}/api/admin/storage/status`);
    assert.equal(r.status, 200);
    const body = (await r.json()) as any;
    assert.equal(body.bucket, null);
    assert.equal(typeof body.bucketIdConfigured, "boolean");
    assert.equal(body.publicSafe, false);
    assert.equal(typeof body.driver, "string");
    assert.ok(Array.isArray(body.candidates));
  });
});

/* ------------------------------------------------------------------ */
/* persistentStorageService surface — adapter exports                  */
/* ------------------------------------------------------------------ */

describe("persistentStorageService surface", () => {
  it("exposes the documented helpers and never a raw secret reader", () => {
    assert.equal(typeof persistentStorageService.getStorageReport, "function");
    assert.equal(typeof persistentStorageService.uploadIfConfigured, "function");
    assert.equal(typeof persistentStorageService.stableStorageKeyForAsset, "function");
    assert.equal(typeof persistentStorageService.buildAdminOnlyAssetMetadata, "function");
    // No "getBucket" / "getSecret" surface exists.
    assert.equal((persistentStorageService as any).getBucket, undefined);
    assert.equal((persistentStorageService as any).getSecret, undefined);
  });
});
