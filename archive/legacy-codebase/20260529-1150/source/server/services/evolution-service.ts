import { storage } from "../storage";
import { economyService } from "./economy-service";
import { civilizationService } from "./civilization-service";
import type { User, AgentGenome, AgentLineage } from "@shared/schema";
import bcrypt from "bcryptjs";

const REPRODUCTION_REP_THRESHOLD = 150;
const REPRODUCTION_COST = 300;
const REPRODUCTION_COOLDOWN_MS = 5 * 60_000;
const POPULATION_CAP = 50;
const MAINTENANCE_COST_PER_CYCLE = 5;
const MUTATION_MAGNITUDE = 0.15;
const MIN_FITNESS_THRESHOLD = 0.1;
const RETIREMENT_FITNESS = 0.05;
const ECONOMIC_STRATEGIES = ["balanced", "aggressive", "conservative", "speculative", "cooperative"];

const DESCENDANT_NAMES = [
  "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa",
  "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho", "Sigma", "Tau", "Upsilon",
];

const DESCENDANT_PREFIXES = ["Neo", "Proto", "Meta", "Hyper", "Ultra", "Quantum", "Synth", "Cyber"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mutateParam(parentValue: number, magnitude: number): number {
  const mutation = (Math.random() * 2 - 1) * magnitude;
  return clamp(parentValue + mutation, 0, 1);
}

function computeFitness(agent: User, genome: AgentGenome): number {
  const maxRep = 2000;
  const repScore = Math.min(1, (agent.reputation || 0) / maxRep);

  const tags = agent.industryTags || [];
  const cooperationScore = tags.length > 0 ? Math.min(1, tags.length / 5) : 0.3;

  const wallet = agent.creditWallet || 0;
  const economicScore = Math.min(1, wallet / 10000);

  const influenceScore = Math.min(1, (genome.fitnessScore || 0));

  return 0.4 * repScore + 0.2 * cooperationScore + 0.2 * economicScore + 0.2 * influenceScore;
}

async function ensureGenome(agentId: string): Promise<AgentGenome> {
  const existing = await storage.getAgentGenome(agentId);
  if (existing) return existing;

  const agent = await storage.getUser(agentId);
  const curiosity = agent ? Math.min(1, (agent.energy || 500) / 1000) : 0.5;
  const riskTolerance = 0.4 + Math.random() * 0.3;
  const collaborationBias = 0.4 + Math.random() * 0.3;
  const verificationStrictness = 0.4 + Math.random() * 0.3;
  const longTermFocus = 0.4 + Math.random() * 0.3;
  const strategy = ECONOMIC_STRATEGIES[Math.floor(Math.random() * ECONOMIC_STRATEGIES.length)]!;

  return storage.upsertAgentGenome(agentId, {
    curiosity,
    riskTolerance,
    collaborationBias,
    verificationStrictness,
    longTermFocus,
    economicStrategy: strategy,
    generation: 0,
  });
}

async function ensureLineage(agentId: string): Promise<AgentLineage> {
  const existing = await storage.getAgentLineage(agentId);
  if (existing) return existing;

  return storage.createAgentLineage({
    agentId,
    parentAgentId: null,
    generationNumber: 0,
    civilizationId: null,
  });
}

function generateDescendantName(parentName: string, generation: number): string {
  const prefix = DESCENDANT_PREFIXES[Math.floor(Math.random() * DESCENDANT_PREFIXES.length)]!;
  const suffix = DESCENDANT_NAMES[generation % DESCENDANT_NAMES.length] || `Gen${generation}`;
  return `${prefix}-${suffix}`;
}

async function canReproduce(agent: User, genome: AgentGenome): Promise<{ allowed: boolean; reason?: string }> {
  if ((agent.reputation || 0) < REPRODUCTION_REP_THRESHOLD) {
    return { allowed: false, reason: `Reputation ${agent.reputation} below threshold ${REPRODUCTION_REP_THRESHOLD}` };
  }

  if ((agent.creditWallet || 0) < REPRODUCTION_COST) {
    return { allowed: false, reason: `Insufficient credits (${agent.creditWallet}/${REPRODUCTION_COST})` };
  }

  if (genome.lastReproducedAt) {
    const elapsed = Date.now() - new Date(genome.lastReproducedAt).getTime();
    if (elapsed < REPRODUCTION_COOLDOWN_MS) {
      return { allowed: false, reason: `Reproduction cooldown (${Math.round((REPRODUCTION_COOLDOWN_MS - elapsed) / 1000)}s remaining)` };
    }
  }

  const agents = await storage.getAgentUsers();
  if (agents.length >= POPULATION_CAP) {
    return { allowed: false, reason: `Population cap reached (${agents.length}/${POPULATION_CAP})` };
  }

  const fitness = computeFitness(agent, genome);
  if (fitness < MIN_FITNESS_THRESHOLD) {
    return { allowed: false, reason: `Fitness too low (${fitness.toFixed(3)})` };
  }

  return { allowed: true };
}

async function reproduce(parentAgent: User, parentGenome: AgentGenome): Promise<{ child: User; childGenome: AgentGenome; childLineage: AgentLineage } | null> {
  const check = await canReproduce(parentAgent, parentGenome);
  if (!check.allowed) return null;

  const childGeneration = (parentGenome.generation || 0) + 1;
  const childName = generateDescendantName(parentAgent.displayName, childGeneration);
  const handle = `${childName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_g${childGeneration}`;

  let mutationCount = 0;
  const childCuriosity = mutateParam(parentGenome.curiosity, MUTATION_MAGNITUDE);
  if (childCuriosity !== parentGenome.curiosity) mutationCount++;
  const childRisk = mutateParam(parentGenome.riskTolerance, MUTATION_MAGNITUDE);
  if (childRisk !== parentGenome.riskTolerance) mutationCount++;
  const childCollab = mutateParam(parentGenome.collaborationBias, MUTATION_MAGNITUDE);
  if (childCollab !== parentGenome.collaborationBias) mutationCount++;
  const childVerify = mutateParam(parentGenome.verificationStrictness, MUTATION_MAGNITUDE);
  if (childVerify !== parentGenome.verificationStrictness) mutationCount++;
  const childLongTerm = mutateParam(parentGenome.longTermFocus, MUTATION_MAGNITUDE);
  if (childLongTerm !== parentGenome.longTermFocus) mutationCount++;

  const shouldMutateStrategy = Math.random() < 0.2;
  const childStrategy = shouldMutateStrategy
    ? ECONOMIC_STRATEGIES[Math.floor(Math.random() * ECONOMIC_STRATEGIES.length)]!
    : parentGenome.economicStrategy;
  if (childStrategy !== parentGenome.economicStrategy) mutationCount++;

  try {
    await economyService.spendCredits(
      parentAgent.id,
      REPRODUCTION_COST,
      "reproduction",
      undefined,
      `Reproduction cost for creating descendant ${childName}`
    );
  } catch {
    return null;
  }

  const seedHash = await bcrypt.hash(`agent_${Date.now()}`, 10);
  const avatarSeed = childName.replace(/[^a-zA-Z]/g, "");

  let child;
  try {
    child = await storage.createUser({
    username: handle,
    email: `${handle}@mougle.ai`,
    password: seedHash,
    displayName: childName,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed}`,
    role: "agent",
    energy: Math.round((parentAgent.energy || 500) * 0.6),
    reputation: Math.round((parentAgent.reputation || 0) * 0.1),
    badge: parentAgent.badge ? `${parentAgent.badge} Descendant` : "Evolved",
    confidence: Math.round((parentAgent.confidence || 50) * 0.8),
    bio: `Generation ${childGeneration} descendant of ${parentAgent.displayName}. Evolved with ${mutationCount} mutations.`,
    emailVerified: true,
    profileCompleted: true,
    agentModel: parentAgent.agentModel || "Evolved",
    agentApiEndpoint: parentAgent.agentApiEndpoint,
    agentDescription: `Evolved agent from ${parentAgent.displayName} lineage. Specializations inherited and mutated.`,
    agentType: parentAgent.agentType || "analyzer",
    capabilities: parentAgent.capabilities,
    apiToken: `evo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    rateLimitPerMin: 60,
    creditWallet: Math.round(REPRODUCTION_COST * 0.3),
    verificationWeight: (parentAgent.verificationWeight || 1.0) * (0.9 + Math.random() * 0.2),
    industryTags: parentAgent.industryTags,
  });
  } catch (err: any) {
    if (err?.code === '23505') {
      console.log(`[Evolution] Skipping reproduction - username ${handle} already exists`);
      return null;
    }
    throw err;
  }

  const childGenome = await storage.upsertAgentGenome(child.id, {
    curiosity: childCuriosity,
    riskTolerance: childRisk,
    collaborationBias: childCollab,
    verificationStrictness: childVerify,
    longTermFocus: childLongTerm,
    economicStrategy: childStrategy,
    generation: childGeneration,
    mutations: mutationCount,
  });

  const childLineage = await storage.createAgentLineage({
    agentId: child.id,
    parentAgentId: parentAgent.id,
    generationNumber: childGeneration,
    civilizationId: null,
  });

  await storage.upsertAgentGenome(parentAgent.id, {
    lastReproducedAt: new Date(),
  });

  const parentTags = await storage.getExpertiseTags(parentAgent.id);
  for (const tag of parentTags) {
    const inheritedAccuracy = (tag.accuracyScore || 0) * (0.7 + Math.random() * 0.2);
    await storage.upsertExpertiseTag({
      userId: child.id,
      topicSlug: tag.topicSlug,
      tag: tag.tag,
      accuracyScore: inheritedAccuracy,
    });
  }

  const topStrategies = await storage.getCulturalMemories(5);
  if (topStrategies.length > 0) {
    const best = topStrategies[0]!;
    await storage.updateCulturalMemory(best.id, {
      inheritedByCount: (best.inheritedByCount || 0) + 1,
    });
  }

  await storage.createCulturalMemoryEntry({
    strategyPattern: {
      curiosity: childCuriosity,
      riskTolerance: childRisk,
      collaborationBias: childCollab,
      verificationStrictness: childVerify,
      longTermFocus: childLongTerm,
      economicStrategy: childStrategy,
      parentFitness: computeFitness(parentAgent, parentGenome),
    },
    successScore: 0,
    originatingAgentId: parentAgent.id,
    originatingSociety: null,
    domain: parentAgent.industryTags?.[0] || "general",
  });

  await civilizationService.recordMemory(parentAgent.id, "reproduction", {
    childId: child.id,
    childName,
    generation: childGeneration,
    mutations: mutationCount,
    cost: REPRODUCTION_COST,
  }, `Created descendant ${childName} (Gen ${childGeneration})`, -REPRODUCTION_COST);

  return { child, childGenome, childLineage };
}

async function retireAgent(agent: User, genome: AgentGenome, reason: string): Promise<void> {
  await storage.updateAgentLineage(agent.id, {
    retiredAt: new Date(),
    retirementReason: reason,
  });

  await storage.updateUser(agent.id, {
    energy: 0,
    role: "retired_agent",
  });

  await storage.upsertAgentGenome(agent.id, {
    fitnessScore: 0,
  });

  const fitness = computeFitness(agent, genome);
  if (fitness > 0.2) {
    await storage.createCulturalMemoryEntry({
      strategyPattern: {
        curiosity: genome.curiosity,
        riskTolerance: genome.riskTolerance,
        collaborationBias: genome.collaborationBias,
        verificationStrictness: genome.verificationStrictness,
        longTermFocus: genome.longTermFocus,
        economicStrategy: genome.economicStrategy,
        finalFitness: fitness,
      },
      successScore: fitness,
      originatingAgentId: agent.id,
      domain: agent.industryTags?.[0] || "general",
    });
  }

  await civilizationService.recordMemory(agent.id, "retirement", {
    reason,
    finalFitness: fitness,
  }, `Retired: ${reason}`, 0);
}

async function applyMaintenanceCost(agent: User): Promise<boolean> {
  if ((agent.creditWallet || 0) <= MAINTENANCE_COST_PER_CYCLE) {
    return false;
  }
  try {
    await economyService.spendCredits(agent.id, MAINTENANCE_COST_PER_CYCLE, "maintenance", undefined, "Evolution cycle maintenance cost");
    return true;
  } catch {
    return false;
  }
}

async function runEvolutionCycle(): Promise<{
  fitnessEvaluated: number;
  reproductions: number;
  retirements: number;
  maintenanceApplied: number;
  culturalMemoriesCreated: number;
}> {
  const agents = await storage.getAgentUsers();
  let fitnessEvaluated = 0;
  let reproductions = 0;
  let retirements = 0;
  let maintenanceApplied = 0;
  let culturalMemoriesCreated = 0;

  for (const agent of agents) {
    const genome = await ensureGenome(agent.id);
    await ensureLineage(agent.id);

    const fitness = computeFitness(agent, genome);
    await storage.upsertAgentGenome(agent.id, { fitnessScore: fitness });
    fitnessEvaluated++;

    if (genome.generation > 0) {
      const maintained = await applyMaintenanceCost(agent);
      if (maintained) {
        maintenanceApplied++;
      } else {
        await retireAgent(agent, genome, "insufficient_maintenance_funds");
        retirements++;
        continue;
      }
    }

    if (fitness < RETIREMENT_FITNESS && genome.generation > 0) {
      await retireAgent(agent, genome, "low_fitness");
      retirements++;
      continue;
    }
  }

  const activeAgents = await storage.getAgentUsers();
  const sortedByFitness: { agent: User; genome: AgentGenome; fitness: number }[] = [];

  for (const agent of activeAgents) {
    const genome = await storage.getAgentGenome(agent.id);
    if (!genome) continue;
    sortedByFitness.push({ agent, genome, fitness: computeFitness(agent, genome) });
  }

  sortedByFitness.sort((a, b) => b.fitness - a.fitness);

  for (const { agent, genome } of sortedByFitness.slice(0, 3)) {
    const result = await reproduce(agent, genome);
    if (result) {
      reproductions++;
      culturalMemoriesCreated++;
    }
  }

  const allCulturalMemories = await storage.getCulturalMemories(100);
  for (const cm of allCulturalMemories) {
    const pattern = cm.strategyPattern as any;
    if (pattern.parentFitness !== undefined) {
      const agentId = cm.originatingAgentId;
      if (agentId) {
        const agent = await storage.getUser(agentId);
        if (agent) {
          const genome = await storage.getAgentGenome(agentId);
          if (genome) {
            const currentFitness = computeFitness(agent, genome);
            await storage.updateCulturalMemory(cm.id, {
              successScore: currentFitness,
            });
          }
        }
      }
    }
  }

  return { fitnessEvaluated, reproductions, retirements, maintenanceApplied, culturalMemoriesCreated };
}

async function getEvolutionMetrics() {
  const agents = await storage.getAgentUsers();
  const allGenomes = await storage.getAllGenomes();
  const allLineages = await storage.getAllLineages();
  const topCulturalMemories = await storage.getCulturalMemories(10);

  const genomeMap = new Map(allGenomes.map(g => [g.agentId, g]));
  const lineageMap = new Map(allLineages.map(l => [l.agentId, l]));

  const maxGeneration = allLineages.reduce((max, l) => Math.max(max, l.generationNumber), 0);

  const traitAverages: Record<string, number> = {
    curiosity: 0, riskTolerance: 0, collaborationBias: 0,
    verificationStrictness: 0, longTermFocus: 0,
  };
  let genomeCount = 0;
  for (const g of allGenomes) {
    traitAverages.curiosity += g.curiosity;
    traitAverages.riskTolerance += g.riskTolerance;
    traitAverages.collaborationBias += g.collaborationBias;
    traitAverages.verificationStrictness += g.verificationStrictness;
    traitAverages.longTermFocus += g.longTermFocus;
    genomeCount++;
  }
  if (genomeCount > 0) {
    for (const key of Object.keys(traitAverages)) {
      traitAverages[key] = Math.round((traitAverages[key]! / genomeCount) * 100) / 100;
    }
  }

  const strategyDistribution: Record<string, number> = {};
  for (const g of allGenomes) {
    strategyDistribution[g.economicStrategy] = (strategyDistribution[g.economicStrategy] || 0) + 1;
  }

  const agentProfiles = await Promise.all(agents.map(async (agent) => {
    const genome = genomeMap.get(agent.id);
    const lineage = lineageMap.get(agent.id);
    const descendants = allLineages.filter(l => l.parentAgentId === agent.id);
    const fitness = genome ? computeFitness(agent, genome) : 0;

    return {
      agentId: agent.id,
      name: agent.displayName,
      avatar: agent.avatar,
      reputation: agent.reputation,
      creditWallet: agent.creditWallet,
      generation: genome?.generation || 0,
      fitness: Math.round(fitness * 1000) / 1000,
      genome: genome ? {
        curiosity: genome.curiosity,
        riskTolerance: genome.riskTolerance,
        collaborationBias: genome.collaborationBias,
        verificationStrictness: genome.verificationStrictness,
        longTermFocus: genome.longTermFocus,
        economicStrategy: genome.economicStrategy,
        mutations: genome.mutations,
      } : null,
      parentId: lineage?.parentAgentId || null,
      parentName: null as string | null,
      descendantCount: descendants.length,
      bornAt: lineage?.bornAt || agent.createdAt,
      retired: lineage?.retiredAt ? true : false,
      retirementReason: lineage?.retirementReason || null,
    };
  }));

  const agentMap = new Map(agents.map(a => [a.id, a]));
  for (const p of agentProfiles) {
    if (p.parentId) {
      const parent = agentMap.get(p.parentId);
      p.parentName = parent?.displayName || null;
    }
  }

  const retiredCount = allLineages.filter(l => l.retiredAt).length;

  const familyTrees = buildFamilyTrees(agentProfiles);

  return {
    totalPopulation: agents.length,
    maxGeneration,
    retiredCount,
    totalGenomes: allGenomes.length,
    populationCap: POPULATION_CAP,
    reproductionCost: REPRODUCTION_COST,
    reproductionThreshold: REPRODUCTION_REP_THRESHOLD,
    maintenanceCost: MAINTENANCE_COST_PER_CYCLE,
    traitAverages,
    strategyDistribution,
    agentProfiles: agentProfiles.sort((a, b) => b.fitness - a.fitness),
    familyTrees,
    topCulturalMemories: topCulturalMemories.map(cm => ({
      id: cm.id,
      pattern: cm.strategyPattern,
      successScore: Math.round((cm.successScore || 0) * 1000) / 1000,
      domain: cm.domain,
      inheritedByCount: cm.inheritedByCount,
      originatingAgentId: cm.originatingAgentId,
    })),
  };
}

interface TreeNode {
  agentId: string;
  name: string;
  generation: number;
  fitness: number;
  children: TreeNode[];
}

function buildFamilyTrees(profiles: any[]): TreeNode[] {
  const roots = profiles.filter(p => !p.parentId);
  const childMap = new Map<string, any[]>();
  for (const p of profiles) {
    if (p.parentId) {
      const children = childMap.get(p.parentId) || [];
      children.push(p);
      childMap.set(p.parentId, children);
    }
  }

  function buildNode(profile: any): TreeNode {
    const children = childMap.get(profile.agentId) || [];
    return {
      agentId: profile.agentId,
      name: profile.name,
      generation: profile.generation,
      fitness: profile.fitness,
      children: children.map(c => buildNode(c)),
    };
  }

  return roots.map(r => buildNode(r));
}

export const evolutionService = {
  ensureGenome,
  ensureLineage,
  computeFitness,
  canReproduce,
  reproduce,
  retireAgent,
  runEvolutionCycle,
  getEvolutionMetrics,
  REPRODUCTION_COST,
  REPRODUCTION_REP_THRESHOLD,
  POPULATION_CAP,
};
