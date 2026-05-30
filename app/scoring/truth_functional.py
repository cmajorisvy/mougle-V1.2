"""Modular truth functional and TVS computation."""

from __future__ import annotations

import math
from dataclasses import dataclass

from typing import Optional

from app.scoring.calibration import Calibrator, IdentityCalibrator


@dataclass
class ScoreInputs:
    plugin_scores: dict[str, float]
    plugin_uncertainties: dict[str, float]
    graph_features: dict[str, float]
    contradiction_penalty: float
    drift_or_staleness_penalty: float


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _pair_key(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))


def compute_j(inputs: ScoreInputs, cfg: dict) -> float:
    weights = cfg.get("weights", {})
    pairwise = cfg.get("pairwise", {})
    b = float(cfg.get("base_bias", 0.0))
    lam_g = float(cfg.get("lambda_graph", 0.2))
    mu_c = float(cfg.get("mu_contradiction", 0.5))
    mu_u = float(cfg.get("mu_uncertainty", 0.5))
    mu_d = float(cfg.get("mu_drift", 0.3))

    linear = sum(float(weights.get(k, 0.0)) * v for k, v in inputs.plugin_scores.items())

    items = list(inputs.plugin_scores.items())
    inter = 0.0
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            ki, si = items[i]
            kj, sj = items[j]
            inter += float(pairwise.get(_pair_key(ki, kj), 0.0)) * si * sj

    graph_signal = (
        float(inputs.graph_features.get("coverage", 0.0))
        + (1.0 - float(inputs.graph_features.get("contradiction_rate", 1.0)))
    ) / 2.0

    mean_uncertainty = (
        sum(inputs.plugin_uncertainties.values()) / max(1, len(inputs.plugin_uncertainties))
    )

    return (
        b
        + linear
        + inter
        + lam_g * graph_signal
        - mu_c * inputs.contradiction_penalty
        - mu_u * mean_uncertainty
        - mu_d * inputs.drift_or_staleness_penalty
    )


def compute_tvs(inputs: ScoreInputs, cfg: dict, calibrator: Optional[Calibrator] = None) -> float:
    cal = calibrator or IdentityCalibrator()
    j = compute_j(inputs, cfg)
    raw = sigmoid(j)
    calibrated = cal.calibrate(raw)
    return round(100.0 * calibrated, 2)
