import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  api,
  type AdminAvatarVideoActionResult,
  type AdminAvatarVideoCreatePayload,
  type AdminAvatarVideoPreviewMetadata,
  type AdminAvatarVideoRenderJob,
  type AdminAvatarVideoSceneTemplate,
} from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeft,
  Clapperboard,
  FileText,
  Loader2,
  Mic2,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Video,
  Volume2,
  Youtube,
} from "lucide-react";

const SCENE_LABELS: Record<AdminAvatarVideoSceneTemplate, string> = {
  news_desk: "News Desk",
  podcast_studio: "Podcast Studio",
  debate_arena_summary: "Debate Arena Summary",
  minimal_cards: "Minimal Speaker Cards",
};

type AdminAvatarVideoRenderBaseline = {
  renderer: "avatar_dry_run_planner";
  format: {
    container: "mp4";
    videoCodec: "h264";
    audioCodec: "aac";
    subtitles: "srt";
    fps: 30;
    width: 1920;
    height: 1080;
  };
  layers: Array<{
    key: string;
    order: number;
    label: string;
    enabled: boolean;
    notes: string;
  }>;
  safeZones: {
    anchorSafeZone: { x: number; y: number; width: number; height: number; unit: "percent"; purpose: string };
    lowerThirdZone: { x: number; y: number; width: number; height: number; unit: "percent"; purpose: string };
    tickerZone: { x: number; y: number; width: number; height: number; unit: "percent"; purpose: string };
    captionZone: { x: number; y: number; width: number; height: number; unit: "percent"; purpose: string };
    monitorPanelZones: Array<{ panelKey: string; x: number; y: number; width: number; height: number; unit: "percent"; purpose: string }>;
  };
  timing: {
    totalDurationMs: number;
    lowerThirdPolicy: string;
    tickerPolicy: string;
    panelSwitchPolicy: string;
    segments: Array<{
      segmentIndex: number;
      scriptType: string;
      speakerAgentKey: string;
      startMs: number;
      endMs: number;
      lowerThirdVisible: boolean;
      tickerVisible: boolean;
      captionWindow: { startMs: number; endMs: number };
      panelCue: "hold" | "switch";
    }>;
  };
  textSafety: {
    headlineMaxChars: number;
    lowerThirdMaxChars: number;
    tickerItemMaxChars: number;
    captionMaxCharsPerLine: number;
    captionMaxLines: number;
    overlapPrevention: string[];
  };
  storage: {
    mode: "local_preview_only";
    refs: Array<{
      kind: "mp4" | "srt";
      storageKey: string;
      accessMode: "admin_only_stream";
      publicUrl: null;
      status: "planned" | "generated" | "missing";
    }>;
    objectStorageConfigured: false;
    ready: boolean;
  };
  renderReadiness: {
    readyForDryRunRender: boolean;
    rendererStatus: "ready" | "needs_script" | "needs_audio";
    reasons: string[];
  };
  previewWatermark: {
    enabled: true;
    label: "INTERNAL PREVIEW";
    reason: string;
  };
  compliance?: {
    analyzedAt: string;
    warnings: Array<{ code: string; message: string }>;
    errors: Array<{ code: string; message: string }>;
  };
  captionsArtifact?: {
    storageKey: string;
    persistedStorageKey: string | null;
    mimeType: string;
    size: number;
    fileSize: number;
    createdAt: string;
    accessMode: "admin_only_stream";
    adminOnly: true;
    publicUrl: null;
    storageDriver: string;
    persisted: boolean;
    localFallback: boolean;
  } | null;
  captionsPreview?: {
    firstLines: string[];
    lineCount: number;
    cueCount: number;
  } | null;
  mp4Artifact?: {
    storageKey: string;
    persistedStorageKey: string | null;
    mimeType: string;
    size: number;
    fileSize: number;
    createdAt: string;
    accessMode: "admin_only_stream";
    adminOnly: true;
    publicUrl: null;
    storageDriver: string;
    persisted: boolean;
    localFallback: boolean;
  } | null;
  mp4Preview?: {
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    segmentCount: number;
    note: string;
  } | null;
};

type AdminAvatarVideoPreviewMetadataWithBaseline = AdminAvatarVideoPreviewMetadata & {
  renderBaseline?: AdminAvatarVideoRenderBaseline;
};

function statusBadgeClass(status: string) {
  if (status === "dry_run_completed" || status === "preview_ready") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "failed" || status === "canceled") return "bg-red-500/10 text-red-300 border-red-500/20";
  if (status === "draft") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  if (status === "dry_run") return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function formatCost(value: number | null | undefined) {
  if (typeof value !== "number") return "$0.0000";
  return `$${value.toFixed(4)}`;
}

function formatDurationMs(value: number | null | undefined) {
  if (!value || value <= 0) return "0s";
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function scriptTitle(job: AdminAvatarVideoRenderJob) {
  return job.previewMetadata?.title || `Render Job #${job.id}`;
}

function RenderJobCard({
  job,
  onPreview,
  onRender,
  onCancel,
  actionLoading,
}: {
  job: AdminAvatarVideoRenderJob;
  onPreview: (id: number) => void;
  onRender: (id: number) => void;
  onCancel: (id: number) => void;
  actionLoading: string | null;
}) {
  const profiles = Object.values(job.avatarProfileMapping || {});
  const previewMetadata = job.previewMetadata as AdminAvatarVideoPreviewMetadataWithBaseline;
  const warnings = previewMetadata?.safeModeWarnings || [];
  const renderBaseline = previewMetadata?.renderBaseline;
  const storageRefs = renderBaseline?.storage.refs || [];
  const mp4Ref = storageRefs.find((ref) => ref.kind === "mp4");
  const srtRef = storageRefs.find((ref) => ref.kind === "srt");
  const readiness = renderBaseline?.renderReadiness;
  const safetyFlags = previewMetadata?.safety || null;

  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Video className="w-5 h-5 text-cyan-300" />
            <h2 className="text-lg font-semibold">Render Job #{job.id}</h2>
            <Badge className={statusBadgeClass(job.status)}>{job.status}</Badge>
            <Badge className={statusBadgeClass(job.provider)}>{job.provider}</Badge>
            <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">{SCENE_LABELS[job.sceneTemplate] || job.sceneTemplate}</Badge>
            {renderBaseline && (
              <>
                <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">{renderBaseline.renderer}</Badge>
                <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">
                  {renderBaseline.format.container.toUpperCase()} {renderBaseline.format.width}x{renderBaseline.format.height} @ {renderBaseline.format.fps}fps
                </Badge>
              </>
            )}
          </div>
          <p className="text-sm text-zinc-100 mt-3">{scriptTitle(job)}</p>
          <p className="text-xs text-zinc-500 mt-1">
            Script package #{job.scriptPackageId}
            {job.audioJobId ? ` - Audio job #${job.audioJobId}` : " - Script-only audio mapping"}
            {job.youtubePackageId ? ` - YouTube package #${job.youtubePackageId}` : ""}
          </p>
          {job.errorMessage && (
            <div className="flex items-start gap-2 text-sm text-red-300 mt-3">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{job.errorMessage}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onPreview(job.id)} disabled={actionLoading === `preview-${job.id}` || job.status === "canceled"} className="border-white/10 text-zinc-300">
            {actionLoading === `preview-${job.id}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Preview
          </Button>
          <Button onClick={() => onRender(job.id)} disabled={actionLoading === `render-${job.id}` || job.status === "canceled"} className="bg-cyan-600 hover:bg-cyan-700">
            {actionLoading === `render-${job.id}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Dry-Run Render
          </Button>
          <Button variant="outline" onClick={() => onCancel(job.id)} disabled={actionLoading === `cancel-${job.id}` || job.status === "canceled"} className="border-red-500/20 text-red-300 hover:bg-red-500/10">
            {actionLoading === `cancel-${job.id}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Square className="w-4 h-4 mr-2" />}
            Cancel
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-5">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <p className="text-xs text-zinc-500">Estimated Cost</p>
          <p className="text-sm text-zinc-100 mt-1">{formatCost(job.estimatedCost)}</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <p className="text-xs text-zinc-500">Actual Cost</p>
          <p className="text-sm text-zinc-100 mt-1">{formatCost(job.actualCost)}</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <p className="text-xs text-zinc-500">Admin Review</p>
          <p className="text-sm text-zinc-100 mt-1">{job.adminReviewStatus}</p>
        </div>
      </div>

      {renderBaseline && (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-500">Render Readiness</p>
            <p className="text-sm text-zinc-100 mt-1">{readiness?.rendererStatus || "unknown"}</p>
            <p className="text-xs text-zinc-500 mt-1">
              {readiness?.readyForDryRunRender ? "Ready for dry-run render" : "Not ready yet"}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-500">Storage Status</p>
            <p className="text-sm text-zinc-100 mt-1">
              {renderBaseline.storage.mode} / {renderBaseline.storage.ready ? "ready" : "pending"}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              object storage configured: {String(renderBaseline.storage.objectStorageConfigured)}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-500">MP4 Ref</p>
            <p className="text-xs text-zinc-200 mt-1 break-all">{mp4Ref?.storageKey || "not planned"}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-500">SRT Ref</p>
            <p className="text-xs text-zinc-200 mt-1 break-all">{srtRef?.storageKey || "not planned"}</p>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-5 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2 text-sm text-yellow-200">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <div className="space-y-1">
              {warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          </div>
        </div>
      )}

      {renderBaseline?.compliance && (renderBaseline.compliance.errors.length > 0 || renderBaseline.compliance.warnings.length > 0) && (
        <div className="mt-5 space-y-3">
          {renderBaseline.compliance.errors.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm font-medium text-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Layout/Text Compliance Errors
              </p>
              <ul className="mt-2 space-y-1 text-xs text-red-100">
                {renderBaseline.compliance.errors.map((err, idx) => (
                  <li key={`${err.code}-${idx}`} data-testid={`text-compliance-error-${err.code}`}>
                    <span className="font-mono text-red-300">{err.code}</span> — {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {renderBaseline.compliance.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
              <p className="text-sm font-medium text-yellow-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Compliance Warnings
              </p>
              <ul className="mt-2 space-y-1 text-xs text-yellow-100">
                {renderBaseline.compliance.warnings.map((warn, idx) => (
                  <li key={`${warn.code}-${idx}`} data-testid={`text-compliance-warning-${warn.code}`}>
                    <span className="font-mono text-yellow-300">{warn.code}</span> — {warn.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-zinc-500" data-testid={`text-compliance-analyzed-at-${job.id}`}>
            analyzed at {renderBaseline.compliance.analyzedAt}
          </p>
        </div>
      )}

      {(renderBaseline?.mp4Artifact || renderBaseline?.mp4Preview) && (
        <div className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-200 flex items-center gap-2">
                <Video className="w-4 h-4" /> MP4 dry-run preview (admin-only)
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {renderBaseline.mp4Preview ? `${renderBaseline.mp4Preview.width}x${renderBaseline.mp4Preview.height} @ ${renderBaseline.mp4Preview.fps}fps · ${formatDurationMs(renderBaseline.mp4Preview.durationMs)} · ${renderBaseline.mp4Preview.segmentCount} slate(s)` : "preview pending"}
                {renderBaseline.mp4Artifact?.persisted ? " — persisted" : " — local-only fallback"}
              </p>
              {renderBaseline.mp4Preview?.note && (
                <p className="text-[11px] text-zinc-500 mt-1" data-testid={`text-mp4-note-${job.id}`}>
                  {renderBaseline.mp4Preview.note}
                </p>
              )}
            </div>
            {renderBaseline.mp4Artifact && (
              <a
                href={`/api/admin/video-render/jobs/${job.id}/preview.mp4?download=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                data-testid={`link-preview-mp4-${job.id}`}
              >
                Download preview.mp4
              </a>
            )}
          </div>
          {renderBaseline.mp4Artifact ? (
            <div className="mt-3">
              <video
                key={renderBaseline.mp4Artifact.storageKey}
                src={`/api/admin/video-render/jobs/${job.id}/preview.mp4`}
                controls
                preload="metadata"
                playsInline
                className="w-full max-h-[480px] rounded border border-emerald-500/20 bg-black"
                data-testid={`video-preview-mp4-${job.id}`}
              >
                Your browser does not support inline MP4 playback. Use the download link above.
              </video>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-zinc-500" data-testid={`text-mp4-not-ready-${job.id}`}>
              Inline player will appear once a dry-run render generates the MP4 artifact. Click Preview or Dry-Run Render above.
            </p>
          )}
        </div>
      )}

      {(renderBaseline?.captionsArtifact || renderBaseline?.captionsPreview) && (
        <div className="mt-5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-cyan-200 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Captions sidecar (admin-only)
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {renderBaseline.captionsPreview?.cueCount ?? 0} cues
                {renderBaseline.captionsArtifact?.persisted ? " — persisted" : " — local-only fallback"}
              </p>
            </div>
            {renderBaseline.captionsArtifact && (
              <a
                href={`/api/admin/video-render/jobs/${job.id}/captions.srt`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
                data-testid={`link-captions-srt-${job.id}`}
              >
                Download captions.srt
              </a>
            )}
          </div>
          {renderBaseline.captionsPreview && renderBaseline.captionsPreview.firstLines.length > 0 && (
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[11px] text-zinc-300 whitespace-pre-wrap" data-testid={`text-captions-preview-${job.id}`}>
              {renderBaseline.captionsPreview.firstLines.join("\n")}
            </pre>
          )}
        </div>
      )}

      {safetyFlags && (
        <div className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
          <p className="text-sm font-medium text-emerald-200">Safety Flags</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge className={safetyFlags.internalAdminReviewOnly ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}>internalAdminReviewOnly: {String(safetyFlags.internalAdminReviewOnly)}</Badge>
            <Badge className={safetyFlags.manualRootAdminTriggerOnly ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}>manualRootAdminTriggerOnly: {String(safetyFlags.manualRootAdminTriggerOnly)}</Badge>
            <Badge className={!safetyFlags.publicPublishing ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}>publicPublishing: {String(safetyFlags.publicPublishing)}</Badge>
            <Badge className={!safetyFlags.youtubeUpload ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}>youtubeUpload: {String(safetyFlags.youtubeUpload)}</Badge>
            <Badge className={!safetyFlags.socialPosting ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}>socialPosting: {String(safetyFlags.socialPosting)}</Badge>
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-5 mt-5">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Avatar / Speaker Mapping</h3>
          <div className="grid gap-2 mt-3">
            {profiles.map((profile) => (
              <div key={profile.agentKey} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-zinc-100">{profile.displayName}</p>
                  <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">{profile.renderRole}</Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-1">{profile.agentKey} - {profile.avatarStyle}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Script / Audio Segment Mapping</h3>
          <div className="grid gap-2 mt-3 max-h-80 overflow-y-auto pr-1">
            {job.segmentMapping.map((segment) => (
              <div key={`${job.id}-${segment.segmentIndex}-${segment.scriptType}`} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={segment.audioAvailable ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
                    {segment.audioAvailable ? "audio linked" : "script only"}
                  </Badge>
                  <p className="text-sm text-zinc-100">Segment {segment.segmentIndex} - {segment.scriptType}</p>
                </div>
                <p className="text-xs text-zinc-500 mt-1">{segment.displayName} - {segment.status}</p>
                <p className="text-sm text-zinc-300 mt-2 leading-6 break-words">{segment.textPreview}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Layout / Timing Baseline</h3>
          {!renderBaseline ? (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-zinc-500 mt-3">
              Baseline metadata is generated when preview metadata is refreshed.
            </div>
          ) : (
            <div className="space-y-3 mt-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-xs text-zinc-500">Layer Order</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {renderBaseline.layers.map((layer) => (
                    <Badge key={layer.key} className={layer.enabled ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
                      {layer.order}:{layer.key}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-xs text-zinc-500">Safe Zones</p>
                <p className="text-xs text-zinc-300 mt-2">
                  anchor {renderBaseline.safeZones.anchorSafeZone.x}%/{renderBaseline.safeZones.anchorSafeZone.y}% - {renderBaseline.safeZones.anchorSafeZone.width}% x {renderBaseline.safeZones.anchorSafeZone.height}%
                </p>
                <p className="text-xs text-zinc-300">
                  lower-third {renderBaseline.safeZones.lowerThirdZone.x}%/{renderBaseline.safeZones.lowerThirdZone.y}% - {renderBaseline.safeZones.lowerThirdZone.width}% x {renderBaseline.safeZones.lowerThirdZone.height}%
                </p>
                <p className="text-xs text-zinc-300">
                  ticker {renderBaseline.safeZones.tickerZone.x}%/{renderBaseline.safeZones.tickerZone.y}% - {renderBaseline.safeZones.tickerZone.width}% x {renderBaseline.safeZones.tickerZone.height}%
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-xs text-zinc-500">Timing</p>
                <p className="text-sm text-zinc-100 mt-1">Total: {formatDurationMs(renderBaseline.timing.totalDurationMs)}</p>
                <p className="text-xs text-zinc-500 mt-1">{renderBaseline.timing.panelSwitchPolicy}</p>
                {(readiness?.reasons || []).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {(readiness?.reasons || []).map((reason) => (
                      <p key={reason} className="text-xs text-zinc-400">- {reason}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function VideoRender() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";
  const [scriptPackageId, setScriptPackageId] = useState("");
  const [sceneTemplate, setSceneTemplate] = useState<AdminAvatarVideoSceneTemplate>("news_desk");
  const [latestResult, setLatestResult] = useState<AdminAvatarVideoActionResult | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const { data: eligible, isLoading: eligibleLoading, refetch: refetchEligible } = useQuery({
    queryKey: ["admin-video-render-eligible"],
    queryFn: () => api.admin.videoRenderEligiblePackages(75),
    enabled: isRootAdmin,
  });

  const { data: jobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ["admin-video-render-jobs"],
    queryFn: () => api.admin.videoRenderJobs(75),
    enabled: isRootAdmin,
  });

  const items = eligible?.items || [];
  const selectedItem = useMemo(
    () => items.find((item) => String(item.scriptPackage.id) === scriptPackageId) || null,
    [items, scriptPackageId],
  );
  const latestJob = latestResult?.job || jobs[0] || null;

  const createMutation = useMutation({
    mutationFn: (payload: AdminAvatarVideoCreatePayload) => api.admin.createVideoRenderJob(payload),
    onMutate: () => {
      setActionError(null);
      setActionLoading("create");
    },
    onSuccess: (result) => {
      setLatestResult(result);
      refetchJobs();
      refetchEligible();
    },
    onError: (err: Error) => setActionError(err.message),
    onSettled: () => setActionLoading(null),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ type, id }: { type: "preview" | "render" | "cancel"; id: number }) => {
      setActionLoading(`${type}-${id}`);
      if (type === "preview") return api.admin.previewVideoRenderJob(id);
      if (type === "render") return api.admin.renderVideoRenderJob(id);
      return api.admin.cancelVideoRenderJob(id);
    },
    onSuccess: (result) => {
      setLatestResult(result);
      refetchJobs();
      refetchEligible();
    },
    onError: (err: Error) => setActionError(err.message),
    onSettled: () => setActionLoading(null),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#060611] flex items-center justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (!isAuthenticated || !isRootAdmin) return null;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <button onClick={() => navigate("/admin/dashboard")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4" /> Admin Dashboard
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Video className="w-8 h-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">Avatar / Video Render</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
                <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Dry-run default</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Internal dry-run render-job planning for approved podcast, audio, and YouTube packages. Admin-review only; live provider calls and publishing are disabled.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/podcast-scripts")} className="border-white/10 text-zinc-300">
                <Mic2 className="w-4 h-4 mr-2" /> Scripts
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/voice-jobs")} className="border-white/10 text-zinc-300">
                <Volume2 className="w-4 h-4 mr-2" /> Voice Jobs
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/youtube-publishing")} className="border-white/10 text-zinc-300">
                <Youtube className="w-4 h-4 mr-2" /> YouTube
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/digital-world")} className="border-white/10 text-zinc-300">
                <Clapperboard className="w-4 h-4 mr-2" /> Digital World
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
                <h2 className="text-lg font-semibold">Safety State</h2>
                <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">Internal/admin-review only</Badge>
                <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">Dry-run only</Badge>
                <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No provider calls</Badge>
                <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No publishing</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2">{eligible?.providerStatus.message || "Dry-run provider status will appear after loading."}</p>
            </div>
            <Button variant="outline" onClick={() => { refetchEligible(); refetchJobs(); }} disabled={eligibleLoading || jobsLoading} className="border-white/10 text-zinc-300">
              {eligibleLoading || jobsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
          </div>
          {(eligible?.safeModeWarnings || []).length > 0 && (
            <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-200">
              {(eligible?.safeModeWarnings || []).map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}
        </Card>

        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold">Create Render Job</h2>
            <p className="text-sm text-zinc-500 mt-1">Uses the selected script package, latest voice job, and latest YouTube package when available. The default provider is dry-run and creates review metadata only.</p>
            <div className="grid md:grid-cols-2 gap-4 mt-5">
              <div>
                <label className="text-xs text-zinc-500">Eligible Package</label>
                <Select value={scriptPackageId} onValueChange={setScriptPackageId}>
                  <SelectTrigger className="mt-2 bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue placeholder="Choose a podcast package" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.scriptPackage.id} value={String(item.scriptPackage.id)}>
                        #{item.scriptPackage.id} - {item.scriptPackage.scriptPackage.youtubeTitle || `Debate ${item.scriptPackage.debateId}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Scene Template</label>
                <Select value={sceneTemplate} onValueChange={(value) => setSceneTemplate(value as AdminAvatarVideoSceneTemplate)}>
                  <SelectTrigger className="mt-2 bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue placeholder="Choose scene template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="news_desk">News Desk</SelectItem>
                    <SelectItem value="podcast_studio">Podcast Studio</SelectItem>
                    <SelectItem value="debate_arena_summary">Debate Arena Summary</SelectItem>
                    <SelectItem value="minimal_cards">Minimal Speaker Cards</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedItem && (
              <div className="grid md:grid-cols-3 gap-3 mt-5">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <p className="text-xs text-zinc-500">Script Package</p>
                  <p className="text-sm text-zinc-100 mt-1">#{selectedItem.scriptPackage.id} - {selectedItem.scriptPackage.status}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <p className="text-xs text-zinc-500">Audio Job</p>
                  <p className="text-sm text-zinc-100 mt-1">{selectedItem.latestAudioJob ? `#${selectedItem.latestAudioJob.id} - ${selectedItem.latestAudioJob.status}` : "No audio job linked"}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <p className="text-xs text-zinc-500">YouTube Package</p>
                  <p className="text-sm text-zinc-100 mt-1">{selectedItem.youtubePackage ? `#${selectedItem.youtubePackage.id} - ${selectedItem.youtubePackage.status}` : "No YouTube package linked"}</p>
                </div>
              </div>
            )}

            {actionError && (
              <div className="flex items-start gap-2 text-sm text-red-300 mt-4">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            <Button
              onClick={() => selectedItem && createMutation.mutate({
                scriptPackageId: selectedItem.scriptPackage.id,
                audioJobId: selectedItem.latestAudioJob?.id || null,
                youtubePackageId: selectedItem.youtubePackage?.id || null,
                provider: "dry_run",
                sceneTemplate,
              })}
              disabled={!selectedItem || actionLoading === "create"}
              className="mt-5 bg-cyan-600 hover:bg-cyan-700"
            >
              {actionLoading === "create" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Video className="w-4 h-4 mr-2" />}
              Create Dry-Run Job
            </Button>
          </Card>

          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
            <h2 className="text-lg font-semibold">Provider Plan</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
                <p className="text-sm font-medium text-cyan-200">dry_run</p>
                <p className="text-xs text-cyan-100/80 mt-1">Default. Plans scene, avatar, and segment metadata without generating video.</p>
              </div>
              {["heygen", "d_id", "synthesia", "unreal"].map((provider) => (
                <div key={provider} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <p className="text-sm font-medium text-zinc-300">{provider}</p>
                  <p className="text-xs text-zinc-500 mt-1">Placeholder only. Live provider calls are deferred.</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {latestJob && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-cyan-300" />
              <h2 className="text-lg font-semibold">Latest Render Plan</h2>
            </div>
            <RenderJobCard
              job={latestJob}
              onPreview={(id) => actionMutation.mutate({ type: "preview", id })}
              onRender={(id) => actionMutation.mutate({ type: "render", id })}
              onCancel={(id) => actionMutation.mutate({ type: "cancel", id })}
              actionLoading={actionLoading}
            />
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clapperboard className="w-5 h-5 text-cyan-300" />
            <h2 className="text-lg font-semibold">Render Job List</h2>
          </div>
          <div className="grid gap-5">
            {jobs.map((job) => (
              <RenderJobCard
                key={job.id}
                job={job}
                onPreview={(id) => actionMutation.mutate({ type: "preview", id })}
                onRender={(id) => actionMutation.mutate({ type: "render", id })}
                onCancel={(id) => actionMutation.mutate({ type: "cancel", id })}
                actionLoading={actionLoading}
              />
            ))}
            {jobs.length === 0 && (
              <Card className="bg-[#10101a]/90 border-white/[0.08] p-6 text-sm text-zinc-500">
                No render jobs yet.
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
