# Phase 36C11 - Council Package Promotion Gate Design

## Status

Documentation only. No package state machine is implemented.

## Current Boundary

This phase defines future package promotion states and forbidden transitions. It does not add schema, migrations, database writes, workers, queues, provider calls, ledger persistence, publishing, or runtime package promotion.

## Purpose

Council packages need a clear promotion gate before Mougle allows any dry-run artifact, review output, ledger proposal, or future manual publishing candidate to move forward.

## Future Promotion States

- `static_preview`: mock or configured preview only.
- `dry_run_artifact`: generated or simulated review artifact with no side effects.
- `redaction_passed`: artifact passed Redaction Wall checks.
- `policy_passed`: artifact passed static policy checks.
- `admin_review_required`: root-admin review is required before promotion.
- `ledger_proposal_ready`: ledger proposal is shaped but not persisted.
- `rejected`: admin or policy rejected the artifact.
- `blocked`: safety, policy, rights, redaction, or memory boundary blocked the artifact.
- `manual_publish_candidate`: future-only state after explicit approval; not publishing.

## Forbidden Transitions

- `static_preview` to published output.
- `dry_run_artifact` to public output.
- provider-backed output to ledger proposal without redaction, policy checks, and admin review.
- monitoring-only evidence to verified status without evidence review.
- ledger proposal to persisted ledger without future schema and approval work.
- manual publish candidate to published output without a later manual publish gate.

## Required Gate Checks

Before any package can move beyond static preview:

- Redaction Wall passes.
- Forbidden field scan passes.
- Phase 36C policy checker passes.
- Private memory boundary is respected.
- Originality and rights gate is present.
- Source-tier rules are respected.
- Publish Decision Required remains locked.
- Admin review is required.

## Tooltip and Learning Requirements

Any future admin UI for package promotion must include tooltips for every promotion state and transition.

Bottom learning sections must include:

- How to use this
- What this means
- How it works
- What cannot happen from this screen

## How to Use This

Use this design to decide whether a future package artifact is allowed to move from preview into review, redaction, policy checking, ledger proposal, or future manual publishing candidacy.

## What This Means

Package promotion is a gated safety process, not a publish process. Passing one gate does not imply truth, ledger persistence, public visibility, or publication.

## How It Works

Each package state has allowed transitions and forbidden transitions. A package must pass redaction, policy, originality, memory, and admin review gates before it can move forward.

## What Cannot Happen From This Design

This design cannot promote packages, write database state, persist ledgers, call providers, start workers, publish content, or bypass manual approval.
