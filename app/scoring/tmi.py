"""Truth Maturity Index computation."""

from __future__ import annotations


def compute_tmi(
    brier_loss: float = 0.1,
    cal_loss: float = 0.1,
    ood_loss: float = 0.1,
    drift_loss: float = 0.1,
    coverage: float = 0.8,
    alpha: float = 0.25,
    beta: float = 0.2,
    gamma: float = 0.2,
    delta: float = 0.2,
    eta: float = 0.15,
) -> float:
    val = (
        1.0
        - alpha * brier_loss
        - beta * cal_loss
        - gamma * ood_loss
        - delta * drift_loss
        - eta * (1.0 - coverage)
    )
    return round(max(0.0, min(1.0, val)), 4)
