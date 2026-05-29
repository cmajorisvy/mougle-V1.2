/**
 * Shared jsdom install + teardown for UI tests.
 *
 * Why this exists: tests that mount React components against jsdom leave
 * behind open timers (react-query schedulers, recharts ResponsiveContainer
 * animation frames, etc.) and ResizeObservers that outlive
 * `@testing-library/react`'s `cleanup()`. Without explicit teardown the
 * node:test runner sits idle waiting for the event loop to drain and the
 * `npm test` script appears to hang.
 *
 * `installJsdom()` mirrors the browser globals onto `globalThis` and
 * returns a teardown function that:
 *   - closes the JSDOM window (aborts every outstanding timer / RAF /
 *     observer registered against it),
 *   - deletes the globals we installed so the next test file starts from
 *     a clean slate,
 *   - is safe to call multiple times.
 *
 * Use it from a `test.before` / `test.after` pair (or call teardown at
 * the end of the single test in the file).
 */

import { JSDOM } from "jsdom";

const INSTALLED_KEYS = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLButtonElement",
  "Node",
  "Element",
  "SVGElement",
  "Event",
  "MouseEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

export interface JsdomHandle {
  dom: JSDOM;
  teardown: () => void;
}

export function installJsdom(): JsdomHandle {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  Object.defineProperty(g, "navigator", {
    configurable: true,
    writable: true,
    value: dom.window.navigator,
  });
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.HTMLSelectElement = dom.window.HTMLSelectElement;
  g.HTMLButtonElement = dom.window.HTMLButtonElement;
  g.Node = dom.window.Node;
  g.Element = dom.window.Element;
  g.SVGElement = dom.window.SVGElement;
  g.Event = dom.window.Event;
  g.MouseEvent = dom.window.MouseEvent;
  g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  g.requestAnimationFrame =
    dom.window.requestAnimationFrame?.bind(dom.window) ??
    ((cb: any) => setTimeout(cb, 0));
  g.cancelAnimationFrame =
    dom.window.cancelAnimationFrame?.bind(dom.window) ??
    ((id: any) => clearTimeout(id));
  // recharts' ResponsiveContainer relies on ResizeObserver; jsdom doesn't
  // ship one. A no-op is enough for tests that don't assert on real
  // layout dimensions.
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  g.IS_REACT_ACT_ENVIRONMENT = true;

  // Track every node-level timer scheduled while jsdom is mounted, so
  // teardown can cancel react-query gcTimeouts (default 5 minutes) and
  // recharts animation frames that otherwise pin the event loop open
  // past the end of the test. We patch the *global* setTimeout /
  // setInterval (not jsdom's window timers — those go away with
  // `dom.window.close()` anyway) because that's what react-query's
  // `timeoutManager` ends up calling.
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  const pendingIntervals = new Set<ReturnType<typeof setInterval>>();
  (globalThis as any).setTimeout = ((fn: any, ms?: any, ...args: any[]) => {
    const id = realSetTimeout(
      (...inner: any[]) => {
        pendingTimeouts.delete(id);
        return fn(...inner);
      },
      ms,
      ...args,
    );
    pendingTimeouts.add(id);
    return id;
  }) as typeof setTimeout;
  (globalThis as any).clearTimeout = ((id: any) => {
    pendingTimeouts.delete(id);
    return realClearTimeout(id);
  }) as typeof clearTimeout;
  (globalThis as any).setInterval = ((fn: any, ms?: any, ...args: any[]) => {
    const id = realSetInterval(fn, ms, ...args);
    pendingIntervals.add(id);
    return id;
  }) as typeof setInterval;
  (globalThis as any).clearInterval = ((id: any) => {
    pendingIntervals.delete(id);
    return realClearInterval(id);
  }) as typeof clearInterval;

  let torn = false;
  const teardown = () => {
    if (torn) return;
    torn = true;
    try {
      dom.window.close();
    } catch {
      // already closed — best-effort
    }
    // Cancel every still-pending timer/interval that anything (react-
    // query gcTime, recharts animations, etc.) scheduled through the
    // global timer functions during the test.
    for (const id of pendingTimeouts) realClearTimeout(id);
    for (const id of pendingIntervals) realClearInterval(id);
    pendingTimeouts.clear();
    pendingIntervals.clear();
    // Restore the real timer functions so later tests in the same
    // process are unaffected.
    (globalThis as any).setTimeout = realSetTimeout;
    (globalThis as any).clearTimeout = realClearTimeout;
    (globalThis as any).setInterval = realSetInterval;
    (globalThis as any).clearInterval = realClearInterval;
    for (const key of INSTALLED_KEYS) {
      try {
        delete (globalThis as any)[key];
      } catch {
        (globalThis as any)[key] = undefined;
      }
    }
    // Node's built-in `fetch` lazily instantiates an undici global
    // dispatcher whose keep-alive socket pool would otherwise survive
    // teardown. Destroy it so the only handles left are stdio. Safe —
    // node lazily recreates the dispatcher on next `fetch`.
    void (async () => {
      try {
        const undici = await import("undici");
        await undici.getGlobalDispatcher().destroy();
      } catch {
        // undici not installed / already destroyed — best-effort
      }
    })();
  };

  return { dom, teardown };
}
