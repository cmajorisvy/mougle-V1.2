// R7B-Routes — Provider-isolation grep guard.
//
// The permanent-avatars route module must NOT mention any external
// avatar / voice / motion provider name. If any such token ever appears
// in the source (via copy-paste, fetch, SDK import, comment, etc.) this
// test fails and blocks the merge.
//
// Design: docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md §9.5.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FORBIDDEN_PROVIDERS = [
  "heygen",
  "elevenlabs",
  "meshy",
  "runway",
  "nvidia-ace",
  "convai",
  "deepmotion",
  "rokoko",
  "metahuman",
  "unity",
  "unreal",
];

// Tokens whose substring would falsely match in code. These are
// explicitly tolerated only inside the FORBIDDEN_PROVIDERS array
// declared in the grep guard itself (this file does not count).
const ROUTE_FILE = resolve(
  process.cwd(),
  "server/routes/admin/permanent-avatars.ts",
);

describe("R7B-Routes provider-isolation", () => {
  it("permanent-avatars.ts contains no forbidden provider names", () => {
    const src = readFileSync(ROUTE_FILE, "utf8").toLowerCase();
    const hits: string[] = [];
    for (const token of FORBIDDEN_PROVIDERS) {
      if (src.includes(token)) hits.push(token);
    }
    assert.deepEqual(
      hits,
      [],
      `Forbidden provider token(s) appeared in ${ROUTE_FILE}: ${hits.join(", ")}. ` +
        `Permanent-avatars routes must remain provider-isolated.`,
    );
  });

  it("permanent-avatars.ts contains no raw fetch() or SDK import", () => {
    const src = readFileSync(ROUTE_FILE, "utf8");
    // Allow ZodError / fetch in comments? Be strict: no fetch(, no axios.
    assert.equal(
      /\bfetch\s*\(/.test(src),
      false,
      "permanent-avatars.ts must not call fetch() — provider isolation.",
    );
    assert.equal(
      /from\s+["']axios["']/.test(src),
      false,
      "permanent-avatars.ts must not import axios — provider isolation.",
    );
  });

  it("permanent-avatars.ts enforces the serializer overlay", () => {
    const src = readFileSync(ROUTE_FILE, "utf8");
    for (const invariant of [
      "publicUrl: null",
      "realSendAllowed: false",
      "executionEnabled: false",
      `visibility: "admin_only_internal"`,
    ]) {
      assert.ok(
        src.includes(invariant),
        `serializer overlay must hard-pin '${invariant}' in permanent-avatars.ts`,
      );
    }
  });

  it("permanent-avatars.ts clamps signed-URL TTL to ≤900s", () => {
    const src = readFileSync(ROUTE_FILE, "utf8");
    assert.ok(
      /MAX_SIGNED_URL_TTL\s*=\s*900/.test(src),
      "MAX_SIGNED_URL_TTL must be 900 seconds (≤ R5C cap).",
    );
  });
});
