# Real Unreal Set-Panels Dry-Run Network Call — Implementation Report

## Scope
Adds the "set-panels" dry-run leg to the Real Unreal pipeline, mirroring
prepare-scene, set-camera, and set-lighting. Sends ONLY a sanitized
`set_panels` summary to `{UNREAL_BRIDGE_BASE_URL}/set-panels/dry-run`.
No public URLs, no external media fetch, no level load, render, MRQ,
asset import, avatar/media attach, Sequencer, 4D, publish, social, or
live streaming. `realSendAllowed` remains `false` everywhere.

## Files Changed
- `shared/production-house.ts` — new presets/limits/types
- `server/services/production-house-storage.ts` — new collection
- `server/services/production-house-service.ts` — service + sanitizer
- `server/routes/production-house-routes.ts` — 3 root-admin routes + export/full mapping
- `client/src/pages/admin/ProductionHouse.tsx` — `RealUnrealSetPanelsDryRunPanel`
- `tests/production-house.test.ts` — new regression block
- `docs/reports/CODEX_REAL_UNREAL_SET_PANELS_DRY_RUN_REPORT.md` (this file)

## Routes Added (root-admin only, CSRF-protected via global middleware)
- `GET  /api/admin/production-house/real-unreal/set-panels/status`
- `POST /api/admin/production-house/real-unreal/set-panels/send`
- `GET  /api/admin/production-house/real-unreal/set-panels/history`

## Allowed Panel Presets (10)
`newsroom_main_wall`, `newsroom_breaking_news`, `newsroom_source_confidence`,
`podcast_topic_cards`, `debate_split_screen`, `interview_guest_profile`,
`market_watch_dashboard`, `weather_map`, `emergency_alert_board`,
`standby_brand_loop`.

## Payload Fields
`panelPreset`, `headline`, `subtitle`, `tickerItems[]`,
`sourcePanel{sourceLabel, citationCount}`, `confidenceLabel`,
`mapPanel{regionLabel, coordsLabel}`,
`timelinePanel{items[{label, timestamp}]}`,
`marketOrDataPanel{rows[{label, value}]}`, `mediaRefs[]`.

The sanitized outbound payload also includes hard-locked flags:
`internalOnly=true`, `visibility="admin_only_internal"`,
`publicUrlsPresent=false`, `signedUrlsPresent=false`,
`externalMediaFetchRequested=false`, `youtubePublishRequested=false`,
`socialPublishRequested=false`, `liveStreamingRequested=false`,
`renderRequested=false`, `levelLoadRequested=false`,
`sequencerStartRequested=false`, `assetImportRequested=false`,
`mrqRequested=false`, `avatarAttachRequested=false`,
`videoAttachRequested=false`, `fourDRequested=false`,
`publishRequested=false`.

## Gating (Chained)
1. Production must exist.
2. `confirm:true` required.
3. `panelPreset` must be an allowed preset.
4. Bridge config valid; mode = `dry_run`; valid http(s) base URL.
5. Approval stage = `unreal_sandbox_approved`.
6. Latest prepare-scene dry-run record `status==passed`.
7. Latest set-camera dry-run record `status==passed`.
8. Latest set-lighting dry-run record `status==passed`.
9. Local validation passes.

## Text & Media Sanitization
- Strings stripped of control chars and truncated per `SET_PANELS_LIMITS`
  (headline ≤ 200, subtitle ≤ 300, ticker ≤ 10 × 200 chars,
  timeline ≤ 20 × 200 chars, data rows ≤ 30 × 80/80 chars,
  media refs ≤ 20 × 200 chars, etc.).
- Any string starting with `http://`, `https://`, `//`, or `data:` is
  treated as a public URL and **dropped** from `tickerItems`, `mediaRefs`,
  `timelinePanel.items[].label`, and `marketOrDataPanel.rows[].label|value`.
- `sourcePanel.sourceLabel` containing a public URL is replaced with
  `{sourceUrlPresent:false}` (no URL ever forwarded).
- Per-call `sanitizationStats` (publicUrlsStripped, textsTruncated, etc.)
  are persisted on every record.

## Bridge-Token Redaction
- Token used only in `Authorization` header; never persisted in the
  record or returned in the JSON response.
- Bridge response text is scrubbed of any literal token occurrence
  before sanitization/storage.

## SAFETY_ENVELOPE
Untouched: `realUnrealCommands=false`, `real4DCommands=false`,
`publicUrlGeneration=false`, `signedUrlGeneration=false`. The schema
parse is asserted in tests.

## Audit Events
`real_unreal.set_panels.status_viewed`, `.history_viewed`, `.attempted`,
`.passed`, `.failed`, `.rejected`.

## Tests Added
- presets list validates + invalid preset rejected + all-presets parse
- status/send/history routes root-admin only
- unknown productionId 404 + confirm-required + invalid preset
- bridge config missing, mode!=dry_run, invalid base URL
- approval-stage gate, prepare-scene gate, set-camera gate,
  set-lighting gate (chained)
- local-validation gate
- happy-path sanitized payload + deep forbidden-key scan
- long-text truncation + public-URL stripping for ticker/media/source
- bridge token redacted from stored record
- non-2xx HTTP recorded as failed; AbortError recorded as failed
- history scoping per productionId
- export/full mapping includes `realUnrealSetPanelsDryRunHistory`
- audit-event lifecycle assertions
- `passed`/`failed` audit constants present in route source
- no `UnrealCommand` mutation; `isRealUnrealSendAllowed()==false`;
  `isReal4DSendAllowed()==false`
- SAFETY_ENVELOPE invariants unchanged

## No Real Unreal Send — Confirmation
The route never calls any production Unreal endpoint other than
`/set-panels/dry-run`. No `UnrealCommand` row is created. No 4D timeline
or cue is sent. No render, MRQ, asset import, avatar/media attach,
Sequencer, publish, social, or live-streaming path is reachable.

## Rollback Notes
- Revert the diff in the listed files. No DB migration was added, so no
  data rollback is required.
- `shared/schema.ts` was NOT modified. No `db:push` was executed.
- The persisted JSON collection `realUnrealSetPanelsDryRunHistory` is
  created lazily and safely tolerated as missing by `loadAll`.

## Remaining Work Before Real Unreal Sandbox Execution
1. Implement the next dry-run leg (e.g. play-sequence / preview-frame)
   following the same chained-gate pattern.
2. Provision a real Unreal sandbox host and configure `UNREAL_BRIDGE_*`
   environment variables.
3. Add a separate `production`-mode handler with stricter approval
   (`production_release_approved` or higher) and AuditedExec audit.
4. Add a "panel template store" so creators can re-use sanitized
   panel configurations without re-typing them.
