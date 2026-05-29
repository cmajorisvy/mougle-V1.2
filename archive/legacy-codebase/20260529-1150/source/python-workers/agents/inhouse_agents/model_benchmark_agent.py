"""
In-house model benchmark agent — placeholder. INTERNAL / ADMIN-ONLY.

Runs side-by-side benchmarks of LLMs and agent configurations on internal
golden sets. Used for model selection and regression detection.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("model_benchmark_agent.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "agent": "model_benchmark_agent"},
    )
