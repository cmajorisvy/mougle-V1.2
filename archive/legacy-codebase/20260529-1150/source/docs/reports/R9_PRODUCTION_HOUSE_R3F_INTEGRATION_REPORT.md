# R9 — Production House R3F Read-Only Integration

**Task:** Task #751 (R9)
**Date:** 2026-05-22
**Status:** Implemented (read-only preview only)

## Scope

Add an admin-only, read-only **3D Preview** tab to the existing Production
House **Production Package Viewer** for every package type
(`news_video`, `podcast_video`, `debate_video`, `social_clip`,
`cinematic_4d_package`, plus the live `MEDIA_PACKAGE_TYPES` —
`news_to_debate`, `news_to_podcast`, `news_to_youtube`, `news_to_social`,
`podcast_to_clips`, `debate_to_clips`, `newsroom_to_4d_cinema`,
`custom_package`).

The new tab reuses, without modification:

- **R6** virtual-set manifests + `VirtualSet` renderer
  (`client/src/components/production-house/virtual-sets/`).
- **R7** `AvatarRigCanvas` (loads the local demo rig only).
- **R5J** signed-preview-URL endpoint
  (`POST /api/admin/production-assets/:id/signed-preview-url`, `ttlSeconds ≤ 900`).

## Out of scope (explicitly deferred)

- No schema changes. The `media_packages` row has no `setManifestId` or
  `rigAssetId` column today, and R9 does **not** add one. A future task
  must add the linkage and admin writeback. R9 surfaces a clearly-labeled
  empty state in that condition.
- No render execution, no publishing, no provider calls, no Unreal
  execution, no 4D hardware, no public URL.

## Files added

- `client/src/components/production-house/Package3DPreviewSection.tsx`
  Lazy-loaded React component that hosts the set + rig preview, the
  set-type picker, the rig toggle, and the safety badge row.

## Files modified

- `client/src/pages/admin/ProductionHouse.tsx`
  - Added `lazy`, `Suspense` imports.
  - Added `Package3DPreviewSection` lazy import.
  - Added `pkgTab` state (`"info" | "preview3d"`) to
    `ProductionPackageViewer`.
  - Rendered a 2-item tab row (`Info & exports` / `3D Preview`) above
    the existing exports + grid, wrapped the existing exports + grid in
    a fragment under the `info` branch, and mounted
    `Package3DPreviewSection` under the `preview3d` branch.

## Behavior

1. Operator loads a production by ID in the existing viewer.
2. The viewer now shows two tabs. The `Info & exports` tab is unchanged.
3. On `3D Preview`:
   - The component reads the package object for any **package-level
     set/rig reference** via `readPackageSetRef(pkg)` /
     `readPackageRigRef(pkg)`, which defensively look at
     `pkg.setManifestId`, `pkg.setType`, `pkg.preview3d.setManifestId`,
     `pkg.metadata.setManifestId`, `pkg.package.setManifestId`,
     `pkg.package.roomRecommendation`, and `pkg.roomRecommendation` for
     the set, and the equivalent rig fields for the rig.
   - The current value (or `"none on row (schema delta deferred)"`) is
     shown in the header (`text-pkg3d-set-ref-status`,
     `text-pkg3d-rig-ref-status`).
   - If a set reference is present, the set panel auto-initializes to
     it. Otherwise, a default set type is inferred from
     `pkg.packageType` (`podcast_*` → `podcast_room`, `debate_*` →
     `debate_room`, else `newsroom`) and the panel renders an empty
     state with an inline set-type picker, a **Choose set** action,
     and a link to `/admin/virtual-set-preview`.
   - Once a set is chosen, the component fetches
     `/api/admin/production-assets?approvalGate=approved_internal&status=active&limit=50`,
     resolves a signed URL per slot via the R5J endpoint, and mounts
     `<VirtualSet />`. The per-slot binding result (asset name, or
     `placeholder · reason`) is listed under
     `pkg3d-set-binding-list`, so the in-tab picker outcome is
     auditable, not just visual.
   - For the rig panel, the component **explicitly gates** approval-bound
     selection: there is no `approved_internal` rig catalog today
     (R5C / R5J cover set props only). The empty state explains the gap
     (`text-pkg3d-rig-catalog-gap`) and the only available action is
     **Load R7 visual stand-in**, which mounts
     `<AvatarRigCanvas pose="t_pose" />` against the committed local
     demo. A persistent amber notice
     (`pkg3d-rig-standin-notice`) keeps that fact visible while the
     stand-in is rendered.
4. Signed URLs are held in component state only, dropped on unmount,
   set change, or clear. The package row is never mutated.

## Safety envelope

Visible on every load of the tab via the badge row:

- Admin only
- Read-only
- No render
- No publishing
- No provider calls
- Approved internal only
- No Unreal execution
- No 4D hardware

The component never calls any write endpoint. The package row, the
production row, and the asset row are all untouched. No
`POST/PUT/PATCH/DELETE` is issued except the existing R5J signed-URL
`POST`, which is itself read-only and audited server-side.

## Verification

- Workflow `Start application` restarts cleanly with the new file in
  place.
- Vite pre-transform of `client/src/pages/admin/ProductionHouse.tsx`
  succeeds (JSX fragment wrapping confirmed).
- Lazy import + Suspense fallback gate every R3F mount; switching tabs
  away unmounts the canvases and drops the signed URLs.

## Follow-ups (not in this task)

- Schema delta: add `setManifestId` + `rigAssetId` (nullable) to the
  package row, plus an admin writeback endpoint and UI control. R9's
  pickers become writeback-capable at that point.
- Approved-internal **rig** asset list (today only the local demo rig
  is rendered; R5/R7 do not yet have an `approved_internal` rig
  catalogue).
