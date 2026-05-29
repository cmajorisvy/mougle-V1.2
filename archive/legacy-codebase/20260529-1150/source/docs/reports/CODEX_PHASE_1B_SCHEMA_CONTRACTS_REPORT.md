# Phase 1B — Schema & Contracts Report

**Status:** DRAFT CODE LANDED — NO MIGRATION APPLIED.
**Scope:** Adds the code-level draft for `VerifiedKnowledge` and related Drizzle
tables, TS types, and Zod contracts in a fully migration-safe way. No DB DDL,
no `db:push`, no production data access, no secrets touched, no service
behavior change.

Grounded in:
- `docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md` §§ 2–4, 8–14.

---

## 1. Files Changed

| File | Status | Purpose |
|---|---|---|
| `shared/newsroom-schema.ts` | **new** | Draft Drizzle tables. Not imported anywhere yet. Header explicitly marks migration as pending. |
| `shared/newsroom-types.ts` | **new** | TS types + Zod contracts for every Phase 1B domain object and admin request. |
| `tests/newsroom-zod.test.ts` | **new** | 27 sub-suites of Zod validation tests (110 total assertions). |
| `package.json` | **modified** | One-line addition: registers the new test file in the existing `test` script. No new dependency. |

No other files touched. No existing service, schema, route, or UI changed.

---

## 2. New Drizzle Tables (DRAFT — NOT MIGRATED)

In `shared/newsroom-schema.ts` (file is **not** imported by
`shared/schema.ts`, which is the only schema file `drizzle.config.ts` reads):

| Table | Purpose |
|---|---|
| `verified_sources` | Source-reliability registry (one row per `source_name`/domain). |
| `verified_knowledge` | Canonical, immutable-after-verification knowledge object (one row per verified cluster). |
| `verified_claims` | Cluster- and knowledge-scoped claims; `evidence` denormalized inline as jsonb. |
| `verified_timeline_events` | Append-only timeline of story developments. |
| `verified_media_references` | Recorded media refs with `rights_status` gate. |
| `verification_audit_events` | Append-only audit log of every admin decision and automatic status transition. |

All tables use the same conventions as `shared/schema.ts`:
`varchar` UUID PKs defaulted to `gen_random_uuid()`, `timestamp ... defaultNow()`,
`jsonb` for opaque payloads, `text` enums (validated at the Zod boundary).

`$inferSelect` row types are exported (`VerifiedKnowledgeRow`,
`VerifiedClaimRow`, etc.) for future service code.

---

## 3. New TypeScript Types & Zod Contracts

In `shared/newsroom-types.ts`:

### Enumerations (frozen, exported as `as const` arrays + Zod enums)
- `VerificationStatus` — all 9 spec statuses: `raw | clustered | extracting_claims | verification_pending | verified | developing | disputed | correction | rejected`.
- `ClaimVerdict` — `supported | contradicted | insufficient_evidence | needs_human_review`.
- `RightsStatus` — `owned | licensed | fair_use_review | rights_unknown | blocked`.
- `SourceReliabilityTier` — `tier_a | tier_b | tier_c | untrusted`.
- `ConfidenceLevel` — `low | medium | high | very_high`.
- `TimelineEventType`, `MediaKind`, `PackageTemplate`.

### Pure helpers (matching spec §10)
- `confidenceLevelOf(aggregate)` — coarse banding for UI badges.
- `effectiveReliability({baseScore, recentAccuracy, retractionCount})` — `0.6*base + 0.4*recent − min(0.3, 0.05*retractions)`, clamped 0..1.
- `tierFromReliability(r)` — `≥0.8 a / ≥0.6 b / ≥0.4 c / else untrusted`.

### Domain object schemas
- `VerifiedKnowledgeConfidenceSchema` (formula version pinned to `"v1"`).
- `SourceCoverageRollupSchema`.
- `VerifiedClaimEvidenceSchema`, `VerifiedClaimSchema`.
- `VerifiedKeyFactSchema`, `VerifiedKnowledgeStatusSchema`, `VerifiedKnowledgeSchema`.
- `VerifiedSourceReferenceSchema`, `VerifiedTimelineEventSchema`, `VerifiedMediaReferenceSchema`.
- `NewsroomSegmentSchema`, `NewsroomDataPackagePayloadSchema`.
- `ComplianceFindingSchema`, `NewsroomSafetyNotesSchema` (hard-coded `publicPublishing: false`, `youtubeUpload: false`, `socialPosting: false`).
- `NewsroomRenderLinkSchema` (the field added inside the existing `preview_metadata.renderBaseline.newsroomLink` JSONB — no DB column).
- `RenderLayerSchema`, `SafeZoneSchema`, `RenderSafeZonesSchema`, `RenderTextSafetySchema` — mirror the Phase 1A `RenderBaseline` surface from `server/services/avatar-video-render-service.ts` so `buildRenderBaseline()` can accept the newsroom manifest verbatim.
- `NewsroomRenderManifestSchema` with the Phase 1A baseline locked at the Zod level: `width: 1920`, `height: 1080`, `fps: 30`, `videoCodec: "h264"`, `audioCodec: "aac"`, `captionFormat: "srt"`. Required spec §13 fields (`layers`, `safeZones`, `textSafety`) are all enforced.

### Admin request contracts (root-admin POST bodies)
- `ClusterDraftRequestSchema` (`dryRun` pinned to `true` for Phase 1B).
- `ClaimExtractionRequestSchema`, `ClaimVerifyRequestSchema`.
- `PromoteToVerifiedRequestSchema` (requires `acknowledgeSafetyCheck === true`).
- `BuildPackageRequestSchema`, `BuildRenderManifestRequestSchema`, `PreviewRenderRequestSchema`.
- `AdminDecisionRequestSchema` (subject-polymorphic, action enum-restricted).

---

## 4. Migration Status — NOT APPLIED

- **`shared/newsroom-schema.ts` is NOT imported anywhere** (verified by ripgrep). `drizzle.config.ts` reads only `./shared/schema.ts`, so `drizzle-kit push` does not see these tables. Running `npm run db:push` today produces zero DDL for newsroom tables.
- No SQL was executed against any database (dev or production).
- No environment variable or secret was read or written.
- No row was inserted, updated, or deleted.

This is intentional and matches the user's hard constraint:
> Do not run migration or db:push.

---

## 5. How to Apply Later (out of scope for this PR)

When founder/root admin approves the Phase 1B migration:

1. In `shared/schema.ts`, add at the bottom:
   ```ts
   export * from "./newsroom-schema";
   ```
2. Run `npm run check` to confirm typecheck still passes.
3. In a maintenance window, run `npm run db:push`. Drizzle-kit will create the
   6 new tables in dependency-free order (no FKs across new tables — all
   references are by string id and resolved at the service layer).
4. Seed `verified_sources` from `config/rssFeeds.json` (default tier
   `tier_c`, baseScore `0.5`). Seeder script is also out of scope here.
5. Only after seeding, enable the Phase 1B route handlers (also out of scope).

There is no automation that performs steps 1–5; every one is a manual,
human-gated action.

---

## 6. Rollback Notes

Because no migration has been applied and no production code path imports
the new modules, rollback is trivial:

- **Code rollback:** delete `shared/newsroom-schema.ts`,
  `shared/newsroom-types.ts`, `tests/newsroom-zod.test.ts`, and revert the
  one-line `package.json` change. `npm run check` returns to the prior
  83/83 test baseline.
- **DB rollback:** nothing to do — no tables were created.
- **No data risk:** no production data was read or written.

If migration is later applied and must be reverted:

- `DROP TABLE` the 6 newsroom tables in any order (no cross-FKs).
- `avatar_video_render_jobs` is unaffected — the spec deliberately avoids
  adding columns; the `newsroomLink` reference lives inside the existing
  `preview_metadata` JSONB and is ignored when absent.

---

## 7. Validation Results

- `npm run check` → `tsc` clean; **115/115 tests pass** (was 83/83 before
  this PR; +27 new sub-suites in `tests/newsroom-zod.test.ts`).
- Tests cover: all 9 verification statuses, all 4 claim verdicts, all 5
  rights statuses, all 4 reliability tiers, all 4 confidence levels,
  `confidenceLevelOf` boundaries, `effectiveReliability` math + clamp +
  retraction cap, `tierFromReliability` boundaries,
  `VerifiedKnowledgeConfidenceSchema` aggregate/formula-version rules,
  `VerifiedClaim` evidence URL validation, `VerifiedKnowledge` title-length
  rejection, `NewsroomDataPackagePayload` title/ticker bounds,
  `NewsroomSafetyNotes` hard-coded false flags, render-manifest 1920×1080/30fps
  lock, `PromoteToVerifiedRequest.acknowledgeSafetyCheck`,
  `ClusterDraftRequest.dryRun = true`, `AdminDecisionRequest` enum
  enforcement.

---

## 8. No-db:push Confirmation

- ✅ `npm run db:push` was **not** run during this task.
- ✅ `drizzle.config.ts` was **not** modified (still points only at
  `./shared/schema.ts`).
- ✅ `shared/schema.ts` was **not** modified.
- ✅ No new file is imported by any code path that boots in dev or
  production (verified — no service, route, or React component references
  `newsroom-schema` or `newsroom-types`).
- ✅ No external provider was called (the only new external interaction is
  the existing `node:test` runner consuming Zod schemas in-process).
- ✅ No secret was read.

---

## 9. Spec-vs-User Table Mapping (intentional reconciliation)

The architecture spec (§2) names **11** Phase 1B tables. The user's request
named exactly **6** specific tables. This PR ships the user's 6 names and
folds spec content into them:

| User-named table | Spec §3 source(s) | Notes |
|---|---|---|
| `verified_sources` | `news_source_reliability` | Renamed; same columns. |
| `verified_knowledge` | `verified_knowledge` | 1:1. `status` default tightened to `"verified"`; `approved_by`/`approved_at` made NOT NULL per spec §11 (verified rows only exist post-promotion). |
| `verified_claims` | `newsroom_claims` + `newsroom_claim_evidence` | Evidence denormalized inline as `jsonb`. |
| `verified_timeline_events` | (new — supports correction/dispute history per §11 immutability rule) | Append-only. |
| `verified_media_references` | `newsroom_event_media` | Renamed; same columns. |
| `verification_audit_events` | `newsroom_admin_decisions` + `newsroom_claim_verifications` | Subject-polymorphic via `(subject_type, subject_id)`; covers both admin decisions and auto verifications. |

Tables deliberately **not** added in this PR (will land with their owning
service PRs to keep blast radius minimal):
- `news_event_clusters`, `news_event_cluster_members` — added with the
  clustering service PR (spec §6).
- `newsroom_data_packages`, `newsroom_render_manifests` — added with the
  package-builder and render-adapter PRs (spec §§12–13).

The Zod payloads (`NewsroomDataPackagePayloadSchema`,
`NewsroomRenderManifestSchema`) **are** shipped now so those follow-up PRs
land against a frozen contract.

---

## 10. Out-of-Scope (Phase 1B, not in this PR)

- Service code for clustering, claim extraction, verification,
  package building, render-manifest building, or admin decisions.
- Any HTTP route, including the root-admin POST endpoints designed in
  spec §16.
- Any UI (the future `client/src/pages/admin/Newsroom.tsx` is not added).
- Migration itself, seeding, or any DB write.
- YouTube / social / live publishing — explicitly forbidden by Phase 1B scope.
- Provider calls — none added; existing mock/test paths are not touched.
