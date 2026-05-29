# Real Unreal Set-Lighting Dry-Run — Implementation Report

## Files changed
- `shared/production-house.ts` — appended `ALLOWED_SET_LIGHTING_PRESETS`, `SetLightingPresetSchema`, `RealUnrealSetLightingStatusSchema`, `RealUnrealSetLightingRecordSchema` and exported types. **`shared/schema.ts` was not modified.**
- `server/services/production-house-storage.ts` — added `realUnrealSetLightingDryRunHistory` to `CollectionName`, `PersistedState`, `MemoryStorage.loadAll` and `FileStorage.loadAll`.
- `server/services/production-house-service.ts` — added store field, `loadFromStorage` rehydration, `_resetForTests` reset, `persistRealUnrealSetLightingDryRunHistory`, and full `sendRealUnrealSetLightingDryRun` / `getRealUnrealSetLightingDryRunStatus` / `listRealUnrealSetLightingDryRunHistory` / `buildSanitizedSetLightingPayload` / `persistSetLightingRecord`.
- `server/routes/production-house-routes.ts` — 3 new root-admin routes; export/full now includes `realUnrealSetLightingDryRunHistory`.
- `client/src/pages/admin/ProductionHouse.tsx` — added `RealUnrealSetLightingDryRunPanel` mounted after `RealUnrealSetCameraDryRunPanel` inside the `real-unreal-dry-run` section.
- `tests/production-house.test.ts` — appended 25-test `describe` block.
- `docs/reports/CODEX_REAL_UNREAL_SET_LIGHTING_DRY_RUN_REPORT.md` — this report.

## Routes added (all `requireRootAdmin`)
- `GET  /api/admin/production-house/real-unreal/set-lighting/status`
- `POST /api/admin/production-house/real-unreal/set-lighting/send`
- `GET  /api/admin/production-house/real-unreal/set-lighting/history`

Mutating route (`/send`) uses the same admin-session gate the rest of the Production House mutating routes use; behavior parity with the existing set-camera/prepare-scene mutating routes (no separate CSRF middleware was added in this slice — preserved current platform behavior; see "remaining work" below).

## Preset list
`newsroom_bright`, `newsroom_breaking_red`, `podcast_warm`, `debate_neutral`, `interview_soft`, `market_watch_blue`, `emergency_alert`, `cinematic_low_key`, `avatar_spotlight`, `standby_dim`

## Gating behavior
The send route refuses unless **all** of:
1. Caller is root-admin.
2. `confirm:true` in body.
3. `lightingPreset` ∈ allowed presets.
4. `productionId` resolves to a known production.
5. Bridge config valid: base url + token present, `UNREAL_BRIDGE_MODE=dry_run`, base url is a valid http(s) URL.
6. Approval stage for production = `unreal_sandbox_approved`.
7. Local package validation passes.
8. **Latest** `realUnrealPrepareSceneDryRunHistory` record for production has `status === "passed"`.
9. **Latest** `realUnrealSetCameraDryRunHistory` record for production has `status === "passed"` (chained gate consistent with existing flow).

Any failure persists a `rejected`/`failed` record and emits the corresponding audit event.

## Bridge-token redaction
- The Authorization header value is built from `process.env.UNREAL_BRIDGE_TOKEN` and never copied into the persisted record or response.
- Response body text is scrubbed (`text.split(token).join("[redacted]")`) before sanitization.
- Sanitizer (`sanitizeHealthCheckResponse`) further redacts any key resembling `auth/token/authorization/cookie/set-cookie/...`.
- Test asserts that a token value echoed back by a fake bridge does not appear in the stored record.

## Safety envelope behavior
- `SAFETY_ENVELOPE` is **not** mutated by this flow.
- The sanitized payload sent over the wire carries `safetyEnvelope: SAFETY_ENVELOPE` plus explicit `realSendAllowed: false`, `dryRun: true`, and every dangerous-intent flag (`levelLoadRequested`, `renderRequested`, `sequencerStartRequested`, `mrqRequested`, `assetImportRequested`, `avatarAttachRequested`, `videoAttachRequested`, `fourDRequested`, `publishRequested`) hard-coded `false`.
- Post-flow test re-verifies `SAFETY_ENVELOPE` flags and schema validity.

## Audit events emitted
`real_unreal.set_lighting.status_viewed`, `real_unreal.set_lighting.history_viewed`, `real_unreal.set_lighting.attempted`, `real_unreal.set_lighting.passed`, `real_unreal.set_lighting.failed`, `real_unreal.set_lighting.rejected`.

## Tests added (25)
status payload shape · status root-admin gate · send root-admin gate · history root-admin gate · unknown productionId 404 · confirm-required · invalid lighting preset · all allowed presets parse · missing bridge config · mode ≠ dry_run · invalid base url · stage ≠ unreal_sandbox_approved · prepare-scene not passed · set-camera not passed (chained gate) · local validation failed · happy-path sanitized payload (asserts no forbidden keys, all dangerous-intent flags false, both upstream gates reflected) · bridge-token redaction · non-2xx → failed + httpStatus · timeout → failed + `timeout` errorCode · history scoping · export/full mapping · audit events via route · failed audit constant present in route source · no UnrealCommand mutation + send flags remain false · SAFETY_ENVELOPE invariant after flow.

## No real Unreal send — confirmation
- The only network call is a POST to `{UNREAL_BRIDGE_BASE_URL}/set-lighting/dry-run` carrying a sanitized summary explicitly flagged dry-run.
- `realSendAllowed` is locked `false` everywhere (route response, persisted record, sent payload).
- No level load, render, MRQ, asset import, avatar/media attach, Sequencer start, 4D, or publish command is invoked by this code path.
- `svc.listUnrealCommands().length` is unchanged before/after the call (test-verified).
- `svc.isRealUnrealSendAllowed()` and `svc.isReal4DSendAllowed()` both remain `false`.

## Rollback notes
Revert these files (and the appended tests / new report) — there are no schema changes, no migrations, no `db:push`, and no other module wiring:
- `shared/production-house.ts`
- `server/services/production-house-storage.ts`
- `server/services/production-house-service.ts`
- `server/routes/production-house-routes.ts`
- `client/src/pages/admin/ProductionHouse.tsx`
- `tests/production-house.test.ts`
- `docs/reports/CODEX_REAL_UNREAL_SET_LIGHTING_DRY_RUN_REPORT.md`

Persisted JSON file `realUnrealSetLightingDryRunHistory` (under the configured production-house storage dir) can be deleted; it is a leaf collection with no foreign references.

## Remaining work before real Unreal sandbox execution
1. Lift `realSendAllowed` only after operator sign-off and a dedicated audit-logged toggle service.
2. Provide a real Unreal sandbox bridge endpoint (`/set-lighting`) honoring the same sanitized schema, and a separate non-dry-run route distinct from the current `/dry-run` path.
3. Add explicit CSRF tokens to mutating production-house routes platform-wide (currently relies on session/admin gating).
4. Decide whether to chain the next stage (e.g. `set_sequencer` or `prepare_render_dry_run`) and reuse this gate pattern.
5. Add observability: per-preset success/latency dashboards once the bridge is online.
