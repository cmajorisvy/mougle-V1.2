# Cleanup R7B-E2E Test-Seeded Assets / Rigs Runbook

**Task:** #896 — Auto-clean test-seeded approved avatars so the admin
library stays tidy.

**Script:** [`scripts/cleanup-r7b-e2e-seeds.ts`](../../scripts/cleanup-r7b-e2e-seeds.ts)

## Why

Every R7B-E2E-Real run
([`tests/e2e/permanent-avatars.spec.ts`](../../tests/e2e/permanent-avatars.spec.ts))
seeds 2 approved-internal asset+rig pairs + 1 unapproved rig to drive
its 10 checkpoints. Each row is a cheap (≤200 B JSON-only) GLB, and the
spec intentionally leaves them behind — but in a long-running dev DB
they slowly accumulate as `r7b-e2e`-named approved rows in
`/admin/3d-assets` and `/admin/3d-rigs`. This script keeps the
operator's library tidy without changing the spec's assertions.

## What it does

For each of `production_assets` and `production_rigs`:

1. Selects rows where `approvalGate = 'approved_internal'` AND
   `name LIKE '<prefix>%'` (default prefix `r7b-e2e`) AND
   `createdAt < now() - <hours>h` (default 24 h).
2. If the row is bound by any permanent avatar
   (`countPermanentAvatarsReferencingAsset` / `…Rig` > 0), it is
   **skipped** and reported. This mirrors the 409
   `asset_referenced_by_permanent_avatar` /
   `rig_referenced_by_permanent_avatar` guard in the admin routes.
3. Otherwise: `storage.archiveAsset` / `archiveRig`, then
   `deleteAssetBytes` / `deleteRigBytes` (object storage first — if it
   fails the row stays archived for a future retry), then
   `storage.deleteArchivedAsset` / `deleteArchivedRig` to cascade DB
   rows and write the moderation-log trail.

## Usage

```bash
# Default — 24 h cutoff, prefix r7b-e2e
tsx scripts/cleanup-r7b-e2e-seeds.ts

# Report only — no mutations
tsx scripts/cleanup-r7b-e2e-seeds.ts --dry-run

# Override cutoff window (hours)
tsx scripts/cleanup-r7b-e2e-seeds.ts --hours=48

# Override name prefix (matches via SQL LIKE 'prefix%')
tsx scripts/cleanup-r7b-e2e-seeds.ts --prefix=r7b-e2e
```

Exit code is non-zero if any row errored.

## Output

The script prints a per-row line for each archive/delete/skip and a
final JSON summary:

```json
{
  "assets": {
    "scanned": 4,
    "archived": 4,
    "deleted": 4,
    "archivedSkipped": 0,
    "skippedReferenced": 0,
    "errors": []
  },
  "rigs": { … },
  "cutoff": "2026-05-21T20:39:15.790Z"
}
```

## Safety notes

- **Admin routes are not used.** The script invokes the same storage +
  object-storage primitives that the routes do (`storage.archiveAsset`,
  `deleteAssetBytes`, `storage.deleteArchivedAsset`, and the rig
  equivalents), so the moderation-log trail and object-storage
  delete-first ordering are preserved.
- **Actor recorded as `system-cleanup-r7b-e2e`** with reason
  `"Task #896 automated cleanup of test-seeded r7b-e2e rows"` so the
  audit trail is unambiguous.
- **Permanent avatars are never touched.** Rows bound by an avatar are
  skipped and reported; resolve by rebinding or deleting the avatar
  first, then re-run the script.
- **Cutoff defaults to 24 h** to ensure no in-flight E2E run's seed is
  swept mid-test.
- The script targets only `approvalGate='approved_internal'`. Rows that
  the test left in earlier lifecycle states (e.g. the deliberately
  unapproved rig in checkpoint 2) are not selected by this filter and
  will not be deleted by this script.

## When to run

Manually as part of dev-DB hygiene, or on a cron / scheduled CI job. A
typical dev cadence is "after the E2E suite has been green for a day"
— the 24 h cutoff makes back-to-back runs idempotent.

## Automatic schedule (Task #897)

In addition to the manual script, the server runs the cleanup on a
daily cadence via
[`server/services/cleanup-r7b-e2e-seeds-scheduler.ts`](../../server/services/cleanup-r7b-e2e-seeds-scheduler.ts).

- **Bootstrap:** the scheduler is started from `server/index.ts`
  inside the `WORKER_ENABLED === "true"` block (alongside the other
  daily sweeps) and stopped via the shared shutdown registry.
- **Cadence:** first run 10 minutes after boot, then every 24 hours.
- **Per-tick behaviour:** invokes `runCleanup({ hours, prefix })` and
  writes a one-line `cleanup.r7b_e2e.summary` row to the
  production-house audit log (visible in the Scheduled Cleanup History
  panel). If the run throws, a `cleanup.r7b_e2e.error` row is written
  instead.
- **Failure visibility:** any non-empty `errors[]` from the JSON
  summary — or an unexpected throw — fires a
  `cleanup_r7b_e2e_failure` row in `platform_alerts` via
  `panicButtonService.createAlert`, so it surfaces on the founder
  dashboard. A per-process dedup window (default 1 h) prevents a
  flapping cleanup from spamming alerts.
- **In-memory `lastRun`:** `getCleanupR7bE2eLastRun()` returns the
  `{ startedAt, finishedAt, ok, summary, error? }` of the most recent
  tick for ad-hoc admin inspection.

### Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `CLEANUP_R7B_E2E_ENABLED` | `true` | Set to `false`/`0` to disable the scheduler (manual script still works). |
| `CLEANUP_R7B_E2E_INTERVAL_HOURS` | `24` | Tick cadence in hours (minimum 1). |
| `CLEANUP_R7B_E2E_INITIAL_DELAY_MS` | `600000` (10 min) | Delay before first run after boot. |
| `CLEANUP_R7B_E2E_HOURS` | `24` | Cutoff window passed to `runCleanup`. |
| `CLEANUP_R7B_E2E_PREFIX` | `r7b-e2e` | Name prefix filter passed to `runCleanup`. |
| `CLEANUP_R7B_E2E_FAILURE_DEDUP_MS` | `3600000` (1 h) | Cooldown between consecutive failure alerts. |

### CI / post-E2E

The manual script remains the recommended hook for CI: run
`tsx scripts/cleanup-r7b-e2e-seeds.ts` immediately after the
Playwright suite so the cleanup happens on the CI database it ran
against, instead of waiting for the next scheduler tick on the live
worker.
