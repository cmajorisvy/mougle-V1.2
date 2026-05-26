/**
 * Canonical RenderManifest — shared by FFmpeg and Remotion pipelines.
 *
 * Goal: one structural contract that both render backends consume so they
 * cannot drift into incompatible scene packages.
 *
 * This module is contract-only:
 *   - No DB I/O. No HTTP. No provider calls.
 *   - No `Date.now()` / `Math.random()` reads.
 *   - All publish/social/live/autonomous flags are literal-locked to `false`.
 *
 * Backward compatibility:
 *   - The existing `NewsroomRenderManifest` in `shared/newsroom-types.ts`
 *     remains valid. `fromNewsroomRenderManifest()` upgrades it to this
 *     canonical shape without data loss for the in-scope fields.
 *   - `toMp4PreviewOptions()` projects a canonical manifest into the existing
 *     `Mp4PreviewOptions` shape consumed by `server/services/render-mp4-service.ts`,
 *     so the FFmpeg path can be driven from the canonical manifest without a
 *     breaking change.
 */

import { z } from "zod";
import {
  ComplianceFindingSchema,
  RenderLayerSchema,
  RenderSafeZonesSchema,
  RenderTextSafetySchema,
  RightsStatusSchema,
  type ComplianceFinding,
  type NewsroomRenderManifest,
  type RightsStatus,
} from "./newsroom-types";

/* --------------------------------------------------------------------- */
/* Enumerations — event-media modes + rights gate                         */
/* --------------------------------------------------------------------- */

export const EVENT_MEDIA_MODES = [
  "fullscreen",
  "background_screen",
  "picture_in_picture",
  "disabled",
] as const;
export const EventMediaModeSchema = z.enum(EVENT_MEDIA_MODES);
export type EventMediaMode = z.infer<typeof EventMediaModeSchema>;

export const RIGHTS_GATES = [
  "approved_for_use",
  "internal_reference_only",
  "needs_review",
  "rejected",
  "unknown",
] as const;
export const RightsGateSchema = z.enum(RIGHTS_GATES);
export type RightsGate = z.infer<typeof RightsGateSchema>;

/**
 * Pure mapping from the existing `RightsStatus` (rights_unknown / owned /
 * licensed / fair_use_review / blocked) to the broader render-side
 * `RightsGate` vocabulary. Keep in sync with the canonical contract.
 */
export function rightsStatusToRightsGate(s: RightsStatus): RightsGate {
  switch (s) {
    case "owned":
    case "licensed":
      return "approved_for_use";
    case "fair_use_review":
      return "needs_review";
    case "rights_unknown":
      return "unknown";
    case "blocked":
      return "rejected";
  }
}

/** True only for `approved_for_use`. Other gates must NOT be rendered. */
export function isRenderableGate(g: RightsGate): boolean {
  return g === "approved_for_use";
}

/* --------------------------------------------------------------------- */
/* Storage references (no secrets — opaque keys only)                    */
/* --------------------------------------------------------------------- */

export const StorageRefSchema = z.object({
  storageKey: z.string().min(1).max(500),
  /**
   * Optional public URL (e.g. CDN). NEVER a signed/secret-bearing URL.
   * Callers MUST strip query strings containing tokens before storing here.
   */
  publicUrl: z.string().url().nullable().optional(),
  byteSize: z.number().int().min(0).nullable().optional(),
  durationMs: z.number().int().min(0).nullable().optional(),
});
export type StorageRef = z.infer<typeof StorageRefSchema>;

/* --------------------------------------------------------------------- */
/* Canvas + scenes                                                        */
/* --------------------------------------------------------------------- */

export const CanvasSchema = z.object({
  width: z.number().int().positive().max(7680),
  height: z.number().int().positive().max(4320),
  pixelAspect: z.number().positive().default(1),
});
export type Canvas = z.infer<typeof CanvasSchema>;

/**
 * Legacy timing metadata carried verbatim from `NewsroomRenderManifest.timing.segments`.
 * Present only when the canonical manifest was produced by `fromNewsroomRenderManifest()`.
 * Optional everywhere — new manifests need not set it.
 */
export const RenderSceneLegacyMetaSchema = z.object({
  tickerVisible: z.boolean().nullable().optional(),
  lowerThirdVisible: z.boolean().nullable().optional(),
  captionWindow: z
    .object({
      startMs: z.number().int().min(0),
      endMs: z.number().int().positive(),
    })
    .nullable()
    .optional(),
  sourceClaimIds: z.array(z.string()).default([]),
});
export type RenderSceneLegacyMeta = z.infer<typeof RenderSceneLegacyMetaSchema>;

export const RenderSceneSchema = z.object({
  sceneIndex: z.number().int().min(0),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  label: z.string().min(1).max(120),
  template: z.string().min(1).max(80).nullable().optional(),
  legacy: RenderSceneLegacyMetaSchema.nullable().optional(),
});
export type RenderScene = z.infer<typeof RenderSceneSchema>;

/* --------------------------------------------------------------------- */
/* Track cues                                                             */
/* --------------------------------------------------------------------- */

const TimeWindow = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
});

export const AnchorCueSchema = TimeWindow.extend({
  sceneIndex: z.number().int().min(0),
  speakerLabel: z.string().min(1).max(80),
  narrationText: z.string().min(1).max(4000),
  /** Hint only — never an API key. */
  voiceId: z.string().min(1).max(120).nullable().optional(),
});
export type AnchorCue = z.infer<typeof AnchorCueSchema>;

export const VoiceCueSchema = TimeWindow.extend({
  source: z.enum(["tts", "external"]),
  audioRef: StorageRefSchema.nullable().optional(),
  /** TTS hint only — caller resolves the actual voice. No secrets. */
  voiceId: z.string().min(1).max(120).nullable().optional(),
  gainDb: z.number().min(-60).max(12).default(0),
});
export type VoiceCue = z.infer<typeof VoiceCueSchema>;

export const CaptionCueSchema = TimeWindow.extend({
  index: z.number().int().min(0),
  text: z.string().min(1).max(240),
});
export type CaptionCue = z.infer<typeof CaptionCueSchema>;

export const CaptionTrackSchema = z.object({
  format: z.enum(["srt", "vtt"]).default("srt"),
  cues: z.array(CaptionCueSchema),
  overflowFindings: z.array(ComplianceFindingSchema).default([]),
});
export type CaptionTrack = z.infer<typeof CaptionTrackSchema>;

export const LowerThirdCueSchema = TimeWindow.extend({
  primary: z.string().min(1).max(120),
  secondary: z.string().max(120).nullable().optional(),
});
export type LowerThirdCue = z.infer<typeof LowerThirdCueSchema>;

export const TickerTrackSchema = z.object({
  items: z.array(z.string().min(1).max(140)).max(20),
  /** Time it takes for the ticker to scroll its full content once. */
  loopMs: z.number().int().positive().default(20000),
});
export type TickerTrack = z.infer<typeof TickerTrackSchema>;

export const MonitorPanelCueSchema = TimeWindow.extend({
  content: z.string().min(1).max(500),
  /** Optional storage ref (e.g. chart PNG). */
  mediaRef: StorageRefSchema.nullable().optional(),
});
export type MonitorPanelCue = z.infer<typeof MonitorPanelCueSchema>;

export const MonitorPanelTrackSchema = z.object({
  panelKey: z.string().min(1).max(80),
  cues: z.array(MonitorPanelCueSchema),
});
export type MonitorPanelTrack = z.infer<typeof MonitorPanelTrackSchema>;

export const EventMediaCueSchema = TimeWindow.extend({
  mediaId: z.string().min(1).max(120),
  kind: z.enum(["image", "clip", "chart"]),
  mode: EventMediaModeSchema,
  rightsGate: RightsGateSchema,
  /**
   * Mirrors the upstream `RightsStatus` (verified-newsroom contract) so the
   * gate's provenance is auditable. Optional because the canonical manifest
   * may be sourced from non-newsroom inputs in future.
   */
  rightsStatusSource: RightsStatusSchema.nullable().optional(),
  storageRef: StorageRefSchema.nullable().optional(),
  /**
   * Resolved by `validateRenderManifest()` from `mode` + `rightsGate`. Will
   * always be `false` when `mode === "disabled"` or `rightsGate !==
   * "approved_for_use"`. Defense-in-depth — render backends MUST also check.
   */
  renderable: z.boolean().default(false),
  note: z.string().max(500).nullable().optional(),
});
export type EventMediaCue = z.infer<typeof EventMediaCueSchema>;

export const TransitionCueSchema = z.object({
  atMs: z.number().int().min(0),
  kind: z.enum(["cut", "crossfade", "slide_in", "slide_out", "fade_to_black"]),
  durationMs: z.number().int().min(0).max(10000).default(0),
});
export type TransitionCue = z.infer<typeof TransitionCueSchema>;

export const MusicSfxCueSchema = TimeWindow.extend({
  kind: z.enum(["music", "sfx", "bed"]),
  audioRef: StorageRefSchema.nullable().optional(),
  gainDb: z.number().min(-60).max(12).default(0),
  /** Future-proofing — currently advisory only; no audio mixing happens here. */
  loop: z.boolean().default(false),
});
export type MusicSfxCue = z.infer<typeof MusicSfxCueSchema>;

/* --------------------------------------------------------------------- */
/* Safety envelope (literal-locked)                                       */
/* --------------------------------------------------------------------- */

export const RenderSafetyFlagsSchema = z.object({
  publicPublishing: z.literal(false),
  youtubeUpload: z.literal(false),
  socialPosting: z.literal(false),
  autonomousExecution: z.literal(false),
  manualRootAdminTriggerOnly: z.literal(true),
  internalAdminReviewOnly: z.literal(true),
  nonRenderableReasons: z.array(z.string().max(200)).default([]),
});
export type RenderSafetyFlags = z.infer<typeof RenderSafetyFlagsSchema>;

/* --------------------------------------------------------------------- */
/* Canonical RenderManifest                                               */
/* --------------------------------------------------------------------- */

export const CANONICAL_RENDER_MANIFEST_VERSION = "1" as const;

export const RenderManifestSchema = z
  .object({
    contractVersion: z.literal(CANONICAL_RENDER_MANIFEST_VERSION),
    manifestId: z.string().min(1).max(200),
    packageId: z.string().min(1).max(200).nullable().optional(),
    packageVersion: z.number().int().positive().nullable().optional(),

    canvas: CanvasSchema,
    fps: z.number().int().positive().max(120),
    duration: z.object({ totalMs: z.number().int().positive() }),

    scenes: z.array(RenderSceneSchema).min(1),
    layers: z.array(RenderLayerSchema).min(1),
    safeZones: RenderSafeZonesSchema,
    textSafety: RenderTextSafetySchema,

    tracks: z.object({
      anchor: z.array(AnchorCueSchema),
      voice: z.array(VoiceCueSchema),
      caption: CaptionTrackSchema,
      lowerThird: z.array(LowerThirdCueSchema),
      ticker: TickerTrackSchema,
      monitorPanels: z.array(MonitorPanelTrackSchema),
      eventMedia: z.array(EventMediaCueSchema),
    }),

    transitionCues: z.array(TransitionCueSchema).default([]),
    musicSfxCues: z.array(MusicSfxCueSchema).default([]),

    storageRefs: z
      .object({
        backgroundsBase: z.string().max(500).nullable().optional(),
        mediaBase: z.string().max(500).nullable().optional(),
        captionsBase: z.string().max(500).nullable().optional(),
        audioBase: z.string().max(500).nullable().optional(),
      })
      .default({}),

    compliance: z
      .object({
        blocking: z.array(ComplianceFindingSchema).default([]),
        warnings: z.array(ComplianceFindingSchema).default([]),
      })
      .default({ blocking: [], warnings: [] }),

    safety: RenderSafetyFlagsSchema,

    generatedAt: z.string().min(1),
  })
  .strict();
export type RenderManifest = z.infer<typeof RenderManifestSchema>;

/* --------------------------------------------------------------------- */
/* Validation + normalization                                             */
/* --------------------------------------------------------------------- */

export interface RenderManifestValidationIssue {
  path: (string | number)[];
  code: string;
  message: string;
}

export interface RenderManifestValidationResult {
  ok: boolean;
  manifest?: RenderManifest;
  issues: RenderManifestValidationIssue[];
}

/**
 * Pure validator. Parses with Zod, then runs structural cross-field checks
 * (scene/track time bounds, rights-gate vs mode consistency, safety-flag
 * literal lock).
 */
export function validateRenderManifest(
  input: unknown,
): RenderManifestValidationResult {
  const parsed = RenderManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path as (string | number)[],
        code: i.code,
        message: i.message,
      })),
    };
  }
  const m = parsed.data;
  const issues: RenderManifestValidationIssue[] = [];

  const totalMs = m.duration.totalMs;
  for (const s of m.scenes) {
    if (s.endMs <= s.startMs) {
      issues.push({
        path: ["scenes", s.sceneIndex],
        code: "scene_window_invalid",
        message: `scene ${s.sceneIndex}: endMs must be > startMs`,
      });
    }
    if (s.endMs > totalMs) {
      issues.push({
        path: ["scenes", s.sceneIndex],
        code: "scene_exceeds_duration",
        message: `scene ${s.sceneIndex}: endMs ${s.endMs} > totalMs ${totalMs}`,
      });
    }
  }

  const checkWindow = (
    label: string,
    idx: number,
    startMs: number,
    endMs: number,
  ) => {
    if (endMs <= startMs) {
      issues.push({
        path: [label, idx],
        code: "cue_window_invalid",
        message: `${label}[${idx}]: endMs must be > startMs`,
      });
    } else if (endMs > totalMs) {
      issues.push({
        path: [label, idx],
        code: "cue_exceeds_duration",
        message: `${label}[${idx}]: endMs ${endMs} > totalMs ${totalMs}`,
      });
    }
  };

  m.tracks.anchor.forEach((c, i) =>
    checkWindow("tracks.anchor", i, c.startMs, c.endMs),
  );
  m.tracks.voice.forEach((c, i) =>
    checkWindow("tracks.voice", i, c.startMs, c.endMs),
  );
  m.tracks.caption.cues.forEach((c, i) =>
    checkWindow("tracks.caption.cues", i, c.startMs, c.endMs),
  );
  m.tracks.lowerThird.forEach((c, i) =>
    checkWindow("tracks.lowerThird", i, c.startMs, c.endMs),
  );
  m.tracks.monitorPanels.forEach((p, pi) =>
    p.cues.forEach((c, i) =>
      checkWindow(`tracks.monitorPanels[${pi}].cues`, i, c.startMs, c.endMs),
    ),
  );
  m.tracks.eventMedia.forEach((c, i) => {
    checkWindow("tracks.eventMedia", i, c.startMs, c.endMs);
    // Renderable resolution + consistency
    const renderable =
      c.mode !== "disabled" && c.rightsGate === "approved_for_use";
    if (c.renderable !== renderable) {
      issues.push({
        path: ["tracks.eventMedia", i, "renderable"],
        code: "renderable_inconsistent",
        message: `eventMedia[${i}]: renderable should be ${renderable} for mode=${c.mode}, rightsGate=${c.rightsGate}`,
      });
    }
  });

  // Safety lock (zod literal already enforces, this is belt-and-suspenders).
  if (
    m.safety.publicPublishing !== false ||
    m.safety.youtubeUpload !== false ||
    m.safety.socialPosting !== false ||
    m.safety.autonomousExecution !== false ||
    m.safety.manualRootAdminTriggerOnly !== true ||
    m.safety.internalAdminReviewOnly !== true
  ) {
    issues.push({
      path: ["safety"],
      code: "safety_flag_tampered",
      message: "safety flags must match the literal-locked envelope",
    });
  }

  return issues.length === 0
    ? { ok: true, manifest: m, issues: [] }
    : { ok: false, issues };
}

/**
 * Normalize an in-progress manifest by:
 *   - resolving `renderable` from `mode` + `rightsGate`
 *   - sorting cues by startMs
 *   - de-duping caption cue indices
 *   - filling default safety flags
 *
 * Pure — does NOT mutate the input.
 */
export function normalizeRenderManifest(
  input: RenderManifest,
): RenderManifest {
  const eventMedia = input.tracks.eventMedia
    .slice()
    .sort((a, b) => a.startMs - b.startMs || a.mediaId.localeCompare(b.mediaId))
    .map((c) => ({
      ...c,
      renderable: c.mode !== "disabled" && c.rightsGate === "approved_for_use",
    }));
  const sortCues = <T extends { startMs: number }>(arr: T[]): T[] =>
    arr.slice().sort((a, b) => a.startMs - b.startMs);
  const captionCues = sortCues(input.tracks.caption.cues).map((c, i) => ({
    ...c,
    index: i,
  }));
  return {
    ...input,
    scenes: input.scenes.slice().sort((a, b) => a.sceneIndex - b.sceneIndex),
    tracks: {
      anchor: sortCues(input.tracks.anchor),
      voice: sortCues(input.tracks.voice),
      caption: { ...input.tracks.caption, cues: captionCues },
      lowerThird: sortCues(input.tracks.lowerThird),
      ticker: input.tracks.ticker,
      monitorPanels: input.tracks.monitorPanels.map((p) => ({
        ...p,
        cues: sortCues(p.cues),
      })),
      eventMedia,
    },
    transitionCues: input.transitionCues
      .slice()
      .sort((a, b) => a.atMs - b.atMs),
    musicSfxCues: sortCues(input.musicSfxCues),
  };
}

/* --------------------------------------------------------------------- */
/* Helpers — sane safety envelope                                         */
/* --------------------------------------------------------------------- */

export function buildLockedSafetyFlags(
  nonRenderableReasons: string[] = [],
): RenderSafetyFlags {
  return {
    publicPublishing: false,
    youtubeUpload: false,
    socialPosting: false,
    autonomousExecution: false,
    manualRootAdminTriggerOnly: true,
    internalAdminReviewOnly: true,
    nonRenderableReasons,
  };
}

/* --------------------------------------------------------------------- */
/* Backward-compat adapter — NewsroomRenderManifest → RenderManifest      */
/* --------------------------------------------------------------------- */

export function fromNewsroomRenderManifest(
  m: NewsroomRenderManifest,
  opts: { manifestId: string },
): RenderManifest {
  const totalMs = m.timing.totalDurationMs;
  const scenes: RenderScene[] = m.timing.segments.map((s) => ({
    sceneIndex: s.segmentIndex,
    startMs: s.startMs,
    endMs: s.endMs,
    label: `segment_${s.segmentIndex}`,
    legacy: {
      tickerVisible: s.tickerVisible,
      lowerThirdVisible: s.lowerThirdVisible,
      captionWindow: {
        startMs: s.captionWindow.startMs,
        endMs: s.captionWindow.endMs,
      },
      sourceClaimIds: s.sourceClaimIds.slice(),
    },
  }));

  const captionCues: CaptionCue[] = m.captionsPlan.cues.map((c) => ({
    index: c.index,
    startMs: c.startMs,
    endMs: c.endMs,
    text: c.text,
  }));

  const eventMedia: EventMediaCue[] = m.mediaPlan.map((p) => {
    const gate = rightsStatusToRightsGate(p.rightsStatus);
    const mode: EventMediaMode =
      p.layer === "background" ? "background_screen" : "picture_in_picture";
    return {
      mediaId: p.mediaId,
      kind: "image" as const, // legacy plan does not carry kind; default image
      mode,
      rightsGate: gate,
      rightsStatusSource: p.rightsStatus,
      startMs: p.startMs,
      endMs: p.endMs,
      renderable: gate === "approved_for_use",
      storageRef: null,
      note: null,
    };
  });

  const lowerThird: LowerThirdCue[] = m.timing.segments
    .filter((s) => s.lowerThirdVisible)
    .map((s) => ({
      startMs: s.startMs,
      endMs: s.endMs,
      primary: `segment_${s.segmentIndex}`,
      secondary: null,
    }));

  // Locked safety envelope; preserve any blocking notes as reasons.
  const reasons = m.safety.blockingFindings.map((f) => f.code);
  const safety = buildLockedSafetyFlags(reasons);

  const out: RenderManifest = {
    contractVersion: CANONICAL_RENDER_MANIFEST_VERSION,
    manifestId: opts.manifestId,
    packageId: m.packageId,
    packageVersion: m.packageVersion,
    canvas: {
      width: m.format.width,
      height: m.format.height,
      pixelAspect: 1,
    },
    fps: m.format.fps,
    duration: { totalMs },
    scenes,
    layers: m.layers,
    safeZones: m.safeZones,
    textSafety: m.textSafety,
    tracks: {
      anchor: [],
      voice: [],
      caption: { format: "srt", cues: captionCues, overflowFindings: m.captionsPlan.overflowFindings },
      lowerThird,
      ticker: { items: [], loopMs: 20000 },
      monitorPanels: [],
      eventMedia,
    },
    transitionCues: [],
    musicSfxCues: [],
    storageRefs: {},
    compliance: { blocking: m.compliance.blocking, warnings: m.compliance.warnings },
    safety,
    generatedAt: m.generatedAt,
  };
  return out;
}

/* --------------------------------------------------------------------- */
/* Forward adapter — RenderManifest → existing Mp4PreviewOptions          */
/*                                                                        */
/* This lets `server/services/render-mp4-service.ts` be driven from the   */
/* canonical manifest without changing its public input contract.         */
/* --------------------------------------------------------------------- */

export interface Mp4PreviewSegmentLike {
  segmentIndex: number;
  startMs: number;
  endMs: number;
  scriptType: string;
  speakerLabel: string;
  textPreview: string;
}

export interface Mp4PreviewOptionsLike {
  title: string;
  watermarkLabel: string;
  segments: Mp4PreviewSegmentLike[];
  srtPath?: string | null;
}

export function toMp4PreviewOptions(
  manifest: RenderManifest,
  opts: {
    title: string;
    watermarkLabel: string;
    srtPath?: string | null;
  },
): Mp4PreviewOptionsLike {
  const anchorByScene = new Map<number, AnchorCue>();
  for (const a of manifest.tracks.anchor) {
    if (!anchorByScene.has(a.sceneIndex)) anchorByScene.set(a.sceneIndex, a);
  }
  const segments: Mp4PreviewSegmentLike[] = manifest.scenes.map((s) => {
    const a = anchorByScene.get(s.sceneIndex);
    return {
      segmentIndex: s.sceneIndex,
      startMs: s.startMs,
      endMs: s.endMs,
      scriptType: s.template ?? s.label,
      speakerLabel: a?.speakerLabel ?? "Anchor",
      textPreview: a?.narrationText ?? s.label,
    };
  });
  return {
    title: opts.title,
    watermarkLabel: opts.watermarkLabel,
    segments,
    srtPath: opts.srtPath ?? null,
  };
}

/* --------------------------------------------------------------------- */
/* Forward adapter — RenderManifest → Remotion-style scene package        */
/*                                                                        */
/* Remotion compositions consume a serialisable JSON `inputProps`. We     */
/* expose a minimal projection so a Remotion `<Composition>` can be       */
/* driven from the same manifest the FFmpeg path uses.                    */
/* --------------------------------------------------------------------- */

export interface RemotionScenePackage {
  contractVersion: typeof CANONICAL_RENDER_MANIFEST_VERSION;
  manifestId: string;
  canvas: Canvas;
  fps: number;
  durationInFrames: number;
  scenes: {
    sceneIndex: number;
    startFrame: number;
    endFrame: number;
    label: string;
    template: string | null;
    anchor: { speakerLabel: string; narrationText: string } | null;
    lowerThirds: { primary: string; secondary: string | null }[];
    eventMedia: {
      mediaId: string;
      mode: EventMediaMode;
      rightsGate: RightsGate;
      renderable: boolean;
      storageKey: string | null;
    }[];
  }[];
  tickerItems: string[];
  captions: CaptionCue[];
  safety: RenderSafetyFlags;
}

export function toRemotionScenePackage(
  manifest: RenderManifest,
): RemotionScenePackage {
  const msToFrame = (ms: number) => Math.round((ms / 1000) * manifest.fps);
  const anchorByScene = new Map<number, AnchorCue>();
  for (const a of manifest.tracks.anchor) {
    if (!anchorByScene.has(a.sceneIndex)) anchorByScene.set(a.sceneIndex, a);
  }
  const inWindow = (start: number, end: number, s: number, e: number) =>
    s < end && e > start;

  return {
    contractVersion: CANONICAL_RENDER_MANIFEST_VERSION,
    manifestId: manifest.manifestId,
    canvas: manifest.canvas,
    fps: manifest.fps,
    durationInFrames: msToFrame(manifest.duration.totalMs),
    scenes: manifest.scenes.map((s) => {
      const a = anchorByScene.get(s.sceneIndex) ?? null;
      const lowerThirds = manifest.tracks.lowerThird
        .filter((c) => inWindow(s.startMs, s.endMs, c.startMs, c.endMs))
        .map((c) => ({ primary: c.primary, secondary: c.secondary ?? null }));
      const eventMedia = manifest.tracks.eventMedia
        .filter((c) => inWindow(s.startMs, s.endMs, c.startMs, c.endMs))
        .map((c) => ({
          mediaId: c.mediaId,
          mode: c.mode,
          rightsGate: c.rightsGate,
          renderable: c.renderable,
          storageKey: c.storageRef?.storageKey ?? null,
        }));
      return {
        sceneIndex: s.sceneIndex,
        startFrame: msToFrame(s.startMs),
        endFrame: msToFrame(s.endMs),
        label: s.label,
        template: s.template ?? null,
        anchor: a
          ? { speakerLabel: a.speakerLabel, narrationText: a.narrationText }
          : null,
        lowerThirds,
        eventMedia,
      };
    }),
    tickerItems: manifest.tracks.ticker.items.slice(),
    captions: manifest.tracks.caption.cues.slice(),
    safety: manifest.safety,
  };
}

/* --------------------------------------------------------------------- */
/* Compliance summary — what is renderable, what is gated                 */
/* --------------------------------------------------------------------- */

export interface RenderManifestComplianceSummary {
  manifestId: string;
  renderableMediaCount: number;
  gatedMediaCount: number;
  rejectedMediaCount: number;
  blockingFindingCount: number;
  warningFindingCount: number;
  nonRenderableReasons: string[];
  blockingFindings: ComplianceFinding[];
}

export function summarizeRenderManifestCompliance(
  manifest: RenderManifest,
): RenderManifestComplianceSummary {
  let renderable = 0;
  let gated = 0;
  let rejected = 0;
  for (const m of manifest.tracks.eventMedia) {
    if (m.rightsGate === "rejected") rejected += 1;
    else if (m.renderable) renderable += 1;
    else gated += 1;
  }
  return {
    manifestId: manifest.manifestId,
    renderableMediaCount: renderable,
    gatedMediaCount: gated,
    rejectedMediaCount: rejected,
    blockingFindingCount: manifest.compliance.blocking.length,
    warningFindingCount: manifest.compliance.warnings.length,
    nonRenderableReasons: manifest.safety.nonRenderableReasons,
    blockingFindings: manifest.compliance.blocking,
  };
}
