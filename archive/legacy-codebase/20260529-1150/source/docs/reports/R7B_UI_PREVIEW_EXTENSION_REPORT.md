# R7B-UI-Preview-Extension — Permanent Avatar source on R3F preview

**Task:** R7B-UI-Preview-Extension (Task #891)
**Predecessors:** R7B design (`docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md`), R7B-Schema (`docs/reports/R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md`)
**Scope:** UI-only extension of the existing admin R3F preview surface. Pure reuse — no new R3F provider, no new shader, no new physics, no new server route, no schema change.

---

## 1. What shipped

### 1.1 `/admin/avatar-rig-preview` — third source kind

The source picker on `client/src/pages/admin/AvatarRigPreview.tsx` is now driven by a `Source kind` selector with three options:

| Value | Behavior |
|---|---|
| `demo` | Loads the local committed demo GLB at `/demo-assets/avatar-rig-demo.glb` (existing R7 behavior). |
| `approved_rig` | Mints a single signed preview URL via `POST /api/admin/production-rigs/:id/signed-preview-url` and loads it as the rig (existing R5J behavior). |
| `permanent_avatar` | **New.** Lists approved-internal permanent avatars from `GET /api/admin/permanent-avatars?approvalGate=approved_internal&status=active&limit=100` and, on pick, calls `GET /api/admin/permanent-avatars/:id/preview-bundle`, then loads the returned `bodyAssetSignedUrl` + `rigSignedUrl` into the existing R3F canvas. |

The existing T-pose / A-pose toggle continues to function unchanged for all three kinds. The page surface still hard-fails any forbidden provider hostname at the browser network layer via the R10 forbidden-host fetch guard (see §4).

### 1.2 `AvatarRigCanvas` — optional body-asset slot (reuse only)

`client/src/components/production-house/r3f/AvatarRigCanvas.tsx` gained two opt-in props:

```ts
bodyAssetUrl?: string | null;
onBodyAssetError?: (msg: string) => void;
```

When `bodyAssetUrl` is set, a single additional `useGLTF` call loads the body GLB and renders it as a `<primitive />` inside the **same existing R3F `<Canvas>`**, wrapped in the same existing `RigErrorBoundary` + `Suspense` pattern already used by the rig path. **No new provider, no new shader, no new physics, no new scene graph node beyond the existing `<group>` / `<primitive>`.** When the prop is absent (`null` / `undefined`), the body-asset slot renders nothing — the demo and approved-rig paths behave exactly as before.

### 1.3 Parity toggle on `/admin/r3f-preview-sandbox`

The R3F preview sandbox at `client/src/pages/admin/R3FPreviewSandbox.tsx` does **not** expose a rig source picker today — it has a single-asset picker only. The task line "(and on `/admin/r3f-preview-sandbox` if it exposes the same picker)" therefore does not apply. No change was made to that file. The R7B-Cross-Links task will revisit cross-surface entry points.

---

## 2. Ephemeral signed-URL discipline

This is the load-bearing safety invariant of the task. Every line below is enforced in source:

1. **React state only.** `signedRigUrl` and `signedBodyAssetUrl` live in `useState` inside the `AvatarRigPreview` component. They are passed by prop to `AvatarRigCanvas`, which passes them to `useGLTF`. They are never:
   - written to `localStorage` / `sessionStorage` / cookies,
   - written to the wouter route or any query-string parameter,
   - written to React Query cache (the `apiRequest` call is not wrapped in `useQuery`),
   - logged to console or telemetry,
   - serialized into any prop name that would be visible in React DevTools as a persistent identifier.
2. **Source-kind change clears immediately.** The `useEffect` keyed on `sourceKind` calls `setSignedRigUrl(null)` / `setSignedBodyAssetUrl(null)` / `setBundleExpiresAt(null)` on every transition.
3. **Unmount clears immediately.** A `useRef` holds the latest clear closure; an `useEffect(() => () => clear(), [])` runs it on unmount.
4. **Hard 900 s session timer.** A second `useEffect` arms a `setTimeout` at `(900 - 30) * 1000 ms` after every successful fetch. When it fires, it bumps a `bundleFetchTick` state, which re-runs the bundle-fetch effect — automatically minting a fresh body + rig URL before the server-side TTL expires.
5. **Manual refresh.** A `Refresh preview URLs` button on the picker bumps the same tick, so an operator can force a fresh mint at any moment.

The page also displays a constant text note (`data-testid="text-ephemeral-url-note"`) on the permanent-avatar source so the operator can see the invariant in the UI.

---

## 3. Server contract assumed (delivered by R7B-Routes)

This UI task does **not** ship server code. It calls two endpoints that R7B-Routes is responsible for:

| Method | Path | Used for |
|---|---|---|
| `GET` | `/api/admin/permanent-avatars?approvalGate=approved_internal&status=active&limit=100` | List picker |
| `GET` | `/api/admin/permanent-avatars/:id/preview-bundle` | Body + rig signed URLs |

The list endpoint is expected to return `{ ok, items: [{ id, slug?, displayName?, name?, rolePreset? }, ...] }`. The bundle endpoint is expected to return `{ bodyAssetSignedUrl, rigSignedUrl, expiresAt? }` per the design doc (§ design 8.2 and §381). The UI tolerates both top-level shapes and a `{ body: { url, expiresAt }, rig: { url, expiresAt } }` nesting so the route layer can pick either without breaking this page.

While the route is unimplemented, the picker renders `"Failed to load permanent-avatar list."` from the list-error path and `"Failed to fetch permanent-avatar preview bundle (HTTP …)"` from the bundle-error path. Selecting `demo` or `approved_rig` keeps working exactly as before.

---

## 4. Network-guard parity

The R10 forbidden-host fetch tap (see `docs/reports/R10_R3F_3D_4D_E2E_SAFETY_PERFORMANCE_REPORT.md` §C, §C-runtime.9, and the Playwright network tap in `tests/e2e/r10-r3f-3d-4d-route-smoke.spec.ts`) lives at a shared layer (test fixtures + Playwright `page.route`), not inside `AvatarRigPreview.tsx`. The new permanent-avatar code path goes through the same `apiRequest` / `useGLTF` plumbing the existing approved-rig path already uses, so the same guard trips on any provider-host contact. No source change was needed to keep parity — a comment in the picker effect documents this.

---

## 5. Out of scope (intentionally NOT done)

- ❌ No new R3F provider, shader, physics, animation system, or scene graph addition.
- ❌ No lip-sync, voice playback, video generation, render execution, or publishing.
- ❌ No library list / detail / create / review pages — that is R7B-UI-Library.
- ❌ No "Used by permanent avatars" cards on rig / asset detail pages — that is R7B-Cross-Links.
- ❌ No server route work — that is R7B-Routes.
- ❌ No schema change, no migration, no `db:push`.

---

## 6. Files touched

| File | Change |
|---|---|
| `client/src/pages/admin/AvatarRigPreview.tsx` | Source-kind selector with three values; permanent-avatar list + bundle fetch; ephemeral URL state with auto-refresh + unmount-clear; new error surfaces for the body-asset path. |
| `client/src/components/production-house/r3f/AvatarRigCanvas.tsx` | Optional `bodyAssetUrl` / `onBodyAssetError` props; `BodyAssetContents` (single `useGLTF` + `<primitive />`) mounted inside the existing `RigErrorBoundary` + `Suspense` pattern. |
| `docs/reports/R7B_UI_PREVIEW_EXTENSION_REPORT.md` | This report. |
| `docs/library/INDEX.md` | One new row in §E. |

`tsc --noEmit` is clean for both client files.

---

## 7. Verification

- ✅ `npx tsc --noEmit` — no errors involving `AvatarRigPreview` / `AvatarRigCanvas`.
- ✅ The three source-kind transitions clear signed URLs synchronously (state effect keyed on `sourceKind`).
- ✅ The unmount-clear runs even if the bundle fetch is still in flight (the abort guard in the effect prevents a stale `setSignedRigUrl` after unmount).
- ✅ The 900 s auto-refresh timer is keyed on `[sourceKind, signedRigUrl, signedBodyAssetUrl]` so it cancels and re-arms on every fresh mint.
- ✅ The R3F canvas configuration (`dpr={[1, 1.5]}`, `frameloop="demand"`, `gl.powerPreference="low-power"`) is unchanged — the R10 §8 invariant still holds.
