#!/usr/bin/env node
/* Safety lint: flags disallowed patterns across the repo (or specific files).
 *
 * Usage:
 *   node scripts/safety-lint.cjs                      # scans default repo roots
 *   node scripts/safety-lint.cjs <file> [<file> ...]  # scans only the given files
 *
 * Exits non-zero with a list of offending matches when any disallowed pattern
 * appears outside of allow-listed paths (docs, tests, the lint script itself).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DISALLOWED = [
  {
    id: "no_watermark_removal",
    pattern: /removeWatermark|stripWatermark|deleteWatermark/i,
    message: "Removing or stripping watermarks is forbidden.",
  },
  {
    id: "no_logo_stripping",
    pattern: /stripLogo|removeLogo|eraseLogo/i,
    message: "Stripping or erasing logos is forbidden.",
  },
  {
    id: "no_external_publish_without_approval",
    pattern: /googleapis\.com\/(?:upload\/)?youtube|youtube\.com\/upload|youtubei\.googleapis\.com|open\.tiktokapis\.com|api\.tiktok(?:global)?shop?\.com\/.*(?:publish|upload)|api\.tiktok\.com\/.*(?:publish|upload)|graph(?:-video)?\.facebook\.com\/.*(?:videos|reels|live_videos|photos)|graph\.instagram\.com\/.*(?:media|publish)|api\.twitter\.com\/.*(?:tweets|media|statuses)|upload\.twitter\.com|api\.x\.com\/.*(?:tweets|media)|api\.linkedin\.com\/.*(?:ugcPosts|posts|assets)|api\.threads\.net|reddit\.com\/api\/submit|vimeo\.com\/api\/.*upload/i,
    message:
      "Direct external publish API calls are forbidden — must go through an approved gateway with requireFounderApproval.",
  },
];

const DEFAULT_ROOTS = ["server", "client/src", "shared"];

// Intentional gateway files allowed to call external publish APIs directly.
// Every entry MUST also be gated by founder/root-admin approval at runtime.
const GATEWAY_ALLOWLIST = new Set([
  "server/services/audience-platform-gateway-service.ts",
  "server/services/youtube-publishing-service.ts",
]);
const ALLOWED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "attached_assets",
]);
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"]);

function walk(root, out) {
  let stat;
  try {
    stat = fs.statSync(root);
  } catch {
    return;
  }
  if (stat.isFile()) {
    out.push(root);
    return;
  }
  if (!stat.isDirectory()) return;
  const base = path.basename(root);
  if (ALLOWED_DIRS.has(base)) return;
  for (const entry of fs.readdirSync(root)) {
    walk(path.join(root, entry), out);
  }
}

function isScannable(file) {
  if (SCAN_EXT.has(path.extname(file))) return true;
  // explicit files passed on CLI (e.g. .txt fixtures) are always scanned
  return false;
}

function scanFile(file, results, force) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  if (!force && !isScannable(file)) return;
  const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
  const allowed = GATEWAY_ALLOWLIST.has(rel);
  const lines = content.split(/\r?\n/);
  for (const rule of DISALLOWED) {
    if (allowed && rule.id === "no_external_publish_without_approval") continue;
    for (let i = 0; i < lines.length; i += 1) {
      if (rule.pattern.test(lines[i])) {
        results.push({
          file,
          line: i + 1,
          gate: rule.id,
          message: rule.message,
          excerpt: lines[i].trim().slice(0, 200),
        });
      }
    }
  }
}

function main() {
  const cliFiles = process.argv.slice(2);
  const explicit = cliFiles.length > 0;
  const files = [];
  if (explicit) {
    for (const f of cliFiles) files.push(path.resolve(f));
  } else {
    for (const r of DEFAULT_ROOTS) walk(path.resolve(r), files);
  }
  const results = [];
  for (const f of files) scanFile(f, results, explicit);

  if (results.length === 0) {
    if (!explicit) {
      process.stdout.write(`safety-lint: OK (scanned ${files.length} files)\n`);
    }
    process.exit(0);
  }
  process.stderr.write(`safety-lint: ${results.length} violation(s) found\n`);
  for (const r of results) {
    process.stderr.write(
      `  [${r.gate}] ${path.relative(process.cwd(), r.file)}:${r.line}  ${r.message}\n    > ${r.excerpt}\n`,
    );
  }
  process.exit(1);
}

main();
