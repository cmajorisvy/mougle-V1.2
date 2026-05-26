# Mougle Replit Runtime Setup

This project requires two Replit Secrets to boot:

1. `DATABASE_URL`
2. `SESSION_SECRET`

No real secret values should be committed in the repository.

## Where To Set Secrets In Replit

1. Open the Replit project.
2. Go to `Tools` -> `Secrets`.
3. Add:
   - `DATABASE_URL`: PostgreSQL connection string
   - `SESSION_SECRET`: random long string for session signing

## Startup Commands

- Replit preview run command: `npm run dev`
- Production run command: `npm run start`
- Replit deployment run is configured to execute `npm run start`.

## Startup Verification Checklist

1. Confirm both secrets are present in Replit Secrets:
   - `DATABASE_URL`
   - `SESSION_SECRET`
2. Start preview (`Run` button / `npm run dev`).
3. Verify app responds on port `5000`.
4. Build verification:
   - `npm run check`
   - `npm run build`

## Playwright Smoke Verification

Use `npm run test:e2e:smoke` for the Mougle V1.1 browser smoke path after `npm run check` and `npm run build` pass.

The smoke runner:

- loads E2E values from `.env.local` through `playwright.config.ts`;
- does not commit or print secrets;
- disables screenshots, videos, traces, and storage state for the `smoke` project;
- removes temporary smoke output after each run;
- skips authenticated admin/user checks when the related E2E env vars are absent.

If Chromium fails on Replit/NixOS with a missing `libglib-2.0.so.0` message, treat it as a Replit runtime/system-library blocker. It is not a missing Playwright browser install and not a smoke-test code failure. The minimal Nix package expected to provide that library is `pkgs.glib`.

If Playwright reports that the browser executable itself is missing, that is a different issue. Run `npx playwright install chromium`, then retry `npm run test:e2e:smoke`.

Only run authenticated smoke checks against read-only admin/user paths. Do not run destructive admin flows from Playwright.

## Failure Signals

- Missing `DATABASE_URL`:
  runtime throws `[db] Missing required environment variable: DATABASE_URL`
- Missing `SESSION_SECRET`:
  runtime throws `[runtime] Missing required environment variable: SESSION_SECRET`
- Missing Playwright Chromium runtime library on Replit/NixOS:
  Chromium launch fails with a message mentioning `libglib-2.0.so.0`
