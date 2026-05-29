# Phase 36C6 - Manual-Gated Provider Pilot Governance Plan, No Live Integration

## 1. Current Boundary

Phase 36C6 is documentation and governance planning only.

This phase does not implement provider calls, adapters, credentials, model routing, workers, queues, schema changes, migrations, database writes, runtime jobs, package promotion, ledger persistence, publishing, or public provider/model disclosure.

No provider-backed reasoning runs in this phase.

## 2. Why This Phase Exists

Mougle needs a manual-gated provider pilot governance plan before any external reasoning is connected.

The purpose is to prevent unsafe jumps from:

- static council contracts
- dry-run adapter contract design
- live provider behavior
- package state changes
- ledger state changes
- publishing or public output

This phase defines how a future pilot could be requested, reviewed, redacted, audited, and blocked before implementation begins.

## 3. Pilot Principle

No provider-backed reasoning may affect packages, ledgers, graph state, public views, or publishing until it passes redaction, policy checks, admin review, and manual approval.

Provider-backed output is not Mougle truth.

Provider-backed output is not publish approval.

Provider-backed output is not ledger state.

## 4. Pilot Activation Level

Phase 36C6 is `docs_only`.

Future pilot levels:

- `docs_only`: current state, planning only.
- `dry_run`: future internal pilot output only, no side effects.
- `admin_review_required`: future output may be reviewed by root-admin but cannot execute final actions.
- `manual_execute`: future controlled internal execution only after explicit approval.
- `production_active`: out of scope for this phase.

No future pilot may silently move between activation levels.

## 5. Required Dependencies Before Pilot

A future provider pilot cannot begin until:

- Phase 36C3 policy checker passes
- Phase 36C4 event safety envelope is implemented
- Phase 36C5 Redaction Wall scan is implemented
- safe mode exists
- audit logging exists
- admin review path exists
- forbidden field scan exists
- private memory boundary exists
- manual publish gate exists
- kill switch exists
- provider credentials are stored securely outside the repo
- no provider/model disclosure reaches package views

## 6. Pilot Flow, Future Only

Future flow:

1. Root-admin selects a mock/static council package.
2. Root-admin requests a dry-run provider pilot.
3. Event safety envelope is created.
4. Provider adapter receives redacted dry-run request.
5. Provider output stays behind the Redaction Wall.
6. Normalized council output is generated.
7. Forbidden field scan runs.
8. Phase 36C3 policy checker runs.
9. Result becomes an admin-only dry-run review artifact.
10. Root-admin reviews.
11. No publish action occurs.

This is a future flow only. It is not implemented in Phase 36C6.

## 7. Manual Approval Gates

Manual approval is required at:

- pilot request
- provider adapter execution
- redacted output review
- package promotion to review workbench
- ledger proposal creation
- any future publishing step

Publishing remains out of scope.

## 8. Pilot Request Shape

This TypeScript-style shape is illustrative only. It is not implemented and is not a schema.

```ts
type ManualGatedProviderPilotRequest = {
  envelope: CouncilEventSafetyEnvelope;
  packageId: string;
  councilType: "news_verification_council" | "debate_council";
  councilAgentName: string;
  councilRole: string;
  adapterSlotId: string;
  dryRunOnly: true;
  requiresAdminApproval: true;
  requestedBy: string;
  purpose: string;
  allowedInputs: string[];
  forbiddenOutputs: string[];
  policyChecks: string[];
  redactionRequired: true;
};
```

## 9. Pilot Result Shape

This TypeScript-style shape is illustrative only. It is not implemented and is not a schema.

```ts
type ManualGatedProviderPilotResult = {
  pilotRunId: string;
  packageId: string;
  councilAgentName: string;
  councilRole: string;
  normalizedCouncilOutput: string;
  confidence: number;
  evidenceReferences: string[];
  riskFlags: string[];
  redactionStatus: "passed" | "blocked";
  policyCheckStatus: "pass" | "warning" | "fail";
  adminReviewStatus: "waiting_for_admin_review" | "approved_for_review_workbench" | "rejected";
  auditNotes: string[];
  publishDecision: "publish_decision_required";
};
```

Result rule:

No raw provider output may cross into the result.

## 10. Redaction Wall Requirements

These must never cross the Redaction Wall:

- providerName
- modelName
- modelVersion
- endpoint
- apiKey
- organizationId
- projectId
- routingPolicy
- fallbackProvider
- fallbackModel
- rawResponse
- rawPrompt
- rawCompletion
- rawProviderError
- providerTokenUsage
- environmentValue

If any forbidden field appears, the pilot must fail closed and preserve `Publish Decision Required`.

## 11. Private Memory Boundary

Provider pilots must not access:

- private user memory
- business memory
- personal memory
- raw behavioral memory
- private billing/support data

Allowed future inputs only:

- public-safe evidence
- admin-approved package fields
- approved knowledge packets
- source-tier labels
- claim summaries
- council role instructions

Private memory access requires an explicit permissioned workflow in a later approved phase.

## 12. Safe Mode and Kill Switch

Future pilots must support:

- global safe mode
- per-adapter disable flag
- per-council disable flag
- per-provider disable flag
- per-package disable flag
- root-admin override only
- audit entry for every override

Safe mode must stop pilot execution before provider calls, package promotion, ledger proposal, distribution, or publish actions.

## 13. Admin Visibility

Future pilot dashboards must show:

- `dry_run_requested`
- `waiting_for_admin_approval`
- `redaction_running`
- `policy_check_running`
- `blocked`
- `failed`
- `dry_run_completed`
- `admin_review_required`

They must never show:

- published
- live
- sent to video/social channels
- autonomous

Those labels require a later explicitly approved publishing phase.

## 14. Failure Handling

Future pilots must handle:

- provider unavailable
- timeout
- unsafe output
- redaction failure
- forbidden field detected
- private memory requested
- policy checker failed
- admin rejected output
- malformed normalized result

Default behavior:

- fail closed
- preserve `Publish Decision Required`
- write audit note
- require admin review
- do not promote package state
- do not persist ledger state
- do not publish

## 15. Audit Requirements

Future pilot audit records must include:

- pilotRunId
- eventId
- packageId
- councilType
- councilAgentName
- adapterSlotId
- activationLevel
- dryRunOnly
- requestedBy
- approvedBy, if applicable
- redactionStatus
- policyCheckStatus
- adminReviewStatus
- riskFlags
- timestamp

Audit records must not include provider identity, raw prompts, raw completions, credentials, routing, fallback, or environment values.

## 16. Tooltips and Staff/Admin Learning Requirements

Every future pilot/admin/debug page must include:

- tooltip on every new concept
- bottom learning sections:
  - How to use this
  - What this means
  - How it works
  - What cannot happen from this screen

Tooltip topics:

- manual-gated pilot
- dry-run provider pilot
- Redaction Wall
- forbidden field scan
- normalized council output
- policy check status
- admin review status
- safe mode
- kill switch
- publish decision required

### How to use this

Use this plan to decide whether a future provider-backed council pilot is safe enough to request, what manual gates are required, and which outputs are allowed to reach admin review.

### What this means

Mougle may later test provider-backed reasoning, but only as a dry-run, redacted, admin-only, audited artifact. It cannot become package truth, ledger truth, public copy, or publishable media without later approval.

### How it works

A future pilot starts from a Phase 36C4 event safety envelope, passes through the Phase 36C5 Redaction Wall, runs forbidden-field and policy checks, then waits for root-admin review. The publish gate remains locked.

### What cannot happen from this screen

This phase cannot call a provider, use credentials, route to a model, start a worker, run a queue, mutate the database, persist a ledger, promote package state, expose provider identity, access private memory, or publish content.

## 17. What Cannot Happen In Phase 36C6

Phase 36C6 does not allow:

- provider calls
- credentials
- model routing
- adapter implementation
- workers
- queues
- DB writes
- schema changes
- migrations
- raw prompt storage
- raw completion storage
- public provider disclosure
- package promotion
- ledger persistence
- publishing

## 18. Future Pilot Success Criteria

A future real pilot is successful only if:

- provider identity remains hidden
- raw output never crosses the Redaction Wall
- policy checker passes
- admin can reject output
- no publishing occurs
- no private memory is accessed
- every action is audited
- safe mode can stop execution
- output remains dry-run and admin-only

## 19. Future Implementation Roadmap

- Phase 36C6A: manual-gated pilot UI mock, no provider
- Phase 36C6B: Redaction Wall scan implementation
- Phase 36C6C: forbidden field scan implementation
- Phase 36C6D: local fake adapter dry-run
- Phase 36C6E: credential storage design
- Phase 36C6F: real provider pilot proposal, approval required

## 20. Final Safety Rule

No provider-backed output becomes Mougle truth, package state, ledger state, public copy, or publishable media until it passes policy checks, redaction, admin review, and an explicit future manual gate.
