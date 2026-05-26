import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampToMax,
  wrapLines,
  analyzeRenderBaselineLayout,
  analyzeRenderBaselineText,
  mergeFindings,
  type RenderSafeZones,
} from "../server/services/render-text-fitting";

const baseSafeZones = (): RenderSafeZones => ({
  anchorSafeZone: { x: 10, y: 10, width: 30, height: 50, unit: "percent", purpose: "anchor" },
  lowerThirdZone: { x: 5, y: 70, width: 50, height: 10, unit: "percent", purpose: "lower-third" },
  tickerZone: { x: 0, y: 90, width: 100, height: 6, unit: "percent", purpose: "ticker" },
  captionZone: { x: 10, y: 82, width: 80, height: 6, unit: "percent", purpose: "caption" },
  monitorPanelZones: [
    { panelKey: "mon-1", x: 60, y: 15, width: 30, height: 30, unit: "percent", purpose: "monitor" },
  ],
});

describe("clampToMax", () => {
  it("normalizes whitespace and trims", () => {
    assert.equal(clampToMax("  hello   world  ", 50), "hello world");
  });
  it("returns empty string when max <= 0", () => {
    assert.equal(clampToMax("hello", 0), "");
    assert.equal(clampToMax("hello", -1), "");
  });
  it("returns slice without ellipsis when max <= 3", () => {
    assert.equal(clampToMax("hello", 3), "hel");
    assert.equal(clampToMax("hello", 1), "h");
  });
  it("adds ellipsis when truncating with room", () => {
    assert.equal(clampToMax("abcdefghij", 8), "abcde...");
  });
  it("returns input unchanged when within limit", () => {
    assert.equal(clampToMax("abc", 10), "abc");
  });
});

describe("wrapLines", () => {
  it("returns empty for empty input or zero budgets", () => {
    assert.deepEqual(wrapLines("", 10, 2), []);
    assert.deepEqual(wrapLines("hello", 0, 2), []);
    assert.deepEqual(wrapLines("hello", 10, 0), []);
  });
  it("wraps words into lines respecting maxCharsPerLine", () => {
    const lines = wrapLines("the quick brown fox", 10, 3);
    assert.deepEqual(lines, ["the quick", "brown fox"]);
  });
  it("truncates words longer than max line width", () => {
    const lines = wrapLines("supercalifragilistic", 5, 2);
    assert.equal(lines[0].length <= 5, true);
  });
  it("respects maxLines cap", () => {
    const lines = wrapLines("a b c d e f g h i j", 1, 3);
    assert.equal(lines.length, 3);
  });
  it("normalizes whitespace", () => {
    const lines = wrapLines("  hello\t\n  world  ", 20, 2);
    assert.deepEqual(lines, ["hello world"]);
  });
});

describe("analyzeRenderBaselineLayout overlap detection", () => {
  it("returns no errors for non-overlapping baseline", () => {
    const result = analyzeRenderBaselineLayout(baseSafeZones());
    assert.equal(result.errors.length, 0);
  });

  it("flags captions_overlap_lower_third", () => {
    const zones = baseSafeZones();
    zones.captionZone = { ...zones.captionZone, y: 70, height: 10 };
    const result = analyzeRenderBaselineLayout(zones);
    assert.ok(result.errors.find((e) => e.code === "captions_overlap_lower_third"));
  });

  it("flags captions_overlap_ticker", () => {
    const zones = baseSafeZones();
    zones.captionZone = { ...zones.captionZone, y: 90, height: 6 };
    const result = analyzeRenderBaselineLayout(zones);
    assert.ok(result.errors.find((e) => e.code === "captions_overlap_ticker"));
  });

  it("flags lower_third_overlap_ticker", () => {
    const zones = baseSafeZones();
    zones.lowerThirdZone = { ...zones.lowerThirdZone, y: 88, height: 8 };
    const result = analyzeRenderBaselineLayout(zones);
    assert.ok(result.errors.find((e) => e.code === "lower_third_overlap_ticker"));
  });

  it("flags anchor_overlap_lower_third", () => {
    const zones = baseSafeZones();
    zones.anchorSafeZone = { ...zones.anchorSafeZone, y: 65, height: 30 };
    const result = analyzeRenderBaselineLayout(zones);
    assert.ok(result.errors.find((e) => e.code === "anchor_overlap_lower_third"));
  });

  it("warns when panel sits within edge margin", () => {
    const zones = baseSafeZones();
    zones.monitorPanelZones = [
      { panelKey: "edge", x: 0, y: 15, width: 30, height: 30, unit: "percent", purpose: "monitor" },
    ];
    const result = analyzeRenderBaselineLayout(zones);
    assert.ok(result.warnings.find((w) => w.code === "panel_margin_too_tight"));
  });

  it("errors when panel overlaps anchor safe zone", () => {
    const zones = baseSafeZones();
    zones.monitorPanelZones = [
      { panelKey: "p", x: 15, y: 20, width: 30, height: 30, unit: "percent", purpose: "monitor" },
    ];
    const result = analyzeRenderBaselineLayout(zones);
    assert.ok(result.errors.find((e) => e.code === "panel_overlap_anchor"));
  });
});

describe("analyzeRenderBaselineText", () => {
  const safety = {
    headlineMaxChars: 10,
    lowerThirdMaxChars: 10,
    tickerItemMaxChars: 10,
    captionMaxCharsPerLine: 10,
    captionMaxLines: 2,
    overlapPrevention: [],
  };

  it("warns on over-budget headline/lowerThird/ticker/caption", () => {
    const result = analyzeRenderBaselineText(safety, {
      headlineText: "this is a much too long headline",
      lowerThirdText: "lower third text is also too long",
      tickerItems: ["short", "this ticker item is too long"],
      captionSegments: [{ segmentIndex: 0, text: "a".repeat(100) }],
    });
    assert.ok(result.warnings.find((w) => w.code === "headline_over_budget"));
    assert.ok(result.warnings.find((w) => w.code === "lower_third_over_budget"));
    assert.ok(result.warnings.find((w) => w.code === "ticker_item_over_budget"));
    assert.ok(result.warnings.find((w) => w.code === "caption_segment_over_budget"));
  });

  it("no warnings for in-budget inputs", () => {
    const result = analyzeRenderBaselineText(safety, {
      headlineText: "hi",
      lowerThirdText: "hi",
      tickerItems: ["a"],
      captionSegments: [{ segmentIndex: 0, text: "hi" }],
    });
    assert.equal(result.warnings.length, 0);
    assert.equal(result.errors.length, 0);
  });
});

describe("mergeFindings", () => {
  it("concatenates warnings and errors", () => {
    const a = { warnings: [{ code: "w1", message: "" }], errors: [] };
    const b = { warnings: [], errors: [{ code: "e1", message: "" }] };
    const merged = mergeFindings(a, b);
    assert.equal(merged.warnings.length, 1);
    assert.equal(merged.errors.length, 1);
  });
});
