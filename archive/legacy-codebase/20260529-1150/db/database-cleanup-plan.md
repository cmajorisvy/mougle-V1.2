# Database Cleanup Plan

Database cleanup was not performed because safe local/development confirmation was not available.

Before any reset:
1. Confirm host is localhost/127.0.0.1/dev docker service.
2. Confirm NODE_ENV is not production.
3. Confirm DB name is not production-like.
4. Set CONFIRM_DB_RESET=true explicitly.
5. Create a backup first.
