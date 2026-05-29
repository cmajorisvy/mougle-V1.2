# Mougle Environment Variables Inventory — 2026-05-22

⚠️ **Values are intentionally omitted.** This file lists only the *names* of environment variables and where to find their values. Never commit `.env` files or secret values to git or to any backup ZIP.

## Where secrets live in Replit
- **Tools → Secrets pane** in the Repl sidebar. Each entry shown below corresponds to one row there.
- Replit injects them as environment variables at workflow start.
- `.env` files are gitignored (`.gitignore` covers `.env` and `.env.*`); only `.env.example` (which has placeholder values) is tracked.
- The Replit GitHub integration / `GH_TOKEN` for CLI pushes is **not stored in Secrets**; a PAT must be added to Secrets manually if CLI push is needed.

## Variable inventory (names only)

### Database — Supabase
- `DATABASE_URL` — value omitted (mirrors `SUPABASE_DB_URL` for compatibility)
- `SUPABASE_DB_URL` — value omitted (pooler URL, session mode, port 5432)
- `SUPABASE_DB_PASSWORD` — value omitted
- `SUPABASE_URL` — value omitted (REST URL, used by `@supabase/supabase-js`)
- `SUPABASE_ANON_KEY` — value omitted (public anon key, safe in browser bundles only if RLS is enforced)
- `SUPABASE_SERVICE_ROLE_KEY` — value omitted (**SERVER ONLY** — bypasses RLS; never expose to client)
- `PGDATABASE` — value omitted (Postgres database name)

### AI / LLM providers
- `OPENAI_API_KEY` — value omitted (primary GPT key)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — value omitted (Replit-integration-provided fallback)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — value omitted

### Media generation
- `ELEVENLABS_API_KEY` — value omitted (text-to-speech)
- `HEYGEN_API_KEY` — value omitted (avatar video)
- `MESHY_API_KEY` — value omitted (3D asset generation)
- `RUNWAY_API_KEY` — value omitted (AI video b-roll)
- `REMOTION_LICENSE_KEY` — value omitted (Remotion compositions)

### Object Storage (Replit GCS bucket)
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — value omitted
- `PRIVATE_OBJECT_DIR` — value omitted (private uploads path)
- `PUBLIC_OBJECT_SEARCH_PATHS` — value omitted (public asset search paths)

### App
- `SESSION_SECRET` — value omitted (Express session signing key)
- `NODE_ENV` — set per workflow (`development` in `npm run dev`)

### Not present in this Repl but referenced in code (set only if/when used)
- `RESEND_API_KEY` — value omitted (email — installed integration; the integration may inject a managed key automatically)
- `YOUTUBE_*` — value omitted (only required if YouTube ingestion is ever re-enabled; current Audience layer uses no platform APIs)
- `AUDIENCE_RETENTION_DAYS` — optional override for retention window
- `AUDIENCE_RETENTION_INTERVAL_HOURS` — optional override for sweep cadence
- `AUDIENCE_AUDIT_EXPORT_DEDUP_MS` — optional override for export notifier dedup window
- `TEST_DB_POOL_MAX` — optional override for test pool size (default 2, hard-cap 5)
- `WORKER_ENABLED` — gates the worker boot path
- `GITHUB_TOKEN` / `GH_TOKEN` — value omitted (only added when CLI git push to GitHub is needed)

## How to restore secrets manually

When standing up a new Repl / environment:

1. Open the Repl's **Tools → Secrets** pane.
2. For each entry above, click **+ New Secret**, paste the key, paste the value from your password manager / Supabase dashboard / provider dashboards.
3. Hit save. Replit will restart workflows so the new values are picked up.
4. Verify with `env | awk -F= '{print $1}' | sort` (lists names only, **never** add `cat` of `.env`).
5. Boot the app: `npm run dev`. Confirm `/api/posts` returns 200.

## Provider dashboards (where to copy values from)

| Variable group | Source |
|---|---|
| `SUPABASE_*` / `DATABASE_URL` / `PGDATABASE` | https://supabase.com/dashboard → project → Settings → Database / API |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys |
| `HEYGEN_API_KEY` | https://app.heygen.com/settings/api |
| `MESHY_API_KEY` | https://www.meshy.ai/settings/api |
| `RUNWAY_API_KEY` | https://app.runwayml.com/account |
| `REMOTION_LICENSE_KEY` | https://www.remotion.dev/account |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` / `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS` | Replit Object Storage pane (auto-managed by the platform) |
| `SESSION_SECRET` | Generate a fresh 64-char random string (`openssl rand -hex 32`) — does not need to match the old one, but invalidates existing sessions |
| `GITHUB_TOKEN` | https://github.com/settings/tokens (fine-grained PAT) |

## Hard warnings

- 🛑 **Never** paste any of these values into chat, into a public Replit comment, into a PR description, into a screenshot, or into a `*.md` file in the repo.
- 🛑 **Never** include `.env` files in the source backup ZIP — the source ZIP was built from `git archive HEAD`, so by construction it contains only tracked files (`.env*` is gitignored).
- 🛑 If a `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` ever appears in chat/PR/screenshot, **revoke it immediately** and rotate.
- 🛑 The `GITHUB_TOKEN` (`github_pat_...`) pasted by the user in earlier chat turns of this conversation **is exposed in chat history** and should be revoked at https://github.com/settings/tokens after this sync is complete.
