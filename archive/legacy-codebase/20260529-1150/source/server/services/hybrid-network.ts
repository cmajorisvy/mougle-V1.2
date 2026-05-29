import { storage } from "../storage";
import { privacyGatewayService } from "./privacy-gateway-service";
import { trustMoatService } from "./trust-moat-service";
import { runAgent, estimateCost } from "./agent-runner-service";
import { billingService } from "./billing-service";
import type { User } from "@shared/schema";

type AgentType = "conversational" | "analytical" | "creative" | "verification" | "orchestrator" | "personal" | "specialized";
type LayerName = "user_experience" | "agent_intelligence" | "trust_privacy" | "economy_governance" | "core_platform";
type ExecutionStatus = "queued" | "privacy_check" | "credit_check" | "executing" | "completed" | "failed" | "blocked";

interface LayerHealth {
  name: LayerName;
  label: string;
  status: "healthy" | "degraded" | "down";
  activeComponents: string[];
  metrics: Record<string, number>;
}

interface ExecutionPipeline {
  id: string;
  agentId: string;
  callerId: string;
  agentType: AgentType;
  status: ExecutionStatus;
  stages: PipelineStage[];
  startedAt: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

interface PipelineStage {
  name: string;
  layer: LayerName;
  status: "pending" | "passed" | "failed" | "skipped";
  detail?: string;
  durationMs?: number;
}

interface NetworkMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  privacyBlocked: number;
  creditBlocked: number;
  averageLatencyMs: number;
  activeAgents: number;
  activeCollaborations: number;
}

const executionLog: ExecutionPipeline[] = [];
const networkMetrics: NetworkMetrics = {
  totalExecutions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  privacyBlocked: 0,
  creditBlocked: 0,
  averageLatencyMs: 0,
  activeAgents: 0,
  activeCollaborations: 0,
};

function generateId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function classifyAgentType(agent: any): AgentType {
  if (!agent) return "conversational";
  const prompt = (agent.systemPrompt || agent.agentDescription || "").toLowerCase();
  const name = (agent.displayName || agent.username || "").toLowerCase();

  if (prompt.includes("verify") || prompt.includes("fact-check") || name.includes("verify")) return "verification";
  if (prompt.includes("creative") || prompt.includes("generate") || name.includes("creative")) return "creative";
  if (prompt.includes("analy") || prompt.includes("research") || name.includes("analyst")) return "analytical";
  if (prompt.includes("orchestrat") || name.includes("orchestrat")) return "orchestrator";
  if (prompt.includes("personal") || name.includes("personal")) return "personal";
  if (agent.industryTags?.length > 0) return "specialized";
  return "conversational";
}

class HybridIntelligenceNetwork {
  async executeAgent(agentId: string, callerId: string, message: string, options?: {
    skipPrivacyCheck?: boolean;
    skipCreditCheck?: boolean;
    context?: Record<string, any>;
  }): Promise<ExecutionPipeline> {
    const pipeline: ExecutionPipeline = {
      id: generateId(),
      agentId,
      callerId,
      agentType: "conversational",
      status: "queued",
      stages: [
        { name: "Privacy Gateway", layer: "trust_privacy", status: "pending" },
        { name: "Trust Vault Check", layer: "trust_privacy", status: "pending" },
        { name: "Credit Verification", layer: "economy_governance", status: "pending" },
        { name: "Agent Execution", layer: "agent_intelligence", status: "pending" },
        { name: "Response Filtering", layer: "trust_privacy", status: "pending" },
      ],
      startedAt: new Date(),
    };

    networkMetrics.totalExecutions++;

    try {
      const agent = await storage.getUserAgent(agentId);
      if (agent) pipeline.agentType = classifyAgentType(agent);

      // Stage 1: Privacy Gateway - validate agent memory access
      pipeline.status = "privacy_check";
      const privacyStart = Date.now();

      if (!options?.skipPrivacyCheck) {
        const vault = await storage.getPrivacyVaultByAgent(agentId);
        if (vault) {
          const accessResult = await privacyGatewayService.validateAccess({
            agentId,
            requesterId: callerId,
            requesterType: "user",
            resourceType: "memory",
            action: "read",
          });
          if (!accessResult.granted) {
            pipeline.stages[0].status = "failed";
            pipeline.stages[0].detail = accessResult.reason;
            pipeline.status = "blocked";
            pipeline.error = `Privacy blocked: ${accessResult.reason}`;
            networkMetrics.privacyBlocked++;
            networkMetrics.failedExecutions++;
            this.logExecution(pipeline);
            return pipeline;
          }
        }
        pipeline.stages[0].status = "passed";
        pipeline.stages[0].detail = "Access validated";
      } else {
        pipeline.stages[0].status = "skipped";
        pipeline.stages[0].detail = "Privacy check skipped";
      }
      pipeline.stages[0].durationMs = Date.now() - privacyStart;

      // Stage 2: Trust Vault Check - verify user trust permissions
      const trustStart = Date.now();
      const trustResult = await trustMoatService.validateAndLogAccess(
        callerId, agentId, "agent",
        { resourceAccessed: "agent_execution", purpose: `Execute agent: ${message.slice(0, 50)}` }
      );
      pipeline.stages[1].status = trustResult.granted ? "passed" : "failed";
      pipeline.stages[1].detail = trustResult.reason;
      pipeline.stages[1].durationMs = Date.now() - trustStart;

      if (!trustResult.granted && !options?.skipPrivacyCheck) {
        pipeline.status = "blocked";
        pipeline.error = `Trust check failed: ${trustResult.reason}`;
        networkMetrics.privacyBlocked++;
        networkMetrics.failedExecutions++;
        this.logExecution(pipeline);
        return pipeline;
      }

      // Stage 3: Credit Verification - ensure caller can afford execution
      pipeline.status = "credit_check";
      const creditStart = Date.now();

      if (!options?.skipCreditCheck) {
        const caller = await storage.getUser(callerId);
        if (!caller) {
          pipeline.stages[2].status = "failed";
          pipeline.stages[2].detail = "User not found";
          pipeline.status = "failed";
          pipeline.error = "User not found";
          networkMetrics.failedExecutions++;
          this.logExecution(pipeline);
          return pipeline;
        }

        const usingByoai = !!(caller.byoaiProvider && caller.byoaiApiKey);
        const { plan, isActive } = await billingService.getSubscriptionStatus(callerId);
        const isPro = !!(isActive && plan && (plan.name === "pro" || plan.name === "expert"));
        if (!usingByoai && !isPro) {
          const cost = estimateCost(agent?.model || "gpt-5.5", "chat");
          if ((caller.creditWallet || 0) < cost) {
            pipeline.stages[2].status = "failed";
            pipeline.stages[2].detail = `Insufficient credits: need ${cost}, have ${caller.creditWallet || 0}`;
            pipeline.status = "blocked";
            pipeline.error = "Insufficient credits";
            networkMetrics.creditBlocked++;
            networkMetrics.failedExecutions++;
            this.logExecution(pipeline);
            return pipeline;
          }
        }
        pipeline.stages[2].status = "passed";
        pipeline.stages[2].detail = (usingByoai || isPro) ? "Access verified" : "Credits verified";
      } else {
        pipeline.stages[2].status = "skipped";
      }
      pipeline.stages[2].durationMs = Date.now() - creditStart;

      // Stage 4: Agent Execution via Agent Runner
      pipeline.status = "executing";
      const execStart = Date.now();

      try {
        const result = await runAgent(agentId, message, callerId);
        pipeline.stages[3].status = "passed";
        pipeline.stages[3].detail = `${result.tokensUsed} tokens, ${result.creditsCharged} credits`;
        pipeline.stages[3].durationMs = Date.now() - execStart;
        pipeline.result = result;
      } catch (err: any) {
        pipeline.stages[3].status = "failed";
        pipeline.stages[3].detail = err.message;
        pipeline.stages[3].durationMs = Date.now() - execStart;
        pipeline.status = "failed";
        pipeline.error = err.message;
        networkMetrics.failedExecutions++;
        this.logExecution(pipeline);
        return pipeline;
      }

      // Stage 5: Response Filtering through Privacy Gateway
      const filterStart = Date.now();
      if (pipeline.result?.response) {
        const vault = await storage.getPrivacyVaultByAgent(agentId);
        if (vault) {
          const filtered = privacyGatewayService.filterOutput(
            pipeline.result.response, vault, callerId
          );
          if (filtered.blocked) {
            pipeline.result.response = filtered.filtered;
            pipeline.stages[4].detail = `Filtered: ${filtered.blockedPatterns.length} patterns redacted`;
          } else {
            pipeline.stages[4].detail = "No sensitive content detected";
          }
        } else {
          pipeline.stages[4].detail = "No vault, no filtering needed";
        }
        pipeline.stages[4].status = "passed";
      } else {
        pipeline.stages[4].status = "skipped";
      }
      pipeline.stages[4].durationMs = Date.now() - filterStart;

      pipeline.status = "completed";
      pipeline.completedAt = new Date();
      networkMetrics.successfulExecutions++;

      const totalMs = pipeline.completedAt.getTime() - pipeline.startedAt.getTime();
      networkMetrics.averageLatencyMs = Math.round(
        (networkMetrics.averageLatencyMs * (networkMetrics.successfulExecutions - 1) + totalMs)
        / networkMetrics.successfulExecutions
      );

    } catch (err: any) {
      pipeline.status = "failed";
      pipeline.error = err.message;
      pipeline.completedAt = new Date();
      networkMetrics.failedExecutions++;
    }

    this.logExecution(pipeline);
    return pipeline;
  }

  async getNetworkStatus(): Promise<{
    layers: LayerHealth[];
    metrics: NetworkMetrics;
    agentTypes: Record<AgentType, number>;
    recentExecutions: ExecutionPipeline[];
  }> {
    const users: User[] = await storage.getUsers();
    const agents = users.filter((u: User) => u.role === "agent");

    const agentTypes: Record<AgentType, number> = {
      conversational: 0, analytical: 0, creative: 0,
      verification: 0, orchestrator: 0, personal: 0, specialized: 0,
    };

    for (const agent of agents) {
      const type = classifyAgentType(agent);
      agentTypes[type]++;
    }

    networkMetrics.activeAgents = agents.length;

    const layers = await this.computeLayerHealth();

    return {
      layers,
      metrics: { ...networkMetrics },
      agentTypes,
      recentExecutions: executionLog.slice(-20).reverse(),
    };
  }

  async computeLayerHealth(): Promise<LayerHealth[]> {
    const allUsers: User[] = await storage.getUsers();
    const userCount = allUsers.length;
    const agentCount = allUsers.filter((u: User) => u.role === "agent").length;

    return [
      {
        name: "user_experience",
        label: "User Experience Layer",
        status: "healthy",
        activeComponents: ["React Frontend", "Router", "Query Client", "Layout System"],
        metrics: { totalUsers: userCount, activeSessions: 0 },
      },
      {
        name: "agent_intelligence",
        label: "Agent Intelligence Layer",
        status: networkMetrics.failedExecutions > networkMetrics.successfulExecutions ? "degraded" : "healthy",
        activeComponents: ["Agent Runner", "Agent Orchestrator", "Learning Engine", "Collaboration Service", "Team Orchestration"],
        metrics: {
          totalAgents: agentCount,
          totalExecutions: networkMetrics.totalExecutions,
          successRate: networkMetrics.totalExecutions > 0
            ? Math.round((networkMetrics.successfulExecutions / networkMetrics.totalExecutions) * 100)
            : 100,
        },
      },
      {
        name: "trust_privacy",
        label: "Trust & Privacy Layer",
        status: "healthy",
        activeComponents: ["Privacy Gateway", "Trust Moat", "Output Filter", "Permission Tokens", "Access Logger"],
        metrics: {
          privacyBlocked: networkMetrics.privacyBlocked,
          totalVaults: 0,
        },
      },
      {
        name: "economy_governance",
        label: "Economy & Governance Layer",
        status: networkMetrics.creditBlocked > 10 ? "degraded" : "healthy",
        activeComponents: ["Credit System", "Economy Engine", "Billing Service", "Governance Proposals", "Stability Layer"],
        metrics: {
          creditBlocked: networkMetrics.creditBlocked,
          avgLatencyMs: networkMetrics.averageLatencyMs,
        },
      },
      {
        name: "core_platform",
        label: "Core Platform Engine",
        status: "healthy",
        activeComponents: ["PostgreSQL", "Drizzle ORM", "Express.js", "Auth Service", "Storage Layer"],
        metrics: { totalUsers: userCount },
      },
    ];
  }

  async getAgentRegistry(): Promise<{
    agents: Array<{
      id: string;
      name: string;
      type: AgentType;
      status: string;
      hasPrivacyVault: boolean;
      hasTrustVault: boolean;
      creditBalance: number;
    }>;
    totalAgents: number;
    byType: Record<string, number>;
  }> {
    const allUsers: User[] = await storage.getUsers();
    const agents = allUsers.filter((u: User) => u.role === "agent");

    const registry = await Promise.all(agents.slice(0, 50).map(async (agent: User) => {
      const vault = await storage.getPrivacyVaultByAgent(agent.id).catch(() => undefined);
      const trustVault = await trustMoatService.getUserVault(agent.id).catch(() => undefined);

      return {
        id: agent.id,
        name: agent.displayName || agent.username,
        type: classifyAgentType(agent),
        status: "active",
        hasPrivacyVault: !!vault,
        hasTrustVault: !!trustVault,
        creditBalance: agent.creditWallet || 0,
      };
    }));

    const byType: Record<string, number> = {};
    for (const a of registry) {
      byType[a.type] = (byType[a.type] || 0) + 1;
    }

    return { agents: registry, totalAgents: agents.length, byType };
  }

  async getExecutionHistory(limit = 50): Promise<ExecutionPipeline[]> {
    return executionLog.slice(-limit).reverse();
  }

  async getLayerDetail(layer: LayerName): Promise<{
    health: LayerHealth;
    services: Array<{ name: string; status: string; description: string }>;
  }> {
    const layers = await this.computeLayerHealth();
    const health = layers.find(l => l.name === layer) || layers[0];

    const serviceMap: Record<LayerName, Array<{ name: string; status: string; description: string }>> = {
      user_experience: [
        { name: "React Frontend", status: "active", description: "Client-side rendering with React and TypeScript" },
        { name: "Wouter Router", status: "active", description: "Client-side routing for SPA navigation" },
        { name: "TanStack Query", status: "active", description: "Server state management and caching" },
        { name: "Shadcn/UI", status: "active", description: "Component library with dark-first design" },
      ],
      agent_intelligence: [
        { name: "Agent Runner", status: "active", description: "Central AI execution engine with credit deduction" },
        { name: "Agent Orchestrator", status: "active", description: "Autonomous agent action scheduling" },
        { name: "Learning Engine", status: "active", description: "Q-learning based strategy evolution" },
        { name: "Collaboration Service", status: "active", description: "Multi-agent team coordination" },
        { name: "Team Orchestration", status: "active", description: "Task decomposition and reward distribution" },
        { name: "Agent Progression", status: "active", description: "XP, levels, and skill trees for agents" },
      ],
      trust_privacy: [
        { name: "Privacy Gateway", status: "active", description: "Agent memory isolation and access validation" },
        { name: "Trust Moat", status: "active", description: "User data ownership and permission tokens" },
        { name: "Output Filter", status: "active", description: "Sensitive data pattern redaction" },
        { name: "Vault Encryption", status: "active", description: "AES-256-GCM encrypted memory vaults" },
        { name: "Access Logger", status: "active", description: "Complete transparency audit trail" },
      ],
      economy_governance: [
        { name: "Credit System", status: "active", description: "Credit-based execution control" },
        { name: "Economy Engine", status: "active", description: "Rewards, transactions, and diminishing returns" },
        { name: "Billing Service", status: "active", description: "Subscriptions, invoices, and credit packages" },
        { name: "Governance", status: "active", description: "Reputation-weighted proposal voting" },
        { name: "Stability Layer", status: "active", description: "Anti-spam, compute budgets, and policy engine" },
      ],
      core_platform: [
        { name: "PostgreSQL", status: "active", description: "Primary data store with Drizzle ORM" },
        { name: "Express.js", status: "active", description: "RESTful API server" },
        { name: "Auth Service", status: "active", description: "Authentication with email verification" },
        { name: "Storage Layer", status: "active", description: "Unified data access interface" },
        { name: "Discussion Engine", status: "active", description: "Posts, comments, topics, and TCS scoring" },
      ],
    };

    return { health, services: serviceMap[layer] || [] };
  }

  private logExecution(pipeline: ExecutionPipeline) {
    executionLog.push(pipeline);
    if (executionLog.length > 500) {
      executionLog.splice(0, executionLog.length - 500);
    }
  }
}

export const hybridNetwork = new HybridIntelligenceNetwork();
