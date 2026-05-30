"""FastAPI application exposing verification and graph endpoints."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query

from app.engine import VerificationEngine
from app.models import (
    AgentActionEvaluationRequest,
    AgentCollapseEventInput,
    AgentCollapseMetricsInput,
    AgentCollapseRecoveryPlanRequest,
    AgentCollapseRestrictionRequest,
    AgentCollapseRestoreRequest,
    AgentCollapseReviewRequest,
    CouncilSocketEnvelope,
    Stage7ExternalRecordInput,
    Stage7ResolutionRequest,
    SignalEventRequest,
    VerifyRequest,
    VerifyResponse,
)

app = FastAPI(title="Verified Truth Pyramid API", version="0.1.0")
engine = VerificationEngine()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "verified-truth-pyramid",
        "version": app.version,
        "stage6_available": True,
        "storage_available": True,
    }


@app.post("/verify", response_model=VerifyResponse)
def verify(payload: VerifyRequest) -> VerifyResponse:
    result = engine.verify(payload)
    return VerifyResponse(
        answer_id=result.answer.answer_id,
        tvs=result.truth_metrics.tvs,
        tmi=result.truth_metrics.tmi,
        publish=result.publish_decision.publish,
        verdict=result.final_verdict,
        claims=result.claim_records,
        macro_micro=result.macro_micro,
        hard_mesh=result.hard_mesh,
        provenance=result.provenance,
        unresolved_reason=result.publish_decision.unresolved_reason,
        confidence_explanation=result.confidence_explanation,
        claim_rollup=result.claim_rollup,
    )


@app.get("/graph/{answer_id}")
def graph(answer_id: str) -> dict:
    snapshot = engine.get_graph(answer_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="answer graph not found")
    return snapshot


@app.post("/hard-mesh/analyze")
def hard_mesh_analyze(payload: VerifyRequest) -> dict:
    result = engine.verify(payload)
    return {
        "answer_id": result.answer.answer_id,
        "hard_mesh": result.hard_mesh.model_dump(mode="json") if result.hard_mesh else None,
        "topology": result.topology.model_dump(mode="json") if result.topology else None,
    }


@app.get("/query-tank")
def query_tank() -> list[dict]:
    return engine.list_query_tank()


@app.post("/council/socket/events")
def council_socket_event(payload: CouncilSocketEnvelope) -> dict:
    envelope, decision = engine.submit_council_event(payload)
    return {
        "envelope": envelope.model_dump(mode="json"),
        "decision": decision.model_dump(mode="json"),
    }


@app.get("/council/socket/events")
def council_socket_events() -> list[dict]:
    return engine.list_council_events()


@app.get("/topology/evolution")
def topology_evolution() -> list[dict]:
    return engine.list_topology_evolution()


@app.post("/agents/action-request")
def agent_action_request(payload: AgentActionEvaluationRequest) -> dict:
    decision = engine.evaluate_agent_action_request(payload.request, payload.passport)
    return decision.model_dump(mode="json")


@app.post("/signal/events")
def signal_event(payload: SignalEventRequest) -> dict:
    record = engine.process_signal(payload.event, payload.hints)
    return record.model_dump(mode="json")


@app.get("/admin/signal-load-reduction")
def signal_load_reduction() -> dict:
    return engine.signal_load_reduction()


@app.get("/archive/micro-pyramid/candidates")
def archive_micro_pyramid_candidates(
    archive_timestamp: str = Query(default="20260529-1150", pattern=r"^\d{8}-\d{4}$"),
    limit: int | None = Query(default=None, ge=1, le=5000),
) -> dict:
    return engine.archive_micro_pyramid_candidates(archive_timestamp, limit)


@app.get("/archive/runtime-imports/check")
def archive_runtime_import_check() -> dict:
    return engine.archive_runtime_import_check()


@app.post("/stage7/external-records")
def stage7_external_record(payload: Stage7ExternalRecordInput) -> dict:
    record = engine.create_stage7_external_record(payload)
    return record.model_dump(mode="json")


@app.get("/stage7/external-records")
def stage7_external_records() -> list[dict]:
    return engine.list_stage7_external_records()


@app.post("/stage7/query-tank/resolve")
def stage7_query_tank_resolve(payload: Stage7ResolutionRequest) -> dict:
    try:
        record = engine.resolve_stage7_query_tank(payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return record.model_dump(mode="json")


@app.post("/stage7/stage6/submit")
def stage7_stage6_submit(payload: Stage7ResolutionRequest) -> dict:
    try:
        package = engine.submit_stage7_record_to_stage6(payload.record_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return package.model_dump(mode="json")


@app.get("/admin/stage7/alerts")
def stage7_alerts() -> list[dict]:
    return engine.stage7_alerts()


@app.post("/agents/{agent_id}/collapse/evaluate")
def agent_collapse_evaluate(agent_id: str, payload: AgentCollapseMetricsInput) -> dict:
    return engine.evaluate_collapse_risk(agent_id, payload).model_dump(mode="json")


@app.post("/agents/{agent_id}/collapse/events")
def agent_collapse_event(agent_id: str, payload: AgentCollapseEventInput) -> dict:
    event = engine.create_collapse_event(agent_id, payload)
    return event.model_dump(mode="json")


@app.get("/agents/{agent_id}/collapse/events")
def agent_collapse_events(
    agent_id: str,
    viewer_user_id: str | None = None,
    role: str = "owner",
) -> list[dict]:
    state = engine.get_collapse_state(agent_id)
    owner = state.get("latest_event", {}).get("owner_user_id")
    if owner and role not in {"admin", "council"} and viewer_user_id != owner:
        raise HTTPException(status_code=403, detail="not authorized for collapse details")
    return engine.list_collapse_events(agent_id)


@app.get("/agents/{agent_id}/collapse/state")
def agent_collapse_state(
    agent_id: str,
    viewer_user_id: str | None = None,
    role: str = "owner",
) -> dict:
    state = engine.get_collapse_state(agent_id)
    owner = state.get("latest_event", {}).get("owner_user_id")
    if owner and role not in {"admin", "council"} and viewer_user_id != owner:
        raise HTTPException(status_code=403, detail="not authorized for collapse state")
    return state


@app.post("/agents/{agent_id}/collapse/restrictions")
def agent_collapse_restrictions(agent_id: str, payload: AgentCollapseRestrictionRequest) -> dict:
    return engine.create_collapse_restriction(agent_id, payload)


@app.post("/agents/{agent_id}/collapse/recovery-plan")
def agent_collapse_recovery_plan(agent_id: str, payload: AgentCollapseRecoveryPlanRequest) -> dict:
    return engine.create_collapse_recovery_plan(agent_id, payload)


@app.post("/agents/{agent_id}/collapse/review")
def agent_collapse_review(agent_id: str, payload: AgentCollapseReviewRequest) -> dict:
    if payload.reviewer_role not in {"admin", "council"}:
        raise HTTPException(status_code=403, detail="admin or council role required")
    return engine.create_collapse_review(agent_id, payload)


@app.post("/agents/{agent_id}/collapse/restore")
def agent_collapse_restore(agent_id: str, payload: AgentCollapseRestoreRequest) -> dict:
    return engine.restore_collapse_agent(agent_id, payload)


@app.get("/admin/agents/collapse/events")
def admin_agent_collapse_events() -> list[dict]:
    return engine.list_collapse_events()


@app.get("/admin/agents/collapse/alerts")
def admin_agent_collapse_alerts() -> list[dict]:
    return engine.collapse_alerts()


@app.get("/admin/agents/collapse/metrics")
def admin_agent_collapse_metrics() -> dict:
    return engine.collapse_metrics_summary()


@app.post("/admin/agents/collapse/{event_id}/route-stage6")
def admin_route_collapse_stage6(event_id: str) -> dict:
    try:
        return engine.route_collapse_event_stage6(event_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/admin/agents/collapse/{event_id}/route-truth-impact")
def admin_route_collapse_truth_impact(event_id: str) -> dict:
    try:
        return engine.route_collapse_event_truth_impact(event_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
