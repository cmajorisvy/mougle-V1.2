# MOUGLE-PR-D Production House E2E Wiring Report

## 1. Executive Summary

The Admin Dashboard -> Production House area is statically wired for all 8 requested units. The dashboard category exists, each card has the expected label/status/route target, and each target route is registered in `client/src/App.tsx` with an existing component.

This PR adds Production House-only Playwright coverage in `tests/e2e/production-house-wiring.spec.ts`. The default tests are local-safe static wiring checks. Authenticated browser navigation and canvas/fallback smoke checks are present but guarded behind `E2E_PRODUCTION_HOUSE_RUNTIME=1` so they are only run against a local or staging admin session with safe DB/provider stubs.

No app runtime code, migrations, schema, provider credentials, Supabase configuration, or database code was changed. No confirmed Production House wiring bug required an app-code fix in this pass.

Final verdict: ready with caveats. Runtime browser E2E still requires a safe local/staging admin environment, not Supabase Pro.

## 2. Branch and Commit SHA

- Branch: `codex/mougle-pr-d-production-house-e2e-wiring`
- Base SHA at branch creation and validation start: `a4614af74fd8772ed920f2169b9bcc1c20460bcb`
- Report commit SHA: generated after this report is committed; final SHA is reported in the Codex completion summary because a commit cannot contain its own final hash without changing it.

## 3. Production House Unit Coverage

| Unit | Dashboard card | Route linked | Component exists | Route contract checked | Safe action posture | Test coverage |
| --- | --- | --- | --- | --- | --- | --- |
| Production House Console | Yes, Admin only | `/admin/production-house` | `ProductionHouse` | `Mougle AI Production House`, Readiness Center, Approval Board | Admin console; no auto-approval indicators present | Static Playwright wiring; optional runtime navigation |
| Video Render | Yes, Dry run | `/admin/video-render` | `VideoRender` | `Avatar / Video Render`, Dry-run default, No provider calls | Dry-run render planning only; provider calls disabled in UI copy | Static Playwright wiring; optional runtime navigation |
| Voice Jobs | Yes, Manual | `/admin/voice-jobs` | `VoiceJobs` | `Voice Jobs`, Manual trigger, Mock dry-run | Manual/mock-safe provider option present | Static Playwright wiring; optional runtime navigation |
| AI Jobs | Yes, Admin only | `/admin/ai-jobs` | `AiJobMonitor` | `AI Job Monitor`, job filters/status | Admin monitoring UI only | Static Playwright wiring; optional runtime navigation |
| AI Workers | Yes, Admin only | `/admin/ai-workers` | `AiWorkers` | `AI Workers`, derived/reported status filters | Admin worker-health view only | Static Playwright wiring; optional runtime navigation |
| AI Ops | Yes, Admin only | `/admin/ai-ops` | `AiOps` | `AI Operations`, jobs/workers/retention overview | Admin operations overview only | Static Playwright wiring; optional runtime navigation |
| AI Retention | Yes, Admin only | `/admin/ai-retention` | `AiRetention` | `AI Retention & Cleanup`, dry-run preview text | Dry-run button present; irreversible cleanup button not clicked by tests | Static Playwright wiring; optional runtime navigation |
| Build Queue / Readiness | Yes, Dry run | `/admin/build-queue` | `BuildQueueDashboard` | `Build Queue & Bootstrap Health`, queue/health tabs | Readiness/build status monitoring | Static Playwright wiring; optional runtime navigation |

## 4. Routes, Components, and Files Inspected

- `client/src/pages/admin/AdminDashboard.tsx`
- `client/src/App.tsx`
- `client/src/pages/admin/ProductionHouse.tsx`
- `client/src/pages/admin/VideoRender.tsx`
- `client/src/pages/admin/VoiceJobs.tsx`
- `client/src/pages/admin/AiJobMonitor.tsx`
- `client/src/pages/admin/AiWorkers.tsx`
- `client/src/pages/admin/AiOps.tsx`
- `client/src/pages/admin/AiRetention.tsx`
- `client/src/pages/admin/BuildQueueDashboard.tsx`
- `client/src/pages/admin/R3FPreviewSandbox.tsx`
- `client/src/pages/admin/AvatarRigPreview.tsx`
- `client/src/pages/admin/VirtualSetPreview.tsx`
- `client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx`
- `client/src/components/production-house/r3f/AvatarRigCanvas.tsx`
- `client/src/components/production-house/virtual-sets/VirtualSet.tsx`
- `tests/e2e/admin-auth.setup.ts`
- `tests/e2e/admin-auth-paths.ts`
- `tests/e2e/r10-r3f-3d-4d-route-smoke.spec.ts`
- `tests/r10-r3f-3d-4d-safety-invariants.test.ts`
- `scripts/run-test-suite.cjs`
- `playwright.config.ts`
- `package.json`

## 5. Playwright Tests Added

Added `tests/e2e/production-house-wiring.spec.ts`.

Default static-safe tests:

- Verifies the Admin Dashboard declares the Production House category and all 8 expected cards.
- Verifies each card target is registered as an app route.
- Verifies each route component exposes the expected heading and safe operating text.
- Verifies target UI files do not hard-code live provider hostnames.
- Verifies R3F/3D surfaces are route-linked and expose Canvas or WebGL fallback hooks.

Runtime opt-in tests:

- Dashboard card click navigation for all 8 units with console-error capture and provider-host guard.
- R3F/3D surface smoke verifying a canvas or deliberate WebGL fallback.

Runtime tests are skipped unless `E2E_PRODUCTION_HOUSE_RUNTIME=1` is set against a safe local/staging admin session.

## 6. R3F / Three.js / 3D / 4D Verification Result

Static R3F/3D readiness passed:

- `/admin/r3f-preview-sandbox` is linked and backed by `ProductionCanvasSandbox`.
- `/admin/avatar-rig-preview` is linked and backed by `AvatarRigCanvas`.
- `/admin/virtual-set-preview` is linked and backed by `VirtualSet`.
- Canvas components expose WebGL availability checks and fallback test hooks.
- `node scripts/r10-perf-budget-check.mjs` passed with total R3F source gzip at `50960 B / 92160 B` and the demo GLB at `1416 B / 25600 B`.

Headless runtime canvas smoke was not run by default because it needs a local/staging admin session and safe DB/provider stubs. Existing Playwright R10 route/canvas smoke tests are listed by Playwright and remain available for a properly configured safe E2E environment.

## 7. Unwired / Unused / Useless Component Findings

Imported and reachable:

- All 8 requested Production House dashboard units are reachable from `AdminDashboard.tsx`.
- All 8 target paths are registered in `App.tsx`.
- Production House nested panels such as Readiness Center and Approval Board are reachable inside `ProductionHouse.tsx` by section state/query routing rather than standalone top-level routes.
- R3F/3D surfaces are reachable from the dashboard 3D/4D zone and from `App.tsx`.

No missing critical wiring found:

- No Production House dashboard card points to a missing app route.
- No target route in scope points to a missing component.
- No route-linked component in scope failed the static heading/safety-text contract.

Candidates requiring separate dead-code review:

- No component was deleted. Some large nested Production House panels are not top-level routes, but they are panel-level surfaces inside the console and should not be treated as unused without a deeper import/runtime reachability audit.

Provider/live-risk findings:

- Target UI files do not hard-code live provider hostnames.
- `VideoRender` presents dry-run provider planning and explicit "No provider calls" / "live provider calls and publishing are disabled" copy.
- `VoiceJobs` exposes manual trigger and mock dry-run review posture.
- `AiRetention` contains a real irreversible cleanup control, but also has preview/dry-run UI; this PR did not click or execute it.
- Production House Unreal/4D/local bridge panels include admin API actions. The inspected labels and existing safety posture emphasize dry-run, validation, local bridge, approval, and no auto-approval. Runtime execution was not performed.

R3F/3D coverage gaps:

- Static and perf coverage exists.
- Authenticated browser canvas smoke remains blocked until a safe local/staging admin DB environment is available.

## 8. Bugs Fixed

- Added a dedicated Production House Playwright wiring spec.
- Added guarded runtime smoke coverage for Production House dashboard navigation and R3F/3D fallback readiness.
- No app-code bug was confirmed during static inspection, so no runtime code was changed.

## 9. Remaining Blockers

- Authenticated full browser E2E was not run because this machine/session does not have a confirmed safe local/staging admin DB environment for Production House route rendering.
- Do not run the opt-in runtime tests against Supabase Pro.
- A broader dead-code tree-shaking/import graph audit is still a separate task if the goal is to delete unused Production House components.

## 10. Commands Run

| Command | Status | Notes |
| --- | --- | --- |
| `git status --short --branch` | Pass | Confirmed branch context. |
| `git switch main` | Pass | Completed during setup. |
| `git pull --ff-only origin main` | Pass | Completed during setup; main was up to date. |
| `git switch -c codex/mougle-pr-d-production-house-e2e-wiring` | Pass | Completed during setup. |
| `node .\node_modules\@playwright\test\cli.js test --list tests/e2e/production-house-wiring.spec.ts` | Pass | Listed 8 tests including setup and opt-in runtime tests. |
| `node .\node_modules\@playwright\test\cli.js test tests/e2e/production-house-wiring.spec.ts --project=chromium --no-deps` | Pass | 5 passed, 2 skipped. Runtime tests skipped by design. |
| `tsc --noEmit` | Pass | Used Node 24 binary. |
| `node scripts/safety-lint.cjs` | Pass | `safety-lint: OK (scanned 670 files)`. |
| `npm run test:local` | Pass after PATH correction | Initial run used stale `node` on PATH and failed before tests; rerun with Node 24 first on PATH passed with 145 tests. |
| `node scripts/r10-perf-budget-check.mjs` | Pass | R10 source and demo GLB budgets passed. |
| `npm run build` | Pass after sandbox approval | Initial sandbox run hit Vite/esbuild path access denial; approved rerun passed. Vite reported the existing large chunk warning. |
| `node .\node_modules\@playwright\test\cli.js test --list` | Pass | Listed 47 Playwright tests in 14 files. |

## 11. Supabase / Provider Safety Status

- Database commands run: none.
- Supabase writes: none.
- Supabase Pro writes: none.
- Provider calls for video, voice, avatar, AI, worker, render, or broadcast services: none.
- Live provider credentials inspected or exposed: none.
- Secrets, tokens, passwords, cookies, DATABASE_URL, and Supabase keys exposed: none.
- Migrations/schema edits: none.
- Dependency installation: none.

## 12. Final Verdict

Ready with caveats.

The Production House dashboard and route wiring are ready for review with static-safe Playwright coverage in place. Full runtime browser proof should be run only in a safe local/staging admin environment with DB/provider stubs, never against Supabase Pro.
