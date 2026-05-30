"""FastAPI application exposing verification and graph endpoints."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException

from app.engine import VerificationEngine
from app.models import VerifyRequest, VerifyResponse

app = FastAPI(title="Verified Truth Pyramid API", version="0.1.0")
engine = VerificationEngine()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "verified-truth-pyramid"}


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
        provenance=result.provenance,
        unresolved_reason=result.publish_decision.unresolved_reason,
    )


@app.get("/graph/{answer_id}")
def graph(answer_id: str) -> dict:
    snapshot = engine.get_graph(answer_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="answer graph not found")
    return snapshot
