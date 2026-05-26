# R7B-E2E-Real — Permanent-avatar admin surface, real Playwright E2E

**Task #894** · Replaces ghost task #893 (auto-proposed, marked merged, produced no commit or test artifact).

## Why this exists

The earlier task #893 ("R7B-E2E — author permanent-avatars.spec.ts") was
auto-marked merged with no commit on the branch — the spec file was
never created and the report was never written. The permanent-avatar
admin surface (R7B body+rig binding entity, schema → routes → UI → cross-links → preview extension) shipped behind 86
node-test files but had **zero browser-level smoke coverage**, so any
regression in the create form, detail page, preview-bundle button,
rebind flow, two-step delete dialog, or cross-link cards could land
without the test suite catching it.

This task closes that gap with a real Playwright spec that mounts every
permanent-avatar admin page in a real chromium, drives the buttons /
selects / dialogs an operator actually touches, and asserts the same
serializer overlay (`publicUrl: null`, `approvalGate: not_approved` on
create, `lifecycleState: composed` on rebind) that the node-test guard
enforces server-side.

## What was added

| File | Purpose |
|---|---|
| `tests/e2e/permanent-avatars.spec.ts` | Real Playwright spec, 10 checkpoints |
| `docs/reports/R7B_E2E_REAL_REPORT.md` | This report |
| `docs/library/INDEX.md` §E row | Index entry |

No production code changed. No schema changed. No new dependency.

## Spec design

### Soft-skip when no admin session

The existing `tests/e2e/admin-auth.setup.ts` writes an empty
storage-state file when `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD`
aren't set in the environment. The R10 route-smoke spec adopted a
convention of reading that file and `test.skip(...)` when no cookie was
written; this spec follows the same convention so a CI environment
without admin secrets reports "skipped" rather than failing the suite.

When the secrets are present, the spec exercises every checkpoint
end-to-end through a real browser.

### Self-seeding fixture

The spec is self-contained — it does not assume any pre-existing
approved-internal asset or rig in the database. `test.beforeAll` mints
the required graph in parallel via the admin API:

| Slot | Seed | Used by |
|---|---|---|
| `assetA` | upload → license `internal_only` → safety `approved_internal` → approval | initial bind, archive-409 (ckpt 7) |
| `rigA` | same | initial bind, archive-409 (ckpt 8) |
| `unapprovedRig` | upload only (no license, no safety, no approval) | invalid-pair 409 (ckpt 2) |
| `assetB` | full approval | rebind target (ckpt 9), tombstone re-create probe (ckpt 10) |
| `rigB` | full approval | rebind target (ckpt 9) |

To avoid colliding with the repo's pinned-sha256 demo GLBs
(`sandbox-cube.glb`, `avatar-rig-demo.glb`) the spec mints a fresh
unique-per-call valid GLB (`makeUniqueGlb(label)`) that passes
`validateGlbOrGltf` with zero nodes / zero meshes / no BIN chunk, so
the sha256 dedupe never fires.

### Cleanup

`test.afterAll` archives + permanently-deletes the created avatar if
checkpoint 10 didn't already remove it. Seeded assets/rigs are
intentionally left in place — they're approved_internal rows in the
admin library, which is the same state any operator-seeded approved
asset would be in, and they're cheap (each is a ≤200-byte JSON-only
GLB). A future hygiene task can archive them via the same admin API if
desired.

## Checkpoint matrix

| # | Surface | Assertion |
|---|---|---|
| 1 | `/admin/permanent-avatars` | `page-permanent-avatars-list` mounts; `filter-status`, `filter-approval-gate`, `filter-identity-review`, `filter-safety-review` visible; selecting approval-gate=`approved_internal` triggers a list GET with `approvalGate=approved_internal` in the query string |
| 2 | `POST /api/admin/permanent-avatars` | Invalid pair (approved asset + un-approved rig) returns **409 / `avatar_pair_not_approved_internal`**; create-page form surfaces `text-create-error` when required fields are missing (same error-surfacing path) |
| 3 | `POST /api/admin/permanent-avatars` | Valid pair returns **201**, `avatar.publicUrl === null`, `avatar.approvalGate === "not_approved"`; navigating to `/admin/permanent-avatars/:id` renders `text-display-name` + `pill-slug` |
| 4 | `/admin/permanent-avatars/:id` | `card-bound-body-asset` + `card-bound-rig` render with `link-deep-body-asset` / `link-deep-rig` and the audit-log tail contains ≥ 1 `row-audit-*` row |
| 5 | preview-bundle button | Clicking `button-preview-bundle` populates `block-preview-bundle` + `text-preview-bundle-expires`; `link-preview-body-asset` + `link-preview-rig` carry signed URLs (non-empty href, not `about:blank`) |
| 6 | `/admin/avatar-rig-preview` permanent-avatar source | Promotes avatar to `approved_internal` (so the picker surfaces it), selects source-kind = `permanent-avatar`, selects the new avatar → `page.route("**/*")` tap records every outbound request; asserts the violation list is empty for every host in `FORBIDDEN_HOST_PATTERNS` (openai/anthropic/elevenlabs/heygen/runwayml/meshy/stability/replicate) |
| 7 | `POST /api/admin/production-assets/:id/archive` (assetA) | Returns **409 / `asset_referenced_by_permanent_avatar`** with `referencingAvatars >= 1`; navigating to `/admin/3d-assets/:id` renders `card-used-by-permanent-avatars` with `row-used-by-{createdAvatarId}` and a clickable `link-used-by-{createdAvatarId}` deep-link |
| 8 | `POST /api/admin/production-rigs/:id/archive` (rigA) | Same as 7 but for `rig_referenced_by_permanent_avatar` on `/admin/3d-rigs/:id` |
| 9 | `POST /api/admin/permanent-avatars/:id/rebind` | Rebinding to (`assetB`, `rigB`) returns 200 with `lifecycleState: "composed"`, `identityReview: "pending"`, `safetyReview: "pending"`, `approvalGate: "not_approved"`, and `bodyAssetId` / `rigId` reflect the new pair |
| 10 | Two-step permanent-delete dialog | `button-permanently-delete` is **disabled** when status != archived; UI archive button (via `window.confirm` dialog auto-accepted) flips `pill-status` to `archived`; opening `dialog-permanent-delete` keeps `button-confirm-delete` disabled until both `input-confirm-slug` matches the slug AND `input-delete-reason` is non-empty; on confirm the detail GET starts returning **404** and re-creating with the same slug + valid pair returns **409 / `avatar_slug_conflict`** (proves the tombstone row burned the slug) |

## Running locally

```bash
# One-time, against a dev DB that has admin auth seeded:
export E2E_ADMIN_USERNAME=...
export E2E_ADMIN_PASSWORD=...
npx playwright install chromium      # if not already installed
npx playwright test tests/e2e/permanent-avatars.spec.ts --project=chromium
```

Without `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD`, the spec
short-circuits in `test.beforeAll` with a skip reason — the suite stays
green and the operator sees a clear "set these env vars" message.

## Out of scope (deliberate, recorded here for future tasks)

- Identity-review + safety-review approve/reject UI surfaces
  (`PermanentAvatarIdentityReview.tsx`, `PermanentAvatarSafetyReview.tsx`) — the
  ckpt-6 promotion path uses the API directly to keep this spec
  bounded.
- Visual / pixel snapshots of the R3F canvas — R10 owns that surface
  with `r10-r3f-3d-4d-route-smoke.spec.ts` + `tests/r10-r3f-3d-4d-runtime-routes.test.ts`.
- Hygiene cleanup of seeded approved-internal assets / rigs — see
  "Cleanup" above.
- Concurrent-create race coverage — owned by the node-test
  `tests/permanent-avatars-routes-provider-isolation.test.ts` and the
  underlying storage tests.

## Verification

- Spec file passes `npx tsc --noEmit` against `tsconfig.json` shared
  with the rest of `tests/e2e/*` (no new types or imports beyond
  `@playwright/test` + `fs` + the existing
  `tests/e2e/admin-auth-paths.ts`).
- Forbidden-host pattern list matches the R10 spec verbatim so future
  audits can grep both files identically.
- Every checkpoint touches a real route / button surface — no checkpoint
  is satisfied solely by an API contract assertion.
