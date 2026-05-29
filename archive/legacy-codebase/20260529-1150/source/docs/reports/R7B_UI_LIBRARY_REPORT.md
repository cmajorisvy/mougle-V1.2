# R7B-UI-Library — Permanent Avatar Admin UI

**Date:** 2026-05-22
**Task:** #890 (R7B-UI-Library)
**Predecessor:** [`docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md`](../design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md) (§7 API, §8 UI surfaces) · [`docs/reports/R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md`](R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md)
**Companion (not yet shipped):** R7B-Routes — `/api/admin/permanent-avatars/*`

---

## 1. Scope

UI-only. Builds the admin pages described in design §8 against the API contract in design §7. **No** schema, route, provider, render, publish, `publicUrl`, or signed-URL persistence change.

Until R7B-Routes lands, `useQuery` against `/api/admin/permanent-avatars/*` will return a network error; every page renders that error in a `data-testid="text-error"` block — no UI crash, no blank page.

## 2. Files added

```
client/src/pages/admin/permanent-avatars/
  shared.tsx                            -- enum constants + types + safety badges
  PermanentAvatarList.tsx               -- /admin/permanent-avatars
  PermanentAvatarCreate.tsx             -- /admin/permanent-avatars/new
  PermanentAvatarDetail.tsx             -- /admin/permanent-avatars/:id
  PermanentAvatarIdentityReview.tsx     -- /admin/permanent-avatars/:id/identity-review
  PermanentAvatarSafetyReview.tsx       -- /admin/permanent-avatars/:id/safety-review
  PermanentAvatarRebind.tsx             -- /admin/permanent-avatars/:id/rebind
```

## 3. Files edited

- `client/src/App.tsx` — 6 lazy imports + 6 `<Route>` registrations (ordered so `:id/identity-review`, `:id/safety-review`, `:id/rebind` and `/new` precede the bare `:id` detail route to avoid pattern shadowing).
- `client/src/pages/admin/AdminDashboard.tsx` — one new link card in the `studio-3d-4d` zone (`label: "Permanent Avatars"`), placed directly after the "3D Asset Library" card.
- `docs/library/INDEX.md` — §E row for this report.

## 4. Page-by-page contract

### 4.1 List (`PermanentAvatarList`)
- Filters: `status`, `approvalGate`, `identityReview`, `safetyReview`, `bodyAssetId`, `rigId`. All server-side via the documented query string.
- Pagination: `limit=20`, `offset` query params.
- Each row deep-links to `/admin/3d-assets/:bodyAssetId` and `/admin/3d-rigs/:rigId` directly from the cell.

### 4.2 Create (`PermanentAvatarCreate`)
- Body-asset and rig pickers are **server-filtered** by `status=active&approvalGate=approved_internal&limit=200`. The UI does not show un-approved entries.
- Default-room is optional; "(none)" sentinel value is normalized to absence in the request body (Radix Select does not accept empty string values).
- Pair-validity / duplicate-pair / archived-source rejections surface via the documented `reason` field.

### 4.3 Detail (`PermanentAvatarDetail`)
- Lifecycle pills: lifecycle, identity, safety, gate, status, role preset.
- Bound asset / bound rig cards include "Open asset detail" / "Open rig detail" deep links.
- **Preview bundle** (design §7, single endpoint that returns two signed URLs): held in component state only. Not written to localStorage, form state, or persisted query state. Cleared on component unmount. The `data-testid="text-preview-bundle-expires"` shows the server `expiresAt` clock; users can click through to either URL until the server's TTL elapses.
- **Permanent delete** is a `shadcn/ui` `AlertDialog`:
  1. Requires retyping the slug exactly (mismatch → inline error, button stays disabled).
  2. Requires a non-empty reason (stored in the tombstone per design §6.7).
  3. Button stays disabled until both conditions are met.
  4. Button is only shown when `status === "archived"`.
- Audit log shows the last 20 events as returned by `GET /:id`.

### 4.4 Identity review (`PermanentAvatarIdentityReview`)
- Decision radio (`approved_internal | needs_changes | rejected`) + optional note.
- Reviewer checklist text mirrors design §6.2.

### 4.5 Safety review (`PermanentAvatarSafetyReview`)
- Decision radio + 5-item checklist (anatomy plausible / no nudity / no real-celebrity / no protected likeness / persona appropriate).
- Submit is disabled when decision is `approved_internal` and any checkbox is unchecked.

### 4.6 Rebind (`PermanentAvatarRebind`)
- Warning banner makes the demotion consequence explicit: avatar returns to `composed`, both reviews reset to `pending`, gate resets to `not_approved`.
- Same server-filtered pickers as Create.

## 5. Safety badge bar (`shared.tsx → PermanentAvatarSafetyBadges`)

Shown at the top of every page:

- Admin-only · private
- publicUrl always null
- No approved_public
- No provider calls
- Preview URLs ≤ 15 min · never persisted

## 6. Provider isolation

No imports or string mentions of HeyGen, ElevenLabs, Meshy, Runway, NVIDIA ACE, Convai, DeepMotion, Rokoko, MetaHuman, Unity, or Unreal in any of the 7 new files. The pages only call `/api/admin/permanent-avatars/*`, `/api/admin/production-assets`, and `/api/admin/production-rigs`.

## 7. Test IDs

Every interactive control and every meaningful display element carries a stable `data-testid`. Notable IDs (for the R7B-UI follow-up Playwright spec):

- `page-permanent-avatars-{list,create,detail,identity-review,safety-review,rebind}`
- `button-new-permanent-avatar`, `button-submit-create`, `button-submit-rebind`
- `button-preview-bundle`, `link-preview-body-asset`, `link-preview-rig`, `text-preview-bundle-expires`
- `button-permanently-delete`, `dialog-permanent-delete`, `input-confirm-slug`, `input-delete-reason`, `button-confirm-delete`
- `button-advance-approval`, `button-archive`, `button-unarchive`, `button-rebind`
- `link-deep-body-asset`, `link-deep-rig`

## 8. Out of scope (covered by other tasks)

- `/api/admin/permanent-avatars/*` routes — **R7B-Routes** (not yet shipped).
- Rig / asset side cross-links + "Used by N permanent avatars" badges — **R7B-Cross-Links** (already queued as a separate task).
- R3F preview surface extension — **R7B-UI-Preview-Extension**.

## 9. Verification

- TypeScript: HMR compiles cleanly after each file write (Vite shows `hmr update` lines without errors in `Start application` workflow logs).
- Lazy imports: all 6 pages registered with the same `LazyAssetPage` wrapper used by `/admin/3d-rigs/*`.
- Routes: ordered so static / nested patterns precede the bare `:id` pattern, preventing `wouter` from matching `:id` against `new`, `identity-review`, `safety-review`, or `rebind`.

---

## Appendix A — Route map

| Path | Component |
|---|---|
| `/admin/permanent-avatars` | `PermanentAvatarList` |
| `/admin/permanent-avatars/new` | `PermanentAvatarCreate` |
| `/admin/permanent-avatars/:id/identity-review` | `PermanentAvatarIdentityReview` |
| `/admin/permanent-avatars/:id/safety-review` | `PermanentAvatarSafetyReview` |
| `/admin/permanent-avatars/:id/rebind` | `PermanentAvatarRebind` |
| `/admin/permanent-avatars/:id` | `PermanentAvatarDetail` |
