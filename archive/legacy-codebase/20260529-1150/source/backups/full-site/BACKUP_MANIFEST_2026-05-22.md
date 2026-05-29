# Mougle Full-Site Backup Manifest — 2026-05-22

## Snapshot identity

| Field | Value |
|---|---|
| Backup date (UTC) | 2026-05-22 |
| Manifest last updated (UTC) | 2026-05-22 (DB dump confirmed complete) |
| Source commit SHA | `3c25e1cc8afd943dc679bffdb91064bbccb38c70` |
| Source commit subject | Add prompt details for syncing project state with external services |
| Latest substantive task | Task #737 — Stop double-sending the snooze-recap email when root admins are configured (`81874c5`, parent of HEAD) |
| Working tree clean? | ✅ Yes (no untracked, no modified after the auto-checkpoint) |
| Current local branch | `main` |
| Git backup branch | `backup/full-site-pre-consolidation-2026-05-22` |
| Backup branch pushed to | `https://github.com/cmajorisvy/mougle-V1.git` (private snapshot repo) |
| Backup branch remote SHA | `3c25e1cc8afd943dc679bffdb91064bbccb38c70` (verified via `git ls-remote`) |
| Original repo `cmajorisvy/mougle` | **Untouched this task** |
| Supabase | **Untouched** — zero SQL, zero migrations, zero `db:push`, zero schema/data writes, pooler mode unchanged |

## Artifact paths

| Artifact | Path | Size |
|---|---|---|
| Source ZIP | `backups/full-site/mougle-full-site-source-backup-2026-05-22.zip` | 36 MB / 1,167 entries |
| Assets ZIP | `backups/full-site/mougle-assets-backup-2026-05-22.zip` | 4.0 MB / 11 entries |
| Production House runtime state ZIP | `backups/full-site/mougle-production-house-runtime-state-2026-05-22.zip` | 146 KB / 214 entries (208 JSON manifest snapshots from `data/production-house/`) |
| Database dump file | ✅ **COMPLETE** — `mougle-supabase-backup-2026-05-22.dump` (25 MB, custom format, taken from user's laptop against the Supabase Direct connection URL; not stored in this Repl). Source DB: `postgres`, dumped-from version `17.6`. Validated with `pg_restore --list` (1,691 entries listed, no errors). Confirmed tables present in the archive: `admin_staff`, `system_settings`, `news_articles`, `broadcast_briefs`, `audience_audit_exports`, `audience_audit_export_notifier_config_history`, `audience_audit_email_failure_alert_snoozes`, `audience_audit_history_email_stale_snooze_log`, `audience_channel_connectors`, `audience_messages`, `audience_safety_decisions`, `podcast_audio_jobs`, `podcast_script_packages`, `debate_participants`, `debate_turns`, `live_debates`. |
| Database backup instructions | `backups/full-site/db/DB_BACKUP_INSTRUCTIONS_2026-05-22.md` | — (instructions only; see below) |
| Environment variables inventory | `backups/full-site/ENVIRONMENT_VARIABLES_INVENTORY_2026-05-22.md` | — (names only, no values) |
| This manifest | `backups/full-site/BACKUP_MANIFEST_2026-05-22.md` | — |

## Source ZIP — what's inside

Built with `git archive --format=zip HEAD`, so by construction it contains exactly the **1,068 tracked files** in the repo (plus per-directory headers ≈ 99 entries → 1,167 total ZIP entries).

Top-level directories present in the ZIP:

| Directory | Entries (approx) |
|---|---|
| `client/` | 395 |
| `server/` | 301 |
| `tests/` | 151 |
| `attached_assets/` | 128 |
| `docs/` (incl. `docs/reports/`) | 54 |
| `python-workers/` | 53 |
| `shared/` | 28 |
| `scripts/` (incl. `scripts/migrate-*.ts`) | 16 |
| `client/remotion/` | 12 |
| `config/` | 3 |
| Plus root files: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `drizzle.config.ts`, `.replit`, `.gitignore`, `replit.md`, etc. | — |

All admin dashboard code (`client/src/pages/admin/**`), all News Room / Production House / Podcast / Debate code (under `server/services/` and `client/src/pages/`), and all `scripts/migrate-*.ts` SQL DDL helpers are included.

## Assets ZIP — what's inside

`client/public/` only. Contains 11 files (static assets shipped with the frontend: `og:image`, favicons, etc.). No other public/uploads dirs exist locally (`uploads/`, `static/`, `generated_clips/`, `temp_flywheel/` were checked and absent).

## Database backup — actual dump not produced this run

`pg_dump` from the Repl failed because `SUPABASE_DB_URL` points to the Supabase **pooler** (session mode, port 5432), which uses a tenant-prefixed username that `pg_dump` cannot authenticate against:

```
pg_dump: error: connection to server at "aws-0-us-east-1.pooler.supabase.com" failed:
FATAL: Tenant or user not found
```

Per the "do not touch Supabase / do not change pooler mode" guardrail, no alternate connection variants were tried from inside the Repl. **Three offline routes** to take an actual dump are documented in `db/DB_BACKUP_INSTRUCTIONS_2026-05-22.md`:

1. Supabase dashboard → Database → Backups → Download (.tar.gz) — **recommended**.
2. `pg_dump` from your laptop against the **direct** (non-pooler) connection URL.
3. `supabase db dump` via the Supabase CLI.

The instructions doc includes:
- Schema-only / full-data / plain-SQL `pg_dump` command templates (no embedded secrets — uses `$SUPABASE_DIRECT_URL` env var).
- The full list of critical tables grouped by subsystem (identity/admin, discussion, newsroom/production-house, audience/audit/compliance, publishing/shorts/social, sessions).
- Row-count verification SQL.
- `pg_restore` / `psql` restore commands.
- Post-restore verification checklist.
- Hard "do not" rules (no `db:push` to fix drift, no destructive restore flags, no committing dumps to git).

## Environment / secrets

- `.env` files: **none on disk** other than `.env.example` (placeholder values only, tracked in git intentionally).
- Real secret values live in Replit's **Secrets** pane and are never written to the source ZIP (source ZIP was built from `git archive`, so untracked/gitignored files cannot be included).
- The inventory MD lists 20+ variable names by category (Supabase, AI providers, media generators, object storage, app config) plus provider dashboards to re-source them from.

## Excluded folders (intentionally NOT in any ZIP)

| Path | Reason | Local size |
|---|---|---|
| `node_modules/` | Rebuilt via `npm ci` | 1.0 GB / 48,763 files |
| `dist/` | Build output, regenerated by `npm run build` | 16 MB / 17 files |
| `data/production-house/` | ✅ **Now captured** in `backups/full-site/mougle-production-house-runtime-state-2026-05-22.zip` (added 2026-05-22 05:04 UTC). Still gitignored in repo. | 832 KB / 208 files |
| `.internal/` | Tooling internals | 68 KB / 17 files |
| `test-results/` | Playwright transient output | 52 KB / 7 files |
| `output/` | Runtime artifacts | 8 KB / 2 files |
| `.env*` (except `.env.example`) | Secrets | n/a (not on disk) |
| Any `.cache/`, `logs/`, build temp | Per `.gitignore` | n/a |

## Known warnings / limitations

1. ~~Database dump still pending.~~ ✅ **Resolved 2026-05-22** — user captured `mougle-supabase-backup-2026-05-22.dump` (25 MB, custom format) from their laptop against the Supabase Direct connection URL. `pg_restore --list` validation passed (1,691 entries, no errors). Dump source DB version: 17.6. Dump file lives outside this Repl (user-side storage) and is **not** committed to git. Consolidation precondition met.
2. ~~`data/production-house/` is not in any backup.~~ ✅ **Resolved 2026-05-22 05:04 UTC** — captured in `mougle-production-house-runtime-state-2026-05-22.zip` (146 KB, 214 entries, integrity verified).
3. **HEAD is one commit past `81874c5`.** Commit `3c25e1c` was auto-created by Replit's loop-end checkpoint and contains the prompt text file. Nothing was lost; all Task #371–#737 work is included.
4. **Large file warning from GitHub** during push: `attached_assets/mougle-changes_1771679887489.tgz` is 60.88 MB (above GitHub's recommended 50 MB) and is being stored via Git LFS (1.4 GB LFS upload reported). Push still succeeded.
5. **Pre-existing TypeScript errors** (~13 in `server/routes/broadcasts.ts`, `server/services/production-house-service.ts`, etc.) are included in the backup as-is. **Not fixed per task scope.**
6. **GitHub PAT exposure**: the token pasted in chat is in chat history. Revoke at https://github.com/settings/tokens after this work concludes.

## Restore procedure (high level)

To rebuild this snapshot from scratch:

```bash
# 1. Clone or unzip
git clone --branch backup/full-site-pre-consolidation-2026-05-22 \
  https://github.com/cmajorisvy/mougle-V1.git mougle-restore
# OR
unzip mougle-full-site-source-backup-2026-05-22.zip -d mougle-restore

cd mougle-restore

# 2. Reinstate secrets in Replit Secrets pane per ENVIRONMENT_VARIABLES_INVENTORY_2026-05-22.md

# 3. Install deps
npm ci

# 4. Restore DB per DB_BACKUP_INSTRUCTIONS_2026-05-22.md (dashboard or pg_restore)

# 5. (If needed) restore static assets
unzip mougle-assets-backup-2026-05-22.zip -d ./
# -> writes client/public/

# 6. Run migrations only if schema drift is detected — do NOT run db:push blindly
#    (scripts/migrate-*.ts are idempotent, but read each before running)

# 7. Boot
npm run dev
curl localhost:5000/api/posts | head -c 200
```

## Verification checklist (this run)

- [x] Source ZIP exists at `backups/full-site/mougle-full-site-source-backup-2026-05-22.zip`
- [x] Source ZIP is listable and integrity-checks clean (1,167 entries, 36 MB)
- [x] Source ZIP contains all 9 key directories (`client`, `server`, `shared`, `scripts`, `tests`, `docs`, `config`, `client/remotion`, `attached_assets`, `python-workers`)
- [x] Source ZIP contains 0 `node_modules/` entries
- [x] Source ZIP contains 0 `dist/` entries
- [x] Source ZIP contains 0 `.env*` (non-example) entries
- [x] Assets ZIP exists at `backups/full-site/mougle-assets-backup-2026-05-22.zip` (4.0 MB, 11 entries)
- [x] **Production House runtime ZIP exists** at `backups/full-site/mougle-production-house-runtime-state-2026-05-22.zip` (146 KB, 214 entries, `unzip -tq` integrity check passed)
- [x] DB backup instructions exist at `backups/full-site/db/DB_BACKUP_INSTRUCTIONS_2026-05-22.md`
- [x] **Actual DB dump file exists** — `mougle-supabase-backup-2026-05-22.dump` (25 MB, custom format), captured user-side via Direct connection URL
- [x] **DB dump validated** — `pg_restore --list` succeeded with 1,691 archive entries; source DB version 17.6; critical tables (admin_staff, system_settings, news_articles, broadcast_briefs, audience_audit_*, audience_channel_connectors, audience_messages, audience_safety_decisions, podcast_audio_jobs, podcast_script_packages, debate_participants, debate_turns, live_debates) all confirmed present
- [x] ENV inventory exists with no values
- [x] Manifest exists (this file)
- [x] Git backup branch `backup/full-site-pre-consolidation-2026-05-22` pushed to `mougle-V1`
- [x] Backup branch SHA verified via `git ls-remote` = `3c25e1cc8afd943dc679bffdb91064bbccb38c70`
- [x] No files outside `backups/` were modified or deleted
- [x] Working tree clean
- [x] Supabase untouched (zero SQL / migrations / `db:push` / schema or data writes)
- [x] Original `cmajorisvy/mougle` repo untouched this task
