/**
 * Omni-Channel Audience Safety Layer — schemas (Spec Task #371).
 *
 * Replaces the YouTube-only chat safety layer. Models audience messages,
 * connectors, safety decisions, and moderation commands across YouTube,
 * Facebook, X, Telegram, Instagram, TikTok, LinkedIn, Reddit, and a
 * generic `custom` channel for future adapters.
 *
 * SAFETY:
 *   - Every record carries `approvalStatus:"draft"`,
 *     `visibility:"admin_only_internal"`, `realSendAllowed:false`,
 *     `executionEnabled:false`, locked `safetyEnvelope`.
 *   - Moderation commands additionally carry `platformSendAllowed:false`
 *     and run in `simulation_only` mode by default.
 *   - No platform API is actually called from this layer in this phase.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  real,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { SAFETY_ENVELOPE_LOCKED, type SafetyEnvelope } from "./neural-newsroom-schema";

/* --------------------------------------------------------------------- */
/* Locked moderation envelope (extends the newsroom envelope)            */
/* --------------------------------------------------------------------- */
export const AUDIENCE_SAFETY_ENVELOPE_LOCKED = {
  ...SAFETY_ENVELOPE_LOCKED,
  platformSendAllowed: false,
  noScraping: true,
  noRateLimitBypass: true,
  noUnauthorizedDM: true,
  noPiiOnScreens: true,
  noAbusiveSpeech: true,
} as const;

export type AudienceSafetyEnvelope = SafetyEnvelope;

/* --------------------------------------------------------------------- */
/* Enums                                                                  */
/* --------------------------------------------------------------------- */
export const AudiencePlatformSchema = z.enum([
  "youtube",
  "facebook",
  "x",
  "telegram",
  "instagram",
  "tiktok",
  "linkedin",
  "reddit",
  "custom",
]);
export type AudiencePlatform = z.infer<typeof AudiencePlatformSchema>;

export const ConnectionStatusSchema = z.enum([
  "disconnected",
  "connected",
  "limited_permissions",
  "expired",
  "error",
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const ApiAccessModeSchema = z.enum([
  "official_api",
  "webhook",
  "manual_import",
  "disabled",
]);
export type ApiAccessMode = z.infer<typeof ApiAccessModeSchema>;

export const MessageTypeSchema = z.enum([
  "live_chat",
  "comment",
  "reply",
  "mention",
  "gift",
  "superchat",
  "tip",
  "sticker",
  "poll_response",
  "moderator_note",
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const AudienceActionSchema = z.enum([
  "ignore",
  "hide",
  "delete_if_allowed",
  "timeout_if_allowed",
  "ban_if_allowed",
  "safe_highlight",
  "robot_acknowledge",
  "anchor_read",
  "moderator_review",
  "auto_reply_draft",
  "edit_own_reply_if_allowed",
]);
export type AudienceAction = z.infer<typeof AudienceActionSchema>;

export const RequestedModerationActionSchema = z.enum([
  "hide_comment",
  "delete_comment",
  "timeout_user",
  "ban_user",
  "reply",
  "pin",
  "edit_own_reply",
  "no_action",
]);
export type RequestedModerationAction = z.infer<typeof RequestedModerationActionSchema>;

export const ModerationRequestedBySchema = z.enum([
  "robot_anchor",
  "ai_moderator",
  "system_policy",
  "root_admin",
]);
export type ModerationRequestedBy = z.infer<typeof ModerationRequestedBySchema>;

export const CommandModeSchema = z.enum([
  "simulation_only",
  "assisted_operator",
  "future_platform_gateway",
]);
export type CommandMode = z.infer<typeof CommandModeSchema>;

/* --------------------------------------------------------------------- */
/* Permissions                                                            */
/* --------------------------------------------------------------------- */
export const AudiencePermissionsSchema = z.object({
  canReadComments: z.boolean().default(false),
  canReadLiveChat: z.boolean().default(false),
  canHideComment: z.boolean().default(false),
  canDeleteComment: z.boolean().default(false),
  canReply: z.boolean().default(false),
  canPin: z.boolean().default(false),
  canBanUser: z.boolean().default(false),
  canTimeoutUser: z.boolean().default(false),
  canEditOwnReply: z.boolean().default(false),
});
export type AudiencePermissions = z.infer<typeof AudiencePermissionsSchema>;

export const ZERO_PERMISSIONS: AudiencePermissions = {
  canReadComments: false,
  canReadLiveChat: false,
  canHideComment: false,
  canDeleteComment: false,
  canReply: false,
  canPin: false,
  canBanUser: false,
  canTimeoutUser: false,
  canEditOwnReply: false,
};

/* --------------------------------------------------------------------- */
/* AudienceChannelConnector                                               */
/* --------------------------------------------------------------------- */
export const SupportedLexiconLocaleSchema = z.enum([
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "zh",
  "ar",
]);
export type SupportedLexiconLocale = z.infer<typeof SupportedLexiconLocaleSchema>;

export const AudienceConnectorFeatureFlagsSchema = z.object({
  multilingualLexicons: z.array(SupportedLexiconLocaleSchema).default([]),
  aiModerationSecondOpinion: z.boolean().default(false),
});
export type AudienceConnectorFeatureFlags = z.infer<typeof AudienceConnectorFeatureFlagsSchema>;

export const DEFAULT_FEATURE_FLAGS: AudienceConnectorFeatureFlags = {
  multilingualLexicons: [],
  aiModerationSecondOpinion: false,
};

export const AudienceChannelConnectorSchema = z.object({
  connectorId: z.string().min(1),
  platform: AudiencePlatformSchema,
  accountId: z.string().min(1),
  displayName: z.string().min(1),
  connectionStatus: ConnectionStatusSchema,
  permissions: AudiencePermissionsSchema,
  apiAccessMode: ApiAccessModeSchema,
  lastSyncAt: z.string().nullable(),
  rateLimitStatus: z
    .object({
      remaining: z.number().int().nonnegative(),
      resetAtSec: z.number().int().nonnegative(),
    })
    .nullable(),
  featureFlags: AudienceConnectorFeatureFlagsSchema.default(DEFAULT_FEATURE_FLAGS),
  approvalStatus: z.literal("draft"),
  visibility: z.literal("admin_only_internal"),
  publicUrl: z.null(),
  signedUrl: z.null(),
  realSendAllowed: z.literal(false),
  executionEnabled: z.literal(false),
  /**
   * Per-connector root-admin opt-in required by the future platform gateway
   * (Task #374). Defaults to false. The gateway refuses to dispatch any
   * moderation action when this flag is false, even if the command is
   * `commandAllowed:true`.
   */
  platformSendApproved: z.boolean().default(false),
  /** Optional ID of the root admin who approved the platform send. */
  platformSendApprovedBy: z.string().nullable().default(null),
  /** ISO timestamp of the approval (or null). */
  platformSendApprovedAt: z.string().nullable().default(null),
  /**
   * Task #443: opt-in auto-pause metadata. When the gateway-block alert
   * service auto-flips `platformSendApproved` to false after a connector
   * crosses the block threshold for N consecutive windows, it records
   * the timestamp + reason here so the admin UI can surface an
   * "auto-paused" badge with a one-click re-enable.
   */
  autoPausedAt: z.string().nullable().default(null),
  autoPausedReason: z.string().nullable().default(null),
  safetyEnvelope: z.record(z.boolean()),
});
export type AudienceChannelConnector = z.infer<typeof AudienceChannelConnectorSchema>;

/* --------------------------------------------------------------------- */
/* AudienceMessage                                                        */
/* --------------------------------------------------------------------- */
export const AudienceMessageIngestSchema = z.object({
  connectorId: z.string().min(1),
  platform: AudiencePlatformSchema,
  externalMessageId: z.string().min(1),
  externalAuthorId: z.string().min(1),
  authorDisplayName: z.string().nullable().optional(),
  messageText: z.string(),
  messageType: MessageTypeSchema,
  receivedAt: z.string().optional(),
  storyId: z.string().nullable().optional(),
  productionId: z.string().nullable().optional(),
  broadcastBriefId: z.string().nullable().optional(),
  giftValue: z.number().nonnegative().nullable().optional(),
  rawMetadata: z.record(z.unknown()).optional(),
});
export type AudienceMessageIngest = z.infer<typeof AudienceMessageIngestSchema>;

export interface AudienceMessage {
  messageId: string;
  connectorId: string;
  platform: AudiencePlatform;
  externalMessageId: string;
  externalAuthorIdHash: string;
  authorDisplayNameSafe: string | null;
  messageText: string;
  messageType: MessageType;
  receivedAt: string;
  storyId: string | null;
  productionId: string | null;
  broadcastBriefId: string | null;
  giftValue: number | null;
  rawMetadataRedacted: Record<string, unknown>;
  approvalStatus: "draft";
  visibility: "admin_only_internal";
  publicUrl: null;
  signedUrl: null;
  realSendAllowed: false;
  executionEnabled: false;
  safetyEnvelope: AudienceSafetyEnvelope;
}

/* --------------------------------------------------------------------- */
/* AudienceSafetyDecision                                                 */
/* --------------------------------------------------------------------- */
export interface AudienceSafetyScores {
  toxicityScore: number;
  spamScore: number;
  abuseScore: number;
  hateScore: number;
  sexualContentRisk: number;
  violenceRisk: number;
  selfHarmRisk: number;
  misinformationRisk: number;
  piiRisk: number;
  copyrightRisk: number;
  impersonationRisk: number;
  botRisk: number;
  relevanceScore: number;
}

export interface AudienceSafetyDecision {
  decisionId: string;
  messageId: string;
  platform: AudiencePlatform;
  action: AudienceAction;
  reasonCodes: string[];
  scores: AudienceSafetyScores;
  giftValue: number | null;
  allowedForRobotSpeech: boolean;
  allowedForAnchorSpeech: boolean;
  allowedForScreenDisplay: boolean;
  allowedForAutoReply: boolean;
  allowedForModerationAction: boolean;
  requiresHumanReview: boolean;
  sensitivityOverride: boolean;
  /** The MIN-style audience-safety contribution to the confidence vector. */
  cAudienceSafety: number;
  approvalStatus: "draft";
  visibility: "admin_only_internal";
  realSendAllowed: false;
  executionEnabled: false;
  notPublished: true;
  safetyEnvelope: AudienceSafetyEnvelope;
}

/* --------------------------------------------------------------------- */
/* AudienceModerationCommand                                              */
/* --------------------------------------------------------------------- */
export interface AudienceModerationCommand {
  commandId: string;
  decisionId: string;
  platform: AudiencePlatform;
  connectorId: string;
  externalMessageId: string;
  requestedAction: RequestedModerationAction;
  requestedBy: ModerationRequestedBy;
  commandMode: CommandMode;
  commandAllowed: boolean;
  blockerReason: string | null;
  requiresHumanApproval: boolean;
  approvalStatus: "draft";
  visibility: "admin_only_internal";
  realSendAllowed: false;
  executionEnabled: false;
  platformSendAllowed: false;
  /**
   * Tamper-evident snapshot of the decision at command-build time. The
   * future platform gateway (Task #374) refuses to dispatch when the
   * decision's current fingerprint differs from this one.
   */
  decisionFingerprint: string;
  safetyEnvelope: AudienceSafetyEnvelope;
}

/* --------------------------------------------------------------------- */
/* Story-context (used by evaluators)                                    */
/* --------------------------------------------------------------------- */
export const StorySensitivitySchema = z.enum([
  "normal",
  "sensitive",
  "disaster",
  "war",
  "crime",
  "medical",
  "children",
  "active_crisis",
]);
export type StorySensitivity = z.infer<typeof StorySensitivitySchema>;

export const StoryContextSchema = z.object({
  storyId: z.string().min(1),
  sensitivityClass: StorySensitivitySchema.default("normal"),
  verifiedClaims: z.array(z.string()).default([]),
});
export type StoryContext = z.infer<typeof StoryContextSchema>;

/* --------------------------------------------------------------------- */
/* Drizzle persistence tables (Task #373)                                 */
/*   The Omni-Channel Audience Safety Layer used to hold every connector,*/
/*   message, decision and command in-memory. These tables back the same */
/*   four record types so the service survives restarts and provides a   */
/*   permanent compliance audit trail. DDL is also applied directly via  */
/*   scripts/migrate-omni-channel-audience.ts against SUPABASE_DB_URL.   */
/* --------------------------------------------------------------------- */
export const audienceChannelConnectors = pgTable("audience_channel_connectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectorId: text("connector_id").notNull().unique(),
  platform: text("platform").notNull(),
  accountId: text("account_id").notNull(),
  displayName: text("display_name").notNull(),
  connectionStatus: text("connection_status").notNull(),
  permissions: jsonb("permissions").$type<AudiencePermissions>().notNull(),
  apiAccessMode: text("api_access_mode").notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  rateLimitStatus: jsonb("rate_limit_status").$type<{ remaining: number; resetAtSec: number } | null>(),
  approvalStatus: text("approval_status").notNull().default("draft"),
  visibility: text("visibility").notNull().default("admin_only_internal"),
  realSendAllowed: boolean("real_send_allowed").notNull().default(false),
  executionEnabled: boolean("execution_enabled").notNull().default(false),
  // Task #374: per-connector root-admin opt-in for the platform gateway.
  platformSendApproved: boolean("platform_send_approved").notNull().default(false),
  platformSendApprovedBy: text("platform_send_approved_by"),
  platformSendApprovedAt: timestamp("platform_send_approved_at"),
  // Task #443: auto-pause metadata recorded by the gateway-block alert
  // service when a connector crosses the block threshold for N
  // consecutive windows. Surfaced as an "auto-paused" badge in the UI.
  autoPausedAt: timestamp("auto_paused_at"),
  autoPausedReason: text("auto_paused_reason"),
  safetyEnvelope: jsonb("safety_envelope").$type<AudienceSafetyEnvelope>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type AudienceChannelConnectorRow = typeof audienceChannelConnectors.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceConnectorSecret (Task #380)                                    */
/*                                                                       */
/*   Per-connector encrypted platform access token used by the audience  */
/*   platform gateway when `AUDIENCE_GATEWAY_LIVE_DISPATCH=true`. Stored */
/*   AES-256-GCM with a key derived from `AUDIENCE_GATEWAY_SECRETS_KEY`. */
/*   Raw token values NEVER appear on the connector row, in API         */
/*   responses, on the bus, or in audit logs — only encrypted bytes +    */
/*   rotation metadata are persisted.                                    */
/* --------------------------------------------------------------------- */
export const audienceConnectorSecrets = pgTable("audience_connector_secrets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectorId: text("connector_id").notNull().unique(),
  platform: text("platform").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  rotationCount: integer("rotation_count").notNull().default(1),
  lastRotatedBy: text("last_rotated_by"),
  lastRotatedAt: timestamp("last_rotated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type AudienceConnectorSecretRow = typeof audienceConnectorSecrets.$inferSelect;

export interface AudienceConnectorSecretMetadata {
  connectorId: string;
  platform: AudiencePlatform;
  keyVersion: number;
  rotationCount: number;
  lastRotatedBy: string | null;
  lastRotatedAt: string;
  createdAt: string;
}

/* --------------------------------------------------------------------- */
/* AudienceConnectorSecretRotation (Task #463)                            */
/*                                                                       */
/*   Append-only audit log of every per-connector platform-token         */
/*   rotation. Captures who rotated, when, the resulting rotation        */
/*   count + key version, and the action (`set` for the very first       */
/*   install, `rotate` thereafter, `delete` when the secret is removed). */
/*   Surfaces in the connector detail view so admins can confirm a       */
/*   compromise-response rotation actually landed.                       */
/*                                                                       */
/*   NEVER stores the plaintext token or any derivative of it.           */
/* --------------------------------------------------------------------- */
export const audienceConnectorSecretRotations = pgTable(
  "audience_connector_secret_rotations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    connectorId: text("connector_id").notNull(),
    platform: text("platform").notNull(),
    action: text("action").notNull(),
    rotatedBy: text("rotated_by"),
    rotatedAt: timestamp("rotated_at").notNull().defaultNow(),
    rotationCount: integer("rotation_count").notNull().default(0),
    keyVersion: integer("key_version").notNull().default(1),
  },
  (t) => [
    index("IDX_audience_connector_secret_rotations_connector_id").on(t.connectorId),
    index("IDX_audience_connector_secret_rotations_rotated_at").on(t.rotatedAt),
  ],
);
export type AudienceConnectorSecretRotationRow =
  typeof audienceConnectorSecretRotations.$inferSelect;

export type AudienceConnectorSecretRotationAction = "set" | "rotate" | "delete";

export interface AudienceConnectorSecretRotationEntry {
  id: string;
  connectorId: string;
  platform: AudiencePlatform;
  action: AudienceConnectorSecretRotationAction;
  rotatedBy: string | null;
  rotatedAt: string;
  rotationCount: number;
  keyVersion: number;
}

export const audienceMessages = pgTable("audience_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: text("message_id").notNull().unique(),
  connectorId: text("connector_id").notNull(),
  platform: text("platform").notNull(),
  externalMessageId: text("external_message_id").notNull(),
  externalAuthorIdHash: text("external_author_id_hash").notNull(),
  authorDisplayNameSafe: text("author_display_name_safe"),
  messageText: text("message_text").notNull(),
  messageType: text("message_type").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  storyId: text("story_id"),
  productionId: text("production_id"),
  broadcastBriefId: text("broadcast_brief_id"),
  giftValue: real("gift_value"),
  rawMetadataRedacted: jsonb("raw_metadata_redacted").$type<Record<string, unknown>>().notNull(),
  approvalStatus: text("approval_status").notNull().default("draft"),
  visibility: text("visibility").notNull().default("admin_only_internal"),
  realSendAllowed: boolean("real_send_allowed").notNull().default(false),
  executionEnabled: boolean("execution_enabled").notNull().default(false),
  safetyEnvelope: jsonb("safety_envelope").$type<AudienceSafetyEnvelope>().notNull(),
}, (t) => [
  index("IDX_audience_messages_production_id").on(t.productionId),
  index("IDX_audience_messages_platform").on(t.platform),
]);
export type AudienceMessageRow = typeof audienceMessages.$inferSelect;

export const audienceSafetyDecisions = pgTable("audience_safety_decisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  decisionId: text("decision_id").notNull().unique(),
  messageId: text("message_id").notNull(),
  platform: text("platform").notNull(),
  action: text("action").notNull(),
  reasonCodes: text("reason_codes").array().notNull().default(sql`'{}'::text[]`),
  scores: jsonb("scores").$type<AudienceSafetyScores>().notNull(),
  giftValue: real("gift_value"),
  allowedForRobotSpeech: boolean("allowed_for_robot_speech").notNull(),
  allowedForAnchorSpeech: boolean("allowed_for_anchor_speech").notNull(),
  allowedForScreenDisplay: boolean("allowed_for_screen_display").notNull(),
  allowedForAutoReply: boolean("allowed_for_auto_reply").notNull(),
  allowedForModerationAction: boolean("allowed_for_moderation_action").notNull(),
  requiresHumanReview: boolean("requires_human_review").notNull(),
  sensitivityOverride: boolean("sensitivity_override").notNull(),
  cAudienceSafety: real("c_audience_safety").notNull(),
  approvalStatus: text("approval_status").notNull().default("draft"),
  visibility: text("visibility").notNull().default("admin_only_internal"),
  realSendAllowed: boolean("real_send_allowed").notNull().default(false),
  executionEnabled: boolean("execution_enabled").notNull().default(false),
  notPublished: boolean("not_published").notNull().default(true),
  safetyEnvelope: jsonb("safety_envelope").$type<AudienceSafetyEnvelope>().notNull(),
  decidedAt: timestamp("decided_at").notNull().defaultNow(),
}, (t) => [
  index("IDX_audience_decisions_message_id").on(t.messageId),
]);
export type AudienceSafetyDecisionRow = typeof audienceSafetyDecisions.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceAuditExportLog (Task #386)                                     */
/*   Meta-audit: every call to GET /api/admin/newsroom/audience/export    */
/*   inserts one row recording WHO pulled the audit trail, WHAT filters   */
/*   they used, HOW MANY rows landed in each section, the format, and    */
/*   WHEN. Logged even when the export returns zero rows so that leaks    */
/*   of an export are always traceable back to an actor + timestamp.     */
/* --------------------------------------------------------------------- */
export const audienceAuditExports = pgTable("audience_audit_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exportId: text("export_id").notNull().unique(),
  actorId: text("actor_id").notNull(),
  actorType: text("actor_type").notNull(),
  actorRole: text("actor_role"),
  format: text("format").notNull(),
  filters: jsonb("filters").$type<{
    fromDate: string | null;
    toDate: string | null;
    platform: string | null;
    productionId: string | null;
    actorId?: string | null;
  }>().notNull(),
  connectorCount: real("connector_count").notNull().default(0),
  messageCount: real("message_count").notNull().default(0),
  decisionCount: real("decision_count").notNull().default(0),
  commandCount: real("command_count").notNull().default(0),
  totalRowCount: real("total_row_count").notNull().default(0),
  // Task #426: auto-detected risk signals (e.g. `full_trail`,
  // `no_date_window`, `wide_date_window`, `first_export_by_actor`,
  // `new_production_for_actor`, `format_change`). Empty array means the
  // export looked routine. Persisted so the admin UI and the export log
  // can surface them after the fact.
  riskSignals: text("risk_signals").array().notNull().default(sql`'{}'::text[]`),
  // Task #428 — rolling outlier detection. Computed at insert time from
  // the prior N exports so an "Outlier" badge can render in the admin UI
  // without recomputing per request, and an alert event can fire on
  // suspicious pulls.
  isOutlier: boolean("is_outlier").notNull().default(false),
  rollingMedian: real("rolling_median").notNull().default(0),
  rollingP95: real("rolling_p95").notNull().default(0),
  outlierThreshold: real("outlier_threshold").notNull().default(0),
  outlierSampleSize: integer("outlier_sample_size").notNull().default(0),
  exportedAt: timestamp("exported_at").notNull().defaultNow(),
}, (t) => [
  index("IDX_audience_audit_exports_exported_at").on(t.exportedAt),
  index("IDX_audience_audit_exports_actor_id").on(t.actorId),
]);
export type AudienceAuditExportRow = typeof audienceAuditExports.$inferSelect;

/**
 * Task #426: deterministic risk signals computed on every audit-trail
 * export. Surfaced in the notifier email subject + body and persisted on
 * the audit row so the admin UI can flag suspicious pulls after the fact.
 *
 *   - `full_trail`                — no filters at all (no dates, no
 *                                   platform, no productionId): a
 *                                   "give me everything" pull.
 *   - `no_date_window`            — neither fromDate nor toDate set.
 *   - `wide_date_window`          — explicit window wider than 90 days.
 *   - `first_export_by_actor`     — actor has never exported before.
 *   - `new_production_for_actor`  — actor exporting a productionId they
 *                                   have not exported before.
 *   - `format_change`             — actor used a different format than
 *                                   their most recent prior export.
 */
export const AudienceAuditExportRiskSignalSchema = z.enum([
  "full_trail",
  "no_date_window",
  "wide_date_window",
  "first_export_by_actor",
  "new_production_for_actor",
  "format_change",
]);
export type AudienceAuditExportRiskSignal = z.infer<typeof AudienceAuditExportRiskSignalSchema>;

/**
 * Task #428: rolling outlier stats computed for each audit-trail export
 * against the prior N exports.
 */
export interface AudienceAuditExportOutlierStats {
  isOutlier: boolean;
  rollingMedian: number;
  rollingP95: number;
  threshold: number;
  sampleSize: number;
  multiplier: number;
}

export interface AudienceAuditExportRecord {
  exportId: string;
  actorId: string;
  actorType: string;
  actorRole: string | null;
  format: "json" | "csv" | "json-history" | "csv-history";
  filters: {
    fromDate: string | null;
    toDate: string | null;
    platform: AudiencePlatform | null;
    productionId: string | null;
    actorId?: string | null;
  };
  rowCounts: {
    connectors: number;
    messages: number;
    decisions: number;
    commands: number;
    total: number;
  };
  /** Task #426: auto-detected risk signals — empty array means routine. */
  riskSignals: AudienceAuditExportRiskSignal[];
  exportedAt: string;
  outlier: AudienceAuditExportOutlierStats;
}

/* --------------------------------------------------------------------- */
/* AudienceAuditExportNotifications (Task #448)                           */
/*   Persistent history of every audit-export email notification         */
/*   outcome. Task #424 kept this in an in-memory ring buffer that       */
/*   was wiped on every restart, making post-incident forensics          */
/*   ("did the founder get pinged when X exported the audit trail       */
/*   last Tuesday?") impossible. This table makes the history durable;   */
/*   the audience retention sweeper prunes rows older than the audit    */
/*   retention window on the same daily cadence.                        */
/* --------------------------------------------------------------------- */
export const audienceAuditExportNotifications = pgTable(
  "audience_audit_export_notifications",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    notificationId: text("notification_id").notNull().unique(),
    exportId: text("export_id").notNull(),
    actorId: text("actor_id").notNull(),
    actorType: text("actor_type").notNull(),
    actorRole: text("actor_role"),
    format: text("format").notNull(),
    totalRowCount: integer("total_row_count").notNull().default(0),
    thresholdRowCount: integer("threshold_row_count").notNull().default(0),
    thresholdExceeded: boolean("threshold_exceeded").notNull().default(false),
    recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
    notified: boolean("notified").notNull().default(false),
    reason: text("reason").notNull(),
    isTest: boolean("is_test").notNull().default(false),
    errorMessage: text("error_message"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("IDX_audience_audit_export_notifications_occurred_at").on(t.occurredAt),
    index("IDX_audience_audit_export_notifications_actor_id").on(t.actorId),
  ],
);
export type AudienceAuditExportNotificationRow =
  typeof audienceAuditExportNotifications.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceAuditExportNotifierConfigHistory (Task #728)                   */
/*   Persistent history of every change to the audit-export notifier      */
/*   suppression/dedup configuration. The live config in                  */
/*   `system_settings` only carries the CURRENT shape, so once a          */
/*   founder edits suppressedActorIds / dedupWindowMs / enabled /         */
/*   recipients / minRowCount there is no record of who muted what when. */
/*   This append-only table closes that audit gap. Sanitized — no        */
/*   secrets, tokens, or email bodies are ever written. Pruned by the    */
/*   audience retention sweeper on the same audit-window cadence as     */
/*   the other history tables (Task #562 pattern).                       */
/* --------------------------------------------------------------------- */
export const audienceAuditExportNotifierConfigHistory = pgTable(
  "audience_audit_export_notifier_config_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    updatedBy: text("updated_by"),
    action: text("action").notNull(), // 'updated' | 'cleared' | 'restored_default'
    previousConfig: jsonb("previous_config"),
    newConfig: jsonb("new_config"),
    changedFields: text("changed_fields").array().notNull().default(sql`'{}'::text[]`),
    dedupKey: text("dedup_key").unique(),
  },
  (t) => [
    index("IDX_audience_audit_export_notifier_config_history_occurred_at").on(
      t.occurredAt,
    ),
  ],
);
export type AudienceAuditExportNotifierConfigHistoryRow =
  typeof audienceAuditExportNotifierConfigHistory.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceArchiveNotifierSnoozeLog (Task #562)                           */
/*   Persistent history of every Archive Deletion Alerts snooze window.  */
/*   The "N alerts suppressed while snoozed" pill on the dashboard only  */
/*   reflects the CURRENT window and is wiped the moment the snooze is   */
/*   replaced or ends. This table snapshots the suppressed counters at   */
/*   the moment the window ends ("expired" naturally, "replaced" by a    */
/*   new snooze, "unsnoozed" / "cleared" by the founder) so reviewers    */
/*   can ask "how much did our last maintenance-window snooze actually   */
/*   swallow?" weeks later. Read-only with respect to the live snooze   */
/*   behavior — never gates whether an email sends. Pruned by the       */
/*   audience retention sweeper on the same daily cadence as the other  */
/*   audit-history tables.                                              */
/* --------------------------------------------------------------------- */
export const audienceArchiveNotifierSnoozeLog = pgTable(
  "audience_archive_notifier_snooze_log",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    snoozeId: text("snooze_id").notNull().unique(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    endedReason: text("ended_reason"),
    source: text("source").notNull(),
    policyKind: text("policy_kind").notNull(),
    policyExtendDays: integer("policy_extend_days"),
    policyDays: integer("policy_days").array(),
    policyStartHour: integer("policy_start_hour"),
    policyEndHour: integer("policy_end_hour"),
    snoozeUntil: timestamp("snooze_until"),
    createdBy: text("created_by"),
    suppressedCount: integer("suppressed_count").notNull().default(0),
    suppressedFiles: integer("suppressed_files").notNull().default(0),
    suppressedBytes: integer("suppressed_bytes").notNull().default(0),
  },
  (t) => [
    index("IDX_audience_archive_notifier_snooze_log_started_at").on(t.startedAt),
    index("IDX_audience_archive_notifier_snooze_log_ended_at").on(t.endedAt),
  ],
);
export type AudienceArchiveNotifierSnoozeLogRow =
  typeof audienceArchiveNotifierSnoozeLog.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceAuditEmailFailureAlertSnoozes (Task #613)                      */
/*   Persistent history of every snooze action on the two audit-email    */
/*   failure alerts (trail email + history email, Task #560). The live   */
/*   snooze config in `system_settings` only carries the CURRENT window, */
/*   so once a snooze is replaced or cleared there is no record of who   */
/*   muted which alert when. This append-only table makes that audit     */
/*   trail durable: one row per action. Lazily filled with `expired`     */
/*   rows the first time `isAuditEmailFailureAlertSnoozed` observes a    */
/*   passed snoozeUntil so natural expiry is captured too. Pruned by    */
/*   the audience retention sweeper on the same audit-window cadence    */
/*   as the other history tables (Task #562 pattern).                   */
/* --------------------------------------------------------------------- */
export const audienceAuditEmailFailureAlertSnoozes = pgTable(
  "audience_audit_email_failure_alert_snoozes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    alertKey: text("alert_key").notNull(),
    action: text("action").notNull(), // 'set' | 'cleared' | 'expired'
    snoozeUntil: timestamp("snooze_until"),
    updatedBy: text("updated_by"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    dedupKey: text("dedup_key").unique(),
  },
  (t) => [
    index("IDX_audience_audit_email_failure_alert_snoozes_occurred_at").on(
      t.occurredAt,
    ),
    index("IDX_audience_audit_email_failure_alert_snoozes_alert_key").on(
      t.alertKey,
    ),
  ],
);
export type AudienceAuditEmailFailureAlertSnoozeRow =
  typeof audienceAuditEmailFailureAlertSnoozes.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceAuditHistoryEmailStaleSnoozeLog (Task #692)                    */
/*   Persistent history of every snooze window on the audit-export        */
/*   history email staleness alert (`audience_audit_history_email_stale`, */
/*   Task #524). Task #570 added snooze; Task #626 added the post-window  */
/*   recap email but the founder still only sees the most recent recap    */
/*   in their inbox. This table snapshots the suppressed counters and    */
/*   policy snapshot at the moment each window CLOSES (expired, replaced */
/*   by a new snooze, or explicitly unsnoozed) so reviewers can audit    */
/*   "what happened the last N times we silenced the scheduler alert?"  */
/*   weeks later. Mirrors `audience_archive_notifier_snooze_log` (Task   */
/*   #562). Read-only with respect to live snooze behavior. Pruned by    */
/*   the audience retention sweeper on the same daily audit-window      */
/*   cadence; closed rows only — open windows are never pruned.         */
/* --------------------------------------------------------------------- */
export const audienceAuditHistoryEmailStaleSnoozeLog = pgTable(
  "audience_audit_history_email_stale_snooze_log",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    snoozeId: text("snooze_id").notNull().unique(),
    snoozeStartedAt: timestamp("snooze_started_at").notNull().defaultNow(),
    snoozeUntil: timestamp("snooze_until"),
    endedAt: timestamp("ended_at"),
    endedReason: text("ended_reason"),
    policyKind: text("policy_kind").notNull(),
    policyExtendDays: integer("policy_extend_days"),
    policyDays: integer("policy_days").array(),
    policyStartHour: integer("policy_start_hour"),
    policyEndHour: integer("policy_end_hour"),
    createdBy: text("created_by"),
    suppressedTicks: integer("suppressed_ticks").notNull().default(0),
    maxAgeMsObserved: integer("max_age_ms_observed"),
    lastSuccessfulRunAtAtClose: timestamp("last_successful_run_at_at_close"),
  },
  (t) => [
    index("IDX_audience_audit_history_email_stale_snooze_log_started_at").on(
      t.snoozeStartedAt,
    ),
    index("IDX_audience_audit_history_email_stale_snooze_log_ended_at").on(
      t.endedAt,
    ),
  ],
);
export type AudienceAuditHistoryEmailStaleSnoozeLogRow =
  typeof audienceAuditHistoryEmailStaleSnoozeLog.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceConnectorRotationNotifications (Task #545)                     */
/*   Persistent history of every connector token rotation notifier send.  */
/*   Task #496 introduced the notifier with a 50-entry in-memory ring     */
/*   buffer that was wiped on every restart, making it impossible to      */
/*   prove after the fact when a compromise rotation happened and who    */
/*   was notified. This table makes the history durable; the audience    */
/*   retention sweeper prunes rows older than the audit retention        */
/*   window on the same daily cadence so it can't grow forever.         */
/*                                                                       */
/*   NEVER stores the plaintext token (mirrors the source bus event     */
/*   contract; only the connector id, platform, action, rotator id,     */
/*   rotation count and key version are persisted in `event`).          */
/* --------------------------------------------------------------------- */
export const audienceConnectorRotationNotifications = pgTable(
  "audience_connector_rotation_notifications",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    notificationId: text("notification_id").notNull().unique(),
    connectorId: text("connector_id").notNull(),
    platform: text("platform").notNull(),
    action: text("action").notNull(),
    rotatedBy: text("rotated_by"),
    rotationCount: integer("rotation_count").notNull().default(0),
    keyVersion: integer("key_version").notNull().default(1),
    event: jsonb("event").$type<Record<string, unknown>>().notNull(),
    recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
    notified: boolean("notified").notNull().default(false),
    reason: text("reason").notNull(),
    isTest: boolean("is_test").notNull().default(false),
    errorMessage: text("error_message"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("IDX_audience_connector_rotation_notifications_occurred_at").on(t.occurredAt),
    index("IDX_audience_connector_rotation_notifications_connector_id").on(t.connectorId),
  ],
);
export type AudienceConnectorRotationNotificationRow =
  typeof audienceConnectorRotationNotifications.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceConnectorRotationDedupState (Task #589)                       */
/*   Persistent per-connector dedup state for the rotation notifier.     */
/*   Was previously a process-local Map, which meant every server        */
/*   restart re-opened a closed dedup window — a connector that was      */
/*   being deduplicated would immediately fire a "first" email again     */
/*   on the next boot. One row per connectorId: last sent timestamp,    */
/*   the action that fired it, and the running suppressed-burst counter. */
/* --------------------------------------------------------------------- */
export const audienceConnectorRotationDedupState = pgTable(
  "audience_connector_rotation_dedup_state",
  {
    connectorId: text("connector_id").primaryKey(),
    lastSentAt: timestamp("last_sent_at").notNull(),
    lastAction: text("last_action").notNull(),
    suppressedCount: integer("suppressed_count").notNull().default(0),
    suppressedSince: timestamp("suppressed_since"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);
export type AudienceConnectorRotationDedupStateRow =
  typeof audienceConnectorRotationDedupState.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceLegacyTokenDispatchAlerts (Task #549)                          */
/*   Persistent history of every legacy-token dispatch alert decision.    */
/*   Task #500 added the in-memory dedup map but kept no record once the  */
/*   process restarted, so founders couldn't see which connectors had     */
/*   triggered the alert recently. This table mirrors the audit-export   */
/*   notification history pattern: one row per decision (sent /          */
/*   deduplicated / send_failed / disabled / no_recipients /              */
/*   not_legacy_fallback / not_official_api / not_approved /              */
/*   missing_connector), pruned by the audience retention sweeper on    */
/*   the audit-window cadence.                                           */
/* --------------------------------------------------------------------- */
export const audienceLegacyTokenDispatchAlerts = pgTable(
  "audience_legacy_token_dispatch_alerts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    alertId: text("alert_id").notNull().unique(),
    connectorId: text("connector_id"),
    connectorDisplayName: text("connector_display_name"),
    platform: text("platform"),
    commandId: text("command_id"),
    requestedAction: text("requested_action"),
    apiAccessMode: text("api_access_mode"),
    tokenSource: text("token_source"),
    platformSendApproved: boolean("platform_send_approved").notNull().default(false),
    recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
    notified: boolean("notified").notNull().default(false),
    reason: text("reason").notNull(),
    dedupWindowMs: integer("dedup_window_ms").notNull().default(0),
    errorMessage: text("error_message"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("IDX_audience_legacy_token_dispatch_alerts_occurred_at").on(t.occurredAt),
    index("IDX_audience_legacy_token_dispatch_alerts_connector_id").on(t.connectorId),
  ],
);
export type AudienceLegacyTokenDispatchAlertRow =
  typeof audienceLegacyTokenDispatchAlerts.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceStaleRowsThresholdHistory (Task #556)                          */
/*   Append-only audit trail of every save / clear of the stale-pending- */
/*   archive alert thresholds. The Retention Mode card lets founders     */
/*   set per-table + default overrides; we record both the prior and the */
/*   new override JSON so admins can scroll through past changes and     */
/*   answer "who lowered the messages threshold to 250 last Tuesday?".   */
/*   Pruned by the daily retention sweep on the audit-window cadence so  */
/*   the table cannot grow without bound (mirrors                        */
/*   `pruneAuditExportNotificationsOlderThan`).                          */
/* --------------------------------------------------------------------- */
export const audienceStaleRowsThresholdHistory = pgTable(
  "audience_stale_rows_threshold_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    priorOverride: jsonb("prior_override"),
    newOverride: jsonb("new_override"),
    updatedBy: text("updated_by"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("IDX_audience_stale_rows_threshold_history_occurred_at").on(
      t.occurredAt,
    ),
  ],
);
export type AudienceStaleRowsThresholdHistoryRow =
  typeof audienceStaleRowsThresholdHistory.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceRestoreLogRateThresholdHistory (Task #571)                     */
/*   Append-only audit trail of every save/clear of the restore-log     */
/*   per-day rate spike threshold. Task #529 lets founders change the   */
/*   threshold from the dashboard but only the current effective value  */
/*   was shown; this table makes it easy to answer "who disabled or     */
/*   loosened the rate alert last Tuesday?". Pruned by the daily        */
/*   retention sweep on the audit-window cadence so the table cannot    */
/*   grow without bound (mirrors                                        */
/*   `audience_stale_rows_threshold_history`).                          */
/* --------------------------------------------------------------------- */
export const audienceRestoreLogRateThresholdHistory = pgTable(
  "audience_restore_log_rate_threshold_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    priorOverride: integer("prior_override"),
    newOverride: integer("new_override"),
    updatedBy: text("updated_by"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("IDX_audience_restore_log_rate_threshold_history_occurred_at").on(
      t.occurredAt,
    ),
  ],
);
export type AudienceRestoreLogRateThresholdHistoryRow =
  typeof audienceRestoreLogRateThresholdHistory.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceRestoreLogRateWeakeningNotifications (Task #677)              */
/*   Persistent history of every weakening-email attempt fired from      */
/*   `maybeNotifyWeakening`. Today the email is fire-and-forget — if    */
/*   Resend silently swallows it or a founder misses it, there is no    */
/*   in-dashboard trail proving the notification was attempted. This    */
/*   table makes the history durable; one row per attempted send,       */
/*   recording recipients, prior/new effective threshold, prior/new     */
/*   override, actor, reason, sent flag and any error message. Pruned   */
/*   by the daily retention sweeper on the same audit-window cadence    */
/*   (mirrors `audience_audit_export_notifications` from Task #448).    */
/* --------------------------------------------------------------------- */
export const audienceRestoreLogRateWeakeningNotifications = pgTable(
  "audience_restore_log_rate_weakening_notifications",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    notificationId: text("notification_id").notNull().unique(),
    actor: text("actor").notNull(),
    reason: text("reason").notNull(),
    priorEffective: integer("prior_effective").notNull(),
    newEffective: integer("new_effective").notNull(),
    priorOverride: integer("prior_override"),
    newOverride: integer("new_override"),
    recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
    sent: boolean("sent").notNull().default(false),
    errorMessage: text("error_message"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index(
      "IDX_audience_restore_log_rate_weakening_notifications_occurred_at",
    ).on(t.occurredAt),
  ],
);
export type AudienceRestoreLogRateWeakeningNotificationRow =
  typeof audienceRestoreLogRateWeakeningNotifications.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceRestoreLog (Task #415)                                         */
/*   Persistent audit trail of every restore-from-archive attempt.        */
/*   Task #407 originally kept this in process memory; a restart wiped    */
/*   the record of who restored which archive and how many rows came     */
/*   back. This table makes that history durable.                        */
/* --------------------------------------------------------------------- */
export const audienceRestoreLog = pgTable("audience_restore_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restoredAt: timestamp("restored_at").notNull().defaultNow(),
  archivePath: text("archive_path").notNull(),
  tableName: text("table_name").notNull(),
  restoredBy: text("restored_by").notNull(),
  rowsParsed: integer("rows_parsed").notNull().default(0),
  rowsInserted: integer("rows_inserted").notNull().default(0),
  rowsSkipped: integer("rows_skipped").notNull().default(0),
  error: text("error"),
}, (t) => [
  index("IDX_audience_restore_log_restored_at").on(t.restoredAt),
]);
export type AudienceRestoreLogRow = typeof audienceRestoreLog.$inferSelect;

export const audienceModerationCommands = pgTable("audience_moderation_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commandId: text("command_id").notNull().unique(),
  decisionId: text("decision_id").notNull(),
  platform: text("platform").notNull(),
  connectorId: text("connector_id").notNull(),
  externalMessageId: text("external_message_id").notNull(),
  requestedAction: text("requested_action").notNull(),
  requestedBy: text("requested_by").notNull(),
  commandMode: text("command_mode").notNull().default("simulation_only"),
  commandAllowed: boolean("command_allowed").notNull(),
  blockerReason: text("blocker_reason"),
  requiresHumanApproval: boolean("requires_human_approval").notNull(),
  approvalStatus: text("approval_status").notNull().default("draft"),
  visibility: text("visibility").notNull().default("admin_only_internal"),
  realSendAllowed: boolean("real_send_allowed").notNull().default(false),
  executionEnabled: boolean("execution_enabled").notNull().default(false),
  platformSendAllowed: boolean("platform_send_allowed").notNull().default(false),
  // Task #374: tamper-evident snapshot of the decision at command-build time.
  decisionFingerprint: text("decision_fingerprint").notNull().default(""),
  safetyEnvelope: jsonb("safety_envelope").$type<AudienceSafetyEnvelope>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("IDX_audience_commands_decision_id").on(t.decisionId),
]);
export type AudienceModerationCommandRow = typeof audienceModerationCommands.$inferSelect;

/* --------------------------------------------------------------------- */
/* Scheduled compliance email export (Task #385)                          */
/*   Lets root-admin configure a recurring (weekly / monthly) email of    */
/*   the audience-moderation audit trail to a fixed compliance / legal    */
/*   recipient list. JSON + CSV are attached via Resend. Recipients are   */
/*   editable only from the root-admin admin dashboard; the locked        */
/*   audience safety envelope still applies — no platform API is called   */
/*   by the scheduler, it only re-uses `exportAuditTrail`.                */
/* --------------------------------------------------------------------- */
/* --------------------------------------------------------------------- */
/* AudienceGatewayEvent (Task #421)                                       */
/*   Permanent log of every gated moderation send emitted on the neural  */
/*   newsroom bus (audience.gateway_send_simulated / _dispatched /       */
/*   _blocked). The /gateway/activity admin endpoint used to read from   */
/*   the in-memory bus (capped at 2,000 events total and reset on every  */
/*   restart), so admins could not review yesterday's gateway activity   */
/*   or run a compliance audit. This table makes the audit trail         */
/*   durable; the audience retention sweeper prunes rows older than the  */
/*   same retention window as the other audience audit tables.           */
/* --------------------------------------------------------------------- */
export const AudienceGatewayEventNameSchema = z.enum([
  "audience.gateway_send_simulated",
  "audience.gateway_send_dispatched",
  "audience.gateway_send_blocked",
]);
export type AudienceGatewayEventName = z.infer<typeof AudienceGatewayEventNameSchema>;

export const audienceGatewayEvents = pgTable("audience_gateway_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: text("event_id").notNull().unique(),
  eventName: text("event_name").notNull(),
  commandId: text("command_id"),
  connectorId: text("connector_id"),
  platform: text("platform"),
  requestedAction: text("requested_action"),
  status: integer("status"),
  reason: text("reason"),
  urlRedacted: text("url_redacted"),
  method: text("method"),
  adminId: text("admin_id"),
  emittedAt: timestamp("emitted_at").notNull().defaultNow(),
}, (t) => [
  index("IDX_audience_gateway_events_emitted_at").on(t.emittedAt),
  index("IDX_audience_gateway_events_event_name").on(t.eventName),
  index("IDX_audience_gateway_events_command_id").on(t.commandId),
  index("IDX_audience_gateway_events_connector_id").on(t.connectorId),
]);
export type AudienceGatewayEventRow = typeof audienceGatewayEvents.$inferSelect;

export interface AudienceGatewayEventRecord {
  id: string;
  name: AudienceGatewayEventName;
  emittedAt: string;
  payload: {
    commandId?: string | null;
    connectorId?: string | null;
    platform?: AudiencePlatform | null;
    requestedAction?: RequestedModerationAction | null;
    url?: string | null;
    method?: string | null;
    status?: number | null;
    reason?: string | null;
    adminId?: string | null;
  };
}

export const AUDIENCE_AUDIT_EMAIL_SCHEDULE_ID = "default";
/**
 * Task #432 — separate schedule row for the meta-audit "export history"
 * email. Lives in the same `audience_audit_email_schedules` /
 * `audience_audit_email_runs` tables, distinguished only by `scheduleId`,
 * so admins can configure cadence + recipients for the history export
 * independently of the audit-trail schedule above.
 */
export const AUDIENCE_AUDIT_HISTORY_EMAIL_SCHEDULE_ID = "history";

export const AudienceAuditCadenceSchema = z.enum(["weekly", "monthly"]);
export type AudienceAuditCadence = z.infer<typeof AudienceAuditCadenceSchema>;

export const AudienceAuditRunStatusSchema = z.enum([
  "pending",
  "success",
  "failed",
  "skipped",
]);
export type AudienceAuditRunStatus = z.infer<typeof AudienceAuditRunStatusSchema>;

export const audienceAuditEmailSchedules = pgTable("audience_audit_email_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: text("schedule_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  cadence: text("cadence").notNull().default("weekly"),
  recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
  platform: text("platform"),
  productionId: text("production_id"),
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: text("last_run_status"),
  lastRunError: text("last_run_error"),
  nextRunAt: timestamp("next_run_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type AudienceAuditEmailScheduleRow = typeof audienceAuditEmailSchedules.$inferSelect;

export const audienceAuditEmailRuns = pgTable("audience_audit_email_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: text("run_id").notNull().unique(),
  scheduleId: text("schedule_id").notNull(),
  cadence: text("cadence").notNull(),
  triggeredBy: text("triggered_by").notNull().default("scheduler"),
  isTest: boolean("is_test").notNull().default(false),
  windowFrom: timestamp("window_from").notNull(),
  windowTo: timestamp("window_to").notNull(),
  recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  messageCount: integer("message_count").notNull().default(0),
  decisionCount: integer("decision_count").notNull().default(0),
  commandCount: integer("command_count").notNull().default(0),
  connectorCount: integer("connector_count").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => [
  index("IDX_audience_audit_runs_schedule_id").on(t.scheduleId),
  index("IDX_audience_audit_runs_started_at").on(t.startedAt),
]);
export type AudienceAuditEmailRunRow = typeof audienceAuditEmailRuns.$inferSelect;

export interface AudienceAuditEmailSchedule {
  scheduleId: string;
  enabled: boolean;
  cadence: AudienceAuditCadence;
  recipients: string[];
  platform: AudiencePlatform | null;
  productionId: string | null;
  lastRunAt: string | null;
  lastRunStatus: AudienceAuditRunStatus | null;
  lastRunError: string | null;
  nextRunAt: string | null;
  updatedAt: string;
}

export interface AudienceAuditEmailRun {
  runId: string;
  scheduleId: string;
  cadence: AudienceAuditCadence;
  triggeredBy: "scheduler" | "manual";
  isTest: boolean;
  windowFrom: string;
  windowTo: string;
  recipients: string[];
  status: AudienceAuditRunStatus;
  errorMessage: string | null;
  messageCount: number;
  decisionCount: number;
  commandCount: number;
  connectorCount: number;
  startedAt: string;
  completedAt: string | null;
}

/* --------------------------------------------------------------------- */
/* AudienceArchiveDeletion (Task #413)                                    */
/*   Per-file audit row written every time the archive-retention sweeper  */
/*   permanently deletes a gzipped JSONL archive from object storage.     */
/*   Captures the file path, table, bytes reclaimed, the configured      */
/*   archive-retention window at deletion time, what triggered the run    */
/*   (`scheduled` / `manual` / `cli`), and the actor that signed off.    */
/* --------------------------------------------------------------------- */
export const audienceArchiveDeletions = pgTable("audience_archive_deletions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deletionId: text("deletion_id").notNull().unique(),
  path: text("path").notNull(),
  archiveTable: text("archive_table").notNull(),
  bytes: real("bytes").notNull().default(0),
  rowCount: real("row_count"),
  archiveAgeDays: real("archive_age_days").notNull().default(0),
  retentionDays: real("retention_days").notNull().default(0),
  trigger: text("trigger").notNull().default("scheduled"),
  actor: text("actor"),
  deletedAt: timestamp("deleted_at").notNull().defaultNow(),
  // Task #439: soft-delete grace window. When non-null the underlying
  // gzipped JSONL still exists in object storage under the `.trash/`
  // prefix and can be restored. `purgedAt` is set when the trash sweep
  // hard-deletes the file once it ages past the grace window.
  trashPath: text("trash_path"),
  graceDays: real("grace_days"),
  purgedAt: timestamp("purged_at"),
}, (t) => [
  index("IDX_audience_archive_deletions_deleted_at").on(t.deletedAt),
  index("IDX_audience_archive_deletions_archive_table").on(t.archiveTable),
  index("IDX_audience_archive_deletions_purged_at").on(t.purgedAt),
]);
export type AudienceArchiveDeletionRow = typeof audienceArchiveDeletions.$inferSelect;

/* --------------------------------------------------------------------- */
/* GatewayAlertSettingsAudit (Task #454)                                  */
/*   Audit trail for every change to the gateway block-alert thresholds  */
/*   (threshold / windowMs / dedupMs / recovery) that root admins edit   */
/*   from the omni-channel audience dashboard. Captures the field, the   */
/*   old value, the new value, the actor and the timestamp so founders   */
/*   can see who tuned an alert when investigating a misfire.            */
/* --------------------------------------------------------------------- */
export const gatewayAlertSettingsAudit = pgTable("gateway_alert_settings_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  action: text("action").notNull().default("update"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("IDX_gateway_alert_settings_audit_updated_at").on(t.updatedAt),
]);
export type GatewayAlertSettingsAuditRow = typeof gatewayAlertSettingsAudit.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceLegacyTokenKillSwitchAudit (Task #558)                         */
/*   Append-only audit log of every change root admins make to the       */
/*   per-platform legacy-token env-fallback kill-switch via              */
/*   `setEnvFallbackDisabledOverride` / the                              */
/*   `PUT .../legacy-token-status/:platform/env-fallback-disabled` route */
/*   (Task #501). Captures who flipped it, when, the platform, the       */
/*   resolved previous value, and the new value so founders can review   */
/*   security-critical kill-switch changes after the fact.               */
/*                                                                       */
/*   `previousValue` / `newValue` use the canonical string encoding:     */
/*     "true"   — env fallback disabled                                  */
/*     "false"  — env fallback enabled                                   */
/*     "cleared"— admin override removed; falls back to env / default    */
/* --------------------------------------------------------------------- */
export const audienceLegacyTokenKillSwitchAudit = pgTable(
  "audience_legacy_token_kill_switch_audit",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    platform: text("platform").notNull(),
    previousValue: text("previous_value").notNull(),
    newValue: text("new_value").notNull(),
    updatedBy: text("updated_by").notNull(),
    batchId: varchar("batch_id"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("IDX_audience_legacy_token_kill_switch_audit_updated_at").on(t.updatedAt),
    index("IDX_audience_legacy_token_kill_switch_audit_platform").on(t.platform),
    index("IDX_audience_legacy_token_kill_switch_audit_batch_id").on(t.batchId),
  ],
);
export type AudienceLegacyTokenKillSwitchAuditRow =
  typeof audienceLegacyTokenKillSwitchAudit.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceRetentionStaleHistory (Task #441)                              */
/*   Time-series of per-table stale-pending-archive counts captured at    */
/*   the end of every retention sweep. The Retention Mode card uses the  */
/*   last N samples to draw a sparkline and trend arrow next to each     */
/*   stale count so admins can see at a glance whether the backlog is    */
/*   shrinking (sweeps catching up) or growing (failure ongoing).        */
/* --------------------------------------------------------------------- */
export const audienceRetentionStaleHistory = pgTable("audience_retention_stale_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  retentionDays: integer("retention_days").notNull(),
  stalePendingMessages: integer("stale_pending_messages").notNull().default(0),
  stalePendingDecisions: integer("stale_pending_decisions").notNull().default(0),
  stalePendingCommands: integer("stale_pending_commands").notNull().default(0),
  sweepTrigger: text("sweep_trigger").notNull().default("scheduled"),
  sweepError: text("sweep_error"),
}, (t) => [
  index("IDX_audience_retention_stale_history_recorded_at").on(t.recordedAt),
]);
export type AudienceRetentionStaleHistoryRow = typeof audienceRetentionStaleHistory.$inferSelect;

/* --------------------------------------------------------------------- */
/* AudienceArchiveTrashPurges (Task #557)                                */
/*   Per-run audit row written every time runArchiveTrashPurge() hard-   */
/*   deletes one or more soft-deleted archive files out of the          */
/*   `.trash/` recycle bin. Captures the trigger (`scheduled` / `manual`  */
/*   / `cli`), the actor that signed off (root admin id, staff id, or    */
/*   the worker), how many files were purged, how many bytes were        */
/*   reclaimed, the effective grace window and the number of errors so   */
/*   admins can see a live history of recycle-bin clears for incident    */
/*   audits and capacity planning.                                       */
/* --------------------------------------------------------------------- */
export const audienceArchiveTrashPurges = pgTable("audience_archive_trash_purges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at").notNull().defaultNow(),
  trigger: text("trigger").notNull().default("scheduled"),
  actor: text("actor"),
  graceDays: real("grace_days").notNull().default(0),
  candidateEntries: integer("candidate_entries").notNull().default(0),
  purgedEntries: integer("purged_entries").notNull().default(0),
  bytesPurged: real("bytes_purged").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
}, (t) => [
  index("IDX_audience_archive_trash_purges_started_at").on(t.startedAt),
]);
export type AudienceArchiveTrashPurgeRow = typeof audienceArchiveTrashPurges.$inferSelect;
