import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { StudioScene } from "./StudioScene";
import { Avatar, createDefaultAgents, createAgentFromParticipant } from "./AvatarBuilder";
import { CameraDirector } from "./CameraDirector";
import { VoiceController } from "./VoiceController";
import { AgentProfile } from "./types";

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.95 },
    darkness: { value: 1.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vig = 1.0 - dot(uv, uv);
      vig = clamp(pow(vig, darkness), 0.0, 1.0);
      texel.rgb *= vig;
      gl_FragColor = texel;
    }
  `,
};

const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    intensity: { value: 0.06 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float intensity;
    varying vec2 vUv;
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float grain = rand(vUv + vec2(time)) * intensity;
      texel.rgb += vec3(grain) - vec3(intensity * 0.5);
      gl_FragColor = texel;
    }
  `,
};

interface DebateStudio3DProps {
  debateId: number | null;
  participants?: any[];
  currentSpeakerId?: string | null;
  events?: any[];
  onReady?: () => void;
}

export function DebateStudio3D({
  debateId,
  participants = [],
  currentSpeakerId,
  events = [],
  onReady,
}: DebateStudio3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const filmGrainPassRef = useRef<ShaderPass | null>(null);
  const fxaaPassRef = useRef<ShaderPass | null>(null);
  const studioRef = useRef<StudioScene | null>(null);
  const cameraRef = useRef<CameraDirector | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);
  const avatarsRef = useRef<Map<string, Avatar>>(new Map());
  const avatarOrderRef = useRef<string[]>([]);
  const clockRef = useRef(new THREE.Clock());
  const rafRef = useRef<number>(0);
  const [isReady, setIsReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const processedEventsRef = useRef<Set<string>>(new Set());

  const clearAvatars = useCallback(() => {
    avatarsRef.current.forEach((a) => {
      studioRef.current?.scene.remove(a.group);
      a.dispose();
    });
    avatarsRef.current.clear();
    avatarOrderRef.current = [];
  }, []);

  const loadAvatarsFromParticipants = useCallback(
    (studio: StudioScene, voice: VoiceController, parts: any[]) => {
      clearAvatars();
      const agentParts = parts.length > 0 ? parts : [];

      if (agentParts.length === 0) {
        const defaults = createDefaultAgents();
        defaults.forEach((profile: AgentProfile) => {
          const avatar = new Avatar(profile);
          studio.scene.add(avatar.group);
          avatarsRef.current.set(profile.id, avatar);
          voice.registerAvatar(profile.id, avatar);
          avatarOrderRef.current.push(profile.id);
        });
        return;
      }

      agentParts.slice(0, 3).forEach((p: any, i: number) => {
        const profile = createAgentFromParticipant(p, i);
        const avatar = new Avatar(profile);
        studio.scene.add(avatar.group);
        avatarsRef.current.set(p.userId, avatar);
        voice.registerAvatar(p.userId, avatar);
        avatarOrderRef.current.push(p.userId);
      });
    },
    [clearAvatars]
  );

  const init = useCallback(() => {
    const container = containerRef.current;
    if (!container || rendererRef.current) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    let webglRenderer: THREE.WebGLRenderer;
    try {
      const canvas = document.createElement("canvas");
      const testCtx = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!testCtx) {
        setWebglFailed(true);
        setIsReady(true);
        onReady?.();
        return;
      }
      webglRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      if (!webglRenderer.getContext()) {
        webglRenderer.dispose();
        setWebglFailed(true);
        setIsReady(true);
        onReady?.();
        return;
      }
    } catch {
      setWebglFailed(true);
      setIsReady(true);
      onReady?.();
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    webglRenderer.setSize(width, height);
    webglRenderer.setPixelRatio(pixelRatio);
    webglRenderer.shadowMap.enabled = true;
    webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    webglRenderer.toneMappingExposure = 1.15;
    webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(webglRenderer.domElement);
    rendererRef.current = webglRenderer;

    const studio = new StudioScene();
    studioRef.current = studio;

    const camera = new CameraDirector();
    camera.resize(width, height);
    cameraRef.current = camera;

    try {
      const composer = new EffectComposer(webglRenderer);
      const renderPass = new RenderPass(studio.scene, camera.camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.25,
        0.6,
        0.85
      );
      composer.addPass(bloomPass);

      const vignettePass = new ShaderPass(VignetteShader);
      composer.addPass(vignettePass);

      const filmGrainPass = new ShaderPass(FilmGrainShader);
      composer.addPass(filmGrainPass);
      filmGrainPassRef.current = filmGrainPass;

      const fxaaPass = new ShaderPass(FXAAShader);
      fxaaPass.uniforms["resolution"].value.set(
        1 / (width * pixelRatio),
        1 / (height * pixelRatio)
      );
      composer.addPass(fxaaPass);
      fxaaPassRef.current = fxaaPass;

      const outputPass = new OutputPass();
      composer.addPass(outputPass);

      composerRef.current = composer;
    } catch {
      composerRef.current = null;
    }

    const voice = new VoiceController((speakerId) => {
      if (speakerId) {
        const idx = avatarOrderRef.current.indexOf(speakerId);
        if (idx >= 0) camera.focusOnSpeaker(idx);
      } else {
        camera.goWide();
      }
    });
    voiceRef.current = voice;

    loadAvatarsFromParticipants(studio, voice, participants);

    setIsReady(true);
    onReady?.();
    clockRef.current.start();
    animate();
  }, [onReady, participants, loadAvatarsFromParticipants]);

  const animate = useCallback(() => {
    const renderer = rendererRef.current;
    const studio = studioRef.current;
    const camera = cameraRef.current;
    if (!renderer || !studio || !camera) return;

    const dt = clockRef.current.getDelta();
    const elapsed = clockRef.current.getElapsedTime();

    studio.update(elapsed);
    camera.update(dt, elapsed);
    avatarsRef.current.forEach((avatar) => avatar.update(dt, elapsed));

    if (composerRef.current) {
      if (filmGrainPassRef.current) {
        filmGrainPassRef.current.uniforms["time"].value = elapsed;
      }
      try {
        composerRef.current.render();
      } catch {
        renderer.render(studio.scene, camera.camera);
      }
    } else {
      renderer.render(studio.scene, camera.camera);
    }

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    init();

    const handleResize = () => {
      const container = containerRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const composer = composerRef.current;
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const pr = Math.min(window.devicePixelRatio, 2);
      renderer.setSize(w, h);
      camera.resize(w, h);
      if (composer) composer.setSize(w, h);
      if (fxaaPassRef.current) {
        fxaaPassRef.current.uniforms["resolution"].value.set(
          1 / (w * pr),
          1 / (h * pr)
        );
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(rafRef.current);
      clearAvatars();
      composerRef.current?.dispose();
      composerRef.current = null;
      rendererRef.current?.dispose();
      studioRef.current?.dispose();
      cameraRef.current?.dispose();
      voiceRef.current?.dispose();
      if (containerRef.current && rendererRef.current?.domElement) {
        try { containerRef.current.removeChild(rendererRef.current.domElement); } catch {}
      }
      rendererRef.current = null;
    };
  }, [init, clearAvatars]);

  useEffect(() => {
    if (!studioRef.current || !voiceRef.current) return;
    if (participants.length > 0) {
      const currentIds = avatarOrderRef.current.join(",");
      const newIds = participants.slice(0, 3).map((p: any) => p.userId).join(",");
      if (currentIds !== newIds) {
        loadAvatarsFromParticipants(studioRef.current, voiceRef.current, participants);
      }
    }
  }, [participants, loadAvatarsFromParticipants]);

  useEffect(() => {
    if (!cameraRef.current) return;

    if (currentSpeakerId) {
      const idx = avatarOrderRef.current.indexOf(currentSpeakerId);
      if (idx >= 0) {
        cameraRef.current.focusOnSpeaker(idx);
      }
    }

    const speakerSeatIdx = currentSpeakerId
      ? avatarOrderRef.current.indexOf(currentSpeakerId)
      : -1;

    avatarsRef.current.forEach((avatar, id) => {
      if (id === currentSpeakerId) {
        avatar.setSpeaking(true, 0.5);
        avatar.setListenTarget(null);
      } else {
        avatar.setSpeaking(false, 0);
        avatar.setListenTarget(currentSpeakerId || null, speakerSeatIdx);
      }
    });
  }, [currentSpeakerId]);

  useEffect(() => {
    if (!voiceRef.current || events.length === 0) return;
    for (const event of events) {
      const eventKey = `${event.type}-${event.data?.participantId}-${event.data?.turnOrder || ""}`;
      if (processedEventsRef.current.has(eventKey)) continue;
      processedEventsRef.current.add(eventKey);

      if (event.type === "speech_ready" && event.data?.audioBase64) {
        const pid = event.data.participantId;
        voiceRef.current.playAudio(pid, event.data.audioBase64);
      }
    }
  }, [events]);

  const handleCameraPreset = useCallback(
    (preset: string) => {
      if (!cameraRef.current) return;
      switch (preset) {
        case "wide":
          cameraRef.current.goWide();
          break;
        case "dramatic":
          cameraRef.current.goDramatic();
          break;
        case "speaker0":
        case "speaker1":
        case "speaker2":
          cameraRef.current.focusOnSpeaker(parseInt(preset.replace("speaker", "")));
          break;
      }
    },
    []
  );

  const handleDemoSpeech = useCallback(() => {
    if (!voiceRef.current) return;
    const ids = avatarOrderRef.current;
    let delay = 0;
    ids.forEach((id) => {
      setTimeout(() => {
        voiceRef.current?.simulateSpeech(id, 3000 + Math.random() * 2000);
      }, delay);
      delay += 4000;
    });
  }, []);

  return (
    <div className="relative w-full h-full" data-testid="debate-studio-3d">
      <div
        ref={containerRef}
        className="w-full h-full bg-black"
        data-testid="canvas-container"
      />

      <div className="absolute top-3 left-3 flex items-center gap-2" data-testid="studio-overlay-top">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-semibold text-red-400 tracking-wider">LIVE</span>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-black/50 border border-white/10 backdrop-blur-sm">
          <span className="text-xs text-white/70 font-medium">AI Debate Studio</span>
        </div>
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5" data-testid="camera-controls">
        {["wide", "speaker0", "speaker1", "speaker2", "dramatic"].map((preset) => (
          <button
            key={preset}
            onClick={() => handleCameraPreset(preset)}
            className="px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 text-xs text-white/80 hover:bg-white/10 hover:border-white/20 transition-all backdrop-blur-sm"
            data-testid={`button-camera-${preset}`}
          >
            {preset === "wide" ? "Wide" :
             preset === "dramatic" ? "Cinematic" :
             `Agent ${parseInt(preset.replace("speaker", "")) + 1}`}
          </button>
        ))}
        <button
          onClick={handleDemoSpeech}
          className="px-3 py-1.5 rounded-lg bg-purple-500/30 border border-purple-400/30 text-xs text-purple-300 hover:bg-purple-500/40 transition-all backdrop-blur-sm"
          data-testid="button-demo-speech"
        >
          Demo Speech
        </button>
      </div>

      {webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 to-black" data-testid="webgl-fallback">
          <div className="flex flex-col items-center gap-4 text-center px-8">
            <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
            </div>
            <h3 className="text-lg font-semibold text-white">3D Studio Unavailable</h3>
            <p className="text-sm text-white/50 max-w-md">Your browser doesn't support WebGL rendering. The debate audio and transcript are still available in the sidebar.</p>
          </div>
        </div>
      )}

      {!isReady && !webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-white/60">Loading Studio...</span>
          </div>
        </div>
      )}
    </div>
  );
}
