/**
 * Neural Newsroom Automation + Broadcast-Grade Screen Director — admin routes.
 *
 * All routes require root admin. CSRF is enforced globally for /api/*.
 * No publishing, no hardware sends, no real Unreal / 4D calls.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  ApexLoadInputSchema,
  ScreenIntentSchema,
  FlowStateSchema,
} from "../../shared/neural-newsroom-schema";
import { apexloadOptimizerService } from "../services/apexload-newsroom-optimizer";
import { precognitionPlannerService } from "../services/precognition-newsroom-planner";
import { flowstateConductorService } from "../services/flowstate-newsroom-conductor";
import { neuralNewsroomBus } from "../services/neural-newsroom-bus";
import { broadcastGradeScreenSafetyService } from "../services/broadcast-grade-screen-safety-service";
import { virtualProductionScreenDirectorService } from "../services/virtual-production-screen-director";

const PreCognitionBeatSchema = z.object({
  beatId: z.string(),
  startsAtSec: z.number().nonnegative(),
  expectedVisualNeed: z.string(),
  selectedSourceId: z.string().nullable(),
  sourceLicenseStatus: z.enum(["licensed", "owned", "rights_unknown", "prohibited"]),
  sourceApprovalStatus: z.enum(["approved", "unapproved"]),
  sourceMatchesStory: z.boolean(),
  targetScreenObjectName: z.string(),
  presetId: z.string(),
  anchorMode: z.string(),
  robotMode: z.string(),
  sensitivityClass: z.enum([
    "normal","sensitive","disaster","war","crime","medical","children","active_crisis",
  ]),
  fallbackSourceId: z.string().nullable(),
  fallbackPresetId: z.string(),
  confidence: z.object({
    cSource: z.number().min(0).max(1),
    cVerification: z.number().min(0).max(1),
    cLicense: z.number().min(0).max(1),
    cScreenMatch: z.number().min(0).max(1),
    cSensitivity: z.number().min(0).max(1),
    cAudienceSafety: z.number().min(0).max(1).default(1),
    cFallback: z.number().min(0).max(1),
  }),
});

const PreCognitionInputSchema = z.object({
  productionId: z.string().min(1),
  storyId: z.string().min(1),
  broadcastBriefId: z.string().nullable().optional(),
  newsroomScreenDataId: z.string().nullable().optional(),
  legalEventVisualPlanId: z.string().nullable().optional(),
  beats: z.array(PreCognitionBeatSchema).min(1),
  restoreDefaultRouteId: z.string().min(1),
});

export function registerNeuralNewsroomRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  // Mount under both `/api/admin/neural-newsroom/*` (our docs) and
  // `/api/admin/newsroom/*` (original spec path) so neither contract breaks.
  registerOn(app, requireRootAdmin, "/api/admin/neural-newsroom");
  registerOn(app, requireRootAdmin, "/api/admin/newsroom");
}

function registerOn(
  app: Express,
  requireRootAdmin: RequestHandler,
  base: string,
): void {

  app.post(`${base}/apexload/decide`, requireRootAdmin, async (req, res) => {
    const parsed = ApexLoadInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    const decision = apexloadOptimizerService.decide(parsed.data);
    neuralNewsroomBus.emit("apexload.decided", { decisionId: decision.decisionId, storyId: decision.storyId, tier: decision.productionTier });
    res.json({ decision });
  });

  app.post(`${base}/precognition/plan`, requireRootAdmin, async (req, res) => {
    const parsed = PreCognitionInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid input", errors: parsed.error.flatten() });
    const plan = precognitionPlannerService.plan(parsed.data);
    neuralNewsroomBus.emit("precognition.plan_created", { planId: plan.planId, storyId: plan.storyId });
    res.json({ plan });
  });

  app.get(`${base}/flowstate`, requireRootAdmin, (_req, res) => {
    res.json({ current: flowstateConductorService.get(), history: flowstateConductorService.list(50) });
  });
  app.post(`${base}/flowstate/transition`, requireRootAdmin, (req, res) => {
    const body = z.object({ to: FlowStateSchema, reason: z.string().optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "invalid input" });
    const result = flowstateConductorService.transition(body.data.to, body.data.reason);
    if (result.ok) neuralNewsroomBus.emit("flowstate.changed", result.snapshot);
    res.json(result);
  });

  app.post(`${base}/screen-director/anchor-intent`, requireRootAdmin, async (req, res) => {
    try {
      const intent = ScreenIntentSchema.omit({ requestedBy: true }).parse(req.body);
      const result = await virtualProductionScreenDirectorService.buildTakePlanFromAnchorIntent(intent);
      res.json({ result });
    } catch (e: any) {
      res.status(400).json({ message: "invalid intent", error: e?.message });
    }
  });
  app.post(`${base}/screen-director/robot-intent`, requireRootAdmin, async (req, res) => {
    try {
      const intent = ScreenIntentSchema.omit({ requestedBy: true }).parse(req.body);
      const result = await virtualProductionScreenDirectorService.buildTakePlanFromRobotIntent(intent);
      res.json({ result });
    } catch (e: any) {
      res.status(400).json({ message: "invalid intent", error: e?.message });
    }
  });
  app.post(`${base}/screen-director/restore-default`, requireRootAdmin, async (req, res) => {
    const body = z.object({ productionId: z.string(), storyId: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "invalid input" });
    await virtualProductionScreenDirectorService.restoreDefaultScreenRoute(body.data.productionId, body.data.storyId);
    res.json({ ok: true });
  });
  app.post(`${base}/kill-switch`, requireRootAdmin, async (req, res) => {
    const reason = String(req.body?.reason ?? "manual_kill_switch");
    await broadcastGradeScreenSafetyService.killSwitch(reason);
    flowstateConductorService.transition("kill_switch", reason);
    res.json({ ok: true });
  });

  app.get(`${base}/take-plans`, requireRootAdmin, async (_req, res) => {
    const rows = await broadcastGradeScreenSafetyService.listRecentTakePlans(100);
    res.json({ takePlans: rows });
  });
  app.get(`${base}/validations`, requireRootAdmin, async (_req, res) => {
    const rows = await broadcastGradeScreenSafetyService.listRecentValidations(100);
    res.json({ validations: rows });
  });
  app.get(`${base}/presets`, requireRootAdmin, async (_req, res) => {
    const rows = await broadcastGradeScreenSafetyService.listPresets();
    res.json({ presets: rows });
  });
  app.get(`${base}/bus/history`, requireRootAdmin, (_req, res) => {
    res.json({ events: neuralNewsroomBus.history(200) });
  });

  app.get(`${base}/apexload/recent`, requireRootAdmin, (_req, res) => {
    res.json({ decisions: apexloadOptimizerService.listRecent(50) });
  });
  app.get(`${base}/precognition/recent`, requireRootAdmin, (_req, res) => {
    res.json({ plans: precognitionPlannerService.listRecent(50) });
  });

  app.get(`${base}/overview`, requireRootAdmin, async (_req, res) => {
    const [presets, takePlans, validations] = await Promise.all([
      broadcastGradeScreenSafetyService.listPresets(),
      broadcastGradeScreenSafetyService.listRecentTakePlans(20),
      broadcastGradeScreenSafetyService.listRecentValidations(20),
    ]);
    res.json({
      flowstate: flowstateConductorService.get(),
      presets,
      recentApexLoad: apexloadOptimizerService.listRecent(20),
      recentPreCognition: precognitionPlannerService.listRecent(20),
      recentTakePlans: takePlans,
      recentValidations: validations,
      recentEvents: neuralNewsroomBus.history(50),
      safetyEnvelopeLocked: true,
      realSendAllowed: false,
      executionEnabled: false,
      hardwareSendAllowed: false,
      notPublished: true,
    });
  });
}
