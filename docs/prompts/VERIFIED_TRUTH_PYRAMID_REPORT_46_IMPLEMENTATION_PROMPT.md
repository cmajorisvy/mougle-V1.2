# Verified Truth Pyramid Report 46 Implementation Prompt

## Executive Summary

Codex should extend the current Verified Truth Pyramid prototype with the focused Report 46 slice: local AI agent micro-pyramid readiness, deterministic simulation bundles, Signal Culture event prioritization, and connection wiring into the governed Council Socket Fabric.

This is not full agent autonomy. This is the safe control-plane foundation that proves user-owned agents reduce workload and emit structured signals without becoming truth authorities.

## Architecture Rules

- Agents are local workload reducers and structured signal producers.
- User Agent Micro-Pyramids compute `LocalReadiness`, not `TruthScore`.
- The only allowed local agent action classes are `proceed_local`, `ask_user`, `simulate_more`, `escalate_to_council`, `block`, and `archive`.
- The micro-pyramid must never return `publish_truth`.
- High-risk legal, financial, public-truth, or Stage 4/Stage 1-targeting requests must escalate or block.
- Escalation must go through the Council Socket Fabric and then Stage 7/6 routing.
- The Signal Culture Layer performs signal detection, prioritization, decay, thresholding, routing, and load reduction only.
- Signal Culture is not the Truth Engine, Knowledge Graph, AI brain, governance authority, or monetization engine.
- No secrets, private memory, or vault material may be passed to prompts or public payloads.

## Implementation Scope

1. Add typed models for:
   - `Agent`, `AgentPassport`, `AgentActionRequest`, `AgentSimulationRun`, `AgentMicroPyramidState`, `AgentActionDecision`.
   - `SignalEvent`, `SignalVector`, `SignalRoute`, `SignalProcessingRecord`.
2. Add deterministic agent-control logic:
   - `CanAct` hard permission gate.
   - local readiness equation.
   - simulation bundle generation.
   - six-class local action routing.
   - council socket escalation for high-risk events.
3. Add deterministic Signal Culture logic:
   - signal vector scoring.
   - route to local archive, agent wake, main engine, admin review, or query tank.
   - load reduction summary.
4. Persist agent decisions and signal processing records in SQLite.
5. Expose minimal API endpoints:
   - `POST /agents/action-request`.
   - `POST /signal/events`.
   - `GET /admin/signal-load-reduction`.
6. Add connection and wiring tests proving:
   - no `publish_truth` action class exists or is returned.
   - high-risk agent actions escalate through council socket envelopes.
   - signal events route without final truth authority.
   - load reduction formula works.
   - API endpoints are wired and persistable.

## Done When

- `ruff check app tests` passes.
- `pytest -q` passes.
- CLI smoke still passes.
- API smoke validates `/agents/action-request`, `/signal/events`, `/admin/signal-load-reduction`, `/council/socket/events`, `/verify`, and `/graph/{answer_id}`.
- Docs and AGENTS mention the micro-pyramid and Signal Culture layer boundaries.
