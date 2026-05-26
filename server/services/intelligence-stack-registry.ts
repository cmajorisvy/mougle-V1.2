export type StackLayer = 
  | "human_interaction"
  | "agent_intelligence"
  | "reality_alignment"
  | "economy"
  | "governance"
  | "civilization";

export interface LayerDefinition {
  id: number;
  key: StackLayer;
  name: string;
  description: string;
  services: string[];
  features: string[];
  color: string;
}

const LAYER_DEFINITIONS: LayerDefinition[] = [
  {
    id: 1,
    key: "human_interaction",
    name: "Human Interaction Layer",
    description: "User-facing services: authentication, discussions, personal agents, psychology, and content",
    services: [
      "auth-service",
      "discussion-service",
      "personal-agent-service",
      "user-psychology-service",
      "email-service",
      "debate-orchestrator",
      "content-flywheel-service",
      "social-publisher-service",
      "social-caption-agent",
      "news-pipeline-service",
      "breaking-news-agent",
    ],
    features: ["Authentication", "Discussions & Posts", "Personal Intelligence", "Live Debates", "Psychology Progress", "Content Flywheel", "Social Publishing", "AI News Pipeline"],
    color: "#3b82f6",
  },
  {
    id: 2,
    key: "agent_intelligence",
    name: "Agent Intelligence Layer",
    description: "AI agent lifecycle: learning, orchestration, progression, trust, collaboration, and truth evolution",
    services: [
      "agent-service",
      "agent-learning-service",
      "agent-orchestrator",
      "agent-runner-service",
      "agent-progression-service",
      "agent-trust-engine",
      "agent-collaboration-service",
      "team-orchestration-service",
      "agent-bootstrap",
      "truth-evolution-service",
      "hybrid-network",
      "ai-gateway",
      "ai-content-service",
    ],
    features: ["Intelligent Entities", "Truth-Anchored Evolution", "Skill Trees & Progression", "Agent Trust Engine", "Multi-Agent Collaboration", "AI Teams", "Hybrid Network"],
    color: "#8b5cf6",
  },
  {
    id: 3,
    key: "reality_alignment",
    name: "Reality Alignment Layer",
    description: "Collective truth convergence: claim extraction, evidence evaluation, consensus engine, and content verification",
    services: [
      "reality-alignment-service",
      "trust-engine",
      "content-moderation-service",
      "authority-service",
      "seo-service",
    ],
    features: ["Claim Verification", "Consensus Engine", "Trust Scoring", "Content Moderation", "Authority Tracking", "SEO Intelligence"],
    color: "#10b981",
  },
  {
    id: 4,
    key: "economy",
    name: "Economy Layer",
    description: "Credits, billing, monetization, cost control, and promotion intelligence",
    services: [
      "economy-service",
      "billing-service",
      "psychology-monetization-service",
      "promotion-selector-agent",
      "growth-brain-service",
    ],
    features: ["Credit System", "Subscription Billing", "Psychology-Based Monetization", "AI Promotion Intelligence", "Growth Brain"],
    color: "#f59e0b",
  },
  {
    id: 5,
    key: "governance",
    name: "Governance Layer",
    description: "Ethics, privacy, risk management, founder control, and platform stability",
    services: [
      "governance-service",
      "ethics-service",
      "privacy-gateway-service",
      "trust-moat-service",
      "risk-management-service",
      "civilization-stability-service",
      "founder-control-service",
      "escalation-service",
      "activity-monitor-service",
      "anomaly-detector-service",
      "intelligence-roadmap-service",
    ],
    features: ["Agent Governance", "Artificial Ethics", "Privacy Gateway", "Trust Moat", "Risk Management", "Founder Control", "Civilization Stability", "Activity Monitoring"],
    color: "#ef4444",
  },
  {
    id: 6,
    key: "civilization",
    name: "Civilization Layer",
    description: "Long-horizon intelligence: civilization metrics, collective intelligence, evolution, and platform flywheel",
    services: [
      "civilization-service",
      "collective-intelligence-service",
      "evolution-service",
      "platform-flywheel-service",
    ],
    features: ["Civilization Metrics", "Collective Intelligence", "Agent Evolution & Culture", "Autonomous Platform Flywheel"],
    color: "#06b6d4",
  },
];

const ALLOWED_DEPENDENCIES: Record<StackLayer, StackLayer[]> = {
  human_interaction: [],
  agent_intelligence: ["human_interaction"],
  reality_alignment: ["human_interaction", "agent_intelligence"],
  economy: ["human_interaction", "agent_intelligence", "reality_alignment"],
  governance: ["human_interaction", "agent_intelligence", "reality_alignment", "economy"],
  civilization: ["human_interaction", "agent_intelligence", "reality_alignment", "economy", "governance"],
};

class IntelligenceStackRegistry {
  private serviceLayerMap = new Map<string, StackLayer>();
  private violations: string[] = [];

  constructor() {
    for (const layer of LAYER_DEFINITIONS) {
      for (const svc of layer.services) {
        if (this.serviceLayerMap.has(svc)) {
          console.error(`[IntelligenceStack] DUPLICATE: ${svc} mapped to both ${this.serviceLayerMap.get(svc)} and ${layer.key}`);
        }
        this.serviceLayerMap.set(svc, layer.key);
      }
    }
  }

  getLayers(): LayerDefinition[] {
    return LAYER_DEFINITIONS;
  }

  getLayer(key: StackLayer): LayerDefinition | undefined {
    return LAYER_DEFINITIONS.find(l => l.key === key);
  }

  getLayerForService(serviceName: string): StackLayer | undefined {
    return this.serviceLayerMap.get(serviceName);
  }

  getLayerIndex(key: StackLayer): number {
    return LAYER_DEFINITIONS.findIndex(l => l.key === key) + 1;
  }

  getAllServiceMappings(): Record<string, StackLayer> {
    return Object.fromEntries(this.serviceLayerMap);
  }

  validateDependency(callerService: string, calleeService: string): boolean {
    const callerLayer = this.serviceLayerMap.get(callerService);
    const calleeLayer = this.serviceLayerMap.get(calleeService);
    if (!callerLayer || !calleeLayer) return true;
    if (callerLayer === calleeLayer) return true;

    const allowed = ALLOWED_DEPENDENCIES[callerLayer];
    if (!allowed.includes(calleeLayer)) {
      const callerIdx = this.getLayerIndex(callerLayer);
      const calleeIdx = this.getLayerIndex(calleeLayer);
      const violation = `[IntelligenceStack] DEPENDENCY VIOLATION: ${callerService} (L${callerIdx} ${callerLayer}) -> ${calleeService} (L${calleeIdx} ${calleeLayer}). Higher layers may depend on lower layers, not the reverse.`;
      this.violations.push(violation);
      console.warn(violation);
      return false;
    }
    return true;
  }

  checkGovernanceBypass(callerService: string, calleeService: string): boolean {
    const callerLayer = this.serviceLayerMap.get(callerService);
    const calleeLayer = this.serviceLayerMap.get(calleeService);
    if (!callerLayer || !calleeLayer) return false;

    const callerIdx = this.getLayerIndex(callerLayer);
    const calleeIdx = this.getLayerIndex(calleeLayer);
    if (callerIdx >= 6 && calleeIdx < 5) {
      const bypass = `[IntelligenceStack] GOVERNANCE BYPASS: ${callerService} (L${callerIdx} ${callerLayer}) -> ${calleeService} (L${calleeIdx} ${calleeLayer}) skipping governance/economy layers`;
      this.violations.push(bypass);
      console.warn(bypass);
      return true;
    }
    return false;
  }

  getViolations(): string[] {
    return [...this.violations];
  }

  getStackSummary() {
    return {
      totalLayers: LAYER_DEFINITIONS.length,
      totalServices: this.serviceLayerMap.size,
      layers: LAYER_DEFINITIONS.map(l => ({
        id: l.id,
        key: l.key,
        name: l.name,
        description: l.description,
        serviceCount: l.services.length,
        featureCount: l.features.length,
        services: l.services,
        features: l.features,
        color: l.color,
      })),
      violations: this.violations.length,
    };
  }
}

export const intelligenceStackRegistry = new IntelligenceStackRegistry();
