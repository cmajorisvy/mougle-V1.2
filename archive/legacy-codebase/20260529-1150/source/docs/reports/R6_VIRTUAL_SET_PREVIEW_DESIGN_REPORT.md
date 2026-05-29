# R6A — Virtual Set Preview Design Report

**Date:** 2026-05-22
**Phase:** R6A of the R-series R3F / WebGL / Unity integration roadmap
**Prompt source:** founder brief — Task #748 "R6 — Virtual set preview design + static prototype"
**Status:** ✅ DONE (R6A) — design only · no code · no schema · no migration · no route · no behavior change
**Maintainer:** root-admin / founder

---

## A. Task title
R6A — Virtual Set Preview Design (design only)

## B. Date
2026-05-22

## C. Prompt / request summary
With R5 in place (R5D–R5K landed the approved-internal 3D asset library, ephemeral signed-preview URLs, and admin lifecycle UIs), Mougle needs a **virtual set preview** layer so News Room, Podcast Room, and Debate Room have a known "set" composed of approved-internal 3D assets (camera + lighting + screen-panel layout). R6A locks the design; R6B will land a static admin-only prototype under `/admin/virtual-set-preview`.

## D. Goal
Lock the **scene-package manifest TypeScript shape**, the **three set types** (`newsroom` / `podcast_room` / `debate_room`), the **camera / lighting presets**, the **screen-panel layout**, the **safety envelope**, and the **open questions** for founder review before any code lands. No DB tables, no server routes, no behavior change in R6A.

## E. Scope (R6A)
- This one design document
- One row added to `docs/library/INDEX.md` (added in the R6B task alongside the R6B report row)
- Zero code, zero schema, zero migration, zero route, zero behavior change

## F. Explicit non-goals (R6A)
- ❌ No edit to `shared/schema.ts`
- ❌ No new DB tables (manifests live in code in R6; DB-backed scene packages are a later task)
- ❌ No new server route / service / middleware
- ❌ No new client page or route
- ❌ No render execution, no Remotion, no Unity, no Unreal, no 4D hardware, no publishing
- ❌ No provider call (OpenAI / Meshy / Runway / ElevenLabs / HeyGen / Unreal / 4D hardware)
- ❌ No customizable per-shot camera / lighting (only named presets)
- ❌ No real video / image on the screen panels (R6 leaves them as labeled empty frames)
- ❌ No animations, no timelines
- ❌ No multi-user collaboration on a scene
- ❌ No edit to R5* services (R6 is a read-only consumer of R5H signed-preview-URL endpoint)

---

# 1. Scene-package manifest (TypeScript-level shape — R6 lives in code, not in DB)

```ts
// client/src/components/production-house/virtual-sets/types.ts (R6B)

export type SetType = "newsroom" | "podcast_room" | "debate_room";

export type CameraPresetId =
  | "wide_master"
  | "anchor_medium"
  | "two_shot"
  | "podium_wide"
  | "side_three_quarter";

export type LightingPresetId =
  | "neutral_studio"
  | "warm_podcast"
  | "high_key_debate";

export type AssetSlotKind =
  | "chair"
  | "desk"
  | "anchor_stand"
  | "podium"
  | "mic_stand"
  | "screen"
  | "prop"
  | "light"
  | "camera";

export interface AssetSlot {
  /** Stable id, unique inside a manifest, used as React key + test id. */
  id: string;
  /** Slot kind; constrains which `approved_internal` assets may fill it. */
  kind: AssetSlotKind;
  /** Human-readable description shown in the admin UI. */
  label: string;
  /** Local position in meters. */
  position: [number, number, number];
  /** Euler rotation in radians, XYZ. */
  rotation: [number, number, number];
  /** Uniform scale (1.0 = real-world). */
  scale: number;
  /** True if this slot is required for the set to render. */
  required: boolean;
}

export interface ScreenPanel {
  id: string;
  label: string;
  /** Panel center in meters. */
  position: [number, number, number];
  /** Panel rotation (Euler, XYZ). */
  rotation: [number, number, number];
  /** Width × height in meters. */
  size: [number, number];
  /** Decorative caption rendered on the empty frame (e.g. "Anchor screen"). */
  caption: string;
}

export interface SafetyEnvelope {
  readonly adminOnly: true;
  readonly staticPrototype: true;
  readonly noDataBinding: true;
  readonly noRender: true;
  readonly noPublishing: true;
  readonly noProviderCalls: true;
}

export interface ScenePackageManifest {
  setType: SetType;
  title: string;
  description: string;
  assetSlots: AssetSlot[];
  cameraPreset: CameraPresetId;
  lightingPreset: LightingPresetId;
  screenPanels: ScreenPanel[];
  safetyEnvelope: SafetyEnvelope;
}
```

Notes:
- **No `assetId` field on `AssetSlot`.** The admin UI picks an `approved_internal` asset *per slot* at render time from the R5H list endpoint; the manifest only declares *what kind* of asset is allowed in the slot. This keeps the manifest deterministic and prevents accidental binding to a specific asset id that may later be archived.
- **No bespoke camera or lighting values.** Only the preset id appears in the manifest. Preset bodies (FOV, position, intensity, color) live as constants in the camera/lighting modules and are out-of-scope for per-shot customization in R6.
- `safetyEnvelope` is a readonly typed marker — every manifest must declare the envelope explicitly. The R6B component refuses to render any manifest that doesn't carry all six `true` flags.

---

# 2. Set types

R6 ships exactly three set types. Each set type has exactly **one** static manifest in R6B.

## 2.A `newsroom`

```
                              [screen panel: "World map"]
                                       ┌────────────┐
                                       │            │
                                       │            │
                                       └────────────┘
                              [anchor_stand]
                                  ┌───┐
              [camera·wide]       │   │       [camera·anchor]
                  □               │ A │               □
                                  └───┘
                              [desk · long]
                          ╔══════════════════╗
                          ║                  ║
                          ╚══════════════════╝
                         [chair·1]    [chair·2]
                            ▢            ▢
```

- Camera preset: `wide_master` (default), `anchor_medium`, `two_shot`
- Lighting preset: `neutral_studio`
- Required slots: 1 anchor_stand · 1 desk · 2 chairs · 1 screen
- Optional slots: props (mug, microphone), lights (key, fill)

## 2.B `podcast_room`

```
                          [screen panel: "Show title"]
                              ┌───────────────┐
                              │               │
                              └───────────────┘

         [mic_stand]                              [mic_stand]
             │                                        │
             │                                        │
        ┌────┴────┐                              ┌────┴────┐
        │ chair·1 │      [desk · round]          │ chair·2 │
        └─────────┘   ╔════════════════════╗     └─────────┘
                      ║                    ║
                      ╚════════════════════╝
                              [camera·two_shot]
                                     □
```

- Camera preset: `two_shot` (default), `wide_master`, `side_three_quarter`
- Lighting preset: `warm_podcast`
- Required slots: 2 chairs · 2 mic_stands · 1 desk · 1 screen
- Optional slots: props (notebook, mug)

## 2.C `debate_room`

```
                       [screen panel·left]       [screen panel·right]
                          ┌──────────┐              ┌──────────┐
                          │  Side A  │              │  Side B  │
                          └──────────┘              └──────────┘

              [podium·A]                                          [podium·B]
                 ┌─┐                                                 ┌─┐
                 │A│                                                 │B│
                 └─┘                                                 └─┘

                                  [camera·wide_master]
                                          □
                                  [camera·side_three_quarter]
                                          □
```

- Camera preset: `wide_master` (default), `podium_wide`, `side_three_quarter`
- Lighting preset: `high_key_debate`
- Required slots: 2 podiums · 2 screens
- Optional slots: props (water bottle), lights (key per side)

---

# 3. Allowed asset types per slot

Every slot kind below must already be expressible as an `approved_internal` `production_assets` row (R5C lifecycle: `uploaded → validated → license_reviewed → safety_reviewed → approved_internal`). R6 does not introduce any new asset class.

| Slot kind | Asset format | Notes |
|---|---|---|
| `chair` | `glb` / `gltf` | Single seat; bound origin = floor center |
| `desk` | `glb` / `gltf` | Rectangular or round; bound origin = floor center |
| `anchor_stand` | `glb` / `gltf` | Vertical stand prop; bound origin = floor center |
| `podium` | `glb` / `gltf` | Lectern; bound origin = floor center |
| `mic_stand` | `glb` / `gltf` | Floor or desk mic; bound origin = base |
| `screen` | `glb` / `gltf` | A 3D frame; **R6 panel face stays empty/labeled** — no video/image binding |
| `prop` | `glb` / `gltf` | Generic prop (mug, notebook, etc.); origin = base |
| `light` | `glb` / `gltf` | A 3D light fixture (no real R3F light bound to it in R6) |
| `camera` | `glb` / `gltf` | A 3D camera prop (no R3F camera bound; R3F camera follows the preset) |

If no `approved_internal` asset of the slot kind exists when the page loads, R6B renders a clearly-labeled **placeholder cube** in that slot. The placeholder is a plain `boxGeometry` with a label sprite — no extra fetch, no extra slot binding.

---

# 4. Camera presets

| Preset id | Description | Position (m) | LookAt (m) | FOV |
|---|---|---|---|---|
| `wide_master` | Wide establishing shot of the whole set | `[0, 2.2, 6.5]` | `[0, 1.2, 0]` | 45 |
| `anchor_medium` | Medium shot of the anchor desk | `[0, 1.7, 3.5]` | `[0, 1.4, 0]` | 35 |
| `two_shot` | Two-host medium-wide | `[0, 1.6, 4.0]` | `[0, 1.3, 0]` | 40 |
| `podium_wide` | Wide on both debate podiums | `[0, 1.8, 5.5]` | `[0, 1.5, 0]` | 50 |
| `side_three_quarter` | Three-quarter side angle | `[3.5, 1.6, 4.0]` | `[0, 1.3, 0]` | 38 |

R6B uses **one** camera preset per page load (chosen by the manifest). No per-shot picker in R6.

---

# 5. Lighting presets

| Preset id | Ambient intensity | Key directional | Fill directional | Notes |
|---|---|---|---|---|
| `neutral_studio` | 0.45 | `[5, 6, 4]` · 1.0 | `[-4, 3, -2]` · 0.3 | Matches existing R5B sandbox |
| `warm_podcast` | 0.40 | `[3, 5, 3]` · 0.9 (warm tint) | `[-3, 3, -1]` · 0.25 | Slightly warmer |
| `high_key_debate` | 0.55 | `[4, 6, 4]` · 1.2 | `[-4, 6, -4]` · 0.5 | Bright + flat |

All values are **intensity caps** — see §11 open question 2.

---

# 6. Screen-panel layout

Each `ScreenPanel` in the manifest is rendered as:
- A `<mesh>` with a thin `boxGeometry` (1cm depth).
- A flat material with a soft border color (`#1f2937`) and a labeled caption (HTML overlay via `<Html>` from drei, or in-mesh text via troika).
- Test id: `screen-panel-{panelId}` — used by R10 E2E.

R6 places **only** the empty/labeled frame. R7+ will introduce a separate manifest field for screen-panel content binding (video texture, image, web view). R6's `ScreenPanel` carries **no** content field — that is the intentional safety envelope.

---

# 7. Safety badges (rendered by R6B page)

The R6B page renders these badges using the same emerald outline style as `client/src/pages/admin/3d-assets/safety-badges.tsx`:

| Badge label | Test id |
|---|---|
| Admin preview only | `badge-admin-preview-only` |
| Static prototype | `badge-static-prototype` |
| No data binding | `badge-no-data-binding` |
| No render | `badge-no-render` |
| No publishing | `badge-no-publishing` |
| No provider calls | `badge-no-provider-calls` |
| Approved internal only | `badge-approved-internal-only` |

These map 1:1 onto the `SafetyEnvelope` interface in §1 (one extra badge — `Approved internal only` — carried over from the R5B/R5K sandbox vocabulary).

---

# 8. Data flow (read-only consumer of R5H)

```mermaid
flowchart LR
  AdminUI[/admin/virtual-set-preview] -->|GET ?approvalGate=approved_internal| List[R5H list endpoint]
  List --> Bucket[Approved-internal asset roster]
  Bucket -->|one per slot kind| Pick[Slot picker]
  Pick -->|POST /:id/signed-preview-url ttl=900| Sign[R5H sign endpoint]
  Sign -->|ephemeral URL| Canvas[R3F Canvas <VirtualSet />]
  Canvas -->|useGLTF| Mesh[Approved-internal mesh]
  Pick -.no asset.-> Placeholder[Labeled placeholder cube]
```

R6 does not introduce a single new `/api/...` endpoint. The only two endpoints it consumes both already exist as of R5K.

---

# 9. R3F safety guards (carried over from R5B sandbox)

| Guard | R6B enforcement |
|---|---|
| Lazy Canvas | The `<VirtualSet>` Canvas wrapper is dynamically `lazy()`-imported by the page |
| DPR cap | `dpr={[1, 1.5]}` |
| Frameloop | `frameloop="demand"` |
| GL power | `gl={{ powerPreference: "low-power", antialias: true }}` |
| WebGL fallback | Same `detectWebGL()` pattern as `ProductionCanvasSandbox.tsx` |
| Suspense per slot | Every slot's GLTF load is wrapped in `<Suspense fallback={<Placeholder />}>` |
| ErrorBoundary per slot | Same `GLTFErrorBoundary` pattern; slot falls back to placeholder + error toast |
| No `setState` in `useFrame` | No `useFrame` is used at all in R6B |
| No animation loop | Static scene; only OrbitControls user interaction |
| No texture / HDRI / external model | Confirmed |

---

# 10. Lifecycle gate (R6 is read-only of R5)

R6 introduces **zero** new lifecycle states on `production_assets`. The reader filter is fixed:

```
?approvalGate=approved_internal&status=active&limit=50
```

R6 cannot promote, demote, or modify any asset. R6 cannot mint a signed URL for a non-approved-internal asset (the R5H endpoint refuses).

---

# 11. Open questions for founder review

| # | Question | Suggested default | Effect on R6B if changed |
|---|---|---|---|
| 1 | **Max camera count** per set (does R6 need only the chosen preset, or all five usable in one session?) | One preset per page load (no picker) | If multiple → add a preset dropdown in R6B |
| 2 | **Lighting intensity caps** — are the values in §5 acceptable, or should they be lowered for legal-safety photometric review? | As listed | Touches `lightingPreset` bodies only |
| 3 | **Default scale unit** — meters everywhere? | Meters | Manifest comments stay as written |
| 4 | **FPS cap** — leave `frameloop="demand"` (no continuous render)? | Yes | If a continuous loop is requested later it requires a new safety review |
| 5 | **Placeholder color** — neutral grey vs the R5B fuchsia? | Neutral grey `#3b3b4a` | Visual only |
| 6 | **OrbitControls limits** — same as R5B sandbox (`maxPolarAngle = π/2 - 0.05`, `minDistance = 3`, `maxDistance = 14`)? | Yes | None |
| 7 | **Screen-panel caption font** — drei `<Html>` overlay vs in-mesh troika text? | `<Html>` overlay (lighter weight, no extra font asset) | Choose one in R6B |
| 8 | **Asset slot kind allow-list growth** — locked at the 9 kinds in §3 for R6? | Yes | New kinds added only in a separate later task |

---

# 12. Files that will change in R6B (forward look)

| Path | Change |
|---|---|
| `client/src/components/production-house/virtual-sets/types.ts` | NEW — TypeScript types (§1) |
| `client/src/components/production-house/virtual-sets/camera-presets.ts` | NEW — preset bodies (§4) |
| `client/src/components/production-house/virtual-sets/lighting-presets.ts` | NEW — preset bodies (§5) |
| `client/src/components/production-house/virtual-sets/manifests.ts` | NEW — three static manifests (one per set type) |
| `client/src/components/production-house/virtual-sets/VirtualSet.tsx` | NEW — `<VirtualSet manifest=… />` component (Canvas + slots + screen-panels) |
| `client/src/pages/admin/VirtualSetPreview.tsx` | NEW — lazy admin page |
| `client/src/App.tsx` | +1 lazy route `/admin/virtual-set-preview` |
| `client/src/pages/admin/AdminDashboard.tsx` | +1 dashboard card under the 3D / 4D / Unreal zone |
| `docs/reports/R6B_STATIC_VIRTUAL_SET_PREVIEW_REPORT.md` | NEW — R6B verification report |
| `docs/library/INDEX.md` | +2 rows (R6A + R6B reports) |
| `replit.md` | No change in R6B (the R6 surface is admin-internal; the System Architecture mention will be folded into a later phase if the surface stays) |

**Zero edits** in R6B to: `shared/schema.ts`, `migrations/`, any `server/**` file, any existing R5* service or route, `R3FPreviewSandbox.tsx`, `ProductionCanvasSandbox.tsx`, `sandbox-cube.glb`, `scripts/generate-r3f-demo-glb.mjs`.

---

# 13. Hard safety invariants (must hold for every R6 surface)

| Invariant | Enforcement |
|---|---|
| Admin auth | `/admin/virtual-set-preview` rendered behind the same admin-gate posture as the rest of the admin dashboard. No `requireAdmin` middleware change because R6 introduces no new server route. |
| No DB tables | Manifests live in code only; no `shared/schema.ts` change |
| No new server routes | R6 only reads R5H |
| No `publicUrl` / `signedUrl` persistence | Signed URLs are held in component state only, dropped on unmount or set-type switch |
| No render execution / live / Unity / Unreal / 4D hardware / publishing | No surface in R6 touches any of those pipelines |
| No provider call | No OpenAI / Meshy / Runway / ElevenLabs / HeyGen / Unreal client constructed |
| No `realSendAllowed` / `executionEnabled` reads | Confirmed |
| No write to `production_assets` | R6 is read-only |
| Static prototype only | Manifests are constants; no DB-driven scene packages in this phase |

---

# 14. Verification checklist (for the R6B build)

1. `npm run build` passes.
2. `npx tsc --noEmit -p tsconfig.json` — zero new diagnostics on R6 files.
3. `grep -RIn "publicUrl" client/src/components/production-house/virtual-sets client/src/pages/admin/VirtualSetPreview.tsx` returns no matches.
4. `grep -RIn "fetch\\|axios" client/src/components/production-house/virtual-sets` returns no matches (the page is the only fetch site).
5. Loading `/admin/virtual-set-preview` with no approved-internal assets renders three placeholder cubes (one per required slot of the chosen set type) and no errors.
6. Switching set type (newsroom → podcast → debate) re-mounts the Canvas; no signed URL leaks across set types.
7. Existing `/admin/r3f-preview-sandbox`, `/admin/3d-assets`, and `/admin/dashboard` continue to load unchanged.

---

## Compliance with `docs/DEVELOPMENT_DOCUMENTATION_POLICY.md` §3 (20-field block)

| Field | Value |
|---|---|
| G — Files changed | This file only (R6A) |
| H — Routes changed | None |
| I — Backend changes | None |
| J — Schema changes | None |
| K — Admin/dashboard changes | None |
| L — Safety gates affected | None (declaratively documents envelope; R6B enforces) |
| M — Approval gates affected | None |
| N — Tests run | N/A (design only) |
| O — Results | N/A |
| P — Risks | Low — design-only; R6B is the build risk surface |
| Q — Rollback | Delete this file |
| R — Follow-ups | R6B build task (this same Task #748) |
| S — Archive checked | Yes — R3F sandbox (R5B), R5C plan, R4 design, archive library index — none of them already contained a virtual-set composer |
| T — Source behavior changed | No |
