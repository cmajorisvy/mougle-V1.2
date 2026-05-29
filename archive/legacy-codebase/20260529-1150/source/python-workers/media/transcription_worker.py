"""
Transcription worker — placeholder.

Speech-to-text for podcast / debate / user-uploaded audio. Output is consumed
by downstream agents (summary, claim extraction, newsroom).
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("transcription_worker.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "worker": "transcription_worker", "transcript": ""},
    )
