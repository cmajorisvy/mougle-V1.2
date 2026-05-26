"""
Canonical job-type identifiers exchanged between TypeScript and Python.

Keep these strings stable — they are persisted in the job queue and used as
the discriminator in `JobEnvelope.job_type`.
"""

from __future__ import annotations

from enum import Enum


class JobType(str, Enum):
    # --- User-facing agents ----------------------------------------------
    USER_RESEARCH = "user.research"
    USER_CLAIM_EXTRACTION = "user.claim_extraction"
    USER_SUMMARY = "user.summary"
    USER_MEDIA_ANALYSIS = "user.media_analysis"
    USER_REPORT = "user.report"

    # --- In-house agents -------------------------------------------------
    INHOUSE_NEWSROOM = "inhouse.newsroom"
    INHOUSE_QUALITY_EVAL = "inhouse.quality_eval"
    INHOUSE_SOURCE_CREDIBILITY = "inhouse.source_credibility"
    INHOUSE_DUPLICATE_DETECTION = "inhouse.duplicate_detection"
    INHOUSE_SYSTEM_MONITORING = "inhouse.system_monitoring"
    INHOUSE_MODEL_BENCHMARK = "inhouse.model_benchmark"

    # --- Supporting pipelines -------------------------------------------
    VECTOR_EMBEDDINGS = "vector.embeddings"
    VECTOR_SEARCH = "vector.search"
    VECTOR_CLUSTERING = "vector.clustering"
    MEDIA_AUDIO_VIDEO_ML = "media.audio_video_ml"
    MEDIA_COMPUTER_VISION = "media.computer_vision"
    MEDIA_TRANSCRIPTION = "media.transcription"
    EVAL_LLM_RUN = "eval.llm_run"
    EVAL_SCORING = "eval.scoring"
    EVAL_BENCHMARK = "eval.benchmark"


USER_JOB_TYPES: frozenset[JobType] = frozenset(
    {
        JobType.USER_RESEARCH,
        JobType.USER_CLAIM_EXTRACTION,
        JobType.USER_SUMMARY,
        JobType.USER_MEDIA_ANALYSIS,
        JobType.USER_REPORT,
    }
)

INHOUSE_JOB_TYPES: frozenset[JobType] = frozenset(
    {
        JobType.INHOUSE_NEWSROOM,
        JobType.INHOUSE_QUALITY_EVAL,
        JobType.INHOUSE_SOURCE_CREDIBILITY,
        JobType.INHOUSE_DUPLICATE_DETECTION,
        JobType.INHOUSE_SYSTEM_MONITORING,
        JobType.INHOUSE_MODEL_BENCHMARK,
    }
)
