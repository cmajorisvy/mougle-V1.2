"""Bottom-up verification pipeline orchestration."""

from __future__ import annotations

import hashlib
from typing import Optional
from datetime import datetime, timezone

from app.claims.decomposer import decompose_answer_to_claims
from app.config import load_truth_config
from app.graph.provenance_graph import ProvenanceGraph
from app.models import (
    AnswerVerificationRecord,
    AtomicClaim,
    CandidateAnswer,
    ClaimVerdict,
    ClaimVerificationRecord,
    MacroMicroAssessment,
    ProvenancePayload,
    Query,
    TruthMetrics,
    VerdictLabel,
    VerifyRequest,
)
from app.plugins.base import PluginContext
from app.plugins.implementations import (
    ContradictionPressurePlugin,
    ExternalJudgePlugin,
    MacroConsistencyPlugin,
    MicroEvidencePlugin,
    NumericConsistencyPlugin,
    ProvenanceCompletenessPlugin,
    RetrievalSupportPlugin,
    SourceReliabilityPlugin,
    TemporalFreshnessPlugin,
)
from app.retrieval.mock import InMemoryRetriever
from app.scoring.gate import publish_gate
from app.scoring.tmi import compute_tmi
from app.scoring.truth_functional import ScoreInputs, compute_tvs
from app.storage.sqlite_store import SQLiteStore


class VerificationEngine:
    def __init__(self, db_path: str = "truth_pyramid.db") -> None:
        self.config = load_truth_config()
        self.store = SQLiteStore(path=db_path)
        self._graph_by_answer: dict[str, ProvenanceGraph] = {}

    @staticmethod
    def _id(prefix: str, text: str) -> str:
        digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
        return f"{prefix}_{digest}"

    def _verdict_from_plugins(
        self, claim: AtomicClaim, plugin_scores: dict[str, float], corpus_size: int
    ) -> ClaimVerdict:
        reasons: list[str] = []
        micro = plugin_scores.get("micro_evidence", 0.0)
        contradiction = 1.0 - plugin_scores.get("contradiction_pressure", 1.0)
        freshness = plugin_scores.get("temporal_freshness", 0.0)

        if micro < 0.2:
            if corpus_size > 0:
                reasons.append("no retrieved evidence from supplied corpus")
                return ClaimVerdict(
                    claim_id=claim.claim_id,
                    label=VerdictLabel.out_of_domain,
                    confidence=0.4,
                    reasons=reasons,
                )
            reasons.append("insufficient local evidence")
            return ClaimVerdict(
                claim_id=claim.claim_id,
                label=VerdictLabel.not_enough_evidence,
                confidence=0.35,
                reasons=reasons,
            )
        if contradiction > 0.65:
            reasons.append("conflicting evidence pressure")
            return ClaimVerdict(
                claim_id=claim.claim_id,
                label=VerdictLabel.source_conflict,
                confidence=0.55,
                reasons=reasons,
            )
        if freshness < 0.2:
            reasons.append("evidence appears stale")
            return ClaimVerdict(
                claim_id=claim.claim_id,
                label=VerdictLabel.stale,
                confidence=0.55,
                reasons=reasons,
            )

        score = sum(plugin_scores.values()) / max(1, len(plugin_scores))
        if score > 0.58:
            return ClaimVerdict(
                claim_id=claim.claim_id,
                label=VerdictLabel.supported,
                confidence=min(0.95, score),
                reasons=["sufficient multi-plugin support"],
            )
        return ClaimVerdict(
            claim_id=claim.claim_id,
            label=VerdictLabel.refuted,
            confidence=min(0.9, 1.0 - score),
            reasons=["overall plugin support below threshold"],
        )

    def verify(self, payload: VerifyRequest) -> AnswerVerificationRecord:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        query = Query(query_id=self._id("qry", payload.query), text=payload.query)
        answer = CandidateAnswer(
            answer_id=self._id("ans", payload.answer + payload.query),
            query_id=query.query_id,
            text=payload.answer,
        )

        claims = decompose_answer_to_claims(answer.answer_id, answer.text)
        retriever = InMemoryRetriever(payload.corpus)
        claim_to_evidence = {c.claim_id: retriever.retrieve(query, c) for c in claims}

        plugins = [
            SourceReliabilityPlugin(),
            ProvenanceCompletenessPlugin(),
            RetrievalSupportPlugin(),
            ContradictionPressurePlugin(),
            TemporalFreshnessPlugin(),
            NumericConsistencyPlugin(),
            MacroConsistencyPlugin(),
            MicroEvidencePlugin(),
            ExternalJudgePlugin(),
        ]

        graph = ProvenanceGraph()
        claim_records: list[ClaimVerificationRecord] = []

        for claim in claims:
            ctx = PluginContext(
                query=query,
                claim=claim,
                evidences=claim_to_evidence.get(claim.claim_id, []),
                all_claims=claims,
                all_claim_evidence=claim_to_evidence,
                now=now,
            )
            plugin_results = [plugin.evaluate(ctx) for plugin in plugins]
            score_map = {p.plugin_name: p.score for p in plugin_results}
            verdict = self._verdict_from_plugins(claim, score_map, len(payload.corpus))
            record = ClaimVerificationRecord(
                claim=claim,
                evidences=ctx.evidences,
                plugin_results=plugin_results,
                verdict=verdict,
            )
            graph.add_verification_record(query.query_id, answer.answer_id, record)
            claim_records.append(record)

        features = graph.consistency_features()
        all_scores: dict[str, list[float]] = {}
        all_uncertainty: dict[str, list[float]] = {}
        for rec in claim_records:
            for p in rec.plugin_results:
                all_scores.setdefault(p.plugin_name, []).append(p.score)
                all_uncertainty.setdefault(p.plugin_name, []).append(p.uncertainty)

        score_means = {k: sum(v) / len(v) for k, v in all_scores.items()}
        uncertainty_means = {k: sum(v) / len(v) for k, v in all_uncertainty.items()}

        contradiction_penalty = features.get("contradiction_rate", 0.0)
        drift_or_staleness = 1.0 - score_means.get("temporal_freshness", 0.5)

        tvs = compute_tvs(
            ScoreInputs(
                plugin_scores=score_means,
                plugin_uncertainties=uncertainty_means,
                graph_features=features,
                contradiction_penalty=contradiction_penalty,
                drift_or_staleness_penalty=drift_or_staleness,
            ),
            self.config,
        )

        macro = score_means.get("macro_consistency", 0.0)
        micro = score_means.get("micro_evidence", 0.0)
        mm = MacroMicroAssessment(
            macro_score=macro,
            micro_score=micro,
            disagreement=abs(macro - micro),
        )

        mean_uncertainty = sum(uncertainty_means.values()) / max(1, len(uncertainty_means))
        decision = publish_gate(tvs, mm.disagreement, mean_uncertainty, claim_records, self.config)

        tmi = compute_tmi(
            brier_loss=1.0 - (tvs / 100.0),
            cal_loss=mean_uncertainty,
            ood_loss=max(0.0, 0.5 - features.get("coverage", 0.0)),
            drift_loss=drift_or_staleness,
            coverage=features.get("coverage", 0.0),
        )

        if any(c.verdict.label == VerdictLabel.out_of_domain for c in claim_records):
            final = VerdictLabel.out_of_domain
        elif any(c.verdict.label == VerdictLabel.source_conflict for c in claim_records):
            final = VerdictLabel.source_conflict
        elif any(c.verdict.label == VerdictLabel.not_enough_evidence for c in claim_records):
            final = VerdictLabel.not_enough_evidence
        elif all(c.verdict.label == VerdictLabel.supported for c in claim_records):
            final = VerdictLabel.supported
        else:
            final = VerdictLabel.pending_human_review if not decision.publish else VerdictLabel.supported

        provenance = ProvenancePayload(
            query_id=query.query_id,
            answer_id=answer.answer_id,
            claim_ids=[c.claim_id for c in claims],
            graph_snapshot_ref=f"graph:{answer.answer_id}",
            plugin_provenance={
                r.claim.claim_id: {p.plugin_name: p.provenance for p in r.plugin_results}
                for r in claim_records
            },
        )

        out = AnswerVerificationRecord(
            query=query,
            answer=answer,
            claim_records=claim_records,
            macro_micro=mm,
            provenance=provenance,
            truth_metrics=TruthMetrics(tvs=tvs, tmi=tmi),
            publish_decision=decision,
            final_verdict=final,
        )

        self._graph_by_answer[answer.answer_id] = graph
        self.store.save_answer_record(answer.answer_id, out.model_dump(mode="json"))
        self.store.save_graph(answer.answer_id, graph.to_json())
        if not decision.publish:
            self.store.enqueue_unresolved(answer.answer_id, decision.unresolved_reason or "unknown", out.model_dump(mode="json"))
        return out

    def get_graph(self, answer_id: str) -> Optional[dict]:
        in_mem = self._graph_by_answer.get(answer_id)
        if in_mem:
            return in_mem.to_json()
        return self.store.get_graph(answer_id)
