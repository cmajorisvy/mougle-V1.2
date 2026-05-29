# Mougle - Repository Structure

Mougle is a **TypeScript monorepo** with three logical packages — `client/`, `server/`, and `shared/` — plus supporting folders for configuration, scripts, and generated artefacts.

```
mougle/
├── client/              # Vite + React 19 frontend
├── server/              # Express 5 backend (tsx in dev, esbuild bundle in prod)
├── shared/              # Drizzle schema and shared types
├── config/              # Static config (e.g. RSS feed list)
├── docs/                # This documentation set
├── scripts/, script/    # Build and tooling scripts
├── tests/               # Playwright E2E tests
├── attached_assets/     # Static product / marketing assets
├── generated_clips/     # Output from the content flywheel (excluded from zip)
├── temp_flywheel/       # Working dir for the content flywheel (excluded from zip)
├── package.json         # Single package manifest
├── tsconfig.json        # Shared TS config (paths: @/*, @shared/*)
├── vite.config.ts       # Vite config for client
├── drizzle.config.ts    # Drizzle Kit config (DB push)
├── playwright.config.ts # E2E test config
├── postcss.config.js    # PostCSS for Tailwind v4
├── components.json      # shadcn/ui config
├── replit.md            # Project memory file (architecture summary)
└── .env.example         # Example environment variables
```

---

## `client/`

Frontend code. The Vite dev server runs on port 5000 and is bound to `0.0.0.0`.

```
client/
├── index.html               # Vite entry, OG/Twitter meta tags
└── src/
    ├── App.tsx              # Wouter routes + global providers
    ├── main.tsx             # React root mount
    ├── pages/               # 110+ page components (see frontend-pages.md)
    │   ├── admin/           # Admin dashboard pages
    │   ├── auth/            # SignIn, SignUp, VerifyEmail, etc.
    │   ├── docs/            # User-facing docs (AboutUs, HowItWorks, ...)
    │   ├── legal/           # Privacy, Terms, Cookies, AI usage
    │   └── onboarding/      # Onboarding flows
    ├── components/
    │   ├── ui/              # shadcn/ui primitives (Button, Card, ...)
    │   ├── layout/          # Layout, DocsLayout, AIInsightPanel
    │   ├── dashboard/       # Intelligence dashboard widgets
    │   ├── billing/         # PaywallModal + provider
    │   ├── create/          # CreateModal
    │   ├── feed/            # PostCard
    │   ├── social/          # ShareButtons
    │   ├── pwa/             # InstallPrompt
    │   └── onboarding/      # OnboardingGate
    ├── context/
    │   └── AuthContext.tsx  # Global auth state
    ├── hooks/
    │   ├── use-mobile.tsx
    │   └── use-toast.ts
    └── lib/
        ├── api.ts           # API helpers
        ├── queryClient.ts   # React Query client
        ├── utils.ts         # cn() helper
        └── mockData.ts      # Mock data for previews
```

See [frontend-pages.md](./frontend-pages.md) for the page catalogue and [frontend-components.md](./frontend-components.md) for the shared components and hooks.

---

## `server/`

Backend code. In development, `tsx server/index.ts` runs the API and proxies the Vite dev server. In production, the API is bundled with esbuild and serves the built static client.

```
server/
├── index.ts                 # App bootstrap: middleware, session, routes, http server, workers
├── routes.ts                # Single file, ~7700 lines, ~730 endpoints (see backend-routes.md)
├── storage.ts               # IStorage interface + DatabaseStorage implementation
├── db.ts                    # Drizzle DB connection (Neon Postgres)
├── static.ts                # Production static file serving
├── vite.ts                  # Dev-mode Vite middleware integration
├── config/
│   └── ai-models.ts         # Centralised model id config
├── middleware/
│   ├── auth.ts              # requireAuth, requireAdmin, requireSystemMode
│   ├── csrf.ts              # CSRF token middleware
│   ├── rate-limiter.ts      # Rate limiting + suspicious activity detector
│   └── request-trace.ts     # Per-request trace IDs for debugging
├── replit_integrations/
│   ├── audio/               # Replit audio integration helpers
│   ├── batch/               # Batch processing helpers
│   ├── chat/                # Chat / OpenAI integration
│   └── image/               # Image generation helpers
├── seo/
│   └── schemaTemplates.ts   # JSON-LD schema templates for SEO pages
└── services/                # 92 service modules (see backend-services.md)
```

The single `routes.ts` file is intentional: it's a flat registry that calls into the service layer. See [backend-routes.md](./backend-routes.md) for the full grouped enumeration.

---

## `shared/`

Code that is imported from both the client and the server.

```
shared/
├── schema.ts                # 197 Drizzle pgTable definitions + insert schemas + types
└── models/
    └── chat.ts              # Shared chat-related types
```

The `@shared/*` TypeScript path alias points here. See [database-schema.md](./database-schema.md) for the table catalogue.

---

## `config/`

Non-source configuration data.

```
config/
└── rssFeeds.json            # 10+ AI-focused RSS sources for the news pipeline
```

---

## `scripts/` and `script/`

Build and developer scripts. The `npm run build` script invokes `script/build.ts`, which produces:

- A static client bundle in `dist/public/` (excluded from zip)
- A bundled server entry at `dist/index.cjs` (excluded from zip)

---

## Generated and excluded folders

The following folders are produced at runtime or by tooling and are **excluded from the source zip**:

| Folder | What it holds |
|---|---|
| `node_modules/` | npm dependencies |
| `.git/` | Git metadata |
| `.cache/`, `.upm/`, `.local/`, `.config/`, `.agents/` | Replit / agent tooling caches |
| `dist/`, `build/` | Build outputs |
| `generated_clips/` | Video / audio clips from the content flywheel |
| `temp_flywheel/` | Working files for the content flywheel |

`.env` and any other secret-bearing files are also excluded. Only `.env.example` ships in the zip.

---

## Key configuration files

| File | Purpose |
|---|---|
| `package.json` | Single manifest for the whole monorepo. Defines `dev`, `build`, `start`, `check`, `db:push`, `e2e`. |
| `tsconfig.json` | TypeScript config. Defines path aliases `@/*` (client) and `@shared/*` (shared). |
| `vite.config.ts` | Vite plugin chain (React, Tailwind v4, Replit dev plugins). |
| `drizzle.config.ts` | Drizzle Kit config — points at `shared/schema.ts` and `DATABASE_URL`. |
| `playwright.config.ts` | Playwright E2E test config. |
| `postcss.config.js` | PostCSS / Tailwind setup. |
| `components.json` | shadcn/ui CLI config. |
| `.env.example` | All environment variables the app reads. See [setup.md](./setup.md). |
| `replit.md` | Live architecture summary used by the AI assistant on Replit. |

---

## Path aliases

Both the client and server respect these TypeScript path aliases:

- `@/...` → `client/src/...`
- `@shared/...` → `shared/...`

Use them everywhere instead of relative paths to keep imports stable when files move.
