/**
 * Boot-time environment validation.
 *
 * Resolves audit findings:
 *   - C-ENV-1: refuse to start in production when mandatory secrets missing.
 *   - H-ENV-2: refuse to start in production when persistent object storage
 *     is unconfigured (silent local-disk fallback is data-loss on Replit
 *     Deployments). Escape hatch: STORAGE_LOCAL_OK=1 for staging/preview
 *     deployments that explicitly accept ephemeral storage.
 *
 * Pure: returns a result; callers decide whether to exit. Keeps the function
 * trivially unit-testable.
 */

export type EnvValidationLevel = "ok" | "warn" | "fatal";

export interface EnvValidationIssue {
  level: Exclude<EnvValidationLevel, "ok">;
  code: string;
  message: string;
}

export interface EnvValidationResult {
  level: EnvValidationLevel;
  issues: EnvValidationIssue[];
  productionMode: boolean;
}

const MANDATORY_PRODUCTION_SECRETS: ReadonlyArray<{
  name: string;
  hint: string;
  acceptAlias?: string;
}> = [
  { name: "DATABASE_URL", hint: "PostgreSQL connection string." },
  { name: "SESSION_SECRET", hint: "Express session signing secret." },
  {
    name: "OPENAI_API_KEY",
    hint: "OpenAI API key for AI features.",
    acceptAlias: "AI_INTEGRATIONS_OPENAI_API_KEY",
  },
  { name: "ADMIN_USERNAME", hint: "Root-admin login username." },
  { name: "ADMIN_PASSWORD_HASH", hint: "Root-admin bcrypt password hash." },
];

function isSet(name: string, env: NodeJS.ProcessEnv): boolean {
  return !!env[name]?.trim();
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const issues: EnvValidationIssue[] = [];
  const productionMode = env.NODE_ENV === "production";

  for (const secret of MANDATORY_PRODUCTION_SECRETS) {
    const present = isSet(secret.name, env) || (!!secret.acceptAlias && isSet(secret.acceptAlias, env));
    if (present) continue;
    issues.push({
      level: productionMode ? "fatal" : "warn",
      code: `missing_${secret.name.toLowerCase()}`,
      message: `Missing required environment variable ${secret.name}${secret.acceptAlias ? ` (or ${secret.acceptAlias})` : ""}. ${secret.hint}`,
    });
  }

  // H-ENV-2: in production, persistent object storage MUST be configured
  // unless the operator explicitly opts in to ephemeral local-disk storage
  // with STORAGE_LOCAL_OK=1 (intended only for non-render staging).
  const storageOk =
    !!env.REPLIT_OBJECT_STORAGE_BUCKET_ID?.trim() ||
    !!env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim() ||
    !!env.REPLIT_SIDECAR_ENDPOINT?.trim() ||
    !!env.CLOUDFLARE_R2_TOKEN?.trim() ||
    !!env.AWS_S3_TOKEN?.trim();
  if (productionMode && !storageOk && env.STORAGE_LOCAL_OK !== "1") {
    issues.push({
      level: "fatal",
      code: "missing_persistent_storage",
      message:
        "No persistent object-storage backend configured (set REPLIT_OBJECT_STORAGE_BUCKET_ID " +
        "or DEFAULT_OBJECT_STORAGE_BUCKET_ID, or set STORAGE_LOCAL_OK=1 to explicitly accept " +
        "ephemeral local-disk storage). Render artifacts will not survive a deploy on Replit Deployments.",
    });
  }

  const level: EnvValidationLevel = issues.some((i) => i.level === "fatal")
    ? "fatal"
    : issues.length
      ? "warn"
      : "ok";

  return { level, issues, productionMode };
}

/**
 * Autopilot Newsroom env summary — booleans only, NEVER secret values.
 *
 * Exposes feature-flag state for the optional 24/7 Autopilot. The PUBLIC
 * PUBLISH / Unreal send / 4D send flags are HARD-CODED FALSE here regardless
 * of any env var, mirroring the permanent locks in the scheduler.
 */
export interface AutopilotEnvSummary {
  autopilotFeatureEnabled: boolean;
  internalPlayoutFeatureEnabled: boolean;
  publicPublishFeatureEnabled: false;
  providerCallsAllowed: boolean;
  unrealSendAllowed: false;
  fourDSendAllowed: false;
  providerReadiness: {
    openai: boolean;
    elevenlabs: boolean;
    resend: boolean;
  };
}

export function autopilotEnvSummary(env: NodeJS.ProcessEnv = process.env): AutopilotEnvSummary {
  return {
    autopilotFeatureEnabled: env.AUTOPILOT_NEWSROOM_ENABLED === "1",
    internalPlayoutFeatureEnabled: env.AUTOPILOT_INTERNAL_PLAYOUT_ENABLED === "1",
    publicPublishFeatureEnabled: false,
    providerCallsAllowed: env.AUTOPILOT_ALLOW_PROVIDER_CALLS === "1",
    unrealSendAllowed: false,
    fourDSendAllowed: false,
    providerReadiness: {
      openai: isSet("OPENAI_API_KEY", env) || isSet("AI_INTEGRATIONS_OPENAI_API_KEY", env),
      elevenlabs: isSet("ELEVENLABS_API_KEY", env),
      resend: isSet("RESEND_API_KEY", env),
    },
  };
}

/**
 * Pretty-print issues to stderr. Returns whether the process should exit.
 */
export function reportEnvValidation(result: EnvValidationResult): { shouldExit: boolean } {
  if (result.level === "ok") return { shouldExit: false };
  const header =
    result.level === "fatal"
      ? "[env-validation] FATAL: refusing to start"
      : "[env-validation] warnings (non-fatal in non-production)";
  console.error(header);
  for (const issue of result.issues) {
    console.error(`  - [${issue.level}] ${issue.code}: ${issue.message}`);
  }
  return { shouldExit: result.level === "fatal" };
}
