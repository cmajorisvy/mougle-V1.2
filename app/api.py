"""FastAPI application exposing verification and graph endpoints."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException

from app.engine import VerificationEngine
from app.models import CouncilSocketEnvelope, VerifyRequest, VerifyResponse

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
