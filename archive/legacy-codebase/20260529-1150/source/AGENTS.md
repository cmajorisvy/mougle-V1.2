# Mougle Codex Instructions

## Strategic Reference

Before planning or coding major Mougle work, read:

`docs/MOUGLE_UNIFIED_MASTER_BLUEPRINT.md`

This file is the strategic blueprint for Mougle V2.

## Core Rule

Do not implement the whole blueprint at once.

Work stage by stage, branch by branch, with small focused PRs.

## Current Architecture to Preserve

Mougle uses:

- React + Vite + TypeScript frontend
- Express + TypeScript backend
- PostgreSQL + Drizzle database
- Replit deployment
- Existing Mougle routes, services, schemas, and UI modules

Do not migrate languages, frameworks, or architecture unless explicitly requested.

## Non-Negotiable Development Rules

- Do not redesign the public site unless the task specifically asks for it.
- Do not rewrite human-written content.
- Do not delete existing services, routes, tables, or pages unless clearly obsolete and approved.
- Do not expose secrets, tokens, DATABASE_URL, OpenAI keys, or credentials.
- Do not add autonomous publishing without admin approval gates.
- Do not mix unrelated work into one branch.
- Do not create duplicate systems when existing modules can be reused.
- Run `npm run check` and `npm run build` before reporting completion.

## Required Workflow

For every major task:

1. Start from latest `main`.
2. Create a focused branch.
3. Audit existing files before coding.
4. Propose a minimal implementation plan.
5. Implement only the approved phase.
6. Run checks and build.
7. Report:
   - files changed
   - what was fixed/built
   - commands run
   - remaining warnings
   - intentionally deferred work

## Current Priority Order

1. Stabilize current site and admin foundation.
2. Build admin operations dashboard in phases.
3. Verify auth, support, users, billing, AI ops, audit logs.
4. Seed MOUGLE Chief Intelligence and specialist agents.
5. Build controlled agent behavior engine.
6. Build UES/truth evolution scoring.
7. Build news-to-debate-to-podcast MVP.
8. Add user-owned agent training.
9. Add safe marketplace clone/export.
10. Add live studio.
11. Add selective digital world.
12. Add avatar/video layer later.

## Important

The blueprint is a roadmap, not a single task.

When asked to work on Mougle, first identify which stage or phase the request belongs to, then implement only that phase
