"""
Smoke test for the first three real worker handlers.

Run from the repo root:
    python python-workers/tests/smoke_test_handlers.py

This invokes the handlers directly (no HTTP, no router, no consumer) with
realistic sample payloads and verifies:

  * claim extraction returns at least one claim
  * clustering returns at least one cluster
  * newsroom package returns a structured package
  * every result is JSON-serializable

Exit code 0 = pass, 1 = fail. Designed to be safe to run repeatedly with no
side effects.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

# Make `shared.*` etc. importable when run from the repo root.
HERE = os.path.dirname(os.path.abspath(__file__))
WORKERS_ROOT = os.path.dirname(HERE)
if WORKERS_ROOT not in sys.path:
    sys.path.insert(0, WORKERS_ROOT)

from agents.inhouse_agents.newsroom_agent import run as newsroom_run  # noqa: E402
from agents.user_agents.user_claim_extraction_agent import run as claim_run  # noqa: E402
from shared.contracts import JobEnvelope, JobOrigin, JobProvenance  # noqa: E402
from vector.clustering_worker import run as clustering_run  # noqa: E402


def _envelope(job_type: str, origin: JobOrigin, payload: dict) -> JobEnvelope:
    return JobEnvelope(
        job_id=f"smoke-{job_type}",
        job_type=job_type,
        provenance=JobProvenance(
            origin=origin,
            requested_by_user_id="u_test" if origin == JobOrigin.USER else None,
            requested_by_admin_id="a_test" if origin == JobOrigin.INHOUSE else None,
            request_id="req-smoke",
            enqueued_at=datetime.now(timezone.utc),
        ),
        payload=payload,
    )


def _assert_json_serializable(label: str, obj) -> None:
    try:
        json.dumps(obj, default=str)
    except (TypeError, ValueError) as exc:
        raise AssertionError(f"{label} is not JSON-serializable: {exc}") from exc


async def _run_claim_extraction() -> None:
    sample = (
        "Apple Inc. reported quarterly revenue of $94.9 billion on November 2, 2023. "
        "Hi everyone! "
        "The company shipped 12 million iPhones in the quarter, more than analysts expected. "
        "I think the stock will go up. "
        "CEO Tim Cook said, \"We are very pleased with the results.\" "
        "Higher interest rates caused some softness in the smartphone market this year."
    )
    env = _envelope(
        "user.claim_extraction",
        JobOrigin.USER,
        {
            "articles": [{"id": "art-1", "text": sample, "title": "Apple Q4"}],
            "max_claims_per_article": 8,
        },
    )
    res = await claim_run(env)
    assert res.status.value == "succeeded", res
    claims = res.result["claims"]
    assert len(claims) >= 1, f"expected at least 1 claim, got {claims}"
    types = {c["claim_type"] for c in claims}
    # We should detect at least one of the richer types from the sample.
    assert types & {"statistical", "quote", "causal", "comparative", "temporal", "entity_attribute"}, types
    _assert_json_serializable("claim extraction result", res.model_dump())
    print(f"  ✓ claim_extraction → {len(claims)} claim(s), types={sorted(types)}")


async def _run_clustering() -> None:
    docs = [
        {"id": "d1", "text": "Apple released a new iPhone with a faster processor and improved camera."},
        {"id": "d2", "text": "The new iPhone from Apple has a better camera and a faster chip."},
        {"id": "d3", "text": "Tesla unveiled an updated Model 3 with longer battery range."},
        {"id": "d4", "text": "Tesla's refreshed Model 3 promises more range and a redesigned interior."},
        {"id": "d5", "text": "Cooking pasta requires boiling water with a pinch of salt."},
    ]
    env = _envelope(
        "vector.clustering",
        JobOrigin.USER,
        {"documents": docs, "distance_threshold": 0.6},
    )
    res = await clustering_run(env)
    assert res.status.value == "succeeded", res
    clusters = res.result["clusters"]
    assert len(clusters) >= 1, f"expected at least 1 cluster, got {clusters}"
    sizes = [c["size"] for c in clusters]
    assert max(sizes) >= 2, f"expected at least one multi-item cluster, sizes={sizes}"
    _assert_json_serializable("clustering result", res.model_dump())
    engine = res.result["engine"]
    print(f"  ✓ clustering → {len(clusters)} cluster(s), engine={engine}, sizes={sizes}")


async def _run_newsroom() -> None:
    claims = [
        {
            "claim_id": "c1", "text": "Apple shipped 12 million iPhones in Q4.",
            "claim_type": "statistical", "confidence": 0.8,
            "detected_entities": ["Apple"], "evidence_needed": True,
        },
        {
            "claim_id": "c2", "text": "Tim Cook said, \"We are very pleased.\"",
            "claim_type": "quote", "confidence": 0.75,
            "detected_entities": ["Tim Cook"], "evidence_needed": True,
        },
        {
            "claim_id": "c3", "text": "Higher rates caused softness in smartphones.",
            "claim_type": "causal", "confidence": 0.55,
            "detected_entities": [], "evidence_needed": True,
        },
    ]
    articles = [
        {"id": "a1", "title": "Apple Q4 Results", "text": "Full article text.", "source": "Reuters"},
        {"id": "a2", "title": "Anonymous blog", "text": "Short snippet."},
    ]
    clusters = [
        {"cluster_id": "cl1", "label": "apple iphone q4", "size": 2,
         "keywords": ["apple", "iphone", "q4"], "confidence": 0.7,
         "item_ids": ["a1", "a2"]},
    ]
    env = _envelope(
        "inhouse.newsroom",
        JobOrigin.INHOUSE,
        {
            "verified_knowledge_id": "vk-smoke",
            "template_id": "news_desk",
            "articles": articles,
            "claims": claims,
            "clusters": clusters,
        },
    )
    res = await newsroom_run(env)
    assert res.status.value == "succeeded", res
    pkg = res.result["package"]
    for field in (
        "package_id", "summary", "top_claims", "topic_clusters",
        "risk_flags", "source_questions", "suggested_followups",
        "editorial_notes", "confidence", "generated_at",
    ):
        assert field in pkg, f"missing field: {field}"
    assert isinstance(pkg["top_claims"], list) and len(pkg["top_claims"]) >= 1
    assert isinstance(pkg["risk_flags"], list) and len(pkg["risk_flags"]) >= 1
    _assert_json_serializable("newsroom result", res.model_dump())
    print(
        f"  ✓ newsroom → top_claims={len(pkg['top_claims'])}, "
        f"flags={len(pkg['risk_flags'])}, confidence={pkg['confidence']}"
    )


async def _main() -> int:
    print("smoke_test_handlers: running…")
    try:
        await _run_claim_extraction()
        await _run_clustering()
        await _run_newsroom()
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print("smoke_test_handlers: OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
