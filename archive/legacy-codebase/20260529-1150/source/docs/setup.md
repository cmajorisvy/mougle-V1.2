# Mougle - Setup, Run, and Environment

This document covers how to run the Mougle codebase locally and what every environment variable does.

---

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 14+ (a Neon-hosted instance also works — Mougle uses `pg` with `ssl: { rejectUnauthorized: false }` when `DATABASE_URL` is provided).
- An **OpenAI API key** for any feature that touches LLMs (debates, news pipeline, AI content, agent orchestration, project pipeline, support AI replies, growth optimisation, etc.).
- A **Resend API key** for email-based flows (verification, password reset, growth emails, support replies).

On Replit, the database, the OpenAI integration, and Resend are wired in automatically.

---

## Install

```bash
npm install
```

---

## Configure

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `development` or `production`. Toggles Vite middleware, secure cookies, and the host redirect (`mougle.com` → `www.mougle.com`). |
| `PORT` | yes | HTTP port. Defaults to `5000`. The server binds to `0.0.0.0`. |
| `APP_BASE_URL` | yes | Public base URL of the app, e.g. `https://www.mougle.com`. Used in emails, sitemaps, OG tags. |
| `DATABASE_URL` | yes | Postgres connection string. If set, `ssl: { rejectUnauthorized: false }` is used. |
| `PGDATABASE`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` | optional | Used as fallbacks if `DATABASE_URL` isn't set. |
| `SESSION_SECRET` | **yes** | Signing secret for `express-session`. The server **throws on boot** if this is missing. |
| `ADMIN_USERNAME` | yes (for admin) | Username for the admin login page. |
| `ADMIN_PASSWORD_HASH` | yes (for admin) | bcrypt hash of the admin password. |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | yes (for AI) | OpenAI API key. Used by `ai-gateway.ts` and a few other services. |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | optional | Override OpenAI base URL (defaults to `https://api.openai.com/v1`). |
| `ENABLE_FLYWHEEL_VIDEO` | optional | `true` to enable video generation in the content flywheel. Defaults to `false`. |
| `RESEND_API_KEY` | yes (for email) | Resend API key. |
| `RESEND_FROM_EMAIL` | yes (for email) | The "from" address for outbound mail, e.g. `noreply@mougle.com`. |
| `WORKER_ENABLED` | optional | When set to `true`, background workers (orchestrator, news pipeline, social publisher, etc.) start. Leave **off** for one-shot dev runs. |
| `REPL_ID`, `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN` | auto | Set automatically on Replit. |

> **Security note:** `SESSION_SECRET` must be a long, random string. The server explicitly refuses to start without it.

---

## Database

Apply the schema:

```bash
npm run db:push
```

This uses Drizzle Kit to push `shared/schema.ts` to the database referenced by `DATABASE_URL`. There is no migration directory — pushes are based on schema diff.

---

## Run in development

```bash
npm run dev
```

What this does:

1. Boots Express with `tsx` so TypeScript runs natively.
2. Loads the session store (Postgres-backed if `DATABASE_URL`/`PGHOST` are set).
3. Mounts global middleware: rate limiter, suspicious-activity detector, request trace, CSRF.
4. Registers all routes via `registerRoutes()`.
5. Sets up Vite middleware (because `NODE_ENV !== "production"`).
6. Starts the HTTP server on `0.0.0.0:$PORT`.

If `WORKER_ENABLED=true`, it additionally starts:

- `agent-bootstrap` (seeds initial agents)
- `agentOrchestrator.start()`
- `agentLearningService.startWorker()`
- `newsService.startScheduler(30)` (every 30 minutes)
- `socialPublisherService.startAutoPublisher(5)` (every 5 minutes)
- `promotionSelectorAgent.startWorker(10)` (every 10 minutes)
- `growthBrainService.startWorker(30)` (every 30 minutes)
- `founderControlService.initialize()`
- `activityMonitorService.start(5 * 60 * 1000)`
- `anomalyDetectorService.start(5 * 60 * 1000)`
- `escalationService.getPolicy()` (warm-up)
- `truthEvolutionService.startDecayScheduler()` (24-hour decay)
- `labsFlywheelService.startDailyGeneration()`
- `breakingNewsAgent.autoRunScheduledDebates()`

Open `http://localhost:5000` to use the app.

---

## Build for production

```bash
npm run build
npm start
```

`npm run build` runs `script/build.ts`, which:

1. Builds the React client with Vite into `dist/public/`.
2. Bundles `server/index.ts` with esbuild into `dist/index.cjs`.

`npm start` runs the bundled server with `NODE_ENV=production`, which serves the static client from `dist/public/` and the API on the same port.

---

## Other scripts

| Script | Purpose |
|---|---|
| `npm run check` | Run `tsc` for type checking. |
| `npm run dev:client` | Run Vite alone (no API). Rarely needed. |
| `npm run db:push` | Push the Drizzle schema. |
| `npm run e2e` | Run Playwright E2E tests. |
| `npm run e2e:ui` | Run Playwright with the UI. |

See [e2e.md](./e2e.md) for the manual E2E test plan.

---

## Special endpoints to verify the install

After boot, these endpoints should all respond:

- `GET /api/topics` → `[]` (or seeded topics)
- `GET /api/billing/plans` → list of plans
- `GET /api/billing/credit-packages` → list of packages
- `GET /sitemap.xml` → XML sitemap (dynamically built)
- `GET /robots.txt` → robots config
- `GET /llms.txt` → LLM-readable description

If you see any of those return 5xx, check the log line for the missing service or env var.

---

## Cron-like work

Mougle does **not** use OS cron. All recurring work is `setInterval`-based and only starts when `WORKER_ENABLED=true`. See the list above. This keeps a fresh dev process from accidentally hammering OpenAI.

---

## Common pitfalls

- **`SESSION_SECRET must be set in the environment.`** — set the env var and restart.
- **`Vite middleware not loading in production`** — `vite.ts` is intentionally only `await import`-ed when `NODE_ENV !== "production"`. Keep it that way; the production server uses `static.ts`.
- **Database pushes overwrite columns** — `drizzle-kit push` is destructive; always review the prompt before confirming.
- **OpenAI 429s** — the AI Gateway logs and tracks costs but does not retry by default. Use `p-limit` / `p-retry` (already in deps) if you add new bulk callers.
