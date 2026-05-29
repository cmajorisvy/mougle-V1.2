/**
 * Task #633 — verify the "Copy link" button next to the trend window
 * controls in the omni-channel audience admin page actually copies a
 * URL that round-trips the trendPreset / trendFrom / trendTo query
 * params, surfaces the inline "Link copied" confirmation, lets it
 * disappear again after the ~2s auto-clear timer, and falls back to a
 * "Copy failed" inline state when the clipboard API throws.
 *
 * Mounts the real ExportLogCard component (which owns the trend chart
 * + Copy link button — see Task #587) in a single shared jsdom DOM
 * with mocked fetch, clipboard, and ResizeObserver so the trend
 * controls render without hitting the network or the recharts SVG
 * path. The DOM is installed exactly once because JSDOM swaps would
 * orphan @testing-library/react's render container bindings.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><body></body></html>",
  { url: "http://localhost/admin/omni-channel-audience", pretendToBeVisual: true },
);
{
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  g.navigator = dom.window.navigator;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.HTMLSelectElement = dom.window.HTMLSelectElement;
  g.HTMLButtonElement = dom.window.HTMLButtonElement;
  g.Node = dom.window.Node;
  g.Element = dom.window.Element;
  g.Event = dom.window.Event;
  g.MouseEvent = dom.window.MouseEvent;
  g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // recharts (loaded transitively via ExportLogCard) touches
  // ResizeObserver even on code paths the test does not render —
  // stub it so the import does not blow up in jsdom.
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (dom.window as any).ResizeObserver = g.ResizeObserver;
}

const clipboardWrites: string[] = [];
let clipboardImpl: (text: string) => Promise<void> = async () => {};
Object.defineProperty(dom.window.navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (s: string) => {
      // Throw before recording so the negative-path test sees
      // clipboardWrites stay empty.
      await clipboardImpl(s);
      clipboardWrites.push(s);
    },
  },
});
(globalThis as any).navigator = dom.window.navigator;
// jsdom does not implement execCommand by default, but the component
// falls back to a textarea + execCommand("copy") path when
// navigator.clipboard.writeText throws. Make that fallback fail too so
// the "Copy failed" negative test cannot accidentally succeed.
(dom.window.document as any).execCommand = () => false;

(globalThis as any).fetch = async (input: any) => {
  const url = typeof input === "string" ? input : input.url;
  if (url === "/api/auth/csrf-token") {
    return new Response(JSON.stringify({ csrfToken: "test-csrf" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.startsWith("/api/admin/newsroom/audience/export-log/warn-threshold")) {
    return new Response(
      JSON.stringify({
        config: {
          threshold: 10000,
          isDefault: true,
          updatedAt: null,
          updatedBy: null,
        },
        defaultThreshold: 10000,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (url.startsWith("/api/admin/newsroom/audience/export-log/count")) {
    return new Response(JSON.stringify({ count: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.startsWith("/api/admin/newsroom/audience/export-log")) {
    // Covers both the paged log query and the trend query.
    return new Response(JSON.stringify({ exports: [], totalCount: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response("not found", { status: 404 });
};

async function loadDeps() {
  const ReactNs = await import("react");
  const React = (ReactNs as any).default ?? ReactNs;
  // ExportLogCard's TSX is compiled with the classic JSX runtime
  // (esbuild default) which expects `React` as a free identifier at
  // every JSX site. Expose it as a global before importing the
  // component so React.createElement(...) resolves at render time.
  (globalThis as any).React = React;
  const { render, fireEvent, cleanup, waitFor, screen, act } = await import(
    "@testing-library/react"
  );
  const { QueryClient, QueryClientProvider } = await import(
    "@tanstack/react-query"
  );
  const { ExportLogCard } = await import(
    "../client/src/pages/admin/omni-channel-audience/ExportLogCard"
  );
  return {
    React,
    render,
    fireEvent,
    cleanup,
    waitFor,
    screen,
    act,
    QueryClient,
    QueryClientProvider,
    ExportLogCard,
  };
}

function makeQueryClient(QueryClient: any) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Mirror the real default queryFn so any useQuery({queryKey:[url]})
        // hits our fetch mock without needing the production
        // queryClient.
        queryFn: async ({ queryKey }: any) => {
          const res = await fetch(queryKey.join("/"));
          if (!res.ok) throw new Error(`${res.status}`);
          return res.json();
        },
        retry: false,
        refetchOnWindowFocus: false,
        // gcTime=0 disables react-query's cache-GC interval (default
        // 5 min), which otherwise keeps the Node event loop alive
        // long enough for `node --test` to flag the whole file as a
        // timed-out wrapper test.
        gcTime: 0,
        staleTime: 0,
      },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

function resetSearch(search: string) {
  // Reset the in-DOM URL between tests without recreating the JSDOM.
  // The component reads window.location.search synchronously during
  // its useState initializer and again from the URL-sync useEffect.
  dom.window.history.replaceState(
    null,
    "",
    `/admin/omni-channel-audience${search}`,
  );
}

function resetClipboard(impl: (text: string) => Promise<void>) {
  clipboardWrites.length = 0;
  clipboardImpl = impl;
}

test("Copy link copies the URL with trendPreset=7d after clicking the 7d preset and shows the Link copied confirmation", async () => {
  resetSearch("");
  resetClipboard(async () => {});

  const {
    React,
    render,
    fireEvent,
    cleanup,
    waitFor,
    screen,
    act,
    QueryClient,
    QueryClientProvider,
    ExportLogCard,
  } = await loadDeps();

  const qc = makeQueryClient(QueryClient);
  render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(ExportLogCard, { productionId: "default" }),
    ),
  );

  // The trend controls are unconditionally rendered (even in the
  // empty-state / loading-state branches) — wait for the Copy link
  // button to appear once the card mounts.
  const copyBtn = await waitFor(() =>
    screen.getByTestId("button-trend-copy-link"),
  );

  // Flip the URL away from the default preset by clicking 7d. The
  // component's URL-sync useEffect must mirror this into the address
  // bar so window.location.href carries trendPreset=7d.
  fireEvent.click(screen.getByTestId("button-trend-window-7d"));

  await waitFor(() => {
    assert.ok(
      dom.window.location.search.includes("trendPreset=7d"),
      `expected URL to carry trendPreset=7d, got ${dom.window.location.search}`,
    );
  });

  fireEvent.click(copyBtn);

  // Clipboard write happens inside an async handler — wait for it.
  await waitFor(() => {
    assert.equal(
      clipboardWrites.length,
      1,
      "exactly one clipboard.writeText call must fire",
    );
  });

  const copied = clipboardWrites[0];
  assert.ok(
    copied.includes("trendPreset=7d"),
    `clipboard URL must contain trendPreset=7d; got ${copied}`,
  );
  // And the copied value must be window.location.href — i.e. an
  // absolute URL another admin can paste directly into a browser.
  assert.equal(copied, dom.window.location.href);
  assert.ok(
    copied.startsWith("http://localhost/admin/omni-channel-audience"),
    `copied URL must be the absolute admin URL; got ${copied}`,
  );

  // Inline "Link copied" confirmation must appear with the documented
  // test id.
  await waitFor(() => {
    const status = screen.getByTestId("text-trend-copy-link-status");
    assert.equal(status.textContent, "Link copied");
  });

  // ...and it must disappear again after the ~2s timeout the
  // component schedules. Driving the wait inside `act` flushes the
  // deferred setState fired by window.setTimeout(..., 2000) so the
  // pill is unmounted by the time we check.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 2300));
  });
  assert.equal(
    screen.queryByTestId("text-trend-copy-link-status"),
    null,
    "status pill must clear after the ~2s timeout",
  );

  cleanup();
});

test("Copy link round-trips a custom trendFrom + trendTo window from the initial URL", async () => {
  const FROM = "2026-05-01T00:00";
  const TO = "2026-05-15T00:00";
  resetSearch(
    `?trendPreset=custom&trendFrom=${encodeURIComponent(FROM)}` +
      `&trendTo=${encodeURIComponent(TO)}`,
  );
  resetClipboard(async () => {});

  const {
    React,
    render,
    fireEvent,
    cleanup,
    waitFor,
    screen,
    QueryClient,
    QueryClientProvider,
    ExportLogCard,
  } = await loadDeps();

  const qc = makeQueryClient(QueryClient);
  render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(ExportLogCard, { productionId: "default" }),
    ),
  );

  const copyBtn = await waitFor(() =>
    screen.getByTestId("button-trend-copy-link"),
  );

  fireEvent.click(copyBtn);

  await waitFor(() => {
    assert.equal(clipboardWrites.length, 1);
  });

  const copied = clipboardWrites[0];
  assert.ok(
    copied.includes("trendPreset=custom"),
    `copied URL must include trendPreset=custom; got ${copied}`,
  );
  assert.ok(
    copied.includes(`trendFrom=${encodeURIComponent(FROM)}`),
    `copied URL must include trendFrom=${FROM}; got ${copied}`,
  );
  assert.ok(
    copied.includes(`trendTo=${encodeURIComponent(TO)}`),
    `copied URL must include trendTo=${TO}; got ${copied}`,
  );

  await waitFor(() => {
    const status = screen.getByTestId("text-trend-copy-link-status");
    assert.equal(status.textContent, "Link copied");
  });

  cleanup();
});

test("Copy link surfaces Copy failed when the clipboard API throws", async () => {
  resetSearch("?trendPreset=7d");
  resetClipboard(async () => {
    throw new Error("clipboard write blocked");
  });

  const {
    React,
    render,
    fireEvent,
    cleanup,
    waitFor,
    screen,
    QueryClient,
    QueryClientProvider,
    ExportLogCard,
  } = await loadDeps();

  const qc = makeQueryClient(QueryClient);
  render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(ExportLogCard, { productionId: "default" }),
    ),
  );

  const copyBtn = await waitFor(() =>
    screen.getByTestId("button-trend-copy-link"),
  );

  fireEvent.click(copyBtn);

  // The error path leaves clipboardWrites empty (we only push on
  // resolve) AND surfaces "Copy failed" via the same test id.
  await waitFor(() => {
    const status = screen.getByTestId("text-trend-copy-link-status");
    assert.equal(status.textContent, "Copy failed");
  });
  assert.equal(
    clipboardWrites.length,
    0,
    "no successful clipboard.writeText must be recorded when the API throws",
  );

  cleanup();
});
