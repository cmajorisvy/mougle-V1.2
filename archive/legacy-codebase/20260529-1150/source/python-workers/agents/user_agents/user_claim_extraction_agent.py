"""
User claim extraction agent — first real implementation.

USER-FACING. Extracts atomic, verifiable claims from articles / documents
supplied by an end-user. The TS API gates which articles a given user is
allowed to extract claims from; this worker re-validates origin defensively
via JobRouter.

Strategy:
  1. Read articles from the job payload. We accept either:
       payload.articles = [{ id, text, title? }, ...]   (preferred)
       payload.article_ids = ["a1", ...]                (fallback, no text)
     When only IDs are provided we emit zero claims for those rows — the TS
     side is expected to attach the text or to look the article up before
     enqueueing. This keeps the worker stateless and DB-free.
  2. For each article, sentence-split and run deterministic heuristics
     (heuristics.classify_claim_type / score_confidence / extract_entities).
  3. Filter obvious non-claims (greetings, opinions, fragments).
  4. Cap to max_claims_per_article (default 8, hard ceiling 32 per contract).
  5. Return a JobResult-compatible success payload.

Future extension: replace _extract_for_text() with an LLM-backed extractor
(e.g. OpenAI gpt-5.5 via the TS side's centralized model config). The output
shape MUST stay compatible.
"""

from __future__ import annotations

import time
from typing import Any

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.heuristics import (
    classify_claim_type,
    evidence_needed,
    extract_entities,
    is_obvious_non_claim,
    score_confidence,
)
from shared.ids import claim_id
from shared.logging import get_logger
from shared.text_utils import normalize, sentence_split

log = get_logger(__name__)

_DEFAULT_MAX = 8
_HARD_CEILING = 32


def _extract_for_text(article_id: str, text: str, max_claims: int) -> list[dict[str, Any]]:
    claims: list[dict[str, Any]] = []
    if not text:
        return claims

    # Track character offsets while we split so source_span is approximate but
    # consistent with the original text.
    cursor = 0
    for sentence in sentence_split(text):
        # Find the sentence in the original text starting from cursor so we
        # don't pick up an earlier match.
        idx = text.find(sentence, cursor)
        if idx == -1:
            idx = cursor
        span_start = idx
        span_end = idx + len(sentence)
        cursor = span_end

        if is_obvious_non_claim(sentence):
            continue

        ctype = classify_claim_type(sentence)
        entities = extract_entities(sentence)
        confidence = score_confidence(sentence, ctype)
        notes_parts: list[str] = []
        if not entities:
            notes_parts.append("no named entities detected")
        if ctype == "factual" and confidence < 0.5:
            notes_parts.append("low-signal heuristic match — consider LLM verification")

        claims.append(
            {
                "claim_id": claim_id(article_id, sentence),
                "article_id": article_id,
                "text": sentence,
                "normalized_text": normalize(sentence),
                "claim_type": ctype,
                "confidence": confidence,
                "detected_entities": entities,
                "source_span": {"start": span_start, "end": span_end},
                "evidence_needed": evidence_needed(sentence, ctype),
                "notes": "; ".join(notes_parts) if notes_parts else "",
            }
        )

    # Highest-confidence first; stable on ties.
    claims.sort(key=lambda c: (-c["confidence"], c["claim_id"]))
    return claims[:max_claims]


async def run(job: JobEnvelope) -> JobResult:
    started = time.perf_counter()
    payload = job.payload or {}
    log.info(
        "user_claim_extraction_agent.run",
        extra={"job_id": job.job_id, "has_articles": "articles" in payload},
    )

    raw_max = payload.get("max_claims_per_article") or payload.get("maxClaimsPerArticle") or _DEFAULT_MAX
    try:
        max_claims = max(1, min(int(raw_max), _HARD_CEILING))
    except (TypeError, ValueError):
        max_claims = _DEFAULT_MAX

    articles: list[dict[str, Any]] = []
    if isinstance(payload.get("articles"), list):
        for raw in payload["articles"]:
            if not isinstance(raw, dict):
                continue
            aid = str(raw.get("id") or raw.get("article_id") or "").strip()
            text = str(raw.get("text") or raw.get("content") or "")
            if aid:
                articles.append({"id": aid, "text": text, "title": raw.get("title")})
    else:
        for aid in payload.get("article_ids") or payload.get("articleIds") or []:
            articles.append({"id": str(aid), "text": "", "title": None})

    all_claims: list[dict[str, Any]] = []
    skipped_no_text: list[str] = []
    for article in articles:
        if not article["text"]:
            skipped_no_text.append(article["id"])
            continue
        all_claims.extend(_extract_for_text(article["id"], article["text"], max_claims))

    duration_ms = int((time.perf_counter() - started) * 1000)
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        duration_ms=duration_ms,
        result={
            "agent": "user_claim_extraction_agent",
            "version": "heuristic-v1",
            "cluster_id": payload.get("cluster_id") or payload.get("clusterId"),
            "article_count": len(articles),
            "claim_count": len(all_claims),
            "claims": all_claims,
            "skipped_articles_missing_text": skipped_no_text,
            "max_claims_per_article": max_claims,
        },
        metrics={
            "claims_per_article_avg": round(len(all_claims) / max(len(articles), 1), 2),
            "articles_with_text": len(articles) - len(skipped_no_text),
        },
    )
