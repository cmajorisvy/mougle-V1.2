import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Film,
  Wand2,
  Camera,
  Lightbulb,
  Tv2,
  Layers,
  ZapOff,
  ShieldAlert,
  ShieldCheck,
  RefreshCcw,
  Image as ImageIcon,
  Video,
  Plus,
  Trash2,
  Sparkles,
  History,
  Eraser,
  Archive,
  Download,
  Undo2,
  AlertTriangle,
} from "lucide-react";

const PSV_API = "/api/admin/production-house/preview-studio";

const MODES: Array<{ id: PreviewMode; label: string; tip: string }> = [
  { id: "newsroom", label: "Newsroom", tip: "Anchor + LED wall + topic panel" },
  { id: "breaking_news", label: "Breaking News", tip: "Alert override layout" },
  { id: "podcast", label: "Podcast", tip: "Two-host or host-guest" },
  { id: "debate", label: "Debate", tip: "Three-person debate, moderator center" },
  { id: "interview", label: "Interview", tip: "Host + guest setup" },
  { id: "market_watch", label: "Market Watch", tip: "Multi-tile market wall" },
  { id: "hall_event", label: "Hall / Event", tip: "Stage layout for events" },
  { id: "youtube_social", label: "YouTube / Social", tip: "9:16 social cut preview" },
  { id: "fourd_cinema", label: "4D Cinema Cue", tip: "Cue planning (no hardware send)" },
];

const LAYOUT_PRESETS = [
  "anchor_center",
  "anchor_left_panel_right",
  "podcast_two_host",
  "podcast_host_guest",
  "debate_three_person",
  "debate_moderator_center",
  "hall_stage",
  "market_wall",
  "breaking_news_alert",
  "emergency_broadcast",
  "social_vertical_preview",
  "custom_grid",
] as const;

const CAMERA_PRESETS = [
  "wide_master",
  "anchor_two_shot",
  "anchor_close_up",
  "panel_overview",
  "audience_reverse",
  "social_vertical",
] as const;

const LIGHTING_PRESETS = [
  "neutral_news",
  "warm_studio",
  "breaking_high_contrast",
  "podcast_intimate",
  "hall_event_spot",
  "cinematic_dim",
] as const;

type PreviewMode =
  | "newsroom" | "breaking_news" | "podcast" | "debate" | "interview"
  | "market_watch" | "hall_event" | "youtube_social" | "fourd_cinema";

interface Marker { id: string; label: string; role?: string; x: number; y: number; facing?: string; }
interface Panel {
  id: string; label: string; kind: string;
  x: number; y: number; w: number; h: number;
}
interface Cue { id: string; label: string; tSec: number; effect: string; }
interface Scene {
  controls: {
    mode: PreviewMode; layoutPreset: string; camera: string; lighting: string;
    roomLabel: string; showLowerThird: boolean; showTicker: boolean;
    showLedWall: boolean; show4dMarkers: boolean;
    tickerText: string; lowerThirdText: string;
  };
  avatars: Marker[]; panels: Panel[]; fourDCues: Cue[];
  cameraFrame: { aspect: string; label: string; };
  lightingMood: { label: string; accent: string; };
  notes: string[];
}
interface PsvState {
  id: string; createdAt: string; generatedBy: string;
  scene: Scene;
  status: string; approvalStatus: string; visibility: string;
  publicUrl: null; signedUrl: null;
  realSendAllowed: false; executionEnabled: false;
  adminPreviewOnly: true; notRendered: true; notPublished: true;
  noUnrealExecution: true; noFourDHardware: true;
  safetyEnvelope: Record<string, boolean>;
}
interface TipData { key: string; title: string; body: string; }

interface ArchiveEntry {
  filename: string;
  byteSize: number;
  createdAt: string;
  scope: "states" | "edit_artifacts" | "both";
}

interface HistoryCapInfo {
  cap: number;
  defaultCap: number;
  minCap: number;
  maxCap: number;
  envCap: number | null;
  adminCap: number | null;
  source: "admin" | "env" | "default";
  states: number;
  editArtifacts: number;
}

interface ArchiveRetentionInfo {
  maxCount: number;
  maxAgeDays: number;
  defaultCount: number;
  defaultDays: number;
  minCount: number;
  maxCountLimit: number;
  minDays: number;
  maxDaysLimit: number;
  envCount: number | null;
  envDays: number | null;
  adminCount: number | null;
  adminDays: number | null;
  countSource: "admin" | "env" | "default";
  daysSource: "admin" | "env" | "default";
  archiveFiles: number;
  archiveBytes: number;
  storageThresholdMb: number;
  storageThresholdBytes: number;
  defaultStorageThresholdMb: number;
  minStorageThresholdMb: number;
  maxStorageThresholdMbLimit: number;
  envStorageThresholdMb: number | null;
  adminStorageThresholdMb: number | null;
  storageThresholdSource: "admin" | "env" | "default";
  storageThresholdExceeded: boolean;
  storageUsagePercent: number;
}

type LayerKind = "background" | "avatar" | "panel" | "lower_third" | "ticker" | "callout" | "overlay";
interface EditLayer {
  id: string; label: string; kind: LayerKind;
  sourceAssetId: string | null;
  x: number; y: number; w: number; h: number; opacity: number; text: string;
}
interface EditArtifact {
  id: string; kind: "image_compose" | "video_compose"; label: string;
  sourceAssetIds: string[]; layers: EditLayer[];
  camera: string; lighting: string; aspect: string; durationSec: number;
  internalFilePath: string; mimeType: string; byteSize: number;
  status: string; approvalStatus: string; visibility: string;
  publicUrl: null; signedUrl: null;
  realSendAllowed: false; executionEnabled: false;
  adminPreviewOnly: true; notRendered: true; notPublished: true;
  noUnrealExecution: true; noFourDHardware: true;
  createdAt: string;
}
interface MediaPackageLite {
  packageId: string; packageType: string; sourceTopic: string; targetFormat: string;
}

interface ComposeLayerRequest {
  id: string; label: string; kind: LayerKind;
  sourceAssetId: string | null;
  x: number; y: number; w: number; h: number;
  opacity: number; text: string;
}
interface ComposeImageRequest {
  label: string;
  sourceAssetIds: string[];
  layers: ComposeLayerRequest[];
  camera: string; lighting: string; aspect: string;
}
interface ComposeVideoRequest extends ComposeImageRequest {
  durationSec: number;
}

const LAYER_KINDS: LayerKind[] = ["background", "avatar", "lower_third", "ticker", "panel", "callout", "overlay"];
const ASPECTS = ["16:9", "9:16", "1:1", "21:9"] as const;

function newLayerId(): string {
  return `layer_${Math.random().toString(36).slice(2, 10)}`;
}
function defaultLayer(kind: LayerKind): EditLayer {
  const presets: Record<LayerKind, Partial<EditLayer>> = {
    background:  { x: 0,    y: 0,    w: 1,    h: 1,    text: "" },
    avatar:      { x: 0.4,  y: 0.45, w: 0.2,  h: 0.35, text: "Anchor" },
    panel:       { x: 0.65, y: 0.18, w: 0.3,  h: 0.4,  text: "Topic Panel" },
    lower_third: { x: 0.05, y: 0.78, w: 0.6,  h: 0.1,  text: "Lower third copy" },
    ticker:      { x: 0,    y: 0.92, w: 1,    h: 0.06, text: "Live ticker text" },
    callout:     { x: 0.1,  y: 0.1,  w: 0.25, h: 0.12, text: "Callout" },
    overlay:     { x: 0,    y: 0,    w: 1,    h: 1,    text: "" },
  };
  return {
    id: newLayerId(),
    label: kind.replace(/_/g, " "),
    kind,
    sourceAssetId: null,
    opacity: 1,
    x: 0, y: 0, w: 0.2, h: 0.2, text: "",
    ...presets[kind],
  } as EditLayer;
}

async function jget<T>(p: string): Promise<T | null> {
  try {
    const r = await fetch(PSV_API + p, { credentials: "include" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}
async function jpost<T>(p: string, body: any): Promise<T | null> {
  try {
    const r = await fetch(PSV_API + p, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

function tipFor(tips: TipData[] | null, key: string): string {
  if (!tips) return "";
  return tips.find((t) => t.key === key)?.body ?? "";
}

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  if (!text) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

export default function PreviewStudioHero() {
  const [state, setState] = useState<PsvState | null>(null);
  const [tips, setTips] = useState<TipData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("newsroom");
  const [tab, setTab] = useState<"studio" | "edit">("studio");

  // Edit-tab state
  const [editArtifacts, setEditArtifacts] = useState<EditArtifact[]>([]);
  const [mediaPackages, setMediaPackages] = useState<MediaPackageLite[]>([]);
  const [editLabel, setEditLabel] = useState("Untitled edit");
  const [editLayers, setEditLayers] = useState<EditLayer[]>([
    defaultLayer("background"),
    defaultLayer("avatar"),
    defaultLayer("lower_third"),
  ]);
  const [editAssetIds, setEditAssetIds] = useState<string[]>([]);
  const [editCamera, setEditCamera] = useState<string>("wide_master");
  const [editLighting, setEditLighting] = useState<string>("neutral_news");
  const [editAspect, setEditAspect] = useState<string>("16:9");
  const [editDuration, setEditDuration] = useState<number>(6);
  const [composing, setComposing] = useState(false);

  // History cap state
  const [historyCap, setHistoryCap] = useState<HistoryCapInfo | null>(null);
  const [capInput, setCapInput] = useState<string>("");
  const [capSaving, setCapSaving] = useState(false);
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [clearing, setClearing] = useState<"states" | "edit_artifacts" | "both" | null>(null);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [olderThanDate, setOlderThanDate] = useState<string>("");
  const [archives, setArchives] = useState<ArchiveEntry[]>([]);
  const [clearPreview, setClearPreview] = useState<{
    scope: "states" | "edit_artifacts" | "both";
    matchingStates: number;
    matchingEditArtifacts: number;
    olderThanIso: string | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [undoStatus, setUndoStatus] = useState<{
    available: boolean;
    scope: "states" | "edit_artifacts" | "both" | null;
    olderThanIso: string | null;
    snapshotStates: number;
    snapshotEditArtifacts: number;
    clearedAt: string | null;
    expiresAt: string | null;
    ttlMs: number;
    archiveFile: string | null;
  } | null>(null);
  const [undoCountdown, setUndoCountdown] = useState<number>(0);
  const [undoing, setUndoing] = useState(false);
  const [retention, setRetention] = useState<ArchiveRetentionInfo | null>(null);
  const [retCountInput, setRetCountInput] = useState<string>("");
  const [retDaysInput, setRetDaysInput] = useState<string>("");
  const [retThresholdInput, setRetThresholdInput] = useState<string>("");
  const [retSaving, setRetSaving] = useState(false);
  const [retMessage, setRetMessage] = useState<string | null>(null);

  const refreshUndoStatus = async () => {
    const r = await jget<{ ok: boolean; status: typeof undoStatus & { available: boolean } }>("/clear-undo");
    if (r?.status) {
      setUndoStatus(r.status);
    } else {
      setUndoStatus(null);
    }
  };

  const refresh = async () => {
    setLoading(true);
    const [s, t, a, p, c, arch, u, ret] = await Promise.all([
      jget<{ ok: boolean; state: PsvState }>("/state"),
      jget<{ ok: boolean; tooltips: TipData[] }>("/tooltips"),
      jget<{ ok: boolean; artifacts: EditArtifact[] }>("/edit-artifacts"),
      (async () => {
        try {
          const r = await fetch("/api/admin/production-house/media-pipeline/packages", {
            credentials: "include",
          });
          if (!r.ok) return null;
          return (await r.json()) as { ok: boolean; packages: MediaPackageLite[] };
        } catch { return null; }
      })(),
      jget<{ ok: boolean; info: HistoryCapInfo }>("/history-cap"),
      jget<{ ok: boolean; archives: ArchiveEntry[] }>("/archives"),
      jget<{ ok: boolean; status: NonNullable<typeof undoStatus> }>("/clear-undo"),
      jget<{ ok: boolean; info: ArchiveRetentionInfo }>("/archive-retention"),
    ]);
    if (s?.state) {
      setState(s.state);
      setMode(s.state.scene.controls.mode);
    }
    if (t?.tooltips) setTips(t.tooltips);
    if (a?.artifacts) setEditArtifacts(a.artifacts);
    if (p?.packages) setMediaPackages(p.packages);
    if (c?.info) {
      setHistoryCap(c.info);
      setCapInput(String(c.info.cap));
    }
    if (arch?.archives) setArchives(arch.archives);
    setUndoStatus(u?.status ?? null);
    if (ret?.info) {
      setRetention(ret.info);
      setRetCountInput(String(ret.info.maxCount));
      setRetDaysInput(String(ret.info.maxAgeDays));
      setRetThresholdInput(String(ret.info.storageThresholdMb));
    }
    setLoading(false);
  };

  const saveRetention = async () => {
    if (!retention) return;
    const countN = Number.parseInt(retCountInput, 10);
    const daysN = Number.parseFloat(retDaysInput);
    const thresholdN = Number.parseFloat(retThresholdInput);
    if (
      !Number.isFinite(countN) || !Number.isInteger(countN) ||
      countN < retention.minCount || countN > retention.maxCountLimit
    ) {
      setRetMessage(
        `Max files must be a whole number between ${retention.minCount} and ${retention.maxCountLimit}.`,
      );
      return;
    }
    if (
      !Number.isFinite(daysN) || daysN < retention.minDays || daysN > retention.maxDaysLimit
    ) {
      setRetMessage(
        `Max age (days) must be between ${retention.minDays} and ${retention.maxDaysLimit}.`,
      );
      return;
    }
    if (
      !Number.isFinite(thresholdN) ||
      thresholdN < retention.minStorageThresholdMb ||
      thresholdN > retention.maxStorageThresholdMbLimit
    ) {
      setRetMessage(
        `Warning threshold (MB) must be between ${retention.minStorageThresholdMb} and ${retention.maxStorageThresholdMbLimit}.`,
      );
      return;
    }
    setRetSaving(true);
    setRetMessage(null);
    const r = await jpost<{
      ok: boolean;
      info: ArchiveRetentionInfo;
      prune: { deletedFiles: string[]; deletedBytes: number };
    }>("/archive-retention", {
      maxCount: countN,
      maxAgeDays: daysN,
      storageThresholdMb: thresholdN,
    });
    if (r?.info) {
      setRetention(r.info);
      setRetCountInput(String(r.info.maxCount));
      setRetDaysInput(String(r.info.maxAgeDays));
      setRetThresholdInput(String(r.info.storageThresholdMb));
      const deleted = r.prune?.deletedFiles?.length ?? 0;
      setRetMessage(
        deleted > 0
          ? `Saved. Pruned ${deleted} old archive file(s).`
          : "Saved.",
      );
      const archRes = await jget<{ ok: boolean; archives: ArchiveEntry[] }>("/archives");
      if (archRes?.archives) setArchives(archRes.archives);
    } else {
      setRetMessage("Could not save retention settings. Please try again.");
    }
    setRetSaving(false);
  };

  const resetRetention = async () => {
    setRetSaving(true);
    setRetMessage(null);
    const r = await jpost<{
      ok: boolean;
      info: ArchiveRetentionInfo;
      prune: { deletedFiles: string[]; deletedBytes: number };
    }>("/archive-retention", { reset: true });
    if (r?.info) {
      setRetention(r.info);
      setRetCountInput(String(r.info.maxCount));
      setRetDaysInput(String(r.info.maxAgeDays));
      setRetThresholdInput(String(r.info.storageThresholdMb));
      setRetMessage("Reset to default / environment values.");
      const archRes = await jget<{ ok: boolean; archives: ArchiveEntry[] }>("/archives");
      if (archRes?.archives) setArchives(archRes.archives);
    } else {
      setRetMessage("Could not reset retention. Please try again.");
    }
    setRetSaving(false);
  };

  const pruneNow = async () => {
    setRetSaving(true);
    setRetMessage(null);
    const r = await jpost<{
      ok: boolean;
      info: ArchiveRetentionInfo;
      prune: { deletedFiles: string[]; deletedBytes: number };
    }>("/prune-archives", {});
    if (r?.info) {
      setRetention(r.info);
      const deleted = r.prune?.deletedFiles?.length ?? 0;
      setRetMessage(
        deleted > 0
          ? `Pruned ${deleted} old archive file(s).`
          : "Nothing to prune.",
      );
      const archRes = await jget<{ ok: boolean; archives: ArchiveEntry[] }>("/archives");
      if (archRes?.archives) setArchives(archRes.archives);
    } else {
      setRetMessage("Could not prune. Please try again.");
    }
    setRetSaving(false);
  };

  const saveCap = async () => {
    if (!historyCap) return;
    const parsed = Number.parseInt(capInput, 10);
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < historyCap.minCap ||
      parsed > historyCap.maxCap
    ) {
      setCapMessage(
        `Enter a whole number between ${historyCap.minCap} and ${historyCap.maxCap}.`,
      );
      return;
    }
    setCapSaving(true);
    setCapMessage(null);
    const r = await jpost<{
      ok: boolean;
      info: HistoryCapInfo;
      trimmedStates: number;
      trimmedEditArtifacts: number;
    }>("/history-cap", { cap: parsed });
    if (r?.info) {
      setHistoryCap(r.info);
      setCapInput(String(r.info.cap));
      const trimmed = (r.trimmedStates ?? 0) + (r.trimmedEditArtifacts ?? 0);
      setCapMessage(
        trimmed > 0
          ? `Saved. Trimmed ${r.trimmedStates} state(s) and ${r.trimmedEditArtifacts} edit artifact(s).`
          : "Saved.",
      );
    } else {
      setCapMessage("Could not save the new cap. Please try again.");
    }
    setCapSaving(false);
  };

  const clearHistory = async (scope: "states" | "edit_artifacts" | "both") => {
    const baseLabel =
      scope === "states" ? "preview studio states"
      : scope === "edit_artifacts" ? "edit artifacts"
      : "preview studio states AND edit artifacts";
    let olderThanIso: string | null = null;
    let scopeNote = "all ";
    if (olderThanDate) {
      const t = Date.parse(olderThanDate);
      if (!Number.isFinite(t)) {
        setClearMessage("Pick a valid date for the cutoff.");
        return;
      }
      olderThanIso = new Date(t).toISOString();
      scopeNote = "";
    }
    const cutoffNote = olderThanIso
      ? ` older than ${new Date(olderThanIso).toLocaleString()}`
      : "";
    let previewNote = "";
    if (olderThanIso) {
      const dry = await jpost<{
        ok: boolean;
        matchingStates: number;
        matchingEditArtifacts: number;
      }>("/clear-history", { scope, olderThanIso, dryRun: true });
      if (!dry?.ok) {
        setClearMessage("Could not load preview counts. Try again before clearing.");
        return;
      }
      const parts: string[] = [];
      if (scope === "states" || scope === "both") {
        parts.push(`${dry.matchingStates} state(s)`);
      }
      if (scope === "edit_artifacts" || scope === "both") {
        parts.push(`${dry.matchingEditArtifacts} edit artifact(s)`);
      }
      previewNote = `\n\nThis will remove ${parts.join(" and ")}.`;
      const totalMatches =
        (scope === "states" || scope === "both" ? dry.matchingStates : 0) +
        (scope === "edit_artifacts" || scope === "both" ? dry.matchingEditArtifacts : 0);
      if (totalMatches === 0) {
        setClearMessage("Nothing matches the cutoff — no entries to remove.");
        return;
      }
    }
    if (!window.confirm(
      `This will permanently delete ${scopeNote}${baseLabel}${cutoffNote}.${previewNote}\n\nContinue?`,
    )) return;
    setClearing(scope);
    setClearMessage(null);
    const r = await jpost<{
      ok: boolean;
      clearedStates: number;
      clearedEditArtifacts: number;
      olderThanIso: string | null;
      info: HistoryCapInfo;
      archiveFile: string | null;
    }>("/clear-history", olderThanIso ? { scope, olderThanIso } : { scope });
    if (r?.ok) {
      const cutoffSuffix = r.olderThanIso
        ? ` older than ${new Date(r.olderThanIso).toLocaleString()}`
        : "";
      setClearMessage(
        r.archiveFile
          ? `Cleared ${r.clearedStates} state(s) and ${r.clearedEditArtifacts} edit artifact(s)${cutoffSuffix}. Archived to ${r.archiveFile}.`
          : `Cleared ${r.clearedStates} state(s) and ${r.clearedEditArtifacts} edit artifact(s)${cutoffSuffix}.`,
      );
      if (r.info) {
        setHistoryCap(r.info);
        setCapInput(String(r.info.cap));
      }
      if (!r.olderThanIso) {
        if (scope === "states" || scope === "both") {
          setState(null);
        }
        if (scope === "edit_artifacts" || scope === "both") {
          setEditArtifacts([]);
        }
      }
      // For date-filtered clears we intentionally do NOT re-fetch /state:
      // it would auto-create a fresh default state if everything was
      // trimmed, and the currently displayed state is the latest one the
      // admin just generated, which is almost never older than the cutoff.
      // Intentionally do NOT call refresh() here: /state auto-creates a
      // fresh default state, which would make "states cleared" instantly
      // show 1 stored state and confuse admins. Re-fetch only the cap
      // info, artifact list, and archives so the panel reflects the clear.
      const [capRes, artRes, archRes] = await Promise.all([
        jget<{ ok: boolean; info: HistoryCapInfo }>("/history-cap"),
        jget<{ ok: boolean; artifacts: EditArtifact[] }>("/edit-artifacts"),
        jget<{ ok: boolean; archives: ArchiveEntry[] }>("/archives"),
      ]);
      if (capRes?.info) {
        setHistoryCap(capRes.info);
        setCapInput(String(capRes.info.cap));
      }
      if (artRes?.artifacts) setEditArtifacts(artRes.artifacts);
      if (archRes?.archives) setArchives(archRes.archives);
      await refreshUndoStatus();
    } else {
      setClearMessage("Could not clear history. Please try again.");
    }
    setClearing(null);
  };

  const undoClear = async () => {
    if (!undoStatus?.available || undoing) return;
    setUndoing(true);
    const r = await jpost<{
      ok: boolean;
      scope: "states" | "edit_artifacts" | "both";
      restoredStates: number;
      restoredEditArtifacts: number;
      trimmedStates: number;
      trimmedEditArtifacts: number;
      info: HistoryCapInfo;
    }>("/clear-undo", {});
    if (r?.ok) {
      const trimNote =
        (r.trimmedStates ?? 0) + (r.trimmedEditArtifacts ?? 0) > 0
          ? ` (${r.trimmedStates} state(s) and ${r.trimmedEditArtifacts} edit artifact(s) trimmed by current cap)`
          : "";
      setClearMessage(
        `Undid last clear: restored ${r.restoredStates} state(s) and ${r.restoredEditArtifacts} edit artifact(s)${trimNote}.`,
      );
      if (r.info) {
        setHistoryCap(r.info);
        setCapInput(String(r.info.cap));
      }
      // Only re-fetch /state when state-scope entries were actually
      // restored. /state auto-creates a fresh default when none exist,
      // which would be a confusing side effect for an artifact-only undo.
      const shouldRefetchState = (r.restoredStates ?? 0) > 0;
      const [sRes, artRes, archRes, uRes] = await Promise.all([
        shouldRefetchState
          ? jget<{ ok: boolean; state: PsvState }>("/state")
          : Promise.resolve(null),
        jget<{ ok: boolean; artifacts: EditArtifact[] }>("/edit-artifacts"),
        jget<{ ok: boolean; archives: ArchiveEntry[] }>("/archives"),
        jget<{ ok: boolean; status: NonNullable<typeof undoStatus> }>("/clear-undo"),
      ]);
      if (sRes?.state) {
        setState(sRes.state);
        setMode(sRes.state.scene.controls.mode);
      }
      if (artRes?.artifacts) setEditArtifacts(artRes.artifacts);
      if (archRes?.archives) setArchives(archRes.archives);
      setUndoStatus(uRes?.status ?? null);
    } else {
      setClearMessage("Could not undo — the grace window may have expired.");
      await refreshUndoStatus();
    }
    setUndoing(false);
  };

  const resetCap = async () => {
    setCapSaving(true);
    setCapMessage(null);
    const r = await jpost<{ ok: boolean; info: HistoryCapInfo }>("/history-cap", {
      reset: true,
    });
    if (r?.info) {
      setHistoryCap(r.info);
      setCapInput(String(r.info.cap));
      setCapMessage("Reset to default / environment value.");
    } else {
      setCapMessage("Could not reset the cap. Please try again.");
    }
    setCapSaving(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!undoStatus?.available || !undoStatus.expiresAt) {
      setUndoCountdown(0);
      return;
    }
    const expiry = Date.parse(undoStatus.expiresAt);
    if (!Number.isFinite(expiry)) {
      setUndoCountdown(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
      setUndoCountdown(remaining);
      if (remaining === 0) {
        setUndoStatus((prev) => (prev ? { ...prev, available: false } : prev));
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [undoStatus?.available, undoStatus?.expiresAt]);

  useEffect(() => {
    if (!olderThanDate) {
      setClearPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    const t = Date.parse(olderThanDate);
    if (!Number.isFinite(t)) {
      setClearPreview(null);
      setPreviewError("Invalid cutoff date.");
      setPreviewLoading(false);
      return;
    }
    const olderThanIso = new Date(t).toISOString();
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = window.setTimeout(async () => {
      const r = await jpost<{
        ok: boolean;
        scope: "both";
        matchingStates: number;
        matchingEditArtifacts: number;
        olderThanIso: string | null;
      }>("/clear-history", { scope: "both", olderThanIso, dryRun: true });
      if (cancelled) return;
      if (r?.ok) {
        setClearPreview({
          scope: "both",
          matchingStates: r.matchingStates ?? 0,
          matchingEditArtifacts: r.matchingEditArtifacts ?? 0,
          olderThanIso: r.olderThanIso ?? olderThanIso,
        });
        setPreviewError(null);
      } else {
        setClearPreview(null);
        setPreviewError("Could not load preview.");
      }
      setPreviewLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [olderThanDate]);

  const updateLayer = (id: string, patch: Partial<EditLayer>) => {
    setEditLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const removeLayer = (id: string) => {
    setEditLayers((ls) => ls.filter((l) => l.id !== id));
  };
  const addLayer = (kind: LayerKind) => {
    setEditLayers((ls) => [...ls, defaultLayer(kind)]);
  };
  const toggleAsset = (pid: string) => {
    setEditAssetIds((ids) =>
      ids.includes(pid) ? ids.filter((x) => x !== pid) : [...ids, pid],
    );
  };

  const compose = async (kind: "image" | "video") => {
    setComposing(true);
    const path = kind === "image" ? "/compose-image" : "/compose-video-clip";
    const base: ComposeImageRequest = {
      label: editLabel || "Untitled edit",
      sourceAssetIds: editAssetIds,
      layers: editLayers.map((l) => ({
        id: l.id, label: l.label, kind: l.kind,
        sourceAssetId: l.sourceAssetId, x: l.x, y: l.y, w: l.w, h: l.h,
        opacity: l.opacity, text: l.text,
      })),
      camera: editCamera,
      lighting: editLighting,
      aspect: editAspect,
    };
    const body: ComposeImageRequest | ComposeVideoRequest =
      kind === "video" ? { ...base, durationSec: editDuration } : base;
    const r = await jpost<{ ok: boolean; artifact: EditArtifact }>(path, body);
    if (r?.artifact) {
      setEditArtifacts((a) => [r.artifact, ...a]);
    }
    setComposing(false);
  };

  const loadMode = async (m: PreviewMode) => {
    setMode(m);
    setLoading(true);
    const r = await jpost<{ ok: boolean; state: PsvState }>("/generate", {
      controls: { mode: m },
    });
    if (r?.state) setState(r.state);
    setLoading(false);
  };

  const update = async (partial: Partial<Scene["controls"]>) => {
    setLoading(true);
    const r = await jpost<{ ok: boolean; state: PsvState }>("/update-controls", {
      controls: partial,
    });
    if (r?.state) setState(r.state);
    setLoading(false);
  };

  const scene = state?.scene;

  const aspect = scene?.cameraFrame.aspect ?? "16:9";
  const aspectClass = useMemo(() => {
    if (aspect === "9:16") return "aspect-[9/16] max-h-[460px] mx-auto";
    if (aspect === "1:1") return "aspect-square max-w-[520px] mx-auto";
    if (aspect === "21:9") return "aspect-[21/9]";
    return "aspect-video";
  }, [aspect]);

  return (
    <TooltipProvider delayDuration={200}>
      <section
        data-testid="preview-studio-hero"
        className="border-b border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950/70 px-6 pt-6 pb-5"
      >
        {/* Title */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Film className="h-5 w-5 text-sky-400" />
              <Tip text={tipFor(tips, "preview_studio")}>
                <h2
                  data-testid="preview-studio-title"
                  className="text-xl font-bold tracking-tight bg-gradient-to-r from-sky-300 via-amber-200 to-rose-300 bg-clip-text text-transparent"
                >
                  Mougle Production Preview Studio
                </h2>
              </Tip>
            </div>
            <p
              data-testid="preview-studio-subtitle"
              className="text-xs text-slate-400 mt-1 max-w-2xl"
            >
              Admin-only 3D/4D development preview for rooms, avatars, panels,
              media packages, Unreal dry-run state, and 4D cue planning.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Tip text={tipFor(tips, "draft_internal_only")}>
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] uppercase tracking-wider">
                <ShieldAlert className="h-3 w-3 mr-1" /> Admin Preview Only
              </Badge>
            </Tip>
            <Tip text={tipFor(tips, "draft_internal_only")}>
              <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-300 text-[10px] uppercase tracking-wider">
                <ZapOff className="h-3 w-3 mr-1" /> Not Rendered
              </Badge>
            </Tip>
            <Tip text={tipFor(tips, "publishing_disabled")}>
              <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-300 text-[10px] uppercase tracking-wider">
                <ZapOff className="h-3 w-3 mr-1" /> Not Published
              </Badge>
            </Tip>
            <Tip text={tipFor(tips, "unreal_dry_run")}>
              <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-300 text-[10px] uppercase tracking-wider">
                <ZapOff className="h-3 w-3 mr-1" /> No Unreal Execution
              </Badge>
            </Tip>
            <Tip text={tipFor(tips, "fourd_sandbox")}>
              <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-300 text-[10px] uppercase tracking-wider">
                <ZapOff className="h-3 w-3 mr-1" /> No 4D Hardware
              </Badge>
            </Tip>
            <Tip text={tipFor(tips, "mock_mode")}>
              <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-300 text-[10px] uppercase tracking-wider">
                <ShieldCheck className="h-3 w-3 mr-1" /> Mock Mode
              </Badge>
            </Tip>
            <Button
              size="sm"
              variant="outline"
              data-testid="button-preview-studio-refresh"
              onClick={refresh}
              disabled={loading}
              className="border-slate-700 hover:border-sky-500/50"
            >
              <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Persistent safety strip */}
        <div
          data-testid="preview-studio-safety-strip"
          className="text-[11px] text-amber-300/90 border border-amber-500/30 bg-amber-500/5 rounded-md px-3 py-2 mb-3"
        >
          Admin Preview Only — Not Rendered, Not Published, No Unreal Execution, No 4D Hardware.
        </div>

        {/* History cap admin control */}
        <div
          data-testid="preview-studio-history-cap"
          className="text-[11px] text-slate-300 border border-slate-800 bg-slate-900/40 rounded-md px-3 py-2 mb-3 flex flex-wrap items-center gap-3"
        >
          <div className="flex items-center gap-1.5 text-slate-200">
            <History className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-semibold">History cap</span>
          </div>
          <div className="text-slate-400" data-testid="text-history-cap-current">
            Current: <span className="text-slate-100 font-mono">{historyCap?.cap ?? "…"}</span>
            {historyCap && (
              <>
                {" "}
                <span className="text-slate-500">
                  (default {historyCap.defaultCap}, source: {historyCap.source}
                  {historyCap.envCap ? `, env=${historyCap.envCap}` : ""})
                </span>
              </>
            )}
          </div>
          <div className="text-slate-400" data-testid="text-history-cap-usage">
            Stored: <span className="text-slate-100 font-mono">{historyCap?.states ?? 0}</span> state(s),{" "}
            <span className="text-slate-100 font-mono">{historyCap?.editArtifacts ?? 0}</span> edit artifact(s)
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <label className="text-slate-400" htmlFor="input-history-cap">New cap:</label>
            <input
              id="input-history-cap"
              data-testid="input-history-cap"
              type="number"
              min={historyCap?.minCap ?? 1}
              max={historyCap?.maxCap ?? 10000}
              step={1}
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              disabled={!historyCap || capSaving}
              className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px] font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              data-testid="button-history-cap-save"
              onClick={saveCap}
              disabled={!historyCap || capSaving}
              className="h-7 text-[11px] border-sky-700/60 hover:border-sky-500"
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="button-history-cap-reset"
              onClick={resetCap}
              disabled={!historyCap || capSaving || historyCap?.source === "default" || historyCap?.source === "env"}
              className="h-7 text-[11px]"
              title="Clear the admin override and fall back to the environment or default value"
            >
              Reset
            </Button>
          </div>
          {capMessage && (
            <div
              data-testid="text-history-cap-message"
              className="basis-full text-[11px] text-amber-300"
            >
              {capMessage}
            </div>
          )}
          <div className="basis-full flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60">
            <div className="flex items-center gap-1.5 text-slate-200">
              <Eraser className="h-3.5 w-3.5 text-rose-400" />
              <span className="font-semibold">Clear history</span>
            </div>
            <span className="text-slate-500">
              {olderThanDate
                ? "Only entries created before the cutoff will be removed."
                : "Permanently wipe stored entries."}
            </span>
            <div className="flex items-center gap-1.5">
              <label className="text-slate-400" htmlFor="input-clear-older-than">
                Older than:
              </label>
              <input
                id="input-clear-older-than"
                data-testid="input-clear-older-than"
                type="datetime-local"
                value={olderThanDate}
                onChange={(e) => setOlderThanDate(e.target.value)}
                disabled={clearing !== null}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px] font-mono"
                title="Optional. If set, only entries created before this date/time will be cleared."
              />
              {olderThanDate && (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="button-clear-older-than-reset"
                  onClick={() => setOlderThanDate("")}
                  disabled={clearing !== null}
                  className="h-7 text-[11px]"
                  title="Clear the cutoff and wipe all entries again"
                >
                  Clear date
                </Button>
              )}
            </div>
            {olderThanDate && (
              <div
                data-testid="text-clear-history-preview"
                className="basis-full text-[11px] text-slate-300"
              >
                {previewError ? (
                  <span className="text-rose-300">{previewError}</span>
                ) : previewLoading || !clearPreview ? (
                  <span className="text-slate-500">Calculating preview…</span>
                ) : (
                  <>
                    Will remove{" "}
                    <span className="text-slate-100 font-mono" data-testid="text-clear-preview-states">
                      {clearPreview.matchingStates}
                    </span>{" "}
                    state(s) and{" "}
                    <span className="text-slate-100 font-mono" data-testid="text-clear-preview-artifacts">
                      {clearPreview.matchingEditArtifacts}
                    </span>{" "}
                    edit artifact(s) created before{" "}
                    <span className="text-slate-200">
                      {new Date(clearPreview.olderThanIso ?? olderThanDate).toLocaleString()}
                    </span>
                    .
                    {clearPreview.matchingStates === 0 && clearPreview.matchingEditArtifacts === 0 && (
                      <span className="text-amber-300"> Nothing matches this cutoff.</span>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                size="sm"
                variant="outline"
                data-testid="button-clear-history-states"
                onClick={() => clearHistory("states")}
                disabled={clearing !== null || (historyCap?.states ?? 0) === 0}
                className="h-7 text-[11px] border-rose-700/60 hover:border-rose-500 text-rose-200"
                title={
                  olderThanDate
                    ? "Delete preview studio states created before the cutoff"
                    : "Delete every persisted preview studio state"
                }
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {olderThanDate ? "Clear old states" : "Clear states"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="button-clear-history-artifacts"
                onClick={() => clearHistory("edit_artifacts")}
                disabled={clearing !== null || (historyCap?.editArtifacts ?? 0) === 0}
                className="h-7 text-[11px] border-rose-700/60 hover:border-rose-500 text-rose-200"
                title={
                  olderThanDate
                    ? "Delete edit artifacts created before the cutoff"
                    : "Delete every persisted edit artifact"
                }
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {olderThanDate ? "Clear old edit artifacts" : "Clear edit artifacts"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="button-clear-history-both"
                onClick={() => clearHistory("both")}
                disabled={
                  clearing !== null ||
                  ((historyCap?.states ?? 0) === 0 && (historyCap?.editArtifacts ?? 0) === 0)
                }
                className="h-7 text-[11px] border-rose-700/60 hover:border-rose-500 text-rose-200"
                title={
                  olderThanDate
                    ? "Delete states and edit artifacts created before the cutoff"
                    : "Delete both preview studio states and edit artifacts"
                }
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {olderThanDate ? "Clear old (both)" : "Clear both"}
              </Button>
            </div>
            {clearMessage && (
              <div
                data-testid="text-clear-history-message"
                className="basis-full text-[11px] text-rose-300"
              >
                {clearMessage}
              </div>
            )}
            {undoStatus?.available && undoCountdown > 0 && (
              <div
                data-testid="row-clear-undo"
                className="basis-full flex flex-wrap items-center gap-2 text-[11px] text-emerald-200 bg-emerald-950/30 border border-emerald-800/60 rounded px-2 py-1.5"
              >
                <Undo2 className="h-3.5 w-3.5 text-emerald-300" />
                <span>
                  Last clear ({undoStatus.scope?.replace("_", " ")}
                  {undoStatus.olderThanIso
                    ? ` older than ${new Date(undoStatus.olderThanIso).toLocaleString()}`
                    : ""}
                  ) removed{" "}
                  <span data-testid="text-clear-undo-states" className="font-mono text-slate-100">
                    {undoStatus.snapshotStates}
                  </span>{" "}
                  state(s) and{" "}
                  <span data-testid="text-clear-undo-artifacts" className="font-mono text-slate-100">
                    {undoStatus.snapshotEditArtifacts}
                  </span>{" "}
                  edit artifact(s).
                </span>
                <span
                  data-testid="text-clear-undo-countdown"
                  className="font-mono text-emerald-300"
                  title="Time remaining to undo the last clear"
                >
                  {undoCountdown}s
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="button-clear-undo"
                  onClick={undoClear}
                  disabled={undoing || clearing !== null}
                  className="h-7 text-[11px] ml-auto border-emerald-700/60 hover:border-emerald-500 text-emerald-100"
                  title="Restore the entries removed by the most recent clear"
                >
                  <Undo2 className="h-3 w-3 mr-1" />
                  {undoing ? "Undoing…" : "Undo last clear"}
                </Button>
              </div>
            )}
          </div>
          <div
            data-testid="preview-studio-archive-retention"
            className="basis-full flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/60"
          >
            <div className="flex items-center gap-1.5 text-slate-200">
              <Archive className="h-3.5 w-3.5 text-sky-400" />
              <span className="font-semibold">Archive retention</span>
            </div>
            <div className="text-slate-400" data-testid="text-archive-retention-current">
              Current:{" "}
              <span className="text-slate-100 font-mono">{retention?.maxCount ?? "…"}</span> file(s),{" "}
              <span className="text-slate-100 font-mono">{retention?.maxAgeDays ?? "…"}</span> day(s)
              {retention && (
                <>
                  {" "}
                  <span className="text-slate-500">
                    (default {retention.defaultCount}/{retention.defaultDays}d, source:
                    {" "}files={retention.countSource}{retention.envCount ? `(env=${retention.envCount})` : ""},
                    {" "}age={retention.daysSource}{retention.envDays ? `(env=${retention.envDays})` : ""})
                  </span>
                </>
              )}
            </div>
            <div className="text-slate-400" data-testid="text-archive-retention-usage">
              Stored:{" "}
              <span className="text-slate-100 font-mono">{retention?.archiveFiles ?? 0}</span> file(s),{" "}
              <span
                className={`font-mono ${
                  retention?.storageThresholdExceeded ? "text-amber-300" : "text-slate-100"
                }`}
                data-testid="text-archive-storage-usage-mb"
              >
                {retention ? (retention.archiveBytes / (1024 * 1024)).toFixed(2) : "0.00"}
              </span>{" "}
              MB
              {retention && (
                <>
                  {" / "}
                  <span className="text-slate-100 font-mono" data-testid="text-archive-storage-threshold-mb">
                    {retention.storageThresholdMb}
                  </span>{" "}
                  MB threshold{" "}
                  <span
                    className="text-slate-500"
                    data-testid="text-archive-storage-usage-percent"
                  >
                    ({retention.storageUsagePercent}% used, src={retention.storageThresholdSource}
                    {retention.envStorageThresholdMb ? `(env=${retention.envStorageThresholdMb})` : ""})
                  </span>
                </>
              )}
            </div>
            {retention?.storageThresholdExceeded && (
              <div
                data-testid="banner-archive-storage-threshold-exceeded"
                className="basis-full flex items-center gap-2 text-[11px] text-amber-200 bg-amber-950/40 border border-amber-700/60 rounded px-2 py-1.5"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                <span>
                  Archive storage is using{" "}
                  <span className="font-mono text-amber-100">
                    {(retention.archiveBytes / (1024 * 1024)).toFixed(2)} MB
                  </span>{" "}
                  — over the{" "}
                  <span className="font-mono text-amber-100">
                    {retention.storageThresholdMb} MB
                  </span>{" "}
                  warning threshold ({retention.storageUsagePercent}%). Lower the file/age limits, raise the threshold, or prune now to free disk space.
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <label className="text-slate-400" htmlFor="input-archive-retention-count">
                Max files:
              </label>
              <input
                id="input-archive-retention-count"
                data-testid="input-archive-retention-count"
                type="number"
                min={retention?.minCount ?? 1}
                max={retention?.maxCountLimit ?? 10000}
                step={1}
                value={retCountInput}
                onChange={(e) => setRetCountInput(e.target.value)}
                disabled={!retention || retSaving}
                className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px] font-mono"
              />
              <label className="text-slate-400" htmlFor="input-archive-retention-days">
                Max age (days):
              </label>
              <input
                id="input-archive-retention-days"
                data-testid="input-archive-retention-days"
                type="number"
                min={retention?.minDays ?? 1}
                max={retention?.maxDaysLimit ?? 3650}
                step={1}
                value={retDaysInput}
                onChange={(e) => setRetDaysInput(e.target.value)}
                disabled={!retention || retSaving}
                className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px] font-mono"
              />
              <label className="text-slate-400" htmlFor="input-archive-storage-threshold-mb">
                Warn at (MB):
              </label>
              <input
                id="input-archive-storage-threshold-mb"
                data-testid="input-archive-storage-threshold-mb"
                type="number"
                min={retention?.minStorageThresholdMb ?? 1}
                max={retention?.maxStorageThresholdMbLimit ?? 100000}
                step={1}
                value={retThresholdInput}
                onChange={(e) => setRetThresholdInput(e.target.value)}
                disabled={!retention || retSaving}
                className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px] font-mono"
                title="Show a warning banner once stored archive bytes cross this threshold (MB)."
              />
              <Button
                size="sm"
                variant="outline"
                data-testid="button-archive-retention-save"
                onClick={saveRetention}
                disabled={!retention || retSaving}
                className="h-7 text-[11px] border-sky-700/60 hover:border-sky-500"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid="button-archive-retention-reset"
                onClick={resetRetention}
                disabled={
                  !retention ||
                  retSaving ||
                  (retention.countSource !== "admin" &&
                    retention.daysSource !== "admin" &&
                    retention.storageThresholdSource !== "admin")
                }
                className="h-7 text-[11px]"
                title="Clear admin overrides and fall back to environment or default values"
              >
                Reset
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="button-archive-prune-now"
                onClick={pruneNow}
                disabled={!retention || retSaving || (retention?.archiveFiles ?? 0) === 0}
                className="h-7 text-[11px] border-rose-700/60 hover:border-rose-500 text-rose-200"
                title="Apply the current retention settings now and delete any files past the count or age limit"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Prune now
              </Button>
            </div>
            {retMessage && (
              <div
                data-testid="text-archive-retention-message"
                className="basis-full text-[11px] text-amber-300"
              >
                {retMessage}
              </div>
            )}
          </div>
          <div
            data-testid="preview-studio-archives"
            className="basis-full flex flex-col gap-1.5 pt-2 border-t border-slate-800/60"
          >
            <div className="flex items-center gap-1.5 text-slate-200">
              <Archive className="h-3.5 w-3.5 text-sky-400" />
              <span className="font-semibold">Recent archives</span>
              <span className="text-slate-500">
                Snapshots written before each clear. Admin-only, never public.
              </span>
            </div>
            {archives.length === 0 ? (
              <div
                data-testid="text-archives-empty"
                className="text-[11px] text-slate-500 italic"
              >
                No archives yet — none will be created until you clear history.
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {archives.slice(0, 10).map((a) => (
                  <li
                    key={a.filename}
                    data-testid={`row-archive-${a.filename}`}
                    className="flex items-center gap-2 text-[11px] text-slate-300 border border-slate-800/70 bg-slate-900/30 rounded px-2 py-1"
                  >
                    <Badge
                      variant="outline"
                      className="border-slate-700 text-[9px] uppercase tracking-wider text-slate-300"
                    >
                      {a.scope}
                    </Badge>
                    <span
                      className="font-mono text-slate-400 truncate"
                      data-testid={`text-archive-name-${a.filename}`}
                      title={a.filename}
                    >
                      {a.filename}
                    </span>
                    <span
                      className="text-slate-500 ml-auto"
                      data-testid={`text-archive-meta-${a.filename}`}
                    >
                      {new Date(a.createdAt).toLocaleString()} ·{" "}
                      {(a.byteSize / 1024).toFixed(1)} KB
                    </span>
                    <a
                      href={`${PSV_API}/archives/${encodeURIComponent(a.filename)}`}
                      download={a.filename}
                      data-testid={`link-archive-download-${a.filename}`}
                      className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 border border-sky-700/50 hover:border-sky-500 rounded px-1.5 py-0.5"
                    >
                      <Download className="h-3 w-3" /> Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Tabs: Studio / Edit */}
        <div
          data-testid="preview-studio-tabs"
          className="flex items-center gap-1 mb-4 border-b border-slate-800"
        >
          <button
            data-testid="tab-studio"
            onClick={() => setTab("studio")}
            className={`text-xs px-3 py-1.5 -mb-px border-b-2 transition flex items-center gap-1.5 ${
              tab === "studio"
                ? "border-sky-400 text-sky-200"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Film className="h-3.5 w-3.5" /> Studio
          </button>
          <button
            data-testid="tab-edit"
            onClick={() => setTab("edit")}
            className={`text-xs px-3 py-1.5 -mb-px border-b-2 transition flex items-center gap-1.5 ${
              tab === "edit"
                ? "border-sky-400 text-sky-200"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> Edit
            <Badge
              variant="outline"
              className="ml-1 border-amber-500/40 bg-amber-500/10 text-amber-300 text-[9px] uppercase tracking-wider px-1 py-0"
            >
              Draft
            </Badge>
          </button>
        </div>

        {tab === "edit" ? (
          <EditTab
            tips={tips}
            label={editLabel}
            onLabelChange={setEditLabel}
            layers={editLayers}
            updateLayer={updateLayer}
            removeLayer={removeLayer}
            addLayer={addLayer}
            assetIds={editAssetIds}
            toggleAsset={toggleAsset}
            mediaPackages={mediaPackages}
            camera={editCamera}
            onCameraChange={setEditCamera}
            lighting={editLighting}
            onLightingChange={setEditLighting}
            aspect={editAspect}
            onAspectChange={setEditAspect}
            durationSec={editDuration}
            onDurationChange={setEditDuration}
            artifacts={editArtifacts}
            composing={composing}
            onCompose={compose}
          />
        ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* Left rail */}
          <aside
            data-testid="preview-studio-rail"
            className="col-span-12 md:col-span-3 space-y-3"
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Wand2 className="h-3 w-3" /> Preview Mode
              </div>
              <div className="grid grid-cols-1 gap-1">
                {MODES.map((m) => (
                  <Tip key={m.id} text={m.tip}>
                    <button
                      data-testid={`mode-${m.id}`}
                      onClick={() => loadMode(m.id)}
                      className={`text-left text-xs px-2.5 py-1.5 rounded-md border transition ${
                        mode === m.id
                          ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                          : "border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900/40"
                      }`}
                    >
                      {m.label}
                    </button>
                  </Tip>
                ))}
              </div>
            </div>

            {scene && (
              <>
                <RailSelect
                  testid="select-layout"
                  icon={<Layers className="h-3 w-3" />}
                  label="Layout Preset"
                  value={scene.controls.layoutPreset}
                  options={[...LAYOUT_PRESETS]}
                  onChange={(v) => update({ layoutPreset: v })}
                />
                <RailSelect
                  testid="select-camera"
                  icon={<Camera className="h-3 w-3" />}
                  label="Camera"
                  value={scene.controls.camera}
                  options={[...CAMERA_PRESETS]}
                  onChange={(v) => update({ camera: v })}
                />
                <RailSelect
                  testid="select-lighting"
                  icon={<Lightbulb className="h-3 w-3" />}
                  label="Lighting"
                  value={scene.controls.lighting}
                  options={[...LIGHTING_PRESETS]}
                  onChange={(v) => update({ lighting: v })}
                />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                    <Tv2 className="h-3 w-3" /> Overlays
                  </div>
                  <div className="space-y-1 text-xs">
                    <ToggleRow
                      testid="toggle-led"
                      label="LED Wall"
                      value={scene.controls.showLedWall}
                      onChange={(v) => update({ showLedWall: v })}
                    />
                    <ToggleRow
                      testid="toggle-lower-third"
                      label="Lower Third"
                      value={scene.controls.showLowerThird}
                      onChange={(v) => update({ showLowerThird: v })}
                    />
                    <ToggleRow
                      testid="toggle-ticker"
                      label="Ticker"
                      value={scene.controls.showTicker}
                      onChange={(v) => update({ showTicker: v })}
                    />
                    <ToggleRow
                      testid="toggle-4d"
                      label="4D Cue Markers"
                      value={scene.controls.show4dMarkers}
                      onChange={(v) => update({ show4dMarkers: v })}
                    />
                  </div>
                </div>
              </>
            )}
          </aside>

          {/* Canvas */}
          <div className="col-span-12 md:col-span-6 space-y-2">
            <div
              data-testid="preview-studio-canvas"
              className={`relative w-full rounded-lg border border-slate-800 bg-[radial-gradient(circle_at_center,#0f172a_0%,#020617_70%)] overflow-hidden ${aspectClass}`}
              style={{ boxShadow: scene ? `inset 0 0 80px ${scene.lightingMood.accent}22` : undefined }}
            >
              {scene ? (
                <>
                  {/* LED wall + panels */}
                  {scene.panels.map((p) => {
                    const visible =
                      (p.kind === "ledwall" && scene.controls.showLedWall) ||
                      (p.kind === "lower_third" && scene.controls.showLowerThird) ||
                      (p.kind === "ticker" && scene.controls.showTicker) ||
                      (p.kind !== "ledwall" && p.kind !== "lower_third" && p.kind !== "ticker");
                    if (!visible) return null;
                    return (
                      <div
                        key={p.id}
                        data-testid={`panel-${p.id}`}
                        className={`absolute border text-[10px] flex items-center justify-center uppercase tracking-wider ${
                          p.kind === "ledwall"
                            ? "border-sky-500/40 bg-sky-500/5 text-sky-200/80"
                            : p.kind === "ticker"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                            : p.kind === "lower_third"
                            ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                            : "border-slate-600/50 bg-slate-800/40 text-slate-300"
                        }`}
                        style={{
                          left: `${p.x * 100}%`,
                          top: `${p.y * 100}%`,
                          width: `${p.w * 100}%`,
                          height: `${p.h * 100}%`,
                        }}
                      >
                        {p.kind === "ticker"
                          ? scene.controls.tickerText || p.label
                          : p.kind === "lower_third"
                          ? scene.controls.lowerThirdText || p.label
                          : p.label}
                      </div>
                    );
                  })}

                  {/* Avatar markers */}
                  {scene.avatars.map((a) => (
                    <div
                      key={a.id}
                      data-testid={`avatar-${a.id}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
                    >
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 border-2 border-slate-100/70 flex items-center justify-center text-[10px] font-bold text-slate-900 shadow-lg">
                        {a.label.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-[9px] text-center text-slate-200 mt-1 font-medium">
                        {a.label}
                      </div>
                    </div>
                  ))}

                  {/* Camera frame badge */}
                  <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-md bg-slate-900/80 border border-slate-700 text-slate-200 flex items-center gap-1">
                    <Camera className="h-3 w-3" />
                    {scene.cameraFrame.label} • {scene.cameraFrame.aspect}
                  </div>
                  {/* Lighting badge */}
                  <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-md bg-slate-900/80 border border-slate-700 text-slate-200 flex items-center gap-1">
                    <Lightbulb className="h-3 w-3" />
                    {scene.controls.lighting}
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
                  Loading preview…
                </div>
              )}
            </div>

            {/* Timeline strip */}
            <div
              data-testid="preview-studio-timeline"
              className="rounded-md border border-slate-800 bg-slate-900/40 px-2 py-1.5"
            >
              <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                <span>Timeline</span>
                <span>Media • 4D • Camera • Panels</span>
              </div>
              <div className="relative h-6 bg-slate-950/60 rounded">
                {scene?.controls.show4dMarkers &&
                  scene.fourDCues.map((c) => (
                    <Tip key={c.id} text={`${c.label} @ ${c.tSec}s (${c.effect})`}>
                      <div
                        data-testid={`cue-${c.id}`}
                        className="absolute top-0 bottom-0 w-1 bg-rose-400/80"
                        style={{ left: `${Math.min(100, (c.tSec / 60) * 100)}%` }}
                      />
                    </Tip>
                  ))}
              </div>
            </div>
          </div>

          {/* Right inspector */}
          <aside
            data-testid="preview-studio-inspector"
            className="col-span-12 md:col-span-3 space-y-3 text-xs"
          >
            <InspectorBlock title="Room / Stage">
              <Row k="Room" v={scene?.controls.roomLabel ?? "—"} />
              <Row k="Mode" v={scene?.controls.mode ?? "—"} />
              <Row k="Layout" v={scene?.controls.layoutPreset ?? "—"} />
              <Row k="Aspect" v={scene?.cameraFrame.aspect ?? "—"} />
            </InspectorBlock>
            <InspectorBlock title="Avatars">
              {scene?.avatars.length
                ? scene.avatars.map((a) => (
                    <Row key={a.id} k={a.label} v={a.role ?? ""} />
                  ))
                : <div className="text-slate-500">none</div>}
            </InspectorBlock>
            <InspectorBlock title="Panels">
              {scene?.panels.map((p) => (
                <Row key={p.id} k={p.label} v={p.kind} />
              ))}
            </InspectorBlock>
            <InspectorBlock title="4D Cues">
              {scene?.fourDCues.length
                ? scene.fourDCues.map((c) => (
                    <Row key={c.id} k={`${c.tSec}s`} v={`${c.label} (${c.effect})`} />
                  ))
                : <div className="text-slate-500">none</div>}
            </InspectorBlock>
            <InspectorBlock title="Safety">
              <Row k="status" v={state?.status ?? "draft"} />
              <Row k="visibility" v={state?.visibility ?? "admin_only_internal"} />
              <Row k="publicUrl" v="null" />
              <Row k="signedUrl" v="null" />
              <Row k="realSendAllowed" v="false" />
              <Row k="executionEnabled" v="false" />
            </InspectorBlock>
          </aside>
        </div>
        )}
      </section>
    </TooltipProvider>
  );
}

interface EditTabProps {
  tips: TipData[] | null;
  label: string;
  onLabelChange: (v: string) => void;
  layers: EditLayer[];
  updateLayer: (id: string, patch: Partial<EditLayer>) => void;
  removeLayer: (id: string) => void;
  addLayer: (kind: LayerKind) => void;
  assetIds: string[];
  toggleAsset: (id: string) => void;
  mediaPackages: MediaPackageLite[];
  camera: string;
  onCameraChange: (v: string) => void;
  lighting: string;
  onLightingChange: (v: string) => void;
  aspect: string;
  onAspectChange: (v: string) => void;
  durationSec: number;
  onDurationChange: (v: number) => void;
  artifacts: EditArtifact[];
  composing: boolean;
  onCompose: (kind: "image" | "video") => void;
}

function EditTab(props: EditTabProps) {
  const {
    label, onLabelChange, layers, updateLayer, removeLayer, addLayer,
    assetIds, toggleAsset, mediaPackages,
    camera, onCameraChange, lighting, onLightingChange,
    aspect, onAspectChange, durationSec, onDurationChange,
    artifacts, composing, onCompose,
  } = props;

  const previewAspectClass =
    aspect === "9:16" ? "aspect-[9/16] max-h-[420px] mx-auto" :
    aspect === "1:1" ? "aspect-square max-w-[460px] mx-auto" :
    aspect === "21:9" ? "aspect-[21/9]" : "aspect-video";

  return (
    <div data-testid="preview-studio-edit" className="grid grid-cols-12 gap-4">
      {/* Left: layer + asset controls */}
      <aside className="col-span-12 md:col-span-4 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            Edit label
          </div>
          <input
            data-testid="input-edit-label"
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Untitled edit"
            className="w-full text-xs px-2 py-1.5 rounded-md border border-slate-800 bg-slate-950 text-slate-200"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers className="h-3 w-3" /> Layers
            </div>
            <select
              data-testid="select-add-layer"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  addLayer(e.target.value as LayerKind);
                  e.target.value = "";
                }
              }}
              className="text-[10px] px-1.5 py-0.5 rounded border border-slate-800 bg-slate-950 text-slate-300"
            >
              <option value="">+ Add layer…</option>
              {LAYER_KINDS.map((k) => (
                <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {layers.length === 0 && (
              <div className="text-[11px] text-slate-500 italic">
                No layers yet. Add one above.
              </div>
            )}
            {layers.map((l) => (
              <div
                key={l.id}
                data-testid={`edit-layer-${l.id}`}
                className="rounded-md border border-slate-800 bg-slate-900/50 p-2 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-1">
                  <Badge
                    variant="outline"
                    className="border-slate-700 bg-slate-900/40 text-slate-300 text-[9px] uppercase tracking-wider"
                  >
                    {l.kind.replace(/_/g, " ")}
                  </Badge>
                  <input
                    data-testid={`input-layer-label-${l.id}`}
                    value={l.label}
                    onChange={(e) => updateLayer(l.id, { label: e.target.value })}
                    className="flex-1 text-[11px] px-1.5 py-0.5 rounded border border-slate-800 bg-slate-950 text-slate-200"
                  />
                  <button
                    data-testid={`button-remove-layer-${l.id}`}
                    onClick={() => removeLayer(l.id)}
                    className="text-rose-300 hover:text-rose-200 p-0.5"
                    aria-label="Remove layer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <input
                  data-testid={`input-layer-text-${l.id}`}
                  value={l.text}
                  onChange={(e) => updateLayer(l.id, { text: e.target.value })}
                  placeholder="Display text (optional)"
                  className="w-full text-[11px] px-1.5 py-0.5 rounded border border-slate-800 bg-slate-950 text-slate-200"
                />
                <div className="grid grid-cols-4 gap-1">
                  {(["x", "y", "w", "h"] as const).map((k) => (
                    <label key={k} className="text-[9px] text-slate-500 uppercase">
                      {k}
                      <input
                        type="number"
                        step={0.05}
                        min={0}
                        max={1}
                        data-testid={`input-layer-${k}-${l.id}`}
                        value={l[k]}
                        onChange={(e) =>
                          updateLayer(l.id, { [k]: Math.min(1, Math.max(0, Number(e.target.value) || 0)) } as Partial<EditLayer>)
                        }
                        className="w-full text-[11px] px-1 py-0.5 rounded border border-slate-800 bg-slate-950 text-slate-200"
                      />
                    </label>
                  ))}
                </div>
                <label className="block text-[9px] text-slate-500 uppercase">
                  Opacity
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    data-testid={`input-layer-opacity-${l.id}`}
                    value={l.opacity}
                    onChange={(e) => updateLayer(l.id, { opacity: Number(e.target.value) })}
                    className="w-full"
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            Source draft assets ({assetIds.length} selected)
          </div>
          <div
            data-testid="edit-asset-picker"
            className="max-h-44 overflow-y-auto space-y-1 rounded-md border border-slate-800 bg-slate-900/40 p-1.5"
          >
            {mediaPackages.length === 0 && (
              <div className="text-[11px] text-slate-500 italic px-1">
                No draft media packages available.
              </div>
            )}
            {mediaPackages.map((p) => {
              const checked = assetIds.includes(p.packageId);
              return (
                <button
                  key={p.packageId}
                  data-testid={`asset-pick-${p.packageId}`}
                  onClick={() => toggleAsset(p.packageId)}
                  className={`w-full text-left text-[11px] px-2 py-1 rounded border transition flex items-start gap-2 ${
                    checked
                      ? "border-sky-500/50 bg-sky-500/10 text-sky-100"
                      : "border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span className={`mt-0.5 inline-block h-3 w-3 rounded border ${checked ? "bg-sky-400 border-sky-400" : "border-slate-600"}`} />
                  <span className="flex-1">
                    <div className="font-medium">{p.sourceTopic || p.packageId}</div>
                    <div className="text-[10px] text-slate-500">
                      {p.packageType} • {p.targetFormat}
                    </div>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Center: live preview + compose buttons */}
      <div className="col-span-12 md:col-span-5 space-y-3">
        <div
          data-testid="edit-preview-canvas"
          className={`relative w-full rounded-lg border border-slate-800 bg-[radial-gradient(circle_at_center,#0f172a_0%,#020617_70%)] overflow-hidden ${previewAspectClass}`}
        >
          {layers.map((l) => (
            <div
              key={l.id}
              data-testid={`edit-preview-layer-${l.id}`}
              className={`absolute border text-[10px] flex items-center justify-center uppercase tracking-wider px-1 text-center ${
                l.kind === "background" ? "border-slate-700/40 bg-slate-800/20 text-slate-400" :
                l.kind === "avatar" ? "border-amber-500/50 bg-amber-500/10 text-amber-100" :
                l.kind === "ticker" ? "border-amber-500/40 bg-amber-500/10 text-amber-200" :
                l.kind === "lower_third" ? "border-rose-500/40 bg-rose-500/10 text-rose-200" :
                l.kind === "callout" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" :
                "border-sky-500/40 bg-sky-500/10 text-sky-200"
              }`}
              style={{
                left: `${l.x * 100}%`, top: `${l.y * 100}%`,
                width: `${l.w * 100}%`, height: `${l.h * 100}%`,
                opacity: l.opacity,
              }}
            >
              {l.text || l.label}
            </div>
          ))}
          <div className="absolute bottom-1 left-1 text-[9px] text-amber-300/90 bg-slate-950/80 border border-amber-500/40 rounded px-1.5 py-0.5 uppercase tracking-wider">
            Admin preview only
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid="button-compose-image"
            onClick={() => onCompose("image")}
            disabled={composing}
            className="bg-sky-600 hover:bg-sky-500 text-white"
          >
            <ImageIcon className="h-4 w-4 mr-1.5" />
            Compose Image
          </Button>
          <Button
            data-testid="button-compose-video"
            onClick={() => onCompose("video")}
            disabled={composing}
            className="bg-rose-600 hover:bg-rose-500 text-white"
          >
            <Video className="h-4 w-4 mr-1.5" />
            Compose Video Clip
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <RailSelect
            testid="select-edit-camera"
            icon={<Camera className="h-3 w-3" />}
            label="Camera"
            value={camera}
            options={[...CAMERA_PRESETS]}
            onChange={onCameraChange}
          />
          <RailSelect
            testid="select-edit-lighting"
            icon={<Lightbulb className="h-3 w-3" />}
            label="Lighting"
            value={lighting}
            options={[...LIGHTING_PRESETS]}
            onChange={onLightingChange}
          />
          <RailSelect
            testid="select-edit-aspect"
            icon={<Tv2 className="h-3 w-3" />}
            label="Aspect"
            value={aspect}
            options={[...ASPECTS]}
            onChange={onAspectChange}
          />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
              <Film className="h-3 w-3" /> Duration (sec)
            </div>
            <input
              type="number"
              min={1}
              max={30}
              data-testid="input-edit-duration"
              value={durationSec}
              onChange={(e) =>
                onDurationChange(Math.min(30, Math.max(1, Number(e.target.value) || 1)))
              }
              className="w-full text-xs px-2 py-1.5 rounded-md border border-slate-800 bg-slate-950 text-slate-200"
            />
          </div>
        </div>
      </div>

      {/* Right: artifacts list */}
      <aside
        data-testid="edit-artifacts-list"
        className="col-span-12 md:col-span-3 space-y-2 text-xs"
      >
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Edit artifacts
          </div>
          <span
            data-testid="edit-artifacts-count"
            className="text-[10px] text-slate-500"
          >
            {artifacts.length}
          </span>
        </div>
        {artifacts.length === 0 && (
          <div className="text-[11px] text-slate-500 italic rounded-md border border-dashed border-slate-800 p-2">
            No composed artifacts yet. Use the buttons to create one.
          </div>
        )}
        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
          {artifacts.map((a) => (
            <div
              key={a.id}
              data-testid={`edit-artifact-${a.id}`}
              className="rounded-md border border-slate-800 bg-slate-900/50 p-2 space-y-1"
            >
              <div className="flex items-center justify-between gap-1">
                <div className="font-medium text-slate-200 truncate">{a.label}</div>
                <Badge
                  variant="outline"
                  className={`text-[9px] uppercase tracking-wider ${
                    a.kind === "image_compose"
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-200"
                  }`}
                >
                  {a.kind === "image_compose" ? "Image" : "Video"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[9px] uppercase tracking-wider">
                  <ShieldAlert className="h-2.5 w-2.5 mr-0.5" /> Draft
                </Badge>
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[9px] uppercase tracking-wider">
                  Admin-only
                </Badge>
                <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-300 text-[9px] uppercase tracking-wider">
                  <ZapOff className="h-2.5 w-2.5 mr-0.5" /> Not published
                </Badge>
              </div>
              <div className="text-[10px] text-slate-400 space-y-0.5">
                <div>aspect: <span className="text-slate-200">{a.aspect}</span></div>
                <div>camera: <span className="text-slate-200">{a.camera}</span></div>
                <div>lighting: <span className="text-slate-200">{a.lighting}</span></div>
                {a.kind === "video_compose" && (
                  <div>duration: <span className="text-slate-200">{a.durationSec}s</span></div>
                )}
                <div>layers: <span className="text-slate-200">{a.layers.length}</span></div>
                <div>sources: <span className="text-slate-200">{a.sourceAssetIds.length}</span></div>
                <div className="text-rose-300/80">
                  publicUrl: <span data-testid={`artifact-publicUrl-${a.id}`}>{String(a.publicUrl)}</span>
                </div>
                <div className="text-rose-300/80">
                  signedUrl: <span data-testid={`artifact-signedUrl-${a.id}`}>{String(a.signedUrl)}</span>
                </div>
                <div className="text-rose-300/80">
                  realSendAllowed: <span data-testid={`artifact-realSendAllowed-${a.id}`}>{String(a.realSendAllowed)}</span>
                </div>
                <div className="text-rose-300/80">
                  executionEnabled: <span data-testid={`artifact-executionEnabled-${a.id}`}>{String(a.executionEnabled)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function RailSelect({
  testid, icon, label, value, options, onChange,
}: {
  testid: string; icon: React.ReactNode; label: string;
  value: string; options: string[];
  onChange: (v: any) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
        {icon} {label}
      </div>
      <select
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs px-2 py-1.5 rounded-md border border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ToggleRow({
  testid, label, value, onChange,
}: { testid: string; label: string; value: boolean; onChange: (v: boolean) => void; }) {
  return (
    <button
      data-testid={testid}
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between px-2 py-1 rounded border border-slate-800 hover:border-slate-700"
    >
      <span className="text-slate-300">{label}</span>
      <span className={value ? "text-emerald-300" : "text-slate-600"}>
        {value ? "ON" : "off"}
      </span>
    </button>
  );
}

function InspectorBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-slate-500">{k}</span>
      <span className="text-slate-200 truncate text-right">{v}</span>
    </div>
  );
}
