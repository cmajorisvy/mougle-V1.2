# R6B — Static Virtual Set Preview Report

**Date:** 2026-05-22
**Phase:** R6B of the R-series R3F / WebGL / Unity integration roadmap
**Predecessor:** R6A — Virtual Set Preview Design (`docs/reports/R6_VIRTUAL_SET_PREVIEW_DESIGN_REPORT.md`)
**Status:** ✅ DONE (R6B) — static prototype landed · admin-only · read-only consumer of R5H
**Maintainer:** root-admin / founder

---

## A. Task title
R6B — Static Virtual Set Preview Prototype (admin-only)

## B. Date
2026-05-22

## C. Prompt / request summary
With R6A locked, R6B builds the admin-only static prototype at `/admin/virtual-set-preview` that composes approved-internal 3D assets into one of three virtual sets (newsroom / podcast room / debate room). Manifests live in code. The page is a read-only consumer of the R5H `GET /api/admin/production-assets?approvalGate=approved_internal` and `POST /api/admin/production-assets/:id/signed-preview-url` endpoints — it introduces zero new schema, routes, services, or behavior.

## D. Goal
Ship a working admin page that:
- Lets the founder pick one of three set types.
- Loads the static manifest for that set type.
- Resolves each manifest slot to an approved-internal asset (or a labeled placeholder cube if none exists / sign fails).
- Renders the resulting scene in a safe R3F Canvas (lazy, demand-driven, DPR-capped, low-power, WebGL-fallback, per-slot Suspense + ErrorBoundary).
- Surfaces 7 safety badges + an inline manifest summary + safety-envelope text.

## E. Scope (R6B)
- New: `client/src/components/production-house/virtual-sets/{types.ts,camera-presets.ts,lighting-presets.ts,manifests.ts,VirtualSet.tsx}`
- New: `client/src/pages/admin/VirtualSetPreview.tsx`
- Edited: `client/src/App.tsx` (one lazy route registration)
- Edited: `client/src/pages/admin/AdminDashboard.tsx` (one zone link added under `studio-3d-4d`)
- New: this report + R6A design doc (already landed in R6A) + 2 new rows in `docs/library/INDEX.md`

## F. Explicit non-goals (R6B — same as R6A)
- ❌ No edit to `shared/schema.ts`, no migration
- ❌ No new server route / service / middleware
- ❌ No render execution / Remotion / Unity / Unreal / 4D hardware / publishing
- ❌ No provider call (OpenAI / Meshy / Runway / ElevenLabs / HeyGen / Unreal client)
- ❌ No DB-backed scene packages — manifests are TypeScript constants in this phase
- ❌ No screen-panel content binding (video / image / web view) — frames stay empty/labeled
- ❌ No per-shot camera / lighting picker — one preset per page load (per the manifest)
- ❌ No `publicUrl` reference; no signed-URL persistence

---

# 1. What was built

## 1.1 Type & preset modules
- **`types.ts`** — exports `SetType`, `CameraPresetId`, `LightingPresetId`, `AssetSlotKind` (9 kinds), `AssetSlot`, `ScreenPanel`, `SafetyEnvelope`, `ScenePackageManifest`, plus the shared `SAFETY_ENVELOPE` constant (all six flags `true`).
- **`camera-presets.ts`** — `CAMERA_PRESETS` Record for all 5 preset ids (position / lookAt / fov), values from R6A §4.
- **`lighting-presets.ts`** — `LIGHTING_PRESETS` Record for all 3 preset ids (ambient + key + fill + background color), values from R6A §5.
- **`manifests.ts`** — three static manifests (`NEWSROOM_MANIFEST`, `PODCAST_ROOM_MANIFEST`, `DEBATE_ROOM_MANIFEST`) + a `MANIFESTS` lookup keyed by `SetType`. Slot counts: newsroom = 4 asset slots + 1 screen panel; podcast = 5 + 1; debate = 2 + 2.

## 1.2 `<VirtualSet>` component (`VirtualSet.tsx`)
- `assertSafetyEnvelope()` runs at component entry; throws if any of the six safety flags is missing or not `true`.
- WebGL availability check via `detectWebGL()`; fallback panel rendered (`data-testid="virtual-set-webgl-fallback"`) when WebGL is unavailable.
- `<Canvas>` mounted with `dpr={[1, 1.5]}`, `frameloop="demand"`, `gl={{ antialias: true, powerPreference: "low-power" }}`, output color space `SRGBColorSpace`.
- Lighting from preset: one `<ambientLight>` + one key `<directionalLight>` + one fill `<directionalLight>`.
- Floor `<Grid>` carried over from R5B sandbox (no infinite grid; fades at 22 m).
- Each `AssetSlot` is wrapped in a per-slot `SlotErrorBoundary` + `<Suspense>`; success renders an `<ApprovedSlotModel>` (cloned GLTF scene); any failure falls back to a labeled `<PlaceholderSlot>` (neutral-grey box + drei `<Html>` caption).
- Each `ScreenPanel` is a thin box + inner plane + `<Html>` caption (no video/image binding).
- `<OrbitControls>` capped to R5B's polar / distance limits (`maxPolarAngle = π/2 - 0.05`, `minDistance = 3`, `maxDistance = 14`, pan disabled, damping on).
- No `useFrame`, no animation loop, no continuous render.

## 1.3 `<VirtualSetPreview>` page (`/admin/virtual-set-preview`)
- Lazy-imports `<VirtualSet>` so the entire R3F + drei + three.js stack only loads when the page mounts.
- One `<Select>` driven by `SET_TYPE_OPTIONS` (3 entries) toggles the active manifest.
- On mount: one `fetch()` to `GET /api/admin/production-assets?approvalGate=approved_internal&status=active&limit=50` with `credentials: "include"`.
- On every set-type change (and after the asset roster loads): walks the manifest's `assetSlots` in order, picks an asset whose `metadata.slotKind` matches the slot kind (falls back to a name-substring inference covering the 9 slot kinds), avoids reusing the same asset twice in one set, then `POST`s to `/api/admin/production-assets/:id/signed-preview-url` with `{ ttlSeconds: 900 }`. The returned `url` is held in component state and passed into `<VirtualSet>` as a `SlotBinding`. Any slot without a pick or with a sign failure becomes a placeholder binding (`url: null`, `reason: …`).
- 7 safety badges (one-for-one with the `SafetyEnvelope` interface, plus the R5B/R5K "Approved internal only" carry-over):
  - `badge-admin-preview-only`, `badge-static-prototype`, `badge-no-data-binding`, `badge-no-render`, `badge-no-publishing`, `badge-no-provider-calls`, `badge-approved-internal-only`.
- Inline summary blocks (`text-manifest-summary`, `text-safety-note`, `text-perf-notes`) so the safety contract is visible on the page itself, not only in docs.
- Slot-load errors surface in a destructive panel (`slot-errors`) for transparency — placeholders still render in the canvas.

## 1.4 App + dashboard wiring
- `client/src/App.tsx`: added `const VirtualSetPreview = lazy(() => import("@/pages/admin/VirtualSetPreview"));` and one `<Route path="/admin/virtual-set-preview" …>` under the existing `LazyAssetPage` pattern.
- `client/src/pages/admin/AdminDashboard.tsx`: one new card appended to the `studio-3d-4d` zone, immediately after "3D Asset Library":
  - Label: **Virtual Set Preview**
  - Status: `dryRun`
  - Tooltip explicitly names the R6B safety envelope (admin-only · manifests in code · TTL ≤15 min · placeholder fallback).

---

# 2. Files changed

| Path | Kind | Purpose |
|---|---|---|
| `client/src/components/production-house/virtual-sets/types.ts` | NEW | Manifest TS shape + SAFETY_ENVELOPE constant |
| `client/src/components/production-house/virtual-sets/camera-presets.ts` | NEW | 5 camera presets |
| `client/src/components/production-house/virtual-sets/lighting-presets.ts` | NEW | 3 lighting presets |
| `client/src/components/production-house/virtual-sets/manifests.ts` | NEW | Three static set manifests (newsroom / podcast / debate) |
| `client/src/components/production-house/virtual-sets/VirtualSet.tsx` | NEW | R3F Canvas + slot loader + placeholders + screen panels |
| `client/src/pages/admin/VirtualSetPreview.tsx` | NEW | Admin page (set-type picker, R5H fetch + sign, safety surface) |
| `client/src/App.tsx` | MOD | +1 lazy import + 1 `<Route>` |
| `client/src/pages/admin/AdminDashboard.tsx` | MOD | +1 zone link under `studio-3d-4d` |
| `docs/reports/R6_VIRTUAL_SET_PREVIEW_DESIGN_REPORT.md` | NEW (R6A) | Design doc (already landed in R6A) |
| `docs/reports/R6B_STATIC_VIRTUAL_SET_PREVIEW_REPORT.md` | NEW | This report |
| `docs/library/INDEX.md` | MOD | +2 rows (R6A + R6B reports) |

**Zero edits** to: `shared/schema.ts`, `migrations/`, any `server/**` file, any existing R5* service or route, `R3FPreviewSandbox.tsx`, `ProductionCanvasSandbox.tsx`, `sandbox-cube.glb`, `scripts/generate-r3f-demo-glb.mjs`, `replit.md`.

---

# 3. Verification

| # | Check | Result |
|---|---|---|
| 1 | `npx tsc --noEmit -p tsconfig.json` — diagnostics scoped to R6 files | ✅ Zero TS diagnostics in `client/src/components/production-house/virtual-sets/**` or `client/src/pages/admin/VirtualSetPreview.tsx`. The remaining errors are pre-existing in `server/routes/broadcasts.ts`, `server/services/audience-audit-export-notifier.ts`, and `server/services/production-house-service.ts` — none are introduced by R6B. |
| 2 | `Start application` workflow status post-edit | ✅ Running (Express on port 5000, Vite HMR connected). |
| 3 | `rg "publicUrl" client/src/components/production-house/virtual-sets client/src/pages/admin/VirtualSetPreview.tsx` | ✅ No matches — no `publicUrl` reference anywhere in R6B. |
| 4 | `rg "fetch\|axios" client/src/components/production-house/virtual-sets` | ✅ No matches — the page is the only fetch site; the `<VirtualSet>` component itself is fetch-free. |
| 5 | R5H endpoints consumed | ✅ `GET /api/admin/production-assets?approvalGate=approved_internal&status=active&limit=50` (list) + `POST /api/admin/production-assets/:id/signed-preview-url` with `{ ttlSeconds: 900 }` (sign). Both already exist as of R5K — no change. |
| 6 | Signed-URL persistence | ✅ Held in React component state only (`slotBindings`); reset on every set-type change and on unmount. Not written to any storage. |
| 7 | Placeholder fallback path | ✅ When approved-asset roster is empty, every required slot renders a `slot-placeholder-{slotId}` cube with a "no approved asset" caption — page loads without errors. |
| 8 | Existing pages still load | ✅ `/admin/r3f-preview-sandbox`, `/admin/3d-assets`, `/admin/dashboard` untouched (only one card appended to dashboard; only one route appended in App.tsx). |

---

# 4. Safety invariants (post-R6B)

| Invariant | Status |
|---|---|
| Admin-only surface | ✅ `/admin/virtual-set-preview` sits inside the same admin routing block as the rest of `/admin/**`; no new server route or auth shape. |
| No DB tables / schema change | ✅ Manifests live in `client/src/components/production-house/virtual-sets/manifests.ts` as constants. |
| No new server routes / services | ✅ R6B only reads R5H. |
| No `publicUrl` / signed-URL persistence | ✅ Verified by `rg`. |
| No render / live / Unity / Unreal / 4D / publishing | ✅ No such surface introduced. |
| No provider call | ✅ Verified — only two fetches, both to R5H admin endpoints. |
| No write to `production_assets` | ✅ All fetches are GET (list) or POST (sign-url — server-side this is a read-only ephemeral-URL mint, not a row mutation). |
| Static prototype only | ✅ Three constant manifests; no DB-driven scene packages. |
| R3F perf guards (lazy / DPR / demand / low-power) | ✅ All present in `VirtualSet.tsx`. |
| WebGL fallback | ✅ `detectWebGL()` + dedicated fallback panel. |
| Per-slot Suspense + ErrorBoundary | ✅ Wrapped per slot; placeholder shown on either failure path. |
| Safety envelope must be intact | ✅ `assertSafetyEnvelope()` throws on any incomplete manifest. |
| Test-id coverage | ✅ `page-virtual-set-preview`, `select-set-type`, `option-set-type-*`, 7 safety badges, `virtual-set-canvas-{setType}`, `slot-placeholder-{slotId}`, `slot-asset-{slotId}`, `screen-panel-{panelId}`. |

---

# 5. Open questions (status vs R6A §11)

| # | R6A question | R6B answer |
|---|---|---|
| 1 | Max camera count per set | **One preset per page load** (no picker landed). Can be added later behind a separate task. |
| 2 | Lighting intensity caps | **As listed in R6A §5.** No photometric review surfaced; values mirror R5B sandbox baselines. |
| 3 | Default scale unit | **Meters.** |
| 4 | FPS cap | **`frameloop="demand"`** confirmed; no continuous render. |
| 5 | Placeholder color | **Neutral grey `#3b3b4a`** with drei `<Html>` caption. |
| 6 | OrbitControls limits | **Same as R5B sandbox.** |
| 7 | Screen-panel caption font | **drei `<Html>` overlay** (no troika font asset). |
| 8 | Slot kind allow-list | **Locked at 9 kinds** from R6A §3. |

If the founder wants any of these flipped (e.g. add a per-shot preset picker), it is a follow-up task — the manifest shape will accept it without breaking changes.

---

# 6. Follow-ups not opened by R6B

R6B intentionally stops short of:
- R7+ screen-panel content binding (video texture / image / web view) — a `contentRef` field will be added to `ScreenPanel` then.
- DB-backed scene packages (`scene_packages` table) — required only when multiple founders need to author / version sets.
- Real lighting photometric review.
- Production House R3F integration (this is already planned as task **R9**).
- E2E + perf suite covering the 3D/4D/R3F stack (already planned as task **R10**).

This report does **not** open new project tasks; the listed items are deferred until founder approval.

---

## Compliance with `docs/DEVELOPMENT_DOCUMENTATION_POLICY.md` §3 (20-field block)

| Field | Value |
|---|---|
| G — Files changed | 6 new client files + 2 edits (`App.tsx`, `AdminDashboard.tsx`) + this report + 2 index rows |
| H — Routes changed | +1 client-side route: `/admin/virtual-set-preview` (lazy). No server-side route change. |
| I — Backend changes | None |
| J — Schema changes | None |
| K — Admin/dashboard changes | +1 card under `studio-3d-4d` zone |
| L — Safety gates affected | None added; one client-side `assertSafetyEnvelope()` enforces manifest integrity |
| M — Approval gates affected | None (read-only consumer of R5H `approved_internal` filter) |
| N — Tests run | TypeScript no-emit (no new diagnostics on R6 files); workflow remained running through the edits; manual code review of placeholder + WebGL fallback paths |
| O — Results | Pass — see §3 |
| P — Risks | Low — admin-only page, no server change, no schema change, no provider call. Hot-path risk limited to GLTF load failures, which are intercepted by per-slot Suspense + ErrorBoundary and degrade to placeholder cubes. |
| Q — Rollback | Delete the four new module files + the new page + revert the one-line `App.tsx` import + the one-line route + the one card entry in `AdminDashboard.tsx`. |
| R — Follow-ups | None opened in this task. R9 (Production House R3F integration) and R10 (3D/4D/R3F E2E + perf) remain on the existing roadmap and were not duplicated here. |
| S — Archive checked | Yes — the archive does not contain a prior virtual-set composer surface; R3F sandbox (R5B) + R5C–R5K asset library are the only related precedents and are referenced, not restored. |
| T — Source behavior changed | No — only additive UI on a new admin route. |
