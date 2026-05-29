import fs from "fs";
import path from "path";

const NICHE_ROOTS: Record<string, string> = {
  finance: "Ledger",
  health: "Vital",
  healthcare: "Vital",
  legal: "Verdict",
  education: "Scholar",
  marketing: "Signal",
  sales: "Quota",
  hr: "Talent",
  security: "Vault",
  cyber: "Vault",
  energy: "Grid",
  logistics: "Route",
  travel: "Orbit",
  real: "Estate",
  estate: "Estate",
  retail: "Cart",
  analytics: "Prism",
  compliance: "Axiom",
  automation: "Flow",
  marketplace: "Bazaar",
  communication: "Relay",
  inventory: "Stock",
  content: "Muse",
  monitoring: "Pulse",
};

const POWER_WORDS = [
  "Forge", "Pulse", "Atlas", "Flow", "Core", "Grid",
  "Drive", "Scope", "Shift", "Spark", "Stream", "Link",
  "Proof", "Trace", "Nexus", "Beacon", "Cortex", "Arc",
];

const GENERIC_FORBIDDEN = ["ai", "tool", "project"];

function pickRoot(niche?: string) {
  if (!niche) return "Signal";
  const lower = niche.toLowerCase();
  const key = Object.keys(NICHE_ROOTS).find(k => lower.includes(k));
  return key ? NICHE_ROOTS[key] : "Signal";
}

function clampName(name: string) {
  if (name.length <= 14) return name;
  return name.slice(0, 14);
}

function isGeneric(name: string) {
  const lower = name.toLowerCase();
  return GENERIC_FORBIDDEN.some(word => lower.includes(word));
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function generateUniqueName(options: {
  niche?: string;
  exists: (name: string, slug: string) => Promise<boolean>;
}) {
  const root = pickRoot(options.niche);
  const shuffled = [...POWER_WORDS].sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length; i += 1) {
    const candidate = clampName(`${root}${shuffled[i]}`);
    if (isGeneric(candidate)) continue;
    const slug = slugify(candidate);
    const exists = await options.exists(candidate, slug);
    if (!exists) return candidate;
  }
  // Fallback with timestamp
  const fallback = clampName(`${root}${Date.now().toString().slice(-4)}`);
  return fallback;
}

export function isNameGeneric(name?: string) {
  if (!name) return true;
  return isGeneric(name);
}

export async function uniquePdfFileName(baseDir: string, name: string, suffix: string) {
  const baseSlug = slugify(name) || "mougle";
  let attempt = `${baseSlug}${suffix}`;
  let counter = 1;
  while (fs.existsSync(path.join(baseDir, attempt))) {
    attempt = `${baseSlug}-${counter}${suffix}`;
    counter += 1;
  }
  return attempt;
}
