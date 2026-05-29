"""
User summary agent — placeholder.

USER-FACING. Produces summaries of user-supplied content (articles, threads,
documents). Supports multiple lengths and tones; respects user privacy mode.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("user_summary_agent.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "agent": "user_summary_agent", "summary": ""},
    )
