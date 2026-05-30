"""Verification plugin interface and plugin context models."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.models import AtomicClaim, EvidenceItem, Query, VerificationPluginResult


@dataclass
class PluginContext:
    query: Query
    claim: AtomicClaim
    evidences: list[EvidenceItem]
    all_claims: list[AtomicClaim]
    all_claim_evidence: dict[str, list[EvidenceItem]]
    now: datetime


class VerificationPlugin(ABC):
    name: str

    @abstractmethod
    def evaluate(self, context: PluginContext) -> VerificationPluginResult:
        raise NotImplementedError


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _base_result(name: str, score: float, uncertainty: float, **kwargs: Any) -> VerificationPluginResult:
    return VerificationPluginResult(
        plugin_name=name,
        score=_clip01(score),
        uncertainty=_clip01(uncertainty),
        provenance=kwargs.get("provenance", {}),
        warnings=kwargs.get("warnings", []),
        feature_vector=kwargs.get("feature_vector", {}),
    )
