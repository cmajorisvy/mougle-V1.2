// T263/T269/T273 — Pure helpers for the saved-view rotation logic. Kept in a
// standalone module (no React, no Vite-only imports) so they can be unit-tested
// from the Node test runner without pulling in the whole admin page.

export type SavedViewScheduleShape = {
  enabled: boolean;
  timezone: "local";
  windows: Array<{
    days: number[];
    startMinute: number;
    endMinute: number;
  }>;
};

export type ScheduledViewLike = {
  id: string;
  scope: "private" | "shared";
  schedule: SavedViewScheduleShape | null;
};

// Returns true if `now` falls inside any window of the schedule, using the
// viewer's local time. Windows where end <= start wrap past midnight into
// the next day. Empty `windows` means no eligibility.
export function scheduleMatchesNow(
  schedule: SavedViewScheduleShape,
  now: Date,
): boolean {
  if (!schedule.enabled) return false;
  if (!schedule.windows.length) return false;
  const day = now.getDay();
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const prevDay = (day + 6) % 7;
  for (const w of schedule.windows) {
    if (!w.days.length) continue;
    if (w.endMinute > w.startMinute) {
      if (w.days.includes(day) &&
          minuteOfDay >= w.startMinute &&
          minuteOfDay < w.endMinute) {
        return true;
      }
    } else {
      // Wrapping window: covers [start, 1440) on `day` AND [0, end) on the
      // next day. Match either segment.
      if (w.days.includes(day) && minuteOfDay >= w.startMinute) return true;
      if (w.days.includes(prevDay) && minuteOfDay < w.endMinute) return true;
    }
  }
  return false;
}

// T269 — Find the next moment (within ~8 days) when the "currently active"
// scheduled shared view will change. Returns the transition timestamp and the
// view that will be active at that moment (or null if no view is eligible
// then). Used to render a "Now: X · Next: Y at HH:MM" indicator so admins can
// see the rotation without waiting for the one-shot apply toast.
export function nextScheduleTransition<
  V extends ScheduledViewLike & { name: string },
>(
  views: V[],
  now: Date,
  currentActiveId: string | null,
): { at: Date; view: V | null } | null {
  const candidates: number[] = [];
  for (const v of views) {
    if (v.scope !== "shared") continue;
    if (!v.schedule || !v.schedule.enabled) continue;
    for (const w of v.schedule.windows) {
      if (!w.days.length) continue;
      for (let i = 0; i < 9; i++) {
        const dayDate = new Date(now);
        dayDate.setHours(0, 0, 0, 0);
        dayDate.setDate(dayDate.getDate() + i);
        if (!w.days.includes(dayDate.getDay())) continue;
        const start = new Date(dayDate);
        start.setMinutes(w.startMinute);
        const end = new Date(dayDate);
        end.setMinutes(w.endMinute);
        if (w.endMinute <= w.startMinute) {
          end.setDate(end.getDate() + 1);
        }
        if (start.getTime() > now.getTime()) candidates.push(start.getTime());
        if (end.getTime() > now.getTime()) candidates.push(end.getTime());
      }
    }
  }
  candidates.sort((a, b) => a - b);
  for (const ts of candidates) {
    // Probe one second past the transition so boundary semantics
    // (start inclusive, end exclusive) line up with scheduleMatchesNow.
    const probe = new Date(ts + 1000);
    const active =
      views.find(
        (v) =>
          v.scope === "shared" &&
          v.schedule &&
          v.schedule.enabled &&
          scheduleMatchesNow(v.schedule, probe),
      ) ?? null;
    const nextId = active?.id ?? null;
    if (nextId !== currentActiveId) {
      return { at: new Date(ts), view: active };
    }
  }
  return null;
}

// T271 — Coverage diagnostics across multiple scheduled shared views.
// Expand a window into one or more per-day ranges within [0, 1440). A
// non-wrapping window stays on its `day`; a wrapping window (end <= start)
// splits into a tail on `day` and a head on the next day.
export function expandWindowToRanges(w: {
  days: number[];
  startMinute: number;
  endMinute: number;
}): Array<{ day: number; start: number; end: number }> {
  const out: Array<{ day: number; start: number; end: number }> = [];
  for (const day of w.days) {
    if (w.endMinute > w.startMinute) {
      out.push({ day, start: w.startMinute, end: w.endMinute });
    } else {
      // Wrapping window (end <= start, including end === start). Mirrors
      // `scheduleMatchesNow`: covers [start, 1440) on `day` AND [0, end) on
      // the next day. When start === end === 0 this collapses to a single
      // full-day range on `day`.
      out.push({ day, start: w.startMinute, end: 1440 });
      if (w.endMinute > 0) {
        out.push({ day: (day + 1) % 7, start: 0, end: w.endMinute });
      }
    }
  }
  return out;
}

export type ScheduleDiagnosticConflict = {
  day: number;
  start: number;
  end: number;
  viewIds: string[];
  viewNames: string[];
};
export type ScheduleDiagnosticGap = { day: number; start: number; end: number };
export type ScheduleDiagnostics = {
  conflicts: ScheduleDiagnosticConflict[];
  gaps: ScheduleDiagnosticGap[];
  hasAnyEnabled: boolean;
};

// Compute overlap/gap diagnostics across the given enabled scheduled views.
// `sources` should only contain views whose schedule is enabled and has
// windows; other views are ignored. Gaps are only meaningful when at least
// one schedule is enabled — otherwise the entire week looks "uncovered"
// which is the same as having no scheduled rotation at all.
export function computeScheduleDiagnostics(
  sources: Array<{ id: string; name: string; schedule: SavedViewScheduleShape }>,
): ScheduleDiagnostics {
  const enabled = sources.filter(
    (s) => s.schedule.enabled && s.schedule.windows.length > 0,
  );
  const empty: ScheduleDiagnostics = {
    conflicts: [],
    gaps: [],
    hasAnyEnabled: enabled.length > 0,
  };
  if (!enabled.length) return empty;
  const TOTAL = 7 * 1440;
  const coverage: string[][] = Array.from({ length: TOTAL }, () => []);
  for (const s of enabled) {
    for (const w of s.schedule.windows) {
      if (!w.days.length) continue;
      for (const r of expandWindowToRanges(w)) {
        const base = r.day * 1440;
        for (let m = r.start; m < r.end; m++) {
          const cell = coverage[base + m];
          if (!cell.includes(s.id)) cell.push(s.id);
        }
      }
    }
  }
  const idToName = new Map(enabled.map((s) => [s.id, s.name]));
  const conflicts: ScheduleDiagnosticConflict[] = [];
  const gaps: ScheduleDiagnosticGap[] = [];
  for (let day = 0; day < 7; day++) {
    const base = day * 1440;
    let runStart = 0;
    let runSig = coverage[base].slice().sort().join("|");
    for (let m = 1; m <= 1440; m++) {
      const sig =
        m < 1440 ? coverage[base + m].slice().sort().join("|") : "__END__";
      if (sig === runSig) continue;
      const ids = runSig ? runSig.split("|") : [];
      if (ids.length >= 2) {
        conflicts.push({
          day,
          start: runStart,
          end: m,
          viewIds: ids,
          viewNames: ids.map((id) => idToName.get(id) ?? id),
        });
      } else if (ids.length === 0) {
        gaps.push({ day, start: runStart, end: m });
      }
      runStart = m;
      runSig = sig;
    }
  }
  return { conflicts, gaps, hasAnyEnabled: true };
}

// T279 — Weekly coverage heatmap. Returns a 7×24 grid where each cell
// represents one hour of one weekday and is classified as:
//   - "gap"      → some minute in that hour has no enabled scheduled view
//   - "conflict" → some minute in that hour has 2+ overlapping views
//   - "ok"       → every minute is covered by exactly one view
// Note: an hour can be both gappy and conflicty; we promote to "conflict"
// because that's the louder signal (a real overlap was scheduled). The
// cell also lists every view that covers any portion of the hour so the
// tooltip can name the participants.
export type CoverageCellStatus = "ok" | "gap" | "conflict";
export type CoverageCell = {
  day: number;
  hour: number;
  status: CoverageCellStatus;
  viewIds: string[];
  viewNames: string[];
};
export function computeWeeklyCoverageGrid(
  sources: Array<{ id: string; name: string; schedule: SavedViewScheduleShape }>,
): CoverageCell[] {
  const enabled = sources.filter(
    (s) => s.schedule.enabled && s.schedule.windows.length > 0,
  );
  const idToName = new Map(enabled.map((s) => [s.id, s.name]));
  const TOTAL = 7 * 1440;
  const coverage: string[][] = Array.from({ length: TOTAL }, () => []);
  for (const s of enabled) {
    for (const w of s.schedule.windows) {
      if (!w.days.length) continue;
      for (const r of expandWindowToRanges(w)) {
        const base = r.day * 1440;
        for (let m = r.start; m < r.end; m++) {
          const cell = coverage[base + m];
          if (!cell.includes(s.id)) cell.push(s.id);
        }
      }
    }
  }
  const out: CoverageCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const startIdx = day * 1440 + hour * 60;
      const ids = new Set<string>();
      let hasGap = false;
      let hasConflict = false;
      for (let m = 0; m < 60; m++) {
        const cellIds = coverage[startIdx + m];
        if (cellIds.length === 0) hasGap = true;
        if (cellIds.length >= 2) hasConflict = true;
        for (const id of cellIds) ids.add(id);
      }
      const status: CoverageCellStatus = hasConflict
        ? "conflict"
        : hasGap
          ? "gap"
          : "ok";
      const viewIds = Array.from(ids);
      out.push({
        day,
        hour,
        status,
        viewIds,
        viewNames: viewIds.map((id) => idToName.get(id) ?? id),
      });
    }
  }
  return out;
}

// T284 — Heuristic "suggest fix" helper. Given the current scheduled shared
// views, propose a minimal set of window edits (extend an adjacent single-day
// window where possible, otherwise add a single-day window to the least-busy
// view) that eliminates the gaps reported by computeScheduleDiagnostics.
// Because every proposed edit only writes into hours that were previously gaps
// (i.e. not covered by any view), the suggestions cannot introduce new
// overlaps with other views.
export type CoverageSuggestionChange =
  | {
      kind: "extend-end";
      windowIndex: number;
      day: number;
      from: number;
      to: number;
    }
  | {
      kind: "extend-start";
      windowIndex: number;
      day: number;
      from: number;
      to: number;
    }
  | {
      kind: "add-window";
      day: number;
      startMinute: number;
      endMinute: number;
    };

export type CoverageSuggestion = {
  viewId: string;
  viewName: string;
  before: SavedViewScheduleShape;
  after: SavedViewScheduleShape;
  changes: CoverageSuggestionChange[];
};

export type CoverageSuggestionResult = {
  suggestions: CoverageSuggestion[];
  initialGaps: ScheduleDiagnosticGap[];
  unresolvedGaps: ScheduleDiagnosticGap[];
};

function cloneSchedule(s: SavedViewScheduleShape): SavedViewScheduleShape {
  return {
    enabled: s.enabled,
    timezone: s.timezone,
    windows: s.windows.map((w) => ({
      days: [...w.days],
      startMinute: w.startMinute,
      endMinute: w.endMinute,
    })),
  };
}

function totalScheduledMinutes(s: SavedViewScheduleShape): number {
  let total = 0;
  for (const w of s.windows) {
    if (!w.days.length) continue;
    const dur =
      w.endMinute > w.startMinute
        ? w.endMinute - w.startMinute
        : 1440 - w.startMinute + w.endMinute;
    total += dur * w.days.length;
  }
  return total;
}

export function suggestCoverageFix(
  sources: Array<{ id: string; name: string; schedule: SavedViewScheduleShape }>,
): CoverageSuggestionResult {
  const enabled = sources.filter(
    (s) => s.schedule.enabled && s.schedule.windows.length > 0,
  );
  const initial = computeScheduleDiagnostics(enabled);
  if (!enabled.length || initial.gaps.length === 0) {
    return {
      suggestions: [],
      initialGaps: initial.gaps,
      unresolvedGaps: initial.gaps,
    };
  }

  const working = new Map<string, SavedViewScheduleShape>();
  const names = new Map<string, string>();
  const originals = new Map<string, SavedViewScheduleShape>();
  for (const s of enabled) {
    working.set(s.id, cloneSchedule(s.schedule));
    originals.set(s.id, cloneSchedule(s.schedule));
    names.set(s.id, s.name);
  }
  const changesByView = new Map<string, CoverageSuggestionChange[]>();
  const recordChange = (id: string, c: CoverageSuggestionChange) => {
    const arr = changesByView.get(id) ?? [];
    arr.push(c);
    changesByView.set(id, arr);
  };

  // Iterate gaps in stable order (day asc, then start asc — already produced
  // that way by computeScheduleDiagnostics). For each gap, try to extend an
  // adjacent single-day window in any view; otherwise add a new single-day
  // window to whichever view currently has the smallest total scheduled time
  // (rough load balancing so a single view doesn't accumulate every fallback).
  for (const gap of initial.gaps) {
    let handled = false;

    for (const [id, sched] of working) {
      for (let i = 0; i < sched.windows.length; i++) {
        const w = sched.windows[i];
        if (
          w.days.length === 1 &&
          w.days[0] === gap.day &&
          w.endMinute === gap.start &&
          w.endMinute > w.startMinute
        ) {
          const from = w.endMinute;
          w.endMinute = gap.end;
          recordChange(id, {
            kind: "extend-end",
            windowIndex: i,
            day: gap.day,
            from,
            to: gap.end,
          });
          handled = true;
          break;
        }
      }
      if (handled) break;
    }
    if (handled) continue;

    for (const [id, sched] of working) {
      for (let i = 0; i < sched.windows.length; i++) {
        const w = sched.windows[i];
        if (
          w.days.length === 1 &&
          w.days[0] === gap.day &&
          w.startMinute === gap.end &&
          w.endMinute > w.startMinute
        ) {
          const from = w.startMinute;
          w.startMinute = gap.start;
          recordChange(id, {
            kind: "extend-start",
            windowIndex: i,
            day: gap.day,
            from,
            to: gap.start,
          });
          handled = true;
          break;
        }
      }
      if (handled) break;
    }
    if (handled) continue;

    let bestId: string | null = null;
    let bestMinutes = Infinity;
    for (const [id, sched] of working) {
      const m = totalScheduledMinutes(sched);
      if (m < bestMinutes) {
        bestMinutes = m;
        bestId = id;
      }
    }
    if (!bestId) continue;
    const sched = working.get(bestId)!;
    sched.windows.push({
      days: [gap.day],
      startMinute: gap.start,
      endMinute: gap.end,
    });
    recordChange(bestId, {
      kind: "add-window",
      day: gap.day,
      startMinute: gap.start,
      endMinute: gap.end,
    });
  }

  const suggestions: CoverageSuggestion[] = [];
  for (const [id, changes] of changesByView) {
    if (!changes.length) continue;
    suggestions.push({
      viewId: id,
      viewName: names.get(id) ?? id,
      before: originals.get(id)!,
      after: working.get(id)!,
      changes,
    });
  }

  const after = computeScheduleDiagnostics(
    enabled.map((s) => ({
      id: s.id,
      name: s.name,
      schedule: working.get(s.id) ?? s.schedule,
    })),
  );
  return {
    suggestions,
    initialGaps: initial.gaps,
    unresolvedGaps: after.gaps,
  };
}

// T296 — Convert a list of coverage gaps into a SavedViewScheduleShape whose
// windows cover exactly the gap minutes. Each gap becomes its own single-day
// window. Used by the "Create new shared view to cover remaining gaps" mode
// in the Suggest fix dialog: the new view's schedule mirrors the leftover
// uncovered minutes that other extensions could not absorb (or, when used as
// the sole remediation, the entire initial gap set).
export function buildScheduleFromGaps(
  gaps: Array<{ day: number; start: number; end: number }>,
): SavedViewScheduleShape {
  return {
    enabled: true,
    timezone: "local",
    windows: gaps
      .filter((g) => g.end > g.start)
      .map((g) => ({
        days: [g.day],
        startMinute: g.start,
        endMinute: g.end,
      })),
  };
}

// T306 — Pick which gap set a "new fallback view" should cover. When the
// admin has the `new-fallback` mode active AND has also selected at least
// one extension suggestion (and there are suggestions to select), the new
// view only needs to fill the leftovers the extensions can't absorb.
// Otherwise the new view has to cover every initially-detected gap.
// Kept as a pure helper so the dialog and the apply handler agree on what
// the new view will install, and so the rule can be unit-tested without
// rendering the dialog.
export function selectFallbackGaps(
  mode: "extend-existing" | "new-fallback",
  acceptedExtensionCount: number,
  totalSuggestionsCount: number,
  initialGaps: ScheduleDiagnosticGap[],
  unresolvedGaps: ScheduleDiagnosticGap[],
): ScheduleDiagnosticGap[] {
  if (
    mode === "new-fallback" &&
    acceptedExtensionCount > 0 &&
    totalSuggestionsCount > 0
  ) {
    return unresolvedGaps;
  }
  return initialGaps;
}

// T306 — Orchestrate the "Create new fallback view" apply sequence. We
// (optionally) patch any accepted extension suggestions first so the new
// view truly covers only leftover gaps, then POST a shared view, then
// PATCH its schedule. The HTTP layer is injected so this can be exercised
// from a Node test without spinning up React Query / fetch.
export type FallbackApplyDeps = {
  postSavedView: (body: {
    name: string;
    scope: "shared";
    dryRun: string;
    status: string;
    packageId: string;
  }) => Promise<{ id: string }>;
  patchSchedule: (id: string, schedule: SavedViewScheduleShape) => Promise<void>;
};

export type FallbackApplyInput = {
  name: string;
  schedule: SavedViewScheduleShape;
  selectedExtensions: Array<{ viewId: string; after: SavedViewScheduleShape }>;
  filters: { dryRun: string; status: string; packageId: string };
  useCurrentFilters: boolean;
};

export async function applyNewFallbackViewFlow(
  input: FallbackApplyInput,
  deps: FallbackApplyDeps,
): Promise<{ newViewId: string } | null> {
  const name = input.name.trim();
  if (!name) return null;
  if (input.schedule.windows.length === 0) return null;
  for (const ext of input.selectedExtensions) {
    await deps.patchSchedule(ext.viewId, ext.after);
  }
  const created = await deps.postSavedView({
    name,
    scope: "shared",
    dryRun: input.useCurrentFilters ? input.filters.dryRun : "all",
    status: input.useCurrentFilters ? input.filters.status : "all",
    packageId: input.useCurrentFilters ? input.filters.packageId.trim() : "",
  });
  await deps.patchSchedule(created.id, input.schedule);
  return { newViewId: created.id };
}

// Compute the next future Date matching the given weekday + hour (local
// time, minute 0). Used when clicking a heatmap cell to pre-fill the
// Preview-at picker — the picker rejects past timestamps, so we always
// roll forward into the next occurrence.
export function nextOccurrenceOfHour(day: number, hour: number, now: Date): Date {
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setMilliseconds(0);
  const dayDelta = (day - target.getDay() + 7) % 7;
  target.setDate(target.getDate() + dayDelta);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 7);
  }
  return target;
}

// T295/T304 — Pure helpers that back the inline "Suggest fix" editor in
// BroadcastPreview. Extracted from the component so the edit + overlap
// guard can be exercised directly by unit tests (see
// tests/broadcast-schedule-suggest-fix-edit.test.ts).
export type SuggestionEditOverride = {
  start?: number;
  end?: number;
  day?: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.min(1440, Math.round(min)));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

// Bounds the gap-span minutes that an admin edit is allowed to move within
// for a given heuristic-proposed change. Edits clamped to these bounds can
// never push the fix into minutes outside the originally-targeted gap.
// T313 — Accepts an optional override (incl. a day override) for signature
// symmetry with buildEditedSuggestionChange. The start/end bounds are
// derived from the heuristic's original gap span and do not change when the
// admin picks a different day; the day-overlap check is handled separately
// by validateEditedSuggestions against the chosen day's existing coverage.
export function getSuggestionChangeBounds(
  c: CoverageSuggestionChange,
  _override?: SuggestionEditOverride,
): {
  startMin?: number;
  startMax?: number;
  endMin?: number;
  endMax?: number;
} {
  if (c.kind === "extend-end") {
    return { endMin: c.from, endMax: c.to };
  }
  if (c.kind === "extend-start") {
    return { startMin: c.to, startMax: c.from };
  }
  return {
    startMin: c.startMinute,
    startMax: c.endMinute - 1,
    endMin: c.startMinute + 1,
    endMax: c.endMinute,
  };
}

// Apply an admin override (start/end minute overrides) to a heuristic change.
// Returns the change unchanged when override is undefined or empty, so the
// reset path (clearing the override) restores the heuristic-suggested time.
export function buildEditedSuggestionChange(
  c: CoverageSuggestionChange,
  override?: SuggestionEditOverride,
): CoverageSuggestionChange {
  if (!override) return c;
  if (c.kind === "extend-end") {
    return {
      ...c,
      to: override.end ?? c.to,
      day: override.day ?? c.day,
    };
  }
  if (c.kind === "extend-start") {
    return {
      ...c,
      to: override.start ?? c.to,
      day: override.day ?? c.day,
    };
  }
  return {
    ...c,
    day: override.day ?? c.day,
    startMinute: override.start ?? c.startMinute,
    endMinute: override.end ?? c.endMinute,
  };
}

// Apply a list of coverage-fix changes (possibly admin-edited) to a starting
// schedule. extend-end / extend-start mutate the addressed window in place;
// add-window appends a new single-day window.
export function applyCoverageChangesToSchedule(
  before: SavedViewScheduleShape,
  changes: CoverageSuggestionChange[],
): SavedViewScheduleShape {
  const out: SavedViewScheduleShape = {
    enabled: before.enabled,
    timezone: before.timezone,
    windows: before.windows.map((w) => ({
      days: [...w.days],
      startMinute: w.startMinute,
      endMinute: w.endMinute,
    })),
  };
  for (const c of changes) {
    if (c.kind === "extend-end") {
      if (out.windows[c.windowIndex]) {
        out.windows[c.windowIndex] = {
          ...out.windows[c.windowIndex],
          days: [c.day],
          endMinute: c.to,
        };
      }
    } else if (c.kind === "extend-start") {
      if (out.windows[c.windowIndex]) {
        out.windows[c.windowIndex] = {
          ...out.windows[c.windowIndex],
          days: [c.day],
          startMinute: c.to,
        };
      }
    } else {
      out.windows.push({
        days: [c.day],
        startMinute: c.startMinute,
        endMinute: c.endMinute,
      });
    }
  }
  return out;
}

export type EditedSuggestion = {
  changes: CoverageSuggestionChange[];
  after: SavedViewScheduleShape;
};

// Build the edited (changes, after) tuple per-suggestion given the admin
// overrides keyed by view-id then change-index.
export function buildEditedSuggestionMap(
  suggestions: CoverageSuggestion[],
  edits: Record<string, Record<number, SuggestionEditOverride>>,
): Map<string, EditedSuggestion> {
  const map = new Map<string, EditedSuggestion>();
  for (const s of suggestions) {
    const editsForView = edits[s.viewId] ?? {};
    const editedChanges = s.changes.map((c, i) =>
      buildEditedSuggestionChange(c, editsForView[i]),
    );
    const after = applyCoverageChangesToSchedule(s.before, editedChanges);
    map.set(s.viewId, { changes: editedChanges, after });
  }
  return map;
}

export type SuggestionValidationInput = {
  suggestions: CoverageSuggestion[];
  editedMap: Map<string, EditedSuggestion>;
  acceptedSuggestionIds: Set<string>;
  sharedViews: Array<{
    id: string;
    name: string;
    schedule: SavedViewScheduleShape | null;
  }>;
};

// Validate per-suggestion admin edits. Returns a map of viewId -> error
// string for any suggestion whose edited schedule is out of bounds or
// (for accepted suggestions) introduces an overlap with another shared
// view's schedule (substituting in other accepted suggestions' edits).
export function validateEditedSuggestions(
  input: SuggestionValidationInput,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const s of input.suggestions) {
    const edited = input.editedMap.get(s.viewId);
    if (!edited) continue;
    for (let i = 0; i < edited.changes.length; i++) {
      const c = edited.changes[i];
      const orig = s.changes[i];
      const bounds = getSuggestionChangeBounds(orig);
      if (c.kind === "add-window") {
        if (c.startMinute >= c.endMinute) {
          errors[s.viewId] = "Start must be before end";
          break;
        }
        if (
          (bounds.startMin !== undefined && c.startMinute < bounds.startMin) ||
          (bounds.startMax !== undefined && c.startMinute > bounds.startMax) ||
          (bounds.endMin !== undefined && c.endMinute < bounds.endMin) ||
          (bounds.endMax !== undefined && c.endMinute > bounds.endMax)
        ) {
          errors[s.viewId] = `Edit must stay within ${fmtMinutes(bounds.startMin ?? 0)}–${fmtMinutes(bounds.endMax ?? 0)}`;
          break;
        }
      } else if (c.kind === "extend-end") {
        if (
          (bounds.endMin !== undefined && c.to < bounds.endMin) ||
          (bounds.endMax !== undefined && c.to > bounds.endMax)
        ) {
          errors[s.viewId] = `End must stay within ${fmtMinutes(bounds.endMin!)}–${fmtMinutes(bounds.endMax!)}`;
          break;
        }
        const w = edited.after.windows[c.windowIndex];
        if (!w || w.startMinute >= w.endMinute) {
          errors[s.viewId] = "End must be after the window's start";
          break;
        }
      } else {
        if (
          (bounds.startMin !== undefined && c.to < bounds.startMin) ||
          (bounds.startMax !== undefined && c.to > bounds.startMax)
        ) {
          errors[s.viewId] = `Start must stay within ${fmtMinutes(bounds.startMin!)}–${fmtMinutes(bounds.startMax!)}`;
          break;
        }
        const w = edited.after.windows[c.windowIndex];
        if (!w || w.startMinute >= w.endMinute) {
          errors[s.viewId] = "Start must be before the window's end";
          break;
        }
      }
    }
    if (errors[s.viewId]) continue;
    if (!input.acceptedSuggestionIds.has(s.viewId)) continue;
    const sources = input.sharedViews
      .filter(
        (v) =>
          v.schedule && v.schedule.enabled && v.schedule.windows.length > 0,
      )
      .map((v) => {
        if (v.id === s.viewId) {
          return { id: v.id, name: v.name, schedule: edited.after };
        }
        const otherSugg = input.suggestions.find((x) => x.viewId === v.id);
        if (otherSugg && input.acceptedSuggestionIds.has(v.id)) {
          const otherEdited = input.editedMap.get(v.id);
          if (otherEdited) {
            return { id: v.id, name: v.name, schedule: otherEdited.after };
          }
        }
        return { id: v.id, name: v.name, schedule: v.schedule! };
      });
    const diag = computeScheduleDiagnostics(sources);
    const conflict = diag.conflicts.find((c) => c.viewIds.includes(s.viewId));
    if (conflict) {
      const others = conflict.viewNames.filter(
        (n, i) => conflict.viewIds[i] !== s.viewId,
      );
      errors[s.viewId] = `Edits would overlap with ${others.join(", ") || "another view"}`;
    }
  }
  return errors;
}

// T315 — After accepted edits are applied (and possibly retargeted to a
// different day via the day override), some originally-targeted gaps may no
// longer be covered. The overlap guard above only flags collisions with
// *other* views; it cannot notice that the suggestion's own original gap
// minutes are still wide open. This helper recomputes effective coverage
// across all enabled shared views (substituting in the edited schedule for
// each accepted suggestion) and, for each accepted suggestion, reports any
// day whose heuristic-targeted gap still has uncovered minutes.
export type SuggestionCoverageWarning = {
  viewId: string;
  uncoveredDays: number[];
};

function originalGapForChange(
  c: CoverageSuggestionChange,
): { day: number; start: number; end: number } | null {
  if (c.kind === "extend-end") {
    return { day: c.day, start: c.from, end: c.to };
  }
  if (c.kind === "extend-start") {
    return { day: c.day, start: c.to, end: c.from };
  }
  return { day: c.day, start: c.startMinute, end: c.endMinute };
}

// T318 — Build sibling add-window changes that cover the originally-targeted
// gap on each day listed in `uncoveredDays`. Used by the "Cover original day
// too" quick action on the warning row so an admin who retargeted a fix to a
// different day can plug the original day's gap in one click without leaving
// the dialog. Deduped by (day,start,end) so clicking twice (or when multiple
// heuristic changes shared the same gap) cannot append the same window twice.
export function buildOriginalDayCoverageChanges(
  changes: CoverageSuggestionChange[],
  uncoveredDays: number[],
): CoverageSuggestionChange[] {
  const days = new Set(uncoveredDays);
  const out: CoverageSuggestionChange[] = [];
  const seen = new Set<string>();
  for (const c of changes) {
    const gap = originalGapForChange(c);
    if (!gap || gap.end <= gap.start) continue;
    if (!days.has(gap.day)) continue;
    const key = `${gap.day}|${gap.start}|${gap.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "add-window",
      day: gap.day,
      startMinute: gap.start,
      endMinute: gap.end,
    });
  }
  return out;
}

export function computeUncoveredOriginalGapWarnings(
  input: SuggestionValidationInput,
): SuggestionCoverageWarning[] {
  const warnings: SuggestionCoverageWarning[] = [];
  if (input.acceptedSuggestionIds.size === 0) return warnings;
  const effective = input.sharedViews
    .filter(
      (v) => v.schedule && v.schedule.enabled && v.schedule.windows.length > 0,
    )
    .map((v) => {
      if (input.acceptedSuggestionIds.has(v.id)) {
        const edited = input.editedMap.get(v.id);
        if (edited) {
          return { id: v.id, schedule: edited.after };
        }
      }
      return { id: v.id, schedule: v.schedule! };
    });
  const TOTAL = 7 * 1440;
  const covered = new Uint8Array(TOTAL);
  for (const s of effective) {
    for (const w of s.schedule.windows) {
      if (!w.days.length) continue;
      for (const r of expandWindowToRanges(w)) {
        const base = r.day * 1440;
        for (let m = r.start; m < r.end; m++) covered[base + m] = 1;
      }
    }
  }
  for (const s of input.suggestions) {
    if (!input.acceptedSuggestionIds.has(s.viewId)) continue;
    const uncovered = new Set<number>();
    for (const orig of s.changes) {
      const gap = originalGapForChange(orig);
      if (!gap || gap.end <= gap.start) continue;
      const base = gap.day * 1440;
      for (let m = gap.start; m < gap.end; m++) {
        if (!covered[base + m]) {
          uncovered.add(gap.day);
          break;
        }
      }
    }
    if (uncovered.size > 0) {
      warnings.push({
        viewId: s.viewId,
        uncoveredDays: Array.from(uncovered).sort((a, b) => a - b),
      });
    }
  }
  return warnings;
}
