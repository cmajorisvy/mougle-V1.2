import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";

const baseURL = "http://127.0.0.1:5001";
const adminStatePath = path.resolve("output/playwright/auth-state-5001/admin.storage-state.json");
const outputRoot = path.resolve("output/playwright/admin-dashboard-redesign-5001");

test.describe.configure({ mode: "serial" });
test.skip(!fs.existsSync(adminStatePath), "Admin storage state is required for the local admin dashboard smoke test.");
test.use({
  channel: "chrome",
  baseURL,
  storageState: fs.existsSync(adminStatePath) ? adminStatePath : undefined,
  viewport: { width: 1440, height: 1100 },
  navigationTimeout: 180_000,
  actionTimeout: 30_000,
});

test.beforeAll(() => {
  fs.mkdirSync(outputRoot, { recursive: true });
});

test("admin command center renders key zones and safe redirects", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(`${baseURL}/admin/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Founder Command Center" })).toBeVisible();
  await expect(page.getByText("Command Overview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Safety & Governance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agents & Civilization" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Knowledge & Truth" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Media & Content Pipeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Marketplace & Economy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
  await expect(page.getByText("Manual approval required").first()).toBeVisible();
  await expect(page.getByText("Dry run").first()).toBeVisible();
  await expect(page.getByText("What cannot happen from this screen")).toBeVisible();
  await page.screenshot({ path: path.join(outputRoot, "admin-dashboard-command-center.png"), fullPage: true });

  await page.goto(`${baseURL}/admin/users`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  await page.goto(`${baseURL}/admin/billing`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/revenue$/);

  const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes("401"));
  expect(unexpectedConsoleErrors).toEqual([]);
});
