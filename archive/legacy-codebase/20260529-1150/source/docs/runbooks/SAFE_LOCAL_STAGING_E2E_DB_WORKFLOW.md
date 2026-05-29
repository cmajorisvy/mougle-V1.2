# Safe Local And Staging DB E2E Workflow

## Purpose

This runbook defines the safe path for Mougle E2E and integration tests that need a database. Supabase Pro is protected and must never be used as a writable test target from local, Replit, CI, or browser automation.

## Non-Negotiable Rules

- No E2E, integration, seed, cleanup, or reset test may write to Supabase Pro.
- Do not run `db:push`, `drizzle-kit push`, or `supabase db push` against production.
- Do not run `DROP`, `TRUNCATE`, reset, restore, or seed overwrite against Supabase Pro.
- Do not expose `DATABASE_URL`, Supabase keys, tokens, passwords, or service-role credentials in logs, reports, screenshots, or PR bodies.
- Database changes must use journaled migration files and an approved migration path.

## Approved Test Targets

Use one of these targets for DB-backed E2E:

1. Local Postgres created specifically for test runs.
2. A separate staging Supabase project with isolated credentials and disposable test data.

The target must be visibly distinct from production in project name, URL, dashboard, and environment variable naming.

## Required Environment

Set only redacted, test-safe values in local or CI secrets:

- `DATABASE_URL=<redacted local or staging database URL>`
- `SESSION_SECRET=<redacted test value>`
- `E2E_ADMIN_USERNAME=<redacted test admin>`
- `E2E_ADMIN_PASSWORD=<redacted test password>`
- `SUPABASE_URL=<redacted staging URL, if required>`
- `SUPABASE_ANON_KEY=<redacted staging anon key, if required>`
- `SUPABASE_SERVICE_ROLE_KEY=<redacted staging service role key, only when explicitly required and approved>`

Never paste the raw values into reports or terminal summaries.

## Migration Discipline

1. Generate or select the journaled migration files needed for the feature.
2. Review the SQL before applying it to any shared environment.
3. Apply migrations only to the local or staging test target.
4. Record the migration filenames and target class in the test report.
5. Do not use schema push commands as a substitute for migrations.

## Suggested Flow

1. Confirm the active branch is not `main`.
2. Confirm the DB target is local or staging, not Supabase Pro.
3. Apply only the approved journaled migrations to that target.
4. Create deterministic test data through test helpers or admin-only fixtures.
5. Run DB-backed integration/E2E tests against the local or staging target.
6. Tear down only the test data owned by the run.
7. Report command names, pass/fail status, migration filenames, and redacted target class.

## Command Split

- `npm run test:local` is the safe local Node test subset and excludes known DB-backed tests.
- `npm run test:db` is reserved for DB-backed Node tests and must only run against a confirmed local or staging database.
- `npm run test:e2e` runs Playwright and must only use local/mock/staging-safe services.

## Pre-Run Checklist

- Confirm no command points at Supabase Pro.
- Confirm all secrets are redacted from terminal output and reports.
- Confirm production schema changes are not being applied.
- Confirm no destructive SQL or seed overwrite command is part of the run.
- Confirm browser tests cannot reach provider hosts unless the spec explicitly stubs or forbids them.
