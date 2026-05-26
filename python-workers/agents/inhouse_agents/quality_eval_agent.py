"""
In-house quality evaluation agent — placeholder. INTERNAL / ADMIN-ONLY.

Scores LLM and agent outputs on quality dimensions (faithfulness, coherence,
safety) for internal monitoring and model selection.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("quality_eval_agent.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "agent": "quality_eval_agent"},
    )
