/**
 * T7 — AI Anchor Director.
 *
 * Given a broadcast brief (mood + eventType + sensitive flag + script
 * beats), picks a delivery mode per beat, then orchestrates the HeyGen
 * adapter to render an anchor video clip per beat.
 *
 * Safety invariants:
 *  - The `shapeshift_explainer` mode is blocked on any sensitive story.
 *    The block is enforced both at pick-time AND inside the adapter, so
 *    a tampered pick still cannot reach a render.
 *  - All renders default to `dryRun=true`. Live renders are intentionally
 *    disabled in this phase (the adapter throws).
 *  - Every clip carries generation metadata (mode, presetId, framing,
 *    sensitive flag, requested-at, byte size, dryRun).
 *  - There is no auto-publish path. Clips are written under
 *    `PRIVATE_OBJECT_DIR/anchors/` for admin-only streaming.
 */

import { and, eq, desc } from "drizzle-orm";
import { db } from "../db";
import {
  anchorClips,
  type AnchorClip,
  type InsertAnchorClip,
} from "@shared/schema";
import {
  ANCHOR_MODES,
  ANCHOR_MODE_REGISTRY,
  AnchorModeError,
  assertModeAllowedForSensitivity,
  isSensitiveBeat,
  type AnchorMode,
} from "./anchor/modes";
import { renderAnchorBeat } from "./anchor/heygen-adapter";

export interface AnchorBeatInput {
  index: number;
  text: string;
  /** Optional per-beat override mood (e.g. "analytical" for a data beat). */
  mood?: string | null;
  /** Optional explicit mode override from admin re-pick. */
  modeOverride?: AnchorMode | null;
}

export interface AnchorBriefContext {
  packageId: string;
  /** Brief-level mood, e.g. "neutral", "analytical", "feature", "somber". */
  mood?: string | null;
  /** Brief-level event type, e.g. "policy_update", "disaster", "feature". */
  eventType?: string | null;
  /** Explicit sensitive flag from upstream. Forces sensitive=true regardless of mood/eventType. */
  sensitive?: boolean | null;
}

export interface AnchorBeatPick {
  beatIndex: number;
  mode: AnchorMode;
  presetId: string;
  framing: string;
  promptPrefix: string;
  sensitive: boolean;
  reason: string;
}

export interface AnchorRenderBeatInput {
  brief: AnchorBriefContext;
  beat: AnchorBeatInput;
  /** Optional admin-chosen mode (re-pick). Subject to the sensitivity gate. */
  mode?: AnchorMode | null;
  durationMs?: number | null;
  dryRun?: boolean | null;
  actorId: string;
}

/**
 * Pure-function mode picker. Given mood + eventType + sensitivity,
 * returns the ordered mode list for the brief's beats.
 *
 * Picking rules (deterministic, easy to audit):
 *  - Beat 0: desk_anchor for sensitive/breaking, walking_presenter for
 *    energetic feature, otherwise desk_anchor.
 *  - Beat 1: data_wall_analyst if mood is "analytical" or eventType
 *    looks data-heavy, otherwise corner_explainer.
 *  - Beat 2: field_reporter for on-location event types, otherwise
 *    desk_anchor.
 *  - Beat 3+: shapeshift_explainer ONLY when not sensitive and mood is
 *    "feature"/"playful"; else desk_anchor.
 */
export function pickModeForBeat(brief: AnchorBriefContext, beat: AnchorBeatInput): AnchorBeatPick {
  const sensitive = isSensitiveBeat({
    sensitive: brief.sensitive,
    eventType: brief.eventType,
    mood: beat.mood ?? brief.mood,
  });

  // Admin override path — still gated by sensitivity check.
  if (beat.modeOverride) {
    assertModeAllowedForSensitivity(beat.modeOverride, sensitive);
    const def = ANCHOR_MODE_REGISTRY[beat.modeOverride];
    return {
      beatIndex: beat.index,
      mode: beat.modeOverride,
      presetId: def.presetId,
      framing: def.framing,
      promptPrefix: def.promptPrefix,
      sensitive,
      reason: "admin_override",
    };
  }

  const mood = (beat.mood || brief.mood || "neutral").toLowerCase();
  const eventType = (brief.eventType || "").toLowerCase();

  let mode: AnchorMode = "desk_anchor";
  let reason = "default_desk_anchor";

  const idx = beat.index;

  if (idx === 0) {
    if (sensitive) {
      mode = "desk_anchor";
      reason = "sensitive_open_desk";
    } else if (mood === "feature" || mood === "playful" || mood === "energetic") {
      mode = "walking_presenter";
      reason = "feature_open_walking";
    } else {
      mode = "desk_anchor";
      reason = "neutral_open_desk";
    }
  } else if (idx === 1) {
    if (
      mood === "analytical" ||
      eventType.includes("data") ||
      eventType.includes("market") ||
      eventType.includes("economy")
    ) {
      mode = "data_wall_analyst";
      reason = "analytical_beat_data_wall";
    } else {
      mode = "corner_explainer";
      reason = "context_corner_explainer";
    }
  } else if (idx === 2) {
    if (
      eventType.includes("field") ||
      eventType.includes("on_location") ||
      eventType.includes("event") ||
      eventType.includes("scene")
    ) {
      mode = "field_reporter";
      reason = "on_location_field";
    } else {
      mode = "desk_anchor";
      reason = "default_desk_anchor";
    }
  } else {
    if (!sensitive && (mood === "feature" || mood === "playful")) {
      mode = "shapeshift_explainer";
      reason = "feature_closer_shapeshift";
    } else {
      mode = "desk_anchor";
      reason = "default_desk_anchor";
    }
  }

  // Hard gate: even if the rule above tried to pick shapeshift on a
  // sensitive story (it shouldn't), this throws.
  assertModeAllowedForSensitivity(mode, sensitive);

  const def = ANCHOR_MODE_REGISTRY[mode];
  return {
    beatIndex: beat.index,
    mode,
    presetId: def.presetId,
    framing: def.framing,
    promptPrefix: def.promptPrefix,
    sensitive,
    reason,
  };
}

export function pickModeSequence(brief: AnchorBriefContext, beats: AnchorBeatInput[]): AnchorBeatPick[] {
  return beats.map((b) => pickModeForBeat(brief, b));
}

export async function renderBeat(input: AnchorRenderBeatInput): Promise<AnchorClip> {
  if (!input.brief?.packageId) {
    throw new AnchorModeError("missing_package_id", "packageId is required");
  }
  if (input.beat == null || typeof input.beat.index !== "number" || input.beat.index < 0) {
    throw new AnchorModeError("invalid_beat", "beat.index must be a non-negative number");
  }

  const sensitive = isSensitiveBeat({
    sensitive: input.brief.sensitive,
    eventType: input.brief.eventType,
    mood: input.beat.mood ?? input.brief.mood,
  });

  const chosen: AnchorMode = input.mode
    ? input.mode
    : pickModeForBeat(input.brief, input.beat).mode;

  // Re-assert at the service edge before touching the adapter.
  assertModeAllowedForSensitivity(chosen, sensitive);

  const def = ANCHOR_MODE_REGISTRY[chosen];

  const dryRun = input.dryRun !== false; // default true

  const rendered = await renderAnchorBeat({
    packageId: input.brief.packageId,
    beatIndex: input.beat.index,
    mode: chosen,
    sensitive,
    text: input.beat.text,
    durationMs: input.durationMs ?? undefined,
    dryRun,
  });

  const row: InsertAnchorClip = {
    packageId: input.brief.packageId,
    beatIndex: input.beat.index,
    mode: chosen,
    presetId: def.presetId,
    clipUrl: rendered.clipUrl,
    clipPath: rendered.clipPath,
    dryRun: rendered.dryRun,
    sensitive,
    eventType: input.brief.eventType ?? null,
    mood: (input.beat.mood ?? input.brief.mood) ?? null,
    promptPrefix: def.promptPrefix,
    framing: def.framing,
    durationMs: rendered.durationMs,
    generationMetadata: rendered.generationMetadata as Record<string, unknown>,
    createdBy: input.actorId,
  };

  const [inserted] = await db.insert(anchorClips).values(row).returning();
  return inserted;
}

export async function listClipsForPackage(packageId: string, limit = 200): Promise<AnchorClip[]> {
  if (!packageId) return [];
  return db
    .select()
    .from(anchorClips)
    .where(eq(anchorClips.packageId, packageId))
    .orderBy(anchorClips.beatIndex, desc(anchorClips.createdAt))
    .limit(limit);
}

export async function getClip(id: string): Promise<AnchorClip | null> {
  if (!id) return null;
  const rows = await db.select().from(anchorClips).where(eq(anchorClips.id, id)).limit(1);
  return rows[0] || null;
}

export async function getLatestClipForBeat(packageId: string, beatIndex: number): Promise<AnchorClip | null> {
  const rows = await db
    .select()
    .from(anchorClips)
    .where(and(eq(anchorClips.packageId, packageId), eq(anchorClips.beatIndex, beatIndex)))
    .orderBy(desc(anchorClips.createdAt))
    .limit(1);
  return rows[0] || null;
}

export const anchorDirectorService = {
  modes: ANCHOR_MODES,
  registry: ANCHOR_MODE_REGISTRY,
  pickModeForBeat,
  pickModeSequence,
  renderBeat,
  listClipsForPackage,
  getClip,
  getLatestClipForBeat,
};
