# R7B-Routes — Permanent-Avatar Admin REST Surface

**Task:** #889 (R7B-Routes)
**Date:** 2026-05-22
**Design:** [`docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md`](../design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md) §7, §9
**Prerequisite:** R7B-Schema (tables + CHECK constraints already shipped)

## Summary

Implemented the full `/api/admin/permanent-avatars/*` REST surface on top of
the R7B-Schema tables `permanent_avatars`, `permanent_avatar_audit_log`, and
`permanent_avatar_tombstones`. Every endpoint is gated by `requireRootAdmin`
+ CSRF. The serializer hard-pins the four safety invariants
(`publicUrl=null`, `realSendAllowed=false`, `executionEnabled=false`,
`visibility='admin_only_internal'`) as defence-in-depth on top of the
DB CHECK constraints. Existing production-asset and production-rig
archive routes now refuse archival when a permanent avatar references
the row (HTTP 409).

## Files

### New

| Path | Purpose |
| --- | --- |
| `server/routes/admin/permanent-avatars.ts` | Express route module — 12 endpoints, all admin-only, serializer overlay enforced. |
| `tests/permanent-avatars-routes-provider-isolation.test.ts` | CI grep guard for forbidden provider tokens + safety-overlay invariants. |
| `docs/reports/R7B_ROUTES_REPORT.md` | This report. |

### Modified

| Path | Change |
| --- | --- |
| `server/storage.ts` | Added `PermanentAvatarStorageError`, 14 storage methods + IStorage entries (create / get / list / patch / rebind / identity-review / safety-review / approval / archive / unarchive / delete / append-audit / list-audit / count-by-asset / count-by-rig / bound-summaries). All mutations transactional with audit-log entry. |
| `server/routes.ts` | Registered `registerPermanentAvatarRoutes(app, requireRootAdmin)`. |
| `server/routes/admin/production-assets.ts` | `POST /:id/archive` now returns `409 asset_referenced_by_permanent_avatar` when any permanent avatar binds the asset. |
| `server/routes/admin/production-rigs.ts` | `POST /:id/archive` now returns `409 rig_referenced_by_permanent_avatar` when any permanent avatar binds the rig. |

## Endpoints (all under `/api/admin/permanent-avatars`, all `requireRootAdmin` + CSRF)

| Method + Path | Behaviour |
| --- | --- |
| `POST /` | Create. Slug uniqueness checked against BOTH live rows and tombstones. Pair-validity gate (body asset + rig must each be `approvalGate='approved_internal'` and non-archived). Initial state: `status='draft'`, `lifecycleState='composed'`, both reviews `pending`, `approvalGate='not_approved'`. |
| `GET /` | Filterable list (`status`, `approvalGate`, `identityReview`, `safetyReview`, `bodyAssetId`, `rigId`). Paginated. |
| `GET /:id` | Detail + last 20 audit rows + bound body-asset and rig summaries. |
| `PATCH /:id` | Update identity-only fields (`displayName`, `personaSummary`, `voiceProfileHint`, `languageHint`, `rolePreset`, `defaultRoomKind`, `defaultRoomId`). Cannot change bindings or review state. |
| `POST /:id/rebind` | Change `bodyAssetId` and/or `rigId`. Pair-validity re-checked. Demotes lifecycle to `composed`, resets both reviews to `pending`, resets `approvalGate` to `not_approved`. |
| `POST /:id/identity-review` | Founder writes identity decision (`approved_internal` / `rejected` / `needs_changes`) + optional note. Lifecycle re-derived. |
| `POST /:id/safety-review` | Same for safety axis. |
| `POST /:id/approval` | Advances `approvalGate` `not_approved → approved_internal`. Refuses with 409 unless both reviews are `approved_internal` AND pair is still valid. Sets `status='active'`, `lifecycleState='approved_internal'`. |
| `POST /:id/archive` | `draft|active → archived`. 409 if already archived. |
| `POST /:id/unarchive` | `archived → active` (if `approvalGate='approved_internal'`) or `draft`. |
| `DELETE /:id` | Permanent delete from `archived` only. Body requires `{confirm:true, reason}`. Same-transaction: writes immutable `permanent_avatar_tombstones` row (slug burn + final snapshot + audit-log count + actor + reason) + `moderation_logs` entry, then deletes the parent (audit-log cascades). |
| `GET /:id/preview-bundle` | Ephemeral signed URLs for the bound body-asset GLB and rig GLB. TTL clamped to ≤900 s. URLs are NEVER persisted — audit log records only `{ttlSeconds, bodyAssetExpiresAt, rigExpiresAt}`. |

## Safety invariants (defence-in-depth)

| Invariant | Enforcement |
| --- | --- |
| `publicUrl` is always `null` on the wire | (a) DB column default + CHECK (R7B-Schema), (b) serializer overlay `publicUrl: null` on every response. |
| `realSendAllowed` is always `false` on the wire | DB CHECK + serializer overlay `realSendAllowed: false`. |
| `executionEnabled` is always `false` on the wire | DB CHECK + serializer overlay `executionEnabled: false`. |
| `visibility` is always `'admin_only_internal'` on the wire | DB CHECK + serializer overlay `visibility: "admin_only_internal"`. |
| `approvalGate ≠ 'approved_public'` | DB CHECK (R7B-Schema). No route ever attempts the value. |
| Bound asset + rig must both be `approved_internal` (non-archived) at create/rebind/approval | `assertPairApprovedInternal` in `server/storage.ts`. Throws `avatar_pair_not_approved_internal` (HTTP 409). |
| Tombstone slug burn cannot be reused | `assertPermanentAvatarSlugAvailable` checks BOTH `permanent_avatars` AND `permanent_avatar_tombstones`. |
| Archive-block | Asset and rig archive routes call `countPermanentAvatarsReferencingAsset/Rig` and return HTTP 409 if any reference exists. |
| Signed preview URLs ≤900 s | Route clamps with `Math.min(MAX_SIGNED_URL_TTL=900, …)` before delegating to the production-asset / production-rig signing helpers (which themselves clamp to their own 900 s cap). |
| Signed preview URL never persisted | Route inserts an audit row with `{ttlSeconds, bodyAssetExpiresAt, rigExpiresAt}` only — never the URL string. |
| Provider isolation | Route module mentions no external avatar/voice/motion provider name. Enforced by `tests/permanent-avatars-routes-provider-isolation.test.ts`. |

## Audit-log events

| Event name | Written by |
| --- | --- |
| `avatar.created` | `POST /` |
| `avatar.identity_updated` | `PATCH /:id` |
| `avatar.rebound` | `POST /:id/rebind` |
| `avatar.identity_reviewed` | `POST /:id/identity-review` |
| `avatar.safety_reviewed` | `POST /:id/safety-review` |
| `avatar.approved` | `POST /:id/approval` |
| `avatar.archived` | `POST /:id/archive` |
| `avatar.unarchived` | `POST /:id/unarchive` |
| `preview_bundle_issued` | `GET /:id/preview-bundle` |
| (parent row cascade-deleted) | `DELETE /:id` — superseded by tombstone + `moderation_logs` entry |

## Tests

- `tests/permanent-avatars-routes-provider-isolation.test.ts` (4 subtests, all passing):
  - No forbidden provider token in route source.
  - No `fetch(` call, no `axios` import.
  - Serializer overlay strings (`publicUrl: null`, `realSendAllowed: false`, `executionEnabled: false`, `visibility: "admin_only_internal"`) are literally present.
  - `MAX_SIGNED_URL_TTL = 900` is literally present.

```
ok 1 - permanent-avatars.ts contains no forbidden provider names
ok 2 - permanent-avatars.ts contains no raw fetch() or SDK import
ok 3 - permanent-avatars.ts enforces the serializer overlay
ok 4 - permanent-avatars.ts clamps signed-URL TTL to ≤900s
# pass 4  fail 0
```

## Verification

- `Start application` workflow boots cleanly after route registration.
- `tsc --noEmit` reports no new diagnostics in any file touched by this task (a single pre-existing diagnostic in `production-assets.ts` line 885 is unrelated to the R7B work).
- Provider-isolation test passes (4/4 subtests).

## Out of scope (deferred to follow-up tasks)

- Admin UI (`/admin/permanent-avatars/*` pages) — R7B-AdminUI.
- Cross-links from production-asset detail / production-rig detail pages to referencing permanent avatars — R7B-Cross-Links.
- Tombstone admin browse / restore-blocked UX — R7B-Tombstones.
- Server-side execution / room-binding consumers — out of R7B scope; deliberately fenced behind the `executionEnabled=false` overlay.
