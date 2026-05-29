import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scheduleMatchesNow,
  nextScheduleTransition,
  computeWeeklyCoverageGrid,
  nextOccurrenceOfHour,
  type SavedViewScheduleShape,
} from "../client/src/pages/admin/broadcastSchedule";

// T285 — Regression coverage for the schedule helpers that drive the saved-view
// rotation, the weekly coverage heatmap, and the Preview-at picker. The
// neighboring diagnostics helpers are exercised by
// broadcast-schedule-diagnostics.test.ts; this file focuses on the helpers
// that don't have any unit coverage yet.

function sched(
  windows: Array<{ days: number[]; startMinute: number; endMinute: number }>,
  enabled = true,
): SavedViewScheduleShape {
  return { enabled, timezone: "local", windows };
}

// Build a local Date for a specific weekday + HH:MM. Anchored on a known
// Sunday (2024-01-07 = Sun) so the math is easy to follow.
function atLocal(day: number, hour: number, minute = 0): Date {
  const d = new Date(2024, 0, 7 + day, hour, minute, 0, 0);
  return d;
}

// --- scheduleMatchesNow --------------------------------------------------

describe("scheduleMatchesNow", () => {
  it("returns false when the schedule is disabled", () => {
    const s = sched(
      [{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }],
      false,
    );
    assert.equal(scheduleMatchesNow(s, atLocal(1, 10)), false);
  });

  it("returns false when there are no windows", () => {
    assert.equal(scheduleMatchesNow(sched([]), atLocal(1, 10)), false);
  });

  it("matches a same-day window with inclusive start and exclusive end", () => {
    const s = sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]);
    assert.equal(scheduleMatchesNow(s, atLocal(1, 9, 0)), true);
    assert.equal(scheduleMatchesNow(s, atLocal(1, 12, 30)), true);
    assert.equal(scheduleMatchesNow(s, atLocal(1, 16, 59)), true);
    assert.equal(scheduleMatchesNow(s, atLocal(1, 17, 0)), false);
    assert.equal(scheduleMatchesNow(s, atLocal(1, 8, 59)), false);
    assert.equal(scheduleMatchesNow(s, atLocal(2, 12)), false);
  });

  it("matches both halves of a wrap-past-midnight window", () => {
    // Mon 22:00 -> Tue 06:00
    const s = sched([{ days: [1], startMinute: 22 * 60, endMinute: 6 * 60 }]);
    // Tail on Monday
    assert.equal(scheduleMatchesNow(s, atLocal(1, 22, 0)), true);
    assert.equal(scheduleMatchesNow(s, atLocal(1, 23, 59)), true);
    // Head on Tuesday
    assert.equal(scheduleMatchesNow(s, atLocal(2, 0, 0)), true);
    assert.equal(scheduleMatchesNow(s, atLocal(2, 5, 59)), true);
    assert.equal(scheduleMatchesNow(s, atLocal(2, 6, 0)), false);
    // Outside both halves
    assert.equal(scheduleMatchesNow(s, atLocal(1, 21, 59)), false);
    assert.equal(scheduleMatchesNow(s, atLocal(3, 0, 0)), false);
  });

  it("wraps a Saturday->Sunday window across the week boundary", () => {
    // Sat 23:00 -> Sun 01:00
    const s = sched([{ days: [6], startMinute: 23 * 60, endMinute: 60 }]);
    assert.equal(scheduleMatchesNow(s, atLocal(6, 23, 30)), true);
    assert.equal(scheduleMatchesNow(s, atLocal(0, 0, 30)), true);
    assert.equal(scheduleMatchesNow(s, atLocal(0, 1, 0)), false);
  });

  it("ignores windows whose days array is empty", () => {
    const s = sched([{ days: [], startMinute: 0, endMinute: 1440 }]);
    assert.equal(scheduleMatchesNow(s, atLocal(1, 10)), false);
  });
});

// --- nextScheduleTransition ----------------------------------------------

describe("nextScheduleTransition", () => {
  function view(
    id: string,
    name: string,
    schedule: SavedViewScheduleShape | null,
    scope: "private" | "shared" = "shared",
  ) {
    return { id, name, scope, schedule };
  }

  it("returns null when no shared scheduled views exist", () => {
    const now = atLocal(1, 10);
    assert.equal(nextScheduleTransition([], now, null), null);
    // Private views with schedules are ignored.
    const priv = view(
      "p",
      "Private",
      sched([{ days: [1], startMinute: 12 * 60, endMinute: 13 * 60 }]),
      "private",
    );
    assert.equal(nextScheduleTransition([priv], now, null), null);
  });

  it("finds the next start when nothing is active yet", () => {
    // Mon 09:00–17:00, currently Mon 08:30, no view is active.
    const v = view(
      "a",
      "Alpha",
      sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]),
    );
    const now = atLocal(1, 8, 30);
    const next = nextScheduleTransition([v], now, null);
    assert.ok(next);
    assert.equal(next!.at.getTime(), atLocal(1, 9, 0).getTime());
    assert.equal(next!.view?.id, "a");
  });

  it("finds the next end (becoming idle) while a view is currently active", () => {
    const v = view(
      "a",
      "Alpha",
      sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]),
    );
    const now = atLocal(1, 12, 0);
    const next = nextScheduleTransition([v], now, "a");
    assert.ok(next);
    assert.equal(next!.at.getTime(), atLocal(1, 17, 0).getTime());
    assert.equal(next!.view, null);
  });

  it("returns the handoff timestamp when one view ends and another starts back-to-back", () => {
    const a = view(
      "a",
      "Alpha",
      sched([{ days: [1], startMinute: 9 * 60, endMinute: 13 * 60 }]),
    );
    const b = view(
      "b",
      "Bravo",
      sched([{ days: [1], startMinute: 13 * 60, endMinute: 17 * 60 }]),
    );
    const now = atLocal(1, 10, 0);
    const next = nextScheduleTransition([a, b], now, "a");
    assert.ok(next);
    assert.equal(next!.at.getTime(), atLocal(1, 13, 0).getTime());
    assert.equal(next!.view?.id, "b");
  });

  it("rolls forward into next week when the only window is earlier today", () => {
    // Window: Mon 09:00–10:00. Now: Mon 12:00 (after today's occurrence).
    // The next transition should be next Monday at 09:00.
    const v = view(
      "a",
      "Alpha",
      sched([{ days: [1], startMinute: 9 * 60, endMinute: 10 * 60 }]),
    );
    const now = atLocal(1, 12, 0);
    const next = nextScheduleTransition([v], now, null);
    assert.ok(next);
    assert.equal(next!.at.getTime(), atLocal(8, 9, 0).getTime());
    assert.equal(next!.view?.id, "a");
  });
});

// --- computeWeeklyCoverageGrid -------------------------------------------

describe("computeWeeklyCoverageGrid", () => {
  function src(id: string, name: string, s: SavedViewScheduleShape) {
    return { id, name, schedule: s };
  }

  it("returns a 7×24 = 168 cell grid with every cell marked 'gap' for empty input", () => {
    const grid = computeWeeklyCoverageGrid([]);
    assert.equal(grid.length, 168);
    assert.ok(grid.every((c) => c.status === "gap"));
    assert.ok(grid.every((c) => c.viewIds.length === 0));
  });

  it("marks fully-covered hours as 'ok' and uncovered hours as 'gap'", () => {
    // Mon 09:00–17:00 only.
    const grid = computeWeeklyCoverageGrid([
      src(
        "a",
        "Alpha",
        sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]),
      ),
    ]);
    const cell = (day: number, hour: number) =>
      grid.find((c) => c.day === day && c.hour === hour)!;
    // Inside the window: ok
    assert.equal(cell(1, 9).status, "ok");
    assert.equal(cell(1, 16).status, "ok");
    assert.deepEqual(cell(1, 9).viewIds, ["a"]);
    // Boundary hour with partial coverage at the start of the window still
    // contains an uncovered minute (08:00–08:59 has zero coverage), so the
    // 8 o'clock hour is a gap.
    assert.equal(cell(1, 8).status, "gap");
    // 17:00–17:59 has zero coverage (window ends at 17:00 exclusive).
    assert.equal(cell(1, 17).status, "gap");
    // Other days are entirely gaps.
    for (let day = 0; day < 7; day++) {
      if (day === 1) continue;
      assert.equal(cell(day, 0).status, "gap");
      assert.equal(cell(day, 23).status, "gap");
    }
  });

  it("promotes hours with multi-view overlap to 'conflict' and lists every participant", () => {
    const grid = computeWeeklyCoverageGrid([
      src(
        "a",
        "Alpha",
        sched([{ days: [1], startMinute: 9 * 60, endMinute: 13 * 60 }]),
      ),
      src(
        "b",
        "Bravo",
        sched([{ days: [1], startMinute: 12 * 60, endMinute: 18 * 60 }]),
      ),
    ]);
    const cell = (day: number, hour: number) =>
      grid.find((c) => c.day === day && c.hour === hour)!;
    // 12:00 hour: both views overlap on 12:00–12:59 -> conflict
    const c12 = cell(1, 12);
    assert.equal(c12.status, "conflict");
    assert.deepEqual([...c12.viewIds].sort(), ["a", "b"]);
    assert.deepEqual([...c12.viewNames].sort(), ["Alpha", "Bravo"]);
    // 10:00 hour: only Alpha -> ok with one participant
    const c10 = cell(1, 10);
    assert.equal(c10.status, "ok");
    assert.deepEqual(c10.viewIds, ["a"]);
    // 17:00 hour: only Bravo -> ok with one participant
    const c17 = cell(1, 17);
    assert.equal(c17.status, "ok");
    assert.deepEqual(c17.viewIds, ["b"]);
  });

  it("ignores disabled schedules", () => {
    const grid = computeWeeklyCoverageGrid([
      src(
        "off",
        "Off",
        sched(
          [{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }],
          false,
        ),
      ),
    ]);
    assert.ok(grid.every((c) => c.status === "gap"));
  });
});

// --- nextOccurrenceOfHour ------------------------------------------------

describe("nextOccurrenceOfHour", () => {
  it("rolls forward to the same weekday next week when the slot has already passed today", () => {
    // Now: Mon 14:00. Asking for Mon 10:00 should jump to NEXT Monday 10:00.
    const now = atLocal(1, 14, 0);
    const target = nextOccurrenceOfHour(1, 10, now);
    assert.equal(target.getTime(), atLocal(8, 10, 0).getTime());
  });

  it("returns later today when the slot is still in the future today", () => {
    const now = atLocal(1, 9, 30);
    const target = nextOccurrenceOfHour(1, 10, now);
    assert.equal(target.getTime(), atLocal(1, 10, 0).getTime());
  });

  it("returns a future day this week when the target weekday is ahead of today", () => {
    // Now: Mon 14:00. Asking for Wed 09:00 -> this Wed 09:00.
    const now = atLocal(1, 14, 0);
    const target = nextOccurrenceOfHour(3, 9, now);
    assert.equal(target.getTime(), atLocal(3, 9, 0).getTime());
  });

  it("rolls a same-hour same-weekday request forward by a full week (strict future)", () => {
    // Now: Mon 10:00:00 exactly. Asking for Mon 10:00 — picker is strict
    // future, so it should land on next Monday 10:00, not "now".
    const now = atLocal(1, 10, 0);
    const target = nextOccurrenceOfHour(1, 10, now);
    assert.equal(target.getTime(), atLocal(8, 10, 0).getTime());
  });

  it("zeroes minutes/seconds/milliseconds even when `now` has them set", () => {
    const now = new Date(2024, 0, 8, 9, 37, 42, 123); // Mon 09:37:42.123
    const target = nextOccurrenceOfHour(1, 11, now); // later today Mon 11:00
    assert.equal(target.getHours(), 11);
    assert.equal(target.getMinutes(), 0);
    assert.equal(target.getSeconds(), 0);
    assert.equal(target.getMilliseconds(), 0);
  });
});
