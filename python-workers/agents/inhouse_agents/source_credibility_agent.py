"""
In-house source credibility agent — placeholder. INTERNAL / ADMIN-ONLY.

Computes per-domain reliability scores using historical verification outcomes
(EWMA over supported/contradicted/needs_review verdicts).
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("source_credibility_agent.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "agent": "source_credibility_agent"},
    )
