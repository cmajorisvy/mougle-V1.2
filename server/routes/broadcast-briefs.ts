/**
 * Newsroom T3 — Broadcast Brief admin routes.
 *
 * SAFETY:
 *   - All routes require root admin (`requireRootAdmin`).
 *   - CSRF is enforced globally for non-GET requests on /api/* via the
 *     csrfMiddleware mounted in server/index.ts.
 *   - No publish / social / render / hardware calls happen here.
 *   - GET endpoints return draft briefs; downstream consumers must call
 *     `broadcastBriefBuilderService.readApprovedBrief` which refuses
 *     anything not in approvalStatus='approved'.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  broadcastBriefBuilderService,
  BroadcastBriefSafetyError,
} from "../services/broadcast-brief-builder-service";
import { newsroomPackageBuilderService } from "../services/newsroom-package-builder-service";
import {
  BroadcastBriefPatchSchema,
  BroadcastBriefStatusSchema,
  VerifiedKnowledgeSchema,
} from "../../shared/newsroom-types";

const ListQuerySchema = z.object({
  approvalStatus: BroadcastBriefStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const GenerateBodySchema = z.object({
  storyId: z.string().min(1).max(200),
  articleId: z.number().int().positive().nullable().optional(),
  verifiedKnowledge: VerifiedKnowledgeSchema,
});

function adminIdFromReq(req: any): string {
  return (
    req?.session?.adminId ||
    req?.session?.userId ||
    req?.user?.id ||
    "admin:unknown"
  );
}

export function registerBroadcastBriefRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  /** GET — history (most-recent-first). Optional ?approvalStatus & ?limit. */
  app.get(
    "/api/admin/newsroom/broadcast-brief/history",
    requireRootAdmin,
    async (req, res) => {
      try {
        const parsed = ListQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({ message: "invalid query" });
        }
        const briefs = await broadcastBriefBuilderService.listBriefs(
          parsed.data,
        );
        res.json({ briefs });
      } catch (err) {
        console.error("[broadcast-briefs:history]", err);
        res.status(500).json({ message: "history failed" });
      }
    },
  );

  /** GET — single brief by id. */
  app.get(
    "/api/admin/newsroom/broadcast-brief/:id",
    requireRootAdmin,
    async (req, res) => {
      try {
        const id = String(req.params.id);
        if (id === "history") {
          // Express matches /:id before /history when registration order
          // is reversed; guard explicitly to avoid id="history" lookups.
          return res.status(400).json({ message: "invalid id" });
        }
        const brief = await broadcastBriefBuilderService.getBrief(id);
        if (!brief) return res.status(404).json({ message: "not found" });
        res.json({ brief });
      } catch (err) {
        console.error("[broadcast-briefs:get]", err);
        res.status(500).json({ message: "get failed" });
      }
    },
  );

  /**
   * POST — TRIGGER ENTRY POINT. Called by the verification promotion
   * flow once a `verified_knowledge` row reaches status='verified'.
   * Idempotent on `dataPackageId` (URL path param). Always returns a
   * brief in approvalStatus='draft' — never auto-approves, never
   * publishes, never executes.
   *
   * Body: { storyId, articleId?, verifiedKnowledge }
   */
  app.post(
    "/api/admin/newsroom/broadcast-brief/:dataPackageId/generate",
    requireRootAdmin,
    async (req, res) => {
      try {
        const dataPackageId = String(req.params.dataPackageId);
        if (!dataPackageId || dataPackageId.length > 200) {
          return res.status(400).json({ message: "invalid dataPackageId" });
        }
        const parsed = GenerateBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.errors[0]?.message ?? "invalid body",
          });
        }
        const brief = await broadcastBriefBuilderService.generateForDataPackage(
          {
            dataPackageId,
            storyId: parsed.data.storyId,
            articleId: parsed.data.articleId ?? null,
            verifiedKnowledge: parsed.data.verifiedKnowledge,
          },
        );
        res.json({ brief, idempotent: true });
      } catch (err) {
        if (err instanceof BroadcastBriefSafetyError) {
          const status =
            err.code === "not_verified" || err.code === "story_mismatch"
              ? 409
              : 400;
          return res
            .status(status)
            .json({ message: err.message, code: err.code });
        }
        console.error("[broadcast-briefs:generate]", err);
        res.status(500).json({ message: "generate failed" });
      }
    },
  );

  /** PATCH — admin edit (content fields + approvalStatus only). */
  app.patch(
    "/api/admin/newsroom/broadcast-brief/:id",
    requireRootAdmin,
    async (req, res) => {
      try {
        const parsed = BroadcastBriefPatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.errors[0]?.message ?? "invalid body",
          });
        }
        const brief = await broadcastBriefBuilderService.patchBrief(
          String(req.params.id),
          parsed.data,
          { adminId: adminIdFromReq(req) },
        );
        // Newsroom T5: when a brief transitions to 'approved', idempotently
        // build a draft NewsroomPackage so downstream review can start
        // immediately. Errors here MUST NOT roll back the approval —
        // they're logged and surfaced as a non-blocking side-channel.
        if (brief.approvalStatus === "approved") {
          try {
            await newsroomPackageBuilderService.generateForBrief(brief.id);
          } catch (genErr) {
            console.error(
              "[broadcast-briefs:patch] auto-generate newsroom package failed",
              genErr,
            );
          }
        }
        res.json({ brief });
      } catch (err) {
        if (err instanceof BroadcastBriefSafetyError) {
          const status = err.code === "not_found" ? 404 : 400;
          return res.status(status).json({ message: err.message, code: err.code });
        }
        console.error("[broadcast-briefs:patch]", err);
        res.status(500).json({ message: "patch failed" });
      }
    },
  );
}
