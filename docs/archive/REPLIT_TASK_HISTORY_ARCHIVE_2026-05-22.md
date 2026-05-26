# Replit.md Task History Archive — 2026-05-22

This archive preserves verbose task-history entries that were moved out of
`replit.md` on 2026-05-22 (H2 housekeeping task) to keep the agent-facing
project guide concise. **Nothing was deleted — only relocated.**

The full original `replit.md` is recoverable from git history at the commit
just before H2 (`2f4551f` / T4 polish merge) and onward.

---

## Index of moved entries

The following six "Core Features & Systems" bullets were moved verbatim from
`replit.md` § "Core Features & Systems" into this archive. The trimmed
`replit.md` keeps short one-line pointers in their place.

1. Audience Moderation Retention Sweeper (incl. Tasks #407, #421)
2. Archive Deletion Alert Snooze (Tasks #474, #562)
3. Audit-Email Failure-Alert Snooze History (Task #613)
4. Audience Audit-Export Notifier (Tasks #396, #425, #448)
5. Omni-Channel Audience Safety Layer
6. Neural Newsroom Automation + Broadcast-Grade Virtual Screen Director

The other "Core Features & Systems" bullets (Hybrid Intelligence Network,
TCS, Reputation & Economy, AI Agent Systems, Personal AI Agent, CICL,
Authentication, Flywheels, Mougle Labs, Legal Safety Stack, Risk Framework,
Healthy Engagement, Trust Ladder, Universal Agent Privacy, Progressive
Intelligence Roadmap, Intelligence Stack, Pricing Engine, App Export, AI
CFO, Phase Transition, Founder Debug Stack, Founder Panic Button, Platform
Stability Triangle, GCIS, Adaptive Policy Governance, Unified
Communication & Support, Autonomous Operations Stack, Social Distribution
Hub, Viral BondScore, Inevitable Platform Monitor, Authority Flywheel,
Silent SEO, $0 Marketing Engine, On-Demand App Dev, PNR Monitor, Founder
Minimal Workday, Zero-Support Learning, Growth Autopilot, External Agent
API, Debate-to-Project Pipeline, PDF Generation Engine, Automated AI News
Ingestion) were already concise single-line entries and **remain in
`replit.md`**. They are not duplicated here.

---

## 1. Audience Moderation Retention Sweeper

Daily retention policy for the three `audience_*` audit tables.
`server/services/audience-retention-service.ts` deletes rows from
`audience_messages` (by `receivedAt`), `audience_safety_decisions` (by
`decidedAt`) and `audience_moderation_commands` (by `createdAt`) older
than a configurable window. `audience_channel_connectors` are NEVER
auto-deleted (operational state). Default window is 90 days; precedence
is `runRetentionSweep(arg)` > admin override in
`system_settings.audience_retention_days` > env
`AUDIENCE_RETENTION_DAYS` > 90. Scheduler cadence comes from
`AUDIENCE_RETENTION_INTERVAL_HOURS` (default 24) and starts in the
`WORKER_ENABLED` boot path with a
`registerShutdown("audience-retention", …)` stop hook. Admin endpoints
under `/api/admin/newsroom/audience/retention/{stats,sweep,override,restore,restore-log}`
(root-admin + CSRF) expose the dashboard counter, manual sweep trigger,
override knob, and archive restore (**Task #407**: takes `{ archivePath }`,
downloads + gunzips the gzipped JSONL via an injectable
`AudienceArchiveReader`, infers the target table from the
`audience-archive/<messages|decisions|commands>/` path segment, re-inserts
each row with `onConflictDoNothing()`, and writes a who/what/how-many
audit entry into an in-memory restore log surfaced by
`/retention/restore-log` and the Retention Mode card). Manual CLI is
`tsx scripts/run-audience-retention-sweep.ts [--days=N]`. Tests:
`tests/audience-retention.test.ts` (13 cases) verifies default window,
connector preservation, override persistence, stats counter, per-run
override, archive write/mixed-mode/failure semantics, restore round-trip
(delete → restore → idempotent re-restore), restore path-validation
rejection, and restore reader-failure audit logging. **Task #421**: also
prunes `audience_gateway_events` on the same schedule
(`gatewayEventsPruned` in the sweep result), and the gated moderation
gateway persists every `audience.gateway_send_{simulated,dispatched,blocked}`
emission via `server/services/audience-gateway-event-log-service.ts` so
`/api/admin/newsroom/audience/gateway/activity` can paginate by
`from`/`to`/`limit`/`offset` from the DB instead of the in-memory bus
history. Schema in `shared/omni-channel-audience-schema.ts`
(`audience_gateway_events`); DDL in
`scripts/migrate-omni-channel-audience.ts`; tests in
`tests/audience-gateway-event-log.test.ts` (5 cases).

---

## 2. Archive Deletion Alert Snooze (Task #474)

Founders can pause both the upcoming-expiry digest and the post-cleanup
summary for a configurable window without losing recipients, thresholds,
or dedup state. `AudienceArchiveDeletionNotifierConfig` gains
`snoozeUntil: string | null` (capped at 90 days to prevent silent
forever-mute). `setAudienceArchiveDeletionNotifierSnooze({ snoozeUntil,
updatedBy })` validates the timestamp (must parse, must be in the
future, capped at +90d) and never touches recipients/enabled/dedup.
`runUpcomingExpiryDigest` and `notifyPostCleanup` both check snooze
right after the `disabled` gate and return a new `"snoozed"`
`NotifierEventReason` (no email send, dedup state untouched), with a
history entry whose `errorMessage` is `snoozed_until:<iso>` so the
founder can prove an email *would* have fired. Admin route
`POST /api/admin/newsroom/audience/retention/archive/deletion-notifier/snooze`
(root-admin + CSRF) accepts `{ snoozeUntil: ISOstring | null }` — pass
`null` to unsnooze. UI `ArchiveDeletionNotifierCard` exposes
"Snooze 1 day / 1 week / Until DATE" buttons, a destructive-variant
red "Snoozed until …" badge while active, and an Unsnooze button.
Tests: 5 new cases in
`tests/audience-archive-deletion-notifier.test.ts` (21 total) cover
validation, digest+post-cleanup snooze paths, resume after expiry, and
90-day cap.

**Task #562 — persistent snooze-window history**: every snooze window
is logged to `audience_archive_notifier_snooze_log` (schema in
`shared/omni-channel-audience-schema.ts`, DDL in
`scripts/migrate-omni-channel-audience.ts`) with `snoozeId`,
`startedAt`, `endedAt`, `endedReason` (`expired` | `replaced` |
`unsnoozed` | `cleared`), `source` (`manual` | `auto` |
`weekday_window`), full policy snapshot (`policyKind` + extend days /
weekday days+hours), `snoozeUntil`, `createdBy`, and a snapshot of
`suppressedCount` / `suppressedFiles` / `suppressedBytes` taken at
the moment the row closed (so the founder can audit "how much did
the last window swallow"). `setAudienceArchiveDeletionNotifierSnooze`
closes the open row (reason `replaced` or `unsnoozed`) before
resetting counters and opens a fresh row whenever a snooze becomes
active; `evaluateAndMaybeAutoExtendSnooze` closes the open row with
reason `expired` on natural expiry (only when policy != `auto_extend`).
Counters are snapshot from `getRawStoredCounters` so the dashboard
zero-on-expiry behavior doesn't erase the audit value. Read-only admin
route
`GET /api/admin/newsroom/audience/retention/archive/deletion-notifier/snooze-log?limit=N`
(root-admin, bounded 1..50, default 10) returns newest-first. Admin UI
`ArchiveDeletionNotifierCard` shows a "Past snooze windows (last 10)"
section between the snooze controls and the "Recent notifications"
list. The daily audience-retention sweeper calls
`pruneAudienceArchiveDeletionSnoozeLogOlderThan(cutoff)` on the same
audit-window cadence (mirrors connector-rotation + audit-export prune
pattern) — only CLOSED rows older than cutoff are pruned, never an
open snoozed window. Tests: 6 new cases in
`tests/audience-archive-deletion-notifier.test.ts` (27 total) cover
open-on-set, close-on-replace with counter snapshot, close-on-unsnooze,
close-on-natural-expiry via `evaluateAndMaybeAutoExtendSnooze`,
newest-first ordering + limit cap, and prune (closed-only + open-row
safety).

---

## 3. Audit-Email Failure-Alert Snooze History (Task #613)

Every snooze action ("set", "cleared", or lazily-observed "expired")
on the trail-email and history-email failure-alert snoozes is appended
to `audience_audit_email_failure_alert_snoozes` (schema in
`shared/omni-channel-audience-schema.ts`, DDL in
`scripts/migrate-omni-channel-audience.ts`) so founders can audit who
muted which alert long after the live `system_settings` row was
overwritten. `server/services/audit-email-failure-alert-snooze.ts`
writes a "set" row on every successful snooze, a "cleared" row only
when a previously-active snooze was cleared (no-op clears are not
logged), and a deduplicated "expired" row the first time
`isAuditEmailFailureAlertSnoozed` observes a stored window has elapsed
(dedup_key on `(key, snoozeUntil)`). History writes are best-effort
and never block alert dispatch. `listAuditEmailFailureAlertSnoozeHistory(key, limit)`
returns newest-first, bounded 1..50. Admin reads via
`GET /api/admin/newsroom/audience/email-schedule/failure-alert/snooze-history`
and
`…/email-schedule-history/failure-alert/snooze-history` (root-admin);
both audit-email cards in the omni-channel-audience admin UI now
render a "Past snooze actions (last N)" list under the snooze
controls. The audience-retention sweep calls
`pruneAuditEmailFailureAlertSnoozeHistoryOlderThan(cutoff)` on the
same audit-window cadence (mirrors the archive-snooze-log Task #562
prune pattern). Tests: 5 new cases in
`tests/audience-audit-email-failure-alert-snooze.test.ts` (11 total)
cover set→history row, no-op clear suppression + replace-with-clear
logging, lazy expired-on-observe with dedup, per-alertKey isolation,
and prune-older-than-cutoff.

---

## 4. Audience Audit-Export Notifier

Sends a founder/security email the moment someone pulls the
omni-channel audience audit trail (**Task #396**, dedup added in
**#425**). `server/services/audience-audit-export-notifier.ts`
subscribes to the `audience.audit_exported` neural-newsroom bus event
(whose payload now carries the full `AudienceAuditExportRecord` —
actor id/type/role, format, filters, row counts, exportedAt,
exportId) and emails the configured recipient list via
`EmailService.sendAudienceAuditExportNotification` (Resend). Config is
persisted in `system_settings` under `audience_audit_export_notifier`
as `{ enabled, recipients[], minRowCount, suppressedActorIds[],
dedupWindowMs, updatedAt, updatedBy }`. Suppression rules: disabled →
skip, no recipients → skip, actor in `suppressedActorIds` (founder
ids) → skip, `totalRowCount < minRowCount` when `minRowCount > 0` →
skip.

**Dedup (Task #425)**: repeated exports by the same actor with the
same filters within the dedup window are collapsed into a single
email; a follow-up email surfaces "N similar exports suppressed since
T" via new optional `suppressedCount` / `suppressedSince` fields on
the email payload (subject suffix + warning block). Genuinely
different exports bypass the dedup: a new actor, any change to filters
(fromDate / toDate / platform / productionId), or a row-count jump
>= 2x the previous send (`LARGE_ROW_COUNT_MULTIPLIER`). Dedup-window
precedence: admin override `dedupWindowMs` on the config > env
`AUDIENCE_AUDIT_EXPORT_DEDUP_MS` > default 5 minutes; set to `0` to
disable dedup entirely. Send failures are caught and logged so a
broken Resend connection cannot crash the export route, and a failed
send does NOT update the dedup state (so a retry isn't silently
swallowed). Installed once on HTTP-server boot via
`installAudienceAuditExportNotifier()` in `server/index.ts`. Admin
routes `GET/PUT /api/admin/newsroom/audience/export-notifier`
(root-admin + CSRF) under the existing audience routes file expose the
config to the admin UI (PUT now accepts optional `dedupWindowMs`,
bounded 0..24h). Tests:
`tests/audience-audit-export-notifier.test.ts` (19 cases) cover
default config, recipient/actor normalization,
disabled/no-recipients/suppressed/below-threshold/sent paths, send
failure non-throw, end-to-end bus → email via `recordAuditExport`,
dedup behavior (collapse, bypass on new actor / new filters / large
row-count jump, suppressed-count surfaced on next send,
`dedupWindowMs=0` disables, admin override beats env), and durable
history (DB-backed newest-first listing with limit cap, rows persist
for disabled exports, and `pruneAuditExportNotificationsOlderThan(cutoff)`
drops rows older than the audit retention window).

**Task #448 — durable history**: the in-memory ring buffer was
replaced by a Postgres-backed table
`audience_audit_export_notifications` (schema in
`shared/omni-channel-audience-schema.ts`, DDL in
`scripts/migrate-omni-channel-audience.ts`). `recordHistory` now
async-inserts a row capturing exportId, actor (id/type/role), format,
totalRowCount, thresholdRowCount, thresholdExceeded, recipients,
notified, reason, isTest, errorMessage, occurredAt.
`GET /api/admin/newsroom/audience/export-notifier/history?limit=N`
awaits `getAuditExportNotificationHistory` which reads newest-first
capped at `HISTORY_MAX=50`. The audience retention sweeper silently
calls `pruneAuditExportNotificationsOlderThan(cutoff)` on the same
daily cadence (mirrors the audience-gateway-event-log + restore-log
pattern) so the table cannot grow without bound; prune failures are
logged but do not poison the audit-table sweep result.

---

## 5. Omni-Channel Audience Safety Layer

Cross-platform audience moderation replacing the YouTube-only chat
safety stack. Service
`server/services/omni-channel-audience-safety-service.ts` ingests
audience messages from YouTube / Facebook / X / Telegram / Instagram /
TikTok / LinkedIn / Reddit / `custom` adapters via
`AudienceChannelConnector` records (permissions + `apiAccessMode`);
scores them deterministically across 13 axes (toxicity, spam, abuse,
hate, sexual content, violence, self-harm, misinformation, PII,
copyright, impersonation, bot, relevance) into an
`AudienceSafetyDecision` with explicit `allowedForRobotSpeech` /
`allowedForAnchorSpeech` / `allowedForScreenDisplay` flags and a
`cAudienceSafety` value (clean → 1.0, sensitivity-review → 0.6, any
hard blocker → 0.0) that flows into the newsroom MIN-based confidence
vector. Gifts/superchats/tips are acknowledged only when safe AND the
story sensitivity is `normal`. Author IDs are SHA-256 hashed; raw
metadata is stripped of email/phone/IP/address/tokens by
`redactAudienceMetadata`. `AudienceModerationCommand` records always
carry `commandMode:"simulation_only"`, `platformSendAllowed:false`,
`realSendAllowed:false`, locked `AUDIENCE_SAFETY_ENVELOPE_LOCKED`
envelope — the service never calls a platform API in this phase. Bus
events: `audience.message_received` / `audience.message_filtered` /
`audience.highlight_approved` / `audience.gift_received` /
`audience.gift_safe_acknowledged` / `audience.spam_blocked` /
`audience.abuse_blocked` / `audience.misinformation_blocked` /
`audience.moderation_simulated` / `audience.robot_response_created` /
`audience.screen_highlight_created` / `audience.audit_exported`
(display subscribers see only the highlight/gift-safe subset). Every
call to `GET /api/admin/newsroom/audience/export` writes a meta-audit
row to `audience_audit_exports` capturing the actor (id/type/role),
filters, format, per-section row counts and timestamp — logged even
when the export returns zero rows, with the assigned `exportId` echoed
as the `X-Audit-Export-Id` response header.
`GET /api/admin/newsroom/audience/export-log` returns recent
meta-audit rows and the admin UI's "Audit Export History" card
surfaces the last N exports. Schemas in
`shared/omni-channel-audience-schema.ts`; optional DDL in
`scripts/migrate-omni-channel-audience.ts`. Admin routes under
`/api/admin/newsroom/audience/*` (root-admin + CSRF), UI at
`/admin/omni-channel-audience`. Tests:
`tests/omni-channel-audience.test.ts` (23 cases). Doc section appended
to `docs/reports/NEURAL_NEWSROOM_AUTOMATION_AND_SCREEN_DIRECTOR_REPORT.md`.

---

## 6. Neural Newsroom Automation + Broadcast-Grade Virtual Screen Director

Orchestration + safety layer for the 24/7 AI newsroom. ApexLoad
Optimizer scores stories and routes them across five production tiers
(`text_only → cinematic_4d_treatment`). PreCognition Planner emits
per-beat screen / anchor / robot / fallback plans before each beat
plays. FlowState Conductor drives an explicit state machine
(`idle / calm_read / focused_explainer / breaking_alert /
sensitive_story / chat_reaction / fallback_mode / kill_switch`). The
Neural Newsroom Bus (`server/services/neural-newsroom-bus.ts`) carries
audited `story.*` / `apexload.*` / `precognition.*` / `flowstate.*` /
`anchor.*` / `robot.*` / `screen.*` / `fallback.*` / `kill_switch.*`
events with admin-field redaction for display subscribers. Every
directorial action becomes a `ScreenTakePlan` validated by the
Broadcast-Grade Screen Safety service against 17 deterministic checks
— any failure fails closed to the world-map preset + safe lower-third.
Confidence vector uses **MIN** (not average) across `C_source /
C_verification / C_license / C_screen_match / C_sensitivity /
C_audience_safety / C_fallback`, with tier bands ≥0.90 auto /
0.75–0.90 assisted / 0.50–0.75 review / <0.50 reject. Schemas
(`screen_presets`, `screen_take_plans`, `screen_safety_validations`)
live in `shared/neural-newsroom-schema.ts` and are migrated via
`scripts/migrate-neural-newsroom.ts` against `SUPABASE_DB_URL`. All
rows carry `draft` + `admin_only_internal` + locked safety envelope.
Doc: `docs/reports/NEURAL_NEWSROOM_AUTOMATION_AND_SCREEN_DIRECTOR_REPORT.md`.
Admin routes under `/api/admin/neural-newsroom/*` (root-admin + CSRF).

---

## Recovery

To recover the pre-H2 `replit.md` verbatim:

```bash
git show 2f4551f:replit.md > /tmp/replit-pre-h2.md
```

(Commit `2f4551f` was the T4 polish merge — the last commit before H2 trim.)
