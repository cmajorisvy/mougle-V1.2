import { existsSync, mkdirSync, statSync } from "fs";
import { resolve } from "path";
import { replitObjectStorageAdapter } from "./replit-object-storage-adapter";

export type StorageStatus =
  | "local_dev_only"
  | "package_installed_bucket_missing"
  | "persistent_configured"
  | "upload_failed"
  | "setup_required"
  | "blocked";

export interface CandidateStatus {
  id: string;
  status: StorageStatus;
  reason: string;
  setupHint?: string;
}

export interface StorageReport {
  status: StorageStatus;
  driver: "internal_local_storage" | "replit_object_storage_adapter" | "cloudflare_r2_storage_adapter" | "aws_s3_storage_adapter";
  driverName: string;
  bucket: string | null;
  bucketIdConfigured: boolean;
  publicSafe: boolean;
  notes: string;
  rootDir: string;
  candidates: CandidateStatus[];
  setupGuidance: {
    primary: string;
    envVarName: "REPLIT_OBJECT_STORAGE_BUCKET_ID";
    docsHint: string;
  };
}

const LOCAL_ROOT = resolve(process.cwd(), ".local/media-assets");
const ASSET_KEY_PREFIX: Record<MediaAssetKind, string> = {
  render: "mougle-media/render/",
  voice: "mougle-media/voice/",
};
const ASSET_KEY_RE: Record<MediaAssetKind, RegExp> = {
  render: /^[a-z0-9_]{1,128}\.(mp4|srt)$/,
  voice: /^[a-z0-9_]{1,128}\.mp3$/,
};

// Tracks the most recent persistence attempt across the process lifetime so the
// dashboard can surface "upload_failed" without re-uploading on every poll.
let lastPersistFailure: { at: string; reason: string } | null = null;

export type MediaAssetKind = "render" | "voice";
export type AdminOnlyAccessMode = "admin_only_stream";

export interface AdminOnlyMediaAssetMetadata {
  storageKey: string;
  persistedStorageKey: string | null;
  mimeType: "video/mp4" | "application/x-subrip" | "audio/mpeg";
  size: number;
  fileSize: number;
  createdAt: string;
  accessMode: AdminOnlyAccessMode;
  previewAccessMode: AdminOnlyAccessMode;
  adminOnly: true;
  publicUrl: null;
  publicUrlAvailable: false;
  storageDriver: "replit_object_storage_adapter" | "internal_local_storage";
  persisted: boolean;
  localFallback: boolean;
}

function ensureLocalDirs() {
  for (const sub of ["voice", "render", "image", "video"]) {
    const d = resolve(LOCAL_ROOT, sub);
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

function isReplitObjectStorageInstalled(): boolean {
  try {
    return existsSync(resolve(process.cwd(), "node_modules/@replit/object-storage/package.json"));
  } catch {
    return false;
  }
}

function hasReplitBucketConfigured(): boolean {
  return !!(
    process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID?.trim() ||
    process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim() ||
    process.env.REPLIT_SIDECAR_ENDPOINT?.trim()
  );
}

function hasR2Configured(): boolean { return !!process.env.CLOUDFLARE_R2_TOKEN?.trim(); }
function hasS3Configured(): boolean { return !!process.env.AWS_S3_TOKEN?.trim(); }

function mimeTypeForAsset(kind: MediaAssetKind, filename: string): AdminOnlyMediaAssetMetadata["mimeType"] {
  if (kind === "voice") return "audio/mpeg";
  return filename.endsWith(".srt") ? "application/x-subrip" : "video/mp4";
}

export function stableStorageKeyForAsset(kind: MediaAssetKind, filename: string): string | null {
  if (typeof filename !== "string") return null;
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) return null;
  const clean = filename.trim();
  if (!ASSET_KEY_RE[kind].test(clean)) return null;
  return `${ASSET_KEY_PREFIX[kind]}${clean}`;
}

export function buildAdminOnlyAssetMetadata(input: {
  kind: MediaAssetKind;
  filename: string;
  localPath: string;
  persistedStorageKey?: string | null;
  storageDriver?: "replit_object_storage_adapter" | "internal_local_storage";
}): AdminOnlyMediaAssetMetadata {
  const stableKey = stableStorageKeyForAsset(input.kind, input.filename);
  if (!stableKey) throw new Error("invalid_media_asset_filename");
  const stat = statSync(input.localPath);
  const persistedStorageKey = input.persistedStorageKey || null;
  const storageDriver = input.storageDriver || (persistedStorageKey ? "replit_object_storage_adapter" : "internal_local_storage");
  return {
    storageKey: persistedStorageKey || stableKey,
    persistedStorageKey,
    mimeType: mimeTypeForAsset(input.kind, input.filename),
    size: stat.size,
    fileSize: stat.size,
    createdAt: stat.mtime.toISOString(),
    accessMode: "admin_only_stream",
    previewAccessMode: "admin_only_stream",
    adminOnly: true,
    publicUrl: null,
    publicUrlAvailable: false,
    storageDriver,
    persisted: !!persistedStorageKey,
    localFallback: !persistedStorageKey,
  };
}

export function recordPersistFailure(reason: string) {
  lastPersistFailure = { at: new Date().toISOString(), reason: String(reason).slice(0, 160) };
}
export function clearPersistFailure() { lastPersistFailure = null; }

export function getStorageReport(): StorageReport {
  ensureLocalDirs();

  const replitInstalled = isReplitObjectStorageInstalled();
  const replitBucket = hasReplitBucketConfigured();
  const r2 = hasR2Configured();
  const s3 = hasS3Configured();

  let replitStatus: StorageStatus;
  let replitReason: string;
  let replitHint: string | undefined;
  if (!replitInstalled) {
    replitStatus = "setup_required";
    replitReason = "@replit/object-storage package not installed.";
    replitHint = "Run: npm install @replit/object-storage";
  } else if (!replitBucket) {
    replitStatus = "package_installed_bucket_missing";
    replitReason = "Package installed; no bucket configured. Set REPLIT_OBJECT_STORAGE_BUCKET_ID to activate.";
    replitHint = "Open the Replit Object Storage pane, create a bucket, copy its ID, then set the secret REPLIT_OBJECT_STORAGE_BUCKET_ID. After saving, the next status poll flips to persistent_configured.";
  } else if (lastPersistFailure) {
    replitStatus = "upload_failed";
    replitReason = `Last upload failed at ${lastPersistFailure.at}: ${lastPersistFailure.reason}`;
    replitHint = "New renders will still produce a local MP4. Investigate the bucket permissions or sidecar endpoint, then trigger a new render to clear the failure flag.";
  } else {
    replitStatus = "persistent_configured";
    replitReason = "Package installed, bucket configured. New MP4/SRT renders are uploaded persistently.";
  }

  const candidates: CandidateStatus[] = [
    {
      id: "internal_local_storage",
      status: "local_dev_only",
      reason: "Local filesystem under .local/media-assets — survives in dev, ephemeral on Replit Deployments.",
    },
    { id: "replit_object_storage_adapter", status: replitStatus, reason: replitReason, setupHint: replitHint },
    {
      id: "cloudflare_r2_storage_adapter",
      status: "setup_required",
      reason: r2
        ? "CLOUDFLARE_R2_TOKEN secret name detected, but adapter implementation pending."
        : "CLOUDFLARE_R2_TOKEN not set; adapter implementation pending.",
    },
    {
      id: "aws_s3_storage_adapter",
      status: "setup_required",
      reason: s3 ? "AWS_S3_TOKEN detected, but adapter implementation pending." : "AWS_S3_TOKEN not set; adapter implementation pending.",
    },
  ];

  if (replitStatus === "persistent_configured") {
    return {
      status: "persistent_configured",
      driver: "replit_object_storage_adapter",
      driverName: "Replit Object Storage",
      // NEVER expose the actual bucket secret value to the client. Just confirm it's set.
      bucket: null,
      bucketIdConfigured: true,
      publicSafe: false,
      notes: "Persistent object storage active. Files served only through the admin-gated stream — no public bucket exposure.",
      rootDir: LOCAL_ROOT,
      candidates,
      setupGuidance: {
        primary: "Persistent storage configured. New renders upload to Replit Object Storage automatically.",
        envVarName: "REPLIT_OBJECT_STORAGE_BUCKET_ID",
        docsHint: "Bucket ID is read from DEFAULT_OBJECT_STORAGE_BUCKET_ID (Replit App Storage default) or REPLIT_OBJECT_STORAGE_BUCKET_ID (legacy alias). The literal value is never returned by the API — only the bucketIdConfigured boolean.",
      },
    };
  }

  if (replitStatus === "upload_failed") {
    return {
      status: "upload_failed",
      driver: "internal_local_storage",
      driverName: "Internal local filesystem (object-storage upload failed)",
      bucket: null,
      bucketIdConfigured: replitBucket,
      publicSafe: false,
      notes: "Object storage upload failed on the most recent render. Files were written to local disk only. Inspect logs and rerun.",
      rootDir: LOCAL_ROOT,
      candidates,
      setupGuidance: {
        primary: "Resolve the bucket / sidecar error, then rerender. Local files remain admin-streamable in the meantime.",
        envVarName: "REPLIT_OBJECT_STORAGE_BUCKET_ID",
        docsHint: lastPersistFailure?.reason || "See server logs for upload diagnostics.",
      },
    };
  }

  return {
    status: replitStatus === "package_installed_bucket_missing" ? "package_installed_bucket_missing" : "local_dev_only",
    driver: "internal_local_storage",
    driverName: "Internal local filesystem",
    bucket: null,
    bucketIdConfigured: replitBucket,
    publicSafe: false,
    notes:
      replitStatus === "package_installed_bucket_missing"
        ? "Package installed, but no bucket configured. New renders fall back to local disk until REPLIT_OBJECT_STORAGE_BUCKET_ID is set."
        : "Development-only storage. Files live under .local/media-assets and may be lost on container restart.",
    rootDir: LOCAL_ROOT,
    candidates,
    setupGuidance: {
      primary:
        replitStatus === "package_installed_bucket_missing"
          ? "Open the Replit Object Storage pane → create a bucket → copy its ID → save it as the secret REPLIT_OBJECT_STORAGE_BUCKET_ID. The status will flip to persistent_configured on the next poll."
          : "Install @replit/object-storage and configure REPLIT_OBJECT_STORAGE_BUCKET_ID to enable persistent storage.",
      envVarName: "REPLIT_OBJECT_STORAGE_BUCKET_ID",
      docsHint: "Accepted bucket-ID env var names: DEFAULT_OBJECT_STORAGE_BUCKET_ID (Replit App Storage default) or REPLIT_OBJECT_STORAGE_BUCKET_ID (legacy alias). Only the bucketIdConfigured boolean is ever returned — the secret value itself is never read by this API.",
    },
  };
}

export interface UploadAttemptResult {
  attempted: boolean;
  ok: boolean;
  driver: "replit_object_storage_adapter" | "internal_local_storage";
  storageKey: string | null;
  reason: string | null;
}

/**
 * If the Replit object storage adapter is ready, upload the file under the
 * sanitized key. Otherwise no-op. Never throws — caller falls back to local
 * disk on failure.
 */
export async function uploadIfConfigured(localPath: string, baseFilename: string): Promise<UploadAttemptResult> {
  const ready = await replitObjectStorageAdapter.isAdapterReady();
  if (!ready.ready) {
    return { attempted: false, ok: false, driver: "internal_local_storage", storageKey: null, reason: ready.reason };
  }
  const key = replitObjectStorageAdapter.sanitizeStorageKey(baseFilename);
  if (!key) {
    return { attempted: false, ok: false, driver: "internal_local_storage", storageKey: null, reason: "invalid_key" };
  }
  const r = await replitObjectStorageAdapter.uploadFile(localPath, key);
  if (r.ok) {
    clearPersistFailure();
    return { attempted: true, ok: true, driver: "replit_object_storage_adapter", storageKey: key, reason: null };
  }
  recordPersistFailure(r.error);
  return { attempted: true, ok: false, driver: "internal_local_storage", storageKey: null, reason: r.error };
}

export const persistentStorageService = {
  getStorageReport,
  uploadIfConfigured,
  stableStorageKeyForAsset,
  buildAdminOnlyAssetMetadata,
  recordPersistFailure,
  clearPersistFailure,
  LOCAL_ROOT,
};
