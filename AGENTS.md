# Verified Truth Pyramid Codex Instructions

## Repo Layout

- `app/models.py`: typed contracts for truth records, HARD-MESH, topology, query tank, and council sockets.
- `app/claims/`: deterministic atomic claim decomposition.
- `app/retrieval/`: retrieval interface and local in-memory retriever.
- `app/graph/`: provenance-aware claim/evidence/source/time graph.
- `app/plugins/`: verification plugin interface and built-in deterministic plugins.
- `app/stage6/`: HARD-MESH feature builder, preprocessing, clustering lanes, metrics, consensus, and routing.
- `app/scoring/`: Equation of Purity, TVS, TMI, calibration, and publish gate.
- `app/storage/`: SQLite persistence and query tank.
- `app/api.py`: FastAPI endpoints.
- `app/cli.py`: `verify-truth` CLI.
- `tests/`: pytest coverage for claims, retrieval, plugins, graph, scoring, API, Stage 6, and persistence.

## Setup

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
```

## Test and Lint Commands

```bash
ruff check app tests
pytest -q
```

## CLI Smoke Command

```bash
verify-truth --query "What is the capital of France?" --answer "The capital of France is Paris." --corpus ./corpus.json --show-claims --show-graph-summary
```

Use `TRUTH_PYRAMID_DB_PATH=/tmp/truth_pyramid.db` when the repository directory is read-only or when tests need isolated SQLite state.

## Engineering Rules

- Keep TVS and TMI separate: TVS is answer-level `[0, 100]`; TMI is system-level `[0, 1]`.
- The visual pyramid is top-down, but runtime computation is bottom-up.
- Stage 6 HARD-MESH is structural verification, not a truth oracle.
- External AI platforms are weighted judges, not oracles.
- Preserve provenance: source metadata, timestamps, retrieval method, graph links, plugin outputs, and route decisions.
- Keep scores, confidence, uncertainty, Omega, TVS, and TMI bounded.
- Prefer deterministic local tests. Do not require network calls in tests.

## Do-Not Rules

- Do not fabricate evidence.
- Do not add real external AI calls to stubs.
- Do not use OpenAI, Anthropic, xAI, or other provider APIs unless explicitly configured later.
- Do not treat clustering labels, external judges, or local models as final truth.
- Do not load untrusted pickle/joblib artifacts in production code.
- Do not destructively reset or mutate production databases.

## PR Readiness Checklist

- `ruff check app tests` passes.
- `pytest -q` passes.
- CLI smoke test passes.
- `/health`, `/verify`, `/graph/{answer_id}` are covered by tests.
- Stage 6 Omega and query tank routing are covered by tests.
- README, ARCHITECTURE, HARD_MESH, and AGENTS are current.
- Existing PR remains Draft until the full validation and final audit pass.
