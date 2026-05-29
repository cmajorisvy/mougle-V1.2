"""
Job consumer loop — production implementation.

Polls the Mougle TypeScript API for pending AI jobs over HTTP, claims them
through the dedicated worker endpoint, dispatches them through `JobRouter`,
and posts the final `JobResult` back to the TypeScript API. The TypeScript
side is the sole authority on persistence (Postgres `ai_jobs` table).

Network shape (camelCase on the wire, snake_case in Python):

    GET  {API_BASE}/api/worker/ai-jobs/pending?limit=N
    POST {API_BASE}/api/worker/ai-jobs/{jobId}/running   { workerId }
    POST {API_BASE}/api/worker/ai-jobs/result            { jobId, status, ... }

All worker endpoints require BOTH:
    Authorization: Bearer ${MOUGLE_WORKER_TOKEN}
    X-Worker-Id: ${WORKER_ID}

The X-Worker-Id header is the canonical worker identity used by the TS
side for ai_jobs.locked_by, ai_workers.worker_id, and
ai_job_events.actor_worker_id. Any workerId we additionally send in the
request body MUST match the X-Worker-Id header — the TS middleware
rejects mismatches with HTTP 400.

The worker is OPTIONAL. If the TS app is running but no worker is, jobs sit
in `pending` indefinitely without affecting the rest of the app.
"""

from __future__ import annotations

import asyncio
import os
import socket
from collections import deque
from typing import Any

import requests

from shared.config import WorkerConfig
from shared.contracts import (
    JobEnvelope,
    JobOrigin,
    JobProvenance,
    JobResult,
    JobStatus,
)
from shared.logging import get_logger

from .job_router import JobRouter

log = get_logger(__name__)


# ---------------------------------------------------------------------------
# Wire-format helpers (TS camelCase ↔ Python snake_case)
# ---------------------------------------------------------------------------


def _envelope_from_wire(raw: dict[str, Any]) -> JobEnvelope:
    """Convert a TS-side JobEnvelope JSON dict into a Pydantic JobEnvelope."""
    prov = raw.get("provenance") or {}
    return JobEnvelope(
        job_id=raw["jobId"],
        job_type=raw["jobType"],
        provenance=JobProvenance(
            origin=JobOrigin(prov["origin"]),
            requested_by_user_id=prov.get("requestedByUserId"),
            requested_by_admin_id=prov.get("requestedByAdminId"),
            request_id=prov["requestId"],
            enqueued_at=prov["enqueuedAt"],
        ),
        payload=raw.get("payload") or {},
        priority=int(raw.get("priority") or 0),
    )


def _result_to_wire(result: JobResult) -> dict[str, Any]:
    """Convert a Python JobResult into the camelCase JSON the TS API expects."""
    payload: dict[str, Any] = {
        "jobId": result.job_id,
        "status": result.status.value,
        "metrics": result.metrics or {},
    }
    if result.result is not None:
        payload["result"] = result.result
    if result.error is not None:
        payload["error"] = result.error
    if result.duration_ms is not None:
        payload["durationMs"] = result.duration_ms
    return payload


# ---------------------------------------------------------------------------
# Consumer
# ---------------------------------------------------------------------------


class WorkerAuthError(RuntimeError):
    """Raised when the TypeScript API rejects the worker token (401/403/503)."""


class JobConsumer:
    def __init__(self, config: WorkerConfig, router: JobRouter | None = None) -> None:
        self.config = config
        self.router = router or JobRouter()
        # Dev-only in-process queue, retained so unit tests can enqueue
        # synthetic jobs without an HTTP server. The production path uses
        # `fetch_pending_jobs()` instead.
        self._inbox: deque[JobEnvelope] = deque()
        self._outbox: list[JobResult] = []
        self._stop = asyncio.Event()
        self._current_job_id: str | None = None
        self._reported_status: str = "idle"
        self._last_error: str | None = None
        self._consecutive_errors: int = 0
        self._heartbeat_first_sent: bool = False
        self._capabilities: list[str] = [
            "user.claim_extraction",
            "vector.clustering",
            "inhouse.newsroom",
        ]

    # ----- public API used by tests / dev harness ------------------------

    def enqueue(self, job: JobEnvelope) -> None:
        self._inbox.append(job)

    def drain_results(self) -> list[JobResult]:
        results, self._outbox = self._outbox, []
        return results

    def request_stop(self) -> None:
        """Trigger a graceful shutdown of the consumer loop."""
        self._stop.set()

    # ----- HTTP bridge to the TS orchestrator ----------------------------

    def _headers(self) -> dict[str, str]:
        if not self.config.worker_token:
            raise WorkerAuthError(
                "MOUGLE_WORKER_TOKEN is not set. The worker cannot authenticate "
                "to the TypeScript API. See python-workers/README.md."
            )
        return {
            "Authorization": f"Bearer {self.config.worker_token}",
            "Content-Type": "application/json",
            "X-Worker-Id": self.config.worker_id,
        }

    def _url(self, path: str) -> str:
        return f"{self.config.api_base_url}{path}"

    def _check_auth_response(self, resp: requests.Response) -> None:
        if resp.status_code in (401, 403, 503):
            raise WorkerAuthError(
                f"Worker auth/availability failed: HTTP {resp.status_code} {resp.text[:200]}"
            )

    def fetch_pending_jobs(self) -> list[JobEnvelope]:
        """GET /api/worker/ai-jobs/pending — returns oldest-first up to batch_limit."""
        resp = requests.get(
            self._url("/api/worker/ai-jobs/pending"),
            params={"limit": self.config.batch_limit},
            headers=self._headers(),
            timeout=self.config.request_timeout_seconds,
        )
        self._check_auth_response(resp)
        if not resp.ok:
            log.warning(
                "job_consumer.fetch_pending.error",
                extra={"status": resp.status_code, "body": resp.text[:200]},
            )
            return []
        try:
            data = resp.json()
        except ValueError:
            log.warning("job_consumer.fetch_pending.invalid_json")
            return []
        envelopes_raw = data.get("envelopes") or []
        result: list[JobEnvelope] = []
        for raw in envelopes_raw:
            try:
                result.append(_envelope_from_wire(raw))
            except Exception as exc:  # noqa: BLE001 — skip malformed envelopes
                log.warning(
                    "job_consumer.envelope_parse_failed",
                    extra={"error": str(exc), "raw_job_id": (raw or {}).get("jobId")},
                )
        return result

    def claim_job_or_mark_running(self, job_id: str) -> bool:
        """POST /api/worker/ai-jobs/{jobId}/running — returns True if claimed."""
        resp = requests.post(
            self._url(f"/api/worker/ai-jobs/{job_id}/running"),
            json={"workerId": self.config.worker_id},
            headers=self._headers(),
            timeout=self.config.request_timeout_seconds,
        )
        self._check_auth_response(resp)
        if resp.status_code == 409:
            # Race lost or job already in terminal state.
            log.info("job_consumer.claim_lost", extra={"job_id": job_id})
            return False
        if not resp.ok:
            log.warning(
                "job_consumer.claim_failed",
                extra={"job_id": job_id, "status": resp.status_code, "body": resp.text[:200]},
            )
            return False
        return True

    def send_heartbeat(self) -> bool:
        """POST /api/worker/heartbeat — best-effort, never raises."""
        if not self.config.worker_token:
            return False
        body: dict[str, Any] = {
            "workerId": self.config.worker_id,
            "status": self._reported_status,
            "hostname": socket.gethostname(),
            "processId": str(os.getpid()),
            "version": self.config.worker_version,
            "capabilities": self._capabilities,
            "currentJobId": self._current_job_id,
        }
        if self._last_error:
            body["lastError"] = self._last_error[:500]
        try:
            resp = requests.post(
                self._url("/api/worker/heartbeat"),
                json=body,
                headers=self._headers(),
                timeout=self.config.request_timeout_seconds,
            )
            if not resp.ok:
                log.warning(
                    "job_consumer.heartbeat.failed",
                    extra={"status": resp.status_code, "body": resp.text[:200]},
                )
                return False
            if not self._heartbeat_first_sent:
                log.info("job_consumer.heartbeat.first_sent", extra={"worker_id": self.config.worker_id})
                self._heartbeat_first_sent = True
            return True
        except requests.RequestException as exc:
            log.warning("job_consumer.heartbeat.network_error", extra={"error": str(exc)})
            return False
        except Exception as exc:  # noqa: BLE001 — heartbeat must never crash the worker
            log.warning("job_consumer.heartbeat.unexpected", extra={"error": str(exc)})
            return False

    def submit_job_result(self, result: JobResult) -> bool:
        """POST /api/worker/ai-jobs/result — returns True on success."""
        resp = requests.post(
            self._url("/api/worker/ai-jobs/result"),
            json=_result_to_wire(result),
            headers=self._headers(),
            timeout=self.config.request_timeout_seconds,
        )
        self._check_auth_response(resp)
        if not resp.ok:
            log.warning(
                "job_consumer.submit_failed",
                extra={
                    "job_id": result.job_id,
                    "status": resp.status_code,
                    "body": resp.text[:200],
                },
            )
            return False
        return True

    # ----- job processing ------------------------------------------------

    async def process_job(self, job: JobEnvelope) -> JobResult:
        """Dispatch through the router; convert any unexpected error into a failed JobResult."""
        try:
            return await self.router.dispatch(job)
        except Exception as exc:  # noqa: BLE001 — final safety net
            log.exception("job_consumer.process_job.unhandled", extra={"job_id": job.job_id})
            return JobResult(
                job_id=job.job_id,
                status=JobStatus.FAILED,
                error=f"Unhandled worker exception: {type(exc).__name__}",
            )

    # ----- consumer loop -------------------------------------------------

    async def run_forever(self) -> None:
        log.info(
            "job_consumer.started",
            extra={
                "poll_interval_seconds": self.config.poll_interval_seconds,
                "max_concurrent_jobs": self.config.max_concurrent_jobs,
                "batch_limit": self.config.batch_limit,
                "worker_id": self.config.worker_id,
                "api_base_url": self.config.api_base_url,
                "token_configured": bool(self.config.worker_token),
            },
        )
        sem = asyncio.Semaphore(self.config.max_concurrent_jobs)
        loop = asyncio.get_running_loop()
        in_flight: set[asyncio.Task[None]] = set()

        async def _run(job: JobEnvelope) -> None:
            async with sem:
                self._current_job_id = job.job_id
                self._reported_status = "busy"
                result = await self.process_job(job)
                self._outbox.append(result)
                try:
                    await loop.run_in_executor(None, self.submit_job_result, result)
                except WorkerAuthError as exc:
                    log.error("job_consumer.submit.auth_failed", extra={"error": str(exc)})
                if result.status == JobStatus.FAILED:
                    self._consecutive_errors += 1
                    self._last_error = (result.error or "job failed")[:240]
                else:
                    self._consecutive_errors = 0
                    self._last_error = None
                self._current_job_id = None
                self._reported_status = "unhealthy" if self._consecutive_errors >= 3 else "idle"

        async def _heartbeat_loop() -> None:
            # First heartbeat synchronously announces the worker.
            await loop.run_in_executor(None, self.send_heartbeat)
            interval = max(5.0, self.config.heartbeat_interval_seconds)
            while not self._stop.is_set():
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=interval)
                except asyncio.TimeoutError:
                    pass
                await loop.run_in_executor(None, self.send_heartbeat)
            # Final draining heartbeat on graceful shutdown.
            self._reported_status = "draining"
            await loop.run_in_executor(None, self.send_heartbeat)

        heartbeat_task = asyncio.create_task(_heartbeat_loop())

        while not self._stop.is_set():
            jobs = await self._fetch_next_batch(loop)
            if not jobs:
                try:
                    await asyncio.wait_for(
                        self._stop.wait(), timeout=self.config.poll_interval_seconds
                    )
                except asyncio.TimeoutError:
                    pass
                continue

            for job in jobs:
                if self._stop.is_set():
                    break
                task = asyncio.create_task(_run(job))
                in_flight.add(task)
                task.add_done_callback(in_flight.discard)

        if in_flight:
            log.info("job_consumer.draining", extra={"in_flight": len(in_flight)})
            self._reported_status = "draining"
            await asyncio.gather(*in_flight, return_exceptions=True)
        await asyncio.gather(heartbeat_task, return_exceptions=True)
        log.info("job_consumer.stopped")

    async def _fetch_next_batch(self, loop: asyncio.AbstractEventLoop) -> list[JobEnvelope]:
        # Dev/test path: drain the in-process inbox first.
        if self._inbox:
            return [self._inbox.popleft()]
        try:
            envelopes = await loop.run_in_executor(None, self.fetch_pending_jobs)
        except WorkerAuthError as exc:
            log.error("job_consumer.fetch.auth_failed", extra={"error": str(exc)})
            # Back off a bit so we don't spin on a misconfigured token.
            await asyncio.sleep(max(self.config.poll_interval_seconds, 5.0))
            return []
        except requests.RequestException as exc:
            log.warning("job_consumer.fetch.network_error", extra={"error": str(exc)})
            return []

        claimed: list[JobEnvelope] = []
        for env in envelopes:
            try:
                ok = await loop.run_in_executor(None, self.claim_job_or_mark_running, env.job_id)
            except WorkerAuthError as exc:
                log.error("job_consumer.claim.auth_failed", extra={"error": str(exc)})
                break
            except requests.RequestException as exc:
                log.warning(
                    "job_consumer.claim.network_error",
                    extra={"job_id": env.job_id, "error": str(exc)},
                )
                continue
            if ok:
                claimed.append(env)
        return claimed


# Convenience module-level entrypoint (used by main.py and ad-hoc smoke tests).
async def run_consumer_loop(config: WorkerConfig) -> None:
    consumer = JobConsumer(config=config)
    await consumer.run_forever()
