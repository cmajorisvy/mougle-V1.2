import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { CAMERA_PRESETS } from "./camera-presets";
import { LIGHTING_PRESETS } from "./lighting-presets";
import type { AssetSlot, ScenePackageManifest, ScreenPanel } from "./types";

function detectWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

function assertSafetyEnvelope(m: ScenePackageManifest): void {
  const e = m.safetyEnvelope;
  if (
    !e ||
    e.adminOnly !== true ||
    e.staticPrototype !== true ||
    e.noDataBinding !== true ||
    e.noRender !== true ||
    e.noPublishing !== true ||
    e.noProviderCalls !== true
  ) {
    throw new Error("VirtualSet refused to render: safetyEnvelope is incomplete.");
  }
}

class SlotErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError?: (err: Error) => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    this.props.onError?.(err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function PlaceholderSlot({ slot, reason }: { slot: AssetSlot; reason: string }) {
  return (
    <group
      position={slot.position}
      rotation={slot.rotation}
      scale={slot.scale}
      data-testid={`slot-placeholder-${slot.id}`}
    >
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.6, 0.8, 0.6]} />
        <meshStandardMaterial color="#3b3b4a" roughness={0.8} metalness={0.05} />
      </mesh>
      <Html
        position={[0, 1.05, 0]}
        center
        distanceFactor={6}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            background: "rgba(15,15,22,0.85)",
            color: "#e2e8f0",
            border: "1px solid #475569",
            borderRadius: 4,
            padding: "2px 6px",
            fontSize: 10,
            whiteSpace: "nowrap",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {slot.label} · {reason}
        </div>
      </Html>
    </group>
  );
}

function ApprovedSlotModel({
  slot,
  url,
}: {
  slot: AssetSlot;
  url: string;
}) {
  const gltf = useGLTF(url);
  const cloned = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return (
    <primitive
      object={cloned}
      position={slot.position}
      rotation={slot.rotation}
      scale={slot.scale}
      data-testid={`slot-asset-${slot.id}`}
    />
  );
}

function ScreenPanelMesh({ panel }: { panel: ScreenPanel }) {
  return (
    <group
      position={panel.position}
      rotation={panel.rotation}
      data-testid={`screen-panel-${panel.id}`}
    >
      <mesh>
        <boxGeometry args={[panel.size[0], panel.size[1], 0.04]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={[panel.size[0] - 0.06, panel.size[1] - 0.06]} />
        <meshStandardMaterial color="#0b1220" roughness={0.9} metalness={0} />
      </mesh>
      <Html
        position={[0, 0, 0.05]}
        center
        distanceFactor={6}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            background: "rgba(15,15,22,0.85)",
            color: "#cbd5e1",
            border: "1px solid #334155",
            borderRadius: 4,
            padding: "3px 8px",
            fontSize: 11,
            whiteSpace: "nowrap",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {panel.caption}
        </div>
      </Html>
    </group>
  );
}

export interface SlotBinding {
  slotId: string;
  url: string | null;
  reason: string;
}

interface Props {
  manifest: ScenePackageManifest;
  slotBindings: SlotBinding[];
  onSlotError?: (slotId: string, message: string) => void;
}

export default function VirtualSet({ manifest, slotBindings, onSlotError }: Props) {
  assertSafetyEnvelope(manifest);

  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  useEffect(() => {
    setWebglOk(detectWebGL());
  }, []);

  const camera = CAMERA_PRESETS[manifest.cameraPreset];
  const lighting = LIGHTING_PRESETS[manifest.lightingPreset];

  const bindingMap = useMemo(() => {
    const m = new Map<string, SlotBinding>();
    for (const b of slotBindings) m.set(b.slotId, b);
    return m;
  }, [slotBindings]);

  if (webglOk === false) {
    return (
      <div
        className="flex h-full min-h-[320px] w-full items-center justify-center rounded border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        data-testid="virtual-set-webgl-fallback"
      >
        WebGL is not available in this browser. The virtual set preview requires WebGL.
      </div>
    );
  }

  if (webglOk === null) {
    return (
      <div
        className="flex h-full min-h-[320px] w-full items-center justify-center rounded border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        data-testid="virtual-set-loading"
      >
        Initializing preview…
      </div>
    );
  }

  return (
    <div
      className="relative h-[540px] w-full overflow-hidden rounded border border-border bg-black"
      data-testid={`virtual-set-canvas-wrapper-${manifest.setType}`}
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ position: camera.position, fov: camera.fov }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={({ gl, camera: c }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          c.lookAt(new THREE.Vector3(...camera.lookAt));
        }}
        data-testid={`virtual-set-canvas-${manifest.setType}`}
      >
        <color attach="background" args={[lighting.background]} />

        <ambientLight intensity={lighting.ambientIntensity} />
        <directionalLight
          position={lighting.keyPosition}
          intensity={lighting.keyIntensity}
          color={lighting.keyColor}
        />
        <directionalLight
          position={lighting.fillPosition}
          intensity={lighting.fillIntensity}
          color={lighting.fillColor}
        />

        <Grid
          args={[14, 14]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#3b3b4a"
          sectionSize={2}
          sectionThickness={1.2}
          sectionColor="#6b6bff"
          fadeDistance={22}
          fadeStrength={1}
          infiniteGrid={false}
          position={[0, 0, 0]}
        />

        {manifest.assetSlots.map((slot) => {
          const binding = bindingMap.get(slot.id);
          if (!binding || !binding.url) {
            return (
              <PlaceholderSlot
                key={slot.id}
                slot={slot}
                reason={binding?.reason ?? "no approved asset"}
              />
            );
          }
          return (
            <SlotErrorBoundary
              key={`${slot.id}:${binding.url}`}
              fallback={<PlaceholderSlot slot={slot} reason="load failed" />}
              onError={(err) =>
                onSlotError?.(slot.id, err?.message ?? "Slot asset failed to load.")
              }
            >
              <Suspense fallback={<PlaceholderSlot slot={slot} reason="loading…" />}>
                <ApprovedSlotModel slot={slot} url={binding.url} />
              </Suspense>
            </SlotErrorBoundary>
          );
        })}

        {manifest.screenPanels.map((panel) => (
          <ScreenPanelMesh key={panel.id} panel={panel} />
        ))}

        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          target={camera.lookAt}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={3}
          maxDistance={14}
        />
      </Canvas>
    </div>
  );
}
