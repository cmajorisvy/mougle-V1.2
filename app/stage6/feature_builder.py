"""Deterministic feature extraction for Stage 6 HARD-MESH intake."""

from __future__ import annotations

from datetime import datetime
from statistics import mean

from app.models import (
    AtomicClaim,
    ClaimVerificationRecord,
    FeatureBundle,
    FeatureRowMetadata,
    VerdictLabel,
)


def _tokens(text: str) -> set[str]:
    return {part.strip(".,;:!?()[]{}\"'").lower() for part in text.split() if part.strip()}


def _lexical_overlap(claim: AtomicClaim, record: ClaimVerificationRecord) -> float:
    claim_tokens = _tokens(claim.text)
    if not claim_tokens or not record.evidences:
        return 0.0
    overlaps = []
    for evidence in record.evidences:
        ev_tokens = _tokens(evidence.text)
        overlaps.append(len(claim_tokens & ev_tokens) / max(1, len(claim_tokens)))
    return mean(overlaps) if overlaps else 0.0


def _provenance_completeness(record: ClaimVerificationRecord) -> float:
    if not record.evidences:
        return 0.0
    scores = []
    for evidence in record.evidences:
        fields = [
            bool(evidence.source.source_id),
            bool(evidence.timestamp),
            bool(evidence.retrieval_method),
            bool(evidence.quote),
            evidence.span_start is not None and evidence.span_end is not None,
        ]
        scores.append(sum(1 for field in fields if field) / len(fields))
    return mean(scores)


class Stage6FeatureBuilder:
    """Builds local numeric features with row metadata tied to claim/evidence IDs."""

    feature_names = [
        "source_reliability_mean",
        "evidence_count",
        "support_count",
        "refutation_count",
        "contradiction_count",
        "freshness_score",
        "staleness_indicator",
        "provenance_completeness",
        "numeric_consistency_score",
        "retrieval_score",
        "plugin_mean_score",
        "plugin_mean_uncertainty",
        "graph_degree_proxy",
        "graph_clustering_proxy",
        "component_size_proxy",
        "source_diversity",
        "claim_token_count",
        "evidence_token_count_mean",
        "lexical_overlap",
        "source_conflict_flag",
    ]

    def build(
        self,
        claim_records: list[ClaimVerificationRecord],
        graph_features: dict[str, float],
        now: datetime,
    ) -> FeatureBundle:
        rows: list[list[float]] = []
        metadata: list[FeatureRowMetadata] = []
        warnings: list[str] = []

        if not claim_records:
            warnings.append("no claims available for HARD-MESH feature extraction")

        for index, record in enumerate(claim_records):
            evidences = record.evidences
            reliabilities = [e.source.reliability for e in evidences]
            source_ids = [e.source.source_id for e in evidences]
            evidence_ids = [e.evidence_id for e in evidences]
            ages = [max(0.0, (now - e.timestamp).days) for e in evidences if e.timestamp]
            freshness_score = 0.0 if not ages else max(0.0, 1.0 - (mean(ages) / 365.0))
            plugin_scores = [p.score for p in record.plugin_results]
            plugin_uncertainties = [p.uncertainty for p in record.plugin_results]
            plugin_features = {
                key: value
                for plugin in record.plugin_results
                for key, value in plugin.feature_vector.items()
            }
            contradiction_count = plugin_features.get("contradiction_pressure", 0.0) * len(evidences)
            evidence_token_counts = [len(_tokens(e.text)) for e in evidences]
            source_diversity = len(set(source_ids)) / max(1, len(source_ids))
            support_count = 1 if record.verdict.label == VerdictLabel.supported else 0
            refutation_count = 1 if record.verdict.label in {VerdictLabel.refuted, VerdictLabel.source_conflict} else 0
            source_conflict = 1.0 if record.verdict.label == VerdictLabel.source_conflict else 0.0

            rows.append(
                [
                    mean(reliabilities) if reliabilities else 0.0,
                    float(len(evidences)),
                    float(support_count),
                    float(refutation_count),
                    float(contradiction_count),
                    float(freshness_score),
                    1.0 if record.verdict.label == VerdictLabel.stale else 0.0,
                    _provenance_completeness(record),
                    plugin_features.get("numeric_consistency", 0.0),
                    plugin_features.get("evidence_count", float(len(evidences))) / 3.0,
                    mean(plugin_scores) if plugin_scores else 0.0,
                    mean(plugin_uncertainties) if plugin_uncertainties else 1.0,
                    graph_features.get("coverage", 0.0),
                    graph_features.get("graph_density", 0.0),
                    graph_features.get("component_size_proxy", 1.0),
                    source_diversity,
                    float(len(_tokens(record.claim.text))),
                    mean(evidence_token_counts) if evidence_token_counts else 0.0,
                    _lexical_overlap(record.claim, record),
                    source_conflict,
                ]
            )
            metadata.append(
                FeatureRowMetadata(
                    row_id=f"row_{index}",
                    claim_id=record.claim.claim_id,
                    evidence_ids=evidence_ids,
                    source_ids=source_ids,
                )
            )

        return FeatureBundle(
            matrix=rows,
            feature_names=self.feature_names,
            row_metadata=metadata,
            graph_features=graph_features,
            warnings=warnings,
        )

