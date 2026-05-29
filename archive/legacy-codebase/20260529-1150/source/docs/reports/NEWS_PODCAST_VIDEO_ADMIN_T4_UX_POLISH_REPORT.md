# T4 — Additive Admin Dashboard UX / Link-Label Polish Report

**Date:** 2026-05-22  
**Series:** News Room / Podcast Room / Video / Production House admin consolidation  
**Sequence:** Follows T1 (audit) → T2 (link surfacing) → T3 (wiring check) → T4 (this UX polish)  
**Scope:** Documentation-text-only label/tooltip/description polish in a single file. No route, schema, backend, safe-mode, render, publish, live, Unreal, or 4D-hardware change.

---

## A. Source inputs

- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md` (T1)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md` (T2)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md` (T3 — accepted by user; 5 UX-polish recommendations approved)
- `docs/reports/MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md` (T4-docs; flowchart blueprint)

T4 implements **only the additive UX-polish subset** of those recommendations.

---

## B. Files changed

**One file**, label/tooltip/description text only:

| File | Δ | Notes |
|---|---|---|
| `client/src/pages/admin/AdminDashboard.tsx` | +8 / −8 lines (8 modified card definitions) | Pure text changes on `label`, `description`, `tooltip` fields. Zero changes to `href`, `status`, `icon`, zone IDs, route registrations, hooks, queries, or any logic. |

`git diff --stat` confirms exactly:

```
 client/src/pages/admin/AdminDashboard.tsx | 16 ++++++++--------
 1 file changed, 8 insertions(+), 8 deletions(-)
```

No other source, test, schema, route, service, or config file modified.

---

## C. Polish #1 — Standardize `/admin/shorts` cross-link tooltip wording

**Goal:** make the 4 cross-link shorts cards across News Room, Podcast Room, Debate Studio, and Distribution read with identical, predictable wording.

**Primary home (Media & Content Pipeline, line 212) — UNCHANGED** by T4:
> tooltip: "Draft shorts wait here until a root admin approves them. Count badge shows pending drafts."

**4 cross-links — now identical:**

> tooltip: `"Cross-link — primary home is Media & Content Pipeline. Same manual approval queue; root admin must approve each draft before publishing."`

| Zone | Card label | Line | Before tooltip → After tooltip |
|---|---|---|---|
| News Room | News Shorts Cutter (Approval Queue) | 250 | "Cross-link — primary home is Media & Content Pipeline. Also surfaced from Podcast Room, Debate Studio, and Distribution." → standardized |
| Podcast Room | Podcast Shorts (Approval Queue) | 264 | "Cross-link — primary home is Media & Content Pipeline. Same approval queue as News and Debate clips." → standardized |
| Debate Studio | Debate Shorts (Approval Queue) | 279 | "Cross-link — primary home is Media & Content Pipeline." → standardized |
| Distribution | Shorts Approval Queue | 324 | "Cross-link — primary home is Media & Content Pipeline. Same draft-shorts approval gate." → standardized |

`href`, `status: "manual"`, label text, icon, and approval-only wording **preserved** in every case. The "primary home is Media & Content Pipeline" cross-link semantic is preserved.

---

## D. Polish #2 — Viewer / Editor distinction for newsroom-package pair

The two routes have always been semantically distinct (`/admin/newsroom-package` = singular viewer; `/admin/newsroom-packages` = plural editor) but the labels were near-identical and easily confused.

**Before** (lines 239–240):
```
{ label: "Newsroom Package",         href: "/admin/newsroom-package",  description: "Verified newsroom data package viewer." }
{ label: "Newsroom Packages Editor", href: "/admin/newsroom-packages", description: "Editor for newsroom data packages." }
```

**After** (lines 242–243):
```
{ label: "Newsroom Package (Viewer)",   href: "/admin/newsroom-package",  description: "Read-only viewer for a verified newsroom data package.",
  tooltip: "Viewer surface (singular). Read-only inspection of one verified package. For editing, use Newsroom Packages (Editor)." }
{ label: "Newsroom Packages (Editor)",  href: "/admin/newsroom-packages", description: "Editor for newsroom data packages (list + draft edits).",
  tooltip: "Editor surface (plural). Lists packages and allows draft edits. For read-only inspection of a single package, use Newsroom Package (Viewer)." }
```

`href`, `status`, and `icon` for both **preserved unchanged**. Labels and descriptions are additive text only.

---

## E. Polish #3 — Debate → podcast/video export handoff

**Status: NEEDS_T5_OR_FUTURE_ROUTE.**

Investigation method:

```
rg -l 'debate-to-podcast|debate-to-video|debateExport|debateExportPipeline' \
   client/src/pages server/services server/routes
rg -n 'debate-to-' client/src/App.tsx
```

Result: **no existing dedicated route, page, service, or hook** for a debate → podcast or debate → video export pipeline. This matches T3 §K.3 finding.

What exists today, surfacing the debate ↔ media bridge implicitly:
- Debate Studio zone already has a `Video Render (debate video)` card → `/admin/video-render` (cross-link to Production House) and a `Debate Shorts (Approval Queue)` card → `/admin/shorts` (cross-link to Media & Content Pipeline)
- Podcast Room zone already has a `Debate Reference (News to Debate)` card → `/admin/news-to-debate` (uses debate/discussion topic packages as podcast reference material)

T4 rule explicitly forbids creating a new route or inventing backend behavior. **No discoverability card was added.** Documented as a future-scope item below.

---

## F. Polish #4 — Explicit alias wording on Cinema Control pair

Both routes `/admin/4d-cinema-control` and `/admin/cinema-control` resolve to the same `CinemaControl` component (confirmed at `client/src/App.tsx` lines 269–270 in T3). Both are **intentional compatibility entry points** and must both remain. Wording on both sides now makes that alias relationship explicit.

**Before** (lines 306–307):
```
{ label: "4D Cinema Control",        href: "/admin/4d-cinema-control",
  description: "Cinema 4D control surface. Dry-run / planning only; no live hardware execution." }
{ label: "Cinema Control (alias)",   href: "/admin/cinema-control",
  description: "Alias route to the same Cinema 4D control component.",
  tooltip: "Same component as /admin/4d-cinema-control; both routes resolve to CinemaControl." }
```

**After** (lines 309–310):
```
{ label: "4D Cinema Control (primary)", href: "/admin/4d-cinema-control",
  description: "Cinema 4D control surface (primary route). Dry-run / planning only; no live hardware execution.",
  tooltip: "Primary route. Intentional alias /admin/cinema-control resolves to the same CinemaControl component — both kept as compatibility entry points." }
{ label: "Cinema Control (alias)",      href: "/admin/cinema-control",
  description: "Compatibility alias route — same Cinema 4D control component as /admin/4d-cinema-control.",
  tooltip: "Compatibility alias. Same CinemaControl component as /admin/4d-cinema-control; both routes are intentional and kept side-by-side. Dry-run / planning only; no live hardware execution." }
```

- `href` for both: **unchanged** (`/admin/4d-cinema-control` and `/admin/cinema-control` both remain).
- `status: "dryRun"` for both: **unchanged**.
- Dry-run / no-live-hardware language **preserved on both sides** (was only on the primary before).

---

## G. Routes confirmed unchanged

Method: `git diff` is text-only inside link-object literals; not a single `href:`, route registration, or route string was modified. Verified by:

```
rg -o 'href: "(/admin/[^"]+)"' client/src/pages/admin/AdminDashboard.tsx -r '$1' | sort -u | wc -l
→ 60   (unchanged from pre-T4 unique-href count)

rg -c '"/admin/shorts"|"/admin/newsroom-package"|"/admin/newsroom-packages"|"/admin/4d-cinema-control"|"/admin/cinema-control"' \
       client/src/pages/admin/AdminDashboard.tsx
→ 12   (every key href still present, same number of occurrences as before)
```

All 33 unique `/admin/...` hrefs from T3 still resolve. `client/src/App.tsx` was **not touched**.

---

## H. Links preserved

- Every dashboard link from T2 → T3 is still rendered in its same zone, in the same order, with the same `href`, `status`, `icon`.
- No link was removed.
- No link was moved between zones.
- Cross-link annotations preserved everywhere they existed.

---

## I. Media & Content Pipeline compatibility preserved

The Media & Content Pipeline zone (`id: "media"`, line 201) is **untouched** by T4:
- All Media zone link entries unchanged (including primary `/admin/shorts` card at line 212 with its long-form tooltip).
- The Shorts/YouTube/Social Distribution/Marketing/SEO compatibility surface defined in T2 is fully preserved.
- The "Cross-link — primary home is Media & Content Pipeline." semantic anchor (used by 4 cross-links elsewhere) is reinforced, not weakened.

---

## J. Items deferred to T5 / future

Carried forward from T3's UX-polish list and from this task's scoping:

| # | Item | Why deferred |
|---|---|---|
| 1 | **Debate → podcast/video export handoff** route + discoverability card | No existing route exists. T4 forbids creating new routes or inventing backend behavior. Needs T5 (or later) to design schema, service, route, and approval gate before a discoverability card can be added. |
| 2 | **Strategy & Health zone grouping** | Explicitly out of scope per T4 brief. Requires zone refactor + multi-card relocation. Defer to T5 or later. |
| 3 | **Programmatic dedup of cross-link tooltips** | Currently the 4 standardized tooltips are duplicated string literals. A future task could factor the standardized cross-link text into a `SHORTS_CROSS_LINK_TOOLTIP` constant. Deferred because T4 rules forbid refactor / structural change. |
| 4 | **`replit.md` size reduction** | Out of scope per T4 brief ("Do not touch replit.md in this task"). |
| 5 | **`client/public/opengraph.jpg` working-tree restore** | Out of scope per T4 brief ("Do not touch client/public/opengraph.jpg in this task"). |
| 6 | **Aggregated cross-link map page (e.g. `/admin/cross-link-map`)** | Optional future enhancement; not required by T4. |

---

## K. Safety behavior — unchanged proof

### K.1 No safe-mode flag changed
`server/services/safe-mode-service.ts` not modified. All 4 flags untouched:
- `pauseYouTubeUploads`
- `pauseSocialDistributionAutomation`
- `pausePodcastAudioGeneration`
- `pauseAutonomousPublishing`

### K.2 No publishing / rendering / live / Unreal / 4D-hardware enable
T4 only edited label/description/tooltip text inside link-object literals in a single dashboard file. No service, no route handler, no worker, no scheduler, no env var, no feature flag, no Unreal binding, no 4D hardware interface modified.

### K.3 No backend route, schema, migration, or service touched
- No file under `server/` modified.
- No file under `shared/` modified.
- No file under `scripts/migrate-*` modified.
- No `db:push`, no SQL, no Supabase write.

### K.4 No App.tsx route registration changed
`client/src/App.tsx` not modified. All routes from T3 (including `/admin/4d-cinema-control` and `/admin/cinema-control` aliasing the same `CinemaControl`) still register identically.

### K.5 Dry-run / approval-only wording preserved
Every card that previously declared `status: "dryRun"` or `status: "manual"` keeps that status. "manual approval", "approval queue", "dry-run", "planning only", "no live hardware execution", "no autonomous", and "no live provider calls" wording is **preserved or strengthened** — never removed or weakened.

---

## L. Tests / checks run

| Check | Method | Result |
|---|---|---|
| Unique-href preservation | `rg -o 'href: "(/admin/[^"]+)"' AdminDashboard.tsx \| sort -u \| wc -l` | 60 (unchanged vs pre-T4) |
| Key-href preservation | `rg -c` on `/admin/shorts`, `/admin/newsroom-package(s)`, `/admin/4d-cinema-control`, `/admin/cinema-control` | 12 occurrences, all preserved |
| TypeScript check (AdminDashboard scope) | `npx tsc --noEmit -p tsconfig.json` | AdminDashboard.tsx: **0 new errors**. All TS errors reported (BroadcastPreview.tsx, ProductionHouse.tsx, remotion/*) are **pre-existing**, not introduced by T4, and not in scope per strict rules (no TS-error fixes). |
| File-scope check | `git diff --stat` | Only `client/src/pages/admin/AdminDashboard.tsx` modified; +8 / −8. |
| Debate→podcast handoff route grep | `rg -l 'debate-to-podcast\|debate-to-video\|debateExport\|debateExportPipeline'` against `client/src/pages`, `server/services`, `server/routes`; plus `rg -n 'debate-to-' client/src/App.tsx` | **No match.** No existing route. Documented as `NEEDS_T5_OR_FUTURE_ROUTE` per §E. |
| Workflow health | `Start application` workflow status | Running throughout (per system reminder). |
| Smoke render | (Not invoked — strict scope is text-only labels; running e2e is unnecessary risk and skips per "no behavior changed".) | n/a |

---

## M. Confirmation — no backend / schema / route behavior changed

- **No backend file modified.** Entire diff lives in one client file inside link-card text fields.
- **No schema file modified.** `shared/` untouched.
- **No migration script modified.** `scripts/migrate-*` untouched.
- **No DB write of any kind.** No db:push, no SQL, no Supabase API call.
- **No App.tsx route registration changed.** Every route from T3 still resolves identically.
- **No safe-mode flag changed.** All 4 flags identical.
- **No render / publish / live / Unreal / 4D-hardware enable.** Dry-run posture intact and re-emphasized on both Cinema Control entries.
- **No file deleted, moved, or renamed.**
- **No dashboard link removed.** All 60 unique hrefs and 12 occurrences of the key hrefs preserved.
- **Media & Content Pipeline compatibility section preserved.**

T4 is a pure additive UX-text polish.

---

## N. Diff anatomy (line-by-line attribution)

| Hunk | Lines (after) | Change | Permitted under T4 rules? |
|---|---|---|---|
| Newsroom Package label/desc/tooltip | 242 | "Newsroom Package" → "Newsroom Package (Viewer)" + new tooltip | Yes — label/tooltip text only |
| Newsroom Packages label/desc/tooltip | 243 | "Newsroom Packages Editor" → "Newsroom Packages (Editor)" + new tooltip | Yes — label/tooltip text only |
| News Shorts cross-link tooltip | 250 | tooltip standardized | Yes — tooltip text only |
| Podcast Shorts cross-link tooltip | 264 | tooltip standardized | Yes — tooltip text only |
| Debate Shorts cross-link tooltip | 279 | tooltip standardized | Yes — tooltip text only |
| 4D Cinema Control label/desc/tooltip | 309 | "4D Cinema Control" → "4D Cinema Control (primary)" + tooltip added | Yes — label/tooltip text only |
| Cinema Control (alias) desc/tooltip | 310 | description expanded + tooltip expanded; label unchanged | Yes — description/tooltip text only |
| Distribution Shorts cross-link tooltip | 324 | tooltip standardized | Yes — tooltip text only |

Pre-existing transient working-tree artifacts (workspace-auto-saved attached_assets/Pasted-* files, the unrelated 10-byte `client/public/opengraph.jpg` carry-over noted in T3 §N) are **not part of T4** and were not modified by this task.

---

## O. Summary

T4 polish is fully applied, scoped strictly to label/description/tooltip text inside `client/src/pages/admin/AdminDashboard.tsx`:

1. ✅ `/admin/shorts` cross-link tooltip standardized across News Room, Podcast Room, Debate Studio, Distribution (4 cards now read identically; primary card in Media kept its long-form tooltip)
2. ✅ Viewer / Editor labels added to `/admin/newsroom-package` and `/admin/newsroom-packages` (plus mutual cross-reference tooltips)
3. ⏸ Debate → podcast/video export discoverability card: **deferred** to T5+ as `NEEDS_T5_OR_FUTURE_ROUTE` — no route exists, T4 forbids creating one
4. ✅ Both Cinema Control entries now carry explicit alias-relationship wording (primary ↔ alias) and both retain dry-run / no-live-hardware language
5. ⏸ Strategy & Health zone grouping: **deferred** per T4 brief

All hard rules honored: no file deleted/moved/renamed, no link removed, no route/backend/schema/safe-mode/render/publish/live/Unreal/4D-hardware change, `replit.md` and `client/public/opengraph.jpg` not touched.
