"""
Pattern-based claim heuristics.

Used by user_claim_extraction_agent (claim typing, entity detection) and by
newsroom_agent (verification priority signals). All functions are pure and
deterministic; the LLM-driven versions are intended to be drop-in replacements
later without changing call sites.
"""

from __future__ import annotations

import re

# --- Regex patterns ---------------------------------------------------------

_NUMBER_RE = re.compile(
    r"(?:(?<![A-Za-z])"  # not preceded by a letter
    r"(?:\$|€|£|¥)?\s?"  # optional currency
    r"\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?"  # integer with thousand separators or decimal
    r"\s?(?:%|percent|million|billion|trillion|m|bn|k)?"
    r"(?![A-Za-z]))",
    re.IGNORECASE,
)

_DATE_RE = re.compile(
    r"\b("
    r"\d{4}-\d{2}-\d{2}"  # ISO
    r"|\d{1,2}/\d{1,2}/\d{2,4}"
    r"|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}"
    r"|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}"
    r"|(?:yesterday|today|tomorrow|last\s+(?:week|month|year)|next\s+(?:week|month|year)|this\s+(?:week|month|year))"
    r")\b",
    re.IGNORECASE,
)

_QUOTE_RE = re.compile(r"[\"\u201c\u201d]([^\"\u201c\u201d]{6,})[\"\u201c\u201d]")

_CAUSAL_KW = (
    "because", "due to", "as a result", "caused", "causes", "leads to",
    "led to", "results in", "resulted in", "therefore", "so that", "hence",
    "thus", "since", "owing to", "thanks to",
)
_COMPARISON_KW = (
    "more than", "less than", "fewer than", "greater than", "higher than",
    "lower than", "compared to", "versus", " vs ", "as opposed to",
    "in contrast", "outperforms", "outperformed",
)
_TEMPORAL_KW = (
    "before", "after", "during", "since", "until", "by", "between",
    "from", "throughout", "earlier", "later",
)

# Tokens we never want surfaced as a candidate claim.
_NON_CLAIM_STARTS = (
    "hi", "hello", "hey", "thanks", "thank you", "regards", "cheers",
    "lol", "haha", "wow", "ok", "okay",
)
_OPINION_HEDGES = (
    "i think", "i feel", "i guess", "in my opinion", "imho", "imo",
    "maybe", "perhaps", "possibly", "arguably", "kind of", "sort of",
)

# Cap to keep heuristic scoring sane.
_MIN_CLAIM_CHARS = 25
_MAX_CLAIM_CHARS = 400


# --- Public API -------------------------------------------------------------


def has_number(text: str) -> bool:
    return bool(_NUMBER_RE.search(text))


def has_date(text: str) -> bool:
    return bool(_DATE_RE.search(text))


def has_quote(text: str) -> bool:
    return bool(_QUOTE_RE.search(text))


def _contains_any(text: str, needles: tuple[str, ...]) -> bool:
    low = text.lower()
    return any(n in low for n in needles)


def has_causal(text: str) -> bool:
    return _contains_any(text, _CAUSAL_KW)


def has_comparison(text: str) -> bool:
    return _contains_any(text, _COMPARISON_KW)


def has_temporal_marker(text: str) -> bool:
    return _contains_any(text, _TEMPORAL_KW) or has_date(text)


def extract_entities(text: str) -> list[str]:
    """
    Capitalized-phrase entity heuristic. Picks runs of 1–4 Title-Case words,
    skipping ones that start a sentence to reduce false positives. Returns
    deduplicated insertion-ordered list.
    """
    candidates: list[str] = []
    sentences = re.split(r"(?<=[\.!?])\s+", text)
    for sent in sentences:
        tokens = sent.split()
        if not tokens:
            continue
        # Skip the first token (sentence-initial capitalization).
        offset = 1
        i = offset
        while i < len(tokens):
            run: list[str] = []
            while i < len(tokens) and _looks_titlecase(tokens[i]) and len(run) < 4:
                run.append(_strip_punct(tokens[i]))
                i += 1
            if run:
                phrase = " ".join(run).strip()
                if len(phrase) >= 2 and phrase.lower() not in {"i"}:
                    candidates.append(phrase)
            else:
                i += 1
    seen: set[str] = set()
    out: list[str] = []
    for c in candidates:
        key = c.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out[:12]


def _looks_titlecase(token: str) -> bool:
    stripped = _strip_punct(token)
    return bool(stripped) and stripped[0].isupper() and not stripped.isupper()


def _strip_punct(token: str) -> str:
    return re.sub(r"^[^\w]+|[^\w]+$", "", token)


def is_obvious_non_claim(text: str) -> bool:
    """Reject greetings, opinions, short fragments."""
    t = text.strip()
    if len(t) < _MIN_CLAIM_CHARS or len(t) > _MAX_CLAIM_CHARS:
        return True
    low = t.lower()
    if any(low.startswith(s) for s in _NON_CLAIM_STARTS):
        return True
    if any(h in low for h in _OPINION_HEDGES):
        return True
    # Must contain at least one finite verb-ish word — heuristic: has a space.
    if " " not in t:
        return True
    return False


def classify_claim_type(text: str) -> str:
    """
    Order matters: more specific patterns first so that a sentence with both
    a number AND a comparison is labelled `comparative` not `statistical`.
    """
    if has_quote(text):
        return "quote"
    if has_comparison(text):
        return "comparative"
    if has_causal(text):
        return "causal"
    if has_number(text):
        return "statistical"
    if has_date(text):
        return "temporal"
    entities = extract_entities(text)
    if entities and any(kw in text.lower() for kw in (" is ", " was ", " are ", " were ", " has ", " have ")):
        return "entity_attribute"
    return "factual"


def score_confidence(text: str, claim_type: str) -> float:
    """
    Confidence score in [0, 1] using deterministic signals. Higher = more
    likely a verifiable factual claim. NOT a probability — just a ranking aid.
    """
    score = 0.4  # baseline for anything that passes is_obvious_non_claim
    if has_number(text):
        score += 0.15
    if has_date(text):
        score += 0.1
    if has_quote(text):
        score += 0.15
    if has_causal(text):
        score += 0.05
    if has_comparison(text):
        score += 0.05
    if len(extract_entities(text)) >= 1:
        score += 0.1
    if claim_type in ("statistical", "quote", "temporal"):
        score += 0.05
    return round(min(score, 0.95), 3)


def evidence_needed(text: str, claim_type: str) -> bool:
    """High-verification-priority signal for the newsroom layer."""
    if claim_type in ("statistical", "causal", "quote", "temporal"):
        return True
    if has_number(text) or has_date(text):
        return True
    return False
