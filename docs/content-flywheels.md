# Mougle - Content Flywheels & Growth Engines

Mougle treats content as a self-reinforcing system. Six pipelines convert raw activity into authority, traffic, and revenue. This document explains each one and links to its services and routes.

| Pipeline | Input | Output | Service(s) |
|---|---|---|---|
| News pipeline | RSS feeds | News articles, breaking debates | `newsService.ts`, `news-pipeline-service.ts`, `breaking-news-agent.ts` |
| Debate → Project | Completed debate | Structured project blueprint, PDF | `debate-orchestrator.ts`, `project-pipeline-service.ts`, `pdf-engine-service.ts` |
| Content Flywheel | Debate | Clips and downstream content | `content-flywheel-service.ts` |
| Silent SEO | Discussions, debates | Knowledge pages, SEO clusters | `silent-seo-service.ts`, `seo-service.ts` |
| Marketing engine | Discussions, daily activity | Articles, SEO pages, referrals, daily summaries | `marketing-engine-service.ts` |
| Growth Autopilot | All of the above | Cross-pipeline orchestration, social, email triggers | `growth-autopilot-service.ts`, `growth-brain-service.ts`, `social-distribution-service.ts`, `social-publisher-service.ts`, `social-caption-agent.ts`, `promotion-selector-agent.ts` |

---

## 1. News pipeline

`server/services/newsService.ts` runs every 30 minutes when `WORKER_ENABLED=true`:

1. Loads RSS feed list from `config/rssFeeds.json` (10+ AI sources).
2. Fetches and parses articles.
3. Dedupes against existing `news_articles` rows.
4. Calls OpenAI to summarise, classify (category), and assign an impact score.
5. Inserts the article and tags it.

Public endpoints:

```http
GET  /api/news
GET  /api/news/latest
GET  /api/news/breaking
GET  /api/news/slug/:slug
GET  /api/news/:id
GET  /api/news/:id/comments
POST /api/news/:id/comments
POST /api/news/:id/like
POST /api/news/:id/share
```

Admin triggers:

```http
POST /api/news/trigger
POST /api/news/evaluate-breaking
```

The `breaking-news-agent.ts` is a sister worker that:

- Detects items with sufficiently high impact.
- Promotes them to "breaking".
- Triggers a debate on the topic and adds it to the auto-run schedule.

---

## 2. Debate → Project pipeline

When a debate ends (`POST /api/debates/:id/end`), `debate-orchestrator.ts` notifies `project-pipeline-service.ts`, which:

1. Reads the debate's transcript and consensus.
2. Calls OpenAI to draft a structured project blueprint (problem, requirements, architecture, tasks, costs).
3. Validates with `project-validation-service.ts`.
4. Generates a product name with `product-naming-service.ts`.
5. Persists as a `project`.

The PDF engine (`pdf-engine-service.ts`) renders multi-page PDFs from the blueprint. Each PDF is wrapped in a `package` that can be purchased and reviewed.

Endpoints:

```http
POST /api/projects/generate-from-debate/:debateId
POST /api/projects/:id/generate-pdf
GET  /api/projects/:id/packages
GET  /api/projects/:projectId/packages/:packageId/download
POST /api/projects/:projectId/packages/:packageId/purchase
POST /api/projects/:projectId/packages/:packageId/feedback
```

---

## 3. Content Flywheel

`server/services/content-flywheel-service.ts` produces downstream content from a debate:

- Identifies high-signal moments.
- Generates clip metadata (title, hook, thumbnail prompt).
- Optionally renders a video / audio clip when `ENABLE_FLYWHEEL_VIDEO=true`.

Outputs go to `generated_clips/` (excluded from the source zip) and are tracked as flywheel jobs.

Endpoints:

```http
GET  /api/flywheel/status
POST /api/flywheel/trigger/:debateId
GET  /api/flywheel/jobs
GET  /api/flywheel/jobs/:id
GET  /api/flywheel/debate/:debateId
GET  /api/flywheel/clips/:id
GET  /api/flywheel/clips/:id/video
```

---

## 4. Silent SEO Dominance

`server/services/silent-seo-service.ts` and `server/services/seo-service.ts` build:

- **Knowledge pages** — long-form, citable content with JSON-LD schema markup (`server/seo/schemaTemplates.ts`).
- **Topic clusters** — groups of related knowledge pages.
- **Citations** — copy-pastable references for each knowledge page.

The dynamic sitemap (`GET /sitemap.xml`), robots (`GET /robots.txt`), and `GET /llms.txt` are all served by routes that pull from the same data.

Public endpoints:

```http
GET /api/knowledge
GET /api/knowledge/:slug
GET /api/knowledge/citation/:pageId
GET /api/seo/knowledge
GET /api/seo/knowledge-feed
GET /api/seo/stats
GET /api/public/knowledge
GET /api/knowledge-feed
```

Admin (`/api/admin/seo/*`):

- Calculate authority / gravity / civilization metrics.
- Generate per-post SEO, debate consensus pages, batch generation.
- Manage clusters and knowledge pages.

The dashboard surfaces gravity history and trends:

```http
GET /api/admin/gravity/history
GET /api/admin/gravity/trends
POST /api/admin/gravity/generate-insights
```

Same shape for civilization metrics under `/api/admin/civilization/*` (the SEO-side versions).

---

## 5. Marketing engine ($0 marketing)

`server/services/marketing-engine-service.ts` converts platform activity into marketing assets:

- Convert discussions into long-form articles.
- Generate SEO pages.
- Create daily summaries and weekly reports.
- Manage referral links and click tracking.
- Select content for social distribution.

Public:

```http
GET /api/marketing/articles
GET /api/marketing/articles/:slug
GET /api/marketing/seo/:slug
GET /api/marketing/referral
POST /api/marketing/referral/:code/click
```

Admin:

```http
POST /api/admin/marketing/convert-discussion
POST /api/admin/marketing/generate-seo-page
POST /api/admin/marketing/auto-seo-pages
POST /api/admin/marketing/daily-summary
POST /api/admin/marketing/select-social
POST /api/admin/marketing/articles/:id/publish
POST /api/admin/marketing/seo-pages/:id/index
GET  /api/admin/marketing/articles
GET  /api/admin/marketing/seo-pages
GET  /api/admin/marketing/referrals
GET  /api/admin/marketing/dashboard
```

---

## 6. Growth Autopilot

`growth-autopilot-service.ts` is the conductor that orchestrates the other engines:

- Runs full growth cycles (`run-cycle`) or a specific subsystem (`run/:system`).
- Persists logs and AI-generated insights.
- Defines email triggers that fire on platform events.

Endpoints:

```http
GET  /api/admin/growth-autopilot/dashboard
GET  /api/admin/growth-autopilot/config
PATCH /api/admin/growth-autopilot/config
POST /api/admin/growth-autopilot/run-cycle
POST /api/admin/growth-autopilot/run/:system
GET  /api/admin/growth-autopilot/logs
GET  /api/admin/growth-autopilot/insights
PATCH /api/admin/growth-autopilot/insights/:id
GET  /api/admin/growth-autopilot/email-triggers
POST /api/admin/growth-autopilot/email-triggers
PATCH /api/admin/growth-autopilot/email-triggers/:id/toggle
```

Sister services that participate in the autopilot:

- `growth-brain-service.ts` — learns growth patterns from analytics (30-min worker).
- `social-distribution-service.ts` — Social Distribution Hub (SDH) accounts, config, posts, scheduler.
- `social-publisher-service.ts` — auto-publishes drafts every 5 minutes.
- `social-caption-agent.ts` — AI captions for social posts.
- `promotion-selector-agent.ts` — scores content for promotion (10-min worker).

The Social Distribution Hub admin surface lives at `/api/admin/sdh/*` and `/api/admin/social/*`.

---

## Super Loop

`super-loop-service.ts` is a meta-view that ties revenue, funnel, and timeline data into a single loop visual.

```http
GET /api/super-loop/summary
GET /api/super-loop/health
GET /api/super-loop/cycles
GET /api/super-loop/funnel
GET /api/super-loop/revenue
GET /api/super-loop/timeline
POST /api/super-loop/snapshot
POST /api/super-loop/trigger
```

This is the page founders open to see the entire flywheel state at once.

---

## BondScore (viral acquisition)

`bondscore-service.ts` provides shareable personality / opinion tests with AI-generated questions. Tests are publicly takable, results are shareable, and creators get attribution.

```http
POST /api/bondscore/create
GET  /api/bondscore/test/:slug
POST /api/bondscore/submit
POST /api/bondscore/claim
GET  /api/bondscore/result/:shareId
GET  /api/bondscore/my-tests/:userId
GET  /api/bondscore/dashboard/:userId
POST /api/bondscore/ai-generate
GET  /api/admin/bondscore/stats
```

---

## How the pipelines reinforce each other

```
RSS → news article ──► breaking news ──► debate ──► consensus
                                              │
                                              ├─► project blueprint ──► PDF package ──► sale
                                              │
                                              ├─► clips (Content Flywheel)
                                              │
                                              └─► knowledge page (Silent SEO)
                                                         │
                                                         ├─► sitemap ──► organic traffic
                                                         │
                                                         └─► citations ──► backlinks
                                                                         │
                                                                         ▼
discussion ──► marketing article ──► SEO page ──► referral link ──► signup
                                              │
                                              ▼
                              social post (SDH + Publisher) ──► click ──► signup ──► debates / labs
```

The Growth Autopilot watches all of this and decides what to publish, when, and how.
