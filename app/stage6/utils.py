"""Shared helpers for HARD-MESH scoring and normalization."""

from __future__ import annotations

import math


def clip01(value: float) -> float:
    """Clamp a numeric signal into the [0, 1] interval."""
    if math.isnan(value) or math.isinf(value):
        return 0.0
    return max(0.0, min(1.0, value))


def sigmoid(value: float) -> float:
    """Stable sigmoid used by HARD-MESH consensus."""
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def unique_cluster_count(labels: list[int]) -> int:
    """Count non-noise clusters, where -1 is treated as noise."""
    return len({label for label in labels if label != -1})

