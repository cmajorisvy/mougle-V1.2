import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scheduleMatchesNow,
  nextScheduleTransition,
  type SavedViewScheduleShape,
  type ScheduledViewLike,
} from "../client/src/pages/admin/broadcastSchedule";

// Helpers --------------------------------------------------------------

function sched(
  windows: Array<{ days: number[]; startMinute: number; endMinute: number }>,
  enabled = true,
): SavedViewScheduleShape {
  return { enabled, timezone: "local", windows };
}

// Local-time date constructor. Day order: 0=Sun..6=Sat (Date#getDay).
function localDate(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0,
): Date {
  return new Date(y, m, d, hh, mm, ss);
}

// 2026-05-18 is a Monday (getDay() === 1). We anchor most tests around it
// so day-of-week reasoning is stable regardless of when the suite runs.
const MON = localDate(2026, 4, 18);
assert.equal(MON.getDay(), 1, "fixture anchor must be a Monday");

// --- scheduleMatchesNow ----------------------------------------------

describe("scheduleMatchesNow — simple windows", () => {
  it("matches inside a same-day window on a matching day", () => {
    const s = sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]);
    assert.equal(scheduleMatchesNow(s, localDate(2026, 4, 18, 12, 0)), true);
  });

  it("treats the start minute as inclusive and the end minute as exclusive", () => {
    const s = sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]);
    assert.equal(scheduleMatchesNow(s, localDate(2026, 4, 18, 9, 0)), true);
    assert.equal(scheduleMatchesNow(s, localDate(2026, 4, 18, 17, 0)), false);
    assert.equal(scheduleMatchesNow(s, localDate(2026, 4, 18, 16, 59)), true);
  });

  it("does not match outside the window or on the wrong day", () => {
    const s = sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]);
    assert.equal(scheduleMatchesNow(s, localDate(2026, 4, 18, 8, 59)), false);
    // Tuesday 2026-05-19 (getDay === 2): wrong day, even at noon
    assert.equal(scheduleMatchesNow(s, localDate(2026, 4, 19, 12, 0)), false);
  });
});

describe("scheduleMatchesNow — wrap-past-midnight windows", () => {
  // 22:00 Mon -> 06:00 Tue
  const wrap = sched([
    { days: [1], startMinute: 22 * 60, endMinute: 6 * 60 },
  ]);

  it("matches the tail segment on the start day", () => {
    assert.equal(scheduleMatchesNow(wrap, localDate(2026, 4, 18, 23, 30)), true);
    assert.equal(scheduleMatchesNow(wrap, localDate(2026, 4, 18, 22, 0)), true);
  });

  it("matches the head segment on the following day", () => {
    // Tuesday 2026-05-19 between 00:00 and 06:00 is still covered
    assert.equal(scheduleMatchesNow(wrap, localDate(2026, 4, 19, 0, 0)), true);
    assert.equal(scheduleMatchesNow(wrap, localDate(2026, 4, 19, 5, 59)), true);
    assert.equal(scheduleMatchesNow(wrap, localDate(2026, 4, 19, 6, 0)), false);
  });

  it("does not match outside both segments", () => {
    // Monday 21:59 — just before tail begins
    assert.equal(scheduleMatchesNow(wrap, localDate(2026, 4, 18, 21, 59)), false);
    // Wednesday is not the start day nor the day-after — nothing should match
    assert.equal(scheduleMatchesNow(wrap, localDate(2026, 4, 20, 3, 0)), false);
  });
});

describe("scheduleMatchesNow — disabled / empty edge cases", () => {
  it("returns false when the schedule is disabled even if a window would match", () => {
    const s = sched(
      [{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }],
      false,
    );
    assert.equal(scheduleMatchesNow(s, localDate(2026, 4, 18, 12, 0)), false);
  });

  it("returns false when there are no windows at all", () => {
    const s = sched([]);
    assert.equal(scheduleMatchesNow(s, MON), false);
  });

  it("returns false when a window has no days selected", () => {
    const s = sched([{ days: [], startMinute: 0, endMinute: 24 * 60 - 1 }]);
    assert.equal(scheduleMatchesNow(s, localDate(2026, 4, 18, 12, 0)), false);
  });
});

// --- nextScheduleTransition ------------------------------------------

type View = ScheduledViewLike & { name: string };

function view(
  id: string,
  schedule: SavedViewScheduleShape | null,
  scope: "private" | "shared" = "shared",
): View {
  return { id, name: `view-${id}`, scope, schedule };
}

describe("nextScheduleTransition", () => {
  it("returns null when there are no scheduled shared views", () => {
    assert.equal(nextScheduleTransition([], MON, null), null);
    // A private scheduled view should also be ignored.
    const v = view(
      "p",
      sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }]),
      "private",
    );
    assert.equal(nextScheduleTransition([v], MON, null), null);
    // A disabled shared schedule is also ignored.
    const off = view(
      "off",
      sched([{ days: [1], startMinute: 9 * 60, endMinute: 17 * 60 }], false),
    );
    assert.equal(nextScheduleTransition([off], MON, null), null);
  });

  it("finds the next start of a single window later today", () => {
    const v = view("a", sched([
      { days: [1], startMinute: 14 * 60, endMinute: 16 * 60 },
    ]));
    // Now is Monday 09:00, nothing active. Next change should be 14:00 Monday,
    // becoming view 'a'.
    const now = localDate(2026, 4, 18, 9, 0);
    const r = nextScheduleTransition([v], now, null);
    assert.ok(r, "expected a transition");
    assert.equal(r!.at.getTime(), localDate(2026, 4, 18, 14, 0).getTime());
    assert.equal(r!.view?.id, "a");
  });

  it("rolls forward into tomorrow when nothing remains today", () => {
    // Tuesday 09:00–11:00 window. Probe Monday 23:00 → next transition is
    // Tuesday 09:00.
    const v = view("a", sched([
      { days: [2], startMinute: 9 * 60, endMinute: 11 * 60 },
    ]));
    const now = localDate(2026, 4, 18, 23, 0);
    const r = nextScheduleTransition([v], now, null);
    assert.ok(r);
    assert.equal(r!.at.getTime(), localDate(2026, 4, 19, 9, 0).getTime());
    assert.equal(r!.view?.id, "a");
  });

  it("handles wrap-around windows: next transition is the end on the following day", () => {
    // Monday 22:00 → Tuesday 06:00 wrap. Currently Monday 23:00, view 'a'
    // is already active. The next change is when 'a' becomes inactive at
    // Tuesday 06:00.
    const v = view("a", sched([
      { days: [1], startMinute: 22 * 60, endMinute: 6 * 60 },
    ]));
    const now = localDate(2026, 4, 18, 23, 0);
    const r = nextScheduleTransition([v], now, "a");
    assert.ok(r);
    assert.equal(r!.at.getTime(), localDate(2026, 4, 19, 6, 0).getTime());
    assert.equal(r!.view, null);
  });

  it("skips transitions where the active view ID does not actually change, and reports one where it does", () => {
    // Two adjacent windows on view 'a': 09:00–12:00 and 12:00–15:00.
    // The boundary at 12:00 leaves 'a' active on both sides, so it should
    // NOT be reported. The next *real* change is at 15:00, when 'a' goes
    // inactive.
    const v = view("a", sched([
      { days: [1], startMinute: 9 * 60, endMinute: 12 * 60 },
      { days: [1], startMinute: 12 * 60, endMinute: 15 * 60 },
    ]));
    const now = localDate(2026, 4, 18, 10, 0);
    const r = nextScheduleTransition([v], now, "a");
    assert.ok(r);
    assert.equal(r!.at.getTime(), localDate(2026, 4, 18, 15, 0).getTime());
    assert.equal(r!.view, null);
  });

  it("returns the first real handover when two views overlap", () => {
    // 'a' is active 09:00–13:00, 'b' starts at 12:00. At 11:00 with 'a'
    // active, the very next moment the active view changes is 12:00 when
    // the overlap begins. `find` returns the first matching view, which is
    // 'a' (still active), so at 12:00 the active ID is still 'a' and that
    // transition is skipped. The first real change is at 13:00 when 'a'
    // ends and the only remaining active view is 'b'.
    const a = view("a", sched([
      { days: [1], startMinute: 9 * 60, endMinute: 13 * 60 },
    ]));
    const b = view("b", sched([
      { days: [1], startMinute: 12 * 60, endMinute: 18 * 60 },
    ]));
    const now = localDate(2026, 4, 18, 11, 0);
    const r = nextScheduleTransition([a, b], now, "a");
    assert.ok(r);
    assert.equal(r!.at.getTime(), localDate(2026, 4, 18, 13, 0).getTime());
    assert.equal(r!.view?.id, "b");
  });
});
