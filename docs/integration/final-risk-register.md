# Final Risk Register

| Risk | Severity | Status | Mitigation |
|---|---:|---|---|
| Stage 6 bypass | P0 | Guarded | Council, Micro-Pyramid, Stage 7, and Collapse tests deny direct Stage 1/4 and route through Stage 7/6. |
| Stage 7 treated as truth | P0 | Guarded | Stage 7 models force `candidate_only`, `may_publish_truth=false`, and Stage 6 submission. |
| Collapse deletes agents | P0 | Guarded | Collapse event model sets `deletes_agent=false`; tests assert no delete side effect. |
| Emergency direct restore | P0 | Guarded | Emergency state can only move to RECOVERY, not RESTORED. |
| P0 archive candidate reused | P0 | Guarded | Archive scanner blocks P0 rows and runtime import guard verifies no direct archive imports. |
| Legacy Node scripts unavailable | P2 | Environmental | Documented: TypeScript/tsx tools are absent after archive cleanup; Python prototype validation passes. |
| Starlette TestClient deprecation warning | P3 | Non-blocking | Upstream warning from current FastAPI/Starlette stack. |
