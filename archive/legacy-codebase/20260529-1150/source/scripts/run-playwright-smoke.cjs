#!/usr/bin/env node

const { rmSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const outputDir = join(root, "test-results", "smoke");
const playwrightBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");

let result;

try {
  result = spawnSync(
    playwrightBin,
    ["test", "--project=smoke", "--output", outputDir],
    {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    },
  );
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}

if (result?.error) {
  throw result.error;
}

process.exit(result?.status ?? 1);
