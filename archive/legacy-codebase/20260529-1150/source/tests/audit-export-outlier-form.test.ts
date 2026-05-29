/**
 * Task #502 — verify the AuditExportOutlierConfigCard form actually saves.
 *
 * End-to-end UI integration test. Mounts the real
 * `AuditExportOutlierConfigCard` component in a jsdom DOM, lets the
 * initial GET query hydrate the form, edits every field through real
 * input change events, clicks the real Save button, and asserts the
 * resulting `fetch` call: PUT
 * /api/admin/newsroom/audience/export-outlier-config with a body the
 * server's `ExportOutlierUpsertSchema` accepts. A negative case sets
 * windowSize=4, clicks Save, and asserts the inline error text appears
 * AND no PUT request was made.
 */

// ESM hoists `import` declarations, so jsdom MUST be installed via
// dynamic import inside test() — otherwise React/RTL load before
// `document` exists and `screen` binds to nothing.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installJsdom } from "./_helpers/jsdom-env";

const jsdomHandle = installJsdom();
after(() => jsdomHandle.teardown());

const PUT_URL = "/api/admin/newsroom/audience/export-outlier-config";

type FetchCall = { method: string; url: string; body: any; headers: any };

function installFetch(options: { capturePut: (call: FetchCall) => void }) {
  const initial = {
    enabled: true,
    windowSize: 50,
    medianMultiplier: 10,
    minSampleSize: 5,
    minTotalRowCount: 100,
  };
  (globalThis as any).fetch = async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    if (url === "/api/auth/csrf-token") {
      return new Response(JSON.stringify({ csrfToken: "test-csrf" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === PUT_URL && method === "GET") {
      return new Response(JSON.stringify({ config: initial }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === PUT_URL && method === "PUT") {
      const body = init.body ? JSON.parse(init.body) : null;
      options.capturePut({ method, url, body, headers: init.headers });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
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
  const { z } = await import("zod");
  const { AuditExportOutlierConfigCard } = await import(
    "../client/src/pages/admin/AuditExportOutlierConfigCard"
  );
  return {
    React,
    render,
    fireEvent,
    cleanup,
    waitFor,
    screen,
    QueryClient,
    QueryClientProvider,
    z,
    AuditExportOutlierConfigCard,
  };
}

test("editing all 5 fields and clicking Save fires the PUT the server schema accepts", async () => {
  const putCalls: FetchCall[] = [];
  installFetch({ capturePut: (c) => putCalls.push(c) });

  const {
    React,
    render,
    fireEvent,
    cleanup,
    waitFor,
    screen,
    QueryClient,
    QueryClientProvider,
    z,
    AuditExportOutlierConfigCard,
  } = await loadDeps();

  const ExportOutlierUpsertSchema = z.object({
    enabled: z.boolean().optional(),
    windowSize: z.number().int().min(5).max(1000).optional(),
    medianMultiplier: z.number().min(2).max(1000).optional(),
    minSampleSize: z.number().int().min(2).max(1000).optional(),
    minTotalRowCount: z.number().int().min(0).max(1_000_000_000).optional(),
  });

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(AuditExportOutlierConfigCard),
    ),
  );

  // Wait for initial GET to hydrate the form from server config.
  await waitFor(() => {
    const input = screen.getByTestId(
      "input-outlier-window-size",
    ) as HTMLInputElement;
    assert.equal(input.value, "50");
  });

  // Edit every one of the 5 fields through real DOM change events.
  fireEvent.change(
    screen.getByTestId("select-outlier-enabled") as HTMLSelectElement,
    { target: { value: "0" } },
  );
  fireEvent.change(screen.getByTestId("input-outlier-window-size"), {
    target: { value: "75" },
  });
  fireEvent.change(screen.getByTestId("input-outlier-multiplier"), {
    target: { value: "12.5" },
  });
  fireEvent.change(screen.getByTestId("input-outlier-min-sample"), {
    target: { value: "8" },
  });
  fireEvent.change(screen.getByTestId("input-outlier-min-rows"), {
    target: { value: "250" },
  });

  fireEvent.click(screen.getByTestId("button-outlier-save"));

  await waitFor(() => {
    assert.equal(putCalls.length, 1, "exactly one PUT must fire");
  });

  const call = putCalls[0];
  assert.equal(call.method, "PUT");
  assert.equal(call.url, PUT_URL);

  // Exact keys + values the PUT body must carry. A renamed key or extra
  // field would trip this assertion before reaching production.
  assert.deepEqual(call.body, {
    enabled: false,
    windowSize: 75,
    medianMultiplier: 12.5,
    minSampleSize: 8,
    minTotalRowCount: 250,
  });

  // And the server-side Zod schema must accept exactly this body.
  const parsed = ExportOutlierUpsertSchema.safeParse(call.body);
  assert.equal(parsed.success, true, JSON.stringify(parsed));

  // CSRF token must be forwarded; a regression that drops it would 403
  // every save in production.
  assert.equal(call.headers["X-CSRF-Token"], "test-csrf");
  assert.equal(call.headers["Content-Type"], "application/json");

  cleanup();
});

test("out-of-bounds windowSize=4 surfaces the inline error and does NOT fire PUT", async () => {
  const putCalls: FetchCall[] = [];
  installFetch({ capturePut: (c) => putCalls.push(c) });

  const {
    React,
    render,
    fireEvent,
    cleanup,
    waitFor,
    screen,
    QueryClient,
    QueryClientProvider,
    AuditExportOutlierConfigCard,
  } = await loadDeps();

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(AuditExportOutlierConfigCard),
    ),
  );

  await waitFor(() => {
    const input = screen.getByTestId(
      "input-outlier-window-size",
    ) as HTMLInputElement;
    assert.equal(input.value, "50");
  });

  fireEvent.change(screen.getByTestId("input-outlier-window-size"), {
    target: { value: "4" },
  });

  fireEvent.click(screen.getByTestId("button-outlier-save"));

  // The inline destructive error element must appear with the exact
  // message the form promises.
  await waitFor(() => {
    const err = screen.getByTestId("text-outlier-save-error");
    assert.equal(
      err.textContent,
      "Window size must be an integer between 5 and 1000.",
    );
  });

  // And — the whole point — no PUT was ever attempted.
  assert.equal(putCalls.length, 0, "PUT must not fire when validation fails");

  cleanup();
});
