import crypto from "crypto";
import { desc } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { aiGateway } from "./ai-gateway";
import { listSystemAgents } from "./system-agent-seed";
import { unifiedEvolutionService } from "./unified-evolution-service";
import { realityAlignmentService } from "./reality-alignment-service";
import { newsArticles, type DebateTurn, type LiveDebate, type NewsArticle } from "@shared/schema";

type ManualArticleInput = {
  title: string;
  sourceUrl: string;
  sourceName?: string;
  content: string;
  publishedAt?: string;
};

export type NewsToDebateInput = {
  articleId?: number;
  manualArticle?: ManualArticleInput;
};

type SourceReliability = {
  score: number;
  quality: "low" | "medium" | "high";
  factors: string[];
  conservativeDefaultUsed: boolean;
};

type SelectedDebateAgent = {
  agentId: string;
  key: string;
  displayName: string;
  role: string;
  position: string;
  ues: number | null;
};

type GeneratedTurn = {
  round: number;
  agentKey: string;
  stance: string;
  content: string;
};

type GeneratedClaim = {
  statement: string;
  evidenceUrl?: string;
  evidenceLabel?: string;
  evidenceType?: "supporting" | "contradicting" | "neutral";
  confidence?: number;
};

type AiDraft = {
  summary: string;
  category: string;
  proposition: string;
  breakingScore: number;
  transcript: GeneratedTurn[];
  claims: GeneratedClaim[];
  mougleSynthesis: string;
  openRisks: string[];
};

export type NewsToDebateResult = {
  mode: "admin_review_draft";
  safety: {
    manualTriggerOnly: true;
    autonomousPublishing: false;
    publicPublishing: false;
    youtubeUpload: false;
    podcastAudio: false;
    privateMemoryUsed: false;
  };
  article: {
    id: number;
    title: string;
    sourceUrl: string;
    sourceName: string;
    status: string;
    reusedExisting: boolean;
    duplicateMatchedBy: "articleId" | "sourceUrl" | "titleHash" | "created";
    linkedToDraftDebate: boolean;
  };
  sourceReliability: SourceReliability;
  debate: LiveDebate;
  selectedAgents: SelectedDebateAgent[];
  transcript: DebateTurn[];
  claims: Array<{
    id: string;
    statement: string;
    evidenceUrl: string | null;
    status: string;
    confidenceScore: number;
  }>;
  synthesis: {
    conclusion: string;
    openRisks: string[];
  };
  generatedAt: string;
};

class NewsToDebateError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const INTERNAL_DEBATE_STATUS = "draft";
const DEFAULT_SOURCE_NAME = "Manual admin source";

const SOURCE_RELIABILITY_BASELINES: Record<string, number> = {
  "ars technica": 0.78,
  "wired": 0.76,
  "the verge": 0.7,
  "techcrunch": 0.66,
  "venturebeat": 0.62,
  "new york times": 0.78,
  "nyt tech": 0.78,
  "google news": 0.56,
  "google trends": 0.5,
  "reddit": 0.42,
};

function hasAiConfig() {
  return !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number) {
  return Math.round(clamp01(value) * 1000) / 1000;
}

function generateTitleHash(title: string): string {
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(normalized).digest("hex").substring(0, 16);
}

function generateSlug(title: string, id?: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80)
    .replace(/^-|-$/g, "");
  return id ? `${base}-${id}` : base || `news-to-debate-${Date.now()}`;
}

function textPreview(value: string | null | undefined, max = 5000) {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parsePublishedAt(value?: string) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function scoreSourceReliability(article: NewsArticle): SourceReliability {
  const factors: string[] = [];
  const sourceName = (article.sourceName || "").toLowerCase();
  const domain = sourceDomain(article.sourceUrl);
  const baselineKey = Object.keys(SOURCE_RELIABILITY_BASELINES).find((key) => sourceName.includes(key) || domain.includes(key.replace(/\s+/g, "")));
  let score = baselineKey ? SOURCE_RELIABILITY_BASELINES[baselineKey]! : 0.5;
  let conservativeDefaultUsed = !baselineKey;

  if (baselineKey) factors.push(`Known source baseline: ${baselineKey}.`);
  else factors.push("Unknown source baseline uses neutral conservative default.");

  if (article.sourceType === "rss") {
    score += 0.08;
    factors.push("RSS source type gives a modest reliability lift.");
  }
  if (article.sourceType === "reddit" || sourceName.includes("reddit")) {
    score -= 0.12;
    factors.push("Community feed source lowers reliability until evidence is validated.");
  }
  if (article.sourceUrl && sourceDomain(article.sourceUrl)) {
    score += 0.05;
    factors.push("Source URL is present and parseable.");
  }
  if ((article.originalContent || article.content || article.summary || "").length > 500) {
    score += 0.07;
    factors.push("Article has enough text for analysis.");
  }
  if (article.publishedAt) {
    const ageDays = (Date.now() - new Date(article.publishedAt).getTime()) / 86_400_000;
    if (ageDays >= 0 && ageDays <= 14) {
      score += 0.04;
      factors.push("Publication date is recent.");
    }
  }

  const finalScore = roundScore(score);
  return {
    score: finalScore,
    quality: finalScore >= 0.72 ? "high" : finalScore >= 0.5 ? "medium" : "low",
    factors,
    conservativeDefaultUsed,
  };
}

async function resolveArticle(input: NewsToDebateInput) {
  if (input.articleId) {
    const article = await storage.getNewsArticle(input.articleId);
    if (!article) throw new NewsToDebateError(404, "News article not found");
    return { article, reusedExisting: true, duplicateMatchedBy: "articleId" as const };
  }

  const manual = input.manualArticle;
  if (!manual) {
    throw new NewsToDebateError(400, "Provide articleId or manualArticle");
  }

  const title = manual.title.trim();
  const sourceUrl = manual.sourceUrl.trim();
  const content = manual.content.trim();
  if (title.length < 8 || sourceUrl.length < 8 || content.length < 40) {
    throw new NewsToDebateError(400, "Manual article requires title, source URL, and at least 40 characters of content");
  }

  const existingByUrl = await storage.getNewsArticleByUrl(sourceUrl);
  if (existingByUrl) {
    return { article: existingByUrl, reusedExisting: true, duplicateMatchedBy: "sourceUrl" as const };
  }

  const titleHash = generateTitleHash(title);
  const existingByHash = await storage.getNewsArticleByTitleHash(titleHash);
  if (existingByHash) {
    return { article: existingByHash, reusedExisting: true, duplicateMatchedBy: "titleHash" as const };
  }

  const created = await storage.createNewsArticle({
    sourceUrl,
    sourceName: manual.sourceName?.trim() || DEFAULT_SOURCE_NAME,
    sourceType: "manual",
    originalTitle: title,
    originalContent: content,
    title,
    slug: generateSlug(title),
    titleHash,
    summary: null,
    content: null,
    category: "general",
    imageUrl: null,
    status: "raw",
    publishedAt: parsePublishedAt(manual.publishedAt),
  });

  return { article: created, reusedExisting: false, duplicateMatchedBy: "created" as const };
}

function parseAiDraft(raw: string): AiDraft {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new NewsToDebateError(502, "AI response did not include a valid debate draft JSON object");
  }

  const parsed = JSON.parse(raw.slice(start, end + 1));
  const transcript = Array.isArray(parsed.transcript) ? parsed.transcript : [];
  const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
  const openRisks = Array.isArray(parsed.openRisks) ? parsed.openRisks : [];

  return {
    summary: String(parsed.summary || "").trim(),
    category: String(parsed.category || "general").trim().toLowerCase(),
    proposition: String(parsed.proposition || "").trim(),
    breakingScore: Number(parsed.breakingScore || 0),
    transcript: transcript.map((turn: any, index: number) => ({
      round: Number(turn.round || Math.floor(index / 4) + 1),
      agentKey: String(turn.agentKey || turn.agent || "").trim(),
      stance: String(turn.stance || "analysis").trim(),
      content: String(turn.content || "").trim(),
    })).filter((turn: GeneratedTurn) => turn.content.length > 0),
    claims: claims.map((claim: any) => ({
      statement: String(claim.statement || "").trim(),
      evidenceUrl: typeof claim.evidenceUrl === "string" ? claim.evidenceUrl : undefined,
      evidenceLabel: typeof claim.evidenceLabel === "string" ? claim.evidenceLabel : undefined,
      evidenceType: ["supporting", "contradicting", "neutral"].includes(claim.evidenceType) ? claim.evidenceType : "supporting",
      confidence: typeof claim.confidence === "number" ? claim.confidence : undefined,
    })).filter((claim: GeneratedClaim) => claim.statement.length > 0),
    mougleSynthesis: String(parsed.mougleSynthesis || "").trim(),
    openRisks: openRisks.map((risk: unknown) => String(risk)).filter(Boolean),
  };
}

async function generateAiDraft(article: NewsArticle, sourceReliability: SourceReliability, agents: SelectedDebateAgent[]): Promise<AiDraft> {
  if (!hasAiConfig()) {
    throw new NewsToDebateError(503, "AI integration is not configured. Add OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY to generate a debate draft.");
  }

  const articleText = textPreview(article.content || article.summary || article.originalContent || "", 6000);
  const agentContext = agents.map((agent) => `${agent.key}: ${agent.displayName} — ${agent.role} (${agent.position}, UES ${agent.ues ?? "n/a"})`).join("\n");

  const result = await aiGateway.processRequest({
    callerId: "news-to-debate-mvp",
    callerType: "system",
    actionType: "news_to_debate",
    model: "gpt-5.5",
    skipCreditCheck: true,
    chainId: `news-to-debate-${article.id}-${Date.now()}`,
    maxTokens: 2600,
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content: `You are the controlled Mougle News-to-Debate MVP planner.
Return ONLY valid JSON. Do not include markdown.
You create draft/admin-review material only. Do not publish.
No private memory. Use only the provided article and source URL.

JSON shape:
{
  "summary": "2-3 sentence article summary",
  "category": "ai|tech|science|business|policy|general",
  "proposition": "single debate proposition",
  "breakingScore": 0-100,
  "transcript": [
    { "round": 1, "agentKey": "mougle-chief-intelligence", "stance": "synthesis", "content": "80-130 word draft turn" }
  ],
  "claims": [
    { "statement": "specific factual claim", "evidenceUrl": "source URL if available", "evidenceLabel": "short label", "evidenceType": "supporting|contradicting|neutral", "confidence": 0.5 }
  ],
  "mougleSynthesis": "final conclusion from MOUGLE with uncertainty and evidence limits",
  "openRisks": ["remaining uncertainty or safety concern"]
}

Produce exactly 3 debate rounds. Use the selected agent keys. Include MOUGLE mainly for opening/final synthesis. Keep claims grounded in the article.`
      },
      {
        role: "user",
        content: `Article title: ${article.title}
Source: ${article.sourceName}
URL: ${article.sourceUrl}
Source reliability score: ${sourceReliability.score}
Selected agents:
${agentContext}

Article text:
${articleText || article.originalTitle}`,
      },
    ],
  });

  const draft = parseAiDraft(result.content);
  if (!draft.summary || !draft.proposition || !draft.mougleSynthesis) {
    throw new NewsToDebateError(502, "AI response was missing required summary, proposition, or MOUGLE synthesis fields");
  }
  return draft;
}

function fallbackTurnContent(agent: SelectedDebateAgent, article: NewsArticle, proposition: string, round: number) {
  if (agent.key === "mougle-chief-intelligence") {
    return `MOUGLE frames this as an admin-review debate draft: ${proposition}. The source should be treated with measured confidence until claims are independently validated against additional evidence.`;
  }
  return `${agent.displayName} reviews the article "${article.title}" from a ${agent.position} perspective. Round ${round} should focus on evidence quality, uncertainty, and what would need validation before any public conclusion.`;
}

function normalizeTranscript(draft: AiDraft, selectedAgents: SelectedDebateAgent[], article: NewsArticle) {
  const byKey = new Map(selectedAgents.map((agent) => [agent.key, agent]));
  const normalized = draft.transcript
    .filter((turn) => byKey.has(turn.agentKey))
    .slice(0, 18);

  if (normalized.length >= Math.min(6, selectedAgents.length * 2)) {
    return normalized.map((turn) => ({
      ...turn,
      round: Math.max(1, Math.min(3, turn.round || 1)),
    }));
  }

  const fallback: GeneratedTurn[] = [];
  for (let round = 1; round <= 3; round++) {
    for (const agent of selectedAgents) {
      fallback.push({
        round,
        agentKey: agent.key,
        stance: agent.position,
        content: fallbackTurnContent(agent, article, draft.proposition, round),
      });
    }
  }
  return fallback;
}

async function selectedAgentsFor(article: NewsArticle): Promise<SelectedDebateAgent[]> {
  const agents = await listSystemAgents();
  const enabled = agents.filter((agent: any) => agent.seeded && agent.user?.id && agent.blueprint?.enabled !== false);
  const mougle = enabled.find((agent: any) => agent.key === "mougle-chief-intelligence");
  if (!mougle) {
    throw new NewsToDebateError(409, "MOUGLE system agent is not seeded or enabled. Seed system agents before generating debate drafts.");
  }

  const category = (article.category || "general").toLowerCase();
  const preferredByCategory: Record<string, string[]> = {
    ai: ["aletheia-truth-validation", "arivu-reasoning", "astraion-research", "sentinel-risk", "contrarian-stress-test"],
    tech: ["astraion-research", "aletheia-truth-validation", "arivu-reasoning", "architect-builder", "sentinel-risk"],
    science: ["astraion-research", "aletheia-truth-validation", "arivu-reasoning", "chronarch-context", "contrarian-stress-test"],
    business: ["mercurion-economics", "aletheia-truth-validation", "arivu-reasoning", "dharma-governance", "sentinel-risk"],
    funding: ["mercurion-economics", "dharma-governance", "aletheia-truth-validation", "sentinel-risk", "contrarian-stress-test"],
    policy: ["dharma-governance", "sentinel-risk", "aletheia-truth-validation", "arivu-reasoning", "chronarch-context"],
    general: ["aletheia-truth-validation", "arivu-reasoning", "dharma-governance", "sentinel-risk", "contrarian-stress-test"],
  };
  const preferred = preferredByCategory[category] || preferredByCategory.general;
  const specialistCandidates = enabled.filter((agent: any) => agent.key !== "mougle-chief-intelligence");
  const uesPairs = await Promise.all(specialistCandidates.map(async (agent: any) => {
    try {
      const score = await unifiedEvolutionService.getAgentUes(agent.user.id);
      return [agent.key, score.scores.UES] as const;
    } catch {
      return [agent.key, null] as const;
    }
  }));
  const uesByKey = new Map(uesPairs);

  const selectedSpecialists = specialistCandidates
    .sort((a: any, b: any) => {
      const aPreferred = preferred.indexOf(a.key);
      const bPreferred = preferred.indexOf(b.key);
      const aRank = aPreferred === -1 ? 99 : aPreferred;
      const bRank = bPreferred === -1 ? 99 : bPreferred;
      if (aRank !== bRank) return aRank - bRank;
      return (uesByKey.get(b.key) || 0) - (uesByKey.get(a.key) || 0);
    })
    .slice(0, 5);

  const selected = [mougle, ...selectedSpecialists].slice(0, 6);
  const positions = ["chief synthesis", "evidence validation", "reasoning analysis", "domain research", "risk review", "adversarial stress test"];
  return selected.map((agent: any, index: number) => ({
    agentId: agent.user.id,
    key: agent.key,
    displayName: agent.user.displayName || agent.expectedUsername,
    role: agent.blueprint.role,
    position: positions[index] || "analysis",
    ues: uesByKey.get(agent.key) ?? (agent.key === "mougle-chief-intelligence" ? null : null),
  }));
}

async function createDraftDebate(article: NewsArticle, draft: AiDraft, sourceReliability: SourceReliability) {
  return storage.createLiveDebate({
    title: `Draft: ${draft.proposition.slice(0, 180)}`,
    topic: draft.category || article.category || "general",
    description: `Admin-review News-to-Debate draft for "${article.title}". Source reliability: ${sourceReliability.score}. Original source: ${article.sourceUrl}`,
    status: INTERNAL_DEBATE_STATUS,
    format: "news_to_debate_draft",
    maxAgents: 6,
    maxHumans: 0,
    turnDurationSeconds: 60,
    totalRounds: 3,
    currentRound: 0,
    currentSpeakerId: null,
    createdBy: "env-root-admin",
    consensusSummary: draft.mougleSynthesis,
    disagreementSummary: draft.openRisks.join("\n"),
    confidenceScore: sourceReliability.score,
    startedAt: null,
    endedAt: null,
  });
}

async function saveParticipants(debateId: number, selectedAgents: SelectedDebateAgent[]) {
  const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  const participants = [];
  for (let index = 0; index < selectedAgents.length; index++) {
    const agent = selectedAgents[index]!;
    const participant = await storage.addDebateParticipant({
      debateId,
      userId: agent.agentId,
      role: agent.key === "mougle-chief-intelligence" ? "synthesizer" : "debater",
      participantType: "agent",
      position: agent.position,
      ttsVoice: voices[index % voices.length],
      speakingOrder: index + 1,
      isActive: true,
    });
    participants.push({ agent, participant });
  }
  return participants;
}

async function saveTranscript(debateId: number, turns: GeneratedTurn[], participantPairs: Awaited<ReturnType<typeof saveParticipants>>) {
  const participantByAgentKey = new Map(participantPairs.map((pair) => [pair.agent.key, pair.participant]));
  const saved: DebateTurn[] = [];
  for (let index = 0; index < turns.length; index++) {
    const turn = turns[index]!;
    const participant = participantByAgentKey.get(turn.agentKey) || participantPairs[index % participantPairs.length]?.participant;
    if (!participant) continue;
    const content = turn.content.trim();
    if (!content) continue;
    const savedTurn = await storage.createDebateTurn({
      debateId,
      participantId: participant.id,
      roundNumber: Math.max(1, Math.min(3, turn.round)),
      turnOrder: (index % Math.max(1, participantPairs.length)) + 1,
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      durationSeconds: null,
      audioUrl: null,
      tcsScore: null,
      audienceReaction: {
        draft: true,
        stance: turn.stance,
        generatedBy: "news_to_debate_mvp",
      },
      startedAt: new Date(),
      endedAt: new Date(),
    });
    saved.push(savedTurn);
  }
  return saved;
}

async function saveClaims(article: NewsArticle, debate: LiveDebate, draft: AiDraft, selectedAgents: SelectedDebateAgent[], sourceReliability: SourceReliability) {
  const evidenceSubmitter = selectedAgents.find((agent) => agent.key === "aletheia-truth-validation") || selectedAgents[0];
  const saved = [];
  for (const claim of draft.claims.slice(0, 8)) {
    const realityClaim = await realityAlignmentService.extractClaim({
      content: claim.statement,
      extractedBy: evidenceSubmitter?.agentId || "news-to-debate-mvp",
      status: "unverified",
      confidenceScore: clamp01(claim.confidence ?? sourceReliability.score),
      agreementLevel: 0,
      evidenceStrength: sourceReliability.score,
      contradictionCount: 0,
      evaluationCount: 0,
      domain: draft.category || article.category || "general",
      tags: ["news-to-debate", "admin-review", `debate:${debate.id}`],
      metadata: {
        phase: "phase_13_news_to_debate_mvp",
        newsArticleId: article.id,
        debateId: debate.id,
        sourceUrl: article.sourceUrl,
        draftOnly: true,
      },
    });

    const evidenceUrl = claim.evidenceUrl || article.sourceUrl;
    await realityAlignmentService.addEvidence({
      claimId: realityClaim.id,
      submittedBy: "news-to-debate-mvp",
      submitterType: "system",
      evidenceType: claim.evidenceType || "supporting",
      content: claim.evidenceLabel || `Source article: ${article.title}`,
      sourceUrl: evidenceUrl,
      weight: sourceReliability.score,
      trustScore: sourceReliability.score,
      metadata: {
        newsArticleId: article.id,
        debateId: debate.id,
        draftOnly: true,
      },
    });

    saved.push({
      id: realityClaim.id,
      statement: realityClaim.content,
      evidenceUrl,
      status: realityClaim.status,
      confidenceScore: realityClaim.confidenceScore,
    });
  }
  return saved;
}

async function maybeUpdateArticle(article: NewsArticle, draft: AiDraft, debateId: number) {
  const update: Partial<NewsArticle> = {
    summary: article.summary || draft.summary,
    category: article.category === "general" ? draft.category : article.category,
    impactScore: article.impactScore ?? Math.max(0, Math.min(100, Math.round(draft.breakingScore || 0))),
    processedAt: article.processedAt || new Date(),
  };

  let linkedToDraftDebate = false;
  if (article.status !== "processed") {
    update.debateId = debateId;
    linkedToDraftDebate = true;
  }

  await storage.updateNewsArticle(article.id, update);
  return linkedToDraftDebate;
}

async function listCandidateArticles(limit = 25) {
  return db.select().from(newsArticles)
    .orderBy(desc(newsArticles.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
}

async function generateDraft(input: NewsToDebateInput): Promise<NewsToDebateResult> {
  const resolved = await resolveArticle(input);
  const article = resolved.article;
  const sourceReliability = scoreSourceReliability(article);
  const selectedAgents = await selectedAgentsFor(article);
  const aiDraft = await generateAiDraft(article, sourceReliability, selectedAgents);
  const transcriptDraft = normalizeTranscript(aiDraft, selectedAgents, article);
  const debate = await createDraftDebate(article, aiDraft, sourceReliability);
  const participantPairs = await saveParticipants(debate.id, selectedAgents);
  const transcript = await saveTranscript(debate.id, transcriptDraft, participantPairs);
  const claims = await saveClaims(article, debate, aiDraft, selectedAgents, sourceReliability);
  const linkedToDraftDebate = await maybeUpdateArticle(article, aiDraft, debate.id);
  const updatedDebate = await storage.updateLiveDebate(debate.id, {
    consensusSummary: aiDraft.mougleSynthesis,
    disagreementSummary: aiDraft.openRisks.join("\n"),
    confidenceScore: sourceReliability.score,
  });

  return {
    mode: "admin_review_draft",
    safety: {
      manualTriggerOnly: true,
      autonomousPublishing: false,
      publicPublishing: false,
      youtubeUpload: false,
      podcastAudio: false,
      privateMemoryUsed: false,
    },
    article: {
      id: article.id,
      title: article.title,
      sourceUrl: article.sourceUrl,
      sourceName: article.sourceName,
      status: article.status,
      reusedExisting: resolved.reusedExisting,
      duplicateMatchedBy: resolved.duplicateMatchedBy,
      linkedToDraftDebate,
    },
    sourceReliability,
    debate: updatedDebate,
    selectedAgents,
    transcript,
    claims,
    synthesis: {
      conclusion: aiDraft.mougleSynthesis,
      openRisks: aiDraft.openRisks,
    },
    generatedAt: new Date().toISOString(),
  };
}

export const newsToDebateService = {
  generateDraft,
  listCandidateArticles,
};
