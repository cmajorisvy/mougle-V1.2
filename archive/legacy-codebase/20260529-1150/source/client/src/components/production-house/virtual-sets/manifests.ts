import { SAFETY_ENVELOPE, type ScenePackageManifest, type SetType } from "./types";

export const NEWSROOM_MANIFEST: ScenePackageManifest = {
  setType: "newsroom",
  title: "Newsroom — anchor desk",
  description:
    "Static newsroom layout: anchor stand + long desk + two chairs + one screen panel. Camera: wide_master. Lighting: neutral_studio.",
  cameraPreset: "wide_master",
  lightingPreset: "neutral_studio",
  assetSlots: [
    {
      id: "newsroom-anchor",
      kind: "anchor_stand",
      label: "Anchor stand",
      position: [0, 0, 0.6],
      rotation: [0, 0, 0],
      scale: 1,
      required: true,
    },
    {
      id: "newsroom-desk",
      kind: "desk",
      label: "Anchor desk",
      position: [0, 0, 1.4],
      rotation: [0, 0, 0],
      scale: 1,
      required: true,
    },
    {
      id: "newsroom-chair-left",
      kind: "chair",
      label: "Co-host chair (left)",
      position: [-0.9, 0, 1.8],
      rotation: [0, 0.2, 0],
      scale: 1,
      required: true,
    },
    {
      id: "newsroom-chair-right",
      kind: "chair",
      label: "Co-host chair (right)",
      position: [0.9, 0, 1.8],
      rotation: [0, -0.2, 0],
      scale: 1,
      required: true,
    },
  ],
  screenPanels: [
    {
      id: "newsroom-screen-main",
      label: "World map",
      position: [0, 2.0, -1.2],
      rotation: [0, 0, 0],
      size: [2.6, 1.4],
      caption: "World map · empty frame",
    },
  ],
  safetyEnvelope: SAFETY_ENVELOPE,
};

export const PODCAST_ROOM_MANIFEST: ScenePackageManifest = {
  setType: "podcast_room",
  title: "Podcast room — two-host table",
  description:
    "Static podcast layout: round desk + two chairs + two mic stands + one screen panel. Camera: two_shot. Lighting: warm_podcast.",
  cameraPreset: "two_shot",
  lightingPreset: "warm_podcast",
  assetSlots: [
    {
      id: "podcast-desk",
      kind: "desk",
      label: "Round desk",
      position: [0, 0, 0.8],
      rotation: [0, 0, 0],
      scale: 1,
      required: true,
    },
    {
      id: "podcast-chair-left",
      kind: "chair",
      label: "Host chair (left)",
      position: [-1.1, 0, 1.2],
      rotation: [0, 0.4, 0],
      scale: 1,
      required: true,
    },
    {
      id: "podcast-chair-right",
      kind: "chair",
      label: "Host chair (right)",
      position: [1.1, 0, 1.2],
      rotation: [0, -0.4, 0],
      scale: 1,
      required: true,
    },
    {
      id: "podcast-mic-left",
      kind: "mic_stand",
      label: "Mic (left)",
      position: [-0.6, 0, 0.6],
      rotation: [0, 0, 0],
      scale: 1,
      required: true,
    },
    {
      id: "podcast-mic-right",
      kind: "mic_stand",
      label: "Mic (right)",
      position: [0.6, 0, 0.6],
      rotation: [0, 0, 0],
      scale: 1,
      required: true,
    },
  ],
  screenPanels: [
    {
      id: "podcast-screen-title",
      label: "Show title",
      position: [0, 2.2, -1.2],
      rotation: [0, 0, 0],
      size: [2.0, 1.0],
      caption: "Show title · empty frame",
    },
  ],
  safetyEnvelope: SAFETY_ENVELOPE,
};

export const DEBATE_ROOM_MANIFEST: ScenePackageManifest = {
  setType: "debate_room",
  title: "Debate room — two podiums",
  description:
    "Static debate layout: two podiums + two side screens. Camera: wide_master. Lighting: high_key_debate.",
  cameraPreset: "wide_master",
  lightingPreset: "high_key_debate",
  assetSlots: [
    {
      id: "debate-podium-a",
      kind: "podium",
      label: "Podium A (left)",
      position: [-1.6, 0, 0.4],
      rotation: [0, 0.25, 0],
      scale: 1,
      required: true,
    },
    {
      id: "debate-podium-b",
      kind: "podium",
      label: "Podium B (right)",
      position: [1.6, 0, 0.4],
      rotation: [0, -0.25, 0],
      scale: 1,
      required: true,
    },
  ],
  screenPanels: [
    {
      id: "debate-screen-left",
      label: "Side A screen",
      position: [-2.4, 2.0, -1.0],
      rotation: [0, 0.4, 0],
      size: [1.6, 1.0],
      caption: "Side A · empty frame",
    },
    {
      id: "debate-screen-right",
      label: "Side B screen",
      position: [2.4, 2.0, -1.0],
      rotation: [0, -0.4, 0],
      size: [1.6, 1.0],
      caption: "Side B · empty frame",
    },
  ],
  safetyEnvelope: SAFETY_ENVELOPE,
};

export const MANIFESTS: Record<SetType, ScenePackageManifest> = {
  newsroom: NEWSROOM_MANIFEST,
  podcast_room: PODCAST_ROOM_MANIFEST,
  debate_room: DEBATE_ROOM_MANIFEST,
};
