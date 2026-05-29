import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { db } from "../db";
import { storage } from "../storage";
import { textToSpeech } from "../replit_integrations/audio/client";
import {
  podcastAudioJobs,
  podcastScriptPackages,
  type PodcastAudioJob,
  type PodcastAudioJobSegment,
  type PodcastAudioVoiceProfile,
  type PodcastScriptPackage,
  type PodcastScriptPackagePayload,
} from "@shared/schema";

type ProviderPreference = "auto" | "elevenlabs" | "replit_openai_audio" | "mock";
type ScriptTypePreference = "two_minute" | "ten_minute" | "both";
type JobStatus = "queued" | "processing" | "completed" | "mock" | "failed";
type VoiceSegmentStatus = PodcastAudioJobSegment["status"];
type OpenAiVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

type TtsProviderName = "elevenlabs" | "replit_openai_audio" | "mock";

type TtsProviderStatus = {
  selected: TtsProviderName;
  elevenLabsConfigured: boolean;
  replitOpenAiAudioConfigured: boolean;
  mockAvailable: true;
  message: string;
};

type VoiceSegmentInput = {
  scriptType: PodcastAudioJobSegment["scriptType"];
  agentKey: string;
  displayName: string;
  role: string;
  text: string;
};

type ProviderResult = {
  mode: "audio" | "mock";
  audioBuffer: Buffer | null;
  mimeType: string | null;
  extension: string | null;
  model: string;
  estimatedCost: number;
  actualCost: number;
  message: string | null;
};

type TtsProvider = {
  name: TtsProviderName;
  model: string;
  synthesize(segment: VoiceSegmentInput, profile: PodcastAudioVoiceProfile): Promise<ProviderResult>;
};

class PodcastVoiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const AUDIO_OUTPUT_DIR = join(process.cwd(), "generated_podcast_audio");
const MAX_SEGMENT_CHARS = 2400;

const OPENAI_VOICE_BY_AGENT: Record<string, OpenAiVoice> = {
  "voxa-public-voice": "nova",
  "mougle-chief-intelligence": "onyx",
  "aletheia-truth-validation": "echo",
  "arivu-reasoning": "fable",
  "astraion-research": "shimmer",
  "mercurion-economics": "alloy",
  "dharma-governance": "nova",
  "chronarch-context": "fable",
  "sentinel-risk": "onyx",
  "architect-builder": "echo",
  "contrarian-stress-test": "onyx",
};

const ELEVENLABS_ENV_BY_AGENT: Record<string, string> = {
  "voxa-public-voice": "VOXA_ELEVENLABS_VOICE_ID",
  "mougle-chief-intelligence": "MOUGLE_ELEVENLABS_VOICE_ID",
  "aletheia-truth-validation": "ALETHEIA_ELEVENLABS_VOICE_ID",
  "arivu-reasoning": "ARIVU_ELEVENLABS_VOICE_ID",
  "astraion-research": "ASTRAION_ELEVENLABS_VOICE_ID",
  "mercurion-economics": "MERCURION_ELEVENLABS_VOICE_ID",
  "dharma-governance": "DHARMA_ELEVENLABS_VOICE_ID",
  "chronarch-context": "CHRONARCH_ELEVENLABS_VOICE_ID",
  "sentinel-risk": "SENTINEL_ELEVENLABS_VOICE_ID",
  "architect-builder": "ARCHITECT_ELEVENLABS_VOICE_ID",
  "contrarian-stress-test": "CONTRARIAN_ELEVENLABS_VOICE_ID",
};

function hasElevenLabsConfig() {
  return !!process.env.ELEVENLABS_API_KEY?.trim();
}

function hasReplitOpenAiAudioConfig() {
  return !!(process.env.OPENAI_API_KEY?.trim() || process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim());
}

function roundCost(value: number) {
  return Math.round(value * 10000) / 10000;
}

function estimateCost(provider: TtsProviderName, characterCount: number) {
  if (provider === "mock") return 0;
  const rate = provider === "elevenlabs" ? 0.00003 : 0.000015;
  return roundCost(characterCount * rate);
}

function providerStatus(preference: ProviderPreference = "auto"): TtsProviderStatus {
  const elevenLabsConfigured = hasElevenLabsConfig();
  const replitOpenAiAudioConfigured = hasReplitOpenAiAudioConfig();

  if (preference === "elevenlabs" && elevenLabsConfigured) {
    return {
      selected: "elevenlabs",
      elevenLabsConfigured,
      replitOpenAiAudioConfigured,
      mockAvailable: true,
      message: "ElevenLabs is configured for internal draft audio generation.",
    };
  }

  if (preference === "replit_openai_audio" && replitOpenAiAudioConfigured) {
    return {
      selected: "replit_openai_audio",
      elevenLabsConfigured,
      replitOpenAiAudioConfigured,
      mockAvailable: true,
      message: "Replit/OpenAI audio is configured as the fallback provider.",
    };
  }

  if (preference === "mock") {
    return {
      selected: "mock",
      elevenLabsConfigured,
      replitOpenAiAudioConfigured,
      mockAvailable: true,
      message: "Mock/dry-run mode selected. No audio files will be generated.",
    };
  }

  if (preference !== "auto") {
    return {
      selected: "mock",
      elevenLabsConfigured,
      replitOpenAiAudioConfigured,
      mockAvailable: true,
      message: "Requested provider is not configured. Mock/dry-run mode is available.",
    };
  }

  if (elevenLabsConfigured) {
    return {
      selected: "elevenlabs",
      elevenLabsConfigured,
      replitOpenAiAudioConfigured,
      mockAvailable: true,
      message: "ElevenLabs will be used for internal draft audio generation.",
    };
  }

  if (replitOpenAiAudioConfigured) {
    return {
      selected: "replit_openai_audio",
      elevenLabsConfigured,
      replitOpenAiAudioConfigured,
      mockAvailable: true,
      message: "Replit/OpenAI audio will be used for internal draft audio generation.",
    };
  }

  return {
    selected: "mock",
    elevenLabsConfigured,
    replitOpenAiAudioConfigured,
    mockAvailable: true,
    message: "No TTS provider key is configured. Jobs run in mock/dry-run mode.",
  };
}

function requireExplicitProviderConfigured(preference: ProviderPreference, status: TtsProviderStatus) {
  if (preference === "elevenlabs" && status.selected !== "elevenlabs") {
    throw new PodcastVoiceError(503, "ElevenLabs is not configured. Add ELEVENLABS_API_KEY or use mock/dry-run mode.");
  }
  if (preference === "replit_openai_audio" && status.selected !== "replit_openai_audio") {
    throw new PodcastVoiceError(503, "Replit/OpenAI audio is not configured. Add OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY, or use mock/dry-run mode.");
  }
}

function elevenLabsVoiceId(agentKey: string) {
  const envName = ELEVENLABS_ENV_BY_AGENT[agentKey];
  return (
    (envName ? process.env[envName]?.trim() : "") ||
    process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() ||
    "21m00Tcm4TlvDq8ikWAM"
  );
}

function voiceLabelFor(agentKey: string, provider: TtsProviderName) {
  if (provider === "elevenlabs") return `${agentKey} ElevenLabs voice`;
  if (provider === "replit_openai_audio") return OPENAI_VOICE_BY_AGENT[agentKey] || "alloy";
  return `${agentKey} mock voice`;
}

function normalizeText(value: string) {
  return value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function chunkText(text: string, maxChars = MAX_SEGMENT_CHARS) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length <= maxChars) {
      current = (current ? `${current}\n\n${paragraph}` : paragraph).trim();
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }
    for (let i = 0; i < paragraph.length; i += maxChars) {
      chunks.push(paragraph.slice(i, i + maxChars).trim());
    }
    current = "";
  }

  if (current) chunks.push(current);
  return chunks;
}

function extractMougleConclusion(script: string) {
  const normalized = normalizeText(script);
  if (!normalized) return "";

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const mougleLines = lines.filter((line) => /mougle/i.test(line)).slice(-4);
  if (mougleLines.length > 0) return mougleLines.join("\n").slice(0, 1600);

  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  return (paragraphs.at(-1) || "").slice(0, 1600);
}

function buildVoiceProfileMapping(
  scriptPackage: PodcastScriptPackagePayload,
  provider: TtsProviderName,
): Record<string, PodcastAudioVoiceProfile> {
  const assignments = [...scriptPackage.speakerAssignments];
  if (!assignments.some((assignment) => assignment.agentKey === "voxa-public-voice")) {
    assignments.unshift({
      agentKey: "voxa-public-voice",
      displayName: "Voxa",
      role: "News reader, podcast host, and public voice",
      assignment: "Host and narrator for internal draft audio.",
    });
  }
  if (!assignments.some((assignment) => assignment.agentKey === "mougle-chief-intelligence")) {
    assignments.push({
      agentKey: "mougle-chief-intelligence",
      displayName: "MOUGLE",
      role: "Chief Intelligence",
      assignment: "Final truth-governed conclusion voice.",
    });
  }

  return Object.fromEntries(assignments.map((assignment) => {
    const voiceId = provider === "elevenlabs"
      ? elevenLabsVoiceId(assignment.agentKey)
      : provider === "replit_openai_audio"
        ? (OPENAI_VOICE_BY_AGENT[assignment.agentKey] || "alloy")
        : `${assignment.agentKey}-mock-voice`;

    return [assignment.agentKey, {
      agentKey: assignment.agentKey,
      displayName: assignment.displayName,
      role: assignment.role,
      provider,
      voiceId,
      voiceLabel: voiceLabelFor(assignment.agentKey, provider),
      assignment: assignment.assignment,
    }];
  }));
}

function buildSegmentInputs(scriptPackage: PodcastScriptPackagePayload, scriptType: ScriptTypePreference): VoiceSegmentInput[] {
  const voxa = scriptPackage.speakerAssignments.find((assignment) => assignment.agentKey === "voxa-public-voice") || {
    agentKey: "voxa-public-voice",
    displayName: "Voxa",
    role: "News reader, podcast host, and public voice",
  };
  const mougle = scriptPackage.speakerAssignments.find((assignment) => assignment.agentKey === "mougle-chief-intelligence") || {
    agentKey: "mougle-chief-intelligence",
    displayName: "MOUGLE",
    role: "Chief Intelligence",
  };

  const segments: VoiceSegmentInput[] = [];
  if (scriptType === "two_minute" || scriptType === "both") {
    for (const chunk of chunkText(scriptPackage.twoMinuteNewsScript)) {
      segments.push({
        scriptType: "two_minute",
        agentKey: voxa.agentKey,
        displayName: voxa.displayName,
        role: voxa.role,
        text: chunk,
      });
    }
  }

  if (scriptType === "ten_minute" || scriptType === "both") {
    for (const chunk of chunkText(scriptPackage.tenMinutePodcastScript)) {
      segments.push({
        scriptType: "ten_minute",
        agentKey: voxa.agentKey,
        displayName: voxa.displayName,
        role: voxa.role,
        text: chunk,
      });
    }

    const conclusion = extractMougleConclusion(scriptPackage.tenMinutePodcastScript);
    if (conclusion) {
      segments.push({
        scriptType: "mougle_conclusion",
        agentKey: mougle.agentKey,
        displayName: mougle.displayName,
        role: mougle.role,
        text: conclusion,
      });
    }
  }

  return segments;
}

function safeTextPreview(value: string) {
  return normalizeText(value).slice(0, 260);
}

function relativeAudioPath(jobId: number, segmentIndex: number, extension: string) {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "") || "mp3";
  return join("generated_podcast_audio", `job-${jobId}`, `segment-${String(segmentIndex).padStart(3, "0")}-${randomUUID()}.${safeExtension}`);
}

function resolveStoredAudioPath(relativePath: string) {
  const audioRoot = resolve(AUDIO_OUTPUT_DIR);
  const fullPath = resolve(process.cwd(), relativePath);
  if (fullPath !== audioRoot && !fullPath.startsWith(`${audioRoot}${sep}`)) {
    throw new PodcastVoiceError(403, "Stored audio path is outside the internal audio directory.");
  }
  return fullPath;
}

function getProvider(provider: TtsProviderName): TtsProvider {
  if (provider === "elevenlabs") {
    return {
      name: "elevenlabs",
      model: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
      async synthesize(segment, profile) {
        const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
        if (!apiKey) throw new PodcastVoiceError(503, "ElevenLabs is not configured.");

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(profile.voiceId)}`, {
          method: "POST",
          headers: {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          body: JSON.stringify({
            text: segment.text,
            model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.75,
            },
          }),
        });

        if (!response.ok) {
          throw new PodcastVoiceError(response.status, `ElevenLabs TTS request failed with status ${response.status}.`);
        }

        return {
          mode: "audio",
          audioBuffer: Buffer.from(await response.arrayBuffer()),
          mimeType: "audio/mpeg",
          extension: "mp3",
          model: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
          estimatedCost: estimateCost("elevenlabs", segment.text.length),
          actualCost: estimateCost("elevenlabs", segment.text.length),
          message: null,
        };
      },
    };
  }

  if (provider === "replit_openai_audio") {
    return {
      name: "replit_openai_audio",
      model: "gpt-audio",
      async synthesize(segment, profile) {
        const voice = (profile.voiceId || "alloy") as OpenAiVoice;
        const audioBuffer = await textToSpeech(segment.text, voice, "mp3");
        return {
          mode: "audio",
          audioBuffer,
          mimeType: "audio/mpeg",
          extension: "mp3",
          model: "gpt-audio",
          estimatedCost: estimateCost("replit_openai_audio", segment.text.length),
          actualCost: estimateCost("replit_openai_audio", segment.text.length),
          message: null,
        };
      },
    };
  }

  return {
    name: "mock",
    model: "mock-dry-run",
    async synthesize(segment) {
      return {
        mode: "mock",
        audioBuffer: null,
        mimeType: null,
        extension: null,
        model: "mock-dry-run",
        estimatedCost: 0,
        actualCost: 0,
        message: `Mock/dry-run segment for ${segment.displayName}. Configure ELEVENLABS_API_KEY or OPENAI_API_KEY to generate audio.`,
      };
    },
  };
}

async function listEligibleScriptPackages(limit = 50) {
  const packages = await db.select().from(podcastScriptPackages)
    .where(eq(podcastScriptPackages.status, "admin_review"))
    .orderBy(desc(podcastScriptPackages.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));

  const jobs = await db.select().from(podcastAudioJobs)
    .orderBy(desc(podcastAudioJobs.createdAt))
    .limit(250);
  const latestJobByPackage = new Map<number, PodcastAudioJob>();
  for (const job of jobs) {
    if (!latestJobByPackage.has(job.scriptPackageId)) latestJobByPackage.set(job.scriptPackageId, job);
  }

  return {
    providerStatus: providerStatus(),
    packages: packages.map((scriptPackage) => ({
      ...scriptPackage,
      latestVoiceJob: latestJobByPackage.get(scriptPackage.id) || null,
    })),
  };
}

async function listJobs(options: { scriptPackageId?: number; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(100, options.limit || 50));
  if (options.scriptPackageId) {
    return db.select().from(podcastAudioJobs)
      .where(eq(podcastAudioJobs.scriptPackageId, options.scriptPackageId))
      .orderBy(desc(podcastAudioJobs.createdAt))
      .limit(limit);
  }

  return db.select().from(podcastAudioJobs)
    .orderBy(desc(podcastAudioJobs.createdAt))
    .limit(limit);
}

async function getJob(jobId: number) {
  const [job] = await db.select().from(podcastAudioJobs)
    .where(eq(podcastAudioJobs.id, jobId))
    .limit(1);
  if (!job) throw new PodcastVoiceError(404, "Voice job not found.");
  return job;
}

async function loadScriptPackage(scriptPackageId: number): Promise<PodcastScriptPackage> {
  const [scriptPackage] = await db.select().from(podcastScriptPackages)
    .where(eq(podcastScriptPackages.id, scriptPackageId))
    .limit(1);
  if (!scriptPackage) throw new PodcastVoiceError(404, "Podcast script package not found.");
  if (scriptPackage.status !== "admin_review") {
    throw new PodcastVoiceError(409, "Only internal admin-review podcast script packages can generate voice jobs.");
  }
  return scriptPackage;
}

async function logVoiceCost(job: PodcastAudioJob, provider: TtsProvider, status: JobStatus) {
  try {
    await storage.createAgentCostLog({
      agentId: "voxa-public-voice",
      ownerId: job.generatedBy,
      actionType: "podcast_tts",
      creditsCharged: Math.max(0, Math.ceil((job.actualCost || job.estimatedCost || 0) * 100)),
      tokensUsed: null,
      model: provider.model,
      status,
      metadata: {
        jobId: job.id,
        scriptPackageId: job.scriptPackageId,
        provider: provider.name,
        segmentCount: job.segments.length,
        estimatedCost: job.estimatedCost,
        actualCost: job.actualCost,
        internalAdminReviewOnly: true,
      },
    });
  } catch {
    // Cost logging must not block the admin-review TTS job.
  }
}

async function generateVoiceJob(input: {
  scriptPackageId: number;
  scriptType: ScriptTypePreference;
  providerPreference: ProviderPreference;
  generatedBy: string;
}) {
  const scriptPackage = await loadScriptPackage(input.scriptPackageId);
  const status = providerStatus(input.providerPreference);
  requireExplicitProviderConfigured(input.providerPreference, status);

  const provider = getProvider(status.selected);
  const voiceProfileMapping = buildVoiceProfileMapping(scriptPackage.scriptPackage, provider.name);
  const segmentInputs = buildSegmentInputs(scriptPackage.scriptPackage, input.scriptType);
  if (segmentInputs.length === 0) {
    throw new PodcastVoiceError(409, "Podcast script package does not contain voice-ready script text.");
  }

  const estimatedCost = roundCost(segmentInputs.reduce((total, segment) => total + estimateCost(provider.name, segment.text.length), 0));
  const [queuedJob] = await db.insert(podcastAudioJobs).values({
    scriptPackageId: scriptPackage.id,
    status: "processing",
    provider: provider.name,
    voiceProfileMapping,
    segments: segmentInputs.map((segment, index) => ({
      segmentIndex: index + 1,
      scriptType: segment.scriptType,
      agentKey: segment.agentKey,
      displayName: segment.displayName,
      role: segment.role,
      provider: provider.name,
      voiceId: voiceProfileMapping[segment.agentKey]?.voiceId || "unknown",
      voiceLabel: voiceProfileMapping[segment.agentKey]?.voiceLabel || "unknown",
      status: "pending" as VoiceSegmentStatus,
      textPreview: safeTextPreview(segment.text),
      characterCount: segment.text.length,
      audioPath: null,
      audioUrl: null,
      mimeType: null,
      estimatedCost: estimateCost(provider.name, segment.text.length),
      actualCost: 0,
      errorMessage: null,
      generatedAt: null,
    })),
    estimatedCost,
    actualCost: 0,
    errorMessage: null,
    adminReviewStatus: "internal_admin_review",
    generatedBy: input.generatedBy,
    updatedAt: new Date(),
  }).returning();

  const completedSegments: PodcastAudioJobSegment[] = [];
  let actualCost = 0;
  let finalStatus: JobStatus = provider.name === "mock" ? "mock" : "completed";
  let errorMessage: string | null = null;

  try {
    for (let index = 0; index < segmentInputs.length; index += 1) {
      const segment = segmentInputs[index];
      const profile = voiceProfileMapping[segment.agentKey] || voiceProfileMapping["voxa-public-voice"];
      const result = await provider.synthesize(segment, profile);
      let audioPath: string | null = null;
      let audioUrl: string | null = null;

      if (result.mode === "audio" && result.audioBuffer && result.extension) {
        audioPath = relativeAudioPath(queuedJob.id, index + 1, result.extension);
        await mkdir(resolveStoredAudioPath(join("generated_podcast_audio", `job-${queuedJob.id}`)), { recursive: true });
        await writeFile(resolveStoredAudioPath(audioPath), result.audioBuffer);
        audioUrl = `/api/admin/voice-jobs/${queuedJob.id}/segments/${index + 1}/audio`;
      }

      actualCost = roundCost(actualCost + result.actualCost);
      completedSegments.push({
        segmentIndex: index + 1,
        scriptType: segment.scriptType,
        agentKey: segment.agentKey,
        displayName: segment.displayName,
        role: segment.role,
        provider: provider.name,
        voiceId: profile.voiceId,
        voiceLabel: profile.voiceLabel,
        status: result.mode === "mock" ? "mock" : "completed",
        textPreview: safeTextPreview(segment.text),
        characterCount: segment.text.length,
        audioPath,
        audioUrl,
        mimeType: result.mimeType,
        estimatedCost: result.estimatedCost,
        actualCost: result.actualCost,
        errorMessage: result.message,
        generatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    finalStatus = "failed";
    errorMessage = err instanceof Error ? err.message : "TTS generation failed.";
    const failedIndex = completedSegments.length;
    const failedSegment = segmentInputs[failedIndex];
    if (failedSegment) {
      const profile = voiceProfileMapping[failedSegment.agentKey] || voiceProfileMapping["voxa-public-voice"];
      completedSegments.push({
        segmentIndex: failedIndex + 1,
        scriptType: failedSegment.scriptType,
        agentKey: failedSegment.agentKey,
        displayName: failedSegment.displayName,
        role: failedSegment.role,
        provider: provider.name,
        voiceId: profile.voiceId,
        voiceLabel: profile.voiceLabel,
        status: "failed",
        textPreview: safeTextPreview(failedSegment.text),
        characterCount: failedSegment.text.length,
        audioPath: null,
        audioUrl: null,
        mimeType: null,
        estimatedCost: estimateCost(provider.name, failedSegment.text.length),
        actualCost: 0,
        errorMessage,
        generatedAt: new Date().toISOString(),
      });
    }
  }

  const [updatedJob] = await db.update(podcastAudioJobs)
    .set({
      status: finalStatus,
      segments: completedSegments,
      actualCost,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(podcastAudioJobs.id, queuedJob.id))
    .returning();

  await logVoiceCost(updatedJob, provider, finalStatus);

  if (finalStatus === "failed") {
    throw new PodcastVoiceError(502, errorMessage || "TTS generation failed.");
  }

  return {
    mode: "internal_admin_review_voice_job",
    providerStatus: status,
    job: updatedJob,
    scriptPackage,
    generatedAt: new Date().toISOString(),
    safety: {
      manualTriggerOnly: true,
      internalReviewOnly: true,
      publicPublishing: false,
      youtubeUpload: false,
      podcastHostingUpload: false,
      socialPosting: false,
      avatarVideoRendering: false,
      privateMemoryUsed: false,
    },
  };
}

async function getSegmentAudio(jobId: number, segmentIndex: number) {
  const job = await getJob(jobId);
  const segment = job.segments.find((item) => item.segmentIndex === segmentIndex);
  if (!segment || !segment.audioPath) throw new PodcastVoiceError(404, "Audio segment not found.");

  const fullPath = resolveStoredAudioPath(segment.audioPath);
  const buffer = await readFile(fullPath).catch(() => {
    throw new PodcastVoiceError(404, "Stored audio file not found.");
  });
  const extension = extname(fullPath).replace(".", "") || "mp3";
  return {
    buffer,
    mimeType: segment.mimeType || "audio/mpeg",
    filename: `mougle-voice-job-${job.id}-segment-${segment.segmentIndex}.${extension}`,
  };
}

export const podcastVoiceService = {
  providerStatus,
  listEligibleScriptPackages,
  listJobs,
  getJob,
  generateVoiceJob,
  getSegmentAudio,
};
