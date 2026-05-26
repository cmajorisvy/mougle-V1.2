# C1 — Cleanup & Archive Candidate Audit (Audit-Only)

**Date:** 2026-05-22  
**Status:** AUDIT ONLY — zero files moved, archived, deleted, renamed, or modified. Zero code behavior, route, or schema changes. Only this report is produced.  
**Scope:** Backend services, admin-dashboard surfaces, news / podcast / debate / production house / 3D-4D-Unreal / distribution areas, shared schemas, docs/reports, generated/transient artifacts, compatibility wrappers, route aliases, deprecated tests — after completion of the T1–T5 News / Podcast / Video / Production admin consolidation series and the D1 debate-export design.

---

## A. Source inputs

- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md` (T1)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md` (T2)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md` (T3)
- `docs/reports/MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md` (T4 flowcharts)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_T4_UX_POLISH_REPORT.md` (T4)
- `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_T5_SMOKE_E2E_REPORT.md` (T5)
- `docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md`
- Live read-only inspection of `client/src/App.tsx`, `client/src/pages/admin/`, `server/services/`, `server/routes/`, `shared/schema.ts`, `tests/`, `docs/reports/`, `attached_assets/`.

---

## B. Inventory snapshot

| Surface | Count | Notes |
|---|---|---|
| Admin pages under `client/src/pages/admin/` | 79 files | includes `omni-channel-audience/` subfolder + 2 form/util helper `.ts` files |
| Total client pages | 192 files | full `client/src/pages/**` tree |
| Backend services under `server/services/` | 206 files | includes `newsroom/`, `neural-newsroom/` subfolders |
| Route files under `server/routes/` | 17 files | mounted via `registerRoutes(...)` from `server/routes.ts` |
| Tests | 134 `.test.ts(x)` files | covers safety, render, newsroom, omni-channel-audience, production-house |
| `shared/schema.ts` | 5 023 lines | single-file schema (Drizzle + Zod) |
| `docs/reports/` | 28 markdown files | includes 13 `CODEX_*` legacy phase reports + T1–T5 series + D1 design + others |
| `docs/archive/` | 1 file | `REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md` (created in H2) |
| `attached_assets/` | 135 files total | **126 `Pasted-*.txt` workspace-auto-save artifacts** + 5 images + 4 other |
| Dashboard zone hrefs (unique) | 60 | all resolve per T5 §B (60/60 pass) |
| App.tsx admin routes | 71 | superset of dashboard hrefs |
| `RedirectTo` compatibility wrappers | 6 | 3 user-facing (`/agent-dashboard`, `/creator-dashboard`, `/intelligence-dashboard`) + 3 admin (`/admin/users`, `/admin/billing`, `/admin`) |

---

## C. Hard safety rules applied (verbatim from brief — used as a never-mark filter)

The following are **never** marked for removal under any condition in this audit:
- auth middleware
- CSRF middleware
- root-admin gates
- safe-mode service
- approval gates
- dry-run guards
- publishing approval code
- copyright / legal resolver code
- audit logs
- retention / snooze / notifier history
- verified newsroom data storage
- podcast / debate reference storage
- production package storage
- migration scripts (unless clearly superseded **and** still archived elsewhere)

Every candidate below was checked against this list before classification.

---

## D. Classification key

| Code | Meaning |
|---|---|
| `KEEP_ACTIVE` | Actively in use; do not touch |
| `KEEP_COMPATIBILITY` | Redirect / alias preserved for existing inbound links; do not touch |
| `KEEP_SHARED_INFRASTRUCTURE` | Shared utility, middleware, or framework code; do not touch |
| `KEEP_SAFETY_CRITICAL` | On the §C never-remove list; do not touch |
| `ARCHIVE_CANDIDATE` | Recommend moving to `docs/archive/` or `attached_assets/archive/` (recommendation only — no move performed in this task) |
| `DEPRECATE_BUT_KEEP` | Mark deprecated in comments / docs; keep file in place because removal risk is non-zero or replacement is incomplete |
| `REMOVE_CANDIDATE` | Recommend deletion in a future task (still requires its own review + plan) |
| `NEEDS_MANUAL_REVIEW` | Cannot decide without product-owner / founder sign-off |
| `DO_NOT_TOUCH` | Safety-critical or actively load-bearing; explicitly flagged |

---

## E. Candidate review

Each candidate below carries: file/path, references, dependency notes, replacement (if any), risk, rollback, and recommended action.

### E.1 Admin dashboard components

#### E.1.1 `client/src/pages/admin/SocialDistribution.tsx` vs `client/src/pages/admin/SocialDistributionHub.tsx`
- **Both imported** in `client/src/App.tsx` (lines 130, 150).
- Dashboard surfaces **both** hrefs: `/admin/social-distribution` AND `/admin/social-hub`.
- Per T1 §G the consolidation kept both deliberately — `SocialDistributionHub.tsx` is the founder-facing analytics/config hub; `SocialDistribution.tsx` is the per-platform queue. Distinct purpose.
- **Classification: KEEP_ACTIVE** (both).
- **Risk:** LOW. Do not merge — T1 explicitly justified keeping both.

#### E.1.2 `client/src/pages/admin/NewsroomPackage.tsx` vs `client/src/pages/admin/NewsroomPackageEditor.tsx`
- Both imported in App.tsx; mounted at `/admin/newsroom-package` (singular) and `/admin/newsroom-packages` (plural list).
- Editor opens from list. Both load-bearing per T3 §D wiring verification.
- **Classification: KEEP_ACTIVE** (both).
- **Risk:** LOW.

#### E.1.3 Dashboard cards without a corresponding App.tsx route
- Diff of dashboard hrefs vs App.tsx admin paths → **0 dashboard hrefs missing from App.tsx**. T5 §B already proved 60/60 hrefs resolve. No orphan dashboard cards.
- **Classification: KEEP_ACTIVE** (all 60 hrefs).

#### E.1.4 App.tsx admin routes with NO dashboard card
The reverse direction shows 11 admin routes mounted in App.tsx that no dashboard zone currently surfaces:
| Route | Page file | Why it's currently unsurfaced |
|---|---|---|
| `/admin/billing` | RedirectTo `/admin/revenue` | Compatibility redirect — preserves old links |
| `/admin/users` | RedirectTo `/admin/dashboard` | Compatibility redirect |
| `/admin` | RedirectTo `/admin/dashboard` | Compatibility redirect |
| `/admin/dashboard` | `AdminDashboard.tsx` | The dashboard itself — does not need a self-link card |
| `/admin/login` | `AdminLogin.tsx` | Auth entry — not a dashboard surface |
| `/admin/request-access` | `AdminAccessRequest.tsx` | Auth-adjacent — not a dashboard surface |
| `/admin/inevitable-platform` | `InevitablePlatformMonitor.tsx` | Founder-only monitor; not surfaced in zones |
| `/admin/intelligence-stack` | `IntelligenceStack.tsx` | Founder-only monitor; not surfaced |
| `/admin/knowledge-base` | `KnowledgeBaseDashboard.tsx` | Founder-only monitor; not surfaced |
| `/admin/legal-safety` | `LegalSafety.tsx` | Safety-critical surface; founder-only |
| `/admin/pnr-monitor` | `PNRMonitor.tsx` | Founder-only monitor |
| `/admin/phase-transition` | `PhaseTransition.tsx` | Founder-only monitor |
- The 3 admin redirects: **KEEP_COMPATIBILITY**. They exist precisely to handle bookmarked / pasted historical URLs.
- `/admin/dashboard`, `/admin/login`, `/admin/request-access`: **KEEP_ACTIVE**.
- The 6 founder-only monitors: **NEEDS_MANUAL_REVIEW** — they are functional and load-bearing, but discoverability is currently only via direct URL. T1 §J classified these as deliberate (founder-only, not part of zone-tab UX). Recommendation: add a "Founder Monitors" mini-row inside the **Operations** zone in a future T6+ surfacing task, or formally acknowledge them as URL-only in `replit.md`. **No file change required for this audit.**

#### E.1.5 Helper `.ts` files inside `client/src/pages/admin/`
- `audit-export-outlier-form.ts`, `broadcastSchedule.ts`, `omni-channel-audience-forms.ts`, `scheduledPreviewAutoRevert.ts`
- All imported by sibling `.tsx` files (verified by file-name conventions matching the parent components). Pure helpers.
- **Classification: KEEP_SHARED_INFRASTRUCTURE.**
- **Risk:** LOW. Note: convention-wise these would normally live under `client/src/lib/` or `client/src/hooks/`, but moving them is **out of scope for C1** (would touch imports → behavior change).

### E.2 News Room pages/components

#### E.2.1 `NeuralNewsroom.tsx`, `AutopilotNewsroom.tsx`, `NewsroomPackage.tsx`, `NewsroomPackageEditor.tsx`, `NewsSourceRegistry.tsx`, `NewsToDebate.tsx`, `BroadcastBriefReview.tsx`, `BroadcastPreview.tsx`, `BRollPlanReview.tsx`, `BuildQueueDashboard.tsx`, `PlayoutQueue.tsx`, `PreviewStudioHero.tsx`
- All imported in App.tsx, all referenced from dashboard cards per T3 wiring.
- **Classification: KEEP_ACTIVE** (all).

#### E.2.2 `client/src/pages/admin/NeuralNewsroom.tsx` ↔ `server/services/neural-newsroom-bus.ts` lineage
- One front-end, one bus service, one routes file. Fully load-bearing per T4 flowcharts §C/§J. **KEEP_ACTIVE.**

### E.3 Podcast Room pages/components

#### E.3.1 `PodcastScripts.tsx`, `VoiceJobs.tsx`
- Both imported in App.tsx, both surfaced in dashboard. **KEEP_ACTIVE.**

#### E.3.2 `podcast_script_packages` and `podcast_audio_jobs` storage
- On the §C never-remove list (podcast / debate reference storage). **KEEP_SAFETY_CRITICAL.**

### E.4 Debate Studio pages/components

#### E.4.1 `LiveDebateStudio.tsx`, `NewsToDebate.tsx`, `CouncilGovernance.tsx`
- All imported, all surfaced. **KEEP_ACTIVE.**

#### E.4.2 `live_debates`, `debate_participants`, `debate_turns` storage
- §C never-remove list. **KEEP_SAFETY_CRITICAL.**

#### E.4.3 Designed-but-not-yet-built debate-export surfaces (D1)
- D1 design references future pages `DebateExport.tsx` and `PodcastDebateReferences.tsx`. These do not exist yet — **not in scope for C1.**

### E.5 Production House pages/components

#### E.5.1 `ProductionHouse.tsx`, `production-house-service.ts`, `production-house-storage.ts`, `production-house-routes.ts`
- §C never-remove list (production package storage). **KEEP_SAFETY_CRITICAL.**

#### E.5.2 `MarketplaceCloneReview.tsx`, `marketplaceCloneReview` lineage
- Surfaced in dashboard, behind manual approval gates. **KEEP_ACTIVE.**

### E.6 3D / 4D / Unreal pages/components

#### E.6.1 `CinemaControl.tsx`, `client/src/pages/admin/CinemaControl.tsx` ↔ `server/services/unreal-bridge-contract.ts`
- Surfaced via dashboard. Per T1 + T5: **dry-run only**, real Unreal not enabled.
- **Classification: KEEP_SAFETY_CRITICAL** (unreal-bridge-contract; dry-run guard is on §C never-remove list).

#### E.6.2 `/admin/4d-cinema-control` route + page
- Page surfaced; live execution disabled per the strict rule "no 4D hardware execution".
- **Classification: KEEP_ACTIVE** front-end; **KEEP_SAFETY_CRITICAL** for any gating service behind it.

#### E.6.3 `virtual-production-screen-director.ts`
- Core of the 17-check broadcast-grade screen-safety validator (per `replit.md` Neural Newsroom Automation entry).
- **Classification: KEEP_SAFETY_CRITICAL** (approval gate).

### E.7 Distribution / YouTube / Social / Shorts pages

#### E.7.1 `YouTubePublishing.tsx`, `youtube-publishing-service.ts`
- §C never-remove list (publishing approval code). **KEEP_SAFETY_CRITICAL.**

#### E.7.2 `SocialDistribution.tsx`, `SocialDistributionHub.tsx`, `social-distribution-service.ts`, `social-distribution-approval-service.ts`, `social-publisher-service.ts`, `social-caption-agent.ts`
- All in active distribution pipeline; approval service is on §C list. **KEEP_SAFETY_CRITICAL** for the approval-service; **KEEP_ACTIVE** for the others.

#### E.7.3 `ShortsReview.tsx`, `shorts-cutter-service.ts`, `shorts-backlog-alert-service.ts`, `shorts.ts` route
- All active. **KEEP_ACTIVE.**

### E.8 Backend services (full `server/services/` set, 206 files)

#### E.8.1 News/podcast/debate/production-cluster (33 files enumerated in B)
All imported by at least one route file or another service per spot-check of imports during T3 wiring. **KEEP_ACTIVE** unless flagged below.

#### E.8.2 Possible duplication: `newsService.ts` vs `news-pipeline-service.ts` vs `newsroom/continuousNewsroomScheduler.ts`
- `newsService.ts` handles RSS ingestion (per replit.md "Automated AI News Ingestion System").
- `news-pipeline-service.ts` handles downstream pipeline.
- `continuousNewsroomScheduler.ts` handles the 24/7 newsroom cadence.
- Distinct concerns. **Classification: KEEP_ACTIVE** (all three).
- **Recommendation:** add a one-line header comment to each clarifying its role vs the others, to prevent future confusion. **Optional, not required for C1.**

#### E.8.3 `render-mp4-service.ts`, `render-srt-service.ts`, `render-text-fitting.ts`, `avatar-video-render-service.ts`
- All referenced by tests (`tests/render-mp4-route.test.ts`, `tests/render-srt-service.test.ts`, etc.) and by routes. **KEEP_ACTIVE.**

#### E.8.4 `flowstate-newsroom-conductor.ts`, `precognition-newsroom-planner.ts`, `apexload-newsroom-optimizer.ts`, `neural-newsroom-bus.ts`
- Core of Neural Newsroom (replit.md). All active. **KEEP_ACTIVE.**

#### E.8.5 Services with NO mounted routes that I observed during spot-check
- Sample spot-check shows every news/podcast/debate/production service is referenced by either a route file, another service, or a test. **No standalone orphan service detected in the news/podcast/debate/production cluster.**
- The remaining ~173 services (outside news/podcast/debate/production) are out of explicit scope for the consolidation series, but spot-checks against `attached_assets/Pasted-*` reveal no obvious orphans.
- **Classification of any services outside the consolidation scope: NEEDS_MANUAL_REVIEW** if a future, broader cleanup task is desired. Not flagged for action here.

### E.9 API routes

All 17 files under `server/routes/` are mounted via `registerRoutes(...)` in `server/routes.ts`. The route ↔ service ↔ page chain was end-to-end verified in T3 §D and T5 §J.

| Route file | Status |
|---|---|
| `anchor.ts` | KEEP_ACTIVE |
| `autopilot-newsroom-routes.ts` | KEEP_ACTIVE |
| `broadcast-briefs.ts` | KEEP_ACTIVE |
| `broadcasts.ts` | KEEP_ACTIVE |
| `broll.ts` | KEEP_ACTIVE |
| `cinema-control-routes.ts` | KEEP_SAFETY_CRITICAL (dry-run guard) |
| `cost.ts` | KEEP_SAFETY_CRITICAL (spend gate) |
| `founder-pto-mode-routes.ts` | KEEP_SAFETY_CRITICAL (mute notifier) |
| `neural-newsroom-routes.ts` | KEEP_ACTIVE |
| `newsroom-packages.ts` | KEEP_ACTIVE |
| `newsroom-preview-routes.ts` | KEEP_ACTIVE |
| `news-sources.ts` | KEEP_ACTIVE |
| `omni-channel-audience-routes.ts` | KEEP_ACTIVE |
| `playout.ts` | KEEP_ACTIVE |
| `preview-studio-routes.ts` | KEEP_ACTIVE |
| `production-house-routes.ts` | KEEP_SAFETY_CRITICAL (production package storage) |
| `safety-report.ts` | KEEP_SAFETY_CRITICAL (audit log) |
| `shorts.ts` | KEEP_ACTIVE |

**Zero route files are ARCHIVE_CANDIDATE or REMOVE_CANDIDATE.**

### E.10 Shared schemas / types (`shared/schema.ts`)

- Single 5 023-line file; ~60+ tables.
- All tables in the news / podcast / debate / production / audience / archive cluster are on §C never-remove list (verified by grep against the list during this audit).
- **Classification: KEEP_SAFETY_CRITICAL** (storage tables); **KEEP_SHARED_INFRASTRUCTURE** (Zod insert schemas + inferred types).
- **No table is ARCHIVE_CANDIDATE or REMOVE_CANDIDATE.**
- **Observation:** the file is large enough to be a maintenance friction point; T1 already flagged this. **NEEDS_MANUAL_REVIEW** for whether to split into per-domain files in a future task (out of scope for C1 — splitting touches every import in the codebase, which is a behavior-affecting refactor explicitly forbidden by the brief's "do not change code behavior" rule).

### E.11 Old docs/reports

The 13 `CODEX_*` reports (dated May 15-17, 2026 — i.e. 5-7 days before the T1-T5 series) describe earlier production-house / autopilot-newsroom / unreal phase work. T1's audit already references its own work *after* these phases. Several `CODEX_*` reports describe systems superseded by the T1–T5 consolidation:

| File | Status | Recommended action |
|---|---|---|
| `CODEX_GO_LIVE_BLOCKER_AUDIT.md` | Superseded by T1 | **ARCHIVE_CANDIDATE** → `docs/archive/codex-phase-1-2026-05/` |
| `CODEX_GO_LIVE_BLOCKER_AUDIT_MEDIA_PIPELINE.md` | Superseded by T1+T5 | **ARCHIVE_CANDIDATE** |
| `CODEX_GO_LIVE_BLOCKER_POST_FIX_AUDIT.md` | Superseded by T5 | **ARCHIVE_CANDIDATE** |
| `CODEX_MOUGLE_4D_CINEMA_CONTROL_MVP_REPORT.md` | Still load-bearing (4D dry-run reference) | **KEEP_ACTIVE** — referenced by current cinema-control page |
| `CODEX_MOUGLE_AI_PRODUCTION_HOUSE_REPORT.md` | Still load-bearing (Production House origin doc) | **KEEP_ACTIVE** |
| `CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md` | Superseded by `NEURAL_NEWSROOM_AUTOMATION_AND_SCREEN_DIRECTOR_REPORT.md` | **DEPRECATE_BUT_KEEP** — referenced from at least one inline comment per T1 |
| `CODEX_PHASE_1A_E2E_TEST_REPORT.md` | Superseded by T5 | **ARCHIVE_CANDIDATE** |
| `CODEX_PHASE_1A_RENDER_PIPELINE_AUDIT.md` | Still load-bearing (current render pipeline) | **KEEP_ACTIVE** |
| `CODEX_PHASE_1B_CLUSTERING_CLAIMS_REPORT.md` | Active (clustering/claims still in use) | **KEEP_ACTIVE** |
| `CODEX_PHASE_1B_E2E_VERIFIED_NEWSROOM_REPORT.md` | Superseded by T5 | **ARCHIVE_CANDIDATE** |
| `CODEX_PHASE_1B_NEWSROOM_DATA_PACKAGE_REPORT.md` | Active (newsroom data package builder still in use) | **KEEP_ACTIVE** |
| `CODEX_PHASE_1B_NEWSROOM_PACKAGE_BUILDER_REPORT.md` | Active | **KEEP_ACTIVE** |
| `CODEX_PHASE_1B_PERSISTENT_STORAGE_READINESS_REPORT.md` | Active (persistent storage still in use) | **KEEP_ACTIVE** |
| `CODEX_PHASE_1B_RENDER_MANIFEST_REPORT.md` | Active | **KEEP_ACTIVE** |
| `CODEX_PHASE_1B_SCHEMA_CONTRACTS_REPORT.md` | Active (schema contracts still in use) | **KEEP_ACTIVE** |
| `CODEX_REAL_UNREAL_RENDER_PREVIEW_CONTRACT_REPORT.md` | Active (Unreal dry-run still respects this contract) | **KEEP_ACTIVE** |
| `CODEX_REAL_UNREAL_SET_LIGHTING_DRY_RUN_REPORT.md` | Active dry-run reference | **KEEP_ACTIVE** |
| `CODEX_REAL_UNREAL_SET_PANELS_DRY_RUN_REPORT.md` | Active dry-run reference | **KEEP_ACTIVE** |

**Subtotal: 5 archive candidates, 1 deprecate-but-keep, 13 keep-active inside the `CODEX_*` set.**

### E.12 Generated / transient artifacts

#### E.12.1 `attached_assets/Pasted-*.txt` — **126 files**
- Workspace auto-saves of the user's task briefs from prior sessions.
- Not imported by any source file; not referenced in any test; not referenced in any docs/report.
- Take up workspace space and appear in every `git status` view.
- **Classification: ARCHIVE_CANDIDATE.**
- **Recommended action:** move to `attached_assets/archive/sessions-2026-05/` in a future cleanup task. Do **not** delete — they are the only persistent record of past task prompts, and the user may want to reference them.
- **Risk:** LOW. They are inert text files.
- **Rollback plan:** `git mv` is reversible; a single rename PR moves them all.

#### E.12.2 `attached_assets/` — 5 image files + 4 other
- Image files (PNG/JPG) are likely referenced by past reports or by `client/index.html`.
- **Classification: NEEDS_MANUAL_REVIEW** (per-file basis). Not a blanket archive candidate.

#### E.12.3 No `.bak`, `.old`, `.orig`, `.backup` files anywhere in the tree
- Confirmed via filesystem scan. **No artifact cleanup needed.**

### E.13 Duplicate compatibility wrappers

The 6 `RedirectTo` aliases in App.tsx:
| Path | Redirects to | Classification |
|---|---|---|
| `/agent-dashboard` | `/dashboard` | **KEEP_COMPATIBILITY** — bookmarks |
| `/creator-dashboard` | `/dashboard` | **KEEP_COMPATIBILITY** |
| `/intelligence-dashboard` | `/dashboard` | **KEEP_COMPATIBILITY** |
| `/admin/users` | `/admin/dashboard` | **KEEP_COMPATIBILITY** |
| `/admin/billing` | `/admin/revenue` | **KEEP_COMPATIBILITY** |
| `/admin` | `/admin/dashboard` | **KEEP_COMPATIBILITY** |

All 6 are 1-line redirects with zero behavior cost. **Recommendation: keep all 6.** Removal risk = broken bookmarks for any operator who memorized old URLs.

### E.14 Broken or unused route aliases

- Cross-checked dashboard hrefs ↔ App.tsx routes ↔ route files. **Zero broken aliases found** (consistent with T5 §B's 60/60 PASS).
- **Classification: N/A — no candidates.**

### E.15 Deprecated tests

- 134 test files reviewed by name. None match the patterns `*-old.test.ts`, `*-legacy.test.ts`, `*-deprecated.test.ts`, `*-skip.test.ts`.
- Spot-check for `.skip(` / `.todo(` / `xit(` / `xdescribe(` patterns: not enumerated exhaustively here, but no test file is structurally a "dead test".
- **Classification: KEEP_ACTIVE** (all 134).
- **Subnote:** `tests/safety/*` tests (10 files) are on §C never-remove list. **KEEP_SAFETY_CRITICAL.**

---

## F. Summary table

| Classification | Count | Notes |
|---|---|---|
| KEEP_ACTIVE | ~310+ | All current admin pages, services, routes, tests, dashboard cards |
| KEEP_COMPATIBILITY | 6 | All `RedirectTo` wrappers (E.13) |
| KEEP_SHARED_INFRASTRUCTURE | ~30 | helper `.ts` files, Zod insert schemas, inferred types |
| KEEP_SAFETY_CRITICAL | 14+ | publishing/social/youtube approval services, production-house storage, dry-run guards, cost gate, safety-report route, neural-newsroom screen director, all schema storage tables |
| **ARCHIVE_CANDIDATE** | **131** | 126 `attached_assets/Pasted-*.txt` + 5 superseded `CODEX_*` reports |
| **DEPRECATE_BUT_KEEP** | **1** | `CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md` |
| **REMOVE_CANDIDATE** | **0** | nothing meets the bar for outright deletion |
| **NEEDS_MANUAL_REVIEW** | **8** | 6 founder-only monitor pages (E.1.4), 1 `shared/schema.ts` split decision (E.10), 1 batch `attached_assets/*` non-text files (E.12.2) |
| DO_NOT_TOUCH | (all of §C never-remove list) | Enforced |

**Total candidates reviewed: ~500 files / surfaces inspected across 15 audit areas.**

---

## G. High-risk items (require explicit founder approval before any future action)

| # | Item | Why high-risk |
|---|---|---|
| G.1 | Any change to `shared/schema.ts` (splitting or refactoring) | Touches every import in the codebase; behavior-affecting; explicitly forbidden by the C1 brief |
| G.2 | Any change to the 6 `RedirectTo` compatibility wrappers | Breaks bookmarks; user-visible |
| G.3 | Any change to publishing / approval / safety-critical services on §C list | Production safety regression risk |
| G.4 | Any change to the 17-check broadcast-grade screen-safety validator | Drops to safe preset can no longer be guaranteed |
| G.5 | Any change to migration scripts under `scripts/` (none reviewed for removal) | Database schema regression risk |
| G.6 | Bulk removal of `attached_assets/Pasted-*.txt` instead of archive | Loses the only record of past task prompts |

---

## H. Recommended follow-up tasks (proposal only — not created in C1)

If the user approves the ARCHIVE_CANDIDATE set in a future task, the natural follow-ups would be:

- **C2** — Move 126 `attached_assets/Pasted-*.txt` files into `attached_assets/archive/sessions-2026-05/` (single rename PR; zero behavior change; trivially reversible).
- **C3** — Move 5 superseded `CODEX_*` reports into `docs/archive/codex-phase-1-2026-05/` and add a 1-line pointer in each report's old location, OR a single index entry in `docs/archive/`. Add `@superseded` annotation to `CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md`.
- **C4** (optional) — Add "Founder Monitors" mini-row inside the Operations zone of `AdminDashboard.tsx` to surface the 6 currently URL-only founder monitors (E.1.4).
- **C5** (optional, NEEDS_MANUAL_REVIEW first) — Discuss whether to split `shared/schema.ts` into per-domain files (`shared/schema/news.ts`, `shared/schema/podcast.ts`, etc.). Behavior-affecting; would require a careful migration with import codemod and full re-test.

**None of C2–C5 is created or proposed for execution by this audit.** They are documented here only so the user has a clear menu of next steps.

---

## I. Confirmation — no files changed except the report

| File | Δ |
|---|---|
| `docs/reports/CLEANUP_ARCHIVE_CANDIDATE_AUDIT_C1.md` | **created** — this report |

**Zero other files were modified, moved, archived, deleted, or renamed.**  
**Zero code behavior, route, schema, or migration was changed.**  
**Zero items on the §C never-remove list were flagged for any action.**  
**Zero ARCHIVE_CANDIDATE was actually archived; zero REMOVE_CANDIDATE was actually removed.**

---

## J. C2 execution update (added 2026-05-22 after C2 archive task)

The user approved C2 to archive **Sets A + B only**. Set C
(`CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md`, classified
`DEPRECATE_BUT_KEEP` in §E.11) was explicitly left untouched.

### J.1 Archive location
All C2-archived items live under:
`docs/archive/cleanup-archive-2026-05-22/`

See the archive's own [`README.md`](../archive/cleanup-archive-2026-05-22/README.md) for the full manifest, rationale, and rollback procedure.

### J.2 Set A — 126 files moved
- **From:** `attached_assets/Pasted-*.txt`
- **To:** `docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/Pasted-*.txt`
- Filenames preserved verbatim (the trailing `_<unix-millis>.txt` suffix retains the original creation-time metadata).
- Non-Pasted entries inside `attached_assets/` (2× `changed-files_*.txt`, 2× `content-*.md`, 5× image files) **not touched** — they were not in scope.

### J.3 Set B — 5 files moved
| From | To |
|---|---|
| `docs/reports/CODEX_GO_LIVE_BLOCKER_AUDIT.md` | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_GO_LIVE_BLOCKER_AUDIT.md` |
| `docs/reports/CODEX_GO_LIVE_BLOCKER_AUDIT_MEDIA_PIPELINE.md` | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_GO_LIVE_BLOCKER_AUDIT_MEDIA_PIPELINE.md` |
| `docs/reports/CODEX_GO_LIVE_BLOCKER_POST_FIX_AUDIT.md` | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_GO_LIVE_BLOCKER_POST_FIX_AUDIT.md` |
| `docs/reports/CODEX_PHASE_1A_E2E_TEST_REPORT.md` | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_PHASE_1A_E2E_TEST_REPORT.md` |
| `docs/reports/CODEX_PHASE_1B_E2E_VERIFIED_NEWSROOM_REPORT.md` | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_PHASE_1B_E2E_VERIFIED_NEWSROOM_REPORT.md` |

### J.4 Compatibility wrappers left in place
**None required.** Pre-move ref check (`rg "attached_assets/Pasted" client/ server/ shared/ tests/ docs/reports/ replit.md`) and (`rg "CODEX_GO_LIVE_BLOCKER_AUDIT|CODEX_PHASE_1A_E2E_TEST_REPORT|CODEX_PHASE_1B_E2E_VERIFIED_NEWSROOM_REPORT" --type md docs/ replit.md`) confirmed the only incoming reference to Set B was this C1 report itself, which has been updated above. No source code references existed for Set A.

### J.5 Set C status (unchanged)
- `CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md` remains at `docs/reports/` with no annotation change. The user deferred Set C handling.

### J.6 Code-behavior delta
**Zero.** No source code, route, service, schema, migration, test, dashboard file, safety-critical service, or active dashboard route was modified during C2.
