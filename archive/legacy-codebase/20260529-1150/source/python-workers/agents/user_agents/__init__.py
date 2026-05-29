"""
User-facing agents.

Each module in this package exposes an async `run(job: JobEnvelope) -> JobResult`
callable. Agents here MUST NOT access admin-only data or workflows. The job
router enforces that jobs targeting these modules have
`provenance.origin == JobOrigin.USER`.
"""

INTERNAL_ONLY = False
