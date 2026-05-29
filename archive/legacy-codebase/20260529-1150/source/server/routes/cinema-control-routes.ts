/**
 * Mougle 4D Cinema Control MVP — admin preview-only routes.
 *
 * SAFETY:
 *   - All routes require root admin (`requireRootAdmin`).
 *   - CSRF is enforced globally on `/api/*` via `csrfMiddleware`
 *     (see server/index.ts) — any non-GET requires `x-csrf-token`.
 *   - Default behaviour everywhere is dryRun: true (mock).
 *   - Even when a feature flag is set, this MVP returns mock artifacts
 *     and never opens an outbound socket to OpenAI/ElevenLabs/Meshy/
 *     Runway/Unreal/4D-bridge. The feature-flag gate is wired so the
 *     real-call path can be added later without changing route shape.
 *   - No DB writes; all persistence is in-memory.
 *   - SAFETY_ENVELOPE is appended server-side and validated via the
 *     SafetyEnvelopeSchema literal types — clients cannot tamper it.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  CreateProjectBodySchema,
  FourDCueSchema,
  ProjectTypeSchema,
  UnrealCommandSchema,
  AvatarPlanSchema,
  ScriptPlanSchema,
  VoicePlanSchema,
  MediaRefSchema,
  SafetyEnvelopeSchema,
  SceneManifestSchema,
  FourDCueManifestSchema,
  SAFETY_ENVELOPE,
} from "../../shared/4d-cinema-manifest";
import {
  build4DCueManifest,
  buildSceneManifest,
  createProject,
  CueValidationError,
  defaultAvatarFor,
  disabledSafeModeError,
  generateMockScript,
  generateMockVoicePlan,
  getProject,
  getProviderReadiness,
  isFeatureEnabled,
  listProjects,
  readinessError,
  updateProject,
} from "../services/cinema-control-service";

const ScriptGenerateBodySchema = z.object({
  projectId: z.string().min(1).max(120).optional(),
  topic: z.string().min(1).max(500),
  tone: z.enum(["neutral", "warm", "urgent"]).optional(),
  bulletCount: z.number().int().min(1).max(12).optional(),
  dryRun: z.boolean().optional(),
});

const VoiceGenerateBodySchema = z.object({
  projectId: z.string().min(1).max(120).optional(),
  provider: z.enum(["elevenlabs", "openai", "none"]).default("elevenlabs"),
  text: z.string().min(1).max(8000),
  dryRun: z.boolean().optional(),
});

const MeshyBodySchema = z.object({
  projectId: z.string().min(1).max(120).optional(),
  assetPrompt: z.string().min(1).max(400),
  assetKind: z.enum(["prop", "set_piece", "character"]).default("prop"),
  dryRun: z.boolean().optional(),
});

const RunwayBodySchema = z.object({
  projectId: z.string().min(1).max(120).optional(),
  videoPrompt: z.string().min(1).max(400),
  durationSec: z.number().int().min(1).max(10).default(4),
  dryRun: z.boolean().optional(),
});

const SceneManifestBodySchema = z.object({
  projectId: z.string().min(1).max(120),
  topic: z.string().min(1).max(500),
  avatar: AvatarPlanSchema.optional(),
  script: ScriptPlanSchema.optional(),
  voice: VoicePlanSchema.optional(),
  mediaRefs: z.array(MediaRefSchema).max(30).optional(),
  newsroom: z
    .object({
      tickerItems: z.array(z.string().max(80)).max(20).optional(),
      monitorTitle: z.string().max(120).optional(),
      sources: z
        .array(
          z.object({
            name: z.string().max(80),
            confidence: z.number().min(0).max(1),
          }),
        )
        .max(20)
        .optional(),
    })
    .optional(),
  podcast: z
    .object({
      host: z.string().min(1).max(120),
      guest: z.string().max(120).nullable().optional(),
      beats: z.array(z.string().max(200)).max(20).optional(),
    })
    .optional(),
  // Even if a client passes a renderSafety block, we never trust it.
  // It is validated then OVERWRITTEN server-side with SAFETY_ENVELOPE.
  renderSafety: SafetyEnvelopeSchema.optional(),
});

const FourDCueManifestBodySchema = z.object({
  projectId: z.string().min(1).max(120),
  cues: z.array(FourDCueSchema).min(1).max(500),
});

const UnrealSendBodySchema = UnrealCommandSchema.extend({
  webhookSecret: z.string().max(400).optional(),
});

const FourDSendBodySchema = z.object({
  projectId: z.string().min(1).max(120),
  cueManifestId: z.string().min(1).max(120).optional(),
  cue: FourDCueSchema,
  dryRun: z.boolean().optional(),
  webhookSecret: z.string().max(400).optional(),
});

const ApprovalBodySchema = z.object({
  status: z.enum(["draft", "preview_ready", "approved", "blocked"]),
  notes: z.string().max(2000).nullable().optional(),
});

export function registerCinemaControlRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  // ---------- Readiness (GET — safe; never serializes secret values)
  app.get(
    "/api/admin/cinema/readiness",
    requireRootAdmin,
    (_req, res) => {
      res.json({
        ok: true,
        readiness: getProviderReadiness(),
        featureFlags: {
          script_live: isFeatureEnabled("FEATURE_CINEMA_SCRIPT_LIVE"),
          voice_live: isFeatureEnabled("FEATURE_CINEMA_VOICE_LIVE"),
          meshy_live: isFeatureEnabled("FEATURE_CINEMA_MESHY_LIVE"),
          runway_live: isFeatureEnabled("FEATURE_CINEMA_RUNWAY_LIVE"),
          unreal_live: isFeatureEnabled("FEATURE_CINEMA_UNREAL_LIVE"),
          four_d_live: isFeatureEnabled("FEATURE_CINEMA_4D_LIVE"),
        },
        safetyEnvelope: SAFETY_ENVELOPE,
      });
    },
  );

  // ---------- Projects
  app.get("/api/projects", requireRootAdmin, (_req, res) => {
    res.json({ ok: true, projects: listProjects() });
  });

  app.post("/api/projects", requireRootAdmin, (req, res) => {
    const parsed = CreateProjectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const project = createProject(parsed.data);
    return res.status(201).json({ ok: true, project });
  });

  app.get("/api/projects/:id", requireRootAdmin, (req, res) => {
    const p = getProject(String(req.params.id));
    if (!p) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, project: p });
  });

  app.post("/api/projects/:id/approval", requireRootAdmin, (req, res) => {
    const parsed = ApprovalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const updated = updateProject(String(req.params.id), {
      status: parsed.data.status,
      approvalNotes: parsed.data.notes ?? null,
      safetyStatus:
        parsed.data.status === "approved"
          ? "safe"
          : parsed.data.status === "blocked"
            ? "blocked"
            : "needs_review",
    });
    if (!updated) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    return res.json({ ok: true, project: updated });
  });

  // ---------- Script (OpenAI gate — mock-only in this MVP)
  app.post("/api/script/generate", requireRootAdmin, (req, res) => {
    const parsed = ScriptGenerateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const readiness = getProviderReadiness();
    const flag = isFeatureEnabled("FEATURE_CINEMA_SCRIPT_LIVE");
    const wantsLive = parsed.data.dryRun === false;

    if (wantsLive && !readiness.openai) {
      return res.status(400).json(readinessError("openai", "OPENAI_API_KEY"));
    }
    if (wantsLive && !flag) {
      return res
        .status(400)
        .json(disabledSafeModeError("openai", "FEATURE_CINEMA_SCRIPT_LIVE"));
    }
    // Mock path (default).
    const script = generateMockScript({
      topic: parsed.data.topic,
      tone: parsed.data.tone,
      bulletCount: parsed.data.bulletCount,
    });
    return res.json({
      ok: true,
      dryRun: true,
      mockMode: true,
      internalAdminReviewOnly: true,
      script,
    });
  });

  // ---------- Voice (ElevenLabs/OpenAI gate — mock-only)
  app.post("/api/voice/generate", requireRootAdmin, (req, res) => {
    const parsed = VoiceGenerateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const readiness = getProviderReadiness();
    const flag = isFeatureEnabled("FEATURE_CINEMA_VOICE_LIVE");
    const wantsLive = parsed.data.dryRun === false;
    if (wantsLive) {
      const provReady =
        parsed.data.provider === "openai"
          ? readiness.openai
          : parsed.data.provider === "elevenlabs"
            ? readiness.elevenlabs
            : true;
      const provKey =
        parsed.data.provider === "openai"
          ? "OPENAI_API_KEY"
          : "ELEVENLABS_API_KEY";
      if (!provReady) {
        return res
          .status(400)
          .json(readinessError(parsed.data.provider, provKey));
      }
      if (!flag) {
        return res
          .status(400)
          .json(
            disabledSafeModeError(
              parsed.data.provider,
              "FEATURE_CINEMA_VOICE_LIVE",
            ),
          );
      }
    }
    const voice = generateMockVoicePlan(parsed.data.provider);
    return res.json({
      ok: true,
      dryRun: true,
      mockMode: true,
      publicAudioUrl: null,
      internalAdminReviewOnly: true,
      voice,
    });
  });

  // ---------- Meshy
  app.post("/api/assets/meshy", requireRootAdmin, (req, res) => {
    const parsed = MeshyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const readiness = getProviderReadiness();
    const flag = isFeatureEnabled("FEATURE_CINEMA_MESHY_LIVE");
    const wantsLive = parsed.data.dryRun === false;
    if (wantsLive && !readiness.meshy) {
      return res.status(400).json(readinessError("meshy", "MESHY_API_KEY"));
    }
    if (wantsLive && !flag) {
      return res
        .status(400)
        .json(disabledSafeModeError("meshy", "FEATURE_CINEMA_MESHY_LIVE"));
    }
    return res.json({
      ok: true,
      dryRun: true,
      mockMode: true,
      autoImportToUnreal: false,
      publicAssetUrl: null,
      assetRequest: {
        requestId: `meshy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        assetKind: parsed.data.assetKind,
        prompt: parsed.data.assetPrompt,
        status: "planned",
      },
    });
  });

  // ---------- Runway
  app.post("/api/video/runway", requireRootAdmin, (req, res) => {
    const parsed = RunwayBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const readiness = getProviderReadiness();
    const flag = isFeatureEnabled("FEATURE_CINEMA_RUNWAY_LIVE");
    const wantsLive = parsed.data.dryRun === false;
    if (wantsLive && !readiness.runway) {
      return res.status(400).json(readinessError("runway", "RUNWAY_API_KEY"));
    }
    if (wantsLive && !flag) {
      return res
        .status(400)
        .json(disabledSafeModeError("runway", "FEATURE_CINEMA_RUNWAY_LIVE"));
    }
    return res.json({
      ok: true,
      dryRun: true,
      mockMode: true,
      renderQueued: false,
      publicVideoUrl: null,
      videoRequest: {
        requestId: `runway_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        prompt: parsed.data.videoPrompt,
        durationSec: parsed.data.durationSec,
        status: "planned",
      },
    });
  });

  // ---------- Scene manifest
  app.post("/api/scene-manifest", requireRootAdmin, (req, res) => {
    const parsed = SceneManifestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const project = getProject(parsed.data.projectId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "project_not_found" });
    }
    const avatar = parsed.data.avatar ?? defaultAvatarFor(project.projectType);
    const manifest = buildSceneManifest({
      project,
      topic: parsed.data.topic,
      avatar,
      script: parsed.data.script,
      voice: parsed.data.voice,
      mediaRefs: parsed.data.mediaRefs,
      newsroom: parsed.data.newsroom,
      podcast: parsed.data.podcast,
    });
    // Defensive re-parse to guarantee safety envelope and shape.
    const safeParsed = SceneManifestSchema.safeParse(manifest);
    if (!safeParsed.success) {
      return res.status(500).json({
        ok: false,
        error: "manifest_invalid",
        issues: safeParsed.error.issues,
      });
    }
    updateProject(project.id, {
      sceneManifestStatus: "generated",
      status: project.status === "draft" ? "preview_ready" : project.status,
    });
    return res.json({
      ok: true,
      dryRun: true,
      renderStarted: false,
      publishQueued: false,
      manifest: safeParsed.data,
    });
  });

  // ---------- 4D cue manifest (generation)
  app.post("/api/4d-cue-manifest", requireRootAdmin, (req, res) => {
    const parsed = FourDCueManifestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const project = getProject(parsed.data.projectId);
    if (!project) {
      return res.status(404).json({ ok: false, error: "project_not_found" });
    }
    try {
      const manifest = build4DCueManifest({
        project,
        cues: parsed.data.cues,
      });
      const safeParsed = FourDCueManifestSchema.safeParse(manifest);
      if (!safeParsed.success) {
        return res.status(500).json({
          ok: false,
          error: "manifest_invalid",
          issues: safeParsed.error.issues,
        });
      }
      updateProject(project.id, { cueManifestStatus: "generated" });
      return res.json({
        ok: true,
        dryRun: true,
        cueSent: false,
        manifest: safeParsed.data,
      });
    } catch (err) {
      if (err instanceof CueValidationError) {
        return res
          .status(400)
          .json({ ok: false, error: "unsafe_cue", message: err.message });
      }
      return res.status(500).json({
        ok: false,
        error: "unknown",
        message: (err as Error)?.message ?? "unknown",
      });
    }
  });

  // ---------- Unreal send-command (dry-run gate)
  app.post("/api/unreal/send-command", requireRootAdmin, (req, res) => {
    const parsed = UnrealSendBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const readiness = getProviderReadiness();
    const flag = isFeatureEnabled("FEATURE_CINEMA_UNREAL_LIVE");
    const wantsLive = parsed.data.dryRun === false;
    if (wantsLive && !readiness.unrealRemote) {
      return res
        .status(400)
        .json(readinessError("unreal", "UNREAL_REMOTE_URL"));
    }
    if (wantsLive && !readiness.webhookSecret) {
      return res
        .status(400)
        .json(readinessError("unreal", "WEBHOOK_SECRET"));
    }
    if (wantsLive && !flag) {
      return res
        .status(400)
        .json(disabledSafeModeError("unreal", "FEATURE_CINEMA_UNREAL_LIVE"));
    }
    // Default + safe path: no real network call in this MVP.
    return res.json({
      ok: true,
      commandSent: false,
      dryRun: true,
      requiresManualApproval: true,
      commandType: parsed.data.commandType,
      projectId: parsed.data.projectId,
      hint:
        "This MVP returns a planned command only. Real Unreal Remote " +
        "Control delivery is intentionally not implemented until founder " +
        "sign-off.",
    });
  });

  // ---------- 4D send-cue (dry-run gate)
  app.post("/api/4d/send-cue", requireRootAdmin, (req, res) => {
    const parsed = FourDSendBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues,
      });
    }
    const readiness = getProviderReadiness();
    const flag = isFeatureEnabled("FEATURE_CINEMA_4D_LIVE");
    const wantsLive = parsed.data.dryRun === false;
    if (wantsLive && !readiness.fourDBridge) {
      return res
        .status(400)
        .json(readinessError("four_d", "LOCAL_4D_BRIDGE_URL"));
    }
    if (wantsLive && !readiness.webhookSecret) {
      return res
        .status(400)
        .json(readinessError("four_d", "WEBHOOK_SECRET"));
    }
    if (wantsLive && !flag) {
      return res
        .status(400)
        .json(disabledSafeModeError("four_d", "FEATURE_CINEMA_4D_LIVE"));
    }
    return res.json({
      ok: true,
      cueSent: false,
      dryRun: true,
      requiresManualApproval: true,
      cue: parsed.data.cue,
      hint:
        "This MVP returns a planned cue only. Real 4D hardware bridge " +
        "delivery is intentionally not implemented until founder sign-off.",
    });
  });
}
