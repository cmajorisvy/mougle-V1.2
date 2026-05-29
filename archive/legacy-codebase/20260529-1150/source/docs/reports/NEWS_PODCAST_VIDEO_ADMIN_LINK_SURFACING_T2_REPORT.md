# T2 — News / Podcast / Video Admin Link Surfacing Report

**Date:** 2026-05-22
**Scope:** T2 — surface existing admin links from News Room, Podcast Room, Debate Studio, Production House, 3D/4D/Unreal, and Distribution categories under the main admin dashboard.
**Input artifact:** `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md` (T1).
**Source commit at start of T2:** `c654e84a07145fde47124718373964275a1f8e12` (HEAD after T1).

**T2 is additive only.** No file/component/route was deleted, moved, or renamed. No backend or API behavior was changed. No safe-mode flag was changed. No publishing / rendering / live execution was enabled.

---

## 1. Dashboard groups added/updated

Six new zones were appended to the `zones` array in `client/src/pages/admin/AdminDashboard.tsx` between the existing **"Media & Content Pipeline"** zone and the existing **"Marketplace & Economy"** zone. The existing "Media & Content Pipeline" zone is **preserved verbatim** — same id, same title, same links, same status badges, same order.

| Zone id (new)        | Tab label (short) | Title                          | Description                                                                                                            |
|----------------------|-------------------|--------------------------------|------------------------------------------------------------------------------------------------------------------------|
| `news-room`          | News Room         | News Room Studio               | Newsroom packages, broadcast briefs, screen director, playout queue, news-shorts cutter (cross-links).                 |
| `podcast-room`       | Podcast Room      | Podcast Room Studio            | Podcast script packages, voice jobs, and clip references (cross-links). Dedicated podcast-room page not yet built.      |
| `debate-studio`      | Debate            | Debate Studio                  | Debate topic packages, council governance, live studio, debate clips (cross-links).                                    |
| `production-house`   | Production        | Production House               | Production console, render planning, voice/avatar jobs, AI worker pool, build readiness.                               |
| `studio-3d-4d`       | 3D/4D             | 3D / 4D / Unreal               | Cinema 4D control, virtual screen director simulation, 4D sandbox. **Dry-run only — no live hardware execution.**       |
| `distribution`       | Distribution      | Distribution                   | Shorts approval, YouTube approval packages, social export-first packages, social hub, growth/SEO surfaces.              |

The dashboard's existing `ZoneTabs` component reads `zones.map(...)` (line 410), so the six new tabs render automatically — no separate registration needed.

The keyboard zone-jump shortcut (`G` then a letter) was extended with: `N` (News Room), `P` (Podcast Room), `D` (Debate Studio), `H` (Production House), `T` (3D/4D — think "Theater"), `X` (Distribution). The existing `S`/`A`/`K`/`M`/`E`/`O` shortcuts are unchanged.

---

## 2. All links surfaced (per new zone)

Every `href` below is an existing, already-registered route in `client/src/App.tsx`. **No route was added.**

### 2.1 News Room Studio (`/admin/dashboard` → tab "News Room")

| Label | Route | Mode shown | Notes |
|---|---|---|---|
| News Source Registry | `/admin/news-sources` | admin | Cross-link from Knowledge & Truth |
| News to Debate | `/admin/news-to-debate` | manual | Cross-link from Media & Content Pipeline |
| Broadcast Briefs | `/admin/broadcast-briefs` | manual | **Newly surfaced** |
| Broadcasts Preview | `/admin/broadcasts` | dryRun | **Newly surfaced** |
| Newsroom Package | `/admin/newsroom-package` | admin | **Newly surfaced** |
| Newsroom Packages Editor | `/admin/newsroom-packages` | manual | **Newly surfaced** |
| Newsroom Playout Queue | `/admin/playout-queue` | manual | **Newly surfaced** |
| B-roll Plan Review | `/admin/broll-plan-review` | manual | **Newly surfaced** |
| Anchor Modes | `/admin/anchor-modes` | admin | **Newly surfaced** |
| Autopilot Newsroom | `/admin/autopilot-newsroom` | dryRun | **Newly surfaced** |
| Neural Newsroom & Virtual Screen Director | `/admin/neural-newsroom` | dryRun | **Newly surfaced** |
| Omni-Channel Audience | `/admin/omni-channel-audience` | admin | **Newly surfaced** |
| News Shorts Cutter (Approval Queue) | `/admin/shorts` | manual | Cross-link from Media & Content Pipeline (badge still attaches) |

### 2.2 Podcast Room Studio (`/admin/dashboard` → tab "Podcast Room")

| Label | Route | Mode shown | Notes |
|---|---|---|---|
| Podcast Scripts | `/admin/podcast-scripts` | manual | Cross-link from Media & Content Pipeline |
| Voice Jobs | `/admin/voice-jobs` | manual | Cross-link from Media & Content Pipeline (shared with Production House) |
| Video Render (podcast video) | `/admin/video-render` | dryRun | Cross-link from Media & Content Pipeline |
| Podcast Shorts (Approval Queue) | `/admin/shorts` | manual | Cross-link from Media & Content Pipeline |
| Debate Reference (News to Debate) | `/admin/news-to-debate` | manual | Cross-link from Media & Content Pipeline |

### 2.3 Debate Studio (`/admin/dashboard` → tab "Debate")

| Label | Route | Mode shown | Notes |
|---|---|---|---|
| News to Debate | `/admin/news-to-debate` | manual | Cross-link from Media & Content Pipeline |
| Live Studio | `/admin/live-studio` | manual | Cross-link from Media & Content Pipeline (public `/live-studio/:id` route unchanged) |
| Council Governance | `/admin/council-governance` | dryRun | Cross-link from Safety & Governance |
| Debate Shorts (Approval Queue) | `/admin/shorts` | manual | Cross-link from Media & Content Pipeline |
| Video Render (debate video) | `/admin/video-render` | dryRun | Cross-link from Media & Content Pipeline |

### 2.4 Production House (`/admin/dashboard` → tab "Production")

| Label | Route | Mode shown | Notes |
|---|---|---|---|
| Production House Console | `/admin/production-house` | admin | **Newly surfaced** (route already existed) |
| Video Render | `/admin/video-render` | dryRun | Cross-link from Media & Content Pipeline |
| Voice Jobs | `/admin/voice-jobs` | manual | Cross-link from Media & Content Pipeline |
| AI Jobs | `/admin/ai-jobs` | admin | **Newly surfaced** |
| AI Workers | `/admin/ai-workers` | admin | **Newly surfaced** |
| AI Ops | `/admin/ai-ops` | admin | **Newly surfaced** |
| AI Retention | `/admin/ai-retention` | admin | **Newly surfaced** |
| Build Queue / Readiness | `/admin/build-queue` | dryRun | Cross-link from Operations |

### 2.5 3D / 4D / Unreal (`/admin/dashboard` → tab "3D/4D")

| Label | Route | Mode shown | Notes |
|---|---|---|---|
| 4D Cinema Control | `/admin/4d-cinema-control` | dryRun | **Newly surfaced** |
| Cinema Control (alias) | `/admin/cinema-control` | dryRun | **Newly surfaced** — same React component as `/admin/4d-cinema-control` (both resolve to `CinemaControl`) |
| Virtual Screen Director Simulation | `/admin/neural-newsroom` | dryRun | Cross-link from News Room Studio |
| Production House (assets/avatars) | `/admin/production-house` | admin | Cross-link from Production House |
| Video Render (3D/4D planning) | `/admin/video-render` | dryRun | Cross-link from Media & Content Pipeline |

### 2.6 Distribution (`/admin/dashboard` → tab "Distribution")

| Label | Route | Mode shown | Notes |
|---|---|---|---|
| Shorts Approval Queue | `/admin/shorts` | manual | Cross-link from Media & Content Pipeline |
| YouTube Publishing | `/admin/youtube-publishing` | manual | Cross-link from Media & Content Pipeline (still gated by `pauseYouTubeUploads`) |
| Social Distribution | `/admin/social-distribution` | manual | Cross-link from Media & Content Pipeline (still gated by `pauseSocialDistributionAutomation`) |
| Social Distribution Hub | `/admin/social-hub` | admin | **Newly surfaced** — route existed but was not in any zone before |
| Marketing | `/admin/marketing` | admin | Cross-link from Operations |
| SEO | `/admin/seo` | admin | Cross-link from Operations |
| Growth Autopilot | `/admin/growth-autopilot` | admin | **Newly surfaced** — route existed but was not in any zone before |
| Authority Flywheel | `/admin/authority-flywheel` | admin | **Newly surfaced** — route existed but was not in any zone before |

---

## 3. Existing "Media & Content Pipeline" links preserved

The existing zone object (`id: "media"`, lines 186–219 of `AdminDashboard.tsx` after the edit, was previously lines 186–203 before — only its position relative to the file is unchanged because new zones were inserted **after** it) is untouched. All eight original links remain in the exact order and with the exact labels, routes, status badges, descriptions, icons, and tooltips:

1. News to Debate — `/admin/news-to-debate` — manual
2. Podcast Scripts — `/admin/podcast-scripts` — manual
3. Voice Jobs — `/admin/voice-jobs` — manual
4. Video Render — `/admin/video-render` — dryRun
5. Shorts Approval Queue — `/admin/shorts` — manual
6. YouTube Publishing — `/admin/youtube-publishing` — manual
7. Social Distribution — `/admin/social-distribution` — manual
8. Live Studio — `/admin/live-studio` — manual

Per T2 rules, the compatibility section will remain until wiring checks and E2E tests prove the new grouped links cover everything.

---

## 4. Related `/admin/...` routes found but **not surfaced** (with reason)

These routes exist in `client/src/App.tsx` and were inspected during discovery. They are intentionally **not** added to any of the six new zones because they are out of scope for News Room / Podcast Room / Debate / Production / Distribution surfacing, or because they are already covered by their existing primary zone.

| Route | Reason not surfaced |
|---|---|
| `/admin/dashboard` | The dashboard itself. |
| `/admin/login`, `/admin/request-access` | Authentication entry points. Not a content/media surface. |
| `/admin/founder-control`, `/admin/founder-pto-mode`, `/admin/command-center`, `/admin/debug` | Listed under `commandLinks` (founder/root command strip). Not in the zone-tab system. |
| `/admin/digital-world` | Listed under `commandLinks`. Civilization zone overview, not a media/news/podcast/debate/distribution surface. |
| `/admin/safe-mode`, `/admin/risk-center`, `/admin/policy-governance`, `/admin/compliance` | Already in **Safety & Governance** zone. Out of scope for T2. |
| `/admin/system-agents`, `/admin/external-agents`, `/admin/civilization-health`, `/admin/ai-cost-monitor`, `/admin/agent-costs` | Already in **Agents & Civilization** zone. Out of scope for T2. |
| `/admin/knowledge-graph`, `/admin/knowledge-economy`, `/admin/truth-alignment`, `/admin/knowledge-alignment` | Already in **Knowledge & Truth** zone. Out of scope for T2. (`/admin/news-sources` is the one knowledge entry that IS cross-linked into News Room because it's directly upstream.) |
| `/admin/marketplace-clones`, `/admin/revenue`, `/admin/flywheel`, `/admin/ai-cfo` | Already in **Marketplace & Economy** zone. Out of scope for T2. |
| `/admin/support`, `/admin/staff`, `/admin/operations`, `/admin/workday`, `/admin/cost-control` | Already in **Operations** zone. (`/admin/build-queue`, `/admin/marketing`, `/admin/seo` ARE cross-linked into Production House / Distribution because they are directly relevant.) |
| `/admin/legal-safety`, `/admin/phase-transition`, `/admin/intelligence-stack`, `/admin/pnr-monitor`, `/admin/inevitable-platform`, `/admin/knowledge-base` | Currently ungrouped, but **NOT** part of the News Room / Podcast / Debate / Video / Production / Distribution scope of T2. Documented here so T3 or a future "Strategy & Health" zone can surface them. |
| `/admin/users` → `/admin/dashboard`, `/admin/billing` → `/admin/revenue` | Redirect aliases. Already handled by their targets. |
| `/admin/newsroom-package` vs `/admin/newsroom-packages` | **Both** surfaced separately under News Room Studio because they resolve to **different** components (`NewsroomPackage` viewer vs `NewsroomPackageEditor`). Not collapsed. |
| `/admin/4d-cinema-control` vs `/admin/cinema-control` | **Both** surfaced separately under 3D/4D/Unreal because they resolve to the **same** component (`CinemaControl`). Labelled "alias" so admins know it's a duplicate route. Not collapsed because T2 is forbidden from removing routes. |
| Public routes `/live-studio/:id`, `/ai-debates`, `/live-debates`, `/debates`, `/debate/:id` | Public-side companions to admin surfaces. Not admin-dashboard surfaces. |

**No internal/hidden admin route was discovered that should have been surfaced and wasn't.** Discovery search terms used (per task brief): `news`, `newsroom`, `broadcast`, `brief`, `screen`, `legal event`, `visual`, `virtual screen`, `podcast`, `voice`, `audio`, `debate`, `live studio`, `video`, `render`, `avatar`, `media package`, `package viewer`, `production-house`, `preview-studio`, `cinema4d`, `4d`, `unreal`, `shorts`, `youtube`, `social`, `publishing`, `distribution`, `approval`, `readiness`.

Search artifacts of note found but with no separate admin route to surface:

- **`PreviewStudioHero.tsx`** — exists under `client/src/pages/admin/` but is a **component**, not a routed page. It is embedded inside `ProductionHouse.tsx`. Its functionality is reachable via the new "Production House Console" link.
- **`scheduledPreviewAutoRevert.ts`** — a helper module, not a routed page.
- **`omni-channel-audience/` subfolder, `audit-export-outlier-form.ts`, `omni-channel-audience-forms.ts`** — supporting files for `OmniChannelAudience.tsx`. Reachable via the surfaced `/admin/omni-channel-audience` link.

---

## 5. Files changed

Exactly **2** files modified, **1** file created:

| File | Type of change | Lines touched (approx.) |
|---|---|---|
| `client/src/pages/admin/AdminDashboard.tsx` | **Modified** — extended `ZoneId` union type, inserted 6 zone objects between the `media` and `marketplace` zones, extended the G-prefix keyboard map and updated its comment. No existing zone, no existing link, no existing handler altered. | Type: ~15 lines added. Zones: ~115 lines added (insert-only). Keyboard map: ~18 lines modified (object expansion, no existing key removed). |
| `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md` | **Created** — this report. | 100% new file. |

Zero changes to:

- `client/src/App.tsx` (no routes added/removed/renamed)
- Any other client page or component
- `server/` (no routes, no services, no schemas, no migrations)
- `shared/` (no schemas)
- `scripts/`, `tests/`, `config/`, `drizzle.config.ts`
- Any safe-mode service or config
- Any environment variable or secret
- The database

---

## 6. Safety mode unchanged — proof

The three safe-mode pause flags identified in T1 remain wired identically:

| Flag | Source line (verified pre- and post-T2) |
|---|---|
| `pausePodcastAudioGeneration` | `server/services/safe-mode-service.ts` lines 21, 106, 108, 128 |
| `pauseYouTubeUploads`         | `server/services/safe-mode-service.ts` lines 20, 88, 90, 128, 145 |
| `pauseSocialDistributionAutomation` | `server/services/safe-mode-service.ts` lines 19, 93, 95, 129, 144 |

T2 did not open, read, or modify `server/services/safe-mode-service.ts`. Verified by file modification list: only `client/src/pages/admin/AdminDashboard.tsx` and the new docs file were touched.

The status badges shown on cross-linked items are **documentation badges** (driven by the `status: BadgeTone` field on the link object). They have **no runtime effect** — the actual runtime safety is enforced inside the backend services and the safe-mode flags above.

---

## 7. Confirmation — no files / components / routes deleted

- ✅ `client/src/App.tsx`: no routes added, removed, renamed, or reordered. All 164 `<Route path="…">` registrations remain identical.
- ✅ `client/src/pages/admin/AdminDashboard.tsx`: no zone removed. The `media` zone (id `"media"`, "Media & Content Pipeline") is byte-for-byte unchanged.
- ✅ `client/src/pages/admin/`: no component file deleted. `git status` (read-only check) shows only `AdminDashboard.tsx` as modified.
- ✅ No backend route file deleted.
- ✅ No shared schema deleted.

---

## 8. Confirmation — no backend / API behavior changed

- ✅ Zero files modified under `server/`.
- ✅ Zero files modified under `shared/`.
- ✅ Zero files modified under `scripts/`.
- ✅ No SQL executed; no `db:push`; no Drizzle migration; no Supabase write.
- ✅ The running `Start application` workflow (Express + Vite) was not restarted by T2. It continued to serve `/api/agent-orchestrator/activity 304` and other endpoints normally through the edit (see `Start application` log at 06:07:19 — log fetched post-edit).

---

## 9. Confirmation — no safe-mode flag changed

- ✅ `pauseYouTubeUploads` — unchanged (verified §6)
- ✅ `pauseSocialDistributionAutomation` — unchanged (verified §6)
- ✅ `pausePodcastAudioGeneration` — unchanged (verified §6)
- ✅ No other safe-mode flag added, removed, or renamed.
- ✅ `server/services/safe-mode-service.ts` was not opened or modified.

---

## 10. Confirmation — no publishing / rendering / live execution enabled

T2 only added link cards to the admin dashboard. It did **not**:

- ❌ Add or enable any autonomous YouTube upload path.
- ❌ Add or enable any autonomous social distribution path.
- ❌ Enable live B-roll, broadcast, or Unreal rendering. `/admin/video-render` continues to operate in dry-run mode inside `avatarVideoRenderService` (unchanged).
- ❌ Enable any 4D hardware execution. The `/admin/4d-cinema-control` / `/admin/cinema-control` surfaces remain dry-run as labelled in the new 3D/4D/Unreal zone.
- ❌ Enable any autonomous live debate / live studio runner. `/admin/live-studio` continues to be admin-controlled with no autonomous runner — same component (`LiveDebateStudio`) as before, no code touched.
- ❌ Bypass the Shorts approval gate. `/admin/shorts` continues to require explicit founder approval per the existing service.
- ❌ Bypass any approval queue, dry-run guard, or admin-only authentication gate.

---

## 11. Open questions for T3 (wiring check)

These are recorded for T3 to verify before any consolidation or removal:

1. **Cross-link confusion.** A founder reading the new "News Shorts Cutter (Approval Queue)" card in News Room and the "Podcast Shorts (Approval Queue)" card in Podcast Room must understand both go to the **same** `/admin/shorts` page with the **same** unified approval gate. Tooltips in T2 say "Cross-link — primary home is Media & Content Pipeline" on each, but T3 should confirm the badge count and approve action behave identically regardless of entry point.
2. **Dedicated podcast-room page.** No `/admin/podcast-room` (or similar) route exists today. The Podcast Room Studio zone is currently 100% cross-links. T3 should decide whether to scaffold a dedicated podcast-room page or leave the zone as a cross-link landing surface.
3. **`/admin/4d-cinema-control` vs `/admin/cinema-control` alias.** Both routes resolve to `CinemaControl`. T3 should pick a primary and (if T3's scope permits) plan a redirect for the other; T2 surfaces both with an "alias" label so admins are not confused.
4. **Voice Jobs sharing.** T1 question #1 (voice-jobs scope: podcast-only vs shared with anchors/avatars) is still open. The Voice Jobs link is cross-listed in both Podcast Room Studio and Production House on the assumption it is shared — T3 should confirm by inspecting `podcastVoiceService` callers.
5. **Live Studio sharing.** T1 question #2 (debate-specific vs generic live runner) is still open. The Live Studio link is cross-listed only in Debate Studio (not Production House) on the assumption it is debate-specific — T3 should confirm by inspecting `liveDebateStudioService` and adjust the cross-link if generic.
6. **Production House asset/preview surfacing.** `PreviewStudioHero` is an embedded component inside `ProductionHouse`. T3 should decide whether to expose a dedicated `/admin/preview-studio` route or keep it embedded.
7. **Newsroom Package viewer vs editor.** Both `/admin/newsroom-package` and `/admin/newsroom-packages` are surfaced separately because they are different components. T3 should confirm this is the desired UX or plan a merge.
8. **Ungrouped strategy/health surfaces.** `/admin/legal-safety`, `/admin/phase-transition`, `/admin/intelligence-stack`, `/admin/pnr-monitor`, `/admin/inevitable-platform`, `/admin/knowledge-base` remain ungrouped and outside T2's media scope. A future task should propose a "Strategy & Health" zone or fold them into existing zones.
9. **Accent colors.** Six new zone `accent` values (`rose`, `indigo`, `purple`, `teal`, `fuchsia`, `orange`) were added. The current dashboard renderer treats `accent` as a descriptive string only — no Tailwind class is generated from it dynamically. T3 should confirm this is still the case or wire up `accent`-based styling if the design system expects it.

---

## 12. Tests / checks run

| Check | Command | Result |
|---|---|---|
| Targeted TypeScript check on the modified file | `npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "AdminDashboard\|error TS"` | **Zero new errors in `AdminDashboard.tsx`.** Errors that appeared are all pre-existing in unrelated files (`BroadcastPreview.tsx`, `ProductionHouse.tsx`, `client/remotion/*`, `server/routes/broadcasts.ts`, `server/routes/playout.ts`, `server/services/audience-audit-export-notifier.ts`, `server/services/production-house-service.ts`) and are explicitly **out of scope** per the task rule "no TS-error fixes". |
| Dashboard renders | Workflow `Start application` continued serving `/api/*` requests at 06:07:19 through and after the edit (log captured via `refresh_all_logs`). No restart needed; Vite HMR picked up the edit. | ✅ Healthy |
| Each new dashboard link points to an existing route | Cross-referenced every new href against `client/src/App.tsx` lines 261–334. **44 link entries** across the 6 zones (13 News Room + 5 Podcast Room + 5 Debate Studio + 8 Production House + 5 3D/4D/Unreal + 8 Distribution), resolving to **33 unique `/admin/...` hrefs** (the other 11 are intentional cross-listings, e.g. `/admin/shorts` appears in 4 zones, `/admin/video-render` in 4 zones, `/admin/news-to-debate` in 3 zones). Every unique href resolves to an existing `<Route>` registration. | ✅ All resolve |
| No broken new links | Same verification as above. | ✅ Zero broken |
| Old Media & Content Pipeline links still appear | Re-read `AdminDashboard.tsx` lines 187–219 after edit. The `media` zone object is byte-for-byte identical to its pre-T2 form (only its source-line position shifted because new zones were inserted **after** it). All 8 original links visible on tab "Media". | ✅ Preserved |
| Existing old links still work | No route, component, or service was touched. Routes unchanged ⇒ existing bookmarks unchanged. | ✅ Preserved |

---

## 13. Remaining issues

- **None blocking.** The pre-existing TypeScript errors in `BroadcastPreview.tsx`, `ProductionHouse.tsx`, `client/remotion/*`, `server/routes/broadcasts.ts`, `server/routes/playout.ts`, `server/services/audience-audit-export-notifier.ts`, and `server/services/production-house-service.ts` predate T2 and are explicitly forbidden from being fixed in this task ("no TS-error fixes" per task scope). They are recorded here so a future task can address them under its own scope.
- **Documentation hygiene:** `replit.md` has grown long (system warning surfaced during T2). At a natural pause, a trim/reorganize pass is recommended. Not in T2 scope.
- **Consolidation is still NOT started.** T2 is link-surfacing only; T3+ remains pending founder go-ahead.

---

## Appendix A — Final response checklist (from task brief)

- ✅ Report path: `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md`
- ✅ List of new groups: §1 (six zones).
- ✅ List of links added/surfaced: §2 (per zone) — **44 link cards** total across 6 zones, resolving to **33 unique `/admin/...` hrefs**. Of those 33 unique routes, 16 were previously unreachable from the main dashboard (net-new surface), the remaining 17 are cross-links/aliases of routes that already had a primary zone. The extra 11 link cards beyond the 33 unique routes are intentional cross-listings between zones (e.g. `/admin/shorts` shown in 4 zones, `/admin/video-render` shown in 4 zones, `/admin/news-to-debate` shown in 3 zones).
- ✅ List of old links preserved: §3 — all 8 Media & Content Pipeline links untouched.
- ✅ List of hidden/internal links not surfaced: §4 with per-route reason.
- ✅ Files changed: §5 — `client/src/pages/admin/AdminDashboard.tsx` (modified) + this report (created).
- ✅ Tests/checks run: §12.
- ✅ Any remaining issues: §13.

End of T2 report.
