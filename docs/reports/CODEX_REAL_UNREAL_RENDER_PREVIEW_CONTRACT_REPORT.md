# Codex Report — Real Unreal Render-Preview Contract Dry-Run (Contract Only)

## Summary
Adds a new, narrowly scoped surface to Production House that lets root-admin
verify a sanitized **render-preview contract** with the configured Unreal
bridge before any actual preview render is ever requested.

The feature:
- Sends ONLY a sanitized JSON contract summary to a fixed bridge endpoint:
  `POST {UNREAL_BRIDGE_BASE_URL}/render-preview/contract/dry-run`.
- Does NOT trigger Movie Render Queue, render frames, load levels, import
  assets, start Sequencer, attach avatars/media, send 4D commands, generate
  public output URLs, publish, share to social, or live-stream.
- `realSendAllowed: false` is locked in code, in the status endpoint, in the
  outgoing payload, and in every stored record.
- Mirrors the prepare-scene / set-camera / set-lighting / set-panels dry-run
  pattern and adds a separate **pure local validation** step that never opens
  any network socket.
- All four routes are root-admin only and audit-logged.

## Touched files
- `shared/production-house.ts` — appended-only:
  `REAL_UNREAL_RENDER_PREVIEW_CONTRACT_STATUSES`,
  `RealUnrealRenderPreviewContractRequestSchema`,
  `RealUnrealRenderPreviewContractRecordSchema`. **No Drizzle schema changes.**
- `server/services/production-house-storage.ts` — added
  `realUnrealRenderPreviewContractHistory` collection to `CollectionName`,
  `PersistedState`, and both `MemoryStorage.loadAll` /
  `FileStorage.loadAll`. Memory adapter remains a no-op writer.
- `server/services/production-house-service.ts` — imports the new record
  type, extends the in-memory store + initialization + `loadFromStorage` +
  `_resetForTests`, adds `persistRealUnrealRenderPreviewContractHistory`,
  and the new exports:
  - `getRealUnrealRenderPreviewContractStatus`
  - `validateRenderPreviewContractLocal` (local-only, no network)
  - `sendRealUnrealRenderPreviewContractDryRun` (network dry-run)
  - `listRealUnrealRenderPreviewContractHistory`
- `server/routes/production-house-routes.ts` — registers four root-admin
  routes and adds the per-production history block to `/export/full`:
  - `GET    /api/admin/production-house/real-unreal/render-preview-contract/status`
  - `POST   /api/admin/production-house/real-unreal/render-preview-contract/:productionId/validate-local`
  - `POST   /api/admin/production-house/real-unreal/render-preview-contract/:productionId/send-dry-run`
  - `GET    /api/admin/production-house/real-unreal/render-preview-contract/history`
- `client/src/pages/admin/ProductionHouse.tsx` — adds
  `RealUnrealRenderPreviewContractPanel` mounted after the existing
  set-panels panel. Uses plain `fetch` (no React Query).
- `tests/production-house.test.ts` — appended ~25 regression tests covering
  status, role-gating, 404 handling, confirm required, mode/URL/config
  gating, chained-gate failures (prepare/camera/lighting/panels), local
  validation failure, panelsUsed branching, payload sanitization, token
  redaction, HTTP error/timeout, history scoping, export/full mapping.

## Safety envelope
- `realSendAllowed: false` (hard-coded, returned in status, written into
  the outgoing payload, written into every stored record).
- `dryRunOnly: true`, `renderRequested: false`,
  `movieRenderQueueRequested: false`, `sequencerStartRequested: false`,
  `levelLoadRequested: false`, `assetImportRequested: false`,
  `mediaAttachRequested: false`, `avatarAttachRequested: false`,
  `fourDRequested: false`, `outputPublicUrlRequested: false`,
  `publishRequested: false`, `socialPublishRequested: false`,
  `liveStreamingRequested: false`.
- Payload allowlist is fixed: only boolean / approval-stage / panels-used
  metadata is sent. No URLs, media references, asset paths, or signed URLs
  are forwarded.
- Bridge token is read from `process.env.UNREAL_BRIDGE_TOKEN`, sent only as
  an `Authorization: Bearer` header, and explicitly scrubbed from the
  response text before being stored (`text.split(token).join("[redacted]")`).
- Response body is additionally passed through
  `sanitizeHealthCheckResponse` to truncate / scrub.
- 5 s `AbortController` timeout; timeouts are recorded as `failed` with
  `errorCodes: ["timeout"]`.
- Local-only path (`validateRenderPreviewContractLocal`) never instantiates
  `fetch` and proves so via a dedicated test that swaps `globalThis.fetch`
  with a throwing stub.

## Chained gate
The bridge dry-run requires ALL of:
1. `getApprovalStage(productionId) === "unreal_sandbox_approved"`.
2. Latest `prepare-scene` dry-run record for this production has
   `status === "passed"`.
3. Latest `set-camera` dry-run record for this production has
   `status === "passed"`.
4. Latest `set-lighting` dry-run record for this production has
   `status === "passed"`.
5. **Conditional:** when the caller passes `panelsUsed: true`, the latest
   `set-panels` dry-run record for this production must have
   `status === "passed"`. When `panelsUsed` is omitted or false, the
   set-panels gate is skipped — set-panels remains optional infrastructure.

## Audit events
- `real_unreal.render_preview_contract.status_viewed`
- `real_unreal.render_preview_contract.local_validation_attempted`
- `real_unreal.render_preview_contract.local_validation_passed`
- `real_unreal.render_preview_contract.local_validation_failed`
- `real_unreal.render_preview_contract.network_attempted`
- `real_unreal.render_preview_contract.network_passed`
- `real_unreal.render_preview_contract.network_failed`
- `real_unreal.render_preview_contract.network_rejected`
- `real_unreal.render_preview_contract.history_viewed`

## Tests added (~25)
Status / role-gating (5), 404 handling for both endpoints (2),
confirm/config/mode/URL guards (4), chained gate prepare/camera/lighting (3),
panels conditional gate (2), local validation failure (1), local-only no-net
guarantee (1), sanitization + allowlist (1), token redaction (1),
HTTP non-2xx + timeout (2), history scoping + export/full mapping (3).

## Verification
- `npm run check` passes on the modified TypeScript modules.
- No `shared/schema.ts` changes; no `db:push`; no migrations.
- All routes are gated by `requireRootAdmin`. Memory and file storage
  adapters both expose the new collection.
