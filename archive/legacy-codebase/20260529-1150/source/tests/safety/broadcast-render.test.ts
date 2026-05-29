/**
 * T6 — Broadcast Compositor v1 safety tests.
 *
 * These tests verify the renderer-independent safety invariants:
 *   - dryRun defaults to true
 *   - manifest always carries every source attribution
 *   - rendering a non-approved package is rejected
 *   - non-dry-run renders require the explicit founder approval flag
 *   - the service contains no external upload / signed URL / social calls
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BroadcastSafetyError,
  FOUNDER_APPROVAL_FLAG_VALUE,
  buildManifest,
  type BroadcastRenderInput,
} from "../../server/services/broadcast-compositor-service";

const baseInput: BroadcastRenderInput = {
  packageId: "pkg-test-001",
  brollPlanId: "plan-1",
  anchorVideoUrl: null,
  backgroundImageUrl: null,
  backgroundAttribution: null,
  brandLabel: "MOUGLE",
  kicker: "WORLD",
  headline: "Test headline",
  speakerName: "Voxa",
  speakerRole: "AI Presenter",
  tickerItems: ["a", "b"],
  breaking: { enabled: false, label: "BREAKING", headline: "" },
  confidence: "high",
  confidenceScore: 0.91,
  sources: [
    { name: "Reuters", url: "https://reuters.com", license: "stock_paid", tier: "stock_paid" },
    { name: "AP", url: "https://ap.org", license: "stock_paid", tier: "stock_paid" },
  ],
  durationSec: 6,
  actorId: "root_admin",
};

describe("broadcast compositor — manifest", () => {
  it("defaults dryRun to true in manifest", () => {
    const m = buildManifest(baseInput, "bc_pkgtest_xyz.mp4", true);
    assert.equal(m.dryRun, true);
    assert.equal(m.safety.publicPublishing, false);
    assert.equal(m.safety.youtubeUpload, false);
    assert.equal(m.safety.socialPosting, false);
    assert.equal(m.safety.externalUpload, false);
    assert.equal(m.safety.requiresFounderApprovalForLive, true);
  });

  it("includes every source attribution", () => {
    const m = buildManifest(baseInput, "bc_pkgtest_xyz.mp4", true);
    assert.equal(m.sources.length, baseInput.sources.length);
    for (const s of baseInput.sources) {
      const found = m.sources.find((x) => x.name === s.name);
      assert.ok(found, `source ${s.name} must appear in manifest`);
      assert.ok(found!.license, "every source must carry a license string");
    }
  });

  it("records canvas geometry and layer list", () => {
    const m = buildManifest({ ...baseInput, breaking: { enabled: true, label: "BREAKING", headline: "h" } }, "bc_pkgtest_xyz.mp4", true);
    assert.equal(m.canvas.width, 1920);
    assert.equal(m.canvas.height, 1080);
    assert.equal(m.canvas.fps, 30);
    assert.ok(m.layers.includes("lower-third"));
    assert.ok(m.layers.includes("ticker"));
    assert.ok(m.layers.includes("source-panel"));
    assert.ok(m.layers.includes("channel-bug"));
    assert.ok(m.layers.includes("breaking-bar"));
    assert.ok(m.layers.includes("watermark"));
  });
});

describe("broadcast compositor — validation gates", () => {
  const APPROVED_PKG = "pkg_safety_approved_" + Math.random().toString(36).slice(2, 8);
  const UNAPPROVED_PKG = "pkg_safety_unapproved_" + Math.random().toString(36).slice(2, 8);

  it("rejects render when package has no server-side approval row", async () => {
    const { renderBroadcast } = await import("../../server/services/broadcast-compositor-service");
    await assert.rejects(
      () => renderBroadcast({ ...baseInput, packageId: UNAPPROVED_PKG }),
      (err: unknown) => {
        assert.ok(err instanceof BroadcastSafetyError);
        assert.equal((err as BroadcastSafetyError).code, "package_not_approved");
        return true;
      },
    );
  });

  it("rejects non-dry-run renders without the founder approval flag", async () => {
    const { renderBroadcast, approvePackage, revokePackageApproval } = await import(
      "../../server/services/broadcast-compositor-service"
    );
    await approvePackage(APPROVED_PKG, "safety_test", "test seed");
    try {
      await assert.rejects(
        () =>
          renderBroadcast({
            ...baseInput,
            packageId: APPROVED_PKG,
            dryRun: false,
            founderApprovalFlag: "anything-else",
          }),
        (err: unknown) => {
          assert.ok(err instanceof BroadcastSafetyError);
          assert.equal((err as BroadcastSafetyError).code, "founder_approval_required");
          return true;
        },
      );
    } finally {
      await revokePackageApproval(APPROVED_PKG, "safety_test");
    }
  });

  it("rejects renders with no sources (after approval passes)", async () => {
    const { renderBroadcast, approvePackage, revokePackageApproval } = await import(
      "../../server/services/broadcast-compositor-service"
    );
    await approvePackage(APPROVED_PKG, "safety_test", "test seed");
    try {
      await assert.rejects(
        () => renderBroadcast({ ...baseInput, packageId: APPROVED_PKG, sources: [] }),
        (err: unknown) => {
          assert.ok(err instanceof BroadcastSafetyError);
          assert.equal((err as BroadcastSafetyError).code, "missing_sources");
          return true;
        },
      );
    } finally {
      await revokePackageApproval(APPROVED_PKG, "safety_test");
    }
  });

  it("rejects sources missing license metadata", async () => {
    const { renderBroadcast, approvePackage, revokePackageApproval } = await import(
      "../../server/services/broadcast-compositor-service"
    );
    await approvePackage(APPROVED_PKG, "safety_test", "test seed");
    try {
      await assert.rejects(
        () =>
          renderBroadcast({
            ...baseInput,
            packageId: APPROVED_PKG,
            sources: [{ name: "x", url: null, license: "" as unknown as string }],
          }),
        (err: unknown) => {
          assert.ok(err instanceof BroadcastSafetyError);
          assert.equal((err as BroadcastSafetyError).code, "incomplete_source_attribution");
          return true;
        },
      );
    } finally {
      await revokePackageApproval(APPROVED_PKG, "safety_test");
    }
  });

  it("rejects http(s) URLs for backgroundImageUrl / anchorVideoUrl (no SSRF)", async () => {
    const { renderBroadcast, approvePackage, revokePackageApproval } = await import(
      "../../server/services/broadcast-compositor-service"
    );
    await approvePackage(APPROVED_PKG, "safety_test", "test seed");
    try {
      await assert.rejects(
        () =>
          renderBroadcast({
            ...baseInput,
            packageId: APPROVED_PKG,
            backgroundImageUrl: "https://example.com/evil.jpg",
          }),
        (err: unknown) => {
          assert.ok(err instanceof BroadcastSafetyError);
          assert.equal((err as BroadcastSafetyError).code, "remote_media_rejected");
          return true;
        },
      );
      await assert.rejects(
        () =>
          renderBroadcast({
            ...baseInput,
            packageId: APPROVED_PKG,
            anchorVideoUrl: "http://internal.svc/anchor.mp4",
          }),
        (err: unknown) => {
          assert.ok(err instanceof BroadcastSafetyError);
          assert.equal((err as BroadcastSafetyError).code, "remote_media_rejected");
          return true;
        },
      );
    } finally {
      await revokePackageApproval(APPROVED_PKG, "safety_test");
    }
  });

  it("exports a non-empty founder approval flag value", () => {
    assert.ok(typeof FOUNDER_APPROVAL_FLAG_VALUE === "string");
    assert.ok(FOUNDER_APPROVAL_FLAG_VALUE.length > 8);
  });
});

describe("broadcast compositor — route surface", () => {
  it("render route schema must not accept a client-supplied packageApproved field", () => {
    const src = readFileSync(resolve(process.cwd(), "server/routes/broadcasts.ts"), "utf8");
    // The schema declaration must not list packageApproved as a parsed key.
    const schemaBlock = src.split("const RenderBodySchema")[1]?.split("});")[0] ?? "";
    assert.ok(!schemaBlock.includes("packageApproved"), "RenderBodySchema must not accept packageApproved from clients");
    // And the route must look up approval server-side.
    assert.ok(src.includes("isPackageApproved") || src.includes("listApprovedPackages") || src.includes("approvals"));
  });
});

describe("broadcast compositor — source code safety", () => {
  const src = readFileSync(
    resolve(process.cwd(), "server/services/broadcast-compositor-service.ts"),
    "utf8",
  );

  it("contains no external upload / publish / signed-url / social calls", () => {
    const banned = [
      "youtube.com/upload",
      "googleapis.com/upload",
      "uploadToYoutube",
      "publishToSocial",
      "getSignedUrl",
      "createSignedUrl",
      "twitter.com/2/tweets",
      "graph.facebook.com",
      "/v1/posts",
    ];
    for (const needle of banned) {
      assert.ok(
        !src.includes(needle),
        `broadcast-compositor-service.ts must not contain "${needle}"`,
      );
    }
  });

  it("never imports a social or youtube SDK", () => {
    assert.ok(!/from\s+["'](youtube|googleapis|twitter-api|@google-cloud|@aws-sdk\/client-s3)/.test(src));
  });

  it("requires explicit founder approval flag for non-dry-run", () => {
    assert.ok(src.includes("FOUNDER_APPROVAL_FLAG_VALUE"));
    assert.ok(src.includes("founder_approval_required"));
  });
});
