# Phase 1B — Newsroom Data-Package Generator (Panel-shaped, Pure)

**Status:** Merged. Pure, deterministic, no DB / no provider / no render impact.

## Scope vs prior PR

This is a **distinct artifact** from the prior `NewsroomDataPackagePayload` builder (`server/services/newsroom/newsroomDataPackageBuilder.ts`):

| | Prior PR (render-payload builder) | This PR (panel-data generator) |
|---|---|---|
| Output type | `NewsroomDataPackagePayload` (locked Zod contract for render baseline) | `NewsroomDataPackage` (UX panel-shaped: anchorScript, lowerThird, ticker, source/map/timeline/market panels, eventMedia, safety flags) |
| Input sources | `VerifiedKnowledge` only | `VerifiedKnowledge` **or** published `NewsArticle` (fallback) |
| Purpose | Hand to the render pipeline | Drive the on-screen newsroom panels in the admin preview |
| Schema | Zod-validated against `shared/newsroom-types.ts` | Plain TypeScript interface (UX-facing, not a render contract) |

Both modules are pure, deterministic, and admin-only.

## Files changed

| File | Kind | Purpose |
|---|---|---|
| `server/services/newsroom-data-package-service.ts` | **NEW** | Panel-shaped `generateNewsroomDataPackage(input)` with `verified` + `published_article` input variants. |
| `tests/newsroom-data-package-service.test.ts` | **NEW** | 11 tests (verified path, fallback path, missing-field safety, determinism, safety lock). |
| `package.json` | modified | Added the new test file to the `test` script. |

No other files touched. **`shared/schema.ts` was not modified.** **`shared/newsroom-schema.ts` is not imported by production schema.**

## Contracts used

- From `shared/newsroom-types.ts` (read-only): `VerifiedKnowledge`, `VerifiedMediaReference`, `VerifiedTimelineEvent`, `VerifiedClaim`, `VerificationStatus`, `ConfidenceLevel`, `SourceReliabilityTier`, `MediaKind`, `RightsStatus`, `TimelineEventType`, `confidenceLevelOf()`.
- From `shared/schema.ts` (type-only via `NewsArticle`): the published-article fallback consumes a `Pick<NewsArticle, ...>` shape. No runtime import of the Drizzle table.

## Output shape — `NewsroomDataPackage`

```
packageId                "nrpkg_vk_<id>_v<n>" or "nrpkg_art_<id>_v<n>"
source                   "verified_knowledge" | "published_news_article"
verifiedKnowledgeId      string | null
sourceArticleId          number | null
headline                 string (≤120)
shortHeadline            string (≤60)
summary                  string
anchorScript             { segments: [open, body, close], estimatedDurationMs }
lowerThird               { primary, secondary | null }
tickerItems              string[] (≤6)
sourcePanel              { primarySource, additionalSources[], distinctSourceCount }
mapPanel                 { primaryLocation, locations[] } | null
timelinePanel            { events: [{occurredAt, summary, kind}] } | null
marketOrDataPanel        { metrics: [{label, value}] } | null
eventMedia               EventMedia[]   (each: id, kind, rightsStatus, approved, note, sourceUrl, storageKey)
confidenceLabel          "low" | "medium" | "high" | "very_high" | "unknown"
verificationStatus       VerificationStatus
rightsStatus             "all_clear" | "needs_review" | "blocked" | "no_media"
language                 string | null
geo                      string | null
safetyFlags              { publicPublishing:false, youtubeUpload:false, socialPosting:false, autonomousExecution:false,
                           manualRootAdminTriggerOnly:true, internalAdminReviewOnly:true, nonPublishableReasons[] }
missingFields            string[]
generatedAt              string (caller-supplied ISO)
```

## Deterministic rules — how no-hallucination is enforced

1. **Headlines / lower thirds / ticker** are slices of caller-supplied `canonicalTitle` / `keyFacts[].statement`. Nothing generated. Long text is clamped with an ellipsis.
2. **Anchor script** uses only fixed templates plus caller-supplied text. The close line literally says "for internal review only" plus the verification status.
3. **Source panel** is built strictly from `claim.evidence[].url/sourceName/sourceTier`. Hostnames are de-duped via `URL.hostname` (no fabrication).
4. **Map panel** uses a closed location lexicon scanned over caller text only. If no hits → `null` and `missingFields += "mapPanel"`. No reverse-geocoding, no API calls.
5. **Market/data panel** pulls `claim.metric` when present, otherwise a single regex hit from `claim.statement`. Skips `contradicted` claims. Empty → `null` + `missingFields += "marketOrDataPanel"`.
6. **Timeline panel** is caller-supplied events sorted ascending by `occurredAt`. The fallback path emits one `article_published` event from `publishedAt` only.
7. **Event media** — only items the caller passed in. The fallback path's hero image is always emitted with `rightsStatus: "rights_unknown"` and `approved: false`.
8. **Approval defense-in-depth** — a media item is `approved: true` only when (a) its `rightsStatus ∈ {owned, licensed}` AND (b) the surrounding package has no `nonPublishableReasons`. Otherwise the generator force-flips every media's `approved` to `false`.
9. **`missingFields`** explicitly records every panel / field the caller did not supply. The caller can render "—" without guessing.
10. **No `Date.now()` / `Math.random()`** in the generator. `generatedAt` is caller-supplied; `packageId` is derived from the input id + version.

## Safety locks

`safetyFlags` is hard-locked at the TypeScript type level:

```ts
publicPublishing: false   // literal
youtubeUpload: false      // literal
socialPosting: false      // literal
autonomousExecution: false// literal
manualRootAdminTriggerOnly: true   // literal
internalAdminReviewOnly: true      // literal
```

`nonPublishableReasons[]` accumulates codes such as `workflow_rejected`, `workflow_not_approved:<status>`, `story_disputed`, `story_developing`, `media_rights_blocked`, `media_rights_review`, `low_aggregate_confidence`, and (always for the fallback path) `fallback_unverified_source`.

## Fallback path — published `NewsArticle`

Used when `VerifiedKnowledge` is not available (e.g. the migration-gated `verified_*` tables are not yet active). Behavior:

- `verificationStatus`: collapses any non-`"verified"` article status to `"raw"`.
- `confidenceLabel`: `"unknown"` (no claim-level confidence exists).
- `sourcePanel`: single source with `tier: "unknown"`.
- `mapPanel` / `marketOrDataPanel`: always `null` + listed in `missingFields`.
- `timelinePanel`: single `article_published` event from `publishedAt`, or `null` if missing.
- `eventMedia`: at most one hero image, always with `rightsStatus: "rights_unknown"` and `approved: false`.
- `nonPublishableReasons`: always starts with `"fallback_unverified_source"`.

## Constraint verification

| Constraint | Verified |
|---|---|
| `shared/schema.ts` untouched | `git diff HEAD -- shared/schema.ts` empty |
| `shared/newsroom-schema.ts` not imported by prod schema | `rg "newsroom-schema" shared/schema.ts` empty |
| No DB I/O in the new service | no `storage`, `db`, `drizzle`, `pg`, or `*Storage` imports in `newsroom-data-package-service.ts` |
| No provider calls | no `openai`, `resend`, `fetch(`, `axios`, `node-fetch`, `tts`, `avatar`, `render` imports |
| No new dependencies | `package.json` `dependencies`/`devDependencies` unchanged |
| No autonomous publishing | safety flags type-locked to literal `false` |
| No render execution | no import of `avatar-video-render-service` or `render-srt-service` |
| Fully deterministic | no `Date.now()` / `Math.random()` calls; determinism tests pass |

## Test results

```
npm test → 174/174 pass (was 163; +11 new)
npx tsc --noEmit → clean
```

New test file `tests/newsroom-data-package-service.test.ts` covers:
- verified fixture → complete panel-shaped package ✓
- safety flags literal-locked to false (publish / social / live / autonomous) ✓
- disputed status → non-publishable + media approval double-locked off ✓
- blocked media → `rightsStatus: "blocked"`, approval false, blocking reason recorded ✓
- rejected workflow surfaces in `verificationStatus` and `nonPublishableReasons` ✓
- verified path: deterministic across runs ✓
- published-article fallback → usable package, hero image never approved, `fallback_unverified_source` recorded ✓
- fallback with all-optional-fields missing (no summary / no image / no publishedAt / no sourceUrl) handled without throwing, `missingFields` populated, safety still locked ✓
- fallback with empty title/summary → safe placeholders + `missingFields` records both ✓
- fallback: deterministic across runs ✓
- verified input with no facts / no claims / no media / no timeline / no locations / no metrics → every missing panel flagged, anchor script still valid ✓

## Rollback notes

Safe to revert with no DB or runtime impact:
1. `git rm server/services/newsroom-data-package-service.ts tests/newsroom-data-package-service.test.ts`
2. Remove `tests/newsroom-data-package-service.test.ts` from the `test` script in `package.json`.

No data migrations, no schema changes — rollback is purely code.

## Remaining work before production integration

Strictly out of scope for this PR; needed before the panel package surfaces beyond admin preview:

1. **Admin preview wire-up** — expose `generateNewsroomDataPackage` behind a root-admin dry-run endpoint (mirroring `POST /api/admin/newsroom/package-preview`). Not added in this PR to keep the surface area minimal.
2. **Persistence** — if/when packages need to be saved, add a migration-gated table (likely in `shared/newsroom-schema.ts`) and a thin storage method. Until then the generator runs on caller-supplied data only.
3. **Confidence numeric model v1** — `verifiedKnowledge.confidence` is currently caller-supplied; the formula needs a deterministic implementation per architecture §11.
4. **Richer location/metric extraction** — current implementation uses a small closed lexicon and a single regex. A future structured NER pass (still deterministic) can replace it without changing the output contract.
5. **Language / geo derivation** — currently caller-supplied. A locale inference step (deterministic) is needed before these can fill themselves.
6. **Public surfacing** — never automatic. Must remain behind manual root-admin trigger and continue to honour the literal-locked safety flags.

— end of report —
