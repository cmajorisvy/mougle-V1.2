#!/usr/bin/env node
/*
 * Mougle V1.2 archive cleanup dry-run generator.
 * This script does not move, delete, or reset anything unless a future task
 * explicitly implements the confirmed archive path.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const root = process.cwd();
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const archiveTimestamp = process.env.ARCHIVE_TIMESTAMP || `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const archiveRoot = path.join('archive', 'legacy-codebase', archiveTimestamp);
const sourceRoot = path.join(archiveRoot, 'source');
const manifestsDir = path.join(archiveRoot, 'manifests');
const reportsDir = path.join(archiveRoot, 'reports');
const dbDir = path.join(archiveRoot, 'db');
const restoreDir = path.join(archiveRoot, 'restore');
const confirmArchive = process.env.CONFIRM_ARCHIVE_CLEAN === 'true';
const confirmDbReset = process.env.CONFIRM_DB_RESET === 'true';

function sh(command) {
  try {
    return execSync(command, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function ensure(dir) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
}

function write(file, text) {
  fs.writeFileSync(path.join(root, file), `${String(text).trim()}\n`);
}

function writeJson(file, value) {
  write(file, JSON.stringify(value, null, 2));
}

function posix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function rel(fullPath) {
  return posix(path.relative(root, fullPath));
}

function readText(fullPath) {
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return '';
  }
}

function sha256(fullPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
}

const excludedDirs = new Set([
  '.git', 'archive', 'node_modules', 'dist', 'build', '.next', 'coverage', '.cache',
  'tmp', 'logs', 'uploads', 'test-results', 'output', '.local'
]);
const excludedExts = new Set(['.map', '.sqlite', '.sqlite3', '.db', '.dump', '.bak', '.log', '.pem', '.key', '.p12', '.pfx']);
const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.mp4', '.mov', '.mp3', '.wav', '.glb', '.gltf', '.pdf', '.zip', '.tgz', '.gz']);
const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '.md', '.yml', '.yaml', '.sql', '.css', '.scss', '.html', '.sh', '.toml', '.lock', '.txt', '']);
const secretFileRules = [/^\.env($|\.)/, /(^|\/)id_rsa$/, /(^|\/)id_ed25519$/, /private[_-]?key/i, /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i];
const secretLineRules = [
  ['OPENAI_API_KEY', /OPENAI_API_KEY\s*=\s*(.+)/i],
  ['ANTHROPIC_API_KEY', /ANTHROPIC_API_KEY\s*=\s*(.+)/i],
  ['XAI_API_KEY', /XAI_API_KEY\s*=\s*(.+)/i],
  ['DATABASE_URL', /DATABASE_URL\s*=\s*(.+)/i],
  ['JWT_SECRET', /JWT_SECRET\s*=\s*(.+)/i],
  ['AUTH_SECRET', /AUTH_SECRET\s*=\s*(.+)/i],
  ['STRIPE_SECRET', /STRIPE_SECRET[^=]*=\s*(.+)/i],
  ['STRIPE_WEBHOOK_SECRET', /STRIPE_WEBHOOK_SECRET\s*=\s*(.+)/i],
  ['SUPABASE_SERVICE_ROLE', /SUPABASE_SERVICE_ROLE[^=]*=\s*(.+)/i],
  ['AWS_SECRET', /AWS_SECRET[^=]*=\s*(.+)/i],
  ['GITHUB_TOKEN', /GITHUB_TOKEN\s*=\s*(.+)/i],
  ['GOOGLE_CLIENT_SECRET', /GOOGLE_CLIENT_SECRET\s*=\s*(.+)/i],
  ['SMTP_PASS', /SMTP_PASS\s*=\s*(.+)/i],
  ['private_key', /private[_-]?key\s*[:=]\s*(.+)/i],
  ['BEGIN_RSA_PRIVATE_KEY', /BEGIN RSA PRIVATE KEY/i],
  ['BEGIN_OPENSSH_PRIVATE_KEY', /BEGIN OPENSSH PRIVATE KEY/i],
  ['generic_secret', /\b(token|secret|password|api[_-]?key)\b\s*[:=]\s*['"]?([^'"\s]+)/i],
];

function mask(value) {
  const normalized = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  if (!normalized) return '[EMPTY]';
  if (/^(<|your-|replace|example|placeholder|not-set|undefined|changeme|dev-only)/i.test(normalized)) return '[PLACEHOLDER]';
  if (normalized.length <= 8) return '[REDACTED]';
  return `${normalized.slice(0, 2)}...[REDACTED]...${normalized.slice(-2)}`;
}

function looksRealSecret(value) {
  const normalized = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  if (normalized.length < 12) return false;
  return !/^(<|your-|replace|example|placeholder|not-set|undefined|changeme|dev-only|sk-your|re_)/i.test(normalized);
}

function fileType(file) {
  if (/(^|\/)package(-lock)?\.json$/.test(file) || /(^|\/)(pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(file)) return 'package-manifest';
  if (file.startsWith('client/')) return 'frontend-source';
  if (file.startsWith('server/')) return 'backend-source';
  if (file.startsWith('shared/')) return 'shared-source';
  if (file.startsWith('tests/')) return 'test-source';
  if (file.startsWith('docs/')) return 'documentation';
  if (file.startsWith('migrations/')) return 'migration';
  if (file.startsWith('scripts/')) return 'script';
  if (file.startsWith('.github/')) return 'ci-workflow';
  if (file.startsWith('public/')) return 'public-asset';
  const ext = path.extname(file).toLowerCase();
  return ext ? ext.slice(1) : 'unknown';
}

function categoryFor(file, text = '') {
  const value = `${file}\n${text.slice(0, 2000)}`.toLowerCase();
  if (value.includes('marketplace')) return 'marketplace';
  if (value.includes('newsroom') || value.includes('podcast') || value.includes('broadcast')) return 'newsroom-media';
  if (value.includes('agent')) return 'agent-related';
  if (value.includes('admin')) return 'admin-dashboard';
  if (value.includes('schema') || file.startsWith('migrations/') || value.includes('drizzle')) return 'database';
  if (value.includes('truth') || value.includes('knowledge') || value.includes('verification')) return 'truth-knowledge';
  if (value.includes('billing') || value.includes('payment') || value.includes('payout') || value.includes('stripe')) return 'finance';
  if (value.includes('auth') || value.includes('session')) return 'auth';
  if (file.startsWith('client/')) return 'frontend';
  if (file.startsWith('server/')) return 'backend';
  if (file.startsWith('shared/')) return 'shared';
  return fileType(file);
}

function importsOf(text) {
  return [...text.matchAll(/import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g)]
    .map((match) => match[1] || match[2])
    .slice(0, 25);
}

function exportsOf(text) {
  return [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/g)]
    .map((match) => match[1])
    .slice(0, 25);
}

function scanSecrets(file, text) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [secretType, rule] of secretLineRules) {
      const match = line.match(rule);
      if (!match) continue;
      const value = match[1] || match[2] || match[0];
      const isReal = looksRealSecret(value);
      findings.push({
        filePath: file,
        lineNumber: index + 1,
        secretType,
        redactedPreview: mask(value),
        riskLevel: isReal ? 'P0' : 'P2',
        recommendedAction: isReal ? 'Review privately and rotate if live.' : 'Keep as placeholder/example only.',
        rotationMayBeNeeded: isReal,
        archiveDisposition: isReal ? 'skipped_or_human_review_required' : 'safe_placeholder_or_source_scan_match',
      });
    }
  });
  return findings;
}

function scoreReuse(file, text, secretRisk) {
  const pathNameMatch = /(agent|signal|truth|knowledge|admin|route|service|schema|policy|audit|vault|newsroom|marketplace)/i.test(file) ? 0.8 : 0.35;
  const exportedSymbolMatch = exportsOf(text).length ? 0.75 : 0.25;
  const dependencyMatch = importsOf(text).length ? 0.65 : 0.35;
  const domainKeywordMatch = /(agent|signal|truth|knowledge|council|stage|verification|audit|policy|vault|admin|newsroom|marketplace)/i.test(text) ? 0.8 : 0.25;
  const testPresence = file.startsWith('tests/') || /\.test\./.test(file) ? 0.85 : 0.35;
  const codeQuality = /(TODO|@ts-ignore|console\.log|\bany\b)/.test(text) ? 0.45 : 0.7;
  const securityRisk = secretRisk === 'P0' ? 1 : secretRisk === 'P1' ? 0.6 : 0.15;
  const architectureConflict = /(truth_scores?|verified_knowledge|gluon.{0,50}(payout|money|wallet)|reputation.{0,50}payout|local_readiness.{0,50}truth_score)/is.test(text) ? 0.8 : 0.15;
  return Math.max(0, Math.min(1, Number((0.25 * pathNameMatch + 0.20 * exportedSymbolMatch + 0.15 * dependencyMatch + 0.15 * domainKeywordMatch + 0.10 * testPresence + 0.10 * codeQuality - 0.15 * securityRisk - 0.10 * architectureConflict).toFixed(3))));
}

function classify(score) {
  if (score >= 0.80) return 'reuse_candidate';
  if (score >= 0.55) return 'adapt_candidate';
  if (score >= 0.30) return 'reference_only';
  return 'archive_only';
}

function excludeReason(file, stat) {
  const parts = file.split('/');
  if (parts.some((part) => excludedDirs.has(part))) return 'excluded generated/dependency/archive folder';
  if (secretFileRules.some((rule) => rule.test(file))) return 'excluded possible private credential file';
  const ext = path.extname(file).toLowerCase();
  if (excludedExts.has(ext)) return 'excluded generated/private/binary extension';
  if (binaryExts.has(ext) && stat.size > 5 * 1024 * 1024) return 'excluded large media/binary cache candidate';
  if (!sourceExts.has(ext) && !binaryExts.has(ext)) return 'excluded unknown non-source file type';
  return null;
}

function walk(dir, rows = []) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const relative = rel(full);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      rows.push({ path: relative, stat, excludedReason: 'excluded symbolic link' });
      continue;
    }
    if (stat.isDirectory()) {
      if (excludedDirs.has(entry) || relative.split('/').some((part) => excludedDirs.has(part))) {
        rows.push({ path: `${relative}/`, stat, excludedReason: 'excluded generated/dependency/archive folder' });
        continue;
      }
      walk(full, rows);
      continue;
    }
    if (stat.isFile()) rows.push({ path: relative, stat, excludedReason: excludeReason(relative, stat) });
  }
  return rows;
}

function dbCleanupFeasibility() {
  if (!process.env.DATABASE_URL) {
    return {
      databaseUrlPresent: false,
      databaseConnected: false,
      feasible: false,
      reason: 'DATABASE_URL not present in environment; no database cleanup can be safely performed.',
    };
  }
  let parsed;
  try {
    parsed = new URL(process.env.DATABASE_URL);
  } catch {
    return {
      databaseUrlPresent: true,
      databaseConnected: false,
      feasible: false,
      reason: 'DATABASE_URL exists but is invalid. It was not printed or used.',
    };
  }
  const host = parsed.hostname;
  const dbName = parsed.pathname.replace(/^\//, '');
  const safeHost = ['localhost', '127.0.0.1', 'postgres', 'db'].includes(host);
  const unsafeDbName = /(prod|production|live|main|customer|user|real|billing|payment|finance)/i.test(dbName);
  const feasible = safeHost && !unsafeDbName && process.env.NODE_ENV !== 'production' && confirmDbReset;
  return {
    databaseUrlPresent: true,
    databaseConnected: false,
    feasible,
    maskedTarget: `${host}/${dbName ? `${dbName.slice(0, 1)}***` : '[empty]'}`,
    reason: feasible
      ? 'Local/development target appears eligible, but dry-run mode still did not connect or reset.'
      : 'DATABASE_URL exists but cleanup was refused without local/dev safety confirmation and CONFIRM_DB_RESET=true.',
  };
}

function markdownList(items) {
  return items.length ? items.join('\n') : '- None';
}

for (const dir of [sourceRoot, manifestsDir, reportsDir, dbDir, restoreDir, 'tools/legacy-reuse-scanner', 'scripts/archive', 'scripts/db']) ensure(dir);

const branch = sh('git branch --show-current') || 'unknown';
const sourceCommit = sh('git rev-parse HEAD') || 'unknown';
const remote = sh('git remote get-url origin') || 'unknown';
const workingTreeStatus = sh('git status --short');
const allFiles = walk(root);
const manifest = [];
const excluded = [];
const wouldArchive = [];
const checksums = [];
const secretFindings = [];
const reuseCandidates = [];

for (const row of allFiles) {
  if (row.path.endsWith('/')) {
    excluded.push({ originalPath: row.path, excludedReason: row.excludedReason });
    continue;
  }
  const full = path.join(root, row.path);
  const ext = path.extname(row.path).toLowerCase();
  const binary = binaryExts.has(ext);
  const text = binary ? '' : readText(full);
  const fileFindings = text ? scanSecrets(row.path, text) : [];
  secretFindings.push(...fileFindings);
  const secretRisk = fileFindings.some((finding) => finding.riskLevel === 'P0') ? 'P0' : fileFindings.length ? 'P2' : 'none';
  const realSecretExcluded = secretRisk === 'P0' && /^\.env($|\.)/.test(row.path);
  const excludedReason = row.excludedReason || (realSecretExcluded ? 'excluded real-secret risk file' : null);
  const score = text ? scoreReuse(row.path, text, secretRisk) : 0.35;
  const classification = classify(score);
  const archivedPath = path.posix.join(sourceRoot, row.path);
  const hash = excludedReason ? null : sha256(full);
  const record = {
    originalPath: row.path,
    archivedPath,
    fileSizeBytes: row.stat.size,
    sha256: hash,
    fileType: fileType(row.path),
    category: categoryFor(row.path, text),
    archivedAt: confirmArchive ? now.toISOString() : null,
    excludedReason,
    secretRisk,
    reuseCandidateScore: score,
    recommendedFutureAction: excludedReason
      ? 'review exclusion before archive'
      : classification === 'reuse_candidate'
        ? 'reuse directly after architecture review'
        : classification === 'adapt_candidate'
          ? 'adapt through wrapper or focused refactor'
          : classification === 'reference_only'
            ? 'use as reference only'
            : 'archive only',
  };
  manifest.push(record);
  if (excludedReason) {
    excluded.push(record);
    continue;
  }
  wouldArchive.push(record);
  checksums.push(`${hash}  ${archivedPath}`);
  reuseCandidates.push({
    originalPath: row.path,
    archivedPath,
    compatibilityScore: score,
    classification,
    reasonForMatch: `${categoryFor(row.path, text)} / ${fileType(row.path)} / exports:${exportsOf(text).length}`,
    dependencies: importsOf(text),
    securityConcerns: secretRisk === 'none' ? [] : [`secret scan risk: ${secretRisk}`],
    architectureConcerns: /(truth_scores?|verified_knowledge|gluon|payout|wallet|local_readiness)/i.test(text) ? ['review V1.2 boundary alignment before reuse'] : [],
    requiredAdaptation: classification === 'reuse_candidate'
      ? 'minimal tests and adapter check'
      : classification === 'adapt_candidate'
        ? 'wrapper or interface adaptation required'
        : classification === 'reference_only'
          ? 'rewrite implementation using concept only'
          : 'do not reuse without human review',
    recommendedAction: record.recommendedFutureAction,
  });
}

reuseCandidates.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
const database = dbCleanupFeasibility();
const dbFiles = manifest.filter((item) => item.category === 'database' || /(^|\/)(migrations|drizzle|schema|seed|db)(\/|\.|$)/i.test(item.originalPath));
const schemaFiles = dbFiles.filter((item) => /schema|drizzle|db\.|database/i.test(item.originalPath));
const migrationFiles = dbFiles.filter((item) => /migration|migrations/i.test(item.originalPath));
const seedFiles = dbFiles.filter((item) => /seed/i.test(item.originalPath));
const warnings = [
  ...(remote === 'https://github.com/cmajorisvy/mougle-V1.2.git' ? [] : [`Remote mismatch: ${remote}`]),
  ...(branch === 'chore/archive-clean-existing-codebase' ? [] : [`Branch mismatch: ${branch}`]),
  ...(fs.existsSync(path.join(root, 'artifacts/mougle-v1.2')) ? [] : ['Verification artifacts are missing on this branch/base.']),
  ...(fs.existsSync(path.join(root, 'docs/policy/stage6-no-bypass-policy.md')) ? [] : ['Stage 6 no-bypass policy doc is missing on this branch/base.']),
];

const summary = {
  repository: 'cmajorisvy/mougle-V1.2',
  branch,
  archiveTimestamp,
  archivePath: archiveRoot,
  sourceCommit,
  filesArchived: confirmArchive ? wouldArchive.length : 0,
  filesWouldArchive: wouldArchive.length,
  filesExcluded: excluded.length,
  secretFindings: secretFindings.length,
  databaseBackupCreated: false,
  databaseResetPerformed: false,
  dryRun: !confirmArchive,
  restoreInstructions: path.posix.join(restoreDir, 'RESTORE.md'),
  warnings,
};

writeJson(path.join(manifestsDir, 'file-manifest.json'), manifest);
write(path.join(manifestsDir, 'checksums.sha256'), checksums.join('\n'));
writeJson(path.join(manifestsDir, 'archive-summary.json'), summary);
writeJson(path.join(manifestsDir, 'secret-findings.redacted.json'), secretFindings);
writeJson(path.join(manifestsDir, 'reuse-candidates.json'), reuseCandidates);

const archiveSample = wouldArchive.slice(0, 200).map((item) => `- \`${item.originalPath}\` -> \`${item.archivedPath}\``);
const excludedSample = excluded.slice(0, 200).map((item) => `- \`${item.originalPath}\`: ${item.excludedReason}`);
const secretRows = secretFindings.slice(0, 100).map((finding) => `| ${finding.riskLevel} | \`${finding.filePath}:${finding.lineNumber}\` | ${finding.secretType} | ${finding.redactedPreview} | ${finding.archiveDisposition} |`);
const topReuse = reuseCandidates.slice(0, 40).map((item) => `| ${item.compatibilityScore} | ${item.classification} | \`${item.originalPath}\` | ${item.recommendedAction} |`);
const categoryRows = Object.entries(manifest.reduce((acc, item) => {
  acc[item.category] = (acc[item.category] || 0) + 1;
  return acc;
}, {})).sort().map(([category, count]) => `| ${category} | ${count} |`);

write(path.join(reportsDir, 'dry-run-report.md'), `# Archive Cleanup Dry Run Report

Generated: ${now.toISOString()}

## Repository

- Repository: \`cmajorisvy/mougle-V1.2\`
- Remote: \`${remote}\`
- Branch: \`${branch}\`
- Source commit: \`${sourceCommit}\`
- Working tree before dry-run artifact generation:

\`\`\`text
${workingTreeStatus || 'clean'}
\`\`\`

## Confirmation Flags

- \`CONFIRM_ARCHIVE_CLEAN\`: \`${process.env.CONFIRM_ARCHIVE_CLEAN || ''}\`
- \`CONFIRM_DB_RESET\`: \`${process.env.CONFIRM_DB_RESET || ''}\`

This is dry-run mode. No files were moved, deleted, or cleaned.

## Expected Archive Path

\`${archiveRoot}\`

## Counts

- Files that would be archived: ${wouldArchive.length}
- Files excluded: ${excluded.length}
- Secret-like findings: ${secretFindings.length}

## Sample Files That Would Be Archived

${markdownList(archiveSample)}

## Sample Exclusions

${markdownList(excludedSample)}

## Folders That Would Be Cleaned After Real Archive

- \`client/\`
- \`server/\`
- \`shared/\`
- \`apps/\`
- \`services/\`
- \`packages/\`
- \`tests/\`
- \`public/\`
- \`infra/\`
- old scripts not needed for archive/reuse/db cleanup
- old docs not needed for archive/cleanup summary

## Database Cleanup Feasibility

${database.reason}

Database connected: false

## Risks

${markdownList(warnings.map((warning) => `- ${warning}`))}

## Confirmation Required

Set \`CONFIRM_ARCHIVE_CLEAN=true\` for real archive/cleanup.
Set \`CONFIRM_DB_RESET=true\` only after confirming a local/development database target.`);

write(path.join(reportsDir, 'secret-scan-report.md'), `# Secret Scan Report

Generated: ${now.toISOString()}

No secret values are printed in this report.

- Findings: ${secretFindings.length}
- P0 findings requiring private review/rotation decision: ${secretFindings.filter((finding) => finding.riskLevel === 'P0').length}

| Risk | Location | Type | Redacted Preview | Disposition |
| --- | --- | --- | --- | --- |
${secretRows.length ? secretRows.join('\n') : '| none | none | none | none | none |'}

Real .env files, private keys, and production database dumps must not be committed. If any P0 finding is a live committed value, rotate it manually.`);

write(path.join(reportsDir, 'archive-report.md'), `# Archive Report

Generated: ${now.toISOString()}

Status: DRY RUN ONLY

No files were moved. No cleanup was performed.

- Files that would be archived: ${wouldArchive.length}
- Files excluded: ${excluded.length}
- Checksums were generated from current source paths for future archive verification.
- Real archive requires \`CONFIRM_ARCHIVE_CLEAN=true\`.`);

write(path.join(reportsDir, 'legacy-inventory.md'), `# Legacy Inventory

Generated: ${now.toISOString()}

| Category | Count |
| --- | ---: |
${categoryRows.join('\n')}

Total manifest entries: ${manifest.length}`);

write(path.join(reportsDir, 'reuse-candidate-report.md'), `# Reuse Candidate Report

Generated: ${now.toISOString()}

Compatibility scoring follows the requested formula. No legacy code was copied into active folders.

| Score | Classification | File | Recommended Action |
| ---: | --- | --- | --- |
${topReuse.length ? topReuse.join('\n') : '| 0 | none | none | none |'}

## Summary

- reuse_candidate: ${reuseCandidates.filter((item) => item.classification === 'reuse_candidate').length}
- adapt_candidate: ${reuseCandidates.filter((item) => item.classification === 'adapt_candidate').length}
- reference_only: ${reuseCandidates.filter((item) => item.classification === 'reference_only').length}
- archive_only: ${reuseCandidates.filter((item) => item.classification === 'archive_only').length}`);

write(path.join(reportsDir, 'cleanup-report.md'), `# Cleanup Report

Generated: ${now.toISOString()}

Status: DRY RUN ONLY

Active folders were not cleaned because \`CONFIRM_ARCHIVE_CLEAN\` is not \`true\`.

If confirmed later, cleanup must happen only after archive coverage, checksum verification, restore instructions, and secret-risk review.`);

write(path.join(reportsDir, 'database-cleanup-report.md'), `# Database Cleanup Report

Generated: ${now.toISOString()}

Status: NOT PERFORMED

- Database connected: false
- Backup created: false
- Reset performed: false
- DATABASE_URL present: ${database.databaseUrlPresent}
- Masked target: ${database.maskedTarget || 'not available'}
- Reason: ${database.reason}

No database URL was printed. No migration, reset, truncate, drop, or mutation command was run.`);

write(path.join(dbDir, 'schema-inventory.md'), `# Schema Inventory

${schemaFiles.length ? schemaFiles.map((item) => `- \`${item.originalPath}\``).join('\n') : 'No schema files detected.'}`);
write(path.join(dbDir, 'migration-inventory.md'), `# Migration Inventory

${migrationFiles.length ? migrationFiles.map((item) => `- \`${item.originalPath}\``).join('\n') : 'No migration files detected.'}`);
write(path.join(dbDir, 'seed-inventory.md'), `# Seed Inventory

${seedFiles.length ? seedFiles.map((item) => `- \`${item.originalPath}\``).join('\n') : 'No seed files detected.'}`);
write(path.join(dbDir, 'database-cleanup-plan.md'), `# Database Cleanup Plan

Database cleanup was not performed because safe local/development confirmation was not available.

Required before reset:

1. Confirm database is local/development only.
2. Ensure \`NODE_ENV\` is not production.
3. Ensure database host is localhost, 127.0.0.1, or a dev-only Docker service.
4. Ensure database name does not contain prod, production, live, main, customer, user, real, billing, payment, or finance.
5. Set \`CONFIRM_DB_RESET=true\`.
6. Create a backup first when feasible.`);

write(path.join(restoreDir, 'RESTORE.md'), `# Restore Archive

Archive location: \`${archiveRoot}\`

Source commit: \`${sourceCommit}\`

## Restore All Files

Use \`restore-archive.sh\` with \`CONFIRM_RESTORE=true\`. By default it restores into a temporary folder and does not overwrite active files.

## Restore Selected Files

Copy selected files from \`${sourceRoot}\` into a separate review branch. Verify checksums first.

## Verify Checksums

Run:

\`\`\`bash
shasum -a 256 -c ${path.posix.join(manifestsDir, 'checksums.sha256')}
\`\`\`

## Inspect Reuse Candidates

Review \`${path.posix.join(manifestsDir, 'reuse-candidates.json')}\` and \`${path.posix.join(reportsDir, 'reuse-candidate-report.md')}\`.

## Avoid Restoring Secrets

Do not restore files marked with P0 secret risk or files excluded as credentials without private review.`);

write(path.join(restoreDir, 'restore-archive.sh'), [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  'if [ "${CONFIRM_RESTORE:-}" != "true" ]; then',
  '  echo "Refusing restore: set CONFIRM_RESTORE=true."',
  '  exit 1',
  'fi',
  `ARCHIVE_ROOT="${archiveRoot}"`,
  `TARGET="\${RESTORE_TARGET:-/tmp/mougle-legacy-restore-${archiveTimestamp}}"`,
  'if [ "${CONFIRM_OVERWRITE_ACTIVE:-}" != "true" ] && [ -e "$TARGET" ]; then',
  '  echo "Refusing to overwrite existing restore target: $TARGET"',
  '  exit 1',
  'fi',
  'mkdir -p "$TARGET"',
  'echo "Checksum manifest exists. Verify manually before restoring active files."',
  'cp -R "$ARCHIVE_ROOT/source/." "$TARGET/" 2>/dev/null || true',
  'echo "Restored archive source to $TARGET"',
].join('\n'));
fs.chmodSync(path.join(root, restoreDir, 'restore-archive.sh'), 0o755);

write('tools/legacy-reuse-scanner/README.md', `# Legacy Reuse Scanner

This scanner reads generated archive reuse indexes and filters candidates by keyword.

Current dry-run index:

\`${path.posix.join(manifestsDir, 'reuse-candidates.json')}\`

No archived code is automatically restored. Future implementation branches should copy selected files into adapters only after architecture review.`);
write('tools/legacy-reuse-scanner/scan-archive.cjs', [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  `const manifest = process.argv[2] || '${path.posix.join(manifestsDir, 'reuse-candidates.json')}';`,
  "const query = (process.argv[3] || '').toLowerCase();",
  "const rows = JSON.parse(fs.readFileSync(manifest, 'utf8'));",
  "const filtered = query ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query)) : rows;",
  "console.log(JSON.stringify(filtered.slice(0, 100), null, 2));",
].join('\n'));
fs.chmodSync(path.join(root, 'tools/legacy-reuse-scanner/scan-archive.cjs'), 0o755);

write('scripts/archive/verify-archive.cjs', [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const base = path.join(process.cwd(), 'archive', 'legacy-codebase');",
  "const selected = process.argv[2] || (fs.existsSync(base) ? fs.readdirSync(base).filter((entry) => fs.statSync(path.join(base, entry)).isDirectory()).sort().at(-1) : '');",
  "const archiveRoot = selected && selected.includes('/') ? selected : path.join(base, selected || '');",
  "const required = [",
  "  'manifests/file-manifest.json',",
  "  'manifests/checksums.sha256',",
  "  'manifests/archive-summary.json',",
  "  'manifests/secret-findings.redacted.json',",
  "  'manifests/reuse-candidates.json',",
  "  'reports/dry-run-report.md',",
  "  'reports/secret-scan-report.md',",
  "  'reports/reuse-candidate-report.md',",
  "  'reports/cleanup-report.md',",
  "  'reports/database-cleanup-report.md',",
  "  'restore/RESTORE.md',",
  "  'restore/restore-archive.sh',",
  "];",
  "const missing = required.filter((file) => !fs.existsSync(path.join(archiveRoot, file)));",
  "if (missing.length) {",
  "  console.error('Archive verification failed. Missing: ' + missing.join(', '));",
  "  process.exit(1);",
  "}",
  "console.log('Archive dry-run verification passed: ' + archiveRoot);",
].join('\n'));
fs.chmodSync(path.join(root, 'scripts/archive/verify-archive.cjs'), 0o755);

write('scripts/db/archive-dev-db.sh', [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  'echo "Dev DB archive is guarded and dry-run by default. It never prints full DATABASE_URL."',
  'if [ "${CONFIRM_DB_RESET:-}" != "true" ]; then',
  '  echo "Refusing DB archive/reset workflow: set CONFIRM_DB_RESET=true only for local/dev DB."',
  '  exit 1',
  'fi',
  'echo "Before implementation, validate host/name and create backup with a local-only pg_dump target."',
].join('\n'));

write('scripts/db/reset-dev-db.sh', [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  'if [ "${CONFIRM_DB_RESET:-}" != "true" ]; then',
  '  echo "Refusing reset: CONFIRM_DB_RESET=true is required."',
  '  exit 1',
  'fi',
  'if [ "${NODE_ENV:-}" = "production" ]; then',
  '  echo "Refusing reset: NODE_ENV=production."',
  '  exit 1',
  'fi',
  'if [ -z "${DATABASE_URL:-}" ]; then',
  '  echo "Refusing reset: DATABASE_URL is not set."',
  '  exit 1',
  'fi',
  "node - <<'JS'",
  "const raw = process.env.DATABASE_URL;",
  "let url;",
  "try { url = new URL(raw); } catch { console.error('Refusing reset: DATABASE_URL is invalid.'); process.exit(1); }",
  "const host = url.hostname;",
  "const db = (url.pathname || '').replace(/^\\//, '');",
  "const safeHost = ['localhost', '127.0.0.1', 'postgres', 'db'].includes(host);",
  "const unsafeName = /(prod|production|live|main|customer|user|real|billing|payment|finance)/i.test(db);",
  "console.log('Masked DB target: ' + host + '/' + (db ? db[0] + '***' : '[none]'));",
  "if (!safeHost || unsafeName) {",
  "  console.error('Refusing reset: target is not clearly local/development safe.');",
  "  process.exit(1);",
  "}",
  "console.error('Reset implementation intentionally not included in dry-run branch. Add backup + reset commands only after explicit approval.');",
  "process.exit(1);",
  'JS',
].join('\n'));

write('scripts/db/seed-dev-db.sh', [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  'echo "Seed dev DB script placeholder. No seed operation runs unless implemented in a future approved local/dev task."',
].join('\n'));
for (const file of ['scripts/db/archive-dev-db.sh', 'scripts/db/reset-dev-db.sh', 'scripts/db/seed-dev-db.sh']) {
  fs.chmodSync(path.join(root, file), 0o755);
}

const packagePath = path.join(root, 'package.json');
if (fs.existsSync(packagePath)) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  pkg.scripts = pkg.scripts || {};
  pkg.scripts['archive:dry-run'] = 'node scripts/archive/create-archive-dry-run.cjs';
  pkg.scripts['archive:verify'] = 'node scripts/archive/verify-archive.cjs';
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(JSON.stringify({
  archiveRoot,
  branch,
  sourceCommit,
  dryRun: !confirmArchive,
  filesWouldArchive: wouldArchive.length,
  filesExcluded: excluded.length,
  secretFindings: secretFindings.length,
  databaseConnected: false,
  databaseResetPerformed: false,
  warnings,
}, null, 2));
