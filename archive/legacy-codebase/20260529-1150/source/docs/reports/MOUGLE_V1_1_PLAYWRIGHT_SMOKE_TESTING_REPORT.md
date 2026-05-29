# Mougle V1.1 Playwright Smoke Testing Report

## A. Task title

Mougle V1.1 Playwright smoke testing foundation.

## B. Date

2026-05-24

## C. Branch

`codex/v1-1-playwright-smoke`

## D. Goal

Add a minimal Playwright visual and functional smoke testing foundation for Mougle V1.1.

## E. Scope

- Verified and updated `playwright.config.ts`.
- Added `tests/e2e/mougle-v1-1-smoke.spec.ts`.
- Added `npm run test:e2e:smoke`.
- Added a smoke runner that removes Playwright smoke output after each run.
- Added this report and indexed it in `docs/library/INDEX.md`.

## F. Safety posture

- `.env.local` is read by Playwright config but not committed.
- Smoke tests do not save authenticated storage state.
- Smoke project disables screenshots, videos, and traces.
- Smoke runner removes the smoke output directory after each run, including Playwright failure context markdown.
- Authenticated tests skip clearly when required E2E env vars are missing.
- Authenticated tests are read-only after the login step and block unexpected mutating requests.
- No destructive admin flow is tested.

## G. Smoke coverage

- Public homepage loads without blank screen or console/page errors.
- Public `/docs/about` route loads without blank screen or console/page errors.
- Admin login route loads and unauthenticated dashboard route shows either login or dashboard state.
- Admin dashboard authenticated smoke runs only when admin E2E env vars are present.
- User sign-in route loads.
- User dashboard authenticated smoke runs only when user E2E env vars are present.

## H. Files changed

- `playwright.config.ts` - loads `.env.local`, adds a dedicated artifact-free `smoke` project, and keeps the existing setup project out of the smoke run.
- `package.json` - adds `test:e2e:smoke`.
- `scripts/run-playwright-smoke.cjs` - runs the smoke project and removes temporary smoke artifacts afterward.
- `tests/e2e/mougle-v1-1-smoke.spec.ts` - new read-only smoke suite.
- `docs/reports/MOUGLE_V1_1_PLAYWRIGHT_SMOKE_TESTING_REPORT.md` - this report.
- `docs/library/INDEX.md` - indexes this report.

## I. Non-goals

- No DB writes.
- No Supabase writes.
- No migrations or `db:push`.
- No provider commands.
- No render, publish, deploy, upload, delete, or create actions.
- No admin UI redesign or route behavior change.
- No `.env` or secret file edits.

## J. Validation

- `npm run check`
- `npm run build`
- `npm run test:e2e:smoke`

## K. Results

- `npm run check` passed.
- `npm run build` passed.
- `npm run test:e2e:smoke` was run but Chromium could not launch in the current macOS sandbox. The installed browser binary was found, so this was not a missing-browser install failure. The launch failed with macOS Mach port permission denial before any authenticated login steps ran. The smoke runner removed its temporary output directory after the run.

## L. Remaining warnings

- Existing validation warning noise remains from the broader suite: React Query missing-query-function warnings, Recharts zero-size chart warnings, Node `punycode` deprecation, and an expected ffmpeg `ENOENT` log inside the render guard test.
- Local smoke validation still needs to be rerun in an environment that permits Playwright Chromium to launch. The browser install was present during this run.
- The smoke command also emitted existing local `NO_COLOR` / `FORCE_COLOR` warning noise before the browser launch failure.
