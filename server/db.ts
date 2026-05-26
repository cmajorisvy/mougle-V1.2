import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { resolveSupabaseDatabaseUrl } from "./config/supabase-db";

const databaseUrl = resolveSupabaseDatabaseUrl();
console.log("[db] Using Supabase Postgres (sslmode=require)");

// The Supabase pooler enforces a hard server-side cap of 15 client sessions
// in session mode (port 5432). Production runs a single long-lived process
// where node-postgres's default pool size (max=10) is fine, but the test
// suite is much more aggressive:
//   * `node --test` can run multiple test files in parallel worker processes,
//     each of which imports this module and creates its own `Pool`. With the
//     default max=10 just two parallel workers can already exhaust the
//     pooler's 15-session cap and produce intermittent EMAXCONNSESSION
//     failures in unrelated `beforeEach` hooks (see Task #536).
//   * Long-running test files (e.g. `tests/audience-retention.test.ts`) burst
//     many concurrent inserts during `seedOld(...)`, which can hold several
//     pooler sessions for the duration of a test.
//
// To keep the test footprint small and predictable we shrink the pool size
// and shorten the idle timeout when NODE_ENV=test so each test process only
// holds a handful of pooler sessions and releases them quickly between
// tests. The `npm test` script also passes `--test-concurrency=1` so test
// files run sequentially within a single worker; together these two knobs
// keep us well under the 15-session pooler cap on repeated back-to-back runs.
//
// Task #729: the audience-audit tests are particularly burst-heavy and
// flaked with EMAXCONNSESSION when the dev workflow ran in parallel. We
// dropped the default test pool from 3 -> 2 (leaving 13 sessions for the
// dev workflow + Supabase overhead) and exposed `TEST_DB_POOL_MAX` so a
// noisier dev workflow can dial it down further without a code change.
const isTest = process.env.NODE_ENV === "test";

function resolveTestPoolMax(): number {
  const raw = process.env.TEST_DB_POOL_MAX;
  if (!raw) return 2;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 2;
  // Hard cap at 5: a single test process should never need more than
  // a handful of pooler sessions, and going higher risks colliding
  // with the dev workflow under the Supabase 15-session cap.
  return Math.min(parsed, 5);
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: isTest ? resolveTestPoolMax() : 5,
  idleTimeoutMillis: isTest ? 1_000 : 10_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });
