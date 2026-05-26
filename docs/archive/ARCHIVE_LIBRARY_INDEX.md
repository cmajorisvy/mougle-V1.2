# Mougle Archive Library — Index

**Last updated:** 2026-05-22
**Maintainer:** root-admin / founder
**Scope:** documentation/indexing only — no source code, route, schema, migration, dashboard file, or runtime behavior is touched by this index.

---

## 1. Purpose

This is the **Archive Library** for Mougle. It is **not trash**. Every file under `docs/archive/` is preserved because it carries reusable signal: a prior design, prompt, function sketch, route idea, schema draft, audit report, prompt-engineering pattern, or piece of historical context that future agents may need.

The Archive Library exists so future Replit agents (and you) can **find existing work cheaply** before rebuilding it from scratch. Most "missing" features in Mougle have at least a partial precedent here. Searching the archive first saves real time and real cost.

---

## 2. ⚠️ Usage rule for future Replit agents (READ FIRST)

> **Before implementing any new feature in the following domains, you MUST first check this index AND skim the archived files it points to:**
>
> News Room · Podcast Room · Debate Studio · Production House · 3D / 4D / Unreal · R3F / WebGL · Unity · YouTube · Social Distribution · Shorts · Avatar pipeline · Safety / Approval gates · Audit / Retention / Snooze / Notifier history · Admin Dashboard · AI Operations console · AI worker layer · Newsroom automation · Schema design.
>
> **If a relevant prior design, prompt, function, route, or report exists, REUSE the idea or CITE it instead of rebuilding blindly.** State up front in your plan: "Archive search performed; found / did not find precedent at `<path>`."
>
> This rule is binding. Skipping the archive check wastes budget and risks reintroducing decisions that were already made (and sometimes already rejected) in earlier sessions.

---

## 3. Archive catalog

### 3.A Top-level archive root

| # | Archive Path | Original Location | Type | Topic | Status | Reuse Potential | Notes |
|---|---|---|---|---|---|---|---|
| 1 | `docs/archive/REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md` | `replit.md` (pre-H2 verbose task narrative) | task history (markdown, 6 sections) | Audience moderation retention sweeper · archive-deletion alert snooze (Tasks #474, #562) · audit-email failure-alert snooze history (Task #613) · audience audit-export notifier (Tasks #396, #425, #448) · omni-channel audience safety layer · neural newsroom automation + screen director | `historical_context` + `reusable_design` | **high** | The 6 sections document live, deployed features. `replit.md` already links to this file inline; cite it before designing similar features. |
| 2 | `docs/archive/cleanup-archive-2026-05-22/README.md` | (this is the manifest for the C2 archive set) | manifest | C2 archive manifest + rollback procedure for Sets A + B | `reference_only` | **medium** | Authoritative source for what was archived in C2 and how to roll back. |

### 3.B C2 cleanup archive group — `docs/archive/cleanup-archive-2026-05-22/`

#### 3.B.1 `attached_assets-sessions-2026-05/` — 126 workspace-auto-saved task briefs (Set A)

| # | Archive Path | Original Location | Type | Topic | Status | Reuse Potential | Notes |
|---|---|---|---|---|---|---|---|
| 3 | `docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/Pasted-*.txt` (× **126** files) | `attached_assets/Pasted-*.txt` (workspace auto-save) | reusable prompts + task briefs | See §4 for topic clusters | `reusable_prompt` + `historical_context` | **high** for many · **medium** for ops-monitoring repeats · **low** for one-off env-setup notes | These are verbatim prior user task briefs. Many were the original spec for features still in production. The trailing `_<unix-millis>.txt` in each filename is the original creation timestamp. |

#### 3.B.2 `codex-phase-1-2026-05/` — 5 superseded CODEX_* reports (Set B)

| # | Archive Path | Original Location | Type | Topic | Status | Reuse Potential | Notes |
|---|---|---|---|---|---|---|---|
| 4 | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_GO_LIVE_BLOCKER_AUDIT.md` | `docs/reports/CODEX_GO_LIVE_BLOCKER_AUDIT.md` | superseded audit | Go-live blockers before T1 | `superseded_report` | **medium** | Superseded by `NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md` (T1). Useful for understanding what was broken pre-T1. |
| 5 | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_GO_LIVE_BLOCKER_AUDIT_MEDIA_PIPELINE.md` | `docs/reports/CODEX_GO_LIVE_BLOCKER_AUDIT_MEDIA_PIPELINE.md` | superseded audit | Media pipeline blockers | `superseded_report` | **medium** | Superseded by T1 + the T2/T3/T4 series. |
| 6 | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_GO_LIVE_BLOCKER_POST_FIX_AUDIT.md` | `docs/reports/CODEX_GO_LIVE_BLOCKER_POST_FIX_AUDIT.md` | superseded audit | Post-fix verification of Codex blocker run | `superseded_report` | **low** | Snapshot in time; T5 smoke E2E supersedes verification value. |
| 7 | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_PHASE_1A_E2E_TEST_REPORT.md` | `docs/reports/CODEX_PHASE_1A_E2E_TEST_REPORT.md` | superseded E2E report | Phase 1A E2E test run | `superseded_report` | **low** | Superseded by `NEWS_PODCAST_VIDEO_ADMIN_T5_SMOKE_E2E_REPORT.md`. |
| 8 | `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_PHASE_1B_E2E_VERIFIED_NEWSROOM_REPORT.md` | `docs/reports/CODEX_PHASE_1B_E2E_VERIFIED_NEWSROOM_REPORT.md` | superseded E2E report | Phase 1B verified newsroom E2E | `superseded_report` | **medium** | Useful as a reference for prior verified-newsroom acceptance criteria. |

---

## 4. Topic clusters within Set A (126 Pasted-*.txt files) — search guide

Each Pasted-*.txt is a verbatim past user task brief. Filenames begin with the first ~50 characters of the original brief, which makes them keyword-searchable directly:

```bash
# Pattern:
ls docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/ | grep -i <keyword>

# Examples:
ls .../attached_assets-sessions-2026-05/ | grep -i unreal      # Unreal/Unreal Bridge briefs
ls .../attached_assets-sessions-2026-05/ | grep -i newsroom    # Newsroom/24-7/Neural newsroom briefs
ls .../attached_assets-sessions-2026-05/ | grep -i production  # Production House / Preview Studio briefs
```

### 4.1 Cluster map (filename-prefix → likely brief topic → typical reuse value)

| Cluster | Filename prefix patterns | Topic | Reuse |
|---|---|---|---|
| **Production House / 3D / 4D / Cinematic** | `Build-the-Mougle-4D-Cinema-Control-MVP*`, `Next-task-Upgrade-Mougle-AI-Production-House-into-a-3D-*`, `Next-task-Upgrade-Production-Preview-Screen-into-a-cine*`, `Implement-the-missing-Mougle-Production-Preview-Studio*`, `Next-task-Build-a-Sophisticated-Production-Preview-Stud*`, `Next-task-Add-Production-Approval-Board*`, `Next-task-Add-Production-Readiness-Scoring*`, `Next-task-Add-Guided-Production-Wizard-to-Mougle-3D-4D-*`, `Next-task-Add-persistent-storage-and-production-history*`, `Next-task-Build-Asset-Library-and-Production-Package-Vi*`, `Next-task-Connect-Production-Wizard-outputs-to-Readines*` | Production House evolution from single-page tool → 3D/4D pipeline + readiness scoring + approval board + wizard | **high** for R3–R10 R3F work |
| **Unreal Bridge / Real Unreal pipeline** | `Next-task-Add-Real-Unreal-*` (× ~12 files: Bridge-Configuration-and-Dry-Run, Health-Check, Command-Approval-Gate, Dry-Run-Package-Validation, Level-Load-Contract, Live-Command-Migration-Plan, Live-Command-Safety-Switch, Prepare-Scene-Dry-Run, Render-Preview-Contract, Set-Camera-Dry-Run, Set-Lighting-Dry-Run, Validate-Package), `Next-task-Add-Local-Unreal-Bridge-Stub-App*`, `Next-task-Add-Unreal-Local-Bridge-Specification-and-Bri*`, `Next-task-Add-Unreal-Sandbox-Bridge-to-Mougle-AI-Produc*`, `Continue-from-the-completed-Real-Unreal-Set-Camera-Dry-*`, `Continue-from-the-completed-Real-Unreal-Set-Lighting-Dr*` | The full dry-run-first Unreal integration design lineage — contract specs, sandbox bridge, command approval gates, validation gates, live-command safety switch | **high** for R8 (Unity sandbox) and any future Unreal work — these briefs already designed the safety gates |
| **Newsroom automation (24/7 / Neural / Autopilot)** | `Build-Mougle-24-7-Global-Cinematic-Newsroom-Architectur*`, `Build-Mougle-Autopilot-Newsroom-MVP-for-continuous-24-7*`, `Build-Mougle-Neural-Newsroom-Automation-Broadcast-Grade*`, `Proceed-with-Newsroom-T3-Broadcast-Brief-Builder-servic*` | Original specs for 24/7 newsroom, autopilot MVP, neural newsroom automation, broadcast-brief builder | **high** for any newsroom feature additions |
| **Hybrid Intelligence Network (HIN) extensions** | `Extend-Hybrid-Intelligence-Network-HIN-with-an-Agent-Ev*`, `…-Agent-Go*`, `…-Artifici*`, `…-a-Persisten*`, `Extend-the-Hybrid-Intelligence-Network-HIN-by-implement*`, `…with-a-Multi*`, `…with-a-Self-*` | HIN extension specs: agent evolution, agent goals, persistent agents, multi-agent, self-improvement | **high** for any AI-agent extension work |
| **AI Production House provider integrations** | `Next-task-Add-ElevenLabs-voice-generation*`, `Next-task-Add-Meshy-3D-Asset-Draft-Jobs*`, `Next-task-Add-Runway-AI-Video-B-roll-Draft-Jobs*`, `Next-task-Add-real-OpenAI-generation-to-Mougle-AI-Produ*` | Provider integration briefs (ElevenLabs, Meshy, Runway, OpenAI) into Production House — all DRAFT-job style with approval gates | **high** for any new provider integration |
| **4D Hardware Sandbox** | `Next-task-Add-4D-Hardware-Sandbox-Contract-and-Local-4D*` | 4D hardware sandbox contract (Spyder/Barco/Novastar mentions appeared in this lineage) | **high** for any 4D-hardware feature design — preserves the dry-run-only / no-direct-commands principle |
| **AI Operations console (worker layer, ops monitoring)** | `Now-add-AI-operations-summary-cards*`, `Now-add-AI-job-history-and-monitoring-views*`, `Now-add-AI-worker-health-and-operations-monitoring*`, `Now-add-CSV-export-for-Mougle-AI-ops-snapshots*`, `Now-add-a-CSV-exports-metric-tile*`, `Now-add-AI-operations-notification-nudges*`, `Now-add-pre-filtered-admin-deep-links-for-Mougle-AI-ope*`, `Now-add-local-per-admin-dismissal-for-AI-operations-not*`, `Now-add-retention-run-history-for-Mougle-AI-cleanup-ope*`, `Now-add-a-safe-retention-and-cleanup-policy*`, `Now-add-safe-admin-controls-for-Mougle-AI-jobs-retry-ca*`, `Now-add-audit-logging-for-Mougle-AI-job-lifecycle-event*`, `Now-add-audit-logging-for-Mougle-AI-ops-CSV-exports*`, `Now-add-daily-AI-operations-snapshots*`, `Now-add-frontend-UI-surfaces-for-the-Mougle-AI-job-work*`, `Now-embed-the-AI-operations-summary-into-the-existing-M*`, `Now-make-the-AI-Operations-hero-card-metrics-clickable*` | Full AI Operations console evolution — from summary cards → CSV export → retention → audit logging → clickable hero cards | **medium** — most are already shipped; useful as reference for next ops feature |
| **Python worker / cross-language integration** | `Modify-the-Mougle-project-architecture-to-add-Python-su*`, `Now-connect-the-first-internal-admin-Mougle-workflow-to*`, `Now-connect-the-first-real-Mougle-workflow-to-the-exist*`, `Now-connect-the-next-real-Mougle-workflow-to-the-existi*`, `Now-harden-AI-worker-identity-across-the-Mougle-worker-*`, `Now-implement-the-first-real-Mougle-AI-worker-handlers-*`, `Now-integrate-the-existing-Mougle-TypeScript-API-with-t*`, `Now-upgrade-the-Mougle-AI-job-system-from-the-temporary*`, `Now-wire-the-Python-worker-layer-to-consume-persisted-A*`, `PROJECT-CONTEXT-Build-a-production-ready-Python-backend*` | Python worker bringup, identity hardening, TS API integration | **medium** — only if reviving Python worker layer |
| **Omni-Channel Audience / YouTube Chat Safety** | `Replace-YouTube-Chat-Safety-Layer-with-Omni-Channel-Aud*`, `Task-728-Show-who-muted-the-audit-export-notifier-and-w*`, `Task-729-Make-the-audience-audit-test-suite-robust-to-D*`, `Please-verify-T613-before-approval-1-audience-audit-ema*`, `Please-verify-T608-before-approval-1-notifyLegacyTokenK*`, `Please-verify-T617-before-approval-1-RecycleBinAlertNot*`, `Please-verify-T620-before-approval-1-Founder-PTO-regist*`, `Please-verify-T703-before-approval-1-Defaults-trail-cap*` | Replacement of YouTube-only safety with omni-channel + verification briefs for individual tasks | **high** — these are the canonical specs for currently-live audience moderation features |
| **SEO / Content Safety / Anti-Spam** | `Implement-a-complete-SEO-Optimization-and-AI-Crawler-Co*`, `Implement-a-comprehensive-Content-Safety-Anti-Spam-and-*` | SEO crawler config + content safety + anti-spam original specs | **high** for those subsystems |
| **Broadcast view sharing / Admin UX** | `Let-admins-share-a-saved-broadcast-view-with-the-whole-*`, `Continue-from-the-completed-AiOpsHeroCard-clickable-met*`, `Show-admins-a-quick-view-of-what-is-currently-in-the-co*`, `Stop-admins-from-saving-a-feed-URL-that-failed-the-test*` | Saved-view sharing, admin UX clarifications | **medium** |
| **Retention / cover-file purge / cleanup** | `Implement-automatic-purge-of-old-swept-cover-files-from*` | Auto-purge of swept cover files | **medium** for retention sweeper changes |
| **Mermaid / architecture docs** | `Create-a-complete-Mermaid-architecture-flowchart-packag*` | Original spec for the Mermaid flowchart bundle (now `MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md`) | **high** for any new flowchart bundle |
| **Brand / homepage / UI** | `Perform-a-full-brand-migration-across-the-entire-projec*`, `Redesign-the-frontend-UI-to-create-a-modern-beautiful-h*`, `PROJECT-CONTEXT-We-are-building-the-homepage-for-Mougle*`, `PROJECT-Hybrid-Human-AI-Discussion-Platform-UI-Goal-Des*`, `PROJECT-NAME-Mougle-com-Collective-Intelligence-Innovat*` | Brand migration, homepage design, original platform UI specs | **high** for brand or homepage work |
| **Migration / Backup / Project sync** | `Create-a-downloadable-ZIP-package-for-only-the-Mougle-P*`, `Create-a-full-Mougle-site-backup-before-any-News-Room-P*`, `I-need-you-to-safely-sync-the-current-Replit-project-st*`, `You-are-performing-a-controlled-project-migration-I-hav*` (× 2) | Backup ZIP packaging, controlled migration scripts | **medium** — useful as a template if migration is needed again |
| **Cleanup / Audit / Verification series (recent)** | `Start-C1-Cleanup-and-archive-candidate-audit-only-Goal-*`, `Before-starting-T1-update-the-audit-scope-to-preserve-a*`, `Run-a-FULL-end-to-end-validation-pass-for-Mougle-after-*`, `T2-Surface-all-existing-News-Room-Media-Podcast-Debate-*`, `T3-Wiring-check-only-for-News-Podcast-Debate-Production*`, `Proceed-with-T4-only-Do-not-trim-replit-md-in-this-task*`, `Proceed-with-T5-dashboard-smoke-E2E-verification-only-D*`, `Perform-a-complete-End-to-End-E2E-functional-test-of-th*` | The T1–T5 + C1 task briefs themselves (the briefs that produced the current consolidation docs) | **high** as template for future audit-style tasks |
| **Founder / governance / follow-up scaffolding** | `What-problem-are-you-actually-solving-When-an-AI-agent-*`, `Yes-draft-the-follow-up-task-for-220-only-Task-title-En*`, `You-are-a-senior-AI-product-architect-and-automation-sy*`, `You-are-a-senior-graphics-engineer-and-full-stack-archi*`, `You-are-a-senior-real-time-graphics-engineer-virtual-pr*` | Architect-persona briefs, follow-up drafting prompts | **high** — reusable prompt patterns |
| **Original kickoff prompts** | `Build-a-full-stack-web-application-called-Hybrid-Intell*`, `Build-a-new-admin-dashboard-called-Mougle-AI-Production*` | The original full-stack-app and admin-dashboard kickoff prompts | **historical_context** + **high** for "what was the original spec" lookups |
| **One-offs / env / packaging notes** | `Here-is-how-to-set-DATABASE-URL-in-Replit-Step-1-Open-y*`, `Skip-to-content-Files-Commands-Packager-files-Config-fi*`, `Continue-from-the-completed-Codex-safe-go-live-blocker-*`, `Continue-from-the-completed-Phase-1B-clustering-claim-e*`, `Create-a-thin-Phase-1B-Implementation-Plan-based-on-the*`, `3-83-tests-pass-Finalizing-Task-complete-and-merged-Sum*` | DB URL setup, packager hints, continuation snippets | **low** |

---

## 5. Search keywords (use these to find prior work fast)

When you are asked to build / fix / extend any of the following, **grep this file first** and then `ls | grep` the Set-A archive folder:

```
newsroom, news room, 24/7 newsroom, autopilot newsroom, neural newsroom,
broadcast brief, broadcast preview, screen director,
podcast, podcast room, podcast studio,
debate, debate room, debate studio, debate-to-project,
production, production house, production package, production preview,
production readiness, production approval board, production wizard,
3D, 4D, cinematic, Unreal, Unreal Bridge, sandbox bridge,
R3F, react-three-fiber, drei, three.js, WebGL, Unity, GLB, GLTF, HDRI,
avatar, avatar rig, avatar studio, virtual set, lower third, ticker, channel bug,
ElevenLabs, Meshy, Runway, OpenAI, HeyGen, Remotion,
YouTube, social distribution, social hub, shorts, viral, BondScore,
approval, approval gate, dry-run, safe mode, panic button, safety switch,
audit, audit trail, audit export, retention, retention sweeper,
snooze, notifier, recycle bin, archive restore,
omni-channel audience, audience moderation, chat safety,
admin dashboard, founder dashboard, AI Operations, AiOpsHeroCard,
worker, AI worker, job, AI job, job history, CSV export,
schema, migration, drizzle, supabase, DATABASE_URL,
brand migration, homepage, redesign, mockup,
backup, project sync, ZIP package, migration script,
SEO, AI crawler, anti-spam, content safety,
Mermaid, flowchart, architecture diagram,
HIN, Hybrid Intelligence Network, agent goals, multi-agent, self-improvement,
persistent civilization, agent evolution,
T608, T613, T617, T620, T703, T1, T2, T3, T4, T5, C1, C2, R1, R2,
Codex, Phase 1A, Phase 1B, go-live blocker,
4D hardware, Spyder, Barco, Novastar
```

---

## 6. Restore policy (BINDING)

When considering whether to bring an archived item back into active code, **all of the following must be true**, AND a separate approved task must exist to perform the restore:

1. ❌ **Never restore archived code directly into active source without a fresh code review.** Even reusable_design items need re-validation against current architecture.
2. ❌ **Never restore old unsafe publishing / render / live behavior.** Specifically: anything that bypasses the dry-run-first principle, anything that calls a publishing provider without the approval gate, anything that enables real Unreal / 4D-hardware / Spyder-Barco-Novastar commands.
3. ❌ **Never restore old routes without checking `client/src/App.tsx` first.** Route shape may have changed; re-mounting an old route could shadow a current one.
4. ❌ **Never restore old schemas without a migration review.** `shared/schema.ts` is the source of truth; archived schema sketches must be re-validated for compatibility, indexes, and naming.
5. ❌ **Never restore old prompts that conflict with current safety gates.** Some early prompts predate the safety triangle / panic button / safe-mode framework.
6. ✅ **Always prefer current active code over archive** unless the archive contains a missing feature idea or a design rationale that current code lacks.
7. ✅ **Always cite the archive path** in the restore-task's plan ("reusing design from `docs/archive/cleanup-archive-2026-05-22/.../<file>`").
8. ✅ **Any restore is a separate approved task.** It cannot piggyback on a different task's scope.
9. ❌ **Never delete archived files** as part of restoring them. The archive must remain intact as a historical record.

Status definitions used in §3:

| Status | Meaning |
|---|---|
| `reference_only` | Read for context; do not import or transform into active code without a fresh design |
| `reusable_design` | Design ideas are reusable; copy concepts, not bytes, into a new fresh implementation |
| `reusable_prompt` | The original task brief may be re-issued to an agent, after re-validating it against current safety/architecture rules |
| `superseded_report` | A newer report replaces this; consult the newer report first, archived report only for historical "what did we know then" |
| `historical_context` | Useful to understand why current code looks the way it does; not a template |
| `do_not_restore_directly` | Hard block on direct restore; design ideas only after manual review |
| `needs_review_before_reuse` | Reuse only after a security/safety/legal review pass |

Reuse-potential definitions:

| Reuse | Meaning |
|---|---|
| **high** | Very likely to save real time on a near-term task; consult first |
| **medium** | Useful as a reference template; may save partial work |
| **low** | Probably only historical interest |
| **unknown** | Not yet evaluated; treat as `needs_review_before_reuse` |

---

## 7. Cost-saving instruction (for future agents)

When a requested function appears to be missing from the codebase:

1. **First** `grep` this index (`docs/archive/ARCHIVE_LIBRARY_INDEX.md`) for the topic keyword.
2. **Then** `ls docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/ | grep -i <keyword>` to find prior task briefs.
3. **Then** scan the relevant `docs/reports/` files (those are still active, not archived).
4. **Then** report findings in your plan: *"Archive search performed — found prior design at `<path>` / found prior prompt at `<path>` / no precedent found."*
5. **Only after** the above, propose new code.

This sequence routinely converts a 30-minute "rebuild from scratch" into a 5-minute "reuse + adapt."

---

## 8. Verification of this index

```bash
ls docs/archive/
# expected:
#   ARCHIVE_LIBRARY_INDEX.md             ← this file
#   REPLIT_TASK_HISTORY_ARCHIVE_2026-05-22.md
#   cleanup-archive-2026-05-22/

ls docs/archive/cleanup-archive-2026-05-22/
# expected:
#   README.md
#   attached_assets-sessions-2026-05/    ← 126 files
#   codex-phase-1-2026-05/               ← 5 files

grep -nE "Archive Library" replit.md
# expected: link to docs/archive/ARCHIVE_LIBRARY_INDEX.md
```

---

## 9. Confirmation — no behavior changed by this index

| Surface | Δ |
|---|---|
| Source code (`client/`, `server/`, `shared/`) | **none** |
| Routes (`server/routes/`, `server/routes.ts`, `client/src/App.tsx`) | **none** |
| Schemas (`shared/schema.ts`) | **none** |
| Migrations | **none** |
| Tests | **none** |
| Dashboard files | **none** |
| Workflows | **none** (no restart) |
| Archived files | **none moved or deleted** |
| `replit.md` | **+1 short instruction line** linking to this index (see §8 grep) |
| New files created | **1** — this index |

**Zero runtime behavior change. Zero archived file disturbance.**
