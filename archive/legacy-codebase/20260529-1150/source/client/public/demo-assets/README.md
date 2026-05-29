# R3F sandbox demo assets

This directory holds **local, repo-committed** demo assets used only by the admin-only R3F preview sandbox at `/admin/r3f-preview-sandbox`. Nothing here is loaded from the network, from a provider, from object storage, or from a private bucket.

## Files

### `sandbox-cube.glb` (1416 bytes)

- **Type:** glTF 2.0 binary (GLB)
- **Contents:** one unit cube (24 vertices, 12 triangles, per-face flat normals). No textures, no materials beyond the runtime-applied R3F `meshStandardMaterial`, no animations, no skins.
- **Source:** generated locally by `scripts/generate-r3f-demo-glb.mjs` (one-shot Node script, zero external dependencies).
- **License:** the binary is mathematically generated from the script in this repo (which is part of the Mougle codebase). No third-party model data is incorporated. Treated as **internal_only** under the R4 metadata model.
- **Purpose:** validates the `useGLTF` (drei) + Suspense + ErrorBoundary path inside the R3F sandbox so R6+ work has a reference loader. No production behavior depends on this asset.

### `avatar-rig-demo.glb` (~1.4 KB)

- **Type:** glTF 2.0 binary (GLB), JSON-chunk-only (no BIN chunk, no buffers).
- **Contents:** a 20-node humanoid joint hierarchy in T-pose (Root → Hips → Spine → Chest → Neck/Head + Left/Right Shoulder/UpperArm/LowerArm/Hand + Left/Right UpperLeg/LowerLeg/Foot). No mesh, no skin, no material, no animation, no texture.
- **Source:** generated locally by `scripts/generate-r7-avatar-rig-demo-glb.mjs` (one-shot Node script, zero external dependencies).
- **License:** the binary is mathematically generated from the script in this repo. No third-party rig data is incorporated. Treated as **internal_only** under the R4 metadata model.
- **Purpose:** drives the R7 admin-only avatar rig visual preview at `/admin/avatar-rig-preview`. Visual only — no avatar provider, no voice, no video, no lip-sync, no render execution.

## Regenerating

```bash
node scripts/generate-r3f-demo-glb.mjs
node scripts/generate-r7-avatar-rig-demo-glb.mjs
```

Both scripts are idempotent — running them again produces the same bytes.
