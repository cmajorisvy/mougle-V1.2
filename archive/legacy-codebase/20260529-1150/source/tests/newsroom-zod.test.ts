import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VerificationStatusSchema,
  ClaimVerdictSchema,
  RightsStatusSchema,
  SourceReliabilityTierSchema,
  ConfidenceLevelSchema,
  confidenceLevelOf,
  effectiveReliability,
  tierFromReliability,
  VerifiedKnowledgeConfidenceSchema,
  VerifiedClaimSchema,
  VerifiedKnowledgeSchema,
  NewsroomDataPackagePayloadSchema,
  NewsroomSafetyNotesSchema,
  NewsroomRenderManifestSchema,
  AdminDecisionRequestSchema,
  PromoteToVerifiedRequestSchema,
  ClusterDraftRequestSchema,
} from "../shared/newsroom-types";

describe("VerificationStatusSchema", () => {
  it("accepts all 9 spec statuses", () => {
    for (const s of [
      "raw",
      "clustered",
      "extracting_claims",
      "verification_pending",
      "verified",
      "developing",
      "disputed",
      "correction",
      "rejected",
    ]) {
      assert.equal(VerificationStatusSchema.parse(s), s);
    }
  });
  it("rejects unknown status", () => {
    assert.throws(() => VerificationStatusSchema.parse("published"));
  });
});

describe("ClaimVerdictSchema", () => {
  it("accepts the 4 verdicts", () => {
    for (const v of [
      "supported",
      "contradicted",
      "insufficient_evidence",
      "needs_human_review",
    ]) {
      assert.equal(ClaimVerdictSchema.parse(v), v);
    }
  });
  it("rejects unknown verdict", () => {
    assert.throws(() => ClaimVerdictSchema.parse("true"));
  });
});

describe("RightsStatusSchema", () => {
  it("accepts the 5 rights statuses", () => {
    for (const r of [
      "owned",
      "licensed",
      "fair_use_review",
      "rights_unknown",
      "blocked",
    ]) {
      assert.equal(RightsStatusSchema.parse(r), r);
    }
  });
});

describe("SourceReliabilityTierSchema + ConfidenceLevelSchema", () => {
  it("accepts the 4 tiers", () => {
    for (const t of ["tier_a", "tier_b", "tier_c", "untrusted"]) {
      assert.equal(SourceReliabilityTierSchema.parse(t), t);
    }
  });
  it("accepts the 4 confidence levels", () => {
    for (const c of ["low", "medium", "high", "very_high"]) {
      assert.equal(ConfidenceLevelSchema.parse(c), c);
    }
  });
});

describe("confidenceLevelOf", () => {
  it("maps boundaries correctly", () => {
    assert.equal(confidenceLevelOf(0.0), "low");
    assert.equal(confidenceLevelOf(0.49), "low");
    assert.equal(confidenceLevelOf(0.5), "medium");
    assert.equal(confidenceLevelOf(0.69), "medium");
    assert.equal(confidenceLevelOf(0.7), "high");
    assert.equal(confidenceLevelOf(0.84), "high");
    assert.equal(confidenceLevelOf(0.85), "very_high");
    assert.equal(confidenceLevelOf(1.0), "very_high");
  });
});

describe("effectiveReliability + tierFromReliability", () => {
  it("computes weighted blend with retraction penalty", () => {
    assert.equal(
      effectiveReliability({ baseScore: 1, recentAccuracy: 1, retractionCount: 0 }),
      1,
    );
    assert.equal(
      effectiveReliability({ baseScore: 0, recentAccuracy: 0, retractionCount: 0 }),
      0,
    );
    const mid = effectiveReliability({
      baseScore: 0.8,
      recentAccuracy: 0.5,
      retractionCount: 2,
    });
    // 0.6*0.8 + 0.4*0.5 - 0.1 = 0.48 + 0.2 - 0.1 = 0.58
    assert.ok(Math.abs(mid - 0.58) < 1e-9);
  });
  it("caps retraction penalty at 0.3", () => {
    const v = effectiveReliability({
      baseScore: 1,
      recentAccuracy: 1,
      retractionCount: 100,
    });
    // 1 - 0.3 = 0.7
    assert.ok(Math.abs(v - 0.7) < 1e-9);
  });
  it("clamps to 0..1", () => {
    assert.equal(
      effectiveReliability({ baseScore: 0, recentAccuracy: 0, retractionCount: 20 }),
      0,
    );
  });
  it("maps to tiers per spec §10", () => {
    assert.equal(tierFromReliability(0.81), "tier_a");
    assert.equal(tierFromReliability(0.8), "tier_a");
    assert.equal(tierFromReliability(0.6), "tier_b");
    assert.equal(tierFromReliability(0.4), "tier_c");
    assert.equal(tierFromReliability(0.39), "untrusted");
  });
});

describe("VerifiedKnowledgeConfidenceSchema", () => {
  it("accepts a well-formed object", () => {
    const ok = VerifiedKnowledgeConfidenceSchema.parse({
      aggregate: 0.82,
      claimSupport: 0.9,
      sourceDiversity: 0.7,
      sourceReliabilityAvg: 0.75,
      contradictionPenalty: 0.05,
      ageDecay: 1.0,
      computedAt: "2026-05-16T00:00:00.000Z",
      formulaVersion: "v1",
    });
    assert.equal(ok.aggregate, 0.82);
  });
  it("rejects aggregate > 1", () => {
    assert.throws(() =>
      VerifiedKnowledgeConfidenceSchema.parse({
        aggregate: 1.5,
        claimSupport: 0,
        sourceDiversity: 0,
        sourceReliabilityAvg: 0,
        contradictionPenalty: 0,
        ageDecay: 0,
        computedAt: "x",
        formulaVersion: "v1",
      }),
    );
  });
  it("rejects wrong formula version", () => {
    assert.throws(() =>
      VerifiedKnowledgeConfidenceSchema.parse({
        aggregate: 0.5,
        claimSupport: 0.5,
        sourceDiversity: 0.5,
        sourceReliabilityAvg: 0.5,
        contradictionPenalty: 0,
        ageDecay: 1,
        computedAt: "x",
        formulaVersion: "v2",
      }),
    );
  });
});

const sampleClaim = {
  id: "c1",
  clusterId: "cl1",
  verifiedKnowledgeId: null,
  statement: "OpenAI announced model X on 2026-05-15.",
  subject: "OpenAI",
  metric: null,
  timeReference: "2026-05-15",
  verdict: "supported" as const,
  verdictConfidence: 0.9,
  supportCount: 3,
  contradictionCount: 0,
  evidence: [
    {
      url: "https://openai.com/blog/x",
      sourceName: "OpenAI Blog",
      sourceTier: "tier_a" as const,
      supports: true,
      reliabilitySnapshot: 0.95,
    },
  ],
};

describe("VerifiedClaimSchema + VerifiedKnowledgeSchema", () => {
  it("accepts a sample claim", () => {
    assert.doesNotThrow(() => VerifiedClaimSchema.parse(sampleClaim));
  });
  it("rejects bad evidence URL", () => {
    assert.throws(() =>
      VerifiedClaimSchema.parse({
        ...sampleClaim,
        evidence: [{ ...sampleClaim.evidence[0], url: "not-a-url" }],
      }),
    );
  });
  it("accepts a sample verified knowledge object", () => {
    const vk = {
      id: "vk1",
      clusterId: "cl1",
      status: "verified" as const,
      canonicalTitle: "Sample",
      canonicalSummary: "Summary text.",
      keyFacts: [
        { statement: "Fact A", derivedFromClaimIds: ["c1"], confidence: 0.9 },
      ],
      claims: [sampleClaim],
      confidence: {
        aggregate: 0.8,
        claimSupport: 1,
        sourceDiversity: 0.6,
        sourceReliabilityAvg: 0.9,
        contradictionPenalty: 0,
        ageDecay: 1,
        computedAt: "2026-05-16T00:00:00.000Z",
        formulaVersion: "v1" as const,
      },
      sourceCoverage: {
        distinctSources: 3,
        tierBreakdown: { tier_a: 2, tier_b: 1, tier_c: 0, untrusted: 0 },
        earliestPublishedAt: "2026-05-15T10:00:00.000Z",
        latestPublishedAt: "2026-05-15T18:00:00.000Z",
      },
      approvedBy: "root_admin_1",
      approvedAt: "2026-05-16T01:00:00.000Z",
      supersededByVerifiedId: null,
    };
    assert.doesNotThrow(() => VerifiedKnowledgeSchema.parse(vk));
  });
  it("rejects verified knowledge with title > 200 chars", () => {
    assert.throws(() =>
      VerifiedKnowledgeSchema.parse({
        id: "vk1",
        clusterId: "cl1",
        status: "verified",
        canonicalTitle: "x".repeat(201),
        canonicalSummary: "ok",
        keyFacts: [],
        claims: [],
        confidence: {
          aggregate: 0,
          claimSupport: 0,
          sourceDiversity: 0,
          sourceReliabilityAvg: 0,
          contradictionPenalty: 0,
          ageDecay: 0,
          computedAt: "x",
          formulaVersion: "v1",
        },
        sourceCoverage: {
          distinctSources: 0,
          tierBreakdown: {},
          earliestPublishedAt: "x",
          latestPublishedAt: "x",
        },
        approvedBy: "a",
        approvedAt: "x",
        supersededByVerifiedId: null,
      }),
    );
  });
});

describe("NewsroomDataPackagePayloadSchema + NewsroomSafetyNotesSchema", () => {
  const samplePackage = {
    verifiedKnowledgeId: "vk1",
    version: 1,
    template: "news_desk" as const,
    title: "Sample headline",
    subtitle: "Subtitle",
    headline: { text: "Headline goes here", durationMs: 5000 },
    lowerThirds: [{ text: "Live", startMs: 0, endMs: 3000 }],
    tickerItems: [{ text: "Tick" }],
    segments: [
      {
        segmentIndex: 0,
        scriptType: "two_minute" as const,
        narrationText: "Narration.",
        keyFactIndex: 0,
        durationMs: 120000,
      },
    ],
    sourceEvidenceReferences: [
      {
        label: "Source A",
        url: "https://example.com/a",
        claimId: "c1",
        confidenceScore: 0.9,
        status: "supported" as const,
      },
    ],
    mediaRefs: [],
    complianceNotes: [],
    safetyLabels: [],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };
  it("accepts a well-formed package", () => {
    assert.doesNotThrow(() => NewsroomDataPackagePayloadSchema.parse(samplePackage));
  });
  it("rejects > 6 ticker items", () => {
    assert.throws(() =>
      NewsroomDataPackagePayloadSchema.parse({
        ...samplePackage,
        tickerItems: Array.from({ length: 7 }, () => ({ text: "t" })),
      }),
    );
  });
  it("rejects title > 80 chars", () => {
    assert.throws(() =>
      NewsroomDataPackagePayloadSchema.parse({
        ...samplePackage,
        title: "x".repeat(81),
      }),
    );
  });
  it("requires safety notes hard-coded false flags", () => {
    assert.throws(() =>
      NewsroomSafetyNotesSchema.parse({
        internalAdminReviewOnly: true,
        manualRootAdminTriggerOnly: true,
        publicPublishing: true, // forbidden
        youtubeUpload: false,
        socialPosting: false,
        blockingFindings: [],
        warningFindings: [],
        rightsIssues: [],
      }),
    );
    assert.doesNotThrow(() =>
      NewsroomSafetyNotesSchema.parse({
        internalAdminReviewOnly: true,
        manualRootAdminTriggerOnly: true,
        publicPublishing: false,
        youtubeUpload: false,
        socialPosting: false,
        blockingFindings: [],
        warningFindings: [],
        rightsIssues: [],
      }),
    );
  });
});

describe("NewsroomRenderManifestSchema", () => {
  const validSafety = {
    internalAdminReviewOnly: true as const,
    manualRootAdminTriggerOnly: true as const,
    publicPublishing: false as const,
    youtubeUpload: false as const,
    socialPosting: false as const,
    blockingFindings: [],
    warningFindings: [],
    rightsIssues: [],
  };
  const validLayers = [
    { key: "bg", kind: "background" as const, zIndex: 0, visible: true },
    { key: "anchor", kind: "anchor" as const, zIndex: 10, visible: true },
    { key: "cap", kind: "caption" as const, zIndex: 50, visible: true },
  ];
  const validSafeZones = {
    anchorSafeZone: {
      x: 10, y: 10, width: 30, height: 50, unit: "percent" as const, purpose: "anchor" as const,
    },
    lowerThirdZone: {
      x: 5, y: 70, width: 50, height: 10, unit: "percent" as const, purpose: "lower-third" as const,
    },
    tickerZone: {
      x: 0, y: 90, width: 100, height: 6, unit: "percent" as const, purpose: "ticker" as const,
    },
    captionZone: {
      x: 10, y: 85, width: 80, height: 4, unit: "percent" as const, purpose: "caption" as const,
    },
    monitorPanelZones: [],
  };
  const validTextSafety = {
    maxHeadlineChars: 80,
    maxLowerThirdChars: 60,
    maxTickerChars: 140,
    maxCaptionCharsPerCue: 84,
    maxCaptionLinesPerCue: 2,
  };
  const validManifest = {
    packageId: "p1",
    packageVersion: 1,
    format: {
      width: 1920 as const,
      height: 1080 as const,
      fps: 30 as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      captionFormat: "srt" as const,
    },
    layers: validLayers,
    safeZones: validSafeZones,
    textSafety: validTextSafety,
    timing: { totalDurationMs: 1000, segments: [] },
    captionsPlan: { cues: [], overflowFindings: [] },
    mediaPlan: [],
    compliance: { blocking: [], warnings: [] },
    safety: validSafety,
    generatedAt: "2026-05-16T00:00:00.000Z",
  };

  it("accepts a spec-compliant manifest with layers, safeZones, textSafety", () => {
    assert.doesNotThrow(() => NewsroomRenderManifestSchema.parse(validManifest));
  });
  it("rejects manifest missing layers (spec §13 required)", () => {
    const { layers: _layers, ...rest } = validManifest;
    assert.throws(() => NewsroomRenderManifestSchema.parse(rest));
  });
  it("rejects manifest missing safeZones (spec §13 required)", () => {
    const { safeZones: _sz, ...rest } = validManifest;
    assert.throws(() => NewsroomRenderManifestSchema.parse(rest));
  });
  it("rejects manifest missing textSafety (spec §13 required)", () => {
    const { textSafety: _ts, ...rest } = validManifest;
    assert.throws(() => NewsroomRenderManifestSchema.parse(rest));
  });
  it("rejects non-1920x1080 format (Phase 1A baseline lock)", () => {
    assert.throws(() =>
      NewsroomRenderManifestSchema.parse({
        ...validManifest,
        format: { ...validManifest.format, width: 1280 as unknown as 1920, height: 720 as unknown as 1080 },
      }),
    );
  });
  it("rejects empty layers array", () => {
    assert.throws(() =>
      NewsroomRenderManifestSchema.parse({ ...validManifest, layers: [] }),
    );
  });
});

describe("Admin request schemas", () => {
  it("PromoteToVerifiedRequestSchema requires acknowledgeSafetyCheck === true", () => {
    assert.throws(() =>
      PromoteToVerifiedRequestSchema.parse({
        clusterId: "00000000-0000-0000-0000-000000000001",
        acknowledgeSafetyCheck: false,
      }),
    );
    assert.doesNotThrow(() =>
      PromoteToVerifiedRequestSchema.parse({
        clusterId: "00000000-0000-0000-0000-000000000001",
        acknowledgeSafetyCheck: true,
      }),
    );
  });
  it("ClusterDraftRequestSchema pins dryRun to true (Phase 1B)", () => {
    assert.throws(() => ClusterDraftRequestSchema.parse({ dryRun: false }));
    assert.doesNotThrow(() => ClusterDraftRequestSchema.parse({ dryRun: true }));
  });
  it("AdminDecisionRequestSchema enforces subjectType + action enums", () => {
    assert.doesNotThrow(() =>
      AdminDecisionRequestSchema.parse({
        subjectType: "verified_knowledge",
        subjectId: "vk1",
        action: "approve",
      }),
    );
    assert.throws(() =>
      AdminDecisionRequestSchema.parse({
        subjectType: "article", // not in enum
        subjectId: "1",
        action: "approve",
      }),
    );
    assert.throws(() =>
      AdminDecisionRequestSchema.parse({
        subjectType: "claim",
        subjectId: "1",
        action: "publish", // not in enum
      }),
    );
  });
});
