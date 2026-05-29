import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCoverageChangesToSchedule,
  buildEditedSuggestionChange,
  buildEditedSuggestionMap,
  buildOriginalDayCoverageChanges,
  computeUncoveredOriginalGapWarnings,
  getSuggestionChangeBounds,
  validateEditedSuggestions,
  type CoverageSuggestion,
  type CoverageSuggestionChange,
  type SavedViewScheduleShape,
  type SuggestionEditOverride,
} from "../client/src/pages/admin/broadcastSchedule";

// T304 — Regression coverage for the schedule-fix dialog's inline edit
// + overlap guard. These tests pin the pure helpers extracted from
// BroadcastPreview.tsx so the dialog's logic is exercised without a
// browser:
//   - applyCoverageChangesToSchedule applies extend-end / extend-start /
//     add-window correctly, including with buildEditedSuggestionChange
//     overrides.
//   - validateEditedSuggestions disables Apply (returns an error) when an
//     admin's edit pushes a fix into another shared view's covered
//     minutes, and the error names the conflicting view.
//   - Reset (clearing the override) restores the heuristic-suggested time.

function sched(
  windows: Array<{ days: number[]; startMinute: number; endMinute: number }>,
  enabled = true,
): SavedViewScheduleShape {
  return { enabled, timezone: "local", windows };
}

function extendEnd(opts: {
  windowIndex: number;
  day: number;
  from: number;
  to: number;
}): CoverageSuggestionChange {
  return { kind: "extend-end", ...opts };
}

function extendStart(opts: {
  windowIndex: number;
  day: number;
  from: number;
  to: number;
}): CoverageSuggestionChange {
  return { kind: "extend-start", ...opts };
}

function addWindow(opts: {
  day: number;
  startMinute: number;
  endMinute: number;
}): CoverageSuggestionChange {
  return { kind: "add-window", ...opts };
}

describe("applyCoverageChangesToSchedule + buildEditedSuggestionChange", () => {
  it("extends an existing window's end minute in place", () => {
    const before = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 13 * 60 },
    ]);
    const after = applyCoverageChangesToSchedule(before, [
      extendEnd({ windowIndex: 0, day: 1, from: 13 * 60, to: 15 * 60 }),
    ]);
    assert.equal(after.windows.length, 1);
    assert.equal(after.windows[0].startMinute, 9 * 60);
    assert.equal(after.windows[0].endMinute, 15 * 60);
    // Source schedule must not be mutated.
    assert.equal(before.windows[0].endMinute, 13 * 60);
  });

  it("extends an existing window's start minute in place", () => {
    const before = sched([
      { days: [2], startMinute: 14 * 60, endMinute: 18 * 60 },
    ]);
    const after = applyCoverageChangesToSchedule(before, [
      extendStart({ windowIndex: 0, day: 2, from: 14 * 60, to: 10 * 60 }),
    ]);
    assert.equal(after.windows.length, 1);
    assert.equal(after.windows[0].startMinute, 10 * 60);
    assert.equal(after.windows[0].endMinute, 18 * 60);
  });

  it("appends a new single-day window for add-window changes", () => {
    const before = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 12 * 60 },
    ]);
    const after = applyCoverageChangesToSchedule(before, [
      addWindow({ day: 3, startMinute: 8 * 60, endMinute: 17 * 60 }),
    ]);
    assert.equal(after.windows.length, 2);
    const added = after.windows[1];
    assert.deepEqual(added.days, [3]);
    assert.equal(added.startMinute, 8 * 60);
    assert.equal(added.endMinute, 17 * 60);
  });

  it("honours admin overrides via buildEditedSuggestionChange for extend-end", () => {
    const orig = extendEnd({
      windowIndex: 0,
      day: 1,
      from: 13 * 60,
      to: 15 * 60,
    });
    const override: SuggestionEditOverride = { end: 14 * 60 };
    const edited = buildEditedSuggestionChange(orig, override);
    assert.equal(edited.kind, "extend-end");
    assert.equal(edited.kind === "extend-end" ? edited.to : -1, 14 * 60);
    const before = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 13 * 60 },
    ]);
    const after = applyCoverageChangesToSchedule(before, [edited]);
    assert.equal(after.windows[0].endMinute, 14 * 60);
  });

  it("honours admin overrides via buildEditedSuggestionChange for extend-start", () => {
    const orig = extendStart({
      windowIndex: 0,
      day: 2,
      from: 14 * 60,
      to: 10 * 60,
    });
    const edited = buildEditedSuggestionChange(orig, { start: 12 * 60 });
    assert.equal(edited.kind === "extend-start" ? edited.to : -1, 12 * 60);
    const before = sched([
      { days: [2], startMinute: 14 * 60, endMinute: 18 * 60 },
    ]);
    const after = applyCoverageChangesToSchedule(before, [edited]);
    assert.equal(after.windows[0].startMinute, 12 * 60);
    assert.equal(after.windows[0].endMinute, 18 * 60);
  });

  it("honours admin overrides via buildEditedSuggestionChange for add-window", () => {
    const orig = addWindow({
      day: 3,
      startMinute: 8 * 60,
      endMinute: 17 * 60,
    });
    const edited = buildEditedSuggestionChange(orig, {
      start: 9 * 60,
      end: 16 * 60,
    });
    assert.equal(
      edited.kind === "add-window" ? edited.startMinute : -1,
      9 * 60,
    );
    assert.equal(
      edited.kind === "add-window" ? edited.endMinute : -1,
      16 * 60,
    );
    const before = sched([]);
    const after = applyCoverageChangesToSchedule(before, [edited]);
    assert.equal(after.windows.length, 1);
    assert.equal(after.windows[0].startMinute, 9 * 60);
    assert.equal(after.windows[0].endMinute, 16 * 60);
  });

  it("reset (clearing the override) restores the heuristic-suggested time", () => {
    // Simulates the dialog's Reset button: removing the override entry
    // from suggestionEdits should make buildEditedSuggestionMap fall back
    // to the original heuristic-suggested change.
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: sched([{ days: [1], startMinute: 9 * 60, endMinute: 13 * 60 }]),
      after: sched([{ days: [1], startMinute: 9 * 60, endMinute: 15 * 60 }]),
      changes: [
        extendEnd({ windowIndex: 0, day: 1, from: 13 * 60, to: 15 * 60 }),
      ],
    };
    // First: admin tweaked the end down to 14:00.
    const editedWith = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { end: 14 * 60 } },
    });
    const withOverride = editedWith.get("alpha")!;
    assert.equal(withOverride.after.windows[0].endMinute, 14 * 60);
    assert.equal(
      withOverride.changes[0].kind === "extend-end"
        ? withOverride.changes[0].to
        : -1,
      14 * 60,
    );
    // Then: Reset (no overrides for this change index) — schedule reverts
    // to the heuristic-suggested 15:00.
    const editedReset = buildEditedSuggestionMap([suggestion], {
      alpha: {},
    });
    const reset = editedReset.get("alpha")!;
    assert.equal(reset.after.windows[0].endMinute, 15 * 60);
    assert.equal(
      reset.changes[0].kind === "extend-end" ? reset.changes[0].to : -1,
      15 * 60,
    );
    // And a totally empty edits map behaves identically to Reset.
    const editedEmpty = buildEditedSuggestionMap([suggestion], {});
    assert.equal(
      editedEmpty.get("alpha")!.after.windows[0].endMinute,
      15 * 60,
    );
  });
});

describe("getSuggestionChangeBounds", () => {
  it("clamps extend-end edits to the gap span [from, to]", () => {
    const b = getSuggestionChangeBounds(
      extendEnd({ windowIndex: 0, day: 1, from: 13 * 60, to: 15 * 60 }),
    );
    assert.equal(b.endMin, 13 * 60);
    assert.equal(b.endMax, 15 * 60);
    assert.equal(b.startMin, undefined);
    assert.equal(b.startMax, undefined);
  });

  it("clamps extend-start edits to the gap span [to, from]", () => {
    const b = getSuggestionChangeBounds(
      extendStart({ windowIndex: 0, day: 2, from: 14 * 60, to: 10 * 60 }),
    );
    assert.equal(b.startMin, 10 * 60);
    assert.equal(b.startMax, 14 * 60);
  });

  it("clamps add-window edits to the original gap span", () => {
    const b = getSuggestionChangeBounds(
      addWindow({ day: 3, startMinute: 8 * 60, endMinute: 17 * 60 }),
    );
    assert.equal(b.startMin, 8 * 60);
    assert.equal(b.startMax, 17 * 60 - 1);
    assert.equal(b.endMin, 8 * 60 + 1);
    assert.equal(b.endMax, 17 * 60);
  });
});

describe("validateEditedSuggestions — Apply guard", () => {
  it("flags an edit that pushes the fix outside the original gap span", () => {
    // Heuristic: extend Alpha's Mon window from 13:00 → 15:00 (gap is
    // 13:00–15:00). Admin tries to push the new end to 16:00 — out of
    // bounds, dialog must show the bounds error and disable Apply.
    const alphaBefore = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 13 * 60 },
    ]);
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([{ days: [1], startMinute: 9 * 60, endMinute: 15 * 60 }]),
      changes: [
        extendEnd({ windowIndex: 0, day: 1, from: 13 * 60, to: 15 * 60 }),
      ],
    };
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { end: 16 * 60 } },
    });
    const errors = validateEditedSuggestions({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [{ id: "alpha", name: "Alpha", schedule: alphaBefore }],
    });
    assert.ok(errors.alpha, "expected a validation error for Alpha");
    assert.match(errors.alpha, /End must stay within/);
  });

  it("disables Apply with an overlap error when an edit collides with another shared view", () => {
    // Setup: two shared views.
    //   Alpha: Mon 09:00–13:00 only.
    //   Bravo: Mon 15:00–18:00 only.
    // Heuristic for Alpha proposes extend-end 13:00 → 15:00 (closing the
    // Mon 13:00–15:00 gap). Admin overrides the new end to 16:00 — but
    // 16:00 falls inside Bravo's existing 15:00–18:00 window, so Apply
    // must be blocked with a "would overlap with Bravo" error.
    //
    // Note: 16:00 is also out of bounds for the change ([13:00, 15:00]),
    // and the per-change bounds check runs first. To exercise the overlap
    // branch we instead widen Bravo so it eats into the gap, then keep
    // the admin's edit inside bounds but past Bravo's new boundary.
    const alphaBefore = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 13 * 60 },
    ]);
    // Bravo now starts at 14:00, so the heuristic's reported gap is
    // 13:00–14:00 — admin edits Alpha's new end to 14:30, which is in
    // bounds for that suggestion BUT overlaps Bravo's 14:00–18:00.
    const heuristic = extendEnd({
      windowIndex: 0,
      day: 1,
      from: 13 * 60,
      to: 14 * 60 + 30,
    });
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([
        { days: [1], startMinute: 9 * 60, endMinute: 14 * 60 + 30 },
      ]),
      changes: [heuristic],
    };
    const bravoSchedule = sched([
      { days: [1], startMinute: 14 * 60, endMinute: 18 * 60 },
    ]);
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { end: 14 * 60 + 30 } },
    });
    const errors = validateEditedSuggestions({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [
        { id: "alpha", name: "Alpha", schedule: alphaBefore },
        { id: "bravo", name: "Bravo", schedule: bravoSchedule },
      ],
    });
    assert.ok(
      errors.alpha,
      "expected an overlap validation error blocking Apply",
    );
    assert.match(errors.alpha, /overlap/i);
    assert.match(errors.alpha, /Bravo/);
  });

  it("returns no error when the edit fits cleanly within bounds and does not overlap", () => {
    const alphaBefore = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 13 * 60 },
    ]);
    const bravoSchedule = sched([
      { days: [1], startMinute: 15 * 60, endMinute: 18 * 60 },
    ]);
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([{ days: [1], startMinute: 9 * 60, endMinute: 15 * 60 }]),
      changes: [
        extendEnd({ windowIndex: 0, day: 1, from: 13 * 60, to: 15 * 60 }),
      ],
    };
    // Admin nudges the end to 14:00 — inside bounds and well clear of
    // Bravo's 15:00 start.
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { end: 14 * 60 } },
    });
    const errors = validateEditedSuggestions({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [
        { id: "alpha", name: "Alpha", schedule: alphaBefore },
        { id: "bravo", name: "Bravo", schedule: bravoSchedule },
      ],
    });
    assert.equal(errors.alpha, undefined);
  });

  it("honours admin day overrides via buildEditedSuggestionChange for add-window", () => {
    // T313 — Admin moves an add-window fix from Wed (heuristic pick) to Tue.
    const orig = addWindow({
      day: 3,
      startMinute: 8 * 60,
      endMinute: 17 * 60,
    });
    const edited = buildEditedSuggestionChange(orig, { day: 2 });
    assert.equal(edited.kind === "add-window" ? edited.day : -1, 2);
    // Time fields stay heuristic-suggested when no time override given.
    assert.equal(
      edited.kind === "add-window" ? edited.startMinute : -1,
      8 * 60,
    );
    assert.equal(
      edited.kind === "add-window" ? edited.endMinute : -1,
      17 * 60,
    );
    const after = applyCoverageChangesToSchedule(sched([]), [edited]);
    assert.equal(after.windows.length, 1);
    assert.deepEqual(after.windows[0].days, [2]);
  });

  it("honours admin day overrides via buildEditedSuggestionChange for extend-end", () => {
    // T313 — extend-end also accepts a day override; applying it moves the
    // addressed window to the chosen day.
    const orig = extendEnd({
      windowIndex: 0,
      day: 1,
      from: 13 * 60,
      to: 15 * 60,
    });
    const edited = buildEditedSuggestionChange(orig, { day: 2 });
    assert.equal(edited.kind === "extend-end" ? edited.day : -1, 2);
    const before = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 13 * 60 },
    ]);
    const after = applyCoverageChangesToSchedule(before, [edited]);
    assert.deepEqual(after.windows[0].days, [2]);
    assert.equal(after.windows[0].endMinute, 15 * 60);
  });

  it("honours admin day overrides via buildEditedSuggestionChange for extend-start", () => {
    const orig = extendStart({
      windowIndex: 0,
      day: 2,
      from: 14 * 60,
      to: 10 * 60,
    });
    const edited = buildEditedSuggestionChange(orig, { day: 1 });
    assert.equal(edited.kind === "extend-start" ? edited.day : -1, 1);
    const before = sched([
      { days: [2], startMinute: 14 * 60, endMinute: 18 * 60 },
    ]);
    const after = applyCoverageChangesToSchedule(before, [edited]);
    assert.deepEqual(after.windows[0].days, [1]);
    assert.equal(after.windows[0].startMinute, 10 * 60);
  });

  it("Reset (clearing the override) restores the heuristic-suggested day too", () => {
    // T313 — Same Reset semantics as start/end: deleting the override entry
    // makes buildEditedSuggestionMap fall back to the heuristic's day.
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: sched([]),
      after: sched([{ days: [3], startMinute: 8 * 60, endMinute: 17 * 60 }]),
      changes: [
        addWindow({ day: 3, startMinute: 8 * 60, endMinute: 17 * 60 }),
      ],
    };
    const withOverride = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { day: 2 } },
    });
    assert.deepEqual(
      withOverride.get("alpha")!.after.windows[0].days,
      [2],
    );
    // Reset (no overrides for this change index) — day reverts to Wed (3).
    const reset = buildEditedSuggestionMap([suggestion], { alpha: {} });
    assert.deepEqual(reset.get("alpha")!.after.windows[0].days, [3]);
  });
});

describe("validateEditedSuggestions — day override overlap guard", () => {
  it("flags an overlap when the admin moves a fix onto a day already covered by another shared view", () => {
    // T313 — Heuristic adds a Wed 09:00–17:00 window to Alpha (which
    // already covers Sat) to plug a Wed-only gap. Admin retargets the
    // fix to Tue, but Bravo already covers Tue 10:00–14:00 — the
    // day-override must trip the overlap guard against Bravo, naming it
    // in the error.
    const alphaBefore = sched([
      { days: [6], startMinute: 9 * 60, endMinute: 17 * 60 },
    ]);
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([
        { days: [6], startMinute: 9 * 60, endMinute: 17 * 60 },
        { days: [3], startMinute: 9 * 60, endMinute: 17 * 60 },
      ]),
      changes: [
        addWindow({ day: 3, startMinute: 9 * 60, endMinute: 17 * 60 }),
      ],
    };
    const bravoSchedule = sched([
      { days: [2], startMinute: 10 * 60, endMinute: 14 * 60 },
    ]);
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { day: 2 } },
    });
    const errors = validateEditedSuggestions({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [
        { id: "alpha", name: "Alpha", schedule: alphaBefore },
        { id: "bravo", name: "Bravo", schedule: bravoSchedule },
      ],
    });
    assert.ok(errors.alpha, "expected an overlap error for the day move");
    assert.match(errors.alpha, /overlap/i);
    assert.match(errors.alpha, /Bravo/);
  });

  it("returns no error when the admin moves a fix onto an entirely uncovered day", () => {
    // Same Alpha add-window suggestion as above, but Bravo only covers Mon
    // — moving to Tue collides with nothing, so Apply must stay enabled.
    const alphaBefore = sched([]);
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([{ days: [3], startMinute: 9 * 60, endMinute: 17 * 60 }]),
      changes: [
        addWindow({ day: 3, startMinute: 9 * 60, endMinute: 17 * 60 }),
      ],
    };
    const bravoSchedule = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 17 * 60 },
    ]);
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { day: 2 } },
    });
    const errors = validateEditedSuggestions({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [
        { id: "alpha", name: "Alpha", schedule: alphaBefore },
        { id: "bravo", name: "Bravo", schedule: bravoSchedule },
      ],
    });
    assert.equal(errors.alpha, undefined);
  });
});

describe("computeUncoveredOriginalGapWarnings — day-move regression", () => {
  it("warns when a day-override leaves the originally-targeted day uncovered", () => {
    // Heuristic: Alpha gets an add-window for Wed 09:00–17:00 (closing a
    // Wed-only gap). Admin retargets the fix to Tue. Tue happens to be
    // uncovered too, so the edit passes the overlap guard — but Wed is
    // still wide open after the apply, which is exactly the regression
    // this warning is designed to catch.
    const alphaBefore = sched([]);
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([{ days: [3], startMinute: 9 * 60, endMinute: 17 * 60 }]),
      changes: [
        addWindow({ day: 3, startMinute: 9 * 60, endMinute: 17 * 60 }),
      ],
    };
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { day: 2 } },
    });
    const warnings = computeUncoveredOriginalGapWarnings({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [{ id: "alpha", name: "Alpha", schedule: alphaBefore }],
    });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].viewId, "alpha");
    assert.deepEqual(warnings[0].uncoveredDays, [3]);
  });

  it("emits no warning when the heuristic-targeted day is covered by another view after edits", () => {
    // Same Alpha suggestion moved to Tue, but Bravo already covers all of
    // Wed — so Wed isn't actually uncovered post-apply.
    const alphaBefore = sched([]);
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([{ days: [3], startMinute: 9 * 60, endMinute: 17 * 60 }]),
      changes: [
        addWindow({ day: 3, startMinute: 9 * 60, endMinute: 17 * 60 }),
      ],
    };
    const bravoSchedule = sched([
      { days: [3], startMinute: 0, endMinute: 1440 },
    ]);
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { day: 2 } },
    });
    const warnings = computeUncoveredOriginalGapWarnings({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [
        { id: "alpha", name: "Alpha", schedule: alphaBefore },
        { id: "bravo", name: "Bravo", schedule: bravoSchedule },
      ],
    });
    assert.deepEqual(warnings, []);
  });

  it("emits no warning when the admin does not move the fix off its targeted day", () => {
    // Plain time-only edit (end nudged earlier but still on the same day).
    // The remaining minutes on the targeted day are still uncovered, but
    // that's the heuristic's choice — only edits that *move* the fix to a
    // different day should trip this warning, OR edits that shrink the
    // fix below the targeted gap. Here the fix still covers 09:00–14:00
    // of the targeted day so Mon stays partially uncovered → warning.
    // The point of this test is just to confirm the helper reports the
    // *original gap day* (Mon) when minutes on it remain uncovered.
    const alphaBefore = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 13 * 60 },
    ]);
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([{ days: [1], startMinute: 9 * 60, endMinute: 15 * 60 }]),
      changes: [
        extendEnd({ windowIndex: 0, day: 1, from: 13 * 60, to: 15 * 60 }),
      ],
    };
    // Admin shrinks the extension end back to 14:00 → 14:00–15:00 of Mon
    // remains in the original 13:00–15:00 gap.
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { end: 14 * 60 } },
    });
    const warnings = computeUncoveredOriginalGapWarnings({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [{ id: "alpha", name: "Alpha", schedule: alphaBefore }],
    });
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0].uncoveredDays, [1]);
  });

  it("skips unaccepted suggestions", () => {
    const alphaBefore = sched([]);
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([{ days: [3], startMinute: 9 * 60, endMinute: 17 * 60 }]),
      changes: [
        addWindow({ day: 3, startMinute: 9 * 60, endMinute: 17 * 60 }),
      ],
    };
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { day: 2 } },
    });
    const warnings = computeUncoveredOriginalGapWarnings({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(),
      sharedViews: [{ id: "alpha", name: "Alpha", schedule: alphaBefore }],
    });
    assert.deepEqual(warnings, []);
  });
});

describe("validateEditedSuggestions — Apply guard (accepted-only)", () => {
  it("skips the overlap check for suggestions the admin has not accepted", () => {
    // Even if an edit would collide, an unchecked suggestion must not
    // surface an overlap error — Apply is only gated for accepted rows.
    const alphaBefore = sched([
      { days: [1], startMinute: 9 * 60, endMinute: 13 * 60 },
    ]);
    const bravoSchedule = sched([
      { days: [1], startMinute: 14 * 60, endMinute: 18 * 60 },
    ]);
    const suggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([
        { days: [1], startMinute: 9 * 60, endMinute: 14 * 60 + 30 },
      ]),
      changes: [
        extendEnd({
          windowIndex: 0,
          day: 1,
          from: 13 * 60,
          to: 14 * 60 + 30,
        }),
      ],
    };
    const editedMap = buildEditedSuggestionMap([suggestion], {
      alpha: { 0: { end: 14 * 60 + 30 } },
    });
    const errors = validateEditedSuggestions({
      suggestions: [suggestion],
      editedMap,
      acceptedSuggestionIds: new Set(), // not accepted
      sharedViews: [
        { id: "alpha", name: "Alpha", schedule: alphaBefore },
        { id: "bravo", name: "Bravo", schedule: bravoSchedule },
      ],
    });
    assert.equal(errors.alpha, undefined);
  });
});

describe("buildOriginalDayCoverageChanges — Cover original day too", () => {
  it("produces an add-window for the original gap of an add-window change moved off its day", () => {
    // T318 — Heuristic add-window for Wed 09:00–17:00, admin retargeted to
    // Tue. Clicking "Cover original day too" should produce a sibling
    // add-window covering Wed 09:00–17:00.
    const orig = addWindow({
      day: 3,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    });
    const extras = buildOriginalDayCoverageChanges([orig], [3]);
    assert.equal(extras.length, 1);
    const ex = extras[0];
    assert.equal(ex.kind, "add-window");
    assert.equal(ex.kind === "add-window" ? ex.day : -1, 3);
    assert.equal(ex.kind === "add-window" ? ex.startMinute : -1, 9 * 60);
    assert.equal(ex.kind === "add-window" ? ex.endMinute : -1, 17 * 60);
  });

  it("produces an add-window covering an extend-end's original gap span", () => {
    // Heuristic: extend Mon window from 13:00 → 15:00 (original gap is
    // Mon 13:00–15:00). The sibling cover should match.
    const orig = extendEnd({
      windowIndex: 0,
      day: 1,
      from: 13 * 60,
      to: 15 * 60,
    });
    const extras = buildOriginalDayCoverageChanges([orig], [1]);
    assert.equal(extras.length, 1);
    const ex = extras[0];
    assert.equal(ex.kind === "add-window" ? ex.day : -1, 1);
    assert.equal(ex.kind === "add-window" ? ex.startMinute : -1, 13 * 60);
    assert.equal(ex.kind === "add-window" ? ex.endMinute : -1, 15 * 60);
  });

  it("dedupes when multiple heuristic changes share the same original day/span", () => {
    const a = addWindow({ day: 3, startMinute: 9 * 60, endMinute: 17 * 60 });
    const b = addWindow({ day: 3, startMinute: 9 * 60, endMinute: 17 * 60 });
    const extras = buildOriginalDayCoverageChanges([a, b], [3]);
    assert.equal(extras.length, 1);
  });

  it("skips changes whose original day is not in uncoveredDays", () => {
    const a = addWindow({ day: 3, startMinute: 9 * 60, endMinute: 17 * 60 });
    const b = addWindow({ day: 4, startMinute: 9 * 60, endMinute: 17 * 60 });
    const extras = buildOriginalDayCoverageChanges([a, b], [3]);
    assert.equal(extras.length, 1);
    assert.equal(extras[0].kind === "add-window" ? extras[0].day : -1, 3);
  });

  it("clears the uncovered-day warning when the extra is layered into the suggestion's changes", () => {
    // End-to-end: simulate the BroadcastPreview wrapper by appending the
    // extra to the suggestion's changes. The warning helper must then
    // report no remaining uncovered days for this view.
    const alphaBefore = sched([
      { days: [6], startMinute: 9 * 60, endMinute: 17 * 60 },
    ]);
    const heuristic = addWindow({
      day: 3,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    });
    const baseSuggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([
        { days: [6], startMinute: 9 * 60, endMinute: 17 * 60 },
        { days: [3], startMinute: 9 * 60, endMinute: 17 * 60 },
      ]),
      changes: [heuristic],
    };
    // Pre-extra: admin moved Wed fix to Tue → warning fires on Wed.
    const pre = computeUncoveredOriginalGapWarnings({
      suggestions: [baseSuggestion],
      editedMap: buildEditedSuggestionMap([baseSuggestion], {
        alpha: { 0: { day: 2 } },
      }),
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [{ id: "alpha", name: "Alpha", schedule: alphaBefore }],
    });
    assert.deepEqual(pre[0]?.uncoveredDays, [3]);
    // Apply the action: append sibling add-window for the uncovered Wed.
    const extras = buildOriginalDayCoverageChanges([heuristic], [3]);
    const effective: CoverageSuggestion = {
      ...baseSuggestion,
      changes: [...baseSuggestion.changes, ...extras],
    };
    const post = computeUncoveredOriginalGapWarnings({
      suggestions: [effective],
      // Note: only the heuristic change carries the day override; the
      // sibling extra (index 1) has no override, so it runs on Wed.
      editedMap: buildEditedSuggestionMap([effective], {
        alpha: { 0: { day: 2 } },
      }),
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [{ id: "alpha", name: "Alpha", schedule: alphaBefore }],
    });
    assert.deepEqual(post, []);
  });

  it("surfaces an overlap error when the appended sibling would collide with another shared view", () => {
    // T318 — Respect the overlap guard. Alpha owns Sat baseline; its
    // heuristic add-window targeted Wed 09:00–17:00, admin moved it to
    // Tue. Bravo already covers all of Wed, so the "Cover original day
    // too" sibling for Wed 09:00–17:00 must trip the overlap guard,
    // naming Bravo in the error.
    const alphaBefore = sched([
      { days: [6], startMinute: 9 * 60, endMinute: 17 * 60 },
    ]);
    const heuristic = addWindow({
      day: 3,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    });
    const baseSuggestion: CoverageSuggestion = {
      viewId: "alpha",
      viewName: "Alpha",
      before: alphaBefore,
      after: sched([
        { days: [6], startMinute: 9 * 60, endMinute: 17 * 60 },
        { days: [3], startMinute: 9 * 60, endMinute: 17 * 60 },
      ]),
      changes: [heuristic],
    };
    const bravoSchedule = sched([
      { days: [3], startMinute: 0, endMinute: 1440 },
    ]);
    const extras = buildOriginalDayCoverageChanges([heuristic], [3]);
    const effective: CoverageSuggestion = {
      ...baseSuggestion,
      changes: [...baseSuggestion.changes, ...extras],
    };
    const editedMap = buildEditedSuggestionMap([effective], {
      alpha: { 0: { day: 2 } },
    });
    const errors = validateEditedSuggestions({
      suggestions: [effective],
      editedMap,
      acceptedSuggestionIds: new Set(["alpha"]),
      sharedViews: [
        { id: "alpha", name: "Alpha", schedule: alphaBefore },
        { id: "bravo", name: "Bravo", schedule: bravoSchedule },
      ],
    });
    assert.ok(errors.alpha, "expected overlap error from sibling cover");
    assert.match(errors.alpha, /overlap/i);
    assert.match(errors.alpha, /Bravo/);
  });

  it("batch cover-all clears safe views and silently skips overlap-tripping ones", () => {
    // T332 — Simulate the "Cover all flagged days" batch handler. Three
    // views all show the day-move warning. Alpha's and Charlie's sibling
    // covers don't collide with any other view, so they commit. Bravo's
    // sibling (Wed 13–16) overlaps Delta's Wed 14–15 baseline, so it
    // must be skipped silently — its per-view warning + action remain.
    // Each view owns a unique baseline day to avoid accepted-edit
    // collisions among themselves.
    const alphaBefore = sched([
      { days: [6], startMinute: 9 * 60, endMinute: 17 * 60 }, // Sat
    ]);
    const bravoBefore = sched([
      { days: [0], startMinute: 9 * 60, endMinute: 17 * 60 }, // Sun
    ]);
    const charlieBefore = sched([
      { days: [5], startMinute: 9 * 60, endMinute: 17 * 60 }, // Fri
    ]);
    const deltaSchedule = sched([
      { days: [3], startMinute: 14 * 60, endMinute: 15 * 60 }, // Wed 14–15
    ]);
    const suggestions: CoverageSuggestion[] = [
      {
        viewId: "alpha",
        viewName: "Alpha",
        before: alphaBefore,
        after: applyCoverageChangesToSchedule(alphaBefore, [
          addWindow({ day: 3, startMinute: 9 * 60, endMinute: 12 * 60 }),
        ]),
        changes: [
          addWindow({ day: 3, startMinute: 9 * 60, endMinute: 12 * 60 }),
        ],
      },
      {
        viewId: "bravo",
        viewName: "Bravo",
        before: bravoBefore,
        after: applyCoverageChangesToSchedule(bravoBefore, [
          addWindow({ day: 3, startMinute: 13 * 60, endMinute: 16 * 60 }),
        ]),
        changes: [
          addWindow({ day: 3, startMinute: 13 * 60, endMinute: 16 * 60 }),
        ],
      },
      {
        viewId: "charlie",
        viewName: "Charlie",
        before: charlieBefore,
        after: applyCoverageChangesToSchedule(charlieBefore, [
          addWindow({ day: 4, startMinute: 9 * 60, endMinute: 12 * 60 }),
        ]),
        changes: [
          addWindow({ day: 4, startMinute: 9 * 60, endMinute: 12 * 60 }),
        ],
      },
    ];
    const sharedViews = [
      { id: "alpha", name: "Alpha", schedule: alphaBefore },
      { id: "bravo", name: "Bravo", schedule: bravoBefore },
      { id: "charlie", name: "Charlie", schedule: charlieBefore },
      { id: "delta", name: "Delta", schedule: deltaSchedule },
    ];
    // Each admin retargeted its fix to a unique unused day so the
    // accepted edits don't collide among themselves.
    const edits: Record<
      string,
      Record<number, SuggestionEditOverride>
    > = {
      alpha: { 0: { day: 2 } }, // Wed → Tue
      bravo: { 0: { day: 4 } }, // Wed → Thu
      charlie: { 0: { day: 1 } }, // Thu → Mon
    };
    const accepted = new Set(["alpha", "bravo", "charlie"]);
    const warnings = computeUncoveredOriginalGapWarnings({
      suggestions,
      editedMap: buildEditedSuggestionMap(suggestions, edits),
      acceptedSuggestionIds: accepted,
      sharedViews,
    });
    assert.equal(warnings.length, 3);

    // Replay the batch handler's per-view trial loop.
    const workingExtras: Record<string, CoverageSuggestionChange[]> = {};
    const committed: Record<string, CoverageSuggestionChange[]> = {};
    // T340 — Track covered vs skipped names (with conflicting view name
    // parsed from the overlap-guard error) the same way the UI handler
    // does so we can assert on what the post-click toast would say.
    const coveredNames: string[] = [];
    const skippedEntries: { name: string; conflictsWith?: string }[] = [];
    for (const w of warnings) {
      const sug = suggestions.find((s) => s.viewId === w.viewId)!;
      const fresh = buildOriginalDayCoverageChanges(
        sug.changes,
        w.uncoveredDays,
      );
      if (fresh.length === 0) continue;
      const trialExtras = {
        ...workingExtras,
        [w.viewId]: [...(workingExtras[w.viewId] ?? []), ...fresh],
      };
      const trialEffective = suggestions.map((s) => {
        const ex = trialExtras[s.viewId];
        return ex && ex.length > 0 ? { ...s, changes: [...s.changes, ...ex] } : s;
      });
      const trialErrors = validateEditedSuggestions({
        suggestions: trialEffective,
        editedMap: buildEditedSuggestionMap(trialEffective, edits),
        acceptedSuggestionIds: accepted,
        sharedViews,
      });
      if (trialErrors[w.viewId]) {
        const m = /^Edits would overlap with (.+)$/.exec(trialErrors[w.viewId]);
        skippedEntries.push({
          name: sug.viewName,
          conflictsWith: m ? m[1] : undefined,
        });
        continue;
      }
      workingExtras[w.viewId] = trialExtras[w.viewId];
      committed[w.viewId] = fresh;
      coveredNames.push(sug.viewName);
    }
    assert.ok(committed.alpha, "alpha sibling cover should commit");
    assert.ok(committed.charlie, "charlie sibling cover should commit");
    assert.equal(
      committed.bravo,
      undefined,
      "bravo sibling cover should be skipped (would overlap with Delta)",
    );
    // T340 — The post-click toast names exactly which views were covered
    // (Alpha + Charlie) and which were skipped along with the conflicting
    // view's name (Bravo, would overlap with Delta).
    assert.deepEqual(coveredNames.sort(), ["Alpha", "Charlie"]);
    assert.equal(skippedEntries.length, 1);
    assert.equal(skippedEntries[0].name, "Bravo");
    assert.equal(skippedEntries[0].conflictsWith, "Delta");

    // After the batch, alpha + charlie are cleared; bravo still warns.
    const finalEffective = suggestions.map((s) => {
      const ex = workingExtras[s.viewId];
      return ex && ex.length > 0 ? { ...s, changes: [...s.changes, ...ex] } : s;
    });
    const post = computeUncoveredOriginalGapWarnings({
      suggestions: finalEffective,
      editedMap: buildEditedSuggestionMap(finalEffective, edits),
      acceptedSuggestionIds: accepted,
      sharedViews,
    });
    assert.deepEqual(
      post.map((w) => w.viewId).sort(),
      ["bravo"],
    );
  });

  it("undo cover-all restores extras + acceptance to their pre-batch state without touching unrelated edits", () => {
    // T341 — Round-trip the "Cover all flagged days" batch handler with its
    // matching Undo. Alpha + Charlie both flag the day-move warning; Bravo
    // is also a flagged suggestion. The admin had:
    //   - Manually added a per-view sibling extra to Alpha *before* the
    //     batch (Sat 09–10). Undo must leave that intact.
    //   - Already accepted Bravo before the batch. Undo must keep it
    //     accepted.
    //   - Not accepted Charlie before the batch. Undo must un-accept it,
    //     because the batch is what flipped it on.
    const alphaBefore = sched([
      { days: [6], startMinute: 9 * 60, endMinute: 17 * 60 }, // Sat
    ]);
    const bravoBefore = sched([
      { days: [0], startMinute: 9 * 60, endMinute: 17 * 60 }, // Sun
    ]);
    const charlieBefore = sched([
      { days: [5], startMinute: 9 * 60, endMinute: 17 * 60 }, // Fri
    ]);
    const suggestions: CoverageSuggestion[] = [
      {
        viewId: "alpha",
        viewName: "Alpha",
        before: alphaBefore,
        after: applyCoverageChangesToSchedule(alphaBefore, [
          addWindow({ day: 3, startMinute: 9 * 60, endMinute: 12 * 60 }),
        ]),
        changes: [
          addWindow({ day: 3, startMinute: 9 * 60, endMinute: 12 * 60 }),
        ],
      },
      {
        viewId: "charlie",
        viewName: "Charlie",
        before: charlieBefore,
        after: applyCoverageChangesToSchedule(charlieBefore, [
          addWindow({ day: 4, startMinute: 9 * 60, endMinute: 12 * 60 }),
        ]),
        changes: [
          addWindow({ day: 4, startMinute: 9 * 60, endMinute: 12 * 60 }),
        ],
      },
    ];
    const sharedViews = [
      { id: "alpha", name: "Alpha", schedule: alphaBefore },
      { id: "bravo", name: "Bravo", schedule: bravoBefore },
      { id: "charlie", name: "Charlie", schedule: charlieBefore },
    ];
    const edits: Record<string, Record<number, SuggestionEditOverride>> = {
      alpha: { 0: { day: 2 } }, // Wed → Tue
      charlie: { 0: { day: 1 } }, // Thu → Mon
    };

    // Pre-batch state: alpha has a manual sibling extra; bravo is already
    // accepted (separately from the suggestions list, but the snapshot
    // only cares about ids); charlie is not accepted.
    const preExtras: Record<string, CoverageSuggestionChange[]> = {
      alpha: [addWindow({ day: 6, startMinute: 9 * 60, endMinute: 10 * 60 })],
    };
    const preAccepted = new Set(["alpha", "bravo"]);

    // ---- batch handler ----
    const workingExtras: Record<string, CoverageSuggestionChange[]> = {
      ...preExtras,
    };
    const committed: Record<string, CoverageSuggestionChange[]> = {};
    const newlyAcceptedIds = new Set<string>();
    const warnings = computeUncoveredOriginalGapWarnings({
      suggestions,
      editedMap: buildEditedSuggestionMap(suggestions, edits),
      acceptedSuggestionIds: new Set(["alpha", "charlie"]),
      sharedViews,
    });
    for (const w of warnings) {
      const sug = suggestions.find((s) => s.viewId === w.viewId)!;
      const existing = workingExtras[w.viewId] ?? [];
      const seen = new Set(
        existing.map((c) =>
          c.kind === "add-window"
            ? `${c.day}|${c.startMinute}|${c.endMinute}`
            : "",
        ),
      );
      const fresh = buildOriginalDayCoverageChanges(
        sug.changes,
        w.uncoveredDays,
      ).filter((c) => {
        if (c.kind !== "add-window") return false;
        const key = `${c.day}|${c.startMinute}|${c.endMinute}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (fresh.length === 0) continue;
      workingExtras[w.viewId] = [...existing, ...fresh];
      committed[w.viewId] = fresh;
      if (!preAccepted.has(w.viewId)) newlyAcceptedIds.add(w.viewId);
    }
    assert.ok(committed.alpha && committed.charlie);
    assert.deepEqual(Array.from(newlyAcceptedIds).sort(), ["charlie"]);

    // After-batch acceptance set (alpha was already accepted; charlie got
    // flipped on by the batch; bravo stays accepted from before).
    const postBatchAccepted = new Set(preAccepted);
    for (const id of newlyAcceptedIds) postBatchAccepted.add(id);

    // Snapshot what we'll need to undo.
    const snapshot = {
      extras: Object.fromEntries(
        Object.entries(committed).map(([vid, fresh]) => [
          vid,
          fresh
            .filter(
              (c): c is Extract<CoverageSuggestionChange, { kind: "add-window" }> =>
                c.kind === "add-window",
            )
            .map((c) => ({
              day: c.day,
              startMinute: c.startMinute,
              endMinute: c.endMinute,
            })),
        ]),
      ),
      newlyAcceptedIds: Array.from(newlyAcceptedIds),
    };

    // ---- undo handler ----
    const undone: Record<string, CoverageSuggestionChange[]> = {
      ...workingExtras,
    };
    for (const [vid, removed] of Object.entries(snapshot.extras)) {
      const arr = undone[vid];
      if (!arr || arr.length === 0) continue;
      const toRemove = new Map<string, number>();
      for (const r of removed) {
        const key = `${r.day}|${r.startMinute}|${r.endMinute}`;
        toRemove.set(key, (toRemove.get(key) ?? 0) + 1);
      }
      const kept: CoverageSuggestionChange[] = [];
      for (const c of arr) {
        if (c.kind === "add-window") {
          const key = `${c.day}|${c.startMinute}|${c.endMinute}`;
          const remaining = toRemove.get(key) ?? 0;
          if (remaining > 0) {
            toRemove.set(key, remaining - 1);
            continue;
          }
        }
        kept.push(c);
      }
      if (kept.length === 0) delete undone[vid];
      else undone[vid] = kept;
    }
    const undoneAccepted = new Set(postBatchAccepted);
    for (const id of snapshot.newlyAcceptedIds) undoneAccepted.delete(id);

    // Alpha's manual pre-batch extra is still there; charlie's batch extra
    // is gone.
    assert.deepEqual(undone.alpha, preExtras.alpha);
    assert.equal(undone.charlie, undefined);
    // Acceptance restored: bravo stays (pre-existing), charlie removed
    // (batch-added), alpha stays (pre-existing).
    assert.deepEqual(
      Array.from(undoneAccepted).sort(),
      ["alpha", "bravo"],
    );
  });
});
