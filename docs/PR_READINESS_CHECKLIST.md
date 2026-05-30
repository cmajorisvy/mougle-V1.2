# PR Readiness Checklist

- Branch: `feat/verified-truth-pyramid-prototype`
- Pre-final HEAD: `0019221ccd03a6fc07a40e97e4be765d398ea16c`
- PR opened: no

## Files and Modules

- New modules: `app/stage7.py`, `app/agent_collapse.py`
- Updated modules: `app/models.py`, `app/engine.py`, `app/api.py`, `app/storage/sqlite_store.py`, `app/agent_control.py`
- New tests: `tests/test_stage7_and_collapse.py`, `tests/test_final_integrated_wiring.py`
- New docs: final architecture, Stage 7, Stage 6, Council Socket, PTEE, Micro-Pyramid, Signal Culture, Archive Reuse, Collapse, wiring tests, security/no-bypass, and integration inventory docs.

## Validation Results

- [x] `python -m pip install -e ".[dev]" --no-build-isolation`: passed. Non-blocking pip cache ownership warning observed.
- [x] `ruff check app tests`: passed.
- [x] `pytest -q`: passed, 56 tests, 1 non-blocking Starlette TestClient deprecation warning.
- [x] CLI smoke: passed.
- [x] API smoke: passed for health, verify, graph, Stage 7, Collapse, and archive import guard.
- [x] `npm run archive:verify`: passed.
- [x] `git diff --check`: passed.
- [x] `npm run check`: now delegates to Python prototype validation and passes when the Python validation path passes.
- [x] `npm run build`: now intentionally reports that no active Node build is required after archive cleanup.
- [i] Legacy TypeScript checks remain available as `npm run check:legacy-node` and `npm run build:legacy-node` when the archived Node app is intentionally restored.

## Current Validation Model

- The active prototype is Python/FastAPI/SQLite.
- Archived TypeScript/Node application code is preserved under `archive/`.
- Legacy Node app validation is not authoritative unless restored intentionally.
- Python validation is authoritative for the Verified Truth Pyramid prototype.
- `archive:verify` remains required to protect archived source integrity.
- No Node build should be required unless active Node app code is reintroduced.

## Safety

- [x] No destructive database action occurred.
- [x] No secrets were printed.
- [x] No external provider calls were added.
- [x] No fabricated evidence was added.
- [x] No GitHub or archive files were deleted.
- [x] Stage 6 no-bypass boundaries are tested.
- [x] Stage 7 remains candidate-only.
- [x] Signal Culture remains routing-only.
- [x] LocalReadiness remains non-truth.
- [x] Gluon, UES, AgentRank, and reputation remain non-money boundaries.
- [x] Collapse restricts/reviews/restores and does not delete agents.
- [x] Archive runtime import guard remains active.

## Remaining TODOs

- Complete private P0 archive secret review before any archive adapter extraction.
- Keep any eventual PR draft until reviewers confirm Node-script policy.
