/**
 * Newsroom T5 — Newsroom Package safety tests.
 *
 * SAFETY INVARIANTS UNDER TEST:
 *   1. Every newly generated package is `status='draft'`.
 *   2. Every 4D cue has `simulationOnly: true` and NO hardware-payload key.
 *   3. The cue schema is strict — unknown / executable keys are rejected.
 *   4. Generation refuses to use a brief that is not `approved`.
 *   5. readApprovedPackage refuses anything not in 'approved'.
 *   6. Generation is idempotent on briefId.
 *   7. PATCH rejects cues that are missing `simulationOnly` or carry
 *      hardware payloads.
 *   8. PATCH schema is strict — safety-adjacent extras are rejected.
 *   9. Service + route source code contains no publish / hardware /
 *      Unreal / 4D-hardware / copyrighted-fetch calls.
 *  10. buildPackagePayloadFromBrief is a deterministic pure mapping.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildPackagePayloadFromBrief,
  newsroomPackageBuilderService,
  NewsroomPackageSafetyError,
} from "../../server/services/newsroom-package-builder-service";
import {
  broadcastBriefBuilderService,
} from "../../server/services/broadcast-brief-builder-service";
import {
  NewsroomFourDCueSchema,
  NewsroomPackagePatchSchema,
  type BroadcastBriefAiPayload,
  type VerifiedKnowledge,
} from "../../shared/newsroom-types";

const ISO = "2026-05-18T12:00:00.000Z";

function makeVK(overrides: Partial<VerifiedKnowledge> = {}): VerifiedKnowledge {
  return {
    id: "vk_t5_001",
    clusterId: "cl_t5_001",
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
        clusterId: "cl_t5_001",
        verifiedKnowledgeId: "vk_t5_001",
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
      keyFacts:
        "The model expands context dramatically and was released on 2026-05-15 in San Francisco.",
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

async function approvedBrief(
  dataPackageId: string,
  payloadOverrides: Partial<BroadcastBriefAiPayload> = {},
  vk: VerifiedKnowledge = makeVK(),
) {
  const draft = await broadcastBriefBuilderService.generateForDataPackage(
    {
      dataPackageId,
      storyId: vk.id,
      articleId: null,
      verifiedKnowledge: vk,
    },
    {
      extractor: async () => goodAiPayload(payloadOverrides),
      now: () => new Date(ISO),
    },
  );
  return broadcastBriefBuilderService.patchBrief(
    draft.id,
    { approvalStatus: "approved" },
    { adminId: "admin_t5" },
  );
}

describe("NewsroomPackageBuilderService — safety invariants", () => {
  beforeEach(async () => {
    await newsroomPackageBuilderService._resetForTests();
    await broadcastBriefBuilderService._resetForTests();
  });

  it("generated package is draft + every 4D cue is simulationOnly", async () => {
    const brief = await approvedBrief("dp_t5_a", { breakingNews: true });
    const pkg = await newsroomPackageBuilderService.generateForBrief(brief.id);
    assert.equal(pkg.status, "draft");
    assert.equal(pkg.approvedBy, null);
    assert.ok(pkg.fourDCues.length > 0, "expected at least one cue");
    for (const cue of pkg.fourDCues) {
      assert.equal(cue.simulationOnly, true, "simulationOnly must be true");
      // Hard-refuse hardware-payload-style keys at the type level:
      for (const forbidden of [
        "payload",
        "hardwarePayload",
        "deviceId",
        "execute",
        "command",
        "fire",
        "url",
      ] as const) {
        assert.equal(
          (cue as unknown as Record<string, unknown>)[forbidden],
          undefined,
          `cue must not carry "${forbidden}"`,
        );
      }
    }
  });

  it("LED wall surfaces sensitivity labels and ticker reflects breaking news", async () => {
    const brief = await approvedBrief("dp_t5_b", {
      breakingNews: true,
      sensitivity: {
        graphicViolence: false,
        minors: true,
        disputed: true,
        medical: false,
        electoral: false,
        legal: false,
        death: false,
        financial: false,
        notes: [],
      },
    });
    const pkg = await newsroomPackageBuilderService.generateForBrief(brief.id);
    assert.ok(pkg.ledWall.safetyLabels.includes("INTERNAL_REVIEW_ONLY"));
    assert.ok(pkg.ledWall.safetyLabels.includes("DISPUTED"));
    assert.ok(pkg.ledWall.safetyLabels.includes("MINORS_SENSITIVE"));
    assert.ok(pkg.ticker.startsWith("BREAKING — "));
    assert.equal(pkg.confidencePanel.breakingNews, true);
    assert.equal(pkg.confidencePanel.label, "low");
  });

  it("cue schema rejects missing simulationOnly and unknown/hardware keys", () => {
    const baseGood = {
      id: "cue_x",
      beat: "cold_open",
      kind: "rumble",
      intensity: "low",
      reason: "ok",
      simulationOnly: true,
    };
    assert.ok(NewsroomFourDCueSchema.safeParse(baseGood).success);

    const bads: unknown[] = [
      { ...baseGood, simulationOnly: false },
      { ...baseGood, simulationOnly: undefined },
      // Strict shape: extra hardware-shaped keys are rejected
      { ...baseGood, payload: { url: "http://x" } },
      { ...baseGood, hardwarePayload: { device: "rumbleSeat" } },
      { ...baseGood, deviceId: "d1" },
      { ...baseGood, execute: true },
      { ...baseGood, kind: "explosion" },
      { ...baseGood, intensity: "catastrophic" },
      { ...baseGood, beat: "ad_break" },
    ];
    for (const c of bads) {
      const r = NewsroomFourDCueSchema.safeParse(c);
      assert.equal(r.success, false, `cue must be rejected: ${JSON.stringify(c)}`);
    }
  });

  it("readApprovedPackage refuses draft and unknown ids", async () => {
    const brief = await approvedBrief("dp_t5_c");
    const pkg = await newsroomPackageBuilderService.generateForBrief(brief.id);
    await assert.rejects(
      () => newsroomPackageBuilderService.readApprovedPackage(pkg.id),
      (err) => {
        assert.ok(err instanceof NewsroomPackageSafetyError);
        assert.equal((err as NewsroomPackageSafetyError).code, "not_approved");
        return true;
      },
    );
    await assert.rejects(
      () => newsroomPackageBuilderService.readApprovedPackage("pkg_does_not_exist"),
      (err) => (err as NewsroomPackageSafetyError).code === "not_found",
    );
  });

  it("approvePackage promotes to approved and only then readApprovedPackage succeeds", async () => {
    const brief = await approvedBrief("dp_t5_d");
    const pkg = await newsroomPackageBuilderService.generateForBrief(brief.id);
    const approved = await newsroomPackageBuilderService.approvePackage(pkg.id, {
      adminId: "admin_t5",
    });
    assert.equal(approved.status, "approved");
    assert.equal(approved.approvedBy, "admin_t5");
    const got = await newsroomPackageBuilderService.readApprovedPackage(pkg.id);
    assert.equal(got.id, pkg.id);
  });

  it("generateForBrief is idempotent on briefId", async () => {
    const brief = await approvedBrief("dp_t5_e");
    const a = await newsroomPackageBuilderService.generateForBrief(brief.id);
    const b = await newsroomPackageBuilderService.generateForBrief(brief.id);
    assert.equal(a.id, b.id);
    assert.deepEqual(a.fourDCues, b.fourDCues);
  });

  it("generation refuses non-approved briefs", async () => {
    const vk = makeVK();
    const draft = await broadcastBriefBuilderService.generateForDataPackage(
      {
        dataPackageId: "dp_t5_draft",
        storyId: vk.id,
        articleId: null,
        verifiedKnowledge: vk,
      },
      { extractor: async () => goodAiPayload() },
    );
    // brief is still 'draft' → newsroom package builder must refuse
    await assert.rejects(
      () => newsroomPackageBuilderService.generateForBrief(draft.id),
      (err) => {
        // Bubbled from BroadcastBriefSafetyError
        const e = err as { code?: string; name?: string };
        return e.code === "not_approved" || e.name === "BroadcastBriefSafetyError";
      },
    );
  });

  it("PATCH rejects cues missing simulationOnly or carrying hardware payloads", async () => {
    const brief = await approvedBrief("dp_t5_f");
    const pkg = await newsroomPackageBuilderService.generateForBrief(brief.id);

    await assert.rejects(
      () =>
        newsroomPackageBuilderService.patchPackage(
          pkg.id,
          {
            fourDCues: [
              {
                id: "c1",
                beat: "cold_open",
                kind: "rumble",
                intensity: "low",
                reason: "bad",
                // @ts-expect-error testing runtime guard
                simulationOnly: false,
              },
            ],
          },
          { adminId: "admin_t5" },
        ),
      (err) =>
        (err as NewsroomPackageSafetyError).code === "cue_not_simulation_only",
    );

    await assert.rejects(
      () =>
        newsroomPackageBuilderService.patchPackage(
          pkg.id,
          // @ts-expect-error testing runtime guard against hardware payloads
          {
            fourDCues: [
              {
                id: "c1",
                beat: "cold_open",
                kind: "rumble",
                intensity: "low",
                reason: "bad",
                simulationOnly: true,
                payload: { device: "rumbleSeat", command: "fire" },
              },
            ],
          },
          { adminId: "admin_t5" },
        ),
      (err) =>
        (err as NewsroomPackageSafetyError).code === "cue_not_simulation_only",
    );
  });

  it("PATCH schema rejects unknown / safety-adjacent extras", () => {
    const forbidden: unknown[] = [
      { publicUrl: "https://evil.example" },
      { signedUrl: "https://signed.example" },
      { realSendAllowed: true },
      { executionEnabled: true },
      { approvedBy: "self" },
      { briefId: "different_brief" },
    ];
    for (const c of forbidden) {
      const r = NewsroomPackagePatchSchema.safeParse(c);
      assert.equal(r.success, false, `PATCH must reject ${JSON.stringify(c)}`);
    }
    const ok = NewsroomPackagePatchSchema.safeParse({ ticker: "Updated ticker" });
    assert.ok(ok.success);
  });

  it("buildPackagePayloadFromBrief is a deterministic pure mapping", async () => {
    const brief = await approvedBrief("dp_t5_pure");
    const a = buildPackagePayloadFromBrief(brief);
    const b = buildPackagePayloadFromBrief(brief);
    assert.deepEqual(a, b);
    // The mapping does NOT mutate the brief input:
    const briefClone = JSON.parse(JSON.stringify(brief));
    buildPackagePayloadFromBrief(brief);
    assert.deepEqual(brief, briefClone);
  });

  it("approving a brief through patchBrief + route hook idempotently produces a draft package", async () => {
    // This mirrors what the broadcast-briefs PATCH route does after
    // setting approvalStatus='approved': it idempotently calls
    // newsroomPackageBuilderService.generateForBrief(brief.id). We run
    // the same call path here without HTTP so the auto-build contract
    // is covered by safety tests.
    const vk = makeVK({ id: "vk_t5_auto", clusterId: "cl_t5_auto" });
    const draft = await broadcastBriefBuilderService.generateForDataPackage(
      {
        dataPackageId: "dp_t5_auto",
        storyId: vk.id,
        articleId: null,
        verifiedKnowledge: vk,
      },
      { extractor: async () => goodAiPayload() },
    );
    const approved = await broadcastBriefBuilderService.patchBrief(
      draft.id,
      { approvalStatus: "approved" },
      { adminId: "admin_t5_auto" },
    );
    assert.equal(approved.approvalStatus, "approved");

    // First auto-build (what the route does after approve)
    const a = await newsroomPackageBuilderService.generateForBrief(approved.id);
    assert.equal(a.status, "draft");
    assert.equal(a.briefId, approved.id);
    // Second call (e.g. re-approve / replay) must be idempotent — same id
    const b = await newsroomPackageBuilderService.generateForBrief(approved.id);
    assert.equal(a.id, b.id);

    // Admin can edit, then approve, then downstream may read.
    const edited = await newsroomPackageBuilderService.patchPackage(
      a.id,
      { ticker: "Edited ticker for auto-build flow" },
      { adminId: "admin_t5_auto" },
    );
    assert.equal(edited.ticker, "Edited ticker for auto-build flow");

    const approvedPkg = await newsroomPackageBuilderService.approvePackage(
      a.id,
      { adminId: "admin_t5_auto" },
    );
    assert.equal(approvedPkg.status, "approved");

    const downstream = await newsroomPackageBuilderService.readApprovedPackage(a.id);
    assert.equal(downstream.id, a.id);
  });

  it("service source code contains no publish / hardware / copyright calls", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "server/services/newsroom-package-builder-service.ts",
      "utf8",
    );
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
      /\bfourDClient\b|fourDExecute|fourDDispatch/i,
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

  it("routes source code contains no publish / hardware / copyright calls", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("server/routes/newsroom-packages.ts", "utf8");
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
      /\bfourDClient\b|fourDExecute|fourDDispatch/i,
      /movieRenderQueue/i,
      /sequencerExecute/i,
      /cinema4d/i,
      /removeWatermark/i,
      /stripLogo/i,
    ];
    for (const re of forbidden) {
      assert.ok(!re.test(code), `forbidden pattern ${re} found in routes source`);
    }
  });
});
