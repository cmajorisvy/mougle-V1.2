"""
LLM evaluation runner — placeholder.

Runs an LLM (or a chain) over an eval set and records raw outputs for
downstream scoring. Used by both user agents (offline regression on user
workflows) and in-house agents (model selection).
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("llm_eval_runner.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "worker": "llm_eval_runner"},
    )
