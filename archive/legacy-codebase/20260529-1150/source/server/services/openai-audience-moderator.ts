import OpenAI from "openai";
import {
  omniChannelAudienceSafetyService,
  type AiModerationResult,
  type AiModeratorFn,
} from "./omni-channel-audience-safety-service";

const MAX_INPUT_CHARS = 2000;
const DEFAULT_RATE_PER_MINUTE = 60;

let cachedClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (cachedClient) return cachedClient;
  const apiKey =
    process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) return null;
  cachedClient = new OpenAI({
    apiKey,
    baseURL:
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
      "https://api.openai.com/v1",
  });
  return cachedClient;
}

function clamp01(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function maxDefined(...values: Array<number | undefined>): number | undefined {
  let best: number | undefined;
  for (const v of values) {
    if (v === undefined) continue;
    if (best === undefined || v > best) best = v;
  }
  return best;
}

function mapModerationToResult(
  scores: Record<string, unknown> | undefined,
): AiModerationResult {
  const s = scores ?? {};
  const get = (k: string) => clamp01((s as Record<string, unknown>)[k]);
  const harassment = get("harassment");
  const harassmentThreat = get("harassment/threatening");
  const hate = get("hate");
  const hateThreat = get("hate/threatening");
  const sexual = get("sexual");
  const sexualMinors = get("sexual/minors");
  const violence = get("violence");
  const violenceGraphic = get("violence/graphic");
  const selfHarm = get("self-harm");
  const selfHarmIntent = get("self-harm/intent");
  const selfHarmInstr = get("self-harm/instructions");

  const abuse = maxDefined(harassment, harassmentThreat);
  const hateMax = maxDefined(hate, hateThreat);
  const sexualMax = maxDefined(sexual, sexualMinors);
  const violenceMax = maxDefined(violence, violenceGraphic);
  const selfHarmMax = maxDefined(selfHarm, selfHarmIntent, selfHarmInstr);
  const toxicity = maxDefined(abuse, hateMax);

  const out: AiModerationResult = {};
  if (abuse !== undefined) out.abuse = abuse;
  if (hateMax !== undefined) out.hate = hateMax;
  if (sexualMax !== undefined) out.sexual = sexualMax;
  if (violenceMax !== undefined) out.violence = violenceMax;
  if (selfHarmMax !== undefined) out.selfHarm = selfHarmMax;
  if (toxicity !== undefined) out.toxicity = toxicity;
  return out;
}

interface RateState {
  windowStart: number;
  count: number;
}

export interface OpenAiAudienceModeratorOptions {
  /** Hard cap on calls per rolling 60-second window. Defaults to 60. */
  ratePerMinute?: number;
  /** OpenAI moderation model. Defaults to omni-moderation-latest. */
  model?: string;
  /** Max characters of input forwarded to the API. Defaults to 2000. */
  maxInputChars?: number;
  /** Test-only override for the underlying OpenAI client. */
  client?: Pick<OpenAI, "moderations">;
}

export function createOpenAiAudienceModerator(
  options: OpenAiAudienceModeratorOptions = {},
): AiModeratorFn {
  const rateLimit = Math.max(1, options.ratePerMinute ?? DEFAULT_RATE_PER_MINUTE);
  const model = options.model ?? "omni-moderation-latest";
  const maxChars = Math.max(16, options.maxInputChars ?? MAX_INPUT_CHARS);
  const rate: RateState = { windowStart: Date.now(), count: 0 };
  const overrideClient = options.client ?? null;

  return async function openAiModerate(text: string): Promise<AiModerationResult | null> {
    const client = overrideClient ?? getOpenAI();
    if (!client) return null;
    const trimmed = (text ?? "").trim();
    if (trimmed.length === 0) return null;

    const now = Date.now();
    if (now - rate.windowStart >= 60_000) {
      rate.windowStart = now;
      rate.count = 0;
    }
    if (rate.count >= rateLimit) {
      return null;
    }
    rate.count++;

    try {
      const input = trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;
      const resp = await client.moderations.create({ model, input });
      const first = resp.results?.[0];
      if (!first) return null;
      return mapModerationToResult(
        first.category_scores as unknown as Record<string, unknown>,
      );
    } catch (err) {
      console.warn(
        "[openai-audience-moderator] call failed, falling back to deterministic-only:",
        (err as Error).message,
      );
      return null;
    }
  };
}

/**
 * Install the production OpenAI moderator on the singleton audience-safety
 * service. No-op when no API key is configured. Called once at app startup.
 */
export function installOpenAiAudienceModerator(
  options: OpenAiAudienceModeratorOptions = {},
): boolean {
  if (!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY)) {
    return false;
  }
  const fn = createOpenAiAudienceModerator(options);
  omniChannelAudienceSafetyService.setAiModerator(fn);
  return true;
}
