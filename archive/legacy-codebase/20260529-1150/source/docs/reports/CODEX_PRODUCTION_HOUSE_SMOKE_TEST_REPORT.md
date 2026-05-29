# Codex Production House Smoke Test Report

## A. Executive Summary

Codex ran a read-only Production House smoke and safety audit after the Mougle migration to Codex/GitHub. The safe checks confirmed that the admin Production House, 3D/R3F, avatar rig, and permanent-avatar pages can load under a local mocked browser smoke without crashes, provider calls, render execution, publishing, live runner activation, Unreal execution, Cinema 4D execution, Unity execution, or 4D hardware activation.

Build, TypeScript, safety lint, local-safe tests, R10 performance budget, Playwright listing, provider-isolation tests, and the static Production House Playwright wiring spec passed. However, the targeted `tests/production-house.test.ts` suite still has 6 failing dry-run/export/audit tests, and DB-backed permanent-avatar cleanup/archive tests were intentionally skipped because the local environment has no safe staging/local database configured and Supabase Pro is protected.

Final verdict: not approved for merge readiness yet. The page smoke and safety invariants are good, but the failing Production House targeted tests need a separate fix branch before this area should be considered fully approved.

## B. Date And Scope

- Date: 2026-05-23
- Repository: `C:\Users\NEW\Desktop\mougle-V1-git`
- Branch tested: `codex/mougle-pr-f-production-house-smoke-safety-test`
- Commit tested: `d118ea98e64a2cb13cdbe41a027a58a9c7e162c3`
- Scope: Production House, admin dashboard cards, R3F sandbox, 3D assets, 3D rigs, avatar rig preview, permanent-avatar pages, backend/API safety invariants, provider isolation, and no-public/no-signed-URL persistence checks.
- Code change scope: documentation only for this report and library index update.

## C. Source Documents Read

- `docs/library/INDEX.md`
- `docs/archive/ARCHIVE_LIBRARY_INDEX.md`
- `docs/DEVELOPMENT_DOCUMENTATION_POLICY.md`
- `docs/runbooks/PERMANENT_3D_AVATAR_CREATION_RUNBOOK.md`
- `docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md`
- `docs/reports/R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md`
- `docs/reports/R7A_AVATAR_RIG_VISUAL_PREVIEW_AUDIT.md`
- `docs/reports/R3F_PREVIEW_SANDBOX_R3_REPORT.md`
- `docs/reports/R3F_STATIC_GLB_DEMO_LOADER_R5B_REPORT.md`

## D. Environment

| Item | Value |
|---|---|
| OS | Microsoft Windows NT 10.0.26100.0 |
| Node | `v24.16.0` |
| npm | `11.13.0` |
| `DATABASE_URL` | not present in local shell |
| `SUPABASE_DB_PASSWORD` | not present in local shell |
| Browser smoke engine | System Chrome, with same-origin admin APIs mocked and provider hosts blocked |

## E. Routes And Pages Tested

The browser smoke used Vite in local dev mode with mocked `/api/**` responses and a network guard for known provider/live execution hosts. The smoke verified status 200, no console errors, no `publicUrl` exposure, no `signedUrl` exposure, no signed/public URL persistence in localStorage/sessionStorage, and no provider/live execution requests.

| Route | Result | Notes |
|---|---|---|
| `/admin` | pass | Redirected/loaded through the admin dashboard path without crash. |
| `/admin/dashboard` | pass | Dashboard loaded; Production House category present by static check. |
| `/admin/production-house` | pass | Production House page loaded without crash under safe mocks. |
| `/admin/3d-assets` | pass | 3D asset library page loaded without crash. |
| `/admin/3d-rigs` | pass | 3D rigs page loaded without crash. |
| `/admin/avatar-rig-preview` | pass | Avatar rig preview page loaded without crash; no provider/render path enabled. |
| `/admin/r3f-preview-sandbox` | pass | R3F sandbox loaded; demo GLB toggle defaulted OFF (`aria-checked=false`). |
| `/admin/permanent-avatars` | pass | Permanent-avatar list loaded without crash; preview signed URLs were not persisted. |
| `/admin/permanent-avatars/new` | pass | Permanent-avatar create page loaded without crash. |

## F. Dashboard Card Wiring

Static route checks confirmed `client/src/pages/admin/AdminDashboard.tsx` defines the Production House category and `client/src/App.tsx` registers every linked target.

| Production House Unit | Dashboard Card | Route | Route Registered | Safety Posture |
|---|---|---|---|---|
| Production House Console | yes | `/admin/production-house` | yes | admin-only operations console |
| Video Render | yes | `/admin/video-render` | yes | dry-run planning only |
| Voice Jobs | yes | `/admin/voice-jobs` | yes | manual/mock fallback review |
| AI Jobs | yes | `/admin/ai-jobs` | yes | admin-only monitor |
| AI Workers | yes | `/admin/ai-workers` | yes | admin-only capacity/status |
| AI Ops | yes | `/admin/ai-ops` | yes | admin-only operations overview |
| AI Retention | yes | `/admin/ai-retention` | yes | admin-only retention posture |
| Build Queue / Readiness | yes | `/admin/build-queue` | yes | dry-run readiness/build status |

## G. Backend/API Safety Checks

| Invariant | Result | Evidence |
|---|---|---|
| Permanent avatar APIs require admin/root-admin auth | pass | `server/routes/admin/permanent-avatars.ts` uses admin/root-admin route guards. |
| Unsafe permanent-avatar routes require CSRF | pass | Mutating permanent-avatar route surface uses CSRF-gated admin middleware paths. |
| Permanent avatar approval cannot become `approved_public` | pass | Runtime code and schema use `approved_internal`; `approved_public` appeared only in comments/docs/tests or negative UI text. |
| Production asset archive is blocked when referenced by a permanent avatar | pass by code review | `server/routes/admin/production-assets.ts` returns `asset_referenced_by_permanent_avatar` before archive. |
| Production rig archive is blocked when referenced by a permanent avatar | pass by code review | `server/routes/admin/production-rigs.ts` returns `rig_referenced_by_permanent_avatar` before archive. |
| Preview-bundle signed URLs are short-lived and not persisted | pass by code review | `MAX_SIGNED_URL_TTL = 900`; audit payload stores TTL/expiresAt metadata, not signed URLs. |
| Provider isolation tests still pass | pass | `tests/permanent-avatars-routes-provider-isolation.test.ts` passed 4/4. |

## H. R3F/3D/4D Safety Checks

| Check | Result |
|---|---|
| R3F sandbox loads with default scene | pass under mocked browser smoke |
| Demo GLB toggle defaults OFF | pass |
| 3D assets page loads | pass |
| 3D rigs page loads | pass |
| Avatar rig preview page loads | pass |
| Permanent-avatar pages load | pass |
| No browser/client provider env calls found in inspected R3F/avatar/permanent-avatar files | pass |
| No page exposes `publicUrl` in smoke output | pass |
| No signed URL is persisted in storage | pass |
| No render execution path enabled | pass |
| No live runner path enabled | pass |
| No Unreal execution path enabled | pass |
| No Cinema 4D execution path enabled | pass |
| No Unity execution path enabled | pass |
| No 4D hardware path enabled | pass |
| No publishing path enabled | pass |

## I. Commands Run

| Command | Status | Notes |
|---|---|---|
| `git status --short --branch` | pass | Branch clean before report work. |
| `git rev-parse HEAD` | pass | Tested commit `d118ea98e64a2cb13cdbe41a027a58a9c7e162c3`. |
| `node --version` | pass | `v24.16.0`. |
| `npm --version` | pass | `11.13.0`. |
| `[System.Environment]::OSVersion.VersionString` | pass | `Microsoft Windows NT 10.0.26100.0`. |
| `node .\node_modules\typescript\bin\tsc --noEmit` | pass | Full TypeScript check passed. |
| `node scripts/safety-lint.cjs` | pass | `safety-lint: OK (scanned 670 files)`. |
| `npm run test:local` | pass | 145 tests passed, 0 failed. |
| `node scripts/r10-perf-budget-check.mjs` | pass | R3F source gzip and demo GLB under budget. |
| `npm run build` | pass | Client/server build passed; Vite emitted only large-chunk warnings. |
| `node .\node_modules\@playwright\test\cli.js test --list` | pass | Listed 47 Playwright tests in 14 files. |
| `node .\node_modules\@playwright\test\cli.js test tests/e2e/production-house-wiring.spec.ts --project=chromium --no-deps` | pass | 5 passed, 2 skipped by explicit runtime gate. |
| `NODE_ENV=test tsx --test --test-force-exit --test-concurrency=1 tests/permanent-avatars-routes-provider-isolation.test.ts` | pass | 4/4 provider-isolation checks passed. |
| `NODE_ENV=test tsx --test --test-force-exit --test-concurrency=1 tests/production-house.test.ts` | fail | 458 passed, 6 failed; details below. |
| `NODE_ENV=test tsx --test --test-force-exit --test-concurrency=1 tests/r10-r3f-3d-4d-runtime-routes.test.ts` | blocked | Imports Supabase DB config and fails without `SUPABASE_DB_PASSWORD`; not safe to supply Supabase Pro credentials for this task. |
| Local Vite + system Chrome smoke with mocked `/api/**` | pass | All target routes loaded, no console errors, no provider calls, no URL persistence. |

## J. Targeted Test Results

### Passing

- `npm run test:local`: 145/145 passed.
- `tests/permanent-avatars-routes-provider-isolation.test.ts`: 4/4 passed.
- `tests/e2e/production-house-wiring.spec.ts`: 5 passed, 2 skipped by safe runtime gate.

### Failing

`tests/production-house.test.ts` failed 6 tests:

```text
tests\production-house.test.ts:5672
rejects when bridge mode is not dry_run
AssertionError [ERR_ASSERTION]: assert.ok((await r.json()).errorCodes.includes("mode_not_dry_run"))
```

```text
tests\production-house.test.ts:6043
export/full includes realUnrealSetPanelsDryRunHistory mapping
TypeError: Cannot read properties of undefined (reading 'realUnrealSetPanelsDryRunHistory')
```

```text
audit route emits set_panels lifecycle events
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

```text
tests\production-house.test.ts:6276
send-dry-run rejects when bridge mode is not dry_run
AssertionError [ERR_ASSERTION]: assert.ok(j.errorCodes.includes("mode_not_dry_run"))
```

```text
tests\production-house.test.ts:6302
send-dry-run rejects when approval stage is not unreal_sandbox_approved
AssertionError [ERR_ASSERTION]: assert.ok(j.errorCodes.includes("approval_stage_not_allowed"))
```

```text
tests\production-house.test.ts:6611
export/full includes realUnrealRenderPreviewContractHistory mapping
TypeError: Cannot read properties of undefined (reading 'realUnrealRenderPreviewContractHistory')
```

These look like real Production House dry-run guard/export/audit mapping blockers. They were not fixed in this smoke-test-only task.

### Skipped Or Blocked

- `tests/production-asset-delete-archived.test.ts`: skipped because it creates/deletes DB rows through the real DB path.
- `tests/r7b-e2e-cleanup-preview-eligibility.test.ts`: skipped because it creates/seeds/deletes DB rows through the real DB path.
- `tests/e2e/permanent-avatars.spec.ts`: skipped because it is a full browser E2E that writes uploads/creates/archives/deletes and requires a safe staging/local DB target.
- `tests/r10-r3f-3d-4d-runtime-routes.test.ts`: blocked by missing `SUPABASE_DB_PASSWORD` during DB-bound route import; Supabase Pro credentials were not requested or used.

## K. Grep And Static Safety Results

- Provider/env grep across R3F/avatar/permanent-avatar client surfaces found no hardcoded provider hosts or browser env provider calls.
- `approved_public` grep found only comments, docs, tests, or negative UI copy; no live accepted state.
- `publicUrl`/`signedUrl` grep showed React state and comments only for the inspected preview surfaces; no localStorage, sessionStorage, cookie, route-state, or form-state persistence.
- Render/live/publish/Unreal/Cinema 4D/Unity/4D hardware grep found safety badge/invariant text and tests, not enabled execution in the inspected admin surfaces.

## L. Supabase And Provider Safety Status

| Safety Item | Status |
|---|---|
| Database commands run | none |
| Supabase Pro writes | none |
| Supabase Pro secrets requested or printed | none |
| `DATABASE_URL` exposed | no |
| Supabase keys/passwords/tokens exposed | no |
| Provider calls from browser/client smoke | none observed |
| Live render/voice/avatar/AI worker calls | none |
| Publishing calls | none |
| Unreal/Cinema 4D/Unity/4D hardware execution | none |

## M. Code Change Status

No app code, tests, schemas, migrations, workflows, provider settings, secrets, or runtime behavior were changed by this task.

Intentional files changed for reporting only:

- `docs/reports/CODEX_PRODUCTION_HOUSE_SMOKE_TEST_REPORT.md`
- `docs/library/INDEX.md`

## N. Failures And Blockers

1. `tests/production-house.test.ts` has 6 failing dry-run/export/audit assertions in the real Unreal set-panels/render-preview dry-run areas.
2. DB-backed tests cannot be safely run until a local Postgres or separate staging Supabase target is configured and approved.
3. The runtime R10 route test currently imports the Supabase DB config path and blocks without `SUPABASE_DB_PASSWORD`; it should be split or harnessed so the safe subset can run without live DB credentials.
4. Full permanent-avatar browser E2E remains skipped until a non-production writable E2E target exists.

## O. Recommended Next Fixes

1. Open a separate MOUGLE-PR-G branch to fix the 6 failing `tests/production-house.test.ts` cases around dry-run rejection codes, audit route JSON behavior, and export/full history mappings.
2. Add or adjust a hermetic R10 runtime-route harness so it does not import Supabase DB configuration for local-safe smoke checks.
3. Provision a separate staging Supabase project or local Postgres test DB for DB-backed permanent-avatar archive/cleanup/E2E tests.
4. Keep Supabase Pro protected: do not use it as a writable E2E target and do not add Supabase Pro secrets to default CI.

## P. Final Verdict

Not approved yet.

The admin/Production House/R3F/avatar pages load safely under mocked local browser smoke, the core no-provider/no-render/no-publish/no-public-URL safety posture holds, and build/local-safe checks pass. The area still has targeted Production House test failures and unrun DB-backed API/E2E coverage that require separate safe fix and staging/local DB work before full approval.

## Q. Approval Checklist

| Approval Requirement | Status |
|---|---|
| Build passes | pass |
| Targeted tests pass | fail, due `tests/production-house.test.ts` |
| Production House/admin pages load | pass under mocked local browser smoke |
| R3F/avatar safety invariants hold | pass |
| No provider/render/publish/live/Unreal/Cinema 4D/Unity/4D path enabled | pass |
| DB-backed safety tests run on safe local/staging DB | blocked, no safe DB target configured |

## R. Intentionally Deferred Work

- No production bug fixes were made in this smoke-test-only branch.
- No DB-backed tests were run without an approved local/staging DB target.
- No Playwright runtime E2E was pointed at Supabase Pro.
- No browser dependency installation was performed.

## S. PR Follow-Up Suggestion

Suggested next task label: MOUGLE-PR-G.

Suggested title: `MOUGLE-PR-G: Fix Production House dry-run test blockers`.

Suggested scope: repair the 6 failing `tests/production-house.test.ts` assertions without enabling real provider/render/live execution, then rerun local-safe checks and targeted Production House tests.

## T. Safety Confirmation

This task did not modify application behavior, schemas, migrations, provider configuration, workflow files, or secrets. It produced this report and the documentation-library index entry only.
