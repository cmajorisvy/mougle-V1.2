import crypto from "crypto";
import { storage } from "../storage";
import type { AgentPrivacyVault, PrivacyAccessLog } from "@shared/schema";

const PRIVACY_MODES = ["ultra_private", "personal", "collaborative", "open"] as const;
type PrivacyMode = typeof PRIVACY_MODES[number];

const COMMUNICATION_SCOPES = ["owner_only", "allowed_agents", "same_team", "platform_wide"] as const;
const EXECUTION_AUTONOMY_LEVELS = ["manual", "supervised", "semi_autonomous", "fully_autonomous"] as const;

const PRIVACY_MODE_DEFAULTS: Record<PrivacyMode, {
  learningPermission: boolean;
  sharingPermission: boolean;
  communicationScope: string;
  dataExportPermission: boolean;
  executionAutonomy: string;
}> = {
  ultra_private: {
    learningPermission: false,
    sharingPermission: false,
    communicationScope: "owner_only",
    dataExportPermission: false,
    executionAutonomy: "manual",
  },
  personal: {
    learningPermission: true,
    sharingPermission: false,
    communicationScope: "owner_only",
    dataExportPermission: false,
    executionAutonomy: "supervised",
  },
  collaborative: {
    learningPermission: true,
    sharingPermission: true,
    communicationScope: "allowed_agents",
    dataExportPermission: false,
    executionAutonomy: "semi_autonomous",
  },
  open: {
    learningPermission: true,
    sharingPermission: true,
    communicationScope: "platform_wide",
    dataExportPermission: true,
    executionAutonomy: "fully_autonomous",
  },
};

const SENSITIVE_PATTERNS = [
  /\b(password|passwd|pwd)\b/i,
  /\b(ssn|social\s*security)\b/i,
  /\b(credit\s*card|cc\s*number|cvv)\b/i,
  /\b(bank\s*account|routing\s*number)\b/i,
  /\b(private\s*key|secret\s*key|api\s*key)\b/i,
  /\b(medical|diagnosis|prescription)\b/i,
  /\b(salary|income|net\s*worth)\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
];

class PrivacyGatewayService {

  async initializeVault(ownerId: string, agentId: string, mode: PrivacyMode = "personal"): Promise<AgentPrivacyVault> {
    const existing = await storage.getPrivacyVaultByAgent(agentId);
    if (existing) return existing;

    const vaultKey = crypto.randomBytes(32).toString("hex");
    const defaults = PRIVACY_MODE_DEFAULTS[mode] || PRIVACY_MODE_DEFAULTS.personal;

    return storage.createPrivacyVault({
      agentId,
      ownerId,
      vaultKey,
      privacyMode: mode,
      ...defaults,
      allowedAgents: [],
      blockedAgents: [],
      isActive: true,
    });
  }

  async getVaultsByOwner(ownerId: string): Promise<AgentPrivacyVault[]> {
    return storage.getPrivacyVaultsByOwner(ownerId);
  }

  async getVault(vaultId: string): Promise<AgentPrivacyVault | undefined> {
    return storage.getPrivacyVault(vaultId);
  }

  async setPrivacyMode(vaultId: string, ownerId: string, mode: PrivacyMode): Promise<AgentPrivacyVault> {
    const vault = await storage.getPrivacyVault(vaultId);
    if (!vault) throw new Error("Vault not found");
    if (vault.ownerId !== ownerId) throw new Error("Not authorized");

    const defaults = PRIVACY_MODE_DEFAULTS[mode];
    if (!defaults) throw new Error("Invalid privacy mode");

    return storage.updatePrivacyVault(vaultId, {
      privacyMode: mode,
      ...defaults,
    });
  }

  async updateRestrictions(vaultId: string, ownerId: string, settings: {
    learningPermission?: boolean;
    sharingPermission?: boolean;
    communicationScope?: string;
    dataExportPermission?: boolean;
    executionAutonomy?: string;
    allowedAgents?: string[];
    blockedAgents?: string[];
  }): Promise<AgentPrivacyVault> {
    const vault = await storage.getPrivacyVault(vaultId);
    if (!vault) throw new Error("Vault not found");
    if (vault.ownerId !== ownerId) throw new Error("Not authorized");

    return storage.updatePrivacyVault(vaultId, settings);
  }

  async validateAccess(params: {
    agentId: string;
    requesterId: string;
    requesterType: "user" | "agent" | "system";
    resourceType: string;
    action: string;
  }): Promise<{ granted: boolean; reason: string }> {
    const vault = await storage.getPrivacyVaultByAgent(params.agentId);

    if (!vault || !vault.isActive) {
      await this.logAccess({ ...params, vaultId: "none", granted: false, reason: "No vault found" });
      return { granted: false, reason: "No privacy vault configured for this agent" };
    }

    if (params.requesterId === vault.ownerId) {
      await this.logAccess({ ...params, vaultId: vault.id, granted: true, reason: "Owner access" });
      return { granted: true, reason: "Owner has full access" };
    }

    if (vault.blockedAgents?.includes(params.requesterId)) {
      await this.recordViolation(vault.id, params.requesterId, "blocked_access_attempt",
        "high", `Blocked agent ${params.requesterId} attempted to access vault`);
      await this.logAccess({ ...params, vaultId: vault.id, granted: false, reason: "Agent is blocked" });
      return { granted: false, reason: "Access denied - agent is blocked" };
    }

    const mode = vault.privacyMode as PrivacyMode;

    if (mode === "ultra_private") {
      await this.logAccess({ ...params, vaultId: vault.id, granted: false, reason: "Ultra private mode" });
      return { granted: false, reason: "Agent is in ultra-private mode - no external access" };
    }

    if (mode === "personal") {
      if (params.requesterType === "system") {
        await this.logAccess({ ...params, vaultId: vault.id, granted: true, reason: "System access in personal mode" });
        return { granted: true, reason: "System access allowed" };
      }
      await this.logAccess({ ...params, vaultId: vault.id, granted: false, reason: "Personal mode - owner only" });
      return { granted: false, reason: "Agent is in personal mode - owner access only" };
    }

    if (mode === "collaborative") {
      if (vault.allowedAgents?.includes(params.requesterId) || params.requesterType === "system") {
        await this.logAccess({ ...params, vaultId: vault.id, granted: true, reason: "Allowed agent or system" });
        return { granted: true, reason: "Access granted - agent is in allowed list" };
      }
      await this.logAccess({ ...params, vaultId: vault.id, granted: false, reason: "Not in allowed list" });
      return { granted: false, reason: "Access denied - not in allowed agents list" };
    }

    if (mode === "open") {
      if (params.action === "read_memory" || params.action === "read_data") {
        if (!vault.sharingPermission) {
          await this.logAccess({ ...params, vaultId: vault.id, granted: false, reason: "Sharing disabled" });
          return { granted: false, reason: "Data sharing is disabled" };
        }
      }
      await this.logAccess({ ...params, vaultId: vault.id, granted: true, reason: "Open mode" });
      return { granted: true, reason: "Access granted - open mode" };
    }

    await this.logAccess({ ...params, vaultId: vault.id, granted: false, reason: "Unknown mode" });
    return { granted: false, reason: "Access denied - unknown privacy mode" };
  }

  async checkLearningPermission(agentId: string): Promise<boolean> {
    const vault = await storage.getPrivacyVaultByAgent(agentId);
    return vault?.learningPermission ?? false;
  }

  async checkExportPermission(agentId: string, requesterId: string): Promise<boolean> {
    const vault = await storage.getPrivacyVaultByAgent(agentId);
    if (!vault) return false;
    if (vault.ownerId === requesterId) return true;
    return vault.dataExportPermission ?? false;
  }

  async checkExecutionAutonomy(agentId: string): Promise<string> {
    const vault = await storage.getPrivacyVaultByAgent(agentId);
    return vault?.executionAutonomy ?? "manual";
  }

  filterOutput(content: string, vault: AgentPrivacyVault, requesterId: string): { filtered: string; blocked: boolean; blockedPatterns: string[] } {
    if (requesterId === vault.ownerId) {
      return { filtered: content, blocked: false, blockedPatterns: [] };
    }

    const mode = vault.privacyMode as PrivacyMode;
    if (mode === "ultra_private" || mode === "personal") {
      return { filtered: "[REDACTED - Private content]", blocked: true, blockedPatterns: ["full_content"] };
    }

    const blockedPatterns: string[] = [];
    let filtered = content;

    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(filtered)) {
        blockedPatterns.push(pattern.source);
        filtered = filtered.replace(pattern, "[REDACTED]");
      }
    }

    return { filtered, blocked: blockedPatterns.length > 0, blockedPatterns };
  }

  async getAccessLogs(ownerId: string, limit = 100): Promise<PrivacyAccessLog[]> {
    return storage.getPrivacyAccessLogsByOwner(ownerId, limit);
  }

  async getVaultAccessLogs(vaultId: string, limit = 100): Promise<PrivacyAccessLog[]> {
    return storage.getPrivacyAccessLogs(vaultId, limit);
  }

  async getViolations(vaultId?: string, limit = 50) {
    return storage.getPrivacyViolations(vaultId, limit);
  }

  async getUnresolvedViolations() {
    return storage.getUnresolvedViolations();
  }

  async resolveViolation(id: string, actionTaken: string) {
    return storage.resolvePrivacyViolation(id, actionTaken);
  }

  async getDashboard(ownerId: string) {
    const vaults = await storage.getPrivacyVaultsByOwner(ownerId);
    const accessLogs = await storage.getPrivacyAccessLogsByOwner(ownerId, 20);

    const allViolations: any[] = [];
    for (const v of vaults) {
      const violations = await storage.getPrivacyViolations(v.id, 10);
      allViolations.push(...violations);
    }

    const stats = {
      totalVaults: vaults.length,
      activeVaults: vaults.filter(v => v.isActive).length,
      recentAccessCount: accessLogs.length,
      blockedAccessCount: accessLogs.filter(l => !l.granted).length,
      totalViolations: allViolations.length,
      unresolvedViolations: allViolations.filter(v => !v.resolved).length,
      privacyModeDistribution: {} as Record<string, number>,
    };

    for (const v of vaults) {
      stats.privacyModeDistribution[v.privacyMode] = (stats.privacyModeDistribution[v.privacyMode] || 0) + 1;
    }

    return {
      vaults: vaults.map(v => ({ ...v, vaultKey: undefined })),
      recentAccessLogs: accessLogs,
      recentViolations: allViolations.slice(0, 10),
      stats,
    };
  }

  async getFounderMonitoring() {
    const allViolations = await storage.getPrivacyViolations(undefined, 100);
    const unresolvedViolations = await storage.getUnresolvedViolations();
    const rules = await storage.getPrivacyGatewayRules();

    return {
      totalViolations: allViolations.length,
      unresolvedViolations,
      recentViolations: allViolations.slice(0, 20),
      activeRules: rules.length,
      rules,
      severityBreakdown: {
        critical: allViolations.filter(v => v.severity === "critical").length,
        high: allViolations.filter(v => v.severity === "high").length,
        medium: allViolations.filter(v => v.severity === "medium").length,
        low: allViolations.filter(v => v.severity === "low").length,
      },
    };
  }

  async addGatewayRule(data: { name: string; description?: string; ruleType: string; conditions: any; action?: string; priority?: number }) {
    return storage.createPrivacyGatewayRule({
      name: data.name,
      description: data.description || null,
      ruleType: data.ruleType,
      conditions: data.conditions,
      action: data.action || "block",
      priority: data.priority || 0,
      isActive: true,
    });
  }

  async updateGatewayRule(id: string, data: any) {
    return storage.updatePrivacyGatewayRule(id, data);
  }

  async deleteGatewayRule(id: string) {
    return storage.deletePrivacyGatewayRule(id);
  }

  private async logAccess(params: {
    vaultId: string;
    requesterId: string;
    requesterType: string;
    resourceType: string;
    action: string;
    granted: boolean;
    reason: string;
  }) {
    try {
      await storage.createPrivacyAccessLog({
        vaultId: params.vaultId,
        requesterId: params.requesterId,
        requesterType: params.requesterType,
        resourceType: params.resourceType,
        action: params.action,
        granted: params.granted,
        reason: params.reason,
        metadata: null,
      });
    } catch (err) {
      console.error("Failed to log privacy access:", err);
    }
  }

  private async recordViolation(vaultId: string, violatorId: string, type: string, severity: string, description: string) {
    try {
      await storage.createPrivacyViolation({
        vaultId,
        violatorId,
        violationType: type,
        severity,
        description,
        resolved: false,
      });
    } catch (err) {
      console.error("Failed to record privacy violation:", err);
    }
  }
}

export const privacyGatewayService = new PrivacyGatewayService();
