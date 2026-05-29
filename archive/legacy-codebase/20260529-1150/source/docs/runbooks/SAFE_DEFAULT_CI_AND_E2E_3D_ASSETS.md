# Safe Default CI And 3D Asset E2E Workflow

## Purpose

This runbook documents the safe-by-default CI posture for Mougle main and pull request checks. Default CI must prove type safety, safety linting, local-safe tests, 3D/R3F static budgets, and build readiness without requiring Supabase Pro secrets or writable production services.

## Default CI

The default `test` workflow runs only local-safe checks:

- `npx tsc --noEmit`
- `node scripts/safety-lint.cjs`
- `npm run test:local`
- `node scripts/r10-perf-budget-check.mjs`
- `npm run build`

It must not run full `npm test` by default because that command includes DB-backed paths that require explicit database configuration.

## 3D Asset E2E Defaults

The default `e2e-3d-assets` workflow runs safe static checks first:

- R10 perf budget.
- Playwright `--list`.
- `tests/e2e/production-house-wiring.spec.ts` when that static-safe spec exists on the checked-out revision.

Runtime browser E2E is not part of the default path. Missing admin E2E secrets must produce a clear notice and skip runtime Playwright instead of failing default pushes.

## Runtime E2E Gate

Runtime 3D asset Playwright may run only when all of these are true:

- Repository variable `RUN_3D_ASSETS_RUNTIME_E2E` is set to `1`.
- Repository secrets `E2E_ADMIN_PASSWORD` and `E2E_ADMIN_PASSWORD_HASH` are configured with test-only values.
- The database target is local or staging-safe, never Supabase Pro.
- Provider calls remain stubbed, blocked, or test-safe.

## Database Safety

Supabase Pro is protected.

- Do not add Supabase Pro credentials to GitHub Actions.
- Do not use Supabase Pro as a writable E2E target.
- Do not run `db:push`, `drizzle-kit push`, `supabase db push`, destructive SQL, reset, restore, or seed overwrite against Supabase Pro.
- Runtime CI database preparation must target only a disposable local CI Postgres service or a separately approved staging database.
- Any production database change must use an approved journaled migration path.

## Secret Handling

- Never print admin passwords, password hashes, database URLs, Supabase keys, provider keys, tokens, cookies, or service-role credentials.
- Reports and PR bodies should describe secret presence or absence only.
- CI notices should name missing secret keys but never echo values.

## Operator Checklist

Before enabling runtime 3D asset E2E:

1. Confirm the workflow is running on a branch or PR, not as an ad-hoc production mutation.
2. Confirm the runtime DB target is disposable local CI Postgres or approved staging.
3. Confirm `RUN_3D_ASSETS_RUNTIME_E2E=1` is intentional.
4. Confirm test-only admin credentials are configured.
5. Confirm provider calls cannot reach live services.
6. Confirm Supabase Pro credentials are not present in the workflow environment.
