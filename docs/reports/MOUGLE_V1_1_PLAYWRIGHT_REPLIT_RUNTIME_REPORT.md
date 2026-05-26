# Mougle V1.1 Playwright Replit Runtime Report

## A. Task title

Mougle V1.1 Playwright smoke Replit/NixOS runtime follow-up.

## B. Date

2026-05-24

## C. Branch

`codex/v1-1-playwright-runtime-env-docs`

## D. Context

PR #7 added the Mougle V1.1 Playwright smoke foundation. Task #917 verified the merged work in Replit:

- `npm run check` passed.
- `npm run build` passed.
- `npm run test:e2e:smoke` was blocked before browser execution because Chromium could not launch on Replit NixOS.
- The launch failure referenced missing `libglib-2.0.so.0`.
- Auth-gated smoke tests skipped correctly when E2E secrets were absent.
- No authenticated storage state, screenshots, videos, traces, artifacts, or secrets persisted.

## E. Finding

The Replit failure is a runtime/system-library blocker, not a missing Playwright browser install and not a smoke-test code validation failure.

`libglib-2.0.so.0` is provided by the Nix `glib` package, so the minimal Replit/NixOS runtime addition is `pkgs.glib`.

## F. Changes made

- Added `pkgs.glib` to `replit.nix`.
- Documented the Playwright smoke runtime requirement in `docs/replit-runtime-setup.md`.
- Added this report.
- Indexed this report in `docs/library/INDEX.md`.

## G. Safe smoke command guidance

Run this sequence for the V1.1 smoke path:

```bash
npm run check
npm run build
npm run test:e2e:smoke
```

If `npm run test:e2e:smoke` fails with a missing Replit/NixOS Chromium shared library such as `libglib-2.0.so.0`, verify the Replit runtime package set before treating the smoke suite as failed.

If Playwright browsers themselves are missing, use the normal browser install path:

```bash
npx playwright install chromium
```

Do not confuse a missing browser binary with a missing system library.

## H. Safety posture

- No `.env`, `.env.local`, or secret file was edited.
- No secrets were printed.
- No DB, Supabase, migration, provider, render, publish, deploy, upload, delete, or create command was run.
- No Playwright test semantics were changed.
- Authenticated smoke checks remain read-only and skip when required E2E env vars are absent.
- The smoke runner continues to remove temporary Playwright smoke output after each run.

## I. Validation

- `npm run check` passed.
- `npm run build` passed.
- `npm run test:e2e:smoke` was run locally but Chromium could not launch in the current macOS sandbox due Mach port permission denial (`bootstrap_check_in ... Permission denied (1100)`). The installed browser binary was present, so this was not a missing-browser install failure. This local macOS blocker is separate from the Replit/NixOS `libglib-2.0.so.0` blocker from Task #917.
- The smoke runner removed temporary Playwright smoke output after the failed local run.

Observed warning noise:

- Existing broader-suite warnings from React Query missing query functions, Recharts zero-size chart warnings, Node `punycode` deprecation, and an expected ffmpeg `ENOENT` log inside the render guard test.
- Local smoke command emitted existing `NO_COLOR` / `FORCE_COLOR` warning noise before the browser launch failure.

## J. Deferred work

If Replit still reports another Chromium shared-library error after adding `pkgs.glib`, add only the next missing Nix package in a follow-up PR and record the exact library name. Keep the default smoke command artifact-free and read-only.
