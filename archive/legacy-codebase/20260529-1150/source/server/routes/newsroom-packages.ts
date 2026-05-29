/**
 * Newsroom T5 — Newsroom Package admin routes.
 *
 * SAFETY:
 *   - All routes require root admin.
 *   - CSRF is enforced globally for non-GET requests on /api/*.
 *   - No publish / social / hardware / render calls happen here.
 *   - Downstream consumers must call
 *     `newsroomPackageBuilderService.readApprovedPackage` — these
 *     routes only return drafts to admins for inspection / editing.
 *   - 4D cues submitted via PATCH go through the strict cue schema,
 *     which forbids hardware payloads.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  newsroomPackageBuilderService,
  NewsroomPackageSafetyError,
} from "../services/newsroom-package-builder-service";
import {
  NewsroomPackagePatchSchema,
  NewsroomPackageStatusSchema,
} from "../../shared/newsroom-types";

const ListQuerySchema = z.object({
  status: NewsroomPackageStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function adminIdFromReq(req: any): string {
  return (
    req?.session?.adminId ||
    req?.session?.userId ||
    req?.user?.id ||
    "admin:unknown"
  );
}

export function registerNewsroomPackageRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  /** GET — history (most-recent-first). Optional ?status & ?limit. */
  app.get(
    "/api/admin/newsroom-packages",
    requireRootAdmin,
    async (req, res) => {
      try {
        const parsed = ListQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({ message: "invalid query" });
        }
        const packages = await newsroomPackageBuilderService.listPackages(
          parsed.data,
        );
        res.json({ packages });
      } catch (err) {
        console.error("[newsroom-packages:list]", err);
        res.status(500).json({ message: "list failed" });
      }
    },
  );

  /** GET — single package by id. */
  app.get(
    "/api/admin/newsroom-packages/:id",
    requireRootAdmin,
    async (req, res) => {
      try {
        const pkg = await newsroomPackageBuilderService.getPackage(
          String(req.params.id),
        );
        if (!pkg) return res.status(404).json({ message: "not found" });
        res.json({ package: pkg });
      } catch (err) {
        console.error("[newsroom-packages:get]", err);
        res.status(500).json({ message: "get failed" });
      }
    },
  );

  /**
   * POST — build (or return) a newsroom package for an APPROVED brief.
   * Idempotent on briefId. Refuses non-approved briefs (via the brief
   * builder's approval gate).
   */
  app.post(
    "/api/admin/newsroom-packages/from-brief/:briefId",
    requireRootAdmin,
    async (req, res) => {
      try {
        const pkg = await newsroomPackageBuilderService.generateForBrief(
          String(req.params.briefId),
        );
        res.json({ package: pkg, idempotent: true });
      } catch (err: any) {
        if (err instanceof NewsroomPackageSafetyError) {
          return res
            .status(err.code === "not_found" ? 404 : 409)
            .json({ message: err.message, code: err.code });
        }
        if (err?.name === "BroadcastBriefSafetyError") {
          return res
            .status(err.code === "not_found" ? 404 : 409)
            .json({ message: err.message, code: err.code });
        }
        console.error("[newsroom-packages:generate]", err);
        res.status(500).json({ message: "generate failed" });
      }
    },
  );

  /** PATCH — admin edit. Strict shape; safety fields are not patchable. */
  app.patch(
    "/api/admin/newsroom-packages/:id",
    requireRootAdmin,
    async (req, res) => {
      try {
        const parsed = NewsroomPackagePatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.errors[0]?.message ?? "invalid body",
          });
        }
        const pkg = await newsroomPackageBuilderService.patchPackage(
          String(req.params.id),
          parsed.data,
          { adminId: adminIdFromReq(req) },
        );
        res.json({ package: pkg });
      } catch (err) {
        if (err instanceof NewsroomPackageSafetyError) {
          const status =
            err.code === "not_found"
              ? 404
              : err.code === "cue_not_simulation_only"
              ? 400
              : 400;
          return res
            .status(status)
            .json({ message: err.message, code: err.code });
        }
        console.error("[newsroom-packages:patch]", err);
        res.status(500).json({ message: "patch failed" });
      }
    },
  );

  /** POST — advance a draft package to approved status. */
  app.post(
    "/api/admin/newsroom-packages/:id/approve",
    requireRootAdmin,
    async (req, res) => {
      try {
        const pkg = await newsroomPackageBuilderService.approvePackage(
          String(req.params.id),
          { adminId: adminIdFromReq(req) },
        );
        res.json({ package: pkg });
      } catch (err) {
        if (err instanceof NewsroomPackageSafetyError) {
          return res
            .status(err.code === "not_found" ? 404 : 400)
            .json({ message: err.message, code: err.code });
        }
        console.error("[newsroom-packages:approve]", err);
        res.status(500).json({ message: "approve failed" });
      }
    },
  );
}
