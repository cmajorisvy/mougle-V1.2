# Verified Truth Pyramid Prototype

This repository implements an implementation-ready prototype of the Verified Truth Pyramid and Modular Equation Architecture. It verifies answers by decomposing them into atomic claims, retrieving local evidence, building a provenance-aware claim/evidence/source/time graph, running modular verification plugins, passing structural signals through Stage 6 HARD-MESH, and then computing publish/abstain decisions from TVS and TMI.

The visual pyramid is top-down, but runtime execution is bottom-up:

`ingestion -> retrieval/evidence -> claim verification -> graph propagation -> HARD-MESH -> Equation of Purity -> temporal knowledge store -> macro/micro assessment -> mesh-bed observation -> Truth Crown`

## Seven Pyramid Stages

1. Truth Crown: calibrated TVS, system-level TMI, final verdict, publish/abstain decision, unresolved reason, and claim rollup.
2. Mesh-Bed Consensus: claim/evidence/source/time graph with support, refutation, source diversity, freshness, and Stage 6 structural features.
3. Dual Mechanics View: macro graph consistency and micro claim-level evidence support with disagreement scoring.
4. Knowledge of Purity and Wisdom: SQLite-backed provenance, graph snapshots, query tank records, plugin outputs, topology snapshots, and HARD-MESH runs.
5. Equation of Purity: configurable modular scoring functional with graph and HARD-MESH terms.
6. HARD-MESH Verification Pipeline: structural verification, clustering, anomaly discovery, validation metrics, consensus scoring, and route decisions.
7. External AI Verification: typed external verifier result schema and stubbed judge plugin only.

## TVS vs TMI

`TVS` is an answer-level calibrated True Value Score in `[0, 100]`.

`TMI` is a system-level Truth Maturity Index in `[0, 1]`. TMI is not the truth score of an individual answer.

## Stage 6 HARD-MESH Overview

Stage 6 is not a truth oracle. It is a structural verification and routing layer. It treats clustering algorithms, graph refiners, and external judges as evidence-producing modules.

Implemented lanes:

- Feature Builder: source reliability, evidence counts, contradiction flags, freshness, provenance completeness, plugin means, graph proxies, and lexical overlap.
- Preprocessing: imputation, scaling, TruncatedSVD/PCA fallback, and tiny-dataset fallback.
- BIRCH Compression: streaming-style ingress and subcluster stability proxy.
- MiniBatchKMeans Routing: centroid-margin confidence and compactness proxy.
- HDBSCAN Purification: density/noise separation when available in scikit-learn, otherwise structured skip.
- OPTICS Audit: variable-density audit lane with reachability/noise signals.
- Spectral/Agglomerative Refinement: graph and hierarchy views with safe small-data skips.
- Classical ML Verification Bus: IsolationForest and OneClassSVM structural cleanliness signals plus calibration/stacking/tuning readiness metadata.
- Validation Metrics: silhouette, Calinski-Harabasz, and Davies-Bouldin when valid.
- Agreement Metrics: adjusted Rand and adjusted mutual information across lane labels.
- Consensus Engine: computes Omega and routes to Stage 5, Stage 7, or Query Tank.

Default route bands are configurable in [truth_weights.yaml](config/truth_weights.yaml):

- `omega >= 0.85`: `stage_5_pass`
- `0.60 <= omega < 0.85`: `stage_7_verify`
- `omega < 0.60`: `query_tank_pending`
- hard failures always override Omega

## Abstention

The system abstains when evidence is missing, stale, contradictory, source-conflicted, out of domain, requires human review, or fails HARD-MESH routing. Missing evidence is never fabricated; it is routed to the unresolved queue or stateful query tank with a reason, status, required next action, and temporal metadata.

## Setup

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
```

## Run API

```bash
uvicorn app.api:app --reload
```

Endpoints:

- `GET /health`
- `POST /verify`
- `GET /graph/{answer_id}`
- `POST /hard-mesh/analyze`
- `GET /query-tank`

Example request:

```json
{
  "query": "What is the capital of France?",
  "answer": "Paris is the capital of France.",
  "corpus": [
    {
      "source_id": "s1",
      "source_name": "encyclopedia",
      "text": "Paris is the capital city of France.",
      "timestamp": "2026-01-01T00:00:00",
      "reliability": 0.95
    }
  ],
  "options": {
    "enable_hard_mesh": true,
    "enable_external_stub": false
  }
}
```

Response includes `tvs`, `tmi`, `publish`, claim records, `macro_micro`, `hard_mesh`, provenance, and unresolved reason.

## CLI

```bash
verify-truth --query "What is the capital of France?" --answer "Paris is the capital of France." --corpus ./corpus.json --show-claims --show-graph-summary
```

Useful options:

- `--enable-hard-mesh / --disable-hard-mesh`
- `--show-claims`
- `--show-graph-summary`
- `--json`
- `--verbose`

## Validation

```bash
ruff check app tests
pytest -q
```

CLI smoke:

```bash
verify-truth --query "What is the capital of France?" --answer "The capital of France is Paris." --corpus ./corpus.json
```

If the repository directory is read-only, point SQLite at a writable local path:

```bash
TRUTH_PYRAMID_DB_PATH=/tmp/truth_pyramid.db verify-truth --query "What is the capital of France?" --answer "The capital of France is Paris." --corpus ./corpus.json
```

## Safety Notes

- ExternalJudgePlugin is a stub and performs no real API calls.
- External AI platforms are weighted judges, not oracles.
- Identity calibration is the prototype default until real calibration data exists.
- Clustering signals are structural verification signals, not final truth.
- Classical anomaly and novelty signals are structural cleanliness hints, not truth verdicts.
- No evidence is fabricated.
- Tests do not require network calls.

## Known Limitations

- Retrieval is deterministic in-memory overlap matching.
- Claim decomposition is conservative heuristic splitting.
- Stage 6 uses deterministic local features rather than real embeddings.
- SQLite persistence is prototype storage with create-if-not-exists schema setup.
- SQLite includes bitemporal-ready metadata columns for future valid-time/system-time history.
- Thresholds are configurable defaults and require calibration on real datasets.
- Persistent homology is scaffolded through topology contracts, not a full topology engine.
