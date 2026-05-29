import OpenAI from "openai";
import { storage } from "../storage";
import type { LiveDebate, DebateParticipant, DebateTurn } from "@shared/schema";
import { aiGateway } from "./ai-gateway";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
}

type VoiceType = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

const AGENT_VOICES: VoiceType[] = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const WORD_LIMIT = { min: 80, max: 120 };

interface DebateState {
  debateId: number;
  turnTimer: ReturnType<typeof setTimeout> | null;
  currentTurnOrder: number;
  isRunning: boolean;
  listeners: Set<(event: DebateEvent) => void>;
}

export interface DebateEvent {
  type: "turn_start" | "turn_end" | "speech_ready" | "round_change" | "debate_start" | "debate_end" | "participant_joined" | "participant_left" | "error" | "transcript_update";
  debateId: number;
  data: any;
}

const activeDebates = new Map<number, DebateState>();

function getDebateState(debateId: number): DebateState | undefined {
  return activeDebates.get(debateId);
}

function emitEvent(debateId: number, event: DebateEvent) {
  const state = activeDebates.get(debateId);
  if (state) {
    state.listeners.forEach(fn => fn(event));
  }
}

export function subscribe(debateId: number, listener: (event: DebateEvent) => void): () => void {
  let state = activeDebates.get(debateId);
  if (!state) {
    state = { debateId, turnTimer: null, currentTurnOrder: 0, isRunning: false, listeners: new Set() };
    activeDebates.set(debateId, state);
  }
  state.listeners.add(listener);
  return () => { state!.listeners.delete(listener); };
}

export function emitOverride(debateId: number, speakerId: string | null) {
  emitEvent(debateId, {
    type: "turn_start",
    debateId,
    data: { overrideSpeakerId: speakerId, moderatorOverride: true },
  });
}

export async function createDebate(params: {
  title: string;
  topic: string;
  description?: string;
  format?: string;
  maxAgents?: number;
  maxHumans?: number;
  turnDurationSeconds?: number;
  totalRounds?: number;
  createdBy: string;
  youtubeStreamKey?: string;
}) {
  const debate = await storage.createLiveDebate({
    title: params.title,
    topic: params.topic,
    description: params.description || null,
    format: params.format || "structured",
    maxAgents: params.maxAgents || 10,
    maxHumans: params.maxHumans || 5,
    turnDurationSeconds: params.turnDurationSeconds || 60,
    totalRounds: params.totalRounds || 5,
    createdBy: params.createdBy,
    youtubeStreamKey: params.youtubeStreamKey || null,
    youtubeStreamUrl: null,
    rtmpUrl: null,
    currentSpeakerId: null,
    startedAt: null,
    endedAt: null,
  });
  return debate;
}

export async function joinDebate(debateId: number, userId: string, participantType: "human" | "agent", position?: string) {
  const debate = await storage.getLiveDebate(debateId);
  if (!debate) throw new Error("Debate not found");
  if (debate.status !== "scheduled" && debate.status !== "lobby") throw new Error("Cannot join debate in current state");

  const participants = await storage.getDebateParticipants(debateId);
  const typeCount = participants.filter(p => p.participantType === participantType).length;
  const maxCount = participantType === "agent" ? debate.maxAgents : debate.maxHumans;
  if (typeCount >= maxCount) throw new Error(`Maximum ${participantType} participants reached`);

  const alreadyJoined = participants.find(p => p.userId === userId);
  if (alreadyJoined) throw new Error("Already participating");

  const voice = participantType === "agent" ? AGENT_VOICES[typeCount % AGENT_VOICES.length] : "alloy";
  const speakingOrder = participants.length + 1;

  const participant = await storage.addDebateParticipant({
    debateId,
    userId,
    role: "debater",
    participantType,
    position: position || null,
    ttsVoice: voice,
    speakingOrder,
    isActive: true,
  });

  if (debate.status === "scheduled") {
    await storage.updateLiveDebate(debateId, { status: "lobby" });
  }

  emitEvent(debateId, { type: "participant_joined", debateId, data: { participant } });
  return participant;
}

export async function startDebate(debateId: number) {
  const debate = await storage.getLiveDebate(debateId);
  if (!debate) throw new Error("Debate not found");

  const participants = await storage.getDebateParticipants(debateId);
  if (participants.length < 2) throw new Error("Need at least 2 participants");

  const updated = await storage.updateLiveDebate(debateId, {
    status: "live",
    currentRound: 1,
    startedAt: new Date(),
  });

  let state = activeDebates.get(debateId);
  if (!state) {
    state = { debateId, turnTimer: null, currentTurnOrder: 0, isRunning: true, listeners: new Set() };
    activeDebates.set(debateId, state);
  }
  state.isRunning = true;
  state.currentTurnOrder = 0;

  try {
    const { promotionSelectorAgent } = await import("./promotion-selector-agent");
    await promotionSelectorAgent.evaluateContent("debate", String(debateId));
  } catch {}

  emitEvent(debateId, {
    type: "debate_start",
    debateId,
    data: { debate: updated, participants, round: 1 },
  });

  advanceTurn(debateId).catch(console.error);
  return updated;
}

async function advanceTurn(debateId: number) {
  const state = activeDebates.get(debateId);
  if (!state || !state.isRunning) return;

  const debate = await storage.getLiveDebate(debateId);
  if (!debate || debate.status !== "live") return;

  const participants = await storage.getDebateParticipants(debateId);
  const activeParticipants = participants.filter(p => p.isActive);

  state.currentTurnOrder++;

  if (state.currentTurnOrder > activeParticipants.length) {
    const nextRound = (debate.currentRound || 0) + 1;
    if (nextRound > debate.totalRounds) {
      await endDebate(debateId);
      return;
    }
    await storage.updateLiveDebate(debateId, { currentRound: nextRound });
    state.currentTurnOrder = 1;
    emitEvent(debateId, { type: "round_change", debateId, data: { round: nextRound } });
  }

  const currentParticipant = activeParticipants[state.currentTurnOrder - 1];
  if (!currentParticipant) {
    await endDebate(debateId);
    return;
  }

  await storage.updateLiveDebate(debateId, { currentSpeakerId: currentParticipant.userId });

  emitEvent(debateId, {
    type: "turn_start",
    debateId,
    data: {
      participant: currentParticipant,
      round: debate.currentRound,
      turnOrder: state.currentTurnOrder,
      durationSeconds: debate.turnDurationSeconds,
    },
  });

  if (currentParticipant.participantType === "agent") {
    generateAgentTurn(debateId, currentParticipant, debate).catch(console.error);
  }

  state.turnTimer = setTimeout(() => {
    endCurrentTurn(debateId).catch(console.error);
  }, (debate.turnDurationSeconds || 60) * 1000);
}

async function generateAgentTurn(debateId: number, participant: DebateParticipant, debate: LiveDebate) {
  try {
    const existingTurns = await storage.getDebateTurns(debateId);
    const recentContext = existingTurns.slice(-6).map(t => `[Turn ${t.turnOrder}]: ${t.content}`).join("\n");
    const user = await storage.getUser(participant.userId);
    const agentName = user?.displayName || "AI Agent";

    const systemPrompt = `You are ${agentName}, an AI debater in a live debate.
Topic: "${debate.topic}"
Your position: ${participant.position || "Open to discussion"}
Format: ${debate.format}

Rules:
- Respond with ${WORD_LIMIT.min}-${WORD_LIMIT.max} words
- Be persuasive and articulate
- Reference previous points when relevant
- Stay on topic
- Be respectful but assertive`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (recentContext) {
      messages.push({ role: "user", content: `Previous debate turns:\n${recentContext}\n\nNow it's your turn to speak. Deliver your argument.` });
    } else {
      messages.push({ role: "user", content: "You are the first speaker. Deliver your opening argument." });
    }

    const gatewayResult = await aiGateway.processRequest({
      callerId: debate.createdBy || participant.userId,
      callerType: "debate",
      actionType: "debate_turn",
      model: "gpt-5.5",
      debateId,
      chainId: `debate-${debateId}`,
      maxTokens: 200,
      messages,
    });
    aiGateway.recordDebateRound(debateId);

    const content = gatewayResult.content || "I have no further arguments at this time.";
    const wordCount = content.split(/\s+/).length;

    const turn = await storage.createDebateTurn({
      debateId,
      participantId: participant.id,
      roundNumber: debate.currentRound || 1,
      turnOrder: activeDebates.get(debateId)?.currentTurnOrder || 1,
      content,
      wordCount,
      durationSeconds: null,
      audioUrl: null,
      tcsScore: null,
      audienceReaction: null,
      startedAt: new Date(),
      endedAt: null,
    });

    emitEvent(debateId, {
      type: "transcript_update",
      debateId,
      data: { turn, participant, agentName },
    });


    await storage.updateDebateParticipant(participant.id, {
      turnsUsed: (participant.turnsUsed || 0) + 1,
    });

  } catch (error) {
    console.error("Error generating agent turn:", error);
    emitEvent(debateId, { type: "error", debateId, data: { error: "Failed to generate agent response" } });
  }
}

export async function submitHumanTurn(debateId: number, userId: string, content: string) {
  const debate = await storage.getLiveDebate(debateId);
  if (!debate || debate.status !== "live") throw new Error("Debate not active");
  if (debate.currentSpeakerId !== userId) throw new Error("Not your turn");

  const participants = await storage.getDebateParticipants(debateId);
  const participant = participants.find(p => p.userId === userId);
  if (!participant) throw new Error("Not a participant");

  const wordCount = content.split(/\s+/).length;

  const turn = await storage.createDebateTurn({
    debateId,
    participantId: participant.id,
    roundNumber: debate.currentRound || 1,
    turnOrder: activeDebates.get(debateId)?.currentTurnOrder || 1,
    content,
    wordCount,
    durationSeconds: null,
    audioUrl: null,
    tcsScore: null,
    audienceReaction: null,
    startedAt: new Date(),
    endedAt: new Date(),
  });

  await storage.updateDebateParticipant(participant.id, {
    turnsUsed: (participant.turnsUsed || 0) + 1,
  });

  emitEvent(debateId, {
    type: "transcript_update",
    debateId,
    data: { turn, participant },
  });

  const state = activeDebates.get(debateId);
  if (state?.turnTimer) {
    clearTimeout(state.turnTimer);
    state.turnTimer = null;
  }

  advanceTurn(debateId).catch(console.error);
  return turn;
}

async function endCurrentTurn(debateId: number) {
  const state = activeDebates.get(debateId);
  if (!state) return;

  if (state.turnTimer) {
    clearTimeout(state.turnTimer);
    state.turnTimer = null;
  }

  emitEvent(debateId, { type: "turn_end", debateId, data: { turnOrder: state.currentTurnOrder } });
  advanceTurn(debateId).catch(console.error);
}

export async function endDebate(debateId: number) {
  const state = activeDebates.get(debateId);
  if (state) {
    state.isRunning = false;
    if (state.turnTimer) {
      clearTimeout(state.turnTimer);
      state.turnTimer = null;
    }
  }
  aiGateway.endDebateTracking(debateId);

  const updated = await storage.updateLiveDebate(debateId, {
    status: "completed",
    endedAt: new Date(),
    currentSpeakerId: null,
  });

  emitEvent(debateId, { type: "debate_end", debateId, data: { debate: updated } });
  activeDebates.delete(debateId);

  try {
    const { projectPipelineService } = await import("./project-pipeline-service");
    projectPipelineService.generateProjectFromDebate(debateId, "auto-debate-completion")
      .then(project => console.log(`[ProjectPipeline] Auto-generated project ${project.id} from debate ${debateId}`))
      .catch(err => console.error(`[ProjectPipeline] Auto-generation failed for debate ${debateId}:`, err?.message));
  } catch (err: any) {
    console.error(`[ProjectPipeline] Failed to import pipeline service:`, err?.message);
  }

  return updated;
}

export async function getDebateWithDetails(debateId: number) {
  const debate = await storage.getLiveDebate(debateId);
  if (!debate) return null;

  const participants = await storage.getDebateParticipants(debateId);
  const turns = await storage.getDebateTurns(debateId);

  const enrichedParticipants = await Promise.all(
    participants.map(async (p) => {
      const user = await storage.getUser(p.userId);
      return { ...p, user: user ? { id: user.id, displayName: user.displayName, avatar: user.avatar, role: user.role } : null };
    })
  );

  return { ...debate, participants: enrichedParticipants, turns };
}

export async function quickRunDebate(debateId: number, agentCount: number = 3, rounds?: number): Promise<any> {
  const debate = await storage.getLiveDebate(debateId);
  if (!debate) throw new Error("Debate not found");
  if (debate.status === "live") throw new Error("Debate is already live");
  if (debate.status === "completed") throw new Error("Debate is already completed");

  const participants = await storage.getDebateParticipants(debateId);
  if (participants.length < 2) {
    await autoPopulateAgents(debateId, agentCount);
  }

  const updatedParticipants = await storage.getDebateParticipants(debateId);
  if (updatedParticipants.length < 2) throw new Error("Not enough agents available to run debate");

  const totalRounds = rounds || debate.totalRounds || 3;
  const maxRounds = Math.min(totalRounds, 3);

  await storage.updateLiveDebate(debateId, {
    status: "live",
    currentRound: 1,
    startedAt: new Date(),
  });

  const activeParticipants = updatedParticipants.filter(p => p.isActive);

  for (let round = 1; round <= maxRounds; round++) {
    await storage.updateLiveDebate(debateId, { currentRound: round });

    for (let turnIdx = 0; turnIdx < activeParticipants.length; turnIdx++) {
      const participant = activeParticipants[turnIdx];
      const currentDebate = await storage.getLiveDebate(debateId);
      if (!currentDebate) break;

      try {
        const existingTurns = await storage.getDebateTurns(debateId);
        const recentContext = existingTurns.slice(-6).map(t => `[Turn ${t.turnOrder}]: ${t.content}`).join("\n");
        const user = await storage.getUser(participant.userId);
        const agentName = user?.displayName || "AI Agent";

        const systemPrompt = `You are ${agentName}, an AI debater in a live debate.
Topic: "${debate.topic}"
Your position: ${participant.position || "Open to discussion"}
Format: ${debate.format || "structured"}

Rules:
- Respond with ${WORD_LIMIT.min}-${WORD_LIMIT.max} words
- Be persuasive and articulate
- Reference previous points when relevant
- Stay on topic
- Be respectful but assertive`;

        const messages: any[] = [{ role: "system", content: systemPrompt }];
        if (recentContext) {
          messages.push({ role: "user", content: `Previous debate turns:\n${recentContext}\n\nNow it's your turn to speak. Deliver your argument.` });
        } else {
          messages.push({ role: "user", content: "You are the first speaker. Deliver your opening argument." });
        }

        const result = await aiGateway.processRequest({
          callerId: debate.createdBy || participant.userId,
          callerType: "debate",
          actionType: "debate_turn",
          model: "gpt-5.5",
          debateId,
          chainId: `debate-quickrun-${debateId}`,
          maxTokens: 200,
          messages,
        });

        const content = result.content || "I have no further arguments at this time.";
        const wordCount = content.split(/\s+/).length;

        await storage.createDebateTurn({
          debateId,
          participantId: participant.id,
          roundNumber: round,
          turnOrder: turnIdx + 1,
          content,
          wordCount,
          durationSeconds: null,
          audioUrl: null,
          tcsScore: null,
          audienceReaction: null,
          startedAt: new Date(),
          endedAt: new Date(),
        });

        await storage.updateDebateParticipant(participant.id, {
          turnsUsed: (participant.turnsUsed || 0) + 1,
        });

        console.log(`[QuickRun] Debate ${debateId} - Round ${round}, ${agentName} delivered turn`);
      } catch (err: any) {
        console.error(`[QuickRun] Error generating turn for participant ${participant.id}:`, err?.message);
      }
    }
  }

  const updated = await storage.updateLiveDebate(debateId, {
    status: "completed",
    endedAt: new Date(),
    currentSpeakerId: null,
  });

  console.log(`[QuickRun] Debate ${debateId} completed`);

  return updated;
}

export async function autoPopulateAgents(debateId: number, count: number = 3) {
  const agents = await storage.getAgentUsers();
  const debate = await storage.getLiveDebate(debateId);
  if (!debate) throw new Error("Debate not found");

  const currentParticipants = await storage.getDebateParticipants(debateId);
  const currentIds = new Set(currentParticipants.map(p => p.userId));

  const availableAgents = agents.filter(a => !currentIds.has(a.id)).slice(0, count);
  const positions = ["for", "against", "neutral"];

  const added = [];
  for (let i = 0; i < availableAgents.length; i++) {
    const agent = availableAgents[i];
    const position = positions[i % positions.length];
    const participant = await joinDebate(debateId, agent.id, "agent", position);
    added.push(participant);
  }
  return added;
}
