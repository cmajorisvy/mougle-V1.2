"""
User research agent — placeholder.

USER-FACING. Performs content research, source gathering, and synthesis for
end-users. Long-running work — runs as a Python job, not on the TS request
path.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("user_research_agent.run", extra={"job_id": job.job_id})
    # TODO: implement multi-source research, dedup, citation tracking.
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "agent": "user_research_agent"},
    )
