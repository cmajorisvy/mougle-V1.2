# Mougle Newsroom — Functional Flow & Data Structures

> Derived from the actual backend: `server/services/news*`, `server/services/newsroom/*`, `server/routes/*newsroom*`, and `shared/schema.ts` / `shared/newsroom-schema.ts`.
> The newsroom is a multi-stage pipeline that turns raw RSS items into **Verified Knowledge**, which downstream services (debates, podcasts, videos, social posts) consume.

---

## 1. High-Level Functional Flow

```
                   ┌──────────────────────────────────────────┐
                   │  config/rssFeeds.json (10 sources)       │
                   │  OpenAI · DeepMind · MIT TR · VentureBeat│
                   │  TechCrunch · The Verge · HuggingFace    │
                   │  NVIDIA · Stanford HAI · arXiv AI        │
                   └────────────────────┬─────────────────────┘
                                        │  every 30–60 min
                                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ STAGE 1 — INGESTION                                          │
   │ newsService.ts + news-pipeline-service.ts                    │
   │  · rss-parser fetch  · URL+title hash dedupe                 │
   │  · INSERT news_articles {status:'raw'}                       │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ STAGE 2 — PROCESSING (AI enrichment)                         │
   │ news-pipeline-service.ts → OpenAI gpt-5.5                    │
   │  · 2-sentence summary       · category classification        │
   │  · SEO blog draft           · hashtag generation             │
   │  · short script (for video) · UPDATE status='processed'      │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ STAGE 3 — IMPACT / BREAKING EVALUATION                       │
   │ breaking-news-agent.ts → gpt-5.5                             │
   │  · impactScore 0–100  · isBreakingNews (>80)                 │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ STAGE 4 — CLUSTERING                                         │
   │ newsroom/clusteringService.ts                                │
   │  · Jaccard similarity + time window                          │
   │  · canonical title rewrite (extractor model)                 │
   │  → EventCluster (in-memory / DB)                             │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ STAGE 5 — CLAIM EXTRACTION                                   │
   │ newsroom/claimExtractionService.ts                           │
   │  · lexical fact extraction  · dispute detection              │
   │  → ClusterExtraction (claims + evidence)                     │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ STAGE 6 — VERIFICATION GATE (HUMAN)                          │
   │ newsroom-data-package-service.ts                             │
   │  · Root admin promotes cluster → verified_knowledge          │
   │  · INSERT verified_claims, verified_timeline_events          │
   │  · attaches verified_media_references                        │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ STAGE 7 — PACKAGING                                          │
   │ newsroom/newsroomDataPackageBuilder.ts                       │
   │  → DataPackagePayload {canonical, claims, timeline, media,   │
   │     confidence, sourceCoverage}                              │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ STAGE 8 — AUTOPILOT DISPATCH                                 │
   │ newsroom/continuousNewsroomScheduler.ts                      │
   │ + autopilotDecisionService.ts (safety gates)                 │
   │  · enqueues to downstream playout queue                      │
   │  · kill-switch / dry-run modes                               │
   └─────┬──────────────┬─────────────────┬────────────────┬──────┘
         ▼              ▼                 ▼                ▼
   ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐
   │ Debate   │  │ Podcast      │  │ Avatar Video │  │ Social      │
   │ pipeline │  │ script eng.  │  │ render svc   │  │ distribution│
   │          │  │              │  │              │  │ hub         │
   └──────────┘  └──────────────┘  └──────────────┘  └─────────────┘
```

---

## 2. Stage-by-Stage Reference

| # | Stage | Service file | Trigger | Inputs | Outputs | AI model | Tables R/W |
|---|---|---|---|---|---|---|---|
| 1 | Ingestion | `newsService.ts`, `news-pipeline-service.ts` | cron (30–60 min) | RSS XML | raw rows | — | `news_articles` (W) |
| 2 | Processing | `news-pipeline-service.ts` | continuous on `status='raw'` | raw article | enriched fields | OpenAI gpt-5.5 (summary, SEO, classify) | `news_articles` (R/W) |
| 3 | Breaking eval | `breaking-news-agent.ts` | post-processing | processed article | impactScore, isBreakingNews | gpt-5.5 | `news_articles` (R/W) |
| 4 | Clustering | `newsroom/clusteringService.ts` | on-demand / scheduled | processed articles | EventCluster | extractor (title) | `news_articles` (R) |
| 5 | Claim extraction | `newsroom/claimExtractionService.ts` | per cluster | EventCluster | ClusterExtraction | extractor | pure (in-memory) |
| 6 | Verification gate | `newsroom-data-package-service.ts` | manual root-admin | ClusterExtraction | VerifiedKnowledge | — (human) | `verified_knowledge`, `verified_claims`, `verified_timeline_events` (W) |
| 7 | Packaging | `newsroom/newsroomDataPackageBuilder.ts` | on verified record | verified rows | DataPackagePayload | — | `verified_*` (R) |
| 8 | Autopilot dispatch | `newsroom/continuousNewsroomScheduler.ts` + `autopilotDecisionService.ts` | continuous loop | DataPackagePayload | downstream jobs | — | in-memory state + downstream tables |

---

## 3. Trust & Safety Gates (in order)

1. **Deduplication** — URL+title hash (`news-pipeline-service.ts`)
2. **Classification** — AI category assignment (research / product / funding / policy / open-source / breakthrough)
3. **Impact scoring** — `breaking-news-agent.ts`, 0–100; >80 triggers breaking flag
4. **Clustering** — deterministic Jaccard + time-window grouping
5. **Claim extraction** — lexical extraction + dispute detection
6. **TCS (Trust Confidence Score)** — `trust-engine.ts` on extracted claims (evidence + consensus)
7. **Content moderation** — global middleware (blocked terms, spammers)
8. **Root-admin verification** — hard gate; nothing reaches autopilot/public without `verified_knowledge.status='verified'`
9. **Autopilot decision** — `autopilotDecisionService.ts` re-checks rate limits, dry-run flag, kill-switch before downstream dispatch

---

## 4. Data Structures

### 4.1 `news_articles` (primary ingestion table)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | AI-rewritten headline |
| `slug` | text unique | for `/api/news/:slug` |
| `originalTitle` | text | from RSS |
| `originalContent` | text | raw item body |
| `summary` | text | 2-sentence AI summary |
| `content` | text | normalized body |
| `seoBlog` | text | long-form SEO draft |
| `script` | text | short video/podcast script seed |
| `hashtags` | text[] | for social distribution |
| `category` | text | research / product / funding / policy / open-source / breakthrough |
| `imageUrl` | text | hero image |
| `sourceUrl` | text | canonical origin |
| `sourceName` | text | OpenAI, DeepMind, … |
| `sourceType` | text | rss / api / manual |
| `status` | text | `raw` → `processed` → `published` |
| `impactScore` | int | 0–100 |
| `isBreakingNews` | bool | `impactScore > 80` |
| `debateId` | uuid FK → `live_debates.id` | set when converted |
| `publishedAt` | timestamp | |

### 4.2 `news_comments`, `news_reactions`, `news_shares`
Standard engagement tables. `news_comments.commentType ∈ {verification, expert, critic}` is AI-tagged.

### 4.3 `verified_sources`
Reliability registry: `sourceName`, `domain`, `tier` (A / B / C), `baseScore`. Feeds into TCS.

### 4.4 `verified_knowledge` (immutable canonical story)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `clusterId` | text | upstream cluster ref |
| `status` | text | `draft` / `verified` / `retracted` |
| `canonicalTitle` | text | one-true headline |
| `canonicalSummary` | text | |
| `keyFacts` | jsonb | array of fact objects |
| `confidence` | jsonb | per-fact scores |
| `sourceCoverage` | jsonb | sources confirming/disputing |
| `approvedBy` | uuid FK → users | root-admin signer |

### 4.5 `verified_claims`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `verifiedKnowledgeId` | FK | |
| `clusterId` | text | |
| `statement` | text | single fact claim |
| `verdict` | text | confirmed / disputed / unverified |
| `evidence` | jsonb | sources, quotes, links |

### 4.6 `verified_timeline_events`
Append-only history per `verifiedKnowledgeId`. `eventType ∈ {anchor, update, correction}`.

### 4.7 `verified_media_references`
Image/clip references with rights status — consumed by avatar video render.

### 4.8 `podcast_script_packages` (downstream join table)

| Column | Notes |
|---|---|
| `id` | PK |
| `debateId` | FK → `live_debates.id` |
| `sourceArticleId` | FK → `news_articles.id` |
| `status` | draft / approved / rendered |
| `scriptPackage` | jsonb (2-min brief + 10-min script) |

---

## 5. API Surface

### 5.1 Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/news` | list published articles |
| GET | `/api/news/:slug` | article detail |

### 5.2 Admin (gated)

| Method | Path | Gate | Purpose |
|---|---|---|---|
| POST | `/api/news/trigger` | `requireAnyAdminPermission(['content:manage','news:manage'])` | manual RSS pipeline run |
| POST | `/api/admin/news-to-debate/generate` | `requireRootAdmin` | convert article → debate draft |
| POST | `/api/admin/podcast-scripts/generate` | `requireRootAdmin` | convert debate → podcast package |
| GET  | `/api/admin/autopilot/status` | `requireRootAdmin` | 24/7 newsroom state |
| POST | `/api/admin/autopilot/start` | `requireRootAdmin` | start continuous scheduler |
| POST | `/api/admin/autopilot/kill-switch` | `requireRootAdmin` | emergency stop |

All POSTs sit behind global `csrfMiddleware` first, then the admin gate. Anonymous POST without a CSRF token returns 403 from CSRF; with a token but no admin session returns 401 from the admin gate.

---

## 6. Downstream Join Points

| Downstream | Service | Joined via | Result |
|---|---|---|---|
| Debate | `news-to-debate-service.ts` | `news_articles.id` → `live_debates.sourceArticleId` | draft debate, agents picked by `category` |
| Podcast | `podcast-script-engine.ts` | `live_debates.id` + `news_articles.id` | `podcast_script_packages` row |
| Video | `avatar-video-render-service.ts` | `scriptPackageId` + `audioJobId` + `verified_media_references` | render job |
| Social | `social-distribution-service.ts` | listens for new `knowledgePages` / `news_articles` | per-platform post draft |

---

## 7. Schedulers

| Loop | Owner | Interval | Notes |
|---|---|---|---|
| RSS fetch | `newsService.ts` | 30 min | startup-registered |
| Pipeline drain | `news-pipeline-service.ts` | continuous | processes `status='raw'` |
| Continuous newsroom | `newsroom/continuousNewsroomScheduler.ts` | configurable | autopilot dispatch loop, respects kill-switch |

---

## 8. Failure & Safety Behavior

- **Dedupe collision** → row skipped, counter incremented.
- **AI call failure** → article stays at `status='raw'`; retried on next pass.
- **Verification missing** → no autopilot dispatch, no public exposure.
- **Kill-switch ON** → scheduler skips all downstream dispatch but ingestion continues.
- **Dry-run mode** → downstream jobs enqueued but marked `dryRun=true`; no external publish.

---

*Generated from backend source-of-truth. Re-generate this doc whenever a new stage, table, or downstream consumer is added.*
