import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registerPreviewStudioRoutes } from "../server/routes/preview-studio-routes";
import {
  _resetPreviewStudioForTests,
  _setPreviewStudioStorageForTests,
  clearPreviewStudioHistory,
  composeStudioImage,
  generatePreviewStudioState,
  getPreviewStudioArchiveRetention,
  listPreviewStudioArchives,
  pruneArchives,
  setPreviewStudioArchiveRetention,
} from "../server/services/preview-studio-service";
import { FileProductionHouseStorage } from "../server/services/production-house-storage";

const EDIT_DIR =
  process.env.PREVIEW_STUDIO_INTERNAL_DIR ??
  join(process.cwd(), ".internal", "preview-studio");
const ARCHIVE_DIR = join(EDIT_DIR, "archives");

const ARCHIVE_FILENAME_RE =
  /^preview-studio-archive-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(states|edit_artifacts|both)-[0-9a-f]{8}\.json$/;

function listOnDiskArchives(): string[] {
  try {
    return readdirSync(ARCHIVE_DIR).filter((n) => ARCHIVE_FILENAME_RE.test(n));
  } catch {
    return [];
  }
}

function wipeArchives(): void {
  for (const name of listOnDiskArchives()) {
    try {
      unlinkSync(join(ARCHIVE_DIR, name));
    } catch {
      /* ignore */
    }
  }
}

function writeFakeArchive(opts: {
  scope: "states" | "edit_artifacts" | "both";
  ageMs?: number;
  hex?: string;
  sequence?: number;
}): string {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const when = new Date(Date.now() - (opts.ageMs ?? 0) + (opts.sequence ?? 0));
  const ts = when.toISOString().replace(/[:.]/g, "-");
  const hex = (opts.hex ?? Math.floor(Math.random() * 0xffffffff).toString(16))
    .padStart(8, "0")
    .slice(0, 8);
  const filename = `preview-studio-archive-${ts}-${opts.scope}-${hex}.json`;
  const full = join(ARCHIVE_DIR, filename);
  writeFileSync(
    full,
    JSON.stringify({ test: true, scope: opts.scope }, null, 2),
    "utf8",
  );
  const mtimeSec = when.getTime() / 1000;
  try {
    utimesSync(full, mtimeSec, mtimeSec);
  } catch {
    /* ignore */
  }
  return filename;
}

function seedOnce(): void {
  generatePreviewStudioState({ mode: "newsroom" });
  composeStudioImage({
    label: "seed",
    sourceAssetIds: [],
    layers: [{ label: "bg", kind: "background" }],
    aspect: "16:9",
  } as any);
}

let server: Server;
let base: string;
let storageDir: string;
let allowAdmin = true;

before(async () => {
  const app = express();
  app.use(express.json());
  const requireRootAdmin = (_req: any, res: any, next: any) => {
    if (!allowAdmin)
      return res.status(401).json({ ok: false, error: "unauthorized" });
    next();
  };
  registerPreviewStudioRoutes(app, requireRootAdmin);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  wipeArchives();
  if (storageDir) rmSync(storageDir, { recursive: true, force: true });
  _setPreviewStudioStorageForTests(null);
});

beforeEach(() => {
  _resetPreviewStudioForTests();
  wipeArchives();
  if (storageDir) rmSync(storageDir, { recursive: true, force: true });
  storageDir = mkdtempSync(join(tmpdir(), "psv-arch-"));
  _setPreviewStudioStorageForTests(new FileProductionHouseStorage(storageDir));
  // Reset retention overrides to defaults so tests start from a known state.
  setPreviewStudioArchiveRetention({ maxCount: null, maxAgeDays: null });
  allowAdmin = true;
});

async function post(p: string, body: any) {
  return fetch(`${base}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function get(p: string) {
  return fetch(`${base}${p}`);
}

const PREFIX = "/api/admin/production-house/preview-studio";

describe("Preview Studio archive retention — prune by count", () => {
  it("keeps only the N most-recent archives when count is exceeded", () => {
    setPreviewStudioArchiveRetention({ maxCount: 3 });
    // Five archives, each spaced 1ms apart so mtime ordering is stable.
    const names: string[] = [];
    for (let i = 0; i < 5; i++) {
      names.push(writeFakeArchive({ scope: "both", sequence: i }));
    }
    const result = pruneArchives();
    assert.equal(result.deletedFiles.length, 2);
    const remaining = listOnDiskArchives().sort();
    assert.equal(remaining.length, 3);
    // The two oldest must be gone, the three newest must remain.
    const expectedKept = names.slice(-3).sort();
    assert.deepEqual(remaining, expectedKept);
  });

  it("prunes on each archive write so writes never exceed the cap", () => {
    setPreviewStudioArchiveRetention({ maxCount: 2 });
    for (let i = 0; i < 4; i++) {
      seedOnce();
      const out = clearPreviewStudioHistory("both");
      assert.ok(out.archiveFile, "each clear should write an archive");
    }
    const remaining = listOnDiskArchives();
    assert.equal(remaining.length, 2);
  });
});

describe("Preview Studio archive retention — prune by age", () => {
  it("deletes archives older than maxAgeDays and keeps fresh ones", () => {
    setPreviewStudioArchiveRetention({ maxCount: 100, maxAgeDays: 7 });
    const oldA = writeFakeArchive({
      scope: "both",
      ageMs: 30 * 24 * 60 * 60 * 1000,
    });
    const oldB = writeFakeArchive({
      scope: "states",
      ageMs: 14 * 24 * 60 * 60 * 1000,
    });
    const fresh = writeFakeArchive({ scope: "edit_artifacts", ageMs: 0 });

    const result = pruneArchives();
    const deletedSet = new Set(result.deletedFiles);
    assert.ok(deletedSet.has(oldA));
    assert.ok(deletedSet.has(oldB));
    assert.ok(!deletedSet.has(fresh));
    const remaining = listOnDiskArchives();
    assert.deepEqual(remaining, [fresh]);
  });

  it("leaves foreign / non-matching files untouched", () => {
    setPreviewStudioArchiveRetention({ maxCount: 1, maxAgeDays: 1 });
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    const stray = join(ARCHIVE_DIR, "not-an-archive.txt");
    writeFileSync(stray, "leave me alone", "utf8");
    writeFakeArchive({ scope: "both", ageMs: 99 * 24 * 60 * 60 * 1000 });
    pruneArchives();
    // The stray file must still exist.
    assert.equal(statSync(stray).isFile(), true);
    unlinkSync(stray);
  });
});

describe("Preview Studio archive retention — get/set/reset routes", () => {
  it("GET /archive-retention returns defaults when no override is set", async () => {
    const prevCount = process.env.PREVIEW_STUDIO_ARCHIVE_RETENTION_COUNT;
    const prevDays = process.env.PREVIEW_STUDIO_ARCHIVE_RETENTION_DAYS;
    delete process.env.PREVIEW_STUDIO_ARCHIVE_RETENTION_COUNT;
    delete process.env.PREVIEW_STUDIO_ARCHIVE_RETENTION_DAYS;
    try {
      const r = await get(`${PREFIX}/archive-retention`);
      assert.equal(r.status, 200);
      const body = await r.json();
      assert.equal(body.ok, true);
      assert.equal(body.info.maxCount, 50);
      assert.equal(body.info.maxAgeDays, 30);
      assert.equal(body.info.countSource, "default");
      assert.equal(body.info.daysSource, "default");
      assert.equal(body.info.adminCount, null);
      assert.equal(body.info.adminDays, null);
    } finally {
      if (prevCount !== undefined)
        process.env.PREVIEW_STUDIO_ARCHIVE_RETENTION_COUNT = prevCount;
      if (prevDays !== undefined)
        process.env.PREVIEW_STUDIO_ARCHIVE_RETENTION_DAYS = prevDays;
    }
  });

  it("POST /archive-retention updates count + age and runs a prune", async () => {
    for (let i = 0; i < 6; i++)
      writeFakeArchive({ scope: "both", sequence: i });
    const r = await post(`${PREFIX}/archive-retention`, {
      maxCount: 2,
      maxAgeDays: 14,
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.info.maxCount, 2);
    assert.equal(body.info.maxAgeDays, 14);
    assert.equal(body.info.countSource, "admin");
    assert.equal(body.info.daysSource, "admin");
    assert.equal(body.prune.deletedFiles.length, 4);
    assert.equal(listOnDiskArchives().length, 2);
  });

  it("POST /archive-retention rejects invalid values with 400 JSON", async () => {
    for (const bad of [
      { maxCount: 0 },
      { maxCount: -5 },
      { maxCount: 1_000_001 },
      { maxCount: "abc" },
      { maxAgeDays: 0 },
      { maxAgeDays: -1 },
      { maxAgeDays: 999999 },
    ]) {
      const r = await post(`${PREFIX}/archive-retention`, bad);
      assert.equal(r.status, 400, `should reject ${JSON.stringify(bad)}`);
      const body = await r.json();
      assert.equal(body.ok, false);
    }
    // Underlying config not mutated by any rejected request.
    const info = getPreviewStudioArchiveRetention();
    assert.equal(info.adminCount, null);
    assert.equal(info.adminDays, null);
  });

  it("POST /archive-retention { reset: true } clears admin overrides", async () => {
    await post(`${PREFIX}/archive-retention`, {
      maxCount: 5,
      maxAgeDays: 3,
    });
    const before = getPreviewStudioArchiveRetention();
    assert.equal(before.adminCount, 5);
    assert.equal(before.adminDays, 3);

    const r = await post(`${PREFIX}/archive-retention`, { reset: true });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.info.adminCount, null);
    assert.equal(body.info.adminDays, null);
    assert.equal(body.info.countSource, "default");
    assert.equal(body.info.daysSource, "default");
  });
});

describe("Preview Studio archive retention — manual /prune-archives route", () => {
  it("deletes over-cap files and reports a deletion summary", async () => {
    setPreviewStudioArchiveRetention({ maxCount: 1, maxAgeDays: 365 });
    const names = [
      writeFakeArchive({ scope: "both", sequence: 0 }),
      writeFakeArchive({ scope: "both", sequence: 1 }),
      writeFakeArchive({ scope: "both", sequence: 2 }),
    ];
    const r = await post(`${PREFIX}/prune-archives`, {});
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.prune.deletedFiles.length, 2);
    assert.ok(body.prune.deletedBytes >= 0);
    // Newest one survives.
    const remaining = listOnDiskArchives();
    assert.deepEqual(remaining, [names[names.length - 1]]);
    // info block reports the current on-disk state.
    assert.equal(body.info.archiveFiles, 1);
  });

  it("is a no-op when nothing exceeds the retention limits", async () => {
    setPreviewStudioArchiveRetention({ maxCount: 10, maxAgeDays: 365 });
    writeFakeArchive({ scope: "both", sequence: 0 });
    writeFakeArchive({ scope: "states", sequence: 1 });
    const r = await post(`${PREFIX}/prune-archives`, {});
    const body = await r.json();
    assert.equal(body.prune.deletedFiles.length, 0);
    assert.equal(body.prune.deletedBytes, 0);
    assert.equal(listOnDiskArchives().length, 2);
  });

  it("listPreviewStudioArchives reflects what survives a prune", () => {
    setPreviewStudioArchiveRetention({ maxCount: 2, maxAgeDays: 365 });
    for (let i = 0; i < 4; i++)
      writeFakeArchive({ scope: "both", sequence: i });
    pruneArchives();
    const entries = listPreviewStudioArchives();
    assert.equal(entries.length, 2);
    for (const e of entries) {
      assert.match(e.filename, ARCHIVE_FILENAME_RE);
      assert.ok(e.byteSize > 0);
      assert.ok(typeof e.createdAt === "string");
      assert.ok(["both", "states", "edit_artifacts"].includes(e.scope));
    }
  });
});

describe("Preview Studio archive download — GET /archives/:filename", () => {
  it("returns the JSON content with attachment headers for a valid archive", async () => {
    const name = writeFakeArchive({ scope: "both", sequence: 0 });
    const r = await get(`${PREFIX}/archives/${encodeURIComponent(name)}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /^application\/json/);
    const disp = r.headers.get("content-disposition");
    assert.ok(disp);
    assert.ok(disp!.includes("attachment"));
    assert.ok(disp!.includes(name));
    assert.equal(r.headers.get("cache-control"), "no-store");
    const body = await r.json();
    assert.equal(body.test, true);
    assert.equal(body.scope, "both");
  });

  it("returns 404 for a well-formed but non-existent archive name", async () => {
    const ghost =
      "preview-studio-archive-2099-01-01T00-00-00-000Z-both-deadbeef.json";
    const r = await get(`${PREFIX}/archives/${ghost}`);
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "not_found");
  });

  it("returns 404 for filenames that don't match ARCHIVE_FILENAME_RE", async () => {
    // Seed a sibling file outside the regex so we can prove it can't be read.
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    const stray = join(ARCHIVE_DIR, "foo.json");
    writeFileSync(stray, JSON.stringify({ secret: true }), "utf8");
    try {
      const bads = [
        "foo.json",
        "preview-studio-archive-2024-01-01T00-00-00-000Z-both-xyz.json",
        "preview-studio-archive-2024-01-01T00-00-00-000Z-other-12345678.json",
        encodeURIComponent("../../etc/passwd"),
        encodeURIComponent("..%2F..%2Fetc%2Fpasswd"),
        encodeURIComponent(
          "../preview-studio-archive-2024-01-01T00-00-00-000Z-both-12345678.json",
        ),
      ];
      for (const bad of bads) {
        const r = await get(`${PREFIX}/archives/${bad}`);
        assert.equal(r.status, 404, `should 404 for ${bad}`);
        const body = await r.json();
        assert.equal(body.ok, false);
        assert.equal(body.error, "not_found");
      }
    } finally {
      try {
        unlinkSync(stray);
      } catch {
        /* ignore */
      }
    }
  });

  it("requires the root-admin guard", async () => {
    const name = writeFakeArchive({ scope: "both", sequence: 0 });
    allowAdmin = false;
    try {
      const r = await get(`${PREFIX}/archives/${encodeURIComponent(name)}`);
      assert.equal(r.status, 401);
      const body = await r.json();
      assert.equal(body.ok, false);
      assert.equal(body.error, "unauthorized");
    } finally {
      allowAdmin = true;
    }
  });
});

describe("Preview Studio archive retention — prune on hydrate", () => {
  it("prunes stale archives the first time the service hydrates", () => {
    setPreviewStudioArchiveRetention({ maxCount: 2, maxAgeDays: 365 });
    // Seed five archives directly on disk, then force a "cold start".
    for (let i = 0; i < 5; i++)
      writeFakeArchive({ scope: "both", sequence: i });
    assert.equal(listOnDiskArchives().length, 5);
    // Cold-start: clear in-memory caches and hydrate via a public call.
    _resetPreviewStudioForTests();
    _setPreviewStudioStorageForTests(
      new FileProductionHouseStorage(storageDir),
    );
    // Re-apply the cap (admin override is held in cachedConfig, which the
    // reset wipes — so reapply, then hydrate). The hydrate() inside this
    // call must trigger pruneArchives().
    setPreviewStudioArchiveRetention({ maxCount: 2, maxAgeDays: 365 });
    generatePreviewStudioState({ mode: "newsroom" });
    assert.equal(listOnDiskArchives().length, 2);
  });
});
