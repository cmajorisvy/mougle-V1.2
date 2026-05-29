# Full Test Audit Report - Codex - 2026-05-23

## 1. Executive Summary

Codex performed a reporting-only test audit on branch `codex/full-test-audit-report`.

Final verdict: **not ready** for merge/go-live without caveats.

Primary blockers:

- TypeScript typecheck fails with existing project-wide errors across Remotion JSX, admin UI query typing, production-house typing, broadcast route typing, and production asset route typing.
- `scripts/safety-lint.cjs` fails with six external-publish safety violations in `server/services/audience-platform-gateway-service.ts`.
- The configured full `npm test` and `npm run check` paths were not run because the repo documentation states the Node test suite uses the shared Supabase pooler, and this audit was not approved to write to Supabase Pro.
- A safe local subset of package-listed Node tests ran and produced 459 passing subtests and 33 failing subtests. Many failures are safety skips in practice because files indirectly import `server/db.ts` and stop at the missing `SUPABASE_DB_PASSWORD` guard before any DB connection/write can occur.
- Playwright E2E tests are configured, but were not executed because the repo's E2E documentation requires an app server plus migrated database state, including `db:push`, which is forbidden for this task.

Positive findings:

- Production build passed when rerun outside the filesystem sandbox.
- R10 R3F performance budget check passed.
- 24 package-listed local test files completed without file-level failures, including admin auth/order, route collision guards, newsroom pure services, schedule helpers, R3F safety invariants, shutdown registry, and env validation.
- No database commands were run and no Supabase writes occurred.

## 2. Git Branch, Base SHA, Test SHA

| Item | Value |
|---|---|
| Branch | `codex/full-test-audit-report` |
| Base branch | `main` |
| Base SHA at branch creation | `0034761f863f053557c99ad2504bf10b5b6b3b01` |
| Test SHA | `0034761f863f053557c99ad2504bf10b5b6b3b01` |
| Report file | `docs/reports/FULL_TEST_AUDIT_REPORT_CODEX_2026-05-23.md` |

## 3. Environment Summary

| Item | Value |
|---|---|
| OS | Microsoft Windows 10.0.26100, x64 |
| Node used for audit | `v24.16.0` from `C:\Program Files\nodejs\node.exe` |
| npm used for audit | `11.13.0` from `C:\Program Files\nodejs\npm.cmd` |
| Codex desktop path/version signal | `OpenAI.Codex_26.519.5221.0_x64__2p2nqsd0c76g0`; `codex.exe --version` could not run because Windows returned access denied |
| Codex workspace dependency bundle | `26.521.10419` |
| Git executable | `C:\Program Files\Git\bin\git.exe` |
| Dependency state | `node_modules` was absent initially; `npm ci` from the existing lockfile was approved and completed on retry |

Dependency setup notes:

- First `npm ci` attempt failed because npm lifecycle scripts resolved an old `node` earlier on PATH and `esbuild/install.js` hit `SyntaxError: Unexpected token {`.
- Second `npm ci` passed after pinning PATH to `C:\Program Files\nodejs`.
- npm install audit summary reported `25 vulnerabilities (15 moderate, 10 high)`. No `npm audit` or `npm audit fix` command was run.

## 4. Test Inventory

### Scripts Available

| Script | Command | Audit decision |
|---|---|---|
| `dev:client` | `vite dev --port 5000` | Not run; dev server not needed for report |
| `dev` | `NODE_ENV=development tsx server/index.ts` | Not run; can start server and DB-backed services |
| `build` | `tsx script/build.ts` | Run |
| `start` | `NODE_ENV=production node dist/index.cjs` | Not run |
| `check` | `tsc && npm test` | Skipped; `tsc` was run separately and failed; `npm test` includes DB/Supabase-backed tests |
| `test` | `NODE_ENV=test tsx --test ...` | Full command skipped; safe subset run |
| `e2e` | `playwright test` | Not run; E2E requires local app and migrated DB state |
| `e2e:ui` | `playwright test --ui` | Not run |

### Config Files Found

- `vite.config.ts`
- `playwright.config.ts`
- No `vitest.config.*`
- No `cypress.config.*`
- No `vitest` binary installed

### Test Files Found

| Category | Count / location | Notes |
|---|---:|---|
| Node `.test.ts` / `.spec.ts` files | 158 under `tests/` excluding `tests/e2e/` | Includes unit, service, route, API, DB-backed, and safety tests |
| Package-listed Node test files | 93 from `package.json` `test` script | 39 directly matched DB/Supabase write/connect patterns; 54 selected for local-only subset |
| E2E/browser specs | 13 Playwright files listed by `playwright test --list` | 40 tests listed, including setup project |
| Cypress specs | 0 | No Cypress config found |
| Vitest tests/config | 0 configured | Vitest not installed/configured |

### Unit Tests Found

Representative unit/pure areas found:

- Newsroom zod, clustering, claim extraction, package/data builders.
- Render manifest, SRT/MP4 guards, filename/path helpers.
- Safety harness, static safety lint fixture checks, R10 R3F/3D/4D safety invariants.
- Broadcast schedule, preview, fallback view, and helper logic.
- Admin auth ordering and reserved route collision guards.
- Shutdown registry and env validation.

### Integration/API Tests Found

Representative API/integration areas found:

- Admin video-render auth/download routes.
- Broadcast cover/media sweep and fallback preset routes.
- Audience audit/export/email/gateway/retention routes.
- Production asset storage/delete/orphan sweep/relink routes.
- R7B cleanup and permanent-avatar route/provider isolation tests.
- Safety DB persistence tests for playout and omni-channel audience.

Many of these are DB-backed and were not executed against Supabase Pro.

### E2E Tests Found

Playwright lists 40 tests in 13 files, including:

- Admin auth setup.
- Admin dashboard command center.
- Agent passport and UI passport flows.
- Cover/media sweep flapping UI.
- Coverage create-view-from-gap UI.
- Orphan reconcile UI flows.
- Permanent avatars R7B E2E real flow.
- R10 R3F/3D/4D route smoke and canvas probes.

## 5. Commands Run

| Command | Status | Notes |
|---|---|---|
| `git status --short --branch` | PASS | Clean at start |
| `git switch -c codex/full-test-audit-report` | PASS after escalation | Initial sandbox attempt could not create branch ref directory |
| Read package/config/test/docs files | PASS | Read-only |
| `npm ci` | FAIL then PASS | First attempt used old PATH node; retry with modern Node PATH passed |
| `node --version`, `npm --version` | PASS | Node `v24.16.0`, npm `11.13.0` |
| OS/Codex version probes | PARTIAL | OS fallback worked; `codex.exe --version` access denied |
| Static test inventory PowerShell scan | PASS | Identified package-listed safe subset and DB-touch files |
| `tsc --noEmit` | FAIL | Existing TypeScript errors |
| `npm run build` | FAIL then PASS | First sandbox run failed with Vite access denial; rerun outside sandbox passed |
| `node scripts/safety-lint.cjs` | FAIL | 6 safety violations |
| `node scripts/r10-perf-budget-check.mjs` | PASS | R10 gzip/GLB budgets passed |
| `tsx --test ...` safe subset | FAIL | 459 pass, 33 fail |
| `playwright test --list` | PASS after PATH pin | Listed 40 tests; no browser execution |
| `git status --short` | PASS | Clean before report creation |

Skipped commands:

- `npm test`: skipped because the repo's `tests/README.md` states tests share `server/db.ts` and Supabase session pooler; running this without a protected test DB approval could write to Supabase Pro.
- `npm run check`: skipped because it expands to `tsc && npm test`; `tsc` already fails and `npm test` is unsafe under this task.
- `npx vitest run`: skipped because Vitest is not installed/configured.
- `npx vitest run --coverage`: skipped because Vitest/coverage is not installed/configured.
- `npm run lint`: skipped because no `lint` script exists.
- `npx playwright test --reporter=html`: skipped because E2E requires running app, auth fixtures, and migrated DB state; repo docs mention `db:push`, which is forbidden for this task.

## 6. Unit-Wise Results Grouped By Area/Component

### Passing Local Areas

The safe local subset completed 492 subtests total:

- Passed: 459
- Failed: 33
- Skipped by runner: 0
- Duration: about 28-31 seconds across parsed reruns

Files completing without file-level failures:

- `tests/admin-download-auth.test.ts`
- `tests/admin-permission-auth-order.test.ts`
- `tests/admin-reserved-subroutes.test.ts`
- `tests/audience-history-export-filters.test.ts`
- `tests/autopilot-newsroom.test.ts`
- `tests/broadcast-preview-auto-revert.test.ts`
- `tests/broadcast-schedule-coverage.test.ts`
- `tests/broadcast-schedule-diagnostics.test.ts`
- `tests/broadcast-schedule-fallback-view.test.ts`
- `tests/broadcast-schedule-rotation.test.ts`
- `tests/broadcast-schedule-suggest-fix.test.ts`
- `tests/broadcast-schedule-suggest-fix-edit.test.ts`
- `tests/broadcasts-cover-proxy-ssrf.test.ts`
- `tests/newsroom-claim-extraction.test.ts`
- `tests/newsroom-clustering.test.ts`
- `tests/newsroom-data-package-service.test.ts`
- `tests/newsroom-zod.test.ts`
- `tests/production-asset-storage.test.ts`
- `tests/r10-r3f-3d-4d-safety-invariants.test.ts`
- `tests/render-manifest.test.ts`
- `tests/render-mp4-guards.test.ts`
- `tests/safety/base.test.ts`
- `tests/shutdown-registry.test.ts`
- `tests/validate-env.test.ts`

### Failing Local Areas

Failing files from the safe subset:

- `tests/audience-audit-email-preview.test.ts`
- `tests/audit-export-outlier-form.test.ts`
- `tests/audit-export-trend-window-stats-toggle.test.ts`
- `tests/audit-retention-zero-archives.test.ts`
- `tests/broadcast-cover-clear.test.ts`
- `tests/broadcast-cover-recrop.test.ts`
- `tests/broadcast-cover-sweep.test.ts`
- `tests/broadcast-delete-cleanup.test.ts`
- `tests/broadcast-fallback-default-preset-audit-date-range.test.ts`
- `tests/broadcast-fallback-default-preset-audit-paging.test.ts`
- `tests/broadcast-fallback-preset-audit-archive-delete.test.ts`
- `tests/broadcast-media-sweep.test.ts`
- `tests/broadcast-reserved-subroutes.test.ts`
- `tests/broadcast-sweep-archive-counter.test.ts`
- `tests/cinema-control.test.ts`
- `tests/neural-newsroom.test.ts`
- `tests/newsroom-package-builder.test.ts`
- `tests/persistent-storage-service.test.ts`
- `tests/playout-public-live-channel.test.ts`
- `tests/preview-studio-archive-retention.test.ts`
- `tests/render-mp4-route.test.ts`
- `tests/render-srt-route.test.ts`
- `tests/render-srt-service.test.ts`
- `tests/safety/anchor-director.test.ts`
- `tests/safety/broadcast-briefs.test.ts`
- `tests/safety/broadcast-render.test.ts`
- `tests/safety/broll-resolver.test.ts`
- `tests/safety/e2e-newsroom.test.ts`
- `tests/safety/newsroom-packages.test.ts`
- `tests/safety/news-sources.test.ts`

Failure themes:

- Hidden DB import path: several files stopped at `server/config/supabase-db.ts` because `SUPABASE_DB_PASSWORD` was absent. This is safe, expected under the audit constraints, and confirms no Supabase write occurred.
- Node 24/jsdom compatibility: two UI helper tests fail because `tests/_helpers/jsdom-env.ts` assigns to `global.navigator`, which is getter-only in this runtime.
- Render route/path expectations: SRT/MP4 route tests expected local artifact success responses but got `404`, and helper path resolution returned `null`.
- Architecture invariant: `tests/cinema-control.test.ts` reports `shared/schema` imports `shared/newsroom-schema`, violating the test's expected separation.

## 7. Integration/API Results

API/integration tests were split by safety:

- Safe local route/auth subset: partially run inside the 54-file subset.
- DB-backed integration suite: skipped because it is documented to use Supabase pooler and many files insert/delete/update rows.

Passing API/integration signals:

- Admin video-render auth guard checks passed.
- Admin POST auth ordering and CSRF precedence checks passed.
- Admin reserved subroute collision guard passed.
- Broadcast schedule/helper API-adjacent suites passed where pure.

Skipped DB/API areas requiring approved test DB:

- Audience retention/audit/export/email/gateway integration.
- Production asset orphan/delete/relink/flapping integration.
- R7B cleanup DB eligibility tests.
- Safety persistence DB tests.
- Gateway block alert DB integration.

## 8. E2E/Browser Results

Playwright is configured:

- `playwright.config.ts`
- `testDir: tests/e2e`
- Default `baseURL`: `http://localhost:5000`
- `outputDir`: `test-results/artifacts`

`playwright test --list` succeeded after PATH was pinned to modern Node and listed:

- 40 tests
- 13 files/projects including setup

Browser execution was skipped.

Reason:

- `docs/e2e.md` lists prerequisites: `.env` configured, database migrated with `npm run db:push`, and app running.
- `db:push` and Supabase writes are explicitly forbidden for this audit.
- Several specs need admin credentials or local app state; no safe local/mock webServer is configured in `playwright.config.ts`.

## 9. Build / Typecheck / Lint Results

### Typecheck

`tsc --noEmit`: **FAIL**

Error groups:

- Remotion/client JSX namespace errors.
- Docs layout typing errors.
- BroadcastPreview infinite query `stats` typing errors.
- ProductionHouse missing `useQuery` imports/implicit `any`.
- Production asset deletion result typing mismatch.
- Broadcast route DTO/type mismatches.
- Audience audit export record missing required `outlier`.
- Production house `unrealSceneManifest` typing drift.

### Build

`npm run build`: **PASS after sandbox rerun**

Notes:

- Initial sandboxed run failed with:

```text
Cannot read directory "../..": Access is denied.
Could not resolve "C:\Users\NEW\Desktop\mougle-V1-git\vite.config.ts"
```

- Rerun outside sandbox passed:

```text
vite v7.3.1 building client environment for production...
4072 modules transformed.
built in 9.83s
building server...
dist\index.cjs  4.1mb
Done in 1440ms
```

- Build warning: one large client chunk, `assets/index-*.js`, about `4,843.31 kB` minified / `1,160.96 kB` gzip.

### Lint

No `npm run lint` script exists.

`node scripts/safety-lint.cjs`: **FAIL**

Six `no_external_publish_without_approval` violations were reported in `server/services/audience-platform-gateway-service.ts`.

### R10 Performance Budget

`node scripts/r10-perf-budget-check.mjs`: **PASS**

```text
total R3F source gzip: 50960 B / cap 92160 B
demo GLB size:         1416 B / cap 25600 B
```

## 10. Coverage Result

Coverage was not available.

Reasons:

- No Vitest config was found.
- No Vitest binary was installed.
- No package script for coverage exists.
- `npx vitest run --coverage` was skipped to avoid fetching new tools.

## 11. Failures With Exact Error Snippets, Redacted

No secrets or credentials are included below.

### TypeScript

```text
client/remotion/BroadcastComposition.tsx(48,73): error TS2503: Cannot find namespace 'JSX'.
client/src/pages/admin/ProductionHouse.tsx(3741,30): error TS2304: Cannot find name 'useQuery'.
server/routes/admin/production-assets.ts(891,28): error TS2339: Property 'snapshotId' does not exist on type '{ deletedAuditRows: number; }'.
server/services/audience-audit-export-notifier.ts(1054,9): error TS2741: Property 'outlier' is missing in type ... but required in type 'AudienceAuditExportRecord'.
server/services/production-house-service.ts(3732,18): error TS2339: Property 'unrealSceneManifest' does not exist ...
```

### Safety Lint

```text
safety-lint: 6 violation(s) found
[no_external_publish_without_approval] server\services\audience-platform-gateway-service.ts:96
[no_external_publish_without_approval] server\services\audience-platform-gateway-service.ts:102
[no_external_publish_without_approval] server\services\audience-platform-gateway-service.ts:109
[no_external_publish_without_approval] server\services\audience-platform-gateway-service.ts:120
[no_external_publish_without_approval] server\services\audience-platform-gateway-service.ts:165
[no_external_publish_without_approval] server\services\audience-platform-gateway-service.ts:171
```

### Supabase Guard

```text
Error: [db] SUPABASE_DB_PASSWORD is required. Mougle's source of truth is Supabase ...
Refusing to fall back to DATABASE_URL because that may still point at the legacy Neon database.
Set SUPABASE_DB_PASSWORD to proceed.
```

### jsdom / Node 24

```text
TypeError: Cannot set property navigator of #<Object> which has only a getter
    at installJsdom (tests\_helpers\jsdom-env.ts:58:5)
```

### Render Route Assertions

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 200
```

```text
AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
assert.ok(p)
```

### Cinema Control Architecture Invariant

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
true !== false
```

## 12. Skipped Tests And Reason

| Skipped item | Reason |
|---|---|
| Full `npm test` | Includes DB-backed tests that use Supabase pooler; not approved for Supabase Pro writes |
| `npm run check` | Expands to `tsc && npm test`; `tsc` fails and `npm test` is unsafe |
| 39 package-listed Node tests with direct DB indicators | Avoided Supabase Pro writes/connects |
| Additional discovered Node tests not listed in `npm test` | Outside configured package test command and many are DB/integration expansions |
| Playwright browser run | Requires app server, auth state, and migrated DB; docs mention forbidden `db:push` prerequisite |
| Vitest | Not configured/installed |
| Coverage | No coverage script/config/tooling present |
| npm lint | No `lint` script present |

## 13. Supabase Safety Status

| Check | Status |
|---|---|
| Database commands run | **None** |
| `db:push` run | **No** |
| `drizzle-kit push` run | **No** |
| `supabase db push` run | **No** |
| `DROP`, `TRUNCATE`, reset, restore, seed overwrite | **Not run** |
| Supabase writes | **None** |
| Supabase secrets exposed | **No** |
| `DATABASE_URL` exposed | **No** |
| Supabase keys/passwords/tokens exposed | **No** |

The missing `SUPABASE_DB_PASSWORD` error was allowed to surface only as a guardrail message. No secret value was printed.

## 14. Risk Matrix

| Severity | Risk | Evidence | Recommended handling |
|---|---|---|---|
| Critical | None confirmed in this audit | No protected DB writes, no secret exposure, build can pass | Continue guarded workflow |
| High | Safety lint external-publish violations | 6 `no_external_publish_without_approval` findings | Review gateway/approval pattern before merge/go-live |
| High | Typecheck fails | `tsc --noEmit` exits 1 with multiple areas | Fix before treating branch/main as release-ready |
| High | Full configured test suite cannot be safely run locally without Supabase write approval | `tests/README.md` documents Supabase pooler usage | Create/approve isolated test DB path or mock DB suite |
| Medium | E2E not runnable as safe local hermetic suite | Playwright lacks `webServer`; docs require app + migrated DB | Add local/mock E2E harness or approved staging DB workflow |
| Medium | Node 24/jsdom test helper breakage | `global.navigator` getter-only assignment failure | Patch helper to use `Object.defineProperty` or pin CI Node |
| Medium | Render artifact route tests fail on Windows/local path assumptions | Expected `200/206`, got `404`; path helper returned null | Normalize test fixture paths for Windows |
| Medium | No coverage command | No Vitest/coverage config | Add coverage tool intentionally after test strategy decision |
| Low | Build chunk size warning | Main JS chunk about 1.16 MB gzip | Consider manual chunks later |
| Low | npm install audit warnings | 25 vulnerabilities reported by npm install audit summary | Run a separate dependency audit task |

## 15. Recommended Next Actions

Fixes required before merge/go-live readiness:

1. Resolve the `tsc --noEmit` failure set, starting with missing `useQuery`, Remotion JSX namespace, production-house manifest typing, and route DTO mismatches.
2. Resolve or formally gate the six `safety-lint` external-publish findings in `audience-platform-gateway-service.ts`.
3. Patch the Node 24/jsdom helper issue in `tests/_helpers/jsdom-env.ts`.
4. Fix or document the Windows/local artifact path assumptions in SRT/MP4 render route tests.
5. Investigate the `cinema-control` architecture invariant that sees a `shared/schema` to `shared/newsroom-schema` import.

Tests to add or restructure:

1. Split the configured Node test script into `test:unit`, `test:api:mock`, and `test:db` so safe local audits can run without Supabase credentials.
2. Add a hermetic DB adapter or disposable local Postgres path for integration tests.
3. Add a Playwright `webServer` config for local app startup only when it is backed by safe test state.
4. Add coverage tooling after the test split is stable.

Replit/full-system checks needed:

1. Run the full `npm test` only against an approved non-production test database.
2. Run Playwright browser tests against a safe local or staging environment with throwaway admin/user credentials.
3. Verify production-like startup with `WORKER_ENABLED=false` and then with the intended worker mode in a staging environment.
4. Run a separate dependency/security audit task for npm vulnerabilities.

## 16. Final Verdict

**Not ready.**

Mougle V1 can build, and many local pure/unit safety checks pass, but the current branch/main state is not full-system ready because typecheck fails, safety lint fails, and the complete test suite cannot be safely executed without an approved non-production database strategy.
