import { storage } from "../storage";
import { textToSpeech } from "../replit_integrations/audio/client";
import OpenAI from "openai";
import { spawn } from "child_process";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { DebateTurn, DebateParticipant, FlywheelJob } from "@shared/schema";

const CLIPS_DIR = join(process.cwd(), "generated_clips");
const TEMP_DIR = join(process.cwd(), "temp_flywheel");

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY must be set in the environment.");
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

interface HighlightSegment {
  title: string;
  startTurnIndex: number;
  endTurnIndex: number;
  turns: { speakerName: string; content: string; position: string }[];
  reason: string;
  estimatedDurationSeconds: number;
}

interface ClipMetadata {
  title: string;
  description: string;
  hashtags: string[];
  hook: string;
}

async function ensureDirectories() {
  for (const dir of [CLIPS_DIR, TEMP_DIR]) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
}

async function contentEditorAgent(
  debateTitle: string,
  debateTopic: string,
  turns: DebateTurn[],
  participants: DebateParticipant[],
  participantNames: Map<string, string>
): Promise<HighlightSegment[]> {
  const transcript = turns.map((t, i) => {
    const p = participants.find(p => p.id === t.participantId);
    const name = p ? (participantNames.get(p.userId) || `Speaker ${p.speakingOrder}`) : `Unknown`;
    const pos = p?.position || "neutral";
    return `[Turn ${i}] ${name} (${pos}): ${t.content}`;
  }).join("\n\n");

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `You are the ContentEditorAgent, an expert at identifying viral, engaging moments in debate transcripts. Your job is to find the most compelling, controversial, insightful, or emotionally powerful segments that would make great short-form video clips (YouTube Shorts, under 60 seconds each).

Look for:
- Sharp disagreements or comebacks
- Surprising facts or revelations
- Emotional or passionate statements
- Clever arguments or logic
- Quotable one-liners
- Moments of consensus on controversial topics

Return a JSON array of highlight segments. Each segment should reference consecutive turns by their index numbers.`
      },
      {
        role: "user",
        content: `Debate: "${debateTitle}"
Topic: "${debateTopic}"

TRANSCRIPT:
${transcript}

Find the top highlight moments (aim for 3-10 segments depending on debate length). Each clip should use 1-4 consecutive turns and be under 60 seconds when spoken aloud (roughly 150 words max per clip).

Return ONLY valid JSON array:
[{
  "title": "short catchy title",
  "startTurnIndex": 0,
  "endTurnIndex": 1,
  "reason": "why this is a highlight",
  "estimatedDurationSeconds": 30
}]`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const segments: any[] = parsed.highlights || parsed.segments || parsed || [];
  const arr = Array.isArray(segments) ? segments : [];

  return arr.map((s: any) => {
    const startIdx = Math.max(0, s.startTurnIndex || 0);
    const endIdx = Math.min(turns.length - 1, s.endTurnIndex || startIdx);
    const clipTurns = turns.slice(startIdx, endIdx + 1).map(t => {
      const p = participants.find(p => p.id === t.participantId);
      const name = p ? (participantNames.get(p.userId) || `Speaker ${p.speakingOrder}`) : "Unknown";
      return { speakerName: name, content: t.content || "", position: p?.position || "neutral" };
    });

    return {
      title: s.title || "Highlight",
      startTurnIndex: startIdx,
      endTurnIndex: endIdx,
      turns: clipTurns,
      reason: s.reason || "",
      estimatedDurationSeconds: s.estimatedDurationSeconds || 30,
    };
  }).filter((s: HighlightSegment) => s.turns.length > 0);
}

function captionAgent(turns: { speakerName: string; content: string }[]): string {
  let srtIndex = 1;
  let currentTime = 0;
  const srtEntries: string[] = [];

  for (const turn of turns) {
    const words = turn.content.split(/\s+/);
    const wordsPerSecond = 2.5;
    const chunkSize = 8;

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(" ");
      const chunkDuration = Math.min(words.slice(i, i + chunkSize).length / wordsPerSecond, 4);
      const startTime = currentTime;
      const endTime = currentTime + chunkDuration;

      const prefix = i === 0 ? `${turn.speakerName}: ` : "";
      srtEntries.push(
        `${srtIndex}\n${formatSrtTime(startTime)} --> ${formatSrtTime(endTime)}\n${prefix}${chunk}\n`
      );
      srtIndex++;
      currentTime = endTime;
    }

    currentTime += 0.5;
  }

  return srtEntries.join("\n");
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

async function viralTitleAgent(
  debateTitle: string,
  debateTopic: string,
  clipTurns: { speakerName: string; content: string; position: string }[],
  highlightReason: string
): Promise<ClipMetadata> {
  const turnText = clipTurns.map(t => `${t.speakerName} (${t.position}): ${t.content}`).join("\n");

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: `You are the ViralTitleAgent, an expert at creating viral YouTube Shorts titles, descriptions, and hashtags. Create titles that:
- Are attention-grabbing and curiosity-inducing
- Use power words and emotional triggers
- Are under 60 characters
- Make people want to click and watch

Create descriptions that:
- Summarize the key moment
- Include a call to action
- Are under 200 characters

Generate 5-8 relevant hashtags.`
      },
      {
        role: "user",
        content: `Debate: "${debateTitle}" about "${debateTopic}"
Highlight reason: ${highlightReason}

CLIP CONTENT:
${turnText}

Return ONLY valid JSON:
{
  "title": "viral title under 60 chars",
  "description": "engaging description under 200 chars",
  "hashtags": ["#tag1", "#tag2"],
  "hook": "opening hook line for the video"
}`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content);
    return {
      title: parsed.title || "AI Debate Highlight",
      description: parsed.description || "",
      hashtags: parsed.hashtags || ["#AIDebate", "#Mougle"],
      hook: parsed.hook || "",
    };
  } catch {
    return {
      title: "AI Debate Highlight",
      description: "Watch this incredible debate moment",
      hashtags: ["#AIDebate", "#Mougle", "#Shorts"],
      hook: "",
    };
  }
}

async function generateTTSAudio(
  turns: { speakerName: string; content: string }[],
  clipId: string
): Promise<string> {
  await ensureDirectories();
  const audioChunks: Buffer[] = [];
  const voices: Array<"alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

  for (let i = 0; i < turns.length; i++) {
    const voice = voices[i % voices.length];
    const text = `${turns[i].speakerName} says: ${turns[i].content}`;
    try {
      const audioBuffer = await textToSpeech(text, voice, "wav");
      audioChunks.push(audioBuffer);
    } catch (err) {
      console.error(`TTS failed for turn ${i}:`, err);
      const silenceBuffer = Buffer.alloc(16000 * 2 * 2);
      audioChunks.push(silenceBuffer);
    }
  }

  const audioPath = join(TEMP_DIR, `audio_${clipId}.wav`);
  const listPath = join(TEMP_DIR, `list_${clipId}.txt`);
  const chunkPaths: string[] = [];

  for (let i = 0; i < audioChunks.length; i++) {
    const chunkPath = join(TEMP_DIR, `chunk_${clipId}_${i}.wav`);
    await writeFile(chunkPath, audioChunks[i]);
    chunkPaths.push(chunkPath);
  }

  const listContent = chunkPaths.map(p => `file '${p}'`).join("\n");
  await writeFile(listPath, listContent);

  await runFFmpeg([
    "-f", "concat", "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    "-y", audioPath
  ]);

  for (const p of chunkPaths) {
    await unlink(p).catch(() => {});
  }
  await unlink(listPath).catch(() => {});

  return audioPath;
}

async function renderVerticalVideo(
  turns: { speakerName: string; content: string; position: string }[],
  audioPath: string,
  subtitlesSrt: string,
  title: string,
  hook: string,
  debateTopic: string,
  clipId: string
): Promise<string> {
  await ensureDirectories();
  const outputPath = join(CLIPS_DIR, `clip_${clipId}.mp4`);
  const srtPath = join(TEMP_DIR, `subs_${clipId}.srt`);

  await writeFile(srtPath, subtitlesSrt);

  const positionColors: Record<string, string> = {
    for: "0x22c55e",
    against: "0xef4444",
    neutral: "0x3b82f6",
  };

  const speakerOverlays = turns.map((t, i) => {
    const color = positionColors[t.position] || "0x3b82f6";
    return `drawtext=text='${escapeFfmpegText(t.speakerName)}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h*0.15+${i * 40}:enable='between(t,0,999)',drawtext=text='${escapeFfmpegText(t.position.toUpperCase())}':fontsize=20:fontcolor=${color}:x=(w-text_w)/2:y=h*0.15+${i * 40 + 30}:enable='between(t,0,999)'`;
  }).join(",");

  const titleOverlay = `drawtext=text='${escapeFfmpegText(title)}':fontsize=32:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.05:enable='between(t,0,999)'`;

  const topicOverlay = `drawtext=text='${escapeFfmpegText(debateTopic)}':fontsize=22:fontcolor=0xaaaaaa:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h*0.92:enable='between(t,0,999)'`;

  const bgFilter = `color=c=0x0a0a1a:s=1080x1920:d=300,format=yuv420p`;

  const filterComplex = `${bgFilter},${titleOverlay},${speakerOverlays},${topicOverlay},subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=180'`;

  await runFFmpeg([
    "-i", audioPath,
    "-filter_complex", filterComplex,
    "-map", "0:a",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "28",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    "-y", outputPath
  ]);

  await unlink(srtPath).catch(() => {});

  return outputPath;
}

function escapeFfmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on("error", reject);
  });
}

export async function runFlywheelPipeline(debateId: number): Promise<FlywheelJob> {
  await ensureDirectories();

  const existing = await storage.getFlywheelJobByDebate(debateId);
  if (existing && existing.status === "processing") {
    throw { status: 409, message: "Flywheel job already in progress for this debate" };
  }

  const debate = await storage.getLiveDebate(debateId);
  if (!debate) throw { status: 404, message: "Debate not found" };

  const turns = await storage.getDebateTurns(debateId);
  if (turns.length === 0) throw { status: 400, message: "Debate has no turns to process" };

  const participants = await storage.getDebateParticipants(debateId);
  const participantNames = new Map<string, string>();
  for (const p of participants) {
    const user = await storage.getUser(p.userId);
    if (user) participantNames.set(p.userId, user.displayName);
  }

  const job = await storage.createFlywheelJob({
    debateId,
    status: "processing",
    totalClips: 0,
    completedClips: 0,
    failedClips: 0,
    highlightsJson: null,
    errorMessage: null,
  });

  await storage.updateFlywheelJob(job.id, { startedAt: new Date() });

  processFlywheelAsync(job.id, debate, turns, participants, participantNames).catch(async (err) => {
    console.error(`Flywheel pipeline failed for job ${job.id}:`, err);
    await storage.updateFlywheelJob(job.id, {
      status: "failed",
      errorMessage: err?.message || String(err),
      completedAt: new Date(),
    });
  });

  return job;
}

async function processFlywheelAsync(
  jobId: number,
  debate: any,
  turns: DebateTurn[],
  participants: DebateParticipant[],
  participantNames: Map<string, string>
) {
  try {
    console.log(`[Flywheel] Starting highlight detection for job ${jobId}...`);
    const highlights = await contentEditorAgent(
      debate.title,
      debate.topic,
      turns,
      participants,
      participantNames
    );

    if (highlights.length === 0) {
      await storage.updateFlywheelJob(jobId, {
        status: "completed",
        totalClips: 0,
        highlightsJson: [],
        completedAt: new Date(),
      });
      return;
    }

    await storage.updateFlywheelJob(jobId, {
      totalClips: highlights.length,
      highlightsJson: highlights,
    });

    console.log(`[Flywheel] Found ${highlights.length} highlights, generating clips...`);

    let completedClips = 0;
    let failedClips = 0;

    for (let i = 0; i < highlights.length; i++) {
      const segment = highlights[i];
      const clipId = `${jobId}_${i}_${randomUUID().slice(0, 8)}`;

      try {
        console.log(`[Flywheel] Processing clip ${i + 1}/${highlights.length}: ${segment.title}`);

        const metadata = await viralTitleAgent(
          debate.title,
          debate.topic,
          segment.turns,
          segment.reason
        );

        const subtitlesSrt = captionAgent(segment.turns);

        const audioPath = await generateTTSAudio(segment.turns, clipId);

        const videoPath = await renderVerticalVideo(
          segment.turns,
          audioPath,
          subtitlesSrt,
          metadata.title,
          metadata.hook,
          debate.topic,
          clipId
        );

        const turnIds = [];
        for (let ti = segment.startTurnIndex; ti <= segment.endTurnIndex && ti < turns.length; ti++) {
          turnIds.push(turns[ti].id);
        }

        const transcriptSnippet = segment.turns.map(t => `${t.speakerName}: ${t.content}`).join("\n");

        await storage.createGeneratedClip({
          jobId,
          debateId: debate.id,
          title: metadata.title,
          description: metadata.description,
          hashtags: metadata.hashtags,
          turnIds,
          startTurnOrder: segment.startTurnIndex,
          endTurnOrder: segment.endTurnIndex,
          transcriptSnippet,
          subtitlesSrt,
          videoPath,
          audioPath,
          thumbnailPath: null,
          durationSeconds: segment.estimatedDurationSeconds,
          format: "9:16",
          status: "rendered",
          youtubeVideoId: null,
          youtubeUrl: null,
          uploadStatus: "not_uploaded",
          errorMessage: null,
        });

        completedClips++;
        await storage.updateFlywheelJob(jobId, { completedClips });
        console.log(`[Flywheel] Clip ${i + 1} rendered successfully`);

      } catch (err: any) {
        console.error(`[Flywheel] Failed to generate clip ${i + 1}:`, err);
        failedClips++;

        await storage.createGeneratedClip({
          jobId,
          debateId: debate.id,
          title: segment.title,
          description: null,
          hashtags: null,
          turnIds: null,
          startTurnOrder: segment.startTurnIndex,
          endTurnOrder: segment.endTurnIndex,
          transcriptSnippet: null,
          subtitlesSrt: null,
          videoPath: null,
          audioPath: null,
          thumbnailPath: null,
          durationSeconds: null,
          format: "9:16",
          status: "failed",
          youtubeVideoId: null,
          youtubeUrl: null,
          uploadStatus: "not_uploaded",
          errorMessage: err?.message || String(err),
        });

        await storage.updateFlywheelJob(jobId, { failedClips });
      }
    }

    await storage.updateFlywheelJob(jobId, {
      status: failedClips === highlights.length ? "failed" : "completed",
      completedAt: new Date(),
      errorMessage: failedClips > 0 ? `${failedClips} of ${highlights.length} clips failed` : null,
    });

    console.log(`[Flywheel] Job ${jobId} completed: ${completedClips} rendered, ${failedClips} failed`);

  } catch (err: any) {
    console.error(`[Flywheel] Pipeline error for job ${jobId}:`, err);
    await storage.updateFlywheelJob(jobId, {
      status: "failed",
      errorMessage: err?.message || String(err),
      completedAt: new Date(),
    });
  }
}

export async function getJobWithClips(jobId: number) {
  const job = await storage.getFlywheelJob(jobId);
  if (!job) return null;
  const clips = await storage.getClipsByJob(jobId);
  return { ...job, clips };
}

export async function getJobByDebateWithClips(debateId: number) {
  const job = await storage.getFlywheelJobByDebate(debateId);
  if (!job) return null;
  const clips = await storage.getClipsByJob(job.id);
  return { ...job, clips };
}

export async function getAllJobsWithClipCounts() {
  const jobs = await storage.getFlywheelJobs();
  const enriched = [];
  for (const job of jobs) {
    const debate = await storage.getLiveDebate(job.debateId);
    enriched.push({
      ...job,
      debateTitle: debate?.title || "Unknown Debate",
      debateTopic: debate?.topic || "",
    });
  }
  return enriched;
}
