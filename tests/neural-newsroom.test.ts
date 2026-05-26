import { test } from "node:test";
import assert from "node:assert/strict";

import { apexloadOptimizerService } from "../server/services/apexload-newsroom-optimizer";
import { precognitionPlannerService, type ScriptBeat } from "../server/services/precognition-newsroom-planner";
import { flowstateConductorService } from "../server/services/flowstate-newsroom-conductor";
import { broadcastGradeScreenSafetyService } from "../server/services/broadcast-grade-screen-safety-service";
import { virtualProductionScreenDirectorService } from "../server/services/virtual-production-screen-director";
import { computeCTotal, tierBandFor } from "../server/services/neural-newsroom/confidence-vector";
import { neuralNewsroomBus, __redactForDisplay } from "../server/services/neural-newsroom-bus";
import type { ScreenIntent } from "../shared/neural-newsroom-schema";

const GOOD_CONFIDENCE = {
  cSource: 0.95,
  cVerification: 0.95,
  cLicense: 0.95,
  cScreenMatch: 0.95,
  cSensitivity: 0.95,
  cAudienceSafety: 0.95,
  cFallback: 0.95,
};

function intent(over: Partial<ScreenIntent> = {}): ScreenIntent {
  return {
    productionId: "prod_test",
    storyId: "story_test",
    requestedBy: "ai_anchor",
    sourceId: "src_owned_1",
    sourceLicenseStatus: "owned",
    sourceApprovalStatus: "approved",
    sourceMatchesStory: true,
    sourceType: "owned_graphic",
    hasWatermark: false,
    watermarkRemoved: false,
    logoStripped: false,
    containsPrivateAdminData: false,
    presetId: "preset_event_wall_default",
    action: "fullscreen_take",
    transition: "cut",
    durationMs: 0,
    cropRect: null,
    zoomRect: null,
    sensitivityClass: "normal",
    anchorMode: "calm",
    robotMode: "calm",
    fallbackSourceId: null,
    fallbackPresetId: "preset_world_map_default",
    restoreDefaultRouteId: "preset_world_map_default",
    confidence: { ...GOOD_CONFIDENCE },
    ...over,
  };
}

test("ApexLoad + PreCognition outputs carry the full safety envelope (hardwareSendAllowed=false, notPublished=true)", () => {
  const apex = apexloadOptimizerService.decide({
    storyId: "s_envelope", sourceReliability: 0.9, verificationConfidence: 0.9,
    impactScore: 80, freshnessScore: 80, regionalImportance: 80,
    publicInterest: 80, visualPotential: 80, rightsReadiness: 80,
  });
  assert.equal(apex.hardwareSendAllowed, false);
  assert.equal(apex.notPublished, true);
  assert.equal(apex.realSendAllowed, false);
  assert.equal(apex.executionEnabled, false);
  assert.equal(apex.publicUrl, null);
  assert.equal(apex.signedUrl, null);
  assert.equal(apex.visibility, "admin_only_internal");
  assert.equal(apex.approvalStatus, "draft");
  assert.ok(apex.safetyEnvelope.safetyEnvelopeLocked);

  const plan = precognitionPlannerService.plan({
    productionId: "p_env", storyId: "s_env",
    restoreDefaultRouteId: "preset_world_map_default",
    beats: [{
      beatId: "b1", startsAtSec: 0, expectedVisualNeed: "map",
      selectedSourceId: "x", sourceLicenseStatus: "owned",
      sourceApprovalStatus: "approved", sourceMatchesStory: true,
      targetScreenObjectName: "event_wall_screen", presetId: "preset_event_wall_default",
      anchorMode: "calm", robotMode: "calm", sensitivityClass: "normal",
      fallbackSourceId: null, fallbackPresetId: "preset_world_map_default",
      confidence: { ...GOOD_CONFIDENCE },
    }],
  });
  assert.equal(plan.hardwareSendAllowed, false);
  assert.equal(plan.notPublished, true);
  assert.equal(plan.realSendAllowed, false);
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.publicUrl, null);
  assert.equal(plan.signedUrl, null);
  assert.equal(plan.visibility, "admin_only_internal");
  assert.equal(plan.approvalStatus, "draft");
  assert.ok(plan.safetyEnvelope.safetyEnvelopeLocked);
});

test("ApexLoad: tier thresholds (text_only < 40, voice <60, read <75, full <90, cinematic ≥90)", () => {
  // Cinematic floor: all metrics maxed → score = 100 → cinematic.
  const cinematic = apexloadOptimizerService.decide({
    storyId: "s1", sourceReliability: 1, verificationConfidence: 1,
    impactScore: 100, freshnessScore: 100, regionalImportance: 100,
    publicInterest: 100, visualPotential: 100, rightsReadiness: 100,
  });
  assert.equal(cinematic.productionTier, "cinematic_4d_treatment");
  assert.equal(cinematic.approvalStatus, "draft");
  assert.equal(cinematic.realSendAllowed, false);
  assert.equal(cinematic.executionEnabled, false);
  assert.ok(cinematic.safetyEnvelope.notPublished);

  // Text-only floor: all zero → score 0.
  const text = apexloadOptimizerService.decide({
    storyId: "s2", sourceReliability: 0, verificationConfidence: 0,
    impactScore: 0, freshnessScore: 0, regionalImportance: 0,
    publicInterest: 0, visualPotential: 0, rightsReadiness: 0,
  });
  assert.equal(text.productionTier, "text_only");
});

test("Confidence vector uses MIN, not average; tier bands map correctly", () => {
  // verified, but unsafe media → C_license low → MIN must be 0.2, not the avg.
  const cTotal = computeCTotal({
    cSource: 0.95, cVerification: 0.95, cLicense: 0.2,
    cScreenMatch: 0.95, cSensitivity: 0.95, cAudienceSafety: 1, cFallback: 0.95,
  });
  assert.equal(cTotal, 0.2);
  assert.equal(tierBandFor(cTotal), "reject");
  assert.equal(tierBandFor(0.91), "auto");
  assert.equal(tierBandFor(0.8), "assisted");
  assert.equal(tierBandFor(0.6), "review");
});

test("PreCognition: missing fallback + unapproved source blocks fullscreen", () => {
  const beat: ScriptBeat = {
    beatId: "b1", startsAtSec: 0, expectedVisualNeed: "map",
    selectedSourceId: "src1", sourceLicenseStatus: "rights_unknown",
    sourceApprovalStatus: "unapproved", sourceMatchesStory: false,
    targetScreenObjectName: "event_wall_screen", presetId: "preset_event_wall_default",
    anchorMode: "calm", robotMode: "calm", sensitivityClass: "normal",
    fallbackSourceId: null, fallbackPresetId: "preset_world_map_default",
    confidence: { ...GOOD_CONFIDENCE, cLicense: 0.1 },
  };
  const plan = precognitionPlannerService.plan({
    productionId: "p1", storyId: "s1", beats: [beat],
    restoreDefaultRouteId: "preset_world_map_default",
  });
  assert.equal(plan.scriptBeatPlans[0].fullscreenAllowed, false);
  assert.ok(plan.scriptBeatPlans[0].blockers.length > 0);
  assert.equal(plan.approvalStatus, "draft");
  assert.equal(plan.realSendAllowed, false);
  assert.ok(plan.safetyEnvelope.notPublished);
});

test("PreCognition: sensitive story rejects playful anchor/robot modes", () => {
  const beat: ScriptBeat = {
    beatId: "b1", startsAtSec: 0, expectedVisualNeed: "map",
    selectedSourceId: "src1", sourceLicenseStatus: "owned",
    sourceApprovalStatus: "approved", sourceMatchesStory: true,
    targetScreenObjectName: "event_wall_screen", presetId: "preset_event_wall_default",
    anchorMode: "playful_hype", robotMode: "calm", sensitivityClass: "war",
    fallbackSourceId: null, fallbackPresetId: "preset_world_map_default",
    confidence: { ...GOOD_CONFIDENCE },
  };
  const plan = precognitionPlannerService.plan({
    productionId: "p1", storyId: "s1", beats: [beat],
    restoreDefaultRouteId: "preset_world_map_default",
  });
  assert.ok(plan.scriptBeatPlans[0].blockers.includes("anchor_mode_not_allowed_for_sensitive"));
});

test("FlowState: only declared transitions are allowed; kill_switch only goes back to idle", () => {
  flowstateConductorService.reset();
  assert.equal(flowstateConductorService.get().state, "idle");
  // idle → focused_explainer is illegal.
  const bad = flowstateConductorService.transition("focused_explainer");
  assert.equal(bad.ok, false);
  // idle → calm_read is legal.
  const good = flowstateConductorService.transition("calm_read");
  assert.equal(good.ok, true);
  // calm_read → kill_switch is legal.
  assert.equal(flowstateConductorService.transition("kill_switch").ok, true);
  // kill_switch → calm_read is illegal.
  assert.equal(flowstateConductorService.transition("calm_read").ok, false);
  // kill_switch → idle is legal.
  assert.equal(flowstateConductorService.transition("idle").ok, true);
});

test("Screen safety: happy path passes and persists with locked envelope", async () => {
  const result = await broadcastGradeScreenSafetyService.runIntent(intent());
  assert.equal(result.validation.passed, true);
  assert.equal(result.failedClosed, false);
  assert.equal(result.takePlan.realSendAllowed, false);
  assert.equal(result.takePlan.executionEnabled, false);
  assert.equal(result.takePlan.hardwareSendAllowed, false);
  assert.equal(result.takePlan.notPublished, true);
  assert.equal(result.takePlan.visibility, "admin_only_internal");
  assert.equal(result.takePlan.publicUrl, null);
  assert.equal(result.takePlan.signedUrl, null);
  assert.ok(result.takePlan.safetyEnvelope.safetyEnvelopeLocked);
});

test("Screen safety: prohibited license fails closed to world map", async () => {
  const result = await broadcastGradeScreenSafetyService.runIntent(
    intent({ sourceLicenseStatus: "prohibited" }),
  );
  assert.equal(result.failedClosed, true);
  assert.equal(result.takePlan.presetId, "preset_world_map_default");
  assert.equal(result.takePlan.action, "restore_default");
  assert.ok(result.blockers.includes("noCopyrightViolation"));
});

test("Screen safety: watermark removal and logo strip are blocked", async () => {
  const result = await broadcastGradeScreenSafetyService.runIntent(
    intent({ watermarkRemoved: true, logoStripped: true }),
  );
  assert.equal(result.failedClosed, true);
  assert.ok(result.blockers.includes("noWatermarkRemoval"));
  assert.ok(result.blockers.includes("noLogoStripping"));
});

test("Screen safety: mismatched source is blocked", async () => {
  const result = await broadcastGradeScreenSafetyService.runIntent(
    intent({ sourceMatchesStory: false }),
  );
  assert.equal(result.failedClosed, true);
  assert.ok(result.blockers.includes("sourceMatchesStory"));
});

test("Screen safety: out-of-bounds crop is blocked", async () => {
  const result = await broadcastGradeScreenSafetyService.runIntent(
    intent({ cropRect: { x: -100, y: 0, w: 4000, h: 3000 } }),
  );
  assert.equal(result.failedClosed, true);
  assert.ok(result.blockers.includes("cropWithinBounds"));
});

test("Screen safety: private admin data is blocked", async () => {
  const result = await broadcastGradeScreenSafetyService.runIntent(
    intent({ containsPrivateAdminData: true }),
  );
  assert.equal(result.failedClosed, true);
  assert.ok(result.blockers.includes("noPrivateAdminData"));
});

test("Virtual director: anchor and robot intents tag requestedBy correctly", async () => {
  const a = await virtualProductionScreenDirectorService.buildTakePlanFromAnchorIntent(
    intent() as any,
  );
  assert.equal(a.takePlan.requestedBy, "ai_anchor");
  const r = await virtualProductionScreenDirectorService.buildTakePlanFromRobotIntent(
    intent() as any,
  );
  assert.equal(r.takePlan.requestedBy, "robot_explainer");
});

test("Bus: display redaction strips admin fields", () => {
  const out = __redactForDisplay({
    storyId: "s1",
    adminId: "admin_42",
    secret: "shh",
    nested: { approvedBy: "root", title: "ok", apiKey: "x" },
    items: [{ password: "no", value: 1 }],
  }) as any;
  assert.equal(out.adminId, undefined);
  assert.equal(out.secret, undefined);
  assert.equal(out.nested.approvedBy, undefined);
  assert.equal(out.nested.apiKey, undefined);
  assert.equal(out.items[0].password, undefined);
  assert.equal(out.items[0].value, 1);
  assert.equal(out.storyId, "s1");
});

test("Bus: non-whitelisted display subscriber is refused", () => {
  neuralNewsroomBus.reset();
  assert.throws(() =>
    neuralNewsroomBus.subscribe("screen.take_simulated", {
      id: "stranger", type: "display", handler: () => {},
    }),
  );
});

test("Bus: display subscriber cannot subscribe to non-display events", () => {
  neuralNewsroomBus.reset();
  neuralNewsroomBus.whitelistDisplaySubscriber("preview_studio");
  // Non-display admin-only event must be refused for display subscribers.
  assert.throws(() =>
    neuralNewsroomBus.subscribe("screen.take_requested", {
      id: "preview_studio", type: "display", handler: () => {},
    }),
  );
  // Admin subscribers still allowed on the same event.
  neuralNewsroomBus.subscribe("screen.take_requested", {
    id: "admin_sink", type: "admin", handler: () => {},
  });
});

test("Bus: display subscribers always receive redacted payloads (defense in depth)", () => {
  neuralNewsroomBus.reset();
  neuralNewsroomBus.whitelistDisplaySubscriber("preview_studio");
  let displayPayload: any = null;
  let adminPayload: any = null;
  neuralNewsroomBus.subscribe("screen.take_simulated", {
    id: "preview_studio", type: "display",
    handler: (e) => { displayPayload = e.payload; },
  });
  neuralNewsroomBus.subscribe("screen.take_simulated", {
    id: "admin_sink", type: "admin",
    handler: (e) => { adminPayload = e.payload; },
  });
  neuralNewsroomBus.emit("screen.take_simulated", {
    takePlanId: "tp1", storyId: "s1",
    adminId: "admin_secret_42", signedUrl: "https://secret/x",
  });
  assert.equal(displayPayload.adminId, undefined);
  assert.equal(displayPayload.signedUrl, undefined);
  assert.equal(displayPayload.takePlanId, "tp1");
  // Admin subscribers still see the full payload.
  assert.equal(adminPayload.adminId, "admin_secret_42");
  assert.equal(adminPayload.signedUrl, "https://secret/x");
});

test("Screen safety: failed-closed plan stores world-map routing fields consistently", async () => {
  const result = await broadcastGradeScreenSafetyService.runIntent(
    intent({ sourceLicenseStatus: "prohibited", cropRect: { x: 10, y: 10, w: 100, h: 100 } }),
  );
  assert.equal(result.failedClosed, true);
  assert.equal(result.takePlan.presetId, "preset_world_map_default");
  assert.equal(result.takePlan.action, "restore_default");
  assert.equal(result.takePlan.targetScreenObjectName, "world_map_screen");
  assert.equal(result.takePlan.screenRole, "world_map");
  // Crop/zoom from the rejected intent must be dropped on fail-closed.
  assert.equal(result.takePlan.cropRect, null);
  assert.equal(result.takePlan.zoomRect, null);
});
