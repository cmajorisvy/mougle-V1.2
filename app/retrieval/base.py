"""Evidence retrieval interfaces."""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.models import AtomicClaim, EvidenceItem, Query


class EvidenceRetriever(ABC):
    """Abstract retriever interface for pluggable evidence backends."""

    @abstractmethod
    def retrieve(self, query: Query, claim: AtomicClaim) -> list[EvidenceItem]:
        raise NotImplementedError
