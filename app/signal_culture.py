"""Signal Culture Layer event scoring and routing.

The layer detects, prioritizes, decays, and routes signals. It is not the Truth
Engine and does not write to verified knowledge or the Truth Crown.
"""

from __future__ import annotations

import hashlib

from app.models import SignalDestination, SignalEvent, SignalProcessingRecord, SignalRoute, SignalVector

HIGH_RISK_LEVELS = {"high", "critical"}
LEGAL_EVENT_TYPES = {"legal_update", "policy_change", "public_accusation"}
FINANCIAL_EVENT_TYPES = {"payout", "charge", "refund", "settlement"}
MAIN_ENGINE_EVENT_TYPES = {"public_claim", "verification_request", "newsroom_claim", "debate_claim"}


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _stable_id(prefix: str, *parts: object) -> str:
    body = ":".join(str(part) for part in parts)
    digest = hashlib.sha1(body.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def _risk_value(level: str) -> float:
    return {"low": 0.2, "medium": 0.5, "high": 0.8, "critical": 1.0}.get(level.lower(), 0.3)


def build_signal_vector(event: SignalEvent, hints: dict | None = None) -> SignalVector:
    """Build a deterministic signal vector from event metadata and optional hints."""
    hints = hints or {}
    risk_score = _clip01(float(hints.get("risk_score", _risk_value(event.risk_level))))
    legal_sensitivity = 1.0 if event.event_type in LEGAL_EVENT_TYPES else 0.0
    marketplace_value = 1.0 if event.event_type in FINANCIAL_EVENT_TYPES else 0.0
    evidence_strength = _clip01(float(hints.get("evidence_strength", 0.5)))
    novelty = _clip01(float(hints.get("novelty", 0.6 if event.topic_id else 0.4)))
    spam_probability = _clip01(float(hints.get("spam_probability", 0.1)))
    duplication_penalty = _clip01(float(hints.get("duplication_penalty", 0.0)))
    user_reputation = _clip01(float(hints.get("user_reputation", 0.5)))
    newsworthiness = _clip01(float(hints.get("newsworthiness", 0.7 if "news" in event.event_type else 0.2)))
    expert_weight = _clip01(float(hints.get("expert_weight", 0.0)))
    debate_intensity = _clip01(float(hints.get("debate_intensity", 0.0)))
    correction_frequency = _clip01(float(hints.get("correction_frequency", 0.0)))
    topic_momentum = _clip01(float(hints.get("topic_momentum", 0.0)))
    time_decay = _clip01(float(hints.get("time_decay", 1.0)))

    positive = (
        0.18 * novelty
        + 0.2 * evidence_strength
        + 0.1 * user_reputation
        + 0.08 * expert_weight
        + 0.08 * debate_intensity
        + 0.08 * correction_frequency
        + 0.08 * topic_momentum
        + 0.06 * marketplace_value
        + 0.12 * newsworthiness
    )
    penalty = 0.15 * risk_score + 0.18 * spam_probability + 0.12 * duplication_penalty
    signal_strength = _clip01((positive - penalty) * time_decay)
    urgency = 1.0 if event.risk_level.lower() in HIGH_RISK_LEVELS else 0.7
    routing_priority = _clip01(signal_strength * novelty * (0.5 + user_reputation) * urgency)

    return SignalVector(
        event_id=event.event_id,
        novelty=novelty,
        evidence_strength=evidence_strength,
        user_reputation=user_reputation,
        expert_weight=expert_weight,
        debate_intensity=debate_intensity,
        correction_frequency=correction_frequency,
        topic_momentum=topic_momentum,
        marketplace_value=marketplace_value,
        newsworthiness=newsworthiness,
        risk_score=risk_score,
        spam_probability=spam_probability,
        legal_sensitivity=legal_sensitivity,
        duplication_penalty=duplication_penalty,
        time_decay=time_decay,
        signal_strength=signal_strength,
        routing_priority=routing_priority,
    )


def route_signal(event: SignalEvent, vector: SignalVector) -> SignalRoute:
    """Route a signal without making final truth decisions."""
    event_type = event.event_type.lower()
    sent_to_main_engine = False
    if event.risk_level.lower() in HIGH_RISK_LEVELS or event_type in LEGAL_EVENT_TYPES | FINANCIAL_EVENT_TYPES:
        destination = SignalDestination.admin_review
        reason = "high-risk signal requires admin or policy review"
        queue = "admin_review"
    elif event_type in MAIN_ENGINE_EVENT_TYPES and vector.routing_priority >= 0.18:
        destination = SignalDestination.main_engine
        reason = "signal priority is high enough for verification engine"
        queue = "verification_fast_lane"
        sent_to_main_engine = True
    elif vector.routing_priority >= 0.12:
        destination = SignalDestination.agent_wake
        reason = "signal should wake a local user agent"
        queue = "agent_wake"
    else:
        destination = SignalDestination.local_archive
        reason = "low-value duplicate or low-priority signal archived locally"
        queue = "local_archive"

    return SignalRoute(
        route_id=_stable_id("route", event.event_id, destination.value, vector.routing_priority),
        event_id=event.event_id,
        destination_type=destination,
        priority_score=vector.routing_priority,
        route_reason=reason,
        worker_queue=queue,
        sent_to_main_engine=sent_to_main_engine,
    )


def process_signal_event(event: SignalEvent, hints: dict | None = None) -> SignalProcessingRecord:
    """Build vector and route records for a Signal Culture event."""
    vector = build_signal_vector(event, hints)
    route = route_signal(event, vector)
    event.processing_status = "routed"
    return SignalProcessingRecord(event=event, vector=vector, route=route)


def load_reduction_summary(records: list[SignalProcessingRecord]) -> dict[str, float | int]:
    """Compute load reduction without treating signals as truth."""
    total = len(records)
    sent = sum(1 for record in records if record.route.sent_to_main_engine)
    ratio = 1.0 if total == 0 else 1.0 - (sent / total)
    return {
        "totalEventsReceived": total,
        "eventsSentToMainEngine": sent,
        "loadReductionRatio": _clip01(ratio),
    }
