# RESUME_REPORT

## Master Repository Audit (Prompt 0)
- Date (UTC): 2026-04-30
- Checkpoint branch: `chore/master-audit-report-refresh`
- Audit goal: recover and stabilize existing app without redesigning architecture or removing existing modules.

## Commands Run
1. `npm install`
2. `npm run check`
3. `npm run db:push`
4. `npm run dev`

## What Works
- `npm install` completes and dependencies resolve.
- `npm run check` launches TypeScript compiler and surfaces actionable compile diagnostics.

## What Fails
- `npm run check` fails with existing cross-cutting TypeScript issues (frontend + backend + shared schema typing).
- `npm run db:push` fails due to missing database configuration (`DATABASE_URL`).
- `npm run dev` fails during server startup because database URL is required at boot.

## Exact Errors
### 1) Typecheck (`npm run check`)
Representative blocking categories observed:
- **Missing client exports / implicit any**
  - `chartData` missing from `@/lib/mockData`
  - `articles` missing from `@/lib/mockData`
  - implicit `any` callback params in article pages
- **Admin/dashboard symbol gaps**
  - unresolved `token` in `client/src/pages/admin/AdminDashboard.tsx`
- **3D/UI typing gaps**
  - `troika-three-text` declaration missing
  - possible null renderer access in scene files
- **Server route instability (`server/routes.ts`)**
  - duplicate identifier `reputationService`
  - unresolved symbols (`verifyAdminToken`, `networkGravity`, `civilizationMetrics`, `labsApps`, etc.)
  - large number of `req.user` typing failures
- **Storage/schema typing mismatch**
  - Drizzle `insert(...).values(...)` payload type mismatches in `server/storage.ts`
  - `boolean` to `never` assignment errors in `shared/schema.ts`

### 2) Database push (`npm run db:push`)
- `DATABASE_URL, ensure the database is provisioned`

### 3) Dev server (`npm run dev`)
- `Error: DATABASE_URL must be set. Did you forget to provision a database?`

## Risky Files (highest immediate stabilization risk)
1. `server/routes.ts`
2. `server/storage.ts`
3. `shared/schema.ts`
4. `client/src/pages/admin/AdminDashboard.tsx`
5. `client/src/pages/ArticleDetail.tsx`
6. `client/src/pages/Articles.tsx`
7. `client/src/scenes/DebatesScene.ts`
8. `client/src/scenes/GenericScene.ts`
9. `client/src/scenes/HomeScene.ts`
10. `client/src/ui/Button3D.ts` / `client/src/ui/Text3D.ts`

## Blocking Environment Gap
- `DATABASE_URL` is not configured in the environment, preventing migration push and local server boot.

## Next 10 Tasks (stabilization-first)
1. Provision PostgreSQL and set `DATABASE_URL` in local env.
2. Re-run `npm run db:push` and confirm schema sync.
3. Remove duplicate `reputationService` declaration in `server/routes.ts`.
4. Add/restore missing exports in `client/src/lib/mockData` (`chartData`, `articles`).
5. Fix unresolved admin symbols and missing guards in `AdminDashboard.tsx`.
6. Add Express `Request` user typing augmentation (or align auth middleware typings) for `req.user` access.
7. Restore/define missing route-scope symbols in `server/routes.ts` (`verifyAdminToken`, `networkGravity`, `civilizationMetrics`, `labsApps`, etc.).
8. Fix Drizzle insert payload typing in `server/storage.ts` with explicit insert model types.
9. Resolve `shared/schema.ts` `boolean -> never` typing issues at source definitions.
10. Add `troika-three-text` type declaration and null guards for scene renderers, then rerun `npm run check`.
