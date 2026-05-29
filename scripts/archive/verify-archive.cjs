#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(process.cwd(), 'archive', 'legacy-codebase');
const selected = process.argv[2] || (fs.existsSync(base) ? fs.readdirSync(base).filter((entry) => fs.statSync(path.join(base, entry)).isDirectory()).sort().at(-1) : '');
const archiveRoot = selected && selected.includes('/') ? selected : path.join(base, selected || '');
const required = [
  'manifests/file-manifest.json',
  'manifests/checksums.sha256',
  'manifests/archive-summary.json',
  'manifests/secret-findings.redacted.json',
  'manifests/reuse-candidates.json',
  'reports/dry-run-report.md',
  'reports/secret-scan-report.md',
  'reports/reuse-candidate-report.md',
  'reports/cleanup-report.md',
  'reports/database-cleanup-report.md',
  'restore/RESTORE.md',
  'restore/restore-archive.sh',
];
const missing = required.filter((file) => !fs.existsSync(path.join(archiveRoot, file)));
if (missing.length) {
  console.error('Archive verification failed. Missing: ' + missing.join(', '));
  process.exit(1);
}
console.log('Archive dry-run verification passed: ' + archiveRoot);
