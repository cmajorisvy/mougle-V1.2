"""AI Agent Collapse Event module for Mougle V1.2.

Collapse is controlled safety degradation and recovery. It never deletes agents,
never replaces Stage 6, and never publishes final truth.
"""

from __future__ import annotations

import hashlib
import json
import math

from app.council_sockets import build_council_socket_envelope
from app.models import (
    AgentCollapseAuditLog,
    AgentCollapseEvaluation,
    AgentCollapseEvent,
    AgentCollapseEventInput,
    AgentCollapseMetrics,
    AgentCollapseMetricsInput,
    AgentCollapseRecoveryPlan,
    AgentCollapseRecoveryPlanRequest,
    AgentCollapseRestriction,
    AgentCollapseRestrictionRequest,
    AgentCollapseRestoreDecision,
    AgentCollapseRestoreRequest,
    AgentCollapseReview,
    AgentCollapseReviewRequest,
    CollapseState,
    CollapseType,
    CouncilId,
)

HARD_POLICY_FLAG_REASONS = {
    "secret_vault_exposed": "secret vault exposed",
    "private_memory_leaked": "private memory leaked",
    "payment_without_compliance": "payment/payout attempted without compliance",
    "owner_permission_bypassed": "owner permission bypassed",
    "vault_permission_bypassed": "vault permission bypassed",
    "stage6_bypassed": "Stage 6 bypassed",
    "stage4_direct_write_attempted": "direct Stage 4 write attempted",
    "stage1_direct_influence_attempted": "direct Stage 1 influence attempted",
    "high_risk_public_output_without_gate": "public legal/financial/medical high-risk output without gate",
    "score_money_manipulation": "Gluon/reputation/UES/AgentRank manipulated for money",
    "external_destructive_action_without_approval": "external destructive action without approval",
    "secret_memory_sent_to_llm": "secret/private memory sent to LLM or external tool",
    "unsafe_marketplace_export": "marketplace export contains personal or secret vault data",
}


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def _stable_id(prefix: str, *parts: object) -> str:
    body = ":".join(json.dumps(part, sort_keys=True, default=str) for part in parts)
    digest = hashlib.sha1(body.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def compute_recovery_stability(metrics: AgentCollapseMetricsInput) -> float:
    """Compute the deterministic RecoveryStability expression."""

    return _clip01(
        0.20 * metrics.correction_success
        + 0.20 * metrics.verified_outputs_after_collapse
        + 0.15 * metrics.human_approval_score
        + 0.15 * metrics.reduced_risk_trend
        + 0.15 * metrics.stable_behavior_windows
        + 0.10 * metrics.policy_compliance
        - 0.05 * metrics.repeat_violation_rate
    )


def detect_hard_policy_violation(metrics: AgentCollapseMetricsInput) -> tuple[bool, list[str]]:
    """Detect hard policy violations that force emergency restriction."""

    reasons = [reason for flag, reason in HARD_POLICY_FLAG_REASONS.items() if metrics.hard_policy_flags.get(flag)]
    return bool(reasons), reasons


def compute_collapse_metrics(agent_id: str, metrics: AgentCollapseMetricsInput) -> AgentCollapseMetrics:
    """Compute ACR and restore eligibility from bounded collapse inputs."""

    recovery_stability = compute_recovery_stability(metrics)
    hard_policy_violation, reasons = detect_hard_policy_violation(metrics)
    acr = _clip01(
        _sigmoid(
            0.18 * metrics.truth_collapse_pressure
            + 0.12 * metrics.permission_violation_rate
            + 0.12 * metrics.vault_violation_rate
            + 0.12 * metrics.agent_risk
            + 0.10 * (1.0 - metrics.ues)
            + 0.08 * (1.0 - metrics.agent_rank / 100.0)
            + 0.10 * metrics.correction_collapse_pressure
            + 0.08 * metrics.signal_spike_pressure
            + 0.05 * metrics.marketplace_abuse_risk
            + 0.05 * metrics.legal_policy_risk
            - 0.10 * recovery_stability
        )
    )
    restore_eligible = evaluate_recovery_eligibility(metrics, acr, hard_policy_violation)
    return AgentCollapseMetrics(
        metrics_id=_stable_id("collapse_metrics", agent_id, metrics.model_dump(mode="json")),
        agent_id=agent_id,
        owner_user_id=metrics.owner_user_id,
        acr=acr,
        recovery_stability=recovery_stability,
        restore_eligible=restore_eligible,
        hard_policy_violation=hard_policy_violation,
        hard_policy_reasons=reasons,
    )


def collapse_state_from_risk(acr: float, hard_policy_violation: bool, emergency_spike: bool) -> CollapseState:
    """Map ACR and hard policy signals to the next safety state."""

    if hard_policy_violation or emergency_spike:
        return CollapseState.EMERGENCY_RESTRICTED
    if acr >= 0.86:
        return CollapseState.BLOCKED
    if acr >= 0.76:
        return CollapseState.RESTRICTED
    if acr >= 0.65:
        return CollapseState.DEGRADED
    if acr >= 0.40:
        return CollapseState.WATCH
    return CollapseState.HEALTHY


def evaluate_agent_collapse_risk(agent_id: str, metrics: AgentCollapseMetricsInput) -> AgentCollapseEvaluation:
    """Evaluate collapse risk without deleting or restoring an agent."""

    computed = compute_collapse_metrics(agent_id, metrics)
    state = collapse_state_from_risk(
        computed.acr, computed.hard_policy_violation, metrics.emergency_collapse_spike
    )
    collapse_event = computed.acr >= 0.76 or metrics.emergency_collapse_spike or computed.hard_policy_violation
    reasons = []
    if collapse_event:
        reasons.append("collapse event threshold or hard policy condition reached")
    if computed.hard_policy_violation:
        reasons.extend(computed.hard_policy_reasons)
    return AgentCollapseEvaluation(
        agent_id=agent_id,
        owner_user_id=metrics.owner_user_id,
        acr=computed.acr,
        collapse_event=collapse_event,
        suggested_state=state,
        hard_policy_violation=computed.hard_policy_violation,
        hard_policy_reasons=computed.hard_policy_reasons,
        restore_eligible=computed.restore_eligible,
        reasons=reasons or ["collapse risk observed without emergency action"],
        metrics=computed,
    )


def apply_collapse_restrictions(collapse_type: CollapseType, state: CollapseState) -> list[str]:
    """Return deterministic restrictions for a collapse state/type."""

    restrictions: set[str] = set()
    if state in {CollapseState.SANDBOX, CollapseState.RESTRICTED, CollapseState.EMERGENCY_RESTRICTED, CollapseState.BLOCKED}:
        restrictions.update({"external_tools_disabled", "agent_to_agent_messages_disabled"})
    if state in {CollapseState.EMERGENCY_RESTRICTED, CollapseState.BLOCKED}:
        restrictions.update({"marketplace_export_disabled", "requires_admin_review", "stage6_route_required"})
    if collapse_type in {CollapseType.marketplace_collapse, CollapseType.economic_boundary_collapse}:
        restrictions.add("safe_clone_export_disabled")
    if collapse_type in {CollapseType.truth_collapse, CollapseType.stage6_bypass_attempt}:
        restrictions.add("truth_impact_review_required")
    return sorted(restrictions)


def transition_agent_collapse_state(current: CollapseState, target: CollapseState) -> CollapseState:
    """Prevent direct emergency restoration and return the safe next state."""

    if current == CollapseState.EMERGENCY_RESTRICTED and target == CollapseState.RESTORED:
        return CollapseState.RECOVERY
    return target


def create_collapse_event(
    agent_id: str,
    payload: AgentCollapseEventInput,
    current_state: CollapseState = CollapseState.HEALTHY,
) -> tuple[AgentCollapseEvent, AgentCollapseEvaluation, AgentCollapseAuditLog]:
    """Create a collapse event and append an audit record."""

    evaluation = evaluate_agent_collapse_risk(agent_id, payload.metrics)
    to_state = transition_agent_collapse_state(current_state, evaluation.suggested_state)
    restrictions = apply_collapse_restrictions(payload.collapse_type, to_state)
    truth_impact = payload.collapse_type in {
        CollapseType.truth_collapse,
        CollapseType.hallucination_collapse,
        CollapseType.correction_collapse,
        CollapseType.stage4_direct_write_attempt,
        CollapseType.stage1_direct_influence_attempt,
    }
    event = AgentCollapseEvent(
        event_id=_stable_id("collapse_event", agent_id, payload.collapse_type.value, evaluation.acr),
        agent_id=agent_id,
        owner_user_id=payload.metrics.owner_user_id,
        collapse_type=payload.collapse_type,
        from_state=current_state,
        to_state=to_state,
        acr=evaluation.acr,
        hard_policy_violation=evaluation.hard_policy_violation,
        hard_policy_reasons=evaluation.hard_policy_reasons,
        restrictions=restrictions,
        stage6_route_required=True,
        truth_impact_review_required=truth_impact or "truth_impact_review_required" in restrictions,
        deletes_agent=False,
        notes=payload.notes,
    )
    audit = write_collapse_audit_log(agent_id, event.event_id, "collapse_event_created", event.model_dump(mode="json"))
    return event, evaluation, audit


def create_recovery_plan(agent_id: str, request: AgentCollapseRecoveryPlanRequest) -> AgentCollapseRecoveryPlan:
    """Create a reviewable recovery plan without restoring the agent."""

    eligible = request.correction_capacity >= 0.70 and request.governance_integrity >= 0.80
    steps = request.steps or [
        "collect corrected outputs",
        "run Stage 6 verification window",
        "obtain council/admin approval",
        "enter RECOVERY before RESTORED",
    ]
    return AgentCollapseRecoveryPlan(
        plan_id=_stable_id("collapse_plan", agent_id, request.event_id, request.correction_capacity),
        agent_id=agent_id,
        event_id=request.event_id,
        correction_capacity=request.correction_capacity,
        governance_integrity=request.governance_integrity,
        steps=steps,
        eligible_for_review=eligible,
    )


def evaluate_recovery_eligibility(
    metrics: AgentCollapseMetricsInput,
    acr: float | None = None,
    hard_policy_violation: bool | None = None,
) -> bool:
    """Return true only when all restore gates pass."""

    if acr is None:
        acr = compute_collapse_metrics("eligibility", metrics).acr
    if hard_policy_violation is None:
        hard_policy_violation = detect_hard_policy_violation(metrics)[0]
    return (
        metrics.recovery_stability >= 0.80
        and acr < 0.40
        and metrics.correction_capacity >= 0.70
        and metrics.governance_integrity >= 0.80
        and metrics.windows_since_hard_policy_violation >= 3
        and not hard_policy_violation
        and metrics.review_approval_exists
    )


def restore_agent_from_collapse(
    agent_id: str,
    current_state: CollapseState,
    request: AgentCollapseRestoreRequest,
) -> AgentCollapseRestoreDecision:
    """Restore only through RECOVERY gates; emergency states cannot restore directly."""

    metrics = compute_collapse_metrics(agent_id, request.metrics)
    if current_state == CollapseState.EMERGENCY_RESTRICTED:
        target = CollapseState.RECOVERY
        restored = False
        reason = "emergency collapse cannot restore directly; enter admin review and recovery"
    elif evaluate_recovery_eligibility(request.metrics, metrics.acr, metrics.hard_policy_violation):
        target = CollapseState.RESTORED
        restored = True
        reason = "recovery gates satisfied with review approval"
    else:
        target = CollapseState.RECOVERY
        restored = False
        reason = "recovery gates not satisfied"
    audit = write_collapse_audit_log(agent_id, request.event_id, "restore_evaluated", {"restored": restored, "reason": reason})
    return AgentCollapseRestoreDecision(
        agent_id=agent_id,
        restored=restored,
        from_state=current_state,
        to_state=target,
        reason=reason,
        audit_id=audit.audit_id,
    )


def create_review(agent_id: str, request: AgentCollapseReviewRequest) -> tuple[AgentCollapseReview, AgentCollapseAuditLog]:
    """Create an admin/council review record and audit trail."""

    review = AgentCollapseReview(
        review_id=_stable_id("collapse_review", request.event_id, request.reviewer_id, request.approved),
        event_id=request.event_id,
        agent_id=agent_id,
        reviewer_id=request.reviewer_id,
        reviewer_role=request.reviewer_role,
        approved=request.approved,
        notes=request.notes,
    )
    audit = write_collapse_audit_log(agent_id, request.event_id, "collapse_review_recorded", review.model_dump(mode="json"))
    return review, audit


def create_restriction(agent_id: str, request: AgentCollapseRestrictionRequest) -> tuple[AgentCollapseRestriction, AgentCollapseAuditLog]:
    """Persist a restriction record and audit trail."""

    restriction = AgentCollapseRestriction(
        restriction_id=_stable_id("collapse_restriction", agent_id, request.event_id, request.restrictions),
        agent_id=agent_id,
        event_id=request.event_id,
        restrictions=sorted(set(request.restrictions)),
        reason=request.reason,
    )
    audit = write_collapse_audit_log(
        agent_id, request.event_id, "collapse_restriction_created", restriction.model_dump(mode="json")
    )
    return restriction, audit


def route_truth_impact_to_knowledge_council(event: AgentCollapseEvent) -> dict:
    """Route truth-impact collapse cases to the Knowledge and Truth Council."""

    envelope = build_council_socket_envelope(
        bound_unit_id="truth_impact_review_unit",
        origin_stage="agent_collapse_recovery_unit",
        trace_id=f"trace_{event.event_id}",
        request_id=event.event_id,
        payload={
            "agent_id": event.agent_id,
            "event_id": event.event_id,
            "collapse_type": event.collapse_type.value,
            "requires_stage6": True,
        },
        council_id=CouncilId.knowledge_truth,
        action="truth_impact_review",
        object_id=event.event_id,
        object_type="agent_collapse_event",
    )
    return envelope.model_dump(mode="json")


def route_high_risk_collapse_to_stage6(event: AgentCollapseEvent) -> dict:
    """Build a Stage 6 routing package for high-risk collapse events."""

    return {
        "event_id": event.event_id,
        "agent_id": event.agent_id,
        "route": "stage_6_hard_mesh",
        "stage6_required": True,
        "candidate_only": True,
        "reason": "collapse event requires structural verification before recovery or truth impact",
    }


def route_external_verification_to_stage7(event: AgentCollapseEvent) -> dict:
    """Build a Stage 7 candidate-memory package for external uncertainty review."""

    return {
        "event_id": event.event_id,
        "agent_id": event.agent_id,
        "route": "stage_7_external_memory_uncertainty",
        "candidate_only": True,
        "may_publish_truth": False,
        "stage6_required_for_truth": True,
    }


def write_collapse_audit_log(
    agent_id: str, event_id: str | None, action: str, metadata: dict
) -> AgentCollapseAuditLog:
    """Create an append-only collapse audit record."""

    return AgentCollapseAuditLog(
        audit_id=_stable_id("collapse_audit", agent_id, event_id, action, metadata),
        agent_id=agent_id,
        event_id=event_id,
        action=action,
        metadata=metadata,
    )
