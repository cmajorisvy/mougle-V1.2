#!/usr/bin/env bash
set -euo pipefail
if [ "${CONFIRM_DB_RESET:-}" != "true" ]; then
  echo "Refusing reset: CONFIRM_DB_RESET=true is required."
  exit 1
fi
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "Refusing reset: NODE_ENV=production."
  exit 1
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Refusing reset: DATABASE_URL is not set."
  exit 1
fi
node - <<'JS'
const raw = process.env.DATABASE_URL;
let url;
try { url = new URL(raw); } catch { console.error('Refusing reset: DATABASE_URL is invalid.'); process.exit(1); }
const host = url.hostname;
const db = (url.pathname || '').replace(/^\//, '');
const safeHost = ['localhost', '127.0.0.1', 'postgres', 'db'].includes(host);
const unsafeName = /(prod|production|live|main|customer|user|real|billing|payment|finance)/i.test(db);
console.log('Masked DB target: ' + host + '/' + (db ? db[0] + '***' : '[none]'));
if (!safeHost || unsafeName) {
  console.error('Refusing reset: target is not clearly local/development safe.');
  process.exit(1);
}
console.error('Reset implementation intentionally not included in dry-run branch. Add backup + reset commands only after explicit approval.');
process.exit(1);
JS
