# R7A — Avatar Rig Visual Preview Audit

**Date:** 2026-05-22
**Author:** main agent (read-only audit)
**Goal:** Establish what `/admin/3d-rigs` (and adjacent surfaces) can already do for **permanent avatars, accessories, and expressions** before any new avatar functionality is built. **Audit only — no code, schema, route, or provider changes.**
**Hard guardrails (unchanged):** no HeyGen, ElevenLabs, Meshy, Runway, Unity, Unreal, or 4D hardware calls; no public URL; no render execution; no publishing.

---

## 1. Surfaces audited

| Layer | File / route | Status |
|---|---|---|
| DB schema | `shared/schema.ts` → `productionRigs`, `productionRigAuditLog` (Task #754) | Present |
| Storage | `server/services/production-rig-storage.ts` | Present (private only) |
| Validator | `server/services/gltf-validator.ts` (shared with assets) | Present |
| REST API | `server/routes/admin/production-rigs.ts` (`/api/admin/production-rigs/*`) | Present |
| Library UI | `client/src/pages/admin/3d-rigs/RigLibraryList.tsx` (`/admin/3d-rigs`) | Present |
| Upload UI | `client/src/pages/admin/3d-rigs/RigUpload.tsx` (`/admin/3d-rigs/upload`) | Present |
| Detail UI | `client/src/pages/admin/3d-rigs/RigDetail.tsx` (`/admin/3d-rigs/:id`) | Present |
| Safety review UI | `client/src/pages/admin/3d-rigs/RigSafetyReview.tsx` (`/admin/3d-rigs/:id/safety-review`) | Present |
| Safety badge strip | `client/src/pages/admin/3d-rigs/safety-badges.tsx` | Present |
| Visual preview UI | `client/src/pages/admin/AvatarRigPreview.tsx` (`/admin/avatar-rig-preview`) | Present (R7 page) |
| R3F sandbox | `client/src/pages/admin/R3FPreviewSandbox.tsx` (`/admin/r3f-preview-sandbox`) | Present (loads **assets**, not rigs) |

---

## 2. What `/admin/3d-rigs` can do today

### 2.1 Lifecycle (identical shape to production assets)

`productionRigs` row defaults:

```
status = "draft"
lifecycleState = "uploaded"
licenseStatus = "unknown"
safetyReview = "pending"
approvalGate = "not_approved"
publicUrl = NULL   -- enforced by CHECK constraint `production_rigs_public_url_must_be_null`
```

| Lifecycle stage | Mechanism | Notes |
|---|---|---|
| Upload (file) | `POST /api/admin/production-rigs/upload` (multipart) | Runs `validateGlbOrGltf` **before** writing any byte or DB row. SHA-256 dedup (409 `rig_sha256_conflict`). |
| Upload (URL) | `POST /api/admin/production-rigs/import-from-url` | HTTPS-only, manual redirect follow (≤5 hops), 30 s timeout, 25 MB cap, content-type allow-list (`model/gltf-binary`, `model/gltf+json`, `application/octet-stream`). |
| List | `GET /api/admin/production-rigs?status=&safetyReview=&approvalGate=&limit=&offset=` | Paginated, 3 filter axes. |
| Detail + audit | `GET /api/admin/production-rigs/:id` | Returns last 20 audit-log rows. |
| Sign preview URL | `POST /api/admin/production-rigs/:id/signed-preview-url` | TTL clamped to ≤ 900 s; audit row stores `{adminUserId, ttlSeconds, expiresAt}` only — **never the URL**. |
| License decision | `POST /api/admin/production-rigs/:id/license` | Enum: `unknown / internal_only / cc0 / cc_by / proprietary_licensed / unlicensed_rejected`. |
| Safety decision | `POST /api/admin/production-rigs/:id/safety-review` | Enum: `approved_internal / rejected / needs_changes`. |
| Advance approval | `POST /api/admin/production-rigs/:id/approval` | 409 unless `safetyReview === "approved_internal"` AND `licenseStatus ∉ {unknown, unlicensed_rejected}`. Terminal state is `approvalGate = "approved_internal"`. |
| Archive | `POST /api/admin/production-rigs/:id/archive` | Sets `status = "archived"`. |
| Permanent delete | `DELETE /api/admin/production-rigs/:id` (body: `{confirm: true, reason}`) | Only when `status === "archived"`. Deletes object bytes first; on object-delete failure preserves the row for retry; on success cascades the audit-log rows. |

All routes are gated by `requireAdmin` (root admin only) and CSRF (global).

### 2.2 Storage invariants

`server/services/production-rig-storage.ts`:

- `STORAGE_KEY_RE = /^production-rigs\/[a-f0-9-]+\.(glb|gltf)$/` — refuses anything else.
- `resolveFullPath` joins `PRIVATE_OBJECT_DIR` and **refuses** any resolved path that falls under `PUBLIC_OBJECT_SEARCH_PATHS`. Public placement is impossible by construction.
- Signed URL TTL is hard-capped at 900 s; the URL is returned to the caller but never persisted to the DB.

### 2.3 Validator coverage (shared with assets)

Same 10 `ValidatorFailureReason` codes (see Permanent 3D Avatar Creation Runbook §6). Caps: ≤ 25 MB, ≤ 200 nodes, ≤ 200 meshes, ≤ 2 000 accessors, ≤ 2 000 bufferViews, no required-extensions outside allow-list, no external image URIs.

### 2.4 Visual preview (`/admin/avatar-rig-preview`)

`AvatarRigPreview.tsx`:

- Admin-gated via `useAdminAuth`.
- Source picker:
  - **Local R7 demo rig** (internal_only, bundled), or
  - **Any `approvalGate=approved_internal` + `status=active` rig** from `/api/admin/production-rigs`.
- For an approved rig, the page issues a 900 s signed preview URL on selection and hands it to `AvatarRigCanvas` (R3F).
- Surfaces (from `RigInfo`): rig name, **joint count**, **root joint name**.
- Pose control: **T-pose / A-pose toggle** only.
- 12 explicit safety badges visible on the page, including: *No public URL*, *No signed URL persisted*, *No provider calls*, *No render execution*, *No Unreal execution*, *No 4D hardware*, *No publishing*, *No voice generation*, *No video generation*, *Visual only*.
- Canvas runs with the production R3F budget (`dpr` clamp, `frameloop="demand"`, `lowPower=true`).

### 2.5 R3F preview sandbox (`/admin/r3f-preview-sandbox`)

- Supports a **Load approved internal asset** toggle for `production_assets` rows, mints its own ≤ 900 s signed URL, and loads via R3F.
- **Does not** currently include a rig-loading toggle equivalent — that surface lives on `/admin/avatar-rig-preview` only.

---

## 3. What `/admin/3d-rigs` can NOT do today (for permanent avatars / accessories / expressions)

The audit confirms that the rig library is a **file library**, not yet an **avatar composition system**. The following are absent in shipped code/schema/routes:

### 3.1 Permanent avatar entity (the "character" itself)

- There is no `permanent_avatars` table (or equivalent) that binds:
  - one approved `production_assets` row (body / mesh GLB), **and**
  - one approved `productionRigs` row (skeleton / rig GLB), **and**
  - identity metadata (display name, persona, default room, etc.).
- `shared/production-house.ts` defines `AvatarSchema` and `GeneratedAvatarRecordSchema` as *content-pipeline* descriptors (admin-only, `status:"draft"`, `publicUrl:null`, `executionEnabled:false`). They are **not** wired to either `production_assets` or `productionRigs`, and there is no admin CRUD surface for a "permanent avatar" record.
- `RigDetail.tsx` has no UI field to link an asset to a rig.

### 3.2 Avatar accessories

`AVATAR_ACCESSORY_TYPES` exists in `shared/production-house.ts` (`suit, microphone, earpiece, glasses, desk_nameplate, tablet, headset, badge, studio_prop, custom_accessory`) and `AvatarAccessoryRecordSchema` is defined. A **draft, in-memory creator surface** also exists today:

- Routes: `/api/admin/production-house/avatar-creator/list`, `/avatar-creator/generate`, `/avatar-creator/accessories/generate`, `/avatar-creator/:avatarId` in `server/routes/production-house-routes.ts` (all `requireRootAdmin`, all returning draft records).
- UI: `AvatarCreatorPanel` in `client/src/pages/admin/ProductionHouse.tsx` (section id `avatar-creator`, label *"Avatar & Accessories Creator"*) with a *"Generate Accessory (Draft)"* button + accessory list.

These records are **draft / admin-only / in-memory**: `status:"draft"`, `approvalStatus:"draft"`, `visibility:"admin_only_internal"`, `publicUrl:null`, `signedUrl:null`, `realSendAllowed:false`, `executionEnabled:false`. They are **not** integrated with the rig library lifecycle. What is still absent:

- No DB-backed accessory table (no `production_avatar_accessories` row, no `productionRigAccessories`, etc.); the creator panel does not persist beyond memory.
- No accessory upload / validate / license / safety-review / approval / archive / delete lifecycle parallel to `productionRigs` or `production_assets`.
- No `/api/admin/production-rigs/*/accessories` (or equivalent) binding accessories to a rig row.
- No accessory-attachment surface on `RigDetail` (`/admin/3d-rigs/:id`).
- `/admin/avatar-rig-preview` does not load or render accessories.

### 3.3 Facial expressions / blend shapes / morph targets

- The validator records node/mesh/accessor counts, but `RigInfo` on the preview page surfaces only `rigName`, `jointCount`, `rootJointName` — no blend-shape / morph-target list.
- There is no expression library schema, no expression-upload route, no per-rig "list of supported expressions" surface, and no preview UI to trigger a specific blend-shape weight or named expression.
- `facialAnimationProvider` exists in `AvatarSchema` as a `placeholder | nvidia_ace | metahuman` enum but is never executed (no provider call anywhere in this surface).

### 3.4 Pose / animation library

- The only pose control in `AvatarRigPreview` is **T-pose / A-pose** (two static poses, both client-side).
- No idle-loop catalog, no per-rig animation-clip listing, no admin gesture library, no "play named clip" control.

### 3.5 Avatar ↔ Room assignment

- No surface binds a rig (or future "permanent avatar") to a News Room / Podcast Room / Debate Studio / Living Room slot.
- The `AdminDashboard.tsx` zones list News / Podcast / Debate / 3D-4D / Production House, but the per-room avatar-slot configuration UI does not yet exist.

### 3.6 R3F sandbox rig parity

- `/admin/r3f-preview-sandbox` has *"Load approved internal asset"* but no *"Load approved internal rig"* twin toggle — rig preview currently only happens on `/admin/avatar-rig-preview`. This is a UX inconsistency, not a safety issue.

### 3.7 Bulk / discoverability

- No bulk import, no batch validation, no CSV export of the rig catalog, no per-rig pairing-history view.

---

## 4. Confirmed safety invariants (no change needed)

These are already enforced and should remain so for any future avatar work:

- `publicUrl = NULL` everywhere (default + CHECK constraint + route serializer overlay).
- Signed preview URL TTL ≤ 900 s; URL never persisted; audit log records metadata only.
- Private-only storage; public-path writes refused at the storage wrapper.
- Validator runs before any byte or DB row.
- Approval gate requires both safety = `approved_internal` and license ∉ `{unknown, unlicensed_rejected}`.
- Permanent delete is only allowed from `status = "archived"`, requires `{confirm: true, reason}`, deletes object bytes first, and cascades the audit-log rows on success.
- All routes root-admin gated; CSRF enforced.
- No provider in the rig path: HeyGen / ElevenLabs / Meshy / Runway / Unity / Unreal / 4D hardware are not referenced by `production-rigs.ts`, `production-rig-storage.ts`, `AvatarRigPreview.tsx`, `R3FPreviewSandbox.tsx`, or `gltf-validator.ts`.

---

## 5. Recommendations (do NOT implement yet — audit output only)

Ordered by what unblocks the most downstream work with the smallest, safest schema/route surface. **None of these are tasks; they are options for a future planning pass.**

1. **Define a `permanent_avatars` entity** (or its functional equivalent) that links one approved body asset + one approved rig + identity metadata, with the same approval lifecycle the rig and asset libraries already use. Without this entity, every other gap below is blocked.
2. **Add an "Assign rig" surface on `/admin/3d-assets/:id`** (and/or "Assign body asset" on `/admin/3d-rigs/:id`) — even before the full permanent-avatar entity ships, surface the pairing as an operator-editable field so the pairing is no longer note-only.
3. **Surface rig metadata richness** on `RigDetail` and `AvatarRigPreview`: blend-shape / morph-target list, animation-clip list, and bone hierarchy summary, sourced from the existing validator metadata pass (extend the validator to capture these — same caps philosophy).
4. **Avatar accessory library** as a **separate** admin library mirroring the rig library lifecycle (upload → validate → license → safety → approved_internal → archive → delete), with a join surface against the permanent-avatar entity. Same private storage / no-public-URL / no-provider guardrails.
5. **Expression library** likewise as a separate library, keyed by named expression (e.g. `neutral`, `smile`, `surprise`, `confused`) and bound to a rig's blend-shape vocabulary. Preview support on `AvatarRigPreview` to set a single weight slider.
6. **R3F sandbox parity:** add a "Load approved internal rig" toggle to `/admin/r3f-preview-sandbox` so the two surfaces (`r3f-preview-sandbox` and `avatar-rig-preview`) converge in capability.
7. **Pose / clip preview:** extend `AvatarRigPreview` beyond T/A-pose to "play named clip from this rig" (still client-side, still no provider).
8. **Room assignment surfaces** (News / Podcast / Debate / Living) — gated behind the permanent-avatar entity from (1).

Every item above must keep the existing invariants in §4. None requires a new external provider.

---

## 6. Out of scope (explicitly NOT recommended)

- Calling HeyGen, ElevenLabs, Meshy, Runway, Unity, Unreal, or any 4D hardware from these surfaces.
- Adding an `approved_public` lifecycle state to rigs or any new avatar entity.
- Persisting any signed URL.
- Server-side renders, video export, live runtime, or publishing from the rig / avatar path.

---

## 7. Source-of-truth file references

- `shared/schema.ts` (search: `productionRigs`, `productionRigAuditLog`, `production_rigs_public_url_must_be_null`)
- `server/routes/admin/production-rigs.ts`
- `server/services/production-rig-storage.ts`
- `server/services/gltf-validator.ts`
- `client/src/pages/admin/3d-rigs/RigLibraryList.tsx`
- `client/src/pages/admin/3d-rigs/RigUpload.tsx`
- `client/src/pages/admin/3d-rigs/RigDetail.tsx`
- `client/src/pages/admin/3d-rigs/RigSafetyReview.tsx`
- `client/src/pages/admin/3d-rigs/safety-badges.tsx`
- `client/src/pages/admin/AvatarRigPreview.tsx`
- `client/src/pages/admin/R3FPreviewSandbox.tsx`
- `shared/production-house.ts` (search: `AVATAR_ACCESSORY_TYPES`, `AvatarAccessoryRecordSchema`, `AvatarSchema`, `GeneratedAvatarRecordSchema`)
- `docs/runbooks/PERMANENT_3D_AVATAR_CREATION_RUNBOOK.md` (operator workflow that this audit complements)

---

**End of audit.** No code, schema, or routes were changed by this report. Recommendations in §5 are options for a later planning pass, not tasks.
