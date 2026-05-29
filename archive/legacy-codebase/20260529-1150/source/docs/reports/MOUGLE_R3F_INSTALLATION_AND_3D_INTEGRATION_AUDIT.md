# MOUGLE R3F Installation and 3D Integration Audit

**Date:** 2026-05-23
**Branch:** `codex/mougle-pr-h-r3f-installation-3d-integration-audit`
**Runtime-tested app/base SHA:** `22055353b76b0ce17fa5303c976c75ea6a7c1d7b`
**Report commit note:** The pushed branch HEAD is intentionally later than the runtime-tested app SHA because the only post-validation changes are this audit report and `docs/library/INDEX.md`.
**Task label:** `MOUGLE-PR-H`
**Verdict:** READY TO PUSH: docs/report only

## 1. Executive Summary

React Three Fiber is installed and version-compatible for Mougle's current React stack. The installed pairing is `react@19.2.3`, `react-dom@19.2.3`, and `@react-three/fiber@9.6.1`, which matches the official R3F v9 / React 19 compatibility line.

The 3D/avatar/room preview surfaces are wired through admin-only routes and passed local-safe validation. Canvas components import `Canvas` from `@react-three/fiber`, GLTF hooks are contained inside Canvas children, demo GLB loading remains opt-in and defaults OFF, and the R3F safety invariant suite confirms no public URL promotion, no signed URL persistence, no provider-host client calls, no live render path, no publishing, no live runner, no real Unreal send, no Unity execution, and no 4D hardware enablement.

No app code was changed after validation. No schema, migrations, Supabase, provider, render, publish, live-runner, Unreal, Cinema 4D, Unity, or 4D hardware behavior changed.

## 2. Sources Read

### Official R3F / Ecosystem References

- `https://r3f.docs.pmnd.rs/getting-started/installation`
- `https://r3f.docs.pmnd.rs/getting-started/introduction`
- `https://r3f.docs.pmnd.rs/getting-started/community-r3f-components`
- `https://r3f.docs.pmnd.rs/api/canvas`
- `https://r3f.docs.pmnd.rs/api/objects`
- `https://r3f.docs.pmnd.rs/api/hooks`
- `https://r3f.docs.pmnd.rs/api/events`
- `https://r3f.docs.pmnd.rs/api/additional-exports`
- `https://r3f.docs.pmnd.rs/api/typescript`
- `https://r3f.docs.pmnd.rs/api/testing`
- `https://r3f.docs.pmnd.rs/advanced/scaling-performance`
- `https://r3f.docs.pmnd.rs/advanced/pitfalls`
- `https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide`
- `https://r3f.docs.pmnd.rs/tutorials/events-and-interaction`
- `https://r3f.docs.pmnd.rs/tutorials/loading-models`
- `https://r3f.docs.pmnd.rs/tutorials/loading-textures`
- `https://r3f.docs.pmnd.rs/tutorials/basic-animations`
- `https://r3f.docs.pmnd.rs/tutorials/how-it-works`
- `https://threejs.org/docs/`
- `https://github.com/pmndrs/react-three-fiber`
- `https://github.com/pmndrs/drei`
- `https://github.com/pmndrs/use-gesture`
- `https://github.com/pmndrs/react-spring`
- `https://github.com/pmndrs/zustand`

### Mougle Source-of-Truth References

- `docs/MOUGLE_UNIFIED_MASTER_BLUEPRINT.md`
- `docs/library/INDEX.md`
- `docs/archive/ARCHIVE_LIBRARY_INDEX.md`
- `docs/DEVELOPMENT_DOCUMENTATION_POLICY.md`
- `docs/reports/R3F_PREVIEW_SANDBOX_R3_REPORT.md`
- `docs/reports/R3F_STATIC_GLB_DEMO_LOADER_R5B_REPORT.md`
- `docs/reports/R7A_AVATAR_RIG_VISUAL_PREVIEW_AUDIT.md`
- `docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md`
- `docs/reports/R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md`
- `docs/runbooks/PERMANENT_3D_AVATAR_CREATION_RUNBOOK.md`
- `docs/reports/CODEX_PRODUCTION_HOUSE_SMOKE_TEST_REPORT.md`
- `docs/reports/R10_R3F_3D_4D_E2E_SAFETY_PERFORMANCE_REPORT.md`

## 3. Package Versions Found

| Package | Version / status | Notes |
|---|---:|---|
| `react` | `19.2.3` | Root app version. |
| `react-dom` | `19.2.3` | Root app version. |
| `@react-three/fiber` | `9.6.1` | Root dependency; v9 line matches React 19. |
| `three` | `0.183.0` | Root dependency; satisfies R3F/drei peer ranges. |
| `@react-three/drei` | `10.7.7` | Root dependency; used by R3F surfaces. |
| `@react-three/test-renderer` | `9.1.0` | Dev dependency; shares R3F 9. |
| `zustand` | `5.0.11` | Root dependency; also consumed by R3F/drei. |
| `@use-gesture/react` | `10.3.1` | Transitive through drei only. |
| `@react-spring/three` / `@react-spring/web` | not installed | No direct package present and no use found in audited R3F surfaces. |
| `stats-gl` | `2.4.2` transitive | Drei dependency with an isolated nested `three@0.170.0`; not a conflicting app-level R3F Three instance. |

`npm ls three @react-three/fiber @react-three/drei react react-dom` completed successfully. `npm explain three` showed the root `three@0.183.0` satisfying R3F, drei, test-renderer, troika, and three-stdlib peers. The only duplicate Three package is `stats-gl`'s nested `three@0.170.0`, isolated under the drei stats helper path. `npm explain @react-three/fiber` resolved to a single root `@react-three/fiber@9.6.1`.

An unrelated nested `react@18.3.1` / `react-dom@18.3.1` pair exists under `resend -> @react-email/render`; it is not part of the R3F app tree.

## 4. Official R3F Compatibility Conclusion

Official R3F installation guidance says Fiber is compatible with React 18 and 19 and that `@react-three/fiber@9` pairs with `react@19`. Mougle's root versions therefore match the required major-version pairing.

Official Canvas guidance confirms `Canvas` is the R3F portal into Three.js and supports a DOM fallback for systems without WebGL. Mougle's R3F surfaces provide fallback hooks or guarded surrounding UI for headless / WebGL-unavailable paths.

Official hook guidance says R3F hooks rely on Canvas context and must be used inside Canvas. Mougle's `useGLTF` calls are inside Canvas child components, and no `useThree`, `useFrame`, or `useLoader` misuse was found in audited surfaces.

Official performance guidance warns against creating expensive Three objects unnecessarily and against `setState` inside render loops. Mougle's audited surfaces do not use `useFrame` and do not call React state setters in an R3F hot loop.

## 5. Routes / Pages Checked

| Route | Result | Notes |
|---|---|---|
| `/admin/r3f-preview-sandbox` | Pass | Browser smoke loaded, canvas/fallback present, demo GLB toggle default OFF. |
| `/admin/avatar-rig-preview` | Pass | Browser smoke loaded, canvas/fallback present, signed URLs remain state-only. |
| `/admin/3d-assets` | Pass | Browser smoke loaded, route text present, no public URL exposure. |
| `/admin/3d-rigs` | Pass | Browser smoke loaded, route text present, no public URL exposure. |
| `/admin/permanent-avatars` | Pass | Browser smoke loaded, route text present. |
| `/admin/permanent-avatars/new` | Pass | Browser smoke loaded, create form reachable with mocked APIs. |
| `/admin/production-house` | Pass | Browser smoke loaded; same-origin APIs mocked; no provider-host request observed. |
| `/admin/virtual-set-preview` | Pass | Browser smoke loaded, canvas/fallback present. |
| `/admin/unity-webgl-sandbox` | Pass | Browser smoke loaded; sandbox shell remains inactive until toggled. |
| `/admin/4d-cinema-control` | Pass | Browser smoke loaded with mocked readiness/projects payloads. |

## 6. R3F Components Found

| File | R3F role | Finding |
|---|---|---|
| `client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx` | R3F canvas sandbox | Imports `Canvas` from `@react-three/fiber`; uses `useGLTF` in Canvas children; has fallback and performance caps. |
| `client/src/components/production-house/r3f/AvatarRigCanvas.tsx` | Avatar rig R3F preview | Imports `Canvas` from `@react-three/fiber`; `useGLTF` is inside Canvas children; fallback and error boundary present. |
| `client/src/components/production-house/virtual-sets/VirtualSet.tsx` | Virtual set R3F preview | Imports `Canvas` from `@react-three/fiber`; uses `useGLTF` in model child; fallback present. |
| `client/src/pages/admin/R3FPreviewSandbox.tsx` | Admin route wrapper | Lazy-loads ProductionCanvasSandbox; demo GLB defaults OFF; signed URL held in React state only. |
| `client/src/pages/admin/AvatarRigPreview.tsx` | Admin route wrapper | Lazy-loads AvatarRigCanvas; permanent-avatar preview bundle URLs held in state only and cleared on source change/unmount. |
| `client/src/pages/admin/VirtualSetPreview.tsx` | Admin route wrapper | Read-only signed-preview consumer; no persistence found. |
| `client/src/components/production-house/Package3DPreviewSection.tsx` | Production package 3D preview | Reuses R3F avatar/virtual-set components; no public URL persistence found. |

No `useFrame`, `useThree`, or `useLoader` usage was found in the audited production R3F surfaces. The only R3F loader hook found is `useGLTF` from drei, and every use is in a Canvas child component.

## 7. Product 3D / Avatar / Room Integration Findings

- Admin dashboard links the 3D/4D/Unreal zone and the R3F, avatar rig, virtual set, Unity shell, Production House, 3D asset, 3D rig, and permanent avatar surfaces.
- The Production House page includes room/avatar/3D/4D planning modules, but tests confirm they remain draft/internal/dry-run and do not enable real sends.
- The Virtual Set preview is the current room/studio/space R3F preview surface. It loads under browser smoke with a canvas/fallback and uses same-origin mocked API responses.
- The Avatar Rig preview is the current product avatar/rig R3F preview surface. It loads under browser smoke with a canvas/fallback.
- Permanent avatar pages load with mocked APIs and continue to present no `approved_public` workflow and no public URL path.
- The Unity WebGL route is a sandbox shell only. No Unity build or external Unity URL is loaded during smoke.
- The Cinema Control route is a preview-only planning/admin surface. Browser smoke did not trigger actions or provider calls.

## 8. Safety Findings

| Safety invariant | Result | Evidence |
|---|---|---|
| No Supabase Pro writes | Pass | No database commands were run; browser APIs were mocked. |
| No migrations/schema changes | Pass | No schema or migration files changed. |
| No provider calls | Pass | Browser smoke recorded zero forbidden provider-host requests; static grep found no provider/env host calls in audited R3F/avatar/permanent-avatar client files. |
| No public URL exposure | Pass | Serializers pin `publicUrl: null`; browser smoke did not expose persisted public URL storage; tests confirm public URL invariants. |
| No signed URL persistence | Pass | Signed preview URLs are React state only; grep found no `localStorage`, `sessionStorage`, or cookie persistence for signed URLs in R3F surfaces. |
| Demo GLB defaults OFF | Pass | `/admin/r3f-preview-sandbox` switch was unchecked in browser smoke. |
| No render execution | Pass | R10 invariants and Production House tests passed; no render action was triggered. |
| No publishing | Pass | Production House tests and browser smoke did not trigger publishing. |
| No live runner | Pass | No live-runner enablement found or executed. |
| No Unreal execution | Pass | Production House tests confirm real Unreal sends remain blocked; UI remains dry-run/manual. |
| No Cinema 4D execution | Pass | Cinema page loaded as preview-only; no external execution triggered. |
| No Unity execution | Pass | Unity sandbox shell loaded; iframe remains opt-in/inactive. |
| No 4D hardware | Pass | Tests confirm real 4D sends/hardware remain blocked. |
| `approved_public` blocked | Pass | Static checks only find documentation/test/comment references; schema and routes block the workflow. |

## 9. Commands Run

| Command | Status | Notes |
|---|---|---|
| `git status --short --branch` | Pass | Branch clean before report creation. |
| `npm ls three @react-three/fiber @react-three/drei react react-dom` | Pass | React 19.2.3 + R3F 9.6.1 + Three 0.183.0 resolved. |
| `npm ls @use-gesture/react @react-spring/three @react-spring/web zustand stats-gl` | Pass | use-gesture/stats-gl are transitive via drei; react-spring not installed. |
| `npm explain three` | Pass | Root Three satisfies R3F/drei peers; nested stats-gl Three isolated. |
| `npm explain @react-three/fiber` | Pass | Single root R3F 9.6.1. |
| `NODE_OPTIONS=--max-old-space-size=4096 node node_modules/typescript/bin/tsc --noEmit` | Pass | Typecheck passed. |
| `npm run build` | Pass | Passed with Node 24 PATH; existing Vite chunk-size warning only. |
| `node scripts/safety-lint.cjs` | Pass | `safety-lint: OK (scanned 670 files)`. |
| `npm run test:local` | Pass | 145 tests passed. Existing test-console warnings from React Query/Recharts, no failures. |
| `node scripts/r10-perf-budget-check.mjs` | Pass | R10 perf budget passed; total R3F source gzip 50,960 B / 92,160 B cap. |
| `node node_modules/@playwright/test/cli.js test --list` | Pass | 47 tests listed. |
| `node node_modules/@playwright/test/cli.js test tests/e2e/production-house-wiring.spec.ts --project=chromium --no-deps` | Pass | 5 passed, 2 runtime E2E tests skipped by gate. |
| `NODE_ENV=test node node_modules/tsx/dist/cli.mjs --test --test-force-exit --test-concurrency=1 tests/production-house.test.ts` | Pass | 464 tests passed. |
| `NODE_ENV=test node node_modules/tsx/dist/cli.mjs --test --test-force-exit --test-concurrency=1 tests/permanent-avatars-routes-provider-isolation.test.ts` | Pass | 4 tests passed. |
| `NODE_ENV=test node node_modules/tsx/dist/cli.mjs --test --test-force-exit --test-concurrency=1 tests/r10-r3f-3d-4d-safety-invariants.test.ts` | Pass | 25 tests passed. |
| Mocked local browser smoke script | Pass | 10 admin routes loaded; no forbidden provider-host requests; no signed/public URL storage keys. |
| `tests/r10-r3f-3d-4d-runtime-routes.test.ts` | Skipped | Not run because it imports server storage/DB paths; task forbids Supabase Pro and DB-backed execution without an approved local/staging DB path. |

## 10. Browser Smoke Result

Smoke used Vite on `127.0.0.1:5179`, Playwright Chromium with the installed Chrome executable, and intercepted all `/api/**` calls with local mocked JSON. No Supabase Pro, provider host, or backend DB endpoint was contacted.

| Route | Expected text | Canvas/fallback | Console/page errors | URL storage |
|---|---|---|---|---|
| `/admin/r3f-preview-sandbox` | Pass | Pass | None | No signed/public URL keys |
| `/admin/avatar-rig-preview` | Pass | Pass | None | No signed/public URL keys |
| `/admin/3d-assets` | Pass | n/a | None | No signed/public URL keys |
| `/admin/3d-rigs` | Pass | n/a | None | No signed/public URL keys |
| `/admin/permanent-avatars` | Pass | n/a | None | No signed/public URL keys |
| `/admin/permanent-avatars/new` | Pass | n/a | None | No signed/public URL keys |
| `/admin/production-house` | Pass | n/a | None | No signed/public URL keys |
| `/admin/virtual-set-preview` | Pass | Pass | None | No signed/public URL keys |
| `/admin/unity-webgl-sandbox` | Pass | n/a | None | No signed/public URL keys |
| `/admin/4d-cinema-control` | Pass | n/a | None | No signed/public URL keys |

Forbidden provider-host request count: 0.

## 11. Failures / Blockers

No merge-blocking R3F installation, compatibility, wiring, or safety blocker remains from this audit.

Non-app invocation notes:

- A first `npm run build` attempt failed because this PowerShell session inherited an obsolete Node on PATH. The same command passed after prepending `C:\Program Files\nodejs` so Node 24.16.0 ran the repo's tooling.
- A first direct `tests/production-house.test.ts` run failed because `NODE_ENV=test` was not set, and provider test hooks correctly refused to run outside test mode. The same targeted command passed with `NODE_ENV=test`.
- Runtime DB-backed R10 route tests were intentionally skipped for safety because this task does not use Supabase Pro or database credentials.

## 12. Files Changed

Docs/report/index only:

- `docs/reports/MOUGLE_R3F_INSTALLATION_AND_3D_INTEGRATION_AUDIT.md`
- `docs/library/INDEX.md`

No app, test, schema, migration, workflow, provider, build, or runtime file changed.

## 13. Recommended Next Fix Tasks

1. Add a fully hermetic local/staging DB harness for DB-backed R10 runtime route tests so they can run without Supabase Pro secrets.
2. Normalize the PowerShell PATH/Node bootstrap in local developer docs to avoid old Node taking precedence over Node 24.
3. Keep runtime browser E2E gated behind safe local/staging credentials and mocked providers.
4. Consider a future, separate route smoke that exercises Production House tab navigation with mocked same-origin API responses only.

## 14. Safety Confirmation

No DB writes were run. No migrations were run. No Supabase Pro access was used. No provider calls were made. No render execution, publishing, live runner, Unreal execution, Cinema 4D execution, Unity execution, or 4D hardware path was enabled.

Final verdict: READY TO PUSH: docs/report only.
