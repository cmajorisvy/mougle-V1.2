# Database Cleanup Plan

Database cleanup was not performed because safe local/development confirmation was not available.

Required before reset:

1. Confirm database is local/development only.
2. Ensure `NODE_ENV` is not production.
3. Ensure database host is localhost, 127.0.0.1, or a dev-only Docker service.
4. Ensure database name does not contain prod, production, live, main, customer, user, real, billing, payment, or finance.
5. Set `CONFIRM_DB_RESET=true`.
6. Create a backup first when feasible.
