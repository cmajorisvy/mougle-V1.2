# Archive Merge Report

## Source Archive

- Repository: cmajorisvy/mougle-V1.2
- Confirmed archive branch: chore/archive-clean-existing-codebase-confirmed
- Archive timestamp: 20260529-1150
- Files archived: 1213
- Files excluded: 56
- Secret-like findings: 254
- Database reset performed: False

## Reuse Matrix

- Files scanned from reuse manifest: 1213
- Matrix candidates exported: 1213
- Blocked by P0 secret risk in reuse manifest: 4
- Raw archive classifications: {'adapt_candidate': 355, 'reference_only': 785, 'archive_only': 73}
- Recomputed integration classifications: {'adapt_candidate': 63, 'reference_only': 677, 'archive_only': 469, 'blocked_secret_risk': 4}
- Target layer summary: {'stage5_micro_pyramid': 282, 'admin_governance': 344, 'cross_cutting': 119, 'reference_only': 331, 'stage6_boundary': 7, 'stage7_foundation': 55, 'archive_only': 75}

## Safety Outcome

No archived source was restored into active runtime. The scanner reads manifests only, does not upgrade archive rows into direct drop-in reuse, and blocks P0 rows from adaptation. Runtime import check passed: True with 0 violations.
