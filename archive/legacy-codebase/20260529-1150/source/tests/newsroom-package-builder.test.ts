import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import {
  buildNewsroomDataPackage,
  deriveNewsroomSafetyNotes,
  summarizePackageVerification,
  validateNewsroomDataPackage,
  NewsroomPackageRejectedError,
  type NewsroomPackageBuildInput,
} from "../server/services/newsroom/newsroomDataPackageBuilder";
import type {
  VerifiedKnowledge,
  VerifiedMediaReference,
} from "../shared/newsroom-types";
import { registerNewsroomPreviewRoutes } from "../server/routes/newsroom-preview-routes";

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

const ISO = "2026-05-16T12:00:00.000Z";

function makeVerifiedKnowledge(
  overrides: Partial<VerifiedKnowledge> = {},
): VerifiedKnowledge {
  return {
    id: "vk_001",
    clusterId: "cl_001",
    status: "verified",
    canonicalTitle: "OpenAI releases GPT-5.5 with 1M token context",
    canonicalSummary:
      "OpenAI released GPT-5.5 with a one-million token context window. The release happened on 2026-05-15. The company says benchmarks improved across coding and reasoning.",
    keyFacts: [
      {
        statement: "GPT-5.5 supports a 1,000,000 token context window.",
        derivedFromClaimIds: ["claim_001"],
        confidence: 0.8,
      },
      {
        statement: "Release date is 2026-05-15.",
        derivedFromClaimIds: ["claim_002"],
        confidence: 0.9,
      },
    ],
    claims: [
      {
        id: "claim_001",
        clusterId: "cl_001",
        verifiedKnowledgeId: "vk_001",
        statement: "GPT-5.5 supports a 1M token context window.",
        subject: "GPT-5.5",
        metric: "1000000",
        timeReference: "2026-05-15",
        verdict: "supported",
        verdictConfidence: 0.82,
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
      {
        id: "claim_002",
        clusterId: "cl_001",
        verifiedKnowledgeId: "vk_001",
        statement: "Release date is 2026-05-15.",
        verdict: null,
        verdictConfidence: 0.5,
        supportCount: 1,
        contradictionCount: 0,
        evidence: [
          {
            url: "https://openai.com/blog/gpt-5-5",
            sourceName: "OpenAI Blog",
            sourceTier: "tier_a",
            supports: true,
            reliabilitySnapshot: 0.9,
          },
        ],
      },
    ],
    confidence: {
      aggregate: 0.78,
      claimSupport: 0.8,
      sourceDiversity: 0.7,
      sourceReliabilityAvg: 0.8,
      contradictionPenalty: 0.0,
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

function makeMedia(
  overrides: Partial<VerifiedMediaReference> = {},
): VerifiedMediaReference {
  return {
    id: "m_001",
    verifiedKnowledgeId: "vk_001",
    clusterId: "cl_001",
    kind: "image",
    sourceUrl: "https://example.com/photo.jpg",
    rightsStatus: "owned",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Pure builder tests                                                 */
/* ------------------------------------------------------------------ */

describe("buildNewsroomDataPackage — happy path", () => {
  it("verified input produces a schema-valid payload", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      mediaRefs: [makeMedia()],
      generatedAt: ISO,
    });
    const v = validateNewsroomDataPackage(result.payload);
    assert.equal(v.ok, true, JSON.stringify(v));
    assert.equal(result.payload.verifiedKnowledgeId, "vk_001");
    assert.equal(result.payload.template, "news_desk");
    assert.equal(result.payload.version, 1);
    assert.equal(result.payload.generatedAt, ISO);
    assert.equal(result.publishable, true);
    assert.equal(result.publishableReason, "ok");
  });

  it("preserves extracted claims via sourceEvidenceReferences", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      generatedAt: ISO,
    });
    // 3 evidence entries across 2 claims
    assert.equal(result.payload.sourceEvidenceReferences.length, 3);
    assert.deepEqual(
      result.payload.sourceEvidenceReferences.map((r) => r.claimId).sort(),
      ["claim_001", "claim_001", "claim_002"],
    );
    // Null verdict is mapped to needs_human_review (preserved, no data loss)
    const c2 = result.payload.sourceEvidenceReferences.find(
      (r) => r.claimId === "claim_002",
    );
    assert.equal(c2?.status, "needs_human_review");
  });

  it("preserves source URLs across all evidence", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      generatedAt: ISO,
    });
    const urls = result.payload.sourceEvidenceReferences.map((r) => r.url).sort();
    assert.deepEqual(urls, [
      "https://openai.com/blog/gpt-5-5",
      "https://openai.com/blog/gpt-5-5",
      "https://techcrunch.com/2026/05/15/gpt-5-5",
    ]);
  });

  it("preserves media rights status verbatim", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      mediaRefs: [
        makeMedia({ id: "m_a", rightsStatus: "owned" }),
        makeMedia({ id: "m_b", rightsStatus: "licensed" }),
        makeMedia({ id: "m_c", rightsStatus: "fair_use_review" }),
      ],
      generatedAt: ISO,
    });
    assert.deepEqual(
      result.payload.mediaRefs.map((m) => [m.mediaId, m.rightsStatus]).sort(),
      [
        ["m_a", "owned"],
        ["m_b", "licensed"],
        ["m_c", "fair_use_review"],
      ],
    );
  });

  it("passes timeline events through unchanged", () => {
    const events = [
      {
        id: "tl_1",
        verifiedKnowledgeId: "vk_001",
        clusterId: "cl_001",
        eventType: "anchor" as const,
        summary: "Initial anchor event",
        occurredAt: ISO,
      },
    ];
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      timelineEvents: events,
      generatedAt: ISO,
    });
    assert.deepEqual(result.timelineEvents, events);
  });

  it("output is deterministic across runs given identical input", () => {
    const input: NewsroomPackageBuildInput = {
      verifiedKnowledge: makeVerifiedKnowledge(),
      mediaRefs: [makeMedia()],
      generatedAt: ISO,
    };
    const a = buildNewsroomDataPackage(input);
    const b = buildNewsroomDataPackage(input);
    assert.deepEqual(a, b);
  });
});

describe("buildNewsroomDataPackage — safety", () => {
  it("forces all publish / social / live flags to false", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      generatedAt: ISO,
    });
    assert.equal(result.safetyNotes.publicPublishing, false);
    assert.equal(result.safetyNotes.youtubeUpload, false);
    assert.equal(result.safetyNotes.socialPosting, false);
    assert.equal(result.safetyNotes.internalAdminReviewOnly, true);
    assert.equal(result.safetyNotes.manualRootAdminTriggerOnly, true);
  });

  it("disputed status is non-publishable", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge({ status: "disputed" }),
      generatedAt: ISO,
    });
    assert.equal(result.publishable, false);
    assert.ok(result.safetyNotes.blockingFindings.some((f) => f.code === "STORY_DISPUTED"));
    assert.ok(result.payload.safetyLabels.includes("DISPUTED_STORY"));
    assert.ok(result.payload.safetyLabels.includes("NON_PUBLISHABLE"));
  });

  it("developing status is non-publishable but builds", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge({ status: "developing" }),
      generatedAt: ISO,
    });
    assert.equal(result.publishable, false);
    assert.ok(result.safetyNotes.warningFindings.some((f) => f.code === "STORY_DEVELOPING"));
    assert.ok(result.payload.safetyLabels.includes("DEVELOPING_STORY"));
  });

  it("blocked media rights become blocking findings", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      mediaRefs: [makeMedia({ id: "m_bad", rightsStatus: "blocked" })],
      generatedAt: ISO,
    });
    assert.equal(result.publishable, false);
    assert.ok(result.safetyNotes.blockingFindings.some((f) => f.code === "MEDIA_RIGHTS_BLOCKED"));
    assert.equal(result.safetyNotes.rightsIssues.length, 1);
    assert.equal(result.safetyNotes.rightsIssues[0].mediaId, "m_bad");
  });

  it("fair_use_review and rights_unknown become warnings", () => {
    const notes = deriveNewsroomSafetyNotes({
      verifiedKnowledge: makeVerifiedKnowledge(),
      mediaRefs: [
        makeMedia({ id: "m_fu", rightsStatus: "fair_use_review" }),
        makeMedia({ id: "m_ru", rightsStatus: "rights_unknown" }),
      ],
      generatedAt: ISO,
    });
    assert.equal(notes.blockingFindings.length, 0);
    assert.equal(notes.warningFindings.filter((f) => f.code === "MEDIA_RIGHTS_REVIEW").length, 2);
  });
});

describe("buildNewsroomDataPackage — gating", () => {
  it("throws for rejected workflowStatus without previewMode", () => {
    assert.throws(
      () =>
        buildNewsroomDataPackage({
          verifiedKnowledge: makeVerifiedKnowledge(),
          workflowStatus: "rejected",
          generatedAt: ISO,
        }),
      (err: unknown) =>
        err instanceof NewsroomPackageRejectedError && err.status === "rejected",
    );
  });

  it("throws for verification_pending without previewMode", () => {
    assert.throws(
      () =>
        buildNewsroomDataPackage({
          verifiedKnowledge: makeVerifiedKnowledge(),
          workflowStatus: "verification_pending",
          generatedAt: ISO,
        }),
      NewsroomPackageRejectedError,
    );
  });

  it("previewMode=true allows rejected input but marks it non-publishable", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      workflowStatus: "rejected",
      previewMode: true,
      generatedAt: ISO,
    });
    assert.equal(result.publishable, false);
    assert.ok(result.payload.safetyLabels.includes("REJECTED_BY_WORKFLOW"));
    assert.ok(result.safetyNotes.blockingFindings.some((f) => f.code === "WORKFLOW_REJECTED"));
  });
});

describe("validateNewsroomDataPackage", () => {
  it("returns ok=true for a valid payload", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      generatedAt: ISO,
    });
    const v = validateNewsroomDataPackage(result.payload);
    assert.equal(v.ok, true);
  });

  it("returns clear issues for an invalid payload", () => {
    const bad = { verifiedKnowledgeId: "vk_1", version: 0 } as any;
    const v = validateNewsroomDataPackage(bad);
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.ok(v.issues.length > 0);
      assert.ok(v.issues.every((i) => typeof i.message === "string"));
    }
  });
});

describe("summarizePackageVerification", () => {
  it("counts claims, evidence, distinct sources, media, findings", () => {
    const result = buildNewsroomDataPackage({
      verifiedKnowledge: makeVerifiedKnowledge(),
      mediaRefs: [makeMedia(), makeMedia({ id: "m_2", rightsStatus: "blocked" })],
      generatedAt: ISO,
    });
    const sum = summarizePackageVerification(result);
    assert.equal(sum.claimCount, 2);
    assert.equal(sum.evidenceCount, 3);
    assert.equal(sum.distinctSources, 2); // openai.com, techcrunch.com
    assert.equal(sum.mediaCount, 2);
    assert.ok(sum.blockingFindingCount >= 1);
    assert.equal(sum.publicPublishing, false);
    assert.equal(sum.youtubeUpload, false);
    assert.equal(sum.socialPosting, false);
  });
});

/* ------------------------------------------------------------------ */
/* Route tests (in-process express with stubbed admin)                */
/* ------------------------------------------------------------------ */

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());
  // Stub admin middleware — equivalent to requireRootAdmin in tests.
  const stubAdmin = (_req: any, _res: any, next: any) => next();
  registerNewsroomPreviewRoutes(app, stubAdmin);
  await new Promise<void>((r) => {
    server = createServer(app).listen(0, () => r());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe("POST /api/admin/newsroom/package-preview", () => {
  it("rejects body without dryRun: true", async () => {
    const res = await fetch(`${baseUrl}/api/admin/newsroom/package-preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        verifiedKnowledge: makeVerifiedKnowledge(),
        generatedAt: ISO,
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_body");
  });

  it("returns promoted:false, renderStarted:false, publishQueued:false on success", async () => {
    const res = await fetch(`${baseUrl}/api/admin/newsroom/package-preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        verifiedKnowledge: makeVerifiedKnowledge(),
        generatedAt: ISO,
        dryRun: true,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.promoted, false);
    assert.equal(body.renderStarted, false);
    assert.equal(body.publishQueued, false);
    assert.equal(body.publishable, true);
    assert.equal(body.payload.verifiedKnowledgeId, "vk_001");
    assert.equal(body.safetyNotes.publicPublishing, false);
    assert.equal(body.safetyNotes.youtubeUpload, false);
    assert.equal(body.safetyNotes.socialPosting, false);
  });

  it("returns 409 for rejected workflow without previewMode", async () => {
    const res = await fetch(`${baseUrl}/api/admin/newsroom/package-preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        verifiedKnowledge: makeVerifiedKnowledge(),
        workflowStatus: "rejected",
        generatedAt: ISO,
        dryRun: true,
      }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, "package_rejected");
    assert.equal(body.workflowStatus, "rejected");
  });

  it("returns 200 for rejected workflow when previewMode: true", async () => {
    const res = await fetch(`${baseUrl}/api/admin/newsroom/package-preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        verifiedKnowledge: makeVerifiedKnowledge(),
        workflowStatus: "rejected",
        previewMode: true,
        generatedAt: ISO,
        dryRun: true,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.publishable, false);
    assert.ok(body.payload.safetyLabels.includes("REJECTED_BY_WORKFLOW"));
  });
});
