# Mougle Python AI Worker Layer

This subsystem hosts **advanced AI / ML / agent workloads** for Mougle. It is a
separate, isolated layer — the core Mougle app remains React + Vite + Express +
TypeScript and is **not** rewritten in Python.

## Architecture

```
React / Vite frontend
        ↓
TypeScript / Express API   (auth, billing, permissions, routing — unchanged)
        ↓
ai_jobs Postgres table     (TypeScript creates jobs; durable, oldest-first)
        ↓
Python AI Worker Layer     (THIS DIRECTORY — polls the TS API over HTTP)
        ↓
JobRouter → handler        (user / inhouse / vector / media / eval)
        ↓
POST /api/worker/ai-jobs/result   →   TypeScript writes succeeded/failed
```

The Python layer never talks to the frontend directly and never touches
Postgres directly. The frontend always calls the TypeScript API. The TS API
checks permissions and writes the job row. The Python worker authenticates
with a dedicated worker token (not an admin session), polls for pending jobs,
claims them, runs them, and posts the result back to the TS API.

## Two clearly separated agent families

### `agents/user_agents/` — user-facing agents
Available to Mougle end-users for complex tasks: content research, newsroom
assistance, claim extraction, fact-checking support, document analysis,
semantic clustering, summarization, media analysis, audio/video processing,
personalized AI workflows, long-running user jobs, batch processing, report
generation.

User agents must **never** access admin-only or internal-only workflows by
default. Permission gating happens in the TypeScript API before a job is
enqueued, and is re-verified by the job router in `jobs/job_router.py`.

### `agents/inhouse_agents/` — internal Mougle agents
Used by the platform/admin team only: quality evaluation, LLM output scoring,
moderation assistance, duplicate detection, newsroom intelligence, source
credibility analysis, vector search experiments, model comparison, agent
benchmarking, system monitoring intelligence, research notebooks, internal
workflow automation, advanced ML experiments, computer vision, audio/video ML
pipelines.

In-house agents are marked `INTERNAL_ONLY = True` and the job router rejects
any job that targets an in-house agent without admin-level provenance.

## Supporting subsystems

- `evals/` — LLM evaluation, scoring, benchmarks.
- `vector/` — embeddings, vector search, clustering workers.
- `media/` — audio/video ML, computer vision, transcription.
- `jobs/` — job contracts, router, consumer loop.
- `shared/` — Pydantic contracts, config, logging, security helpers.

## How the worker talks to TypeScript

All bridge traffic goes over HTTP to three worker-scoped endpoints. They are
guarded by a dedicated `requireWorkerToken` middleware that does NOT grant
general admin access:

| Endpoint                                              | Method | Purpose                                              |
| ----------------------------------------------------- | ------ | ---------------------------------------------------- |
| `/api/worker/ai-jobs/pending?limit=N`                 | GET    | Oldest-first pending jobs (eligible to run).         |
| `/api/worker/ai-jobs/:jobId/running`                  | POST   | Atomically claim/lock; sets `running` + `locked_by`. |
| `/api/worker/ai-jobs/result`                          | POST   | Submit final `JobResult` (succeeded/failed).         |

Every request must include the worker token:

```
Authorization: Bearer <MOUGLE_WORKER_TOKEN>
X-Worker-Id: <WORKER_ID>
```

Behaviour:
- If the server has not configured `MOUGLE_WORKER_TOKEN` (or it is shorter
  than 16 chars), every worker request is rejected with **503** so a
  misconfigured deployment cannot accidentally allow unauthenticated workers.
- Missing token → **401**. Invalid token → **403** (constant-time compare).
- A lost claim race (job already terminal or claimed) returns **409**.

## Required environment variables

Set on the **Python worker** process:

| Variable                          | Required | Default                  | Notes                                                                   |
| --------------------------------- | -------- | ------------------------ | ----------------------------------------------------------------------- |
| `MOUGLE_API_BASE_URL`             | Yes      | `http://localhost:5000`  | Base URL of the Mougle TypeScript API.                                  |
| `MOUGLE_WORKER_TOKEN`             | Yes      | _(none)_                 | Shared secret; must match the server-side value.                        |
| `WORKER_ID`                       | No       | `py-worker-<host>-<pid>` | Identifies this worker in `locked_by`.                                  |
| `WORKER_POLL_INTERVAL_SECONDS`    | No       | `2.0`                    | Sleep between polls when the queue is empty.                            |
| `WORKER_BATCH_LIMIT`              | No       | `5`                      | Max jobs fetched per poll (server caps at 100).                         |
| `PYTHON_WORKER_MAX_CONCURRENCY`   | No       | `4`                      | In-flight jobs per worker process.                                      |
| `WORKER_HTTP_TIMEOUT_SECONDS`     | No       | `15.0`                   | Per-request HTTP timeout.                                               |

Set on the **TypeScript app** process (for the guard to be active):

| Variable               | Required | Notes                                                                           |
| ---------------------- | -------- | ------------------------------------------------------------------------------- |
| `MOUGLE_WORKER_TOKEN`  | Yes      | Same secret as above. Must be **at least 16 characters**, else worker → 503.    |

## Running the Python worker manually

```bash
# 1. Install Python deps (one-time)
pip install -r python-workers/requirements.txt

# 2. Set the bridge env vars (example values)
export MOUGLE_API_BASE_URL="http://localhost:5000"
export MOUGLE_WORKER_TOKEN="<same as server>"
export WORKER_ID="local-dev"

# 3. Start the consumer loop
python python-workers/main.py
```

Press `Ctrl+C` (SIGINT) or send SIGTERM for a graceful shutdown — the worker
will finish in-flight jobs, post their results, then exit.

The Python worker is **optional** for running the core Mougle app. The
TypeScript app starts and serves traffic with or without the Python worker
running. Jobs simply remain in `pending` state until a worker consumes them.

## How a job moves through the system

1. **Enqueue** — TS route handler calls `aiJobService.create*` which INSERTs
   a row into `ai_jobs` with `status='pending'`.
2. **Fetch** — Worker calls `GET /api/worker/ai-jobs/pending?limit=N`, gets
   oldest-first envelopes.
3. **Claim** — For each envelope, worker calls
   `POST /api/worker/ai-jobs/:jobId/running { workerId }`. The TS service
   does an atomic `UPDATE ... WHERE status IN ('pending','running')
   RETURNING *` so two workers cannot double-claim.
4. **Dispatch** — Worker hands the envelope to `JobRouter.dispatch()`, which
   re-checks origin and invokes the registered handler (`user.*`,
   `inhouse.*`, `vector.*`, `media.*`, `eval.*`).
5. **Submit result** — Worker calls `POST /api/worker/ai-jobs/result` with
   the JSON-encoded `JobResult`. TS sets `completed_at` or `failed_at`,
   stores `result` / `error`, clears the lock.
6. **Read** — Frontend polls `GET /api/ai-jobs/:jobId` and sees the
   `AiJobView` (no payload internals leaked; non-admins only see their own
   user-origin jobs).

## How to test with a pending job

```bash
# As an authenticated user (cookie session) — enqueues user.claim_extraction
curl -X POST http://localhost:5000/api/ai-jobs/claim-extraction \
  -H "content-type: application/json" \
  -b "<your dev session cookie>" \
  -d '{"articleIds":["a1","a2"],"maxClaimsPerArticle":4}'
# → 202 { "jobId": "...", "status": "pending" }

# Start the worker
python python-workers/main.py

# Poll the view a couple of seconds later
curl http://localhost:5000/api/ai-jobs/<jobId> -b "<cookie>"
# → status: pending → running → succeeded (or failed)
```

You can also verify the worker token guard directly:

```bash
curl -i http://localhost:5000/api/worker/ai-jobs/pending
# → 401 (no token)

curl -i http://localhost:5000/api/worker/ai-jobs/pending \
  -H "Authorization: Bearer wrong-token"
# → 403 (invalid)
```

## Failure handling

- A handler that raises is caught at two levels (router and consumer) and
  produces a `JobResult { status: failed, error: "<safe summary>" }`. No
  stack traces or secrets are sent to the TS API.
- An HTTP error during result submission is logged; the worker keeps
  processing other jobs.
- An auth failure (401/403/503) causes the consumer to back off for at
  least 5 seconds so a bad token does not spin the loop.
- A stale `running` row (worker died mid-job) can be re-claimed: the
  atomic UPDATE accepts `status IN ('pending','running')` and increments
  `retry_count`.

## What this layer is NOT

- Not a queue manager (no Redis, no separate broker — `ai_jobs` table is
  the queue).
- Not authoritative on permissions (TS is the gate; Python re-checks
  defensively).
- Not exposed to the frontend (no Python route is reachable from the
  browser — only the TS API is).
- Not auto-started by the TS app (operator runs `python main.py`).
