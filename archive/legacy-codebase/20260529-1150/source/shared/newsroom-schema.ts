/**
 * Phase 1B — Verified Newsroom — DRAFT Drizzle schema.
 *
 * ⚠️ MIGRATION PENDING — MANUAL ROOT-ADMIN APPROVAL REQUIRED.
 *
 * This file is intentionally NOT imported from `shared/schema.ts` and is NOT
 * referenced by `drizzle.config.ts` (which only sees `./shared/schema.ts`).
 * Therefore `npm run db:push` will NOT pick up these tables. No DDL is emitted
 * and no production database is touched by adding this file.
 *
 * To eventually apply (out of scope for this PR):
 *   1. Re-export the tables below from `shared/schema.ts`.
 *   2. Run `npm run db:push` in a maintenance window with the
 *      founder/root-admin acknowledgement flow described in
 *      docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md §15.
 *   3. Seed `verified_sources` from `config/rssFeeds.json` (tier_c default).
 *
 * Grounded in:
 *   - docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md §3
 *   - shared/schema.ts conventions (varchar id default gen_random_uuid(),
 *     timestamps defaulting to now, jsonb for opaque payloads).
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
import type {
  VerifiedKeyFact,
  VerifiedKnowledgeConfidence,
  SourceCoverageRollup,
  NewsroomDataPackagePayload,
  NewsroomSafetyNotes,
  NewsroomRenderManifest,
} from "./newsroom-types";

/* --------------------------------------------------------------------- */
/* verified_sources                                                       */
/*   One row per source_name / domain. Drives reliability snapshots.      */
/* --------------------------------------------------------------------- */
export const verifiedSources = pgTable("verified_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceName: text("source_name").notNull().unique(),
  domain: text("domain").notNull(),
  tier: text("tier").notNull().default("tier_c"), // SourceReliabilityTier
  baseScore: real("base_score").notNull().default(0.5),
  recentAccuracy: real("recent_accuracy").notNull().default(0.5),
  retractionCount: integer("retraction_count").notNull().default(0),
  lastReviewedAt: timestamp("last_reviewed_at"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* --------------------------------------------------------------------- */
/* verified_knowledge                                                     */
/*   Canonical, immutable-after-verification knowledge object.            */
/* --------------------------------------------------------------------- */
export const verifiedKnowledge = pgTable("verified_knowledge", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clusterId: varchar("cluster_id").notNull().unique(),
  // Spec §8.2/§11: a verified_knowledge row only exists post-promotion.
  // Pre-promotion lifecycle (raw/clustered/extracting_claims/verification_pending)
  // lives on the cluster side, which is intentionally out-of-scope for this
  // draft (the user's request named exactly 6 tables; cluster tables will be
  // added in the follow-up clustering PR).
  status: text("status").notNull().default("verified"), // VerifiedKnowledgeStatus: verified|developing|disputed|correction
  canonicalTitle: text("canonical_title").notNull(),
  canonicalSummary: text("canonical_summary").notNull(),
  keyFacts: jsonb("key_facts").$type<VerifiedKeyFact[]>().notNull().default([]),
  confidence: jsonb("confidence").$type<VerifiedKnowledgeConfidence>().notNull(),
  sourceCoverage: jsonb("source_coverage").$type<SourceCoverageRollup>().notNull(),
  approvedBy: text("approved_by").notNull(), // root admin id; required per spec §11
  approvedAt: timestamp("approved_at").notNull().defaultNow(),
  supersededByVerifiedId: varchar("superseded_by_verified_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* --------------------------------------------------------------------- */
/* verified_claims                                                        */
/*   Claims attached to a verified_knowledge row (post-promotion) or to a */
/*   pending cluster (clusterId-only) before promotion.                   */
/* --------------------------------------------------------------------- */
export const verifiedClaims = pgTable("verified_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  verifiedKnowledgeId: varchar("verified_knowledge_id"),
  clusterId: varchar("cluster_id").notNull(),
  statement: text("statement").notNull(),
  subject: text("subject"),
  metric: text("metric"),
  timeReference: text("time_reference"),
  extractedBy: text("extracted_by").notNull().default("openai_gpt_5_5"),
  extractionConfidence: real("extraction_confidence").notNull().default(0.0),
  verdict: text("verdict"), // ClaimVerdict | null
  verdictConfidence: real("verdict_confidence").notNull().default(0.0),
  supportCount: integer("support_count").notNull().default(0),
  contradictionCount: integer("contradiction_count").notNull().default(0),
  evidence: jsonb("evidence").$type<
    Array<{
      url: string;
      sourceName: string;
      sourceTier: "tier_a" | "tier_b" | "tier_c" | "untrusted";
      supports: boolean;
      snippet?: string;
      reliabilitySnapshot: number;
    }>
  >().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* --------------------------------------------------------------------- */
/* verified_timeline_events                                               */
/*   Append-only timeline of story developments per cluster /             */
/*   verified_knowledge row (e.g. anchor article, correction, dispute).   */
/* --------------------------------------------------------------------- */
export const verifiedTimelineEvents = pgTable("verified_timeline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  verifiedKnowledgeId: varchar("verified_knowledge_id"),
  clusterId: varchar("cluster_id").notNull(),
  eventType: text("event_type").notNull(), // "anchor"|"update"|"correction"|"dispute"|"promotion"
  summary: text("summary").notNull(),
  newsArticleId: integer("news_article_id"),
  claimId: varchar("claim_id"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* --------------------------------------------------------------------- */
/* verified_media_references                                              */
/*   Media assets recorded for a cluster / verified_knowledge. Phase 1B   */
/*   never downloads or transcodes — it only records refs + rightsStatus. */
/* --------------------------------------------------------------------- */
export const verifiedMediaReferences = pgTable("verified_media_references", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  verifiedKnowledgeId: varchar("verified_knowledge_id"),
  clusterId: varchar("cluster_id").notNull(),
  kind: text("kind").notNull(), // "image"|"clip"|"chart"
  sourceUrl: text("source_url"),
  storageKey: text("storage_key"), // .local/media-assets/newsroom/<key>
  rightsStatus: text("rights_status").notNull().default("rights_unknown"), // RightsStatus
  rightsNote: text("rights_note"),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* --------------------------------------------------------------------- */
/* verification_audit_events                                              */
/*   Append-only audit log of admin decisions and automatic transitions.  */
/*   Subject-polymorphic via (subjectType, subjectId).                    */
/* --------------------------------------------------------------------- */
export const verificationAuditEvents = pgTable("verification_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectType: text("subject_type").notNull(), // cluster|claim|verified_knowledge|package|manifest|render_job
  subjectId: text("subject_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  action: text("action").notNull(), // approve|send_back|reject|dispute|correction|auto_transition
  actor: text("actor").notNull(), // "admin:<userId>" | "auto:<serviceName>"
  reason: text("reason"),
  diffSnapshot: jsonb("diff_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  decidedAt: timestamp("decided_at").notNull().defaultNow(),
  isManualOverride: boolean("is_manual_override").notNull().default(false),
});

/* --------------------------------------------------------------------- */
/* Optional sidecars referenced by the Phase 1B spec but kept inline as   */
/* jsonb columns above (no separate tables introduced here):              */
/*   - confidence (jsonb)         → VerifiedKnowledgeConfidence           */
/*   - sourceCoverage (jsonb)     → SourceCoverageRollup                  */
/*   - verified_claims.evidence   → inline array (denormalized for read)  */
/*                                                                        */
/* The render manifest itself is NOT a table in this draft — it is        */
/* carried inside the existing avatar_video_render_jobs.preview_metadata  */
/* JSONB column under renderBaseline.newsroomLink (see spec §13).         */
/* --------------------------------------------------------------------- */

/* --------------------------------------------------------------------- */
/* broadcast_briefs                                                       */
/*   Newsroom T3 — Structured "BroadcastBrief" produced for every         */
/*   verified_knowledge row. Downstream packaging / anchor / compositor / */
/*   b-roll layers all consume this canonical shape.                      */
/*                                                                        */
/*   SAFETY: every row defaults to status='draft' and is never            */
/*   auto-promoted. Nothing downstream may read a brief whose status is   */
/*   not 'approved'. See server/services/broadcast-brief-builder-service. */
/* --------------------------------------------------------------------- */
export const broadcastBriefs = pgTable("broadcast_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storyId: varchar("story_id").notNull(),
  articleId: integer("article_id"),
  dataPackageId: varchar("data_package_id").notNull(),
  // Soft FK to verified_knowledge.id — hard FK constraint will be added
  // alongside the verified_knowledge migration (see file header §"To
  // eventually apply"). Unique index below enforces one brief per story.
  verifiedKnowledgeId: varchar("verified_knowledge_id").notNull(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  location: jsonb("location").$type<{
    city: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
  }>().notNull(),
  region: text("region"),
  country: text("country"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  eventType: text("event_type").notNull(),
  entities: jsonb("entities").$type<
    Array<{ name: string; kind: "person" | "org" | "location" | "other" }>
  >().notNull().default([]),
  mood: text("mood").notNull().default("neutral"),
  impactScore: text("impact_score").notNull().default("medium"), // high|medium|low
  breakingNews: boolean("breaking_news").notNull().default(false),
  scriptBeats: jsonb("script_beats").$type<{
    coldOpen: string;
    keyFacts: string;
    context: string;
    signOff: string;
  }>().notNull(),
  visualNeeds: jsonb("visual_needs").$type<{
    coldOpen: string[];
    keyFacts: string[];
    context: string[];
    signOff: string[];
  }>().notNull(),
  bRollNeeds: jsonb("b_roll_needs").$type<string[]>().notNull().default([]),
  mapNeeds: jsonb("map_needs").$type<{
    needsMap: boolean;
    focus: string | null;
    zoomHint: "world" | "region" | "country" | "city" | "none";
  }>().notNull(),
  anchorMode: text("anchor_mode").notNull().default("solo_desk"),
  sensitivity: jsonb("sensitivity").$type<{
    graphicViolence: boolean;
    minors: boolean;
    disputed: boolean;
    medical: boolean;
    electoral: boolean;
    legal: boolean;
    death: boolean;
    financial: boolean;
    notes: string[];
  }>().notNull(),
  rightsFlags: jsonb("rights_flags").$type<{
    hasRestrictions: boolean;
    notes: string[];
  }>().notNull(),
  approvalStatus: text("approval_status").notNull().default("draft"), // draft|approved|archived
  visibility: text("visibility").notNull().default("admin_only_internal"),
  publicUrl: text("public_url"), // ALWAYS null at the application layer
  signedUrl: text("signed_url"), // ALWAYS null at the application layer
  realSendAllowed: boolean("real_send_allowed").notNull().default(false),
  executionEnabled: boolean("execution_enabled").notNull().default(false),
  safetyEnvelope: jsonb("safety_envelope").$type<Record<string, boolean>>().notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("UX_broadcast_briefs_data_package_id").on(table.dataPackageId),
  index("IDX_broadcast_briefs_story_id").on(table.storyId),
  index("IDX_broadcast_briefs_verified_knowledge_id").on(table.verifiedKnowledgeId),
  index("IDX_broadcast_briefs_approval_status").on(table.approvalStatus),
  index("IDX_broadcast_briefs_created_at").on(table.createdAt),
]);

export type BroadcastBriefRow = typeof broadcastBriefs.$inferSelect;

/* --------------------------------------------------------------------- */
/* newsroom_packages                                                       */
/*   Newsroom T5 — Pure-data 3D/4D newsroom package built from an         */
/*   approved BroadcastBrief. Consumed downstream by the Compositor (T6)  */
/*   and Anchor Director (T7).                                            */
/*                                                                        */
/*   SAFETY:                                                               */
/*     - Every row defaults to status='draft'. Downstream readers MUST    */
/*       only consume rows whose status === 'approved'.                   */
/*     - `fourDCues` is a list of SUGGESTIONS only — every entry carries  */
/*       `simulationOnly: true` and never a hardware payload. The         */
/*       builder + PATCH route hard-refuse cues with executable payloads. */
/*     - No publicUrl, no signedUrl, no execution toggles live here.      */
/* --------------------------------------------------------------------- */
export const newsroomPackages = pgTable("newsroom_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  briefId: varchar("brief_id").notNull(),
  ledWall: jsonb("led_wall").$type<{
    backgroundShots: string[];
    bRollReferences: string[];
    safetyLabels: string[];
  }>().notNull(),
  sourcePanel: jsonb("source_panel").$type<{
    sources: { name: string; kind: string }[];
    distinctEntityCount: number;
    notes: string[];
  }>().notNull(),
  confidencePanel: jsonb("confidence_panel").$type<{
    label: "high" | "medium" | "low";
    impactScore: "high" | "medium" | "low";
    breakingNews: boolean;
    cautions: string[];
  }>().notNull(),
  claimsTimeline: jsonb("claims_timeline").$type<{
    beats: { kind: "cold_open" | "key_facts" | "context" | "sign_off"; text: string }[];
  }>().notNull(),
  ticker: text("ticker").notNull(),
  lowerThird: jsonb("lower_third").$type<{
    primary: string;
    secondary: string | null;
  }>().notNull(),
  teleprompter: text("teleprompter").notNull(),
  cameraPlan: jsonb("camera_plan").$type<{
    anchorMode: string;
    shots: { name: string; description: string }[];
  }>().notNull(),
  fourDCues: jsonb("four_d_cues").$type<
    Array<{
      id: string;
      beat: "cold_open" | "key_facts" | "context" | "sign_off";
      kind: "rumble" | "wind" | "tilt" | "flash" | "scent";
      intensity: "low" | "medium" | "high";
      reason: string;
      simulationOnly: true;
    }>
  >().notNull().default([]),
  status: text("status").notNull().default("draft"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("UX_newsroom_packages_brief_id").on(table.briefId),
  index("IDX_newsroom_packages_status").on(table.status),
  index("IDX_newsroom_packages_created_at").on(table.createdAt),
]);

export type NewsroomPackageRow = typeof newsroomPackages.$inferSelect;

export type VerifiedSourceRow = typeof verifiedSources.$inferSelect;
export type VerifiedKnowledgeRow = typeof verifiedKnowledge.$inferSelect;
export type VerifiedClaimRow = typeof verifiedClaims.$inferSelect;
export type VerifiedTimelineEventRow = typeof verifiedTimelineEvents.$inferSelect;
export type VerifiedMediaReferenceRow = typeof verifiedMediaReferences.$inferSelect;
export type VerificationAuditEventRow = typeof verificationAuditEvents.$inferSelect;

/* Re-export the shape types so callers can `import` from a single module. */
export type {
  NewsroomDataPackagePayload,
  NewsroomSafetyNotes,
  NewsroomRenderManifest,
};
