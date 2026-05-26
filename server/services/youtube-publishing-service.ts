import { and, desc, eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { db } from "../db";
import { riskManagementService } from "./risk-management-service";
import {
  generatedClips,
  podcastAudioJobs,
  podcastScriptPackages,
  youtubePublishingPackages,
  type GeneratedClip,
  type PodcastAudioJob,
  type PodcastScriptPackage,
  type YouTubePublishingChecklistItem,
  type YouTubePublishingPackage,
  type YouTubePublishingPackageMetadata,
} from "@shared/schema";

type YouTubeProviderName = "dry_run" | "youtube_data_api";

type ProviderStatus = {
  selected: YouTubeProviderName;
  youtubeConfigured: boolean;
  channelConfigured: boolean;
  dryRunAvailable: true;
  message: string;
};

type EligibilityItem = {
  scriptPackage: PodcastScriptPackage;
  latestAudioJob: PodcastAudioJob | null;
  videoAssets: Array<{
    id: number;
    title: string;
    status: string;
    uploadStatus: string | null;
    durationSeconds: number | null;
    format: string;
    hasVideoPath: boolean;
    youtubeUrl: string | null;
  }>;
  existingPackage: YouTubePublishingPackage | null;
};

type CreatePackageInput = {
  scriptPackageId: number;
  audioJobId?: number | null;
  generatedClipId?: number | null;
  createdBy: string;
};

type UploadResult = {
  videoId: string;
  url: string;
  status: string;
  provider: YouTubeProviderName;
};

class YouTubePublishingError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function hasYouTubeCredentials() {
  return !!(
    process.env.YOUTUBE_CLIENT_ID?.trim() &&
    process.env.YOUTUBE_CLIENT_SECRET?.trim() &&
    process.env.YOUTUBE_REFRESH_TOKEN?.trim()
  );
}

function getProviderStatus(): ProviderStatus {
  const youtubeConfigured = hasYouTubeCredentials();
  const channelConfigured = !!process.env.YOUTUBE_CHANNEL_ID?.trim();
  if (!youtubeConfigured) {
    return {
      selected: "dry_run",
      youtubeConfigured,
      channelConfigured,
      dryRunAvailable: true,
      message: "YouTube credentials are not configured. Publishing packages can be prepared in dry-run mode only.",
    };
  }

  return {
    selected: "youtube_data_api",
    youtubeConfigured,
    channelConfigured,
    dryRunAvailable: true,
    message: "YouTube credentials are configured server-side. Upload still requires manual root-admin approval.",
  };
}

function checkItem(
  key: string,
  label: string,
  passed: boolean,
  severity: YouTubePublishingChecklistItem["severity"],
  message: string,
): YouTubePublishingChecklistItem {
  return { key, label, passed, severity, message };
}

function hasBlockingFailure(items: YouTubePublishingChecklistItem[]) {
  return items.some((item) => item.severity === "blocking" && !item.passed);
}

function allUploadChecksPass(pkg: YouTubePublishingPackage) {
  return !hasBlockingFailure([
    ...pkg.readinessChecklist,
    ...pkg.complianceChecklist,
    ...pkg.sourceChecklist,
  ]);
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function tagsFromPackage(scriptPackage: PodcastScriptPackage) {
  const script = scriptPackage.scriptPackage;
  const words = `${script.youtubeTitle} ${script.thumbnailText} ${script.shortsHooks.join(" ")}`
    .replace(/[#.,!?()[\]{}:;]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && word.length <= 32);

  const tags = Array.from(new Set(["Mougle", "AI", "News", "Debate", "Truth", ...words])).slice(0, 20);
  return tags;
}

function findHighRiskClaims(scriptPackage: PodcastScriptPackage) {
  const weakClaims = scriptPackage.safetyNotes.weakOrDisputedClaims || [];
  return weakClaims.filter((claim) => {
    const text = `${claim.status} ${claim.reason} ${claim.statement}`.toLowerCase();
    return claim.confidenceScore < 0.35 || /high.?risk|unsafe|unresolved|unverified|rejected|disputed/.test(text);
  });
}

async function latestAudioJobFor(scriptPackageId: number): Promise<PodcastAudioJob | null> {
  const [job] = await db.select().from(podcastAudioJobs)
    .where(eq(podcastAudioJobs.scriptPackageId, scriptPackageId))
    .orderBy(desc(podcastAudioJobs.createdAt))
    .limit(1);
  return job || null;
}

async function safeVideoAssetsFor(debateId: number) {
  const clips = await db.select().from(generatedClips)
    .where(and(
      eq(generatedClips.debateId, debateId),
      sql`${generatedClips.videoPath} is not null`,
      sql`${generatedClips.status} in ('rendered', 'completed', 'ready')`,
    ))
    .orderBy(desc(generatedClips.createdAt))
    .limit(10);

  return clips.map((clip) => ({
    id: clip.id,
    title: clip.title,
    status: clip.status,
    uploadStatus: clip.uploadStatus || null,
    durationSeconds: clip.durationSeconds,
    format: clip.format,
    hasVideoPath: !!clip.videoPath,
    youtubeUrl: clip.youtubeUrl || null,
  }));
}

async function loadScriptPackage(id: number): Promise<PodcastScriptPackage> {
  const [scriptPackage] = await db.select().from(podcastScriptPackages)
    .where(eq(podcastScriptPackages.id, id))
    .limit(1);
  if (!scriptPackage) throw new YouTubePublishingError(404, "Podcast script package not found.");
  return scriptPackage;
}

async function loadAudioJob(id: number | null | undefined, scriptPackageId: number): Promise<PodcastAudioJob | null> {
  if (!id) return latestAudioJobFor(scriptPackageId);
  const [job] = await db.select().from(podcastAudioJobs)
    .where(eq(podcastAudioJobs.id, id))
    .limit(1);
  if (!job) throw new YouTubePublishingError(404, "Podcast audio job not found.");
  if (job.scriptPackageId !== scriptPackageId) {
    throw new YouTubePublishingError(400, "Podcast audio job does not belong to the selected script package.");
  }
  return job;
}

async function loadGeneratedClip(id: number | null | undefined, debateId: number): Promise<GeneratedClip | null> {
  if (id) {
    const [clip] = await db.select().from(generatedClips)
      .where(eq(generatedClips.id, id))
      .limit(1);
    if (!clip) throw new YouTubePublishingError(404, "Generated video asset not found.");
    if (clip.debateId !== debateId) {
      throw new YouTubePublishingError(400, "Generated video asset does not belong to the selected debate.");
    }
    return clip;
  }

  const [clip] = await db.select().from(generatedClips)
    .where(and(
      eq(generatedClips.debateId, debateId),
      sql`${generatedClips.videoPath} is not null`,
      sql`${generatedClips.status} in ('rendered', 'completed', 'ready')`,
    ))
    .orderBy(desc(generatedClips.createdAt))
    .limit(1);
  return clip || null;
}

function buildPackageMetadata(
  scriptPackage: PodcastScriptPackage,
  audioJob: PodcastAudioJob | null,
  clip: GeneratedClip | null,
): YouTubePublishingPackageMetadata {
  const script = scriptPackage.scriptPackage;
  return {
    title: safeString(script.youtubeTitle, `Mougle Debate ${scriptPackage.debateId}`),
    description: safeString(script.youtubeDescription, "Internal Mougle YouTube publishing package for admin review."),
    tags: tagsFromPackage(scriptPackage),
    thumbnailText: safeString(script.thumbnailText, "Mougle"),
    shortsHooks: Array.isArray(script.shortsHooks) ? script.shortsHooks.slice(0, 8) : [],
    privacyStatus: "private",
    scriptPackageStatus: scriptPackage.status,
    scriptAdminReviewStatus: safeString(script.adminReviewStatus, "unknown"),
    audioJobStatus: audioJob?.status || null,
    videoAsset: {
      generatedClipId: clip?.id || null,
      title: clip?.title || null,
      pathPresent: !!clip?.videoPath,
      format: clip?.format || null,
      durationSeconds: clip?.durationSeconds || null,
    },
    manualApprovalRequired: true,
    internalReviewOnly: true,
  };
}

function buildReadinessChecklist(params: {
  scriptPackage: PodcastScriptPackage;
  audioJob: PodcastAudioJob | null;
  clip: GeneratedClip | null;
  provider: ProviderStatus;
}): YouTubePublishingChecklistItem[] {
  const scriptStatusOk = ["admin_review", "approved"].includes(params.scriptPackage.status);
  const audioOk = !params.audioJob || ["completed", "mock"].includes(params.audioJob.status);
  const clipUsable = !!params.clip?.videoPath && ["rendered", "completed", "ready"].includes(params.clip.status);

  return [
    checkItem("script_package_present", "Script package exists", true, "blocking", "Podcast script package was found."),
    checkItem(
      "script_package_admin_review",
      "Script package is admin-review material",
      scriptStatusOk,
      "blocking",
      scriptStatusOk ? "Script package is eligible for manual YouTube packaging." : "Script package is not in an admin-review or approved state.",
    ),
    checkItem(
      "audio_job_usable",
      "Audio job is usable when linked",
      audioOk,
      "warning",
      params.audioJob ? `Linked audio job is ${params.audioJob.status}.` : "No audio job is linked; YouTube upload can still use an existing rendered video asset.",
    ),
    checkItem(
      "video_asset_linked",
      "Video asset is linked",
      !!params.clip,
      "blocking",
      params.clip ? "Existing generated clip is linked as the upload asset." : "No safe existing generated clip was found. Phase 16 does not render video.",
    ),
    checkItem(
      "video_asset_usable",
      "Video asset has a usable file",
      clipUsable,
      "blocking",
      clipUsable ? "Generated clip has a stored video file." : "Upload requires an existing generated clip with a stored video file.",
    ),
    checkItem(
      "youtube_credentials_configured",
      "YouTube credentials configured",
      params.provider.youtubeConfigured,
      "blocking",
      params.provider.youtubeConfigured ? "YouTube upload credentials are configured server-side." : "No YouTube credentials are configured; dry-run package mode only.",
    ),
  ];
}

function buildComplianceChecklist(scriptPackage: PodcastScriptPackage): YouTubePublishingChecklistItem[] {
  const safety = scriptPackage.safetyNotes;
  const highRiskClaims = findHighRiskClaims(scriptPackage);
  return [
    checkItem("manual_trigger_only", "Manual root-admin trigger only", true, "blocking", "No autonomous publishing worker is used by this package."),
    checkItem("no_social_posting", "No social posting", !safety.socialPosting, "blocking", "This phase does not post to social platforms."),
    checkItem("no_podcast_hosting_upload", "No podcast hosting upload", !safety.podcastHostingUpload, "blocking", "Podcast hosting upload is out of scope."),
    checkItem("no_private_memory", "No private memory used", !safety.privateMemoryUsed, "blocking", "Script package safety notes indicate no private memory use."),
    checkItem("no_unresolved_high_risk_claims", "No unresolved high-risk claims", highRiskClaims.length === 0, "blocking", highRiskClaims.length === 0 ? "No unresolved high-risk claim blockers detected." : `${highRiskClaims.length} weak or high-risk claim blocker(s) need review.`),
    checkItem("private_youtube_visibility", "Private YouTube visibility", true, "blocking", "Initial uploads use private visibility for admin control."),
  ];
}

function buildSourceChecklist(scriptPackage: PodcastScriptPackage): YouTubePublishingChecklistItem[] {
  const references = scriptPackage.scriptPackage.sourceEvidenceReferences || [];
  const urlCount = references.filter((reference) => !!reference.url).length;
  const weakOrDisputedCount = scriptPackage.safetyNotes.weakOrDisputedClaims.length;
  return [
    checkItem("source_references_present", "Source references present", references.length > 0, "blocking", references.length > 0 ? `${references.length} source/evidence reference(s) are included.` : "No source/evidence references were stored."),
    checkItem("source_urls_present", "Source URLs present where available", urlCount > 0, "warning", urlCount > 0 ? `${urlCount} reference(s) include URLs.` : "No source URLs are attached; admin should review citations before upload."),
    checkItem("weak_claims_identified", "Weak/disputed claims are identified", true, "info", `${weakOrDisputedCount} weak or disputed claim(s) are listed in safety notes.`),
  ];
}

function resolveStatus(params: {
  readiness: YouTubePublishingChecklistItem[];
  compliance: YouTubePublishingChecklistItem[];
  sources: YouTubePublishingChecklistItem[];
  approvalStatus?: string;
}) {
  const hasBlockers = hasBlockingFailure([...params.readiness, ...params.compliance, ...params.sources]);
  if (hasBlockers) return "blocked";
  if (params.approvalStatus === "approved") return "approved";
  return "ready_for_approval";
}

async function audit(action: string, actorId: string, pkg: YouTubePublishingPackage | null, outcome: "success" | "blocked" | "failed", details: Record<string, unknown> = {}) {
  await riskManagementService.logAudit({
    actorId,
    actorType: "root_admin",
    action,
    resourceType: "youtube_publishing_package",
    resourceId: pkg ? String(pkg.id) : details.scriptPackageId ? String(details.scriptPackageId) : "unknown",
    outcome,
    riskLevel: outcome === "success" ? "medium" : "high",
    details,
  });
}

async function listEligible(): Promise<{ providerStatus: ProviderStatus; items: EligibilityItem[] }> {
  const provider = getProviderStatus();
  const scripts = await db.select().from(podcastScriptPackages)
    .where(sql`${podcastScriptPackages.status} in ('admin_review', 'approved')`)
    .orderBy(desc(podcastScriptPackages.createdAt))
    .limit(75);

  const packages = await db.select().from(youtubePublishingPackages)
    .orderBy(desc(youtubePublishingPackages.createdAt))
    .limit(200);

  const existingByScript = new Map<number, YouTubePublishingPackage>();
  for (const pkg of packages) {
    if (!existingByScript.has(pkg.scriptPackageId)) existingByScript.set(pkg.scriptPackageId, pkg);
  }

  const items: EligibilityItem[] = [];
  for (const scriptPackage of scripts) {
    items.push({
      scriptPackage,
      latestAudioJob: await latestAudioJobFor(scriptPackage.id),
      videoAssets: await safeVideoAssetsFor(scriptPackage.debateId),
      existingPackage: existingByScript.get(scriptPackage.id) || null,
    });
  }

  return { providerStatus: provider, items };
}

async function listPackages() {
  return db.select().from(youtubePublishingPackages)
    .orderBy(desc(youtubePublishingPackages.createdAt))
    .limit(100);
}

async function getPackage(id: number) {
  const [pkg] = await db.select().from(youtubePublishingPackages)
    .where(eq(youtubePublishingPackages.id, id))
    .limit(1);
  if (!pkg) throw new YouTubePublishingError(404, "YouTube publishing package not found.");
  return pkg;
}

async function buildPackageValues(input: CreatePackageInput, existingPackage?: YouTubePublishingPackage | null) {
  const scriptPackage = await loadScriptPackage(input.scriptPackageId);
  const audioJob = await loadAudioJob(input.audioJobId, scriptPackage.id);
  const clip = await loadGeneratedClip(input.generatedClipId, scriptPackage.debateId);
  const provider = getProviderStatus();
  const packageMetadata = buildPackageMetadata(scriptPackage, audioJob, clip);
  const readinessChecklist = buildReadinessChecklist({ scriptPackage, audioJob, clip, provider });
  const complianceChecklist = buildComplianceChecklist(scriptPackage);
  const sourceChecklist = buildSourceChecklist(scriptPackage);
  const status = resolveStatus({
    readiness: readinessChecklist,
    compliance: complianceChecklist,
    sources: sourceChecklist,
    approvalStatus: existingPackage?.approvalStatus,
  });

  return {
    scriptPackage,
    audioJob,
    clip,
    provider,
    values: {
      scriptPackageId: scriptPackage.id,
      audioJobId: audioJob?.id || null,
      generatedClipId: clip?.id || null,
      status,
      approvalStatus: existingPackage?.approvalStatus || "pending",
      uploadStatus: existingPackage?.uploadStatus || "not_uploaded",
      provider: provider.selected,
      packageMetadata,
      readinessChecklist,
      complianceChecklist,
      sourceChecklist,
      youtubeVideoId: existingPackage?.youtubeVideoId || null,
      youtubeUrl: existingPackage?.youtubeUrl || null,
      youtubeStatus: existingPackage?.youtubeStatus || null,
      errorMessage: status === "blocked" ? "Readiness, compliance, or source checklist has blocking items." : null,
      createdBy: existingPackage?.createdBy || input.createdBy,
      updatedAt: new Date(),
    },
  };
}

async function createOrRefreshPackage(input: CreatePackageInput) {
  const [existing] = await db.select().from(youtubePublishingPackages)
    .where(eq(youtubePublishingPackages.scriptPackageId, input.scriptPackageId))
    .orderBy(desc(youtubePublishingPackages.createdAt))
    .limit(1);

  const built = await buildPackageValues(input, existing || null);
  let pkg: YouTubePublishingPackage;

  if (existing) {
    [pkg] = await db.update(youtubePublishingPackages)
      .set(built.values)
      .where(eq(youtubePublishingPackages.id, existing.id))
      .returning();
  } else {
    [pkg] = await db.insert(youtubePublishingPackages)
      .values(built.values)
      .returning();
  }

  await audit("youtube_publishing_package_prepare", input.createdBy, pkg, "success", {
    scriptPackageId: input.scriptPackageId,
    audioJobId: built.audioJob?.id || null,
    generatedClipId: built.clip?.id || null,
    provider: built.provider.selected,
    status: pkg.status,
  });

  return {
    providerStatus: built.provider,
    package: pkg,
    scriptPackage: built.scriptPackage,
    audioJob: built.audioJob,
    videoAsset: built.clip ? {
      id: built.clip.id,
      title: built.clip.title,
      status: built.clip.status,
      durationSeconds: built.clip.durationSeconds,
      format: built.clip.format,
      hasVideoPath: !!built.clip.videoPath,
    } : null,
  };
}

async function validatePackage(id: number, actorId: string) {
  const existing = await getPackage(id);
  const built = await buildPackageValues({
    scriptPackageId: existing.scriptPackageId,
    audioJobId: existing.audioJobId,
    generatedClipId: existing.generatedClipId,
    createdBy: existing.createdBy,
  }, existing);

  const [pkg] = await db.update(youtubePublishingPackages)
    .set({
      ...built.values,
      updatedAt: new Date(),
    })
    .where(eq(youtubePublishingPackages.id, existing.id))
    .returning();

  await audit("youtube_publishing_package_validate", actorId, pkg, allUploadChecksPass(pkg) ? "success" : "blocked", {
    provider: built.provider.selected,
    status: pkg.status,
    readinessBlockers: pkg.readinessChecklist.filter((item) => item.severity === "blocking" && !item.passed).map((item) => item.key),
    complianceBlockers: pkg.complianceChecklist.filter((item) => item.severity === "blocking" && !item.passed).map((item) => item.key),
    sourceBlockers: pkg.sourceChecklist.filter((item) => item.severity === "blocking" && !item.passed).map((item) => item.key),
  });

  return { providerStatus: built.provider, package: pkg };
}

async function approvePackage(id: number, actorId: string) {
  const validation = await validatePackage(id, actorId);
  const blockers = [
    ...validation.package.readinessChecklist,
    ...validation.package.complianceChecklist,
    ...validation.package.sourceChecklist,
  ].filter((item) => item.severity === "blocking" && !item.passed);

  if (blockers.length > 0) {
    await audit("youtube_publishing_package_approve", actorId, validation.package, "blocked", {
      blockers: blockers.map((item) => item.key),
    });
    throw new YouTubePublishingError(409, "YouTube package cannot be approved until blocking checklist items are resolved.");
  }

  const [pkg] = await db.update(youtubePublishingPackages)
    .set({
      approvalStatus: "approved",
      status: "approved",
      errorMessage: null,
      approvedBy: actorId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(youtubePublishingPackages.id, id))
    .returning();

  await audit("youtube_publishing_package_approve", actorId, pkg, "success", {
    scriptPackageId: pkg.scriptPackageId,
    generatedClipId: pkg.generatedClipId,
    provider: pkg.provider,
  });

  return { providerStatus: getProviderStatus(), package: pkg };
}

function resolveGeneratedClipPath(clip: GeneratedClip) {
  if (!clip.videoPath) throw new YouTubePublishingError(409, "No usable video asset exists for this YouTube package.");
  const videoRoot = resolve(process.cwd(), "generated_clips");
  const fullPath = isAbsolute(clip.videoPath) ? resolve(clip.videoPath) : resolve(process.cwd(), clip.videoPath);
  if (fullPath !== videoRoot && !fullPath.startsWith(`${videoRoot}${sep}`)) {
    throw new YouTubePublishingError(403, "Generated video asset is outside the internal clips directory.");
  }
  return fullPath;
}

async function getYouTubeAccessToken() {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new YouTubePublishingError(503, "YouTube credentials are not configured. Add YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new YouTubePublishingError(response.status, `YouTube OAuth token refresh failed with status ${response.status}.`);
  }

  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new YouTubePublishingError(503, "YouTube OAuth response did not include an access token.");
  return data.access_token;
}

function buildMultipartUploadBody(metadata: Record<string, unknown>, videoBuffer: Buffer) {
  const boundary = `mougle_youtube_${Date.now()}`;
  const jsonPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    "utf8",
  );
  const videoPartHeader = Buffer.from(
    `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
    "utf8",
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    boundary,
    body: Buffer.concat([jsonPart, videoPartHeader, videoBuffer, closing]),
  };
}

async function uploadToYouTube(pkg: YouTubePublishingPackage, clip: GeneratedClip): Promise<UploadResult> {
  const accessToken = await getYouTubeAccessToken();
  const videoPath = resolveGeneratedClipPath(clip);
  const videoBuffer = await readFile(videoPath).catch(() => {
    throw new YouTubePublishingError(404, "Stored video asset could not be read.");
  });

  const metadata = {
    snippet: {
      title: pkg.packageMetadata.title,
      description: pkg.packageMetadata.description,
      tags: pkg.packageMetadata.tags,
      categoryId: "25",
      ...(process.env.YOUTUBE_CHANNEL_ID?.trim() ? { channelId: process.env.YOUTUBE_CHANNEL_ID.trim() } : {}),
    },
    status: {
      privacyStatus: "private",
      selfDeclaredMadeForKids: false,
    },
  };
  const multipart = buildMultipartUploadBody(metadata, videoBuffer);

  const response = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${multipart.boundary}`,
      "Content-Length": String(multipart.body.length),
    },
    body: multipart.body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new YouTubePublishingError(response.status, `YouTube upload failed with status ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }

  const uploaded = await response.json() as { id?: string; status?: { uploadStatus?: string; privacyStatus?: string } };
  if (!uploaded.id) throw new YouTubePublishingError(502, "YouTube upload response did not include a video id.");

  return {
    videoId: uploaded.id,
    url: `https://www.youtube.com/watch?v=${uploaded.id}`,
    status: uploaded.status?.uploadStatus || uploaded.status?.privacyStatus || "uploaded_private",
    provider: "youtube_data_api",
  };
}

async function uploadPackage(id: number, actorId: string) {
  const validation = await validatePackage(id, actorId);
  const pkg = validation.package;

  if (pkg.uploadStatus === "uploaded" || pkg.youtubeVideoId) {
    throw new YouTubePublishingError(409, "YouTube package has already been uploaded.");
  }
  if (pkg.approvalStatus !== "approved") {
    throw new YouTubePublishingError(409, "YouTube package must be manually approved by root admin before upload.");
  }
  if (!allUploadChecksPass(pkg)) {
    throw new YouTubePublishingError(409, "YouTube upload is blocked by readiness, compliance, or source checklist items.");
  }
  if (!validation.providerStatus.youtubeConfigured) {
    throw new YouTubePublishingError(503, "YouTube credentials are not configured. Package remains in dry-run/internal mode.");
  }
  if (!pkg.generatedClipId) {
    throw new YouTubePublishingError(409, "YouTube upload requires a linked generated video asset.");
  }

  const clip = await loadGeneratedClip(pkg.generatedClipId, (await loadScriptPackage(pkg.scriptPackageId)).debateId);

  try {
    const result = await uploadToYouTube(pkg, clip as GeneratedClip);
    const [updated] = await db.update(youtubePublishingPackages)
      .set({
        provider: result.provider,
        status: "uploaded",
        uploadStatus: "uploaded",
        youtubeVideoId: result.videoId,
        youtubeUrl: result.url,
        youtubeStatus: result.status,
        uploadedBy: actorId,
        uploadedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(youtubePublishingPackages.id, id))
      .returning();

    if (updated.generatedClipId) {
      await db.update(generatedClips)
        .set({
          youtubeVideoId: result.videoId,
          youtubeUrl: result.url,
          uploadStatus: "uploaded",
        })
        .where(eq(generatedClips.id, updated.generatedClipId));
    }

    await audit("youtube_publishing_package_upload", actorId, updated, "success", {
      youtubeVideoId: result.videoId,
      privacyStatus: "private",
      provider: result.provider,
    });

    return { providerStatus: getProviderStatus(), package: updated, uploadResult: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "YouTube upload failed.";
    const [failed] = await db.update(youtubePublishingPackages)
      .set({
        uploadStatus: "failed",
        youtubeStatus: "failed",
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(youtubePublishingPackages.id, id))
      .returning();
    await audit("youtube_publishing_package_upload", actorId, failed, "failed", {
      errorMessage: message,
      provider: validation.providerStatus.selected,
    });
    throw err;
  }
}

export const youtubePublishingService = {
  getProviderStatus,
  listEligible,
  listPackages,
  getPackage,
  createOrRefreshPackage,
  validatePackage,
  approvePackage,
  uploadPackage,
};
