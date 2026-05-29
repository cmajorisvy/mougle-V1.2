/**
 * T9 — Shorts Cutter admin routes.
 *
 * SAFETY:
 *  - All routes require root admin.
 *  - No route posts anything to any external platform; approval flips a flag.
 *  - Clip/thumbnail streams are path-confined to PRIVATE_OBJECT_DIR/shorts
 *    (or local fallback) — never a public URL.
 */

import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Express, RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  shortsCutterService,
  ShortsSafetyError,
  UPLOAD_THUMB_MAX_BYTES,
  type ShortVariantSpec,
} from "../services/shorts-cutter-service";
import {
  SOCIAL_DRAFT_ASPECT_RATIOS,
  SOCIAL_DRAFT_PLATFORMS,
  SOCIAL_DRAFT_STATUSES,
  systemSettings,
} from "@shared/schema";

const SHORTS_DRAFT_QUEUE_THRESHOLD_KEY = "shorts_draft_queue_threshold";
const SHORTS_DRAFT_QUEUE_THRESHOLD_DEFAULT = 5;

const ThresholdBodySchema = z.object({
  threshold: z.number().int().min(0).max(1000),
});

async function readShortsDraftQueueThreshold(): Promise<number> {
  try {
    const row = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SHORTS_DRAFT_QUEUE_THRESHOLD_KEY))
      .limit(1);
    if (row.length === 0) return SHORTS_DRAFT_QUEUE_THRESHOLD_DEFAULT;
    const parsed = Number.parseInt(row[0].value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return SHORTS_DRAFT_QUEUE_THRESHOLD_DEFAULT;
    return parsed;
  } catch {
    return SHORTS_DRAFT_QUEUE_THRESHOLD_DEFAULT;
  }
}

const CutBodySchema = z.object({
  variants: z
    .array(
      z.object({
        platform: z.enum(SOCIAL_DRAFT_PLATFORMS),
        aspectRatio: z.enum(SOCIAL_DRAFT_ASPECT_RATIOS),
        durationSec: z.number().int().min(5).max(90),
      }),
    )
    .max(8)
    .optional(),
});

const PatchBodySchema = z.object({
  caption: z.string().max(220).optional(),
  hashtags: z.array(z.string().max(40)).max(12).optional(),
  thumbnailPath: z.string().max(1024).nullable().optional(),
  suggestedPostAt: z.string().datetime().nullable().optional(),
});

const FrameThumbBodySchema = z.object({
  atSec: z.number().min(0).max(120),
});

const CropSaveBodySchema = z.object({
  cropX: z.number().min(0).max(8192),
  cropY: z.number().min(0).max(8192),
  cropWidth: z.number().min(16).max(8192),
  cropHeight: z.number().min(16).max(8192),
  lastCropRect: z
    .object({
      nx: z.number().finite(),
      ny: z.number().finite(),
      nw: z.number().finite().positive(),
      nh: z.number().finite().positive(),
      sourceWidth: z.number().finite().positive(),
      sourceHeight: z.number().finite().positive(),
    })
    .optional(),
});

const TOKEN_RE = /^sh_[a-z0-9_]+\.png$/i;

const ListQuerySchema = z.object({
  broadcastId: z.string().max(120).optional(),
  status: z.enum(SOCIAL_DRAFT_STATUSES).optional(),
});

function privateRoot(sub: string): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  return envDir
    ? resolve(envDir, sub)
    : resolve(process.cwd(), ".local/media-assets", sub);
}

function ensureInsidePrivateRoot(filePath: string): boolean {
  const root = privateRoot("shorts");
  const abs = resolve(filePath);
  return abs === root || abs.startsWith(root + "/");
}

const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_THUMB_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || "").toLowerCase();
    if (mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg") {
      cb(null, true);
    } else {
      cb(new Error("invalid_mime"));
    }
  },
});

export function registerShortsRoutes(app: Express, requireRootAdmin: RequestHandler): void {
  app.get("/api/admin/shorts/settings/draft-queue-threshold", requireRootAdmin, async (_req, res) => {
    const threshold = await readShortsDraftQueueThreshold();
    res.json({ ok: true, threshold, default: SHORTS_DRAFT_QUEUE_THRESHOLD_DEFAULT });
  });

  app.put("/api/admin/shorts/settings/draft-queue-threshold", requireRootAdmin, async (req: any, res) => {
    const parsed = ThresholdBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const updatedBy = req.session?.adminActorId || req.session?.userId || "root_admin";
    await db
      .insert(systemSettings)
      .values({
        key: SHORTS_DRAFT_QUEUE_THRESHOLD_KEY,
        value: String(parsed.data.threshold),
        updatedBy,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(parsed.data.threshold), updatedBy, updatedAt: new Date() },
      });
    res.json({ ok: true, threshold: parsed.data.threshold });
  });

  app.get("/api/admin/shorts", requireRootAdmin, async (req, res) => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_query", details: parsed.error.flatten() });
    }
    const rows = await shortsCutterService.listShorts(parsed.data);
    res.json({ ok: true, shorts: rows });
  });

  app.get("/api/admin/shorts/:id", requireRootAdmin, async (req, res) => {
    const row = await shortsCutterService.getShort((req.params.id as string));
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, short: row });
  });

  app.post("/api/admin/shorts/cut/:broadcastId", requireRootAdmin, async (req: any, res) => {
    const parsed = CutBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const actorId = req.session?.adminActorId || req.session?.userId || "root_admin";
    try {
      const variants = parsed.data.variants as ShortVariantSpec[] | undefined;
      const rows = await shortsCutterService.cutShortsForBroadcast((req.params.broadcastId as string), {
        variants,
        actorId,
      });
      res.json({ ok: true, shorts: rows });
    } catch (err) {
      if (err instanceof ShortsSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      console.error("[shorts] cut failed", err);
      res.status(500).json({ ok: false, error: "cut_failed", message: (err as Error).message });
    }
  });

  app.patch("/api/admin/shorts/:id", requireRootAdmin, async (req, res) => {
    const parsed = PatchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const row = await shortsCutterService.updateShort((req.params.id as string), {
        caption: parsed.data.caption,
        hashtags: parsed.data.hashtags,
        thumbnailPath: parsed.data.thumbnailPath,
        suggestedPostAt:
          parsed.data.suggestedPostAt === undefined
            ? undefined
            : parsed.data.suggestedPostAt === null
              ? null
              : new Date(parsed.data.suggestedPostAt),
      });
      res.json({ ok: true, short: row });
    } catch (err) {
      if (err instanceof ShortsSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/shorts/:id/approve", requireRootAdmin, async (req: any, res) => {
    const actorId = req.session?.adminActorId || req.session?.userId || "root_admin";
    try {
      const row = await shortsCutterService.approveShort((req.params.id as string), actorId);
      // Explicitly: approval ONLY flips a flag. No platform posting occurs here.
      res.json({ ok: true, short: row, posted: false });
    } catch (err) {
      if (err instanceof ShortsSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.delete("/api/admin/shorts/:id", requireRootAdmin, async (req, res) => {
    try {
      await shortsCutterService.discardShort((req.params.id as string));
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof ShortsSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Stage a frame snapshot WITHOUT persisting it on the row. The admin then
  // crops/repositions via the candidate routes below and finally saves.
  app.post("/api/admin/shorts/:id/thumbnail/frame", requireRootAdmin, async (req, res) => {
    const parsed = FrameThumbBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const id = req.params.id as string;
      const staged = await shortsCutterService.stageThumbnailFromFrame(id, parsed.data.atSec);
      const info = shortsCutterService.describeStagedThumbnail(staged.thumbnailPath);
      res.json({ ok: true, candidate: info });
    } catch (err) {
      if (err instanceof ShortsSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      console.error("[shorts] frame thumbnail failed", err);
      res.status(500).json({ ok: false, error: "frame_thumb_failed", message: (err as Error).message });
    }
  });

  app.post("/api/admin/shorts/:id/thumbnail/ai", requireRootAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const staged = await shortsCutterService.stageAiThumbnail(id);
      const info = shortsCutterService.describeStagedThumbnail(staged.thumbnailPath);
      res.json({ ok: true, candidate: info });
    } catch (err) {
      if (err instanceof ShortsSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      console.error("[shorts] ai thumbnail failed", err);
      res.status(500).json({ ok: false, error: "ai_thumb_failed", message: (err as Error).message });
    }
  });

  const uploadMiddleware: RequestHandler = (req, res, next) => {
    thumbnailUpload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg = (err as Error)?.message || "upload_failed";
        if (msg === "invalid_mime") {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_mime", message: "Only PNG or JPEG files are accepted" });
        }
        if ((err as { code?: string })?.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            ok: false,
            error: "upload_too_large",
            message: `Thumbnail must be ≤ ${Math.round(UPLOAD_THUMB_MAX_BYTES / 1024 / 1024)}MB`,
          });
        }
        return res.status(400).json({ ok: false, error: "upload_failed", message: msg });
      }
      next();
    });
  };
  app.post("/api/admin/shorts/:id/thumbnail/upload", requireRootAdmin, uploadMiddleware, async (req: any, res) => {
    const file = req.file as { buffer: Buffer; mimetype: string } | undefined;
    if (!file) {
      return res.status(400).json({ ok: false, error: "missing_file", message: "Expected a 'file' field" });
    }
    try {
      const id = req.params.id as string;
      const staged = await shortsCutterService.stageUploadedThumbnail(id, file.buffer, file.mimetype);
      const row = await shortsCutterService.updateShort(id, { thumbnailPath: staged.thumbnailPath });
      res.json({ ok: true, short: row });
    } catch (err) {
      if (err instanceof ShortsSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      console.error("[shorts] upload thumbnail failed", err);
      res.status(500).json({ ok: false, error: "upload_thumb_failed", message: (err as Error).message });
    }
  });

  // Stream a staged candidate PNG to the admin so the crop UI can render it.
  app.get("/api/admin/shorts/:id/thumbnail/candidate/:token", requireRootAdmin, async (req, res) => {
    const id = req.params.id as string;
    const token = req.params.token as string;
    if (!TOKEN_RE.test(token)) {
      return res.status(400).json({ ok: false, error: "invalid_token" });
    }
    const root = privateRoot("shorts");
    const abs = resolve(root, token);
    if (!ensureInsidePrivateRoot(abs)) {
      return res.status(403).json({ ok: false, error: "path_outside_private_root" });
    }
    const expectedPrefix = `sh_${id.replace(/[^a-z0-9_]/g, "").slice(0, 16)}_`;
    if (!token.startsWith(expectedPrefix)) {
      return res.status(403).json({ ok: false, error: "candidate_not_owned" });
    }
    if (!existsSync(abs)) {
      return res.status(410).json({ ok: false, error: "candidate_missing" });
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, no-store");
    createReadStream(abs).pipe(res);
  });

  // Crop & persist a staged candidate using a source-pixel rectangle from the
  // crop UI. On success the row's thumbnailPath is updated and the
  // un-cropped staged file is deleted.
  app.post("/api/admin/shorts/:id/thumbnail/candidate/:token/save", requireRootAdmin, async (req, res) => {
    const parsed = CropSaveBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const id = req.params.id as string;
    const token = req.params.token as string;
    try {
      const cropped = await shortsCutterService.cropStagedThumbnail(id, token, {
        x: parsed.data.cropX,
        y: parsed.data.cropY,
        width: parsed.data.cropWidth,
        height: parsed.data.cropHeight,
      });
      const row = await shortsCutterService.updateShort(id, {
        thumbnailPath: cropped.thumbnailPath,
        ...(parsed.data.lastCropRect ? { lastCropRect: parsed.data.lastCropRect } : {}),
      });
      try {
        shortsCutterService.discardStagedThumbnail(id, token);
      } catch (cleanupErr) {
        console.warn("[shorts] failed to clean staged candidate", cleanupErr);
      }
      res.json({ ok: true, short: row });
    } catch (err) {
      if (err instanceof ShortsSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      console.error("[shorts] crop save failed", err);
      res.status(500).json({ ok: false, error: "crop_save_failed", message: (err as Error).message });
    }
  });

  app.delete("/api/admin/shorts/:id/thumbnail/candidate/:token", requireRootAdmin, async (req, res) => {
    const id = req.params.id as string;
    const token = req.params.token as string;
    try {
      const removed = shortsCutterService.discardStagedThumbnail(id, token);
      res.json({ ok: true, removed });
    } catch (err) {
      if (err instanceof ShortsSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      console.error("[shorts] candidate discard failed", err);
      res.status(500).json({ ok: false, error: "candidate_discard_failed", message: (err as Error).message });
    }
  });

  app.get("/api/admin/shorts/:id/clip", requireRootAdmin, async (req, res) => {
    const row = await shortsCutterService.getShort((req.params.id as string));
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    if (!ensureInsidePrivateRoot(row.clipPath)) {
      return res.status(403).json({ ok: false, error: "path_outside_private_root" });
    }
    if (!existsSync(row.clipPath)) {
      return res.status(410).json({ ok: false, error: "clip_missing" });
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Social-Draft-Status", row.status);
    createReadStream(row.clipPath).pipe(res);
  });

  app.get("/api/admin/shorts/:id/thumbnail", requireRootAdmin, async (req, res) => {
    const row = await shortsCutterService.getShort((req.params.id as string));
    if (!row || !row.thumbnailPath) return res.status(404).json({ ok: false, error: "not_found" });
    if (!ensureInsidePrivateRoot(row.thumbnailPath)) {
      return res.status(403).json({ ok: false, error: "path_outside_private_root" });
    }
    if (!existsSync(row.thumbnailPath)) {
      return res.status(410).json({ ok: false, error: "thumbnail_missing" });
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, no-store");
    createReadStream(row.thumbnailPath).pipe(res);
  });
}
