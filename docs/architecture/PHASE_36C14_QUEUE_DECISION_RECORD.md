# Phase 36C14 - Queue Decision Record and Worker Readiness Scorecard

## Status

Documentation only. No queue or worker is implemented.

## Current Boundary

This phase compares future queue options for Mougle Council Governance. It does not add packages, dependencies, workers, queues, schema, migrations, database writes, provider calls, or publishing behavior.

## Options

| Option | Best Use | Strength | Risk |
| --- | --- | --- | --- |
| Postgres-backed queue | Short-term app-native jobs and audit-friendly internal workflows. | Low infrastructure complexity, good visibility with existing stack. | Can become limited for complex long-running workflows. |
| BullMQ | Medium-complexity background jobs with retries and dashboards. | Mature job semantics and retry tooling. | Requires Redis and operational discipline. |
| Temporal | Long-running, multi-step, durable workflows. | Strong workflow durability and replay semantics. | More infrastructure and conceptual overhead. |

## Recommendation

Short term: Postgres-backed queue or BullMQ.

Medium term: Temporal only if workflows become long-running, multi-step, and operationally complex.

No full rewrite is recommended. Mougle should keep orchestration in TypeScript first and add Python later only for AI-heavy offline work, evaluation harnesses, embeddings, graph analytics, or model orchestration.

## Worker Readiness Scorecard

Before any queue implementation:

- Policy checker passes.
- Redaction Wall scanner exists.
- Safe mode exists.
- Manual approval path exists.
- Audit visibility exists.
- Idempotency strategy exists.
- Retry and poison-job behavior is defined.
- Private memory boundary is enforced.
- Publish gate remains locked.
- Rollback/disable path exists.

## Admin Visibility Requirements

Future queue UI should show:

- queued
- running
- blocked
- failed
- waiting_for_approval
- dry_run_completed

It must not show published unless a real gated publish happened.

## Tooltip and Learning Requirements

Any future queue/admin UI must include tooltips for queue type, worker type, idempotency, retry policy, poison job, safe mode, and manual publish gate.

Bottom learning sections must include:

- How to use this
- What this means
- How it works
- What cannot happen from this screen

## How to Use This

Use this record to choose the smallest future queue system that satisfies Mougle's safety and audit needs.

## What This Means

Queue selection is an operational readiness decision, not a reason to activate automation.

## How It Works

Mougle should validate job boundaries and admin visibility before selecting infrastructure. The queue should serve the safety model, not define it.

## What Cannot Happen From This Design

This design cannot start queues, run workers, call providers, mutate databases, publish content, or add dependencies.
