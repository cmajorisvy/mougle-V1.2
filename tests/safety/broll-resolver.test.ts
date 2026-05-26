import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveForBeats,
  resolveAndPersistPlan,
} from "../../server/services/broll/resolver";
import {
  type BrollBeat,
  type BrollCandidate,
  type BrollSource,
  type BRollResolverConfig,
  resolveBrollConfig,
  BROLL_TIER_ORDER,
} from "../../server/services/broll/types";
import { blocklistMatch, isBlockedUrl, BLOCKED_DOMAIN_LIST } from "../../server/services/broll/blocklist";
import * as paidLicensed from "../../server/services/broll/adapters/paid-licensed";
import * as publicDomain from "../../server/services/broll/adapters/public-domain";
import * as pexels from "../../server/services/broll/adapters/pexels";
import * as pixabay from "../../server/services/broll/adapters/pixabay";
import * as mapbox from "../../server/services/broll/adapters/mapbox";
import * as runway from "../../server/services/broll/adapters/runway";
import * as remotion from "../../server/services/broll/adapters/remotion-motion";

const DRY_CONFIG: BRollResolverConfig = { dryRun: true, founderLiveOptIn: false };

function fakeClipFromCandidate(c: BrollCandidate, idSeed: string) {
  return {
    id: `clip-${idSeed}-${c.source}`,
    source: c.source,
    externalId: c.externalId,
    query: "q",
    url: c.url,
    thumbnailUrl: c.thumbnailUrl ?? null,
    licenseStatus: c.licenseStatus,
    licenseTier: c.licenseTier,
    attribution: c.attribution,
    rightsUrl: c.rightsUrl ?? null,
    durationSec: c.durationSec,
    width: c.width ?? null,
    height: c.height ?? null,
    metadata: c.metadata ?? {},
    indexedAt: new Date(),
  } as any;
}

function makeBeat(beatId: string, query: string, location?: BrollBeat["location"]): BrollBeat {
  return { beatId, query, durationSec: 6, location };
}

describe("T4 — Legal B-Roll Resolver — safety", () => {
  describe("blocklist", () => {
    it("includes major copyrighted news / video domains", () => {
      for (const d of ["cnn.com", "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "youtube.com", "vimeo.com"]) {
        assert.ok(BLOCKED_DOMAIN_LIST.includes(d), `expected ${d} to be in blocklist`);
      }
    });

    it("matches subdomains and bare hosts", () => {
      assert.equal(blocklistMatch("https://www.cnn.com/video/123"), "cnn.com");
      assert.equal(blocklistMatch("https://edition.cnn.com/video/abc"), "cnn.com");
      assert.equal(blocklistMatch("https://news.bbc.co.uk/x"), "bbc.co.uk");
      assert.equal(blocklistMatch("https://reuters.com/x"), "reuters.com");
    });

    it("returns null for allow-listed-by-omission domains", () => {
      assert.equal(blocklistMatch("https://www.pexels.com/x"), null);
      assert.equal(blocklistMatch("https://pixabay.com/x"), null);
    });

    it("treats malformed urls as blocked", () => {
      assert.equal(blocklistMatch("not a url"), "__malformed_url__");
      assert.ok(isBlockedUrl("not a url"));
    });
  });

  describe("resolveBrollConfig defaults", () => {
    it("defaults to dryRun=true and founderLiveOptIn=false", () => {
      const cfg = resolveBrollConfig({} as NodeJS.ProcessEnv);
      assert.equal(cfg.dryRun, true);
      assert.equal(cfg.founderLiveOptIn, false);
    });

    it("requires both env vars to enable live calls", () => {
      const cfg1 = resolveBrollConfig({ BROLL_DRY_RUN: "false" } as any);
      assert.equal(cfg1.founderLiveOptIn, false);
      const cfg2 = resolveBrollConfig({ BROLL_DRY_RUN: "false", BROLL_FOUNDER_LIVE_OPT_IN: "true" } as any);
      assert.equal(cfg2.dryRun, false);
      assert.equal(cfg2.founderLiveOptIn, true);
    });
  });

  describe("cost-bearing adapters refuse live calls without founder opt-in", () => {
    it("pexels DRY_RUN returns deterministic placeholder, never hits network", async () => {
      const out = await pexels.search("test", DRY_CONFIG);
      assert.equal(out.length, 1);
      assert.equal(out[0].source, "pexels");
      assert.equal(out[0].licenseStatus, "licensed");
      assert.equal((out[0].metadata as any).dryRun, true);
    });

    it("pixabay DRY_RUN returns deterministic placeholder", async () => {
      const out = await pixabay.search("test", DRY_CONFIG);
      assert.equal(out.length, 1);
      assert.equal(out[0].source, "pixabay");
      assert.equal((out[0].metadata as any).dryRun, true);
    });

    it("mapbox DRY_RUN returns placeholder when location given", async () => {
      const out = await mapbox.search("test", DRY_CONFIG, { lat: 37, lon: -122, zoom: 8 });
      assert.equal(out.length, 1);
      assert.equal(out[0].source, "mapbox");
      assert.equal((out[0].metadata as any).dryRun, true);
    });

    it("runway DRY_RUN returns owned placeholder; does NOT attempt live call", async () => {
      const out = await runway.search("test", DRY_CONFIG);
      assert.equal(out.length, 1);
      assert.equal(out[0].licenseTier, "owned");
      assert.equal((out[0].metadata as any).dryRun, true);
    });

    it("runway refuses live calls even with key when only one opt-in flag is set", async () => {
      const prev = process.env.RUNWAY_API_KEY;
      process.env.RUNWAY_API_KEY = "fake";
      try {
        // founderLiveOptIn=false → must return placeholder, no throw.
        const out = await runway.search("q", { dryRun: false, founderLiveOptIn: false });
        assert.equal((out[0].metadata as any).dryRun, true);
      } finally {
        if (prev === undefined) delete process.env.RUNWAY_API_KEY;
        else process.env.RUNWAY_API_KEY = prev;
      }
    });

    it("remotion fallback always succeeds with owned license", async () => {
      const out = await remotion.search("test", DRY_CONFIG);
      assert.equal(out[0].source, "remotion_motion");
      assert.equal(out[0].licenseTier, "owned");
      assert.equal(out[0].licenseStatus, "licensed");
    });
  });

  describe("resolver — tier order + licensing", () => {
    it("walks tier order and selects the first licensed candidate", async () => {
      const beats = [makeBeat("b1", "city skyline")];
      const logs: string[] = [];
      const { beats: out } = await resolveForBeats(beats, {
        config: DRY_CONFIG,
        log: (l) => logs.push(l),
        cacheGetter: async () => null,
        cacheUpsert: async (c) => fakeClipFromCandidate(c, "b1"),
      });
      assert.equal(out.length, 1);
      // paid_licensed returns empty in DRY_RUN, so public_domain wins first.
      assert.equal(out[0].source, "public_domain", "first non-empty tier should win");
      assert.equal(out[0].licenseStatus, "licensed");
      // paid_licensed must have been attempted before public_domain.
      assert.deepEqual(out[0].tierTried.slice(0, 2), ["paid_licensed", "public_domain"]);
      const tierLog = logs.find((l) => l.includes("accepted"));
      assert.ok(tierLog && tierLog.includes("public_domain"));
    });

    it("rejects copyrighted URL injected into adapter output", async () => {
      const { beats: out } = await resolveForBeats([makeBeat("b1", "court verdict")], {
        config: DRY_CONFIG,
        log: () => {},
        cacheGetter: async () => null,
        cacheUpsert: async (c) => fakeClipFromCandidate(c, "b1"),
        adapters: {
          // Force the upper tiers to yield nothing so we exercise pexels.
          paid_licensed: async () => [],
          public_domain: async () => [],
          pexels: async () => [
            {
              source: "pexels",
              externalId: "evil-1",
              url: "https://www.cnn.com/video/exclusive-clip.mp4",
              licenseStatus: "licensed",
              licenseTier: "creative_commons",
              attribution: "fake",
              durationSec: 6,
            },
          ],
        },
      });
      const rejReasons = out[0].rejected.map((r) => r.reason);
      assert.ok(
        rejReasons.some((r) => r.startsWith("blocklisted_domain:cnn.com")),
        `expected a blocklist rejection, got: ${JSON.stringify(rejReasons)}`,
      );
      assert.notEqual(out[0].url, "https://www.cnn.com/video/exclusive-clip.mp4");
      assert.notEqual(out[0].source, "pexels");
    });

    it("rejects candidate with missing license metadata", async () => {
      const { beats: out } = await resolveForBeats([makeBeat("b1", "x")], {
        config: DRY_CONFIG,
        log: () => {},
        cacheGetter: async () => null,
        cacheUpsert: async (c) => fakeClipFromCandidate(c, "b1"),
        adapters: {
          paid_licensed: async () => [],
          public_domain: async () => [],
          pexels: async () => [
            {
              source: "pexels",
              externalId: "no-license-1",
              url: "https://www.pexels.com/x.mp4",
            } as any,
          ],
        },
      });
      assert.notEqual(out[0].source, null);
      const rejReasons = out[0].rejected.map((r) => r.reason);
      assert.ok(rejReasons.some((r) => r.includes("missing_or_invalid_license_status")));
    });

    it("never returns a beat whose chosen clip has unknown tier", async () => {
      const { beats: out } = await resolveForBeats([makeBeat("b1", "x")], {
        config: DRY_CONFIG,
        log: () => {},
        cacheGetter: async () => null,
        cacheUpsert: async (c) => fakeClipFromCandidate(c, "b1"),
        adapters: {
          paid_licensed: async () => [],
          public_domain: async () => [],
          pexels: async () => [
            {
              source: "pexels",
              externalId: "unknown-tier-1",
              url: "https://www.pexels.com/y.mp4",
              licenseStatus: "licensed",
              licenseTier: "unknown",
              attribution: "x",
              durationSec: 6,
            },
          ],
        },
      });
      assert.notEqual(out[0].licenseTier, "unknown");
      const rejReasons = out[0].rejected.map((r) => r.reason);
      assert.ok(
        rejReasons.some((r) => r.includes("safety_gate:licensed_media_only")) ||
          rejReasons.some((r) => r.includes("missing_or_invalid_license_tier")),
      );
    });

    it("mapbox tier is skipped when beat has no location", async () => {
      const logs: string[] = [];
      await resolveForBeats([makeBeat("b1", "x")], {
        config: DRY_CONFIG,
        log: (l) => logs.push(l),
        cacheGetter: async () => null,
        cacheUpsert: async (c) => fakeClipFromCandidate(c, "b1"),
        // Force every earlier tier to return nothing so mapbox is reached.
        adapters: {
          paid_licensed: async () => [],
          public_domain: async () => [],
          pexels: async () => [],
          pixabay: async () => [],
        },
      });
      assert.ok(
        logs.some((l) => l.includes("tier=mapbox") && l.includes("no_location")),
        `expected a mapbox skip log, got: ${JSON.stringify(logs)}`,
      );
    });

    it("always produces a fallback via remotion_motion when earlier tiers fail", async () => {
      const { beats: out } = await resolveForBeats([makeBeat("b1", "fallback test")], {
        config: DRY_CONFIG,
        log: () => {},
        cacheGetter: async () => null,
        cacheUpsert: async (c) => fakeClipFromCandidate(c, "b1"),
        adapters: {
          paid_licensed: async () => [],
          public_domain: async () => [],
          pexels: async () => [],
          pixabay: async () => [],
          runway: async () => [],
        },
      });
      assert.equal(out[0].source, "remotion_motion");
      assert.equal(out[0].licenseTier, "owned");
    });

    it("declares all expected sources in tier order (paid → PD → free → map → AI → fallback)", () => {
      assert.deepEqual(
        BROLL_TIER_ORDER,
        [
          "paid_licensed",
          "public_domain",
          "pexels",
          "pixabay",
          "mapbox",
          "runway",
          "remotion_motion",
        ] satisfies BrollSource[],
      );
    });
  });

  describe("geo-aware cache keying (correctness)", () => {
    it("uses a location-aware cache key for mapbox so two beats with same query but different coordinates do not collide", async () => {
      const seenKeys: string[] = [];
      const cacheGetter = async (_src: any, query: string) => {
        seenKeys.push(query);
        return null;
      };
      const cacheUpsert = async (c: BrollCandidate, query: string) => {
        seenKeys.push(`UPSERT:${query}`);
        return fakeClipFromCandidate(c, query);
      };
      await resolveForBeats(
        [
          makeBeat("b1", "earthquake aftermath", { lat: 37.77, lon: -122.42, zoom: 9 }),
          makeBeat("b2", "earthquake aftermath", { lat: 35.68, lon: 139.69, zoom: 9 }),
        ],
        {
          config: DRY_CONFIG,
          log: () => {},
          cacheGetter,
          cacheUpsert,
          adapters: {
            paid_licensed: async () => [],
            public_domain: async () => [],
            pexels: async () => [],
            pixabay: async () => [],
          },
        },
      );
      const mapboxKeys = seenKeys.filter((k) => k.includes("::geo:"));
      assert.ok(mapboxKeys.length >= 2, `expected geo-keyed cache lookups, got: ${JSON.stringify(seenKeys)}`);
      const uniqueGeo = new Set(mapboxKeys.map((k) => k.replace(/^UPSERT:/, "")));
      assert.equal(uniqueGeo.size, 2, `the two locations must produce distinct cache keys, got: ${JSON.stringify([...uniqueGeo])}`);
    });

    it("non-geo sources keep the plain query as cache key", async () => {
      const seenKeys: string[] = [];
      await resolveForBeats([makeBeat("b1", "skyline")], {
        config: DRY_CONFIG,
        log: () => {},
        cacheGetter: async (_src, query) => {
          seenKeys.push(query);
          return null;
        },
        cacheUpsert: async (c, query) => {
          seenKeys.push(`UPSERT:${query}`);
          return fakeClipFromCandidate(c, query);
        },
      });
      assert.ok(seenKeys.some((k) => k === "skyline"));
      assert.ok(!seenKeys.some((k) => k.includes("::geo:")));
    });
  });

  describe("mapbox token containment (security)", () => {
    it("does NOT leak MAPBOX_TOKEN into the persisted candidate URL or metadata", async () => {
      const prev = process.env.MAPBOX_TOKEN;
      process.env.MAPBOX_TOKEN = "sk.SECRET-LEAK-CANARY-123";
      try {
        const liveCfg: BRollResolverConfig = { dryRun: false, founderLiveOptIn: true };
        const out = await mapbox.search("x", liveCfg, { lat: 37, lon: -122, zoom: 8 });
        assert.equal(out.length, 1);
        const c = out[0];
        assert.ok(
          !c.url.includes("SECRET-LEAK-CANARY-123"),
          `mapbox URL must not contain token, got: ${c.url}`,
        );
        assert.ok(
          !c.url.includes("access_token="),
          `mapbox URL must not include access_token query, got: ${c.url}`,
        );
        assert.ok(
          c.url.startsWith("mapbox-tile://"),
          `mapbox URL must be a tokenless descriptor, got: ${c.url}`,
        );
        const metaSerialized = JSON.stringify(c.metadata ?? {});
        assert.ok(
          !metaSerialized.includes("SECRET-LEAK-CANARY-123"),
          `mapbox metadata must not contain token, got: ${metaSerialized}`,
        );
      } finally {
        if (prev === undefined) delete process.env.MAPBOX_TOKEN;
        else process.env.MAPBOX_TOKEN = prev;
      }
    });

    it("DRY_RUN mapbox descriptor is also tokenless", async () => {
      const out = await mapbox.search("x", DRY_CONFIG, { lat: 1, lon: 2, zoom: 3 });
      assert.ok(out[0].url.startsWith("mapbox-tile://"));
      assert.ok(!out[0].url.includes("access_token"));
    });

    it("buildSignedUrl is only callable server-side and requires the token env var", () => {
      const prev = process.env.MAPBOX_TOKEN;
      delete process.env.MAPBOX_TOKEN;
      try {
        assert.equal(mapbox.buildSignedUrl({ lat: 1, lon: 2, zoom: 3 }), null);
      } finally {
        if (prev !== undefined) process.env.MAPBOX_TOKEN = prev;
      }
    });
  });

  describe("new tiers — paid_licensed + public_domain", () => {
    it("paid_licensed adapter returns empty in DRY_RUN (no spend)", async () => {
      const out = await paidLicensed.search("x", DRY_CONFIG);
      assert.deepEqual(out, []);
    });

    it("paid_licensed live without provider key still returns empty (no throw)", async () => {
      const prev = process.env.PAID_STOCK_API_KEY;
      delete process.env.PAID_STOCK_API_KEY;
      try {
        const out = await paidLicensed.search("x", {
          dryRun: false,
          founderLiveOptIn: true,
        });
        assert.deepEqual(out, []);
      } finally {
        if (prev !== undefined) process.env.PAID_STOCK_API_KEY = prev;
      }
    });

    it("public_domain DRY_RUN placeholder is creative_commons + licensed", async () => {
      const out = await publicDomain.search("nasa earthrise", DRY_CONFIG);
      assert.equal(out.length, 1);
      assert.equal(out[0].source, "public_domain");
      assert.equal(out[0].licenseStatus, "licensed");
      assert.equal(out[0].licenseTier, "creative_commons");
    });
  });

  describe("runway live path degrades to empty (no throw) on missing key or failure", () => {
    it("returns [] when live mode is on but RUNWAY_API_KEY is missing — does NOT throw", async () => {
      const prev = process.env.RUNWAY_API_KEY;
      delete process.env.RUNWAY_API_KEY;
      try {
        const out = await runway.search("q", { dryRun: false, founderLiveOptIn: true });
        assert.deepEqual(out, []);
      } finally {
        if (prev !== undefined) process.env.RUNWAY_API_KEY = prev;
      }
    });
  });

  describe("resolveAndPersistPlan contract guard", () => {
    it("is exported and callable (DB I/O not exercised in unit tests)", () => {
      assert.equal(typeof resolveAndPersistPlan, "function");
    });
  });
});
