import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { aiGateway } from "./ai-gateway";
import { listSystemAgents } from "./system-agent-seed";
import {
  claimEvidence,
  liveDebates,
  newsArticles,
  podcastScriptPackages,
  realityClaims,
  type ClaimEvidence,
  type DebateParticipant,
  type DebateTurn,
  type LiveDebate,
  type NewsArticle,
  type PodcastScriptPackagePayload,
  type PodcastScriptSafetyNotes,
  type RealityClaim,
  type User,
} from "@shared/schema";

type PackageInput = {
  debateId: number;
  generatedBy: string;
};

type ClaimWithEvidence = RealityClaim & {
  evidence: ClaimEvidence[];
};

type ParticipantWithUser = DebateParticipant & {
  user: Pick<User, "id" | "displayName" | "username" | "role"> | null;
  agentKey: string | null;
};

type SourceReference = {
  label: string;
  url: string | null;
  claimId?: string;
  confidenceScore?: number;
  status?: string;
};

export type PodcastScriptDebateCandidate = {
  id: number;
  title: string;
  topic: string;
  status: string;
  format: string;
  consensusSummary: string | null;
  sourceReliability: number | null;
  createdAt: Date | null;
  sourceArticle: {
    id: number;
    title: string;
    sourceName: string;
    sourceUrl: string;
  } | null;
};

export type PodcastScriptGenerateResult = {
  mode: "admin_review_script_package";
  safety: PodcastScriptSafetyNotes;
  package: typeof podcastScriptPackages.$inferSelect;
  debate: PodcastScriptDebateCandidate;
  packagePreview: PodcastScriptPackagePayload;
  sourceReferences: SourceReference[];
  generatedAt: string;
};

class PodcastScriptError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const SCRIPT_PACKAGE_STATUS = "admin_review";
const NEWS_TO_DEBATE_FORMAT = "news_to_debate_draft";
const INTERNAL_DEBATE_STATUSES = new Set(["draft", "internal", "admin_review"]);

function hasAiConfig() {
  return !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
}

function textPreview(value: string | null | undefined, max = 9000) {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function sourceReliabilityFor(debate: LiveDebate) {
  return typeof debate.confidenceScore === "number" ? Math.max(0, Math.min(1, debate.confidenceScore)) : null;
}

async function findSourceArticle(debate: LiveDebate): Promise<NewsArticle | null> {
  const [linked] = await db.select().from(newsArticles).where(eq(newsArticles.debateId, debate.id)).limit(1);
  if (linked) return linked;

  const sourceUrl = debate.description?.match(/Original source:\s*(\S+)/i)?.[1];
  if (!sourceUrl) return null;

  const [byUrl] = await db.select().from(newsArticles).where(eq(newsArticles.sourceUrl, sourceUrl)).limit(1);
  return byUrl || null;
}

async function candidateFromDebate(debate: LiveDebate): Promise<PodcastScriptDebateCandidate> {
  const sourceArticle = await findSourceArticle(debate);
  return {
    id: debate.id,
    title: debate.title,
    topic: debate.topic,
    status: debate.status,
    format: debate.format,
    consensusSummary: debate.consensusSummary,
    sourceReliability: sourceReliabilityFor(debate),
    createdAt: debate.createdAt,
    sourceArticle: sourceArticle ? {
      id: sourceArticle.id,
      title: sourceArticle.title,
      sourceName: sourceArticle.sourceName,
      sourceUrl: sourceArticle.sourceUrl,
    } : null,
  };
}

async function listCandidateDebates(limit = 25): Promise<PodcastScriptDebateCandidate[]> {
  const debates = await db.select().from(liveDebates)
    .where(and(
      eq(liveDebates.format, NEWS_TO_DEBATE_FORMAT),
      sql`${liveDebates.status} in ('draft', 'internal', 'admin_review')`,
    ))
    .orderBy(desc(liveDebates.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));

  return Promise.all(debates.map(candidateFromDebate));
}

async function listPackages(debateId?: number) {
  if (debateId) {
    return db.select().from(podcastScriptPackages)
      .where(eq(podcastScriptPackages.debateId, debateId))
      .orderBy(desc(podcastScriptPackages.createdAt));
  }

  return db.select().from(podcastScriptPackages)
    .orderBy(desc(podcastScriptPackages.createdAt))
    .limit(100);
}

async function loadClaims(debateId: number): Promise<ClaimWithEvidence[]> {
  const tag = `debate:${debateId}`;
  const claims = await db.select().from(realityClaims)
    .where(sql`(${realityClaims.metadata}->>'debateId' = ${String(debateId)} OR ${realityClaims.tags} @> ARRAY[${tag}]::text[])`)
    .orderBy(desc(realityClaims.createdAt))
    .limit(12);

  const withEvidence: ClaimWithEvidence[] = [];
  for (const claim of claims) {
    const evidence = await db.select().from(claimEvidence)
      .where(eq(claimEvidence.claimId, claim.id))
      .orderBy(desc(claimEvidence.createdAt));
    withEvidence.push({ ...claim, evidence });
  }
  return withEvidence;
}

async function loadParticipants(debateId: number): Promise<ParticipantWithUser[]> {
  const participants = await storage.getDebateParticipants(debateId);
  const systemAgents = await listSystemAgents();
  const keyByUserId = new Map<string, string>();
  for (const agent of systemAgents as any[]) {
    if (agent.user?.id) keyByUserId.set(agent.user.id, agent.key);
  }

  return Promise.all(participants.map(async (participant) => {
    const user = await storage.getUser(participant.userId);
    return {
      ...participant,
      user: user ? {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        role: user.role,
      } : null,
      agentKey: keyByUserId.get(participant.userId) || null,
    };
  }));
}

function buildSourceReferences(article: NewsArticle | null, claims: ClaimWithEvidence[]): SourceReference[] {
  const references: SourceReference[] = [];
  if (article) {
    references.push({
      label: `${article.sourceName}: ${article.title}`,
      url: article.sourceUrl,
    });
  }

  for (const claim of claims) {
    if (claim.evidence.length === 0) {
      references.push({
        label: `Claim without direct evidence: ${claim.content}`,
        url: null,
        claimId: claim.id,
        confidenceScore: claim.confidenceScore,
        status: claim.status,
      });
      continue;
    }

    for (const evidence of claim.evidence.slice(0, 3)) {
      references.push({
        label: evidence.content,
        url: evidence.sourceUrl,
        claimId: claim.id,
        confidenceScore: claim.confidenceScore,
        status: claim.status,
      });
    }
  }

  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.label}:${reference.url || ""}:${reference.claimId || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function weakClaimsFor(claims: ClaimWithEvidence[]) {
  return claims
    .filter((claim) => (
      !["supported", "consensus"].includes(claim.status)
      || claim.confidenceScore < 0.6
      || claim.contradictionCount > 0
      || claim.evidenceStrength < 0.5
    ))
    .map((claim) => ({
      claimId: claim.id,
      statement: claim.content,
      status: claim.status,
      confidenceScore: claim.confidenceScore,
      reason: claim.contradictionCount > 0
        ? "Claim has recorded contradictions."
        : claim.evidence.length === 0
          ? "Claim has no stored evidence reference."
          : "Claim is not yet supported or consensus-level.",
    }));
}

function buildSafetyNotes(debate: LiveDebate, claims: ClaimWithEvidence[], references: SourceReference[]): PodcastScriptSafetyNotes {
  const reliability = sourceReliabilityFor(debate);
  const weakOrDisputedClaims = weakClaimsFor(claims);
  const notes: string[] = [
    "Generated as internal/admin-review script material only.",
    "No audio, TTS, upload, publishing, social posting, or autonomous worker was triggered.",
    "No private memory was accessed.",
  ];

  if (reliability === null) notes.push("Source reliability is unavailable; treat source confidence as unknown.");
  else if (reliability < 0.5) notes.push("Source reliability is low; script must label uncertainty clearly.");
  else if (reliability < 0.7) notes.push("Source reliability is moderate; keep claims sourced and avoid overstatement.");

  if (weakOrDisputedClaims.length > 0) {
    notes.push(`${weakOrDisputedClaims.length} weak, disputed, or not-yet-validated claim(s) require cautious wording.`);
  }
  if (references.length === 0) {
    notes.push("No source/evidence references were found; package should not be approved for public use.");
  }

  return {
    manualTriggerOnly: true,
    internalDraftOnly: true,
    audioGenerated: false,
    ttsGenerated: false,
    youtubeUpload: false,
    podcastHostingUpload: false,
    socialPosting: false,
    publicPublishing: false,
    privateMemoryUsed: false,
    sourceReliability: reliability,
    weakOrDisputedClaims,
    notes,
  };
}

async function buildSpeakerAssignments(participants: ParticipantWithUser[]) {
  const systemAgents = await listSystemAgents();
  const byKey = new Map((systemAgents as any[]).map((agent) => [agent.key, agent]));
  const assignments = [
    {
      agentKey: "voxa-public-voice",
      displayName: byKey.get("voxa-public-voice")?.user?.displayName || "Voxa",
      role: "News reader, podcast host, and public voice",
      assignment: "Lead host and narrator for the 2-minute news brief and 10-minute podcast package.",
    },
    {
      agentKey: "mougle-chief-intelligence",
      displayName: byKey.get("mougle-chief-intelligence")?.user?.displayName || "MOUGLE",
      role: "Chief Intelligence",
      assignment: "Final truth-governed synthesis and closing conclusion.",
    },
  ];

  for (const participant of participants) {
    if (!participant.agentKey || participant.agentKey === "voxa-public-voice" || participant.agentKey === "mougle-chief-intelligence") continue;
    assignments.push({
      agentKey: participant.agentKey,
      displayName: participant.user?.displayName || participant.user?.username || participant.agentKey,
      role: participant.position || participant.role || "debate contributor",
      assignment: "Referenced as a contributor from the validated debate draft; does not execute new autonomous actions.",
    });
  }

  return assignments;
}

function transcriptForPrompt(turns: DebateTurn[], participants: ParticipantWithUser[]) {
  const byParticipantId = new Map(participants.map((participant) => [participant.id, participant]));
  return turns.map((turn) => {
    const participant = byParticipantId.get(turn.participantId);
    const name = participant?.user?.displayName || participant?.agentKey || `Speaker ${turn.participantId}`;
    const role = participant?.position || participant?.role || "analysis";
    return `Round ${turn.roundNumber}, Turn ${turn.turnOrder} — ${name} (${role}): ${turn.content}`;
  }).join("\n\n");
}

function parseAiPackage(raw: string, assignments: PodcastScriptPackagePayload["speakerAssignments"], references: SourceReference[], safetyNotes: string[]): PodcastScriptPackagePayload {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new PodcastScriptError(502, "AI response did not include a valid podcast script package JSON object");
  }

  const parsed = JSON.parse(raw.slice(start, end + 1));
  const packagePayload: PodcastScriptPackagePayload = {
    twoMinuteNewsScript: safeString(parsed.twoMinuteNewsScript),
    tenMinutePodcastScript: safeString(parsed.tenMinutePodcastScript),
    youtubeTitle: safeString(parsed.youtubeTitle),
    youtubeDescription: safeString(parsed.youtubeDescription),
    shortsHooks: safeStringArray(parsed.shortsHooks).slice(0, 8),
    thumbnailText: safeString(parsed.thumbnailText),
    speakerAssignments: Array.isArray(parsed.speakerAssignments) && parsed.speakerAssignments.length > 0
      ? parsed.speakerAssignments.map((assignment: any) => ({
        agentKey: safeString(assignment.agentKey, "unknown"),
        displayName: safeString(assignment.displayName, "Unknown"),
        role: safeString(assignment.role, "Contributor"),
        assignment: safeString(assignment.assignment, "Review contribution."),
      }))
      : assignments,
    complianceSafetyNotes: safeStringArray(parsed.complianceSafetyNotes).concat(safetyNotes).filter(Boolean).slice(0, 20),
    sourceEvidenceReferences: references,
    adminReviewStatus: safeString(parsed.adminReviewStatus, "draft_internal_admin_review"),
  };

  if (!packagePayload.twoMinuteNewsScript || !packagePayload.tenMinutePodcastScript || !packagePayload.youtubeTitle) {
    throw new PodcastScriptError(502, "AI response was missing required script package fields");
  }

  return packagePayload;
}

async function generateAiScriptPackage(params: {
  debate: LiveDebate;
  article: NewsArticle | null;
  turns: DebateTurn[];
  participants: ParticipantWithUser[];
  claims: ClaimWithEvidence[];
  references: SourceReference[];
  safety: PodcastScriptSafetyNotes;
  assignments: PodcastScriptPackagePayload["speakerAssignments"];
}) {
  if (!hasAiConfig()) {
    throw new PodcastScriptError(503, "AI integration is not configured. Add OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY to generate a podcast script package.");
  }

  const transcript = textPreview(transcriptForPrompt(params.turns, params.participants), 9000);
  const claims = params.claims.map((claim) => (
    `- ${claim.content} [status=${claim.status}, confidence=${claim.confidenceScore}, evidence=${claim.evidence.length}]`
  )).join("\n");
  const references = params.references.map((reference, index) => (
    `${index + 1}. ${reference.label}${reference.url ? ` — ${reference.url}` : ""}${reference.status ? ` (${reference.status}, confidence ${reference.confidenceScore})` : ""}`
  )).join("\n");
  const assignments = params.assignments.map((assignment) => (
    `${assignment.displayName} (${assignment.agentKey}): ${assignment.assignment}`
  )).join("\n");

  const response = await aiGateway.processRequest({
    callerId: "podcast-script-engine",
    callerType: "system",
    actionType: "podcast_script",
    model: "gpt-5.5",
    skipCreditCheck: true,
    chainId: `podcast-script-${params.debate.id}-${Date.now()}`,
    maxTokens: 3200,
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content: `You are the Mougle Podcast Script Engine.
Return ONLY valid JSON. Do not include markdown.
Generate text/script packages only. Do not generate audio, TTS, uploads, social posts, or public publishing instructions.
Use Voxa as the presenter/host. Use MOUGLE synthesis as the final truth-governed conclusion.
Label weak, disputed, low-confidence, or insufficiently sourced claims clearly.

JSON shape:
{
  "twoMinuteNewsScript": "voice-ready 2-minute news brief led by Voxa",
  "tenMinutePodcastScript": "10-minute podcast script with host narration, agent contribution segments, source callouts, and MOUGLE conclusion",
  "youtubeTitle": "title for later admin review",
  "youtubeDescription": "description with source/evidence references and draft status",
  "shortsHooks": ["hook 1", "hook 2"],
  "thumbnailText": "short thumbnail text",
  "speakerAssignments": [
    { "agentKey": "voxa-public-voice", "displayName": "Voxa", "role": "Host", "assignment": "..." }
  ],
  "complianceSafetyNotes": ["note"],
  "adminReviewStatus": "draft_internal_admin_review"
}`,
      },
      {
        role: "user",
        content: `Debate title: ${params.debate.title}
Topic: ${params.debate.topic}
Source article: ${params.article ? `${params.article.title} (${params.article.sourceName}) ${params.article.sourceUrl}` : "No linked source article found"}
Source reliability: ${params.safety.sourceReliability ?? "unknown"}

Speaker assignments:
${assignments}

MOUGLE synthesis:
${params.debate.consensusSummary || "No MOUGLE synthesis stored"}

Open disagreements / risks:
${params.debate.disagreementSummary || "None recorded"}

Safety notes:
${params.safety.notes.join("\n")}

Claims:
${claims || "No stored claims found"}

Sources and evidence references:
${references || "No source/evidence references found"}

Debate transcript:
${transcript || "No transcript found"}`,
      },
    ],
  });

  return parseAiPackage(response.content, params.assignments, params.references, params.safety.notes);
}

async function generatePackage(input: PackageInput): Promise<PodcastScriptGenerateResult> {
  const debate = await storage.getLiveDebate(input.debateId);
  if (!debate || debate.format !== NEWS_TO_DEBATE_FORMAT || !INTERNAL_DEBATE_STATUSES.has(debate.status)) {
    throw new PodcastScriptError(404, "News-to-Debate draft debate not found");
  }

  const [article, turns, participants, claims] = await Promise.all([
    findSourceArticle(debate),
    storage.getDebateTurns(debate.id),
    loadParticipants(debate.id),
    loadClaims(debate.id),
  ]);

  if (turns.length === 0) {
    throw new PodcastScriptError(409, "This draft debate has no transcript turns to convert into a script package");
  }

  const references = buildSourceReferences(article, claims);
  const safety = buildSafetyNotes(debate, claims, references);
  const assignments = await buildSpeakerAssignments(participants);
  const scriptPackage = await generateAiScriptPackage({
    debate,
    article,
    turns,
    participants,
    claims,
    references,
    safety,
    assignments,
  });

  const [created] = await db.insert(podcastScriptPackages).values({
    debateId: debate.id,
    sourceArticleId: article?.id || null,
    status: SCRIPT_PACKAGE_STATUS,
    scriptPackage,
    safetyNotes: safety,
    generatedBy: input.generatedBy,
    updatedAt: new Date(),
  }).returning();

  return {
    mode: "admin_review_script_package",
    safety,
    package: created,
    debate: await candidateFromDebate(debate),
    packagePreview: scriptPackage,
    sourceReferences: references,
    generatedAt: new Date().toISOString(),
  };
}

export const podcastScriptEngine = {
  listCandidateDebates,
  listPackages,
  generatePackage,
};
