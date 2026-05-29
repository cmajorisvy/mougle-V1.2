# Security Policy

## Reporting Vulnerabilities

Report vulnerabilities privately to the repository owner or designated Mougle security contact. Do not include secrets, private memory, database URLs, service-role keys, raw logs with credentials, or user private data in public issues.

## Supported Branches

- `main`: supported
- Other branches: TBD by PR/release owner

## Critical Vulnerabilities

- secret exposure
- private memory leakage
- Stage 6 bypass
- direct writes to verified knowledge or Truth Crown
- financial payout bypass
- legal automation without review
- unsafe agent tool invocation
- public publishing without verification

## Secret Rotation Rule

If a live credential is committed, assume it is compromised. Rotate it, revoke the old credential, and move usage to environment variables or secret manager storage.
