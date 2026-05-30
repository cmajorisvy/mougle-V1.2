from app.agent_control import evaluate_agent_action
from app.models import (
    AgentActionClass,
    AgentActionRequest,
    AgentPassport,
    SignalDestination,
    SignalEvent,
)
from app.signal_culture import load_reduction_summary, process_signal_event


def _passport() -> AgentPassport:
    return AgentPassport(
        agent_id="agent_1",
        owner="user_1",
        purpose="local workload reduction",
        allowed_vaults=["public"],
        risk_limit=0.7,
        automation_level="assisted",
    )


def test_agent_micro_pyramid_never_returns_publish_truth():
    decision = evaluate_agent_action(
        AgentActionRequest(
            request_id="req_publish_truth",
            agent_id="agent_1",
            action_type="publish_truth",
            goal_alignment=0.95,
            tool_safety=0.95,
            simulation_success=0.95,
            user_benefit=0.95,
            local_risk=0.1,
            uncertainty=0.1,
        ),
        _passport(),
    )
    assert decision.action_class == AgentActionClass.block
    assert decision.council_socket is None
    assert "publish_truth" not in {item.value for item in AgentActionClass}


def test_high_risk_agent_action_escalates_to_council_socket():
    decision = evaluate_agent_action(
        AgentActionRequest(
            request_id="req_payout",
            agent_id="agent_1",
            action_type="payout",
            goal_alignment=0.9,
            tool_safety=0.8,
            simulation_success=0.8,
            user_benefit=0.9,
            local_risk=0.35,
            uncertainty=0.25,
            financial_sensitivity=True,
        ),
        _passport(),
    )
    assert decision.action_class == AgentActionClass.escalate_to_council
    assert decision.council_socket is not None
    assert decision.council_socket["council_id"] == "financial_management"
    assert decision.council_socket["origin_stage"] == "user_agent_micro_pyramid"


def test_signal_culture_routes_without_truth_authority():
    event = SignalEvent(
        event_id="sig_1",
        cloudevent_id="evt_1",
        event_type="public_claim",
        actor_id="user_1",
        actor_type="human",
        topic_id="france_capital",
        privacy_level="public",
        risk_level="low",
        source="test",
    )
    record = process_signal_event(
        event,
        {
            "novelty": 0.95,
            "evidence_strength": 0.95,
            "user_reputation": 0.9,
            "newsworthiness": 0.9,
        },
    )
    assert record.route.destination_type == SignalDestination.main_engine
    assert record.route.sent_to_main_engine is True
    assert 0.0 <= record.vector.routing_priority <= 1.0
    assert record.event.processing_status == "routed"


def test_signal_load_reduction_formula_handles_mixed_routes():
    archive = process_signal_event(
        SignalEvent(
            event_id="sig_archive",
            cloudevent_id="evt_archive",
            event_type="duplicate_like",
            actor_id="user_1",
            actor_type="human",
            risk_level="low",
        ),
        {"novelty": 0.1, "evidence_strength": 0.1, "duplication_penalty": 0.8},
    )
    main = process_signal_event(
        SignalEvent(
            event_id="sig_main",
            cloudevent_id="evt_main",
            event_type="public_claim",
            actor_id="user_1",
            actor_type="human",
            topic_id="topic_1",
            risk_level="low",
        ),
        {"novelty": 1.0, "evidence_strength": 1.0, "user_reputation": 1.0, "newsworthiness": 1.0},
    )
    summary = load_reduction_summary([archive, main])
    assert summary["totalEventsReceived"] == 2
    assert summary["eventsSentToMainEngine"] == 1
    assert summary["loadReductionRatio"] == 0.5
