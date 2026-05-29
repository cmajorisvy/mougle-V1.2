# Mougle V1.1 Admin Route + Link Audit Report

## A. Task title

Audit Mougle V1.1 admin routes and links.

## B. Date

2026-05-24

## C. Branch

`codex/v1-1-admin-route-link-audit`

## D. Goal

Check `AdminDashboard`, client route registration, lazy imports, and dashboard card links. Fix only confirmed broken or stale admin links/imports.

## E. Scope

- Inspected `client/src/App.tsx` admin route registration.
- Inspected `client/src/pages/admin/AdminDashboard.tsx` zone/card links and priority queue links.
- Checked direct and lazy admin imports for missing target files.
- Added a narrow regression test to keep dashboard admin links aligned with registered admin routes.

## F. Findings

- Registered admin routes found in `App.tsx`: 90.
- Unique dashboard admin hrefs found in `AdminDashboard.tsx`: 66.
- Dashboard admin hrefs without a matching registered route: 0.
- Admin page imports checked from `App.tsx`: 86.
- Missing direct/lazy admin import targets: 0.

No confirmed broken or stale admin dashboard links/imports were found, so no admin UI, route, or lazy import behavior was changed.

## G. Files changed

- `tests/admin-dashboard-route-links.test.ts` - new static regression guard for dashboard hrefs and admin page imports.
- `scripts/run-test-suite.cjs` - adds the new audit test to the safe local test suite.
- `docs/reports/MOUGLE_V1_1_ADMIN_ROUTE_LINK_AUDIT_REPORT.md` - this report.
- `docs/library/INDEX.md` - indexes this report.

## H. Production behavior changed

No.

## I. Admin UI changed

No redesign and no visual/admin UI copy change.

## J. Routes changed

No route registration changed.

## K. Lazy imports changed

No lazy import changed.

## L. Database / provider / deploy safety

No DB commands, Supabase writes, migrations, provider commands, render commands, publish commands, or deploy commands were run. No `.env` or secret files were edited.

## M. Validation

- `node --import ./node_modules/tsx/dist/loader.mjs --test tests/admin-dashboard-route-links.test.ts`
- `npm run check`
- `npm run build`

## N. Results

- Targeted admin route/link guard passed: 2 tests passed, 0 failed.
- `npm run check` passed: TypeScript with 4096 MB heap, 147 safe-local tests, safety lint, and R10 perf budget.
- `npm run build` passed.

## O. Remaining warnings

- Existing React Query test warnings about missing `queryFn` / default queryFn.
- Existing Recharts zero-width / zero-height test warning.
- Existing Node `punycode` deprecation warning.
- Existing Vite production chunk-size warning for the large app bundle.

## P. Deferred work

- Browser clicking/smoke navigation of all admin cards was not run in this small phase.
- No new admin routes were added for registered-but-not-surfaced pages; absence from the dashboard is not treated as a broken link.

## Q. Follow-up: PR #5 exact-match review fix

Date: 2026-05-24

Branch: `codex/v1-1-admin-route-link-audit-followup`

PR #5 review noted that the original route/link guard allowed param routes like `/admin/.../:id` to satisfy literal dashboard hrefs like `/admin/.../new`. That could hide a stale or removed literal route.

Fix:

- Dashboard hrefs now pass only when an exact literal `App.tsx` route exists.
- Param-pattern matches are still detected, but they fail with a clear message unless the href is explicitly listed in `PARAM_ONLY_DASHBOARD_HREF_ALLOWLIST`.
- The allowlist is currently empty.
- Targeted guard passed: 2 tests passed, 0 failed.
- `npm run check` passed: TypeScript with 4096 MB heap, 147 safe-local tests, safety lint, and R10 perf budget.
- `npm run build` passed.

No admin UI, `App.tsx` route registration, lazy import, production behavior, DB, Supabase, migration, provider, render, publish, deploy, `.env`, or secret change was made.
