# R7B-Cross-Links — Rig / Asset Detail Cross-Links to Permanent Avatars Report

**Task:** Task #892 — R7B-Cross-Links
**Design:** [`docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md`](../design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md) §8.3 + §8.4
**Depends on:** R7B-Routes (`/api/admin/permanent-avatars` list endpoint with `bodyAssetId` / `rigId` filters) · R7B-UI-Library (admin pages + dashboard card)

---

## 1. What shipped

### 1.1 New shared component

`client/src/components/admin/UsedByPermanentAvatarsCard.tsx` — a single shadcn `Card` used on both the rig detail and the asset detail page.

- Takes a discriminated `filter` prop: `{ kind: "bodyAsset" | "rig"; id: string }`.
- Calls `GET /api/admin/permanent-avatars?{bodyAssetId|rigId}=:id&limit=100&offset=N` via react-query and **pages through the result until every binding row is loaded** (server clamps `limit` to 100; the card loops at the maximum page size, exits when a short page is returned or `collected.length >= total`, and has a 50-page hard ceiling as a safety net). This is load-bearing for the UX goal: if any avatar is missing from the card, an operator can't see why the asset/rig is refusing to archive.
- Renders:
  - A count badge.
  - A short operator hint explaining that while any avatar is listed, archive / permanent-delete is refused with HTTP 409 and the operator must rebind or archive each avatar first.
  - A compact list — one row per avatar — with `displayName` linking deep into `/admin/permanent-avatars/:id`, the slug, and three lifecycle pills (`lifecycle`, `status`, `gate`).
  - A loading skeleton (`data-testid="text-used-by-loading"`), an error state (`text-used-by-error`), and an empty state (`text-used-by-empty`).
- Exports `PERMANENT_AVATAR_USED_BY_ANCHOR = "used-by-permanent-avatars"` — used as the card's `id=` so the 409 handlers can `scrollIntoView` to it.

### 1.2 `/admin/3d-rigs/:id`

`client/src/pages/admin/3d-rigs/RigDetail.tsx`:

1. Renders `<UsedByPermanentAvatarsCard filter={{ kind: "rig", id: data.rig.id }} />` between the main rig card and the audit log.
2. `archive()` now detects HTTP 409 and surfaces a dedicated alert telling the operator to scroll to the "Used by permanent avatars" card and rebind / archive each listed avatar first. Calls `scrollToUsedByCard()` to deep-link the card.
3. `permanentlyDelete()` does the same on HTTP 409, but surfaces the message inline via `setDeleteErr(...)` (matching the page's existing inline error UX) and also calls `scrollToUsedByCard()`.

### 1.3 `/admin/3d-assets/:id`

`client/src/pages/admin/3d-assets/AssetDetail.tsx`:

1. Renders `<UsedByPermanentAvatarsCard filter={{ kind: "bodyAsset", id: data.asset.id }} />` between the main asset card and the audit log.
2. `archive()` + `permanentlyDelete()` get the same 409 handling pattern as the rig detail page, with copy that mentions the asset is bound as the avatar's **body**.

### 1.4 Dashboard card

The AdminDashboard "3D / 4D / Unreal" zone already carries the R7B-UI-Library card (Task #890, line 315 of `client/src/pages/admin/AdminDashboard.tsx`):

```ts
{ label: "Permanent Avatars", href: "/admin/permanent-avatars", status: "admin",
  icon: Layers,
  description: "Admin-only library of permanent avatars. Each avatar binds one
                approved body asset and one approved rig with identity /
                persona / default-room metadata. No public URLs, no provider
                calls, no render or publish.",
  tooltip: "R7B permanent-avatar library. Admin-only. Pair-validity gate,
            identity + safety review, ephemeral signed preview bundle
            (≤15 min, never persisted). No approved_public state; …" }
```

The card description **already** contains the binding-layer context the task §4 asks for ("binds one approved body asset and one approved rig"). The dashboard does not have a separate "caption" slot beneath link tiles — extra copy beyond the existing description / tooltip would either bloat every other tile in the zone or require a new field on `AdminLink`. Both are out of scope for this task. **Decision: no dashboard change in R7B-Cross-Links.** The card is verified present in the correct zone and already discoverable.

---

## 2. UX flow for HTTP 409

| Trigger | Surface | Deep-link |
|---|---|---|
| Archive a rig that any permanent avatar binds → server returns HTTP 409 (`rig_referenced_by_permanent_avatar` per R7B-Routes) | `alert()` with explicit copy explaining the block | `scrollIntoView` on the "Used by permanent avatars" card on the same page |
| Permanent-delete a rig with the same condition | Inline `text-delete-error` red text under the action row | Same scroll target |
| Archive an asset that any permanent avatar binds as its body | `alert()` | Same scroll target on the asset detail page |
| Permanent-delete the same asset | Inline `text-delete-error` | Same scroll target |

The card row for each avatar is itself a deep link to `/admin/permanent-avatars/:id`, which is where the operator can rebind to a different body / rig or archive the avatar to clear the block.

---

## 3. API surface consumed

A single endpoint:

```
GET /api/admin/permanent-avatars?bodyAssetId=<uuid>&limit=50&offset=0
GET /api/admin/permanent-avatars?rigId=<uuid>&limit=50&offset=0
```

Both filters are declared on the route's `listQuerySchema` (see `server/routes/admin/permanent-avatars.ts` lines 160-161 + 248-271). No new server route was added by this task. No backend / schema / migration change.

---

## 4. Guardrails

| Guardrail | Status |
|---|---|
| No new server route | ✅ — read-only consumer of the existing R7B-Routes list endpoint |
| No new schema / migration | ✅ |
| No provider call | ✅ — the card only calls `/api/admin/permanent-avatars` |
| No signed-URL persistence | ✅ — no signed URLs are involved on these pages from this task |
| No `publicUrl` ever | ✅ — no `publicUrl` field is read or written |
| No R3F preview-source extension | ✅ — handled by Task #891 R7B-UI-Preview-Extension |
| No admin pages for permanent avatars added/changed | ✅ — handled by Task #890 R7B-UI-Library |
| Dashboard tile not duplicated | ✅ — verified, only one card per zone |

`git --no-optional-locks diff --stat` for this task is bounded to:

- `client/src/components/admin/UsedByPermanentAvatarsCard.tsx` (new — single component)
- `client/src/pages/admin/3d-rigs/RigDetail.tsx` (import + 409 handling + card render)
- `client/src/pages/admin/3d-assets/AssetDetail.tsx` (import + 409 handling + card render)
- `docs/reports/R7B_CROSS_LINKS_REPORT.md` (this file)
- `docs/library/INDEX.md` (one row added to §E)

---

## 5. Test surface (data-testid map)

| Surface | testid | Purpose |
|---|---|---|
| Card root | `card-used-by-permanent-avatars` | Container |
| Count badge | `badge-used-by-count` | Total avatars binding this asset/rig |
| Loading | `text-used-by-loading` | While react-query is fetching |
| Error | `text-used-by-error` | API error |
| Empty | `text-used-by-empty` | No avatars bind this subject |
| List | `list-used-by` | `<ul>` |
| Row | `row-used-by-${avatarId}` | Per-avatar row |
| Deep link | `link-used-by-${avatarId}` | `/admin/permanent-avatars/:id` |
| Lifecycle pill | `pill-used-by-lifecycle-${avatarId}` | |
| Status pill | `pill-used-by-status-${avatarId}` | |
| Gate pill | `pill-used-by-gate-${avatarId}` | |

---

## 6. What is intentionally NOT in this task

- No admin pages for permanent avatars (R7B-UI-Library / Task #890).
- No R3F preview-source extension (R7B-UI-Preview-Extension / Task #891).
- No new server route (R7B-Routes / Task #889).
- No schema, migration, or storage change (R7B-Schema).
- No back-reference column on `production_assets` / `production_rigs` (rejected by design — the FK direction stays parent → child).
- No render / publish / live / Unreal / 4D hardware behavior.

---

## 7. Companion documents

- [`docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md`](../design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md) §8.3 + §8.4 (design)
- [`docs/reports/R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md`](R7B_PERMANENT_AVATAR_SCHEMA_REPORT.md) (schema)
- [`docs/reports/R7B_ROUTES_REPORT.md`](R7B_ROUTES_REPORT.md) (route surface this card consumes)
- [`docs/reports/R7B_UI_LIBRARY_REPORT.md`](R7B_UI_LIBRARY_REPORT.md) (avatar admin pages + dashboard card placement)
- [`docs/reports/R7B_UI_PREVIEW_EXTENSION_REPORT.md`](R7B_UI_PREVIEW_EXTENSION_REPORT.md) (sibling UI extension)
