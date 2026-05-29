import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, type ReadStream, type Stats } from "fs";
import { isAbsolute, relative, resolve } from "path";
import {
  buildAdminOnlyAssetMetadata,
  uploadIfConfigured,
  type AdminOnlyMediaAssetMetadata,
} from "./persistent-storage-service";
import { wrapLines } from "./render-text-fitting";

export type SrtSegmentInput = {
  segmentIndex: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type SrtBuildOptions = {
  maxCharsPerLine: number;
  maxLines: number;
};

const LOCAL_RENDER_DIR = resolve(process.cwd(), ".local/media-assets/render");
const FILENAME_SAFE_RE = /[^a-z0-9_]/g;

function ensureRenderDir() {
  if (!existsSync(LOCAL_RENDER_DIR)) mkdirSync(LOCAL_RENDER_DIR, { recursive: true });
}

function formatTimecode(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, width = 2) => n.toString().padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

export function buildSrtFromSegments(
  segments: SrtSegmentInput[],
  options: SrtBuildOptions,
): { srt: string; cueCount: number } {
  const cues: string[] = [];
  let cueNumber = 0;
  for (const segment of segments) {
    const lines = wrapLines(segment.text || "", options.maxCharsPerLine, options.maxLines);
    if (!lines.length) continue;
    const start = segment.startMs;
    const end = Math.max(segment.endMs, segment.startMs + 1000);
    cueNumber += 1;
    cues.push(
      `${cueNumber}\n${formatTimecode(start)} --> ${formatTimecode(end)}\n${lines.join("\n")}`,
    );
  }
  const srt = cues.length ? `${cues.join("\n\n")}\n` : "";
  return { srt, cueCount: cueNumber };
}

export function srtPreviewFromText(srt: string, lineLimit = 12): { firstLines: string[]; lineCount: number } {
  const allLines = srt.split(/\r?\n/);
  const firstLines = allLines.slice(0, Math.max(1, lineLimit));
  return { firstLines, lineCount: allLines.length };
}

function safeRenderJobFilename(jobId: number): string {
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toLowerCase();
  const cleanSeed = seed.replace(FILENAME_SAFE_RE, "").slice(0, 20) || "x";
  const cleanId = String(jobId).replace(FILENAME_SAFE_RE, "").slice(0, 20) || "0";
  return `rj_${cleanId}_${cleanSeed}.srt`;
}

export async function writeSrtForRenderJob(
  jobId: number,
  srt: string,
): Promise<AdminOnlyMediaAssetMetadata | null> {
  if (!srt) return null;
  ensureRenderDir();
  const filename = safeRenderJobFilename(jobId);
  const localPath = resolve(LOCAL_RENDER_DIR, filename);
  writeFileSync(localPath, srt, "utf8");

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

  return buildAdminOnlyAssetMetadata({
    kind: "render",
    filename,
    localPath,
    persistedStorageKey,
    storageDriver,
  });
}

const RENDER_FILENAME_RE = /^[a-z0-9_]{1,128}\.(mp4|srt)$/;

export function isValidRenderFilename(filename: string): boolean {
  if (typeof filename !== "string") return false;
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) return false;
  return RENDER_FILENAME_RE.test(filename);
}

export function localPathForRenderFilename(filename: string): string | null {
  if (!isValidRenderFilename(filename)) return null;
  const resolved = resolve(LOCAL_RENDER_DIR, filename);
  const relativePath = relative(LOCAL_RENDER_DIR, resolved);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    return null;
  }
  return resolved;
}

export type CaptionsSrtHandlerDeps = {
  getJob: (id: number) => Promise<any>;
  onError?: (res: any, err: unknown) => void;
  existsSyncFn?: (p: string) => boolean;
  readFileSyncFn?: (p: string, enc: BufferEncoding) => string;
};

export function createCaptionsSrtHandler(deps: CaptionsSrtHandlerDeps) {
  const existsFn = deps.existsSyncFn ?? existsSync;
  const readFn = deps.readFileSyncFn ?? readFileSync;
  return async (req: any, res: any) => {
    try {
      const id = parseInt(req.params?.id as string, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Invalid video render job id" });
      }
      const job = await deps.getJob(id);
      const baseline = (job?.previewMetadata as any)?.renderBaseline;
      const artifact = baseline?.captionsArtifact;
      const storageKey: string | undefined = artifact?.storageKey || artifact?.persistedStorageKey;
      if (!artifact || !storageKey) {
        return res.status(404).json({ message: "Captions artifact not generated yet. Run preview first." });
      }
      const rawFilename = storageKey.split("/").pop() || "";
      if (!isValidRenderFilename(rawFilename) || !rawFilename.endsWith(".srt")) {
        return res.status(400).json({ message: "Invalid captions filename." });
      }
      const localPath = localPathForRenderFilename(rawFilename);
      if (!localPath || !existsFn(localPath)) {
        return res.status(404).json({ message: "Captions file missing on disk." });
      }
      res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Admin-Only-Stream", "1");
      res.setHeader("Content-Disposition", `attachment; filename="${rawFilename}"`);
      res.send(readFn(localPath, "utf8"));
    } catch (err) {
      if (deps.onError) return deps.onError(res, err);
      res.status(500).json({ message: (err as Error)?.message || "Internal error" });
    }
  };
}

export type PreviewMp4HandlerDeps = {
  getJob: (id: number) => Promise<any>;
  onError?: (res: any, err: unknown) => void;
  existsSyncFn?: (p: string) => boolean;
  statSyncFn?: (p: string) => Pick<Stats, "size">;
  createReadStreamFn?: (p: string, opts?: { start?: number; end?: number }) => ReadStream | NodeJS.ReadableStream;
};

export function createPreviewMp4Handler(deps: PreviewMp4HandlerDeps) {
  const existsFn = deps.existsSyncFn ?? existsSync;
  const statFn = deps.statSyncFn ?? statSync;
  const streamFn = deps.createReadStreamFn ?? (createReadStream as any);
  return async (req: any, res: any) => {
    try {
      const id = parseInt(req.params?.id as string, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Invalid video render job id" });
      }
      const job = await deps.getJob(id);
      const baseline = (job?.previewMetadata as any)?.renderBaseline;
      const artifact = baseline?.mp4Artifact;
      const storageKey: string | undefined = artifact?.storageKey || artifact?.persistedStorageKey;
      if (!artifact || !storageKey) {
        return res.status(404).json({ message: "MP4 preview not generated yet. Run preview first." });
      }
      const rawFilename = storageKey.split("/").pop() || "";
      if (!isValidRenderFilename(rawFilename) || !rawFilename.endsWith(".mp4")) {
        return res.status(400).json({ message: "Invalid preview filename." });
      }
      const localPath = localPathForRenderFilename(rawFilename);
      if (!localPath || !existsFn(localPath)) {
        return res.status(404).json({ message: "Preview MP4 missing on disk." });
      }
      const fileSize = statFn(localPath).size;
      const wantsDownload = req.query?.download === "1";
      const disposition = wantsDownload ? "attachment" : "inline";
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Admin-Only-Stream", "1");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Disposition", `${disposition}; filename="${rawFilename}"`);

      const rangeHeader = req.headers?.range;
      if (rangeHeader && /^bytes=/.test(rangeHeader)) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        if (!match) {
          res.setHeader("Content-Range", `bytes */${fileSize}`);
          return res.status(416).end();
        }
        const startStr = match[1];
        const endStr = match[2];
        let start = startStr ? parseInt(startStr, 10) : NaN;
        let end = endStr ? parseInt(endStr, 10) : NaN;
        if (!startStr && endStr) {
          const suffixLen = parseInt(endStr, 10);
          if (!Number.isFinite(suffixLen) || suffixLen <= 0) {
            res.setHeader("Content-Range", `bytes */${fileSize}`);
            return res.status(416).end();
          }
          start = Math.max(0, fileSize - suffixLen);
          end = fileSize - 1;
        } else {
          if (!Number.isFinite(start)) start = 0;
          if (!Number.isFinite(end) || end >= fileSize) end = fileSize - 1;
        }
        if (start > end || start < 0 || start >= fileSize) {
          res.setHeader("Content-Range", `bytes */${fileSize}`);
          return res.status(416).end();
        }
        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", String(chunkSize));
        (streamFn(localPath, { start, end }) as NodeJS.ReadableStream).pipe(res);
        return;
      }

      res.setHeader("Content-Length", String(fileSize));
      (streamFn(localPath) as NodeJS.ReadableStream).pipe(res);
    } catch (err) {
      if (deps.onError) return deps.onError(res, err);
      res.status(500).json({ message: (err as Error)?.message || "Internal error" });
    }
  };
}

export const renderSrtService = {
  buildSrtFromSegments,
  srtPreviewFromText,
  writeSrtForRenderJob,
  localPathForRenderFilename,
  isValidRenderFilename,
  createCaptionsSrtHandler,
  createPreviewMp4Handler,
};
