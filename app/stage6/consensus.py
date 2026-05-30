"""HARD-MESH consensus scoring and routing."""

from __future__ import annotations

from statistics import mean

from app.models import (
    AgreementMetricResult,
    ClassicalMLVerificationResult,
    ClaimVerificationRecord,
    HardMeshConsensusResult,
    QueryTankItem,
    StageRoute,
    ValidationMetricResult,
    VerdictLabel,
)
from app.stage6.utils import clip01, sigmoid


HARD_FAILURE_PRECEDENCE = [
    (VerdictLabel.out_of_domain, "out of domain"),
    (VerdictLabel.source_conflict, "source conflict"),
    (VerdictLabel.stale, "stale knowledge"),
    (VerdictLabel.refuted, "hard contradiction"),
    (VerdictLabel.not_enough_evidence, "insufficient evidence"),
    (VerdictLabel.pending_human_review, "human review required"),
]


def _first_hard_failure(records: list[ClaimVerificationRecord]) -> str | None:
    labels = {record.verdict.label for record in records}
    for label, reason in HARD_FAILURE_PRECEDENCE:
        if label in labels:
            return reason
    return None


def build_hard_mesh_consensus(
    claim_records: list[ClaimVerificationRecord],
    lane_scores: dict[str, float],
    lane_warnings: list[str],
    validation: ValidationMetricResult,
    agreement: AgreementMetricResult,
    classical_ml: ClassicalMLVerificationResult | None,
    cfg: dict,
    query_id: str,
    answer_id: str,
) -> HardMeshConsensusResult:
    """Compute Omega and route the record to Stage 5, Stage 7, or Query Tank."""
    hard_cfg = cfg.get("hard_mesh", {})
    weights = hard_cfg.get("weights", {})
    penalties = hard_cfg.get("penalties", {})
    thresholds = hard_cfg.get("thresholds", {})

    validation_score = mean(validation.normalized_metrics.values()) if validation.normalized_metrics else 0.5
    agreement_score = mean(agreement.normalized_metrics.values()) if agreement.normalized_metrics else 0.5
    lane_payload = {
        "hdbscan": lane_scores.get("hdbscan", 0.5),
        "mini_batch_kmeans": lane_scores.get("mini_batch_kmeans", 0.5),
        "birch": lane_scores.get("birch", 0.5),
        "graph_refinement": mean(
            [lane_scores.get("spectral", 0.5), lane_scores.get("agglomerative", 0.5)]
        ),
        "consensus": agreement_score,
        "classical_ml": classical_ml.ensemble_score if classical_ml else 0.5,
        "external": 0.5,
        "rules": 1.0,
    }

    hard_failure = _first_hard_failure(claim_records)
    contradiction_penalty = 1.0 if hard_failure in {"source conflict", "hard contradiction"} else 0.0
    stale_penalty = 1.0 if hard_failure == "stale knowledge" else 0.0
    out_of_domain_penalty = 1.0 if hard_failure == "out of domain" else 0.0
    missing_penalty = 1.0 if hard_failure == "insufficient evidence" else 0.0
    uncertainty_penalty = mean(
        [p.uncertainty for record in claim_records for p in record.plugin_results]
    ) if claim_records else 1.0

    weighted_signal = sum(float(weights.get(key, 0.0)) * value for key, value in lane_payload.items())
    weighted_signal += validation_score * 0.5
    weighted_signal -= float(penalties.get("contradiction", 1.0)) * contradiction_penalty
    weighted_signal -= float(penalties.get("stale", 0.8)) * stale_penalty
    weighted_signal -= float(penalties.get("out_of_domain", 1.0)) * out_of_domain_penalty
    weighted_signal -= float(penalties.get("uncertainty", 0.7)) * uncertainty_penalty
    weighted_signal -= float(penalties.get("noise", 0.8)) * lane_scores.get("noise_fraction", 0.0)
    weighted_signal -= missing_penalty
    tau = float(hard_cfg.get("tau", 2.0))
    omega = clip01(sigmoid(weighted_signal - tau))

    pass_threshold = float(thresholds.get("pass_to_stage_5", 0.85))
    stage7_threshold = float(thresholds.get("send_to_stage_7", 0.60))
    route_reason = "structural purity accepted"
    unresolved_reason = None
    route = StageRoute.stage_5_pass
    hard_failures: list[str] = []

    if hard_failure:
        hard_failures.append(hard_failure)
        route = StageRoute.query_tank_pending
        route_reason = hard_failure
        unresolved_reason = hard_failure
    elif omega >= pass_threshold:
        route = StageRoute.stage_5_pass
    elif omega >= stage7_threshold:
        route = StageRoute.stage_7_verify
        route_reason = "external verifier required"
        unresolved_reason = "external verifier required"
    else:
        route = StageRoute.query_tank_pending
        route_reason = "low structural purity"
        unresolved_reason = "low structural purity"

    query_tank_item = None
    if route == StageRoute.query_tank_pending:
        query_tank_item = QueryTankItem(
            query_id=query_id,
            answer_id=answer_id,
            reason=unresolved_reason or route_reason,
            required_next_action="human_or_external_review",
        ).model_dump(mode="json")

    feature_payload = {
        "omega": omega,
        "validation_score": clip01(validation_score),
        "agreement_score": clip01(agreement_score),
        "classical_ml_score": classical_ml.ensemble_score if classical_ml else 0.5,
        "anomaly_score": classical_ml.anomaly_score if classical_ml else 0.5,
        "novelty_score": classical_ml.novelty_score if classical_ml else 0.5,
        "graph_refinement_score": clip01(lane_payload["graph_refinement"]),
        "structural_purity": clip01(mean(lane_payload.values())),
        "out_of_domain_penalty": out_of_domain_penalty,
        "stale_penalty": stale_penalty,
        "contradiction_penalty": contradiction_penalty,
        "uncertainty_penalty": clip01(uncertainty_penalty),
    }

    return HardMeshConsensusResult(
        omega=omega,
        route=route,
        route_reason=route_reason,
        lane_scores={**lane_scores, **lane_payload},
        lane_warnings=(
            lane_warnings
            + validation.warnings
            + agreement.warnings
            + (classical_ml.warnings if classical_ml else [])
        ),
        validation_metrics=validation.model_dump(mode="json"),
        agreement_metrics=agreement.model_dump(mode="json"),
        classical_ml=classical_ml,
        unresolved_reason=unresolved_reason,
        feature_payload=feature_payload,
        query_tank_item=query_tank_item,
    )
