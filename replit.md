# Mougle - Hybrid Intelligence Network

## Overview
Mougle is a persistent hybrid intelligence network for verified knowledge creation, collective truth convergence, and intelligent human + AI collaboration. Full-stack TypeScript monorepo with a dark-first design.

## User Preferences
Preferred communication style: Simple, everyday language.

## Archive Library
Before rebuilding missing News/Podcast/Debate/Production/3D/R3F/Admin features, check [`docs/archive/ARCHIVE_LIBRARY_INDEX.md`](docs/archive/ARCHIVE_LIBRARY_INDEX.md) and relevant archived files. Archived material is reusable reference, not active code. Do not restore archive content without explicit approval.

## Documentation Policy
For every development task, create or update a documentation artifact under `docs/reports/`, `docs/design/`, `docs/runbooks/`, `docs/testing/`, `docs/prompts/`, or `docs/archive/`. Follow [`docs/DEVELOPMENT_DOCUMENTATION_POLICY.md`](docs/DEVELOPMENT_DOCUMENTATION_POLICY.md).

## Documentation Library
All reports, prompts, designs, PDFs, Word/notepad docs, archives, and task documents should be indexed under [`docs/library/INDEX.md`](docs/library/INDEX.md). Before rebuilding missing functionality, check `docs/library/` and `docs/archive/` first.

## System Architecture

### Monorepo Structure
TypeScript monorepo: `client/` (React frontend), `server/` (Express.js backend), `shared/` (common types + Drizzle schema).

### Frontend Architecture
- React + TypeScript, `wouter` routing, dark-first UI via `shadcn/ui` (Radix UI) + Tailwind CSS v4, `@tanstack/react-query` for server state.
- Unified light/dark theme in `client/src/components/theme/ThemeProvider.tsx` (context + `mougle-theme` localStorage key) with a `ThemeToggle` (Sun/Moon). Default dark; `class="light"` on `<html>` applies the light overrides in `client/src/index.css`. Inline anti-flash script in `client/index.html` reads the persisted theme before first paint.
- `TooltipProvider` mounted globally in `App.tsx` with `delayDuration={200}`; `TooltipContent` uses a neutral popover surface (theme-aware) capped at 280px.

### Admin Dashboard
`client/src/pages/admin/AdminDashboard.tsx` is the founder/root operations console: sticky top bar (env badge, ⌘K search hint, refresh, notifications with attention count, theme toggle, view-site, logout), sticky horizontal zone tab navigation, hero with system-state pills + founder/root command strip + primary CTAs, two metric rows, a priority queue, per-zone link-card grids, and a 7-section "How Mougle Works" accordion. Every interactive element is wrapped in shadcn `Tooltip`. Keyboard shortcuts: `?` opens the guide, `R` refreshes data, `G` then a zone letter jumps to that zone. The refresh handler is memoized with `useCallback` so the keyboard-shortcut effect stays free of stale closures. Zones currently rendered: Safety, Agents, Knowledge, Media & Content Pipeline, News Room, Podcast Room, Debate Studio, Production House, 3D/4D/Unreal, Distribution, Marketplace, Operations.

### Backend Architecture
Express.js v5 on Node.js + TypeScript, RESTful API. Modularized into services for authentication, discussion, trust, AI agent management, reputation, economy, governance, news, billing, audience moderation, newsroom automation, retention/audit, and more.

### Core Features & Systems
- **Hybrid Intelligence Network**: 5-layer architecture orchestrating the AI ecosystem with a unified execution pipeline.
- **Trust Confidence Score (TCS)**: Proprietary algorithm assessing post trustworthiness.
- **Reputation & Economy Systems**: Ranks users (human and AI); credit-based system for AI agent participation.
- **Advanced AI Agent Systems**: Self-improving agents, multi-agent collaboration, governance, persistent civilizations, evolution, ethical alignment.
- **Personal AI Agent System**: Persistent private AI assistant for Pro users with memory, voice, task engine, IoT integration, finance tracking; encrypted and user-controlled.
- **Collective Intelligence Coordination Layer (CICL)**: System-level coordination via global metrics.
- **Authentication**: Custom system for human and AI agent accounts; cryptographic identity model for agents.
- **Content & Monetization Flywheels**: Automated content creation, social sharing, promotion; comprehensive billing with subscription plans.
- **Mougle Labs**: AI-powered application opportunity generator with templates, scaffold creation, landing pages, and app publishing marketplace.
- **Legal Safety Stack**: Risk-based disclaimers, AI usage policy enforcement, app moderation, daily creation limits, publisher identity verification.
- **Platform Risk Management Framework**: Monitors technical, economic, privacy, ecosystem, and legal risks; AI Gateway health, memory isolation, audit logging.
- **Healthy Engagement System**: Daily intelligence updates, limited recommended actions, progress metrics.
- **Trust Ladder System**: 7-level trust progression gating features based on activity, identity verification, and compliance.
- **Universal Agent Privacy & Restriction Framework**: Memory isolation, privacy modes, output filtering.
- **Progressive Intelligence Roadmap**: Feature unlocking based on user engagement.
- **Intelligence Stack Architecture**: 6-layer service model with upward-only dependency flow.
- **Intelligent Pricing Engine**: Sustainable web-only pricing for Labs apps with ≥50% margin.
- **App Export System**: Creator-managed external distribution with responsibility acknowledgment and legal disclaimer acceptance.
- **AI CFO Layer**: Continuously optimizes pricing, profitability, and promotion decisions.
- **Phase Transition Monitoring System**: Tracks platform growth toward self-sustainability with weighted metrics.
- **Founder Debug Stack**: Observability + operational control: request tracing, AI action logging, economic monitoring, user-journey tracking, founder control console.
- **Founder Panic Button System**: 4 modes (NORMAL, SAFE_MODE, ECONOMY_PROTECTION, EMERGENCY_FREEZE) + automatic alerts.
- **Platform Stability Triangle**: Autonomous monitoring of creator-freedom / AI-automation / founder-control balance.
- **Global Compliance Intelligence System (GCIS)**: AI-summarized regulatory updates + country-specific feature flags.
- **Adaptive Policy & Content Governance System**: AI-generated legal/info content with founder approval + version history.
- **Unified Communication & Support System**: Resend-backed email + ticket system + AI reply assistant.
- **Autonomous Operations Stack**: AI-assisted daily ops (moderation, growth, economic, support, compliance, stability) under founder supervision.
- **Social Distribution Hub**: Automated social media publishing with admin config + analytics.
- **Viral BondScore Test System**: Shareable personality tests with AI question generation + social sharing.
- **Inevitable Platform Monitor**: Tracks long-term ecosystem maturity and dependency.
- **Authority Flywheel Monitor**: Tracks knowledge assets, creator activity, organic traffic.
- **Silent SEO Dominance System**: Structured knowledge engine with schema markup + continuous updates.
- **$0 Marketing Engine (Text-First)**: Converts discussions into SEO articles + intelligence summaries + referrals.
- **On-Demand App Development & Bootstrap Survival Mode**: Cash-flow-safe build-after-payment workflow.
- **Point of No Return (PNR) Monitor**: Weighted ecosystem self-sustainability metrics.
- **Founder Minimal Workday Dashboard**: High-level daily ops view + AI-generated summary report.
- **Zero-Support Learning System**: AI learns from resolved tickets to reduce support load + generate KB articles.
- **Growth Autopilot Stack**: Orchestrates content, social distribution, viral loops, email automation with AI optimization.
- **External Agent API**: Public REST API for third-party AI agent registration, auth, and participation.
- **Debate-to-Project Pipeline**: Converts completed debates into structured project blueprints.
- **PDF Generation Engine**: Multi-page downloadable PDFs from project blueprints.
- **Audience Moderation Retention Sweeper**: Daily retention for the `audience_*` audit tables (`audience_messages`, `audience_safety_decisions`, `audience_moderation_commands`, `audience_gateway_events`) via `server/services/audience-retention-service.ts`. Connector rows are never auto-deleted. Admin endpoints under `/api/admin/newsroom/audience/retention/*`. Includes Task #407 archive-restore and Task #421 gateway-event-log persistence. Full detail → [`docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md` §1](docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md).
- **Archive Deletion Alert Snooze (Tasks #474, #562)**: Founders can pause the upcoming-expiry digest and post-cleanup summary for a bounded window (capped at 90 days). Snooze actions are logged to `audience_archive_notifier_snooze_log` for audit. Admin UI: `ArchiveDeletionNotifierCard`. Full detail → [archive §2](docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md).
- **Audit-Email Failure-Alert Snooze History (Task #613)**: Snooze actions on the trail-email and history-email failure alerts are persisted to `audience_audit_email_failure_alert_snoozes` with newest-first listing surfaced in the omni-channel-audience admin UI. Full detail → [archive §3](docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md).
- **Audience Audit-Export Notifier (Tasks #396, #425, #448)**: Sends a founder/security email when someone pulls the omni-channel audience audit trail, with dedup, suppression rules, and a DB-backed history table (`audience_audit_export_notifications`). `server/services/audience-audit-export-notifier.ts`. Full detail → [archive §4](docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md).
- **Omni-Channel Audience Safety Layer**: Cross-platform audience moderation across YouTube / Facebook / X / Telegram / Instagram / TikTok / LinkedIn / Reddit / custom adapters via `AudienceChannelConnector` records. 13-axis deterministic scoring feeds the newsroom MIN-based confidence vector. `commandMode:"simulation_only"` — service never calls a platform API in this phase. UI at `/admin/omni-channel-audience`. Full detail → [archive §5](docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md).
- **Neural Newsroom Automation + Broadcast-Grade Virtual Screen Director**: 24/7 AI newsroom orchestration + safety layer. ApexLoad Optimizer + PreCognition Planner + FlowState Conductor + Neural Newsroom Bus. Every directorial action becomes a `ScreenTakePlan` validated against 17 deterministic checks; fails closed to a safe preset. Confidence vector uses MIN (not average). All rows `draft` + `admin_only_internal`. Admin routes under `/api/admin/neural-newsroom/*`. Full detail → [archive §6](docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md) and `docs/reports/NEURAL_NEWSROOM_AUTOMATION_AND_SCREEN_DIRECTOR_REPORT.md`.
- **Production-House 3D Asset Library (R5C / R5D–R5K)**: Admin-only DB-backed catalog of GLB/GLTF assets stored in `PRIVATE_OBJECT_DIR/production-assets/<uuid>.(glb|gltf)`. Lifecycle: `uploaded → validated → license_reviewed → safety_reviewed → approved_internal` (terminal — `approved_public` is reserved for a later phase and does not appear in code). Deterministic local validator (`server/services/gltf-validator.ts`, 10 failure reasons, caps ≤25 MB / ≤200 nodes / ≤200 meshes / ≤2000 accessors / ≤2000 bufferViews), private-only object-storage wrapper (`server/services/production-asset-storage.ts`, refuses any write under `PUBLIC_OBJECT_SEARCH_PATHS`), and admin REST surface (`server/routes/admin/production-assets.ts` under `/api/admin/production-assets/*`, `requireRootAdmin` on every endpoint). `publicUrl` is always `null` (Drizzle default + CHECK constraint + route serializer). Signed preview URLs are ephemeral (TTL clamped to ≤900s) and never persisted — the audit log records `{adminUserId, ttlSeconds, expiresAt}` only, never the URL. Admin pages under `/admin/3d-assets/{,upload,:id,:id/safety-review}` plus a `Load approved internal asset` toggle on `/admin/r3f-preview-sandbox`. R5K verification report → [`docs/reports/R3F_REAL_3D_ASSET_LIBRARY_R5C_REPORT.md`](docs/reports/R3F_REAL_3D_ASSET_LIBRARY_R5C_REPORT.md).
- **Automated AI News Ingestion System**: RSS pipeline fetching 10+ AI-focused sources (OpenAI, DeepMind, MIT Tech Review, VentureBeat, TechCrunch, The Verge, HuggingFace, NVIDIA, Stanford HAI, arXiv AI) via `config/rssFeeds.json`. `rss-parser`, URL/title-hash dedup, OpenAI 2-sentence summaries, category + impact classification, 30-minute cadence in `server/services/newsService.ts`. Frontend: `/ai-news-updates`.

### Database
PostgreSQL primary store, managed with Drizzle ORM and `drizzle-kit`.

## External Dependencies

### Database
- PostgreSQL
- Drizzle ORM

### Frontend Libraries
- @tanstack/react-query
- wouter
- recharts
- shadcn/ui
- Radix UI

### APIs/Services
- Resend API (email)
- OpenAI GPT-5.5 (primary AI model for debates, discussions, orchestrator cycles, news summarization, content generation)
- AI model config centralized in `server/config/ai-models.ts`

### Build Tools
- Vite (frontend)
- esbuild (server bundling)
- tsx (TypeScript dev execution)

---

## Documentation index

- Architecture / system flowcharts: [`docs/reports/MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md`](docs/reports/MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md)
- News/Podcast/Video/Production admin consolidation series (T1–T5):
  - [`docs/reports/NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md`](docs/reports/NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md) (T1)
  - [`docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md`](docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md) (T2)
  - [`docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md`](docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md) (T3)
  - [`docs/reports/NEWS_PODCAST_VIDEO_ADMIN_T4_UX_POLISH_REPORT.md`](docs/reports/NEWS_PODCAST_VIDEO_ADMIN_T4_UX_POLISH_REPORT.md) (T4)
  - [`docs/reports/NEWS_PODCAST_VIDEO_ADMIN_T5_SMOKE_E2E_REPORT.md`](docs/reports/NEWS_PODCAST_VIDEO_ADMIN_T5_SMOKE_E2E_REPORT.md) (T5)
- Newsroom automation report: [`docs/reports/NEURAL_NEWSROOM_AUTOMATION_AND_SCREEN_DIRECTOR_REPORT.md`](docs/reports/NEURAL_NEWSROOM_AUTOMATION_AND_SCREEN_DIRECTOR_REPORT.md)
- R10 — 3D/4D/R3F safety + performance E2E suite: [`docs/reports/R10_R3F_3D_4D_E2E_SAFETY_PERFORMANCE_REPORT.md`](docs/reports/R10_R3F_3D_4D_E2E_SAFETY_PERFORMANCE_REPORT.md) (36/36 invariants pass: 25 static + 11 runtime · perf-budget PASS · Playwright spec adds browser-level network tap + per-surface first-load budget)
- Pre-H2 verbose task history (audience moderation / archive snooze / audit-export / omni-channel / neural newsroom): [`docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md`](docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md)
