"""Classical ML verification bus for HARD-MESH structural signals.

The bus intentionally produces structural cleanliness and readiness signals only.
It does not decide truth and does not replace claim/evidence verification.
"""

from __future__ import annotations

from statistics import mean

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.svm import OneClassSVM

from app.models import ClassicalMLVerificationResult
from app.stage6.utils import clip01


def _normalize_decision_scores(scores: np.ndarray) -> list[float]:
    """Normalize arbitrary detector decision scores into `[0, 1]` cleanliness values."""

    if scores.size == 0:
        return []
    min_score = float(np.min(scores))
    max_score = float(np.max(scores))
    if abs(max_score - min_score) < 1e-12:
        return [0.5 for _ in scores]
    return [clip01((float(score) - min_score) / (max_score - min_score)) for score in scores]


class ClassicalMLVerificationBus:
    """Runs safe classical ML structural checks over Stage 6 feature matrices."""

    def run(self, matrix: np.ndarray, cfg: dict) -> ClassicalMLVerificationResult:
        sample_count = int(matrix.shape[0]) if matrix.ndim == 2 else 0
        feature_count = int(matrix.shape[1]) if matrix.ndim == 2 and sample_count else 0
        warnings: list[str] = []
        details: dict[str, object] = {
            "sample_count": sample_count,
            "feature_count": feature_count,
            "supported_future_estimators": [
                "CalibratedClassifierCV",
                "VotingClassifier",
                "StackingClassifier",
                "RandomizedSearchCV",
            ],
        }

        classical_cfg = cfg.get("classical_ml", {})
        min_samples = int(classical_cfg.get("min_samples", 4))
        min_calibration_samples = int(classical_cfg.get("min_calibration_samples", 20))
        if sample_count < min_samples or feature_count == 0:
            warnings.append("classical ML bus skipped detectors: dataset below min_samples")
            return ClassicalMLVerificationResult(
                anomaly_score=0.5,
                novelty_score=0.5,
                ensemble_score=0.5,
                calibration_ready=False,
                stacking_ready=False,
                tuning_ready=False,
                warnings=warnings,
                details=details,
            )

        detector_scores: list[float] = []
        try:
            isolation = IsolationForest(random_state=42, contamination="auto")
            isolation.fit(matrix)
            iso_values = _normalize_decision_scores(isolation.decision_function(matrix))
            anomaly_score = mean(iso_values) if iso_values else 0.5
            detector_scores.append(anomaly_score)
            details["isolation_forest"] = {
                "cleanliness_values": iso_values,
                "score_mean": anomaly_score,
            }
        except Exception as exc:  # pragma: no cover - defensive sklearn fallback
            anomaly_score = 0.5
            warnings.append(f"IsolationForest skipped: {exc}")

        try:
            novelty = OneClassSVM(gamma="scale")
            novelty.fit(matrix)
            novelty_values = _normalize_decision_scores(novelty.decision_function(matrix))
            novelty_score = mean(novelty_values) if novelty_values else 0.5
            detector_scores.append(novelty_score)
            details["one_class_svm"] = {
                "cleanliness_values": novelty_values,
                "score_mean": novelty_score,
            }
        except Exception as exc:  # pragma: no cover - defensive sklearn fallback
            novelty_score = 0.5
            warnings.append(f"OneClassSVM skipped: {exc}")

        ensemble_score = mean(detector_scores) if detector_scores else 0.5
        calibration_ready = sample_count >= min_calibration_samples
        if not calibration_ready:
            warnings.append("calibration/stacking/tuning readiness requires more labeled evaluation data")

        return ClassicalMLVerificationResult(
            anomaly_score=clip01(anomaly_score),
            novelty_score=clip01(novelty_score),
            ensemble_score=clip01(ensemble_score),
            calibration_ready=calibration_ready,
            stacking_ready=calibration_ready,
            tuning_ready=calibration_ready,
            warnings=warnings,
            details=details,
        )
