import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeScheduleDiagnostics,
  expandWindowToRanges,
  type SavedViewScheduleShape,
} from "../client/src/pages/admin/broadcastSchedule";

// T280 — Regression coverage for the overlap/gap diagnostics that drive the
// admin "conflict" / "gap" warnings on the saved-view schedule rows. These
// helpers were left behind when the rotation helpers were extracted; without
// tests, a regression here would silently hide real overlaps or invent fake
// gaps in the admin UI.

function sched(
  windows: Array<{ days: number[]; startMinute: number; endMinute: number }>,
  enabled = true,
): SavedViewScheduleShape {
  return { enabled, timezone: "local", windows };
}

function source(id: string, name: string, schedule: SavedViewScheduleShape) {
  return { id, name, schedule };
}

// --- expandWindowToRanges -------------------------------------------------

describe("expandWindowToRanges", () => {
  it("keeps a same-day window on its day", () => {
    const out = expandWindowToRanges({
      days: [1, 3],
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    });
    assert.deepEqual(out, [
      { day: 1, start: 540, end: 1020 },
      { day: 3, start: 540, end: 1020 },
    ]);
  });

  it("splits a wrap-past-midnight window into a tail + next-day head", () => {
    // 22:00 Mon -> 06:00 Tue
    const out = expandWindowToRanges({
      days: [1],
      startMinute: 22 * 60,
      endMinute: 6 * 60,
    });
    assert.deepEqual(out, [
      { day: 1, start: 1320, end: 1440 },
      { day: 2, start: 0, end: 360 },
    ]);
  });

  it("wraps from Saturday into Sunday (day 6 -> day 0)", () => {
    const out = expandWindowToRanges({
      days: [6],
      startMinute: 23 * 60,
      endMinute: 60,
    });
    assert.deepEqual(out, [
      { day: 6, start: 23 * 60, end: 1440 },
      { day: 0, start: 0, end: 60 },
    ]);
  });

  it("collapses a 00:00–00:00 'full day' window to a single full-day range", () => {
    const out = expandWindowToRanges({
      days: [2],
      startMinute: 0,
      endMinute: 0,
    });
    assert.deepEqual(out, [{ day: 2, start: 0, end: 1440 }]);
  });
});

// --- computeScheduleDiagnostics ------------------------------------------

describe("computeScheduleDiagnostics — disabled / windowless inputs", () => {
  it("returns empty conflicts/gaps and hasAnyEnabled=false when sources is empty", () => {
    const d = computeScheduleDiagnostics([]);
    assert.deepEqual(d.conflicts, []);
    assert.deepEqual(d.gaps, []);
    assert.equal(d.hasAnyEnabled, false);
  });

  it("ignores disabled schedules entirely", () => {
    const d = computeScheduleDiagnostics([
      source(
        "off",
        "Off",
        sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }], false),
      ),
    ]);
    assert.deepEqual(d.conflicts, []);
    assert.deepEqual(d.gaps, []);
    assert.equal(d.hasAnyEnabled, false);
  });

  it("ignores enabled schedules with zero windows", () => {
    const d = computeScheduleDiagnostics([
      source("empty", "Empty", sched([])),
    ]);
    assert.equal(d.hasAnyEnabled, false);
    assert.deepEqual(d.conflicts, []);
    assert.deepEqual(d.gaps, []);
  });
});

describe("computeScheduleDiagnostics — single non-overlapping view", () => {
  it("reports no conflicts, and gaps for every uncovered span", () => {
    // Mon 09:00–17:00 only — every other day is a full-day gap, plus the
    // pre-09:00 and post-17:00 spans on Monday itself.
    const d = computeScheduleDiagnostics([
      source(
        "a",
        "Morning",
        sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]),
      ),
    ]);
    assert.equal(d.hasAnyEnabled, true);
    assert.deepEqual(d.conflicts, []);
    // Sunday (0): full-day gap
    assert.ok(
      d.gaps.some((g) => g.day === 0 && g.start === 0 && g.end === 1440),
      "expected full-day gap on Sunday",
    );
    // Monday (1): two gaps surrounding the 09:00–17:00 window
    const monGaps = d.gaps.filter((g) => g.day === 1);
    assert.deepEqual(
      monGaps.map((g) => [g.start, g.end]),
      [
        [0, 540],
        [1020, 1440],
      ],
    );
    // Tuesday..Saturday (2..6): each a full-day gap
    for (let day = 2; day <= 6; day++) {
      assert.ok(
        d.gaps.some(
          (g) => g.day === day && g.start === 0 && g.end === 1440,
        ),
        `expected full-day gap on day ${day}`,
      );
    }
  });
});

describe("computeScheduleDiagnostics — overlapping views", () => {
  it("reports the overlapping span as a conflict naming both views", () => {
    // a: Mon 09:00–13:00, b: Mon 12:00–18:00 -> overlap 12:00–13:00
    const d = computeScheduleDiagnostics([
      source(
        "a",
        "Alpha",
        sched([{ days: [1], startMinute: 9 * 60, endMinute: 13 * 60 }]),
      ),
      source(
        "b",
        "Bravo",
        sched([{ days: [1], startMinute: 12 * 60, endMinute: 18 * 60 }]),
      ),
    ]);
    const monConflicts = d.conflicts.filter((c) => c.day === 1);
    assert.equal(monConflicts.length, 1);
    const [c] = monConflicts;
    assert.equal(c.start, 12 * 60);
    assert.equal(c.end, 13 * 60);
    // Order isn't guaranteed (sorted by id-string), so compare as sets.
    assert.deepEqual([...c.viewIds].sort(), ["a", "b"]);
    assert.deepEqual([...c.viewNames].sort(), ["Alpha", "Bravo"]);
    // No gap inside Mon 09:00–18:00 — everything is covered there.
    const insideCoveredGap = d.gaps.find(
      (g) => g.day === 1 && g.start >= 9 * 60 && g.end <= 18 * 60,
    );
    assert.equal(insideCoveredGap, undefined);
  });
});

describe("computeScheduleDiagnostics — wrap-past-midnight windows", () => {
  it("flags a conflict that straddles two day rows when two wrapping windows overlap", () => {
    // a: Mon 22:00 -> Tue 06:00
    // b: Mon 23:00 -> Tue 07:00
    // Conflict on day 1 (Mon): 23:00–24:00, and day 2 (Tue): 00:00–06:00.
    const d = computeScheduleDiagnostics([
      source(
        "a",
        "Alpha",
        sched([{ days: [1], startMinute: 22 * 60, endMinute: 6 * 60 }]),
      ),
      source(
        "b",
        "Bravo",
        sched([{ days: [1], startMinute: 23 * 60, endMinute: 7 * 60 }]),
      ),
    ]);
    const monConflict = d.conflicts.find((c) => c.day === 1);
    const tueConflict = d.conflicts.find((c) => c.day === 2);
    assert.ok(monConflict, "expected a Monday conflict row");
    assert.equal(monConflict!.start, 23 * 60);
    assert.equal(monConflict!.end, 1440);
    assert.deepEqual([...monConflict!.viewIds].sort(), ["a", "b"]);
    assert.ok(tueConflict, "expected a Tuesday conflict row");
    assert.equal(tueConflict!.start, 0);
    assert.equal(tueConflict!.end, 6 * 60);
    assert.deepEqual([...tueConflict!.viewIds].sort(), ["a", "b"]);
  });
});
