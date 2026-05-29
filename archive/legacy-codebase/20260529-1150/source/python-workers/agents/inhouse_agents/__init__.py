"""
In-house Mougle agents — INTERNAL / ADMIN-ONLY.

Each module in this package exposes an async `run(job: JobEnvelope) -> JobResult`
callable. The job router enforces that jobs targeting these modules have
`provenance.origin == JobOrigin.INHOUSE`. The TypeScript API must also gate
the enqueue side on admin-level auth.
"""

INTERNAL_ONLY = True
