#!/bin/bash
set -e

npm install --no-audit --no-fund

# R10 — 3D/4D/R3F perf-budget gate (Task #755).
# Fails the post-merge hook on a non-zero exit so an R3F module size
# regression blocks the merge. See docs/runbooks/r10-safety-gates.md.
node scripts/r10-perf-budget-check.mjs
