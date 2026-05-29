/**
 * T7 — Admin anchor routes.
 *
 * SAFETY:
 *  - All routes require root admin.
 *  - CSRF is enforced globally on /api/* in server/index.ts.
 *  - Clip streaming serves files only from PRIVATE_OBJECT_DIR/anchors
 *    (or the local fallback). No public/signed URLs.
 *  - Render endpoint always defaults to dryRun=true. Live rendering is
 *    rejected by the adapter; no live path exists in this phase.
 *  - The sensitivity gate is enforced server-side; the client cannot
 *    bypass it by sending mode=shapeshift on a sensitive story.
 */

import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  anchorDirectorService,
  type AnchorBriefContext,
} from "../services/anchor-director-service";
import {
  ANCHOR_MODES,
  AnchorModeError,
  isSensitiveBeat,
  listModes,
  type AnchorMode,
} from "../services/anchor/modes";

const AnchorModeSchema = z.enum(ANCHOR_MODES as unknown as [AnchorMode, ...AnchorMode[]]);

const BriefSchema = z.object({
  packageId: z.string().min(1).max(120),
  mood: z.string().max(60).nullable().optional(),
  eventType: z.string().max(80).nullable().optional(),
  sensitive: z.boolean().nullable().optional(),
});

const BeatSchema = z.object({
  index: z.number().int().min(0).max(99),
  text: z.string().min(1).max(4000),
  mood: z.string().max(60).nullable().optional(),
  modeOverride: AnchorModeSchema.nullable().optional(),
});

const RenderBeatBodySchema = z.object({
  brief: BriefSchema,
  beat: BeatSchema,
  mode: AnchorModeSchema.nullable().optional(),
  durationMs: z.number().int().min(2000).max(30_000).nullable().optional(),
  dryRun: z.boolean().nullable().optional(),
});

const PickBodySchema = z.object({
  brief: BriefSchema,
  beats: z.array(BeatSchema).min(1).max(20),
});

function ensureInsideAnchorsRoot(filePath: string): boolean {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  const root = envDir
    ? resolve(envDir, "anchors")
    : resolve(process.cwd(), ".local/media-assets/anchors");
  const abs = resolve(filePath);
  return abs === root || abs.startsWith(root + "/");
}

export function registerAnchorRoutes(app: Express, requireRootAdmin: RequestHandler): void {
  app.get("/api/admin/anchor/modes", requireRootAdmin, async (_req, res) => {
    res.json({ ok: true, modes: listModes() });
  });

  app.post("/api/admin/anchor/pick", requireRootAdmin, async (req, res) => {
    const parsed = PickBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const picks = anchorDirectorService.pickModeSequence(
        parsed.data.brief as AnchorBriefContext,
        parsed.data.beats,
      );
      res.json({ ok: true, picks });
    } catch (err) {
      if (err instanceof AnchorModeError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/anchor/render-beat", requireRootAdmin, async (req: any, res) => {
    const parsed = RenderBeatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const actorId =
      req.session?.adminActorId ||
      req.session?.userId ||
      "root_admin";

    // Defence-in-depth: independently compute sensitivity here so a
    // client cannot disguise a sensitive story to sneak shapeshift through.
    const sensitive = isSensitiveBeat({
      sensitive: parsed.data.brief.sensitive ?? null,
      eventType: parsed.data.brief.eventType ?? null,
      mood: parsed.data.beat.mood ?? parsed.data.brief.mood ?? null,
    });
    const chosen = parsed.data.mode ?? parsed.data.beat.modeOverride ?? null;
    if (chosen === "shapeshift_explainer" && sensitive) {
      return res.status(403).json({
        ok: false,
        error: "mode_blocked_sensitive",
        message: "shapeshift_explainer is blocked on sensitive stories.",
      });
    }

    try {
      const clip = await anchorDirectorService.renderBeat({
        brief: parsed.data.brief as AnchorBriefContext,
        beat: {
          index: parsed.data.beat.index,
          text: parsed.data.beat.text,
          mood: parsed.data.beat.mood ?? null,
          modeOverride: parsed.data.beat.modeOverride ?? null,
        },
        mode: parsed.data.mode ?? null,
        durationMs: parsed.data.durationMs ?? null,
        dryRun: parsed.data.dryRun ?? true,
        actorId,
      });
      res.json({
        ok: true,
        clip,
        previewUrl: `/api/admin/anchor/clips/${clip.id}`,
      });
    } catch (err) {
      if (err instanceof AnchorModeError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      console.error("[anchor] render-beat failed", err);
      res.status(500).json({ ok: false, error: "render_failed", message: (err as Error).message });
    }
  });

  app.get("/api/admin/anchor/packages/:packageId/clips", requireRootAdmin, async (req, res) => {
    const clips = await anchorDirectorService.listClipsForPackage(String(req.params.packageId));
    res.json({ ok: true, clips });
  });

  app.get("/api/admin/anchor/clips/:id", requireRootAdmin, async (req, res) => {
    const clip = await anchorDirectorService.getClip(String(req.params.id));
    if (!clip) return res.status(404).json({ ok: false, error: "not_found" });
    const metaQ = typeof req.query.meta === "string" ? req.query.meta : "";
    const wantsMeta = metaQ === "1" || metaQ === "true";
    if (wantsMeta) {
      return res.json({ ok: true, clip });
    }
    if (!clip.clipPath || !existsSync(clip.clipPath)) {
      return res.status(404).json({ ok: false, error: "file_missing" });
    }
    if (!ensureInsideAnchorsRoot(clip.clipPath)) {
      return res.status(403).json({ ok: false, error: "path_escape" });
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "private, no-store");
    createReadStream(clip.clipPath).pipe(res);
  });
}
