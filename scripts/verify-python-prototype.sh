#!/usr/bin/env bash
set -euo pipefail

candidates=()
if [[ -n "${PYTHON:-}" ]]; then
  candidates+=("${PYTHON}")
fi
candidates+=(python3.12 python3.11 python python3)

PYTHON_BIN=""
for candidate in "${candidates[@]}"; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    if "${candidate}" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 11) else 1)
PY
    then
      PYTHON_BIN="${candidate}"
      break
    fi
  fi
done

if [[ -z "${PYTHON_BIN}" ]]; then
  echo "Python 3.11+ is required for prototype validation. Set PYTHON=/path/to/python3.11 if needed." >&2
  exit 1
fi

"${PYTHON_BIN}" -m pip install -e ".[dev]" --no-build-isolation
"${PYTHON_BIN}" -m ruff check app tests
"${PYTHON_BIN}" -m pytest -q
npm run archive:verify
git diff --check
