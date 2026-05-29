# Debate → Podcast / Video Export & Reference Flow — Design Report

**Date:** 2026-05-22  
**Status:** PLANNING ONLY — no implementation, no route creation, no schema change, no backend behavior change, no publishing / render / live / Unreal / 4D-hardware enablement.  
**Origin:** Gap discovered during T4 §J and confirmed during T5 §J as `NEEDS_T5_OR_FUTURE_ROUTE`.

---

## A. Source inputs

- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md` (T1)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md` (T2)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md` (T3)
- `docs/reports/MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md` (T4 flowcharts)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_T5_SMOKE_E2E_REPORT.md` (T5)

Live code grounding used (read-only inspection only — nothing modified):
- `shared/schema.ts` (debate + podcast tables)
- `server/services/debate-orchestrator.ts`, `live-debate-studio-service.ts`, `news-to-debate-service.ts`
- `server/services/podcast-script-engine.ts`, `podcast-voice-service.ts`
- `server/services/production-house-service.ts`

---

## B. Current state — what already exists, what's missing

### B.1 What already exists at the data layer (important — partial plumbing is in place)
- `podcast_script_packages` table **already requires a `debateId: integer NOT NULL`** (`shared/schema.ts:865`). Every podcast script is, by design, rooted in a specific debate. Code path: `podcast-script-engine.ts` is already invoked with a debate id.
- `podcast_audio_jobs` table is keyed off `scriptPackageId`, which itself carries the `debateId`. The data lineage **debate → script → audio job** is already enforceable.
- Production-House `sourceType` enum (line 1082) already includes `"podcast_script_package"`, `"podcast_audio_job"`, `"news_to_debate"`, and `"youtube_publishing_package"`. The Production-House layer is already able to ingest podcast packages whose lineage traces back to a debate.
- `avatar_video_scene_template` (line 979) already includes the `"debate_arena_summary"` scene — a debate-shaped video template exists in the type system.
- Production-House `ReadinessReport` + `approvalStates` pattern is in place; new package types can re-use the same gating mechanism without inventing a new gate.

### B.2 What is missing
There are **three concrete gaps** that the T4/T5 reports flagged collectively:

1. **No discoverability / handoff surface in the admin Debate Studio.** A root-admin viewing a finished debate cannot, from the Debate Studio, see a card or button that says "Create podcast reference package from this debate" or "Queue a debate-summary video render". The data lineage works (see B.1), but it is currently triggered out-of-band (cron / service-internal calls) rather than as a deliberate admin handoff.
2. **No explicit "Podcast Reference Package" type.** Podcast Room is allowed to *read* debate outputs as references, but the system has no first-class read-only package shape that the Podcast Room admin UI can render and that guarantees no mutation back into the debate's source-of-truth tables.
3. **No explicit "Debate-Summary Production Package" type.** Production House can ingest podcast-script packages whose lineage traces back to a debate, but there is no first-class "debate → production package" handoff that carries the debate's beat-list, panelist roles, and approved verdicts into a Production-House readiness gate.

T5 §J recorded zero broken links — these gaps are not defects in T1–T5 deliverables. They are deliberate scope-deferred items that the design below addresses for future T6+.

---

## C. Proposed UX entry point (planning only — no card is being added in this task)

### C.1 Debate Studio zone — proposed new card (do NOT add until implemented)

**Proposed label:** `Debate → Podcast / Video Export (Handoff)`  
**Proposed href:** `/admin/debate-export`  
**Proposed status:** `manual` (root-admin approval; not dry-run because the flow itself is admin-driven, but it produces only DRAFT packages that themselves remain `admin_only_internal` / `dryRun` until later gates)  
**Proposed icon:** `Share2` or `Workflow`  
**Proposed description:** `Create read-only podcast reference packages and Production House video packages from finished debates. Read-only against debate source-of-truth tables. No publishing, no render, no live.`  
**Proposed tooltip:** `Cross-link — primary home is Debate Studio. Mirrors to Podcast Room (Reference packages) and Production House (Video packages). Source debate is never mutated.`

### C.2 Mirror surfaces (additional cards in other zones — also planning only)
- **Podcast Room zone:** add `Debate Reference Packages (read-only)` card → `/admin/podcast-debate-references` (NEW route, planning only). Sister to existing `Debate Reference (News to Debate)` card surfaced in T2 §C; this NEW card lists actual produced reference packages, the existing card only links to the topic-package surface.
- **Production House zone:** add `Debate-Summary Video Packages` card → `/admin/production-house?sourceType=debate_summary` (REUSE existing route with a query-param filter — preferred over a new route). Falls under the existing Production House readiness/approval gates.

### C.3 Cross-link annotations (proposed)
All three new cards should carry the standardized `"Cross-link — primary home is Debate Studio."` tooltip prefix from T4 §C wording style, so the consolidation pattern is preserved.

---

## D. Source Debate data (read-only inputs)

The export flow reads, but **never writes**, the following existing tables:

| Source table | Fields read | Read-only guarantee |
|---|---|---|
| `live_debates` (`shared/schema.ts:586`) | id, topic title, status (must be `completed` or `archived`), council id, started/ended timestamps | Export only triggers when `status ∈ {completed, archived}`. No UPDATE statement against this table from the export path. |
| `debate_participants` (line 612) | debateId, agent id, displayName, role, side, totalSpeakingTime, turnsUsed | Read-only join. |
| `debate_turns` (line 627) | debateId, turn order, speakerAgentKey, text, citations, timestamps | Read-only — turns become "beats" in the produced package; the original turns table is never modified. |
| Council governance / Redaction Wall verdict (existing read paths) | verdict, approved-by ids, redacted-claim ids | Read-only. If the debate has not cleared Redaction Wall, export is **rejected** (see §F). |
| `news_to_debate` source topic package | topic id, source-article id, license posture | Read-only — propagates source attribution into the produced package. |

**No new column is added to any of the above tables.** All five source surfaces are queried via existing Drizzle selects.

---

## E. Target packages (proposed, planning only)

### E.1 Target — Podcast Reference Package

**Type name:** `DebatePodcastReferencePackage`  
**Storage:** propose a NEW table `debate_podcast_reference_packages` (see §J for the proposed shape) OR a JSONB-only payload nested inside the existing `podcast_script_packages` row as `referencePayload: jsonb` — final decision deferred to T6 implementation; either choice satisfies the read-only constraint because neither modifies debate tables.

**Payload shape (proposed, immutable once produced):**
```
{
  packageId:            uuid,
  sourceDebateId:       int,                  // foreign key → live_debates.id (read-only)
  sourceDebateSnapshot: {
    topicTitle:         string,
    councilName:        string,
    verdictSummary:     string,
    approvedVerdictAt:  ISOstring,
    panelists:          Array<{role, side, displayName, agentKey}>,
    beats:              Array<{
                          beatIndex, speakerAgentKey, role, side,
                          textRedacted, citations[],
                          startMs, endMs, sensitivity ∈ {normal,sensitive,blocked}
                        }>,
    redactionWallVerdict: "cleared" | "needs_review"   // export only allowed when "cleared"
  },
  podcastUsageHints: {
    suggestedRunLength: "2_min" | "10_min" | "long_form",
    suggestedFraming:   "panel_recap" | "highlight_quotes" | "background_brief",
    suggestedAnchorRole:"mougle_anchor" | "panel_moderator"
  },
  status:               "admin_review" | "approved_for_podcast_reference",
  generatedBy:          string,               // root-admin id
  generatedAt:          ISOstring,
  expiresAt:            ISOstring | null      // optional TTL so old debate refs don't linger
}
```

**Approval gate:** root-admin manual approve via existing Production-House-style approval pattern (re-use `ApprovalStage`). Status starts at `admin_review`; cannot be referenced by `podcast-script-engine` until status flips to `approved_for_podcast_reference`.

**Read-only contract:**
- The package is **append-only**. Once produced, only its `status` field may be updated by the approval workflow. The `sourceDebateSnapshot` JSON is sealed.
- `podcast-script-engine` may read the snapshot; it may NOT update `live_debates`, `debate_participants`, or `debate_turns` based on what it found there.
- A unique constraint on `(sourceDebateId, generatedAt)` prevents accidental duplication while still allowing intentional regeneration via a new row.

### E.2 Target — Production House Video Package

**Type name:** `DebateSummaryProductionPackage`  
**Storage:** propose a NEW row in the existing Production-House `production_packages`-shaped store with `sourceType: "debate_summary"` — this re-uses the existing Production-House readiness/approval surface (`server/services/production-house-service.ts`) instead of inventing a parallel pipeline.

**Payload shape (proposed):**
```
{
  packageId:            uuid,
  sourceType:           "debate_summary",   // NEW value on the existing sourceType enum
  sourceDebateId:       int,
  scenePlan: {
    template:           "debate_arena_summary",  // already in AvatarVideoSceneTemplate enum
    beats: Array<{
      beatIndex,
      lowerThirdText,
      visualPresetKey,    // resolved through the existing screen-preset registry
      anchorMode,         // "host_only" | "host_plus_panel" | "host_plus_clip"
      clipRefBeatIndex,   // points into the source debate's beats — read only
      durationMs,
      sensitivity
    }>
  },
  readinessReport:       { ...existing ReadinessReport shape, must pass all 17 broadcast-grade screen-safety checks before approval },
  approvalStates:        existing Map<stage, "pending" | "approved" | "rejected">,
  adminReviewStatus:     "internal_admin_review" | "ready_for_render_planning_only",
  generatedBy:           string,
  createdAt:             ISOstring
}
```

**Approval gates (re-use existing — invent nothing):**
1. Source-debate Redaction Wall verdict must equal `cleared`.
2. Every beat's `sensitivity` must satisfy the existing screen-safety MIN-confidence vector check.
3. `adminReviewStatus` starts at `internal_admin_review`; cannot transition to `ready_for_render_planning_only` without root-admin manual approval.
4. Even after approval, the package is **planning-only** — it does NOT trigger `video-render-service.ts`. A separate later step would be required, behind its own existing approval gate, to invoke render. This design does not enable that step.

---

## F. Read-only reference rules (hard invariants)

1. **No write to `live_debates`, `debate_participants`, `debate_turns`, council-verdict tables, or Redaction-Wall tables** is ever issued by the export path. Verified by service-level audit: the proposed `debate-export-service.ts` would only import `db.select(...)` for these tables and would lint-forbid `db.insert/.update/.delete` against them.
2. **Source-of-truth lives in the debate tables.** The reference package and the production package are *projections*. If a debate is later edited (e.g. a turn is redacted post-hoc), the package's `sourceDebateSnapshot.redactionWallVerdict` is re-checked on read; if it no longer says `cleared`, the package is auto-quarantined (its `status` flips to `quarantined_due_to_source_change` — this is the ONLY write to the package row that isn't user-driven, and it never touches the debate row).
3. **Podcast Room never writes back to Debate tables.** Podcast Room reads `DebatePodcastReferencePackage` rows by id; the schema does not expose a foreign-key-update path. This must be enforced at the service layer (no `update(liveDebates)` import from any podcast file).
4. **Production House never writes back to Debate tables.** Same enforcement.
5. **No reference-package generation auto-runs.** Trigger is always a root-admin click in the proposed `/admin/debate-export` surface; never a cron / scheduler / orchestrator side-effect.

---

## G. Approval / readiness gates (re-use existing patterns; invent no new gate)

| Stage | Re-uses | Trigger | Pass condition | Fail action |
|---|---|---|---|---|
| **G.1 Eligibility** | New service check, but re-uses existing Redaction-Wall verdict reader | On click of "Generate reference package" or "Generate video package" | Source debate `status ∈ {completed, archived}` AND `redactionWallVerdict === "cleared"` AND every turn's `sensitivity !== "blocked"` | Reject with admin-visible reason; do not create the package row |
| **G.2 Generation** | New service, but writes only to NEW reference-package / production-package row — never source tables | After §G.1 passes | Package row created with `status: "admin_review"` (or `adminReviewStatus: "internal_admin_review"`) | Roll back the new row in a single transaction |
| **G.3 Root-admin approval** | Re-uses existing `ApprovalStage` machinery from `production-house-service.ts:168 approvalStates` | Manual click in admin UI | Approver id captured in `approvalHistory`; status flips | No-op |
| **G.4 Source-change quarantine** | Re-uses existing change-detection pattern | On every read of the package by podcast-script-engine or production-house | Source debate's verdict still `cleared` AND turn sensitivities unchanged | Auto-quarantine the package row (only update is to its own `status` field) |
| **G.5 Render gate (out of scope for this design)** | Re-uses existing `video-render-service` gate; this design does NOT enable invocation | n/a in this design | n/a | n/a |

No new safe-mode flag, no new kill-switch, no new envelope. **All flows respect existing `pauseAutonomousPublishing`, `pauseYouTubeUploads`, `pauseSocialDistributionAutomation`, `pausePodcastAudioGeneration` safe-mode flags** at the existing chokepoints — none of which is modified by this design.

---

## H. Safety constraints (hard rules carried from T1–T5)

| # | Constraint | How this design upholds it |
|---|---|---|
| H.1 | No autonomous publishing | Trigger is always a root-admin click. No cron / scheduler invokes the export. |
| H.2 | No real video rendering enabled | Production package terminal state is `ready_for_render_planning_only`. Renders are NOT auto-invoked. |
| H.3 | No Unreal execution | Scene plan references only existing safe screen presets; no Unreal binding is introduced. |
| H.4 | No real 4D hardware | Same — scene plan is screen-preset only, never 4D-hardware-bound. |
| H.5 | No autonomous live runner | Manual root-admin trigger only. |
| H.6 | Safe-mode flags untouched | This design adds zero new flags and does not propose modifying the 4 existing ones. |
| H.7 | No mutation of source debate | §F.1–F.4. |
| H.8 | Podcast Room separate from Debate | Podcast Room only consumes `DebatePodcastReferencePackage` rows; cannot reach into debate tables. |
| H.9 | Approval gates intact | §G re-uses existing gates without weakening them. |
| H.10 | Broadcast-Grade Screen Safety (17 checks) preserved | §E.2 explicitly requires the existing 17-check validator to pass before any production package can transition to `ready_for_render_planning_only`. |
| H.11 | MIN-confidence vector preserved | Each scene-plan beat's sensitivity is folded into the MIN-confidence vector as in `MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md` §G/§J. |
| H.12 | License posture propagated | `sourceDebateSnapshot` carries forward news-source license metadata via the `news_to_debate` source-topic-package join; production package inherits the strictest license. |

---

## I. Proposed API routes (planning only — none of these is being added in this task)

All proposed routes are admin-only (root-admin gate + CSRF), follow the existing `/api/admin/...` convention, and return JSON.

### I.1 Debate-side handoff (NEW prefix `/api/admin/debate-export/*`)
| Method | Path | Purpose | Mutates |
|---|---|---|---|
| GET | `/api/admin/debate-export/eligible-debates?status=completed&limit=N` | List debates eligible for export (Redaction-Wall cleared, no blocked turns). | none |
| GET | `/api/admin/debate-export/preview/:debateId` | Preview the snapshot that would be sealed into a reference / production package. | none |
| POST | `/api/admin/debate-export/reference-package` body `{ debateId, podcastUsageHints }` | Create a `DebatePodcastReferencePackage` row at `admin_review`. | new row in reference-package table only |
| POST | `/api/admin/debate-export/reference-package/:id/approve` | Flip status to `approved_for_podcast_reference`. | the package row's status only |
| POST | `/api/admin/debate-export/reference-package/:id/quarantine` | Manual quarantine. | the package row's status only |
| POST | `/api/admin/debate-export/production-package` body `{ debateId, scenePlan }` | Create a `DebateSummaryProductionPackage` at `internal_admin_review`. | new row in production-packages store only |
| POST | `/api/admin/debate-export/production-package/:id/approve-planning` | Flip `adminReviewStatus` to `ready_for_render_planning_only`. **Does NOT trigger render.** | the package row's status only |

### I.2 Podcast-Room side (NEW prefix `/api/admin/podcast/debate-references/*`)
| Method | Path | Purpose | Mutates |
|---|---|---|---|
| GET | `/api/admin/podcast/debate-references?status=approved_for_podcast_reference&limit=N` | List reference packages podcast-script-engine may use. | none |
| GET | `/api/admin/podcast/debate-references/:id` | Read one package (read-only). | none |

### I.3 Production-House side (REUSE existing prefix)
| Method | Path | Purpose | Mutates |
|---|---|---|---|
| GET | `/api/admin/production-house?sourceType=debate_summary&limit=N` | Filter existing production-packages list. **Reuses existing route**, no new endpoint. | none |

**Zero routes overlap with any existing route.** All NEW prefixes are unused as of T5 §D.

---

## J. Proposed schemas / tables

Two **NEW** tables, **zero** modification to any existing table.

### J.1 `debate_podcast_reference_packages` (NEW)
```sql
CREATE TABLE debate_podcast_reference_packages (
  id                        SERIAL PRIMARY KEY,
  source_debate_id          INTEGER NOT NULL,
  source_debate_snapshot    JSONB   NOT NULL,
  podcast_usage_hints       JSONB   NOT NULL,
  status                    TEXT    NOT NULL DEFAULT 'admin_review'
                              CHECK (status IN (
                                'admin_review',
                                'approved_for_podcast_reference',
                                'quarantined_due_to_source_change',
                                'rejected'
                              )),
  generated_by              TEXT    NOT NULL,
  generated_at              TIMESTAMP NOT NULL DEFAULT now(),
  expires_at                TIMESTAMP NULL,
  UNIQUE (source_debate_id, generated_at)
);
CREATE INDEX ON debate_podcast_reference_packages (source_debate_id);
CREATE INDEX ON debate_podcast_reference_packages (status);
```

### J.2 `debate_summary_production_packages` (NEW)
```sql
CREATE TABLE debate_summary_production_packages (
  id                        SERIAL PRIMARY KEY,
  source_debate_id          INTEGER NOT NULL,
  scene_plan                JSONB   NOT NULL,
  readiness_report          JSONB   NOT NULL,
  approval_states           JSONB   NOT NULL,
  admin_review_status       TEXT    NOT NULL DEFAULT 'internal_admin_review'
                              CHECK (admin_review_status IN (
                                'internal_admin_review',
                                'ready_for_render_planning_only',
                                'rejected'
                              )),
  generated_by              TEXT    NOT NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ON debate_summary_production_packages (source_debate_id);
CREATE INDEX ON debate_summary_production_packages (admin_review_status);
```

### J.3 Existing-enum extension (NEEDS DECISION — alternative below)
The existing Production-House `sourceType` enum (`shared/schema.ts:1082`) would need the value `"debate_summary"` added. This is technically an existing-table modification.

**Alternative that avoids modifying any existing schema:** keep `debate_summary_production_packages` as an entirely standalone table and leave the existing enum unchanged. Production-House UI reads from both stores at render time and merges. **Recommendation:** go with the alternative — zero existing-schema changes.

### J.4 No new safe-mode flag, no new system_settings row required.

---

## K. No-mutation guarantees (enforcement plan)

| Guarantee | How enforced |
|---|---|
| No write to `live_debates` / `debate_participants` / `debate_turns` | Service-level convention: `debate-export-service.ts` imports only `select(...)` for these tables. Code review checklist item: grep the new service for `update(liveDebates)`, `update(debateParticipants)`, `update(debateTurns)`, `insert(...).into(liveDebates)`, etc.; all must return zero matches. |
| No mutation of source-debate Redaction-Wall verdict | Same convention. |
| Reference package is append-only except for status | DB CHECK constraint on status enum + service-level convention that only `update(...).set({ status })` against the new table is permitted. |
| Production package is append-only except for `admin_review_status` and `approval_states` | Same pattern. |
| Quarantine is the ONLY non-admin-driven write | Documented in service header comment; verified by reviewer. |
| Podcast / Production services cannot accidentally reach into debate tables | Module-level lint rule (future): forbid `live_debates` imports inside `server/services/podcast-*.ts` and `server/services/production-*.ts`. |

---

## L. Test plan (proposed; written but not run in this design task)

| # | Test | What it verifies |
|---|---|---|
| L.1 | Eligibility — `completed` debate with cleared Redaction Wall returns eligible | §G.1 happy path |
| L.2 | Eligibility — `active` debate returns ineligible | §G.1 rejects in-progress |
| L.3 | Eligibility — `completed` debate with Redaction-Wall `needs_review` returns ineligible | §G.1 rejects unverified |
| L.4 | Eligibility — debate with any `sensitivity:"blocked"` turn returns ineligible | §H.10 |
| L.5 | Reference-package POST creates row at `admin_review` with sealed snapshot | §E.1 + §G.2 |
| L.6 | Approval POST flips status only; no other field changes | §K append-only |
| L.7 | Quarantine round-trip — modify source debate's Redaction-Wall verdict post-hoc → next read marks package `quarantined_due_to_source_change`; debate row unchanged | §F.2 |
| L.8 | Podcast-script-engine reads only `approved_for_podcast_reference` rows; `admin_review` rows are invisible | §G.3 |
| L.9 | Service-level no-mutation: `rg 'update(liveDebates|debateParticipants|debateTurns)' server/services/debate-export-service.ts server/services/podcast-*.ts server/services/production-*.ts` returns zero matches | §K hard invariant |
| L.10 | Production-package generation populates `readiness_report` with all 17 broadcast-grade checks | §E.2 + §H.10 |
| L.11 | Production-package approve-planning POST flips to `ready_for_render_planning_only`; **does NOT invoke `video-render-service`** | §I.1 last row, §H.2 |
| L.12 | Safe-mode flag check: each of the 4 existing flags' values is observed and propagated as appropriate (no flag is set or unset) | §H.6 |
| L.13 | Concurrent regeneration: two POSTs for the same debate within the same second produce two distinct rows (unique key on `(source_debate_id, generated_at)`) | §J.1 unique constraint |
| L.14 | Quarantine never writes to debate tables: assertion that source-table row checksum is identical before/after quarantine fire | §K |
| L.15 | E2E (no real provider): admin clicks "Generate reference package" → row appears → admin approves → podcast-script-engine surfaces it; zero live-provider calls observed | §H.1–H.6 |

Targeting **15 deterministic tests** (mirrors the test density of T1–T5 deliverables). Plus 1 explicit non-test: a documented assertion that no test in this suite touches `pauseAutonomousPublishing`, `pauseYouTubeUploads`, `pauseSocialDistributionAutomation`, or `pausePodcastAudioGeneration` flags.

---

## M. Implementation task breakdown (proposed T6+ sequence)

| Task | Title | Scope summary | Depends on | Allowed to modify |
|---|---|---|---|---|
| **T6.1** | Schema + types (NEW tables only) | Add the two NEW tables in §J.1–J.2 to `shared/schema.ts` + matching Zod insert schemas. **Do not** modify the existing `sourceType` enum (use alternative §J.3). | — | `shared/schema.ts` (additive only); new migration script under `scripts/migrate-debate-export.ts` (NOT auto-run) |
| **T6.2** | Read-only `debate-export-service.ts` | New service exposing `listEligibleDebates`, `previewSnapshot`, `createReferencePackage`, `createProductionPackage`, `approveReferencePackage`, `approveProductionPackagePlanning`, `quarantineReferencePackage`. **Zero writes to debate tables.** | T6.1 | `server/services/debate-export-service.ts` (new) |
| **T6.3** | API routes (§I) | Wire 7 new routes in `/api/admin/debate-export/*` and 2 in `/api/admin/podcast/debate-references/*`. CSRF + root-admin. | T6.2 | new file under `server/routes/admin-debate-export.ts` |
| **T6.4** | Podcast-script-engine read integration | Update `podcast-script-engine.ts` to optionally read `approved_for_podcast_reference` rows. **Read-only.** | T6.3 | `server/services/podcast-script-engine.ts` (read-only addition) |
| **T6.5** | Production-House read integration | Update Production-House list endpoint to merge in `debate_summary_production_packages` rows. | T6.3 | `server/services/production-house-service.ts` (read-only addition) |
| **T6.6** | Admin UI — Debate Studio handoff page | New page at `/admin/debate-export` rendering the 7 actions in §I.1. | T6.3 | `client/src/pages/admin/DebateExport.tsx` (new) + `client/src/App.tsx` route registration |
| **T6.7** | Admin UI — Podcast Room debate references page | New page at `/admin/podcast-debate-references`. Read-only list + detail. | T6.3 | `client/src/pages/admin/PodcastDebateReferences.tsx` (new) + `App.tsx` |
| **T6.8** | AdminDashboard zone cards (additive) | Add the 3 cards from §C.1–C.2 to the existing Debate Studio, Podcast Room, Production House zone arrays in `AdminDashboard.tsx`. **Pure additive — no existing card modified.** | T6.6, T6.7 | `client/src/pages/admin/AdminDashboard.tsx` (additive only) |
| **T6.9** | Test suite (§L) | Add 15 deterministic tests under `tests/debate-export.test.ts`. | T6.5 | `tests/debate-export.test.ts` (new) |
| **T6.10** | E2E smoke + safety audit | Repeat T5-style smoke against the 3 new pages + verify safe-mode flags untouched. | T6.9 | new report `docs/reports/DEBATE_TO_PODCAST_VIDEO_EXPORT_T6_SMOKE_REPORT.md` |

Each T6.x task is independently mergeable and respects the same strict rules used in T1–T5.

**Estimated risk:** Low. The data plumbing (debate → podcast-script lineage) already exists in the schema and engine; the implementation work is mostly making the handoff explicit and adding the two read-only projection tables plus the admin handoff UI. Zero existing-table schema modification (per §J.3 alternative). Zero existing safe-mode flag change. Zero existing approval gate weakening.

---

## N. Open questions for the user

1. **§J.3 enum extension vs standalone table:** the design recommends the standalone-table alternative (zero existing-schema mutation). Confirm or override?
2. **Quarantine semantics:** if a debate's Redaction-Wall verdict regresses post-export, should the reference package auto-quarantine, or should it require an explicit root-admin action? Design currently auto-quarantines (the only non-admin-driven write to the package row).
3. **TTL / expiresAt on reference packages:** keep optional `expiresAt: null` (no auto-expiry), or set a default TTL (e.g. 180 days)? Currently null.
4. **Render-gate handoff:** this design explicitly **does not** wire production-package → `video-render-service`. Is that boundary correct, or should a future T7 task design that handoff with its own approval gate?
5. **Council approval scope:** for the production-package path, should the originating debate's council also approve the production package, or is root-admin sufficient? Currently root-admin sufficient.

---

## O. What this design explicitly does NOT propose

- ❌ No autopublishing path.
- ❌ No autonomous render invocation.
- ❌ No live runner.
- ❌ No Unreal binding.
- ❌ No 4D-hardware binding.
- ❌ No modification to any existing safe-mode flag.
- ❌ No weakening of any existing approval gate.
- ❌ No mutation of source-debate tables.
- ❌ No autonomous trigger — every export starts with a root-admin click.
- ❌ No new email / webhook / external API calls.
- ❌ No change to existing `podcast_script_packages` or `podcast_audio_jobs` columns.
- ❌ No change to App.tsx, AdminDashboard.tsx, or any existing route registration in this design task. All changes listed above are deferred to T6+ implementation tasks.

---

## P. Files touched by this design task

| File | Δ |
|---|---|
| `docs/reports/DEBATE_TO_PODCAST_VIDEO_EXPORT_DESIGN.md` | **created** — this report |

**Zero source files modified.** Zero routes, schemas, services, migrations, tests, dashboard files, safety rules, or app behavior touched.

---

## Q. Summary

The "debate → podcast/video export" gap discovered in T4 §J and confirmed in T5 §J is **not a missing pipe** — the data lineage already runs (podcast scripts already carry a `debateId NOT NULL`). The gap is the missing **first-class read-only projection types** + the missing **admin handoff surface**.

This design proposes:
- **2 new tables** (purely additive — zero existing-schema modification under the recommended §J.3 alternative).
- **1 new service** (`debate-export-service.ts`, read-only against debate tables).
- **9 new admin routes** (7 debate-export + 2 podcast-debate-references; zero overlap with existing routes).
- **3 new admin UI surfaces** (1 page on Debate Studio side, 1 read-only page on Podcast Room side, 1 query-param filter re-using Production-House page).
- **3 new dashboard cards** (additive — no existing card modified).
- **15 deterministic tests**.
- **All 12 T1–T5 safety constraints preserved unchanged.**
- **Implementation split into 10 mergeable T6.x sub-tasks.**

No implementation is started. Awaiting decisions on the 5 open questions in §N.
