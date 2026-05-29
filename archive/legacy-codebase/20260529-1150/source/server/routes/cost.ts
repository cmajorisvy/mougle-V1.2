/**
 * T10 — Cost Control admin routes.
 *
 * All routes are root-admin only. CSRF is enforced globally on `/api/*`
 * via `csrfMiddleware` (see server/index.ts).
 *
 * No route mutates `cost_events`: that table is treated as an immutable
 * append-only audit log. There is no UPDATE or DELETE route exposed.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  costControlService,
  CostControlError,
} from "../services/cost-control-service";
import { COST_KINDS } from "@shared/schema";

const PatchPolicySchema = z.object({
  dailyCapUsd: z.number().min(0).max(10000).optional(),
  monthlyCapUsd: z.number().min(0).max(100000).optional(),
  paidApisPaused: z.boolean().optional(),
  impactScoreThreshold: z.number().min(0).max(100).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
});

const CanSpendQuerySchema = z.object({
  kind: z.enum(COST_KINDS),
  briefId: z.string().max(120).optional(),
  broadcastId: z.string().max(120).optional(),
  estUsd: z.coerce.number().min(0).max(10000).optional(),
});

export function registerCostRoutes(app: Express, requireRootAdmin: RequestHandler): void {
  app.get("/api/admin/cost/policy", requireRootAdmin, async (_req, res) => {
    const policy = await costControlService.getPolicy();
    const spend = await costControlService.getSpend();
    res.json({ ok: true, policy, spend });
  });

  app.patch("/api/admin/cost/policy", requireRootAdmin, async (req: any, res) => {
    const parsed = PatchPolicySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const actor = req.session?.adminActorId || req.session?.userId || "root_admin";
    try {
      const policy = await costControlService.updatePolicy({ ...parsed.data, updatedBy: actor });
      res.json({ ok: true, policy });
    } catch (err) {
      if (err instanceof CostControlError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/cost/events", requireRootAdmin, async (req, res) => {
    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) : 100;
    const events = await costControlService.listRecentEvents(Number.isFinite(limit) ? limit : 100);
    res.json({ ok: true, events });
  });

  app.get("/api/admin/cost/preview", requireRootAdmin, async (req, res) => {
    const parsed = CanSpendQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_query", details: parsed.error.flatten() });
    }
    const result = await costControlService.canSpend({
      kind: parsed.data.kind,
      briefId: parsed.data.briefId,
      broadcastId: parsed.data.broadcastId,
      estUsd: parsed.data.estUsd,
      skipAudit: true,
    });
    res.json({ ok: true, ...result });
  });

  app.post("/api/admin/cost/pause-paid-apis", requireRootAdmin, async (req: any, res) => {
    const actor = req.session?.adminActorId || req.session?.userId || "root_admin";
    const policy = await costControlService.pausePaidApis(actor);
    res.json({ ok: true, policy });
  });

  app.post("/api/admin/cost/resume-paid-apis", requireRootAdmin, async (req: any, res) => {
    const actor = req.session?.adminActorId || req.session?.userId || "root_admin";
    const policy = await costControlService.resumePaidApis(actor);
    res.json({ ok: true, policy });
  });
}
