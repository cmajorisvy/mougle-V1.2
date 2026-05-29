# Mougle V1.2

Mougle V1.2 is the stabilized foundation for Mougle's truth-governed intelligence platform.
This repository is the canonical source of truth for development.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Express + TypeScript
- Data: PostgreSQL + Drizzle

## Source Of Truth Rule

- GitHub (`cmajorisvy/mougle-V1.2`) is source of truth.
- Replit is a working copy/runtime workspace.
- Make changes on branches and open PRs into `main`.

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

## Validate

```bash
npm run check
npm run build
```

Optional smoke E2E (environment-dependent):

```bash
npm run test:e2e:smoke
```

## Branch Workflow

1. Start from latest `main`.
2. Create a focused branch (example: `cleanup/v1-2-stabilization`).
3. Make small, reviewable commits.
4. Run `npm run check` and `npm run build`.
5. Push branch and open PR to `main`.
6. Do not force-push and do not work directly on `main`.

## Disabled/Restricted By Default

The following remain disabled, preview-only, dry-run-only, or approval-gated in V1.2 cleanup mode:

- Autonomous publishing
- YouTube publishing automation
- Social distribution automation
- Payouts and creator earnings execution
- Marketplace checkout execution
- Live debate auto-runner
- Real 4D hardware execution
- Unreal real execution
- Unity build execution
- Blender/Cinema real execution
- Real device/SOS execution
- Public Production House publishing
- Browser-side real provider calls

Production House remains preview-first and dry-run-first.
