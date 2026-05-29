# Phase 36C4 - Event and Worker Readiness Architecture Plan

## 1. Current Boundary

Phase 36C4 is documentation and architecture planning only.

It does not activate workers, queues, runtime jobs, publishing, external provider calls, database writes, schema changes, migrations, provider adapters, payment behavior, marketplace deployment, or DB-backed Council Decision Ledger persistence.

This plan defines the future job language and safety envelope Mougle should use before implementation begins.

## 2. Why This Phase Exists

Mougle Council Governance needs a shared event and worker vocabulary before automation starts.

Without a readiness plan, future work could accidentally mix together package generation, provider calls, graph writes, distribution, ledger persistence, and publish actions before safety gates exist.

This phase prevents premature queue, provider, and publishing implementation by defining:

- activation levels
- worker capability boundaries
- event safety envelope
- future event names
- docs-only payload shapes
- queue direction
- safe mode and kill switches
- admin visibility requirements
- failure handling
- audit and decision ledger requirements
- staff/admin learning requirements

## 3. Activation Levels

Future jobs must declare an activation level. Jobs must not silently move between levels.

| Level | Meaning | Allowed Behavior |
| --- | --- | --- |
| `docs_only` | Architecture or contract exists only in docs. | No runtime execution. |
| `dry_run` | Job may run locally or internally without side effects. | No DB mutation except explicitly approved dry-run logs. No external publishing. |
| `admin_review_required` | Job can prepare review output but cannot execute final action. | Admin must inspect output before next step. |
| `manual_execute` | Root-admin can manually execute a gated action. | Requires explicit approval, audit entry, and rollback/disable path. |
| `production_active` | Approved production worker state. | Allowed only after safety, audit, policy, and admin controls are implemented and approved. |

Activation changes must be explicit, reviewed, and auditable.

## 4. Worker Capability Boundaries

### Read-Only Analysis Worker

Allowed actions:

- read approved public-safe package data
- run local/static analysis
- produce non-mutating findings

Forbidden actions:

- provider calls
- DB writes
- publishing
- private memory access

Activation requirements:

- `dry_run` minimum
- policy checker passes
- admin-visible output

### Package Generation Worker

Allowed actions:

- create draft package structure
- assemble metadata from approved inputs
- mark output as package-ready only

Forbidden actions:

- publishing
- direct provider disclosure
- bypassing originality and rights checks

Activation requirements:

- `admin_review_required` minimum
- MIV source boundary defined
- package policy checks attached

### Graph Sync Worker

Allowed actions:

- sync approved public-safe graph views
- prepare graph update previews
- reconcile known public-safe IDs

Forbidden actions:

- private memory sync
- unrestricted graph writes
- public exposure of internal scoring

Activation requirements:

- explicit graph write policy
- rollback plan
- audit log

### Policy Check Worker

Allowed actions:

- run static package policy checks
- produce pass, warning, or fail reports
- block unsafe package promotion

Forbidden actions:

- editing packages automatically
- changing activation levels
- publishing

Activation requirements:

- `dry_run` minimum
- nonzero exit on fail-level findings
- admin-readable report

### Originality and Rights Review Worker

Allowed actions:

- inspect package copy, script structure, visual source type, and rights-risk fields
- flag copied-expression risk
- recommend rewrite, block, or reference-safe status

Forbidden actions:

- copying source expression
- using third-party media directly without approved rights
- marking risky packages as publishable

Activation requirements:

- approved rights taxonomy
- manual review path
- audit trail

### Dry-Run Distribution Worker

Allowed actions:

- simulate distribution targets
- validate metadata shape
- produce dry-run logs

Forbidden actions:

- live posting
- uploads
- streaming
- publishing

Activation requirements:

- `dry_run` only until a future manual gate exists
- per-target disable flag
- clear admin labels

### External Agent Rate/Audit Worker

Allowed actions:

- aggregate approved audit metrics
- record planned rate-limit and safety observations
- prepare admin-only summaries

Forbidden actions:

- provider identity disclosure
- provider routing disclosure
- autonomous external calls

Activation requirements:

- provider non-disclosure policy
- admin-only output
- no public package leakage

### Publish-Capable Worker, Future/Manual-Gated Only

Allowed actions:

- none in Phase 36C4
- future manual execution only after explicit approval

Forbidden actions:

- autonomous publishing
- automatic upload
- automatic social distribution
- live streaming without root-admin gate

Activation requirements:

- `manual_execute` minimum
- root-admin approval
- audit entry
- safe mode controls
- rollback/disable path

## 5. Event Safety Envelope

Every future event should carry a safety envelope.

This is docs-only and not a schema.

```ts
type CouncilEventSafetyEnvelope = {
  eventId: string;
  eventType: string;
  phase: string;
  activationLevel: "docs_only" | "dry_run" | "admin_review_required" | "manual_execute" | "production_active";
  actorType: "system" | "staff" | "root_admin";
  requiresAdminApproval: boolean;
  allowedActions: string[];
  forbiddenActions: string[];
  policyChecks: string[];
  auditContext: {
    requestReason: string;
    sourceRoute?: string;
    safetyNotes?: string[];
  };
  sourcePackageId?: string;
  idempotencyKey: string;
  createdAt: string;
  requestedBy: string;
};
```

## 6. Proposed Future Event Names

- `council.package.policy_check.requested`
- `council.package.review.requested`
- `council.package.originality_check.requested`
- `council.package.visual_package.requested`
- `council.ledger.entry.proposed`
- `knowledge.packet.review.requested`
- `graph.sync.requested`
- `media.package.generation.requested`
- `distribution.dry_run.requested`
- `external_agent.audit.requested`
- `publish.manual_gate.requested`

## 7. Proposed Payload Shapes

These TypeScript-style examples are illustrative only. They are not implemented and are not database schema.

### Policy Check Requested

```ts
type CouncilPackagePolicyCheckRequested = {
  envelope: CouncilEventSafetyEnvelope;
  packageId: string;
  packageSchemaType: "NewsContentPackage" | "DebateContentPackage";
  checks: [
    "provider_non_disclosure",
    "publish_gate",
    "source_tier_safety",
    "originality_rights_gate",
    "miv_memory_separation",
  ];
};
```

### Package Review Requested

```ts
type CouncilPackageReviewRequested = {
  envelope: CouncilEventSafetyEnvelope;
  packageId: string;
  councilType: "news_verification_council" | "debate_council";
  reviewMode: "dry_run" | "admin_review_required";
  expectedOutput: "review_notes" | "ledger_entry_proposal" | "package_readiness_report";
};
```

### Originality Check Requested

```ts
type CouncilOriginalityCheckRequested = {
  envelope: CouncilEventSafetyEnvelope;
  packageId: string;
  inputTypes: Array<"title" | "script" | "description" | "visual_package" | "thumbnail_prompt">;
  blockedOutputs: Array<"copied_expression" | "unsafe_visual_reuse" | "active_publish_claim">;
};
```

### Distribution Dry-Run Requested

```ts
type DistributionDryRunRequested = {
  envelope: CouncilEventSafetyEnvelope;
  packageId: string;
  plannedTargets: string[];
  dryRunOnly: true;
  publishGate: "publish_decision_required";
};
```

### Ledger Entry Proposed

```ts
type CouncilLedgerEntryProposed = {
  envelope: CouncilEventSafetyEnvelope;
  packageId: string;
  councilType: "news_verification_council" | "debate_council";
  proposedEntry: {
    councilAgent: string;
    stance: string;
    confidence: number;
    evidenceUsed: string[];
    riskFlags: string[];
    finalChiefDecision: "publish_decision_required";
  };
};
```

## 8. Queue Direction

Recommended path:

- Short term: Postgres-backed queue or BullMQ.
- Medium term: Temporal only if workflows become long-running, multi-step, and complex.
- No full rewrite recommended.
- Keep orchestration in TypeScript first.
- Add Python later only for AI-heavy offline processing, evaluation harnesses, embeddings, graph analytics, or model orchestration.
- Do not move web, auth, admin routes, billing, or core app orchestration to Python now.

Why no full rewrite:

- Mougle already has React, Vite, TypeScript, Express, PostgreSQL, and Drizzle foundations.
- Current admin/API boundaries can support staged worker planning.
- A rewrite would delay safety, audit, and product-readiness work.

## 9. Kill Switch and Safe Mode

Future worker systems must include:

- global safe mode
- per-worker disable flag
- per-provider disable flag
- per-publish-target disable flag
- root-admin override only
- audit entry for every override

Safe mode should stop execution before any external call, mutation, distribution, or publish action.

## 10. Admin Visibility Requirements

Future admin dashboards should show:

- `queued`
- `running`
- `blocked`
- `failed`
- `waiting_for_approval`
- `dry_run_completed`

Do not show `published` unless a real gated publish happened.

Admin views should also show:

- activation level
- policy check result
- safe mode state
- last audit event
- requested by
- idempotency key
- next allowed action
- forbidden actions

## 11. Failure Handling

Future workers must define:

- retry policy
- idempotency handling
- poison job handling
- policy failure behavior
- partial package generation behavior
- external service unavailable behavior, future only
- manual escalation path
- audit logging

Failure defaults:

- fail closed
- keep publish gate locked
- preserve package state
- record audit context
- require admin review before retrying sensitive actions

## 12. Audit and Decision Ledger Requirements

Future events may propose Council Decision Ledger entries, but persistence is future-only unless explicitly implemented later.

Ledger-related jobs should:

- include source package ID
- include council type
- include agent role
- include evidence used
- include confidence
- include disagreement or unresolved question
- include originality flags
- include final chief decision
- preserve `Publish Decision Required`

Ledger persistence must not be added without explicit schema, migration, audit, and admin approval work.

## 13. Safety Gates Before Any Job Can Become Active

Before any future worker becomes active:

- policy checker passes
- safe mode exists
- admin approval path exists
- audit log exists
- dry-run tested
- rollback/disable path exists
- provider names hidden
- no private memory access
- publish gate enforced
- no DB mutation outside approved job type
- originality and rights gate present
- live-ready wording preserved

## 14. Provider Non-Disclosure

Future worker, event, package, admin, and learning surfaces must hide:

- provider names
- model names
- routing details
- fallback details
- credentials
- vendor identity
- environment values

Provider details may appear only in explicitly approved internal-only debug tooling. They must not appear in public package views, public docs, package metadata, social captions, council dialogue, or user-facing output.

## 15. Manual Publish Gate

No event or worker may publish, stream, upload, distribute, or post without:

- explicit future manual gate
- root-admin approval workflow
- audit entry
- safe mode check
- target-specific enable flag
- rollback/disable plan

Dry-run distribution is not publishing.

Package-ready is not publish-ready.

## 16. Tooltips and Staff/Admin Learning Requirements

Every future worker/admin page must include:

- tooltip on every new concept
- bottom learning sections:
  - How to use this
  - What this means
  - How it works
  - What cannot happen from this screen

Tooltip topics should include:

- activation level
- event safety envelope
- idempotency key
- safe mode
- dry run
- manual publish gate
- policy check
- originality and rights gate
- Council Decision Ledger
- poison job
- rollback/disable path

### How to use this

Use this plan to decide whether a future event or worker is allowed to exist, what activation level it belongs to, what safety envelope it must carry, and what admin visibility it needs before implementation.

### What this means

Mougle can design future automation without making it active. Planning an event name, payload, queue option, or worker category does not authorize runtime jobs, provider calls, database writes, or publishing.

### How it works

Every future event starts with a safety envelope. Workers are grouped by capability, constrained by activation level, blocked by safe mode when needed, audited for every sensitive action, and held behind `Publish Decision Required` until a root-admin manual gate exists.

### What cannot happen from this screen

This phase cannot start a worker, call a provider, mutate the database, publish media, upload assets, post to social channels, expose private memory, or bypass the manual publish gate.

## 17. What Should Remain in TypeScript vs Later Python

TypeScript should remain the core layer for:

- app shell
- admin dashboard
- API routes
- auth and permissions
- package contracts
- orchestration
- policy checks
- queue integration
- audit visibility

Python may be added later for:

- AI-heavy offline processing
- evaluation harnesses
- embeddings
- graph analytics
- model orchestration
- batch analysis

Do not move the core app to Python now.

## 18. Before Any Worker Goes Live Checklist

Before future implementation approval:

- [ ] Phase 36C3 policy checker passes.
- [ ] Safe mode exists.
- [ ] Per-worker disable flag exists.
- [ ] Per-provider disable flag exists.
- [ ] Per-publish-target disable flag exists.
- [ ] Admin approval path exists.
- [ ] Audit log exists.
- [ ] Dry-run tested.
- [ ] Idempotency strategy tested.
- [ ] Retry and poison-job handling defined.
- [ ] Rollback/disable path exists.
- [ ] Provider names hidden.
- [ ] No private memory access.
- [ ] Publish gate enforced.
- [ ] No DB mutation outside approved job type.
- [ ] Originality and rights gate present.
- [ ] Live-ready wording preserved.
- [ ] Staff/admin tooltip and learning blocks exist.
- [ ] Root-admin manual publish gate exists before any real distribution.
