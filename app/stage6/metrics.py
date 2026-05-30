"""Validation and agreement metrics for HARD-MESH lane outputs."""

from __future__ import annotations

import itertools

import numpy as np
from sklearn.metrics import (
    adjusted_mutual_info_score,
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)

from app.models import AgreementMetricResult, ClusterLaneResult, ValidationMetricResult
from app.stage6.utils import clip01, unique_cluster_count


def _valid_labels(labels: list[int], sample_count: int) -> bool:
    cluster_count = unique_cluster_count(labels)
    return len(labels) == sample_count and 2 <= cluster_count < sample_count


def compute_validation_metrics(
    matrix: np.ndarray, lane_results: list[ClusterLaneResult]
) -> ValidationMetricResult:
    """Compute internal clustering metrics when label shapes are valid."""
    raw: dict[str, float] = {}
    normalized: dict[str, float] = {}
    warnings: list[str] = []

    usable = next(
        (lane for lane in lane_results if not lane.skipped and _valid_labels(lane.labels, len(matrix))),
        None,
    )
    if usable is None:
        warnings.append("validation metrics skipped: no lane has a valid cluster shape")
        return ValidationMetricResult(raw_metrics=raw, normalized_metrics=normalized, warnings=warnings)

    labels = usable.labels
    try:
        sil = float(silhouette_score(matrix, labels))
        raw["silhouette"] = sil
        normalized["silhouette"] = clip01((sil + 1.0) / 2.0)
    except Exception as exc:  # pragma: no cover - sklearn edge cases
        warnings.append(f"silhouette skipped: {exc}")
    try:
        ch = float(calinski_harabasz_score(matrix, labels))
        raw["calinski_harabasz"] = ch
        normalized["calinski_harabasz"] = clip01(ch / (ch + 100.0))
    except Exception as exc:  # pragma: no cover
        warnings.append(f"calinski_harabasz skipped: {exc}")
    try:
        db = float(davies_bouldin_score(matrix, labels))
        raw["davies_bouldin"] = db
        normalized["davies_bouldin"] = clip01(1.0 / (1.0 + db))
    except Exception as exc:  # pragma: no cover
        warnings.append(f"davies_bouldin skipped: {exc}")

    return ValidationMetricResult(
        raw_metrics=raw,
        normalized_metrics=normalized,
        warnings=warnings,
    )


def compute_agreement_metrics(lane_results: list[ClusterLaneResult]) -> AgreementMetricResult:
    """Compute pairwise label agreement across available cluster views."""
    usable = [lane for lane in lane_results if not lane.skipped and lane.labels]
    raw: dict[str, float] = {}
    normalized: dict[str, float] = {}
    warnings: list[str] = []

    if len(usable) < 2:
        warnings.append("agreement metrics skipped: fewer than two usable lane outputs")
        return AgreementMetricResult(raw_metrics=raw, normalized_metrics=normalized, warnings=warnings)

    ari_values = []
    ami_values = []
    for left, right in itertools.combinations(usable, 2):
        if len(left.labels) != len(right.labels):
            warnings.append(f"agreement skipped for {left.lane_name}/{right.lane_name}: length mismatch")
            continue
        ari_values.append(float(adjusted_rand_score(left.labels, right.labels)))
        ami_values.append(float(adjusted_mutual_info_score(left.labels, right.labels)))

    if not ari_values:
        warnings.append("agreement metrics skipped: no comparable lane pairs")
        return AgreementMetricResult(raw_metrics=raw, normalized_metrics=normalized, warnings=warnings)

    ari = float(np.mean(ari_values))
    ami = float(np.mean(ami_values))
    raw["adjusted_rand"] = ari
    raw["adjusted_mutual_info"] = ami
    normalized["adjusted_rand"] = clip01((ari + 1.0) / 2.0)
    normalized["adjusted_mutual_info"] = clip01((ami + 1.0) / 2.0)
    return AgreementMetricResult(raw_metrics=raw, normalized_metrics=normalized, warnings=warnings)

