"""
In-house system monitoring agent — placeholder. INTERNAL / ADMIN-ONLY.

Periodically inspects platform metrics (job queue depth, error rates, AI
gateway health) and emits intelligence summaries to the admin dashboard.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("system_monitoring_agent.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "agent": "system_monitoring_agent"},
    )
