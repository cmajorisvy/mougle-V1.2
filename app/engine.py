"""Bottom-up verification pipeline orchestration."""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Optional

from app.agent_collapse import (
    create_collapse_event,
    create_recovery_plan,
    create_restriction,
    create_review,
    evaluate_agent_collapse_risk,
    restore_agent_from_collapse,
    route_high_risk_collapse_to_stage6,
    route_truth_impact_to_knowledge_council,
    write_collapse_audit_log,
)
from app.agent_control import evaluate_agent_action
from app.archive_reuse import build_archive_reuse_matrix, check_runtime_archive_imports
from app.claims.decomposer import decompose_answer_to_claims
from app.config import load_truth_config
from app.council_sockets import CouncilSocketFabric
from app.graph.provenance_graph import ProvenanceGraph
from app.models import (
    AgentActionDecision,
    AgentActionRequest,
    AgentPassport,
    AgentCollapseEvaluation,
    AgentCollapseEvent,
    AgentCollapseEventInput,
    AgentCollapseMetricsInput,
    AgentCollapseRecoveryPlanRequest,
    AgentCollapseRestrictionRequest,
    AgentCollapseRestoreRequest,
    AgentCollapseReviewRequest,
    AnswerVerificationRecord,
    AtomicClaim,
    CandidateAnswer,
    ClaimVerdict,
    ClaimVerificationRecord,
    CouncilSocketDecision,
    CouncilSocketEnvelope,
    MacroMicroAssessment,
    NewsCategory,
    NewsCategoryInput,
    NewsClaim,
    NewsClaimInput,
    NewsCorrectionInput,
    NewsCorrectionRecord,
    NewsEvidence,
    NewsEvidenceInput,
    NewsFeed,
    NewsFeedInput,
    NewsOriginalityReport,
    NewsOutputModality,
    NewsAnchorScript,
    NewsScoreBundle,
    NewsSeoArtifact,
    NewsSfxCueType,
    NewsSource,
    NewsSourceInput,
    NewsStudioAiReconstructionLabel,
    NewsStudioRightsCheck,
    NewsStudioSfxCue,
    NewsStage6SubmissionPacket,
    NewsStage7CandidateRoute,
    NewsToDebateHandoff,
    NewsVideoBulletin,
    NewsVideoBulletinInput,
    NewsroomAuditLog,
    NewsroomPackage,
    NewsroomPackageInput,
    NewsroomRiskAlert,
    NewsroomScriptInput,
    NewsroomSafetyBoundaries,
    NormalizedNewsArticle,
    PodcastAgentInvitation,
    PodcastAgentInvitationInput,
    PodcastClaimReview,
    PodcastClaimReviewInput,
    PodcastCouncilAuditLog,
    PodcastDebateClaim,
    PodcastDebateClaimInput,
    PodcastDebateTurn,
    PodcastDebateTurnInput,
    PodcastEvidenceSubmission,
    PodcastEvidenceSubmissionInput,
    PodcastExpertCall,
    PodcastExpertCallInput,
    PodcastParticipant,
    PodcastParticipantInput,
    PodcastRoom,
    PodcastRoomInput,
    PodcastRoomRiskAlert,
    PodcastSession,
    PodcastSessionInput,
    PodcastStage6SubmissionPacket,
    PodcastStage7CandidateRoute,
    ProvenancePayload,
    QueryTankItem,
    Query,
    RawNewsItem,
    RawNewsItemInput,
    SignalEvent,
    SignalProcessingRecord,
    Stage7ExternalRecord,
    Stage7ExternalRecordInput,
    Stage7ResolutionRequest,
    Stage7SubmissionPackage,
    StageRoute,
    CollapseState,
    TruthMetrics,
    VerdictLabel,
    VerifyRequest,
)
from app.newsrooms_council import (
    build_newsroom_dashboard_cards as news_build_dashboard_cards,
    build_newsroom_dashboard_pages as news_build_dashboard_pages,
    build_dashboard_safety_invariants as news_build_safety_invariants,
    build_newsroom_safety_boundaries as news_build_safety_boundaries,
    build_hreflang_cluster as news_build_hreflang_cluster,
    build_news_sitemap_entry as news_build_sitemap_entry,
    build_originality_report as news_build_originality_report,
    build_modality_divergence_report as news_build_modality_divergence_report,
    build_rights_check as news_build_rights_check,
    build_sfx_plan as news_build_sfx_plan,
    build_studio_cues as news_build_studio_cues,
    build_video_seo_artifact as news_build_video_seo_artifact,
    create_correction_record as news_create_correction_record,
    create_manual_news_claim as news_create_manual_claim,
    create_news_feed as news_create_feed,
    create_news_category as news_create_category,
    create_news_to_debate_handoff as news_create_debate_handoff,
    create_anchor_script as news_create_anchor_script,
    create_video_bulletin as news_create_video_bulletin,
    create_newsroom_audit_log as news_write_audit_log,
    create_newsroom_candidate as news_create_candidate,
    create_newsroom_package as news_create_package,
    create_newsroom_risk_alert as news_create_risk_alert,
    create_newsroom_script as news_create_script,
    create_seo_artifact as news_create_seo_artifact,
    create_score_bundle as news_create_score_bundle,
    deduplicate_news_article as news_dedupe_article,
    dedupe_alerts as news_dedupe_alerts,
    extract_news_claims as news_extract_claims,
    ingest_news_item as news_ingest_item,
    normalize_news_article as news_normalize_article,
    register_news_source as news_register_source,
    route_news_claim_to_stage7 as news_route_stage7,
    structured_data_for_text_artifact as news_structured_data_for_text_artifact,
    submit_news_claim_to_stage6 as news_submit_stage6,
    submit_news_evidence as news_submit_evidence,
)
from app.plugins.base import PluginContext
from app.plugins.implementations import (
    ContradictionPressurePlugin,
    ExternalJudgePlugin,
    HardMeshStructuralPlugin,
    MacroConsistencyPlugin,
    MicroEvidencePlugin,
    NumericConsistencyPlugin,
    ProvenanceCompletenessPlugin,
    RetrievalSupportPlugin,
    SourceReliabilityPlugin,
    TemporalFreshnessPlugin,
)
from app.podcast_council import (
    add_participant as podcast_add_participant,
    build_dashboard_cards as podcast_build_dashboard_cards,
    build_dashboard_pages as podcast_build_dashboard_pages,
    build_room_risk_alerts as podcast_build_room_risk_alerts,
    build_stage6_packet as podcast_build_stage6_packet,
    build_stage7_input_for_claim as podcast_build_stage7_input,
    build_stage7_route as podcast_build_stage7_route,
    compute_room_reputation as podcast_compute_room_reputation,
    create_agent_invitation as podcast_create_agent_invitation,
    create_claim as podcast_create_claim,
    create_expert_call as podcast_create_expert_call,
    create_room as podcast_create_room,
    create_session as podcast_create_session,
    create_turn as podcast_create_turn,
    dedupe_alerts as podcast_dedupe_alerts,
    review_claim as podcast_review_claim,
    submit_evidence as podcast_submit_evidence,
    write_audit_log as podcast_write_audit_log,
)
from app.retrieval.mock import InMemoryRetriever
from app.scoring.gate import publish_gate
from app.scoring.tmi import compute_tmi
from app.scoring.truth_functional import ScoreInputs, compute_tvs
from app.signal_culture import load_reduction_summary, process_signal_event
from app.stage7 import (
    build_query_tank_item,
    build_stage7_alerts,
    create_stage7_external_record,
    package_stage7_for_stage6,
    resolve_stage7_query_tank,
)
from app.stage6.pipeline import HardMeshPipeline
from app.storage.sqlite_store import SQLiteStore
from app.topology import build_topological_evolution_record, build_topology_snapshot


class VerificationEngine:
    def __init__(self, db_path: str = "truth_pyramid.db") -> None:
        self.config = load_truth_config()
        db_path = os.getenv("TRUTH_PYRAMID_DB_PATH", db_path)
        self.store = SQLiteStore(path=db_path)
        self._graph_by_answer: dict[str, ProvenanceGraph] = {}
        self.council_fabric = CouncilSocketFabric()

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
        run_config = self.config.copy()
        hard_cfg = dict(run_config.get("hard_mesh", {}))
        if "enable_hard_mesh" in payload.options:
            hard_cfg["enabled"] = bool(payload.options.get("enable_hard_mesh"))
        run_config["hard_mesh"] = hard_cfg
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
        hard_mesh, feature_bundle, cluster_run = HardMeshPipeline(run_config).run(
            query=query,
            answer=answer,
            claim_records=claim_records,
            graph_features=features,
            now=now,
        )

        hard_mesh_plugin = HardMeshStructuralPlugin(hard_mesh.omega, hard_mesh.route.value)
        for record in claim_records:
            ctx = PluginContext(
                query=query,
                claim=record.claim,
                evidences=record.evidences,
                all_claims=claims,
                all_claim_evidence=claim_to_evidence,
                now=now,
            )
            record.plugin_results.append(hard_mesh_plugin.evaluate(ctx))

        graph.add_hard_mesh_result(answer.answer_id, claim_records, hard_mesh)
        topology = build_topology_snapshot(graph.graph)
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
        out_of_domain_penalty = hard_mesh.feature_payload.get("out_of_domain_penalty", 0.0)

        tvs = compute_tvs(
            ScoreInputs(
                plugin_scores=score_means,
                plugin_uncertainties=uncertainty_means,
                graph_features=features,
                hard_mesh_features=hard_mesh.feature_payload,
                contradiction_penalty=contradiction_penalty,
                drift_or_staleness_penalty=drift_or_staleness,
                out_of_domain_penalty=out_of_domain_penalty,
            ),
            run_config,
        )

        macro = score_means.get("macro_consistency", 0.0)
        micro = score_means.get("micro_evidence", 0.0)
        mm = MacroMicroAssessment(
            macro_score=macro,
            micro_score=micro,
            disagreement=abs(macro - micro),
            disagreement_reason="aligned" if abs(macro - micro) <= 0.3 else "macro/micro evidence disagreement",
        )

        mean_uncertainty = sum(uncertainty_means.values()) / max(1, len(uncertainty_means))
        decision = publish_gate(
            tvs,
            mm.disagreement,
            mean_uncertainty,
            claim_records,
            run_config,
            hard_mesh=hard_mesh,
        )

        tmi_cfg = run_config.get("tmi", {})
        tmi = compute_tmi(
            brier_loss=1.0 - (tvs / 100.0),
            cal_loss=mean_uncertainty,
            ood_loss=max(out_of_domain_penalty, 0.5 - features.get("coverage", 0.0)),
            drift_loss=drift_or_staleness,
            coverage=features.get("coverage", 0.0),
            alpha=float(tmi_cfg.get("alpha", 0.25)),
            beta=float(tmi_cfg.get("beta", 0.2)),
            gamma=float(tmi_cfg.get("gamma", 0.2)),
            delta=float(tmi_cfg.get("delta", 0.2)),
            eta=float(tmi_cfg.get("eta", 0.15)),
        )

        if any(c.verdict.label == VerdictLabel.out_of_domain for c in claim_records):
            final = VerdictLabel.out_of_domain
        elif any(c.verdict.label == VerdictLabel.source_conflict for c in claim_records):
            final = VerdictLabel.source_conflict
        elif any(c.verdict.label == VerdictLabel.stale for c in claim_records):
            final = VerdictLabel.stale
        elif any(c.verdict.label == VerdictLabel.refuted for c in claim_records):
            final = VerdictLabel.refuted
        elif any(c.verdict.label == VerdictLabel.not_enough_evidence for c in claim_records):
            final = VerdictLabel.not_enough_evidence
        elif hard_mesh.route == StageRoute.stage_7_verify:
            final = VerdictLabel.pending_human_review
        elif all(c.verdict.label == VerdictLabel.supported for c in claim_records):
            final = VerdictLabel.supported
        else:
            final = VerdictLabel.pending_human_review if not decision.publish else VerdictLabel.supported

        claim_rollup: dict[str, int] = {}
        for record in claim_records:
            label = record.verdict.label.value
            claim_rollup[label] = claim_rollup.get(label, 0) + 1
        confidence_explanation = (
            f"TVS {tvs:.2f} with HARD-MESH omega {hard_mesh.omega:.3f}; "
            f"macro={mm.macro_score:.2f}, micro={mm.micro_score:.2f}, "
            f"route={hard_mesh.route.value}."
        )

        provenance = ProvenancePayload(
            query_id=query.query_id,
            answer_id=answer.answer_id,
            claim_ids=[c.claim_id for c in claims],
            graph_snapshot_ref=f"graph:{answer.answer_id}",
            plugin_provenance={
                r.claim.claim_id: {p.plugin_name: p.provenance for p in r.plugin_results}
                for r in claim_records
            },
            hard_mesh_ref=f"hard_mesh:{answer.answer_id}",
            topology_ref=topology.snapshot_id,
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
            confidence_explanation=confidence_explanation,
            claim_rollup=claim_rollup,
            hard_mesh=hard_mesh,
            topology=topology,
        )

        self._graph_by_answer[answer.answer_id] = graph
        self.store.save_answer_record(answer.answer_id, out.model_dump(mode="json"))
        self.store.save_graph(answer.answer_id, graph.to_json())
        self.store.save_hard_mesh(
            answer.answer_id,
            hard_mesh.model_dump(mode="json") | {"feature_bundle": feature_bundle.model_dump(mode="json")},
            [lane.model_dump(mode="json") for lane in cluster_run.lane_results],
        )
        self.store.save_topology(answer.answer_id, topology.model_dump(mode="json"))
        evolution = build_topological_evolution_record(
            topology,
            answer_id=answer.answer_id,
            event_refs=[f"hard_mesh:{answer.answer_id}"],
            route_hint=hard_mesh.route.value,
        )
        self.store.save_topology_evolution(evolution)
        if hard_mesh.query_tank_item:
            self.store.enqueue_query_tank(QueryTankItem(**hard_mesh.query_tank_item))
        if not decision.publish:
            self.store.enqueue_unresolved(
                answer.answer_id,
                decision.unresolved_reason or "unknown",
                out.model_dump(mode="json"),
            )
        return out

    def get_graph(self, answer_id: str) -> Optional[dict]:
        in_mem = self._graph_by_answer.get(answer_id)
        if in_mem:
            return in_mem.to_json()
        return self.store.get_graph(answer_id)

    def list_query_tank(self) -> list[dict]:
        return self.store.list_query_tank()

    def submit_council_event(
        self, envelope: CouncilSocketEnvelope
    ) -> tuple[CouncilSocketEnvelope, CouncilSocketDecision]:
        accepted_envelope, decision = self.council_fabric.submit(envelope)
        self.store.save_council_socket_event(accepted_envelope, decision)
        if decision.route.value == "query_tank_pending":
            self.store.enqueue_query_tank(
                QueryTankItem(
                    query_id=envelope.request_id,
                    answer_id=envelope.socket_id,
                    reason=decision.route_reason,
                    category="council_policy",
                    required_next_action="policy_or_human_review",
                )
            )
        return accepted_envelope, decision

    def list_council_events(self) -> list[dict]:
        return self.store.list_council_socket_events()

    def list_topology_evolution(self) -> list[dict]:
        return self.store.list_topology_evolution()

    def evaluate_agent_action_request(
        self, request: AgentActionRequest, passport: AgentPassport
    ) -> AgentActionDecision:
        decision = evaluate_agent_action(request, passport)
        self.store.save_agent_action_decision(decision)
        if decision.council_socket:
            envelope = CouncilSocketEnvelope(**decision.council_socket)
            self.submit_council_event(envelope)
        return decision

    def process_signal(self, event: SignalEvent, hints: dict | None = None) -> SignalProcessingRecord:
        record = process_signal_event(event, hints)
        self.store.save_signal_processing_record(record)
        return record

    def signal_load_reduction(self) -> dict[str, float | int]:
        records = [SignalProcessingRecord(**row) for row in self.store.list_signal_processing_records()]
        return load_reduction_summary(records)

    def create_stage7_external_record(self, payload: Stage7ExternalRecordInput) -> Stage7ExternalRecord:
        record = create_stage7_external_record(payload)
        self.store.save_stage7_external_record(record)
        if record.status.value in {"unresolved", "disputed", "unknown"}:
            self.store.enqueue_query_tank(build_query_tank_item(record))
        return record

    def list_stage7_external_records(self) -> list[dict]:
        return self.store.list_stage7_external_records()

    def resolve_stage7_query_tank(self, request: Stage7ResolutionRequest) -> Stage7ExternalRecord:
        raw = self.store.get_stage7_external_record(request.record_id)
        if raw is None:
            raise ValueError("stage7 record not found")
        record = resolve_stage7_query_tank(Stage7ExternalRecord(**raw), request)
        self.store.save_stage7_external_record(record)
        self.store.enqueue_query_tank(build_query_tank_item(record))
        return record

    def submit_stage7_record_to_stage6(self, record_id: str) -> Stage7SubmissionPackage:
        raw = self.store.get_stage7_external_record(record_id)
        if raw is None:
            raise ValueError("stage7 record not found")
        record = Stage7ExternalRecord(**raw)
        package = package_stage7_for_stage6(record)
        self.store.save_stage7_external_record(record)
        self.store.save_stage7_submission_package(package)
        return package

    def stage7_alerts(self) -> list[dict]:
        records = [Stage7ExternalRecord(**row) for row in self.store.list_stage7_external_records()]
        return [alert.model_dump(mode="json") for alert in build_stage7_alerts(records)]

    def register_news_source(self, payload: NewsSourceInput) -> NewsSource:
        source, reliability = news_register_source(payload)
        self.store.save_news_source(source)
        self.store.save_news_source_reliability_record(reliability)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "source_registered",
                entity_type="news_source",
                entity_id=source.source_id,
                actor_id="newsrooms_council",
                metadata={
                    "source_reliability": reliability.score,
                    "source_reliability_is_truth_score": False,
                    "external_calls_made": False,
                },
            )
        )
        return source

    def list_news_sources(self) -> list[dict]:
        return self.store.list_news_sources()

    def get_news_source(self, source_id: str) -> NewsSource:
        return self._news_source(source_id)

    def create_news_category(self, payload: NewsCategoryInput) -> NewsCategory:
        parent = self._news_category(payload.parent_category_id) if payload.parent_category_id else None
        category = news_create_category(payload, parent)
        self.store.save_news_category(category)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "category_created",
                entity_type="news_category",
                entity_id=category.category_id,
                actor_id="newsrooms_council",
                metadata={
                    "parent_category_id": category.parent_category_id,
                    "public_url": category.public_url,
                    "depth": category.depth,
                },
            )
        )
        return category

    def list_news_categories(self) -> list[dict]:
        return self.store.list_news_categories()

    def create_news_feed(self, payload: NewsFeedInput) -> NewsFeed:
        source = self._news_source(payload.source_id)
        feed = news_create_feed(source, payload)
        self.store.save_news_feed(feed)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "feed_created",
                entity_type="news_feed",
                entity_id=feed.feed_id,
                actor_id="newsrooms_council",
                metadata={"source_id": source.source_id, "external_calls_made": False},
            )
        )
        return feed

    def list_news_feeds(self) -> list[dict]:
        return self.store.list_news_feeds()

    def ingest_news_feed_item(self, feed_id: str, payload: RawNewsItemInput) -> dict:
        feed = self._news_feed(feed_id)
        source = self._news_source(feed.source_id)
        raw, event = news_ingest_item(feed, source, payload)
        self.store.save_raw_news_item(raw)
        self.store.save_news_ingest_event(event)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "article_ingested",
                entity_type="raw_news_item",
                entity_id=raw.raw_item_id,
                actor_id="newsrooms_council",
                metadata={"feed_id": feed_id, "external_calls_made": False},
            )
        )
        return {
            "raw_item": raw.model_dump(mode="json"),
            "ingest_event": event.model_dump(mode="json"),
        }

    def create_news_article(self, payload: RawNewsItemInput) -> RawNewsItem:
        if not payload.source_id:
            raise ValueError("source_id is required for direct article ingestion")
        source = self._news_source(payload.source_id)
        raw, event = news_ingest_item(None, source, payload)
        self.store.save_raw_news_item(raw)
        self.store.save_news_ingest_event(event)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "article_created",
                entity_type="raw_news_item",
                entity_id=raw.raw_item_id,
                actor_id="newsrooms_council",
                metadata={"external_calls_made": False, "no_production_db": True},
            )
        )
        return raw

    def list_news_articles(self) -> dict:
        return {
            "raw_items": self.store.list_raw_news_items(),
            "normalized_articles": self.store.list_normalized_news_articles(),
        }

    def get_news_article_detail(self, article_id: str) -> dict:
        raw = self.store.get_raw_news_item(article_id)
        normalized = self.store.get_normalized_news_article(article_id)
        if normalized is None and raw is not None:
            normalized = self.store.get_normalized_news_article_for_raw_item(article_id)
        if raw is None and normalized is None:
            raise ValueError("news article not found")
        return {
            "raw_item": raw,
            "article": normalized,
            "claims": self.store.list_news_claims(article_id=normalized["article_id"]) if normalized else [],
            "risk_alerts": (
                self.store.list_newsroom_risk_alerts(article_id=normalized["article_id"])
                if normalized
                else []
            ),
        }

    def normalize_news_article(self, article_id: str) -> NormalizedNewsArticle:
        existing = self.store.get_normalized_news_article(article_id)
        if existing is None:
            existing = self.store.get_normalized_news_article_for_raw_item(article_id)
        if existing is not None:
            return NormalizedNewsArticle(**existing)
        raw = self._raw_news_item(article_id)
        source = self._news_source(raw.source_id)
        article = news_normalize_article(raw, source)
        existing_articles = [
            NormalizedNewsArticle(**row) for row in self.store.list_normalized_news_articles()
        ]
        article = news_dedupe_article(article, existing_articles)
        self.store.save_normalized_news_article(article)
        self._save_news_score_bundle(article.article_id)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "article_normalized",
                entity_type="normalized_news_article",
                entity_id=article.article_id,
                article_id=article.article_id,
                metadata={
                    "raw_item_id": raw.raw_item_id,
                    "newsworthiness_is_truth_score": False,
                    "may_publish_truth": False,
                },
            )
        )
        return article

    def extract_news_article_claims(self, article_id: str) -> dict:
        article = self._news_article(article_id)
        claims, updated_article = news_extract_claims(article)
        for claim in claims:
            self.store.save_news_claim(claim)
        self.store.save_normalized_news_article(updated_article)
        bundle = self._save_news_score_bundle(article.article_id)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "claims_extracted",
                entity_type="normalized_news_article",
                entity_id=article.article_id,
                article_id=article.article_id,
                metadata={"claim_count": len(claims), "stage6_required": True},
            )
        )
        return {
            "article": updated_article.model_dump(mode="json"),
            "claims": [claim.model_dump(mode="json") for claim in claims],
            "score_bundle": bundle.model_dump(mode="json"),
        }

    def create_news_claim(self, payload: NewsClaimInput) -> NewsClaim:
        article = self._news_article(payload.article_id)
        claim = news_create_manual_claim(payload, article.source_id)
        self.store.save_news_claim(claim)
        self._save_news_score_bundle(article.article_id)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "claim_created",
                entity_type="news_claim",
                entity_id=claim.claim_id,
                article_id=claim.article_id,
                claim_id=claim.claim_id,
                actor_id=payload.claimant_id,
                metadata={"candidate_only": True, "stage6_required": True},
            )
        )
        return claim

    def list_news_claims(self) -> list[dict]:
        return self.store.list_news_claims()

    def get_news_claim(self, claim_id: str) -> NewsClaim:
        return self._news_claim(claim_id)

    def submit_news_claim_evidence(self, claim_id: str, payload: NewsEvidenceInput) -> NewsEvidence:
        claim = self._news_claim(claim_id)
        evidence, updated_claim = news_submit_evidence(claim, payload)
        self.store.save_news_evidence(evidence)
        self.store.save_news_claim(updated_claim)
        self._save_news_score_bundle(claim.article_id)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "evidence_submitted",
                entity_type="news_evidence",
                entity_id=evidence.evidence_id,
                article_id=claim.article_id,
                claim_id=claim.claim_id,
                actor_id=payload.submitted_by,
                metadata={"no_fabricated_evidence_attestation": True, "external_calls_made": False},
            )
        )
        return evidence

    def route_news_claim_stage7(self, claim_id: str) -> dict:
        claim = self._news_claim(claim_id)
        evidence = self._news_evidence_for_claim(claim_id)
        stage7_input = news_create_candidate(claim, evidence)
        record = create_stage7_external_record(stage7_input)
        self.store.save_stage7_external_record(record)
        if record.status.value in {"unresolved", "disputed", "unknown"}:
            self.store.enqueue_query_tank(build_query_tank_item(record))
        route, updated_claim = news_route_stage7(claim, record)
        self.store.save_news_stage7_route(route)
        self.store.save_news_claim(updated_claim)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "claim_routed_stage7",
                entity_type="news_claim",
                entity_id=claim.claim_id,
                article_id=claim.article_id,
                claim_id=claim.claim_id,
                metadata={
                    "stage7_record_id": record.record_id,
                    "candidate_only": True,
                    "stage6_required": True,
                    "query_tank_handoff": record.status.value in {"unresolved", "disputed", "unknown"},
                },
            )
        )
        return {"route": route.model_dump(mode="json"), "stage7_record": record.model_dump(mode="json")}

    def submit_news_claim_stage6(self, claim_id: str) -> NewsStage6SubmissionPacket:
        claim = self._news_claim(claim_id)
        route_raw = self.store.get_news_stage7_route_for_claim(claim_id)
        if route_raw is None:
            route_payload = self.route_news_claim_stage7(claim_id)
            route = NewsStage7CandidateRoute(**route_payload["route"])
            record = Stage7ExternalRecord(**route_payload["stage7_record"])
            claim = self._news_claim(claim_id)
        else:
            route = NewsStage7CandidateRoute(**route_raw)
            raw_record = self.store.get_stage7_external_record(route.stage7_record_id)
            if raw_record is None:
                raise ValueError("stage7 record not found for news claim")
            record = Stage7ExternalRecord(**raw_record)
        package = package_stage7_for_stage6(record)
        self.store.save_stage7_external_record(record)
        self.store.save_stage7_submission_package(package)
        evidence = self._news_evidence_for_claim(claim_id)
        packet, updated_claim = news_submit_stage6(claim, route, package, evidence)
        self.store.save_news_stage6_packet(packet)
        self.store.save_news_claim(updated_claim)
        self._maybe_save_news_risk_alert(updated_claim)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "claim_submitted_stage6",
                entity_type="news_claim",
                entity_id=claim.claim_id,
                article_id=claim.article_id,
                claim_id=claim.claim_id,
                metadata={
                    "packet_id": packet.packet_id,
                    "stage7_submission_id": package.submission_id,
                    "candidate_answer_not_verified": True,
                },
            )
        )
        return packet

    def create_newsroom_package(self, payload: NewsroomPackageInput) -> NewsroomPackage:
        article = self._news_article(payload.article_id)
        claims = self._news_claims_for_article(article.article_id)
        if payload.claim_ids:
            requested = set(payload.claim_ids)
            claims = [claim for claim in claims if claim.claim_id in requested]
        bundle = self._save_news_score_bundle(article.article_id)
        package = news_create_package(payload, article, claims, bundle)
        self.store.save_newsroom_package(package)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "package_created",
                entity_type="newsroom_package",
                entity_id=package.package_id,
                article_id=article.article_id,
                actor_id=payload.editor_id,
                metadata={"modality": package.modality.value, "stage6_required_for_truth": True},
            )
        )
        return package

    def list_newsroom_packages(self) -> list[dict]:
        return self.store.list_newsroom_packages()

    def get_newsroom_package_detail(self, package_id: str) -> dict:
        package = self._newsroom_package(package_id)
        return {
            "package": package.model_dump(mode="json"),
            "scripts": self.store.list_newsroom_scripts(package_id),
            "segments": self.store.list_newsroom_segments(package_id),
            "handoffs": [
                row
                for row in self.store.list_news_to_debate_handoffs(article_id=package.article_id)
                if row.get("package_id") == package_id
            ],
        }

    def create_news_video_bulletin(
        self, package_id: str, payload: NewsVideoBulletinInput
    ) -> NewsVideoBulletin:
        package = self._newsroom_package(package_id)
        article = self._news_article(package.article_id)
        bulletin = news_create_video_bulletin(package, article, payload)
        self.store.save_news_video_bulletin(bulletin)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "video_bulletin_created",
                entity_type="news_video_bulletin",
                entity_id=bulletin.bulletin_id,
                article_id=article.article_id,
                metadata={
                    "data_control_layer_only": True,
                    "no_real_video_generation": True,
                    "no_hardware_execution": True,
                    "no_platform_publish": True,
                },
            )
        )
        return bulletin

    def list_news_video_bulletins(self) -> list[dict]:
        return self.store.list_news_video_bulletins()

    def get_news_video_bulletin_detail(self, bulletin_id: str) -> dict:
        bulletin = self._news_video_bulletin(bulletin_id)
        return {
            "bulletin": bulletin.model_dump(mode="json"),
            "anchor_scripts": self.store.list_news_anchor_scripts(bulletin_id),
            "anchor_script_lines": self.store.list_news_anchor_script_lines(bulletin_id),
            "robot_explainer_cues": self.store.list_news_robot_explainer_cues(bulletin_id),
            "scene_cues": self.store.list_news_studio_scene_cues(bulletin_id),
            "screen_states": self.store.list_news_studio_screen_states(bulletin_id),
            "sfx_cues": self.store.list_news_studio_sfx_cues(bulletin_id),
            "lower_thirds": self.store.list_news_studio_lower_thirds(bulletin_id),
            "ticker_items": self.store.list_news_studio_ticker_items(bulletin_id),
            "asset_requirements": self.store.list_news_studio_asset_requirements(bulletin_id),
            "rights_checks": self.store.list_news_studio_rights_checks(bulletin_id),
            "ai_reconstruction_labels": self.store.list_news_studio_ai_reconstruction_labels(bulletin_id),
            "video_seo_artifacts": self.store.list_news_video_seo_artifacts(bulletin_id),
            "video_sitemap_entries": self.store.list_news_video_sitemap_entries(bulletin_id),
            "modality_divergence_reports": self.store.list_news_modality_divergence_reports(bulletin_id),
        }

    def create_news_video_anchor_script(self, bulletin_id: str) -> dict:
        bulletin = self._news_video_bulletin(bulletin_id)
        package = self._newsroom_package(bulletin.package_id)
        claims = self._news_claims_for_ids(package.claim_ids)
        script, lines = news_create_anchor_script(bulletin, package, claims)
        self.store.save_news_anchor_script(script)
        for line in lines:
            self.store.save_news_anchor_script_line(line)
        return {
            "anchor_script": script.model_dump(mode="json"),
            "lines": [line.model_dump(mode="json") for line in lines],
        }

    def create_news_video_studio_cues(self, bulletin_id: str) -> dict:
        bulletin = self._news_video_bulletin(bulletin_id)
        package = self._newsroom_package(bulletin.package_id)
        claims = self._news_claims_for_ids(package.claim_ids)
        robot, scenes, screens, lower_thirds, tickers, requirements, labels = news_build_studio_cues(
            bulletin, claims
        )
        for item in robot:
            self.store.save_news_robot_explainer_cue(item)
        for item in scenes:
            self.store.save_news_studio_scene_cue(item)
        for item in screens:
            self.store.save_news_studio_screen_state(item)
        for item in lower_thirds:
            self.store.save_news_studio_lower_third(item)
        for item in tickers:
            self.store.save_news_studio_ticker_item(item)
        for item in requirements:
            self.store.save_news_studio_asset_requirement(item)
        for item in labels:
            self.store.save_news_studio_ai_reconstruction_label(item)
        return {
            "robot_explainer_cues": [item.model_dump(mode="json") for item in robot],
            "scene_cues": [item.model_dump(mode="json") for item in scenes],
            "screen_states": [item.model_dump(mode="json") for item in screens],
            "lower_thirds": [item.model_dump(mode="json") for item in lower_thirds],
            "ticker_items": [item.model_dump(mode="json") for item in tickers],
            "asset_requirements": [item.model_dump(mode="json") for item in requirements],
            "ai_reconstruction_labels": [item.model_dump(mode="json") for item in labels],
        }

    def create_news_video_sfx_plan(self, bulletin_id: str, payload: dict | None = None) -> dict:
        payload = payload or {}
        bulletin = self._news_video_bulletin(bulletin_id)
        cue_types = [NewsSfxCueType(value) for value in payload.get("cue_types", ["neutral_bed"])]
        story_categories = [str(value) for value in payload.get("story_categories", [])]
        cues = news_build_sfx_plan(bulletin, cue_types, story_categories)
        for cue in cues:
            self.store.save_news_studio_sfx_cue(cue)
        return {"sfx_cues": [cue.model_dump(mode="json") for cue in cues]}

    def create_news_video_rights_check(self, bulletin_id: str) -> NewsStudioRightsCheck:
        bulletin = self._news_video_bulletin(bulletin_id)
        labels = [
            NewsStudioAiReconstructionLabel(**row)
            for row in self.store.list_news_studio_ai_reconstruction_labels(bulletin_id)
        ]
        sfx_cues = [NewsStudioSfxCue(**row) for row in self.store.list_news_studio_sfx_cues(bulletin_id)]
        check = news_build_rights_check(bulletin, labels, sfx_cues)
        self.store.save_news_studio_rights_check(check)
        return check

    def create_news_video_seo(self, bulletin_id: str) -> dict:
        bulletin = self._news_video_bulletin(bulletin_id)
        package = self._newsroom_package(bulletin.package_id)
        article = self._news_article(bulletin.article_id)
        seo, sitemap = news_build_video_seo_artifact(bulletin, package, article)
        self.store.save_news_video_seo_artifact(seo)
        self.store.save_news_video_sitemap_entry(sitemap)
        return {
            "video_seo_artifact": seo.model_dump(mode="json"),
            "video_sitemap_entry": sitemap.model_dump(mode="json"),
        }

    def create_news_modality_divergence(self, bulletin_id: str, payload: dict | None = None) -> dict:
        payload = payload or {}
        bulletin = self._news_video_bulletin(bulletin_id)
        package = self._newsroom_package(bulletin.package_id)
        scripts = [NewsAnchorScript(**row) for row in self.store.list_news_anchor_scripts(bulletin_id)]
        if scripts:
            script = scripts[0]
        else:
            created = self.create_news_video_anchor_script(bulletin_id)
            script = NewsAnchorScript(**created["anchor_script"])
        text_variant = str(payload.get("text_variant") or "")
        if not text_variant:
            latest_seo = self.store.get_latest_news_seo_artifact(bulletin.article_id)
            text_variant = latest_seo.get("body_text", package.title) if latest_seo else package.title
        report = news_build_modality_divergence_report(bulletin, package, text_variant, script)
        self.store.save_news_modality_divergence_report(report)
        return report.model_dump(mode="json")

    def create_news_article_seo_artifact(self, article_id: str, payload: dict | None = None) -> dict:
        payload = payload or {}
        article = self._news_article(article_id)
        return self._create_and_save_news_text_artifact(
            article=article,
            package=None,
            output_type=NewsOutputModality(payload.get("output_type", NewsOutputModality.reported_news_article.value)),
            payload=payload,
        )

    def get_news_article_seo_artifact(self, article_id: str) -> dict:
        latest = self.store.get_latest_news_seo_artifact(article_id)
        if latest is None:
            raise ValueError("news SEO artifact not found")
        return {
            "seo_artifact": latest,
            "structured_data": self.store.list_news_structured_data_artifacts(article_id=article_id),
            "originality_reports": self.store.list_news_originality_reports(article_id=article_id),
            "sitemap_entries": [
                row for row in self.store.list_news_sitemap_entries() if row.get("url") == latest["canonical_url"]
            ],
        }

    def check_news_article_originality(self, article_id: str, payload: dict | None = None) -> NewsOriginalityReport:
        payload = payload or {}
        article = self._news_article(article_id)
        evidence = [NewsEvidence(**row) for row in self.store.list_news_evidence(article_id=article.article_id)]
        generated_text = str(payload.get("generated_text") or payload.get("draft_text") or article.normalized_text)
        threshold = float(payload.get("threshold", 0.72))
        report = news_build_originality_report(
            article_id=article.article_id,
            package_id=payload.get("package_id"),
            generated_text=generated_text,
            source_texts=[article.normalized_text, *[item.text for item in evidence]],
            source_refs=[article.source_id, *[item.evidence_id for item in evidence]],
            threshold=threshold,
        )
        self.store.save_news_originality_report(report)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "originality_checked",
                entity_type="news_originality_report",
                entity_id=report.report_id,
                article_id=article.article_id,
                metadata={"blocked": report.blocked, "originality_score": report.originality_score},
            )
        )
        return report

    def create_newsroom_text_article(self, package_id: str, payload: dict | None = None) -> dict:
        return self._create_package_text_output(
            package_id,
            NewsOutputModality.reported_news_article,
            payload or {},
        )

    def create_newsroom_live_blog_update(self, package_id: str, payload: dict | None = None) -> dict:
        return self._create_package_text_output(
            package_id,
            NewsOutputModality.live_blog_update,
            payload or {},
        )

    def create_newsroom_blog_post(self, package_id: str, payload: dict | None = None) -> dict:
        return self._create_package_text_output(
            package_id,
            NewsOutputModality.blog_explainer,
            payload or {},
        )

    def create_newsroom_script(self, package_id: str, payload: NewsroomScriptInput) -> dict:
        package = self._newsroom_package(package_id)
        claims = self._news_claims_for_ids(package.claim_ids)
        script, segments, updated_package = news_create_script(package, claims, payload)
        self.store.save_newsroom_script(script)
        for segment in segments:
            self.store.save_newsroom_segment(segment)
        self.store.save_newsroom_package(updated_package)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "script_created",
                entity_type="newsroom_script",
                entity_id=script.script_id,
                article_id=package.article_id,
                metadata={"preview_only_studio_cues": True, "hardware_execution": False},
            )
        )
        return {
            "script": script.model_dump(mode="json"),
            "segments": [segment.model_dump(mode="json") for segment in segments],
        }

    def create_news_to_debate_handoff(self, package_id: str) -> NewsToDebateHandoff:
        package = self._newsroom_package(package_id)
        claims = self._news_claims_for_ids(package.claim_ids)
        handoff = news_create_debate_handoff(package, claims)
        package.status = type(package.status).debate_handoff_ready
        self.store.save_news_to_debate_handoff(handoff)
        self.store.save_newsroom_package(package)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "news_to_debate_handoff_created",
                entity_type="news_to_debate_handoff",
                entity_id=handoff.handoff_id,
                article_id=package.article_id,
                metadata={"candidate_only": True, "stage6_required": True},
            )
        )
        return handoff

    def create_news_correction(self, payload: NewsCorrectionInput) -> NewsCorrectionRecord:
        correction = news_create_correction_record(payload)
        self.store.save_news_correction_record(correction)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "correction_recorded",
                entity_type="news_correction_record",
                entity_id=correction.correction_id,
                article_id=correction.article_id,
                claim_id=correction.claim_id,
                actor_id=payload.requested_by,
                metadata={"candidate_only": True, "may_publish_truth": False},
            )
        )
        return correction

    def newsroom_risk_alerts(self) -> list[dict]:
        return self.store.list_newsroom_risk_alerts()

    def newsroom_audit_logs(self) -> list[dict]:
        return self.store.list_newsroom_audit_logs()

    def newsroom_dashboard_cards(self) -> list[dict]:
        cards = self._newsroom_dashboard_cards()
        return [card.model_dump(mode="json") for card in cards]

    def newsroom_dashboard_pages(self) -> list[dict]:
        cards = self._newsroom_dashboard_cards()
        articles = [
            NormalizedNewsArticle(**row) for row in self.store.list_normalized_news_articles()
        ]
        alerts = [NewsroomRiskAlert(**row) for row in self.store.list_newsroom_risk_alerts()]
        audit_logs = [NewsroomAuditLog(**row) for row in self.store.list_newsroom_audit_logs()]
        pages = news_build_dashboard_pages(cards, articles, alerts, audit_logs)
        return [page.model_dump(mode="json") for page in pages]

    def newsroom_safety_boundaries(self) -> NewsroomSafetyBoundaries:
        return news_build_safety_boundaries()

    def dashboard_safety_invariants(self) -> dict:
        invariants = news_build_safety_invariants()
        return {
            "invariant_count": len(invariants),
            "all_enforced": all(item["enforced"] is True for item in invariants),
            "safety_invariants": invariants,
        }

    def newsroom_dashboard_page(self) -> dict:
        raw_items = self.store.list_raw_news_items()
        articles = self.store.list_normalized_news_articles()
        claims = self.store.list_news_claims()
        seo_artifacts = self.store.list_news_seo_artifacts()
        live_updates = [
            row
            for row in seo_artifacts
            if row.get("output_type") in {NewsOutputModality.live_blog_update.value, NewsOutputModality.live_update.value}
        ]
        text_blogs = [
            row
            for row in seo_artifacts
            if row.get("output_type")
            in {
                NewsOutputModality.reported_news_article.value,
                NewsOutputModality.text_article.value,
                NewsOutputModality.blog_explainer.value,
                NewsOutputModality.correction_notice.value,
            }
        ]
        scene_cues = self.store.list_news_studio_scene_cues()
        screen_states = self.store.list_news_studio_screen_states()
        sfx_cues = self.store.list_news_studio_sfx_cues()
        lower_thirds = self.store.list_news_studio_lower_thirds()
        tickers = self.store.list_news_studio_ticker_items()
        ai_labels = self.store.list_news_studio_ai_reconstruction_labels()
        tabs = [
            {"tab_id": "sources", "title": "Sources", "count": len(self.store.list_news_sources()), "items": self.store.list_news_sources()},
            {"tab_id": "feeds", "title": "Feeds", "count": len(self.store.list_news_feeds()), "items": self.store.list_news_feeds()},
            {"tab_id": "articles", "title": "Articles", "count": len(raw_items), "items": {"raw_items": raw_items, "normalized_articles": articles}},
            {"tab_id": "claims", "title": "Claims", "count": len(claims), "items": claims},
            {"tab_id": "text_blogs", "title": "Text Blogs", "count": len(text_blogs), "items": text_blogs},
            {"tab_id": "live_updates", "title": "Live Updates", "count": len(live_updates), "items": live_updates},
            {"tab_id": "seo_artifacts", "title": "SEO Artifacts", "count": len(seo_artifacts), "items": seo_artifacts},
            {"tab_id": "stage7_candidates", "title": "Stage 7 Candidates", "count": len(self.store.list_news_stage7_routes()), "items": self.store.list_news_stage7_routes()},
            {"tab_id": "stage6_packets", "title": "Stage 6 Packets", "count": len(self.store.list_news_stage6_packets()), "items": self.store.list_news_stage6_packets()},
            {"tab_id": "video_bulletins", "title": "Video Bulletins", "count": len(self.store.list_news_video_bulletins()), "items": self.store.list_news_video_bulletins()},
            {
                "tab_id": "studio_cues",
                "title": "Studio Cues",
                "count": len(scene_cues) + len(screen_states) + len(sfx_cues) + len(lower_thirds) + len(tickers),
                "items": {
                    "scene_cues": scene_cues,
                    "screen_states": screen_states,
                    "sfx_cues": sfx_cues,
                    "lower_thirds": lower_thirds,
                    "ticker_items": tickers,
                    "ai_reconstruction_labels": ai_labels,
                },
            },
            {"tab_id": "corrections", "title": "Corrections", "count": len(self.store.list_news_correction_records()), "items": self.store.list_news_correction_records()},
            {"tab_id": "risk_alerts", "title": "Risk Alerts", "count": len(self.store.list_newsroom_risk_alerts()), "items": self.store.list_newsroom_risk_alerts()},
            {"tab_id": "audit_trail", "title": "Audit Trail", "count": len(self.store.list_newsroom_audit_logs()), "items": self.store.list_newsroom_audit_logs()},
            {"tab_id": "safety_boundaries", "title": "Safety Boundaries", "count": 14, "items": self.dashboard_safety_invariants()},
        ]
        return {
            "path": "/newsrooms",
            "page_id": "newsrooms",
            "title": "Newsrooms Council",
            "tabs": tabs,
            "cards": self.newsroom_dashboard_cards(),
            "safety_boundaries": self.newsroom_safety_boundaries().model_dump(mode="json"),
            "safety_invariants": self.dashboard_safety_invariants()["safety_invariants"],
            "no_external_calls": True,
            "no_production_db": True,
        }

    def newsroom_seo_dashboard(self) -> dict:
        artifacts = self.store.list_news_seo_artifacts()
        structured = self.store.list_news_structured_data_artifacts()
        sitemap = self.store.list_news_sitemap_entries()
        clusters = self.store.list_news_canonical_clusters()
        return {
            "seo_artifacts": len(artifacts),
            "structured_data_artifacts": len(structured),
            "sitemap_entries": len(sitemap),
            "news_sitemap_entries": sum(1 for row in sitemap if row.get("is_news") is True),
            "canonical_clusters": len(clusters),
            "no_real_publishing": True,
            "external_calls_made": False,
        }

    def newsroom_originality_dashboard(self) -> dict:
        reports = self.store.list_news_originality_reports()
        blocked = [row for row in reports if row.get("blocked") is True]
        return {
            "originality_reports": len(reports),
            "blocked_outputs": len(blocked),
            "route_for_rewrite": sum(1 for row in reports if row.get("route_for_rewrite") is True),
            "generated_from_claim_graph": all(row.get("generated_from_claim_graph") is True for row in reports),
            "no_external_calls": True,
        }

    def newsroom_studio_cues_dashboard(self) -> dict:
        scene_cues = self.store.list_news_studio_scene_cues()
        screen_states = self.store.list_news_studio_screen_states()
        sfx_cues = self.store.list_news_studio_sfx_cues()
        labels = self.store.list_news_studio_ai_reconstruction_labels()
        return {
            "scene_cues": len(scene_cues),
            "screen_states": len(screen_states),
            "sfx_cues": len(sfx_cues),
            "ai_reconstruction_labels": len(labels),
            "controlled_mgl_targets_only": all(
                str(row.get("target", "")).startswith("MGL_") for row in [*scene_cues, *screen_states]
            ),
            "no_hardware_execution": all(
                row.get("hardware_execution_command") is False for row in [*scene_cues, *screen_states]
            ),
            "no_platform_publish": True,
        }

    def newsroom_video_bulletins_dashboard(self) -> dict:
        bulletins = self.store.list_news_video_bulletins()
        video_seo = self.store.list_news_video_seo_artifacts()
        sitemap = self.store.list_news_video_sitemap_entries()
        return {
            "video_bulletins": len(bulletins),
            "video_seo_artifacts": len(video_seo),
            "video_sitemap_entries": len(sitemap),
            "no_real_video_generation": True,
            "no_platform_publish": all(row.get("no_platform_publish") is True for row in bulletins),
        }

    def newsroom_video_safety_dashboard(self) -> dict:
        checks = self.store.list_news_studio_rights_checks()
        reports = self.store.list_news_modality_divergence_reports()
        return {
            "rights_checks": len(checks),
            "rights_checks_passed": sum(1 for row in checks if row.get("passed") is True),
            "modality_divergence_reports": len(reports),
            "bounded_divergence": all(0.0 <= row.get("modality_divergence", 0.0) <= 1.0 for row in reports),
            "studio_output_may_publish_truth": False,
            "studio_output_may_update_stage1": False,
            "studio_output_may_update_stage4": False,
        }

    def _create_package_text_output(
        self,
        package_id: str,
        output_type: NewsOutputModality,
        payload: dict,
    ) -> dict:
        package = self._newsroom_package(package_id)
        article = self._news_article(package.article_id)
        return self._create_and_save_news_text_artifact(
            article=article,
            package=package,
            output_type=output_type,
            payload=payload,
        )

    def _create_and_save_news_text_artifact(
        self,
        *,
        article: NormalizedNewsArticle,
        package: NewsroomPackage | None,
        output_type: NewsOutputModality,
        payload: dict,
    ) -> dict:
        claims = self._news_claims_for_ids(package.claim_ids) if package else self._news_claims_for_article(article.article_id)
        evidence = [NewsEvidence(**row) for row in self.store.list_news_evidence(article_id=article.article_id)]
        artifact, report = news_create_seo_artifact(
            article=article,
            package=package,
            claims=claims,
            evidence=evidence,
            output_type=output_type,
            locale=str(payload.get("locale", "en")),
            section=str(payload.get("section", "news")),
            subsection=payload.get("subsection"),
            topic=payload.get("topic"),
            image=payload.get("image"),
            threshold=float(payload.get("threshold", 0.72)),
        )
        structured_data = news_structured_data_for_text_artifact(artifact, article)
        sitemap_entry = news_build_sitemap_entry(artifact, article)
        variant_urls = payload.get("hreflang_variants") if isinstance(payload.get("hreflang_variants"), dict) else None
        cluster, hreflang_variants = news_build_hreflang_cluster(
            canonical_url=artifact.canonical_url,
            locale=artifact.locale,
            article_id=article.article_id,
            package_id=package.package_id if package else None,
            variant_urls=variant_urls,
        )
        artifact.structured_data_ids = [item.artifact_id for item in structured_data]
        artifact.sitemap_entry_id = sitemap_entry.entry_id
        artifact.originality_report_id = report.report_id
        self.store.save_news_seo_artifact(artifact)
        self.store.save_news_originality_report(report)
        self.store.save_news_sitemap_entry(sitemap_entry)
        self.store.save_news_canonical_cluster(cluster)
        for variant in hreflang_variants:
            self.store.save_news_hreflang_variant(variant)
        for item in structured_data:
            self.store.save_news_structured_data_artifact(item)
        self.store.save_newsroom_audit_log(
            news_write_audit_log(
                "seo_text_output_created",
                entity_type="news_seo_artifact",
                entity_id=artifact.artifact_id,
                article_id=article.article_id,
                metadata={
                    "output_type": artifact.output_type.value,
                    "originality_blocked": report.blocked,
                    "generated_from_claim_graph": True,
                    "no_real_publishing": True,
                    "external_calls_made": False,
                },
            )
        )
        return {
            "seo_artifact": artifact.model_dump(mode="json"),
            "originality_report": report.model_dump(mode="json"),
            "structured_data": [item.model_dump(mode="json") for item in structured_data],
            "sitemap_entry": sitemap_entry.model_dump(mode="json"),
            "canonical_cluster": cluster.model_dump(mode="json"),
            "hreflang_variants": [variant.model_dump(mode="json") for variant in hreflang_variants],
        }

    def _save_news_score_bundle(self, article_id: str) -> NewsScoreBundle:
        article = self._news_article(article_id)
        source = self._news_source(article.source_id)
        claims = self._news_claims_for_article(article.article_id)
        evidence = [NewsEvidence(**row) for row in self.store.list_news_evidence(article_id=article.article_id)]
        bundle = news_create_score_bundle(article, source, claims, evidence)
        self.store.save_news_score_bundle(bundle)
        if bundle.editorial_risk >= 0.65:
            alert = news_create_risk_alert(
                article_id=article.article_id,
                claim_id=None,
                risk_score=bundle.editorial_risk,
                reason="editorial risk score requires Stage 6-aware review",
            )
            self.store.save_newsroom_risk_alert(alert)
        return bundle

    def _maybe_save_news_risk_alert(self, claim: NewsClaim) -> None:
        if claim.priority < 0.65:
            return
        alert = news_create_risk_alert(
            article_id=claim.article_id,
            claim_id=claim.claim_id,
            risk_score=claim.priority,
            reason="high-priority newsroom claim submitted to Stage 6",
        )
        existing = [
            NewsroomRiskAlert(**row)
            for row in self.store.list_newsroom_risk_alerts(article_id=claim.article_id)
        ]
        for deduped in news_dedupe_alerts([*existing, alert]):
            self.store.save_newsroom_risk_alert(deduped)

    def _newsroom_dashboard_cards(self) -> list:
        sources = [NewsSource(**row) for row in self.store.list_news_sources()]
        feeds = [NewsFeed(**row) for row in self.store.list_news_feeds()]
        raw_items = [RawNewsItem(**row) for row in self.store.list_raw_news_items()]
        articles = [
            NormalizedNewsArticle(**row) for row in self.store.list_normalized_news_articles()
        ]
        claims = [NewsClaim(**row) for row in self.store.list_news_claims()]
        routes = [NewsStage7CandidateRoute(**row) for row in self.store.list_news_stage7_routes()]
        packets = [NewsStage6SubmissionPacket(**row) for row in self.store.list_news_stage6_packets()]
        packages = [NewsroomPackage(**row) for row in self.store.list_newsroom_packages()]
        seo_artifacts = [NewsSeoArtifact(**row) for row in self.store.list_news_seo_artifacts()]
        video_bulletins = [NewsVideoBulletin(**row) for row in self.store.list_news_video_bulletins()]
        labels = [
            NewsStudioAiReconstructionLabel(**row)
            for row in self.store.list_news_studio_ai_reconstruction_labels()
        ]
        corrections = [NewsCorrectionRecord(**row) for row in self.store.list_news_correction_records()]
        alerts = [NewsroomRiskAlert(**row) for row in self.store.list_newsroom_risk_alerts()]
        return news_build_dashboard_cards(
            sources,
            feeds,
            raw_items,
            articles,
            claims,
            routes,
            packets,
            packages,
            seo_artifacts,
            video_bulletins,
            labels,
            corrections,
            alerts,
        )

    def _news_source(self, source_id: str) -> NewsSource:
        raw = self.store.get_news_source(source_id)
        if raw is None:
            raise ValueError("news source not found")
        return NewsSource(**raw)

    def _news_category(self, category_id: str) -> NewsCategory:
        raw = self.store.get_news_category(category_id)
        if raw is None:
            raise ValueError("news category not found")
        return NewsCategory(**raw)

    def _news_feed(self, feed_id: str) -> NewsFeed:
        raw = self.store.get_news_feed(feed_id)
        if raw is None:
            raise ValueError("news feed not found")
        return NewsFeed(**raw)

    def _raw_news_item(self, raw_item_id: str) -> RawNewsItem:
        raw = self.store.get_raw_news_item(raw_item_id)
        if raw is None:
            raise ValueError("raw news item not found")
        return RawNewsItem(**raw)

    def _news_article(self, article_id: str) -> NormalizedNewsArticle:
        raw = self.store.get_normalized_news_article(article_id)
        if raw is None:
            raw = self.store.get_normalized_news_article_for_raw_item(article_id)
        if raw is None:
            raise ValueError("normalized news article not found")
        return NormalizedNewsArticle(**raw)

    def _news_claim(self, claim_id: str) -> NewsClaim:
        raw = self.store.get_news_claim(claim_id)
        if raw is None:
            raise ValueError("news claim not found")
        return NewsClaim(**raw)

    def _news_evidence_for_claim(self, claim_id: str) -> list[NewsEvidence]:
        return [NewsEvidence(**row) for row in self.store.list_news_evidence(claim_id=claim_id)]

    def _news_claims_for_article(self, article_id: str) -> list[NewsClaim]:
        return [NewsClaim(**row) for row in self.store.list_news_claims(article_id=article_id)]

    def _news_claims_for_ids(self, claim_ids: list[str]) -> list[NewsClaim]:
        return [self._news_claim(claim_id) for claim_id in claim_ids]

    def _newsroom_package(self, package_id: str) -> NewsroomPackage:
        raw = self.store.get_newsroom_package(package_id)
        if raw is None:
            raise ValueError("newsroom package not found")
        return NewsroomPackage(**raw)

    def _news_video_bulletin(self, bulletin_id: str) -> NewsVideoBulletin:
        raw = self.store.get_news_video_bulletin(bulletin_id)
        if raw is None:
            raise ValueError("news video bulletin not found")
        return NewsVideoBulletin(**raw)

    def create_podcast_room(self, payload: PodcastRoomInput) -> PodcastRoom:
        room = podcast_create_room(payload)
        self.store.save_podcast_room(room)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "room_created",
                room_id=room.room_id,
                actor_id=payload.host_user_id,
                metadata={"title": room.title, "candidate_only": True},
            )
        )
        return room

    def list_podcast_rooms(self) -> list[dict]:
        return self.store.list_podcast_rooms()

    def get_podcast_room_detail(self, room_id: str) -> dict:
        room = self._podcast_room(room_id)
        return {
            "room": room.model_dump(mode="json"),
            "sessions": self.store.list_podcast_sessions(room_id),
            "participants": self.store.list_podcast_participants(room_id),
            "expert_calls": self.store.list_podcast_expert_calls(room_id),
            "agent_invitations": self.store.list_podcast_agent_invitations(room_id),
            "claims": self.store.list_podcast_debate_claims(room_id=room_id),
            "risk_alerts": self.podcast_room_risk_alerts(room_id),
        }

    def create_podcast_session(self, room_id: str, payload: PodcastSessionInput) -> PodcastSession:
        room = self._podcast_room(room_id)
        session = podcast_create_session(room, payload)
        self.store.save_podcast_session(session)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "session_created",
                room_id=room_id,
                session_id=session.session_id,
                actor_id=payload.created_by,
                metadata={"objective": session.objective},
            )
        )
        return session

    def add_podcast_participant(
        self, room_id: str, payload: PodcastParticipantInput
    ) -> PodcastParticipant:
        room = self._podcast_room(room_id)
        participant = podcast_add_participant(room, payload)
        self.store.save_podcast_participant(participant)
        self._refresh_podcast_room(room_id)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "participant_added",
                room_id=room_id,
                actor_id=payload.invited_by or payload.participant_id,
                metadata={
                    "participant_id": payload.participant_id,
                    "role": payload.role.value,
                    "local_readiness_not_truth_score": True,
                },
            )
        )
        return participant

    def create_podcast_expert_call(
        self, room_id: str, payload: PodcastExpertCallInput
    ) -> PodcastExpertCall:
        room = self._podcast_room(room_id)
        call = podcast_create_expert_call(room, payload)
        self.store.save_podcast_expert_call(call)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "call_for_experts_created",
                room_id=room_id,
                actor_id=payload.requested_by,
                metadata={
                    "topic": call.topic,
                    "expertise_required": call.expertise_required,
                    "min_reputation": call.min_reputation,
                },
            )
        )
        return call

    def create_podcast_agent_invitation(
        self, room_id: str, payload: PodcastAgentInvitationInput
    ) -> PodcastAgentInvitation:
        room = self._podcast_room(room_id)
        invitation = podcast_create_agent_invitation(room, payload)
        self.store.save_podcast_agent_invitation(invitation)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "agent_invitation_created",
                room_id=room_id,
                actor_id=payload.requested_by,
                metadata={
                    "agent_id": invitation.agent_id,
                    "status": invitation.status.value,
                    "target_stage": invitation.target_stage,
                    "local_readiness_not_truth_score": True,
                    "may_publish_truth": False,
                },
            )
        )
        self.podcast_room_risk_alerts(room_id)
        return invitation

    def create_podcast_debate_turn(
        self, session_id: str, payload: PodcastDebateTurnInput
    ) -> PodcastDebateTurn:
        session = self._podcast_session(session_id)
        turn = podcast_create_turn(session, payload)
        self.store.save_podcast_debate_turn(turn)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "debate_turn_recorded",
                room_id=turn.room_id,
                session_id=session_id,
                actor_id=payload.speaker_id,
                metadata={"turn_type": turn.turn_type},
            )
        )
        return turn

    def create_podcast_debate_claim(
        self, session_id: str, payload: PodcastDebateClaimInput
    ) -> PodcastDebateClaim:
        session = self._podcast_session(session_id)
        claim = podcast_create_claim(session, payload)
        self.store.save_podcast_debate_claim(claim)
        self._refresh_podcast_room(claim.room_id)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "debate_claim_recorded",
                room_id=claim.room_id,
                session_id=session_id,
                claim_id=claim.claim_id,
                actor_id=payload.claimant_id,
                metadata={"candidate_only": True, "stage6_required": True},
            )
        )
        return claim

    def submit_podcast_evidence(
        self, claim_id: str, payload: PodcastEvidenceSubmissionInput
    ) -> PodcastEvidenceSubmission:
        claim = self._podcast_claim(claim_id)
        evidence = podcast_submit_evidence(claim, payload)
        self.store.save_podcast_evidence_submission(evidence)
        self._refresh_podcast_room(claim.room_id)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "evidence_submitted",
                room_id=claim.room_id,
                session_id=claim.session_id,
                claim_id=claim.claim_id,
                actor_id=payload.submitted_by,
                metadata={
                    "evidence_id": evidence.evidence_id,
                    "no_fabricated_evidence_attestation": True,
                },
            )
        )
        return evidence

    def review_podcast_claim(
        self, claim_id: str, payload: PodcastClaimReviewInput
    ) -> PodcastClaimReview:
        claim = self._podcast_claim(claim_id)
        review, updated_claim = podcast_review_claim(claim, payload)
        self.store.save_podcast_claim_review(review)
        self.store.save_podcast_debate_claim(updated_claim)
        self._refresh_podcast_room(claim.room_id)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "claim_review_recorded",
                room_id=claim.room_id,
                session_id=claim.session_id,
                claim_id=claim.claim_id,
                actor_id=payload.reviewer_id,
                metadata={
                    "verdict": review.verdict.value,
                    "stage6_required": True,
                    "may_publish_truth": False,
                },
            )
        )
        return review

    def route_podcast_claim_stage7(self, claim_id: str) -> dict:
        claim = self._podcast_claim(claim_id)
        evidence = self._podcast_evidence_for_claim(claim_id)
        reviews = self._podcast_reviews_for_claim(claim_id)
        stage7_input = podcast_build_stage7_input(claim, evidence, reviews)
        record = create_stage7_external_record(stage7_input)
        self.store.save_stage7_external_record(record)
        if record.status.value in {"unresolved", "disputed", "unknown"}:
            self.store.enqueue_query_tank(build_query_tank_item(record))
        route, updated_claim = podcast_build_stage7_route(claim, record)
        self.store.save_podcast_stage7_route(route)
        self.store.save_podcast_debate_claim(updated_claim)
        self._refresh_podcast_room(claim.room_id)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "claim_routed_stage7",
                room_id=claim.room_id,
                session_id=claim.session_id,
                claim_id=claim.claim_id,
                metadata={
                    "stage7_record_id": record.record_id,
                    "candidate_only": True,
                    "stage6_required": True,
                },
            )
        )
        return {
            "route": route.model_dump(mode="json"),
            "stage7_record": record.model_dump(mode="json"),
        }

    def submit_podcast_claim_stage6(self, claim_id: str) -> PodcastStage6SubmissionPacket:
        claim = self._podcast_claim(claim_id)
        route_raw = self.store.get_podcast_stage7_route_for_claim(claim_id)
        if route_raw is None:
            route_payload = self.route_podcast_claim_stage7(claim_id)
            route = PodcastStage7CandidateRoute(**route_payload["route"])
            record = Stage7ExternalRecord(**route_payload["stage7_record"])
            claim = self._podcast_claim(claim_id)
        else:
            route = PodcastStage7CandidateRoute(**route_raw)
            raw_record = self.store.get_stage7_external_record(route.stage7_record_id)
            if raw_record is None:
                raise ValueError("stage7 record not found for podcast claim")
            record = Stage7ExternalRecord(**raw_record)
        package = package_stage7_for_stage6(record)
        self.store.save_stage7_external_record(record)
        self.store.save_stage7_submission_package(package)
        evidence = self._podcast_evidence_for_claim(claim_id)
        reviews = self._podcast_reviews_for_claim(claim_id)
        packet, updated_claim = podcast_build_stage6_packet(claim, route, package, evidence, reviews)
        self.store.save_podcast_stage6_packet(packet)
        self.store.save_podcast_debate_claim(updated_claim)
        self._refresh_podcast_room(claim.room_id)
        self._save_podcast_audit(
            podcast_write_audit_log(
                "claim_submitted_stage6",
                room_id=claim.room_id,
                session_id=claim.session_id,
                claim_id=claim.claim_id,
                metadata={
                    "packet_id": packet.packet_id,
                    "stage7_submission_id": package.submission_id,
                    "candidate_answer_not_verified": True,
                },
            )
        )
        return packet

    def podcast_room_risk_alerts(self, room_id: str) -> list[dict]:
        room = self._refresh_podcast_room(room_id)
        claims = [PodcastDebateClaim(**row) for row in self.store.list_podcast_debate_claims(room_id=room_id)]
        evidence = [
            PodcastEvidenceSubmission(**row)
            for row in self.store.list_podcast_evidence_submissions(room_id=room_id)
        ]
        reviews = [PodcastClaimReview(**row) for row in self.store.list_podcast_claim_reviews(room_id=room_id)]
        invitations = [
            PodcastAgentInvitation(**row)
            for row in self.store.list_podcast_agent_invitations(room_id=room_id)
        ]
        existing = [
            PodcastRoomRiskAlert(**row)
            for row in self.store.list_podcast_room_risk_alerts(room_id)
        ]
        generated = podcast_build_room_risk_alerts(room, claims, evidence, reviews, invitations)
        alerts = podcast_dedupe_alerts([*existing, *generated])
        for alert in alerts:
            self.store.save_podcast_room_risk_alert(alert)
        return [alert.model_dump(mode="json") for alert in alerts]

    def list_podcast_audit_logs(self, room_id: str | None = None) -> list[dict]:
        return self.store.list_podcast_council_audit_logs(room_id)

    def podcast_dashboard_cards(self) -> list[dict]:
        cards = self._podcast_dashboard_cards()
        return [card.model_dump(mode="json") for card in cards]

    def podcast_dashboard_pages(self) -> list[dict]:
        cards = self._podcast_dashboard_cards()
        rooms = [PodcastRoom(**row) for row in self.store.list_podcast_rooms()]
        alerts = [PodcastRoomRiskAlert(**row) for row in self.store.list_podcast_room_risk_alerts()]
        audit_logs = [
            PodcastCouncilAuditLog(**row) for row in self.store.list_podcast_council_audit_logs()
        ]
        pages = podcast_build_dashboard_pages(cards, rooms, alerts, audit_logs)
        return [page.model_dump(mode="json") for page in pages]

    def _podcast_dashboard_cards(self) -> list:
        rooms = [PodcastRoom(**row) for row in self.store.list_podcast_rooms()]
        sessions = [PodcastSession(**row) for row in self.store.list_podcast_sessions()]
        claims = [PodcastDebateClaim(**row) for row in self.store.list_podcast_debate_claims()]
        routes = [
            PodcastStage7CandidateRoute(**row) for row in self.store.list_podcast_stage7_routes()
        ]
        packets = [
            PodcastStage6SubmissionPacket(**row) for row in self.store.list_podcast_stage6_packets()
        ]
        alerts = [PodcastRoomRiskAlert(**row) for row in self.store.list_podcast_room_risk_alerts()]
        return podcast_build_dashboard_cards(rooms, sessions, claims, routes, packets, alerts)

    def _podcast_room(self, room_id: str) -> PodcastRoom:
        raw = self.store.get_podcast_room(room_id)
        if raw is None:
            raise ValueError("podcast room not found")
        return PodcastRoom(**raw)

    def _podcast_session(self, session_id: str) -> PodcastSession:
        raw = self.store.get_podcast_session(session_id)
        if raw is None:
            raise ValueError("podcast session not found")
        return PodcastSession(**raw)

    def _podcast_claim(self, claim_id: str) -> PodcastDebateClaim:
        raw = self.store.get_podcast_debate_claim(claim_id)
        if raw is None:
            raise ValueError("podcast claim not found")
        return PodcastDebateClaim(**raw)

    def _podcast_evidence_for_claim(self, claim_id: str) -> list[PodcastEvidenceSubmission]:
        return [
            PodcastEvidenceSubmission(**row)
            for row in self.store.list_podcast_evidence_submissions(claim_id=claim_id)
        ]

    def _podcast_reviews_for_claim(self, claim_id: str) -> list[PodcastClaimReview]:
        return [
            PodcastClaimReview(**row) for row in self.store.list_podcast_claim_reviews(claim_id=claim_id)
        ]

    def _refresh_podcast_room(self, room_id: str) -> PodcastRoom:
        room = self._podcast_room(room_id)
        participants = [
            PodcastParticipant(**row) for row in self.store.list_podcast_participants(room_id)
        ]
        claims = [PodcastDebateClaim(**row) for row in self.store.list_podcast_debate_claims(room_id=room_id)]
        evidence = [
            PodcastEvidenceSubmission(**row)
            for row in self.store.list_podcast_evidence_submissions(room_id=room_id)
        ]
        reviews = [PodcastClaimReview(**row) for row in self.store.list_podcast_claim_reviews(room_id=room_id)]
        alerts = [PodcastRoomRiskAlert(**row) for row in self.store.list_podcast_room_risk_alerts(room_id)]
        room = podcast_compute_room_reputation(room, participants, claims, evidence, reviews, alerts)
        self.store.save_podcast_room(room)
        return room

    def _save_podcast_audit(self, audit: PodcastCouncilAuditLog) -> None:
        self.store.save_podcast_council_audit_log(audit)

    def evaluate_collapse_risk(
        self, agent_id: str, metrics: AgentCollapseMetricsInput
    ) -> AgentCollapseEvaluation:
        evaluation = evaluate_agent_collapse_risk(agent_id, metrics)
        self.store.save_agent_collapse_metrics(evaluation.metrics)
        audit = write_collapse_audit_log(
            agent_id, None, "collapse_risk_evaluated", evaluation.model_dump(mode="json")
        )
        self.store.save_agent_collapse_audit_log(audit)
        return evaluation

    def create_collapse_event(self, agent_id: str, payload: AgentCollapseEventInput) -> AgentCollapseEvent:
        latest = self.store.get_latest_agent_collapse_event(agent_id)
        current = CollapseState(latest["to_state"]) if latest else CollapseState.HEALTHY
        event, evaluation, audit = create_collapse_event(agent_id, payload, current)
        self.store.save_agent_collapse_metrics(evaluation.metrics)
        self.store.save_agent_collapse_event(event)
        self.store.save_agent_collapse_audit_log(audit)
        if event.stage6_route_required:
            self.store.enqueue_query_tank(
                QueryTankItem(
                    query_id=event.event_id,
                    answer_id=event.event_id,
                    reason="agent collapse requires Stage 6 verification",
                    category="agent_collapse",
                    required_next_action="route_to_stage6_or_council_review",
                )
            )
        return event

    def list_collapse_events(self, agent_id: str | None = None) -> list[dict]:
        return self.store.list_agent_collapse_events(agent_id)

    def get_collapse_state(self, agent_id: str) -> dict:
        latest = self.store.get_latest_agent_collapse_event(agent_id)
        if latest is None:
            return {"agent_id": agent_id, "state": CollapseState.HEALTHY.value, "events": []}
        return {"agent_id": agent_id, "state": latest["to_state"], "latest_event": latest}

    def create_collapse_restriction(
        self, agent_id: str, payload: AgentCollapseRestrictionRequest
    ) -> dict:
        restriction, audit = create_restriction(agent_id, payload)
        self.store.save_agent_collapse_restriction(restriction)
        self.store.save_agent_collapse_audit_log(audit)
        return {"restriction": restriction.model_dump(mode="json"), "audit": audit.model_dump(mode="json")}

    def create_collapse_recovery_plan(
        self, agent_id: str, payload: AgentCollapseRecoveryPlanRequest
    ) -> dict:
        plan = create_recovery_plan(agent_id, payload)
        audit = write_collapse_audit_log(agent_id, payload.event_id, "recovery_plan_created", plan.model_dump(mode="json"))
        self.store.save_agent_collapse_recovery_plan(plan)
        self.store.save_agent_collapse_audit_log(audit)
        return {"plan": plan.model_dump(mode="json"), "audit": audit.model_dump(mode="json")}

    def create_collapse_review(self, agent_id: str, payload: AgentCollapseReviewRequest) -> dict:
        review, audit = create_review(agent_id, payload)
        self.store.save_agent_collapse_review(review)
        self.store.save_agent_collapse_audit_log(audit)
        return {"review": review.model_dump(mode="json"), "audit": audit.model_dump(mode="json")}

    def restore_collapse_agent(self, agent_id: str, payload: AgentCollapseRestoreRequest) -> dict:
        latest = self.store.get_latest_agent_collapse_event(agent_id)
        current = CollapseState(latest["to_state"]) if latest else CollapseState.HEALTHY
        decision = restore_agent_from_collapse(agent_id, current, payload)
        self.store.save_agent_collapse_audit_log(
            write_collapse_audit_log(agent_id, payload.event_id, "restore_decision_recorded", decision.model_dump(mode="json"))
        )
        return decision.model_dump(mode="json")

    def collapse_alerts(self) -> list[dict]:
        return [
            event
            for event in self.store.list_agent_collapse_events()
            if event.get("to_state") in {"RESTRICTED", "EMERGENCY_RESTRICTED", "BLOCKED"}
        ]

    def collapse_metrics_summary(self) -> dict:
        events = self.store.list_agent_collapse_events()
        return {
            "total_events": len(events),
            "emergency_restricted": sum(1 for event in events if event.get("to_state") == "EMERGENCY_RESTRICTED"),
            "blocked": sum(1 for event in events if event.get("to_state") == "BLOCKED"),
            "deletes_agent": any(bool(event.get("deletes_agent")) for event in events),
        }

    def route_collapse_event_stage6(self, event_id: str) -> dict:
        event = self._collapse_event_by_id(event_id)
        if event is None:
            raise ValueError("collapse event not found")
        package = route_high_risk_collapse_to_stage6(AgentCollapseEvent(**event))
        self.store.save_agent_collapse_audit_log(
            write_collapse_audit_log(event["agent_id"], event_id, "collapse_routed_stage6", package)
        )
        return package

    def route_collapse_event_truth_impact(self, event_id: str) -> dict:
        event = self._collapse_event_by_id(event_id)
        if event is None:
            raise ValueError("collapse event not found")
        envelope = route_truth_impact_to_knowledge_council(AgentCollapseEvent(**event))
        accepted, decision = self.submit_council_event(CouncilSocketEnvelope(**envelope))
        return {"envelope": accepted.model_dump(mode="json"), "decision": decision.model_dump(mode="json")}

    def _collapse_event_by_id(self, event_id: str) -> dict | None:
        for event in self.store.list_agent_collapse_events():
            if event.get("event_id") == event_id:
                return event
        return None

    def archive_micro_pyramid_candidates(
        self, archive_timestamp: str = "20260529-1150", limit: int | None = None
    ) -> dict:
        archive_root = f"archive/legacy-codebase/{archive_timestamp}"
        matrix = build_archive_reuse_matrix(archive_root, max_candidates=limit)
        return matrix.model_dump(mode="json")

    def archive_runtime_import_check(self) -> dict:
        return check_runtime_archive_imports().model_dump(mode="json")
