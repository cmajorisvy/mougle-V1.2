# Security Policy

## Reporting a Vulnerability
Report security concerns privately to the Mougle maintainers. Do not include secrets or private user data in public issues.

## Critical Issues
Treat the following as critical:
- secret or credential exposure
- private memory leakage
- Stage 6 bypass paths
- financial payout bypass
- legal automation without required review gates

## Secret Handling
- Never commit real `.env` values, keys, or private certificates.
- Rotate secrets immediately if exposure is suspected.

## Supported Branches
- `main` (active)
- `chore/archive-clean-existing-codebase-confirmed` (temporary archive-cleanup branch)
