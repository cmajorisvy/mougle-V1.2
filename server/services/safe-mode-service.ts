import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { escalationService } from "./escalation-service";
import { founderControlService } from "./founder-control-service";
import { riskManagementService } from "./risk-management-service";
import {
  safeModeControls,
  socialDistributionAutomationSettings,
  type AutomationPolicy,
  type SafeModeControls,
  type SocialDistributionAutomationSettings,
} from "@shared/schema";

export const safeModeControlFields = [
  "globalSafeMode",
  "pauseAutonomousPublishing",
  "pauseMarketplaceApprovals",
  "pauseExternalAgentActions",
  "pauseSocialDistributionAutomation",
  "pauseYouTubeUploads",
  "pausePodcastAudioGeneration",
  "maintenanceBannerEnabled",
] as const;

export type SafeModeControlField = typeof safeModeControlFields[number];
export type SafeModeCapability =
  | "youtube_upload"
  | "social_safe_automation"
  | "marketplace_clone_approval"
  | "podcast_audio_generation"
  | "external_agent_action"
  | "agent_behavior_simulation";

export type SafeModeActor = {
  id: string;
  type: string;
};

export type SafeModeUpdateInput = Partial<Record<SafeModeControlField, boolean>> & {
  maintenanceBannerMessage?: string | null;
  reason: string;
};

export type SafeModeActionInput = {
  action: SafeModeControlField;
  enabled: boolean;
  maintenanceBannerMessage?: string | null;
  reason: string;
};

type CapabilityBlock = {
  capability: SafeModeCapability;
  blocked: boolean;
  reasons: string[];
  controls: SafeModeControlField[];
};

class SafeModeError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeReason(reason: unknown) {
  if (typeof reason !== "string" || !reason.trim()) {
    throw new SafeModeError(400, "A non-empty reason/comment is required for safe-mode changes.");
  }
  return reason.trim().slice(0, 1000);
}

function normalizeBannerMessage(message: unknown) {
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function evaluateCapability(controls: SafeModeControls, capability: SafeModeCapability): CapabilityBlock {
  if (capability === "agent_behavior_simulation") {
    return { capability, blocked: false, reasons: [], controls: [] };
  }

  const reasons: string[] = [];
  const fields: SafeModeControlField[] = [];

  if (capability === "youtube_upload" && controls.pauseYouTubeUploads) {
    reasons.push("YouTube uploads are paused by founder safe-mode controls.");
    fields.push("pauseYouTubeUploads");
  }
  if (capability === "social_safe_automation") {
    if (controls.pauseSocialDistributionAutomation) {
      reasons.push("Social distribution automation is paused by founder safe-mode controls.");
      fields.push("pauseSocialDistributionAutomation");
    }
    if (controls.pauseAutonomousPublishing) {
      reasons.push("Autonomous publishing is paused by founder safe-mode controls.");
      fields.push("pauseAutonomousPublishing");
    }
  }
  if (capability === "marketplace_clone_approval" && controls.pauseMarketplaceApprovals) {
    reasons.push("Marketplace approvals are paused by founder safe-mode controls.");
    fields.push("pauseMarketplaceApprovals");
  }
  if (capability === "podcast_audio_generation" && controls.pausePodcastAudioGeneration) {
    reasons.push("Podcast/audio generation is paused by founder safe-mode controls.");
    fields.push("pausePodcastAudioGeneration");
  }
  if (capability === "external_agent_action" && controls.pauseExternalAgentActions) {
    reasons.push("External agent actions are paused by founder safe-mode controls.");
    fields.push("pauseExternalAgentActions");
  }

  return {
    capability,
    blocked: reasons.length > 0,
    reasons,
    controls: fields,
  };
}

function changedRiskLevel(changedFields: string[], next: SafeModeControls) {
  const highRiskFields = new Set([
    "globalSafeMode",
    "pauseAutonomousPublishing",
    "pauseExternalAgentActions",
    "pauseYouTubeUploads",
    "pauseSocialDistributionAutomation",
  ]);
  if (changedFields.some((field) => highRiskFields.has(field) && Boolean((next as any)[field]))) {
    return "high";
  }
  return "medium";
}

function controlSnapshot(controls: SafeModeControls) {
  return {
    id: controls.id,
    globalSafeMode: controls.globalSafeMode,
    pauseAutonomousPublishing: controls.pauseAutonomousPublishing,
    pauseMarketplaceApprovals: controls.pauseMarketplaceApprovals,
    pauseExternalAgentActions: controls.pauseExternalAgentActions,
    pauseSocialDistributionAutomation: controls.pauseSocialDistributionAutomation,
    pauseYouTubeUploads: controls.pauseYouTubeUploads,
    pausePodcastAudioGeneration: controls.pausePodcastAudioGeneration,
    maintenanceBannerEnabled: controls.maintenanceBannerEnabled,
    maintenanceBannerMessage: controls.maintenanceBannerMessage,
    updatedBy: controls.updatedBy,
    lastReason: controls.lastReason,
    createdAt: controls.createdAt,
    updatedAt: controls.updatedAt,
  };
}

class SafeModeService {
  async getControls(): Promise<SafeModeControls> {
    const [existing] = await db
      .select()
      .from(safeModeControls)
      .orderBy(asc(safeModeControls.id))
      .limit(1);

    if (existing) return existing;

    const [created] = await db
      .insert(safeModeControls)
      .values({ lastReason: "Initial safe-mode control state" })
      .returning();

    return created;
  }

  async getStatus() {
    const [controls, automationPolicy, founderEmergencyStopped, socialSettings] = await Promise.all([
      this.getControls(),
      escalationService.getPolicy().catch(() => null as AutomationPolicy | null),
      founderControlService.isEmergencyStopped().catch(() => false),
      this.getLatestSocialAutomationSettings(),
    ]);

    const capabilities: SafeModeCapability[] = [
      "youtube_upload",
      "social_safe_automation",
      "marketplace_clone_approval",
      "podcast_audio_generation",
      "external_agent_action",
      "agent_behavior_simulation",
    ];

    return {
      controls,
      blockedCapabilities: capabilities.map((capability) => evaluateCapability(controls, capability)),
      relatedControls: {
        automationPolicy,
        founderEmergencyStopped,
        socialAutomationSettings: socialSettings,
      },
      safeguards: {
        rootAdminOnly: true,
        manualActionsOnly: true,
        globalSafeModeDoesNotBlockManualAdminWork: true,
        explicitPauseFlagsGateMatchingFlowsOnly: true,
        noAutonomousActivation: true,
        noSecretsExposed: true,
      },
      knownConflicts: [
        {
          key: "legacy_automation_policy_safe_mode",
          description:
            "The older command-center automation_policy.safeMode can still be toggled by legacy anomaly escalation. Phase 21 reports it as related state and does not broaden that behavior.",
          status: automationPolicy?.safeMode ? "active" : "inactive",
        },
        {
          key: "founder_control_emergency_stop",
          description:
            "Founder Control emergency_stop remains a separate broad automation stop. Phase 21 reads it but only explicit safe-mode pause flags gate the approved endpoints here.",
          status: founderEmergencyStopped ? "active" : "inactive",
        },
      ],
    };
  }

  async updateControls(input: SafeModeUpdateInput, actor: SafeModeActor) {
    const reason = normalizeReason(input.reason);
    const previous = await this.getControls();
    const update: Partial<typeof safeModeControls.$inferInsert> = {
      updatedBy: actor.id,
      lastReason: reason,
      updatedAt: new Date(),
    };

    for (const field of safeModeControlFields) {
      if (typeof input[field] === "boolean") {
        (update as any)[field] = input[field];
      }
    }

    if (Object.prototype.hasOwnProperty.call(input, "maintenanceBannerMessage")) {
      update.maintenanceBannerMessage = normalizeBannerMessage(input.maintenanceBannerMessage);
    }

    const [next] = await db
      .update(safeModeControls)
      .set(update)
      .where(eq(safeModeControls.id, previous.id))
      .returning();

    const changedFields = Object.keys(update)
      .filter((field) => !["updatedAt", "updatedBy", "lastReason"].includes(field))
      .filter((field) => (previous as any)[field] !== (next as any)[field]);

    await this.logChange({
      actor,
      previous,
      next,
      reason,
      changedFields,
      action: "safe_mode_controls_update",
    });

    return this.getStatus();
  }

  async applyAction(input: SafeModeActionInput, actor: SafeModeActor) {
    const reason = normalizeReason(input.reason);
    if (!safeModeControlFields.includes(input.action)) {
      throw new SafeModeError(400, "Unknown safe-mode action.");
    }

    const patch = { [input.action]: input.enabled, reason } as SafeModeUpdateInput;
    if (input.action === "maintenanceBannerEnabled" && input.maintenanceBannerMessage !== undefined) {
      patch.maintenanceBannerMessage = input.maintenanceBannerMessage;
    }
    return this.updateControls(patch, actor);
  }

  async assertCapabilityAllowed(capability: SafeModeCapability, actorId = "system") {
    const controls = await this.getControls();
    const result = evaluateCapability(controls, capability);
    if (!result.blocked) return;

    await riskManagementService.logAudit({
      actorId,
      actorType: "admin",
      action: "safe_mode_capability_blocked",
      resourceType: "safe_mode_controls",
      resourceId: String(controls.id),
      outcome: "denied",
      riskLevel: "medium",
      details: {
        capability,
        blockedBy: result.controls,
        reasons: result.reasons,
        controls: controlSnapshot(controls),
      },
    });

    throw new SafeModeError(423, result.reasons.join(" "));
  }

  private async getLatestSocialAutomationSettings(): Promise<SocialDistributionAutomationSettings | null> {
    const [settings] = await db
      .select()
      .from(socialDistributionAutomationSettings)
      .orderBy(desc(socialDistributionAutomationSettings.id))
      .limit(1);
    return settings || null;
  }

  private async logChange(input: {
    actor: SafeModeActor;
    previous: SafeModeControls;
    next: SafeModeControls;
    reason: string;
    changedFields: string[];
    action: string;
  }) {
    await riskManagementService.logAudit({
      actorId: input.actor.id,
      actorType: input.actor.type,
      action: input.action,
      resourceType: "safe_mode_controls",
      resourceId: String(input.next.id),
      outcome: "success",
      riskLevel: changedRiskLevel(input.changedFields, input.next),
      details: {
        reason: input.reason,
        changedFields: input.changedFields,
        previous: controlSnapshot(input.previous),
        next: controlSnapshot(input.next),
        explicitPauseFlagsOnly: true,
      },
    });
  }
}

export const safeModeService = new SafeModeService();
