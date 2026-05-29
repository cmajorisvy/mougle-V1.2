# Restore Archive

Archive location: `archive/legacy-codebase/20260529-1150`

Source commit: `4334b00874569ce9bf4d7e2ee832dd35fa83e965`

## Restore all files
Run `archive/legacy-codebase/20260529-1150/restore/restore-archive.sh` with `CONFIRM_RESTORE=true`.

## Restore selected files
Copy selected files from `archive/legacy-codebase/20260529-1150/source/` into a review branch.

## Verify checksums
`shasum -a 256 -c archive/legacy-codebase/20260529-1150/manifests/checksums.sha256`

## Avoid restoring secrets
Review `archive/legacy-codebase/20260529-1150/manifests/secret-findings.redacted.json` before restoring excluded sensitive files.
