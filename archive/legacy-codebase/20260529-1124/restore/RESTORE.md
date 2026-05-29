# Restore Archive

Archive location: `archive/legacy-codebase/20260529-1124`

Source commit: `b1924c745640bc907b73795ad6d4b655b6346325`

## Restore All Files

Use `restore-archive.sh` with `CONFIRM_RESTORE=true`. By default it restores into a temporary folder and does not overwrite active files.

## Restore Selected Files

Copy selected files from `archive/legacy-codebase/20260529-1124/source` into a separate review branch. Verify checksums first.

## Verify Checksums

Run:

```bash
shasum -a 256 -c archive/legacy-codebase/20260529-1124/manifests/checksums.sha256
```

## Inspect Reuse Candidates

Review `archive/legacy-codebase/20260529-1124/manifests/reuse-candidates.json` and `archive/legacy-codebase/20260529-1124/reports/reuse-candidate-report.md`.

## Avoid Restoring Secrets

Do not restore files marked with P0 secret risk or files excluded as credentials without private review.
