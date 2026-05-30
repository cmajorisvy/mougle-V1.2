"""SQLite persistence for verification summaries and graph snapshots."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Optional

from app.models import QueryTankItem


class SQLiteStore:
    def __init__(self, path: str = "truth_pyramid.db") -> None:
        self.path = Path(path)
        self._memory_conn: Optional[sqlite3.Connection] = sqlite3.connect(path) if path == ":memory:" else None
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
                    payload_json TEXT NOT NULL,
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
            for table in ["answer_records", "verification_records", "graphs", "hard_mesh_runs"]:
                self._ensure_columns(
                    conn,
                    table,
                    {
                        "created_at": "TEXT",
                        "updated_at": "TEXT",
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
                "INSERT OR REPLACE INTO query_tank_items(answer_id, reason, payload_json, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                (item.answer_id, item.reason, item.model_dump_json()),
            )

    def list_query_tank(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT payload_json FROM query_tank_items ORDER BY last_updated DESC").fetchall()
        return [json.loads(row[0]) for row in rows]
