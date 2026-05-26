# Phase 1B — Verified Newsroom Architecture (DESIGN ONLY)

**Status:** DESIGN ONLY — no code, no schema, no migration in this document.
**Scope:** Admin-only, manual, dry-run pipeline that promotes raw RSS articles into
verified knowledge, packages them as a Newsroom Data Package, lowers them into a
Render Manifest consumed by the existing Phase 1A render baseline, and gates every
hand-off behind explicit root-admin approval.
**Builds on:** Phase 1A Render Baseline (avatar-video-render-service,
render-text-fitting, render-srt-service, render-mp4-service).
**Does not touch:** YouTube/social/live publishing, public push, autonomous
publishing, or any provider that is not already mocked.

---

## 1. Current-State Map

### 1.1 Tables already on `origin/main` that Phase 1B will reuse or extend
| Table | Role today | Phase 1B usage |
|---|---|---|
| `news_articles` (id, source_url, source_name, source_type, original_title/content, title, slug, title_hash, summary, content, seo_blog, script, hashtags, category, image_url, status: `raw`/`processed`, is_breaking_news, impact_score, debate_id, published_at, processed_at) | Single row per fetched RSS item; AI fills summary/content; status flips `raw → processed` | Becomes input layer. Status enum extends; clustering / claim / verification metadata moves into **new** sibling tables, not into this row. |
| `claims` (id, post_id, subject, statement, metric, time_reference, evidence_links[]) | Per-post user claim | Reference model only — Phase 1B introduces `newsroom_claims` to keep newsroom claims separate from user post claims. |
| `evidence` / `claim_evidence` (url, label, evidence_type) | Per-post evidence rows | Same — Phase 1B introduces `newsroom_evidence`. |
| `trust_scores` (postId, evidenceScore, consensusScore, historicalReliability, reasoningScore, sourceCredibility, tcsTotal) | Per-post TCS | Reference design only; Phase 1B has its own `verifiedKnowledgeConfidence` shape stored on the verified knowledge row. |
| `moderation_logs` | Free-form moderation audit | Phase 1B writes a new row here for every status transition (raw→clustered→…→verified|rejected). |
| `safe_mode_controls` (globalSafeMode, pauseAutonomousPublishing, pauseYouTubeUploads, pauseSocialDistributionAutomation, …) | Global kill-switches | Phase 1B reads these on every admin action and refuses promotion when `globalSafeMode=true`. |
| `avatar_video_render_jobs` (script_package_id **notNull**, audio_job_id, youtube_package_id, preview_metadata, …) | Phase 1A render | **No column added.** Newsroom path satisfies the existing `script_package_id NOT NULL` constraint via a **synthetic script-package adapter** (§13.1). The link to the newsroom package is carried inside `previewMetadata.renderBaseline.newsroomLink` (JSONB, additive only). |

### 1.2 Services already in `server/services`
- `newsService.ts` — production RSS poller using `rss-parser`, reads `config/rssFeeds.json` (10 AI feeds), summarizes via OpenAI `gpt-5.5`, writes `news_articles` rows with status `raw → processed`, `category`, `impactScore`, `hashtags`. Scheduler: every 30 min; gated by `founderControlService.isEmergencyStopped()`.
- `news-pipeline-service.ts` — legacy/parallel pipeline (custom regex RSS parser, richer per-article AI fields: `seoBlog`/`script`). Runs hourly; same gating.
- `breaking-news-agent.ts` — post-ingest evaluator flipping `is_breaking_news`.
- `news-to-debate-service.ts` — already converts an article into a `live_debates` + `claims` set, computes a per-article `SourceReliability`, selects debate agents, generates AI draft transcript, persists. **This service is the existing reference for "article → structured artifact".**
- `content-moderation-service.ts` — toxicity / spam / shadow-ban primitives, not used by the newsroom yet.
- `creator-verification-service.ts` — creator (human) ID verification; reference only.
- `escalation-service.ts` + `safeModeControls` + `founderControlService` — three layers of automation gating.

### 1.3 Render / media surface (Phase 1A on `origin/main`)
- `avatar-video-render-service.ts` builds `RenderBaseline` (1920×1080, h264/aac/srt, layers, safeZones incl. `captionZone {x:10,y:85,w:80,h:4}`, timing, textSafety, **compliance findings**, **captionsArtifact + captionsPreview**, **mp4Artifact + mp4Preview**) and embeds it in `previewMetadata.renderBaseline`.
- `render-text-fitting.ts` — pure functions `clampToMax`, `wrapLines`, layout/text analyzers returning `ComplianceFinding[]`.
- `render-srt-service.ts` — SRT cue builder + `writeSrtForRenderJob` writing under `.local/media-assets/render/rj_<id>_<seed>.srt`, strict filename allowlist `/^[a-z0-9_]{1,128}\.(mp4|srt)$/`, factory `createCaptionsSrtHandler`.
- `render-mp4-service.ts` — ffmpeg drawtext slate preview, optional burned-in subtitles, factory `createPreviewMp4Handler` with HTTP Range support.
- Admin routes: `GET /api/admin/video-render/jobs/:id/captions.srt` and `GET …/preview.mp4` behind `requireRootAdmin`, allowlist-guarded.
- Admin screen: `client/src/pages/admin/VideoRender.tsx` shows baseline panels, MP4 inline player, captions download, compliance findings.

### 1.4 Admin screens relevant to Phase 1B
- `NewsToDebate.tsx` — current admin UI for "select processed article → generate debate". Closest analog to the Phase 1B reviewer surface.
- `VideoRender.tsx` — Phase 1A render reviewer; Phase 1B reuses its panels for the render preview half of the flow.
- `SafeMode.tsx` — kill-switch toggles already exist; no change.
- `LegalSafety.tsx` / `YouTubePublishing.tsx` — referenced only to confirm the hard rule "no upload route is wired without `requireRootAdmin` + safe-mode check" is already enforced.

### 1.5 Safety gates already on main
- `requireRootAdmin` is mounted on every `/api/admin/video-render/*`, every `/api/admin/news-to-debate/*`, the YouTube approval routes, and is the only auth path that allows downstream artifact streaming.
- `previewMetadata.safety` hard-codes `publicPublishing:false`, `youtubeUpload:false`, `socialPosting:false`, `manualRootAdminTriggerOnly:true`, `internalAdminReviewOnly:true`. **Phase 1B inherits this shape verbatim.**
- `safeModeControls.globalSafeMode`, `pauseAutonomousPublishing`, `pauseYouTubeUploads`, `pauseSocialDistributionAutomation` already exist and are read by `escalationService.shouldAllowAutomation()` and `founderControlService.isEmergencyStopped()`.

### 1.6 Storage
- `persistent-storage-service.ts` + `replit-object-storage-adapter.ts` already provide `uploadIfConfigured()` with a local-fs fallback at `.local/media-assets/render/`. Phase 1B re-uses the same adapter, writing to a parallel `.local/media-assets/newsroom/` prefix.

---

## 2. Proposed Tables / Types (DESIGN — not created)

New tables — none reuse existing names:
1. `news_source_reliability` — one row per `source_name` (or domain). Long-lived, mutated by reviewer feedback.
2. `news_event_clusters` — one row per logical event grouping ≥1 raw article.
3. `news_event_cluster_members` — many-to-many: cluster_id × news_article_id (+ similarity score, role).
4. `newsroom_claims` — claims extracted from a cluster (distinct from `claims` which is post-scoped).
5. `newsroom_claim_evidence` — evidence rows backing a newsroom claim (URL + snippet + reliability snapshot).
6. `newsroom_claim_verifications` — append-only verification attempts (auto or admin) with verdict.
7. `verified_knowledge` — the canonical, immutable-after-verification knowledge object (one row per verified cluster).
8. `newsroom_data_packages` — composed package row consumed by render planner.
9. `newsroom_render_manifests` — frozen manifest used by `avatar-video-render-service` (sibling of `previewMetadata`).
10. `newsroom_event_media` — media assets (image / clip / chart) attached to a cluster or verified knowledge row, with rightsStatus.
11. `newsroom_admin_decisions` — audit trail of every admin button-press (approve / send-back / reject / correction / dispute) with diff snapshot.

**No changes to existing tables.** The link from `avatar_video_render_jobs` to a newsroom package lives **only** inside the existing JSONB column `preview_metadata` under `renderBaseline.newsroomLink` (additive field on the typed object). No new column on `avatar_video_render_jobs`. The existing `script_package_id NOT NULL` constraint is satisfied by a synthetic script-package adapter (§13.1), not by a schema relaxation. This is the single, canonical variant for Phase 1B.

### 2.1 Shared TS types (target file: `shared/newsroom-types.ts`, design only)
```
VerificationStatus = "raw" | "clustered" | "extracting_claims"
  | "verification_pending" | "verified" | "developing" | "disputed"
  | "correction" | "rejected";

ClaimVerdict = "supported" | "contradicted" | "insufficient_evidence"
  | "needs_human_review";

RightsStatus = "owned" | "licensed" | "fair_use_review" | "rights_unknown"
  | "blocked";

SourceReliabilityTier = "tier_a" | "tier_b" | "tier_c" | "untrusted";
```

---

## 3. Proposed Drizzle Schema Draft (DESIGN — DO NOT APPLY)

Drafted against the same conventions as `shared/schema.ts`. **Not added to the file; no migration; no `db:push`.**

```ts
// shared/newsroom-schema.draft.ts  (design-only sibling file, NOT imported)

export const newsSourceReliability = pgTable("news_source_reliability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceName: text("source_name").notNull().unique(),
  domain: text("domain").notNull(),
  tier: text("tier").notNull().default("tier_c"),         // SourceReliabilityTier
  baseScore: real("base_score").notNull().default(0.5),    // 0..1
  recentAccuracy: real("recent_accuracy").notNull().default(0.5),
  retractionCount: integer("retraction_count").notNull().default(0),
  lastReviewedAt: timestamp("last_reviewed_at"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsEventClusters = pgTable("news_event_clusters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("clustered"),   // VerificationStatus
  canonicalTitle: text("canonical_title").notNull(),
  canonicalSummary: text("canonical_summary"),
  topicTags: text("topic_tags").array(),
  centroidEmbeddingRef: text("centroid_embedding_ref"),    // opaque ref, no vector col yet
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at").notNull().defaultNow(),
  memberCount: integer("member_count").notNull().default(0),
  confidence: real("confidence").notNull().default(0.0),   // aggregate, see §9
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsEventClusterMembers = pgTable("news_event_cluster_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clusterId: varchar("cluster_id").notNull(),
  newsArticleId: integer("news_article_id").notNull(),
  similarity: real("similarity").notNull().default(0.0),
  role: text("role").notNull().default("supporting"),      // "anchor" | "supporting" | "contradicting"
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const newsroomClaims = pgTable("newsroom_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clusterId: varchar("cluster_id").notNull(),
  statement: text("statement").notNull(),
  subject: text("subject"),
  metric: text("metric"),
  timeReference: text("time_reference"),
  extractedBy: text("extracted_by").notNull().default("openai_gpt_5_5"),
  extractionConfidence: real("extraction_confidence").notNull().default(0.0),
  verdict: text("verdict"),                                // ClaimVerdict | null
  verdictConfidence: real("verdict_confidence").notNull().default(0.0),
  contradictionCount: integer("contradiction_count").notNull().default(0),
  supportCount: integer("support_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const newsroomClaimEvidence = pgTable("newsroom_claim_evidence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  url: text("url").notNull(),
  sourceName: text("source_name").notNull(),
  sourceTier: text("source_tier").notNull().default("tier_c"),
  snippet: text("snippet"),
  supports: boolean("supports").notNull().default(true),
  reliabilitySnapshot: real("reliability_snapshot").notNull().default(0.5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsroomClaimVerifications = pgTable("newsroom_claim_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  verifier: text("verifier").notNull(),                    // "auto:openai" | "admin:<userId>"
  verdict: text("verdict").notNull(),                      // ClaimVerdict
  confidence: real("confidence").notNull().default(0.0),
  rationale: text("rationale"),
  evidenceIds: text("evidence_ids").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const verifiedKnowledge = pgTable("verified_knowledge", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clusterId: varchar("cluster_id").notNull().unique(),
  status: text("status").notNull().default("verified"),    // verified|developing|disputed|correction
  canonicalTitle: text("canonical_title").notNull(),
  canonicalSummary: text("canonical_summary").notNull(),
  keyFacts: jsonb("key_facts").$type<VerifiedKeyFact[]>().notNull().default([]),
  confidence: jsonb("confidence").$type<VerifiedKnowledgeConfidence>().notNull(),
  sourceCoverage: jsonb("source_coverage").$type<SourceCoverageRollup>().notNull(),
  approvedBy: text("approved_by").notNull(),               // root admin id
  approvedAt: timestamp("approved_at").notNull().defaultNow(),
  supersededByVerifiedId: varchar("superseded_by_verified_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const newsroomDataPackages = pgTable("newsroom_data_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  verifiedKnowledgeId: varchar("verified_knowledge_id").notNull(),
  packageVersion: integer("package_version").notNull().default(1),
  payload: jsonb("payload").$type<NewsroomDataPackagePayload>().notNull(),
  safetyNotes: jsonb("safety_notes").$type<NewsroomSafetyNotes>().notNull(),
  status: text("status").notNull().default("ready_for_render"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsroomRenderManifests = pgTable("newsroom_render_manifests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: varchar("package_id").notNull(),
  renderJobId: integer("render_job_id"),                   // FK to avatar_video_render_jobs once previewed
  manifest: jsonb("manifest").$type<NewsroomRenderManifest>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsroomEventMedia = pgTable("newsroom_event_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clusterId: varchar("cluster_id").notNull(),
  kind: text("kind").notNull(),                            // "image"|"clip"|"chart"
  sourceUrl: text("source_url"),
  storageKey: text("storage_key"),                         // local file under .local/media-assets/newsroom/
  rightsStatus: text("rights_status").notNull().default("rights_unknown"),  // RightsStatus
  rightsNote: text("rights_note"),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsroomAdminDecisions = pgTable("newsroom_admin_decisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectType: text("subject_type").notNull(),             // cluster|claim|verified_knowledge|package|manifest
  subjectId: text("subject_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  action: text("action").notNull(),                        // approve|send_back|reject|dispute|correction
  reason: text("reason"),
  diffSnapshot: jsonb("diff_snapshot").$type<Record<string, any>>().notNull().default({}),
  decidedBy: text("decided_by").notNull(),
  decidedAt: timestamp("decided_at").notNull().defaultNow(),
});
```

---

## 4. Proposed Zod Contracts (DESIGN)

Target file (not created yet): `shared/newsroom-contracts.ts`. All inserts use `createInsertSchema(...).omit({ id:true, createdAt:true })`. Plus the following request/response contracts that gate the API surface:

```ts
ClusterDraftRequestSchema = z.object({
  windowMinutes: z.number().int().min(15).max(24*60).default(180),
  minClusterSize: z.number().int().min(1).max(20).default(2),
  dryRun: z.literal(true),                  // hard-coded; no live mode in Phase 1B
});

ClaimExtractionRequestSchema = z.object({
  clusterId: z.string().uuid(),
  maxClaims: z.number().int().min(1).max(20).default(8),
});

ClaimVerifyRequestSchema = z.object({
  claimId: z.string().uuid(),
  mode: z.enum(["auto", "admin"]).default("auto"),
  verdict: z.enum(["supported","contradicted","insufficient_evidence","needs_human_review"]).optional(),
  rationale: z.string().max(2000).optional(),
});

PromoteToVerifiedRequestSchema = z.object({
  clusterId: z.string().uuid(),
  minConfidence: z.number().min(0).max(1).default(0.7),
  acknowledgeSafetyCheck: z.literal(true),
});

BuildPackageRequestSchema = z.object({
  verifiedKnowledgeId: z.string().uuid(),
  template: z.enum(["news_desk","minimal_cards","debate_arena_summary"]).default("news_desk"),
});

BuildRenderManifestRequestSchema = z.object({
  packageId: z.string().uuid(),
});

PreviewRenderRequestSchema = z.object({
  manifestId: z.string().uuid(),
  // No provider field — always dry_run; enforced by service.
});

AdminDecisionRequestSchema = z.object({
  subjectType: z.enum(["cluster","claim","verified_knowledge","package","manifest","render_job"]),
  subjectId: z.string(),
  action: z.enum(["approve","send_back","reject","dispute","correction"]),
  reason: z.string().max(2000).optional(),
});
```

Response shapes mirror the table rows plus computed fields (cluster member previews, claim evidence aggregates, manifest preview URL — admin-only).

---

## 5. Raw → Verified Promotion Flow

Linear flow, every transition admin-triggered. Each step is a separate POST endpoint (§16) and writes a `newsroom_admin_decisions` row.

```
news_articles[status=processed]
        │  (admin POST /cluster/draft, batched)
        ▼
news_event_clusters[status=clustered]
   ├── news_event_cluster_members rows
        │  (admin POST /clusters/:id/extract-claims)
        ▼
news_event_clusters[status=extracting_claims]
   └── newsroom_claims rows (verdict=null)
        │  (admin POST /clusters/:id/verify  → runs auto verifier; OR admin verdicts per-claim)
        ▼
news_event_clusters[status=verification_pending]
   └── newsroom_claim_verifications rows (verifier="auto:openai" then optional "admin:<id>")
        │  (admin POST /claims/:id/verify — per claim; loops until all claims resolved)
        │  (admin POST /clusters/:id/promote-to-verified, requires all blocking claims resolved)
        ▼
verified_knowledge[status=verified]   (immutable snapshot of canonical title/summary/keyFacts/confidence)
        │  (admin POST /verified/:id/build-package)
        ▼
newsroom_data_packages[status=ready_for_render]
        │  (admin POST /packages/:id/build-manifest)
        ▼
newsroom_render_manifests
        │  (admin POST /manifests/:id/preview  → creates avatar_video_render_jobs row with newsroomLink, via synthetic script-package adapter — §13.1)
        ▼
avatar_video_render_jobs[status=preview_ready, dry_run]
   ├── captions.srt under .local/media-assets/render/
   ├── preview.mp4   under .local/media-assets/render/
        │  (admin POST /verified/:id/decision  with action ∈ {approve, send_back, reject, correction, dispute})
        ▼
verified_knowledge.status updates per the action→status mapping in §8.2
```

**Actions vs. statuses (canonical):** `approve`, `send_back`, `reject`, `correction`, `dispute` are **actions** the admin takes. They are recorded verbatim in `newsroom_admin_decisions.action`. They do **not** become status values. Each action's effect on `verified_knowledge.status` is defined exactly once in §8.2.

**Terminal `rejected`:** `rejected` is a **cluster-level / claim-level** terminal only. Once a cluster has been promoted to `verified_knowledge`, that row cannot transition to `rejected` — the equivalent admin action is `correction` (supersede with a new row) or `dispute` (mark as disputed pending re-review). This is enforced by the §8 transition table.

Status-drift rules:
- `developing` — admin reopens a verified knowledge row as "still evolving"; clustering may add new members; new package version on next build.
- `disputed` — at least one admin override contradicts a prior auto verdict, or new contradicting evidence arrived; package generation blocked until resolved.
- `correction` — admin issues a corrected `verified_knowledge` row (`supersededByVerifiedId` points to the old row); the old row is set to `correction` for audit.
- `rejected` — terminal at cluster or claim level only; no package can be built and no `verified_knowledge` row exists.

---

## 6. Event Clustering Design

**Goal:** Group `news_articles[status=processed]` rows that describe the same event so we extract one set of claims per event, not per article.

Phase 1B uses a **deterministic, embedding-free heuristic** (no provider calls, no vector column added):

1. Candidate set: articles with `processed_at >= now() - windowMinutes` not already in a non-rejected cluster.
2. Feature extraction (pure JS):
   - Normalized title token set (drop stopwords).
   - Hashtag set.
   - Source domain.
   - Published-at bucket (rounded to nearest hour).
3. Pairwise similarity = `0.55 * jaccard(titleTokens) + 0.25 * jaccard(hashtags) + 0.15 * sameTopBucket + 0.05 * sameCategory`.
4. Threshold = 0.55. Single-link union-find groups → clusters.
5. For each cluster ≥ `minClusterSize`:
   - Pick anchor member = highest `impactScore`, ties broken by earliest `publishedAt`.
   - `canonicalTitle` = anchor title (admin can edit).
   - `canonicalSummary` = `null` initially (filled by claim-extraction step's same OpenAI call).
   - `centroidEmbeddingRef` = `null` in Phase 1B (column reserved for later vectorized re-clustering).
6. Existing cluster matching: on next run, candidate article is compared against each open cluster's anchor; if similarity ≥ 0.55, added as `role="supporting"`; contradicting headlines (negation cue detection — basic word-list "not", "denies", "refutes" within first 12 tokens) → `role="contradicting"` and the cluster's `confidence` is decreased.

All clustering is invoked from a single admin endpoint; no scheduler.

---

## 7. Claim Extraction Design

**Goal:** From a cluster, derive 3–8 atomic, testable factual claims.

1. Inputs: cluster's anchor article (`originalTitle`, `originalContent`, `summary`) + up to 5 supporting members' `summary` fields. Total trimmed to 12k chars.
2. Prompt (added to `server/services/newsroom-claim-extractor.ts`, design only) returns strict JSON:
   ```
   {
     "canonicalSummary": "...",
     "claims": [
       { "statement": "...", "subject": "...", "metric": "...", "timeReference": "...",
         "extractionConfidence": 0.0-1.0, "supportingMemberIds": [<articleId>, ...] }
     ]
   }
   ```
3. Model: existing `gpt-5.5` via `getOpenAIClient()`. If `OPENAI_API_KEY` missing → service returns `mockClaims()` (matches the existing newsService pattern of skipping AI silently).
4. Each parsed claim → `newsroom_claims` row (`verdict=null`, `extractionConfidence` from model).
5. Each supportingMemberId → derived `newsroom_claim_evidence` row (URL from that article, `supports=true`, `reliabilitySnapshot` = current `news_source_reliability.baseScore`).
6. Cluster status → `extracting_claims`. Operation idempotent: re-extracting replaces unverified claims, keeps verified ones.

No provider calls outside the existing OpenAI mock path. No web-scraping. No third-party fact-check API.

---

## 8. Verification Status Model

State machine (single source of truth, lives in `shared/newsroom-types.ts`):

```
raw ──────► clustered ──► extracting_claims ──► verification_pending ──► verified
                                                       │                    │
                                                       ├──► developing ─────┤
                                                       ├──► disputed  ◄─────┤
                                                       ├──► correction ◄────┤
                                                       └──► rejected
```

**Status field ownership (canonical):**
- `news_event_clusters.status` ∈ `clustered | extracting_claims | verification_pending | rejected | promoted` (terminal `promoted` once a `verified_knowledge` row exists; `rejected` is the cluster-side terminal).
- `verified_knowledge.status` ∈ `verified | developing | disputed | correction` (no `rejected` — a verified row cannot be rejected; see §5).
- `news_articles.status` is **not** changed by Phase 1B (stays `raw|processed`); membership in a cluster is tracked via `news_event_cluster_members`, not by mutating the article row.

### 8.1 Transitions — cluster side
| From (cluster.status) | To | Trigger | Guard |
|---|---|---|---|
| (none) | clustered | clusterer admin run | article in cluster of size ≥ minClusterSize |
| clustered | extracting_claims | `POST /clusters/:id/extract-claims` | cluster not rejected; ≥1 member |
| extracting_claims | verification_pending | `POST /claims/:id/verify` (first verdict for the cluster) | ≥1 claim has any verdict row |
| verification_pending | verification_pending | further `POST /claims/:id/verify` calls | idempotent per-claim updates |
| verification_pending | promoted | `POST /clusters/:id/promote-to-verified` | all claims verdict ∈ {supported, contradicted}; zero `needs_human_review`; aggregate confidence ≥ minConfidence; safe-mode off |
| clustered \| extracting_claims \| verification_pending | rejected | `POST /verified/:id/decision` w/ action=reject **OR** dedicated cluster reject during triage | reason required |
| promoted | (terminal) | — | further evolution lives on the `verified_knowledge` row |

### 8.2 Transitions — verified_knowledge side (action → status)
Every entry here is triggered by `POST /api/admin/newsroom/verified/:id/decision` (§16). `verified_knowledge.status` never becomes `rejected`.

| Action (admin button) | From `verified_knowledge.status` | To | Side effects |
|---|---|---|---|
| approve | verified \| developing | verified | Finalize internally; no public publishing. Writes audit row. |
| send_back | verified \| developing \| disputed | developing | Reopens for cluster-level edits; admin can re-extract claims; new package version on next build. |
| dispute | verified \| developing | disputed | Blocks `build-package` until resolved. |
| correction | verified \| developing \| disputed | correction | Creates a **new** `verified_knowledge` row (status `verified`); old row's `status` set to `correction` and `supersededByVerifiedId` set on the new row. |
| reject | (only for unpromoted clusters — see §8.1) | — | Does not apply to `verified_knowledge`; route returns 409 if invoked against a `verified_knowledge` id. |

Statuses are stored on `news_event_clusters.status` (cluster lifecycle) and on `verified_knowledge.status` (post-promotion lifecycle). The dual-table split is intentional: the cluster row is the working draft, the verified_knowledge row is the immutable promotion snapshot.

---

## 9. Confidence Scoring Fields

`VerifiedKnowledgeConfidence` (jsonb on `verified_knowledge.confidence`, also computed on cluster.confidence):

```ts
type VerifiedKnowledgeConfidence = {
  aggregate: number;                  // 0..1, weighted blend below
  claimSupport: number;               // avg(supportCount / (supportCount+contradictionCount)) across non-rejected claims
  sourceDiversity: number;            // unique sources / total members, capped at 1
  sourceReliabilityAvg: number;       // mean baseScore of distinct sources
  contradictionPenalty: number;       // 0..0.5, subtracted from blend (1× claim contradictionCount / 10)
  ageDecay: number;                   // 1.0 at <24h, 0.9 at <7d, 0.7 at <30d, else 0.5
  computedAt: string;                 // ISO
  formulaVersion: "v1";
};

aggregate = clamp01(
  0.40 * claimSupport
  + 0.20 * sourceDiversity
  + 0.25 * sourceReliabilityAvg
  + 0.15 * ageDecay
  - contradictionPenalty
);
```

Promotion gate (§5) requires `aggregate ≥ minConfidence` (default 0.7) AND zero unresolved `needs_human_review` claims.

---

## 10. Source Reliability Fields

`news_source_reliability` row per `source_name` (seeded once from `config/rssFeeds.json` with tier defaults). Reviewer actions adjust the score:
- `baseScore` (0..1) — manual prior set on creation.
- `recentAccuracy` — EWMA over the last 20 admin verdicts on claims sourced from this domain. `+1` for supported verdicts on its claims, `0` for contradicted, `0.5` for insufficient.
- `retractionCount` — incremented on any `correction` action against a verified knowledge row that cited this source.
- Effective reliability (used in `claimEvidence.reliabilitySnapshot` and `sourceReliabilityAvg`) =
  `0.6 * baseScore + 0.4 * recentAccuracy - min(0.3, 0.05 * retractionCount)`.
- Tier mapping: `>=0.8 → tier_a, >=0.6 → tier_b, >=0.4 → tier_c, else untrusted`.

Untrusted sources block promotion (an admin override flag `acknowledgeSafetyCheck` is required).

---

## 11. VerifiedKnowledge Object

Domain object (returned by `GET /api/admin/newsroom/verified/:id`):

```ts
type VerifiedKnowledge = {
  id: string;
  clusterId: string;
  status: "verified" | "developing" | "disputed" | "correction"; // never "rejected" — see §8.2
  canonicalTitle: string;
  canonicalSummary: string;
  keyFacts: VerifiedKeyFact[];          // see below
  claims: Array<{
    id: string;
    statement: string;
    verdict: ClaimVerdict;
    verdictConfidence: number;
    supportingEvidence: Array<{ url: string; sourceName: string; sourceTier: SourceReliabilityTier }>;
    contradictingEvidence: Array<{ url: string; sourceName: string; sourceTier: SourceReliabilityTier }>;
  }>;
  confidence: VerifiedKnowledgeConfidence;
  sourceCoverage: {
    distinctSources: number;
    tierBreakdown: Record<SourceReliabilityTier, number>;
    earliestPublishedAt: string;
    latestPublishedAt: string;
  };
  approvedBy: string;
  approvedAt: string;
  supersededByVerifiedId: string | null;
};

type VerifiedKeyFact = {
  statement: string;                    // short, presentation-ready
  derivedFromClaimIds: string[];
  confidence: number;                   // 0..1
};
```

Immutability rule: after promotion, only `status` and `supersededByVerifiedId` mutate. Any other change requires a new row (`correction`).

---

## 12. NewsroomDataPackage Object

`NewsroomDataPackagePayload` (stored on `newsroom_data_packages.payload`):

```ts
type NewsroomDataPackagePayload = {
  verifiedKnowledgeId: string;
  version: number;
  template: "news_desk" | "minimal_cards" | "debate_arena_summary";
  title: string;                        // ≤ 80 chars, clamped via render-text-fitting.clampToMax
  subtitle: string;                     // ≤ 120 chars
  headline: { text: string; durationMs: number };
  lowerThirds: Array<{ text: string; startMs: number; endMs: number }>;
  tickerItems: Array<{ text: string }>; // ≤ 6
  segments: Array<{
    segmentIndex: number;
    scriptType: "two_minute" | "ten_minute" | "mougle_conclusion";
    narrationText: string;              // becomes SRT cues via render-srt-service
    keyFactIndex: number | null;
    durationMs: number;
  }>;
  sourceEvidenceReferences: Array<{
    label: string; url: string; claimId: string; confidenceScore: number; status: ClaimVerdict;
  }>;
  mediaRefs: Array<{ mediaId: string; usage: "background"|"insert"|"lower_third_logo"; rightsStatus: RightsStatus }>;
  complianceNotes: string[];
  safetyLabels: string[];               // mirrors AvatarVideoPreviewMetadata.safety
  generatedAt: string;
};

type NewsroomSafetyNotes = {
  internalAdminReviewOnly: true;
  manualRootAdminTriggerOnly: true;
  publicPublishing: false;
  youtubeUpload: false;
  socialPosting: false;
  blockingFindings: ComplianceFinding[];      // from render-text-fitting
  warningFindings: ComplianceFinding[];
  rightsIssues: Array<{ mediaId: string; rightsStatus: RightsStatus; note: string }>;
};
```

The package is the contract between the newsroom domain and the render domain. The render domain MUST NOT read newsroom tables directly; it only reads the package payload (passed in via the manifest, §13).

---

## 13. RenderManifest Changes (no-schema-change variant)

`NewsroomRenderManifest` is the shape the existing `avatar-video-render-service.buildRenderBaseline()` will accept as an optional input. **No change to `avatar_video_render_jobs` columns** — the link to the package is carried inside `previewMetadata.renderBaseline.newsroomLink`:

```ts
// Added to the existing RenderBaseline type in avatar-video-render-service.ts (design only):
newsroomLink?: {
  packageId: string;
  manifestId: string;
  verifiedKnowledgeId: string;
  packageVersion: number;
  template: NewsroomDataPackagePayload["template"];
};

type NewsroomRenderManifest = {
  packageId: string;
  packageVersion: number;
  format: RenderBaseline["format"];                 // re-uses Phase 1A 1920x1080 h264/aac/srt @30fps
  layers: RenderBaseline["layers"];                 // re-uses Phase 1A layer stack
  safeZones: RenderBaseline["safeZones"];           // re-uses captionZone {x:10,y:85,w:80,h:4}
  timing: {
    totalDurationMs: number;
    segments: Array<{
      segmentIndex: number;
      startMs: number; endMs: number;
      lowerThirdVisible: boolean;
      tickerVisible: boolean;
      captionWindow: { startMs: number; endMs: number };
      sourceClaimIds: string[];
    }>;
  };
  textSafety: RenderBaseline["textSafety"];
  captionsPlan: {
    cues: Array<{ index: number; startMs: number; endMs: number; text: string }>;
    overflowFindings: ComplianceFinding[];
  };
  mediaPlan: Array<{ mediaId: string; layer: "background"|"insert"; startMs: number; endMs: number; rightsStatus: RightsStatus }>;
  compliance: { blocking: ComplianceFinding[]; warnings: ComplianceFinding[] };
  safety: AvatarVideoPreviewMetadata["safety"];     // verbatim, hard-coded false flags
  generatedAt: string;
};
```

The render planner uses the manifest's `captionsPlan.cues` directly when calling `renderSrtService.writeSrtForRenderJob`, bypassing the script-package narration path when `previewMetadata.renderBaseline.newsroomLink` is present.

### 13.1 Synthetic script-package adapter (mandatory)

The existing `avatar_video_render_jobs.script_package_id` column is `NOT NULL` and the existing `avatar-video-render-service.previewJob()` flow loads a `podcastScriptPackages` row to derive segment narration, avatar mapping, and audio status. Phase 1B must satisfy that contract without weakening it. **Approach:**

1. On `POST /api/admin/newsroom/manifests/:id/preview`, the newsroom service inserts a **synthetic** row into `podcast_script_packages` whose `script_package` JSON is built from the `NewsroomRenderManifest`:
   - `debate_id` = `null`-equivalent: Phase 1B picks `0` (or, if `debate_id NOT NULL` is enforced, the service first creates a placeholder `live_debates` row with `status="newsroom_synthetic"`). The design assumes a null/zero is accepted; if not, the placeholder-debate fallback is used. Either way: **no new column on `podcast_script_packages`**.
   - `source_article_id` = the cluster's anchor `news_articles.id`.
   - `status` = `"newsroom_synthetic"` (a new opaque value that downstream code treats as `"admin_review"`; the existing `text` column accepts any string — additive only).
   - `script_package` payload synthesizes one segment per manifest segment with `narrationText` becoming the segment's text, voice profile set to a single neutral newsroom anchor.
   - `safety_notes` mirrors `NewsroomSafetyNotes` (§12).
   - `generated_by` = `"newsroom_adapter_v1"`.
2. The synthetic script-package id is then passed as `scriptPackageId` to the existing `createRenderJob()`. The created `avatar_video_render_jobs` row also receives:
   - `audio_job_id` = `null` (newsroom previews are slate-only, no audio synthesis in Phase 1B);
   - `youtube_package_id` = `null` (forever in Phase 1B);
   - `preview_metadata.renderBaseline.newsroomLink` set per §13.
3. `avatar-video-render-service.buildRenderBaseline()` gains a conditional branch (additive, no signature change): when `newsroomLink` is present on the input metadata, it uses the manifest's `captionsPlan.cues` and `timing.segments` directly and skips the audio-derived caption path. When absent, behavior is byte-identical to Phase 1A.
4. Cleanup: the synthetic `podcast_script_packages` row is **not** deleted on cancel — it is retained for audit, with its `status` updated to `"newsroom_canceled"` (still an opaque string). The row is invisible to existing podcast/YouTube admin screens because its `status` is not in their filter sets.

This adapter is the **only** mechanism by which newsroom packages reach the render pipeline. No alternative code path is introduced.

---

## 14. Event Media / Rights Status Model

`newsroom_event_media` row per attached asset. Phase 1B does **not** download or transcode media — it only records:
- `sourceUrl` (the publisher's URL — for human review),
- `storageKey` (optional, only set if an admin manually uploads a locally-owned asset via the existing `replit-object-storage-adapter`),
- `rightsStatus` ∈ `owned | licensed | fair_use_review | rights_unknown | blocked`.

Rules:
- Default for any auto-discovered RSS image: `rights_unknown`.
- `mediaPlan` (§13) MAY reference an asset only if its rightsStatus ∈ `owned | licensed`. Any other status produces a **blocking** compliance finding and refuses to attach it to the render manifest.
- `blocked` status hides the media from the admin selector entirely.
- No image-egress, no thumbnail caching, no CDN — Phase 1B is text-and-locally-owned-media only.

---

## 15. Admin Review Flow

Single founder/root admin reviewer, no multi-reviewer queue in Phase 1B. UI lives at `client/src/pages/admin/Newsroom.tsx` (new) and reuses the `VideoRender.tsx` baseline panels for the render half.

Steps:
1. **Cluster Triage** — left panel lists open clusters with member count, source diversity, candidate confidence. Reviewer can: edit canonical title, drop a member, mark cluster `rejected`.
2. **Claim Review** — per cluster, list extracted claims with verdict pills (auto verdict pre-filled). Reviewer can: override verdict, add rationale, request re-extraction, mark `needs_human_review`.
3. **Promote** — gated button; disabled until all claims resolved and aggregate confidence ≥ threshold and safe-mode off. Click writes `verified_knowledge` row + `newsroom_admin_decisions` row.
4. **Build Package** — picks template (default `news_desk`); shows live preview of clamped title/subtitle/lower-thirds/tickers using `render-text-fitting`.
5. **Build Manifest + Preview Render** — single button kicks: build manifest → create `avatar_video_render_jobs` row with `newsroomLink` → run existing `previewJob` flow → write SRT + MP4 under `.local/media-assets/render/`. Same admin-only stream routes (`captions.srt`, `preview.mp4`) serve them.
6. **Final Decision** — Approve / Send Back / Correction / Dispute (Reject is only available for unpromoted clusters, per §8.1). Each button POSTs to `/api/admin/newsroom/verified/:id/decision` with an `action` value (the button label, not a status). The server writes `newsroom_admin_decisions` and updates `verified_knowledge.status` per the action→status mapping in §8.2.

All buttons send a CSRF-bearing POST under `requireRootAdmin`. The "Approve" decision in Phase 1B is **internal-only** — it does NOT publish anywhere; it merely finalizes the `verified` status.

---

## 16. API Endpoints (all `requireRootAdmin`, all POST unless noted)

| Method | Path | Body schema (§4) | Purpose |
|---|---|---|---|
| GET  | `/api/admin/newsroom/clusters` | (qs: status, limit) | List clusters with member counts |
| POST | `/api/admin/newsroom/clusters/draft` | `ClusterDraftRequestSchema` | Run heuristic clusterer on processed articles |
| POST | `/api/admin/newsroom/clusters/:id/reject` | `{ reason: string }` | Cluster-side reject (transitions `news_event_clusters.status → rejected`, §8.1) |
| GET  | `/api/admin/newsroom/clusters/:id` | — | Cluster detail with members + claims |
| PATCH| `/api/admin/newsroom/clusters/:id` | `{ canonicalTitle?, canonicalSummary?, dropMemberIds?: number[] }` | Reviewer edits |
| POST | `/api/admin/newsroom/clusters/:id/extract-claims` | `ClaimExtractionRequestSchema` | Run claim extractor |
| GET  | `/api/admin/newsroom/claims/:id` | — | Claim detail with evidence + verifications |
| POST | `/api/admin/newsroom/claims/:id/verify` | `ClaimVerifyRequestSchema` | Auto or admin verdict |
| POST | `/api/admin/newsroom/clusters/:id/promote-to-verified` | `PromoteToVerifiedRequestSchema` | Creates `verified_knowledge` row |
| GET  | `/api/admin/newsroom/verified/:id` | — | `VerifiedKnowledge` object (§11) |
| POST | `/api/admin/newsroom/verified/:id/build-package` | `BuildPackageRequestSchema` | Creates `newsroom_data_packages` row |
| GET  | `/api/admin/newsroom/packages/:id` | — | Package detail incl. payload |
| POST | `/api/admin/newsroom/packages/:id/build-manifest` | `BuildRenderManifestRequestSchema` | Creates `newsroom_render_manifests` row |
| GET  | `/api/admin/newsroom/manifests/:id` | — | Manifest detail |
| POST | `/api/admin/newsroom/manifests/:id/preview` | `PreviewRenderRequestSchema` | Reuses Phase 1A `previewJob` with newsroomLink |
| POST | `/api/admin/newsroom/verified/:id/decision` | `AdminDecisionRequestSchema` | Approve / send-back / reject / correction / dispute |
| GET  | `/api/admin/newsroom/sources` | — | List `news_source_reliability` rows |
| PATCH| `/api/admin/newsroom/sources/:id` | `{ tier?, baseScore?, notes? }` | Reviewer tweaks |
| GET  | `/api/admin/newsroom/media` | (qs: clusterId) | List event media |
| POST | `/api/admin/newsroom/media` | `{ clusterId, kind, sourceUrl?, storageKey?, rightsStatus, rightsNote? }` | Attach media |
| PATCH| `/api/admin/newsroom/media/:id` | `{ rightsStatus?, rightsNote? }` | Update rights |

Existing Phase 1A stream endpoints (`/api/admin/video-render/jobs/:id/captions.srt` and `…/preview.mp4`) serve the newsroom render outputs unchanged.

---

## 17. E2E Acceptance Test Plan

Two layers, all to be implemented when Phase 1B is coded (not now).

### 17.1 Unit / pure-function tests (Jest, sibling of existing `tests/render-*.test.ts`)
1. `tests/newsroom-clusterer.test.ts` — fixtures of 12 article-shaped objects; expect 3 clusters, 1 contradicting member, 1 unmatched article.
2. `tests/newsroom-claim-extractor.test.ts` — mocked OpenAI client; assert JSON parser + fallback `mockClaims()` path; assert idempotent re-extraction preserves verified claims.
3. `tests/newsroom-confidence.test.ts` — table of inputs → expected `aggregate` (formula v1).
4. `tests/newsroom-source-reliability.test.ts` — EWMA update + tier mapping + retraction penalty.
5. `tests/newsroom-manifest-builder.test.ts` — given a `VerifiedKnowledge` + package, manifest cues equal SRT cues produced by `renderSrtService.buildSrtFromSegments`; safeZones equal Phase 1A baseline.

### 17.2 Real-HTTP route tests (mirrors `tests/render-srt-route.test.ts` pattern)
6. `tests/newsroom-routes-auth.test.ts` — every endpoint above returns 401 unauthenticated, 403 non-root admin, 200/2xx root admin (deps stubbed). Static grep guard: any `/api/admin/newsroom/*` registration MUST include `requireRootAdmin` (mirrors the existing `admin-download-auth.test.ts` source-scan).
7. `tests/newsroom-promotion-gate.test.ts` — POST `/promote-to-verified` returns 409 when aggregate confidence < threshold, 409 when unresolved `needs_human_review` claim exists, 409 when `safeModeControls.globalSafeMode=true`, 201 otherwise.
8. `tests/newsroom-render-link.test.ts` — POST `/manifests/:id/preview` produces an `avatar_video_render_jobs` row with `previewMetadata.renderBaseline.newsroomLink.packageId` set and writes both `.srt` and `.mp4` under `.local/media-assets/render/`. Existing captions/preview routes return 200 for that job.
9. `tests/newsroom-rights-block.test.ts` — building a package whose `mediaRefs` include a `rights_unknown` asset emits a blocking compliance finding and prevents manifest build (409).
10. `tests/newsroom-decision-audit.test.ts` — every state-changing endpoint writes exactly one `newsroom_admin_decisions` row with `decidedBy` = admin id.

### 17.3 Manual acceptance checklist (admin walk-through)
- Trigger clusterer with 24h window → see clusters appear.
- Open cluster → extract claims → see 3–8 claims with verdict pills.
- Run auto-verify → admin override one verdict → promote → verified knowledge appears.
- Build package → preview render → MP4 plays inline, captions download with `application/x-subrip`.
- Toggle `globalSafeMode` → re-promote blocked with explanatory message.
- Issue correction → new verified row appears with `supersededByVerifiedId` pointing at the old one.

---

## 18. Migration Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Schema additions collide with concurrent Phase 1B sibling branches | Medium | All 11 new tables use the `news_*`, `newsroom_*`, `verified_knowledge` prefixes — no collision with existing names. Drizzle migration must be reviewed for diff-only adds. |
| `news_event_clusters.confidence` recomputed inconsistently with `verified_knowledge.confidence` | High | Both use the same exported `computeConfidence()` function from `server/services/newsroom-confidence.ts`. Unit test #3 locks the formula. |
| Claim extraction silently degrades without `OPENAI_API_KEY` | Medium | Service explicitly returns mock claims with `extractedBy="mock"` and marks cluster `needs_human_review` so an admin cannot promote unknowingly. |
| Heuristic clusterer over-merges unrelated stories | Medium | Threshold 0.55 + admin "drop member" action + per-cluster `confidence` penalty for contradicting members. |
| `newsroomLink` on `previewMetadata.renderBaseline` is ignored by an older render job | Low | Field is optional and additive; Phase 1A render path remains the default when absent. |
| Rights misclassification leaks third-party media into preview MP4 | Critical | `mediaPlan` rejects any asset with rightsStatus ≠ `owned|licensed`; render baseline emits blocking finding; preview MP4 will not include that asset. |
| Volume of `newsroom_admin_decisions` grows unbounded | Low | Append-only by design; index on `(subjectType, subjectId, decidedAt)`; later archival is its own task. |
| Reuse of `.local/media-assets/render/` path mixes podcast and newsroom outputs | Low | Filename allowlist `rj_<id>_<seed>.{mp4,srt}` already encodes job id; no separate prefix needed. |
| `gpt-5.5` model name not actually available in production | Medium (pre-existing) | Same risk as existing `newsService.ts`; not introduced by this design. |

---

## 19. Rollback Plan

1. **Schema rollback** — Phase 1B introduces only **additive** tables (no column drops, no type changes on existing tables, no FK additions to existing tables — the render link lives inside an existing JSONB field). Rolling back is `DROP TABLE` on the 11 new tables in dependency-reverse order:
   `newsroom_admin_decisions, newsroom_render_manifests, newsroom_data_packages, verified_knowledge, newsroom_claim_verifications, newsroom_claim_evidence, newsroom_claims, news_event_cluster_members, news_event_clusters, newsroom_event_media, news_source_reliability`.
2. **Code rollback** — revert the Phase 1B PR. The Phase 1A render path keeps working because all newsroom code paths key off `previewMetadata.renderBaseline.newsroomLink` being present. Existing avatar/podcast render jobs do not set that field and continue unaffected.
3. **Data rollback** — `news_articles` rows are never mutated by Phase 1B (only read). No reverse migration is needed for the existing news pipeline.
4. **Filesystem rollback** — `.local/media-assets/render/rj_*.mp4` and `.srt` files created via the newsroom path are indistinguishable from Phase 1A outputs and can be left in place or removed wholesale.
5. **Safe-mode escape hatch** — flipping `safeModeControls.globalSafeMode = true` immediately blocks every Phase 1B state-changing endpoint without code change.

---

## 20. Explicit Out-of-Scope (Phase 1B will NOT do any of these)

- No public publishing of any kind (no public web pages exposed beyond existing `/api/news`).
- No YouTube upload, no YouTube package mutation, no YouTube API call.
- No social distribution (Twitter/X, LinkedIn, Reddit, Facebook, TikTok, etc.).
- No live video providers (HeyGen / D-ID / Synthesia / Unreal). Render stays `dry_run` only.
- No autonomous promotion. Every status transition requires an admin button-press.
- No scheduler / cron for newsroom. RSS scheduler stays as-is on `newsService.ts`; clustering and downstream steps are admin-only manual triggers.
- No embeddings, no vector column, no semantic-search dependency, no pgvector. The `centroidEmbeddingRef` text column is reserved but unused.
- No media download, transcode, or thumbnail generation. Media handling is metadata-only plus locally-owned uploads.
- No third-party fact-check API (Snopes, ClaimReview, etc.).
- No multi-reviewer queue, no claim reviewer voting, no per-claim assignment.
- No changes to existing tables. No `db:push`. No migration generated in Phase 1B design — that lands in the implementation task.
- No changes to existing routes. Phase 1A render routes (`/api/admin/video-render/*`) are extended only by the data they serve, not by their shape.
- No changes to `client/src/pages/admin/VideoRender.tsx` UI contract — Phase 1B adds a new `Newsroom.tsx` page that links into it.
- No e-mail dispatch (Resend), no notifications outside the admin dashboard.
- No mobile, no PWA, no SSE/WS push.

---

**End of design. Implementation is a separate task; no files in this branch are modified beyond the addition of this document.**
