# R7 — Avatar Rig Visual Preview (Admin-Only, Visual-Only) — Report

**Task:** R7 — Avatar rig visual preview (admin-only, visual-only)
**Status:** ✅ Complete
**Phase posture:** Visual only. **No provider, no voice, no video, no lip-sync, no render execution, no publishing.**

---

## 1. What R7 added

R7 unlocks an admin-only static visual preview of an avatar rig inside the existing R3F safety envelope so future production-grade avatar work has a place to inspect rig topology and basic pose state.

**New surface:** `/admin/avatar-rig-preview` (lazy admin route).

### UI

- Rig info panel: **rig name**, **joint count**, **root joint name** (read from the loaded GLB).
- **T-pose / A-pose toggle** — pure pose change, no animation timeline, no interpolation.
- Orbit controls, grid, joints rendered as small spheres, bones rendered as line segments.
- All R3F sandbox safety badges + new **"Visual only — no provider, no voice, no video"** badge + explicit **"No voice generation"** and **"No video generation"** badges.
- Dashboard card surfaced under the **3D / 4D / Unreal** zone in `AdminDashboard`.

### Demo rig source

- Single static demo GLB at `client/public/demo-assets/avatar-rig-demo.glb` (~1.4 KB, JSON-chunk-only, no BIN, no buffers, no mesh, no skin, no material, no animation, no texture).
- 20-node humanoid joint hierarchy in T-pose (`Root → Hips → Spine → Chest → Neck/Head + Left/Right Shoulder/UpperArm/LowerArm/Hand + Left/Right UpperLeg/LowerLeg/Foot`).
- Generated locally by the one-shot Node script `scripts/generate-r7-avatar-rig-demo-glb.mjs` (zero external dependencies). Mathematically generated — **no third-party rig data**. Treated as `internal_only` under the R4 metadata model.

---

## 2. Files added / changed

| Change | Path |
|---|---|
| Added (page) | `client/src/pages/admin/AvatarRigPreview.tsx` |
| Added (canvas component) | `client/src/components/production-house/r3f/AvatarRigCanvas.tsx` |
| Added (demo GLB) | `client/public/demo-assets/avatar-rig-demo.glb` |
| Added (generator script) | `scripts/generate-r7-avatar-rig-demo-glb.mjs` |
| Updated (demo-asset README) | `client/public/demo-assets/README.md` (provenance + license for the new GLB) |
| Updated (router) | `client/src/App.tsx` — lazy route `/admin/avatar-rig-preview` |
| Updated (dashboard) | `client/src/pages/admin/AdminDashboard.tsx` — new card in `studio-3d-4d` zone |
| Added (this report) | `docs/reports/R7_AVATAR_RIG_VISUAL_PREVIEW_REPORT.md` |
| Updated (library index) | `docs/library/INDEX.md` (row appended to §E) |

**No schema change. No migration. No new route on the server. No new env-secret read. No new provider client. No `apiRequest` / `fetch` from this surface.**

---

## 3. Safety envelope — what R7 does NOT do

Hard out-of-scope guarantees (verified by source inspection):

| Excluded | Verified by |
|---|---|
| HeyGen / ElevenLabs / Runway / any avatar-as-a-service call | `AvatarRigPreview.tsx` and `AvatarRigCanvas.tsx` contain **no `fetch`, no `apiRequest`, no `import` of any provider client, no env-secret read**. |
| Voice generation, audio playback, microphone | No `<audio>`, no `Audio`, no `MediaSource`, no `getUserMedia`. |
| Video generation, render, export, publishing | No `<video>`, no render endpoint, no publish endpoint. |
| Lip-sync, blendshape animation, motion capture, animation loop | No `useFrame` with state updates, no `AnimationMixer`, no `AnimationAction`. |
| Multi-rig comparison, rig editing, rig retargeting | Single static rig only. |
| Server change / schema change / route change | No file touched under `server/`, `shared/`, `drizzle.config.*`, or `migrations/`. |

### R3F performance + safety guards (reused from R3 sandbox)

- Lazy-loaded Canvas inside `<Suspense>` + `<ErrorBoundary>` wrapping `useGLTF`.
- WebGL availability detection with explicit fallback message (no scene if WebGL is unavailable).
- DPR cap `[1, 1.5]`.
- `frameloop="demand"` — no animation loop.
- `gl.powerPreference: "low-power"`.
- No `setState` inside `useFrame`.
- Scene tree cloned per mount via `gltf.scene.clone(true)` so pose-rotation mutations stay local.

---

## 4. T-pose / A-pose mechanics

Pose change is **pure local rotation** applied to two named joints in the cloned scene:

| Joint | T-pose rotation (XYZ rad) | A-pose rotation (XYZ rad) |
|---|---|---|
| `LeftUpperArm` | `[0, 0, 0]` | `[0, 0, -π/4]` |
| `RightUpperArm` | `[0, 0, 0]` | `[0, 0, +π/4]` |

No interpolation, no animation timeline, no clock, no `useFrame` driver. Toggling the pose recomputes world positions of every joint via `getWorldPosition` inside a `useMemo` keyed on `[scene, pose]`, then re-emits the bones/joints visualization.

---

## 5. Downstream

R7 is intentionally a **visual preview**. The downstream task R9 — Production House R3F read-only preview integration — will reuse this rig-loading pattern (and the same R3F safety envelope) inside the Production House console; R10 — Complete 3D/4D/R3F safety + performance E2E suite — will cover R7 in the consolidated safety/perf E2E run. No additional follow-up was opened from R7.
