import json
import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

os.environ.setdefault(
    "TRUTH_PYRAMID_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"vtp_security_import_{os.getpid()}.sqlite"),
)

import app.api as app_api
from app.council_sockets import build_council_socket_envelope
from app.engine import VerificationEngine
from app.models import CouncilId


def _client(tmp_path: Path) -> TestClient:
    app_api.engine = VerificationEngine(db_path=str(tmp_path / "security_truth_pyramid.sqlite"))
    return TestClient(app_api.app)


def _agent_payload(action_type: str, request_id: str, **extra):
    request = {
        "request_id": request_id,
        "agent_id": "agent_security",
        "action_type": action_type,
        "goal_alignment": 0.9,
        "tool_safety": 0.9,
        "simulation_success": 0.9,
        "user_benefit": 0.9,
    }
    request.update(extra)
    return {
        "passport": {
            "agent_id": "agent_security",
            "owner": "user_security",
            "purpose": "security boundary test",
            "risk_limit": 0.7,
            "automation_level": "assisted",
        },
        "request": request,
    }


def test_security_and_no_bypass_boundaries(tmp_path: Path):
    client = _client(tmp_path)

    secret_signal = client.post(
        "/signal/events",
        json={
            "event": {
                "event_id": "sig_secret_boundary",
                "cloudevent_id": "evt_secret_boundary",
                "event_type": "public_claim",
                "actor_id": "user_security",
                "actor_type": "human",
                "risk_level": "low",
                "source": "security_test",
                "raw_secret": "SECRET_TOKEN_SHOULD_NOT_SURVIVE",
            },
            "hints": {"novelty": 0.1},
        },
    )
    assert secret_signal.status_code == 200
    assert "SECRET_TOKEN_SHOULD_NOT_SURVIVE" not in json.dumps(secret_signal.json())

    for target in ["stage_4", "stage_1"]:
        envelope = build_council_socket_envelope(
            bound_unit_id="truth_credit_attribution_unit",
            origin_stage="council_socket_fabric",
            trace_id=f"trace_security_{target}",
            request_id=f"request_security_{target}",
            payload={"target_stage": target, "object_id": "bypass"},
            council_id=CouncilId.knowledge_truth,
            action="publish",
            target_stage=target,
        )
        response = client.post("/council/socket/events", json=envelope.model_dump(mode="json"))
        assert response.status_code == 200
        assert response.json()["decision"]["route"] == "rejected"
        assert response.json()["decision"]["blocked_stage_bypass"] is True

    stage7 = client.post(
        "/stage7/external-records",
        json={
            "claim_text": "Candidate attempting direct truth publish",
            "tank": "stage7_a_supported_data_tank",
            "metadata": {"target_stage": "stage_1", "provider_url": "https://api.openai.invalid"},
        },
    )
    assert stage7.status_code == 200
    assert stage7.json()["may_publish_truth"] is False
    assert stage7.json()["may_update_stage1"] is False
    assert stage7.json()["may_update_stage4"] is False

    publish_truth = client.post("/agents/action-request", json=_agent_payload("publish_truth", "req_publish_truth"))
    assert publish_truth.status_code == 200
    assert publish_truth.json()["action_class"] == "block"
    assert "publish_truth" not in {publish_truth.json()["action_class"]}

    for action_type in ["gluon_payout", "ues_payout", "agentrank_payout"]:
        response = client.post(
            "/agents/action-request",
            json=_agent_payload(action_type, f"req_security_{action_type}", financial_sensitivity=True),
        )
        assert response.status_code == 200
        assert response.json()["action_class"] in {"escalate_to_council", "block"}
        assert response.json()["action_class"] != "proceed_local"

    collapse = client.post(
        "/agents/agent_security/collapse/events",
        json={
            "collapse_type": "stage4_direct_write_attempt",
            "metrics": {
                "owner_user_id": "owner_security",
                "hard_policy_flags": {
                    "stage4_direct_write_attempted": True,
                    "stage1_direct_influence_attempted": True,
                    "payment_without_compliance": True,
                },
            },
        },
    )
    assert collapse.status_code == 200
    event = collapse.json()
    assert event["deletes_agent"] is False
    assert event["to_state"] == "EMERGENCY_RESTRICTED"

    restore = client.post(
        "/agents/agent_security/collapse/restore",
        json={
            "event_id": event["event_id"],
            "metrics": {
                "owner_user_id": "owner_security",
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
    assert not any("DELETE" in methods for methods in [route.methods for route in app_api.app.routes if "/collapse" in getattr(route, "path", "")])

    fabricated = client.post(
        "/verify",
        json={
            "query": "Does fabricated evidence prove this?",
            "answer": "Fabricated evidence proves this claim.",
            "corpus": [],
            "options": {"enable_hard_mesh": True},
        },
    )
    assert fabricated.status_code == 200
    assert fabricated.json()["publish"] is False
    assert fabricated.json()["unresolved_reason"] is not None

    admin_dump = json.dumps(client.get("/admin/agents/collapse/events").json()).lower()
    assert "secret_token_should_not_survive" not in admin_dump
    assert "database_url" not in admin_dump

    imports = client.get("/archive/runtime-imports/check")
    assert imports.status_code == 200
    assert imports.json()["passed"] is True
    candidates = client.get("/archive/micro-pyramid/candidates?limit=50")
    assert candidates.status_code == 200
    assert all(not candidate.get("blocked", False) for candidate in candidates.json()["candidates"])
