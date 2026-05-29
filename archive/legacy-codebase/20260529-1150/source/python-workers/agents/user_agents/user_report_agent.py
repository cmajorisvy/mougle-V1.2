"""
User report agent — placeholder.

USER-FACING. Generates long-form reports (PDF / structured JSON) from a set of
upstream agent outputs. Long-running batch work.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("user_report_agent.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "agent": "user_report_agent"},
    )
