"""
Audio/video ML worker — placeholder.

Heavy-lift ML on audio/video assets (speaker diarization, scene segmentation,
event detection). Runs only as a queued Python job — never on the TS request
path.
"""

from __future__ import annotations

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.logging import get_logger

log = get_logger(__name__)


async def run(job: JobEnvelope) -> JobResult:
    log.info("audio_video_ml_worker.run", extra={"job_id": job.job_id})
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        result={"stub": True, "worker": "audio_video_ml_worker"},
    )
