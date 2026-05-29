# R7B — Permanent Avatar Entity Design

**Date:** 2026-05-22
**Author:** main agent (design only)
**Status:** Design — **do not implement yet**
**Predecessor:** [`docs/reports/R7A_AVATAR_RIG_VISUAL_PREVIEW_AUDIT.md`](../reports/R7A_AVATAR_RIG_VISUAL_PREVIEW_AUDIT.md)
**Companion:** [`docs/runbooks/PERMANENT_3D_AVATAR_CREATION_RUNBOOK.md`](../runbooks/PERMANENT_3D_AVATAR_CREATION_RUNBOOK.md)

**Hard guardrails (unchanged from R5/R7/R7A):** no HeyGen / ElevenLabs / Meshy / Runway / Unity / Unreal / 4D hardware calls; no `publicUrl`; no signed-URL persistence; no render execution; no live behavior; no publishing; root-admin gated; CSRF enforced; private storage only.

---

## 1. Purpose

Define the **`permanent_avatars`** entity — a DB-backed, approval-lifecycle-gated record that *binds* one approved body asset (`production_assets`) with one approved rig (`production_rigs`) and carries identity / persona / default-room metadata. This is the missing **avatar composition layer** identified in R7A §3.1.

This document is design only. It specifies the table shape, the API surface, the UI surfaces, the lifecycle, the audit log, the relationship constraints, and the forward hooks for accessories / expressions / animations — without writing any code, migration, route, or UI.

Future *separate* tasks (each individually scoped and approved) would implement the schema, the routes, the UI, and the optional hooks. Nothing in this document is implementation.

---

## 2. Naming

| Concept | Table | TS type |
|---|---|---|
| Permanent avatar record | `permanent_avatars` | `PermanentAvatar` |
| Permanent avatar audit log | `permanent_avatar_audit_log` | `PermanentAvatarAuditLog` |

Naming follows the **`production_assets` / `production_rigs`** convention already established in the codebase (snake_case table, camelCase Drizzle export, paired audit table with `*_audit_log` suffix). Do **not** name it `avatars` — `shared/production-house.ts` already uses `AvatarSchema` for an unrelated content-pipeline descriptor; the new entity must be lexically distinct.

> **Open question O1:** confirm the name `permanent_avatars` vs alternatives (`composed_avatars`, `bound_avatars`, `studio_avatars`). Recommendation: `permanent_avatars` — matches user vocabulary in the R7A approval message and the runbook title.

---

## 3. Table shape — `permanent_avatars`

```ts
export const permanentAvatars = pgTable("permanent_avatars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // --- Identity / persona ------------------------------------------------
  displayName: text("display_name").notNull(),               // human-readable, unique per founder
  slug: text("slug").notNull().unique(),                     // lowercase-kebab, stable handle
  personaSummary: text("persona_summary").notNull().default(""),   // ≤ 1000 chars
  rolePreset: text("role_preset").notNull().default("custom"),      // see §3.1
  voiceProfileHint: text("voice_profile_hint").notNull().default(""), // free-text hint only; NOT a provider voice id
  languageHint: text("language_hint").notNull().default(""),         // BCP-47 hint; NOT a provider call

  // --- Bound approved assets --------------------------------------------
  bodyAssetId: varchar("body_asset_id").notNull()
    .references(() => productionAssets.id, { onDelete: "restrict" }),
  rigId: varchar("rig_id").notNull()
    .references(() => productionRigs.id, { onDelete: "restrict" }),

  // --- Default room assignment (forward hook, optional) -----------------
  defaultRoomKind: text("default_room_kind"),                // 'news_room' | 'podcast_room' | 'debate_studio' | 'living_room' | NULL
  defaultRoomId: varchar("default_room_id"),                 // soft FK; not enforced until R6/R7C ships the rooms table; nullable

  // --- Approval lifecycle (mirrors productionRigs) -----------------------
  status: text("status").notNull().default("draft"),
    // 'draft' | 'active' | 'archived'
  lifecycleState: text("lifecycle_state").notNull().default("composed"),
    // 'composed' | 'identity_reviewed' | 'safety_reviewed' | 'approved_internal'
  identityReview: text("identity_review").notNull().default("pending"),
    // 'pending' | 'approved_internal' | 'rejected' | 'needs_changes'
  identityReviewNote: text("identity_review_note"),
  safetyReview: text("safety_review").notNull().default("pending"),
    // 'pending' | 'approved_internal' | 'rejected' | 'needs_changes'
  safetyReviewNote: text("safety_review_note"),
  approvalGate: text("approval_gate").notNull().default("not_approved"),
    // 'not_approved' | 'approved_internal'   (NO 'approved_public' — same as rig/asset)

  // --- Hard safety invariants -------------------------------------------
  publicUrl: text("public_url").default(sql`NULL`),          // CHECK below
  realSendAllowed: boolean("real_send_allowed").notNull().default(false),
  executionEnabled: boolean("execution_enabled").notNull().default(false),
  visibility: text("visibility").notNull().default("admin_only_internal"),

  // --- Forward hooks: NONE on this table -------------------------------
  // Per the design contract, accessory / expression / animation bindings
  // live in their own dedicated join tables (§5), NOT as nullable columns
  // here. This keeps each feature's lifecycle independent and avoids
  // half-bound stub references on the permanent-avatar row.

  createdByUserId: text("created_by_user_id").notNull(),
  metadata: jsonb("metadata"),                              // {bonesValidated, blendShapesDetected, …} — derived only, never provider output
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_permanent_avatars_status").on(table.status),
  index("IDX_permanent_avatars_safety_review").on(table.safetyReview),
  index("IDX_permanent_avatars_identity_review").on(table.identityReview),
  index("IDX_permanent_avatars_approval_gate").on(table.approvalGate),
  index("IDX_permanent_avatars_body_asset").on(table.bodyAssetId),
  index("IDX_permanent_avatars_rig").on(table.rigId),
  uniqueIndex("UQ_permanent_avatars_body_rig_pair").on(table.bodyAssetId, table.rigId),
  check(
    "permanent_avatars_public_url_must_be_null",
    sql`${table.publicUrl} IS NULL`,
  ),
  check(
    "permanent_avatars_real_send_must_be_false",
    sql`${table.realSendAllowed} = FALSE`,
  ),
  check(
    "permanent_avatars_execution_must_be_false",
    sql`${table.executionEnabled} = FALSE`,
  ),
  check(
    "permanent_avatars_visibility_admin_only",
    sql`${table.visibility} = 'admin_only_internal'`,
  ),
  check(
    "permanent_avatars_default_room_kind_allow_list",
    sql`${table.defaultRoomKind} IS NULL OR ${table.defaultRoomKind} IN ('news_room','podcast_room','debate_studio','living_room')`,
  ),
  // DB-level enum pinning for every lifecycle column. These CHECKs are the
  // reason `approved_public` cannot leak in even if a future route mutation
  // tries to write it: the database refuses the row before the serializer
  // overlay ever runs.
  check(
    "permanent_avatars_status_allow_list",
    sql`${table.status} IN ('draft','active','archived')`,
  ),
  check(
    "permanent_avatars_lifecycle_state_allow_list",
    sql`${table.lifecycleState} IN ('composed','identity_reviewed','safety_reviewed','approved_internal')`,
  ),
  check(
    "permanent_avatars_identity_review_allow_list",
    sql`${table.identityReview} IN ('pending','approved_internal','rejected','needs_changes')`,
  ),
  check(
    "permanent_avatars_safety_review_allow_list",
    sql`${table.safetyReview} IN ('pending','approved_internal','rejected','needs_changes')`,
  ),
  check(
    "permanent_avatars_approval_gate_no_public",
    sql`${table.approvalGate} IN ('not_approved','approved_internal')`,
  ),
  check(
    "permanent_avatars_role_preset_allow_list",
    sql`${table.rolePreset} IN ('news_anchor','podcast_host','debate_moderator','guest','analyst','field_reporter','teacher','virtual_ceo','ai_assistant','custom')`,
  ),
]);
```

### 3.1 `rolePreset` enum

```
news_anchor | podcast_host | debate_moderator | guest | analyst |
field_reporter | teacher | virtual_ceo | ai_assistant | custom
```

Mirrors `GENERATED_AVATAR_ROLES` in `shared/production-house.ts` plus `custom`. Drives only labelling/filtering; no provider behaviour.

### 3.2 Why both `bodyAssetId` and `rigId` are `NOT NULL`

A permanent avatar **must** be a complete binding. Half-bound records would create a class of "pending stub" rows that the runbook explicitly forbids. Drafts that have not chosen both can live as plain `status='draft'` rows (composition still happens up front; both FKs are required).

### 3.3 Why both FKs are `onDelete: "restrict"`

A body asset or rig that is referenced by a permanent avatar **cannot** be permanently deleted. The asset/rig DELETE route must first detect any referencing permanent_avatar row and refuse with HTTP 409 (`asset_referenced_by_permanent_avatar` / `rig_referenced_by_permanent_avatar`). The operator path is: archive the permanent avatar first → then archive and delete the rig/asset.

### 3.4 Uniqueness rules

- `slug` is globally unique.
- `(bodyAssetId, rigId)` is unique — the same asset+rig pair can only describe one canonical permanent avatar. Operators who want a "variant B" must duplicate the rig or asset first (the asset library already enforces SHA-256 uniqueness, so a true duplicate of the file is rejected; an operator-tagged variant is fine).
- `displayName` is **not** uniquely constrained at DB level (operators may want shared display names across archived/active); enforce friendly uniqueness in the route serializer instead.

### 3.5 Pair-validity gate (route-enforced, not DB-enforced)

Before any INSERT or UPDATE that sets `bodyAssetId` / `rigId`, the route MUST verify (single transaction, same SELECT):

- referenced `production_assets` row exists AND has `status='active'` AND `approvalGate='approved_internal'`
- referenced `production_rigs` row exists AND has `status='active'` AND `approvalGate='approved_internal'`

This invariant is route-enforced because the asset/rig approvalGate values are mutable; a CHECK constraint would not catch later demotions.

**Demotion / archive-of-bound-row handling:** the asset/rig archive route is the gatekeeper, not a background sweeper. When an operator tries to archive a body asset or rig that is referenced by any permanent avatar (regardless of that avatar's status), the asset/rig archive endpoint must refuse with HTTP 409 (`asset_referenced_by_permanent_avatar` / `rig_referenced_by_permanent_avatar`) and return the list of referencing permanent_avatar IDs. The operator must first archive (or permanently delete) each referencing permanent avatar before the bound asset/rig can be archived. This is consistent with the FK `onDelete: "restrict"` policy in §3.3 and the O3 recommendation in §10. There is **no** background auto-demotion sweeper in v1.

### 3.6 Hard safety CHECKs

The three booleans (`realSendAllowed`, `executionEnabled`, `visibility`) plus `publicUrl IS NULL` mirror what `productionRigs` and the draft `AvatarAccessoryRecordSchema` already enforce by convention; here they are pinned at the database layer so no future route mutation can flip them.

---

## 4. Audit log — `permanent_avatar_audit_log`

```ts
export const permanentAvatarAuditLog = pgTable("permanent_avatar_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  permanentAvatarId: varchar("permanent_avatar_id").notNull()
    .references(() => permanentAvatars.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  event: text("event").notNull(),
    // 'created' | 'updated_identity' | 'rebound_body_asset' | 'rebound_rig' |
    // 'default_room_set' | 'default_room_cleared' |
    // 'identity_review_submitted' | 'safety_review_submitted' |
    // 'approval_advanced' | 'approval_demoted' |
    // 'archived' | 'unarchived' | 'permanent_delete'
  payload: jsonb("payload"),
    // event-shaped payload; for any URL-issuing event, payload stores
    // {ttlSeconds, expiresAt, actorUserId} only — NEVER the URL itself
    // (matches the rig/asset audit-log discipline)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_permanent_avatar_audit_log_avatar_created")
    .on(table.permanentAvatarId, table.createdAt),
  index("IDX_permanent_avatar_audit_log_event").on(table.event),
]);
```

Audit-log rows cascade on permanent avatar delete (delete-only after archive, see §6.6).

---

## 5. Forward hooks (deferred; design only)

### 5.1 Accessories

Accessory, expression, and animation hooks are **separate future tables only** — there are no ref columns on `permanent_avatars` (see §3). Each future hook table owns its own approval lifecycle and its own audit log. Accessories will be a separate library mirroring R7A §5 recommendation 4:

```
permanent_avatar_accessories         -- future task R7C
  id, permanentAvatarId (FK, cascade),
  accessoryAssetId (FK production_assets, restrict),
  attachmentJointName, transformMatrix,
  status/approvalGate (own lifecycle),
  audit log
```

Accessories piggy-back on `production_assets` for the binary (so the upload / validate / license / safety / approval / archive / delete lifecycle is reused unchanged). The new table only stores the **attachment** between an approved accessory asset and a permanent avatar.

### 5.2 Expressions

```
permanent_avatar_expressions         -- future task R7D
  id, permanentAvatarId (FK, cascade),
  expressionName (enum: neutral, smile, frown, surprise, anger, fear, confused, thinking, …),
  blendShapeWeights jsonb,            -- {targetName: weight}, validator-bounded
  status/approvalGate (own lifecycle),
  audit log
```

Driven entirely by morph-target / blend-shape weights extracted from the bound rig + body asset. **No** provider call. Preview = client-side weight slider on `/admin/avatar-rig-preview`.

### 5.3 Animation clips

```
permanent_avatar_animations          -- future task R7E
  id, permanentAvatarId (FK, cascade),
  clipAssetId (FK production_assets, restrict),  -- separate GLB clip
  clipName, duration, loop,
  status/approvalGate (own lifecycle),
  audit log
```

Same pattern — clip binary lives in `production_assets`; only the binding lives in the new table.

> Note: there are no `expressionVocabularyRef` or `animationLibraryRef` columns on `permanent_avatars`. The link from a permanent avatar to its expression / animation records is always *via* the join tables above (`permanentAvatarId` FK on the child row), never via a back-reference column.

### 5.4 Room assignment

`defaultRoomKind` + `defaultRoomId` columns already exist on `permanent_avatars` (§3) but `defaultRoomId` is a **soft FK** until a `rooms` table is introduced by a separate task (likely a follow-up to R6 Virtual Set Preview). The CHECK constraint on `defaultRoomKind` keeps the value-set bounded.

---

## 6. Lifecycle

```
         ┌────────────────────────────────────────────────────────────┐
         │                       composed                              │
         │  (status='draft',  identityReview='pending',                │
         │                    safetyReview='pending',                  │
         │                    approvalGate='not_approved')             │
         └─────────────────┬───────────────────────────┬───────────────┘
                           │                           │
            identity review│                           │safety review
                           ▼                           ▼
         ┌──────────────────────┐         ┌──────────────────────┐
         │  identity_reviewed   │         │   safety_reviewed    │
         └─────────────────┬────┘         └────┬─────────────────┘
                           └────────┬──────────┘
                                    │ (both approved_internal)
                                    ▼
                           ┌────────────────────┐
                           │ approved_internal  │
                           │ (status='active',  │
                           │  approvalGate=     │
                           │   approved_internal)│
                           └─────────┬──────────┘
                                     │ archive
                                     ▼
                           ┌──────────┐
                           │ archived │ ◀── unarchive (re-runs pair-validity gate;
                           └────┬─────┘     falls back to 'composed' if it fails)
                                │ permanent_delete (confirm+reason)
                                ▼
                          (tombstone row written, then row + audit cascade gone)

Note: there is NO auto-demote arrow from approved_internal. The asset/rig
archive route (§3.5) refuses to archive a bound row with HTTP 409, so a
permanent avatar can never silently fall out of approved_internal because
of an upstream archive.
```

### 6.1 Stage `composed`
- Created by `POST /api/admin/permanent-avatars` with `{displayName, slug, bodyAssetId, rigId, personaSummary?, rolePreset?, voiceProfileHint?, languageHint?, defaultRoomKind?, defaultRoomId?}`.
- Pair-validity gate from §3.5 runs. On failure: HTTP 422 with one of `body_asset_not_approved | rig_not_approved | body_asset_archived | rig_archived | pair_already_bound`.

### 6.2 Stage `identity_reviewed`
- `POST /api/admin/permanent-avatars/:id/identity-review` `{decision, note?}` where decision ∈ `approved_internal | rejected | needs_changes`.
- Reviewer checks: persona is admin-appropriate, slug not reserved, role preset matches intended usage, no impersonation of real people without explicit founder note.

### 6.3 Stage `safety_reviewed`
- `POST /api/admin/permanent-avatars/:id/safety-review` `{decision, note?}` same enum.
- Reviewer checks: bound body asset + rig combination produces an anatomically plausible result (visually verified on `/admin/avatar-rig-preview` with the composed avatar selected); no nudity, no real-celebrity likeness, no protected-likeness use.

### 6.4 Stage `approved_internal`
- `POST /api/admin/permanent-avatars/:id/approval` advances to `approvalGate='approved_internal'`, `status='active'`.
- 409 unless both `identityReview === 'approved_internal'` AND `safetyReview === 'approved_internal'` AND pair-validity (§3.5) still holds at the moment of advancement.
- Terminal. There is **no** `approved_public` state (same discipline as rig/asset libraries — see R7A §6).

### 6.5 Stage `archived`
- `POST /api/admin/permanent-avatars/:id/archive` sets `status='archived'`.
- Reversible via `POST /api/admin/permanent-avatars/:id/unarchive` (returns to `status='active'` only if pair-validity still holds; otherwise demotes to `composed`).

### 6.6 Permanent delete
- `DELETE /api/admin/permanent-avatars/:id` `{confirm: true, reason}`.
- 409 unless `status='archived'`.
- Executed inside a single transaction:
  1. INSERT a row into `permanent_avatar_tombstones` (see §6.7) capturing actor, reason, the final snapshot, and the count of audit rows about to be cascaded.
  2. DELETE the `permanent_avatars` row (audit log cascades via `onDelete: "cascade"`).
- Does NOT delete the bound body asset or rig (FK `restrict` prevents accidental binary loss).

### 6.7 Tombstone table — `permanent_avatar_tombstones`

```ts
export const permanentAvatarTombstones = pgTable("permanent_avatar_tombstones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalPermanentAvatarId: varchar("original_permanent_avatar_id").notNull(),
  slug: text("slug").notNull(),                 // remembered so the slug stays burned
  displayName: text("display_name").notNull(),
  bodyAssetId: varchar("body_asset_id").notNull(),
  rigId: varchar("rig_id").notNull(),
  finalSnapshot: jsonb("final_snapshot").notNull(),     // full row as last seen
  audit_log_count: integer("audit_log_count").notNull(),
  deletedByUserId: text("deleted_by_user_id").notNull(),
  deletionReason: text("deletion_reason").notNull(),
  deletedAt: timestamp("deleted_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_permanent_avatar_tombstones_slug").on(table.slug),
  index("IDX_permanent_avatar_tombstones_original_id").on(table.originalPermanentAvatarId),
  index("IDX_permanent_avatar_tombstones_deleted_at").on(table.deletedAt),
]);
```

Tombstones are **immutable** (no UPDATE / DELETE route ever exposed). They preserve forensic context after the cascade clears the audit log, and they keep the `slug` permanently reserved (§3.4 / O2). Resolves the O5/O7 contradiction in the prior draft of §10.

---

## 7. REST API surface (proposed)

All routes mounted at `/api/admin/permanent-avatars/*`, all `requireRootAdmin`, all under the global CSRF middleware, mirroring `/api/admin/production-rigs/*`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/permanent-avatars` | Create composed permanent avatar (pair-validity gate runs) |
| `GET`  | `/api/admin/permanent-avatars?status=&approvalGate=&identityReview=&safetyReview=&bodyAssetId=&rigId=&limit=&offset=` | List with filters |
| `GET`  | `/api/admin/permanent-avatars/:id` | Detail + last 20 audit rows + currently-bound asset/rig summaries |
| `PATCH`| `/api/admin/permanent-avatars/:id` | Update identity fields (displayName, personaSummary, voiceProfileHint, languageHint, rolePreset, defaultRoomKind, defaultRoomId). Cannot touch lifecycle fields. |
| `POST` | `/api/admin/permanent-avatars/:id/rebind` | Rebind `bodyAssetId` and/or `rigId`. Demotes to `composed`, resets both reviews. |
| `POST` | `/api/admin/permanent-avatars/:id/identity-review` | §6.2 |
| `POST` | `/api/admin/permanent-avatars/:id/safety-review` | §6.3 |
| `POST` | `/api/admin/permanent-avatars/:id/approval` | §6.4 |
| `POST` | `/api/admin/permanent-avatars/:id/archive` | §6.5 |
| `POST` | `/api/admin/permanent-avatars/:id/unarchive` | §6.5 |
| `DELETE` | `/api/admin/permanent-avatars/:id` | §6.6 |
| `GET`  | `/api/admin/permanent-avatars/:id/preview-bundle` | Returns `{bodyAssetSignedUrl, rigSignedUrl}` — two ≤900 s URLs issued on demand, **never persisted**, audit-log records `{ttlSeconds, expiresAt}` only. No new URL endpoint — internally calls the existing asset and rig signed-preview-URL handlers. |

### 7.1 Serializer overlay

Every response row passes through a serializer that hard-overrides:

```
publicUrl       = null
realSendAllowed = false
executionEnabled= false
visibility      = 'admin_only_internal'
```

even if the DB row were somehow mutated, as defence-in-depth alongside the CHECK constraints.

### 7.2 Provider isolation

Same audit clause as R7A §4: the route file is forbidden from importing or referencing **any** of:
`heygen`, `elevenlabs`, `meshy`, `runway`, `nvidia-ace`, `convai`, `deepmotion`, `rokoko`, `metahuman`, `unity`, `unreal`. A grep guard in the route's test file should enforce this on CI.

---

## 8. UI surfaces (proposed; not implemented)

### 8.1 New page tree

```
/admin/permanent-avatars                     RigLibraryList-shaped library
/admin/permanent-avatars/new                 Create form (pickers for body asset + rig)
/admin/permanent-avatars/:id                 Detail (identity fields, bound asset/rig links,
                                             lifecycle state, audit log, preview button)
/admin/permanent-avatars/:id/identity-review Identity review form
/admin/permanent-avatars/:id/safety-review   Safety review form
/admin/permanent-avatars/:id/rebind          Rebind dialog (demotion warning)
```

### 8.2 Visual preview reuse

`/admin/avatar-rig-preview` already loads one rig with T/A-pose. Extend its source picker (separate UI task) to add a **Permanent Avatar** source kind that:

- Fetches `/api/admin/permanent-avatars/:id/preview-bundle`
- Loads the body asset GLB via the asset signed URL
- Loads the rig GLB via the rig signed URL
- Renders body + rig in the same R3F scene with the existing T/A-pose toggle

No new R3F provider, no new shader, no new physics. Just two signed URLs into the existing canvas.

### 8.3 Cross-link from rig/asset detail

- `/admin/3d-rigs/:id` adds a **Used by permanent avatars** card (read-only list) so an operator can see why a rig refuses permanent delete.
- `/admin/3d-assets/:id` adds the same card.

### 8.4 Dashboard

`AdminDashboard.tsx` "3D / 4D / Unreal" zone adds one card linking to `/admin/permanent-avatars`.

---

## 9. Safety invariants (must be preserved)

These mirror R7A §4 and are restated here as the design's hard contract:

1. `publicUrl IS NULL` (default + CHECK + serializer overlay).
2. `realSendAllowed = FALSE` (default + CHECK + serializer overlay).
3. `executionEnabled = FALSE` (default + CHECK + serializer overlay).
4. `visibility = 'admin_only_internal'` (default + CHECK + serializer overlay).
5. No `approved_public` state — terminal is `approved_internal`. **DB-pinned** by `permanent_avatars_approval_gate_no_public` CHECK (§3). Companion enum CHECKs pin `status`, `lifecycleState`, `identityReview`, `safetyReview`, `rolePreset`, `defaultRoomKind` so no future route mutation can introduce an unknown value.
6. Approval requires identity_review = approved_internal AND safety_review = approved_internal AND pair-validity gate (§3.5).
7. Bound body asset and rig cannot be archived OR permanently deleted while a permanent avatar references them. The asset/rig **archive** route refuses with HTTP 409 (`asset_referenced_by_permanent_avatar` / `rig_referenced_by_permanent_avatar`) — synchronous block, no background auto-demote sweeper in v1 (§3.5, §6 diagram, §10 O3). The asset/rig **delete** route is additionally protected by FK `onDelete: "restrict"`.
8. Permanent delete only from `status='archived'` with `{confirm:true, reason}`.
9. Signed preview URLs ≤ 900 s, never persisted; audit log stores metadata only.
10. All routes root-admin gated; CSRF enforced.
11. No provider client / SDK / fetch from `permanent-avatars` route (CI-enforced grep guard).
12. No render, no live, no Unreal, no 4D hardware, no publishing behavior.

---

## 10. Open questions

All previously contradictory questions (O3, O5, O7 from earlier drafts) are **resolved in the design body** — they are repeated here only for the record.

| ID | Question | Resolution |
|---|---|---|
| O1 | Entity name (`permanent_avatars` vs alternatives) | **Resolved:** `permanent_avatars` |
| O2 | Should `slug` allow re-use after archive or delete? | **Resolved:** No. Globally unique on `permanent_avatars` (§3.4); permanently reserved by `permanent_avatar_tombstones.slug` (§6.7) after delete. |
| O3 | Handling of an asset/rig archive when a `permanent_avatars` row still references it: synchronous block vs background auto-demote? | **Resolved (synchronous block):** §3.5 + §6 diagram. The asset/rig archive route refuses with HTTP 409 and returns the referencing IDs. **No** background auto-demotion sweeper exists in v1. |
| O4 | Should `personaSummary` be GCIS-reviewed before identity-review can pass? | **Deferred:** v1 uses manual founder identity-review. GCIS hook is a later task and does not block this design. |
| O5 / O7 | Forensic retention after `permanent_delete` (tombstone vs audit-only)? | **Resolved (tombstone):** §6.7 defines `permanent_avatar_tombstones`. The tombstone row is INSERTed inside the same transaction as the DELETE, immediately before the audit-log cascade. Immutable. Holds the slug burn and the final snapshot. |
| O6 | Rebind: fresh upload required, or existing approved row OK? | **Resolved:** Existing approved row is fine. Rebind demotes the avatar to `composed` and resets both reviews because the *combination* is what was reviewed. |

---

## 11. Out of scope (explicitly NOT this design)

- Implementation. No schema, no migration, no route, no UI, no test file, no validator changes are written by this document.
- Accessory / expression / animation tables — only the *hooks* are defined; the tables themselves are separate future tasks.
- Provider integration (HeyGen / ElevenLabs / Meshy / Runway / Unity / Unreal / 4D hardware).
- Public URL or any `approved_public` state.
- Render execution, live behavior, publishing.
- Room table schema (the `defaultRoomId` column is a soft FK only).
- Real-celebrity / real-person likeness governance (separate GCIS task).
- Cross-tenant sharing of permanent avatars (founder-only for v1).

---

## 12. Acceptance criteria for this **design** document

(Not the implementation — those come later.)

- [x] Entity is named and motivated.
- [x] Table shape is fully specified (every column, every default, every index, every CHECK — including DB-pinned enum CHECKs that prevent `approved_public` and any other unknown value at the database layer).
- [x] Audit log table is fully specified.
- [x] Tombstone table is fully specified (§6.7) and the delete transaction order is documented.
- [x] Lifecycle diagram + every state transition documented (with explicit "no auto-demote" note).
- [x] Asset/rig archive-blocking policy (§3.5) is consistent across §3, §6 diagram, §9, and §10.
- [x] REST API surface listed end-to-end with one paragraph per endpoint of intent.
- [x] UI surface tree listed; visual-preview reuse path described.
- [x] Forward hooks for accessories, expressions, animations defined as separate tables (not columns).
- [x] All R7A §4 safety invariants restated and pinned in §9.
- [x] Open questions enumerated with a recommended answer.
- [x] Out-of-scope items enumerated.

---

## 13. Source-of-truth file references

- `docs/reports/R7A_AVATAR_RIG_VISUAL_PREVIEW_AUDIT.md` (predecessor audit)
- `docs/runbooks/PERMANENT_3D_AVATAR_CREATION_RUNBOOK.md` (operator workflow this design will eventually power end-to-end)
- `shared/schema.ts` lines 5079–5243 (`productionAssets`, `productionAssetAuditLog`, `productionRigs`, `productionRigAuditLog`) — the pattern this design mirrors
- `server/routes/admin/production-rigs.ts` — the route file shape `/api/admin/permanent-avatars` should follow
- `server/services/production-rig-storage.ts` — referenced *only* through the existing signed-preview-URL endpoints (no new storage wrapper)
- `client/src/pages/admin/3d-rigs/*` — the UI shape `/admin/permanent-avatars` should follow
- `client/src/pages/admin/AvatarRigPreview.tsx` — the preview surface that will gain a permanent-avatar source kind

---

**End of design.** Implementation must be split into individually approved follow-up tasks (suggested split: R7B-Schema, R7B-Routes, R7B-UI-Library, R7B-UI-Preview-Extension, R7B-Cross-Links). **Do not implement from this document directly.**
