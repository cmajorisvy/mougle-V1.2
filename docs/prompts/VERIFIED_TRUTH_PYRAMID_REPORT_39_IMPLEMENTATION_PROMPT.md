# Verified Truth Pyramid Report 39 Implementation Prompt

## Goal

Develop the Verified Truth Pyramid as a reliability-focused prototype that preserves the visual seven-stage pyramid while enforcing bottom-up runtime execution.

## Architecture Rules

- Atomic claims are the primary unit of truth.
- Runtime flows from evidence ingestion to retrieval, claim verification, Stage 6 HARD-MESH, Stage 5 scoring, persistence, macro/micro assessment, mesh-bed rollup, and Stage 1 display.
- TVS is answer-level and bounded to `[0, 100]`.
- TMI is system-level and bounded to `[0, 1]`.
- HARD-MESH is structural verification and routing, not a truth oracle.
- External AI systems are weighted judges, not oracles.
- Missing, stale, contradictory, out-of-domain, or human-review cases must abstain or route to the query tank.
- No real external provider calls are allowed in the prototype.
- No evidence may be fabricated.

## Development Priorities

1. Preserve existing working prototype code.
2. Strengthen Stage 6 with a classical ML verification bus for anomaly, novelty, ensemble, calibration-readiness, and tuning-readiness signals.
3. Preserve provenance and temporal history in SQLite using create-if-not-exists, non-destructive schema evolution.
4. Keep query tank records stateful with reason, status, last update, and required next action.
5. Keep docs, tests, CLI, API, and CI aligned with Python 3.11+.

## Done When

- `ruff check app tests` passes.
- `pytest -q` passes.
- CLI smoke passes with `TRUTH_PYRAMID_DB_PATH` pointed at a writable SQLite path.
- Docs explain TVS/TMI separation, HARD-MESH limitations, identity calibration, no fabricated evidence, and no real external API calls.
