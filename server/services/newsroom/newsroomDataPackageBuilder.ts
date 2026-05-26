/**
 * Phase 1B — Verified Newsroom — Pure data-package builder.
 *
 * SAFETY:
 *   - Pure function. No DB I/O. No HTTP. No provider calls.
 *   - Does NOT read from or write to `verified_*` tables (schema is still
 *     migration-gated — see `shared/newsroom-schema.ts`).
 *   - Does NOT invoke OpenAI, TTS, avatar, video, render, or social.
 *   - Forces `publicPublishing`, `youtubeUpload`, `socialPosting` to false
 *     and emits an `internalAdminReviewOnly` / `manualRootAdminTriggerOnly`
 *     safety envelope on every output.
 *   - Rejects `rejected` / unapproved input unless `previewMode === true`.
 *
 * Grounded in:
 *   - docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md §§9–13
 *   - shared/newsroom-types.ts (contracts)
 */

import {
  NewsroomDataPackagePayloadSchema,
  NewsroomSafetyNotesSchema,
  type NewsroomDataPackagePayload,
  type NewsroomSafetyNotes,
  type PackageTemplate,
  type VerificationStatus,
  type VerifiedKnowledge,
  type VerifiedMediaReference,
  type VerifiedTimelineEvent,
  type ComplianceFinding,
  type ClaimVerdict,
} from "../../../shared/newsroom-types";

/* --------------------------------------------------------------------- */
/* Public types                                                           */
/* --------------------------------------------------------------------- */

export interface NewsroomPackageBuildInput {
  verifiedKnowledge: VerifiedKnowledge;
  mediaRefs?: VerifiedMediaReference[];
  timelineEvents?: VerifiedTimelineEvent[];
  template?: PackageTemplate;
  version?: number;
  /** ISO timestamp used as `generatedAt` and to seed all *Ms values. */
  generatedAt: string;
  /**
   * Full upstream workflow status (may include `rejected`,
   * `verification_pending`, etc — values outside of
   * `VerifiedKnowledgeStatus`). When omitted, falls back to
   * `verifiedKnowledge.status`.
   */
  workflowStatus?: VerificationStatus;
  /**
   * When true, the builder will still produce a payload for `rejected`
   * or unapproved input so admins can inspect it. The output is still
   * marked non-publishable and the safety envelope still forces all
   * publish/social/live flags to false.
   */
  previewMode?: boolean;
}

export interface NewsroomPackageBuildResult {
  payload: NewsroomDataPackagePayload;
  safetyNotes: NewsroomSafetyNotes;
  /** Pass-through, preserved verbatim from input.timelineEvents. */
  timelineEvents: VerifiedTimelineEvent[];
  /**
   * False whenever the data has any blocking finding, status is
   * developing/disputed/rejected, or any media has rights=blocked.
   * Note: publishable=true NEVER implies the package may be auto-published.
   * It only means there are no blocking findings. The safety envelope
   * still requires manual root-admin action downstream.
   */
  publishable: boolean;
  /** Reason for non-publishable, or "ok". */
  publishableReason: string;
}

export class NewsroomPackageRejectedError extends Error {
  constructor(public readonly status: VerificationStatus, message: string) {
    super(message);
    this.name = "NewsroomPackageRejectedError";
  }
}

/* --------------------------------------------------------------------- */
/* Gate helpers                                                           */
/* --------------------------------------------------------------------- */

const NON_BUILDABLE_STATUSES: ReadonlySet<VerificationStatus> = new Set([
  "raw",
  "clustered",
  "extracting_claims",
  "verification_pending",
  "rejected",
]);

const NON_PUBLISHABLE_KK_STATUSES: ReadonlySet<string> = new Set([
  "developing",
  "disputed",
]);

function effectiveStatus(input: NewsroomPackageBuildInput): VerificationStatus {
  return input.workflowStatus ?? (input.verifiedKnowledge.status as VerificationStatus);
}

/* --------------------------------------------------------------------- */
/* Safety-notes derivation (pure)                                         */
/* --------------------------------------------------------------------- */

export function deriveNewsroomSafetyNotes(
  input: NewsroomPackageBuildInput,
): NewsroomSafetyNotes {
  const blockingFindings: ComplianceFinding[] = [];
  const warningFindings: ComplianceFinding[] = [];
  const rightsIssues: NewsroomSafetyNotes["rightsIssues"] = [];

  const status = effectiveStatus(input);
  const vk = input.verifiedKnowledge;

  if (status === "rejected") {
    blockingFindings.push({
      level: "blocking",
      code: "WORKFLOW_REJECTED",
      message:
        "Upstream workflow marked this data as rejected. Package is for admin inspection only.",
    });
  } else if (NON_BUILDABLE_STATUSES.has(status)) {
    blockingFindings.push({
      level: "blocking",
      code: "WORKFLOW_NOT_APPROVED",
      message: `Workflow status "${status}" is not approved for packaging.`,
    });
  }

  if (vk.status === "developing") {
    warningFindings.push({
      level: "warning",
      code: "STORY_DEVELOPING",
      message:
        "Story is still developing. Treat as non-publishable; facts may change.",
    });
  }
  if (vk.status === "disputed") {
    blockingFindings.push({
      level: "blocking",
      code: "STORY_DISPUTED",
      message: "Story is disputed across sources. Non-publishable.",
    });
  }
  if (vk.status === "correction") {
    warningFindings.push({
      level: "warning",
      code: "STORY_CORRECTION",
      message: "This package supersedes a prior version with a correction.",
    });
  }

  for (const m of input.mediaRefs ?? []) {
    if (m.rightsStatus === "blocked") {
      blockingFindings.push({
        level: "blocking",
        code: "MEDIA_RIGHTS_BLOCKED",
        message: `Media ${m.id} is rights-blocked and must not be used.`,
        context: { mediaId: m.id },
      });
      rightsIssues.push({
        mediaId: m.id,
        rightsStatus: m.rightsStatus,
        note: m.rightsNote ?? "Blocked: do not use.",
      });
    } else if (m.rightsStatus === "fair_use_review" || m.rightsStatus === "rights_unknown") {
      warningFindings.push({
        level: "warning",
        code: "MEDIA_RIGHTS_REVIEW",
        message: `Media ${m.id} requires rights review (${m.rightsStatus}).`,
        context: { mediaId: m.id },
      });
      rightsIssues.push({
        mediaId: m.id,
        rightsStatus: m.rightsStatus,
        note: m.rightsNote ?? `Requires review: ${m.rightsStatus}.`,
      });
    }
  }

  // Low overall confidence is a warning, not blocking — the gate is verdict /
  // status / rights, not the numeric score.
  if (vk.confidence.aggregate < 0.5) {
    warningFindings.push({
      level: "warning",
      code: "LOW_AGGREGATE_CONFIDENCE",
      message: `Aggregate confidence ${vk.confidence.aggregate.toFixed(2)} is below 0.5.`,
    });
  }

  return NewsroomSafetyNotesSchema.parse({
    internalAdminReviewOnly: true as const,
    manualRootAdminTriggerOnly: true as const,
    publicPublishing: false as const,
    youtubeUpload: false as const,
    socialPosting: false as const,
    blockingFindings,
    warningFindings,
    rightsIssues,
  });
}

/* --------------------------------------------------------------------- */
/* Helpers                                                                */
/* --------------------------------------------------------------------- */

function clampText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

function deriveSubtitle(summary: string): string {
  const first = summary.split(/(?<=[.!?])\s+/)[0] ?? summary;
  return clampText(first, 120);
}

function narrationDurationMs(text: string): number {
  // ~15 chars/sec target read rate, 5s floor.
  const ms = Math.round((text.length / 15) * 1000);
  return Math.max(5000, ms);
}

function verdictOrNeedsReview(v: ClaimVerdict | null | undefined): ClaimVerdict {
  return v ?? "needs_human_review";
}

function mediaUsageFor(
  kind: VerifiedMediaReference["kind"],
): "background" | "insert" | "lower_third_logo" {
  if (kind === "image") return "background";
  if (kind === "clip") return "insert";
  // chart
  return "insert";
}

/* --------------------------------------------------------------------- */
/* Main entry — buildNewsroomDataPackage                                  */
/* --------------------------------------------------------------------- */

export function buildNewsroomDataPackage(
  input: NewsroomPackageBuildInput,
): NewsroomPackageBuildResult {
  const status = effectiveStatus(input);

  // Gate: reject unapproved/rejected input outside of preview mode.
  if (!input.previewMode && NON_BUILDABLE_STATUSES.has(status)) {
    throw new NewsroomPackageRejectedError(
      status,
      `Refusing to build package for workflow status "${status}". ` +
        `Pass previewMode: true to inspect rejected/unapproved data.`,
    );
  }

  const vk = input.verifiedKnowledge;
  const template: PackageTemplate = input.template ?? "news_desk";
  const version = input.version ?? 1;
  const generatedAt = input.generatedAt;

  const safetyNotes = deriveNewsroomSafetyNotes(input);

  // ---- Title block ----
  const title = clampText(vk.canonicalTitle, 80);
  const subtitle = deriveSubtitle(vk.canonicalSummary);
  const headlineText = clampText(vk.canonicalTitle, 120);
  const headlineDurationMs = 4000;

  // ---- Lower thirds: derived from up to 3 key facts ----
  const lowerThirds = vk.keyFacts.slice(0, 3).map((f, i) => {
    const startMs = i * 6000;
    return {
      text: clampText(f.statement, 120),
      startMs,
      endMs: startMs + 5000,
    };
  });

  // ---- Ticker items: derived from up to 6 key facts ----
  const tickerItems = vk.keyFacts.slice(0, 6).map((f) => ({
    text: clampText(f.statement, 140),
  }));

  // ---- Segments ----
  const segments = [
    {
      segmentIndex: 0,
      scriptType: "two_minute" as const,
      narrationText: clampText(vk.canonicalSummary, 4000),
      keyFactIndex: vk.keyFacts.length > 0 ? 0 : null,
      durationMs: narrationDurationMs(vk.canonicalSummary),
    },
  ];

  // ---- Source / evidence references ----
  const sourceEvidenceReferences: NewsroomDataPackagePayload["sourceEvidenceReferences"] =
    [];
  for (const claim of vk.claims) {
    for (const ev of claim.evidence) {
      sourceEvidenceReferences.push({
        label: clampText(`${ev.sourceName}: ${claim.statement}`, 120),
        url: ev.url,
        claimId: claim.id,
        confidenceScore: claim.verdictConfidence,
        status: verdictOrNeedsReview(claim.verdict),
      });
    }
  }

  // ---- Media references ----
  const mediaRefs = (input.mediaRefs ?? []).map((m) => ({
    mediaId: m.id,
    usage: mediaUsageFor(m.kind),
    rightsStatus: m.rightsStatus,
  }));

  // ---- Compliance / safety labels (surface for the payload itself) ----
  const complianceNotes: string[] = [];
  for (const f of [...safetyNotes.blockingFindings, ...safetyNotes.warningFindings]) {
    complianceNotes.push(`[${f.level.toUpperCase()}] ${f.code}: ${f.message}`);
  }

  const safetyLabels: string[] = ["INTERNAL_PREVIEW_ONLY"];
  if (vk.status === "developing") safetyLabels.push("DEVELOPING_STORY");
  if (vk.status === "disputed") safetyLabels.push("DISPUTED_STORY");
  if (vk.status === "correction") safetyLabels.push("CORRECTION");
  if (status === "rejected") safetyLabels.push("REJECTED_BY_WORKFLOW");
  if (safetyNotes.blockingFindings.length > 0) {
    safetyLabels.push("NON_PUBLISHABLE");
  }

  const rawPayload: NewsroomDataPackagePayload = {
    verifiedKnowledgeId: vk.id,
    version,
    template,
    title,
    subtitle,
    headline: { text: headlineText, durationMs: headlineDurationMs },
    lowerThirds,
    tickerItems,
    segments,
    sourceEvidenceReferences,
    mediaRefs,
    complianceNotes,
    safetyLabels,
    generatedAt,
  };

  // Final shape check — throws if we ever produced an invalid payload.
  const payload = NewsroomDataPackagePayloadSchema.parse(rawPayload);

  // ---- Publishable gate ----
  let publishable = true;
  let publishableReason = "ok";
  if (safetyNotes.blockingFindings.length > 0) {
    publishable = false;
    publishableReason =
      safetyNotes.blockingFindings.map((f) => f.code).join(",") || "blocked";
  } else if (NON_PUBLISHABLE_KK_STATUSES.has(vk.status)) {
    publishable = false;
    publishableReason = `verified_knowledge_status:${vk.status}`;
  }

  return {
    payload,
    safetyNotes,
    timelineEvents: input.timelineEvents ?? [],
    publishable,
    publishableReason,
  };
}

/* --------------------------------------------------------------------- */
/* Validators / summarisers                                               */
/* --------------------------------------------------------------------- */

export function validateNewsroomDataPackage(
  payload: unknown,
):
  | { ok: true; payload: NewsroomDataPackagePayload }
  | { ok: false; issues: { path: (string | number)[]; message: string }[] } {
  const parsed = NewsroomDataPackagePayloadSchema.safeParse(payload);
  if (parsed.success) return { ok: true, payload: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      path: i.path as (string | number)[],
      message: i.message,
    })),
  };
}

export interface PackageVerificationSummary {
  verifiedKnowledgeId: string;
  template: PackageTemplate;
  version: number;
  claimCount: number;
  evidenceCount: number;
  distinctSources: number;
  mediaCount: number;
  blockingFindingCount: number;
  warningFindingCount: number;
  safetyLabels: string[];
  publicPublishing: false;
  youtubeUpload: false;
  socialPosting: false;
}

export function summarizePackageVerification(
  result: NewsroomPackageBuildResult,
): PackageVerificationSummary {
  const { payload, safetyNotes } = result;
  const sources = new Set<string>();
  for (const ref of payload.sourceEvidenceReferences) {
    try {
      sources.add(new URL(ref.url).hostname.replace(/^www\./, ""));
    } catch {
      /* ignore malformed — schema would have rejected upstream */
    }
  }
  return {
    verifiedKnowledgeId: payload.verifiedKnowledgeId,
    template: payload.template,
    version: payload.version,
    claimCount: new Set(payload.sourceEvidenceReferences.map((r) => r.claimId))
      .size,
    evidenceCount: payload.sourceEvidenceReferences.length,
    distinctSources: sources.size,
    mediaCount: payload.mediaRefs.length,
    blockingFindingCount: safetyNotes.blockingFindings.length,
    warningFindingCount: safetyNotes.warningFindings.length,
    safetyLabels: payload.safetyLabels,
    publicPublishing: false as const,
    youtubeUpload: false as const,
    socialPosting: false as const,
  };
}
