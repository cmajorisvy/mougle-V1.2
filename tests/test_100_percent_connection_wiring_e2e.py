import json
import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

os.environ.setdefault(
    "TRUTH_PYRAMID_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"vtp_100_e2e_import_{os.getpid()}.sqlite"),
)

import app.api as app_api
from app.council_sockets import build_council_socket_envelope
from app.engine import VerificationEngine
from app.models import CouncilId
from scripts.discover_routes import build_route_matrix, write_route_artifacts


def _client(tmp_path: Path) -> TestClient:
    app_api.engine = VerificationEngine(db_path=str(tmp_path / "e2e_truth_pyramid.sqlite"))
    return TestClient(app_api.app)


def _verify_payload(corpus=None, answer="The capital of France is Paris."):
    return {
        "query": "What is the capital of France?",
        "answer": answer,
        "corpus": corpus
        if corpus is not None
        else [
            {
                "source_id": "s1",
                "source_name": "local encyclopedia",
                "text": "Paris is the capital city of France.",
                "timestamp": "2026-01-01T00:00:00",
                "reliability": 0.95,
            }
        ],
        "options": {"enable_hard_mesh": True, "enable_external_stub": False},
    }


def _agent_payload(action_type="payout", request_id="req_e2e_agent", **overrides):
    request = {
        "request_id": request_id,
        "agent_id": "agent_e2e",
        "action_type": action_type,
        "goal_alignment": 0.9,
        "tool_safety": 0.8,
        "simulation_success": 0.8,
        "user_benefit": 0.9,
        "financial_sensitivity": action_type in {"payout", "gluon_payout", "ues_payout", "agentrank_payout"},
    }
    request.update(overrides)
    return {
        "passport": {
            "agent_id": "agent_e2e",
            "owner": "user_e2e",
            "purpose": "local workload reduction",
            "risk_limit": 0.7,
            "automation_level": "assisted",
        },
        "request": request,
    }


def test_100_percent_connection_wiring_all_routes_and_boundaries(tmp_path: Path):
    client = _client(tmp_path)

    # 1-8: app boot, truth pipeline, HARD-MESH, graph, query tank.
    assert client.get("/health").json()["status"] == "ok"
    verify = client.post("/verify", json=_verify_payload())
    assert verify.status_code == 200
    verified = verify.json()
    assert verified["publish"] is True
    assert 0.0 <= verified["tvs"] <= 100.0
    assert 0.0 <= verified["tmi"] <= 1.0
    assert verified["claims"]
    assert verified["hard_mesh"]["classical_ml"] is not None
    assert verified["hard_mesh"]["route"] == "stage_5_pass"
    assert verified["hard_mesh"]["route"] != "final_truth"

    graph = client.get(f"/graph/{verified['answer_id']}")
    assert graph.status_code == 200
    graph_payload = graph.json()
    assert any(node["node_type"] == "claim" for node in graph_payload["nodes"])
    assert any(node["node_type"] == "hard_mesh_run" for node in graph_payload["nodes"])

    hard_mesh = client.post("/hard-mesh/analyze", json=_verify_payload())
    assert hard_mesh.status_code == 200
    assert 0.0 <= hard_mesh.json()["hard_mesh"]["omega"] <= 1.0
    assert hard_mesh.json()["hard_mesh"]["classical_ml"] is not None

    weak = client.post("/verify", json=_verify_payload(corpus=[], answer="Atlantis is the capital of France."))
    assert weak.status_code == 200
    assert weak.json()["publish"] is False
    tank = client.get("/query-tank")
    assert tank.status_code == 200
    assert any(item["status"] in {"open", "pending", "disputed"} for item in tank.json())

    # 9-13: council socket no-bypass, high-risk review, topology evolution.
    financial = build_council_socket_envelope(
        bound_unit_id="settlement_ledger_risk_unit",
        origin_stage="council_socket_fabric",
        trace_id="trace_e2e_financial",
        request_id="request_e2e_financial",
        payload={"object_id": "ledger_123", "sensitivity": {"financial": True}},
        council_id=CouncilId.financial_management,
        action="payout",
        sensitivity={"financial": True},
    )
    financial_resp = client.post("/council/socket/events", json=financial.model_dump(mode="json"))
    assert financial_resp.status_code == 200
    assert financial_resp.json()["decision"]["route"] == "query_tank_pending"

    for target in ["stage_4", "stage_1"]:
        bypass = build_council_socket_envelope(
            bound_unit_id="truth_credit_attribution_unit",
            origin_stage="council_socket_fabric",
            trace_id=f"trace_e2e_{target}",
            request_id=f"request_e2e_{target}",
            payload={"target_stage": target, "object_id": "truth_boundary"},
            council_id=CouncilId.knowledge_truth,
            action="publish",
            target_stage=target,
        )
        bypass_resp = client.post("/council/socket/events", json=bypass.model_dump(mode="json"))
        assert bypass_resp.status_code == 200
        assert bypass_resp.json()["decision"]["route"] == "rejected"
        assert bypass_resp.json()["decision"]["blocked_stage_bypass"] is True

    assert client.get("/council/socket/events").json()
    topology = client.get("/topology/evolution")
    assert topology.status_code == 200
    assert topology.json()

    # 14-21: Micro-Pyramid, Signal Culture, archive guard.
    action = client.post("/agents/action-request", json=_agent_payload())
    assert action.status_code == 200
    action_data = action.json()
    assert 0.0 <= action_data["local_readiness"] <= 1.0
    assert action_data["action_class"] == "escalate_to_council"
    assert "publish_truth" not in json.dumps(action_data)
    assert "truth_score" not in json.dumps(action_data).lower()

    public_truth = client.post(
        "/agents/action-request",
        json=_agent_payload("auto_publish", "req_public_truth", target_stage="stage_4"),
    )
    assert public_truth.json()["action_class"] in {"block", "escalate_to_council"}

    low_signal = client.post(
        "/signal/events",
        json={
            "event": {
                "event_id": "sig_e2e_low",
                "cloudevent_id": "evt_e2e_low",
                "event_type": "duplicate_like",
                "actor_id": "user_e2e",
                "actor_type": "human",
                "risk_level": "low",
                "source": "e2e",
            },
            "hints": {"novelty": 0.1, "evidence_strength": 0.1, "duplication_penalty": 0.9},
        },
    )
    assert low_signal.status_code == 200
    assert low_signal.json()["route"]["destination_type"] == "local_archive"

    high_signal = client.post(
        "/signal/events",
        json={
            "event": {
                "event_id": "sig_e2e_high",
                "cloudevent_id": "evt_e2e_high",
                "event_type": "legal_update",
                "actor_id": "user_e2e",
                "actor_type": "human",
                "risk_level": "high",
                "privacy_level": "public",
                "source": "e2e",
            },
            "hints": {"novelty": 1.0, "evidence_strength": 0.8, "risk_score": 1.0},
        },
    )
    assert high_signal.status_code == 200
    assert high_signal.json()["route"]["destination_type"] == "admin_review"
    assert "truth" not in high_signal.json()["route"]["route_reason"].lower()

    reduction = client.get("/admin/signal-load-reduction")
    assert reduction.status_code == 200
    assert 0.0 <= reduction.json()["loadReductionRatio"] <= 1.0

    candidates = client.get("/archive/micro-pyramid/candidates?limit=25")
    assert candidates.status_code == 200
    assert all(not row.get("blocked", False) for row in candidates.json()["candidates"])
    imports = client.get("/archive/runtime-imports/check")
    assert imports.status_code == 200
    assert imports.json()["passed"] is True

    # 22-28: Stage 7 candidate-only memory and Stage 6 handoff.
    supported = client.post(
        "/stage7/external-records",
        json={
            "claim_text": "External candidate says Paris is the capital of France.",
            "tank": "stage7_a_supported_data_tank",
            "confidence": 0.9,
            "evidence_quality": 0.8,
            "metadata": {"target_stage": "stage_4", "attempted_publish": True},
        },
    )
    assert supported.status_code == 200
    supported_data = supported.json()
    assert supported_data["candidate_only"] is True
    assert supported_data["may_publish_truth"] is False
    assert supported_data["may_update_stage1"] is False
    assert supported_data["may_update_stage4"] is False

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
    assert disputed.json()["candidate_only"] is True

    resolved = client.post("/stage7/query-tank/resolve", json={"record_id": disputed.json()["record_id"]})
    assert resolved.status_code == 200
    assert resolved.json()["may_publish_truth"] is False
    submit = client.post("/stage7/stage6/submit", json={"record_id": supported_data["record_id"]})
    assert submit.status_code == 200
    assert submit.json()["candidate_answer_not_verified"] is True
    assert submit.json()["stage6_required"] is True
    assert client.get("/stage7/external-records").json()
    assert client.get("/admin/stage7/alerts").status_code == 200

    # 29-40: Collapse risk/event/restriction/recovery/review/routing boundaries.
    agent_id = "agent_e2e_collapse"
    evaluation = client.post(
        f"/agents/{agent_id}/collapse/evaluate",
        json={
            "owner_user_id": "owner_e2e",
            "truth_collapse_pressure": 1.0,
            "vault_violation_rate": 1.0,
            "hard_policy_flags": {"secret_vault_exposed": True, "stage6_bypassed": True},
        },
    )
    assert evaluation.status_code == 200
    assert evaluation.json()["suggested_state"] == "EMERGENCY_RESTRICTED"

    event = client.post(
        f"/agents/{agent_id}/collapse/events",
        json={
            "collapse_type": "stage6_bypass_attempt",
            "metrics": {
                "owner_user_id": "owner_e2e",
                "truth_collapse_pressure": 1.0,
                "hard_policy_flags": {"secret_vault_exposed": True, "stage6_bypassed": True},
            },
        },
    )
    assert event.status_code == 200
    event_data = event.json()
    event_id = event_data["event_id"]
    assert event_data["to_state"] == "EMERGENCY_RESTRICTED"
    assert event_data["deletes_agent"] is False
    assert "external_tools_disabled" in event_data["restrictions"]
    assert "agent_to_agent_messages_disabled" in event_data["restrictions"]

    assert client.get(f"/agents/{agent_id}/collapse/events?viewer_user_id=owner_e2e").status_code == 200
    assert client.get(f"/agents/{agent_id}/collapse/state?viewer_user_id=owner_e2e").json()["state"] == "EMERGENCY_RESTRICTED"
    restriction = client.post(
        f"/agents/{agent_id}/collapse/restrictions",
        json={"event_id": event_id, "restrictions": ["safe_clone_export_disabled"]},
    )
    assert restriction.status_code == 200
    assert "safe_clone_export_disabled" in restriction.json()["restriction"]["restrictions"]

    plan = client.post(
        f"/agents/{agent_id}/collapse/recovery-plan",
        json={"event_id": event_id, "correction_capacity": 0.8, "governance_integrity": 0.9},
    )
    assert plan.status_code == 200
    review = client.post(
        f"/agents/{agent_id}/collapse/review",
        json={"event_id": event_id, "reviewer_id": "admin", "reviewer_role": "admin", "approved": True},
    )
    assert review.status_code == 200
    restore = client.post(
        f"/agents/{agent_id}/collapse/restore",
        json={
            "event_id": event_id,
            "metrics": {
                "owner_user_id": "owner_e2e",
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

    assert client.get("/admin/agents/collapse/events").status_code == 200
    assert client.get("/admin/agents/collapse/alerts").status_code == 200
    collapse_metrics = client.get("/admin/agents/collapse/metrics")
    assert collapse_metrics.status_code == 200
    assert collapse_metrics.json()["deletes_agent"] is False
    stage6_route = client.post(f"/admin/agents/collapse/{event_id}/route-stage6")
    assert stage6_route.status_code == 200
    assert stage6_route.json()["stage6_required"] is True
    truth_impact = client.post(f"/admin/agents/collapse/{event_id}/route-truth-impact")
    assert truth_impact.status_code == 200
    assert truth_impact.json()["envelope"]["council_id"] == "knowledge_truth"
    assert truth_impact.json()["decision"]["route"] == "stage_7_then_stage_6"

    # 41-48: money boundaries, no fabricated evidence, route coverage, persisted readability.
    for action_type in ["gluon_payout", "ues_payout", "agentrank_payout", "reputation_wallet_balance"]:
        money = client.post(
            "/agents/action-request",
            json=_agent_payload(action_type, f"req_{action_type}"),
        )
        assert money.status_code == 200
        assert money.json()["action_class"] != "proceed_local"

    fabricated = client.post(
        "/verify",
        json=_verify_payload(
            corpus=[],
            answer="This answer has fabricated evidence marker FABRICATED_EVIDENCE_VERIFIED.",
        ),
    )
    assert fabricated.status_code == 200
    fabricated_data = fabricated.json()
    assert fabricated_data["publish"] is False
    assert all(not claim.get("evidences") for claim in fabricated_data["claims"])
    assert fabricated_data["unresolved_reason"] is not None

    summary = write_route_artifacts()
    matrix = build_route_matrix()
    assert summary["missing_p0_p1_routes"] == []
    assert all(row.status == "tested" for row in matrix if row.criticality in {"P0", "P1"})

    # Admin outputs should not expose raw secret-like values from ignored extra fields.
    admin_dump = json.dumps(client.get("/admin/agents/collapse/events").json()).lower()
    assert "secret_token_should_not_survive" not in admin_dump
    assert "database_url" not in admin_dump
