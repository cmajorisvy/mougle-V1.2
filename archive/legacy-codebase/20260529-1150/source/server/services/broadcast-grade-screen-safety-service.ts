/**
 * Broadcast-Grade Screen Safety Service (Spec §9).
 *
 * Deterministic validator + simulator for ScreenTakePlans. Final authority
 * for what the Virtual Screen Director may do. Any failure fails closed to
 * the world map + safe lower-third.
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  screenPresets,
  screenTakePlans,
  screenSafetyValidations,
  SAFETY_ENVELOPE_LOCKED,
  type ScreenPresetRow,
  type ScreenTakePlanRow,
  type ScreenSafetyValidationRow,
  type ScreenIntent,
  ScreenIntentSchema,
  type SensitivityClass,
} from "../../shared/neural-newsroom-schema";
import {
  computeCTotal,
  tierBandFor,
  vectorAsRecord,
} from "./neural-newsroom/confidence-vector";
import { neuralNewsroomBus } from "./neural-newsroom-bus";

const WORLD_MAP_PRESET_ID = "preset_world_map_default";

const SENSITIVITY_ALLOWED_MODES: Record<SensitivityClass, string[]> = {
  normal: ["calm", "explain", "alert", "serious", "acknowledge"],
  sensitive: ["serious", "calm"],
  disaster: ["serious", "alert"],
  war: ["serious"],
  crime: ["serious"],
  medical: ["serious", "calm"],
  children: ["serious"],
  active_crisis: ["serious", "alert"],
};

function withinSafeArea(
  rect: { x: number; y: number; w: number; h: number } | null | undefined,
  safe: { x: number; y: number; w: number; h: number },
): boolean {
  if (!rect) return true;
  return (
    rect.x >= safe.x &&
    rect.y >= safe.y &&
    rect.x + rect.w <= safe.x + safe.w &&
    rect.y + rect.h <= safe.y + safe.h
  );
}

export interface TakePlanResult {
  takePlan: ScreenTakePlanRow;
  validation: ScreenSafetyValidationRow;
  failedClosed: boolean;
  blockers: string[];
}

export class BroadcastGradeScreenSafetyService {
  private async preset(presetId: string): Promise<ScreenPresetRow | null> {
    const rows = await db.select().from(screenPresets).where(eq(screenPresets.presetId, presetId)).limit(1);
    return rows[0] ?? null;
  }

  /** Build + validate + persist a take plan from a director intent. */
  async runIntent(rawIntent: ScreenIntent): Promise<TakePlanResult> {
    const intent = ScreenIntentSchema.parse(rawIntent);
    const preset = await this.preset(intent.presetId);
    const fallbackPreset = await this.preset(intent.fallbackPresetId);
    const restorePreset = await this.preset(intent.restoreDefaultRouteId);

    const cTotal = computeCTotal(intent.confidence);
    const band = tierBandFor(cTotal);

    const checks: Record<string, boolean> = {
      sourceMatchesStory: intent.sourceMatchesStory,
      sourceLicenseAllowed: intent.sourceLicenseStatus === "licensed" || intent.sourceLicenseStatus === "owned",
      sourceApproved: intent.sourceApprovalStatus === "approved",
      noCopyrightViolation: intent.sourceLicenseStatus !== "prohibited",
      noWatermarkRemoval: !intent.watermarkRemoved,
      noLogoStripping: !intent.logoStripped,
      noPrivateAdminData: !intent.containsPrivateAdminData,
      targetScreenKnown: !!preset,
      presetKnown: !!preset,
      cropWithinBounds: !!preset && withinSafeArea(intent.cropRect, preset.safeArea) && withinSafeArea(intent.zoomRect, preset.safeArea),
      fallbackExists: !!fallbackPreset && !!restorePreset,
      sensitivityModeAllowed: !!preset && preset.allowedSensitivityClasses.includes(intent.sensitivityClass),
      anchorModeAllowed: SENSITIVITY_ALLOWED_MODES[intent.sensitivityClass].includes(intent.anchorMode) || intent.sensitivityClass === "normal",
      robotModeAllowed: SENSITIVITY_ALLOWED_MODES[intent.sensitivityClass].includes(intent.robotMode) || intent.sensitivityClass === "normal",
      noRealHardware: true, // architecturally guaranteed
      noPublishing: true, // architecturally guaranteed
      safetyEnvelopeLocked: true,
    };

    // Preview/route actions don't require an approved + matching source.
    const lightActions = new Set(["preview_source", "restore_default"]);
    if (lightActions.has(intent.action)) {
      checks.sourceApproved = checks.sourceApproved || true;
      checks.sourceMatchesStory = checks.sourceMatchesStory || true;
      checks.sourceLicenseAllowed = checks.sourceLicenseAllowed || true;
    }

    const blockers = Object.entries(checks)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (band === "reject") blockers.push("confidence_below_tier_floor");

    const passed = blockers.length === 0;
    const failedClosed = !passed;

    // Fail-closed: route to world map + restore default + light action only.
    // All routing fields must align with the world-map preset when failed.
    const worldMapPreset = failedClosed ? await this.preset(WORLD_MAP_PRESET_ID) : null;
    const effectivePresetId = failedClosed ? WORLD_MAP_PRESET_ID : intent.presetId;
    const effectiveAction = failedClosed ? "restore_default" : intent.action;
    const effectiveTargetScreenObjectName = failedClosed
      ? (worldMapPreset?.targetScreenObjectName ?? "world_map_screen")
      : (preset?.targetScreenObjectName ?? "world_map_screen");
    const effectiveScreenRole = failedClosed
      ? (worldMapPreset?.screenRole ?? "world_map")
      : (preset?.screenRole ?? "world_map");
    const effectiveCropRect = failedClosed ? null : (intent.cropRect ?? null);
    const effectiveZoomRect = failedClosed ? null : (intent.zoomRect ?? null);

    const takePlanId = `take_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const [insertedPlan] = await db.insert(screenTakePlans).values({
      takePlanId,
      productionId: intent.productionId,
      storyId: intent.storyId,
      broadcastBriefId: intent.broadcastBriefId ?? null,
      screenDataId: intent.screenDataId ?? null,
      visualPlanId: intent.visualPlanId ?? null,
      requestedBy: intent.requestedBy,
      mode: "fully_automatic_simulation",
      currentScriptBeatId: intent.currentScriptBeatId ?? null,
      sourceId: intent.sourceId ?? null,
      sourceLicenseStatus: intent.sourceLicenseStatus,
      sourceApprovalStatus: intent.sourceApprovalStatus,
      targetScreenObjectName: effectiveTargetScreenObjectName,
      targetOutputId: null,
      screenRole: effectiveScreenRole,
      presetId: effectivePresetId,
      action: effectiveAction,
      transition: intent.transition,
      durationMs: intent.durationMs,
      cropRect: effectiveCropRect,
      zoomRect: effectiveZoomRect,
      fallbackSourceId: intent.fallbackSourceId ?? null,
      fallbackPresetId: intent.fallbackPresetId,
      restoreDefaultRouteId: intent.restoreDefaultRouteId,
      sensitivityClass: intent.sensitivityClass,
      confidenceVector: vectorAsRecord(intent.confidence),
      cTotal,
      tierBand: band,
      validationStatus: passed ? "passed" : "failed",
      approvalStatus: "draft",
      visibility: "admin_only_internal",
      publicUrl: null,
      signedUrl: null,
      realSendAllowed: false,
      executionEnabled: false,
      hardwareSendAllowed: false,
      notPublished: true,
      safetyEnvelope: { ...SAFETY_ENVELOPE_LOCKED },
    }).returning();

    const validationId = `val_${takePlanId}`;
    const [insertedVal] = await db.insert(screenSafetyValidations).values({
      validationId,
      takePlanId,
      passed,
      blockers,
      warnings: [],
      checks,
    }).returning();

    neuralNewsroomBus.emit("screen.take_requested", { takePlanId, intent });
    neuralNewsroomBus.emit("screen.take_validated", { takePlanId, passed, blockers });
    if (passed) {
      neuralNewsroomBus.emit("screen.take_simulated", {
        takePlanId,
        presetId: effectivePresetId,
        action: effectiveAction,
        storyId: intent.storyId,
      });
    } else {
      neuralNewsroomBus.emit("fallback.triggered", {
        takePlanId,
        restoredPresetId: WORLD_MAP_PRESET_ID,
        reason: blockers.join(","),
      });
    }

    return {
      takePlan: insertedPlan,
      validation: insertedVal,
      failedClosed,
      blockers,
    };
  }

  async failClosedToWorldMap(productionId: string, storyId: string, reason: string): Promise<void> {
    neuralNewsroomBus.emit("fallback.triggered", {
      productionId,
      storyId,
      restoredPresetId: WORLD_MAP_PRESET_ID,
      reason,
    });
  }

  async killSwitch(reason: string): Promise<void> {
    neuralNewsroomBus.emit("kill_switch.activated", { reason, at: new Date().toISOString() });
  }

  async listRecentTakePlans(limit = 50): Promise<ScreenTakePlanRow[]> {
    return await db.select().from(screenTakePlans).orderBy(screenTakePlans.createdAt).limit(limit);
  }

  async listRecentValidations(limit = 50): Promise<ScreenSafetyValidationRow[]> {
    return await db.select().from(screenSafetyValidations).orderBy(screenSafetyValidations.checkedAt).limit(limit);
  }

  async listPresets(): Promise<ScreenPresetRow[]> {
    return await db.select().from(screenPresets);
  }
}

export const broadcastGradeScreenSafetyService = new BroadcastGradeScreenSafetyService();
