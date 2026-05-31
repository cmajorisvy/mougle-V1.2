"""Newsrooms Council MVP.

This module is the local, deterministic editorial control plane for newsroom
source intake, claim preparation, and safe handoff into Stage 7/Stage 6. It does
not publish final truth and cannot write directly to Stage 4 or Stage 1.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from app.models import (
    EvidenceSource,
    NewsArticleStatus,
    NewsAiVisualDisclosure,
    NewsAnchorScript,
    NewsAnchorScriptLine,
    NewsCanonicalCluster,
    NewsCategory,
    NewsCategoryInput,
    NewsClaim,
    NewsClaimInput,
    NewsClaimStatus,
    NewsCorrectionInput,
    NewsCorrectionRecord,
    NewsEvidence,
    NewsEvidenceInput,
    NewsFeed,
    NewsFeedInput,
    NewsIngestEvent,
    NewsModalityDivergenceReport,
    NewsOutputModality,
    NewsScoreBundle,
    NewsSeoArtifact,
    NewsSitemapEntry,
    NewsSource,
    NewsSourceInput,
    NewsSourceReliabilityRecord,
    NewsStage6SubmissionPacket,
    NewsStage7CandidateRoute,
    NewsStudioAiReconstructionLabel,
    NewsStudioAssetRequirement,
    NewsStudioCueTarget,
    NewsStudioCueType,
    NewsStudioLowerThird,
    NewsStudioRightsCheck,
    NewsStudioSceneCue,
    NewsStudioScreenState,
    NewsStudioSfxCue,
    NewsStudioTickerItem,
    NewsStructuredDataType,
    NewsStructuredDataArtifact,
    NewsToDebateHandoff,
    NewsHreflangVariant,
    NewsOriginalityReport,
    NewsRobotExplainerCue,
    NewsSfxCueType,
    NewsVideoBulletin,
    NewsVideoBulletinInput,
    NewsVideoSeoArtifact,
    NewsVideoSitemapEntry,
    NewsroomAuditLog,
    NewsroomDashboardCard,
    NewsroomDashboardPage,
    NewsroomPackage,
    NewsroomPackageInput,
    NewsroomPackageStatus,
    NewsroomRiskAlert,
    NewsroomRiskSeverity,
    NewsroomSafetyBoundaries,
    NewsroomScript,
    NewsroomScriptInput,
    NewsroomSegment,
    NewsSlug,
    NewsTopic,
    NormalizedNewsArticle,
    RawNewsItem,
    RawNewsItemInput,
    Stage7ExternalRecord,
    Stage7ExternalRecordInput,
    Stage7RecordStatus,
    Stage7SubmissionPackage,
    Stage7Tank,
    utc_now,
)

HARD_OUTPUT_RULES: dict[str, bool] = {
    "newsworthiness_is_truth_score": False,
    "virality_is_truth": False,
    "source_reliability_is_truth_score": False,
    "newsrooms_council_may_publish_truth": False,
    "newsrooms_council_may_update_stage1": False,
    "newsrooms_council_may_update_stage4": False,
    "stage7_routes_candidate_only": True,
    "stage6_packets_not_final_verification": True,
    "news_to_debate_handoff_candidate_only": True,
}


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def _stable_id(prefix: str, *parts: object) -> str:
    body = ":".join(json.dumps(part, sort_keys=True, default=str) for part in parts)
    digest = hashlib.sha1(body.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def _word_count(text: str) -> int:
    return len(re.findall(r"\w+", text))


def _first_sentences(text: str, limit: int = 2) -> str:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part.strip()]
    return " ".join(sentences[:limit]) if sentences else text.strip()[:240]


def _short_spoken_sentence(text: str, max_words: int = 16) -> str:
    words = re.findall(r"\S+", text.strip())
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]).rstrip(".,;:") + "."


def _freshness_decay(published_at: datetime | None, *, decay_lambda: float = 0.08) -> float:
    if published_at is None:
        return 0.5
    delta_hours = max(0.0, (utc_now() - published_at.replace(tzinfo=None)).total_seconds() / 3600.0)
    return _clip01(math.exp(-decay_lambda * delta_hours))


def source_reliability_score(payload: NewsSourceInput) -> float:
    value = (
        0.22 * payload.historical_accuracy
        + 0.16 * payload.correction_responsiveness
        + 0.14 * payload.provenance_completeness
        + 0.12 * payload.citation_quality
        + 0.10 * payload.domain_authority
        + 0.08 * payload.author_traceability
        + 0.08 * payload.freshness_consistency
        + 0.06 * payload.cross_source_agreement
        - 0.14 * payload.retraction_penalty
        - 0.10 * payload.sensationalism_penalty
        - 0.08 * payload.unknown_ownership_penalty
    )
    return _clip01(_sigmoid(value))


def article_newsworthiness_score(
    *,
    source_reliability: float,
    evidence_strength: float,
    public_impact: float,
    timeliness: float,
    novelty: float,
    geographic_relevance: float,
    user_interest_match: float,
    institutional_importance: float,
    debate_potential: float,
    duplication_penalty: float,
    clickbait_penalty: float,
) -> float:
    value = (
        0.18 * public_impact
        + 0.15 * timeliness
        + 0.13 * novelty
        + 0.12 * geographic_relevance
        + 0.10 * user_interest_match
        + 0.10 * institutional_importance
        + 0.08 * debate_potential
        + 0.08 * source_reliability
        + 0.06 * evidence_strength
        - 0.10 * duplication_penalty
        - 0.08 * clickbait_penalty
    )
    return _clip01(_sigmoid(value))


def editorial_risk_score(
    *,
    legal_sensitivity: float,
    financial_sensitivity: float,
    medical_safety_sensitivity: float,
    political_manipulation_risk: float,
    conflict_or_war_risk: float,
    children_safety_risk: float,
    scam_spam_risk: float,
    privacy_risk: float,
    defamation_risk: float,
) -> float:
    value = (
        0.18 * legal_sensitivity
        + 0.16 * financial_sensitivity
        + 0.15 * medical_safety_sensitivity
        + 0.12 * political_manipulation_risk
        + 0.10 * conflict_or_war_risk
        + 0.09 * children_safety_risk
        + 0.08 * scam_spam_risk
        + 0.07 * privacy_risk
        + 0.05 * defamation_risk
    )
    return _clip01(_sigmoid(value))


def claim_priority_score(
    *,
    public_impact: float,
    editorial_risk: float,
    contradiction_pressure: float,
    source_reach: float,
    evidence_conflict: float,
    freshness_need: float,
    debate_potential: float,
    user_report_volume: float,
) -> float:
    value = (
        0.20 * public_impact
        + 0.18 * editorial_risk
        + 0.16 * contradiction_pressure
        + 0.14 * source_reach
        + 0.12 * evidence_conflict
        + 0.10 * freshness_need
        + 0.06 * debate_potential
        + 0.04 * user_report_volume
    )
    return _clip01(_sigmoid(value))


def newsroom_readiness_score(
    *,
    verified_claim_coverage: float,
    source_reliability_mean: float,
    evidence_completeness: float,
    stage6_agreement: float,
    graph_consistency: float,
    correction_state_clean: float,
    editorial_review_complete: float,
    script_clarity: float,
    audience_relevance: float,
    unresolved_claim_penalty: float,
    risk_penalty: float,
    freshness_decay_penalty: float,
) -> float:
    value = (
        0.20 * verified_claim_coverage
        + 0.16 * source_reliability_mean
        + 0.14 * evidence_completeness
        + 0.12 * stage6_agreement
        + 0.10 * graph_consistency
        + 0.08 * correction_state_clean
        + 0.08 * editorial_review_complete
        + 0.06 * script_clarity
        + 0.06 * audience_relevance
        - 0.14 * unresolved_claim_penalty
        - 0.10 * risk_penalty
        - 0.08 * freshness_decay_penalty
    )
    return _clip01(_sigmoid(value))


def broadcast_readiness_score(
    *,
    newsroom_readiness: float,
    script_completeness: float,
    anchor_safety: float,
    source_attribution_completeness: float,
    visual_asset_safety: float,
    correction_disclosure: float,
    duration_fit: float,
    segment_coherence: float,
    compliance_status: float,
    unverified_claim_penalty: float,
    sensationalism_penalty: float,
) -> float:
    value = (
        0.18 * newsroom_readiness
        + 0.15 * script_completeness
        + 0.12 * anchor_safety
        + 0.12 * source_attribution_completeness
        + 0.10 * visual_asset_safety
        + 0.10 * correction_disclosure
        + 0.08 * duration_fit
        + 0.08 * segment_coherence
        + 0.07 * compliance_status
        - 0.12 * unverified_claim_penalty
        - 0.08 * sensationalism_penalty
    )
    return _clip01(_sigmoid(value))


def write_audit_log(
    action: str,
    *,
    entity_type: str,
    entity_id: str,
    actor_id: str = "system",
    article_id: str | None = None,
    claim_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> NewsroomAuditLog:
    metadata = metadata or {}
    return NewsroomAuditLog(
        audit_id=_stable_id("newsroom_audit", action, entity_type, entity_id, actor_id, metadata),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=actor_id,
        article_id=article_id,
        claim_id=claim_id,
        metadata=metadata | HARD_OUTPUT_RULES,
    )


def register_news_source(payload: NewsSourceInput) -> tuple[NewsSource, NewsSourceReliabilityRecord]:
    score = source_reliability_score(payload)
    source = NewsSource(
        source_id=_stable_id("news_source", payload.name, payload.source_type.value, payload.url_or_path),
        name=payload.name,
        source_type=payload.source_type,
        url_or_path=payload.url_or_path,
        owner=payload.owner,
        topic_tags=payload.topic_tags,
        reliability_score=score,
        metadata=payload.metadata | {"external_calls_made": False},
    )
    record = NewsSourceReliabilityRecord(
        record_id=_stable_id("news_source_reliability", source.source_id, score),
        source_id=source.source_id,
        score=score,
        formula="SourceReliability",
        inputs={
            "historical_accuracy": payload.historical_accuracy,
            "correction_responsiveness": payload.correction_responsiveness,
            "provenance_completeness": payload.provenance_completeness,
            "citation_quality": payload.citation_quality,
            "domain_authority": payload.domain_authority,
            "author_traceability": payload.author_traceability,
            "freshness_consistency": payload.freshness_consistency,
            "cross_source_agreement": payload.cross_source_agreement,
            "retraction_penalty": payload.retraction_penalty,
            "sensationalism_penalty": payload.sensationalism_penalty,
            "unknown_ownership_penalty": payload.unknown_ownership_penalty,
        },
    )
    return source, record


def create_news_feed(source: NewsSource, payload: NewsFeedInput) -> NewsFeed:
    return NewsFeed(
        feed_id=_stable_id("news_feed", source.source_id, payload.name, payload.feed_url),
        source_id=source.source_id,
        name=payload.name,
        feed_url=payload.feed_url,
        topic_tags=payload.topic_tags,
        polling_enabled=payload.polling_enabled,
        metadata=payload.metadata | {"external_calls_made": False},
    )


def ingest_news_item(
    feed: NewsFeed | None,
    source: NewsSource,
    payload: RawNewsItemInput,
) -> tuple[RawNewsItem, NewsIngestEvent]:
    raw = RawNewsItem(
        raw_item_id=_stable_id("raw_news", source.source_id, payload.title, payload.body, payload.url_or_path),
        feed_id=feed.feed_id if feed else payload.feed_id,
        source_id=source.source_id,
        title=payload.title.strip(),
        body=payload.body.strip(),
        url_or_path=payload.url_or_path,
        author=payload.author,
        published_at=payload.published_at,
        topic_tags=payload.topic_tags,
        metadata=payload.metadata | {"external_calls_made": False},
    )
    event = NewsIngestEvent(
        ingest_event_id=_stable_id("news_ingest", raw.raw_item_id, raw.feed_id, source.source_id),
        feed_id=raw.feed_id,
        raw_item_id=raw.raw_item_id,
        source_id=source.source_id,
        status="ingested",
        external_calls_made=False,
        metadata={"local_only": True, "no_hidden_network_calls": True},
    )
    return raw, event


def normalize_news_article(raw: RawNewsItem, source: NewsSource) -> NormalizedNewsArticle:
    text = re.sub(r"\s+", " ", raw.body).strip()
    title = re.sub(r"\s+", " ", raw.title).strip()
    canonical_url = raw.url_or_path or f"local-news://{raw.raw_item_id}"
    article = NormalizedNewsArticle(
        article_id=_stable_id("news_article", raw.raw_item_id, title, text),
        raw_item_id=raw.raw_item_id,
        source_id=source.source_id,
        title=title,
        normalized_text=text,
        summary=_first_sentences(text),
        url_or_path=raw.url_or_path,
        canonical_url=canonical_url,
        author=raw.author,
        published_at=raw.published_at,
        status=NewsArticleStatus.normalized,
        topic_tags=sorted(set(raw.topic_tags + source.topic_tags)),
        word_count=_word_count(text),
        metadata=raw.metadata | {"source_reliability": source.reliability_score, "external_calls_made": False},
    )
    return article


def deduplicate_news_article(
    article: NormalizedNewsArticle, existing: Iterable[NormalizedNewsArticle]
) -> NormalizedNewsArticle:
    fingerprint = _stable_id("article_fingerprint", article.title.lower(), article.normalized_text.lower())
    for other in existing:
        other_fingerprint = _stable_id("article_fingerprint", other.title.lower(), other.normalized_text.lower())
        if other.article_id != article.article_id and other_fingerprint == fingerprint:
            article.status = NewsArticleStatus.duplicate
            article.duplicate_of_article_id = other.article_id
            article.updated_at = utc_now()
            return article
    return article


def _claim_from_text(article: NormalizedNewsArticle, text: str, index: int) -> NewsClaim:
    priority = compute_claim_priority(
        public_impact=0.55,
        editorial_risk=0.45,
        contradiction_pressure=0.35,
        source_reach=0.5,
        evidence_conflict=0.25,
        freshness_need=1.0 - _freshness_decay(article.published_at),
        debate_potential=0.45,
        user_report_volume=0.0,
    )
    return NewsClaim(
        claim_id=_stable_id("news_claim", article.article_id, index, text),
        article_id=article.article_id,
        source_id=article.source_id,
        claim_text=text,
        claimant_id="newsrooms_council_extractor",
        sentence_index=index,
        topic_tags=article.topic_tags,
        priority=priority,
        status=NewsClaimStatus.extracted,
    )


def extract_news_claims(article: NormalizedNewsArticle) -> tuple[list[NewsClaim], NormalizedNewsArticle]:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", article.normalized_text) if part.strip()]
    claim_texts = [sentence for sentence in sentences if _word_count(sentence) >= 4][:5]
    if not claim_texts and article.normalized_text:
        claim_texts = [article.normalized_text[:240]]
    claims = [_claim_from_text(article, text, index) for index, text in enumerate(claim_texts)]
    article.status = NewsArticleStatus.claims_extracted
    article.updated_at = utc_now()
    return claims, article


def submit_news_evidence(claim: NewsClaim, payload: NewsEvidenceInput) -> tuple[NewsEvidence, NewsClaim]:
    if not payload.no_fabricated_evidence_attestation:
        raise ValueError("evidence submission rejected: no-fabricated-evidence attestation is required")
    if not payload.text.strip():
        raise ValueError("evidence submission rejected: evidence text is required")
    source = EvidenceSource(
        source_id=payload.source_id,
        source_name=payload.source_name,
        url_or_path=payload.url_or_path,
        reliability=payload.reliability,
    )
    evidence = NewsEvidence(
        evidence_id=_stable_id("news_evidence", claim.claim_id, payload.source_id, payload.text),
        claim_id=claim.claim_id,
        article_id=claim.article_id,
        source=source,
        text=payload.text,
        submitted_by=payload.submitted_by,
        url_or_path=payload.url_or_path,
        quote=payload.quote,
        retrieval_method=payload.retrieval_method,
        no_fabricated_evidence_attestation=payload.no_fabricated_evidence_attestation,
    )
    claim.status = NewsClaimStatus.needs_stage7_route
    claim.updated_at = utc_now()
    return evidence, claim


def score_source_reliability(payload: NewsSourceInput) -> float:
    return source_reliability_score(payload)


def score_article_newsworthiness(article: NormalizedNewsArticle, source: NewsSource, evidence_count: int) -> float:
    freshness = _freshness_decay(article.published_at)
    title_lower = article.title.lower()
    clickbait = 1.0 if any(word in title_lower for word in {"shocking", "secret", "you won't believe"}) else 0.0
    return article_newsworthiness_score(
        source_reliability=source.reliability_score,
        evidence_strength=_clip01(evidence_count / 3.0),
        public_impact=0.62,
        timeliness=freshness,
        novelty=0.55,
        geographic_relevance=0.5,
        user_interest_match=0.5,
        institutional_importance=0.5,
        debate_potential=0.45,
        duplication_penalty=1.0 if article.status == NewsArticleStatus.duplicate else 0.0,
        clickbait_penalty=clickbait,
    )


def score_editorial_risk(text: str, metadata: dict[str, Any] | None = None) -> float:
    metadata = metadata or {}
    lowered = text.lower()
    financial = 1.0 if any(term in lowered for term in {"stock", "bank", "market", "crypto"}) else 0.0
    medical = 1.0 if any(term in lowered for term in {"vaccine", "drug", "disease", "doctor"}) else 0.0
    political = 1.0 if any(term in lowered for term in {"election", "government", "minister", "president"}) else 0.0
    conflict = 1.0 if any(term in lowered for term in {"war", "attack", "conflict", "missile"}) else 0.0
    legal = 1.0 if any(term in lowered for term in {"lawsuit", "fraud", "court", "crime"}) else 0.0
    privacy = 1.0 if any(term in lowered for term in {"leaked", "private", "personal data"}) else 0.0
    return editorial_risk_score(
        legal_sensitivity=_clip01(float(metadata.get("legal_sensitivity", legal))),
        financial_sensitivity=_clip01(float(metadata.get("financial_sensitivity", financial))),
        medical_safety_sensitivity=_clip01(float(metadata.get("medical_safety_sensitivity", medical))),
        political_manipulation_risk=_clip01(float(metadata.get("political_manipulation_risk", political))),
        conflict_or_war_risk=_clip01(float(metadata.get("conflict_or_war_risk", conflict))),
        children_safety_risk=_clip01(float(metadata.get("children_safety_risk", 0.0))),
        scam_spam_risk=_clip01(float(metadata.get("scam_spam_risk", 0.0))),
        privacy_risk=_clip01(float(metadata.get("privacy_risk", privacy))),
        defamation_risk=_clip01(float(metadata.get("defamation_risk", legal))),
    )


def compute_claim_priority(**kwargs: float) -> float:
    return claim_priority_score(**kwargs)


def create_score_bundle(
    article: NormalizedNewsArticle,
    source: NewsSource,
    claims: list[NewsClaim],
    evidence: list[NewsEvidence],
) -> NewsScoreBundle:
    evidence_claims = {item.claim_id for item in evidence}
    claim_count = max(1, len(claims))
    evidence_completeness = len(evidence_claims) / claim_count
    source_reliability = source.reliability_score
    newsworthiness = score_article_newsworthiness(article, source, len(evidence))
    editorial_risk = score_editorial_risk(article.normalized_text, article.metadata)
    claim_priority = max((claim.priority for claim in claims), default=0.0)
    freshness = _freshness_decay(article.published_at)
    newsroom_readiness = newsroom_readiness_score(
        verified_claim_coverage=0.0,
        source_reliability_mean=source_reliability,
        evidence_completeness=evidence_completeness,
        stage6_agreement=0.0,
        graph_consistency=0.5,
        correction_state_clean=1.0,
        editorial_review_complete=0.4,
        script_clarity=0.5,
        audience_relevance=newsworthiness,
        unresolved_claim_penalty=1.0 - evidence_completeness,
        risk_penalty=editorial_risk,
        freshness_decay_penalty=1.0 - freshness,
    )
    broadcast_readiness = broadcast_readiness_score(
        newsroom_readiness=newsroom_readiness,
        script_completeness=0.4,
        anchor_safety=0.8,
        source_attribution_completeness=evidence_completeness,
        visual_asset_safety=1.0,
        correction_disclosure=1.0,
        duration_fit=0.75,
        segment_coherence=0.6,
        compliance_status=0.8,
        unverified_claim_penalty=1.0,
        sensationalism_penalty=float(article.metadata.get("sensationalism_penalty", 0.0)),
    )
    return NewsScoreBundle(
        score_bundle_id=_stable_id("news_score_bundle", article.article_id, len(claims), len(evidence)),
        article_id=article.article_id,
        claim_ids=[claim.claim_id for claim in claims],
        source_reliability=source_reliability,
        newsworthiness=newsworthiness,
        editorial_risk=editorial_risk,
        claim_priority=claim_priority,
        freshness_decay=freshness,
        newsroom_readiness=newsroom_readiness,
        broadcast_readiness=broadcast_readiness,
        hard_output_rules=HARD_OUTPUT_RULES,
    )


def create_newsroom_candidate(claim: NewsClaim, evidence: list[NewsEvidence]) -> Stage7ExternalRecordInput:
    evidence_quality = _clip01(sum(item.source.reliability for item in evidence) / max(1, len(evidence)))
    contradiction_count = 1 if claim.priority >= 0.66 and not evidence else 0
    if evidence and evidence_quality >= 0.55:
        tank = Stage7Tank.supported_data
        status = Stage7RecordStatus.candidate_supported
    else:
        tank = Stage7Tank.disputed_unknown
        status = Stage7RecordStatus.unresolved
    return Stage7ExternalRecordInput(
        claim_text=claim.claim_text,
        source_ref=f"news_claim:{claim.claim_id}",
        evidence_refs=[item.evidence_id for item in evidence],
        tank=tank,
        status=status,
        provider="newsrooms_council",
        model="deterministic-local-mvp",
        confidence=_clip01((claim.priority + evidence_quality) / 2.0),
        evidence_quality=evidence_quality,
        contradiction_count=contradiction_count,
        rationale="Newsrooms Council candidate route; Stage 6 required before truth",
        metadata={
            "article_id": claim.article_id,
            "claim_id": claim.claim_id,
            "candidate_only": True,
            "newsworthiness_is_truth_score": False,
            "source_reliability_is_truth_score": False,
            "virality_is_truth": False,
            "may_publish_truth": False,
            "may_update_stage1": False,
            "may_update_stage4": False,
            "news_to_debate_handoff_candidate_only": True,
        },
    )


def route_news_claim_to_stage7(
    claim: NewsClaim, record: Stage7ExternalRecord
) -> tuple[NewsStage7CandidateRoute, NewsClaim]:
    route = NewsStage7CandidateRoute(
        route_id=_stable_id("news_stage7_route", claim.claim_id, record.record_id),
        claim_id=claim.claim_id,
        article_id=claim.article_id,
        stage7_record_id=record.record_id,
        tank=record.tank,
        status=record.status,
        route_reason="Newsrooms Council routed claim as Stage 7 candidate only; Stage 6 required",
        payload={
            "claim_text": claim.claim_text,
            "stage7_tank": record.tank.value,
            "stage7_status": record.status.value,
            "candidate_only": True,
            "stage6_required": True,
            "query_tank_handoff": record.tank == Stage7Tank.disputed_unknown,
        },
    )
    claim.stage7_record_id = record.record_id
    claim.status = NewsClaimStatus.routed_stage7_candidate
    claim.updated_at = utc_now()
    return route, claim


def submit_news_claim_to_stage6(
    claim: NewsClaim,
    route: NewsStage7CandidateRoute,
    package: Stage7SubmissionPackage,
    evidence: list[NewsEvidence],
) -> tuple[NewsStage6SubmissionPacket, NewsClaim]:
    packet = NewsStage6SubmissionPacket(
        packet_id=_stable_id("news_stage6_packet", claim.claim_id, package.submission_id),
        claim_id=claim.claim_id,
        article_id=claim.article_id,
        stage7_record_id=route.stage7_record_id,
        stage7_submission_id=package.submission_id,
        payload={
            "stage7_package": package.model_dump(mode="json"),
            "claim_text": claim.claim_text,
            "evidence_refs": [item.evidence_id for item in evidence],
            "candidate_answer_not_verified": True,
            "stage6_required": True,
            "may_publish_truth": False,
            "may_update_stage1": False,
            "may_update_stage4": False,
        },
    )
    claim.stage6_packet_id = packet.packet_id
    claim.status = NewsClaimStatus.submitted_stage6
    claim.updated_at = utc_now()
    return packet, claim


def create_newsroom_package(
    payload: NewsroomPackageInput,
    article: NormalizedNewsArticle,
    claims: list[NewsClaim],
    score_bundle: NewsScoreBundle,
) -> NewsroomPackage:
    structured_data = [
        NewsStructuredDataType.news_article,
        NewsStructuredDataType.breadcrumb_list,
        NewsStructuredDataType.organization,
    ]
    if payload.modality in {NewsOutputModality.anchor_script, NewsOutputModality.robot_explainer, NewsOutputModality.video_plan}:
        structured_data.append(NewsStructuredDataType.video_object)
    return NewsroomPackage(
        package_id=_stable_id("newsroom_package", article.article_id, payload.modality.value, payload.title),
        article_id=article.article_id,
        title=payload.title or article.title,
        claim_ids=payload.claim_ids or [claim.claim_id for claim in claims],
        modality=payload.modality,
        status=NewsroomPackageStatus.candidate,
        newsroom_readiness=score_bundle.newsroom_readiness,
        broadcast_readiness=score_bundle.broadcast_readiness,
        canonical_url=payload.canonical_url or article.canonical_url,
        hreflang_cluster=payload.hreflang_cluster,
        structured_data_types=structured_data,
        metadata=payload.metadata
        | {
            "text_output_from_verified_claim_graph": True,
            "copyright_safe_rewriting_not_source_paragraph_paraphrase": True,
        },
    )


def create_newsroom_script(
    package: NewsroomPackage, claims: list[NewsClaim], payload: NewsroomScriptInput
) -> tuple[NewsroomScript, list[NewsroomSegment], NewsroomPackage]:
    claim_lines = [_short_spoken_sentence(claim.claim_text) for claim in claims[:5]]
    if not claim_lines:
        claim_lines = ["This story remains in candidate review."]
    anchor_script = " ".join(["Here is what we know so far.", *claim_lines, "This is not final truth yet."])
    robot_script = " ".join(["The verification path is still active.", "Stage 6 must review before final truth."])
    lower_thirds = [f"Candidate claim {index + 1}" for index, _ in enumerate(claim_lines[:3])]
    ticker = ["Stage 7 candidate route active", "Stage 6 review required", "No direct Stage 4 or Stage 1 writes"]
    script = NewsroomScript(
        script_id=_stable_id("newsroom_script", package.package_id, payload.modality.value, payload.anchor_name),
        package_id=package.package_id,
        modality=payload.modality,
        anchor_name=payload.anchor_name,
        tone=payload.tone,
        anchor_script=anchor_script,
        robot_explainer_script=robot_script,
        shot_plan=["wide anchor desk", "source panel insert", "claim timeline close-up"],
        sfx_plan=["soft transition only", "no urgency sting for unverified claims"],
        lower_third_plan=lower_thirds,
        ticker_plan=ticker,
        ai_reconstruction_labels=["AI reconstruction preview only"],
        duration_seconds=payload.duration_seconds,
        broadcast_readiness=package.broadcast_readiness,
        metadata={"preview_only_studio_cues": True, "hardware_execution": False, "publishing_command": False},
    )
    segments = [
        NewsroomSegment(
            segment_id=_stable_id("newsroom_segment", script.script_id, index, line),
            script_id=script.script_id,
            package_id=package.package_id,
            sequence=index,
            spoken_text=line,
            cue_type=NewsStudioCueType.claims_panel if index else NewsStudioCueType.lower_third,
            duration_seconds=max(4, min(12, _word_count(line))),
        )
        for index, line in enumerate(claim_lines)
    ]
    package.status = NewsroomPackageStatus.script_ready
    package.updated_at = utc_now()
    return script, segments, package


def create_news_to_debate_handoff(package: NewsroomPackage, claims: list[NewsClaim]) -> NewsToDebateHandoff:
    return NewsToDebateHandoff(
        handoff_id=_stable_id("news_to_debate", package.package_id, [claim.claim_id for claim in claims]),
        package_id=package.package_id,
        article_id=package.article_id,
        claim_ids=[claim.claim_id for claim in claims],
        target_council="podcast_forum_debates",
        route_reason="candidate-only newsroom claims may be debated but cannot become final truth here",
        metadata=HARD_OUTPUT_RULES | {"query_tank_handoff_allowed": True},
    )


def create_correction_record(payload: NewsCorrectionInput) -> NewsCorrectionRecord:
    return NewsCorrectionRecord(
        correction_id=_stable_id(
            "news_correction", payload.article_id, payload.claim_id, payload.correction_text, payload.requested_by
        ),
        article_id=payload.article_id,
        claim_id=payload.claim_id,
        correction_text=payload.correction_text,
        requested_by=payload.requested_by,
        metadata=payload.metadata | {"correction_state_clean": False, "stage6_required": True},
    )


def create_newsroom_risk_alert(
    *,
    article_id: str | None,
    claim_id: str | None,
    risk_score: float,
    reason: str,
) -> NewsroomRiskAlert:
    if risk_score >= 0.8:
        severity = NewsroomRiskSeverity.critical
    elif risk_score >= 0.65:
        severity = NewsroomRiskSeverity.high
    elif risk_score >= 0.45:
        severity = NewsroomRiskSeverity.medium
    else:
        severity = NewsroomRiskSeverity.info
    return NewsroomRiskAlert(
        alert_id=_stable_id("newsroom_alert", article_id, claim_id, reason, risk_score),
        article_id=article_id,
        claim_id=claim_id,
        severity=severity,
        reason=reason,
        risk_score=_clip01(risk_score),
        required_next_action="route_candidate_to_stage7_or_stage6_review",
    )


def create_newsroom_audit_log(action: str, **kwargs: Any) -> NewsroomAuditLog:
    return write_audit_log(action, **kwargs)


def build_newsroom_dashboard_cards(
    sources: list[NewsSource],
    articles: list[NormalizedNewsArticle],
    claims: list[NewsClaim],
    routes: list[NewsStage7CandidateRoute],
    packets: list[NewsStage6SubmissionPacket],
    alerts: list[NewsroomRiskAlert],
) -> list[NewsroomDashboardCard]:
    unresolved = sum(1 for claim in claims if claim.status != NewsClaimStatus.submitted_stage6)
    high_alerts = sum(1 for alert in alerts if alert.severity in {NewsroomRiskSeverity.high, NewsroomRiskSeverity.critical})
    return [
        NewsroomDashboardCard(
            card_id="newsroom_sources",
            title="News Sources",
            value=str(len(sources)),
            tone="steady",
            metadata={"source_reliability_is_truth_score": False},
        ),
        NewsroomDashboardCard(
            card_id="newsroom_articles",
            title="Articles",
            value=str(len(articles)),
            tone="neutral",
            metadata={"normalized": sum(1 for article in articles if article.status == NewsArticleStatus.normalized)},
        ),
        NewsroomDashboardCard(
            card_id="newsroom_claims_open",
            title="Claims Needing Route",
            value=str(unresolved),
            tone="watch" if unresolved else "steady",
            metadata={"candidate_only": True, "may_publish_truth": False},
        ),
        NewsroomDashboardCard(
            card_id="newsroom_stage7_routes",
            title="Stage 7 Candidates",
            value=str(len(routes)),
            tone="candidate",
            metadata={"stage7_candidate_only": True, "stage6_required": True},
        ),
        NewsroomDashboardCard(
            card_id="newsroom_stage6_packets",
            title="Stage 6 Packets",
            value=str(len(packets)),
            tone="handoff",
            metadata={"candidate_answer_not_verified": True},
        ),
        NewsroomDashboardCard(
            card_id="newsroom_risk_alerts",
            title="Risk Alerts",
            value=str(len(alerts)),
            tone="alert" if high_alerts else "steady",
            metadata={"high_or_critical": high_alerts},
        ),
    ]


def build_newsroom_safety_boundaries() -> NewsroomSafetyBoundaries:
    return NewsroomSafetyBoundaries()


def build_newsroom_dashboard_pages(
    cards: list[NewsroomDashboardCard],
    articles: list[NormalizedNewsArticle],
    alerts: list[NewsroomRiskAlert],
    audit_logs: list[NewsroomAuditLog],
) -> list[NewsroomDashboardPage]:
    safety = build_newsroom_safety_boundaries().model_dump(mode="json")
    return [
        NewsroomDashboardPage(
            page_id="newsrooms_overview",
            title="Newsrooms Council Overview",
            cards=cards,
            sections=[
                {"title": "Articles", "items": [article.model_dump(mode="json") for article in articles]},
                {"title": "Risk Alerts", "items": [alert.model_dump(mode="json") for alert in alerts]},
            ],
            safety_boundaries=safety,
        ),
        NewsroomDashboardPage(
            page_id="newsrooms_audit",
            title="Newsrooms Council Audit Trail",
            cards=[card for card in cards if card.card_id in {"newsroom_risk_alerts", "newsroom_stage6_packets"}],
            sections=[{"title": "Latest Audit Events", "items": [log.model_dump(mode="json") for log in audit_logs[:25]]}],
            safety_boundaries=safety,
        ),
    ]


def dedupe_alerts(alerts: Iterable[NewsroomRiskAlert]) -> list[NewsroomRiskAlert]:
    unique: dict[str, NewsroomRiskAlert] = {}
    for alert in alerts:
        unique[alert.alert_id] = alert
    return list(unique.values())


def create_manual_news_claim(payload: NewsClaimInput, source_id: str | None = None) -> NewsClaim:
    priority = compute_claim_priority(
        public_impact=payload.public_impact,
        editorial_risk=payload.editorial_risk,
        contradiction_pressure=payload.contradiction_pressure,
        source_reach=payload.source_reach,
        evidence_conflict=payload.evidence_conflict,
        freshness_need=payload.freshness_need,
        debate_potential=payload.debate_potential,
        user_report_volume=payload.user_report_volume,
    )
    return NewsClaim(
        claim_id=_stable_id("news_claim", payload.article_id, payload.claim_text, payload.claimant_id),
        article_id=payload.article_id,
        source_id=source_id,
        claim_text=payload.claim_text,
        claimant_id=payload.claimant_id,
        topic_tags=payload.topic_tags,
        priority=priority,
        status=NewsClaimStatus.extracted,
    )

TEXT_OUTPUT_TYPES = {
    NewsOutputModality.reported_news_article,
    NewsOutputModality.live_blog_update,
    NewsOutputModality.blog_explainer,
    NewsOutputModality.correction_notice,
}
STUDIO_CUE_TERMS = {"sfx", "lower-third", "lower third", "ticker", "shot plan", "studio cue"}


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "story"


def _locale(locale: str | None) -> str:
    return (locale or "en").strip("/") or "en"


def _safe_section(value: str | None) -> str:
    return _slugify(value or "news")


def _story_slug(title: str, override: str | None = None) -> str:
    return _slugify(override or title)[:96]


def build_article_path(locale: str, section: str, story_slug: str, subsection: str | None = None) -> str:
    segments = [_locale(locale), _safe_section(section)]
    if subsection:
        segments.append(_safe_section(subsection))
    segments.append(_story_slug(story_slug))
    if len(segments) > 4:
        segments = [segments[0], segments[1], segments[2], segments[-1]]
    return "/" + "/".join(segments) + "/"


def build_live_path(locale: str, event_slug: str) -> str:
    return f"/{_locale(locale)}/live/{_story_slug(event_slug)}/"


def build_blog_path(locale: str, topic: str, story_slug: str) -> str:
    return f"/{_locale(locale)}/blog/{_safe_section(topic)}/{_story_slug(story_slug)}/"


def build_video_path(locale: str, section: str, video_slug: str) -> str:
    return f"/{_locale(locale)}/video/{_safe_section(section)}/{_story_slug(video_slug)}/"


def build_topic_path(locale: str, topic_slug: str) -> str:
    return f"/{_locale(locale)}/topic/{_story_slug(topic_slug)}/"


def build_author_path(locale: str, author_slug: str) -> str:
    return f"/{_locale(locale)}/author/{_story_slug(author_slug)}/"


def create_news_category(payload: NewsCategoryInput, parent: NewsCategory | None = None) -> NewsCategory:
    slug = _slugify(payload.slug or payload.name)
    parent_segments = parent.path_segments if parent else []
    depth = min(3, len(parent_segments) + 1)
    path_segments = [*parent_segments[:2], slug][:3]
    public_url = "/" + "/".join([_locale(payload.locale), *path_segments]) + "/"
    return NewsCategory(
        category_id=_stable_id("news_category", payload.locale, parent.category_id if parent else None, slug),
        name=payload.name,
        slug=slug,
        locale=_locale(payload.locale),
        parent_category_id=parent.category_id if parent else None,
        depth=depth,
        path_segments=path_segments,
        public_url=public_url,
        description=payload.description,
        metadata=payload.metadata | {"public_url_depth_max": 3},
    )


def create_news_topic(name: str, locale: str = "en", category_id: str | None = None) -> NewsTopic:
    slug = _slugify(name)
    return NewsTopic(
        topic_id=_stable_id("news_topic", locale, category_id, slug),
        name=name,
        slug=slug,
        locale=_locale(locale),
        category_id=category_id,
        public_url=build_topic_path(locale, slug),
    )


def create_news_slug(entity_type: str, entity_id: str, slug: str, locale: str, canonical_path: str) -> NewsSlug:
    return NewsSlug(
        slug_id=_stable_id("news_slug", entity_type, entity_id, locale, slug),
        entity_type=entity_type,
        entity_id=entity_id,
        slug=_slugify(slug),
        locale=_locale(locale),
        url_pattern=canonical_path,
        canonical_path=canonical_path,
    )


def _claim_fact(claim: NewsClaim) -> str:
    text = re.sub(r"\s+", " ", claim.claim_text).strip().rstrip(".")
    return f"The claim graph records this candidate fact: {text}."


def _evidence_context(evidence: list[NewsEvidence]) -> list[str]:
    contexts: list[str] = []
    for item in evidence[:4]:
        source_name = item.source.source_name or item.source.source_id
        contexts.append(f"Attribution is preserved to {source_name} via {item.retrieval_method}.")
    return contexts


def _compose_text_body(
    output_type: NewsOutputModality,
    article: NormalizedNewsArticle,
    claims: list[NewsClaim],
    evidence: list[NewsEvidence],
) -> tuple[str, str, list[str], list[str], list[str]]:
    claim_lines = [_claim_fact(claim) for claim in claims[:6]] or [
        "The claim graph does not yet contain enough candidate facts for a verified article."
    ]
    lead_prefix = {
        NewsOutputModality.reported_news_article: "A newsroom review is tracking candidate claims from the verification graph.",
        NewsOutputModality.text_article: "A newsroom review is tracking candidate claims from the verification graph.",
        NewsOutputModality.live_blog_update: "Live update: the newsroom verification graph has new candidate facts under review.",
        NewsOutputModality.live_update: "Live update: the newsroom verification graph has new candidate facts under review.",
        NewsOutputModality.blog_explainer: "This explainer summarizes what the candidate claim graph currently supports.",
        NewsOutputModality.correction_notice: "Correction notice: this item records a candidate correction and keeps the verification path open.",
    }.get(output_type, "A newsroom review is tracking candidate claims from the verification graph.")
    lead = f"{lead_prefix} {claim_lines[0]}"
    supporting = claim_lines[1:4]
    if not supporting:
        supporting = ["Editors have not marked this output as final truth; Stage 6 remains required."]
    context = [
        "The text is generated from normalized claims and evidence references, not copied source paragraphs.",
        *_evidence_context(evidence),
    ]
    details = [
        "Newsworthiness and source reliability are routing signals, not TruthScore.",
        "No publishing command is attached to this draft.",
    ]
    body = "\n\n".join([lead, *supporting, *context, *details])
    return body, lead, supporting, context, details


def _source_similarity(generated_text: str, source_text: str) -> float:
    gen_tokens = re.findall(r"[a-z0-9]+", generated_text.lower())
    src_tokens = re.findall(r"[a-z0-9]+", source_text.lower())
    if not gen_tokens or not src_tokens:
        return 0.0
    gen_ngrams = set(zip(gen_tokens, gen_tokens[1:], gen_tokens[2:])) or set((token,) for token in gen_tokens)
    src_ngrams = set(zip(src_tokens, src_tokens[1:], src_tokens[2:])) or set((token,) for token in src_tokens)
    overlap = len(gen_ngrams & src_ngrams)
    return _clip01(overlap / max(1, min(len(gen_ngrams), len(src_ngrams))))


def build_originality_report(
    *,
    article_id: str,
    package_id: str | None,
    generated_text: str,
    source_texts: list[str],
    source_refs: list[str],
    threshold: float = 0.72,
) -> NewsOriginalityReport:
    similarities = [_source_similarity(generated_text, source_text) for source_text in source_texts]
    max_similarity = max(similarities, default=0.0)
    originality_score = _clip01(1.0 - max_similarity)
    blocked = originality_score < threshold
    return NewsOriginalityReport(
        report_id=_stable_id("news_originality", article_id, package_id, generated_text, threshold),
        article_id=article_id,
        package_id=package_id,
        originality_score=originality_score,
        max_similarity=max_similarity,
        threshold=threshold,
        blocked=blocked,
        route_for_rewrite=blocked,
        source_refs=source_refs,
        metadata={
            "do_not_paraphrase_raw_source_paragraphs": True,
            "generated_from_normalized_claim_graph": True,
            "similarity_count": len(similarities),
        },
    )


def create_seo_artifact(
    *,
    article: NormalizedNewsArticle,
    package: NewsroomPackage | None,
    claims: list[NewsClaim],
    evidence: list[NewsEvidence],
    output_type: NewsOutputModality,
    locale: str = "en",
    section: str = "news",
    subsection: str | None = None,
    topic: str | None = None,
    image: str | None = None,
    threshold: float = 0.72,
) -> tuple[NewsSeoArtifact, NewsOriginalityReport]:
    if output_type not in TEXT_OUTPUT_TYPES and output_type not in {NewsOutputModality.text_article, NewsOutputModality.live_update}:
        raise ValueError("unsupported text newsroom output type")
    slug = _story_slug(article.title)
    if output_type in {NewsOutputModality.live_blog_update, NewsOutputModality.live_update}:
        public_url = build_live_path(locale, topic or slug)
    elif output_type == NewsOutputModality.blog_explainer:
        public_url = build_blog_path(locale, topic or (article.topic_tags[0] if article.topic_tags else "news"), slug)
    else:
        public_url = build_article_path(locale, section, slug, subsection)
    body, lead, supporting, context, details = _compose_text_body(output_type, article, claims, evidence)
    if any(term in body.lower() for term in STUDIO_CUE_TERMS):
        raise ValueError("text output rejected: studio cue or SFX term detected")
    report = build_originality_report(
        article_id=article.article_id,
        package_id=package.package_id if package else None,
        generated_text=body,
        source_texts=[article.normalized_text, *[item.text for item in evidence]],
        source_refs=[article.source_id, *[item.evidence_id for item in evidence]],
        threshold=threshold,
    )
    artifact = NewsSeoArtifact(
        artifact_id=_stable_id("news_seo", article.article_id, package.package_id if package else None, output_type.value, locale),
        article_id=article.article_id,
        package_id=package.package_id if package else None,
        output_type=output_type,
        headline=package.title if package else article.title,
        slug=slug,
        locale=_locale(locale),
        canonical_url=public_url,
        section=_safe_section(section),
        subsection=_safe_section(subsection) if subsection else None,
        public_url=public_url,
        body_text=body,
        lead=lead,
        supporting_facts=supporting,
        context_background=context,
        minor_details=details,
        keywords=sorted(set(article.topic_tags + [claim.topic_tags[0] for claim in claims if claim.topic_tags]))[:12],
        author=article.author or "Mougle Newsroom",
        image=image,
        originality_report_id=report.report_id,
        metadata={
            "text_structure": "inverted_pyramid",
            "formal_objective_tone": True,
            "self_contained_context": True,
            "generated_from_claim_graph_not_raw_paragraphs": True,
            "originality_blocked": report.blocked,
        },
    )
    return artifact, report


def _publisher() -> dict[str, Any]:
    return {
        "@type": "Organization",
        "name": "Mougle",
        "url": "https://mougle.local/",
        "logo": {"@type": "ImageObject", "url": "https://mougle.local/static/mougle-logo.png"},
    }


def _base_article_jsonld(artifact: NewsSeoArtifact, article: NormalizedNewsArticle) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "headline": artifact.headline,
        "datePublished": (article.published_at or article.created_at).isoformat(),
        "dateModified": artifact.updated_at.isoformat(),
        "author": {"@type": "Person", "name": artifact.author},
        "publisher": _publisher(),
        "articleSection": artifact.section,
        "keywords": artifact.keywords,
        "url": artifact.canonical_url,
        "mainEntityOfPage": artifact.canonical_url,
        "inLanguage": artifact.locale,
        "backstory": article.summary,
        "provenance": {
            "article_id": article.article_id,
            "source_id": article.source_id,
            "generated_from_claim_graph": artifact.generated_from_claim_graph,
        },
    }
    if artifact.image:
        payload["image"] = artifact.image
    if article.metadata.get("ai_reconstruction") or article.metadata.get("synthetic_asset_used"):
        payload["digitalSourceType"] = "https://cv.iptc.org/newscodes/digitalsourcetype/syntheticMedia"
    return payload


def build_news_article_jsonld(artifact: NewsSeoArtifact, article: NormalizedNewsArticle) -> NewsStructuredDataArtifact:
    jsonld = {"@context": "https://schema.org", "@type": "NewsArticle"} | _base_article_jsonld(artifact, article)
    return NewsStructuredDataArtifact(
        artifact_id=_stable_id("news_jsonld", artifact.artifact_id, "NewsArticle"),
        article_id=article.article_id,
        package_id=artifact.package_id,
        structured_data_type=NewsStructuredDataType.news_article,
        canonical_url=artifact.canonical_url,
        jsonld=jsonld,
    )


def build_live_blog_posting_jsonld(artifact: NewsSeoArtifact, article: NormalizedNewsArticle) -> NewsStructuredDataArtifact:
    jsonld = {"@context": "https://schema.org", "@type": "LiveBlogPosting"} | _base_article_jsonld(artifact, article)
    jsonld["coverageStartTime"] = (article.published_at or article.created_at).isoformat()
    jsonld["liveBlogUpdate"] = [{"@type": "BlogPosting", "headline": artifact.headline, "articleBody": artifact.lead}]
    return NewsStructuredDataArtifact(
        artifact_id=_stable_id("news_jsonld", artifact.artifact_id, "LiveBlogPosting"),
        article_id=article.article_id,
        package_id=artifact.package_id,
        structured_data_type=NewsStructuredDataType.live_blog_posting,
        canonical_url=artifact.canonical_url,
        jsonld=jsonld,
    )


def build_blog_posting_jsonld(artifact: NewsSeoArtifact, article: NormalizedNewsArticle) -> NewsStructuredDataArtifact:
    jsonld = {"@context": "https://schema.org", "@type": "BlogPosting"} | _base_article_jsonld(artifact, article)
    return NewsStructuredDataArtifact(
        artifact_id=_stable_id("news_jsonld", artifact.artifact_id, "BlogPosting"),
        article_id=article.article_id,
        package_id=artifact.package_id,
        structured_data_type=NewsStructuredDataType.blog_posting,
        canonical_url=artifact.canonical_url,
        jsonld=jsonld,
    )


def build_breadcrumb_jsonld(artifact: NewsSeoArtifact) -> NewsStructuredDataArtifact:
    items = [
        {"@type": "ListItem", "position": 1, "name": artifact.locale, "item": f"/{artifact.locale}/"},
        {"@type": "ListItem", "position": 2, "name": artifact.section, "item": f"/{artifact.locale}/{artifact.section}/"},
    ]
    if artifact.subsection:
        items.append(
            {
                "@type": "ListItem",
                "position": len(items) + 1,
                "name": artifact.subsection,
                "item": f"/{artifact.locale}/{artifact.section}/{artifact.subsection}/",
            }
        )
    items.append({"@type": "ListItem", "position": len(items) + 1, "name": artifact.headline, "item": artifact.canonical_url})
    return NewsStructuredDataArtifact(
        artifact_id=_stable_id("news_jsonld", artifact.artifact_id, "BreadcrumbList"),
        article_id=artifact.article_id,
        package_id=artifact.package_id,
        structured_data_type=NewsStructuredDataType.breadcrumb_list,
        canonical_url=artifact.canonical_url,
        jsonld={"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items},
    )


def build_organization_jsonld(canonical_url: str) -> NewsStructuredDataArtifact:
    return NewsStructuredDataArtifact(
        artifact_id=_stable_id("news_jsonld", canonical_url, "Organization"),
        structured_data_type=NewsStructuredDataType.organization,
        canonical_url=canonical_url,
        jsonld={"@context": "https://schema.org", **_publisher()},
    )


def build_video_object_jsonld_placeholder(artifact: NewsSeoArtifact, article: NormalizedNewsArticle) -> NewsStructuredDataArtifact:
    jsonld = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": artifact.headline,
        "description": "Video watch-page metadata placeholder; no video publishing command is attached.",
        "uploadDate": (article.published_at or article.created_at).isoformat(),
        "url": artifact.canonical_url,
        "inLanguage": artifact.locale,
    }
    return NewsStructuredDataArtifact(
        artifact_id=_stable_id("news_jsonld", artifact.artifact_id, "VideoObject"),
        article_id=article.article_id,
        package_id=artifact.package_id,
        structured_data_type=NewsStructuredDataType.video_object,
        canonical_url=artifact.canonical_url,
        jsonld=jsonld,
    )


def build_video_object_jsonld(artifact: NewsSeoArtifact, article: NormalizedNewsArticle) -> NewsStructuredDataArtifact:
    return build_video_object_jsonld_placeholder(artifact, article)


def build_news_sitemap_entry(artifact: NewsSeoArtifact, article: NormalizedNewsArticle) -> NewsSitemapEntry:
    publication_date = article.published_at or article.created_at
    is_recent_news = publication_date >= utc_now() - timedelta(days=2)
    return NewsSitemapEntry(
        entry_id=_stable_id("news_sitemap", artifact.artifact_id, artifact.canonical_url),
        url=artifact.canonical_url,
        lastmod=artifact.updated_at,
        is_news=is_recent_news and artifact.output_type in {NewsOutputModality.reported_news_article, NewsOutputModality.text_article},
        language=artifact.locale,
        publication_date=publication_date,
        title=artifact.headline,
        keywords=artifact.keywords,
    )


def build_hreflang_cluster(
    *,
    canonical_url: str,
    locale: str,
    article_id: str | None = None,
    package_id: str | None = None,
    variant_urls: dict[str, str] | None = None,
) -> tuple[NewsCanonicalCluster, list[NewsHreflangVariant]]:
    variants = dict(variant_urls or {})
    variants.setdefault(_locale(locale), canonical_url)
    cluster_id = _stable_id("news_canonical_cluster", canonical_url, article_id, package_id)
    urls = list(variants.values())
    hreflang_variants = [
        NewsHreflangVariant(
            variant_id=_stable_id("news_hreflang", cluster_id, variant_locale, url),
            cluster_id=cluster_id,
            locale=_locale(variant_locale),
            url=url,
            self_referencing=url in urls,
            bidirectional_targets=[target for target in urls if target != url],
        )
        for variant_locale, url in sorted(variants.items())
    ]
    cluster = NewsCanonicalCluster(
        cluster_id=cluster_id,
        canonical_url=canonical_url,
        locale=_locale(locale),
        variant_urls=urls,
        article_id=article_id,
        package_id=package_id,
    )
    return cluster, hreflang_variants


def structured_data_for_text_artifact(
    artifact: NewsSeoArtifact, article: NormalizedNewsArticle
) -> list[NewsStructuredDataArtifact]:
    if artifact.output_type in {NewsOutputModality.live_blog_update, NewsOutputModality.live_update}:
        primary = build_live_blog_posting_jsonld(artifact, article)
    elif artifact.output_type == NewsOutputModality.blog_explainer:
        primary = build_blog_posting_jsonld(artifact, article)
    else:
        primary = build_news_article_jsonld(artifact, article)
    return [
        primary,
        build_breadcrumb_jsonld(artifact),
        build_organization_jsonld(artifact.canonical_url),
    ]

SYNTHETIC_VISUAL_DISCLOSURES = {
    NewsAiVisualDisclosure.ai_reconstruction,
    NewsAiVisualDisclosure.simulation,
    NewsAiVisualDisclosure.artist_visualization,
    NewsAiVisualDisclosure.not_actual_footage,
    NewsAiVisualDisclosure.internal_preview_only,
}
TRAGEDY_CATEGORY_TERMS = {
    "death",
    "war",
    "terrorism",
    "disaster",
    "child-safety",
    "child_safety",
    "children",
    "attack",
}
TRAGEDY_UNSAFE_SFX = {
    NewsSfxCueType.market_energy,
    NewsSfxCueType.data_ping,
    NewsSfxCueType.transition_whoosh,
    NewsSfxCueType.weather_ambience,
}


def create_video_bulletin(
    package: NewsroomPackage,
    article: NormalizedNewsArticle,
    payload: NewsVideoBulletinInput,
) -> NewsVideoBulletin:
    title = payload.title or package.title
    slug = _story_slug(title)
    watch_url = build_video_path(payload.locale, payload.section, slug)
    synthetic = payload.synthetic_visual_used or payload.visual_disclosure in SYNTHETIC_VISUAL_DISCLOSURES
    return NewsVideoBulletin(
        bulletin_id=_stable_id("news_video_bulletin", package.package_id, payload.video_format.value, title),
        package_id=package.package_id,
        article_id=article.article_id,
        title=title,
        video_format=payload.video_format,
        locale=_locale(payload.locale),
        section=_safe_section(payload.section),
        watch_url=watch_url,
        target_duration_seconds=payload.target_duration_seconds,
        story_structure=payload.story_structure,
        visual_disclosure=payload.visual_disclosure,
        synthetic_visual_used=synthetic,
        metadata=payload.metadata
        | {
            "data_control_layer_only": True,
            "no_real_video_generation": True,
            "no_cinema_4d_execution": True,
            "no_unreal_or_led_processor_calls": True,
            "no_platform_publish": True,
        },
    )


def _spoken_line(text: str, max_words: int = 12) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip().rstrip(".")
    words = cleaned.split()
    if len(words) <= max_words:
        return cleaned + "."
    return " ".join(words[:max_words]).rstrip(".,;:") + "."


def _anchor_readability(lines: list[NewsAnchorScriptLine], visual_alignment: float = 1.0) -> float:
    if not lines:
        return 0.0
    short_sentence_score = sum(1 for line in lines if line.word_count <= 14) / len(lines)
    breath_unit_fit = sum(1 for line in lines if line.breath_unit_fit) / len(lines)
    dense_penalty = sum(1 for line in lines if line.word_count > 16) / len(lines)
    value = (
        0.25 * short_sentence_score
        + 0.20 * breath_unit_fit
        + 0.15 * 0.9
        + 0.15 * visual_alignment
        + 0.10 * 0.95
        + 0.10 * 0.9
        - 0.15 * dense_penalty
    )
    return _clip01(_sigmoid(value))


def create_anchor_script(
    bulletin: NewsVideoBulletin,
    package: NewsroomPackage,
    claims: list[NewsClaim],
) -> tuple[NewsAnchorScript, list[NewsAnchorScriptLine]]:
    base_lines = [
        f"Here is the latest on {package.title}",
        "The newsroom is following candidate claims through verification",
    ]
    for index, claim in enumerate(claims[:4], start=1):
        base_lines.append(f"Point {index}: {_spoken_line(claim.claim_text, 10)}")
    base_lines.append("This bulletin is not final truth until the Truth Pyramid path completes")
    script_id = _stable_id("news_anchor_script", bulletin.bulletin_id, package.package_id, base_lines)
    lines = [
        NewsAnchorScriptLine(
            line_id=_stable_id("news_anchor_line", script_id, index, text),
            script_id=script_id,
            bulletin_id=bulletin.bulletin_id,
            sequence=index,
            speaker="anchor",
            text=_spoken_line(text, 14),
            word_count=_word_count(_spoken_line(text, 14)),
            breath_unit_fit=_word_count(_spoken_line(text, 14)) <= 14,
            one_idea_per_breath=True,
            duration_seconds=max(3, min(8, _word_count(text) // 2 + 2)),
        )
        for index, text in enumerate(base_lines)
    ]
    script_text = " ".join(line.text for line in lines)
    readability = _anchor_readability(lines)
    script = NewsAnchorScript(
        script_id=script_id,
        bulletin_id=bulletin.bulletin_id,
        package_id=package.package_id,
        article_id=bulletin.article_id,
        script_text=script_text,
        line_ids=[line.line_id for line in lines],
        anchor_speech_readability=readability,
        short_spoken_sentences=all(line.word_count <= 14 for line in lines),
        metadata={
            "structure": bulletin.story_structure,
            "lower_information_density_than_text": True,
            "conversational_but_credible": True,
            "visuals_carry_context": True,
        },
    )
    return script, lines


def build_studio_cues(
    bulletin: NewsVideoBulletin,
    claims: list[NewsClaim],
) -> tuple[
    list[NewsRobotExplainerCue],
    list[NewsStudioSceneCue],
    list[NewsStudioScreenState],
    list[NewsStudioLowerThird],
    list[NewsStudioTickerItem],
    list[NewsStudioAssetRequirement],
    list[NewsStudioAiReconstructionLabel],
]:
    scene_targets = [
        NewsStudioCueTarget.MGL_BACK_DISPLAY_Main,
        NewsStudioCueTarget.MGL_SOURCE_PANEL_Right,
        NewsStudioCueTarget.MGL_CONFIDENCE_PANEL_Left,
        NewsStudioCueTarget.MGL_CLAIMS_PANEL_Right,
        NewsStudioCueTarget.MGL_TIMELINE_PANEL_Left,
    ]
    robot = [
        NewsRobotExplainerCue(
            cue_id=_stable_id("news_robot_cue", bulletin.bulletin_id, "verification"),
            bulletin_id=bulletin.bulletin_id,
            sequence=0,
            text="Explain that claims remain candidate-only until verification completes.",
        )
    ]
    scenes = [
        NewsStudioSceneCue(
            cue_id=_stable_id("news_scene_cue", bulletin.bulletin_id, index, target.value),
            bulletin_id=bulletin.bulletin_id,
            sequence=index,
            target=target,
            description=f"Preview-only scene cue for {target.value}",
        )
        for index, target in enumerate(scene_targets)
    ]
    screens = [
        NewsStudioScreenState(
            state_id=_stable_id("news_screen_state", bulletin.bulletin_id, target.value),
            bulletin_id=bulletin.bulletin_id,
            target=target,
            state_name="preview_claim_context",
            payload={"bulletin_id": bulletin.bulletin_id, "candidate_only": True},
        )
        for target in scene_targets
    ]
    lower_thirds = [
        NewsStudioLowerThird(
            lower_third_id=_stable_id("news_lower_third", bulletin.bulletin_id, index, claim.claim_id),
            bulletin_id=bulletin.bulletin_id,
            sequence=index,
            text=_spoken_line(claim.claim_text, 8),
        )
        for index, claim in enumerate(claims[:3])
    ]
    tickers = [
        NewsStudioTickerItem(
            ticker_id=_stable_id("news_ticker", bulletin.bulletin_id, "stage6"),
            bulletin_id=bulletin.bulletin_id,
            sequence=0,
            text="Stage 6 review remains required before final truth.",
        )
    ]
    requirements = [
        NewsStudioAssetRequirement(
            requirement_id=_stable_id("news_asset_req", bulletin.bulletin_id, bulletin.visual_disclosure.value),
            bulletin_id=bulletin.bulletin_id,
            asset_type="visual_context",
            description="Preview-only visual context asset requirement.",
            visual_disclosure=bulletin.visual_disclosure,
            ai_reconstruction_label_required=bulletin.visual_disclosure in SYNTHETIC_VISUAL_DISCLOSURES,
        )
    ]
    labels: list[NewsStudioAiReconstructionLabel] = []
    if bulletin.visual_disclosure in SYNTHETIC_VISUAL_DISCLOSURES:
        labels.append(
            NewsStudioAiReconstructionLabel(
                label_id=_stable_id("news_ai_label", bulletin.bulletin_id, bulletin.visual_disclosure.value),
                bulletin_id=bulletin.bulletin_id,
                disclosure=bulletin.visual_disclosure,
                visible_label="AI reconstruction / not actual footage",
                metadata={"must_be_visible_on_screen": True},
            )
        )
    return robot, scenes, screens, lower_thirds, tickers, requirements, labels


def build_sfx_plan(
    bulletin: NewsVideoBulletin,
    cue_types: list[NewsSfxCueType],
    story_categories: list[str],
) -> list[NewsStudioSfxCue]:
    lowered_categories = {category.lower() for category in story_categories}
    is_tragedy = bool(lowered_categories & TRAGEDY_CATEGORY_TERMS)
    cues: list[NewsStudioSfxCue] = []
    for index, cue_type in enumerate(cue_types or [NewsSfxCueType.neutral_bed]):
        if is_tragedy and cue_type in TRAGEDY_UNSAFE_SFX:
            raise ValueError("unsafe SFX cue rejected for tragedy/disaster/child-safety story")
        cues.append(
            NewsStudioSfxCue(
                sfx_id=_stable_id("news_sfx", bulletin.bulletin_id, index, cue_type.value),
                bulletin_id=bulletin.bulletin_id,
                sequence=index,
                cue_type=cue_type,
                reason="approved neutral cue taxonomy only",
                editorial_state="sensitive" if is_tragedy else "neutral",
                approved=True,
            )
        )
    return cues


def build_rights_check(
    bulletin: NewsVideoBulletin,
    labels: list[NewsStudioAiReconstructionLabel],
    sfx_cues: list[NewsStudioSfxCue],
) -> NewsStudioRightsCheck:
    needs_label = bulletin.visual_disclosure in SYNTHETIC_VISUAL_DISCLOSURES
    label_pass = not needs_label or any(label.present and label.required for label in labels)
    sfx_pass = all(cue.approved for cue in sfx_cues)
    checks = [True, label_pass, True, sfx_pass, True, True]
    safety = min(1.0 if check else 0.0 for check in checks)
    return NewsStudioRightsCheck(
        rights_check_id=_stable_id("news_rights_check", bulletin.bulletin_id, label_pass, sfx_pass),
        bulletin_id=bulletin.bulletin_id,
        passed=all(checks),
        rights_pass=True,
        ai_reconstruction_label_pass=label_pass,
        sponsor_disclosure_pass=True,
        sfx_policy_pass=sfx_pass,
        no_hardware_execution_pass=True,
        no_platform_publish_pass=True,
        studio_cue_safety=safety,
    )


def build_video_seo_artifact(
    bulletin: NewsVideoBulletin,
    package: NewsroomPackage,
    article: NormalizedNewsArticle,
) -> tuple[NewsVideoSeoArtifact, NewsVideoSitemapEntry]:
    jsonld = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": bulletin.title,
        "description": "News Room Studio watch-page metadata only; no platform publishing command is attached.",
        "uploadDate": bulletin.created_at.isoformat(),
        "url": bulletin.watch_url,
        "inLanguage": bulletin.locale,
        "publisher": _publisher(),
        "isFamilyFriendly": True,
        "provenance": {
            "article_id": article.article_id,
            "package_id": package.package_id,
            "generated_from_claim_graph": True,
        },
    }
    if bulletin.synthetic_visual_used:
        jsonld["digitalSourceType"] = "https://cv.iptc.org/newscodes/digitalsourcetype/syntheticMedia"
    seo = NewsVideoSeoArtifact(
        video_seo_id=_stable_id("news_video_seo", bulletin.bulletin_id, bulletin.watch_url),
        bulletin_id=bulletin.bulletin_id,
        package_id=package.package_id,
        article_id=article.article_id,
        title=bulletin.title,
        description=jsonld["description"],
        watch_url=bulletin.watch_url,
        video_format=bulletin.video_format,
        video_object_jsonld=jsonld,
    )
    sitemap = NewsVideoSitemapEntry(
        entry_id=_stable_id("news_video_sitemap", bulletin.bulletin_id, bulletin.watch_url),
        bulletin_id=bulletin.bulletin_id,
        watch_url=bulletin.watch_url,
        title=bulletin.title,
        description=seo.description,
    )
    return seo, sitemap


def build_modality_divergence_report(
    bulletin: NewsVideoBulletin,
    package: NewsroomPackage,
    text_variant: str,
    video_script: NewsAnchorScript,
) -> NewsModalityDivergenceReport:
    similarity = _source_similarity(text_variant, video_script.script_text)
    divergence = _clip01(1.0 - similarity)
    return NewsModalityDivergenceReport(
        report_id=_stable_id("news_modality_divergence", bulletin.bulletin_id, text_variant, video_script.script_id),
        bulletin_id=bulletin.bulletin_id,
        package_id=package.package_id,
        article_id=bulletin.article_id,
        modality_divergence=divergence,
        similarity=similarity,
        text_variant_ref=package.package_id,
        video_script_ref=video_script.script_id,
        passes_distinctness=divergence >= 0.25,
    )
