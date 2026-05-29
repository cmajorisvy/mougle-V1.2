# News / Podcast / Video Admin Consolidation Audit — T1 (Audit-Only)

**Date:** 2026-05-22
**Scope:** T1 inventory pass — read-only. **No** files moved, renamed, deleted, or refactored. No routes added, no aliases created. This document is the input artifact that T2+ will work from.
**Source commit:** `3c25e1cc8afd943dc679bffdb91064bbccb38c70` (HEAD at audit time)
**Author:** Replit agent (main, Build mode)

---

## 1. Purpose

Before any consolidation toward the new admin structure (News Room Studio, Podcast Room Studio, Debate Studio, Production House, 3D/4D/Unreal, Distribution), inventory the **existing** "Media & Content Pipeline" admin grouping so nothing is silently dropped, renamed, or unlinked. Per the T1 scope:

> Do not delete, rename, or replace these blindly.
> Treat "Media & Content Pipeline" as an existing admin grouping that must be inventoried and mapped into the new dashboard structure.

This audit fulfills that requirement and **does not** modify any source file other than itself.

---

## 2. "Media & Content Pipeline" — As It Exists Today

### 2.1 Section definition (source of truth)

The grouping is declared in **`client/src/pages/admin/AdminDashboard.tsx` lines 186–203** as the `media` zone object inside the `zones` array:

```ts
{
  id: "media",
  title: "Media & Content Pipeline",
  shortLabel: "Media",
  description: "News, debate, podcast, video, YouTube, and social packages.",
  icon: Film,
  accent: "pink",
  links: [ /* 8 link objects, see §2.2 */ ],
}
```

- The dashboard renders zones via the `ZoneTabs` component (sticky horizontal tab bar at top), so the section is reachable by clicking the **"Media"** tab as well as by viewing the **"All"** tab.
- The `status` field on each link drives the small status pill ("manual", "dryRun", "admin", etc.) shown on every link card. These are documentation-only; they do not gate runtime behavior — runtime safety lives in the backend services and the safe-mode flags (see §3).

### 2.2 Inventory of the 8 items

All routes verified against `client/src/App.tsx` (lines 227, 272, 308–313, 319). All backend service / safe-mode references verified against `server/services/safe-mode-service.ts`.

| # | Display Label | Route (frontend) | Component / Page File | Backend services + API prefixes | Current safety mode | Safe-mode kill-switch flag |
|---|---|---|---|---|---|---|
| 1 | News to Debate | `/admin/news-to-debate` | `client/src/pages/admin/NewsToDebate.tsx` | `server/services/newsToDebateService.*`<br/>`/api/admin/news-to-debate/*` | **Manual / Approval-only** — "Draft/internal topic packages for root-admin review." | _(none specific; gated by root-admin auth)_ |
| 2 | Podcast Scripts | `/admin/podcast-scripts` | `client/src/pages/admin/PodcastScripts.tsx` | `server/services/podcastScriptEngine.*`<br/>`/api/admin/podcast-scripts/*` | **Manual / Internal-only** — "Internal script packages; not public publishing." | _(none specific; gated by root-admin auth)_ |
| 3 | Voice Jobs | `/admin/voice-jobs` | `client/src/pages/admin/VoiceJobs.tsx` | `server/services/podcastVoiceService.*`<br/>`/api/admin/voice-jobs/*` | **Manual** — "Manual audio generation jobs and mock fallback review." | `pausePodcastAudioGeneration` (capability `podcast_audio_generation`, line 106) |
| 4 | Video Render | `/admin/video-render` | `client/src/pages/admin/VideoRender.tsx` | `server/services/avatarVideoRenderService.*`<br/>`/api/admin/video-render/*` | **Dry-run** — "Avatar/video render planning only; no live provider calls." | _(none specific; dry-run is enforced inside the service)_ |
| 5 | Shorts Approval Queue | `/admin/shorts` | `client/src/pages/admin/ShortsReview.tsx` | `server/services/shortsCutterService.*`<br/>`server/routes/shorts.ts`<br/>`/api/admin/shorts/*` | **Approval-only** — "Draft shorts wait here until a root admin approves them." Pending count surfaces in the dashboard Priority Queue. | _(none specific; explicit approve action required per shortItem)_ |
| 6 | YouTube Publishing | `/admin/youtube-publishing` | `client/src/pages/admin/YouTubePublishing.tsx` | `server/services/youtubePublishingService.*`<br/>`/api/admin/youtube-publishing/*` | **Approval-only** — "Manual approval packages; no autonomous upload." | `pauseYouTubeUploads` (capability `youtube_upload`, line 88) |
| 7 | Social Distribution | `/admin/social-distribution` | `client/src/pages/admin/SocialDistribution.tsx` | `server/services/socialDistributionApprovalService.*`<br/>`/api/admin/social-distribution/*` | **Manual / Export-first** — "Manual/export-first distribution packages." | `pauseSocialDistributionAutomation` (line 93) |
| 8 | Live Studio | `/admin/live-studio` | `client/src/pages/admin/LiveDebateStudio.tsx`<br/>(public counterpart: `/live-studio/:id` → `LiveStudio` component, App.tsx line 227) | `server/services/liveDebateStudioService.*`<br/>`/api/admin/live-studio/*` | **Admin-controlled** — "Admin-controlled debate studio; no autonomous live runner." | _(none specific; admin-only routes + no autonomous runner)_ |

### 2.3 Existing cross-references

- The Production House console (`client/src/pages/admin/ProductionHouse.tsx`) already references parts of the media pipeline as a supplementary view for production status. Any consolidation must preserve those cross-links.
- The dashboard's **Priority Queue** (defined in `AdminDashboard.tsx` around line 108) surfaces **Shorts Approval Queue** pending counts when above threshold. This cross-reference must continue to work no matter where Shorts ends up.
- No other admin zone currently lists these 8 items as primary entries.

---

## 3. Backend safety posture (summary)

- **`server/services/safe-mode-service.ts`** declares the platform-wide pause flags `pauseSocialDistributionAutomation`, `pauseYouTubeUploads`, and `pausePodcastAudioGeneration` (lines 19–21). They are evaluated per outbound capability (lines 88–108) and short-circuit the corresponding service call with an audited skip.
- **No item** in the Media & Content Pipeline currently performs autonomous outbound traffic without either (a) explicit admin approval, (b) a dry-run guard, or (c) a safe-mode pause flag. **This posture must be preserved by any consolidation.**
- **Video Render** is dry-run-only inside the service layer (no live provider calls). Consolidation must not introduce a live render path as a side effect of moving the link card.
- **Audience-facing send paths** (YouTube uploads, Social Distribution, Podcast audio generation) are simultaneously gated by their service code AND by the safe-mode pause flags above. The consolidation must keep both layers intact when items move into new groupings.

---

## 4. Legacy / Existing Admin Labels Mapping

This is the canonical table required by T1. Columns are exactly as specified in the T1 scope brief. **No values in this table cause any code change** — they are proposals only, to be acted on by T2+.

| Old Label              | Current Route               | Current File                                              | Current Mode    | Proposed New Group                              | Keep Old Link? | Compatibility Alias Needed?                    | Risk                                                                                              | Notes |
|------------------------|-----------------------------|-----------------------------------------------------------|-----------------|-------------------------------------------------|----------------|------------------------------------------------|---------------------------------------------------------------------------------------------------|-------|
| News to Debate         | `/admin/news-to-debate`     | `client/src/pages/admin/NewsToDebate.tsx`                 | Manual / Approval-only | **Debate Studio** (primary); cross-link from **News Room Studio** | **Yes**        | **No** (route stays as-is)                     | Low. Pure draft-package workflow; no outbound side effects.                                       | Classification: **KEEP_ACTIVE or MOVE_TO_DEBATE_GROUP**. Do not delete. Cross-link required because the upstream trigger is a news article. |
| Podcast Scripts        | `/admin/podcast-scripts`    | `client/src/pages/admin/PodcastScripts.tsx`               | Manual / Internal-only | **Podcast Room Studio**                         | **Yes**        | **No** (route stays as-is)                     | Low. Internal-only; no public publishing.                                                         | Classification: **KEEP_ACTIVE or MOVE_TO_PODCAST_ROOM_GROUP**. **Do not merge into News Room** even though both involve "scripts". |
| Voice Jobs             | `/admin/voice-jobs`         | `client/src/pages/admin/VoiceJobs.tsx`                    | Manual          | **Podcast Room Studio** + **Production House** (shared, if used by avatars / news anchors) | **Yes**        | **No** (route stays as-is)                     | Medium. Backed by `pausePodcastAudioGeneration` safe-mode flag — must remain wired. Clarify in T2 whether voice jobs are podcast-only or genuinely shared. | Classification: **KEEP_SHARED**. T2 must answer: are non-podcast (e.g. anchor / avatar) consumers calling `podcastVoiceService` today, or only podcast scripts? |
| Video Render           | `/admin/video-render`       | `client/src/pages/admin/VideoRender.tsx`                  | **Dry-run**     | **Production House** (primary) or **3D/4D/Unreal** (if extended) | **Yes**        | **No** (route stays as-is)                     | **High** if the dry-run guard is weakened. Currently safe because the service refuses live provider calls. | Classification: **KEEP_SHARED**. **Must remain dry-run** unless an explicit approval / render-pipeline gate is added. **Do not enable live provider calls** as a side effect of the move. |
| Shorts Approval Queue  | `/admin/shorts`             | `client/src/pages/admin/ShortsReview.tsx`                 | Approval-only   | **Distribution** (primary); cross-link from **News Room Studio**, **Podcast Room Studio**, **Debate Studio** (each can generate clips) | **Yes**        | **No** (route stays as-is)                     | Medium. Approval gate must not be bypassed. Priority Queue badge dependency must keep working.    | Classification: **KEEP_ACTIVE or MOVE_TO_DISTRIBUTION_GROUP**. **Do not bypass approval.** Cross-links required because three different upstream studios produce shorts. |
| YouTube Publishing     | `/admin/youtube-publishing` | `client/src/pages/admin/YouTubePublishing.tsx`            | Approval-only   | **Distribution**                                 | **Yes**        | **No** (route stays as-is)                     | **High** if `pauseYouTubeUploads` is bypassed or the approval gate is weakened.                   | Classification: **KEEP_ACTIVE**. **Must remain manual approval only. No autonomous upload.** |
| Social Distribution    | `/admin/social-distribution`| `client/src/pages/admin/SocialDistribution.tsx`           | Manual / Export-first | **Distribution**                                 | **Yes**        | **No** (route stays as-is)                     | **High** if `pauseSocialDistributionAutomation` is bypassed.                                      | Classification: **KEEP_ACTIVE**. **Manual / export-first distribution packages only.** |
| Live Studio            | `/admin/live-studio` (admin); `/live-studio/:id` (public) | `client/src/pages/admin/LiveDebateStudio.tsx`; `LiveStudio` (public) | Admin-controlled | **Debate Studio** (primary) or **Production House** (if the live runner is reused for non-debate live formats) | **Yes**        | **No** (route stays as-is)                     | Medium. The public `/live-studio/:id` route is a hard dependency for anyone with an existing share link — must not be changed. | Classification: **KEEP_ACTIVE**. **Must remain admin-controlled. No autonomous live runner.** Final placement (Debate vs Production House) is a T2 decision based on whether the live runner is debate-specific or generic. |

**Summary of mapping decisions:**

- **All 8 items keep their existing routes and existing files.** No moves, no renames in T1; and the proposal is that T2 also preserves the routes so no compatibility aliases are required.
- **All 8 items keep their "old" labels visible to admins.** The "Media & Content Pipeline" section itself **must not be removed** in T1 (per scope). The proposal for T2 is that the section remains as a **compatibility/legacy view** while the new groupings are added alongside it, until founder explicitly approves removal.
- **Highest-risk items** if consolidation is rushed: **YouTube Publishing**, **Social Distribution**, **Video Render** — these have outbound or compute side-effects gated by either safe-mode flags or dry-run guards. Any T2/T3 work touching them needs explicit verification that both the service-level gate and the platform-level safe-mode flag remain wired after the move.

---

## 5. Open questions for T2

These are **not** answered in T1 (audit-only). T2 must resolve them before any link-cards are moved:

1. **Voice Jobs scope**: are there current non-podcast consumers (anchor / avatar / news pipeline) calling `podcastVoiceService` directly? If yes, the link belongs in shared **Production House** with a cross-link from **Podcast Room Studio**. If no, it belongs in **Podcast Room Studio** only.
2. **Live Studio scope**: is the live runner debate-specific or generic? If debate-specific → **Debate Studio**. If generic enough to host any live format (panel, interview, etc.) → **Production House** with a debate-specific cross-link.
3. **Video Render destination**: **Production House** (current home of avatar/render planning) vs **3D/4D/Unreal** (if the new 3D pipeline subsumes 2D avatar rendering). Decide once the 3D/4D/Unreal group's scope is fixed.
4. **Compatibility aliases**: T1 proposes "no aliases needed" because routes don't change. If T2 decides any route DOES change, a 301/redirect or wouter-level alias **must** be added for every changed route, and bookmarked admin links must be tested.
5. **Priority Queue dependency**: the Shorts pending-count badge currently lives in the Media zone. When Shorts moves to Distribution, T2 must confirm the badge follows it AND that no other zone is accidentally double-counting it.

---

## 6. T1 constraints honoured

- [x] No files deleted, moved, renamed, or refactored.
- [x] The `media` zone in `client/src/pages/admin/AdminDashboard.tsx` is left intact (lines 186–203 unchanged).
- [x] All 8 routes in `client/src/App.tsx` are left intact.
- [x] No backend service file is modified.
- [x] No safe-mode flag, dry-run guard, or approval gate is altered.
- [x] No new admin zone is introduced.
- [x] No database migration, no `db:push`, no SQL executed.
- [x] No git push, no branch operation.
- [x] Only this file (`docs/reports/NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md`) was created/modified by T1.

---

## 7. Verification trail (evidence the audit is grounded in code, not assumed)

| Claim | Source verified |
|---|---|
| `media` zone exists at AdminDashboard.tsx lines 186–203 with the 8 links listed | Read `client/src/pages/admin/AdminDashboard.tsx` lines 180–219 |
| All 8 frontend routes are registered | `rg` on `client/src/App.tsx` → matches on lines 227, 272, 308–313, 319 |
| `pausePodcastAudioGeneration`, `pauseYouTubeUploads`, `pauseSocialDistributionAutomation` safe-mode flags exist | `rg` on `server/services/safe-mode-service.ts` → matches on lines 19–21, 88, 93, 106, 128, 129, 144–146 |
| `server/routes/shorts.ts` exists as the shorts backend route file | `ls server/routes/` → `shorts.ts` present |
| Status fields ("manual", "dryRun", etc.) and per-link descriptions | Read directly from AdminDashboard.tsx lines 194–201 |

End of T1 audit.
