/**
 * T7 — AI Anchor Director safety tests.
 *
 * These tests verify the renderer-independent safety invariants:
 *  - shapeshift_explainer is rejected on any sensitive story
 *  - sensitive event types / moods auto-classify as sensitive even
 *    when the brief did not set the flag
 *  - the picker never selects shapeshift on a sensitive story
 *  - the heygen adapter defaults to dry-run, writes a stub clip with
 *    generation metadata, and throws on non-dry-run renders
 *  - the service has no auto-publish / external upload code paths
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import {
  ANCHOR_MODES,
  ANCHOR_MODE_REGISTRY,
  AnchorModeError,
  assertModeAllowedForSensitivity,
  isSensitiveBeat,
  listModes,
} from "../../server/services/anchor/modes";
import {
  pickModeForBeat,
  pickModeSequence,
} from "../../server/services/anchor-director-service";
import { renderAnchorBeat } from "../../server/services/anchor/heygen-adapter";

describe("anchor director — mode registry", () => {
  it("registers all six modes", () => {
    const list = listModes();
    assert.equal(list.length, 6);
    for (const m of ANCHOR_MODES) {
      assert.ok(ANCHOR_MODE_REGISTRY[m], `registry missing ${m}`);
    }
  });

  it("only shapeshift_explainer is forbidden on sensitive stories", () => {
    for (const m of ANCHOR_MODES) {
      const def = ANCHOR_MODE_REGISTRY[m];
      if (m === "shapeshift_explainer") {
        assert.equal(def.allowedForSensitive, false);
      } else {
        assert.equal(def.allowedForSensitive, true);
      }
    }
  });
});

describe("anchor director — sensitivity gate", () => {
  it("isSensitiveBeat picks up explicit flag, sensitive event types, and sensitive moods", () => {
    assert.equal(isSensitiveBeat({ sensitive: true }), true);
    assert.equal(isSensitiveBeat({ eventType: "disaster" }), true);
    assert.equal(isSensitiveBeat({ eventType: "ongoing_investigation" }), true);
    assert.equal(isSensitiveBeat({ mood: "somber" }), true);
    assert.equal(isSensitiveBeat({ mood: "neutral", eventType: "policy_update" }), false);
    assert.equal(isSensitiveBeat({}), false);
  });

  it("assertModeAllowedForSensitivity rejects shapeshift on sensitive stories", () => {
    assert.throws(
      () => assertModeAllowedForSensitivity("shapeshift_explainer", true),
      (err: unknown) => {
        assert.ok(err instanceof AnchorModeError);
        assert.equal((err as AnchorModeError).code, "mode_blocked_sensitive");
        assert.equal((err as AnchorModeError).status, 403);
        return true;
      },
    );
  });

  it("assertModeAllowedForSensitivity allows shapeshift on non-sensitive stories", () => {
    assert.doesNotThrow(() => assertModeAllowedForSensitivity("shapeshift_explainer", false));
  });

  it("assertModeAllowedForSensitivity allows every other mode on sensitive stories", () => {
    for (const m of ANCHOR_MODES) {
      if (m === "shapeshift_explainer") continue;
      assert.doesNotThrow(() => assertModeAllowedForSensitivity(m, true));
    }
  });

  it("rejects unknown modes", () => {
    assert.throws(
      () => assertModeAllowedForSensitivity("not_a_mode" as any, false),
      (err: unknown) => {
        assert.ok(err instanceof AnchorModeError);
        assert.equal((err as AnchorModeError).code, "unknown_mode");
        return true;
      },
    );
  });
});

describe("anchor director — picker", () => {
  it("never picks shapeshift on a sensitive brief, even at trailing beats", () => {
    const brief = { packageId: "p1", mood: "feature", eventType: "disaster", sensitive: null };
    const beats = [0, 1, 2, 3, 4, 5].map((i) => ({ index: i, text: `beat ${i}` }));
    const picks = pickModeSequence(brief, beats);
    assert.equal(picks.length, beats.length);
    for (const pick of picks) {
      assert.notEqual(pick.mode, "shapeshift_explainer", `beat ${pick.beatIndex} picked shapeshift on a sensitive brief`);
      assert.equal(pick.sensitive, true);
    }
  });

  it("blocks an admin override of shapeshift on a sensitive brief", () => {
    const brief = { packageId: "p1", mood: "neutral", eventType: "conflict" };
    assert.throws(
      () =>
        pickModeForBeat(brief, {
          index: 3,
          text: "wrap",
          modeOverride: "shapeshift_explainer",
        }),
      (err: unknown) => {
        assert.ok(err instanceof AnchorModeError);
        assert.equal((err as AnchorModeError).code, "mode_blocked_sensitive");
        return true;
      },
    );
  });

  it("can pick shapeshift on a non-sensitive feature beat", () => {
    const brief = { packageId: "p2", mood: "feature", eventType: "feature_story", sensitive: false };
    const pick = pickModeForBeat(brief, { index: 3, text: "playful closer" });
    assert.equal(pick.mode, "shapeshift_explainer");
    assert.equal(pick.sensitive, false);
  });

  it("opens sensitive briefs with desk_anchor", () => {
    const pick = pickModeForBeat(
      { packageId: "p3", mood: "neutral", eventType: "disaster" },
      { index: 0, text: "open" },
    );
    assert.equal(pick.mode, "desk_anchor");
    assert.equal(pick.sensitive, true);
  });

  it("picks data_wall_analyst for analytical beats", () => {
    const pick = pickModeForBeat(
      { packageId: "p4", mood: "analytical", eventType: "policy_update" },
      { index: 1, text: "numbers" },
    );
    assert.equal(pick.mode, "data_wall_analyst");
  });
});

describe("anchor director — heygen adapter", () => {
  it("defaults to dry-run and writes a stub clip with generation metadata", async () => {
    const result = await renderAnchorBeat({
      packageId: "tst-pkg-safety",
      beatIndex: 7,
      mode: "desk_anchor",
      sensitive: false,
      text: "hello world",
    });
    assert.equal(result.dryRun, true);
    assert.equal(result.presetId, ANCHOR_MODE_REGISTRY.desk_anchor.presetId);
    assert.equal(result.framing, ANCHOR_MODE_REGISTRY.desk_anchor.framing);
    assert.ok(result.clipPath.endsWith(".mp4"));
    assert.ok(result.clipPath.includes("anchors"), "clip must be under an anchors/ dir");
    assert.equal(result.clipUrl, null, "no public/signed URL is ever returned");
    assert.ok(existsSync(result.clipPath));
    const head = readFileSync(result.clipPath).slice(0, 32).toString("utf8");
    assert.ok(head.startsWith("MOUGLE_ANCHOR_STUB_T7_DRY_RUN"), "stub header must be present");
    assert.equal(result.generationMetadata.provider, "heygen_stub");
    assert.equal(result.generationMetadata.mode, "desk_anchor");
    assert.equal(result.generationMetadata.sensitive, false);
    assert.ok(typeof result.generationMetadata.requestedAt === "string");
    unlinkSync(result.clipPath);
  });

  it("re-rejects shapeshift on a sensitive story at the adapter layer", async () => {
    await assert.rejects(
      () =>
        renderAnchorBeat({
          packageId: "tst-pkg-sens",
          beatIndex: 0,
          mode: "shapeshift_explainer",
          sensitive: true,
          text: "should not render",
        }),
      (err: unknown) => {
        assert.ok(err instanceof AnchorModeError);
        assert.equal((err as AnchorModeError).code, "mode_blocked_sensitive");
        return true;
      },
    );
  });

  it("rejects non-dry-run renders in this phase", async () => {
    await assert.rejects(
      () =>
        renderAnchorBeat({
          packageId: "tst-pkg-live",
          beatIndex: 0,
          mode: "desk_anchor",
          sensitive: false,
          text: "live attempt",
          dryRun: false,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AnchorModeError);
        assert.ok(
          ["live_render_not_configured", "live_render_disabled"].includes(
            (err as AnchorModeError).code,
          ),
          `unexpected code: ${(err as AnchorModeError).code}`,
        );
        return true;
      },
    );
  });
});

describe("anchor director — source contains no auto-publish paths", () => {
  const files = [
    "server/services/anchor-director-service.ts",
    "server/services/anchor/modes.ts",
    "server/services/anchor/heygen-adapter.ts",
    "server/routes/anchor.ts",
  ];

  for (const f of files) {
    it(`${f} has no external upload / signed URL / social publish code`, () => {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      const banned = [
        "youtube.com/upload",
        "googleapis.com/youtube",
        "graph.facebook.com",
        "api.twitter.com",
        "api.x.com",
        "open.tiktokapis.com",
        "api.linkedin.com",
        "getSignedUrl",
        "createSignedUrl",
        "signedUrl(",
      ];
      for (const term of banned) {
        assert.equal(src.includes(term), false, `${f} must not contain "${term}"`);
      }
    });
  }
});
