# Final Wiring Map

Runtime flow is bottom-up:

`events -> Signal Culture -> Micro-Pyramid -> AI Agents Council -> Council Socket Fabric -> Stage 7 -> Stage 6 -> Stage 5 -> Stage 4 -> Stage 3 PTEE -> Stage 2 -> Stage 1`

## API Wiring

- Truth pipeline: `POST /verify`, `GET /graph/{answer_id}`, `POST /hard-mesh/analyze`, `GET /query-tank`.
- Council/PTEE: `POST /council/socket/events`, `GET /council/socket/events`, `GET /topology/evolution`.
- Micro-Pyramid/Signal: `POST /agents/action-request`, `POST /signal/events`, `GET /admin/signal-load-reduction`.
- Archive reuse: `GET /archive/micro-pyramid/candidates`, `GET /archive/runtime-imports/check`.
- Stage 7: `POST /stage7/external-records`, `GET /stage7/external-records`, `POST /stage7/query-tank/resolve`, `POST /stage7/stage6/submit`, `GET /admin/stage7/alerts`.
- Collapse: agent and admin collapse evaluate/event/state/restriction/recovery/review/restore/route endpoints.

## Boundary Wiring

- Stage 7 records are candidate-only and require Stage 6 for truth.
- Collapse truth-impact routes to Knowledge and Truth Council, then Stage 7/6 path.
- Collapse high-risk route packages target Stage 6; it does not verify truth directly.
- Signal Culture and Micro-Pyramid do not write Stage 4 or Stage 1.
