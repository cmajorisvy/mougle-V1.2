import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { registerCinemaControlRoutes } from "../server/routes/cinema-control-routes";
import {
  SAFETY_ENVELOPE,
  SceneManifestSchema,
  FourDCueManifestSchema,
  SafetyEnvelopeSchema,
} from "../shared/4d-cinema-manifest";
import {
  _resetProjects,
  buildSceneManifest,
  build4DCueManifest,
  createProject,
  generateMockScript,
  generateMockVoicePlan,
  getProviderReadiness,
} from "../server/services/cinema-control-service";

let server: Server;
let base: string;
let allowAdmin = true; // toggled per-test to verify gating

function appWithStubAuth() {
  const app = express();
  app.use(express.json());
  // Stub admin gate that mimics requireRootAdmin behaviour.
  const requireRootAdmin = (_req: any, res: any, next: any) => {
    if (!allowAdmin) return res.status(401).json({ message: "Unauthorized" });
    next();
  };
  registerCinemaControlRoutes(app, requireRootAdmin);
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
  _resetProjects();
  allowAdmin = true;
  // Default to no provider keys / no flags so the safe-mode behaviour is tested.
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.MESHY_API_KEY;
  delete process.env.RUNWAY_API_KEY;
  delete process.env.UNREAL_REMOTE_URL;
  delete process.env.LOCAL_4D_BRIDGE_URL;
  delete process.env.WEBHOOK_SECRET;
  delete process.env.FEATURE_CINEMA_SCRIPT_LIVE;
  delete process.env.FEATURE_CINEMA_VOICE_LIVE;
  delete process.env.FEATURE_CINEMA_MESHY_LIVE;
  delete process.env.FEATURE_CINEMA_RUNWAY_LIVE;
  delete process.env.FEATURE_CINEMA_UNREAL_LIVE;
  delete process.env.FEATURE_CINEMA_4D_LIVE;
});

async function post(path: string, body: any) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function get(path: string) {
  return fetch(`${base}${path}`);
}

describe("4D Cinema Control — safety envelope & schema", () => {
  it("rejects a SafetyEnvelope with publicPublishing: true", () => {
    const bad = { ...SAFETY_ENVELOPE, publicPublishing: true };
    const r = SafetyEnvelopeSchema.safeParse(bad);
    assert.equal(r.success, false);
  });

  it("rejects a SafetyEnvelope with autonomousExecution: true", () => {
    const bad = { ...SAFETY_ENVELOPE, autonomousExecution: true };
    const r = SafetyEnvelopeSchema.safeParse(bad);
    assert.equal(r.success, false);
  });

  it("rejects a scene manifest whose renderSafety has youtubeUpload: true", () => {
    const project = createProject({ title: "X", projectType: "newsroom" });
    const m = buildSceneManifest({ project, topic: "Topic" });
    const tampered: any = { ...m, renderSafety: { ...m.renderSafety, youtubeUpload: true } };
    const r = SceneManifestSchema.safeParse(tampered);
    assert.equal(r.success, false);
  });
});

describe("4D Cinema Control — scene generation", () => {
  it("generates a valid newsroom scene manifest with the immutable safety envelope", () => {
    const project = createProject({ title: "News", projectType: "newsroom" });
    const m = buildSceneManifest({
      project,
      topic: "AI regulation roundup",
      newsroom: {
        tickerItems: ["item1"],
        sources: [{ name: "Reuters", confidence: 0.9 }],
      },
    });
    const parsed = SceneManifestSchema.parse(m);
    assert.equal(parsed.sceneType, "newsroom");
    assert.equal(parsed.roomPreset, "newsroom_v1");
    assert.deepEqual(parsed.renderSafety, SAFETY_ENVELOPE);
    assert.equal(parsed.scriptPlan.mockMode, true);
    assert.equal(parsed.voicePlan.publicAudioUrl, null);
    assert.ok(parsed.screenPanels.some((p) => p.panelType === "ticker"));
  });

  it("generates a valid podcast room scene manifest", () => {
    const project = createProject({ title: "Pod", projectType: "podcast_room" });
    const m = buildSceneManifest({
      project,
      topic: "Episode 1",
      podcast: { host: "H", guest: "G", beats: ["a", "b"] },
    });
    const parsed = SceneManifestSchema.parse(m);
    assert.equal(parsed.roomPreset, "podcast_studio_v1");
    assert.equal(parsed.cameraPlan.primary, "podcast_table");
    assert.ok(parsed.screenPanels.some((p) => p.text?.includes("H")));
  });

  it("HTTP POST /api/scene-manifest returns 200, dryRun:true, renderStarted:false", async () => {
    const c = await post("/api/projects", { title: "P", projectType: "newsroom" });
    const project = (await c.json()).project;
    const r = await post("/api/scene-manifest", { projectId: project.id, topic: "AI safety" });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.renderStarted, false);
    assert.equal(body.publishQueued, false);
    assert.deepEqual(body.manifest.renderSafety, SAFETY_ENVELOPE);
  });
});

describe("4D Cinema Control — avatar selector schema", () => {
  it("requires safetyStatus and a valid role", () => {
    const project = createProject({ title: "A", projectType: "newsroom" });
    const m = buildSceneManifest({ project, topic: "x" });
    assert.match(m.avatarPlan.role, /anchor|podcast_host|guest|analyst|narrator/);
    assert.match(m.avatarPlan.safetyStatus, /safe|needs_review|blocked/);
  });
});

describe("4D Cinema Control — 4D cue manifest validation", () => {
  it("accepts a safe cue manifest and emits the immutable safety envelope", () => {
    const project = createProject({ title: "C", projectType: "newsroom" });
    const manifest = build4DCueManifest({
      project,
      cues: [
        {
          timeMs: 8500,
          cueType: "breaking_news_alert",
          effects: {
            lights: { preset: "red_flash", intensity: 0.8 },
            vibration: { intensity: 0.5, durationMs: 1200 },
          },
        },
      ],
    });
    const parsed = FourDCueManifestSchema.parse(manifest);
    assert.equal(parsed.cues.length, 1);
    assert.deepEqual(parsed.renderSafety, SAFETY_ENVELOPE);
  });

  it("rejects an unsafe cue (intensity > 1)", async () => {
    const c = await post("/api/projects", { title: "U", projectType: "newsroom" });
    const project = (await c.json()).project;
    const r = await post("/api/4d-cue-manifest", {
      projectId: project.id,
      cues: [{
        timeMs: 0, cueType: "x",
        effects: { vibration: { intensity: 1.5, durationMs: 100 } },
      }],
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "invalid_body");
  });

  it("rejects an unsafe cue (durationMs > 30s)", async () => {
    const c = await post("/api/projects", { title: "U", projectType: "newsroom" });
    const project = (await c.json()).project;
    const r = await post("/api/4d-cue-manifest", {
      projectId: project.id,
      cues: [{
        timeMs: 0, cueType: "x",
        effects: { wind: { intensity: 0.5, durationMs: 30001 } },
      }],
    });
    assert.equal(r.status, 400);
  });

  it("rejects an LED hex that isn't #RRGGBB", async () => {
    const c = await post("/api/projects", { title: "U", projectType: "newsroom" });
    const project = (await c.json()).project;
    const r = await post("/api/4d-cue-manifest", {
      projectId: project.id,
      cues: [{
        timeMs: 0, cueType: "x",
        effects: { ledColor: { hex: "red", durationMs: 100 } },
      }],
    });
    assert.equal(r.status, 400);
  });

  it("rejects a non-snake_case cueType", async () => {
    const c = await post("/api/projects", { title: "U", projectType: "newsroom" });
    const project = (await c.json()).project;
    const r = await post("/api/4d-cue-manifest", {
      projectId: project.id,
      cues: [{ timeMs: 0, cueType: "Bad-Cue", effects: {} }],
    });
    assert.equal(r.status, 400);
  });
});

describe("4D Cinema Control — Unreal command route safety", () => {
  it("default response is dryRun:true, commandSent:false, requiresManualApproval:true", async () => {
    const r = await post("/api/unreal/send-command", {
      commandType: "loadScene", projectId: "p1",
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.commandSent, false);
    assert.equal(body.requiresManualApproval, true);
  });

  it("returns provider_not_ready when dryRun:false and UNREAL_REMOTE_URL missing", async () => {
    const r = await post("/api/unreal/send-command", {
      commandType: "loadScene", projectId: "p1", dryRun: false,
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "provider_not_ready");
    assert.equal(body.code, "missing_unreal_api_key");
  });

  it("returns provider_disabled_safe_mode when keys present but feature flag off", async () => {
    process.env.UNREAL_REMOTE_URL = "http://localhost:30010";
    process.env.WEBHOOK_SECRET = "x";
    const r = await post("/api/unreal/send-command", {
      commandType: "loadScene", projectId: "p1", dryRun: false,
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "provider_disabled_safe_mode");
  });
});

describe("4D Cinema Control — 4D cue route safety", () => {
  it("default response is dryRun:true, cueSent:false, requiresManualApproval:true", async () => {
    const r = await post("/api/4d/send-cue", {
      projectId: "p1",
      cue: { timeMs: 0, cueType: "x", effects: {} },
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.dryRun, true);
    assert.equal(body.cueSent, false);
    assert.equal(body.requiresManualApproval, true);
  });

  it("returns provider_not_ready when dryRun:false and LOCAL_4D_BRIDGE_URL missing", async () => {
    const r = await post("/api/4d/send-cue", {
      projectId: "p1", dryRun: false,
      cue: { timeMs: 0, cueType: "x", effects: {} },
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "provider_not_ready");
  });
});

describe("4D Cinema Control — provider readiness errors", () => {
  it("script generate returns readiness error when OPENAI key missing and dryRun:false", async () => {
    const r = await post("/api/script/generate", { topic: "x", dryRun: false });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "provider_not_ready");
    assert.equal(body.provider, "openai");
  });

  it("script generate returns mock by default (dryRun unspecified)", async () => {
    const r = await post("/api/script/generate", { topic: "AI safety" });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.mockMode, true);
    assert.equal(body.script.internalAdminReviewOnly, true);
    assert.ok(body.script.anchorScript.includes("MOCK"));
  });

  it("voice generate returns readiness error when ELEVENLABS key missing and dryRun:false", async () => {
    const r = await post("/api/voice/generate", { text: "hi", provider: "elevenlabs", dryRun: false });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).provider, "elevenlabs");
  });

  it("voice generate returns mock by default with publicAudioUrl:null", async () => {
    const r = await post("/api/voice/generate", { text: "hi", provider: "elevenlabs" });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.publicAudioUrl, null);
    assert.equal(body.voice.mockMode, true);
  });

  it("meshy returns readiness error when MESHY_API_KEY missing and dryRun:false", async () => {
    const r = await post("/api/assets/meshy", { assetPrompt: "x", dryRun: false });
    assert.equal(r.status, 400);
  });

  it("runway returns readiness error when RUNWAY_API_KEY missing and dryRun:false", async () => {
    const r = await post("/api/video/runway", { videoPrompt: "x", dryRun: false });
    assert.equal(r.status, 400);
  });
});

describe("4D Cinema Control — secret hygiene", () => {
  it("readiness endpoint returns only booleans, no secret values", async () => {
    process.env.OPENAI_API_KEY = "sk-supersecret-shouldnotleak-1234";
    process.env.ELEVENLABS_API_KEY = "el-supersecret-shouldnotleak";
    const r = await get("/api/admin/cinema/readiness");
    const text = await r.text();
    assert.equal(r.status, 200);
    assert.equal(text.includes("sk-supersecret"), false, "openai secret leaked");
    assert.equal(text.includes("supersecret"), false, "elevenlabs secret leaked");
    const body = JSON.parse(text);
    assert.equal(body.readiness.openai, true);
    assert.equal(body.readiness.elevenlabs, true);
  });

  it("readinessError JSON does not include secret values", async () => {
    process.env.OPENAI_API_KEY = "sk-leakable";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "";
    // Force the readiness error by demanding live mode for a different missing provider.
    const r = await post("/api/voice/generate", { text: "x", provider: "elevenlabs", dryRun: false });
    const text = await r.text();
    assert.equal(text.includes("sk-leakable"), false);
  });

  it("getProviderReadiness reports false on empty-string env vars", () => {
    process.env.OPENAI_API_KEY = "";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "";
    const r = getProviderReadiness();
    assert.equal(r.openai, false);
  });
});

describe("4D Cinema Control — root-admin gating", () => {
  it("all mutating routes are rejected when stub admin returns 401", async () => {
    allowAdmin = false;
    for (const [method, path, body] of [
      ["POST", "/api/projects", { title: "x", projectType: "newsroom" }],
      ["POST", "/api/script/generate", { topic: "x" }],
      ["POST", "/api/voice/generate", { text: "x" }],
      ["POST", "/api/assets/meshy", { assetPrompt: "x" }],
      ["POST", "/api/video/runway", { videoPrompt: "x" }],
      ["POST", "/api/scene-manifest", { projectId: "p", topic: "x" }],
      ["POST", "/api/4d-cue-manifest", { projectId: "p", cues: [{ timeMs: 0, cueType: "x", effects: {} }] }],
      ["POST", "/api/unreal/send-command", { commandType: "loadScene", projectId: "p" }],
      ["POST", "/api/4d/send-cue", { projectId: "p", cue: { timeMs: 0, cueType: "x", effects: {} } }],
    ] as const) {
      const r = await fetch(`${base}${path}`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      assert.equal(r.status, 401, `${method} ${path} should be 401`);
    }
    const r = await get("/api/projects");
    assert.equal(r.status, 401);
  });
});

describe("4D Cinema Control — project lifecycle", () => {
  it("create -> list -> approval round-trip works (in-memory)", async () => {
    const c = await post("/api/projects", { title: "Lifecycle", projectType: "podcast_room" });
    assert.equal(c.status, 201);
    const project = (await c.json()).project;
    assert.equal(project.status, "draft");

    const list = await (await get("/api/projects")).json();
    assert.ok(list.projects.find((p: any) => p.id === project.id));

    const ap = await post(`/api/projects/${project.id}/approval`, { status: "approved", notes: "ok" });
    assert.equal(ap.status, 200);
    const updated = (await ap.json()).project;
    assert.equal(updated.status, "approved");
    assert.equal(updated.safetyStatus, "safe");
  });
});

describe("4D Cinema Control — schema/db non-impact", () => {
  it("does not import shared/newsroom-schema in shared/schema", async () => {
    const fs = await import("node:fs/promises");
    const schemaSrc = await fs.readFile("shared/schema.ts", "utf8");
    assert.equal(schemaSrc.includes("4d-cinema-manifest"), false);
    assert.equal(schemaSrc.includes("newsroom-schema"), false);
  });

  it("cinema-control-service does not import drizzle or db", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("server/services/cinema-control-service.ts", "utf8");
    assert.equal(src.includes("drizzle"), false);
    assert.equal(src.includes("from \"../db\""), false);
  });
});

describe("4D Cinema Control — utility generators", () => {
  it("generateMockScript respects bulletCount and tone", () => {
    const s = generateMockScript({ topic: "T", tone: "urgent", bulletCount: 6 });
    assert.equal(s.beats.length, 6);
    assert.ok(s.beats[0].includes("urgent"));
    assert.equal(s.mockMode, true);
  });

  it("generateMockVoicePlan never sets a public audio URL", () => {
    const v = generateMockVoicePlan("elevenlabs");
    assert.equal(v.publicAudioUrl, null);
    assert.equal(v.mockMode, true);
  });
});
