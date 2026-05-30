# Stage 7 External AI Memory & Uncertainty Engine

Stage 7 stores externally supported, disputed, unknown, and deep-resolver candidate records. It is not a verifier of final truth.

Implemented endpoints:

- `POST /stage7/external-records`
- `GET /stage7/external-records`
- `POST /stage7/query-tank/resolve`
- `POST /stage7/stage6/submit`
- `GET /admin/stage7/alerts`

Every Stage 7 record is `candidate_only`, cannot publish truth, cannot update Stage 1, cannot update Stage 4, and requires Stage 6 for truth movement.
