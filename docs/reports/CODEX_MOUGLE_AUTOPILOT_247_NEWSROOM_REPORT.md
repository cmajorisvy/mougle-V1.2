# Mougle Autopilot 24/7 Newsroom MVP — Implementation Report

Date: 2026-05-16
Author: Codex agent (Build mode, no project-task migration requested)

## Goal

Add an optional 24/7 Autopilot mode that runs the verified-newsroom pipeline
continuously for **internal admin-only playout**. The MVP is planning-only
(decisions + manifests + queue items) and does not call providers, write to
the DB, render media, send real Unreal/4D commands, or publish anything
publicly.

## Files added / changed

| File | Status | Purpose |
| --- | --- | --- |
| `shared/autopilot-newsroom.ts` | NEW | Zod contracts (modes, settings, decisions, gates, queue, playout, audit, schedule, fallback, kill switch) + immutable `SAFETY_ENVELOPE` locked via `z.literal()`. |
| `server/services/newsroom/autopilotDecisionService.ts` | NEW | Pure deterministic decision engine. No DB, no providers, no rendering. Returns gate-by-gate explanations. |
| `server/services/newsroom/autopilotDecisionService.helpers.ts` | NEW | Re-export shim used by the scheduler to avoid name collisions. |
| `server/services/newsroom/continuousNewsroomScheduler.ts` | NEW | In-process scheduler. Default DISABLED. Registers a SIGTERM stopper via the shutdown registry. Permanent locks for Unreal/4D/public publish. |
| `server/routes/autopilot-newsroom-routes.ts` | NEW | 8 root-admin routes (status, settings, kill-switch, start, stop, evaluate, queue, audit). |
| `server/routes.ts` | MODIFIED | Imported + registered the autopilot routes. |
| `server/config/validate-env.ts` | MODIFIED | Added a booleans-only autopilot section: feature flags + Unreal/4D/public locks displayed as booleans only. No secret values. |
| `client/src/pages/admin/AutopilotNewsroom.tsx` | NEW | Admin UI with all 15 required sections: status, mode selector, kill switch, schedule controls, queues (source, verified, reader, podcast, avatar), Unreal/4D readiness, safety gates, blocked items, audit log, fallback loop, manual override. |
| `client/src/App.tsx` | MODIFIED | Route `/admin/autopilot-newsroom` wired. |
| `tests/autopilot-newsroom.test.ts` | NEW | 30+ tests across safety envelope, decision service, scheduler defaults, and admin routes. |
| `package.json` | MODIFIED | Added the new test file to the `test` script. |
| `docs/reports/CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md` | NEW | This report. |

No edits to `shared/schema.ts`. No DB migrations. No `db:push`. No new Drizzle
imports. The MVP is end-to-end in-memory.

## Modes added

- `manual` — every render/playout action requires a human approval. (default)
- `autopilot_preview` — continuously runs decisions/manifests; never plays.
- `autopilot_internal_playout` — full 24/7 internal-only loop. Queues stages
  and plans `admin_only_internal` playout items. Never reaches a public surface.
- `autopilot_public_publish` — **placeholder only**. The settings route refuses
  it with HTTP 400 and the scheduler's `isPublicPublishFeatureEnabled()`
  returns `false` even if the env var is set. A future migration task is
  required to enable it.

## Safety thresholds

Configurable via `AutopilotSettings`:
- `minConfidence` (default 0.72)
- `minSourceCount` (default 2)
- `allowDevelopingInternalOnly` (default false)
- `allowCorrectionsInternal` (default true; requires `correctionSafe` on item)
- `staleItemAgeMs` (default 6h)
- `maxItemsPerCycle` (default 10)
- `cycleIntervalMs` (default 30s)
- `concurrency` (default 2)
- `fallbackEnabled` (default true)

## Blocked categories

`elections`, `war_conflict_escalation`, `health_medical_advice`,
`financial_recommendation`, `legal_accusation`, `death_report`,
`criminal_allegation`, `minors`, `graphic_violence`, `disputed`,
`low_confidence`, `insufficient_sources`, `rights_blocked_media`.

High-risk categories (elections, war, health/medical, financial, legal, death,
criminal, minors, graphic_violence) always require manual review.

## Routes

All root-admin gated, CSRF protected via global `csrfMiddleware`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET  | `/api/admin/autopilot/status` | Current settings + schedule + flags + envelope |
| POST | `/api/admin/autopilot/settings` | Update settings (rejects `autopilot_public_publish`) |
| POST | `/api/admin/autopilot/kill-switch` | Engage / disengage kill switch |
| POST | `/api/admin/autopilot/start` | Start the scheduler (refuses unless flags + mode line up) |
| POST | `/api/admin/autopilot/stop` | Stop the scheduler immediately |
| POST | `/api/admin/autopilot/evaluate` | Run the decision service on an ad-hoc story |
| GET  | `/api/admin/autopilot/queue` | Queue + planned playout |
| GET  | `/api/admin/autopilot/audit` | Latest audit events |

## UI changes

New page: `/admin/autopilot-newsroom`. Sections covered: status, mode selector,
kill switch, 24/7 schedule controls, source/verified/reader/podcast/avatar
queues, Unreal/4D future readiness (labelled disabled), safety gates summary,
blocked items, audit log, fallback content card, manual override panel.

No "Publish to YouTube", "Publish to social", "Start public livestream",
"Send real Unreal command", or "Send real 4D cue" buttons exist. The mode
selector has a disabled `Public publish` button labelled `permanently disabled`.

## Scheduler behaviour

- Default DISABLED. Requires both `AUTOPILOT_NEWSROOM_ENABLED=1` and (for
  internal playout) `AUTOPILOT_INTERNAL_PLAYOUT_ENABLED=1`.
- Registers `continuousNewsroomScheduler` once with the shutdown registry on
  first successful start, so SIGTERM stops the interval cleanly.
- Concurrency cap, max-items-per-cycle, stale-item guard, and
  `consecutiveFailures` counter are tracked on the schedule object.
- Failed cycles record `cycle_failed` audit events; they do not crash the loop.
- When no eligible items exist and `fallbackEnabled=true`, enqueues
  `FALLBACK_NO_UPDATE` ("No verified update available"). Never invents news.

## Kill switch behaviour

`engageKillSwitch()` and the `POST /api/admin/autopilot/kill-switch` route both
set `settings.killSwitchEngaged=true`, record an audit event, and immediately
`stop()` the scheduler. `start()` refuses while the kill switch is engaged
(`reason: "kill_switch_engaged"`).

## 24/7 playout design

`source item → clustering → claim extraction → eligibility decision →
NewsroomDataPackage → RenderManifest → voice plan → avatar plan →
newsroom/podcast room scene plan → playout queue item → internal admin-only
playout`. The MVP wires the *queue + planning* portion; clustering / claim
extraction / package builder / render manifest already exist in the codebase
and are not modified here.

## Podcast room support

Planned playout kind `podcast_room` is in the schema with two-host /
interview / explainer scripts surfaced through the same manifest pipeline.
The scheduler does not auto-emit podcast items in this MVP — the UI shows a
queue card for them, and the contract is ready for a follow-up that wires the
podcast plan generator.

## Avatar support

Planned playout kind `avatar_reader` is in the schema. The playout item
carries `avatarPlanRef` (always present when internal playout is active) and
`voicePlanRef` (only when `AUTOPILOT_ALLOW_PROVIDER_CALLS=1`). No real provider
is called from this MVP regardless.

## Unreal / 4D future hooks

Only manifests are generated (`unrealManifestRef`, `fourDCueManifestRef`).
`isUnrealSendAllowed()` and `is4DSendAllowed()` always return `false` — env
vars `AUTOPILOT_ALLOW_UNREAL_SEND` / `AUTOPILOT_ALLOW_4D_SEND` are
intentionally ignored in this MVP. A future migration task is required to
allow real sends.

## Confirmations

- **No public publishing.** `publicPublishing`, `youtubeUpload`,
  `socialPosting`, `liveStreaming` are all `z.literal(false)` in
  `SafetyEnvelopeSchema`.
- **No real Unreal/4D sends.** `realUnrealCommands` and `real4DCommands` are
  `z.literal(false)`. The corresponding scheduler helpers hard-code `false`.
- **No public URLs.** `publicUrlGeneration: z.literal(false)`. Playout items
  carry `publicUrl: z.literal(null)`.
- **No signed URLs.** `signedUrlGeneration: z.literal(false)`. Playout items
  carry `signedUrl: z.literal(null)`.
- **No `db:push`.** No Drizzle schema imports. No migrations.
- **Manual mode preserved.** Default mode is `manual`; never auto-eligible.
- **Env validation not weakened.** Persistent storage guard intact;
  `STORAGE_LOCAL_OK=1` still forbidden in production.

## Tests added (`tests/autopilot-newsroom.test.ts`)

- Safety envelope literal lock — 6 tampering cases.
- Decision service — manual blocks, preview never plays, internal-playout
  eligibility, public-publish mode rejected, disputed/rejected/low-confidence/
  insufficient-sources/rights-blocked/developing blocks, high-risk manual
  review, kill switch blocks everything.
- Scheduler defaults — default mode manual, scheduler off, start refused
  without flags, internal-playout requires both flags, shutdown registry
  binding present, Unreal/4D/public-publish always false.
- Routes — root-admin gating on all 8 routes, status returns locked-false
  envelope, evaluate has no secret leakage, settings rejects
  `autopilot_public_publish`, kill switch via route prevents start, playout
  items always have `publicUrl: null` and `signedUrl: null` and visibility
  `admin_only_internal`.

## Remaining work before public autonomous publishing

1. **DB-backed queues + audit.** Required if the operator wants the queues to
   survive restarts. This is a separate, explicit migration task.
2. **Real provider integrations.** OpenAI/ElevenLabs voice + avatar lip-sync
   need feature-flagged adapters (decision shape is ready: `voicePlanRef`,
   `avatarPlanRef`).
3. **Real Unreal/4D bridge.** Out of scope. Would require a separate gated
   service with its own kill switch, audit, and per-cue approval.
4. **Public publishing.** Requires (a) editorial/legal approval workflow,
   (b) a new mode in the schema (not added here), (c) per-item human approval
   even in autopilot, (d) rate limits and a new safety envelope variant.
5. **Continuous source ingestion adapter.** The scheduler accepts a
   `fetchPending` callable so the existing newsroom services can plug in.

— end of report —
