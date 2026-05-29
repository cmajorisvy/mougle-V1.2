# V1.2 Route Modularization Plan

Date: 2026-05-26
Branch: `cleanup/v1-2-stabilization`

## Current state

- `server/routes.ts` remains the main monolith route file.
- Modular route files already exist under `server/routes/` and `server/routes/admin/`.
- This cleanup completed one safe extraction by introducing `server/routes/registry.ts` and routing existing modular registrations through a single registry call.

## Completed in this cleanup (non-breaking)

- Added `server/routes/registry.ts`.
- Moved only route-group registration wiring (not route behavior).
- Updated `server/routes.ts` to call `registerModularRouteGroups(app, requireRootAdmin)`.

## Route classification map

| Domain | Primary route prefixes | Current source |
|---|---|---|
| auth | `/api/auth/*`, onboarding | `server/routes.ts` |
| users | `/api/users*`, `/api/profile*`, `/api/wallet-status*` | `server/routes.ts` |
| agents | `/api/user-agents*`, `/api/agent-*`, `/api/agents/*` | `server/routes.ts` |
| agent passports | `/api/agents/passport/*`, `/api/passport/verify/*` | `server/routes.ts` |
| vaults | `/api/privacy-*`, `/api/trust-*` patterns (service-backed) | `server/routes.ts` |
| task contracts | `/api/task-contracts*` | `server/routes.ts` |
| approvals | `/api/admin/*/approval*`, `/api/admin/*/approve*` | mixed (`server/routes.ts`, `server/routes/admin/*`, `server/routes/broadcasts.ts`) |
| audit | `/api/admin/*/audit*`, moderation logs, compliance logs | mixed |
| truth | `/api/trust-score/*`, `/api/admin/truth-*`, `/api/evolution/*`, `/api/reality-*` | `server/routes.ts` |
| news | `/api/news*`, `/api/admin/news-*`, newsroom source registry | mixed (`server/routes.ts`, `server/routes/news-sources.ts`) |
| discussions | `/api/posts*`, `/api/topics*`, `/api/comments*` | `server/routes.ts` |
| debates | `/api/debates*`, `/api/admin/live-studio*` | mixed (`server/routes.ts`, `server/routes/playout.ts`) |
| marketplace | `/api/marketplace*`, `/api/razorpay*`, clone review routes | `server/routes.ts` |
| production-house | `/api/admin/production-house*`, `/api/admin/preview-studio*`, `/api/admin/4d-*`, `/api/admin/cinema-control*` | `server/routes/production-house-routes.ts`, `server/routes/preview-studio-routes.ts`, `server/routes/cinema-control-routes.ts` |
| admin | `/api/admin/*` (staff, support, ops, safety, reports) | mixed |
| founder | `/api/admin/founder-*`, `/api/admin/command-center*` | `server/routes.ts`, `server/routes/founder-pto-mode-routes.ts` |
| legacy/experimental | autopilot/newsroom simulation, unreal/4d sandbox routes | `server/routes/autopilot-newsroom-routes.ts`, `server/routes/production-house-routes.ts`, `server/routes/cinema-control-routes.ts` |

## Suggested phased extraction (next PRs)

1. Extract `auth + onboarding` routes from `server/routes.ts` to `server/routes/auth.ts`.
2. Extract `users + profile + wallet` to `server/routes/users.ts`.
3. Extract `marketplace + billing` to `server/routes/marketplace.ts` and `server/routes/billing.ts`.
4. Extract `truth + governance` to dedicated route modules.

Guardrails for each phase:
- No route path changes.
- No auth behavior changes unless explicitly reviewed.
- Run `npm run check` and `npm run build` after each extraction.
