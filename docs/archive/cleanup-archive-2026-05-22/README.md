# Cleanup Archive — 2026-05-22

**Created by:** C2 — Archive approved cleanup candidates (audit ref: `docs/reports/CLEANUP_ARCHIVE_CANDIDATE_AUDIT_C1.md`)
**Approved sets:** A (workspace-auto-save Pasted-*.txt files) + B (5 superseded CODEX_* reports)
**Not in scope:** Set C (`CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md`) — classified `DEPRECATE_BUT_KEEP`; remains in `docs/reports/` untouched.

This directory holds files moved out of active locations for archival reference. **Nothing was permanently deleted.** Every file below is recoverable via the rollback procedure in §4.

---

## 1. Contents

### 1.1 `attached_assets-sessions-2026-05/` — 126 files (Set A)

Workspace-auto-saved copies of user task briefs from prior sessions (May 2026). Replit automatically writes each pasted user message into `attached_assets/Pasted-<slug>_<unix-millis>.txt`. These accumulated to 126 files by 2026-05-22 and were inert (not imported by source, not referenced by tests, not linked from docs).

- **Original location:** `attached_assets/Pasted-*.txt`
- **Archived location:** `docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/Pasted-*.txt`
- **Filename preservation:** each original filename (including the trailing `_<unix-millis>.txt` timestamp) is kept verbatim. The unix-millis suffix in the filename serves as the path-metadata record of original creation time.
- **C1 classification:** `ARCHIVE_CANDIDATE` (LOW risk)
- **Why archived:** workspace-clutter reduction. `git status` was showing 126 untracked / modified Pasted-* entries on most operations.
- **Why not deleted:** they are the only persistent record of past task prompts; the user may want to reference them.

### 1.2 `codex-phase-1-2026-05/` — 5 files (Set B)

Five `CODEX_*` reports from the May 15–17, 2026 phase-1 work that were explicitly superseded by the T1–T5 News / Podcast / Video / Production admin consolidation series (May 22, 2026).

| Archived file | Superseded by |
|---|---|
| `CODEX_GO_LIVE_BLOCKER_AUDIT.md` | `NEWS_PODCAST_VIDEO_ADMIN_CONSOLIDATION_AUDIT.md` (T1) |
| `CODEX_GO_LIVE_BLOCKER_AUDIT_MEDIA_PIPELINE.md` | T1 + `NEWS_PODCAST_VIDEO_ADMIN_T5_SMOKE_E2E_REPORT.md` (T5) |
| `CODEX_GO_LIVE_BLOCKER_POST_FIX_AUDIT.md` | T5 |
| `CODEX_PHASE_1A_E2E_TEST_REPORT.md` | T5 |
| `CODEX_PHASE_1B_E2E_VERIFIED_NEWSROOM_REPORT.md` | T5 |

- **Original location:** `docs/reports/<filename>`
- **Archived location:** `docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/<filename>`
- **C1 classification:** `ARCHIVE_CANDIDATE` (LOW risk)
- **Why archived:** the consolidation series replaced them; keeping them in `docs/reports/` invited future readers to use outdated procedures.
- **Why not deleted:** historical record of the phase-1 audit findings; useful if anyone needs to trace why a particular design decision was made before T1.

---

## 2. CODEX_* reports kept in `docs/reports/` (NOT archived)

These 13 `CODEX_*` reports remain in `docs/reports/` because they are still load-bearing (current systems reference them or rely on the contracts they document):

- `CODEX_MOUGLE_4D_CINEMA_CONTROL_MVP_REPORT.md` — 4D dry-run reference (active)
- `CODEX_MOUGLE_AI_PRODUCTION_HOUSE_REPORT.md` — Production House origin doc (active)
- `CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md` — **Set C: DEPRECATE_BUT_KEEP**, superseded by `NEURAL_NEWSROOM_AUTOMATION_AND_SCREEN_DIRECTOR_REPORT.md` but still referenced from at least one inline comment; left untouched per C2 user instructions
- `CODEX_PHASE_1A_RENDER_PIPELINE_AUDIT.md` — render pipeline still in use
- `CODEX_PHASE_1B_CLUSTERING_CLAIMS_REPORT.md` — clustering/claims still in use
- `CODEX_PHASE_1B_NEWSROOM_DATA_PACKAGE_REPORT.md` — newsroom data package builder still in use
- `CODEX_PHASE_1B_NEWSROOM_PACKAGE_BUILDER_REPORT.md` — active
- `CODEX_PHASE_1B_PERSISTENT_STORAGE_READINESS_REPORT.md` — persistent storage still in use
- `CODEX_PHASE_1B_RENDER_MANIFEST_REPORT.md` — active
- `CODEX_PHASE_1B_SCHEMA_CONTRACTS_REPORT.md` — schema contracts still in use
- `CODEX_REAL_UNREAL_RENDER_PREVIEW_CONTRACT_REPORT.md` — Unreal dry-run contract still respected
- `CODEX_REAL_UNREAL_SET_LIGHTING_DRY_RUN_REPORT.md` — active dry-run reference
- `CODEX_REAL_UNREAL_SET_PANELS_DRY_RUN_REPORT.md` — active dry-run reference

---

## 3. Compatibility wrappers / stubs left in place

**None required.**

- **Set A (Pasted-*.txt):** no source code, test, or doc imports/references these files. Verified by `rg "attached_assets/Pasted" client/ server/ shared/ tests/ docs/reports/ replit.md` returning zero hits at C2 execution time. **No wrapper needed.**
- **Set B (5 CODEX_* reports):** the only incoming reference is the C1 audit report itself (`docs/reports/CLEANUP_ARCHIVE_CANDIDATE_AUDIT_C1.md`), which has been updated in-place to point at the new archive paths. **No wrapper needed.**

---

## 4. Rollback instructions

### 4.1 Roll back Set A (restore Pasted-*.txt files to `attached_assets/`)
```bash
mv docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/Pasted*.txt attached_assets/
rmdir docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05
```

### 4.2 Roll back Set B (restore 5 CODEX_* reports to `docs/reports/`)
```bash
mv docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_*.md docs/reports/
rmdir docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05
```

### 4.3 Roll back the entire C2 archive
```bash
mv docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/Pasted*.txt attached_assets/
mv docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_*.md docs/reports/
rm -rf docs/archive/cleanup-archive-2026-05-22
```

### 4.4 Git-based rollback (cleanest)
The C2 archive was committed by the platform after this task. To restore the pre-C2 layout:
```bash
git log --oneline -- attached_assets/ docs/reports/ docs/archive/cleanup-archive-2026-05-22/
# Identify the commit immediately BEFORE the C2 archive commit, then:
git checkout <pre-c2-commit> -- attached_assets/ docs/reports/
rm -rf docs/archive/cleanup-archive-2026-05-22
```

---

## 5. Safety invariants honored during C2

- ✅ Zero source code modified (no `client/`, `server/`, `shared/`, `tests/` file touched)
- ✅ Zero routes modified
- ✅ Zero schemas modified
- ✅ Zero migrations run
- ✅ Zero active dashboard routes touched
- ✅ Zero items on the C1 §C never-remove list affected (auth, CSRF, root-admin gates, safe-mode, approval gates, dry-run guards, publishing approval, copyright/legal, audit logs, retention/snooze/notifier history, verified newsroom data, podcast/debate reference storage, production package storage, migration scripts)
- ✅ Zero permanent deletion — every archived file is recoverable via §4
- ✅ Set C (`CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md`) explicitly left untouched per user instruction
- ✅ Non-Pasted entries inside `attached_assets/` (9 files: 2 `changed-files_*.txt`, 2 `content-*.md`, 5 image files) intact at original paths
