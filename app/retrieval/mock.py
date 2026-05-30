"""In-memory retriever for prototype verification runs."""

from __future__ import annotations

import hashlib
import re
from typing import Iterable

from app.models import AtomicClaim, CorpusItemInput, EvidenceItem, EvidenceSource, Query
from app.retrieval.base import EvidenceRetriever


TOKEN = re.compile(r"[A-Za-z0-9]+")


def _tokens(text: str) -> set[str]:
    return {t.lower() for t in TOKEN.findall(text)}


class InMemoryRetriever(EvidenceRetriever):
    def __init__(self, corpus: Iterable[CorpusItemInput], top_k: int = 5) -> None:
        self.corpus = list(corpus)
        self.top_k = top_k

    def retrieve(self, query: Query, claim: AtomicClaim) -> list[EvidenceItem]:
        claim_tokens = _tokens(query.text) | _tokens(claim.text)
        scored: list[tuple[float, CorpusItemInput]] = []
        for item in self.corpus:
            evidence_tokens = _tokens(item.text)
            overlap = len(claim_tokens & evidence_tokens)
            if overlap == 0:
                continue
            score = overlap / max(1, len(claim_tokens))
            scored.append((score, item))

        scored.sort(key=lambda x: x[0], reverse=True)
        results: list[EvidenceItem] = []
        for rank, (_, item) in enumerate(scored[: self.top_k]):
            quote = item.text[:220]
            source = EvidenceSource(
                source_id=item.source_id,
                source_name=item.source_name,
                reliability=item.reliability,
                url_or_path=item.url_or_path,
            )
            evidence_id = hashlib.sha1(
                f"{claim.claim_id}:{item.source_id}:{rank}".encode("utf-8")
            ).hexdigest()[:16]
            results.append(
                EvidenceItem(
                    evidence_id=f"ev_{evidence_id}",
                    source=source,
                    text=item.text,
                    quote=quote,
                    span_start=0,
                    span_end=len(quote),
                    timestamp=item.timestamp,
                    retrieval_method="in_memory_overlap",
                )
            )
        return results
