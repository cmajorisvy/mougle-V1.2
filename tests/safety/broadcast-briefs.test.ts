/**
 * Newsroom T3 — Broadcast Brief safety tests.
 *
 * SAFETY INVARIANTS UNDER TEST:
 *   1. Every newly generated brief is `approvalStatus='draft'`.
 *   2. visibility is locked to 'admin_only_internal'.
 *   3. publicUrl and signedUrl are null on every brief.
 *   4. realSendAllowed and executionEnabled are false on every brief.
 *   5. safetyEnvelope is the locked literal-true/false shape — every
 *      publishing / hardware / rendering toggle is false.
 *   6. readApprovedBrief refuses anything not in 'approved'.
 *   7. Generation is idempotent on dataPackageId.
 *   8. AI payload schema rejects out-of-range / malformed shapes.
 *   9. impactScore maps verbatim from AI output through to the row.
 *  10. Service source code contains no forbidden publish / hardware /
 *      copyrighted-video / logo-removal calls (lint-style guard).
 *  11. The PATCH schema is strict — safety fields cannot be patched.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  broadcastBriefBuilderService,
  BroadcastBriefSafetyError,
} from "../../server/services/broadcast-brief-builder-service";
import {
  BroadcastBriefAiPayloadSchema,
  BroadcastBriefPatchSchema,
  BROADCAST_BRIEF_SAFETY_ENVELOPE,
  type BroadcastBriefAiPayload,
  type VerifiedKnowledge,
} from "../../shared/newsroom-types";

const ISO = "2026-05-18T12:00:00.000Z";

function makeVK(overrides: Partial<VerifiedKnowledge> = {}): VerifiedKnowledge {
  return {
    id: "vk_t3_001",
    clusterId: "cl_t3_001",
    status: "verified",
    canonicalTitle: "OpenAI releases GPT-5.5 with 1M token context in San Francisco",
    canonicalSummary:
      "OpenAI released GPT-5.5 with a one-million token context window in San Francisco on 2026-05-15.",
    keyFacts: [
      {
        statement: "GPT-5.5 supports a 1,000,000 token context window.",
        derivedFromClaimIds: ["c1"],
        confidence: 0.9,
      },
    ],
    claims: [
      {
        id: "c1",
        clusterId: "cl_t3_001",
        verifiedKnowledgeId: "vk_t3_001",
        statement: "GPT-5.5 supports a 1,000,000 token context window.",
        subject: "GPT-5.5",
        metric: "1000000 tokens",
        verdict: "supported",
        verdictConfidence: 0.9,
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
        ],
      },
    ],
    confidence: {
      aggregate: 0.85,
      claimSupport: 0.9,
      sourceDiversity: 0.8,
      sourceReliabilityAvg: 0.85,
      contradictionPenalty: 0,
      ageDecay: 0.95,
      computedAt: ISO,
      formulaVersion: "v1",
    },
    sourceCoverage: {
      distinctSources: 2,
      tierBreakdown: { tier_a: 1, tier_b: 1, tier_c: 0, untrusted: 0 },
      earliestPublishedAt: ISO,
      latestPublishedAt: ISO,
    },
    approvedBy: "root_admin",
    approvedAt: ISO,
    supersededByVerifiedId: null,
    ...overrides,
  };
}

function goodAiPayload(
  overrides: Partial<BroadcastBriefAiPayload> = {},
): BroadcastBriefAiPayload {
  return {
    headline: "OpenAI ships GPT-5.5 with 1M-token context",
    summary:
      "OpenAI released GPT-5.5 in San Francisco on 2026-05-15, expanding context length to one million tokens.",
    location: { city: "San Francisco", country: "USA", lat: 37.77, lon: -122.42 },
    region: "California",
    country: "USA",
    latitude: 37.77,
    longitude: -122.42,
    eventType: "product_launch",
    entities: [
      { name: "OpenAI", kind: "org" },
      { name: "GPT-5.5", kind: "other" },
      { name: "San Francisco", kind: "location" },
    ],
    mood: "analytical",
    impactScore: "high",
    breakingNews: false,
    scriptBeats: {
      coldOpen: "OpenAI has shipped GPT-5.5 with a one-million token context window.",
      keyFacts: "The model expands context dramatically and was released on 2026-05-15 in San Francisco.",
      context: "Larger context windows enable longer-form reasoning at inference time.",
      signOff: "We will continue tracking benchmark results as they are independently verified.",
    },
    visualNeeds: {
      coldOpen: ["wide shot of neutral tech background"],
      keyFacts: ["motion graphic of token-count counter"],
      context: ["b-roll of researchers at workstations"],
      signOff: ["studio anchor sign-off shot"],
    },
    bRollNeeds: ["neutral data-center b-roll", "abstract neural-network animation"],
    mapNeeds: { needsMap: true, focus: "San Francisco, California, USA", zoomHint: "city" },
    anchorMode: "solo_desk",
    sensitivity: {
      graphicViolence: false,
      minors: false,
      disputed: false,
      medical: false,
      electoral: false,
      legal: false,
      death: false,
      financial: false,
      notes: [],
    },
    rightsFlags: { hasRestrictions: false, notes: [] },
    ...overrides,
  };
}

function genInput(dataPackageId = "dp_t3_001", vk = makeVK()) {
  return {
    dataPackageId,
    storyId: vk.id,
    articleId: 42 as number | null,
    verifiedKnowledge: vk,
  };
}

describe("BroadcastBriefBuilderService — safety invariants", () => {
  beforeEach(async () => {
    await broadcastBriefBuilderService._resetForTests();
  });

  it("generated brief is draft + internal-only + locked safety envelope", async () => {
    const brief = await broadcastBriefBuilderService.generateForDataPackage(
      genInput(),
      { extractor: async () => goodAiPayload(), now: () => new Date(ISO) },
    );
    assert.equal(brief.approvalStatus, "draft");
    assert.equal(brief.visibility, "admin_only_internal");
    assert.equal(brief.publicUrl, null);
    assert.equal(brief.signedUrl, null);
    assert.equal(brief.realSendAllowed, false);
    assert.equal(brief.executionEnabled, false);
    assert.equal(brief.approvedBy, null);
    assert.deepEqual(brief.safetyEnvelope, BROADCAST_BRIEF_SAFETY_ENVELOPE);
    // Every publishing / hardware / fetch / logo toggle must be false:
    for (const key of [
      "publicPublishing",
      "youtubeUpload",
      "socialPosting",
      "liveStreaming",
      "realUnrealCommands",
      "real4DCommands",
      "movieRenderQueue",
      "sequencerExecution",
      "cinema4dExecution",
      "publicUrlGeneration",
      "signedUrlGeneration",
      "copyrightedVideoFetch",
      "logoOrWatermarkRemoval",
    ] as const) {
      assert.equal(
        (brief.safetyEnvelope as Record<string, boolean>)[key],
        false,
        `safetyEnvelope.${key} must be false`,
      );
    }
    assert.equal(brief.safetyEnvelope.manualRootAdminOverrideOnly, true);
    assert.equal(brief.safetyEnvelope.internalAdminReviewAvailable, true);
  });

  it("location, event type, entities are stored verbatim", async () => {
    const brief = await broadcastBriefBuilderService.generateForDataPackage(
      genInput(),
      { extractor: async () => goodAiPayload() },
    );
    assert.equal(brief.location.city, "San Francisco");
    assert.equal(brief.region, "California");
    assert.equal(brief.country, "USA");
    assert.equal(brief.latitude, 37.77);
    assert.equal(brief.longitude, -122.42);
    assert.equal(brief.eventType, "product_launch");
    assert.equal(brief.entities.length, 3);
    assert.equal(brief.entities[0].name, "OpenAI");
  });

  it("impactScore maps verbatim from AI output", async () => {
    for (const impact of ["high", "medium", "low"] as const) {
      await broadcastBriefBuilderService._resetForTests();
      const brief = await broadcastBriefBuilderService.generateForDataPackage(
        genInput(`dp_${impact}`),
        { extractor: async () => goodAiPayload({ impactScore: impact }) },
      );
      assert.equal(brief.impactScore, impact);
    }
  });

  it("readApprovedBrief refuses drafts and archived briefs", async () => {
    const brief = await broadcastBriefBuilderService.generateForDataPackage(
      genInput(),
      { extractor: async () => goodAiPayload() },
    );
    await assert.rejects(
      () => broadcastBriefBuilderService.readApprovedBrief(brief.id),
      (err) => {
        assert.ok(err instanceof BroadcastBriefSafetyError);
        assert.equal((err as BroadcastBriefSafetyError).code, "not_approved");
        return true;
      },
    );
    await broadcastBriefBuilderService.patchBrief(
      brief.id,
      { approvalStatus: "archived" },
      { adminId: "admin_42" },
    );
    await assert.rejects(
      () => broadcastBriefBuilderService.readApprovedBrief(brief.id),
      (err) => (err as BroadcastBriefSafetyError).code === "not_approved",
    );
  });

  it("readApprovedBrief succeeds only after explicit admin approval", async () => {
    const brief = await broadcastBriefBuilderService.generateForDataPackage(
      genInput(),
      { extractor: async () => goodAiPayload() },
    );
    const approved = await broadcastBriefBuilderService.patchBrief(
      brief.id,
      { approvalStatus: "approved" },
      { adminId: "admin_42" },
    );
    assert.equal(approved.approvalStatus, "approved");
    assert.equal(approved.approvedBy, "admin_42");
    // Even after approval, safety toggles stay locked:
    assert.equal(approved.publicUrl, null);
    assert.equal(approved.signedUrl, null);
    assert.equal(approved.realSendAllowed, false);
    assert.equal(approved.executionEnabled, false);
    const read = await broadcastBriefBuilderService.readApprovedBrief(brief.id);
    assert.equal(read.id, brief.id);
  });

  it("generateForDataPackage is idempotent on dataPackageId", async () => {
    let calls = 0;
    const ext = async () => {
      calls++;
      return goodAiPayload();
    };
    const a = await broadcastBriefBuilderService.generateForDataPackage(
      genInput("dp_x"),
      { extractor: ext },
    );
    const b = await broadcastBriefBuilderService.generateForDataPackage(
      genInput("dp_x"),
      { extractor: ext },
    );
    assert.equal(a.id, b.id);
    assert.equal(calls, 1, "extractor must only run once per dataPackageId");
  });

  it("refuses to generate for non-verified knowledge", async () => {
    const dev = makeVK({ status: "developing" });
    await assert.rejects(
      () =>
        broadcastBriefBuilderService.generateForDataPackage(
          genInput("dp_dev", dev),
          { extractor: async () => goodAiPayload() },
        ),
      (err) => (err as BroadcastBriefSafetyError).code === "not_verified",
    );
  });

  it("AI payload schema accepts the canonical good shape", () => {
    const parsed = BroadcastBriefAiPayloadSchema.safeParse(goodAiPayload());
    assert.ok(parsed.success);
    if (parsed.success) {
      assert.equal(parsed.data.anchorMode, "solo_desk");
      assert.equal(parsed.data.mapNeeds.needsMap, true);
      assert.equal(parsed.data.sensitivity.minors, false);
    }
  });

  it("AI payload schema rejects malformed / out-of-range shapes", () => {
    const cases: unknown[] = [
      { ...goodAiPayload(), impactScore: "catastrophic" },
      { ...goodAiPayload(), mood: "spicy" },
      { ...goodAiPayload(), anchorMode: "skydiving_anchor" },
      { ...goodAiPayload(), scriptBeats: { coldOpen: "x" } },
      { ...goodAiPayload(), location: { city: "X", country: "Y", lat: 999, lon: 0 } },
      { ...goodAiPayload(), latitude: 200 },
      { ...goodAiPayload(), longitude: -500 },
      { ...goodAiPayload(), rightsFlags: { hasRestrictions: "yes", notes: [] } },
      { ...goodAiPayload(), mapNeeds: { needsMap: true, focus: "X", zoomHint: "galaxy" } },
    ];
    for (const c of cases) {
      const r = BroadcastBriefAiPayloadSchema.safeParse(c);
      assert.equal(r.success, false, `expected reject for ${JSON.stringify(c).slice(0, 80)}`);
    }
  });

  it("PATCH schema rejects attempts to flip safety fields", () => {
    const forbidden: unknown[] = [
      { publicUrl: "https://evil.com/leak" },
      { signedUrl: "https://signed.example/x" },
      { realSendAllowed: true },
      { executionEnabled: true },
      { visibility: "public" },
      { safetyEnvelope: { ...BROADCAST_BRIEF_SAFETY_ENVELOPE, publicPublishing: true } },
    ];
    for (const c of forbidden) {
      const r = BroadcastBriefPatchSchema.safeParse(c);
      assert.equal(r.success, false, `PATCH must reject ${JSON.stringify(c)}`);
    }
    // Sanity: a benign content patch IS accepted.
    const ok = BroadcastBriefPatchSchema.safeParse({ headline: "Updated headline" });
    assert.ok(ok.success);
  });

  it("filter by approvalStatus returns only matching briefs", async () => {
    const a = await broadcastBriefBuilderService.generateForDataPackage(
      genInput("dp_a"),
      { extractor: async () => goodAiPayload() },
    );
    await broadcastBriefBuilderService.generateForDataPackage(
      genInput("dp_b"),
      { extractor: async () => goodAiPayload() },
    );
    await broadcastBriefBuilderService.patchBrief(
      a.id,
      { approvalStatus: "approved" },
      { adminId: "admin_1" },
    );
    const drafts = await broadcastBriefBuilderService.listBriefs({
      approvalStatus: "draft",
    });
    const approved = await broadcastBriefBuilderService.listBriefs({
      approvalStatus: "approved",
    });
    assert.equal(drafts.length, 1);
    assert.equal(approved.length, 1);
    assert.equal(approved[0].id, a.id);
  });

  it("service source code contains no forbidden publish / hardware / copyright calls", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "server/services/broadcast-brief-builder-service.ts",
      "utf8",
    );
    // Strip JS/TS comments and string literals so safety NOTES that mention
    // these terms don't trigger; we only want to detect actual call sites.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");
    const forbidden: RegExp[] = [
      /\byoutubeApi\b|\byoutube\.upload/i,
      /\btiktokApi\b/i,
      /twitterClient|tweet\s*\(/i,
      /facebookApi|fbGraph/i,
      /\bpublish\s*\(/i,
      /\bbroadcastLive\s*\(/i,
      /\bresendClient\b|resend\.emails\.send/i,
      /unrealBridge/i,
      /\bfourDClient\b|fourDExecute/i,
      /movieRenderQueue/i,
      /sequencerExecute/i,
      /cinema4d/i,
      /removeWatermark/i,
      /stripLogo/i,
      /downloadVideo|fetchVideo/i,
    ];
    for (const re of forbidden) {
      assert.ok(!re.test(code), `forbidden pattern ${re} found in service source`);
    }
  });

  it("routes file contains no publish / hardware / copyright calls", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("server/routes/broadcast-briefs.ts", "utf8");
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");
    const forbidden: RegExp[] = [
      /\byoutubeApi\b|\byoutube\.upload/i,
      /\bpublish\s*\(/i,
      /unrealBridge/i,
      /\bfourDClient\b|fourDExecute/i,
      /movieRenderQueue/i,
      /sequencerExecute/i,
      /cinema4d/i,
    ];
    for (const re of forbidden) {
      assert.ok(!re.test(code), `forbidden pattern ${re} found in routes source`);
    }
  });
});
