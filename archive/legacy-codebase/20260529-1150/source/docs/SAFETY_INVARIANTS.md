# Mougle V1.2 Safety Invariants

These invariants apply to all V1.2 cleanup and follow-up development.

## Core Platform Invariants

1. GitHub is source of truth; Replit is a working copy.
2. No direct work on `main`; branch + PR flow only.
3. No force-push.
4. No production DB connections or production migrations from cleanup work.
5. No secrets in code, logs, docs, commits, or client payloads.

## Execution And Publishing Invariants

1. Production House remains preview-first and dry-run-first.
2. No hidden execution paths for real provider calls.
3. No autonomous publishing.
4. No live YouTube/social auto-distribution.
5. No payouts / creator earnings execution paths enabled by default.
6. No real 4D hardware, Unreal, Unity build, Blender, or Cinema 4D execution.

## Access And Approval Invariants

1. Risky actions require explicit admin or founder approval.
2. Admin-only surfaces remain admin-gated.
3. Auditability is preserved (action trails and safety checks).

## Data And Credential Invariants

1. Provider credentials are server-side only.
2. Browser never receives full provider secrets.
3. Provider secrets are never printed in logs.

## Cleanup Invariants

1. Prefer feature flags and route guards over destructive deletion.
2. If uncertain, move decisions to documented review queues.
3. Keep changes small and reviewable.
