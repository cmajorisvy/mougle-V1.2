"""SQLite persistence for verification summaries and graph snapshots."""

from __future__ import annotations

import json
import sqlite3
from typing import Optional
from pathlib import Path


class SQLiteStore:
    def __init__(self, path: str = "truth_pyramid.db") -> None:
        self.path = Path(path)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS answer_records (
                    answer_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS graphs (
                    answer_id TEXT PRIMARY KEY,
                    graph_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS unresolved_queue (
                    answer_id TEXT PRIMARY KEY,
                    reason TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )

    def save_answer_record(self, answer_id: str, payload: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO answer_records(answer_id, payload_json) VALUES (?, ?)",
                (answer_id, json.dumps(payload)),
            )

    def save_graph(self, answer_id: str, graph_payload: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO graphs(answer_id, graph_json) VALUES (?, ?)",
                (answer_id, json.dumps(graph_payload)),
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
                "INSERT OR REPLACE INTO unresolved_queue(answer_id, reason, payload_json) VALUES (?, ?, ?)",
                (answer_id, reason, json.dumps(payload)),
            )
