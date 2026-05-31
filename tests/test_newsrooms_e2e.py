import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["TRUTH_PYRAMID_DB_PATH"] = str(
    Path(tempfile.gettempdir()) / f"newsrooms_full_e2e_{os.getpid()}.sqlite"
)

import app.api as app_api
from app.engine import VerificationEngine
from scripts.discover_routes import build_route_matrix, write_route_artifacts


client = TestClient(app_api.app)


def test_newsrooms_council_dashboard_and_full_e2e_wiring(tmp_path):
    db_path = tmp_path / "newsrooms_full_e2e.sqlite"
    os.environ["TRUTH_PYRAMID_DB_PATH"] = str(db_path)
    app_api.engine = VerificationEngine(db_path=str(db_path))
    assert str(app_api.engine.store.path) == str(db_path)

    source_resp = client.post(
        "/newsrooms/sources",
        json={
            "name": "Mougle Verification Desk",
            "source_type": "local",
            "url_or_path": "local-news://verification-desk",
            "owner": "Mougle",
            "topic_tags": ["civic", "safety", "schools"],
            "historical_accuracy": 0.92,
            "correction_responsiveness": 0.9,
            "provenance_completeness": 0.88,
            "citation_quality": 0.86,
            "domain_authority": 0.8,
            "author_traceability": 0.82,
            "freshness_consistency": 0.84,
            "cross_source_agreement": 0.78,
        },
    )
    assert source_resp.status_code == 200
    source = source_resp.json()
    assert source["external_calls_made"] is False
    assert source["source_reliability_is_truth_score"] is False
    source_id = source["source_id"]

    feed_resp = client.post(
        "/newsrooms/feeds",
        json={
            "source_id": source_id,
            "name": "Verification Desk Safety Feed",
            "feed_url": "local-feed://verification/safety",
            "topic_tags": ["safety", "schools"],
        },
    )
    assert feed_resp.status_code == 200
    feed_id = feed_resp.json()["feed_id"]

    ingest_resp = client.post(
        f"/newsrooms/feeds/{feed_id}/ingest",
        json={
            "title": "School bridge inspection enters final review",
            "body": (
                "District engineers inspected a pedestrian bridge near two schools on Tuesday. "
                "Officials said temporary barriers will remain until the final safety review ends. "
                "The repair estimate is still being checked by an independent auditor."
            ),
            "author": "Verification Desk",
            "url_or_path": "local-news://school-bridge-review",
            "topic_tags": ["civic", "safety", "schools"],
            "metadata": {"children_safety_risk": 0.8},
        },
    )
    assert ingest_resp.status_code == 200
    assert ingest_resp.json()["ingest_event"]["external_calls_made"] is False
    raw_item_id = ingest_resp.json()["raw_item"]["raw_item_id"]

    normalize_resp = client.post(f"/newsrooms/articles/{raw_item_id}/normalize")
    assert normalize_resp.status_code == 200
    article = normalize_resp.json()
    article_id = article["article_id"]
    assert article["may_publish_truth"] is False
    assert article["may_update_stage1"] is False
    assert article["may_update_stage4"] is False

    claims_resp = client.post(f"/newsrooms/articles/{article_id}/extract-claims")
    assert claims_resp.status_code == 200
    claims_payload = claims_resp.json()
    score_bundle = claims_payload["score_bundle"]
    for key in ["source_reliability", "newsworthiness", "editorial_risk"]:
        assert 0.0 <= score_bundle[key] <= 1.0
    assert score_bundle["source_reliability_is_truth_score"] is False
    assert score_bundle["newsworthiness_is_truth_score"] is False
    claim_id = claims_payload["claims"][0]["claim_id"]

    evidence_resp = client.post(
        f"/newsrooms/claims/{claim_id}/evidence",
        json={
            "source_id": "inspection_minutes",
            "source_name": "School Safety Inspection Minutes",
            "text": "The inspection minutes record the bridge review and temporary barriers.",
            "submitted_by": "newsrooms_e2e_editor",
            "url_or_path": "local-evidence://inspection-minutes",
            "reliability": 0.93,
            "no_fabricated_evidence_attestation": True,
        },
    )
    assert evidence_resp.status_code == 200
    assert evidence_resp.json()["no_fabricated_evidence_attestation"] is True
    assert evidence_resp.json()["external_calls_made"] is False

    route_resp = client.post(f"/newsrooms/claims/{claim_id}/route-stage7")
    assert route_resp.status_code == 200
    route = route_resp.json()["route"]
    assert route["candidate_only"] is True
    assert route["may_publish_truth"] is False
    assert route["may_update_stage1"] is False
    assert route["may_update_stage4"] is False
    assert route["stage6_required"] is True

    stage6_resp = client.post(f"/newsrooms/claims/{claim_id}/submit-stage6")
    assert stage6_resp.status_code == 200
    packet = stage6_resp.json()
    assert packet["stage6_required"] is True
    assert packet["candidate_answer_not_verified"] is True
    assert packet["may_publish_truth"] is False
    assert packet["may_update_stage1"] is False
    assert packet["may_update_stage4"] is False

    package_resp = client.post(
        "/newsrooms/packages",
        json={
            "article_id": article_id,
            "claim_ids": [claim_id],
            "modality": "video_plan",
            "editor_id": "newsrooms_e2e_editor",
            "title": "School bridge inspection newsroom package",
        },
    )
    assert package_resp.status_code == 200
    package = package_resp.json()
    package_id = package["package_id"]
    assert package["candidate_only"] is True
    assert package["stage6_required_for_truth"] is True
    assert package["may_publish_truth"] is False

    text_resp = client.post(
        f"/newsrooms/packages/{package_id}/text-article",
        json={"locale": "en", "section": "news", "subsection": "safety"},
    )
    assert text_resp.status_code == 200
    text_data = text_resp.json()
    assert text_data["structured_data"][0]["jsonld"]["@type"] == "NewsArticle"
    assert text_data["seo_artifact"]["generated_from_claim_graph"] is True
    assert text_data["seo_artifact"]["copies_source_article_prose"] is False

    live_resp = client.post(
        f"/newsrooms/packages/{package_id}/live-blog-update",
        json={"locale": "en", "topic": "school-bridge-review"},
    )
    assert live_resp.status_code == 200
    assert live_resp.json()["structured_data"][0]["jsonld"]["@type"] == "LiveBlogPosting"

    bulletin_resp = client.post(
        f"/newsrooms/packages/{package_id}/video-bulletin",
        json={
            "title": "School bridge inspection video briefing",
            "video_format": "standard_16x9",
            "locale": "en",
            "section": "news",
            "target_duration_seconds": 90,
            "visual_disclosure": "ai_reconstruction",
            "synthetic_visual_used": True,
        },
    )
    assert bulletin_resp.status_code == 200
    bulletin = bulletin_resp.json()
    bulletin_id = bulletin["bulletin_id"]
    assert bulletin["no_hardware_execution"] is True
    assert bulletin["no_platform_publish"] is True
    assert bulletin["may_publish_truth"] is False

    studio_resp = client.post(f"/newsrooms/video-bulletins/{bulletin_id}/studio-cues")
    assert studio_resp.status_code == 200
    studio = studio_resp.json()
    assert studio["ai_reconstruction_labels"][0]["required"] is True
    assert all(row["target"].startswith("MGL_") for row in studio["scene_cues"])
    assert all(row["hardware_execution_command"] is False for row in studio["scene_cues"])

    handoff_resp = client.post(f"/newsrooms/packages/{package_id}/news-to-debate")
    assert handoff_resp.status_code == 200
    handoff = handoff_resp.json()
    assert handoff["candidate_only"] is True
    assert handoff["may_publish_truth"] is False
    assert handoff["may_update_stage1"] is False
    assert handoff["may_update_stage4"] is False

    correction_resp = client.post(
        "/newsrooms/corrections",
        json={
            "article_id": article_id,
            "claim_id": claim_id,
            "correction_text": "The repair estimate remains under independent review.",
            "requested_by": "newsrooms_e2e_editor",
        },
    )
    assert correction_resp.status_code == 200
    assert correction_resp.json()["candidate_only"] is True

    page_resp = client.get("/newsrooms")
    assert page_resp.status_code == 200
    page = page_resp.json()
    tab_titles = {tab["title"] for tab in page["tabs"]}
    assert {
        "Sources",
        "Feeds",
        "Articles",
        "Claims",
        "Text Blogs",
        "Live Updates",
        "SEO Artifacts",
        "Stage 7 Candidates",
        "Stage 6 Packets",
        "Video Bulletins",
        "Studio Cues",
        "Corrections",
        "Risk Alerts",
        "Audit Trail",
        "Safety Boundaries",
    } <= tab_titles
    card_titles = {card["title"] for card in page["cards"]}
    assert {
        "Registered Sources",
        "Active Feeds",
        "Articles Ingested",
        "Claims Extracted",
        "Text Articles",
        "Live Updates",
        "SEO Ready",
        "Stage 7 Candidates",
        "Stage 6 Packets",
        "Video Bulletins",
        "AI Reconstruction Labels Required",
        "Risk Alerts",
        "Corrections",
    } <= card_titles
    invariants = page["safety_invariants"]
    assert len(invariants) == 14
    si14 = [item for item in invariants if item["id"] == "si-14"][0]
    assert si14["title"] == "Newsrooms Council is not truth authority"
    assert si14["enforced"] is True
    assert "may not publish final truth" in si14["definition"]

    dashboard_paths = [
        "/dashboard/newsrooms/cards",
        "/dashboard/newsrooms/pages",
        "/dashboard/newsrooms/risk-alerts",
        "/dashboard/newsrooms/audit-logs",
        "/dashboard/newsrooms/safety-boundaries",
        "/dashboard/newsrooms/seo",
        "/dashboard/newsrooms/originality",
        "/dashboard/newsrooms/studio-cues",
        "/dashboard/newsrooms/video-bulletins",
        "/dashboard/newsrooms/video-safety",
        "/dashboard/safety-invariants",
        "/api/dashboard/safety-invariants",
    ]
    for path in dashboard_paths:
        resp = client.get(path)
        assert resp.status_code == 200, path

    safety = client.get("/dashboard/newsrooms/safety-boundaries").json()
    assert safety["stage6_no_bypass"] is True
    assert safety["stage7_candidate_only"] is True
    assert safety["newsrooms_council_is_not_truth_authority"] is True
    assert safety["newsrooms_council_may_publish_truth"] is False
    assert safety["newsrooms_council_may_update_stage1"] is False
    assert safety["newsrooms_council_may_update_stage4"] is False
    assert safety["no_external_provider_calls"] is True
    assert safety["no_production_db"] is True
    assert safety["invariant_count"] == 14
    assert safety["all_enforced"] is True

    safety_invariants = client.get("/dashboard/safety-invariants").json()
    assert safety_invariants["invariant_count"] == 14
    assert safety_invariants["all_enforced"] is True

    assert str(app_api.engine.store.path) == str(db_path)
    assert client.get("/archive/runtime-imports/check").json()["passed"] is True

    write_route_artifacts()
    missing = [row for row in build_route_matrix() if row.criticality in {"P0", "P1"} and row.status != "tested"]
    assert missing == []
