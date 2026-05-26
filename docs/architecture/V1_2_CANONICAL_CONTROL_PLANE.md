# V1.2 Canonical Control Plane

Date: 2026-05-26
Status: cleanup architecture target (not fully implemented in this PR)

## Target flow

1. `traceId` creation
- Every inbound request/event gets a trace identifier at intake.

2. Event intake
- Inputs: user action, admin action, automation signal, or system event.

3. Classification
- Classify domain + sensitivity + execution posture (active/preview/dry_run/approval_required/admin_only/disabled/future).

4. Task contract
- Normalize action intent into a typed contract payload.

5. Agent passport check
- Validate actor identity, capability scope, and revocation state.

6. Vault routing
- Route data access to permitted memory/data vault surfaces only.

7. Permission check
- Enforce policy + role + admin gate constraints.

8. Risk score
- Evaluate operational/legal/safety risk and required mitigations.

9. TRUTH routing (when needed)
- Send claim/evidence-sensitive flows through truth-governance scoring.

10. Approval decision
- Decide: auto-allow, require human approval, or reject.

11. Outcome mode
- Route to `preview`, `simulate`, `block`, or controlled `execute`.

12. Audit log
- Persist immutable decision + action telemetry with trace linkage.

13. Value event
- Emit value/economy/metric event into ledger and observability layers.

## Future module boundaries

- `task-contract-service`
- `agent-passport-service`
- `vault-router-service`
- `permission-engine`
- `risk-engine`
- `truth-router`
- `approval-service`
- `audit-ledger-service`
- `value-ledger-service`
- `metric-registry-service`
- `policy-registry-service`

## Implementation policy

- Use modular-monolith boundaries first.
- Avoid premature microservice extraction.
- Keep production-house paths preview-first and dry-run-first.
- Keep all high-risk execution flows explicit and approval-gated.
