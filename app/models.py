"""Typed domain models for the Verified Truth Pyramid prototype."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class VerdictLabel(str, Enum):
    supported = "supported"
    refuted = "refuted"
    not_enough_evidence = "not_enough_evidence"
    stale = "stale"
    source_conflict = "source_conflict"
    out_of_domain = "out_of_domain"
    pending_human_review = "pending_human_review"


class Query(BaseModel):
    query_id: str
    text: str
    created_at: datetime = Field(default_factory=utc_now)


class CandidateAnswer(BaseModel):
    answer_id: str
    query_id: str
    text: str
    created_at: datetime = Field(default_factory=utc_now)


class AtomicClaim(BaseModel):
    claim_id: str
    answer_id: str
    text: str
    span_start: int
    span_end: int
    sentence_index: int


class EvidenceSource(BaseModel):
    source_id: str
    source_name: str
    url_or_path: Optional[str] = None
    reliability: float = Field(ge=0.0, le=1.0, default=0.5)


class EvidenceItem(BaseModel):
    evidence_id: str
    source: EvidenceSource
    text: str
    quote: Optional[str] = None
    span_start: Optional[int] = None
    span_end: Optional[int] = None
    timestamp: Optional[datetime] = None
    retrieval_method: str = "mock_in_memory"


class VerificationPluginResult(BaseModel):
    plugin_name: str
    score: float = Field(ge=0.0, le=1.0)
    uncertainty: float = Field(ge=0.0, le=1.0)
    provenance: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    feature_vector: dict[str, float] = Field(default_factory=dict)


class ClaimVerdict(BaseModel):
    claim_id: str
    label: VerdictLabel
    confidence: float = Field(ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)


class ClaimVerificationRecord(BaseModel):
    claim: AtomicClaim
    evidences: list[EvidenceItem]
    plugin_results: list[VerificationPluginResult]
    verdict: ClaimVerdict


class MacroMicroAssessment(BaseModel):
    macro_score: float = Field(ge=0.0, le=1.0)
    micro_score: float = Field(ge=0.0, le=1.0)
    disagreement: float = Field(ge=0.0, le=1.0)


class ProvenancePayload(BaseModel):
    query_id: str
    answer_id: str
    claim_ids: list[str]
    graph_snapshot_ref: str
    plugin_provenance: dict[str, Any]


class PublishDecision(BaseModel):
    publish: bool
    unresolved_reason: Optional[str] = None


class TruthMetrics(BaseModel):
    tvs: float = Field(ge=0.0, le=100.0)
    tmi: float = Field(ge=0.0, le=1.0)


class AnswerVerificationRecord(BaseModel):
    query: Query
    answer: CandidateAnswer
    claim_records: list[ClaimVerificationRecord]
    macro_micro: MacroMicroAssessment
    provenance: ProvenancePayload
    truth_metrics: TruthMetrics
    publish_decision: PublishDecision
    final_verdict: VerdictLabel


class CorpusItemInput(BaseModel):
    source_id: str
    source_name: str
    text: str
    timestamp: Optional[datetime] = None
    reliability: float = Field(default=0.5, ge=0.0, le=1.0)
    url_or_path: Optional[str] = None


class VerifyRequest(BaseModel):
    query: str
    answer: str
    corpus: list[CorpusItemInput]


class VerifyResponse(BaseModel):
    answer_id: str
    tvs: float
    tmi: float
    publish: bool
    verdict: VerdictLabel
    claims: list[ClaimVerificationRecord]
    macro_micro: MacroMicroAssessment
    provenance: ProvenancePayload
    unresolved_reason: Optional[str]
