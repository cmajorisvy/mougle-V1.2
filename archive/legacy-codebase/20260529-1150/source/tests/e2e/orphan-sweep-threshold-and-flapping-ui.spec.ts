/**
 * Task #808 — Browser-level UI test for the OrphanReconcilePanel sweep-status
 * card: editable alert threshold (`saveThreshold`) and the flapping-detected
 * banner driven by `sweepStatus.flapping`.
 *
 * Route-layer tests of the underlying API exist, but no browser-level test
 * covers:
 *   - the flapping banner appearing with the expected count + window copy,
 *   - the Save button being disabled while the draft equals the server value,
 *   - the threshold POST body, the success message, and the Save button
 *     re-disabling once the draft equals the new server value.
 *
 * A refactor of the threshold validation, the disabled-when-unchanged Save
 * button, or the banner conditional could regress silently without this spec.
 */

import { test, expect, type Route } from "@playwright/test";

const SWEEP_STATUS_URL = "**/api/admin/production-assets/orphan-sweep/status";
const THRESHOLD_URL =
  "**/api/admin/production-assets/orphan-sweep/threshold";

type SweepStatus = {
  lastScanAt: number | null;
  lastOrphanCount: number | null;
  threshold: number;
  wasAboveThreshold: boolean;
  nextScanAt: number | null;
  intervalMs: number | null;
  lastAutoResolvedAt: number | null;
  lastAutoResolvedCount: number | null;
  flapping: boolean;
  flappingCount: number;
  flappingWindowMs: number;
  flappingThreshold: number;
};

function makeStatus(overrides: Partial<SweepStatus> = {}): SweepStatus {
  return {
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
    ...overrides,
  };
}

test.describe("Task #808 — orphan-sweep threshold save + flapping banner UI", () => {
  test("flapping banner renders, Save toggles disabled state, POST body + success message verified", async ({
    page,
  }) => {
    // Mutable sweep status so the post-save refetch returns the new threshold.
    let currentStatus: SweepStatus = makeStatus({
      threshold: 5,
      flapping: true,
      flappingCount: 4,
      flappingWindowMs: 60 * 60 * 1000, // 1h -> "1h"
      flappingThreshold: 3,
    });

    // Capture the threshold POST body for assertion.
    const thresholdPosts: Array<{ method: string; body: unknown }> = [];
    // Hit counters so we can defend against silent shadowing by catch-alls.
    let sweepStatusHits = 0;
    let orphansListHits = 0;

    // NOTE on route order: Playwright tries matching routes in REVERSE
    // registration order (most recently registered first), and a handler only
    // falls through if it calls `route.fallback()`. So we register the broad
    // catch-alls FIRST and the specific stubs LAST — the specific stubs then
    // win the match and never get shadowed.

    // Broad catch-all (registered first → matched last). Returns a neutral
    // 200 so the AssetLibraryList shell + any sibling cards don't redirect or
    // throw. Specific stubs below shadow this for the endpoints we care about.
    await page.route("**/api/admin/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // production-assets fallback — empty list payload for any
    // /api/admin/production-assets* URL not handled by a more specific stub.
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

    // CSRF — apiRequest fetches this before any POST.
    await page.route("**/api/auth/csrf-token", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ csrfToken: "test-csrf-token" }),
      });
    });

    // Orphans list — empty is fine, the panel still renders the sweep card.
    await page.route(
      "**/api/admin/production-assets/orphans/list",
      async (route: Route) => {
        orphansListHits += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, items: [] }),
        });
      },
    );

    // Threshold POST — capture body, mutate status, echo new threshold.
    await page.route(THRESHOLD_URL, async (route: Route) => {
      const req = route.request();
      let parsed: unknown = null;
      try {
        parsed = req.postDataJSON();
      } catch {
        parsed = req.postData();
      }
      thresholdPosts.push({ method: req.method(), body: parsed });
      const next = (parsed as { threshold?: number } | null)?.threshold ?? 0;
      currentStatus = { ...currentStatus, threshold: next };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, threshold: next }),
      });
    });

    // Sweep status — returns the current mutable status. Registered LAST so
    // it wins the match over any catch-all registered above.
    await page.route(SWEEP_STATUS_URL, async (route: Route) => {
      sweepStatusHits += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: currentStatus }),
      });
    });

    await page.goto("/admin/3d-assets", { waitUntil: "domcontentloaded" });

    // The orphan card mounts, sweep status card visible.
    await expect(page.getByTestId("card-orphan-reconcile")).toBeVisible();
    await expect(page.getByTestId("card-orphan-sweep-status")).toBeVisible();

    // Flapping banner renders with the expected count + window copy.
    const banner = page.getByTestId("banner-sweep-flapping");
    await expect(banner).toBeVisible();
    await expect(
      page.getByTestId("text-orphan-sweep-flapping-title"),
    ).toHaveText(/Sweep is flapping/i);
    await expect(page.getByTestId("text-sweep-flapping-count")).toHaveText("4");
    await expect(page.getByTestId("text-sweep-flapping-window")).toHaveText(
      "1h",
    );
    await expect(page.getByTestId("text-sweep-flapping-threshold")).toHaveText(
      "3",
    );
    // The stable banner must NOT also render while flapping is true.
    await expect(page.getByTestId("banner-sweep-stable")).toHaveCount(0);

    // Save button is disabled when draft equals server value (5 === 5).
    const input = page.getByTestId("input-orphan-sweep-threshold");
    const saveBtn = page.getByTestId("button-orphan-sweep-threshold-save");
    await expect(input).toHaveValue("5");
    await expect(saveBtn).toBeDisabled();

    // Editing the draft re-enables the Save button.
    await input.fill("12");
    await expect(saveBtn).toBeEnabled();

    // Click Save — the POST fires and the panel invalidates + refetches status.
    await saveBtn.click();

    // Success message rendered, mentioning the new threshold.
    await expect(
      page.getByTestId("text-orphan-sweep-threshold-msg"),
    ).toHaveText(/Saved \(threshold = 12\)\./);

    // POST body verified: exactly { threshold: 12 } via POST.
    expect(thresholdPosts.length).toBeGreaterThanOrEqual(1);
    const lastPost = thresholdPosts[thresholdPosts.length - 1];
    expect(lastPost.method).toBe("POST");
    expect(lastPost.body).toEqual({ threshold: 12 });

    // After the refetch the server value is now 12; draft still 12, so Save
    // re-disables.
    await expect(saveBtn).toBeDisabled();

    // Editing again re-enables (sanity check the disabled state is reactive).
    await input.fill("13");
    await expect(saveBtn).toBeEnabled();

    // And reverting back to the new server value disables it again without
    // requiring another save.
    await input.fill("12");
    await expect(saveBtn).toBeDisabled();

    // Hardening: prove the specific stubs actually fired and weren't shadowed
    // by the catch-alls. If a future refactor reorders the route handlers and
    // the catch-all starts swallowing these endpoints, the assertions above
    // could pass on a degenerate empty payload — these counters fail loudly.
    expect(sweepStatusHits, "sweep-status stub must have been hit").toBeGreaterThan(0);
    expect(orphansListHits, "orphans/list stub must have been hit").toBeGreaterThan(0);
  });
});
