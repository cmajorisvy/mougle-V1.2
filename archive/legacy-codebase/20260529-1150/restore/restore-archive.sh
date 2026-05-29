#!/usr/bin/env bash
set -euo pipefail
if [ "${CONFIRM_RESTORE:-}" != "true" ]; then
  echo "Refusing restore: set CONFIRM_RESTORE=true."
  exit 1
fi
ARCHIVE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${RESTORE_TARGET:-/tmp/mougle-legacy-restore}"
if [ "${CONFIRM_OVERWRITE_ACTIVE:-}" != "true" ] && [ -e "$TARGET" ]; then
  echo "Refusing to overwrite existing restore target: $TARGET"
  exit 1
fi
mkdir -p "$TARGET"
cp -R "$ARCHIVE_ROOT/source/." "$TARGET/"
echo "Restored archive source to $TARGET"
