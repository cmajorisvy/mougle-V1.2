# GitHub + Replit PR Sync Runbook

Status: active

Owner surface: Mougle local workspace (`mougle-V1.2`)

Purpose: keep pull requests clean when local Replit work and GitHub branches get out of sync.

## Core Rule

Use a local-first flow:

1. Clean and verify locally.
2. Run checks locally.
3. Push one focused branch.
4. Open one focused PR.

Avoid editing the same change set in both local and GitHub UI at the same time.

## Standard Safe Flow

1. Verify remote:
   - `git remote -v`
   - `origin` must point to `https://github.com/cmajorisvy/mougle-V1.2.git`
2. Verify local cleanliness:
   - `git status --short --branch`
   - continue only if clean
3. Sync local `main`:
   - `git fetch origin`
   - `git switch main`
   - `git merge --ff-only origin/main`
4. Create a focused branch from synced `main`:
   - Example: `git switch -c cleanup/v1-2-stabilization`
5. Make changes and validate:
   - `npm run check`
   - `npm run build`
6. Push branch:
   - `git push -u origin <branch-name>`
7. Open PR to `main`.

## Local Helper Script

Use this helper to reduce command mistakes:

- `scripts/prepare-pr-branch.sh <branch-name>`
- Add `--push` to push immediately.
- Add `--hard-sync` only when you intentionally want local `main` to match `origin/main` exactly.

Examples:

- `scripts/prepare-pr-branch.sh fix/admin-route-card`
- `scripts/prepare-pr-branch.sh cleanup/v1-2-stabilization --push`
- `scripts/prepare-pr-branch.sh cleanup/rebase-main --hard-sync`

## Conflict Recovery (When Replit and GitHub Diverge)

If local history became confusing:

1. Create a backup branch first:
   - `git switch -c backup/local-before-pr-cleanup-<date>`
2. Return to `main`, sync from `origin/main`.
3. Build a new clean branch from synced `main`.
4. Re-apply only intended commits (or re-do the minimal file edits).
5. Re-run `npm run check` and `npm run build`.
6. Push the new clean branch and open a fresh PR.

## Safety Guardrails

- Never commit `.env`, `.env.local`, secrets, or tokens.
- Never force push to `main`.
- Do not mix unrelated fixes in one PR.
- Prefer local branch workflow over direct GitHub UI edits for multi-file changes.
