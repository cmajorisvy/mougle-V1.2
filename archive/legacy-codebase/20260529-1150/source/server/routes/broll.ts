/**
 * Newsroom T4 — Legal B-Roll Resolver admin routes.
 *
 * SAFETY:
 *   - Every route requires root admin (`requireRootAdmin`).
 *   - CSRF enforced globally on /api/* by csrfMiddleware.
 *   - All resolved candidates pass through the safety harness + blocklist
 *     inside the resolver; routes do no media inspection of their own.
 *   - Live cost-bearing adapter calls remain gated by BROLL_DRY_RUN +
 *     BROLL_FOUNDER_LIVE_OPT_IN env flags.
 */

import type { Express, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { brollClips, brollPlans } from "@shared/schema";
import {
  resolveAndPersistPlan,
  getPlansForBrief,
  swapClipInPlan,
} from "../services/broll/resolver";
import { buildSignedUrl as buildMapboxSignedUrl } from "../services/broll/adapters/mapbox";
import { getAdminVerification } from "../middleware/admin-auth";

const BeatSchema = z.object({
  beatId: z.string().min(1).max(120),
  query: z.string().min(1).max(400),
  durationSec: z.number().int().min(1).max(120),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      zoom: z.number().int().min(1).max(20).optional(),
      label: z.string().max(200).optional(),
    })
    .optional(),
  preferredTier: z
    .enum([
      "paid_licensed",
      "public_domain",
      "pexels",
      "pixabay",
      "mapbox",
      "runway",
      "remotion_motion",
    ])
    .optional(),
});

const ResolveBodySchema = z.object({
  briefId: z.string().min(1).max(200),
  beats: z.array(BeatSchema).min(1).max(40),
});

const SwapBodySchema = z.object({
  planId: z.string().min(1),
  beatId: z.string().min(1),
  clipId: z.string().min(1),
});

export function registerBRollRoutes(app: Express, requireRootAdmin: RequestHandler) {
  app.post("/api/admin/broll/resolve", requireRootAdmin, async (req: any, res) => {
    const parsed = ResolveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
    }
    const admin = getAdminVerification(req);
    try {
      const plan = await resolveAndPersistPlan({
        briefId: parsed.data.briefId,
        beats: parsed.data.beats,
        createdBy: admin?.actor.id ?? "root-admin",
      });
      res.json({ plan });
    } catch (err: any) {
      console.error("[broll-routes] resolve failed", err);
      res.status(500).json({ message: err?.message ?? "Failed to resolve B-roll" });
    }
  });

  app.get("/api/admin/broll/plans/:briefId", requireRootAdmin, async (req, res) => {
    const briefId = String(req.params.briefId || "").trim();
    if (!briefId) return res.status(400).json({ message: "briefId required" });
    try {
      const plans = await getPlansForBrief(briefId);
      res.json({ plans });
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Failed to load plans" });
    }
  });

  app.get("/api/admin/broll/plans-by-id/:planId", requireRootAdmin, async (req, res) => {
    const planId = String(req.params.planId || "").trim();
    if (!planId) return res.status(400).json({ message: "planId required" });
    const [plan] = await db.select().from(brollPlans).where(eq(brollPlans.id, planId)).limit(1);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ plan });
  });

  app.post("/api/admin/broll/swap-clip", requireRootAdmin, async (req, res) => {
    const parsed = SwapBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
    }
    try {
      const plan = await swapClipInPlan(parsed.data);
      res.json({ plan });
    } catch (err: any) {
      res.status(400).json({ message: err?.message ?? "Failed to swap clip" });
    }
  });

  /**
   * Mapbox proxy — fetches a static map tile server-side, injecting the
   * MAPBOX_TOKEN. The token is NEVER persisted in `broll_clips.url` nor
   * returned in API payloads; clients reference clips by id and pull them
   * through this proxy at render time.
   */
  app.get("/api/admin/broll/mapbox-proxy/:clipId", requireRootAdmin, async (req, res) => {
    const clipId = String(req.params.clipId || "").trim();
    if (!clipId) return res.status(400).json({ message: "clipId required" });
    const [clip] = await db.select().from(brollClips).where(eq(brollClips.id, clipId)).limit(1);
    if (!clip) return res.status(404).json({ message: "Clip not found" });
    if (clip.source !== "mapbox") {
      return res.status(400).json({ message: "Clip is not a mapbox tile" });
    }
    const meta = (clip.metadata ?? {}) as { lat?: number; lon?: number; zoom?: number };
    if (typeof meta.lat !== "number" || typeof meta.lon !== "number") {
      return res.status(400).json({ message: "Clip missing geo metadata" });
    }
    const signed = buildMapboxSignedUrl({
      lat: meta.lat,
      lon: meta.lon,
      zoom: typeof meta.zoom === "number" ? meta.zoom : 8,
    });
    if (!signed) return res.status(503).json({ message: "MAPBOX_TOKEN not configured" });
    try {
      const upstream = await fetch(signed);
      if (!upstream.ok) {
        return res.status(502).json({ message: `Upstream failed: ${upstream.status}` });
      }
      const ct = upstream.headers.get("content-type") ?? "image/png";
      res.setHeader("Content-Type", ct);
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (err: any) {
      res.status(502).json({ message: err?.message ?? "Upstream fetch failed" });
    }
  });

  app.get("/api/admin/broll/clips", requireRootAdmin, async (req, res) => {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    let rows;
    if (query) {
      rows = await db.select().from(brollClips).where(eq(brollClips.query, query)).limit(50);
    } else {
      rows = await db.select().from(brollClips).limit(50);
    }
    res.json({ clips: rows });
  });
}
