/**
 * Mougle 4D Cinema Control MVP — shared Zod contracts.
 *
 * Preview-only contracts for newsroom / podcast / avatar / debate / interview
 * scenes plus an Unreal command schema and a 4D cue manifest schema.
 *
 * IMPORTANT: This file deliberately does NOT touch `shared/schema.ts` and is
 * NOT imported into it. All persistence in the MVP is in-memory and the
 * Drizzle schema is unchanged.
 *
 * SAFETY ENVELOPE:
 *   Every scene manifest emitted by the MVP must carry the constant safety
 *   envelope below. The Zod literal types ensure that any attempt to send
 *   `publicPublishing: true` (etc.) over the wire is rejected at validation
 *   time — i.e., the envelope cannot be tampered without a code change here.
 */

import { z } from "zod";

// ---------- Safety envelope (immutable values, enforced via Zod literals)

export const SAFETY_ENVELOPE = {
  publicPublishing: false,
  youtubeUpload: false,
  socialPosting: false,
  autonomousExecution: false,
  manualRootAdminTriggerOnly: true,
  internalAdminReviewOnly: true,
} as const;

export const SafetyEnvelopeSchema = z.object({
  publicPublishing: z.literal(false),
  youtubeUpload: z.literal(false),
  socialPosting: z.literal(false),
  autonomousExecution: z.literal(false),
  manualRootAdminTriggerOnly: z.literal(true),
  internalAdminReviewOnly: z.literal(true),
});
export type SafetyEnvelope = z.infer<typeof SafetyEnvelopeSchema>;

// ---------- Project dashboard

export const ProjectTypeSchema = z.enum([
  "newsroom",
  "podcast_room",
  "avatar_scene",
  "debate_room",
  "interview_room",
]);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;

export const ProjectStatusSchema = z.enum([
  "draft",
  "preview_ready",
  "approved",
  "blocked",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const FourDCinemaProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  projectType: ProjectTypeSchema,
  status: ProjectStatusSchema,
  safetyStatus: z.enum(["safe", "needs_review", "blocked"]),
  sceneManifestStatus: z.enum(["not_generated", "generated", "stale"]),
  cueManifestStatus: z.enum(["not_generated", "generated", "stale"]),
  approvalNotes: z.string().max(2000).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FourDCinemaProject = z.infer<typeof FourDCinemaProjectSchema>;

export const CreateProjectBodySchema = z.object({
  title: z.string().min(1).max(200),
  projectType: ProjectTypeSchema,
});

// ---------- Avatar selector

export const AvatarPlanSchema = z.object({
  avatarId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  role: z.enum(["anchor", "podcast_host", "guest", "analyst", "narrator"]),
  voiceProvider: z.enum(["elevenlabs", "openai", "none"]),
  avatarEngine: z.enum([
    "metahuman",
    "character_creator",
    "static_placeholder",
    "none",
  ]),
  lipSyncMode: z.enum(["none", "planned", "external_provider"]),
  safetyStatus: z.enum(["safe", "needs_review", "blocked"]),
});
export type AvatarPlan = z.infer<typeof AvatarPlanSchema>;

// ---------- Scene sub-plans

export const CameraPresetSchema = z.enum([
  "wide_anchor",
  "medium_anchor",
  "two_shot",
  "over_shoulder",
  "podcast_table",
  "single_host",
  "interview_pair",
  "debate_stage",
]);

export const LightingPresetSchema = z.enum([
  "newsroom_neutral",
  "podcast_warm",
  "debate_cool",
  "breaking_alert",
  "interview_soft",
]);

export const UnrealRoomPresetSchema = z.enum([
  "newsroom_v1",
  "podcast_studio_v1",
  "avatar_stage_v1",
  "debate_arena_v1",
  "interview_lounge_v1",
]);

export const ScreenPanelSchema = z.object({
  panelId: z.string().min(1).max(60),
  panelType: z.enum([
    "lower_third",
    "ticker",
    "monitor",
    "source_panel",
    "confidence_panel",
    "graphic",
  ]),
  text: z.string().max(800).nullable(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type ScreenPanel = z.infer<typeof ScreenPanelSchema>;

export const MediaRefSchema = z.object({
  refId: z.string().min(1).max(120),
  kind: z.enum(["image", "broll", "audio_bed", "graphic"]),
  description: z.string().max(400),
  externalProvider: z.string().max(60).nullable(),
});
export type MediaRef = z.infer<typeof MediaRefSchema>;

export const ScriptPlanSchema = z.object({
  scriptId: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  anchorScript: z.string().max(8000),
  beats: z.array(z.string().max(400)).max(50),
  mockMode: z.boolean(),
  internalAdminReviewOnly: z.literal(true),
});
export type ScriptPlan = z.infer<typeof ScriptPlanSchema>;

export const VoicePlanSchema = z.object({
  voiceJobId: z.string().min(1).max(120),
  provider: z.enum(["elevenlabs", "openai", "none"]),
  voiceId: z.string().min(1).max(120).nullable(),
  mockMode: z.boolean(),
  publicAudioUrl: z.literal(null),
  internalAdminReviewOnly: z.literal(true),
});
export type VoicePlan = z.infer<typeof VoicePlanSchema>;

export const UnrealPlanSchema = z.object({
  roomPreset: UnrealRoomPresetSchema,
  cameraPreset: CameraPresetSchema,
  lightingPreset: LightingPresetSchema,
  sequencerCue: z.string().max(120).nullable(),
  requiresManualApproval: z.literal(true),
});

// ---------- Scene manifest

export const SceneManifestSchema = z.object({
  manifestId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  sceneType: ProjectTypeSchema,
  roomPreset: UnrealRoomPresetSchema,
  cameraPlan: z.object({
    primary: CameraPresetSchema,
    secondary: CameraPresetSchema.nullable(),
  }),
  avatarPlan: AvatarPlanSchema,
  scriptPlan: ScriptPlanSchema,
  voicePlan: VoicePlanSchema,
  screenPanels: z.array(ScreenPanelSchema).max(20),
  mediaRefs: z.array(MediaRefSchema).max(30),
  unrealPlan: UnrealPlanSchema,
  renderSafety: SafetyEnvelopeSchema,
  adminApproval: z.object({
    status: z.enum(["pending", "approved", "blocked"]),
    approvedBy: z.string().nullable(),
    approvedAt: z.string().nullable(),
    notes: z.string().max(2000).nullable(),
  }),
  generatedAt: z.string(),
});
export type SceneManifest = z.infer<typeof SceneManifestSchema>;

// ---------- Unreal command

export const UnrealCommandTypeSchema = z.enum([
  "loadScene",
  "setCamera",
  "setAvatar",
  "setPanels",
  "setLighting",
  "startSequencer",
  "stopSequencer",
  "exportPreview",
]);

export const UnrealCommandSchema = z.object({
  commandType: UnrealCommandTypeSchema,
  projectId: z.string().min(1).max(120),
  manifestId: z.string().min(1).max(120).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  dryRun: z.boolean().default(true),
});
export type UnrealCommand = z.infer<typeof UnrealCommandSchema>;

// ---------- 4D cue manifest

// Per-effect hard caps so that "unsafe" cues are deterministically rejected.
const Intensity01 = z.number().min(0).max(1);
const DurationMs = z.number().int().min(0).max(30_000);

export const FourDEffectsSchema = z.object({
  lights: z
    .object({
      preset: z.enum([
        "off",
        "neutral",
        "warm",
        "cool",
        "red_flash",
        "blue_flash",
        "amber_pulse",
      ]),
      intensity: Intensity01,
    })
    .optional(),
  vibration: z
    .object({ intensity: Intensity01, durationMs: DurationMs })
    .optional(),
  wind: z
    .object({ intensity: Intensity01, durationMs: DurationMs })
    .optional(),
  fog: z.object({ enabled: z.boolean(), durationMs: DurationMs }).optional(),
  motionSeats: z
    .object({
      pattern: z.enum(["off", "rumble", "tilt_left", "tilt_right", "roll"]),
      intensity: Intensity01,
      durationMs: DurationMs,
    })
    .optional(),
  scent: z
    .object({
      preset: z.enum([
        "none",
        "ozone",
        "smoke",
        "citrus",
        "forest",
        "coffee",
      ]),
    })
    .optional(),
  audioHit: z
    .object({
      preset: z.enum([
        "none",
        "breaking_news_bass",
        "applause",
        "transition_swell",
        "ticker_blip",
        "alert_chime",
      ]),
    })
    .optional(),
  bassRumble: z
    .object({ intensity: Intensity01, durationMs: DurationMs })
    .optional(),
  ledColor: z
    .object({
      hex: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "led hex must be #RRGGBB"),
      durationMs: DurationMs,
    })
    .optional(),
  alertFlash: z
    .object({ count: z.number().int().min(0).max(20), color: z.enum(["red", "amber", "blue", "white"]) })
    .optional(),
});
export type FourDEffects = z.infer<typeof FourDEffectsSchema>;

export const FourDCueSchema = z.object({
  timeMs: z.number().int().min(0).max(60 * 60 * 1000), // <= 1 hour
  cueType: z
    .string()
    .min(1)
    .max(60)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "cueType must be snake_case ascii",
    ),
  effects: FourDEffectsSchema,
});
export type FourDCue = z.infer<typeof FourDCueSchema>;

export const FourDCueManifestSchema = z.object({
  manifestId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  totalDurationMs: z.number().int().min(0).max(60 * 60 * 1000),
  cues: z.array(FourDCueSchema).max(500),
  renderSafety: SafetyEnvelopeSchema,
  adminApproval: z.object({
    status: z.enum(["pending", "approved", "blocked"]),
    approvedBy: z.string().nullable(),
    approvedAt: z.string().nullable(),
    notes: z.string().max(2000).nullable(),
  }),
  generatedAt: z.string(),
});
export type FourDCueManifest = z.infer<typeof FourDCueManifestSchema>;

// ---------- Provider readiness

export const ProviderReadinessSchema = z.object({
  openai: z.boolean(),
  elevenlabs: z.boolean(),
  meshy: z.boolean(),
  runway: z.boolean(),
  unrealRemote: z.boolean(),
  fourDBridge: z.boolean(),
  webhookSecret: z.boolean(),
});
export type ProviderReadiness = z.infer<typeof ProviderReadinessSchema>;

// ---------- Admin approval (shared sub-schema)

export const AdminApprovalSchema = z.object({
  status: z.enum(["pending", "approved", "blocked"]),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  notes: z.string().max(2000).nullable(),
});
export type AdminApproval = z.infer<typeof AdminApprovalSchema>;
