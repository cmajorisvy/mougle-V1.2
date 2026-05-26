"""
Basic configuration for the Python worker layer.

Reads from environment variables (loaded via python-dotenv if a `.env` file is
present). No secret values are printed or written to logs.
"""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


@dataclass(frozen=True)
class WorkerConfig:
    env: str
    health_port: int
    poll_interval_seconds: float
    max_concurrent_jobs: int
    database_url: str | None
    openai_api_key_present: bool
    # --- Bridge to the TypeScript orchestrator ----------------------------
    api_base_url: str
    worker_token: str | None
    worker_id: str
    batch_limit: int
    request_timeout_seconds: float
    heartbeat_interval_seconds: float
    worker_version: str


def _default_worker_id() -> str:
    return f"py-worker-{socket.gethostname()}-{os.getpid()}"


def load_config() -> WorkerConfig:
    return WorkerConfig(
        env=os.getenv("MOUGLE_ENV", "development"),
        health_port=int(os.getenv("PYTHON_WORKER_HEALTH_PORT", "8765")),
        poll_interval_seconds=float(
            os.getenv(
                "WORKER_POLL_INTERVAL_SECONDS",
                os.getenv("PYTHON_WORKER_POLL_INTERVAL", "2.0"),
            )
        ),
        max_concurrent_jobs=int(os.getenv("PYTHON_WORKER_MAX_CONCURRENCY", "4")),
        database_url=os.getenv("DATABASE_URL"),
        openai_api_key_present=bool(os.getenv("OPENAI_API_KEY")),
        api_base_url=os.getenv("MOUGLE_API_BASE_URL", "http://localhost:5000").rstrip("/"),
        worker_token=os.getenv("MOUGLE_WORKER_TOKEN") or None,
        worker_id=os.getenv("WORKER_ID") or _default_worker_id(),
        batch_limit=int(os.getenv("WORKER_BATCH_LIMIT", "5")),
        request_timeout_seconds=float(os.getenv("WORKER_HTTP_TIMEOUT_SECONDS", "15.0")),
        heartbeat_interval_seconds=float(os.getenv("WORKER_HEARTBEAT_INTERVAL_SECONDS", "20.0")),
        worker_version=os.getenv("WORKER_VERSION", "py-worker-1.0.0"),
    )
