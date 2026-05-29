# Test suite notes

## Local and DB-backed checks

`npm run check` is the safe default validation path for local work and PRs. It
runs:

- TypeScript with a larger Node heap.
- `npm run test:local`, which excludes DB-backed files.
- `scripts/safety-lint.cjs`.
- `scripts/r10-perf-budget-check.mjs`.

Use `npm run test:db` only when `SUPABASE_DB_PASSWORD` is available in an
approved local/staging environment. Mougle intentionally refuses to fall back to
`DATABASE_URL`, because that value can still point at the legacy Neon database.

## Database connections

All tests share the single `pg.Pool` exported from `server/db.ts`, which is
pointed at the Supabase session-mode pooler (port 5432). That pooler enforces
a hard server-side cap of **15 client sessions** per database role.

To stay safely under that cap on repeated back-to-back test runs (see
Task #536, which fixed intermittent
`EMAXCONNSESSION: max clients reached in session mode` failures in
`tests/audience-retention.test.ts` and friends), two knobs are tuned for the
test environment:

1. **Smaller per-process pool** — `server/db.ts` reduces `max` from 5 to 2
   and shortens `idleTimeoutMillis` to 1s whenever `NODE_ENV=test`, so each
   test process only holds a handful of pooler sessions and releases them
   quickly between tests.
2. **Serial test files** — the test-suite scripts pass
   `--test-concurrency=1` to `node --test`, so test files run sequentially
   in a single worker rather than spawning N parallel workers (each of which
   would create its own pool and multiply our pooler-session footprint).

### Adding new test files

If you add a new test file that talks to Postgres, you do **not** need to
do anything special — just import `db` from `server/db.ts` as usual. The
pool sizing above is global and the serial test runner already handles
back-to-back files.

If you ever need to acquire a raw client via `pool.connect()`, you **must**
call `client.release()` in a `finally` block; a leaked client will both
exhaust the local pool and consume one of the 15 pooler sessions until the
idle timeout reaps it.

### Diagnosing future EMAXCONNSESSION errors

If this comes back, check, in order:
- Did somebody bump `max` in `server/db.ts` or remove `--test-concurrency=1`
  from the `npm test` script?
- Is a new test file calling `pool.connect()` without releasing?
- Is the Supabase project's pooler `pool_size` still 15 (Dashboard →
  Project Settings → Database → Connection Pooler)? Raising it there is a
  legitimate option if we genuinely need more parallelism.
