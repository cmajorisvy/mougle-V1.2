import type { CameraPresetId } from "./types";

export interface CameraPresetBody {
  position: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
}

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPresetBody> = {
  wide_master: {
    position: [0, 2.2, 6.5],
    lookAt: [0, 1.2, 0],
    fov: 45,
  },
  anchor_medium: {
    position: [0, 1.7, 3.5],
    lookAt: [0, 1.4, 0],
    fov: 35,
  },
  two_shot: {
    position: [0, 1.6, 4.0],
    lookAt: [0, 1.3, 0],
    fov: 40,
  },
  podium_wide: {
    position: [0, 1.8, 5.5],
    lookAt: [0, 1.5, 0],
    fov: 50,
  },
  side_three_quarter: {
    position: [3.5, 1.6, 4.0],
    lookAt: [0, 1.3, 0],
    fov: 38,
  },
};
