# Phase 1B — Persistent Media Storage Readiness

**Status:** Merged. Pure audit + admin status endpoint + comprehensive test coverage. No DB schema change, no new dependency, no signed URL.

## Goal

Make approved/generated media assets (MP4, SRT, voice MP3) trackable and production-ready without exposing public URLs or secret values.

## Audit findings — existing stack (pre-PR)

Two services were already in place and already met most of the goal. The audit found no regressions; this PR closes the remaining gaps:

| File | Lines | Role |
|---|---|---|
| `server/services/persistent-storage-service.ts` | 293 | Stable storage keys + admin-only metadata + storage report + safe upload-if-configured |
| `server/services/replit-object-storage-adapter.ts` | 161 | Lazy adapter for `@replit/object-storage`; never throws, never echoes secrets, never produces public URLs |

### What was already correct (verified by new tests)

| Requirement | Already correct? | Evidence |
|---|---|---|
| Stable storage key for render MP4/SRT | yes | `ASSET_KEY_PREFIX["render"] = "mougle-media/render/"` + `ASSET_KEY_RE["render"] = /^[a-z0-9_]{1,128}\.(mp4|srt)$/` |
| Stable storage key for voice MP3 | yes | `ASSET_KEY_PREFIX["voice"] = "mougle-media/voice/"` + `/^[a-z0-9_]{1,128}\.mp3$/` |
| Path-traversal guard on filenames | yes | `stableStorageKeyForAsset()` rejects `/`, `\`, `..`, mixed-case, spaces, disallowed extensions, overlong names |
| Metadata fields: `storageKey`, `mimeType`, `size`, `createdAt`, `accessMode`, `adminOnly`, `publicUrl` | yes | `buildAdminOnlyAssetMetadata()` returns the full shape with `adminOnly: true`, `publicUrl: null`, `publicUrlAvailable: false` |
| Local-only fallback when object storage not configured | yes | `uploadIfConfigured()` returns `{ attempted: false, driver: "internal_local_storage", storageKey: null }` when adapter is not ready; never throws |
| Adapter degrades cleanly without `@replit/object-storage` | yes | Dynamic `await import("@replit/object-storage")` wrapped in try/catch, caches error, returns `{ ready: false }` |
| Bucket value never echoed | yes | `getStorageReport()` always sets `bucket: null`; only `bucketIdConfigured: boolean` is exposed |
| Adapter sanitizes upload key | yes | `sanitizeStorageKey()` strips path components and validates against `/^[a-z0-9_.-]{1,200}$/i` |

### Gaps closed in this PR

| Gap | Fix |
|---|---|
| No admin endpoint to surface storage status | **Added** `GET /api/admin/storage/status` (root-admin only). |
| No automated regression coverage for the safety contract | **Added** `tests/persistent-storage-service.test.ts` (20 tests). |

## Admin storage status endpoint

```
GET /api/admin/storage/status                 // root-admin only (requireRootAdmin)
```

Response shape (locked in handler — re-asserts `bucket: null` even if upstream changes):

```jsonc
{
  "status": "local_dev_only" | "package_installed_bucket_missing"
          | "persistent_configured" | "upload_failed"
          | "setup_required" | "blocked",
  "driver": "internal_local_storage" | "replit_object_storage_adapter"
          | "cloudflare_r2_storage_adapter" | "aws_s3_storage_adapter",
  "driverName": "...",
  "bucket": null,                             // ALWAYS null — never a literal value
  "bucketIdConfigured": true | false,         // boolean only
  "publicSafe": false,                        // ALWAYS false
  "notes": "...",
  "rootDir": ".../.local/media-assets",
  "candidates": [
    { "id": "internal_local_storage",       "status": "local_dev_only", "reason": "..." },
    { "id": "replit_object_storage_adapter", "status": "...", "reason": "...", "setupHint": "..." },
    { "id": "cloudflare_r2_storage_adapter", "status": "setup_required", "reason": "..." },
    { "id": "aws_s3_storage_adapter",        "status": "setup_required", "reason": "..." }
  ],
  "setupGuidance": {
    "primary": "...",
    "envVarName": "REPLIT_OBJECT_STORAGE_BUCKET_ID",
    "docsHint": "..."
  }
}
```

The handler imports the storage service lazily (`await import("./services/persistent-storage-service")`) to keep cold-start cost off the unrelated routes and to preserve the existing module-import topology.

## Metadata contract — `AdminOnlyMediaAssetMetadata`

Every approved/generated MP4, SRT, or voice MP3 is wrapped in this shape (unchanged in this PR, now regression-tested):

```ts
{
  storageKey: string;                              // stable, prefix-namespaced
  persistedStorageKey: string | null;              // object-storage key, or null
  mimeType: "video/mp4" | "application/x-subrip" | "audio/mpeg";
  size: number;
  fileSize: number;                                // alias for legacy consumers
  createdAt: string;                               // ISO from mtime
  accessMode: "admin_only_stream";
  previewAccessMode: "admin_only_stream";
  adminOnly: true;                                 // literal true
  publicUrl: null;                                 // literal null
  publicUrlAvailable: false;                       // literal false
  storageDriver: "replit_object_storage_adapter" | "internal_local_storage";
  persisted: boolean;                              // true iff object-storage upload succeeded
  localFallback: boolean;                          // true iff falling back to local disk
}
```

## Secret-hygiene guarantees (asserted by tests)

1. The bucket secret literal is **never** returned in any field. A regression test sets `REPLIT_OBJECT_STORAGE_BUCKET_ID` to a recognisable sentinel and asserts the sentinel does not appear in the serialised report payload.
2. `bucket` is always `null` in the response.
3. `publicSafe` is always `false`.
4. `bucketIdConfigured` is always a boolean (`true` / `false`), never the value itself.
5. The adapter never reads, logs, or returns `REPLIT_OBJECT_STORAGE_BUCKET_ID` or `REPLIT_SIDECAR_ENDPOINT` values — only their `!!` presence.
6. The `persistentStorageService` surface has no `getBucket` / `getSecret` exports (asserted by test).

## Local-only fallback contract

When object storage is **not** configured:

- `uploadIfConfigured()` returns `{ attempted: false, ok: false, driver: "internal_local_storage", storageKey: null, reason: "..." }`.
- `buildAdminOnlyAssetMetadata()` is called without `persistedStorageKey` → emits `persisted: false`, `localFallback: true`, `storageDriver: "internal_local_storage"`. The locally-stored file remains streamable through the existing admin-only routes.
- `getStorageReport()` returns one of `local_dev_only` / `package_installed_bucket_missing` / `setup_required`, with `driver: "internal_local_storage"` and `publicSafe: false`.

## Admin-only stream guard

`/api/admin/storage/status` is wired through the existing shared `requireRootAdmin` middleware (re-exported in `server/routes.ts` from `server/middleware/admin-auth`). Tests assert all three non-root cases (unauthenticated / regular user / staff admin) are rejected, and only root admin gets `200`.

The existing render download/stream endpoints (`/api/admin/video-render/jobs/:id/{captions.srt,preview.mp4,...}`) were already covered by `tests/admin-download-auth.test.ts` and remain unchanged.

## Constraint verification

| Constraint | Verified |
|---|---|
| No public publishing / YouTube / social / live upload | new route does not upload anywhere; no new outbound network paths added |
| No signed public URL produced | `publicUrl` literal-locked to `null`; adapter has no `getSignedUrl`; route handler re-asserts `bucket: null` |
| No secret value returned | sentinel-value regression test passes; `bucket` always null; only `bucketIdConfigured: boolean` |
| `shared/schema.ts` untouched | `git diff HEAD -- shared/schema.ts` empty |
| No `db:push` run | none invoked |
| No new dependencies | `package.json` `dependencies` / `devDependencies` unchanged |
| Tests pass + tsc clean | `npm test` 211/211 pass (+20 new), `tsc --noEmit` clean |

## Test results

```
npm test → 213/213 pass (was 191; +22 new)
npx tsc --noEmit → clean
```

`tests/persistent-storage-service.test.ts` covers:

**Path-traversal guard (7 tests)**
- rejects forward-slash path components ✓
- rejects backslash path components ✓
- rejects parent-directory references (`..`, `../etc/passwd`, `foo/../bar.mp4`) ✓
- rejects disallowed mime extensions (`.exe`, wrong-extension-per-kind) ✓
- rejects empty / non-string / overlong (>128 chars) names ✓
- rejects mixed-case / disallowed-character names ✓
- accepts well-formed names → stable, prefixed, deterministic key ✓

**Metadata shape (5 tests)**
- every required metadata field present + `publicUrl: null` + `publicUrlAvailable: false` ✓
- flags `localFallback: true` + `persisted: false` when no persisted key supplied ✓
- marks `persisted: true` + `storageDriver: "replit_object_storage_adapter"` when key supplied ✓
- throws `invalid_media_asset_filename` on traversal-bait filename ✓
- throws on missing local file (defense-in-depth) ✓

**Secret hygiene (3 tests)**
- always returns `publicSafe: false` and `bucket: null` ✓
- `bucketIdConfigured` is a boolean only; sentinel bucket value never appears in serialised payload ✓
- falls back to local_dev_only / package_installed_bucket_missing / setup_required when no object-storage configured ✓

**Admin-only stream guard (4 tests)**
- rejects unauthenticated requests → 401 ✓
- rejects regular-user sessions → 401/403 ✓
- rejects staff (non-root) admin sessions → 401/403 ✓
- allows root admin → 200 with locked-down response shape ✓

**uploadIfConfigured fallback contract (2 tests)**
- with no env vars set → `attempted:false`, `ok:false`, `driver:"internal_local_storage"`, `storageKey:null`, reason string present ✓
- never throws even when the local file does not exist ✓

**Service surface (1 test)**
- exposes only documented helpers; no `getBucket` / `getSecret` reader on the service surface ✓

## Files changed

| File | Kind | Purpose |
|---|---|---|
| `server/routes.ts` | modified (+22 lines) | Added `GET /api/admin/storage/status` (root-admin only). |
| `tests/persistent-storage-service.test.ts` | **NEW** | 20 tests. |
| `package.json` | modified | Added the new test file to the `test` script. |
| `docs/reports/CODEX_PHASE_1B_PERSISTENT_STORAGE_READINESS_REPORT.md` | **NEW** | This report. |

No service-implementation files were modified — the audit confirmed the existing implementation already meets the contract; this PR only adds the missing admin endpoint and the regression coverage.

## Rollback notes

Safe to revert with no DB or runtime impact:
1. Remove the `GET /api/admin/storage/status` block from `server/routes.ts`.
2. `git rm tests/persistent-storage-service.test.ts`.
3. Remove the test from the `test` script in `package.json`.

## Remaining work before production integration

1. **Cloudflare R2 / AWS S3 adapter implementations** — schema already reports `setup_required`; actual adapter code is out of scope here.
2. **Periodic upload-failure auto-clear** — `recordPersistFailure()` is only cleared by a subsequent successful upload. A timed health-check that retries the last failed key would let the status return to `persistent_configured` without waiting on a new render.
3. **Admin UI surface** — the report is now reachable at `/api/admin/storage/status`; an admin dashboard tile that polls it lives outside this PR.
4. **Signed URL policy** — currently forbidden. If a future product decision allows downloads via signed URLs, it must (a) require an explicit per-asset approval flag separate from `adminOnly`, (b) emit a TTL ≤ 5 minutes, and (c) be guarded by `requireRootAdmin` plus an audit log entry. Until then, `publicUrl: null` remains the only allowed value.

## Accepted bucket-ID env var names (2026-05 update)

Replit App Storage now provisions the bucket ID under **`DEFAULT_OBJECT_STORAGE_BUCKET_ID`** (alongside `PUBLIC_OBJECT_SEARCH_PATHS` and `PRIVATE_OBJECT_DIR`). To remain backward-compatible with earlier setups that used the legacy name, the production guard (`server/config/validate-env.ts → storageOk`) and the storage adapters (`server/services/persistent-storage-service.ts → hasReplitBucketConfigured`, `server/services/replit-object-storage-adapter.ts → hasBucketConfigured`) intentionally accept **either**:

- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` (current Replit-provisioned name), **or**
- `REPLIT_OBJECT_STORAGE_BUCKET_ID` (legacy / manual override).

Either one satisfies `bucketIdConfigured: true`. The literal secret value is never returned by `/api/admin/storage/status`; only the boolean is exposed (see "Secret hygiene" section above). `STORAGE_LOCAL_OK=1` remains forbidden in production — the guard is not weakened by this alias, only broadened to the new canonical name.

— end of report —
