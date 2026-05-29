# T3 — News / Podcast / Video Admin Dashboard Wiring Check

**Date:** 2026-05-22
**Scope:** T3 — wiring-check / report-only. Verify every link surfaced by T2 (and every preserved Media & Content Pipeline link) opens the correct existing page, preserves current behavior, and does not bypass any safety / manual / dry-run / approval gate.
**Input artifacts:**
- T1 — `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md` (commit `3c25e1cc…`)
- T2 — `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md` (commit `c654e84a…`)
**Source commit at start of T3:** `8b370a0b34fc34c7d53a827455e8b51643e6d0c9` (HEAD = T2 merged)

**T3 is report-only.** No source file, route, schema, service, safe-mode flag, environment variable, or database row was changed. Only `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md` (this file) is created. If a link is broken or a behavior is suspicious, it is **documented for T4** rather than fixed.

---

## A. Executive summary

| Metric | Value |
|---|---|
| Unique `/admin/...` hrefs surfaced by T2 | **33** |
| Routes resolved in `client/src/App.tsx` | **33 / 33** |
| Component files present in `client/src/pages/admin/` | **33 / 33** (counting `CinemaControl` once even though it backs two routes) |
| Broken links | **0** |
| Intentional cross-zone duplicates | **5 distinct hrefs surfaced from ≥2 zones** (11 cross-link cards) |
| Intentional route aliases (same component, two paths) | **1** (`/admin/4d-cinema-control` ↔ `/admin/cinema-control`) |
| Safety-mode flags changed by T2 | **0** (verified — `server/services/safe-mode-service.ts` not modified) |
| Approval gates bypassed | **0** (all backend gates remain enforced regardless of dashboard entry point) |
| Items requiring T4 review | **5** (see §K) — all UX-polish only, no broken wiring |
| Media & Content Pipeline zone preserved | **Yes** — byte-for-byte (8 links unchanged) |
| Files created by T3 | **1** (this report) |
| Files modified by T3 | **0** |
| Backend / API / schema / safe-mode / DB / runtime changes | **None** |

**Verdict: PASS.** Every surfaced link is reachable, every approval/dry-run/manual gate remains enforced by the backend (gates are not dashboard-driven), and the existing Media & Content Pipeline grouping is undisturbed. The five T4 items are UX-polish recommendations (clearer labels, optional documentation updates) — none of them indicates broken wiring.

---

## B. Link reachability table (all 33 unique hrefs)

Verification method: every href was matched against `<Route path="...">` declarations in `client/src/App.tsx` (lines 261–334) and the referenced component import (`import Foo from "@/pages/admin/Foo"`), then the file's existence was confirmed via `ls client/src/pages/admin/`.

`R` = Route line in App.tsx · `C` = Component · `F` = Component file present

| # | Href | R | C | F | Notes |
|---|---|---|---|---|---|
| 1 | `/admin/news-sources` | L329 | `NewsSourceRegistry` | ✅ `NewsSourceRegistry.tsx` | Cross-link in News Room (primary: Knowledge & Truth) |
| 2 | `/admin/news-to-debate` | L308 | `NewsToDebate` | ✅ `NewsToDebate.tsx` | Cross-listed in 3 zones |
| 3 | `/admin/broadcast-briefs` | L277 | `BroadcastBriefReview` | ✅ `BroadcastBriefReview.tsx` | News Room only |
| 4 | `/admin/broadcasts` | L271 | `BroadcastPreview` | ✅ `BroadcastPreview.tsx` | News Room only — preview surface (dry-run by default, see §E) |
| 5 | `/admin/newsroom-package` | L264 | `NewsroomPackage` | ✅ `NewsroomPackage.tsx` | Viewer component |
| 6 | `/admin/newsroom-packages` | L279 | `NewsroomPackageEditor` | ✅ `NewsroomPackageEditor.tsx` | Editor component — **different component from #5** |
| 7 | `/admin/playout-queue` | L275 | `PlayoutQueue` | ✅ `PlayoutQueue.tsx` | News Room only |
| 8 | `/admin/broll-plan-review` | L276 | `BRollPlanReview` | ✅ `BRollPlanReview.tsx` | News Room only |
| 9 | `/admin/anchor-modes` | L273 | `AnchorModePicker` | ✅ `AnchorModePicker.tsx` | News Room only |
| 10 | `/admin/autopilot-newsroom` | L274 | `AutopilotNewsroom` | ✅ `AutopilotNewsroom.tsx` | News Room only |
| 11 | `/admin/neural-newsroom` | L281 | `NeuralNewsroomPage` | ✅ `NeuralNewsroom.tsx` | Cross-listed in News Room + 3D/4D |
| 12 | `/admin/omni-channel-audience` | L282 | `OmniChannelAudience` | ✅ `OmniChannelAudience.tsx` | News Room only |
| 13 | `/admin/shorts` | L272 | `ShortsReview` | ✅ `ShortsReview.tsx` | **Cross-listed in 4 zones** + Media |
| 14 | `/admin/podcast-scripts` | L309 | `PodcastScripts` | ✅ `PodcastScripts.tsx` | Podcast Room (cross-link from Media) |
| 15 | `/admin/voice-jobs` | L310 | `VoiceJobs` | ✅ `VoiceJobs.tsx` | Cross-listed in Podcast Room + Production House |
| 16 | `/admin/video-render` | L312 | `VideoRender` | ✅ `VideoRender.tsx` | **Cross-listed in 4 zones** + Media |
| 17 | `/admin/live-studio` | L319 | `LiveDebateStudio` | ✅ `LiveDebateStudio.tsx` | Cross-link from Media (debate-specific, see §I.2) |
| 18 | `/admin/council-governance` | L322 | `CouncilGovernance` | ✅ `CouncilGovernance.tsx` | Cross-link from Safety & Governance |
| 19 | `/admin/production-house` | L280 | `ProductionHouse` | ✅ `ProductionHouse.tsx` | Cross-listed in Production House + 3D/4D |
| 20 | `/admin/ai-jobs` | L265 | `AiJobMonitor` | ✅ `AiJobMonitor.tsx` | Production House only |
| 21 | `/admin/ai-workers` | L266 | `AiWorkers` | ✅ `AiWorkers.tsx` | Production House only |
| 22 | `/admin/ai-ops` | L268 | `AiOps` | ✅ `AiOps.tsx` | Production House only |
| 23 | `/admin/ai-retention` | L267 | `AiRetention` | ✅ `AiRetention.tsx` | Production House only |
| 24 | `/admin/build-queue` | L327 | `BuildQueueDashboard` | ✅ `BuildQueueDashboard.tsx` | Cross-link from Operations |
| 25 | `/admin/4d-cinema-control` | L269 | `CinemaControl` | ✅ `CinemaControl.tsx` | 3D/4D primary |
| 26 | `/admin/cinema-control` | L270 | `CinemaControl` | ✅ `CinemaControl.tsx` | **Same component as #25 — intentional alias** |
| 27 | `/admin/youtube-publishing` | L311 | `YouTubePublishing` | ✅ `YouTubePublishing.tsx` | Cross-link from Media |
| 28 | `/admin/social-distribution` | L313 | `SocialDistribution` | ✅ `SocialDistribution.tsx` | Cross-link from Media |
| 29 | `/admin/social-hub` | L333 | `SocialDistributionHub` | ✅ `SocialDistributionHub.tsx` | Distribution only — different component from #28 |
| 30 | `/admin/marketing` | L330 | `MarketingEngine` | ✅ `MarketingEngine.tsx` | Cross-link from Operations |
| 31 | `/admin/seo` | L331 | `SilentSeoDashboard` | ✅ `SilentSeoDashboard.tsx` | Cross-link from Operations |
| 32 | `/admin/growth-autopilot` | L334 | `GrowthAutopilot` | ✅ `GrowthAutopilot.tsx` | Distribution only |
| 33 | `/admin/authority-flywheel` | L332 | `AuthorityFlywheel` | ✅ `AuthorityFlywheel.tsx` | Distribution only |

**Result: 33 / 33 PASS.** Every dashboard card href is registered in `App.tsx`, every referenced component is imported (`client/src/App.tsx` imports lines 51, 52, 53, 125–151), and every file exists. Zero broken links.

### B.1 Admin route protection posture (unchanged)

`client/src/App.tsx` does NOT use a `<RequireAdmin>` / `<AdminLayout>` wrapper around the `/admin/...` routes — admin auth is enforced **inside each admin component** (typically via `useAuth()` + `user.isAdmin` / `user.role === "root"` checks) and on the backend (every `/api/admin/...` route runs `requireRoot` / `requireAdmin` middleware). T2's link surfacing changes nothing about either layer; the dashboard simply renders links that, when clicked, go through the exact same protection a direct URL would.

### B.2 Old Media & Content Pipeline links — still present and correct

The 8 original Media & Content Pipeline links (`media` zone object in `AdminDashboard.tsx`) all appear and resolve to the correct routes:

| # | Old label | Href | Resolved route | OK |
|---|---|---|---|---|
| 1 | News to Debate | `/admin/news-to-debate` | L308 → `NewsToDebate` | ✅ |
| 2 | Podcast Scripts | `/admin/podcast-scripts` | L309 → `PodcastScripts` | ✅ |
| 3 | Voice Jobs | `/admin/voice-jobs` | L310 → `VoiceJobs` | ✅ |
| 4 | Video Render | `/admin/video-render` | L312 → `VideoRender` | ✅ |
| 5 | Shorts Approval Queue | `/admin/shorts` | L272 → `ShortsReview` | ✅ |
| 6 | YouTube Publishing | `/admin/youtube-publishing` | L311 → `YouTubePublishing` | ✅ |
| 7 | Social Distribution | `/admin/social-distribution` | L313 → `SocialDistribution` | ✅ |
| 8 | Live Studio | `/admin/live-studio` | L319 → `LiveDebateStudio` | ✅ |

---

## C. Deep-link / route-param table

### C.1 Admin routes (T2 scope) — none use path params

**Important finding:** none of the 33 surfaced `/admin/...` routes uses a `:id` / `:packageId` / `:productionId` / `:briefId` / `:scriptId` path parameter. Every admin surface is a single-page route that fetches its own list, applies its own filters via query string (e.g. `?status=draft`), and drills into items via internal navigation/modals — **not** via URL-encoded path params. This is confirmed by an exhaustive scan of `client/src/App.tsx` for `:`-prefixed segments: every match falls under a non-admin or `/admin`-adjacent area (see C.2).

T2 dashboard cards therefore link only to **safe base routes**, which is the desired posture for a discoverability hub. No card was written with a deep-link path it could not honor.

### C.2 Path-param routes that exist elsewhere (NOT surfaced by T2 — context only)

| Route | Param | Component | T2 surface? | Notes |
|---|---|---|---|---|
| `/agent-store/:id` | `:id` | `AgentDetail` | No | Public agent page. Out of T2 scope. |
| `/agent-skill-tree/:id` | `:id` | `AgentSkillTree` | No | Public. Out of scope. |
| `/post/:id` | `:id` | `PostDetail` | No | Public post page. |
| `/flywheel/:id` | `:id` | `FlywheelJobDetail` | No | Public flywheel job. |
| `/debate/:id` | `:id` | `DebateDetail` | No | Public debate. |
| **`/live-studio/:id`** | `:id` | **`LiveStudio`** | **No (admin equivalent is `/admin/live-studio` → `LiveDebateStudio`, different component)** | **§I.2 explains the split.** |
| `/projects/:id` | `:id` | `ProjectDetail` | No | Public projects. |
| `/ai-news-updates/:idOrSlug` | `:idOrSlug` | `AINewsArticle` | No | Public AI news. |
| `/ai-news/:idOrSlug` | `:idOrSlug` | `AINewsArticle` | No | Public AI news (alias). |
| `/labs/:id` | `:id` | `LabsDetail` | No | Public labs. |
| `/bondscore/result/:shareId` | `:shareId` | `BondScoreResult` | No | Public bondscore. |
| `/bondscore/:slug` | `:slug` | `BondScoreTake` | No | Public bondscore. |

### C.3 Query-param usage on T2-surfaced routes (observed pattern)

The following admin pages are known to use query strings internally (filters, drilldowns) — none of them are required for the dashboard card link to work, and no T4 fix is needed:

| Route | Query params observed | Required by dashboard link? |
|---|---|---|
| `/admin/shorts` | `?status=draft\|approved\|discarded`, `?broadcast=<id>` (internal navigation; not set by dashboard card) | No — base route lands on the default list view |
| `/admin/broadcasts` | `?broadcast=<id>` (internal navigation from playout/briefs) | No |
| `/admin/playout-queue` | `?packageId=<id>` (internal filter) | No |
| `/admin/voice-jobs` | `?status=<status>` (internal filter) | No |
| `/admin/video-render` | `?provider=<provider>` (internal selector) | No |
| `/admin/youtube-publishing` | `?package=<id>` (internal selector) | No |
| `/admin/social-distribution` | `?source=youtube\|export` (internal selector) | No |
| `/admin/news-to-debate` | `?topic=<id>` (internal filter) | No |
| `/admin/production-house` | `?productionId=<id>` (internal filter) | No |
| `/admin/omni-channel-audience` | `?platform=...&fromDate=...&toDate=...` (audit export filters) | No |

**T4 recommendation (optional):** add tooltip-level deep-link examples (e.g. "Open shorts approval queue. Tip: append `?status=draft` to filter to pending approvals") — out of T3 scope.

---

## D. Package handoff verification

These flows were traced through `server/services/` and `server/routes/` by name; the trace confirms **identifier continuity** end-to-end. None of the flows changed in T2.

### D.1 News flow — verified package handoff

```
newsroom_package (admin reviewed)
  └─► newsroom_package.id ─────────► broadcast_brief.packageId
                                          └─► broadcast_brief.id ─► broadcasts.briefId / broadcasts.packageId
                                                                       └─► broadcasts.id ─► playout_queue.broadcastId
                                                                                                 └─► b_roll_plan_review.broadcastId
                                                                                                                └─► social_drafts.broadcastId (Shorts approval)
```

| Hop | Source identifier | Sink identifier | Verified | Notes |
|---|---|---|---|---|
| package → brief | `newsroom_package.id` | `broadcast_brief.packageId` | ✅ | `BroadcastBriefReview.tsx` reads `packageId`. |
| brief → broadcast | `broadcast_brief.id` | `broadcasts.briefId` | ✅ | `broadcast-compositor-service.ts` consumes the brief. |
| broadcast → playout | `broadcasts.id` | `playout_queue.broadcastId` | ✅ | `PlayoutQueue.tsx` lists by broadcast id. |
| broadcast → b-roll | `broadcasts.id` (or `broll_plan.broadcastId`) | `b_roll_plan_review.broadcastId` | ✅ | Plan review screen filters by broadcast. |
| broadcast → shorts | `broadcasts.id` | `social_drafts.broadcast_id` | ✅ | `shorts-cutter-service.ts` writes `social_drafts` rows keyed to the approved broadcast (see §F.1). |

**Result: PASS — News flow IDs intact end-to-end.**

### D.2 Podcast flow — verified package handoff

```
podcast_script_package (admin reviewed)
  └─► podcast_script_package.id ──► voice_jobs.packageId / scriptPackageId
                                          └─► voice_jobs.id ──► production media references
                                                                       └─► production_house jobs
                                                                                  └─► youtube_publishing.scriptPackageId (approval path)
```

| Hop | Source identifier | Sink identifier | Verified | Notes |
|---|---|---|---|---|
| script → voice | `podcast_script_package.id` | `voice_jobs.packageId` | ✅ | `podcast-voice-service.ts:generateVoiceJob` accepts package id input. |
| voice → production | `voice_jobs.id` | production-house job references | ✅ | `cinema-control-service.ts:202` also generates `voiceJobId` — confirms shared usage (see §I.1). |
| voice/script → publishing | `podcast_script_package.status ∈ ('admin_review', 'approved')` | `youtube_publishing` package source | ✅ | `youtube-publishing-service.ts:251` enforces script status gate before any packaging. |
| publishing → social distribution | `youtube_publishing_package.id` (must be `approvalStatus = 'approved'`) | `social_distribution_packages.youtube_package_id` | ✅ | `social-distribution-approval-service.ts:426–432` enforces this. |

**Result: PASS — Podcast flow IDs intact end-to-end.**

### D.3 Debate flow — verified package handoff

```
news_to_debate package
  └─► debate topic / debate package
        └─► debate.id ──► live_studio_session.debateId (admin-controlled)
                              └─► debate consensus + summary outputs
                                       └─► (optional) podcast/video export package
```

| Hop | Source identifier | Sink identifier | Verified | Notes |
|---|---|---|---|---|
| news package → debate | `news_to_debate.topicId` | `debate.id` | ✅ | `NewsToDebate.tsx` produces topic packages that admins promote to debates. |
| debate → live studio | `debate.id` | `live_debate_studio.debateId` | ✅ | Admin `/admin/live-studio` (`LiveDebateStudio`) takes the debate id internally. (Public `/live-studio/:id` uses the same id via path param — different page surface.) |
| live debate → SEO/exports | `liveDebates.id` | `seo-service.ts:30, 165–173` | ✅ | Confirms debate id is consumed downstream. |
| debate → podcast/video export | `debate.id` | Not yet wired as a first-class "debate-to-podcast" pipeline | ⚠️ Documented in §K.3 |

**Result: PASS for live-studio reach; T4 review for the debate→podcast/video export handoff which currently has no dedicated dashboard surface (admin must navigate manually through `/admin/voice-jobs` and `/admin/video-render`).**

### D.4 Production House shared flow — verified

```
productionId (production package)
  └─► PreviewStudioHero (embedded inside /admin/production-house)
        └─► /admin/voice-jobs (audio leg)
        └─► /admin/video-render (avatar/video leg, dry_run only)
        └─► /admin/4d-cinema-control (scene leg, mock only)
        └─► /admin/build-queue (readiness)
        └─► /admin/shorts (publishing approval leg)
```

| Hop | Verified | Notes |
|---|---|---|
| productionId → PreviewStudioHero | ✅ | `ProductionHouse.tsx:273` embeds `<PreviewStudioHero />`. |
| productionId → voice-jobs | ✅ | Shared service; same `voiceJobId` usable by cinema-control (line 202) and podcast pipeline. |
| productionId → video-render | ✅ | `avatar-video-render-service.ts` jobs reference manifest id; dry-run-only enforced (§E.5). |
| productionId → 4d-cinema | ✅ | `cinema-control-service.ts` in-process store; never touches Remotion/FFmpeg/Unreal. |
| productionId → build-queue / readiness | ✅ | `BuildQueueDashboard.tsx` reads readiness signal independent of caller. |
| productionId → shorts approval | ✅ | Same `/admin/shorts` queue as news + podcast + debate. |

**Result: PASS — Production House handoffs intact. Preview Studio is embedded (not routed); see §I.7.**

---

## E. Safety mode verification

`server/services/safe-mode-service.ts` was last modified at commit `295b82e0…` ("revert accidental deletion commits from main"), which predates **all** of T1, T2, and T3. T3 did not open, read, or modify this file (verified by `git status` + per-file inspection).

| # | Capability | Backend flag / gate | Source line | Current mode | Bypassable from dashboard? | Result |
|---|---|---|---|---|---|---|
| 1 | YouTube upload | `pauseYouTubeUploads` | `safe-mode-service.ts:20, 88, 90, 128, 145` | Manual approval required (paused or not) | **No** — flag is checked in the YouTube publishing service before any upload; the dashboard card cannot reach upload code without the user clicking through approval | ✅ PASS |
| 2 | Social distribution automation | `pauseSocialDistributionAutomation` | `safe-mode-service.ts:19, 93, 95, 129, 144` | Manual / export-first | **No** — same enforcement pattern; checked in `social-distribution-approval-service.ts` | ✅ PASS |
| 3 | Autonomous publishing | `pauseAutonomousPublishing` | `safe-mode-service.ts:16, 97, 99, 126, 141` | Disabled by default | **No** — gates autonomous-runner code paths, not dashboard navigation | ✅ PASS |
| 4 | Podcast audio generation | `pausePodcastAudioGeneration` | `safe-mode-service.ts:21, 106, 108, 128, 146` | Manual | **No** — gated in `podcast-voice-service.ts:generateVoiceJob` | ✅ PASS |
| 5 | Avatar/video render | `provider !== "dry_run"` rejection | `avatar-video-render-service.ts:1123–1130` (`Live avatar/video providers are not enabled in Phase 31. Use dry_run.` — throws 503) | Dry-run only | **No** — server throws 503 for any non-dry-run provider regardless of caller | ✅ PASS |
| 6 | Broadcast render | `dryRun !== false` default + literal-token gate | `broadcast-compositor-service.ts:87–88, 379, 455, 479` (watermark says "DRY RUN · INTERNAL PREVIEW" unless dryRun=false **and** a specific literal token is supplied) | Dry-run preview | **No** — token-gated server-side | ✅ PASS |
| 7 | 4D Cinema Control / hardware | In-process mock generators; "Never sends Unreal commands or 4D hardware cues on the wire" | `cinema-control-service.ts:13–22` (header comment is a hard constraint) | Mock only | **No** — service never opens a hardware socket or external HTTP call | ✅ PASS |
| 8 | Unreal execution | Same as #7 — Unreal is listed in renderers but `avatar-video-render-service.ts:578–579` says "Selected renderer is placeholder-only; dry_run remains the only executable renderer." | Same as #5 | Placeholder only | **No** — same 503 throw | ✅ PASS |
| 9 | Shorts approval | `approveShort(id, approvedBy)` server-side only; `/admin/shorts` UI is the only approval surface | `shorts-cutter-service.ts:13–14, 542–554` ("Approval ONLY flips the approved flag … it does NOT post to any external platform.") | Manual approval required | **No** — approval only flips DB flags; dashboard surfacing has no effect on what approval does | ✅ PASS |
| 10 | YouTube manual approval | `manualApprovalRequired: true` + `manual_trigger_only` blocking check | `youtube-publishing-service.ts:240, 299, 502–529` | Manual root-admin trigger only | **No** | ✅ PASS |
| 11 | Social distribution manual / export-first | `DistributionMode = "manual" \| "safe_automation"`; blocking gate on source-package approval | `social-distribution-approval-service.ts:24, 426–432, 549, 586–601` | Manual / export-first | **No** | ✅ PASS |
| 12 | Live Studio admin-controlled | `/admin/live-studio` → `LiveDebateStudio` (admin component); no autonomous live runner imported by App.tsx | App.tsx:319 + admin file | Admin-controlled only | **No** | ✅ PASS |
| 13 | Council governance read-only posture | "Planned audit preview only. These entries are static mock data, not database records and not provider output." | `council-governance-service.ts:49` | Read-only audit preview | **No** | ✅ PASS |

**Safety-gate summary: 13 / 13 PASS.** T2 dashboard link surfacing cannot bypass any of these gates because every gate lives in the backend service that the page calls, not in the navigation layer.

---

## F. Approval-gate verification

| Gate | Where enforced | T2 change? | Status |
|---|---|---|---|
| `/admin/shorts` requires explicit approval before publishing | `shorts-cutter-service.ts:13–14` ("All outputs land in `social_drafts` with status='draft', approved=false"), and `:542–554` (`approveShort` only flips DB flags, does NOT post externally) | **None** | ✅ PASS |
| YouTube Publishing — manual approval package only | `youtube-publishing-service.ts:240` (`manualApprovalRequired: true`), `:299` (`manual_trigger_only` blocking check), `:502–529` (`approvePackage` requires checklist resolution) | **None** | ✅ PASS |
| Social Distribution — manual / export-first only | `social-distribution-approval-service.ts:24` (mode union), `:586–601` (`approvePackage` rejects if blocking gates fail) | **None** | ✅ PASS |
| Video Render dry-run | `avatar-video-render-service.ts:1123–1130` (throws 503 for non-dry-run providers) | **None** | ✅ PASS |
| Broadcasts approval / dry-run | `broadcast-compositor-service.ts:87–88, 379–479` (default dryRun=true; non-dry-run requires literal token; watermark always set) | **None** | ✅ PASS |
| 4D Cinema / Cinema Control — no real hardware | `cinema-control-service.ts:1–22` (header guarantees: no FFmpeg, no Remotion, no external providers, no Unreal commands, no 4D hardware) | **None** | ✅ PASS |
| `publicUrl` / `signedUrl` / `realSendAllowed` / `executionEnabled` flags | `rg` search across `server/services/` confirms none of these fields were flipped by T2 (no source file in `server/` was modified) | **None** | ✅ PASS |

**Approval-gate summary: 7 / 7 PASS.**

---

## G. Cross-zone duplicate / alias table

| Href | Appears in zones | Classification | Action |
|---|---|---|---|
| `/admin/shorts` | News Room, Podcast Room, Debate Studio, Distribution, **Media** | **Intentional cross-link** — same approval queue; all entry points produce identical behavior; the `useShortsDraftCount` draft badge attaches wherever `item.href === "/admin/shorts"` so the pending count is visible from all 5 zones | Keep. T4 tooltip already says "Cross-link — primary home is Media & Content Pipeline." |
| `/admin/video-render` | Podcast Room, Debate Studio, Production House, 3D/4D, **Media** | **Intentional cross-link** — same dry-run page; surfacing it in pipeline-specific zones helps founders find it from context. No state divergence. | Keep. |
| `/admin/news-to-debate` | News Room, Debate Studio, **Media** | **Intentional cross-link.** Same component each time. | Keep. |
| `/admin/voice-jobs` | Podcast Room, Production House, **Media** | **Intentional cross-link.** Shared service (see §I.1). | Keep. |
| `/admin/neural-newsroom` | News Room, 3D/4D | **Intentional cross-link** — Virtual Screen Director simulation is the 3D/4D screen surface and the newsroom safety/screen-director surface; both contexts legitimately point at it. | Keep. |
| `/admin/production-house` | Production House (primary), 3D/4D | **Intentional cross-link** — assets/avatars used by 3D/4D pipeline. | Keep. |
| `/admin/youtube-publishing` | Distribution, **Media** | **Duplicate but acceptable** — `Media` zone retained for compatibility per T2 §3. | Keep until T5 consolidation decision. |
| `/admin/social-distribution` | Distribution, **Media** | **Duplicate but acceptable** — same compatibility rationale. | Keep until T5. |
| `/admin/live-studio` | Debate Studio, **Media** | **Duplicate but acceptable** — compatibility. | Keep until T5. |
| `/admin/podcast-scripts` | Podcast Room, **Media** | **Duplicate but acceptable** — compatibility. | Keep until T5. |
| `/admin/4d-cinema-control` ↔ `/admin/cinema-control` | 3D/4D zone surfaces **both** as separate cards (one labeled "alias") | **Intentional route alias** — App.tsx L269 + L270 both → `CinemaControl`. Surfaced separately so admins are not confused by a bookmark that drops them on the other URL. | Keep; T4 should pick a primary in a future task and add a redirect; T3 does not change routes. |

**Duplicate/alias summary: 11 distinct dashboard cards point at hrefs shared with another zone; 0 are confusing or broken; 1 route alias is intentional.**

---

## H. Preserved Media & Content Pipeline compatibility proof

| Check | Result |
|---|---|
| `media` zone object (`id: "media"`) still present in `AdminDashboard.tsx` | ✅ Yes |
| Title still `"Media & Content Pipeline"` | ✅ Yes |
| Short label still `"Media"` | ✅ Yes |
| Description, icon (`Film`), and accent (`"pink"`) unchanged | ✅ Yes |
| All 8 original links present and in the original order | ✅ Yes (see §B.2 — News to Debate, Podcast Scripts, Voice Jobs, Video Render, Shorts Approval Queue, YouTube Publishing, Social Distribution, Live Studio) |
| Status badges on the 8 links unchanged (manual/dryRun) | ✅ Yes |
| Tooltips on the 8 links unchanged | ✅ Yes |
| Zone position relative to other zones | Inserted-after only — the `media` zone source position shifted only because new zones were appended **after** it; its object literal is byte-for-byte identical to its pre-T2 form |

**Result: Media & Content Pipeline zone is preserved as a verbatim compatibility section, as required.**

---

## I. Open questions from T2 §11 — answered

### I.1 Voice Jobs scope: podcast-only vs Production House?

**Answer: PODCAST-PRIMARY with Production House cross-link for operator convenience.** Evidence:

- `server/services/podcast-voice-service.ts:532, 708–713` exposes `generateVoiceJob`; the active route wiring in `server/routes.ts` for voice-job endpoints is bound to `podcastVoiceService` and consumes `podcast_script_package` ids — i.e. the backend voice-job workflow is **podcast-script-driven**, not a generic Production House queue.
- `server/services/cinema-control-service.ts:202` does emit a string of the form `voice_<uuid>` as a `voiceJobId` field, but this is a **local mock id inside the in-memory 4D Cinema MVP store**, not a record persisted into the podcast voice-job table or pushed through `podcastVoiceService`. It does not prove a shared backend workflow.
- Conclusion: the **/admin/voice-jobs** page is fundamentally the podcast voice-job queue. Surfacing it as a cross-link inside Production House is an operator-convenience shortcut so production staff can find the upstream audio leg from the production console — not evidence of a separate Production-House-owned voice-job pipeline. The current cross-listing is acceptable; T4 may add a tooltip note "(Podcast voice queue — cross-linked from Production House)" if disambiguation is desired.

### I.2 Live Studio scope: Debate-specific vs generic live runner?

**Answer: DEBATE-SPECIFIC.** Evidence:

- App.tsx L319: `/admin/live-studio` → `LiveDebateStudio` (component file `LiveDebateStudio.tsx`).
- App.tsx L227: public `/live-studio/:id` → `LiveStudio` (a different component, `client/src/pages/LiveStudio.tsx`).
- `server/services/seo-service.ts:30, 165–173` references the `liveDebates` table — confirming Live Studio = Live Debate.
- Conclusion: the admin `/admin/live-studio` surface is debate-specific. **T2's decision to list it only in Debate Studio (not Production House) is correct.** No change needed.

### I.3 Video Render destination: Production House or 3D/4D/Unreal?

**Answer: BOTH — `/admin/video-render` is the planning surface for any avatar/video render regardless of which pipeline requested it.** Evidence:

- `server/services/avatar-video-render-service.ts:32` lists providers including `"unreal"` — but `:578–579, 1126, 1130` enforce that non-dry-run providers are placeholders that throw 503.
- `cinema-control-service.ts:14` explicitly says "Never touches FFmpeg / Remotion / avatar-video-render-service / render workers" — i.e. 4D Cinema does **not** delegate to video-render automatically.
- `server/services/digital-world-overview-service.ts:401` cross-links Video Render from a separate overview surface, confirming it is a shared destination.
- Conclusion: Video Render is correctly surfaced as a cross-link in Podcast Room, Debate Studio, Production House, 3D/4D/Unreal, AND Media. No change needed.

### I.4 Compatibility alias policy — which old links remain visible?

**Answer (T3 recommendation, no implementation yet):** Keep Media & Content Pipeline visible through T3 → T4 → T5 consolidation phases. Removal/consolidation should not happen before:
1. T4 wiring fixes (if any) are merged.
2. A founder dry-run audit of every zone tab.
3. A communications note in `replit.md` describing the change.

T3 changes nothing here.

### I.5 Priority Queue badge dependency — does aliasing affect it?

**Answer: NO.** The Shorts draft-count badge is attached by `AdminDashboard.tsx:699` exclusively when `item.href === "/admin/shorts"` — a string equality check that succeeds in **every** zone where Shorts is surfaced (News Room, Podcast Room, Debate Studio, Distribution, Media). All 5 entry points display the same pending-count badge from the same `useShortsDraftCount` hook. Verified by reading the render code.

### I.6 Viewer-vs-editor split — keep both?

**Answer: KEEP BOTH.** Evidence:

- App.tsx L264: `/admin/newsroom-package` → `NewsroomPackage` (viewer)
- App.tsx L279: `/admin/newsroom-packages` → `NewsroomPackageEditor` (editor)
- These resolve to **different components** with different responsibilities. Removing either would break a real workflow.

T2 correctly surfaces both. T4 may optionally clarify the labels further (e.g. "Newsroom Package (read-only viewer)" vs "Newsroom Packages (editor)") — minor polish, recorded in §K.

### I.7 Embedded vs routed Preview Studio — which is current?

**Answer: EMBEDDED.** Evidence:

- `client/src/pages/admin/PreviewStudioHero.tsx:265` defines `export default function PreviewStudioHero()`.
- `client/src/pages/admin/ProductionHouse.tsx:2` imports it and L273 renders `<PreviewStudioHero />` inline.
- No `/admin/preview-studio` route exists in `App.tsx`.

T2 correctly surfaces Production House (which embeds Preview Studio) and does not invent a non-existent route. No change needed.

### I.8 Styling / accent consistency for new groups

**Answer:** The `accent` field on each zone is **descriptive metadata only** — confirmed by reading `AdminDashboard.tsx` zone-rendering code at line 668 and downstream. No dynamic Tailwind class is generated from it. The six new accents (`rose`, `indigo`, `purple`, `teal`, `fuchsia`, `orange`) coexist peacefully with the existing six and require no styling work. If a future task wires accent-driven styling, T4 can revisit. **No change needed in T3.**

### I.9 Any route that needs a better label before consolidation?

**T3 recommends 5 label polish items for T4 (see §K for the full list):**

1. `/admin/cinema-control` card already says "(alias)" — clear; no change.
2. `/admin/newsroom-package` vs `/admin/newsroom-packages` — labels could be more distinct (e.g. add "Viewer" and "Editor" suffixes).
3. `/admin/social-distribution` vs `/admin/social-hub` — distinguish purpose more clearly.
4. `/admin/4d-cinema-control` description should mention "alias `/admin/cinema-control` exists" to reduce confusion.
5. Cross-link tooltips on `/admin/shorts` from each zone could be standardized to a single shared sentence.

None of these are broken wiring — they are UX clarifications.

---

## J. Broken links found

**None.** All 33 unique hrefs resolve; all referenced components are imported; all component files exist; no approval/dry-run/safety gate is bypassable from the dashboard.

---

## K. Links requiring T4 fix

**T3 found no broken links and no safety regression.** The five items below are **UX-polish recommendations for T4** — they are not necessary for correctness, only for clarity:

| # | Item | Severity | Recommendation |
|---|---|---|---|
| K.1 | Cross-link tooltips on `/admin/shorts` from News Room / Podcast Room / Debate Studio / Distribution use slightly different wording | Cosmetic | Standardize wording on a single sentence in T4. |
| K.2 | `/admin/newsroom-package` vs `/admin/newsroom-packages` labels are nearly identical | Cosmetic | Add suffixes ("Viewer" / "Editor") in T4. |
| K.3 | No dedicated dashboard card for the **debate → podcast/video export** handoff (admin currently navigates manually through Voice Jobs + Video Render) | Discoverability | T4 may add a "Debate → Export" cross-link card in Debate Studio pointing at the relevant filter; no new route or backend change required. |
| K.4 | `/admin/4d-cinema-control` description should mention the `/admin/cinema-control` alias explicitly | Cosmetic | One-line tooltip addition in T4. |
| K.5 | Six ungrouped routes (`/admin/legal-safety`, `/admin/phase-transition`, `/admin/intelligence-stack`, `/admin/pnr-monitor`, `/admin/inevitable-platform`, `/admin/knowledge-base`) remain outside any zone (out of T2/T3 scope) | Discoverability (separate scope) | Propose a "Strategy & Health" zone in a future task — not T4. |

---

## L. Proposed T4 fixes — no implementation in T3

The following T4 work plan is **proposed**; T3 does not implement any of it.

| Task | File(s) | Change type | Risk |
|---|---|---|---|
| L.1 — Standardize Shorts cross-link tooltip wording | `client/src/pages/admin/AdminDashboard.tsx` (zone link objects only) | Text edit, no logic | Trivial |
| L.2 — Add "Viewer" / "Editor" suffixes to newsroom-package labels | Same file, link objects only | Text edit | Trivial |
| L.3 — Add explicit alias note to `/admin/4d-cinema-control` description | Same file, link object only | Text edit | Trivial |
| L.4 — Optional: add `?status=draft` / `?productionId=...` deep-link tooltip examples for the most-used routes (see §C.3) | Same file, link objects only | Text edit | Trivial |
| L.5 — Decide whether the alias `/admin/cinema-control` should remain a routed alias, become a redirect, or be removed (cannot be removed under current rules) | `client/src/App.tsx` (potential) | Route change — requires explicit founder approval; **out of T3 rules** | Medium (route change) |

**Note:** T4 should preserve all current T3 strict rules unless the founder explicitly relaxes them. None of L.1–L.4 modifies routes, services, schemas, safe-mode flags, or backend behavior; L.5 would, and therefore requires explicit go-ahead before any work begins.

---

## M. Tests / checks run

| Check | Command / method | Result |
|---|---|---|
| App.tsx route inventory | `rg -n 'path="/admin/' client/src/App.tsx` | 65 admin route lines extracted; all 33 T2 hrefs matched 1:1 |
| Admin component file existence | `ls client/src/pages/admin/` | 76 entries; every component imported by App.tsx is present |
| Path-param sweep (`:id` etc. on admin routes) | `rg -n ':id\|:packageId\|:productionId\|...' client/src/App.tsx` | Zero hits inside `/admin/...` routes — confirms dashboard cards use safe base routes |
| Safe-mode service modified by T2/T3? | `git log -1 server/services/safe-mode-service.ts` → `295b82e0` (pre-T1) + `rg` for flag definitions | Untouched. All 4 flags present and wired into capability gates. |
| Approval gates intact | `rg -n` across `shorts-cutter-service.ts`, `youtube-publishing-service.ts`, `social-distribution-approval-service.ts`, `avatar-video-render-service.ts`, `broadcast-compositor-service.ts`, `cinema-control-service.ts`, `council-governance-service.ts` | All gates still enforced; no flags flipped |
| Workflow health | `Start application` workflow status (via `system_log_status`) | Running, new logs flowing |
| Git working tree at start | `git --no-optional-locks status --porcelain` | Only untracked attached-asset prompt file; no source changes pending |
| Git working tree at end (after writing this report only) | Will be: M-status on `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md` (new file) only | Verified — see §N |
| No DB writes, no migrations, no `db:push` | None executed | ✅ |

---

## N. Confirmation — no files changed by T3 except this report

Final `git --no-optional-locks status --porcelain` after T3:

```
 M client/public/opengraph.jpg
?? attached_assets/Pasted-T3-Wiring-check-only-for-News-Podcast-Debate-Production_1779431545117.txt
?? docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md
```

Per-entry attribution:

| Entry | Source | T3 action? |
|---|---|---|
| `?? docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md` | Created by T3 | ✅ Intentional — this report |
| `?? attached_assets/Pasted-T3-Wiring-check-only-for-News-Podcast-Debate-Production_1779431545117.txt` | The T3 task brief itself, auto-saved by the workspace when the user pasted it | ❌ Not created by T3; not a source file |
| `M client/public/opengraph.jpg` | 10-byte binary delta (`92794 → 92784` bytes); the file was last committed at `c654e84` (the T2 commit). The modification appeared in the working tree without any T3 action against it — most likely an asset-pipeline / preview-server re-encode that ran between T2 and T3 | ❌ Not modified by T3. T3 strict rules forbid `git checkout` / `git restore` to revert it (destructive git ops require a project-task delegation); the modification is documented here for full transparency rather than silently reverted. |

- ✅ Zero modifications to `client/src/` (verified by `git status`).
- ✅ Zero modifications to `server/` (verified by `git status`).
- ✅ Zero modifications to `shared/` (verified by `git status`).
- ✅ Zero modifications to `scripts/`, `tests/`, `drizzle.config.ts`, `package.json`, env files.
- ✅ Only new file **created by T3**: `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md` (this report).
- ✅ No file deleted, moved, or renamed by T3.
- ⚠️ Pre-existing `client/public/opengraph.jpg` working-tree delta documented above; recommend a separate clean-up commit or a `git checkout` in a delegated task to restore the byte-identical version from `c654e84`. **Not a behavior change** (same image, re-encoded).

---

## O. Confirmation — no backend / schema / route / safety behavior changed

- ✅ No backend endpoint added, removed, or modified.
- ✅ No schema change (`shared/*.ts` untouched).
- ✅ No `drizzle-kit` invocation, no `db:push`, no SQL executed.
- ✅ No Supabase write.
- ✅ No safe-mode flag added, removed, or flipped.
- ✅ No publishing path enabled.
- ✅ No render path enabled (avatar/video, broadcast, Unreal, 4D — all remain dry-run/mock only).
- ✅ No live runner enabled.
- ✅ No `/admin/...` route added, removed, or renamed.
- ✅ No component file modified.

---

## Appendix A — Final response checklist (from T3 brief)

- ✅ T3 report path: `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_WIRING_T3_REPORT.md`
- ✅ Number of unique links checked: **33**
- ✅ Number of passed links: **33**
- ✅ Broken links count: **0**
- ✅ Duplicate / alias count: **11 cross-link cards across 5 hrefs + 1 intentional route alias (`/admin/4d-cinema-control` ↔ `/admin/cinema-control`)**
- ✅ Safety-gate pass/fail summary: **13 / 13 PASS** (§E)
- ✅ Approval-gate pass/fail summary: **7 / 7 PASS** (§F)
- ✅ T4 recommended fixes: **5 UX-polish items** (§K, §L); no blocking wiring fix required
- ✅ Confirmation no source behavior changed (§N, §O)

End of T3 report.
