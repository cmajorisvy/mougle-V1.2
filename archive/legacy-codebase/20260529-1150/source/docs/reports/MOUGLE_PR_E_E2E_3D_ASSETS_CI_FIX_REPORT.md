# MOUGLE-PR-E E2E 3D Assets CI Fix Report

## Executive Summary

MOUGLE-PR-E repairs the visible GitHub Actions red X on `main` by making default CI safe-by-default.

The confirmed failures were:

- `e2e-3d-assets` failed before Playwright ran because `E2E_ADMIN_PASSWORD` and `E2E_ADMIN_PASSWORD_HASH` were not configured as repository secrets.
- `test / npm test` was cancelled after the 20-minute workflow timeout because full `npm test` enters Supabase-backed DB paths and repeatedly fails without `SUPABASE_DB_PASSWORD`.

This PR changes the default CI path so it does not depend on Supabase Pro, live provider calls, or runtime E2E secrets. Runtime 3D asset E2E is still available behind an explicit gate and test-only secrets.

Final verdict: ready with caveats. Default CI is safe/local. Runtime E2E remains opt-in and must only target disposable local CI Postgres or an approved staging database, never Supabase Pro.

## Branch And Commit

- Branch: `codex/mougle-pr-e-fix-e2e-3d-assets-ci`
- Base: latest `main` at branch creation.
- Final commit SHA: reported after commit because a commit cannot contain its own final SHA without changing it.

## Files Changed

- `.github/workflows/test.yml`
- `.github/workflows/e2e-3d-assets.yml`
- `docs/runbooks/SAFE_DEFAULT_CI_AND_E2E_3D_ASSETS.md`
- `docs/reports/MOUGLE_PR_E_E2E_3D_ASSETS_CI_FIX_REPORT.md`

## Workflow Changes

### `test.yml`

Before:

- Ran full `npm test`, which includes DB-backed paths and timed out on missing `SUPABASE_DB_PASSWORD`.

After:

- Runs `npx tsc --noEmit`.
- Runs `node scripts/safety-lint.cjs`.
- Runs `npm run test:local`.
- Runs `node scripts/r10-perf-budget-check.mjs`.
- Runs `npm run build`.

This keeps default CI aligned with the safe local checks introduced in MOUGLE-PR-C.

### `e2e-3d-assets.yml`

Before:

- Failed fast when runtime E2E admin secrets were missing.
- Skipped all later static checks after the missing-secret failure.
- Included runtime DB/app/Playwright steps in the default job path.

After:

- Adds a `static-safe` job that runs without runtime E2E secrets:
  - `node scripts/r10-perf-budget-check.mjs`
  - `npx playwright test --list`
  - `tests/e2e/production-house-wiring.spec.ts` when present on the checked-out revision
- Adds a `runtime-e2e` job that is explicitly gated:
  - Skips with a notice unless `RUN_3D_ASSETS_RUNTIME_E2E=1`.
  - Skips with a notice if `E2E_ADMIN_PASSWORD` or `E2E_ADMIN_PASSWORD_HASH` is missing.
  - Refuses runtime execution unless `DATABASE_URL` points at the disposable local CI Postgres service.

## Supabase And Provider Safety

- No Supabase Pro secrets were added.
- Default CI does not require Supabase Pro.
- Default CI does not run DB-backed test paths.
- Default CI does not run runtime Playwright.
- Default CI does not make live provider calls.
- Runtime E2E remains opt-in and must not use Supabase Pro as a writable target.

## Documentation Added

Added `docs/runbooks/SAFE_DEFAULT_CI_AND_E2E_3D_ASSETS.md`, documenting:

- Default CI safe/local checks.
- Runtime 3D asset E2E gate.
- Required test-only admin secrets.
- Supabase Pro protection rules.
- Secret redaction expectations.
- Operator checklist before enabling runtime E2E.

## Validation Plan

Run safe local checks only:

- `tsc --noEmit`
- `node scripts/safety-lint.cjs`
- `npm run test:local`
- `node scripts/r10-perf-budget-check.mjs`
- `npm run build`
- Playwright `--list`
- Targeted static-safe Playwright specs if available

## Validation Results

| Command | Status | Notes |
| --- | --- | --- |
| `tsc --noEmit` | Pass | Ran via the local TypeScript binary with Node 24. |
| `node scripts/safety-lint.cjs` | Pass | `safety-lint: OK (scanned 670 files)`. |
| `npm run test:local` | Pass | 145 tests passed; no DB-backed suite was run. |
| `node scripts/r10-perf-budget-check.mjs` | Pass | R10 perf budget passed. |
| `npm run build` | Pass after sandbox escalation | Initial sandbox run hit a local path access denial; approved rerun passed. Existing Vite large-chunk warning remains. |
| Playwright `--list` | Pass | Listed 40 tests in 13 files. |
| `tests/e2e/production-house-wiring.spec.ts` | Skipped | The PR-D static-safe spec is not present on this branch; the workflow emits a notice and runs it when present. |

No database commands were run during validation.

## Remaining Caveats

- `tests/e2e/production-house-wiring.spec.ts` exists on MOUGLE-PR-D but is not yet on `main` at this branch point. The E2E workflow checks for it and runs it when present; otherwise it emits a notice and continues with Playwright `--list` plus R10 static/perf coverage.
- Full runtime 3D asset E2E is intentionally not part of default CI. It requires explicit runtime gating and test-only secrets.
- Runtime schema preparation must remain constrained to local/staging-safe databases and must never target Supabase Pro.

## Final Verdict

Ready with caveats.

The default `main` CI path is safe/local and should no longer fail because runtime E2E admin secrets or Supabase Pro secrets are absent.
