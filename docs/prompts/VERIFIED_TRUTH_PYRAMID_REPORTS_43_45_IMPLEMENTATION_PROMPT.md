# Verified Truth Pyramid Reports 43-45 Implementation Prompt

## Executive Summary

Codex should extend the existing Verified Truth Pyramid prototype with the next focused application slice from reports 43-45: a governed seven-council socket substrate beneath Stage 7/6 and a stronger Persistent Topological Evolution Engine scaffold anchored at the Stage 4/5/6 core.

The goal is not to build seven production microservices or a heavy topology stack. The goal is to make the current prototype implementation-ready by adding typed contracts, no-bypass policy routing, durable council event decisions, versioned topology evolution records, and connection/wiring tests.

## Architecture Rules

- The seven-stage pyramid remains visually top-down.
- Runtime execution remains bottom-up: evidence -> claim verification -> Stage 7/6 boundary -> Stage 5 scoring -> Stage 4 persistence -> Stage 3/2 rollup -> Stage 1 output.
- Councils sit beneath Stage 7 as a governed substrate.
- No council may write directly to Stage 4 Knowledge of Purity and Wisdom.
- No council may influence Stage 1 Truth Crown directly.
- Council events must pass through the socket fabric and Stage 7/6 routing boundary.
- Legal and financial council events require policy/human review before consequential action.
- Stage 6 HARD-MESH remains structural verification, not a truth oracle.
- The Persistent Topological Evolution Engine is one internal stateful core, not Stage 8.
- PTEE records lightweight topology evolution now and leaves heavy persistent homology as an optional future adapter.
- No real external API calls are allowed in this prototype slice.
- No fabricated evidence is allowed.

## Implementation Scope

1. Add typed models for council IDs, council socket routes, policy decisions, council socket decisions, and topological evolution records.
2. Extend the council socket module into a governed fabric that:
   - recognizes seven council domains,
   - creates stable CloudEvents-like envelopes,
   - computes payload hashes and idempotency keys,
   - rejects direct Stage 1/Stage 4 bypass attempts,
   - routes low-risk events to Stage 6,
   - routes normal upward events through Stage 7 then Stage 6,
   - routes legal/financial/high-risk events to query-tank policy review.
3. Extend SQLite persistence with:
   - `council_socket_events`,
   - `topology_evolution_records`.
4. Expose API endpoints:
   - `POST /council/socket/events`,
   - `GET /council/socket/events`,
   - `GET /topology/evolution`.
5. Extend topology helpers so every verification can emit a lightweight PTEE evolution record.
6. Update config with council socket and PTEE defaults.
7. Update docs to explain the socket substrate and PTEE core.
8. Add connection/wiring tests that prove:
   - a legal/financial event does not bypass Stage 6,
   - direct Stage 4/Stage 1 targeting is denied,
   - accepted council events are persisted,
   - topology evolution records are created after verification,
   - existing verify/graph/query-tank wiring still works.

## Done When

- `ruff check app tests` passes.
- `pytest -q` passes.
- CLI smoke test passes.
- API wiring tests pass for `/verify`, `/graph/{answer_id}`, `/query-tank`, `/council/socket/events`, and `/topology/evolution`.
- Documentation and AGENTS instructions mention the governed council fabric and PTEE evolution scaffold.
- No PR is opened or marked ready unless full validation passes.
