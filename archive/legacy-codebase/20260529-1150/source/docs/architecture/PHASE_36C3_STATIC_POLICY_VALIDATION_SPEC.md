# Phase 36C3 - Static Policy Validation Checks for Package Safety

## Status

Local static checker implemented.

This phase defines the static validation layer that should run before Mougle adds workers, provider adapters, external calls, publishing, or database-backed council ledgers.

Phase 36C3 must not add external provider calls, queue workers, schema changes, migrations, database writes, publishing behavior, checkout, payouts, provider/model disclosure, or secret access.

## Purpose

Phase 36C3 protects the Council Governance Layer by checking that typed package data, admin preview copy, and council governance docs stay inside Mougle's safety boundary.

The validator should answer:

- Is this package still admin-only and read-only?
- Does the package preserve `Publish Decision Required`?
- Are status, source-tier, originality, visual, and publish fields valid?
- Are social signals separated from verified fact?
- Are provider/model names and routing details hidden?
- Does the package avoid active publishing, autonomous live, or guaranteed-truth claims?
- Does the package preserve MIV memory separation?
- Does the package avoid copied-expression, transcript-rewrite, or unsafe visual-language claims?

## Non-Goals

Phase 36C3 does not:

- call external AI providers
- add provider adapters
- call video, social, or publishing APIs
- run background jobs
- add queue workers
- mutate database state
- change Drizzle schema
- add migrations
- run `db:push`
- enable autonomous publishing
- add checkout, payout, payment, or marketplace deployment behavior
- read or expose `.env`, credentials, provider configuration, model names, routing, fallbacks, or environment values

## Inputs

Initial static validation should inspect only source-controlled files and mock/static objects:

- `shared/models/council-governance.ts`
- `server/data/council-governance-registry.ts`
- `server/services/council-governance-service.ts`
- `client/src/pages/admin/CouncilGovernance.tsx`
- `docs/architecture/PHASE_36C_NEWS_DEBATE_COUNCILS.md`
- `docs/learning/PHASE_36C_NEWS_DEBATE_EXPLAINER_SCRIPT.md`

Future checks may include additional public/user/admin UI copy once Phase 36C concepts appear beyond the admin dashboard.

## Output Contract

The validator should produce a structured report, preferably JSON plus human-readable console output.

Suggested shape:

```ts
type PolicySeverity = "pass" | "warning" | "fail";

type PolicyFinding = {
  ruleId: string;
  severity: PolicySeverity;
  file: string;
  message: string;
  recommendation: string;
};

type CouncilPackagePolicyReport = {
  status: "pass" | "pass_with_warnings" | "fail";
  checkedAt: string;
  checkedFiles: string[];
  findings: PolicyFinding[];
  summary: {
    errors: number;
    warnings: number;
    passes: number;
  };
};
```

## Command

Run the current local-only static checker with:

```bash
node --import tsx script/council-policy-check.ts
```

For JSON output:

```bash
node --import tsx script/council-policy-check.ts --json
```

The command should not require network access, database access, `.env`, credentials, browser automation, or external services.

A future package script alias may be added after the package file is clean:

```bash
npm run council:policy-check
```

## Policy Rule Groups

### 1. Package Contract Integrity

Validate that mock `NewsContentPackage` and `DebateContentPackage` objects conform to the Phase 36C1 TypeScript contracts.

Required checks:

- `contentType` is one of the approved typed values
- `status` is one of `verified`, `developing`, `monitoring_only`, `rejected_for_publication`
- `sourceTier` is one of the approved source-tier values
- `originalityStatus` is one of `original`, `reference_safe`, `needs_rewrite`, `blocked_rights_risk`
- `visualPackageType` is one of the approved visual package values
- `publishDecision` is one of the approved publish decision values
- `schemaType` matches the package object type
- `publishTargets` use planned/configured language
- `sourceCount` is a non-negative number
- `MougleChiefScore` is between `0` and `1`
- `TCS` and `UES` are either `null` or between `0` and `1`

Fail if a package uses loose strings, raw untyped values, missing required fields, or active publish-ready language.

### 2. Publish Gate Enforcement

Validate that all static/mock packages remain gated.

Required checks:

- mock packages must use `publish_decision_required` unless deliberately blocked or rejected
- admin UI must render `Publish Decision Required`
- copy must not say a package can publish from the dashboard
- copy must not imply automatic posting, active live streaming, or autonomous publishing
- package previews must remain read-only

Fail if any copy implies the system can publish, stream, upload, distribute, or post without a future explicit admin workflow.

### 3. Provider Non-Disclosure

Validate that Phase 36C surfaces do not expose external provider or model identity.

Required checks:

- public/admin display names use robot-style council names, not external model/provider names
- tooltips do not reveal provider names, model versions, routing, fallback, or orchestration details
- docs and UI use provider-abstracted wording
- registry entries keep provider disclosure as hidden/internal-only

Fail if Phase 36C UI, docs, metadata, package text, script text, or agent dialogue exposes provider names, model names, model versions, routing, fallback routing, or "powered by" claims.

### 4. Robot Council Naming

Validate that council slots remain user-readable and provider-abstracted.

Required checks:

- news council uses robot-style display names as primary names
- debate council uses robot-style display names as primary names
- admin machine slots may appear only as admin/debug detail
- backend roles may appear only as admin/debug detail
- machine slots are not used as the primary visible identity

Warn if machine slots are visually louder than robot names in admin UI.

Fail if public/user-facing surfaces use machine slots as primary names.

### 5. Truth vs Meaning Separation

Validate that news and debate packages keep distinct product purposes.

Required checks:

- news package language answers what happened and how verified it is
- debate package language answers what it means, strongest positions, and unresolved questions
- debate copy does not present opinion as verified fact
- news copy does not present social trend as verified fact

Fail if news and debates are treated as one identical process or if social trend language becomes fact language.

### 6. Status Ladder Safety

Validate safe status vocabulary.

Required checks:

- use `monitoring_only` for tracked-but-not-verified items
- avoid standalone "unverified" as a product status in new Phase 36C UI
- `rejected_for_publication` is used for blocked items
- status labels explain the safety meaning

Warn for legacy "unverified" in older code outside Phase 36C.

Fail for new Phase 36C package or UI copy that uses "unverified" without "monitoring only" framing.

### 7. Source-Tier Safety

Validate source-tier use.

Required checks:

- source tiers use approved typed values
- tier 4 social signal is never treated as verified fact
- tier 5 unverified claim cannot support a verified package
- source count is visible in admin preview
- evidence references are visible in admin preview

Fail if social signal or unverified claim language supports a verified verdict without a higher-trust evidence path.

### 8. Originality and Rights Gate

Validate that originality and rights remain first-class.

Required checks:

- every package has `originalityStatus`
- every package has `copyrightRisk`
- every package has `visualPackageType`
- admin UI explains the originality and rights gate
- docs say facts may be used after verification but expression must be original to Mougle
- visual package language stays licensed, owned, public-domain/government where legally usable, AI-generated, or reference-safe

Fail if copy implies Mougle copies, rewrites, remakes, imitates, or closely follows source articles, scripts, transcripts, video packages, titles, slides, or third-party footage.

### 9. Live-Ready Wording

Validate that "Live" does not imply active real-time streaming.

Required checks:

- use `live-ready` or package-ready wording when no real-time stream exists
- use planned/configured target wording for future channels
- do not claim active external live publishing
- do not claim active provider-backed streaming

Fail if copy says or implies live provider systems are active when the current feature is only a static/admin preview.

### 10. MIV Memory Separation

Validate that Mougle Intelligence Vault stays policy-filtered.

Required checks:

- MIV is described as a governed view, not one unrestricted memory table
- private user memory is excluded unless an explicit permissioned workflow exists
- personal, business, public, behavioral, and verified knowledge remain separated
- package copy does not imply private memory is available to news or debate councils

Fail if any Phase 36C copy says or implies MIV is a mixed unrestricted memory pool.

### 11. Admin-Only Read-Only Boundary

Validate that Phase 36C remains root-admin/internal and read-only.

Required checks:

- API endpoints are admin-gated
- package previews use static/configured/mock data
- ledger entries are sample/planned only
- no form or button triggers publishing, queueing, provider calls, DB writes, or schema changes

Fail if any Phase 36C implementation mutates DB state, calls external systems, starts workers, or adds publish actions.

## Severity Guidance

Use `fail` for:

- provider/model disclosure
- autonomous publishing claims
- active live-provider claims
- schema/migration/DB mutation
- private memory leakage
- missing originality and rights gate
- missing publish decision gate
- social signal treated as verified fact
- package objects that do not conform to typed contracts

Use `warning` for:

- legacy copy outside Phase 36C that should be cleaned later
- admin machine slots shown too prominently
- missing helper text on a non-critical admin-only section
- package copy that is technically safe but unclear

Use `pass` for:

- compliant typed package fields
- compliant read-only/admin-only language
- compliant provider-abstracted council names
- compliant live-ready/publish-gated language

## Future Implementation Shape

Recommended future files:

- `scripts/council-policy-check.ts`
- `server/policies/council-package-policy.ts`
- `shared/models/council-policy.ts`
- `docs/architecture/PHASE_36C3_STATIC_POLICY_VALIDATION_SPEC.md`

The first implementation should be local-only and source-static. It should not require a running server.

## Acceptance Criteria For Phase 36C3 Implementation

When this spec becomes an implementation phase:

1. Static policy check command exists.
2. Command runs without `.env`.
3. Command performs no network, database, provider, queue, browser, or publishing work.
4. Command validates mock package objects against typed policy expectations.
5. Command detects unsafe provider/model disclosure in Phase 36C surfaces.
6. Command detects unsafe active publishing/live/autonomous claims.
7. Command detects missing `Publish Decision Required` on static package previews.
8. Command detects source-tier misuse, especially social signals treated as verified fact.
9. Command detects missing originality/rights gate fields.
10. Command exits non-zero on fail-level findings.
11. Command produces a readable report for admins/developers.
12. `git diff --check`, `npm run check`, and `npm run build` pass.

## Deferred Work

- Phase 36C3 implementation of local static checker
- Phase 36C4 event/worker architecture plan, still no workers
- Phase 36C5 provider adapter contract design, dry-run only
- Phase 36C6 manual-gated provider pilot, no autonomous publishing
- Future CI integration after local policy checker stabilizes
