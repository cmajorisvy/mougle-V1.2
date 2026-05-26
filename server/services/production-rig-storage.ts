import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const STORAGE_KEY_RE = /^production-rigs\/[a-f0-9-]+\.(glb|gltf)$/;
const MAX_TTL_SECONDS = 900;

export interface HeadRigResult {
  exists: boolean;
  byteSize?: number;
}

export interface DeleteRigResult {
  deleted: boolean;
}

export interface IssueSignedRigPreviewUrlOptions {
  adminUserId: string;
  ttlSeconds: number;
}

export interface IssueSignedRigPreviewUrlResult {
  url: string;
  expiresAt: Date;
}

export interface ProductionRigStorageBackend {
  putBytes(bucketName: string, objectName: string, buffer: Buffer): Promise<void>;
  headObject(bucketName: string, objectName: string): Promise<HeadRigResult>;
  signGetUrl(bucketName: string, objectName: string, ttlSeconds: number): Promise<string>;
  deleteObject(bucketName: string, objectName: string): Promise<DeleteRigResult>;
}

const defaultBackend: ProductionRigStorageBackend = {
  async putBytes(bucketName, objectName, buffer) {
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    await file.save(buffer, {
      resumable: false,
      contentType: "application/octet-stream",
    });
  },
  async headObject(bucketName, objectName) {
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) return { exists: false };
    const [metadata] = await file.getMetadata();
    const sizeRaw = metadata.size;
    const byteSize =
      typeof sizeRaw === "string"
        ? Number.parseInt(sizeRaw, 10)
        : typeof sizeRaw === "number"
          ? sizeRaw
          : undefined;
    return {
      exists: true,
      byteSize: Number.isFinite(byteSize) ? byteSize : undefined,
    };
  },
  async deleteObject(bucketName, objectName) {
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) return { deleted: false };
    await file.delete();
    return { deleted: true };
  },
  async signGetUrl(bucketName, objectName, ttlSeconds) {
    const request = {
      bucket_name: bucketName,
      object_name: objectName,
      method: "GET" as const,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
    const response = await fetch(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to sign rig object URL, errorcode: ${response.status}`);
    }
    const { signed_url: signedUrl } = (await response.json()) as { signed_url: string };
    return signedUrl;
  },
};

let activeBackend: ProductionRigStorageBackend = defaultBackend;

export function __setRigBackendForTests(backend: ProductionRigStorageBackend | null): void {
  activeBackend = backend ?? defaultBackend;
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir || !dir.trim()) {
    throw new Error("PRIVATE_OBJECT_DIR not set. Cannot store production rigs.");
  }
  return dir.replace(/\/+$/, "");
}

function getPublicSearchPaths(): string[] {
  const raw = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((p) => p.trim().replace(/\/+$/, ""))
        .filter((p) => p.length > 0),
    ),
  );
}

function parseObjectPath(fullPath: string): { bucketName: string; objectName: string } {
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = normalized.split("/").filter((p) => p.length > 0);
  if (parts.length < 2) {
    throw new Error("Invalid object path: must include bucket and object");
  }
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

function resolveFullPath(storageKey: string): string {
  if (!STORAGE_KEY_RE.test(storageKey)) {
    throw new Error(
      `production-rig-storage: invalid storageKey (must match production-rigs/<uuid>.<glb|gltf>): ${storageKey}`,
    );
  }
  const privateDir = getPrivateObjectDir();
  const fullPath = `${privateDir}/${storageKey}`;
  const normalizedFull = fullPath.replace(/\/+/g, "/");
  for (const publicPath of getPublicSearchPaths()) {
    const normalizedPublic = publicPath.replace(/\/+/g, "/");
    if (
      normalizedFull === normalizedPublic ||
      normalizedFull.startsWith(`${normalizedPublic}/`)
    ) {
      throw new Error(
        "production-rig-storage: refusing to write under PUBLIC_OBJECT_SEARCH_PATHS",
      );
    }
  }
  return fullPath;
}

export async function putRigBytes(storageKey: string, buffer: Buffer): Promise<void> {
  const fullPath = resolveFullPath(storageKey);
  const { bucketName, objectName } = parseObjectPath(fullPath);
  await activeBackend.putBytes(bucketName, objectName, buffer);
}

export async function headRig(storageKey: string): Promise<HeadRigResult> {
  const fullPath = resolveFullPath(storageKey);
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return activeBackend.headObject(bucketName, objectName);
}

export async function deleteRigBytes(
  storageKey: string,
): Promise<DeleteRigResult> {
  const fullPath = resolveFullPath(storageKey);
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return activeBackend.deleteObject(bucketName, objectName);
}

export async function issueSignedRigPreviewUrl(
  storageKey: string,
  opts: IssueSignedRigPreviewUrlOptions,
): Promise<IssueSignedRigPreviewUrlResult> {
  if (!opts || typeof opts.adminUserId !== "string" || !opts.adminUserId.trim()) {
    throw new Error("production-rig-storage: adminUserId is required");
  }
  if (
    typeof opts.ttlSeconds !== "number" ||
    !Number.isFinite(opts.ttlSeconds) ||
    opts.ttlSeconds <= 0
  ) {
    throw new Error("production-rig-storage: ttlSeconds must be a positive number");
  }
  const fullPath = resolveFullPath(storageKey);
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const clampedTtl = Math.min(MAX_TTL_SECONDS, Math.floor(opts.ttlSeconds));
  const expiresAt = new Date(Date.now() + clampedTtl * 1000);
  const url = await activeBackend.signGetUrl(bucketName, objectName, clampedTtl);
  return { url, expiresAt };
}

export const __rigTest__ = {
  STORAGE_KEY_RE,
  MAX_TTL_SECONDS,
};
