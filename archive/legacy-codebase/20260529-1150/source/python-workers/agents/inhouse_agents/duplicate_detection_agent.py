"""
In-house duplicate detection agent — placeholder. INTERNAL / ADMIN-ONLY.

Finds near-duplicate articles, posts, and AI outputs across the platform
using text shingles + (eventually) vector similarity.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("duplicate_detection_agent.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "agent": "duplicate_detection_agent"},
    )
