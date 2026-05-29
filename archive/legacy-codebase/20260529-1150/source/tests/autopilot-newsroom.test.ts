import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { registerAutopilotNewsroomRoutes } from "../server/routes/autopilot-newsroom-routes";
import {
  SAFETY_ENVELOPE,
  SafetyEnvelopeSchema,
  AutopilotSettingsSchema,
  DEFAULT_SETTINGS,
} from "../shared/autopilot-newsroom";
import {
  evaluateAutopilotEligibility,
  requireManualReviewReasons,
} from "../server/services/newsroom/autopilotDecisionService";
import {
  _resetForTests,
  getStatus,
  start,
  updateSettings,
  isUnrealSendAllowed,
  is4DSendAllowed,
  isPublicPublishFeatureEnabled,
} from "../server/services/newsroom/continuousNewsroomScheduler";
import { getRegisteredShutdowns } from "../server/services/shutdown-registry";

let server: Server;
let base: string;
let allowAdmin = true;

function appWithStubAuth() {
  const app = express();
  app.use(express.json());
  const requireRootAdmin = (_req: any, res: any, next: any) => {
    if (!allowAdmin) return res.status(401).json({ message: "Unauthorized" });
    next();
  };
  registerAutopilotNewsroomRoutes(app, requireRootAdmin);
  return app;
}

before(async () => {
  const app = appWithStubAuth();
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  _resetForTests();
  allowAdmin = true;
  delete process.env.AUTOPILOT_NEWSROOM_ENABLED;
  delete process.env.AUTOPILOT_INTERNAL_PLAYOUT_ENABLED;
  delete process.env.AUTOPILOT_PUBLIC_PUBLISH_ENABLED;
  delete process.env.AUTOPILOT_ALLOW_PROVIDER_CALLS;
  delete process.env.AUTOPILOT_ALLOW_UNREAL_SEND;
  delete process.env.AUTOPILOT_ALLOW_4D_SEND;
});

async function get(p: string) {
  return fetch(`${base}${p}`);
}
async function post(p: string, body: any) {
  return fetch(`${base}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VERIFIED_STORY = {
  storyId: "s1",
  headline: "Climate report released",
  script: "Two-sentence verified script body.",
  status: "verified" as const,
  disputed: false,
  correctionSafe: false,
  confidence: 0.9,
  sourceCount: 4,
  categories: ["climate"],
  rightsBlocked: false,
  involvesMinors: false,
  ageMs: 60_000,
};

/* ------------------------------------------------------------------ */
describe("Autopilot — safety envelope", () => {
  it("rejects envelope tampering: publicPublishing=true", () => {
    const bad = { ...SAFETY_ENVELOPE, publicPublishing: true } as any;
    assert.equal(SafetyEnvelopeSchema.safeParse(bad).success, false);
  });
  it("rejects envelope tampering: realUnrealCommands=true", () => {
    const bad = { ...SAFETY_ENVELOPE, realUnrealCommands: true } as any;
    assert.equal(SafetyEnvelopeSchema.safeParse(bad).success, false);
  });
  it("rejects envelope tampering: real4DCommands=true", () => {
    const bad = { ...SAFETY_ENVELOPE, real4DCommands: true } as any;
    assert.equal(SafetyEnvelopeSchema.safeParse(bad).success, false);
  });
  it("rejects envelope tampering: publicUrlGeneration=true", () => {
    const bad = { ...SAFETY_ENVELOPE, publicUrlGeneration: true } as any;
    assert.equal(SafetyEnvelopeSchema.safeParse(bad).success, false);
  });
  it("rejects envelope tampering: signedUrlGeneration=true", () => {
    const bad = { ...SAFETY_ENVELOPE, signedUrlGeneration: true } as any;
    assert.equal(SafetyEnvelopeSchema.safeParse(bad).success, false);
  });
  it("accepts the canonical SAFETY_ENVELOPE", () => {
    assert.equal(SafetyEnvelopeSchema.safeParse(SAFETY_ENVELOPE).success, true);
  });
});

/* ------------------------------------------------------------------ */
describe("Autopilot — decision service", () => {
  it("manual mode is never eligible", () => {
    const d = evaluateAutopilotEligibility(VERIFIED_STORY, AutopilotSettingsSchema.parse({ mode: "manual" }));
    assert.equal(d.eligible, false);
    assert.equal(d.willPlayInternally, false);
    assert.equal(d.willPublishPublicly, false);
  });

  it("autopilot_preview never plays internally", () => {
    const d = evaluateAutopilotEligibility(
      VERIFIED_STORY,
      AutopilotSettingsSchema.parse({ mode: "autopilot_preview" }),
    );
    assert.equal(d.eligible, true);
    assert.equal(d.willPlayInternally, false);
    assert.equal(d.willPublishPublicly, false);
  });

  it("autopilot_internal_playout allows internal-only play for a verified story", () => {
    const d = evaluateAutopilotEligibility(
      VERIFIED_STORY,
      AutopilotSettingsSchema.parse({ mode: "autopilot_internal_playout" }),
    );
    assert.equal(d.eligible, true);
    assert.equal(d.willPlayInternally, true);
    assert.equal(d.willPublishPublicly, false);
    assert.equal(d.envelope.publicPublishing, false);
    assert.equal(d.envelope.internalAutopilotAllowed, true);
  });

  it("autopilot_public_publish mode cannot be set", () => {
    assert.throws(() => updateSettings({ mode: "autopilot_public_publish" as any }));
  });

  it("disputed story is blocked", () => {
    const d = evaluateAutopilotEligibility(
      { ...VERIFIED_STORY, disputed: true },
      AutopilotSettingsSchema.parse({ mode: "autopilot_preview" }),
    );
    assert.equal(d.eligible, false);
    assert.ok(d.blockedCategories.includes("disputed"));
  });

  it("rejected story is blocked", () => {
    const d = evaluateAutopilotEligibility(
      { ...VERIFIED_STORY, status: "rejected" },
      AutopilotSettingsSchema.parse({ mode: "autopilot_preview" }),
    );
    assert.equal(d.eligible, false);
  });

  it("low-confidence story is blocked", () => {
    const d = evaluateAutopilotEligibility(
      { ...VERIFIED_STORY, confidence: 0.1 },
      AutopilotSettingsSchema.parse({ mode: "autopilot_preview" }),
    );
    assert.equal(d.eligible, false);
    assert.ok(d.reasons.some((r) => r.includes("confidence_above_threshold")));
  });

  it("insufficient source count is blocked", () => {
    const d = evaluateAutopilotEligibility(
      { ...VERIFIED_STORY, sourceCount: 0 },
      AutopilotSettingsSchema.parse({ mode: "autopilot_preview" }),
    );
    assert.equal(d.eligible, false);
    assert.ok(d.reasons.some((r) => r.includes("source_count_above_min")));
  });

  it("rights-blocked media is blocked", () => {
    const d = evaluateAutopilotEligibility(
      { ...VERIFIED_STORY, rightsBlocked: true },
      AutopilotSettingsSchema.parse({ mode: "autopilot_preview" }),
    );
    assert.equal(d.eligible, false);
    assert.ok(d.blockedCategories.includes("rights_blocked_media"));
  });

  it("developing story is blocked unless allowDevelopingInternalOnly=true", () => {
    const off = evaluateAutopilotEligibility(
      { ...VERIFIED_STORY, status: "developing" },
      AutopilotSettingsSchema.parse({ mode: "autopilot_preview", allowDevelopingInternalOnly: false }),
    );
    assert.equal(off.eligible, false);
    const on = evaluateAutopilotEligibility(
      { ...VERIFIED_STORY, status: "developing" },
      AutopilotSettingsSchema.parse({ mode: "autopilot_preview", allowDevelopingInternalOnly: true }),
    );
    // developing+internal is OK gate-wise but status is still not 'verified',
    // which keeps eligibility false (defence in depth). Reason should mention
    // the status gate, not the developing flag.
    assert.equal(on.eligible, false);
    assert.ok(on.reasons.some((r) => r.includes("status_verified_or_approved_internal")));
  });

  it("high-risk categories produce manual-review reasons", () => {
    for (const cat of [
      "elections",
      "health_medical_advice",
      "legal_accusation",
      "financial_recommendation",
      "war_conflict_escalation",
    ]) {
      const reasons = requireManualReviewReasons(
        { ...VERIFIED_STORY, categories: [cat] },
        AutopilotSettingsSchema.parse({}),
      );
      assert.ok(reasons.some((r) => r.includes(cat)), `expected manual review for ${cat}`);
    }
  });

  it("kill switch blocks everything", () => {
    const d = evaluateAutopilotEligibility(
      VERIFIED_STORY,
      AutopilotSettingsSchema.parse({ mode: "autopilot_internal_playout", killSwitchEngaged: true }),
    );
    assert.equal(d.eligible, false);
    assert.ok(d.reasons.some((r) => r.includes("kill_switch")));
  });
});

/* ------------------------------------------------------------------ */
describe("Autopilot — scheduler defaults", () => {
  it("default mode is manual; default kill switch off", () => {
    assert.equal(DEFAULT_SETTINGS.mode, "manual");
    assert.equal(DEFAULT_SETTINGS.killSwitchEngaged, false);
  });

  it("scheduler is not running by default", () => {
    const s = getStatus();
    assert.equal(s.running, false);
    assert.equal(s.schedule.enabled, false);
  });

  it("start() refuses when feature flag is disabled", () => {
    updateSettings({ mode: "autopilot_preview" });
    const r = start("root_admin", () => []);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "feature_flag_disabled");
  });

  it("start() refuses in manual mode even when flag enabled", () => {
    process.env.AUTOPILOT_NEWSROOM_ENABLED = "1";
    const r = start("root_admin", () => []);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "mode_is_manual");
  });

  it("internal_playout start requires both feature flags", () => {
    process.env.AUTOPILOT_NEWSROOM_ENABLED = "1";
    updateSettings({ mode: "autopilot_internal_playout" });
    const r1 = start("root_admin", () => []);
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, "internal_playout_feature_flag_disabled");
    process.env.AUTOPILOT_INTERNAL_PLAYOUT_ENABLED = "1";
    const r2 = start("root_admin", () => []);
    assert.equal(r2.ok, true);
    assert.ok(getRegisteredShutdowns().includes("continuousNewsroomScheduler"));
  });

  it("unreal & 4D send and public publish are PERMANENTLY false", () => {
    process.env.AUTOPILOT_ALLOW_UNREAL_SEND = "1";
    process.env.AUTOPILOT_ALLOW_4D_SEND = "1";
    process.env.AUTOPILOT_PUBLIC_PUBLISH_ENABLED = "1";
    assert.equal(isUnrealSendAllowed(), false);
    assert.equal(is4DSendAllowed(), false);
    assert.equal(isPublicPublishFeatureEnabled(), false);
    const s = getStatus();
    assert.equal(s.flags.unrealSendAllowed, false);
    assert.equal(s.flags.fourDSendAllowed, false);
    assert.equal(s.flags.publicPublishFeatureEnabled, false);
  });
});

/* ------------------------------------------------------------------ */
describe("Autopilot — admin routes", () => {
  it("all routes require root admin", async () => {
    allowAdmin = false;
    for (const [method, path] of [
      ["GET", "/api/admin/autopilot/status"],
      ["GET", "/api/admin/autopilot/queue"],
      ["GET", "/api/admin/autopilot/audit"],
      ["POST", "/api/admin/autopilot/settings"],
      ["POST", "/api/admin/autopilot/start"],
      ["POST", "/api/admin/autopilot/stop"],
      ["POST", "/api/admin/autopilot/evaluate"],
      ["POST", "/api/admin/autopilot/kill-switch"],
    ] as const) {
      const r = method === "GET" ? await get(path) : await post(path, {});
      assert.equal(r.status, 401, `${method} ${path} should require admin`);
    }
  });

  it("status returns SAFETY_ENVELOPE locked false toggles", async () => {
    const r = await get("/api/admin/autopilot/status");
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.status.envelope.publicPublishing, false);
    assert.equal(body.status.envelope.youtubeUpload, false);
    assert.equal(body.status.envelope.socialPosting, false);
    assert.equal(body.status.envelope.liveStreaming, false);
    assert.equal(body.status.envelope.realUnrealCommands, false);
    assert.equal(body.status.envelope.real4DCommands, false);
    assert.equal(body.status.envelope.publicUrlGeneration, false);
    assert.equal(body.status.envelope.signedUrlGeneration, false);
  });

  it("evaluate route returns a decision with no secret leakage", async () => {
    const r = await post("/api/admin/autopilot/evaluate", { story: VERIFIED_STORY });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.decision.willPublishPublicly, false);
    const json = JSON.stringify(body);
    assert.ok(!/sk-[A-Za-z0-9_-]{8,}/.test(json), "no openai-like secret leaked");
    assert.ok(!/replit-objstore-[a-f0-9-]+/i.test(json), "no bucket id leaked");
  });

  it("settings route rejects autopilot_public_publish", async () => {
    const r = await post("/api/admin/autopilot/settings", { mode: "autopilot_public_publish" });
    assert.equal(r.status, 400);
  });

  it("settings route accepts autopilot_preview", async () => {
    const r = await post("/api/admin/autopilot/settings", { mode: "autopilot_preview" });
    assert.equal(r.status, 200);
  });

  it("kill switch via route prevents start", async () => {
    process.env.AUTOPILOT_NEWSROOM_ENABLED = "1";
    process.env.AUTOPILOT_INTERNAL_PLAYOUT_ENABLED = "1";
    await post("/api/admin/autopilot/settings", { mode: "autopilot_internal_playout" });
    await post("/api/admin/autopilot/kill-switch", { engaged: true, reason: "test" });
    const r = await post("/api/admin/autopilot/start", {});
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.reason, "kill_switch_engaged");
  });

  it("playout items expose null publicUrl and null signedUrl", async () => {
    process.env.AUTOPILOT_NEWSROOM_ENABLED = "1";
    process.env.AUTOPILOT_INTERNAL_PLAYOUT_ENABLED = "1";
    await post("/api/admin/autopilot/settings", { mode: "autopilot_internal_playout" });
    // start with a single eligible story
    const story = { ...VERIFIED_STORY };
    const startRes = start("root_admin", () => [story]);
    assert.equal(startRes.ok, true);
    // Wait a tick so the immediate first tick fires.
    await new Promise((r) => setTimeout(r, 30));
    const queueR = await get("/api/admin/autopilot/queue");
    const body = await queueR.json();
    assert.ok(Array.isArray(body.playout));
    for (const p of body.playout) {
      assert.equal(p.publicUrl, null);
      assert.equal(p.signedUrl, null);
      assert.equal(p.visibility, "admin_only_internal");
    }
  });
});
