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


class AgentActionClass(str, Enum):
    proceed_local = "proceed_local"
    ask_user = "ask_user"
    simulate_more = "simulate_more"
    escalate_to_council = "escalate_to_council"
    block = "block"
    archive = "archive"


class SignalDestination(str, Enum):
    local_archive = "local_archive"
    agent_wake = "agent_wake"
    main_engine = "main_engine"
    admin_review = "admin_review"
    query_tank = "query_tank"


class ArchiveReuseClassification(str, Enum):
    reuse_candidate = "reuse_candidate"
    adapt_candidate = "adapt_candidate"
    reference_only = "reference_only"
    archive_only = "archive_only"
    blocked_secret_risk = "blocked_secret_risk"


class ArchiveIntegrationLayer(str, Enum):
    cross_cutting = "cross_cutting"
    stage5_micro_pyramid = "stage5_micro_pyramid"
    stage6_boundary = "stage6_boundary"
    stage7_foundation = "stage7_foundation"
    admin_governance = "admin_governance"
    reference_only = "reference_only"
    archive_only = "archive_only"


class MicroPyramidSignalBand(str, Enum):
    personal_context = "personal_context"
    professional_business = "professional_business"
    community = "community"
    knowledge_contribution = "knowledge_contribution"
    risk_safety = "risk_safety"
    reputation_gluon = "reputation_gluon"
    marketplace_product = "marketplace_product"
    debate_podcast = "debate_podcast"


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


class Agent(BaseModel):
    agent_id: str
    owner_user_id: str
    role: str = "assistant"
    status: str = "active"
    default_model: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AgentPassport(BaseModel):
    agent_id: str
    owner: str
    purpose: str
    allowed_vaults: list[str] = Field(default_factory=list)
    blocked_vaults: list[str] = Field(default_factory=list)
    communication_scope: list[str] = Field(default_factory=list)
    automation_level: str = "assisted"
    marketplace_status: str = "private"
    risk_limit: float = Field(default=0.5, ge=0.0, le=1.0)
    trust_score: float = Field(default=0.5, ge=0.0, le=1.0)
    ues_score: float = Field(default=0.5, ge=0.0, le=1.0)
    audit_status: str = "enabled"
    passport_version: str = "v1"


class AgentActionRequest(BaseModel):
    request_id: str
    agent_id: str
    action_type: str
    context_ref: Optional[str] = None
    owner_permission: bool = True
    vault_permission: bool = True
    action_permission: bool = True
    risk_allowed: bool = True
    safe_mode_allowed: bool = True
    law_allowed: bool = True
    audit_enabled: bool = True
    permission_fit: float = Field(default=1.0, ge=0.0, le=1.0)
    goal_alignment: float = Field(default=0.5, ge=0.0, le=1.0)
    memory_relevance: float = Field(default=0.5, ge=0.0, le=1.0)
    tool_safety: float = Field(default=0.5, ge=0.0, le=1.0)
    simulation_success: float = Field(default=0.5, ge=0.0, le=1.0)
    user_benefit: float = Field(default=0.5, ge=0.0, le=1.0)
    local_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    uncertainty: float = Field(default=0.5, ge=0.0, le=1.0)
    notification_fatigue: float = Field(default=0.0, ge=0.0, le=1.0)
    legal_sensitivity: bool = False
    financial_sensitivity: bool = False
    target_stage: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class AgentSimulationRun(BaseModel):
    sim_run_id: str
    agent_id: str
    request_id: str
    outcome_score: float = Field(ge=0.0, le=1.0)
    risk_score: float = Field(ge=0.0, le=1.0)
    goal_fit: float = Field(ge=0.0, le=1.0)
    tool_success_probability: float = Field(ge=0.0, le=1.0)
    escalation_need: float = Field(ge=0.0, le=1.0)
    uncertainty: float = Field(ge=0.0, le=1.0)
    explanation: str
    provenance_ref: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class AgentMicroPyramidState(BaseModel):
    agent_id: str
    local_readiness: float = Field(ge=0.0, le=1.0)
    action_class: AgentActionClass
    u1_action_crown: str = "not_final_truth"
    u2_local_mesh_state: str = "observed"
    u3_dual_local_view: str = "local_only"
    u4_memory_state: str = "permission_checked"
    u5_readiness_equation: str = "computed"
    u6_local_fast_verification: str = "simulated"
    u7_last_event_at: datetime = Field(default_factory=utc_now)
    notification_fatigue: float = Field(default=0.0, ge=0.0, le=1.0)
    updated_at: datetime = Field(default_factory=utc_now)


class AgentActionDecision(BaseModel):
    request_id: str
    agent_id: str
    can_act: bool
    action_class: AgentActionClass
    local_readiness: float = Field(ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)
    simulation: AgentSimulationRun
    micro_pyramid: AgentMicroPyramidState
    council_socket: Optional[dict[str, Any]] = None


class SignalEvent(BaseModel):
    event_id: str
    cloudevent_id: str
    event_type: str
    actor_id: str
    actor_type: str
    target_id: Optional[str] = None
    topic_id: Optional[str] = None
    privacy_level: str = "restricted"
    risk_level: str = "low"
    source: str = "local"
    raw_payload_ref: Optional[str] = None
    processing_status: str = "received"
    occurred_at: datetime = Field(default_factory=utc_now)
    created_at: datetime = Field(default_factory=utc_now)


class SignalVector(BaseModel):
    event_id: str
    novelty: float = Field(default=0.5, ge=0.0, le=1.0)
    evidence_strength: float = Field(default=0.5, ge=0.0, le=1.0)
    user_reputation: float = Field(default=0.5, ge=0.0, le=1.0)
    expert_weight: float = Field(default=0.0, ge=0.0, le=1.0)
    debate_intensity: float = Field(default=0.0, ge=0.0, le=1.0)
    correction_frequency: float = Field(default=0.0, ge=0.0, le=1.0)
    topic_momentum: float = Field(default=0.0, ge=0.0, le=1.0)
    marketplace_value: float = Field(default=0.0, ge=0.0, le=1.0)
    newsworthiness: float = Field(default=0.0, ge=0.0, le=1.0)
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    spam_probability: float = Field(default=0.0, ge=0.0, le=1.0)
    legal_sensitivity: float = Field(default=0.0, ge=0.0, le=1.0)
    duplication_penalty: float = Field(default=0.0, ge=0.0, le=1.0)
    time_decay: float = Field(default=1.0, ge=0.0, le=1.0)
    signal_strength: float = Field(default=0.0, ge=0.0, le=1.0)
    routing_priority: float = Field(default=0.0, ge=0.0, le=1.0)


class SignalRoute(BaseModel):
    route_id: str
    event_id: str
    destination_type: SignalDestination
    priority_score: float = Field(ge=0.0, le=1.0)
    route_reason: str
    worker_queue: str
    sent_to_main_engine: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class SignalProcessingRecord(BaseModel):
    event: SignalEvent
    vector: SignalVector
    route: SignalRoute


class ArchiveReuseCandidate(BaseModel):
    original_path: str
    archived_path: str
    compatibility_score: float = Field(ge=0.0, le=1.0)
    raw_classification: str
    classification: ArchiveReuseClassification
    secret_risk: str = "none"
    target_layer: ArchiveIntegrationLayer
    target_stage: str
    micro_pyramid_band: Optional[MicroPyramidSignalBand] = None
    required_adaptation: str
    estimated_effort: str
    risk_level: str
    recommended_action: str
    reason_for_match: str = ""
    dependencies: list[str] = Field(default_factory=list)
    security_concerns: list[str] = Field(default_factory=list)
    architecture_concerns: list[str] = Field(default_factory=list)
    blocked: bool = False
    block_reason: Optional[str] = None


class ArchiveReuseMatrix(BaseModel):
    archive_timestamp: str
    archive_path: str
    source_manifest: str
    files_scanned: int
    candidates: list[ArchiveReuseCandidate]
    classification_summary: dict[str, int]
    target_layer_summary: dict[str, int]
    blocked_by_secret_risk: int
    warnings: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=utc_now)


class RuntimeImportViolation(BaseModel):
    file_path: str
    line_number: int
    import_text: str
    reason: str


class RuntimeImportCheck(BaseModel):
    scanned_files: int
    violation_count: int
    violations: list[RuntimeImportViolation] = Field(default_factory=list)
    passed: bool
    generated_at: datetime = Field(default_factory=utc_now)


class AgentActionEvaluationRequest(BaseModel):
    request: AgentActionRequest
    passport: AgentPassport


class SignalEventRequest(BaseModel):
    event: SignalEvent
    hints: dict[str, Any] = Field(default_factory=dict)


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
