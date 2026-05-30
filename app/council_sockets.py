"""Typed council socket contracts for future seven-council integrations."""

from __future__ import annotations

import hashlib

from app.models import CouncilSocketEnvelope


SEVEN_COUNCIL_UNITS = [
    "truth_council",
    "evidence_council",
    "provenance_council",
    "risk_council",
    "policy_council",
    "appeals_council",
    "operations_council",
]


def build_council_socket_envelope(
    bound_unit_id: str,
    origin_stage: str,
    trace_id: str,
    request_id: str,
    payload: dict,
) -> CouncilSocketEnvelope:
    """Create a typed, replayable council socket envelope with a payload hash."""
    payload_hash = hashlib.sha256(repr(sorted(payload.items())).encode()).hexdigest()
    return CouncilSocketEnvelope(
        socket_id=f"socket_{payload_hash[:12]}",
        bound_unit_id=bound_unit_id,
        schema_id="mougle.council_socket.v1",
        origin_stage=origin_stage,
        trace_id=trace_id,
        request_id=request_id,
        payload_hash=payload_hash,
        request_payload=payload,
    )

