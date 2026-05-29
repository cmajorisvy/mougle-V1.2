/**
 * Task #729 — DB pool sizing & test stability notes for the
 * audience-audit suite.
 *
 * Symptom: when the `Start application` workflow ran concurrently
 * with `tests/audience-audit-history-email-stale-alert.test.ts`, the
 * Supabase session-mode pooler (hard cap: 15 client sessions on
 * port 5432) hit EMAXCONNSESSION and unrelated `beforeEach` hooks
 * flaked.
 *
 * Root cause: 10 sessions held by the dev workflow's pool
 * (`max: 10`) + 3 held by the test process (`max: 3`) + Supabase's
 * own internal sessions could briefly nudge the connection count
 * past 15 during burst-heavy audience-audit tests.
 *
 * Fix:
 *   1. `server/db.ts` shrinks the test pool default to `max: 2`
 *      (instead of 3) and accepts a `TEST_DB_POOL_MAX` env override
 *      so ops can dial it down further if a noisier dev workflow
 *      reproduces the issue. Idle timeout stays at 1s so the pool
 *      reaps freed sessions back to the Supabase pooler quickly
 *      between tests.
 *   2. The three audience-audit DB-heavy files import this module
 *      so the rationale is searchable from each test file and the
 *      pattern is greppable for future audience-audit additions.
 *
 * We deliberately do NOT call `pool.end()` per file. tsx --test runs
 * every file in a single process, so ending the pool mid-suite would
 * break every sibling file. `npm test` uses `--test-force-exit`
 * already; the pool is torn down with the process on completion.
 *
 * If a future audience-audit file routinely opens many concurrent
 * DB clients (e.g. seedOld-style bursts), add an explicit
 * `afterEach` that `await`s every in-flight query before returning —
 * node-postgres releases the connection back to the pool as soon as
 * the awaited promise resolves.
 */

export {}; // module marker — no runtime exports needed.
