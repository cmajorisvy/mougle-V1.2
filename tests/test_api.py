import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["TRUTH_PYRAMID_DB_PATH"] = str(
    Path(tempfile.gettempdir()) / f"verified_truth_pyramid_api_tests_{os.getpid()}.db"
)

from app.api import app
from app.council_sockets import build_council_socket_envelope
from app.models import CouncilId


client = TestClient(app)


def test_verify_happy_path():
    payload = {
        "query": "What is the capital of France?",
        "answer": "Paris is the capital of France.",
        "corpus": [
            {
                "source_id": "s1",
                "source_name": "encyclopedia",
                "text": "Paris is the capital city of France.",
                "timestamp": "2026-01-01T00:00:00",
                "reliability": 0.95,
            }
        ],
    }
    resp = client.post("/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "answer_id" in data
    assert 0.0 <= data["tvs"] <= 100.0
    assert data["publish"] is True
    assert data["confidence_explanation"]
    assert data["claim_rollup"]["supported"] >= 1
    assert data["hard_mesh"]["omega"] >= 0.0
    assert data["hard_mesh"]["classical_ml"] is not None
    assert data["hard_mesh"]["route"] == "stage_5_pass"


def test_verify_abstention_path():
    payload = {
        "query": "What is the capital of France?",
        "answer": "Paris is the capital of France.",
        "corpus": [],
    }
    resp = client.post("/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["publish"] is False
    assert data["unresolved_reason"] is not None


def test_verify_graph_endpoint_after_verification():
    payload = {
        "query": "What is the capital of France?",
        "answer": "Paris is the capital of France.",
        "corpus": [
            {
                "source_id": "s1",
                "source_name": "encyclopedia",
                "text": "Paris is the capital city of France.",
                "timestamp": "2026-01-01T00:00:00",
                "reliability": 0.95,
            }
        ],
    }
    verify_resp = client.post("/verify", json=payload)
    answer_id = verify_resp.json()["answer_id"]
    graph_resp = client.get(f"/graph/{answer_id}")
    assert graph_resp.status_code == 200
    graph = graph_resp.json()
    assert graph["nodes"]
    assert graph["edges"]
    assert any(node["node_type"] == "hard_mesh_run" for node in graph["nodes"])


def test_health_reports_stage6_and_storage():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stage6_available"] is True
    assert data["storage_available"] is True


def test_verify_contradictory_evidence_abstains():
    payload = {
        "query": "Is Paris the capital of France?",
        "answer": "Paris is the capital of France.",
        "corpus": [
            {
                "source_id": "s1",
                "source_name": "encyclopedia",
                "text": "Paris is the capital city of France.",
                "timestamp": "2026-01-01T00:00:00",
                "reliability": 0.95,
            },
            {
                "source_id": "s2",
                "source_name": "bad-source",
                "text": "Paris is not the capital city of France.",
                "timestamp": "2026-01-01T00:00:00",
                "reliability": 0.2,
            },
        ],
    }
    resp = client.post("/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["publish"] is False
    assert data["unresolved_reason"] in {"source conflict", "human review required"}


def test_verify_stale_evidence_abstains():
    payload = {
        "query": "What is the capital of France?",
        "answer": "Paris is the capital of France.",
        "corpus": [
            {
                "source_id": "s1",
                "source_name": "old-encyclopedia",
                "text": "Paris is the capital city of France.",
                "timestamp": "2000-01-01T00:00:00",
                "reliability": 0.95,
            }
        ],
    }
    resp = client.post("/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["publish"] is False
    assert data["unresolved_reason"] == "stale knowledge"


def test_verify_out_of_domain_abstains():
    payload = {
        "query": "What is the capital of France?",
        "answer": "Paris is the capital of France.",
        "corpus": [
            {
                "source_id": "s1",
                "source_name": "cooking-notes",
                "text": "Sourdough starters need regular feeding.",
                "timestamp": "2026-01-01T00:00:00",
                "reliability": 0.8,
            }
        ],
    }
    resp = client.post("/verify", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["publish"] is False
    assert data["unresolved_reason"] == "out of domain"


def test_query_tank_endpoint_returns_pending_records():
    payload = {
        "query": "What is the capital of France?",
        "answer": "Paris is the capital of France.",
        "corpus": [],
    }
    verify_resp = client.post("/verify", json=payload)
    assert verify_resp.status_code == 200
    tank_resp = client.get("/query-tank")
    assert tank_resp.status_code == 200
    assert isinstance(tank_resp.json(), list)


def test_api_connection_wiring_for_hard_mesh_graph_and_query_tank():
    supported_payload = {
        "query": "What is the capital of France?",
        "answer": "The capital of France is Paris.",
        "corpus": [
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
    verify_resp = client.post("/verify", json=supported_payload)
    assert verify_resp.status_code == 200
    answer_id = verify_resp.json()["answer_id"]

    graph_resp = client.get(f"/graph/{answer_id}")
    assert graph_resp.status_code == 200
    assert any(node["node_type"] == "hard_mesh_run" for node in graph_resp.json()["nodes"])

    analyze_resp = client.post("/hard-mesh/analyze", json=supported_payload)
    assert analyze_resp.status_code == 200
    hard_mesh = analyze_resp.json()["hard_mesh"]
    assert hard_mesh["classical_ml"] is not None
    assert 0.0 <= hard_mesh["omega"] <= 1.0

    unresolved_payload = {
        "query": "What is the capital of France?",
        "answer": "The capital of France is Paris.",
        "corpus": [],
    }
    unresolved_resp = client.post("/verify", json=unresolved_payload)
    assert unresolved_resp.status_code == 200
    assert unresolved_resp.json()["publish"] is False

    tank_resp = client.get("/query-tank")
    assert tank_resp.status_code == 200
    assert any(item["status"] == "open" for item in tank_resp.json())


def test_council_socket_api_connection_and_no_bypass_wiring():
    envelope = build_council_socket_envelope(
        bound_unit_id="settlement_ledger_risk_unit",
        origin_stage="council_socket_fabric",
        trace_id="trace_api_financial",
        request_id="request_api_financial",
        payload={"object_id": "ledger_123", "sensitivity": {"financial": True}},
        council_id=CouncilId.financial_management,
        action="payout",
        sensitivity={"financial": True},
    )
    resp = client.post("/council/socket/events", json=envelope.model_dump(mode="json"))
    assert resp.status_code == 200
    data = resp.json()
    assert data["decision"]["route"] == "query_tank_pending"
    assert data["decision"]["policy_decision"] == "needs_review"

    events_resp = client.get("/council/socket/events")
    assert events_resp.status_code == 200
    assert any(
        event["decision"]["socket_id"] == envelope.socket_id for event in events_resp.json()
    )

    bypass = build_council_socket_envelope(
        bound_unit_id="truth_credit_attribution_unit",
        origin_stage="council_socket_fabric",
        trace_id="trace_api_bypass",
        request_id="request_api_bypass",
        payload={"target_stage": "stage_1", "object_id": "truth_crown"},
        council_id=CouncilId.knowledge_truth,
        action="publish",
        target_stage="stage_1",
    )
    bypass_resp = client.post("/council/socket/events", json=bypass.model_dump(mode="json"))
    assert bypass_resp.status_code == 200
    bypass_data = bypass_resp.json()
    assert bypass_data["decision"]["route"] == "rejected"
    assert bypass_data["decision"]["blocked_stage_bypass"] is True


def test_topology_evolution_endpoint_is_wired_after_verification():
    payload = {
        "query": "What is the capital of France?",
        "answer": "The capital of France is Paris.",
        "corpus": [
            {
                "source_id": "s1",
                "source_name": "encyclopedia",
                "text": "Paris is the capital city of France.",
                "timestamp": "2026-01-01T00:00:00",
                "reliability": 0.95,
            }
        ],
    }
    verify_resp = client.post("/verify", json=payload)
    assert verify_resp.status_code == 200
    answer_id = verify_resp.json()["answer_id"]

    topology_resp = client.get("/topology/evolution")
    assert topology_resp.status_code == 200
    records = topology_resp.json()
    assert any(record["answer_id"] == answer_id for record in records)
    assert any(record["stage_anchor"] == "stage_4_stage_5_stage_6_core" for record in records)
