#!/usr/bin/env bash
set -euo pipefail
echo "Dev DB archive is guarded and dry-run by default. It never prints full DATABASE_URL."
if [ "${CONFIRM_DB_RESET:-}" != "true" ]; then
  echo "Refusing DB archive/reset workflow: set CONFIRM_DB_RESET=true only for local/dev DB."
  exit 1
fi
echo "Before implementation, validate host/name and create backup with a local-only pg_dump target."
