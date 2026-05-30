# Final Validation Plan

Run in order:

1. `python -m pip install -e ".[dev]" --no-build-isolation`
2. `ruff check app tests`
3. `pytest -q`
4. CLI smoke with `verify-truth`
5. FastAPI TestClient smoke for `/health`, `/verify`, `/graph/{answer_id}`, Stage 7, Collapse, and archive endpoints
6. `npm run archive:verify`
7. `git diff --check`
8. Attempt `npm run check` and `npm run build`; document missing Node dependencies if they fail environmentally.

Passing criteria: Python validation, archive verification, and diff check pass; Node failures are non-blocking only when caused by missing archived/legacy Node dependency installation.
