export type LicenseStatus =
  | "licensed"
  | "unlicensed"
  | "pending_review"
  | "expired"
  | "revoked";

export type LicenseTier =
  | "owned"
  | "stock_paid"
  | "creative_commons"
  | "fair_use_claim"
  | "unknown";

export interface MediaLicense {
  mediaId: string;
  status: LicenseStatus;
  tier: LicenseTier;
  source: string;
  attribution?: string;
  licenseUrl?: string;
  expiresAt?: string;
  acquiredAt?: string;
}

export type ApprovalState =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface ApprovalRecord {
  actionId: string;
  state: ApprovalState;
  requiresFounderApproval: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export type PublishingMode =
  | "draft"
  | "internal_preview"
  | "scheduled"
  | "published"
  | "killed";

export interface PublishableItem {
  itemId: string;
  mode: PublishingMode;
  approval: ApprovalRecord;
}

export type HardwareTarget = "simulated" | "virtual_actor" | "real_device";

export type SceneRealismMode =
  | "stylized"
  | "synthetic_preview"
  | "live_action_unreal";

export const SAFETY_GATE_IDS = [
  "licensed_media_only",
  "no_premature_publish",
  "no_real_hardware",
  "no_live_unreal_scenes",
  "founder_approval_required",
  "no_watermark_removal",
  "no_logo_stripping",
  "no_external_publish_without_approval",
  "kill_switch_respected",
  "cost_gate_enforced",
] as const;

export type SafetyGateId = (typeof SAFETY_GATE_IDS)[number];

export class SafetyGateError extends Error {
  readonly gateId: SafetyGateId;
  readonly subject?: string;
  constructor(gateId: SafetyGateId, message: string, subject?: string) {
    super(`[safety:${gateId}] ${message}`);
    this.name = "SafetyGateError";
    this.gateId = gateId;
    this.subject = subject;
  }
}
