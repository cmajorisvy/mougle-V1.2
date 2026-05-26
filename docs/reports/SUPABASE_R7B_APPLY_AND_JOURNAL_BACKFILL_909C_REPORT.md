# Supabase R7B Apply + Drizzle Journal Backfill — Task #909C Report

**Date:** 2026‑05‑22
**Task:** #909 (Option C) — apply only `migrations/0004_r7b_permanent_avatars.sql` to Supabase Pro, then create and backfill `drizzle.__drizzle_migrations` with the exact on‑disk migration hashes and the exact `when` timestamps from `migrations/meta/_journal.json`.
**Predecessor reports:** [`GITHUB_SUPABASE_SYNC_CHECKPOINT_REPORT.md`](GITHUB_SUPABASE_SYNC_CHECKPOINT_REPORT.md), [`R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md`](R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md).
**Executor:** `.local/scripts/909c-execute.ts` (single‑shot script: pre‑flight + Step 1 in one tx + Step 2 in one tx + full verification, idempotent‑safe via preconditions).

---

## 1. Hard rules honoured

| Rule | Honoured? |
|---|---|
| No `npx drizzle-kit migrate` as‑is before journal repair | ✅ — Step 1 SQL applied directly; migrate never invoked |
| No `drizzle-kit push` | ✅ |
| No `db:push` | ✅ |
| No `supabase db push` | ✅ (no `supabase/migrations/` in repo) |
| No overwriting Supabase Pro from Replit/local/dev | ✅ — additive DDL only |
| No DROP, TRUNCATE, destructive ALTER, reset, seed overwrite, restore | ✅ — Step 1 is plain `CREATE TABLE` / FK / index / trigger; Step 2 is `CREATE SCHEMA`/`CREATE TABLE IF NOT EXISTS` + 5 `INSERT`s |
| No exposing `DATABASE_URL` / Supabase keys / password / tokens | ✅ — all command output piped through `sed -E "s\|${SUPABASE_DB_PASSWORD}\|***PWD***\|g; s\|postgres\\.[a-z0-9]+:[^@]+@\|postgres.***:***@\|g"`; no secret appears in this report |
| No schema/code/route/UI/dependency/storage/secret edits | ✅ — only new files: this report, an executor script, and doc index/checkpoint updates |

## 2. Pre-flight (read‑only) — PASS

| Probe | Result |
|---|---|
| `SUPABASE_DB_PASSWORD` present | ✅ |
| Resolver | `server/config/supabase-db.ts::resolveSupabaseDatabaseUrl()` — project ref `commiqirdcgwagdmmvvm`, pooler host `aws-1-us-east-1.pooler.supabase.com:5432`, TLS enforced via `Pool.ssl`, Neon‑host guard active |
| Connected | ✅ `postgres` / `postgres` / PostgreSQL **17.6** |
| `drizzle.__drizzle_migrations` BEFORE | **missing** (`relation "drizzle.__drizzle_migrations" does not exist`) |
| R7B avatar tables BEFORE (`permanent_avatars`, `permanent_avatar_audit_log`, `permanent_avatar_tombstones`) | all **missing** ✅ matches precondition |
| Orphan‑sweep tables BEFORE (4 in 0004_r7b's `IF NOT EXISTS` block) | all **present** (drift from earlier `drizzle-kit push`) |
| Drizzle hashing scheme | Verified against `node_modules/drizzle-orm/migrator.js::readMigrationFiles()` → `crypto.createHash("sha256").update(<full file utf8>).digest("hex")` |
| Drizzle migration table DDL | Verified against `node_modules/drizzle-orm/pg-core/dialect.js::migrate()` → `drizzle.__drizzle_migrations(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`; insert SQL: `insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)` |
| Drizzle pending‑check predicate | `Number(lastDbMigration.created_at) < migration.folderMillis` (strict `<` — equal counts as already applied) |

### 2.1 Hash table (drizzle sha256 of full `.sql` file contents, hex)

| idx | tag | bytes | `when` (Unix ms) | sha256 |
|---|---|---:|---:|---|
| 0 | `0000_baseline_pre_r5d` | 153 342 | 1779442968898 | `9e167421b227d35a2f4b8a19ce09951e0599915d88aa8bf6e243efbb40d74dbb` |
| 1 | `0001_r5d_production_assets` | 2 258 | 1779442975640 | `a011ba202eb209ce7ebcf84f3aaa9712cd4c4dc1437b57de59dc75a40e17f3a6` |
| 2 | `0002_task_754_production_rigs` | 2 199 | 1779458878522 | `54dd93fbbcb2f5d2162c273e656df0954b62f435ea5f510095f376674a66a844` |
| 3 | `0003_task_783_production_asset_deletion_snapshots` | 718 | 1779463332605 | `ec5e6c0f173b2c45e91ebfb5f7b8453639df5bd2c51efa12b9b010ac1ed4b41b` |
| 4 | `0004_r7b_permanent_avatars` | 10 813 | 1779477909085 | `5eaf93ff31e45262478db9f0fa29bad5df9c56f403a3ac5f8c2a02f3c8d66762` |

## 3. Step 1 — apply `0004_r7b_permanent_avatars.sql`

The 0004_r7b file was split on `--> statement-breakpoint` into **29 statements** and executed inside a single `BEGIN … COMMIT;` transaction against Supabase Pro via the resolver URL.

### 3.1 Step 1 verification (post‑COMMIT)

R7B avatar tables now present:

| Table | Status |
|---|---|
| `permanent_avatars` | ✅ PRESENT |
| `permanent_avatar_audit_log` | ✅ PRESENT |
| `permanent_avatar_tombstones` | ✅ PRESENT |

Orphan‑sweep family (4 `CREATE TABLE IF NOT EXISTS` blocks in 0004_r7b) all confirmed present (3 were already present, 1 was newly filled in — verified each is now present):

| Table | Status |
|---|---|
| `production_asset_orphan_sweep_flapping_snoozes` | ✅ PRESENT |
| `production_asset_orphan_sweep_flapping_config_history` | ✅ PRESENT |
| `production_asset_orphan_sweep_threshold_changes` | ✅ PRESENT |
| `production_asset_sweep_flapping_config_changes` | ✅ PRESENT |

Safety CHECK constraints on `permanent_avatars`:

| Constraint | Status |
|---|---|
| `permanent_avatars_public_url_must_be_null` | ✅ PRESENT |
| `permanent_avatars_real_send_must_be_false` | ✅ PRESENT |
| `permanent_avatars_execution_must_be_false` | ✅ PRESENT |
| `permanent_avatars_visibility_admin_only` | ✅ PRESENT |
| `permanent_avatars_status_allow_list` | ✅ PRESENT |

Step 1 result: **PASS**.

## 4. Step 2 — create `drizzle.__drizzle_migrations` + backfill

Wrapped in a single `BEGIN … COMMIT;` transaction:

```sql
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
-- 5 inserts, one per journal entry in idx order, each with:
--   hash = exact drizzle sha256 of the .sql file
--   created_at = the journal entry's exact `when` (Unix ms, bigint, inserted verbatim)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2);
```

### 4.1 Step 2 verification (post‑COMMIT, read‑only)

`SELECT id, hash, created_at, to_timestamp(created_at/1000) AT TIME ZONE 'utc' AS applied_at FROM drizzle.__drizzle_migrations ORDER BY id;` returned **exactly 5 rows**:

| id | created_at (bigint) | applied_at (UTC) | hash |
|---:|---:|---|---|
| 1 | 1779442968898 | 2026‑05‑22T09:42:48Z | `9e167421b227d35a2f4b8a19ce09951e0599915d88aa8bf6e243efbb40d74dbb` |
| 2 | 1779442975640 | 2026‑05‑22T09:42:55Z | `a011ba202eb209ce7ebcf84f3aaa9712cd4c4dc1437b57de59dc75a40e17f3a6` |
| 3 | 1779458878522 | 2026‑05‑22T14:07:58Z | `54dd93fbbcb2f5d2162c273e656df0954b62f435ea5f510095f376674a66a844` |
| 4 | 1779463332605 | 2026‑05‑22T15:22:12Z | `ec5e6c0f173b2c45e91ebfb5f7b8453639df5bd2c51efa12b9b010ac1ed4b41b` |
| 5 | 1779477909085 | 2026‑05‑22T19:25:09Z | `5eaf93ff31e45262478db9f0fa29bad5df9c56f403a3ac5f8c2a02f3c8d66762` |

For each row the script asserted, in this order:
1. `id` matches `journal.idx + 1` (5 SERIAL ids in `idx` order)
2. `hash` matches the on‑disk drizzle sha256 for that tag — **all 5 exact matches**
3. `created_at` equals the journal `when` via **bigint equality** (not approximate) — **all 5 exact matches**

Step 2 result: **PASS**.

### 4.2 Drizzle pending‑migration inspection (no `drizzle-kit migrate` invoked)

Per `node_modules/drizzle-orm/pg-core/dialect.js::migrate()` (verified directly), drizzle's "what's pending" logic is:

```js
const dbMigrations = ... ORDER BY created_at DESC LIMIT 1;
const lastDbMigration = dbMigrations[0];
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) {
  // apply this migration
}
```

State after backfill:
- `last(created_at desc)` = `1779477909085`
- `max(journal.when)` = `1779477909085`

For every journal entry, `entry.when <= 1779477909085 = last.created_at`, so the strict‑`<` predicate is **false for every entry**. **Conclusion (without running migrate):** `npx drizzle-kit migrate` would apply **0 historical migrations**. Future migrations with `when > 1779477909085` would be applied normally.

## 5. Final state

| Surface | Before | After |
|---|---|---|
| `drizzle.__drizzle_migrations` | missing | 5 rows, ordered, exact hashes, exact `when`s |
| `permanent_avatars` | missing | PRESENT, 12 CHECKs, 7 indices |
| `permanent_avatar_audit_log` | missing | PRESENT, FK→`permanent_avatars` ON DELETE CASCADE, 2 indices |
| `permanent_avatar_tombstones` | missing | PRESENT, 3 indices, **immutability trigger** (UPDATE/DELETE blocked) |
| FKs `permanent_avatars.body_asset_id` → `production_assets`, `rig_id` → `production_rigs` | n/a | PRESENT, `ON DELETE RESTRICT` (this is what makes the route‑layer 409 archive‑block real) |
| Orphan‑sweep family (4 tables) | 3 present (drift) | 4 present (4th filled in by `IF NOT EXISTS`) |

## 6. What's still open

§11 step 2 of `GITHUB_SUPABASE_SYNC_CHECKPOINT_REPORT.md` is now **DONE**. The remaining open items are unrelated to this task:

- §11 step 2 closure (this report). → DONE
- Replit auto‑checkpoint `79a45ba` not yet pushed to GitHub — deferred per user; a separate clean docs‑only checkpoint will cover Task #909C after this task is merged.
- Decommissioning the legacy Neon database (separate user‑tracked project task).
- Rolling the Supabase DB password and updating Replit secrets (separate user‑tracked project task).

## 7. Files added / changed by this task

| File | Change |
|---|---|
| `.local/scripts/909c-execute.ts` | NEW — single‑shot pre‑flight + Step 1 + Step 2 + verification executor (read by main agent, run inside isolated task env) |
| `.local/909c-run-result.json` | NEW — machine‑readable run summary (last successful run state) |
| `docs/reports/SUPABASE_R7B_APPLY_AND_JOURNAL_BACKFILL_909C_REPORT.md` | NEW — this report |
| `docs/library/INDEX.md` | §E count 23 → 24, new row for this report; existing §E note for the checkpoint report updated |
| `docs/reports/GITHUB_SUPABASE_SYNC_CHECKPOINT_REPORT.md` | §5 row "Remote Supabase application status" updated; §11 step 2 marked DONE |

**Zero** changes to `shared/schema.ts`, `migrations/*` (no new SQL files), `server/*`, `client/*`, routes, dependencies, secrets, storage layout, or `replit.md`.
