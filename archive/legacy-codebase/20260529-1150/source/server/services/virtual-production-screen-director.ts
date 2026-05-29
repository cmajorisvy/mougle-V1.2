/**
 * Virtual Production Screen Director (Spec §7).
 *
 * Thin façade that converts anchor / robot / system intents into
 * ScreenTakePlans by delegating to the Broadcast-Grade Screen Safety
 * validator. Never bypasses safety — every action becomes a validated
 * ScreenTakePlan record.
 */

import {
  broadcastGradeScreenSafetyService,
  type TakePlanResult,
} from "./broadcast-grade-screen-safety-service";
import {
  type ScreenIntent,
  ScreenIntentSchema,
} from "../../shared/neural-newsroom-schema";
import { neuralNewsroomBus } from "./neural-newsroom-bus";

export class VirtualProductionScreenDirectorService {
  async buildTakePlanFromAnchorIntent(intent: Omit<ScreenIntent, "requestedBy">): Promise<TakePlanResult> {
    const full = { ...intent, requestedBy: "ai_anchor" as const };
    neuralNewsroomBus.emit("anchor.beat_started", {
      productionId: full.productionId,
      storyId: full.storyId,
      beatId: full.currentScriptBeatId,
      action: full.action,
    });
    return broadcastGradeScreenSafetyService.runIntent(ScreenIntentSchema.parse(full));
  }

  async buildTakePlanFromRobotIntent(intent: Omit<ScreenIntent, "requestedBy">): Promise<TakePlanResult> {
    const full = { ...intent, requestedBy: "robot_explainer" as const };
    neuralNewsroomBus.emit("robot.intent_created", {
      productionId: full.productionId,
      storyId: full.storyId,
      beatId: full.currentScriptBeatId,
      action: full.action,
    });
    return broadcastGradeScreenSafetyService.runIntent(ScreenIntentSchema.parse(full));
  }

  async buildTakePlanFromSystemIntent(intent: Omit<ScreenIntent, "requestedBy">): Promise<TakePlanResult> {
    const full = { ...intent, requestedBy: "system_director" as const };
    return broadcastGradeScreenSafetyService.runIntent(ScreenIntentSchema.parse(full));
  }

  async restoreDefaultScreenRoute(productionId: string, storyId: string): Promise<void> {
    await broadcastGradeScreenSafetyService.failClosedToWorldMap(productionId, storyId, "restore_default");
  }
}

export const virtualProductionScreenDirectorService = new VirtualProductionScreenDirectorService();
