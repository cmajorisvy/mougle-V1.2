"""Agent micro-pyramid readiness and safe escalation logic.

This module is deliberately local and deterministic. It computes readiness and
simulation outputs for user-owned agents, but it never returns final truth or
publishing authority.
"""

from __future__ import annotations

import hashlib
import math

from app.council_sockets import build_council_socket_envelope
from app.models import (
    AgentActionClass,
    AgentActionDecision,
    AgentActionRequest,
    AgentMicroPyramidState,
    AgentPassport,
    AgentSimulationRun,
    CouncilId,
)

BLOCKED_ACTION_TYPES = {"publish_truth", "write_stage_4", "write_stage_1", "direct_truth_crown"}
HIGH_RISK_ACTION_TYPES = {"payout", "legal_update", "public_accusation", "auto_publish", "charge"}


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def _stable_id(prefix: str, *parts: object) -> str:
    body = ":".join(str(part) for part in parts)
    digest = hashlib.sha1(body.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def can_agent_act(request: AgentActionRequest, passport: AgentPassport) -> tuple[bool, list[str]]:
    """Evaluate the hard permission gateway before local action or escalation."""
    reasons: list[str] = []
    checks = {
        "owner permission": request.owner_permission,
        "vault permission": request.vault_permission,
        "action permission": request.action_permission,
        "risk allowed": request.risk_allowed,
        "safe mode allowed": request.safe_mode_allowed,
        "law allowed": request.law_allowed,
        "audit enabled": request.audit_enabled,
    }
    for label, passed in checks.items():
        if not passed:
            reasons.append(f"missing {label}")
    if request.local_risk > passport.risk_limit:
        reasons.append("local risk exceeds passport risk limit")
    if request.action_type in BLOCKED_ACTION_TYPES:
        reasons.append("requested action would bypass Stage 6 or final truth authority")
    return not reasons, reasons


def compute_local_readiness(request: AgentActionRequest) -> float:
    """Compute local readiness without converting it into truth authority."""
    positive = (
        1.1 * request.permission_fit
        + 0.9 * request.goal_alignment
        + 0.7 * request.memory_relevance
        + 0.9 * request.tool_safety
        + 0.9 * request.simulation_success
        + 0.7 * request.user_benefit
    )
    negative = 1.2 * request.local_risk + 0.9 * request.uncertainty + 0.6 * request.notification_fatigue
    return _clip01(_sigmoid(positive - negative - 2.0))


def simulate_agent_action(request: AgentActionRequest) -> AgentSimulationRun:
    """Create a deterministic simulation bundle for the local micro-pyramid."""
    risk_score = _clip01(max(request.local_risk, request.uncertainty * 0.5))
    escalation_need = _clip01(
        max(
            request.local_risk,
            request.uncertainty,
            1.0 if request.legal_sensitivity or request.financial_sensitivity else 0.0,
        )
    )
    outcome_score = _clip01((request.goal_alignment + request.user_benefit + request.simulation_success) / 3.0)
    tool_success = _clip01((request.tool_safety + request.simulation_success) / 2.0)
    return AgentSimulationRun(
        sim_run_id=_stable_id("sim", request.agent_id, request.request_id, request.action_type),
        agent_id=request.agent_id,
        request_id=request.request_id,
        outcome_score=outcome_score,
        risk_score=risk_score,
        goal_fit=request.goal_alignment,
        tool_success_probability=tool_success,
        escalation_need=escalation_need,
        uncertainty=request.uncertainty,
        explanation="deterministic local simulation bundle; not final truth authority",
        provenance_ref=f"agent-request:{request.request_id}",
    )


def classify_agent_action(
    request: AgentActionRequest,
    passport: AgentPassport,
    readiness: float,
    can_act: bool,
    simulation: AgentSimulationRun,
) -> tuple[AgentActionClass, list[str]]:
    """Map readiness and policy signals into one of the six allowed action classes."""
    if not can_act or request.action_type in BLOCKED_ACTION_TYPES:
        return AgentActionClass.block, ["permission or no-bypass guard denied the action"]
    if request.action_type in HIGH_RISK_ACTION_TYPES or request.legal_sensitivity or request.financial_sensitivity:
        return AgentActionClass.escalate_to_council, ["high-risk action requires council and policy review"]
    if simulation.escalation_need >= 0.8:
        return AgentActionClass.escalate_to_council, ["simulation requires escalation"]
    if readiness >= 0.75 and passport.automation_level in {"assisted", "local_auto"}:
        return AgentActionClass.proceed_local, ["local readiness is sufficient for non-truth local action"]
    if readiness >= 0.55:
        return AgentActionClass.ask_user, ["user confirmation is needed before local action"]
    if readiness >= 0.35:
        return AgentActionClass.simulate_more, ["readiness is borderline; run more simulation"]
    return AgentActionClass.archive, ["low readiness; archive without waking the main engine"]


def evaluate_agent_action(
    request: AgentActionRequest,
    passport: AgentPassport,
) -> AgentActionDecision:
    """Evaluate a user-agent action request and optionally prepare council escalation."""
    can_act, permission_reasons = can_agent_act(request, passport)
    readiness = compute_local_readiness(request)
    simulation = simulate_agent_action(request)
    action_class, action_reasons = classify_agent_action(request, passport, readiness, can_act, simulation)
    reasons = permission_reasons + action_reasons
    council_socket = None
    if action_class == AgentActionClass.escalate_to_council:
        council = CouncilId.ai_agents
        if request.financial_sensitivity:
            council = CouncilId.financial_management
        elif request.legal_sensitivity:
            council = CouncilId.legal_management
        envelope = build_council_socket_envelope(
            bound_unit_id="agent_orchestrator_unit",
            origin_stage="user_agent_micro_pyramid",
            trace_id=f"trace_{request.request_id}",
            request_id=request.request_id,
            payload={
                "agent_id": request.agent_id,
                "request_id": request.request_id,
                "action": request.action_type,
                "local_readiness": readiness,
                "simulation_ref": simulation.sim_run_id,
                "target_stage": request.target_stage,
                "sensitivity": {
                    "legal": request.legal_sensitivity,
                    "financial": request.financial_sensitivity,
                },
            },
            council_id=council,
            action=request.action_type,
            object_id=request.request_id,
            object_type="agent_action_request",
            target_stage=request.target_stage,
            sensitivity={"legal": request.legal_sensitivity, "financial": request.financial_sensitivity},
        )
        council_socket = envelope.model_dump(mode="json")

    micro_state = AgentMicroPyramidState(
        agent_id=request.agent_id,
        local_readiness=readiness,
        action_class=action_class,
        notification_fatigue=request.notification_fatigue,
    )
    return AgentActionDecision(
        request_id=request.request_id,
        agent_id=request.agent_id,
        can_act=can_act,
        action_class=action_class,
        local_readiness=readiness,
        reasons=reasons,
        simulation=simulation,
        micro_pyramid=micro_state,
        council_socket=council_socket,
    )
