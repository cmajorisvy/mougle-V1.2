import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildScheduleFromGaps,
  selectFallbackGaps,
  applyNewFallbackViewFlow,
  type SavedViewScheduleShape,
  type ScheduleDiagnosticGap,
} from "../client/src/pages/admin/broadcastSchedule";

// T306 — Regression coverage for the "Create new fallback view" branch of
// the Suggest fix dialog. The dialog reduces to two pure helpers plus an
// orchestrator function (so the React layer just wires state in), and we
// pin all three here.

describe("buildScheduleFromGaps", () => {
  it("returns an empty (but enabled) schedule for no gaps", () => {
    const s = buildScheduleFromGaps([]);
    assert.equal(s.enabled, true);
    assert.equal(s.timezone, "local");
    assert.deepEqual(s.windows, []);
  });

  it("turns a single gap into one single-day window", () => {
    const gaps: ScheduleDiagnosticGap[] = [
      { day: 1, start: 9 * 60, end: 12 * 60 },
    ];
    const s = buildScheduleFromGaps(gaps);
    assert.deepEqual(s.windows, [
      { days: [1], startMinute: 9 * 60, endMinute: 12 * 60 },
    ]);
  });

  it("preserves gaps spanning multiple days as one window each", () => {
    // computeScheduleDiagnostics emits per-day gaps even for week-long
    // outages, so the fallback builder treats each day independently.
    const gaps: ScheduleDiagnosticGap[] = [
      { day: 0, start: 0, end: 1440 },
      { day: 1, start: 0, end: 600 },
      { day: 3, start: 720, end: 1440 },
    ];
    const s = buildScheduleFromGaps(gaps);
    assert.deepEqual(s.windows, [
      { days: [0], startMinute: 0, endMinute: 1440 },
      { days: [1], startMinute: 0, endMinute: 600 },
      { days: [3], startMinute: 720, endMinute: 1440 },
    ]);
    // Each window covers exactly one day so the "fallback covers leftover
    // gaps only" promise holds.
    for (const w of s.windows) assert.equal(w.days.length, 1);
  });

  it("filters out zero-length gaps so they don't become empty windows", () => {
    const gaps: ScheduleDiagnosticGap[] = [
      { day: 2, start: 600, end: 600 }, // degenerate
      { day: 2, start: 600, end: 900 }, // real
      { day: 4, start: 0, end: 0 }, // degenerate
    ];
    const s = buildScheduleFromGaps(gaps);
    assert.deepEqual(s.windows, [
      { days: [2], startMinute: 600, endMinute: 900 },
    ]);
  });
});

describe("selectFallbackGaps", () => {
  const initial: ScheduleDiagnosticGap[] = [
    { day: 0, start: 0, end: 1440 },
    { day: 6, start: 0, end: 1440 },
  ];
  const unresolved: ScheduleDiagnosticGap[] = [
    { day: 6, start: 720, end: 1440 },
  ];

  it("returns initialGaps when mode is extend-existing", () => {
    assert.equal(
      selectFallbackGaps("extend-existing", 2, 2, initial, unresolved),
      initial,
    );
  });

  it("returns initialGaps in new-fallback mode when no extension is accepted", () => {
    assert.equal(
      selectFallbackGaps("new-fallback", 0, 3, initial, unresolved),
      initial,
    );
  });

  it("returns initialGaps in new-fallback mode when there are no extension suggestions to take", () => {
    assert.equal(
      selectFallbackGaps("new-fallback", 1, 0, initial, unresolved),
      initial,
    );
  });

  it("returns unresolvedGaps when new-fallback mode is paired with accepted extensions", () => {
    assert.equal(
      selectFallbackGaps("new-fallback", 1, 3, initial, unresolved),
      unresolved,
    );
  });
});

describe("applyNewFallbackViewFlow", () => {
  type Call =
    | { kind: "post"; body: any }
    | { kind: "patch"; id: string; schedule: SavedViewScheduleShape };

  function makeDeps(opts: { newId?: string } = {}) {
    const calls: Call[] = [];
    return {
      calls,
      deps: {
        postSavedView: async (body: any) => {
          calls.push({ kind: "post", body });
          return { id: opts.newId ?? "new-view-1" };
        },
        patchSchedule: async (id: string, schedule: SavedViewScheduleShape) => {
          calls.push({ kind: "patch", id, schedule });
        },
      },
    };
  }

  it("no-ops with empty windows or blank name", async () => {
    const { calls, deps } = makeDeps();
    assert.equal(
      await applyNewFallbackViewFlow(
        {
          name: "   ",
          schedule: { enabled: true, timezone: "local", windows: [] },
          selectedExtensions: [],
          filters: { dryRun: "all", status: "all", packageId: "" },
          useCurrentFilters: false,
        },
        deps,
      ),
      null,
    );
    assert.equal(
      await applyNewFallbackViewFlow(
        {
          name: "Coverage fallback",
          schedule: { enabled: true, timezone: "local", windows: [] },
          selectedExtensions: [],
          filters: { dryRun: "all", status: "all", packageId: "" },
          useCurrentFilters: false,
        },
        deps,
      ),
      null,
    );
    assert.deepEqual(calls, []);
  });

  it("POSTs the view then PATCHes its schedule with initialGaps when no extensions are selected", async () => {
    // Simulates: admin opens dialog, picks "Create new fallback view",
    // leaves every extension suggestion unchecked, types a name, applies.
    const initial: ScheduleDiagnosticGap[] = [
      { day: 0, start: 0, end: 1440 },
      { day: 6, start: 0, end: 1440 },
    ];
    const unresolved: ScheduleDiagnosticGap[] = [
      { day: 6, start: 720, end: 1440 },
    ];
    const gaps = selectFallbackGaps(
      "new-fallback",
      0, // nothing accepted
      2, // suggestions do exist
      initial,
      unresolved,
    );
    const schedule = buildScheduleFromGaps(gaps);

    const { calls, deps } = makeDeps({ newId: "view-fallback-1" });
    const out = await applyNewFallbackViewFlow(
      {
        name: "  Weekend cover  ",
        schedule,
        selectedExtensions: [],
        filters: { dryRun: "ready", status: "pending", packageId: "  pkg-7 " },
        useCurrentFilters: true,
      },
      deps,
    );

    assert.deepEqual(out, { newViewId: "view-fallback-1" });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      kind: "post",
      body: {
        name: "Weekend cover",
        scope: "shared",
        dryRun: "ready",
        status: "pending",
        packageId: "pkg-7",
      },
    });
    assert.deepEqual(calls[1], {
      kind: "patch",
      id: "view-fallback-1",
      schedule: {
        enabled: true,
        timezone: "local",
        windows: [
          { days: [0], startMinute: 0, endMinute: 1440 },
          { days: [6], startMinute: 0, endMinute: 1440 },
        ],
      },
    });
  });

  it("patches accepted extensions first, then POSTs + PATCHes the new view with unresolvedGaps", async () => {
    // Simulates: admin keeps an extension suggestion checked AND switches to
    // "Create new fallback view" — the new view must cover only what the
    // extension can't absorb.
    const initial: ScheduleDiagnosticGap[] = [
      { day: 0, start: 0, end: 1440 },
      { day: 6, start: 0, end: 1440 },
    ];
    const unresolved: ScheduleDiagnosticGap[] = [
      { day: 6, start: 720, end: 1440 },
    ];
    const gaps = selectFallbackGaps(
      "new-fallback",
      1,
      2,
      initial,
      unresolved,
    );
    assert.equal(gaps, unresolved);
    const schedule = buildScheduleFromGaps(gaps);

    const extAfter: SavedViewScheduleShape = {
      enabled: true,
      timezone: "local",
      windows: [{ days: [0], startMinute: 0, endMinute: 1440 }],
    };

    const { calls, deps } = makeDeps({ newId: "view-fallback-2" });
    const out = await applyNewFallbackViewFlow(
      {
        name: "Leftover cover",
        schedule,
        selectedExtensions: [{ viewId: "alpha", after: extAfter }],
        filters: { dryRun: "ready", status: "pending", packageId: "pkg-7" },
        useCurrentFilters: false, // ignore current filters → defaults
      },
      deps,
    );

    assert.deepEqual(out, { newViewId: "view-fallback-2" });
    // Order: PATCH extension(s) → POST new view → PATCH new view schedule.
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0], {
      kind: "patch",
      id: "alpha",
      schedule: extAfter,
    });
    assert.deepEqual(calls[1], {
      kind: "post",
      body: {
        name: "Leftover cover",
        scope: "shared",
        dryRun: "all",
        status: "all",
        packageId: "",
      },
    });
    assert.deepEqual(calls[2], {
      kind: "patch",
      id: "view-fallback-2",
      schedule: {
        enabled: true,
        timezone: "local",
        windows: [{ days: [6], startMinute: 720, endMinute: 1440 }],
      },
    });
  });

  it("propagates a failure from the create endpoint without patching the new view", async () => {
    const calls: Call[] = [];
    const deps = {
      postSavedView: async (body: any) => {
        calls.push({ kind: "post", body });
        throw new Error("Created view missing id");
      },
      patchSchedule: async (id: string, schedule: SavedViewScheduleShape) => {
        calls.push({ kind: "patch", id, schedule });
      },
    };
    await assert.rejects(
      applyNewFallbackViewFlow(
        {
          name: "x",
          schedule: {
            enabled: true,
            timezone: "local",
            windows: [{ days: [0], startMinute: 0, endMinute: 60 }],
          },
          selectedExtensions: [],
          filters: { dryRun: "all", status: "all", packageId: "" },
          useCurrentFilters: false,
        },
        deps,
      ),
      /Created view missing id/,
    );
    // Only the POST attempt happened; no schedule was attached to a phantom id.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "post");
  });
});
