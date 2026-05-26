import { spawn } from "child_process";
import { existsSync, mkdirSync, statSync } from "fs";
import { resolve } from "path";
import {
  buildAdminOnlyAssetMetadata,
  uploadIfConfigured,
  type AdminOnlyMediaAssetMetadata,
} from "./persistent-storage-service";

const LOCAL_RENDER_DIR = resolve(process.cwd(), ".local/media-assets/render");
const FILENAME_SAFE_RE = /[^a-z0-9_]/g;

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 360;
const PREVIEW_FPS = 10;
const MAX_TOTAL_DURATION_SEC = 60;
const DEFAULT_FALLBACK_DURATION_SEC = 6;
const FFMPEG_TIMEOUT_MS = 45_000;

// --- H-LIFE-1: in-process FFmpeg concurrency cap ----------------------------
// Single concurrent ffmpeg invocation per Node process; bounded queue so a
// burst of preview clicks cannot OOM the deployment. The cap is intentionally
// applied at the spawn site, not the route, so background callers also queue.
const MAX_CONCURRENT_FFMPEG = 1;
const MAX_QUEUE_DEPTH = 5;
let activeFfmpegCount = 0;
const ffmpegWaitQueue: Array<() => void> = [];

export class RenderQueueOverflowError extends Error {
  readonly code = "render_queue_overflow";
  constructor() {
    super("render_queue_full");
  }
}

async function acquireFfmpegSlot(): Promise<void> {
  if (activeFfmpegCount < MAX_CONCURRENT_FFMPEG) {
    activeFfmpegCount += 1;
    return;
  }
  if (ffmpegWaitQueue.length >= MAX_QUEUE_DEPTH) {
    throw new RenderQueueOverflowError();
  }
  await new Promise<void>((resolveSlot) => {
    ffmpegWaitQueue.push(() => {
      activeFfmpegCount += 1;
      resolveSlot();
    });
  });
}

function releaseFfmpegSlot(): void {
  activeFfmpegCount = Math.max(0, activeFfmpegCount - 1);
  const next = ffmpegWaitQueue.shift();
  if (next) next();
}

export function getRenderQueueStats(): {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueueDepth: number;
} {
  return {
    active: activeFfmpegCount,
    queued: ffmpegWaitQueue.length,
    maxConcurrent: MAX_CONCURRENT_FFMPEG,
    maxQueueDepth: MAX_QUEUE_DEPTH,
  };
}

// --- H-FF-2: srt path must be inside LOCAL_RENDER_DIR -----------------------
function assertIsLocalRenderPath(p: string): void {
  const resolved = resolve(p);
  if (resolved !== LOCAL_RENDER_DIR && !resolved.startsWith(`${LOCAL_RENDER_DIR}/`)) {
    throw new Error("srt_path_outside_render_dir");
  }
}

export type Mp4PreviewSegmentInput = {
  segmentIndex: number;
  startMs: number;
  endMs: number;
  scriptType: string;
  speakerLabel: string;
  textPreview: string;
};

export type Mp4PreviewOptions = {
  title: string;
  watermarkLabel: string;
  segments: Mp4PreviewSegmentInput[];
  srtPath?: string | null;
};

function ensureRenderDir() {
  if (!existsSync(LOCAL_RENDER_DIR)) mkdirSync(LOCAL_RENDER_DIR, { recursive: true });
}

function safeMp4Filename(jobId: number): string {
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toLowerCase();
  const cleanSeed = seed.replace(FILENAME_SAFE_RE, "").slice(0, 20) || "x";
  const cleanId = String(jobId).replace(FILENAME_SAFE_RE, "").slice(0, 20) || "0";
  return `rj_${cleanId}_${cleanSeed}.mp4`;
}

function escapeFfmpegText(text: string): string {
  return (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, " ");
}

function sanitizeForOverlay(text: string, maxLength: number): string {
  const cleaned = (text || "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLength - 1))}…`;
}

function normalizeSegments(segments: Mp4PreviewSegmentInput[]): Mp4PreviewSegmentInput[] {
  if (!segments.length) return [];
  const maxMs = MAX_TOTAL_DURATION_SEC * 1000;
  const cutoff = segments.findIndex((s) => s.startMs >= maxMs);
  const usable = cutoff === -1 ? segments.slice() : segments.slice(0, cutoff);
  return usable.map((s) => ({
    ...s,
    startMs: Math.max(0, Math.floor(s.startMs)),
    endMs: Math.max(Math.floor(s.startMs) + 500, Math.min(maxMs, Math.floor(s.endMs))),
  }));
}

function buildFilterChain(opts: {
  title: string;
  watermark: string;
  segments: Mp4PreviewSegmentInput[];
  totalDurationSec: number;
}): string {
  const title = escapeFfmpegText(sanitizeForOverlay(opts.title, 80));
  const watermark = escapeFfmpegText(sanitizeForOverlay(opts.watermark, 40));
  const filters: string[] = [];

  filters.push(
    `drawtext=text='${title}':fontsize=22:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=24`,
  );
  filters.push(
    `drawtext=text='${watermark}':fontsize=14:fontcolor=0xfacc15:borderw=1:bordercolor=black:x=w-text_w-16:y=h-text_h-16`,
  );
  filters.push(
    `drawtext=text='dry-run preview · no live providers':fontsize=12:fontcolor=0x9ca3af:x=16:y=h-text_h-16`,
  );

  for (const seg of opts.segments) {
    const start = (seg.startMs / 1000).toFixed(2);
    const end = (seg.endMs / 1000).toFixed(2);
    const speaker = escapeFfmpegText(sanitizeForOverlay(seg.speakerLabel, 48));
    const scriptType = escapeFfmpegText(sanitizeForOverlay(seg.scriptType, 32));
    const body = escapeFfmpegText(sanitizeForOverlay(seg.textPreview, 90));
    const header = `Segment ${seg.segmentIndex + 1} · ${scriptType}`;
    filters.push(
      `drawtext=text='${escapeFfmpegText(header)}':fontsize=18:fontcolor=0x67e8f9:x=(w-text_w)/2:y=h*0.35:enable='between(t,${start},${end})'`,
    );
    filters.push(
      `drawtext=text='${speaker}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h*0.45:enable='between(t,${start},${end})'`,
    );
    if (body) {
      filters.push(
        `drawtext=text='${body}':fontsize=14:fontcolor=0xd4d4d8:borderw=1:bordercolor=black:x=(w-text_w)/2:y=h*0.58:enable='between(t,${start},${end})'`,
      );
    }
  }

  return filters.join(",");
}

function escapeSubtitlesFilterPath(path: string): string {
  return path
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function buildSubtitlesFilter(srtPath: string): string {
  const escapedPath = escapeSubtitlesFilterPath(srtPath);
  const style = [
    "FontName=Sans",
    "FontSize=14",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BackColour=&H80000000",
    "BorderStyle=1",
    "Outline=2",
    "Shadow=0",
    "Alignment=2",
    "MarginV=40",
    "MarginL=64",
    "MarginR=64",
  ].join(",");
  return `subtitles=filename='${escapedPath}':force_style='${style}'`;
}

export class FfmpegInvocationError extends Error {
  readonly exitCode: number | null;
  readonly stderrTail: string;
  readonly reason: string;
  constructor(reason: string, exitCode: number | null, stderrTail: string) {
    super(`${reason}${exitCode !== null ? `_${exitCode}` : ""}`);
    this.reason = reason;
    this.exitCode = exitCode;
    this.stderrTail = stderrTail;
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill("SIGKILL"); } catch { /* noop */ }
      reject(new FfmpegInvocationError(`ffmpeg_timeout_after_${FFMPEG_TIMEOUT_MS}ms`, null, stderr.slice(-400)));
    }, FFMPEG_TIMEOUT_MS);
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new FfmpegInvocationError(`ffmpeg_spawn_error:${(err as Error).message}`, null, stderr.slice(-400)));
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new FfmpegInvocationError("ffmpeg_nonzero_exit", code, stderr.slice(-400)));
    });
  });
}

async function runFfmpegWithConcurrencyCap(args: string[]): Promise<void> {
  await acquireFfmpegSlot();
  try {
    await runFfmpeg(args);
  } finally {
    releaseFfmpegSlot();
  }
}

export interface Mp4PreviewResult {
  artifact: AdminOnlyMediaAssetMetadata | null;
  segmentCount: number;
  durationMs: number;
  /** Populated when the render failed; null on success. */
  failureReason: string | null;
  /** FFmpeg exit code if the process ran; null if it never spawned or timed out. */
  ffmpegExitCode: number | null;
  /** Last 400 bytes of FFmpeg stderr for diagnostics; empty string on success. */
  ffmpegStderrTail: string;
}

export async function writeMp4ForRenderJob(
  jobId: number,
  options: Mp4PreviewOptions,
): Promise<Mp4PreviewResult> {
  const normalized = normalizeSegments(options.segments);
  const totalDurationMs = normalized.length
    ? normalized[normalized.length - 1].endMs
    : DEFAULT_FALLBACK_DURATION_SEC * 1000;
  const totalDurationSec = Math.max(1, Math.ceil(totalDurationMs / 1000));

  ensureRenderDir();
  const filename = safeMp4Filename(jobId);
  const localPath = resolve(LOCAL_RENDER_DIR, filename);

  const segmentsForFilter = normalized.length
    ? normalized
    : [{
        segmentIndex: 0,
        startMs: 0,
        endMs: DEFAULT_FALLBACK_DURATION_SEC * 1000,
        scriptType: "no_segments",
        speakerLabel: "No script segments available",
        textPreview: "Run preview after a script is linked to populate slate cards.",
      }];

  const baseFilterChain = buildFilterChain({
    title: options.title || `Render Job #${jobId}`,
    watermark: options.watermarkLabel || "INTERNAL PREVIEW",
    segments: segmentsForFilter,
    totalDurationSec,
  });

  let srtPath: string | null = null;
  if (options.srtPath) {
    try {
      assertIsLocalRenderPath(options.srtPath);
      if (existsSync(options.srtPath)) srtPath = options.srtPath;
    } catch (err) {
      console.warn(`[render-mp4] rejecting srt path outside render dir: ${(err as Error).message}`);
      srtPath = null;
    }
  }
  const filterChainWithSubs = srtPath
    ? `${baseFilterChain},${buildSubtitlesFilter(srtPath)}`
    : baseFilterChain;

  const buildArgs = (filterChain: string) => [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-f", "lavfi",
    "-i", `color=c=0x0b0f1a:s=${PREVIEW_WIDTH}x${PREVIEW_HEIGHT}:d=${totalDurationSec}:r=${PREVIEW_FPS}`,
    "-vf", filterChain,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-t", String(totalDurationSec),
    localPath,
  ];

  let lastFailure: FfmpegInvocationError | null = null;
  try {
    await runFfmpegWithConcurrencyCap(buildArgs(filterChainWithSubs));
  } catch (err) {
    if (err instanceof RenderQueueOverflowError) {
      // C-FF-1: do not silently swallow — surface a structured failure.
      return {
        artifact: null,
        segmentCount: segmentsForFilter.length,
        durationMs: totalDurationMs,
        failureReason: "render_queue_overflow",
        ffmpegExitCode: null,
        ffmpegStderrTail: "",
      };
    }
    lastFailure = err instanceof FfmpegInvocationError ? err : new FfmpegInvocationError(`unknown:${(err as Error).message}`, null, "");
    if (srtPath) {
      try {
        await runFfmpegWithConcurrencyCap(buildArgs(baseFilterChain));
        lastFailure = null;
      } catch (err2) {
        lastFailure = err2 instanceof FfmpegInvocationError
          ? err2
          : new FfmpegInvocationError(`unknown:${(err2 as Error).message}`, null, "");
      }
    }
    if (lastFailure) {
      console.error(
        `[render-mp4] job ${jobId} failed: reason=${lastFailure.reason} exit=${lastFailure.exitCode ?? "none"} stderrTail=${JSON.stringify(lastFailure.stderrTail.slice(-200))}`,
      );
      return {
        artifact: null,
        segmentCount: segmentsForFilter.length,
        durationMs: totalDurationMs,
        failureReason: lastFailure.reason,
        ffmpegExitCode: lastFailure.exitCode,
        ffmpegStderrTail: lastFailure.stderrTail,
      };
    }
  }

  if (!existsSync(localPath) || statSync(localPath).size === 0) {
    console.error(`[render-mp4] job ${jobId} produced empty/missing output at ${localPath}`);
    return {
      artifact: null,
      segmentCount: segmentsForFilter.length,
      durationMs: totalDurationMs,
      failureReason: "output_missing_or_empty",
      ffmpegExitCode: 0,
      ffmpegStderrTail: "",
    };
  }

  let persistedStorageKey: string | null = null;
  let storageDriver: "replit_object_storage_adapter" | "internal_local_storage" = "internal_local_storage";
  try {
    const uploadResult = await uploadIfConfigured(localPath, filename);
    if (uploadResult.ok && uploadResult.storageKey) {
      persistedStorageKey = uploadResult.storageKey;
      storageDriver = "replit_object_storage_adapter";
    }
  } catch {
    persistedStorageKey = null;
    storageDriver = "internal_local_storage";
  }

  const artifact = buildAdminOnlyAssetMetadata({
    kind: "render",
    filename,
    localPath,
    persistedStorageKey,
    storageDriver,
  });

  return {
    artifact,
    segmentCount: segmentsForFilter.length,
    durationMs: totalDurationMs,
    failureReason: null,
    ffmpegExitCode: 0,
    ffmpegStderrTail: "",
  };
}

export const renderMp4Service = {
  writeMp4ForRenderJob,
  getRenderQueueStats,
};
