import * as THREE from "three";

export interface AgentProfile {
  id: string;
  name: string;
  role: "host" | "analyst" | "expert";
  gender: "male" | "female" | "neutral";
  voiceId: string;
  seatIndex: number;
  color: THREE.Color;
  accentColor: THREE.Color;
}

export interface AvatarState {
  isSpeaking: boolean;
  audioLevel: number;
  mouthOpenness: number;
  mouthVelocity: number;
  blinkTimer: number;
  blinkState: number;
  blinkDuration: number;
  nextBlinkLeft: boolean;
  breathPhase: number;
  headNodPhase: number;
  gesturePhase: number;
  idleSwayPhase: number;
  saccadeTimer: number;
  saccadeTarget: { x: number; y: number };
  saccadeCurrent: { x: number; y: number };
  listenTargetId: string | null;
  listenNodPhase: number;
  listenNodActive: boolean;
  listenNodTimer: number;
  postureShiftTimer: number;
  postureOffset: { x: number; z: number };
  lipSyncDelay: number;
  delayedAudioLevel: number;
}

export interface DebateEvent {
  type: string;
  data?: any;
}

export const SEAT_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3(-1.8, 0, 0.6),
  new THREE.Vector3(0, 0, -0.8),
  new THREE.Vector3(1.8, 0, 0.6),
];

export const SEAT_ROTATIONS: number[] = [
  Math.PI * 0.15,
  Math.PI,
  -Math.PI * 0.15,
];

export const CAMERA_PRESETS = {
  wide: {
    position: new THREE.Vector3(0, 2.8, 5.5),
    lookAt: new THREE.Vector3(0, 1.2, 0),
  },
  speaker0: {
    position: new THREE.Vector3(-2.5, 2.2, 3.0),
    lookAt: new THREE.Vector3(-1.6, 1.6, 0.6),
  },
  speaker1: {
    position: new THREE.Vector3(0.8, 2.4, 2.2),
    lookAt: new THREE.Vector3(0, 1.6, -0.6),
  },
  speaker2: {
    position: new THREE.Vector3(2.5, 2.2, 3.0),
    lookAt: new THREE.Vector3(1.6, 1.6, 0.6),
  },
  overShoulder01: {
    position: new THREE.Vector3(-2.2, 2.0, 1.5),
    lookAt: new THREE.Vector3(0, 1.6, -0.6),
  },
  overShoulder12: {
    position: new THREE.Vector3(2.2, 2.0, 1.5),
    lookAt: new THREE.Vector3(0, 1.6, -0.6),
  },
  dramatic: {
    position: new THREE.Vector3(0, 3.5, 4.0),
    lookAt: new THREE.Vector3(0, 1.0, 0),
  },
};
