"""
Vector search worker — placeholder.

Runs k-NN / hybrid (vector + BM25) queries against the vector store on behalf
of user agents and in-house agents.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("vector_search_worker.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "worker": "vector_search_worker", "hits": []},
    )
