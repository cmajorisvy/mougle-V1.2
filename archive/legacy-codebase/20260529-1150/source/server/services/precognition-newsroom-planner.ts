/**
 * PreCognition Planner — predicts screen, anchor, robot, legal visual, chat,
 * and 4D cue needs before each script beat plays (Spec §2).
 *
 * All output is draft / admin_only_internal. Fullscreen is blocked whenever
 * the source is rights_unknown / prohibited / unapproved / mismatched.
 */

import {
  SAFETY_ENVELOPE_LOCKED,
  type SafetyEnvelope,
  type SensitivityClass,
} from "../../shared/neural-newsroom-schema";
import {
  computeCTotal,
  tierBandFor,
  vectorAsRecord,
  type ConfidenceVector,
} from "./neural-newsroom/confidence-vector";

export interface ScriptBeat {
  beatId: string;
  startsAtSec: number;
  expectedVisualNeed: string;
  selectedSourceId: string | null;
  sourceLicenseStatus: "licensed" | "owned" | "rights_unknown" | "prohibited";
  sourceApprovalStatus: "approved" | "unapproved";
  sourceMatchesStory: boolean;
  targetScreenObjectName: string;
  presetId: string;
  anchorMode: string;
  robotMode: string;
  sensitivityClass: SensitivityClass;
  fallbackSourceId: string | null;
  fallbackPresetId: string;
  confidence: ConfidenceVector;
}

export interface PreCognitionInput {
  productionId: string;
  storyId: string;
  broadcastBriefId?: string | null;
  newsroomScreenDataId?: string | null;
  legalEventVisualPlanId?: string | null;
  beats: ScriptBeat[];
  restoreDefaultRouteId: string;
}

export interface ScriptBeatPlan {
  beatId: string;
  startsAtSec: number;
  expectedVisualNeed: string;
  selectedSourceId: string | null;
  targetScreenObjectName: string;
  presetId: string;
  anchorMode: string;
  robotMode: string;
  sensitivityClass: SensitivityClass;
  fallbackSourceId: string | null;
  fallbackPresetId: string;
  confidenceVector: Record<string, number>;
  cTotal: number;
  tierBand: ReturnType<typeof tierBandFor>;
  fullscreenAllowed: boolean;
  blockers: string[];
}

export interface PreCognitionPlan {
  planId: string;
  storyId: string;
  productionId: string;
  scriptBeatPlans: ScriptBeatPlan[];
  preloadSources: string[];
  screenTakePlans: Array<{
    beatId: string;
    presetId: string;
    action: string;
    fallbackPresetId: string;
  }>;
  robotIntentPlans: Array<{ beatId: string; robotMode: string }>;
  anchorModePlan: Array<{ beatId: string; anchorMode: string }>;
  fallbackRoutes: Array<{ beatId: string; fallbackPresetId: string; restoreDefaultRouteId: string }>;
  validationStatus: "pending" | "passed" | "failed";
  approvalStatus: "draft";
  visibility: "admin_only_internal";
  publicUrl: null;
  signedUrl: null;
  realSendAllowed: false;
  executionEnabled: false;
  hardwareSendAllowed: false;
  notPublished: true;
  safetyEnvelope: SafetyEnvelope;
  createdAt: string;
}

function isSensitive(c: SensitivityClass): boolean {
  return c !== "normal";
}

function fullscreenAllowed(beat: ScriptBeat): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (beat.sourceLicenseStatus === "rights_unknown") blockers.push("rights_unknown");
  if (beat.sourceLicenseStatus === "prohibited") blockers.push("license_prohibited");
  if (beat.sourceApprovalStatus !== "approved") blockers.push("source_unapproved");
  if (!beat.sourceMatchesStory) blockers.push("source_mismatch");
  if (!beat.fallbackPresetId) blockers.push("missing_fallback");
  return { ok: blockers.length === 0, blockers };
}

export class PreCognitionPlannerService {
  private recent: PreCognitionPlan[] = [];

  listRecent(limit = 50): PreCognitionPlan[] {
    return this.recent.slice(-limit).reverse();
  }

  plan(input: PreCognitionInput): PreCognitionPlan {
    const scriptBeatPlans: ScriptBeatPlan[] = input.beats.map((beat) => {
      const cTotal = computeCTotal(beat.confidence);
      const band = tierBandFor(cTotal);
      const fs = fullscreenAllowed(beat);
      // Sensitive stories may not use playful anchor / robot modes.
      const blockers = [...fs.blockers];
      if (isSensitive(beat.sensitivityClass)) {
        if (/(playful|excited|hype|comedy)/i.test(beat.anchorMode)) blockers.push("anchor_mode_not_allowed_for_sensitive");
        if (/(playful|excited|hype|comedy)/i.test(beat.robotMode)) blockers.push("robot_mode_not_allowed_for_sensitive");
      }
      if (!beat.fallbackPresetId) blockers.push("missing_fallback");
      return {
        beatId: beat.beatId,
        startsAtSec: beat.startsAtSec,
        expectedVisualNeed: beat.expectedVisualNeed,
        selectedSourceId: beat.selectedSourceId,
        targetScreenObjectName: beat.targetScreenObjectName,
        presetId: beat.presetId,
        anchorMode: beat.anchorMode,
        robotMode: beat.robotMode,
        sensitivityClass: beat.sensitivityClass,
        fallbackSourceId: beat.fallbackSourceId,
        fallbackPresetId: beat.fallbackPresetId,
        confidenceVector: vectorAsRecord(beat.confidence),
        cTotal,
        tierBand: band,
        fullscreenAllowed: fs.ok && band !== "reject",
        blockers,
      };
    });

    const preloadSources = Array.from(
      new Set(scriptBeatPlans.map((b) => b.selectedSourceId).filter((s): s is string => !!s)),
    );

    const plan: PreCognitionPlan = {
      planId: `pcg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      storyId: input.storyId,
      productionId: input.productionId,
      scriptBeatPlans,
      preloadSources,
      screenTakePlans: scriptBeatPlans.map((b) => ({
        beatId: b.beatId,
        presetId: b.presetId,
        action: b.fullscreenAllowed ? "fullscreen_take" : "preview_source",
        fallbackPresetId: b.fallbackPresetId,
      })),
      robotIntentPlans: scriptBeatPlans.map((b) => ({ beatId: b.beatId, robotMode: b.robotMode })),
      anchorModePlan: scriptBeatPlans.map((b) => ({ beatId: b.beatId, anchorMode: b.anchorMode })),
      fallbackRoutes: scriptBeatPlans.map((b) => ({
        beatId: b.beatId,
        fallbackPresetId: b.fallbackPresetId,
        restoreDefaultRouteId: input.restoreDefaultRouteId,
      })),
      validationStatus: scriptBeatPlans.every((b) => b.blockers.length === 0) ? "passed" : "pending",
      approvalStatus: "draft",
      visibility: "admin_only_internal",
      publicUrl: null,
      signedUrl: null,
      realSendAllowed: false,
      executionEnabled: false,
      hardwareSendAllowed: false,
      notPublished: true,
      safetyEnvelope: { ...SAFETY_ENVELOPE_LOCKED },
      createdAt: new Date().toISOString(),
    };
    this.recent.push(plan);
    if (this.recent.length > 200) this.recent.splice(0, this.recent.length - 200);
    return plan;
  }
}

export const precognitionPlannerService = new PreCognitionPlannerService();
