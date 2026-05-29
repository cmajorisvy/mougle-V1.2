# Mougle Production House — File Manifest

Snapshot of the **Production House** unit (`/admin/production-house` + `/api/admin/production-house/*`)
extracted for isolated inspection in Codex. No secrets, no `node_modules`, no DB dumps,
no `client/public/downloads/`, no `.env*` are included.

---

## 1. Included files

### Frontend (React + shadcn/ui)
- `client/src/pages/admin/ProductionHouse.tsx` — main Production House page; sidebar of 40+
  sub-sections (Dashboard, Prompt Studio, Room Creator, Avatar Creator, Newsroom Builder,
  Podcast Builder, Hall Builder, 4D Cue Timeline, Unreal Sandbox, Real Unreal Dry-Run,
  Approval Board, Production Wizard, etc.) and an embedded Preview Studio hero at the top.
- `client/src/pages/admin/PreviewStudioHero.tsx` — admin-only cinematic mock preview that
  sits at the top of `/admin/production-house`. Renders the safety strip, mode rail,
  layout/camera/lighting controls, the cinematic canvas (panels + avatar markers +
  ledwall/lower-third/ticker overlays), the timeline strip with 4D cue markers, and a
  right-side inspector. Talks only to `/api/admin/production-house/preview-studio/*`.
- `client/src/pages/admin/AutopilotNewsroom.tsx` — Autopilot newsroom dashboard (preview).
- `client/src/pages/admin/NewsroomPackage.tsx` — Newsroom package builder UI (data + assets).
- `client/src/pages/admin/CinemaControl.tsx` — 4D Cinema Control MVP UI.

### Shared (typed schemas, Zod + TS)
- `shared/production-house.ts` — **single source of truth** for: Production House schemas
  (rooms, avatars, panels, media packages, Unreal/4D dry-run contracts, safety envelope),
  and the new **Preview Studio** block (`PreviewStudioMode`, `PreviewStudioLayoutPreset`,
  `PreviewStudioCameraPreset`, `PreviewStudioLightingPreset`, `PreviewStudioControls`,
  `PreviewStudioScene`, `PreviewStudioState` with locked safety fields, plus
  `PreviewStudioGenerateInput` / `PreviewStudioUpdateControlsInput`).
- `shared/4d-cinema-manifest.ts` — 4D cinema manifest types.
- `shared/render-manifest.ts` — render manifest types.
- `shared/newsroom-schema.ts` / `shared/newsroom-types.ts` — newsroom data types.
- `shared/autopilot-newsroom.ts` — autopilot newsroom types.

### Server routes (Express v5; all root-admin gated)
- `server/routes/production-house-routes.ts` — registers `/api/admin/production-house/*`
  for the main Production House services (overview, rooms, avatars, packages, history,
  wizard, asset library, package viewer, readiness, approval, Unreal sandbox/bridge/
  dry-run, 4D sandbox, etc.).
- `server/routes/preview-studio-routes.ts` — registers
  `/api/admin/production-house/preview-studio/*` with:
  - `GET /state`            — latest sealed preview state
  - `GET /defaults`         — default scene for every mode
  - `GET /tooltips`         — tooltip dictionary
  - `GET /history`          — every state generated in this process lifetime
  - `POST /generate`        — generate a new state for a given mode
  - `POST /update-controls` — merge partial control changes into latest state
- `server/routes/autopilot-newsroom-routes.ts` — autopilot newsroom endpoints.
- `server/routes/newsroom-preview-routes.ts` — newsroom preview endpoints.
- `server/routes/cinema-control-routes.ts` — 4D Cinema Control endpoints.
- `server/routes.ts` — main router; included as **reference** so reviewers can see exactly
  where `registerProductionHouseRoutes` and `registerPreviewStudioRoutes` are mounted and
  in what order relative to the `/{*path}` catch-all. NOTE: this file references many
  routes outside the Production House unit — do not treat it as the unit's surface area.

### Server services (in-memory + storage adapter; no provider sockets in this MVP)
- `server/services/production-house-service.ts` — main Production House service:
  scene/manifest construction, OpenAI prompt orchestration (mocked or strictly internal),
  banned-field stripping, manual-trigger-only safety, manifest history, asset library,
  package viewer, readiness scoring, approval board, Unreal dry-run validators,
  4D cue planning. All outputs carry the safety envelope.
- `server/services/production-house-storage.ts` — `IProductionHouseStorage`
  adapter (current implementation is in-memory; designed so a future Drizzle adapter can
  drop in without touching routes/services).
- `server/services/preview-studio-service.ts` — in-memory Preview Studio service.
  Contains `MODE_DEFAULTS` for all 9 modes (`newsroom`, `breaking_news`, `podcast`,
  `debate`, `interview`, `market_watch`, `hall_event`, `youtube_social`, `fourd_cinema`).
  Every state is sealed with safety-locked fields regardless of client input.
  Exports `_resetPreviewStudioForTests` for the test suite.
- `server/services/avatar-video-render-service.ts` — avatar video render scaffolding.
- `server/services/newsroom/` — newsroom orchestration helpers.
- `server/services/newsroom-data-package-service.ts` — newsroom data package builder.
- `server/services/social-distribution-approval-service.ts` — approval queue for
  social distribution (publishing remains disabled).
- `server/services/unreal-bridge-contract.ts` — Unreal bridge contract validator
  (validation only; never opens a socket).
- `server/services/cinema-control-service.ts` — 4D cinema control orchestrator (mock).
- `server/services/four-d-sandbox.ts` — 4D cue sandbox (cue planning only; never
  dispatches a hardware command).
- `server/services/render-mp4-service.ts` / `render-srt-service.ts` /
  `render-text-fitting.ts` — render-side helpers.

### Server bootstrap (reference)
- `server/vite.ts` — dev SPA fallback; includes the **`/api/*` JSON 404 guard** added
  with this work so missing API routes can no longer masquerade as healthy HTML.
- `server/static.ts` — production SPA fallback; same JSON-404 guard.
- `server/middleware/admin-auth.ts` — `requireRootAdmin` middleware used by every route.

### Tests
- `tests/production-house.test.ts` — Production House route + service tests
  (root-admin gating, safety envelope, banned-field stripping, dry-run behavior).
- `tests/preview-studio.test.ts` — Preview Studio route + service tests
  (16 tests across 4 suites; see `PRODUCTION_HOUSE_TEST_PLAN.md`).
- `tests/autopilot-newsroom.test.ts` — autopilot newsroom tests.
- `tests/newsroom-claim-extraction.test.ts` — claim extractor tests.
- `tests/newsroom-clustering.test.ts` — clustering tests.
- `tests/newsroom-data-package-service.test.ts` — newsroom data package tests.
- `tests/newsroom-package-builder.test.ts` — newsroom package builder tests.
- `tests/newsroom-zod.test.ts` — newsroom Zod schema tests.

### Config / repo metadata
- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`,
  `postcss.config.js`, `components.json`, `replit.md`, `.gitignore`.
  (`tailwind.config.ts` is not present in this repo — Tailwind v4 config lives in CSS.)

### Reports
- `docs/reports/CODEX_MOUGLE_AI_PRODUCTION_HOUSE_REPORT.md`
- `docs/reports/CODEX_MOUGLE_4D_CINEMA_CONTROL_MVP_REPORT.md`
- `docs/reports/CODEX_REAL_UNREAL_RENDER_PREVIEW_CONTRACT_REPORT.md`
- `docs/reports/CODEX_REAL_UNREAL_SET_LIGHTING_DRY_RUN_REPORT.md`
- `docs/reports/CODEX_REAL_UNREAL_SET_PANELS_DRY_RUN_REPORT.md`
- `docs/reports/CODEX_PHASE_1A_RENDER_PIPELINE_AUDIT.md`
- `docs/reports/CODEX_PHASE_1B_NEWSROOM_DATA_PACKAGE_REPORT.md`
- `docs/reports/CODEX_PHASE_1B_NEWSROOM_PACKAGE_BUILDER_REPORT.md`
- `docs/reports/CODEX_PHASE_1B_RENDER_MANIFEST_REPORT.md`

---

## 2. Routes included

All routes are session-based and gated by `requireRootAdmin`. Any missing `/api/*` path
returns JSON `{ok:false, error:"not_found"}` thanks to the new SPA-fallback guard.

### `/api/admin/production-house/*` (`production-house-routes.ts`)
- Overview, rooms, avatars, packages, history.
- Wizard, asset library, package viewer.
- Readiness center, approval board.
- Unreal sandbox, Unreal bridge contract.
- Real Unreal dry-run (`prepare-scene`, `set-camera`, `set-lighting`, `set-panels`,
  `render-preview`, command approval, level-load contract, safety switch, migration plan).
- 4D sandbox.
- Room generator, avatar creator, production units, media pipeline,
  news-to-debate, production preview, production wizard, history, audit, settings.

### `/api/admin/production-house/preview-studio/*` (`preview-studio-routes.ts`)
- `GET /state`, `GET /defaults`, `GET /tooltips`, `GET /history`
- `POST /generate`, `POST /update-controls`

### `/api/admin/cinema-control/*` (`cinema-control-routes.ts`)
- 4D Cinema Control MVP routes.

### `/api/admin/autopilot-newsroom/*` and `/api/admin/newsroom-preview/*`
- Autopilot newsroom + newsroom preview routes.

---

## 3. Tests included
See `PRODUCTION_HOUSE_TEST_PLAN.md` for the full plan and the suggested Codex debugging
checklist. The Preview Studio suite alone is 16 tests across 4 suites.

---

## 4. Known issues
1. **PR #55** (`fix/public-launch-blockers` → `main`) merge is blocked at the Replit ↔
   GitHub credential layer; no code blocker in this unit. Tracked separately.
2. The `production-house-service.ts` is large (single-file orchestrator). A future
   refactor should split per concern (rooms / avatars / packages / Unreal / 4D), but
   functionality is correct.
3. `server/routes.ts` is included only as a reference — it registers many non–Production
   House routes too. Don't treat it as the unit's surface area.

---

## 5. How to run tests
From the repo root:
```bash
# Just the Preview Studio suite
npx tsx --test tests/preview-studio.test.ts

# Just the Production House suite
npx tsx --test tests/production-house.test.ts

# All Newsroom / Autopilot tests
npx tsx --test tests/newsroom-*.test.ts tests/autopilot-newsroom.test.ts

# TypeScript strict check
npm run check
```

---

## 6. How to start local dev
```bash
npm install
npm run dev
```
Then open:
- `/admin/production-house` (you must be logged in as a root admin)
- The Preview Studio hero is the first element inside `<main>` on that page.

To exercise the Preview Studio API directly:
```bash
curl -i -X POST http://localhost:5000/api/admin/production-house/preview-studio/generate \
  -H "Content-Type: application/json" \
  --cookie "connect.sid=<your-admin-session>" \
  -d '{"controls":{"mode":"debate"}}'
```

---

## 7. Safety assumptions (HARD INVARIANTS)
Every Preview Studio / Production House output must satisfy:
- `realSendAllowed: false`
- `executionEnabled: false`
- `adminPreviewOnly: true`
- `notRendered: true`
- `notPublished: true`
- `noUnrealExecution: true` — no real Unreal command is ever dispatched
- `noFourDHardware: true` — no real 4D hardware command is ever dispatched
- `publicUrl: null` and `signedUrl: null` — never publish, never sign

Service-level guarantees (see `preview-studio-service.ts` `sealState()` and
`production-house-service.ts` banned-field stripper):
- The above fields are written from a server-side constant; the client cannot override
  them even by sending them in the request body.
- No outbound socket is opened by any service in this unit.
- No write to `client/public/`, no PDF/MP4/MP3 to public storage, no signed URL minting.
