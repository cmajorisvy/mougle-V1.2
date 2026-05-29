import {
  type ApprovalRecord,
  type HardwareTarget,
  type MediaLicense,
  type PublishableItem,
  type SafetyGateId,
  type SceneRealismMode,
  SafetyGateError,
} from "../../shared/safety-types";

export {
  SafetyGateError,
  SAFETY_GATE_IDS,
  type LicenseStatus,
  type LicenseTier,
  type MediaLicense,
  type ApprovalState,
  type ApprovalRecord,
  type PublishingMode,
  type PublishableItem,
  type HardwareTarget,
  type SceneRealismMode,
  type SafetyGateId,
} from "../../shared/safety-types";

function fail(gateId: SafetyGateId, message: string, subject?: string): never {
  throw new SafetyGateError(gateId, message, subject);
}

export function assertLicensed(media: MediaLicense | null | undefined): asserts media is MediaLicense {
  if (!media) {
    fail("licensed_media_only", "Media license record is missing");
  }
  if (media.status !== "licensed") {
    fail(
      "licensed_media_only",
      `Media ${media.mediaId} has non-licensed status "${media.status}"`,
      media.mediaId,
    );
  }
  if (media.tier === "unknown") {
    fail(
      "licensed_media_only",
      `Media ${media.mediaId} has unknown license tier`,
      media.mediaId,
    );
  }
  if (media.expiresAt && new Date(media.expiresAt).getTime() <= Date.now()) {
    fail(
      "licensed_media_only",
      `Media ${media.mediaId} license expired at ${media.expiresAt}`,
      media.mediaId,
    );
  }
}

export function assertNotPublished(item: PublishableItem | null | undefined): asserts item is PublishableItem {
  if (!item) {
    fail("no_premature_publish", "Publishable item is missing");
  }
  if (item.mode === "published") {
    fail(
      "no_premature_publish",
      `Item ${item.itemId} is already published`,
      item.itemId,
    );
  }
  if (item.mode === "scheduled" && item.approval.state !== "approved") {
    fail(
      "no_premature_publish",
      `Item ${item.itemId} is scheduled without approval`,
      item.itemId,
    );
  }
}

export function assertNotRealHardware(target: HardwareTarget | null | undefined): void {
  if (target === "real_device") {
    fail(
      "no_real_hardware",
      "Operation is not allowed against real hardware in this pipeline",
    );
  }
  if (target == null) {
    fail("no_real_hardware", "Hardware target is missing — refusing to default to real");
  }
}

export function assertNotLiveUnreal(mode: SceneRealismMode | null | undefined): void {
  if (mode === "live_action_unreal") {
    fail(
      "no_live_unreal_scenes",
      "Live-action unreal scenes are not allowed; use stylized or synthetic_preview",
    );
  }
  if (mode == null) {
    fail("no_live_unreal_scenes", "Scene realism mode is missing");
  }
}

export interface ApprovalGateContext {
  action: string;
  approval: ApprovalRecord | null | undefined;
}

export function assertApprovalRequired(ctx: ApprovalGateContext): void {
  const { action, approval } = ctx;
  if (!approval) {
    fail(
      "founder_approval_required",
      `Action "${action}" has no approval record`,
      action,
    );
  }
  if (!approval.requiresFounderApproval) {
    return;
  }
  if (approval.state !== "approved") {
    fail(
      "founder_approval_required",
      `Action "${action}" requires founder approval (state=${approval.state})`,
      action,
    );
  }
  if (!approval.approvedBy) {
    fail(
      "founder_approval_required",
      `Action "${action}" approval missing approver identity`,
      action,
    );
  }
}

export function requireFounderApproval(approval: ApprovalRecord | null | undefined, action: string): void {
  assertApprovalRequired({ action, approval });
}
