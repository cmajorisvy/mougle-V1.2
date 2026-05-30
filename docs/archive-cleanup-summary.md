# Archive Cleanup Summary

Archive timestamp: 20260529-1150
Archive location: `archive/legacy-codebase/20260529-1150`

- Real archive pass completed.
- Active legacy folders cleaned after checksum verification.
- Database was not connected.
- Database reset was not performed.
- Protected local folder `.agents/` could not be removed due filesystem permissions and remains for manual review.

Reuse index:
- `archive/legacy-codebase/20260529-1150/manifests/reuse-candidates.json`

Restore instructions:
- `archive/legacy-codebase/20260529-1150/restore/RESTORE.md`

## Reports 47-52 Archive Reuse Wiring

The archive is now wired as a read-only reuse source for future Micro-Pyramid and Stage 7 adapter work. Active runtime reads manifests through `app/archive_reuse.py`; it does not restore or import archived source. Generated integration artifacts live under `docs/integration/`:

- `archive-merge-report.md`
- `reuse-matrix.json`
- `reuse-matrix.csv`
- `pyramid-fit-report.md`
- `secret-review-checklist.md`
- `integration-checklist.md`

P0 secret-like rows remain blocked from reuse until private human review and rotation decisions are complete.
