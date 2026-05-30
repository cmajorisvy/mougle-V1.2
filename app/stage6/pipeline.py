"""Orchestrates the full Stage 6 HARD-MESH verification flow."""

from __future__ import annotations

from datetime import datetime

from app.models import (
    AnswerVerificationRecord,
    CandidateAnswer,
    ClaimVerificationRecord,
    ClusterRunResult,
    FeatureBundle,
    HardMeshConsensusResult,
    Query,
)
from app.stage6.consensus import build_hard_mesh_consensus
from app.stage6.feature_builder import Stage6FeatureBuilder
from app.stage6.lanes import (
    AgglomerativeLane,
    BirchLane,
    HdbscanLane,
    MiniBatchKMeansLane,
    OpticsLane,
    SpectralLane,
)
from app.stage6.metrics import compute_agreement_metrics, compute_validation_metrics
from app.stage6.preprocessing import Stage6Preprocessor


class HardMeshPipeline:
    """Runs feature intake, cluster lanes, validation, consensus, and routing."""

    def __init__(self, cfg: dict) -> None:
        self.cfg = cfg
        self.builder = Stage6FeatureBuilder()
        self.preprocessor = Stage6Preprocessor()
        self.lanes = [
            BirchLane(),
            MiniBatchKMeansLane(),
            HdbscanLane(),
            OpticsLane(),
            SpectralLane(),
            AgglomerativeLane(),
        ]

    def run(
        self,
        query: Query,
        answer: CandidateAnswer,
        claim_records: list[ClaimVerificationRecord],
        graph_features: dict[str, float],
        now: datetime,
    ) -> tuple[HardMeshConsensusResult, FeatureBundle, ClusterRunResult]:
        hard_cfg = self.cfg.get("hard_mesh", {})
        if not hard_cfg.get("enabled", True):
            empty_bundle = self.builder.build(claim_records, graph_features, now)
            result = build_hard_mesh_consensus(
                claim_records=claim_records,
                lane_scores={},
                lane_warnings=["HARD-MESH disabled by request/config"],
                validation=compute_validation_metrics(empty_bundle.matrix, []),
                agreement=compute_agreement_metrics([]),
                cfg=self.cfg,
                query_id=query.query_id,
                answer_id=answer.answer_id,
            )
            return result, empty_bundle, ClusterRunResult(lane_results=[], warnings=result.lane_warnings)

        feature_bundle = self.builder.build(claim_records, graph_features, now)
        matrix, preprocessing_warnings = self.preprocessor.transform(feature_bundle)
        lane_results = [lane.run(matrix, hard_cfg) for lane in self.lanes]
        lane_scores = {lane.lane_name: (0.5 if lane.skipped else lane.score) for lane in lane_results}
        hdbscan_details = next((lane.details for lane in lane_results if lane.lane_name == "hdbscan"), {})
        lane_scores["noise_fraction"] = float(hdbscan_details.get("noise_fraction", 0.0))
        lane_warnings = preprocessing_warnings + [warning for lane in lane_results for warning in lane.warnings]
        validation = compute_validation_metrics(matrix, lane_results)
        agreement = compute_agreement_metrics(lane_results)
        consensus = build_hard_mesh_consensus(
            claim_records=claim_records,
            lane_scores=lane_scores,
            lane_warnings=lane_warnings,
            validation=validation,
            agreement=agreement,
            cfg=self.cfg,
            query_id=query.query_id,
            answer_id=answer.answer_id,
        )
        return consensus, feature_bundle, ClusterRunResult(lane_results=lane_results, warnings=lane_warnings)


def hard_mesh_summary(record: AnswerVerificationRecord) -> dict:
    """Return a compact summary suitable for CLI and audit logs."""
    if record.hard_mesh is None:
        return {"available": False}
    return {
        "available": True,
        "omega": record.hard_mesh.omega,
        "route": record.hard_mesh.route.value,
        "route_reason": record.hard_mesh.route_reason,
        "warnings": record.hard_mesh.lane_warnings,
    }
