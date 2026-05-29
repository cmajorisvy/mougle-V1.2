/**
 * Phase 1B — Verified Newsroom — Admin preview routes.
 *
 * SAFETY:
 *   - All routes require root admin (`requireRootAdmin`).
 *   - CSRF is already enforced globally on `/api/*` via `csrfMiddleware`
 *     in `server/index.ts` (any non-GET POST requires `x-csrf-token`).
 *   - Routes are DRY-RUN only: they accept articles in the request body,
 *     return cluster + claim previews, and write NOTHING to the database.
 *   - No autonomous promotion. No public exposure (root-admin gated).
 *   - No external provider calls — the deterministic services are used.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  clusterArticles,
  type ClusterableArticle,
} from "../services/newsroom/clusteringService";
import { extractClusterClaims } from "../services/newsroom/claimExtractionService";
import {
  buildNewsroomDataPackage,
  summarizePackageVerification,
  NewsroomPackageRejectedError,
} from "../services/newsroom/newsroomDataPackageBuilder";
import {
  VerifiedKnowledgeSchema,
  VerifiedMediaReferenceSchema,
  VerifiedTimelineEventSchema,
  PackageTemplateSchema,
  VerificationStatusSchema,
} from "../../shared/newsroom-types";

const ArticleInputSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  sourceName: z.string().min(1).max(200),
  sourceUrl: z.string().url(),
  title: z.string().min(1).max(500),
  summary: z.string().max(5000).nullish(),
  category: z.string().max(80).nullish(),
  publishedAt: z
    .union([z.string().datetime(), z.string(), z.date()])
    .nullish(),
});

const ClusterPreviewBodySchema = z.object({
  articles: z.array(ArticleInputSchema).min(1).max(200),
  windowMinutes: z.number().int().min(15).max(24 * 60).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  minClusterSize: z.number().int().min(1).max(20).optional(),
  dryRun: z.literal(true),
});

const ClaimsPreviewBodySchema = ClusterPreviewBodySchema.extend({
  maxClaims: z.number().int().min(1).max(20).optional(),
});

const PackagePreviewBodySchema = z.object({
  verifiedKnowledge: VerifiedKnowledgeSchema,
  mediaRefs: z.array(VerifiedMediaReferenceSchema).optional(),
  timelineEvents: z.array(VerifiedTimelineEventSchema).optional(),
  template: PackageTemplateSchema.optional(),
  version: z.number().int().positive().optional(),
  generatedAt: z.string().min(1),
  workflowStatus: VerificationStatusSchema.optional(),
  previewMode: z.boolean().optional(),
  dryRun: z.literal(true),
});

export function registerNewsroomPreviewRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  /**
   * POST /api/admin/newsroom/cluster-preview
   * Body: { articles: ArticleInput[], dryRun: true, ...options }
   * Returns: clusters[] (no DB writes).
   */
  app.post(
    "/api/admin/newsroom/cluster-preview",
    requireRootAdmin,
    async (req, res) => {
      const parsed = ClusterPreviewBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "invalid_body",
          issues: parsed.error.issues,
        });
      }
      const { articles, windowMinutes, similarityThreshold, minClusterSize } =
        parsed.data;
      const clusters = await clusterArticles(
        articles as ClusterableArticle[],
        { windowMinutes, similarityThreshold, minClusterSize },
      );
      return res.json({
        ok: true,
        dryRun: true,
        promoted: false,
        articleCount: articles.length,
        clusterCount: clusters.length,
        clusters,
      });
    },
  );

  /**
   * POST /api/admin/newsroom/claims-preview
   * Body: { articles: ArticleInput[], dryRun: true, ...options }
   * Returns: clusters[] + extractions[] (no DB writes).
   */
  app.post(
    "/api/admin/newsroom/claims-preview",
    requireRootAdmin,
    async (req, res) => {
      const parsed = ClaimsPreviewBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "invalid_body",
          issues: parsed.error.issues,
        });
      }
      const {
        articles,
        windowMinutes,
        similarityThreshold,
        minClusterSize,
        maxClaims,
      } = parsed.data;
      const inputs = articles as ClusterableArticle[];
      const clusters = await clusterArticles(inputs, {
        windowMinutes,
        similarityThreshold,
        minClusterSize,
      });
      const byId = new Map(inputs.map((a) => [a.id, a]));
      const extractions = await Promise.all(
        clusters.map((c) => extractClusterClaims(c, byId, { maxClaims })),
      );
      return res.json({
        ok: true,
        dryRun: true,
        promoted: false,
        articleCount: articles.length,
        clusterCount: clusters.length,
        clusters,
        extractions,
      });
    },
  );

  /**
   * POST /api/admin/newsroom/package-preview
   * Body: { verifiedKnowledge, mediaRefs?, timelineEvents?, template?,
   *         version?, generatedAt, workflowStatus?, previewMode?,
   *         dryRun: true }
   * Returns: pure NewsroomDataPackagePayload preview + safety notes + summary.
   * NEVER writes to DB. NEVER triggers render / publish / social.
   */
  app.post(
    "/api/admin/newsroom/package-preview",
    requireRootAdmin,
    async (req, res) => {
      const parsed = PackagePreviewBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "invalid_body",
          issues: parsed.error.issues,
        });
      }
      try {
        const result = buildNewsroomDataPackage({
          verifiedKnowledge: parsed.data.verifiedKnowledge,
          mediaRefs: parsed.data.mediaRefs,
          timelineEvents: parsed.data.timelineEvents,
          template: parsed.data.template,
          version: parsed.data.version,
          generatedAt: parsed.data.generatedAt,
          workflowStatus: parsed.data.workflowStatus,
          previewMode: parsed.data.previewMode,
        });
        return res.json({
          ok: true,
          dryRun: true,
          promoted: false,
          renderStarted: false,
          publishQueued: false,
          publishable: result.publishable,
          publishableReason: result.publishableReason,
          payload: result.payload,
          safetyNotes: result.safetyNotes,
          timelineEvents: result.timelineEvents,
          summary: summarizePackageVerification(result),
        });
      } catch (err) {
        if (err instanceof NewsroomPackageRejectedError) {
          return res.status(409).json({
            ok: false,
            error: "package_rejected",
            workflowStatus: err.status,
            message: err.message,
            hint: "Pass previewMode: true to inspect rejected data.",
          });
        }
        return res.status(500).json({
          ok: false,
          error: "build_failed",
          message: (err as Error)?.message ?? "unknown",
        });
      }
    },
  );
}
