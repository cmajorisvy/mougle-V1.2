import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

os.environ.setdefault(
    "TRUTH_PYRAMID_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"vtp_restart_import_{os.getpid()}.sqlite"),
)

import app.api as app_api
from app.council_sockets import build_council_socket_envelope
from app.engine import VerificationEngine
from app.models import CouncilId


def _install_engine(db_path: Path) -> TestClient:
    app_api.engine = VerificationEngine(db_path=str(db_path))
    return TestClient(app_api.app)


def _verify_payload():
    return {
        "query": "What is the capital of France?",
        "answer": "The capital of France is Paris.",
        "corpus": [
            {
                "source_id": "s1",
                "source_name": "local encyclopedia",
                "text": "Paris is the capital city of France.",
                "timestamp": "2026-01-01T00:00:00",
                "reliability": 0.95,
            }
        ],
        "options": {"enable_hard_mesh": True},
    }


def test_persistence_survives_engine_reinstantiation(tmp_path: Path):
    db_path = tmp_path / "restart_truth_pyramid.sqlite"
    client = _install_engine(db_path)

    verify = client.post("/verify", json=_verify_payload())
    assert verify.status_code == 200
    answer_id = verify.json()["answer_id"]

    council = build_council_socket_envelope(
        bound_unit_id="verified_feed_studio_unit",
        origin_stage="council_socket_fabric",
        trace_id="trace_restart_council",
        request_id="request_restart_council",
        payload={"object_id": "newsroom_1"},
        council_id=CouncilId.newsrooms,
        action="verify",
    )
    assert client.post("/council/socket/events", json=council.model_dump(mode="json")).status_code == 200
    assert client.post(
        "/signal/events",
        json={
            "event": {
                "event_id": "sig_restart",
                "cloudevent_id": "evt_restart",
                "event_type": "public_claim",
                "actor_id": "user_restart",
                "actor_type": "human",
                "topic_id": "topic_restart",
                "risk_level": "low",
            },
            "hints": {"novelty": 1.0, "evidence_strength": 1.0, "user_reputation": 1.0, "newsworthiness": 1.0},
        },
    ).status_code == 200
    stage7 = client.post(
        "/stage7/external-records",
        json={"claim_text": "Restart candidate", "tank": "stage7_b_unapproved_disputed_unknown_tank"},
    )
    assert stage7.status_code == 200
    collapse = client.post(
        "/agents/agent_restart/collapse/events",
        json={
            "collapse_type": "privacy_collapse",
            "metrics": {"owner_user_id": "owner_restart", "hard_policy_flags": {"private_memory_leaked": True}},
        },
    )
    assert collapse.status_code == 200

    restarted = _install_engine(db_path)
    assert restarted.get(f"/graph/{answer_id}").status_code == 200
    assert restarted.get("/query-tank").status_code == 200
    assert restarted.get("/council/socket/events").json()
    assert restarted.get("/topology/evolution").json()
    assert restarted.get("/admin/signal-load-reduction").json()["totalEventsReceived"] >= 1
    assert any(row["record_id"] == stage7.json()["record_id"] for row in restarted.get("/stage7/external-records").json())
    state = restarted.get("/agents/agent_restart/collapse/state?viewer_user_id=owner_restart")
    assert state.status_code == 200
    assert state.json()["state"] in {"RESTRICTED", "EMERGENCY_RESTRICTED", "BLOCKED"}
