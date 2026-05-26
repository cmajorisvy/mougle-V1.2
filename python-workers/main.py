"""
Mougle Python AI Worker — entrypoint.

This module starts the Python worker subsystem. It is OPTIONAL for the core
Mougle TypeScript app to run; if this worker is not running, jobs enqueued by
the TypeScript API simply stay in `pending` state.

Two run modes are supported:

1. Consumer loop (default):
       python python-workers/main.py
   Polls the TypeScript API (`/api/worker/ai-jobs/pending`) and dispatches
   each job through `jobs.job_router`.

2. Health-only HTTP server:
       python python-workers/main.py --serve
   Starts a minimal FastAPI app exposing `/healthz` so the orchestrator can
   verify the worker is alive. The worker itself does NOT expose agent
   endpoints to the frontend — all work flows through the TypeScript API +
   job queue.
"""

from __future__ import annotations

import argparse
import asyncio
import signal
import sys

from shared.config import load_config
from shared.logging import get_logger
from jobs.job_consumer import JobConsumer

log = get_logger(__name__)


async def _consumer_main() -> None:
    cfg = load_config()
    log.info(
        "python_worker.starting",
        extra={
            "env": cfg.env,
            "mode": "consumer",
            "worker_id": cfg.worker_id,
            "api_base_url": cfg.api_base_url,
            "token_configured": bool(cfg.worker_token),
        },
    )
    if not cfg.worker_token:
        log.warning(
            "python_worker.no_worker_token",
            extra={
                "hint": "Set MOUGLE_WORKER_TOKEN in the environment so the worker can authenticate."
            },
        )
    consumer = JobConsumer(config=cfg)

    loop = asyncio.get_running_loop()

    def _request_stop(signame: str) -> None:
        log.info("python_worker.shutdown_signal", extra={"signal": signame})
        consumer.request_stop()

    for signame in ("SIGINT", "SIGTERM"):
        try:
            loop.add_signal_handler(getattr(signal, signame), _request_stop, signame)
        except (NotImplementedError, RuntimeError):
            # Windows / non-main-thread fallback — KeyboardInterrupt still works.
            pass

    await consumer.run_forever()


def _run_consumer() -> None:
    try:
        asyncio.run(_consumer_main())
    except KeyboardInterrupt:
        log.info("python_worker.stopped_by_user")


def _run_health_server() -> None:
    try:
        import uvicorn
        from fastapi import FastAPI
    except ImportError:
        print(
            "fastapi/uvicorn not installed. Run: pip install -r requirements.txt",
            file=sys.stderr,
        )
        sys.exit(1)

    cfg = load_config()
    app = FastAPI(title="Mougle Python Worker (health)")

    @app.get("/healthz")
    def healthz() -> dict:
        return {"status": "ok", "env": cfg.env}

    log.info("python_worker.health_server.starting", extra={"port": cfg.health_port})
    uvicorn.run(app, host="0.0.0.0", port=cfg.health_port, log_level="info")


def main() -> None:
    parser = argparse.ArgumentParser(description="Mougle Python AI Worker")
    parser.add_argument(
        "--serve",
        action="store_true",
        help="Run a minimal /healthz HTTP server instead of the consumer loop.",
    )
    args = parser.parse_args()

    if args.serve:
        _run_health_server()
    else:
        _run_consumer()


if __name__ == "__main__":
    main()
