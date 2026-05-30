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


class StageRoute(str, Enum):
    stage_5_pass = "stage_5_pass"
    stage_7_verify = "stage_7_verify"
    query_tank_pending = "query_tank_pending"


class CouncilId(str, Enum):
    ai_agents = "ai_agents"
    knowledge_truth = "knowledge_truth"
    podcast_forum_debates = "podcast_forum_debates"
    newsrooms = "newsrooms"
    system_management = "system_management"
    legal_management = "legal_management"
    financial_management = "financial_management"


class CouncilSocketRoute(str, Enum):
    stage_7_then_stage_6 = "stage_7_then_stage_6"
    stage_6_hard_mesh = "stage_6_hard_mesh"
    query_tank_pending = "query_tank_pending"
    rejected = "rejected"


class PolicyDecisionOutcome(str, Enum):
    allow = "allow"
    deny = "deny"
    needs_review = "needs_review"


class ExternalVerifierVerdict(str, Enum):
    support = "support"
    contradict = "contradict"
    insufficient = "insufficient"


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


class ExternalVerifierResult(BaseModel):
    provider: str = "mock"
    model: str = "external-judge-stub"
    verdict: ExternalVerifierVerdict = ExternalVerifierVerdict.insufficient
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_quality: float = Field(default=0.0, ge=0.0, le=1.0)
    contradiction_count: int = Field(default=0, ge=0)
    schema_valid: bool = True
    rationale: str = "stubbed external verifier result"
    citations: list[str] = Field(default_factory=list)


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
    disagreement_reason: Optional[str] = None


class FeatureRowMetadata(BaseModel):
    row_id: str
    claim_id: str
    evidence_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)


class FeatureBundle(BaseModel):
    matrix: list[list[float]]
    feature_names: list[str]
    row_metadata: list[FeatureRowMetadata]
    graph_features: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class ClusterLaneResult(BaseModel):
    lane_name: str
    labels: list[int] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    score: float = Field(default=0.0, ge=0.0, le=1.0)
    skipped: bool = False
    warnings: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class ClusterRunResult(BaseModel):
    lane_results: list[ClusterLaneResult]
    warnings: list[str] = Field(default_factory=list)


class ValidationMetricResult(BaseModel):
    raw_metrics: dict[str, float] = Field(default_factory=dict)
    normalized_metrics: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class AgreementMetricResult(BaseModel):
    raw_metrics: dict[str, float] = Field(default_factory=dict)
    normalized_metrics: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class ClassicalMLVerificationResult(BaseModel):
    anomaly_score: float = Field(default=0.5, ge=0.0, le=1.0)
    novelty_score: float = Field(default=0.5, ge=0.0, le=1.0)
    ensemble_score: float = Field(default=0.5, ge=0.0, le=1.0)
    calibration_ready: bool = False
    stacking_ready: bool = False
    tuning_ready: bool = False
    warnings: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class HardMeshGateResult(BaseModel):
    route: StageRoute
    route_reason: str
    unresolved_reason: Optional[str] = None
    hard_failures: list[str] = Field(default_factory=list)


class HardMeshConsensusResult(BaseModel):
    omega: float = Field(ge=0.0, le=1.0)
    route: StageRoute
    route_reason: str
    lane_scores: dict[str, float] = Field(default_factory=dict)
    lane_warnings: list[str] = Field(default_factory=list)
    validation_metrics: dict[str, Any] = Field(default_factory=dict)
    agreement_metrics: dict[str, Any] = Field(default_factory=dict)
    classical_ml: Optional[ClassicalMLVerificationResult] = None
    unresolved_reason: Optional[str] = None
    feature_payload: dict[str, float] = Field(default_factory=dict)
    query_tank_item: Optional[dict[str, Any]] = None


class RawVerificationInput(BaseModel):
    query: Query
    answer: CandidateAnswer
    claims: list[AtomicClaim]
    claim_records: list["ClaimVerificationRecord"] = Field(default_factory=list)
    graph_features: dict[str, float] = Field(default_factory=dict)
    external_verifier_results: list[ExternalVerifierResult] = Field(default_factory=list)


class QueryTankItem(BaseModel):
    query_id: str
    answer_id: str
    claim_id: Optional[str] = None
    reason: str
    category: str = "uncertainty"
    status: str = "open"
    required_next_action: str
    valid_from: datetime = Field(default_factory=utc_now)
    valid_to: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    last_updated: datetime = Field(default_factory=utc_now)


class PersistenceSignature(BaseModel):
    signature_id: str
    graph_hash: str
    created_at: datetime = Field(default_factory=utc_now)


class TopologySnapshot(BaseModel):
    snapshot_id: str
    node_count: int
    edge_count: int
    connected_components: int
    component_sizes: list[int]
    cycle_rank: int
    graph_density: float = Field(ge=0.0, le=1.0)
    average_degree: float
    clustering_coefficient: float = Field(ge=0.0, le=1.0)
    stability_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    topology_drift: bool = False


class PurityFeatureSet(BaseModel):
    omega: float = Field(ge=0.0, le=1.0)
    structural_purity: float = Field(ge=0.0, le=1.0)
    graph_refinement_score: float = Field(ge=0.0, le=1.0)
    validation_score: float = Field(ge=0.0, le=1.0)
    agreement_score: float = Field(ge=0.0, le=1.0)


class PurityUpdate(BaseModel):
    answer_id: str
    feature_set: PurityFeatureSet
    created_at: datetime = Field(default_factory=utc_now)


class CouncilSocketEnvelope(BaseModel):
    socket_id: str
    event_id: str = ""
    spec_version: str = "1.0"
    council_id: CouncilId = CouncilId.ai_agents
    bound_unit_id: str
    schema_id: str
    origin_stage: str
    trace_id: str
    request_id: str
    tenant_id: Optional[str] = None
    classification: Optional[str] = None
    deadline_ms: Optional[int] = None
    content_type: str = "application/vnd.mougle.council-event+json"
    action: str = "verify"
    object_id: Optional[str] = None
    object_type: Optional[str] = None
    payload_ref: Optional[str] = None
    policy_context: dict[str, Any] = Field(default_factory=dict)
    provenance_ref: Optional[str] = None
    lineage_ref: Optional[str] = None
    trace_context: dict[str, Any] = Field(default_factory=dict)
    sensitivity: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: Optional[str] = None
    target_stage: Optional[str] = None
    requires_human_review: bool = False
    payload_hash: Optional[str] = None
    signature: Optional[str] = None
    request_payload: dict[str, Any] = Field(default_factory=dict)
    response_payload: dict[str, Any] = Field(default_factory=dict)
    status: str = "pending"
    created_at: datetime = Field(default_factory=utc_now)


class CouncilSocketDecision(BaseModel):
    decision_id: str
    socket_id: str
    council_id: CouncilId
    unit_id: str
    route: CouncilSocketRoute
    policy_decision: PolicyDecisionOutcome
    route_reason: str
    blocked_stage_bypass: bool = False
    requires_human_review: bool = False
    provenance_ref: Optional[str] = None
    lineage_ref: Optional[str] = None
    trace_id: str
    created_at: datetime = Field(default_factory=utc_now)


class TopologicalEvolutionRecord(BaseModel):
    evolution_id: str
    state_version: str
    answer_id: Optional[str] = None
    previous_snapshot_id: Optional[str] = None
    current_snapshot_id: str
    stage_anchor: str = "stage_4_stage_5_stage_6_core"
    stability_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    topology_drift: bool = False
    event_refs: list[str] = Field(default_factory=list)
    route_hint: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class ProvenancePayload(BaseModel):
    query_id: str
    answer_id: str
    claim_ids: list[str]
    graph_snapshot_ref: str
    plugin_provenance: dict[str, Any]
    hard_mesh_ref: Optional[str] = None
    topology_ref: Optional[str] = None


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
    confidence_explanation: str = ""
    claim_rollup: dict[str, int] = Field(default_factory=dict)
    hard_mesh: Optional[HardMeshConsensusResult] = None
    topology: Optional[TopologySnapshot] = None


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
    options: dict[str, Any] = Field(default_factory=dict)


class VerifyResponse(BaseModel):
    answer_id: str
    tvs: float
    tmi: float
    publish: bool
    verdict: VerdictLabel
    claims: list[ClaimVerificationRecord]
    macro_micro: MacroMicroAssessment
    hard_mesh: Optional[HardMeshConsensusResult] = None
    provenance: ProvenancePayload
    unresolved_reason: Optional[str]
    confidence_explanation: str = ""
    claim_rollup: dict[str, int] = Field(default_factory=dict)


RawVerificationInput.model_rebuild()
