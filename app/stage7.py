"""Stage 7 External AI Memory & Uncertainty Engine.

Stage 7 stores candidate external-memory records and packages strong candidates for
Stage 6. It is explicitly candidate-only: it never publishes truth and never writes
Stage 1 or Stage 4 outputs directly.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.models import (
    QueryTankItem,
    Stage7Alert,
    Stage7ExternalRecord,
    Stage7ExternalRecordInput,
    Stage7RecordStatus,
    Stage7ResolutionRequest,
    Stage7SubmissionPackage,
    Stage7Tank,
    StageRoute,
    utc_now,
)


def _stable_id(prefix: str, *parts: object) -> str:
    body = ":".join(json.dumps(part, sort_keys=True, default=str) for part in parts)
    digest = hashlib.sha1(body.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def create_stage7_external_record(payload: Stage7ExternalRecordInput) -> Stage7ExternalRecord:
    """Create a candidate-only Stage 7 record without truth publishing authority."""

    tank = payload.tank
    status = payload.status
    if tank == Stage7Tank.supported_data and status == Stage7RecordStatus.unknown:
        status = Stage7RecordStatus.candidate_supported
    if tank == Stage7Tank.disputed_unknown and status == Stage7RecordStatus.candidate_supported:
        status = Stage7RecordStatus.unresolved
    return Stage7ExternalRecord(
        record_id=_stable_id("stage7", payload.claim_text, payload.source_ref, tank.value),
        claim_text=payload.claim_text,
        source_ref=payload.source_ref,
        evidence_refs=payload.evidence_refs,
        tank=tank,
        status=status,
        provider=payload.provider,
        model=payload.model,
        confidence=payload.confidence,
        evidence_quality=payload.evidence_quality,
        contradiction_count=payload.contradiction_count,
        rationale=payload.rationale,
        metadata=payload.metadata,
    )


def build_query_tank_item(record: Stage7ExternalRecord) -> QueryTankItem:
    """Represent unresolved Stage 7 candidate memory as a Query Tank item."""

    reason = "external verifier required" if record.tank != Stage7Tank.disputed_unknown else "unresolved external memory"
    return QueryTankItem(
        query_id=record.record_id,
        answer_id=record.record_id,
        reason=reason,
        category="stage7_candidate_memory",
        status="open",
        required_next_action="submit_to_stage6_or_collect_more_evidence",
    )


def resolve_stage7_query_tank(record: Stage7ExternalRecord, request: Stage7ResolutionRequest) -> Stage7ExternalRecord:
    """Keep a Stage 7 record unresolved until Stage 6 verification is explicitly requested."""

    record.status = Stage7RecordStatus.unresolved
    record.rationale = f"{record.rationale}; resolver={request.reviewer}; {request.resolution_hint}"
    record.updated_at = utc_now()
    return record


def package_stage7_for_stage6(record: Stage7ExternalRecord) -> Stage7SubmissionPackage:
    """Create a Stage 6 submission package while preserving candidate-only semantics."""

    submission = Stage7SubmissionPackage(
        submission_id=_stable_id("stage6_submit", record.record_id, record.claim_text),
        record_id=record.record_id,
        route=StageRoute.stage_5_pass,
        route_reason="Stage 7 candidate submitted to Stage 6 HARD-MESH; not verified here",
        payload={
            "record_id": record.record_id,
            "claim_text": record.claim_text,
            "source_ref": record.source_ref,
            "evidence_refs": record.evidence_refs,
            "candidate_only": True,
            "may_publish_truth": False,
            "may_update_stage1": False,
            "may_update_stage4": False,
            "provider": record.provider,
            "confidence": record.confidence,
            "evidence_quality": record.evidence_quality,
        },
    )
    record.status = Stage7RecordStatus.submitted_to_stage6
    record.stage6_submission_id = submission.submission_id
    record.updated_at = utc_now()
    return submission


def build_stage7_alerts(records: list[Stage7ExternalRecord]) -> list[Stage7Alert]:
    """Build deterministic admin alerts for unresolved/disputed Stage 7 records."""

    alerts: list[Stage7Alert] = []
    for record in records:
        if record.status in {Stage7RecordStatus.unresolved, Stage7RecordStatus.disputed, Stage7RecordStatus.unknown}:
            severity = "high" if record.contradiction_count > 0 else "medium"
            alerts.append(
                Stage7Alert(
                    alert_id=_stable_id("stage7_alert", record.record_id, record.status.value),
                    record_id=record.record_id,
                    severity=severity,
                    reason=f"Stage 7 candidate remains {record.status.value}; Stage 6 required",
                )
            )
    return alerts


def stage7_config_summary(config: dict[str, Any]) -> dict[str, Any]:
    """Expose the Stage 7 safety configuration in a stable shape for docs/tests."""

    stage7 = dict(config.get("stage7", {}))
    return {
        "enabled": bool(stage7.get("enabled", True)),
        "may_publish_truth": bool(stage7.get("may_publish_truth", False)),
        "may_update_truth_crown_directly": bool(stage7.get("may_update_truth_crown_directly", False)),
        "may_submit_to_stage6": bool(stage7.get("may_submit_to_stage6", True)),
        "require_stage6_for_truth": bool(stage7.get("require_stage6_for_truth", True)),
    }
