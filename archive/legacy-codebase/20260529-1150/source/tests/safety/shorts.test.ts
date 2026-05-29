/**
 * T9 — Shorts Cutter safety tests.
 *
 * Invariants this test guards:
 *   - service refuses to cut shorts for a non-approved broadcast
 *   - approval flips ONLY the approved flag + status; no posting happens
 *   - service source contains no external upload SDK or posting URL
 *   - route source contains no external posting code path
 *   - drafts always land with status='draft' from cut path
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  ShortsSafetyError,
  shortsCutterService,
  stageUploadedThumbnail,
  sweepAbandonedStagedThumbnails,
  ABANDONED_THUMB_DEFAULT_MAX_AGE_MS,
  UPLOAD_THUMB_MAX_BYTES,
  DEFAULT_VARIANTS,
} from "../../server/services/shorts-cutter-service";

function shortsStorageRoot(): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (envDir) {
    try {
      const root = join(envDir, "shorts");
      mkdirSync(root, { recursive: true });
      return root;
    } catch {
      // fall through to local fallback (matches resolveStorageRoot behavior)
    }
  }
  const fallback = resolve(process.cwd(), ".local/media-assets/shorts");
  mkdirSync(fallback, { recursive: true });
  return fallback;
}

async function insertSafetyBroadcast(suffix: string): Promise<string> {
  const { db } = await import("../../server/db");
  const { broadcasts } = await import("../../shared/schema");
  const pkgId = `pkg_shorts_thumb_cleanup_${suffix}`;
  const [row] = await db.insert(broadcasts).values({
    packageId: pkgId,
    brollPlanId: null,
    anchorVideoUrl: null,
    mp4Path: "/tmp/does-not-exist.mp4",
    manifestPath: "/tmp/does-not-exist.manifest.json",
    manifestJson: {
      schemaVersion: 1,
      packageId: pkgId,
      brollPlanId: null,
      anchorVideoUrl: null,
      mp4Filename: "x.mp4",
      dryRun: true,
      generatedAt: new Date().toISOString(),
      generatedBy: "safety_test",
      canvas: { width: 1920, height: 1080, fps: 30, durationSec: 6 },
      layers: ["background", "anchor", "lower-third", "ticker", "source-panel", "channel-bug", "watermark"],
      headline: "h",
      kicker: "k",
      confidence: { level: "high", score: 0.9 },
      sources: [{ name: "x", url: null, license: "owned", attribution: null, tier: null }],
      safety: {
        publicPublishing: false,
        youtubeUpload: false,
        socialPosting: false,
        externalUpload: false,
        requiresFounderApprovalForLive: true,
      },
    },
    status: "rendered",
    dryRun: true,
    createdBy: "safety_test",
  }).returning();
  return row.id;
}

async function insertDraft(broadcastId: string, thumbnailPath: string | null): Promise<string> {
  const { db } = await import("../../server/db");
  const { socialDrafts } = await import("../../shared/schema");
  const [row] = await db.insert(socialDrafts).values({
    broadcastId,
    platform: "youtube_shorts",
    aspectRatio: "9:16",
    durationSec: 30,
    clipPath: "/tmp/does-not-exist-clip.mp4",
    caption: "",
    thumbnailPath,
    hashtags: [],
    status: "draft",
  }).returning();
  return row.id;
}

async function cleanupRows(broadcastIds: string[]): Promise<void> {
  const { db } = await import("../../server/db");
  const { broadcasts } = await import("../../shared/schema");
  const { inArray } = await import("drizzle-orm");
  if (broadcastIds.length === 0) return;
  await db.delete(broadcasts).where(inArray(broadcasts.id, broadcastIds));
}

const SERVICE_PATH = resolve(process.cwd(), "server/services/shorts-cutter-service.ts");
const ROUTES_PATH = resolve(process.cwd(), "server/routes/shorts.ts");

describe("shorts cutter — service surface", () => {
  it("exports the documented public api", () => {
    assert.ok(typeof shortsCutterService.cutShortsForBroadcast === "function");
    assert.ok(typeof shortsCutterService.listShorts === "function");
    assert.ok(typeof shortsCutterService.getShort === "function");
    assert.ok(typeof shortsCutterService.updateShort === "function");
    assert.ok(typeof shortsCutterService.approveShort === "function");
    assert.ok(typeof shortsCutterService.discardShort === "function");
  });

  it("ships at least three default variants spanning 9:16 + 1:1", () => {
    assert.ok(DEFAULT_VARIANTS.length >= 3);
    const aspects = new Set(DEFAULT_VARIANTS.map((v) => v.aspectRatio));
    assert.ok(aspects.has("9:16"));
    assert.ok(aspects.has("1:1"));
    for (const v of DEFAULT_VARIANTS) {
      assert.ok(v.durationSec >= 5 && v.durationSec <= 90, `duration ${v.durationSec} out of range`);
    }
  });
});

describe("shorts cutter — gating", () => {
  it("refuses to cut for a non-existent broadcast", async () => {
    await assert.rejects(
      () => shortsCutterService.cutShortsForBroadcast("00000000-0000-0000-0000-000000000000", { actorId: "safety_test" }),
      (err: unknown) => {
        assert.ok(err instanceof ShortsSafetyError);
        const code = (err as ShortsSafetyError).code;
        // not_found if the row is absent OR not_approved if a stray row exists
        assert.ok(["broadcast_not_found", "broadcast_not_approved"].includes(code), `unexpected code ${code}`);
        return true;
      },
    );
  });

  it("refuses to cut for a broadcast whose package has no approval row", async () => {
    // Insert a fake broadcast row whose packageId is not in the approvals
    // registry. The cutter must reject before any ffmpeg work.
    const { db } = await import("../../server/db");
    const { broadcasts } = await import("../../shared/schema");
    const pkgId = `pkg_shorts_safety_unapproved_${Math.random().toString(36).slice(2, 8)}`;
    const [row] = await db.insert(broadcasts).values({
      packageId: pkgId,
      brollPlanId: null,
      anchorVideoUrl: null,
      mp4Path: "/tmp/does-not-exist.mp4",
      manifestPath: "/tmp/does-not-exist.manifest.json",
      manifestJson: {
        schemaVersion: 1,
        packageId: pkgId,
        brollPlanId: null,
        anchorVideoUrl: null,
        mp4Filename: "x.mp4",
        dryRun: true,
        generatedAt: new Date().toISOString(),
        generatedBy: "safety_test",
        canvas: { width: 1920, height: 1080, fps: 30, durationSec: 6 },
        layers: ["background", "anchor", "lower-third", "ticker", "source-panel", "channel-bug", "watermark"],
        headline: "h",
        kicker: "k",
        confidence: { level: "high", score: 0.9 },
        sources: [{ name: "x", url: null, license: "owned", attribution: null, tier: null }],
        safety: {
          publicPublishing: false,
          youtubeUpload: false,
          socialPosting: false,
          externalUpload: false,
          requiresFounderApprovalForLive: true,
        },
      },
      status: "rendered",
      dryRun: true,
      createdBy: "safety_test",
    }).returning();

    try {
      await assert.rejects(
        () => shortsCutterService.cutShortsForBroadcast(row.id, { actorId: "safety_test" }),
        (err: unknown) => {
          assert.ok(err instanceof ShortsSafetyError);
          assert.equal((err as ShortsSafetyError).code, "broadcast_not_approved");
          return true;
        },
      );
    } finally {
      const { eq } = await import("drizzle-orm");
      await db.delete(broadcasts).where(eq(broadcasts.id, row.id));
    }
  });
});

describe("shorts cutter — uploaded thumbnail service", () => {
  const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const FAKE_ID = "00000000-0000-0000-0000-000000000000";

  function pngBuf(extra = 16): Buffer {
    return Buffer.concat([PNG_HEAD, Buffer.alloc(extra, 0)]);
  }
  function jpegBuf(extra = 16): Buffer {
    return Buffer.concat([JPEG_HEAD, Buffer.alloc(extra, 0)]);
  }

  async function makeDraftRow(status: "draft" | "approved" | "discarded" = "draft") {
    const { db } = await import("../../server/db");
    const { broadcasts, socialDrafts } = await import("../../shared/schema");
    const pkgId = `pkg_shorts_upload_${Math.random().toString(36).slice(2, 8)}`;
    const [bc] = await db.insert(broadcasts).values({
      packageId: pkgId,
      brollPlanId: null,
      anchorVideoUrl: null,
      mp4Path: "/tmp/does-not-exist.mp4",
      manifestPath: "/tmp/does-not-exist.manifest.json",
      manifestJson: {
        schemaVersion: 1,
        packageId: pkgId,
        brollPlanId: null,
        anchorVideoUrl: null,
        mp4Filename: "x.mp4",
        dryRun: true,
        generatedAt: new Date().toISOString(),
        generatedBy: "safety_test",
        canvas: { width: 1920, height: 1080, fps: 30, durationSec: 6 },
        layers: ["background"],
        headline: "h",
        kicker: "k",
        confidence: { level: "high", score: 0.9 },
        sources: [{ name: "x", url: null, license: "owned", attribution: null, tier: null }],
        safety: {
          publicPublishing: false,
          youtubeUpload: false,
          socialPosting: false,
          externalUpload: false,
          requiresFounderApprovalForLive: true,
        },
      },
      status: "rendered",
      dryRun: true,
      createdBy: "safety_test",
    }).returning();

    const [draft] = await db.insert(socialDrafts).values({
      broadcastId: bc.id,
      platform: "youtube_shorts",
      aspectRatio: "9:16",
      durationSec: 15,
      clipPath: "/tmp/does-not-exist.mp4",
      caption: "",
      hashtags: [],
      status,
    }).returning();

    return {
      broadcastId: bc.id,
      draftId: draft.id,
      async cleanup() {
        const { eq } = await import("drizzle-orm");
        await db.delete(socialDrafts).where(eq(socialDrafts.id, draft.id));
        await db.delete(broadcasts).where(eq(broadcasts.id, bc.id));
      },
    };
  }

  it("publishes a sane size cap (5MB)", () => {
    assert.equal(UPLOAD_THUMB_MAX_BYTES, 5 * 1024 * 1024);
  });

  it("rejects an empty upload", async () => {
    await assert.rejects(
      () => stageUploadedThumbnail(FAKE_ID, Buffer.alloc(0), "image/png"),
      (err: unknown) => {
        assert.ok(err instanceof ShortsSafetyError);
        assert.equal((err as ShortsSafetyError).code, "upload_empty");
        return true;
      },
    );
  });

  it("rejects payloads larger than the 5MB cap", async () => {
    const big = Buffer.concat([PNG_HEAD, Buffer.alloc(UPLOAD_THUMB_MAX_BYTES, 0)]);
    await assert.rejects(
      () => stageUploadedThumbnail(FAKE_ID, big, "image/png"),
      (err: unknown) => {
        assert.ok(err instanceof ShortsSafetyError);
        assert.equal((err as ShortsSafetyError).code, "upload_too_large");
        assert.equal((err as ShortsSafetyError).status, 413);
        return true;
      },
    );
  });

  it("rejects bytes that are not PNG or JPEG (e.g. GIF / arbitrary)", async () => {
    const gif = Buffer.from("GIF89a" + "\x00".repeat(32), "binary");
    await assert.rejects(
      () => stageUploadedThumbnail(FAKE_ID, gif, "image/png"),
      (err: unknown) => {
        assert.ok(err instanceof ShortsSafetyError);
        assert.equal((err as ShortsSafetyError).code, "invalid_image");
        return true;
      },
    );
    const junk = Buffer.from("not an image at all", "utf8");
    await assert.rejects(
      () => stageUploadedThumbnail(FAKE_ID, junk, "image/jpeg"),
      (err: unknown) => {
        assert.ok(err instanceof ShortsSafetyError);
        assert.equal((err as ShortsSafetyError).code, "invalid_image");
        return true;
      },
    );
  });

  it("rejects MIME mismatch (PNG bytes declared as JPEG, JPEG bytes declared as PNG)", async () => {
    await assert.rejects(
      () => stageUploadedThumbnail(FAKE_ID, pngBuf(), "image/jpeg"),
      (err: unknown) => {
        assert.ok(err instanceof ShortsSafetyError);
        assert.equal((err as ShortsSafetyError).code, "mime_mismatch");
        return true;
      },
    );
    await assert.rejects(
      () => stageUploadedThumbnail(FAKE_ID, jpegBuf(), "image/png"),
      (err: unknown) => {
        assert.ok(err instanceof ShortsSafetyError);
        assert.equal((err as ShortsSafetyError).code, "mime_mismatch");
        return true;
      },
    );
  });

  it("rejects when the draft id does not exist", async () => {
    await assert.rejects(
      () => stageUploadedThumbnail(FAKE_ID, pngBuf(), "image/png"),
      (err: unknown) => {
        assert.ok(err instanceof ShortsSafetyError);
        assert.equal((err as ShortsSafetyError).code, "not_found");
        assert.equal((err as ShortsSafetyError).status, 404);
        return true;
      },
    );
  });

  it("rejects when the draft is not in status='draft' (approved / discarded)", async () => {
    for (const status of ["approved", "discarded"] as const) {
      const ctx = await makeDraftRow(status);
      try {
        await assert.rejects(
          () => stageUploadedThumbnail(ctx.draftId, pngBuf(), "image/png"),
          (err: unknown) => {
            assert.ok(err instanceof ShortsSafetyError);
            assert.equal((err as ShortsSafetyError).code, "not_draft");
            assert.equal((err as ShortsSafetyError).status, 409);
            return true;
          },
        );
      } finally {
        await ctx.cleanup();
      }
    }
  });

  it("on success writes the file under PRIVATE_OBJECT_DIR/shorts and persists via updateShort", async () => {
    const ctx = await makeDraftRow("draft");
    let stagedPath: string | undefined;
    try {
      const bytes = pngBuf(64);
      const staged = await stageUploadedThumbnail(ctx.draftId, bytes, "image/png");
      stagedPath = staged.thumbnailPath;
      assert.ok(stagedPath && stagedPath.length > 0, "stage returned a path");

      // Path confinement: must live inside the resolved shorts root. The
      // service prefers PRIVATE_OBJECT_DIR/shorts and falls back to the local
      // .local/media-assets/shorts dir if the env path is not writable.
      const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
      const candidateRoots = [
        envDir ? resolve(envDir, "shorts") : null,
        resolve(process.cwd(), ".local/media-assets/shorts"),
      ].filter((p): p is string => !!p);
      const abs = resolve(stagedPath);
      const matchedRoot = candidateRoots.find(
        (root) => abs === root || abs.startsWith(root + "/"),
      );
      assert.ok(
        matchedRoot,
        `staged path "${abs}" must live under one of ${candidateRoots.join(", ")}`,
      );
      assert.equal(dirname(abs), matchedRoot, "staged file must sit directly inside the shorts root");
      // And never outside any of them (defence-in-depth — no traversal).
      assert.ok(!stagedPath!.includes(".."), "staged path must not contain traversal segments");
      assert.ok(existsSync(abs), "staged file must exist on disk");
      assert.deepEqual(readFileSync(abs), bytes, "staged bytes must match the upload exactly");

      // Persistence must flow through the same updateShort contract used by PATCH.
      const row = await shortsCutterService.updateShort(ctx.draftId, { thumbnailPath: stagedPath });
      assert.equal(row.thumbnailPath, stagedPath);
      const reread = await shortsCutterService.getShort(ctx.draftId);
      assert.equal(reread?.thumbnailPath, stagedPath);
    } finally {
      if (stagedPath && existsSync(stagedPath)) {
        try { unlinkSync(stagedPath); } catch { /* best-effort */ }
      }
      await ctx.cleanup();
    }
  });

  it("accepts JPEG bytes with image/jpg declared MIME", async () => {
    const ctx = await makeDraftRow("draft");
    let stagedPath: string | undefined;
    try {
      const staged = await stageUploadedThumbnail(ctx.draftId, jpegBuf(32), "image/jpg");
      stagedPath = staged.thumbnailPath;
      assert.ok(stagedPath.endsWith(".jpg"), "JPEG uploads use a .jpg extension");
    } finally {
      if (stagedPath && existsSync(stagedPath)) {
        try { unlinkSync(stagedPath); } catch { /* best-effort */ }
      }
      await ctx.cleanup();
    }
  });
});

describe("shorts cutter — uploaded thumbnail route wiring", () => {
  const routesSrc = readFileSync(ROUTES_PATH, "utf8");

  it("the upload route is registered as POST and gated by requireRootAdmin + uploadMiddleware", () => {
    const line = routesSrc
      .split("\n")
      .find((l) => l.includes('"/api/admin/shorts/:id/thumbnail/upload"'));
    assert.ok(line, "upload route must be registered");
    assert.ok(line!.startsWith("  app.post("), "upload route must use POST");
    assert.ok(line!.includes("requireRootAdmin"), "upload route must include requireRootAdmin");
    assert.ok(line!.includes("uploadMiddleware"), "upload route must run through uploadMiddleware");
  });

  it("multer is configured for in-memory storage with single-file, 5MB cap, PNG/JPEG only", () => {
    // memoryStorage so bytes never touch disk before validation.
    assert.ok(routesSrc.includes("multer.memoryStorage()"), "must use multer.memoryStorage()");
    // size cap pinned to the service constant (not a magic number).
    assert.ok(
      routesSrc.includes("fileSize: UPLOAD_THUMB_MAX_BYTES"),
      "multer fileSize limit must come from UPLOAD_THUMB_MAX_BYTES",
    );
    assert.ok(routesSrc.includes("files: 1"), "multer must accept at most one file");
    // MIME allowlist enforced at the multer layer too.
    assert.ok(
      routesSrc.includes('mime === "image/png"') &&
        (routesSrc.includes('mime === "image/jpeg"') || routesSrc.includes('"image/jpg"')),
      "multer fileFilter must only allow png/jpeg",
    );
    assert.ok(routesSrc.includes('"invalid_mime"'), "fileFilter must reject other MIMEs with invalid_mime");
  });

  it("the upload handler stages via stageUploadedThumbnail and persists via updateShort (same PATCH contract)", () => {
    // Slice out just the upload handler body so we don't accidentally match
    // the frame/AI handlers above it.
    const marker = '"/api/admin/shorts/:id/thumbnail/upload"';
    const start = routesSrc.indexOf(marker);
    assert.ok(start > 0, "upload route must be present");
    const after = routesSrc.slice(start);
    const handler = after.slice(0, after.indexOf("\n  });") + 6);
    assert.ok(
      handler.includes("shortsCutterService.stageUploadedThumbnail(id, file.buffer, file.mimetype)"),
      "must stage via shortsCutterService.stageUploadedThumbnail",
    );
    assert.ok(
      handler.includes("shortsCutterService.updateShort(id, { thumbnailPath: staged.thumbnailPath })"),
      "must persist via the same updateShort({ thumbnailPath }) contract",
    );
    // Defence-in-depth: no fetch / external upload / signed URL minting in this handler.
    assert.ok(!/\bfetch\(/.test(handler), "upload handler must not call fetch");
    assert.ok(!/\.upload\(/.test(handler), "upload handler must not call .upload");
    assert.ok(!/getSignedUrl|createSignedUrl/.test(handler), "upload handler must not mint signed URLs");
  });

  it("rejects oversized uploads at the middleware layer with HTTP 413", () => {
    assert.ok(
      routesSrc.includes('"LIMIT_FILE_SIZE"') && routesSrc.includes("status(413)"),
      "middleware must translate multer LIMIT_FILE_SIZE into HTTP 413",
    );
    assert.ok(
      routesSrc.includes('error: "upload_too_large"'),
      "oversized-upload response must carry error=upload_too_large",
    );
  });
});

describe("shorts cutter — source code safety", () => {
  const serviceSrc = readFileSync(SERVICE_PATH, "utf8");
  const routesSrc = readFileSync(ROUTES_PATH, "utf8");

  it("service source contains no external upload / posting URLs", () => {
    const banned = [
      "youtube.com/upload",
      "googleapis.com/upload",
      "youtube.upload",
      "uploadToYoutube",
      "tiktok.upload",
      "open-api.tiktok.com",
      "graph.instagram.com",
      "graph.facebook.com",
      "reels.upload",
      "publishToSocial",
      "/v1/posts",
      "getSignedUrl",
      "createSignedUrl",
    ];
    for (const needle of banned) {
      assert.ok(!serviceSrc.includes(needle), `service must not contain "${needle}"`);
      assert.ok(!routesSrc.includes(needle), `routes must not contain "${needle}"`);
    }
  });

  it("never imports a social or upload SDK", () => {
    const importPattern = /from\s+["'](youtube|googleapis|twitter-api|@google-cloud|@aws-sdk\/client-s3|tiktok|@meta\/|instagram)/;
    assert.ok(!importPattern.test(serviceSrc), "service must not import upload SDKs");
    assert.ok(!importPattern.test(routesSrc), "routes must not import upload SDKs");
  });

  it("cut path always inserts with status='draft'", () => {
    // The only insert call in the service must set status to 'draft'.
    const insertBlock = serviceSrc.split(".insert(socialDrafts)")[1] || "";
    assert.ok(insertBlock.length > 0, "service must insert into socialDrafts");
    const valuesBlock = insertBlock.split(".values(")[1]?.split(".returning()")[0] ?? "";
    assert.ok(valuesBlock.includes('status: "draft"'), "cut must insert with status='draft'");
  });

  it("approve path flips approved=true and status='approved' and nothing else external", () => {
    const approveBlock = serviceSrc.split("export async function approveShort")[1]?.split("export async function discardShort")[0] ?? "";
    assert.ok(approveBlock.includes("approved: true"));
    assert.ok(approveBlock.includes('status: "approved"'));
    // Must NOT contain any fetch/upload/network call inside the approve fn.
    assert.ok(!/\bfetch\(/.test(approveBlock), "approve must not call fetch");
    assert.ok(!/\.upload\(/.test(approveBlock), "approve must not call .upload");
    assert.ok(!/\baxios\b/.test(approveBlock), "approve must not call axios");
  });

  it("approve route documents posted=false explicitly", () => {
    // Defence-in-depth: the route response must explicitly carry posted:false
    // so downstream tooling cannot misinterpret approval as a publish event.
    assert.ok(routesSrc.includes("posted: false"));
  });

  it("route registration only mounts admin paths under requireRootAdmin", () => {
    // Every app.X(...) call in shorts.ts must be guarded by requireRootAdmin.
    const lines = routesSrc.split("\n");
    for (const line of lines) {
      const m = line.match(/app\.(get|post|patch|delete|put)\(/);
      if (!m) continue;
      assert.ok(line.includes("requireRootAdmin"), `route line missing requireRootAdmin: ${line.trim()}`);
    }
  });
});

describe("shorts cutter — thumbnail swap cleanup", () => {
  it("deletes the prior thumbnail file when a new one is swapped in (inside shorts root)", async () => {
    const root = shortsStorageRoot();
    mkdirSync(root, { recursive: true });
    const suffix = Math.random().toString(36).slice(2, 8);
    const oldThumb = join(root, `safety_old_${suffix}.png`);
    const newThumb = join(root, `safety_new_${suffix}.png`);
    writeFileSync(oldThumb, "old-bytes");
    writeFileSync(newThumb, "new-bytes");

    const broadcastId = await insertSafetyBroadcast(`swap_${suffix}`);
    const draftId = await insertDraft(broadcastId, oldThumb);

    try {
      await shortsCutterService.updateShort(draftId, { thumbnailPath: newThumb });
      assert.equal(existsSync(oldThumb), false, "prior thumbnail must be unlinked from disk");
      assert.equal(existsSync(newThumb), true, "new thumbnail must remain on disk");
    } finally {
      if (existsSync(oldThumb)) rmSync(oldThumb, { force: true });
      if (existsSync(newThumb)) rmSync(newThumb, { force: true });
      await cleanupRows([broadcastId]);
    }
  });

  it("does NOT delete a prior thumbnail that lives OUTSIDE the shorts root", async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "shorts-safety-outside-"));
    const root = shortsStorageRoot();
    mkdirSync(root, { recursive: true });
    const suffix = Math.random().toString(36).slice(2, 8);
    const outsideThumb = join(outsideDir, `outside_${suffix}.png`);
    const newThumb = join(root, `safety_new_outside_${suffix}.png`);
    writeFileSync(outsideThumb, "outside-bytes");
    writeFileSync(newThumb, "new-bytes");

    const broadcastId = await insertSafetyBroadcast(`outside_${suffix}`);
    const draftId = await insertDraft(broadcastId, outsideThumb);

    try {
      await shortsCutterService.updateShort(draftId, { thumbnailPath: newThumb });
      assert.equal(
        existsSync(outsideThumb),
        true,
        "thumbnail outside the shorts root must NEVER be unlinked by the cleanup path",
      );
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
      if (existsSync(newThumb)) rmSync(newThumb, { force: true });
      await cleanupRows([broadcastId]);
    }
  });

  it("does NOT delete a prior thumbnail still referenced by another draft row", async () => {
    const root = shortsStorageRoot();
    mkdirSync(root, { recursive: true });
    const suffix = Math.random().toString(36).slice(2, 8);
    const sharedThumb = join(root, `safety_shared_${suffix}.png`);
    const newThumb = join(root, `safety_new_shared_${suffix}.png`);
    writeFileSync(sharedThumb, "shared-bytes");
    writeFileSync(newThumb, "new-bytes");

    const broadcastA = await insertSafetyBroadcast(`sharedA_${suffix}`);
    const broadcastB = await insertSafetyBroadcast(`sharedB_${suffix}`);
    const draftA = await insertDraft(broadcastA, sharedThumb);
    await insertDraft(broadcastB, sharedThumb);

    try {
      await shortsCutterService.updateShort(draftA, { thumbnailPath: newThumb });
      assert.equal(
        existsSync(sharedThumb),
        true,
        "thumbnail still referenced by another draft row must NOT be unlinked",
      );
    } finally {
      if (existsSync(sharedThumb)) rmSync(sharedThumb, { force: true });
      if (existsSync(newThumb)) rmSync(newThumb, { force: true });
      await cleanupRows([broadcastA, broadcastB]);
    }
  });
});

describe("shorts cutter — re-cut retires prior drafts (regression for #127)", () => {
  it("auto-discards prior status='draft' rows for the same (platform, aspectRatio), leaves approved + out-of-set drafts alone", async () => {
    const { db } = await import("../../server/db");
    const { broadcasts, socialDrafts, broadcastPackageApprovals } = await import("../../shared/schema");
    const { approvePackage } = await import(
      "../../server/services/broadcast-compositor-service"
    );
    const { eq, inArray } = await import("drizzle-orm");
    const { spawn } = await import("node:child_process");

    const root = shortsStorageRoot();
    mkdirSync(root, { recursive: true });
    const suffix = Math.random().toString(36).slice(2, 8);
    const pkgId = `pkg_shorts_recut_${suffix}`;

    // Generate a tiny but real 1920x1080 MP4 with ffmpeg so cropToVertical
    // has something valid to crop. Lavfi testsrc → libx264 silent video.
    const sourceMp4 = join(root, `recut_source_${suffix}.mp4`);
    await new Promise<void>((resolvePromise, reject) => {
      const proc = spawn("ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=duration=3:size=1920x1080:rate=30",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-t", "3", sourceMp4,
      ]);
      let stderr = "";
      proc.stderr.on("data", (d) => { stderr += d.toString(); });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0 && existsSync(sourceMp4)) resolvePromise();
        else reject(new Error(`ffmpeg seed failed exit=${code} tail=${stderr.slice(-200)}`));
      });
    });

    // Insert a broadcast pointing at the real MP4 + approve the package so
    // cutShortsForBroadcast clears the approval gate.
    const [bc] = await db.insert(broadcasts).values({
      packageId: pkgId,
      brollPlanId: null,
      anchorVideoUrl: null,
      mp4Path: sourceMp4,
      manifestPath: "/tmp/does-not-exist.manifest.json",
      manifestJson: {
        schemaVersion: 1,
        packageId: pkgId,
        brollPlanId: null,
        anchorVideoUrl: null,
        mp4Filename: basename(sourceMp4),
        dryRun: true,
        generatedAt: new Date().toISOString(),
        generatedBy: "safety_test",
        canvas: { width: 1920, height: 1080, fps: 30, durationSec: 3 },
        layers: ["background", "anchor", "lower-third", "ticker", "source-panel", "channel-bug", "watermark"],
        headline: "regression headline",
        kicker: "NEWS",
        confidence: { level: "high", score: 0.9 },
        sources: [{ name: "Reuters", url: null, license: "owned", attribution: null, tier: null }],
        safety: {
          publicPublishing: false,
          youtubeUpload: false,
          socialPosting: false,
          externalUpload: false,
          requiresFounderApprovalForLive: true,
        },
      },
      status: "rendered",
      dryRun: true,
      createdBy: "safety_test",
    }).returning();

    await approvePackage(pkgId, "safety_test", "test seed for re-cut regression");

    // Pre-seed three social_drafts rows + matching on-disk artifacts. Files
    // must live INSIDE the shorts root so cleanupReplacedShortsFile is allowed
    // to unlink them.
    const priorDraftClip = join(root, `recut_prior_draft_clip_${suffix}.mp4`);
    const priorDraftThumb = join(root, `recut_prior_draft_thumb_${suffix}.png`);
    const approvedClip = join(root, `recut_prior_approved_clip_${suffix}.mp4`);
    const approvedThumb = join(root, `recut_prior_approved_thumb_${suffix}.png`);
    const outOfSetClip = join(root, `recut_prior_outofset_clip_${suffix}.mp4`);
    const outOfSetThumb = join(root, `recut_prior_outofset_thumb_${suffix}.png`);
    writeFileSync(priorDraftClip, "prior-draft-clip");
    writeFileSync(priorDraftThumb, "prior-draft-thumb");
    writeFileSync(approvedClip, "approved-clip");
    writeFileSync(approvedThumb, "approved-thumb");
    writeFileSync(outOfSetClip, "outofset-clip");
    writeFileSync(outOfSetThumb, "outofset-thumb");

    // Matches DEFAULT_VARIANTS[0] (youtube_shorts / 9:16) — must be retired.
    const [priorDraftRow] = await db.insert(socialDrafts).values({
      broadcastId: bc.id,
      platform: "youtube_shorts",
      aspectRatio: "9:16",
      durationSec: 30,
      clipPath: priorDraftClip,
      caption: "prior draft caption",
      thumbnailPath: priorDraftThumb,
      hashtags: [],
      status: "draft",
    }).returning();

    // Matches DEFAULT_VARIANTS[1] (instagram_reels / 9:16) — but is already
    // approved, so the retire filter must skip it.
    const [approvedRow] = await db.insert(socialDrafts).values({
      broadcastId: bc.id,
      platform: "instagram_reels",
      aspectRatio: "9:16",
      durationSec: 60,
      clipPath: approvedClip,
      caption: "approved caption",
      thumbnailPath: approvedThumb,
      hashtags: [],
      status: "approved",
      approved: true,
      approvedBy: "safety_test",
      approvedAt: new Date(),
    }).returning();

    // (platform, aspectRatio) = (tiktok, 9:16) is NOT in DEFAULT_VARIANTS
    // (default tiktok variant is 1:1), so this prior draft must be left alone.
    const [outOfSetRow] = await db.insert(socialDrafts).values({
      broadcastId: bc.id,
      platform: "tiktok",
      aspectRatio: "9:16",
      durationSec: 30,
      clipPath: outOfSetClip,
      caption: "out-of-set caption",
      thumbnailPath: outOfSetThumb,
      hashtags: [],
      status: "draft",
    }).returning();

    let producedIds: string[] = [];
    try {
      const produced = await shortsCutterService.cutShortsForBroadcast(bc.id, {
        actorId: "safety_test",
      });
      producedIds = produced.map((r) => r.id);

      assert.equal(produced.length, DEFAULT_VARIANTS.length, "should emit one draft per default variant");
      for (const r of produced) {
        assert.equal(r.status, "draft", "new rows must land as status='draft'");
        assert.equal(r.broadcastId, bc.id);
      }

      // Prior matching draft → discarded + on-disk artifacts unlinked.
      const [priorAfter] = await db
        .select()
        .from(socialDrafts)
        .where(eq(socialDrafts.id, priorDraftRow.id));
      assert.ok(priorAfter, "prior draft row should still exist (status flipped, not deleted)");
      assert.equal(priorAfter.status, "discarded", "prior matching draft must be auto-retired");
      assert.equal(priorAfter.approved, false);
      assert.equal(priorAfter.thumbnailPath, null, "discardShort must null out thumbnailPath");
      assert.equal(priorAfter.clipPath, "", "discardShort must clear clipPath");
      assert.equal(existsSync(priorDraftClip), false, "prior draft clip must be unlinked from disk");
      assert.equal(existsSync(priorDraftThumb), false, "prior draft thumbnail must be unlinked from disk");

      // Approved row → fully untouched (status, files, paths).
      const [approvedAfter] = await db
        .select()
        .from(socialDrafts)
        .where(eq(socialDrafts.id, approvedRow.id));
      assert.equal(approvedAfter.status, "approved", "approved row must NOT be retired by a re-cut");
      assert.equal(approvedAfter.approved, true);
      assert.equal(approvedAfter.clipPath, approvedClip);
      assert.equal(approvedAfter.thumbnailPath, approvedThumb);
      assert.equal(existsSync(approvedClip), true, "approved clip must remain on disk");
      assert.equal(existsSync(approvedThumb), true, "approved thumbnail must remain on disk");

      // Out-of-set draft → fully untouched.
      const [outOfSetAfter] = await db
        .select()
        .from(socialDrafts)
        .where(eq(socialDrafts.id, outOfSetRow.id));
      assert.equal(outOfSetAfter.status, "draft", "draft whose (platform, aspectRatio) is not in the requested variants must NOT be retired");
      assert.equal(outOfSetAfter.clipPath, outOfSetClip);
      assert.equal(outOfSetAfter.thumbnailPath, outOfSetThumb);
      assert.equal(existsSync(outOfSetClip), true, "out-of-set clip must remain on disk");
      assert.equal(existsSync(outOfSetThumb), true, "out-of-set thumbnail must remain on disk");
    } finally {
      // Clean up rows + on-disk artifacts.
      const allDraftIds = [priorDraftRow.id, approvedRow.id, outOfSetRow.id, ...producedIds];
      if (allDraftIds.length > 0) {
        // Read produced rows to clean their files too.
        const producedRows = await db
          .select()
          .from(socialDrafts)
          .where(inArray(socialDrafts.id, allDraftIds));
        for (const r of producedRows) {
          if (r.clipPath && existsSync(r.clipPath)) rmSync(r.clipPath, { force: true });
          if (r.thumbnailPath && existsSync(r.thumbnailPath)) rmSync(r.thumbnailPath, { force: true });
        }
      }
      for (const p of [
        priorDraftClip, priorDraftThumb,
        approvedClip, approvedThumb,
        outOfSetClip, outOfSetThumb,
        sourceMp4,
      ]) {
        if (existsSync(p)) rmSync(p, { force: true });
      }
      await db.delete(socialDrafts).where(eq(socialDrafts.broadcastId, bc.id));
      await db.delete(broadcasts).where(eq(broadcasts.id, bc.id));
      await db.delete(broadcastPackageApprovals).where(eq(broadcastPackageApprovals.packageId, pkgId));
    }
  });
});

describe("shorts cutter — abandoned staged thumbnail sweep", () => {
  it("deletes only old, unreferenced sh_*_frame_*.png / sh_*_ai_*.png files and preserves crops, clips, fresh files, and referenced rows", async () => {
    // Point the service at a fully-isolated shorts root so the sweep cannot
    // see (and therefore cannot delete) anything from the real workspace.
    const tempBase = mkdtempSync(join(tmpdir(), "shorts-sweep-safety-"));
    const tempRoot = join(tempBase, "shorts");
    mkdirSync(tempRoot, { recursive: true });
    const originalPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tempBase;

    const suffix = Math.random().toString(36).slice(2, 8);
    // Files that MUST be deleted: old + matches abandoned regex + unreferenced.
    const oldFrame = join(tempRoot, `sh_old1${suffix}_frame_abc123.png`);
    const oldAi = join(tempRoot, `sh_old2${suffix}_ai_def456.png`);
    // File that MUST be preserved: old + matches regex + REFERENCED by a draft row.
    const oldReferencedFrame = join(tempRoot, `sh_ref${suffix}_frame_ghi789.png`);
    // Files that MUST be preserved: fresh mtime (inside the keep-alive window).
    const freshFrame = join(tempRoot, `sh_fresh${suffix}_frame_jkl012.png`);
    const freshAi = join(tempRoot, `sh_fresh${suffix}_ai_mno345.png`);
    // Files that MUST be preserved: do not match the abandoned regex at all.
    const cropFile = join(tempRoot, `sh_keep${suffix}_crop_pqr678.png`);
    const clipFile = join(tempRoot, `sh_keep${suffix}_clip_stu901.mp4`);
    // Sanity: an unrelated file in the same dir must also be left alone.
    const unrelatedFile = join(tempRoot, `not_a_shorts_file_${suffix}.png`);

    for (const f of [oldFrame, oldAi, oldReferencedFrame, freshFrame, freshAi, cropFile, clipFile, unrelatedFile]) {
      writeFileSync(f, `bytes-${basename(f)}`);
    }

    // Backdate "old" file mtimes well past the sweep cutoff.
    const longPast = new Date(Date.now() - (ABANDONED_THUMB_DEFAULT_MAX_AGE_MS + 10 * 60 * 1000) - 60_000);
    for (const f of [oldFrame, oldAi, oldReferencedFrame]) {
      utimesSync(f, longPast, longPast);
    }
    // Sanity-check the backdate actually landed below the cutoff.
    const cutoff = Date.now() - ABANDONED_THUMB_DEFAULT_MAX_AGE_MS;
    for (const f of [oldFrame, oldAi, oldReferencedFrame]) {
      assert.ok(statSync(f).mtimeMs <= cutoff, `mtime backdate failed for ${f}`);
    }

    const broadcastId = await insertSafetyBroadcast(`sweep_${suffix}`);
    // The draft references oldReferencedFrame by its absolute path — same
    // shape as a real staged candidate would use.
    const draftId = await insertDraft(broadcastId, oldReferencedFrame);

    try {
      const result = await sweepAbandonedStagedThumbnails();

      // Only the abandoned-regex files in the dir count as "scanned".
      assert.equal(result.scanned, 5, `expected scanned=5, got ${result.scanned}`);
      assert.equal(result.deleted, 2, `expected deleted=2 (oldFrame + oldAi), got ${result.deleted}`);
      assert.equal(result.skippedReferenced, 1, `expected skippedReferenced=1, got ${result.skippedReferenced}`);
      assert.equal(result.skippedFresh, 2, `expected skippedFresh=2, got ${result.skippedFresh}`);
      assert.equal(result.errors, 0, `expected errors=0, got ${result.errors}`);

      // Hard disk assertions — the actual safety guarantee.
      assert.equal(existsSync(oldFrame), false, "abandoned sh_*_frame_*.png must be unlinked");
      assert.equal(existsSync(oldAi), false, "abandoned sh_*_ai_*.png must be unlinked");
      assert.equal(existsSync(oldReferencedFrame), true, "referenced staged thumbnail must be preserved");
      assert.equal(existsSync(freshFrame), true, "fresh sh_*_frame_*.png must be preserved");
      assert.equal(existsSync(freshAi), true, "fresh sh_*_ai_*.png must be preserved");
      assert.equal(existsSync(cropFile), true, "sh_*_crop_*.png must never be touched by the sweep");
      assert.equal(existsSync(clipFile), true, "sh_*_clip_*.mp4 must never be touched by the sweep");
      assert.equal(existsSync(unrelatedFile), true, "non-matching files must never be touched by the sweep");
    } finally {
      if (originalPrivateDir === undefined) {
        delete process.env.PRIVATE_OBJECT_DIR;
      } else {
        process.env.PRIVATE_OBJECT_DIR = originalPrivateDir;
      }
      rmSync(tempBase, { recursive: true, force: true });
      await cleanupRows([broadcastId]);
    }
  });
});
