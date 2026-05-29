"""
Shared Pydantic contracts between the TypeScript orchestrator and the Python
worker layer.

These contracts are the source of truth for the JSON payloads exchanged
through the job queue. The TypeScript side should mirror these shapes (a
codegen step can be added later if drift becomes painful).

Two top-level categories:
- USER jobs   — initiated by an end-user via the TypeScript API.
- INHOUSE jobs — initiated by an admin / internal platform process.

Every job carries a `provenance` block so the job router can enforce the
user-vs-inhouse permission boundary defensively (the TypeScript API performs
the primary check; Python re-checks as a defense-in-depth measure).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class JobOrigin(str, Enum):
    USER = "user"
    INHOUSE = "inhouse"


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REJECTED = "rejected"


class JobProvenance(BaseModel):
    """Who/what asked for this job. Filled in by the TypeScript API."""

    origin: JobOrigin
    requested_by_user_id: Optional[str] = Field(
        default=None,
        description="End-user id when origin=USER. None for INHOUSE jobs.",
    )
    requested_by_admin_id: Optional[str] = Field(
        default=None,
        description="Admin user id when origin=INHOUSE. None for USER jobs.",
    )
    request_id: str = Field(
        ...,
        description="Correlates the job back to the originating TS API request.",
    )
    enqueued_at: datetime


class JobEnvelope(BaseModel):
    """Outer envelope every job shares."""

    job_id: str
    job_type: str = Field(
        ...,
        description="Stable string discriminator, see `jobs.job_types.JobType`.",
    )
    provenance: JobProvenance
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=0, description="Higher = more urgent. Default 0.")


class JobResult(BaseModel):
    """Worker -> orchestrator response."""

    job_id: str
    status: JobStatus
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    metrics: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Example typed payloads (kept light — agents may also accept free-form dicts
# during the scaffolding phase).
# ---------------------------------------------------------------------------


class ClaimExtractionPayload(BaseModel):
    job_kind: Literal["claim_extraction"] = "claim_extraction"
    article_ids: list[str]
    cluster_id: Optional[str] = None
    max_claims_per_article: int = 8


class SemanticClusteringPayload(BaseModel):
    job_kind: Literal["semantic_clustering"] = "semantic_clustering"
    document_ids: list[str]
    distance_threshold: float = 0.55


class NewsroomPackagePayload(BaseModel):
    job_kind: Literal["newsroom_package"] = "newsroom_package"
    verified_knowledge_id: str
    template_id: str = "news_desk"
