/**
 * Playwright setup project — task #761.
 *
 * Authenticates a root-admin session against the running app and writes the
 * resulting cookie jar to `ADMIN_STORAGE_STATE_PATH` (default
 * `.local/playwright/admin-storage-state.json`).
 *
 * Downstream tests opt into this state with
 *   test.use({ storageState: ADMIN_STORAGE_STATE_PATH })
 * so admin-gated React surfaces (the R3F canvas pages) actually mount instead
 * of being unauth-redirected to the login shell.
 *
 * Credentials are read from the same env vars the server itself uses
 * (`ADMIN_USERNAME` + `ADMIN_PASSWORD`). The hashed-only `ADMIN_PASSWORD_HASH`
 * is what the server verifies against; the plaintext `ADMIN_PASSWORD` must be
 * provided in the test environment for the fixture to log in. If either is
 * missing the setup is skipped (so the canvas-probe tests soft-skip rather
 * than break the broader suite).
 */

import { test as setup, expect, request } from "@playwright/test";
import fs from "fs";
import path from "path";
import { ADMIN_STORAGE_STATE_PATH } from "./admin-auth-paths";

export { ADMIN_STORAGE_STATE_PATH };

setup("authenticate as root admin", async ({ baseURL }) => {
  // Use a dedicated pair of env vars so the test fixture never has to
  // touch the server's real `ADMIN_PASSWORD_HASH`. CI wires these to a
  // throwaway admin-staff row.
  const username = process.env.E2E_ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!username || !password) {
    // Write an empty storage state so downstream `test.use({ storageState })`
    // doesn't crash on a missing file; the canvas-probe tests detect the
    // empty state themselves and soft-skip.
    fs.mkdirSync(path.dirname(ADMIN_STORAGE_STATE_PATH), { recursive: true });
    fs.writeFileSync(
      ADMIN_STORAGE_STATE_PATH,
      JSON.stringify({ cookies: [], origins: [] }),
    );
    setup.skip(
      true,
      "ADMIN_USERNAME / ADMIN_PASSWORD not set in env — canvas-probe tests will soft-skip.",
    );
    return;
  }

  const ctx = await request.newContext({ baseURL });

  // 1) Seed a session + read the CSRF token the server pinned to it.
  const seed = await ctx.get("/api/admin/verify");
  const csrf = seed.headers()["x-csrf-token"];
  expect(csrf, "no X-CSRF-Token header on /api/admin/verify").toBeTruthy();

  // 2) Log in with that CSRF token.
  const login = await ctx.post("/api/admin/login", {
    headers: { "x-csrf-token": csrf!, "content-type": "application/json" },
    data: { username, password },
  });
  expect(
    login.status(),
    `admin login failed: ${login.status()} ${await login.text()}`,
  ).toBe(200);

  // 3) Verify the cookie is good before we persist it.
  const verify = await ctx.get("/api/admin/verify");
  expect(verify.status(), "admin verify after login").toBe(200);

  fs.mkdirSync(path.dirname(ADMIN_STORAGE_STATE_PATH), { recursive: true });
  await ctx.storageState({ path: ADMIN_STORAGE_STATE_PATH });
  await ctx.dispose();
});
