import { storage } from "../storage";
import crypto from "crypto";
import type {
  UserTrustVault,
  TrustPermissionToken,
  TrustAccessEvent,
  TrustHealthMetric,
} from "@shared/schema";

type PrivacyLevel = "strict" | "balanced" | "open";
type PermissionType = "read" | "write" | "read_write" | "export";
type AccessorType = "agent" | "user" | "system" | "third_party";

function generateEncryptionKeyHash(): string {
  const key = crypto.randomBytes(32);
  return crypto.createHash("sha256").update(key).digest("hex");
}

function computeTrustScore(metrics: {
  totalVaults: number;
  activeVaults: number;
  totalTokens: number;
  revokedTokens: number;
  totalEvents: number;
  deniedEvents: number;
  exportRequests: number;
}): number {
  const vaultAdoption = metrics.totalVaults > 0 ? Math.min(metrics.activeVaults / metrics.totalVaults, 1) : 0;
  const tokenHealth = metrics.totalTokens > 0 ? 1 - (metrics.revokedTokens / metrics.totalTokens) : 1;
  const accessSafety = metrics.totalEvents > 0 ? 1 - (metrics.deniedEvents / metrics.totalEvents) : 1;
  const transparency = Math.min(metrics.exportRequests / Math.max(metrics.totalVaults, 1), 1);

  return Math.round((vaultAdoption * 30 + tokenHealth * 25 + accessSafety * 30 + transparency * 15) * 10) / 10;
}

class TrustMoatService {
  async getOrCreateVault(userId: string): Promise<UserTrustVault> {
    const existing = await storage.getUserTrustVaultByUserId(userId);
    if (existing) return existing;

    return storage.createUserTrustVault({
      userId,
      encryptionKeyHash: generateEncryptionKeyHash(),
      privacyLevel: "strict",
    });
  }

  async getUserVault(userId: string): Promise<UserTrustVault | undefined> {
    return storage.getUserTrustVaultByUserId(userId);
  }

  async updateVaultSettings(userId: string, settings: {
    privacyLevel?: PrivacyLevel;
    autoDeleteDays?: number | null;
    dataCategories?: string[];
    isLocked?: boolean;
  }): Promise<UserTrustVault> {
    const vault = await this.getOrCreateVault(userId);
    return storage.updateUserTrustVault(vault.id, settings);
  }

  async lockVault(userId: string): Promise<UserTrustVault> {
    const vault = await this.getOrCreateVault(userId);
    return storage.updateUserTrustVault(vault.id, { isLocked: true });
  }

  async unlockVault(userId: string): Promise<UserTrustVault> {
    const vault = await this.getOrCreateVault(userId);
    return storage.updateUserTrustVault(vault.id, { isLocked: false });
  }

  async grantPermission(userId: string, params: {
    grantedTo: string;
    permissionType: PermissionType;
    resourceScope: string;
    expiresAt?: Date;
    maxAccessCount?: number;
  }): Promise<TrustPermissionToken> {
    const vault = await this.getOrCreateVault(userId);

    if (vault.isLocked) {
      throw new Error("Vault is locked. Unlock it before granting permissions.");
    }

    return storage.createTrustPermissionToken({
      vaultId: vault.id,
      grantedTo: params.grantedTo,
      grantedBy: userId,
      permissionType: params.permissionType,
      resourceScope: params.resourceScope,
      expiresAt: params.expiresAt || null,
      maxAccessCount: params.maxAccessCount || null,
    });
  }

  async revokePermission(userId: string, tokenId: string): Promise<TrustPermissionToken> {
    const token = await storage.getTrustPermissionToken(tokenId);
    if (!token) throw new Error("Permission token not found");

    const vault = await storage.getUserTrustVault(token.vaultId);
    if (!vault || vault.userId !== userId) {
      throw new Error("Unauthorized: you don't own this vault");
    }

    return storage.revokeTrustPermissionToken(tokenId);
  }

  async getPermissions(userId: string): Promise<TrustPermissionToken[]> {
    const vault = await storage.getUserTrustVaultByUserId(userId);
    if (!vault) return [];
    return storage.getTrustPermissionTokensByVault(vault.id);
  }

  async validateAndLogAccess(userId: string, accessorId: string, accessorType: AccessorType, params: {
    resourceAccessed: string;
    purpose: string;
    ipHash?: string;
  }): Promise<{ granted: boolean; reason: string; event: TrustAccessEvent }> {
    const vault = await storage.getUserTrustVaultByUserId(userId);
    if (!vault) {
      const event = await storage.createTrustAccessEvent({
        vaultId: "none",
        userId,
        accessorId,
        accessorType,
        resourceAccessed: params.resourceAccessed,
        purpose: params.purpose,
        granted: false,
        ipHash: params.ipHash || null,
        permissionTokenId: null,
      });
      return { granted: false, reason: "No trust vault exists for this user", event };
    }

    if (vault.isLocked && accessorId !== userId) {
      const event = await storage.createTrustAccessEvent({
        vaultId: vault.id,
        userId,
        accessorId,
        accessorType,
        resourceAccessed: params.resourceAccessed,
        purpose: params.purpose,
        granted: false,
        ipHash: params.ipHash || null,
        permissionTokenId: null,
      });
      return { granted: false, reason: "Vault is locked - all external access denied", event };
    }

    if (accessorId === userId) {
      const event = await storage.createTrustAccessEvent({
        vaultId: vault.id,
        userId,
        accessorId,
        accessorType: "user",
        resourceAccessed: params.resourceAccessed,
        purpose: params.purpose,
        granted: true,
        ipHash: params.ipHash || null,
        permissionTokenId: null,
      });
      await storage.updateUserTrustVault(vault.id, { lastAccessedAt: new Date() });
      return { granted: true, reason: "Owner access", event };
    }

    const tokens = await storage.getTrustPermissionTokensByVault(vault.id);
    const validToken = tokens.find(t => {
      if (t.isRevoked) return false;
      if (t.grantedTo !== accessorId) return false;
      if (t.expiresAt && new Date(t.expiresAt) < new Date()) return false;
      if (t.maxAccessCount && t.accessCount >= t.maxAccessCount) return false;
      const requiredPerm = params.resourceAccessed.includes("export") ? "export" :
        params.resourceAccessed.includes("write") ? "write" : "read";
      if (requiredPerm === "write" && !["write", "read_write"].includes(t.permissionType)) return false;
      if (requiredPerm === "export" && t.permissionType !== "export") return false;
      return true;
    });

    if (validToken) {
      await storage.incrementTokenAccessCount(validToken.id);
      const event = await storage.createTrustAccessEvent({
        vaultId: vault.id,
        userId,
        accessorId,
        accessorType,
        resourceAccessed: params.resourceAccessed,
        purpose: params.purpose,
        granted: true,
        permissionTokenId: validToken.id,
        ipHash: params.ipHash || null,
      });
      await storage.updateUserTrustVault(vault.id, { lastAccessedAt: new Date() });
      return { granted: true, reason: `Access granted via permission token (${validToken.permissionType})`, event };
    }

    if (vault.privacyLevel === "open" && accessorType === "system") {
      const event = await storage.createTrustAccessEvent({
        vaultId: vault.id,
        userId,
        accessorId,
        accessorType,
        resourceAccessed: params.resourceAccessed,
        purpose: params.purpose,
        granted: true,
        ipHash: params.ipHash || null,
        permissionTokenId: null,
      });
      return { granted: true, reason: "Open privacy level allows system access", event };
    }

    const event = await storage.createTrustAccessEvent({
      vaultId: vault.id,
      userId,
      accessorId,
      accessorType,
      resourceAccessed: params.resourceAccessed,
      purpose: params.purpose,
      granted: false,
      ipHash: params.ipHash || null,
      permissionTokenId: null,
    });
    return { granted: false, reason: "No valid permission token found", event };
  }

  async getAccessLog(userId: string, limit = 50): Promise<TrustAccessEvent[]> {
    return storage.getTrustAccessEventsByUser(userId, limit);
  }

  async exportUserData(userId: string): Promise<{
    vault: UserTrustVault | undefined;
    permissions: TrustPermissionToken[];
    accessLog: TrustAccessEvent[];
    exportedAt: string;
  }> {
    const vault = await storage.getUserTrustVaultByUserId(userId);
    const permissions = vault ? await storage.getTrustPermissionTokensByVault(vault.id) : [];
    const accessLog = await storage.getTrustAccessEventsByUser(userId, 500);

    return {
      vault: vault ? { ...vault, encryptionKeyHash: "[REDACTED]" } : undefined,
      permissions,
      accessLog,
      exportedAt: new Date().toISOString(),
    };
  }

  async deleteUserData(userId: string): Promise<{ deleted: boolean; message: string }> {
    const vault = await storage.getUserTrustVaultByUserId(userId);
    if (!vault) {
      return { deleted: false, message: "No trust vault found" };
    }

    await storage.deleteUserTrustVault(vault.id);
    return { deleted: true, message: "All trust moat data deleted successfully" };
  }

  async getUserDashboard(userId: string): Promise<{
    vault: Omit<UserTrustVault, "encryptionKeyHash"> | null;
    activePermissions: number;
    totalPermissions: number;
    recentAccess: TrustAccessEvent[];
    accessStats: { total: number; denied: number };
    trustIndicators: {
      dataOwnership: boolean;
      encryptionActive: boolean;
      permissionControl: boolean;
      accessTransparency: boolean;
      exportAvailable: boolean;
    };
  }> {
    const vault = await this.getOrCreateVault(userId);
    const permissions = await storage.getTrustPermissionTokensByVault(vault.id);
    const recentAccess = await storage.getTrustAccessEventsByUser(userId, 10);
    const accessStats = await storage.getTrustAccessEventsCount(vault.id);

    const { encryptionKeyHash, ...safeVault } = vault;

    return {
      vault: safeVault,
      activePermissions: permissions.filter(p => !p.isRevoked).length,
      totalPermissions: permissions.length,
      recentAccess,
      accessStats,
      trustIndicators: {
        dataOwnership: true,
        encryptionActive: !!vault.encryptionKeyHash,
        permissionControl: permissions.length > 0 || vault.privacyLevel === "strict",
        accessTransparency: true,
        exportAvailable: true,
      },
    };
  }

  async computeFounderTrustHealth(): Promise<{
    metrics: TrustHealthMetric | null;
    currentStats: {
      totalVaults: number;
      activeVaults: number;
      totalPermissionTokens: number;
      revokedTokens: number;
      totalAccessEvents: number;
      deniedAccessEvents: number;
      trustScore: number;
      privacyDistribution: Record<string, number>;
    };
    recentMetrics: TrustHealthMetric[];
  }> {
    const allVaults = await storage.getAllUserTrustVaults();
    const activeVaults = allVaults.filter(v => !v.isLocked);

    let totalTokens = 0;
    let revokedTokens = 0;
    let totalEvents = 0;
    let deniedEvents = 0;
    const privacyDist: Record<string, number> = { strict: 0, balanced: 0, open: 0 };

    for (const vault of allVaults) {
      const tokens = await storage.getTrustPermissionTokensByVault(vault.id);
      totalTokens += tokens.length;
      revokedTokens += tokens.filter(t => t.isRevoked).length;

      const stats = await storage.getTrustAccessEventsCount(vault.id);
      totalEvents += stats.total;
      deniedEvents += stats.denied;

      const level = (vault.privacyLevel || "strict") as string;
      privacyDist[level] = (privacyDist[level] || 0) + 1;
    }

    const trustScore = computeTrustScore({
      totalVaults: allVaults.length,
      activeVaults: activeVaults.length,
      totalTokens,
      revokedTokens,
      totalEvents,
      deniedEvents,
      exportRequests: 0,
    });

    const metric = await storage.createTrustHealthMetric({
      metricDate: new Date(),
      totalVaults: allVaults.length,
      activeVaults: activeVaults.length,
      totalPermissionTokens: totalTokens,
      revokedTokens,
      totalAccessEvents: totalEvents,
      deniedAccessEvents: deniedEvents,
      dataExportRequests: 0,
      averagePrivacyLevel: allVaults.length > 0 ? privacyDist["strict"] / allVaults.length : 0,
      trustScore,
      userRetentionRate: allVaults.length > 0 ? (activeVaults.length / allVaults.length) * 100 : 0,
    });

    const recentMetrics = await storage.getLatestTrustHealthMetrics(30);

    return {
      metrics: metric,
      currentStats: {
        totalVaults: allVaults.length,
        activeVaults: activeVaults.length,
        totalPermissionTokens: totalTokens,
        revokedTokens,
        totalAccessEvents: totalEvents,
        deniedAccessEvents: deniedEvents,
        trustScore,
        privacyDistribution: privacyDist,
      },
      recentMetrics,
    };
  }
}

export const trustMoatService = new TrustMoatService();
