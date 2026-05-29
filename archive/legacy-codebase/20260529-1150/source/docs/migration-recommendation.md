# Mougle Migration Recommendation

Date: 2026-05-01

## Recommendation Summary

Keep the current TypeScript, React, Express, PostgreSQL, and Drizzle stack for the first stabilization branch. Mougle has enough surface area, route coverage, shared schema usage, and product-specific service logic that a framework migration would add risk before it adds leverage.

The right near-term move is to make the current stack bootable, typecheckable, and easier to split later. Migration should be treated as a future option, not a first repair step.

## 1. TypeScript + React + Express

Recommendation: keep.

TypeScript is still the best default language for Mougle's product and API layer because the frontend, backend, validation schemas, and shared database types already live in one language. React remains appropriate for the large interactive dashboard surface, marketplace flows, admin panels, onboarding, 3D UI, and real-time debate experiences.

Express is acceptable for the current backend because Mougle already has a large REST API, session middleware, CSRF handling, rate limiting, SSE, static serving, and many service modules wired around Express request handlers. The issue is not Express itself. The issue is concentration of too much behavior in `server/routes.ts` and insufficient type boundaries around request/user/session data.

Long-term action:
- Keep Express while splitting route domains into modules.
- Add shared request/response types where routes cross major domains.
- Keep frontend and backend contracts explicit through Zod or generated OpenAPI later.

Do not migrate away from TypeScript, React, or Express during stabilization.

## 2. Vite To Next.js Later

Recommendation: consider later, not now.

Vite is a good fit for the current application shell because most of Mougle is an authenticated, dashboard-heavy application where fast client development matters. Next.js could help later for public SEO pages, marketing articles, docs, knowledge pages, Open Graph rendering, and server-rendered landing pages.

The main reason to delay Next.js is that Mougle currently has API, database, auth, admin, worker, and frontend stability issues. Moving the app router, auth session behavior, data loading model, static asset behavior, and deployment model at the same time would multiply the risk.

Recommended future path:
- Stabilize the current Vite app first.
- Modularize public pages and API route domains.
- If SEO and public content become the limiting factor, introduce Next.js for public web surfaces.
- Keep the operational app/admin surfaces in Vite until there is a clear reason to move them.

Avoid a big-bang Vite-to-Next migration.

## 3. Python For AI Agent Services

Recommendation: add Python later only for isolated AI workloads.

The main API should stay TypeScript for now. Python can become valuable for agent evaluation, long-running pipelines, embeddings, retrieval experiments, simulation, model scoring, data analysis, or integrations that depend on mature Python AI libraries.

Python should not be introduced as a second backend for core auth, billing, admin, sessions, marketplace, or CRUD during stabilization. That would create duplicate operational responsibility before the current service boundaries are healthy.

Recommended future path:
- Keep TypeScript as the public API and product backend.
- Add Python as worker services behind queues or narrow internal HTTP endpoints.
- Use explicit JSON/Zod/Pydantic contracts between TypeScript and Python.
- Do not let Python workers write directly to arbitrary tables at first; route writes through controlled service APIs or a limited job-result schema.

## 4. Drizzle Vs Prisma

Recommendation: keep Drizzle now; reconsider Prisma later only after schema stabilization.

Drizzle fits the current codebase because the schema already lives in `shared/schema.ts`, the app uses PostgreSQL directly, and many services rely on Drizzle query composition. Replacing the ORM now would touch the riskiest files in the repo: schema, storage, routes, and services.

The more urgent database issue is process, not ORM choice. Mougle needs reliable schema sync, migrations or migration policy, and a boot path that fails with clear configuration errors.

Prisma may be worth considering later if the team wants stronger migration ergonomics, introspection, generated client workflows, and a more opinionated data access layer. It should not be evaluated until the current schema compiles and the most important storage operations are covered by tests.

Recommended future path:
- Keep Drizzle for stabilization.
- Establish a migration workflow instead of relying only on ad hoc pushes.
- Revisit Prisma only when schema churn slows and the storage layer has tests.

## 5. Recommended Future Monorepo Structure

Recommended direction:

```text
mougle/
  apps/
    web/              # Vite or future Next public/app frontend
    api/              # Express API server
    worker/           # TypeScript background workers
  packages/
    db/               # Drizzle schema, migrations, db client
    shared/           # Shared types, validation, API contracts
    ui/               # Reusable React UI components
    config/           # TypeScript, lint, build config
  services/
    agents-python/    # Optional future Python agent services
  docs/
```

This structure should be introduced incrementally. The first step is not moving files. The first step is creating cleaner boundaries in place: domain route modules, typed services, typed storage calls, and a shared config contract.

Package manager recommendation:
- Stay on npm for the first stabilization branch.
- Consider npm workspaces when packages are introduced.
- Consider pnpm only after the repo is stable enough that package manager churn is not mixed with application repair.

## 6. What Must Not Change In The First Stabilization Branch

The first stabilization branch should avoid:

- No Vite to Next.js migration.
- No Express to another backend framework migration.
- No ORM replacement.
- No Python service extraction.
- No Supabase migration.
- No auth/session redesign.
- No payment provider redesign.
- No database schema redesign beyond compile-critical fixes.
- No route architecture rewrite.
- No UI redesign or component library replacement.
- No major dependency upgrades unless required for a specific blocker.
- No deployment platform change.
- No broad formatting churn.

The first branch should only make the current app easier to boot, typecheck, and reason about. That means fixing missing symbols, duplicate imports, missing direct dependencies, obvious type declarations, missing mock exports, and configuration failures with the smallest possible changes.
