/**
 * Neural Newsroom Automation + Broadcast-Grade Virtual Screen Director schemas.
 *
 * Three persistent tables back the orchestration + safety stack:
 *   - screen_presets             (locked, founder-seeded)
 *   - screen_take_plans          (every directorial action becomes one of these)
 *   - screen_safety_validations  (deterministic safety verdict per take plan)
 *
 * SAFETY (mirrors broadcast_briefs):
 *   - Every row is draft / admin_only_internal by default.
 *   - publicUrl / signedUrl are ALWAYS null at the application layer.
 *   - realSendAllowed / executionEnabled / hardwareSendAllowed default false.
 *   - notPublished defaults true.
 *   - safetyEnvelope is required jsonb and is locked by the service layer.
 *
 * Re-exported by `shared/schema.ts` so drizzle-kit and the storage layer see
 * the tables (DDL is applied via direct SQL through SUPABASE_DB_URL — see
 * scripts/migrate-neural-newsroom.ts).
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";

/* --------------------------------------------------------------------- */
/* Shared envelope shape — every neural-newsroom row carries this        */
/* --------------------------------------------------------------------- */
export const SAFETY_ENVELOPE_LOCKED = {
  realSendAllowed: false,
  executionEnabled: false,
  hardwareSendAllowed: false,
  notPublished: true,
  noRealUnreal: true,
  noMovieRenderQueue: true,
  noSequencer: true,
  noReal4DHardware: true,
  noPublishing: true,
  safetyEnvelopeLocked: true,
} as const;

export type SafetyEnvelope = Record<string, boolean>;

/* --------------------------------------------------------------------- */
/* screen_presets                                                         */
/* --------------------------------------------------------------------- */
export const screenPresets = pgTable("screen_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  presetId: text("preset_id").notNull().unique(),
  name: text("name").notNull(),
  targetScreenObjectName: text("target_screen_object_name").notNull(),
  screenRole: text("screen_role").notNull(), // world_map | event_wall | source_panel | claims_panel | timeline_panel | lower_third | ticker | corner_anchor | back_display | side_screen
  x: real("x").notNull(),
  y: real("y").notNull(),
  width: real("width").notNull(),
  height: real("height").notNull(),
  cropRect: jsonb("crop_rect").$type<{ x: number; y: number; w: number; h: number } | null>(),
  zoomRect: jsonb("zoom_rect").$type<{ x: number; y: number; w: number; h: number } | null>(),
  safeArea: jsonb("safe_area").$type<{ x: number; y: number; w: number; h: number }>().notNull(),
  allowedSourceTypes: text("allowed_source_types").array().notNull(),
  allowedSensitivityClasses: text("allowed_sensitivity_classes").array().notNull(),
  fallbackPresetId: text("fallback_preset_id"),
  locked: boolean("locked").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("IDX_screen_presets_screen_role").on(t.screenRole),
]);

export type ScreenPresetRow = typeof screenPresets.$inferSelect;

/* --------------------------------------------------------------------- */
/* screen_take_plans                                                      */
/* --------------------------------------------------------------------- */
export const screenTakePlans = pgTable("screen_take_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  takePlanId: text("take_plan_id").notNull().unique(),
  productionId: text("production_id").notNull(),
  storyId: text("story_id").notNull(),
  broadcastBriefId: text("broadcast_brief_id"),
  screenDataId: text("screen_data_id"),
  visualPlanId: text("visual_plan_id"),
  requestedBy: text("requested_by").notNull(), // ai_anchor | robot_explainer | system_director
  mode: text("mode").notNull().default("fully_automatic_simulation"), // fully_automatic_simulation | assisted_operator | future_hardware_gateway
  currentScriptBeatId: text("current_script_beat_id"),
  sourceId: text("source_id"),
  sourceLicenseStatus: text("source_license_status").notNull().default("rights_unknown"),
  sourceApprovalStatus: text("source_approval_status").notNull().default("unapproved"),
  targetScreenObjectName: text("target_screen_object_name").notNull(),
  targetOutputId: text("target_output_id"),
  screenRole: text("screen_role").notNull(),
  presetId: text("preset_id").notNull(),
  action: text("action").notNull(), // preview_source | route_to_output | fullscreen_take | picture_in_picture_take | split_screen_take | zoom_in | zoom_out | crop | pan | take | cut | fade | restore_default
  transition: text("transition").notNull().default("cut"),
  durationMs: integer("duration_ms").notNull().default(0),
  cropRect: jsonb("crop_rect").$type<{ x: number; y: number; w: number; h: number } | null>(),
  zoomRect: jsonb("zoom_rect").$type<{ x: number; y: number; w: number; h: number } | null>(),
  fallbackSourceId: text("fallback_source_id"),
  fallbackPresetId: text("fallback_preset_id").notNull(),
  restoreDefaultRouteId: text("restore_default_route_id").notNull(),
  sensitivityClass: text("sensitivity_class").notNull().default("normal"),
  confidenceVector: jsonb("confidence_vector").$type<Record<string, number>>().notNull(),
  cTotal: real("c_total").notNull(),
  tierBand: text("tier_band").notNull(), // auto | assisted | review | reject
  validationStatus: text("validation_status").notNull().default("pending"), // pending | passed | failed
  approvalStatus: text("approval_status").notNull().default("draft"),
  visibility: text("visibility").notNull().default("admin_only_internal"),
  publicUrl: text("public_url"),
  signedUrl: text("signed_url"),
  realSendAllowed: boolean("real_send_allowed").notNull().default(false),
  executionEnabled: boolean("execution_enabled").notNull().default(false),
  hardwareSendAllowed: boolean("hardware_send_allowed").notNull().default(false),
  notPublished: boolean("not_published").notNull().default(true),
  safetyEnvelope: jsonb("safety_envelope").$type<SafetyEnvelope>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("IDX_screen_take_plans_story_id").on(t.storyId),
  index("IDX_screen_take_plans_production_id").on(t.productionId),
  index("IDX_screen_take_plans_validation_status").on(t.validationStatus),
  index("IDX_screen_take_plans_created_at").on(t.createdAt),
]);

export type ScreenTakePlanRow = typeof screenTakePlans.$inferSelect;

/* --------------------------------------------------------------------- */
/* screen_safety_validations                                              */
/* --------------------------------------------------------------------- */
export const screenSafetyValidations = pgTable("screen_safety_validations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  validationId: text("validation_id").notNull().unique(),
  takePlanId: text("take_plan_id").notNull(),
  passed: boolean("passed").notNull(),
  blockers: text("blockers").array().notNull().default([]),
  warnings: text("warnings").array().notNull().default([]),
  checks: jsonb("checks").$type<Record<string, boolean>>().notNull(),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("UX_screen_safety_validations_take_plan_id").on(t.takePlanId),
  index("IDX_screen_safety_validations_passed").on(t.passed),
]);

export type ScreenSafetyValidationRow = typeof screenSafetyValidations.$inferSelect;

/* --------------------------------------------------------------------- */
/* Zod schemas (insert + intent payloads)                                 */
/* --------------------------------------------------------------------- */
export const ScreenRoleSchema = z.enum([
  "world_map",
  "event_wall",
  "source_panel",
  "claims_panel",
  "timeline_panel",
  "lower_third",
  "ticker",
  "corner_anchor",
  "back_display",
  "side_screen",
]);
export type ScreenRole = z.infer<typeof ScreenRoleSchema>;

export const ScreenActionSchema = z.enum([
  "preview_source",
  "route_to_output",
  "fullscreen_take",
  "picture_in_picture_take",
  "split_screen_take",
  "zoom_in",
  "zoom_out",
  "crop",
  "pan",
  "take",
  "cut",
  "fade",
  "restore_default",
]);
export type ScreenAction = z.infer<typeof ScreenActionSchema>;

export const SensitivityClassSchema = z.enum([
  "normal",
  "sensitive",
  "disaster",
  "war",
  "crime",
  "medical",
  "children",
  "active_crisis",
]);
export type SensitivityClass = z.infer<typeof SensitivityClassSchema>;

export const RequestedBySchema = z.enum([
  "ai_anchor",
  "robot_explainer",
  "system_director",
]);

export const ProductionTierSchema = z.enum([
  "text_only",
  "voice_summary",
  "newsroom_read",
  "full_visual_package",
  "cinematic_4d_treatment",
]);
export type ProductionTier = z.infer<typeof ProductionTierSchema>;

export const FlowStateSchema = z.enum([
  "idle",
  "calm_read",
  "focused_explainer",
  "breaking_alert",
  "sensitive_story",
  "chat_reaction",
  "fallback_mode",
  "kill_switch",
]);
export type FlowState = z.infer<typeof FlowStateSchema>;

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

/** Director intent — what the anchor or robot wants the screens to do. */
export const ScreenIntentSchema = z.object({
  productionId: z.string().min(1),
  storyId: z.string().min(1),
  broadcastBriefId: z.string().nullable().optional(),
  screenDataId: z.string().nullable().optional(),
  visualPlanId: z.string().nullable().optional(),
  requestedBy: RequestedBySchema,
  currentScriptBeatId: z.string().nullable().optional(),
  sourceId: z.string().nullable().optional(),
  sourceLicenseStatus: z.enum(["licensed", "owned", "rights_unknown", "prohibited"]).default("rights_unknown"),
  sourceApprovalStatus: z.enum(["approved", "unapproved"]).default("unapproved"),
  sourceMatchesStory: z.boolean().default(false),
  sourceType: z.string().default("unknown"),
  hasWatermark: z.boolean().default(false),
  watermarkRemoved: z.boolean().default(false),
  logoStripped: z.boolean().default(false),
  containsPrivateAdminData: z.boolean().default(false),
  presetId: z.string().min(1),
  action: ScreenActionSchema,
  transition: z.enum(["cut", "fade"]).default("cut"),
  durationMs: z.number().int().nonnegative().default(0),
  cropRect: RectSchema.nullable().optional(),
  zoomRect: RectSchema.nullable().optional(),
  sensitivityClass: SensitivityClassSchema.default("normal"),
  anchorMode: z.string().default("solo_desk"),
  robotMode: z.string().default("calm"),
  fallbackSourceId: z.string().nullable().optional(),
  fallbackPresetId: z.string().min(1),
  restoreDefaultRouteId: z.string().min(1),
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
export type ScreenIntent = z.infer<typeof ScreenIntentSchema>;

export const ApexLoadInputSchema = z.object({
  storyId: z.string().min(1),
  articleId: z.number().int().nullable().optional(),
  sourceReliability: z.number().min(0).max(1),
  verificationConfidence: z.number().min(0).max(1),
  impactScore: z.number().min(0).max(100),
  freshnessScore: z.number().min(0).max(100),
  regionalImportance: z.number().min(0).max(100),
  publicInterest: z.number().min(0).max(100),
  visualPotential: z.number().min(0).max(100),
  rightsReadiness: z.number().min(0).max(100),
});
export type ApexLoadInput = z.infer<typeof ApexLoadInputSchema>;
