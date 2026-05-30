"""Built-in verification plugins for prototype scoring."""

from __future__ import annotations

import re
from datetime import timedelta

from app.plugins.base import PluginContext, VerificationPlugin, _base_result


_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    """Return normalized lexical tokens for deterministic local evidence checks."""

    return set(_TOKEN_RE.findall(text.lower()))


class SourceReliabilityPlugin(VerificationPlugin):
    name = "source_reliability"

    def evaluate(self, context: PluginContext):
        if not context.evidences:
            return _base_result(self.name, 0.0, 0.9, warnings=["no evidence"])
        reliabilities = [ev.source.reliability for ev in context.evidences]
        score = sum(reliabilities) / len(reliabilities)
        return _base_result(
            self.name,
            score,
            1.0 - min(1.0, len(reliabilities) / 5),
            feature_vector={"mean_source_reliability": score},
        )


class ProvenanceCompletenessPlugin(VerificationPlugin):
    name = "provenance_completeness"

    def evaluate(self, context: PluginContext):
        if not context.evidences:
            return _base_result(self.name, 0.0, 1.0, warnings=["no provenance"])
        checks = []
        for ev in context.evidences:
            fields = [
                bool(ev.source.source_id),
                bool(ev.timestamp),
                bool(ev.source.url_or_path),
                bool(ev.retrieval_method),
                bool(ev.quote),
            ]
            checks.append(sum(1 for x in fields if x) / len(fields))
        score = sum(checks) / len(checks)
        return _base_result(self.name, score, 1 - score)


class RetrievalSupportPlugin(VerificationPlugin):
    name = "retrieval_support"

    def evaluate(self, context: PluginContext):
        count = len(context.evidences)
        score = min(1.0, count / 3)
        return _base_result(
            self.name,
            score,
            1 - score,
            feature_vector={"evidence_count": float(count)},
        )


class ContradictionPressurePlugin(VerificationPlugin):
    name = "contradiction_pressure"

    def evaluate(self, context: PluginContext):
        claim_tokens = _tokens(context.claim.text)
        positive_hits = 0
        contradiction_hits = 0
        negation_terms = {"not", "never", "false", "incorrect", "refutes", "contradicts"}
        for ev in context.evidences:
            ev_tokens = _tokens(ev.text)
            overlaps_claim = bool(claim_tokens & ev_tokens)
            if not overlaps_claim:
                continue
            has_negation = bool(ev_tokens & negation_terms)
            if has_negation:
                contradiction_hits += 1
            else:
                positive_hits += 1
        if contradiction_hits and positive_hits:
            pressure = 1.0
        else:
            pressure = min(1.0, contradiction_hits / max(1, len(context.evidences)))
        score = 1.0 - pressure
        return _base_result(
            self.name,
            score,
            pressure * 0.6,
            feature_vector={"contradiction_pressure": pressure},
        )


class TemporalFreshnessPlugin(VerificationPlugin):
    name = "temporal_freshness"

    def __init__(self, freshness_days: int = 365):
        self.window = timedelta(days=freshness_days)

    def evaluate(self, context: PluginContext):
        if not context.evidences:
            return _base_result(self.name, 0.0, 0.95, warnings=["no timestamped evidence"])
        freshness = []
        for ev in context.evidences:
            if not ev.timestamp:
                freshness.append(0.0)
                continue
            age = context.now - ev.timestamp
            freshness.append(max(0.0, 1.0 - (age.total_seconds() / self.window.total_seconds())))
        score = sum(freshness) / len(freshness)
        return _base_result(self.name, score, 1 - score)


class NumericConsistencyPlugin(VerificationPlugin):
    name = "numeric_consistency"

    _number_re = re.compile(r"\d+(?:\.\d+)?")

    def evaluate(self, context: PluginContext):
        claim_nums = set(self._number_re.findall(context.claim.text))
        if not claim_nums:
            return _base_result(self.name, 1.0, 0.1)
        ev_nums = set()
        for ev in context.evidences:
            ev_nums.update(self._number_re.findall(ev.text))
        matched = len(claim_nums & ev_nums)
        score = matched / max(1, len(claim_nums))
        return _base_result(
            self.name,
            score,
            1 - score,
            warnings=[] if score > 0.5 else ["numeric mismatch"],
            feature_vector={"numeric_consistency": score},
        )


class MacroConsistencyPlugin(VerificationPlugin):
    name = "macro_consistency"

    def evaluate(self, context: PluginContext):
        all_text = " ".join(c.text.lower() for c in context.all_claims)
        contradictions = 0
        for c in context.all_claims:
            text = c.text.lower()
            if " not " in f" {text} " and text.replace(" not ", " ") in all_text:
                contradictions += 1
        ratio = contradictions / max(1, len(context.all_claims))
        score = 1 - min(1.0, ratio)
        return _base_result(self.name, score, ratio)


class MicroEvidencePlugin(VerificationPlugin):
    name = "micro_evidence"

    def evaluate(self, context: PluginContext):
        if not context.evidences:
            return _base_result(self.name, 0.0, 1.0, warnings=["claim has no local evidence"])
        claim_tokens = _tokens(context.claim.text)
        overlaps = []
        for ev in context.evidences:
            ev_tokens = _tokens(ev.text)
            overlaps.append(len(claim_tokens & ev_tokens) / max(1, len(claim_tokens)))
        score = sum(overlaps) / len(overlaps)
        return _base_result(self.name, score, 1 - score)


class ExternalJudgePlugin(VerificationPlugin):
    name = "external_judge"

    def evaluate(self, context: PluginContext):
        # Stub: no external calls. This serves as weighted judge placeholder only.
        score = 0.55 if context.evidences else 0.4
        return _base_result(
            self.name,
            score,
            0.5,
            provenance={"mode": "mock", "note": "external judges are weighted judges, not oracles"},
            warnings=["stub implementation"],
        )


class HardMeshStructuralPlugin(VerificationPlugin):
    name = "hard_mesh_structural"

    def __init__(self, omega: float = 0.5, route: str = "stage_7_verify") -> None:
        self.omega = max(0.0, min(1.0, omega))
        self.route = route

    def evaluate(self, context: PluginContext):
        return _base_result(
            self.name,
            self.omega,
            1.0 - self.omega,
            provenance={"route": self.route, "note": "Stage 6 structural signal, not a truth oracle"},
            feature_vector={"hard_mesh_omega": self.omega},
        )
