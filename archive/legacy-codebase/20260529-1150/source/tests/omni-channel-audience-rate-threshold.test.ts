/**
 * Task #572 — coverage for the inline restore-log rate-spike threshold
 * editor added in Task #529 to
 * client/src/pages/admin/OmniChannelAudience.tsx.
 *
 * Mirrors the omni-channel-audience-forms.test.ts pattern:
 *   - assert the happy-path payload parses through a Zod schema that
 *     matches the server validator in
 *     server/routes/omni-channel-audience-routes.ts (POST
 *     `/api/admin/newsroom/audience/retention/restore-log/rate-threshold`)
 *   - assert the reset path sends `{ threshold: null }`
 *   - assert a negative draft throws the EXACT inline error message and
 *     the tracked apiRequest mock is NOT called (proving the POST is
 *     skipped when validation fails)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import {
  RESTORE_LOG_RATE_THRESHOLD_ERRORS,
  RESTORE_LOG_RATE_THRESHOLD_URL,
  buildRestoreLogRateThresholdPayload,
} from "../client/src/pages/admin/omni-channel-audience-forms";

// Mirrors the server Zod schema at POST
// /api/admin/newsroom/audience/retention/restore-log/rate-threshold
const RateThresholdServerSchema = z.object({
  threshold: z.number().int().min(0).nullable(),
});

interface Call {
  method: string;
  url: string;
  body?: unknown;
}
function makeApi() {
  const calls: Call[] = [];
  const apiRequest = async (method: string, url: string, body?: unknown) => {
    calls.push({ method, url, body });
    return { ok: true } as any;
  };
  return { calls, apiRequest };
}

// Tiny wrapper that mimics the card's onClick: call the helper first
// (which may throw) and only then POST. A thrown error structurally
// guarantees the network request is skipped.
async function runSave(
  api: ReturnType<typeof makeApi>,
  draft: string,
): Promise<{ thrown?: Error; payload?: { threshold: number | null } }> {
  try {
    const payload = buildRestoreLogRateThresholdPayload({ draft });
    await api.apiRequest("POST", RESTORE_LOG_RATE_THRESHOLD_URL, payload);
    return { payload };
  } catch (e) {
    return { thrown: e as Error };
  }
}

test("restore-log rate threshold — typing a value + Save posts { threshold: <int> }", async () => {
  const api = makeApi();
  const { payload, thrown } = await runSave(api, "250");
  assert.equal(thrown, undefined);
  assert.deepEqual(payload, { threshold: 250 });
  RateThresholdServerSchema.parse(payload);
  assert.equal(api.calls.length, 1);
  assert.deepEqual(api.calls[0], {
    method: "POST",
    url: "/api/admin/newsroom/audience/retention/restore-log/rate-threshold",
    body: { threshold: 250 },
  });
});

test("restore-log rate threshold — fractional input is floored to an integer", async () => {
  const api = makeApi();
  const { payload } = await runSave(api, "12.9");
  assert.deepEqual(payload, { threshold: 12 });
  RateThresholdServerSchema.parse(payload);
  assert.equal(api.calls[0]?.body && (api.calls[0].body as any).threshold, 12);
});

test("restore-log rate threshold — Reset to default posts { threshold: null }", async () => {
  // The card calls `mutate(null)` directly on Reset, which is exactly
  // what `buildRestoreLogRateThresholdPayload({ draft: "" })` produces.
  const api = makeApi();
  const { payload, thrown } = await runSave(api, "");
  assert.equal(thrown, undefined);
  assert.deepEqual(payload, { threshold: null });
  RateThresholdServerSchema.parse(payload);
  assert.equal(api.calls.length, 1);
  assert.deepEqual(api.calls[0], {
    method: "POST",
    url: "/api/admin/newsroom/audience/retention/restore-log/rate-threshold",
    body: { threshold: null },
  });
});

test("restore-log rate threshold — whitespace-only draft is treated as reset", async () => {
  const api = makeApi();
  const { payload } = await runSave(api, "   ");
  assert.deepEqual(payload, { threshold: null });
  assert.equal(api.calls.length, 1);
  assert.deepEqual((api.calls[0]!.body as any), { threshold: null });
});

test("restore-log rate threshold — negative input throws + skips POST", async () => {
  const api = makeApi();
  const { thrown, payload } = await runSave(api, "-5");
  assert.equal(payload, undefined);
  assert.ok(thrown instanceof Error);
  assert.equal(
    thrown!.message,
    RESTORE_LOG_RATE_THRESHOLD_ERRORS.nonNegativeInteger,
  );
  assert.equal(
    thrown!.message,
    "Enter a non-negative integer (0 disables alerting).",
  );
  assert.equal(api.calls.length, 0);
});

test("restore-log rate threshold — non-numeric input throws + skips POST", async () => {
  const api = makeApi();
  const { thrown } = await runSave(api, "abc");
  assert.ok(thrown instanceof Error);
  assert.equal(
    thrown!.message,
    RESTORE_LOG_RATE_THRESHOLD_ERRORS.nonNegativeInteger,
  );
  assert.equal(api.calls.length, 0);
});

test("restore-log rate threshold — 0 is allowed and disables alerting on the server", async () => {
  const api = makeApi();
  const { payload } = await runSave(api, "0");
  assert.deepEqual(payload, { threshold: 0 });
  RateThresholdServerSchema.parse(payload);
  assert.equal(api.calls.length, 1);
});
