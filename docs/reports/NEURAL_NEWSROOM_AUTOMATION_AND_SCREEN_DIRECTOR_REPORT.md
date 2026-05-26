# Neural Newsroom Automation + Broadcast-Grade Virtual Screen Director

**Status:** draft / admin_only_internal. Nothing in this stack publishes,
sends to real hardware, drives Unreal, drives Movie Render Queue, drives
Sequencer, or actuates 4D hardware. Every output ships with
`realSendAllowed:false`, `executionEnabled:false`, `hardwareSendAllowed:false`,
`notPublished:true`, and a locked `safetyEnvelope`.

## 1. Architecture

```
Raw News Feeds
  → Source Trust / Verification
  → BroadcastBrief
  → LegalEventVisualPlan
  → NewsroomScreenData
  → ApexLoad Optimizer            (server/services/apexload-newsroom-optimizer.ts)
  → PreCognition Planner          (server/services/precognition-newsroom-planner.ts)
  → FlowState Conductor           (server/services/flowstate-newsroom-conductor.ts)
  → Virtual Screen Director       (server/services/virtual-production-screen-director.ts)
  → Broadcast-Grade Screen Safety (server/services/broadcast-grade-screen-safety-service.ts)
  → Preview Studio / Simulation
  → Approval / Future Gateway
```

The Neural Newsroom Bus
(`server/services/neural-newsroom-bus.ts`) carries every transition
(`story.*`, `apexload.*`, `precognition.*`, `flowstate.*`, `anchor.*`,
`robot.*`, `screen.*`, `chat.*` (legacy alias), `audience.*` (Task #371),
`fallback.*`, `kill_switch.*`) and is the
only path display subscribers may consume — admin-private fields are
redacted before broadcast to display subscribers and the subscriber list is
whitelisted.

The final authority is deterministic safety validation, **not** free AI
generation.

## 2. Schemas

Defined in `shared/neural-newsroom-schema.ts` and re-exported from
`shared/schema.ts`. DDL is applied via direct SQL through
`scripts/migrate-neural-newsroom.ts` against `SUPABASE_DB_URL`. The locked
preset rows are seeded by the same script.

| Table | Purpose |
| --- | --- |
| `screen_presets` | Locked, founder-seeded slots (world map, event wall, source / claims / timeline panels, lower-third, ticker, corner anchor, back display, side screens). Carries `safeArea`, `allowedSourceTypes`, `allowedSensitivityClasses`, `fallbackPresetId`, `locked:true`. |
| `screen_take_plans` | Every directorial action — preview / route / fullscreen / pip / split / zoom / crop / pan / take / cut / fade / restore_default — becomes one of these. Includes `confidenceVector`, `cTotal`, `tierBand`, `validationStatus`, fallback + restore preset ids, and the full safety envelope. |
| `screen_safety_validations` | Per-take-plan verdict: `passed`, `blockers[]`, `warnings[]`, `checks{...}`. |

## 3. Confidence Vector

`server/services/neural-newsroom/confidence-vector.ts`

```
C_total = min(
  C_source,
  C_verification,
  C_license,
  C_screen_match,
  C_sensitivity,
  C_audience_safety,
  C_fallback
)
```

Important: **MIN, not average.** A story can be verified while the media
source is still unsafe. `C_audience_safety` defaults to 1.0 here and is
overridden by the Omni-Channel Audience Safety Layer (Task #371).

Tier bands:

| Band | Range | Behaviour |
| --- | --- | --- |
| `auto`     | ≥ 0.90       | Automatic simulation allowed. |
| `assisted` | 0.75 – 0.90  | Assisted preview only. |
| `review`   | 0.50 – 0.75  | Admin review required. |
| `reject`   | < 0.50       | Reject + fallback (counts as a blocker). |

## 4. ApexLoad Optimizer

Weighted formula per Spec §1:

```
apexScore =
  0.25 * impactScore +
  0.20 * sourceReliability*100 +
  0.15 * verificationConfidence*100 +
  0.10 * freshnessScore +
  0.10 * regionalImportance +
  0.10 * publicInterest +
  0.05 * visualPotential +
  0.05 * rightsReadiness
```

Tier router:

| Range | Tier |
| --- | --- |
| `< 40`   | `text_only` |
| `40–60`  | `voice_summary` |
| `60–75`  | `newsroom_read` |
| `75–90`  | `full_visual_package` |
| `≥ 90`   | `cinematic_4d_treatment` |

## 5. PreCognition Planner

Emits `scriptBeatPlans`, `preloadSources`, `screenTakePlans`,
`robotIntentPlans`, `anchorModePlan`, and `fallbackRoutes` for every beat.
Fullscreen is **blocked** whenever the source is `rights_unknown`,
`prohibited`, `unapproved`, or `mismatched`. Sensitive stories reject any
playful / hype / comedy anchor or robot mode. Fallback routes are
mandatory.

## 6. FlowState Conductor

Explicit state machine — only declared transitions are allowed:

```
idle              → calm_read | kill_switch
calm_read         → focused_explainer | breaking_alert | sensitive_story | chat_reaction | fallback_mode | kill_switch
focused_explainer → calm_read | breaking_alert | sensitive_story | fallback_mode | kill_switch
breaking_alert    → calm_read | sensitive_story | fallback_mode | kill_switch
sensitive_story   → calm_read | fallback_mode | kill_switch
chat_reaction     → calm_read | kill_switch
fallback_mode     → calm_read | kill_switch
kill_switch       → idle
```

Each state controls anchor mode, robot mode, screen route, ticker,
lower-third, back display, side screens, legal visual mode, chat highlight
mode, and 4D cue suggestion. No hardware is touched.

## 7. Broadcast-Grade Screen Safety — 17 Checks

For every take plan:

1. `sourceMatchesStory`
2. `sourceLicenseAllowed`
3. `sourceApproved`
4. `noCopyrightViolation`
5. `noWatermarkRemoval`
6. `noLogoStripping`
7. `noPrivateAdminData`
8. `targetScreenKnown`
9. `presetKnown`
10. `cropWithinBounds`
11. `fallbackExists`
12. `sensitivityModeAllowed`
13. `anchorModeAllowed`
14. `robotModeAllowed`
15. `noRealHardware`
16. `noPublishing`
17. `safetyEnvelopeLocked`

Plus the confidence-band gate (`confidence_below_tier_floor` is added if
`C_total < 0.50`).

**Fail-closed rule.** If any check fails, the service does not route the
source, does not go fullscreen, does not show the clip — instead it
restores the world-map preset, shows a safe lower-third, logs the blocker,
and keeps `approvalStatus:"draft"`. A `fallback.triggered` event is
emitted on the bus.

## 8. Legal Media Rule

- No copyrighted footage reuse.
- No logo removal.
- No watermark stripping.
- No unauthorized rebroadcast.
- No private admin data on screens.
- No YouTube / social posting without separate approval.
- No direct Spyder / Barco / Novastar / processor command in this phase.
- No real LED processor command.
- No live Unreal execution, Movie Render Queue, or Sequencer.
- No real 4D hardware actuation.
- All outputs draft / internal-only.

## 9. Admin Routes (root-admin + CSRF)

Mounted in `server/routes/neural-newsroom-routes.ts` under
`/api/admin/neural-newsroom`:

- `POST /apexload/decide`
- `POST /precognition/plan`
- `GET  /flowstate`
- `POST /flowstate/transition`
- `POST /screen-director/anchor-intent`
- `POST /screen-director/robot-intent`
- `POST /screen-director/restore-default`
- `POST /kill-switch`
- `GET  /take-plans`
- `GET  /validations`
- `GET  /presets`
- `GET  /bus/history`
- `GET  /overview`

## 10. Admin UI

The Production House admin surface (`client/src/pages/admin/ProductionHouse.tsx`)
exposes a "Neural Newsroom" subsection that shows the current FlowState,
seeded presets, the recent ScreenTakePlan queue with each row's
`tierBand` / `validationStatus` / blockers, the most recent
`ScreenSafetyValidations`, and the redacted bus event history. It also
exposes the kill-switch and the "restore default" action.

## 11. Tests

`tests/neural-newsroom.test.ts` covers:

- Tier-band thresholds for ApexLoad.
- MIN-based confidence vector (verified-but-unsafe story → `reject`).
- PreCognition fullscreen blocked on missing fallback / unapproved source.
- Sensitive-story rejection of playful anchor/robot modes.
- FlowState transition whitelist (kill_switch → idle only).
- Screen safety happy-path + locked envelope persisted.
- Copyright reuse blocked.
- Watermark removal + logo strip blocked.
- Mismatched source blocked.
- Out-of-bounds crop blocked.
- Private admin data blocked.
- Anchor vs robot intent `requestedBy` tagging.
- Bus admin-field redaction for display subscribers.
- Bus non-whitelisted display subscriber refused.

## 12. Omni-Channel Audience Safety Layer (Task #371)

Replaces the YouTube-only chat safety layer with a cross-platform
audience moderation stack:
`server/services/omni-channel-audience-safety-service.ts`. Schemas live
in `shared/omni-channel-audience-schema.ts`; optional DDL is provisioned
by `scripts/migrate-omni-channel-audience.ts`. Live state runs
in-memory (mirrors apexload / precognition / flowstate) so the safety
contract is enforced without DB writes.

### Supported platforms

YouTube · Facebook · X · Telegram · Instagram · TikTok · LinkedIn ·
Reddit · `custom` (future adapters).

### API permission model

Each `AudienceChannelConnector` declares an `apiAccessMode`
(`official_api` / `webhook` / `manual_import` / `disabled`) plus
per-action `permissions` (canReadComments / canReadLiveChat /
canHideComment / canDeleteComment / canReply / canPin / canBanUser /
canTimeoutUser / canEditOwnReply). The service refuses to act on
disabled connectors and refuses to build moderation commands when the
matching permission is absent (`blockerReason = permission_missing_<key>`).

### Message safety scoring

`evaluateAudienceSafety` produces deterministic regex-driven scores
across 13 axes (toxicity, spam, abuse, hate, sexual content, violence,
self-harm, misinformation, PII, copyright, impersonation, bot,
relevance). Any axis ≥ 0.5 lands a `reasonCode` and forces the message
into a moderation path:

- spam / bot_pattern → `hide`
- threats / hate → `ban_if_allowed`
- abuse → `timeout_if_allowed`
- PII / impersonation → `delete_if_allowed`
- everything else → `moderator_review`

Author identity is SHA-256 hashed before persistence and metadata is
stripped of email / phone / IP / address / tokens / secrets via
`redactAudienceMetadata()`.

### Gift / superchat / tip handling

- A safe paid message in a normal-sensitivity story →
  `robot_acknowledge` + `audience.gift_safe_acknowledged` event.
- Any unsafe paid message → moderator queue, never acknowledged.
- A safe paid message during a sensitive story →
  `moderator_review` with `sensitivityOverride:true`. No celebratory
  overlay, no playful shapeshift, no aggressive gesture.

### Robot / anchor reaction rules

The robot/anchor reaction builders refuse to speak unless the matching
`allowedForRobotSpeech` / `allowedForAnchorSpeech` flag is true on the
`AudienceSafetyDecision`. During sensitive stories only moderator notes
and verified questions reach the anchor; everything else is held for
human review.

### Screen-display rules

Screen routing (`routeSafeHighlightToScreen`) refuses any decision with
`allowedForScreenDisplay:false`, calls `failClosedAudienceAction`, and
emits `fallback.triggered`. No PII, abuse, misinformation, or
copyrighted text dump ever reaches a screen.

### Why moderation commands are simulation-only in this phase

Every `AudienceModerationCommand` ships with
`commandMode:"simulation_only"`, `platformSendAllowed:false`,
`realSendAllowed:false`, `executionEnabled:false`, and the locked
`AUDIENCE_SAFETY_ENVELOPE_LOCKED` envelope. The service NEVER calls a
platform API — `simulateAudienceModerationCommand` returns a
summary string only. Tests stub `globalThis.fetch` and assert zero
calls for YouTube / Facebook / X / Telegram.

### Platform Gateway (Task #374)

`server/services/audience-platform-gateway-service.ts` is the single
gated path that may dispatch a moderation command to a real platform.
Every other layer remains simulation-only.

Connector model adds three fields (default false / null):
- `platformSendApproved: boolean` — root-admin opt-in per account.
- `platformSendApprovedBy: string | null` — admin id of the approver.
- `platformSendApprovedAt: string | null` — ISO timestamp of approval.

`buildAudienceModerationCommand` now stamps each command with a
`decisionFingerprint` (SHA-256 over `decisionId + action + sorted
reasonCodes + sorted scores + allow flags + cAudienceSafety`). The
command record itself still carries `platformSendAllowed:false` — the
flag never flips at the command level. The gateway is the only thing
that may dispatch.

The gateway refuses to dispatch unless **all** of the following are true:

1. `cmd.commandMode === "future_platform_gateway"`
   (caller must explicitly opt the command into the gated path).
2. `cmd.commandAllowed === true` and the connector still has the
   required platform permission (`canHideComment`, `canDeleteComment`,
   …) when re-checked at send time.
3. `connector.platformSendApproved === true` (per-account root-admin
   opt-in) and `apiAccessMode` is `official_api` or `webhook`
   (never `manual_import` / `disabled`).
4. The live decision's fingerprint matches `cmd.decisionFingerprint`
   — any change to scores / reason codes / allow flags blocks the send
   with `decision_changed_since_build`.
5. The live decision still has `allowedForModerationAction:true` (or
   the action is `no_action`) and no unresolved `requiresHumanReview`
   that the command flagged for human approval.
6. The per-platform per-minute rate limit budget is not exhausted
   (YouTube 60 / Facebook 60 / X 50 / Telegram 30 / Instagram 60 /
   TikTok 30 / LinkedIn 30 / Reddit 60 / custom 30). Buckets reset
   after 60 s; no bypass path.
7. The platform adapter supports the requested action (otherwise
   `action_not_supported_by_adapter`). Adapters describe the official
   endpoints only — YouTube Data API, Facebook Graph, X v2, Telegram
   Bot API. No scraping, no unofficial endpoints.

Live HTTP dispatch is disabled by default. The gateway only performs a
real `fetch` when `process.env.AUDIENCE_GATEWAY_LIVE_DISPATCH === "true"`
AND the per-platform token has been wired in by a future hardened
deploy. In every other case the gateway returns `simulated:true` and
emits `audience.gateway_send_simulated`. A blocked request emits
`audience.gateway_send_blocked` with the explicit `reason`. A real
dispatched request (only reachable behind the env opt-in) emits
`audience.gateway_send_dispatched`.

Admin routes (root-admin + CSRF) added on the same base paths:

- `POST  /connectors/:connectorId/platform-send-approval` — toggle the
  per-connector opt-in.
- `POST  /command/:commandId/gateway-send` — attempt a gated send.
- `GET   /connectors/:connectorId/rate-limit` — current bucket state.

Tests (`tests/audience-platform-gateway.test.ts`, 12 cases) assert:

- Refuses unapproved connectors.
- Dispatches (as simulation) when fully approved.
- Refuses `simulation_only` commands.
- Refuses when connector lacks the required permission.
- Refuses when the decision changed since command build.
- Enforces the per-platform rate limit (telegram = 30/min).
- Refuses unsupported actions per adapter (e.g. instagram is noop).
- Refuses connectors with `apiAccessMode=manual_import/disabled`.
- Never calls `fetch` in the simulation phase (stubbed fetch sees 0
  calls).
- Emits `audience.gateway_send_blocked` on refusal.
- `approvePlatformSend` round-trips correctly.
- Command still has `platformSendAllowed:false` and carries a
  32-char `decisionFingerprint`.

### Bus events (Task #371)

`audience.message_received`, `audience.message_filtered`,
`audience.highlight_approved`, `audience.gift_received`,
`audience.gift_safe_acknowledged`, `audience.spam_blocked`,
`audience.abuse_blocked`, `audience.misinformation_blocked`,
`audience.moderation_simulated`, `audience.robot_response_created`,
`audience.screen_highlight_created`. The legacy `chat.*` names remain
in `BusEventName` for backwards compatibility but the audience layer
emits only `audience.*`. Display subscribers may only receive the
display-safe subset (`audience.highlight_approved`,
`audience.screen_highlight_created`, `audience.gift_safe_acknowledged`).

### Confidence vector contribution

Each decision yields `cAudienceSafety` (clean → 1.0, sensitivity-review
→ 0.6, any hard blocker → 0.0). Because `C_total` uses MIN, a single
blocked audience message is enough to push a take plan into the
`reject` tier band.

### Admin surface

`/admin/omni-channel-audience` exposes connected channels (with
permissions and apiAccessMode badges), the live audience queue,
gift/superchat queue, moderator-review queue, blocked messages, and
the simulated-moderation command log. All buttons hit the
`/api/admin/newsroom/audience/*` routes which are root-admin + CSRF
gated.

### Tests

`tests/omni-channel-audience.test.ts` (22 cases) covers: YouTube spam
blocked, Facebook abuse blocked, X misinformation blocked, Telegram
PII blocked, unsafe gift not acknowledged, safe gift acknowledged
only in non-sensitive state, sensitive-story playful gift reaction
disabled, PII message refused at screen-route, robot cannot read
abusive message, anchor cannot read unsupported BREAKING claim,
platform action blocked when permission missing, every moderation
mode (hide/delete/timeout/ban/reply) remains simulation-only,
`platformSendAllowed:false` by default, no real YouTube/Facebook/X/
Telegram API calls (stubbed fetch asserts zero calls), no social
posting, no publishing, no private admin data leak (author hashing +
metadata redaction), `C_total` uses `C_audience_safety` (MIN), and
`safetyEnvelope` unchanged across decisions/commands.
