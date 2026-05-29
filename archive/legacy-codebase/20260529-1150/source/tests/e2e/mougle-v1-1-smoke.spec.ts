import { expect, test, type Page } from "@playwright/test";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
  storageState: undefined,
});

const SECRET_ENV_KEYS = [
  "E2E_ADMIN_USERNAME",
  "E2E_ADMIN_PASSWORD",
  "E2E_USER_USERNAME",
  "E2E_USER_PASSWORD",
];

const ADMIN_AUTH_ENV_KEYS = [
  "E2E_BASE_URL",
  "E2E_ADMIN_LOGIN_URL",
  "E2E_ADMIN_USERNAME",
  "E2E_ADMIN_PASSWORD",
];

const USER_AUTH_ENV_KEYS = [
  "E2E_BASE_URL",
  "E2E_USER_LOGIN_URL",
  "E2E_USER_USERNAME",
  "E2E_USER_PASSWORD",
];

const ADMIN_AUTH_MISSING = missingEnv(ADMIN_AUTH_ENV_KEYS);
const USER_AUTH_MISSING = missingEnv(USER_AUTH_ENV_KEYS);

function envValue(key: string): string {
  return process.env[key]?.trim() || "";
}

function missingEnv(keys: string[]): string[] {
  return keys.filter((key) => !envValue(key));
}

function redactSecrets(message: string): string {
  return SECRET_ENV_KEYS.reduce((current, key) => {
    const value = envValue(key);
    return value ? current.split(value).join("[redacted]") : current;
  }, message);
}

function routeTarget(envKey: string, fallbackPath: string): string {
  return envValue(envKey) || fallbackPath;
}

function installPageHealthWatch(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${redactSecrets(error.message)}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console.error: ${redactSecrets(message.text())}`);
    }
  });

  return {
    assertHealthy(label: string) {
      expect(errors, `${label} emitted console/page errors:\n${errors.slice(0, 5).join("\n")}`).toEqual([]);
    },
  };
}

async function expectNonBlankPage(page: Page, target: string, label: string) {
  const response = await page.goto(target, { waitUntil: "domcontentloaded" });
  expect(response, `${label} did not return a browser response`).not.toBeNull();
  expect(response!.status(), `${label} returned HTTP ${response!.status()}`).toBeLessThan(500);
  await expect(page.locator("body"), `${label} body should be visible`).toBeVisible();
  await page.waitForFunction(() => document.body.innerText.trim().length > 20);
  const rootChildCount = await page.locator("#root").evaluate((node) => node.childElementCount).catch(() => 1);
  expect(rootChildCount, `${label} rendered an empty app root`).toBeGreaterThan(0);
}

function installReadOnlyMutationGuard(page: Page, allowedMutationPaths: string[] = []) {
  const violations: string[] = [];
  const allowed = new Set(allowedMutationPaths);

  void page.route("**/*", async (route) => {
    const method = route.request().method().toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const pathname = new URL(route.request().url()).pathname;
      if (!allowed.has(pathname)) {
        violations.push(`${method} ${pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
    }

    await route.continue();
  });

  return {
    assertReadOnly(label: string) {
      expect(violations, `${label} attempted unexpected mutating requests`).toEqual([]);
    },
  };
}

test.describe("Mougle V1.1 smoke", () => {
  test("public homepage loads without a blank screen or browser errors", async ({ page }) => {
    const health = installPageHealthWatch(page);
    const guard = installReadOnlyMutationGuard(page);
    await expectNonBlankPage(page, "/", "homepage");
    await expect(page.locator("body")).toContainText(/Mougle/i);
    health.assertHealthy("homepage");
    guard.assertReadOnly("homepage");
  });

  test("safe public docs route loads without a blank screen or browser errors", async ({ page }) => {
    const health = installPageHealthWatch(page);
    const guard = installReadOnlyMutationGuard(page);
    await expectNonBlankPage(page, "/docs/about", "public docs route");
    await expect(page.locator("body")).toContainText(/Mougle/i);
    health.assertHealthy("public docs route");
    guard.assertReadOnly("public docs route");
  });

  test("admin login route loads or unauthenticated dashboard redirects safely", async ({ page }) => {
    const health = installPageHealthWatch(page);
    const guard = installReadOnlyMutationGuard(page);

    await expectNonBlankPage(page, routeTarget("E2E_ADMIN_LOGIN_URL", "/admin/login"), "admin login route");
    await expect(page.getByTestId("text-admin-login-title")).toBeVisible();

    await expectNonBlankPage(page, "/admin/dashboard", "unauthenticated admin dashboard route");
    await expect(page.getByTestId("text-admin-login-title").or(page.getByTestId("text-admin-title"))).toBeVisible();

    health.assertHealthy("admin login/redirect smoke");
    guard.assertReadOnly("admin login/redirect smoke");
  });

  test.describe("authenticated admin smoke", () => {
    test.skip(
      ADMIN_AUTH_MISSING.length > 0,
      `Missing ${ADMIN_AUTH_MISSING.join(", ")}; skipping authenticated admin smoke.`,
    );

    test("admin dashboard read-only authenticated smoke", async ({ page }) => {
      const health = installPageHealthWatch(page);
      const guard = installReadOnlyMutationGuard(page, ["/api/admin/login"]);

      await expectNonBlankPage(page, routeTarget("E2E_ADMIN_LOGIN_URL", "/admin/login"), "admin login route");
      await page.getByTestId("input-username").fill(envValue("E2E_ADMIN_USERNAME"));
      await page.getByTestId("input-password").fill(envValue("E2E_ADMIN_PASSWORD"));
      await page.getByTestId("button-login").click();

      await expect(page.getByTestId("text-admin-title")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("text-admin-title")).toContainText(/Mougle Command Center/i);
      health.assertHealthy("authenticated admin dashboard smoke");
      guard.assertReadOnly("authenticated admin dashboard smoke");
    });
  });

  test("user sign-in route loads without a blank screen or browser errors", async ({ page }) => {
    const health = installPageHealthWatch(page);
    const guard = installReadOnlyMutationGuard(page);
    await expectNonBlankPage(page, routeTarget("E2E_USER_LOGIN_URL", "/auth/signin"), "user sign-in route");
    await expect(page.getByTestId("text-signin-title")).toBeVisible();
    health.assertHealthy("user sign-in smoke");
    guard.assertReadOnly("user sign-in smoke");
  });

  test.describe("authenticated user smoke", () => {
    test.skip(
      USER_AUTH_MISSING.length > 0,
      `Missing ${USER_AUTH_MISSING.join(", ")}; skipping authenticated user smoke.`,
    );

    test("user dashboard read-only authenticated smoke", async ({ page }) => {
      const health = installPageHealthWatch(page);
      const guard = installReadOnlyMutationGuard(page, ["/api/auth/signin"]);

      await expectNonBlankPage(page, routeTarget("E2E_USER_LOGIN_URL", "/auth/signin"), "user sign-in route");
      await page.getByTestId("input-signin-email").fill(envValue("E2E_USER_USERNAME"));
      await page.getByTestId("input-signin-password").fill(envValue("E2E_USER_PASSWORD"));
      await page.getByTestId("button-signin").click();

      await expect.poll(() => page.url(), { timeout: 15_000 }).not.toContain("/auth/signin");
      const session = await page.request.get("/api/auth/me");
      expect(session.status(), "authenticated user session should be readable").toBe(200);

      await expectNonBlankPage(page, "/dashboard", "authenticated user dashboard route");
      await expect(page.getByTestId("text-dashboard-title")).toBeVisible({ timeout: 15_000 });
      health.assertHealthy("authenticated user dashboard smoke");
      guard.assertReadOnly("authenticated user dashboard smoke");
    });
  });
});
