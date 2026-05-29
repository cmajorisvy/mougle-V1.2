/**
 * Task #846 — Browser-level UI test for the Task #839 flapping-config history
 * card on OrphanReconcilePanel.
 *
 * The card with `data-testid=card-flap-config-history-audit` is fed by
 * `GET /api/admin/production-assets/orphans/sweep/flapping/config-history`
 * with a `limit` query param sourced from a `<select>` of 10 / 25 / 50.
 *
 * Route-layer tests pin the server contract, but no browser test covers:
 *   - the card actually mounting on /admin/3d-assets,
 *   - the limit `<select>` re-issuing the request with the new `?limit=N`,
 *   - rows from the response rendering inside `list-flap-config-history-audit`.
 *
 * A regression that empties the list, swaps the query param name, or drops
 * the card entirely would only be caught by manual review without this spec.
 */

import { test, expect, type Route } from "@playwright/test";

type FlapHistoryAuditItem = {
  id: string;
  occurredAt: string;
  updatedBy: string | null;
  action: "updated" | "restored_default";
  previousConfig: {
    flappingThreshold: number;
    flappingWindowMs: number;
  } | null;
  newConfig: {
    flappingThreshold: number;
    flappingWindowMs: number;
  } | null;
  changedFields: Array<"flappingThreshold" | "flappingWindowMs">;
};

const HISTORY_AUDIT_URL =
  "**/api/admin/production-assets/orphans/sweep/flapping/config-history*";

function makeRow(overrides: Partial<FlapHistoryAuditItem> = {}): FlapHistoryAuditItem {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    occurredAt: "2026-05-22T12:00:00.000Z",
    updatedBy: "root-admin",
    action: "updated",
    previousConfig: { flappingThreshold: 3, flappingWindowMs: 60 * 60 * 1000 },
    newConfig: { flappingThreshold: 4, flappingWindowMs: 60 * 60 * 1000 },
    changedFields: ["flappingThreshold"],
    ...overrides,
  };
}

test.describe("Task #846 — flapping-config history audit card UI", () => {
  test("card mounts, list renders, limit selector re-issues request with new ?limit", async ({
    page,
  }) => {
    // Capture every history-audit request so we can assert the `limit` query
    // param changes when the <select> changes.
    const historyRequests: Array<{ url: string; limit: string | null }> = [];

    // NOTE on route order: Playwright matches in REVERSE registration order
    // and falls through only via `route.fallback()`. Register the broad
    // catch-alls FIRST so the specific stubs LAST shadow them.

    // (a) Broadest admin catch-all — neutral 200 so the AssetLibraryList shell
    //     + sibling cards don't redirect or throw.
    await page.route("**/api/admin/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // (b) production-assets fallback — empty list payload for any
    //     /api/admin/production-assets* URL not handled by a more specific stub.
    await page.route(
      "**/api/admin/production-assets**",
      async (route: Route) => {
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

    // (c) CSRF — apiRequest fetches this before any mutating request.
    await page.route("**/api/auth/csrf-token", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ csrfToken: "test-csrf-token" }),
      });
    });

    // (d) Sweep status — minimal payload the panel reads.
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

    // (e) Orphans list — empty so we don't have to stub per-row endpoints.
    await page.route(
      "**/api/admin/production-assets/orphans/list",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, items: [] }),
        });
      },
    );

    // (f) History audit endpoint — capture the `limit` query param + echo a
    //     row whose `id` we can assert on.
    const row = makeRow();
    await page.route(HISTORY_AUDIT_URL, async (route: Route) => {
      const u = new URL(route.request().url());
      historyRequests.push({
        url: u.pathname + u.search,
        limit: u.searchParams.get("limit"),
      });
      const limit = Number(u.searchParams.get("limit") ?? "10");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, items: [row], limit }),
      });
    });

    await page.goto("/admin/3d-assets", { waitUntil: "domcontentloaded" });

    // The orphan card + the new history-audit card both mount.
    await expect(page.getByTestId("card-orphan-reconcile")).toBeVisible();
    const card = page.getByTestId("card-flap-config-history-audit");
    await expect(card).toBeVisible();

    // First request used the default limit of 10.
    await expect.poll(() => historyRequests.length).toBeGreaterThanOrEqual(1);
    expect(historyRequests[0].limit).toBe("10");

    // The seeded row renders inside the audit list.
    await expect(page.getByTestId("list-flap-config-history-audit")).toBeVisible();
    await expect(
      page.getByTestId(`flap-config-history-audit-row-${row.id}`),
    ).toBeVisible();

    // Change the limit selector — the panel must re-issue the request with the
    // new `limit` query param.
    const select = page.getByTestId("select-flap-config-history-audit-limit");
    await expect(select).toHaveValue("10");
    const beforeCount = historyRequests.length;
    await select.selectOption("25");
    await expect
      .poll(() => historyRequests.length, {
        message: "history-audit request must re-fire after limit change",
      })
      .toBeGreaterThan(beforeCount);
    expect(historyRequests[historyRequests.length - 1].limit).toBe("25");

    // And a second change to 50 fires another request.
    const beforeCount2 = historyRequests.length;
    await select.selectOption("50");
    await expect
      .poll(() => historyRequests.length)
      .toBeGreaterThan(beforeCount2);
    expect(historyRequests[historyRequests.length - 1].limit).toBe("50");
  });
});
