import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// T302 — End-to-end coverage for the T290 "create shared view from a coverage
// gap" flow. The flow spans the coverage popover UI, the saved-views POST
// endpoint, and the schedule editor that opens with the clicked weekday/hour
// pre-filled. This Playwright test exercises all three so a regression in any
// one of them surfaces here.
//
// Auth: the flow is gated behind `requireRootAdmin`, which in this codebase is
// the env-configured root admin (ADMIN_USERNAME + ADMIN_PASSWORD). The test
// skips when those aren't available so it stays green in environments that
// don't expose the founder credentials.

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.E2E_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD;

test.skip(
  !ADMIN_USERNAME || !ADMIN_PASSWORD,
  "Set ADMIN_USERNAME and ADMIN_PASSWORD (or E2E_ADMIN_* equivalents) to run the coverage create-view-from-gap e2e test.",
);

async function getCsrfToken(request: APIRequestContext) {
  const res = await request.get("/api/auth/csrf-token");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.csrfToken).toBeTruthy();
  return data.csrfToken as string;
}

async function loginAsRootAdmin(request: APIRequestContext) {
  const csrf = await getCsrfToken(request);
  const res = await request.post("/api/admin/login", {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    headers: { "X-CSRF-Token": csrf },
  });
  expect(res.ok(), `admin login should succeed (got ${res.status()})`).toBeTruthy();
  const body = await res.json();
  expect(body?.actor?.type).toBe("root_admin");
}

async function deleteSavedView(request: APIRequestContext, id: string) {
  try {
    const csrf = await getCsrfToken(request);
    await request.delete(`/api/admin/broadcasts/saved-views/${id}`, {
      headers: { "X-CSRF-Token": csrf },
    });
  } catch {
    // Best-effort cleanup — don't fail the test if teardown can't reach the API.
  }
}

// Reload the heatmap until at least one cell has status=gap. With no shared
// views or no covered hour at the chosen slot we expect every cell to be a
// gap, but we don't assume the test DB is empty so we just need *one*.
async function openCoverageAndClickAGap(page: Page): Promise<{ day: number; hour: number }> {
  await page.getByTestId("button-open-schedule-coverage").click();
  await expect(page.getByTestId("popover-schedule-coverage")).toBeVisible();
  // Wait for the grid; cells are buttons of the form button-coverage-cell-<day>-<hour>.
  const grid = page.getByTestId("grid-schedule-coverage");
  await expect(grid).toBeVisible();
  const gapCell = grid
    .locator('button[data-testid^="button-coverage-cell-"][data-status="gap"]')
    .first();
  await expect(gapCell).toBeVisible();
  const testId = await gapCell.getAttribute("data-testid");
  expect(testId).toBeTruthy();
  // testId format: button-coverage-cell-<day>-<hour>
  const m = /^button-coverage-cell-(\d+)-(\d+)$/.exec(testId!);
  expect(m, `unexpected gap cell testid: ${testId}`).not.toBeNull();
  const day = Number(m![1]);
  const hour = Number(m![2]);
  await gapCell.click();
  await expect(page.getByTestId("panel-coverage-cell-actions")).toBeVisible();
  await expect(page.getByTestId("panel-coverage-cover-new")).toBeVisible();
  return { day, hour };
}

test("create shared view from coverage gap opens schedule editor with a pre-filled window", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(90_000);

  await loginAsRootAdmin(request);

  await page.goto("/admin/broadcasts", { waitUntil: "domcontentloaded" });
  // The Coverage button only renders after the saved-views query resolves and the
  // schedule preview panel is mounted; wait for it explicitly.
  await expect(page.getByTestId("button-open-schedule-coverage")).toBeVisible({
    timeout: 30_000,
  });

  // 1. Open the popover, click a known gap cell.
  const { day, hour } = await openCoverageAndClickAGap(page);

  // 2. Type a unique name and click "Create new shared view…".
  const uniqueName = `T302 cov ${day}-${hour} ${Date.now()}`;
  const nameInput = page.getByTestId("input-coverage-new-view-name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill(uniqueName);

  // Intercept the create response so we can assert on the created view and
  // delete it during teardown without depending on UI text matching.
  const createResponsePromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/admin/broadcasts/saved-views") &&
      r.request().method() === "POST",
  );
  await page.getByTestId("button-coverage-create-new-view").click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok(), `saved-views POST should succeed (got ${createResponse.status()})`)
    .toBeTruthy();
  const createBody = await createResponse.json();
  const createdId: string | undefined = createBody?.view?.id;
  expect(createdId, "server should return the created view id").toBeTruthy();
  expect(createBody?.view?.scope).toBe("shared");
  expect(createBody?.view?.name).toBe(uniqueName);

  // Ensure the view is cleaned up even if a later assertion fails.
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp || !createdId) return;
    cleanedUp = true;
    await deleteSavedView(request, createdId);
  };

  try {
    // 3. Manage views dialog should open with a schedule draft containing
    //    exactly one window matching the clicked weekday + hour.
    await expect(page.getByTestId("dialog-manage-saved-views")).toBeVisible();
    await expect(page.getByTestId(`row-saved-view-${createdId}`)).toBeVisible();

    const editor = page.getByTestId(`editor-schedule-${createdId}`);
    await expect(editor).toBeVisible();

    const windowRows = editor.locator('[data-testid^="row-schedule-window-"]');
    await expect(windowRows).toHaveCount(1);

    // The single window must target exactly the clicked weekday and span
    // exactly hour..hour+1 (24h time, zero-padded).
    const dayCheckbox = editor.getByTestId(
      `checkbox-schedule-day-${createdId}-0-${day}`,
    );
    await expect(dayCheckbox).toBeChecked();
    for (let other = 0; other < 7; other++) {
      if (other === day) continue;
      await expect(
        editor.getByTestId(`checkbox-schedule-day-${createdId}-0-${other}`),
      ).not.toBeChecked();
    }

    const hh = (n: number) => `${String(n).padStart(2, "0")}:00`;
    await expect(editor.getByTestId(`input-schedule-start-${createdId}-0`)).toHaveValue(
      hh(hour),
    );
    await expect(editor.getByTestId(`input-schedule-end-${createdId}-0`)).toHaveValue(
      hh((hour + 1) % 24),
    );

    // 4. Close the dialog, reopen the coverage popover on the same cell, and
    //    confirm the new view shows up in list-coverage-cover-with — the
    //    heatmap data has refreshed and a "Cover with <view>" button now
    //    exists for our brand-new shared view.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dialog-manage-saved-views")).not.toBeVisible();

    // Re-open coverage and click the same gap cell. The schedule editor was
    // only seeded with a draft window — nothing was saved — so the heatmap
    // should still mark this hour as a gap, and the newly created shared view
    // should now appear in `list-coverage-cover-with` as a "Cover with …"
    // candidate.
    await page.getByTestId("button-open-schedule-coverage").click();
    await expect(page.getByTestId("popover-schedule-coverage")).toBeVisible();
    const sameCell = page.getByTestId(`button-coverage-cell-${day}-${hour}`);
    await expect(sameCell).toBeVisible();
    await expect(sameCell).toHaveAttribute("data-status", "gap");
    await sameCell.click();
    await expect(page.getByTestId("list-coverage-cover-with")).toBeVisible();
    await expect(
      page.getByTestId(`button-coverage-cover-with-${createdId}`),
    ).toBeVisible();
  } finally {
    await cleanup();
  }

  // Sanity: confirm baseURL was honored so the test is actually hitting the app.
  expect(baseURL).toBeTruthy();
});
