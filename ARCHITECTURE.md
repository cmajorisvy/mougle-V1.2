# Verified Truth Pyramid Architecture

## Visual Pyramid

1. Stage 1: Truth Crown
2. Stage 2: Mesh-Bed Heat Map / Truth Comparison Mesh
3. Stage 3: Dual Mechanics View
4. Stage 4: Knowledge of Purity and Wisdom
5. Stage 5: Equation of Purity
6. Stage 6: HARD-MESH Verification Pipeline
7. Stage 7: External AI Platform Verification

## Runtime Execution Graph

Runtime runs bottom-up:

`raw sources / claims / evidence / metadata / graph edges -> Stage 7 boundary when needed -> Stage 6 HARD-MESH -> Stage 5 Equation of Purity -> Stage 4 temporal knowledge store -> Stage 3 macro/micro assessment -> Stage 2 mesh-bed observation -> Stage 1 Truth Crown`

## Module Map

- `app/models.py`: Pydantic contracts for truth records, HARD-MESH, topology, query tank, and council sockets.
- `app/agent_control.py`: user agent micro-pyramid readiness, simulation, permission gate, and escalation.
- `app/signal_culture.py`: signal vector scoring, routing, and load-reduction analytics.
- `app/archive_reuse.py`: manifest-only archive reuse matrix, P0 blocking, pyramid fit mapping, and no-runtime-import checks.
- `app/newsrooms_council.py`: deterministic Newsrooms Council control plane for source intake, normalization, claim extraction, evidence submission, scoring, Stage 7 candidate routing, Stage 6 packets, scripts, handoffs, risk alerts, audit logs, and dashboard payloads.
- `app/podcast_council.py`: deterministic Podcast Forum Debate Council for rooms, sessions, participants, debate claims, evidence, reviews, Stage 7 candidate routing, Stage 6 packets, risk alerts, audit logs, and dashboard payloads.
- `app/claims/decomposer.py`: deterministic atomic claim decomposition with stable IDs and spans.
- `app/retrieval/`: retrieval interface and in-memory corpus retriever.
- `app/graph/provenance_graph.py`: claim/evidence/source/time graph and graph feature export.
- `app/plugins/`: verification plugin interface and deterministic plugins.
- `app/stage6/`: HARD-MESH feature builder, preprocessing, clustering lanes, classical ML verification bus, metrics, consensus, and pipeline.
- `app/scoring/`: Equation of Purity, calibration interface, TMI, and publish gate.
- `app/storage/sqlite_store.py`: local SQLite persistence and query tank.
- `app/topology.py`: Persistent Topological Engine scaffold.
- `app/council_sockets.py`: governed seven-council socket fabric, no-bypass routing, and policy decision envelopes.
- `app/api.py`: FastAPI endpoints.
- `app/cli.py`: `verify-truth` CLI.

## Stage Responsibilities

Stage 1 exposes TVS, TMI, verdict, confidence explanation, and publish/abstain decision.

Stage 2 observes graph heat-map features: support count, refutation count, source diversity, source reliability, provenance completeness, contradiction pressure, and Stage 6 structural purity.

Stage 3 separates macro and micro mechanics. Macro means graph-level consistency, source agreement, temporal coherence, and Stage 6 consensus. Micro means claim-level evidence, local contradiction, numeric consistency, freshness, and provenance completeness.

Stage 4 persists the history of verification: answer records, claim records, evidence records, source records, graph snapshots, plugin results, HARD-MESH runs, lane results, stateful query tank items, council socket events, external verifier records, topology snapshots, and topology evolution records. SQLite tables are bitemporal-ready with valid-time metadata where the prototype writes or evolves verification history.

Stage 5 computes:

`J(q,a,t) = b + sum(w_k s_k) + sum(kappa_ij s_i s_j) + lambda_g G(graph_features) + lambda_h H(hard_mesh_features) - mu_c contradiction - mu_u uncertainty - mu_d staleness - mu_o out_of_domain`

`TVS(q,a,t) = 100 * Cal(sigmoid(J(q,a,t)))`

Identity calibration is the prototype default.

Stage 6 computes Omega:

`Omega(q) = sigmoid(alpha_hdb p_hdb + alpha_mbk m_mbk + alpha_graph s_graph + alpha_birch b_birch + alpha_cons c_cons + alpha_ext v_ext + alpha_rule r_rule - penalties - tau)`

Stage 7 is a typed external verifier boundary. The current ExternalJudgePlugin is a deterministic stub and does not call real APIs.

## User Agent Micro-Pyramid

The local agent layer is a workload reducer and structured signal producer, not a truth authority. `app/agent_control.py` implements:

- `CanAct`: owner, vault, action, risk, safe-mode, law, and audit gates.
- deterministic simulation bundles with outcome, risk, goal fit, tool success, escalation need, uncertainty, explanation, and provenance.
- `LocalReadiness` as a bounded local score, not `TruthScore`.
- six allowed action classes: `proceed_local`, `ask_user`, `simulate_more`, `escalate_to_council`, `block`, and `archive`.
- council socket escalation for legal, financial, or otherwise high-risk requests.

The code intentionally has no `publish_truth` action class.

## Signal Culture Layer

`app/signal_culture.py` implements deterministic signal detection, prioritization, decay, thresholding, routing, and load-reduction analytics. It routes events to local archive, agent wake, main engine, or admin review. It does not write to Stage 4 or Stage 1 and does not decide truth.

`GET /admin/signal-load-reduction` computes:

`1 - EventsSentToMainEngine / TotalEventsReceived`


## Archive-Aware Reuse Integration

The confirmed legacy archive is treated as a structured asset library, not active application code. `app/archive_reuse.py` reads `reuse-candidates.json`, `file-manifest.json`, and `secret-findings.redacted.json` from the confirmed archive and produces a file-level matrix for future adapter work.

Safety rules:

- P0 secret-like findings are classified as `blocked_secret_risk`.
- Active runtime must not import from `archive/legacy-codebase/**/source`.
- Future extraction must cite a reuse-matrix row and use wrappers/adapters.
- Signal Culture, Micro-Pyramid, Stage 6, Stage 7, and admin governance mappings are planning targets only, not automatic restoration.

The read-only endpoints `/archive/micro-pyramid/candidates` and `/archive/runtime-imports/check` provide connection and wiring visibility for this layer.

## HARD-MESH Implementation

Stage 6 is a structural verification layer, not a truth oracle.

Feature Builder produces deterministic numeric rows tied to claim/evidence/source IDs. Preprocessing applies imputation, scaling, and dimensionality reduction when sample size allows.

Implemented lanes:

- BIRCH Compression: subcluster/stability signal.
- MiniBatchKMeans Routing: centroid margin confidence and compactness.
- HDBSCAN Purification: density/noise purification when available in scikit-learn; otherwise structured skip.
- OPTICS Audit: variable-density audit lane.
- Spectral Refinement: graph-native clustering using nearest-neighbor affinity where valid.
- Agglomerative Refinement: human-auditable hierarchy signal.
- Classical ML Verification Bus: anomaly, novelty, ensemble, calibration-readiness, stacking-readiness, and tuning-readiness metadata using deterministic local feature matrices.

Validation metrics are computed only when label geometry is valid. Metrics are evidence, not oracles.

Consensus produces `omega`, lane scores, warnings, validation metrics, agreement metrics, route, route reason, and query tank item if needed.

## Graph and Provenance Layer

The graph includes query, answer, claim, evidence, source, timestamp, and HARD-MESH nodes. Required edge types include `answer_contains_claim`, `claim_supported_by`, `claim_refuted_by`, `evidence_from_source`, `claim_temporally_depends_on`, `claim_conflicts_with`, `claim_structurally_grouped_with`, `claim_flagged_by_hard_mesh`, `evidence_clustered_with`, `evidence_routes_to_query_tank`, and external review placeholders.

`GET /graph/{answer_id}` returns persisted graph JSON with node metadata, edge types, and graph features.

## Publish and Query Tank Routing

Hard verdict precedence:

1. out_of_domain
2. source_conflict
3. stale
4. refuted / hard contradiction
5. not_enough_evidence
6. pending_human_review
7. low structural purity
8. high uncertainty
9. publish if no hard block and thresholds pass

The publish gate requires TVS threshold, macro/micro agreement, uncertainty bounds, no hard blocking verdicts, and no blocking HARD-MESH route.

## Persistent Topology Scaffold

`app/topology.py` provides PTEE-ready graph metrics: node count, edge count, connected components, component sizes, cycle rank, density, average degree, clustering coefficient, stability score, and drift flag. Each verification can also create a `TopologicalEvolutionRecord` with a state version, current snapshot, previous snapshot pointer, event refs, route hint, and Stage 4/5/6 core anchor. Heavy persistent homology libraries are not required for core tests.

## Governed Council Socket Fabric

`app/council_sockets.py` implements the prototype foundation bus for seven council domains:

- AI Agents
- Knowledge & Truth
- Podcast Forum Debates
- Newsrooms
- System Management
- Legal Management
- Financial Management

The fabric creates replayable envelopes, hashes payloads, emits policy decisions, rejects direct Stage 4/Stage 1 bypass attempts, routes ordinary upward events through Stage 7 then Stage 6, routes low-risk telemetry to Stage 6, and places high-risk legal/financial events into query-tank review. Security principles: schema validation, no unmanaged code blobs, signed artifacts in future, replayable event logs, least privilege, and no untrusted pickle/joblib loading in production.

## Newsrooms Council

`app/newsrooms_council.py` is the editorial and verification control plane for newsroom artifacts. It handles source/feed ingestion, raw and normalized article records, deterministic claim extraction, no-fabricated-evidence-gated evidence submission, SourceReliability, Newsworthiness, EditorialRisk, ClaimPriority, NewsroomReadiness, BroadcastReadiness, Stage 7 candidate routes, Stage 6 submission packets, text/video package metadata, preview-only studio script data, news-to-debate candidate handoff, corrections, risk alerts, audit logs, and dashboard cards/pages.

The Newsrooms Council is not the render plane, not a truth oracle, and not a publishing engine. Newsworthiness is not TruthScore, SourceReliability is not TruthScore, virality is not truth, Stage 7 remains candidate-only, Stage 6 packets are not final verification, and the council cannot publish truth or write Stage 1/Stage 4 directly.

## Future Extension Points

- LLM-based claim decomposition.
- Vector retrieval and source connectors.
- Fitted calibrators and stacking models.
- Optional topology adapters such as gudhi behind feature flags.
- Real external verifier adapters behind explicit credentials and configuration.
- Production-grade database migrations.

## Stage 7 Memory and Collapse Integration

Stage 7 is now labeled External AI Memory & Uncertainty Engine. It stores supported/disputed/unknown candidate records and packages candidates for Stage 6. Stage 7 outputs are candidate-only and cannot publish truth or update Stage 1/Stage 4.

The AI Agent Collapse Event module lives under the AI Agents Council conceptually. It computes ACR, detects hard policy violations, applies restrictions, records audit logs, creates recovery plans, and routes truth-impact cases to the Knowledge and Truth Council. Emergency states cannot restore directly to normal operation.
