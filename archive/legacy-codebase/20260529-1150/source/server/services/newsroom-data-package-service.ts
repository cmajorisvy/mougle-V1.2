/**
 * Phase 1B — Verified Newsroom — Panel-shaped data-package generator.
 *
 * This module produces a UX-facing `NewsroomDataPackage` aimed at driving
 * the on-screen newsroom panels (anchor script, lower third, ticker, source
 * panel, map panel, timeline panel, market/data panel, event media,
 * confidence label, safety flags). It is intentionally separate from the
 * render-pipeline contract `NewsroomDataPackagePayload` in
 * `shared/newsroom-types.ts` (which is what the render baseline consumes).
 *
 * SAFETY:
 *   - Pure function. No DB I/O. No HTTP. No provider calls.
 *   - Never reads from `verified_*` tables (schema is migration-gated —
 *     see `shared/newsroom-schema.ts`).
 *   - Never invokes OpenAI, TTS, avatar, video, render, or social.
 *   - All publish / social / live / autonomous flags are literal-locked to
 *     `false`. `manualRootAdminTriggerOnly` and `internalAdminReviewOnly`
 *     are literal-locked to `true`.
 *   - When `VerifiedKnowledge` is unavailable, the generator falls back to
 *     a published `NewsArticle` and flags every missing field explicitly
 *     in `missingFields[]` rather than fabricating data.
 *
 * Deterministic contract:
 *   - No `Date.now()` / `Math.random()` reads inside the generator.
 *   - `generatedAt` and `packageIdSeed` (when needed) are caller-supplied.
 */

import type { NewsArticle } from "../../shared/schema";
import {
  type VerifiedKnowledge,
  type VerifiedMediaReference,
  type VerifiedTimelineEvent,
  type VerifiedClaim,
  type VerificationStatus,
  type ConfidenceLevel,
  type SourceReliabilityTier,
  type MediaKind,
  type RightsStatus,
  type TimelineEventType,
  confidenceLevelOf,
} from "../../shared/newsroom-types";

/* --------------------------------------------------------------------- */
/* Public contract                                                        */
/* --------------------------------------------------------------------- */

export interface AnchorScriptSegment {
  kind: "open" | "body" | "close";
  text: string;
}

export interface AnchorScript {
  segments: AnchorScriptSegment[];
  estimatedDurationMs: number;
}

export interface LowerThird {
  primary: string;
  secondary: string | null;
}

export interface SourcePanelSource {
  name: string;
  url: string | null;
  tier: SourceReliabilityTier | "unknown";
}

export interface SourcePanel {
  primarySource: SourcePanelSource | null;
  additionalSources: SourcePanelSource[];
  distinctSourceCount: number;
}

export interface MapPanel {
  primaryLocation: string | null;
  locations: string[];
}

export interface TimelinePanelEvent {
  occurredAt: string;
  summary: string;
  kind: TimelineEventType | "article_published";
}

export interface TimelinePanel {
  events: TimelinePanelEvent[];
}

export interface MarketOrDataPanel {
  metrics: { label: string; value: string }[];
}

export interface EventMedia {
  mediaId: string;
  kind: MediaKind;
  rightsStatus: RightsStatus;
  /**
   * `true` only when the media's rights are owned/licensed AND the
   * surrounding package is not in a blocking state. Caller MUST NOT
   * publish or transmit any item where `approved === false`.
   */
  approved: boolean;
  note: string | null;
  sourceUrl: string | null;
  storageKey: string | null;
}

export interface NewsroomSafetyFlags {
  publicPublishing: false;
  youtubeUpload: false;
  socialPosting: false;
  autonomousExecution: false;
  manualRootAdminTriggerOnly: true;
  internalAdminReviewOnly: true;
  nonPublishableReasons: string[];
}

export interface NewsroomDataPackage {
  packageId: string;
  source: "verified_knowledge" | "published_news_article";
  verifiedKnowledgeId: string | null;
  sourceArticleId: number | null;

  headline: string;
  shortHeadline: string;
  summary: string;
  anchorScript: AnchorScript;

  lowerThird: LowerThird;
  tickerItems: string[];
  sourcePanel: SourcePanel;
  mapPanel: MapPanel | null;
  timelinePanel: TimelinePanel | null;
  marketOrDataPanel: MarketOrDataPanel | null;
  eventMedia: EventMedia[];

  confidenceLabel: ConfidenceLevel | "unknown";
  verificationStatus: VerificationStatus;

  /**
   * Aggregate rights state across `eventMedia`. "all_clear" only when every
   * media item is `owned`/`licensed`. "no_media" when the package has no
   * eventMedia at all.
   */
  rightsStatus: "all_clear" | "needs_review" | "blocked" | "no_media";

  language: string | null;
  geo: string | null;

  safetyFlags: NewsroomSafetyFlags;
  missingFields: string[];
  generatedAt: string;
}

/* --------------------------------------------------------------------- */
/* Input variants                                                         */
/* --------------------------------------------------------------------- */

export type GenerateNewsroomDataPackageInput =
  | {
      kind: "verified";
      verifiedKnowledge: VerifiedKnowledge;
      mediaRefs?: VerifiedMediaReference[];
      timelineEvents?: VerifiedTimelineEvent[];
      /**
       * Full upstream workflow status. When omitted falls back to
       * `verifiedKnowledge.status`. Allows callers to surface states like
       * `verification_pending` / `rejected` that are not part of the
       * narrower `VerifiedKnowledgeStatus`.
       */
      workflowStatus?: VerificationStatus;
      language?: string | null;
      geo?: string | null;
      version?: number;
      generatedAt: string;
    }
  | {
      kind: "published_article";
      article: Pick<
        NewsArticle,
        | "id"
        | "title"
        | "summary"
        | "sourceName"
        | "sourceUrl"
        | "category"
        | "imageUrl"
        | "publishedAt"
        | "status"
      > &
        Partial<Pick<NewsArticle, "originalTitle" | "content" | "script">>;
      language?: string | null;
      geo?: string | null;
      version?: number;
      generatedAt: string;
    };

/* --------------------------------------------------------------------- */
/* Helpers                                                                */
/* --------------------------------------------------------------------- */

const MAX_HEADLINE = 120;
const MAX_SHORT_HEADLINE = 60;
const MAX_LOWER_PRIMARY = 80;
const MAX_LOWER_SECONDARY = 100;
const MAX_TICKER = 140;
const MAX_TICKER_ITEMS = 6;

function clamp(s: string, max: number): string {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](?:\s|$)/);
  return (m ? m[0] : text).trim();
}

function narrationMs(text: string): number {
  // ~15 chars/sec target read rate, 5 s floor.
  return Math.max(5000, Math.round((text.length / 15) * 1000));
}

function isoOrNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
  return null;
}

/* ---- VerifiedKnowledge-only extraction helpers ---- */

const LOCATION_HINTS = new Set([
  "United States",
  "USA",
  "U.S.",
  "Europe",
  "EU",
  "United Kingdom",
  "UK",
  "China",
  "India",
  "Japan",
  "Germany",
  "France",
  "Canada",
  "Brazil",
  "San Francisco",
  "New York",
  "London",
  "Paris",
  "Tokyo",
  "Beijing",
  "Berlin",
  "Washington",
  "Silicon Valley",
]);

function extractLocations(vk: VerifiedKnowledge): string[] {
  const haystack = [
    vk.canonicalTitle,
    vk.canonicalSummary,
    ...vk.keyFacts.map((f) => f.statement),
    ...vk.claims.map((c) => c.statement),
  ].join(" \n ");
  const found: string[] = [];
  for (const loc of LOCATION_HINTS) {
    if (haystack.includes(loc) && !found.includes(loc)) found.push(loc);
  }
  return found;
}

const METRIC_REGEX =
  /\b(\$?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|million|billion|trillion|tokens?|users?|MW|GW|TWh|kWh)?)\b/gi;

function extractMetrics(
  vk: VerifiedKnowledge,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const claim of vk.claims) {
    // Only include claims where we have a metric or numeric content AND
    // an explicit non-contradicted verdict.
    const candidates: { value: string; subject: string }[] = [];
    if (claim.metric) {
      candidates.push({
        value: claim.metric,
        subject: claim.subject ?? claim.statement,
      });
    } else {
      const matches = Array.from(claim.statement.matchAll(METRIC_REGEX)).map(
        (m) => m[1],
      );
      for (const v of matches.slice(0, 1)) {
        candidates.push({ value: v, subject: claim.subject ?? claim.statement });
      }
    }
    for (const c of candidates) {
      if (claim.verdict === "contradicted") continue;
      out.push({
        label: clamp(c.subject, 60),
        value: clamp(c.value, 40),
      });
      if (out.length >= 6) return out;
    }
  }
  return out;
}

function sourcesFromVK(vk: VerifiedKnowledge): SourcePanelSource[] {
  const byUrl = new Map<string, SourcePanelSource>();
  for (const claim of vk.claims) {
    for (const ev of claim.evidence) {
      try {
        const host = new URL(ev.url).hostname.replace(/^www\./, "");
        const key = host;
        if (!byUrl.has(key)) {
          byUrl.set(key, {
            name: ev.sourceName,
            url: ev.url,
            tier: ev.sourceTier,
          });
        }
      } catch {
        // malformed evidence URL — caller should have validated upstream
      }
    }
  }
  return Array.from(byUrl.values());
}

/* --------------------------------------------------------------------- */
/* Builders                                                               */
/* --------------------------------------------------------------------- */

function buildSafetyFlags(reasons: string[]): NewsroomSafetyFlags {
  return {
    publicPublishing: false as const,
    youtubeUpload: false as const,
    socialPosting: false as const,
    autonomousExecution: false as const,
    manualRootAdminTriggerOnly: true as const,
    internalAdminReviewOnly: true as const,
    nonPublishableReasons: reasons,
  };
}

function aggregateRights(media: EventMedia[]): NewsroomDataPackage["rightsStatus"] {
  if (media.length === 0) return "no_media";
  if (media.some((m) => m.rightsStatus === "blocked")) return "blocked";
  if (
    media.some(
      (m) =>
        m.rightsStatus === "fair_use_review" ||
        m.rightsStatus === "rights_unknown",
    )
  ) {
    return "needs_review";
  }
  return "all_clear";
}

function buildFromVerified(
  input: Extract<GenerateNewsroomDataPackageInput, { kind: "verified" }>,
): NewsroomDataPackage {
  const vk = input.verifiedKnowledge;
  const version = input.version ?? 1;
  const packageId = `nrpkg_vk_${vk.id}_v${version}`;
  const workflowStatus: VerificationStatus =
    input.workflowStatus ?? (vk.status as VerificationStatus);

  const missingFields: string[] = [];
  const reasons: string[] = [];

  // ---- Text fields ----
  const headline = clamp(vk.canonicalTitle, MAX_HEADLINE);
  const shortHeadline = clamp(vk.canonicalTitle, MAX_SHORT_HEADLINE);
  const summary = vk.canonicalSummary.trim();

  // ---- Anchor script (deterministic, no fabrication) ----
  const openLine =
    `Mougle verified update — ${shortHeadline}`.slice(0, 200);
  const bodyLine = firstSentence(summary) || summary.slice(0, 280);
  const supportLine = vk.keyFacts
    .slice(0, 3)
    .map((f) => f.statement)
    .join(" ");
  const closeLine =
    `This package is for internal review only. Verification status: ${workflowStatus}.`;
  const segments: AnchorScriptSegment[] = [
    { kind: "open", text: openLine },
    { kind: "body", text: [bodyLine, supportLine].filter(Boolean).join(" ").trim() },
    { kind: "close", text: closeLine },
  ];
  const estimatedDurationMs = segments.reduce(
    (acc, s) => acc + narrationMs(s.text),
    0,
  );

  // ---- Lower third ----
  const lowerThird: LowerThird = {
    primary: clamp(vk.canonicalTitle, MAX_LOWER_PRIMARY),
    secondary:
      vk.keyFacts.length > 0
        ? clamp(vk.keyFacts[0].statement, MAX_LOWER_SECONDARY)
        : null,
  };
  if (vk.keyFacts.length === 0) missingFields.push("keyFacts");

  // ---- Ticker ----
  const tickerItems = vk.keyFacts
    .slice(0, MAX_TICKER_ITEMS)
    .map((f) => clamp(f.statement, MAX_TICKER));

  // ---- Source panel ----
  const sources = sourcesFromVK(vk);
  const sourcePanel: SourcePanel = {
    primarySource: sources[0] ?? null,
    additionalSources: sources.slice(1),
    distinctSourceCount: sources.length,
  };
  if (sources.length === 0) missingFields.push("sources");

  // ---- Map panel ----
  const locs = extractLocations(vk);
  const mapPanel: MapPanel | null =
    locs.length > 0
      ? { primaryLocation: locs[0], locations: locs }
      : null;
  if (!mapPanel) missingFields.push("mapPanel");

  // ---- Timeline panel ----
  const tlEvents: TimelinePanelEvent[] = (input.timelineEvents ?? [])
    .slice()
    .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0))
    .map((e) => ({
      occurredAt: e.occurredAt,
      summary: clamp(e.summary, 280),
      kind: e.eventType,
    }));
  const timelinePanel: TimelinePanel | null =
    tlEvents.length > 0 ? { events: tlEvents } : null;
  if (!timelinePanel) missingFields.push("timelinePanel");

  // ---- Market / data panel ----
  const metrics = extractMetrics(vk);
  const marketOrDataPanel: MarketOrDataPanel | null =
    metrics.length > 0 ? { metrics } : null;
  if (!marketOrDataPanel) missingFields.push("marketOrDataPanel");

  // ---- Event media ----
  const eventMedia: EventMedia[] = (input.mediaRefs ?? []).map((m) => {
    const approvedRights =
      m.rightsStatus === "owned" || m.rightsStatus === "licensed";
    return {
      mediaId: m.id,
      kind: m.kind,
      rightsStatus: m.rightsStatus,
      approved: approvedRights, // package-level may flip this off below
      note: m.rightsNote ?? null,
      sourceUrl: m.sourceUrl ?? null,
      storageKey: m.storageKey ?? null,
    };
  });
  if (eventMedia.length === 0) missingFields.push("eventMedia");

  // ---- Confidence label ----
  const confidenceLabel: ConfidenceLevel = confidenceLevelOf(
    vk.confidence.aggregate,
  );

  // ---- Rights aggregate ----
  const rightsStatus = aggregateRights(eventMedia);

  // ---- Non-publishable reasons + final media gate ----
  if (workflowStatus === "rejected") reasons.push("workflow_rejected");
  if (
    workflowStatus !== "verified" &&
    workflowStatus !== "developing" &&
    workflowStatus !== "disputed" &&
    workflowStatus !== "correction"
  ) {
    // raw / clustered / extracting_claims / verification_pending
    reasons.push(`workflow_not_approved:${workflowStatus}`);
  }
  if (vk.status === "disputed") reasons.push("story_disputed");
  if (vk.status === "developing") reasons.push("story_developing");
  if (rightsStatus === "blocked") reasons.push("media_rights_blocked");
  if (rightsStatus === "needs_review") reasons.push("media_rights_review");
  if (vk.confidence.aggregate < 0.5) reasons.push("low_aggregate_confidence");

  // If the surrounding package is non-publishable, no individual media may
  // be marked approved — defensive double-lock.
  if (reasons.length > 0) {
    for (const m of eventMedia) m.approved = false;
  }

  return {
    packageId,
    source: "verified_knowledge",
    verifiedKnowledgeId: vk.id,
    sourceArticleId: null,
    headline,
    shortHeadline,
    summary,
    anchorScript: { segments, estimatedDurationMs },
    lowerThird,
    tickerItems,
    sourcePanel,
    mapPanel,
    timelinePanel,
    marketOrDataPanel,
    eventMedia,
    confidenceLabel,
    verificationStatus: workflowStatus,
    rightsStatus,
    language: input.language ?? null,
    geo: input.geo ?? null,
    safetyFlags: buildSafetyFlags(reasons),
    missingFields,
    generatedAt: input.generatedAt,
  };
}

function buildFromPublishedArticle(
  input: Extract<GenerateNewsroomDataPackageInput, { kind: "published_article" }>,
): NewsroomDataPackage {
  const a = input.article;
  const version = input.version ?? 1;
  const packageId = `nrpkg_art_${a.id}_v${version}`;
  const missingFields: string[] = [];
  const reasons: string[] = [
    // Published-article path has no claim-level verification — always treat
    // as non-publishable from this generator. Any publishing decision must
    // come from a separate, manually-gated path.
    "fallback_unverified_source",
  ];

  const title = (a.title ?? "").trim();
  if (!title) missingFields.push("title");
  const headline = clamp(title || "Untitled article", MAX_HEADLINE);
  const shortHeadline = clamp(title || "Untitled", MAX_SHORT_HEADLINE);

  const summary = (a.summary ?? "").trim();
  if (!summary) missingFields.push("summary");

  // ---- Anchor script ----
  const bodyText = summary || a.content?.slice(0, 600) || a.originalTitle || title;
  const openLine = `Mougle news brief — ${shortHeadline || "Untitled"}`;
  const closeLine =
    "This brief originates from an unverified published source. Internal review required before any further use.";
  const segments: AnchorScriptSegment[] = [
    { kind: "open", text: openLine },
    { kind: "body", text: bodyText || "(no content available)" },
    { kind: "close", text: closeLine },
  ];
  const estimatedDurationMs = segments.reduce(
    (acc, s) => acc + narrationMs(s.text),
    0,
  );

  // ---- Lower third / ticker ----
  const lowerThird: LowerThird = {
    primary: clamp(title || "Untitled", MAX_LOWER_PRIMARY),
    secondary: a.sourceName ? clamp(a.sourceName, MAX_LOWER_SECONDARY) : null,
  };
  const tickerItems = title
    ? [clamp(title, MAX_TICKER)]
    : [];
  if (tickerItems.length === 0) missingFields.push("tickerItems");

  // ---- Source panel ----
  const primary: SourcePanelSource | null = a.sourceName
    ? {
        name: a.sourceName,
        url: a.sourceUrl ?? null,
        tier: "unknown",
      }
    : null;
  if (!primary) missingFields.push("sourcePanel.primarySource");
  const sourcePanel: SourcePanel = {
    primarySource: primary,
    additionalSources: [],
    distinctSourceCount: primary ? 1 : 0,
  };

  // ---- Map / market panels — published-article path has no structured data ----
  missingFields.push("mapPanel", "marketOrDataPanel");

  // ---- Timeline panel from publishedAt only ----
  const publishedIso = isoOrNull(a.publishedAt);
  const timelinePanel: TimelinePanel | null = publishedIso
    ? {
        events: [
          {
            occurredAt: publishedIso,
            summary: clamp(title || "Article published", 280),
            kind: "article_published",
          },
        ],
      }
    : null;
  if (!timelinePanel) missingFields.push("timelinePanel");

  // ---- Event media: only from imageUrl, always non-approved on this path ----
  const eventMedia: EventMedia[] = [];
  if (a.imageUrl) {
    eventMedia.push({
      mediaId: `art_${a.id}_hero`,
      kind: "image",
      rightsStatus: "rights_unknown",
      approved: false,
      note: "Origin: unverified published article hero image. Rights unknown.",
      sourceUrl: a.imageUrl,
      storageKey: null,
    });
  }
  if (eventMedia.length === 0) missingFields.push("eventMedia");

  const rightsStatus =
    eventMedia.length === 0 ? "no_media" : "needs_review";
  if (rightsStatus === "needs_review") reasons.push("media_rights_review");

  // ---- Status mapping ----
  // News-article status enum is free-form text (e.g. "raw" / "published");
  // anything other than verified-newsroom statuses collapses to "raw" here.
  const articleStatus = (a.status ?? "raw").trim();
  const verificationStatus: VerificationStatus =
    articleStatus === "verified" ? "verified" : "raw";

  return {
    packageId,
    source: "published_news_article",
    verifiedKnowledgeId: null,
    sourceArticleId: a.id,
    headline,
    shortHeadline,
    summary: summary || "(summary not available)",
    anchorScript: { segments, estimatedDurationMs },
    lowerThird,
    tickerItems,
    sourcePanel,
    mapPanel: null,
    timelinePanel,
    marketOrDataPanel: null,
    eventMedia,
    confidenceLabel: "unknown",
    verificationStatus,
    rightsStatus,
    language: input.language ?? null,
    geo: input.geo ?? null,
    safetyFlags: buildSafetyFlags(reasons),
    missingFields,
    generatedAt: input.generatedAt,
  };
}

/* --------------------------------------------------------------------- */
/* Public entrypoint                                                      */
/* --------------------------------------------------------------------- */

export function generateNewsroomDataPackage(
  input: GenerateNewsroomDataPackageInput,
): NewsroomDataPackage {
  if (input.kind === "verified") return buildFromVerified(input);
  return buildFromPublishedArticle(input);
}
