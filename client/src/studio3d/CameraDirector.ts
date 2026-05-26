import * as THREE from "three";
import gsap from "gsap";
import { CAMERA_PRESETS } from "./types";
import { fbm } from "./PerlinNoise";

export class CameraDirector {
  public camera: THREE.PerspectiveCamera;
  private currentTarget = new THREE.Vector3(0, 1.2, 0);
  private targetPosition = new THREE.Vector3();
  private targetLookAt = new THREE.Vector3();
  private basePosition = new THREE.Vector3();
  private baseLookAt = new THREE.Vector3(0, 1.2, 0);
  private activeSpeakerIndex: number = -1;
  private transitionTween: gsap.core.Tween | null = null;
  private zoomTween: gsap.core.Tween | null = null;
  private noiseOffset: number;
  private baseFov: number = 35;
  private targetFov: number = 35;
  private dofNear: number = 2;
  private dofFar: number = 15;
  private driftPhase: number = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
    this.noiseOffset = Math.random() * 500;
    this.setPreset("wide", false);
  }

  setPreset(
    presetName: keyof typeof CAMERA_PRESETS,
    animate: boolean = true
  ): void {
    const preset = CAMERA_PRESETS[presetName];
    if (!preset) return;

    this.targetPosition.copy(preset.position);
    this.targetLookAt.copy(preset.lookAt);

    const isSpeakerShot = presetName.startsWith("speaker") || presetName.startsWith("overShoulder");
    this.targetFov = isSpeakerShot ? 30 : presetName === "dramatic" ? 28 : 35;

    if (animate) {
      this.animateTo(preset.position, preset.lookAt, 2.2);
      this.animateZoom(this.targetFov, 2.5);
    } else {
      this.camera.position.copy(preset.position);
      this.basePosition.copy(preset.position);
      this.currentTarget.copy(preset.lookAt);
      this.baseLookAt.copy(preset.lookAt);
      this.camera.fov = this.targetFov;
      this.baseFov = this.targetFov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.currentTarget);
    }
  }

  focusOnSpeaker(speakerIndex: number): void {
    if (speakerIndex === this.activeSpeakerIndex) return;
    this.activeSpeakerIndex = speakerIndex;

    const presetKey = `speaker${speakerIndex}` as keyof typeof CAMERA_PRESETS;
    const preset = CAMERA_PRESETS[presetKey];
    if (!preset) {
      this.setPreset("wide");
      return;
    }

    const useOverShoulder = Math.random() > 0.6;
    if (useOverShoulder && speakerIndex !== 1) {
      const overKey = speakerIndex === 0 ? "overShoulder01" : "overShoulder12";
      this.setPreset(overKey as keyof typeof CAMERA_PRESETS);
    } else {
      this.setPreset(presetKey);
    }
  }

  goWide(): void {
    this.activeSpeakerIndex = -1;
    this.setPreset("wide");
  }

  goDramatic(): void {
    this.setPreset("dramatic");
  }

  private animateTo(
    position: THREE.Vector3,
    lookAt: THREE.Vector3,
    duration: number
  ): void {
    if (this.transitionTween) this.transitionTween.kill();

    const startPos = this.basePosition.clone();
    const startLook = this.baseLookAt.clone();
    const progress = { t: 0 };

    this.transitionTween = gsap.to(progress, {
      t: 1,
      duration,
      ease: "power3.inOut",
      onUpdate: () => {
        this.basePosition.lerpVectors(startPos, position, progress.t);
        this.baseLookAt.lerpVectors(startLook, lookAt, progress.t);
        this.currentTarget.copy(this.baseLookAt);
      },
    });
  }

  private animateZoom(targetFov: number, duration: number): void {
    if (this.zoomTween) this.zoomTween.kill();
    const fovObj = { fov: this.baseFov };
    this.zoomTween = gsap.to(fovObj, {
      fov: targetFov,
      duration,
      ease: "power2.inOut",
      onUpdate: () => {
        this.baseFov = fovObj.fov;
      },
    });
  }

  update(dt: number, elapsed: number): void {
    this.driftPhase += dt;
    const t = elapsed * 0.15;
    const n = this.noiseOffset;

    const driftX = fbm(t + n, 0, 0, 2) * 0.025;
    const driftY = fbm(0, t + n, 0, 2) * 0.015;
    const driftZ = fbm(0, 0, t + n, 2) * 0.012;

    this.camera.position.set(
      this.basePosition.x + driftX,
      this.basePosition.y + driftY,
      this.basePosition.z + driftZ
    );

    const slowZoom = Math.sin(elapsed * 0.08) * 0.4;
    this.camera.fov = this.baseFov + slowZoom;
    this.camera.updateProjectionMatrix();

    const lookDriftX = fbm(t * 0.8 + n + 50, 0, 0, 2) * 0.008;
    const lookDriftY = fbm(0, t * 0.8 + n + 50, 0, 2) * 0.006;

    this.camera.lookAt(
      this.baseLookAt.x + lookDriftX,
      this.baseLookAt.y + lookDriftY,
      this.baseLookAt.z
    );
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.transitionTween) this.transitionTween.kill();
    if (this.zoomTween) this.zoomTween.kill();
  }
}
