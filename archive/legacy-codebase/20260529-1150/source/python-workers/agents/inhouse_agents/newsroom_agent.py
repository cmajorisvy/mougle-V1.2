"""
In-house newsroom agent — first real implementation. INTERNAL / ADMIN-ONLY.

Produces a NewsroomDataPackage draft from a bundle of inputs supplied by the
TypeScript orchestrator. This is the first step of the verified newsroom
pipeline (Phase 1B) — entirely deterministic and source-agnostic so it can
run safely without any external AI provider.

Inputs accepted in payload:
  - claims:   list of claim dicts (shape from user_claim_extraction_agent)
  - articles: list of {id, title?, text, source?, url?}
  - clusters: list of cluster dicts (shape from clustering_worker)
  - verified_knowledge_id / verifiedKnowledgeId: optional anchor id
  - template_id / templateId: optional preset name

The agent never fetches anything from the network; if the TS side wants
fresh content it must include it in the payload. This keeps the worker
testable and side-effect-free.

Future extension: replace the deterministic summarizer + question generator
with an LLM call (gpt-5.5 via the TS-side centralized config). The output
shape MUST stay compatible.
"""

from __future__ import annotations

import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.heuristics import (
    evidence_needed,
    extract_entities,
    has_date,
    has_number,
    has_quote,
)
from shared.ids import package_id
from shared.logging import get_logger
from shared.text_utils import normalize, top_keywords

log = get_logger(__name__)


def _coerce_list(value: Any) -> list[dict[str, Any]]:
    return [v for v in (value or []) if isinstance(v, dict)]


def _summarize_articles(articles: list[dict[str, Any]], claims: list[dict[str, Any]]) -> str:
    if not articles and not claims:
        return "No source content supplied; cannot summarize."
    keywords = top_keywords(
        [a.get("title") or "" for a in articles]
        + [a.get("text") or "" for a in articles]
        + [c.get("text") or "" for c in claims],
        k=6,
    )
    topic = ", ".join(keywords[:3]) if keywords else "various topics"
    return (
        f"Newsroom package covering {topic}. "
        f"{len(articles)} source article(s), {len(claims)} extracted claim(s). "
        "All claims should be verified against the cited sources before publishing."
    )


def _select_top_claims(claims: list[dict[str, Any]], k: int = 10) -> list[dict[str, Any]]:
    # Boost claims that repeat across the corpus.
    text_counter: Counter[str] = Counter(
        normalize(c.get("text") or "") for c in claims if c.get("text")
    )
    enriched: list[tuple[float, dict[str, Any]]] = []
    for c in claims:
        base = float(c.get("confidence") or 0.4)
        repetition = text_counter.get(normalize(c.get("text") or ""), 1)
        score = base + (0.05 * min(repetition - 1, 4))
        enriched.append((round(score, 3), c))
    enriched.sort(key=lambda x: (-x[0], (x[1].get("claim_id") or "")))
    out: list[dict[str, Any]] = []
    for score, c in enriched[:k]:
        out.append(
            {
                "claim_id": c.get("claim_id"),
                "text": c.get("text"),
                "claim_type": c.get("claim_type"),
                "confidence": c.get("confidence"),
                "evidence_needed": c.get("evidence_needed", False),
                "detected_entities": c.get("detected_entities") or [],
                "verification_priority": score,
            }
        )
    return out


def _topic_clusters(clusters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Slim down to the fields the newsroom package surfaces."""
    out: list[dict[str, Any]] = []
    for cl in clusters:
        out.append(
            {
                "cluster_id": cl.get("cluster_id"),
                "label": cl.get("label"),
                "size": cl.get("size"),
                "keywords": cl.get("keywords") or [],
                "confidence": cl.get("confidence"),
                "item_ids": cl.get("item_ids") or [],
            }
        )
    return out


def _risk_flags(
    articles: list[dict[str, Any]], claims: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []

    unsourced = [a for a in articles if not (a.get("source") or a.get("url"))]
    if unsourced:
        flags.append(
            {
                "code": "unsourced_articles",
                "severity": "medium",
                "message": f"{len(unsourced)} article(s) lack a source attribution.",
                "affected_ids": [a.get("id") for a in unsourced if a.get("id")],
            }
        )

    single_source_claims = [
        c for c in claims if not (c.get("detected_entities") or [])
    ]
    if single_source_claims:
        flags.append(
            {
                "code": "claims_without_entities",
                "severity": "low",
                "message": (
                    f"{len(single_source_claims)} claim(s) have no detected entities — "
                    "may indicate vague phrasing or low-information sentences."
                ),
                "affected_ids": [c.get("claim_id") for c in single_source_claims][:20],
            }
        )

    high_priority = [
        c for c in claims
        if evidence_needed(c.get("text") or "", c.get("claim_type") or "factual")
    ]
    if high_priority:
        flags.append(
            {
                "code": "high_priority_verification",
                "severity": "high" if len(high_priority) >= 5 else "medium",
                "message": (
                    f"{len(high_priority)} claim(s) carry numbers, dates, or causal "
                    "language and should be verified against primary sources."
                ),
                "affected_ids": [c.get("claim_id") for c in high_priority][:20],
            }
        )

    if not articles and not claims:
        flags.append(
            {
                "code": "empty_input",
                "severity": "critical",
                "message": "No articles or claims supplied — package is structurally empty.",
                "affected_ids": [],
            }
        )

    return flags


def _source_questions(articles: list[dict[str, Any]], claims: list[dict[str, Any]]) -> list[str]:
    qs: list[str] = []
    for a in articles[:5]:
        title = (a.get("title") or "").strip() or "this article"
        if not (a.get("source") or a.get("url")):
            qs.append(f"Where did the information in '{title}' originate?")
        if not a.get("text") or len(a.get("text") or "") < 200:
            qs.append(f"Is '{title}' the full text, or only a summary?")
    for c in claims[:8]:
        text = (c.get("text") or "").strip()
        if not text:
            continue
        if has_number(text):
            qs.append(f"What is the data source for: \"{text[:120]}\"?")
        elif has_quote(text):
            qs.append(f"Who is being quoted in: \"{text[:120]}\" and when was it said?")
        elif has_date(text):
            qs.append(f"Can the date or timing in \"{text[:120]}\" be cross-referenced?")
    seen: set[str] = set()
    out: list[str] = []
    for q in qs:
        if q in seen:
            continue
        seen.add(q)
        out.append(q)
    return out[:12]


def _suggested_followups(
    claims: list[dict[str, Any]], clusters: list[dict[str, Any]]
) -> list[str]:
    out: list[str] = []
    entity_counter: Counter[str] = Counter()
    for c in claims:
        for e in c.get("detected_entities") or []:
            entity_counter[e] += 1
    for ent, count in entity_counter.most_common(5):
        if count >= 2:
            out.append(f"Profile follow-up on {ent} (mentioned in {count} claims).")
    for cl in clusters[:3]:
        kws = cl.get("keywords") or []
        if kws:
            out.append(
                "Deeper investigation into cluster: "
                + ", ".join(kws[:3])
                + f" ({cl.get('size', 0)} items)."
            )
    if not out:
        out.append(
            "Consider broadening the source set — current input may be too narrow "
            "to surface meaningful follow-ups."
        )
    return out[:8]


def _editorial_notes(
    articles: list[dict[str, Any]],
    claims: list[dict[str, Any]],
    flags: list[dict[str, Any]],
) -> list[str]:
    notes: list[str] = []
    if articles:
        notes.append(f"Reviewed {len(articles)} article(s) for this package.")
    if claims:
        notes.append(f"Extracted {len(claims)} candidate claim(s); top entries prioritised by verification urgency.")
    high = sum(1 for f in flags if f.get("severity") in ("high", "critical"))
    if high:
        notes.append(f"{high} high/critical risk flag(s) raised — review before publication.")
    if not articles and claims:
        notes.append("No source articles attached; relying solely on extracted claims.")
    if not notes:
        notes.append("Package is structurally minimal — no input was supplied.")
    return notes


def _confidence(
    articles: list[dict[str, Any]],
    claims: list[dict[str, Any]],
    flags: list[dict[str, Any]],
) -> float:
    if not articles and not claims:
        return 0.0
    score = 0.4
    if articles:
        score += min(0.2, 0.05 * len(articles))
    if claims:
        score += min(0.25, 0.02 * len(claims))
        avg = sum(float(c.get("confidence") or 0) for c in claims) / max(len(claims), 1)
        score += min(0.15, avg * 0.2)
    critical = sum(1 for f in flags if f.get("severity") == "critical")
    score -= 0.2 * critical
    return round(max(0.0, min(score, 0.95)), 3)


async def run(job: JobEnvelope) -> JobResult:
    started = time.perf_counter()
    payload = job.payload or {}
    log.info("newsroom_agent.run", extra={"job_id": job.job_id})

    articles = _coerce_list(payload.get("articles"))
    claims = _coerce_list(payload.get("claims"))
    clusters = _coerce_list(payload.get("clusters"))
    verified_kid = payload.get("verified_knowledge_id") or payload.get("verifiedKnowledgeId")
    template = payload.get("template_id") or payload.get("templateId") or "news_desk"

    flags = _risk_flags(articles, claims)
    package = {
        "package_id": package_id(
            f"{verified_kid or job.job_id}|{template}|{len(articles)}|{len(claims)}"
        ),
        "template_id": template,
        "verified_knowledge_id": verified_kid,
        "summary": _summarize_articles(articles, claims),
        "top_claims": _select_top_claims(claims),
        "topic_clusters": _topic_clusters(clusters),
        "risk_flags": flags,
        "source_questions": _source_questions(articles, claims),
        "suggested_followups": _suggested_followups(claims, clusters),
        "editorial_notes": _editorial_notes(articles, claims, flags),
        "confidence": _confidence(articles, claims, flags),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    duration_ms = int((time.perf_counter() - started) * 1000)
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        duration_ms=duration_ms,
        result={
            "agent": "newsroom_agent",
            "version": "heuristic-v1",
            "package": package,
        },
        metrics={
            "article_count": len(articles),
            "claim_count": len(claims),
            "cluster_count": len(clusters),
            "risk_flag_count": len(flags),
        },
    )
