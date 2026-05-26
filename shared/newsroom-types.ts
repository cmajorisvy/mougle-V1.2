/**
 * Phase 1B — Verified Newsroom — TypeScript types + Zod contracts (DRAFT).
 *
 * ⚠️ MIGRATION PENDING. This module is contract-only: no service code reads
 * from it yet. Importing it does NOT touch the database.
 *
 * Grounded in docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md
 * sections 2.1, 4, 9–13.
 */

import { z } from "zod";

/* --------------------------------------------------------------------- */
/* Enumerations                                                           */
/* --------------------------------------------------------------------- */

export const VERIFICATION_STATUSES = [
  "raw",
  "clustered",
  "extracting_claims",
  "verification_pending",
  "verified",
  "developing",
  "disputed",
  "correction",
  "rejected",
] as const;
export const VerificationStatusSchema = z.enum(VERIFICATION_STATUSES);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const CLAIM_VERDICTS = [
  "supported",
  "contradicted",
  "insufficient_evidence",
  "needs_human_review",
] as const;
export const ClaimVerdictSchema = z.enum(CLAIM_VERDICTS);
export type ClaimVerdict = z.infer<typeof ClaimVerdictSchema>;

export const RIGHTS_STATUSES = [
  "owned",
  "licensed",
  "fair_use_review",
  "rights_unknown",
  "blocked",
] as const;
export const RightsStatusSchema = z.enum(RIGHTS_STATUSES);
export type RightsStatus = z.infer<typeof RightsStatusSchema>;

export const SOURCE_RELIABILITY_TIERS = [
  "tier_a",
  "tier_b",
  "tier_c",
  "untrusted",
] as const;
export const SourceReliabilityTierSchema = z.enum(SOURCE_RELIABILITY_TIERS);
export type SourceReliabilityTier = z.infer<typeof SourceReliabilityTierSchema>;

export const CONFIDENCE_LEVELS = ["low", "medium", "high", "very_high"] as const;
export const ConfidenceLevelSchema = z.enum(CONFIDENCE_LEVELS);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/** Map a 0..1 aggregate confidence into a coarse band (UI badges, gating). */
export function confidenceLevelOf(aggregate: number): ConfidenceLevel {
  if (aggregate >= 0.85) return "very_high";
  if (aggregate >= 0.7) return "high";
  if (aggregate >= 0.5) return "medium";
  return "low";
}

/* --------------------------------------------------------------------- */
/* Confidence scoring                                                     */
/* --------------------------------------------------------------------- */

export const VerifiedKnowledgeConfidenceSchema = z.object({
  aggregate: z.number().min(0).max(1),
  claimSupport: z.number().min(0).max(1),
  sourceDiversity: z.number().min(0).max(1),
  sourceReliabilityAvg: z.number().min(0).max(1),
  contradictionPenalty: z.number().min(0).max(0.5),
  ageDecay: z.number().min(0).max(1),
  computedAt: z.string(),
  formulaVersion: z.literal("v1"),
});
export type VerifiedKnowledgeConfidence = z.infer<
  typeof VerifiedKnowledgeConfidenceSchema
>;

/* --------------------------------------------------------------------- */
/* Source reliability                                                     */
/* --------------------------------------------------------------------- */

export const VerifiedSourceReferenceSchema = z.object({
  sourceName: z.string().min(1),
  domain: z.string().min(1),
  tier: SourceReliabilityTierSchema,
  baseScore: z.number().min(0).max(1),
  recentAccuracy: z.number().min(0).max(1),
  retractionCount: z.number().int().min(0),
  effectiveReliability: z.number().min(0).max(1),
});
export type VerifiedSourceReference = z.infer<
  typeof VerifiedSourceReferenceSchema
>;

/** Pure function — keep in sync with spec §10. */
export function effectiveReliability(input: {
  baseScore: number;
  recentAccuracy: number;
  retractionCount: number;
}): number {
  const penalty = Math.min(0.3, 0.05 * input.retractionCount);
  const raw = 0.6 * input.baseScore + 0.4 * input.recentAccuracy - penalty;
  return Math.max(0, Math.min(1, raw));
}

/** Pure function — keep in sync with spec §10 tier mapping. */
export function tierFromReliability(reliability: number): SourceReliabilityTier {
  if (reliability >= 0.8) return "tier_a";
  if (reliability >= 0.6) return "tier_b";
  if (reliability >= 0.4) return "tier_c";
  return "untrusted";
}

/* --------------------------------------------------------------------- */
/* Source coverage rollup (jsonb on verified_knowledge.source_coverage)   */
/* --------------------------------------------------------------------- */

export const SourceCoverageRollupSchema = z.object({
  distinctSources: z.number().int().min(0),
  tierBreakdown: z.record(SourceReliabilityTierSchema, z.number().int().min(0)),
  earliestPublishedAt: z.string(),
  latestPublishedAt: z.string(),
});
export type SourceCoverageRollup = z.infer<typeof SourceCoverageRollupSchema>;

/* --------------------------------------------------------------------- */
/* Verified claim + evidence                                              */
/* --------------------------------------------------------------------- */

export const VerifiedClaimEvidenceSchema = z.object({
  url: z.string().url(),
  sourceName: z.string().min(1),
  sourceTier: SourceReliabilityTierSchema,
  supports: z.boolean(),
  snippet: z.string().max(1000).optional(),
  reliabilitySnapshot: z.number().min(0).max(1),
});
export type VerifiedClaimEvidence = z.infer<typeof VerifiedClaimEvidenceSchema>;

export const VerifiedClaimSchema = z.object({
  id: z.string(),
  clusterId: z.string(),
  verifiedKnowledgeId: z.string().nullable(),
  statement: z.string().min(1).max(1000),
  subject: z.string().nullable().optional(),
  metric: z.string().nullable().optional(),
  timeReference: z.string().nullable().optional(),
  verdict: ClaimVerdictSchema.nullable(),
  verdictConfidence: z.number().min(0).max(1),
  supportCount: z.number().int().min(0),
  contradictionCount: z.number().int().min(0),
  evidence: z.array(VerifiedClaimEvidenceSchema),
});
export type VerifiedClaim = z.infer<typeof VerifiedClaimSchema>;

/* --------------------------------------------------------------------- */
/* Verified timeline event                                                */
/* --------------------------------------------------------------------- */

export const TIMELINE_EVENT_TYPES = [
  "anchor",
  "update",
  "correction",
  "dispute",
  "promotion",
  "rejection",
] as const;
export const TimelineEventTypeSchema = z.enum(TIMELINE_EVENT_TYPES);
export type TimelineEventType = z.infer<typeof TimelineEventTypeSchema>;

export const VerifiedTimelineEventSchema = z.object({
  id: z.string(),
  verifiedKnowledgeId: z.string().nullable(),
  clusterId: z.string(),
  eventType: TimelineEventTypeSchema,
  summary: z.string().min(1).max(500),
  newsArticleId: z.number().int().positive().nullable().optional(),
  claimId: z.string().nullable().optional(),
  occurredAt: z.string(),
});
export type VerifiedTimelineEvent = z.infer<typeof VerifiedTimelineEventSchema>;

/* --------------------------------------------------------------------- */
/* Verified media reference                                               */
/* --------------------------------------------------------------------- */

export const MEDIA_KINDS = ["image", "clip", "chart"] as const;
export const MediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const VerifiedMediaReferenceSchema = z.object({
  id: z.string(),
  verifiedKnowledgeId: z.string().nullable(),
  clusterId: z.string(),
  kind: MediaKindSchema,
  sourceUrl: z.string().url().nullable().optional(),
  storageKey: z.string().nullable().optional(),
  rightsStatus: RightsStatusSchema,
  rightsNote: z.string().max(500).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationMs: z.number().int().min(0).nullable().optional(),
});
export type VerifiedMediaReference = z.infer<typeof VerifiedMediaReferenceSchema>;

/* --------------------------------------------------------------------- */
/* VerifiedKnowledge domain object                                        */
/* --------------------------------------------------------------------- */

export const VerifiedKeyFactSchema = z.object({
  statement: z.string().min(1).max(280),
  derivedFromClaimIds: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});
export type VerifiedKeyFact = z.infer<typeof VerifiedKeyFactSchema>;

export const VerifiedKnowledgeStatusSchema = z.enum([
  "verified",
  "developing",
  "disputed",
  "correction",
]);
export type VerifiedKnowledgeStatus = z.infer<typeof VerifiedKnowledgeStatusSchema>;

export const VerifiedKnowledgeSchema = z.object({
  id: z.string(),
  clusterId: z.string(),
  status: VerifiedKnowledgeStatusSchema,
  canonicalTitle: z.string().min(1).max(200),
  canonicalSummary: z.string().min(1).max(2000),
  keyFacts: z.array(VerifiedKeyFactSchema).max(20),
  claims: z.array(VerifiedClaimSchema),
  confidence: VerifiedKnowledgeConfidenceSchema,
  sourceCoverage: SourceCoverageRollupSchema,
  approvedBy: z.string(),
  approvedAt: z.string(),
  supersededByVerifiedId: z.string().nullable(),
});
export type VerifiedKnowledge = z.infer<typeof VerifiedKnowledgeSchema>;

/* --------------------------------------------------------------------- */
/* NewsroomDataPackagePayload + safety notes                              */
/* --------------------------------------------------------------------- */

export const PACKAGE_TEMPLATES = [
  "news_desk",
  "minimal_cards",
  "debate_arena_summary",
] as const;
export const PackageTemplateSchema = z.enum(PACKAGE_TEMPLATES);
export type PackageTemplate = z.infer<typeof PackageTemplateSchema>;

export const NewsroomSegmentSchema = z.object({
  segmentIndex: z.number().int().min(0),
  scriptType: z.enum(["two_minute", "ten_minute", "mougle_conclusion"]),
  narrationText: z.string().min(1).max(4000),
  keyFactIndex: z.number().int().min(0).nullable(),
  durationMs: z.number().int().positive(),
});
export type NewsroomSegment = z.infer<typeof NewsroomSegmentSchema>;

export const NewsroomDataPackagePayloadSchema = z.object({
  verifiedKnowledgeId: z.string(),
  version: z.number().int().positive(),
  template: PackageTemplateSchema,
  title: z.string().min(1).max(80),
  subtitle: z.string().max(120),
  headline: z.object({
    text: z.string().min(1).max(120),
    durationMs: z.number().int().positive(),
  }),
  lowerThirds: z.array(
    z.object({
      text: z.string().min(1).max(120),
      startMs: z.number().int().min(0),
      endMs: z.number().int().positive(),
    }),
  ),
  tickerItems: z
    .array(z.object({ text: z.string().min(1).max(140) }))
    .max(6),
  segments: z.array(NewsroomSegmentSchema).min(1),
  sourceEvidenceReferences: z.array(
    z.object({
      label: z.string().min(1).max(120),
      url: z.string().url(),
      claimId: z.string(),
      confidenceScore: z.number().min(0).max(1),
      status: ClaimVerdictSchema,
    }),
  ),
  mediaRefs: z.array(
    z.object({
      mediaId: z.string(),
      usage: z.enum(["background", "insert", "lower_third_logo"]),
      rightsStatus: RightsStatusSchema,
    }),
  ),
  complianceNotes: z.array(z.string().max(500)),
  safetyLabels: z.array(z.string().max(80)),
  generatedAt: z.string(),
});
export type NewsroomDataPackagePayload = z.infer<
  typeof NewsroomDataPackagePayloadSchema
>;

export const ComplianceFindingSchema = z.object({
  level: z.enum(["info", "warning", "blocking"]),
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  context: z.record(z.string(), z.unknown()).optional(),
});
export type ComplianceFinding = z.infer<typeof ComplianceFindingSchema>;

export const NewsroomSafetyNotesSchema = z.object({
  internalAdminReviewOnly: z.literal(true),
  manualRootAdminTriggerOnly: z.literal(true),
  publicPublishing: z.literal(false),
  youtubeUpload: z.literal(false),
  socialPosting: z.literal(false),
  blockingFindings: z.array(ComplianceFindingSchema),
  warningFindings: z.array(ComplianceFindingSchema),
  rightsIssues: z.array(
    z.object({
      mediaId: z.string(),
      rightsStatus: RightsStatusSchema,
      note: z.string().max(500),
    }),
  ),
});
export type NewsroomSafetyNotes = z.infer<typeof NewsroomSafetyNotesSchema>;

/* --------------------------------------------------------------------- */
/* RenderManifest additions                                               */
/*   The newsroom render manifest is carried inside the existing          */
/*   avatar_video_render_jobs.preview_metadata JSONB column under         */
/*   renderBaseline.newsroomLink. No new column is introduced.            */
/* --------------------------------------------------------------------- */

export const NewsroomRenderLinkSchema = z.object({
  packageId: z.string(),
  manifestId: z.string(),
  verifiedKnowledgeId: z.string(),
  packageVersion: z.number().int().positive(),
  template: PackageTemplateSchema,
});
export type NewsroomRenderLink = z.infer<typeof NewsroomRenderLinkSchema>;

/* --------------------------------------------------------------------- */
/* Render-manifest sub-shapes (spec §13)                                  */
/*   layers / safeZones / textSafety mirror the Phase 1A RenderBaseline   */
/*   surface in server/services/avatar-video-render-service.ts so that    */
/*   buildRenderBaseline() can accept the manifest verbatim.              */
/* --------------------------------------------------------------------- */

export const RenderLayerSchema = z.object({
  key: z.string().min(1).max(80),
  kind: z.enum([
    "background",
    "anchor",
    "monitor_panel",
    "lower_third",
    "ticker",
    "caption",
    "logo",
    "insert",
  ]),
  zIndex: z.number().int(),
  visible: z.boolean().default(true),
});
export type RenderLayer = z.infer<typeof RenderLayerSchema>;

export const SafeZoneSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(0).max(100),
  height: z.number().min(0).max(100),
  unit: z.literal("percent"),
  purpose: z.enum([
    "anchor",
    "lower-third",
    "ticker",
    "caption",
    "monitor",
  ]),
});
export type SafeZone = z.infer<typeof SafeZoneSchema>;

export const RenderSafeZonesSchema = z.object({
  anchorSafeZone: SafeZoneSchema,
  lowerThirdZone: SafeZoneSchema,
  tickerZone: SafeZoneSchema,
  captionZone: SafeZoneSchema, // Phase 1A locked at {x:10,y:85,w:80,h:4 or 6}
  monitorPanelZones: z.array(
    SafeZoneSchema.extend({ panelKey: z.string().min(1).max(80) }),
  ),
});
export type RenderSafeZones = z.infer<typeof RenderSafeZonesSchema>;

export const RenderTextSafetySchema = z.object({
  maxHeadlineChars: z.number().int().positive(),
  maxLowerThirdChars: z.number().int().positive(),
  maxTickerChars: z.number().int().positive(),
  maxCaptionCharsPerCue: z.number().int().positive(),
  maxCaptionLinesPerCue: z.number().int().min(1).max(4),
});
export type RenderTextSafety = z.infer<typeof RenderTextSafetySchema>;

export const NewsroomRenderManifestSchema = z.object({
  packageId: z.string(),
  packageVersion: z.number().int().positive(),
  format: z.object({
    width: z.literal(1920),
    height: z.literal(1080),
    fps: z.literal(30),
    videoCodec: z.literal("h264"),
    audioCodec: z.literal("aac"),
    captionFormat: z.literal("srt"),
  }),
  layers: z.array(RenderLayerSchema).min(1), // spec §13: reuses Phase 1A layer stack
  safeZones: RenderSafeZonesSchema, // spec §13: reuses Phase 1A safeZones
  textSafety: RenderTextSafetySchema, // spec §13: reuses Phase 1A textSafety
  timing: z.object({
    totalDurationMs: z.number().int().positive(),
    segments: z.array(
      z.object({
        segmentIndex: z.number().int().min(0),
        startMs: z.number().int().min(0),
        endMs: z.number().int().positive(),
        lowerThirdVisible: z.boolean(),
        tickerVisible: z.boolean(),
        captionWindow: z.object({
          startMs: z.number().int().min(0),
          endMs: z.number().int().positive(),
        }),
        sourceClaimIds: z.array(z.string()),
      }),
    ),
  }),
  captionsPlan: z.object({
    cues: z.array(
      z.object({
        index: z.number().int().min(0),
        startMs: z.number().int().min(0),
        endMs: z.number().int().positive(),
        text: z.string().min(1).max(120),
      }),
    ),
    overflowFindings: z.array(ComplianceFindingSchema),
  }),
  mediaPlan: z.array(
    z.object({
      mediaId: z.string(),
      layer: z.enum(["background", "insert"]),
      startMs: z.number().int().min(0),
      endMs: z.number().int().positive(),
      rightsStatus: RightsStatusSchema,
    }),
  ),
  compliance: z.object({
    blocking: z.array(ComplianceFindingSchema),
    warnings: z.array(ComplianceFindingSchema),
  }),
  safety: NewsroomSafetyNotesSchema,
  generatedAt: z.string(),
});
export type NewsroomRenderManifest = z.infer<typeof NewsroomRenderManifestSchema>;

/* --------------------------------------------------------------------- */
/* Admin request contracts (mirrors spec §4)                              */
/* --------------------------------------------------------------------- */

export const ClusterDraftRequestSchema = z.object({
  windowMinutes: z.number().int().min(15).max(24 * 60).default(180),
  minClusterSize: z.number().int().min(1).max(20).default(2),
  dryRun: z.literal(true),
});
export type ClusterDraftRequest = z.infer<typeof ClusterDraftRequestSchema>;

export const ClaimExtractionRequestSchema = z.object({
  clusterId: z.string().uuid(),
  maxClaims: z.number().int().min(1).max(20).default(8),
});
export type ClaimExtractionRequest = z.infer<typeof ClaimExtractionRequestSchema>;

export const ClaimVerifyRequestSchema = z.object({
  claimId: z.string().uuid(),
  mode: z.enum(["auto", "admin"]).default("auto"),
  verdict: ClaimVerdictSchema.optional(),
  rationale: z.string().max(2000).optional(),
});
export type ClaimVerifyRequest = z.infer<typeof ClaimVerifyRequestSchema>;

export const PromoteToVerifiedRequestSchema = z.object({
  clusterId: z.string().uuid(),
  minConfidence: z.number().min(0).max(1).default(0.7),
  acknowledgeSafetyCheck: z.literal(true),
});
export type PromoteToVerifiedRequest = z.infer<
  typeof PromoteToVerifiedRequestSchema
>;

export const BuildPackageRequestSchema = z.object({
  verifiedKnowledgeId: z.string().uuid(),
  template: PackageTemplateSchema.default("news_desk"),
});
export type BuildPackageRequest = z.infer<typeof BuildPackageRequestSchema>;

export const BuildRenderManifestRequestSchema = z.object({
  packageId: z.string().uuid(),
});
export type BuildRenderManifestRequest = z.infer<
  typeof BuildRenderManifestRequestSchema
>;

export const PreviewRenderRequestSchema = z.object({
  manifestId: z.string().uuid(),
});
export type PreviewRenderRequest = z.infer<typeof PreviewRenderRequestSchema>;

/* --------------------------------------------------------------------- */
/* BroadcastBrief (Newsroom T3)                                           */
/* --------------------------------------------------------------------- */

export const BROADCAST_BRIEF_STATUSES = ["draft", "approved", "archived"] as const;
export const BroadcastBriefStatusSchema = z.enum(BROADCAST_BRIEF_STATUSES);
export type BroadcastBriefStatus = z.infer<typeof BroadcastBriefStatusSchema>;

export const BROADCAST_BRIEF_IMPACT = ["high", "medium", "low"] as const;
export const BroadcastBriefImpactSchema = z.enum(BROADCAST_BRIEF_IMPACT);
export type BroadcastBriefImpact = z.infer<typeof BroadcastBriefImpactSchema>;

export const BROADCAST_BRIEF_MOODS = [
  "neutral",
  "urgent",
  "celebratory",
  "somber",
  "analytical",
  "investigative",
] as const;
export const BroadcastBriefMoodSchema = z.enum(BROADCAST_BRIEF_MOODS);
export type BroadcastBriefMood = z.infer<typeof BroadcastBriefMoodSchema>;

export const BroadcastBriefLocationSchema = z.object({
  city: z.string().min(1).max(120).nullable(),
  country: z.string().min(1).max(120).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
});
export type BroadcastBriefLocation = z.infer<typeof BroadcastBriefLocationSchema>;

export const BroadcastBriefEntitySchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["person", "org", "location", "other"]),
});
export type BroadcastBriefEntity = z.infer<typeof BroadcastBriefEntitySchema>;

export const BroadcastBriefScriptBeatsSchema = z.object({
  coldOpen: z.string().min(1).max(600),
  keyFacts: z.string().min(1).max(1200),
  context: z.string().min(1).max(1200),
  signOff: z.string().min(1).max(400),
});
export type BroadcastBriefScriptBeats = z.infer<typeof BroadcastBriefScriptBeatsSchema>;

export const BroadcastBriefVisualNeedsSchema = z.object({
  coldOpen: z.array(z.string().min(1).max(200)).max(8),
  keyFacts: z.array(z.string().min(1).max(200)).max(8),
  context: z.array(z.string().min(1).max(200)).max(8),
  signOff: z.array(z.string().min(1).max(200)).max(8),
});
export type BroadcastBriefVisualNeeds = z.infer<typeof BroadcastBriefVisualNeedsSchema>;

export const BroadcastBriefRightsFlagsSchema = z.object({
  hasRestrictions: z.boolean(),
  notes: z.array(z.string().min(1).max(300)).max(20),
});
export type BroadcastBriefRightsFlags = z.infer<typeof BroadcastBriefRightsFlagsSchema>;

export const BROADCAST_BRIEF_ANCHOR_MODES = [
  "solo_desk",
  "two_anchor",
  "reporter_remote",
  "studio_panel",
  "voiceover_only",
] as const;
export const BroadcastBriefAnchorModeSchema = z.enum(BROADCAST_BRIEF_ANCHOR_MODES);
export type BroadcastBriefAnchorMode = z.infer<typeof BroadcastBriefAnchorModeSchema>;

export const BroadcastBriefMapNeedsSchema = z.object({
  needsMap: z.boolean(),
  focus: z.string().min(1).max(200).nullable(),
  zoomHint: z.enum(["world", "region", "country", "city", "none"]).default("none"),
});
export type BroadcastBriefMapNeeds = z.infer<typeof BroadcastBriefMapNeedsSchema>;

/**
 * Per-brief sensitivity flags. All default to false. Flagging a category
 * triggers downstream T1 safety harness gates (no auto-promotion, no
 * publication, manual root admin review).
 */
export const BroadcastBriefSensitivitySchema = z.object({
  graphicViolence: z.boolean().default(false),
  minors: z.boolean().default(false),
  disputed: z.boolean().default(false),
  medical: z.boolean().default(false),
  electoral: z.boolean().default(false),
  legal: z.boolean().default(false),
  death: z.boolean().default(false),
  financial: z.boolean().default(false),
  notes: z.array(z.string().min(1).max(300)).max(10).default([]),
});
export type BroadcastBriefSensitivity = z.infer<typeof BroadcastBriefSensitivitySchema>;

/**
 * Locked safety envelope for every BroadcastBrief. The literal-false /
 * literal-true contracts here cannot be tampered by client or downstream
 * code: any attempt to flip them fails Zod parse at the boundary.
 */
export const BroadcastBriefSafetyEnvelopeSchema = z.object({
  publicPublishing: z.literal(false),
  youtubeUpload: z.literal(false),
  socialPosting: z.literal(false),
  liveStreaming: z.literal(false),
  realUnrealCommands: z.literal(false),
  real4DCommands: z.literal(false),
  movieRenderQueue: z.literal(false),
  sequencerExecution: z.literal(false),
  cinema4dExecution: z.literal(false),
  publicUrlGeneration: z.literal(false),
  signedUrlGeneration: z.literal(false),
  copyrightedVideoFetch: z.literal(false),
  logoOrWatermarkRemoval: z.literal(false),
  manualRootAdminOverrideOnly: z.literal(true),
  internalAdminReviewAvailable: z.literal(true),
});
export type BroadcastBriefSafetyEnvelope = z.infer<typeof BroadcastBriefSafetyEnvelopeSchema>;

export const BROADCAST_BRIEF_SAFETY_ENVELOPE: BroadcastBriefSafetyEnvelope = Object.freeze({
  publicPublishing: false as const,
  youtubeUpload: false as const,
  socialPosting: false as const,
  liveStreaming: false as const,
  realUnrealCommands: false as const,
  real4DCommands: false as const,
  movieRenderQueue: false as const,
  sequencerExecution: false as const,
  cinema4dExecution: false as const,
  publicUrlGeneration: false as const,
  signedUrlGeneration: false as const,
  copyrightedVideoFetch: false as const,
  logoOrWatermarkRemoval: false as const,
  manualRootAdminOverrideOnly: true as const,
  internalAdminReviewAvailable: true as const,
});

/** AI-output shape (no id/safety/system fields — those are server-controlled). */
export const BroadcastBriefAiPayloadSchema = z.object({
  headline: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  location: BroadcastBriefLocationSchema,
  region: z.string().min(1).max(120).nullable(),
  country: z.string().min(1).max(120).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  eventType: z.string().min(1).max(120),
  entities: z.array(BroadcastBriefEntitySchema).max(20),
  mood: BroadcastBriefMoodSchema,
  impactScore: BroadcastBriefImpactSchema,
  breakingNews: z.boolean(),
  scriptBeats: BroadcastBriefScriptBeatsSchema,
  visualNeeds: BroadcastBriefVisualNeedsSchema,
  bRollNeeds: z.array(z.string().min(1).max(200)).max(20),
  mapNeeds: BroadcastBriefMapNeedsSchema,
  anchorMode: BroadcastBriefAnchorModeSchema,
  sensitivity: BroadcastBriefSensitivitySchema,
  rightsFlags: BroadcastBriefRightsFlagsSchema,
});
export type BroadcastBriefAiPayload = z.infer<typeof BroadcastBriefAiPayloadSchema>;

/** Stored brief (what admin endpoints return). */
export const BroadcastBriefSchema = BroadcastBriefAiPayloadSchema.extend({
  id: z.string(),
  storyId: z.string(),
  articleId: z.number().int().positive().nullable(),
  dataPackageId: z.string(),
  verifiedKnowledgeId: z.string(),
  approvalStatus: BroadcastBriefStatusSchema,
  visibility: z.literal("admin_only_internal"),
  publicUrl: z.null(),
  signedUrl: z.null(),
  realSendAllowed: z.literal(false),
  executionEnabled: z.literal(false),
  safetyEnvelope: BroadcastBriefSafetyEnvelopeSchema,
  approvedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BroadcastBrief = z.infer<typeof BroadcastBriefSchema>;

/** Admin PATCH body — content fields are editable; safety fields are not. */
export const BroadcastBriefPatchSchema = z.object({
  headline: z.string().min(1).max(200).optional(),
  summary: z.string().min(1).max(2000).optional(),
  location: BroadcastBriefLocationSchema.optional(),
  region: z.string().min(1).max(120).nullable().optional(),
  country: z.string().min(1).max(120).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  eventType: z.string().min(1).max(120).optional(),
  entities: z.array(BroadcastBriefEntitySchema).max(20).optional(),
  mood: BroadcastBriefMoodSchema.optional(),
  impactScore: BroadcastBriefImpactSchema.optional(),
  breakingNews: z.boolean().optional(),
  scriptBeats: BroadcastBriefScriptBeatsSchema.optional(),
  visualNeeds: BroadcastBriefVisualNeedsSchema.optional(),
  bRollNeeds: z.array(z.string().min(1).max(200)).max(20).optional(),
  mapNeeds: BroadcastBriefMapNeedsSchema.optional(),
  anchorMode: BroadcastBriefAnchorModeSchema.optional(),
  sensitivity: BroadcastBriefSensitivitySchema.optional(),
  rightsFlags: BroadcastBriefRightsFlagsSchema.optional(),
  approvalStatus: BroadcastBriefStatusSchema.optional(),
}).strict();
export type BroadcastBriefPatch = z.infer<typeof BroadcastBriefPatchSchema>;

/* --------------------------------------------------------------------- */
/* Newsroom T5 — NewsroomPackage shapes                                   */
/*   Pure-data 3D/4D newsroom package built from an approved              */
/*   BroadcastBrief. 4D cues are SUGGESTIONS only: every cue carries      */
/*   `simulationOnly: true` and never a hardware payload.                  */
/* --------------------------------------------------------------------- */

export const NEWSROOM_PACKAGE_STATUSES = ["draft", "approved", "archived"] as const;
export const NewsroomPackageStatusSchema = z.enum(NEWSROOM_PACKAGE_STATUSES);
export type NewsroomPackageStatus = z.infer<typeof NewsroomPackageStatusSchema>;

export const NEWSROOM_SCRIPT_BEAT_KINDS = [
  "cold_open",
  "key_facts",
  "context",
  "sign_off",
] as const;
export const NewsroomScriptBeatKindSchema = z.enum(NEWSROOM_SCRIPT_BEAT_KINDS);

export const NewsroomLedWallSchema = z.object({
  backgroundShots: z.array(z.string().min(1).max(200)).max(20).default([]),
  bRollReferences: z.array(z.string().min(1).max(200)).max(20).default([]),
  safetyLabels: z.array(z.string().min(1).max(120)).max(20).default([]),
});
export type NewsroomLedWall = z.infer<typeof NewsroomLedWallSchema>;

export const NewsroomSourcePanelSchema = z.object({
  sources: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        kind: z.string().min(1).max(60),
      }),
    )
    .max(40)
    .default([]),
  distinctEntityCount: z.number().int().min(0).max(1000).default(0),
  notes: z.array(z.string().min(1).max(300)).max(10).default([]),
});
export type NewsroomSourcePanel = z.infer<typeof NewsroomSourcePanelSchema>;

export const NewsroomConfidencePanelSchema = z.object({
  label: z.enum(["high", "medium", "low"]),
  impactScore: BroadcastBriefImpactSchema,
  breakingNews: z.boolean(),
  cautions: z.array(z.string().min(1).max(300)).max(20).default([]),
});
export type NewsroomConfidencePanel = z.infer<typeof NewsroomConfidencePanelSchema>;

export const NewsroomClaimsTimelineSchema = z.object({
  beats: z
    .array(
      z.object({
        kind: NewsroomScriptBeatKindSchema,
        text: z.string().min(1).max(1500),
      }),
    )
    .max(20),
});
export type NewsroomClaimsTimeline = z.infer<typeof NewsroomClaimsTimelineSchema>;

export const NewsroomLowerThirdSchema = z.object({
  primary: z.string().min(1).max(200),
  secondary: z.string().min(1).max(200).nullable(),
});
export type NewsroomLowerThird = z.infer<typeof NewsroomLowerThirdSchema>;

export const NewsroomCameraPlanSchema = z.object({
  anchorMode: BroadcastBriefAnchorModeSchema,
  shots: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().min(1).max(300),
      }),
    )
    .max(20),
});
export type NewsroomCameraPlan = z.infer<typeof NewsroomCameraPlanSchema>;

/**
 * 4D cue suggestion. SAFETY: the `simulationOnly` literal is forced true
 * — there is no hardware-call payload field on this schema by design.
 * Any attempt to attach an executable / hardware payload (extra keys)
 * fails .strict() parse at the boundary.
 */
export const NewsroomFourDCueSchema = z
  .object({
    id: z.string().min(1).max(80),
    beat: NewsroomScriptBeatKindSchema,
    kind: z.enum(["rumble", "wind", "tilt", "flash", "scent"]),
    intensity: z.enum(["low", "medium", "high"]),
    reason: z.string().min(1).max(300),
    simulationOnly: z.literal(true),
  })
  .strict();
export type NewsroomFourDCue = z.infer<typeof NewsroomFourDCueSchema>;

export const NewsroomPackageSchema = z.object({
  id: z.string(),
  briefId: z.string(),
  ledWall: NewsroomLedWallSchema,
  sourcePanel: NewsroomSourcePanelSchema,
  confidencePanel: NewsroomConfidencePanelSchema,
  claimsTimeline: NewsroomClaimsTimelineSchema,
  ticker: z.string().min(1).max(280),
  lowerThird: NewsroomLowerThirdSchema,
  teleprompter: z.string().min(1).max(5000),
  cameraPlan: NewsroomCameraPlanSchema,
  fourDCues: z.array(NewsroomFourDCueSchema).max(20),
  status: NewsroomPackageStatusSchema,
  approvedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NewsroomPackage = z.infer<typeof NewsroomPackageSchema>;

/** Admin PATCH body — content fields only. Strict shape blocks extra keys. */
export const NewsroomPackagePatchSchema = z
  .object({
    ledWall: NewsroomLedWallSchema.optional(),
    sourcePanel: NewsroomSourcePanelSchema.optional(),
    confidencePanel: NewsroomConfidencePanelSchema.optional(),
    claimsTimeline: NewsroomClaimsTimelineSchema.optional(),
    ticker: z.string().min(1).max(280).optional(),
    lowerThird: NewsroomLowerThirdSchema.optional(),
    teleprompter: z.string().min(1).max(5000).optional(),
    cameraPlan: NewsroomCameraPlanSchema.optional(),
    fourDCues: z.array(NewsroomFourDCueSchema).max(20).optional(),
    status: NewsroomPackageStatusSchema.optional(),
  })
  .strict();
export type NewsroomPackagePatch = z.infer<typeof NewsroomPackagePatchSchema>;

export const AdminDecisionRequestSchema = z.object({
  subjectType: z.enum([
    "cluster",
    "claim",
    "verified_knowledge",
    "package",
    "manifest",
    "render_job",
  ]),
  subjectId: z.string().min(1),
  action: z.enum(["approve", "send_back", "reject", "dispute", "correction"]),
  reason: z.string().max(2000).optional(),
});
export type AdminDecisionRequest = z.infer<typeof AdminDecisionRequestSchema>;
