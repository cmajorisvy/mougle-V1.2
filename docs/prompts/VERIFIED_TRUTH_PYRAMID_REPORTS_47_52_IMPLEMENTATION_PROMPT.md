# Verified Truth Pyramid Reports 47-52 Implementation Prompt

## Mission

Implement the archive-aware reuse foundation for Mougle V1.2 without restoring legacy code wholesale. Treat the confirmed archive as a searchable asset library for future User AI Agent Micro-Pyramid, Signal Culture, Stage 6, Stage 7, and admin-governance work.

## Source Reports

This prompt condenses deep-research reports 47-52. The reports agree on one principle: the archive is valuable, but direct reuse is unsafe until every candidate is classified, secret-gated, and wrapped behind the new V1.2 boundaries.

## Architecture Rules

- Do not import runtime code directly from `archive/legacy-codebase/**/source`.
- Do not restore archived files wholesale.
- Do not reuse any P0/secret-risk candidate without private review and rotation decision.
- Signal Culture is event detection, prioritization, routing, and load reduction only.
- User Agent Micro-Pyramids produce local readiness and routing hints only.
- Stage 6 remains the mandatory no-bypass verification boundary.
- Stage 7 stores candidate memory, uncertainty, and unresolved/query-tank records; it is not a truth oracle.
- Archived marketplace, debate, podcast, reputation, and agent code may be mined for contracts or adapters, but not copied into active runtime as final authority.

## Required Implementation Slice

1. Read the confirmed archive manifests under `archive/legacy-codebase/20260529-1150/manifests/`.
2. Build a machine-readable file-level reuse matrix.
3. Compute a Micro-Pyramid compatibility score using the reports' weighted formula.
4. Classify candidates into `reuse_candidate`, `adapt_candidate`, `reference_only`, `archive_only`, or `blocked_secret_risk`.
5. Map candidates to `cross_cutting`, `stage5_micro_pyramid`, `stage6_boundary`, `stage7_foundation`, `admin_governance`, `reference_only`, or `archive_only`.
6. Map Stage 5 candidates into local signal bands: personal, professional/business, community, knowledge, risk/safety, reputation/Gluon, marketplace/product, and debate/podcast.
7. Expose a read-only API for candidate discovery and a runtime-import guard.
8. Add tests proving P0 blocking, stage mapping, matrix export, API wiring, and no direct archive imports.
9. Update README, ARCHITECTURE, AGENTS, and config with the archive-reuse contract.

## Done When

- The app can produce an archive reuse matrix from real or synthetic manifests.
- P0 candidates are blocked from adaptation output.
- Runtime import checks detect direct `archive` imports.
- API wiring exposes `/archive/micro-pyramid/candidates` and `/archive/runtime-imports/check`.
- Tests and lint pass.
- No archived source file is restored into active runtime.
