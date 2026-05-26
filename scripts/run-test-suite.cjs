"use strict";

const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const suites = {
  local: [
    "tests/render-text-fitting.test.ts",
    "tests/render-srt-service.test.ts",
    "tests/render-srt-route.test.ts",
    "tests/render-mp4-route.test.ts",
    "tests/validate-env.test.ts",
    "tests/shutdown-registry.test.ts",
    "tests/render-mp4-guards.test.ts",
    "tests/broadcast-preview-auto-revert.test.ts",
    "tests/admin-reserved-subroutes.test.ts",
    "tests/admin-dashboard-route-links.test.ts",
    "tests/audit-export-outlier-form.test.ts",
    "tests/audit-export-trend-window-stats-toggle.test.ts",
    "tests/audience-history-export-filters.test.ts",
    "tests/r10-r3f-3d-4d-safety-invariants.test.ts",
    "tests/safety/base.test.ts",
  ],
  db: [
    "tests/safety/playout-queue-persistence-db.test.ts",
    "tests/safety/omni-channel-audience-persistence-db.test.ts",
  ],
};

const suiteName = process.argv[2] || "local";
const files = suites[suiteName];

if (!files) {
  console.error(`Unknown test suite "${suiteName}". Expected one of: ${Object.keys(suites).join(", ")}`);
  process.exit(1);
}

const tsxModule = path.join(process.cwd(), "node_modules", "tsx", "dist", "loader.mjs");

if (!existsSync(tsxModule)) {
  console.error("Missing local tsx package. Run npm ci before invoking this test suite.");
  process.exit(1);
}

if (suiteName === "db" && !process.env.SUPABASE_DB_PASSWORD?.trim()) {
  console.error(
    [
      "The db test suite requires SUPABASE_DB_PASSWORD.",
      "Mougle does not fall back to DATABASE_URL because it may point at the legacy Neon database.",
      "Set SUPABASE_DB_PASSWORD only in an approved local/staging test environment, then rerun npm run test:db.",
    ].join(" "),
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", tsxModule, "--test", "--test-force-exit", "--test-concurrency=1", ...files],
  {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" },
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
