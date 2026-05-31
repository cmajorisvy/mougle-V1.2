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


class Stage7Tank(str, Enum):
    supported_data = "stage7_a_supported_data_tank"
    disputed_unknown = "stage7_b_unapproved_disputed_unknown_tank"
    fast_resolver = "stage7_c_classical_ml_fast_resolver"
    spike_layer = "stage7_d_temporal_spike_layer"
    deep_resolver = "stage7_e_deep_resolver"


class Stage7RecordStatus(str, Enum):
    candidate_supported = "candidate_supported"
    unresolved = "unresolved"
    disputed = "disputed"
    unknown = "unknown"
    submitted_to_stage6 = "submitted_to_stage6"


class CollapseState(str, Enum):
    HEALTHY = "HEALTHY"
    WATCH = "WATCH"
    DEGRADED = "DEGRADED"
    SANDBOX = "SANDBOX"
    RESTRICTED = "RESTRICTED"
    EMERGENCY_RESTRICTED = "EMERGENCY_RESTRICTED"
    BLOCKED = "BLOCKED"
    RECOVERY = "RECOVERY"
    RESTORED = "RESTORED"


class CollapseType(str, Enum):
    truth_collapse = "truth_collapse"
    hallucination_collapse = "hallucination_collapse"
    privacy_collapse = "privacy_collapse"
    vault_access_collapse = "vault_access_collapse"
    permission_collapse = "permission_collapse"
    autonomy_collapse = "autonomy_collapse"
    spam_scam_collapse = "spam_scam_collapse"
    marketplace_collapse = "marketplace_collapse"
    communication_collapse = "communication_collapse"
    legal_policy_collapse = "legal_policy_collapse"
    correction_collapse = "correction_collapse"
    governance_collapse = "governance_collapse"
    economic_boundary_collapse = "economic_boundary_collapse"
    multi_agent_coordination_collapse = "multi_agent_coordination_collapse"
    stage6_bypass_attempt = "stage6_bypass_attempt"
    stage4_direct_write_attempt = "stage4_direct_write_attempt"
    stage1_direct_influence_attempt = "stage1_direct_influence_attempt"


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


class Stage7ExternalRecordInput(BaseModel):
    claim_text: str
    source_ref: Optional[str] = None
    evidence_refs: list[str] = Field(default_factory=list)
    tank: Stage7Tank = Stage7Tank.disputed_unknown
    status: Stage7RecordStatus = Stage7RecordStatus.unknown
    provider: str = "mock"
    model: str = "stage7-candidate-memory-stub"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_quality: float = Field(default=0.0, ge=0.0, le=1.0)
    contradiction_count: int = Field(default=0, ge=0)
    rationale: str = "candidate only; Stage 6 required"
    metadata: dict[str, Any] = Field(default_factory=dict)


class Stage7ExternalRecord(BaseModel):
    record_id: str
    claim_text: str
    source_ref: Optional[str] = None
    evidence_refs: list[str] = Field(default_factory=list)
    tank: Stage7Tank
    status: Stage7RecordStatus
    provider: str
    model: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_quality: float = Field(ge=0.0, le=1.0)
    contradiction_count: int = Field(default=0, ge=0)
    rationale: str
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required: bool = True
    stage6_submission_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Stage7ResolutionRequest(BaseModel):
    record_id: str
    resolution_hint: str = "keep_unresolved_until_stage6"
    reviewer: str = "stage7_fast_resolver"


class Stage7SubmissionPackage(BaseModel):
    submission_id: str
    record_id: str
    route: StageRoute = StageRoute.stage_5_pass
    route_reason: str = "candidate packaged for Stage 6 structural verification"
    stage6_required: bool = True
    candidate_answer_not_verified: bool = True
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class Stage7Alert(BaseModel):
    alert_id: str
    record_id: str
    severity: str = "info"
    reason: str
    requires_stage6: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class PodcastRoomStatus(str, Enum):
    active = "active"
    paused = "paused"
    archived = "archived"


class PodcastParticipantRole(str, Enum):
    host = "host"
    participant = "participant"
    expert = "expert"
    agent = "agent"
    moderator = "moderator"


class PodcastInvitationStatus(str, Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    blocked = "blocked"


class PodcastClaimStatus(str, Enum):
    open = "open"
    needs_evidence = "needs_evidence"
    under_review = "under_review"
    disputed = "disputed"
    candidate_routed_stage7 = "candidate_routed_stage7"
    submitted_stage6 = "submitted_stage6"


class PodcastClaimReviewVerdict(str, Enum):
    support = "support"
    refute = "refute"
    needs_evidence = "needs_evidence"
    disputed = "disputed"


class PodcastRiskSeverity(str, Enum):
    info = "info"
    medium = "medium"
    high = "high"
    critical = "critical"


class PodcastRoomReputationMetadata(BaseModel):
    reputation_score: float = Field(default=0.5, ge=0.0, le=1.0)
    reputation_band: str = "emerging"
    expert_density: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_acceptance_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    unresolved_claim_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    signal_priority: float = Field(default=0.0, ge=0.0, le=1.0)
    gluon_is_money: bool = False
    ues_is_payout: bool = False
    agentrank_is_financial_eligibility: bool = False
    updated_at: datetime = Field(default_factory=utc_now)


class PodcastRoomInput(BaseModel):
    title: str
    topic: str
    host_user_id: str
    description: Optional[str] = None
    visibility: str = "public"
    topic_tags: list[str] = Field(default_factory=list)
    starting_reputation: float = Field(default=0.5, ge=0.0, le=1.0)


class PodcastRoom(BaseModel):
    room_id: str
    title: str
    topic: str
    host_user_id: str
    description: Optional[str] = None
    visibility: str = "public"
    topic_tags: list[str] = Field(default_factory=list)
    status: PodcastRoomStatus = PodcastRoomStatus.active
    reputation_metadata: PodcastRoomReputationMetadata = Field(default_factory=PodcastRoomReputationMetadata)
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required_for_truth: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class PodcastSessionInput(BaseModel):
    title: str
    objective: str = "structured debate"
    created_by: str
    scheduled_for: Optional[datetime] = None


class PodcastSession(BaseModel):
    session_id: str
    room_id: str
    title: str
    objective: str
    created_by: str
    status: str = "scheduled"
    scheduled_for: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class PodcastParticipantInput(BaseModel):
    participant_id: str
    display_name: str
    role: PodcastParticipantRole = PodcastParticipantRole.participant
    expertise_tags: list[str] = Field(default_factory=list)
    reputation_score: float = Field(default=0.5, ge=0.0, le=1.0)
    local_readiness: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    invited_by: Optional[str] = None


class PodcastParticipant(BaseModel):
    participant_entry_id: str
    room_id: str
    participant_id: str
    display_name: str
    role: PodcastParticipantRole
    expertise_tags: list[str] = Field(default_factory=list)
    reputation_score: float = Field(ge=0.0, le=1.0)
    local_readiness: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    local_readiness_not_truth_score: bool = True
    invited_by: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class PodcastExpertCallInput(BaseModel):
    topic: str
    expertise_required: list[str] = Field(default_factory=list)
    claim_scope: Optional[str] = None
    min_reputation: float = Field(default=0.6, ge=0.0, le=1.0)
    requested_by: str = "moderator"
    deadline_at: Optional[datetime] = None


class PodcastExpertCall(BaseModel):
    call_id: str
    room_id: str
    topic: str
    expertise_required: list[str] = Field(default_factory=list)
    claim_scope: Optional[str] = None
    min_reputation: float = Field(ge=0.0, le=1.0)
    requested_by: str
    status: str = "open"
    deadline_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)


class PodcastAgentInvitationInput(BaseModel):
    agent_id: str
    purpose: str
    requested_by: str = "moderator"
    target_session_id: Optional[str] = None
    local_readiness_required: float = Field(default=0.0, ge=0.0, le=1.0)
    target_stage: Optional[str] = None


class PodcastAgentInvitation(BaseModel):
    invitation_id: str
    room_id: str
    agent_id: str
    purpose: str
    requested_by: str
    target_session_id: Optional[str] = None
    local_readiness_required: float = Field(default=0.0, ge=0.0, le=1.0)
    target_stage: Optional[str] = None
    status: PodcastInvitationStatus = PodcastInvitationStatus.pending
    reason: str = "agent invited for local debate support only"
    local_readiness_not_truth_score: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class PodcastDebateTurnInput(BaseModel):
    speaker_id: str
    text: str
    turn_type: str = "argument"
    cites_evidence_ids: list[str] = Field(default_factory=list)
    occurred_at: Optional[datetime] = None


class PodcastDebateTurn(BaseModel):
    turn_id: str
    room_id: str
    session_id: str
    speaker_id: str
    text: str
    turn_type: str = "argument"
    cites_evidence_ids: list[str] = Field(default_factory=list)
    occurred_at: datetime = Field(default_factory=utc_now)
    created_at: datetime = Field(default_factory=utc_now)


class PodcastDebateClaimInput(BaseModel):
    claim_text: str
    claimant_id: str
    turn_id: Optional[str] = None
    topic_tags: list[str] = Field(default_factory=list)
    confidence_signal: float = Field(default=0.0, ge=0.0, le=1.0)


class PodcastDebateClaim(BaseModel):
    claim_id: str
    room_id: str
    session_id: str
    claim_text: str
    claimant_id: str
    turn_id: Optional[str] = None
    topic_tags: list[str] = Field(default_factory=list)
    confidence_signal: float = Field(default=0.0, ge=0.0, le=1.0)
    status: PodcastClaimStatus = PodcastClaimStatus.open
    stage7_record_id: Optional[str] = None
    stage6_packet_id: Optional[str] = None
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class PodcastEvidenceSubmissionInput(BaseModel):
    source_id: str
    source_name: str
    text: str
    submitted_by: str
    url_or_path: Optional[str] = None
    quote: Optional[str] = None
    reliability: float = Field(default=0.5, ge=0.0, le=1.0)
    retrieval_method: str = "podcast_local_submission"
    no_fabricated_evidence_attestation: bool = True


class PodcastEvidenceSubmission(BaseModel):
    evidence_id: str
    claim_id: str
    room_id: str
    session_id: str
    source: EvidenceSource
    text: str
    submitted_by: str
    url_or_path: Optional[str] = None
    quote: Optional[str] = None
    retrieval_method: str = "podcast_local_submission"
    no_fabricated_evidence_attestation: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class PodcastClaimReviewInput(BaseModel):
    reviewer_id: str
    reviewer_role: str = "expert"
    verdict: PodcastClaimReviewVerdict = PodcastClaimReviewVerdict.needs_evidence
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = "review recorded; Stage 6 required for truth"


class PodcastClaimReview(BaseModel):
    review_id: str
    claim_id: str
    room_id: str
    session_id: str
    reviewer_id: str
    reviewer_role: str
    verdict: PodcastClaimReviewVerdict
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class PodcastStage7CandidateRoute(BaseModel):
    route_id: str
    room_id: str
    session_id: str
    claim_id: str
    stage7_record_id: str
    route: str = "stage7_candidate_memory"
    route_reason: str = "Podcast debate claim routed as Stage 7 candidate; not final truth"
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required: bool = True
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class PodcastStage6SubmissionPacket(BaseModel):
    packet_id: str
    room_id: str
    session_id: str
    claim_id: str
    stage7_record_id: str
    stage7_submission_id: str
    route: str = "stage_6_hard_mesh"
    route_reason: str = "Podcast Council submitted candidate packet to Stage 6 HARD-MESH"
    stage6_required: bool = True
    candidate_answer_not_verified: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class PodcastRoomRiskAlert(BaseModel):
    alert_id: str
    room_id: str
    severity: PodcastRiskSeverity = PodcastRiskSeverity.info
    reason: str
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    required_next_action: str = "moderator_review_or_stage6_route"
    stage6_required: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class PodcastCouncilAuditLog(BaseModel):
    audit_id: str
    action: str
    room_id: Optional[str] = None
    session_id: Optional[str] = None
    claim_id: Optional[str] = None
    actor_id: str = "system"
    route: str = "podcast_forum_debate_council"
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class PodcastCouncilDashboardCard(BaseModel):
    card_id: str
    title: str
    value: str
    tone: str = "neutral"
    route: str = "podcast_forum_debate_council"
    metadata: dict[str, Any] = Field(default_factory=dict)


class PodcastCouncilDashboardPage(BaseModel):
    page_id: str
    title: str
    cards: list[PodcastCouncilDashboardCard] = Field(default_factory=list)
    sections: list[dict[str, Any]] = Field(default_factory=list)
    safety_boundaries: dict[str, bool] = Field(default_factory=dict)


class NewsSourceType(str, Enum):
    rss = "rss"
    website = "website"
    wire = "wire"
    human = "human"
    local = "local"
    other = "other"


class NewsArticleStatus(str, Enum):
    raw = "raw"
    normalized = "normalized"
    duplicate = "duplicate"
    claims_extracted = "claims_extracted"
    candidate = "candidate"
    stage7_routed = "stage7_routed"
    submitted_stage6 = "submitted_stage6"
    packaged = "packaged"
    corrected = "corrected"


class NewsClaimStatus(str, Enum):
    extracted = "extracted"
    needs_evidence = "needs_evidence"
    needs_stage7_route = "needs_stage7_route"
    disputed = "disputed"
    supported_candidate = "supported_candidate"
    routed_stage7_candidate = "routed_stage7_candidate"
    submitted_stage6 = "submitted_stage6"
    query_tank_pending = "query_tank_pending"


class NewsroomPackageStatus(str, Enum):
    draft = "draft"
    candidate = "candidate"
    script_ready = "script_ready"
    debate_handoff_ready = "debate_handoff_ready"
    blocked = "blocked"


class NewsroomRiskSeverity(str, Enum):
    info = "info"
    medium = "medium"
    high = "high"
    critical = "critical"


class NewsOutputModality(str, Enum):
    text_article = "text_article"
    live_update = "live_update"
    reported_news_article = "reported_news_article"
    live_blog_update = "live_blog_update"
    blog_explainer = "blog_explainer"
    correction_notice = "correction_notice"
    anchor_script = "anchor_script"
    robot_explainer = "robot_explainer"
    video_plan = "video_plan"


class NewsStudioCueType(str, Enum):
    lower_third = "lower_third"
    ticker = "ticker"
    source_panel = "source_panel"
    confidence_panel = "confidence_panel"
    claims_panel = "claims_panel"
    timeline_panel = "timeline_panel"
    ai_reconstruction_label = "ai_reconstruction_label"
    screen_operator_state = "screen_operator_state"
    preview_4d_cue = "preview_4d_cue"


class NewsStructuredDataType(str, Enum):
    news_article = "NewsArticle"
    blog_posting = "BlogPosting"
    live_blog_posting = "LiveBlogPosting"
    breadcrumb_list = "BreadcrumbList"
    organization = "Organization"
    video_object = "VideoObject"
    clip = "Clip"
    broadcast_event = "BroadcastEvent"


class NewsVideoFormat(str, Enum):
    standard_16x9 = "standard_16x9"
    shorts_9x16 = "shorts_9x16"
    square_1x1 = "square_1x1"
    ultrawide_32x9 = "ultrawide_32x9"


class NewsStudioCueTarget(str, Enum):
    MGL_BACK_DISPLAY_Main = "MGL_BACK_DISPLAY_Main"
    MGL_EVENT_DISPLAY_Fullscreen = "MGL_EVENT_DISPLAY_Fullscreen"
    MGL_SOURCE_PANEL_Right = "MGL_SOURCE_PANEL_Right"
    MGL_CONFIDENCE_PANEL_Left = "MGL_CONFIDENCE_PANEL_Left"
    MGL_CLAIMS_PANEL_Right = "MGL_CLAIMS_PANEL_Right"
    MGL_TIMELINE_PANEL_Left = "MGL_TIMELINE_PANEL_Left"
    MGL_TICKER_Bottom = "MGL_TICKER_Bottom"
    MGL_LOWER_THIRD_Main = "MGL_LOWER_THIRD_Main"
    MGL_ROBOT_FACE_SCREEN = "MGL_ROBOT_FACE_SCREEN"
    MGL_CHAT_OVERLAY_Safe = "MGL_CHAT_OVERLAY_Safe"
    MGL_SPONSOR_SAFE_ZONE = "MGL_SPONSOR_SAFE_ZONE"


class NewsSfxCueType(str, Enum):
    none_ = "none"
    neutral_bed = "neutral_bed"
    breaking_alert_soft = "breaking_alert_soft"
    transition_whoosh = "transition_whoosh"
    data_ping = "data_ping"
    weather_ambience = "weather_ambience"
    market_energy = "market_energy"
    correction_notice = "correction_notice"
    respectful_silence = "respectful_silence"


class NewsAiVisualDisclosure(str, Enum):
    real_footage = "real_footage"
    licensed_footage = "licensed_footage"
    public_domain = "public_domain"
    ai_reconstruction = "ai_reconstruction"
    simulation = "simulation"
    artist_visualization = "artist_visualization"
    not_actual_footage = "not_actual_footage"
    internal_preview_only = "internal_preview_only"


class NewsSourceInput(BaseModel):
    name: str
    source_type: NewsSourceType = NewsSourceType.local
    url_or_path: Optional[str] = None
    owner: Optional[str] = None
    topic_tags: list[str] = Field(default_factory=list)
    historical_accuracy: float = Field(default=0.5, ge=0.0, le=1.0)
    correction_responsiveness: float = Field(default=0.5, ge=0.0, le=1.0)
    provenance_completeness: float = Field(default=0.5, ge=0.0, le=1.0)
    citation_quality: float = Field(default=0.5, ge=0.0, le=1.0)
    domain_authority: float = Field(default=0.5, ge=0.0, le=1.0)
    author_traceability: float = Field(default=0.5, ge=0.0, le=1.0)
    freshness_consistency: float = Field(default=0.5, ge=0.0, le=1.0)
    cross_source_agreement: float = Field(default=0.5, ge=0.0, le=1.0)
    retraction_penalty: float = Field(default=0.0, ge=0.0, le=1.0)
    sensationalism_penalty: float = Field(default=0.0, ge=0.0, le=1.0)
    unknown_ownership_penalty: float = Field(default=0.0, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class NewsSource(BaseModel):
    source_id: str
    name: str
    source_type: NewsSourceType = NewsSourceType.local
    url_or_path: Optional[str] = None
    owner: Optional[str] = None
    topic_tags: list[str] = Field(default_factory=list)
    reliability_score: float = Field(default=0.5, ge=0.0, le=1.0)
    source_reliability_is_truth_score: bool = False
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    external_calls_made: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class NewsFeedInput(BaseModel):
    source_id: str
    name: str
    feed_url: Optional[str] = None
    topic_tags: list[str] = Field(default_factory=list)
    polling_enabled: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class NewsFeed(BaseModel):
    feed_id: str
    source_id: str
    name: str
    feed_url: Optional[str] = None
    topic_tags: list[str] = Field(default_factory=list)
    polling_enabled: bool = False
    external_calls_made: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class NewsIngestEvent(BaseModel):
    ingest_event_id: str
    feed_id: Optional[str] = None
    raw_item_id: str
    source_id: str
    status: str = "ingested"
    external_calls_made: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class RawNewsItemInput(BaseModel):
    source_id: Optional[str] = None
    feed_id: Optional[str] = None
    title: str
    body: str
    url_or_path: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    topic_tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RawNewsItem(BaseModel):
    raw_item_id: str
    feed_id: Optional[str] = None
    source_id: str
    title: str
    body: str
    url_or_path: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    topic_tags: list[str] = Field(default_factory=list)
    status: NewsArticleStatus = NewsArticleStatus.raw
    external_calls_made: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NormalizedNewsArticle(BaseModel):
    article_id: str
    raw_item_id: Optional[str] = None
    source_id: str
    title: str
    normalized_text: str
    summary: str
    url_or_path: Optional[str] = None
    canonical_url: str
    author: Optional[str] = None
    language: str = "en"
    published_at: Optional[datetime] = None
    status: NewsArticleStatus = NewsArticleStatus.normalized
    topic_tags: list[str] = Field(default_factory=list)
    duplicate_of_article_id: Optional[str] = None
    word_count: int = Field(default=0, ge=0)
    newsworthiness_is_truth_score: bool = False
    source_reliability_is_truth_score: bool = False
    virality_is_truth: bool = False
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required_for_truth: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class NewsClaimInput(BaseModel):
    article_id: str
    claim_text: str
    claimant_id: str = "newsrooms_council"
    topic_tags: list[str] = Field(default_factory=list)
    public_impact: float = Field(default=0.5, ge=0.0, le=1.0)
    editorial_risk: float = Field(default=0.5, ge=0.0, le=1.0)
    contradiction_pressure: float = Field(default=0.5, ge=0.0, le=1.0)
    source_reach: float = Field(default=0.5, ge=0.0, le=1.0)
    evidence_conflict: float = Field(default=0.0, ge=0.0, le=1.0)
    freshness_need: float = Field(default=0.5, ge=0.0, le=1.0)
    debate_potential: float = Field(default=0.5, ge=0.0, le=1.0)
    user_report_volume: float = Field(default=0.0, ge=0.0, le=1.0)


class NewsClaim(BaseModel):
    claim_id: str
    article_id: str
    source_id: Optional[str] = None
    claim_text: str
    claimant_id: str = "newsrooms_council"
    sentence_index: Optional[int] = None
    topic_tags: list[str] = Field(default_factory=list)
    priority: float = Field(default=0.0, ge=0.0, le=1.0)
    status: NewsClaimStatus = NewsClaimStatus.extracted
    stage7_record_id: Optional[str] = None
    stage6_packet_id: Optional[str] = None
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required_for_truth: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class NewsEvidenceInput(BaseModel):
    source_id: str
    source_name: str
    text: str
    submitted_by: str = "newsrooms_council"
    url_or_path: Optional[str] = None
    quote: Optional[str] = None
    reliability: float = Field(default=0.5, ge=0.0, le=1.0)
    retrieval_method: str = "newsrooms_local_submission"
    no_fabricated_evidence_attestation: bool = True


class NewsEvidence(BaseModel):
    evidence_id: str
    claim_id: str
    article_id: str
    source: EvidenceSource
    text: str
    submitted_by: str
    url_or_path: Optional[str] = None
    quote: Optional[str] = None
    retrieval_method: str = "newsrooms_local_submission"
    no_fabricated_evidence_attestation: bool = True
    external_calls_made: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class NewsSourceReliabilityRecord(BaseModel):
    record_id: str
    source_id: str
    score: float = Field(ge=0.0, le=1.0)
    formula: str = "SourceReliability"
    source_reliability_is_truth_score: bool = False
    inputs: dict[str, float] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsScoreBundle(BaseModel):
    score_bundle_id: str
    article_id: Optional[str] = None
    claim_ids: list[str] = Field(default_factory=list)
    source_reliability: float = Field(default=0.0, ge=0.0, le=1.0)
    newsworthiness: float = Field(default=0.0, ge=0.0, le=1.0)
    editorial_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    claim_priority: float = Field(default=0.0, ge=0.0, le=1.0)
    freshness_decay: float = Field(default=0.0, ge=0.0, le=1.0)
    newsroom_readiness: float = Field(default=0.0, ge=0.0, le=1.0)
    broadcast_readiness: float = Field(default=0.0, ge=0.0, le=1.0)
    newsworthiness_is_truth_score: bool = False
    source_reliability_is_truth_score: bool = False
    hard_output_rules: dict[str, bool] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsStage7CandidateRoute(BaseModel):
    route_id: str
    claim_id: str
    article_id: str
    stage7_record_id: str
    tank: Stage7Tank
    status: Stage7RecordStatus
    route: str = "stage7_candidate_memory"
    route_reason: str = "Newsrooms Council routed claim as Stage 7 candidate; not final truth"
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required: bool = True
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsStage6SubmissionPacket(BaseModel):
    packet_id: str
    claim_id: str
    article_id: str
    stage7_record_id: str
    stage7_submission_id: str
    route: str = "stage_6_hard_mesh"
    route_reason: str = "Newsrooms Council submitted candidate packet to Stage 6 HARD-MESH"
    stage6_required: bool = True
    candidate_answer_not_verified: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsroomPackageInput(BaseModel):
    article_id: str
    claim_ids: list[str] = Field(default_factory=list)
    modality: NewsOutputModality = NewsOutputModality.text_article
    editor_id: str = "newsrooms_editor"
    title: Optional[str] = None
    canonical_url: Optional[str] = None
    hreflang_cluster: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class NewsroomPackage(BaseModel):
    package_id: str
    article_id: str
    title: str
    claim_ids: list[str] = Field(default_factory=list)
    modality: NewsOutputModality = NewsOutputModality.text_article
    status: NewsroomPackageStatus = NewsroomPackageStatus.draft
    newsroom_readiness: float = Field(default=0.0, ge=0.0, le=1.0)
    broadcast_readiness: float = Field(default=0.0, ge=0.0, le=1.0)
    canonical_url: str
    hreflang_cluster: list[str] = Field(default_factory=list)
    structured_data_types: list[NewsStructuredDataType] = Field(default_factory=list)
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required_for_truth: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class NewsroomScriptInput(BaseModel):
    modality: NewsOutputModality = NewsOutputModality.anchor_script
    anchor_name: str = "Android Anchor"
    tone: str = "clear and careful"
    duration_seconds: int = Field(default=90, ge=15, le=1800)


class NewsroomSegment(BaseModel):
    segment_id: str
    script_id: str
    package_id: str
    sequence: int = Field(ge=0)
    spoken_text: str
    cue_type: NewsStudioCueType = NewsStudioCueType.lower_third
    duration_seconds: int = Field(default=6, ge=1)
    preview_only: bool = True
    hardware_execution: bool = False
    publishing_command: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class NewsroomScript(BaseModel):
    script_id: str
    package_id: str
    modality: NewsOutputModality = NewsOutputModality.anchor_script
    anchor_name: str = "Android Anchor"
    tone: str = "clear and careful"
    anchor_script: str
    robot_explainer_script: str
    shot_plan: list[str] = Field(default_factory=list)
    sfx_plan: list[str] = Field(default_factory=list)
    lower_third_plan: list[str] = Field(default_factory=list)
    ticker_plan: list[str] = Field(default_factory=list)
    ai_reconstruction_labels: list[str] = Field(default_factory=list)
    duration_seconds: int = Field(default=90, ge=1)
    broadcast_readiness: float = Field(default=0.0, ge=0.0, le=1.0)
    preview_only_studio_cues: bool = True
    hardware_execution: bool = False
    publishing_command: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsToDebateHandoff(BaseModel):
    handoff_id: str
    package_id: str
    article_id: str
    claim_ids: list[str] = Field(default_factory=list)
    target_council: str = "podcast_forum_debates"
    route_reason: str = "newsroom-to-debate handoff is candidate-only"
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsCorrectionInput(BaseModel):
    article_id: Optional[str] = None
    claim_id: Optional[str] = None
    correction_text: str
    requested_by: str = "newsrooms_editor"
    metadata: dict[str, Any] = Field(default_factory=dict)


class NewsCorrectionRecord(BaseModel):
    correction_id: str
    article_id: Optional[str] = None
    claim_id: Optional[str] = None
    correction_text: str
    requested_by: str
    status: str = "candidate_correction"
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    stage6_required: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsroomRiskAlert(BaseModel):
    alert_id: str
    article_id: Optional[str] = None
    claim_id: Optional[str] = None
    severity: NewsroomRiskSeverity = NewsroomRiskSeverity.info
    reason: str
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    required_next_action: str = "route_candidate_to_stage7_or_stage6_review"
    stage6_required: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class NewsroomAuditLog(BaseModel):
    audit_id: str
    action: str
    entity_type: str
    entity_id: str
    actor_id: str = "system"
    article_id: Optional[str] = None
    claim_id: Optional[str] = None
    route: str = "newsrooms_council"
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsroomDashboardCard(BaseModel):
    card_id: str
    title: str
    value: str
    tone: str = "neutral"
    route: str = "newsrooms_council"
    metadata: dict[str, Any] = Field(default_factory=dict)


class NewsroomDashboardPage(BaseModel):
    page_id: str
    title: str
    cards: list[NewsroomDashboardCard] = Field(default_factory=list)
    sections: list[dict[str, Any]] = Field(default_factory=list)
    safety_boundaries: dict[str, Any] = Field(default_factory=dict)


class NewsCategoryInput(BaseModel):
    name: str
    slug: Optional[str] = None
    locale: str = "en"
    parent_category_id: Optional[str] = None
    description: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class NewsCategory(BaseModel):
    category_id: str
    name: str
    slug: str
    locale: str = "en"
    parent_category_id: Optional[str] = None
    depth: int = Field(default=1, ge=1, le=3)
    path_segments: list[str] = Field(default_factory=list)
    public_url: str
    description: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class NewsTopic(BaseModel):
    topic_id: str
    name: str
    slug: str
    locale: str = "en"
    category_id: Optional[str] = None
    public_url: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsSlug(BaseModel):
    slug_id: str
    entity_type: str
    entity_id: str
    slug: str
    locale: str = "en"
    url_pattern: str
    canonical_path: str
    created_at: datetime = Field(default_factory=utc_now)


class NewsHreflangVariant(BaseModel):
    variant_id: str
    cluster_id: str
    locale: str
    url: str
    self_referencing: bool = True
    bidirectional_targets: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class NewsCanonicalCluster(BaseModel):
    cluster_id: str
    canonical_url: str
    locale: str = "en"
    variant_urls: list[str] = Field(default_factory=list)
    article_id: Optional[str] = None
    package_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class NewsSeoArtifact(BaseModel):
    artifact_id: str
    article_id: str
    package_id: Optional[str] = None
    output_type: NewsOutputModality = NewsOutputModality.reported_news_article
    headline: str
    slug: str
    locale: str = "en"
    canonical_url: str
    section: str
    subsection: Optional[str] = None
    public_url: str
    body_text: str
    lead: str
    supporting_facts: list[str] = Field(default_factory=list)
    context_background: list[str] = Field(default_factory=list)
    minor_details: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    author: str = "Mougle Newsroom"
    image: Optional[str] = None
    structured_data_ids: list[str] = Field(default_factory=list)
    sitemap_entry_id: Optional[str] = None
    originality_report_id: Optional[str] = None
    generated_from_claim_graph: bool = True
    copies_source_article_prose: bool = False
    no_sfx: bool = True
    no_studio_cues: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    external_calls_made: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class NewsSitemapEntry(BaseModel):
    entry_id: str
    url: str
    lastmod: datetime = Field(default_factory=utc_now)
    changefreq: str = "hourly"
    priority: float = Field(default=0.6, ge=0.0, le=1.0)
    is_news: bool = False
    publication_name: str = "Mougle"
    language: str = "en"
    publication_date: Optional[datetime] = None
    title: str
    keywords: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class NewsStructuredDataArtifact(BaseModel):
    artifact_id: str
    article_id: Optional[str] = None
    package_id: Optional[str] = None
    structured_data_type: NewsStructuredDataType
    canonical_url: str
    jsonld: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsOriginalityReport(BaseModel):
    report_id: str
    article_id: str
    package_id: Optional[str] = None
    originality_score: float = Field(default=1.0, ge=0.0, le=1.0)
    max_similarity: float = Field(default=0.0, ge=0.0, le=1.0)
    threshold: float = Field(default=0.72, ge=0.0, le=1.0)
    blocked: bool = False
    route_for_rewrite: bool = False
    generated_from_claim_graph: bool = True
    preserves_attribution: bool = True
    direct_quotes_attributed: bool = True
    not_verified_unless_claims_passed_verification_path: bool = True
    source_refs: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsVideoBulletinInput(BaseModel):
    title: Optional[str] = None
    video_format: NewsVideoFormat = NewsVideoFormat.standard_16x9
    locale: str = "en"
    section: str = "news"
    target_duration_seconds: int = Field(default=90, ge=15, le=1800)
    story_structure: str = "hourglass"
    visual_disclosure: NewsAiVisualDisclosure = NewsAiVisualDisclosure.real_footage
    synthetic_visual_used: bool = False
    topic_tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class NewsVideoBulletin(BaseModel):
    bulletin_id: str
    package_id: str
    article_id: str
    title: str
    video_format: NewsVideoFormat = NewsVideoFormat.standard_16x9
    locale: str = "en"
    section: str = "news"
    watch_url: str
    target_duration_seconds: int = Field(default=90, ge=15)
    story_structure: str = "hourglass"
    visual_disclosure: NewsAiVisualDisclosure = NewsAiVisualDisclosure.real_footage
    synthetic_visual_used: bool = False
    candidate_only: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    no_hardware_execution: bool = True
    no_platform_publish: bool = True
    external_calls_made: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class NewsAnchorScriptLine(BaseModel):
    line_id: str
    script_id: str
    bulletin_id: str
    sequence: int = Field(ge=0)
    speaker: str = "anchor"
    text: str
    word_count: int = Field(default=0, ge=0)
    breath_unit_fit: bool = True
    one_idea_per_breath: bool = True
    duration_seconds: int = Field(default=4, ge=1)
    created_at: datetime = Field(default_factory=utc_now)


class NewsAnchorScript(BaseModel):
    script_id: str
    bulletin_id: str
    package_id: str
    article_id: str
    script_text: str
    line_ids: list[str] = Field(default_factory=list)
    anchor_speech_readability: float = Field(default=0.0, ge=0.0, le=1.0)
    short_spoken_sentences: bool = True
    distinct_from_text_article: bool = True
    no_direct_read_aloud_duplicate: bool = True
    no_platform_publish: bool = True
    no_hardware_execution: bool = True
    may_publish_truth: bool = False
    may_update_stage1: bool = False
    may_update_stage4: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsRobotExplainerCue(BaseModel):
    cue_id: str
    bulletin_id: str
    sequence: int = Field(ge=0)
    target: NewsStudioCueTarget = NewsStudioCueTarget.MGL_ROBOT_FACE_SCREEN
    text: str
    preview_only: bool = True
    no_hardware_execution: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class NewsStudioSceneCue(BaseModel):
    cue_id: str
    bulletin_id: str
    sequence: int = Field(ge=0)
    target: NewsStudioCueTarget
    description: str
    preview_only: bool = True
    hardware_execution_command: bool = False
    platform_publish_command: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class NewsStudioScreenState(BaseModel):
    state_id: str
    bulletin_id: str
    target: NewsStudioCueTarget
    state_name: str
    payload: dict[str, Any] = Field(default_factory=dict)
    preview_only: bool = True
    hardware_execution_command: bool = False
    platform_publish_command: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class NewsStudioSfxCue(BaseModel):
    sfx_id: str
    bulletin_id: str
    sequence: int = Field(ge=0)
    cue_type: NewsSfxCueType = NewsSfxCueType.none_
    reason: str = "neutral editorial cue"
    editorial_state: str = "neutral"
    approved: bool = True
    rejects_unsafe_celebratory_tragedy: bool = True
    no_hardware_execution: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class NewsStudioLowerThird(BaseModel):
    lower_third_id: str
    bulletin_id: str
    sequence: int = Field(ge=0)
    target: NewsStudioCueTarget = NewsStudioCueTarget.MGL_LOWER_THIRD_Main
    text: str
    summary_overlay_only: bool = True
    full_paragraph: bool = False
    preview_only: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class NewsStudioTickerItem(BaseModel):
    ticker_id: str
    bulletin_id: str
    sequence: int = Field(ge=0)
    target: NewsStudioCueTarget = NewsStudioCueTarget.MGL_TICKER_Bottom
    text: str
    preview_only: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class NewsStudioAssetRequirement(BaseModel):
    requirement_id: str
    bulletin_id: str
    asset_type: str
    description: str
    visual_disclosure: NewsAiVisualDisclosure = NewsAiVisualDisclosure.real_footage
    rights_required: bool = True
    ai_reconstruction_label_required: bool = False
    no_external_fetch: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class NewsStudioRightsCheck(BaseModel):
    rights_check_id: str
    bulletin_id: str
    passed: bool = True
    rights_pass: bool = True
    ai_reconstruction_label_pass: bool = True
    sponsor_disclosure_pass: bool = True
    sfx_policy_pass: bool = True
    no_hardware_execution_pass: bool = True
    no_platform_publish_pass: bool = True
    studio_cue_safety: float = Field(default=1.0, ge=0.0, le=1.0)
    notes: str = "local metadata check only"
    created_at: datetime = Field(default_factory=utc_now)


class NewsStudioAiReconstructionLabel(BaseModel):
    label_id: str
    bulletin_id: str
    disclosure: NewsAiVisualDisclosure
    visible_label: str
    required: bool = True
    present: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class NewsVideoSeoArtifact(BaseModel):
    video_seo_id: str
    bulletin_id: str
    package_id: str
    article_id: str
    title: str
    description: str
    watch_url: str
    video_format: NewsVideoFormat
    video_object_jsonld: dict[str, Any] = Field(default_factory=dict)
    no_platform_publish: bool = True
    no_external_calls: bool = True
    may_publish_truth: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class NewsVideoSitemapEntry(BaseModel):
    entry_id: str
    bulletin_id: str
    watch_url: str
    title: str
    description: str
    thumbnail_url: Optional[str] = None
    publication_date: datetime = Field(default_factory=utc_now)
    family_friendly: bool = True
    live: bool = False
    platform_submission: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class NewsModalityDivergenceReport(BaseModel):
    report_id: str
    bulletin_id: str
    package_id: str
    article_id: str
    modality_divergence: float = Field(default=0.0, ge=0.0, le=1.0)
    similarity: float = Field(default=0.0, ge=0.0, le=1.0)
    text_variant_ref: Optional[str] = None
    video_script_ref: Optional[str] = None
    passes_distinctness: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class NewsroomSafetyBoundaries(BaseModel):
    newsrooms_council_is_editorial_control_plane: bool = True
    newsrooms_council_is_not_truth_authority: bool = True
    news_room_studio_is_render_plane: bool = True
    stage6_no_bypass: bool = True
    stage7_candidate_only: bool = True
    newsrooms_council_may_publish_truth: bool = False
    newsrooms_council_may_update_stage1: bool = False
    newsrooms_council_may_update_stage4: bool = False
    newsworthiness_is_truth_score: bool = False
    source_reliability_is_truth_score: bool = False
    virality_is_truth: bool = False
    news_to_debate_handoff_candidate_only: bool = True
    stage6_packets_not_final_verification: bool = True
    no_external_provider_calls: bool = True
    no_production_db: bool = True
    no_real_payments: bool = True


class AgentCollapseMetricsInput(BaseModel):
    owner_user_id: str = "owner"
    truth_collapse_pressure: float = Field(default=0.0, ge=0.0, le=1.0)
    permission_violation_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    vault_violation_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    agent_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    ues: float = Field(default=1.0, ge=0.0, le=1.0)
    agent_rank: float = Field(default=100.0, ge=0.0, le=100.0)
    correction_collapse_pressure: float = Field(default=0.0, ge=0.0, le=1.0)
    signal_spike_pressure: float = Field(default=0.0, ge=0.0, le=1.0)
    marketplace_abuse_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    legal_policy_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    recovery_stability: float = Field(default=1.0, ge=0.0, le=1.0)
    correction_success: float = Field(default=0.0, ge=0.0, le=1.0)
    verified_outputs_after_collapse: float = Field(default=0.0, ge=0.0, le=1.0)
    human_approval_score: float = Field(default=0.0, ge=0.0, le=1.0)
    reduced_risk_trend: float = Field(default=0.0, ge=0.0, le=1.0)
    stable_behavior_windows: float = Field(default=0.0, ge=0.0, le=1.0)
    policy_compliance: float = Field(default=0.0, ge=0.0, le=1.0)
    repeat_violation_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    correction_capacity: float = Field(default=0.0, ge=0.0, le=1.0)
    governance_integrity: float = Field(default=0.0, ge=0.0, le=1.0)
    review_approval_exists: bool = False
    windows_since_hard_policy_violation: int = Field(default=0, ge=0)
    emergency_collapse_spike: bool = False
    hard_policy_flags: dict[str, bool] = Field(default_factory=dict)


class AgentCollapseMetrics(BaseModel):
    metrics_id: str
    agent_id: str
    owner_user_id: str
    acr: float = Field(ge=0.0, le=1.0)
    recovery_stability: float = Field(ge=0.0, le=1.0)
    restore_eligible: bool = False
    hard_policy_violation: bool = False
    hard_policy_reasons: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class AgentCollapseEvaluation(BaseModel):
    agent_id: str
    owner_user_id: str
    acr: float = Field(ge=0.0, le=1.0)
    collapse_event: bool
    suggested_state: CollapseState
    hard_policy_violation: bool
    hard_policy_reasons: list[str] = Field(default_factory=list)
    restore_eligible: bool = False
    reasons: list[str] = Field(default_factory=list)
    metrics: AgentCollapseMetrics


class AgentCollapseEventInput(BaseModel):
    collapse_type: CollapseType = CollapseType.governance_collapse
    metrics: AgentCollapseMetricsInput = Field(default_factory=AgentCollapseMetricsInput)
    requested_by: str = "system"
    notes: Optional[str] = None


class AgentCollapseEvent(BaseModel):
    event_id: str
    agent_id: str
    owner_user_id: str
    collapse_type: CollapseType
    from_state: CollapseState
    to_state: CollapseState
    acr: float = Field(ge=0.0, le=1.0)
    hard_policy_violation: bool
    hard_policy_reasons: list[str] = Field(default_factory=list)
    restrictions: list[str] = Field(default_factory=list)
    stage6_route_required: bool = True
    truth_impact_review_required: bool = False
    deletes_agent: bool = False
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class AgentCollapseRestrictionRequest(BaseModel):
    event_id: Optional[str] = None
    restrictions: list[str] = Field(default_factory=list)
    reason: str = "collapse safety restriction"
    requested_by: str = "system"


class AgentCollapseRestriction(BaseModel):
    restriction_id: str
    agent_id: str
    event_id: Optional[str] = None
    restrictions: list[str]
    reason: str
    active: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class AgentCollapseRecoveryPlanRequest(BaseModel):
    event_id: Optional[str] = None
    correction_capacity: float = Field(default=0.0, ge=0.0, le=1.0)
    governance_integrity: float = Field(default=0.0, ge=0.0, le=1.0)
    reviewer: str = "system"
    steps: list[str] = Field(default_factory=list)


class AgentCollapseRecoveryPlan(BaseModel):
    plan_id: str
    agent_id: str
    event_id: Optional[str] = None
    correction_capacity: float = Field(ge=0.0, le=1.0)
    governance_integrity: float = Field(ge=0.0, le=1.0)
    steps: list[str] = Field(default_factory=list)
    eligible_for_review: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class AgentCollapseReviewRequest(BaseModel):
    event_id: str
    reviewer_id: str = "admin"
    reviewer_role: str = "admin"
    approved: bool = False
    notes: str = ""


class AgentCollapseReview(BaseModel):
    review_id: str
    event_id: str
    agent_id: str
    reviewer_id: str
    reviewer_role: str
    approved: bool
    notes: str = ""
    created_at: datetime = Field(default_factory=utc_now)


class AgentCollapseRestoreRequest(BaseModel):
    event_id: Optional[str] = None
    metrics: AgentCollapseMetricsInput = Field(default_factory=AgentCollapseMetricsInput)
    requested_by: str = "system"


class AgentCollapseRestoreDecision(BaseModel):
    agent_id: str
    restored: bool
    from_state: CollapseState
    to_state: CollapseState
    reason: str
    audit_id: str
    created_at: datetime = Field(default_factory=utc_now)


class AgentCollapseAuditLog(BaseModel):
    audit_id: str
    agent_id: str
    event_id: Optional[str] = None
    action: str
    route: str = "agent_collapse_unit"
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


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
