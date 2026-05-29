/**
 * Mougle Autopilot Newsroom MVP — shared contracts.
 *
 * SAFETY:
 *   - SAFETY_ENVELOPE is the SINGLE source of truth for what autopilot may
 *     and may not do. It is locked via z.literal() so any tampering by a
 *     client or downstream service fails Zod parse.
 *   - publicPublishing / youtubeUpload / socialPosting / liveStreaming /
 *     realUnrealCommands / real4DCommands / publicUrlGeneration /
 *     signedUrlGeneration are all locked to FALSE forever in this MVP.
 *   - "internalAutopilotAllowed" is a boolean that the operator can flip
 *     via settings, but the FALSE-locked safety toggles above remain locked
 *     regardless.
 *   - No DB import in this file. No drizzle. No shared/schema.ts edits.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Modes                                                              */
/* ------------------------------------------------------------------ */

export const AutopilotModeSchema = z.enum([
  "manual",
  "autopilot_preview",
  "autopilot_internal_playout",
  "autopilot_public_publish", // placeholder only — disabled forever in this MVP
]);
export type AutopilotMode = z.infer<typeof AutopilotModeSchema>;

/* ------------------------------------------------------------------ */
/* Safety envelope — locked literals                                  */
/* ------------------------------------------------------------------ */

export const SafetyEnvelopeSchema = z.object({
  publicPublishing: z.literal(false),
  youtubeUpload: z.literal(false),
  socialPosting: z.literal(false),
  liveStreaming: z.literal(false),
  autonomousExecutionForPublicActions: z.literal(false),
  realUnrealCommands: z.literal(false),
  real4DCommands: z.literal(false),
  publicUrlGeneration: z.literal(false),
  signedUrlGeneration: z.literal(false),
  manualRootAdminOverrideOnly: z.literal(true),
  internalAdminReviewAvailable: z.literal(true),
  internalAutopilotAllowed: z.boolean(),
});
export type SafetyEnvelope = z.infer<typeof SafetyEnvelopeSchema>;

export const SAFETY_ENVELOPE = Object.freeze({
  publicPublishing: false as const,
  youtubeUpload: false as const,
  socialPosting: false as const,
  liveStreaming: false as const,
  autonomousExecutionForPublicActions: false as const,
  realUnrealCommands: false as const,
  real4DCommands: false as const,
  publicUrlGeneration: false as const,
  signedUrlGeneration: false as const,
  manualRootAdminOverrideOnly: true as const,
  internalAdminReviewAvailable: true as const,
  internalAutopilotAllowed: false,
}) satisfies SafetyEnvelope;

/* ------------------------------------------------------------------ */
/* Blocked categories — recognised everywhere                         */
/* ------------------------------------------------------------------ */

export const BLOCKED_CATEGORIES = [
  "elections",
  "war_conflict_escalation",
  "health_medical_advice",
  "financial_recommendation",
  "legal_accusation",
  "death_report",
  "criminal_allegation",
  "minors",
  "graphic_violence",
  "disputed",
  "low_confidence",
  "insufficient_sources",
  "rights_blocked_media",
] as const;
export const BlockedCategorySchema = z.enum(BLOCKED_CATEGORIES);
export type BlockedCategory = z.infer<typeof BlockedCategorySchema>;

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

export const AutopilotSettingsSchema = z.object({
  mode: AutopilotModeSchema.default("manual"),
  killSwitchEngaged: z.boolean().default(false),
  minConfidence: z.number().min(0).max(1).default(0.72),
  minSourceCount: z.number().int().min(1).max(50).default(2),
  allowDevelopingInternalOnly: z.boolean().default(false),
  allowCorrectionsInternal: z.boolean().default(true),
  maxItemsPerCycle: z.number().int().min(1).max(200).default(10),
  cycleIntervalMs: z.number().int().min(1_000).max(60 * 60 * 1000).default(30_000),
  concurrency: z.number().int().min(1).max(8).default(2),
  staleItemAgeMs: z.number().int().min(60_000).default(6 * 60 * 60 * 1000),
  fallbackEnabled: z.boolean().default(true),
});
export type AutopilotSettings = z.infer<typeof AutopilotSettingsSchema>;

export const DEFAULT_SETTINGS: AutopilotSettings = AutopilotSettingsSchema.parse({});

/* ------------------------------------------------------------------ */
/* Decision                                                           */
/* ------------------------------------------------------------------ */

export const AutopilotSafetyGateSchema = z.object({
  gate: z.string().min(1).max(80),
  passed: z.boolean(),
  detail: z.string().max(200),
});
export type AutopilotSafetyGate = z.infer<typeof AutopilotSafetyGateSchema>;

export const AutopilotDecisionSchema = z.object({
  eligible: z.boolean(),
  mode: AutopilotModeSchema,
  reasons: z.array(z.string().max(200)).max(50),
  manualReviewReasons: z.array(z.string().max(200)).max(50),
  blockedCategories: z.array(BlockedCategorySchema).max(BLOCKED_CATEGORIES.length),
  gates: z.array(AutopilotSafetyGateSchema).max(40),
  willPublishPublicly: z.literal(false),
  willPlayInternally: z.boolean(),
  envelope: SafetyEnvelopeSchema,
});
export type AutopilotDecision = z.infer<typeof AutopilotDecisionSchema>;

/* ------------------------------------------------------------------ */
/* Input story shape — accepted by the decision service               */
/* ------------------------------------------------------------------ */

export const AutopilotStoryInputSchema = z.object({
  storyId: z.string().min(1).max(120),
  headline: z.string().min(1).max(300),
  script: z.string().min(1).max(20_000).optional().nullable(),
  status: z.enum(["draft", "verified", "approved_internal", "rejected", "developing", "correction"]),
  disputed: z.boolean().default(false),
  correctionSafe: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  sourceCount: z.number().int().min(0),
  categories: z.array(z.string().min(1).max(60)).max(20).default([]),
  rightsBlocked: z.boolean().default(false),
  involvesMinors: z.boolean().default(false),
  ageMs: z.number().int().min(0).default(0),
});
export type AutopilotStoryInput = z.infer<typeof AutopilotStoryInputSchema>;

/* ------------------------------------------------------------------ */
/* Queue items & playout                                              */
/* ------------------------------------------------------------------ */

export const AutopilotQueueStageSchema = z.enum([
  "source_ingestion",
  "verified_newsroom",
  "script_generation",
  "voice_generation",
  "scene_render_plan",
  "playout",
]);
export type AutopilotQueueStage = z.infer<typeof AutopilotQueueStageSchema>;

export const AutopilotQueueItemSchema = z.object({
  id: z.string().min(1).max(120),
  storyId: z.string().min(1).max(120),
  stage: AutopilotQueueStageSchema,
  status: z.enum(["pending", "in_progress", "done", "blocked", "manual_review", "error"]),
  attempts: z.number().int().min(0).default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  blockedReasons: z.array(z.string().max(200)).max(30).default([]),
});
export type AutopilotQueueItem = z.infer<typeof AutopilotQueueItemSchema>;

export const AutopilotPlayoutKindSchema = z.enum([
  "newsroom_reader",
  "podcast_room",
  "avatar_reader",
  "fallback",
]);
export type AutopilotPlayoutKind = z.infer<typeof AutopilotPlayoutKindSchema>;

export const AutopilotPlayoutItemSchema = z.object({
  id: z.string().min(1).max(120),
  storyId: z.string().min(1).max(120).nullable(),
  kind: AutopilotPlayoutKindSchema,
  scenePlanRef: z.string().max(200).nullable(),
  voicePlanRef: z.string().max(200).nullable(),
  avatarPlanRef: z.string().max(200).nullable(),
  unrealManifestRef: z.string().max(200).nullable(),
  fourDCueManifestRef: z.string().max(200).nullable(),
  durationMs: z.number().int().min(0).max(60 * 60 * 1000),
  visibility: z.literal("admin_only_internal"),
  publicUrl: z.literal(null),
  signedUrl: z.literal(null),
  createdAt: z.string(),
});
export type AutopilotPlayoutItem = z.infer<typeof AutopilotPlayoutItemSchema>;

/* ------------------------------------------------------------------ */
/* Audit                                                              */
/* ------------------------------------------------------------------ */

export const AutopilotAuditEventSchema = z.object({
  id: z.string().min(1).max(120),
  at: z.string(),
  actor: z.string().min(1).max(120),
  action: z.string().min(1).max(80),
  storyId: z.string().min(1).max(120).nullable(),
  mode: AutopilotModeSchema,
  detail: z.string().max(400),
});
export type AutopilotAuditEvent = z.infer<typeof AutopilotAuditEventSchema>;

/* ------------------------------------------------------------------ */
/* Continuous schedule                                                */
/* ------------------------------------------------------------------ */

export const ContinuousNewsroomScheduleSchema = z.object({
  enabled: z.boolean(),
  mode: AutopilotModeSchema,
  cycleIntervalMs: z.number().int().min(1_000).max(60 * 60 * 1000),
  maxItemsPerCycle: z.number().int().min(1).max(200),
  lastCycleAt: z.string().nullable(),
  lastCycleProcessed: z.number().int().min(0).default(0),
  consecutiveFailures: z.number().int().min(0).default(0),
});
export type ContinuousNewsroomSchedule = z.infer<typeof ContinuousNewsroomScheduleSchema>;

/* ------------------------------------------------------------------ */
/* Fallback content                                                   */
/* ------------------------------------------------------------------ */

export const FallbackContentSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum([
    "no_verified_update",
    "market_placeholder",
    "weather_placeholder",
    "general_explainer",
  ]),
  headline: z.string().min(1).max(300),
  script: z.string().min(1).max(2_000),
  durationMs: z.number().int().min(1_000).max(10 * 60 * 1000),
});
export type FallbackContent = z.infer<typeof FallbackContentSchema>;

export const FALLBACK_NO_UPDATE: FallbackContent = {
  id: "fallback_no_update",
  kind: "no_verified_update",
  headline: "No verified update available",
  script:
    "Mougle Newsroom has no verified update available right now. We do not broadcast unverified or developing stories on the autopilot channel.",
  durationMs: 10_000,
};

/* ------------------------------------------------------------------ */
/* Kill switch                                                        */
/* ------------------------------------------------------------------ */

export const AutopilotKillSwitchSchema = z.object({
  engaged: z.boolean(),
  engagedAt: z.string().nullable(),
  engagedBy: z.string().min(1).max(120).nullable(),
  reason: z.string().max(400).nullable(),
});
export type AutopilotKillSwitch = z.infer<typeof AutopilotKillSwitchSchema>;
