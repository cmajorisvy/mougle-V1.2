/**
 * TypeScript mirror of the Pydantic contracts in
 * `python-workers/shared/contracts.py` and the JobType enum in
 * `python-workers/jobs/job_types.py`.
 *
 * THIS FILE IS THE WIRE FORMAT between the TypeScript orchestrator and the
 * Python worker layer. Any change here MUST be reflected on the Python side
 * (and vice versa). A codegen step can be added later if drift becomes a
 * concern.
 *
 * Design rules:
 * - The frontend never sees raw envelopes — it only sees the lightweight
 *   `AiJobView` returned by `/api/ai-jobs/:id`.
 * - The TypeScript API is the permission gate. This file ships defensive
 *   helpers (`USER_JOB_TYPES`, `INHOUSE_JOB_TYPES`) so callers can verify the
 *   origin matches the job type before enqueueing.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const JobOrigin = {
  USER: "user",
  INHOUSE: "inhouse",
} as const;
export type JobOrigin = (typeof JobOrigin)[keyof typeof JobOrigin];

export const JobStatus = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  REJECTED: "rejected",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

/** Mirror of `python-workers/jobs/job_types.py::JobType`. Keep strings stable. */
export const JobType = {
  // user-facing agents
  USER_RESEARCH: "user.research",
  USER_CLAIM_EXTRACTION: "user.claim_extraction",
  USER_SUMMARY: "user.summary",
  USER_MEDIA_ANALYSIS: "user.media_analysis",
  USER_REPORT: "user.report",
  // in-house agents
  INHOUSE_NEWSROOM: "inhouse.newsroom",
  INHOUSE_QUALITY_EVAL: "inhouse.quality_eval",
  INHOUSE_SOURCE_CREDIBILITY: "inhouse.source_credibility",
  INHOUSE_DUPLICATE_DETECTION: "inhouse.duplicate_detection",
  INHOUSE_SYSTEM_MONITORING: "inhouse.system_monitoring",
  INHOUSE_MODEL_BENCHMARK: "inhouse.model_benchmark",
  // supporting pipelines (either origin allowed)
  VECTOR_EMBEDDINGS: "vector.embeddings",
  VECTOR_SEARCH: "vector.search",
  VECTOR_CLUSTERING: "vector.clustering",
  MEDIA_AUDIO_VIDEO_ML: "media.audio_video_ml",
  MEDIA_COMPUTER_VISION: "media.computer_vision",
  MEDIA_TRANSCRIPTION: "media.transcription",
  EVAL_LLM_RUN: "eval.llm_run",
  EVAL_SCORING: "eval.scoring",
  EVAL_BENCHMARK: "eval.benchmark",
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const USER_JOB_TYPES: ReadonlySet<JobType> = new Set<JobType>([
  JobType.USER_RESEARCH,
  JobType.USER_CLAIM_EXTRACTION,
  JobType.USER_SUMMARY,
  JobType.USER_MEDIA_ANALYSIS,
  JobType.USER_REPORT,
]);

export const INHOUSE_JOB_TYPES: ReadonlySet<JobType> = new Set<JobType>([
  JobType.INHOUSE_NEWSROOM,
  JobType.INHOUSE_QUALITY_EVAL,
  JobType.INHOUSE_SOURCE_CREDIBILITY,
  JobType.INHOUSE_DUPLICATE_DETECTION,
  JobType.INHOUSE_SYSTEM_MONITORING,
  JobType.INHOUSE_MODEL_BENCHMARK,
]);

// ---------------------------------------------------------------------------
// Envelope + result schemas (Zod for runtime validation)
// ---------------------------------------------------------------------------

export const jobProvenanceSchema = z.object({
  origin: z.enum([JobOrigin.USER, JobOrigin.INHOUSE]),
  requestedByUserId: z.string().nullable().optional(),
  requestedByAdminId: z.string().nullable().optional(),
  requestId: z.string().min(1),
  enqueuedAt: z.string().datetime(),
});
export type JobProvenance = z.infer<typeof jobProvenanceSchema>;

export const jobEnvelopeSchema = z.object({
  jobId: z.string().min(1),
  jobType: z.string().min(1),
  provenance: jobProvenanceSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  priority: z.number().int().default(0),
});
export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

export const jobResultSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum([
    JobStatus.PENDING,
    JobStatus.RUNNING,
    JobStatus.SUCCEEDED,
    JobStatus.FAILED,
    JobStatus.REJECTED,
  ]),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  metrics: z.record(z.string(), z.unknown()).default({}),
});
export type JobResult = z.infer<typeof jobResultSchema>;

// ---------------------------------------------------------------------------
// Typed payloads for the three initial integrations
// ---------------------------------------------------------------------------

// Hard caps for claim-extraction inputs. Enforced at the schema layer so
// every route — typed wrappers, the generic /api/ai-jobs/claim-extraction
// endpoint, the per-post route — gets the same protection.
export const CLAIM_EXTRACTION_MAX_TEXT_CHARS = 50_000;
export const CLAIM_EXTRACTION_MAX_ARTICLES = 50;

const claimExtractionArticleInputSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(CLAIM_EXTRACTION_MAX_TEXT_CHARS),
  title: z.string().max(500).optional(),
});

export const claimExtractionPayloadSchema = z
  .object({
    jobKind: z.literal("claim_extraction").default("claim_extraction"),
    // Either `articleIds` (lookup-only, worker needs the TS side to attach
    // text before enqueueing) OR `articles` (text-attached, what the
    // per-content routes use). At least one must be supplied.
    articleIds: z.array(z.string().min(1)).max(CLAIM_EXTRACTION_MAX_ARTICLES).optional(),
    articles: z.array(claimExtractionArticleInputSchema).max(CLAIM_EXTRACTION_MAX_ARTICLES).optional(),
    clusterId: z.string().min(1).optional(),
    maxClaimsPerArticle: z.number().int().min(1).max(32).default(8),
  })
  .superRefine((val, ctx) => {
    const hasIds = !!val.articleIds && val.articleIds.length > 0;
    const hasArticles = !!val.articles && val.articles.length > 0;
    if (!hasIds && !hasArticles) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either `articleIds` or `articles` with at least one item",
        path: ["articles"],
      });
    }
  });
export type ClaimExtractionPayload = z.infer<typeof claimExtractionPayloadSchema>;

// Hard caps for semantic-clustering inputs.
export const CLUSTERING_MAX_ITEM_TEXT_CHARS = 25_000;
export const CLUSTERING_MAX_ITEMS = 500;
export const CLUSTERING_MIN_ITEMS = 2;

const clusteringDocumentInputSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(CLUSTERING_MAX_ITEM_TEXT_CHARS),
  title: z.string().max(500).optional(),
  sourceType: z.string().max(40).optional(),
  sourceRef: z.string().max(200).optional(),
});

export const semanticClusteringPayloadSchema = z
  .object({
    jobKind: z.literal("semantic_clustering").default("semantic_clustering"),
    // Either `documentIds` (lookup-only — worker has no text) OR
    // `documents:[{id,text,title?,sourceType?,sourceRef?}]` (text-attached,
    // what the content-bound routes use). At least 2 items total are
    // required across both fields combined.
    documentIds: z.array(z.string().min(1)).max(CLUSTERING_MAX_ITEMS).optional(),
    documents: z.array(clusteringDocumentInputSchema).max(CLUSTERING_MAX_ITEMS).optional(),
    distanceThreshold: z.number().min(0).max(1).default(0.55),
  })
  .superRefine((val, ctx) => {
    const idCount = val.documentIds?.length ?? 0;
    const docCount = val.documents?.length ?? 0;
    if (idCount + docCount < CLUSTERING_MIN_ITEMS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Provide at least ${CLUSTERING_MIN_ITEMS} items across \`documentIds\` and \`documents\``,
        path: ["documents"],
      });
    }
    if (idCount + docCount > CLUSTERING_MAX_ITEMS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `At most ${CLUSTERING_MAX_ITEMS} items allowed`,
        path: ["documents"],
      });
    }
  });
export type SemanticClusteringPayload = z.infer<
  typeof semanticClusteringPayloadSchema
>;

// Hard caps for newsroom-package inputs.
export const NEWSROOM_MAX_ARTICLES = 100;
export const NEWSROOM_MAX_CLAIMS = 500;
export const NEWSROOM_MAX_CLUSTERS = 100;
export const NEWSROOM_MAX_ARTICLE_TEXT_CHARS = 25_000;

const newsroomArticleInputSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(NEWSROOM_MAX_ARTICLE_TEXT_CHARS),
  title: z.string().max(500).optional(),
  source: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  sourceType: z.string().max(40).optional(),
  sourceRef: z.string().max(200).optional(),
});

// Claims and clusters are forwarded as-is from prior job results. They are
// structurally typed by the Python handler; we only enforce that ids exist.
const newsroomClaimInputSchema = z
  .object({ claim_id: z.string().optional(), text: z.string().optional() })
  .passthrough();
const newsroomClusterInputSchema = z
  .object({ cluster_id: z.string().optional(), label: z.string().optional() })
  .passthrough();

export const newsroomPackagePayloadSchema = z
  .object({
    jobKind: z.literal("newsroom_package").default("newsroom_package"),
    // Optional anchor to a verified-knowledge entity. Previously required;
    // now optional because the package can be generated from ad-hoc inputs
    // (posts, prior job results, direct admin sources) with no anchor.
    verifiedKnowledgeId: z.string().min(1).optional(),
    templateId: z.string().min(1).default("news_desk"),
    articles: z.array(newsroomArticleInputSchema).max(NEWSROOM_MAX_ARTICLES).optional(),
    claims: z.array(newsroomClaimInputSchema).max(NEWSROOM_MAX_CLAIMS).optional(),
    clusters: z.array(newsroomClusterInputSchema).max(NEWSROOM_MAX_CLUSTERS).optional(),
  })
  .superRefine((val, ctx) => {
    const total =
      (val.articles?.length ?? 0) +
      (val.claims?.length ?? 0) +
      (val.clusters?.length ?? 0);
    if (!val.verifiedKnowledgeId && total === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide `verifiedKnowledgeId` or at least one of `articles`, `claims`, `clusters`",
        path: ["articles"],
      });
    }
  });
export type NewsroomPackagePayload = z.infer<typeof newsroomPackagePayloadSchema>;

// ---------------------------------------------------------------------------
// Frontend-safe view of a job (no payload internals)
// ---------------------------------------------------------------------------

export interface AiJobView {
  jobId: string;
  jobType: string;
  origin: JobOrigin;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  durationMs?: number | null;
}
