# Phase 36C Remaining Roadmap and Prompt List

## Status

Reference prompt library and numbering map only.

This document records the Phase 36C7-36C16 sequence used by the Council Governance completion branch. It is not approval to implement providers, workers, queues, schema changes, publishing, runtime jobs, or external integrations.

## Global Rule For Every 36C Phase

Every admin-facing UI phase must include:

- tooltips for every new concept
- bottom learning sections:
  - How to use this
  - What this means
  - How it works
  - What cannot happen from this screen

Every 36C phase must preserve:

- provider non-disclosure
- Redaction Wall
- `Publish Decision Required`
- manual/root-admin gates
- private memory separation
- originality and rights gate
- no autonomous publishing
- no provider/model disclosure
- no `.env` access
- no schema changes, migrations, or `db:push`
- no queues, workers, or external calls unless a later phase explicitly approves them

## Verified Branch Numbering

1. Phase 36C7 - Redaction Wall Static Scanner
2. Phase 36C8 - Council Governance Policy Expansion
3. Phase 36C9 - Safe Mode and Kill Switch Readiness UI
4. Phase 36C10 - Admin Audit Trace and Ledger Proposal Preview
5. Phase 36C11 - Council Package Promotion Gate Design
6. Phase 36C12 - Local Fake Adapter Dry-Run Harness, No External Calls
7. Phase 36C13 - Manual-Gated Provider Pilot UI Mock, No Provider
8. Phase 36C14 - Queue Decision Record and Worker Readiness Scorecard
9. Phase 36C15 - Credential Storage Governance Plan, No Secrets
10. Phase 36C16 - Final Phase 36C Verification and Readiness Report

## Phase 36C7 - Redaction Wall Static Scanner

### Goal

Implement a local-only static scanner that detects forbidden provider, routing, raw prompt, raw completion, credential, and environment-value leakage in Phase 36C council package surfaces.

### Scope

- Local static validation only.
- No external calls.
- No provider adapters.
- No workers or queues.
- No schema changes.
- No publishing.
- No `.env` access.

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Phase 36C8 - Council Governance Policy Expansion

### Goal

Expand the local Phase 36C policy checker so it validates activation levels, manual publish gate language, live-ready wording, private memory separation, originality/rights gate presence, and required staff/admin learning sections.

### Scope

- Local static validation only.
- No runtime jobs.
- No provider calls.
- No workers or queues.
- No schema changes.
- No publishing.
- No `.env` access.

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Phase 36C9 - Safe Mode and Kill Switch Readiness UI

### Goal

Create an admin-only static/read-only readiness UI for future safe mode and kill switch controls. Controls must remain non-operational or disabled.

### Scope

- Admin UI readiness preview only.
- Static/mock data only.
- No DB writes.
- No safe mode mutation.
- No provider calls.
- No workers or queues.
- No publishing.

### UI Requirements

- Tooltips for safe mode, kill switch, per-worker disable, per-provider disable, per-target disable, root-admin override, and audit entry.
- Bottom learning sections:
  - How to use this
  - What this means
  - How it works
  - What cannot happen from this screen

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Phase 36C10 - Admin Audit Trace and Ledger Proposal Preview

### Goal

Add static/mock audit trace and Council Decision Ledger proposal preview surfaces. This phase does not persist ledgers or write to the database.

### Scope

- Admin preview only.
- Static/mock data only.
- No DB persistence.
- No schema changes.
- No external calls.
- No publishing.

### UI Requirements

- Tooltips for audit trace, ledger proposal, final chief decision, evidence used, risk flags, originality flags, and read-only preview state.
- Bottom learning sections:
  - How to use this
  - What this means
  - How it works
  - What cannot happen from this screen

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Phase 36C11 - Council Package Promotion Gate Design

### Goal

Create a docs-only package promotion gate design covering the future staged movement from static preview toward manual publish candidate.

### Promotion States

- `static_preview`
- `dry_run_artifact`
- `redaction_passed`
- `policy_passed`
- `admin_review_required`
- `ledger_proposal_ready`
- `rejected`
- `blocked`
- `manual_publish_candidate`, future only

### Scope

- Documentation only.
- No app code changes.
- No schema changes.
- No workers or queues.
- No publishing.

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Phase 36C12 - Local Fake Adapter Dry-Run Harness, No External Calls

### Goal

Implement a local fake adapter dry-run harness using static/mock output only. It must never call providers, read credentials, route requests, store raw prompts, store raw completions, or publish.

### Scope

- Local fake adapter only.
- Static/mock output only.
- No external calls.
- No credentials.
- No DB writes.
- No workers or queues.
- No publishing.

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Phase 36C13 - Manual-Gated Provider Pilot UI Mock, No Provider

### Goal

Create an admin-only static/mock UI showing the future manual-gated provider pilot flow. All actions must remain disabled/read-only.

### Scope

- Admin UI mock only.
- Static/mock data only.
- No provider calls.
- No adapters beyond the local fake harness.
- No DB writes.
- No workers or queues.
- No publishing.

### UI Requirements

- Tooltips for manual-gated pilot, Redaction Wall, forbidden field scan, policy check status, safe mode, kill switch, and publish gate.
- Bottom learning sections:
  - How to use this
  - What this means
  - How it works
  - What cannot happen from this screen

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Phase 36C14 - Queue Decision Record and Worker Readiness Scorecard

### Goal

Create a docs-only decision record comparing future queue options and defining a worker readiness scorecard. This phase must not implement a queue or worker.

### Scope

- Documentation only.
- No package changes.
- No queue implementation.
- No worker implementation.
- No schema changes.
- No runtime jobs.
- No publishing.

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Phase 36C15 - Credential Storage Governance Plan, No Secrets

### Goal

Create a docs-only credential storage governance plan for future provider readiness without reading, printing, inspecting, modifying, or referencing real environment values.

### Scope

- Documentation only.
- No `.env` access.
- No credentials.
- No package changes.
- No provider calls.
- No schema changes.
- No publishing.

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Phase 36C16 - Final Phase 36C Verification and Readiness Report

### Goal

Create a final readiness report tying together implemented artifacts, docs-only artifacts, policy checker readiness, Redaction Wall readiness, event/worker readiness, provider pilot readiness, private memory boundary, manual publish gate, tooltip/learning coverage, risks, blockers, and Phase 37 entry criteria.

### Scope

- Documentation only.
- No new functionality.
- No schema changes.
- No providers.
- No workers or queues.
- No publishing.

### Validation

- `node --import tsx script/council-policy-check.ts --json`
- `git diff --check`
- `npm run check`
- `npm run build`

## Best Next Step After This Branch

After the Phase 36C7-36C16 branch passes validation and is approved, the safest next step is a review-only pass before any Phase 37 implementation. Phase 37 should not begin until the Redaction Wall, safe mode, manual publish gate, and private memory boundary are explicitly accepted.
