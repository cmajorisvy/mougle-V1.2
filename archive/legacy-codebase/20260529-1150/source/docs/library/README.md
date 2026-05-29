# Mougle Documentation Library

**Last updated:** 2026-05-22
**Maintainer:** root-admin / founder
**Index:** [`INDEX.md`](INDEX.md)
**Policy:** [`../DEVELOPMENT_DOCUMENTATION_POLICY.md`](../DEVELOPMENT_DOCUMENTATION_POLICY.md)

---

## 1. What this folder is

This is the **central documentation library** for Mougle. Every report, design, prompt, runbook, test plan, archive manifest, PDF, Word doc, text note, Markdown file, diagram, backup manifest, and external-reference note for the project should be discoverable from here.

The library is the single entry point for "where does the docs for X live?"

---

## 2. Structure

```
docs/library/
├── README.md                ← this file
├── INDEX.md                 ← full catalog of every doc, with category + status
├── reports/                 ← task reports, audits, smoke/E2E, safety, admin-dashboard
├── designs/                 ← architecture, future features, R3F/WebGL/Unity, debate/podcast/production
├── prompts/                 ← final approved prompts, reusable task briefs, prompt templates
├── runbooks/                ← operational steps, backup/restore, deploy, recovery
├── testing/                 ← test plans, E2E plans, smoke instructions, validation checklists
├── archives/                ← pointers to docs/archive/ (the index, task histories, archived reports)
├── pdf/                     ← .pdf files (architecture exports, audit exports)
├── word/                    ← .doc / .docx files
├── text/                    ← .txt files (notepad, raw notes, copied task logs)
├── markdown/                ← general .md files that don't fit elsewhere
├── diagrams/                ← Mermaid sources, flowcharts, system maps
├── backups/                 ← backup manifests, DB backup instructions, backup verification
└── external-references/     ← third-party doc references (R3F, Supabase, OpenAI, provider docs)
```

---

## 3. Rules

1. **All future task docs should be discoverable here.** Either place the doc directly in the matching `docs/library/<subfolder>/` **or** leave it in its canonical `docs/...` location and update `docs/library/INDEX.md` with a row that points to it.
2. **Archived docs are reusable reference, not active code.** See [`../archive/ARCHIVE_LIBRARY_INDEX.md`](../archive/ARCHIVE_LIBRARY_INDEX.md).
3. **Before building a missing feature, check the library and the archive index first** (per `DEVELOPMENT_DOCUMENTATION_POLICY.md` §5).
4. **Do not restore archived content without approval** (per archive-index §6).
5. **Do not break existing doc links** when moving files. Prefer index-first, move-later.
6. **Do not move backup manifests** without copying them — backup paths are operationally important.

---

## 4. How to use

| Goal | Action |
|---|---|
| Find an existing report | `grep -i <topic> docs/library/INDEX.md` |
| Find an existing prompt | `ls docs/prompts/ \| grep -i <topic>` + `ls docs/library/prompts/ \| grep -i <topic>` |
| Find a historical task brief (126 archived) | `ls docs/archive/cleanup-archive-2026-05-22/attached_assets-sessions-2026-05/ \| grep -i <topic>` |
| Find an architecture diagram | `ls docs/library/diagrams/` + `docs/reports/MOUGLE_NEWS_PODCAST_PRODUCTION_SYSTEM_FLOWCHARTS.md` |
| Find a PDF export | `ls docs/library/pdf/` + `ls downloads/ exports/` |
| Find a runbook | `ls docs/library/runbooks/` |
| Find a test plan | `ls docs/library/testing/` |
| Add a new task doc | follow `DEVELOPMENT_DOCUMENTATION_POLICY.md` §3 and update `INDEX.md` |

---

## 5. Behavior note

This folder is documentation-only. It does NOT change any source code, route, schema, migration, test, dashboard file, or workflow. It only catalogs and links existing documents.
