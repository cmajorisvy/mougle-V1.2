import { test, expect } from "@playwright/test";

const consoleLogs: string[] = [];
const networkErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleLogs.length = 0;
  networkErrors.length = 0;

  page.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    consoleLogs.push(`[pageerror] ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    const failure = req.failure();
    networkErrors.push(`${req.method()} ${req.url()} :: ${failure?.errorText || "unknown error"}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const failed = testInfo.status !== testInfo.expectedStatus;

  if (failed) {
    await page.screenshot({
      path: `test-results/${testInfo.title}.png`,
      fullPage: true,
    });
  }

  if (consoleLogs.length > 0) {
    await testInfo.attach("console-logs", {
      body: consoleLogs.join("\n"),
      contentType: "text/plain",
    });
  }

  if (networkErrors.length > 0) {
    await testInfo.attach("network-errors", {
      body: networkErrors.join("\n"),
      contentType: "text/plain",
    });
  }
});

test("UI: login -> export passport -> revoke -> status updated", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  test.skip(!email || !password, "E2E_EMAIL/E2E_PASSWORD not set");

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.goto("/auth/signin");
  await page.getByTestId("input-signin-email").fill(email!);
  await page.getByTestId("input-signin-password").fill(password!);
  await page.getByTestId("button-signin").click();

  await page.waitForLoadState("networkidle");
  await page.goto("/my-agent");

  await expect(page.getByTestId("text-pa-title")).toBeVisible();

  const exportButton = page.getByTestId("button-export-agent");
  await expect(exportButton).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  const response = await download.response();
  expect(response).not.toBeNull();
  if (response) {
    expect(response.status()).toBe(200);
    const disposition = response.headers()["content-disposition"] || "";
    expect(disposition).toContain(".mougle-agent");
  }
  expect(await download.path()).not.toBeNull();

  const exportHistorySection = page.getByText("Export History");
  await expect(exportHistorySection).toBeVisible();

  const revokeButton = page.getByRole("button", { name: "Revoke" }).first();
  await revokeButton.click();

  await expect(page.getByRole("button", { name: "Revoked" }).first()).toBeVisible();
});

test("UI: session expiration -> export passport blocked gracefully", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  test.skip(!email || !password, "E2E_EMAIL/E2E_PASSWORD not set");

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.goto("/auth/signin");
  await page.getByTestId("input-signin-email").fill(email!);
  await page.getByTestId("input-signin-password").fill(password!);
  await page.getByTestId("button-signin").click();
  await page.waitForLoadState("networkidle");

  await page.context().clearCookies();
  await page.goto("/my-agent");

  const exportButton = page.getByTestId("button-export-agent");
  await expect(exportButton).toBeVisible();

  let downloadFailed = false;
  const downloadPromise = page.waitForEvent("download").catch(() => {
    downloadFailed = true;
    return null;
  });

  await exportButton.click();
  const download = await downloadPromise;

  expect(downloadFailed || !download).toBeTruthy();

  const redirectedToLogin = page.url().includes("/auth/signin");
  const unauthorizedVisible = await page.getByText(/Sign In Required|Unauthorized|Authentication required/i).first().isVisible().catch(() => false);

  expect(redirectedToLogin || unauthorizedVisible).toBeTruthy();
  expect(pageErrors.length).toBe(0);
});
