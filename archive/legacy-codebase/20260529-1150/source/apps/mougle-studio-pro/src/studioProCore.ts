export type StudioModule =
  | "dashboard"
  | "preview"
  | "cinema4d"
  | "newsroom"
  | "podcast"
  | "avatar"
  | "media"
  | "unreal"
  | "fourD"
  | "settings";

export interface StudioSettings {
  apiBaseUrl: string;
  downloadFolder: string;
  cinema4DScriptFolder: string;
  exportFolder: string;
  safetyMode: "locked";
  sessionMode: "cookie" | "token";
  tokenStoredInKeychain: boolean;
}

export interface StudioStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioFetchResponse {
  ok: boolean;
  status: number;
  headers?: Headers;
  text(): Promise<string>;
  blob?(): Promise<Blob>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

export type StudioFetch = (
  input: string,
  init?: RequestInit,
) => Promise<StudioFetchResponse>;

export const STUDIO_SETTINGS_KEY = "mougle-studio-pro-settings";

export const DEFAULT_SETTINGS: StudioSettings = {
  apiBaseUrl: "http://127.0.0.1:5001",
  downloadFolder: "~/Downloads/Mougle Studio Pro",
  cinema4DScriptFolder: "~/Documents/Mougle/Cinema4D Scripts",
  exportFolder: "~/Documents/Mougle/Exports",
  safetyMode: "locked",
  sessionMode: "cookie",
  tokenStoredInKeychain: false,
};

export const SAFETY_LOCKS = {
  status: "draft",
  approvalStatus: "draft",
  visibility: "admin_only_internal",
  publicUrl: null,
  signedUrl: null,
  realSendAllowed: false,
  executionEnabled: false,
  adminPreviewOnly: true,
  notRendered: true,
  notPublished: true,
  noUnrealExecution: true,
  noFourDHardware: true,
} as const;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const BLOCKED_ENDPOINT_PATTERNS = [
  /\/api\/admin\/production-house\/unreal\/(send-command|load-level|start-sequence|render)\b/i,
  /\/api\/admin\/production-house\/4d\/send-(cue|timeline)\b/i,
  /\/api\/admin\/production-house\/publish/i,
  /\/api\/admin\/production-house\/youtube/i,
  /\/api\/admin\/production-house\/social/i,
  /\/api\/admin\/production-house\/live-stream/i,
  /movie-render-queue/i,
  /sequencer\/start/i,
  /asset-import/i,
];

export function loadSettings(storage: StudioStorage): StudioSettings {
  const raw = storage.getItem(STUDIO_SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      safetyMode: "locked",
      tokenStoredInKeychain: parsed?.tokenStoredInKeychain === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  storage: StudioStorage,
  settings: Partial<StudioSettings>,
): StudioSettings {
  const next: StudioSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    safetyMode: "locked",
    tokenStoredInKeychain: settings.tokenStoredInKeychain === true,
  };
  storage.setItem(STUDIO_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function isBlockedLiveEndpoint(pathOrUrl: string): boolean {
  return BLOCKED_ENDPOINT_PATTERNS.some((pattern) => pattern.test(pathOrUrl));
}

export function normalizeApiUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function assertSafeEndpoint(pathOrUrl: string): void {
  if (isBlockedLiveEndpoint(pathOrUrl)) {
    throw new Error("Blocked by Mougle Studio Pro safety mode: live execution endpoint refused.");
  }
}

async function parseJsonResponse(res: StudioFetchResponse): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class MougleStudioApiClient {
  private csrfToken: string | null = null;

  constructor(
    private readonly settings: StudioSettings,
    private readonly fetchImpl: StudioFetch = fetch as any,
  ) {}

  async csrf(): Promise<string | null> {
    if (this.csrfToken) return this.csrfToken;
    const url = normalizeApiUrl(this.settings.apiBaseUrl, "/api/auth/csrf-token");
    const res = await this.fetchImpl(url, { credentials: "include" });
    if (!res.ok) return null;
    const body = await parseJsonResponse(res);
    if (body && typeof body.csrfToken === "string") {
      this.csrfToken = body.csrfToken;
      return this.csrfToken;
    }
    return null;
  }

  async request<T = any>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    assertSafeEndpoint(path);
    const method = String(options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (MUTATING.has(method)) {
      const token = await this.csrf();
      if (token) headers.set("X-CSRF-Token", token);
    }
    const res = await this.fetchImpl(normalizeApiUrl(this.settings.apiBaseUrl, path), {
      ...options,
      method,
      credentials: "include",
      headers,
    });
    const body = await parseJsonResponse(res);
    if (!res.ok) {
      const msg = body?.error ?? body?.message ?? `Mougle API request failed with ${res.status}`;
      throw new Error(String(msg));
    }
    return body as T;
  }

  get<T = any>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T = any>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  }

  async download(path: string): Promise<{
    filename: string;
    contentType: string;
    bytes: ArrayBuffer;
  }> {
    assertSafeEndpoint(path);
    const url = normalizeApiUrl(this.settings.apiBaseUrl, path);
    const res = await this.fetchImpl(url, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      const body = await parseJsonResponse(res);
      throw new Error(String(body?.error ?? body?.message ?? `Download failed with ${res.status}`));
    }
    const disposition = res.headers?.get("Content-Disposition") ?? "";
    const filename =
      /filename="([^"]+)"/i.exec(disposition)?.[1] ??
      path.split("/").pop() ??
      "mougle-download.bin";
    const bytes = res.arrayBuffer
      ? await res.arrayBuffer()
      : new TextEncoder().encode(await res.text()).buffer;
    return {
      filename,
      contentType: res.headers?.get("Content-Type") ?? "application/octet-stream",
      bytes,
    };
  }

  downloadCinema4DScript(roomId: string, qualityTier = "premium_draft") {
    return this.download(
      `/api/admin/production-house/cinema4d-studio/${encodeURIComponent(roomId)}/download-script?qualityTier=${encodeURIComponent(qualityTier)}`,
    );
  }

  downloadCinema4DPackage(roomId: string, qualityTier = "premium_draft") {
    return this.download(
      `/api/admin/production-house/cinema4d-studio/${encodeURIComponent(roomId)}/download-package?qualityTier=${encodeURIComponent(qualityTier)}`,
    );
  }
}

export function withSafetyLocks<T extends Record<string, any>>(value: T): T {
  return {
    ...value,
    ...SAFETY_LOCKS,
    safetyEnvelope: value.safetyEnvelope ?? {
      publicPublishing: false,
      youtubeUpload: false,
      socialPosting: false,
      liveStreaming: false,
      realUnrealCommands: false,
      real4DCommands: false,
      publicUrlGeneration: false,
      signedUrlGeneration: false,
      manualRootAdminOverrideOnly: true,
    },
  };
}

export function hasLockedSafetyFields(value: any): boolean {
  return !!value &&
    value.status === "draft" &&
    value.approvalStatus === "draft" &&
    value.visibility === "admin_only_internal" &&
    value.publicUrl === null &&
    value.signedUrl === null &&
    value.realSendAllowed === false &&
    value.executionEnabled === false &&
    value.safetyEnvelope !== undefined;
}

export const STUDIO_TOOLTIPS: Record<string, string> = {
  generateRoom:
    "Calls the Mougle API to create a draft/internal room manifest only. No Unreal execution, no 4D hardware, no rendering, no publishing.",
  generateAnchor:
    "Calls the Mougle API to create a placeholder anchor manifest only. It is draft/mock and cannot affect Unreal, 4D hardware, or publishing.",
  generateAccessories:
    "Calls the Mougle API to create placeholder accessory manifests. Draft/internal only; no asset import or hardware action.",
  generateScript:
    "Calls the Mougle API to generate a Cinema 4D Python script. It does not render, trigger Movie Render Queue, start Sequencer, or publish.",
  openPreview:
    "Calls the Mougle API to create an admin-only Preview Studio state. It is not rendered, not published, and cannot execute Unreal or 4D hardware.",
  downloadScript:
    "Downloads the draft Cinema 4D Python script from Mougle. Download only; no rendering, no Unreal execution, no 4D hardware, no publishing.",
  downloadPackage:
    "Downloads a sanitized draft ZIP package from Mougle. It contains manifests and script files only; no secrets, no public URLs, no live execution tokens.",
  unrealDryRun:
    "Calls dry-run or contract-only Mougle endpoints. It never calls live Unreal commands, level loading, Sequencer, MRQ, or render endpoints.",
  fourDSandbox:
    "Calls 4D sandbox endpoints only. It never sends real DMX, OSC, UDP, MIDI, serial, relay, fog, wind, scent, lighting, or motion-seat commands.",
  mediaPackage:
    "Creates draft/internal media packages only. No YouTube upload, social posting, live stream, or publishing.",
};
