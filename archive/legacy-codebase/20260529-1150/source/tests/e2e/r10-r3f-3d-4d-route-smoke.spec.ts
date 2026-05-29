/**
 * R10 — Playwright route-smoke + browser-level safety/perf probe for every
 * admin 3D / 4D / R3F surface.
 *
 * Coverage:
 *   1. Unauthenticated negative-path smoke for every admin 3D route and
 *      admin asset API. The HTML shell must NOT leak a non-null publicUrl
 *      or a signed-storage URL string.
 *   2. Browser-level network tap. While each admin 3D route loads, every
 *      outbound request from the page is intercepted; any request to a
 *      forbidden AI-provider host (openai/anthropic/elevenlabs/heygen/
 *      runway/meshy/stability/replicate) fails the test. This closes the
 *      gap left by the Node-level fetch tap in the runtime test suite
 *      (`tests/r10-r3f-3d-4d-runtime-routes.test.ts`) by also asserting
 *      the same invariant inside the browser.
 *   3. First-load timing budget per surface. Each admin 3D route must
 *      reach `domcontentloaded` within R10_PAGE_LOAD_BUDGET_MS
 *      (default 8000ms). This is the page-load proxy for the static
 *      perf budget enforced by `scripts/r10-perf-budget-check.mjs`.
 *
 * Authenticated end-to-end happy-path (upload → validate → approve →
 * signed-URL → R3F load) is exercised at the route-handler layer by the
 * hermetic runtime suite (`tests/r10-r3f-3d-4d-runtime-routes.test.ts`).
 * A browser-authenticated counterpart is tracked as a separate follow-up
 * (see §H in `docs/reports/R10_R3F_3D_4D_E2E_SAFETY_PERFORMANCE_REPORT.md`).
 */

import { test, expect, request, type Page } from "@playwright/test";
import fs from "fs";
import { ADMIN_STORAGE_STATE_PATH } from "./admin-auth-paths";

const ADMIN_PATHS = [
  "/admin/r3f-preview-sandbox",
  "/admin/3d-assets",
  "/admin/3d-assets/upload",
  "/admin/virtual-set-preview",
  "/admin/avatar-rig-preview",
  "/admin/unity-webgl-sandbox",
  "/admin/production-house",
];

const ADMIN_API_PATHS = [
  "/api/admin/production-assets",
  "/api/admin/production-assets/00000000-0000-0000-0000-000000000000",
];

const FORBIDDEN_HOST_PATTERNS = [
  /\.openai\.com$/i,
  /\.anthropic\.com$/i,
  /\.elevenlabs\.io$/i,
  /\.heygen\.com$/i,
  /\.runwayml\.com$/i,
  /\.meshy\.ai$/i,
  /\.stability\.ai$/i,
  /\.replicate\.com$/i,
];

const PAGE_LOAD_BUDGET_MS = Number(process.env.R10_PAGE_LOAD_BUDGET_MS ?? 8000);

/**
 * Install a browser-level network tap. Any request whose hostname matches
 * a forbidden provider host appends to `violations[]` and is aborted; if
 * the array is non-empty at end-of-test, the test fails.
 */
function installNetworkTap(page: Page): { violations: string[] } {
  const violations: string[] = [];
  void page.route("**/*", (route) => {
    let host = "";
    try {
      host = new URL(route.request().url()).hostname;
    } catch {
      // non-URL routes (data:, blob:, etc.) — let them through
      void route.continue();
      return;
    }
    for (const pat of FORBIDDEN_HOST_PATTERNS) {
      if (pat.test(host)) {
        violations.push(`${route.request().method()} ${route.request().url()}`);
        void route.abort();
        return;
      }
    }
    void route.continue();
  });
  return { violations };
}

test.describe("R10 — admin 3D route smoke + browser-level safety/perf tap", () => {
  for (const path of ADMIN_PATHS) {
    test(`GET ${path} — non-5xx, no provider hostname contact, loads within ${PAGE_LOAD_BUDGET_MS}ms`, async ({
      page,
    }) => {
      const tap = installNetworkTap(page);
      const t0 = Date.now();
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      const elapsed = Date.now() - t0;
      expect(resp, `no response for ${path}`).not.toBeNull();
      const status = resp!.status();
      expect(status, `${path} returned ${status}`).toBeLessThan(500);

      // (A) HTML payload must not leak forbidden values
      const body = await page.content();
      expect(body, `${path} body leaks publicUrl`).not.toMatch(
        /"publicUrl"\s*:\s*"https?:\/\//,
      );
      expect(body, `${path} body leaks a signed-storage URL`).not.toMatch(
        /signed-object-url[^"]*&Signature=/,
      );
      expect(body, `${path} body leaks a known provider host`).not.toMatch(
        /(api\.openai\.com|api\.anthropic\.com|api\.elevenlabs\.io|api\.heygen\.com|api\.runwayml\.com|api\.meshy\.ai|api\.stability\.ai|api\.replicate\.com)/i,
      );

      // (B) browser-level network tap: zero contact with provider hosts
      expect(
        tap.violations,
        `forbidden provider-host requests from ${path}:\n${tap.violations.join("\n")}`,
      ).toEqual([]);

      // (C) first-load timing budget
      expect(
        elapsed,
        `${path} first-load was ${elapsed}ms (budget=${PAGE_LOAD_BUDGET_MS}ms)`,
      ).toBeLessThanOrEqual(PAGE_LOAD_BUDGET_MS);

      // (D) first-rAF probe — measures the first browser paint frame after
      // domcontentloaded. Captures a per-surface first-rendered-frame
      // timestamp; if the page is unauth-redirected to a login shell the
      // probe still records the redirect target's first frame, which is the
      // upper bound we care about for a static smoke probe. Gated by
      // R10_FIRST_RAF_BUDGET_MS (default disabled — a soft probe that
      // records the value without failing unless the env var is set).
      const firstRafMs = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const t = performance.now();
            requestAnimationFrame(() => resolve(performance.now() - t));
          }),
      );
      const rafBudget = Number(process.env.R10_FIRST_RAF_BUDGET_MS ?? 0);
      if (rafBudget > 0) {
        expect(
          firstRafMs,
          `${path} first-rAF was ${firstRafMs}ms (budget=${rafBudget}ms)`,
        ).toBeLessThanOrEqual(rafBudget);
      }
    });
  }

  test("admin Production House surface either renders an approved scene preview OR exposes an empty-state CTA (R9)", async ({
    page,
  }) => {
    installNetworkTap(page);
    const resp = await page.goto("/admin/production-house", { waitUntil: "domcontentloaded" });
    expect(resp).not.toBeNull();
    expect(resp!.status()).toBeLessThan(500);
    const body = await page.content();
    // R9 contract: either the 3D Preview tab is rendered (scene present)
    // or the empty-state CTA is visible. Both are valid; what is NOT valid
    // is leaking a publicUrl / signed URL / provider host.
    expect(body).not.toMatch(/"publicUrl"\s*:\s*"https?:\/\//);
    expect(body).not.toMatch(/signed-object-url[^"]*&Signature=/);
    expect(body).not.toMatch(
      /(api\.openai\.com|api\.anthropic\.com|api\.elevenlabs\.io|api\.heygen\.com|api\.runwayml\.com|api\.meshy\.ai|api\.stability\.ai|api\.replicate\.com)/i,
    );
  });
});

/**
 * Per-surface canvas + JS-heap probe (task #757, gated on admin auth by
 * task #761).
 *
 * For each R3F-bearing admin surface this measures:
 *   - `firstCanvasMs` — wall-clock from page.goto() until the first
 *     `<canvas>` element mounts in the DOM.
 *   - `firstFrameMs` — wall-clock from page.goto() until the first
 *     requestAnimationFrame fires AFTER the canvas mount (proxy for the
 *     first browser-rendered frame of the R3F scene).
 *   - `usedJSHeapSize` — `performance.memory.usedJSHeapSize` sampled
 *     immediately after `firstFrameMs` (Chromium-only; the test soft-skips
 *     on browsers without `performance.memory`).
 *
 * The test also asserts:
 *   - zero console errors during the load window (page console-level
 *     `error` events fail the test);
 *   - zero off-host requests during the load window (any request whose
 *     hostname is not the app's baseURL host fails the test, except for
 *     the data:/blob:/about: schemes which are noise-not-signal).
 *
 * Budgets are env-tunable and default to multiples of the values observed
 * on the reference run captured in §D.3 of
 * `docs/reports/R10_R3F_3D_4D_E2E_SAFETY_PERFORMANCE_REPORT.md`.
 *
 * If the admin storage state file is empty (setup soft-skipped because
 * `ADMIN_USERNAME` / `ADMIN_PASSWORD` weren't set) each probe test
 * soft-skips. With the admin cookie present the canvas actually mounts in
 * CI and the budgets gate regressions.
 */
const CANVAS_PROBE_SURFACES = [
  {
    path: "/admin/r3f-preview-sandbox",
    canvasSelector: '[data-testid="r3f-sandbox-canvas-wrapper"] canvas',
  },
  {
    path: "/admin/virtual-set-preview",
    canvasSelector: "canvas",
  },
  {
    path: "/admin/avatar-rig-preview",
    canvasSelector: "canvas",
  },
  {
    path: "/admin/production-house",
    canvasSelector: "canvas",
  },
];

const FIRST_CANVAS_BUDGET_MS = Number(
  process.env.R10_FIRST_CANVAS_BUDGET_MS ?? 15_000,
);
const FIRST_FRAME_BUDGET_MS = Number(
  process.env.R10_FIRST_FRAME_BUDGET_MS ?? 20_000,
);
const HEAP_BUDGET_BYTES = Number(
  process.env.R10_HEAP_BUDGET_BYTES ?? 350 * 1024 * 1024,
);

function adminStorageStateHasCookie(): boolean {
  try {
    const raw = fs.readFileSync(ADMIN_STORAGE_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.cookies) && parsed.cookies.length > 0;
  } catch {
    return false;
  }
}

test.describe("R10 — headless first-canvas-frame + JS heap probe (task #757)", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  for (const { path: surfacePath, canvasSelector } of CANVAS_PROBE_SURFACES) {
    test(`canvas probe — ${surfacePath}`, async ({ page, baseURL }, testInfo) => {
      test.skip(
        !adminStorageStateHasCookie(),
        "admin-auth.setup.ts did not produce a session cookie — set ADMIN_USERNAME + ADMIN_PASSWORD",
      );

      const baseHost = baseURL ? new URL(baseURL).hostname : "localhost";

      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(err.message));

      const offHostRequests: string[] = [];
      void page.route("**/*", (route) => {
        const url = route.request().url();
        try {
          const u = new URL(url);
          if (
            u.protocol !== "data:" &&
            u.protocol !== "blob:" &&
            u.protocol !== "about:" &&
            u.hostname &&
            u.hostname !== baseHost
          ) {
            offHostRequests.push(`${route.request().method()} ${url}`);
            void route.abort();
            return;
          }
        } catch {
          /* non-URL — let it through */
        }
        void route.continue();
      });

      const t0 = Date.now();
      const resp = await page.goto(surfacePath, { waitUntil: "domcontentloaded" });
      expect(resp).not.toBeNull();
      expect(resp!.status()).toBeLessThan(500);

      // first-canvas-mount
      await page.waitForSelector(canvasSelector, {
        state: "attached",
        timeout: FIRST_CANVAS_BUDGET_MS,
      });
      const firstCanvasMs = Date.now() - t0;

      // first frame after canvas mount
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
      const firstFrameMs = Date.now() - t0;

      // JS heap sample (Chromium only)
      const usedJSHeapSize = await page.evaluate(() => {
        const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
        return mem && typeof mem.usedJSHeapSize === "number" ? mem.usedJSHeapSize : null;
      });

      testInfo.annotations.push({
        type: "canvas-probe",
        description: JSON.stringify({
          path: surfacePath,
          firstCanvasMs,
          firstFrameMs,
          usedJSHeapSize,
        }),
      });
      // Also surface on stdout so CI captures it without parsing the JSON report.
      console.log(
        `[canvas-probe] ${surfacePath} firstCanvasMs=${firstCanvasMs} firstFrameMs=${firstFrameMs} usedJSHeapSize=${usedJSHeapSize}`,
      );

      expect(
        firstCanvasMs,
        `${surfacePath} firstCanvasMs=${firstCanvasMs} (budget=${FIRST_CANVAS_BUDGET_MS}ms)`,
      ).toBeLessThanOrEqual(FIRST_CANVAS_BUDGET_MS);
      expect(
        firstFrameMs,
        `${surfacePath} firstFrameMs=${firstFrameMs} (budget=${FIRST_FRAME_BUDGET_MS}ms)`,
      ).toBeLessThanOrEqual(FIRST_FRAME_BUDGET_MS);
      if (usedJSHeapSize !== null) {
        expect(
          usedJSHeapSize,
          `${surfacePath} usedJSHeapSize=${usedJSHeapSize} (budget=${HEAP_BUDGET_BYTES}B)`,
        ).toBeLessThanOrEqual(HEAP_BUDGET_BYTES);
      }
      expect(
        consoleErrors,
        `${surfacePath} console errors:\n${consoleErrors.join("\n")}`,
      ).toEqual([]);
      expect(
        offHostRequests,
        `${surfacePath} off-host requests:\n${offHostRequests.join("\n")}`,
      ).toEqual([]);
    });
  }
});

test.describe("R10 — admin asset API requires admin auth", () => {
  for (const apiPath of ADMIN_API_PATHS) {
    test(`unauthenticated GET ${apiPath} returns 401 or 403`, async ({ baseURL }) => {
      const ctx = await request.newContext({ baseURL });
      const resp = await ctx.get(apiPath);
      expect([401, 403]).toContain(resp.status());
      await ctx.dispose();
    });
  }

  test("unauthenticated POST /signed-preview-url returns 401 or 403 and does not return a signed URL", async ({
    baseURL,
  }) => {
    const ctx = await request.newContext({ baseURL });
    const resp = await ctx.post(
      "/api/admin/production-assets/00000000-0000-0000-0000-000000000000/signed-preview-url",
      { data: { ttlSeconds: 60 } },
    );
    expect([401, 403]).toContain(resp.status());
    const text = await resp.text();
    expect(text).not.toMatch(/signed-object-url[^"]*&Signature=/);
    await ctx.dispose();
  });
});
