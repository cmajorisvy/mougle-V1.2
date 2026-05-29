"""
Benchmark worker — placeholder.

Runs higher-level benchmarks composed of `llm_eval_runner` + `scoring` calls,
producing comparable metric tables across models / agent configs.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("benchmarks.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "worker": "benchmarks"},
    )
