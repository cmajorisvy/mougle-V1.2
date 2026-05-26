# CODEX Go-Live Blocker Audit (Media/Newsroom Pipeline)

Date: 2026-05-15  
Mode: Audit-only (no implementation changes)

## Scope audited

- Auth and admin auth
- CSRF protections
- Media access control
- Storage and secret handling
- Rendering and media generation surfaces
- Provider configuration and upload routes
- Publishing gates (YouTube/social/live/autonomous)
- Safety controls (safe mode, founder control, escalation)

## Files inspected

- `server/index.ts`
- `server/routes.ts`
- `server/middleware/auth.ts`
- `server/middleware/csrf.ts`
- `server/middleware/rate-limiter.ts`
- `server/db.ts`
- `server/storage.ts`
- `server/services/avatar-video-render-service.ts`
- `server/services/persistent-storage-service.ts`
- `server/services/replit-object-storage-adapter.ts`
- `server/services/podcast-voice-service.ts`
- `server/services/youtube-publishing-service.ts`
- `server/services/social-distribution-approval-service.ts`
- `server/services/social-distribution-service.ts`
- `server/services/social-publisher-service.ts`
- `server/services/content-flywheel-service.ts`
- `server/services/safe-mode-service.ts`
- `server/services/founder-control-service.ts`
- `server/services/escalation-service.ts`
- `server/services/autonomous-operations-service.ts`
- `shared/schema.ts`

## Existing blockers (go-live blocking)

### Critical

1. **Secrets can leak into API logs and responses**
   - Files: `server/index.ts`, `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`
   - Root cause:
     - Global API logger records full JSON response bodies for all `/api` routes.
     - Legacy social account routes return token-bearing records (`accessToken`, `refreshToken`) from `social_accounts`.
   - Failure scenario:
     - Credential-bearing payloads can be written to server logs and exposed to operators/tools with log access.
   - Impact:
     - High-confidence credential exposure risk.

2. **Public media endpoints expose internal clip metadata and video assets**
   - Files: `server/routes.ts` (`/api/flywheel/jobs`, `/api/flywheel/clips/:id`, `/api/flywheel/clips/:id/video`)
   - Root cause:
     - Endpoints are public (no `requireAuth` / admin gate).
     - Video file is served directly from DB path value without an internal root-path guard in the route.
   - Failure scenario:
     - Unauthenticated users can enumerate clip IDs and fetch media.
   - Impact:
     - Internal media exposure and unauthorized access risk.

### High

1. **Live studio control endpoints are user-authenticated, not admin/owner-authorized**
   - Files: `server/routes.ts` (`/api/debates/:id/studio/setup`, `override-speaker`, `speech`, `tts`)
   - Root cause:
     - `requireAuth` only; no root-admin or debate-ownership authorization check.
   - Failure scenario:
     - Any authenticated user can alter live-studio state (including `youtubeStreamKey`) on eligible debates.
   - Impact:
     - Live flow tampering and operational abuse risk.

2. **Publisher profile/agreement writes are unauthenticated and userId-driven**
   - Files: `server/routes.ts` (`/api/publisher/profile`, `/api/publisher/accept-agreement`)
   - Root cause:
     - No auth middleware; `userId` accepted from request body.
   - Failure scenario:
     - A caller can update/accept publisher artifacts for another user ID.
   - Impact:
     - Publishing-governance integrity risk.

3. **Legacy social posting surface bypasses newer safety workflow**
   - Files: `server/routes.ts` (`/api/admin/social/*`), `server/storage.ts`, `shared/schema.ts`
   - Root cause:
     - Legacy posting routes exist parallel to Phase safety-gated social distribution paths.
     - Credential fields are stored plaintext in DB tables and returned by some legacy APIs.
   - Failure scenario:
     - Root-admin actions can run outside the stricter package-level gate process.
   - Impact:
     - Increased chance of unsafe or unreviewed posting operations.

## Non-blocking improvements (not immediate go-live blockers)

### Medium

1. **Admin login has only coarse global rate limiting**
   - Files: `server/routes.ts`, `server/middleware/rate-limiter.ts`
   - Note: No dedicated admin login lockout/backoff policy.

2. **State-changing review actions use tokenized GET URLs**
   - Files: `server/routes.ts` (`/api/admin/access-requests/approve/:token`, `/reject/:token`)
   - Note: Token-based model is in place; still better as POST + explicit anti-replay controls.

3. **Legacy social distribution service marks publish state without platform-level delivery verification**
   - Files: `server/services/social-distribution-service.ts`, `server/services/social-publisher-service.ts`
   - Note: Creates operational ambiguity and audit-trail trust issues.

4. **Media pipeline split (legacy flywheel vs admin-gated newsroom paths) increases control drift risk**
   - Files: `server/routes.ts`, `server/services/content-flywheel-service.ts`, `server/services/avatar-video-render-service.ts`
   - Note: Not immediately exploitable by itself, but increases long-term misconfiguration risk.

### Low

1. **Session store fallback behavior depends on runtime `DATABASE_URL` presence**
   - Files: `server/index.ts`
   - Note: Mostly deployment-hardening concern.

2. **Current Phase 1A render path is intentionally dry-run only**
   - Files: `server/services/avatar-video-render-service.ts`
   - Note: This is safe by design now; production rendering reliability/observability can be expanded later.

## Recommended fix order

1. Stop sensitive response-body logging for `/api` and add centralized redaction for token/secret fields.
2. Lock down public flywheel media endpoints (auth + authorization + safe file-path enforcement + publish-state checks).
3. Restrict live studio mutation routes to root-admin (or strict debate-owner + permission model) and gate `youtubeStreamKey`.
4. Require authenticated identity binding (`req.user.id`) for publisher profile/agreement writes.
5. Decommission or hard-gate legacy `/api/admin/social/*` token-bearing paths; standardize on safety-gated social distribution flow.
6. Add dedicated admin login hardening (attempt throttling/lockout/telemetry).

## Validation commands run

- `npm run check` — passed
- `npm run build` — passed (bundle-size warnings only)
- Static route/service audit via `rg` + file inspection commands — completed

## Constraints confirmation

- No fixes implemented in this task
- No database schema changes
- No `db:push`
- No auth bypass added
- No publishing/upload automation enabled
- No YouTube/social/live/autonomous behavior enabled by this audit task
