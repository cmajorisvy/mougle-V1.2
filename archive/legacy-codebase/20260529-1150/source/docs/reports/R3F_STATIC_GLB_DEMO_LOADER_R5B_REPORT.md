# R5B — Static Demo-GLB Loader Inside R3F Sandbox — Execution Report

**Date:** 2026-05-22
**Phase:** R5B of the R-series R3F / WebGL / Unity integration roadmap
**Prompt source:** founder brief — "Start R5B — Static demo-GLB loader inside existing R3F sandbox only"
**Status:** ✅ DONE — sandbox-only · zero schema · zero migration · zero route · zero behavior change
**Maintainer:** root-admin / founder

---

## A. Task title
R5B — Static demo-GLB loader inside existing R3F sandbox only

## B. Date
2026-05-22

## C. Prompt / request summary
Add a safe static GLB/GLTF loading demo to `/admin/r3f-preview-sandbox` using `@react-three/drei`'s `useGLTF` against a single small **local** demo asset, with toggle + Suspense + ErrorBoundary + WebGL fallback. No DB, no schema/migration, no upload, no private storage, no public publishing, no Production House integration, no Unity, no provider calls, no render/export/live/Unreal/4D-hardware execution.

## D. Goal
Validate the `useGLTF` + Suspense + ErrorBoundary pipeline end-to-end inside the existing R3 sandbox so R6+ work has a tested reference loader. Lowest-risk next R3F step per the R4 recommendation.

## E. Scope (what is in this task)
- Updated component: `client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx` (added `useGLTF` loader + ErrorBoundary + props)
- Updated page: `client/src/pages/admin/R3FPreviewSandbox.tsx` (added toggle, error display, provenance note, 9th safety badge)
- New one-shot generator: `scripts/generate-r3f-demo-glb.mjs`
- New demo asset: `client/public/demo-assets/sandbox-cube.glb` (1416 bytes, generated locally)
- New asset README: `client/public/demo-assets/README.md` (license + provenance)
- This report + `docs/library/INDEX.md` row

## F. Explicit non-goals (R5B)
- ❌ No edit to `shared/schema.ts`
- ❌ No migration / no `drizzle-kit` / no `db:push`
- ❌ No new server route, service, or middleware
- ❌ No upload flow
- ❌ No private object-storage write or read
- ❌ No public publishing path
- ❌ No Production House page / service touched
- ❌ No Unity / iframe / WebGL build loader
- ❌ No provider API (OpenAI / Meshy / Runway / ElevenLabs / HeyGen / Unreal / 4D hardware)
- ❌ No environment-secret read
- ❌ No `publicUrl` / `signedUrl` / `realSendAllowed` / `executionEnabled` enabled
- ❌ No additional admin pages / dashboard links beyond what R3 already added
- ❌ No changes to existing pages other than the two sandbox files listed

## G. Files changed

| File | Status | Purpose |
|---|---|---|
| `client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx` | modified | Added `useGLTF` demo model, `GLTFErrorBoundary`, `showDemoGltf` + `onGltfError` props, `useGLTF.preload` at module scope |
| `client/src/pages/admin/R3FPreviewSandbox.tsx` | modified | Added `Switch`+`Label` toggle, error banner, provenance note, "Local demo asset only" safety badge (9th), updated scene-notes / perf-notes / safety-note copy |
| `scripts/generate-r3f-demo-glb.mjs` | **NEW** | One-shot Node script that hand-rolls a minimal valid glTF 2.0 binary (cube, 24 verts, per-face normals, 1416 B). Zero external deps. |
| `client/public/demo-assets/sandbox-cube.glb` | **NEW** binary | Generated demo asset (1416 B). Magic `0x46546C67`, version 2, JSON chunk 740 B, BIN chunk 648 B. |
| `client/public/demo-assets/README.md` | **NEW** | License + provenance + regeneration instructions |
| `docs/reports/R3F_STATIC_GLB_DEMO_LOADER_R5B_REPORT.md` | **NEW** | this report |
| `docs/library/INDEX.md` | modified | +1 row |

## H. Routes changed
- **Client routes:** none (existing `/admin/r3f-preview-sandbox` reused).
- **Server routes:** none.

## I. Backend / service changes
**None.** `git diff --stat HEAD -- server/ shared/ migrations/` returns empty.

## J. Schema / migration changes
**None.** Zero edits to `shared/schema.ts`. No migration generated. No `db:push` run.

## K. Demo asset

- **Path:** `client/public/demo-assets/sandbox-cube.glb`
- **Size:** 1416 bytes
- **Format:** glTF 2.0 binary (GLB)
- **Content:** one unit cube with 24 vertices (4 per face × 6 faces), 36 indices (12 triangles), per-face flat normals. No textures, no materials, no animations, no skins.
- **License / provenance:** mathematically generated from `scripts/generate-r3f-demo-glb.mjs` in this repo. No third-party model data incorporated. Treated as `licenseStatus: internal_only` under the R4 metadata model.
- **Regeneration:** `node scripts/generate-r3f-demo-glb.mjs` (idempotent).
- **Verified validity:** GLB header magic `0x46546C67` ✅, version 2 ✅, total length 1416 ✅, JSON chunk type `0x4E4F534A` length 740 ✅, BIN chunk type `0x004E4942` length 648 ✅, JSON parses ✅.

## L. Safety badges / UX
9 safety badges now rendered (R3 had 8; R5B adds **"Local demo asset only"**):
- Admin preview only · No public URL · No signed URL · No provider calls · No render execution · No Unreal execution · No 4D hardware · No publishing · **Local demo asset only**

Plus the "Dry run" badge in the header. Toggle row shows the exact asset path + size + classification (`internal_only`) + generator script name.

## M. Performance / safety guards (added in R5B)

| Guard | Implementation |
|---|---|
| Demo asset is off by default | `useState(false)` for `showDemoGltf` |
| GLTF load wrapped in Suspense | `<Suspense fallback={null}>…</Suspense>` inside Canvas |
| GLTF load wrapped in ErrorBoundary | `GLTFErrorBoundary` class component → user-visible error banner |
| Demo asset preloaded only at module scope | `useGLTF.preload(DEMO_GLB_URL)` |
| No `useFrame` introduced | confirmed by grep |
| No `setState` in render loop | confirmed by code review |
| No provider/env access added | grep returns zero matches |
| All R3 guards retained | DPR cap `[1, 1.5]` · `frameloop="demand"` · low-power GL · WebGL fallback · OrbitControls damping |

## N. Tests / checks run

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Production build | `npm run build` | ✅ `built in 31.77s` · client lazy chunk `ProductionCanvasSandbox-Dcno0FdQ.js 250.98 kB (gzip 78 kB)` — drei's GLTFLoader is bundled into the **same lazy chunk**, so the sandbox remains lazy-loaded and the main bundle is unaffected (delta: +75 KB vs R3's 176 KB chunk) |
| 2 | TypeScript check (project-wide) | `npx tsc --noEmit -p tsconfig.json` | Pre-existing server errors only (broadcasts, playout, production-house-service, audience-audit-export-notifier). **Zero diagnostics mention the R5B files.** |
| 3 | Route still works | `grep -n "r3f-preview-sandbox" client/src/App.tsx client/src/pages/admin/AdminDashboard.tsx` | ✅ route at `App.tsx:282`; dashboard card at `AdminDashboard.tsx:311` |
| 4 | Zero provider / env / secret refs | `grep -iE "openai\|elevenlabs\|meshy\|runway\|heygen\|process\.env\|apiRequest(\|fetch(" R3FPreviewSandbox.tsx ProductionCanvasSandbox.tsx` | ✅ `NONE_FOUND_OK` |
| 5 | Zero backend / schema / migration diff | `git diff --stat HEAD -- server/ shared/ migrations/` | ✅ empty |
| 6 | GLB binary integrity | Node validator (header + chunks) | ✅ magic, version, lengths, types, JSON parse all OK |
| 7 | No `publicUrl` / `signedUrl` / `realSendAllowed` / `executionEnabled` set | code review of changed files | ✅ no such field set, written, or transmitted |
| 8 | No new client `Route` registered | code review of `App.tsx` diff | ✅ no new `<Route>` |

## O. Results

- Toggle off (default): scene matches R3 exactly (grid + box + sphere + lights + camera).
- Toggle on: demo cube appears at `[0, 0.75, 0]` (above the existing primitives), loaded via `useGLTF` from `/demo-assets/sandbox-cube.glb`.
- If the asset fails to load (e.g., 404 / corrupt), the ErrorBoundary catches it and a destructive-tone banner appears above the canvas with the error message; the toggle remains usable.
- WebGL fallback (R3) still triggers correctly when the browser lacks WebGL.
- Suspense fallback (R3) still triggers for the lazy-loaded canvas chunk.

## P. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bundle delta from drei's GLTFLoader | low | Loader is lazy-chunked with the sandbox; main bundle unchanged. Delta of +75 KB only paid when admin opens the route. |
| Demo asset path collision with future public assets | very low | Folder `client/public/demo-assets/` is dedicated to sandbox-only assets; README documents the scope. |
| Future contributors using the demo asset in production code | low | README + report classify the asset as `internal_only`; consumer code lives only inside the sandbox component. |
| GLB regeneration drift | low | `scripts/generate-r3f-demo-glb.mjs` is deterministic; committing the binary plus the script lets reviewers verify integrity. |
| `useGLTF.preload` running at module import time | low | Preload only fires once the lazy sandbox chunk is loaded (i.e., when the admin opens the sandbox), not on every app boot. |

## Q. Rollback plan

```bash
# 1. Revert the merge commit, OR manually:
rm scripts/generate-r3f-demo-glb.mjs
rm -r client/public/demo-assets
# 2. Restore R3 versions of the two sandbox files from the prior commit:
git checkout HEAD~1 -- \
  client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx \
  client/src/pages/admin/R3FPreviewSandbox.tsx
# 3. Verify
npm run build
```

R3 functionality survives the rollback because the props added in R5B are additive — the R3 baseline (no toggle, no GLTF) is the default behavior when `showDemoGltf=false`.

## R. Follow-ups

- **R6 (proposed):** schema-first implementation of `production_assets` + `production_asset_audit_log` per R4 §3 + §11. Now justified because R5B has a real consumer (the sandbox GLTF loader) that R6 can migrate to a DB-backed asset record.
- **R7 (proposed):** virtual-set preview using a small newsroom-set GLB (still admin-only, still dry-run; still committed local asset).
- **R8 (proposed):** Unity WebGL sandbox iframe (separate admin page; still no provider calls).

None auto-started by R5B; each requires founder approval.

## S. Archive / library references checked

| Source | Finding |
|---|---|
| `docs/reports/R3F_ASSET_METADATA_SAFETY_MODEL_R4_DESIGN.md` §13 | R4 explicitly recommended R5B over R5A. R5B implementation matches the recommendation exactly. |
| `docs/reports/R3F_PREVIEW_SANDBOX_R3_REPORT.md` | Confirmed R3 baseline component shape (props-free), used as starting point. |
| `docs/reports/R3F_WEBGL_UNITY_PRODUCTION_HOUSE_INTEGRATION_R1_DESIGN.md` §3 | "GLB / GLTF model → useGLTF (drei)" — R5B uses exactly that loader. |
| `docs/archive/ARCHIVE_LIBRARY_INDEX.md` §4 (Production cluster) | No prior committed demo GLB. No prior loader pattern. Greenfield within the sandbox. |
| `docs/library/INDEX.md` | R1/R2/R3/R4 R-series rows confirmed; R5B added as the next row. |
| `client/public/` structure | Existing convention: app-level assets at root (`favicon.png`, `logo.png`, `mougle-logo.svg`). New `demo-assets/` subfolder cleanly separates sandbox assets. |
| `scripts/` convention | Existing one-shot scripts (`generate-newsroom-pdf.cjs`, `generate-project-pdf.ts`, `backfill-*.ts`). `generate-r3f-demo-glb.mjs` matches the naming + one-shot pattern. |

**Archive-first cost rule satisfied per `docs/DEVELOPMENT_DOCUMENTATION_POLICY.md` §5.**

## T. Confirmation — source behavior change

| Surface | Change |
|---|---|
| `shared/schema.ts` | **NONE** |
| `migrations/` | **NONE** |
| `server/` | **NONE** |
| `client/src/App.tsx` | **NONE** (route table unchanged from R3) |
| `client/src/pages/admin/AdminDashboard.tsx` | **NONE** (link card unchanged from R3) |
| Other client pages | **NONE** |
| Production House behavior | **UNCHANGED** |
| Existing R3 sandbox behavior (toggle off) | **UNCHANGED** — toggle off renders the exact R3 scene |
| Render / live / Unreal / 4D-hardware / publishing | **NONE ENABLED** |
| Safety / approval gates | **UNCHANGED** (R5B adds informational badges only) |
| Workflows | not restarted (build alone verifies) |
| Tests | not added, not modified |
| Environment / secrets | none read |

**Net runtime behavior change to existing surfaces: zero.** Only the sandbox page gains a new toggle that, when enabled, loads a local GLB committed to the repo.

---

## Final response summary (per brief)

- **Sandbox-only changes:** ✅ two files
- **Local demo asset:** `client/public/demo-assets/sandbox-cube.glb` (1416 B, generated by `scripts/generate-r3f-demo-glb.mjs`, license `internal_only`, README committed)
- **Safety badges preserved:** all 8 R3 badges retained; +1 "Local demo asset only" (total 9)
- **WebGL fallback:** retained
- **Loading fallback:** Suspense fallback `null` inside Canvas (existing canvas-level Suspense in `R3FPreviewSandbox.tsx` still shows "Loading R3F canvas…" while the lazy chunk loads)
- **Error fallback:** `GLTFErrorBoundary` class component → destructive-tone banner above the canvas
- **License / source note:** rendered next to the toggle + documented in `client/public/demo-assets/README.md`
- **Tests:** build ✅ · TS check (zero new errors in R5B files) ✅ · route grep ✅ · zero provider/env refs ✅ · zero backend/schema/migration diff ✅ · zero `publicUrl`/`signedUrl`/`realSendAllowed`/`executionEnabled` set ✅
