# Mougle V1.2 Development Workflow

## Branching

1. Start from latest `main`.
2. Create a focused branch (example: `cleanup/v1-2-stabilization`).
3. Keep commits small and reviewable.
4. Push branch and open PR to `main`.
5. Do not force-push.

## Required Validation

Run after meaningful changes:

```bash
npm run check
npm run build
```

If environment supports it:

```bash
npm run test:e2e:smoke
```

## Safety Checklist Before Push

- No secrets changed or committed (`.env`, tokens, credentials)
- No production DB operations
- No production execution/publishing toggles enabled
- No destructive schema/table drops
- No large risky refactors without phased plan docs

## Documentation Rules

- Add/update task reports under `docs/reports/`.
- If uncertain about archival, list in a review queue report.
- Keep architecture plans in `docs/architecture/`.
- Keep `docs/library/INDEX.md` updated for new cleanup docs.

## Replit + Local Collaboration

- Replit workspace is treated as a runtime/development copy.
- Local/Codex changes should be committed and pushed through GitHub PR workflow.
- Always pull latest branch state before continuing work in Replit.
