import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";

const baseURL = "http://127.0.0.1:5001";
const adminStatePath = path.resolve("output/playwright/auth-state-5001/admin.storage-state.json");

test.describe.configure({ mode: "serial" });
test.skip(!fs.existsSync(adminStatePath), "Admin storage state is required for the Production House CSRF smoke test.");
test.use({
  channel: "chrome",
  baseURL,
  storageState: fs.existsSync(adminStatePath) ? adminStatePath : undefined,
  viewport: { width: 1440, height: 1100 },
  navigationTimeout: 180_000,
  actionTimeout: 30_000,
});

test("Preview Studio generate and update-controls do not show Invalid CSRF token", async ({ page }) => {
  const csrfResponses: string[] = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/api/admin/production-house")) return;
    if (response.status() !== 403) return;
    const text = await response.text().catch(() => "");
    if (/csrf/i.test(text)) csrfResponses.push(text);
  });

  await page.goto(`${baseURL}/admin/production-house`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("preview-studio-hero")).toBeVisible();

  const generateResponse = page.waitForResponse((response) =>
    response.url().includes("/api/admin/production-house/preview-studio/generate") &&
    response.request().method() === "POST",
  );
  await page.getByTestId("mode-debate").click();
  expect((await generateResponse).ok()).toBeTruthy();

  const updateResponse = page.waitForResponse((response) =>
    response.url().includes("/api/admin/production-house/preview-studio/update-controls") &&
    response.request().method() === "POST",
  );
  await page.getByTestId("select-layout").selectOption({ index: 1 });
  expect((await updateResponse).ok()).toBeTruthy();

  await expect(page.getByText(/Invalid CSRF token/i)).toHaveCount(0);
  expect(csrfResponses).toEqual([]);
});
