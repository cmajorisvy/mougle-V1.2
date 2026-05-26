# Mougle 4D Cinema Control MVP — Implementation Report

**Status:** Preview-only MVP shipped. No DB migration. No real provider
calls. No Unreal commands or 4D hardware cues sent on the wire.

## Files changed / added

### New
- `shared/4d-cinema-manifest.ts` — Zod contracts + the `SAFETY_ENVELOPE`
  constant. Schemas: `SafetyEnvelope`, `FourDCinemaProject`, `AvatarPlan`,
  `ScriptPlan`, `VoicePlan`, `SceneManifest`, `UnrealCommand`, `FourDCue`,
  `FourDCueManifest`, `ProviderReadiness`, `AdminApproval`.
- `server/services/cinema-control-service.ts` — in-memory project store,
  mock generators, provider-readiness helper.
- `server/routes/cinema-control-routes.ts` — all admin preview routes.
- `client/src/pages/admin/CinemaControl.tsx` — admin workbench page.
- `tests/cinema-control.test.ts` — 32 passing test cases (12 suites).
- `docs/reports/CODEX_MOUGLE_4D_CINEMA_CONTROL_MVP_REPORT.md` — this file.

### Edited
- `server/routes.ts` — added one import and one
  `registerCinemaControlRoutes(app, requireRootAdmin)` call alongside the
  existing newsroom preview registration.
- `client/src/App.tsx` — added the page import and the
  `/admin/4d-cinema-control` route.
- `package.json` — appended `tests/cinema-control.test.ts` to the `test`
  script.

`shared/schema.ts` was NOT touched. `shared/newsroom-schema.ts` is NOT
imported into `shared/schema.ts`. No Drizzle migration was generated.
`db:push` was NOT run.

## New routes (all root-admin-gated, all CSRF-protected by the global
`/api/*` middleware in `server/index.ts`)

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/admin/cinema/readiness` | Booleans-only provider/feature-flag status |
| GET  | `/api/projects` | List in-memory 4D cinema projects |
| POST | `/api/projects` | Create a project (in-memory) |
| GET  | `/api/projects/:id` | Read one project |
| POST | `/api/projects/:id/approval` | Mark draft / preview_ready / approved / blocked |
| POST | `/api/script/generate` | Mock anchor script (OpenAI gate, not called) |
| POST | `/api/voice/generate` | Mock voice plan (ElevenLabs/OpenAI gate, not called) |
| POST | `/api/assets/meshy` | Planned 3D asset request (Meshy gate, not called) |
| POST | `/api/video/runway` | Planned B-roll request (Runway gate, not called) |
| POST | `/api/scene-manifest` | Build a Scene Manifest JSON with immutable safety envelope |
| POST | `/api/4d-cue-manifest` | Build a 4D Cue Manifest JSON, rejecting unsafe cues |
| POST | `/api/unreal/send-command` | Dry-run only; never opens an outbound socket |
| POST | `/api/4d/send-cue` | Dry-run only; never opens an outbound socket |

## UI

- New page: `client/src/pages/admin/CinemaControl.tsx` at
  `/admin/4d-cinema-control`.
- Sections: provider/safety readiness, project dashboard (create/list/select),
  workbench Tabs (Scene / 4D cues / Mock providers / Approval).
- Buttons map 1:1 to the spec: *Generate scene preview*, *Generate 4D cue
  manifest*, *Export JSON* (per manifest), *Mark approved for future Unreal
  test*, *Mark blocked*, *Mark preview ready*, plus two intentionally
  **disabled** "Execute on Unreal" / "Fire 4D hardware" buttons that exist
  only as visual placeholders with explanatory tooltips.

## Manifest contracts

### Safety envelope (immutable via Zod literals)
```
publicPublishing:        false   // z.literal(false)
youtubeUpload:           false   // z.literal(false)
socialPosting:           false   // z.literal(false)
autonomousExecution:     false   // z.literal(false)
manualRootAdminTriggerOnly: true // z.literal(true)
internalAdminReviewOnly:   true  // z.literal(true)
```
Any payload that flips any of these booleans is rejected at validation
time. Tests cover three tamper attempts.

### Scene manifest
Includes: `manifestId`, `projectId`, `sceneType`, `roomPreset`,
`cameraPlan`, `avatarPlan`, `scriptPlan`, `voicePlan`, `screenPanels`,
`mediaRefs`, `unrealPlan`, `renderSafety`, `adminApproval`, `generatedAt`.
The `renderSafety` block is appended server-side from the
`SAFETY_ENVELOPE` constant; the client-supplied `renderSafety` (if any) is
re-validated then overwritten.

### 4D cue manifest
Each cue is `{ timeMs ≤ 1h, cueType (snake_case ascii), effects }`.
Per-effect hard caps:
- `intensity` ∈ [0, 1]
- `durationMs` ∈ [0, 30000]
- `ledColor.hex` must match `^#[0-9a-fA-F]{6}$`
- `alertFlash.count` ∈ [0, 20]

Unsafe cues are rejected at request validation; tests cover four rejection
paths (intensity > 1, duration > 30 s, bad LED hex, non-snake_case cueType).

## Provider readiness behavior

`getProviderReadiness()` returns **only booleans** for `openai`,
`elevenlabs`, `meshy`, `runway`, `unrealRemote`, `fourDBridge`,
`webhookSecret`. Secret VALUES are never read, logged, returned, or
serialized. The readiness endpoint, the readiness-error JSON, and every
mock response have been tested to confirm the secret never leaks (test
"readiness endpoint returns only booleans, no secret values" sets a
recognizable fake secret and asserts it is absent from the response body).

When a route is called with `dryRun: false`:
1. If the relevant env var is missing → `400 provider_not_ready`.
2. Else if the matching feature flag (`FEATURE_CINEMA_*_LIVE`) is unset →
   `400 provider_disabled_safe_mode`.
3. Else (in this MVP) the route still returns a mock — the real
   external-call code path is intentionally not wired yet.

## Unreal dry-run behavior

`POST /api/unreal/send-command` defaults to:
```
{
  ok: true,
  commandSent: false,
  dryRun: true,
  requiresManualApproval: true,
  commandType, projectId,
  hint: "...real Unreal Remote Control delivery is intentionally not implemented..."
}
```
No `fetch`/socket call is ever issued from this route in this MVP. Live
mode (which still does not call the network) requires `UNREAL_REMOTE_URL`,
`WEBHOOK_SECRET`, AND `FEATURE_CINEMA_UNREAL_LIVE=1`.

## 4D cue dry-run behavior

`POST /api/4d/send-cue` defaults to:
```
{ ok: true, cueSent: false, dryRun: true, requiresManualApproval: true, cue, hint }
```
Live mode requires `LOCAL_4D_BRIDGE_URL`, `WEBHOOK_SECRET`, AND
`FEATURE_CINEMA_4D_LIVE=1`. The route still does not open a socket in
this MVP.

## Tests added (32 cases, 12 suites — all passing)

`tests/cinema-control.test.ts`:
1. Safety envelope rejects tamper attempts (3 cases).
2. Scene manifest generation for newsroom + podcast room + HTTP route.
3. Avatar selector schema constraints.
4. 4D cue manifest validation (1 happy path + 4 rejection paths).
5. Unreal command route default + readiness error + disabled-safe-mode.
6. 4D cue route default + readiness error.
7. Provider readiness errors and mock defaults for script / voice /
   meshy / runway.
8. Secret hygiene (3 cases): readiness endpoint, error JSON, empty-string
   handling.
9. Root-admin gating across all mutating routes + GET projects.
10. Project lifecycle (create → list → approve) round trip.
11. Schema/db non-impact: `shared/schema.ts` does not import the new
    manifest file; `cinema-control-service.ts` imports no Drizzle or `db`.
12. Mock generators respect inputs and never set a public audio URL.

Run via `npm test` (added to the script) or
`npx tsx --test tests/cinema-control.test.ts` directly.

## No DB migration / no render execution / no provider call confirmations

- **No DB migration:** the service uses a module-local `Map<string,
  FourDCinemaProject>`. No Drizzle table is touched. `db:push` was not
  run. The route registration adds zero new SQL statements. Test
  "schema/db non-impact" asserts both files contain no `drizzle` or `db`
  imports.
- **No render execution:** no FFmpeg, Remotion, avatar-video-render-service,
  or render-worker code is imported by the new files (verifiable with
  `rg "ffmpeg|remotion|render-worker" server/services/cinema-control-service.ts server/routes/cinema-control-routes.ts`).
- **No provider call:** no `fetch`, `axios`, `OpenAI`, `https`, `http` client
  call is issued from the new routes or service. The `OpenAI`/`ElevenLabs`/
  `Meshy`/`Runway`/`Unreal`/`4D` integrations are gated by feature flags
  but the bodies are stubs that return mocks even when fully enabled.
- **No public publishing:** `publicPublishing`, `youtubeUpload`,
  `socialPosting` are Zod literal `false` and cannot be flipped without
  editing the schema file.

## Rollback notes

To roll back this MVP entirely:
1. Remove the line
   `registerCinemaControlRoutes(app, requireRootAdmin);` from
   `server/routes.ts` and its import.
2. Remove the route + import from `client/src/App.tsx`.
3. Delete:
   - `shared/4d-cinema-manifest.ts`
   - `server/services/cinema-control-service.ts`
   - `server/routes/cinema-control-routes.ts`
   - `client/src/pages/admin/CinemaControl.tsx`
   - `tests/cinema-control.test.ts`
4. Remove ` tests/cinema-control.test.ts` from `package.json#scripts.test`.

No DB migration to revert, no environment variables to delete, no
external state was created.

## Remaining work before real Unreal / 4D hardware integration

1. Implement the real OpenAI / ElevenLabs / Meshy / Runway client calls
   behind the existing feature-flag + readiness gates. Keep the
   mock-mode response shape so the UI does not change.
2. Build the Unreal Remote Control client (`UNREAL_REMOTE_URL`) with
   HMAC signing via `WEBHOOK_SECRET`, and add an explicit founder
   confirmation step that calls a separate `/confirm` endpoint before
   the bridge call is dispatched.
3. Build the local 4D bridge client (`LOCAL_4D_BRIDGE_URL`) with the
   same confirmation flow plus a hardware self-test handshake.
4. Persist projects + manifests in Drizzle (will require a real schema
   migration in a separate task — out of scope here).
5. Add e2e Playwright tests covering the admin UI flow once the page is
   wired into the AdminDashboard zone navigation.
6. Wire a hardware-safety audit log that records every approval and
   every (future) command/cue dispatch with actor, manifestId, and a
   reversible "dry-run" flag.
