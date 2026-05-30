"""Governed council socket fabric for future seven-council integrations.

The fabric is intentionally lightweight: it validates a typed envelope, applies
no-bypass policy, and returns a replayable decision. It does not call external
services and it does not let councils write directly to Stage 4 or Stage 1.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.models import (
    CouncilId,
    CouncilSocketDecision,
    CouncilSocketEnvelope,
    CouncilSocketRoute,
    PolicyDecisionOutcome,
)


SEVEN_COUNCIL_UNITS = [
    CouncilId.ai_agents.value,
    CouncilId.knowledge_truth.value,
    CouncilId.podcast_forum_debates.value,
    CouncilId.newsrooms.value,
    CouncilId.system_management.value,
    CouncilId.legal_management.value,
    CouncilId.financial_management.value,
]

COUNCIL_UNIT_ROLES: dict[CouncilId, str] = {
    CouncilId.ai_agents: "agent_orchestrator_unit",
    CouncilId.knowledge_truth: "truth_credit_attribution_unit",
    CouncilId.podcast_forum_debates: "debate_graph_moderation_unit",
    CouncilId.newsrooms: "verified_feed_studio_unit",
    CouncilId.system_management: "reliability_healing_unit",
    CouncilId.legal_management: "geo_legal_policy_unit",
    CouncilId.financial_management: "settlement_ledger_risk_unit",
}

BLOCKED_DIRECT_TARGETS = {
    "stage_1",
    "truth_crown",
    "stage_4",
    "knowledge_of_purity",
    "knowledge_of_purity_and_wisdom",
}

HIGH_RISK_COUNCILS = {CouncilId.legal_management, CouncilId.financial_management}
HIGH_RISK_ACTIONS = {
    "publish",
    "auto_publish",
    "legal_update",
    "update_law",
    "charge",
    "payout",
    "settle",
    "negative_credit",
    "score_to_money",
}

LOW_RISK_STAGE6_ACTIONS = {"telemetry", "observe", "health", "verify", "route"}


def _stable_hash(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def build_council_socket_envelope(
    bound_unit_id: str,
    origin_stage: str,
    trace_id: str,
    request_id: str,
    payload: dict[str, Any],
    *,
    council_id: CouncilId | str = CouncilId.ai_agents,
    action: str = "verify",
    object_id: str | None = None,
    object_type: str | None = None,
    target_stage: str | None = None,
    tenant_id: str | None = None,
    classification: str | None = None,
    payload_ref: str | None = None,
    provenance_ref: str | None = None,
    lineage_ref: str | None = None,
    deadline_ms: int | None = 3000,
    sensitivity: dict[str, Any] | None = None,
) -> CouncilSocketEnvelope:
    """Create a typed, replayable council socket envelope with a payload hash."""
    council = CouncilId(council_id)
    payload_hash = _stable_hash(payload)
    socket_id = f"socket_{payload_hash[:12]}"
    return CouncilSocketEnvelope(
        socket_id=socket_id,
        event_id=f"evt_{payload_hash[:16]}",
        spec_version="1.0",
        council_id=council,
        bound_unit_id=bound_unit_id,
        schema_id="mougle.council_socket.v1",
        origin_stage=origin_stage,
        trace_id=trace_id,
        request_id=request_id,
        tenant_id=tenant_id,
        classification=classification,
        deadline_ms=deadline_ms,
        action=action,
        object_id=object_id or str(payload.get("object_id", "")) or None,
        object_type=object_type or payload.get("object_type"),
        payload_ref=payload_ref,
        policy_context=dict(payload.get("policy_context", {})),
        provenance_ref=provenance_ref or payload.get("provenance_ref"),
        lineage_ref=lineage_ref or payload.get("lineage_ref"),
        trace_context={"trace_id": trace_id, "request_id": request_id},
        sensitivity=sensitivity or dict(payload.get("sensitivity", {})),
        idempotency_key=f"idem_{payload_hash[:16]}",
        target_stage=target_stage or payload.get("target_stage"),
        requires_human_review=bool(payload.get("requires_human_review", False)),
        payload_hash=payload_hash,
        request_payload=payload,
    )


def evaluate_council_socket_envelope(envelope: CouncilSocketEnvelope) -> CouncilSocketDecision:
    """Apply no-bypass and high-risk policy routing to a council envelope."""
    target = (envelope.target_stage or envelope.request_payload.get("target_stage") or "").lower()
    action = (envelope.action or envelope.request_payload.get("action") or "verify").lower()
    sensitive = envelope.sensitivity or {}
    is_sensitive = bool(sensitive.get("financial") or sensitive.get("legal") or sensitive.get("pii") == "high")
    blocked_bypass = target in BLOCKED_DIRECT_TARGETS
    high_risk = (
        envelope.council_id in HIGH_RISK_COUNCILS
        or action in HIGH_RISK_ACTIONS
        or envelope.requires_human_review
        or is_sensitive
    )

    if blocked_bypass:
        route = CouncilSocketRoute.rejected
        outcome = PolicyDecisionOutcome.deny
        reason = "direct Stage 4/Stage 1 bypass denied; route through Stage 7/6 verification"
    elif high_risk:
        route = CouncilSocketRoute.query_tank_pending
        outcome = PolicyDecisionOutcome.needs_review
        reason = "high-risk council event requires policy and human review before verification"
    elif action in LOW_RISK_STAGE6_ACTIONS:
        route = CouncilSocketRoute.stage_6_hard_mesh
        outcome = PolicyDecisionOutcome.allow
        reason = "low-risk event admitted to Stage 6 HARD-MESH routing"
    else:
        route = CouncilSocketRoute.stage_7_then_stage_6
        outcome = PolicyDecisionOutcome.allow
        reason = "event routed through Stage 7 boundary before Stage 6 verification"

    decision_hash = _stable_hash(
        {
            "socket_id": envelope.socket_id,
            "route": route.value,
            "outcome": outcome.value,
            "reason": reason,
        }
    )
    return CouncilSocketDecision(
        decision_id=f"decision_{decision_hash[:12]}",
        socket_id=envelope.socket_id,
        council_id=envelope.council_id,
        unit_id=envelope.bound_unit_id,
        route=route,
        policy_decision=outcome,
        route_reason=reason,
        blocked_stage_bypass=blocked_bypass,
        requires_human_review=high_risk,
        provenance_ref=envelope.provenance_ref,
        lineage_ref=envelope.lineage_ref,
        trace_id=envelope.trace_id,
    )


class CouncilSocketFabric:
    """Small in-process fabric used by the prototype API and tests."""

    def submit(self, envelope: CouncilSocketEnvelope) -> tuple[CouncilSocketEnvelope, CouncilSocketDecision]:
        """Return the normalized envelope and routing decision without side effects."""
        decision = evaluate_council_socket_envelope(envelope)
        envelope.status = "rejected" if decision.route == CouncilSocketRoute.rejected else "accepted"
        envelope.response_payload = decision.model_dump(mode="json")
        return envelope, decision
