import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateNewsroomDataPackage,
  type GenerateNewsroomDataPackageInput,
  type NewsroomDataPackage,
} from "../server/services/newsroom-data-package-service";
import type {
  VerifiedKnowledge,
  VerifiedMediaReference,
  VerifiedTimelineEvent,
} from "../shared/newsroom-types";

const ISO = "2026-05-16T12:00:00.000Z";

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeVK(overrides: Partial<VerifiedKnowledge> = {}): VerifiedKnowledge {
  return {
    id: "vk_001",
    clusterId: "cl_001",
    status: "verified",
    canonicalTitle: "OpenAI releases GPT-5.5 with 1M token context in San Francisco",
    canonicalSummary:
      "OpenAI released GPT-5.5 with a one-million token context window. The release happened in San Francisco on 2026-05-15. Benchmarks improved across coding and reasoning.",
    keyFacts: [
      {
        statement: "GPT-5.5 supports a 1,000,000 token context window.",
        derivedFromClaimIds: ["c1"],
        confidence: 0.85,
      },
      {
        statement: "Release announced on 2026-05-15 in San Francisco.",
        derivedFromClaimIds: ["c2"],
        confidence: 0.9,
      },
    ],
    claims: [
      {
        id: "c1",
        clusterId: "cl_001",
        verifiedKnowledgeId: "vk_001",
        statement: "GPT-5.5 supports a 1000000 token context window.",
        subject: "GPT-5.5 context window",
        metric: "1000000 tokens",
        verdict: "supported",
        verdictConfidence: 0.85,
        supportCount: 2,
        contradictionCount: 0,
        evidence: [
          {
            url: "https://openai.com/blog/gpt-5-5",
            sourceName: "OpenAI Blog",
            sourceTier: "tier_a",
            supports: true,
            reliabilitySnapshot: 0.9,
          },
          {
            url: "https://techcrunch.com/2026/05/15/gpt-5-5",
            sourceName: "TechCrunch",
            sourceTier: "tier_b",
            supports: true,
            reliabilitySnapshot: 0.7,
          },
        ],
      },
    ],
    confidence: {
      aggregate: 0.82,
      claimSupport: 0.85,
      sourceDiversity: 0.8,
      sourceReliabilityAvg: 0.8,
      contradictionPenalty: 0,
      ageDecay: 0.95,
      computedAt: ISO,
      formulaVersion: "v1",
    },
    sourceCoverage: {
      distinctSources: 2,
      tierBreakdown: { tier_a: 1, tier_b: 1, tier_c: 0, untrusted: 0 },
      earliestPublishedAt: "2026-05-15T10:00:00.000Z",
      latestPublishedAt: "2026-05-15T11:00:00.000Z",
    },
    approvedBy: "root_admin",
    approvedAt: ISO,
    supersededByVerifiedId: null,
    ...overrides,
  };
}

function makeMedia(o: Partial<VerifiedMediaReference> = {}): VerifiedMediaReference {
  return {
    id: "m_1",
    verifiedKnowledgeId: "vk_001",
    clusterId: "cl_001",
    kind: "image",
    sourceUrl: "https://example.com/photo.jpg",
    rightsStatus: "owned",
    ...o,
  };
}

function makeTimeline(): VerifiedTimelineEvent[] {
  return [
    {
      id: "tl_2",
      verifiedKnowledgeId: "vk_001",
      clusterId: "cl_001",
      eventType: "update",
      summary: "Update event B",
      occurredAt: "2026-05-15T11:00:00.000Z",
    },
    {
      id: "tl_1",
      verifiedKnowledgeId: "vk_001",
      clusterId: "cl_001",
      eventType: "anchor",
      summary: "Anchor event A",
      occurredAt: "2026-05-15T10:00:00.000Z",
    },
  ];
}

function makeArticle(overrides: Partial<any> = {}) {
  return {
    id: 42,
    title: "Breaking: GPT-5.5 released",
    summary: "OpenAI shipped GPT-5.5 today with major improvements.",
    sourceName: "TechCrunch",
    sourceUrl: "https://techcrunch.com/x",
    category: "ai",
    imageUrl: "https://example.com/photo.jpg",
    publishedAt: new Date("2026-05-15T10:00:00.000Z"),
    status: "published",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Verified fixture → package                                         */
/* ------------------------------------------------------------------ */

describe("generateNewsroomDataPackage — verified input", () => {
  it("produces a complete panel-shaped package", () => {
    const pkg = generateNewsroomDataPackage({
      kind: "verified",
      verifiedKnowledge: makeVK(),
      mediaRefs: [makeMedia()],
      timelineEvents: makeTimeline(),
      generatedAt: ISO,
    });
    assert.equal(pkg.source, "verified_knowledge");
    assert.equal(pkg.packageId, "nrpkg_vk_vk_001_v1");
    assert.equal(pkg.verifiedKnowledgeId, "vk_001");
    assert.equal(pkg.sourceArticleId, null);
    assert.ok(pkg.headline.length > 0 && pkg.headline.length <= 120);
    assert.ok(pkg.shortHeadline.length <= 60);
    assert.equal(pkg.anchorScript.segments.length, 3);
    assert.ok(pkg.anchorScript.estimatedDurationMs > 0);
    assert.equal(pkg.tickerItems.length, 2);
    assert.equal(pkg.sourcePanel.distinctSourceCount, 2);
    assert.equal(pkg.sourcePanel.primarySource?.tier, "tier_a");
    assert.equal(pkg.sourcePanel.additionalSources.length, 1);
    assert.equal(pkg.mapPanel?.primaryLocation, "San Francisco");
    assert.ok(pkg.mapPanel?.locations.includes("San Francisco"));
    assert.equal(pkg.timelinePanel?.events.length, 2);
    // Sorted ascending by occurredAt
    assert.equal(pkg.timelinePanel?.events[0].kind, "anchor");
    assert.equal(pkg.timelinePanel?.events[1].kind, "update");
    assert.ok(pkg.marketOrDataPanel && pkg.marketOrDataPanel.metrics.length > 0);
    assert.equal(pkg.eventMedia.length, 1);
    assert.equal(pkg.eventMedia[0].approved, true);
    assert.equal(pkg.rightsStatus, "all_clear");
    assert.equal(pkg.confidenceLabel, "high");
    assert.equal(pkg.verificationStatus, "verified");
    assert.deepEqual(pkg.missingFields, []);
  });

  it("forces all publish/social/live flags to false (literal lock)", () => {
    const pkg = generateNewsroomDataPackage({
      kind: "verified",
      verifiedKnowledge: makeVK(),
      generatedAt: ISO,
    });
    assert.equal(pkg.safetyFlags.publicPublishing, false);
    assert.equal(pkg.safetyFlags.youtubeUpload, false);
    assert.equal(pkg.safetyFlags.socialPosting, false);
    assert.equal(pkg.safetyFlags.autonomousExecution, false);
    assert.equal(pkg.safetyFlags.manualRootAdminTriggerOnly, true);
    assert.equal(pkg.safetyFlags.internalAdminReviewOnly, true);
  });

  it("marks disputed status non-publishable and double-locks media approval", () => {
    const pkg = generateNewsroomDataPackage({
      kind: "verified",
      verifiedKnowledge: makeVK({ status: "disputed" }),
      mediaRefs: [makeMedia({ rightsStatus: "owned" })],
      generatedAt: ISO,
    });
    assert.ok(pkg.safetyFlags.nonPublishableReasons.includes("story_disputed"));
    // Even with owned rights, approval is revoked because the package is non-publishable.
    assert.equal(pkg.eventMedia[0].approved, false);
  });

  it("blocked media rights flips rightsStatus to blocked and never approves", () => {
    const pkg = generateNewsroomDataPackage({
      kind: "verified",
      verifiedKnowledge: makeVK(),
      mediaRefs: [makeMedia({ rightsStatus: "blocked" })],
      generatedAt: ISO,
    });
    assert.equal(pkg.rightsStatus, "blocked");
    assert.equal(pkg.eventMedia[0].approved, false);
    assert.ok(pkg.safetyFlags.nonPublishableReasons.includes("media_rights_blocked"));
  });

  it("rejected workflow surfaces in verificationStatus + reasons", () => {
    const pkg = generateNewsroomDataPackage({
      kind: "verified",
      verifiedKnowledge: makeVK(),
      workflowStatus: "rejected",
      generatedAt: ISO,
    });
    assert.equal(pkg.verificationStatus, "rejected");
    assert.ok(pkg.safetyFlags.nonPublishableReasons.includes("workflow_rejected"));
  });

  it("is deterministic across runs for identical input", () => {
    const input: GenerateNewsroomDataPackageInput = {
      kind: "verified",
      verifiedKnowledge: makeVK(),
      mediaRefs: [makeMedia()],
      timelineEvents: makeTimeline(),
      generatedAt: ISO,
    };
    const a = generateNewsroomDataPackage(input);
    const b = generateNewsroomDataPackage(input);
    assert.deepEqual(a, b);
  });
});

/* ------------------------------------------------------------------ */
/* Published-article fixture → package                                */
/* ------------------------------------------------------------------ */

describe("generateNewsroomDataPackage — published-article fallback", () => {
  it("produces a usable package and flags it as unverified", () => {
    const pkg = generateNewsroomDataPackage({
      kind: "published_article",
      article: makeArticle(),
      generatedAt: ISO,
    });
    assert.equal(pkg.source, "published_news_article");
    assert.equal(pkg.packageId, "nrpkg_art_42_v1");
    assert.equal(pkg.sourceArticleId, 42);
    assert.equal(pkg.verifiedKnowledgeId, null);
    assert.equal(pkg.confidenceLabel, "unknown");
    assert.equal(pkg.verificationStatus, "raw");
    assert.equal(pkg.sourcePanel.primarySource?.tier, "unknown");
    assert.equal(pkg.timelinePanel?.events[0].kind, "article_published");
    // Hero image is included but NOT approved (rights unknown by definition)
    assert.equal(pkg.eventMedia.length, 1);
    assert.equal(pkg.eventMedia[0].approved, false);
    assert.equal(pkg.eventMedia[0].rightsStatus, "rights_unknown");
    assert.equal(pkg.rightsStatus, "needs_review");
    assert.ok(pkg.safetyFlags.nonPublishableReasons.includes("fallback_unverified_source"));
    // Map + market panels are not derivable from a plain article
    assert.equal(pkg.mapPanel, null);
    assert.equal(pkg.marketOrDataPanel, null);
    assert.ok(pkg.missingFields.includes("mapPanel"));
    assert.ok(pkg.missingFields.includes("marketOrDataPanel"));
  });

  it("handles missing optional fields safely without throwing", () => {
    const pkg = generateNewsroomDataPackage({
      kind: "published_article",
      article: makeArticle({
        summary: null,
        imageUrl: null,
        publishedAt: null,
        sourceUrl: null,
      }),
      generatedAt: ISO,
    });
    assert.equal(pkg.eventMedia.length, 0);
    assert.equal(pkg.rightsStatus, "no_media");
    assert.equal(pkg.timelinePanel, null);
    assert.equal(pkg.summary, "(summary not available)");
    assert.ok(pkg.missingFields.includes("summary"));
    assert.ok(pkg.missingFields.includes("eventMedia"));
    assert.ok(pkg.missingFields.includes("timelinePanel"));
    // Safety flags still locked
    assert.equal(pkg.safetyFlags.publicPublishing, false);
    assert.equal(pkg.safetyFlags.youtubeUpload, false);
    assert.equal(pkg.safetyFlags.socialPosting, false);
    assert.equal(pkg.safetyFlags.autonomousExecution, false);
  });

  it("handles fully empty title/summary without crashing", () => {
    const pkg = generateNewsroomDataPackage({
      kind: "published_article",
      article: makeArticle({ title: "", summary: null, imageUrl: null }),
      generatedAt: ISO,
    });
    assert.equal(typeof pkg.headline, "string");
    assert.ok(pkg.headline.length > 0); // safe placeholder "Untitled article"
    assert.ok(pkg.missingFields.includes("title"));
    assert.ok(pkg.missingFields.includes("summary"));
  });

  it("is deterministic across runs for identical input", () => {
    const input: GenerateNewsroomDataPackageInput = {
      kind: "published_article",
      article: makeArticle(),
      generatedAt: ISO,
    };
    const a = generateNewsroomDataPackage(input);
    const b = generateNewsroomDataPackage(input);
    assert.deepEqual(a, b);
  });
});

/* ------------------------------------------------------------------ */
/* Missing-fields safety                                              */
/* ------------------------------------------------------------------ */

describe("generateNewsroomDataPackage — missing fields", () => {
  it("verified input with no media / no timeline / no locations / no metrics flags every missing panel", () => {
    const vk = makeVK({
      canonicalTitle: "An abstract announcement",
      canonicalSummary: "An abstract announcement was made today.",
      keyFacts: [],
      claims: [],
    });
    const pkg = generateNewsroomDataPackage({
      kind: "verified",
      verifiedKnowledge: vk,
      generatedAt: ISO,
    });
    assert.equal(pkg.tickerItems.length, 0);
    assert.equal(pkg.sourcePanel.distinctSourceCount, 0);
    assert.equal(pkg.mapPanel, null);
    assert.equal(pkg.timelinePanel, null);
    assert.equal(pkg.marketOrDataPanel, null);
    assert.equal(pkg.eventMedia.length, 0);
    assert.equal(pkg.rightsStatus, "no_media");
    for (const f of [
      "keyFacts",
      "sources",
      "mapPanel",
      "timelinePanel",
      "marketOrDataPanel",
      "eventMedia",
    ]) {
      assert.ok(pkg.missingFields.includes(f), `expected missing field "${f}"`);
    }
    // Still produces a valid anchor script with safe placeholders
    assert.equal(pkg.anchorScript.segments.length, 3);
    assert.ok(pkg.anchorScript.estimatedDurationMs > 0);
  });
});
