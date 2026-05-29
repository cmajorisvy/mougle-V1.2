"""
Stable deterministic ID helpers.

Handlers produce IDs that are reproducible across runs given the same input,
so re-running a job yields the same claim_id / cluster_id / package_id. This
makes downstream dedup and idempotent persistence on the TS side trivial.
"""

from __future__ import annotations

import hashlib


def short_hash(*parts: str, length: int = 12) -> str:
    h = hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()
    return h[:length]


def claim_id(article_id: str, span_text: str) -> str:
    return f"clm_{short_hash(article_id, span_text.strip().lower())}"


def cluster_id(member_ids: list[str]) -> str:
    return f"clu_{short_hash(*sorted(member_ids))}"


def package_id(seed: str) -> str:
    return f"pkg_{short_hash(seed)}"
