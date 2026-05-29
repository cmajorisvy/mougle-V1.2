/**
 * Task #588 — focused unit test for the history-export filter
 * localStorage + URL helpers extracted from
 * `client/src/pages/admin/OmniChannelAudience.tsx` into
 * `client/src/pages/admin/omni-channel-audience/historyExportFilters.ts`.
 *
 * Covers:
 *  - SSR safety (no `window` → empty string, no throw)
 *  - localStorage read returns the persisted field
 *  - localStorage read returns "" for unknown / non-string fields
 *  - localStorage read returns "" on parse error (corrupt JSON)
 *  - URL precedence: any URL key bypasses localStorage; missing URL keys → ""
 *  - readHistoryExportFilterInitial uses URL when present, otherwise storage
 *  - writeHistoryExportFilters persists JSON of all fields
 *  - writeHistoryExportFilters REMOVES the key when every field is empty
 *  - writeHistoryExportFilters swallows localStorage quota errors
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const MODULE_PATH =
  "../client/src/pages/admin/omni-channel-audience/historyExportFilters.ts";

type ModuleShape = typeof import(
  "../client/src/pages/admin/omni-channel-audience/historyExportFilters"
);

function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    storage: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: (i: number) => Array.from(map.keys())[i] ?? null,
      get length() {
        return map.size;
      },
    },
  };
}

function installWindow(opts: {
  search?: string;
  storage?: ReturnType<typeof makeStorage>["storage"];
} = {}) {
  const g = globalThis as any;
  g.window = {
    localStorage: opts.storage ?? makeStorage().storage,
    location: { search: opts.search ?? "" },
  };
}

function clearWindow() {
  const g = globalThis as any;
  delete g.window;
}

async function loadModule(): Promise<ModuleShape> {
  // Cache-bust so each test starts from a clean module reference. The helpers
  // are stateless (they touch `window` at call time), so this is just for
  // hygiene against a stale globalThis closure between tests.
  return (await import(`${MODULE_PATH}?t=${Date.now()}`)) as ModuleShape;
}

test("returns empty strings when window is undefined (SSR)", async () => {
  clearWindow();
  const mod = await loadModule();
  assert.equal(mod.readHistoryExportFilter("actorId"), "");
  assert.equal(mod.readHistoryExportUrlFilter("actorId"), "");
  assert.equal(mod.hasAnyHistoryExportUrlFilter(), false);
  assert.equal(mod.readHistoryExportFilterInitial("actorId"), "");
  // writeHistoryExportFilters must be a no-op (no throw) without window.
  mod.writeHistoryExportFilters({
    actorId: "x",
    from: "",
    to: "",
    platform: "",
    formatFilter: "",
    minRows: "",
  });
});

test("reads persisted filter from localStorage", async () => {
  const { storage } = makeStorage({
    [
      "mougle.omniChannelAudience.historyExportFilters.v2"
    ]: JSON.stringify({
      actorId: "actor_123",
      from: "2026-01-01",
      to: "2026-02-01",
      platform: "youtube",
      formatFilter: "csv",
      minRows: "10",
    }),
  });
  installWindow({ storage });
  const mod = await loadModule();
  assert.equal(mod.readHistoryExportFilter("actorId"), "actor_123");
  assert.equal(mod.readHistoryExportFilter("from"), "2026-01-01");
  assert.equal(mod.readHistoryExportFilter("platform"), "youtube");
});

test("returns empty string when persisted field is missing or non-string", async () => {
  const { storage } = makeStorage({
    [
      "mougle.omniChannelAudience.historyExportFilters.v2"
    ]: JSON.stringify({ actorId: 42 }),
  });
  installWindow({ storage });
  const mod = await loadModule();
  assert.equal(mod.readHistoryExportFilter("actorId"), "");
  assert.equal(mod.readHistoryExportFilter("from"), "");
});

test("returns empty string on corrupt JSON without throwing", async () => {
  const { storage } = makeStorage({
    "mougle.omniChannelAudience.historyExportFilters.v2": "{not json",
  });
  installWindow({ storage });
  const mod = await loadModule();
  assert.equal(mod.readHistoryExportFilter("actorId"), "");
});

test("URL filter helpers parse window.location.search", async () => {
  installWindow({ search: "?actorId=u1&from=2026-03-01" });
  const mod = await loadModule();
  assert.equal(mod.readHistoryExportUrlFilter("actorId"), "u1");
  assert.equal(mod.readHistoryExportUrlFilter("from"), "2026-03-01");
  assert.equal(mod.readHistoryExportUrlFilter("to"), "");
  assert.equal(mod.hasAnyHistoryExportUrlFilter(), true);
});

test("hasAnyHistoryExportUrlFilter is false when no recognised key is present", async () => {
  installWindow({ search: "?somethingElse=1" });
  const mod = await loadModule();
  assert.equal(mod.hasAnyHistoryExportUrlFilter(), false);
});

test("readHistoryExportFilterInitial: URL wins over localStorage, missing keys clear", async () => {
  const { storage } = makeStorage({
    [
      "mougle.omniChannelAudience.historyExportFilters.v2"
    ]: JSON.stringify({
      actorId: "stored_actor",
      from: "stored_from",
      platform: "stored_platform",
    }),
  });
  installWindow({ storage, search: "?actorId=url_actor" });
  const mod = await loadModule();
  // URL key present → URL value wins.
  assert.equal(mod.readHistoryExportFilterInitial("actorId"), "url_actor");
  // Other fields fall back to "" (URL precedence is all-or-nothing per the
  // helper's contract) — they do NOT bleed in from localStorage.
  assert.equal(mod.readHistoryExportFilterInitial("from"), "");
  assert.equal(mod.readHistoryExportFilterInitial("platform"), "");
});

test("readHistoryExportFilterInitial falls back to localStorage when URL is empty", async () => {
  const { storage } = makeStorage({
    [
      "mougle.omniChannelAudience.historyExportFilters.v2"
    ]: JSON.stringify({ actorId: "stored_actor" }),
  });
  installWindow({ storage, search: "" });
  const mod = await loadModule();
  assert.equal(mod.readHistoryExportFilterInitial("actorId"), "stored_actor");
});

test("writeHistoryExportFilters persists JSON of all fields", async () => {
  const made = makeStorage();
  installWindow({ storage: made.storage });
  const mod = await loadModule();
  mod.writeHistoryExportFilters({
    actorId: "a",
    from: "f",
    to: "t",
    platform: "p",
    formatFilter: "csv",
    minRows: "5",
  });
  const raw = made.map.get(
    "mougle.omniChannelAudience.historyExportFilters.v2",
  );
  assert.ok(raw, "should have written a value");
  assert.deepEqual(JSON.parse(raw!), {
    actorId: "a",
    from: "f",
    to: "t",
    platform: "p",
    formatFilter: "csv",
    minRows: "5",
  });
});

test("writeHistoryExportFilters REMOVES the key when every field is empty", async () => {
  const made = makeStorage({
    "mougle.omniChannelAudience.historyExportFilters.v2": "{\"actorId\":\"old\"}",
  });
  installWindow({ storage: made.storage });
  const mod = await loadModule();
  mod.writeHistoryExportFilters({
    actorId: "",
    from: "",
    to: "",
    platform: "",
    formatFilter: "",
    minRows: "",
  });
  assert.equal(
    made.map.has("mougle.omniChannelAudience.historyExportFilters.v2"),
    false,
  );
});

test("writeHistoryExportFilters swallows localStorage quota errors", async () => {
  const throwingStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("QuotaExceededError");
    },
    clear: () => {},
    key: () => null,
    length: 0,
  };
  installWindow({ storage: throwingStorage as any });
  const mod = await loadModule();
  // Should NOT throw.
  mod.writeHistoryExportFilters({
    actorId: "a",
    from: "",
    to: "",
    platform: "",
    formatFilter: "",
    minRows: "",
  });
  mod.writeHistoryExportFilters({
    actorId: "",
    from: "",
    to: "",
    platform: "",
    formatFilter: "",
    minRows: "",
  });
});
