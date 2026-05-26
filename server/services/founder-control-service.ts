import { storage } from "../storage";
import type { SystemControlConfig } from "@shared/schema";

interface ControlValues {
  growth_speed: number;
  promotion_aggressiveness: number;
  exploration_rate: number;
  automation_level: number;
  content_bias: number;
  risk_tolerance: number;
  agent_intensity: number;
  resource_mode: number;
  emergency_stop: number;
}

const DEFAULT_CONFIGS: Array<{
  key: string;
  value: number;
  label: string;
  description: string;
  minValue: number;
  maxValue: number;
  step: number;
  category: string;
}> = [
  {
    key: "growth_speed",
    value: 0.5,
    label: "Growth Speed",
    description: "How aggressively the platform pursues growth. Higher = faster content generation, more frequent pipeline runs.",
    minValue: 0,
    maxValue: 1,
    step: 0.05,
    category: "growth",
  },
  {
    key: "promotion_aggressiveness",
    value: 0.5,
    label: "Promotion Aggressiveness",
    description: "Controls promotion threshold and frequency. Higher = more content gets promoted, lower thresholds.",
    minValue: 0,
    maxValue: 1,
    step: 0.05,
    category: "growth",
  },
  {
    key: "exploration_rate",
    value: 0.3,
    label: "Exploration Rate",
    description: "Balance between proven strategies vs trying new approaches. Higher = more experimentation.",
    minValue: 0,
    maxValue: 1,
    step: 0.05,
    category: "intelligence",
  },
  {
    key: "automation_level",
    value: 0.7,
    label: "Automation Level",
    description: "How much of the platform runs autonomously. Lower = more manual approval needed.",
    minValue: 0,
    maxValue: 1,
    step: 0.1,
    category: "operations",
  },
  {
    key: "content_bias",
    value: 0.5,
    label: "Content Bias",
    description: "Favors quality (0) vs quantity (1). Lower = stricter quality gates, higher = more content passes through.",
    minValue: 0,
    maxValue: 1,
    step: 0.05,
    category: "content",
  },
  {
    key: "risk_tolerance",
    value: 0.4,
    label: "Risk Tolerance",
    description: "Willingness to publish controversial or unverified content. Lower = safer, higher = more daring.",
    minValue: 0,
    maxValue: 1,
    step: 0.05,
    category: "content",
  },
  {
    key: "agent_intensity",
    value: 0.6,
    label: "Agent Intensity",
    description: "How active AI agents are in discussions. Higher = more frequent agent actions, comments, and verifications.",
    minValue: 0,
    maxValue: 1,
    step: 0.1,
    category: "intelligence",
  },
  {
    key: "resource_mode",
    value: 0.5,
    label: "Resource Mode",
    description: "API usage efficiency. Lower = conservative (fewer AI calls), higher = aggressive (more AI-powered features).",
    minValue: 0,
    maxValue: 1,
    step: 0.1,
    category: "operations",
  },
  {
    key: "emergency_stop",
    value: 0,
    label: "Emergency Stop",
    description: "Master kill switch. Set to 1 to immediately pause ALL automated systems.",
    minValue: 0,
    maxValue: 1,
    step: 1,
    category: "safety",
  },
];

let cachedConfig: ControlValues | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000;

async function ensureDefaults(): Promise<void> {
  const existing = await storage.getSystemControlConfigs();
  const existingKeys = new Set(existing.map((c) => c.key));

  for (const cfg of DEFAULT_CONFIGS) {
    if (!existingKeys.has(cfg.key)) {
      await storage.upsertSystemControlConfig(cfg);
    }
  }
}

async function loadConfig(): Promise<ControlValues> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL) {
    return cachedConfig;
  }

  const configs = await storage.getSystemControlConfigs();
  const values: any = {};
  for (const cfg of configs) {
    values[cfg.key] = cfg.value;
  }

  for (const def of DEFAULT_CONFIGS) {
    if (values[def.key] === undefined) {
      values[def.key] = def.value;
    }
  }

  cachedConfig = values as ControlValues;
  cacheTimestamp = now;
  return cachedConfig;
}

function invalidateCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

async function getConfig(): Promise<ControlValues> {
  return loadConfig();
}

async function getValue(key: keyof ControlValues): Promise<number> {
  const config = await loadConfig();
  return config[key] ?? 0.5;
}

async function isEmergencyStopped(): Promise<boolean> {
  const config = await loadConfig();
  return config.emergency_stop >= 1;
}

async function shouldRunAutomation(): Promise<boolean> {
  const config = await loadConfig();
  if (config.emergency_stop >= 1) return false;
  return config.automation_level > 0.1;
}

async function getPromotionThreshold(): Promise<number> {
  const config = await loadConfig();
  const base = 75;
  const adjustment = (0.5 - config.promotion_aggressiveness) * 40;
  return Math.max(30, Math.min(95, base + adjustment));
}

async function getAgentActionProbability(): Promise<number> {
  const config = await loadConfig();
  if (config.emergency_stop >= 1) return 0;
  return Math.min(1, config.agent_intensity * config.automation_level);
}

async function getContentQualityThreshold(): Promise<number> {
  const config = await loadConfig();
  return (1 - config.content_bias) * 0.8 + 0.1;
}

async function getPipelineInterval(baseMinutes: number): Promise<number> {
  const config = await loadConfig();
  if (config.emergency_stop >= 1) return baseMinutes * 100;
  const speedFactor = Math.max(0.2, 1.5 - config.growth_speed);
  return Math.max(1, Math.round(baseMinutes * speedFactor));
}

async function shouldUseAI(): Promise<boolean> {
  const config = await loadConfig();
  if (config.emergency_stop >= 1) return false;
  return config.resource_mode > 0.2;
}

async function getAllConfigs(): Promise<SystemControlConfig[]> {
  await ensureDefaults();
  return storage.getSystemControlConfigs();
}

async function updateValue(key: string, value: number): Promise<SystemControlConfig> {
  const result = await storage.updateSystemControlValue(key, value);
  invalidateCache();
  return result;
}

async function bulkUpdate(updates: Array<{ key: string; value: number }>): Promise<SystemControlConfig[]> {
  const results: SystemControlConfig[] = [];
  for (const update of updates) {
    const result = await storage.updateSystemControlValue(update.key, update.value);
    results.push(result);
  }
  invalidateCache();
  return results;
}

async function triggerEmergencyStop(): Promise<void> {
  await storage.updateSystemControlValue("emergency_stop", 1);
  invalidateCache();
}

async function releaseEmergencyStop(): Promise<void> {
  await storage.updateSystemControlValue("emergency_stop", 0);
  invalidateCache();
}

async function initialize(): Promise<void> {
  await ensureDefaults();
  await loadConfig();
}

export const founderControlService = {
  initialize,
  getConfig,
  getValue,
  isEmergencyStopped,
  shouldRunAutomation,
  getPromotionThreshold,
  getAgentActionProbability,
  getContentQualityThreshold,
  getPipelineInterval,
  shouldUseAI,
  getAllConfigs,
  updateValue,
  bulkUpdate,
  triggerEmergencyStop,
  releaseEmergencyStop,
  invalidateCache,
};
