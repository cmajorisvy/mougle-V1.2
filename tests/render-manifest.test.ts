import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_RENDER_MANIFEST_VERSION,
  EVENT_MEDIA_MODES,
  RIGHTS_GATES,
  buildLockedSafetyFlags,
  fromNewsroomRenderManifest,
  isRenderableGate,
  normalizeRenderManifest,
  rightsStatusToRightsGate,
  summarizeRenderManifestCompliance,
  toMp4PreviewOptions,
  toRemotionScenePackage,
  validateRenderManifest,
  type RenderManifest,
} from "../shared/render-manifest";
import type {
  NewsroomRenderManifest,
  RightsStatus,
} from "../shared/newsroom-types";

const ISO = "2026-05-16T12:00:00.000Z";

function baseLayers() {
  return [
    { key: "bg", kind: "background" as const, zIndex: 0, visible: true },
    { key: "anchor", kind: "anchor" as const, zIndex: 1, visible: true },
    { key: "lt", kind: "lower_third" as const, zIndex: 2, visible: true },
    { key: "tk", kind: "ticker" as const, zIndex: 3, visible: true },
    { key: "cap", kind: "caption" as const, zIndex: 4, visible: true },
  ];
}

function baseSafeZones() {
  const pct = (x: number, y: number, w: number, h: number, purpose: any) => ({
    x,
    y,
    width: w,
    height: h,
    unit: "percent" as const,
    purpose,
  });
  return {
    anchorSafeZone: pct(30, 10, 40, 75, "anchor"),
    lowerThirdZone: pct(5, 75, 90, 10, "lower-third"),
    tickerZone: pct(0, 92, 100, 6, "ticker"),
    captionZone: pct(10, 85, 80, 6, "caption"),
    monitorPanelZones: [
      { ...pct(70, 15, 25, 35, "monitor"), panelKey: "right_panel" },
    ],
  };
}

function baseTextSafety() {
  return {
    maxHeadlineChars: 80,
    maxLowerThirdChars: 80,
    maxTickerChars: 120,
    maxCaptionCharsPerCue: 90,
    maxCaptionLinesPerCue: 2,
  };
}

function makeManifest(overrides: Partial<RenderManifest> = {}): RenderManifest {
  return {
    contractVersion: CANONICAL_RENDER_MANIFEST_VERSION,
    manifestId: "mf_test_001",
    packageId: "pkg_001",
    packageVersion: 1,
    canvas: { width: 1920, height: 1080, pixelAspect: 1 },
    fps: 30,
    duration: { totalMs: 30000 },
    scenes: [
      { sceneIndex: 0, startMs: 0, endMs: 15000, label: "intro" },
      { sceneIndex: 1, startMs: 15000, endMs: 30000, label: "body" },
    ],
    layers: baseLayers(),
    safeZones: baseSafeZones(),
    textSafety: baseTextSafety(),
    tracks: {
      anchor: [
        {
          sceneIndex: 0,
          startMs: 0,
          endMs: 15000,
          speakerLabel: "Anchor",
          narrationText: "Welcome to Mougle verified update.",
        },
        {
          sceneIndex: 1,
          startMs: 15000,
          endMs: 30000,
          speakerLabel: "Anchor",
          narrationText: "Body of the story.",
        },
      ],
      voice: [
        { source: "tts", startMs: 0, endMs: 30000, gainDb: 0 },
      ],
      caption: {
        format: "srt",
        cues: [
          { index: 0, startMs: 0, endMs: 5000, text: "Welcome." },
          { index: 1, startMs: 5000, endMs: 30000, text: "Body." },
        ],
        overflowFindings: [],
      },
      lowerThird: [
        { startMs: 0, endMs: 8000, primary: "GPT-5.5 released", secondary: "OpenAI" },
      ],
      ticker: { items: ["Item A", "Item B"], loopMs: 20000 },
      monitorPanels: [
        { panelKey: "right_panel", cues: [{ startMs: 0, endMs: 30000, content: "Live data" }] },
      ],
      eventMedia: [],
    },
    transitionCues: [],
    musicSfxCues: [],
    storageRefs: {},
    compliance: { blocking: [], warnings: [] },
    safety: buildLockedSafetyFlags([]),
    generatedAt: ISO,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Enums + mapping helpers                                            */
/* ------------------------------------------------------------------ */

describe("event-media modes + rights-gate enum", () => {
  it("event-media modes are exactly the four required values", () => {
    assert.deepEqual(EVENT_MEDIA_MODES.slice().sort(), [
      "background_screen",
      "disabled",
      "fullscreen",
      "picture_in_picture",
    ]);
  });

  it("rights-gate values are exactly the five required values", () => {
    assert.deepEqual(RIGHTS_GATES.slice().sort(), [
      "approved_for_use",
      "internal_reference_only",
      "needs_review",
      "rejected",
      "unknown",
    ]);
  });

  it("rightsStatusToRightsGate maps every RightsStatus deterministically", () => {
    const cases: [RightsStatus, string][] = [
      ["owned", "approved_for_use"],
      ["licensed", "approved_for_use"],
      ["fair_use_review", "needs_review"],
      ["rights_unknown", "unknown"],
      ["blocked", "rejected"],
    ];
    for (const [s, g] of cases) assert.equal(rightsStatusToRightsGate(s), g);
  });

  it("only approved_for_use is renderable", () => {
    assert.equal(isRenderableGate("approved_for_use"), true);
    for (const g of RIGHTS_GATES) {
      if (g === "approved_for_use") continue;
      assert.equal(isRenderableGate(g), false, `gate=${g}`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Schema validation                                                  */
/* ------------------------------------------------------------------ */

describe("validateRenderManifest", () => {
  it("accepts a well-formed manifest", () => {
    const r = validateRenderManifest(makeManifest());
    assert.equal(r.ok, true, JSON.stringify(r.issues));
  });

  it("rejects when a scene window exceeds totalMs", () => {
    const bad = makeManifest({
      scenes: [
        { sceneIndex: 0, startMs: 0, endMs: 60000, label: "too_long" },
      ],
    });
    const r = validateRenderManifest(bad);
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === "scene_exceeds_duration"));
  });

  it("rejects when an eventMedia cue has inconsistent renderable flag", () => {
    const bad = makeManifest({
      tracks: {
        ...makeManifest().tracks,
        eventMedia: [
          {
            mediaId: "m_1",
            kind: "image",
            mode: "fullscreen",
            rightsGate: "approved_for_use",
            startMs: 0,
            endMs: 5000,
            renderable: false, // wrong — should be true
            storageRef: null,
            note: null,
            rightsStatusSource: "owned",
          },
        ],
      },
    });
    const r = validateRenderManifest(bad);
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === "renderable_inconsistent"));
  });

  it("rejects tampered safety flags at the Zod level", () => {
    const tampered = {
      ...makeManifest(),
      safety: { ...makeManifest().safety, publicPublishing: true },
    };
    const r = validateRenderManifest(tampered);
    assert.equal(r.ok, false);
    // Zod literal mismatch is reported before our cross-field check.
    assert.ok(r.issues.length > 0);
  });
});

/* ------------------------------------------------------------------ */
/* Normalization                                                      */
/* ------------------------------------------------------------------ */

describe("normalizeRenderManifest", () => {
  it("resolves renderable from mode + rightsGate and sorts cues", () => {
    const base = makeManifest();
    const m: RenderManifest = {
      ...base,
      tracks: {
        ...base.tracks,
        eventMedia: [
          {
            mediaId: "z",
            kind: "image",
            mode: "fullscreen",
            rightsGate: "rejected",
            startMs: 10000,
            endMs: 12000,
            renderable: true, // will be corrected to false
            storageRef: null,
            note: null,
            rightsStatusSource: "blocked",
          },
          {
            mediaId: "a",
            kind: "image",
            mode: "disabled",
            rightsGate: "approved_for_use",
            startMs: 0,
            endMs: 2000,
            renderable: true, // disabled → false
            storageRef: null,
            note: null,
            rightsStatusSource: "owned",
          },
          {
            mediaId: "b",
            kind: "image",
            mode: "picture_in_picture",
            rightsGate: "approved_for_use",
            startMs: 1000,
            endMs: 3000,
            renderable: false, // → true
            storageRef: null,
            note: null,
            rightsStatusSource: "licensed",
          },
        ],
      },
    };
    const n = normalizeRenderManifest(m);
    const em = n.tracks.eventMedia;
    // Sorted by startMs
    assert.deepEqual(em.map((e) => e.mediaId), ["a", "b", "z"]);
    // Disabled mode → renderable false
    assert.equal(em.find((e) => e.mediaId === "a")!.renderable, false);
    // Approved PIP → renderable true
    assert.equal(em.find((e) => e.mediaId === "b")!.renderable, true);
    // Rejected gate → renderable false
    assert.equal(em.find((e) => e.mediaId === "z")!.renderable, false);
    // And the resulting manifest validates clean
    const v = validateRenderManifest(n);
    assert.equal(v.ok, true, JSON.stringify(v.issues));
  });

  it("is deterministic across runs for identical input", () => {
    const m = makeManifest();
    const a = normalizeRenderManifest(m);
    const b = normalizeRenderManifest(m);
    assert.deepEqual(a, b);
  });
});

/* ------------------------------------------------------------------ */
/* FFmpeg adapter                                                     */
/* ------------------------------------------------------------------ */

describe("toMp4PreviewOptions (FFmpeg adapter)", () => {
  it("projects scenes + anchor narration into the existing Mp4PreviewOptions shape", () => {
    const out = toMp4PreviewOptions(makeManifest(), {
      title: "Test",
      watermarkLabel: "INTERNAL PREVIEW",
    });
    assert.equal(out.title, "Test");
    assert.equal(out.watermarkLabel, "INTERNAL PREVIEW");
    assert.equal(out.segments.length, 2);
    assert.equal(out.segments[0].speakerLabel, "Anchor");
    assert.equal(
      out.segments[0].textPreview,
      "Welcome to Mougle verified update.",
    );
    assert.equal(out.segments[1].startMs, 15000);
    assert.equal(out.segments[1].endMs, 30000);
  });

  it("falls back to scene label when no anchor cue is present", () => {
    const m = makeManifest({
      tracks: { ...makeManifest().tracks, anchor: [] },
    });
    const out = toMp4PreviewOptions(m, {
      title: "T",
      watermarkLabel: "W",
    });
    assert.equal(out.segments[0].speakerLabel, "Anchor");
    assert.equal(out.segments[0].textPreview, "intro");
  });
});

/* ------------------------------------------------------------------ */
/* Remotion adapter                                                   */
/* ------------------------------------------------------------------ */

describe("toRemotionScenePackage", () => {
  it("converts time windows to frames using the canonical fps", () => {
    const out = toRemotionScenePackage(makeManifest());
    assert.equal(out.fps, 30);
    assert.equal(out.durationInFrames, Math.round((30000 / 1000) * 30));
    assert.equal(out.scenes[0].startFrame, 0);
    assert.equal(out.scenes[0].endFrame, 450);
    assert.equal(out.scenes[1].endFrame, 900);
    // Caption + safety pass through.
    assert.equal(out.captions.length, 2);
    assert.equal(out.safety.publicPublishing, false);
    assert.equal(out.safety.youtubeUpload, false);
    assert.equal(out.safety.socialPosting, false);
  });

  it("scopes lowerThirds and eventMedia to each scene's window", () => {
    const base = makeManifest();
    const m: RenderManifest = {
      ...base,
      tracks: {
        ...base.tracks,
        lowerThird: [
          { startMs: 0, endMs: 5000, primary: "Scene 0", secondary: null },
          { startMs: 16000, endMs: 18000, primary: "Scene 1", secondary: null },
        ],
        eventMedia: [
          {
            mediaId: "m0",
            kind: "image",
            mode: "background_screen",
            rightsGate: "approved_for_use",
            startMs: 0,
            endMs: 4000,
            renderable: true,
            storageRef: { storageKey: "media/m0.jpg" },
            note: null,
            rightsStatusSource: "owned",
          },
          {
            mediaId: "m1",
            kind: "image",
            mode: "picture_in_picture",
            rightsGate: "approved_for_use",
            startMs: 20000,
            endMs: 25000,
            renderable: true,
            storageRef: { storageKey: "media/m1.jpg" },
            note: null,
            rightsStatusSource: "licensed",
          },
        ],
      },
    };
    const out = toRemotionScenePackage(m);
    assert.deepEqual(out.scenes[0].lowerThirds.map((l) => l.primary), ["Scene 0"]);
    assert.deepEqual(out.scenes[1].lowerThirds.map((l) => l.primary), ["Scene 1"]);
    assert.deepEqual(out.scenes[0].eventMedia.map((e) => e.mediaId), ["m0"]);
    assert.deepEqual(out.scenes[1].eventMedia.map((e) => e.mediaId), ["m1"]);
    assert.equal(out.scenes[0].eventMedia[0].storageKey, "media/m0.jpg");
  });
});

/* ------------------------------------------------------------------ */
/* Backward-compat adapter                                            */
/* ------------------------------------------------------------------ */

describe("fromNewsroomRenderManifest (backward compat)", () => {
  function makeNewsroomManifest(): NewsroomRenderManifest {
    return {
      packageId: "pkg_legacy",
      packageVersion: 2,
      format: {
        width: 1920,
        height: 1080,
        fps: 30,
        videoCodec: "h264",
        audioCodec: "aac",
        captionFormat: "srt",
      },
      layers: baseLayers(),
      safeZones: baseSafeZones(),
      textSafety: baseTextSafety(),
      timing: {
        totalDurationMs: 20000,
        segments: [
          {
            segmentIndex: 0,
            startMs: 0,
            endMs: 10000,
            lowerThirdVisible: true,
            tickerVisible: true,
            captionWindow: { startMs: 0, endMs: 10000 },
            sourceClaimIds: ["claim_1"],
          },
          {
            segmentIndex: 1,
            startMs: 10000,
            endMs: 20000,
            lowerThirdVisible: false,
            tickerVisible: true,
            captionWindow: { startMs: 10000, endMs: 20000 },
            sourceClaimIds: ["claim_2"],
          },
        ],
      },
      captionsPlan: {
        cues: [
          { index: 0, startMs: 0, endMs: 10000, text: "Intro" },
          { index: 1, startMs: 10000, endMs: 20000, text: "Body" },
        ],
        overflowFindings: [],
      },
      mediaPlan: [
        {
          mediaId: "m_owned",
          layer: "background",
          startMs: 0,
          endMs: 10000,
          rightsStatus: "owned",
        },
        {
          mediaId: "m_blocked",
          layer: "insert",
          startMs: 10000,
          endMs: 20000,
          rightsStatus: "blocked",
        },
      ],
      compliance: { blocking: [], warnings: [] },
      safety: {
        internalAdminReviewOnly: true,
        manualRootAdminTriggerOnly: true,
        publicPublishing: false,
        youtubeUpload: false,
        socialPosting: false,
        blockingFindings: [],
        warningFindings: [],
        rightsIssues: [],
      },
      generatedAt: ISO,
    };
  }

  it("upgrades a legacy NewsroomRenderManifest into a valid canonical manifest", () => {
    const legacy = makeNewsroomManifest();
    const m = fromNewsroomRenderManifest(legacy, { manifestId: "mf_from_legacy" });
    const v = validateRenderManifest(m);
    assert.equal(v.ok, true, JSON.stringify(v.issues));
    assert.equal(m.canvas.width, 1920);
    assert.equal(m.canvas.height, 1080);
    assert.equal(m.fps, 30);
    assert.equal(m.duration.totalMs, 20000);
    assert.equal(m.scenes.length, 2);
    assert.equal(m.tracks.caption.cues.length, 2);
    // Media plan was mapped through the rights gate.
    const ownedCue = m.tracks.eventMedia.find((e) => e.mediaId === "m_owned")!;
    const blockedCue = m.tracks.eventMedia.find((e) => e.mediaId === "m_blocked")!;
    assert.equal(ownedCue.rightsGate, "approved_for_use");
    assert.equal(ownedCue.mode, "background_screen");
    assert.equal(ownedCue.renderable, true);
    assert.equal(blockedCue.rightsGate, "rejected");
    assert.equal(blockedCue.mode, "picture_in_picture");
    assert.equal(blockedCue.renderable, false);
    // Safety is re-locked.
    assert.equal(m.safety.publicPublishing, false);
    assert.equal(m.safety.youtubeUpload, false);
    assert.equal(m.safety.socialPosting, false);
    assert.equal(m.safety.autonomousExecution, false);
  });

  it("preserves legacy timing metadata (tickerVisible, lowerThirdVisible, captionWindow, sourceClaimIds) on each scene", () => {
    const legacy = makeNewsroomManifest();
    const m = fromNewsroomRenderManifest(legacy, { manifestId: "mf_legacy_meta" });
    // Scene 0
    const s0 = m.scenes[0].legacy!;
    assert.equal(s0.tickerVisible, true);
    assert.equal(s0.lowerThirdVisible, true);
    assert.deepEqual(s0.captionWindow, { startMs: 0, endMs: 10000 });
    assert.deepEqual(s0.sourceClaimIds, ["claim_1"]);
    // Scene 1
    const s1 = m.scenes[1].legacy!;
    assert.equal(s1.tickerVisible, true);
    assert.equal(s1.lowerThirdVisible, false);
    assert.deepEqual(s1.captionWindow, { startMs: 10000, endMs: 20000 });
    assert.deepEqual(s1.sourceClaimIds, ["claim_2"]);
    // And it still validates clean.
    const v = validateRenderManifest(m);
    assert.equal(v.ok, true, JSON.stringify(v.issues));
  });
});

/* ------------------------------------------------------------------ */
/* Compliance summary                                                 */
/* ------------------------------------------------------------------ */

describe("summarizeRenderManifestCompliance", () => {
  it("counts renderable, gated, and rejected media correctly", () => {
    const base = makeManifest();
    const m: RenderManifest = {
      ...base,
      tracks: {
        ...base.tracks,
        eventMedia: [
          {
            mediaId: "a",
            kind: "image",
            mode: "fullscreen",
            rightsGate: "approved_for_use",
            startMs: 0,
            endMs: 1000,
            renderable: true,
            storageRef: null,
            note: null,
            rightsStatusSource: "owned",
          },
          {
            mediaId: "b",
            kind: "image",
            mode: "picture_in_picture",
            rightsGate: "needs_review",
            startMs: 0,
            endMs: 1000,
            renderable: false,
            storageRef: null,
            note: null,
            rightsStatusSource: "fair_use_review",
          },
          {
            mediaId: "c",
            kind: "image",
            mode: "fullscreen",
            rightsGate: "rejected",
            startMs: 0,
            endMs: 1000,
            renderable: false,
            storageRef: null,
            note: null,
            rightsStatusSource: "blocked",
          },
        ],
      },
    };
    const s = summarizeRenderManifestCompliance(m);
    assert.equal(s.renderableMediaCount, 1);
    assert.equal(s.gatedMediaCount, 1);
    assert.equal(s.rejectedMediaCount, 1);
  });
});
