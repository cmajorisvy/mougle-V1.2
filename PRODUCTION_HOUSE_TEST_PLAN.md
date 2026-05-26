# Mougle Production House — Test Plan

This plan is what a reviewer (or Codex agent) should run against the snapshot in
`mougle-production-house-unit.zip` to be confident the Production House and the
Preview Studio behave correctly and within their safety envelope.

---

## 1. API route tests
**Goal:** every route under `/api/admin/production-house/*` and
`/api/admin/production-house/preview-studio/*` responds with JSON and the right
shape.

- `GET /api/admin/production-house/overview` → 200 JSON
- `GET /api/admin/production-house/rooms` → 200 JSON list
- `GET /api/admin/production-house/avatars` → 200 JSON list
- `GET /api/admin/production-house/packages` → 200 JSON list
- `GET /api/admin/production-house/history` → 200 JSON list
- `POST /api/admin/production-house/rooms` → 200 JSON; safety fields locked
- `POST /api/admin/production-house/avatars` → 200 JSON; safety fields locked
- `POST /api/admin/production-house/media-packages/:type` → banned-field strip
  (recursive on `data` object), 200 JSON

Existing automated coverage: `tests/production-house.test.ts`.

---

## 2. Preview Studio tests
**Goal:** the new Preview Studio surface is correct, deterministic, and safe.

Suite (`tests/preview-studio.test.ts`, 16 tests):
1. Missing `/api/...` path returns JSON 404 — not the HTML SPA shell.
2. Each of the 6 routes requires root-admin (returns JSON 401 otherwise).
3. `GET /state` returns a default scene when no `generate` has run yet.
4. `GET /defaults` returns a non-empty scene for **every** of the 9 modes
   (`newsroom`, `breaking_news`, `podcast`, `debate`, `interview`,
   `market_watch`, `hall_event`, `youtube_social`, `fourd_cinema`).
5. `GET /tooltips` returns a JSON dictionary with all expected keys.
6. `POST /generate` works without any third-party env vars
   (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `MESHY_API_KEY`, `RUNWAY_API_KEY`,
   `UNREAL_REMOTE_URL`, `LOCAL_4D_BRIDGE_URL` are deleted before the call).
7. `POST /update-controls` merges partial control changes into the latest state.
8. Invalid body → 400 JSON `{ok:false, error:"invalid_body"}`.

Run:
```bash
npx tsx --test tests/preview-studio.test.ts
```

---

## 3. UI smoke tests
**Goal:** confirm the page renders and the Preview Studio hero responds.

1. `npm run dev`, then open `/admin/production-house` while logged in as root admin.
2. Verify the **Preview Studio hero** sits at the top of `<main>`:
   - Title "Mougle Production Preview Studio".
   - Safety strip: "Admin Preview Only — Not Rendered, Not Published, No Unreal
     Execution, No 4D Hardware".
   - Five safety badges + Mock Mode pill.
   - Mode rail with all 9 modes (`mode-newsroom`, `mode-debate`, …, `mode-fourd_cinema`).
   - Layout / Camera / Lighting selects (`select-layout`, `select-camera`,
     `select-lighting`).
   - 4 toggles (`toggle-led`, `toggle-lower-third`, `toggle-ticker`, `toggle-4d`).
   - Canvas with avatar markers + panels for the chosen mode.
   - Timeline strip with 4D cue markers when `show4dMarkers` is on.
   - Right inspector showing Room / Avatars / Panels / 4D Cues / Safety.
3. Switch modes by clicking the rail buttons; canvas re-renders.
4. Toggle the overlays and edit `lowerThirdText` / `tickerText` (via update-controls
   from devtools or extending the UI) — canvas reflects the change.

---

## 4. Root-admin gating tests
**Goal:** no Production House or Preview Studio route is reachable without root-admin.

- Without an admin session, every route in section 1 + 2 returns JSON 401
  `{message:"Unauthorized"}` (Production House) or
  `{ok:false, error:"unauthorized"}` (Preview Studio test harness).
- `requireRootAdmin` is the only place auth is enforced; no route is mounted
  before it.

---

## 5. Safety invariant tests
**Goal:** the safety envelope cannot be bypassed.

For every Preview Studio state and every Production House output:
- `status === "draft"`, `approvalStatus === "draft"`.
- `visibility === "admin_only_internal"`.
- `publicUrl === null`, `signedUrl === null`.
- `realSendAllowed === false`, `executionEnabled === false`.
- `adminPreviewOnly === true`, `notRendered === true`, `notPublished === true`,
  `noUnrealExecution === true`, `noFourDHardware === true`.
- `safetyEnvelope` deep-equals the canonical `SAFETY_ENVELOPE` from
  `shared/production-house.ts`.

Bypass tests (already in `tests/preview-studio.test.ts`):
- A client `POST /generate` with malicious fields
  (`realSendAllowed:true`, `executionEnabled:true`, `publicUrl:"https://evil"`,
  `signedUrl:"https://evil"`, `notPublished:false`, `status:"published"`)
  must produce an output that still has the locked values.

Network safety:
- `rg "fetch\\(|axios\\.|http\\.request\\(|net\\.connect\\(" server/services/preview-studio-service.ts server/services/production-house-service.ts`
  must return **zero** outbound-network call sites.

---

## 6. Export tests
**Goal:** the snapshot exported in this ZIP is self-contained.

- Confirm no `node_modules/` directory is present.
- Confirm no `.env*` / `*.key` / `*.pem` files are present.
- Confirm no `client/public/downloads/` directory is present.
- Confirm no `*.sql`, `*.dump`, `*.sql.gz`, `*-db-*.zip` files are present.
- Open `package.json` and verify `scripts.dev`, `scripts.check`, and `scripts.build`
  exist.

---

## 7. Missing route 404 JSON tests
**Goal:** the SPA fallback never hides a missing API behind HTML.

- `curl -i http://localhost:5000/api/admin/production-house/does-not-exist`
  must return:
  - HTTP 404
  - `Content-Type: application/json; …`
  - Body: `{"ok":false,"error":"not_found"}`

This guard lives in both `server/vite.ts` (dev) and `server/static.ts` (prod), so
both modes are covered.

---

## 8. Suggested Codex debugging checklist

When something looks off, walk this list top-to-bottom:

1. **Routing**
   - Open `server/routes.ts` and confirm `registerProductionHouseRoutes(app,
     requireRootAdmin)` and `registerPreviewStudioRoutes(app, requireRootAdmin)` are
     both called BEFORE the `/{*path}` catch-all in `server/vite.ts` / `static.ts`.
   - If a route 404s as JSON, the handler simply wasn't registered.
   - If a route 404s as HTML, the JSON-404 guard regressed.

2. **Auth**
   - 401 on every Production House route in a logged-in browser → check that
     `req.session.adminUser?.role === "super_admin"` in `requireRootAdmin`.

3. **Safety regressions**
   - Run the safety subset:
     `npx tsx --test --test-name-pattern "safety" tests/preview-studio.test.ts`.
   - Then grep:
     - `rg "realSendAllowed\\s*:\\s*true" server`
     - `rg "executionEnabled\\s*:\\s*true" server`
     - `rg "publicUrl\\s*:\\s*['\"]https?" server`
     - `rg "noUnrealExecution\\s*:\\s*false" server`
     - `rg "noFourDHardware\\s*:\\s*false" server`
   - All must return zero results inside the Production House / Preview Studio
     surface.

4. **Outbound network**
   - `rg "https?://" server/services/preview-studio-service.ts` → expect zero.
   - `rg "https?://" server/services/production-house-service.ts` → only string
     literals for documentation / mock manifests; never wired into `fetch`.

5. **Frontend mounting**
   - `client/src/pages/admin/ProductionHouse.tsx` must import and render
     `<PreviewStudioHero />` as the first child of `<main>`. If the hero is missing,
     the import was removed.

6. **Type drift**
   - `npm run check` (TypeScript strict). The Preview Studio types live in
     `shared/production-house.ts` and are reused by both client and server.

7. **Test isolation**
   - `_resetPreviewStudioForTests` must be called in `beforeEach` of any new
     Preview Studio test — the module holds in-memory state for the process
     lifetime.
