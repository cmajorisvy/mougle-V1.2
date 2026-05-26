# Mougle Prompts Library

**Last updated:** 2026-05-22
**Maintainer:** root-admin / founder

---

## 1. Purpose

This folder is the **central store of final approved prompts and task briefs** for Mougle. Prompts here are reusable reference — they are what worked (or what was approved) for specific tasks. They are **not** automatic instructions: they must be re-validated against current safety/architecture rules before re-use.

The prompts library complements:
- [`docs/archive/ARCHIVE_LIBRARY_INDEX.md`](../archive/ARCHIVE_LIBRARY_INDEX.md) — historical prompts archived from `attached_assets/`
- [`docs/library/INDEX.md`](../library/INDEX.md) — full documentation library catalog
- [`docs/DEVELOPMENT_DOCUMENTATION_POLICY.md`](../DEVELOPMENT_DOCUMENTATION_POLICY.md) — when/how to create prompt documents

---

## 2. Naming convention

```
docs/prompts/YYYY-MM-DD_<topic>_<task>.md
```

Rules:
- ISO date prefix is mandatory (sorts chronologically in `ls`).
- `<topic>` is lowercase, hyphenated, broad (e.g., `r3f`, `newsroom`, `production-house`, `audit`, `cleanup`, `dashboard`).
- `<task>` is a short identifier (e.g., `r1-design`, `r2-install`, `c1-audit`, `t3-wiring`).

**Examples:**
```
2026-05-22_r3f_r1-design.md
2026-05-22_cleanup_c1-audit.md
2026-05-22_archive_library-index.md
2026-04-15_newsroom_autopilot-mvp.md
```

---

## 3. When to add a prompt here

Add a prompt to `docs/prompts/` when **any** of the following is true:

- ✅ The founder explicitly approved a prompt and may re-issue it later.
- ✅ The prompt produced a multi-task design (R-series, T-series, C-series, D-series).
- ✅ The prompt encodes a binding safety/scope guardrail worth preserving (panic button, dry-run-first, no-real-publishing, etc.).
- ✅ The prompt is the canonical brief for a currently-live feature.
- ✅ The prompt is a reusable template (architect persona, audit-only template, install-only template).

**Skip** if the prompt was a one-off bug-fix request or a chat clarification with no reuse value.

---

## 4. Required prompt-document structure

Each `docs/prompts/<file>.md` MUST contain:

```markdown
# <prompt title>

**Date approved:** YYYY-MM-DD
**Topic:** <topic>
**Task / Phase code:** <e.g. R1, T3, C1, ad-hoc>
**Status:** APPROVED / SUPERSEDED / NEEDS_REVIEW
**Reuse potential:** high / medium / low / unknown
**Safety-gate dependencies:** <list any safety/approval gates this prompt assumes>
**Superseded by:** <path-to-newer-prompt> (if applicable)

## When to reuse
<plain-language note: under what circumstances should an agent re-issue this prompt? What conditions must be true?>

## Pre-reuse checks
- [ ] Confirm current safety-gate framework still matches the assumptions above.
- [ ] Confirm referenced files/routes still exist.
- [ ] Confirm the prompt does not conflict with newer designs in `docs/reports/`.
- [ ] Run an archive search (per `DEVELOPMENT_DOCUMENTATION_POLICY.md` §5).

## Final approved prompt text
<verbatim final prompt>
```

---

## 5. How to search prompts before creating a new one

Before writing a new prompt:

```bash
# 1. Search the prompts library by topic keyword:
ls docs/prompts/ | grep -i <keyword>

# 2. Search the archive prompts (126 historical task briefs):
ls docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/ | grep -i <keyword>

# 3. Check the archive index for cluster hints:
grep -i <keyword> docs/archive/ARCHIVE_LIBRARY_INDEX.md

# 4. Check the documentation library index:
grep -i <keyword> docs/library/INDEX.md
```

Record findings in the task plan: *"Prompt search performed; reusing `<path>` / no prior prompt found."*

---

## 6. Safety note (BINDING)

**Prompts are reusable reference, not automatic instructions.**

- A re-issued prompt MUST be re-validated against the current safety triangle (creator-freedom / AI-automation / founder-control).
- A re-issued prompt MUST be re-validated against current architecture (current `client/src/App.tsx` routes, current `shared/schema.ts`, current service surface).
- A re-issued prompt MUST NOT bypass current approval gates even if the original prompt predated them.
- A re-issued prompt that enables real publishing / render / live / Unreal / 4D-hardware execution is **automatically void** and must be rewritten.
- Restoring a prompt that conflicts with current safety gates requires a separate founder-approved task.

If the safety-gate dependencies listed in the prompt document have changed since the prompt was approved, treat the prompt as `NEEDS_REVIEW` and consult the founder before reuse.

---

## 7. Relationship to the archive

The 126 historical task briefs preserved in `docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/` (Set A from C2) are the **historical corpus**. The `docs/prompts/` folder is the **curated, structured, going-forward corpus**.

When you find a useful prompt in the historical corpus that you want to reuse:
1. Copy the prompt text out of the archive file.
2. Wrap it in the §4 structure.
3. Save to `docs/prompts/YYYY-MM-DD_<topic>_<task>.md` with `Status: NEEDS_REVIEW` until validated.
4. Update `docs/library/INDEX.md`.

**Do NOT move or delete the archive file.** The archive must remain intact as the historical record.
