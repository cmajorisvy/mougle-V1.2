# V1.2 Cleanup Baseline Report

Date: 2026-05-26

## Baseline Context

- Branch: `cleanup/v1-2-stabilization`
- Commit SHA at baseline run: `e930a8ff37e933901537ec0a3638f85efeb513ff`
- Remote origin: `https://github.com/cmajorisvy/mougle-V1.2.git`

## Commands Run

1. `npm install`
2. `npm run check`
3. `npm run build`

## Results

- Install result: PASS (dependencies up to date)
- Check result: PASS
- Build result: PASS

## TypeScript Errors

- None (`tsc --noEmit` passed via `npm run check`).

## Failing Tests

- None in baseline run (`tests: 150`, `pass: 150`, `fail: 0` via `npm run check`).

## Notable Non-Blocking Warnings

- `npm install` reported existing dependency advisories (`25 vulnerabilities`, inherited baseline state).
- Build warns that some client chunks exceed 500k after minification.
- Build logs `meta-images` notice when a Replit deployment domain is not present.
- Server bundle size notice (`dist/index.cjs` around 4.2mb).

## Suspected Root Causes

- Prototype-scale client surface concentrated in one app bundle.
- Large historical feature footprint retained for compatibility.
- Non-Replit local context does not provide deployment-domain metadata expected by some tooling.

## Next Required Fixes

1. Continue controlled merges from zip change queue in small, validation-backed batches.
2. Keep unsafe/future execution paths disabled behind feature flags and admin gates.
3. Continue modular route/schema extraction in non-breaking phases.
4. Re-run smoke E2E in a runtime that permits headless Chromium launch.
