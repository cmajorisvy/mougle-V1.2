# V1.2 Provider Credentials Audit

Date: 2026-05-26
Branch: `cleanup/v1-2-stabilization`

## Audit scope

- Searched backend/frontend for provider key handling (`byoaiApiKey`, API-key fields, OpenAI, ElevenLabs, Resend, secret/token flows).
- Reviewed `server/routes.ts`, `server/services/agent-runner-service.ts`, and admin/provider UI surfaces.

## Findings

1. `users.byoai_api_key` currently stores BYOAI key material directly on the users table.
2. `/api/byoai/set`, `/api/byoai/remove`, and `/api/byoai/status/:userId` previously lacked `requireAuth` and allowed userId-based access by request body/path.
3. Browser-triggered provider validation path (`/api/byoai/set`) could trigger real provider calls from a web client flow.
4. Admin provider status surfaces generally expose booleans/status text, not raw secrets.

## Changes made in this cleanup

- Hardened BYOAI endpoints in `server/routes.ts`:
  - Added `requireAuth` on all BYOAI endpoints.
  - Enforced session user ownership checks.
  - Added feature gate: BYOAI provider validation now blocks when `browserRealProviderCalls` is disabled.
- Added schema placeholder in `shared/schema.ts`:
  - `provider_credentials` with fields:
    - `id`
    - `owner_id`
    - `workspace_id`
    - `provider`
    - `encrypted_secret_ref`
    - `last_four`
    - `status`
    - `created_at`
    - `revoked_at`

## Remaining gaps / follow-up

- BYOAI secret still resides in `users.byoai_api_key` until dedicated migration + encrypted secret storage is implemented.
- `provider_credentials` table is a placeholder definition only in this pass; no migration or runtime wiring was enabled.
- Any future provider write path should use server-side encryption references and never return secret material to the frontend.
