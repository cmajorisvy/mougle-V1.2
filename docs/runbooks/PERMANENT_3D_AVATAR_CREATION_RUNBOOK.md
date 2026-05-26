# Mougle Permanent 3D Avatar Creation Runbook

**Audience:** root admin / founder operator creating the first permanent Mougle 3D avatar character.
**Scope:** end-to-end operator workflow from external authoring tool to an internally-approved, rig-registered, R3F-previewable avatar, ready to be assigned to a Room *later* (no publishing in this runbook).
**Status:** v1 — read-only documentation. No code, schema, or routes are changed by following this runbook.

> Hard rules enforced by the platform (do **not** try to work around them):
> - **No `publicUrl`** — every production asset has `publicUrl = null` (Drizzle default + CHECK constraint + route serializer).
> - **No provider call from the browser** — Meshy, Ready Player Me, Character Creator, etc. are authoring tools used **outside** Mougle. Their outputs are imported as files.
> - **No render execution, no live runner, no Unreal execution, no 4D hardware, no publishing** from this workflow. Terminal lifecycle in this phase is `approved_internal` — `approved_public` is reserved for a later phase and is intentionally absent from code.
> - Signed preview URLs are ephemeral (TTL clamped to ≤ 900 s) and are **never persisted** — the audit log records only `{adminUserId, ttlSeconds, expiresAt}`.

---

## 1. External avatar creation tools

Choose **one** authoring tool to produce the source character. Mougle does not run any of these; you bring the resulting file in.

| Tool | Strength | Output you should export |
|---|---|---|
| **Blender** (free) | Full modelling, rigging, texturing, weight-painting; canonical GLB exporter. | `.glb` (binary) via *File → Export → glTF 2.0 (.glb/.gltf)*. |
| **Cinema 4D** | Stylised character work, motion-graphics pipelines. | `.glb` via the official glTF exporter (or FBX → Blender → GLB). |
| **Character Creator (Reallusion)** | Production-grade humanoid base meshes + rigs. | Export *To glTF* (Character Creator 4) with embedded textures. |
| **Ready Player Me** | Fast browser-based avatar generator. | Download the avatar `.glb` from the developer dashboard. |
| **Meshy** | Text/image → 3D mesh; good for stylised props and stylised heads. | Export the generated asset as `.glb` (binary, embedded textures). |

Mougle **never** calls these providers. You author elsewhere, then upload the file.

---

## 2. Recommended first format: GLB

- **GLB** (binary glTF 2.0) — single-file, embedded textures, deterministic loader. **Use this for the first permanent avatar.**
- `.gltf` (JSON + sidecar buffers/textures) is accepted but multi-file; only use it if you have a specific reason and you can guarantee every sidecar is in the upload.
- Anything else (FBX, OBJ, USDZ, VRM, BLEND) — **convert to GLB first**. The validator only accepts GLB/glTF.

Target the deterministic local validator caps (`server/services/gltf-validator.ts`):

| Cap | Limit |
|---|---|
| File size | ≤ 25 MB |
| Nodes | ≤ 200 |
| Meshes | ≤ 200 |
| Accessors | ≤ 2 000 |
| Buffer views | ≤ 2 000 |

If you blow any cap, the validator rejects the file with one of 10 deterministic failure reasons. Reduce poly count / merge meshes / bake textures and re-export.

---

## 3. Required metadata

Capture this **before** uploading. You will paste it into the upload form on `/admin/3d-assets/upload`.

| Field | Required | Notes |
|---|---|---|
| Display name | ✅ | Human-readable character name. |
| Internal code / slug | ✅ | Lowercase, hyphenated. Used in admin search. |
| Source tool | ✅ | One of the tools in §1. |
| Source author / studio | ✅ | Who created the source mesh. |
| Source acquisition date | ✅ | When you obtained / commissioned the file. |
| Source URL (if any) | optional | The marketplace / dashboard URL where the source lives. |
| License type | ✅ | See §4. |
| License holder | ✅ | Legal entity that holds the right to use the asset inside Mougle. |
| License scope | ✅ | "Internal Mougle use only" for this runbook. |
| Intended Room (later) | optional | News / Podcast / Debate / Living. Informational only — Room assignment is a separate later step (§10). |
| Has likeness of a real person? | ✅ (yes/no) | If yes, attach a written release before uploading. |
| Contains brand IP / logos? | ✅ (yes/no) | If yes, attach the license/permission before uploading. |
| Polygon budget at export | ✅ | Approximate tri count (Blender → *Statistics*). |

---

## 4. License & safety checklist

All boxes must be true **before** uploading. If any answer is *no* or *unknown*, stop.

- [ ] The file was authored or commissioned by us, **or** we have a written license that covers internal use inside Mougle.
- [ ] License terms permit: in-platform display, internal preview, transformation (rigging, retargeting), and storage of the file in private object storage.
- [ ] License terms do **not** require us to expose the file at a public URL (good — Mougle never does).
- [ ] No real person's likeness without a signed likeness release.
- [ ] No third-party trademarks / logos / costumes without permission.
- [ ] No copyrighted character (Disney/Marvel/anime IP/etc.) unless we own or license it.
- [ ] No nudity, no minors in sexualised contexts, no hate symbols, no real-world weapons branding, no real political figures without explicit founder approval.
- [ ] Textures contain no hidden text, no watermarks from a competitor platform, and no embedded URLs.
- [ ] If the source was AI-generated (Meshy / similar), the underlying training-data terms allow commercial / internal use.

This list is the precondition for the **License review** stage in §7.

---

## 5. Upload / import steps (`/admin/3d-assets/upload`)

1. Sign in as a root admin. The page is gated by `requireRootAdmin`.
2. Navigate to **`/admin/3d-assets/upload`**.
3. Select the GLB from §2.
4. Fill in every metadata field from §3.
5. Submit. The file is written to `PRIVATE_OBJECT_DIR/production-assets/<uuid>.glb` via `server/services/production-asset-storage.ts`. That wrapper refuses any write under `PUBLIC_OBJECT_SEARCH_PATHS`, so a public path is impossible by construction.
6. On success you are redirected to **`/admin/3d-assets/:id`** with lifecycle = `uploaded`.

The asset now exists, but is not usable yet — it must pass validation and three review gates.

---

## 6. GLB validation steps

Validation runs locally (no provider, no network) via `server/services/gltf-validator.ts`, **synchronously at upload/import time** inside the `/api/admin/production-assets/*` route handlers. There is no separate "Validate" button on the detail page — a row only exists if the bytes already passed the validator.

1. Submitting the upload form (§5) invokes `validateGlbOrGltf(buffer, { format })` on the server before the asset row is created.
2. **Pass** → the row is created and the validator metadata (node/mesh/accessor counts, bounds, `validatorVersion: "r5c-1"`) is stored alongside it. Lifecycle starts at `uploaded`.
3. **Fail** → the request returns `400` with one of the 10 deterministic `ValidatorFailureReason` codes (see below). No row is created. Fix the source, re-export, and re-upload — do not edit DB rows by hand.

The full failure-reason taxonomy (exact identifiers from `server/services/gltf-validator.ts`):

| Reason | Meaning |
|---|---|
| `glb_bad_magic` | The 4-byte GLB header magic is not `glTF`. File is not a valid binary glTF. |
| `glb_bad_version` | GLB container version is not the supported version. |
| `glb_length_mismatch` | GLB declared length disagrees with the buffer length. |
| `glb_json_chunk_invalid` | JSON chunk is missing, malformed, or not parseable. |
| `glb_bin_chunk_inconsistent` | BIN chunk size or layout disagrees with the JSON chunk's buffer view declarations. |
| `gltf_version_unsupported` | `asset.version` in the glTF JSON is not a supported glTF 2.0 version. |
| `gltf_complexity_cap_exceeded` | One of the structural caps was exceeded (≤ 200 nodes / ≤ 200 meshes / ≤ 2 000 accessors / ≤ 2 000 buffer views). |
| `gltf_size_cap_exceeded` | File size > 25 MB. |
| `gltf_extension_required_disallowed` | `extensionsRequired` lists an extension not on the allow-list. |
| `gltf_external_image_uri_disallowed` | A texture references an external image URI; only embedded/data URIs are accepted. |

---

## 7. Internal approval steps

Three sequential gates, **in this order**. Each gate is a separate admin action and writes an audit row.

1. **License review** (`/admin/3d-assets/:id` → *License review*).
   - Operator confirms every box in §4 is true.
   - Approve → lifecycle `validated → license_reviewed`.
2. **Safety review** (`/admin/3d-assets/:id/safety-review`).
   - Visual review of the model from multiple angles (use the **Load approved internal asset** toggle on `/admin/r3f-preview-sandbox` after this step — see §9).
   - Confirm nothing in §4's negative list slipped in.
   - Approve → lifecycle `license_reviewed → safety_reviewed`.
3. **Approve internal** (final).
   - Operator approves the asset for internal use only.
   - Lifecycle `safety_reviewed → approved_internal` (**terminal in this phase**).
   - `publicUrl` remains `null`. There is no UI to make it public.

If anything looks wrong at any gate, **reject** instead of approving. A rejected asset stays in its current state and can be replaced or archived.

---

## 8. Rig registration steps (`/admin/3d-rigs`)

The rig library mirrors the asset library: it is a separate library of rig files (`RigLibraryList` / `RigUpload` / `RigDetail` / `RigSafetyReview` under `/admin/3d-rigs/{,upload,:id,:id/safety-review}`), gated by `requireRootAdmin`, with the same upload → validate → license_review → safety_review → approved_internal lifecycle shape as assets.

1. Confirm the avatar asset is `approved_internal`.
2. Navigate to **`/admin/3d-rigs`** and click **Upload** to register a rig file (or pick an existing approved rig that fits this avatar's skeleton).
3. On the upload form:
   - Provide the rig display name, source tool (Blender / CC / Mixamo-compatible / RPM v2 / etc.), and metadata equivalent to §3.
   - License & safety checklist equivalent to §4 applies to the rig file as well.
4. Walk the rig through the same three approval gates as the asset (§7): **License review → Safety review → Approve internal**, terminal at `approved_internal`.
5. Operator records (outside the rig row, e.g. in the asset's notes or a separate operator note) which approved rig should be paired with this avatar. **Explicit "linked asset" / per-bone control-mapping fields on the rig row are not yet shipped** — that pairing is treated as future-state in §13.

If the GLB lacks bones (static mesh) you can still proceed without a rig — but the avatar will not animate. Re-author with a skeleton if animation is required.

---

## 9. R3F preview steps (`/admin/r3f-preview-sandbox`)

This is the only place to **see** the avatar in-platform. It is read-only — no render export, no recording.

1. Navigate to **`/admin/r3f-preview-sandbox`**.
2. Enable **Load approved internal asset**.
3. Pick the asset from the dropdown (only `approved_internal` rows are listed).
4. Pick the rig from §8.
5. The sandbox requests a **signed preview URL** with TTL ≤ 900 s. The URL is used in-memory only; it is never persisted, never logged in the URL form. The audit log records `{adminUserId, ttlSeconds, expiresAt}`.
6. Verify in the sandbox:
   - The model loads, faces forward, and is centered.
   - Scale is sane (an adult humanoid is ~1.7–1.9 units tall).
   - Materials render correctly under default lighting.
   - The rig animates the expected bones (if you load a debug pose / wave).
   - No console errors in the in-page log.
7. If anything is wrong, go back to the source tool, re-export, and start at §5 with a new upload (do **not** mutate the existing approved row).

Performance budget reminders: the production R3F canvases (`ProductionCanvasSandbox`, `AvatarRigCanvas`) run with `dpr` clamp, `frameloop="demand"` and `lowPower=true`. If preview is choppy, that is a model problem (too many tris / oversized textures), not a budget problem to relax.

---

## 10. How to assign to a Room later

> **Out of scope for this runbook to *execute*** — Room assignment is a later phase. This section documents *how the assignment surface is reached* so the operator knows where the avatar will plug in.

The Room-assignment surfaces live under the **Production House** and **3D / 4D / Unreal** zones of the Admin Dashboard (`AdminDashboard.tsx` zones: *Production House*, *3D/4D/Unreal*, *News Room*, *Podcast Room*, *Debate Studio*).

| Target Room | Where the assignment will happen (later phase) | What an approved + rigged avatar gives that Room |
|---|---|---|
| **News Room** | Admin Dashboard → *News Room* zone → newsroom screen-director assignment surface. Linked to the Neural Newsroom Bus / `ScreenTakePlan` configuration. | Anchor / presenter avatar slot. |
| **Podcast Room** | Admin Dashboard → *Podcast Room* zone → host / guest avatar slots. | Host or recurring guest avatar. |
| **Debate Studio** | Admin Dashboard → *Debate Studio* zone → debater seat assignment. | Debater seat avatar. |
| **Living Room** | Admin Dashboard → *Production House* zone, Living Room sub-surface (when the dashboard ships it). | Ambient / hangout avatar. |

Until those assignment surfaces ship, the avatar sits in `approved_internal` state and is visible only via the R3F preview sandbox. **Do not** wire it into any Room by editing DB rows directly.

---

## 11. What is NOT allowed in this workflow

These are platform invariants. The runbook does not bypass them.

- ❌ **No public URL.** `publicUrl` is `null` everywhere. Do not request, store, or share one.
- ❌ **No provider call from the browser.** Meshy/RPM/CC/Blender/C4D are external authoring tools; their APIs are not called from Mougle UI or admin code paths in this workflow.
- ❌ **No render execution.** No headless renders, no offline bakes, no MP4/PNG export pipelines fired from these routes.
- ❌ **No live runner.** No live animation runtime, no streaming pipeline, no real-time mocap ingest.
- ❌ **No Unreal execution.** The 3D/4D/Unreal zone is observability-only in this phase.
- ❌ **No 4D hardware.** No volumetric capture, no haptics, no XR headset I/O.
- ❌ **No publishing.** Terminal state is `approved_internal`. Do not introduce or simulate `approved_public`.

If any of the above starts to feel necessary, stop and file a follow-up task — do not work around the gate.

---

## 12. Troubleshooting checklist

| Symptom | Likely cause | Fix |
|---|---|---|
| Upload rejected immediately | File is not `.glb`/`.gltf`, or write attempted under `PUBLIC_OBJECT_SEARCH_PATHS`. | Re-export as GLB; confirm storage wrapper logged the rejection reason. |
| `400 gltf_complexity_cap_exceeded` | Too many nodes/meshes/accessors/buffer views. | In Blender: *Object → Join* sibling meshes; bake modifiers; reduce sub-mesh count; re-export. |
| `400 gltf_size_cap_exceeded` | > 25 MB. | Reduce texture resolution (4K → 2K), use KTX2/BasisU compression where supported, decimate mesh. |
| `400 glb_bad_magic` / `glb_bad_version` / `glb_length_mismatch` | Not a valid binary glTF or wrong container version. | Re-export with the official glTF 2.0 exporter, binary (`.glb`). |
| `400 glb_json_chunk_invalid` / `glb_bin_chunk_inconsistent` | Container chunks are damaged or inconsistent. | Re-export from the source tool; do not hand-edit `.glb` bytes. |
| `400 gltf_version_unsupported` | `asset.version` is not glTF 2.0. | Re-export targeting glTF 2.0. |
| `400 gltf_extension_required_disallowed` | `extensionsRequired` includes an extension not on the allow-list. | Disable the extension in the exporter (e.g. turn off Draco mesh compression if disallowed) and re-export. |
| `400 gltf_external_image_uri_disallowed` | Textures point to external image files. | Re-export as a single `.glb` with embedded textures (or inline as data URIs). |
| License review blocked | A box in §4 is unchecked. | Resolve outside Mougle (get the release / license), then retry. |
| Safety review blocked | Visible IP, real likeness without release, or NSFW content. | Edit source, re-upload as a new asset row. Do not edit the existing row. |
| R3F preview shows a black/empty canvas | Wrong scale, wrong forward axis, or (with `.gltf` sidecars only) missing texture files. | Re-export as `.glb` with embedded textures, +Y up, -Z forward. |
| R3F preview shows the model but it doesn't animate | No skeleton in the GLB, or no approved rig paired with this avatar yet. | Re-author with a skeleton, or register an approved rig per §8. |
| Signed preview URL 403 / expired | TTL is ≤ 900 s by design. | Refresh the preview from the sandbox to mint a new URL. Never copy or share the URL. |
| Asset stuck in `validated` or `license_reviewed` | Next reviewer hasn't actioned the gate. | Coordinate with the next reviewer; do not skip gates. |

---

## 13. Open gaps in the current system

These are known and intentional for this phase. They are listed here so the operator knows what is *not* yet available, and what would be a follow-up task — not a workaround.

1. **No Room-assignment surface yet.** §10 documents where assignment *will* live; the actual binding surfaces (News Room / Podcast Room / Debate Studio / Living Room → avatar slot) are not yet shipped. Until they are, an approved avatar is preview-only.
2. **No `approved_public` lifecycle.** Reserved for a later phase. Code does not contain the literal `approved_public`; do not add it ad hoc.
3. **No bulk import or batch validation.** One asset at a time through `/admin/3d-assets/upload`.
4. **No in-platform 3D editing.** The pipeline is import-only; corrections require re-export from the external tool.
5. **No automated likeness / IP / safety classifier.** §4 and Safety Review are entirely human-judgement.
6. **No render export, no recording, no live runtime, no Unreal exec, no 4D capture.** All deliberately absent (see §11).
7. **Rig ↔ asset pairing is implicit.** `/admin/3d-rigs` registers rig files through the same upload/validate/license/safety/approve lifecycle as assets, but there is no shipped UI field on the rig row to bind it to a specific avatar asset, and no per-bone control-mapping editor. Operators currently track the pairing in notes; a first-class linking + bone-mapping surface is future work.
8. **Rig retargeting is manual.** There is no automatic skeleton mapping between, e.g., RPM and Mixamo conventions — the operator handles it in the source tool before upload.
9. **Audit trail for preview URLs records metadata only.** This is by design; if a deeper trace is ever needed, it must be designed as a new feature, not retrofitted onto the URL field.

---

**End of runbook.** Index-only update: this file is registered in [`../library/INDEX.md`](../library/INDEX.md) §H under the runbooks pointer.
