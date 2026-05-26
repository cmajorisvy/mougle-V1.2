import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { riskManagementService } from "./risk-management-service";
import {
  analyzeRenderBaselineLayout,
  analyzeRenderBaselineText,
  mergeFindings,
  type ComplianceFinding,
} from "./render-text-fitting";
import { renderSrtService } from "./render-srt-service";
import { renderMp4Service } from "./render-mp4-service";
import type { AdminOnlyMediaAssetMetadata } from "./persistent-storage-service";
import {
  avatarVideoRenderJobs,
  podcastAudioJobs,
  podcastScriptPackages,
  safeModeControls,
  youtubePublishingPackages,
  type AvatarVideoAvatarProfile,
  type AvatarVideoPreviewMetadata,
  type AvatarVideoRenderJob,
  type AvatarVideoRenderProvider,
  type AvatarVideoSceneTemplate,
  type AvatarVideoSegmentMapping,
  type PodcastAudioJob,
  type PodcastAudioJobSegment,
  type PodcastScriptPackage,
  type PodcastScriptPackagePayload,
  type YouTubePublishingPackage,
} from "@shared/schema";

export const avatarVideoRenderProviders = ["dry_run", "heygen", "d_id", "synthesia", "unreal"] as const;
export const avatarVideoSceneTemplates = ["news_desk", "podcast_studio", "debate_arena_summary", "minimal_cards"] as const;

type CreateRenderJobInput = {
  scriptPackageId: number;
  audioJobId?: number | null;
  youtubePackageId?: number | null;
  provider?: AvatarVideoRenderProvider;
  sceneTemplate?: AvatarVideoSceneTemplate;
  createdBy: string;
};

type ProviderStatus = {
  selected: AvatarVideoRenderProvider;
  dryRunDefault: true;
  liveProviderCalls: false;
  configured: boolean;
  placeholderOnly: boolean;
  message: string;
};

type RenderLayerKey =
  | "background"
  | "anchor_placeholder"
  | "monitor_panels"
  | "lower_third"
  | "ticker"
  | "captions"
  | "preview_watermark"
  | "foreground_overlays";

type TextSafeZone = {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "percent";
  purpose: string;
};

type MonitorPanelZone = TextSafeZone & {
  panelKey: string;
};

type RenderBaseline = {
  renderer: "avatar_dry_run_planner";
  format: {
    container: "mp4";
    videoCodec: "h264";
    audioCodec: "aac";
    subtitles: "srt";
    fps: 30;
    width: 1920;
    height: 1080;
  };
  layers: Array<{
    key: RenderLayerKey;
    order: number;
    label: string;
    enabled: boolean;
    notes: string;
  }>;
  safeZones: {
    anchorSafeZone: TextSafeZone;
    lowerThirdZone: TextSafeZone;
    tickerZone: TextSafeZone;
    captionZone: TextSafeZone;
    monitorPanelZones: MonitorPanelZone[];
  };
  timing: {
    totalDurationMs: number;
    lowerThirdPolicy: string;
    tickerPolicy: string;
    panelSwitchPolicy: string;
    segments: Array<{
      segmentIndex: number;
      scriptType: AvatarVideoSegmentMapping["scriptType"];
      speakerAgentKey: string;
      startMs: number;
      endMs: number;
      lowerThirdVisible: boolean;
      tickerVisible: boolean;
      captionWindow: {
        startMs: number;
        endMs: number;
      };
      panelCue: "hold" | "switch";
    }>;
  };
  textSafety: {
    headlineMaxChars: number;
    lowerThirdMaxChars: number;
    tickerItemMaxChars: number;
    captionMaxCharsPerLine: number;
    captionMaxLines: number;
    overlapPrevention: string[];
  };
  storage: {
    mode: "local_preview_only";
    refs: Array<{
      kind: "mp4" | "srt";
      storageKey: string;
      accessMode: "admin_only_stream";
      publicUrl: null;
      status: "planned" | "generated" | "missing";
    }>;
    objectStorageConfigured: false;
    ready: boolean;
  };
  renderReadiness: {
    readyForDryRunRender: boolean;
    rendererStatus: "ready" | "needs_script" | "needs_audio";
    reasons: string[];
  };
  previewWatermark: {
    enabled: true;
    label: "INTERNAL PREVIEW";
    reason: string;
  };
  compliance: {
    analyzedAt: string;
    warnings: ComplianceFinding[];
    errors: ComplianceFinding[];
  };
  captionsArtifact: AdminOnlyMediaAssetMetadata | null;
  captionsPreview: {
    firstLines: string[];
    lineCount: number;
    cueCount: number;
  } | null;
  mp4Artifact: AdminOnlyMediaAssetMetadata | null;
  mp4Preview: {
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    segmentCount: number;
    note: string;
  } | null;
};

type PreviewMetadataWithBaseline = AvatarVideoPreviewMetadata & {
  renderBaseline: RenderBaseline;
};

type EligibleRenderPackage = {
  scriptPackage: PodcastScriptPackage;
  latestAudioJob: PodcastAudioJob | null;
  youtubePackage: YouTubePublishingPackage | null;
  existingRenderJob: AvatarVideoRenderJob | null;
};

class AvatarVideoRenderError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const CANONICAL_SYSTEM_AGENT_KEYS = new Set([
  "mougle-chief-intelligence",
  "aletheia-truth-validation",
  "arivu-reasoning",
  "astraion-research",
  "mercurion-economics",
  "dharma-governance",
  "chronarch-context",
  "sentinel-risk",
  "voxa-public-voice",
  "architect-builder",
  "contrarian-stress-test",
]);

const REQUIRED_AVATAR_PROFILES: Record<string, AvatarVideoAvatarProfile> = {
  "voxa-public-voice": {
    agentKey: "voxa-public-voice",
    displayName: "Voxa",
    role: "News reader / presenter",
    renderRole: "presenter_host",
    avatarStyle: "studio presenter card",
    source: "required_system_mapping",
  },
  "mougle-chief-intelligence": {
    agentKey: "mougle-chief-intelligence",
    displayName: "MOUGLE",
    role: "Final truth-governed synthesis",
    renderRole: "conclusion_presence",
    avatarStyle: "symbolic synthesis presence",
    source: "required_system_mapping",
  },
};

function ensureProvider(value: string | undefined | null): AvatarVideoRenderProvider {
  if (avatarVideoRenderProviders.includes(value as AvatarVideoRenderProvider)) {
    return value as AvatarVideoRenderProvider;
  }
  return "dry_run";
}

function ensureSceneTemplate(value: string | undefined | null): AvatarVideoSceneTemplate {
  if (avatarVideoSceneTemplates.includes(value as AvatarVideoSceneTemplate)) {
    return value as AvatarVideoSceneTemplate;
  }
  return "news_desk";
}

function providerStatus(provider: AvatarVideoRenderProvider = "dry_run"): ProviderStatus {
  if (provider === "dry_run") {
    return {
      selected: "dry_run",
      dryRunDefault: true,
      liveProviderCalls: false,
      configured: true,
      placeholderOnly: false,
      message: "Dry-run render planning is active. No video provider is called and no video file is generated.",
    };
  }

  return {
    selected: provider,
    dryRunDefault: true,
    liveProviderCalls: false,
    configured: false,
    placeholderOnly: true,
    message: `${provider} is a future placeholder in this phase. Preview planning is allowed, but live rendering remains disabled.`,
  };
}

function truncate(value: string | null | undefined, length = 360) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length - 3)}...` : text;
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function profileForSpeaker(input: {
  agentKey: string;
  displayName: string;
  role: string;
  source: AvatarVideoAvatarProfile["source"];
}): AvatarVideoAvatarProfile | null {
  const agentKey = input.agentKey.trim();
  if (!CANONICAL_SYSTEM_AGENT_KEYS.has(agentKey)) return null;
  if (agentKey === "voxa-public-voice") return { ...REQUIRED_AVATAR_PROFILES["voxa-public-voice"], source: input.source };
  if (agentKey === "mougle-chief-intelligence") return { ...REQUIRED_AVATAR_PROFILES["mougle-chief-intelligence"], source: input.source };

  return {
    agentKey,
    displayName: input.displayName || agentKey,
    role: input.role || "Specialist system agent",
    renderRole: "speaker_card",
    avatarStyle: "symbolic specialist speaker card",
    source: input.source,
  };
}

function buildAvatarProfileMapping(
  scriptPackage: PodcastScriptPackage,
  audioJob: PodcastAudioJob | null,
) {
  const mapping: Record<string, AvatarVideoAvatarProfile> = {};
  const excludedSpeakers: AvatarVideoPreviewMetadata["excludedSpeakers"] = [];

  for (const assignment of scriptPackage.scriptPackage.speakerAssignments || []) {
    const profile = profileForSpeaker({
      agentKey: assignment.agentKey,
      displayName: assignment.displayName,
      role: assignment.role,
      source: "script_assignment",
    });
    if (profile) {
      mapping[profile.agentKey] = profile;
    } else if (assignment.agentKey) {
      excludedSpeakers.push({
        agentKey: assignment.agentKey,
        displayName: assignment.displayName || assignment.agentKey,
        reason: "User-owned or non-canonical avatars are excluded in Phase 31.",
      });
    }
  }

  for (const profile of Object.values(audioJob?.voiceProfileMapping || {})) {
    if (mapping[profile.agentKey]) continue;
    const avatarProfile = profileForSpeaker({
      agentKey: profile.agentKey,
      displayName: profile.displayName,
      role: profile.role,
      source: "voice_profile",
    });
    if (avatarProfile) mapping[avatarProfile.agentKey] = avatarProfile;
  }

  for (const [agentKey, profile] of Object.entries(REQUIRED_AVATAR_PROFILES)) {
    if (!mapping[agentKey]) mapping[agentKey] = profile;
  }

  return { mapping, excludedSpeakers };
}

function fallbackSegments(script: PodcastScriptPackagePayload): AvatarVideoSegmentMapping[] {
  const rows: Array<{ scriptType: AvatarVideoSegmentMapping["scriptType"]; agentKey: string; displayName: string; role: string; text: string }> = [
    {
      scriptType: "two_minute",
      agentKey: "voxa-public-voice",
      displayName: "Voxa",
      role: "Presenter",
      text: script.twoMinuteNewsScript,
    },
    {
      scriptType: "ten_minute",
      agentKey: "voxa-public-voice",
      displayName: "Voxa",
      role: "Podcast host",
      text: script.tenMinutePodcastScript,
    },
    {
      scriptType: "mougle_conclusion",
      agentKey: "mougle-chief-intelligence",
      displayName: "MOUGLE",
      role: "Final synthesis",
      text: script.youtubeDescription || script.tenMinutePodcastScript,
    },
  ];

  return rows.map((row, index) => ({
    segmentIndex: index,
    scriptType: row.scriptType,
    agentKey: row.agentKey,
    displayName: row.displayName,
    role: row.role,
    textPreview: truncate(row.text, 260),
    audioAvailable: false,
    audioUrl: null,
    audioPath: null,
    status: "script_only",
  }));
}

function mapAudioSegments(audioJob: PodcastAudioJob | null, script: PodcastScriptPackagePayload): AvatarVideoSegmentMapping[] {
  if (!audioJob?.segments?.length) return fallbackSegments(script);
  return audioJob.segments.map((segment: PodcastAudioJobSegment) => ({
    segmentIndex: segment.segmentIndex,
    scriptType: segment.scriptType,
    agentKey: segment.agentKey,
    displayName: segment.displayName,
    role: segment.role,
    textPreview: truncate(segment.textPreview, 260),
    audioAvailable: !!segment.audioUrl || !!segment.audioPath,
    audioUrl: segment.audioUrl,
    audioPath: segment.audioPath,
    status: segment.status,
  }));
}

async function safeModeWarnings() {
  const [controls] = await db.select().from(safeModeControls).limit(1);
  const warnings: string[] = [];
  if (controls?.globalSafeMode) {
    warnings.push("Global safe mode is enabled. Render planning remains manual/admin-review only.");
  }
  if (controls?.pausePodcastAudioGeneration) {
    warnings.push("Podcast/audio generation is paused. Video render planning can continue, but new audio generation is blocked elsewhere.");
  }
  return warnings;
}

function toWordCount(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).length;
}

function estimateSegmentDurationMs(segment: AvatarVideoSegmentMapping) {
  const words = toWordCount(segment.textPreview || "");
  const wordsBasedMs = words * 360;
  const baseMs = segment.audioAvailable ? 2800 : 4200;
  return Math.min(24000, Math.max(baseMs, wordsBasedMs));
}

function buildTimingSegments(segmentMapping: AvatarVideoSegmentMapping[]): RenderBaseline["timing"]["segments"] {
  let cursor = 0;
  return segmentMapping.map((segment, index) => {
    const durationMs = estimateSegmentDurationMs(segment);
    const startMs = cursor;
    const endMs = startMs + durationMs;
    cursor = endMs;
    return {
      segmentIndex: segment.segmentIndex,
      scriptType: segment.scriptType,
      speakerAgentKey: segment.agentKey,
      startMs,
      endMs,
      lowerThirdVisible: index === 0 || segment.scriptType === "two_minute",
      tickerVisible: true,
      captionWindow: {
        startMs,
        endMs,
      },
      panelCue: index === 0 ? "hold" : "switch",
    };
  });
}

function buildMonitorZones(sceneTemplate: AvatarVideoSceneTemplate): RenderBaseline["safeZones"]["monitorPanelZones"] {
  if (sceneTemplate === "minimal_cards") {
    return [
      {
        panelKey: "primary_card",
        x: 8,
        y: 14,
        width: 36,
        height: 22,
        unit: "percent",
        purpose: "primary_speaker_card",
      },
    ];
  }
  if (sceneTemplate === "debate_arena_summary") {
    return [
      {
        panelKey: "debate_left",
        x: 6,
        y: 14,
        width: 26,
        height: 24,
        unit: "percent",
        purpose: "supporting_debate_panel_left",
      },
      {
        panelKey: "debate_right",
        x: 34,
        y: 14,
        width: 26,
        height: 24,
        unit: "percent",
        purpose: "supporting_debate_panel_right",
      },
    ];
  }
  return [
    {
      panelKey: "monitor_primary",
      x: 6,
      y: 14,
      width: 30,
      height: 24,
      unit: "percent",
      purpose: "headline_and_source_panel",
    },
    {
      panelKey: "monitor_secondary",
      x: 6,
      y: 40,
      width: 30,
      height: 20,
      unit: "percent",
      purpose: "timeline_or_map_panel",
    },
  ];
}

function buildLayers(hasNarration: boolean): RenderBaseline["layers"] {
  return [
    {
      key: "background",
      order: 10,
      label: "Background layer",
      enabled: true,
      notes: "Base studio background.",
    },
    {
      key: "anchor_placeholder",
      order: 20,
      label: "Anchor/presenter placeholder",
      enabled: true,
      notes: "Reserved presenter zone for canonical system agents only.",
    },
    {
      key: "monitor_panels",
      order: 30,
      label: "Monitor/display panels",
      enabled: true,
      notes: "Panel content switches at segment boundaries.",
    },
    {
      key: "lower_third",
      order: 40,
      label: "Lower-third",
      enabled: true,
      notes: "Appears during opening/main narration and remains within lower-third safe zone.",
    },
    {
      key: "ticker",
      order: 50,
      label: "Ticker",
      enabled: true,
      notes: "Persistent crawl; constrained to ticker safe zone.",
    },
    {
      key: "captions",
      order: 60,
      label: "Captions/SRT",
      enabled: hasNarration,
      notes: hasNarration
        ? "Caption timing follows segment windows and avoids lower-third/ticker collision."
        : "Caption track reserved; no narration-ready audio was linked.",
    },
    {
      key: "preview_watermark",
      order: 70,
      label: "Preview watermark",
      enabled: true,
      notes: "Internal preview watermark is mandatory in this phase.",
    },
    {
      key: "foreground_overlays",
      order: 80,
      label: "Foreground overlays",
      enabled: true,
      notes: "Reserved for safe overlays only; no debug artifacts in production-intent renders.",
    },
  ];
}

function buildRenderBaseline(params: {
  scriptPackage: PodcastScriptPackage;
  sceneTemplate: AvatarVideoSceneTemplate;
  segmentMapping: AvatarVideoSegmentMapping[];
  provider: AvatarVideoRenderProvider;
}): RenderBaseline {
  const timingSegments = buildTimingSegments(params.segmentMapping);
  const totalDurationMs = timingSegments[timingSegments.length - 1]?.endMs || 0;
  const hasNarration = params.segmentMapping.some((segment) => segment.audioAvailable);
  const storagePrefix = `internal/avatar-video/script-${params.scriptPackage.id}/${params.sceneTemplate}`;
  const reasons: string[] = [];
  if (!timingSegments.length) {
    reasons.push("No script segments available for rendering.");
  }
  if (!hasNarration) {
    reasons.push("No linked voice audio; captions and timing use script-derived fallback.");
  }
  if (params.provider !== "dry_run") {
    reasons.push("Selected renderer is placeholder-only; dry_run remains the only executable renderer.");
  }

  const safeZones: RenderBaseline["safeZones"] = {
    anchorSafeZone: {
      x: 58,
      y: 10,
      width: 36,
      height: 60,
      unit: "percent",
      purpose: "anchor_placeholder_safe_zone",
    },
    lowerThirdZone: {
      x: 4,
      y: 72,
      width: 92,
      height: 12,
      unit: "percent",
      purpose: "lower_third_text_and_metadata",
    },
    tickerZone: {
      x: 0,
      y: 90,
      width: 100,
      height: 10,
      unit: "percent",
      purpose: "ticker_items_and_motion_strip",
    },
    captionZone: {
      x: 10,
      y: 85,
      width: 80,
      height: 4,
      unit: "percent",
      purpose: "caption_lines_without_lower_third_or_ticker_overlap",
    },
    monitorPanelZones: buildMonitorZones(params.sceneTemplate),
  };

  const textSafety: RenderBaseline["textSafety"] = {
    headlineMaxChars: 96,
    lowerThirdMaxChars: 88,
    tickerItemMaxChars: 72,
    captionMaxCharsPerLine: 42,
    captionMaxLines: 2,
    overlapPrevention: [
      "headline_vs_anchor_safe_zone",
      "captions_above_lower_third",
      "captions_above_ticker",
      "panel_margin_guardrails",
    ],
  };

  const script = params.scriptPackage.scriptPackage;
  const tickerItems = Array.isArray(script.shortsHooks) ? script.shortsHooks.slice(0, 8) : [];
  const layoutFindings = analyzeRenderBaselineLayout(safeZones);
  const textFindings = analyzeRenderBaselineText(textSafety, {
    headlineText: script.youtubeTitle,
    lowerThirdText: script.thumbnailText || script.youtubeTitle,
    tickerItems,
    captionSegments: params.segmentMapping.map((seg, idx) => ({
      segmentIndex: typeof seg.segmentIndex === "number" ? seg.segmentIndex : idx,
      text: seg.textPreview || "",
    })),
  });
  const compliance = mergeFindings(layoutFindings, textFindings);

  return {
    renderer: "avatar_dry_run_planner",
    format: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      subtitles: "srt",
      fps: 30,
      width: 1920,
      height: 1080,
    },
    layers: buildLayers(hasNarration),
    safeZones,
    timing: {
      totalDurationMs,
      lowerThirdPolicy: "Show during main narration and key segment openings.",
      tickerPolicy: "Persistent ticker unless manually disabled by future render plans.",
      panelSwitchPolicy: "Switch monitor panel content on segment boundaries.",
      segments: timingSegments,
    },
    textSafety,
    storage: {
      mode: "local_preview_only",
      refs: [
        {
          kind: "mp4",
          storageKey: `${storagePrefix}/preview.mp4`,
          accessMode: "admin_only_stream",
          publicUrl: null,
          status: "planned",
        },
        {
          kind: "srt",
          storageKey: `${storagePrefix}/captions.srt`,
          accessMode: "admin_only_stream",
          publicUrl: null,
          status: "planned",
        },
      ],
      objectStorageConfigured: false,
      ready: timingSegments.length > 0,
    },
    renderReadiness: {
      readyForDryRunRender: timingSegments.length > 0,
      rendererStatus: timingSegments.length === 0
        ? "needs_script"
        : hasNarration
          ? "ready"
          : "needs_audio",
      reasons,
    },
    previewWatermark: {
      enabled: true,
      label: "INTERNAL PREVIEW",
      reason: "Phase 1A outputs are internal-only and must not be treated as publish-ready media.",
    },
    compliance: {
      analyzedAt: new Date().toISOString(),
      warnings: compliance.warnings,
      errors: compliance.errors,
    },
    captionsArtifact: null,
    captionsPreview: null,
    mp4Artifact: null,
    mp4Preview: null,
  };
}

function buildPreviewMetadata(params: {
  scriptPackage: PodcastScriptPackage;
  sceneTemplate: AvatarVideoSceneTemplate;
  segmentMapping: AvatarVideoSegmentMapping[];
  provider: AvatarVideoRenderProvider;
  safeModeWarnings: string[];
  excludedSpeakers: AvatarVideoPreviewMetadata["excludedSpeakers"];
}): PreviewMetadataWithBaseline {
  const script = params.scriptPackage.scriptPackage;
  const provider = providerStatus(params.provider);
  const renderBaseline = buildRenderBaseline({
    scriptPackage: params.scriptPackage,
    sceneTemplate: params.sceneTemplate,
    segmentMapping: params.segmentMapping,
    provider: params.provider,
  });
  return {
    title: safeString(script.youtubeTitle, `Mougle Video Render Plan ${params.scriptPackage.id}`),
    thumbnailText: safeString(script.thumbnailText, "Mougle"),
    descriptionPreview: truncate(script.youtubeDescription, 480),
    shortsHooks: Array.isArray(script.shortsHooks) ? script.shortsHooks.slice(0, 8) : [],
    complianceNotes: [
      ...(params.scriptPackage.safetyNotes?.notes || []),
      ...(script.complianceSafetyNotes || []),
    ].filter(Boolean).slice(0, 20),
    sourceEvidenceReferences: (script.sourceEvidenceReferences || []).slice(0, 20),
    providerStatus: {
      selected: provider.selected,
      dryRunDefault: true,
      liveProviderCalls: false,
      message: provider.message,
    },
    safety: {
      internalAdminReviewOnly: true,
      manualRootAdminTriggerOnly: true,
      publicPublishing: false,
      youtubeUpload: false,
      socialPosting: false,
      privateMemoryUsed: false,
      userOwnedAvatarsIncluded: false,
      unreal3dImplementation: false,
    },
    safeModeWarnings: params.safeModeWarnings,
    excludedSpeakers: params.excludedSpeakers,
    generatedAt: new Date().toISOString(),
    renderBaseline,
  };
}

async function latestAudioJobFor(scriptPackageId: number): Promise<PodcastAudioJob | null> {
  const [job] = await db.select().from(podcastAudioJobs)
    .where(eq(podcastAudioJobs.scriptPackageId, scriptPackageId))
    .orderBy(desc(podcastAudioJobs.createdAt))
    .limit(1);
  return job || null;
}

async function latestYouTubePackageFor(scriptPackageId: number): Promise<YouTubePublishingPackage | null> {
  const [pkg] = await db.select().from(youtubePublishingPackages)
    .where(eq(youtubePublishingPackages.scriptPackageId, scriptPackageId))
    .orderBy(desc(youtubePublishingPackages.createdAt))
    .limit(1);
  return pkg || null;
}

async function latestRenderJobFor(scriptPackageId: number): Promise<AvatarVideoRenderJob | null> {
  const [job] = await db.select().from(avatarVideoRenderJobs)
    .where(eq(avatarVideoRenderJobs.scriptPackageId, scriptPackageId))
    .orderBy(desc(avatarVideoRenderJobs.createdAt))
    .limit(1);
  return job || null;
}

async function loadScriptPackage(id: number): Promise<PodcastScriptPackage> {
  const [scriptPackage] = await db.select().from(podcastScriptPackages)
    .where(eq(podcastScriptPackages.id, id))
    .limit(1);
  if (!scriptPackage) throw new AvatarVideoRenderError(404, "Podcast script package not found.");
  return scriptPackage;
}

async function loadAudioJob(id: number | null | undefined, scriptPackageId: number): Promise<PodcastAudioJob | null> {
  if (!id) return latestAudioJobFor(scriptPackageId);
  const [job] = await db.select().from(podcastAudioJobs)
    .where(eq(podcastAudioJobs.id, id))
    .limit(1);
  if (!job) throw new AvatarVideoRenderError(404, "Podcast audio job not found.");
  if (job.scriptPackageId !== scriptPackageId) {
    throw new AvatarVideoRenderError(400, "Podcast audio job does not belong to the selected script package.");
  }
  return job;
}

async function loadYouTubePackage(id: number | null | undefined, scriptPackageId: number): Promise<YouTubePublishingPackage | null> {
  if (!id) return latestYouTubePackageFor(scriptPackageId);
  const [pkg] = await db.select().from(youtubePublishingPackages)
    .where(eq(youtubePublishingPackages.id, id))
    .limit(1);
  if (!pkg) throw new AvatarVideoRenderError(404, "YouTube publishing package not found.");
  if (pkg.scriptPackageId !== scriptPackageId) {
    throw new AvatarVideoRenderError(400, "YouTube publishing package does not belong to the selected script package.");
  }
  return pkg;
}

async function loadRenderJob(id: number): Promise<AvatarVideoRenderJob> {
  const [job] = await db.select().from(avatarVideoRenderJobs)
    .where(eq(avatarVideoRenderJobs.id, id))
    .limit(1);
  if (!job) throw new AvatarVideoRenderError(404, "Avatar/video render job not found.");
  return job;
}

async function buildRenderPlan(params: {
  scriptPackage: PodcastScriptPackage;
  audioJob: PodcastAudioJob | null;
  provider: AvatarVideoRenderProvider;
  sceneTemplate: AvatarVideoSceneTemplate;
}) {
  const { mapping, excludedSpeakers } = buildAvatarProfileMapping(params.scriptPackage, params.audioJob);
  const segmentMapping = mapAudioSegments(params.audioJob, params.scriptPackage.scriptPackage);
  const warnings = await safeModeWarnings();
  const previewMetadata = buildPreviewMetadata({
    scriptPackage: params.scriptPackage,
    sceneTemplate: params.sceneTemplate,
    segmentMapping,
    provider: params.provider,
    safeModeWarnings: warnings,
    excludedSpeakers,
  });
  return {
    avatarProfileMapping: mapping,
    segmentMapping,
    previewMetadata,
    estimatedCost: 0,
  };
}

async function audit(
  action: string,
  actorId: string,
  job: AvatarVideoRenderJob | null,
  outcome: "success" | "blocked" | "failed",
  details: Record<string, unknown> = {},
) {
  await riskManagementService.logAudit({
    actorId,
    actorType: "root_admin",
    action,
    resourceType: "avatar_video_render_job",
    resourceId: job ? String(job.id) : details.scriptPackageId ? String(details.scriptPackageId) : "unknown",
    outcome,
    riskLevel: outcome === "success" ? "medium" : "high",
    details: {
      phase: "phase_31_avatar_video_rendering_foundation",
      internalAdminReviewOnly: true,
      dryRunOnly: true,
      noProviderCall: true,
      noPublishing: true,
      ...details,
    },
  });
}

async function listEligiblePackages(limit = 50): Promise<{
  providerStatus: ProviderStatus;
  safeModeWarnings: string[];
  sceneTemplates: readonly AvatarVideoSceneTemplate[];
  providers: readonly AvatarVideoRenderProvider[];
  items: EligibleRenderPackage[];
}> {
  const scripts = await db.select().from(podcastScriptPackages)
    .where(sql`${podcastScriptPackages.status} in ('admin_review', 'approved')`)
    .orderBy(desc(podcastScriptPackages.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));

  const items: EligibleRenderPackage[] = [];
  for (const scriptPackage of scripts) {
    const [latestAudioJob, youtubePackage, existingRenderJob] = await Promise.all([
      latestAudioJobFor(scriptPackage.id),
      latestYouTubePackageFor(scriptPackage.id),
      latestRenderJobFor(scriptPackage.id),
    ]);
    items.push({ scriptPackage, latestAudioJob, youtubePackage, existingRenderJob });
  }

  return {
    providerStatus: providerStatus("dry_run"),
    safeModeWarnings: await safeModeWarnings(),
    sceneTemplates: avatarVideoSceneTemplates,
    providers: avatarVideoRenderProviders,
    items,
  };
}

async function listJobs(limit = 50): Promise<AvatarVideoRenderJob[]> {
  return db.select().from(avatarVideoRenderJobs)
    .orderBy(desc(avatarVideoRenderJobs.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
}

async function getJob(id: number) {
  return loadRenderJob(id);
}

async function createJob(input: CreateRenderJobInput): Promise<{
  providerStatus: ProviderStatus;
  job: AvatarVideoRenderJob;
  scriptPackage: PodcastScriptPackage;
  audioJob: PodcastAudioJob | null;
  youtubePackage: YouTubePublishingPackage | null;
}> {
  const scriptPackage = await loadScriptPackage(input.scriptPackageId);
  if (!["admin_review", "approved"].includes(scriptPackage.status)) {
    throw new AvatarVideoRenderError(400, "Only admin-review or approved podcast script packages can be used for video render planning.");
  }

  const provider = ensureProvider(input.provider);
  const sceneTemplate = ensureSceneTemplate(input.sceneTemplate);
  const [audioJob, youtubePackage] = await Promise.all([
    loadAudioJob(input.audioJobId, scriptPackage.id),
    loadYouTubePackage(input.youtubePackageId, scriptPackage.id),
  ]);
  const plan = await buildRenderPlan({ scriptPackage, audioJob, provider, sceneTemplate });

  const [job] = await db.insert(avatarVideoRenderJobs).values({
    scriptPackageId: scriptPackage.id,
    audioJobId: audioJob?.id || null,
    youtubePackageId: youtubePackage?.id || null,
    status: "draft",
    provider,
    sceneTemplate,
    avatarProfileMapping: plan.avatarProfileMapping,
    segmentMapping: plan.segmentMapping,
    previewMetadata: plan.previewMetadata,
    estimatedCost: plan.estimatedCost,
    actualCost: 0,
    adminReviewStatus: "internal_admin_review",
    outputPath: null,
    outputUrl: null,
    errorMessage: null,
    createdBy: input.createdBy,
  }).returning();

  await audit("avatar_video_render_create", input.createdBy, job, "success", {
    scriptPackageId: scriptPackage.id,
    audioJobId: audioJob?.id || null,
    youtubePackageId: youtubePackage?.id || null,
    provider,
    sceneTemplate,
  });

  return {
    providerStatus: providerStatus(provider),
    job,
    scriptPackage,
    audioJob,
    youtubePackage,
  };
}

async function previewJob(id: number, actorId: string) {
  const job = await loadRenderJob(id);
  if (job.status === "canceled") {
    throw new AvatarVideoRenderError(400, "Canceled render jobs cannot be previewed.");
  }
  const scriptPackage = await loadScriptPackage(job.scriptPackageId);
  const [audioJob, youtubePackage] = await Promise.all([
    loadAudioJob(job.audioJobId, scriptPackage.id),
    loadYouTubePackage(job.youtubePackageId, scriptPackage.id),
  ]);
  const provider = ensureProvider(job.provider);
  const plan = await buildRenderPlan({
    scriptPackage,
    audioJob,
    provider,
    sceneTemplate: ensureSceneTemplate(job.sceneTemplate),
  });

  const previewMetadata = plan.previewMetadata as PreviewMetadataWithBaseline;
  const baseline = previewMetadata.renderBaseline;
  const captionInputs = baseline.timing.segments.map((seg) => {
    const mapping = plan.segmentMapping.find((s) => s.segmentIndex === seg.segmentIndex);
    return {
      segmentIndex: seg.segmentIndex,
      startMs: seg.captionWindow.startMs,
      endMs: seg.captionWindow.endMs,
      text: mapping?.textPreview || "",
    };
  });
  const { srt, cueCount } = renderSrtService.buildSrtFromSegments(captionInputs, {
    maxCharsPerLine: baseline.textSafety.captionMaxCharsPerLine,
    maxLines: baseline.textSafety.captionMaxLines,
  });

  let captionsLocalPath: string | null = null;
  if (srt) {
    try {
      const captionsArtifact = await renderSrtService.writeSrtForRenderJob(id, srt);
      const preview = renderSrtService.srtPreviewFromText(srt, 12);
      baseline.captionsArtifact = captionsArtifact;
      baseline.captionsPreview = {
        firstLines: preview.firstLines,
        lineCount: preview.lineCount,
        cueCount,
      };
      if (captionsArtifact) {
        const srtRef = baseline.storage.refs.find((ref) => ref.kind === "srt");
        if (srtRef) {
          srtRef.status = "generated";
          srtRef.storageKey = captionsArtifact.storageKey;
        }
        const srtFilename = (captionsArtifact.storageKey || "").split("/").pop() || "";
        if (srtFilename && renderSrtService.isValidRenderFilename(srtFilename)) {
          captionsLocalPath = renderSrtService.localPathForRenderFilename(srtFilename);
        }
      }
    } catch {
      baseline.captionsArtifact = null;
      baseline.captionsPreview = null;
      captionsLocalPath = null;
    }
  }

  try {
    const mp4Segments = baseline.timing.segments.map((seg) => {
      const mapping = plan.segmentMapping.find((s) => s.segmentIndex === seg.segmentIndex);
      const profile = plan.avatarProfileMapping?.[seg.speakerAgentKey];
      const speakerLabel = mapping?.displayName
        || profile?.displayName
        || seg.speakerAgentKey
        || "Speaker";
      return {
        segmentIndex: seg.segmentIndex,
        startMs: seg.startMs,
        endMs: seg.endMs,
        scriptType: seg.scriptType,
        speakerLabel,
        textPreview: mapping?.textPreview || "",
      };
    });
    const mp4Result = await renderMp4Service.writeMp4ForRenderJob(id, {
      title: previewMetadata.title || `Render Job #${id}`,
      watermarkLabel: baseline.previewWatermark.label,
      segments: mp4Segments,
      srtPath: captionsLocalPath,
    });
    if (mp4Result.artifact) {
      baseline.mp4Artifact = mp4Result.artifact;
      baseline.mp4Preview = {
        width: 640,
        height: 360,
        fps: 10,
        durationMs: mp4Result.durationMs,
        segmentCount: mp4Result.segmentCount,
        note: "Low-fidelity slate-card preview composited locally; no live avatar provider was called.",
      };
      const mp4Ref = baseline.storage.refs.find((ref) => ref.kind === "mp4");
      if (mp4Ref) {
        mp4Ref.status = "generated";
        mp4Ref.storageKey = mp4Result.artifact.storageKey;
      }
    } else {
      baseline.mp4Artifact = null;
      baseline.mp4Preview = null;
      // C-FF-1: surface FFmpeg failure reason on the in-memory baseline so the
      // admin Preview Studio can display it. Persisted column is a follow-up
      // tied to the C-DB-1 schema migration window.
      (baseline as any).mp4FailureReason = mp4Result.failureReason || "unknown";
      (baseline as any).mp4FfmpegExitCode = mp4Result.ffmpegExitCode;
      (baseline as any).mp4FfmpegStderrTail = mp4Result.ffmpegStderrTail;
    }
  } catch (err) {
    baseline.mp4Artifact = null;
    baseline.mp4Preview = null;
    (baseline as any).mp4FailureReason = `caller_exception:${(err as Error).message?.slice(0, 200) || "unknown"}`;
  }

  const [updated] = await db.update(avatarVideoRenderJobs).set({
    status: "preview_ready",
    avatarProfileMapping: plan.avatarProfileMapping,
    segmentMapping: plan.segmentMapping,
    previewMetadata,
    estimatedCost: plan.estimatedCost,
    errorMessage: null,
    previewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(avatarVideoRenderJobs.id, id)).returning();

  await audit("avatar_video_render_preview", actorId, updated, "success", {
    provider,
    sceneTemplate: updated.sceneTemplate,
    segmentCount: updated.segmentMapping.length,
  });

  return {
    providerStatus: providerStatus(provider),
    job: updated,
    scriptPackage,
    audioJob,
    youtubePackage,
  };
}

async function renderJob(id: number, actorId: string) {
  const job = await loadRenderJob(id);
  if (job.status === "canceled") {
    throw new AvatarVideoRenderError(400, "Canceled render jobs cannot be rendered.");
  }
  if (job.provider !== "dry_run") {
    const [updated] = await db.update(avatarVideoRenderJobs).set({
      status: "failed",
      errorMessage: "Live avatar/video providers are placeholder-only in Phase 31. Use dry_run for internal render planning.",
      updatedAt: new Date(),
    }).where(eq(avatarVideoRenderJobs.id, id)).returning();
    await audit("avatar_video_render_block_live_provider", actorId, updated, "blocked", { provider: job.provider });
    throw new AvatarVideoRenderError(503, "Live avatar/video providers are not enabled in Phase 31. Use dry_run.");
  }

  const [updated] = await db.update(avatarVideoRenderJobs).set({
    status: "dry_run_completed",
    actualCost: 0,
    errorMessage: null,
    renderedBy: actorId,
    renderedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(avatarVideoRenderJobs.id, id)).returning();

  await audit("avatar_video_render_dry_run", actorId, updated, "success", {
    provider: updated.provider,
    sceneTemplate: updated.sceneTemplate,
    actualCost: 0,
    outputGenerated: false,
  });

  return {
    providerStatus: providerStatus("dry_run"),
    job: updated,
  };
}

async function cancelJob(id: number, actorId: string) {
  const job = await loadRenderJob(id);
  if (job.status === "canceled") return { providerStatus: providerStatus(ensureProvider(job.provider)), job };

  const [updated] = await db.update(avatarVideoRenderJobs).set({
    status: "canceled",
    errorMessage: "Canceled by root admin before any public rendering or publishing.",
    canceledBy: actorId,
    canceledAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(avatarVideoRenderJobs.id, id)).returning();

  await audit("avatar_video_render_cancel", actorId, updated, "success", {
    previousStatus: job.status,
    provider: job.provider,
  });

  return {
    providerStatus: providerStatus(ensureProvider(updated.provider)),
    job: updated,
  };
}

export const avatarVideoRenderService = {
  listEligiblePackages,
  listJobs,
  getJob,
  createJob,
  previewJob,
  renderJob,
  cancelJob,
  providerStatus,
  renderBroadcast,
};

/**
 * T6 — Broadcast Compositor entry point.
 *
 * Required by the Newsroom T6 task contract: existing avatar render service
 * gains a `renderBroadcast(packageId, brollPlanId, anchorVideoUrl)`
 * entry point. We keep this service as the single boundary the rest of the
 * pipeline talks to and delegate the heavy lifting (layered composition,
 * safety gates, manifest writing) to `broadcast-compositor-service`.
 *
 * The compositor enforces:
 *   - server-side package approval lookup (request body cannot bypass)
 *   - dryRun=true by default; founder approval flag required for non-dry-run
 *   - local-only media paths (HTTP rejected to prevent SSRF)
 *   - manifest with full source licence attribution
 */
export interface RenderBroadcastEntryOptions {
  /** Defaults to the compositor's own defaults; provide overrides as needed. */
  kicker?: string;
  headline?: string;
  brandLabel?: string;
  speakerName?: string | null;
  speakerRole?: string | null;
  tickerItems?: string[];
  breaking?: { enabled: boolean; label?: string; headline?: string };
  confidence?: "high" | "medium" | "low";
  confidenceScore?: number;
  sources: Array<{
    name: string;
    url?: string | null;
    license: string;
    attribution?: string | null;
    tier?: string | null;
  }>;
  backgroundImageUrl?: string | null;
  backgroundAttribution?: string | null;
  durationSec?: number;
  dryRun?: boolean;
  founderApprovalFlag?: string | null;
  actorId: string;
}

// Overload preserves the 3-arg contract from the original task spec for any
// callers that don't yet pass overrides. When called without options, sane
// defaults are used and the caller is responsible for ensuring an approval
// row exists for `packageId` and at least one source attribution is provided
// via the (required) options on real renders.
export function renderBroadcast(
  packageId: string,
  brollPlanId: string | null,
  anchorVideoUrl: string | null,
): Promise<{ mp4Path: string; manifestPath: string; broadcastId: string; dryRun: boolean }>;
export function renderBroadcast(
  packageId: string,
  brollPlanId: string | null,
  anchorVideoUrl: string | null,
  options: RenderBroadcastEntryOptions,
): Promise<{ mp4Path: string; manifestPath: string; broadcastId: string; dryRun: boolean }>;
export async function renderBroadcast(
  packageId: string,
  brollPlanId: string | null,
  anchorVideoUrl: string | null,
  options?: RenderBroadcastEntryOptions,
): Promise<{ mp4Path: string; manifestPath: string; broadcastId: string; dryRun: boolean }> {
  const opts: RenderBroadcastEntryOptions = options ?? {
    sources: [{ name: "Mougle Newsroom", url: null, license: "owned", tier: "owned" }],
    actorId: "system",
  };
  // Lazy import to avoid a hard circular dependency when this module is
  // loaded by the worker boot path before the broadcasts schema is registered.
  const { broadcastCompositorService } = await import("./broadcast-compositor-service");
  const result = await broadcastCompositorService.renderBroadcast({
    packageId,
    brollPlanId,
    anchorVideoUrl,
    backgroundImageUrl: opts.backgroundImageUrl ?? null,
    backgroundAttribution: opts.backgroundAttribution ?? null,
    brandLabel: opts.brandLabel ?? "MOUGLE",
    kicker: opts.kicker ?? "MOUGLE NEWSROOM",
    headline: opts.headline ?? "Verified broadcast package",
    speakerName: opts.speakerName ?? null,
    speakerRole: opts.speakerRole ?? null,
    tickerItems: opts.tickerItems ?? [],
    breaking: {
      enabled: opts.breaking?.enabled ?? false,
      label: opts.breaking?.label ?? "BREAKING",
      headline: opts.breaking?.headline ?? "",
    },
    confidence: opts.confidence ?? "high",
    confidenceScore: opts.confidenceScore ?? 0.9,
    sources: opts.sources.map((s) => ({
      name: s.name,
      url: s.url ?? null,
      license: s.license,
      attribution: s.attribution ?? null,
      tier: s.tier ?? null,
    })),
    durationSec: opts.durationSec ?? 8,
    dryRun: opts.dryRun ?? true,
    founderApprovalFlag: opts.founderApprovalFlag ?? null,
    actorId: opts.actorId,
  });
  return {
    mp4Path: result.mp4Path,
    manifestPath: result.manifestPath,
    broadcastId: result.broadcast.id,
    dryRun: result.broadcast.dryRun,
  };
}
