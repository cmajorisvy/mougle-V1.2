import os
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["TRUTH_PYRAMID_DB_PATH"] = str(Path("/tmp") / f"newsroom_studio_video_{os.getpid()}.db")

import app.api as app_api
from app.engine import VerificationEngine


client = TestClient(app_api.app)


def _create_video_package(tmp_path):
    db_path = tmp_path / "newsroom_studio_video.sqlite"
    os.environ["TRUTH_PYRAMID_DB_PATH"] = str(db_path)
    app_api.engine = VerificationEngine(db_path=str(db_path))

    source = client.post(
        "/newsrooms/sources",
        json={
            "name": "Mougle Studio Wire",
            "source_type": "local",
            "historical_accuracy": 0.9,
            "correction_responsiveness": 0.9,
            "provenance_completeness": 0.9,
            "citation_quality": 0.86,
            "domain_authority": 0.8,
            "author_traceability": 0.84,
            "freshness_consistency": 0.82,
            "cross_source_agreement": 0.8,
        },
    )
    assert source.status_code == 200
    source_id = source.json()["source_id"]

    raw = client.post(
        "/newsrooms/articles",
        json={
            "source_id": source_id,
            "title": "River safety drill expands across schools",
            "body": (
                "District officials scheduled a river safety drill for three schools. "
                "Emergency managers said the drill will test evacuation timing and family alerts. "
                "The final budget remains under independent review."
            ),
            "author": "Studio Desk",
            "topic_tags": ["local", "safety", "schools"],
        },
    )
    assert raw.status_code == 200

    article = client.post(f"/newsrooms/articles/{raw.json()['raw_item_id']}/normalize")
    assert article.status_code == 200
    article_id = article.json()["article_id"]

    claims = client.post(f"/newsrooms/articles/{article_id}/extract-claims")
    assert claims.status_code == 200
    claim_ids = [claim["claim_id"] for claim in claims.json()["claims"]]
    assert claim_ids

    evidence = client.post(
        f"/newsrooms/claims/{claim_ids[0]}/evidence",
        json={
            "source_id": "school_safety_minutes",
            "source_name": "School Safety Minutes",
            "text": "The minutes list the planned river safety drill and family alert test.",
            "submitted_by": "studio_editor",
            "reliability": 0.91,
        },
    )
    assert evidence.status_code == 200

    package = client.post(
        "/newsrooms/packages",
        json={
            "article_id": article_id,
            "claim_ids": claim_ids,
            "modality": "video_plan",
            "editor_id": "studio_editor",
            "title": "River safety drill studio package",
        },
    )
    assert package.status_code == 200
    package_data = package.json()
    assert package_data["status"] == "candidate"
    return db_path, article_id, package_data["package_id"]


def test_newsroom_studio_video_compatibility_layer(tmp_path):
    db_path, article_id, package_id = _create_video_package(tmp_path)
    assert str(app_api.engine.store.path) == str(db_path)

    text_output = client.post(
        f"/newsrooms/packages/{package_id}/text-article",
        json={"locale": "en", "section": "news", "subsection": "local"},
    )
    assert text_output.status_code == 200
    text_variant = text_output.json()["seo_artifact"]["body_text"]

    bulletin_resp = client.post(
        f"/newsrooms/packages/{package_id}/video-bulletin",
        json={
            "title": "River safety drill video briefing",
            "video_format": "standard_16x9",
            "locale": "en",
            "section": "news",
            "target_duration_seconds": 75,
            "story_structure": "hourglass",
            "visual_disclosure": "ai_reconstruction",
            "synthetic_visual_used": True,
            "topic_tags": ["local", "safety"],
        },
    )
    assert bulletin_resp.status_code == 200
    bulletin = bulletin_resp.json()
    bulletin_id = bulletin["bulletin_id"]
    assert bulletin["package_id"] == package_id
    assert bulletin["candidate_only"] is True
    assert bulletin["may_publish_truth"] is False
    assert bulletin["may_update_stage1"] is False
    assert bulletin["may_update_stage4"] is False
    assert bulletin["no_hardware_execution"] is True
    assert bulletin["no_platform_publish"] is True
    assert bulletin["external_calls_made"] is False
    assert bulletin["metadata"]["no_real_video_generation"] is True

    bulletins = client.get("/newsrooms/video-bulletins")
    assert bulletins.status_code == 200
    assert any(row["bulletin_id"] == bulletin_id for row in bulletins.json())

    script_resp = client.post(f"/newsrooms/video-bulletins/{bulletin_id}/anchor-script")
    assert script_resp.status_code == 200
    script_data = script_resp.json()
    script = script_data["anchor_script"]
    assert script["script_text"] != text_variant
    assert script["short_spoken_sentences"] is True
    assert script["distinct_from_text_article"] is True
    assert script["no_direct_read_aloud_duplicate"] is True
    assert script["may_publish_truth"] is False
    assert script["may_update_stage1"] is False
    assert script["may_update_stage4"] is False
    assert all(line["word_count"] <= 14 for line in script_data["lines"])

    studio_resp = client.post(f"/newsrooms/video-bulletins/{bulletin_id}/studio-cues")
    assert studio_resp.status_code == 200
    studio = studio_resp.json()
    target_rows = [
        *studio["robot_explainer_cues"],
        *studio["scene_cues"],
        *studio["screen_states"],
        *studio["lower_thirds"],
        *studio["ticker_items"],
    ]
    assert target_rows
    assert all(row["target"].startswith("MGL_") for row in target_rows)
    assert all(row.get("hardware_execution_command") is not True for row in target_rows)
    assert all(row.get("platform_publish_command") is not True for row in target_rows)
    assert studio["asset_requirements"][0]["ai_reconstruction_label_required"] is True
    assert studio["ai_reconstruction_labels"]
    assert studio["ai_reconstruction_labels"][0]["required"] is True
    assert studio["ai_reconstruction_labels"][0]["present"] is True

    unsafe_sfx = client.post(
        f"/newsrooms/video-bulletins/{bulletin_id}/sfx-plan",
        json={"cue_types": ["market_energy"], "story_categories": ["disaster"]},
    )
    assert unsafe_sfx.status_code == 400

    safe_sfx = client.post(
        f"/newsrooms/video-bulletins/{bulletin_id}/sfx-plan",
        json={"cue_types": ["respectful_silence"], "story_categories": ["disaster"]},
    )
    assert safe_sfx.status_code == 200
    assert safe_sfx.json()["sfx_cues"][0]["cue_type"] == "respectful_silence"
    assert safe_sfx.json()["sfx_cues"][0]["approved"] is True

    rights_resp = client.post(f"/newsrooms/video-bulletins/{bulletin_id}/rights-check")
    assert rights_resp.status_code == 200
    rights = rights_resp.json()
    assert rights["passed"] is True
    assert rights["ai_reconstruction_label_pass"] is True
    assert rights["sfx_policy_pass"] is True
    assert rights["no_hardware_execution_pass"] is True
    assert rights["no_platform_publish_pass"] is True
    assert 0.0 <= rights["studio_cue_safety"] <= 1.0

    seo_resp = client.post(f"/newsrooms/video-bulletins/{bulletin_id}/video-seo")
    assert seo_resp.status_code == 200
    seo = seo_resp.json()
    assert seo["video_seo_artifact"]["video_object_jsonld"]["@type"] == "VideoObject"
    assert seo["video_seo_artifact"]["video_object_jsonld"]["digitalSourceType"].endswith("syntheticMedia")
    assert seo["video_seo_artifact"]["no_platform_publish"] is True
    assert seo["video_seo_artifact"]["no_external_calls"] is True
    assert seo["video_sitemap_entry"]["watch_url"].startswith("/en/video/news/")
    assert seo["video_sitemap_entry"]["platform_submission"] is False

    divergence_resp = client.post(
        f"/newsrooms/video-bulletins/{bulletin_id}/modality-divergence",
        json={"text_variant": text_variant},
    )
    assert divergence_resp.status_code == 200
    divergence = divergence_resp.json()
    assert 0.0 <= divergence["modality_divergence"] <= 1.0
    assert 0.0 <= divergence["similarity"] <= 1.0
    assert divergence["video_script_ref"] == script["script_id"]

    detail = client.get(f"/newsrooms/video-bulletins/{bulletin_id}")
    assert detail.status_code == 200
    detail_data = detail.json()
    assert detail_data["bulletin"]["bulletin_id"] == bulletin_id
    assert detail_data["video_seo_artifacts"]
    assert detail_data["video_sitemap_entries"]
    assert detail_data["modality_divergence_reports"]

    studio_dashboard = client.get("/dashboard/newsrooms/studio-cues")
    assert studio_dashboard.status_code == 200
    assert studio_dashboard.json()["controlled_mgl_targets_only"] is True
    assert studio_dashboard.json()["no_hardware_execution"] is True
    assert studio_dashboard.json()["no_platform_publish"] is True

    bulletin_dashboard = client.get("/dashboard/newsrooms/video-bulletins")
    assert bulletin_dashboard.status_code == 200
    assert bulletin_dashboard.json()["video_bulletins"] >= 1
    assert bulletin_dashboard.json()["no_real_video_generation"] is True
    assert bulletin_dashboard.json()["no_platform_publish"] is True

    safety_dashboard = client.get("/dashboard/newsrooms/video-safety")
    assert safety_dashboard.status_code == 200
    assert safety_dashboard.json()["bounded_divergence"] is True
    assert safety_dashboard.json()["studio_output_may_publish_truth"] is False
    assert safety_dashboard.json()["studio_output_may_update_stage1"] is False
    assert safety_dashboard.json()["studio_output_may_update_stage4"] is False

    safety_boundaries = client.get("/dashboard/newsrooms/safety-boundaries")
    assert safety_boundaries.status_code == 200
    boundary_data = safety_boundaries.json()
    assert boundary_data["stage6_no_bypass"] is True
    assert boundary_data["stage7_candidate_only"] is True
    assert boundary_data["newsrooms_council_may_publish_truth"] is False
    assert boundary_data["newsrooms_council_may_update_stage1"] is False
    assert boundary_data["newsrooms_council_may_update_stage4"] is False
    assert boundary_data["no_production_db"] is True
    assert boundary_data["no_external_provider_calls"] is True

    assert article_id
