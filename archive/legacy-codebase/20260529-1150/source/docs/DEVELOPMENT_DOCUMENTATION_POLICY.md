# Mougle Development Documentation Policy

**Last updated:** 2026-05-22
**Status:** BINDING for every future task — planning, build, cleanup, audit, dependency, prompt, design.
**Maintainer:** root-admin / founder

---

## 1. Purpose

Every prompt, task, feature, development, audit, cleanup, design, bug fix, dependency install, schema change, dashboard change, safety change, and production change MUST leave a clear documentation trail under `docs/`. The goal: future agents can understand **what was asked, what changed, what was not changed, why decisions were made, what tests ran, and where to reuse old work** — without re-reading every conversation.

This policy reduces:
- **Duplicate work** (same feature designed twice from scratch)
- **Lost rationale** (decisions repeated and sometimes reversed)
- **Hidden behavior changes** (silent edits without a trail)
- **Wasted budget** (rebuilding what the archive already contains)

---

## 2. Required artifact for every task

For every future task, you MUST create or update at least one of:

| Location | Use for |
|---|---|
| `docs/reports/<TASK_OR_FEATURE_NAME>.md` | Implementation reports, audit reports, smoke/E2E reports, install reports |
| `docs/design/<FEATURE_DESIGN_NAME>.md` *(or `docs/architecture/...`)* | Design-only / planning-only documents |
| `docs/archive/<ARCHIVE_NAME>.md` | Archive manifests and indexes |
| `docs/runbooks/<RUNBOOK_NAME>.md` | Operational instructions, backup/restore steps, deployment, recovery |
| `docs/testing/<TEST_PLAN_NAME>.md` | Test plans, E2E plans, smoke-test checklists |
| `docs/prompts/<YYYY-MM-DD_topic_task>.md` | Final approved prompts and reusable task briefs (see `docs/prompts/README.md`) |
| `docs/library/INDEX.md` | Update when new artifact created (or re-run index sweep) |

If a task is large enough to span multiple categories, create multiple artifacts (e.g., a design doc + an implementation report + an updated runbook).

---

## 3. Required fields in every task document

Every task document MUST include the following 20 sections (use the labels as headings; mark "N/A" honestly where a section does not apply):

| Code | Heading |
|---|---|
| A | **Task title** |
| B | **Date** (ISO `YYYY-MM-DD`) |
| C | **Prompt / request summary** (paraphrase the founder's instruction) |
| D | **Goal** (1–3 sentences) |
| E | **Scope** (what is in this task) |
| F | **Explicit non-goals** (what is intentionally NOT done) |
| G | **Files changed** (paths + line-delta) |
| H | **Routes changed** (server/routes/*, server/routes.ts, client/src/App.tsx) |
| I | **Backend / service changes** (server/services/*) |
| J | **Schema / migration changes** (shared/schema.ts + migrations) |
| K | **Admin / dashboard changes** (client/src/pages/admin/*) |
| L | **Safety gates affected** (panic button, safe-mode, approval, dry-run, copyright/legal) |
| M | **Approval gates affected** (publishing, render, Unreal, 4D-hardware, provider calls) |
| N | **Tests / checks run** (test names, smoke flows, manual checks) |
| O | **Results** (pass/fail, metrics, before/after) |
| P | **Risks** |
| Q | **Rollback plan** (exact commands or steps) |
| R | **Follow-ups** (separate tasks proposed) |
| S | **Archive / library references checked** (see §5 — was the archive consulted first?) |
| T | **Confirmation whether source behavior changed** (yes/no + scope) |

---

## 4. Type-specific addenda

### 4.1 Planning-only tasks
Add at the top: **`Status: PLANNING ONLY — no code changed.`**
- Confirm zero file changes outside the doc itself.
- Include proposed future implementation phases (e.g., R2–R10 in the R1 design).

### 4.2 Implementation tasks
- §G must list **exact** files changed (not summaries).
- §N must list **actual** tests run with exit codes.
- §L+§M must declare safety/approval impact even if zero.
- §Q must contain a concrete rollback (commands, commit hash, or git checkout).

### 4.3 Cleanup / archive tasks
- Include source paths (from) and archive paths (to).
- Include reason for archive (per-item classification).
- Include restore command per item.
- Confirm no permanent deletion unless explicitly approved.
- Update `docs/archive/ARCHIVE_LIBRARY_INDEX.md` to catalog the new archive group.

### 4.4 Dependency tasks
- Include package versions selected and version ranges.
- Include peer-dependency result.
- Include `package-lock.json` line delta.
- Include `npm audit` delta (zero new critical / zero new high required).
- Include build/typecheck result (exit codes).
- Include uninstall/rollback command.

### 4.5 Prompt-only tasks
- Preserve the final approved prompt in `docs/prompts/YYYY-MM-DD_<topic>_<task>.md` (see `docs/prompts/README.md`).
- Include when/why to reuse it.
- Note any safety-gate or architecture assumptions the prompt depends on.

### 4.6 Safety / approval-gate tasks
- Must explicitly cite which of the never-remove items (per `CLEANUP_ARCHIVE_CANDIDATE_AUDIT_C1.md` §C) are touched.
- Must include a before/after gate-behavior comparison.
- Must be reviewed by founder before merge.

---

## 5. Archive-first cost rule

Before designing or implementing any new feature in these domains:

> News Room · Podcast Room · Debate Studio · Production House · 3D / 4D / Unreal · R3F / WebGL / Unity · YouTube · Social Distribution · Shorts · Avatar pipeline · Safety / Approval gates · Audit / Retention / Snooze / Notifier history · Admin Dashboard · AI Operations console · AI worker layer · Newsroom automation · Schema design

You MUST:

1. Open [`docs/archive/ARCHIVE_LIBRARY_INDEX.md`](archive/ARCHIVE_LIBRARY_INDEX.md) and grep for the topic keyword.
2. Open [`docs/library/INDEX.md`](library/INDEX.md) and search the current documentation library.
3. `ls docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/ | grep -i <keyword>` for prior task briefs.
4. State in your plan: *"Archive search performed; found / did not find precedent at `<path>`."*
5. Only then propose new code.

**Skipping the archive search wastes budget.** This step is required by §S of every task document.

---

## 6. Documentation library rule (binding)

Every future prompt / development MUST place or index its documentation under [`docs/library/`](library/) or one of its subfolders, **and** update [`docs/library/INDEX.md`](library/INDEX.md). The library is the central catalog of all reports, designs, prompts, runbooks, test plans, archives, PDFs, Word docs, text notes, Markdown, diagrams, backups, and external references.

A task that produces a document anywhere under `docs/**` must either:
- (a) place the document directly in the matching `docs/library/<subfolder>/` and update `docs/library/INDEX.md`; **or**
- (b) leave the document in its current canonical location (e.g., `docs/reports/...`) and add or update the corresponding row in `docs/library/INDEX.md` so the document is discoverable from the library index.

Both are acceptable; (b) is preferred for documents already referenced from `replit.md` or other docs, to avoid breaking links.

---

## 7. Naming conventions

| Artifact | Naming |
|---|---|
| Implementation report | `docs/reports/<UPPERCASE_TOPIC>_<TASK_OR_PHASE>_REPORT.md` |
| Design / architecture doc | `docs/architecture/<TOPIC>_DESIGN.md` or `docs/reports/<TOPIC>_R1_DESIGN.md` (when part of a numbered phase series) |
| Runbook | `docs/runbooks/<verb>-<subject>.md` (lowercase, kebab-case) |
| Test plan | `docs/testing/<topic>-test-plan.md` |
| Prompt | `docs/prompts/YYYY-MM-DD_<topic>_<task>.md` |
| Archive manifest | `docs/archive/<YYYY-MM-DD>_<topic>/README.md` |

Phase-series tasks (R1, R2, T1, T5, C1, C2, D1, etc.) MUST keep the phase code in the filename.

---

## 8. Hard never-list (carry-forward of safety rules)

A documentation task MUST NOT be used as cover for:

- ❌ Enabling real publishing / render / live / Unreal / 4D-hardware execution
- ❌ Bypassing approval gates, dry-run guards, or safe-mode
- ❌ Removing audit logs, retention/snooze history, or notifier records
- ❌ Removing auth / CSRF / root-admin gates
- ❌ Removing copyright / legal resolver code
- ❌ Restoring archived code without a separate approved task

If a documentation update would imply or require any of the above, **STOP** and ask the founder.

---

## 9. Existing tasks that already comply (reference)

| Task | Artifact | Compliance status |
|---|---|---|
| T1 – T5 (News/Podcast/Video/Production admin consolidation) | `docs/reports/NEWS_PODCAST_VIDEO_ADMIN_*` | ✅ |
| C1 (cleanup/archive audit) | `docs/reports/CLEANUP_ARCHIVE_CANDIDATE_AUDIT_C1.md` | ✅ |
| C2 (cleanup/archive execution) | `docs/archive/cleanup-archive-2026-05-22/README.md` + §J of C1 | ✅ |
| R1 (R3F / WebGL / Unity integration design) | `docs/reports/R3F_WEBGL_UNITY_PRODUCTION_HOUSE_INTEGRATION_R1_DESIGN.md` | ✅ |
| R2-plan (R3F dependency compatibility) | `docs/reports/R3F_DEPENDENCY_COMPATIBILITY_R2_REPORT.md` | ✅ |
| R2-install (R3F install execution) | `docs/reports/R3F_DEPENDENCY_INSTALL_R2_EXECUTION_REPORT.md` | ✅ |
| Archive Library Index | `docs/archive/ARCHIVE_LIBRARY_INDEX.md` | ✅ |

Use these as templates for the 20-field structure (§3).

---

## 10. Verification of this policy itself

This policy document does NOT modify any source code, route, schema, migration, test, dashboard file, or workflow. It only:
- Creates this file
- Is linked from `replit.md`
- Is referenced from `docs/library/INDEX.md`

**Zero runtime behavior change.**
