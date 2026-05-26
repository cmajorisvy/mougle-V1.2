# Task #805 — 3D asset orphan sweep flapping digest

## Problem
The 3D asset orphan sweep (`server/services/production-asset-orphan-alert-service.ts`) only paged founders **once** when the flapping latch first flipped (false → true). If something kept leaving archived rows with missing object bytes for days on end, no one was re-pinged because the latch never released. The founder dashboard reflected the bad state, but nobody re-checks the dashboard.

## Change
Added a recurring **flapping digest** that fires while the latch is stuck:

- New alert type `production_asset_orphan_sweep_flapping_digest` so the founder console can tell "the latch just flipped" apart from "the latch has been stuck for N days."
- `check()` now calls `maybeFireFlappingDigest()` while `flapping === true`, which:
  - reads a last-sent receipt stored in `system_settings` under `production_asset_orphan_sweep_flapping_digest_last_sent_at`,
  - skips if less than `flappingDigestIntervalMs` (default 24h, overridable via `PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_INTERVAL_MS`) has elapsed,
  - checks the founder snooze (shared audit-email failure-alert snooze helper, 90-day cap, append-only history table), and
  - otherwise fires a `platform_alerts` row + emails every active root admin, then writes the new receipt.
- When the latch releases (`flapping === false`), `resetFlappingDigestOnRecovery()` auto-acknowledges every open digest alert with an `autoResolved` payload and clears the receipt so a future stuck episode starts cleanly.
- `getSweepStatus()` now surfaces `flappingDigestIntervalMs`, `flappingDigestLastSentAt`, `flappingDigestNextEligibleAt`, and `flappingDigestSnoozeUntil` so the admin UI can display digest cadence + snooze state.

## Snooze surface
Reuses the existing audit-email failure-alert snooze pattern (Task #560 / #613) under key `production_asset_orphan_sweep_flapping_digest_snooze`. Two new admin routes:

- `GET  /api/admin/production-assets/orphans/sweep/flapping-digest/snooze` → `{ snooze, history }`
- `POST /api/admin/production-assets/orphans/sweep/flapping-digest/snooze` → set or clear (body `{ snoozeUntil: ISO | null }`)

Snooze writes are persisted to `audience_audit_email_failure_alert_snoozes` for audit.

## Tests
`tests/production-asset-orphan-sweep-flapping-digest.test.ts` locks the digest semantics across 8 phases: first fire on stuck → no spam inside interval → re-fire after interval → snooze suppresses without advancing the receipt → unsnooze resumes → recovery clears receipt → fresh stuck episode pages again.

## Files
- `server/services/production-asset-orphan-alert-service.ts`
- `server/routes/admin/production-assets.ts`
- `tests/production-asset-orphan-sweep-flapping-digest.test.ts`
