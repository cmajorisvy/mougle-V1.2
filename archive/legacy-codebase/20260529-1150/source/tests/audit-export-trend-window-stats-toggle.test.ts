/**
 * Task #593 — verify the "Hide / Show window stats" toggle on the
 * audit-export trend card actually hides and re-shows the two window-stats
 * legend chips (`legend-trend-window-median` / `legend-trend-window-p95`).
 *
 * Mounts the real OmniChannelAudience admin page in jsdom with a stubbed
 * fetch + a QueryClient pre-seeded with trend data so the trend card
 * actually renders. Other queries on the page are allowed to fall through
 * to 404s — react-query won't retry, so they just stay in error/loading
 * state and the trend card still hydrates from the seeded cache.
 *
 * Asserts:
 *   1. Both window-stats legend chips are visible by default.
 *   2. Clicking `button-toggle-window-stats` hides both chips and flips
 *      the button label to "Show window stats".
 *   3. Clicking it again restores both chips and the original label.
 *   4. The static caption (`text-trend-stats-caption`) remains visible
 *      across both toggle states (it explains the legend in general).
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installJsdom } from "./_helpers/jsdom-env";

const jsdomHandle = installJsdom();
after(() => jsdomHandle.teardown());

const TREND_QUERY_URL =
  "/api/admin/newsroom/audience/export-log?limit=50&offset=0&sortBy=exportedAt&sortOrder=desc";

function installFetch() {
  (globalThis as any).fetch = async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url === "/api/auth/csrf-token") {
      return new Response(JSON.stringify({ csrfToken: "test-csrf" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Everything else: 404 — react-query is configured with retry:false so
    // these errors simply land in the query's error state and don't crash
    // the page. The trend card reads from a pre-seeded cache entry.
    return new Response("not found", { status: 404 });
  };
}

async function loadDeps() {
  const React = (await import("react")).default ?? (await import("react"));
  const { render, fireEvent, cleanup, waitFor, screen } = await import(
    "@testing-library/react"
  );
  const { QueryClient, QueryClientProvider } = await import(
    "@tanstack/react-query"
  );
  const { TooltipProvider } = await import(
    "../client/src/components/ui/tooltip"
  );
  const OmniChannelAudience = (
    await import("../client/src/pages/admin/OmniChannelAudience")
  ).default;
  return {
    React,
    render,
    fireEvent,
    cleanup,
    waitFor,
    screen,
    QueryClient,
    QueryClientProvider,
    TooltipProvider,
    OmniChannelAudience,
  };
}

function buildTrendExports() {
  // Two rows are enough: the window-stats math (median / p95) needs at
  // least one finite total, and the rolling-stats reference lines come
  // from the latest row's `outlier` block.
  const base = Date.now();
  return {
    exports: [
      {
        exportId: "exp_002",
        exportedAt: new Date(base - 1000).toISOString(),
        actorId: "actor_a",
        actorType: "founder",
        actorRole: "root_admin",
        rowCounts: { total: 220 },
        outlier: {
          isOutlier: true,
          rollingMedian: 100,
          rollingP95: 180,
          threshold: 200,
          sampleSize: 12,
          multiplier: 2.2,
        },
      },
      {
        exportId: "exp_001",
        exportedAt: new Date(base - 60_000).toISOString(),
        actorId: "actor_b",
        actorType: "admin",
        actorRole: "admin",
        rowCounts: { total: 90 },
        outlier: {
          isOutlier: false,
          rollingMedian: 100,
          rollingP95: 170,
          threshold: 200,
          sampleSize: 11,
          multiplier: 0.9,
        },
      },
    ],
  };
}

test("window-stats toggle hides and re-shows both legend chips", async () => {
  installFetch();

  const {
    React,
    render,
    fireEvent,
    cleanup,
    waitFor,
    screen,
    QueryClient,
    QueryClientProvider,
    TooltipProvider,
    OmniChannelAudience,
  } = await loadDeps();

  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
      mutations: { retry: false },
    },
  });

  // Pre-seed ONLY the trend query so the trend card renders the legend
  // (chips appear only when `exportTrendQuery.data?.exports` is non-empty).
  qc.setQueryData([TREND_QUERY_URL], buildTrendExports());

  render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(
        TooltipProvider,
        { delayDuration: 200 },
        React.createElement(OmniChannelAudience),
      ),
    ),
  );

  // 1) Default state: both window-stats chips visible + caption present +
  //    toggle button reads "Hide window stats" (trendShowWindowStats=true).
  await waitFor(() => {
    const med = screen.getByTestId("legend-trend-window-median");
    const p95 = screen.getByTestId("legend-trend-window-p95");
    assert.ok(med, "window-median legend chip must be visible by default");
    assert.ok(p95, "window-p95 legend chip must be visible by default");
  });

  // The caption is static and lives outside the gated <></> block, so it
  // must stay visible regardless of toggle state.
  assert.ok(
    screen.getByTestId("text-trend-stats-caption"),
    "stats caption must be present on first render",
  );

  const toggle = screen.getByTestId(
    "button-toggle-window-stats",
  ) as HTMLButtonElement;
  assert.equal(
    toggle.textContent,
    "Hide window stats",
    "button must offer to HIDE while stats are showing",
  );

  // The two chips should also include the numeric labels from the
  // seeded data — window totals sort to [90, 220], so median is 155 and
  // p95 (linear interpolation at rank 0.95) is 90*0.05 + 220*0.95 = 213.5
  // which `toFixed(0)` rounds to 214. Asserting the rendered numbers
  // catches a regression that nukes the math even if the chips stay.
  const medChip = screen.getByTestId("legend-trend-window-median");
  const p95Chip = screen.getByTestId("legend-trend-window-p95");
  assert.match(medChip.textContent ?? "", /Window median:\s*155/);
  assert.match(p95Chip.textContent ?? "", /Window p95:\s*214/);

  // 2) Click → both chips must disappear and button label must flip.
  fireEvent.click(toggle);

  await waitFor(() => {
    assert.equal(
      screen.queryByTestId("legend-trend-window-median"),
      null,
      "window-median chip must be removed after first toggle click",
    );
    assert.equal(
      screen.queryByTestId("legend-trend-window-p95"),
      null,
      "window-p95 chip must be removed after first toggle click",
    );
  });

  const toggleAfterHide = screen.getByTestId(
    "button-toggle-window-stats",
  ) as HTMLButtonElement;
  assert.equal(
    toggleAfterHide.textContent,
    "Show window stats",
    "button must offer to SHOW while stats are hidden",
  );
  // Caption stays put — it documents the legend in general, not the
  // window-stats subset.
  assert.ok(
    screen.getByTestId("text-trend-stats-caption"),
    "stats caption must remain visible while chips are hidden",
  );

  // 3) Click again → both chips must reappear with the same numbers and
  //    the button label must flip back.
  fireEvent.click(toggleAfterHide);

  await waitFor(() => {
    const med = screen.getByTestId("legend-trend-window-median");
    const p95 = screen.getByTestId("legend-trend-window-p95");
    assert.match(med.textContent ?? "", /Window median:\s*155/);
    assert.match(p95.textContent ?? "", /Window p95:\s*214/);
  });

  const toggleAfterShow = screen.getByTestId(
    "button-toggle-window-stats",
  ) as HTMLButtonElement;
  assert.equal(
    toggleAfterShow.textContent,
    "Hide window stats",
    "button label must flip back after second toggle click",
  );

  cleanup();
  qc.clear();
  // The shared `after()` hook closes the JSDOM window, which aborts
  // every outstanding timer / animation-frame / ResizeObserver that
  // recharts and react-query leave behind — letting the node:test
  // runner exit without `--test-force-exit`.
});
