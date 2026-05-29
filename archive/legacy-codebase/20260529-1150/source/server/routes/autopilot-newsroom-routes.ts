/**
 * Mougle Autopilot Newsroom — root-admin admin routes.
 *
 * SAFETY:
 *   - Every route requires root admin (`requireRootAdmin`).
 *   - CSRF is enforced globally on `/api/*` via `csrfMiddleware`
 *     (see server/index.ts) — any non-GET requires `x-csrf-token`.
 *   - No DB writes. No provider calls. No public/signed URLs.
 *   - SAFETY_ENVELOPE is returned by status; clients cannot tamper it
 *     because SafetyEnvelopeSchema uses z.literal locks.
 *   - `autopilot_public_publish` mode is permanently rejected at the
 *     settings route.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  AutopilotSettingsSchema,
  AutopilotStoryInputSchema,
} from "../../shared/autopilot-newsroom";
import {
  engageKillSwitch,
  getAudit,
  getPlayout,
  getQueue,
  getSettings,
  getStatus,
  start,
  stop,
  updateSettings,
} from "../services/newsroom/continuousNewsroomScheduler";
import { evaluateAutopilotEligibility } from "../services/newsroom/autopilotDecisionService";

const SettingsBodySchema = AutopilotSettingsSchema.partial();
const KillSwitchBodySchema = z.object({
  engaged: z.boolean(),
  reason: z.string().max(400).optional(),
});
const EvaluateBodySchema = z.object({
  story: AutopilotStoryInputSchema,
});

export function registerAutopilotNewsroomRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  app.get("/api/admin/autopilot/status", requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, status: getStatus(), settings: getSettings() });
  });

  app.post("/api/admin/autopilot/settings", requireRootAdmin, (req, res) => {
    const parsed = SettingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    try {
      const next = updateSettings(parsed.data);
      return res.json({ ok: true, settings: next, status: getStatus() });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error)?.message || err) });
    }
  });

  app.post("/api/admin/autopilot/kill-switch", requireRootAdmin, (req, res) => {
    const parsed = KillSwitchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    if (parsed.data.engaged) {
      engageKillSwitch("root_admin", parsed.data.reason ?? "engaged via admin route");
    } else {
      updateSettings({ killSwitchEngaged: false });
    }
    return res.json({ ok: true, status: getStatus() });
  });

  app.post("/api/admin/autopilot/start", requireRootAdmin, (_req, res) => {
    const r = start("root_admin");
    return res.status(r.ok ? 200 : 409).json(r);
  });

  app.post("/api/admin/autopilot/stop", requireRootAdmin, (_req, res) => {
    stop("root_admin", "stopped via admin route");
    return res.json({ ok: true, status: getStatus() });
  });

  app.post("/api/admin/autopilot/evaluate", requireRootAdmin, (req, res) => {
    const parsed = EvaluateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const decision = evaluateAutopilotEligibility(parsed.data.story, getSettings());
    return res.json({ ok: true, decision });
  });

  app.get("/api/admin/autopilot/queue", requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, queue: getQueue(), playout: getPlayout() });
  });

  app.get("/api/admin/autopilot/audit", requireRootAdmin, (req, res) => {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, Math.floor(limitRaw)) : 100;
    return res.json({ ok: true, events: getAudit(limit) });
  });
}
