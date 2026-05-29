/**
 * Newsroom T3 — Broadcast Brief route regression.
 *
 * Verifies:
 *   - GET routes require admin (401 without admin middleware pass).
 *   - POST routes require CSRF (403 when token is missing).
 *   - POST :dataPackageId/generate with admin + CSRF returns a draft brief.
 *   - GET history works.
 *
 * We mount the real csrfMiddleware + registerBroadcastBriefRoutes on a
 * fresh Express app with a stub admin gate, so we cover the real CSRF
 * code path without booting the full server.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { csrfMiddleware } from "../../server/middleware/csrf";
import { registerBroadcastBriefRoutes } from "../../server/routes/broadcast-briefs";
import { broadcastBriefBuilderService } from "../../server/services/broadcast-brief-builder-service";

type AdminMode = "off" | "on";
let adminMode: AdminMode = "off";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = { csrfToken: "fixed-csrf-token", adminId: "admin_test" };
    next();
  });
  app.use("/api", csrfMiddleware);
  const requireRootAdmin = (_req: any, res: any, next: any) =>
    adminMode === "on" ? next() : res.status(401).json({ message: "admin required" });
  registerBroadcastBriefRoutes(app, requireRootAdmin);
  return app;
}

async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

const VK = {
  id: "vk_route_001",
  clusterId: "cl_route_001",
  status: "verified" as const,
  canonicalTitle: "Title",
  canonicalSummary: "Summary",
  keyFacts: [
    { statement: "Fact", derivedFromClaimIds: ["c1"], confidence: 0.9 },
  ],
  claims: [
    {
      id: "c1",
      clusterId: "cl_route_001",
      verifiedKnowledgeId: "vk_route_001",
      statement: "Fact",
      verdict: "supported" as const,
      verdictConfidence: 0.9,
      supportCount: 2,
      contradictionCount: 0,
      evidence: [],
    },
  ],
  confidence: {
    aggregate: 0.85,
    claimSupport: 0.9,
    sourceDiversity: 0.8,
    sourceReliabilityAvg: 0.85,
    contradictionPenalty: 0,
    ageDecay: 0.95,
    computedAt: "2026-05-18T12:00:00.000Z",
    formulaVersion: "v1" as const,
  },
  sourceCoverage: {
    distinctSources: 2,
    tierBreakdown: { tier_a: 1, tier_b: 1, tier_c: 0, untrusted: 0 },
    earliestPublishedAt: "2026-05-18T12:00:00.000Z",
    latestPublishedAt: "2026-05-18T12:00:00.000Z",
  },
  approvedBy: "root",
  approvedAt: "2026-05-18T12:00:00.000Z",
  supersededByVerifiedId: null,
};

// Patch the AI extractor at the service level for these tests by stubbing
// the openai dependency: we re-route generateForDataPackage to a known
// payload via the underlying service directly.
const aiPayload = {
  headline: "H",
  summary: "S",
  location: { city: "SF", country: "USA", lat: 37.77, lon: -122.42 },
  region: "CA",
  country: "USA",
  latitude: 37.77,
  longitude: -122.42,
  eventType: "launch",
  entities: [{ name: "OpenAI", kind: "org" as const }],
  mood: "analytical" as const,
  impactScore: "high" as const,
  breakingNews: false,
  scriptBeats: { coldOpen: "x", keyFacts: "x", context: "x", signOff: "x" },
  visualNeeds: { coldOpen: ["a"], keyFacts: ["a"], context: ["a"], signOff: ["a"] },
  bRollNeeds: ["a"],
  mapNeeds: { needsMap: false, focus: null, zoomHint: "none" as const },
  anchorMode: "solo_desk" as const,
  sensitivity: {
    graphicViolence: false, minors: false, disputed: false, medical: false,
    electoral: false, legal: false, death: false, financial: false, notes: [],
  },
  rightsFlags: { hasRestrictions: false, notes: [] },
};

describe("BroadcastBrief routes — admin + CSRF", () => {
  beforeEach(async () => {
    await broadcastBriefBuilderService._resetForTests();
    adminMode = "off";
  });

  it("GET history requires admin", async () => {
    const app = buildApp();
    const { url, close } = await listen(app);
    const r = await fetch(`${url}/api/admin/newsroom/broadcast-brief/history`);
    await close();
    assert.equal(r.status, 401);
  });

  it("GET :id requires admin", async () => {
    const app = buildApp();
    const { url, close } = await listen(app);
    const r = await fetch(`${url}/api/admin/newsroom/broadcast-brief/some-id`);
    await close();
    assert.equal(r.status, 401);
  });

  it("POST generate requires admin", async () => {
    const app = buildApp();
    const { url, close } = await listen(app);
    const r = await fetch(`${url}/api/admin/newsroom/broadcast-brief/dp_x/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "fixed-csrf-token" },
      body: JSON.stringify({ storyId: VK.id, verifiedKnowledge: VK }),
    });
    await close();
    assert.equal(r.status, 401);
  });

  it("POST generate without CSRF is rejected (403)", async () => {
    adminMode = "on";
    const app = buildApp();
    const { url, close } = await listen(app);
    const r = await fetch(`${url}/api/admin/newsroom/broadcast-brief/dp_x/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // no x-csrf-token
      body: JSON.stringify({ storyId: VK.id, verifiedKnowledge: VK }),
    });
    await close();
    assert.equal(r.status, 403);
  });

  it("POST generate with admin + CSRF creates a draft brief; GET history returns it", async () => {
    adminMode = "on";
    // Patch the service so it never calls OpenAI inside this route test.
    const orig = broadcastBriefBuilderService.generateForDataPackage;
    (broadcastBriefBuilderService as any).generateForDataPackage = (input: any) =>
      orig.call(broadcastBriefBuilderService, input, { extractor: async () => aiPayload });

    const app = buildApp();
    const { url, close } = await listen(app);
    try {
      const gen = await fetch(`${url}/api/admin/newsroom/broadcast-brief/dp_route_1/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "fixed-csrf-token" },
        body: JSON.stringify({ storyId: VK.id, articleId: 7, verifiedKnowledge: VK }),
      });
      assert.equal(gen.status, 200);
      const body = await gen.json();
      assert.equal(body.brief.approvalStatus, "draft");
      assert.equal(body.brief.visibility, "admin_only_internal");
      assert.equal(body.brief.publicUrl, null);
      assert.equal(body.brief.signedUrl, null);
      assert.equal(body.brief.realSendAllowed, false);
      assert.equal(body.brief.executionEnabled, false);
      assert.equal(body.brief.dataPackageId, "dp_route_1");
      assert.equal(body.brief.storyId, VK.id);
      assert.equal(body.brief.articleId, 7);
      assert.equal(body.brief.rightsFlags.hasRestrictions, false);

      const hist = await fetch(`${url}/api/admin/newsroom/broadcast-brief/history`);
      assert.equal(hist.status, 200);
      const histBody = await hist.json();
      assert.equal(histBody.briefs.length, 1);
      assert.equal(histBody.briefs[0].id, body.brief.id);

      const one = await fetch(`${url}/api/admin/newsroom/broadcast-brief/${body.brief.id}`);
      assert.equal(one.status, 200);
      const oneBody = await one.json();
      assert.equal(oneBody.brief.id, body.brief.id);
    } finally {
      (broadcastBriefBuilderService as any).generateForDataPackage = orig;
      await close();
    }
  });

  it("PATCH without CSRF is rejected (403) even with admin", async () => {
    adminMode = "on";
    const app = buildApp();
    const { url, close } = await listen(app);
    const r = await fetch(`${url}/api/admin/newsroom/broadcast-brief/some-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headline: "x" }),
    });
    await close();
    assert.equal(r.status, 403);
  });
});
