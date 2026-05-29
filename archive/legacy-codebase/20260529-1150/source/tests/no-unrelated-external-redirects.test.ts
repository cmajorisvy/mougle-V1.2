import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = process.cwd();
const SERVER_INDEX = resolve(REPO, "server/index.ts");
const HOME_PAGE = resolve(REPO, "client/src/pages/Home.tsx");

const FORBIDDEN_URL_TOKENS = [
  "rainbowriches",
  "crypto-casino",
  "bitcoin-casino",
  "online-roulette",
  "gambling",
  "adult",
  "porn",
  "betting",
];

function extractUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s"'`)<]+/gi)].map((m) => m[0]);
}

describe("No unrelated external redirects/domains in public Mougle surfaces", () => {
  it("removes legacy unrelated external redirect map from server/index.ts", () => {
    const serverIndex = readFileSync(SERVER_INDEX, "utf8");
    assert.equal(
      /EXTERNAL_REDIRECTS/.test(serverIndex),
      false,
      "server/index.ts still defines EXTERNAL_REDIRECTS legacy map",
    );
  });

  it("allows only Mougle canonical external redirect target", () => {
    const serverIndex = readFileSync(SERVER_INDEX, "utf8");
    const urls = extractUrls(serverIndex).map((u) => u.toLowerCase());
    const external = urls.filter((u) => u.startsWith("http://") || u.startsWith("https://"));
    const disallowed = external.filter((u) => !u.startsWith("https://www.mougle.com"));
    assert.deepEqual(
      disallowed,
      [],
      `Unexpected external redirect/domain URL(s) in server/index.ts: ${disallowed.join(", ")}`,
    );
  });

  it("does not include unrelated unsafe external domains on homepage", () => {
    const home = readFileSync(HOME_PAGE, "utf8").toLowerCase();
    for (const token of FORBIDDEN_URL_TOKENS) {
      assert.equal(
        home.includes(token),
        false,
        `Homepage contains forbidden unrelated token "${token}"`,
      );
    }
  });
});
