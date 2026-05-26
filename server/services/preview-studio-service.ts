/**
 * Mougle Production Preview Studio — admin-only, dry-run, never published.
 *
 * SAFETY:
 *   - This module NEVER calls a provider, opens a socket, renders anything,
 *     writes to public storage, or generates a public/signed URL.
 *   - Every output carries the locked safety fields (status: "draft",
 *     visibility: "admin_only_internal", publicUrl/signedUrl: null,
 *     realSendAllowed/executionEnabled: false, noUnrealExecution/
 *     noFourDHardware: true) and the SAFETY_ENVELOPE from
 *     shared/production-house.ts.
 *   - In-memory state is rehydrated from, and persisted back to, the
 *     Production House storage adapter (file or memory). Only structural
 *     scene/edit metadata is serialized. publicUrl / signedUrl are forced
 *     to null on save, and no secret, API key, or token is ever written.
 */

import { randomUUID } from "crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join, resolve, sep } from "path";
import {
  PREVIEW_STUDIO_MODES,
  SAFETY_ENVELOPE,
  type PreviewStudioComposeImageInput,
  type PreviewStudioComposeVideoInput,
  type PreviewStudioControls,
  type PreviewStudioEditArtifact,
  type PreviewStudioEditLayer,
  type PreviewStudioMode,
  type PreviewStudioScene,
  type PreviewStudioState,
} from "../../shared/production-house";
import {
  createDefaultStorage,
  type ProductionHouseStorage,
} from "./production-house-storage";
import { panicButtonService } from "./panic-button-service";

interface ModeDefault {
  label: string;
  roomLabel: string;
  layoutPreset: PreviewStudioControls["layoutPreset"];
  camera: PreviewStudioControls["camera"];
  lighting: PreviewStudioControls["lighting"];
  aspect: "16:9" | "9:16" | "1:1" | "21:9";
  accent: string;
  lightingLabel: string;
  tickerText: string;
  lowerThirdText: string;
  avatars: Array<{ label: string; role: string; x: number; y: number; facing: "camera" | "left" | "right" | "center" }>;
  panels: Array<{
    label: string;
    kind: "panel" | "ledwall" | "ticker" | "lower_third" | "callout" | "monitor";
    x: number; y: number; w: number; h: number;
  }>;
  fourDCues: Array<{ label: string; tSec: number; effect: string }>;
  notes: string[];
}

const MODE_DEFAULTS: Record<PreviewStudioMode, ModeDefault> = {
  newsroom: {
    label: "Newsroom Preview",
    roomLabel: "Mougle Newsroom Studio A",
    layoutPreset: "anchor_left_panel_right",
    camera: "anchor_two_shot",
    lighting: "neutral_news",
    aspect: "16:9",
    accent: "#38bdf8",
    lightingLabel: "Neutral newsroom key + soft fill",
    tickerText: "MOUGLE INTELLIGENCE NETWORK • LIVE PREVIEW • ADMIN ONLY",
    lowerThirdText: "Anchor — Mougle News Desk",
    avatars: [
      { label: "Anchor", role: "news_anchor", x: 0.32, y: 0.62, facing: "camera" },
      { label: "Co-Anchor", role: "news_anchor", x: 0.46, y: 0.62, facing: "camera" },
    ],
    panels: [
      { label: "LED Wall", kind: "ledwall", x: 0.04, y: 0.08, w: 0.92, h: 0.42 },
      { label: "Topic Panel", kind: "panel", x: 0.62, y: 0.18, w: 0.30, h: 0.28 },
      { label: "Lower Third", kind: "lower_third", x: 0.04, y: 0.80, w: 0.55, h: 0.10 },
      { label: "Ticker", kind: "ticker", x: 0.0, y: 0.92, w: 1.0, h: 0.06 },
    ],
    fourDCues: [
      { label: "Open sting", tSec: 0, effect: "light_flash" },
      { label: "Topic change", tSec: 18, effect: "color_change" },
    ],
    notes: ["Default newsroom layout. Edit avatars or LED-wall topic in the right inspector."],
  },
  breaking_news: {
    label: "Breaking News Preview",
    roomLabel: "Breaking News Override",
    layoutPreset: "breaking_news_alert",
    camera: "anchor_close_up",
    lighting: "breaking_high_contrast",
    aspect: "16:9",
    accent: "#f43f5e",
    lightingLabel: "High-contrast red key, urgency mood",
    tickerText: "BREAKING • PREVIEW ONLY • NOT PUBLISHED",
    lowerThirdText: "BREAKING — Mougle Network",
    avatars: [
      { label: "Anchor", role: "news_anchor", x: 0.40, y: 0.60, facing: "camera" },
    ],
    panels: [
      { label: "Alert LED Wall", kind: "ledwall", x: 0.0, y: 0.0, w: 1.0, h: 0.50 },
      { label: "Breaking Callout", kind: "callout", x: 0.04, y: 0.55, w: 0.40, h: 0.15 },
      { label: "Lower Third", kind: "lower_third", x: 0.04, y: 0.80, w: 0.70, h: 0.10 },
      { label: "Ticker", kind: "ticker", x: 0.0, y: 0.92, w: 1.0, h: 0.06 },
    ],
    fourDCues: [
      { label: "Alert hit", tSec: 0, effect: "light_flash" },
    ],
    notes: ["Used only for breaking-news mock previews. Real broadcast is disabled."],
  },
  podcast: {
    label: "Podcast Room Preview",
    roomLabel: "Mougle Podcast Studio",
    layoutPreset: "podcast_two_host",
    camera: "anchor_two_shot",
    lighting: "podcast_intimate",
    aspect: "16:9",
    accent: "#a78bfa",
    lightingLabel: "Warm intimate key, soft rim",
    tickerText: "",
    lowerThirdText: "Mougle Podcast — Preview",
    avatars: [
      { label: "Host", role: "podcast_host", x: 0.32, y: 0.62, facing: "right" },
      { label: "Co-Host", role: "podcast_host", x: 0.58, y: 0.62, facing: "left" },
    ],
    panels: [
      { label: "Topic Monitor", kind: "monitor", x: 0.36, y: 0.10, w: 0.28, h: 0.30 },
      { label: "Lower Third", kind: "lower_third", x: 0.04, y: 0.82, w: 0.55, h: 0.10 },
    ],
    fourDCues: [],
    notes: ["Two-host default. Switch to host-guest from layout presets."],
  },
  debate: {
    label: "Debate Studio Preview",
    roomLabel: "Mougle Debate Arena",
    layoutPreset: "debate_three_person",
    camera: "panel_overview",
    lighting: "warm_studio",
    aspect: "16:9",
    accent: "#fbbf24",
    lightingLabel: "Balanced amber key on three positions",
    tickerText: "DEBATE • PREVIEW",
    lowerThirdText: "Debate — Mougle Network",
    avatars: [
      { label: "Side A", role: "guest", x: 0.20, y: 0.62, facing: "right" },
      { label: "Moderator", role: "debate_moderator", x: 0.45, y: 0.62, facing: "camera" },
      { label: "Side B", role: "guest", x: 0.70, y: 0.62, facing: "left" },
    ],
    panels: [
      { label: "LED Wall", kind: "ledwall", x: 0.04, y: 0.06, w: 0.92, h: 0.36 },
      { label: "Topic Panel", kind: "panel", x: 0.04, y: 0.46, w: 0.30, h: 0.12 },
      { label: "Lower Third", kind: "lower_third", x: 0.04, y: 0.82, w: 0.60, h: 0.10 },
      { label: "Ticker", kind: "ticker", x: 0.0, y: 0.92, w: 1.0, h: 0.06 },
    ],
    fourDCues: [
      { label: "Round start", tSec: 0, effect: "light_flash" },
      { label: "Round end", tSec: 120, effect: "color_change" },
    ],
    notes: ["Default three-person debate; moderator in center."],
  },
  interview: {
    label: "Interview Room Preview",
    roomLabel: "Mougle Interview Suite",
    layoutPreset: "podcast_host_guest",
    camera: "anchor_two_shot",
    lighting: "warm_studio",
    aspect: "16:9",
    accent: "#34d399",
    lightingLabel: "Warm interview key, soft rim",
    tickerText: "",
    lowerThirdText: "Interview — Mougle",
    avatars: [
      { label: "Host", role: "news_anchor", x: 0.30, y: 0.62, facing: "right" },
      { label: "Guest", role: "guest", x: 0.60, y: 0.62, facing: "left" },
    ],
    panels: [
      { label: "Topic Monitor", kind: "monitor", x: 0.38, y: 0.12, w: 0.24, h: 0.26 },
      { label: "Lower Third", kind: "lower_third", x: 0.04, y: 0.82, w: 0.55, h: 0.10 },
    ],
    fourDCues: [],
    notes: ["Default host + guest. Add a 3rd guest by editing avatar markers."],
  },
  market_watch: {
    label: "Market Watch Preview",
    roomLabel: "Mougle Market Watch Wall",
    layoutPreset: "market_wall",
    camera: "wide_master",
    lighting: "neutral_news",
    aspect: "21:9",
    accent: "#22d3ee",
    lightingLabel: "Neutral analytic key, cool fill",
    tickerText: "S&P • NDX • BTC • ETH • PREVIEW ONLY",
    lowerThirdText: "Market Watch — Mougle",
    avatars: [
      { label: "Analyst", role: "analyst", x: 0.20, y: 0.65, facing: "camera" },
    ],
    panels: [
      { label: "Wall Tile 1", kind: "monitor", x: 0.40, y: 0.10, w: 0.18, h: 0.34 },
      { label: "Wall Tile 2", kind: "monitor", x: 0.60, y: 0.10, w: 0.18, h: 0.34 },
      { label: "Wall Tile 3", kind: "monitor", x: 0.80, y: 0.10, w: 0.16, h: 0.34 },
      { label: "Ticker", kind: "ticker", x: 0.0, y: 0.92, w: 1.0, h: 0.06 },
    ],
    fourDCues: [],
    notes: ["Wide market wall. Tiles are placeholders — no live data feed."],
  },
  hall_event: {
    label: "Hall / Event Preview",
    roomLabel: "Mougle Event Hall",
    layoutPreset: "hall_stage",
    camera: "audience_reverse",
    lighting: "hall_event_spot",
    aspect: "16:9",
    accent: "#f472b6",
    lightingLabel: "Spotlit stage, warm front fill",
    tickerText: "",
    lowerThirdText: "Mougle Event — Preview",
    avatars: [
      { label: "Speaker", role: "virtual_ceo", x: 0.50, y: 0.55, facing: "camera" },
    ],
    panels: [
      { label: "Stage LED", kind: "ledwall", x: 0.10, y: 0.06, w: 0.80, h: 0.40 },
      { label: "Lower Third", kind: "lower_third", x: 0.10, y: 0.82, w: 0.50, h: 0.10 },
    ],
    fourDCues: [
      { label: "Spotlight up", tSec: 0, effect: "light_flash" },
      { label: "Applause cue", tSec: 30, effect: "fog_burst" },
    ],
    notes: ["Stage layout with speaker centered. No real lighting/4D hardware is sent."],
  },
  youtube_social: {
    label: "YouTube / Social Package Preview",
    roomLabel: "Social Vertical Cut",
    layoutPreset: "social_vertical_preview",
    camera: "social_vertical",
    lighting: "warm_studio",
    aspect: "9:16",
    accent: "#fb7185",
    lightingLabel: "Vertical-friendly soft key",
    tickerText: "@mougle • PREVIEW",
    lowerThirdText: "Mougle — Preview Clip",
    avatars: [
      { label: "Anchor", role: "news_anchor", x: 0.50, y: 0.58, facing: "camera" },
    ],
    panels: [
      { label: "Caption Bar", kind: "callout", x: 0.08, y: 0.16, w: 0.84, h: 0.10 },
      { label: "Lower Third", kind: "lower_third", x: 0.08, y: 0.78, w: 0.84, h: 0.10 },
    ],
    fourDCues: [],
    notes: ["9:16 social cut. No upload to YouTube or social platforms."],
  },
  fourd_cinema: {
    label: "4D Cinema Cue Preview",
    roomLabel: "Mougle 4D Theater",
    layoutPreset: "hall_stage",
    camera: "wide_master",
    lighting: "cinematic_dim",
    aspect: "21:9",
    accent: "#c084fc",
    lightingLabel: "Cinematic dim, accent washes",
    tickerText: "",
    lowerThirdText: "4D Cinema — Cue Plan",
    avatars: [],
    panels: [
      { label: "Cinema Screen", kind: "ledwall", x: 0.05, y: 0.06, w: 0.90, h: 0.50 },
    ],
    fourDCues: [
      { label: "Wind cue", tSec: 5, effect: "wind" },
      { label: "Fog burst", tSec: 12, effect: "fog_burst" },
      { label: "Color wash", tSec: 22, effect: "color_change" },
      { label: "Light flash", tSec: 30, effect: "light_flash" },
    ],
    notes: ["Cue planning only. No 4D hardware command is dispatched."],
  },
};

function buildScene(controls: PreviewStudioControls): PreviewStudioScene {
  const def = MODE_DEFAULTS[controls.mode];
  return {
    controls,
    avatars: def.avatars.map((a, i) => ({
      id: `av_${controls.mode}_${i + 1}`,
      label: a.label,
      role: a.role,
      x: a.x,
      y: a.y,
      facing: a.facing,
    })),
    panels: def.panels.map((p, i) => ({
      id: `pn_${controls.mode}_${i + 1}`,
      label: p.label,
      kind: p.kind,
      x: p.x, y: p.y, w: p.w, h: p.h,
    })),
    fourDCues: def.fourDCues.map((c, i) => ({
      id: `cue_${controls.mode}_${i + 1}`,
      label: c.label,
      tSec: c.tSec,
      effect: c.effect,
    })),
    cameraFrame: { aspect: def.aspect, label: controls.camera },
    lightingMood: { label: def.lightingLabel, accent: def.accent },
    notes: def.notes,
  };
}

function defaultControlsFor(mode: PreviewStudioMode): PreviewStudioControls {
  const d = MODE_DEFAULTS[mode];
  return {
    mode,
    layoutPreset: d.layoutPreset,
    camera: d.camera,
    lighting: d.lighting,
    roomLabel: d.roomLabel,
    showLowerThird: true,
    showTicker: d.tickerText.length > 0,
    showLedWall: d.panels.some((p) => p.kind === "ledwall"),
    show4dMarkers: d.fourDCues.length > 0,
    tickerText: d.tickerText,
    lowerThirdText: d.lowerThirdText,
  };
}

const SAFETY_LOCKED = {
  status: "draft" as const,
  approvalStatus: "draft" as const,
  visibility: "admin_only_internal" as const,
  publicUrl: null,
  signedUrl: null,
  realSendAllowed: false as const,
  executionEnabled: false as const,
  adminPreviewOnly: true as const,
  notRendered: true as const,
  notPublished: true as const,
  noUnrealExecution: true as const,
  noFourDHardware: true as const,
};

function sealState(scene: PreviewStudioScene): PreviewStudioState {
  return {
    id: `psv_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    generatedBy: "root_admin",
    scene,
    ...SAFETY_LOCKED,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

const states: PreviewStudioState[] = [];
let latest: PreviewStudioState | null = null;

/* ------------------------------------------------------------------ */
/* History cap — bound in-memory + on-disk growth.                     */
/*                                                                     */
/* Without a cap, every generate / update-controls / compose-image /   */
/* compose-video-clip call grows the persisted JSON files forever,     */
/* eventually slowing startup hydration and ballooning disk usage.     */
/* We keep only the most recent N entries per collection.              */
/* ------------------------------------------------------------------ */

const DEFAULT_HISTORY_CAP = 200;
const MIN_HISTORY_CAP = 1;
const MAX_HISTORY_CAP = 10000;

function envHistoryCap(): number | null {
  const raw = process.env.PREVIEW_STUDIO_HISTORY_CAP;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

interface PreviewStudioServiceConfig {
  historyCap?: number;
  archiveRetentionCount?: number;
  archiveRetentionDays?: number;
  archiveStorageThresholdMb?: number;
  archiveStorageAboveThreshold?: boolean;
}

let cachedConfig: PreviewStudioServiceConfig | null = null;

function getConfigPath(): string {
  return join(EDIT_DIR, "config.json");
}

function loadConfig(): PreviewStudioServiceConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = readFileSync(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    cachedConfig = (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    cachedConfig = {};
  }
  return cachedConfig!;
}

function saveConfig(cfg: PreviewStudioServiceConfig): void {
  cachedConfig = cfg;
  try {
    writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), "utf8");
  } catch (e) {
    console.warn(
      "[preview-studio] failed to persist config:",
      (e as Error).message,
    );
  }
}

function readHistoryCap(): number {
  const cfg = loadConfig();
  if (typeof cfg.historyCap === "number" && cfg.historyCap > 0) {
    return cfg.historyCap;
  }
  return envHistoryCap() ?? DEFAULT_HISTORY_CAP;
}

function trimToCap<T>(arr: T[]): void {
  const cap = readHistoryCap();
  if (arr.length <= cap) return;
  arr.splice(0, arr.length - cap);
}

export interface PreviewStudioHistoryCapInfo {
  cap: number;
  defaultCap: number;
  minCap: number;
  maxCap: number;
  envCap: number | null;
  adminCap: number | null;
  source: "admin" | "env" | "default";
  states: number;
  editArtifacts: number;
}

export function getPreviewStudioHistoryCap(): PreviewStudioHistoryCapInfo {
  hydrate();
  const cfg = loadConfig();
  const adminCap =
    typeof cfg.historyCap === "number" && cfg.historyCap > 0
      ? cfg.historyCap
      : null;
  const envCap = envHistoryCap();
  const cap = adminCap ?? envCap ?? DEFAULT_HISTORY_CAP;
  const source: "admin" | "env" | "default" = adminCap
    ? "admin"
    : envCap
    ? "env"
    : "default";
  return {
    cap,
    defaultCap: DEFAULT_HISTORY_CAP,
    minCap: MIN_HISTORY_CAP,
    maxCap: MAX_HISTORY_CAP,
    envCap,
    adminCap,
    source,
    states: states.length,
    editArtifacts: editArtifacts.length,
  };
}

export interface PreviewStudioHistoryCapUpdate {
  info: PreviewStudioHistoryCapInfo;
  trimmedStates: number;
  trimmedEditArtifacts: number;
}

export function setPreviewStudioHistoryCap(
  next: number,
): PreviewStudioHistoryCapUpdate {
  if (
    !Number.isFinite(next) ||
    !Number.isInteger(next) ||
    next < MIN_HISTORY_CAP ||
    next > MAX_HISTORY_CAP
  ) {
    throw new Error("invalid_cap");
  }
  hydrate();
  saveConfig({ ...loadConfig(), historyCap: next });
  const beforeStates = states.length;
  const beforeArts = editArtifacts.length;
  trimToCap(states);
  trimToCap(editArtifacts);
  if (latest && !states.includes(latest)) {
    latest = states[states.length - 1] ?? null;
  }
  const trimmedStates = beforeStates - states.length;
  const trimmedEditArtifacts = beforeArts - editArtifacts.length;
  if (trimmedStates > 0) persistStates();
  if (trimmedEditArtifacts > 0) persistEditArtifacts();
  return {
    info: getPreviewStudioHistoryCap(),
    trimmedStates,
    trimmedEditArtifacts,
  };
}

export type PreviewStudioClearScope = "states" | "edit_artifacts" | "both";

export interface PreviewStudioClearResult {
  scope: PreviewStudioClearScope;
  clearedStates: number;
  clearedEditArtifacts: number;
  olderThanIso: string | null;
  info: PreviewStudioHistoryCapInfo;
  archiveFile: string | null;
  archiveByteSize: number;
}

/* ------------------------------------------------------------------ */
/* Clear-history archives — snapshot cleared entries to a timestamped */
/* internal-only JSON file before the in-memory arrays are emptied,   */
/* so admins can audit or recover the data after a clear.             */
/*                                                                     */
/* SAFETY:                                                             */
/*   - Archives live under EDIT_DIR/archives, the same admin-only      */
/*     internal directory used for edit artifact files. They are       */
/*     never served from public storage and never produce a public/    */
/*     signed URL.                                                     */
/*   - publicUrl / signedUrl are stripped from snapshot entries as a   */
/*     defense-in-depth measure (they are already locked to null).    */
/*   - Filenames follow a fixed pattern; the read API rejects any     */
/*     name that does not match it to prevent path traversal.         */
/* ------------------------------------------------------------------ */

const ARCHIVE_FILENAME_RE =
  /^preview-studio-archive-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(states|edit_artifacts|both)-[0-9a-f]{8}\.json$/;

function getArchiveDir(): string {
  const dir = join(EDIT_DIR, "archives");
  try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

function writeClearArchive(
  scope: PreviewStudioClearScope,
  snapshotStates: PreviewStudioState[],
  snapshotArtifacts: PreviewStudioEditArtifact[],
): { file: string | null; byteSize: number } {
  if (snapshotStates.length === 0 && snapshotArtifacts.length === 0) {
    return { file: null, byteSize: 0 };
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename =
    `preview-studio-archive-${ts}-${scope}-${randomUUID().slice(0, 8)}.json`;
  const payload = {
    archivedAt: new Date().toISOString(),
    scope,
    clearedStates: snapshotStates.length,
    clearedEditArtifacts: snapshotArtifacts.length,
    safetyEnvelope: SAFETY_ENVELOPE,
    previewStudioStates: snapshotStates.map((s) => stripUnsafeUrls(s)),
    previewStudioEditArtifacts: snapshotArtifacts.map((a) => stripUnsafeUrls(a)),
  };
  const json = JSON.stringify(payload, null, 2);
  const full = join(getArchiveDir(), filename);
  try {
    writeFileSync(full, json, "utf8");
    pruneArchives();
    return { file: filename, byteSize: Buffer.byteLength(json, "utf8") };
  } catch (e) {
    console.warn(
      "[preview-studio] failed to write clear-history archive:",
      (e as Error).message,
    );
    return { file: null, byteSize: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* Archive retention — cap the count of, and/or maximum age of,        */
/* clear-history archive files. Without rotation, EDIT_DIR/archives    */
/* would grow forever on a busy admin and eventually waste disk.       */
/*                                                                     */
/* SAFETY:                                                             */
/*   - Only files matching ARCHIVE_FILENAME_RE are ever considered for */
/*     deletion; foreign files (or anything outside getArchiveDir())   */
/*     are left untouched.                                             */
/*   - Pruning runs after each archive write and whenever an admin     */
/*     updates the retention settings. Failures are logged but never   */
/*     surface — pruning is best-effort.                               */
/* ------------------------------------------------------------------ */

const DEFAULT_ARCHIVE_RETENTION_COUNT = 50;
const DEFAULT_ARCHIVE_RETENTION_DAYS = 30;
const MIN_ARCHIVE_RETENTION_COUNT = 1;
const MAX_ARCHIVE_RETENTION_COUNT = 10000;
const MIN_ARCHIVE_RETENTION_DAYS = 1;
const MAX_ARCHIVE_RETENTION_DAYS = 3650;
const DEFAULT_ARCHIVE_STORAGE_THRESHOLD_MB = 100;
const MIN_ARCHIVE_STORAGE_THRESHOLD_MB = 1;
const MAX_ARCHIVE_STORAGE_THRESHOLD_MB = 100000;

function envArchiveRetentionCount(): number | null {
  const raw = process.env.PREVIEW_STUDIO_ARCHIVE_RETENTION_COUNT;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
function envArchiveRetentionDays(): number | null {
  const raw = process.env.PREVIEW_STUDIO_ARCHIVE_RETENTION_DAYS;
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
function envArchiveStorageThresholdMb(): number | null {
  const raw = process.env.PREVIEW_STUDIO_ARCHIVE_STORAGE_THRESHOLD_MB;
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function readArchiveRetentionCount(): number {
  const cfg = loadConfig();
  if (typeof cfg.archiveRetentionCount === "number" && cfg.archiveRetentionCount > 0) {
    return cfg.archiveRetentionCount;
  }
  return envArchiveRetentionCount() ?? DEFAULT_ARCHIVE_RETENTION_COUNT;
}
function readArchiveRetentionDays(): number {
  const cfg = loadConfig();
  if (typeof cfg.archiveRetentionDays === "number" && cfg.archiveRetentionDays > 0) {
    return cfg.archiveRetentionDays;
  }
  return envArchiveRetentionDays() ?? DEFAULT_ARCHIVE_RETENTION_DAYS;
}
interface ArchiveStat {
  filename: string;
  full: string;
  mtimeMs: number;
  size: number;
}

function scanArchives(): ArchiveStat[] {
  const dir = getArchiveDir();
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  const out: ArchiveStat[] = [];
  for (const name of names) {
    if (!ARCHIVE_FILENAME_RE.test(name)) continue;
    const full = join(dir, name);
    try {
      const st = statSync(full);
      out.push({ filename: name, full, mtimeMs: st.mtimeMs, size: st.size });
    } catch { /* ignore */ }
  }
  return out;
}

export interface PreviewStudioArchivePruneResult {
  deletedFiles: string[];
  deletedBytes: number;
}

/* ------------------------------------------------------------------ */
/* Storage-threshold founder alert — fires once when archive disk     */
/* usage transitions from <= threshold to > threshold, and re-arms    */
/* only after usage drops back below. Prevents spamming the founder   */
/* alert feed while still surfacing the warning when no admin is on   */
/* the Preview Studio panel.                                           */
/* ------------------------------------------------------------------ */

function readArchiveStorageAboveThreshold(): boolean {
  return loadConfig().archiveStorageAboveThreshold === true;
}

function writeArchiveStorageAboveThreshold(value: boolean): void {
  const cfg = loadConfig();
  if ((cfg.archiveStorageAboveThreshold === true) === value) return;
  const next: PreviewStudioServiceConfig = { ...cfg };
  if (value) {
    next.archiveStorageAboveThreshold = true;
  } else {
    delete next.archiveStorageAboveThreshold;
  }
  saveConfig(next);
}

function notifyArchiveStorageThreshold(): void {
  let info: PreviewStudioArchiveRetentionInfo;
  try {
    info = getPreviewStudioArchiveRetention();
  } catch {
    return;
  }
  const exceeded = info.storageThresholdExceeded;
  const alreadyAbove = readArchiveStorageAboveThreshold();
  if (exceeded && !alreadyAbove) {
    writeArchiveStorageAboveThreshold(true);
    const usedMb = Math.round((info.archiveBytes / (1024 * 1024)) * 10) / 10;
    void panicButtonService
      .createAlert({
        type: "preview_studio_archive_storage",
        severity: "warning",
        message:
          `Preview Studio archive storage crossed the warning threshold ` +
          `(${usedMb} MB used, threshold ${info.storageThresholdMb} MB, ` +
          `${info.archiveFiles} files).`,
        details: {
          archiveBytes: info.archiveBytes,
          archiveFiles: info.archiveFiles,
          storageThresholdMb: info.storageThresholdMb,
          storageThresholdBytes: info.storageThresholdBytes,
          storageUsagePercent: info.storageUsagePercent,
          storageThresholdSource: info.storageThresholdSource,
        },
        autoTriggered: true,
      })
      .catch((e: unknown) => {
        console.warn(
          "[preview-studio] failed to fire archive storage alert:",
          (e as Error).message,
        );
      });
  } else if (!exceeded && alreadyAbove) {
    writeArchiveStorageAboveThreshold(false);
  }
}

export function pruneArchives(): PreviewStudioArchivePruneResult {
  const maxCount = readArchiveRetentionCount();
  const maxDays = readArchiveRetentionDays();
  const cutoffMs = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  const files = scanArchives().sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toDelete = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    if (i >= maxCount) toDelete.add(files[i].filename);
    else if (files[i].mtimeMs < cutoffMs) toDelete.add(files[i].filename);
  }
  const deletedFiles: string[] = [];
  let deletedBytes = 0;
  for (const f of files) {
    if (!toDelete.has(f.filename)) continue;
    // Defense in depth: re-validate the resolved path lives inside the archive dir.
    const dir = getArchiveDir();
    const safe = resolve(f.full).startsWith(resolve(dir) + sep);
    if (!safe) continue;
    try {
      unlinkSync(f.full);
      deletedFiles.push(f.filename);
      deletedBytes += f.size;
    } catch (e) {
      console.warn(
        "[preview-studio] failed to prune archive",
        f.filename,
        ":",
        (e as Error).message,
      );
    }
  }
  notifyArchiveStorageThreshold();
  return { deletedFiles, deletedBytes };
}

export interface PreviewStudioArchiveRetentionInfo {
  maxCount: number;
  maxAgeDays: number;
  defaultCount: number;
  defaultDays: number;
  minCount: number;
  maxCountLimit: number;
  minDays: number;
  maxDaysLimit: number;
  envCount: number | null;
  envDays: number | null;
  adminCount: number | null;
  adminDays: number | null;
  countSource: "admin" | "env" | "default";
  daysSource: "admin" | "env" | "default";
  archiveFiles: number;
  archiveBytes: number;
  storageThresholdMb: number;
  storageThresholdBytes: number;
  defaultStorageThresholdMb: number;
  minStorageThresholdMb: number;
  maxStorageThresholdMbLimit: number;
  envStorageThresholdMb: number | null;
  adminStorageThresholdMb: number | null;
  storageThresholdSource: "admin" | "env" | "default";
  storageThresholdExceeded: boolean;
  storageUsagePercent: number;
}

export function getPreviewStudioArchiveRetention(): PreviewStudioArchiveRetentionInfo {
  const cfg = loadConfig();
  const adminCount =
    typeof cfg.archiveRetentionCount === "number" && cfg.archiveRetentionCount > 0
      ? cfg.archiveRetentionCount
      : null;
  const adminDays =
    typeof cfg.archiveRetentionDays === "number" && cfg.archiveRetentionDays > 0
      ? cfg.archiveRetentionDays
      : null;
  const envCount = envArchiveRetentionCount();
  const envDays = envArchiveRetentionDays();
  const maxCount = adminCount ?? envCount ?? DEFAULT_ARCHIVE_RETENTION_COUNT;
  const maxAgeDays = adminDays ?? envDays ?? DEFAULT_ARCHIVE_RETENTION_DAYS;
  const countSource: "admin" | "env" | "default" = adminCount
    ? "admin"
    : envCount
    ? "env"
    : "default";
  const daysSource: "admin" | "env" | "default" = adminDays
    ? "admin"
    : envDays
    ? "env"
    : "default";
  const adminThreshold =
    typeof cfg.archiveStorageThresholdMb === "number" &&
    cfg.archiveStorageThresholdMb > 0
      ? cfg.archiveStorageThresholdMb
      : null;
  const envThreshold = envArchiveStorageThresholdMb();
  const storageThresholdMb =
    adminThreshold ?? envThreshold ?? DEFAULT_ARCHIVE_STORAGE_THRESHOLD_MB;
  const storageThresholdSource: "admin" | "env" | "default" = adminThreshold
    ? "admin"
    : envThreshold
    ? "env"
    : "default";
  const files = scanArchives();
  const archiveBytes = files.reduce((acc, f) => acc + f.size, 0);
  const storageThresholdBytes = Math.round(storageThresholdMb * 1024 * 1024);
  return {
    maxCount,
    maxAgeDays,
    defaultCount: DEFAULT_ARCHIVE_RETENTION_COUNT,
    defaultDays: DEFAULT_ARCHIVE_RETENTION_DAYS,
    minCount: MIN_ARCHIVE_RETENTION_COUNT,
    maxCountLimit: MAX_ARCHIVE_RETENTION_COUNT,
    minDays: MIN_ARCHIVE_RETENTION_DAYS,
    maxDaysLimit: MAX_ARCHIVE_RETENTION_DAYS,
    envCount,
    envDays,
    adminCount,
    adminDays,
    countSource,
    daysSource,
    archiveFiles: files.length,
    archiveBytes,
    storageThresholdMb,
    storageThresholdBytes,
    defaultStorageThresholdMb: DEFAULT_ARCHIVE_STORAGE_THRESHOLD_MB,
    minStorageThresholdMb: MIN_ARCHIVE_STORAGE_THRESHOLD_MB,
    maxStorageThresholdMbLimit: MAX_ARCHIVE_STORAGE_THRESHOLD_MB,
    envStorageThresholdMb: envThreshold,
    adminStorageThresholdMb: adminThreshold,
    storageThresholdSource,
    storageThresholdExceeded:
      storageThresholdBytes > 0 && archiveBytes > storageThresholdBytes,
    storageUsagePercent:
      storageThresholdBytes > 0
        ? Math.round((archiveBytes / storageThresholdBytes) * 1000) / 10
        : 0,
  };
}

export interface PreviewStudioArchiveRetentionUpdate {
  info: PreviewStudioArchiveRetentionInfo;
  prune: PreviewStudioArchivePruneResult;
}

export function setPreviewStudioArchiveRetention(
  next: {
    maxCount?: number | null;
    maxAgeDays?: number | null;
    storageThresholdMb?: number | null;
  },
): PreviewStudioArchiveRetentionUpdate {
  const cfg: PreviewStudioServiceConfig = { ...loadConfig() };
  if (next.maxCount !== undefined) {
    if (next.maxCount === null) {
      delete cfg.archiveRetentionCount;
    } else {
      const n = next.maxCount;
      if (
        !Number.isFinite(n) ||
        !Number.isInteger(n) ||
        n < MIN_ARCHIVE_RETENTION_COUNT ||
        n > MAX_ARCHIVE_RETENTION_COUNT
      ) {
        throw new Error("invalid_max_count");
      }
      cfg.archiveRetentionCount = n;
    }
  }
  if (next.maxAgeDays !== undefined) {
    if (next.maxAgeDays === null) {
      delete cfg.archiveRetentionDays;
    } else {
      const n = next.maxAgeDays;
      if (
        !Number.isFinite(n) ||
        n < MIN_ARCHIVE_RETENTION_DAYS ||
        n > MAX_ARCHIVE_RETENTION_DAYS
      ) {
        throw new Error("invalid_max_age_days");
      }
      cfg.archiveRetentionDays = n;
    }
  }
  if (next.storageThresholdMb !== undefined) {
    if (next.storageThresholdMb === null) {
      delete cfg.archiveStorageThresholdMb;
    } else {
      const n = next.storageThresholdMb;
      if (
        !Number.isFinite(n) ||
        n < MIN_ARCHIVE_STORAGE_THRESHOLD_MB ||
        n > MAX_ARCHIVE_STORAGE_THRESHOLD_MB
      ) {
        throw new Error("invalid_storage_threshold_mb");
      }
      cfg.archiveStorageThresholdMb = n;
    }
  }
  saveConfig(cfg);
  const prune = pruneArchives();
  return { info: getPreviewStudioArchiveRetention(), prune };
}

export interface PreviewStudioArchiveEntry {
  filename: string;
  byteSize: number;
  createdAt: string;
  scope: PreviewStudioClearScope;
}

export function listPreviewStudioArchives(): PreviewStudioArchiveEntry[] {
  const dir = getArchiveDir();
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  const out: PreviewStudioArchiveEntry[] = [];
  for (const name of names) {
    if (!ARCHIVE_FILENAME_RE.test(name)) continue;
    const full = join(dir, name);
    let size = 0;
    let mtime = new Date(0).toISOString();
    try {
      const st = statSync(full);
      size = st.size;
      mtime = st.mtime.toISOString();
    } catch { continue; }
    const scope: PreviewStudioClearScope = name.includes("-both-")
      ? "both"
      : name.includes("-edit_artifacts-")
      ? "edit_artifacts"
      : "states";
    out.push({ filename: name, byteSize: size, createdAt: mtime, scope });
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export interface PreviewStudioArchiveFile {
  filename: string;
  byteSize: number;
  content: string;
}

export function readPreviewStudioArchive(
  filename: string,
): PreviewStudioArchiveFile | null {
  if (!ARCHIVE_FILENAME_RE.test(filename)) return null;
  const dir = getArchiveDir();
  const full = resolve(join(dir, filename));
  // Defense in depth: ensure the resolved path is still inside the
  // archive dir, blocking any traversal that slipped past the regex.
  if (!full.startsWith(resolve(dir) + sep)) return null;
  try {
    const content = readFileSync(full, "utf8");
    return {
      filename,
      byteSize: Buffer.byteLength(content, "utf8"),
      content,
    };
  } catch {
    return null;
  }
}

export interface PreviewStudioClearOptions {
  olderThanIso?: string | null;
  dryRun?: boolean;
}

export interface PreviewStudioClearPreview {
  scope: PreviewStudioClearScope;
  matchingStates: number;
  matchingEditArtifacts: number;
  totalStates: number;
  totalEditArtifacts: number;
  olderThanIso: string | null;
  dryRun: true;
}

export function previewClearPreviewStudioHistory(
  scope: PreviewStudioClearScope,
  options: PreviewStudioClearOptions = {},
): PreviewStudioClearPreview {
  hydrate();
  const cutoff = parseCutoff(options.olderThanIso ?? null);
  let matchingStates = 0;
  let matchingEditArtifacts = 0;
  if (scope === "states" || scope === "both") {
    matchingStates = cutoff === null
      ? states.length
      : states.filter((s) => entryBefore(s.createdAt, cutoff)).length;
  }
  if (scope === "edit_artifacts" || scope === "both") {
    matchingEditArtifacts = cutoff === null
      ? editArtifacts.length
      : editArtifacts.filter((a) => entryBefore(a.createdAt, cutoff)).length;
  }
  return {
    scope,
    matchingStates,
    matchingEditArtifacts,
    totalStates: states.length,
    totalEditArtifacts: editArtifacts.length,
    olderThanIso: cutoff === null ? null : new Date(cutoff).toISOString(),
    dryRun: true,
  };
}

function parseCutoff(olderThanIso: string | null | undefined): number | null {
  if (!olderThanIso) return null;
  const t = Date.parse(olderThanIso);
  if (!Number.isFinite(t)) throw new Error("invalid_older_than");
  return t;
}

function entryBefore(createdAt: unknown, cutoffMs: number): boolean {
  if (typeof createdAt !== "string") return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return t < cutoffMs;
}

/* ------------------------------------------------------------------ */
/* Clear-undo grace window — keep an in-memory snapshot of the most   */
/* recent clear so an accidental wipe can be reverted within ~60s.    */
/*                                                                     */
/* SAFETY:                                                             */
/*   - In-memory only; not persisted. A server restart loses the      */
/*     undo window (the durable archive on disk is the real backup).  */
/*   - One snapshot at a time. A second clear overwrites the first    */
/*     undo snapshot (and the older one becomes recoverable only via  */
/*     the archive file).                                              */
/*   - Restoring respects the current history cap via trimToCap.      */
/* ------------------------------------------------------------------ */

const CLEAR_UNDO_TTL_MS = 60_000;

interface ClearUndoSnapshot {
  scope: PreviewStudioClearScope;
  olderThanIso: string | null;
  states: PreviewStudioState[];
  editArtifacts: PreviewStudioEditArtifact[];
  archiveFile: string | null;
  clearedAt: number;
}

let clearUndoSnapshot: ClearUndoSnapshot | null = null;

function setClearUndoSnapshot(snap: ClearUndoSnapshot): void {
  if (snap.states.length === 0 && snap.editArtifacts.length === 0) {
    clearUndoSnapshot = null;
    return;
  }
  clearUndoSnapshot = snap;
}

function getActiveClearUndoSnapshot(): ClearUndoSnapshot | null {
  if (!clearUndoSnapshot) return null;
  if (Date.now() - clearUndoSnapshot.clearedAt >= CLEAR_UNDO_TTL_MS) {
    clearUndoSnapshot = null;
    return null;
  }
  return clearUndoSnapshot;
}

export interface PreviewStudioClearUndoStatus {
  available: boolean;
  scope: PreviewStudioClearScope | null;
  olderThanIso: string | null;
  snapshotStates: number;
  snapshotEditArtifacts: number;
  clearedAt: string | null;
  expiresAt: string | null;
  ttlMs: number;
  archiveFile: string | null;
}

export function getPreviewStudioClearUndoStatus(): PreviewStudioClearUndoStatus {
  const snap = getActiveClearUndoSnapshot();
  if (!snap) {
    return {
      available: false,
      scope: null,
      olderThanIso: null,
      snapshotStates: 0,
      snapshotEditArtifacts: 0,
      clearedAt: null,
      expiresAt: null,
      ttlMs: CLEAR_UNDO_TTL_MS,
      archiveFile: null,
    };
  }
  return {
    available: true,
    scope: snap.scope,
    olderThanIso: snap.olderThanIso,
    snapshotStates: snap.states.length,
    snapshotEditArtifacts: snap.editArtifacts.length,
    clearedAt: new Date(snap.clearedAt).toISOString(),
    expiresAt: new Date(snap.clearedAt + CLEAR_UNDO_TTL_MS).toISOString(),
    ttlMs: CLEAR_UNDO_TTL_MS,
    archiveFile: snap.archiveFile,
  };
}

export interface PreviewStudioClearUndoResult {
  scope: PreviewStudioClearScope;
  restoredStates: number;
  restoredEditArtifacts: number;
  trimmedStates: number;
  trimmedEditArtifacts: number;
  info: PreviewStudioHistoryCapInfo;
}

export function undoLastPreviewStudioClear(): PreviewStudioClearUndoResult | null {
  const snap = getActiveClearUndoSnapshot();
  if (!snap) return null;
  hydrate();
  // Merge snapshot entries back into the live arrays, deduping by id,
  // and re-sorting by createdAt so the timeline remains chronological.
  let restoredStates = 0;
  let trimmedStates = 0;
  if (snap.states.length > 0) {
    const existingIds = new Set(states.map((s) => s.id));
    const toRestore = snap.states.filter((s) => !existingIds.has(s.id));
    if (toRestore.length > 0) {
      states.push(...toRestore.map((s) => ({ ...s })));
      states.sort((a, b) => {
        const ta = Date.parse(a.createdAt ?? "");
        const tb = Date.parse(b.createdAt ?? "");
        return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
      });
      const beforeTrim = states.length;
      trimToCap(states);
      trimmedStates = beforeTrim - states.length;
      restoredStates = toRestore.length - trimmedStates;
      if (restoredStates < 0) restoredStates = 0;
      if (!latest || !states.includes(latest)) {
        latest = states[states.length - 1] ?? latest;
      }
      persistStates();
    }
  }
  let restoredArts = 0;
  let trimmedArts = 0;
  if (snap.editArtifacts.length > 0) {
    const existingIds = new Set(editArtifacts.map((a) => a.id));
    const toRestore = snap.editArtifacts.filter((a) => !existingIds.has(a.id));
    if (toRestore.length > 0) {
      editArtifacts.push(...toRestore.map((a) => ({ ...a })));
      editArtifacts.sort((a, b) => {
        const ta = Date.parse(a.createdAt ?? "");
        const tb = Date.parse(b.createdAt ?? "");
        return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
      });
      const beforeTrim = editArtifacts.length;
      trimToCap(editArtifacts);
      trimmedArts = beforeTrim - editArtifacts.length;
      restoredArts = toRestore.length - trimmedArts;
      if (restoredArts < 0) restoredArts = 0;
      persistEditArtifacts();
    }
  }
  const result: PreviewStudioClearUndoResult = {
    scope: snap.scope,
    restoredStates,
    restoredEditArtifacts: restoredArts,
    trimmedStates,
    trimmedEditArtifacts: trimmedArts,
    info: getPreviewStudioHistoryCap(),
  };
  clearUndoSnapshot = null;
  return result;
}

export function clearPreviewStudioHistory(
  scope: PreviewStudioClearScope,
  options: PreviewStudioClearOptions = {},
): PreviewStudioClearResult {
  hydrate();
  const cutoff = parseCutoff(options.olderThanIso ?? null);
  // Snapshot only the entries that will actually be removed so the
  // archive matches the clear (full clear = everything in scope;
  // filtered clear = only entries older than the cutoff).
  const willRemove = <T extends { createdAt?: string }>(arr: T[]): T[] =>
    cutoff === null
      ? arr.map((x) => ({ ...x }))
      : arr.filter((x) => entryBefore(x.createdAt, cutoff)).map((x) => ({ ...x }));
  const snapshotStates: PreviewStudioState[] =
    scope === "states" || scope === "both" ? willRemove(states) : [];
  const snapshotArtifacts: PreviewStudioEditArtifact[] =
    scope === "edit_artifacts" || scope === "both" ? willRemove(editArtifacts) : [];
  const archive = writeClearArchive(scope, snapshotStates, snapshotArtifacts);
  // Stash an in-memory undo snapshot for a short grace window so an
  // accidental clear can be reverted. Cleared on TTL or after use.
  setClearUndoSnapshot({
    scope,
    olderThanIso: cutoff === null ? null : new Date(cutoff).toISOString(),
    states: snapshotStates,
    editArtifacts: snapshotArtifacts,
    archiveFile: archive.file,
    clearedAt: Date.now(),
  });
  let clearedStates = 0;
  let clearedEditArtifacts = 0;
  if (scope === "states" || scope === "both") {
    if (cutoff === null) {
      clearedStates = states.length;
      states.length = 0;
      latest = null;
    } else {
      const before = states.length;
      const kept = states.filter((s) => !entryBefore(s.createdAt, cutoff));
      clearedStates = before - kept.length;
      states.length = 0;
      states.push(...kept);
      if (latest && !states.includes(latest)) {
        latest = states[states.length - 1] ?? null;
      }
    }
    persistStates();
  }
  if (scope === "edit_artifacts" || scope === "both") {
    if (cutoff === null) {
      clearedEditArtifacts = editArtifacts.length;
      editArtifacts.length = 0;
    } else {
      const before = editArtifacts.length;
      const kept = editArtifacts.filter((a) => !entryBefore(a.createdAt, cutoff));
      clearedEditArtifacts = before - kept.length;
      editArtifacts.length = 0;
      editArtifacts.push(...kept);
    }
    persistEditArtifacts();
  }
  return {
    scope,
    clearedStates,
    clearedEditArtifacts,
    olderThanIso: cutoff === null ? null : new Date(cutoff).toISOString(),
    info: getPreviewStudioHistoryCap(),
    archiveFile: archive.file,
    archiveByteSize: archive.byteSize,
  };
}

export function clearPreviewStudioHistoryCapOverride(): PreviewStudioHistoryCapUpdate {
  const cfg = { ...loadConfig() };
  delete cfg.historyCap;
  saveConfig(cfg);
  hydrate();
  const beforeStates = states.length;
  const beforeArts = editArtifacts.length;
  trimToCap(states);
  trimToCap(editArtifacts);
  if (latest && !states.includes(latest)) {
    latest = states[states.length - 1] ?? null;
  }
  const trimmedStates = beforeStates - states.length;
  const trimmedEditArtifacts = beforeArts - editArtifacts.length;
  if (trimmedStates > 0) persistStates();
  if (trimmedEditArtifacts > 0) persistEditArtifacts();
  return {
    info: getPreviewStudioHistoryCap(),
    trimmedStates,
    trimmedEditArtifacts,
  };
}

/* ------------------------------------------------------------------ */
/* Persistence — rehydrate on startup, save after mutations.           */
/*                                                                     */
/* SAFETY:                                                             */
/*   - We only serialize structural scene/edit metadata. publicUrl /   */
/*     signedUrl are forced to null in the safety envelope and are     */
/*     additionally re-stripped on save as a defense-in-depth measure. */
/*   - No secret, API key, or token is ever serialized — these         */
/*     structures never carry credentials in the first place.          */
/* ------------------------------------------------------------------ */

let storage: ProductionHouseStorage | null = null;
let hydrated = false;

function getStorage(): ProductionHouseStorage {
  if (!storage) storage = createDefaultStorage();
  return storage;
}

function stripUnsafeUrls<T extends Record<string, any>>(item: T): T {
  return { ...item, publicUrl: null, signedUrl: null } as T;
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const persisted = getStorage().loadAll();
    if (Array.isArray(persisted.previewStudioStates)) {
      states.push(...persisted.previewStudioStates);
      trimToCap(states);
      if (states.length > 0) latest = states[states.length - 1] ?? null;
    }
    if (Array.isArray(persisted.previewStudioEditArtifacts)) {
      editArtifacts.push(...persisted.previewStudioEditArtifacts);
      trimToCap(editArtifacts);
    }
  } catch (e) {
    console.warn(
      "[preview-studio] failed to rehydrate from storage:",
      (e as Error).message,
    );
  }
  // Prune any stale archives left from previous runs so disk usage
  // stays bounded even if the admin never opens the panel.
  try { pruneArchives(); } catch { /* best-effort */ }
}

function persistStates(): void {
  try {
    trimToCap(states);
    if (latest && !states.includes(latest)) {
      latest = states[states.length - 1] ?? null;
    }
    getStorage().saveCollection(
      "previewStudioStates",
      states.map((s) => stripUnsafeUrls(s)),
    );
  } catch (e) {
    console.warn(
      "[preview-studio] failed to persist states:",
      (e as Error).message,
    );
  }
}

function persistEditArtifacts(): void {
  try {
    trimToCap(editArtifacts);
    getStorage().saveCollection(
      "previewStudioEditArtifacts",
      editArtifacts.map((a) => stripUnsafeUrls(a)),
    );
  } catch (e) {
    console.warn(
      "[preview-studio] failed to persist edit artifacts:",
      (e as Error).message,
    );
  }
}

export function getDefaultStudioScenes(): Record<PreviewStudioMode, PreviewStudioScene> {
  const out: Partial<Record<PreviewStudioMode, PreviewStudioScene>> = {};
  for (const m of PREVIEW_STUDIO_MODES) out[m] = buildScene(defaultControlsFor(m));
  return out as Record<PreviewStudioMode, PreviewStudioScene>;
}

export function getLatestPreviewStudioState(): PreviewStudioState {
  hydrate();
  if (latest) return latest;
  const scene = buildScene(defaultControlsFor("newsroom"));
  latest = sealState(scene);
  states.push(latest);
  persistStates();
  return latest;
}

export function generatePreviewStudioState(
  partial: Partial<PreviewStudioControls> & { mode: PreviewStudioMode },
): PreviewStudioState {
  hydrate();
  const base = defaultControlsFor(partial.mode);
  const controls: PreviewStudioControls = { ...base, ...partial, mode: partial.mode };
  const scene = buildScene(controls);
  const sealed = sealState(scene);
  states.push(sealed);
  latest = sealed;
  persistStates();
  return sealed;
}

export function updatePreviewStudioControls(
  partial: Partial<PreviewStudioControls>,
): PreviewStudioState {
  const current = getLatestPreviewStudioState();
  const merged: PreviewStudioControls = {
    ...current.scene.controls,
    ...partial,
    mode: partial.mode ?? current.scene.controls.mode,
  };
  const scene = buildScene(merged);
  const sealed = sealState(scene);
  states.push(sealed);
  latest = sealed;
  persistStates();
  return sealed;
}

export function listPreviewStudioStates(): PreviewStudioState[] {
  hydrate();
  return [...states];
}

/* ------------------------------------------------------------------ */
/* Edit artifacts — admin-only image / video compose (mock + internal) */
/* ------------------------------------------------------------------ */
/*
 * These NEVER:
 *   - call a provider, open a socket, upload anything anywhere
 *   - touch ffmpeg / Unreal / 4D hardware / publishing pipelines
 *   - generate a public or signed URL
 * The "compose" is a deterministic SVG/JSON write into an admin-only
 * internal directory. The artifact carries the full safety-locked envelope.
 */

const EDIT_DIR = (() => {
  const root = process.env.PREVIEW_STUDIO_INTERNAL_DIR ??
    join(process.cwd(), ".internal", "preview-studio");
  try { mkdirSync(root, { recursive: true }); } catch { /* ignore */ }
  return root;
})();

const editArtifacts: PreviewStudioEditArtifact[] = [];

function materializeLayers(
  layers: Array<Partial<PreviewStudioEditLayer> & { label: string; kind: PreviewStudioEditLayer["kind"] }>,
): PreviewStudioEditLayer[] {
  return layers.map((l, i) => ({
    id: l.id ?? `ly_${randomUUID().slice(0, 8)}_${i}`,
    label: l.label,
    kind: l.kind,
    sourceAssetId: l.sourceAssetId ?? null,
    x: l.x ?? 0,
    y: l.y ?? 0,
    w: l.w ?? 0.2,
    h: l.h ?? 0.2,
    opacity: l.opacity ?? 1,
    text: l.text ?? "",
  }));
}

function aspectDims(aspect: "16:9" | "9:16" | "1:1" | "21:9"): { w: number; h: number } {
  if (aspect === "9:16") return { w: 720, h: 1280 };
  if (aspect === "1:1") return { w: 1080, h: 1080 };
  if (aspect === "21:9") return { w: 1680, h: 720 };
  return { w: 1280, h: 720 };
}

function renderSvg(
  layers: PreviewStudioEditLayer[],
  aspect: "16:9" | "9:16" | "1:1" | "21:9",
  label: string,
): string {
  const { w, h } = aspectDims(aspect);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`);
  parts.push(`<rect width="100%" height="100%" fill="#020617"/>`);
  for (const l of layers) {
    const x = Math.round(l.x * w);
    const y = Math.round(l.y * h);
    const lw = Math.round(l.w * w);
    const lh = Math.round(l.h * h);
    const fill = l.kind === "background" ? "#0f172a"
      : l.kind === "avatar" ? "#f59e0b"
      : l.kind === "lower_third" ? "#f43f5e"
      : l.kind === "ticker" ? "#fbbf24"
      : l.kind === "callout" ? "#22d3ee"
      : l.kind === "panel" ? "#334155"
      : "#475569";
    parts.push(`<rect x="${x}" y="${y}" width="${lw}" height="${lh}" fill="${fill}" fill-opacity="${l.opacity}" stroke="#94a3b8" stroke-opacity="0.3"/>`);
    const text = (l.text || l.label).slice(0, 60).replace(/[<>&]/g, "");
    parts.push(`<text x="${x + 8}" y="${y + 20}" font-family="sans-serif" font-size="14" fill="#e2e8f0">${text}</text>`);
  }
  parts.push(`<text x="16" y="${h - 16}" font-family="sans-serif" font-size="14" fill="#fbbf24">ADMIN PREVIEW ONLY — ${label}</text>`);
  parts.push(`</svg>`);
  return parts.join("");
}

function sealArtifact(
  kind: PreviewStudioEditArtifact["kind"],
  body: Omit<PreviewStudioEditArtifact,
    "id" | "createdAt" | "safetyEnvelope" | keyof typeof SAFETY_LOCKED | "kind">,
): PreviewStudioEditArtifact {
  return {
    id: `psv_edit_${randomUUID()}`,
    kind,
    ...body,
    ...SAFETY_LOCKED,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function composeStudioImage(input: PreviewStudioComposeImageInput): PreviewStudioEditArtifact {
  hydrate();
  const layers = materializeLayers(input.layers);
  const svg = renderSvg(layers, input.aspect, input.label);
  const id = `psv_edit_${randomUUID()}`;
  const filePath = join(EDIT_DIR, `${id}.svg`);
  try { writeFileSync(filePath, svg, "utf8"); } catch { /* ignore in test envs */ }
  const artifact = sealArtifact("image_compose", {
    label: input.label,
    sourceAssetIds: input.sourceAssetIds,
    layers,
    camera: input.camera,
    lighting: input.lighting,
    aspect: input.aspect,
    durationSec: 0,
    internalFilePath: filePath,
    mimeType: "image/svg+xml",
    byteSize: Buffer.byteLength(svg, "utf8"),
  });
  // Use the id we already wrote to disk.
  artifact.id = id;
  editArtifacts.push(artifact);
  persistEditArtifacts();
  return artifact;
}

export function composeStudioVideoClip(input: PreviewStudioComposeVideoInput): PreviewStudioEditArtifact {
  hydrate();
  const layers = materializeLayers(input.layers);
  // Mock "video clip" = deterministic JSON storyboard manifest. NEVER ffmpeg.
  const manifest = {
    kind: "video_compose_storyboard",
    label: input.label,
    aspect: input.aspect,
    durationSec: input.durationSec,
    camera: input.camera,
    lighting: input.lighting,
    layers,
    notice: "Admin preview only. Not rendered. No ffmpeg. No upload.",
  };
  const json = JSON.stringify(manifest, null, 2);
  const id = `psv_edit_${randomUUID()}`;
  const filePath = join(EDIT_DIR, `${id}.json`);
  try { writeFileSync(filePath, json, "utf8"); } catch { /* ignore */ }
  const artifact = sealArtifact("video_compose", {
    label: input.label,
    sourceAssetIds: input.sourceAssetIds,
    layers,
    camera: input.camera,
    lighting: input.lighting,
    aspect: input.aspect,
    durationSec: input.durationSec,
    internalFilePath: filePath,
    mimeType: "application/json",
    byteSize: Buffer.byteLength(json, "utf8"),
  });
  artifact.id = id;
  editArtifacts.push(artifact);
  persistEditArtifacts();
  return artifact;
}

export function listPreviewStudioEditArtifacts(): PreviewStudioEditArtifact[] {
  hydrate();
  return [...editArtifacts];
}

export function getPreviewStudioPackageExport(): {
  previewStudioStates: PreviewStudioState[];
  previewStudioEditArtifacts: PreviewStudioEditArtifact[];
  safetyEnvelope: typeof SAFETY_ENVELOPE;
} {
  hydrate();
  return {
    previewStudioStates: states.map((s) => ({ ...s })),
    previewStudioEditArtifacts: editArtifacts.map((a) => ({ ...a })),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export interface PreviewStudioTooltip {
  key: string;
  title: string;
  body: string;
}

export function getPreviewStudioTooltips(): PreviewStudioTooltip[] {
  return [
    { key: "preview_studio", title: "Preview Studio",
      body: "Admin-only mock preview. Nothing here renders or publishes." },
    { key: "production_wizard", title: "Production Wizard",
      body: "Guided steps to draft a production. Output stays internal until approved." },
    { key: "room_generator", title: "Room Generator",
      body: "Designs stage / room layouts for the preview canvas. Mock data only." },
    { key: "avatar_creator", title: "Avatar Creator",
      body: "Creates avatar markers. No real MetaHuman is built; no provider is called." },
    { key: "media_pipeline", title: "Media Pipeline",
      body: "Manages draft media packages. All assets stay internal." },
    { key: "asset_library", title: "Asset Library",
      body: "Internal-only library. No public URL / signed URL is ever created." },
    { key: "unreal_dry_run", title: "Unreal Dry-Run",
      body: "Validates a scene contract without sending any Unreal command." },
    { key: "fourd_sandbox", title: "4D Sandbox",
      body: "Plans 4D cues. No 4D hardware command is dispatched, ever." },
    { key: "publishing_disabled", title: "Publishing disabled",
      body: "Publishing is permanently disabled in this MVP. Manual root-admin override only." },
    { key: "mock_mode", title: "Mock mode",
      body: "All provider integrations are mocked. No outbound socket is opened." },
    { key: "draft_internal_only", title: "Draft / Internal only",
      body: "Every preview artifact is draft, admin-only, never public." },
  ];
}

export function _resetPreviewStudioForTests(): void {
  states.length = 0;
  latest = null;
  editArtifacts.length = 0;
  hydrated = false;
  storage = null;
  cachedConfig = null;
}

/**
 * Test helper: inject a specific storage adapter so tests can verify the
 * save/reload cycle without touching the default on-disk location.
 */
export function _setPreviewStudioStorageForTests(
  s: ProductionHouseStorage | null,
): void {
  storage = s;
  hydrated = false;
  states.length = 0;
  editArtifacts.length = 0;
  latest = null;
  cachedConfig = null;
}
