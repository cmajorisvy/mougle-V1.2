# Phase 36C5 - Provider Adapter Contract Design, Dry-Run Only

## 1. Current Boundary

Phase 36C5 is documentation and architecture design only.

This phase does not add provider adapters, external calls, credentials, routing, model selection, workers, queues, schema changes, migrations, database writes, package scripts, app routes, live orchestration, publishing, or public provider/model disclosure.

No adapter code is implemented. No TypeScript skeletons are introduced. No provider or vendor endpoint is configured.

## 2. Why This Phase Exists

Mougle Council Governance needs a provider abstraction contract before any provider or model integration exists.

The goal is to prevent future teams from accidentally:

- exposing vendor identity
- leaking model names or routing details
- storing raw prompts or completions in package views
- treating provider output as council truth
- bypassing the Redaction Wall
- bypassing Phase 36C3 policy checks
- bypassing Phase 36C4 event safety envelopes
- bypassing manual publish gates

This plan defines the future adapter boundary while keeping the current system dry-run only.

## 3. Adapter Purpose

Future adapters should:

- convert council role requests into provider-abstracted dry-run requests
- normalize outputs into Mougle council language
- preserve robot council identities
- hide provider, vendor, route, fallback, and model identity
- return policy-checkable council output
- include audit-ready metadata without exposing vendor details

Future adapters must never:

- expose provider/vendor/model names
- decide publishability
- bypass policy gates
- bypass manual approval
- access private memory unless an explicit permissioned workflow exists in a later approved phase
- publish, stream, upload, distribute, or post
- leak raw prompts, raw completions, raw provider responses, credentials, routing, or environment values

## 4. Redaction Wall

The Redaction Wall is a core Mougle provider-boundary concept.

Definition:

> The Redaction Wall separates private provider execution details from Mougle council outputs. Only normalized, provider-abstracted, policy-checked council results may cross into admin package views, package previews, ledger proposals, or public/user surfaces.

What stays behind the wall:

- provider names
- model names
- model versions
- endpoints
- routing
- fallback routing
- credentials
- raw prompts
- raw completions
- raw provider responses
- vendor token details
- provider-specific error payloads
- environment values

What may cross the wall:

- normalized council output
- confidence
- evidence references
- risk flags
- policy result
- redacted adapter metadata
- audit notes
- council agent public robot name
- council role/profession
- capability type

The Redaction Wall must be tested before any adapter moves beyond `docs_only`.

## 5. Adapter Identity Boundary

Public/admin package views may see:

- `adapterSlotId`
- `councilAgentName`
- `councilRole`
- `publicProfession`
- `capabilityType`
- `providerDisclosurePolicy: hidden`
- `activationLevel`
- `dryRunOnly`

Public/admin package views must never see:

- provider name
- model name
- endpoint
- routing
- fallback
- token usage by vendor
- credentials
- raw provider response
- raw prompt
- raw completion

Machine-slot details may exist only in explicitly approved internal/debug tooling. Robot council identities remain the primary human-facing names.

## 6. Future Dry-Run Request Shape

This is illustrative only. It is not implemented and is not a schema.

```ts
type ProviderAdapterDryRunRequest = {
  envelope: CouncilEventSafetyEnvelope;
  packageId: string;
  councilType: "news_verification_council" | "debate_council";
  councilAgentName: string;
  councilRole: string;
  publicProfession: string;
  adapterSlotId: string;
  capabilityType:
    | "event_synthesis"
    | "context_review"
    | "source_reliability"
    | "evidence_review"
    | "argument_review"
    | "originality_review";
  allowedInputs: string[];
  forbiddenOutputs: string[];
  policyChecks: string[];
  dryRunOnly: true;
  requiresAdminApproval: true;
};
```

The request must be launched from a Phase 36C4 event safety envelope.

## 7. Future Response Shape

This is illustrative only. It is not implemented and is not a schema.

```ts
type ProviderAdapterDryRunResponse = {
  normalizedCouncilOutput: string;
  confidence: number;
  evidenceReferences: string[];
  riskFlags: string[];
  policyResult: "pass" | "warning" | "fail";
  redactedAdapterMetadata: {
    adapterSlotId: string;
    capabilityType: string;
    providerDisclosurePolicy: "hidden";
    redactionStatus: "passed" | "blocked";
  };
  auditNotes: string[];
  recommendedNextAction:
    | "keep_in_review"
    | "request_more_evidence"
    | "send_to_originality_gate"
    | "block_until_admin_review";
  publishDecision: "publish_decision_required";
};
```

Response rule:

Never raw provider output. Only normalized, redacted, policy-checkable Mougle council output may cross the Redaction Wall.

## 8. Forbidden Fields Hard Denylist

Future policy checks should fail if these fields appear in package views, ledger proposals, public/user surfaces, or non-debug admin surfaces:

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

The denylist applies to visible UI, package previews, ledger proposal payloads, metadata, scripts, public/user copy, staff-facing summaries, and non-debug admin surfaces.

## 9. Activation Levels

Phase 36C5 follows the Phase 36C4 activation ladder:

- `docs_only`
- `dry_run`
- `admin_review_required`
- `manual_execute`
- `production_active`

Provider adapters must not pass `dry_run` until:

- policy checker passes
- safe mode exists
- audit logging exists
- redaction works
- admin review path exists
- forbidden field scan passes
- provider names remain hidden
- manual publish gate remains enforced

No adapter may silently move between activation levels.

## 10. Failure Modes

Future adapters must handle:

- provider unavailable
- timeout
- unsafe output
- policy failure
- redaction failure
- private memory requested
- forbidden field detected
- route attempted without approval
- provider-specific error leakage
- malformed normalized output

Default behavior:

- fail closed
- preserve `Publish Decision Required`
- record audit notes
- require admin review
- do not retry sensitive requests automatically without policy approval
- do not publish or distribute anything

## 11. Audit Requirements

Future adapter activity must record:

- eventId
- packageId
- adapterSlotId
- councilAgentName
- councilRole
- activationLevel
- dryRunOnly
- policyChecks
- redactionStatus
- outcome
- riskFlags
- requestedBy
- timestamp

Audit records visible outside explicitly approved internal-only debug tooling must not include:

- provider identities
- raw prompts
- raw completions
- credentials
- routing
- fallback routing
- environment values

## 12. Compatibility With Phase 36C3 Static Policy Checker

Future adapter outputs must pass static policy checks before promotion into:

- package preview
- Council Package Review Workbench
- ledger proposal
- public-facing package copy
- staff-facing summaries

The policy checker should reject:

- provider/model disclosure
- active publishing claims
- missing `Publish Decision Required`
- social signal treated as verified fact
- missing originality/rights gate
- forbidden fields crossing the Redaction Wall

Phase 36C5 does not change the checker; it defines what future adapter output must satisfy.

## 13. Compatibility With Phase 36C4 Event Safety Envelope

Every future adapter call must be launched from a Phase 36C4-style event safety envelope.

The event must carry:

- activation level
- allowed actions
- forbidden actions
- policy checks
- audit context
- idempotency key
- requestedBy
- requiresAdminApproval

Adapter requests without a valid safety envelope must fail closed.

## 14. Manual Publish Gate

No adapter response may publish, upload, stream, distribute, or post.

Adapter output can only inform admin review and must keep `Publish Decision Required` unless a later manual-gated publishing phase explicitly changes the boundary.

Dry-run output is not publish approval.

Council output is not publish approval.

Provider output is not publish approval.

## 15. Provider Non-Disclosure Policy

Future adapter, event, worker, admin, package, script, metadata, and public surfaces must hide:

- provider names
- model names
- routing
- fallbacks
- credentials
- raw prompts
- raw completions
- vendor identity
- provider-specific errors
- environment values

Provider identity can exist only inside explicitly approved internal-only debug tooling and must not appear in package views, public/user surfaces, package metadata, council dialogue, scripts, captions, or review workbench output.

## 16. Tooltips and Staff/Admin Learning Requirements

Any future adapter/admin/debug page must include:

- tooltip on every new concept
- bottom learning sections:
  - How to use this
  - What this means
  - How it works
  - What cannot happen from this screen

Tooltip topics should include:

- Redaction Wall
- adapterSlotId
- providerDisclosurePolicy
- dryRunOnly
- normalizedCouncilOutput
- policyResult
- forbidden fields
- manual publish gate
- audit notes
- activation level

### How to use this

Use this contract to design future provider adapters without revealing vendor details, bypassing policy checks, or treating dry-run output as publishable council truth.

### What this means

Mougle can prepare a provider abstraction boundary before any provider is connected. The contract describes what may cross into admin/package views and what must stay hidden behind the Redaction Wall.

### How it works

Future adapter calls must start from a Phase 36C4 event safety envelope, run in an approved activation level, produce normalized council output, pass forbidden-field redaction, pass Phase 36C3 policy checks, and remain gated by `Publish Decision Required`.

### What cannot happen from this screen

This phase cannot call a provider, choose a model, route requests, store raw prompts, store raw completions, publish media, upload files, post to social channels, mutate the database, start a worker, create a queue, or bypass manual approval.

## 17. What Cannot Be Built Yet

Do not build:

- real provider adapters
- API credentials
- model routing
- fallback routing
- raw prompt storage
- raw completion storage
- provider-specific audit logs
- autonomous council execution
- autonomous publishing
- public provider disclosure
- DB-backed provider run ledger
- worker execution

These require later explicit approval and safety implementation.

## 18. Future Readiness Checklist

Before provider adapter implementation:

- [ ] Phase 36C3 policy checker passes.
- [ ] Phase 36C4 event safety envelope exists in implementation.
- [ ] Redaction Wall scan exists.
- [ ] Forbidden field scan exists.
- [ ] Safe mode exists.
- [ ] Audit logging exists.
- [ ] Admin review path exists.
- [ ] Provider non-disclosure tested.
- [ ] Dry-run output reviewed.
- [ ] Private memory boundary tested.
- [ ] Manual publish gate enforced.
- [ ] Rollback/disable path exists.
- [ ] Tooltips and bottom learning blocks exist.
