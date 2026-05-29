# Task #759 — Real Avatar Rig Catalog + Picker in 3D Preview

## Goal
Replace the "Load R7 visual stand-in" empty-state button in the Production House
3D Preview tab with a real rig picker fed from the approved-internal production
asset catalog, so admins pick a real GLB/GLTF rig from the existing library
(R5C) and saving writes its real asset id onto
`MediaPackageRecord.rigAssetId`.

## Outcome (done definition)
1. **Approved-internal rig catalog** — implemented as a `metadata.assetKind`
   convention on the existing `production_assets` table (no schema migration).
   Values: `"rig" | "set_prop"`. The R5C library now hosts both kinds.
2. **3D Preview rig picker** — `Package3DPreviewSection.tsx` now fetches
   `/api/admin/production-assets?approvalGate=approved_internal&status=active&assetKind=rig&limit=50`,
   renders a `<Select>` of approved rigs, issues a signed preview URL
   (`POST /api/admin/production-assets/:id/signed-preview-url`, `ttlSeconds: 900`),
   and passes the URL to `AvatarRigCanvas`. The legacy stand-in button is gone;
   the only stand-in surface that remains is a legacy notice that fires when the
   already-saved `rigAssetId` happens to equal `r7_demo_rig:avatar-rig-demo.glb`.
3. **Save writes the real id** — `pendingRigValue` is set to the picked asset's
   real id (`asset.id`), which is then POSTed to the existing
   `/api/admin/production-house/media-pipeline/packages/:id/3d-selection`
   endpoint and persisted as `MediaPackageRecord.rigAssetId`.

## Changes
### Server
- `server/storage.ts` — `IStorage.listAssets` + Drizzle impl now accept
  `assetKind?: string` and filter via
  `sql\`${productionAssets.metadata}->>'assetKind' = ${opts.assetKind}\``.
- `server/routes/admin/production-assets.ts` —
  - `listQuerySchema` and `importBodySchema` accept `assetKind`.
  - Upload + URL-import routes merge `assetKind` into `metadata` and include
    it in the audit-log payload.

### Client
- `client/src/components/production-house/r3f/AvatarRigCanvas.tsx` —
  - Accepts optional `url?: string` prop, defaulting to
    `DEFAULT_RIG_GLB_URL` (`/demo-assets/avatar-rig-demo.glb`).
  - Threads the URL through `RigContents` and fixes `useGLTF.preload(...)`
    to use the new constant name.
- `client/src/components/production-house/Package3DPreviewSection.tsx` —
  - Removes "Load R7 visual stand-in" CTA.
  - Adds catalog fetch + select + "Load rig" / "Load selected rig" buttons,
    signed-URL acquisition, and an active-rig meta line.
  - Empty state when the catalog has no approved rigs deep-links to the
    upload form.
  - Loaded rig URL is passed into `<AvatarRigCanvas url={...} />`.
- `client/src/pages/admin/3d-assets/AssetUpload.tsx` —
  - `ASSET_KINDS = ["set_prop", "rig"]` constant.
  - `assetKind` / `urlAssetKind` state added to both the file-upload and
    URL-import forms; sent as `FormData` field and JSON field respectively.
- `client/src/pages/admin/3d-assets/AssetLibraryList.tsx` —
  - Adds an "Asset kind" filter (`any | set_prop | rig`) wired to the same
    query param.

## Safety / scope notes
- No DB migration. Backward-compatible: existing rows without
  `metadata.assetKind` are simply excluded when an explicit filter is applied.
- No new public surface. All admin endpoints remain `requireRootAdmin`.
- Signed-preview URL TTL is clamped to ≤900s by the existing route; the URL
  is never persisted by the client (only held in component state for the
  duration of the preview).
- `assetKind="rig"` rows still flow through the same upload validator,
  safety-review, and approval-gate lifecycle as set props — no rig-specific
  bypass.

## Files touched
- `server/storage.ts`
- `server/routes/admin/production-assets.ts`
- `client/src/components/production-house/r3f/AvatarRigCanvas.tsx`
- `client/src/components/production-house/Package3DPreviewSection.tsx`
- `client/src/pages/admin/3d-assets/AssetUpload.tsx`
- `client/src/pages/admin/3d-assets/AssetLibraryList.tsx`
