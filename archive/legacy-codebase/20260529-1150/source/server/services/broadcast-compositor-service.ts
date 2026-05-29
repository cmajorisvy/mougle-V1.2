/**
 * T6 — Broadcast Compositor v1
 *
 * Renders a finished broadcast MP4 by compositing the layers defined in
 * `client/remotion/BroadcastComposition.tsx` (background event visual,
 * anchor video, lower-third, ticker, breaking bar, source/confidence
 * panel, channel bug) into a single 1920x1080 MP4.
 *
 * SAFETY:
 *  - All outputs are written under `PRIVATE_OBJECT_DIR/broadcasts/` (or
 *    the local fallback `.local/media-assets/broadcasts/` when object
 *    storage is not configured) — never under any public prefix.
 *  - Every render is tagged `dryRun:true` in the manifest unless the
 *    explicit founder approval flag is set. There is no public
 *    publishing path, no external upload, no signed URL.
 *  - Manifest carries every source license (attribution + tier).
 *  - Rendering an unapproved package is rejected at the service entry.
 *
 * Note: this MVP uses FFmpeg drawtext/overlay to composite, matching the
 * `broadcast-style.ts` style guide. When the Remotion bundler from #13
 * is wired in, swap `renderWithFfmpeg()` for `renderWithRemotion()` —
 * the composition props are already typed the same way.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { and, eq, desc, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  broadcasts,
  broadcastPackageApprovals,
  type Broadcast,
  type InsertBroadcast,
  type BroadcastManifest,
} from "@shared/schema";

const LOCAL_FALLBACK_ROOT = resolve(process.cwd(), ".local/media-assets/broadcasts");
const SAFE_NAME_RE = /[^a-z0-9_]/g;
const RENDER_TIMEOUT_MS = 60_000;
const CANVAS_W = 1920;
const CANVAS_H = 1080;
const FPS = 30;

export class BroadcastSafetyError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface BroadcastSourceItem {
  name: string;
  url: string | null;
  license: string;
  attribution?: string | null;
  tier?: string | null;
}

export interface BroadcastRenderInput {
  packageId: string;
  brollPlanId: string | null;
  /** Absolute local path to anchor MP4 (T7 output). HTTP URLs are rejected. */
  anchorVideoUrl: string | null;
  /** Absolute local path to background still image (T4 plan output). HTTP URLs rejected. */
  backgroundImageUrl: string | null;
  backgroundAttribution: string | null;
  brandLabel: string;
  kicker: string;
  headline: string;
  speakerName: string | null;
  speakerRole: string | null;
  tickerItems: string[];
  breaking: { enabled: boolean; label: string; headline: string };
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  sources: BroadcastSourceItem[];
  durationSec: number;
  /** Optional viewer-facing title for the Live Channel. Falls back to manifest headline. */
  title?: string | null;
  /** Optional viewer-facing cover image URL for the Live Channel. Falls back to first b-roll thumbnail. */
  coverImageUrl?: string | null;
  /** Defaults to true. Only false when the explicit founder approval flag is set. */
  dryRun?: boolean;
  /** Required when dryRun=false; must be the literal value below or the render is rejected. */
  founderApprovalFlag?: string | null;
  actorId: string;
}

export interface BroadcastRenderResult {
  broadcast: Broadcast;
  mp4Path: string;
  manifestPath: string;
}

export const FOUNDER_APPROVAL_FLAG_VALUE = "FOUNDER_APPROVED_BROADCAST_PUBLISH_OK";

/**
 * Server-side approval gate. The render path NEVER trusts a client field;
 * it always consults this lookup so a non-admin caller can't bypass review.
 * Returns true only when the package has an approval row that has not been
 * revoked.
 */
export async function isPackageApproved(packageId: string): Promise<boolean> {
  if (!packageId) return false;
  const rows = await db
    .select({ packageId: broadcastPackageApprovals.packageId })
    .from(broadcastPackageApprovals)
    .where(
      and(
        eq(broadcastPackageApprovals.packageId, packageId),
        isNull(broadcastPackageApprovals.revokedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function approvePackage(packageId: string, approvedBy: string, reason: string | null): Promise<void> {
  if (!packageId) throw new BroadcastSafetyError("missing_package_id", "packageId is required");
  await db
    .insert(broadcastPackageApprovals)
    .values({ packageId, approvedBy, reason, revokedAt: null, revokedBy: null })
    .onConflictDoUpdate({
      target: broadcastPackageApprovals.packageId,
      set: { approvedBy, reason, revokedAt: null, revokedBy: null, approvedAt: new Date() },
    });
}

export async function revokePackageApproval(packageId: string, revokedBy: string): Promise<void> {
  await db
    .update(broadcastPackageApprovals)
    .set({ revokedAt: new Date(), revokedBy })
    .where(eq(broadcastPackageApprovals.packageId, packageId));
}

export async function listApprovedPackages(limit = 100) {
  return db
    .select()
    .from(broadcastPackageApprovals)
    .where(isNull(broadcastPackageApprovals.revokedAt))
    .orderBy(desc(broadcastPackageApprovals.approvedAt))
    .limit(limit);
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

/**
 * Resolves the directory broadcasts are written to.
 *
 * Production expectation: PRIVATE_OBJECT_DIR is set and mounted as a
 * writable private bucket directory; `${PRIVATE_OBJECT_DIR}/broadcasts/`
 * is the canonical home for both the MP4 and its manifest. This is the
 * only directory the admin preview route streams from (and it is
 * path-confined in `server/routes/broadcasts.ts#ensureInsidePrivateRoot`).
 *
 * Development / CI fallback: if PRIVATE_OBJECT_DIR is unset or not
 * writable (e.g. the bucket mount isn't present in this environment), we
 * fall back to the workspace-local `.local/media-assets/broadcasts/`
 * directory so render still works end-to-end. The output is **still** not
 * published, uploaded, or signed — only an authenticated root admin can
 * stream it back through the admin preview route.
 *
 * Operations runbook: ensure PRIVATE_OBJECT_DIR is set and writable in
 * production. The startup logs will warn when the fallback is used.
 */
function resolveStorageRoot(): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (envDir) {
    try {
      const root = join(envDir, "broadcasts");
      ensureDir(root);
      return root;
    } catch (err) {
      console.warn(
        `[broadcasts] PRIVATE_OBJECT_DIR not writable (${(err as Error).message}); using local fallback ${LOCAL_FALLBACK_ROOT}. ` +
          `Set PRIVATE_OBJECT_DIR to a writable bucket mount in production.`,
      );
    }
  } else {
    console.warn(
      `[broadcasts] PRIVATE_OBJECT_DIR not set; using local fallback ${LOCAL_FALLBACK_ROOT}. ` +
        `Set PRIVATE_OBJECT_DIR to a writable bucket mount in production.`,
    );
  }
  ensureDir(LOCAL_FALLBACK_ROOT);
  return LOCAL_FALLBACK_ROOT;
}

function escapeFfmpegText(s: string): string {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, " ");
}

function clean(s: string, max: number): string {
  const c = (s || "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  if (c.length <= max) return c;
  return c.slice(0, Math.max(1, max - 1)) + "…";
}

function safeFilename(packageId: string): string {
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = packageId.toLowerCase().replace(SAFE_NAME_RE, "").slice(0, 24) || "pkg";
  return `bc_${id}_${seed.replace(SAFE_NAME_RE, "").slice(0, 20)}.mp4`;
}

function buildFilterChain(input: BroadcastRenderInput, watermark: { enabled: boolean; label: string }): string {
  const filters: string[] = [];

  // Background gradient overlay tint (matches BackgroundLayer)
  filters.push(`drawbox=x=0:y=${Math.round(CANVAS_H * 0.55)}:w=iw:h=${Math.round(CANVAS_H * 0.45)}:color=black@0.45:t=fill`);

  // Channel bug (top-left red square w/ brand label) — matches ChannelBugLayer
  filters.push(`drawbox=x=32:y=120:w=96:h=96:color=0xc8102e:t=fill`);
  filters.push(
    `drawtext=text='${escapeFfmpegText(clean(input.brandLabel, 8))}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=32+(96-text_w)/2:y=120+(96-text_h)/2`,
  );

  // Breaking bar (top) — matches BreakingBarLayer
  if (input.breaking.enabled) {
    filters.push(`drawbox=x=0:y=0:w=iw:h=88:color=0xd10b1f:t=fill`);
    filters.push(
      `drawtext=text='${escapeFfmpegText(clean(input.breaking.label, 16))}':fontsize=38:fontcolor=white:borderw=2:bordercolor=black:x=32:y=24`,
    );
    filters.push(
      `drawtext=text='${escapeFfmpegText(clean(input.breaking.headline, 90))}':fontsize=32:fontcolor=white:borderw=2:bordercolor=black:x=360:y=28`,
    );
  }

  // Source / confidence panel (top-right) — SourcePanelLayer
  const panelX = CANVAS_W - 540 - 32;
  const panelY = (input.breaking.enabled ? 88 : 0) + 20;
  filters.push(
    `drawbox=x=${panelX}:y=${panelY}:w=540:h=200:color=0x0a1e3d@0.85:t=fill`,
  );
  filters.push(
    `drawtext=text='VERIFIED SOURCES · ${input.confidence.toUpperCase()} ${Math.round(input.confidenceScore * 100)}%':fontsize=22:fontcolor=white:borderw=1:bordercolor=black:x=${panelX + 16}:y=${panelY + 16}`,
  );
  const topSources = input.sources.slice(0, 3);
  topSources.forEach((s, i) => {
    filters.push(
      `drawtext=text='${i + 1}. ${escapeFfmpegText(clean(`${s.name} · ${s.license}`, 64))}':fontsize=20:fontcolor=white:borderw=1:bordercolor=black:x=${panelX + 16}:y=${panelY + 60 + i * 36}`,
    );
  });

  // Anchor placeholder frame (bottom-left)
  const anchorY = CANVAS_H - 56 - 168 - 20 - 360;
  filters.push(
    `drawbox=x=32:y=${anchorY}:w=480:h=360:color=0x03101f:t=fill`,
  );
  filters.push(
    `drawbox=x=32:y=${anchorY}:w=480:h=360:color=0x1f3a64:t=2`,
  );
  if (!input.anchorVideoUrl) {
    filters.push(
      `drawtext=text='ANCHOR FRAME (T7)':fontsize=22:fontcolor=white:borderw=1:bordercolor=black:x=32+(480-text_w)/2:y=${anchorY + 170}`,
    );
  }

  // Lower-third (above ticker) — LowerThirdLayer
  const ltY = CANVAS_H - 56 - 168;
  filters.push(
    `drawbox=x=0:y=${ltY}:w=iw:h=168:color=0x0a1e3d@0.92:t=fill`,
  );
  filters.push(
    `drawbox=x=0:y=${ltY}:w=iw:h=4:color=0xffcc00:t=fill`,
  );
  filters.push(
    `drawtext=text='${escapeFfmpegText(clean(input.kicker, 40))}':fontsize=26:fontcolor=0xffcc00:borderw=1:bordercolor=black:x=32:y=${ltY + 18}`,
  );
  filters.push(
    `drawtext=text='${escapeFfmpegText(clean(input.headline, 80))}':fontsize=56:fontcolor=white:borderw=2:bordercolor=black:x=32:y=${ltY + 54}`,
  );
  if (input.speakerName || input.speakerRole) {
    const line = `${input.speakerName ?? ""}${input.speakerName && input.speakerRole ? " · " : ""}${input.speakerRole ?? ""}`;
    filters.push(
      `drawtext=text='${escapeFfmpegText(clean(line, 60))}':fontsize=20:fontcolor=0xcdd6e4:x=32:y=${ltY + 130}`,
    );
  }

  // Ticker (bottom strip) — TickerLayer
  filters.push(
    `drawbox=x=0:y=${CANVAS_H - 56}:w=iw:h=56:color=0x0a1e3d:t=fill`,
  );
  filters.push(
    `drawbox=x=0:y=${CANVAS_H - 56}:w=160:h=56:color=0xc8102e:t=fill`,
  );
  filters.push(
    `drawtext=text='LIVE':fontsize=26:fontcolor=white:borderw=2:bordercolor=black:x=(160-text_w)/2:y=${CANVAS_H - 44}`,
  );
  const tickerText = clean(input.tickerItems.join("   •   "), 200);
  if (tickerText) {
    filters.push(
      `drawtext=text='${escapeFfmpegText(tickerText)}':fontsize=26:fontcolor=white:borderw=1:bordercolor=black:x=180:y=${CANVAS_H - 44}`,
    );
  }

  // Internal preview watermark
  if (watermark.enabled) {
    filters.push(
      `drawtext=text='${escapeFfmpegText(clean(watermark.label, 32))}':fontsize=20:fontcolor=0xfacc15:borderw=2:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=6:x=w-text_w-32:y=h-text_h-100`,
    );
  }

  return filters.join(",");
}

function runFfmpeg(args: string[]): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill("SIGKILL"); } catch { /* noop */ }
      reject(new Error(`ffmpeg_timeout_${RENDER_TIMEOUT_MS}ms`));
    }, RENDER_TIMEOUT_MS);
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode: code ?? -1, stderr: stderr.slice(-800) });
    });
  });
}

function validateLocalMediaPath(label: string, p: string | null): void {
  if (!p) return;
  if (/^https?:\/\//i.test(p) || /^file:\/\//i.test(p)) {
    throw new BroadcastSafetyError(
      "remote_media_rejected",
      `${label} must be a local file path, not a remote URL. Stage upstream output under PRIVATE_OBJECT_DIR first.`,
      400,
    );
  }
  if (p.includes("..")) {
    throw new BroadcastSafetyError("invalid_media_path", `${label} contains '..'`);
  }
  if (!existsSync(p)) {
    throw new BroadcastSafetyError("media_not_found", `${label} not found on disk: ${p}`);
  }
}

async function validateInput(input: BroadcastRenderInput): Promise<void> {
  if (!input.packageId) throw new BroadcastSafetyError("missing_package_id", "packageId is required");
  // Server-side approval gate. Never trust a client-supplied field — always
  // consult the approvals registry written only by root admins.
  const approved = await isPackageApproved(input.packageId);
  if (!approved) {
    throw new BroadcastSafetyError(
      "package_not_approved",
      "Refusing to render: source package has no active approval in broadcast_package_approvals.",
      403,
    );
  }
  validateLocalMediaPath("backgroundImageUrl", input.backgroundImageUrl);
  validateLocalMediaPath("anchorVideoUrl", input.anchorVideoUrl);
  const wantsLive = input.dryRun === false;
  if (wantsLive && input.founderApprovalFlag !== FOUNDER_APPROVAL_FLAG_VALUE) {
    throw new BroadcastSafetyError(
      "founder_approval_required",
      "Non-dry-run renders require the explicit founder approval flag.",
      403,
    );
  }
  if (!Number.isFinite(input.durationSec) || input.durationSec < 2 || input.durationSec > 120) {
    throw new BroadcastSafetyError("invalid_duration", "durationSec must be between 2 and 120");
  }
  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    throw new BroadcastSafetyError(
      "missing_sources",
      "At least one source attribution is required for the manifest.",
    );
  }
  for (const s of input.sources) {
    if (!s.name || !s.license) {
      throw new BroadcastSafetyError(
        "incomplete_source_attribution",
        `Source "${s.name || "?"}" missing license metadata.`,
      );
    }
  }
}

export function buildManifest(input: BroadcastRenderInput, mp4Filename: string, dryRun: boolean): BroadcastManifest {
  return {
    schemaVersion: 1,
    packageId: input.packageId,
    brollPlanId: input.brollPlanId,
    anchorVideoUrl: input.anchorVideoUrl,
    mp4Filename,
    dryRun,
    generatedAt: new Date().toISOString(),
    generatedBy: input.actorId,
    canvas: { width: CANVAS_W, height: CANVAS_H, fps: FPS, durationSec: input.durationSec },
    layers: [
      "background",
      "anchor",
      "source-panel",
      "channel-bug",
      "lower-third",
      "ticker",
      ...(input.breaking.enabled ? ["breaking-bar" as const] : []),
      "watermark",
    ],
    headline: input.headline,
    kicker: input.kicker,
    confidence: { level: input.confidence, score: input.confidenceScore },
    sources: input.sources.map((s) => ({
      name: s.name,
      url: s.url ?? null,
      license: s.license,
      attribution: s.attribution ?? null,
      tier: s.tier ?? null,
    })),
    safety: {
      publicPublishing: false,
      youtubeUpload: false,
      socialPosting: false,
      externalUpload: false,
      requiresFounderApprovalForLive: true,
    },
  };
}

/**
 * Render a broadcast MP4 by compositing all configured layers.
 * Persists the MP4 + JSON manifest under PRIVATE_OBJECT_DIR/broadcasts/.
 * When `backgroundImageUrl` and/or `anchorVideoUrl` are provided (as local
 * paths) they are scaled and overlaid into the final composition.
 */
export async function renderBroadcast(input: BroadcastRenderInput): Promise<BroadcastRenderResult> {
  await validateInput(input);
  const dryRun = input.dryRun !== false;

  // T10 cost gate: full broadcast render is treated as a cost-bearing op.
  // Caps + the global pause switch are enforced even in dry-run so the
  // founder can stop *all* render work with a single flag flip.
  const { canSpend: costCanSpend } = await import("./cost-control-service");
  const gate = await costCanSpend({
    kind: "broadcast_full",
    estUsd: 0.25,
    metadata: { packageId: input.packageId, dryRun },
  });
  if (!gate.allowed) {
    throw new BroadcastSafetyError(
      "cost_blocked",
      `Cost control refused broadcast render: ${gate.reasons.join(", ")}`,
      403,
    );
  }

  const root = resolveStorageRoot();
  const filename = safeFilename(input.packageId);
  const mp4Path = resolve(root, filename);
  const manifestPath = resolve(root, filename.replace(/\.mp4$/, ".manifest.json"));

  const watermark = { enabled: true, label: dryRun ? "DRY RUN · INTERNAL PREVIEW" : "PENDING PUBLISH APPROVAL" };
  const drawChain = buildFilterChain(input, watermark);
  const anchorY = CANVAS_H - 56 - 168 - 20 - 360;

  // Build a multi-input filter_complex graph so the real background image
  // and anchor video are baked into the output (not placeholder boxes).
  const inputs: string[] = [
    "-f", "lavfi",
    "-i", `color=c=0x03101f:s=${CANVAS_W}x${CANVAS_H}:d=${input.durationSec}:r=${FPS}`,
  ];
  const graphSteps: string[] = [];
  let baseLabel = "[0:v]";
  let nextIdx = 1;

  if (input.backgroundImageUrl) {
    inputs.push("-loop", "1", "-t", String(input.durationSec), "-i", input.backgroundImageUrl);
    const bgIdx = nextIdx++;
    graphSteps.push(
      `[${bgIdx}:v]scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase,crop=${CANVAS_W}:${CANVAS_H},setsar=1,format=yuv420p[bgimg]`,
    );
    graphSteps.push(`${baseLabel}[bgimg]overlay=0:0[bg${bgIdx}]`);
    baseLabel = `[bg${bgIdx}]`;
  }

  if (input.anchorVideoUrl) {
    inputs.push("-i", input.anchorVideoUrl);
    const aIdx = nextIdx++;
    graphSteps.push(
      `[${aIdx}:v]scale=480:360:force_original_aspect_ratio=increase,crop=480:360,setsar=1[anchorv]`,
    );
    graphSteps.push(`${baseLabel}[anchorv]overlay=32:${anchorY}[withanchor]`);
    baseLabel = "[withanchor]";
  }

  // Apply the draw chain to whatever base we ended up with.
  graphSteps.push(`${baseLabel}${drawChain},format=yuv420p[out]`);

  const filterComplex = graphSteps.join(";");

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-t", String(input.durationSec),
    mp4Path,
  ];

  const r = await runFfmpeg(args);
  if (r.exitCode !== 0 || !existsSync(mp4Path) || statSync(mp4Path).size === 0) {
    throw new BroadcastSafetyError(
      "ffmpeg_failed",
      `ffmpeg exit=${r.exitCode} tail=${r.stderr.slice(-200)}`,
      500,
    );
  }

  const manifest = buildManifest(input, filename, dryRun);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const titleRaw = typeof input.title === "string" ? input.title.trim() : "";
  const coverRaw = typeof input.coverImageUrl === "string" ? input.coverImageUrl.trim() : "";
  const insert: InsertBroadcast = {
    packageId: input.packageId,
    brollPlanId: input.brollPlanId,
    anchorVideoUrl: input.anchorVideoUrl,
    mp4Path,
    manifestPath,
    manifestJson: manifest,
    status: "rendered",
    dryRun,
    title: titleRaw ? titleRaw.slice(0, 200) : null,
    coverImageUrl: coverRaw ? coverRaw.slice(0, 1024) : null,
    createdBy: input.actorId,
  };
  const [row] = await db.insert(broadcasts).values(insert).returning();
  return { broadcast: row, mp4Path, manifestPath };
}

export async function listBroadcasts(limit = 50): Promise<Broadcast[]> {
  return db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).limit(limit);
}

export async function getBroadcast(id: string): Promise<Broadcast | null> {
  const rows = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteBroadcast(id: string): Promise<Broadcast | null> {
  const [row] = await db.delete(broadcasts).where(eq(broadcasts.id, id)).returning();
  return row ?? null;
}

export async function listBroadcastIds(): Promise<string[]> {
  const rows = await db.select({ id: broadcasts.id }).from(broadcasts);
  return rows.map((r) => r.id);
}

/**
 * Returns the canonical directory broadcast MP4s + manifests live in.
 * Exposed so the admin media-sweep route can enumerate files in the
 * exact same root the renderer writes to.
 */
export function getBroadcastStorageRoot(): string {
  return resolveStorageRoot();
}

/**
 * Returns the set of file basenames currently referenced by the
 * `broadcasts` table — both the mp4 and the manifest. Used by the
 * media-sweep route to detect orphans on disk.
 */
export async function listBroadcastMediaBasenames(): Promise<{
  mp4: Set<string>;
  manifest: Set<string>;
}> {
  const rows = await db
    .select({ mp4Path: broadcasts.mp4Path, manifestPath: broadcasts.manifestPath })
    .from(broadcasts);
  const mp4 = new Set<string>();
  const manifest = new Set<string>();
  for (const r of rows) {
    if (r.mp4Path) mp4.add(r.mp4Path.split("/").pop() || "");
    if (r.manifestPath) manifest.add(r.manifestPath.split("/").pop() || "");
  }
  mp4.delete("");
  manifest.delete("");
  return { mp4, manifest };
}

export async function updateBroadcastMeta(
  id: string,
  patch: { title?: string | null; coverImageUrl?: string | null },
): Promise<Broadcast | null> {
  const updates: Partial<InsertBroadcast> = {};
  if (patch.title !== undefined) {
    const t = (patch.title ?? "").trim();
    updates.title = t ? t.slice(0, 200) : null;
  }
  if (patch.coverImageUrl !== undefined) {
    const c = (patch.coverImageUrl ?? "").trim();
    updates.coverImageUrl = c ? c.slice(0, 1024) : null;
  }
  if (Object.keys(updates).length === 0) return getBroadcast(id);
  const [row] = await db
    .update(broadcasts)
    .set(updates)
    .where(eq(broadcasts.id, id))
    .returning();
  return row ?? null;
}

export const broadcastCompositorService = {
  renderBroadcast,
  listBroadcasts,
  listBroadcastIds,
  getBroadcastStorageRoot,
  listBroadcastMediaBasenames,
  getBroadcast,
  deleteBroadcast,
  updateBroadcastMeta,
  buildManifest,
  isPackageApproved,
  approvePackage,
  revokePackageApproval,
  listApprovedPackages,
  FOUNDER_APPROVAL_FLAG_VALUE,
};
