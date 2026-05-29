/**
 * Newsroom T5 — 3D/4D Newsroom Package Builder service.
 *
 * Builds a `NewsroomPackage` from a `BroadcastBrief` (T3). Pure-data
 * mapping — no AI calls, no provider calls, no hardware control.
 *
 * SAFETY:
 *   - 4D cues are SUGGESTIONS only. Every generated cue carries
 *     `simulationOnly: true` and there is NO hardware-call payload on
 *     the cue schema. The PATCH gate hard-refuses any cue with extra /
 *     executable keys.
 *   - Packages default to `status='draft'`. Downstream consumers MUST
 *     use `readApprovedPackage(id)` which refuses anything not in
 *     `status='approved'`.
 *   - Generation reads only from approved briefs (via
 *     broadcastBriefBuilderService.readApprovedBrief).
 *   - Idempotent on briefId (unique index + ON CONFLICT DO NOTHING).
 *   - No publish / social / YouTube / hardware code paths.
 */

import { and, desc, eq, sql as dsql } from "drizzle-orm";
import { db } from "../db";
import {
  newsroomPackages,
  type NewsroomPackageRow,
} from "@shared/schema";
import {
  NewsroomFourDCueSchema,
  NewsroomPackageSchema,
  type BroadcastBrief,
  type NewsroomCameraPlan,
  type NewsroomClaimsTimeline,
  type NewsroomConfidencePanel,
  type NewsroomFourDCue,
  type NewsroomLedWall,
  type NewsroomLowerThird,
  type NewsroomPackage,
  type NewsroomPackagePatch,
  type NewsroomPackageStatus,
  type NewsroomSourcePanel,
} from "../../shared/newsroom-types";
import { broadcastBriefBuilderService } from "./broadcast-brief-builder-service";

export class NewsroomPackageSafetyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "NewsroomPackageSafetyError";
  }
}

interface ServiceOptions {
  now?: () => Date;
}

/* --------------------------------------------------------------------- */
/* Pure mappers                                                           */
/* --------------------------------------------------------------------- */

const MAX_TICKER = 240;
const MAX_LOWER_PRIMARY = 200;
const MAX_LOWER_SECONDARY = 200;

function clamp(s: string, max: number): string {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

function mapLedWall(brief: BroadcastBrief): NewsroomLedWall {
  const backgroundShots = [
    ...brief.visualNeeds.coldOpen,
    ...brief.visualNeeds.keyFacts,
    ...brief.visualNeeds.context,
    ...brief.visualNeeds.signOff,
  ]
    .map((s) => clamp(s, 200))
    .filter(Boolean)
    .slice(0, 20);
  const bRollReferences = brief.bRollNeeds
    .map((s) => clamp(s, 200))
    .filter(Boolean)
    .slice(0, 20);
  const safetyLabels: string[] = ["INTERNAL_REVIEW_ONLY"];
  if (brief.sensitivity.disputed) safetyLabels.push("DISPUTED");
  if (brief.sensitivity.minors) safetyLabels.push("MINORS_SENSITIVE");
  if (brief.sensitivity.graphicViolence) safetyLabels.push("GRAPHIC_CONTENT");
  if (brief.sensitivity.medical) safetyLabels.push("MEDICAL_CAUTION");
  if (brief.sensitivity.electoral) safetyLabels.push("ELECTORAL_CAUTION");
  if (brief.sensitivity.legal) safetyLabels.push("LEGAL_CAUTION");
  if (brief.sensitivity.death) safetyLabels.push("DEATH_CAUTION");
  if (brief.sensitivity.financial) safetyLabels.push("FINANCIAL_CAUTION");
  if (brief.rightsFlags.hasRestrictions) safetyLabels.push("RIGHTS_RESTRICTED");
  return {
    backgroundShots,
    bRollReferences,
    safetyLabels: safetyLabels.slice(0, 20),
  };
}

function mapSourcePanel(brief: BroadcastBrief): NewsroomSourcePanel {
  const sources = brief.entities
    .slice(0, 40)
    .map((e) => ({ name: clamp(e.name, 200), kind: e.kind }));
  const notes: string[] = [];
  if (brief.rightsFlags.hasRestrictions) {
    notes.push("Brief flags rights restrictions — verify clearances.");
  }
  for (const n of brief.rightsFlags.notes.slice(0, 5)) {
    notes.push(clamp(n, 300));
  }
  return {
    sources,
    distinctEntityCount: sources.length,
    notes: notes.slice(0, 10),
  };
}

function confidenceLabelFor(brief: BroadcastBrief): "high" | "medium" | "low" {
  if (brief.sensitivity.disputed) return "low";
  if (brief.impactScore === "high" && !brief.breakingNews) return "high";
  if (brief.impactScore === "low") return "low";
  return "medium";
}

function mapConfidencePanel(brief: BroadcastBrief): NewsroomConfidencePanel {
  const cautions: string[] = [];
  if (brief.breakingNews) cautions.push("Breaking news — facts may change.");
  if (brief.sensitivity.disputed) cautions.push("Disputed across sources.");
  if (brief.sensitivity.medical) cautions.push("Medical claim — verify with primary sources.");
  if (brief.sensitivity.electoral) cautions.push("Electoral context — heightened review required.");
  if (brief.sensitivity.legal) cautions.push("Legal context — heightened review required.");
  if (brief.rightsFlags.hasRestrictions) cautions.push("Rights restrictions on source media.");
  return {
    label: confidenceLabelFor(brief),
    impactScore: brief.impactScore,
    breakingNews: brief.breakingNews,
    cautions: cautions.slice(0, 20),
  };
}

function mapClaimsTimeline(brief: BroadcastBrief): NewsroomClaimsTimeline {
  return {
    beats: [
      { kind: "cold_open", text: clamp(brief.scriptBeats.coldOpen, 1500) },
      { kind: "key_facts", text: clamp(brief.scriptBeats.keyFacts, 1500) },
      { kind: "context", text: clamp(brief.scriptBeats.context, 1500) },
      { kind: "sign_off", text: clamp(brief.scriptBeats.signOff, 1500) },
    ],
  };
}

function mapTicker(brief: BroadcastBrief): string {
  const prefix = brief.breakingNews ? "BREAKING — " : "";
  return clamp(prefix + brief.headline, MAX_TICKER);
}

function mapLowerThird(brief: BroadcastBrief): NewsroomLowerThird {
  const loc = brief.location.city || brief.location.country || brief.region || brief.country;
  const secondaryParts: string[] = [];
  if (loc) secondaryParts.push(loc);
  if (brief.eventType) secondaryParts.push(brief.eventType);
  const secondary = secondaryParts.length > 0 ? secondaryParts.join(" · ") : null;
  return {
    primary: clamp(brief.headline, MAX_LOWER_PRIMARY),
    secondary: secondary ? clamp(secondary, MAX_LOWER_SECONDARY) : null,
  };
}

function mapTeleprompter(brief: BroadcastBrief): string {
  const parts = [
    brief.scriptBeats.coldOpen,
    brief.scriptBeats.keyFacts,
    brief.scriptBeats.context,
    brief.scriptBeats.signOff,
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return clamp(parts.join("\n\n"), 5000);
}

function mapCameraPlan(brief: BroadcastBrief): NewsroomCameraPlan {
  const mode = brief.anchorMode;
  const shots: { name: string; description: string }[] = [];
  switch (mode) {
    case "solo_desk":
      shots.push(
        { name: "wide_desk", description: "Wide on anchor at news desk; LED wall visible." },
        { name: "mid_anchor", description: "Mid shot on anchor for key facts beat." },
        { name: "tight_anchor", description: "Tight close-up for sign-off." },
      );
      break;
    case "two_anchor":
      shots.push(
        { name: "two_shot", description: "Two-shot of both anchors at the desk." },
        { name: "anchor_a_mid", description: "Mid on anchor A during cold open." },
        { name: "anchor_b_mid", description: "Mid on anchor B during context beat." },
      );
      break;
    case "reporter_remote":
      shots.push(
        { name: "studio_intro", description: "Anchor in studio introducing remote." },
        { name: "remote_full", description: "Full shot of remote reporter on location." },
        { name: "split_screen", description: "Split-screen handoff between studio and remote." },
      );
      break;
    case "studio_panel":
      shots.push(
        { name: "panel_wide", description: "Wide on panel including moderator." },
        { name: "panel_speaker", description: "Mid on active speaker." },
        { name: "panel_reaction", description: "Reaction shot on other panelists." },
      );
      break;
    case "voiceover_only":
      shots.push(
        { name: "broll_lead", description: "B-roll background under voiceover." },
        { name: "graphic_inserts", description: "Lower-third and graphic overlays." },
      );
      break;
  }
  return { anchorMode: mode, shots: shots.slice(0, 20) };
}

/**
 * 4D cue generator. Pure heuristic, suggestions only, no hardware.
 * Every cue is run through `NewsroomFourDCueSchema.parse` so any
 * accidental extra key (e.g. an executable payload) is stripped /
 * rejected before it leaves this function.
 */
function generateFourDCues(brief: BroadcastBrief): NewsroomFourDCue[] {
  const out: NewsroomFourDCue[] = [];

  if (brief.breakingNews) {
    out.push({
      id: "cue_breaking_open",
      beat: "cold_open",
      kind: "rumble",
      intensity: "low",
      reason: "Low rumble under breaking-news sting (suggestion only).",
      simulationOnly: true,
    });
  }

  if (brief.impactScore === "high") {
    out.push({
      id: "cue_high_impact_facts",
      beat: "key_facts",
      kind: "tilt",
      intensity: "low",
      reason: "Subtle seat tilt to underline high-impact key fact (suggestion only).",
      simulationOnly: true,
    });
  }

  if (brief.mapNeeds.needsMap) {
    out.push({
      id: "cue_map_wind",
      beat: "context",
      kind: "wind",
      intensity: "low",
      reason: "Light wind cue while map zooms to focus region (suggestion only).",
      simulationOnly: true,
    });
  }

  if (brief.sensitivity.disputed) {
    out.push({
      id: "cue_disputed_caution",
      beat: "context",
      kind: "flash",
      intensity: "low",
      reason: "Caution flash hint while presenting disputed framing (suggestion only).",
      simulationOnly: true,
    });
  }

  out.push({
    id: "cue_sign_off_rest",
    beat: "sign_off",
    kind: "tilt",
    intensity: "low",
    reason: "Return-to-neutral cue at sign-off (suggestion only).",
    simulationOnly: true,
  });

  // Defensive: re-validate every cue. If any future caller bypasses the
  // factory and tries to inject a hardware payload, .strict() parse here
  // will throw and the package will fail to build — by design.
  return out.slice(0, 20).map((c) => NewsroomFourDCueSchema.parse(c));
}

/* --------------------------------------------------------------------- */
/* Row <-> domain mapping                                                 */
/* --------------------------------------------------------------------- */

function rowToPackage(r: NewsroomPackageRow): NewsroomPackage {
  return NewsroomPackageSchema.parse({
    id: r.id,
    briefId: r.briefId,
    ledWall: r.ledWall,
    sourcePanel: r.sourcePanel,
    confidencePanel: r.confidencePanel,
    claimsTimeline: r.claimsTimeline,
    ticker: r.ticker,
    lowerThird: r.lowerThird,
    teleprompter: r.teleprompter,
    cameraPlan: r.cameraPlan,
    fourDCues: r.fourDCues,
    status: r.status as NewsroomPackageStatus,
    approvedBy: r.approvedBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
}

/* --------------------------------------------------------------------- */
/* Pure-mapper export (no DB I/O) — used by safety tests and admin UI    */
/* --------------------------------------------------------------------- */

export function buildPackagePayloadFromBrief(brief: BroadcastBrief): {
  ledWall: NewsroomLedWall;
  sourcePanel: NewsroomSourcePanel;
  confidencePanel: NewsroomConfidencePanel;
  claimsTimeline: NewsroomClaimsTimeline;
  ticker: string;
  lowerThird: NewsroomLowerThird;
  teleprompter: string;
  cameraPlan: NewsroomCameraPlan;
  fourDCues: NewsroomFourDCue[];
} {
  return {
    ledWall: mapLedWall(brief),
    sourcePanel: mapSourcePanel(brief),
    confidencePanel: mapConfidencePanel(brief),
    claimsTimeline: mapClaimsTimeline(brief),
    ticker: mapTicker(brief),
    lowerThird: mapLowerThird(brief),
    teleprompter: mapTeleprompter(brief),
    cameraPlan: mapCameraPlan(brief),
    fourDCues: generateFourDCues(brief),
  };
}

/* --------------------------------------------------------------------- */
/* Public service                                                         */
/* --------------------------------------------------------------------- */

export const newsroomPackageBuilderService = {
  /**
   * Build (or return) the newsroom package for an APPROVED brief.
   * Idempotent on briefId. Always writes `status='draft'`. The brief
   * must already be `approvalStatus='approved'`; otherwise we refuse
   * via broadcastBriefBuilderService.readApprovedBrief.
   */
  async generateForBrief(
    briefId: string,
    opts: ServiceOptions = {},
  ): Promise<NewsroomPackage> {
    const brief = await broadcastBriefBuilderService.readApprovedBrief(briefId);

    const [existing] = await db
      .select()
      .from(newsroomPackages)
      .where(eq(newsroomPackages.briefId, brief.id))
      .limit(1);
    if (existing) return rowToPackage(existing);

    const payload = buildPackagePayloadFromBrief(brief);
    const ts = opts.now?.() ?? new Date();

    const inserted = await db
      .insert(newsroomPackages)
      .values({
        briefId: brief.id,
        ledWall: payload.ledWall,
        sourcePanel: payload.sourcePanel,
        confidencePanel: payload.confidencePanel,
        claimsTimeline: payload.claimsTimeline,
        ticker: payload.ticker,
        lowerThird: payload.lowerThird,
        teleprompter: payload.teleprompter,
        cameraPlan: payload.cameraPlan,
        fourDCues: payload.fourDCues,
        // SAFETY: server-stamped, never accepted from caller.
        status: "draft",
        approvedBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .onConflictDoNothing({ target: newsroomPackages.briefId })
      .returning();

    if (inserted[0]) return rowToPackage(inserted[0]);

    const [winner] = await db
      .select()
      .from(newsroomPackages)
      .where(eq(newsroomPackages.briefId, brief.id))
      .limit(1);
    if (!winner) {
      throw new NewsroomPackageSafetyError(
        "race_lost",
        "Failed to insert or fetch newsroom package after conflict",
      );
    }
    return rowToPackage(winner);
  },

  async listPackages(
    filter?: { status?: NewsroomPackageStatus; limit?: number },
  ): Promise<NewsroomPackage[]> {
    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 200);
    const rows = filter?.status
      ? await db
          .select()
          .from(newsroomPackages)
          .where(eq(newsroomPackages.status, filter.status))
          .orderBy(desc(newsroomPackages.createdAt))
          .limit(limit)
      : await db
          .select()
          .from(newsroomPackages)
          .orderBy(desc(newsroomPackages.createdAt))
          .limit(limit);
    return rows.map(rowToPackage);
  },

  async getPackage(id: string): Promise<NewsroomPackage | null> {
    const [row] = await db
      .select()
      .from(newsroomPackages)
      .where(eq(newsroomPackages.id, id))
      .limit(1);
    return row ? rowToPackage(row) : null;
  },

  async getPackageByBriefId(briefId: string): Promise<NewsroomPackage | null> {
    const [row] = await db
      .select()
      .from(newsroomPackages)
      .where(eq(newsroomPackages.briefId, briefId))
      .limit(1);
    return row ? rowToPackage(row) : null;
  },

  /**
   * Admin PATCH. Content fields editable. SAFETY: any cue submitted via
   * `fourDCues` must already satisfy `NewsroomFourDCueSchema.strict()`,
   * which means it has `simulationOnly: true` and NO extra/hardware
   * payload keys. We also re-validate each cue here defensively.
   */
  async patchPackage(
    id: string,
    patch: NewsroomPackagePatch,
    actor: { adminId: string },
    opts: ServiceOptions = {},
  ): Promise<NewsroomPackage> {
    const [existing] = await db
      .select()
      .from(newsroomPackages)
      .where(eq(newsroomPackages.id, id))
      .limit(1);
    if (!existing) {
      throw new NewsroomPackageSafetyError(
        "not_found",
        `Newsroom package ${id} not found`,
      );
    }

    if (patch.fourDCues !== undefined) {
      for (const cue of patch.fourDCues) {
        const parsed = NewsroomFourDCueSchema.safeParse(cue);
        if (!parsed.success || parsed.data.simulationOnly !== true) {
          throw new NewsroomPackageSafetyError(
            "cue_not_simulation_only",
            "4D cues must be simulationOnly and carry no hardware payload",
          );
        }
      }
    }

    const next: Partial<NewsroomPackageRow> = {
      updatedAt: opts.now?.() ?? new Date(),
    };
    if (patch.ledWall !== undefined) next.ledWall = patch.ledWall;
    if (patch.sourcePanel !== undefined) next.sourcePanel = patch.sourcePanel;
    if (patch.confidencePanel !== undefined) next.confidencePanel = patch.confidencePanel;
    if (patch.claimsTimeline !== undefined) next.claimsTimeline = patch.claimsTimeline;
    if (patch.ticker !== undefined) next.ticker = patch.ticker;
    if (patch.lowerThird !== undefined) next.lowerThird = patch.lowerThird;
    if (patch.teleprompter !== undefined) next.teleprompter = patch.teleprompter;
    if (patch.cameraPlan !== undefined) next.cameraPlan = patch.cameraPlan;
    if (patch.fourDCues !== undefined) next.fourDCues = patch.fourDCues;

    if (patch.status !== undefined) {
      next.status = patch.status;
      if (patch.status === "approved") {
        next.approvedBy = actor.adminId;
      } else {
        next.approvedBy = null;
      }
    }

    const [updated] = await db
      .update(newsroomPackages)
      .set(next)
      .where(eq(newsroomPackages.id, id))
      .returning();
    return rowToPackage(updated);
  },

  async approvePackage(
    id: string,
    actor: { adminId: string },
    opts: ServiceOptions = {},
  ): Promise<NewsroomPackage> {
    return this.patchPackage(id, { status: "approved" }, actor, opts);
  },

  /**
   * SAFETY GATE: the only function downstream code (T6 Compositor / T7
   * Anchor Director) may use. Throws unless `status === 'approved'`.
   */
  async readApprovedPackage(id: string): Promise<NewsroomPackage> {
    const [row] = await db
      .select()
      .from(newsroomPackages)
      .where(
        and(
          eq(newsroomPackages.id, id),
          eq(newsroomPackages.status, "approved"),
        ),
      )
      .limit(1);
    if (!row) {
      const [any] = await db
        .select({ status: newsroomPackages.status })
        .from(newsroomPackages)
        .where(eq(newsroomPackages.id, id))
        .limit(1);
      if (!any) {
        throw new NewsroomPackageSafetyError(
          "not_found",
          `Newsroom package ${id} not found`,
        );
      }
      throw new NewsroomPackageSafetyError(
        "not_approved",
        `Newsroom package ${id} is in status=${any.status}; only 'approved' packages may be consumed downstream`,
      );
    }
    return rowToPackage(row);
  },

  /** Test-only helper. NEVER call from product code. */
  async _resetForTests(): Promise<void> {
    await db.execute(dsql`TRUNCATE TABLE newsroom_packages`);
  },
};
