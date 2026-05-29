/**
 * Task #327 — Structural guard for `/api/admin/broadcasts/` sub-routes.
 *
 * T322 introduced `RESERVED_BROADCAST_SUBROUTE_NAMES` so that the
 * `PATCH/DELETE /api/admin/broadcasts/:id` handlers can defer to the
 * later, more specific sibling sub-routes (e.g. `/render`, `/approvals`,
 * `/saved-views`, `/fallback-default-preset`, ...). If a new single-
 * segment sibling route is added without updating that set, the `:id`
 * handlers silently swallow it again — the exact class of bug T322 was
 * meant to kill.
 *
 * This test parses `server/routes/broadcasts.ts`, collects every literal
 * first segment registered at `/api/admin/broadcasts/<segment>` across
 * all HTTP verbs, and asserts each one is present in the reserved set.
 * Adding a new sibling sub-route without updating the set fails CI with
 * a clear message naming the missing segment(s).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { RESERVED_BROADCAST_SUBROUTE_NAMES } from "../server/routes/broadcasts";

const BROADCASTS_SOURCE_PATH = resolve(
  process.cwd(),
  "server/routes/broadcasts.ts",
);

const ADMIN_PREFIX = "/api/admin/broadcasts/";

// Match `app.<verb>(` followed (possibly across whitespace/newlines) by
// a string literal whose contents start with `/api/admin/broadcasts/`.
// We deliberately capture only the path string; the rest of the route
// registration (middleware, handler) is irrelevant to this check.
const ROUTE_REGEX =
  /\bapp\.(get|post|put|patch|delete|options|head|all)\s*\(\s*"([^"]+)"/g;

function collectAdminBroadcastFirstSegments(source: string): Set<string> {
  const segments = new Set<string>();
  for (const match of source.matchAll(ROUTE_REGEX)) {
    const path = match[2];
    if (!path.startsWith(ADMIN_PREFIX)) continue;
    const remainder = path.slice(ADMIN_PREFIX.length);
    if (!remainder) continue;
    const first = remainder.split("/")[0];
    // Skip the `:id` (or any other) parameter — those are the very
    // handlers the reserved set is protecting.
    if (!first || first.startsWith(":")) continue;
    segments.add(first);
  }
  return segments;
}

describe("RESERVED_BROADCAST_SUBROUTE_NAMES structural guard", () => {
  const source = readFileSync(BROADCASTS_SOURCE_PATH, "utf8");
  const registeredSegments = collectAdminBroadcastFirstSegments(source);

  it("finds at least the known sibling sub-routes (sanity check)", () => {
    // If this fails, the regex above stopped matching the route
    // registrations and the rest of this test would silently pass.
    for (const known of [
      "render",
      "approvals",
      "saved-views",
      "fallback-default-preset",
    ]) {
      assert.ok(
        registeredSegments.has(known),
        `Expected to discover \`${known}\` sub-route in broadcasts.ts. ` +
          `The route-extraction regex may be out of date.`,
      );
    }
  });

  it("every literal /api/admin/broadcasts/<segment> is in the reserved set", () => {
    const missing: string[] = [];
    for (const seg of registeredSegments) {
      if (!RESERVED_BROADCAST_SUBROUTE_NAMES.has(seg)) {
        missing.push(seg);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `New /api/admin/broadcasts/<segment> route(s) were added without ` +
        `updating RESERVED_BROADCAST_SUBROUTE_NAMES in ` +
        `server/routes/broadcasts.ts: ${missing.join(", ")}. ` +
        `Without this, PATCH/DELETE /api/admin/broadcasts/:id will ` +
        `swallow the new sibling sub-route(s) and either 500 or mutate ` +
        `the wrong row. Add each name to the set and re-run the test.`,
    );
  });

  it("reserved set has no stale entries (every name is actually used)", () => {
    // Defensive entries in the set are intentionally allowed even when
    // no single-segment route exists for them yet — they reserve the
    // name against future shadowing. We only flag entries that are
    // neither used as a single segment nor as a multi-segment prefix.
    const allPathPrefixes = new Set<string>();
    for (const match of source.matchAll(ROUTE_REGEX)) {
      const path = match[2];
      if (!path.startsWith(ADMIN_PREFIX)) continue;
      const first = path.slice(ADMIN_PREFIX.length).split("/")[0];
      if (first && !first.startsWith(":")) allPathPrefixes.add(first);
    }
    const stale: string[] = [];
    for (const name of RESERVED_BROADCAST_SUBROUTE_NAMES) {
      if (!allPathPrefixes.has(name)) stale.push(name);
    }
    assert.deepEqual(
      stale,
      [],
      `RESERVED_BROADCAST_SUBROUTE_NAMES contains entries that no ` +
        `longer correspond to any /api/admin/broadcasts/<name>... route: ` +
        `${stale.join(", ")}. Remove them or add the matching route.`,
    );
  });
});
