import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { founderControlService } from "./founder-control-service";
import { escalationService } from "./escalation-service";
import { riskManagementService } from "./risk-management-service";
import {
  podcastAudioJobs,
  podcastScriptPackages,
  socialDistributionAutomationSettings,
  socialDistributionPackages,
  socialPosts,
  youtubePublishingPackages,
  type PodcastAudioJob,
  type PodcastScriptPackage,
  type SocialDistributionAutomationSettings,
  type SocialDistributionCopyItem,
  type SocialDistributionCopyPackage,
  type SocialDistributionPackage,
  type SocialDistributionPlatformResult,
  type SocialDistributionSafetyGateResult,
  type YouTubePublishingPackage,
} from "@shared/schema";

type DistributionMode = "manual" | "safe_automation";
type PlatformProvider = "export_only" | "platform_api";

type PlatformStatus = {
  platform: string;
  configured: boolean;
  provider: PlatformProvider;
  enabledForAutomation: boolean;
  message: string;
};

type EligiblePackage = {
  youtubePackage: YouTubePublishingPackage;
  scriptPackage: PodcastScriptPackage;
  latestAudioJob: PodcastAudioJob | null;
  existingDistributionPackage: SocialDistributionPackage | null;
};

type GeneratePackageInput = {
  youtubePackageId: number;
  targetPlatforms?: string[];
  mode?: DistributionMode;
  createdBy: string;
};

type AutomationEvaluationResult = {
  status: "blocked" | "prepared" | "exported";
  message: string;
  settings: SocialDistributionAutomationSettings;
  package: SocialDistributionPackage | null;
  gates: SocialDistributionSafetyGateResult[];
};

class SocialDistributionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_PLATFORMS = ["twitter", "linkedin"];

const PLATFORM_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  facebook: 2000,
  bluesky: 300,
};

const DEFAULT_PLATFORM_SETTINGS = {
  twitter: { enabled: false, dailyLimit: 1 },
  linkedin: { enabled: false, dailyLimit: 1 },
  facebook: { enabled: false, dailyLimit: 1 },
  bluesky: { enabled: false, dailyLimit: 1 },
};

function normalizePlatform(platform: string) {
  const normalized = platform.trim().toLowerCase();
  if (normalized === "x") return "twitter";
  return normalized;
}

function uniquePlatforms(platforms?: string[]) {
  const values = (platforms?.length ? platforms : DEFAULT_PLATFORMS)
    .map(normalizePlatform)
    .filter((platform) => !!PLATFORM_LIMITS[platform]);
  return Array.from(new Set(values)).slice(0, 6);
}

function configuredFor(platform: string) {
  if (platform === "twitter") {
    return !!(
      process.env.X_API_KEY?.trim() ||
      process.env.X_ACCESS_TOKEN?.trim() ||
      process.env.TWITTER_BEARER_TOKEN?.trim()
    );
  }
  if (platform === "linkedin") return !!process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  if (platform === "facebook") return !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (platform === "bluesky") {
    return !!(process.env.BLUESKY_IDENTIFIER?.trim() && process.env.BLUESKY_APP_PASSWORD?.trim());
  }
  return false;
}

function getBaseUrl() {
  return process.env.APP_BASE_URL?.trim() ||
    (process.env.REPLIT_DOMAINS?.split(",")[0] ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "https://www.mougle.com");
}

function truncateForPlatform(text: string, platform: string) {
  const max = PLATFORM_LIMITS[platform] || 280;
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function makeExportUrl(platform: string, text: string, linkUrl: string | null) {
  const url = linkUrl || getBaseUrl();
  if (platform === "twitter") {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  }
  if (platform === "linkedin") {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  }
  if (platform === "facebook") {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  }
  return null;
}

function hasBlockingFailure(items: Array<{ severity: string; passed: boolean }>) {
  return items.some((item) => item.severity === "blocking" && !item.passed);
}

function checkItem(
  key: string,
  label: string,
  passed: boolean,
  severity: SocialDistributionSafetyGateResult["severity"],
  message: string,
): SocialDistributionSafetyGateResult {
  return { key, label, passed, severity, message };
}

function sensitiveMarkerFound(text: string) {
  return /(\[redacted\]|\[private\]|<private>|password\s*:|api[_\s-]?key|secret\s*:|token\s*:|ssn|card\s*number)/i.test(text);
}

function highRiskClaims(scriptPackage: PodcastScriptPackage) {
  return (scriptPackage.safetyNotes.weakOrDisputedClaims || []).filter((claim) => {
    const text = `${claim.status} ${claim.reason} ${claim.statement}`.toLowerCase();
    return claim.confidenceScore < 0.35 || /high.?risk|unsafe|unresolved|unverified|rejected|disputed/.test(text);
  });
}

function packageLink(youtubePackage: YouTubePublishingPackage, scriptPackage: PodcastScriptPackage) {
  if (youtubePackage.youtubeUrl) return youtubePackage.youtubeUrl;
  if (scriptPackage.sourceArticleId) return `${getBaseUrl()}/ai-news-updates/${scriptPackage.sourceArticleId}`;
  return `${getBaseUrl()}/debate/${scriptPackage.debateId}`;
}

function buildPostText(platform: string, youtubePackage: YouTubePublishingPackage, scriptPackage: PodcastScriptPackage) {
  const script = scriptPackage.scriptPackage;
  const hook = script.shortsHooks?.[0] || script.thumbnailText || script.youtubeTitle;
  const sourceLine = script.sourceEvidenceReferences.length > 0
    ? `${script.sourceEvidenceReferences.length} source/evidence reference${script.sourceEvidenceReferences.length === 1 ? "" : "s"} checked.`
    : "Source review pending.";
  const hashtags = (script.youtubeTitle.split(/\s+/)
    .concat(scriptPackage.safetyNotes.sourceReliability !== null ? ["TruthChecked"] : ["Mougle"])
    .map((word) => word.replace(/[^a-z0-9]/gi, ""))
    .filter((word) => word.length >= 4)
    .slice(0, 4));

  const body = [
    hook,
    "",
    `Mougle synthesis: ${script.youtubeTitle}`,
    sourceLine,
    "",
    hashtags.map((tag) => `#${tag}`).join(" "),
  ].filter(Boolean).join("\n");

  return truncateForPlatform(body, platform);
}

function buildCopyPackage(
  youtubePackage: YouTubePublishingPackage,
  scriptPackage: PodcastScriptPackage,
  targetPlatforms: string[],
  mode: DistributionMode,
): SocialDistributionCopyPackage {
  const linkUrl = packageLink(youtubePackage, scriptPackage);
  const posts: SocialDistributionCopyItem[] = targetPlatforms.map((platform) => {
    const text = buildPostText(platform, youtubePackage, scriptPackage);
    const hashtags = Array.from(new Set((text.match(/#[a-z0-9_]+/gi) || []).map((tag) => tag.replace(/^#/, ""))));
    return {
      platform,
      text,
      hashtags,
      linkUrl,
      exportUrl: makeExportUrl(platform, text, linkUrl),
      characterCount: text.length,
      dryRunOnly: !configuredFor(platform),
    };
  });

  return {
    sourceTitle: scriptPackage.scriptPackage.youtubeTitle,
    sourceSummary: scriptPackage.scriptPackage.youtubeDescription,
    sourceUrl: linkUrl,
    sourceType: "youtube_publishing_package",
    mode,
    posts,
    evidenceReferences: scriptPackage.scriptPackage.sourceEvidenceReferences || [],
    complianceNotes: [
      ...(scriptPackage.scriptPackage.complianceSafetyNotes || []),
      ...(scriptPackage.safetyNotes.notes || []),
    ],
    safetyLabels: [
      "Manual/root-admin controlled",
      "No private memory",
      "No autonomous 24/7 publishing",
      "Dry-run/export first",
    ],
    generatedAt: new Date().toISOString(),
  };
}

async function audit(action: string, actorId: string, outcome: "success" | "denied" | "error", details: Record<string, any>, resourceId?: string | number) {
  await riskManagementService.logAudit({
    actorId,
    actorType: "admin",
    action,
    resourceType: "social_distribution",
    resourceId: resourceId ? String(resourceId) : undefined,
    outcome,
    riskLevel: outcome === "denied" ? "medium" : "low",
    details,
  });
}

async function latestAudioJobFor(scriptPackageId: number) {
  const [job] = await db.select().from(podcastAudioJobs)
    .where(eq(podcastAudioJobs.scriptPackageId, scriptPackageId))
    .orderBy(desc(podcastAudioJobs.createdAt))
    .limit(1);
  return job || null;
}

async function loadYouTubePackage(id: number) {
  const [record] = await db.select().from(youtubePublishingPackages)
    .where(eq(youtubePublishingPackages.id, id))
    .limit(1);
  if (!record) throw new SocialDistributionError(404, "YouTube publishing package not found.");
  return record;
}

async function loadScriptPackage(id: number) {
  const [record] = await db.select().from(podcastScriptPackages)
    .where(eq(podcastScriptPackages.id, id))
    .limit(1);
  if (!record) throw new SocialDistributionError(404, "Podcast script package not found.");
  return record;
}

async function loadDistributionPackage(id: number) {
  const [record] = await db.select().from(socialDistributionPackages)
    .where(eq(socialDistributionPackages.id, id))
    .limit(1);
  if (!record) throw new SocialDistributionError(404, "Social distribution package not found.");
  return record;
}

export const socialDistributionApprovalService = {
  async getSettings(): Promise<SocialDistributionAutomationSettings> {
    const [existing] = await db.select().from(socialDistributionAutomationSettings).limit(1);
    if (existing) return existing;
    const [created] = await db.insert(socialDistributionAutomationSettings).values({
      safeAutomationEnabled: false,
      paused: true,
      killSwitch: false,
      perPlatformEnabled: DEFAULT_PLATFORM_SETTINGS,
      dailyPostLimit: 3,
      duplicateWindowHours: 72,
      trustThreshold: 0.65,
      uesThreshold: 0.55,
    }).returning();
    return created;
  },

  async updateSettings(updates: Partial<SocialDistributionAutomationSettings>, actorId: string) {
    const settings = await this.getSettings();
    const mergedPlatformSettings = updates.perPlatformEnabled
      ? { ...(settings.perPlatformEnabled || {}), ...(updates.perPlatformEnabled as Record<string, any>) }
      : settings.perPlatformEnabled;
    const [updated] = await db.update(socialDistributionAutomationSettings)
      .set({
        safeAutomationEnabled: updates.safeAutomationEnabled ?? settings.safeAutomationEnabled,
        paused: updates.paused ?? settings.paused,
        killSwitch: updates.killSwitch ?? settings.killSwitch,
        perPlatformEnabled: mergedPlatformSettings,
        dailyPostLimit: updates.dailyPostLimit ?? settings.dailyPostLimit,
        duplicateWindowHours: updates.duplicateWindowHours ?? settings.duplicateWindowHours,
        trustThreshold: updates.trustThreshold ?? settings.trustThreshold,
        uesThreshold: updates.uesThreshold ?? settings.uesThreshold,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(socialDistributionAutomationSettings.id, settings.id))
      .returning();
    await audit("social_distribution_settings_update", actorId, "success", {
      safeAutomationEnabled: updated.safeAutomationEnabled,
      paused: updated.paused,
      killSwitch: updated.killSwitch,
      perPlatformEnabled: updated.perPlatformEnabled,
      dailyPostLimit: updated.dailyPostLimit,
      duplicateWindowHours: updated.duplicateWindowHours,
    }, updated.id);
    return updated;
  },

  async platformStatuses(settings?: SocialDistributionAutomationSettings): Promise<PlatformStatus[]> {
    const activeSettings = settings || await this.getSettings();
    return Object.keys(PLATFORM_LIMITS).map((platform) => {
      const configured = configuredFor(platform);
      const enabledForAutomation = !!activeSettings.perPlatformEnabled?.[platform]?.enabled;
      return {
        platform,
        configured,
        provider: configured ? "platform_api" : "export_only",
        enabledForAutomation,
        message: configured
          ? `${platform} credentials are configured server-side. Posting remains gated by root-admin settings and safety checks.`
          : `${platform} credentials are missing. Packages will stay in dry-run/export mode.`,
      };
    });
  },

  async listEligiblePackages(limit = 50): Promise<{ providerStatus: PlatformStatus[]; items: EligiblePackage[] }> {
    const settings = await this.getSettings();
    const youtubePackages = await db.select().from(youtubePublishingPackages)
      .orderBy(desc(youtubePublishingPackages.createdAt))
      .limit(limit);

    const items: EligiblePackage[] = [];
    for (const youtubePackage of youtubePackages) {
      try {
        const scriptPackage = await loadScriptPackage(youtubePackage.scriptPackageId);
        const latestAudioJob = youtubePackage.audioJobId
          ? (await db.select().from(podcastAudioJobs).where(eq(podcastAudioJobs.id, youtubePackage.audioJobId)).limit(1))[0] || null
          : await latestAudioJobFor(scriptPackage.id);
        const [existingDistributionPackage] = await db.select().from(socialDistributionPackages)
          .where(eq(socialDistributionPackages.youtubePackageId, youtubePackage.id))
          .orderBy(desc(socialDistributionPackages.createdAt))
          .limit(1);
        items.push({ youtubePackage, scriptPackage, latestAudioJob, existingDistributionPackage: existingDistributionPackage || null });
      } catch {}
    }

    return { providerStatus: await this.platformStatuses(settings), items };
  },

  async listPackages(limit = 50) {
    return db.select().from(socialDistributionPackages)
      .orderBy(desc(socialDistributionPackages.createdAt))
      .limit(limit);
  },

  async getPackage(id: number) {
    return loadDistributionPackage(id);
  },

  async evaluatePackage(
    record: SocialDistributionPackage,
    options: { automation: boolean; actorId?: string },
  ): Promise<SocialDistributionSafetyGateResult[]> {
    const settings = await this.getSettings();
    const youtubePackage = record.youtubePackageId ? await loadYouTubePackage(record.youtubePackageId) : null;
    const scriptPackage = record.scriptPackageId ? await loadScriptPackage(record.scriptPackageId) : null;
    if (!youtubePackage || !scriptPackage) {
      return [checkItem("source_package", "Source package", false, "blocking", "Missing linked YouTube or podcast script package.")];
    }

    const gates: SocialDistributionSafetyGateResult[] = [];
    const targetPlatforms = uniquePlatforms(record.targetPlatforms || []);
    const automationSeverity: SocialDistributionSafetyGateResult["severity"] = options.automation ? "blocking" : "warning";
    const sourceReferences = scriptPackage.scriptPackage.sourceEvidenceReferences || [];
    const sourceReliability = scriptPackage.safetyNotes.sourceReliability;
    const gateText = record.generatedCopy.posts.map((post) => post.text).join("\n");
    const highRisk = highRiskClaims(scriptPackage);
    const youtubeBlocking = hasBlockingFailure([
      ...youtubePackage.readinessChecklist,
      ...youtubePackage.complianceChecklist,
      ...youtubePackage.sourceChecklist,
    ]);

    const automationPolicy = await escalationService.getPolicy();
    const emergencyStopped = await founderControlService.isEmergencyStopped();
    const socialKillActive = settings.killSwitch || settings.paused || !settings.safeAutomationEnabled || automationPolicy.killSwitch || emergencyStopped;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [postedToday] = await db.select({ count: sql<number>`count(*)` }).from(socialDistributionPackages)
      .where(and(eq(socialDistributionPackages.postingStatus, "posted"), gte(socialDistributionPackages.postedAt, todayStart)));

    const duplicateSince = new Date(Date.now() - (settings.duplicateWindowHours || 72) * 60 * 60 * 1000);
    const [recentDuplicate] = await db.select({ count: sql<number>`count(*)` }).from(socialDistributionPackages)
      .where(and(
        eq(socialDistributionPackages.youtubePackageId, youtubePackage.id),
        eq(socialDistributionPackages.postingStatus, "posted"),
        gte(socialDistributionPackages.postedAt, duplicateSince),
      ));

    const platformSettings = settings.perPlatformEnabled || {};
    const platformsEnabled = targetPlatforms.every((platform) => !!platformSettings[platform]?.enabled);
    const platformsConfigured = targetPlatforms.every(configuredFor);
    const dailyLimit = Math.max(0, settings.dailyPostLimit || 0);
    const trustPasses = sourceReliability === null || sourceReliability === undefined || sourceReliability >= (settings.trustThreshold || 0.65);

    gates.push(checkItem(
      "source_approved",
      "Source package approved",
      youtubePackage.approvalStatus === "approved",
      "blocking",
      youtubePackage.approvalStatus === "approved"
        ? "The linked YouTube publishing package has root-admin approval."
        : "The linked YouTube publishing package is not root-admin approved.",
    ));
    gates.push(checkItem(
      "source_evidence",
      "Source/evidence references",
      sourceReferences.length > 0,
      "blocking",
      sourceReferences.length > 0
        ? `${sourceReferences.length} source/evidence reference${sourceReferences.length === 1 ? "" : "s"} included.`
        : "No source/evidence references are included.",
    ));
    gates.push(checkItem(
      "compliance_source_checks",
      "Compliance and source checks",
      !youtubeBlocking,
      "blocking",
      youtubeBlocking ? "The source package still has blocking readiness/compliance/source issues." : "No blocking source package checks remain.",
    ));
    gates.push(checkItem(
      "high_risk_claims",
      "High-risk claim blockers",
      highRisk.length === 0,
      "blocking",
      highRisk.length === 0 ? "No unresolved high-risk claim blockers were found." : `${highRisk.length} unresolved high-risk claim blocker${highRisk.length === 1 ? "" : "s"} found.`,
    ));
    gates.push(checkItem(
      "private_memory",
      "Private memory exclusion",
      !scriptPackage.safetyNotes.privateMemoryUsed,
      "blocking",
      scriptPackage.safetyNotes.privateMemoryUsed ? "The source package indicates private memory was used." : "The source package indicates no private memory was used.",
    ));
    gates.push(checkItem(
      "trust_threshold",
      "UES/TCS/trust threshold",
      trustPasses,
      sourceReliability === null || sourceReliability === undefined ? "warning" : "blocking",
      sourceReliability === null || sourceReliability === undefined
        ? "No source reliability/UES/TCS signal is available, so this gate is informational only."
        : `Source reliability ${sourceReliability.toFixed(2)} ${trustPasses ? "meets" : "is below"} threshold ${(settings.trustThreshold || 0.65).toFixed(2)}.`,
    ));
    gates.push(checkItem(
      "platform_enabled",
      "Target platform automation enabled",
      platformsEnabled,
      automationSeverity,
      platformsEnabled
        ? "All target platforms are enabled for safe automation."
        : "One or more target platforms are not enabled for safe automation.",
    ));
    gates.push(checkItem(
      "platform_credentials",
      "Platform credentials configured",
      platformsConfigured,
      automationSeverity,
      platformsConfigured
        ? "All target platforms have server-side credentials configured."
        : "One or more target platforms are missing server-side credentials; export/dry-run mode is available.",
    ));
    gates.push(checkItem(
      "daily_limit",
      "Daily post limit",
      Number(postedToday?.count || 0) < dailyLimit,
      automationSeverity,
      `${Number(postedToday?.count || 0)} posted today; daily limit is ${dailyLimit}.`,
    ));
    gates.push(checkItem(
      "duplicate_window",
      "Duplicate/recent post window",
      Number(recentDuplicate?.count || 0) === 0,
      "blocking",
      Number(recentDuplicate?.count || 0) === 0
        ? "No recent posted distribution package for this source was found."
        : "This source was posted recently and is blocked as a duplicate.",
    ));
    gates.push(checkItem(
      "automation_kill_switch",
      "Automation kill/pause state",
      options.automation ? !socialKillActive : true,
      options.automation ? "blocking" : "info",
      options.automation
        ? (socialKillActive ? "Safe automation is disabled, paused, killed, or blocked by founder controls." : "Safe automation is enabled and not paused.")
        : "Manual mode does not require the automation switch to be enabled.",
    ));
    gates.push(checkItem(
      "sensitive_markers",
      "Sensitive/redacted marker scan",
      !sensitiveMarkerFound(gateText),
      "blocking",
      sensitiveMarkerFound(gateText)
        ? "Final post text contains redacted/private/secret-looking markers."
        : "Final post text does not contain redacted/private/secret-looking markers.",
    ));
    gates.push(checkItem(
      "not_already_posted",
      "Package not already posted",
      record.postingStatus !== "posted",
      "blocking",
      record.postingStatus === "posted" ? "This package is already marked as posted." : "This package has not been posted.",
    ));

    if (options.actorId) {
      await audit("social_distribution_safety_evaluate", options.actorId, hasBlockingFailure(gates) ? "denied" : "success", {
        automation: options.automation,
        gateCount: gates.length,
        blocked: gates.filter((gate) => gate.severity === "blocking" && !gate.passed).map((gate) => gate.key),
      }, record.id);
    }

    return gates;
  },

  async generatePackage(input: GeneratePackageInput) {
    const youtubePackage = await loadYouTubePackage(input.youtubePackageId);
    const scriptPackage = await loadScriptPackage(youtubePackage.scriptPackageId);
    const targetPlatforms = uniquePlatforms(input.targetPlatforms);
    if (targetPlatforms.length === 0) throw new SocialDistributionError(400, "At least one supported platform is required.");
    const mode = input.mode || "manual";
    const copyPackage = buildCopyPackage(youtubePackage, scriptPackage, targetPlatforms, mode);

    const [created] = await db.insert(socialDistributionPackages).values({
      youtubePackageId: youtubePackage.id,
      scriptPackageId: scriptPackage.id,
      audioJobId: youtubePackage.audioJobId || null,
      sourceArticleId: scriptPackage.sourceArticleId || null,
      sourceType: "youtube_publishing_package",
      targetPlatforms,
      mode,
      generatedCopy: copyPackage,
      createdBy: input.createdBy,
    }).returning();

    const gates = await this.evaluatePackage(created, { automation: mode === "safe_automation", actorId: input.createdBy });
    const blocked = hasBlockingFailure(gates);
    const [updated] = await db.update(socialDistributionPackages)
      .set({
        safetyGateResults: gates,
        status: blocked ? "blocked_by_safety_gate" : "ready_for_review",
        errorMessage: blocked ? "Blocked by one or more safety gates." : null,
        updatedAt: new Date(),
      })
      .where(eq(socialDistributionPackages.id, created.id))
      .returning();

    await audit("social_distribution_package_generate", input.createdBy, blocked ? "denied" : "success", {
      mode,
      targetPlatforms,
      youtubePackageId: youtubePackage.id,
      blockingGates: gates.filter((gate) => gate.severity === "blocking" && !gate.passed).map((gate) => gate.key),
    }, updated.id);

    return updated;
  },

  async approvePackage(id: number, actorId: string) {
    const record = await loadDistributionPackage(id);
    const gates = await this.evaluatePackage(record, { automation: false, actorId });
    if (hasBlockingFailure(gates)) {
      const [blocked] = await db.update(socialDistributionPackages)
        .set({ safetyGateResults: gates, status: "blocked_by_safety_gate", errorMessage: "Approval blocked by safety gates.", updatedAt: new Date() })
        .where(eq(socialDistributionPackages.id, id))
        .returning();
      await audit("social_distribution_package_approve", actorId, "denied", { blockingGates: gates.filter((gate) => gate.severity === "blocking" && !gate.passed).map((gate) => gate.key) }, id);
      return blocked;
    }

    const [updated] = await db.update(socialDistributionPackages)
      .set({
        safetyGateResults: gates,
        status: "ready_for_manual_distribution",
        approvalStatus: "approved",
        approvedBy: actorId,
        approvedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(socialDistributionPackages.id, id))
      .returning();
    await audit("social_distribution_package_approve", actorId, "success", { mode: updated.mode }, id);
    return updated;
  },

  async exportPackage(id: number, actorId: string) {
    const record = await loadDistributionPackage(id);
    if (record.approvalStatus !== "approved") {
      throw new SocialDistributionError(400, "Approve the social distribution package before export.");
    }
    const results: SocialDistributionPlatformResult[] = record.generatedCopy.posts.map((post) => ({
      platform: post.platform,
      provider: "export_only",
      status: "export_ready",
      dryRun: true,
      postUrl: post.exportUrl,
      message: "Copy/export package prepared for manual use. No platform API call was made.",
      postedAt: null,
    }));

    const [updated] = await db.update(socialDistributionPackages)
      .set({
        platformResults: results,
        exportStatus: "exported",
        status: "export_ready",
        exportedBy: actorId,
        exportedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(socialDistributionPackages.id, id))
      .returning();
    await audit("social_distribution_package_export", actorId, "success", { platforms: record.targetPlatforms }, id);
    return updated;
  },

  async postPackage(id: number, actorId: string) {
    const record = await loadDistributionPackage(id);
    if (record.approvalStatus !== "approved") {
      throw new SocialDistributionError(400, "Approve the social distribution package before posting.");
    }
    const gates = await this.evaluatePackage(record, { automation: false, actorId });
    if (hasBlockingFailure(gates)) {
      const [blocked] = await db.update(socialDistributionPackages)
        .set({ safetyGateResults: gates, status: "blocked_by_safety_gate", errorMessage: "Posting blocked by safety gates.", updatedAt: new Date() })
        .where(eq(socialDistributionPackages.id, id))
        .returning();
      await audit("social_distribution_package_post", actorId, "denied", { blockingGates: gates.filter((gate) => gate.severity === "blocking" && !gate.passed).map((gate) => gate.key) }, id);
      return blocked;
    }

    const settings = await this.getSettings();
    const platformSettings = settings.perPlatformEnabled || {};
    const results: SocialDistributionPlatformResult[] = [];
    for (const post of record.generatedCopy.posts) {
      const platformEnabled = !!platformSettings[post.platform]?.enabled;
      const configured = configuredFor(post.platform);
      const canUsePlatformApi = platformEnabled && configured;
      if (canUsePlatformApi) {
        await db.insert(socialPosts).values({
          platform: post.platform,
          contentType: "social_distribution",
          contentId: String(record.id),
          caption: post.text,
          hashtags: post.hashtags,
          callToAction: "Review the full Mougle source package",
          status: "approved_export",
        });
      }
      results.push({
        platform: post.platform,
        provider: canUsePlatformApi ? "platform_api" : "export_only",
        status: "export_ready",
        dryRun: !canUsePlatformApi,
        postUrl: post.exportUrl,
        message: canUsePlatformApi
          ? "Server-side credentials and platform enablement are present. External API posting remains approval-gated and is stored as an approved export record in this MVP."
          : "No enabled platform API path was used. Copy/export package is ready for manual posting.",
        postedAt: null,
      });
    }

    const [updated] = await db.update(socialDistributionPackages)
      .set({
        safetyGateResults: gates,
        platformResults: results,
        exportStatus: "exported",
        postingStatus: "not_posted",
        status: "export_ready",
        exportedBy: actorId,
        exportedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(socialDistributionPackages.id, id))
      .returning();
    await audit("social_distribution_package_post", actorId, "success", {
      platforms: record.targetPlatforms,
      externalPosting: false,
      exportOnly: true,
    }, id);
    return updated;
  },

  async runSafeAutomationEvaluation(actorId: string): Promise<AutomationEvaluationResult> {
    const settings = await this.getSettings();
    const automationPolicy = await escalationService.getPolicy();
    const emergencyStopped = await founderControlService.isEmergencyStopped();

    if (!settings.safeAutomationEnabled || settings.paused || settings.killSwitch || automationPolicy.killSwitch || emergencyStopped) {
      await audit("social_distribution_safe_automation_evaluate", actorId, "denied", {
        safeAutomationEnabled: settings.safeAutomationEnabled,
        paused: settings.paused,
        socialKillSwitch: settings.killSwitch,
        globalKillSwitch: automationPolicy.killSwitch,
        emergencyStopped,
      });
      return { status: "blocked", message: "Safe automation is disabled, paused, killed, or blocked by founder controls.", settings, package: null, gates: [] };
    }

    let [candidate] = await db.select().from(socialDistributionPackages)
      .where(and(eq(socialDistributionPackages.mode, "safe_automation"), eq(socialDistributionPackages.approvalStatus, "pending")))
      .orderBy(desc(socialDistributionPackages.createdAt))
      .limit(1);

    if (!candidate) {
      const { items } = await this.listEligiblePackages(20);
      const source = items.find((item) =>
        item.youtubePackage.approvalStatus === "approved" &&
        item.youtubePackage.uploadStatus !== "uploaded" &&
        item.existingDistributionPackage?.postingStatus !== "posted"
      ) || items.find((item) => item.youtubePackage.approvalStatus === "approved");
      if (!source) {
        await audit("social_distribution_safe_automation_evaluate", actorId, "denied", { reason: "No approved source package found." });
        return { status: "blocked", message: "No approved source package is eligible for safe automation.", settings, package: null, gates: [] };
      }
      candidate = await this.generatePackage({
        youtubePackageId: source.youtubePackage.id,
        targetPlatforms: Object.entries(settings.perPlatformEnabled || {})
          .filter(([, value]) => value?.enabled)
          .map(([platform]) => platform),
        mode: "safe_automation",
        createdBy: actorId,
      });
    }

    const gates = await this.evaluatePackage(candidate, { automation: true, actorId });
    const blocked = hasBlockingFailure(gates);
    if (blocked) {
      const [updated] = await db.update(socialDistributionPackages)
        .set({ safetyGateResults: gates, status: "blocked_by_safety_gate", errorMessage: "Safe automation blocked by safety gates.", updatedAt: new Date() })
        .where(eq(socialDistributionPackages.id, candidate.id))
        .returning();
      await audit("social_distribution_safe_automation_block", actorId, "denied", {
        blockingGates: gates.filter((gate) => gate.severity === "blocking" && !gate.passed).map((gate) => gate.key),
      }, updated.id);
      return { status: "blocked", message: "Safe automation blocked by one or more safety gates.", settings, package: updated, gates };
    }

    const approved = await this.approvePackage(candidate.id, actorId);
    const exported = await this.exportPackage(approved.id, actorId);
    await audit("social_distribution_safe_automation_export", actorId, "success", {
      packageId: exported.id,
      platforms: exported.targetPlatforms,
      externalPosting: false,
    }, exported.id);
    return { status: "exported", message: "Safe automation prepared an approved export package. External posting was not run by this MVP.", settings, package: exported, gates };
  },

  async canLegacyAutoPublisherRun() {
    const settings = await this.getSettings();
    const automationPolicy = await escalationService.getPolicy();
    const emergencyStopped = await founderControlService.isEmergencyStopped();
    return settings.safeAutomationEnabled && !settings.paused && !settings.killSwitch && !automationPolicy.killSwitch && !emergencyStopped;
  },
};

export { SocialDistributionError };
