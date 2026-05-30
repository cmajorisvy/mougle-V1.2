from fastapi.testclient import TestClient

from app.api import app


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
