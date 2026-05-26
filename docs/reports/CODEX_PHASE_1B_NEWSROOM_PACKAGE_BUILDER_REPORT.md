# Phase 1B — Newsroom Data-Package Builder (Pure, Dry-Run Only)

**Status:** Merged. Pure, deterministic, no DB / no provider / no render impact.

## Files changed

| File | Kind | Purpose |
|---|---|---|
| `server/services/newsroom/newsroomDataPackageBuilder.ts` | **NEW** | Pure builder: `buildNewsroomDataPackage`, `deriveNewsroomSafetyNotes`, `validateNewsroomDataPackage`, `summarizePackageVerification`, plus `NewsroomPackageRejectedError`. |
| `server/routes/newsroom-preview-routes.ts` | modified | Added optional `POST /api/admin/newsroom/package-preview` dry-run endpoint behind `requireRootAdmin`. |
| `tests/newsroom-package-builder.test.ts` | **NEW** | 21 tests covering builder, safety derivation, gating, validation, summariser, and the route. |
| `package.json` | modified | Added the new test file to the `test` script. |

No other files touched. **`shared/schema.ts` was not modified.** **`shared/newsroom-schema.ts` is not imported by production schema.**

## Contracts used (all from `shared/newsroom-types.ts`)

- `VerifiedKnowledge`, `VerifiedKnowledgeStatus`
- `VerifiedClaim`, `VerifiedClaimEvidence`, `ClaimVerdict`
- `VerifiedMediaReference`, `RightsStatus`
- `VerifiedTimelineEvent`
- `NewsroomDataPackagePayload`, `NewsroomDataPackagePayloadSchema`
- `NewsroomSafetyNotes`, `NewsroomSafetyNotesSchema`
- `PackageTemplate` (default `news_desk`)
- `ComplianceFinding`
- `VerificationStatus` (for `workflowStatus` gating)

Every output is validated through `NewsroomDataPackagePayloadSchema.parse` and `NewsroomSafetyNotesSchema.parse` before return — invalid output is impossible.

## Builder behavior summary

**Input** (`NewsroomPackageBuildInput`): `verifiedKnowledge`, optional `mediaRefs[]`, optional `timelineEvents[]`, optional `template` (default `news_desk`), optional `version` (default `1`), required `generatedAt` (caller-supplied for determinism), optional `workflowStatus`, optional `previewMode`.

**Mapping**:
- `title` ← `canonicalTitle` clamped to 80 chars
- `subtitle` ← first sentence of `canonicalSummary`, clamped to 120
- `headline.text` ← `canonicalTitle` clamped to 120, `durationMs: 4000`
- `lowerThirds[]` ← first 3 `keyFacts`, each 5 s, staggered every 6 s from 0
- `tickerItems[]` ← first 6 `keyFacts`, each clamped to 140 chars
- `segments[]` ← single `two_minute` segment with `narrationText = canonicalSummary` (≤4000), `durationMs ≈ chars/15·1000` floored at 5 s
- `sourceEvidenceReferences[]` ← `claim.evidence[]` flattened, `status = verdict ?? "needs_human_review"`, `confidenceScore = verdictConfidence`
- `mediaRefs[]` ← `{ mediaId, usage: image→background / clip→insert / chart→insert, rightsStatus }`
- `complianceNotes[]` ← `[LEVEL] CODE: message` for every blocking + warning finding
- `safetyLabels[]` ← always includes `INTERNAL_PREVIEW_ONLY`, plus `DEVELOPING_STORY` / `DISPUTED_STORY` / `CORRECTION` / `REJECTED_BY_WORKFLOW` / `NON_PUBLISHABLE` as applicable

**Gating** (`workflowStatus`-driven; falls back to `verifiedKnowledge.status`):
- `rejected` → throws `NewsroomPackageRejectedError` unless `previewMode: true`
- `raw` / `clustered` / `extracting_claims` / `verification_pending` → throws unless `previewMode: true`
- In preview mode: payload is still built, but `publishable: false`, a blocking finding is recorded, and a `REJECTED_BY_WORKFLOW` label is added.

**Safety derivation** (`deriveNewsroomSafetyNotes`):
- `internalAdminReviewOnly: true` (literal), `manualRootAdminTriggerOnly: true` (literal)
- `publicPublishing: false`, `youtubeUpload: false`, `socialPosting: false` (all literal-locked by schema)
- Blocking findings: `WORKFLOW_REJECTED`, `WORKFLOW_NOT_APPROVED`, `STORY_DISPUTED`, `MEDIA_RIGHTS_BLOCKED`
- Warning findings: `STORY_DEVELOPING`, `STORY_CORRECTION`, `MEDIA_RIGHTS_REVIEW` (fair_use_review, rights_unknown), `LOW_AGGREGATE_CONFIDENCE` (<0.5)
- `rightsIssues[]` lists every media with `rightsStatus ∈ {blocked, fair_use_review, rights_unknown}`

**Publishable gate** (informational only — downstream still requires manual root-admin action):
- `false` when any blocking finding exists OR `verifiedKnowledge.status ∈ {developing, disputed}`
- `publishable: true` does **not** authorise auto-publish; the safety envelope still locks all publish/social/live flags off.

## Endpoint added

`POST /api/admin/newsroom/package-preview`
- Mounted in `registerNewsroomPreviewRoutes(app, requireRootAdmin)` — gate identical to the existing two routes.
- Inherits global CSRF from `/api`.
- Requires `dryRun: true` Zod literal in body.
- Returns `{ ok, dryRun: true, promoted: false, renderStarted: false, publishQueued: false, publishable, publishableReason, payload, safetyNotes, timelineEvents, summary }`.
- `409 package_rejected` for rejected/unapproved input without `previewMode: true`.
- Calls only the pure builder — no DB writes, no provider calls.

## Constraint verification

| Constraint | Verified |
|---|---|
| `shared/schema.ts` untouched | `git diff HEAD -- shared/schema.ts` empty |
| `shared/newsroom-schema.ts` not imported by prod schema | `rg "newsroom-schema" shared/schema.ts` empty |
| No `db:push` run | none invoked in this turn |
| No migrations added | no files under `migrations/` changed |
| No external providers called | builder imports only `shared/newsroom-types.ts`; no `openai`, `resend`, `axios`, `fetch`, etc. |
| No autonomous publishing | safety schema literal-locks all publish flags to `false` |
| No render execution | builder produces data only; no call into `avatar-video-render-service` or `render-srt-service` |
| No public routes | route mounted under `/api/admin/...` behind `requireRootAdmin` |
| No new dependencies | `package.json` `dependencies`/`devDependencies` unchanged |
| Fully deterministic + testable | `generatedAt` is caller-supplied; no `Date.now()`/`Math.random()` in builder; determinism test passes |

## Test results

```
npm test → 163/163 pass (was 142; +21 new)
npx tsc --noEmit → clean
```

New test file `tests/newsroom-package-builder.test.ts` covers:
- valid verified input → schema-valid payload ✓
- extracted claims preserved (with null verdict → `needs_human_review`) ✓
- evidence URLs preserved across all claims ✓
- media rights status preserved verbatim ✓
- timeline events passed through unchanged ✓
- determinism (identical input → identical output) ✓
- safety flags always force `publicPublishing / youtubeUpload / socialPosting = false` ✓
- disputed → non-publishable + blocking `STORY_DISPUTED` ✓
- developing → non-publishable + warning `STORY_DEVELOPING` ✓
- blocked media → blocking `MEDIA_RIGHTS_BLOCKED` + rights-issue entry ✓
- `fair_use_review` / `rights_unknown` → warnings only ✓
- rejected workflow without `previewMode` → throws `NewsroomPackageRejectedError` ✓
- `verification_pending` without `previewMode` → throws ✓
- rejected + `previewMode: true` → builds, non-publishable, `REJECTED_BY_WORKFLOW` label ✓
- `validateNewsroomDataPackage` returns clear issues for invalid input ✓
- `summarizePackageVerification` counts claims/evidence/sources/media/findings ✓
- Route: missing `dryRun` → 400 ✓
- Route: success returns `promoted/renderStarted/publishQueued = false` and safety flags off ✓
- Route: rejected workflow → 409 ✓
- Route: rejected + previewMode → 200 with non-publishable payload ✓

## Rollback notes

Safe to revert with no DB or runtime impact:
1. `git rm server/services/newsroom/newsroomDataPackageBuilder.ts tests/newsroom-package-builder.test.ts`
2. Revert the route hunk in `server/routes/newsroom-preview-routes.ts` (the bottom `app.post(...)` block + the 3 new imports + the `PackagePreviewBodySchema`).
3. Remove `tests/newsroom-package-builder.test.ts` from the `test` script in `package.json`.

No data migrations, no schema changes — rollback is purely code.

## Remaining work before production integration

Strictly out of scope for this PR; needed before any package is rendered or surfaced beyond admin preview:

1. **Persistence layer** — wire `shared/newsroom-schema.ts` through a migration (`newsroom_data_packages`, `verified_*` tables) and add `IStorage` methods. Until then the builder runs on caller-supplied data only.
2. **Promote-to-package route** — non-dry-run admin action that takes a `verifiedKnowledgeId`, loads VK + claims + media + timeline from the DB, calls `buildNewsroomDataPackage`, and persists the payload. Must remain root-admin-only.
3. **Render-manifest builder** — separate pure module that converts a stored package into `NewsroomRenderManifest` (already contract-defined in `shared/newsroom-types.ts` §13). Hand off to the existing Phase 1A render baseline via `preview_metadata.renderBaseline.newsroomLink`.
4. **Source reliability lookup** — `effectiveReliability`/`tierFromReliability` are pure helpers; a service layer to compute these from historical accuracy + retraction events is still TBD.
5. **Rights-vetting workflow** — admin UI to resolve `fair_use_review` / `rights_unknown` items before a package can flip to `publishable: true`.
6. **Confidence numeric model v1** — current `verifiedKnowledge.confidence` is supplied by caller; the formula needs a deterministic implementation per architecture §11.
7. **Public surfacing** — never automatic. Must remain behind manual root-admin trigger and continue to honour the literal-locked safety envelope.

— end of report —
