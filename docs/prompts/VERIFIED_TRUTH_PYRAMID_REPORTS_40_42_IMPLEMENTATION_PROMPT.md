# Verified Truth Pyramid Reports 40-42 Implementation Prompt

## Goal

Develop the Verified Truth Pyramid application according to the Stage 6 HARD-MESH clustering, pipeline, and pyramid architecture research in reports 40, 41, and 42.

## Core Interpretation

The visual pyramid remains top-down, but computation runs bottom-up. Stage 6 is a structural verification and anomaly-discovery layer, not a truth oracle. Stage 7 is an external consensus boundary that feeds Stage 6 and Stage 5 only when uncertainty, contradiction, or weak internal confidence requires it.

## Architecture Rules

- Atomic claims remain the primary unit of truth.
- TVS is answer-level and bounded to `[0, 100]`.
- TMI is system-level and bounded to `[0, 1]`.
- HARD-MESH outputs density, graph, prototype, anomaly, novelty, validation, and routing signals only.
- External AI platforms are typed weighted judges, not oracles.
- Missing, stale, contradictory, out-of-domain, or human-review cases must abstain or route to the query tank.
- No real external provider calls are allowed in this prototype.
- No evidence may be fabricated.
- No untrusted pickle, joblib, or model artifacts may be loaded in production paths.

## Development Priorities

1. Preserve the existing working prototype and branch history.
2. Keep the core Stage 6 stack around BIRCH, MiniBatchKMeans, HDBSCAN, OPTICS, SpectralClustering, and AgglomerativeClustering.
3. Add a classical ML verification bus for IsolationForest, OneClassSVM, ensemble cleanliness, calibration readiness, stacking readiness, and tuning readiness.
4. Keep query tank records stateful with reason, category, status, valid-time metadata, and required next action.
5. Keep SQLite schema evolution non-destructive and bitemporal-ready.
6. Add wiring tests that prove API, engine, Stage 6, persistence, graph reconstruction, hard-mesh analysis, and query tank endpoints connect correctly.
7. Keep docs aligned with Python 3.11+, scikit-learn stable APIs, no real external calls, and identity calibration as prototype default.

## Done When

- `python -m pip install -e ".[dev]"` or documented local equivalent succeeds.
- `ruff check app tests` passes.
- `pytest -q` passes.
- CLI smoke passes with `TRUTH_PYRAMID_DB_PATH` pointed at a writable SQLite path.
- API wiring tests cover `/health`, `/verify`, `/graph/{answer_id}`, `/hard-mesh/analyze`, and `/query-tank`.
- Docs explain TVS/TMI separation, HARD-MESH limitations, classical ML signals, query tank routing, identity calibration, no fabricated evidence, and no real external API calls.
