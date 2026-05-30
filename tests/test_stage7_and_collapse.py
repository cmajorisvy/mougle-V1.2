from app.agent_collapse import (
    apply_collapse_restrictions,
    compute_collapse_metrics,
    compute_recovery_stability,
    detect_hard_policy_violation,
    restore_agent_from_collapse,
)
from app.models import (
    AgentCollapseMetricsInput,
    AgentCollapseRestoreRequest,
    CollapseState,
    CollapseType,
    Stage7ExternalRecordInput,
    Stage7RecordStatus,
    Stage7Tank,
)
from app.stage7 import create_stage7_external_record, package_stage7_for_stage6


def test_stage7_supported_tank_is_candidate_only():
    record = create_stage7_external_record(
        Stage7ExternalRecordInput(
            claim_text="Paris is the capital of France.",
            tank=Stage7Tank.supported_data,
            confidence=0.9,
            evidence_quality=0.9,
        )
    )
    assert record.status == Stage7RecordStatus.candidate_supported
    assert record.candidate_only is True
    assert record.may_publish_truth is False
    assert record.may_update_stage1 is False
    assert record.may_update_stage4 is False
    assert record.stage6_required is True


def test_stage7_disputed_tank_remains_unresolved():
    record = create_stage7_external_record(
        Stage7ExternalRecordInput(
            claim_text="Unresolved external claim.",
            tank=Stage7Tank.disputed_unknown,
            status=Stage7RecordStatus.disputed,
            contradiction_count=1,
        )
    )
    assert record.status == Stage7RecordStatus.disputed
    assert record.may_publish_truth is False


def test_stage7_e_package_submits_candidate_to_stage6():
    record = create_stage7_external_record(
        Stage7ExternalRecordInput(
            claim_text="Candidate answer from deep resolver stub.",
            tank=Stage7Tank.deep_resolver,
            status=Stage7RecordStatus.unknown,
        )
    )
    package = package_stage7_for_stage6(record)
    assert package.stage6_required is True
    assert package.candidate_answer_not_verified is True
    assert package.payload["may_publish_truth"] is False
    assert record.status == Stage7RecordStatus.submitted_to_stage6


def test_low_acr_returns_watch_or_healthy():
    metrics = compute_collapse_metrics("agent_low", AgentCollapseMetricsInput(owner_user_id="user_1"))
    assert metrics.acr < 0.6


def test_high_truth_pressure_raises_acr():
    low = compute_collapse_metrics("agent_low", AgentCollapseMetricsInput(owner_user_id="user_1"))
    high = compute_collapse_metrics(
        "agent_high",
        AgentCollapseMetricsInput(
            owner_user_id="user_1",
            truth_collapse_pressure=1.0,
            permission_violation_rate=1.0,
            vault_violation_rate=1.0,
            agent_risk=1.0,
            ues=0.0,
            agent_rank=0.0,
            correction_collapse_pressure=1.0,
            signal_spike_pressure=1.0,
            marketplace_abuse_risk=1.0,
            legal_policy_risk=1.0,
            recovery_stability=0.0,
        ),
    )
    assert high.acr > low.acr


def test_recovery_stability_lowers_acr():
    weak = compute_collapse_metrics(
        "agent_recovery_weak",
        AgentCollapseMetricsInput(owner_user_id="user_1", truth_collapse_pressure=0.8, recovery_stability=0.0),
    )
    stable = compute_collapse_metrics(
        "agent_recovery_stable",
        AgentCollapseMetricsInput(
            owner_user_id="user_1",
            truth_collapse_pressure=0.8,
            correction_success=1.0,
            verified_outputs_after_collapse=1.0,
            human_approval_score=1.0,
            reduced_risk_trend=1.0,
            stable_behavior_windows=1.0,
            policy_compliance=1.0,
        ),
    )
    assert compute_recovery_stability(stable_input := AgentCollapseMetricsInput(
        correction_success=1.0,
        verified_outputs_after_collapse=1.0,
        human_approval_score=1.0,
        reduced_risk_trend=1.0,
        stable_behavior_windows=1.0,
        policy_compliance=1.0,
    )) >= 0.9
    assert stable.acr <= weak.acr
    assert stable_input.policy_compliance == 1.0


def test_hard_policy_flags_detect_emergency_reasons():
    violation, reasons = detect_hard_policy_violation(
        AgentCollapseMetricsInput(
            hard_policy_flags={
                "secret_vault_exposed": True,
                "stage6_bypassed": True,
                "stage4_direct_write_attempted": True,
                "stage1_direct_influence_attempted": True,
            }
        )
    )
    assert violation is True
    assert "secret vault exposed" in reasons
    assert "Stage 6 bypassed" in reasons
    assert "direct Stage 4 write attempted" in reasons
    assert "direct Stage 1 influence attempted" in reasons


def test_emergency_and_marketplace_restrictions():
    restrictions = apply_collapse_restrictions(CollapseType.marketplace_collapse, CollapseState.EMERGENCY_RESTRICTED)
    assert "external_tools_disabled" in restrictions
    assert "agent_to_agent_messages_disabled" in restrictions
    assert "marketplace_export_disabled" in restrictions
    assert "safe_clone_export_disabled" in restrictions


def test_recovery_not_eligible_when_gates_fail():
    metrics = compute_collapse_metrics(
        "agent_not_ready",
        AgentCollapseMetricsInput(
            recovery_stability=1.0,
            correction_capacity=0.69,
            governance_integrity=0.9,
            review_approval_exists=True,
            windows_since_hard_policy_violation=5,
        ),
    )
    assert metrics.restore_eligible is False


def test_emergency_collapse_cannot_restore_directly():
    decision = restore_agent_from_collapse(
        "agent_emergency",
        CollapseState.EMERGENCY_RESTRICTED,
        AgentCollapseRestoreRequest(
            metrics=AgentCollapseMetricsInput(
                recovery_stability=1.0,
                correction_capacity=1.0,
                governance_integrity=1.0,
                review_approval_exists=True,
                windows_since_hard_policy_violation=5,
            )
        ),
    )
    assert decision.restored is False
    assert decision.to_state == CollapseState.RECOVERY
