# Security and No-Bypass Boundaries

- No Stage 6 bypass.
- No direct Stage 4 or Stage 1 writes.
- Stage 7 is candidate-only.
- Signal Culture is routing-only.
- LocalReadiness is not TruthScore.
- Gluon is not money.
- UES is not payout/legal approval.
- AgentRank is not financial eligibility.
- Collapse restricts/reviews/restores; it does not delete.
- Archive source is not runtime source.
- No real external provider calls in the prototype.
- No fabricated evidence.


## Current Validation Model

- The active prototype is Python/FastAPI/SQLite.
- Python validation is authoritative for current no-bypass and safety checks.
- `npm run archive:verify` remains required because archived source is preserved and must stay integrity-checkable.
- Legacy Node/TypeScript validation is optional and non-authoritative unless the archived app is deliberately restored.
- No Node build should be required for current safety validation unless active Node runtime code is reintroduced.
