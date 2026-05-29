import type {
  ApprovalRecord,
  HardwareTarget,
  MediaLicense,
  PublishableItem,
  SceneRealismMode,
} from "../../shared/safety-types";

export const licensedMedia: MediaLicense = {
  mediaId: "media-licensed-1",
  status: "licensed",
  tier: "stock_paid",
  source: "stock-provider",
  attribution: "Acme Stock",
  acquiredAt: new Date(Date.now() - 86_400_000).toISOString(),
};

export const ownedLicensedMedia: MediaLicense = {
  mediaId: "media-owned-1",
  status: "licensed",
  tier: "owned",
  source: "platform-original",
};

export const unlicensedMedia: MediaLicense = {
  mediaId: "media-unlicensed-1",
  status: "unlicensed",
  tier: "unknown",
  source: "scraped",
};

export const pendingMedia: MediaLicense = {
  mediaId: "media-pending-1",
  status: "pending_review",
  tier: "stock_paid",
  source: "stock-provider",
};

export const expiredMedia: MediaLicense = {
  mediaId: "media-expired-1",
  status: "licensed",
  tier: "stock_paid",
  source: "stock-provider",
  expiresAt: new Date(Date.now() - 1000).toISOString(),
};

export const unknownTierMedia: MediaLicense = {
  mediaId: "media-unknown-tier-1",
  status: "licensed",
  tier: "unknown",
  source: "unknown",
};

export const notRequiredApproval: ApprovalRecord = {
  actionId: "act-public-read",
  state: "not_required",
  requiresFounderApproval: false,
};

export const pendingApproval: ApprovalRecord = {
  actionId: "act-publish-1",
  state: "pending",
  requiresFounderApproval: true,
};

export const approvedApproval: ApprovalRecord = {
  actionId: "act-publish-2",
  state: "approved",
  requiresFounderApproval: true,
  approvedBy: "founder@mougle.com",
  approvedAt: new Date().toISOString(),
};

export const rejectedApproval: ApprovalRecord = {
  actionId: "act-publish-3",
  state: "rejected",
  requiresFounderApproval: true,
};

export const draftItem: PublishableItem = {
  itemId: "item-draft-1",
  mode: "draft",
  approval: notRequiredApproval,
};

export const previewItem: PublishableItem = {
  itemId: "item-preview-1",
  mode: "internal_preview",
  approval: pendingApproval,
};

export const publishedItem: PublishableItem = {
  itemId: "item-published-1",
  mode: "published",
  approval: approvedApproval,
};

export const scheduledUnapprovedItem: PublishableItem = {
  itemId: "item-sched-bad",
  mode: "scheduled",
  approval: pendingApproval,
};

export const scheduledApprovedItem: PublishableItem = {
  itemId: "item-sched-good",
  mode: "scheduled",
  approval: approvedApproval,
};

export const simulatedHardware: HardwareTarget = "simulated";
export const virtualActorHardware: HardwareTarget = "virtual_actor";
export const realHardware: HardwareTarget = "real_device";

export const stylizedScene: SceneRealismMode = "stylized";
export const syntheticScene: SceneRealismMode = "synthetic_preview";
export const liveUnrealScene: SceneRealismMode = "live_action_unreal";
