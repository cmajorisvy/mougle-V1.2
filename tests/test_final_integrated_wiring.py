import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["TRUTH_PYRAMID_DB_PATH"] = str(
    Path(tempfile.gettempdir()) / f"verified_truth_pyramid_final_wiring_{os.getpid()}.db"
)

from app.api import app
from app.council_sockets import build_council_socket_envelope
from app.models import CouncilId

client = TestClient(app)


def _verify_payload(corpus=None):
    return {
        "query": "What is the capital of France?",
        "answer": "The capital of France is Paris.",
        "corpus": corpus
        if corpus is not None
        else [
            {
                "source_id": "s1",
                "source_name": "encyclopedia",
                "text": "Paris is the capital city of France.",
                "timestamp": "2026-01-01T00:00:00",
                "reliability": 0.95,
            }
        ],
        "options": {"enable_hard_mesh": True},
    }


def test_final_truth_pipeline_hard_mesh_graph_and_query_tank():
    assert client.get("/health").status_code == 200

    verify = client.post("/verify", json=_verify_payload())
    assert verify.status_code == 200
    data = verify.json()
    assert data["publish"] is True
    assert data["hard_mesh"]["classical_ml"] is not None
    assert data["hard_mesh"]["route"] == "stage_5_pass"

    graph = client.get(f"/graph/{data['answer_id']}")
    assert graph.status_code == 200
    assert any(node["node_type"] == "hard_mesh_run" for node in graph.json()["nodes"])

    hard_mesh = client.post("/hard-mesh/analyze", json=_verify_payload())
    assert hard_mesh.status_code == 200
    assert 0.0 <= hard_mesh.json()["hard_mesh"]["omega"] <= 1.0

    unresolved = client.post("/verify", json=_verify_payload(corpus=[]))
    assert unresolved.status_code == 200
    assert unresolved.json()["publish"] is False
    tank = client.get("/query-tank")
    assert tank.status_code == 200
    assert any(item["status"] == "open" for item in tank.json())


def test_final_council_socket_ptee_and_no_bypass_boundaries():
    financial = build_council_socket_envelope(
        bound_unit_id="settlement_ledger_risk_unit",
        origin_stage="council_socket_fabric",
        trace_id="trace_final_financial",
        request_id="request_final_financial",
        payload={"object_id": "ledger_123", "sensitivity": {"financial": True}},
        council_id=CouncilId.financial_management,
        action="payout",
        sensitivity={"financial": True},
    )
    resp = client.post("/council/socket/events", json=financial.model_dump(mode="json"))
    assert resp.status_code == 200
    assert resp.json()["decision"]["route"] == "query_tank_pending"

    for target in ["stage_4", "stage_1"]:
        bypass = build_council_socket_envelope(
            bound_unit_id="truth_credit_attribution_unit",
            origin_stage="council_socket_fabric",
            trace_id=f"trace_final_{target}",
            request_id=f"request_final_{target}",
            payload={"target_stage": target, "object_id": "truth_boundary"},
            council_id=CouncilId.knowledge_truth,
            action="publish",
            target_stage=target,
        )
        bypass_resp = client.post("/council/socket/events", json=bypass.model_dump(mode="json"))
        assert bypass_resp.status_code == 200
        assert bypass_resp.json()["decision"]["route"] == "rejected"
        assert bypass_resp.json()["decision"]["blocked_stage_bypass"] is True

    assert client.get("/council/socket/events").status_code == 200
    verify = client.post("/verify", json=_verify_payload())
    assert verify.status_code == 200
    topology = client.get("/topology/evolution")
    assert topology.status_code == 200
    assert topology.json()


def test_final_micro_pyramid_signal_culture_and_money_boundaries():
    agent_payload = {
        "passport": {
            "agent_id": "agent_final",
            "owner": "user_final",
            "purpose": "local workload reduction",
            "risk_limit": 0.7,
            "automation_level": "assisted",
        },
        "request": {
            "request_id": "req_final_score_money",
            "agent_id": "agent_final",
            "action_type": "score_to_money",
            "goal_alignment": 0.9,
            "tool_safety": 0.8,
            "simulation_success": 0.8,
            "user_benefit": 0.9,
        },
    }
    agent_resp = client.post("/agents/action-request", json=agent_payload)
    assert agent_resp.status_code == 200
    agent = agent_resp.json()
    assert agent["action_class"] == "escalate_to_council"
    assert agent["local_readiness"] <= 1.0
    assert "publish_truth" not in agent["action_class"]

    stage_target_payload = agent_payload.copy()
    stage_target_payload["request"] = dict(agent_payload["request"], request_id="req_stage4", target_stage="stage_4")
    blocked = client.post("/agents/action-request", json=stage_target_payload)
    assert blocked.status_code == 200
    assert blocked.json()["action_class"] in {"block", "escalate_to_council"}

    signal_payload = {
        "event": {
            "event_id": "sig_final",
            "cloudevent_id": "evt_final",
            "event_type": "public_claim",
            "actor_id": "user_final",
            "actor_type": "human",
            "topic_id": "capital_france",
            "privacy_level": "public",
            "risk_level": "low",
            "source": "final_wiring_test",
        },
        "hints": {"novelty": 1.0, "evidence_strength": 1.0, "user_reputation": 1.0, "newsworthiness": 1.0},
    }
    signal = client.post("/signal/events", json=signal_payload)
    assert signal.status_code == 200
    assert signal.json()["route"]["destination_type"] == "main_engine"
    reduction = client.get("/admin/signal-load-reduction")
    assert reduction.status_code == 200
    assert 0.0 <= reduction.json()["loadReductionRatio"] <= 1.0


def test_final_stage7_candidate_only_and_archive_reuse_guards():
    record_resp = client.post(
        "/stage7/external-records",
        json={
            "claim_text": "External candidate says Paris is the capital of France.",
            "tank": "stage7_a_supported_data_tank",
            "confidence": 0.9,
            "evidence_quality": 0.8,
        },
    )
    assert record_resp.status_code == 200
    record = record_resp.json()
    assert record["candidate_only"] is True
    assert record["may_publish_truth"] is False
    assert record["may_update_stage1"] is False
    assert record["may_update_stage4"] is False

    disputed = client.post(
        "/stage7/external-records",
        json={
            "claim_text": "Disputed unresolved candidate.",
            "tank": "stage7_b_unapproved_disputed_unknown_tank",
            "status": "disputed",
            "contradiction_count": 1,
        },
    )
    assert disputed.status_code == 200
    assert disputed.json()["status"] == "disputed"

    submit = client.post("/stage7/stage6/submit", json={"record_id": record["record_id"]})
    assert submit.status_code == 200
    assert submit.json()["candidate_answer_not_verified"] is True
    assert submit.json()["stage6_required"] is True

    candidates = client.get("/archive/micro-pyramid/candidates?limit=20")
    assert candidates.status_code == 200
    assert candidates.json()["files_scanned"] >= 1000
    imports = client.get("/archive/runtime-imports/check")
    assert imports.status_code == 200
    assert imports.json()["passed"] is True


def test_final_collapse_flow_and_boundaries():
    agent_id = "agent_collapse_final"
    evaluate = client.post(
        f"/agents/{agent_id}/collapse/evaluate",
        json={
            "owner_user_id": "owner_final",
            "truth_collapse_pressure": 1.0,
            "vault_violation_rate": 1.0,
            "hard_policy_flags": {"secret_vault_exposed": True, "stage6_bypassed": True},
        },
    )
    assert evaluate.status_code == 200
    assert evaluate.json()["suggested_state"] == "EMERGENCY_RESTRICTED"

    event_resp = client.post(
        f"/agents/{agent_id}/collapse/events",
        json={
            "collapse_type": "stage6_bypass_attempt",
            "metrics": {
                "owner_user_id": "owner_final",
                "truth_collapse_pressure": 1.0,
                "hard_policy_flags": {"secret_vault_exposed": True, "stage6_bypassed": True},
            },
        },
    )
    assert event_resp.status_code == 200
    event = event_resp.json()
    assert event["to_state"] == "EMERGENCY_RESTRICTED"
    assert event["deletes_agent"] is False
    assert "external_tools_disabled" in event["restrictions"]
    assert "agent_to_agent_messages_disabled" in event["restrictions"]
    event_id = event["event_id"]

    own_state = client.get(f"/agents/{agent_id}/collapse/state?viewer_user_id=owner_final")
    assert own_state.status_code == 200
    denied = client.get(f"/agents/{agent_id}/collapse/events?viewer_user_id=other_user")
    assert denied.status_code == 403

    restrictions = client.post(
        f"/agents/{agent_id}/collapse/restrictions",
        json={"event_id": event_id, "restrictions": ["safe_clone_export_disabled"]},
    )
    assert restrictions.status_code == 200
    assert "safe_clone_export_disabled" in restrictions.json()["restriction"]["restrictions"]

    plan = client.post(
        f"/agents/{agent_id}/collapse/recovery-plan",
        json={"event_id": event_id, "correction_capacity": 0.8, "governance_integrity": 0.9},
    )
    assert plan.status_code == 200
    assert plan.json()["plan"]["eligible_for_review"] is True

    review = client.post(
        f"/agents/{agent_id}/collapse/review",
        json={"event_id": event_id, "reviewer_id": "admin_1", "reviewer_role": "admin", "approved": True},
    )
    assert review.status_code == 200

    restore = client.post(
        f"/agents/{agent_id}/collapse/restore",
        json={
            "event_id": event_id,
            "metrics": {
                "owner_user_id": "owner_final",
                "recovery_stability": 1.0,
                "correction_capacity": 1.0,
                "governance_integrity": 1.0,
                "review_approval_exists": True,
                "windows_since_hard_policy_violation": 5,
            },
        },
    )
    assert restore.status_code == 200
    assert restore.json()["restored"] is False
    assert restore.json()["to_state"] == "RECOVERY"

    admin_events = client.get("/admin/agents/collapse/events")
    assert admin_events.status_code == 200
    admin_alerts = client.get("/admin/agents/collapse/alerts")
    assert admin_alerts.status_code == 200
    metrics = client.get("/admin/agents/collapse/metrics")
    assert metrics.status_code == 200
    assert metrics.json()["deletes_agent"] is False

    stage6_route = client.post(f"/admin/agents/collapse/{event_id}/route-stage6")
    assert stage6_route.status_code == 200
    assert stage6_route.json()["stage6_required"] is True

    truth_route = client.post(f"/admin/agents/collapse/{event_id}/route-truth-impact")
    assert truth_route.status_code == 200
    assert truth_route.json()["envelope"]["council_id"] == "knowledge_truth"
    assert truth_route.json()["decision"]["route"] == "stage_7_then_stage_6"
