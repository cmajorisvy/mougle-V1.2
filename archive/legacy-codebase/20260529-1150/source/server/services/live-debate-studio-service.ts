import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  claimEvidence,
  claims,
  consensusRecords,
  debateParticipants,
  debateTurns,
  evidence as legacyEvidence,
  liveDebates,
  realityClaims,
  users,
} from "@shared/schema";
import { riskManagementService } from "./risk-management-service";
import { safeModeService } from "./safe-mode-service";
import { unifiedEvolutionService } from "./unified-evolution-service";

type DebateRow = typeof liveDebates.$inferSelect;
type ParticipantRow = typeof debateParticipants.$inferSelect;
type TurnRow = typeof debateTurns.$inferSelect;
type UserRow = Pick<typeof users.$inferSelect, "id" | "username" | "displayName" | "avatar" | "role" | "badge" | "rankLevel">;

export type StudioDisplayStatus = "draft" | "scheduled" | "live" | "paused" | "ended" | "archived";

export type StudioActor = {
  id: string;
  type: string;
  ipAddress?: string;
};

type StudioActionInput = {
  reason?: string;
};

type StudioQuestionInput = {
  question: string;
  authorLabel?: string;
  reason?: string;
};

class LiveDebateStudioError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const displayStatusMap: Record<string, StudioDisplayStatus> = {
  admin_review: "draft",
  active: "live",
  completed: "ended",
  closed: "ended",
  internal: "draft",
  running: "live",
};

const allowedDisplayStatuses = new Set<StudioDisplayStatus>(["draft", "scheduled", "live", "paused", "ended", "archived"]);

function normalizeStatus(status: string | null | undefined): StudioDisplayStatus {
  const normalized = (status || "scheduled").toLowerCase();
  if (allowedDisplayStatuses.has(normalized as StudioDisplayStatus)) return normalized as StudioDisplayStatus;
  return displayStatusMap[normalized] || "draft";
}

function clampLimit(limit: number | undefined, fallback = 50, max = 100) {
  if (!Number.isFinite(limit || NaN)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(limit!)));
}

function truncate(value: string | null | undefined, max = 420) {
  const text = (value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

function safeJsonRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function average(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (usable.length === 0) return null;
  return Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 100) / 100;
}

function speakerSortValue(participant: ParticipantRow, index: number) {
  return typeof participant.speakingOrder === "number" ? participant.speakingOrder : index + 1;
}

function participantDisplayName(participant: ParticipantRow, user: UserRow | undefined) {
  return user?.displayName || user?.username || participant.userId;
}

function summarizeDebate(debate: DebateRow, participants: ParticipantRow[], turns: TurnRow[]) {
  const activeParticipants = participants.filter((participant) => participant.isActive);
  const tcsAverage = average(turns.map((turn) => turn.tcsScore));
  return {
    id: debate.id,
    title: debate.title,
    topic: debate.topic,
    status: debate.status,
    displayStatus: normalizeStatus(debate.status),
    format: debate.format,
    currentRound: debate.currentRound,
    totalRounds: debate.totalRounds,
    participantCount: participants.length,
    activeParticipantCount: activeParticipants.length,
    transcriptTurnCount: turns.length,
    tcsAverage,
    confidenceScore: debate.confidenceScore ?? null,
    createdAt: debate.createdAt,
    startedAt: debate.startedAt,
    endedAt: debate.endedAt,
  };
}

function resolveCurrentAndNextSpeaker(
  debate: DebateRow,
  activeParticipants: ParticipantRow[],
  turns: TurnRow[],
) {
  const ordered = activeParticipants
    .map((participant, index) => ({ participant, order: speakerSortValue(participant, index) }))
    .sort((a, b) => a.order - b.order)
    .map(({ participant }) => participant);

  const currentSpeaker = debate.currentSpeakerId
    ? ordered.find((participant) => participant.userId === debate.currentSpeakerId || String(participant.id) === debate.currentSpeakerId) || null
    : null;

  const lastTurn = turns.at(-1) || null;
  const lastTurnParticipant = lastTurn
    ? ordered.find((participant) => participant.id === lastTurn.participantId) || null
    : null;
  const reference = currentSpeaker || lastTurnParticipant;
  const referenceIndex = reference ? ordered.findIndex((participant) => participant.id === reference.id) : -1;
  const nextSpeaker = ordered.length > 0 ? ordered[(referenceIndex + 1 + ordered.length) % ordered.length] || null : null;

  return { currentSpeaker, nextSpeaker };
}

function buildTimer(debate: DebateRow, currentSpeaker: ParticipantRow | null, turns: TurnRow[]) {
  const displayStatus = normalizeStatus(debate.status);
  const turnDurationSeconds = debate.turnDurationSeconds || 60;
  const lastTurn = turns.at(-1) || null;
  const anchor = currentSpeaker
    ? (lastTurn?.endedAt || lastTurn?.startedAt || debate.startedAt || debate.createdAt)
    : (debate.startedAt || debate.createdAt);
  const anchorMs = anchor ? new Date(anchor).getTime() : Date.now();
  const elapsedSeconds = displayStatus === "live"
    ? Math.max(0, Math.floor((Date.now() - anchorMs) / 1000))
    : 0;
  return {
    simulatedOnly: true,
    turnDurationSeconds,
    elapsedSeconds: Math.min(turnDurationSeconds, elapsedSeconds),
    remainingSeconds: Math.max(0, turnDurationSeconds - elapsedSeconds),
    running: displayStatus === "live",
    source: currentSpeaker ? "current_or_last_turn_timestamp" : "debate_timestamp",
  };
}

async function loadUsers(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, UserRow>();
  const rows = await db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    avatar: users.avatar,
    role: users.role,
    badge: users.badge,
    rankLevel: users.rankLevel,
  }).from(users).where(inArray(users.id, Array.from(new Set(userIds))));
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadEvidence(debateId: number) {
  const debateIdText = String(debateId);
  const debateRef = `debate:${debateId}`;
  const claimRows = await db.select().from(realityClaims)
    .where(sql`${realityClaims.metadata}->>'debateId' = ${debateIdText}`)
    .orderBy(desc(realityClaims.createdAt))
    .limit(25);
  const claimIds = claimRows.map((claim) => claim.id);
  const evidenceRows = claimIds.length > 0
    ? await db.select().from(claimEvidence)
      .where(inArray(claimEvidence.claimId, claimIds))
      .orderBy(desc(claimEvidence.createdAt))
      .limit(80)
    : [];
  const consensusRows = claimIds.length > 0
    ? await db.select().from(consensusRecords)
      .where(inArray(consensusRecords.claimId, claimIds))
      .orderBy(desc(consensusRecords.createdAt))
      .limit(25)
    : [];

  const legacyClaimRows = await db.select().from(claims)
    .where(eq(claims.postId, debateRef))
    .orderBy(desc(claims.createdAt))
    .limit(15);
  const legacyClaimIds = legacyClaimRows.map((claim) => claim.id);
  const legacyEvidenceRows = legacyClaimIds.length > 0
    ? await db.select().from(legacyEvidence)
      .where(inArray(legacyEvidence.claimId, legacyClaimIds))
      .orderBy(desc(legacyEvidence.createdAt))
      .limit(40)
    : [];

  return {
    claims: claimRows.map((claim) => ({
      id: claim.id,
      statement: truncate(claim.content, 360),
      status: claim.status,
      confidenceScore: claim.confidenceScore,
      evidenceStrength: claim.evidenceStrength,
      agreementLevel: claim.agreementLevel,
      contradictionCount: claim.contradictionCount,
      domain: claim.domain,
      tags: claim.tags || [],
      source: "reality_claims",
    })),
    evidence: evidenceRows.map((item) => ({
      id: item.id,
      claimId: item.claimId,
      evidenceType: item.evidenceType,
      content: truncate(item.content, 320),
      sourceUrl: item.sourceUrl,
      trustScore: item.trustScore,
      weight: item.weight,
      source: "claim_evidence",
    })),
    consensus: consensusRows.map((record) => ({
      id: record.id,
      claimId: record.claimId,
      previousStatus: record.previousStatus,
      newStatus: record.newStatus,
      previousConfidence: record.previousConfidence,
      newConfidence: record.newConfidence,
      participantCount: record.participantCount,
      evidenceCount: record.evidenceCount,
      debateRounds: record.debateRounds,
      trigger: record.trigger,
      source: "consensus_records",
    })),
    legacyClaims: legacyClaimRows.map((claim) => ({
      id: claim.id,
      subject: claim.subject,
      statement: truncate(claim.statement, 360),
      metric: claim.metric,
      timeReference: claim.timeReference,
      evidenceLinks: claim.evidenceLinks || [],
      source: "claims",
    })),
    legacyEvidence: legacyEvidenceRows.map((item) => ({
      id: item.id,
      claimId: item.claimId,
      url: item.url,
      label: item.label,
      evidenceType: item.evidenceType,
      source: "evidence",
    })),
    linkedDataOnly: true,
  };
}

async function buildParticipantSummaries(participants: ParticipantRow[]) {
  const userMap = await loadUsers(participants.map((participant) => participant.userId));
  const summaries = await Promise.all(participants.map(async (participant, index) => {
    const user = userMap.get(participant.userId);
    let ues: null | {
      UES: number;
      P: number;
      D: number;
      Omega: number;
      Xi: number;
      collapseRisk: string;
      sourceQuality: string;
    } = null;
    if (participant.participantType === "agent") {
      try {
        const score = await unifiedEvolutionService.getAgentUes(participant.userId);
        ues = {
          UES: score.scores.UES,
          P: score.scores.P,
          D: score.scores.D,
          Omega: score.scores.Omega,
          Xi: score.scores.Xi,
          collapseRisk: score.collapseRisk.level,
          sourceQuality: score.sourceQuality.overall,
        };
      } catch {
        ues = null;
      }
    }
    return {
      id: participant.id,
      userId: participant.userId,
      displayName: participantDisplayName(participant, user),
      username: user?.username || null,
      avatar: user?.avatar || null,
      userRole: user?.role || null,
      badge: user?.badge || null,
      rankLevel: user?.rankLevel || null,
      role: participant.role,
      participantType: participant.participantType,
      position: participant.position,
      ttsVoice: participant.ttsVoice,
      speakingOrder: speakerSortValue(participant, index),
      totalSpeakingTime: participant.totalSpeakingTime,
      turnsUsed: participant.turnsUsed,
      isActive: participant.isActive,
      joinedAt: participant.joinedAt,
      ues,
    };
  }));
  return summaries.sort((a, b) => a.speakingOrder - b.speakingOrder);
}

class LiveDebateStudioService {
  async listDebates(limit?: number) {
    const debateRows = await db.select().from(liveDebates)
      .orderBy(desc(liveDebates.createdAt))
      .limit(clampLimit(limit));
    const debateIds = debateRows.map((debate) => debate.id);
    const participantRows = debateIds.length > 0
      ? await db.select().from(debateParticipants).where(inArray(debateParticipants.debateId, debateIds))
      : [];
    const turnRows = debateIds.length > 0
      ? await db.select().from(debateTurns).where(inArray(debateTurns.debateId, debateIds))
      : [];

    return debateRows.map((debate) => summarizeDebate(
      debate,
      participantRows.filter((participant) => participant.debateId === debate.id),
      turnRows.filter((turn) => turn.debateId === debate.id),
    ));
  }

  async getStudioState(debateId: number) {
    const [debate] = await db.select().from(liveDebates).where(eq(liveDebates.id, debateId));
    if (!debate) throw new LiveDebateStudioError(404, "Debate not found");

    const [participantRows, turnRows, evidenceBundle, safeMode] = await Promise.all([
      db.select().from(debateParticipants)
        .where(eq(debateParticipants.debateId, debateId))
        .orderBy(asc(debateParticipants.speakingOrder), asc(debateParticipants.id)),
      db.select().from(debateTurns)
        .where(eq(debateTurns.debateId, debateId))
        .orderBy(asc(debateTurns.roundNumber), asc(debateTurns.turnOrder), asc(debateTurns.createdAt)),
      loadEvidence(debateId),
      safeModeService.getStatus(),
    ]);

    const participants = await buildParticipantSummaries(participantRows);
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));
    const activeParticipantRows = participantRows.filter((participant) => participant.isActive);
    const { currentSpeaker, nextSpeaker } = resolveCurrentAndNextSpeaker(debate, activeParticipantRows, turnRows);
    const currentSpeakerSummary = currentSpeaker ? participantById.get(currentSpeaker.id) || null : null;
    const nextSpeakerSummary = nextSpeaker ? participantById.get(nextSpeaker.id) || null : null;
    const tcsAverage = average(turnRows.map((turn) => turn.tcsScore));
    const participantUes = participants
      .map((participant) => participant.ues?.UES)
      .filter((value): value is number => typeof value === "number");
    const uesAverage = average(participantUes);

    return {
      generatedAt: new Date().toISOString(),
      adminOnly: true,
      controlsRootAdminOnly: true,
      noAutonomousExecution: true,
      debate: {
        id: debate.id,
        title: debate.title,
        topic: debate.topic,
        description: debate.description,
        status: debate.status,
        displayStatus: normalizeStatus(debate.status),
        format: debate.format,
        currentRound: debate.currentRound,
        totalRounds: debate.totalRounds,
        currentSpeakerId: debate.currentSpeakerId,
        turnDurationSeconds: debate.turnDurationSeconds,
        confidenceScore: debate.confidenceScore ?? null,
        createdAt: debate.createdAt,
        startedAt: debate.startedAt,
        endedAt: debate.endedAt,
      },
      stage: {
        currentSpeaker: currentSpeakerSummary,
        nextSpeaker: nextSpeakerSummary,
        timer: buildTimer(debate, currentSpeaker, turnRows),
        statusLabels: ["draft", "scheduled", "live", "paused", "ended", "archived"] as StudioDisplayStatus[],
      },
      participants,
      transcript: turnRows.map((turn) => {
        const participant = participantById.get(turn.participantId) || null;
        return {
          id: turn.id,
          debateId: turn.debateId,
          participantId: turn.participantId,
          participantName: participant?.displayName || `Participant ${turn.participantId}`,
          participantType: participant?.participantType || null,
          roundNumber: turn.roundNumber,
          turnOrder: turn.turnOrder,
          content: turn.content,
          wordCount: turn.wordCount,
          durationSeconds: turn.durationSeconds,
          tcsScore: turn.tcsScore,
          audienceReaction: safeJsonRecord(turn.audienceReaction),
          startedAt: turn.startedAt,
          endedAt: turn.endedAt,
          createdAt: turn.createdAt,
        };
      }),
      evidence: evidenceBundle,
      metrics: {
        tcsAverage,
        uesAverage,
        participantUesCount: participantUes.length,
        claimsCount: evidenceBundle.claims.length + evidenceBundle.legacyClaims.length,
        evidenceCount: evidenceBundle.evidence.length + evidenceBundle.legacyEvidence.length,
        transcriptTurnCount: turnRows.length,
      },
      mougleSummary: {
        consensusSummary: debate.consensusSummary,
        disagreementSummary: debate.disagreementSummary,
        confidenceScore: debate.confidenceScore ?? null,
      },
      safeMode: {
        globalSafeMode: safeMode.controls.globalSafeMode,
        pauseExternalAgentActions: safeMode.controls.pauseExternalAgentActions,
        banners: [
          ...(safeMode.controls.globalSafeMode ? ["Global safe mode is on. Manual controls remain explicit."] : []),
          ...(safeMode.controls.pauseExternalAgentActions ? ["External agent actions are paused by safe-mode controls."] : []),
        ],
      },
      adminQuestionQueue: {
        placeholderOnly: true,
        persistentStorageDeferred: true,
        items: [] as any[],
      },
      safeguards: {
        noPublicMutationRoutes: true,
        noAutonomousLiveStream: true,
        noAutonomousAgentExecution: true,
        noPrivateMemoryExposure: true,
        displayOnlyTimer: true,
      },
    };
  }

  async pauseDebate(debateId: number, input: StudioActionInput, actor: StudioActor) {
    const debate = await this.loadDebateForAction(debateId);
    if (["ended", "archived"].includes(normalizeStatus(debate.status))) {
      throw new LiveDebateStudioError(400, "Ended or archived debates cannot be paused.");
    }
    const [updated] = await db.update(liveDebates)
      .set({ status: "paused", streamingActive: false })
      .where(eq(liveDebates.id, debateId))
      .returning();
    await this.audit("live_studio_pause", debateId, actor, {
      previousStatus: debate.status,
      nextStatus: "paused",
      reason: input.reason || null,
    });
    return this.getStudioState(updated.id);
  }

  async resumeDebate(debateId: number, input: StudioActionInput, actor: StudioActor) {
    const debate = await this.loadDebateForAction(debateId);
    if (["ended", "archived"].includes(normalizeStatus(debate.status))) {
      throw new LiveDebateStudioError(400, "Ended or archived debates cannot be resumed.");
    }
    const [updated] = await db.update(liveDebates)
      .set({
        status: "live",
        startedAt: debate.startedAt || new Date(),
        endedAt: null,
        streamingActive: false,
      })
      .where(eq(liveDebates.id, debateId))
      .returning();
    await this.audit("live_studio_resume", debateId, actor, {
      previousStatus: debate.status,
      nextStatus: "live",
      reason: input.reason || null,
      streamingActive: false,
    });
    return this.getStudioState(updated.id);
  }

  async endDebate(debateId: number, input: StudioActionInput, actor: StudioActor) {
    const debate = await this.loadDebateForAction(debateId);
    const [updated] = await db.update(liveDebates)
      .set({
        status: "ended",
        endedAt: new Date(),
        currentSpeakerId: null,
        streamingActive: false,
      })
      .where(eq(liveDebates.id, debateId))
      .returning();
    await this.audit("live_studio_end", debateId, actor, {
      previousStatus: debate.status,
      nextStatus: "ended",
      reason: input.reason || null,
      streamingActive: false,
    }, "high");
    return this.getStudioState(updated.id);
  }

  async addQuestionPlaceholder(debateId: number, input: StudioQuestionInput, actor: StudioActor) {
    await this.loadDebateForAction(debateId);
    await this.audit("live_studio_admin_question_placeholder", debateId, actor, {
      authorLabel: input.authorLabel || "admin",
      questionPreview: truncate(input.question, 180),
      reason: input.reason || null,
      persisted: false,
      deferredPersistentQueue: true,
    });
    return {
      accepted: true,
      placeholderOnly: true,
      persisted: false,
      message: "Question captured for audit only. Persistent audience/admin queue storage is deferred for a later phase.",
      state: await this.getStudioState(debateId),
    };
  }

  async ejectParticipant(debateId: number, participantId: number, input: StudioActionInput, actor: StudioActor) {
    const debate = await this.loadDebateForAction(debateId);
    const [participant] = await db.select().from(debateParticipants)
      .where(and(eq(debateParticipants.id, participantId), eq(debateParticipants.debateId, debateId)));
    if (!participant) throw new LiveDebateStudioError(404, "Participant not found for this debate.");

    await db.update(debateParticipants)
      .set({ isActive: false })
      .where(eq(debateParticipants.id, participantId));
    if (debate.currentSpeakerId === participant.userId || debate.currentSpeakerId === String(participant.id)) {
      await db.update(liveDebates)
        .set({ currentSpeakerId: null })
        .where(eq(liveDebates.id, debateId));
    }
    await this.audit("live_studio_eject_participant", debateId, actor, {
      participantId,
      participantUserId: participant.userId,
      previousActive: participant.isActive,
      nextActive: false,
      reason: input.reason || null,
    }, "high");
    return this.getStudioState(debateId);
  }

  private async loadDebateForAction(debateId: number) {
    const [debate] = await db.select().from(liveDebates).where(eq(liveDebates.id, debateId));
    if (!debate) throw new LiveDebateStudioError(404, "Debate not found");
    return debate;
  }

  private async audit(
    action: string,
    debateId: number,
    actor: StudioActor,
    details: Record<string, any>,
    riskLevel: "low" | "medium" | "high" | "critical" = "medium",
  ) {
    await riskManagementService.logAudit({
      actorId: actor.id,
      actorType: actor.type,
      action,
      resourceType: "live_debate",
      resourceId: String(debateId),
      outcome: "success",
      riskLevel,
      details: {
        phase: "phase_28_live_debate_studio_mvp",
        manualRootAdminAction: true,
        ...details,
      },
      ipAddress: actor.ipAddress,
    });
  }
}

export const liveDebateStudioService = new LiveDebateStudioService();
