import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeScheduleDiagnostics,
  suggestCoverageFix,
  type SavedViewScheduleShape,
} from "../client/src/pages/admin/broadcastSchedule";

// T284 — Regression coverage for the heuristic that proposes schedule edits
// to fill the gaps surfaced by the coverage heatmap. We care that:
//   1. Adjacent single-day windows get extended in place rather than
//      duplicated as new windows (minimal-diff principle).
//   2. Gaps with no adjacent extendable window fall back to adding a fresh
//      single-day window on the least-busy view.
//   3. Applying every suggested `after` schedule actually closes the gaps
//      that the heuristic claims it resolved, and does not invent new
//      conflicts (since edits only touch previously uncovered minutes).

function sched(
  windows: Array<{ days: number[]; startMinute: number; endMinute: number }>,
  enabled = true,
): SavedViewScheduleShape {
  return { enabled, timezone: "local", windows };
}

function source(id: string, name: string, schedule: SavedViewScheduleShape) {
  return { id, name, schedule };
}

describe("suggestCoverageFix — no-op cases", () => {
  it("returns empty suggestions when there are no enabled views", () => {
    const r = suggestCoverageFix([]);
    assert.deepEqual(r.suggestions, []);
    assert.deepEqual(r.initialGaps, []);
    assert.deepEqual(r.unresolvedGaps, []);
  });

  it("returns empty suggestions when full-week coverage already exists", () => {
    // One view covering every day 00:00–24:00.
    const r = suggestCoverageFix([
      source(
        "a",
        "All week",
        sched([
          { days: [0, 1, 2, 3, 4, 5, 6], startMinute: 0, endMinute: 1440 },
        ]),
      ),
    ]);
    assert.deepEqual(r.suggestions, []);
  });
});

describe("suggestCoverageFix — extension over add", () => {
  it("extends a same-day window that ends exactly at the gap start", () => {
    // 'a': Mon 09:00–13:00, 'b': Mon 15:00–18:00 → in-day gap Mon 13:00–15:00.
    // We only assert that the in-day gap is closed by extending 'a' forward;
    // other gaps (pre-09:00, post-18:00, other days) will also be handled
    // by the algorithm but are not the subject of this test.
    const r = suggestCoverageFix([
      source(
        "a",
        "Alpha",
        sched([{ days: [1], startMinute: 9 * 60, endMinute: 13 * 60 }]),
      ),
      source(
        "b",
        "Bravo",
        sched([{ days: [1], startMinute: 15 * 60, endMinute: 18 * 60 }]),
      ),
    ]);
    const alphaSuggestion = r.suggestions.find((s) => s.viewId === "a");
    assert.ok(alphaSuggestion, "expected a suggestion for Alpha");
    const extension = alphaSuggestion!.changes.find(
      (c) =>
        c.kind === "extend-end" &&
        c.day === 1 &&
        c.from === 13 * 60 &&
        c.to === 15 * 60,
    );
    assert.ok(extension, "expected an extend-end change closing Mon 13–15");
  });

  it("extends backward when a same-day window starts at the gap end", () => {
    // 'a': Tue 14:00–18:00 only. The full-day-up-to-14:00 gap on Tue should
    // close by extending 'a' backward to 00:00 (no window ends at 0, but a
    // window starts at 14:00 — the extend-start branch wins).
    const r = suggestCoverageFix([
      source(
        "a",
        "Alpha",
        sched([{ days: [2], startMinute: 14 * 60, endMinute: 18 * 60 }]),
      ),
    ]);
    const alphaSuggestion = r.suggestions.find((s) => s.viewId === "a");
    assert.ok(alphaSuggestion);
    const back = alphaSuggestion!.changes.find(
      (c) =>
        c.kind === "extend-start" &&
        c.day === 2 &&
        c.from === 14 * 60 &&
        c.to === 0,
    );
    assert.ok(back, "expected an extend-start change closing Tue 00–14");
  });
});

describe("suggestCoverageFix — fallback add-window", () => {
  it("adds a new single-day window when no adjacent extension fits", () => {
    // 'a': Mon 09:00–17:00 only (multi-day windows are not auto-extended).
    // Wed has no coverage → gap is closed by adding Wed window somewhere.
    const r = suggestCoverageFix([
      source(
        "a",
        "Alpha",
        sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]),
      ),
    ]);
    const wedAdds = r.suggestions
      .flatMap((s) => s.changes.map((c) => ({ viewId: s.viewId, c })))
      .filter(
        ({ c }) =>
          c.kind === "add-window" &&
          c.day === 3 &&
          c.startMinute === 0 &&
          c.endMinute === 1440,
      );
    assert.equal(
      wedAdds.length,
      1,
      "expected exactly one add-window suggestion for Wed",
    );
  });
});

describe("suggestCoverageFix — end-to-end correctness", () => {
  it("a suggestion set that resolves all gaps actually produces zero-gap coverage and no new conflicts", () => {
    const original = [
      source(
        "a",
        "Alpha",
        sched([{ days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60 }]),
      ),
      source(
        "b",
        "Bravo",
        sched([{ days: [1, 2, 3, 4, 5], startMinute: 17 * 60, endMinute: 21 * 60 }]),
      ),
    ];
    const r = suggestCoverageFix(original);
    // Apply every suggestion and recompute diagnostics. Any view that was
    // edited uses its `after` schedule; the rest stay as-is.
    const afterMap = new Map(
      r.suggestions.map((s) => [s.viewId, s.after]),
    );
    const finalSources = original.map((s) =>
      afterMap.has(s.id)
        ? { id: s.id, name: s.name, schedule: afterMap.get(s.id)! }
        : s,
    );
    const final = computeScheduleDiagnostics(finalSources);
    // The heuristic always produces at least one add-window for any gap it
    // can't extend into, so unresolvedGaps should match the recomputed
    // diagnostics here (both empty for this scenario).
    assert.deepEqual(r.unresolvedGaps, []);
    assert.deepEqual(final.gaps, []);
    // And we should not have invented any new overlaps.
    assert.deepEqual(final.conflicts, []);
  });
});
