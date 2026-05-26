"""
Job router — maps a `JobEnvelope` to the correct agent/worker and enforces the
user-vs-inhouse permission boundary defensively.

The TypeScript API is the primary permission authority. This router exists as
defense-in-depth: even if the TS layer were misconfigured, an in-house agent
will refuse to execute a job whose provenance.origin != INHOUSE.
"""

from __future__ import annotations

from typing import Awaitable, Callable

from shared.contracts import JobEnvelope, JobOrigin, JobResult, JobStatus
from shared.logging import get_logger
from shared.security import PermissionDeniedError, assert_origin

from .job_types import INHOUSE_JOB_TYPES, USER_JOB_TYPES, JobType

log = get_logger(__name__)

Handler = Callable[[JobEnvelope], Awaitable[JobResult]]


class JobRouter:
    def __init__(self) -> None:
        self._handlers: dict[str, Handler] = {}
        self._register_all()

    # ----- registration --------------------------------------------------

    def register(self, job_type: JobType, handler: Handler) -> None:
        self._handlers[job_type.value] = handler

    def _register_all(self) -> None:
        # Imported lazily to avoid heavy imports at module load.
        from agents.user_agents import (
            user_claim_extraction_agent,
            user_media_analysis_agent,
            user_report_agent,
            user_research_agent,
            user_summary_agent,
        )
        from agents.inhouse_agents import (
            duplicate_detection_agent,
            model_benchmark_agent,
            newsroom_agent,
            quality_eval_agent,
            source_credibility_agent,
            system_monitoring_agent,
        )
        from evals import benchmarks, llm_eval_runner, scoring
        from media import (
            audio_video_ml_worker,
            computer_vision_worker,
            transcription_worker,
        )
        from vector import clustering_worker, embeddings_worker, vector_search_worker

        self.register(JobType.USER_RESEARCH, user_research_agent.run)
        self.register(JobType.USER_CLAIM_EXTRACTION, user_claim_extraction_agent.run)
        self.register(JobType.USER_SUMMARY, user_summary_agent.run)
        self.register(JobType.USER_MEDIA_ANALYSIS, user_media_analysis_agent.run)
        self.register(JobType.USER_REPORT, user_report_agent.run)

        self.register(JobType.INHOUSE_NEWSROOM, newsroom_agent.run)
        self.register(JobType.INHOUSE_QUALITY_EVAL, quality_eval_agent.run)
        self.register(JobType.INHOUSE_SOURCE_CREDIBILITY, source_credibility_agent.run)
        self.register(
            JobType.INHOUSE_DUPLICATE_DETECTION, duplicate_detection_agent.run
        )
        self.register(JobType.INHOUSE_SYSTEM_MONITORING, system_monitoring_agent.run)
        self.register(JobType.INHOUSE_MODEL_BENCHMARK, model_benchmark_agent.run)

        self.register(JobType.VECTOR_EMBEDDINGS, embeddings_worker.run)
        self.register(JobType.VECTOR_SEARCH, vector_search_worker.run)
        self.register(JobType.VECTOR_CLUSTERING, clustering_worker.run)

        self.register(JobType.MEDIA_AUDIO_VIDEO_ML, audio_video_ml_worker.run)
        self.register(JobType.MEDIA_COMPUTER_VISION, computer_vision_worker.run)
        self.register(JobType.MEDIA_TRANSCRIPTION, transcription_worker.run)

        self.register(JobType.EVAL_LLM_RUN, llm_eval_runner.run)
        self.register(JobType.EVAL_SCORING, scoring.run)
        self.register(JobType.EVAL_BENCHMARK, benchmarks.run)

    # ----- dispatch ------------------------------------------------------

    async def dispatch(self, job: JobEnvelope) -> JobResult:
        handler = self._handlers.get(job.job_type)
        if handler is None:
            log.warning("job_router.unknown_type", extra={"job_type": job.job_type})
            return JobResult(
                job_id=job.job_id,
                status=JobStatus.REJECTED,
                error=f"Unknown job_type: {job.job_type}",
            )

        try:
            self._check_origin_boundary(job)
        except PermissionDeniedError as exc:
            log.warning(
                "job_router.permission_denied",
                extra={"job_id": job.job_id, "job_type": job.job_type},
            )
            return JobResult(
                job_id=job.job_id, status=JobStatus.REJECTED, error=str(exc)
            )

        log.info(
            "job_router.dispatch",
            extra={"job_id": job.job_id, "job_type": job.job_type},
        )
        try:
            return await handler(job)
        except Exception as exc:  # noqa: BLE001 — defensive top-level catch
            log.exception(
                "job_router.handler_failed",
                extra={"job_id": job.job_id, "job_type": job.job_type},
            )
            return JobResult(
                job_id=job.job_id, status=JobStatus.FAILED, error=str(exc)
            )

    @staticmethod
    def _check_origin_boundary(job: JobEnvelope) -> None:
        try:
            jt = JobType(job.job_type)
        except ValueError:
            return  # unknown types are handled by dispatch()
        if jt in USER_JOB_TYPES:
            assert_origin(job, JobOrigin.USER)
        elif jt in INHOUSE_JOB_TYPES:
            assert_origin(job, JobOrigin.INHOUSE)
        # Supporting pipelines (vector/media/eval) accept either origin —
        # they are called by both user agents and in-house agents.
