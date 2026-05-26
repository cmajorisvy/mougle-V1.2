# V1.2 Archive Review Queue

Date: 2026-05-26
Branch: `cleanup/v1-2-stabilization`

Purpose: list files that may be obsolete or duplicate so they can be archived safely in later focused PRs.

| File path | Why it may be obsolete | Recommended action | Risk level |
|---|---|---|---|
| `docs/reports/CODEX_MOUGLE_4D_CINEMA_CONTROL_MVP_REPORT.md` | Older phase report; overlaps newer production-house docs | archive | medium |
| `docs/reports/CODEX_MOUGLE_AI_PRODUCTION_HOUSE_REPORT.md` | Legacy checkpoint from earlier branch wave | archive | medium |
| `docs/reports/CODEX_MOUGLE_AUTOPILOT_247_NEWSROOM_REPORT.md` | Superseded by newer newsroom route/docs updates | archive | medium |
| `docs/reports/CODEX_PHASE_1A_RENDER_PIPELINE_AUDIT.md` | Legacy phase artifact; still useful history only | archive | low |
| `docs/reports/CODEX_PHASE_1B_CLUSTERING_CLAIMS_REPORT.md` | Older implementation snapshot | archive | low |
| `docs/reports/CODEX_PHASE_1B_NEWSROOM_DATA_PACKAGE_REPORT.md` | Potential duplicate with package-route docs | archive | medium |
| `docs/reports/CODEX_PHASE_1B_NEWSROOM_PACKAGE_BUILDER_REPORT.md` | Potential duplicate planning/report overlap | archive | medium |
| `docs/reports/CODEX_PHASE_1B_PERSISTENT_STORAGE_READINESS_REPORT.md` | Readiness report, not current baseline source | keep | medium |
| `docs/reports/CODEX_PHASE_1B_RENDER_MANIFEST_REPORT.md` | Historical report from prior phase | archive | low |
| `docs/reports/CODEX_PHASE_1B_SCHEMA_CONTRACTS_REPORT.md` | Older schema planning doc; still reference value | keep | medium |
| `docs/reports/MOUGLE_V1_1_ACTIVE_WORK_KICKOFF_REPORT.md` | V1.1 branch orchestration history | archive | low |
| `docs/reports/MOUGLE_V1_1_ADMIN_ROUTE_LINK_AUDIT_REPORT.md` | V1.1-specific QA context | archive | low |
| `docs/reports/MOUGLE_V1_1_PLAYWRIGHT_REPLIT_RUNTIME_REPORT.md` | Runtime setup history for earlier phase | keep | medium |
| `docs/reports/MOUGLE_V1_1_PLAYWRIGHT_SMOKE_TESTING_REPORT.md` | Old smoke baseline may still aid debugging | keep | medium |
| `docs/reports/PUSH_TO_MOUGLE_V1_1_REPORT.md` | One-time push bookkeeping | archive | low |
| `docs/reports/PUSH_TO_MOUGLE_AI_V1_1_REPORT.md` | One-time push bookkeeping | archive | low |
| `docs/reports/PUSH_FINAL_MOUGLE_AI_CHECKPOINT_REPORT.md` | One-time checkpoint report | archive | low |
| `docs/reports/GITHUB_SUPABASE_SYNC_CHECKPOINT_REPORT.md` | Environment-specific sync report; historical | archive | low |
| `docs/reports/FULL_TEST_AUDIT_REPORT_CODEX_2026-05-23.md` | Useful but not canonical ongoing validation | keep | medium |
| `docs/reports/DEBATE_TO_PODCAST_VIDEO_EXPORT_DESIGN.md` | Large design artifact; keep until modular docs split | keep | high |

Notes:
- No files were moved in this stabilization pass.
- Items marked `archive` should be moved in a dedicated archive-only PR with link checks.
