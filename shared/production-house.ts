/**
 * Mougle AI Production House — shared contracts.
 *
 * SAFETY:
 *   - SAFETY_ENVELOPE is locked via z.literal() — clients cannot tamper it.
 *     publicPublishing / youtubeUpload / socialPosting / liveStreaming /
 *     realUnrealCommands / real4DCommands / publicUrlGeneration /
 *     signedUrlGeneration are all permanently false in this MVP.
 *   - No DB / Drizzle imports here. No shared/schema.ts edits.
 *   - Manifests are pure JSON; no execution side-effects.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Safety envelope                                                     */
/* ------------------------------------------------------------------ */

export const SafetyEnvelopeSchema = z.object({
  publicPublishing: z.literal(false),
  youtubeUpload: z.literal(false),
  socialPosting: z.literal(false),
  liveStreaming: z.literal(false),
  realUnrealCommands: z.literal(false),
  real4DCommands: z.literal(false),
  publicUrlGeneration: z.literal(false),
  signedUrlGeneration: z.literal(false),
  manualRootAdminOverrideOnly: z.literal(true),
});
export type SafetyEnvelope = z.infer<typeof SafetyEnvelopeSchema>;

export const SAFETY_ENVELOPE: SafetyEnvelope = Object.freeze({
  publicPublishing: false as const,
  youtubeUpload: false as const,
  socialPosting: false as const,
  liveStreaming: false as const,
  realUnrealCommands: false as const,
  real4DCommands: false as const,
  publicUrlGeneration: false as const,
  signedUrlGeneration: false as const,
  manualRootAdminOverrideOnly: true as const,
});

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const ProductionStatusSchema = z.enum([
  "draft",
  "generated",
  "needs_review",
  "approved",
  "sent_to_unreal",
  "rendering",
  "rendered",
  "published",
  "failed",
]);
export type ProductionStatus = z.infer<typeof ProductionStatusSchema>;

export const ROOM_TYPES = [
  "newsroom",
  "podcast_room",
  "debate_room",
  "interview_room",
  "cinema_hall",
  "conference_hall",
  "ai_presenter_studio",
  "market_watch_room",
  "breaking_news_room",
  "education_room",
  "emergency_broadcast_room",
  "custom",
] as const;
export const RoomTypeSchema = z.enum(ROOM_TYPES);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const HALL_TYPES = [
  "cinema_hall",
  "conference_hall",
  "ai_event_hall",
  "education_hall",
  "press_briefing_hall",
  "product_launch_hall",
  "virtual_exhibition_room",
  "immersive_4d_theater",
] as const;
export const HallTypeSchema = z.enum(HALL_TYPES);
export type HallType = z.infer<typeof HallTypeSchema>;

export const AVATAR_ROLES = [
  "news_anchor",
  "podcast_host",
  "guest",
  "analyst",
  "reporter",
  "debate_moderator",
  "teacher",
  "ai_assistant",
  "virtual_ceo",
  "custom",
] as const;
export const AvatarRoleSchema = z.enum(AVATAR_ROLES);
export type AvatarRole = z.infer<typeof AvatarRoleSchema>;

export const AVATAR_TYPES = [
  "metahuman",
  "character_creator",
  "ready_player_me",
  "custom",
  "placeholder",
] as const;
export const AvatarTypeSchema = z.enum(AVATAR_TYPES);
export type AvatarType = z.infer<typeof AvatarTypeSchema>;

export const FOUR_D_EFFECTS = [
  "light_flash",
  "color_change",
  "fog_burst",
  "wind",
  "vibration",
  "bass_hit",
  "motion_seat_cue",
  "scent_cue",
  "water_mist",
  "heat_cue",
  "spatial_audio_cue",
  "led_wall_effect",
] as const;
export const FourDEffectSchema = z.enum(FOUR_D_EFFECTS);
export type FourDEffect = z.infer<typeof FourDEffectSchema>;

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

const idStr = z.string().min(1).max(120);
const shortStr = z.string().min(1).max(120);
const mediumStr = z.string().min(1).max(400);
const longStr = z.string().min(0).max(20_000);

export const RoomSchema = z.object({
  id: idStr,
  name: shortStr,
  type: RoomTypeSchema,
  visualStyle: z.string().max(200).default(""),
  lightingStyle: z.string().max(200).default(""),
  colorPalette: z.array(z.string().max(40)).max(12).default([]),
  screens: z.array(z.string().max(120)).max(20).default([]),
  cameraPositions: z.array(z.string().max(120)).max(20).default([]),
  avatarPositions: z.array(z.string().max(120)).max(20).default([]),
  fourDCompatible: z.boolean().default(false),
  unrealLevelName: z.string().max(200).default(""),
  status: z.enum(["draft", "approved", "sent_to_unreal", "rendered"]).default("draft"),
  createdAt: z.string(),
});
export type Room = z.infer<typeof RoomSchema>;

export const AvatarSchema = z.object({
  id: idStr,
  name: shortStr,
  role: AvatarRoleSchema,
  gender: z.string().max(40).default(""),
  style: z.string().max(200).default(""),
  personality: z.string().max(400).default(""),
  voiceProvider: z.enum(["elevenlabs", "openai", "placeholder"]).default("placeholder"),
  voiceId: z.string().max(120).default(""),
  avatarType: AvatarTypeSchema.default("placeholder"),
  lipSyncProvider: z.enum(["nvidia_ace", "convai", "placeholder"]).default("placeholder"),
  bodyAnimationProvider: z.enum(["deepmotion", "rokoko", "placeholder"]).default("placeholder"),
  facialAnimationProvider: z.enum(["nvidia_ace", "metahuman", "placeholder"]).default("placeholder"),
  unrealBlueprintName: z.string().max(200).default(""),
  defaultRoomId: idStr.nullable().default(null),
  defaultCameraAngle: z.string().max(120).default(""),
  status: z.enum(["draft", "approved"]).default("draft"),
  createdAt: z.string(),
});
export type Avatar = z.infer<typeof AvatarSchema>;

export const HallSchema = z.object({
  id: idStr,
  name: shortStr,
  type: HallTypeSchema,
  stage: z.string().max(200).default(""),
  screen: z.string().max(200).default(""),
  seats: z.number().int().min(0).max(10_000).default(0),
  lighting: z.string().max(200).default(""),
  sound: z.string().max(200).default(""),
  avatarIds: z.array(idStr).max(50).default([]),
  audienceSimulation: z.boolean().default(false),
  cameraPaths: z.array(z.string().max(120)).max(20).default([]),
  fourDEffects: z.array(FourDEffectSchema).max(20).default([]),
  unrealLevelName: z.string().max(200).default(""),
  status: z.enum(["draft", "approved"]).default("draft"),
  createdAt: z.string(),
});
export type Hall = z.infer<typeof HallSchema>;

export const PodcastSchema = z.object({
  id: idStr,
  podcastTitle: shortStr,
  episodeTitle: shortStr,
  hostAvatarId: idStr.nullable().default(null),
  guestAvatarIds: z.array(idStr).max(8).default([]),
  roomId: idStr.nullable().default(null),
  tableStyle: z.string().max(200).default(""),
  microphones: z.array(z.string().max(120)).max(8).default([]),
  screenBackground: z.string().max(200).default(""),
  introSequence: z.string().max(400).default(""),
  topics: z.array(z.string().max(200)).max(20).default([]),
  dialogueScript: longStr.default(""),
  cameraSwitchingPlan: z.array(z.string().max(200)).max(40).default([]),
  fourDAmbiancePlan: z.array(FourDEffectSchema).max(20).default([]),
  renderStatus: ProductionStatusSchema.default("draft"),
  createdAt: z.string(),
});
export type Podcast = z.infer<typeof PodcastSchema>;

export const NewsroomProductionSchema = z.object({
  id: idStr,
  storyTitle: shortStr,
  category: z.string().max(80).default("general"),
  script: longStr.default(""),
  anchorAvatarId: idStr.nullable().default(null),
  roomId: idStr.nullable().default(null),
  sourcePanel: z.array(z.string().max(200)).max(20).default([]),
  confidenceScore: z.number().min(0).max(1).default(0.5),
  lowerThird: z.string().max(200).default(""),
  ticker: z.string().max(400).default(""),
  backgroundPanels: z.array(z.string().max(200)).max(20).default([]),
  worldMapData: z.string().max(400).default(""),
  cameraPlan: z.array(z.string().max(200)).max(40).default([]),
  captions: z.boolean().default(true),
  renderStatus: ProductionStatusSchema.default("draft"),
  approvalStatus: ProductionStatusSchema.default("draft"),
  createdAt: z.string(),
});
export type NewsroomProduction = z.infer<typeof NewsroomProductionSchema>;

export const FourDCueSchema = z.object({
  id: idStr,
  productionId: idStr.nullable().default(null),
  timecodeMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  name: shortStr,
  effect: FourDEffectSchema,
  intensity: z.number().min(0).max(1).default(0.5),
  durationMs: z.number().int().min(1).max(60 * 1000).default(1_000),
  hardwareTarget: z.enum(["dmx", "osc", "udp", "placeholder"]).default("placeholder"),
  safetyFlag: z.enum(["safe", "caution", "blocked"]).default("safe"),
  approvalStatus: z.enum(["draft", "approved", "rejected"]).default("draft"),
  createdAt: z.string(),
});
export type FourDCue = z.infer<typeof FourDCueSchema>;

export const ProductionSchema = z.object({
  id: idStr,
  title: shortStr,
  productionType: z.enum(["newsroom", "podcast", "hall_event", "custom_cinema"]),
  script: longStr.default(""),
  roomId: idStr.nullable().default(null),
  avatarIds: z.array(idStr).max(20).default([]),
  panels: z.array(z.string().max(200)).max(20).default([]),
  cameras: z.array(z.string().max(200)).max(40).default([]),
  audio: z.array(z.string().max(200)).max(20).default([]),
  captions: z.boolean().default(true),
  overlays: z.array(z.string().max(200)).max(20).default([]),
  renderSettings: z
    .object({
      preset: z.enum(["preview", "cinematic_4k", "cinematic_8k"]).default("preview"),
      fps: z.number().int().min(12).max(120).default(30),
    })
    .default({ preset: "preview", fps: 30 }),
  approvalStatus: ProductionStatusSchema.default("draft"),
  createdAt: z.string(),
});
export type Production = z.infer<typeof ProductionSchema>;

export const RenderJobSchema = z.object({
  id: idStr,
  productionId: idStr,
  status: z.enum(["queued", "rendering", "rendered", "failed"]).default("queued"),
  preset: z.enum(["preview", "cinematic_4k", "cinematic_8k"]).default("preview"),
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
  artifactRef: z.string().max(200).nullable().default(null),
  publicUrl: z.literal(null),
  signedUrl: z.literal(null),
  visibility: z.literal("admin_only_internal"),
  createdAt: z.string(),
});
export type RenderJob = z.infer<typeof RenderJobSchema>;

export const UnrealCommandSchema = z.object({
  id: idStr,
  productionId: idStr.nullable().default(null),
  command: z.enum([
    "send_scene_manifest",
    "load_level",
    "set_camera",
    "set_lighting",
    "start_sequence",
    "render",
  ]),
  payload: z.record(z.unknown()).default({}),
  dryRun: z.literal(true),
  status: z.enum(["mock_accepted", "mock_rejected"]),
  reason: z.string().max(200).default(""),
  createdAt: z.string(),
});
export type UnrealCommand = z.infer<typeof UnrealCommandSchema>;

/* ------------------------------------------------------------------ */
/* Unreal Sandbox Bridge — mock-only validation and command record.    */
/*   - Never connects to a real Unreal Engine instance.                */
/*   - Never triggers Movie Render Queue or imports assets.            */
/*   - realSendAllowed is locked to literal false.                     */
/* ------------------------------------------------------------------ */
export const UnrealSandboxCommandTypeSchema = z.enum([
  "validate_package",
  "send_scene_manifest",
  "load_level",
  "set_camera",
  "set_lighting",
  "start_sequence",
  "render_preview",
]);
export type UnrealSandboxCommandType = z.infer<typeof UnrealSandboxCommandTypeSchema>;

export const UnrealSandboxCommandSchema = z.object({
  id: idStr,
  productionId: idStr,
  mode: z.literal("sandbox").default("sandbox"),
  commandType: UnrealSandboxCommandTypeSchema,
  status: z.enum(["mock_accepted", "mock_rejected", "failed"]),
  realSendAllowed: z.literal(false).default(false),
  payload: z.record(z.unknown()).default({}),
  response: z.record(z.unknown()).default({}),
  reason: z.string().max(500).default(""),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type UnrealSandboxCommand = z.infer<typeof UnrealSandboxCommandSchema>;

export const UnrealSandboxSendInputSchema = z.object({
  productionId: idStr,
  commandType: UnrealSandboxCommandTypeSchema.default("send_scene_manifest"),
  sandboxOverride: z.boolean().optional().default(false),
  payloadHint: z.string().max(500).optional().default(""),
});
export type UnrealSandboxSendInput = z.infer<typeof UnrealSandboxSendInputSchema>;

/* ------------------------------------------------------------------ */
/* Local Unreal Bridge Stub — mock-only local bridge job record.       */
/* Never calls Unreal Remote Control, MRQ, asset import, or 4D HW.     */
/* ------------------------------------------------------------------ */
export const LocalBridgeStubJobSchema = z.object({
  id: idStr,
  commandId: idStr,
  productionId: idStr,
  commandType: z.string().min(1).max(64),
  mode: z.literal("local_stub").default("local_stub"),
  dryRun: z.literal(true).default(true),
  realSendAllowed: z.literal(false).default(false),
  status: z.enum(["stub_accepted", "stub_rejected", "failed"]),
  requestPayload: z.record(z.unknown()).default({}),
  responsePayload: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type LocalBridgeStubJob = z.infer<typeof LocalBridgeStubJobSchema>;

/* ------------------------------------------------------------------ */
/* 4D Hardware Sandbox — mock-only contract for future physical 4D.    */
/* Never sends DMX/OSC/UDP/MIDI/serial/relay or controls any device.   */
/* ------------------------------------------------------------------ */
export const FOUR_D_EFFECT_TYPES = [
  "light_flash","color_change","fog_burst","wind","vibration","bass_hit",
  "motion_seat","scent","water_mist","heat","spatial_audio","led_wall","custom",
] as const;
export const FourDEffectTypeSchema = z.enum(FOUR_D_EFFECT_TYPES);
export type FourDEffectType = z.infer<typeof FourDEffectTypeSchema>;

export const FourDSandboxJobSchema = z.object({
  id: idStr,
  cueId: idStr,
  productionId: idStr,
  effectType: z.string().min(1).max(64),
  mode: z.literal("4d_sandbox").default("4d_sandbox"),
  dryRun: z.literal(true).default(true),
  realSendAllowed: z.literal(false).default(false),
  status: z.enum(["sandbox_accepted", "sandbox_rejected", "failed"]),
  requestPayload: z.record(z.unknown()).default({}),
  responsePayload: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type FourDSandboxJob = z.infer<typeof FourDSandboxJobSchema>;

/* ------------------------------------------------------------------ */
/* Production Readiness Report — internal scoring only, no auto-approval.*/
/* ------------------------------------------------------------------ */
export const ReadinessCheckSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  channel: z.enum([
    "ai_package","asset","unreal_sandbox","four_d_sandbox",
    "future_real_unreal","future_real_4d","global",
  ]),
  severity: z.enum(["blocker","warning","info"]),
});
export type ReadinessCheck = z.infer<typeof ReadinessCheckSchema>;

export const ReadinessReportSchema = z.object({
  id: idStr,
  productionId: idStr,
  overallScore: z.number().min(0).max(100),
  aiPackageScore: z.number().min(0).max(100),
  assetScore: z.number().min(0).max(100),
  unrealSandboxScore: z.number().min(0).max(100),
  fourDSandboxScore: z.number().min(0).max(100),
  futureRealUnrealScore: z.number().min(0).max(100),
  futureReal4DScore: z.number().min(0).max(100),
  blockers: ReadinessCheckSchema.array().default([]),
  warnings: ReadinessCheckSchema.array().default([]),
  passedChecks: ReadinessCheckSchema.array().default([]),
  failedChecks: ReadinessCheckSchema.array().default([]),
  futureRealUnrealEnabled: z.literal(false).default(false),
  futureReal4DEnabled: z.literal(false).default(false),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type ReadinessReport = z.infer<typeof ReadinessReportSchema>;

/* ------------------------------------------------------------------ */
/* Production Approval Board — internal workflow only.                  */
/* No real Unreal / 4D approval stages. No auto-approval.               */
/* ------------------------------------------------------------------ */
export const APPROVAL_STAGES = [
  "draft",
  "needs_review",
  "internal_review_approved",
  "unreal_sandbox_approved",
  "four_d_sandbox_approved",
  "blocked",
  "revision_requested",
] as const;
export const ApprovalStageSchema = z.enum(APPROVAL_STAGES);
export type ApprovalStage = z.infer<typeof ApprovalStageSchema>;

export const ApprovalHistoryEntrySchema = z.object({
  id: idStr,
  productionId: idStr,
  fromState: ApprovalStageSchema,
  toState: ApprovalStageSchema,
  reason: z.string().max(2000).default(""),
  readinessReportId: z.string().max(64).nullable().default(null),
  actor: z.literal("root_admin").default("root_admin"),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type ApprovalHistoryEntry = z.infer<typeof ApprovalHistoryEntrySchema>;

/* ------------------------------------------------------------------ */
/* Real Unreal Bridge Setup — dry-run handshake only, no live commands.*/
/* ------------------------------------------------------------------ */
export const REAL_UNREAL_BRIDGE_MODES = ["disabled", "dry_run"] as const;
export const RealUnrealBridgeModeSchema = z.enum(REAL_UNREAL_BRIDGE_MODES);
export type RealUnrealBridgeMode = z.infer<typeof RealUnrealBridgeModeSchema>;

export const REAL_UNREAL_HANDSHAKE_STATUSES = [
  "dry_run_ok",
  "dry_run_failed",
  "config_missing",
  "rejected",
] as const;
export const RealUnrealHandshakeStatusSchema = z.enum(REAL_UNREAL_HANDSHAKE_STATUSES);
export type RealUnrealHandshakeStatus = z.infer<typeof RealUnrealHandshakeStatusSchema>;

export const RealUnrealHandshakeRecordSchema = z.object({
  id: idStr,
  mode: z.literal("dry_run"),
  endpointHost: z.string().max(255).default(""),
  status: RealUnrealHandshakeStatusSchema,
  realSendAllowed: z.literal(false).default(false),
  requestSummary: z.record(z.unknown()).default({}),
  responseSummary: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type RealUnrealHandshakeRecord = z.infer<typeof RealUnrealHandshakeRecordSchema>;

/* ------------------------------------------------------------------ */
/* Real Unreal Dry-Run Package Validation — dry-run only.              */
/* No real renders. No MRQ. No asset import. No level load. No 4D.     */
/* ------------------------------------------------------------------ */
export const REAL_UNREAL_DRY_RUN_VALIDATION_STATUSES = [
  "passed",
  "failed",
  "rejected",
] as const;
export const RealUnrealDryRunValidationStatusSchema = z.enum(
  REAL_UNREAL_DRY_RUN_VALIDATION_STATUSES,
);
export type RealUnrealDryRunValidationStatus = z.infer<typeof RealUnrealDryRunValidationStatusSchema>;

export const REAL_UNREAL_DRY_RUN_VALIDATION_TYPES = ["local", "bridge", "bridge_network"] as const;
export const RealUnrealDryRunValidationTypeSchema = z.enum(
  REAL_UNREAL_DRY_RUN_VALIDATION_TYPES,
);
export type RealUnrealDryRunValidationType = z.infer<typeof RealUnrealDryRunValidationTypeSchema>;

export const DryRunLocalCheckSchema = z.object({
  id: z.string().max(80),
  label: z.string().max(200),
  ok: z.boolean(),
  detail: z.string().max(500).default(""),
});
export type DryRunLocalCheck = z.infer<typeof DryRunLocalCheckSchema>;

export const RealUnrealDryRunValidationRecordSchema = z.object({
  id: idStr,
  productionId: idStr,
  mode: z.literal("dry_run"),
  validationType: RealUnrealDryRunValidationTypeSchema,
  status: RealUnrealDryRunValidationStatusSchema,
  realSendAllowed: z.literal(false).default(false),
  localChecks: DryRunLocalCheckSchema.array().default([]),
  requestSummary: z.record(z.unknown()).default({}),
  responseSummary: z.record(z.unknown()).default({}),
  endpointHost: z.string().max(255).nullable().default(null),
  endpointPath: z.string().max(255).nullable().default(null),
  httpStatus: z.number().int().nullable().default(null),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type RealUnrealDryRunValidationRecord = z.infer<
  typeof RealUnrealDryRunValidationRecordSchema
>;

/* ------------------------------------------------------------------ */
/* Real Unreal Prepare-Scene Dry-Run Network Call                      */
/* Sends ONLY a sanitized prepare_scene payload to                     */
/*   {UNREAL_BRIDGE_BASE_URL}/prepare-scene/dry-run.                   */
/* Does not load levels, render scenes, import assets, attach avatars, */
/* attach video panels, start Sequencer, trigger MRQ, send 4D commands,*/
/* or publish anything. realSendAllowed locked false.                  */
/* ------------------------------------------------------------------ */
export const REAL_UNREAL_PREPARE_SCENE_STATUSES = ["passed", "failed", "rejected"] as const;
export const RealUnrealPrepareSceneStatusSchema = z.enum(REAL_UNREAL_PREPARE_SCENE_STATUSES);
export type RealUnrealPrepareSceneStatus = z.infer<typeof RealUnrealPrepareSceneStatusSchema>;

export const RealUnrealPrepareSceneRecordSchema = z.object({
  id: idStr,
  productionId: idStr,
  mode: z.literal("dry_run"),
  commandType: z.literal("prepare_scene"),
  status: RealUnrealPrepareSceneStatusSchema,
  realSendAllowed: z.literal(false).default(false),
  requestSummary: z.record(z.unknown()).default({}),
  responseSummary: z.record(z.unknown()).default({}),
  endpointHost: z.string().max(255).nullable().default(null),
  endpointPath: z.string().max(255).nullable().default(null),
  httpStatus: z.number().int().nullable().default(null),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type RealUnrealPrepareSceneRecord = z.infer<
  typeof RealUnrealPrepareSceneRecordSchema
>;

/* ------------------------------------------------------------------ */
/* Real Unreal Set-Camera Dry-Run Network Call                         */
/* Sends ONLY a sanitized set_camera payload to                        */
/*   {UNREAL_BRIDGE_BASE_URL}/set-camera/dry-run.                      */
/* Does not load levels, render scenes, import assets, attach avatars, */
/* attach video panels, start Sequencer, trigger MRQ, send 4D commands,*/
/* or publish anything. realSendAllowed locked false.                  */
/* ------------------------------------------------------------------ */
export const ALLOWED_SET_CAMERA_PRESETS = [
  "anchor_closeup",
  "anchor_medium",
  "wide_newsroom",
  "podcast_two_shot",
  "debate_wide",
  "hall_stage_wide",
  "product_reveal",
  "market_wall",
  "emergency_broadcast",
  "custom_static",
] as const;
export const SetCameraPresetSchema = z.enum(ALLOWED_SET_CAMERA_PRESETS);
export type SetCameraPreset = z.infer<typeof SetCameraPresetSchema>;

export const REAL_UNREAL_SET_CAMERA_STATUSES = ["passed", "failed", "rejected"] as const;
export const RealUnrealSetCameraStatusSchema = z.enum(REAL_UNREAL_SET_CAMERA_STATUSES);
export type RealUnrealSetCameraStatus = z.infer<typeof RealUnrealSetCameraStatusSchema>;

export const RealUnrealSetCameraRecordSchema = z.object({
  id: idStr,
  productionId: idStr,
  mode: z.literal("dry_run"),
  commandType: z.literal("set_camera"),
  cameraPreset: SetCameraPresetSchema,
  status: RealUnrealSetCameraStatusSchema,
  realSendAllowed: z.literal(false).default(false),
  requestSummary: z.record(z.unknown()).default({}),
  responseSummary: z.record(z.unknown()).default({}),
  endpointHost: z.string().max(255).nullable().default(null),
  endpointPath: z.literal("/set-camera/dry-run"),
  httpStatus: z.number().int().nullable().default(null),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type RealUnrealSetCameraRecord = z.infer<
  typeof RealUnrealSetCameraRecordSchema
>;

/* ------------------------------------------------------------------ */
/* Real Unreal Set-Lighting Dry-Run Network Call                       */
/* Sends ONLY a sanitized set_lighting payload to                      */
/*   {UNREAL_BRIDGE_BASE_URL}/set-lighting/dry-run.                    */
/* Does not load levels, render scenes, import assets, attach avatars, */
/* attach video panels, start Sequencer, trigger MRQ, send 4D commands,*/
/* or publish anything. realSendAllowed locked false.                  */
/* ------------------------------------------------------------------ */
export const ALLOWED_SET_LIGHTING_PRESETS = [
  "newsroom_bright",
  "newsroom_breaking_red",
  "podcast_warm",
  "debate_neutral",
  "interview_soft",
  "market_watch_blue",
  "emergency_alert",
  "cinematic_low_key",
  "avatar_spotlight",
  "standby_dim",
] as const;
export const SetLightingPresetSchema = z.enum(ALLOWED_SET_LIGHTING_PRESETS);
export type SetLightingPreset = z.infer<typeof SetLightingPresetSchema>;

export const REAL_UNREAL_SET_LIGHTING_STATUSES = ["passed", "failed", "rejected"] as const;
export const RealUnrealSetLightingStatusSchema = z.enum(REAL_UNREAL_SET_LIGHTING_STATUSES);
export type RealUnrealSetLightingStatus = z.infer<typeof RealUnrealSetLightingStatusSchema>;

export const RealUnrealSetLightingRecordSchema = z.object({
  id: idStr,
  productionId: idStr,
  mode: z.literal("dry_run"),
  commandType: z.literal("set_lighting"),
  lightingPreset: SetLightingPresetSchema,
  status: RealUnrealSetLightingStatusSchema,
  realSendAllowed: z.literal(false).default(false),
  requestSummary: z.record(z.unknown()).default({}),
  responseSummary: z.record(z.unknown()).default({}),
  endpointHost: z.string().max(255).nullable().default(null),
  endpointPath: z.literal("/set-lighting/dry-run"),
  httpStatus: z.number().int().nullable().default(null),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type RealUnrealSetLightingRecord = z.infer<
  typeof RealUnrealSetLightingRecordSchema
>;

/* ------------------------------------------------------------------ */
/* Real Unreal Set-Panels Dry-Run Network Call                         */
/* Sends ONLY a sanitized set_panels payload to                        */
/*   {UNREAL_BRIDGE_BASE_URL}/set-panels/dry-run.                      */
/* No level load, render, MRQ, asset import, avatar/media attach,      */
/* Sequencer, 4D, publish, social, or live streaming. Text fields are  */
/* truncated. Public URLs are stripped. realSendAllowed locked false.  */
/* ------------------------------------------------------------------ */
export const ALLOWED_SET_PANELS_PRESETS = [
  "newsroom_main_wall",
  "newsroom_breaking_news",
  "newsroom_source_confidence",
  "podcast_topic_cards",
  "debate_split_screen",
  "interview_guest_profile",
  "market_watch_dashboard",
  "weather_map",
  "emergency_alert_board",
  "standby_brand_loop",
] as const;
export const SetPanelsPresetSchema = z.enum(ALLOWED_SET_PANELS_PRESETS);
export type SetPanelsPreset = z.infer<typeof SetPanelsPresetSchema>;

export const REAL_UNREAL_SET_PANELS_STATUSES = ["passed", "failed", "rejected"] as const;
export const RealUnrealSetPanelsStatusSchema = z.enum(REAL_UNREAL_SET_PANELS_STATUSES);
export type RealUnrealSetPanelsStatus = z.infer<typeof RealUnrealSetPanelsStatusSchema>;

/** Text size limits used by the sanitized set-panels payload builder. */
export const SET_PANELS_LIMITS = {
  headlineMax: 200,
  subtitleMax: 300,
  tickerItemsMax: 10,
  tickerItemCharsMax: 200,
  confidenceLabelMax: 64,
  sourceLabelMax: 160,
  mapLabelMax: 160,
  timelineItemsMax: 20,
  timelineLabelMax: 200,
  dataRowsMax: 30,
  dataRowLabelMax: 80,
  dataRowValueMax: 80,
  mediaRefsMax: 20,
  mediaRefCharsMax: 200,
} as const;

export const RealUnrealSetPanelsRequestSchema = z.object({
  productionId: idStr,
  confirm: z.literal(true),
  panelPreset: SetPanelsPresetSchema,
  headline: z.string().max(2000).optional(),
  subtitle: z.string().max(2000).optional(),
  tickerItems: z.array(z.string().max(2000)).max(100).optional(),
  sourcePanel: z.object({
    sourceLabel: z.string().max(2000).optional(),
    citationCount: z.number().int().nonnegative().max(10000).optional(),
  }).optional(),
  confidenceLabel: z.string().max(500).optional(),
  mapPanel: z.object({
    regionLabel: z.string().max(2000).optional(),
    coordsLabel: z.string().max(2000).optional(),
  }).optional(),
  timelinePanel: z.object({
    items: z.array(z.object({
      label: z.string().max(2000),
      timestamp: z.string().max(64).optional(),
    })).max(200).optional(),
  }).optional(),
  marketOrDataPanel: z.object({
    rows: z.array(z.object({
      label: z.string().max(2000),
      value: z.string().max(2000),
    })).max(500).optional(),
  }).optional(),
  mediaRefs: z.array(z.string().max(2000)).max(100).optional(),
});
export type RealUnrealSetPanelsRequest = z.infer<typeof RealUnrealSetPanelsRequestSchema>;

export const RealUnrealSetPanelsRecordSchema = z.object({
  id: idStr,
  productionId: idStr,
  mode: z.literal("dry_run"),
  commandType: z.literal("set_panels"),
  panelPreset: SetPanelsPresetSchema,
  status: RealUnrealSetPanelsStatusSchema,
  realSendAllowed: z.literal(false).default(false),
  requestSummary: z.record(z.unknown()).default({}),
  responseSummary: z.record(z.unknown()).default({}),
  endpointHost: z.string().max(255).nullable().default(null),
  endpointPath: z.literal("/set-panels/dry-run"),
  httpStatus: z.number().int().nullable().default(null),
  sanitizationStats: z.object({
    publicUrlsStripped: z.number().int().nonnegative().default(0),
    textsTruncated: z.number().int().nonnegative().default(0),
    tickerItemsDropped: z.number().int().nonnegative().default(0),
    timelineItemsDropped: z.number().int().nonnegative().default(0),
    dataRowsDropped: z.number().int().nonnegative().default(0),
    mediaRefsDropped: z.number().int().nonnegative().default(0),
  }).default({
    publicUrlsStripped: 0, textsTruncated: 0, tickerItemsDropped: 0,
    timelineItemsDropped: 0, dataRowsDropped: 0, mediaRefsDropped: 0,
  }),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type RealUnrealSetPanelsRecord = z.infer<
  typeof RealUnrealSetPanelsRecordSchema
>;

/* ------------------------------------------------------------------ */
/* Real Unreal Bridge Health-Check Network Call — dry-run only.        */
/* The ONLY real network call permitted in this phase. No production   */
/* data, no asset data, no render/import commands, no MRQ, no 4D send, */
/* no level load. realSendAllowed locked false.                        */
/* ------------------------------------------------------------------ */
export const REAL_UNREAL_HEALTH_CHECK_STATUSES = [
  "network_ok",
  "network_failed",
  "config_missing",
  "rejected",
] as const;
export const RealUnrealHealthCheckStatusSchema = z.enum(REAL_UNREAL_HEALTH_CHECK_STATUSES);
export type RealUnrealHealthCheckStatus = z.infer<typeof RealUnrealHealthCheckStatusSchema>;

export const RealUnrealHealthCheckRecordSchema = z.object({
  id: idStr,
  mode: z.literal("dry_run"),
  endpointHost: z.string().max(255).default(""),
  endpointPath: z.literal("/health/dry-run"),
  status: RealUnrealHealthCheckStatusSchema,
  httpStatus: z.number().int().nullable().default(null),
  realSendAllowed: z.literal(false).default(false),
  requestSummary: z.record(z.unknown()).default({}),
  responseSummary: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type RealUnrealHealthCheckRecord = z.infer<typeof RealUnrealHealthCheckRecordSchema>;

export const AuditLogSchema = z.object({
  id: idStr,
  at: z.string(),
  actor: z.string().max(120),
  action: z.string().max(80),
  detail: z.string().max(400),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

/* ------------------------------------------------------------------ */
/* Manifests                                                           */
/* ------------------------------------------------------------------ */

export const ProductionManifestSchema = z.object({
  productionId: idStr,
  productionType: ProductionSchema.shape.productionType,
  title: shortStr,
  script: longStr,
  room: shortStr,
  avatars: z.array(shortStr),
  panels: z.array(z.string()),
  cameras: z.array(z.string()),
  audio: z.array(z.string()),
  captions: z.boolean(),
  overlays: z.array(z.string()),
  renderSettings: ProductionSchema.shape.renderSettings,
  approvalStatus: ProductionStatusSchema,
  envelope: SafetyEnvelopeSchema,
});
export type ProductionManifest = z.infer<typeof ProductionManifestSchema>;

export const UnrealSceneManifestSchema = z.object({
  productionId: idStr,
  levelName: shortStr,
  roomType: RoomTypeSchema,
  cameraPreset: z.string().max(120),
  lightingPreset: z.string().max(120),
  screenContent: z.array(z.string()),
  avatarBlueprints: z.array(z.string()),
  sequencerTimeline: z.string().max(200),
  renderPreset: z.enum(["preview", "cinematic_4k", "cinematic_8k"]),
  envelope: SafetyEnvelopeSchema,
});
export type UnrealSceneManifest = z.infer<typeof UnrealSceneManifestSchema>;

export const AvatarManifestSchema = z.object({
  avatarId: idStr,
  avatarName: shortStr,
  role: AvatarRoleSchema,
  voiceProvider: AvatarSchema.shape.voiceProvider,
  voiceId: z.string(),
  animationProvider: z.string(),
  unrealBlueprintName: z.string(),
  lipSyncFile: z.string().nullable(),
  bodyAnimationFile: z.string().nullable(),
  envelope: SafetyEnvelopeSchema,
});
export type AvatarManifest = z.infer<typeof AvatarManifestSchema>;

export const FourDCueManifestSchema = z.object({
  productionId: idStr,
  timeline: z.array(
    z.object({
      timecodeMs: z.number().int().min(0),
      cueType: FourDEffectSchema,
      effectTarget: z.string(),
      intensity: z.number().min(0).max(1),
      durationMs: z.number().int().min(1),
      approvalRequired: z.literal(true),
    }),
  ),
  envelope: SafetyEnvelopeSchema,
});
export type FourDCueManifest = z.infer<typeof FourDCueManifestSchema>;

/* ------------------------------------------------------------------ */
/* Prompt studio                                                       */
/* ------------------------------------------------------------------ */

export const PromptStudioInputSchema = z.object({
  prompt: mediumStr,
  productionType: ProductionSchema.shape.productionType.default("newsroom"),
});
export type PromptStudioInput = z.infer<typeof PromptStudioInputSchema>;

export const PromptStudioOutputSchema = z.object({
  productionPlan: z.object({
    title: shortStr,
    summary: mediumStr,
    bullets: z.array(z.string().max(200)),
  }),
  sceneManifest: UnrealSceneManifestSchema,
  unrealCommand: z.object({
    command: z.literal("send_scene_manifest"),
    payload: z.record(z.unknown()),
    dryRun: z.literal(true),
  }),
  avatarManifest: AvatarManifestSchema,
  fourDCueManifest: FourDCueManifestSchema,
  assetGenerationPrompts: z.array(z.string()),
  voiceGenerationPrompts: z.array(z.string()),
  cameraShotList: z.array(z.string()),
  renderInstructions: z.object({
    preset: z.enum(["preview", "cinematic_4k", "cinematic_8k"]),
    fps: z.number().int(),
    requiresApproval: z.literal(true),
  }),
  envelope: SafetyEnvelopeSchema,
});
export type PromptStudioOutput = z.infer<typeof PromptStudioOutputSchema>;

/* ------------------------------------------------------------------ */
/* OpenAI generation mode — strict response shape we require from the   */
/* model. Anything missing/extra is rejected.                           */
/* ------------------------------------------------------------------ */

export const OpenAIGeneratedPackageSchema = z
  .object({
    productionPlan: z
      .object({
        title: z.string().min(1).max(200),
        summary: z.string().min(1).max(2000),
        bullets: z.array(z.string().max(300)).max(20).default([]),
      })
      .strict(),
    script: z.string().max(20_000).default(""),
    roomSpec: z
      .object({
        name: z.string().min(1).max(200),
        type: z.string().min(1).max(100),
        description: z.string().max(2000).default(""),
        lightingStyle: z.string().max(200).optional().default(""),
      })
      .strict(),
    avatarSpec: z
      .object({
        name: z.string().min(1).max(200),
        role: z.string().min(1).max(200),
        voiceDescription: z.string().max(500).optional().default(""),
        appearanceDescription: z.string().max(1000).optional().default(""),
      })
      .strict(),
    cameraShotList: z.array(z.string().max(300)).max(30).default([]),
    unrealSceneDraft: z
      .object({
        levelName: z.string().min(1).max(200),
        roomType: z.enum(["newsroom", "podcast_room", "conference_hall", "custom"]),
        cameraPreset: z.string().max(100).default("wide_default"),
        lightingPreset: z.string().max(100).default("default_studio"),
        sequencerTimeline: z.string().max(200).default(""),
      })
      .strict(),
    fourDCueDraft: z
      .array(
        z
          .object({
            timecodeMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000),
            cueType: z.string().min(1).max(100),
            intensity: z.number().min(0).max(1).default(0.5),
            durationMs: z.number().int().nonnegative().max(60_000).default(1000),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    safetyNotes: z.array(z.string().max(500)).max(20).default([]),
  })
  .strict();
export type OpenAIGeneratedPackage = z.infer<typeof OpenAIGeneratedPackageSchema>;

export const OpenAIGenerateInputSchema = z.object({
  prompt: mediumStr,
  productionType: ProductionSchema.shape.productionType.default("newsroom"),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be exactly true" }),
  }),
});
export type OpenAIGenerateInput = z.infer<typeof OpenAIGenerateInputSchema>;

/* ------------------------------------------------------------------ */
/* Voice Studio (ElevenLabs + mock)                                     */
/* ------------------------------------------------------------------ */

export const VoiceProviderSchema = z.enum(["mock", "elevenlabs"]);
export type VoiceProvider = z.infer<typeof VoiceProviderSchema>;

export const VoiceAssetSchema = z.object({
  id: idStr,
  productionId: idStr.nullable().default(null),
  provider: VoiceProviderSchema,
  voiceId: z.string().min(1).max(120),
  voiceName: z.string().max(120).default(""),
  scriptHash: z.string().min(8).max(128),
  scriptPreview: z.string().max(500).default(""),
  audioFilePath: z.string().max(500).nullable().default(null),
  audioUrl: z.literal(null).default(null),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  durationSeconds: z.number().nonnegative().max(60 * 60).nullable().default(null),
  status: z.enum(["draft", "generated", "failed"]).default("draft"),
  approvalStatus: z.literal("draft").default("draft"),
  errorReason: z.string().max(300).default(""),
  metadata: z.record(z.unknown()).default({}),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type VoiceAsset = z.infer<typeof VoiceAssetSchema>;

export const VoiceGenerateInputSchema = z
  .object({
    productionId: idStr.optional(),
    script: z.string().min(1).max(20_000).optional(),
    voiceId: z.string().min(1).max(120),
    voiceName: z.string().max(120).optional(),
    confirm: z.literal(true, {
      errorMap: () => ({ message: "confirm must be exactly true" }),
    }),
  })
  .refine((d) => !!(d.productionId || d.script), {
    message: "Provide productionId or script",
    path: ["script"],
  });
export type VoiceGenerateInput = z.infer<typeof VoiceGenerateInputSchema>;

export const VoiceMockInputSchema = z.object({
  productionId: idStr.optional(),
  script: z.string().min(1).max(20_000).optional(),
  voiceId: z.string().min(1).max(120).default("mock-default"),
  voiceName: z.string().max(120).optional(),
}).refine((d) => !!(d.productionId || d.script), {
  message: "Provide productionId or script",
  path: ["script"],
});
export type VoiceMockInput = z.infer<typeof VoiceMockInputSchema>;

/* ------------------------------------------------------------------ */
/* Asset Studio (Meshy + mock)                                         */
/* ------------------------------------------------------------------ */

export const AssetProviderSchema = z.enum(["mock", "meshy"]);
export type AssetProvider = z.infer<typeof AssetProviderSchema>;

export const AssetTypeSchema = z.enum([
  "room",
  "prop",
  "desk",
  "panel",
  "screen",
  "avatar_accessory",
  "hall",
  "environment",
  "custom",
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetJobSchema = z.object({
  id: idStr,
  productionId: idStr.nullable().default(null),
  provider: AssetProviderSchema,
  assetType: AssetTypeSchema,
  prompt: z.string().max(2000).default(""),
  promptHash: z.string().min(8).max(128),
  status: z.enum(["draft", "submitted", "generated", "failed"]).default("draft"),
  approvalStatus: z.literal("draft").default("draft"),
  providerJobId: z.string().max(200).nullable().default(null),
  internalAssetPath: z.string().max(500).nullable().default(null),
  modelUrl: z.literal(null).default(null),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  errorReason: z.string().max(300).default(""),
  metadata: z.record(z.unknown()).default({}),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type AssetJob = z.infer<typeof AssetJobSchema>;

export const MeshyGenerateInputSchema = z
  .object({
    productionId: idStr.optional(),
    assetType: AssetTypeSchema,
    prompt: z.string().min(1).max(2000),
    confirm: z.literal(true, {
      errorMap: () => ({ message: "confirm must be exactly true" }),
    }),
  });
export type MeshyGenerateInput = z.infer<typeof MeshyGenerateInputSchema>;

export const MeshyMockInputSchema = z.object({
  productionId: idStr.optional(),
  assetType: AssetTypeSchema,
  prompt: z.string().min(1).max(2000),
});
export type MeshyMockInput = z.infer<typeof MeshyMockInputSchema>;

/* ------------------------------------------------------------------ */
/* Video Studio (Runway + mock)                                        */
/* ------------------------------------------------------------------ */

export const VideoProviderSchema = z.enum(["mock", "runway"]);
export type VideoProvider = z.infer<typeof VideoProviderSchema>;

export const VideoTypeSchema = z.enum([
  "newsroom_screen",
  "podcast_intro",
  "broll",
  "transition",
  "led_wall",
  "explainer",
  "background_loop",
  "custom",
]);
export type VideoType = z.infer<typeof VideoTypeSchema>;

export const VideoAspectRatioSchema = z.enum(["16:9", "9:16", "1:1", "4:3", "21:9"]);
export type VideoAspectRatio = z.infer<typeof VideoAspectRatioSchema>;

export const VideoJobSchema = z.object({
  id: idStr,
  productionId: idStr.nullable().default(null),
  provider: VideoProviderSchema,
  videoType: VideoTypeSchema,
  prompt: z.string().max(2000).default(""),
  promptHash: z.string().min(8).max(128),
  durationSeconds: z.number().int().min(1).max(60),
  aspectRatio: VideoAspectRatioSchema,
  status: z.enum(["draft", "submitted", "generated", "failed"]).default("draft"),
  approvalStatus: z.literal("draft").default("draft"),
  providerJobId: z.string().max(200).nullable().default(null),
  internalVideoPath: z.string().max(500).nullable().default(null),
  videoUrl: z.literal(null).default(null),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  errorReason: z.string().max(300).default(""),
  metadata: z.record(z.unknown()).default({}),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type VideoJob = z.infer<typeof VideoJobSchema>;

export const RunwayGenerateInputSchema = z.object({
  productionId: idStr.optional(),
  videoType: VideoTypeSchema,
  prompt: z.string().min(1).max(2000),
  durationSeconds: z.number().int().min(1).max(60).default(5),
  aspectRatio: VideoAspectRatioSchema.default("16:9"),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be exactly true" }),
  }),
});
export type RunwayGenerateInput = z.infer<typeof RunwayGenerateInputSchema>;

export const RunwayMockInputSchema = z.object({
  productionId: idStr.optional(),
  videoType: VideoTypeSchema,
  prompt: z.string().min(1).max(2000),
  durationSeconds: z.number().int().min(1).max(60).default(5),
  aspectRatio: VideoAspectRatioSchema.default("16:9"),
});
export type RunwayMockInput = z.infer<typeof RunwayMockInputSchema>;

/* ------------------------------------------------------------------ */
/* Real Unreal Render-Preview Contract Dry-Run Network Call            */
/* Sends ONLY a sanitized render_preview_contract payload to           */
/*   {UNREAL_BRIDGE_BASE_URL}/render-preview/contract/dry-run.         */
/* It NEVER triggers Movie Render Queue, render frames, load levels,   */
/* import assets, start Sequencer, attach media, send 4D commands,     */
/* or create public output. realSendAllowed locked false.              */
/* ------------------------------------------------------------------ */
export const REAL_UNREAL_RENDER_PREVIEW_CONTRACT_STATUSES = [
  "passed",
  "failed",
  "rejected",
] as const;
export const RealUnrealRenderPreviewContractStatusSchema = z.enum(
  REAL_UNREAL_RENDER_PREVIEW_CONTRACT_STATUSES,
);
export type RealUnrealRenderPreviewContractStatus = z.infer<
  typeof RealUnrealRenderPreviewContractStatusSchema
>;

export const RealUnrealRenderPreviewContractRequestSchema = z.object({
  productionId: idStr,
  confirm: z.literal(true),
  /**
   * Indicates whether the production uses on-air panels (HUD / wall / overlay).
   * When true, a passing set_panels dry-run record is required by the chained
   * gate. When false/omitted, the panels gate is skipped.
   */
  panelsUsed: z.boolean().optional(),
});
export type RealUnrealRenderPreviewContractRequest = z.infer<
  typeof RealUnrealRenderPreviewContractRequestSchema
>;

export const RealUnrealRenderPreviewContractRecordSchema = z.object({
  id: idStr,
  productionId: idStr,
  mode: z.literal("dry_run"),
  commandType: z.literal("render_preview_contract"),
  status: RealUnrealRenderPreviewContractStatusSchema,
  realSendAllowed: z.literal(false).default(false),
  /** Distinguishes local validation records from network records. */
  phase: z.enum(["local_validation", "network_dry_run"]),
  requestSummary: z.record(z.unknown()).default({}),
  responseSummary: z.record(z.unknown()).default({}),
  endpointHost: z.string().max(255).nullable().default(null),
  endpointPath: z.literal("/render-preview/contract/dry-run"),
  httpStatus: z.number().int().nullable().default(null),
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type RealUnrealRenderPreviewContractRecord = z.infer<
  typeof RealUnrealRenderPreviewContractRecordSchema
>;

/* ------------------------------------------------------------------ */
/* Real Unreal Command Approval Gate                                   */
/* Governance layer that defines, validates, and stores approval       */
/* requests for FUTURE real Unreal commands. It does NOT execute       */
/* anything. realSendAllowed and executionEnabled are permanently      */
/* false on every record — approval here is purely an audit-and-       */
/* permission record, never an execution trigger.                      */
/* ------------------------------------------------------------------ */

export const REAL_UNREAL_COMMAND_TYPES = [
  "real_health_check",
  "real_validate_package",
  "real_load_level",
  "real_prepare_scene",
  "real_set_camera",
  "real_set_lighting",
  "real_set_panels",
  "real_attach_avatar",
  "real_attach_voice",
  "real_attach_video_panel",
  "real_import_asset_reference",
  "real_start_sequence",
  "real_render_preview",
  "real_render_final",
] as const;
export const RealUnrealCommandTypeSchema = z.enum(REAL_UNREAL_COMMAND_TYPES);
export type RealUnrealCommandType = z.infer<typeof RealUnrealCommandTypeSchema>;

export const REAL_UNREAL_COMMAND_APPROVAL_STATUSES = [
  "requested",
  "approved",
  "rejected",
] as const;
export const RealUnrealCommandApprovalStatusSchema = z.enum(
  REAL_UNREAL_COMMAND_APPROVAL_STATUSES,
);
export type RealUnrealCommandApprovalStatus = z.infer<
  typeof RealUnrealCommandApprovalStatusSchema
>;

export const RealUnrealCommandApprovalRequestSchema = z.object({
  productionId: z.string().min(1).max(120),
  commandType: RealUnrealCommandTypeSchema,
  reason: z.string().min(1).max(2000),
  panelsUsed: z.boolean().optional(),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be exactly true" }),
  }),
});
export type RealUnrealCommandApprovalRequest = z.infer<
  typeof RealUnrealCommandApprovalRequestSchema
>;

export const RealUnrealCommandApprovalDecisionSchema = z.object({
  id: z.string().min(1).max(120),
  decision: z.enum(["approved", "rejected"]),
  decisionReason: z.string().min(1).max(2000),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be exactly true" }),
  }),
});
export type RealUnrealCommandApprovalDecision = z.infer<
  typeof RealUnrealCommandApprovalDecisionSchema
>;

export const RealUnrealCommandApprovalRecordSchema = z.object({
  id: z.string().min(1).max(120),
  productionId: z.string().min(1).max(120),
  commandType: RealUnrealCommandTypeSchema,
  status: RealUnrealCommandApprovalStatusSchema,
  reason: z.string().max(2000),
  decisionReason: z.string().max(2000).nullable().default(null),
  panelsUsed: z.boolean().default(false),
  /** PERMANENTLY false — this gate NEVER flips it. */
  realSendAllowed: z.literal(false).default(false),
  /** PERMANENTLY false — this gate NEVER flips it. */
  executionEnabled: z.literal(false).default(false),
  /** PERMANENTLY null — no network endpoint is ever recorded. */
  endpointHost: z.literal(null).default(null),
  approvalStageAtRequest: z.string().max(120),
  readinessReportId: z.string().max(120).nullable().default(null),
  readinessSummary: z.record(z.unknown()).default({}),
  dryRunChainSummary: z.record(z.unknown()).default({}),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
  decidedAt: z.string().nullable().default(null),
});
export type RealUnrealCommandApprovalRecord = z.infer<
  typeof RealUnrealCommandApprovalRecordSchema
>;

/* ------------------------------------------------------------------ */
/* Real Unreal Level-Load Contract (contract-only, no execution)       */
/* Defines, validates, stores, and exports proposed level-load command */
/* contracts. NEVER loads a real level, calls Unreal, renders, starts  */
/* MRQ or Sequencer, imports assets, attaches media, sends 4D, or      */
/* publishes anything. realSendAllowed and executionEnabled are        */
/* permanently false.                                                  */
/* ------------------------------------------------------------------ */

export const ALLOWED_UNREAL_LEVEL_NAMES = [
  "Mougle_Newsroom_Main",
  "Mougle_Podcast_Room",
  "Mougle_Debate_Studio",
  "Mougle_Interview_Room",
  "Mougle_Market_Watch",
  "Mougle_Emergency_Broadcast",
  "Mougle_Cinema_Hall",
  "Mougle_Custom_Sandbox",
] as const;
export const UnrealLevelNameSchema = z.enum(ALLOWED_UNREAL_LEVEL_NAMES);
export type UnrealLevelName = z.infer<typeof UnrealLevelNameSchema>;

export const REAL_UNREAL_LEVEL_LOAD_CONTRACT_STATUSES = [
  "created",
  "rejected",
] as const;
export const RealUnrealLevelLoadContractStatusSchema = z.enum(
  REAL_UNREAL_LEVEL_LOAD_CONTRACT_STATUSES,
);
export type RealUnrealLevelLoadContractStatus = z.infer<
  typeof RealUnrealLevelLoadContractStatusSchema
>;

export const RealUnrealLevelLoadContractValidateInputSchema = z.object({
  productionId: z.string().min(1).max(120),
  proposedLevelName: UnrealLevelNameSchema,
});
export type RealUnrealLevelLoadContractValidateInput = z.infer<
  typeof RealUnrealLevelLoadContractValidateInputSchema
>;

export const RealUnrealLevelLoadContractCreateInputSchema = z.object({
  productionId: z.string().min(1).max(120),
  proposedLevelName: UnrealLevelNameSchema,
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be exactly true" }),
  }),
});
export type RealUnrealLevelLoadContractCreateInput = z.infer<
  typeof RealUnrealLevelLoadContractCreateInputSchema
>;

export const RealUnrealLevelLoadContractRecordSchema = z.object({
  id: z.string().min(1).max(120),
  productionId: z.string().min(1).max(120),
  proposedLevelName: UnrealLevelNameSchema,
  commandType: z.literal("real_load_level"),
  mode: z.literal("contract_only"),
  status: RealUnrealLevelLoadContractStatusSchema,
  /** PERMANENTLY false — this module NEVER flips it. */
  realSendAllowed: z.literal(false).default(false),
  /** PERMANENTLY false — this module NEVER flips it. */
  executionEnabled: z.literal(false).default(false),
  approvalRequestId: z.string().max(120).nullable().default(null),
  dryRunChainSummary: z.record(z.unknown()).default({}),
  requestSummary: z.record(z.unknown()).default({}),
  responseSummary: z.record(z.unknown()).default({}),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type RealUnrealLevelLoadContractRecord = z.infer<
  typeof RealUnrealLevelLoadContractRecordSchema
>;

/* ------------------------------------------------------------------ */
/* Real Unreal Live Command Safety Switch (governance only)            */
/* Defines, validates, stores, and displays the global safety state    */
/* for FUTURE live Unreal command execution. NEVER enables live        */
/* commands, loads levels, renders, triggers MRQ/Sequencer, imports    */
/* assets, attaches avatars/media, sends 4D, or publishes. The enum    */
/* intentionally OMITS "live_enabled". realSendAllowed and             */
/* executionEnabled remain permanently false on every record/response. */
/* ------------------------------------------------------------------ */

export const REAL_UNREAL_SAFETY_SWITCH_STATES = [
  "disabled",
  "dry_run_only",
  "contract_only",
] as const;
export const RealUnrealSafetySwitchStateSchema = z.enum(
  REAL_UNREAL_SAFETY_SWITCH_STATES,
);
export type RealUnrealSafetySwitchState = z.infer<
  typeof RealUnrealSafetySwitchStateSchema
>;

export const RealUnrealSafetySwitchCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
});
export type RealUnrealSafetySwitchCheck = z.infer<
  typeof RealUnrealSafetySwitchCheckSchema
>;

export const RealUnrealSafetySwitchReportSchema = z.object({
  id: z.string().min(1).max(120),
  state: RealUnrealSafetySwitchStateSchema,
  /** PERMANENTLY false — this module NEVER flips it. */
  liveExecutionEnabled: z.literal(false).default(false),
  /** PERMANENTLY false — this module NEVER flips it. */
  realSendAllowed: z.literal(false).default(false),
  /** PERMANENTLY false — this module NEVER flips it. */
  executionEnabled: z.literal(false).default(false),
  /** PERMANENTLY true — emergency lock is always engaged. */
  emergencyLocked: z.literal(true).default(true),
  checks: z.array(RealUnrealSafetySwitchCheckSchema).default([]),
  blockers: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type RealUnrealSafetySwitchReport = z.infer<
  typeof RealUnrealSafetySwitchReportSchema
>;

/* ------------------------------------------------------------------ */
/* Real Unreal Live Command Migration Plan (planning-only).            */
/* This module documents and validates the future path from           */
/* dry-run / contract-only Unreal workflows toward carefully gated    */
/* live Unreal commands. It NEVER enables live execution, loads       */
/* levels, renders, triggers MRQ/Sequencer, imports assets, attaches  */
/* avatars/media, sends 4D, or publishes. realSendAllowed and         */
/* executionEnabled remain permanently false on every record.         */
/* emergencyLocked remains permanently true.                          */
/* The status enum INTENTIONALLY contains only "planning_only".        */
/* ------------------------------------------------------------------ */

export const REAL_UNREAL_MIGRATION_PLAN_STATUSES = ["planning_only"] as const;
export const RealUnrealMigrationPlanStatusSchema = z.enum(
  REAL_UNREAL_MIGRATION_PLAN_STATUSES,
);
export type RealUnrealMigrationPlanStatus = z.infer<
  typeof RealUnrealMigrationPlanStatusSchema
>;

export const REAL_UNREAL_MIGRATION_PLAN_MILESTONES = [
  "external_unreal_bridge_deployed",
  "bridge_dry_run_health_check_passing",
  "validate_package_dry_run_passing",
  "prepare_scene_dry_run_passing",
  "set_camera_dry_run_passing",
  "set_lighting_dry_run_passing",
  "set_panels_dry_run_passing",
  "render_preview_contract_passing",
  "command_approval_gate_active",
  "level_load_contract_created",
  "safety_switch_evaluated",
  "emergency_lock_confirmed",
  "operator_manual_created",
  "rollback_plan_created",
  "live_command_audit_policy_approved",
  "live_command_rate_limits_defined",
  "live_command_allowlist_defined",
  "live_command_kill_switch_tested",
] as const;
export type RealUnrealMigrationMilestoneId =
  (typeof REAL_UNREAL_MIGRATION_PLAN_MILESTONES)[number];

export const RealUnrealMigrationMilestoneSchema = z.object({
  id: z.enum(REAL_UNREAL_MIGRATION_PLAN_MILESTONES),
  label: z.string(),
  satisfied: z.boolean(),
  detail: z.string().optional(),
});
export type RealUnrealMigrationMilestone = z.infer<
  typeof RealUnrealMigrationMilestoneSchema
>;

export const REAL_UNREAL_LIVE_COMMAND_RISK_LEVELS = [
  "low", "medium", "high", "critical",
] as const;
export const RealUnrealLiveCommandRiskLevelSchema = z.enum(
  REAL_UNREAL_LIVE_COMMAND_RISK_LEVELS,
);
export type RealUnrealLiveCommandRiskLevel = z.infer<
  typeof RealUnrealLiveCommandRiskLevelSchema
>;

export const RealUnrealLiveCommandRiskMatrixItemSchema = z.object({
  commandType: RealUnrealCommandTypeSchema,
  riskLevel: RealUnrealLiveCommandRiskLevelSchema,
  requiredApprovals: z.array(z.string()),
  requiredDryRuns: z.array(z.string()),
  rollbackRequirement: z.string(),
  /** PERMANENTLY false — this module NEVER flips it. */
  executionEnabled: z.literal(false).default(false),
  /** PERMANENTLY false — this module NEVER flips it. */
  realSendAllowed: z.literal(false).default(false),
});
export type RealUnrealLiveCommandRiskMatrixItem = z.infer<
  typeof RealUnrealLiveCommandRiskMatrixItemSchema
>;

export const RealUnrealMigrationPlanRecordSchema = z.object({
  id: z.string().min(1).max(120),
  /** PERMANENTLY "planning_only" — this is the only allowed status. */
  status: z.literal("planning_only").default("planning_only"),
  /** PERMANENTLY false — this module NEVER flips it. */
  liveExecutionEnabled: z.literal(false).default(false),
  /** PERMANENTLY false — this module NEVER flips it. */
  realSendAllowed: z.literal(false).default(false),
  /** PERMANENTLY false — this module NEVER flips it. */
  executionEnabled: z.literal(false).default(false),
  /** PERMANENTLY true — emergency lock is always engaged. */
  emergencyLocked: z.literal(true).default(true),
  milestones: z.array(RealUnrealMigrationMilestoneSchema).default([]),
  blockers: z.array(z.string()).default([]),
  externalDependencies: z.array(z.string()).default([]),
  riskMatrix: z.array(RealUnrealLiveCommandRiskMatrixItemSchema).default([]),
  safetyEnvelope: SafetyEnvelopeSchema,
  generatedAt: z.string(),
});
export type RealUnrealMigrationPlanRecord = z.infer<
  typeof RealUnrealMigrationPlanRecordSchema
>;

/* ================================================================== */
/* 3D/4D Room, Avatar, Production Units, Media Pipeline, Preview      */
/* All collections are draft/internal-only. realSendAllowed=false and */
/* executionEnabled=false on every record. No real Unreal/4D commands */
/* are wired by these modules. publicUrl and signedUrl are always     */
/* permanently null. visibility is always "admin_only_internal".      */
/* ================================================================== */

export const ROOM_CATEGORIES = [
  "active_newsroom","breaking_newsroom","podcast_room","debate_studio",
  "interview_room","market_watch_room","press_briefing_hall",
  "education_hall","cinema_hall","event_hall","emergency_broadcast_room",
  "custom_production_room",
] as const;
export const RoomCategorySchema = z.enum(ROOM_CATEGORIES);
export type RoomCategory = z.infer<typeof RoomCategorySchema>;

export const GeneratedRoomRecordSchema = z.object({
  roomId: z.string().min(1).max(120),
  productionId: z.string().nullable().default(null),
  roomName: z.string(),
  roomCategory: RoomCategorySchema,
  visualStyle: z.string(),
  cameraStyle: z.string(),
  lightingStyle: z.string(),
  colorPalette: z.array(z.string()).default([]),
  screenLayout: z.string(),
  panelLayout: z.string(),
  audienceMode: z.string(),
  fourDCompatibility: z.array(z.string()).default([]),
  unrealLevelCandidate: z.string(),
  prompt: z.string(),
  promptHash: z.string(),
  status: z.literal("draft").default("draft"),
  approvalStatus: z.literal("draft").default("draft"),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  realSendAllowed: z.literal(false).default(false),
  executionEnabled: z.literal(false).default(false),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type GeneratedRoomRecord = z.infer<typeof GeneratedRoomRecordSchema>;

export const GENERATED_AVATAR_ROLES = [
  "news_anchor","podcast_host","debate_moderator","guest","analyst",
  "field_reporter","teacher","virtual_ceo","ai_assistant","custom_avatar",
] as const;
export const GeneratedAvatarRoleSchema = z.enum(GENERATED_AVATAR_ROLES);
export type GeneratedAvatarRole = z.infer<typeof GeneratedAvatarRoleSchema>;

export const AVATAR_ACCESSORY_TYPES = [
  "suit","microphone","earpiece","glasses","desk_nameplate","tablet",
  "headset","badge","studio_prop","custom_accessory",
] as const;
export const AvatarAccessoryTypeSchema = z.enum(AVATAR_ACCESSORY_TYPES);
export type AvatarAccessoryType = z.infer<typeof AvatarAccessoryTypeSchema>;

export const AvatarAccessoryRecordSchema = z.object({
  accessoryId: z.string().min(1).max(120),
  avatarId: z.string().nullable().default(null),
  accessoryType: AvatarAccessoryTypeSchema,
  label: z.string(),
  description: z.string(),
  prompt: z.string(),
  promptHash: z.string(),
  status: z.literal("draft").default("draft"),
  approvalStatus: z.literal("draft").default("draft"),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  realSendAllowed: z.literal(false).default(false),
  executionEnabled: z.literal(false).default(false),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type AvatarAccessoryRecord = z.infer<typeof AvatarAccessoryRecordSchema>;

export const GeneratedAvatarRecordSchema = z.object({
  avatarId: z.string().min(1).max(120),
  productionId: z.string().nullable().default(null),
  avatarName: z.string(),
  avatarRole: GeneratedAvatarRoleSchema,
  avatarStyle: z.string(),
  voiceProfile: z.string(),
  lipSyncReadiness: z.string(),
  metahumanCandidate: z.string(),
  accessoryList: z.array(AvatarAccessoryTypeSchema).default([]),
  prompt: z.string(),
  promptHash: z.string(),
  status: z.literal("draft").default("draft"),
  approvalStatus: z.literal("draft").default("draft"),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  realSendAllowed: z.literal(false).default(false),
  executionEnabled: z.literal(false).default(false),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type GeneratedAvatarRecord = z.infer<typeof GeneratedAvatarRecordSchema>;

export const PRODUCTION_UNIT_TYPES = [
  "news_unit","debate_unit","podcast_unit","youtube_unit","social_clip_unit",
  "documentary_unit","education_unit","event_unit","four_d_cinema_unit",
  "custom_unit",
] as const;
export const ProductionUnitTypeSchema = z.enum(PRODUCTION_UNIT_TYPES);
export type ProductionUnitType = z.infer<typeof ProductionUnitTypeSchema>;

export const ProductionUnitRecordSchema = z.object({
  unitId: z.string().min(1).max(120),
  unitName: z.string(),
  unitType: ProductionUnitTypeSchema,
  productionId: z.string().nullable().default(null),
  roomId: z.string().nullable().default(null),
  avatarIds: z.array(z.string()).default([]),
  voiceAssetIds: z.array(z.string()).default([]),
  meshyJobIds: z.array(z.string()).default([]),
  runwayJobIds: z.array(z.string()).default([]),
  fourDCuePlanId: z.string().nullable().default(null),
  unrealDryRunChainStatus: z.string().default("not_started"),
  mediaPackageIds: z.array(z.string()).default([]),
  status: z.literal("draft").default("draft"),
  approvalStatus: z.literal("draft").default("draft"),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  realSendAllowed: z.literal(false).default(false),
  executionEnabled: z.literal(false).default(false),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type ProductionUnitRecord = z.infer<typeof ProductionUnitRecordSchema>;

export const MEDIA_PACKAGE_TYPES = [
  "news_to_debate","news_to_podcast","news_to_youtube","news_to_social",
  "podcast_to_clips","debate_to_clips","newsroom_to_4d_cinema",
  "custom_package",
] as const;
export const MediaPackageTypeSchema = z.enum(MEDIA_PACKAGE_TYPES);
export type MediaPackageType = z.infer<typeof MediaPackageTypeSchema>;

export const MediaPackageRecordSchema = z.object({
  packageId: z.string().min(1).max(120),
  productionId: z.string().nullable().default(null),
  packageType: MediaPackageTypeSchema,
  sourceTopic: z.string(),
  targetFormat: z.string(),
  scriptDraft: z.string(),
  debateAngles: z.array(z.string()).default([]),
  podcastOutline: z.array(z.string()).default([]),
  socialCaptions: z.array(z.string()).default([]),
  youtubeTitle: z.string(),
  youtubeDescription: z.string(),
  thumbnailPrompt: z.string(),
  roomRecommendation: z.string(),
  avatarRecommendation: z.array(z.string()).default([]),
  assetRequirements: z.array(z.string()).default([]),
  fourDCueSuggestions: z.array(z.string()).default([]),
  setManifestId: z.string().max(120).nullable().default(null),
  rigAssetId: z.string().max(120).nullable().default(null),
  status: z.literal("draft").default("draft"),
  approvalStatus: z.literal("draft").default("draft"),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  realSendAllowed: z.literal(false).default(false),
  executionEnabled: z.literal(false).default(false),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type MediaPackageRecord = z.infer<typeof MediaPackageRecordSchema>;

export const PREVIEW_MODES = [
  "newsroom","podcast_room","debate_studio","hall_event",
  "youtube_social_package","four_d_cinema_cue",
] as const;
export const PreviewModeSchema = z.enum(PREVIEW_MODES);
export type PreviewMode = z.infer<typeof PreviewModeSchema>;

export const PREVIEW_LAYOUT_PRESETS = [
  "anchor_center","podcast_two_host","debate_three_person","hall_stage",
  "market_wall","breaking_news_alert","emergency_broadcast","custom_grid",
] as const;
export const PreviewLayoutPresetSchema = z.enum(PREVIEW_LAYOUT_PRESETS);
export type PreviewLayoutPreset = z.infer<typeof PreviewLayoutPresetSchema>;

export const PreviewSnapshotRecordSchema = z.object({
  snapshotId: z.string().min(1).max(120),
  previewId: z.string().min(1).max(120).optional(),
  productionId: z.string(),
  previewMode: PreviewModeSchema.default("newsroom"),
  layoutPreset: PreviewLayoutPresetSchema.default("anchor_center"),
  roomId: z.string().nullable().default(null),
  selectedRoomId: z.string().nullable().default(null),
  avatarIds: z.array(z.string()).default([]),
  selectedAvatarIds: z.array(z.string()).default([]),
  selectedMediaPackageIds: z.array(z.string()).default([]),
  selectedCueIds: z.array(z.string()).default([]),
  screenLayout: z.string(),
  panelLayout: z.string(),
  panelSummary: z.string().default(""),
  lowerThird: z.string(),
  lowerThirdText: z.string().default(""),
  ticker: z.string(),
  tickerText: z.string().default(""),
  cameraPreset: z.string(),
  lightingPreset: z.string(),
  fourDCueMarkers: z.array(z.string()).default([]),
  mediaPackageType: z.string().nullable().default(null),
  assetBadges: z.array(z.string()).default([]),
  unrealDryRunStatus: z.string(),
  readinessStatus: z.string(),
  approvalStatus: z.literal("draft").default("draft"),
  status: z.literal("draft").default("draft"),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  realSendAllowed: z.literal(false).default(false),
  executionEnabled: z.literal(false).default(false),
  adminPreviewOnly: z.literal(true).default(true),
  notRendered: z.literal(true).default(true),
  notPublished: z.literal(true).default(true),
  noUnrealExecution: z.literal(true).default(true),
  noFourDHardware: z.literal(true).default(true),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type PreviewSnapshotRecord = z.infer<typeof PreviewSnapshotRecordSchema>;

/* ------------------------------------------------------------------ */
/* Guided Production Wizard (admin-only, draft/internal)              */
/* ------------------------------------------------------------------ */

export const WIZARD_PRODUCTION_TYPES = [
  "newsroom","breaking_news","debate","podcast","interview",
  "market_watch","youtube_episode","social_clip_package",
  "four_d_cinema_room","event_hall","custom_production",
] as const;
export const WizardProductionTypeSchema = z.enum(WIZARD_PRODUCTION_TYPES);
export type WizardProductionType = z.infer<typeof WizardProductionTypeSchema>;

export const WIZARD_STEPS = [
  "production_type","prompt","room","avatar_accessories",
  "media_package","four_d_cues","cinematic_preview","save_draft",
] as const;
export const WizardStepNameSchema = z.enum(WIZARD_STEPS);
export type WizardStepName = z.infer<typeof WizardStepNameSchema>;

export const WIZARD_STEP_COUNT = 8;

export const ProductionWizardSessionRecordSchema = z.object({
  wizardId: z.string().min(1).max(120),
  productionId: z.string().nullable().default(null),
  productionType: WizardProductionTypeSchema,
  prompt: z.string().default(""),
  currentStep: z.number().int().min(1).max(WIZARD_STEP_COUNT).default(1),
  completedSteps: z.array(z.number().int().min(1).max(WIZARD_STEP_COUNT)).default([]),
  generatedRoomId: z.string().nullable().default(null),
  generatedAvatarIds: z.array(z.string()).default([]),
  generatedAccessoryIds: z.array(z.string()).default([]),
  generatedMediaPackageId: z.string().nullable().default(null),
  generatedPreviewId: z.string().nullable().default(null),
  fourDCueSuggestions: z.array(z.string()).default([]),
  status: z.enum(["draft","finalized"]).default("draft"),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  realSendAllowed: z.literal(false).default(false),
  executionEnabled: z.literal(false).default(false),
  adminPreviewOnly: z.literal(true).default(true),
  notRendered: z.literal(true).default(true),
  notPublished: z.literal(true).default(true),
  noUnrealExecution: z.literal(true).default(true),
  noFourDHardware: z.literal(true).default(true),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProductionWizardSessionRecord =
  z.infer<typeof ProductionWizardSessionRecordSchema>;

export const WizardStartInputSchema = z.object({
  productionType: WizardProductionTypeSchema,
  prompt: z.string().min(1).max(8000),
  productionId: z.string().min(1).max(120).nullable().optional(),
});
export const WizardStepInputSchema = z.object({
  step: z.number().int().min(1).max(WIZARD_STEP_COUNT),
  data: z.record(z.unknown()).optional(),
});

export const WizardSendToReviewInputSchema = z.object({
  reason: z.string().max(2000).optional(),
}).default({});

export const WizardReviewLinkRecordSchema = z.object({
  reviewId: z.string().min(1).max(120),
  wizardId: z.string().min(1).max(120),
  productionId: z.string().min(1).max(120),
  linkedRoomId: z.string().nullable().default(null),
  linkedAvatarIds: z.array(z.string()).default([]),
  linkedAccessoryIds: z.array(z.string()).default([]),
  linkedMediaPackageId: z.string().nullable().default(null),
  linkedPreviewId: z.string().nullable().default(null),
  linkedFourDCueSuggestions: z.array(z.string()).default([]),
  readinessReportId: z.string().nullable().default(null),
  approvalStage: z.string().default("draft"),
  approvalEntryId: z.string().nullable().default(null),
  status: z.enum(["pending","linked","needs_review"]).default("linked"),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  realSendAllowed: z.literal(false).default(false),
  executionEnabled: z.literal(false).default(false),
  adminPreviewOnly: z.literal(true).default(true),
  notRendered: z.literal(true).default(true),
  notPublished: z.literal(true).default(true),
  noUnrealExecution: z.literal(true).default(true),
  noFourDHardware: z.literal(true).default(true),
  safetyEnvelope: SafetyEnvelopeSchema,
  createdAt: z.string(),
});
export type WizardReviewLinkRecord = z.infer<typeof WizardReviewLinkRecordSchema>;

/* ================================================================== */
/* Preview Studio (admin-only, dry-run, never published)               */
/* ================================================================== */

export const PREVIEW_STUDIO_MODES = [
  "newsroom",
  "breaking_news",
  "podcast",
  "debate",
  "interview",
  "market_watch",
  "hall_event",
  "youtube_social",
  "fourd_cinema",
] as const;
export const PreviewStudioModeSchema = z.enum(PREVIEW_STUDIO_MODES);
export type PreviewStudioMode = z.infer<typeof PreviewStudioModeSchema>;

export const PREVIEW_STUDIO_LAYOUT_PRESETS = [
  "anchor_center",
  "anchor_left_panel_right",
  "podcast_two_host",
  "podcast_host_guest",
  "debate_three_person",
  "debate_moderator_center",
  "hall_stage",
  "market_wall",
  "breaking_news_alert",
  "emergency_broadcast",
  "social_vertical_preview",
  "custom_grid",
] as const;
export const PreviewStudioLayoutPresetSchema = z.enum(PREVIEW_STUDIO_LAYOUT_PRESETS);
export type PreviewStudioLayoutPreset = z.infer<typeof PreviewStudioLayoutPresetSchema>;

export const PREVIEW_STUDIO_CAMERA_PRESETS = [
  "wide_master",
  "anchor_two_shot",
  "anchor_close_up",
  "panel_overview",
  "audience_reverse",
  "social_vertical",
] as const;
export const PreviewStudioCameraPresetSchema = z.enum(PREVIEW_STUDIO_CAMERA_PRESETS);
export type PreviewStudioCameraPreset = z.infer<typeof PreviewStudioCameraPresetSchema>;

export const PREVIEW_STUDIO_LIGHTING_PRESETS = [
  "neutral_news",
  "warm_studio",
  "breaking_high_contrast",
  "podcast_intimate",
  "hall_event_spot",
  "cinematic_dim",
] as const;
export const PreviewStudioLightingPresetSchema = z.enum(PREVIEW_STUDIO_LIGHTING_PRESETS);
export type PreviewStudioLightingPreset = z.infer<typeof PreviewStudioLightingPresetSchema>;

export const PreviewStudioAvatarMarkerSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  facing: z.enum(["camera", "left", "right", "center"]).default("camera"),
});
export type PreviewStudioAvatarMarker = z.infer<typeof PreviewStudioAvatarMarkerSchema>;

export const PreviewStudioPanelSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["panel", "ledwall", "ticker", "lower_third", "callout", "monitor"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.02).max(1),
  h: z.number().min(0.02).max(1),
});
export type PreviewStudioPanel = z.infer<typeof PreviewStudioPanelSchema>;

export const PreviewStudioFourDCueMarkerSchema = z.object({
  id: z.string(),
  label: z.string(),
  tSec: z.number().min(0).max(3600),
  effect: z.string(),
});
export type PreviewStudioFourDCueMarker = z.infer<typeof PreviewStudioFourDCueMarkerSchema>;

export const PreviewStudioControlsSchema = z.object({
  mode: PreviewStudioModeSchema,
  layoutPreset: PreviewStudioLayoutPresetSchema,
  camera: PreviewStudioCameraPresetSchema,
  lighting: PreviewStudioLightingPresetSchema,
  roomLabel: z.string().min(1).max(120),
  showLowerThird: z.boolean().default(true),
  showTicker: z.boolean().default(true),
  showLedWall: z.boolean().default(true),
  show4dMarkers: z.boolean().default(true),
  tickerText: z.string().max(280).default(""),
  lowerThirdText: z.string().max(140).default(""),
});
export type PreviewStudioControls = z.infer<typeof PreviewStudioControlsSchema>;

export const PreviewStudioSceneSchema = z.object({
  controls: PreviewStudioControlsSchema,
  avatars: z.array(PreviewStudioAvatarMarkerSchema),
  panels: z.array(PreviewStudioPanelSchema),
  fourDCues: z.array(PreviewStudioFourDCueMarkerSchema),
  cameraFrame: z.object({
    aspect: z.enum(["16:9", "9:16", "1:1", "21:9"]),
    label: z.string(),
  }),
  lightingMood: z.object({
    label: z.string(),
    accent: z.string(),
  }),
  notes: z.array(z.string()).default([]),
});
export type PreviewStudioScene = z.infer<typeof PreviewStudioSceneSchema>;

const PREVIEW_STUDIO_SAFETY_FIELDS = {
  status: z.literal("draft").default("draft"),
  approvalStatus: z.literal("draft").default("draft"),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
  publicUrl: z.literal(null).default(null),
  signedUrl: z.literal(null).default(null),
  realSendAllowed: z.literal(false).default(false),
  executionEnabled: z.literal(false).default(false),
  adminPreviewOnly: z.literal(true).default(true),
  notRendered: z.literal(true).default(true),
  notPublished: z.literal(true).default(true),
  noUnrealExecution: z.literal(true).default(true),
  noFourDHardware: z.literal(true).default(true),
} as const;

export const PreviewStudioStateSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  generatedBy: z.string().default("root_admin"),
  scene: PreviewStudioSceneSchema,
  ...PREVIEW_STUDIO_SAFETY_FIELDS,
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type PreviewStudioState = z.infer<typeof PreviewStudioStateSchema>;

export const PreviewStudioGenerateInputSchema = z.object({
  controls: PreviewStudioControlsSchema.partial().extend({
    mode: PreviewStudioModeSchema,
  }),
});
export type PreviewStudioGenerateInput = z.infer<typeof PreviewStudioGenerateInputSchema>;

export const PreviewStudioUpdateControlsInputSchema = z.object({
  controls: PreviewStudioControlsSchema.partial(),
});
export type PreviewStudioUpdateControlsInput = z.infer<typeof PreviewStudioUpdateControlsInputSchema>;

export const PREVIEW_STUDIO_EDIT_KINDS = ["image_compose", "video_compose"] as const;
export const PreviewStudioEditKindSchema = z.enum(PREVIEW_STUDIO_EDIT_KINDS);
export type PreviewStudioEditKind = z.infer<typeof PreviewStudioEditKindSchema>;

export const PreviewStudioEditLayerSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["background", "avatar", "panel", "lower_third", "ticker", "callout", "overlay"]),
  sourceAssetId: z.string().nullable().default(null),
  x: z.number().min(0).max(1).default(0),
  y: z.number().min(0).max(1).default(0),
  w: z.number().min(0.02).max(1).default(0.2),
  h: z.number().min(0.02).max(1).default(0.2),
  opacity: z.number().min(0).max(1).default(1),
  text: z.string().max(280).default(""),
});
export type PreviewStudioEditLayer = z.infer<typeof PreviewStudioEditLayerSchema>;

export const PreviewStudioEditArtifactSchema = z.object({
  id: z.string(),
  kind: PreviewStudioEditKindSchema,
  label: z.string().default("Untitled edit"),
  sourceAssetIds: z.array(z.string()).default([]),
  layers: z.array(PreviewStudioEditLayerSchema).default([]),
  camera: PreviewStudioCameraPresetSchema,
  lighting: PreviewStudioLightingPresetSchema,
  aspect: z.enum(["16:9", "9:16", "1:1", "21:9"]).default("16:9"),
  durationSec: z.number().min(0).max(60).default(0),
  internalFilePath: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative().default(0),
  ...PREVIEW_STUDIO_SAFETY_FIELDS,
  createdAt: z.string(),
  safetyEnvelope: SafetyEnvelopeSchema,
});
export type PreviewStudioEditArtifact = z.infer<typeof PreviewStudioEditArtifactSchema>;

export const PreviewStudioComposeImageInputSchema = z.object({
  label: z.string().max(140).default("Untitled image"),
  sourceAssetIds: z.array(z.string()).default([]),
  layers: z.array(PreviewStudioEditLayerSchema.partial().extend({
    id: z.string().optional(),
    label: z.string(),
    kind: PreviewStudioEditLayerSchema.shape.kind,
  })).default([]),
  camera: PreviewStudioCameraPresetSchema.default("wide_master"),
  lighting: PreviewStudioLightingPresetSchema.default("neutral_news"),
  aspect: z.enum(["16:9", "9:16", "1:1", "21:9"]).default("16:9"),
});
export type PreviewStudioComposeImageInput = z.infer<typeof PreviewStudioComposeImageInputSchema>;

export const PreviewStudioComposeVideoInputSchema = PreviewStudioComposeImageInputSchema.extend({
  durationSec: z.number().min(1).max(30).default(6),
});
export type PreviewStudioComposeVideoInput = z.infer<typeof PreviewStudioComposeVideoInputSchema>;
