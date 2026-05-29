import { defineConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

function loadEnvFile(filePath: string, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env"));
loadEnvFile(path.join(process.cwd(), ".env.local"), { override: true });

const baseURL = process.env.E2E_BASE_URL || process.env.VITE_PUBLIC_BASE_URL || "http://localhost:5000";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/artifacts",
  retries: 0,
  timeout: 120_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "smoke",
      testMatch: /mougle-v1-1-smoke\.spec\.ts$/,
      use: {
        screenshot: "off",
        trace: "off",
        video: "off",
        storageState: undefined,
      },
    },
    {
      name: "setup",
      testMatch: /.*\.setup\.ts$/,
    },
    {
      name: "chromium",
      testIgnore: [/.*\.setup\.ts$/, /mougle-v1-1-smoke\.spec\.ts$/],
      dependencies: ["setup"],
    },
  ],
});
