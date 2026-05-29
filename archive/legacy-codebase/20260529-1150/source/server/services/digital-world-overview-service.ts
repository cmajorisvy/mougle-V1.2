import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  agentMarketplaceClonePackages,
  claimEvidence,
  externalAgentApiKeys,
  liveDebates,
  knowledgePackets,
  podcastAudioJobs,
  podcastScriptPackages,
  realityClaims,
  safeModeControls,
  socialDistributionPackages,
  socialDistributionAutomationSettings,
  youtubePublishingPackages,
} from "@shared/schema";
import { civilizationHealthService } from "./civilization-health-service";
import { knowledgeGraphService } from "./knowledge-graph-service";
import { liveDebateStudioService } from "./live-debate-studio-service";
import { listSystemAgents } from "./system-agent-seed";

type ZoneStatus = "healthy" | "watch" | "paused" | "risk" | "unknown";
type ZoneTone = "success" | "info" | "warning" | "danger" | "muted";
type Distribution = Record<string, number>;

type CountMetric = {
  key: string;
  label: string;
  value: number | string;
  tone: ZoneTone;
};

type SafetyFlag = {
  key: string;
  label: string;
  active: boolean;
  severity: "info" | "warning" | "blocking";
  description: string;
};

type DigitalWorldLink = {
  label: string;
  href: string;
  kind: "primary" | "secondary";
};

type DigitalWorldZone = {
  id: string;
  title: string;
  subtitle: string;
  status: ZoneStatus;
  healthLabel: string;
  riskLabel: string;
  recentActivitySummary: string;
  counts: CountMetric[];
  safetyFlags: SafetyFlag[];
  links: DigitalWorldLink[];
};

type SafeModeFlagSnapshot = {
  globalSafeMode: boolean;
  pauseAutonomousPublishing: boolean;
  pauseMarketplaceApprovals: boolean;
  pauseExternalAgentActions: boolean;
  pauseSocialDistributionAutomation: boolean;
  pauseYouTubeUploads: boolean;
  pausePodcastAudioGeneration: boolean;
};

export type DigitalWorldOverview = {
  generatedAt: string;
  rootAdminOnly: true;
  readOnly: true;
  adminVisualizationOnly: true;
  noSimulationEngine: true;
  noMutations: true;
  model: {
    name: "selective_digital_world_ui";
    phase: "30";
    description: string;
  };
  safeMode: {
    flags: SafeModeFlagSnapshot;
    activePauseCount: number;
    globalSafeMode: boolean;
    summary: string;
  };
  civilization: {
    score: number;
    displayScore: string;
    collapseRiskLevel: string;
    founderReviewNeeded: boolean;
    recommendations: string[];
  };
  zones: DigitalWorldZone[];
  safeguards: {
    aggregateCountsOnly: true;
    noRawPackagePayloads: true;
    noPrivateMemoryExposure: true;
    noBusinessRestrictedMemoryExposure: true;
    noSecretsOrTokens: true;
    noPublicRoute: true;
    noAutonomousExecution: true;
    noMarketplaceTransactions: true;
    noMoneyOrRedemptionChanges: true;
  };
};

const SAFE_STATUS: ZoneStatus = "healthy";
const WATCH_STATUS: ZoneStatus = "watch";
const PAUSED_STATUS: ZoneStatus = "paused";
const RISK_STATUS: ZoneStatus = "risk";

function countSql() {
  return sql<number>`count(*)::int`;
}

async function countRows(table: any) {
  const [row] = await db.select({ count: countSql() }).from(table);
  return Number(row?.count || 0);
}

async function countWhere(table: any, where: any) {
  const [row] = await db.select({ count: countSql() }).from(table).where(where);
  return Number(row?.count || 0);
}

async function distribution(table: any, column: any): Promise<Distribution> {
  const rows = await db.select({ key: column, count: countSql() }).from(table).groupBy(column);
  return rows.reduce<Distribution>((acc, row) => {
    const key = String(row.key || "unknown");
    acc[key] = Number(row.count || 0);
    return acc;
  }, {});
}

function distributionCount(source: Distribution, keys: string[]) {
  return keys.reduce((total, key) => total + Number(source[key] || 0), 0);
}

function pct(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function statusFromScore(score: number | null | undefined): ZoneStatus {
  if (typeof score !== "number" || Number.isNaN(score)) return "unknown";
  if (score >= 0.75) return SAFE_STATUS;
  if (score >= 0.5) return WATCH_STATUS;
  return RISK_STATUS;
}

function statusFromRisk(level: string | null | undefined): ZoneStatus {
  if (level === "critical" || level === "high") return RISK_STATUS;
  if (level === "medium") return WATCH_STATUS;
  if (level === "low") return SAFE_STATUS;
  return "unknown";
}

function pauseStatus(active: boolean, fallback: ZoneStatus = SAFE_STATUS): ZoneStatus {
  return active ? PAUSED_STATUS : fallback;
}

function flag(
  key: keyof SafeModeFlagSnapshot,
  label: string,
  flags: SafeModeFlagSnapshot,
  description: string,
  severity: SafetyFlag["severity"] = "warning",
): SafetyFlag {
  return {
    key,
    label,
    active: flags[key],
    severity,
    description,
  };
}

function metric(key: string, label: string, value: number | string, tone: ZoneTone = "info"): CountMetric {
  return { key, label, value, tone };
}

function link(label: string, href: string, kind: DigitalWorldLink["kind"] = "secondary"): DigitalWorldLink {
  return { label, href, kind };
}

function safeModeFlags(controls: any): SafeModeFlagSnapshot {
  return {
    globalSafeMode: !!controls?.globalSafeMode,
    pauseAutonomousPublishing: !!controls?.pauseAutonomousPublishing,
    pauseMarketplaceApprovals: !!controls?.pauseMarketplaceApprovals,
    pauseExternalAgentActions: !!controls?.pauseExternalAgentActions,
    pauseSocialDistributionAutomation: !!controls?.pauseSocialDistributionAutomation,
    pauseYouTubeUploads: !!controls?.pauseYouTubeUploads,
    pausePodcastAudioGeneration: !!controls?.pausePodcastAudioGeneration,
  };
}

async function getSafeModeFlagSnapshot(): Promise<SafeModeFlagSnapshot> {
  const [controls] = await db.select().from(safeModeControls).limit(1);
  return safeModeFlags(controls);
}

async function getSocialAutomationSnapshot() {
  const [settings] = await db.select().from(socialDistributionAutomationSettings).limit(1);
  return settings || {
    safeAutomationEnabled: false,
    paused: true,
    killSwitch: false,
    perPlatformEnabled: {},
    dailyPostLimit: 0,
    duplicateWindowHours: 0,
    trustThreshold: 0,
    uesThreshold: 0,
  };
}

function activePauseCount(flags: SafeModeFlagSnapshot) {
  return [
    flags.pauseAutonomousPublishing,
    flags.pauseMarketplaceApprovals,
    flags.pauseExternalAgentActions,
    flags.pauseSocialDistributionAutomation,
    flags.pauseYouTubeUploads,
    flags.pausePodcastAudioGeneration,
  ].filter(Boolean).length;
}

async function latestCreatedAt(table: any) {
  const [row] = await db.select({ createdAt: table.createdAt }).from(table).orderBy(desc(table.createdAt)).limit(1);
  return row?.createdAt ? new Date(row.createdAt).toISOString() : null;
}

function latestSummary(label: string, iso: string | null) {
  if (!iso) return `${label}: no recent records.`;
  return `${label}: latest record ${new Date(iso).toLocaleString("en-US", { timeZone: "UTC" })} UTC.`;
}

async function getDigitalWorldOverview(): Promise<DigitalWorldOverview> {
  const [
    civilizationHealth,
    safeFlags,
    knowledgeGraphSummary,
    liveDebateSummaries,
    systemAgents,
    knowledgePacketStatus,
    knowledgePacketReviewStatus,
    claimsStatus,
    debateStatus,
    scriptStatus,
    voiceStatus,
    youtubeStatus,
    youtubeUploadStatus,
    socialStatus,
    socialPostingStatus,
    cloneReviewStatus,
    cloneStatus,
    totalEvidence,
    totalExternalKeys,
    activeExternalKeys,
    sandboxExternalKeys,
    socialSettings,
    latestPacket,
    latestDebate,
    latestScript,
    latestClone,
  ] = await Promise.all([
    civilizationHealthService.getCivilizationHealthDashboard(),
    getSafeModeFlagSnapshot(),
    knowledgeGraphService.getSummary(),
    liveDebateStudioService.listDebates(30),
    listSystemAgents(),
    distribution(knowledgePackets, knowledgePackets.status),
    distribution(knowledgePackets, knowledgePackets.reviewStatus),
    distribution(realityClaims, realityClaims.status),
    liveDebateStudioService.listDebates(100).then((rows) => rows.reduce<Distribution>((acc, debate) => {
      const key = debate.displayStatus || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})),
    distribution(podcastScriptPackages, podcastScriptPackages.status),
    distribution(podcastAudioJobs, podcastAudioJobs.status),
    distribution(youtubePublishingPackages, youtubePublishingPackages.status),
    distribution(youtubePublishingPackages, youtubePublishingPackages.uploadStatus),
    distribution(socialDistributionPackages, socialDistributionPackages.status),
    distribution(socialDistributionPackages, socialDistributionPackages.postingStatus),
    distribution(agentMarketplaceClonePackages, agentMarketplaceClonePackages.reviewStatus),
    distribution(agentMarketplaceClonePackages, agentMarketplaceClonePackages.status),
    countRows(claimEvidence),
    countRows(externalAgentApiKeys),
    countWhere(externalAgentApiKeys, and(eq(externalAgentApiKeys.active, true), isNull(externalAgentApiKeys.revokedAt))),
    countWhere(externalAgentApiKeys, eq(externalAgentApiKeys.sandboxMode, true)),
    getSocialAutomationSnapshot(),
    latestCreatedAt(knowledgePackets),
    latestCreatedAt(liveDebates),
    latestCreatedAt(podcastAudioJobs),
    latestCreatedAt(agentMarketplaceClonePackages),
  ]);

  const enabledSystemAgents = systemAgents.filter((agent) => agent.blueprint.enabled !== false).length;
  const totalSystemAgents = systemAgents.length;
  const activePauses = activePauseCount(safeFlags);
  const knowledgePacketTotal = Object.values(knowledgePacketStatus).reduce((total, value) => total + value, 0);
  const approvedPackets = distributionCount(knowledgePacketReviewStatus, ["accepted", "approved", "verified"]);
  const pendingPackets = distributionCount(knowledgePacketReviewStatus, ["draft", "pending", "pending_review", "submitted", "challenged"]);
  const rejectedPackets = distributionCount(knowledgePacketReviewStatus, ["rejected", "blocked"]);
  const liveDebateCount = distributionCount(debateStatus, ["live"]);
  const pausedDebateCount = distributionCount(debateStatus, ["paused"]);
  const endedDebateCount = distributionCount(debateStatus, ["ended", "archived"]);
  const scriptTotal = Object.values(scriptStatus).reduce((total, value) => total + value, 0);
  const voiceTotal = Object.values(voiceStatus).reduce((total, value) => total + value, 0);
  const youtubeTotal = Object.values(youtubeStatus).reduce((total, value) => total + value, 0);
  const socialTotal = Object.values(socialStatus).reduce((total, value) => total + value, 0);
  const cloneTotal = Object.values(cloneStatus).reduce((total, value) => total + value, 0);
  const clonePendingReview = distributionCount(cloneReviewStatus, ["pending_review", "draft"]);
  const cloneApproved = distributionCount(cloneReviewStatus, ["approved"]);
  const socialPlatformSettings = socialSettings.perPlatformEnabled || {};
  const socialEnabledPlatforms = Object.values(socialPlatformSettings).filter((platform: any) => !!platform?.enabled).length;
  const socialTrackedPlatforms = Object.keys(socialPlatformSettings).length;
  const externalSandboxOnly = totalExternalKeys === 0 || sandboxExternalKeys === totalExternalKeys;

  const zones: DigitalWorldZone[] = [
    {
      id: "research_lab",
      title: "Research Lab",
      subtitle: "Knowledge graph, packets, claims, evidence, and graph quality.",
      status: statusFromScore(knowledgeGraphSummary.qualityScores.overallGraphQuality),
      healthLabel: `Graph quality ${pct(knowledgeGraphSummary.qualityScores.overallGraphQuality)}`,
      riskLabel: `${knowledgeGraphSummary.totals.blockedRestrictedSources} restricted/private sources blocked`,
      recentActivitySummary: latestSummary("Knowledge packets", latestPacket),
      counts: [
        metric("graph_nodes", "Graph nodes", knowledgeGraphSummary.totals.nodes),
        metric("graph_edges", "Graph edges", knowledgeGraphSummary.totals.edges),
        metric("knowledge_packets", "Knowledge packets", knowledgePacketTotal),
        metric("approved_packets", "Approved packets", approvedPackets, "success"),
        metric("claims", "Claims", Object.values(claimsStatus).reduce((total, value) => total + value, 0)),
        metric("evidence", "Evidence", totalEvidence),
      ],
      safetyFlags: [
        {
          key: "restricted_sources_blocked",
          label: "Restricted/private sources blocked",
          active: knowledgeGraphSummary.totals.blockedRestrictedSources > 0,
          severity: "info",
          description: "Only aggregate blocked counts are shown here; raw private memory is not loaded.",
        },
      ],
      links: [
        link("Knowledge Graph", "/admin/knowledge-graph", "primary"),
        link("Knowledge Economy", "/admin/knowledge-economy"),
        link("Truth Alignment", "/admin/truth-alignment"),
      ],
    },
    {
      id: "debate_arena",
      title: "Debate Arena",
      subtitle: "Live debate states, transcript monitoring, and studio handoff.",
      status: pausedDebateCount > 0 ? PAUSED_STATUS : liveDebateCount > 0 ? SAFE_STATUS : WATCH_STATUS,
      healthLabel: liveDebateCount > 0 ? `${liveDebateCount} debate(s) live` : "No active live debate",
      riskLabel: `${pausedDebateCount} paused, ${endedDebateCount} ended/archived`,
      recentActivitySummary: latestSummary("Debates", latestDebate),
      counts: [
        metric("tracked_debates", "Tracked debates", liveDebateSummaries.length),
        metric("live_debates", "Live", liveDebateCount, liveDebateCount ? "success" : "muted"),
        metric("paused_debates", "Paused", pausedDebateCount, pausedDebateCount ? "warning" : "muted"),
        metric("ended_debates", "Ended/archived", endedDebateCount, "muted"),
      ],
      safetyFlags: [
        flag("pauseExternalAgentActions", "External agent actions paused", safeFlags, "Live studio remains manual; external action execution is not enabled here."),
        flag("globalSafeMode", "Global safe mode visible", safeFlags, "Safe mode is displayed but debates are not auto-paused by this dashboard.", "info"),
      ],
      links: [
        link("Live Studio", "/admin/live-studio", "primary"),
        link("News-to-Debate", "/admin/news-to-debate"),
        link("Civilization Health", "/admin/civilization-health"),
      ],
    },
    {
      id: "podcast_studio",
      title: "Podcast Studio",
      subtitle: "Podcast scripts, voice jobs, YouTube packages, and social distribution.",
      status: pauseStatus(safeFlags.pausePodcastAudioGeneration || safeFlags.pauseYouTubeUploads || safeFlags.pauseSocialDistributionAutomation, WATCH_STATUS),
      healthLabel: `${scriptTotal} script package(s), ${voiceTotal} voice job(s)`,
      riskLabel: `${distributionCount(youtubeUploadStatus, ["uploaded"])} uploaded, ${distributionCount(youtubeUploadStatus, ["not_uploaded", "blocked", "failed"])} not uploaded/blocked`,
      recentActivitySummary: latestSummary("Media jobs", latestScript),
      counts: [
        metric("podcast_scripts", "Podcast scripts", scriptTotal),
        metric("voice_jobs", "Voice jobs", voiceTotal),
        metric("youtube_packages", "YouTube packages", youtubeTotal),
        metric("social_packages", "Social packages", socialTotal),
      ],
      safetyFlags: [
        flag("pausePodcastAudioGeneration", "Podcast/audio generation paused", safeFlags, "Blocks new voice generation; this page only displays the state."),
        flag("pauseYouTubeUploads", "YouTube uploads paused", safeFlags, "Blocks upload endpoint through existing Safe Mode controls."),
        flag("pauseSocialDistributionAutomation", "Social automation paused", safeFlags, "Blocks safe automation evaluation; manual review remains separate."),
      ],
      links: [
        link("Podcast Scripts", "/admin/podcast-scripts", "primary"),
        link("Voice Jobs", "/admin/voice-jobs"),
        link("YouTube Publishing", "/admin/youtube-publishing"),
        link("Video Render", "/admin/video-render"),
        link("Social Distribution", "/admin/social-distribution"),
      ],
    },
    {
      id: "market_zone",
      title: "Market Zone",
      subtitle: "Safe-clone review, sandbox listings, and external agent key status.",
      status: pauseStatus(safeFlags.pauseMarketplaceApprovals, clonePendingReview > 0 ? WATCH_STATUS : SAFE_STATUS),
      healthLabel: `${cloneApproved} approved safe-clone package(s)`,
      riskLabel: `${clonePendingReview} package(s) awaiting review; marketplace stays sandbox-only`,
      recentActivitySummary: latestSummary("Safe clone packages", latestClone),
      counts: [
        metric("clone_packages", "Clone packages", cloneTotal),
        metric("pending_review", "Pending review", clonePendingReview, clonePendingReview ? "warning" : "muted"),
        metric("approved", "Approved", cloneApproved, "success"),
        metric("external_keys", "External keys", totalExternalKeys),
        metric("active_external_keys", "Active keys", activeExternalKeys),
      ],
      safetyFlags: [
        flag("pauseMarketplaceApprovals", "Marketplace approvals paused", safeFlags, "Blocks safe-clone approval only; review dashboards remain readable."),
        {
          key: "external_sandbox_only",
          label: "External agents sandbox-only",
          active: externalSandboxOnly,
          severity: "info",
          description: "External keys are summarized without raw tokens, hashes, IPs, or user-agent metadata.",
        },
      ],
      links: [
        link("Marketplace Review", "/admin/marketplace-clones", "primary"),
        link("External Agents", "/admin/external-agents"),
        link("Agent Store", "/agent-store"),
      ],
    },
    {
      id: "governance_hall",
      title: "Governance Hall",
      subtitle: "Safe-mode state, policy posture, founder controls, and risk signals.",
      status: activePauses > 0 || safeFlags.globalSafeMode ? PAUSED_STATUS : statusFromRisk(civilizationHealth.summary.collapseRiskLevel),
      healthLabel: safeFlags.globalSafeMode ? "Global safe mode visible" : "Manual controls available",
      riskLabel: `${activePauses} explicit pause flag(s) active`,
      recentActivitySummary: `Founder review ${civilizationHealth.summary.founderReviewNeeded ? "needed" : "not required"} based on Civilization Health.`,
      counts: [
        metric("active_pause_flags", "Active pause flags", activePauses, activePauses ? "warning" : "success"),
        metric("collapse_risk", "Collapse risk", civilizationHealth.summary.collapseRiskLevel),
        metric("safe_mode_recs", "Recommendations", civilizationHealth.summary.safeModeRecommendationStatus.length),
        metric("system_agents", "System agents enabled", `${enabledSystemAgents}/${totalSystemAgents}`),
      ],
      safetyFlags: [
        flag("globalSafeMode", "Global safe mode", safeFlags, "Visible platform state and future policy input.", "info"),
        flag("pauseAutonomousPublishing", "Autonomous publishing paused", safeFlags, "Blocks approved automation gates where wired."),
        flag("pauseExternalAgentActions", "External agent actions paused", safeFlags, "External action-like routes are blocked by existing controls."),
      ],
      links: [
        link("Safe Mode", "/admin/safe-mode", "primary"),
        link("Risk Center", "/admin/risk-center"),
        link("Policy Governance", "/admin/policy-governance"),
        link("Founder Control", "/admin/founder-control"),
      ],
    },
    {
      id: "social_hub",
      title: "Social Hub",
      subtitle: "Social distribution status, public-safe graph link, and agent activity summaries.",
      status: pauseStatus(safeFlags.pauseSocialDistributionAutomation || safeFlags.pauseAutonomousPublishing, socialSettings?.paused ? PAUSED_STATUS : WATCH_STATUS),
      healthLabel: socialSettings?.safeAutomationEnabled ? "Safe automation configured" : "Manual/export-first mode",
      riskLabel: `${socialEnabledPlatforms}/${socialTrackedPlatforms} platform(s) enabled; credential state is not exposed here`,
      recentActivitySummary: latestSummary("Voice/social pipeline", latestScript),
      counts: [
        metric("social_packages", "Social packages", socialTotal),
        metric("not_posted", "Not posted", distributionCount(socialPostingStatus, ["not_posted"])),
        metric("exported", "Exported", distributionCount(socialPostingStatus, ["exported", "posted"])),
        metric("enabled_platforms", "Automation platforms", socialEnabledPlatforms),
        metric("system_agents", "System agents", totalSystemAgents),
      ],
      safetyFlags: [
        flag("pauseSocialDistributionAutomation", "Social automation paused", safeFlags, "Read-only dashboard; automation controls stay on Safe Mode/Social Distribution."),
        flag("pauseAutonomousPublishing", "Autonomous publishing paused", safeFlags, "No public publishing is triggered by this page."),
      ],
      links: [
        link("Social Distribution", "/admin/social-distribution", "primary"),
        link("Public Graph", "/knowledge-graph"),
        link("System Agents", "/admin/system-agents"),
        link("Social Hub", "/admin/social-hub"),
      ],
    },
    {
      id: "founder_command_center",
      title: "Founder Command Center",
      subtitle: "Civilization health, collapse risk, review flags, and executive safety links.",
      status: civilizationHealth.summary.founderReviewNeeded ? RISK_STATUS : statusFromRisk(civilizationHealth.summary.collapseRiskLevel),
      healthLabel: `Civilization health ${civilizationHealth.summary.displayScore}`,
      riskLabel: `Collapse risk ${civilizationHealth.summary.collapseRiskLevel}`,
      recentActivitySummary: civilizationHealth.summary.explanation,
      counts: [
        metric("health_score", "Health score", civilizationHealth.summary.displayScore),
        metric("average_ues", "Average UES", pct(civilizationHealth.ues.averageUES)),
        metric("average_xi", "Average Xi", pct(civilizationHealth.ues.averageXi)),
        metric("correction_capacity", "Correction capacity", pct(civilizationHealth.ues.correctionCapacity)),
      ],
      safetyFlags: [
        {
          key: "founder_review_needed",
          label: "Founder review needed",
          active: civilizationHealth.summary.founderReviewNeeded,
          severity: civilizationHealth.summary.founderReviewNeeded ? "blocking" : "info",
          description: "Read-only health signal; this page does not enforce safe mode or pause systems.",
        },
        flag("globalSafeMode", "Global safe mode", safeFlags, "Displayed for founder situational awareness.", "info"),
      ],
      links: [
        link("Civilization Health", "/admin/civilization-health", "primary"),
        link("Safe Mode", "/admin/safe-mode"),
        link("Command Center", "/admin/command-center"),
        link("Founder Control", "/admin/founder-control"),
      ],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    rootAdminOnly: true,
    readOnly: true,
    adminVisualizationOnly: true,
    noSimulationEngine: true,
    noMutations: true,
    model: {
      name: "selective_digital_world_ui",
      phase: "30",
      description: "A read-only 2D admin visualization layer for Mougle zones, activity summaries, safe-mode state, and founder review links.",
    },
    safeMode: {
      flags: safeFlags,
      activePauseCount: activePauses,
      globalSafeMode: safeFlags.globalSafeMode,
      summary: activePauses > 0 || safeFlags.globalSafeMode
        ? `${activePauses} explicit pause flag(s) active${safeFlags.globalSafeMode ? " with global safe mode visible" : ""}.`
        : "No explicit pause flags are active.",
    },
    civilization: {
      score: civilizationHealth.summary.score,
      displayScore: civilizationHealth.summary.displayScore,
      collapseRiskLevel: civilizationHealth.summary.collapseRiskLevel,
      founderReviewNeeded: civilizationHealth.summary.founderReviewNeeded,
      recommendations: civilizationHealth.summary.safeModeRecommendationStatus,
    },
    zones,
    safeguards: {
      aggregateCountsOnly: true,
      noRawPackagePayloads: true,
      noPrivateMemoryExposure: true,
      noBusinessRestrictedMemoryExposure: true,
      noSecretsOrTokens: true,
      noPublicRoute: true,
      noAutonomousExecution: true,
      noMarketplaceTransactions: true,
      noMoneyOrRedemptionChanges: true,
    },
  };
}

export const digitalWorldOverviewService = {
  getDigitalWorldOverview,
};
