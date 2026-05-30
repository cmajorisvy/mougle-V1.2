"""Podcast Forum Debate Council MVP.

This module keeps podcast debate activity local and deterministic. It can create
rooms, collect debate artifacts, and package claims for Stage 7/Stage 6, but it
never declares final truth and never writes directly to Stage 4 or Stage 1.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from typing import Any

from app.models import (
    EvidenceSource,
    PodcastAgentInvitation,
    PodcastAgentInvitationInput,
    PodcastClaimReview,
    PodcastClaimReviewInput,
    PodcastClaimReviewVerdict,
    PodcastClaimStatus,
    PodcastCouncilAuditLog,
    PodcastCouncilDashboardCard,
    PodcastCouncilDashboardPage,
    PodcastDebateClaim,
    PodcastDebateClaimInput,
    PodcastDebateTurn,
    PodcastDebateTurnInput,
    PodcastEvidenceSubmission,
    PodcastEvidenceSubmissionInput,
    PodcastExpertCall,
    PodcastExpertCallInput,
    PodcastInvitationStatus,
    PodcastParticipant,
    PodcastParticipantInput,
    PodcastParticipantRole,
    PodcastRiskSeverity,
    PodcastRoom,
    PodcastRoomInput,
    PodcastRoomReputationMetadata,
    PodcastRoomRiskAlert,
    PodcastSession,
    PodcastSessionInput,
    PodcastStage6SubmissionPacket,
    PodcastStage7CandidateRoute,
    Stage7ExternalRecord,
    Stage7ExternalRecordInput,
    Stage7RecordStatus,
    Stage7SubmissionPackage,
    Stage7Tank,
    utc_now,
)

BLOCKED_DIRECT_TARGETS = {
    "stage_1",
    "truth_crown",
    "stage_4",
    "knowledge_of_purity",
    "knowledge_of_purity_and_wisdom",
}


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _stable_id(prefix: str, *parts: object) -> str:
    body = ":".join(json.dumps(part, sort_keys=True, default=str) for part in parts)
    digest = hashlib.sha1(body.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def write_audit_log(
    action: str,
    *,
    room_id: str | None = None,
    session_id: str | None = None,
    claim_id: str | None = None,
    actor_id: str = "system",
    metadata: dict[str, Any] | None = None,
) -> PodcastCouncilAuditLog:
    metadata = metadata or {}
    return PodcastCouncilAuditLog(
        audit_id=_stable_id("podcast_audit", action, room_id, session_id, claim_id, actor_id, metadata),
        action=action,
        room_id=room_id,
        session_id=session_id,
        claim_id=claim_id,
        actor_id=actor_id,
        metadata=metadata,
    )


def create_room(payload: PodcastRoomInput) -> PodcastRoom:
    room_id = _stable_id("podcast_room", payload.title, payload.topic, payload.host_user_id)
    metadata = PodcastRoomReputationMetadata(
        reputation_score=payload.starting_reputation,
        reputation_band="trusted" if payload.starting_reputation >= 0.75 else "emerging",
    )
    return PodcastRoom(
        room_id=room_id,
        title=payload.title,
        topic=payload.topic,
        host_user_id=payload.host_user_id,
        description=payload.description,
        visibility=payload.visibility,
        topic_tags=payload.topic_tags,
        reputation_metadata=metadata,
    )


def create_session(room: PodcastRoom, payload: PodcastSessionInput) -> PodcastSession:
    return PodcastSession(
        session_id=_stable_id("podcast_session", room.room_id, payload.title, payload.created_by),
        room_id=room.room_id,
        title=payload.title,
        objective=payload.objective,
        created_by=payload.created_by,
        scheduled_for=payload.scheduled_for,
    )


def add_participant(room: PodcastRoom, payload: PodcastParticipantInput) -> PodcastParticipant:
    return PodcastParticipant(
        participant_entry_id=_stable_id(
            "podcast_participant",
            room.room_id,
            payload.participant_id,
            payload.role.value,
        ),
        room_id=room.room_id,
        participant_id=payload.participant_id,
        display_name=payload.display_name,
        role=payload.role,
        expertise_tags=payload.expertise_tags,
        reputation_score=payload.reputation_score,
        local_readiness=payload.local_readiness,
        invited_by=payload.invited_by,
    )


def create_expert_call(room: PodcastRoom, payload: PodcastExpertCallInput) -> PodcastExpertCall:
    return PodcastExpertCall(
        call_id=_stable_id("podcast_expert_call", room.room_id, payload.topic, payload.requested_by),
        room_id=room.room_id,
        topic=payload.topic,
        expertise_required=payload.expertise_required,
        claim_scope=payload.claim_scope,
        min_reputation=payload.min_reputation,
        requested_by=payload.requested_by,
        deadline_at=payload.deadline_at,
    )


def create_agent_invitation(
    room: PodcastRoom, payload: PodcastAgentInvitationInput
) -> PodcastAgentInvitation:
    target = (payload.target_stage or "").lower()
    blocked = target in BLOCKED_DIRECT_TARGETS
    return PodcastAgentInvitation(
        invitation_id=_stable_id(
            "podcast_agent_invite",
            room.room_id,
            payload.agent_id,
            payload.purpose,
            payload.target_session_id,
        ),
        room_id=room.room_id,
        agent_id=payload.agent_id,
        purpose=payload.purpose,
        requested_by=payload.requested_by,
        target_session_id=payload.target_session_id,
        local_readiness_required=payload.local_readiness_required,
        target_stage=payload.target_stage,
        status=PodcastInvitationStatus.blocked if blocked else PodcastInvitationStatus.pending,
        reason=(
            "direct Stage 4/Stage 1 target denied; agent may only assist local debate"
            if blocked
            else "agent invited for local debate support only"
        ),
    )


def create_turn(session: PodcastSession, payload: PodcastDebateTurnInput) -> PodcastDebateTurn:
    return PodcastDebateTurn(
        turn_id=_stable_id("podcast_turn", session.session_id, payload.speaker_id, payload.text),
        room_id=session.room_id,
        session_id=session.session_id,
        speaker_id=payload.speaker_id,
        text=payload.text,
        turn_type=payload.turn_type,
        cites_evidence_ids=payload.cites_evidence_ids,
        occurred_at=payload.occurred_at or utc_now(),
    )


def create_claim(session: PodcastSession, payload: PodcastDebateClaimInput) -> PodcastDebateClaim:
    return PodcastDebateClaim(
        claim_id=_stable_id("podcast_claim", session.session_id, payload.claim_text, payload.claimant_id),
        room_id=session.room_id,
        session_id=session.session_id,
        claim_text=payload.claim_text,
        claimant_id=payload.claimant_id,
        turn_id=payload.turn_id,
        topic_tags=payload.topic_tags,
        confidence_signal=payload.confidence_signal,
    )


def submit_evidence(
    claim: PodcastDebateClaim, payload: PodcastEvidenceSubmissionInput
) -> PodcastEvidenceSubmission:
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
    return PodcastEvidenceSubmission(
        evidence_id=_stable_id("podcast_evidence", claim.claim_id, payload.source_id, payload.text),
        claim_id=claim.claim_id,
        room_id=claim.room_id,
        session_id=claim.session_id,
        source=source,
        text=payload.text,
        submitted_by=payload.submitted_by,
        url_or_path=payload.url_or_path,
        quote=payload.quote,
        retrieval_method=payload.retrieval_method,
        no_fabricated_evidence_attestation=payload.no_fabricated_evidence_attestation,
    )


def review_claim(
    claim: PodcastDebateClaim, payload: PodcastClaimReviewInput
) -> tuple[PodcastClaimReview, PodcastDebateClaim]:
    review = PodcastClaimReview(
        review_id=_stable_id(
            "podcast_review",
            claim.claim_id,
            payload.reviewer_id,
            payload.verdict.value,
            payload.rationale,
        ),
        claim_id=claim.claim_id,
        room_id=claim.room_id,
        session_id=claim.session_id,
        reviewer_id=payload.reviewer_id,
        reviewer_role=payload.reviewer_role,
        verdict=payload.verdict,
        confidence=payload.confidence,
        rationale=payload.rationale,
    )
    if payload.verdict == PodcastClaimReviewVerdict.needs_evidence:
        claim.status = PodcastClaimStatus.needs_evidence
    elif payload.verdict in {PodcastClaimReviewVerdict.refute, PodcastClaimReviewVerdict.disputed}:
        claim.status = PodcastClaimStatus.disputed
    else:
        claim.status = PodcastClaimStatus.under_review
    claim.updated_at = utc_now()
    return review, claim


def build_stage7_input_for_claim(
    claim: PodcastDebateClaim,
    evidence: list[PodcastEvidenceSubmission],
    reviews: list[PodcastClaimReview],
) -> Stage7ExternalRecordInput:
    contradictions = sum(
        1
        for review in reviews
        if review.verdict in {PodcastClaimReviewVerdict.refute, PodcastClaimReviewVerdict.disputed}
    )
    support = sum(1 for review in reviews if review.verdict == PodcastClaimReviewVerdict.support)
    evidence_quality = _clip01(
        sum(item.source.reliability for item in evidence) / max(1, len(evidence))
    )
    confidence = _clip01(
        (claim.confidence_signal + evidence_quality + (support / max(1, len(reviews)))) / 3.0
    )
    if contradictions:
        tank = Stage7Tank.disputed_unknown
        status = Stage7RecordStatus.disputed
    elif evidence and support:
        tank = Stage7Tank.supported_data
        status = Stage7RecordStatus.candidate_supported
    else:
        tank = Stage7Tank.disputed_unknown
        status = Stage7RecordStatus.unresolved
    return Stage7ExternalRecordInput(
        claim_text=claim.claim_text,
        source_ref=f"podcast_claim:{claim.claim_id}",
        evidence_refs=[item.evidence_id for item in evidence],
        tank=tank,
        status=status,
        provider="podcast_forum_debate_council",
        model="deterministic-local-mvp",
        confidence=confidence,
        evidence_quality=evidence_quality,
        contradiction_count=contradictions,
        rationale="Podcast Council candidate route; Stage 6 required before truth",
        metadata={
            "room_id": claim.room_id,
            "session_id": claim.session_id,
            "claim_id": claim.claim_id,
            "review_ids": [review.review_id for review in reviews],
            "candidate_only": True,
            "may_publish_truth": False,
            "may_update_stage1": False,
            "may_update_stage4": False,
        },
    )


def build_stage7_route(
    claim: PodcastDebateClaim, record: Stage7ExternalRecord
) -> tuple[PodcastStage7CandidateRoute, PodcastDebateClaim]:
    route = PodcastStage7CandidateRoute(
        route_id=_stable_id("podcast_stage7_route", claim.claim_id, record.record_id),
        room_id=claim.room_id,
        session_id=claim.session_id,
        claim_id=claim.claim_id,
        stage7_record_id=record.record_id,
        payload={
            "claim_text": claim.claim_text,
            "stage7_tank": record.tank.value,
            "stage7_status": record.status.value,
            "candidate_only": True,
            "stage6_required": True,
        },
    )
    claim.stage7_record_id = record.record_id
    claim.status = PodcastClaimStatus.candidate_routed_stage7
    claim.updated_at = utc_now()
    return route, claim


def build_stage6_packet(
    claim: PodcastDebateClaim,
    route: PodcastStage7CandidateRoute,
    package: Stage7SubmissionPackage,
    evidence: list[PodcastEvidenceSubmission],
    reviews: list[PodcastClaimReview],
) -> tuple[PodcastStage6SubmissionPacket, PodcastDebateClaim]:
    packet = PodcastStage6SubmissionPacket(
        packet_id=_stable_id("podcast_stage6_packet", claim.claim_id, package.submission_id),
        room_id=claim.room_id,
        session_id=claim.session_id,
        claim_id=claim.claim_id,
        stage7_record_id=route.stage7_record_id,
        stage7_submission_id=package.submission_id,
        payload={
            "stage7_package": package.model_dump(mode="json"),
            "claim_text": claim.claim_text,
            "evidence_refs": [item.evidence_id for item in evidence],
            "review_ids": [review.review_id for review in reviews],
            "candidate_answer_not_verified": True,
            "stage6_required": True,
            "may_publish_truth": False,
            "may_update_stage1": False,
            "may_update_stage4": False,
        },
    )
    claim.stage6_packet_id = packet.packet_id
    claim.status = PodcastClaimStatus.submitted_stage6
    claim.updated_at = utc_now()
    return packet, claim


def compute_room_reputation(
    room: PodcastRoom,
    participants: list[PodcastParticipant],
    claims: list[PodcastDebateClaim],
    evidence: list[PodcastEvidenceSubmission],
    reviews: list[PodcastClaimReview],
    alerts: list[PodcastRoomRiskAlert],
) -> PodcastRoom:
    expert_count = sum(1 for participant in participants if participant.role == PodcastParticipantRole.expert)
    expert_density = expert_count / max(1, len(participants))
    claims_with_evidence = {item.claim_id for item in evidence}
    evidence_acceptance_rate = len(claims_with_evidence) / max(1, len(claims))
    unresolved = sum(
        1
        for claim in claims
        if claim.status
        in {
            PodcastClaimStatus.open,
            PodcastClaimStatus.needs_evidence,
            PodcastClaimStatus.under_review,
            PodcastClaimStatus.disputed,
        }
    )
    unresolved_claim_rate = unresolved / max(1, len(claims))
    dispute_rate = sum(
        1
        for review in reviews
        if review.verdict in {PodcastClaimReviewVerdict.refute, PodcastClaimReviewVerdict.disputed}
    ) / max(1, len(reviews))
    critical_pressure = sum(1 for alert in alerts if alert.severity == PodcastRiskSeverity.critical)
    high_pressure = sum(1 for alert in alerts if alert.severity == PodcastRiskSeverity.high)
    risk_score = _clip01(
        0.3 * unresolved_claim_rate
        + 0.25 * dispute_rate
        + 0.2 * (1.0 - evidence_acceptance_rate if claims else 0.0)
        + 0.15 * min(1.0, high_pressure / 2.0)
        + 0.2 * min(1.0, critical_pressure)
    )
    base = room.reputation_metadata.reputation_score
    reputation_score = _clip01(
        0.35 * base
        + 0.2 * expert_density
        + 0.25 * evidence_acceptance_rate
        + 0.2 * (1.0 - unresolved_claim_rate)
        - 0.15 * risk_score
    )
    if risk_score >= 0.8:
        band = "restricted"
    elif risk_score >= 0.55:
        band = "watch"
    elif reputation_score >= 0.75:
        band = "trusted"
    else:
        band = "emerging"
    room.reputation_metadata = PodcastRoomReputationMetadata(
        reputation_score=reputation_score,
        reputation_band=band,
        expert_density=_clip01(expert_density),
        evidence_acceptance_rate=_clip01(evidence_acceptance_rate),
        unresolved_claim_rate=_clip01(unresolved_claim_rate),
        risk_score=risk_score,
        signal_priority=_clip01(risk_score + 0.2 * unresolved_claim_rate),
    )
    room.updated_at = utc_now()
    return room


def build_room_risk_alerts(
    room: PodcastRoom,
    claims: list[PodcastDebateClaim],
    evidence: list[PodcastEvidenceSubmission],
    reviews: list[PodcastClaimReview],
    invitations: list[PodcastAgentInvitation],
) -> list[PodcastRoomRiskAlert]:
    alerts: list[PodcastRoomRiskAlert] = []
    evidence_claim_ids = {item.claim_id for item in evidence}
    missing_evidence = [claim.claim_id for claim in claims if claim.claim_id not in evidence_claim_ids]
    if missing_evidence:
        alerts.append(
            PodcastRoomRiskAlert(
                alert_id=_stable_id("podcast_alert", room.room_id, "missing_evidence", missing_evidence),
                room_id=room.room_id,
                severity=PodcastRiskSeverity.medium,
                reason="one or more debate claims lack submitted evidence",
                risk_score=0.45,
                required_next_action="call_for_experts_or_collect_evidence",
            )
        )
    disputed = [
        review.review_id
        for review in reviews
        if review.verdict in {PodcastClaimReviewVerdict.refute, PodcastClaimReviewVerdict.disputed}
    ]
    if disputed:
        alerts.append(
            PodcastRoomRiskAlert(
                alert_id=_stable_id("podcast_alert", room.room_id, "disputed_reviews", disputed),
                room_id=room.room_id,
                severity=PodcastRiskSeverity.high,
                reason="disputed claim reviews require Stage 7 candidate routing and Stage 6 review",
                risk_score=0.72,
            )
        )
    blocked_invites = [
        invite.invitation_id
        for invite in invitations
        if invite.status == PodcastInvitationStatus.blocked
    ]
    if blocked_invites:
        alerts.append(
            PodcastRoomRiskAlert(
                alert_id=_stable_id("podcast_alert", room.room_id, "blocked_invites", blocked_invites),
                room_id=room.room_id,
                severity=PodcastRiskSeverity.critical,
                reason="agent invitation attempted direct Stage 4/Stage 1 target and was blocked",
                risk_score=0.95,
                required_next_action="moderator_review_and_no_bypass_audit",
            )
        )
    if room.reputation_metadata.risk_score >= 0.75:
        alerts.append(
            PodcastRoomRiskAlert(
                alert_id=_stable_id("podcast_alert", room.room_id, "room_risk", room.reputation_metadata.risk_score),
                room_id=room.room_id,
                severity=PodcastRiskSeverity.high,
                reason="room risk score is elevated; keep claims candidate-only",
                risk_score=room.reputation_metadata.risk_score,
            )
        )
    return alerts


def build_dashboard_cards(
    rooms: list[PodcastRoom],
    sessions: list[PodcastSession],
    claims: list[PodcastDebateClaim],
    routes: list[PodcastStage7CandidateRoute],
    packets: list[PodcastStage6SubmissionPacket],
    alerts: list[PodcastRoomRiskAlert],
) -> list[PodcastCouncilDashboardCard]:
    open_claims = sum(1 for claim in claims if claim.status != PodcastClaimStatus.submitted_stage6)
    high_alerts = sum(
        1
        for alert in alerts
        if alert.severity in {PodcastRiskSeverity.high, PodcastRiskSeverity.critical}
    )
    return [
        PodcastCouncilDashboardCard(
            card_id="podcast_rooms_active",
            title="Podcast Rooms",
            value=str(len(rooms)),
            tone="steady",
            metadata={"active_rooms": sum(1 for room in rooms if room.status.value == "active")},
        ),
        PodcastCouncilDashboardCard(
            card_id="podcast_sessions",
            title="Sessions",
            value=str(len(sessions)),
            tone="neutral",
            metadata={"scheduled": sum(1 for session in sessions if session.status == "scheduled")},
        ),
        PodcastCouncilDashboardCard(
            card_id="podcast_claims_open",
            title="Claims Needing Route",
            value=str(open_claims),
            tone="watch" if open_claims else "steady",
            metadata={"candidate_only": True, "may_publish_truth": False},
        ),
        PodcastCouncilDashboardCard(
            card_id="podcast_stage7_routes",
            title="Stage 7 Candidates",
            value=str(len(routes)),
            tone="candidate",
            metadata={"stage6_required": True},
        ),
        PodcastCouncilDashboardCard(
            card_id="podcast_stage6_packets",
            title="Stage 6 Packets",
            value=str(len(packets)),
            tone="handoff",
            metadata={"candidate_answer_not_verified": True},
        ),
        PodcastCouncilDashboardCard(
            card_id="podcast_risk_alerts",
            title="Risk Alerts",
            value=str(len(alerts)),
            tone="alert" if high_alerts else "steady",
            metadata={"high_or_critical": high_alerts},
        ),
    ]


def build_dashboard_pages(
    cards: list[PodcastCouncilDashboardCard],
    rooms: list[PodcastRoom],
    alerts: list[PodcastRoomRiskAlert],
    audit_logs: list[PodcastCouncilAuditLog],
) -> list[PodcastCouncilDashboardPage]:
    safety = {
        "stage6_no_bypass": True,
        "stage7_candidate_only": True,
        "local_readiness_not_truth_score": True,
        "signal_culture_routing_only": True,
        "podcast_council_may_publish_truth": False,
        "podcast_council_may_update_stage1": False,
        "podcast_council_may_update_stage4": False,
    }
    return [
        PodcastCouncilDashboardPage(
            page_id="podcast_council_overview",
            title="Podcast Council Overview",
            cards=cards,
            sections=[
                {"title": "Rooms", "items": [room.model_dump(mode="json") for room in rooms]},
                {"title": "Risk Alerts", "items": [alert.model_dump(mode="json") for alert in alerts]},
            ],
            safety_boundaries=safety,
        ),
        PodcastCouncilDashboardPage(
            page_id="podcast_council_audit",
            title="Podcast Council Audit Trail",
            cards=[card for card in cards if card.card_id in {"podcast_risk_alerts", "podcast_stage6_packets"}],
            sections=[
                {
                    "title": "Latest Audit Events",
                    "items": [log.model_dump(mode="json") for log in audit_logs[:25]],
                }
            ],
            safety_boundaries=safety,
        ),
    ]


def dedupe_alerts(alerts: Iterable[PodcastRoomRiskAlert]) -> list[PodcastRoomRiskAlert]:
    unique: dict[str, PodcastRoomRiskAlert] = {}
    for alert in alerts:
        unique[alert.alert_id] = alert
    return list(unique.values())
