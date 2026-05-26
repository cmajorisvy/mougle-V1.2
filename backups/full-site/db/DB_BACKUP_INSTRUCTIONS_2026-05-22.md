# Mougle Database Backup Instructions — 2026-05-22

## Why this file exists instead of an actual dump

`pg_dump` was attempted from the Repl against `SUPABASE_DB_URL` and **failed** with:

```
pg_dump: error: connection to server at "aws-0-us-east-1.pooler.supabase.com" (44.216.29.125), port 5432 failed:
FATAL:  Tenant or user not found
```

Root cause: `SUPABASE_DB_URL` in this Repl points at the **Supabase pooler** (session mode, port 5432) which uses a tenant-prefixed username format (`postgres.<project-ref>`). `pg_dump` cannot authenticate against the pooler the same way the runtime app does — it needs the **direct connection string** (port 5432 on `db.<project-ref>.supabase.co`) or the `connection_pooling`-disabled "Direct connection" URL from the Supabase dashboard.

To stay strictly within the "do not touch Supabase / do not modify pooler mode" guardrail, no further connection variants were attempted from inside the Repl. The dump must be taken from one of the routes below.

---

## Option 1 — Supabase Dashboard (recommended, zero-CLI)

1. Open https://supabase.com/dashboard → select the Mougle project.
2. Left sidebar → **Database** → **Backups**.
3. Daily automatic backups are available on Pro/Team plans. Click **Download** on the most recent dated row to pull a `.tar.gz` containing both schema and data.
4. Free-tier projects: use **Settings → Database → Connection string → URI** (the "Direct connection", *not* the pooler) and run Option 2 from your laptop.
5. Store the downloaded file alongside this directory (`backups/full-site/db/`) named:
   - `mougle-supabase-backup-YYYY-MM-DD.tar.gz`

## Option 2 — `pg_dump` from your laptop (works against direct connection)

Get the **direct** connection string (not the pooler):
Supabase Dashboard → **Settings → Database → Connection string → URI → "Use connection pooling" OFF**.

Set it in your local shell **without echoing**:

```bash
read -s SUPABASE_DIRECT_URL    # paste, press Enter — value never shown
export SUPABASE_DIRECT_URL
```

### Schema-only dump (fast, safe)
```bash
pg_dump \
  --schema-only \
  --no-owner --no-privileges --no-acl \
  --no-publications --no-subscriptions \
  --file=schema-$(date +%F).sql \
  "$SUPABASE_DIRECT_URL"
```

### Full schema + data dump (custom format — for `pg_restore`)
```bash
pg_dump \
  --format=custom \
  --no-owner --no-privileges --no-acl \
  --no-publications --no-subscriptions \
  --file=data-$(date +%F).dump \
  "$SUPABASE_DIRECT_URL"
```

### Plain-SQL dump (human-readable, larger)
```bash
pg_dump \
  --format=plain \
  --no-owner --no-privileges --no-acl \
  --file=full-$(date +%F).sql \
  "$SUPABASE_DIRECT_URL"
```

Store the resulting files in `backups/full-site/db/` and never commit them — the directory should remain gitignored or moved off-repo.

## Option 3 — Supabase CLI

```bash
npm install --global supabase
supabase login                 # opens browser
supabase link --project-ref <your-project-ref>
supabase db dump --schema public --file backups/full-site/db/schema-$(date +%F).sql
supabase db dump --data-only   --file backups/full-site/db/data-$(date +%F).sql
```

---

## Critical tables to verify in any backup

These are the tables whose loss would force the most rebuild. Group by subsystem.

### Identity / Admin
- `users`
- `admin_staff`
- `system_settings`

### Discussion / Posts / Trust
- `posts`
- `comments`
- `trust_scores`
- `agent_votes`
- `claims`

### Newsroom / Production House
- `news_articles`
- `verified_newsroom_*` (verified-newsroom sub-tables)
- `broadcast_briefs`
- `screen_presets`
- `screen_take_plans`
- `screen_safety_validations`
- `legal_event_visuals`
- `podcast_packages`
- `debate_packages`
- `production_house_packages`
- `preview_studio_states`
- `avatar_*`
- `media_*`
- `package_*`
- `approval_board_*`
- `readiness_center_*`

### Audience / Audit / Compliance
- `audience_channel_connectors`
- `audience_messages`
- `audience_safety_decisions`
- `audience_moderation_commands`
- `audience_gateway_events`
- `audience_audit_exports`
- `audience_audit_export_notifications`
- `audience_audit_export_notifier_config_history`
- `audience_archive_notifier_snooze_log`
- `audience_audit_email_failure_alert_snoozes`
- `audience_audit_history_email_stale_snooze_log`

### Publishing / Shorts / Social
- `shorts_*`
- `social_distribution_*`
- `publishing_*` (publishing/approval queue tables)

### Sessions / Misc
- `session` (Express session store)

## Row-count verification queries

Run after restore (or before backup, to compare):

```sql
SELECT 'users' AS t, COUNT(*) FROM users
UNION ALL SELECT 'admin_staff', COUNT(*) FROM admin_staff
UNION ALL SELECT 'system_settings', COUNT(*) FROM system_settings
UNION ALL SELECT 'posts', COUNT(*) FROM posts
UNION ALL SELECT 'comments', COUNT(*) FROM comments
UNION ALL SELECT 'news_articles', COUNT(*) FROM news_articles
UNION ALL SELECT 'broadcast_briefs', COUNT(*) FROM broadcast_briefs
UNION ALL SELECT 'screen_take_plans', COUNT(*) FROM screen_take_plans
UNION ALL SELECT 'audience_channel_connectors', COUNT(*) FROM audience_channel_connectors
UNION ALL SELECT 'audience_messages', COUNT(*) FROM audience_messages
UNION ALL SELECT 'audience_safety_decisions', COUNT(*) FROM audience_safety_decisions
UNION ALL SELECT 'audience_audit_exports', COUNT(*) FROM audience_audit_exports
ORDER BY t;
```

For an automated full inventory:

```sql
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

## Restore instructions

### From a custom-format `.dump`
```bash
# Restore into a FRESH empty database — never into prod without dry-run.
createdb mougle_restore
pg_restore \
  --no-owner --no-privileges \
  --dbname=postgres://USER:PASS@HOST:5432/mougle_restore \
  data-YYYY-MM-DD.dump
```

### From a plain SQL file
```bash
psql "$RESTORE_TARGET_URL" -f full-YYYY-MM-DD.sql
```

### From a Supabase dashboard backup
Dashboard → Backups → click the row → **Restore** (creates a new project or overwrites — read the warning carefully). Never restore over the live project without first dumping it again.

## Hard "do not" rules
- ❌ Do not run `db:push` to "fix" a restored schema — let the migration scripts in `scripts/migrate-*.ts` reconcile.
- ❌ Do not enable the pooler in the restore target while testing.
- ❌ Do not commit any `.sql` / `.dump` / `.tar.gz` to git — they may contain secrets, PII, or audit data.
- ❌ Do not run a destructive restore (`--clean`, `DROP …`, `TRUNCATE …`) without an approved checklist.

## Verification checklist (after restore)
- [ ] `\dt` lists all critical tables above.
- [ ] Row-count query result is within ±0.1% of pre-backup counts.
- [ ] App boots (`npm run dev`) against the restore target.
- [ ] `/api/posts`, `/api/agent-orchestrator/status`, `/api/news/latest` return 200.
- [ ] No `EMAXCONNSESSION` errors in the first 60 seconds.
- [ ] One audit export through the admin UI succeeds and writes a new row to `audience_audit_exports`.
