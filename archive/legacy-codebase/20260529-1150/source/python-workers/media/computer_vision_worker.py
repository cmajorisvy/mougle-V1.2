"""
Computer vision worker — placeholder.

Image analysis (object detection, OCR, NSFW/safety classification) for user
uploads and in-house moderation pipelines.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("computer_vision_worker.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "worker": "computer_vision_worker"},
    )
