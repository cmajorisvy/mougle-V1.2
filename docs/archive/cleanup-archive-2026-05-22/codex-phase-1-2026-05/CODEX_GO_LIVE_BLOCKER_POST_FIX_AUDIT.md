# Codex Go-Live Blocker — Post-Fix Audit

**Audit date:** 2026-05-16
**Audit type:** verification re-audit (no code changes)
**Scope:** the exact files touched by commit `14e6281`
  ("Fix Critical/High items from media-pipeline go-live audit (Codex-safe only)").
**Compared against:** [`CODEX_GO_LIVE_BLOCKER_AUDIT_MEDIA_PIPELINE.md`](./CODEX_GO_LIVE_BLOCKER_AUDIT_MEDIA_PIPELINE.md)
  (the original blocker inventory: 3 CRITICAL, 6 HIGH, 17 MED, 4 LOW).
**Method:** static read-only inspection of the changed files, runtime check
  via `npm run check` (tsc + 226 node:test cases) and `npm run build`,
  cross-check against the original audit's "Recommended fix" text.
**Hard constraints (verified, see § 5):** no `db:push`, no schema change,
  `shared/schema.ts` untouched, no secrets serialised, no public publishing
  / YouTube / social / live, no external provider calls, no object-storage
  uploads, no signed-URL emission, no render behaviour change beyond
  audit-confirmed guards.

---

## TL;DR

> **Not production go-live ready until C-DB-1 is resolved.**
>
> **Codex-safe runtime blockers are resolved or partially resolved as
> documented below.**
>
> **A human-approved migration window is still required** to land the
> persistent failure column (C-FF-1 remainder), the verified-newsroom
> schema activation (C-DB-1), and the UUID/PK hardening (H-DB-2).

| Severity | Count in original audit | Status today |
| --- | ---: | --- |
| CRITICAL fixed | — | **1 of 3** (C-ENV-1) |
| CRITICAL partially fixed | — | **1 of 3** (C-FF-1: service layer only) |
| CRITICAL still blocking | — | **1 of 3** (C-DB-1: schema activation) |
| HIGH fixed | — | **4 of 6** (H-ENV-2, H-LIFE-1, H-FF-2, H-DEP-1) |
| HIGH partially fixed | — | **1 of 6** (H-ERR-1: tied to C-FF-1 remainder) |
| HIGH still blocking | — | **1 of 6** (H-DB-2: UUID/PK hardening) |
| MED / LOW | 17 / 4 | unchanged (out of scope this PR) |

---

## 1. Fixed findings — verified

### 1.1 C-ENV-1 — Boot-time validation of mandatory secrets ✅
- **Implementation:** `server/config/validate-env.ts` (105 lines).
  `MANDATORY_PRODUCTION_SECRETS` (L29) lists `DATABASE_URL`,
  `SESSION_SECRET`, `OPENAI_API_KEY` (alias `AI_INTEGRATIONS_OPENAI_API_KEY`),
  `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`. `validateEnv()` (L49) returns
  `{ level, issues, productionMode }`; only `productionMode === true`
  promotes missing-secret issues to `fatal`.
- **Wired in:** `server/index.ts:13` imports it; the IIFE-block at L20-23
  runs validation before *any* other module work, and `process.exit(1)` is
  called when `shouldExit` is true. This runs before `createServer`, before
  `PgSession` setup, and before route registration — so a misconfigured
  prod deploy fails fast.
- **Verification:**
  - `tests/validate-env.test.ts` covers the six representative cases
    (all-set → ok, missing OPENAI → fatal, alias accepted, missing storage
    → fatal, `STORAGE_LOCAL_OK=1` escape → ok, dev-mode → warn-only).
    All six pass.
  - No secret values are read or logged: the reporter prints only the
    variable *name* and a static `hint` (`reportEnvValidation` L94+).
- **Verdict: FIXED.** Aligns with original audit's "Recommended fix"
  (`validateProductionEnv()` hard-fails on missing list in production).

### 1.2 H-ENV-2 — Silent fallback to `.local` storage in production ✅ (boot gate)
- **Implementation:** Same `validateEnv()` (L62-79). Production mode plus
  no `REPLIT_OBJECT_STORAGE_BUCKET_ID` / `REPLIT_SIDECAR_ENDPOINT` /
  `CLOUDFLARE_R2_TOKEN` / `AWS_S3_TOKEN`, and no `STORAGE_LOCAL_OK=1`
  opt-in, emits a `missing_persistent_storage` fatal — which feeds the
  same exit-1 path as C-ENV-1.
- **Verification:** dedicated test cases in `tests/validate-env.test.ts`
  cover both the fatal path and the `STORAGE_LOCAL_OK=1` escape hatch.
- **Remaining (documented in updated original audit, not blocking go-live
  by itself):** the original "hourly platform_alert while in fallback" is
  *not* implemented. This is deferred — once the boot gate is enforced, a
  production process simply cannot enter unintentional fallback, so the
  in-flight alert is a polish item, not a hard blocker.
- **Verdict: FIXED for go-live purposes.** Original audit's primary
  recommendation (refuse start without persistent storage in production)
  is met.

### 1.3 H-LIFE-1 — FFmpeg concurrency cap + queue overflow ✅
- **Implementation:** `server/services/render-mp4-service.ts:24-72`.
  - `MAX_CONCURRENT_FFMPEG = 1`, `MAX_QUEUE_DEPTH = 5`.
  - `acquireFfmpegSlot()` / `releaseFfmpegSlot()` form a small async
    semaphore. Overflow throws `RenderQueueOverflowError`.
  - Every spawn now goes through `runFfmpegWithConcurrencyCap()` (both
    the with-subs attempt and the no-subs fallback at L340/356).
  - Overflow is caught at L339-352 and surfaced as a structured
    `failureReason: "render_queue_overflow"` rather than an exception —
    so the caller never silently times out a queued request.
  - `getRenderQueueStats()` exposes `{ active, queued, maxConcurrent,
    maxQueueDepth }` for future telemetry routes.
- **Verification:**
  - `tests/render-mp4-guards.test.ts` asserts the stats shape and bounds.
  - Manual code reading confirms `releaseFfmpegSlot()` runs in a `finally`
    block (L260), so a thrown `FfmpegInvocationError` cannot leak a slot.
- **Remaining (documented):** route-level HTTP 429 mapping. Today the
  route still receives a structured failure object; a future route patch
  should translate `failureReason === "render_queue_overflow"` into HTTP
  429 with a `Retry-After`. Polish, not a hard blocker — the cap itself
  is enforced.
- **Verdict: FIXED.**

### 1.4 H-FF-2 — Unsafe SRT paths rejected at the filter boundary ✅
- **Implementation:** `server/services/render-mp4-service.ts:73-79`
  (`assertIsLocalRenderPath`). Compares `resolve(p)` against
  `LOCAL_RENDER_DIR` (= `${cwd}/.local/media-assets/render`). Anything
  outside throws `srt_path_outside_render_dir`.
- **Call site:** L307-314 in `writeMp4ForRenderJob`. The guard is invoked
  *before* `existsSync` and *before* `buildSubtitlesFilter`; on rejection
  a `console.warn` is logged and `srtPath` is set to `null`, so the render
  proceeds without subtitles — fail-open for usability but fail-closed for
  injection.
- **Verification:** `tests/render-mp4-guards.test.ts` passes `/etc/passwd`
  as `srtPath` and confirms a structured result is returned (never an
  uncaught throw, never `/etc/passwd` substituted into the filter chain).
- **Verdict: FIXED.** Matches original audit's "Recommended fix"
  verbatim (`assertIsLocalRenderPath(srtPath)` at top of
  `writeMp4ForRenderJob`).

### 1.5 H-DEP-1 — SIGTERM/SIGINT shutdown registry for interval services ✅
- **Implementation:** `server/services/shutdown-registry.ts` (74 lines).
  - Named stoppers via `registerShutdown(name, stop)` (L24).
  - `runShutdownRegistry()` (L32) iterates in **reverse** registration
    order so the most-recently-started service drains first.
  - Each stopper is `Promise.race`'d against a `perStopperTimeoutMs`
    timeout (default 5s); a hang in one stopper cannot block the rest.
  - Catches all per-stopper failures with a `console.error` (never throws
    upward, never aborts the registry loop).
  - `shuttingDown` flag makes the registry idempotent.
  - `bindShutdownSignals()` (L52) attaches a single handler to `SIGTERM`
    and `SIGINT`; a `signalsBound` flag prevents double-binding.
- **Stop methods added:**
  - `server/services/newsService.ts:303` — `stopScheduler()` clears the
    interval and nulls the handle. `startScheduler` (L283) is now
    idempotent (no-op if handle already set).
  - `server/services/news-pipeline-service.ts:312` — `stopAutoPipeline()`,
    matching idempotent start.
  - `server/services/panic-button-service.ts` — `stop()` clears
    `alertCheckInterval`.
  - `server/services/agent-orchestrator.ts` — pre-existing `stop()` is
    reused.
- **Wiring:** `server/index.ts:235-250` —
  - `bindShutdownSignals()` is called immediately after `listen`
    succeeds.
  - `http-server`, `agent-orchestrator`, `news-service`, `news-pipeline`,
    `panic-button` all `registerShutdown`'d inside the `WORKER_ENABLED`
    block (orchestrator/news/panic) plus the always-on http-server.
- **Verification:** `tests/shutdown-registry.test.ts` covers:
  reverse-order invocation, continuation through a throwing stopper, the
  hang-timeout path (50 ms hang, completes in < 500 ms), idempotency, and
  registration reflection. All 5 cases pass.
- **Verdict: FIXED.** Resolves the rolling-deploy race condition called
  out in the original failure scenario.

---

## 2. Partially fixed findings — verified and remaining work documented

### 2.1 C-FF-1 — FFmpeg failures surfaced (service layer only) ⚠️
- **What's in place at the service layer:**
  - `Mp4PreviewResult` (`render-mp4-service.ts:262-275`) adds
    `failureReason: string | null`, `ffmpegExitCode: number | null`,
    `ffmpegStderrTail: string`.
  - `FfmpegInvocationError` (L213-225) preserves the structured cause:
    timeout, spawn error, non-zero exit, with the last 400 B of stderr.
  - Every failure path returns a populated `failureReason`:
    `render_queue_overflow` (L348), `ffmpeg_timeout_after_*` /
    `ffmpeg_spawn_error:*` / `ffmpeg_nonzero_exit_<code>` /
    `unknown:<msg>` (L353-376), and `output_missing_or_empty` (L385).
  - A `console.error` line (L366) prints the reason, exit code, and
    JSON-stringified last 200 B of stderr for any failure. (Output is
    binary-safe; no secrets are emitted — only ffmpeg's own diagnostics.)
- **What's propagated to the caller:**
  `server/services/avatar-video-render-service.ts` (around L1080) writes
  `mp4FailureReason`, `mp4FfmpegExitCode`, `mp4FfmpegStderrTail` onto
  `baseline` inside the existing `previewMetadata` jsonb. **No schema
  change.** The catch arm at L1089 also writes a `caller_exception:*`
  reason so an exception above the call site is still observable.
- **What is still pending (matches original audit's caveats):**
  - **Dedicated DB columns** (`failure_reason TEXT`,
    `ffmpeg_stderr_tail TEXT`) on the render-job row — **blocked on the
    same human migration window as C-DB-1.** Without these, the failure
    metadata lives only in `previewMetadata` jsonb and in the process log;
    it is not first-class queryable.
  - **Admin Preview Studio UI panel** that displays the failure reason —
    deliberately not built in this PR (no product features per
    constraints).
- **Verdict: PARTIALLY FIXED.** Service-layer plumbing is complete and
  verified; persistence + UI tied to C-DB-1.

### 2.2 H-ERR-1 — Same underlying issue as C-FF-1 ⚠️
- Service-level `artifact:null` is now always accompanied by a non-null
  `failureReason` (see § 2.1). A caller that checks `result.artifact`
  alone still gets the legacy behaviour, but **a caller that switched to
  `Mp4PreviewResult` can no longer mistake "no artifact" for "everything
  fine"**. The only first-party caller
  (`avatar-video-render-service.ts:1080`) has been updated.
- **Remaining work:** persisted column + UI, same as C-FF-1.
- **Verdict: PARTIALLY FIXED.** Tracks with C-FF-1.

---

## 3. Still-blocking findings — require a human-approved migration window

These were intentionally **out of scope** for the prior Codex-safe PR and
remain blockers for production go-live.

### 3.1 C-DB-1 — Verified-newsroom schema not in `db:push` 🛑
- **Status: UNCHANGED. STILL BLOCKING.**
- `shared/newsroom-schema.ts` is still not imported by `shared/schema.ts`
  (verified by `rg -n "newsroom" shared/schema.ts` — no matches), so
  `drizzle-kit push` will not create the verified-newsroom tables in a
  fresh Replit Deployment database.
- **Why it stayed out of scope:** activating the import would expand the
  next `db:push` diff far beyond a single migration boundary and requires
  the founder to approve the data-model surface in production. The hard
  constraints on this PR explicitly forbid modifying `shared/schema.ts`
  or running `db:push`.
- **Required next step (human):** approve the schema activation diff,
  run `db:push` in a controlled window, and pair it with the C-FF-1
  failure-column migration (item 3.3 below) so both ship in one
  migration.

### 3.2 H-DB-2 — `varchar` primary keys with `gen_random_uuid()` default 🛑
- **Status: UNCHANGED. STILL BLOCKING (per original audit severity).**
- No schema change in this PR. Original recommendation (native `uuid`
  columns) requires `shared/schema.ts` edits and a `db:push` — both
  forbidden under current constraints.
- **Required next step (human):** decide on PK strategy (keep varchar +
  document, or switch to native `uuid`) and include in the same migration
  window as C-DB-1 / C-FF-1 remainder.

### 3.3 C-FF-1 persistent failure column 🛑
- **Status: UNCHANGED. STILL BLOCKING the *full* C-FF-1 fix.**
- Service-layer surface exists; only the DB column + admin UI are left
  (see § 2.1). Bundle with the C-DB-1 migration window.

---

## 4. Regression checks

| Check | Result |
| --- | --- |
| `npm run check` (tsc + 226 node:test cases) | **PASS** (226/226, 0 failures, ~7.7 s) |
| `npm run build` (vite client + esbuild server) | **PASS** (vite 25.2 s, esbuild 1.1 s, `dist/index.cjs` 2.9 MB) |
| Diff scope vs. fix PR | **unchanged** — 13 files, +605/-21 lines |
| `shared/schema.ts` touched | **No** (last change `4feddeb`, predates this work) |
| `shared/schema.ts` references `newsroom-schema` | **No** (`rg "newsroom" shared/schema.ts` empty) |
| `db:push` invocation in any new file | **No** (`rg "db:push\|drizzle-kit push" server/index.ts server/config/ server/services/shutdown-registry.ts` empty) |
| New external provider calls | **No** (the changed files spawn `ffmpeg`, read env, manipulate intervals — no HTTP fetch added) |
| Object-storage uploads added | **No** (the existing `uploadIfConfigured` call at `render-mp4-service.ts` is unchanged) |
| Signed-URL emission added | **No** |
| YouTube / social / live publishing wired | **No** — `social-publisher-service` and live-debate code paths untouched |
| Render behaviour changed beyond audit guards | **No** — only added concurrency cap, srt-path guard, and structured failure metadata. The actual ffmpeg filter graph and codec args are byte-identical to the pre-fix code |
| Secrets printed or serialized | **No** — `reportEnvValidation` prints variable *names* and static hints only; ffmpeg stderr tail is sliced to 400 B and JSON-stringified (binary-safe, contains no app secrets); `previewMetadata` jsonb stores the same stderr tail |

---

## 5. Hard-constraint compliance (line-by-line)

| Constraint | Verified by | Result |
| --- | --- | --- |
| Do not modify `shared/schema.ts` | `git log -- shared/schema.ts` (last change predates fix PR) | ✅ |
| Do not import `shared/newsroom-schema.ts` into `shared/schema.ts` | `rg "newsroom" shared/schema.ts` → empty | ✅ |
| Do not run `db:push` | No git artefacts; no script invocation in PR; `db:push` script still defined in package.json but not invoked | ✅ |
| Do not add migrations | No new files under `drizzle/` or `migrations/` in diff | ✅ |
| Do not add product features | All new code is observability/guarding; no new routes, no new UI | ✅ |
| Do not call external providers | New code touches only the ffmpeg child process and `process.env` | ✅ |
| Do not upload to object storage | `uploadIfConfigured` call site unchanged | ✅ |
| Do not generate signed URLs | No URL-signing code added | ✅ |
| Do not enable public publishing / YouTube / social / live | None of those services touched | ✅ |
| Do not change render behaviour except guards | Filter chain construction and ffmpeg args identical to pre-fix; only spawn wrapping and SRT-path validation added | ✅ |

---

## 6. Test inventory (post-fix)

New under this PR (all green):
- `tests/validate-env.test.ts` — 6 cases (all-set, missing OPENAI fatal,
  alias accepted, missing storage fatal, `STORAGE_LOCAL_OK=1` ok, dev
  warn-only).
- `tests/shutdown-registry.test.ts` — 5 cases (reverse-order, throw
  resilience, hang timeout, idempotency, registration reflection).
- `tests/render-mp4-guards.test.ts` — 2 cases (structured-failure shape
  on `/etc/passwd` srtPath, queue stats shape).

Suite totals: **55 suites / 226 tests / 0 failures.**

---

## 7. Deployment recommendation

### Go / No-go: **NO-GO for production publish.**

### Why
1. **C-DB-1 is unresolved.** A first-time Replit Deployment will not have
   the verified-newsroom tables, and any code path that touches them will
   500. This is the single largest production risk and was deliberately
   left for the human approval window.
2. **C-FF-1 only has the service-layer half landed.** Once C-DB-1's
   migration window opens, ship the `failure_reason` / `ffmpeg_stderr_tail`
   columns in the same migration and add the admin UI panel.
3. **H-DB-2 is unchanged.** The PK strategy decision must be made in the
   same window — switching later is more expensive than deciding once.

### What *is* safe to redeploy today (internal / dev / staging)
- Boot now refuses to start on any production misconfiguration of the
  five mandatory secrets or persistent storage — preventing the silent
  500 mode previously possible.
- A burst of preview clicks can no longer OOM the renderer; queue
  overflow returns a structured reason instead of hanging.
- Rolling restarts now drain news fetch, news pipeline, panic-button
  monitor, and agent-orchestrator intervals before exit.
- FFmpeg failures are no longer silent at the service layer; the cause
  is logged with stderr tail and attached to `previewMetadata`.
- Path-traversal vector on the subtitles filter is closed.

### Required next steps (human, in this order)
1. Review and approve the schema-activation diff that imports
   `shared/newsroom-schema.ts` into `shared/schema.ts`, including
   resolving the H-DB-2 PK decision.
2. In the same migration, add the C-FF-1 columns
   (`failure_reason TEXT`, `ffmpeg_stderr_tail TEXT`, optional
   `ffmpeg_exit_code INTEGER`) and any FK/index gaps surfaced by
   M-DB-3.
3. Run `db:push` in a controlled window with a snapshot taken
   immediately prior.
4. Ship the admin Preview Studio UI panel that surfaces the new
   columns (closes the visible half of C-FF-1 / H-ERR-1).
5. Map `failureReason === "render_queue_overflow"` to HTTP 429 with
   `Retry-After` at the preview route (closes the visible half of
   H-LIFE-1).
6. Re-run this audit. Once all CRITICAL items show **FIXED** (not
   PARTIALLY), the platform is go-live ready.

---

## 8. Final status statement

> **Not production go-live ready until C-DB-1 is resolved.**
> **Codex-safe runtime blockers are resolved or partially resolved as
> documented.**
> **A human-approved migration window is still required** to land
> C-DB-1, the C-FF-1 persistent column, the admin UI panel, and the
> H-DB-2 PK decision.

— End of post-fix audit.
