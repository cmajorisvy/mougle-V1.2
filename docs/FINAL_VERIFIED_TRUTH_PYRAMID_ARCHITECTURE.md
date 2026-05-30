# Final Verified Truth Pyramid Architecture

The visual pyramid remains top-down, while computation runs bottom-up from events and evidence to TVS/TMI output.

## Runtime Flow

Raw user, agent, content, external, council, newsroom, podcast, and marketplace events flow through Signal Culture, User Agent Micro-Pyramid, AI Agents Council, Council Socket Fabric, Stage 7 candidate memory, Stage 6 HARD-MESH, Stage 5 Equation of Purity, Stage 4 provenance store, Stage 3 PTEE, Stage 2 mesh-bed rollup, and Stage 1 Truth Crown.

## Non-Oracle Rule

Stage 6, Stage 7, councils, agents, signals, and collapse events are not final truth authorities. Final publish requires the evidence/verification/scoring/gate path.


## Current Validation Model

The active implementation foundation is Python/FastAPI/SQLite. Legacy React/Vite/TypeScript application code is preserved under `archive/` for future reuse review, but it is not the authoritative runtime for this prototype.

Authoritative validation is:

- `python -m pip install -e ".[dev]" --no-build-isolation`
- `ruff check app tests`
- `pytest -q`
- CLI/API smoke checks
- `npm run archive:verify`
- `git diff --check`

`npm run check` now runs the current Python prototype validation wrapper. `npm run build` is intentionally a prototype no-op that explains no active Node build is required after archive cleanup. Legacy Node checks remain available under `check:legacy-node` and `build:legacy-node` only for an intentionally restored TypeScript app.
