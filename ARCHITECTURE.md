# Verified Truth Pyramid and Modular Equation Architecture

## Module Map

- `app/models.py`: core typed domain models
- `app/claims/decomposer.py`: deterministic atomic claim decomposition
- `app/retrieval/base.py`, `app/retrieval/mock.py`: retrieval interface + in-memory retriever
- `app/graph/provenance_graph.py`: claim-evidence-source-time graph operations
- `app/plugins/base.py`, `app/plugins/implementations.py`: plugin interface + built-ins
- `app/scoring/truth_functional.py`: modular truth equation + TVS
- `app/scoring/tmi.py`: TMI formula
- `app/scoring/gate.py`: publish/abstain policy gate
- `app/engine.py`: orchestration pipeline
- `app/api.py`: FastAPI endpoints
- `app/cli.py`: command-line verification entry
- `app/storage/sqlite_store.py`: local persistence

## Data Flow

`verify` request:

1. Build `Query` and `CandidateAnswer`
2. Decompose answer into `AtomicClaim`s
3. Retrieve claim-local `EvidenceItem`s
4. Evaluate plugins per claim
5. Produce `ClaimVerdict`s
6. Add records to provenance graph
7. Aggregate plugin outputs + graph features
8. Compute TVS and TMI
9. Apply publish/abstain gate
10. Persist answer + graph + unresolved queue (if abstained)

## Plugin Interface

Every plugin returns:

- `score` in `[0,1]`
- `uncertainty` in `[0,1]`
- `provenance`
- optional `warnings`
- optional `feature_vector`

Implemented plugins:

- SourceReliabilityPlugin
- ProvenanceCompletenessPlugin
- RetrievalSupportPlugin
- ContradictionPressurePlugin
- TemporalFreshnessPlugin
- NumericConsistencyPlugin
- MacroConsistencyPlugin
- MicroEvidencePlugin
- ExternalJudgePlugin (mock stub)

## Scoring Equation

`J(q,a,t) = b + sum(w_k s_k) + sum(kappa_ij s_i s_j) + lambda_g G(graph) - mu_c C - mu_u U - mu_d D`

`TVS = 100 * Cal(sigmoid(J))`

- `Cal` defaults to identity calibrator for prototype behavior
- sklearn isotonic calibrator adapter is provided for future fitted calibration

Weights and gate thresholds are configurable in `config/truth_weights.yaml`.

## Abstention Logic

Publish only if all are true:

- `TVS >= threshold`
- `macro_micro_disagreement <= epsilon`
- `mean_uncertainty <= u_max`
- no hard-blocking verdict

Otherwise route to unresolved queue with reason:

- insufficient evidence
- source conflict
- stale knowledge
- out of domain
- human review required

## Future Extension Points

- LLM-based claim decomposition plugin
- retrieval backends (vector DB, web connectors)
- trained calibrator and stacked meta-model
- advanced contradiction and anomaly plugins
- external judge adapters with weighted jury integration
