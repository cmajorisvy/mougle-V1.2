"""
Scoring worker — placeholder.

Scores raw eval outputs against references using a mix of deterministic
metrics and LLM-as-judge calls.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("scoring.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "worker": "scoring"},
    )
