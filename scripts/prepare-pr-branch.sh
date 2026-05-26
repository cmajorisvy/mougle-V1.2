#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Prepare a clean PR branch from origin/main.

Usage:
  scripts/prepare-pr-branch.sh <branch-name> [--push] [--hard-sync]

Options:
  --push       Push the prepared branch to origin and set upstream.
  --hard-sync  Force local main to match origin/main via reset --hard.
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

branch_name="$1"
shift || true

should_push=false
hard_sync=false

for arg in "$@"; do
  case "$arg" in
    --push)
      should_push=true
      ;;
    --hard-sync)
      hard_sync=true
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage
      exit 1
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: run this script from inside a git repository." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

origin_url="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "$origin_url" ]]; then
  echo "Error: 'origin' remote is missing." >&2
  exit 1
fi

if [[ "$origin_url" != *"github.com/cmajorisvy/mougle-V1.2"* ]]; then
  echo "Error: origin does not point to cmajorisvy/mougle-V1.2." >&2
  echo "Current origin: $origin_url" >&2
  exit 1
fi

git fetch origin main --prune
git switch main

if [[ "$hard_sync" == true ]]; then
  git reset --hard origin/main
else
  git merge --ff-only origin/main
fi

if git show-ref --verify --quiet "refs/heads/$branch_name"; then
  git switch "$branch_name"
else
  git switch -c "$branch_name"
fi

if [[ "$should_push" == true ]]; then
  git push -u origin "$branch_name"
fi

echo
echo "Branch prepared successfully."
git status --short --branch
