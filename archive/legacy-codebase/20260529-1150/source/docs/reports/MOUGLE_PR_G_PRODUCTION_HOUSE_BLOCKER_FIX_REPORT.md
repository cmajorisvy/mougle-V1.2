# MOUGLE-PR-G Production House Blocker Fix Report

## A. Executive Summary

MOUGLE-PR-G fixes the six targeted `tests/production-house.test.ts` blockers identified during MOUGLE-PR-F. The fix is intentionally test-only: no Production House runtime behavior, schema, migration, provider, render, publishing, live runner, Unreal, Cinema 4D, Unity, or 4D hardware path was changed or enabled.

Root cause was assertion drift in the tests. The current implementation already fails closed safely, but the failing assertions expected older response shapes or narrower error codes than the registered routes and safety validator now return.

Final validation is green for the requested safe local commands.

## B. Branch And Commit

| Item | Value |
|---|---|
| Branch | `codex/mougle-pr-g-production-house-targeted-blocker-fix` |
| Base context | Branched from MOUGLE-PR-F report branch because PR-F was not merged into `main` locally. |
| Base commit at task start | `b6fc3906733c48763dbbd1ffa498e34ba532d18a` |
| Final commit | Branch HEAD after commit; exact SHA reported in the task final response because a Git commit cannot embed its own final hash. |

## C. Files Changed

| File | Change |
|---|---|
| `tests/production-house.test.ts` | Updated six stale assertions around forbidden bridge mode, render-preview local approval validation, full export payload shape, and audit route response shape. |
| `docs/reports/MOUGLE_PR_G_PRODUCTION_HOUSE_BLOCKER_FIX_REPORT.md` | Added this validation report. |
| `docs/library/INDEX.md` | Added the new report to the documentation library index. |

## D. Exact Failing Assertions Fixed

| Previous Failure | Root Cause | Fix |
|---|---|---|
| `tests/production-house.test.ts:5672` expected `mode_not_dry_run` for set-panels with `UNREAL_BRIDGE_MODE=production`. | Current safety validator rejects `production` earlier as a forbidden invalid mode. | Assert `mode_forbidden`, preserving fail-closed behavior. |
| `tests/production-house.test.ts:6043` read `j.export.realUnrealSetPanelsDryRunHistory`. | `/productions/:id/export/full` sends the full export payload directly, matching neighboring prepare/camera/lighting tests. | Read `j.realUnrealSetPanelsDryRunHistory`. |
| `tests/production-house.test.ts:6061` fetched `/api/admin/production-house/audit-log` and expected `entries`. | Registered route is `/api/admin/production-house/audit?limit=...` and response uses `events`. | Fetch `/audit?limit=500` and read `events`. |
| `tests/production-house.test.ts:6276` expected `mode_not_dry_run` for render-preview with `UNREAL_BRIDGE_MODE=production`. | Current safety validator rejects `production` earlier as `mode_forbidden`. | Assert `mode_forbidden`, preserving fail-closed behavior. |
| `tests/production-house.test.ts:6302` expected `approval_stage_not_allowed` from the render-preview route. | The route performs local validation before the chained render-preview gate; an unapproved production is rejected as `local_validation_failed` with `approval_stage` in `errorCodes`. | Assert `approval_stage`, the route-level local validation failure. |
| `tests/production-house.test.ts:6611` read `j.payload.realUnrealRenderPreviewContractHistory`. | `/productions/:id/export/full` sends the full export payload directly. | Read `j.realUnrealRenderPreviewContractHistory`. |

## E. Commands Run

| Command | Status | Result |
|---|---|---|
| `git status --short --branch` | pass | Branch clean before edits; later showed only intended test/report/index files. |
| Read `docs/reports/CODEX_PRODUCTION_HOUSE_SMOKE_TEST_REPORT.md` | pass | Confirmed the six PR-F failures. |
| Static inspection with `rg` and file reads | pass | Mapped failing assertions to route/service/export implementations. |
| Six-test focused run before fix | fail expected | Reproduced 6/6 failures. |
| Six-test focused run after fix | pass | 6 passed, 0 failed. |
| `npm run build` | pass | Client and server built successfully; Vite emitted existing large-chunk warnings only. |
| `node scripts/safety-lint.cjs` | pass | `safety-lint: OK (scanned 670 files)`. |
| `npm run test:local` | pass | 145 passed, 0 failed. |
| `tests/production-house.test.ts` | pass | 464 passed, 0 failed. |
| `tests/permanent-avatars-routes-provider-isolation.test.ts` | pass | 4 passed, 0 failed. |
| Production House Playwright static-safe spec | pass | 5 passed, 2 runtime-gated tests skipped. |

## F. Test Result Summary

| Test Area | Result |
|---|---|
| Targeted six assertions | pass |
| Full Production House Node suite | pass: 464/464 |
| Safe local test suite | pass: 145/145 |
| Provider isolation | pass: 4/4 |
| Production House Playwright static-safe wiring | pass: 5 passed, 2 skipped |
| Build | pass |
| Safety lint | pass |

## G. Safety Confirmation

| Safety Item | Status |
|---|---|
| Database writes | none |
| Supabase Pro use | none |
| Migrations/schema changes | none |
| Provider calls | none |
| Rendering enabled | no |
| Publishing enabled | no |
| Live runner enabled | no |
| Unreal execution enabled | no |
| Cinema 4D execution enabled | no |
| Unity execution enabled | no |
| 4D hardware enabled | no |
| Secrets exposed | no |

## H. Behavior Impact

No production behavior changed. The only functional file changed is a test file, and the assertions now match the existing safe route contracts:

- forbidden live/production bridge mode remains rejected;
- unapproved render-preview dry-run remains rejected before any network/provider/render action;
- full export remains direct JSON payload;
- audit route remains `/audit` with `events`.

## I. Remaining Blockers

No remaining blocker from the six MOUGLE-PR-F targeted Production House assertions. DB-backed permanent-avatar and full runtime E2E coverage still require a separate approved local/staging database strategy and remain outside this task.

## J. Final Verdict

Ready with caveats.

The targeted Production House blockers are fixed and all requested safe checks pass. The caveat is unchanged from prior reports: writable DB-backed E2E must stay off Supabase Pro and needs a separate local/staging DB workflow.
