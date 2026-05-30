# Stage 6 HARD-MESH

HARD-MESH is the structural verification layer for the Verified Truth Pyramid. It does not decide truth by itself. It compresses, clusters, audits, validates, and routes claim/evidence structures so Stage 5 can score them with better context.

Reports 43-45 add a governed council substrate in front of this layer. Council events enter through a socket fabric, receive a policy/routing decision, and then either reach Stage 6, go through Stage 7 before Stage 6, or wait in the query tank. No council socket may write directly to Stage 4 or Stage 1.

Report 46 adds local agent and Signal Culture inputs before the socket fabric. Local agent readiness and signal routing are admissibility/routing hints only; neither can create Stage 4 knowledge or Stage 1 truth output.

## Algorithm Portfolio

- BIRCH: online-style compression and subcluster stability.
- MiniBatchKMeans: inductive routing and centroid-margin confidence.
- HDBSCAN: density/noise purification when available.
- OPTICS: variable-density audit and reachability inspection.
- SpectralClustering: graph-native refinement.
- AgglomerativeClustering: interpretable hierarchy and local refinement.
- Classical ML Verification Bus: IsolationForest anomaly screening, OneClassSVM novelty screening, ensemble cleanliness score, and calibration/stacking/tuning readiness metadata.

## Online vs Batch/Audit Lanes

Online lanes are BIRCH and MiniBatchKMeans. They provide fast structural hints.

Batch/audit lanes are HDBSCAN, OPTICS, Spectral, and Agglomerative. They run safely on the prototype dataset and skip with structured warnings when the sample geometry is too small.

## Lane Inputs and Outputs

Inputs include claim records, evidence metadata, source reliability, timestamps, plugin scores, uncertainty, and graph features.

Outputs include labels, confidence, score, lane details, warnings, validation metrics, agreement metrics, Omega, route, and route reason.

The classical ML bus outputs anomaly, novelty, and ensemble scores in `[0, 1]`. It also records whether there is enough labeled evaluation data to graduate into `CalibratedClassifierCV`, `VotingClassifier`, `StackingClassifier`, or `RandomizedSearchCV` workflows later.

## Route Thresholds

- `stage_5_pass`: Omega >= configured pass threshold and no hard failure.
- `stage_7_verify`: borderline Omega requiring external verifier review.
- `query_tank_pending`: low Omega or hard failure.

Hard failures override Omega.

## Failure Modes

- Missing evidence: query tank / unresolved queue.
- Stale evidence: stale knowledge route.
- Source conflict or hard contradiction: source conflict / hard contradiction route.
- Out of domain: out-of-domain route.
- Direct council bypass attempt: rejected before Stage 4 or Stage 1.
- Legal/financial high-risk council event: query tank policy review.
- Invalid clustering geometry: structured warning and neutral lane score.
- Too little labeled data for calibration or stacking: structured warning and neutral readiness flags.

## Small-Data Behavior

Tiny corpora are expected in tests and local demos. Clusterers that need more samples skip safely with warnings. Skipped lanes are neutral, not punitive, so one strongly supported claim can still pass.

## Dependency Notes

HDBSCAN uses `sklearn.cluster.HDBSCAN` when available. The external `hdbscan` package is not required. Persistent homology libraries are not required for core tests.
