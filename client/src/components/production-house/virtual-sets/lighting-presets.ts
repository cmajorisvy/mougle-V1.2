import type { LightingPresetId } from "./types";

export interface LightingPresetBody {
  ambientIntensity: number;
  keyPosition: [number, number, number];
  keyIntensity: number;
  keyColor: string;
  fillPosition: [number, number, number];
  fillIntensity: number;
  fillColor: string;
  background: string;
}

export const LIGHTING_PRESETS: Record<LightingPresetId, LightingPresetBody> = {
  neutral_studio: {
    ambientIntensity: 0.45,
    keyPosition: [5, 6, 4],
    keyIntensity: 1.0,
    keyColor: "#ffffff",
    fillPosition: [-4, 3, -2],
    fillIntensity: 0.3,
    fillColor: "#ffffff",
    background: "#0a0a0f",
  },
  warm_podcast: {
    ambientIntensity: 0.4,
    keyPosition: [3, 5, 3],
    keyIntensity: 0.9,
    keyColor: "#ffd9b0",
    fillPosition: [-3, 3, -1],
    fillIntensity: 0.25,
    fillColor: "#ffe7c8",
    background: "#1a1208",
  },
  high_key_debate: {
    ambientIntensity: 0.55,
    keyPosition: [4, 6, 4],
    keyIntensity: 1.2,
    keyColor: "#ffffff",
    fillPosition: [-4, 6, -4],
    fillIntensity: 0.5,
    fillColor: "#eef2ff",
    background: "#0c0e18",
  },
};
