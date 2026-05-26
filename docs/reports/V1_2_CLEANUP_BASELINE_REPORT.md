# V1.2 Cleanup Baseline Report

Date: 2026-05-26

## Baseline Context

- Branch: `cleanup/v1-2-stabilization`
- Commit SHA at baseline run: `f4df82e4d1a0d92769aa3540df3e73afadbf4998`
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

- None in baseline run (`tsc --noEmit` passed via `npm run check`).

## Failing Tests

- None in baseline run (`tests: 147`, `pass: 147`, `fail: 0`).

## Notable Non-Blocking Warnings

- `npm install` reported known vulnerabilities in dependency tree (`25 vulnerabilities`, inherited baseline state).
- Build warns that some chunks exceed 500k after minification.
- Build logs `meta-images` warning when Replit deployment domain is not present.
- Server bundle size notice (`dist/index.cjs` around 4.1mb).

## Suspected Root Causes

- Existing broad prototype footprint and large client bundle size.
- Legacy/accumulated module surface in a single app package.
- Replit-domain-specific plugin behavior in non-Replit local build contexts.

## Next Required Fixes

1. Complete identity/docs cleanup to align repository as canonical V1.2 baseline.
2. Remove unrelated external redirects and add redirect safety test coverage.
3. Add explicit feature flag registry for risky/future modules.
4. Reduce navigation/admin clutter via safe gating (not destructive removal).
5. Produce route/schema/provider cleanup plans for phased follow-up work.
