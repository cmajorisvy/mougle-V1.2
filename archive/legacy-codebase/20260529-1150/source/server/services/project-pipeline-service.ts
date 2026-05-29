import OpenAI from "openai";
import { storage } from "../storage";
import type { Project } from "@shared/schema";

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
}

interface BlueprintSection {
  title: string;
  content: string;
  subsections?: { title: string; content: string }[];
}

export interface ProjectBlueprint {
  executiveSummary: string;
  problemStatement: string;
  researchFindings: BlueprintSection[];
  evidenceAnalysis: BlueprintSection[];
  solutionDesign: BlueprintSection[];
  feasibilityAnalysis: {
    technical: string;
    financial: string;
    operational: string;
    timeline: string;
  };
  financialModel: {
    estimatedCost: string;
    revenueProjection: string;
    breakEvenAnalysis: string;
    fundingRequirements: string;
  };
  riskAssessment: {
    risks: { category: string; description: string; mitigation: string; severity: string }[];
  };
  implementationPlan: {
    phases: { name: string; duration: string; deliverables: string[]; dependencies: string[] }[];
  };
  conclusion: string;
  metadata: {
    debateId: number;
    totalRounds: number;
    participantCount: number;
    consensusScore: number;
    generatedAt: string;
  };
}

const PROJECT_TYPE_MAP: Record<string, string> = {
  technology: "software",
  ai: "software",
  health: "health",
  agriculture: "agriculture",
  finance: "infrastructure",
  energy: "infrastructure",
  education: "general",
  science: "general",
};

function detectProjectType(topic: string, content: string): string {
  const combined = `${topic} ${content}`.toLowerCase();
  for (const [keyword, type] of Object.entries(PROJECT_TYPE_MAP)) {
    if (combined.includes(keyword)) return type;
  }
  return "general";
}

export async function generateProjectFromDebate(debateId: number, triggeredBy: string): Promise<Project> {
  const existing = await storage.getProjectByDebateId(debateId);
  if (existing) {
    return await regenerateProject(existing.id, triggeredBy);
  }

  const debate = await storage.getLiveDebate(debateId);
  if (!debate) throw new Error("Debate not found");

  const participants = await storage.getDebateParticipants(debateId);
  const turns = await storage.getDebateTurns(debateId);

  if (turns.length === 0) throw new Error("Debate has no turns - cannot generate project");

  const participantMap = new Map<number, string>();
  for (const p of participants) {
    const user = await storage.getUser(p.userId);
    participantMap.set(p.id, user?.displayName || "Unknown");
  }

  const transcript = turns.map(t => {
    const name = participantMap.get(t.participantId) || "Unknown";
    return `[Round ${t.roundNumber}, ${name}]: ${t.content}`;
  }).join("\n\n");

  const projectType = detectProjectType(debate.topic, transcript);

  const blueprint = await generateBlueprint(debate, transcript, participants.length, turns.length);

  const project = await storage.createProject({
    debateId: debate.id,
    topicSlug: debate.topic.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    title: `${debate.title} - Project Blueprint`,
    description: debate.description || `Project generated from debate: ${debate.title}`,
    projectType,
    status: "generated",
    blueprintJson: blueprint as any,
    createdBy: triggeredBy,
  });

  return project;
}

async function regenerateProject(projectId: string, triggeredBy: string): Promise<Project> {
  const project = await storage.getProject(projectId);
  if (!project || !project.debateId) throw new Error("Project not found or has no debate");

  const debate = await storage.getLiveDebate(project.debateId);
  if (!debate) throw new Error("Debate not found");

  const participants = await storage.getDebateParticipants(project.debateId);
  const turns = await storage.getDebateTurns(project.debateId);

  const participantMap = new Map<number, string>();
  for (const p of participants) {
    const user = await storage.getUser(p.userId);
    participantMap.set(p.id, user?.displayName || "Unknown");
  }

  const transcript = turns.map(t => {
    const name = participantMap.get(t.participantId) || "Unknown";
    return `[Round ${t.roundNumber}, ${name}]: ${t.content}`;
  }).join("\n\n");

  const blueprint = await generateBlueprint(debate, transcript, participants.length, turns.length);

  const updated = await storage.updateProject(projectId, {
    blueprintJson: blueprint as any,
    version: (project.version || 1) + 1,
    status: "generated",
  });

  return updated;
}

async function generateBlueprint(
  debate: any,
  transcript: string,
  participantCount: number,
  turnCount: number,
): Promise<ProjectBlueprint> {
  const openai = getOpenAI();

  const systemPrompt = `You are a senior project architect at a leading innovation consultancy. Your job is to convert structured debate transcripts into comprehensive, professional project blueprints.

Generate a detailed project blueprint JSON that follows this exact structure:
{
  "executiveSummary": "2-3 paragraph overview of the project",
  "problemStatement": "Clear articulation of the problem being solved",
  "researchFindings": [{"title": "...", "content": "...", "subsections": [{"title": "...", "content": "..."}]}],
  "evidenceAnalysis": [{"title": "...", "content": "..."}],
  "solutionDesign": [{"title": "...", "content": "...", "subsections": [{"title": "...", "content": "..."}]}],
  "feasibilityAnalysis": {
    "technical": "Technical feasibility assessment",
    "financial": "Financial feasibility",
    "operational": "Operational feasibility",
    "timeline": "Estimated timeline"
  },
  "financialModel": {
    "estimatedCost": "Cost breakdown",
    "revenueProjection": "Revenue estimates",
    "breakEvenAnalysis": "Break-even timeline",
    "fundingRequirements": "Funding needs"
  },
  "riskAssessment": {
    "risks": [{"category": "...", "description": "...", "mitigation": "...", "severity": "high|medium|low"}]
  },
  "implementationPlan": {
    "phases": [{"name": "...", "duration": "...", "deliverables": ["..."], "dependencies": ["..."]}]
  },
  "conclusion": "Final summary and call to action"
}

Be thorough, professional, and data-driven. Extract insights from the debate arguments and convert them into actionable project components.`;

  const userPrompt = `Convert this debate into a comprehensive project blueprint.

DEBATE TITLE: ${debate.title}
TOPIC: ${debate.topic}
DESCRIPTION: ${debate.description || "N/A"}
TOTAL ROUNDS: ${debate.totalRounds}
PARTICIPANTS: ${participantCount}
CONSENSUS SUMMARY: ${debate.consensusSummary || "Not available"}

FULL DEBATE TRANSCRIPT:
${transcript.slice(0, 12000)}

Generate a complete, professional project blueprint in JSON format. Include at least 3 research findings, 3 evidence analyses, 4 solution design sections, 5 risks, and 4 implementation phases.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const parsed = JSON.parse(content);

    const blueprint: ProjectBlueprint = {
      executiveSummary: parsed.executiveSummary || "Executive summary pending.",
      problemStatement: parsed.problemStatement || "Problem statement pending.",
      researchFindings: parsed.researchFindings || [],
      evidenceAnalysis: parsed.evidenceAnalysis || [],
      solutionDesign: parsed.solutionDesign || [],
      feasibilityAnalysis: parsed.feasibilityAnalysis || {
        technical: "Pending",
        financial: "Pending",
        operational: "Pending",
        timeline: "Pending",
      },
      financialModel: parsed.financialModel || {
        estimatedCost: "Pending",
        revenueProjection: "Pending",
        breakEvenAnalysis: "Pending",
        fundingRequirements: "Pending",
      },
      riskAssessment: parsed.riskAssessment || { risks: [] },
      implementationPlan: parsed.implementationPlan || { phases: [] },
      conclusion: parsed.conclusion || "Conclusion pending.",
      metadata: {
        debateId: debate.id,
        totalRounds: debate.totalRounds || 0,
        participantCount,
        consensusScore: debate.confidenceScore || 0,
        generatedAt: new Date().toISOString(),
      },
    };

    return blueprint;
  } catch (error: any) {
    console.error("[ProjectPipeline] Error generating blueprint:", error?.message);

    return {
      executiveSummary: `This project was generated from the debate "${debate.title}". The AI blueprint generation encountered an issue. Please regenerate or edit manually.`,
      problemStatement: debate.description || debate.topic,
      researchFindings: [{ title: "Debate Analysis", content: "Blueprint generation requires manual review.", subsections: [] }],
      evidenceAnalysis: [{ title: "Evidence Review", content: "Please regenerate the blueprint." }],
      solutionDesign: [{ title: "Proposed Solution", content: "Based on the debate, a solution framework needs to be developed." }],
      feasibilityAnalysis: { technical: "Pending", financial: "Pending", operational: "Pending", timeline: "Pending" },
      financialModel: { estimatedCost: "Pending", revenueProjection: "Pending", breakEvenAnalysis: "Pending", fundingRequirements: "Pending" },
      riskAssessment: { risks: [{ category: "Technical", description: "Blueprint generation failed", mitigation: "Regenerate blueprint", severity: "medium" }] },
      implementationPlan: { phases: [{ name: "Phase 1: Planning", duration: "4 weeks", deliverables: ["Project plan"], dependencies: [] }] },
      conclusion: "This blueprint requires regeneration for complete details.",
      metadata: {
        debateId: debate.id,
        totalRounds: debate.totalRounds || 0,
        participantCount,
        consensusScore: debate.confidenceScore || 0,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export const projectPipelineService = {
  generateProjectFromDebate,
  regenerateProject,
};
