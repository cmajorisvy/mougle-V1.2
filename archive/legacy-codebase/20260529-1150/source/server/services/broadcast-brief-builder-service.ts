/**
 * Newsroom T3 — Broadcast Brief Builder service.
 *
 * Builds a canonical `BroadcastBrief` from a verified-newsroom data
 * package. Every brief is strictly draft, internal-only, and data-only:
 *
 *   - No public publishing, social posting, YouTube upload.
 *   - No live Unreal / Cinema 4D / Movie Render Queue / Sequencer / 4D
 *     hardware calls.
 *   - No copyrighted video fetch.
 *   - No logo / watermark removal.
 *   - No publicUrl, no signedUrl, no execution, no real send.
 *   - Every brief stores a locked `safetyEnvelope` (literal-typed) that
 *     downstream consumers can re-validate.
 *
 * Generation uses one OpenAI gpt-5.5 call per story with strict JSON.
 * Persistence is Postgres-backed (Drizzle). Idempotency is enforced by
 * a unique index on `data_package_id`.
 */

import { and, desc, eq, sql as dsql } from "drizzle-orm";
import OpenAI from "openai";
import { db } from "../db";
import { broadcastBriefs, type BroadcastBriefRow } from "@shared/schema";
import {
  BroadcastBriefAiPayloadSchema,
  BROADCAST_BRIEF_SAFETY_ENVELOPE,
  type BroadcastBrief,
  type BroadcastBriefAiPayload,
  type BroadcastBriefPatch,
  type BroadcastBriefStatus,
  type VerifiedKnowledge,
} from "../../shared/newsroom-types";
import { AI_MODELS } from "../config/ai-models";

export class BroadcastBriefSafetyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "BroadcastBriefSafetyError";
  }
}

export type BriefExtractor = (
  input: BriefGenerationInput,
) => Promise<BroadcastBriefAiPayload>;

export interface BriefGenerationInput {
  dataPackageId: string;
  storyId: string;
  articleId: number | null;
  verifiedKnowledge: VerifiedKnowledge;
}

interface ServiceOptions {
  extractor?: BriefExtractor;
  now?: () => Date;
}

function rowToBrief(r: BroadcastBriefRow): BroadcastBrief {
  return {
    id: r.id,
    storyId: r.storyId,
    articleId: r.articleId ?? null,
    dataPackageId: r.dataPackageId,
    verifiedKnowledgeId: r.verifiedKnowledgeId,
    headline: r.headline,
    summary: r.summary,
    location: r.location,
    region: r.region ?? null,
    country: r.country ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    eventType: r.eventType,
    entities: r.entities as BroadcastBrief["entities"],
    mood: r.mood as BroadcastBrief["mood"],
    impactScore: r.impactScore as BroadcastBrief["impactScore"],
    breakingNews: r.breakingNews,
    scriptBeats: r.scriptBeats,
    visualNeeds: r.visualNeeds,
    bRollNeeds: r.bRollNeeds,
    mapNeeds: r.mapNeeds as BroadcastBrief["mapNeeds"],
    anchorMode: r.anchorMode as BroadcastBrief["anchorMode"],
    sensitivity: r.sensitivity as BroadcastBrief["sensitivity"],
    rightsFlags: r.rightsFlags,
    approvalStatus: r.approvalStatus as BroadcastBriefStatus,
    visibility: "admin_only_internal" as const,
    publicUrl: null,
    signedUrl: null,
    realSendAllowed: false as const,
    executionEnabled: false as const,
    safetyEnvelope: BROADCAST_BRIEF_SAFETY_ENVELOPE,
    approvedBy: r.approvedBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/* --------------------------------------------------------------------- */
/* AI prompt                                                              */
/* --------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You are Mougle's verified-newsroom Broadcast Brief Builder.
Given a VERIFIED news story, produce a single JSON object that downstream broadcast layers will consume for INTERNAL admin review only.

Return ONLY valid JSON. No markdown fences, no commentary.

Schema (all fields required):
{
  "headline": string,
  "summary": string,
  "location": { "city": string|null, "country": string|null, "lat": number|null, "lon": number|null },
  "region": string|null,
  "country": string|null,
  "latitude": number|null,
  "longitude": number|null,
  "eventType": string,
  "entities": [ { "name": string, "kind": "person"|"org"|"location"|"other" } ],
  "mood": "neutral"|"urgent"|"celebratory"|"somber"|"analytical"|"investigative",
  "impactScore": "high"|"medium"|"low",
  "breakingNews": boolean,
  "scriptBeats": { "coldOpen": string, "keyFacts": string, "context": string, "signOff": string },
  "visualNeeds": { "coldOpen": [string], "keyFacts": [string], "context": [string], "signOff": [string] },
  "bRollNeeds": [string],
  "mapNeeds": { "needsMap": boolean, "focus": string|null, "zoomHint": "world"|"region"|"country"|"city"|"none" },
  "anchorMode": "solo_desk"|"two_anchor"|"reporter_remote"|"studio_panel"|"voiceover_only",
  "sensitivity": {
    "graphicViolence": boolean, "minors": boolean, "disputed": boolean,
    "medical": boolean, "electoral": boolean, "legal": boolean,
    "death": boolean, "financial": boolean, "notes": [string]
  },
  "rightsFlags": { "hasRestrictions": boolean, "notes": [string] }
}

Rules:
- Use ONLY facts present in the input. Never invent numbers, locations, or quotes.
- If a location field is unknown, use null.
- Visual / B-roll needs must be neutral descriptors. Never reference copyrighted footage, branded logos, watermarks, or specific TV networks.
- Mark sensitivity flags conservatively. When in doubt about a sensitive category, set it true.
- breakingNews=true ONLY when the input explicitly indicates a still-developing or just-happened event.`;

function buildUserPrompt(vk: VerifiedKnowledge): string {
  const claimsSummary = vk.claims
    .slice(0, 8)
    .map((c, i) => `(${i + 1}) ${c.statement}${c.metric ? ` [${c.metric}]` : ""}`)
    .join("\n");
  const keyFacts = vk.keyFacts
    .slice(0, 10)
    .map((f, i) => `(${i + 1}) ${f.statement}`)
    .join("\n");
  return [
    `Title: ${vk.canonicalTitle}`,
    `Summary: ${vk.canonicalSummary}`,
    `Status: ${vk.status}`,
    `Aggregate confidence: ${vk.confidence.aggregate.toFixed(3)}`,
    `Distinct sources: ${vk.sourceCoverage.distinctSources}`,
    `Earliest published: ${vk.sourceCoverage.earliestPublishedAt}`,
    `Latest published: ${vk.sourceCoverage.latestPublishedAt}`,
    keyFacts ? `Key facts:\n${keyFacts}` : "Key facts: (none)",
    claimsSummary ? `Claims:\n${claimsSummary}` : "Claims: (none)",
  ].join("\n\n");
}

function getOpenAIClient(): OpenAI | null {
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

async function defaultExtractor(
  input: BriefGenerationInput,
): Promise<BroadcastBriefAiPayload> {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new BroadcastBriefSafetyError(
      "openai_unavailable",
      "OpenAI API key not configured; cannot generate broadcast brief",
    );
  }
  const completion = await openai.chat.completions.create({
    model: AI_MODELS.PRIMARY,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input.verifiedKnowledge) },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2000,
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) {
    throw new BroadcastBriefSafetyError(
      "empty_ai_response",
      "OpenAI returned empty response for broadcast brief",
    );
  }
  const cleaned = raw.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new BroadcastBriefSafetyError(
      "invalid_json",
      "Broadcast brief AI response was not valid JSON",
    );
  }
  const result = BroadcastBriefAiPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new BroadcastBriefSafetyError(
      "invalid_shape",
      `Broadcast brief AI response failed schema: ${result.error.errors[0]?.message ?? "unknown"}`,
    );
  }
  return result.data;
}

/* --------------------------------------------------------------------- */
/* Public API                                                             */
/* --------------------------------------------------------------------- */

export const broadcastBriefBuilderService = {
  /**
   * Trigger entry point. Builds (or returns) the brief for a data
   * package. Idempotent on `dataPackageId` (unique index + ON CONFLICT
   * DO NOTHING). The AI extractor is only invoked when no brief exists
   * for the package yet.
   *
   * The brief is always written with `approvalStatus='draft'`,
   * `visibility='admin_only_internal'`, `realSendAllowed=false`,
   * `executionEnabled=false`. The locked safety envelope is stamped on
   * every row.
   */
  async generateForDataPackage(
    input: BriefGenerationInput,
    opts: ServiceOptions = {},
  ): Promise<BroadcastBrief> {
    if (input.verifiedKnowledge.status !== "verified") {
      throw new BroadcastBriefSafetyError(
        "not_verified",
        `Cannot generate brief for non-verified knowledge (status=${input.verifiedKnowledge.status})`,
      );
    }
    if (input.verifiedKnowledge.id !== input.storyId) {
      throw new BroadcastBriefSafetyError(
        "story_mismatch",
        "storyId must match verifiedKnowledge.id",
      );
    }

    const [existing] = await db
      .select()
      .from(broadcastBriefs)
      .where(eq(broadcastBriefs.dataPackageId, input.dataPackageId))
      .limit(1);
    if (existing) return rowToBrief(existing);

    const extractor = opts.extractor ?? defaultExtractor;
    const ai = await extractor(input);
    const ts = opts.now?.() ?? new Date();

    const inserted = await db
      .insert(broadcastBriefs)
      .values({
        storyId: input.storyId,
        articleId: input.articleId,
        dataPackageId: input.dataPackageId,
        verifiedKnowledgeId: input.verifiedKnowledge.id,
        headline: ai.headline,
        summary: ai.summary,
        location: ai.location,
        region: ai.region,
        country: ai.country,
        latitude: ai.latitude,
        longitude: ai.longitude,
        eventType: ai.eventType,
        entities: ai.entities,
        mood: ai.mood,
        impactScore: ai.impactScore,
        breakingNews: ai.breakingNews,
        scriptBeats: ai.scriptBeats,
        visualNeeds: ai.visualNeeds,
        bRollNeeds: ai.bRollNeeds,
        mapNeeds: ai.mapNeeds,
        anchorMode: ai.anchorMode,
        sensitivity: ai.sensitivity,
        rightsFlags: ai.rightsFlags,
        // SAFETY: these are stamped server-side, never accepted from caller.
        approvalStatus: "draft",
        visibility: "admin_only_internal",
        publicUrl: null,
        signedUrl: null,
        realSendAllowed: false,
        executionEnabled: false,
        safetyEnvelope: { ...BROADCAST_BRIEF_SAFETY_ENVELOPE },
        approvedBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .onConflictDoNothing({ target: broadcastBriefs.dataPackageId })
      .returning();

    if (inserted[0]) return rowToBrief(inserted[0]);

    const [winner] = await db
      .select()
      .from(broadcastBriefs)
      .where(eq(broadcastBriefs.dataPackageId, input.dataPackageId))
      .limit(1);
    if (!winner) {
      throw new BroadcastBriefSafetyError(
        "race_lost",
        "Failed to insert or fetch broadcast brief after conflict",
      );
    }
    return rowToBrief(winner);
  },

  /** Returns briefs in descending creation order (history view). */
  async listBriefs(
    filter?: { approvalStatus?: BroadcastBriefStatus; limit?: number },
  ): Promise<BroadcastBrief[]> {
    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 200);
    const rows = filter?.approvalStatus
      ? await db
          .select()
          .from(broadcastBriefs)
          .where(eq(broadcastBriefs.approvalStatus, filter.approvalStatus))
          .orderBy(desc(broadcastBriefs.createdAt))
          .limit(limit)
      : await db
          .select()
          .from(broadcastBriefs)
          .orderBy(desc(broadcastBriefs.createdAt))
          .limit(limit);
    return rows.map(rowToBrief);
  },

  async getBrief(id: string): Promise<BroadcastBrief | null> {
    const [row] = await db
      .select()
      .from(broadcastBriefs)
      .where(eq(broadcastBriefs.id, id))
      .limit(1);
    return row ? rowToBrief(row) : null;
  },

  async getBriefByDataPackageId(
    dataPackageId: string,
  ): Promise<BroadcastBrief | null> {
    const [row] = await db
      .select()
      .from(broadcastBriefs)
      .where(eq(broadcastBriefs.dataPackageId, dataPackageId))
      .limit(1);
    return row ? rowToBrief(row) : null;
  },

  /**
   * Admin-only PATCH. Content fields are editable; safety-critical
   * fields (publicUrl, signedUrl, realSendAllowed, executionEnabled,
   * visibility, safetyEnvelope) are NOT in the patch schema and cannot
   * be changed through this surface.
   */
  async patchBrief(
    id: string,
    patch: BroadcastBriefPatch,
    actor: { adminId: string },
    opts: ServiceOptions = {},
  ): Promise<BroadcastBrief> {
    const [existing] = await db
      .select()
      .from(broadcastBriefs)
      .where(eq(broadcastBriefs.id, id))
      .limit(1);
    if (!existing) {
      throw new BroadcastBriefSafetyError(
        "not_found",
        `Broadcast brief ${id} not found`,
      );
    }

    const next: Partial<BroadcastBriefRow> = {
      updatedAt: opts.now?.() ?? new Date(),
    };
    if (patch.headline !== undefined) next.headline = patch.headline;
    if (patch.summary !== undefined) next.summary = patch.summary;
    if (patch.location !== undefined) next.location = patch.location;
    if (patch.region !== undefined) next.region = patch.region;
    if (patch.country !== undefined) next.country = patch.country;
    if (patch.latitude !== undefined) next.latitude = patch.latitude;
    if (patch.longitude !== undefined) next.longitude = patch.longitude;
    if (patch.eventType !== undefined) next.eventType = patch.eventType;
    if (patch.entities !== undefined) next.entities = patch.entities;
    if (patch.mood !== undefined) next.mood = patch.mood;
    if (patch.impactScore !== undefined) next.impactScore = patch.impactScore;
    if (patch.breakingNews !== undefined) next.breakingNews = patch.breakingNews;
    if (patch.scriptBeats !== undefined) next.scriptBeats = patch.scriptBeats;
    if (patch.visualNeeds !== undefined) next.visualNeeds = patch.visualNeeds;
    if (patch.bRollNeeds !== undefined) next.bRollNeeds = patch.bRollNeeds;
    if (patch.mapNeeds !== undefined) next.mapNeeds = patch.mapNeeds;
    if (patch.anchorMode !== undefined) next.anchorMode = patch.anchorMode;
    if (patch.sensitivity !== undefined) next.sensitivity = patch.sensitivity;
    if (patch.rightsFlags !== undefined) next.rightsFlags = patch.rightsFlags;

    if (patch.approvalStatus !== undefined) {
      next.approvalStatus = patch.approvalStatus;
      if (patch.approvalStatus === "approved") {
        next.approvedBy = actor.adminId;
      } else if (
        patch.approvalStatus === "draft" ||
        patch.approvalStatus === "archived"
      ) {
        next.approvedBy = null;
      }
    }

    const [updated] = await db
      .update(broadcastBriefs)
      .set(next)
      .where(eq(broadcastBriefs.id, id))
      .returning();
    return rowToBrief(updated);
  },

  /**
   * SAFETY GATE: the ONLY function downstream code may use to consume a
   * brief. Throws unless `approvalStatus === 'approved'`. Downstream
   * services MUST go through this — never read the DB directly.
   */
  async readApprovedBrief(id: string): Promise<BroadcastBrief> {
    const [row] = await db
      .select()
      .from(broadcastBriefs)
      .where(
        and(
          eq(broadcastBriefs.id, id),
          eq(broadcastBriefs.approvalStatus, "approved"),
        ),
      )
      .limit(1);
    if (!row) {
      const [any] = await db
        .select({ approvalStatus: broadcastBriefs.approvalStatus })
        .from(broadcastBriefs)
        .where(eq(broadcastBriefs.id, id))
        .limit(1);
      if (!any) {
        throw new BroadcastBriefSafetyError(
          "not_found",
          `Broadcast brief ${id} not found`,
        );
      }
      throw new BroadcastBriefSafetyError(
        "not_approved",
        `Broadcast brief ${id} is in approvalStatus=${any.approvalStatus}; only 'approved' briefs may be consumed downstream`,
      );
    }
    return rowToBrief(row);
  },

  /** Test-only helper. NEVER call from product code. */
  async _resetForTests(): Promise<void> {
    await db.execute(dsql`TRUNCATE TABLE broadcast_briefs`);
  },
};
