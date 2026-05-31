import os
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["TRUTH_PYRAMID_DB_PATH"] = str(Path("/tmp") / f"newsrooms_council_{os.getpid()}.db")

import app.api as app_api
from app.engine import VerificationEngine


client = TestClient(app_api.app)


def test_newsrooms_council_mvp_routes_candidates_packets_and_dashboard(tmp_path):
    db_path = tmp_path / "newsrooms_council.sqlite"
    os.environ["TRUTH_PYRAMID_DB_PATH"] = str(db_path)
    app_api.engine = VerificationEngine(db_path=str(db_path))
    assert str(app_api.engine.store.path) == str(db_path)

    source_resp = client.post(
        "/newsrooms/sources",
        json={
            "name": "Local Civic Desk",
            "source_type": "website",
            "url_or_path": "local-news://civic-desk",
            "owner": "local newsroom",
            "topic_tags": ["civic", "infrastructure"],
            "historical_accuracy": 0.9,
            "correction_responsiveness": 0.85,
            "provenance_completeness": 0.82,
            "citation_quality": 0.8,
            "domain_authority": 0.75,
            "author_traceability": 0.78,
            "freshness_consistency": 0.8,
            "cross_source_agreement": 0.72,
            "retraction_penalty": 0.0,
            "sensationalism_penalty": 0.0,
            "unknown_ownership_penalty": 0.0,
        },
    )
    assert source_resp.status_code == 200
    source = source_resp.json()
    source_id = source["source_id"]
    assert 0.0 <= source["reliability_score"] <= 1.0
    assert source["source_reliability_is_truth_score"] is False
    assert source["may_publish_truth"] is False
    assert source["may_update_stage1"] is False
    assert source["may_update_stage4"] is False
    assert source["external_calls_made"] is False

    sources = client.get("/newsrooms/sources")
    assert sources.status_code == 200
    assert any(row["source_id"] == source_id for row in sources.json())

    source_detail = client.get(f"/newsrooms/sources/{source_id}")
    assert source_detail.status_code == 200
    assert source_detail.json()["source_id"] == source_id

    feed_resp = client.post(
        "/newsrooms/feeds",
        json={
            "source_id": source_id,
            "name": "Civic Desk Morning Feed",
            "feed_url": "local-feed://civic/morning",
            "topic_tags": ["civic"],
        },
    )
    assert feed_resp.status_code == 200
    feed_id = feed_resp.json()["feed_id"]

    feeds = client.get("/newsrooms/feeds")
    assert feeds.status_code == 200
    assert any(row["feed_id"] == feed_id for row in feeds.json())

    ingest_resp = client.post(
        f"/newsrooms/feeds/{feed_id}/ingest",
        json={
            "title": "Flood barrier plan moves forward",
            "body": "City council approved a flood barrier project yesterday. Officials said the project will cover three neighborhoods.",
            "url_or_path": "local-news://flood-barrier-feed",
            "author": "civic reporter",
        },
    )
    assert ingest_resp.status_code == 200
    ingest_data = ingest_resp.json()
    assert ingest_data["ingest_event"]["external_calls_made"] is False
    assert ingest_data["raw_item"]["external_calls_made"] is False

    article_resp = client.post(
        "/newsrooms/articles",
        json={
            "source_id": source_id,
            "title": "Flood barrier plan advances after council vote",
            "body": "City council approved a flood barrier project yesterday. Officials said the project will cover three neighborhoods. The budget remains under review by local auditors.",
            "url_or_path": "local-news://flood-barrier",
            "author": "civic reporter",
            "topic_tags": ["infrastructure", "weather"],
        },
    )
    assert article_resp.status_code == 200
    raw_article = article_resp.json()
    raw_item_id = raw_article["raw_item_id"]
    assert raw_article["source_id"] == source_id

    article_list = client.get("/newsrooms/articles")
    assert article_list.status_code == 200
    assert any(row["raw_item_id"] == raw_item_id for row in article_list.json()["raw_items"])

    article_detail = client.get(f"/newsrooms/articles/{raw_item_id}")
    assert article_detail.status_code == 200
    assert article_detail.json()["raw_item"]["raw_item_id"] == raw_item_id

    normalized_resp = client.post(f"/newsrooms/articles/{raw_item_id}/normalize")
    assert normalized_resp.status_code == 200
    article = normalized_resp.json()
    article_id = article["article_id"]
    assert article["newsworthiness_is_truth_score"] is False
    assert article["source_reliability_is_truth_score"] is False
    assert article["virality_is_truth"] is False
    assert article["may_publish_truth"] is False
    assert article["may_update_stage1"] is False
    assert article["may_update_stage4"] is False

    extracted_resp = client.post(f"/newsrooms/articles/{article_id}/extract-claims")
    assert extracted_resp.status_code == 200
    extracted = extracted_resp.json()
    claim_id = extracted["claims"][0]["claim_id"]
    score_bundle = extracted["score_bundle"]
    for key in [
        "source_reliability",
        "newsworthiness",
        "editorial_risk",
        "claim_priority",
        "freshness_decay",
        "newsroom_readiness",
        "broadcast_readiness",
    ]:
        assert 0.0 <= score_bundle[key] <= 1.0
    assert score_bundle["newsworthiness_is_truth_score"] is False
    assert score_bundle["source_reliability_is_truth_score"] is False

    claims = client.get("/newsrooms/claims")
    assert claims.status_code == 200
    assert any(row["claim_id"] == claim_id for row in claims.json())

    claim_detail = client.get(f"/newsrooms/claims/{claim_id}")
    assert claim_detail.status_code == 200
    assert claim_detail.json()["candidate_only"] is True

    fabricated = client.post(
        f"/newsrooms/claims/{claim_id}/evidence",
        json={
            "source_id": "fabricated_source",
            "source_name": "fabricated",
            "text": "Invented evidence text.",
            "submitted_by": "editor_1",
            "no_fabricated_evidence_attestation": False,
        },
    )
    assert fabricated.status_code == 400

    evidence_resp = client.post(
        f"/newsrooms/claims/{claim_id}/evidence",
        json={
            "source_id": "council_minutes",
            "source_name": "Council Minutes Archive",
            "text": "The meeting minutes record approval of the flood barrier project.",
            "submitted_by": "editor_1",
            "url_or_path": "local-evidence://minutes/flood-barrier",
            "reliability": 0.92,
        },
    )
    assert evidence_resp.status_code == 200
    evidence = evidence_resp.json()
    assert evidence["no_fabricated_evidence_attestation"] is True
    assert evidence["external_calls_made"] is False

    supported_route_resp = client.post(f"/newsrooms/claims/{claim_id}/route-stage7")
    assert supported_route_resp.status_code == 200
    supported_route = supported_route_resp.json()
    assert supported_route["route"]["candidate_only"] is True
    assert supported_route["route"]["stage6_required"] is True
    assert supported_route["stage7_record"]["tank"] == "stage7_a_supported_data_tank"
    assert supported_route["stage7_record"]["candidate_only"] is True
    assert supported_route["stage7_record"]["may_publish_truth"] is False
    assert supported_route["stage7_record"]["may_update_stage1"] is False
    assert supported_route["stage7_record"]["may_update_stage4"] is False

    weak_claim_resp = client.post(
        "/newsrooms/claims",
        json={
            "article_id": article_id,
            "claim_text": "Rumors say the project cost is secretly doubled.",
            "claimant_id": "editor_1",
            "public_impact": 0.4,
            "editorial_risk": 0.5,
            "contradiction_pressure": 0.8,
            "source_reach": 0.4,
            "evidence_conflict": 0.8,
            "freshness_need": 0.6,
            "debate_potential": 0.8,
            "user_report_volume": 0.2,
        },
    )
    assert weak_claim_resp.status_code == 200
    weak_claim_id = weak_claim_resp.json()["claim_id"]

    weak_route_resp = client.post(f"/newsrooms/claims/{weak_claim_id}/route-stage7")
    assert weak_route_resp.status_code == 200
    weak_route = weak_route_resp.json()
    assert weak_route["stage7_record"]["tank"] == "stage7_b_unapproved_disputed_unknown_tank"
    assert weak_route["route"]["candidate_only"] is True

    query_tank = client.get("/query-tank")
    assert query_tank.status_code == 200
    assert any(row["category"] == "stage7_candidate_memory" for row in query_tank.json())

    high_risk_claim_resp = client.post(
        "/newsrooms/claims",
        json={
            "article_id": article_id,
            "claim_text": "A bank committed financial fraud during the project financing.",
            "claimant_id": "editor_1",
            "public_impact": 1.0,
            "editorial_risk": 1.0,
            "contradiction_pressure": 1.0,
            "source_reach": 1.0,
            "evidence_conflict": 1.0,
            "freshness_need": 1.0,
            "debate_potential": 1.0,
            "user_report_volume": 1.0,
        },
    )
    assert high_risk_claim_resp.status_code == 200
    high_risk_claim_id = high_risk_claim_resp.json()["claim_id"]

    packet_resp = client.post(f"/newsrooms/claims/{high_risk_claim_id}/submit-stage6")
    assert packet_resp.status_code == 200
    packet = packet_resp.json()
    assert packet["route"] == "stage_6_hard_mesh"
    assert packet["stage6_required"] is True
    assert packet["candidate_answer_not_verified"] is True
    assert packet["may_publish_truth"] is False
    assert packet["may_update_stage1"] is False
    assert packet["may_update_stage4"] is False

    package_resp = client.post(
        "/newsrooms/packages",
        json={
            "article_id": article_id,
            "claim_ids": [claim_id, weak_claim_id, high_risk_claim_id],
            "modality": "text_article",
            "editor_id": "editor_1",
            "title": "Flood barrier verification package",
            "canonical_url": "https://example.local/news/flood-barrier",
            "hreflang_cluster": ["en-US"],
        },
    )
    assert package_resp.status_code == 200
    package = package_resp.json()
    package_id = package["package_id"]
    assert package["candidate_only"] is True
    assert package["may_publish_truth"] is False
    assert "NewsArticle" in package["structured_data_types"]

    packages = client.get("/newsrooms/packages")
    assert packages.status_code == 200
    assert any(row["package_id"] == package_id for row in packages.json())

    package_detail = client.get(f"/newsrooms/packages/{package_id}")
    assert package_detail.status_code == 200
    assert package_detail.json()["package"]["package_id"] == package_id

    script_resp = client.post(
        f"/newsrooms/packages/{package_id}/script",
        json={"modality": "anchor_script", "anchor_name": "Android Anchor", "duration_seconds": 90},
    )
    assert script_resp.status_code == 200
    script = script_resp.json()["script"]
    assert script["preview_only_studio_cues"] is True
    assert script["hardware_execution"] is False
    assert script["publishing_command"] is False
    assert "final truth" in script["anchor_script"].lower()

    handoff_resp = client.post(f"/newsrooms/packages/{package_id}/news-to-debate")
    assert handoff_resp.status_code == 200
    handoff = handoff_resp.json()
    assert handoff["candidate_only"] is True
    assert handoff["may_publish_truth"] is False
    assert handoff["may_update_stage1"] is False
    assert handoff["may_update_stage4"] is False
    assert handoff["target_council"] == "podcast_forum_debates"

    correction_resp = client.post(
        "/newsrooms/corrections",
        json={
            "article_id": article_id,
            "claim_id": weak_claim_id,
            "correction_text": "The cost increase remains unverified and requires Stage 6-aware review.",
            "requested_by": "editor_1",
        },
    )
    assert correction_resp.status_code == 200
    correction = correction_resp.json()
    assert correction["candidate_only"] is True
    assert correction["may_publish_truth"] is False

    risk_alerts = client.get("/newsrooms/risk-alerts")
    assert risk_alerts.status_code == 200
    assert any(alert["severity"] in {"high", "critical"} for alert in risk_alerts.json())
    assert all(alert["stage6_required"] is True for alert in risk_alerts.json())

    audit_logs = client.get("/newsrooms/audit-logs")
    assert audit_logs.status_code == 200
    actions = {row["action"] for row in audit_logs.json()}
    assert "source_registered" in actions
    assert "claim_routed_stage7" in actions
    assert "claim_submitted_stage6" in actions
    assert "news_to_debate_handoff_created" in actions

    cards = client.get("/dashboard/newsrooms/cards")
    assert cards.status_code == 200
    card_ids = {card["card_id"] for card in cards.json()}
    assert {"newsroom_sources", "newsroom_stage7_routes", "newsroom_stage6_packets"} <= card_ids

    pages = client.get("/dashboard/newsrooms/pages")
    assert pages.status_code == 200
    safety = pages.json()[0]["safety_boundaries"]
    assert safety["stage6_no_bypass"] is True
    assert safety["stage7_candidate_only"] is True
    assert safety["newsrooms_council_may_publish_truth"] is False
    assert safety["newsrooms_council_may_update_stage1"] is False
    assert safety["newsrooms_council_may_update_stage4"] is False

    dashboard_alerts = client.get("/dashboard/newsrooms/risk-alerts")
    assert dashboard_alerts.status_code == 200
    assert dashboard_alerts.json() == risk_alerts.json()

    dashboard_audit = client.get("/dashboard/newsrooms/audit-logs")
    assert dashboard_audit.status_code == 200
    assert dashboard_audit.json() == audit_logs.json()

    boundaries = client.get("/dashboard/newsrooms/safety-boundaries")
    assert boundaries.status_code == 200
    boundary_data = boundaries.json()
    assert boundary_data["no_external_provider_calls"] is True
    assert boundary_data["no_production_db"] is True
    assert boundary_data["no_real_payments"] is True
    assert boundary_data["newsworthiness_is_truth_score"] is False
