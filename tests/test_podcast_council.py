import os
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["TRUTH_PYRAMID_DB_PATH"] = str(Path("/tmp") / f"podcast_council_{os.getpid()}.db")

import app.api as app_api
from app.engine import VerificationEngine


client = TestClient(app_api.app)


def test_podcast_council_mvp_routes_candidates_and_packets_without_truth_authority(tmp_path):
    app_api.engine = VerificationEngine(db_path=str(tmp_path / "podcast_council.sqlite"))

    room_resp = client.post(
        "/podcast-council/rooms",
        json={
            "title": "Capital Cities Live",
            "topic": "European capitals",
            "host_user_id": "host_1",
            "topic_tags": ["geography", "debate"],
            "starting_reputation": 0.72,
        },
    )
    assert room_resp.status_code == 200
    room = room_resp.json()
    room_id = room["room_id"]
    assert room["candidate_only"] is True
    assert room["may_publish_truth"] is False
    assert room["may_update_stage1"] is False
    assert room["may_update_stage4"] is False
    assert room["reputation_metadata"]["gluon_is_money"] is False
    assert room["reputation_metadata"]["ues_is_payout"] is False
    assert room["reputation_metadata"]["agentrank_is_financial_eligibility"] is False

    rooms = client.get("/podcast-council/rooms")
    assert rooms.status_code == 200
    assert any(row["room_id"] == room_id for row in rooms.json())

    participant = client.post(
        f"/podcast-council/rooms/{room_id}/participants",
        json={
            "participant_id": "expert_1",
            "display_name": "Geography Expert",
            "role": "expert",
            "expertise_tags": ["geography"],
            "reputation_score": 0.9,
            "local_readiness": 0.82,
        },
    )
    assert participant.status_code == 200
    assert participant.json()["local_readiness_not_truth_score"] is True

    call = client.post(
        f"/podcast-council/rooms/{room_id}/call-for-experts",
        json={
            "topic": "France capital verification",
            "expertise_required": ["geography", "source review"],
            "requested_by": "host_1",
        },
    )
    assert call.status_code == 200
    assert call.json()["status"] == "open"

    blocked_invitation = client.post(
        f"/podcast-council/rooms/{room_id}/agent-invitations",
        json={
            "agent_id": "agent_debate_1",
            "purpose": "summarize debate claims",
            "requested_by": "host_1",
            "target_stage": "stage_1",
        },
    )
    assert blocked_invitation.status_code == 200
    invitation_data = blocked_invitation.json()
    assert invitation_data["status"] == "blocked"
    assert invitation_data["may_publish_truth"] is False
    assert invitation_data["may_update_stage1"] is False

    session = client.post(
        f"/podcast-council/rooms/{room_id}/sessions",
        json={
            "title": "Episode 1",
            "objective": "collect evidence before verification",
            "created_by": "host_1",
        },
    )
    assert session.status_code == 200
    session_id = session.json()["session_id"]

    turn = client.post(
        f"/podcast-council/sessions/{session_id}/turns",
        json={
            "speaker_id": "expert_1",
            "text": "Paris is the capital of France according to standard references.",
        },
    )
    assert turn.status_code == 200

    claim = client.post(
        f"/podcast-council/sessions/{session_id}/claims",
        json={
            "claim_text": "Paris is the capital of France.",
            "claimant_id": "expert_1",
            "turn_id": turn.json()["turn_id"],
            "confidence_signal": 0.8,
        },
    )
    assert claim.status_code == 200
    claim_data = claim.json()
    claim_id = claim_data["claim_id"]
    assert claim_data["candidate_only"] is True
    assert claim_data["may_publish_truth"] is False

    fabricated = client.post(
        f"/podcast-council/claims/{claim_id}/evidence",
        json={
            "source_id": "bad_source",
            "source_name": "fabricated",
            "text": "Invented evidence",
            "submitted_by": "expert_1",
            "no_fabricated_evidence_attestation": False,
        },
    )
    assert fabricated.status_code == 400

    evidence = client.post(
        f"/podcast-council/claims/{claim_id}/evidence",
        json={
            "source_id": "geo_source",
            "source_name": "encyclopedia",
            "text": "Paris is the capital city of France.",
            "submitted_by": "expert_1",
            "reliability": 0.95,
            "url_or_path": "local-corpus://france-capital",
        },
    )
    assert evidence.status_code == 200
    assert evidence.json()["no_fabricated_evidence_attestation"] is True

    review = client.post(
        f"/podcast-council/claims/{claim_id}/reviews",
        json={
            "reviewer_id": "expert_1",
            "reviewer_role": "expert",
            "verdict": "support",
            "confidence": 0.88,
            "rationale": "Submitted source supports the claim; Stage 6 still required.",
        },
    )
    assert review.status_code == 200
    assert review.json()["may_publish_truth"] is False
    assert review.json()["stage6_required"] is True

    stage7_route = client.post(f"/podcast-council/claims/{claim_id}/route-stage7")
    assert stage7_route.status_code == 200
    route_data = stage7_route.json()
    assert route_data["route"]["candidate_only"] is True
    assert route_data["route"]["stage6_required"] is True
    assert route_data["stage7_record"]["candidate_only"] is True
    assert route_data["stage7_record"]["may_publish_truth"] is False
    assert route_data["stage7_record"]["may_update_stage1"] is False
    assert route_data["stage7_record"]["may_update_stage4"] is False

    packet = client.post(f"/podcast-council/claims/{claim_id}/submit-stage6")
    assert packet.status_code == 200
    packet_data = packet.json()
    assert packet_data["route"] == "stage_6_hard_mesh"
    assert packet_data["candidate_answer_not_verified"] is True
    assert packet_data["may_publish_truth"] is False
    assert packet_data["may_update_stage1"] is False
    assert packet_data["may_update_stage4"] is False

    alerts = client.get(f"/podcast-council/rooms/{room_id}/risk-alerts")
    assert alerts.status_code == 200
    assert any(alert["severity"] == "critical" for alert in alerts.json())
    assert all(alert["stage6_required"] is True for alert in alerts.json())

    detail = client.get(f"/podcast-council/rooms/{room_id}")
    assert detail.status_code == 200
    detail_data = detail.json()
    assert detail_data["room"]["reputation_metadata"]["risk_score"] <= 1.0
    assert detail_data["claims"][0]["may_publish_truth"] is False

    audit = client.get(f"/podcast-council/audit-logs?room_id={room_id}")
    assert audit.status_code == 200
    actions = {row["action"] for row in audit.json()}
    assert "claim_routed_stage7" in actions
    assert "claim_submitted_stage6" in actions
    assert "agent_invitation_created" in actions

    cards = client.get("/dashboard/podcast-council/cards")
    assert cards.status_code == 200
    card_ids = {card["card_id"] for card in cards.json()}
    assert {"podcast_rooms_active", "podcast_stage7_routes", "podcast_stage6_packets"} <= card_ids

    pages = client.get("/dashboard/podcast-council/pages")
    assert pages.status_code == 200
    page = pages.json()[0]
    assert page["safety_boundaries"]["stage6_no_bypass"] is True
    assert page["safety_boundaries"]["stage7_candidate_only"] is True
    assert page["safety_boundaries"]["podcast_council_may_publish_truth"] is False
