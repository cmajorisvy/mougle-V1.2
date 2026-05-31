import os
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["TRUTH_PYRAMID_DB_PATH"] = str(Path("/tmp") / f"newsrooms_text_seo_{os.getpid()}.db")

import app.api as app_api
from app.engine import VerificationEngine


client = TestClient(app_api.app)


def _create_newsroom_article(tmp_path):
    db_path = tmp_path / "newsrooms_text_seo.sqlite"
    os.environ["TRUTH_PYRAMID_DB_PATH"] = str(db_path)
    app_api.engine = VerificationEngine(db_path=str(db_path))

    source = client.post(
        "/newsrooms/sources",
        json={
            "name": "Mougle Civic Wire",
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

    source_paragraph = (
        "City engineers presented a water resilience plan on Monday. "
        "The plan adds three pumping stations and upgrades two canals. "
        "Council members requested an independent cost review before construction."
    )
    raw = client.post(
        "/newsrooms/articles",
        json={
            "source_id": source_id,
            "title": "Water resilience plan moves into review",
            "body": source_paragraph,
            "author": "Civic Desk",
            "topic_tags": ["local", "water", "infrastructure"],
        },
    )
    assert raw.status_code == 200
    raw_id = raw.json()["raw_item_id"]

    article = client.post(f"/newsrooms/articles/{raw_id}/normalize")
    assert article.status_code == 200
    article_id = article.json()["article_id"]

    claims = client.post(f"/newsrooms/articles/{article_id}/extract-claims")
    assert claims.status_code == 200
    claim_ids = [claim["claim_id"] for claim in claims.json()["claims"]]
    assert claim_ids

    evidence = client.post(
        f"/newsrooms/claims/{claim_ids[0]}/evidence",
        json={
            "source_id": "minutes_2026",
            "source_name": "Council Minutes",
            "text": "Council minutes list the water resilience review and the requested cost review.",
            "submitted_by": "seo_editor",
            "reliability": 0.91,
        },
    )
    assert evidence.status_code == 200

    package = client.post(
        "/newsrooms/packages",
        json={
            "article_id": article_id,
            "claim_ids": claim_ids,
            "modality": "reported_news_article",
            "editor_id": "seo_editor",
            "title": "Water resilience claim-graph brief",
        },
    )
    assert package.status_code == 200
    return db_path, article_id, package.json()["package_id"], source_paragraph


def test_newsrooms_text_blog_seo_structured_data_and_originality(tmp_path):
    db_path, article_id, package_id, source_paragraph = _create_newsroom_article(tmp_path)
    assert str(app_api.engine.store.path) == str(db_path)

    root = client.post("/newsrooms/categories", json={"name": "News", "locale": "en"})
    assert root.status_code == 200
    root_category = root.json()
    child = client.post(
        "/newsrooms/categories",
        json={"name": "Local", "locale": "en", "parent_category_id": root_category["category_id"]},
    )
    assert child.status_code == 200
    child_category = child.json()
    grandchild = client.post(
        "/newsrooms/categories",
        json={"name": "Infrastructure", "locale": "en", "parent_category_id": child_category["category_id"]},
    )
    assert grandchild.status_code == 200
    grandchild_category = grandchild.json()
    assert child_category["parent_category_id"] == root_category["category_id"]
    assert grandchild_category["parent_category_id"] == child_category["category_id"]
    assert grandchild_category["depth"] == 3
    assert grandchild_category["public_url"] == "/en/news/local/infrastructure/"

    categories = client.get("/newsrooms/categories")
    assert categories.status_code == 200
    assert len(categories.json()) >= 3

    seo = client.post(
        f"/newsrooms/articles/{article_id}/seo-artifact",
        json={
            "output_type": "reported_news_article",
            "locale": "en",
            "section": "news",
            "subsection": "local",
            "hreflang_variants": {
                "en": "/en/news/local/water-resilience-plan-moves-into-review/",
                "en-gb": "/en-gb/news/local/water-resilience-plan-moves-into-review/",
            },
            "image": "https://mougle.local/images/water-plan.png",
        },
    )
    assert seo.status_code == 200
    seo_data = seo.json()
    artifact = seo_data["seo_artifact"]
    assert artifact["output_type"] == "reported_news_article"
    assert artifact["public_url"].startswith("/en/news/local/")
    assert artifact["public_url"].endswith("/")
    assert artifact["generated_from_claim_graph"] is True
    assert artifact["copies_source_article_prose"] is False
    assert artifact["no_sfx"] is True
    assert artifact["no_studio_cues"] is True
    assert source_paragraph not in artifact["body_text"]
    lowered_body = artifact["body_text"].lower()
    assert "sfx" not in lowered_body
    assert "lower-third" not in lowered_body
    assert "ticker" not in lowered_body
    assert "shot plan" not in lowered_body

    article_jsonld = [
        item for item in seo_data["structured_data"] if item["structured_data_type"] == "NewsArticle"
    ][0]["jsonld"]
    assert article_jsonld["@type"] == "NewsArticle"
    for key in [
        "headline",
        "image",
        "datePublished",
        "dateModified",
        "author",
        "publisher",
        "articleSection",
        "keywords",
        "url",
        "inLanguage",
        "backstory",
        "provenance",
    ]:
        assert key in article_jsonld

    hreflang_variants = seo_data["hreflang_variants"]
    assert len(hreflang_variants) == 2
    for variant in hreflang_variants:
        assert variant["self_referencing"] is True
        assert variant["bidirectional_targets"]
        for target in variant["bidirectional_targets"]:
            assert any(other["url"] == target for other in hreflang_variants)

    sitemap = seo_data["sitemap_entry"]
    assert sitemap["is_news"] is True
    assert sitemap["url"] == artifact["canonical_url"]

    fetched = client.get(f"/newsrooms/articles/{article_id}/seo-artifact")
    assert fetched.status_code == 200
    assert fetched.json()["seo_artifact"]["artifact_id"] == artifact["artifact_id"]

    similar = client.post(
        f"/newsrooms/articles/{article_id}/originality-check",
        json={"generated_text": source_paragraph, "threshold": 0.72},
    )
    assert similar.status_code == 200
    similar_report = similar.json()
    assert similar_report["blocked"] is True
    assert similar_report["route_for_rewrite"] is True
    assert similar_report["originality_score"] < 0.72

    text_output = client.post(
        f"/newsrooms/packages/{package_id}/text-article",
        json={"locale": "en", "section": "news", "subsection": "local"},
    )
    assert text_output.status_code == 200
    assert text_output.json()["structured_data"][0]["jsonld"]["@type"] == "NewsArticle"

    live_output = client.post(
        f"/newsrooms/packages/{package_id}/live-blog-update",
        json={"locale": "en", "topic": "water-resilience"},
    )
    assert live_output.status_code == 200
    live_artifact = live_output.json()["seo_artifact"]
    assert live_artifact["public_url"].startswith("/en/live/")
    assert live_output.json()["structured_data"][0]["jsonld"]["@type"] == "LiveBlogPosting"

    blog_output = client.post(
        f"/newsrooms/packages/{package_id}/blog-post",
        json={"locale": "en", "topic": "infrastructure"},
    )
    assert blog_output.status_code == 200
    blog_artifact = blog_output.json()["seo_artifact"]
    assert blog_artifact["public_url"].startswith("/en/blog/infrastructure/")
    assert blog_output.json()["structured_data"][0]["jsonld"]["@type"] == "BlogPosting"

    old_raw = client.post(
        "/newsrooms/articles",
        json={
            "source_id": client.get("/newsrooms/sources").json()[0]["source_id"],
            "title": "Older archive item",
            "body": "The archive item records an older civic update. It remains useful as context.",
            "published_at": "2020-01-01T00:00:00",
            "topic_tags": ["archive"],
        },
    )
    assert old_raw.status_code == 200
    old_article = client.post(f"/newsrooms/articles/{old_raw.json()['raw_item_id']}/normalize")
    assert old_article.status_code == 200
    old_article_id = old_article.json()["article_id"]
    client.post(f"/newsrooms/articles/{old_article_id}/extract-claims")
    old_seo = client.post(
        f"/newsrooms/articles/{old_article_id}/seo-artifact",
        json={"output_type": "reported_news_article", "locale": "en", "section": "news"},
    )
    assert old_seo.status_code == 200
    assert old_seo.json()["sitemap_entry"]["is_news"] is False

    seo_dashboard = client.get("/dashboard/newsrooms/seo")
    assert seo_dashboard.status_code == 200
    assert seo_dashboard.json()["no_real_publishing"] is True
    assert seo_dashboard.json()["external_calls_made"] is False

    originality_dashboard = client.get("/dashboard/newsrooms/originality")
    assert originality_dashboard.status_code == 200
    assert originality_dashboard.json()["blocked_outputs"] >= 1
    assert originality_dashboard.json()["no_external_calls"] is True
