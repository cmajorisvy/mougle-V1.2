export type SetType = "newsroom" | "podcast_room" | "debate_room";

export type CameraPresetId =
  | "wide_master"
  | "anchor_medium"
  | "two_shot"
  | "podium_wide"
  | "side_three_quarter";

export type LightingPresetId =
  | "neutral_studio"
  | "warm_podcast"
  | "high_key_debate";

export type AssetSlotKind =
  | "chair"
  | "desk"
  | "anchor_stand"
  | "podium"
  | "mic_stand"
  | "screen"
  | "prop"
  | "light"
  | "camera";

export interface AssetSlot {
  id: string;
  kind: AssetSlotKind;
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  required: boolean;
}

export interface ScreenPanel {
  id: string;
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  caption: string;
}

export interface SafetyEnvelope {
  readonly adminOnly: true;
  readonly staticPrototype: true;
  readonly noDataBinding: true;
  readonly noRender: true;
  readonly noPublishing: true;
  readonly noProviderCalls: true;
}

export interface ScenePackageManifest {
  setType: SetType;
  title: string;
  description: string;
  assetSlots: AssetSlot[];
  cameraPreset: CameraPresetId;
  lightingPreset: LightingPresetId;
  screenPanels: ScreenPanel[];
  safetyEnvelope: SafetyEnvelope;
}

export const SAFETY_ENVELOPE: SafetyEnvelope = {
  adminOnly: true,
  staticPrototype: true,
  noDataBinding: true,
  noRender: true,
  noPublishing: true,
  noProviderCalls: true,
};
