import OpenAI from "openai";

export type ProjectValidationInput = {
  description: string;
  documentation: string;
  featureSpecs: string;
  diagramsMetadata: string;
  industryCategory: string;
};

export type ProjectValidationResult = {
  feasibilityScore: number;
  marketDemandScore: number;
  usefulnessScore: number;
  innovationScore: number;
  riskLevel: "low" | "medium" | "high";
  estimatedAudienceRange: string;
  reasoningSummary: string;
  recommendation: "LABS_APPROVED" | "NEEDS_IMPROVEMENT" | "LOW_PRIORITY";
};

function getOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL;
  if (!apiKey) {
    throw new Error("OpenAI API key not configured for project validation");
  }
  return new OpenAI({ apiKey, baseURL });
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeRisk(level: string): "low" | "medium" | "high" {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  return "medium";
}

function normalizeRecommendation(value: string): ProjectValidationResult["recommendation"] {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "LABS_APPROVED" || normalized === "NEEDS_IMPROVEMENT" || normalized === "LOW_PRIORITY") {
    return normalized as ProjectValidationResult["recommendation"];
  }
  return "NEEDS_IMPROVEMENT";
}

function safeParseJson(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function validateProject(input: ProjectValidationInput): Promise<ProjectValidationResult> {
  const system = [
    "You are an AI validation engine for Mougle Labs.",
    "Evaluate project feasibility and marketplace readiness as a probabilistic analysis, not a prediction.",
    "Return strict JSON only with the requested fields.",
  ].join(" ");

  const user = [
    "Project description:",
    input.description,
    "",
    "Generated documentation:",
    input.documentation,
    "",
    "Feature specs:",
    input.featureSpecs,
    "",
    "Diagrams metadata:",
    input.diagramsMetadata,
    "",
    "Industry category:",
    input.industryCategory,
    "",
    "Return JSON with fields:",
    "feasibilityScore (0-100), marketDemandScore (0-100), usefulnessScore (0-100), innovationScore (0-100),",
    "riskLevel (low|medium|high), estimatedAudienceRange (string), reasoningSummary (string),",
    "recommendation (LABS_APPROVED|NEEDS_IMPROVEMENT|LOW_PRIORITY).",
  ].join("\n");

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-5.5",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content || "{}";
  const data = safeParseJson(raw) || {};

  return {
    feasibilityScore: clampScore(Number(data.feasibilityScore)),
    marketDemandScore: clampScore(Number(data.marketDemandScore)),
    usefulnessScore: clampScore(Number(data.usefulnessScore)),
    innovationScore: clampScore(Number(data.innovationScore)),
    riskLevel: normalizeRisk(data.riskLevel),
    estimatedAudienceRange: String(data.estimatedAudienceRange || ""),
    reasoningSummary: String(data.reasoningSummary || ""),
    recommendation: normalizeRecommendation(data.recommendation),
  };
}

export const projectValidationService = {
  validateProject,
};
