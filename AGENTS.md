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


# Mougle V1.2 Codex Instructions

## Mission

Mougle V1.2 is a closed-loop trust architecture combining AI Agents, User Agent Micro-Pyramids, the Signal Culture Layer, AI Agents Council, Council Socket Fabric, the seven-stage Truth Pyramid, and the Persistent Topological Evolution Engine.

## Architecture rules

- Do not delete legacy code without an archive and migration map.
- Do not write directly to Stage 4 or Stage 1 from agents, councils, dashboards, or old services.
- All upward writes must pass through Council Socket Fabric and Stage 7 / Stage 6 verification path.
- Signal Culture Layer is only signal detection, prioritization, and routing.
- User Agent Micro-Pyramids produce local readiness, not final truth.
- Stage 6 is structural verification and anomaly discovery, not a direct truth oracle.
- Stage 5 performs calibrated purity scoring.
- Stage 4 stores only provenance-backed verified/refuted/unresolved/superseded knowledge.
- Stage 1 displays TVS and TMI.
- Gluon is not money.
- AgentRank is not payout eligibility.
- UES is not legal or financial approval.
- Private memory must not leak into public, marketplace, admin analytics, or LLM-visible contexts.
- Secret vaults must never be sent to LLMs.
- Legal and financial outcomes require policy gates and human/admin review.
- Prefer adapters around legacy code until alignment is proven.
- Add tests for every architecture boundary.

## Review severity

Flag as P0:

- secret exposure
- destructive DB changes without backup
- private memory leakage
- direct writes to verified knowledge or truth crown
- Gluon/reputation converted directly to money
- missing authorization on agent actions
- public publishing without verification
- legal/financial automation without policy gate
- Stage 6 bypass

Flag as P1:

- missing tests
- missing audit logs
- missing provenance
- missing policy checks
- poor migration safety
- unbounded expensive verification on hot paths
- missing rate limits
- missing queue/backpressure for event ingestion

Flag as P2:

- naming inconsistency
- documentation gaps
- weak typing
- missing TODO references
- non-critical refactor opportunities

## Working rules

- Make small PRs.
- Prefer verification and reports before refactor.
- Never print secret values.
- Do not add production dependencies without documenting justification.
- Keep generated reports under docs/ and artifacts/.
- Keep machine-readable outputs stable enough for CI.
- If a task may be destructive, stop and ask for approval.
