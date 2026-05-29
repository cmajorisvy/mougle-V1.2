# R10 — 3D/4D/R3F Safety + Perf-Budget Gates (Task #755)

## What this gate does

Every `npm test` run now executes the R10 invariant suite
(`tests/r10-r3f-3d-4d-safety-invariants.test.ts`) alongside the existing
suites, and follows it with the perf-budget probe
(`scripts/r10-perf-budget-check.mjs`). The same perf-budget probe also runs
from `scripts/post-merge.sh` after `npm install`, so a regression fails the
post-merge hook.

Both checks are pure-Node (no DB, no network) and finish in well under a
second on a clean checkout.

What the gates assert:

- `publicUrl` is always `null` for production-house 3D assets (Drizzle
  default + CHECK constraint + route serializer).
- Signed preview URLs are never persisted; TTL clamps to ≤900 s.
- Provider-host allowlist for `<model-viewer>`/R3F asset loaders.
- No writes under `PUBLIC_OBJECT_SEARCH_PATHS` from the production-asset
  storage wrapper.
- Approval-state machine is terminal at `approved_internal` (no
  `approved_public` references in code).
- Canvas defaults (DPR clamp, antialias, tone mapping) match the locked
  presets.
- Admin dashboard surfaces the 3D/4D/Unreal zone links.

## Expected behavior on R3F module size growth

The perf-budget probe gzips the shipped R3F bundle and asserts it stays
under the locked ceiling (today: 37 762 / 92 160 B gzip). **A future R3F
module size regression — for example, pulling in another `@react-three/*`
helper, a heavier `three` import path, or shipping uncompressed GLBs — is
expected to trip this gate.** That is the gate doing its job, not a
flaky test.

When the gate trips:

1. Read the diff: `node scripts/r10-perf-budget-check.mjs` prints the
   current vs. budgeted byte count.
2. If the size growth is legitimate (new approved 3D surface), raise the
   ceiling in `scripts/r10-perf-budget-check.mjs` in the same PR that
   adds the dependency, and reference the change in your task report.
3. If the size growth is accidental (a transitive import), revert or
   replace the import.

Do not silence the gate by removing it from `npm test` or
`scripts/post-merge.sh`. The gate exists because R3F bundle size directly
affects first-load on the 3D surfaces.

## Where this is wired

- `package.json` → `scripts.test` appends
  `tests/r10-r3f-3d-4d-safety-invariants.test.ts` and chains
  `&& node scripts/r10-perf-budget-check.mjs` after the existing
  `safety-lint.cjs` step.
- `scripts/post-merge.sh` runs `node scripts/r10-perf-budget-check.mjs`
  after `npm install` and exits non-zero on failure (`set -e`).
- `.github/workflows/test.yml` runs `npm ci && npm test` on every pull
  request against `main`, so the R10 invariants and perf-budget gate
  block merge before the post-merge hook ever runs (Task #760).

## Related

- R10 suite report:
  [`docs/reports/R10_R3F_3D_4D_E2E_SAFETY_PERFORMANCE_REPORT.md`](../reports/R10_R3F_3D_4D_E2E_SAFETY_PERFORMANCE_REPORT.md)
- Production-house 3D asset library section in `replit.md`.
