# Codex Go-Live Blocker Audit — Media / Newsroom Pipeline

**Audit date:** 2026-05-16
**Scope:** verified-newsroom pipeline (article ingest → cluster → claim
extraction → VerifiedKnowledge → NewsroomDataPackage → RenderManifest →
voice/TTS → MP4 render → SRT/captions → admin Preview Studio)
**Method:** static read-only inspection of `server/`, `shared/`, `client/`,
`drizzle/`, plus cross-check against `scripts/e2e/phase1b-verified-newsroom-flow.mjs`
(passing 13/13 fixture-mode checks today).
**Code changes in this task:** none. This is a blocker inventory only.

---

## Severity legend

| Tag | Meaning |
| --- | --- |
| **CRITICAL** | Hard go-live blocker. Ship will break, leak, or be unsafe. |
| **HIGH** | Real production risk; ship-blocker unless explicitly accepted. |
| **MED** | Should be fixed before scale-up; not a hard blocker for a closed admin preview. |
| **LOW** | Hygiene / hardening; safe to defer. |

For each finding: `Codex-safe?` = whether an autonomous agent can apply the
fix without human judgement; `Human review?` = whether a human must approve
the resulting diff before merge.

---

## Executive summary

| # | Area | CRITICAL | HIGH | MED | LOW |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | Auth & admin guards | 0 | 0 | 1 | 1 |
| 2 | CSRF on write routes | 0 | 0 | 0 | 0 |
| 3 | Public route exposure | 0 | 0 | 2 | 0 |
| 4 | Secret leakage | 0 | 0 | 1 | 1 |
| 5 | Media-asset access | 0 | 0 | 0 | 1 |
| 6 | Storage path traversal | 0 | 0 | 0 | 0 |
| 7 | Render job lifecycle | 0 | 1 | 2 | 0 |
| 8 | FFmpeg / Remotion reliability | 1 | 1 | 1 | 0 |
| 9 | Database / schema | 1 | 1 | 2 | 1 |
| 10 | Environment-variable requirements | 1 | 1 | 1 | 0 |
| 11 | Deployment / runtime | 0 | 1 | 1 | 0 |
| 12 | Error handling | 0 | 1 | 2 | 0 |
| 13 | Logging / audit trail | 0 | 0 | 2 | 0 |
| 14 | Preview Studio safety | 0 | 0 | 1 | 0 |
| 15 | YouTube / social / live gates | 0 | 0 | 1 | 0 |
| **TOTAL** | | **3** | **6** | **17** | **4** |

**Bottom line:** the verified-newsroom flow is *internally* safe (locked
safety envelope, root-admin gating, strict filename allowlists, CSRF on
mutating routes, no live publish path). It is **not yet shippable to a
production Replit Deployment** because of three CRITICAL blockers that
together would either lose data or never start:

1. **C-DB-1** — `shared/newsroom-schema.ts` tables are deliberately
   excluded from migrations; `db:push` will not create them.
2. **C-ENV-1** — Mandatory `OPENAI_API_KEY` /
   `AI_INTEGRATIONS_OPENAI_API_KEY` has no startup-time validation; first
   user action 500s.
3. **C-FF-1** — FFmpeg failures are swallowed and surface as
   `{ artifact: null }` with no reason — combined with the silent local-
   storage fallback (`H-ENV-2`), a failed render in production is
   indistinguishable from a successful one with a missing file.

The remaining HIGH findings (render-job lifecycle, schema indexes,
deployment-time `setInterval` services, ephemeral `.local` writes) are
shippable-with-acceptance for a closed admin alpha but block a wider
roll-out.

---

## 1. Auth & admin guards

### M-AUTH-1 — Session cookie `sameSite=lax` for admin panel
- **File(s):** `server/index.ts:104-110`
- **Root cause:** Session cookies use `sameSite: "lax"` globally. Admin
  operations should use `Strict` to harden against cross-site request
  forgery from any other site even before CSRF token check runs.
- **Failure scenario:** A future regression that exempts a state-changing
  admin route from `csrfMiddleware` would become exploitable from a
  victim-clicked link in another tab. With `Strict` the session cookie
  would not be sent at all.
- **Recommended fix:** Either split the admin session into its own cookie
  with `sameSite: "strict"`, or upgrade the global session cookie to
  `strict` and verify no auth-via-redirect flows break (`/api/admin/access-requests/approve/:token`).
- **Effort:** ~2h.
- **Codex-safe?** Partial — the split-cookie path is mechanical; the
  global upgrade requires runtime testing of the email-token approval
  flow.
- **Human review?** **Yes** — auth changes always.

### L-AUTH-2 — `requireRootAdmin` is the only auth tier exercised by media routes
- **File(s):** `server/routes.ts:2536, 3213-3300`, `server/routes/newsroom-preview-routes.ts:81, 115, 164`
- **Root cause:** All media + newsroom write routes funnel through a
  single `requireRootAdmin` check. There is no per-role split (operator
  vs. founder). The current design is correct for Phase 1B but couples
  every staff member with delete/render power.
- **Failure scenario:** A staff handover or shared root-admin credential
  has full delete-on-render-job power with no per-action approval.
- **Recommended fix:** Defer until staff > 1; add an `operator` role and
  require dual-approve on `/cancel`, `/render`.
- **Effort:** ~1d.
- **Codex-safe?** Yes (mechanical role plumbing).
- **Human review?** Yes.

---

## 2. CSRF on write routes

No findings. `csrfMiddleware` is mounted globally for `/api/*` in
`server/index.ts:141` and enforces `x-csrf-token` header equality against
`req.session.csrfToken` for every non-safe method
(`server/middleware/csrf.ts:50`). All admin POST/PUT/PATCH/DELETE routes
audited (video-render lifecycle, newsroom previews, voice jobs, AI job
pipeline triggers) inherit it. The single CSRF exemption
(`/api/external-agents/`, `server/middleware/csrf.ts:25`) uses a separate
API-key auth and does not touch the verified-newsroom path.

---

## 3. Public route exposure

### M-PUB-1 — `/api/admin/access-requests` is unauthenticated POST
- **File(s):** `server/routes.ts:2456` (approx — see route registration block)
- **Root cause:** The "request admin access" endpoint must be public so
  prospective staff can request access, but it accepts arbitrary input and
  writes to the database. No CAPTCHA / per-IP rate limiting beyond the
  global `rate-limiter` middleware.
- **Failure scenario:** Spammed access requests bloat the admin inbox
  and the underlying table. Larger risk: a future change to that handler
  that trusts the email field for outbound mail could be weaponised.
- **Recommended fix:** Add a CAPTCHA (hCaptcha / Cloudflare Turnstile) or
  a per-IP token-bucket of e.g. 3/hour for this single route.
- **Effort:** ~2h.
- **Codex-safe?** Yes for the rate-limit path; CAPTCHA requires a key.
- **Human review?** Yes.

### M-PUB-2 — `/api/conversations/:id/messages` lacks explicit session auth
- **File(s):** `server/replit_integrations/audio/routes.ts:63`
- **Root cause:** Conversation messages POST relies on the obscurity of
  the conversation ID and the audio integration's own billing/quota; no
  `requireAuth` middleware is mounted.
- **Failure scenario:** A leaked or guessable conversation ID lets any
  caller append messages to that conversation. Out of scope for the
  *newsroom* pipeline, but the same Express app exposes it.
- **Recommended fix:** Add `requireAuth` and verify caller owns the
  conversation, or document that this route is intentionally public and
  enumerate the per-call quota.
- **Effort:** ~3h.
- **Codex-safe?** Yes.
- **Human review?** Yes.

---

## 4. Secret leakage

### M-SEC-1 — Silent OpenAI/HeyGen key fall-through to runtime 500s
- **File(s):** `server/services/openai-*`, `server/services/newsService.ts`, AI gateway
- **Root cause:** Secret presence is not asserted at boot; the first
  request to fail surfaces the missing-key error in a JSON response. Most
  handlers `console.error` the underlying Error which may include the
  request URL and provider response body. No filter to redact
  `Bearer ...` strings in logs.
- **Failure scenario:** A misconfigured deployment 500s on first user
  action, and the log line includes the full provider error body. If the
  provider echoes the request key prefix (some do) it lands in logs.
- **Recommended fix:** (a) Add a `validateProductionEnv()` boot gate that
  refuses to start without the mandatory secrets (see C-ENV-1). (b) Wrap
  all `console.error` writes in a redactor that strips `Bearer `, `sk-`,
  `key=`, and the literal values of `process.env.OPENAI_API_KEY` /
  `HEYGEN_API_KEY` / `REMOTION_LICENSE_KEY` / `DATABASE_URL`.
- **Effort:** ~4h (env gate + redactor + tests).
- **Codex-safe?** Yes.
- **Human review?** Yes — secrets handling.

### L-SEC-2 — `/api/admin/storage/status` returns the storage driver name
- **File(s):** `server/routes.ts:2536-2580` (approx — block around the
  storage-status handler)
- **Root cause:** The response exposes `storageDriver`,
  `localFallback`, and counts. Bucket ID is correctly forced to `null`.
  An attacker who has already obtained root-admin access can confirm
  whether object-storage is configured.
- **Failure scenario:** Information disclosure to an already-compromised
  admin account; not exploitable on its own.
- **Recommended fix:** None required; the data is intentional for the
  admin dashboard.
- **Effort:** 0.
- **Codex-safe?** N/A.
- **Human review?** No.

---

## 5. Media-asset access

### L-MED-1 — Admin-only stream routes don't set `Cache-Control: private`
- **File(s):** `server/routes.ts:3277-3300` (the `.srt` and `.mp4`
  stream handlers)
- **Root cause:** The stream responses don't explicitly set
  `Cache-Control: private, no-store`. If a future deployment puts a
  shared CDN in front of `/api/admin/*`, a cached preview could leak.
- **Failure scenario:** Shared cache stores an admin-only MP4; second
  unauthenticated request gets it from cache.
- **Recommended fix:** Set `Cache-Control: private, no-store` and
  `Vary: Cookie` on both stream handlers.
- **Effort:** 30 min.
- **Codex-safe?** **Yes**.
- **Human review?** No.

---

## 6. Storage path traversal

No findings.

- `server/services/render-srt-service.ts:106` defines
  `isValidRenderFilename` enforcing `/^[a-z0-9_]{1,128}\.(mp4|srt)$/` and
  explicitly rejects `/`, `\`, `..`.
- `server/services/render-srt-service.ts:112` `localPathForRenderFilename`
  re-validates and then `path.resolve(...)`-checks that the result
  starts with `LOCAL_RENDER_DIR`.
- `server/services/persistent-storage-service.ts:98`
  `stableStorageKeyForAsset` rejects traversal sequences before they
  reach `path.join`.
- Voice-segment audio handler
  (`server/routes.ts:3174` for `/api/admin/voice-jobs/:id/segments/:segmentIndex/audio`)
  parses `id` and `segmentIndex` as integers.

This area is the strongest in the audited surface. Recommend keeping the
test coverage in `tests/render-srt-route.test.ts` /
`tests/render-mp4-route.test.ts` as the golden regression.

---

## 7. Render job lifecycle

### H-LIFE-1 — No max concurrency or queue limit on render jobs
- **STATUS: FIXED (2026-05-16)** — `server/services/render-mp4-service.ts`
  now wraps every FFmpeg spawn in `acquireFfmpegSlot()` /
  `releaseFfmpegSlot()` (max 1 concurrent, queue depth ≤ 5). Overflow
  returns a structured `failureReason: "render_queue_overflow"` instead of
  spawning. Stats exposed via `renderMp4Service.getRenderQueueStats()`.
  HTTP-429 surfacing at the route is **pending** (caller still consumes
  the structured result).
- **File(s):** `server/services/avatar-video-render-service.ts`,
  `server/services/render-mp4-service.ts:200-280`
- **Root cause:** Each `POST /api/admin/video-render/jobs/:id/preview`
  spawns FFmpeg directly inside the request handler with a 45s timeout
  but no per-process pool. Two simultaneous renders on a small Replit
  deployment will saturate CPU and OOM.
- **Failure scenario:** A founder kicks off three previews back-to-back
  while a fourth is still running; the deployment falls over and the
  health check fails.
- **Recommended fix:** Introduce a small in-memory queue (max 1
  concurrent FFmpeg job, queue depth ≤ 5) and surface queue state in
  `/api/admin/video-render/jobs`. Reject new previews with HTTP 429 when
  full.
- **Effort:** ~6h.
- **Codex-safe?** **Yes** — pure server logic, well-bounded.
- **Human review?** Yes.

### M-LIFE-2 — No reaper for "stuck in rendering" jobs
- **File(s):** `server/services/avatar-video-render-service.ts`
- **Root cause:** A render job whose FFmpeg invocation crashed or whose
  Node worker was killed mid-render stays in `rendering` state until a
  human flips it.
- **Failure scenario:** After a deployment restart mid-render, the job
  is forever `rendering` and blocks any UI logic that gates on
  "no in-flight jobs".
- **Recommended fix:** On boot, scan for rows older than 10× the
  expected duration in `rendering`/`previewing` state and mark them
  `failed` with reason `boot_reaper`.
- **Effort:** ~4h.
- **Codex-safe?** Yes (boot-time read + bounded update).
- **Human review?** Yes — table mutation.

### M-LIFE-3 — Orphan files in `.local/media-assets/render/` are never GC'd
- **File(s):** `server/services/render-mp4-service.ts:14`,
  `server/services/render-srt-service.ts:24`
- **Root cause:** Every render writes a new file with a timestamped
  random filename. Nothing deletes old files; today there are 11 MP4s
  totalling ~17 MB from previous runs (per `ls .local/media-assets/render/`).
- **Failure scenario:** After weeks of dry-runs in production the
  ephemeral disk fills and writes start failing silently.
- **Recommended fix:** Add a retention sweep keyed off
  `avatar_video_render_jobs.created_at` — keep last N per job and the
  most recent 50 globally; delete the rest. Run nightly via the existing
  `aiRetentionService`.
- **Effort:** ~4h.
- **Codex-safe?** Yes.
- **Human review?** Yes — destructive (file deletion).

---

## 8. FFmpeg / Remotion reliability

### C-FF-1 — FFmpeg failures return `{ artifact: null }` with no reason
- **STATUS: PARTIALLY FIXED (2026-05-16)** — `writeMp4ForRenderJob` now
  returns `Mp4PreviewResult` with `failureReason`, `ffmpegExitCode`, and
  `ffmpegStderrTail` (last 400 B) on every failure path; the caller
  (`avatar-video-render-service.ts:1055`) writes these onto
  `baseline.mp4FailureReason` / `mp4FfmpegExitCode` / `mp4FfmpegStderrTail`
  in `previewMetadata` (the existing `jsonb` column — no schema change).
  A `console.error` is emitted for every failure with the stderr tail.
  **PENDING:** dedicated `failure_reason` / `ffmpeg_stderr_tail` columns
  + UI surfacing in `VideoRender.tsx` — both blocked on the C-DB-1 schema
  migration window.
- **File(s):** `server/services/render-mp4-service.ts:200-270`
- **Root cause:** The two-tier fallback (with-subs → without-subs →
  `return null`) catches every FFmpeg `runFfmpeg` exception and
  discards `stderr`. The caller cannot tell `subtitles filter unsupported`
  from `binary missing` from `OOM kill`. Combined with `H-ENV-2`
  (silent local-storage fallback) and the queued admin UI, a failed
  render shows as a successful job with no playable URL.
- **Failure scenario:** Production preview fails; admin clicks "Play",
  player shows error, no log entry explains why, founder cannot
  triage.
- **Recommended fix:** Persist the last 4 KB of FFmpeg `stderr` and the
  exit code on the render-job row (new `failure_reason TEXT`,
  `ffmpeg_stderr_tail TEXT`). Always include them in
  `GET /api/admin/video-render/jobs/:id`. Surface in
  `client/src/pages/admin/VideoRender.tsx`.
- **Effort:** ~1d (schema column + service plumbing + UI + tests).
- **Codex-safe?** **Yes** for the service+UI plumbing. **No** for the
  schema column — that needs the `db:push` resolution in `C-DB-1`.
- **Human review?** **Yes** — touches schema.

### H-FF-2 — FFmpeg `drawtext`/`subtitles` filter inputs not fully escape-audited
- **STATUS: FIXED (2026-05-16)** — `writeMp4ForRenderJob` now calls
  `assertIsLocalRenderPath(options.srtPath)` before composing the
  subtitles filter. Any path that resolves outside `LOCAL_RENDER_DIR` is
  rejected, a warning is logged, and the render proceeds without
  subtitles. Covered by `tests/render-mp4-guards.test.ts`.
- **File(s):** `server/services/render-mp4-service.ts:50-110`
  (`escapeFfmpegText`, `sanitizeForOverlay`, `buildSubtitlesFilter`)
- **Root cause:** `escapeFfmpegText` handles `\\ ' : % [ ] ; , \n` but
  the `subtitles=...` filter accepts an entire filename with potential
  metacharacters. `srtPath` is set from
  `localPathForRenderFilename`, which is already strictly validated, so
  the current attack surface is closed — but the escape table is
  one-off and a future caller could pass an unvalidated path.
- **Failure scenario:** A future code path that constructs `srtPath`
  from anything other than `localPathForRenderFilename` could allow
  filter injection (`,vf=...`) and execute arbitrary FFmpeg filters.
- **Recommended fix:** Add a `assertIsLocalRenderPath(srtPath)` guard
  at the top of `writeMp4ForRenderJob` and a unit test asserting that a
  crafted `../../etc/passwd`-style path throws before any spawn.
- **Effort:** ~3h.
- **Codex-safe?** **Yes**.
- **Human review?** Yes.

### M-FF-3 — Remotion server-side renderer is absent; one frontend code path may dangle
- **File(s):** `shared/render-manifest.ts` (exposes `toRemotionScenePackage`),
  no corresponding `server/services/remotion-render-service.ts`,
  `scripts/e2e/phase1b-verified-newsroom-flow.mjs:line 633`
  (records this as a documented SKIP).
- **Root cause:** The render manifest contract is "Remotion-ready" but
  the runtime renderer doesn't exist. If any UI button is wired to a
  `POST /api/admin/video-render/jobs/:id/remotion` (none today), it
  would 404.
- **Failure scenario:** Future UI work assumes the renderer exists and
  ships a broken button.
- **Recommended fix:** Either implement a thin stub service that
  returns `501 Not Implemented` with a clear reason, or add a CI test
  asserting the client never calls `*/remotion` until the service is
  present.
- **Effort:** ~3h.
- **Codex-safe?** **Yes**.
- **Human review?** No.

---

## 9. Database / schema

### C-DB-1 — `shared/newsroom-schema.ts` tables are NOT in `db:push`
- **File(s):** `shared/newsroom-schema.ts` (verified_sources,
  verified_knowledge, verified_claims, verified_timeline_events,
  verified_media_references, verification_audit_events),
  `shared/schema.ts`, `drizzle.config.ts`
- **Root cause:** The newsroom schema file is deliberately excluded
  from the central `shared/schema.ts` re-export and from
  `drizzle.config.ts`. Running `npm run db:push` in production will not
  create these tables; every database-backed code path in the verified
  newsroom will throw `relation "verified_knowledge" does not exist`.
- **Failure scenario:** Hard go-live blocker. Any non-fixture-mode use
  of `buildNewsroomDataPackage` against a real `verifiedKnowledgeId`
  will 500.
- **Recommended fix:** A human owner must (a) re-export
  `shared/newsroom-schema.ts` from `shared/schema.ts`, (b) re-include
  it in `drizzle.config.ts`, (c) run `npm run db:push` after a snapshot
  + dry-run, (d) confirm via `database` skill + `environment:"production"`
  that the tables landed cleanly.
- **Effort:** ~1d (planning, snapshot, push, smoke).
- **Codex-safe?** **No** — explicitly out of scope per the platform
  rules (no `db:push`, no destructive schema changes without human
  approval).
- **Human review?** **Yes — mandatory.**

### H-DB-2 — `varchar` primary keys with `gen_random_uuid()` default
- **File(s):** `shared/schema.ts` — `ai_jobs`, `ai_job_events`,
  `admin_staff` and ~12 other tables.
- **Root cause:** Pattern `varchar("id").primaryKey().default(sql\`gen_random_uuid()\`)`
  uses `varchar` instead of native `uuid`. Works correctly but is less
  performant at scale and inconsistent with rows that already use
  `uuid`.
- **Failure scenario:** Index bloat on large tables; minor.
- **Recommended fix:** Migrate to `uuid` columns in a future schema
  cleanup. Defer unless schema-touching work is already planned.
- **Effort:** ~1d per table batch, plus migration validation.
- **Codex-safe?** No — destructive migration.
- **Human review?** Yes.

### M-DB-3 — Missing FK indexes on hot newsroom-adjacent tables
- **File(s):** `shared/schema.ts` — `claims`, `evidence`,
  `reputation_history`, `expertise_tags` (varchar FKs without
  `index()`).
- **Root cause:** Foreign keys are declared but not indexed.
- **Failure scenario:** Sequential scans on `post_id` / `user_id`
  lookups slow as rows grow.
- **Recommended fix:** Add `index()` for each hot FK in a single
  migration.
- **Effort:** ~3h.
- **Codex-safe?** No — `db:push` blocker per C-DB-1.
- **Human review?** Yes.

### M-DB-4 — Newsroom data package has no DB row in current code path
- **File(s):** `server/services/newsroom/newsroomDataPackageBuilder.ts:354`
- **Root cause:** The builder returns a payload with `verifiedKnowledgeId`
  + `version` but no `packageId`. The Phase 1B E2E harness synthesises
  `${verifiedKnowledgeId}@v${version}` as a stand-in. A persistence
  layer is implied but not present.
- **Failure scenario:** Once render jobs reference a real package, the
  lack of a stable `packageId` and a `newsroom_data_packages` table
  means dedup, history, and re-render-by-package-id are impossible.
- **Recommended fix:** Add `newsroom_data_packages` table with
  `(verifiedKnowledgeId, version)` unique constraint and a
  surrogate `package_id` PK. Tied to C-DB-1 — same migration window.
- **Effort:** ~1d.
- **Codex-safe?** No (schema).
- **Human review?** Yes.

### L-DB-5 — `ai_jobs.payload` / `result` are untyped `jsonb`
- **File(s):** `shared/schema.ts`,
  `server/services/aiJobService.ts`
- **Root cause:** Zod is used at the service boundary so runtime safety
  is fine; just a Drizzle-typing nicety.
- **Recommended fix:** Add `$type<...>()` annotations.
- **Effort:** ~1h.
- **Codex-safe?** Yes.
- **Human review?** No.

---

## 10. Environment-variable requirements

### C-ENV-1 — No boot-time validation of mandatory secrets
- **STATUS: FIXED (2026-05-16)** — `server/config/validate-env.ts`
  implements `validateEnv(env)` checking `DATABASE_URL`, `SESSION_SECRET`,
  `OPENAI_API_KEY` (or `AI_INTEGRATIONS_OPENAI_API_KEY` alias),
  `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`. Called from the top of
  `server/index.ts`; `process.exit(1)` in production when any is missing,
  warn-only in dev. Covered by `tests/validate-env.test.ts`.
- **File(s):** `server/index.ts`
- **Root cause:** `OPENAI_API_KEY`, `DATABASE_URL`,
  `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` are read lazily by services.
  If any is missing in production the deployment boots green and only
  fails on first call.
- **Failure scenario:** Founder publishes; a quiet env-var copy mistake
  means `OPENAI_API_KEY` is empty; everything renders fine until a
  newsroom run, then 500s with a stack trace.
- **Recommended fix:** Add a `validateProductionEnv()` at the top of
  `server/index.ts` that hard-fails (process.exit(1)) when any of the
  mandatory list is empty AND `NODE_ENV === "production"`.
- **Effort:** ~2h.
- **Codex-safe?** **Yes**.
- **Human review?** Yes — touches boot.

### H-ENV-2 — Silent fallback to `.local` storage when object-storage env vars missing
- **STATUS: FIXED — boot gate (2026-05-16)** — `validateEnv` adds a
  `missing_persistent_storage` fatal in production unless one of
  `REPLIT_OBJECT_STORAGE_BUCKET_ID`, `REPLIT_SIDECAR_ENDPOINT`,
  `CLOUDFLARE_R2_TOKEN`, `AWS_S3_TOKEN` is set, or the operator opts in
  with `STORAGE_LOCAL_OK=1`. **PENDING:** hourly `platform_alerts` row
  emission while in fallback — minor, deferred.
- **File(s):** `server/services/persistent-storage-service.ts:231`,
  `server/services/replit-object-storage-adapter.ts`
- **Root cause:** When `REPLIT_OBJECT_STORAGE_BUCKET_ID` is unset,
  `uploadIfConfigured` returns `{ ok: false }` and the caller falls back
  to local disk. The admin asset metadata correctly reports
  `localFallback: true`, but there is no log line, no admin notification,
  and no scheduled poll. On Replit Deployments local disk is ephemeral.
- **Failure scenario:** Production runs in `localFallback` mode for
  days; on the next deploy/restart every MP4 + SRT vanishes.
- **Recommended fix:** Combine with C-ENV-1 boot gate to refuse start
  when `REPLIT_OBJECT_STORAGE_BUCKET_ID` is missing AND
  `NODE_ENV === "production"` AND `STORAGE_LOCAL_OK !== "1"` (escape
  hatch for non-render staging). Also emit a hourly platform_alert
  while in fallback.
- **Effort:** ~4h.
- **Codex-safe?** **Yes**.
- **Human review?** Yes.

### M-ENV-3 — Optional voice/social keys treated as no-op on absence
- **File(s):** various — `server/services/social-publisher-service.ts`,
  `server/services/podcast-voice-service.ts`
- **Root cause:** Optional providers (ElevenLabs, X, etc.) silently
  no-op when keys are missing. Today this is correct behaviour (no
  social path is wired for the newsroom). Listing for awareness.
- **Recommended fix:** When a non-wired provider key is present in
  production, log a warning at boot so the founder notices an unused
  key.
- **Effort:** ~1h.
- **Codex-safe?** Yes.
- **Human review?** No.

---

## 11. Deployment / runtime

### H-DEP-1 — Module-load `setInterval` services without SIGTERM hooks
- **STATUS: FIXED (2026-05-16)** — Added `server/services/shutdown-registry.ts`
  (named stoppers, reverse-order invocation, per-stopper timeout, never
  throws). `newsService.stopScheduler`, `newsPipelineService.stopAutoPipeline`,
  `panicButtonService.stop`, and `agentOrchestrator.stop` are registered
  in `server/index.ts` (alongside `http-server`). `bindShutdownSignals()`
  installs a single SIGTERM/SIGINT handler. Each scheduler is now
  idempotent (re-`start` is a no-op if already running). Covered by
  `tests/shutdown-registry.test.ts`.
- **File(s):** `server/services/newsService.ts`,
  `server/services/news-pipeline-service.ts`,
  `server/services/panic-button-service.ts`,
  `server/services/agent-orchestrator.ts`
- **Root cause:** Several services start `setInterval` at module load
  with no `unref()` and no `process.on('SIGTERM', clearInterval(...))`.
  On Replit Deployments this delays graceful shutdown and leaves
  in-flight DB writes that can race with the new container.
- **Failure scenario:** Rolling deploy mid-newsroom-tick; the old
  container finishes a write to `news_articles` while the new container
  starts a duplicate one; constraint conflict.
- **Recommended fix:** Wrap each service start in an exported `start(`,
  `stop()` pair; central registry called from `server/index.ts` SIGTERM
  handler.
- **Effort:** ~6h.
- **Codex-safe?** Yes.
- **Human review?** Yes.

### M-DEP-2 — `.local/media-assets/{render,voice}` writes won't persist on Replit Deployments
- **File(s):** `server/services/render-mp4-service.ts:10`,
  `server/services/render-srt-service.ts:24`,
  voice fixture path used by the E2E harness
- **Root cause:** Local FS is ephemeral on Replit Deployments. See
  H-ENV-2; once object storage is mandatory the issue dissolves.
- **Failure scenario:** As H-ENV-2.
- **Recommended fix:** Resolve via H-ENV-2.
- **Effort:** included in H-ENV-2.
- **Codex-safe?** Yes (after H-ENV-2 fix).
- **Human review?** Yes.

---

## 12. Error handling

### H-ERR-1 — `writeMp4ForRenderJob` returns `null` artifact without surfacing reason
- **STATUS: PARTIALLY FIXED (2026-05-16)** — Resolved at the service
  layer alongside C-FF-1: structured `failureReason` / `ffmpegExitCode`
  / `ffmpegStderrTail` returned and propagated onto `previewMetadata`
  (`jsonb`, no schema change). Dedicated columns + admin UI panel
  remain pending on C-DB-1.
- See **C-FF-1**. Same root cause; tracked together for fix.

### M-ERR-2 — `aiJobService.logEvent` swallows audit errors
- **File(s):** `server/services/aiJobService.ts` (`logEvent`)
- **Root cause:** Audit-write failures `console.error` and proceed.
  Job state update continues, so an audit-missing event is silently
  lost.
- **Failure scenario:** Forensic timeline of a Phase 1B render becomes
  incomplete; compliance trail has gaps.
- **Recommended fix:** Retry write 3× with exponential backoff; if all
  fail emit a `platform_alerts` row and refuse to advance job state
  (fail-closed).
- **Effort:** ~4h.
- **Codex-safe?** **Yes**.
- **Human review?** Yes.

### M-ERR-3 — Clustering and claim-extraction extractor fallbacks log nothing
- **File(s):** `server/services/newsroom/clusteringService.ts:228`,
  `server/services/newsroom/claimExtractionService.ts:338`
- **Root cause:** When an injected LLM extractor throws, the service
  falls back to the deterministic path with no log. Developers cannot
  tell whether the "smart" path is being used in production.
- **Failure scenario:** Quality regressions go unnoticed.
- **Recommended fix:** `console.warn` with the extractor name + first
  100 chars of the error message, behind a `LOG_EXTRACTOR_FAILURES=1`
  env var.
- **Effort:** ~1h.
- **Codex-safe?** Yes.
- **Human review?** No.

---

## 13. Logging / audit trail

### M-LOG-1 — Render-job mutations not written to a dedicated audit table
- **File(s):** `server/services/avatar-video-render-service.ts`
- **Root cause:** State transitions on `avatar_video_render_jobs` are
  not mirrored to `ai_job_events` or any other audit table. Today the
  job row itself holds the latest state; the *who* and *when* of the
  transition is not preserved.
- **Failure scenario:** Forensic question "who triggered preview at
  03:00?" cannot be answered.
- **Recommended fix:** Reuse `ai_job_events` (or add a
  `render_job_events` table) and emit one row per transition with
  `actor_user_id`, `from_state`, `to_state`, `reason`.
- **Effort:** ~4h.
- **Codex-safe?** No (schema).
- **Human review?** Yes.

### M-LOG-2 — Storage-fallback events not surfaced
- See **H-ENV-2**. Same root cause; once H-ENV-2 emits a
  `platform_alert` the audit gap closes.

---

## 14. Preview Studio safety

### M-PS-1 — UI shows publishing-related badges even though backend forces them false
- **File(s):** `client/src/pages/admin/VideoRender.tsx`,
  `client/src/pages/admin/NewsroomPackage.tsx`
- **Root cause:** The Preview Studio surfaces `youtubeUpload`,
  `socialPosting`, `publicPublishing` badges to reassure operators that
  they are locked false. A future copy-paste could turn a *display*
  badge into an *actionable* button.
- **Failure scenario:** A UI regression ships a "Publish" button that
  POSTs to a route that *also* gets a regression and accepts it.
  Multiple safety layers must fail together — which is the point — but
  the click target is one of those layers.
- **Recommended fix:** Replace the badges with read-only pill text
  (no clickable `<button>` element). Add a UI test asserting no element
  with `role="button"` matches `/publish|youtube|social/i` on the
  Preview Studio page.
- **Effort:** ~3h.
- **Codex-safe?** **Yes**.
- **Human review?** Yes.

---

## 15. YouTube / social / live gates

### M-SOC-1 — `social-publisher-service.ts` and `live-debate-studio-service.ts` are dormant but present
- **File(s):** `server/services/social-publisher-service.ts`,
  `server/services/youtube-publishing-service.ts`,
  `server/services/live-debate-studio-service.ts`,
  `server/services/debate-orchestrator.ts:87` (rtmp_url forced null)
- **Root cause:** No active YouTube/Twitter/TikTok/RTMP code path is
  invoked by the verified-newsroom flow today (confirmed by ripgrep on
  `youtube.googleapis`, `tweet`, `tiktok`, `rtmp` — all hits are either
  schema columns locked null, URL-intent strings, or pricing copy).
  These services exist as scaffolding for future phases.
- **Failure scenario:** A future PR that wires the newsroom to one of
  these services could silently lift the safety envelope if the
  reviewer assumes the lock is enforced everywhere.
- **Recommended fix:** Add a TypeScript-level guard: a top-level type
  assertion in `social-publisher-service.ts` that imports
  `RenderSafetyFlags` and refuses to compile if the value ever derives
  from a manifest with `publicPublishing: true`. Pair with a CI grep
  that fails the build if any handler under
  `server/services/newsroom/` imports any of the four dormant
  services.
- **Effort:** ~4h.
- **Codex-safe?** Yes (mechanical type + CI grep).
- **Human review?** Yes.

---

## Recommended go-live ordering

The fix order that unblocks production with minimum schema churn:

1. **C-ENV-1** boot-time env validation (mechanical, Codex-safe).
2. **H-ENV-2** refuse-to-boot-without-object-storage in prod (Codex-safe).
3. **C-FF-1** persist FFmpeg `stderr` + exit code on the job row
   (**human-approved schema change** — fold into the C-DB-1 migration
   window).
4. **C-DB-1** human-driven schema reconciliation + `db:push` after
   snapshot. *This is the only step that must happen on-human.*
5. **H-LIFE-1** render-job concurrency cap (Codex-safe).
6. **H-DEP-1** SIGTERM hooks on interval services (Codex-safe).
7. **H-FF-2** + **M-PS-1** belt-and-braces hardening (Codex-safe).
8. Everything M/L deferred to the next sprint.

Steps 1, 2, 5, 6, 7 can be batched into a single Codex task that
introduces no schema changes. Steps 3 and 4 require a single
**human-approved** schema migration window — fold them together to
avoid a second `db:push`.

---

## Appendix A — Audit confirmations (no findings)

- **CSRF coverage** is complete across `/api/*` write routes
  (`server/middleware/csrf.ts:50`, exempt list verified).
- **Path traversal** on render-asset stream routes is defended in depth
  (regex allowlist + `path.resolve` prefix check + integer parsing on
  segment indexes).
- **Admin-route guard regex** in
  `scripts/e2e/phase1b-verified-newsroom-flow.mjs` matches the live
  registrations in `server/routes.ts:2536, 3220, 3277, 3286`.
- **Safety envelope** is forced false on every audited layer (
  `newsroomDataPackageBuilder.ts:196-201`,
  `shared/render-manifest.ts:buildLockedSafetyFlags`,
  `newsroom-data-package-service.ts:108-114`,
  `debate-orchestrator.ts:87` rtmp_url=null).
- **No code path** in the verified-newsroom flow imports any active
  YouTube/Twitter/TikTok/RTMP client.

---

## Appendix B — Files cited

```
server/index.ts:104-110, 141
server/middleware/csrf.ts:25, 50
server/middleware/admin-auth.ts
server/routes.ts:2456, 2536, 3174, 3213-3300
server/routes/newsroom-preview-routes.ts:81, 115, 164
server/replit_integrations/audio/routes.ts:63
server/services/render-mp4-service.ts:10, 50-110, 200-280
server/services/render-srt-service.ts:24, 106, 112
server/services/persistent-storage-service.ts:98, 231
server/services/replit-object-storage-adapter.ts
server/services/avatar-video-render-service.ts
server/services/aiJobService.ts
server/services/newsroom/clusteringService.ts:228
server/services/newsroom/claimExtractionService.ts:338
server/services/newsroom/newsroomDataPackageBuilder.ts:196-201, 354
server/services/newsService.ts
server/services/news-pipeline-service.ts
server/services/panic-button-service.ts
server/services/agent-orchestrator.ts
server/services/newsroom-data-package-service.ts:108-114
server/services/social-publisher-service.ts
server/services/youtube-publishing-service.ts
server/services/live-debate-studio-service.ts
server/services/debate-orchestrator.ts:87
shared/schema.ts
shared/newsroom-schema.ts
shared/newsroom-types.ts
shared/render-manifest.ts
client/src/pages/admin/VideoRender.tsx
client/src/pages/admin/NewsroomPackage.tsx
scripts/e2e/phase1b-verified-newsroom-flow.mjs
drizzle.config.ts
```
