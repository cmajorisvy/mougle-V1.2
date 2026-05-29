import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Replit Object Storage adapter — minimal, safe wrapper.
 *
 * Hard guarantees:
 *   - Never throws across the public surface; every error is surfaced as a
 *     structured `{ ok: false, error }` so the persistent storage service can
 *     fall back to local disk without crashing the render pipeline.
 *   - Never reads or echoes secret values; only checks for their *presence*.
 *   - Never produces public URLs. Uploads are stored in a private bucket and
 *     served exclusively via admin-gated streaming routes.
 *   - The `@replit/object-storage` package is loaded lazily via dynamic
 *     import so the server boots cleanly when the package is not installed
 *     (local dev) or the bucket secret is not set.
 */

export interface AdapterReadyResult {
  ready: boolean;
  reason: string;
}

export interface UploadResult {
  ok: boolean;
  error: string;
}

const SAFE_KEY_RE = /^[a-z0-9_.-]{1,200}$/i;

function isPackageInstalled(): boolean {
  try {
    return existsSync(
      resolve(process.cwd(), "node_modules/@replit/object-storage/package.json"),
    );
  } catch {
    return false;
  }
}

function hasBucketConfigured(): boolean {
  return !!(
    process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID?.trim() ||
    process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim() ||
    process.env.REPLIT_SIDECAR_ENDPOINT?.trim()
  );
}

let cachedClient: any = null;
let cachedClientError: string | null = null;

async function getClient(): Promise<{ ok: true; client: any } | { ok: false; error: string }> {
  if (cachedClient) return { ok: true, client: cachedClient };
  if (cachedClientError) return { ok: false, error: cachedClientError };
  try {
    // Dynamic import — package is optional. If absent, this throws and we
    // fall back gracefully.
    const mod: any = await import("@replit/object-storage" as any).catch(
      (e: unknown) => {
        throw new Error(
          `package_not_installed: ${e instanceof Error ? e.message : String(e)}`,
        );
      },
    );
    const ClientCtor = mod?.Client ?? mod?.default?.Client ?? mod?.default;
    if (typeof ClientCtor !== "function") {
      cachedClientError = "client_constructor_not_found";
      return { ok: false, error: cachedClientError };
    }
    cachedClient = new ClientCtor();
    return { ok: true, client: cachedClient };
  } catch (e) {
    cachedClientError = e instanceof Error ? e.message : String(e);
    return { ok: false, error: cachedClientError };
  }
}

export const replitObjectStorageAdapter = {
  /**
   * Returns whether the adapter can attempt an upload. Never throws.
   * `reason` is a short, sanitized string suitable for logging — it never
   * contains secret values.
   */
  async isAdapterReady(): Promise<AdapterReadyResult> {
    if (!isPackageInstalled()) {
      return { ready: false, reason: "package_not_installed" };
    }
    if (!hasBucketConfigured()) {
      return { ready: false, reason: "bucket_not_configured" };
    }
    const client = await getClient();
    if (!client.ok) {
      return { ready: false, reason: client.error };
    }
    return { ready: true, reason: "ready" };
  },

  /**
   * Constrain the storage key to a safe character set. Returns null when the
   * input is empty, too long, or contains disallowed characters. The caller
   * is expected to treat null as a hard-fail rather than retrying.
   */
  sanitizeStorageKey(baseFilename: string): string | null {
    if (typeof baseFilename !== "string") return null;
    const trimmed = baseFilename.trim();
    if (!trimmed) return null;
    // Strip any leading path components defensively.
    const tail = trimmed.split(/[\\/]/).pop() ?? "";
    if (!SAFE_KEY_RE.test(tail)) return null;
    return tail;
  },

  /**
   * Upload a local file to the configured Replit Object Storage bucket
   * under `key`. Returns `{ ok: true, error: "" }` on success, otherwise
   * `{ ok: false, error: "<short_reason>" }`. Never throws.
   *
   * The bucket / sidecar configuration is read from env by the underlying
   * client; this adapter never reads or returns those values.
   */
  async uploadFile(localPath: string, key: string): Promise<UploadResult> {
    const ready = await this.isAdapterReady();
    if (!ready.ready) return { ok: false, error: ready.reason };
    if (!existsSync(localPath)) return { ok: false, error: "local_file_missing" };
    const sanitized = this.sanitizeStorageKey(key);
    if (!sanitized) return { ok: false, error: "invalid_key" };

    const client = await getClient();
    if (!client.ok) return { ok: false, error: client.error };

    try {
      const c: any = client.client;
      // Prefer streaming-from-file API when available; otherwise fall back
      // to in-memory upload via Buffer. Both are admin-only — no public URL
      // is ever produced.
      if (typeof c.uploadFromFilename === "function") {
        const r = await c.uploadFromFilename(sanitized, localPath);
        if (r && r.ok === false) {
          return { ok: false, error: shortError(r.error ?? "upload_failed") };
        }
        return { ok: true, error: "" };
      }
      if (typeof c.uploadFromBytes === "function") {
        const buf = readFileSync(localPath);
        const r = await c.uploadFromBytes(sanitized, buf);
        if (r && r.ok === false) {
          return { ok: false, error: shortError(r.error ?? "upload_failed") };
        }
        return { ok: true, error: "" };
      }
      return { ok: false, error: "client_upload_method_not_found" };
    } catch (e) {
      return { ok: false, error: shortError(e) };
    }
  },
};

function shortError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, " ").trim().slice(0, 160);
}
