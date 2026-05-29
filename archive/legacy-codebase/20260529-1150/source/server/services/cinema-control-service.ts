/**
 * Mougle 4D Cinema Control MVP — in-process service.
 *
 * Responsibilities:
 *   - In-memory project store (NO DB writes; matches "persistence pending
 *     migration" constraint).
 *   - Provider readiness flags (read from env without serializing values).
 *   - Deterministic mock generators for newsroom scene, podcast-room scene,
 *     avatar scene, scene manifest, and 4D cue manifest.
 *   - Safety envelope is appended server-side; the envelope object is the
 *     SAFETY_ENVELOPE constant from shared/4d-cinema-manifest.ts.
 *
 * Hard constraints honoured here:
 *   - Never touches FFmpeg / Remotion / avatar-video-render-service / render
 *     workers.
 *   - Never calls external providers; mock generators only.
 *   - Never reads secret VALUES; only checks presence and length.
 *   - Never sends Unreal commands or 4D hardware cues on the wire.
 */

import crypto from "crypto";
import {
  SAFETY_ENVELOPE,
  type FourDCinemaProject,
  type ProjectType,
  type SceneManifest,
  type ScriptPlan,
  type VoicePlan,
  type AvatarPlan,
  type ScreenPanel,
  type MediaRef,
  type FourDCueManifest,
  type FourDCue,
  type ProviderReadiness,
  FourDCueSchema,
} from "../../shared/4d-cinema-manifest";

// ---------- Provider readiness

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Returns booleans only — never returns secret values, never logs them.
 */
export function getProviderReadiness(): ProviderReadiness {
  return {
    openai: present("OPENAI_API_KEY") || present("AI_INTEGRATIONS_OPENAI_API_KEY"),
    elevenlabs: present("ELEVENLABS_API_KEY"),
    meshy: present("MESHY_API_KEY"),
    runway: present("RUNWAY_API_KEY"),
    unrealRemote: present("UNREAL_REMOTE_URL"),
    fourDBridge: present("LOCAL_4D_BRIDGE_URL"),
    webhookSecret: present("WEBHOOK_SECRET"),
  };
}

/**
 * Safe readiness error shape — matches the validate-env reporter style.
 * Never includes secret values.
 */
export interface SafeReadinessError {
  ok: false;
  error: "provider_not_ready" | "provider_disabled_safe_mode";
  provider: string;
  code: string;
  message: string;
  hint?: string;
}

export function readinessError(
  provider: string,
  envVarName: string,
): SafeReadinessError {
  return {
    ok: false,
    error: "provider_not_ready",
    provider,
    code: `missing_${provider}_api_key`,
    message:
      `Provider "${provider}" is not configured. ` +
      `Set ${envVarName} in the deployment environment and retry. ` +
      `No external call will be attempted until this is fixed.`,
    hint: "secret value is not displayed",
  };
}

export function disabledSafeModeError(
  provider: string,
  featureFlag: string,
): SafeReadinessError {
  return {
    ok: false,
    error: "provider_disabled_safe_mode",
    provider,
    code: `${provider}_live_disabled`,
    message:
      `Live ${provider} calls are disabled in this build. ` +
      `Re-issue the request with dryRun: true (mock) or set ${featureFlag}=1 ` +
      `AND provide a valid API key. This MVP returns mocks only.`,
    hint: "feature flag and API key check is name-only; values are not read",
  };
}

// ---------- Feature flags (off by default)

export function isFeatureEnabled(name: string): boolean {
  return process.env[name] === "1";
}

// ---------- Project store (in-memory)

const projects = new Map<string, FourDCinemaProject>();

export function listProjects(): FourDCinemaProject[] {
  return Array.from(projects.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getProject(id: string): FourDCinemaProject | null {
  return projects.get(id) ?? null;
}

export function createProject(input: {
  title: string;
  projectType: ProjectType;
}): FourDCinemaProject {
  const now = new Date().toISOString();
  const id = `proj_${crypto.randomUUID()}`;
  const p: FourDCinemaProject = {
    id,
    title: input.title,
    projectType: input.projectType,
    status: "draft",
    safetyStatus: "needs_review",
    sceneManifestStatus: "not_generated",
    cueManifestStatus: "not_generated",
    approvalNotes: null,
    createdAt: now,
    updatedAt: now,
  };
  projects.set(id, p);
  return p;
}

export function updateProject(
  id: string,
  patch: Partial<Omit<FourDCinemaProject, "id" | "createdAt">>,
): FourDCinemaProject | null {
  const existing = projects.get(id);
  if (!existing) return null;
  const updated: FourDCinemaProject = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  projects.set(id, updated);
  return updated;
}

// Test/clean helper.
export function _resetProjects(): void {
  projects.clear();
}

// ---------- Mock generators

export interface ScriptInput {
  topic: string;
  tone?: "neutral" | "warm" | "urgent";
  bulletCount?: number;
}

export function generateMockScript(input: ScriptInput): ScriptPlan {
  const tone = input.tone ?? "neutral";
  const beatCount = Math.min(Math.max(input.bulletCount ?? 4, 1), 12);
  const beats = Array.from({ length: beatCount }, (_, i) =>
    `Beat ${i + 1}: ${tone} note on ${input.topic.slice(0, 80)}`,
  );
  return {
    scriptId: `scr_${crypto.randomUUID()}`,
    title: `Mock script — ${input.topic.slice(0, 120)}`,
    anchorScript:
      `[MOCK — preview only] Welcome to Mougle. Today we cover "${input.topic}". ` +
      beats.map((b) => `${b}.`).join(" ") +
      ` This text was generated locally without calling any external provider.`,
    beats,
    mockMode: true,
    internalAdminReviewOnly: true as const,
  };
}

export function generateMockVoicePlan(
  provider: "elevenlabs" | "openai" | "none",
): VoicePlan {
  return {
    voiceJobId: `voice_${crypto.randomUUID()}`,
    provider,
    voiceId: provider === "none" ? null : "mock-voice-v1",
    mockMode: true,
    publicAudioUrl: null as null,
    internalAdminReviewOnly: true as const,
  };
}

export function defaultAvatarFor(projectType: ProjectType): AvatarPlan {
  switch (projectType) {
    case "podcast_room":
      return {
        avatarId: "avatar_default_podcast",
        displayName: "Podcast Host (placeholder)",
        role: "podcast_host",
        voiceProvider: "elevenlabs",
        avatarEngine: "static_placeholder",
        lipSyncMode: "planned",
        safetyStatus: "needs_review",
      };
    case "avatar_scene":
      return {
        avatarId: "avatar_default_narrator",
        displayName: "Narrator (placeholder)",
        role: "narrator",
        voiceProvider: "openai",
        avatarEngine: "static_placeholder",
        lipSyncMode: "planned",
        safetyStatus: "needs_review",
      };
    case "debate_room":
      return {
        avatarId: "avatar_default_analyst",
        displayName: "Analyst (placeholder)",
        role: "analyst",
        voiceProvider: "openai",
        avatarEngine: "static_placeholder",
        lipSyncMode: "none",
        safetyStatus: "needs_review",
      };
    case "interview_room":
      return {
        avatarId: "avatar_default_guest",
        displayName: "Guest (placeholder)",
        role: "guest",
        voiceProvider: "elevenlabs",
        avatarEngine: "static_placeholder",
        lipSyncMode: "planned",
        safetyStatus: "needs_review",
      };
    case "newsroom":
    default:
      return {
        avatarId: "avatar_default_anchor",
        displayName: "Anchor (placeholder)",
        role: "anchor",
        voiceProvider: "elevenlabs",
        avatarEngine: "static_placeholder",
        lipSyncMode: "planned",
        safetyStatus: "needs_review",
      };
  }
}

// ---- Newsroom scene panels

export function buildNewsroomPanels(input: {
  topic: string;
  tickerItems?: string[];
  monitorTitle?: string;
  sources?: Array<{ name: string; confidence: number }>;
}): ScreenPanel[] {
  const ticker = (input.tickerItems ?? [
    "Mougle Newsroom",
    "Preview Mode",
    "No Live Publishing",
  ])
    .map((t) => t.slice(0, 80))
    .join("  •  ");
  const sources =
    input.sources && input.sources.length > 0
      ? input.sources
          .slice(0, 6)
          .map((s) => ({
            name: s.name.slice(0, 80),
            confidence: Math.min(Math.max(s.confidence, 0), 1),
          }))
      : [{ name: "Pending verification", confidence: 0 }];
  const avgConfidence =
    sources.reduce((acc, s) => acc + s.confidence, 0) / sources.length;
  return [
    {
      panelId: "lower_third_main",
      panelType: "lower_third",
      text: input.topic.slice(0, 120),
      data: { style: "newsroom_v1" },
    },
    {
      panelId: "ticker_main",
      panelType: "ticker",
      text: ticker,
      data: { scrollSpeed: 60 },
    },
    {
      panelId: "monitor_main",
      panelType: "monitor",
      text: input.monitorTitle ?? "Topic overview",
      data: {},
    },
    {
      panelId: "source_panel_main",
      panelType: "source_panel",
      text: sources.map((s) => s.name).join(", "),
      data: { sources },
    },
    {
      panelId: "confidence_panel_main",
      panelType: "confidence_panel",
      text: `Avg confidence: ${avgConfidence.toFixed(2)}`,
      data: { avgConfidence },
    },
  ];
}

// ---- Podcast scene panels

export function buildPodcastPanels(input: {
  episodeTitle: string;
  host: string;
  guest?: string | null;
  beats?: string[];
}): ScreenPanel[] {
  return [
    {
      panelId: "lower_third_main",
      panelType: "lower_third",
      text: input.episodeTitle.slice(0, 120),
      data: { style: "podcast_warm" },
    },
    {
      panelId: "graphic_intro",
      panelType: "graphic",
      text: `${input.host}${input.guest ? ` × ${input.guest}` : ""}`,
      data: { kind: "intro_card" },
    },
    {
      panelId: "monitor_beats",
      panelType: "monitor",
      text: (input.beats ?? ["intro", "main discussion", "outro"])
        .slice(0, 10)
        .map((b) => `• ${b}`)
        .join("\n"),
      data: {},
    },
  ];
}

// ---------- Scene manifest

export interface BuildSceneManifestInput {
  project: FourDCinemaProject;
  topic: string;
  avatar?: AvatarPlan;
  script?: ScriptPlan;
  voice?: VoicePlan;
  newsroom?: {
    tickerItems?: string[];
    monitorTitle?: string;
    sources?: Array<{ name: string; confidence: number }>;
  };
  podcast?: {
    host: string;
    guest?: string | null;
    beats?: string[];
  };
  mediaRefs?: MediaRef[];
}

export function buildSceneManifest(
  input: BuildSceneManifestInput,
): SceneManifest {
  const project = input.project;
  const avatar = input.avatar ?? defaultAvatarFor(project.projectType);
  const script =
    input.script ??
    generateMockScript({ topic: input.topic, tone: "neutral", bulletCount: 4 });
  const voice = input.voice ?? generateMockVoicePlan(avatar.voiceProvider);

  let panels: ScreenPanel[];
  let roomPreset: SceneManifest["roomPreset"];
  let cameraPrimary: SceneManifest["cameraPlan"]["primary"];
  let cameraSecondary: SceneManifest["cameraPlan"]["secondary"];
  let lighting: SceneManifest["unrealPlan"]["lightingPreset"];

  switch (project.projectType) {
    case "podcast_room":
      panels = buildPodcastPanels({
        episodeTitle: input.topic,
        host: input.podcast?.host ?? "Mougle Host",
        guest: input.podcast?.guest ?? null,
        beats: input.podcast?.beats,
      });
      roomPreset = "podcast_studio_v1";
      cameraPrimary = "podcast_table";
      cameraSecondary = "single_host";
      lighting = "podcast_warm";
      break;
    case "avatar_scene":
      panels = buildNewsroomPanels({ topic: input.topic });
      roomPreset = "avatar_stage_v1";
      cameraPrimary = "medium_anchor";
      cameraSecondary = null;
      lighting = "newsroom_neutral";
      break;
    case "debate_room":
      panels = buildNewsroomPanels({ topic: input.topic });
      roomPreset = "debate_arena_v1";
      cameraPrimary = "debate_stage";
      cameraSecondary = "two_shot";
      lighting = "debate_cool";
      break;
    case "interview_room":
      panels = buildPodcastPanels({
        episodeTitle: input.topic,
        host: input.podcast?.host ?? "Mougle Host",
        guest: input.podcast?.guest ?? "Guest",
        beats: input.podcast?.beats,
      });
      roomPreset = "interview_lounge_v1";
      cameraPrimary = "interview_pair";
      cameraSecondary = "over_shoulder";
      lighting = "interview_soft";
      break;
    case "newsroom":
    default:
      panels = buildNewsroomPanels({
        topic: input.topic,
        tickerItems: input.newsroom?.tickerItems,
        monitorTitle: input.newsroom?.monitorTitle,
        sources: input.newsroom?.sources,
      });
      roomPreset = "newsroom_v1";
      cameraPrimary = "wide_anchor";
      cameraSecondary = "medium_anchor";
      lighting = "newsroom_neutral";
      break;
  }

  return {
    manifestId: `scn_${crypto.randomUUID()}`,
    projectId: project.id,
    sceneType: project.projectType,
    roomPreset,
    cameraPlan: { primary: cameraPrimary, secondary: cameraSecondary },
    avatarPlan: avatar,
    scriptPlan: script,
    voicePlan: voice,
    screenPanels: panels,
    mediaRefs: input.mediaRefs ?? [],
    unrealPlan: {
      roomPreset,
      cameraPreset: cameraPrimary,
      lightingPreset: lighting,
      sequencerCue: null,
      requiresManualApproval: true as const,
    },
    renderSafety: { ...SAFETY_ENVELOPE },
    adminApproval: {
      status: "pending",
      approvedBy: null,
      approvedAt: null,
      notes: null,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------- 4D cue manifest

export interface Build4DCueInput {
  project: FourDCinemaProject;
  cues: FourDCue[]; // already-parsed cues
}

export function build4DCueManifest(input: Build4DCueInput): FourDCueManifest {
  // Defensive re-validate each cue (caller is responsible too, but this keeps
  // unsafe values out of the manifest even if mis-called from JS).
  const cues = input.cues.map((c, i) => {
    const parsed = FourDCueSchema.safeParse(c);
    if (!parsed.success) {
      throw new CueValidationError(
        `cue[${i}] failed validation: ${parsed.error.issues
          .map((iss) => iss.message)
          .join("; ")}`,
      );
    }
    return parsed.data;
  });
  const total = cues.reduce((max, c) => Math.max(max, c.timeMs), 0);
  return {
    manifestId: `cue_${crypto.randomUUID()}`,
    projectId: input.project.id,
    totalDurationMs: total,
    cues,
    renderSafety: { ...SAFETY_ENVELOPE },
    adminApproval: {
      status: "pending",
      approvedBy: null,
      approvedAt: null,
      notes: null,
    },
    generatedAt: new Date().toISOString(),
  };
}

export class CueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CueValidationError";
  }
}
