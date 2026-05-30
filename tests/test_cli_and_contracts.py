import json
import os
import subprocess
import sys
from pathlib import Path

from app.config import load_truth_config
from app.council_sockets import (
    SEVEN_COUNCIL_UNITS,
    build_council_socket_envelope,
    evaluate_council_socket_envelope,
)
from app.models import CouncilId, CouncilSocketRoute, ExternalVerifierResult, PolicyDecisionOutcome
from app.plugins.implementations import ExternalJudgePlugin
from app.topology import build_topology_snapshot


def test_cli_smoke_path(tmp_path: Path):
    corpus = tmp_path / "corpus.json"
    corpus.write_text(
        json.dumps(
            [
                {
                    "source_id": "s1",
                    "source_name": "encyclopedia",
                    "text": "Paris is the capital city of France.",
                    "timestamp": "2026-01-01T00:00:00",
                    "reliability": 0.95,
                }
            ]
        ),
        encoding="utf-8",
    )
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.cli",
            "--query",
            "What is the capital of France?",
            "--answer",
            "The capital of France is Paris.",
            "--corpus",
            str(corpus),
        ],
        check=True,
        capture_output=True,
        env={**os.environ, "TRUTH_PYRAMID_DB_PATH": str(tmp_path / "truth_pyramid_cli.db")},
        text=True,
    )
    assert "Final verdict:" in result.stdout
    assert "Publish: True" in result.stdout
    assert "Stage 6 Omega:" in result.stdout


def test_config_loading_includes_hard_mesh():
    cfg = load_truth_config()
    assert cfg["hard_mesh"]["enabled"] is True
    assert cfg["hard_mesh"]["classical_ml"]["min_samples"] == 4
    assert cfg["calibration"]["mode"] == "identity"
    assert cfg["council_socket_fabric"]["default_route"] == "stage_7_then_stage_6"
    assert cfg["persistent_topological_engine"]["stage_anchor"] == "stage_4_stage_5_stage_6_core"


def test_external_judge_stub_has_no_provider_side_effects():
    plugin = ExternalJudgePlugin()
    assert plugin.name == "external_judge"
    assert ExternalVerifierResult().provider == "mock"
    assert "api" not in plugin.evaluate.__code__.co_names


def test_council_socket_contract_and_topology_snapshot():
    envelope = build_council_socket_envelope(
        bound_unit_id=SEVEN_COUNCIL_UNITS[0],
        origin_stage="stage_6",
        trace_id="trace_1",
        request_id="request_1",
        payload={"answer_id": "a1"},
    )
    assert envelope.payload_hash
    assert envelope.council_id == CouncilId.ai_agents

    import networkx as nx

    graph = nx.MultiDiGraph()
    graph.add_edge("a", "b")
    snapshot = build_topology_snapshot(graph)
    assert snapshot.node_count == 2
    assert 0.0 <= snapshot.graph_density <= 1.0


def test_council_socket_denies_stage_bypass_and_gates_high_risk():
    bypass = build_council_socket_envelope(
        bound_unit_id="truth_credit_attribution_unit",
        origin_stage="council_socket_fabric",
        trace_id="trace_bypass",
        request_id="request_bypass",
        payload={"target_stage": "stage_4", "object_id": "claim_1"},
        council_id=CouncilId.knowledge_truth,
        action="publish",
        target_stage="stage_4",
    )
    bypass_decision = evaluate_council_socket_envelope(bypass)
    assert bypass_decision.blocked_stage_bypass is True
    assert bypass_decision.route == CouncilSocketRoute.rejected
    assert bypass_decision.policy_decision == PolicyDecisionOutcome.deny

    payout = build_council_socket_envelope(
        bound_unit_id="settlement_ledger_risk_unit",
        origin_stage="council_socket_fabric",
        trace_id="trace_financial",
        request_id="request_financial",
        payload={"object_id": "ledger_1", "sensitivity": {"financial": True}},
        council_id=CouncilId.financial_management,
        action="payout",
        sensitivity={"financial": True},
    )
    payout_decision = evaluate_council_socket_envelope(payout)
    assert payout_decision.route == CouncilSocketRoute.query_tank_pending
    assert payout_decision.policy_decision == PolicyDecisionOutcome.needs_review
