import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import express from "express";
import { registerPreviewStudioRoutes } from "../server/routes/preview-studio-routes";
import {
  _resetPreviewStudioForTests,
  _setPreviewStudioStorageForTests,
  composeStudioImage,
  composeStudioVideoClip,
  generatePreviewStudioState,
  getPreviewStudioPackageExport,
  listPreviewStudioEditArtifacts,
  listPreviewStudioStates,
  updatePreviewStudioControls,
} from "../server/services/preview-studio-service";
import { FileProductionHouseStorage } from "../server/services/production-house-storage";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  PREVIEW_STUDIO_MODES,
  SAFETY_ENVELOPE,
  SafetyEnvelopeSchema,
} from "../shared/production-house";

let server: Server;
let base: string;
let allowAdmin = true;

before(async () => {
  const app = express();
  app.use(express.json());
  const requireRootAdmin = (_req: any, res: any, next: any) => {
    if (!allowAdmin) return res.status(401).json({ ok: false, error: "unauthorized" });
    next();
  };
  registerPreviewStudioRoutes(app, requireRootAdmin);
  // Mimic the production /api JSON 404 fallback so we can assert it.
  app.use("/{*path}", (req, res) => {
    if (req.originalUrl.startsWith("/api/") || req.originalUrl === "/api") {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    res.status(404).end();
  });
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
  _resetPreviewStudioForTests();
  allowAdmin = true;
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

const ROUTES = [
  { method: "GET",  path: "/api/admin/production-house/preview-studio/state" },
  { method: "GET",  path: "/api/admin/production-house/preview-studio/defaults" },
  { method: "GET",  path: "/api/admin/production-house/preview-studio/tooltips" },
  { method: "GET",  path: "/api/admin/production-house/preview-studio/history" },
  { method: "GET",  path: "/api/admin/production-house/preview-studio/edit-artifacts" },
  { method: "GET",  path: "/api/admin/production-house/preview-studio/package-export" },
  { method: "POST", path: "/api/admin/production-house/preview-studio/generate", body: { controls: { mode: "newsroom" } } },
  { method: "POST", path: "/api/admin/production-house/preview-studio/update-controls", body: { controls: { lowerThirdText: "hello" } } },
  { method: "POST", path: "/api/admin/production-house/preview-studio/compose-image", body: { label: "x", layers: [{ label: "bg", kind: "background" }] } },
  { method: "POST", path: "/api/admin/production-house/preview-studio/compose-video-clip", body: { label: "x", durationSec: 4, layers: [{ label: "bg", kind: "background" }] } },
];

describe("Preview Studio — routes are real (not SPA fallback)", () => {
  it("missing /api route returns JSON 404 (not HTML)", async () => {
    const r = await get("/api/admin/production-house/preview-studio/does-not-exist");
    assert.equal(r.status, 404);
    const ct = r.headers.get("content-type") ?? "";
    assert.match(ct, /application\/json/);
    const body = await r.json();
    assert.equal(body.error, "not_found");
  });

  for (const route of ROUTES) {
    it(`${route.method} ${route.path} requires root-admin`, async () => {
      allowAdmin = false;
      try {
        const r = route.method === "GET"
          ? await get(route.path)
          : await post(route.path, route.body ?? {});
        assert.equal(r.status, 401);
        const ct = r.headers.get("content-type") ?? "";
        assert.match(ct, /application\/json/);
      } finally { allowAdmin = true; }
    });
  }
});

describe("Preview Studio — state & defaults", () => {
  it("GET /state returns JSON with a default scene when no generate has been called", async () => {
    const r = await get("/api/admin/production-house/preview-studio/state");
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.ok(body.state);
    assert.ok(body.state.scene);
    assert.ok(body.state.scene.controls);
  });

  it("GET /defaults returns a non-empty scene for every preview mode", async () => {
    const r = await get("/api/admin/production-house/preview-studio/defaults");
    const body = await r.json();
    assert.equal(body.ok, true);
    for (const m of PREVIEW_STUDIO_MODES) {
      const s = body.defaults[m];
      assert.ok(s, `missing default scene for ${m}`);
      assert.ok(s.controls && s.controls.mode === m);
      assert.ok(Array.isArray(s.panels) && s.panels.length >= 1);
      assert.ok(Array.isArray(s.avatars));
      assert.ok(Array.isArray(s.fourDCues));
      assert.ok(s.cameraFrame && s.lightingMood);
    }
  });

  it("GET /tooltips returns JSON with the expected keys", async () => {
    const r = await get("/api/admin/production-house/preview-studio/tooltips");
    const body = await r.json();
    assert.equal(body.ok, true);
    const keys = body.tooltips.map((t: any) => t.key);
    for (const k of [
      "preview_studio", "production_wizard", "room_generator", "avatar_creator",
      "media_pipeline", "asset_library", "unreal_dry_run", "fourd_sandbox",
      "publishing_disabled", "mock_mode", "draft_internal_only",
    ]) {
      assert.ok(keys.includes(k), `missing tooltip key ${k}`);
    }
  });
});

describe("Preview Studio — generate & update", () => {
  it("POST /generate works without env vars / providers", async () => {
    for (const k of [
      "OPENAI_API_KEY", "ELEVENLABS_API_KEY", "MESHY_API_KEY",
      "RUNWAY_API_KEY", "UNREAL_REMOTE_URL", "LOCAL_4D_BRIDGE_URL",
    ]) delete process.env[k];
    const r = await post("/api/admin/production-house/preview-studio/generate", {
      controls: { mode: "debate" },
    });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.state.scene.controls.mode, "debate");
  });

  it("POST /update-controls merges control changes", async () => {
    await post("/api/admin/production-house/preview-studio/generate", {
      controls: { mode: "newsroom" },
    });
    const r = await post("/api/admin/production-house/preview-studio/update-controls", {
      controls: { lowerThirdText: "Custom anchor title" },
    });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.state.scene.controls.lowerThirdText, "Custom anchor title");
    assert.equal(body.state.scene.controls.mode, "newsroom");
  });

  it("rejects invalid body with 400 JSON", async () => {
    const r = await post("/api/admin/production-house/preview-studio/generate", {
      controls: { mode: "not_a_real_mode" },
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, "invalid_body");
  });
});

describe("Preview Studio — safety locks", () => {
  it("every state has the full set of safety-locked fields", async () => {
    const r = await post("/api/admin/production-house/preview-studio/generate", {
      controls: { mode: "podcast" },
    });
    const body = await r.json();
    const s = body.state;
    assert.equal(s.status, "draft");
    assert.equal(s.approvalStatus, "draft");
    assert.equal(s.visibility, "admin_only_internal");
    assert.equal(s.publicUrl, null);
    assert.equal(s.signedUrl, null);
    assert.equal(s.realSendAllowed, false);
    assert.equal(s.executionEnabled, false);
    assert.equal(s.adminPreviewOnly, true);
    assert.equal(s.notRendered, true);
    assert.equal(s.notPublished, true);
    assert.equal(s.noUnrealExecution, true);
    assert.equal(s.noFourDHardware, true);
  });

  it("client cannot override safety fields via generate body", async () => {
    const r = await post("/api/admin/production-house/preview-studio/generate", {
      controls: { mode: "podcast" },
      realSendAllowed: true,
      executionEnabled: true,
      publicUrl: "https://evil.example.com",
      signedUrl: "https://evil.example.com/signed",
      notPublished: false,
      status: "published",
    });
    const body = await r.json();
    assert.equal(body.state.realSendAllowed, false);
    assert.equal(body.state.executionEnabled, false);
    assert.equal(body.state.publicUrl, null);
    assert.equal(body.state.signedUrl, null);
    assert.equal(body.state.notPublished, true);
    assert.equal(body.state.status, "draft");
  });

  it("safetyEnvelope on every state equals SAFETY_ENVELOPE", async () => {
    const r = await post("/api/admin/production-house/preview-studio/generate", {
      controls: { mode: "fourd_cinema" },
    });
    const body = await r.json();
    assert.deepEqual(body.state.safetyEnvelope, SAFETY_ENVELOPE);
    assert.equal(SafetyEnvelopeSchema.safeParse(body.state.safetyEnvelope).success, true);
  });
});

describe("Preview Studio — edit artifacts (compose image/video)", () => {
  it("POST /compose-image writes an internal artifact with full safety locks", async () => {
    const r = await post("/api/admin/production-house/preview-studio/compose-image", {
      label: "Test compose",
      sourceAssetIds: ["src_1", "src_2"],
      layers: [
        { label: "Background", kind: "background", x: 0, y: 0, w: 1, h: 1 },
        { label: "Anchor", kind: "avatar", x: 0.4, y: 0.5, w: 0.1, h: 0.2 },
      ],
      aspect: "16:9",
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    const a = body.artifact;
    assert.equal(a.kind, "image_compose");
    assert.ok(a.internalFilePath && !a.internalFilePath.startsWith("http"));
    assert.equal(a.mimeType, "image/svg+xml");
    assert.ok(a.byteSize > 0);
    assert.equal(a.publicUrl, null);
    assert.equal(a.signedUrl, null);
    assert.equal(a.realSendAllowed, false);
    assert.equal(a.executionEnabled, false);
    assert.equal(a.adminPreviewOnly, true);
    assert.equal(a.notRendered, true);
    assert.equal(a.notPublished, true);
    assert.equal(a.noUnrealExecution, true);
    assert.equal(a.noFourDHardware, true);
    assert.deepEqual(a.safetyEnvelope, SAFETY_ENVELOPE);
  });

  it("POST /compose-video-clip writes an internal storyboard manifest only", async () => {
    const r = await post("/api/admin/production-house/preview-studio/compose-video-clip", {
      label: "Test clip",
      durationSec: 6,
      layers: [{ label: "Background", kind: "background" }],
    });
    const body = await r.json();
    assert.equal(r.status, 200);
    const a = body.artifact;
    assert.equal(a.kind, "video_compose");
    assert.equal(a.mimeType, "application/json");
    assert.equal(a.durationSec, 6);
    assert.equal(a.publicUrl, null);
    assert.equal(a.signedUrl, null);
    assert.equal(a.realSendAllowed, false);
    assert.equal(a.notPublished, true);
  });

  it("client cannot override safety fields on compose-image", async () => {
    const r = await post("/api/admin/production-house/preview-studio/compose-image", {
      label: "evil",
      layers: [{ label: "bg", kind: "background" }],
      publicUrl: "https://evil.example.com",
      realSendAllowed: true,
      executionEnabled: true,
      notPublished: false,
    } as any);
    const body = await r.json();
    assert.equal(body.artifact.publicUrl, null);
    assert.equal(body.artifact.realSendAllowed, false);
    assert.equal(body.artifact.executionEnabled, false);
    assert.equal(body.artifact.notPublished, true);
  });

  it("GET /edit-artifacts lists composed artifacts", async () => {
    await post("/api/admin/production-house/preview-studio/compose-image", {
      label: "a", layers: [{ label: "bg", kind: "background" }],
    });
    await post("/api/admin/production-house/preview-studio/compose-video-clip", {
      label: "b", durationSec: 3, layers: [{ label: "bg", kind: "background" }],
    });
    const r = await get("/api/admin/production-house/preview-studio/edit-artifacts");
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.artifacts));
    assert.ok(body.artifacts.length >= 2);
    for (const a of body.artifacts) {
      assert.equal(a.publicUrl, null);
      assert.equal(a.signedUrl, null);
      assert.equal(a.realSendAllowed, false);
      assert.equal(a.executionEnabled, false);
    }
  });

  it("persists state + artifacts across a save/reload cycle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "psv-persist-"));
    try {
      const storageA = new FileProductionHouseStorage(dir);
      _setPreviewStudioStorageForTests(storageA);

      const generated = generatePreviewStudioState({ mode: "debate" });
      const updated = updatePreviewStudioControls({ lowerThirdText: "Persist me" });
      const img = composeStudioImage({
        label: "persisted image",
        sourceAssetIds: [],
        layers: [{ label: "bg", kind: "background" }],
        aspect: "16:9",
        camera: generated.scene.controls.camera,
        lighting: generated.scene.controls.lighting,
      } as any);
      const vid = composeStudioVideoClip({
        label: "persisted clip",
        sourceAssetIds: [],
        durationSec: 4,
        layers: [{ label: "bg", kind: "background" }],
        aspect: "16:9",
        camera: generated.scene.controls.camera,
        lighting: generated.scene.controls.lighting,
      } as any);

      const beforeStates = listPreviewStudioStates();
      const beforeArtifacts = listPreviewStudioEditArtifacts();
      assert.ok(beforeStates.length >= 2);
      assert.ok(beforeArtifacts.length >= 2);

      // Simulate a server restart: brand-new storage instance pointing at
      // the same directory, with the service caches cleared.
      const storageB = new FileProductionHouseStorage(dir);
      _setPreviewStudioStorageForTests(storageB);

      const afterStates = listPreviewStudioStates();
      const afterArtifacts = listPreviewStudioEditArtifacts();
      assert.equal(afterStates.length, beforeStates.length);
      assert.equal(afterArtifacts.length, beforeArtifacts.length);
      assert.equal(
        afterStates[afterStates.length - 1].scene.controls.lowerThirdText,
        "Persist me",
      );
      assert.ok(afterArtifacts.find((a) => a.id === img.id));
      assert.ok(afterArtifacts.find((a) => a.id === vid.id));

      // Safety: no public URL / signed URL ever serialized.
      for (const s of afterStates) {
        assert.equal(s.publicUrl, null);
        assert.equal(s.signedUrl, null);
      }
      for (const a of afterArtifacts) {
        assert.equal(a.publicUrl, null);
        assert.equal(a.signedUrl, null);
      }
      const pkg = getPreviewStudioPackageExport();
      assert.ok(pkg.previewStudioStates.length >= 2);
      assert.ok(pkg.previewStudioEditArtifacts.length >= 2);
    } finally {
      _setPreviewStudioStorageForTests(null);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rehydrates artifacts before compose so prior history is not overwritten", async () => {
    const dir = mkdtempSync(join(tmpdir(), "psv-compose-first-"));
    try {
      // Seed: create a state + image artifact, then "restart".
      _setPreviewStudioStorageForTests(new FileProductionHouseStorage(dir));
      const seedState = generatePreviewStudioState({ mode: "newsroom" });
      const seedImg = composeStudioImage({
        label: "seed image",
        sourceAssetIds: [],
        layers: [{ label: "bg", kind: "background" }],
        aspect: "16:9",
        camera: seedState.scene.controls.camera,
        lighting: seedState.scene.controls.lighting,
      } as any);

      // Simulate a fresh process: brand-new storage handle, cleared caches.
      // First action is compose — must NOT wipe the seeded artifact.
      _setPreviewStudioStorageForTests(new FileProductionHouseStorage(dir));
      const newImg = composeStudioImage({
        label: "post-restart image",
        sourceAssetIds: [],
        layers: [{ label: "bg", kind: "background" }],
        aspect: "16:9",
        camera: seedState.scene.controls.camera,
        lighting: seedState.scene.controls.lighting,
      } as any);

      const all = listPreviewStudioEditArtifacts();
      assert.ok(all.find((a) => a.id === seedImg.id), "seed artifact should survive");
      assert.ok(all.find((a) => a.id === newImg.id), "new artifact should be present");

      // And the next restart should still see both.
      _setPreviewStudioStorageForTests(new FileProductionHouseStorage(dir));
      const reloaded = listPreviewStudioEditArtifacts();
      assert.ok(reloaded.find((a) => a.id === seedImg.id));
      assert.ok(reloaded.find((a) => a.id === newImg.id));
    } finally {
      _setPreviewStudioStorageForTests(null);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("trims state + artifact history to the configured cap on overflow", async () => {
    const dir = mkdtempSync(join(tmpdir(), "psv-cap-"));
    const prev = process.env.PREVIEW_STUDIO_HISTORY_CAP;
    process.env.PREVIEW_STUDIO_HISTORY_CAP = "5";
    try {
      _setPreviewStudioStorageForTests(new FileProductionHouseStorage(dir));

      for (let i = 0; i < 12; i++) {
        generatePreviewStudioState({ mode: "newsroom" });
        composeStudioImage({
          label: `img-${i}`,
          sourceAssetIds: [],
          layers: [{ label: "bg", kind: "background" }],
          aspect: "16:9",
        } as any);
      }

      const inMemStates = listPreviewStudioStates();
      const inMemArtifacts = listPreviewStudioEditArtifacts();
      assert.equal(inMemStates.length, 5, "in-memory states trimmed to cap");
      assert.equal(inMemArtifacts.length, 5, "in-memory artifacts trimmed to cap");
      assert.equal(inMemArtifacts[inMemArtifacts.length - 1].label, "img-11");
      assert.equal(inMemArtifacts[0].label, "img-7");

      // Reload from disk — persisted file must also be trimmed to cap.
      _setPreviewStudioStorageForTests(new FileProductionHouseStorage(dir));
      const reloadedStates = listPreviewStudioStates();
      const reloadedArtifacts = listPreviewStudioEditArtifacts();
      assert.equal(reloadedStates.length, 5);
      assert.equal(reloadedArtifacts.length, 5);
      assert.equal(reloadedArtifacts[reloadedArtifacts.length - 1].label, "img-11");
      assert.equal(reloadedArtifacts[0].label, "img-7");
    } finally {
      if (prev === undefined) delete process.env.PREVIEW_STUDIO_HISTORY_CAP;
      else process.env.PREVIEW_STUDIO_HISTORY_CAP = prev;
      _setPreviewStudioStorageForTests(null);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("history cap can be read, updated, and reset via admin routes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "psv-cap-api-"));
    try {
      _setPreviewStudioStorageForTests(new FileProductionHouseStorage(dir));

      // Default cap = 200 when no env / override is set.
      const prev = process.env.PREVIEW_STUDIO_HISTORY_CAP;
      delete process.env.PREVIEW_STUDIO_HISTORY_CAP;

      const r0 = await get("/api/admin/production-house/preview-studio/history-cap");
      assert.equal(r0.status, 200);
      const b0 = await r0.json();
      assert.equal(b0.info.cap, 200);
      assert.equal(b0.info.source, "default");

      // Seed 8 states + 8 artifacts.
      for (let i = 0; i < 8; i++) {
        generatePreviewStudioState({ mode: "newsroom" });
        composeStudioImage({
          label: `cap-img-${i}`,
          sourceAssetIds: [],
          layers: [{ label: "bg", kind: "background" }],
          aspect: "16:9",
        } as any);
      }

      // Lower the cap to 3 — should trim down to 3 in memory and on disk.
      const r1 = await post(
        "/api/admin/production-house/preview-studio/history-cap",
        { cap: 3 },
      );
      assert.equal(r1.status, 200);
      const b1 = await r1.json();
      assert.equal(b1.ok, true);
      assert.equal(b1.info.cap, 3);
      assert.equal(b1.info.source, "admin");
      assert.equal(b1.info.states, 3);
      assert.equal(b1.info.editArtifacts, 3);
      assert.ok(b1.trimmedStates >= 5);
      assert.ok(b1.trimmedEditArtifacts >= 5);

      // Invalid values are rejected.
      const rBad1 = await post(
        "/api/admin/production-house/preview-studio/history-cap",
        { cap: 0 },
      );
      assert.equal(rBad1.status, 400);
      const rBad2 = await post(
        "/api/admin/production-house/preview-studio/history-cap",
        { cap: "abc" },
      );
      assert.equal(rBad2.status, 400);
      const rBad3 = await post(
        "/api/admin/production-house/preview-studio/history-cap",
        { cap: 1_000_000 },
      );
      assert.equal(rBad3.status, 400);

      // Persisted across reload.
      _setPreviewStudioStorageForTests(new FileProductionHouseStorage(dir));
      const r2 = await get("/api/admin/production-house/preview-studio/history-cap");
      const b2 = await r2.json();
      assert.equal(b2.info.cap, 3);
      assert.equal(b2.info.source, "admin");
      assert.equal(listPreviewStudioStates().length, 3);
      assert.equal(listPreviewStudioEditArtifacts().length, 3);

      // Reset clears the admin override.
      const r3 = await post(
        "/api/admin/production-house/preview-studio/history-cap",
        { reset: true },
      );
      const b3 = await r3.json();
      assert.equal(b3.ok, true);
      assert.equal(b3.info.cap, 200);
      assert.equal(b3.info.source, "default");

      if (prev === undefined) delete process.env.PREVIEW_STUDIO_HISTORY_CAP;
      else process.env.PREVIEW_STUDIO_HISTORY_CAP = prev;
    } finally {
      _setPreviewStudioStorageForTests(null);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("GET /package-export contains state + artifacts and no secrets/URLs", async () => {
    await post("/api/admin/production-house/preview-studio/generate", {
      controls: { mode: "newsroom" },
    });
    await post("/api/admin/production-house/preview-studio/compose-image", {
      label: "exp", layers: [{ label: "bg", kind: "background" }],
    });
    const r = await get("/api/admin/production-house/preview-studio/package-export");
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.previewStudioStates));
    assert.ok(Array.isArray(body.previewStudioEditArtifacts));
    assert.ok(body.previewStudioStates.length >= 1);
    assert.ok(body.previewStudioEditArtifacts.length >= 1);
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("https://"), false, "should contain no external URL");
    assert.equal(serialized.includes("API_KEY"), false);
    assert.equal(serialized.includes("Bearer "), false);
    assert.deepEqual(body.safetyEnvelope, SAFETY_ENVELOPE);
  });
});
