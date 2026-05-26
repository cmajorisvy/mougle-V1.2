"""
Security helpers and notes for the Python worker layer.

Principles enforced here:
1. The Python worker NEVER trusts client input directly. Every job arrives via
   the TypeScript API, which has already authenticated and authorized the
   caller. Python only re-verifies provenance fields as defense-in-depth.

2. User agents and in-house agents are isolated via `jobs.job_router`. An
   in-house agent will refuse a job whose provenance.origin != INHOUSE.

3. Secrets (OPENAI_API_KEY, DATABASE_URL, etc.) are read from environment
   variables only. They are NEVER logged and NEVER returned in job results.

4. Worker output is treated as untrusted by the TypeScript API; the TS layer
   re-validates shapes before persisting or surfacing to users.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .contracts import JobEnvelope, JobOrigin


class PermissionDeniedError(Exception):
    """Raised when a job's provenance is incompatible with the target agent."""


def assert_origin(job: "JobEnvelope", allowed: "JobOrigin") -> None:
    """Defensive check: reject jobs whose origin does not match the agent class."""
    if job.provenance.origin != allowed:
        raise PermissionDeniedError(
            f"Job {job.job_id} (origin={job.provenance.origin}) is not allowed "
            f"to target an agent restricted to origin={allowed}."
        )


def redact(value: str | None, keep: int = 4) -> str:
    """Redact a secret-ish value for safe logging (only first `keep` chars)."""
    if not value:
        return ""
    if len(value) <= keep:
        return "*" * len(value)
    return value[:keep] + "*" * (len(value) - keep)
