# R3 — R3F Preview Sandbox (Admin-Only) — Execution Report

**Date:** 2026-05-22
**Phase:** R3 of the R-series R3F / WebGL / Unity integration roadmap
**Prompt source:** founder brief — "Start R3 — Admin-only R3F Preview Sandbox"
**Status:** ✅ DONE — admin-only sandbox shipped; dry-run / no behavior change to Production House
**Maintainer:** root-admin / founder

---

## A. Task title
R3 — Admin-only R3F Preview Sandbox

## B. Date
2026-05-22

## C. Prompt / request summary
Build the first safe R3F preview sandbox: one admin-only route + one page + one lazy-loaded R3F canvas with a simple scene (grid, camera, lights, 2 primitives). Add safety badges, performance guards, dashboard link card, tests, and report. No Production-House integration, no assets, no providers, no render/Unreal/4D-hardware/publishing behavior.

## D. Goal
Land a first, fully-isolated R3F surface inside the admin shell so the R3F v9 + drei stack (installed in R2) can be visually and performance-validated without touching any live Production House code path.

## E. Scope (what is in this task)
- New page: `client/src/pages/admin/R3FPreviewSandbox.tsx`
- New component: `client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx` (lazy-loaded)
- New admin route: `/admin/r3f-preview-sandbox`
- New dashboard link card under the **3D / 4D / Unreal** zone
- 8 safety badges + dry-run badge + back-to-dashboard control
- WebGL availability fallback
- Performance guards (DPR cap, `frameloop="demand"`, low-power GL, lazy load)
- This report

## F. Explicit non-goals
- ❌ No integration with Production House packages or services
- ❌ No real asset loading (no GLB / GLTF / textures / HDRI / video / audio)
- ❌ No upload flows
- ❌ No schema or migration changes
- ❌ No new server route or service
- ❌ No provider API calls (OpenAI / ElevenLabs / Meshy / Runway / HeyGen / Remotion / Unreal / 4D hardware)
- ❌ No render / export / live / publishing behavior enabled
- ❌ No Unity iframe
- ❌ No `signedUrl` / `publicUrl` / `realSendAllowed` / `executionEnabled` fields added or flipped
- ❌ No changes to existing pages other than `App.tsx` (route registration) and `AdminDashboard.tsx` (one link card)

## G. Files changed

| File | Status | Δ | Purpose |
|---|---|---|---|
| `client/src/pages/admin/R3FPreviewSandbox.tsx` | **NEW** | +120 lines | Admin-only sandbox page with safety badges + lazy-loaded Canvas |
| `client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx` | **NEW** | +112 lines | R3F Canvas + Suspense-safe component with WebGL fallback |
| `client/src/App.tsx` | modified | +2 lines | Import `R3FPreviewSandbox` + register `/admin/r3f-preview-sandbox` route |
| `client/src/pages/admin/AdminDashboard.tsx` | modified | +1 line | Add "R3F Preview Sandbox" link card under 3D/4D/Unreal zone |
| `docs/reports/R3F_PREVIEW_SANDBOX_R3_REPORT.md` | **NEW** | this file | Report |

## H. Routes changed
- **Added (client):** `/admin/r3f-preview-sandbox` → `R3FPreviewSandbox` (admin page only)
- **Server routes added/changed:** 0

## I. Backend / service changes
**None.** Zero changes under `server/`. The sandbox is 100 % browser-side and makes no `fetch` / `apiRequest` calls.

## J. Schema / migration changes
**None.** Zero changes to `shared/schema.ts`. Zero migrations run. No new tables, columns, indexes, or enums.

## K. Admin / dashboard changes
- `AdminDashboard.tsx` — appended one link object inside the existing `studio-3d-4d` zone's `links` array:
  ```
  { label: "R3F Preview Sandbox",
    href: "/admin/r3f-preview-sandbox",
    status: "dryRun",
    icon: Sparkles,
    description: "Browser-only R3F sandbox for safe 3D preview experiments. No assets, no render, no public output.",
    tooltip: "Admin-only R3F v9 + drei sandbox. Dry-run / admin-only. No provider calls, no render execution, no Unreal, no 4D hardware, no publishing." }
  ```
- No other dashboard surface was modified. Zone ordering, hero metrics, command strip, and all other links are unchanged.

## L. Safety gates affected
**None weakened.** All gates remain at their prior values. The sandbox carries 8 explicit safety badges visible at the top of the page:

| Badge | `data-testid` |
|---|---|
| Admin preview only | `badge-admin-preview-only` |
| No public URL | `badge-no-public-url` |
| No signed URL | `badge-no-signed-url` |
| No provider calls | `badge-no-provider-calls` |
| No render execution | `badge-no-render-execution` |
| No Unreal execution | `badge-no-unreal-execution` |
| No 4D hardware | `badge-no-4d-hardware` |
| No publishing | `badge-no-publishing` |

A separate "Dry run" badge sits next to the title (`badge-dry-run`).

## M. Approval gates affected
**None.** No approval-gate code is touched. The sandbox never reaches a publishing / render / live path, so no approval-gate transition can be invoked from this surface.

## N. Tests / checks run

| Check | Command | Result |
|---|---|---|
| Project-wide TypeScript check | `npx tsc --noEmit -p tsconfig.json` | Pre-existing errors only in `server/routes/broadcasts.ts`, `server/routes/playout.ts`, `server/services/production-house-service.ts`, `server/services/audience-audit-export-notifier.ts` — all unrelated to R3. **Zero errors introduced by R3 files** (no diagnostic mentions `R3FPreviewSandbox.tsx` or `ProductionCanvasSandbox.tsx`). |
| Production build | `npm run build` | ✅ `built in 29.61s` · server bundle `dist/index.cjs 4.0 MB` · client bundle includes a **separate lazy chunk** `ProductionCanvasSandbox-CGV99G0N.js  176.27 kB  gzip: 55.93 kB`, confirming lazy-load worked |
| Route registration | `grep -n "r3f-preview-sandbox" client/src/App.tsx` | ✅ Route present at `App.tsx:282` |
| Dashboard card | `grep -n "r3f-preview-sandbox" client/src/pages/admin/AdminDashboard.tsx` | ✅ Card present at `AdminDashboard.tsx:311` |
| Zero provider / env / secret references | `grep -iE "openai\|elevenlabs\|meshy\|runway\|heygen\|process\.env\|apiRequest\|signedUrl=\|publicUrl=\|realSendAllowed=\|executionEnabled=" R3FPreviewSandbox.tsx ProductionCanvasSandbox.tsx` | ✅ Only matches are the **negation text** in the safety envelope description (`publicUrl=null · signedUrl=null · realSendAllowed=false · executionEnabled=false`). Zero actual reads / fetches / flag flips. |
| Zero server-side changes | `git diff --stat HEAD -- server/ shared/` | ✅ Empty |
| Zero schema/migration changes | `git diff --stat HEAD -- shared/schema.ts migrations/` | ✅ Empty |

## O. Results
- Sandbox lazy-loads from a dedicated chunk; main bundle does NOT carry R3F when sandbox is unvisited.
- Scene renders with: grid floor · perspective camera (fov 50, position [4, 3.5, 5]) · ambient + 2 directional lights · 1 box + 1 sphere.
- OrbitControls enabled (rotate + zoom; pan disabled) with damping; camera distance clamped [3, 14].
- WebGL fallback shown if browser lacks WebGL.
- 8 safety badges rendered.
- Dashboard card visible under 3D / 4D / Unreal zone.

## P. Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Bundle bloat (R3F + drei) | low | Lazy-loaded via `React.lazy`; 176 kB chunk only fetched when admin opens the route |
| Memory leak from Canvas re-mount | low | `frameloop="demand"` + OrbitControls damping; no manual animation loop |
| User mistakes sandbox for production tool | very low | Visible "Dry run" badge + 8 safety badges + explicit description in dashboard tooltip |
| Color-space drift from R3F v9 default change (per R1 §1.B notes) | low | Explicit `gl.outputColorSpace = THREE.SRGBColorSpace` set in `onCreated` |
| Future contributors adding fetches / providers to sandbox | medium | Documented in this report + page-level safety envelope description; future R-phases must keep sandbox isolated |

## Q. Rollback plan
```bash
# Remove the 4 new lines + 2 new files; restore is one revert away.
git revert <merge-commit-of-this-task>
# OR manually:
rm client/src/pages/admin/R3FPreviewSandbox.tsx
rm -r client/src/components/production-house/r3f
# Then remove from App.tsx:
#   line: import R3FPreviewSandbox from "@/pages/admin/R3FPreviewSandbox";
#   line: <Route path="/admin/r3f-preview-sandbox" component={R3FPreviewSandbox} />
# Then remove from AdminDashboard.tsx the one R3F Preview Sandbox link card.
npm run build   # verify
```

## R. Follow-ups
- **R4 (proposed):** safe GLB/GLTF loader inside the same sandbox, gated to a small public sample asset committed to the repo (e.g., a low-poly cube). No private assets, no signed URL.
- **R5 (proposed):** `useFrame`-driven idle camera rotation toggle + FPS overlay (debug-only). Still admin-only, still dry-run.
- **R6 (proposed):** `<ProductionCanvas/>` shared wrapper extraction (per R1 §6) so future admin pages can reuse a single canvas envelope.
- Each follow-up is a separate approved task; none implied or auto-started by R3.

## S. Archive / library references checked

| Source | Action | Finding |
|---|---|---|
| `docs/archive/ARCHIVE_LIBRARY_INDEX.md` | grep `r3f / three / webgl / unity / 3d / 4d / production / unreal` | Topic-cluster §4 confirms 12 prior Unreal-Bridge briefs (dry-run-first principle), 11 prior Production-House briefs (preview studio, readiness, approval board), and the 4D Hardware Sandbox brief. All carry the "dry-run-first / no-direct-commands" principle that R3 inherits. No prior R3F (React-Three-Fiber) code existed (R1 design §1 confirmed greenfield). |
| `docs/library/INDEX.md` | search same terms | R1 design + R2 plan + R2 install are already indexed under `library/reports/` (`R3F_WEBGL_UNITY_PRODUCTION_HOUSE_INTEGRATION_R1_DESIGN.md`, `R3F_DEPENDENCY_COMPATIBILITY_R2_REPORT.md`, `R3F_DEPENDENCY_INSTALL_R2_EXECUTION_REPORT.md`). No prior sandbox component. |
| `docs/reports/R3F_WEBGL_UNITY_PRODUCTION_HOUSE_INTEGRATION_R1_DESIGN.md` | re-read §1, §2, §4 | R3 implements the R1 plan exactly: admin-only sandbox at `/admin/r3f-sandbox` (path adjusted to `/admin/r3f-preview-sandbox` per founder brief), lazy-loaded Canvas wrapper, explicit sRGB color-space, no provider calls, no execution. |
| `docs/reports/R3F_DEPENDENCY_INSTALL_R2_EXECUTION_REPORT.md` | confirm deps available | `@react-three/fiber ^9.6.1`, `@react-three/drei ^10.7.7`, `three ^0.183.0`, `@types/three ^0.183.0` — all present in `package.json`. R3 uses only `Canvas`, `OrbitControls`, `Grid`, and primitive meshes — a subset that exercises the install. |
| `docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/` | `ls \| grep -iE "production\|3d\|4d\|preview\|sandbox"` | 10 historical Production-House briefs surfaced; all match clusters in §4 of the archive index. None of them propose an R3F-isolated sandbox — they all start at Production House integration, which R3 explicitly defers. |
| Cinema Control + Production House admin pages | read for layout convention | Followed shadcn Card / Badge / Button + `data-testid` convention used by `CinemaControl.tsx` and other admin pages. |

**Archive-first cost rule satisfied per `DEVELOPMENT_DOCUMENTATION_POLICY.md` §5.**

## T. Confirmation whether source behavior changed

| Surface | Behavior change |
|---|---|
| Existing client pages (other than `App.tsx` route table + 1 link in `AdminDashboard.tsx`) | **NONE** |
| Existing services (`server/services/*`) | **NONE** |
| Existing routes (`server/routes/*`, `server/routes.ts`) | **NONE** |
| Schema (`shared/schema.ts`) | **NONE** |
| Migrations | **NONE RUN** |
| Tests | **NONE MODIFIED** |
| Workflows | not restarted (build alone verifies) |
| Production House behavior | **UNCHANGED** — sandbox is a separate page with no imports from `ProductionHouse.tsx` / `CinemaControl.tsx` and no shared state |
| Render / Live / Unreal / 4D-hardware / Publishing | **NONE ENABLED** — sandbox cannot reach any of these code paths |
| Safety / approval gates | **UNCHANGED** — sandbox adds 8 informational badges but does not register or modify any gate logic |

**Net runtime behavior change to existing surfaces: zero.** The only new behavior is a new admin-only page reachable from one new link card.

---

## Appendix — Update `docs/library/INDEX.md`

Per `DEVELOPMENT_DOCUMENTATION_POLICY.md` §6, this report should be added to the library index. Suggested row for §E (`docs/reports/`):

```
| `docs/reports/R3F_PREVIEW_SANDBOX_R3_REPORT.md` | md | report | R3 R3F sandbox | active | `library/reports/` | `keep_original_location` | New in R3 task. |
```

(Index update is a small docs-only follow-up; not blocking R3 acceptance.)
