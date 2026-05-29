/**
 * Task #801 — Browser-level UI test for OrphanReconcilePanel.
 *
 * Task #796 added a route-level test that pins the bulk hard-delete contract
 * at the express-handler layer. This spec covers the React component itself
 * (`client/src/pages/admin/3d-assets/OrphanReconcilePanel.tsx`), which the
 * route-level test never touches. A future refactor of the panel could
 * regress the UI-only behavior — checkbox selection state, the per-row
 * Re-link / Hard-delete buttons being disabled mid-bulk-run, the bulk
 * results card rendering ok/failed badges, the confirm + reason prompt()
 * flow — without the existing test catching it.
 *
 * Strategy:
 *   - Stub every admin API the AssetLibraryList shell + the OrphanReconcilePanel
 *     hit (CSRF, sweep status, orphan list, list of assets, per-row reconcile).
 *   - Seed two orphans. Bulk-select them, click Hard-delete selected, accept
 *     the confirm + reason prompts.
 *   - While the bulk run is in flight (reconcile responses are gated by a
 *     deferred promise), assert per-row buttons are disabled.
 *   - Release the gate. One row resolves ok, the other failed. Assert the
 *     bulk results card renders one "ok" + one "failed" badge, and the
 *     succeeded row disappears from the table while the failed row remains.
 */

import { test, expect, type Route } from "@playwright/test";

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
    id: "11111111-1111-1111-1111-111111111111",
    name: "orphan-alpha.glb",
    storageKey: "production-assets/alpha.glb",
    byteSize: 1024 * 1024,
    sha256: "a".repeat(64),
    archivedAt: "2026-01-01T00:00:00.000Z",
    status: "archived",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "orphan-beta.glb",
    storageKey: "production-assets/beta.glb",
    byteSize: 2 * 1024 * 1024,
    sha256: "b".repeat(64),
    archivedAt: "2026-01-02T00:00:00.000Z",
    status: "archived",
  },
];

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test.describe("Task #801 — OrphanReconcilePanel UI", () => {
  test("bulk hard-delete: prompts honored, mid-run buttons disabled, results render, succeeded rows disappear", async ({
    page,
  }) => {
    // Mutable orphan store so the post-bulk re-fetch returns only the survivors.
    let currentOrphans: Orphan[] = [...SEED_ORPHANS];

    // Reconcile responses are gated so we can assert the "in flight" UI state.
    const gates = new Map<string, ReturnType<typeof defer<void>>>();
    SEED_ORPHANS.forEach((o) => gates.set(o.id, defer<void>()));

    // (1) CSRF — apiRequest fetches this before any POST.
    await page.route("**/api/auth/csrf-token", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ csrfToken: "test-csrf-token" }),
      });
    });

    // (2) Sweep status — minimal payload the panel reads.
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

    // (3) Orphans list — returns the current (mutable) store.
    await page.route(
      "**/api/admin/production-assets/orphans/list",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, items: currentOrphans }),
        });
      },
    );

    // (4) Per-id reconcile — gated; alpha succeeds, beta fails.
    await page.route(
      "**/api/admin/production-assets/*/reconcile",
      async (route: Route) => {
        const url = route.request().url();
        const m = url.match(
          /\/api\/admin\/production-assets\/([0-9a-f-]+)\/reconcile/i,
        );
        const id = m?.[1] ?? "";
        const gate = gates.get(id);
        if (gate) await gate.promise;
        if (id === SEED_ORPHANS[0].id) {
          // alpha succeeds — drop from the store so the refetch removes it.
          currentOrphans = currentOrphans.filter((o) => o.id !== id);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              result: { status: "hard_deleted" },
            }),
          });
        } else {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              ok: false,
              error: "object bytes are present at storageKey — refuse delete",
            }),
          });
        }
      },
    );

    // (5) Anything else the AssetLibraryList shell hits — return safe empty
    // payloads so the parent page renders without throwing.
    await page.route("**/api/admin/production-assets**", async (route: Route) => {
      const url = route.request().url();
      // Don't shadow the more specific routes above.
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
        body: JSON.stringify({ ok: true, items: [], total: 0, limit: 20, offset: 0 }),
      });
    });

    // (6) Anything else under /api/admin — 200 with empty JSON so the shell
    // doesn't redirect or throw.
    await page.route("**/api/admin/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // (7) Dialog handler — confirm prompt then reason prompt.
    const dialogTexts: string[] = [];
    let dialogIdx = 0;
    page.on("dialog", async (dialog) => {
      dialogTexts.push(`[${dialog.type()}] ${dialog.message().split("\n")[0]}`);
      // Two prompts in order: DELETE confirmation, then reason.
      if (dialog.type() === "prompt") {
        const reply = dialogIdx === 0 ? "DELETE" : "ui-spec hard-delete reason";
        dialogIdx += 1;
        await dialog.accept(reply);
      } else {
        await dialog.accept();
      }
    });

    await page.goto("/admin/3d-assets", { waitUntil: "domcontentloaded" });

    // The orphan card must mount with both seeded rows.
    await expect(page.getByTestId("card-orphan-reconcile")).toBeVisible();
    await expect(page.getByTestId("badge-orphan-count")).toHaveText(/2 orphans/);
    await expect(
      page.getByTestId(`row-orphan-${SEED_ORPHANS[0].id}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`row-orphan-${SEED_ORPHANS[1].id}`),
    ).toBeVisible();

    // Select both rows via the toolbar "Select all" button.
    await page.getByTestId("button-orphan-select-all").click();
    await expect(page.getByTestId("text-orphan-bulk-select-count")).toHaveText(
      /2 selected/,
    );

    // Click bulk Hard-delete. Two prompts fire; the dialog handler accepts.
    await page.getByTestId("button-orphan-bulk-hard-delete").click();

    // Mid-flight: the bulk button flips to its loading label and per-row
    // Re-link / Hard-delete buttons are disabled.
    await expect(page.getByTestId("button-orphan-bulk-hard-delete")).toHaveText(
      /Hard-deleting/,
    );
    for (const o of SEED_ORPHANS) {
      await expect(
        page.getByTestId(`button-orphan-relink-${o.id}`),
      ).toBeDisabled();
      await expect(
        page.getByTestId(`button-orphan-hard-delete-${o.id}`),
      ).toBeDisabled();
    }

    // Confirm both prompts were honored (typed reply + reason).
    expect(dialogTexts.length).toBeGreaterThanOrEqual(2);
    expect(dialogTexts[0]).toMatch(/^\[prompt\]/);
    expect(dialogTexts[1]).toMatch(/^\[prompt\]/);

    // Release the gates so each reconcile resolves.
    gates.get(SEED_ORPHANS[0].id)!.resolve();
    gates.get(SEED_ORPHANS[1].id)!.resolve();

    // Results card renders: 1 succeeded, 1 failed; ok + failed badges.
    const results = page.getByTestId("orphan-bulk-results");
    await expect(results).toBeVisible();
    await expect(
      page.getByTestId("text-orphan-bulk-results-summary"),
    ).toHaveText(/1 succeeded, 1 failed/);

    const alphaResult = page.getByTestId(
      `orphan-bulk-result-${SEED_ORPHANS[0].id}`,
    );
    const betaResult = page.getByTestId(
      `orphan-bulk-result-${SEED_ORPHANS[1].id}`,
    );
    await expect(alphaResult).toContainText(/^\s*ok\b/);
    await expect(betaResult).toContainText(/^\s*failed\b/);

    // Succeeded row disappears from the table; failed row remains and its
    // per-row buttons are re-enabled now that the bulk run is finished.
    await expect(
      page.getByTestId(`row-orphan-${SEED_ORPHANS[0].id}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`row-orphan-${SEED_ORPHANS[1].id}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`button-orphan-relink-${SEED_ORPHANS[1].id}`),
    ).toBeEnabled();
    await expect(
      page.getByTestId(`button-orphan-hard-delete-${SEED_ORPHANS[1].id}`),
    ).toBeEnabled();
    await expect(page.getByTestId("badge-orphan-count")).toHaveText(/1 orphan/);
  });
});
