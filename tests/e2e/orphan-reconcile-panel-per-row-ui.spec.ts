/**
 * Task #807 — Browser-level UI test for the OrphanReconcilePanel
 * per-row Re-link / Hard-delete flows.
 *
 * Task #801 pinned the bulk hard-delete path in
 * `client/src/pages/admin/3d-assets/OrphanReconcilePanel.tsx`. The per-row
 * branches in `runAction` are still only covered at the route layer:
 *   - Re-link with a confirm() dialog.
 *   - Hard-delete with a typed DELETE prompt + a reason prompt + the
 *     empty-reason guard that alerts and short-circuits before any HTTP
 *     request is sent.
 *   - The `lastResult` banner rendering ok / failed badges + copy.
 *
 * This spec exercises all of the above against the real React component.
 */

import { test, expect, type Route, type Request } from "@playwright/test";

type Orphan = {
  id: string;
  name: string;
  storageKey: string;
  byteSize: number;
  sha256: string;
  archivedAt: string | null;
  status: string;
};

const SEED_ORPHANS: Orphan[] = [
  {
    id: "33333333-3333-3333-3333-333333333333",
    name: "orphan-gamma.glb",
    storageKey: "production-assets/gamma.glb",
    byteSize: 512 * 1024,
    sha256: "c".repeat(64),
    archivedAt: "2026-02-01T00:00:00.000Z",
    status: "archived",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    name: "orphan-delta.glb",
    storageKey: "production-assets/delta.glb",
    byteSize: 768 * 1024,
    sha256: "d".repeat(64),
    archivedAt: "2026-02-02T00:00:00.000Z",
    status: "archived",
  },
];

async function setupBaseRoutes(
  page: import("@playwright/test").Page,
  getOrphans: () => Orphan[],
) {
  await page.route("**/api/auth/csrf-token", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "test-csrf-token" }),
    });
  });

  await page.route(
    "**/api/admin/production-assets/orphan-sweep/status",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: {
            lastScanAt: null,
            lastOrphanCount: 0,
            threshold: 5,
            wasAboveThreshold: false,
            nextScanAt: null,
            intervalMs: null,
            lastAutoResolvedAt: null,
            lastAutoResolvedCount: null,
            flapping: false,
            flappingCount: 0,
            flappingWindowMs: 60 * 60 * 1000,
            flappingThreshold: 3,
          },
        }),
      });
    },
  );

  await page.route(
    "**/api/admin/production-assets/orphans/list",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, items: getOrphans() }),
      });
    },
  );

  await page.route(
    "**/api/admin/production-assets**",
    async (route: Route) => {
      const url = route.request().url();
      if (
        url.includes("/orphans/list") ||
        url.includes("/orphan-sweep/status") ||
        url.includes("/reconcile")
      ) {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          items: [],
          total: 0,
          limit: 20,
          offset: 0,
        }),
      });
    },
  );

  await page.route("**/api/admin/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

test.describe("Task #807 — OrphanReconcilePanel per-row UI", () => {
  test("per-row Re-link: confirm() honored, success lastResult banner with ok badge", async ({
    page,
  }) => {
    const orphans = [...SEED_ORPHANS];
    await setupBaseRoutes(page, () => orphans);

    const reconcilePayloads: Array<{ url: string; body: unknown }> = [];
    await page.route(
      "**/api/admin/production-assets/*/reconcile",
      async (route: Route) => {
        let body: unknown = null;
        try {
          body = route.request().postDataJSON();
        } catch {
          body = route.request().postData();
        }
        reconcilePayloads.push({ url: route.request().url(), body });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            result: { status: "relinked" },
          }),
        });
      },
    );

    const dialogMessages: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogMessages.push(`[${dialog.type()}] ${dialog.message().split("\n")[0]}`);
      if (dialog.type() === "confirm") {
        await dialog.accept();
      } else {
        await dialog.accept();
      }
    });

    await page.goto("/admin/3d-assets", { waitUntil: "domcontentloaded" });

    const target = SEED_ORPHANS[0];
    await expect(page.getByTestId("card-orphan-reconcile")).toBeVisible();
    await expect(page.getByTestId(`row-orphan-${target.id}`)).toBeVisible();

    await page.getByTestId(`button-orphan-relink-${target.id}`).click();

    // Result banner should render with an ok badge + "Re-link ok — relinked".
    const banner = page.getByTestId("text-orphan-action-result");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/^\s*ok\b/);
    await expect(banner).toContainText(/Re-link ok — relinked/);
    await expect(banner).toContainText(target.id);

    // Exactly one confirm dialog (no prompt() for re-link).
    expect(dialogMessages.length).toBe(1);
    expect(dialogMessages[0]).toMatch(/^\[confirm\]/);

    // Exactly one reconcile request fired, with action=relink_object and no reason.
    expect(reconcilePayloads.length).toBe(1);
    expect(reconcilePayloads[0].url).toContain(`/${target.id}/reconcile`);
    expect(reconcilePayloads[0].body).toMatchObject({
      action: "relink_object",
      confirm: true,
    });
    expect((reconcilePayloads[0].body as Record<string, unknown>).reason).toBeUndefined();
  });

  test("per-row Hard-delete: typed DELETE + reason prompts honored, failed lastResult banner with failed badge", async ({
    page,
  }) => {
    const orphans = [...SEED_ORPHANS];
    await setupBaseRoutes(page, () => orphans);

    const reconcilePayloads: Array<{ url: string; body: unknown }> = [];
    await page.route(
      "**/api/admin/production-assets/*/reconcile",
      async (route: Route) => {
        let body: unknown = null;
        try {
          body = route.request().postDataJSON();
        } catch {
          body = route.request().postData();
        }
        reconcilePayloads.push({ url: route.request().url(), body });
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "object bytes are present at storageKey — refuse delete",
          }),
        });
      },
    );

    const dialogMessages: string[] = [];
    let promptIdx = 0;
    page.on("dialog", async (dialog) => {
      dialogMessages.push(`[${dialog.type()}] ${dialog.message().split("\n")[0]}`);
      if (dialog.type() === "prompt") {
        const reply =
          promptIdx === 0 ? "DELETE" : "per-row hard-delete spec reason";
        promptIdx += 1;
        await dialog.accept(reply);
      } else {
        await dialog.accept();
      }
    });

    await page.goto("/admin/3d-assets", { waitUntil: "domcontentloaded" });

    const target = SEED_ORPHANS[1];
    await expect(page.getByTestId(`row-orphan-${target.id}`)).toBeVisible();
    await page.getByTestId(`button-orphan-hard-delete-${target.id}`).click();

    const banner = page.getByTestId("text-orphan-action-result");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/^\s*failed\b/);
    await expect(banner).toContainText(
      /object bytes are present at storageKey/,
    );
    await expect(banner).toContainText(target.id);

    // Two prompts: typed DELETE then reason.
    expect(dialogMessages.length).toBe(2);
    expect(dialogMessages[0]).toMatch(/^\[prompt\]/);
    expect(dialogMessages[1]).toMatch(/^\[prompt\]/);

    // Exactly one reconcile call, action=hard_delete, with trimmed reason.
    expect(reconcilePayloads.length).toBe(1);
    expect(reconcilePayloads[0].url).toContain(`/${target.id}/reconcile`);
    expect(reconcilePayloads[0].body).toMatchObject({
      action: "hard_delete",
      confirm: true,
      reason: "per-row hard-delete spec reason",
    });
  });

  test("per-row Hard-delete: empty reason is rejected with an alert and no request is sent", async ({
    page,
  }) => {
    const orphans = [...SEED_ORPHANS];
    await setupBaseRoutes(page, () => orphans);

    const reconcileRequests: Request[] = [];
    await page.route(
      "**/api/admin/production-assets/*/reconcile",
      async (route: Route) => {
        reconcileRequests.push(route.request());
        // Should never be reached in this test — if it is, fail loudly.
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "unexpected reconcile request",
          }),
        });
      },
    );

    const dialogMessages: string[] = [];
    let promptIdx = 0;
    page.on("dialog", async (dialog) => {
      dialogMessages.push(`[${dialog.type()}] ${dialog.message().split("\n")[0]}`);
      if (dialog.type() === "prompt") {
        // First prompt: typed DELETE confirmation.
        // Second prompt: reason — reply with whitespace-only to trigger
        // the empty-reason guard.
        const reply = promptIdx === 0 ? "DELETE" : "   ";
        promptIdx += 1;
        await dialog.accept(reply);
      } else {
        // The empty-reason guard fires alert("A non-empty reason is required.")
        await dialog.accept();
      }
    });

    await page.goto("/admin/3d-assets", { waitUntil: "domcontentloaded" });

    const target = SEED_ORPHANS[0];
    await expect(page.getByTestId(`row-orphan-${target.id}`)).toBeVisible();
    await page.getByTestId(`button-orphan-hard-delete-${target.id}`).click();

    // Wait for the dialog sequence to drain: typed-DELETE prompt,
    // reason prompt, alert about the empty reason.
    await expect.poll(() => dialogMessages.length).toBeGreaterThanOrEqual(3);

    expect(dialogMessages[0]).toMatch(/^\[prompt\]/);
    expect(dialogMessages[1]).toMatch(/^\[prompt\]/);
    expect(dialogMessages[2]).toMatch(/^\[alert\]/);
    expect(dialogMessages[2]).toMatch(/non-empty reason/i);

    // The empty-reason guard must short-circuit before any HTTP call.
    // Give the page a beat — if a request were going to fire, it would by now.
    await page.waitForTimeout(250);
    expect(reconcileRequests.length).toBe(0);

    // No lastResult banner should have been rendered.
    await expect(page.getByTestId("text-orphan-action-result")).toHaveCount(0);

    // The row + buttons must remain interactive (no stuck pending state).
    await expect(
      page.getByTestId(`button-orphan-relink-${target.id}`),
    ).toBeEnabled();
    await expect(
      page.getByTestId(`button-orphan-hard-delete-${target.id}`),
    ).toBeEnabled();
  });
});
