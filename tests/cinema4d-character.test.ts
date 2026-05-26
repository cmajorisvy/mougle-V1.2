import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerProductionHouseRoutes } from "../server/routes/production-house-routes";
import {
  SAFETY_ENVELOPE,
} from "../shared/production-house";
import {
  _resetForTests,
  buildCinema4DCharacterBindings,
  generateCinema4DAnchorCharacterManifest,
  generateCinema4DCharacterAccessoryManifest,
  generateCinema4DRoomCharacterScript,
  openCinema4DPreviewWithCharacter,
  getCinema4DNewsroomDownloadScript,
  buildCinema4DNewsroomDownloadPackage,
} from "../server/services/production-house-service";
import { _resetPreviewStudioForTests } from "../server/services/preview-studio-service";

const requireRootAdmin = (_req: any, res: any, next: any) => {
  if (res?.locals?.denyRootAdmin) return res.status(401).json({ message: "Unauthorized" });
  next();
};

function appWithStubAuth() {
  const app = express();
  app.use(express.json());
  registerProductionHouseRoutes(app, requireRootAdmin);
  return app;
}

function findRoute(app: express.Express, path: string, method: string) {
  const stack = ((app as any).router?.stack ?? (app as any)._router?.stack ?? []) as any[];
  return stack
    .map((layer) => layer?.route)
    .find((route) =>
      route?.path === path &&
      route?.methods?.[method.toLowerCase()]);
}

beforeEach(() => {
  _resetForTests();
  _resetPreviewStudioForTests();
});

describe("Cinema 4D character routes", () => {
  it("requires root-admin for character and accessory manifest routes", async () => {
    const app = appWithStubAuth();
    for (const [method, path] of [
      ["get", "/api/admin/production-house/cinema4d-studio/:roomId/download-script"],
      ["get", "/api/admin/production-house/cinema4d-studio/:roomId/download-package"],
      ["post", "/api/admin/production-house/cinema4d-studio/generate-character-manifest"],
      ["post", "/api/admin/production-house/cinema4d-studio/generate-accessory-manifest"],
      ["post", "/api/admin/production-house/cinema4d-studio/generate-room-character-script"],
      ["post", "/api/admin/production-house/cinema4d-studio/:roomId/open-preview-with-character"],
    ] as const) {
      const route = findRoute(app, path, method);
      assert.ok(route, `${path} route should be mounted`);
      assert.equal(route.stack[0]?.handle, requireRootAdmin, `${path} should run root-admin guard first`);
    }
  });

  it("rejects client attempts to override locked safety fields", async () => {
    const body = generateCinema4DAnchorCharacterManifest({
        characterName: "Unsafe Override Attempt",
        realSendAllowed: true,
        executionEnabled: true,
        publicUrl: "https://public.example/character.glb",
        signedUrl: "https://signed.example/character.glb?token=secret",
        visibility: "public",
      } as any);
    assert.equal(body.manifest.status, "draft");
    assert.equal(body.manifest.approvalStatus, "draft");
    assert.equal(body.manifest.visibility, "admin_only_internal");
    assert.equal(body.manifest.publicUrl, null);
    assert.equal(body.manifest.signedUrl, null);
    assert.equal(body.manifest.realSendAllowed, false);
    assert.equal(body.manifest.executionEnabled, false);
    assert.deepEqual(body.manifest.safetyEnvelope, SAFETY_ENVELOPE);
  });
});

describe("Cinema 4D character manifests and scripts", () => {
  it("generates an internal draft anchor character with locked safety", () => {
    const { manifest } = generateCinema4DAnchorCharacterManifest({
      characterName: "Mougle Verified Anchor",
      productionId: "prod_c4d",
      roomId: "room_newsroom",
      characterRole: "news_anchor",
      characterStyle: "premium_news_anchor",
      wardrobeStyle: "navy_suit",
      posePreset: "seated_desk_hands_folded",
      voiceAssetId: "voice_anchor_01",
    });
    assert.equal(manifest.status, "draft");
    assert.equal(manifest.approvalStatus, "draft");
    assert.equal(manifest.visibility, "admin_only_internal");
    assert.equal(manifest.publicUrl, null);
    assert.equal(manifest.signedUrl, null);
    assert.equal(manifest.realSendAllowed, false);
    assert.equal(manifest.executionEnabled, false);
    assert.deepEqual(manifest.safetyEnvelope, SAFETY_ENVELOPE);
  });

  it("generates accessory manifests as internal draft records", () => {
    const { manifest: character } = generateCinema4DAnchorCharacterManifest({
      characterName: "Accessory Anchor",
      roomId: "room_newsroom",
    });
    const { manifest } = generateCinema4DCharacterAccessoryManifest({
      characterId: character.characterId,
      roomId: "room_newsroom",
      accessoryType: "lavalier_mic",
    });
    assert.equal(manifest.characterId, character.characterId);
    assert.equal(manifest.visibility, "admin_only_internal");
    assert.equal(manifest.publicUrl, null);
    assert.equal(manifest.signedUrl, null);
    assert.equal(manifest.realSendAllowed, false);
    assert.equal(manifest.executionEnabled, false);
    assert.deepEqual(manifest.safetyEnvelope, SAFETY_ENVELOPE);
  });

  it("includes anchor root, head, body, hand, eye, and mouth markers in the generated script", () => {
    const { manifest: character } = generateCinema4DAnchorCharacterManifest({
      characterName: "Marker Anchor",
      roomId: "room_newsroom",
    });
    const { manifest } = generateCinema4DRoomCharacterScript({
      roomId: "room_newsroom",
      characterId: character.characterId,
      template: "mougle_verified_newsroom",
    });
    for (const marker of [
      "MGL_CHARACTER_Anchor_01_ROOT",
      "MGL_CHARACTER_Anchor_01_BODY",
      "MGL_CHARACTER_Anchor_01_HEAD",
      "MGL_CHARACTER_Anchor_01_LEFT_HAND",
      "MGL_CHARACTER_Anchor_01_RIGHT_HAND",
      "MGL_CHARACTER_Anchor_01_EYE_TARGET",
      "MGL_CHARACTER_Anchor_01_MOUTH_TARGET",
    ]) {
      assert.match(manifest.script, new RegExp(marker));
    }
  });

  it("includes newsroom desk, LED wall, ticker, lower-third, source panel, character root, and camera presets", () => {
    const { manifest: character } = generateCinema4DAnchorCharacterManifest({
      characterName: "Newsroom Anchor",
      roomId: "room_newsroom",
    });
    const { manifest } = generateCinema4DRoomCharacterScript({
      roomId: "room_newsroom",
      characterId: character.characterId,
      template: "mougle_verified_newsroom",
    });
    for (const marker of [
      "c4d.BaseObject",
      "c4d.Ocube",
      "c4d.Ocylinder",
      "c4d.Osphere",
      "c4d.Otorus",
      "c4d.Olight",
      "c4d.Ocamera",
      "MGL_ROOM_Floor",
      "MGL_ROOM_CurvedStudioFloor",
      "MGL_ROOM_BackWall",
      "MGL_LED_WorldMap",
      "MGL_PANEL_SourceConfidence",
      "MGL_PANEL_Claims",
      "MGL_PANEL_Timeline",
      "MGL_TICKER_Main",
      "MGL_LOWER_THIRD_Main",
      "MGL_ROOM_Glossy_Reflective_News_Desk",
      "MGL_ROOM_LED_WORLD_MAP_WALL",
      "MGL_ROOM_TICKER_STRIP",
      "MGL_ROOM_LOWER_THIRD_PANEL",
      "MGL_ROOM_SOURCE_PANEL",
      "MGL_CEILING_LIGHT_RING_Main",
      "MGL_LIGHT_Key_Blue_Area",
      "MGL_LIGHT_WarmGold_Rim_Area",
      "MGL_RS_READY_Premium_Blue_Glass",
      "MGL_OCTANE_READY_Deep_Navy_Wall",
      "MGL_RS_OCTANE_READY_Glossy_Reflective_Desk",
      "MGL_CHARACTER_Anchor_01_ROOT",
      "MGL_CHARACTER_Anchor_01_BODY",
      "MGL_CHARACTER_Anchor_01_HEAD",
      "MGL_CHARACTER_Anchor_01_LEFT_HAND",
      "MGL_CHARACTER_Anchor_01_RIGHT_HAND",
      "MGL_CHARACTER_Anchor_01_CHAIR",
      "MGL_CHARACTER_Anchor_01_LAV_MIC",
      "MGL_CHARACTER_Anchor_01_EARPIECE",
      "MGL_CHARACTER_Anchor_01_TABLET",
      "MGL_CHARACTER_Anchor_01_LAPTOP",
      "MGL_CHARACTER_Anchor_01_MOUTH_TARGET",
      "MGL_CHARACTER_Anchor_01_EYE_TARGET",
      "MGL_CAMERA_AnchorCloseup",
      "MGL_CAMERA_WideNewsroom",
      "MGL_CAMERA_PRESET_anchor_closeup",
      "MGL_CAMERA_PRESET_anchor_medium",
      "MGL_CAMERA_PRESET_anchor_over_shoulder",
      "MGL_CAMERA_PRESET_wide_newsroom",
      "MGL_CAMERA_PRESET_breaking_news_push_in",
    ]) {
      assert.match(manifest.script, new RegExp(marker));
    }
    assert.equal(manifest.realRenderCalled, false);
    assert.equal(manifest.unrealCommandSent, false);
    assert.equal(manifest.fourDCommandSent, false);
    assert.equal(manifest.published, false);
    assert.doesNotMatch(manifest.script, /RenderDocument|MovieRenderQueue|StartRendering|SendUnreal|Send4D|publish\(/i);
    assert.equal(manifest.qualityTier, "premium_draft");
    assert.ok(manifest.qualityNotes.some((note) => /human 3D expert review/i.test(note)));
  });

  it("includes podcast host and guest placeholders with two microphones", () => {
    const { manifest } = generateCinema4DRoomCharacterScript({
      roomId: "room_podcast",
      template: "mougle_podcast_studio",
      qualityTier: "expert_polish_required",
    });
    for (const marker of [
      "c4d.BaseObject",
      "c4d.Olight",
      "c4d.Ocamera",
      "MGL_PODCAST_ROOM_FLOOR",
      "MGL_PODCAST_TABLE_GLOSS",
      "MGL_PODCAST_VIDEO_WALL",
      "MGL_CHARACTER_Host_01_ROOT",
      "MGL_CHARACTER_Guest_01_ROOT",
      "MGL_PODCAST_MIC_HOST_01",
      "MGL_PODCAST_MIC_GUEST_01",
      "MGL_PODCAST_HEADSET_HOST_01",
      "MGL_PODCAST_HEADSET_GUEST_01",
      "MGL_CAMERA_PodcastTwoShot",
      "MGL_CAMERA_HostCloseup",
      "MGL_CAMERA_GuestCloseup",
      "MGL_CAMERA_PRESET_podcast_two_shot",
      "MGL_CAMERA_PRESET_host_closeup",
      "MGL_CAMERA_PRESET_guest_closeup",
    ]) {
      assert.match(manifest.script, new RegExp(marker));
    }
    assert.equal(manifest.qualityTier, "expert_polish_required");
    assert.doesNotMatch(manifest.script, /RenderDocument|MovieRenderQueue|StartRendering|SendUnreal|Send4D|publish\(/i);
  });
});

describe("Cinema 4D downloadable newsroom package", () => {
  it("returns the generated Python script attachment payload with required final marker names", () => {
    const result = getCinema4DNewsroomDownloadScript("room_download");
    assert.equal(result.filename, "mougle-cinema4d-newsroom-script.py");
    assert.equal(result.contentType, "text/x-python");
    for (const marker of [
      "c4d.BaseObject",
      "c4d.Olight",
      "c4d.Ocamera",
      "MGL_ROOM_Floor",
      "MGL_ROOM_CurvedStudioFloor",
      "MGL_ROOM_BackWall",
      "MGL_LED_WorldMap",
      "MGL_PANEL_SourceConfidence",
      "MGL_PANEL_Claims",
      "MGL_PANEL_Timeline",
      "MGL_TICKER_Main",
      "MGL_LOWER_THIRD_Main",
      "MGL_CHARACTER_Anchor_01_ROOT",
      "MGL_CHARACTER_Anchor_01_BODY",
      "MGL_CHARACTER_Anchor_01_HEAD",
      "MGL_CHARACTER_Anchor_01_LEFT_HAND",
      "MGL_CHARACTER_Anchor_01_RIGHT_HAND",
      "MGL_CAMERA_AnchorCloseup",
      "MGL_CAMERA_WideNewsroom",
    ]) {
      assert.match(result.script, new RegExp(marker));
    }
    assert.match(result.script, /Final cinema-quality output still requires Cinema 4D rendering and human 3D expert review/);
    assert.equal(result.manifest.status, "draft");
    assert.equal(result.manifest.approvalStatus, "draft");
    assert.equal(result.manifest.visibility, "admin_only_internal");
    assert.equal(result.manifest.publicUrl, null);
    assert.equal(result.manifest.signedUrl, null);
    assert.equal(result.manifest.realSendAllowed, false);
    assert.equal(result.manifest.executionEnabled, false);
    assert.equal(result.manifest.realRenderCalled, false);
    assert.equal(result.manifest.unrealCommandSent, false);
    assert.equal(result.manifest.fourDCommandSent, false);
    assert.equal(result.manifest.published, false);
    assert.equal(result.manifest.qualityTier, "premium_draft");
  });

  it("builds a sanitized ZIP package containing only required draft files", () => {
    const pkg = buildCinema4DNewsroomDownloadPackage("room_download");
    assert.equal(pkg.filename, "mougle-cinema4d-newsroom-package.zip");
    assert.equal(pkg.contentType, "application/zip");
    assert.equal(pkg.zip.slice(0, 4).toString("latin1"), "PK\u0003\u0004");
    for (const name of [
      "cinema4d-newsroom-script.py",
      "room-manifest.json",
      "anchor-character-manifest.json",
      "accessories-manifest.json",
      "verified-newsroom-bindings.json",
      "unreal-scene-manifest-draft.json",
      "README.md",
    ]) {
      assert.ok(Object.hasOwn(pkg.files, name), `${name} should be in package files`);
      assert.ok(pkg.zip.toString("latin1").includes(name), `${name} should be present in ZIP`);
    }
    const joined = Object.values(pkg.files).join("\n");
    assert.doesNotMatch(joined, /\.env|node_modules|DATABASE_URL|OPENAI_API_KEY|apiKey|api_key|providerPrivateUrl/i);
    assert.doesNotMatch(joined, /https?:\/\//i);
    assert.doesNotMatch(joined, /RenderDocument|MovieRenderQueue|StartRendering|SendUnreal|Send4D|publish\(/i);
    assert.match(pkg.files["README.md"], /real scene-construction script/i);
    assert.match(pkg.files["README.md"], /human 3D expert review/i);
    assert.equal(pkg.characterManifest.status, "draft");
    assert.equal(pkg.characterManifest.approvalStatus, "draft");
    assert.equal(pkg.characterManifest.visibility, "admin_only_internal");
    assert.equal(pkg.characterManifest.publicUrl, null);
    assert.equal(pkg.characterManifest.signedUrl, null);
    assert.equal(pkg.characterManifest.realSendAllowed, false);
    assert.equal(pkg.characterManifest.executionEnabled, false);
    assert.deepEqual(pkg.characterManifest.safetyEnvelope, SAFETY_ENVELOPE);
    for (const accessory of pkg.accessoriesManifest) {
      assert.equal(accessory.status, "draft");
      assert.equal(accessory.approvalStatus, "draft");
      assert.equal(accessory.visibility, "admin_only_internal");
      assert.equal(accessory.publicUrl, null);
      assert.equal(accessory.signedUrl, null);
      assert.equal(accessory.realSendAllowed, false);
      assert.equal(accessory.executionEnabled, false);
      assert.deepEqual(accessory.safetyEnvelope, SAFETY_ENVELOPE);
    }
    assert.equal(pkg.scriptManifest.status, "draft");
    assert.equal(pkg.scriptManifest.approvalStatus, "draft");
    assert.equal(pkg.scriptManifest.realRenderCalled, false);
    assert.equal(pkg.scriptManifest.unrealCommandSent, false);
    assert.equal(pkg.scriptManifest.fourDCommandSent, false);
    assert.equal(pkg.scriptManifest.published, false);
    assert.equal(pkg.scriptManifest.qualityTier, "premium_draft");
  });
});

describe("Cinema 4D character bindings and Preview Studio", () => {
  it("maps speaker, voice, lower-third, teleprompter, and panel focus correctly", () => {
    const { manifest: character } = generateCinema4DAnchorCharacterManifest({
      characterName: "Mougle Anchor",
      voiceAssetId: "voice_anchor_01",
    });
    const bindings = buildCinema4DCharacterBindings({
      scriptSpeakerMap: { [character.characterId]: "Anika Rao" },
      lowerThirdName: "Anika Rao · Mougle Verified News",
      verifiedHeadline: "Tech sector leads market rally",
      script: "Tonight on Mougle News, the tech sector leads a verified market rally.",
      confidenceScore: 94,
      sources: ["Market close report", "Mougle source panel"],
      claims: ["Investors show renewed confidence"],
    }, character);
    assert.equal(bindings.characterId, character.characterId);
    assert.equal(bindings.lowerThirdName, "Anika Rao · Mougle Verified News");
    assert.equal(bindings.voiceAssetId, "voice_anchor_01");
    assert.match(bindings.teleprompterText, /tech sector leads/i);
    assert.match(bindings.panelFocus, /headline/i);
    assert.equal(bindings.cameraPreset, "anchor_medium");
    assert.ok(bindings.cueMarkers.some((m) => m.includes(character.characterId)));
  });

  it("opens a safe Preview Studio state with character metadata and no real execution flags", () => {
    const { manifest: character } = generateCinema4DAnchorCharacterManifest({
      characterName: "Preview Anchor",
      productionId: "prod_preview",
      roomId: "room_newsroom",
      wardrobeStyle: "black_blazer",
      posePreset: "seated_desk_tablet",
    });
    const result = openCinema4DPreviewWithCharacter("room_newsroom", {
      productionId: "prod_preview",
      characterId: character.characterId,
      newsroomDataPackage: {
        verifiedHeadline: "Verified headline maps to teleprompter",
        lowerThirdName: "Preview Anchor · Internal",
      },
    });
    assert.equal(result.realSendAllowed, false);
    assert.equal(result.executionEnabled, false);
    assert.equal(result.realRenderCalled, false);
    assert.equal(result.unrealCommandSent, false);
    assert.equal(result.fourDCommandSent, false);
    assert.equal(result.published, false);
    assert.equal(result.state.adminPreviewOnly, true);
    assert.equal(result.state.notRendered, true);
    assert.equal(result.state.notPublished, true);
    assert.equal(result.state.noUnrealExecution, true);
    assert.equal(result.state.noFourDHardware, true);
    assert.deepEqual(result.safetyEnvelope, SAFETY_ENVELOPE);
    assert.equal(result.state.characterIds[0], character.characterId);
    assert.equal(result.state.characterRole, "news_anchor");
    assert.equal(result.state.wardrobeStyle, "black_blazer");
    assert.equal(result.state.posePreset, "seated_desk_tablet");
    assert.match(result.state.teleprompterText ?? "", /Verified headline/);
    assert.match(result.previewLabel, /Character Preview Only/);
  });
});
