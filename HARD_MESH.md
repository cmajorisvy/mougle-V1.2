# Stage 6 HARD-MESH

HARD-MESH is the structural verification layer for the Verified Truth Pyramid. It does not decide truth by itself. It compresses, clusters, audits, validates, and routes claim/evidence structures so Stage 5 can score them with better context.

## Algorithm Portfolio

- BIRCH: online-style compression and subcluster stability.
- MiniBatchKMeans: inductive routing and centroid-margin confidence.
- HDBSCAN: density/noise purification when available.
- OPTICS: variable-density audit and reachability inspection.
- SpectralClustering: graph-native refinement.
- AgglomerativeClustering: interpretable hierarchy and local refinement.

## Online vs Batch/Audit Lanes

Online lanes are BIRCH and MiniBatchKMeans. They provide fast structural hints.

Batch/audit lanes are HDBSCAN, OPTICS, Spectral, and Agglomerative. They run safely on the prototype dataset and skip with structured warnings when the sample geometry is too small.

## Lane Inputs and Outputs

Inputs include claim records, evidence metadata, source reliability, timestamps, plugin scores, uncertainty, and graph features.

Outputs include labels, confidence, score, lane details, warnings, validation metrics, agreement metrics, Omega, route, and route reason.

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
- Invalid clustering geometry: structured warning and neutral lane score.

## Small-Data Behavior

Tiny corpora are expected in tests and local demos. Clusterers that need more samples skip safely with warnings. Skipped lanes are neutral, not punitive, so one strongly supported claim can still pass.

## Dependency Notes

HDBSCAN uses `sklearn.cluster.HDBSCAN` when available. The external `hdbscan` package is not required. Persistent homology libraries are not required for core tests.

