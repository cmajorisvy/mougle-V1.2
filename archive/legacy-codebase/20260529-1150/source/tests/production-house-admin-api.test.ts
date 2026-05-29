import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  AdminApiError,
  adminGetJson,
  adminPostJson,
  resetAdminCsrfTokenForTests,
} from "../client/src/lib/adminApi";

const originalFetch = globalThis.fetch;

type FetchCall = {
  url: string;
  method: string;
  credentials: RequestCredentials | undefined;
  headers: Headers;
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function installCsrfMock() {
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toString().toUpperCase();
    const headers = new Headers(init?.headers);
    calls.push({ url, method, credentials: init?.credentials, headers });

    if (url === "/api/auth/csrf-token") {
      return jsonResponse({ csrfToken: "csrf-123" });
    }

    if (method !== "GET" && headers.get("X-CSRF-Token") !== "csrf-123") {
      return jsonResponse({ message: "Invalid CSRF token" }, { status: 403 });
    }

    return jsonResponse({ ok: true, url, method });
  }) as typeof fetch;

  return calls;
}

beforeEach(() => {
  resetAdminCsrfTokenForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetAdminCsrfTokenForTests();
});

describe("Production House admin API helper", () => {
  it("sends credentials and CSRF headers for all Production House mutating actions", async () => {
    const calls = installCsrfMock();
    const endpoints = [
      "/api/admin/production-house/preview-studio/generate",
      "/api/admin/production-house/preview-studio/update-controls",
      "/api/admin/production-house/wizard/wiz_1/finalize",
      "/api/admin/production-house/wizard/wiz_1/send-to-review",
      "/api/admin/production-house/readiness/prod_1/analyze",
      "/api/admin/production-house/approval-board/prod_1/transition",
      "/api/admin/production-house/4d/sandbox/validate-cue",
      "/api/admin/production-house/4d/sandbox/send",
      "/api/admin/production-house/unreal/sandbox/validate-package",
      "/api/admin/production-house/unreal/sandbox/send",
      "/api/admin/production-house/real-unreal/dry-run-validation/prod_1/validate-local",
      "/api/admin/production-house/real-unreal/dry-run-validation/prod_1/validate-bridge",
      "/api/admin/production-house/real-unreal/dry-run-validation/prod_1/validate-bridge-network",
      "/api/admin/production-house/real-unreal/render-preview-contract/prod_1/validate-local",
      "/api/admin/production-house/real-unreal/render-preview-contract/prod_1/send-dry-run",
      "/api/admin/production-house/real-unreal/migration-plan/generate",
    ];

    for (const endpoint of endpoints) {
      await adminPostJson(endpoint, { confirm: true });
    }

    assert.equal(calls.filter((call) => call.url === "/api/auth/csrf-token").length, 1);
    const mutatingCalls = calls.filter((call) => call.url !== "/api/auth/csrf-token");
    assert.equal(mutatingCalls.length, endpoints.length);

    for (const call of mutatingCalls) {
      assert.equal(call.method, "POST");
      assert.equal(call.credentials, "include");
      assert.equal(call.headers.get("X-CSRF-Token"), "csrf-123");
      assert.equal(call.headers.get("Content-Type"), "application/json");
    }
  });

  it("sends credentials for Production House GET calls without requiring a CSRF token", async () => {
    const calls = installCsrfMock();

    await adminGetJson("/api/admin/production-house/overview");

    assert.deepEqual(calls.map((call) => call.url), ["/api/admin/production-house/overview"]);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].credentials, "include");
    assert.equal(calls[0].headers.get("X-CSRF-Token"), null);
  });

  it("reports invalid CSRF failures clearly without logging secrets", async () => {
    const secret = "super-secret-token";
    const logs: string[] = [];
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => { logs.push(args.join(" ")); };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/auth/csrf-token") {
        return jsonResponse({ csrfToken: secret });
      }
      return jsonResponse({ message: "Invalid CSRF token", token: secret }, { status: 403 });
    }) as typeof fetch;

    try {
      await assert.rejects(
        () => adminPostJson("/api/admin/production-house/preview-studio/generate", {}),
        (error: unknown) => {
          assert.equal(error instanceof AdminApiError, true);
          assert.equal((error as AdminApiError).status, 403);
          assert.match((error as Error).message, /Invalid CSRF token/);
          assert.equal((error as Error).message.includes(secret), false);
          return true;
        },
      );
      assert.equal(logs.join("\n").includes(secret), false);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
