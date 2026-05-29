# Mougle AI Production House MVP — Implementation Report

Date: 2026-05-16
Author: Codex agent (Build mode)

## Goal

Build a premium futuristic admin dashboard — **Mougle AI Production House** —
for orchestrating AI-driven 3D/4D cinema productions: newsrooms, podcast
rooms, debate rooms, halls, avatars, prompt-driven scene generation, Unreal
Engine command routing, and 4D cue timelines. The MVP is a control center
only: it generates JSON manifests and queues commands as `dryRun: true`. It
never opens an outbound socket to Unreal or to 4D hardware, never publishes
publicly, and never persists to the database.

## Files added / changed

| File | Status | Purpose |
| --- | --- | --- |
| `shared/production-house.ts` | NEW | Zod contracts for rooms, avatars, halls, podcasts, newsroom productions, productions, 4D cues, Unreal commands, render jobs, audit logs, manifests, Prompt-Studio I/O. Locked `SAFETY_ENVELOPE`. |
| `server/services/production-house-service.ts` | NEW | In-memory store + CRUD + manifest builders + deterministic Prompt-Studio generator + dry-run-only Unreal/4D senders + booleans-only integrations status. |
| `server/routes/production-house-routes.ts` | NEW | 30+ root-admin routes (overview, prompt, CRUD, approve, Unreal commands, 4D send, render jobs, audit, integrations, manifests). |
| `client/src/pages/admin/ProductionHouse.tsx` | NEW | Single-page dashboard with left sidebar navigation across 13 sections (Dashboard, Prompt Studio, Room/Avatar/Hall/Podcast/Newsroom builders, Unreal Creator, 4D Timeline, Integrations, Render Jobs, Manifests, Settings). |
| `tests/production-house.test.ts` | NEW | Safety-envelope tamper checks, full root-admin gating, dry-run-only verification, render-job public-URL absence, prompt studio determinism, integration secret hygiene, no-Drizzle proof. |
| `server/routes.ts` | MODIFIED | Imported + registered the new route group. |
| `client/src/App.tsx` | MODIFIED | Route `/admin/production-house` wired. |
| `package.json` | MODIFIED | Added the new test file to the `test` script. |
| `docs/reports/CODEX_MOUGLE_AI_PRODUCTION_HOUSE_REPORT.md` | NEW | This report. |

No edits to `shared/schema.ts`. No DB migrations. No `db:push`. No Drizzle
imports. The MVP is fully in-memory, as the spec allows ("simple database
models *or* JSON storage").

## Dashboard sections

Sidebar covers every spec section: Dashboard, Prompt Studio, Room Creator,
Unreal Creator, Newsroom Builder, Podcast Builder, Hall Builder, Avatar
Creator, 4D Cue Timeline, Integration Center, Render Jobs, Manifests,
Settings. A persistent "dry-run only / no public publish" badge row and a
technical-limitation notice are rendered above the main content area, so
operators always see the boundary the MVP is enforcing.

## Routes

All under `/api/admin/production-house/*`, all `requireRootAdmin`, CSRF
inherited from the global `/api/*` middleware in `server/index.ts`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET  | `/overview` | Totals + pending counts + integrations summary + envelope |
| POST | `/prompt` | Prompt Studio — deterministic mock generator |
| GET/POST | `/rooms` | Room CRUD |
| GET/POST | `/avatars` | Avatar CRUD |
| GET/POST | `/halls` | Hall CRUD |
| GET/POST | `/podcasts` | Podcast CRUD |
| GET/POST | `/newsroom-productions` | Newsroom production CRUD |
| GET/POST | `/productions` | Production CRUD |
| POST | `/productions/:id/approve` | Approval workflow state machine |
| GET/POST | `/4d-cues` | 4D cue CRUD |
| POST | `/4d/send-cue` | dryRun-only send of single cue (refuses unapproved cues) |
| POST | `/4d/send-timeline` | dryRun-only timeline send (refuses unapproved productions) |
| GET  | `/4d/status` | reports `realHardwareSendAllowed: false, dryRun: true` |
| POST | `/unreal/send-command`, `/load-level`, `/set-camera`, `/set-lighting`, `/start-sequence`, `/render` | dryRun-only Unreal commands |
| GET  | `/unreal/status` | reports `realUnrealSendAllowed: false, dryRun: true` + last 20 mock commands |
| GET  | `/render-jobs` | render-job list (all `admin_only_internal`, `publicUrl: null`, `signedUrl: null`) |
| GET  | `/audit` | last N audit events |
| GET  | `/integrations` | booleans-only integration readiness — no secret values |
| GET  | `/manifests/:productionId` | production / Unreal scene / avatar / 4D cue manifests |

## Approval workflow

Production statuses: `draft → generated → needs_review → approved →
sent_to_unreal → rendering → rendered → published → failed`. The
`/unreal/render` and `/unreal/send-command` routes refuse with
`status: "mock_rejected"` + HTTP 409 if the production is not in
`approved`/`sent_to_unreal`/`rendering`. The `/4d/send-cue` route refuses if
the cue's `approvalStatus !== "approved"` or `safetyFlag === "blocked"`. The
`/4d/send-timeline` route refuses if the production is not approved.

## Prompt Studio

Deterministic mock generator. Parses the prompt for keyword cues (fog, bass,
flash, wind, vibration, scent, water, heat, color/red/blue/gold) and emits a
4D cue timeline accordingly; selects camera preset (zoom vs wide) and
lighting preset (red_alert / blue_gold_studio / default_studio) from prompt
keywords; assembles a scene manifest, avatar manifest, and `dryRun: true`
Unreal command. No OpenAI / no external provider is called — even when
`OPENAI_API_KEY` is set, the MVP keeps the path deterministic so previews
work without keys (matching the spec's MVP requirement).

## Confirmations

- **No public publishing.** `SafetyEnvelopeSchema` locks
  `publicPublishing / youtubeUpload / socialPosting / liveStreaming` to
  `z.literal(false)`.
- **No real Unreal commands.** `realUnrealCommands: z.literal(false)`;
  `isRealUnrealSendAllowed()` is hard-coded `false`; every Unreal route emits
  a `dryRun: true` mock command and never opens a socket.
- **No real 4D hardware sends.** `real4DCommands: z.literal(false)`;
  `isReal4DSendAllowed()` is hard-coded `false`; `/4d/send-cue` and
  `/4d/send-timeline` only ever return `dryRun: true` mock results.
- **No public URLs / signed URLs.** `publicUrlGeneration` and
  `signedUrlGeneration` are `z.literal(false)`. Render jobs carry
  `publicUrl: z.literal(null)`, `signedUrl: z.literal(null)`, and
  `visibility: z.literal("admin_only_internal")`.
- **No `db:push`.** No Drizzle imports, no migrations, no `shared/schema.ts`
  edits. (Asserted by a dedicated test that reads both files and rejects any
  drizzle or schema import.)
- **Integration status returns booleans only.** Direct secret-leak regression
  test confirms a planted `sk-test-should-not-leak` value never appears in
  the response body.
- **All routes root-admin gated.** A single sweeping test hits every route
  with `allowAdmin=false` and asserts HTTP 401 on each.

## Tests added

`tests/production-house.test.ts` covers:
- Safety envelope tamper checks (8 keys + manualRootAdminOverrideOnly).
- All routes require root admin (sweep over 27 endpoints).
- Unreal & 4D status report `dryRun: true` and `*SendAllowed: false`.
- `unreal/load-level` always returns `dryRun: true, status: mock_accepted`.
- `unreal/render` is refused for unapproved productions (`mock_rejected`).
- `unreal/render` creates a queued render job with `publicUrl: null`,
  `signedUrl: null`, `visibility: admin_only_internal` once approved.
- `4d/send-cue` refuses unapproved cues.
- Prompt Studio returns deterministic JSON, including expected cue types
  (fog_burst + bass_hit when the prompt mentions them), with the envelope
  locked and `unrealCommand.dryRun: true`.
- `runPromptStudio` is callable directly without any external provider.
- Integrations status returns booleans only — secret leak regression.
- `shared/production-house.ts` does not import `./schema` or any Drizzle.
- `server/services/production-house-service.ts` does not import Drizzle / db.

## UI design

Dark navy / black background, electric blue + amber/gold accents, card-based
layout, left sidebar navigation, top status bar with three "boundary" badges
(Unreal dry-run / 4D dry-run / no public publish) and a Refresh button. Every
section is a sub-component within the same file to keep the surface area
tight. Test IDs are wired on every interactive element (`nav-*`, `button-*`,
`stat-*`, `integration-*`, `int-*`).

## Remaining work before production-grade autonomy

1. **Real Unreal Remote Control bridge.** Out of scope. Requires a new gated
   service with per-command approval, a kill switch, and its own audit log.
2. **Real 4D hardware bridge (DMX/OSC/UDP).** Out of scope for the same
   reasons.
3. **Real provider integrations.** OpenAI / ElevenLabs / Meshy / Runway /
   Convai / NVIDIA ACE / DeepMotion / Rokoko adapters need to be added behind
   feature flags. The contract (`voiceProvider`, `bodyAnimationProvider`,
   `unrealBlueprintName`) is already in place.
4. **DB-backed persistence.** Requires a separate, explicit migration task
   that edits `shared/schema.ts` and runs `db:push` — both prohibited in this
   MVP.
5. **Public publishing / YouTube / live streaming.** Permanently false in
   this envelope. Enabling them requires a new envelope variant, editorial /
   legal approval workflow, and per-item human approval even in autopilot.

— end of report —
