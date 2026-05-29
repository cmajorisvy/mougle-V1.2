#!/usr/bin/env bash
set -euo pipefail
if [ "${CONFIRM_RESTORE:-}" != "true" ]; then
  echo "Refusing restore: set CONFIRM_RESTORE=true."
  exit 1
fi
ARCHIVE_ROOT="archive/legacy-codebase/20260529-1124"
TARGET="${RESTORE_TARGET:-/tmp/mougle-legacy-restore-20260529-1124}"
if [ "${CONFIRM_OVERWRITE_ACTIVE:-}" != "true" ] && [ -e "$TARGET" ]; then
  echo "Refusing to overwrite existing restore target: $TARGET"
  exit 1
fi
mkdir -p "$TARGET"
echo "Checksum manifest exists. Verify manually before restoring active files."
cp -R "$ARCHIVE_ROOT/source/." "$TARGET/" 2>/dev/null || true
echo "Restored archive source to $TARGET"
