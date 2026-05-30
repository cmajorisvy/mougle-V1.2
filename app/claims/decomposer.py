"""Deterministic claim decomposition with stable claim IDs and preserved spans."""

from __future__ import annotations

import hashlib
import re

from app.models import AtomicClaim


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def _stable_claim_id(answer_id: str, start: int, end: int, text: str) -> str:
    digest = hashlib.sha1(f"{answer_id}:{start}:{end}:{text}".encode("utf-8")).hexdigest()
    return f"claim_{digest[:12]}"


def decompose_answer_to_claims(answer_id: str, answer_text: str) -> list[AtomicClaim]:
    """Conservatively split text into atomic claims, preserving source spans."""
    claims: list[AtomicClaim] = []
    if not answer_text.strip():
        return claims

    cursor = 0
    sentence_index = 0
    for paragraph in answer_text.split("\n"):
        para = paragraph.strip()
        if not para:
            cursor += len(paragraph) + 1
            continue

        parts = _SENTENCE_SPLIT.split(para)
        local_cursor = 0
        for part in parts:
            text = part.strip()
            if not text:
                local_cursor += len(part)
                continue

            rel_start = para.find(part, local_cursor)
            if rel_start < 0:
                rel_start = local_cursor
            rel_end = rel_start + len(part)

            start = cursor + rel_start
            end = cursor + rel_end

            claim_id = _stable_claim_id(answer_id, start, end, text)
            claims.append(
                AtomicClaim(
                    claim_id=claim_id,
                    answer_id=answer_id,
                    text=text,
                    span_start=start,
                    span_end=end,
                    sentence_index=sentence_index,
                )
            )
            sentence_index += 1
            local_cursor = rel_end

        cursor += len(paragraph) + 1

    return claims
