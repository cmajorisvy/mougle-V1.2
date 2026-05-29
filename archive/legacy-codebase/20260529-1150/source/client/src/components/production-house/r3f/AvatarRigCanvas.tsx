import { useMemo, useState, useEffect, Suspense, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Line, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const DEFAULT_RIG_GLB_URL = "/demo-assets/avatar-rig-demo.glb";

// Joint names whose local rotation we change to switch T-pose → A-pose.
// Pure pose change. No animation, no interpolation, no timeline.
const A_POSE_ROTATIONS_RAD: Record<string, [number, number, number]> = {
  LeftUpperArm: [0, 0, -Math.PI / 4],
  RightUpperArm: [0, 0, Math.PI / 4],
};
const T_POSE_ROTATIONS_RAD: Record<string, [number, number, number]> = {
  LeftUpperArm: [0, 0, 0],
  RightUpperArm: [0, 0, 0],
};

export interface RigInfo {
  rigName: string;
  jointCount: number;
  rootJointName: string | null;
}

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

interface BoneSegment {
  key: string;
  a: [number, number, number];
  b: [number, number, number];
}

interface JointPoint {
  key: string;
  name: string;
  pos: [number, number, number];
}

function RigContents({
  pose,
  url,
  onRigInfo,
}: {
  pose: "t_pose" | "a_pose";
  url: string;
  onRigInfo: (info: RigInfo) => void;
}) {
  const gltf = useGLTF(url);

  // Clone the scene once per gltf so each mount has its own mutable copy.
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const { joints, bones, info } = useMemo(() => {
    const rotMap = pose === "a_pose" ? A_POSE_ROTATIONS_RAD : T_POSE_ROTATIONS_RAD;
    // Apply pose rotations to specific named joints (reset others to identity).
    scene.traverse((obj) => {
      if (!obj.name) return;
      if (rotMap[obj.name]) {
        const [x, y, z] = rotMap[obj.name];
        obj.rotation.set(x, y, z);
      }
    });
    scene.updateMatrixWorld(true);

    const collected: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      // Skip the wrapping "Scene" node added by GLTFLoader.
      if (!obj.name || obj.name === "Scene") return;
      collected.push(obj);
    });

    const jointPoints: JointPoint[] = collected.map((o) => {
      const p = o.getWorldPosition(new THREE.Vector3());
      return { key: o.uuid, name: o.name, pos: [p.x, p.y, p.z] };
    });

    const boneSegments: BoneSegment[] = [];
    for (const o of collected) {
      const parent = o.parent;
      if (!parent || !parent.name || parent.name === "Scene") continue;
      const a = parent.getWorldPosition(new THREE.Vector3());
      const b = o.getWorldPosition(new THREE.Vector3());
      boneSegments.push({
        key: `${parent.uuid}-${o.uuid}`,
        a: [a.x, a.y, a.z],
        b: [b.x, b.y, b.z],
      });
    }

    // Extract rig info from glTF extras when present.
    const extras = (gltf as any)?.parser?.json?.extras ?? {};
    const rigName: string =
      typeof extras.rigName === "string" ? extras.rigName : "MougleDemoRig";
    const rootJoint =
      collected.find((o) => o.parent && o.parent.name === "Scene") ?? collected[0] ?? null;

    return {
      joints: jointPoints,
      bones: boneSegments,
      info: {
        rigName,
        jointCount: jointPoints.length,
        rootJointName: rootJoint?.name ?? null,
      } as RigInfo,
    };
  }, [scene, pose, gltf]);

  useEffect(() => {
    onRigInfo(info);
  }, [info, onRigInfo]);

  return (
    <group data-testid="r7-rig-group">
      {bones.map((b) => (
        <Line
          key={b.key}
          points={[b.a, b.b]}
          color="#7a5cff"
          lineWidth={2}
          dashed={false}
        />
      ))}
      {joints.map((j) => (
        <mesh key={j.key} position={j.pos}>
          <sphereGeometry args={[0.028, 12, 12]} />
          <meshStandardMaterial color="#22d3ee" roughness={0.4} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

class RigErrorBoundary extends Component<
  { children: ReactNode; onError: (err: Error) => void; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    this.props.onError(err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function BodyAssetContents({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={scene} data-testid="r7b-body-asset-primitive" />;
}

interface Props {
  pose: "t_pose" | "a_pose";
  url?: string;
  bodyAssetUrl?: string | null;
  onRigInfo: (info: RigInfo) => void;
  onRigError: (msg: string) => void;
  onBodyAssetError?: (msg: string) => void;
  heightClass?: string;
  testIdSuffix?: string;
}

export default function AvatarRigCanvas({
  pose,
  url,
  bodyAssetUrl,
  onRigInfo,
  onRigError,
  onBodyAssetError,
  heightClass = "h-[480px]",
  testIdSuffix = "",
}: Props) {
  const rigUrl = url && url.length > 0 ? url : DEFAULT_RIG_GLB_URL;
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  useEffect(() => {
    setWebglOk(detectWebGL());
  }, []);

  const gridArgs = useMemo<[number, number]>(() => [12, 12], []);
  const tid = (base: string) => (testIdSuffix ? `${base}-${testIdSuffix}` : base);

  if (webglOk === false) {
    return (
      <div
        className="flex h-full min-h-[160px] w-full items-center justify-center rounded border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        data-testid={tid("r7-rig-webgl-fallback")}
      >
        WebGL is not available in this browser. The avatar rig preview requires WebGL.
        No 3D scene is rendered.
      </div>
    );
  }

  if (webglOk === null) {
    return (
      <div
        className="flex h-full min-h-[160px] w-full items-center justify-center rounded border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        data-testid={tid("r7-rig-loading")}
      >
        Initializing preview…
      </div>
    );
  }

  return (
    <div
      className={`relative ${heightClass} w-full overflow-hidden rounded border border-border bg-black`}
      data-testid={tid("r7-rig-canvas-wrapper")}
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ position: [1.6, 1.4, 2.4], fov: 50 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        data-testid="r7-rig-canvas"
      >
        <color attach="background" args={["#0a0a0f"]} />

        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 2]} intensity={0.9} />
        <directionalLight position={[-3, 2, -2]} intensity={0.3} />

        <Grid
          args={gridArgs}
          cellSize={0.25}
          cellThickness={0.6}
          cellColor="#3b3b4a"
          sectionSize={1}
          sectionThickness={1.0}
          sectionColor="#6b6bff"
          fadeDistance={12}
          fadeStrength={1}
          infiniteGrid={false}
          position={[0, 0, 0]}
        />

        <RigErrorBoundary
          fallback={null}
          onError={(err) => onRigError(err?.message ?? "Failed to load avatar rig.")}
        >
          <Suspense fallback={null}>
            <RigContents pose={pose} url={rigUrl} onRigInfo={onRigInfo} />
          </Suspense>
        </RigErrorBoundary>

        {bodyAssetUrl && bodyAssetUrl.length > 0 && (
          <RigErrorBoundary
            fallback={null}
            onError={(err) =>
              onBodyAssetError?.(err?.message ?? "Failed to load body asset.")
            }
          >
            <Suspense fallback={null}>
              <BodyAssetContents url={bodyAssetUrl} />
            </Suspense>
          </RigErrorBoundary>
        )}

        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          target={[0, 1.0, 0]}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={1.2}
          maxDistance={6}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload(DEFAULT_RIG_GLB_URL);
