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

## Council Socket Fabric and PTEE Core

Reports 43-45 add two implementation-ready foundations:

- Governed Council Socket Fabric: seven council domains submit typed, replayable envelopes beneath Stage 7/6. The fabric computes payload hashes, records route decisions, denies direct Stage 4/Stage 1 bypass attempts, sends low-risk events to Stage 6, and routes legal/financial/high-risk events to query-tank policy review.
- Persistent Topological Evolution Engine scaffold: every verification can emit a lightweight versioned topology evolution record anchored at the Stage 4/5/6 core. The prototype records graph shape, stability, drift, event refs, and route hints without requiring heavy topology dependencies.

The seven council domains are AI Agents, Knowledge & Truth, Podcast Forum Debates, Newsrooms, System Management, Legal Management, and Financial Management. None of them may write directly to Stage 4 or Stage 1.

## AI Agent Micro-Pyramid and Signal Culture

Report 46 adds a safe local agent-control slice before the council fabric:

- User Agent Micro-Pyramid: evaluates a local action request with a hard permission gate, deterministic simulation bundle, and `LocalReadiness` score. It can only return `proceed_local`, `ask_user`, `simulate_more`, `escalate_to_council`, `block`, or `archive`; it never returns `publish_truth`.
- Signal Culture Layer: converts events into signal vectors, applies prioritization/decay/risk penalties, routes to local archive, agent wake, main engine, or admin review, and reports load reduction.

These layers reduce workload and structure events. They are not the Truth Engine, not the Knowledge Graph, not the final governance authority, and not a monetization engine.

## Newsrooms Council MVP

The Newsrooms Council backend adds a deterministic local editorial control plane for source/feed ingestion, raw article intake, article normalization, claim extraction, evidence submission, source reliability scoring, newsworthiness scoring, editorial risk scoring, Stage 7 candidate routing, Stage 6 submission packets, newsroom packages, preview-only scripts, news-to-debate handoffs, corrections, risk alerts, audit logs, and dashboard pages.

Newsworthiness and SourceReliability are bounded routing signals, not TruthScore. The Newsrooms Council cannot publish final truth, cannot update Stage 1, cannot update Stage 4, and cannot bypass Stage 6. News-to-debate handoff is candidate-only. Evidence submissions require a no-fabricated-evidence attestation, and the MVP performs no external provider calls, no real payments, and no production database writes.

Dashboard endpoints:

- `GET /dashboard/newsrooms/cards`
- `GET /dashboard/newsrooms/pages`
- `GET /dashboard/newsrooms/risk-alerts`
- `GET /dashboard/newsrooms/audit-logs`
- `GET /dashboard/newsrooms/safety-boundaries`


## Stage 7 and Agent Collapse Final Wiring

The final integration adds Stage 7 External AI Memory & Uncertainty and the AI Agent Collapse Event module. Stage 7 stores candidate-only external records, unresolved/disputed records, fast-resolver placeholders, spike-layer placeholders, and deep-resolver candidate packages. It cannot publish truth or update Stage 1/Stage 4 directly.

The Collapse module evaluates ACR, detects hard policy violations, applies restrictions, creates recovery plans, records reviews, and routes truth-impact/high-risk cases to Council Socket Fabric and Stage 6. Collapse restricts and reviews agents; it never deletes them.

Additional endpoints:

- `POST /stage7/external-records`
- `GET /stage7/external-records`
- `POST /stage7/query-tank/resolve`
- `POST /stage7/stage6/submit`
- `GET /admin/stage7/alerts`
- `POST /agents/{agent_id}/collapse/evaluate`
- `POST /agents/{agent_id}/collapse/events`
- `GET /agents/{agent_id}/collapse/events`
- `GET /agents/{agent_id}/collapse/state`
- `POST /agents/{agent_id}/collapse/restrictions`
- `POST /agents/{agent_id}/collapse/recovery-plan`
- `POST /agents/{agent_id}/collapse/review`
- `POST /agents/{agent_id}/collapse/restore`
- `GET /admin/agents/collapse/events`
- `GET /admin/agents/collapse/alerts`
- `GET /admin/agents/collapse/metrics`
- `POST /admin/agents/collapse/{event_id}/route-stage6`
- `POST /admin/agents/collapse/{event_id}/route-truth-impact`

## Archive-Aware Reuse Foundation

Reports 47-52 add a safe archive discovery layer. The confirmed legacy archive remains searchable under `archive/legacy-codebase/20260529-1150`, but active runtime does not import from archived source. `app/archive_reuse.py` reads generated manifests, recomputes a Micro-Pyramid compatibility score, blocks P0 secret-risk rows, maps candidates into Signal Culture, Stage 5 Micro-Pyramid, Stage 6, Stage 7, admin governance, reference-only, or archive-only buckets, and exposes read-only wiring endpoints.

Use:

```bash
python - <<'PY'
from app.archive_reuse import build_archive_reuse_matrix
print(build_archive_reuse_matrix().classification_summary)
PY
```

The API endpoint `GET /archive/micro-pyramid/candidates?limit=25` returns the matrix summary and selected candidates. `GET /archive/runtime-imports/check` verifies that app/test runtime code has not imported directly from `archive/`.

No archived source is restored wholesale, and P0 rows require private human review before any future adapter work.

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

## Current Validation Model

The active prototype is Python/FastAPI/SQLite. The legacy React/Vite/TypeScript application source is preserved under `archive/` for future review and adapter work, but it is not the authoritative runtime for the Verified Truth Pyramid prototype.

Use Python validation as the main path:

```bash
npm run check
npm run build
npm run archive:verify
```

`npm run check` delegates to the Python prototype validation wrapper: install the editable Python package, run `ruff check app tests`, run `pytest -q`, verify archive integrity, and run `git diff --check`. The wrapper requires Python 3.11+ and honors `PYTHON=/path/to/python3.11` when a specific interpreter is needed.

`npm run build` intentionally reports that no active Node build is required after archive cleanup. This is not hiding a failure; it reflects the current Python-first foundation. `npm run archive:verify` remains required so archived source integrity stays protected.

Legacy Node validation remains available only when the archived TypeScript app is intentionally restored or reintroduced:

```bash
npm run check:legacy-node
npm run build:legacy-node
```

No Node build should be required for the current prototype unless active Node application code is reintroduced in a later branch.

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
- `POST /council/socket/events`
- `GET /council/socket/events`
- `GET /topology/evolution`
- `POST /agents/action-request`
- `POST /signal/events`
- `GET /admin/signal-load-reduction`
- `GET /archive/micro-pyramid/candidates`
- `GET /archive/runtime-imports/check`

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

Council socket example:

```json
{
  "socket_id": "socket_example",
  "event_id": "evt_example",
  "spec_version": "1.0",
  "council_id": "financial_management",
  "bound_unit_id": "settlement_ledger_risk_unit",
  "schema_id": "mougle.council_socket.v1",
  "origin_stage": "council_socket_fabric",
  "trace_id": "trace_example",
  "request_id": "request_example",
  "action": "payout",
  "sensitivity": {"financial": true},
  "request_payload": {"object_id": "ledger_123"}
}
```

High-risk legal or financial events return `query_tank_pending` with `needs_review`. Direct Stage 4 or Stage 1 targets return `rejected`.

Agent action example:

```json
{
  "passport": {
    "agent_id": "agent_1",
    "owner": "user_1",
    "purpose": "local workload reduction",
    "risk_limit": 0.7,
    "automation_level": "assisted"
  },
  "request": {
    "request_id": "req_1",
    "agent_id": "agent_1",
    "action_type": "payout",
    "goal_alignment": 0.9,
    "tool_safety": 0.8,
    "simulation_success": 0.8,
    "user_benefit": 0.9,
    "financial_sensitivity": true
  }
}
```

High-risk requests escalate to a council socket envelope instead of acting locally.

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
- Council socket persistence is a prototype in-process fabric, not production Kafka/gRPC/MCP infrastructure yet.
- Agent micro-pyramid logic is deterministic scaffolding, not autonomous production agency.
- Signal Culture routing is deterministic local prioritization, not final truth verification.
- PTEE evolution records are lightweight topology deltas, not full persistent homology.
- Thresholds are configurable defaults and require calibration on real datasets.
- Persistent homology is scaffolded through topology contracts, not a full topology engine.
