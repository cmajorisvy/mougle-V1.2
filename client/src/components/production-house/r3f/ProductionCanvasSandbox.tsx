import { useMemo, useState, useEffect, Suspense, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const DEMO_GLB_URL = "/demo-assets/sandbox-cube.glb";

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

function DemoGLTFModel() {
  const gltf = useGLTF(DEMO_GLB_URL);
  return (
    <primitive
      object={gltf.scene}
      position={[0, 0.75, 0]}
      scale={1.2}
      data-testid="r3f-sandbox-demo-gltf"
    />
  );
}

function ApprovedInternalGLTFModel({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return (
    <primitive
      object={gltf.scene}
      position={[0, 0.75, 2]}
      scale={1.2}
      data-testid="r3f-sandbox-approved-internal-gltf"
    />
  );
}

class GLTFErrorBoundary extends Component<
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

interface Props {
  showDemoGltf: boolean;
  onGltfError: (msg: string) => void;
  approvedInternalUrl?: string | null;
  onApprovedInternalError?: (msg: string) => void;
}

export default function ProductionCanvasSandbox({
  showDemoGltf,
  onGltfError,
  approvedInternalUrl,
  onApprovedInternalError,
}: Props) {
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  useEffect(() => {
    setWebglOk(detectWebGL());
  }, []);

  const gridArgs = useMemo<[number, number]>(() => [12, 12], []);

  if (webglOk === false) {
    return (
      <div
        className="flex h-full min-h-[320px] w-full items-center justify-center rounded border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        data-testid="r3f-sandbox-webgl-fallback"
      >
        WebGL is not available in this browser. The R3F preview sandbox requires WebGL.
        No 3D scene is rendered. Try another browser or enable hardware acceleration.
      </div>
    );
  }

  if (webglOk === null) {
    return (
      <div
        className="flex h-full min-h-[320px] w-full items-center justify-center rounded border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        data-testid="r3f-sandbox-loading"
      >
        Initializing preview…
      </div>
    );
  }

  return (
    <div
      className="relative h-[480px] w-full overflow-hidden rounded border border-border bg-black"
      data-testid="r3f-sandbox-canvas-wrapper"
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ position: [4, 3.5, 5], fov: 50 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        data-testid="r3f-sandbox-canvas"
      >
        <color attach="background" args={["#0a0a0f"]} />

        <ambientLight intensity={0.45} />
        <directionalLight position={[5, 6, 4]} intensity={1.0} />
        <directionalLight position={[-4, 3, -2]} intensity={0.3} />

        <Grid
          args={gridArgs}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#3b3b4a"
          sectionSize={2}
          sectionThickness={1.2}
          sectionColor="#6b6bff"
          fadeDistance={20}
          fadeStrength={1}
          infiniteGrid={false}
          position={[0, -0.5, 0]}
        />

        <mesh position={[-1, 0, 0]} castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#7a5cff" roughness={0.45} metalness={0.1} />
        </mesh>

        <mesh position={[1.1, 0, 0]} castShadow>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshStandardMaterial color="#22d3ee" roughness={0.35} metalness={0.2} />
        </mesh>

        {showDemoGltf && (
          <GLTFErrorBoundary
            fallback={null}
            onError={(err) =>
              onGltfError(err?.message ?? "Failed to load demo GLB asset.")
            }
          >
            <Suspense fallback={null}>
              <DemoGLTFModel />
            </Suspense>
          </GLTFErrorBoundary>
        )}

        {approvedInternalUrl && (
          <GLTFErrorBoundary
            key={approvedInternalUrl}
            fallback={null}
            onError={(err) =>
              onApprovedInternalError?.(
                err?.message ?? "Failed to load approved internal asset.",
              )
            }
          >
            <Suspense fallback={null}>
              <ApprovedInternalGLTFModel url={approvedInternalUrl} />
            </Suspense>
          </GLTFErrorBoundary>
        )}

        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={3}
          maxDistance={14}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload(DEMO_GLB_URL);
