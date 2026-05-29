"""
User media analysis agent — placeholder.

USER-FACING. Analyzes user-uploaded media (images, audio, short video). For
heavy ML, delegates to `media/` workers via sub-jobs.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("user_media_analysis_agent.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "agent": "user_media_analysis_agent"},
    )
