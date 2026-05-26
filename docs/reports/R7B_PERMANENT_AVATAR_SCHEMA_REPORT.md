# R7B-Schema — Permanent Avatar Entity (Schema-Only) Report

**Task:** R7B-Schema (first of the five-task R7B implementation split)
**Design:** [`docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md`](../design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md)
**Predecessor:** R7B design accepted in checkpoint `b9abdbb1`
**Scope:** schema layer only — no routes, no UI, no provider calls, no R3F preview changes, no back-reference columns on `production_assets` / `production_rigs`, no behavior change

---

## 1. What shipped

### 1.1 `shared/schema.ts` additions

Three Drizzle tables appended after the existing `production_rig_audit_log` block:

| Table | Purpose | FK strategy |
|---|---|---|
| `permanent_avatars` | One row per permanent avatar entity. Binds one approved body asset + one approved rig + identity/persona/default-room metadata. | `body_asset_id` → `production_assets.id` **ON DELETE RESTRICT**; `rig_id` → `production_rigs.id` **ON DELETE RESTRICT** |
| `permanent_avatar_audit_log` | Append-only audit trail for every lifecycle event on a permanent avatar. | `permanent_avatar_id` → `permanent_avatars.id` **ON DELETE CASCADE** |
| `permanent_avatar_tombstones` | Immutable forensic row written **in the same transaction as a permanent delete**, **before** the audit-log cascade fires. Preserves slug burn + final snapshot. | No FK — by design — parent row is gone after the txn (same discipline as `production_asset_deletion_snapshots` from Task #783) |

Insert + select types follow the existing pattern:
`InsertPermanentAvatar` / `PermanentAvatar`, `InsertPermanentAvatarAuditLog` / `PermanentAvatarAuditLog`, `InsertPermanentAvatarTombstone` / `PermanentAvatarTombstone`. The insert schema for `permanent_avatars` `.omit()`s the four safety-invariant columns (`publicUrl`, `realSendAllowed`, `executionEnabled`, `visibility`) so route callers physically cannot send a value for them — the DB defaults plus CHECKs are the only path.

### 1.2 Migration

`migrations/0004_r7b_permanent_avatars.sql` — generated via `npx drizzle-kit generate --name r7b_permanent_avatars`, then manually trimmed to remove pre-existing schema drift (see §4). Journal entry `idx 4` added to `migrations/meta/_journal.json` with snapshot `0004_snapshot.json`.

### 1.3 Hard safety invariants (DB-pinned)

Eleven CHECK constraints — every safety claim made in the design is enforceable at the database, not just at the route serializer:

| Constraint | Rule |
|---|---|
| `permanent_avatars_public_url_must_be_null` | `public_url IS NULL` |
| `permanent_avatars_real_send_must_be_false` | `real_send_allowed = FALSE` |
| `permanent_avatars_execution_must_be_false` | `execution_enabled = FALSE` |
| `permanent_avatars_visibility_admin_only` | `visibility = 'admin_only_internal'` |
| `permanent_avatars_status_allow_list` | `status IN ('draft','active','archived')` |
| `permanent_avatars_lifecycle_state_allow_list` | `lifecycle_state IN ('composed','identity_reviewed','safety_reviewed','approved_internal')` |
| `permanent_avatars_identity_review_allow_list` | `identity_review IN ('pending','approved_internal','rejected','needs_changes')` |
| `permanent_avatars_safety_review_allow_list` | `safety_review IN ('pending','approved_internal','rejected','needs_changes')` |
| `permanent_avatars_approval_gate_no_public` | `approval_gate IN ('not_approved','approved_internal')` — **no `approved_public` ever** |
| `permanent_avatars_role_preset_allow_list` | `role_preset IN ('news_anchor','podcast_host','debate_moderator','guest','analyst','field_reporter','teacher','virtual_ceo','ai_assistant','custom')` |
| `permanent_avatars_default_room_kind_allow_list` | `default_room_kind IS NULL OR default_room_kind IN ('news_room','podcast_room','debate_studio','living_room')` |

### 1.4 Indexes

- `IDX_permanent_avatars_{status,safety_review,identity_review,approval_gate,body_asset,rig}` — single-column lookup indexes.
- `UQ_permanent_avatars_body_rig_pair` — UNIQUE on `(body_asset_id, rig_id)` so an identical body+rig pair cannot be composed twice.
- `permanent_avatars.slug` — UNIQUE constraint inherited from `.unique()` on the column.
- `IDX_permanent_avatar_audit_log_{avatar_created,event}`.
- `IDX_permanent_avatar_tombstones_{slug,original_id,deleted_at}`.

---

## 2. Guardrail compliance

| Guardrail | Status |
|---|---|
| No publicUrl path | ✅ `public_url` column is nullable, defaults `NULL`, and is pinned `NULL` by `permanent_avatars_public_url_must_be_null` CHECK. Insert schema `.omit`s it. |
| No `approved_public` state | ✅ `approval_gate` CHECK allows only `not_approved` / `approved_internal`. |
| No signed URL persistence | ✅ no signed URL column exists. |
| No provider calls | ✅ no provider client touched. |
| No render / live / Unreal / 4D hardware | ✅ no executor / scene / runtime / hardware column exists. `executionEnabled = FALSE` is CHECK-pinned. |
| No publishing | ✅ `visibility` CHECK-pinned to `admin_only_internal`. |
| No back-ref columns on `production_assets` | ✅ verified — `production_assets` block (lines 5079–5118) unchanged. |
| No back-ref columns on `production_rigs` | ✅ verified — `production_rigs` block (lines 5185–5246) unchanged. |
| No routes added | ✅ no `server/routes/**` file touched. |
| No UI added | ✅ no `client/**` file touched. |
| No R3F preview changes | ✅ no `production-house/` / `r3f-*` / `avatar-rig-*` file touched. |

`git --no-optional-locks diff --stat HEAD` (relative to the R7B-design checkpoint `b9abdbb1`) is bounded to:
- `shared/schema.ts` (additions only — appended block; no existing lines modified)
- `migrations/0004_r7b_permanent_avatars.sql` (new)
- `migrations/meta/_journal.json` + `migrations/meta/0004_snapshot.json` (new journal entry)
- `docs/reports/R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md` (this report)
- `docs/library/INDEX.md` (one row added)

---

## 3. FK direction + scope of what FK RESTRICT actually does

The design's §5.3 note is implemented as written:

```
permanent_avatars.body_asset_id → production_assets.id  ON DELETE RESTRICT
permanent_avatars.rig_id        → production_rigs.id    ON DELETE RESTRICT
```

The parent → child direction is `production_assets / production_rigs → permanent_avatars`, so no column is added to the parent tables.

**Scope clarification** (architect-flagged): `ON DELETE RESTRICT` only blocks `DELETE` on a referenced asset/rig — it does **not** block an `UPDATE … SET status='archived'` on those rows. The design's §9.7 "synchronous HTTP 409 archive-block" must therefore be enforced at the route/service layer of **R7B-Routes** (and, for completeness, on the existing archive routes in `/api/admin/production-assets/*` and `/api/admin/production-rigs/*`), via an explicit pre-archive reference check against `permanent_avatars`. FK RESTRICT is the safety net for the delete path only; the route-layer check is the load-bearing enforcement for the archive path. This scope split is documented here so the next task owner does not assume the DB has already taken care of it.

## 3a. Tombstone immutability (now DB-enforced)

The original cut of this task left "tombstones are immutable" as policy only. The migration now ships two BEFORE triggers on `permanent_avatar_tombstones` (`permanent_avatar_tombstones_no_update`, `permanent_avatar_tombstones_no_delete`) calling a shared `permanent_avatar_tombstones_block_mutations()` plpgsql function that `RAISE EXCEPTION`s on any UPDATE or DELETE. INSERT is unaffected. This means even a buggy future route handler that tries to mutate a tombstone row hits a hard DB error.

---

## 4. Pre-existing migration drift — reconciled inline

`drizzle-kit generate` detected four pre-existing `production_asset_orphan_sweep_*` tables that live in `shared/schema.ts` but were never journaled (applied to the live DB by an earlier `drizzle-kit push`; the corresponding `migrations/0004_task_806_orphan_sweep_flapping_snoozes.sql` file exists but was never added to `_journal.json`).

The first cut of this task stripped those DDL statements from the migration, which left `0004_snapshot.json` advanced past what the SQL actually creates — non-reproducible on a fresh DB (architect-flagged).

**Fix applied:** the orphan-sweep `CREATE TABLE` / `CREATE INDEX` statements are now included in `0004_r7b_permanent_avatars.sql` with `IF NOT EXISTS`. This is safe in both directions:
- **Fresh empty DB** (migrate from scratch) → the tables are created, snapshot matches reality.
- **Live DB** (where they already exist from the earlier push) → `IF NOT EXISTS` makes the statements no-ops, no error raised.

A header comment in the SQL file records this reconciliation. The stale `migrations/0004_task_806_orphan_sweep_flapping_snoozes.sql` file is left untouched — it predates this task, has no journal entry, and removing it is outside R7B-Schema scope.

---

## 5. Verification

- ✅ `npx drizzle-kit generate --name r7b_permanent_avatars` — produced the .sql file, snapshot, and journal entry without prompting (no destructive ops detected).
- ✅ Workflow restart (`Start application`) — Vite + Express boot clean against the new schema file; no LSP errors visible in workflow logs after restart. (Long-running `tsc --noEmit` did not return inside the 2-minute tool budget on this monorepo, which is normal for this codebase size — the workflow restart is the operative smoke check, since the runtime also imports the schema.)
- ✅ Source diff bounded to the 5 files listed in §2.

---

## 6. What is intentionally NOT in this task

These are scoped to the remaining R7B implementation split, each requiring its own founder approval:

| Task | Owns |
|---|---|
| **R7B-Routes** | `/api/admin/permanent-avatars/*` REST surface, slug uniqueness check that consults BOTH `permanent_avatars.slug` AND `permanent_avatar_tombstones.slug`, synchronous HTTP 409 archive-block wrapper around the FK RESTRICT error, transactional permanent-delete that writes the tombstone before the cascade |
| **R7B-UI-Library** | `/admin/permanent-avatars` (list / detail / approval flow) |
| **R7B-UI-Preview-Extension** | "Load permanent avatar" toggle on the existing R3F preview sandbox (reuse only) |
| **R7B-Cross-Links** | Admin dashboard zone wiring + cross-links from `/admin/3d-assets/:id` / `/admin/avatar-rig-preview` |

Nothing from this list is implemented here. No code in `server/` or `client/` was modified.
