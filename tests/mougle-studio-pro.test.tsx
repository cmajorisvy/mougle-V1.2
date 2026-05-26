import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  MougleStudioApiClient,
  hasLockedSafetyFields,
  isBlockedLiveEndpoint,
  loadSettings,
  saveSettings,
  withSafetyLocks,
  type StudioFetch,
  type StudioStorage,
} from "../apps/mougle-studio-pro/src/studioProCore";

function memoryStorage(): StudioStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

function jsonResponse(body: any, status = 200, headers?: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
  };
}

describe("Mougle Studio Pro Mac app core", () => {
  it("app boots to a renderable React shell", () => {
    const appSource = fs.readFileSync(
      path.resolve("apps/mougle-studio-pro/src/App.tsx"),
      "utf8",
    );
    const indexSource = fs.readFileSync(
      path.resolve("apps/mougle-studio-pro/index.html"),
      "utf8",
    );
    assert.match(indexSource, /<div id="root"><\/div>/);
    assert.match(appSource, /Mougle Studio Pro/);
    assert.match(appSource, /Safety mode locked/);
  });

  it("settings save and load without raw secret storage", () => {
    const storage = memoryStorage();
    const saved = saveSettings(storage, {
      apiBaseUrl: "http://127.0.0.1:5001",
      downloadFolder: "~/Downloads/Mougle",
      safetyMode: "locked",
      tokenStoredInKeychain: false,
    });
    const loaded = loadSettings(storage);
    assert.equal(saved.safetyMode, "locked");
    assert.equal(loaded.apiBaseUrl, "http://127.0.0.1:5001");
    assert.equal(loaded.tokenStoredInKeychain, false);
    assert.doesNotMatch(
      JSON.stringify([...storage.data.values()]),
      /sk-|Bearer\s+|rawSecret|apiKeyValue|password/i,
    );
  });

  it("API client sends CSRF for mutating requests", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: StudioFetch = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/api/auth/csrf-token")) return jsonResponse({ csrfToken: "csrf_test" });
      return jsonResponse({ ok: true });
    };
    const api = new MougleStudioApiClient(DEFAULT_SETTINGS, fetchImpl);
    await api.post("/api/admin/production-house/preview-studio/generate", { controls: { mode: "newsroom" } });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].init?.credentials, "include");
    assert.equal(new Headers(calls[1].init?.headers).get("X-CSRF-Token"), "csrf_test");
  });

  it("Cinema 4D script download works through the safe download client", async () => {
    const calls: string[] = [];
    const fetchImpl: StudioFetch = async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          "Content-Type": "text/x-python",
          "Content-Disposition": 'attachment; filename="mougle-cinema4d-newsroom-script.py"',
        }),
        text: async () => "# MGL_CHARACTER_Anchor_01_ROOT",
        arrayBuffer: async () => new TextEncoder().encode("# MGL_CHARACTER_Anchor_01_ROOT").buffer,
      };
    };
    const api = new MougleStudioApiClient(DEFAULT_SETTINGS, fetchImpl);
    const file = await api.downloadCinema4DScript("room_test");
    assert.equal(file.filename, "mougle-cinema4d-newsroom-script.py");
    assert.equal(file.contentType, "text/x-python");
    assert.match(calls[0], /download-script\?qualityTier=premium_draft$/);
  });

  it("production package ZIP download works through the safe download client", async () => {
    const fetchImpl: StudioFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="mougle-cinema4d-newsroom-package.zip"',
      }),
      text: async () => "PK",
      arrayBuffer: async () => new Uint8Array([80, 75, 3, 4]).buffer,
    });
    const api = new MougleStudioApiClient(DEFAULT_SETTINGS, fetchImpl);
    const file = await api.downloadCinema4DPackage("room_test");
    assert.equal(file.filename, "mougle-cinema4d-newsroom-package.zip");
    assert.equal(file.contentType, "application/zip");
    assert.equal(new Uint8Array(file.bytes)[0], 80);
  });

  it("preview state loads with locked safety fields", async () => {
    const state = withSafetyLocks({ id: "preview_1", productionId: "prod_1" });
    const api = new MougleStudioApiClient(DEFAULT_SETTINGS, async () => jsonResponse({ ok: true, state }));
    const body = await api.get<any>("/api/admin/production-house/preview-studio/state");
    assert.equal(body.state.id, "preview_1");
    assert.equal(hasLockedSafetyFields(body.state), true);
  });

  it("safety fields remain locked when local draft data is prepared", () => {
    const safe = withSafetyLocks({
      status: "approved",
      approvalStatus: "approved",
      visibility: "public",
      publicUrl: "https://example.test",
      signedUrl: "https://example.test/signed",
      realSendAllowed: true,
      executionEnabled: true,
    });
    assert.equal(hasLockedSafetyFields(safe), true);
    assert.equal(safe.publicUrl, null);
    assert.equal(safe.signedUrl, null);
  });

  it("refuses live Unreal, real 4D, and publishing endpoints", async () => {
    let calls = 0;
    const api = new MougleStudioApiClient(DEFAULT_SETTINGS, async () => {
      calls += 1;
      return jsonResponse({ ok: true });
    });
    assert.equal(isBlockedLiveEndpoint("/api/admin/production-house/unreal/render"), true);
    await assert.rejects(() => api.post("/api/admin/production-house/unreal/render", {}), /Blocked/);
    await assert.rejects(() => api.post("/api/admin/production-house/4d/send-cue", {}), /Blocked/);
    await assert.rejects(() => api.post("/api/admin/production-house/publish/youtube", {}), /Blocked/);
    assert.equal(calls, 0);
  });
});
