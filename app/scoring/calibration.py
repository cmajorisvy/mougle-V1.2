"""Calibration interfaces for TVS conversion."""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np
from sklearn.isotonic import IsotonicRegression


class Calibrator(ABC):
    @abstractmethod
    def calibrate(self, value: float) -> float:
        raise NotImplementedError


class IdentityCalibrator(Calibrator):
    def calibrate(self, value: float) -> float:
        return max(0.0, min(1.0, value))


class SklearnIsotonicCalibrator(Calibrator):
    """Calibration-ready adapter. Falls back to identity until fitted."""

    def __init__(self) -> None:
        self.model = IsotonicRegression(out_of_bounds="clip")
        self._is_fit = False

    def fit(self, raw_scores: list[float], labels: list[float]) -> None:
        x = np.array(raw_scores)
        y = np.array(labels)
        self.model.fit(x, y)
        self._is_fit = True

    def calibrate(self, value: float) -> float:
        val = max(0.0, min(1.0, value))
        if not self._is_fit:
            return val
        out = float(self.model.predict(np.array([val]))[0])
        return max(0.0, min(1.0, out))
