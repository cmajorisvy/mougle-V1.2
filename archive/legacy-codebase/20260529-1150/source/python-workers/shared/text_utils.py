"""
Tiny, dependency-light text utilities shared by the worker handlers.

Deterministic on purpose — no language models, no network calls. Designed to
be replaced piecewise (e.g. swap sentence_split for a SpaCy tokenizer) without
breaking the public function signatures.
"""

from __future__ import annotations

import re
from collections import Counter

# A pragmatic English stopword list. Small on purpose — TF-IDF + cluster
# labeling work fine with a coarse list and we avoid pulling in nltk/spacy.
STOPWORDS: frozenset[str] = frozenset(
    """
    a an the and or but if then else of in on at by for to from with about as
    is are was were be been being do does did doing have has had having i you
    he she it we they them his her our their this that these those there here
    not no yes very just so such than too also which who whom what when where
    why how can could should would may might will shall into onto over under
    again still ever never some any all most more less few many much one two
    three four five up down out off own same other into among between within
    """.split()
)

_SENT_SPLIT_RE = re.compile(r"(?<=[\.!?])\s+(?=[A-Z0-9\"\'\(])")
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9'\-]+")


def normalize(text: str) -> str:
    """Lowercase + collapse whitespace. Leaves punctuation in place."""
    return re.sub(r"\s+", " ", (text or "").strip()).lower()


def sentence_split(text: str) -> list[str]:
    """Split into sentences using simple punctuation heuristics."""
    if not text:
        return []
    cleaned = re.sub(r"\s+", " ", text).strip()
    parts = _SENT_SPLIT_RE.split(cleaned)
    return [p.strip() for p in parts if p and p.strip()]


def tokenize(text: str) -> list[str]:
    """Word-ish tokens. Lowercased, punctuation stripped."""
    return [m.group(0).lower() for m in _TOKEN_RE.finditer(text or "")]


def content_tokens(text: str) -> list[str]:
    """Tokens with stopwords removed (used for keyword scoring)."""
    return [t for t in tokenize(text) if t not in STOPWORDS and len(t) > 2]


def top_keywords(texts: list[str], k: int = 5) -> list[str]:
    """Most common content-token across the texts, deterministic order."""
    counter: Counter[str] = Counter()
    for t in texts:
        counter.update(content_tokens(t))
    # Stable: sort by (-count, token).
    return [tok for tok, _ in sorted(counter.items(), key=lambda x: (-x[1], x[0]))[:k]]


def jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb) or 1
    return inter / union
