/**
 * Task #820 — Browser-level UI tests for the cover-sweep and media-sweep
 * flapping tuning panels added in Task #811.
 *
 * Verifies for each panel:
 *  - Inputs render with values seeded from `sweepStatus.flappingThreshold` /
 *    `flappingWindowMs` (mirroring `getSweepStatus()` shape).
 *  - Save buttons fire the expected PATCH against the right URL with the
 *    expected body.
 *  - After the save round-trip, the panel re-fetches status and the badge
 *    next to the input ("Current: N") reflects the new server value.
 *
 * Route-layer tests cover the API surface; this spec catches regressions
 * to the panel wiring (wrong URL, wrong body shape, missing refetch,
 * stale displayed value).
 */

import { test, expect, type Route } from "@playwright/test";

type SweepStatus = {
  lastScanAt: number | null;
  lastOrphanCount: number | null;
  lastOrphanBytes?: number | null;
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
  auditMaxBytes: number;
  auditMaxArchives: number;
  auditMaxBytesSource: "db" | "env" | "default";
  auditMaxArchivesSource: "db" | "env" | "default";
  auditLimits: {
    bytesMin: number;
    bytesMax: number;
    archivesMin: number;
    archivesMax: number;
    bytesDefault: number;
    archivesDefault: number;
  };
};

function makeStatus(overrides: Partial<SweepStatus> = {}): SweepStatus {
  return {
    lastScanAt: null,
    lastOrphanCount: 0,
    lastOrphanBytes: 0,
    threshold: 25,
    wasAboveThreshold: false,
    nextScanAt: null,
    intervalMs: null,
    lastAutoResolvedAt: null,
    lastAutoResolvedCount: null,
    flapping: false,
    flappingCount: 0,
    flappingWindowMs: 60 * 60 * 1000, // 1h
    flappingThreshold: 3,
    auditMaxBytes: 1024 * 1024,
    auditMaxArchives: 4,
    auditMaxBytesSource: "default",
    auditMaxArchivesSource: "default",
    auditLimits: {
      bytesMin: 64 * 1024,
      bytesMax: 100 * 1024 * 1024,
      archivesMin: 1,
      archivesMax: 100,
      bytesDefault: 1024 * 1024,
      archivesDefault: 4,
    },
    ...overrides,
  };
}

async function installCommonStubs(page: import("@playwright/test").Page) {
  // Broad fallbacks so unrelated panel API calls don't 404 / throw.
  await page.route("**/api/admin/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route("**/api/auth/csrf-token", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "test-csrf-token" }),
    });
  });
}

test.describe("Task #820 — cover/media sweep flapping tuning UI", () => {
  test("cover-sweep panel reflects status and PATCHes new flapping threshold", async ({
    page,
  }) => {
    let currentStatus: SweepStatus = makeStatus({
      flappingThreshold: 3,
      flappingWindowMs: 60 * 60 * 1000,
    });
    const patches: Array<{ url: string; body: unknown }> = [];
    let statusHits = 0;

    await installCommonStubs(page);

    await page.route(
      "**/api/admin/broadcasts/covers/sweep/flapping-threshold",
      async (route: Route) => {
        const req = route.request();
        let parsed: any = null;
        try {
          parsed = req.postDataJSON();
        } catch {
          parsed = req.postData();
        }
        patches.push({ url: req.url(), body: parsed });
        const next = Number(parsed?.value ?? 0);
        currentStatus = { ...currentStatus, flappingThreshold: next };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            value: next,
            status: currentStatus,
          }),
        });
      },
    );
    await page.route(
      "**/api/admin/broadcasts/covers/sweep/flapping-window-ms",
      async (route: Route) => {
        const req = route.request();
        let parsed: any = null;
        try {
          parsed = req.postDataJSON();
        } catch {
          parsed = req.postData();
        }
        patches.push({ url: req.url(), body: parsed });
        const next = Number(parsed?.value ?? 0);
        currentStatus = { ...currentStatus, flappingWindowMs: next };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            value: next,
            status: currentStatus,
          }),
        });
      },
    );
    await page.route(
      "**/api/admin/broadcasts/covers/sweep/status",
      async (route: Route) => {
        statusHits += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: currentStatus }),
        });
      },
    );

    await page.goto("/admin/production-house", { waitUntil: "domcontentloaded" });
    await page.getByTestId("nav-cover-sweep").click();

    const thresholdInput = page.getByTestId(
      "input-cover-sweep-flapping-threshold",
    );
    const thresholdSave = page.getByTestId(
      "button-cover-sweep-flapping-threshold-save",
    );
    const currentLabel = page.getByTestId(
      "text-cover-sweep-flapping-threshold-current",
    );

    await expect(thresholdInput).toHaveValue("3");
    await expect(currentLabel).toHaveText("3");
    await expect(thresholdSave).toBeDisabled();

    await thresholdInput.fill("5");
    await expect(thresholdSave).toBeEnabled();
    await thresholdSave.click();

    await expect(currentLabel).toHaveText("5");
    await expect(thresholdSave).toBeDisabled();

    const windowInput = page.getByTestId(
      "input-cover-sweep-flapping-window-minutes",
    );
    const windowSave = page.getByTestId(
      "button-cover-sweep-flapping-window-save",
    );

    // 60 min → 1h default
    await expect(windowInput).toHaveValue("60");
    await windowInput.fill("120");
    await expect(windowSave).toBeEnabled();
    await windowSave.click();

    // After save the displayed status should reflect 120 min == 7200000ms.
    await expect(windowInput).toHaveValue("120");

    // Assert the captured PATCH bodies.
    const thresholdPatch = patches.find((p) =>
      p.url.endsWith("/flapping-threshold"),
    );
    const windowPatch = patches.find((p) =>
      p.url.endsWith("/flapping-window-ms"),
    );
    expect(thresholdPatch).toBeTruthy();
    expect(windowPatch).toBeTruthy();
    expect(thresholdPatch!.body).toEqual({ value: 5 });
    expect(windowPatch!.body).toEqual({ value: 120 * 60_000 });
    expect(statusHits, "status endpoint must have been hit").toBeGreaterThan(0);
  });

  test("media-sweep panel reflects status and PATCHes new flapping threshold + window", async ({
    page,
  }) => {
    let currentStatus: SweepStatus = makeStatus({
      flappingThreshold: 3,
      flappingWindowMs: 60 * 60 * 1000, // 1h
    });
    const patches: Array<{ url: string; body: unknown }> = [];
    let statusHits = 0;

    await installCommonStubs(page);

    await page.route(
      "**/api/admin/broadcasts/media/sweep/flapping-threshold",
      async (route: Route) => {
        const req = route.request();
        let parsed: any = null;
        try {
          parsed = req.postDataJSON();
        } catch {
          parsed = req.postData();
        }
        patches.push({ url: req.url(), body: parsed });
        const next = Number(parsed?.value ?? 0);
        currentStatus = { ...currentStatus, flappingThreshold: next };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            value: next,
            status: currentStatus,
          }),
        });
      },
    );
    await page.route(
      "**/api/admin/broadcasts/media/sweep/flapping-window-ms",
      async (route: Route) => {
        const req = route.request();
        let parsed: any = null;
        try {
          parsed = req.postDataJSON();
        } catch {
          parsed = req.postData();
        }
        patches.push({ url: req.url(), body: parsed });
        const next = Number(parsed?.value ?? 0);
        currentStatus = { ...currentStatus, flappingWindowMs: next };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            value: next,
            status: currentStatus,
          }),
        });
      },
    );
    await page.route(
      "**/api/admin/broadcasts/media/sweep/status",
      async (route: Route) => {
        statusHits += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: currentStatus }),
        });
      },
    );

    await page.goto("/admin/production-house", { waitUntil: "domcontentloaded" });
    await page.getByTestId("nav-media-sweep").click();

    const thresholdInput = page.getByTestId(
      "input-media-sweep-flap-threshold",
    );
    const thresholdSave = page.getByTestId(
      "button-media-sweep-flap-threshold-save",
    );

    await expect(thresholdInput).toHaveValue("3");
    await expect(thresholdSave).toBeDisabled();

    await thresholdInput.fill("7");
    await expect(thresholdSave).toBeEnabled();
    await thresholdSave.click();
    await expect(
      page.getByTestId("text-media-sweep-flap-threshold-msg"),
    ).toHaveText(/Saved \(flapping threshold = 7\)/);
    await expect(thresholdSave).toBeDisabled();

    const windowInput = page.getByTestId("input-media-sweep-flap-window");
    const windowSave = page.getByTestId("button-media-sweep-flap-window-save");

    // 1h default value shown as "1.00" (toFixed(2) in current label) — the
    // input itself was seeded to the same hours number; assert it loaded.
    await expect(windowInput).toHaveValue(/^1(\.0+)?$/);
    await windowInput.fill("2");
    await windowSave.click();
    await expect(
      page.getByTestId("text-media-sweep-flap-window-msg"),
    ).toHaveText(/Saved \(flapping window = 2h\)/);

    const thresholdPatch = patches.find((p) =>
      p.url.endsWith("/flapping-threshold"),
    );
    const windowPatch = patches.find((p) =>
      p.url.endsWith("/flapping-window-ms"),
    );
    expect(thresholdPatch).toBeTruthy();
    expect(windowPatch).toBeTruthy();
    expect(thresholdPatch!.body).toEqual({ value: 7 });
    expect(windowPatch!.body).toEqual({ value: 2 * 60 * 60 * 1000 });
    expect(statusHits, "status endpoint must have been hit").toBeGreaterThan(0);
  });
});
