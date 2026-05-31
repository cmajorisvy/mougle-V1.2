"""SQLite persistence for verification summaries and graph snapshots."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Optional

from app.models import (
    AgentActionDecision,
    AgentCollapseAuditLog,
    AgentCollapseEvent,
    AgentCollapseMetrics,
    AgentCollapseRecoveryPlan,
    AgentCollapseRestriction,
    AgentCollapseReview,
    CouncilSocketDecision,
    CouncilSocketEnvelope,
    NewsCanonicalCluster,
    NewsCategory,
    NewsClaim,
    NewsCorrectionRecord,
    NewsEvidence,
    NewsFeed,
    NewsHreflangVariant,
    NewsIngestEvent,
    NewsOriginalityReport,
    NewsScoreBundle,
    NewsSeoArtifact,
    NewsSitemapEntry,
    NewsSource,
    NewsSourceReliabilityRecord,
    NewsStructuredDataArtifact,
    NewsStage6SubmissionPacket,
    NewsStage7CandidateRoute,
    NewsToDebateHandoff,
    NewsroomAuditLog,
    NewsroomPackage,
    NewsroomRiskAlert,
    NewsroomScript,
    NewsroomSegment,
    NewsTopic,
    NormalizedNewsArticle,
    PodcastAgentInvitation,
    PodcastClaimReview,
    PodcastCouncilAuditLog,
    PodcastDebateClaim,
    PodcastDebateTurn,
    PodcastEvidenceSubmission,
    PodcastExpertCall,
    PodcastParticipant,
    PodcastRoom,
    PodcastRoomRiskAlert,
    PodcastSession,
    PodcastStage6SubmissionPacket,
    PodcastStage7CandidateRoute,
    QueryTankItem,
    RawNewsItem,
    SignalProcessingRecord,
    Stage7ExternalRecord,
    Stage7SubmissionPackage,
    TopologicalEvolutionRecord,
)


class SQLiteStore:
    def __init__(self, path: str = "truth_pyramid.db") -> None:
        self.path = Path(path)
        self._memory_conn: Optional[sqlite3.Connection] = sqlite3.connect(path) if path == ":memory:" else None
        if self._memory_conn is None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        if self._memory_conn is not None:
            return self._memory_conn
        return sqlite3.connect(self.path)

    def _ensure_columns(self, conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for column, ddl in columns.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS answer_records (
                    answer_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    valid_from TEXT DEFAULT CURRENT_TIMESTAMP,
                    valid_to TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS verification_records (
                    answer_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    valid_from TEXT DEFAULT CURRENT_TIMESTAMP,
                    valid_to TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS claim_records (
                    claim_id TEXT PRIMARY KEY,
                    answer_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS evidence_records (
                    evidence_id TEXT PRIMARY KEY,
                    answer_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS source_records (
                    source_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS graphs (
                    answer_id TEXT PRIMARY KEY,
                    graph_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS hard_mesh_runs (
                    answer_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS hard_mesh_lane_results (
                    answer_id TEXT NOT NULL,
                    lane_name TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(answer_id, lane_name)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS plugin_results (
                    answer_id TEXT NOT NULL,
                    claim_id TEXT NOT NULL,
                    plugin_name TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(answer_id, claim_id, plugin_name)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS unresolved_queue (
                    answer_id TEXT PRIMARY KEY,
                    reason TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS query_tank_items (
                    answer_id TEXT PRIMARY KEY,
                    reason TEXT NOT NULL,
                    category TEXT DEFAULT 'uncertainty',
                    status TEXT DEFAULT 'open',
                    payload_json TEXT NOT NULL,
                    valid_from TEXT DEFAULT CURRENT_TIMESTAMP,
                    valid_to TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS external_verifier_results (
                    answer_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(answer_id, provider)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS topology_snapshots (
                    answer_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS topology_evolution_records (
                    evolution_id TEXT PRIMARY KEY,
                    answer_id TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS council_socket_events (
                    socket_id TEXT PRIMARY KEY,
                    council_id TEXT NOT NULL,
                    route TEXT NOT NULL,
                    policy_decision TEXT NOT NULL,
                    envelope_json TEXT NOT NULL,
                    decision_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_action_decisions (
                    request_id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    action_class TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS signal_events (
                    event_id TEXT PRIMARY KEY,
                    destination_type TEXT NOT NULL,
                    sent_to_main_engine INTEGER NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS signal_vectors (
                    event_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS signal_routes (
                    route_id TEXT PRIMARY KEY,
                    event_id TEXT NOT NULL,
                    destination_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_simulation_runs (
                    sim_run_id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    request_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_micro_pyramid_states (
                    agent_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS stage7_external_records (
                    record_id TEXT PRIMARY KEY,
                    tank TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS stage7_submission_packages (
                    submission_id TEXT PRIMARY KEY,
                    record_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_rooms (
                    room_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    risk_score REAL NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_sessions (
                    session_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_participants (
                    participant_entry_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    participant_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_expert_calls (
                    call_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_agent_invitations (
                    invitation_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_debate_turns (
                    turn_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_debate_claims (
                    claim_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_evidence_submissions (
                    evidence_id TEXT PRIMARY KEY,
                    claim_id TEXT NOT NULL,
                    room_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_claim_reviews (
                    review_id TEXT PRIMARY KEY,
                    claim_id TEXT NOT NULL,
                    room_id TEXT NOT NULL,
                    verdict TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_stage7_routes (
                    route_id TEXT PRIMARY KEY,
                    claim_id TEXT NOT NULL,
                    room_id TEXT NOT NULL,
                    stage7_record_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_stage6_packets (
                    packet_id TEXT PRIMARY KEY,
                    claim_id TEXT NOT NULL,
                    room_id TEXT NOT NULL,
                    stage7_submission_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_room_risk_alerts (
                    alert_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS podcast_council_audit_logs (
                    audit_id TEXT PRIMARY KEY,
                    room_id TEXT,
                    claim_id TEXT,
                    action TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_sources (
                    source_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_feeds (
                    feed_id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_ingest_events (
                    ingest_event_id TEXT PRIMARY KEY,
                    feed_id TEXT,
                    raw_item_id TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS raw_news_items (
                    raw_item_id TEXT PRIMARY KEY,
                    feed_id TEXT,
                    source_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS normalized_news_articles (
                    article_id TEXT PRIMARY KEY,
                    raw_item_id TEXT,
                    source_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_claims (
                    claim_id TEXT PRIMARY KEY,
                    article_id TEXT NOT NULL,
                    source_id TEXT,
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_evidence (
                    evidence_id TEXT PRIMARY KEY,
                    claim_id TEXT NOT NULL,
                    article_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_source_reliability_records (
                    record_id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    score REAL NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_score_bundles (
                    score_bundle_id TEXT PRIMARY KEY,
                    article_id TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_stage7_candidate_routes (
                    route_id TEXT PRIMARY KEY,
                    claim_id TEXT NOT NULL,
                    article_id TEXT NOT NULL,
                    stage7_record_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_stage6_submission_packets (
                    packet_id TEXT PRIMARY KEY,
                    claim_id TEXT NOT NULL,
                    article_id TEXT NOT NULL,
                    stage7_submission_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS newsroom_packages (
                    package_id TEXT PRIMARY KEY,
                    article_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    modality TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS newsroom_scripts (
                    script_id TEXT PRIMARY KEY,
                    package_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS newsroom_segments (
                    segment_id TEXT PRIMARY KEY,
                    script_id TEXT NOT NULL,
                    package_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_to_debate_handoffs (
                    handoff_id TEXT PRIMARY KEY,
                    package_id TEXT NOT NULL,
                    article_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_correction_records (
                    correction_id TEXT PRIMARY KEY,
                    article_id TEXT,
                    claim_id TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS newsroom_risk_alerts (
                    alert_id TEXT PRIMARY KEY,
                    article_id TEXT,
                    claim_id TEXT,
                    severity TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS newsroom_audit_logs (
                    audit_id TEXT PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    article_id TEXT,
                    claim_id TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_categories (
                    category_id TEXT PRIMARY KEY,
                    parent_category_id TEXT,
                    locale TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_topics (
                    topic_id TEXT PRIMARY KEY,
                    category_id TEXT,
                    locale TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_canonical_clusters (
                    cluster_id TEXT PRIMARY KEY,
                    article_id TEXT,
                    package_id TEXT,
                    canonical_url TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_hreflang_variants (
                    variant_id TEXT PRIMARY KEY,
                    cluster_id TEXT NOT NULL,
                    locale TEXT NOT NULL,
                    url TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_seo_artifacts (
                    artifact_id TEXT PRIMARY KEY,
                    article_id TEXT NOT NULL,
                    package_id TEXT,
                    output_type TEXT NOT NULL,
                    canonical_url TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_sitemap_entries (
                    entry_id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    is_news INTEGER NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_structured_data_artifacts (
                    artifact_id TEXT PRIMARY KEY,
                    article_id TEXT,
                    package_id TEXT,
                    structured_data_type TEXT NOT NULL,
                    canonical_url TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS news_originality_reports (
                    report_id TEXT PRIMARY KEY,
                    article_id TEXT NOT NULL,
                    package_id TEXT,
                    blocked INTEGER NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_collapse_metrics (
                    metrics_id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_collapse_events (
                    event_id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    to_state TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_collapse_triggers (
                    trigger_id TEXT PRIMARY KEY,
                    event_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_collapse_state_history (
                    history_id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    from_state TEXT NOT NULL,
                    to_state TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_collapse_recovery_plans (
                    plan_id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_collapse_reviews (
                    review_id TEXT PRIMARY KEY,
                    event_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_collapse_restrictions (
                    restriction_id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    active INTEGER NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_collapse_audit_logs (
                    audit_id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    event_id TEXT,
                    action TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            for table in ["answer_records", "verification_records", "graphs", "hard_mesh_runs"]:
                self._ensure_columns(
                    conn,
                    table,
                    {
                        "created_at": "TEXT",
                        "updated_at": "TEXT",
                        "valid_from": "TEXT",
                        "valid_to": "TEXT",
                    },
                )
            for table in ["claim_records", "evidence_records", "source_records"]:
                self._ensure_columns(
                    conn,
                    table,
                    {
                        "created_at": "TEXT",
                        "updated_at": "TEXT",
                    },
                )
            for table in ["unresolved_queue", "query_tank_items"]:
                self._ensure_columns(
                    conn,
                    table,
                    {
                        "created_at": "TEXT",
                        "last_updated": "TEXT",
                        "category": "TEXT",
                        "status": "TEXT",
                        "valid_from": "TEXT",
                        "valid_to": "TEXT",
                    },
                )

    def save_answer_record(self, answer_id: str, payload: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO answer_records(answer_id, payload_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (answer_id, json.dumps(payload)),
            )
            conn.execute(
                "INSERT OR REPLACE INTO verification_records(answer_id, payload_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (answer_id, json.dumps(payload)),
            )
            for record in payload.get("claim_records", []):
                claim = record.get("claim", {})
                claim_id = claim.get("claim_id")
                if claim_id:
                    conn.execute(
                        "INSERT OR REPLACE INTO claim_records(claim_id, answer_id, payload_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                        (claim_id, answer_id, json.dumps(record)),
                    )
                for plugin in record.get("plugin_results", []):
                    plugin_name = plugin.get("plugin_name")
                    if claim_id and plugin_name:
                        conn.execute(
                            "INSERT OR REPLACE INTO plugin_results(answer_id, claim_id, plugin_name, payload_json) VALUES (?, ?, ?, ?)",
                            (answer_id, claim_id, plugin_name, json.dumps(plugin)),
                        )
                for evidence in record.get("evidences", []):
                    evidence_id = evidence.get("evidence_id")
                    if evidence_id:
                        conn.execute(
                            "INSERT OR REPLACE INTO evidence_records(evidence_id, answer_id, payload_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                            (evidence_id, answer_id, json.dumps(evidence)),
                        )
                    source = evidence.get("source", {})
                    source_id = source.get("source_id")
                    if source_id:
                        conn.execute(
                            "INSERT OR REPLACE INTO source_records(source_id, payload_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                            (source_id, json.dumps(source)),
                        )

    def save_graph(self, answer_id: str, graph_payload: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO graphs(answer_id, graph_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (answer_id, json.dumps(graph_payload)),
            )

    def save_hard_mesh(self, answer_id: str, payload: dict, lane_results: list[dict]) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO hard_mesh_runs(answer_id, payload_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (answer_id, json.dumps(payload)),
            )
            for lane in lane_results:
                lane_name = lane.get("lane_name", "unknown")
                conn.execute(
                    "INSERT OR REPLACE INTO hard_mesh_lane_results(answer_id, lane_name, payload_json) VALUES (?, ?, ?)",
                    (answer_id, lane_name, json.dumps(lane)),
                )

    def save_topology(self, answer_id: str, payload: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO topology_snapshots(answer_id, payload_json) VALUES (?, ?)",
                (answer_id, json.dumps(payload)),
            )

    def save_topology_evolution(self, record: TopologicalEvolutionRecord) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO topology_evolution_records(evolution_id, answer_id, payload_json)
                VALUES (?, ?, ?)
                """,
                (record.evolution_id, record.answer_id, record.model_dump_json()),
            )

    def list_topology_evolution(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM topology_evolution_records ORDER BY created_at DESC"
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_council_socket_event(
        self,
        envelope: CouncilSocketEnvelope,
        decision: CouncilSocketDecision,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO council_socket_events(
                    socket_id, council_id, route, policy_decision, envelope_json, decision_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    envelope.socket_id,
                    envelope.council_id.value,
                    decision.route.value,
                    decision.policy_decision.value,
                    envelope.model_dump_json(),
                    decision.model_dump_json(),
                ),
            )

    def list_council_socket_events(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT envelope_json, decision_json
                FROM council_socket_events
                ORDER BY updated_at DESC
                """
            ).fetchall()
        return [
            {"envelope": json.loads(envelope_json), "decision": json.loads(decision_json)}
            for envelope_json, decision_json in rows
        ]

    def save_agent_action_decision(self, decision: AgentActionDecision) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_action_decisions(
                    request_id, agent_id, action_class, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    decision.request_id,
                    decision.agent_id,
                    decision.action_class.value,
                    decision.model_dump_json(),
                ),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_simulation_runs(
                    sim_run_id, agent_id, request_id, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    decision.simulation.sim_run_id,
                    decision.agent_id,
                    decision.request_id,
                    decision.simulation.model_dump_json(),
                ),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_micro_pyramid_states(agent_id, payload_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                """,
                (decision.agent_id, decision.micro_pyramid.model_dump_json()),
            )

    def save_signal_processing_record(self, record: SignalProcessingRecord) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO signal_events(
                    event_id, destination_type, sent_to_main_engine, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    record.event.event_id,
                    record.route.destination_type.value,
                    1 if record.route.sent_to_main_engine else 0,
                    record.model_dump_json(),
                ),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO signal_vectors(event_id, payload_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                """,
                (record.event.event_id, record.vector.model_dump_json()),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO signal_routes(
                    route_id, event_id, destination_type, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    record.route.route_id,
                    record.event.event_id,
                    record.route.destination_type.value,
                    record.route.model_dump_json(),
                ),
            )

    def list_signal_processing_records(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT payload_json FROM signal_events ORDER BY updated_at DESC").fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_stage7_external_record(self, record: Stage7ExternalRecord) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO stage7_external_records(
                    record_id, tank, status, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (record.record_id, record.tank.value, record.status.value, record.model_dump_json()),
            )

    def list_stage7_external_records(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM stage7_external_records ORDER BY updated_at DESC"
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_stage7_external_record(self, record_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM stage7_external_records WHERE record_id = ?", (record_id,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_stage7_submission_package(self, package: Stage7SubmissionPackage) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO stage7_submission_packages(submission_id, record_id, payload_json)
                VALUES (?, ?, ?)
                """,
                (package.submission_id, package.record_id, package.model_dump_json()),
            )

    def save_podcast_room(self, room: PodcastRoom) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_rooms(
                    room_id, status, risk_score, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    room.room_id,
                    room.status.value,
                    room.reputation_metadata.risk_score,
                    room.model_dump_json(),
                ),
            )

    def list_podcast_rooms(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT payload_json FROM podcast_rooms ORDER BY updated_at DESC").fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_podcast_room(self, room_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM podcast_rooms WHERE room_id = ?", (room_id,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_podcast_session(self, session: PodcastSession) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_sessions(
                    session_id, room_id, status, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (session.session_id, session.room_id, session.status, session.model_dump_json()),
            )

    def list_podcast_sessions(self, room_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_sessions WHERE room_id = ? ORDER BY updated_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_sessions ORDER BY updated_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_podcast_session(self, session_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM podcast_sessions WHERE session_id = ?", (session_id,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_podcast_participant(self, participant: PodcastParticipant) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_participants(
                    participant_entry_id, room_id, participant_id, payload_json
                ) VALUES (?, ?, ?, ?)
                """,
                (
                    participant.participant_entry_id,
                    participant.room_id,
                    participant.participant_id,
                    participant.model_dump_json(),
                ),
            )

    def list_podcast_participants(self, room_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_participants WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_participants ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_podcast_expert_call(self, call: PodcastExpertCall) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_expert_calls(call_id, room_id, status, payload_json)
                VALUES (?, ?, ?, ?)
                """,
                (call.call_id, call.room_id, call.status, call.model_dump_json()),
            )

    def list_podcast_expert_calls(self, room_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_expert_calls WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_expert_calls ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_podcast_agent_invitation(self, invitation: PodcastAgentInvitation) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_agent_invitations(
                    invitation_id, room_id, agent_id, status, payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    invitation.invitation_id,
                    invitation.room_id,
                    invitation.agent_id,
                    invitation.status.value,
                    invitation.model_dump_json(),
                ),
            )

    def list_podcast_agent_invitations(self, room_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_agent_invitations WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_agent_invitations ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_podcast_debate_turn(self, turn: PodcastDebateTurn) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_debate_turns(turn_id, room_id, session_id, payload_json)
                VALUES (?, ?, ?, ?)
                """,
                (turn.turn_id, turn.room_id, turn.session_id, turn.model_dump_json()),
            )

    def list_podcast_debate_turns(
        self, room_id: str | None = None, session_id: str | None = None
    ) -> list[dict]:
        with self._connect() as conn:
            if session_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_debate_turns WHERE session_id = ? ORDER BY created_at DESC",
                    (session_id,),
                ).fetchall()
            elif room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_debate_turns WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_debate_turns ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_podcast_debate_claim(self, claim: PodcastDebateClaim) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_debate_claims(
                    claim_id, room_id, session_id, status, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    claim.claim_id,
                    claim.room_id,
                    claim.session_id,
                    claim.status.value,
                    claim.model_dump_json(),
                ),
            )

    def list_podcast_debate_claims(
        self, room_id: str | None = None, session_id: str | None = None
    ) -> list[dict]:
        with self._connect() as conn:
            if session_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_debate_claims WHERE session_id = ? ORDER BY updated_at DESC",
                    (session_id,),
                ).fetchall()
            elif room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_debate_claims WHERE room_id = ? ORDER BY updated_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_debate_claims ORDER BY updated_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_podcast_debate_claim(self, claim_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM podcast_debate_claims WHERE claim_id = ?", (claim_id,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_podcast_evidence_submission(self, evidence: PodcastEvidenceSubmission) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_evidence_submissions(
                    evidence_id, claim_id, room_id, payload_json
                ) VALUES (?, ?, ?, ?)
                """,
                (evidence.evidence_id, evidence.claim_id, evidence.room_id, evidence.model_dump_json()),
            )

    def list_podcast_evidence_submissions(
        self, room_id: str | None = None, claim_id: str | None = None
    ) -> list[dict]:
        with self._connect() as conn:
            if claim_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_evidence_submissions WHERE claim_id = ? ORDER BY created_at DESC",
                    (claim_id,),
                ).fetchall()
            elif room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_evidence_submissions WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_evidence_submissions ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_podcast_claim_review(self, review: PodcastClaimReview) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_claim_reviews(
                    review_id, claim_id, room_id, verdict, payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    review.review_id,
                    review.claim_id,
                    review.room_id,
                    review.verdict.value,
                    review.model_dump_json(),
                ),
            )

    def list_podcast_claim_reviews(
        self, room_id: str | None = None, claim_id: str | None = None
    ) -> list[dict]:
        with self._connect() as conn:
            if claim_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_claim_reviews WHERE claim_id = ? ORDER BY created_at DESC",
                    (claim_id,),
                ).fetchall()
            elif room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_claim_reviews WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_claim_reviews ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_podcast_stage7_route(self, route: PodcastStage7CandidateRoute) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_stage7_routes(
                    route_id, claim_id, room_id, stage7_record_id, payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    route.route_id,
                    route.claim_id,
                    route.room_id,
                    route.stage7_record_id,
                    route.model_dump_json(),
                ),
            )

    def list_podcast_stage7_routes(self, room_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_stage7_routes WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_stage7_routes ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_podcast_stage7_route_for_claim(self, claim_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM podcast_stage7_routes WHERE claim_id = ? ORDER BY created_at DESC",
                (claim_id,),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_podcast_stage6_packet(self, packet: PodcastStage6SubmissionPacket) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_stage6_packets(
                    packet_id, claim_id, room_id, stage7_submission_id, payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    packet.packet_id,
                    packet.claim_id,
                    packet.room_id,
                    packet.stage7_submission_id,
                    packet.model_dump_json(),
                ),
            )

    def list_podcast_stage6_packets(self, room_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_stage6_packets WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_stage6_packets ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_podcast_room_risk_alert(self, alert: PodcastRoomRiskAlert) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_room_risk_alerts(
                    alert_id, room_id, severity, payload_json
                ) VALUES (?, ?, ?, ?)
                """,
                (alert.alert_id, alert.room_id, alert.severity.value, alert.model_dump_json()),
            )

    def list_podcast_room_risk_alerts(self, room_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_room_risk_alerts WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_room_risk_alerts ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_podcast_council_audit_log(self, audit: PodcastCouncilAuditLog) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO podcast_council_audit_logs(
                    audit_id, room_id, claim_id, action, payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (audit.audit_id, audit.room_id, audit.claim_id, audit.action, audit.model_dump_json()),
            )

    def list_podcast_council_audit_logs(self, room_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if room_id:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_council_audit_logs WHERE room_id = ? ORDER BY created_at DESC",
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM podcast_council_audit_logs ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def _save_payload(
        self,
        table: str,
        id_column: str,
        id_value: str,
        payload: Any,
        columns: dict[str, Any] | None = None,
    ) -> None:
        columns = columns or {}
        names = [id_column, *columns.keys(), "payload_json"]
        values = [id_value, *columns.values(), payload.model_dump_json()]
        placeholders = ", ".join("?" for _ in names)
        with self._connect() as conn:
            conn.execute(
                f"INSERT OR REPLACE INTO {table}({', '.join(names)}) VALUES ({placeholders})",
                values,
            )

    def _list_payloads(
        self,
        table: str,
        filters: dict[str, Any] | None = None,
        *,
        order_by: str = "created_at DESC",
    ) -> list[dict]:
        filters = {key: value for key, value in (filters or {}).items() if value is not None}
        where = ""
        values: list[Any] = []
        if filters:
            where = " WHERE " + " AND ".join(f"{key} = ?" for key in filters)
            values = list(filters.values())
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT payload_json FROM {table}{where} ORDER BY {order_by}",
                values,
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def _get_payload(self, table: str, id_column: str, id_value: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                f"SELECT payload_json FROM {table} WHERE {id_column} = ?",
                (id_value,),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_news_source(self, source: NewsSource) -> None:
        self._save_payload("news_sources", "source_id", source.source_id, source)

    def list_news_sources(self) -> list[dict]:
        return self._list_payloads("news_sources", order_by="created_at DESC")

    def get_news_source(self, source_id: str) -> Optional[dict]:
        return self._get_payload("news_sources", "source_id", source_id)

    def save_news_feed(self, feed: NewsFeed) -> None:
        self._save_payload("news_feeds", "feed_id", feed.feed_id, feed, {"source_id": feed.source_id})

    def list_news_feeds(self, source_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_feeds", {"source_id": source_id})

    def get_news_feed(self, feed_id: str) -> Optional[dict]:
        return self._get_payload("news_feeds", "feed_id", feed_id)

    def save_news_ingest_event(self, event: NewsIngestEvent) -> None:
        self._save_payload(
            "news_ingest_events",
            "ingest_event_id",
            event.ingest_event_id,
            event,
            {"feed_id": event.feed_id, "raw_item_id": event.raw_item_id, "source_id": event.source_id},
        )

    def list_news_ingest_events(self, feed_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_ingest_events", {"feed_id": feed_id})

    def save_raw_news_item(self, item: RawNewsItem) -> None:
        self._save_payload(
            "raw_news_items",
            "raw_item_id",
            item.raw_item_id,
            item,
            {"feed_id": item.feed_id, "source_id": item.source_id},
        )

    def list_raw_news_items(self, source_id: str | None = None, feed_id: str | None = None) -> list[dict]:
        return self._list_payloads("raw_news_items", {"source_id": source_id, "feed_id": feed_id})

    def get_raw_news_item(self, raw_item_id: str) -> Optional[dict]:
        return self._get_payload("raw_news_items", "raw_item_id", raw_item_id)

    def save_normalized_news_article(self, article: NormalizedNewsArticle) -> None:
        self._save_payload(
            "normalized_news_articles",
            "article_id",
            article.article_id,
            article,
            {"raw_item_id": article.raw_item_id, "source_id": article.source_id, "status": article.status.value},
        )

    def list_normalized_news_articles(self, source_id: str | None = None) -> list[dict]:
        return self._list_payloads("normalized_news_articles", {"source_id": source_id})

    def get_normalized_news_article(self, article_id: str) -> Optional[dict]:
        return self._get_payload("normalized_news_articles", "article_id", article_id)

    def get_normalized_news_article_for_raw_item(self, raw_item_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM normalized_news_articles WHERE raw_item_id = ? ORDER BY created_at DESC",
                (raw_item_id,),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_news_claim(self, claim: NewsClaim) -> None:
        self._save_payload(
            "news_claims",
            "claim_id",
            claim.claim_id,
            claim,
            {"article_id": claim.article_id, "source_id": claim.source_id, "status": claim.status.value},
        )

    def list_news_claims(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_claims", {"article_id": article_id})

    def get_news_claim(self, claim_id: str) -> Optional[dict]:
        return self._get_payload("news_claims", "claim_id", claim_id)

    def save_news_evidence(self, evidence: NewsEvidence) -> None:
        self._save_payload(
            "news_evidence",
            "evidence_id",
            evidence.evidence_id,
            evidence,
            {"claim_id": evidence.claim_id, "article_id": evidence.article_id},
        )

    def list_news_evidence(
        self, article_id: str | None = None, claim_id: str | None = None
    ) -> list[dict]:
        return self._list_payloads("news_evidence", {"article_id": article_id, "claim_id": claim_id})

    def save_news_source_reliability_record(self, record: NewsSourceReliabilityRecord) -> None:
        self._save_payload(
            "news_source_reliability_records",
            "record_id",
            record.record_id,
            record,
            {"source_id": record.source_id, "score": record.score},
        )

    def list_news_source_reliability_records(self, source_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_source_reliability_records", {"source_id": source_id})

    def save_news_score_bundle(self, bundle: NewsScoreBundle) -> None:
        self._save_payload(
            "news_score_bundles",
            "score_bundle_id",
            bundle.score_bundle_id,
            bundle,
            {"article_id": bundle.article_id},
        )

    def list_news_score_bundles(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_score_bundles", {"article_id": article_id})

    def save_news_stage7_route(self, route: NewsStage7CandidateRoute) -> None:
        self._save_payload(
            "news_stage7_candidate_routes",
            "route_id",
            route.route_id,
            route,
            {
                "claim_id": route.claim_id,
                "article_id": route.article_id,
                "stage7_record_id": route.stage7_record_id,
            },
        )

    def list_news_stage7_routes(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_stage7_candidate_routes", {"article_id": article_id})

    def get_news_stage7_route_for_claim(self, claim_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT payload_json FROM news_stage7_candidate_routes
                WHERE claim_id = ? ORDER BY created_at DESC
                """,
                (claim_id,),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_news_stage6_packet(self, packet: NewsStage6SubmissionPacket) -> None:
        self._save_payload(
            "news_stage6_submission_packets",
            "packet_id",
            packet.packet_id,
            packet,
            {
                "claim_id": packet.claim_id,
                "article_id": packet.article_id,
                "stage7_submission_id": packet.stage7_submission_id,
            },
        )

    def list_news_stage6_packets(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_stage6_submission_packets", {"article_id": article_id})

    def save_newsroom_package(self, package: NewsroomPackage) -> None:
        self._save_payload(
            "newsroom_packages",
            "package_id",
            package.package_id,
            package,
            {"article_id": package.article_id, "status": package.status.value, "modality": package.modality.value},
        )

    def list_newsroom_packages(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("newsroom_packages", {"article_id": article_id})

    def get_newsroom_package(self, package_id: str) -> Optional[dict]:
        return self._get_payload("newsroom_packages", "package_id", package_id)

    def save_newsroom_script(self, script: NewsroomScript) -> None:
        self._save_payload(
            "newsroom_scripts",
            "script_id",
            script.script_id,
            script,
            {"package_id": script.package_id},
        )

    def list_newsroom_scripts(self, package_id: str | None = None) -> list[dict]:
        return self._list_payloads("newsroom_scripts", {"package_id": package_id})

    def save_newsroom_segment(self, segment: NewsroomSegment) -> None:
        self._save_payload(
            "newsroom_segments",
            "segment_id",
            segment.segment_id,
            segment,
            {"script_id": segment.script_id, "package_id": segment.package_id},
        )

    def list_newsroom_segments(self, package_id: str | None = None) -> list[dict]:
        return self._list_payloads("newsroom_segments", {"package_id": package_id})

    def save_news_to_debate_handoff(self, handoff: NewsToDebateHandoff) -> None:
        self._save_payload(
            "news_to_debate_handoffs",
            "handoff_id",
            handoff.handoff_id,
            handoff,
            {"package_id": handoff.package_id, "article_id": handoff.article_id},
        )

    def list_news_to_debate_handoffs(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_to_debate_handoffs", {"article_id": article_id})

    def save_news_correction_record(self, correction: NewsCorrectionRecord) -> None:
        self._save_payload(
            "news_correction_records",
            "correction_id",
            correction.correction_id,
            correction,
            {"article_id": correction.article_id, "claim_id": correction.claim_id},
        )

    def list_news_correction_records(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_correction_records", {"article_id": article_id})

    def save_newsroom_risk_alert(self, alert: NewsroomRiskAlert) -> None:
        self._save_payload(
            "newsroom_risk_alerts",
            "alert_id",
            alert.alert_id,
            alert,
            {"article_id": alert.article_id, "claim_id": alert.claim_id, "severity": alert.severity.value},
        )

    def list_newsroom_risk_alerts(
        self, article_id: str | None = None, claim_id: str | None = None
    ) -> list[dict]:
        return self._list_payloads("newsroom_risk_alerts", {"article_id": article_id, "claim_id": claim_id})

    def save_newsroom_audit_log(self, audit: NewsroomAuditLog) -> None:
        self._save_payload(
            "newsroom_audit_logs",
            "audit_id",
            audit.audit_id,
            audit,
            {
                "entity_type": audit.entity_type,
                "entity_id": audit.entity_id,
                "action": audit.action,
                "article_id": audit.article_id,
                "claim_id": audit.claim_id,
            },
        )

    def list_newsroom_audit_logs(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("newsroom_audit_logs", {"article_id": article_id})

    def save_news_category(self, category: NewsCategory) -> None:
        self._save_payload(
            "news_categories",
            "category_id",
            category.category_id,
            category,
            {
                "parent_category_id": category.parent_category_id,
                "locale": category.locale,
                "slug": category.slug,
            },
        )

    def list_news_categories(self, parent_category_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_categories", {"parent_category_id": parent_category_id})

    def get_news_category(self, category_id: str) -> Optional[dict]:
        return self._get_payload("news_categories", "category_id", category_id)

    def save_news_topic(self, topic: NewsTopic) -> None:
        self._save_payload(
            "news_topics",
            "topic_id",
            topic.topic_id,
            topic,
            {"category_id": topic.category_id, "locale": topic.locale, "slug": topic.slug},
        )

    def list_news_topics(self, category_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_topics", {"category_id": category_id})

    def save_news_canonical_cluster(self, cluster: NewsCanonicalCluster) -> None:
        self._save_payload(
            "news_canonical_clusters",
            "cluster_id",
            cluster.cluster_id,
            cluster,
            {
                "article_id": cluster.article_id,
                "package_id": cluster.package_id,
                "canonical_url": cluster.canonical_url,
            },
        )

    def list_news_canonical_clusters(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_canonical_clusters", {"article_id": article_id})

    def save_news_hreflang_variant(self, variant: NewsHreflangVariant) -> None:
        self._save_payload(
            "news_hreflang_variants",
            "variant_id",
            variant.variant_id,
            variant,
            {"cluster_id": variant.cluster_id, "locale": variant.locale, "url": variant.url},
        )

    def list_news_hreflang_variants(self, cluster_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_hreflang_variants", {"cluster_id": cluster_id})

    def save_news_seo_artifact(self, artifact: NewsSeoArtifact) -> None:
        self._save_payload(
            "news_seo_artifacts",
            "artifact_id",
            artifact.artifact_id,
            artifact,
            {
                "article_id": artifact.article_id,
                "package_id": artifact.package_id,
                "output_type": artifact.output_type.value,
                "canonical_url": artifact.canonical_url,
            },
        )

    def list_news_seo_artifacts(
        self, article_id: str | None = None, package_id: str | None = None
    ) -> list[dict]:
        return self._list_payloads("news_seo_artifacts", {"article_id": article_id, "package_id": package_id})

    def get_latest_news_seo_artifact(self, article_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM news_seo_artifacts WHERE article_id = ? ORDER BY created_at DESC",
                (article_id,),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_news_sitemap_entry(self, entry: NewsSitemapEntry) -> None:
        self._save_payload(
            "news_sitemap_entries",
            "entry_id",
            entry.entry_id,
            entry,
            {"url": entry.url, "is_news": 1 if entry.is_news else 0},
        )

    def list_news_sitemap_entries(self) -> list[dict]:
        return self._list_payloads("news_sitemap_entries")

    def save_news_structured_data_artifact(self, artifact: NewsStructuredDataArtifact) -> None:
        self._save_payload(
            "news_structured_data_artifacts",
            "artifact_id",
            artifact.artifact_id,
            artifact,
            {
                "article_id": artifact.article_id,
                "package_id": artifact.package_id,
                "structured_data_type": artifact.structured_data_type.value,
                "canonical_url": artifact.canonical_url,
            },
        )

    def list_news_structured_data_artifacts(
        self, article_id: str | None = None, package_id: str | None = None
    ) -> list[dict]:
        return self._list_payloads(
            "news_structured_data_artifacts",
            {"article_id": article_id, "package_id": package_id},
        )

    def save_news_originality_report(self, report: NewsOriginalityReport) -> None:
        self._save_payload(
            "news_originality_reports",
            "report_id",
            report.report_id,
            report,
            {"article_id": report.article_id, "package_id": report.package_id, "blocked": 1 if report.blocked else 0},
        )

    def list_news_originality_reports(self, article_id: str | None = None) -> list[dict]:
        return self._list_payloads("news_originality_reports", {"article_id": article_id})

    def save_agent_collapse_metrics(self, metrics: AgentCollapseMetrics) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_collapse_metrics(metrics_id, agent_id, payload_json)
                VALUES (?, ?, ?)
                """,
                (metrics.metrics_id, metrics.agent_id, metrics.model_dump_json()),
            )

    def save_agent_collapse_event(self, event: AgentCollapseEvent) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_collapse_events(
                    event_id, agent_id, to_state, payload_json, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (event.event_id, event.agent_id, event.to_state.value, event.model_dump_json()),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_collapse_state_history(
                    history_id, agent_id, from_state, to_state, payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    f"history_{event.event_id}",
                    event.agent_id,
                    event.from_state.value,
                    event.to_state.value,
                    event.model_dump_json(),
                ),
            )
            for reason in event.hard_policy_reasons:
                trigger_id = f"trigger_{event.event_id}_{abs(hash(reason))}"
                conn.execute(
                    """
                    INSERT OR REPLACE INTO agent_collapse_triggers(trigger_id, event_id, payload_json)
                    VALUES (?, ?, ?)
                    """,
                    (trigger_id, event.event_id, json.dumps({"reason": reason})),
                )

    def list_agent_collapse_events(self, agent_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if agent_id:
                rows = conn.execute(
                    "SELECT payload_json FROM agent_collapse_events WHERE agent_id = ? ORDER BY updated_at DESC",
                    (agent_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM agent_collapse_events ORDER BY updated_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_latest_agent_collapse_event(self, agent_id: str) -> Optional[dict]:
        events = self.list_agent_collapse_events(agent_id)
        return events[0] if events else None

    def save_agent_collapse_restriction(self, restriction: AgentCollapseRestriction) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_collapse_restrictions(
                    restriction_id, agent_id, active, payload_json
                ) VALUES (?, ?, ?, ?)
                """,
                (
                    restriction.restriction_id,
                    restriction.agent_id,
                    1 if restriction.active else 0,
                    restriction.model_dump_json(),
                ),
            )

    def save_agent_collapse_recovery_plan(self, plan: AgentCollapseRecoveryPlan) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_collapse_recovery_plans(plan_id, agent_id, payload_json)
                VALUES (?, ?, ?)
                """,
                (plan.plan_id, plan.agent_id, plan.model_dump_json()),
            )

    def save_agent_collapse_review(self, review: AgentCollapseReview) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_collapse_reviews(review_id, event_id, agent_id, payload_json)
                VALUES (?, ?, ?, ?)
                """,
                (review.review_id, review.event_id, review.agent_id, review.model_dump_json()),
            )

    def save_agent_collapse_audit_log(self, audit: AgentCollapseAuditLog) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_collapse_audit_logs(
                    audit_id, agent_id, event_id, action, payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (audit.audit_id, audit.agent_id, audit.event_id, audit.action, audit.model_dump_json()),
            )

    def list_agent_collapse_audit_logs(self, agent_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if agent_id:
                rows = conn.execute(
                    "SELECT payload_json FROM agent_collapse_audit_logs WHERE agent_id = ? ORDER BY created_at DESC",
                    (agent_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM agent_collapse_audit_logs ORDER BY created_at DESC"
                ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_graph(self, answer_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT graph_json FROM graphs WHERE answer_id = ?", (answer_id,)
            ).fetchone()
        if not row:
            return None
        return json.loads(row[0])

    def enqueue_unresolved(self, answer_id: str, reason: str, payload: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO unresolved_queue(answer_id, reason, payload_json, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                (answer_id, reason, json.dumps(payload)),
            )

    def enqueue_query_tank(self, item: QueryTankItem) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO query_tank_items(
                    answer_id, reason, category, status, payload_json, valid_from, valid_to, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    item.answer_id,
                    item.reason,
                    item.category,
                    item.status,
                    item.model_dump_json(),
                    item.valid_from.isoformat(),
                    item.valid_to.isoformat() if item.valid_to else None,
                ),
            )

    def list_query_tank(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT payload_json FROM query_tank_items ORDER BY last_updated DESC").fetchall()
        return [json.loads(row[0]) for row in rows]
