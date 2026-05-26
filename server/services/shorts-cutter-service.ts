/**
 * T9 — Shorts Cutter (approval-gated).
 *
 * Ingests an approved broadcast id and emits N short clip variants
 * (9:16 30s / 9:16 60s / 1:1 30s by default), each with:
 *   - cropped MP4 clip under PRIVATE_OBJECT_DIR/shorts/
 *   - AI-generated caption (strict JSON)
 *   - first-frame thumbnail (PNG)
 *   - suggested hashtags + suggested post time
 *
 * SAFETY (hard guarantees):
 *  - Refuses to run on a broadcast that is not in the approvals registry.
 *  - All outputs land in `social_drafts` with status='draft', approved=false.
 *  - Approval flips approved=true; it does NOT post to any external platform.
 *  - No external upload code paths (no youtube/tiktok/reels SDKs imported,
 *    no upload URLs constructed). Verified by tests/safety/shorts.test.ts.
 *  - Local file paths only (no SSRF). Outputs never exposed publicly —
 *    only streamed through the admin route to a root admin.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync, readSync, openSync, closeSync, readdirSync } from "node:fs";
import { basename, resolve, join, sep } from "node:path";
import { generateImageBuffer } from "../replit_integrations/image/client";
import { and, desc, eq, inArray, isNull, not } from "drizzle-orm";
import OpenAI from "openai";
import { db } from "../db";
import { AI_MODELS } from "../config/ai-models";
import {
  broadcastPackageApprovals,
  broadcasts,
  socialDrafts,
  SOCIAL_DRAFT_ASPECT_RATIOS,
  SOCIAL_DRAFT_PLATFORMS,
  type Broadcast,
  type SocialDraft,
  type SocialDraftAspectRatio,
  type SocialDraftPlatform,
} from "@shared/schema";
import { SHORT_DIMENSIONS } from "../../client/remotion/ShortComposition";

const LOCAL_FALLBACK_ROOT = resolve(process.cwd(), ".local/media-assets/shorts");
const FFMPEG_TIMEOUT_MS = 60_000;
const SAFE_NAME_RE = /[^a-z0-9_]/g;
const MAX_CAPTION_LEN = 220;
const MAX_HASHTAGS = 8;

export class ShortsSafetyError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface ShortVariantSpec {
  platform: SocialDraftPlatform;
  aspectRatio: SocialDraftAspectRatio;
  durationSec: number;
}

export const DEFAULT_VARIANTS: ShortVariantSpec[] = [
  { platform: "youtube_shorts", aspectRatio: "9:16", durationSec: 30 },
  { platform: "instagram_reels", aspectRatio: "9:16", durationSec: 60 },
  { platform: "tiktok", aspectRatio: "1:1", durationSec: 30 },
];

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function resolveStorageRoot(): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (envDir) {
    try {
      const root = join(envDir, "shorts");
      ensureDir(root);
      return root;
    } catch (err) {
      console.warn(
        `[shorts] PRIVATE_OBJECT_DIR not writable (${(err as Error).message}); using local fallback ${LOCAL_FALLBACK_ROOT}.`,
      );
    }
  }
  ensureDir(LOCAL_FALLBACK_ROOT);
  return LOCAL_FALLBACK_ROOT;
}

function safeStem(broadcastId: string, platform: string, idx: number): string {
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const id = broadcastId.toLowerCase().replace(SAFE_NAME_RE, "").slice(0, 16) || "bc";
  const p = platform.toLowerCase().replace(SAFE_NAME_RE, "").slice(0, 12) || "plat";
  return `sh_${id}_${p}_${idx}_${seed.replace(SAFE_NAME_RE, "")}`;
}

function isLocalPath(p: string): boolean {
  if (!p) return false;
  if (/^https?:\/\//i.test(p) || /^file:\/\//i.test(p)) return false;
  if (p.includes("..")) return false;
  return existsSync(p);
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
      reject(new Error(`ffmpeg_timeout_${FFMPEG_TIMEOUT_MS}ms`));
    }, FFMPEG_TIMEOUT_MS);
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

async function cropToVertical(sourceMp4: string, outPath: string, aspect: SocialDraftAspectRatio, durationSec: number): Promise<void> {
  const dims = SHORT_DIMENSIONS[aspect];
  // Scale the 1920x1080 source so it fills the target frame, then crop centered.
  // Same math as ShortComposition.computeCropRect, run through ffmpeg.
  const filter = [
    `scale=${dims.width * 2}:${dims.height * 2}:force_original_aspect_ratio=increase`,
    `crop=${dims.width}:${dims.height}`,
    `setsar=1`,
    `format=yuv420p`,
  ].join(",");
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", sourceMp4,
    "-t", String(durationSec),
    "-vf", filter,
    "-an",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outPath,
  ];
  const r = await runFfmpeg(args);
  if (r.exitCode !== 0 || !existsSync(outPath) || statSync(outPath).size === 0) {
    throw new ShortsSafetyError("ffmpeg_crop_failed", `ffmpeg exit=${r.exitCode} tail=${r.stderr.slice(-200)}`, 500);
  }
}

async function extractFirstFrame(sourceMp4: string, outPath: string): Promise<void> {
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", sourceMp4,
    "-frames:v", "1",
    "-q:v", "3",
    outPath,
  ];
  const r = await runFfmpeg(args);
  if (r.exitCode !== 0 || !existsSync(outPath) || statSync(outPath).size === 0) {
    throw new ShortsSafetyError("ffmpeg_thumb_failed", `ffmpeg exit=${r.exitCode} tail=${r.stderr.slice(-200)}`, 500);
  }
}

async function extractFrameAt(sourceMp4: string, outPath: string, atSec: number): Promise<void> {
  // -ss before -i: fast seek (keyframe-accurate). Good enough for thumbnails.
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(Math.max(0, atSec)),
    "-i", sourceMp4,
    "-frames:v", "1",
    "-q:v", "3",
    outPath,
  ];
  const r = await runFfmpeg(args);
  if (r.exitCode !== 0 || !existsSync(outPath) || statSync(outPath).size === 0) {
    throw new ShortsSafetyError("ffmpeg_thumb_failed", `ffmpeg exit=${r.exitCode} tail=${r.stderr.slice(-200)}`, 500);
  }
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

function sanitizeHashtag(raw: string): string | null {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 30);
  if (!cleaned) return null;
  return `#${cleaned}`;
}

function fallbackCaption(broadcast: Broadcast, platform: SocialDraftPlatform): { caption: string; hashtags: string[] } {
  const m = broadcast.manifestJson;
  const headline = (m.headline || "Mougle broadcast").slice(0, 140);
  const kicker = (m.kicker || "NEWS").slice(0, 24);
  const sources = (m.sources || []).slice(0, 2).map((s) => s.name).filter(Boolean).join(" · ");
  const tagBase = platform === "tiktok" ? "FYP" : platform === "instagram_reels" ? "Reels" : "Shorts";
  const caption = `${kicker}: ${headline}${sources ? ` — sources: ${sources}` : ""}`.slice(0, MAX_CAPTION_LEN);
  return {
    caption,
    hashtags: ["#Mougle", "#News", "#AI", `#${tagBase}`],
  };
}

async function generateCaption(broadcast: Broadcast, variant: ShortVariantSpec): Promise<{ caption: string; hashtags: string[] }> {
  const client = getOpenAIClient();
  if (!client) return fallbackCaption(broadcast, variant.platform);
  const m = broadcast.manifestJson;
  const prompt = [
    `You write short social captions for a verified-news platform. Platform: ${variant.platform}.`,
    `Aspect ratio: ${variant.aspectRatio}. Length cap: ${MAX_CAPTION_LEN} chars.`,
    `Headline: ${m.headline}`,
    `Kicker: ${m.kicker}`,
    `Confidence: ${m.confidence?.level} (${Math.round((m.confidence?.score ?? 0) * 100)}%).`,
    `Top sources: ${(m.sources || []).slice(0, 3).map((s) => s.name).join(", ")}.`,
    `Respond as strict JSON: {"caption": string, "hashtags": string[]} where hashtags has 3-${MAX_HASHTAGS} short tags without spaces.`,
  ].join("\n");
  try {
    const resp = await client.chat.completions.create({
      model: AI_MODELS.PRIMARY,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You produce concise, factual, non-clickbait social captions. Output strict JSON only." },
        { role: "user", content: prompt },
      ],
    });
    const text = resp.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    const caption = typeof parsed.caption === "string" ? parsed.caption.slice(0, MAX_CAPTION_LEN) : "";
    const rawTags: unknown = parsed.hashtags;
    const hashtags = Array.isArray(rawTags)
      ? rawTags.map((t) => sanitizeHashtag(String(t))).filter((t): t is string => !!t).slice(0, MAX_HASHTAGS)
      : [];
    if (!caption) return fallbackCaption(broadcast, variant.platform);
    return { caption, hashtags: hashtags.length ? hashtags : fallbackCaption(broadcast, variant.platform).hashtags };
  } catch (err) {
    console.warn(`[shorts] caption generation failed; using fallback: ${(err as Error).message}`);
    return fallbackCaption(broadcast, variant.platform);
  }
}

function suggestedPostAt(platform: SocialDraftPlatform): Date {
  // Coarse scheduling heuristic. Local-only; nothing is actually posted.
  const now = new Date();
  const offsetHours = platform === "tiktok" ? 4 : platform === "instagram_reels" ? 6 : 8;
  return new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
}

async function loadApprovedBroadcast(broadcastId: string): Promise<Broadcast> {
  const rows = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.id, broadcastId))
    .limit(1);
  const broadcast = rows[0];
  if (!broadcast) {
    throw new ShortsSafetyError("broadcast_not_found", `Broadcast ${broadcastId} not found`, 404);
  }
  const approval = await db
    .select({ packageId: broadcastPackageApprovals.packageId })
    .from(broadcastPackageApprovals)
    .where(
      and(
        eq(broadcastPackageApprovals.packageId, broadcast.packageId),
        isNull(broadcastPackageApprovals.revokedAt),
      ),
    )
    .limit(1);
  if (approval.length === 0) {
    throw new ShortsSafetyError(
      "broadcast_not_approved",
      "Refusing to cut shorts: parent broadcast has no active package approval.",
      403,
    );
  }
  if (!isLocalPath(broadcast.mp4Path)) {
    throw new ShortsSafetyError(
      "broadcast_mp4_missing",
      `Broadcast MP4 is missing or not a local file path: ${broadcast.mp4Path}`,
      410,
    );
  }
  return broadcast;
}

export interface CutShortsOptions {
  variants?: ShortVariantSpec[];
  actorId: string;
}

export async function cutShortsForBroadcast(broadcastId: string, opts: CutShortsOptions): Promise<SocialDraft[]> {
  const broadcast = await loadApprovedBroadcast(broadcastId);
  // T10 cost gate — shorts cutting runs ffmpeg + an OpenAI caption call.
  const { canSpend: costCanSpend } = await import("./cost-control-service");
  const gate = await costCanSpend({
    kind: "shorts_cut",
    broadcastId,
    estUsd: 0.1,
    metadata: { variantCount: opts.variants?.length ?? DEFAULT_VARIANTS.length },
  });
  if (!gate.allowed) {
    throw new ShortsSafetyError("cost_blocked", `Cost control refused shorts cut: ${gate.reasons.join(", ")}`, 403);
  }
  const root = resolveStorageRoot();
  const variants = opts.variants && opts.variants.length > 0 ? opts.variants : DEFAULT_VARIANTS;

  const priorDrafts = await db
    .select({
      id: socialDrafts.id,
      platform: socialDrafts.platform,
      aspectRatio: socialDrafts.aspectRatio,
    })
    .from(socialDrafts)
    .where(
      and(
        eq(socialDrafts.broadcastId, broadcast.id),
        eq(socialDrafts.status, "draft"),
      ),
    );

  const results: SocialDraft[] = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    if (!SOCIAL_DRAFT_PLATFORMS.includes(v.platform)) {
      throw new ShortsSafetyError("invalid_platform", `Unknown platform: ${v.platform}`);
    }
    if (!SOCIAL_DRAFT_ASPECT_RATIOS.includes(v.aspectRatio)) {
      throw new ShortsSafetyError("invalid_aspect_ratio", `Unknown aspect ratio: ${v.aspectRatio}`);
    }
    if (v.durationSec < 5 || v.durationSec > 90) {
      throw new ShortsSafetyError("invalid_duration", "durationSec must be between 5 and 90");
    }
    const stem = safeStem(broadcastId, v.platform, i);
    const clipPath = resolve(root, `${stem}.mp4`);
    const thumbPath = resolve(root, `${stem}.thumb.png`);

    await cropToVertical(broadcast.mp4Path, clipPath, v.aspectRatio, v.durationSec);
    await extractFirstFrame(clipPath, thumbPath);

    const { caption, hashtags } = await generateCaption(broadcast, v);

    const [row] = await db
      .insert(socialDrafts)
      .values({
        broadcastId: broadcast.id,
        platform: v.platform,
        aspectRatio: v.aspectRatio,
        durationSec: v.durationSec,
        clipPath,
        caption,
        thumbnailPath: thumbPath,
        hashtags,
        suggestedPostAt: suggestedPostAt(v.platform),
        status: "draft",
      })
      .returning();
    results.push(row);
    void opts.actorId;
  }

  const newIds = new Set(results.map((r) => r.id));
  const variantKeys = new Set(variants.map((v) => `${v.platform}|${v.aspectRatio}`));
  const toRetire = priorDrafts.filter(
    (p) => !newIds.has(p.id) && variantKeys.has(`${p.platform}|${p.aspectRatio}`),
  );
  for (const prior of toRetire) {
    try {
      await discardShort(prior.id);
    } catch (err) {
      console.warn(
        `[shorts] failed to auto-retire prior draft ${prior.id}: ${(err as Error).message}`,
      );
    }
  }

  return results;
}

export async function listShorts(opts: { broadcastId?: string; status?: string; limit?: number } = {}): Promise<SocialDraft[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const whereParts = [] as Array<ReturnType<typeof eq>>;
  if (opts.broadcastId) whereParts.push(eq(socialDrafts.broadcastId, opts.broadcastId));
  if (opts.status) whereParts.push(eq(socialDrafts.status, opts.status));
  const baseQuery = db.select().from(socialDrafts);
  const filtered = whereParts.length === 1
    ? baseQuery.where(whereParts[0])
    : whereParts.length > 1
      ? baseQuery.where(and(...whereParts))
      : baseQuery;
  return filtered.orderBy(desc(socialDrafts.createdAt)).limit(limit);
}

export async function getShort(id: string): Promise<SocialDraft | null> {
  const rows = await db.select().from(socialDrafts).where(eq(socialDrafts.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface UpdateShortInput {
  caption?: string;
  hashtags?: string[];
  thumbnailPath?: string | null;
  clipPath?: string;
  suggestedPostAt?: Date | null;
  lastCropRect?: {
    nx: number;
    ny: number;
    nw: number;
    nh: number;
    sourceWidth: number;
    sourceHeight: number;
  } | null;
}

export async function updateShort(id: string, input: UpdateShortInput): Promise<SocialDraft> {
  const existing = await getShort(id);
  if (!existing) throw new ShortsSafetyError("not_found", "Draft not found", 404);
  if (existing.status === "approved") {
    throw new ShortsSafetyError("already_approved", "Approved drafts are locked from edits.", 409);
  }
  const patch: Record<string, unknown> = {};
  if (typeof input.caption === "string") patch.caption = input.caption.slice(0, MAX_CAPTION_LEN);
  if (Array.isArray(input.hashtags)) {
    patch.hashtags = input.hashtags
      .map((t) => sanitizeHashtag(String(t)))
      .filter((t): t is string => !!t)
      .slice(0, MAX_HASHTAGS);
  }
  let priorThumbnailPath: string | null = null;
  if (input.thumbnailPath !== undefined) {
    if (input.thumbnailPath && !isLocalPath(input.thumbnailPath)) {
      throw new ShortsSafetyError("invalid_thumbnail_path", "thumbnailPath must be a local file that exists");
    }
    patch.thumbnailPath = input.thumbnailPath;
    if (existing.thumbnailPath && existing.thumbnailPath !== input.thumbnailPath) {
      priorThumbnailPath = existing.thumbnailPath;
    }
  }
  let priorClipPath: string | null = null;
  if (input.clipPath !== undefined) {
    if (!input.clipPath || !isLocalPath(input.clipPath)) {
      throw new ShortsSafetyError("invalid_clip_path", "clipPath must be a local file that exists");
    }
    patch.clipPath = input.clipPath;
    if (existing.clipPath && existing.clipPath !== input.clipPath) {
      priorClipPath = existing.clipPath;
    }
  }
  if (input.suggestedPostAt !== undefined) patch.suggestedPostAt = input.suggestedPostAt;
  if (input.lastCropRect !== undefined) {
    const r = input.lastCropRect;
    if (r === null) {
      patch.lastCropRect = null;
    } else if (
      r &&
      typeof r === "object" &&
      [r.nx, r.ny, r.nw, r.nh, r.sourceWidth, r.sourceHeight].every(
        (n) => typeof n === "number" && Number.isFinite(n),
      ) &&
      r.nw > 0 && r.nh > 0 &&
      r.sourceWidth > 0 && r.sourceHeight > 0
    ) {
      patch.lastCropRect = {
        nx: r.nx,
        ny: r.ny,
        nw: r.nw,
        nh: r.nh,
        sourceWidth: r.sourceWidth,
        sourceHeight: r.sourceHeight,
      };
    } else {
      throw new ShortsSafetyError("invalid_last_crop_rect", "lastCropRect is malformed");
    }
  }
  if (Object.keys(patch).length === 0) return existing;
  const [row] = await db.update(socialDrafts).set(patch).where(eq(socialDrafts.id, id)).returning();
  if (priorThumbnailPath) {
    await cleanupReplacedShortsFile(priorThumbnailPath, id, "thumbnailPath");
  }
  if (priorClipPath) {
    await cleanupReplacedShortsFile(priorClipPath, id, "clipPath");
  }
  return row;
}

/**
 * Best-effort cleanup of a thumbnail or clip file that was just replaced on a
 * draft (or freed when the draft was discarded). Only unlinks if the file
 * lives inside the shorts private root AND no other social_drafts row still
 * references it via the same column. Never throws — failures are logged.
 */
async function cleanupReplacedShortsFile(
  priorPath: string,
  ownerDraftId: string,
  column: "thumbnailPath" | "clipPath",
): Promise<void> {
  try {
    if (!priorPath) return;
    const root = resolveStorageRoot();
    const rootWithSep = root.endsWith(sep) ? root : root + sep;
    const resolvedPrior = resolve(priorPath);
    if (resolvedPrior !== root && !resolvedPrior.startsWith(rootWithSep)) {
      return;
    }
    if (!existsSync(resolvedPrior)) return;
    const col = column === "thumbnailPath" ? socialDrafts.thumbnailPath : socialDrafts.clipPath;
    const stillReferenced = await db
      .select({ id: socialDrafts.id })
      .from(socialDrafts)
      .where(and(eq(col, priorPath), not(eq(socialDrafts.id, ownerDraftId))))
      .limit(1);
    if (stillReferenced.length > 0) return;
    unlinkSync(resolvedPrior);
  } catch (err) {
    console.warn(
      `[shorts] failed to unlink replaced ${column} ${priorPath}: ${(err as Error).message}`,
    );
  }
}

/**
 * Approval ONLY flips the approved flag and status to 'approved'.
 * It does NOT post to any external platform. It does NOT generate an
 * upload URL. There is no posting code path in this service.
 */
export async function approveShort(id: string, approvedBy: string): Promise<SocialDraft> {
  const existing = await getShort(id);
  if (!existing) throw new ShortsSafetyError("not_found", "Draft not found", 404);
  if (existing.status === "discarded") {
    throw new ShortsSafetyError("draft_discarded", "Cannot approve a discarded draft.", 409);
  }
  const [row] = await db
    .update(socialDrafts)
    .set({ approved: true, approvedBy, approvedAt: new Date(), status: "approved" })
    .where(eq(socialDrafts.id, id))
    .returning();
  return row;
}

/**
 * Stage a new thumbnail file by snapshotting the given second of the draft's
 * clip. Returns the absolute path of the staged PNG. Does NOT persist the
 * change — callers must apply it via `updateShort(id, { thumbnailPath })`
 * so the swap goes through the same PATCH contract the route exposes.
 */
export async function stageThumbnailFromFrame(id: string, atSec: number): Promise<{ thumbnailPath: string }> {
  if (!Number.isFinite(atSec) || atSec < 0) {
    throw new ShortsSafetyError("invalid_at_sec", "atSec must be a non-negative number");
  }
  const existing = await getShort(id);
  if (!existing) throw new ShortsSafetyError("not_found", "Draft not found", 404);
  if (existing.status !== "draft") {
    throw new ShortsSafetyError(
      "not_draft",
      `Thumbnail can only be regenerated while status='draft' (current: ${existing.status}).`,
      409,
    );
  }
  if (atSec > existing.durationSec) {
    throw new ShortsSafetyError("at_sec_out_of_range", `atSec exceeds clip duration (${existing.durationSec}s)`);
  }
  if (!isLocalPath(existing.clipPath)) {
    throw new ShortsSafetyError("clip_missing", "Clip file is missing or not local", 410);
  }
  const root = resolveStorageRoot();
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.replace(SAFE_NAME_RE, "");
  const outPath = resolve(root, `sh_${id.replace(SAFE_NAME_RE, "").slice(0, 16)}_frame_${seed}.png`);
  await extractFrameAt(existing.clipPath, outPath, atSec);
  return { thumbnailPath: outPath };
}

async function assertAiThumbnailSpendAllowed(draftId: string): Promise<void> {
  const draft = await getShort(draftId);
  const { canSpend: costCanSpend } = await import("./cost-control-service");
  const gate = await costCanSpend({
    kind: "ai_thumbnail",
    broadcastId: draft?.broadcastId ?? null,
    estUsd: 0.04,
    metadata: { draftId },
  });
  if (!gate.allowed) {
    throw new ShortsSafetyError(
      "cost_blocked",
      `Cost control refused AI thumbnail: ${gate.reasons.join(", ")}`,
      403,
    );
  }
}

/**
 * Stage a new AI-generated thumbnail file. Returns the staged PNG's absolute
 * path. Same contract as `stageThumbnailFromFrame` — persistence is done by
 * the caller through `updateShort`/PATCH so the row update path stays unified.
 */
export async function stageAiThumbnail(id: string): Promise<{ thumbnailPath: string }> {
  const existing = await getShort(id);
  if (!existing) throw new ShortsSafetyError("not_found", "Draft not found", 404);
  if (existing.status !== "draft") {
    throw new ShortsSafetyError(
      "not_draft",
      `AI thumbnail can only be generated while status='draft' (current: ${existing.status}).`,
      409,
    );
  }
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    throw new ShortsSafetyError("ai_unavailable", "OpenAI image API not configured", 503);
  }
  await assertAiThumbnailSpendAllowed(id);
  const [broadcast] = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.id, existing.broadcastId))
    .limit(1);
  const m = broadcast?.manifestJson;
  const headline = (m?.headline || existing.caption || "Mougle news short").slice(0, 200);
  const kicker = (m?.kicker || "NEWS").slice(0, 40);
  const prompt = [
    `A bold, editorial-style still thumbnail for a short news video.`,
    `Topic kicker: ${kicker}.`,
    `Headline: ${headline}.`,
    `Style: high-contrast, modern broadcast graphic, no readable text, no logos, no watermarks, no faces of real people.`,
    `Composition suited to a ${existing.aspectRatio} crop.`,
  ].join(" ");
  let bytes: Buffer;
  try {
    bytes = await generateImageBuffer(prompt, "1024x1024");
  } catch (err) {
    throw new ShortsSafetyError("ai_image_failed", `AI thumbnail generation failed: ${(err as Error).message}`, 502);
  }
  if (!bytes || bytes.length === 0) {
    throw new ShortsSafetyError("ai_image_empty", "AI thumbnail came back empty", 502);
  }
  const root = resolveStorageRoot();
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.replace(SAFE_NAME_RE, "");
  const outPath = resolve(root, `sh_${id.replace(SAFE_NAME_RE, "").slice(0, 16)}_ai_${seed}.png`);
  writeFileSync(outPath, bytes);
  return { thumbnailPath: outPath };
}

/**
 * Stage a thumbnail file uploaded by an admin. Validates MIME via magic bytes
 * (PNG/JPEG only), enforces a size cap, and writes the bytes to the private
 * shorts folder with a safe stem. Does NOT persist the row change — callers
 * apply it via `updateShort(id, { thumbnailPath })` so the swap goes through
 * the same PATCH contract.
 */
export const UPLOAD_THUMB_MAX_BYTES = 5 * 1024 * 1024;

export async function stageUploadedThumbnail(
  id: string,
  bytes: Buffer,
  declaredMime: string | undefined,
): Promise<{ thumbnailPath: string }> {
  if (!bytes || bytes.length === 0) {
    throw new ShortsSafetyError("upload_empty", "Uploaded file is empty");
  }
  if (bytes.length > UPLOAD_THUMB_MAX_BYTES) {
    throw new ShortsSafetyError(
      "upload_too_large",
      `Thumbnail must be ≤ ${Math.round(UPLOAD_THUMB_MAX_BYTES / 1024 / 1024)}MB`,
      413,
    );
  }
  // Magic-byte check (don't trust client-declared MIME alone).
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng && !isJpeg) {
    throw new ShortsSafetyError("invalid_image", "Only PNG or JPEG files are accepted");
  }
  if (declaredMime) {
    const mime = declaredMime.toLowerCase();
    if (isPng && mime !== "image/png") {
      throw new ShortsSafetyError("mime_mismatch", "Declared MIME does not match PNG bytes");
    }
    if (isJpeg && mime !== "image/jpeg" && mime !== "image/jpg") {
      throw new ShortsSafetyError("mime_mismatch", "Declared MIME does not match JPEG bytes");
    }
  }
  const existing = await getShort(id);
  if (!existing) throw new ShortsSafetyError("not_found", "Draft not found", 404);
  if (existing.status !== "draft") {
    throw new ShortsSafetyError(
      "not_draft",
      `Uploaded thumbnail can only be set while status='draft' (current: ${existing.status}).`,
      409,
    );
  }
  const root = resolveStorageRoot();
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.replace(SAFE_NAME_RE, "");
  const ext = isPng ? "png" : "jpg";
  const outPath = resolve(root, `sh_${id.replace(SAFE_NAME_RE, "").slice(0, 16)}_upload_${seed}.${ext}`);
  writeFileSync(outPath, bytes);
  return { thumbnailPath: outPath };
}

/**
 * Read a PNG file's natural width/height from its IHDR chunk.
 * Avoids pulling in a heavy image lib (no sharp dep).
 */
function readPngDimensions(filePath: string): { width: number; height: number } {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(24);
    const n = readSync(fd, buf, 0, 24, 0);
    if (n < 24 || buf.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new ShortsSafetyError("invalid_png", "Staged thumbnail is not a valid PNG", 500);
    }
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    closeSync(fd);
  }
}

function expectedTokenPrefix(id: string): string {
  return `sh_${id.replace(SAFE_NAME_RE, "").slice(0, 16)}_`;
}

/**
 * Resolve a candidate token (basename of staged PNG) to its absolute path,
 * validating it belongs to the given draft and lives inside the shorts root.
 */
function resolveStagedThumbnail(id: string, token: string): string {
  if (!token || token !== basename(token) || !/^sh_[a-z0-9_]+\.png$/i.test(token)) {
    throw new ShortsSafetyError("invalid_token", "Invalid candidate token");
  }
  if (!token.startsWith(expectedTokenPrefix(id))) {
    throw new ShortsSafetyError("invalid_token", "Candidate does not belong to this draft", 403);
  }
  const root = resolveStorageRoot();
  const abs = resolve(root, token);
  if (!(abs === root || abs.startsWith(root + "/"))) {
    throw new ShortsSafetyError("path_outside_private_root", "Candidate path outside private root", 403);
  }
  if (!existsSync(abs)) {
    throw new ShortsSafetyError("candidate_missing", "Staged thumbnail has expired or was discarded", 410);
  }
  return abs;
}

export interface StagedThumbnailInfo {
  token: string;
  width: number;
  height: number;
}

export function describeStagedThumbnail(thumbnailPath: string): StagedThumbnailInfo {
  const dims = readPngDimensions(thumbnailPath);
  return { token: basename(thumbnailPath), width: dims.width, height: dims.height };
}

/**
 * Crop a staged thumbnail by source-pixel rectangle, write a fresh PNG, and
 * return the new absolute path. Source file is left untouched (caller may
 * delete it after the row is updated).
 */
export async function cropStagedThumbnail(
  id: string,
  token: string,
  crop: { x: number; y: number; width: number; height: number },
): Promise<{ thumbnailPath: string }> {
  const src = resolveStagedThumbnail(id, token);
  const dims = readPngDimensions(src);
  const x = Math.round(crop.x);
  const y = Math.round(crop.y);
  const w = Math.round(crop.width);
  const h = Math.round(crop.height);
  if (
    !Number.isFinite(x) || !Number.isFinite(y) ||
    !Number.isFinite(w) || !Number.isFinite(h) ||
    w < 16 || h < 16 ||
    x < 0 || y < 0 ||
    x + w > dims.width || y + h > dims.height
  ) {
    throw new ShortsSafetyError(
      "invalid_crop_rect",
      `Crop rect ${x},${y} ${w}x${h} is invalid for ${dims.width}x${dims.height}`,
    );
  }
  const root = resolveStorageRoot();
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.replace(SAFE_NAME_RE, "");
  const outPath = resolve(root, `sh_${id.replace(SAFE_NAME_RE, "").slice(0, 16)}_crop_${seed}.png`);
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", src,
    "-vf", `crop=${w}:${h}:${x}:${y}`,
    "-frames:v", "1",
    outPath,
  ];
  const r = await runFfmpeg(args);
  if (r.exitCode !== 0 || !existsSync(outPath) || statSync(outPath).size === 0) {
    throw new ShortsSafetyError("ffmpeg_crop_failed", `ffmpeg exit=${r.exitCode} tail=${r.stderr.slice(-200)}`, 500);
  }
  return { thumbnailPath: outPath };
}

/**
 * Best-effort delete of a staged candidate. Returns true if a file existed
 * and was removed. Used by the "Cancel" path in the crop UI and after a
 * successful crop to free the un-cropped source.
 */
export function discardStagedThumbnail(id: string, token: string): boolean {
  try {
    const abs = resolveStagedThumbnail(id, token);
    unlinkSync(abs);
    return true;
  } catch (err) {
    if (err instanceof ShortsSafetyError && err.code === "candidate_missing") return false;
    throw err;
  }
}

export async function discardShort(id: string): Promise<void> {
  const existing = await getShort(id);
  if (!existing) throw new ShortsSafetyError("not_found", "Draft not found", 404);
  await db
    .update(socialDrafts)
    .set({ status: "discarded", approved: false, clipPath: "", thumbnailPath: null })
    .where(eq(socialDrafts.id, id));
  if (existing.clipPath) {
    await cleanupReplacedShortsFile(existing.clipPath, id, "clipPath");
  }
  if (existing.thumbnailPath) {
    await cleanupReplacedShortsFile(existing.thumbnailPath, id, "thumbnailPath");
  }
}

/**
 * Background sweep: delete staged thumbnail candidates that were never
 * committed (admin closed the tab without Save/Cancel). Only touches
 * `sh_*_frame_*.png`, `sh_*_ai_*.png`, and `sh_*_upload_*.{png,jpg}` files
 * in the private shorts root older than `olderThanMs` (default ~1h) that are
 * not referenced by any social_drafts.thumbnailPath. Cropped, persisted
 * thumbnails (`sh_*_crop_*.png`) and clip files are never touched.
 *
 * Best-effort: never throws. Returns counts for observability.
 */
const ABANDONED_THUMB_RE =
  /^sh_[a-z0-9_]+_(?:(?:frame|ai)_[a-z0-9]+\.png|upload_[a-z0-9]+\.(?:png|jpg))$/i;
export const ABANDONED_THUMB_DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

export interface SweepAbandonedThumbnailsResult {
  scanned: number;
  deleted: number;
  skippedReferenced: number;
  skippedFresh: number;
  errors: number;
}

export async function sweepAbandonedStagedThumbnails(
  olderThanMs: number = ABANDONED_THUMB_DEFAULT_MAX_AGE_MS,
): Promise<SweepAbandonedThumbnailsResult> {
  const result: SweepAbandonedThumbnailsResult = {
    scanned: 0,
    deleted: 0,
    skippedReferenced: 0,
    skippedFresh: 0,
    errors: 0,
  };
  let root: string;
  try {
    root = resolveStorageRoot();
  } catch {
    return result;
  }
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return result;
  }
  const cutoff = Date.now() - Math.max(0, olderThanMs);
  const candidates: string[] = [];
  for (const name of entries) {
    if (!ABANDONED_THUMB_RE.test(name)) continue;
    result.scanned += 1;
    const abs = resolve(root, name);
    try {
      const st = statSync(abs);
      if (!st.isFile()) continue;
      if (st.mtimeMs > cutoff) {
        result.skippedFresh += 1;
        continue;
      }
      candidates.push(abs);
    } catch {
      result.errors += 1;
    }
  }
  if (candidates.length === 0) return result;
  const referenced = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    try {
      const rows = await db
        .select({ thumbnailPath: socialDrafts.thumbnailPath })
        .from(socialDrafts)
        .where(inArray(socialDrafts.thumbnailPath, slice));
      for (const r of rows) {
        if (r.thumbnailPath) referenced.add(r.thumbnailPath);
      }
    } catch (err) {
      console.warn(`[shorts] sweep DB lookup failed: ${(err as Error).message}`);
      result.errors += 1;
      return result;
    }
  }
  for (const abs of candidates) {
    if (referenced.has(abs)) {
      result.skippedReferenced += 1;
      continue;
    }
    try {
      unlinkSync(abs);
      result.deleted += 1;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      console.warn(`[shorts] sweep unlink failed ${abs}: ${(err as Error).message}`);
      result.errors += 1;
    }
  }
  return result;
}

let sweepTimer: NodeJS.Timeout | null = null;

export function startAbandonedThumbnailSweeper(intervalMs = 15 * 60 * 1000): void {
  if (sweepTimer) return;
  const tick = () => {
    sweepAbandonedStagedThumbnails()
      .then((r) => {
        if (r.deleted > 0 || r.errors > 0) {
          console.log(
            `[shorts] abandoned-thumb sweep: scanned=${r.scanned} deleted=${r.deleted} ` +
              `referenced=${r.skippedReferenced} fresh=${r.skippedFresh} errors=${r.errors}`,
          );
        }
      })
      .catch((err) => {
        console.warn(`[shorts] abandoned-thumb sweep failed: ${(err as Error).message}`);
      });
  };
  sweepTimer = setInterval(tick, Math.max(60_000, intervalMs));
  // Don't keep the event loop alive solely for this sweep.
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
  // Kick off one async tick shortly after start so a long-lived deploy with no
  // recent staging activity still drains existing junk.
  setTimeout(tick, 30_000).unref?.();
}

export function stopAbandonedThumbnailSweeper(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

export const shortsCutterService = {
  cutShortsForBroadcast,
  listShorts,
  getShort,
  updateShort,
  approveShort,
  discardShort,
  stageThumbnailFromFrame,
  stageAiThumbnail,
  stageUploadedThumbnail,
  describeStagedThumbnail,
  cropStagedThumbnail,
  discardStagedThumbnail,
  DEFAULT_VARIANTS,
};
