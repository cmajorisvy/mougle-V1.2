import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Tv2, Loader2, ShieldCheck, FileJson, PlayCircle, Upload, Crop, Trash2, X, Link2, AlertTriangle, BellOff, Bookmark, Star, Pencil, Check, Users2, Lock, Pin, PinOff, Clock, Plus, CalendarClock, Grid3x3, Info, Mail, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { CoverImageCropDialog } from "./CoverImageCropDialog";
import {
  scheduleMatchesNow,
  nextScheduleTransition,
  computeScheduleDiagnostics,
  computeWeeklyCoverageGrid,
  nextOccurrenceOfHour,
  suggestCoverageFix,
  buildScheduleFromGaps,
  selectFallbackGaps,
  applyNewFallbackViewFlow,
  type CoverageSuggestion,
  type CoverageSuggestionChange,
  type SavedViewScheduleShape,
  type ScheduleDiagnostics,
  getSuggestionChangeBounds,
  buildEditedSuggestionChange,
  applyCoverageChangesToSchedule,
  buildEditedSuggestionMap,
  validateEditedSuggestions,
  computeUncoveredOriginalGapWarnings,
  buildOriginalDayCoverageChanges,
} from "./broadcastSchedule";
import {
  isPreviewInPast,
  revertExpiredPreviewState,
  applyScheduledPreviewToUrl,
  shouldShowSharedPreviewBanner,
  previewExpiresSoon,
  PREVIEW_EXPIRES_SOON_THRESHOLD_MS,
  SCHEDULED_PREVIEW_URL_PARAM,
} from "./scheduledPreviewAutoRevert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfidenceLevel = "high" | "medium" | "low";

interface BroadcastSourceManifestItem {
  name: string;
  url: string | null;
  license: string;
  attribution: string | null;
  tier: string | null;
}

interface BroadcastManifestView {
  confidence?: { level: ConfidenceLevel; score: number };
  layers?: string[];
  sources?: BroadcastSourceManifestItem[];
  safety?: {
    publicPublishing: boolean;
    youtubeUpload: boolean;
    socialPosting: boolean;
    externalUpload: boolean;
    requiresFounderApprovalForLive: boolean;
  };
}

interface BroadcastRow {
  id: string;
  packageId: string;
  brollPlanId: string | null;
  mp4Path: string;
  dryRun: boolean;
  status: string;
  createdAt: string;
  title: string | null;
  coverImageUrl: string | null;
  manifestJson: BroadcastManifestView;
}

const CONFIDENCE_LEVELS: ConfidenceLevel[] = ["high", "medium", "low"];
function isConfidenceLevel(v: string): v is ConfidenceLevel {
  return (CONFIDENCE_LEVELS as string[]).includes(v);
}

// T263 — Saved-view schedule helpers (module-scope so they're easy to test).
// Day order: 0=Sun..6=Sat (matches `Date#getDay`).
const SCHEDULE_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function minutesToHHMM(min: number): string {
  const m = Math.max(0, Math.min(1440, Math.round(min)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function hhmmToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 24 || mm < 0 || mm > 59) return null;
  const total = h * 60 + mm;
  return total > 1440 ? null : total;
}

function formatScheduleRange(
  day: number,
  start: number,
  end: number,
): string {
  const endLabel = end >= 1440 ? "24:00" : minutesToHHMM(end);
  return `${SCHEDULE_DAY_LABELS[day]} ${minutesToHHMM(start)}–${endLabel}`;
}

function summarizeSchedule(schedule: SavedViewScheduleShape | null): string {
  if (!schedule || !schedule.windows.length) return "No schedule";
  const parts = schedule.windows.map((w) => {
    const dayLabel = w.days.length === 7
      ? "Every day"
      : w.days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => SCHEDULE_DAY_LABELS[d])
          .join("/");
    return `${dayLabel} ${minutesToHHMM(w.startMinute)}–${minutesToHHMM(w.endMinute)}`;
  });
  const prefix = schedule.enabled ? "" : "(off) ";
  return prefix + parts.join(", ");
}

export default function BroadcastPreview() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [packageId, setPackageId] = useState("demo-pkg-001");
  const [kicker, setKicker] = useState("WORLD");
  const [headline, setHeadline] = useState("Mougle hybrid newsroom broadcast — verified live feed");
  const [viewerTitle, setViewerTitle] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [speakerName, setSpeakerName] = useState("Voxa");
  const [speakerRole, setSpeakerRole] = useState("AI Presenter");
  const [brandLabel, setBrandLabel] = useState("MOUGLE");
  const [tickerItems, setTickerItems] = useState(
    "Markets steady · Verified sources confirm story · Multi-agent council convened"
  );
  const [breakingEnabled, setBreakingEnabled] = useState(false);
  const [breakingHeadline, setBreakingHeadline] = useState("Council confirms confidence threshold met");
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">("high");
  const [confidenceScore, setConfidenceScore] = useState(0.92);
  const [durationSec, setDurationSec] = useState(8);
  const [sourcesText, setSourcesText] = useState(
    "Reuters | reuters.com | licensed_stock_paid\nAP | ap.org | licensed_stock_paid\nMougle Council | mougle.ai | owned"
  );

  const listQ = useQuery<{ ok: true; broadcasts: BroadcastRow[] }>({
    queryKey: ["/api/admin/broadcasts"],
    queryFn: async () => {
      const r = await fetch("/api/admin/broadcasts", { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return r.json();
    },
  });

  type LiveAlertServerStatus = {
    lastScanAt: number | null;
    lastLiveCount: number | null;
    threshold: number;
    wasAboveThreshold: boolean;
    nextScanAt: number | null;
    intervalMs: number | null;
    lastAlertAt: number | null;
    lastAlertCount: number | null;
    lastAutoResolvedAt: number | null;
    lastAutoResolvedCount: number | null;
  };
  const liveAlertStatusQ = useQuery<{ ok: true; status: LiveAlertServerStatus }>({
    queryKey: ["/api/admin/broadcasts/live-alert/status"],
    queryFn: async () => {
      const r = await fetch("/api/admin/broadcasts/live-alert/status", {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return r.json();
    },
    refetchInterval: 60_000,
  });
  const [serverThresholdDraft, setServerThresholdDraft] = useState<string>("");
  useEffect(() => {
    const t = liveAlertStatusQ.data?.status.threshold;
    if (typeof t === "number") setServerThresholdDraft(String(t));
  }, [liveAlertStatusQ.data?.status.threshold]);
  const serverThresholdMut = useMutation({
    mutationFn: async (threshold: number) => {
      const r = await apiRequest(
        "PATCH",
        "/api/admin/broadcasts/live-alert/threshold",
        { threshold },
      );
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/broadcasts/live-alert/status"] });
      toast({ title: "Server alert threshold updated" });
    },
    onError: (err) =>
      toast({
        title: "Failed to update threshold",
        description: (err as Error).message,
        variant: "destructive",
      }),
  });
  const serverScanNowMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/admin/broadcasts/live-alert/run-now");
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return r.json();
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/broadcasts/live-alert/status"] });
      toast({
        title: data?.result?.alerted
          ? "Scan complete — admins were alerted"
          : "Scan complete",
        description: `Live count: ${data?.result?.liveCount ?? "?"} (threshold ${data?.result?.threshold ?? "?"})`,
      });
    },
    onError: (err) =>
      toast({
        title: "Scan failed",
        description: (err as Error).message,
        variant: "destructive",
      }),
  });

  const renderMut = useMutation({
    mutationFn: async () => {
      const sources = sourcesText
        .split("\n")
        .map((line) => line.split("|").map((s) => s.trim()))
        .filter((parts) => parts[0] && parts[2])
        .map((parts) => ({
          name: parts[0],
          url: parts[1] ? (parts[1].startsWith("http") ? parts[1] : `https://${parts[1]}`) : null,
          license: parts[2],
          tier: parts[2],
        }));
      const r = await apiRequest("POST", "/api/admin/broadcasts/render", {
        packageId,
        brandLabel,
        kicker,
        headline,
        title: viewerTitle.trim() ? viewerTitle.trim() : null,
        coverImageUrl: coverImageUrl.trim() ? coverImageUrl.trim() : null,
        speakerName: speakerName || null,
        speakerRole: speakerRole || null,
        tickerItems: tickerItems.split("·").map((s) => s.trim()).filter(Boolean),
        breaking: {
          enabled: breakingEnabled,
          label: "BREAKING",
          headline: breakingHeadline,
        },
        confidence,
        confidenceScore,
        sources,
        durationSec,
      });
      return r.json() as Promise<{ ok: true; broadcast: BroadcastRow }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
      setSelectedId(r.broadcast.id);
      toast({ title: "Broadcast rendered (dry-run)", description: r.broadcast.id });
    },
    onError: (e: Error) => toast({ title: "Render failed", description: e.message, variant: "destructive" }),
  });

  const selected = listQ.data?.broadcasts.find((b) => b.id === selectedId) ?? null;

  const [editTitle, setEditTitle] = useState("");
  const [editCover, setEditCover] = useState("");
  useEffect(() => {
    if (selected) {
      setEditTitle(selected.title ?? "");
      setEditCover(selected.coverImageUrl ?? "");
    }
  }, [selected?.id, selected?.title, selected?.coverImageUrl]);

  const updateMetaMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("no broadcast selected");
      const r = await apiRequest("PATCH", `/api/admin/broadcasts/${selected.id}`, {
        title: editTitle,
        coverImageUrl: editCover,
      });
      return r.json() as Promise<{ ok: true; broadcast: BroadcastRow }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
      toast({ title: "Saved", description: "Viewer-facing title and cover updated." });
    },
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  const FILTERS_STORAGE_KEY = "mougle.admin.broadcastPreview.filters.v1";
  type PersistedFilters = {
    dryRun: "all" | "dry" | "live";
    status: string;
    packageId: string;
  };
  const readPersistedFilters = (): PersistedFilters => {
    if (typeof window === "undefined") {
      return { dryRun: "all", status: "all", packageId: "" };
    }
    try {
      const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return { dryRun: "all", status: "all", packageId: "" };
      const parsed = JSON.parse(raw);
      const dryRun =
        parsed?.dryRun === "dry" || parsed?.dryRun === "live" ? parsed.dryRun : "all";
      const status = typeof parsed?.status === "string" ? parsed.status : "all";
      const packageId = typeof parsed?.packageId === "string" ? parsed.packageId : "";
      return { dryRun, status, packageId };
    } catch {
      return { dryRun: "all", status: "all", packageId: "" };
    }
  };
  const readUrlFilters = (): Partial<PersistedFilters> => {
    if (typeof window === "undefined") return {};
    try {
      const sp = new URLSearchParams(window.location.search);
      const out: Partial<PersistedFilters> = {};
      const mode = sp.get("mode");
      if (mode === "dry" || mode === "live" || mode === "all") {
        out.dryRun = mode as PersistedFilters["dryRun"];
      }
      const status = sp.get("status");
      if (status !== null) out.status = status;
      const pkg = sp.get("pkg");
      if (pkg !== null) out.packageId = pkg;
      return out;
    } catch {
      return {};
    }
  };
  const persistedFilters = readPersistedFilters();
  const urlFilters = readUrlFilters();
  const initialFilters: PersistedFilters = {
    dryRun: urlFilters.dryRun ?? persistedFilters.dryRun,
    status: urlFilters.status ?? persistedFilters.status,
    packageId: urlFilters.packageId ?? persistedFilters.packageId,
  };
  const [filterDryRun, setFilterDryRun] = useState<"all" | "dry" | "live">(
    initialFilters.dryRun,
  );
  const [filterStatus, setFilterStatus] = useState<string>(initialFilters.status);
  const [filterPackageId, setFilterPackageId] = useState<string>(initialFilters.packageId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDefault =
      filterDryRun === "all" && filterStatus === "all" && filterPackageId === "";
    try {
      if (isDefault) {
        window.localStorage.removeItem(FILTERS_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          FILTERS_STORAGE_KEY,
          JSON.stringify({
            dryRun: filterDryRun,
            status: filterStatus,
            packageId: filterPackageId,
          }),
        );
      }
    } catch {
      // ignore quota / privacy mode errors
    }
    try {
      const url = new URL(window.location.href);
      const sp = url.searchParams;
      if (filterDryRun !== "all") sp.set("mode", filterDryRun);
      else sp.delete("mode");
      if (filterStatus !== "all") sp.set("status", filterStatus);
      else sp.delete("status");
      const trimmedPkg = filterPackageId.trim();
      if (trimmedPkg) sp.set("pkg", trimmedPkg);
      else sp.delete("pkg");
      const next = url.pathname + (sp.toString() ? `?${sp.toString()}` : "") + url.hash;
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (next !== current) {
        window.history.replaceState(window.history.state, "", next);
      }
    } catch {
      // ignore URL update failures
    }
  }, [filterDryRun, filterStatus, filterPackageId]);

  // T202: Saved views are persisted server-side and can be shared team-wide.
  // T263: Shared views can optionally carry a recurring weekly schedule that
  // makes them the team default during specific windows (e.g. day vs night
  // shift rotations).
  type SavedViewSchedule = SavedViewScheduleShape;
  type SavedView = {
    id: string;
    name: string;
    scope: "private" | "shared";
    dryRun: "all" | "dry" | "live";
    status: string;
    packageId: string;
    createdByActorId: string;
    createdByActorType: string;
    creator: {
      actorId: string;
      actorType: string;
      displayName: string;
      email: string | null;
      role: string | null;
      status: "active" | "disabled" | "removed" | "unknown";
      disabledAt: string | null;
    };
    createdAt: string;
    updatedAt: string;
    isOwn: boolean;
    canModify: boolean;
    isTeamDefault: boolean;
    teamDefaultSetBy: {
      actorId: string;
      actorType: string;
      displayName: string;
      email: string | null;
      role: string | null;
      status: "active" | "disabled" | "removed" | "unknown";
      disabledAt: string | null;
    } | null;
    teamDefaultSetAt: string | null;
    schedule: SavedViewSchedule | null;
  };
  type SavedViewsResponse = {
    ok: true;
    views: SavedView[];
    viewerActorId: string;
    viewerIsFounder: boolean;
    viewerDisplayName?: string;
    // T292 — Active admin staff contact directory so the shared-preview
    // banner can resolve `?sharedBy=<name>` to an email and offer a
    // "Message <name>" mailto button.
    // T298 — Each entry may additionally carry an optional Slack handle so
    // the banner can offer a "Slack <name>" deep-link button alongside the
    // mailto fallback. Older servers (pre-T298) may omit `slackHandle`.
    staffDirectory?: Array<{
      displayName: string;
      email: string;
      slackHandle?: string | null;
    }>;
  };

  const savedViewsQ = useQuery<SavedViewsResponse>({
    queryKey: ["/api/admin/broadcasts/saved-views"],
    queryFn: async () => {
      const r = await fetch("/api/admin/broadcasts/saved-views", {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load saved views");
      return r.json();
    },
  });
  const savedViews: SavedView[] = savedViewsQ.data?.views ?? [];
  const personalViews = savedViews.filter((v) => v.scope === "private" && v.isOwn);
  const sharedViews = savedViews.filter((v) => v.scope === "shared");
  const viewerIsFounder = !!savedViewsQ.data?.viewerIsFounder;
  // T271 — Coverage diagnostics across all currently saved enabled scheduled
  // shared views (i.e. server state, used for the row-footer warning after
  // saving).
  const savedScheduleDiagnostics = useMemo(
    () =>
      computeScheduleDiagnostics(
        sharedViews
          .filter(
            (v) =>
              v.schedule &&
              v.schedule.enabled &&
              v.schedule.windows.length > 0,
          )
          .map((v) => ({ id: v.id, name: v.name, schedule: v.schedule! })),
      ),
    [sharedViews],
  );
  const invalidateSavedViews = () =>
    qc.invalidateQueries({ queryKey: ["/api/admin/broadcasts/saved-views"] });

  // T269 — A ticking "now" so the schedule indicator near the Saved views
  // menu reflects the current and next-active scheduled shared view without
  // a manual refresh. Updates once per minute (the schedule grain is HH:MM).
  const [scheduleNow, setScheduleNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setScheduleNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // T272 — "Preview at..." lets admins audit the rotation by picking any
  // date/time and seeing which scheduled view would be active then, plus the
  // next transition after that. `null` means we're showing the live ticking
  // view; otherwise we freeze the indicator to the chosen timestamp.
  // T278 — The chosen timestamp is mirrored to the URL as
  // `?scheduledPreviewAt=<ISO>` so admins can copy/share the preview with
  // teammates via the existing "Copy link" affordance.
  const readUrlScheduledPreviewAt = (): Date | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = new URLSearchParams(window.location.search).get(
        SCHEDULED_PREVIEW_URL_PARAM,
      );
      if (!raw) return null;
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed;
    } catch {
      return null;
    }
  };
  const [scheduledPreviewAt, setScheduledPreviewAt] = useState<Date | null>(
    () => readUrlScheduledPreviewAt(),
  );
  // T281 — Track whether the current scheduled-preview timestamp came in
  // through the URL (i.e. someone opened a shared link) vs being set locally
  // via the "Preview at…" picker. Shared loads get a prominent banner so the
  // viewer knows they're looking at a frozen future moment, not live data.
  const [previewSource, setPreviewSource] = useState<"url" | "picker" | null>(
    () => (readUrlScheduledPreviewAt() ? "url" : null),
  );
  const [sharedBannerDismissed, setSharedBannerDismissed] = useState(false);
  // T288 — When the shared link carries `?sharedBy=<name>`, show the sharer's
  // name in the banner so the viewer knows who to ask follow-up questions.
  const readUrlSharedBy = (): string | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = new URLSearchParams(window.location.search).get("sharedBy");
      if (!raw) return null;
      const trimmed = raw.trim().slice(0, 80);
      return trimmed || null;
    } catch {
      return null;
    }
  };
  const [sharedByName] = useState<string | null>(() => readUrlSharedBy());
  // T292 — Resolve the sharer's name (from the URL hint) to an email via the
  // admin staff directory returned by the saved-views endpoint, so the banner
  // can offer a one-click "Message <name>" mailto. Names are matched
  // case-insensitively after trimming. Returns `null` when the sharer can't
  // be resolved to a contact — the banner then hides the button gracefully.
  const sharedByContact = useMemo<{
    email: string | null;
    slackHandle: string | null;
  }>(() => {
    if (!sharedByName) return { email: null, slackHandle: null };
    const dir = savedViewsQ.data?.staffDirectory ?? [];
    const target = sharedByName.trim().toLowerCase();
    if (!target) return { email: null, slackHandle: null };
    const match = dir.find((c) => c.displayName.trim().toLowerCase() === target);
    if (!match) return { email: null, slackHandle: null };
    return {
      email: match.email ?? null,
      slackHandle: match.slackHandle?.trim() || null,
    };
  }, [sharedByName, savedViewsQ.data?.staffDirectory]);
  const sharedByEmail = sharedByContact.email;
  // T298 — When the sharer has a Slack handle on file, the banner offers a
  // "Slack <name>" deep-link button. Slack supports two cross-workspace
  // deep-link formats: `slack://user?team=<T>&id=<U>` requires a known team
  // and user id, while `https://slack.com/app_redirect?channel=<handle>`
  // works for both `@username` mentions and `U…`/`W…` user IDs and routes
  // through whichever Slack workspace the viewer has signed into. We use the
  // latter so the button works without per-staff workspace configuration.
  const sharedBySlackHref = useMemo<string | null>(() => {
    const handle = sharedByContact.slackHandle;
    if (!handle) return null;
    const cleaned = handle.startsWith("@") ? handle.slice(1) : handle;
    if (!cleaned) return null;
    const looksLikeUserId = /^[UW][A-Z0-9]{2,}$/.test(cleaned);
    const channelParam = looksLikeUserId ? cleaned : `@${cleaned}`;
    return `https://slack.com/app_redirect?channel=${encodeURIComponent(
      channelParam,
    )}`;
  }, [sharedByContact.slackHandle]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = applyScheduledPreviewToUrl(
        new URL(window.location.href),
        scheduledPreviewAt,
      );
      const next =
        url.pathname +
        (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") +
        url.hash;
      const current =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      if (next !== current) {
        window.history.replaceState(window.history.state, "", next);
      }
    } catch {
      // ignore URL update failures
    }
  }, [scheduledPreviewAt]);
  const [previewPickerOpen, setPreviewPickerOpen] = useState(false);
  const [previewPickerDraft, setPreviewPickerDraft] = useState<string>("");
  const effectiveScheduleNow = scheduledPreviewAt ?? scheduleNow;
  // T282 — When the previewed timestamp loaded from the URL (T278) sits in
  // the past, copying/sharing the link would surface a rotation that is no
  // longer "upcoming." Flag it so the indicator and Copy link button can warn.
  const previewIsInPast = isPreviewInPast(scheduledPreviewAt, scheduleNow);
  // T287 — Once the previewed moment falls behind the live clock, the
  // frozen snapshot becomes misleading (the rotation it pointed at may have
  // already aired). Auto-revert to the live ticking view for both
  // URL-shared and picker-set previews so the banner/indicator clear
  // themselves and the page reflects current reality.
  useEffect(() => {
    if (!previewIsInPast) return;
    const reset = revertExpiredPreviewState();
    setScheduledPreviewAt(reset.scheduledPreviewAt);
    setPreviewSource(reset.previewSource);
    setSharedBannerDismissed(reset.sharedBannerDismissed);
    toast({
      title: "Preview snapshot expired",
      description:
        "The previewed time is now in the past — switched back to the live rotation.",
    });
  }, [previewIsInPast, toast]);
  const activeScheduledView =
    sharedViews.find(
      (v) => v.schedule && v.schedule.enabled && scheduleMatchesNow(v.schedule, effectiveScheduleNow),
    ) ?? null;
  const nextScheduleChange = nextScheduleTransition(
    sharedViews,
    effectiveScheduleNow,
    activeScheduledView?.id ?? null,
  );
  const formatScheduleClock = (d: Date) => {
    const sameDay =
      d.getFullYear() === effectiveScheduleNow.getFullYear() &&
      d.getMonth() === effectiveScheduleNow.getMonth() &&
      d.getDate() === effectiveScheduleNow.getDate();
    const tomorrow = new Date(effectiveScheduleNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      d.getFullYear() === tomorrow.getFullYear() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getDate() === tomorrow.getDate();
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
    if (sameDay) return hhmm;
    if (isTomorrow) return `${hhmm} tomorrow`;
    return `${SCHEDULE_DAY_LABELS[d.getDay()]} ${hhmm}`;
  };
  const hasAnyScheduledSharedView = sharedViews.some(
    (v) => v.schedule && v.schedule.enabled && v.schedule.windows.length > 0,
  );
  // T279 — Weekly coverage grid for the heatmap popover. Cheap to compute
  // (7×24 cells) and only recomputes when shared schedules actually change.
  const weeklyCoverageGrid = useMemo(
    () =>
      computeWeeklyCoverageGrid(
        sharedViews
          .filter(
            (v) =>
              v.schedule &&
              v.schedule.enabled &&
              v.schedule.windows.length > 0,
          )
          .map((v) => ({ id: v.id, name: v.name, schedule: v.schedule! })),
      ),
    [sharedViews],
  );
  const weeklyCoverageSummary = useMemo(() => {
    let gaps = 0;
    let conflicts = 0;
    for (const c of weeklyCoverageGrid) {
      if (c.status === "gap") gaps++;
      else if (c.status === "conflict") conflicts++;
    }
    return { gaps, conflicts };
  }, [weeklyCoverageGrid]);
  const [coveragePopoverOpen, setCoveragePopoverOpen] = useState(false);
  // T283 — When a cell is clicked, surface quick "Cover with view…" /
  // "Fix overlap…" actions instead of immediately closing the popover.
  // Cleared whenever the popover closes, and also when the underlying
  // grid recomputes so we never render a stale (day, hour) pointer into
  // a cell whose status / view list has changed.
  const [selectedCoverageCell, setSelectedCoverageCell] = useState<
    { day: number; hour: number } | null
  >(null);
  // T290 — Inline name for the "Create new shared view to cover this hour"
  // flow. Declared up here (rather than next to its mutation below) so the
  // popover-close / grid-recompute effects can reset it without TDZ errors.
  const [coverNewViewName, setCoverNewViewName] = useState("");
  useEffect(() => {
    if (!coveragePopoverOpen) {
      setSelectedCoverageCell(null);
      setCoverNewViewName("");
    }
  }, [coveragePopoverOpen]);
  useEffect(() => {
    setSelectedCoverageCell(null);
    setCoverNewViewName("");
  }, [weeklyCoverageGrid]);
  // T284 — "Suggest fix" pre-applies a heuristic schedule diff to close gaps.
  // The dialog is opened from the coverage popover; admins can pick which of
  // the per-view suggestions to actually save.
  const coverageSuggestions = useMemo(
    () =>
      suggestCoverageFix(
        sharedViews
          .filter(
            (v) =>
              v.schedule &&
              v.schedule.enabled &&
              v.schedule.windows.length > 0,
          )
          .map((v) => ({ id: v.id, name: v.name, schedule: v.schedule! })),
      ),
    [sharedViews],
  );
  const [suggestionsDialogOpen, setSuggestionsDialogOpen] = useState(false);
  const [acceptedSuggestionIds, setAcceptedSuggestionIds] = useState<
    Set<string>
  >(new Set());
  // T296 — Mode toggle on the Suggest fix dialog. "extend-existing" is the
  // original behaviour (tack windows onto the least-busy shared view).
  // "new-fallback" spins up a brand-new shared view dedicated to gap-filling
  // — useful when the team would rather have a clearly-labeled "always-on
  // fallback" rather than mutating their existing rotation.
  type SuggestionMode = "extend-existing" | "new-fallback";
  const [suggestionMode, setSuggestionMode] =
    useState<SuggestionMode>("extend-existing");
  const [fallbackViewName, setFallbackViewName] = useState("Coverage fallback");
  // T305 — Fallback view filter controls. Default to the admin's currently
  // applied filters when the dialog opens, but let them be edited inline so a
  // fallback can target (e.g.) live-only or a specific package without first
  // leaving the dialog to change the dashboard filters.
  const [fallbackDryRun, setFallbackDryRun] =
    useState<"all" | "dry" | "live">("all");
  const [fallbackStatus, setFallbackStatus] = useState<string>("all");
  const [fallbackPackageId, setFallbackPackageId] = useState<string>("");
  // T295 — Per-change time overrides keyed by viewId then change index. Admins
  // can tweak the suggested start/end of any extension or added window before
  // applying so the heuristic's "technically correct but not what we wanted"
  // picks (e.g. extend the night view forward instead of pulling morning back)
  // can be adjusted without dismissing the dialog and editing manually.
  type SuggestionEditOverride = {
    start?: number;
    end?: number;
    day?: number;
  };
  const [suggestionEdits, setSuggestionEdits] = useState<
    Record<string, Record<number, SuggestionEditOverride>>
  >({});
  // T314 — Admins can dismiss a heuristic-proposed row outright when they
  // disagree with it. Dismissed rows are hidden from the dialog, dropped
  // from the accepted set, and skipped by validation. Re-opening the
  // dialog (or clicking "Restore dismissed") brings them back.
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<
    Set<string>
  >(new Set());
  // T318 — Per-view sibling add-window changes appended via the "Cover
  // original day too" quick action on a warning row. These are extra
  // coverage-fix changes layered on top of the heuristic-suggested ones so
  // the existing edit/validation/apply pipeline picks them up automatically.
  const [suggestionExtraChanges, setSuggestionExtraChanges] = useState<
    Record<string, CoverageSuggestionChange[]>
  >({});
  // T341 — Snapshot of the most recent "Cover all flagged days" batch so the
  // admin can undo it in one click. We track only what the batch *itself*
  // appended (sibling add-window extras keyed by view) and which views the
  // batch newly flipped into the accepted set, so undo leaves any earlier
  // per-view extras and previously-accepted ids alone. The snapshot is
  // cleared by any further edit so the Undo button only ever applies to a
  // batch the admin hasn't touched since.
  type CoverAllBatchSnapshot = {
    extras: Record<
      string,
      Array<{ day: number; startMinute: number; endMinute: number }>
    >;
    newlyAcceptedIds: string[];
  };
  const [lastCoverAllBatch, setLastCoverAllBatch] =
    useState<CoverAllBatchSnapshot | null>(null);
  const openSuggestionsDialog = () => {
    setAcceptedSuggestionIds(
      new Set(coverageSuggestions.suggestions.map((s) => s.viewId)),
    );
    setSuggestionMode("extend-existing");
    setFallbackViewName("Coverage fallback");
    // T310 — Prefer the team-default fallback preset when a founder has
    // pinned one; otherwise fall back to "whatever the dashboard currently
    // shows" so behaviour is unchanged for teams without a preset.
    const preset = fallbackPresetQ.data?.preset ?? null;
    if (preset) {
      setFallbackDryRun(preset.dryRun);
      setFallbackStatus(preset.status);
      setFallbackPackageId(preset.packageId);
    } else {
      setFallbackDryRun(filterDryRun);
      setFallbackStatus(filterStatus);
      setFallbackPackageId(filterPackageId);
    }
    setSuggestionEdits({});
    setDismissedSuggestionIds(new Set());
    setSuggestionExtraChanges({});
    setLastCoverAllBatch(null);
    setSuggestionsDialogOpen(true);
    setCoveragePopoverOpen(false);
  };
  const toggleSuggestion = (viewId: string, on: boolean) => {
    setAcceptedSuggestionIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(viewId);
      else next.delete(viewId);
      return next;
    });
    setLastCoverAllBatch(null);
  };
  const dismissSuggestion = (viewId: string) => {
    setDismissedSuggestionIds((prev) => {
      const next = new Set(prev);
      next.add(viewId);
      return next;
    });
    setAcceptedSuggestionIds((prev) => {
      if (!prev.has(viewId)) return prev;
      const next = new Set(prev);
      next.delete(viewId);
      return next;
    });
    setLastCoverAllBatch(null);
  };
  const restoreDismissedSuggestions = () => {
    setDismissedSuggestionIds(new Set());
    setLastCoverAllBatch(null);
  };
  const visibleSuggestions = useMemo(
    () =>
      coverageSuggestions.suggestions.filter(
        (s) => !dismissedSuggestionIds.has(s.viewId),
      ),
    [coverageSuggestions.suggestions, dismissedSuggestionIds],
  );

  // T241: Auto-apply the team's pinned default on first load when the admin
  // hasn't picked filters via URL or their own saved preference. Captured at
  // mount so later URL/localStorage writes don't disable the one-shot.
  // T263: When multiple shared views have schedules eligible for "now",
  // pick the scheduled winner; otherwise fall back to the manual pinned
  // `isTeamDefault`. This lets founders rotate (e.g. "Live failures last 24h"
  // during business hours vs "Dry-run queue health" overnight) without manual
  // handoffs.
  const teamDefaultEligibleRef = useRef<boolean>(
    Object.keys(urlFilters).length === 0 &&
      (typeof window === "undefined"
        ? false
        : window.localStorage.getItem(FILTERS_STORAGE_KEY) === null),
  );
  const teamDefaultAppliedRef = useRef(false);
  useEffect(() => {
    if (teamDefaultAppliedRef.current) return;
    if (!teamDefaultEligibleRef.current) return;
    if (!savedViewsQ.isSuccess) return;
    const now = new Date();
    const scheduled = (savedViewsQ.data?.views ?? []).find(
      (v) =>
        v.scope === "shared" &&
        v.schedule &&
        v.schedule.enabled &&
        scheduleMatchesNow(v.schedule, now),
    );
    const pinned = savedViewsQ.data?.views.find(
      (v) => v.scope === "shared" && v.isTeamDefault,
    );
    const def = scheduled ?? pinned;
    if (!def) {
      teamDefaultAppliedRef.current = true;
      return;
    }
    teamDefaultAppliedRef.current = true;
    setFilterDryRun(def.dryRun);
    setFilterStatus(def.status);
    setFilterPackageId(def.packageId);
    toast({
      title: scheduled
        ? "Scheduled team view applied"
        : "Team default view applied",
      description: def.name,
    });
  }, [savedViewsQ.isSuccess, savedViewsQ.data, toast]);

  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewShared, setNewViewShared] = useState(false);
  const [manageViewsOpen, setManageViewsOpen] = useState(false);

  // T310 — Team-default fallback filter preset. Founders can pin a
  // dryRun/status/packageId combo that becomes the starting point for the
  // "Create new fallback view" form in the Suggest fix dialog, replacing
  // the previous default of "whatever happens to be applied right now".
  type FallbackPreset = {
    dryRun: "all" | "dry" | "live";
    status: string;
    packageId: string;
    updatedAt: string;
    updatedBy: { displayName: string; email: string | null; role: string | null };
  };
  type FallbackPresetResponse = {
    ok: boolean;
    preset: FallbackPreset | null;
    viewerIsFounder?: boolean;
  };
  const fallbackPresetQ = useQuery<FallbackPresetResponse>({
    queryKey: ["/api/admin/broadcasts/fallback-default-preset"],
    queryFn: async () => {
      const r = await fetch("/api/admin/broadcasts/fallback-default-preset", {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load fallback default preset");
      return r.json();
    },
  });
  const fallbackPreset = fallbackPresetQ.data?.preset ?? null;
  const invalidateFallbackPreset = () =>
    qc.invalidateQueries({
      queryKey: ["/api/admin/broadcasts/fallback-default-preset"],
    });
  const saveFallbackPresetMut = useMutation({
    mutationFn: async (input: {
      dryRun: "all" | "dry" | "live";
      status: string;
      packageId: string;
    }) => {
      const r = await fetch("/api/admin/broadcasts/fallback-default-preset", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body?.ok) {
        throw new Error(body?.message || "Failed to pin fallback default");
      }
      return body as { preset: FallbackPreset };
    },
    onSuccess: () => {
      invalidateFallbackPreset();
      invalidateFallbackPresetAudit();
      toast({
        title: "Default fallback filters pinned",
        description:
          "The Suggest fix dialog will start from this preset for new fallback views.",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Could not pin fallback default",
        description: String(e?.message ?? e),
        variant: "destructive",
      }),
  });
  const clearFallbackPresetMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/broadcasts/fallback-default-preset", {
        method: "DELETE",
        credentials: "include",
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body?.ok) {
        throw new Error(body?.message || "Failed to clear fallback default");
      }
    },
    onSuccess: () => {
      invalidateFallbackPreset();
      invalidateFallbackPresetAudit();
      toast({
        title: "Default fallback filters cleared",
        description:
          "The Suggest fix dialog will inherit your current dashboard filters again.",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Could not clear fallback default",
        description: String(e?.message ?? e),
        variant: "destructive",
      }),
  });
  // T316 — Fallback preset change history. Lets founders see who last
  // updated the team-default fallback filters and what the previous values
  // were, before they change the preset themselves.
  type FallbackPresetAuditEntry = {
    id: string | null;
    ts: string | null;
    actorId: string;
    actorType: string;
    actor: { displayName: string; email: string | null; role: string | null };
    action: "set" | "clear";
    before: { dryRun: string; status: string; packageId: string } | null;
    after: { dryRun: string; status: string; packageId: string } | null;
  };
  type FallbackPresetAuditActorOption = {
    actorId: string;
    actorType: string;
    actor: { displayName: string; email: string | null; role: string | null };
  };
  type FallbackPresetAuditArchive = {
    name: string;
    rotatedAt: string | null;
    bytes: number;
    // T363 — Server-computed set/clear breakdown so each row shows the
    // counts without opening the inspect dialog. Optional for backward
    // compatibility with older server responses.
    setCount?: number;
    clearCount?: number;
  };
  type FallbackPresetAuditStats = {
    activeBytes: number;
    activeExists: boolean;
    // T365 — Per-row "N set · N clear" breakdown for the active
    // (un-rotated) audit file, matching the per-archive counts added in
    // T363. Optional so older servers that don't send them still render.
    activeSetCount?: number;
    activeClearCount?: number;
    archiveCount: number;
    archiveBytes: number;
    totalBytes: number;
    maxBytes: number;
    maxArchives: number;
    maxBytesSource?: "db" | "env" | "default";
    maxArchivesSource?: "db" | "env" | "default";
    // T337 — Newest-first list of rotated archive files + ISO timestamp of
    // the most recent rotation. Used by the "Archives (newest first)"
    // mini-list and the "Last rotated" line on the audit stats card.
    archives?: FallbackPresetAuditArchive[];
    lastRotatedAt?: string | null;
    limits?: {
      bytesMin: number;
      bytesMax: number;
      archivesMin: number;
      archivesMax: number;
      bytesDefault: number;
      archivesDefault: number;
    };
  };
  type FallbackPresetAuditResponse = {
    ok: boolean;
    entries: FallbackPresetAuditEntry[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    actorId: string | null;
    from: string | null;
    to: string | null;
    actors: FallbackPresetAuditActorOption[];
    stats?: FallbackPresetAuditStats;
  };
  const [fallbackPresetAuditActorFilter, setFallbackPresetAuditActorFilter] =
    useState<string>("");
  // T326 — Date range filter (datetime-local strings, treated as local time).
  // We convert to ISO before sending so the server filters consistently.
  const [fallbackPresetAuditFrom, setFallbackPresetAuditFrom] =
    useState<string>("");
  const [fallbackPresetAuditTo, setFallbackPresetAuditTo] =
    useState<string>("");
  const localInputToIso = (v: string): string | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  // T329 — Format a Date as a datetime-local input value (YYYY-MM-DDTHH:mm)
  // in the browser's local timezone so quick presets populate the pickers
  // identically to manual selections.
  const dateToLocalInput = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  };
  const applyFallbackPresetAuditQuickRange = (hours: number) => {
    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    setFallbackPresetAuditFrom(dateToLocalInput(from));
    setFallbackPresetAuditTo(dateToLocalInput(now));
  };
  const fallbackPresetAuditFromIso = localInputToIso(fallbackPresetAuditFrom);
  const fallbackPresetAuditToIso = localInputToIso(fallbackPresetAuditTo);
  // T328 — Draft state for the fallback-preset audit retention inputs.
  // Empty string means "use the value from the server"; the inputs are
  // seeded from the audit-stats response below.
  const [fallbackAuditBytesKibDraft, setFallbackAuditBytesKibDraft] =
    useState<string>("");
  const [fallbackAuditArchivesDraft, setFallbackAuditArchivesDraft] =
    useState<string>("");
  const [fallbackAuditRetentionMsg, setFallbackAuditRetentionMsg] =
    useState<string | null>(null);
  // T325 — Page through the full fallback preset history using true
  // offset-based pagination so admins can traverse arbitrarily deep
  // (well past the 200-entry per-page cap). Each "Load more" click fetches
  // the next 10-entry page at `offset = previousPages.totalEntries` and
  // appends. useInfiniteQuery resets automatically when the actor filter or
  // date range change because they're part of the query key.
  const FALLBACK_PRESET_AUDIT_PAGE_SIZE = 10;
  const fallbackPresetAuditQ = useInfiniteQuery<
    FallbackPresetAuditResponse,
    Error
  >({
    queryKey: [
      "/api/admin/broadcasts/fallback-default-preset-audit",
      fallbackPresetAuditActorFilter,
      fallbackPresetAuditFromIso,
      fallbackPresetAuditToIso,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(FALLBACK_PRESET_AUDIT_PAGE_SIZE),
        offset: String(pageParam ?? 0),
      });
      if (fallbackPresetAuditActorFilter) {
        params.set("actorId", fallbackPresetAuditActorFilter);
      }
      if (fallbackPresetAuditFromIso) {
        params.set("from", fallbackPresetAuditFromIso);
      }
      if (fallbackPresetAuditToIso) {
        params.set("to", fallbackPresetAuditToIso);
      }
      const r = await fetch(
        `/api/admin/broadcasts/fallback-default-preset-audit?${params.toString()}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to load fallback preset history");
      return r.json();
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.entries.length : undefined,
    enabled: manageViewsOpen,
  });
  // Flattened view of every loaded page, plus the first page's metadata for
  // the actor dropdown / stats / loading / error / empty states.
  const fallbackPresetAuditPages = fallbackPresetAuditQ.data?.pages ?? [];
  const fallbackPresetAuditEntries = fallbackPresetAuditPages.flatMap(
    (p) => p.entries,
  );
  const fallbackPresetAuditFirstPage = fallbackPresetAuditPages[0];
  const fallbackPresetAuditLastPage =
    fallbackPresetAuditPages[fallbackPresetAuditPages.length - 1];
  const fallbackPresetAuditStats = fallbackPresetAuditFirstPage?.stats;
  const fallbackPresetAuditHasMore = fallbackPresetAuditQ.hasNextPage ?? false;
  // T339 — Use the freshest server-reported total so the "Showing N–M of T"
  // indicator stays accurate if entries are appended between page fetches.
  // Falls back to the loaded count when no page has resolved yet.
  const fallbackPresetAuditTotal =
    fallbackPresetAuditLastPage?.total ??
    fallbackPresetAuditFirstPage?.total ??
    fallbackPresetAuditEntries.length;
  const fallbackPresetAuditRangeStart =
    fallbackPresetAuditEntries.length > 0 ? 1 : 0;
  const fallbackPresetAuditRangeEnd = fallbackPresetAuditEntries.length;
  const invalidateFallbackPresetAudit = () =>
    qc.invalidateQueries({
      queryKey: ["/api/admin/broadcasts/fallback-default-preset-audit"],
    });
  // T328 — Seed the audit retention inputs from the server response the
  // first time stats arrive (or when the panel is reopened). Subsequent
  // typing leaves the draft alone so the admin's edits aren't clobbered.
  useEffect(() => {
    const s = fallbackPresetAuditStats;
    if (!s) return;
    setFallbackAuditBytesKibDraft((prev) =>
      prev === "" && typeof s.maxBytes === "number"
        ? String(Math.round(s.maxBytes / 1024))
        : prev,
    );
    setFallbackAuditArchivesDraft((prev) =>
      prev === "" && typeof s.maxArchives === "number"
        ? String(s.maxArchives)
        : prev,
    );
  }, [fallbackPresetAuditStats]);
  // T328 — Persist the fallback-preset audit retention settings. Mirrors
  // the cover-/media-sweep audit-retention save flow.
  const saveFallbackAuditRetentionMut = useMutation({
    mutationFn: async (input: { maxBytes?: number; maxArchives?: number }) => {
      const r = await fetch(
        "/api/admin/broadcasts/fallback-default-preset-audit/retention",
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body?.ok) {
        throw new Error(
          body?.message || body?.error || "Failed to update audit retention",
        );
      }
      return body as {
        ok: true;
        updated: Array<"bytes" | "archives">;
        stats: FallbackPresetAuditStats;
      };
    },
    onSuccess: (body) => {
      setFallbackAuditRetentionMsg("Audit retention updated");
      if (typeof body.stats?.maxBytes === "number") {
        setFallbackAuditBytesKibDraft(
          String(Math.round(body.stats.maxBytes / 1024)),
        );
      }
      if (typeof body.stats?.maxArchives === "number") {
        setFallbackAuditArchivesDraft(String(body.stats.maxArchives));
      }
      invalidateFallbackPresetAudit();
    },
    onError: (e: any) => {
      setFallbackAuditRetentionMsg(String(e?.message ?? e));
    },
  });
  // T354 — Peek at the parsed contents of a rotated fallback-preset audit
  // archive in a dialog so admins can confirm they're grabbing the right
  // file before downloading — or skip the download entirely for casual
  // investigations. The query is gated on `inspectingArchive` so it only
  // fires when the dialog actually opens for a specific archive.
  // T357 — The dialog now supports actor + date-range filters and pages
  // through the entire archive (not just the last 50 entries), so admins
  // can finish casual investigations without downloading the JSONL.
  const [inspectingArchive, setInspectingArchive] = useState<string | null>(
    null,
  );
  const [inspectActorFilter, setInspectActorFilter] = useState<string>("");
  const [inspectFrom, setInspectFrom] = useState<string>("");
  const [inspectTo, setInspectTo] = useState<string>("");
  // T358 — Action-class filter (all / set / clear). Composes with the
  // T357 actor + date-range filters so admins can isolate "who *cleared*
  // the pin last Tuesday" without skimming every entry.
  const [inspectActionFilter, setInspectActionFilter] = useState<
    "all" | "set" | "clear"
  >("all");
  const inspectFromIso = localInputToIso(inspectFrom);
  const inspectToIso = localInputToIso(inspectTo);
  const applyInspectQuickRange = (hours: number) => {
    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    setInspectFrom(dateToLocalInput(from));
    setInspectTo(dateToLocalInput(now));
  };
  // T360 — Open the inspect dialog for a specific archive with an
  // optional pre-applied action filter so the per-row "Updates only" /
  // "Clears only" chips land admins on the right view in one click
  // instead of forcing them to open the dialog and then re-filter.
  // Filters are reset here (rather than in a useEffect on
  // `inspectingArchive`) so the caller's chosen action filter isn't
  // immediately clobbered back to "all".
  const openInspectArchive = (
    name: string,
    action: "all" | "set" | "clear" = "all",
  ) => {
    setInspectActorFilter("");
    setInspectFrom("");
    setInspectTo("");
    setInspectActionFilter(action);
    setInspectingArchive(name);
  };
  type FallbackPresetAuditArchivePreview = {
    ok: true;
    archiveName: string;
    bytes: number;
    totalEntries: number;
    matchedEntries: number;
    // T361 — Unfiltered (by action) set/clear breakdown for the current
    // actor + date scope, so the inspect dialog can surface both sides at
    // a glance without the admin flipping the action filter.
    setCount: number;
    clearCount: number;
    corruptLines: number;
    previewLimit: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    actorId: string | null;
    from: string | null;
    to: string | null;
    action: "set" | "clear" | null;
    actors: FallbackPresetAuditActorOption[];
    entries: FallbackPresetAuditEntry[];
  };
  const INSPECT_PAGE_SIZE = 50;
  const inspectFallbackAuditArchiveQ = useInfiniteQuery<
    FallbackPresetAuditArchivePreview,
    Error
  >({
    queryKey: [
      "/api/admin/broadcasts/fallback-default-preset-audit/archives",
      inspectingArchive,
      "preview",
      inspectActorFilter,
      inspectFromIso,
      inspectToIso,
      inspectActionFilter,
    ],
    enabled: !!inspectingArchive,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(INSPECT_PAGE_SIZE),
        offset: String(pageParam ?? 0),
      });
      if (inspectActorFilter) params.set("actorId", inspectActorFilter);
      if (inspectFromIso) params.set("from", inspectFromIso);
      if (inspectToIso) params.set("to", inspectToIso);
      if (inspectActionFilter !== "all")
        params.set("action", inspectActionFilter);
      const r = await fetch(
        `/api/admin/broadcasts/fallback-default-preset-audit/archives/${encodeURIComponent(
          inspectingArchive as string,
        )}/preview?${params.toString()}`,
        { credentials: "include" },
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body?.ok) {
        throw new Error(
          body?.message || body?.error || "Failed to load archive preview",
        );
      }
      return body as FallbackPresetAuditArchivePreview;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.entries.length : undefined,
  });
  const inspectFallbackAuditPages =
    inspectFallbackAuditArchiveQ.data?.pages ?? [];
  const inspectFallbackAuditEntries = inspectFallbackAuditPages.flatMap(
    (p) => p.entries,
  );
  const inspectFallbackAuditFirstPage = inspectFallbackAuditPages[0];
  const inspectFallbackAuditLastPage =
    inspectFallbackAuditPages[inspectFallbackAuditPages.length - 1];
  const inspectFallbackAuditMatched =
    inspectFallbackAuditLastPage?.matchedEntries ??
    inspectFallbackAuditFirstPage?.matchedEntries ??
    0;
  const inspectFallbackAuditHasFilters = Boolean(
    inspectActorFilter ||
      inspectFromIso ||
      inspectToIso ||
      inspectActionFilter !== "all",
  );
  // T358 — Human-readable scope label so the matched-count summary and the
  // empty-state line both call out the active action filter (e.g. "2 clear
  // entries matching filters").
  const inspectActionScopeLabel =
    inspectActionFilter === "clear"
      ? "clear "
      : inspectActionFilter === "set"
        ? "update "
        : "";

  // T351 — Delete one specific rotated fallback-preset audit archive on
  // demand. Without this, admins can only prune archives indirectly by
  // lowering "Max archives kept" or by force-rotating until the oldest
  // falls off. This mutation hits a founder-gated DELETE endpoint and
  // refreshes the audit stats/list so the row disappears in place.
  const deleteFallbackAuditArchiveMut = useMutation({
    mutationFn: async (archiveName: string) => {
      const r = await fetch(
        `/api/admin/broadcasts/fallback-default-preset-audit/archives/${encodeURIComponent(archiveName)}`,
        { method: "DELETE", credentials: "include" },
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body?.ok) {
        throw new Error(
          body?.message || body?.error || "Failed to delete audit archive",
        );
      }
      return body as { ok: true; deleted: string };
    },
    onSuccess: (body) => {
      setFallbackAuditRetentionMsg(`Deleted archive → ${body.deleted}`);
      invalidateFallbackPresetAudit();
    },
    onError: (e: any) => {
      setFallbackAuditRetentionMsg(String(e?.message ?? e));
    },
  });

  // T337 — Force-rotate the active fallback-preset audit log on demand so
  // admins can verify their freshly tuned retention values produced the
  // expected archive without waiting for the active file to organically
  // fill up. Reuses the same status message slot as the retention save
  // flow so the user only has one place to look for feedback.
  const forceRotateFallbackAuditMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(
        "/api/admin/broadcasts/fallback-default-preset-audit/force-rotate",
        { method: "POST", credentials: "include" },
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body?.ok) {
        throw new Error(
          body?.message || body?.error || "Failed to force-rotate audit log",
        );
      }
      return body as { ok: true; archiveName: string };
    },
    onSuccess: (body) => {
      setFallbackAuditRetentionMsg(`Rotated → ${body.archiveName}`);
      invalidateFallbackPresetAudit();
    },
    onError: (e: any) => {
      setFallbackAuditRetentionMsg(String(e?.message ?? e));
    },
  });
  const saveFallbackAuditRetention = () => {
    const stats = fallbackPresetAuditStats;
    const limits = stats?.limits;
    const payload: { maxBytes?: number; maxArchives?: number } = {};
    if (fallbackAuditBytesKibDraft !== "") {
      const kib = Number(fallbackAuditBytesKibDraft);
      if (!Number.isFinite(kib) || kib <= 0) {
        setFallbackAuditRetentionMsg(
          "Max file size must be a positive number of KiB.",
        );
        return;
      }
      const bytes = Math.floor(kib * 1024);
      if (limits && (bytes < limits.bytesMin || bytes > limits.bytesMax)) {
        setFallbackAuditRetentionMsg(
          `Max file size must be between ${Math.ceil(limits.bytesMin / 1024)} and ${Math.floor(limits.bytesMax / 1024)} KiB.`,
        );
        return;
      }
      if (bytes !== stats?.maxBytes) payload.maxBytes = bytes;
    }
    if (fallbackAuditArchivesDraft !== "") {
      const n = Number(fallbackAuditArchivesDraft);
      if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
        setFallbackAuditRetentionMsg(
          "Archive count must be a positive integer.",
        );
        return;
      }
      if (limits && (n < limits.archivesMin || n > limits.archivesMax)) {
        setFallbackAuditRetentionMsg(
          `Archive count must be between ${limits.archivesMin} and ${limits.archivesMax}.`,
        );
        return;
      }
      if (n !== stats?.maxArchives) payload.maxArchives = n;
    }
    if (
      payload.maxBytes === undefined &&
      payload.maxArchives === undefined
    ) {
      setFallbackAuditRetentionMsg("No changes to save.");
      return;
    }
    // Guard: lowering "max archives" below the current archive count will
    // prune the oldest history on the next rotation. Mirrors the cover-/
    // media-sweep panels' shrink confirmation.
    if (
      payload.maxArchives !== undefined &&
      typeof stats?.archiveCount === "number" &&
      payload.maxArchives < stats.archiveCount
    ) {
      const pruneCount = stats.archiveCount - payload.maxArchives;
      if (
        !window.confirm(
          `Lowering "max archives kept" to ${payload.maxArchives} will permanently delete ${pruneCount} existing archive${pruneCount === 1 ? "" : "s"} (oldest first) on the next rotation. This audit history cannot be recovered. Continue?`,
        )
      ) {
        return;
      }
    }
    // Guard: lowering "max file size" below the active file's size means
    // the next append will immediately rotate.
    if (
      payload.maxBytes !== undefined &&
      typeof stats?.maxBytes === "number" &&
      payload.maxBytes < stats.maxBytes
    ) {
      const activeBytes = stats.activeBytes ?? 0;
      const willRotateNow = activeBytes >= payload.maxBytes;
      const kib = Math.round(payload.maxBytes / 1024);
      const msg = willRotateNow
        ? `The active audit file is ${Math.round(activeBytes / 1024)} KiB, which already exceeds the new max of ${kib} KiB. It will rotate to an archive on the next preset change. Continue?`
        : `Lowering "max file size" to ${kib} KiB means the active audit file will rotate sooner and more often, producing more archive files. Continue?`;
      if (!window.confirm(msg)) {
        return;
      }
    }
    setFallbackAuditRetentionMsg(null);
    saveFallbackAuditRetentionMut.mutate(payload);
  };

  // T324 — Admin-tunable retention for the fallback-preset audit log.
  // Mirrors the cover- and media-sweep "audit retention" controls so
  // founders can configure all three logs the same way from the dashboard.
  type FallbackPresetAuditRetentionStatus = {
    auditMaxBytes: number;
    auditMaxArchives: number;
    auditMaxBytesSource: "db" | "env" | "default";
    auditMaxArchivesSource: "db" | "env" | "default";
    auditLimits: {
      bytesMin: number;
      bytesMax: number;
      archivesMin: number;
      archivesMax: number;
      bytesDefault: number;
      archivesDefault: number;
    };
    currentArchiveCount?: number;
    activeAuditBytes?: number | null;
  };
  const fallbackPresetRetentionQ = useQuery<{
    ok: boolean;
    status: FallbackPresetAuditRetentionStatus;
  }>({
    queryKey: ["/api/admin/broadcasts/fallback-default-preset-audit/retention"],
    queryFn: async () => {
      const r = await fetch(
        "/api/admin/broadcasts/fallback-default-preset-audit/retention",
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to load fallback preset audit retention");
      return r.json();
    },
    enabled: manageViewsOpen,
  });
  const fallbackPresetRetention =
    fallbackPresetRetentionQ.data?.status ?? null;
  const invalidateFallbackPresetRetention = () =>
    qc.invalidateQueries({
      queryKey: [
        "/api/admin/broadcasts/fallback-default-preset-audit/retention",
      ],
    });
  const [fpRetentionBytesKibDraft, setFpRetentionBytesKibDraft] = useState("");
  const [fpRetentionArchivesDraft, setFpRetentionArchivesDraft] = useState("");
  const [fpRetentionMsg, setFpRetentionMsg] = useState<string | null>(null);
  // Hydrate drafts when the retention status first loads.
  useEffect(() => {
    if (!fallbackPresetRetention) return;
    setFpRetentionBytesKibDraft((prev) =>
      prev === ""
        ? String(Math.round(fallbackPresetRetention.auditMaxBytes / 1024))
        : prev,
    );
    setFpRetentionArchivesDraft((prev) =>
      prev === "" ? String(fallbackPresetRetention.auditMaxArchives) : prev,
    );
  }, [fallbackPresetRetention]);
  const fmtKiB = (bytes: number): string => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`;
    return `${bytes} B`;
  };
  const saveFallbackPresetRetentionMut = useMutation({
    mutationFn: async (payload: { maxBytes?: number; maxArchives?: number }) => {
      let csrf: string | null = null;
      try {
        const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
        const j = await t.json().catch(() => ({}));
        csrf = (j?.csrfToken as string) || null;
      } catch {
        /* ignore */
      }
      const r = await fetch(
        "/api/admin/broadcasts/fallback-default-preset-audit/retention",
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
          body: JSON.stringify(payload),
        },
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body?.ok) {
        throw new Error(body?.error || body?.message || "update_failed");
      }
      return body as {
        ok: boolean;
        status: FallbackPresetAuditRetentionStatus;
      };
    },
    onSuccess: (body) => {
      setFpRetentionMsg("Audit retention updated");
      if (body.status) {
        setFpRetentionBytesKibDraft(
          String(Math.round(body.status.auditMaxBytes / 1024)),
        );
        setFpRetentionArchivesDraft(String(body.status.auditMaxArchives));
      }
      invalidateFallbackPresetRetention();
    },
    onError: (e: any) => {
      setFpRetentionMsg(String(e?.message ?? e) || "Could not update retention");
    },
  });
  const saveFallbackPresetRetention = () => {
    const limits = fallbackPresetRetention?.auditLimits;
    const payload: { maxBytes?: number; maxArchives?: number } = {};
    if (fpRetentionBytesKibDraft !== "") {
      const kib = Number(fpRetentionBytesKibDraft);
      if (!Number.isFinite(kib) || kib <= 0) {
        setFpRetentionMsg("Max file size must be a positive number of KiB.");
        return;
      }
      const bytes = Math.floor(kib * 1024);
      if (limits && (bytes < limits.bytesMin || bytes > limits.bytesMax)) {
        setFpRetentionMsg(
          `Max file size must be between ${fmtKiB(limits.bytesMin)} and ${fmtKiB(limits.bytesMax)}.`,
        );
        return;
      }
      if (bytes !== fallbackPresetRetention?.auditMaxBytes) {
        payload.maxBytes = bytes;
      }
    }
    if (fpRetentionArchivesDraft !== "") {
      const n = Number(fpRetentionArchivesDraft);
      if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
        setFpRetentionMsg("Archive count must be a positive integer.");
        return;
      }
      if (limits && (n < limits.archivesMin || n > limits.archivesMax)) {
        setFpRetentionMsg(
          `Archive count must be between ${limits.archivesMin} and ${limits.archivesMax}.`,
        );
        return;
      }
      if (n !== fallbackPresetRetention?.auditMaxArchives) {
        payload.maxArchives = n;
      }
    }
    if (payload.maxBytes === undefined && payload.maxArchives === undefined) {
      setFpRetentionMsg("No changes to save.");
      return;
    }
    // Guard: lowering "max archives" below the current archive count will
    // prune the oldest history on the next rotation. Make the admin confirm.
    if (
      payload.maxArchives !== undefined &&
      typeof fallbackPresetRetention?.currentArchiveCount === "number" &&
      payload.maxArchives < fallbackPresetRetention.currentArchiveCount
    ) {
      const pruneCount =
        fallbackPresetRetention.currentArchiveCount - payload.maxArchives;
      if (
        !window.confirm(
          `Lowering "max archives kept" to ${payload.maxArchives} will permanently delete ${pruneCount} existing archive${pruneCount === 1 ? "" : "s"} (oldest first) on the next rotation. Continue?`,
        )
      ) {
        return;
      }
    }
    if (
      payload.maxBytes !== undefined &&
      typeof fallbackPresetRetention?.auditMaxBytes === "number" &&
      payload.maxBytes < fallbackPresetRetention.auditMaxBytes
    ) {
      const activeBytes = fallbackPresetRetention.activeAuditBytes ?? 0;
      const willRotateNow = activeBytes >= payload.maxBytes;
      const msg = willRotateNow
        ? `The active audit file is ${fmtKiB(activeBytes)}, which already exceeds the new max of ${fmtKiB(payload.maxBytes)}. It will rotate to an archive on the next append. Continue?`
        : `Lowering "max file size" to ${fmtKiB(payload.maxBytes)} means the active audit file will rotate sooner and more often, producing more archive files. Continue?`;
      if (!window.confirm(msg)) return;
    }
    setFpRetentionMsg(null);
    saveFallbackPresetRetentionMut.mutate(payload);
  };

  // T270 — Schedule audit history (last N entries from JSONL log on disk).
  const [scheduleAuditLimit, setScheduleAuditLimit] = useState(20);
  type ScheduleAuditEntry = {
    id: string | null;
    ts: string | null;
    viewId: string | null;
    viewName: string | null;
    actorId: string;
    actorType: string;
    actor: { displayName: string; email: string | null; role: string | null };
    before: SavedViewScheduleShape | null;
    after: SavedViewScheduleShape | null;
  };
  type ScheduleAuditResponse = {
    ok: boolean;
    entries: ScheduleAuditEntry[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  const scheduleAuditQ = useQuery<ScheduleAuditResponse>({
    queryKey: [
      "/api/admin/broadcasts/saved-view-schedule-audit",
      scheduleAuditLimit,
    ],
    queryFn: async () => {
      const r = await fetch(
        `/api/admin/broadcasts/saved-view-schedule-audit?limit=${scheduleAuditLimit}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to load schedule audit log");
      return r.json();
    },
    enabled: manageViewsOpen,
  });
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});

  const applySavedView = (view: SavedView) => {
    setFilterDryRun(view.dryRun);
    setFilterStatus(view.status);
    setFilterPackageId(view.packageId);
    toast({
      title: view.scope === "shared" ? "Shared view applied" : "View applied",
      description: view.name,
    });
  };

  const createViewMut = useMutation({
    mutationFn: async (payload: {
      name: string;
      scope: "private" | "shared";
      dryRun: "all" | "dry" | "live";
      status: string;
      packageId: string;
    }) => {
      const r = await apiRequest(
        "POST",
        "/api/admin/broadcasts/saved-views",
        payload,
      );
      return r.json();
    },
    onSuccess: (_data, vars) => {
      invalidateSavedViews();
      setNewViewName("");
      setNewViewShared(false);
      setSaveViewOpen(false);
      toast({
        title: vars.scope === "shared" ? "Shared view saved" : "View saved",
        description: vars.name,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not save view",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });
  const saveCurrentAsView = () => {
    const name = newViewName.trim();
    if (!name) return;
    createViewMut.mutate({
      name,
      scope: newViewShared ? "shared" : "private",
      dryRun: filterDryRun,
      status: filterStatus,
      packageId: filterPackageId.trim(),
    });
  };

  // T301 — Auto-derive a sensible shared-view name from the dashboard's
  // currently active filter chips + the clicked weekday/hour, so the common
  // "cover this gap with what I'm already looking at" flow is a single click
  // (no name retyping). Admins can still rename after via the inline input or
  // Manage views.
  const deriveCoverViewName = useCallback(
    (day: number, hour: number): string => {
      const parts: string[] = [];
      if (filterDryRun === "live") parts.push("Live");
      else if (filterDryRun === "dry") parts.push("Dry-run");
      if (filterStatus !== "all") parts.push(filterStatus);
      const pkg = filterPackageId.trim();
      if (pkg) parts.push(`pkg:${pkg}`);
      const head = parts.length ? parts.join(" ") : "All broadcasts";
      return `${head} · ${SCHEDULE_DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00`;
    },
    [filterDryRun, filterStatus, filterPackageId],
  );

  // T290 — Inline "Create new shared view to cover this hour" flow inside
  // the coverage popover gap cell. We capture a name + the (day, hour) the
  // admin clicked, create a shared shell view, then immediately route them
  // into the schedule editor with that one-hour window pre-filled so the
  // end-to-end "no view yet → covered" path is a single popover interaction.
  // `coverNewViewName` lives higher up so popover-close effects can reset it.
  const createViewForCellMut = useMutation({
    mutationFn: async (payload: {
      name: string;
      day: number;
      hour: number;
    }) => {
      const r = await apiRequest("POST", "/api/admin/broadcasts/saved-views", {
        name: payload.name,
        scope: "shared" as const,
        dryRun: filterDryRun,
        status: filterStatus,
        packageId: filterPackageId.trim(),
      });
      const body = await r.json();
      return { body, day: payload.day, hour: payload.hour };
    },
    onSuccess: async ({ body, day, hour }) => {
      await invalidateSavedViews();
      const created = body?.view as SavedView | undefined;
      if (!created) {
        toast({
          title: "Created view, but couldn't open editor",
          description: "Open it from Manage views to add a window.",
          variant: "destructive",
        });
        return;
      }
      setCoverNewViewName("");
      toast({
        title: "Shared view created",
        description: `Opening schedule editor with ${SCHEDULE_DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00 pre-filled.`,
      });
      openScheduleEditorForCell(created, day, hour);
    },
    onError: (err: any) => {
      toast({
        title: "Could not create view",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateViewMut = useMutation({
    mutationFn: async (payload: {
      id: string;
      name?: string;
      scope?: "private" | "shared";
    }) => {
      const { id, ...body } = payload;
      const r = await apiRequest(
        "PATCH",
        `/api/admin/broadcasts/saved-views/${id}`,
        body,
      );
      return r.json();
    },
    onSuccess: () => invalidateSavedViews(),
    onError: (err: any) => {
      toast({
        title: "Could not update view",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });
  const renameSavedView = (id: string) => {
    const draft = (renameDraft[id] ?? "").trim();
    if (!draft) return;
    updateViewMut.mutate(
      { id, name: draft },
      {
        onSuccess: () => {
          setRenameDraft((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          toast({ title: "View renamed", description: draft });
        },
      },
    );
  };
  const setTeamDefaultMut = useMutation({
    mutationFn: async (payload: { id: string; isTeamDefault: boolean }) => {
      const r = await apiRequest(
        "PATCH",
        `/api/admin/broadcasts/saved-views/${payload.id}`,
        { isTeamDefault: payload.isTeamDefault },
      );
      return r.json();
    },
    onSuccess: () => invalidateSavedViews(),
    onError: (err: any) => {
      toast({
        title: "Could not update team default",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });
  const toggleTeamDefault = (view: SavedView) => {
    const next = !view.isTeamDefault;
    setTeamDefaultMut.mutate(
      { id: view.id, isTeamDefault: next },
      {
        onSuccess: () => {
          toast({
            title: next
              ? "Pinned as team default"
              : "Removed as team default",
            description: view.name,
          });
        },
      },
    );
  };

  // T263 — Schedule editor state + mutation. Founders can edit per-view
  // schedules from the Manage dialog. Drafts are kept locally until Save.
  const [scheduleDraft, setScheduleDraft] = useState<Record<string, SavedViewSchedule>>({});
  // T271 — Compute coverage diagnostics with a specific view's draft schedule
  // substituted in. Used to preview what saving would do *before* the user
  // commits. Pass `draft=null` to simulate clearing the schedule.
  const draftScheduleDiagnostics = useCallback(
    (viewId: string, draft: SavedViewSchedule | null): ScheduleDiagnostics => {
      const sources = sharedViews
        .map((v) => {
          const sched = v.id === viewId ? draft : v.schedule;
          if (!sched || !sched.enabled || !sched.windows.length) return null;
          return { id: v.id, name: v.name, schedule: sched };
        })
        .filter((s): s is { id: string; name: string; schedule: SavedViewScheduleShape } => !!s);
      return computeScheduleDiagnostics(sources);
    },
    [sharedViews],
  );
  const setScheduleMut = useMutation({
    mutationFn: async (payload: { id: string; schedule: SavedViewSchedule | null }) => {
      const r = await apiRequest(
        "PATCH",
        `/api/admin/broadcasts/saved-views/${payload.id}`,
        { schedule: payload.schedule },
      );
      return r.json();
    },
    onSuccess: () => {
      invalidateSavedViews();
      qc.invalidateQueries({
        queryKey: ["/api/admin/broadcasts/saved-view-schedule-audit"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not update schedule",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });
  // T295/T304 — Per-change bounds, edit application, and overlap validation
  // are pure helpers exported from ./broadcastSchedule so they can be unit-
  // tested directly (see tests/broadcast-schedule-suggest-fix-edit.test.ts).
  const getChangeBounds = getSuggestionChangeBounds;
  const buildEditedChange = buildEditedSuggestionChange;
  const applyChangesToSchedule = applyCoverageChangesToSchedule;
  // T318 — Merge any sibling "Cover original day too" extras into each
  // suggestion's change list so the existing edit/validation/apply pipeline
  // treats them like first-class heuristic changes.
  const effectiveSuggestions = useMemo(
    () =>
      visibleSuggestions.map((s) => {
        const extras = suggestionExtraChanges[s.viewId];
        if (!extras || extras.length === 0) return s;
        return { ...s, changes: [...s.changes, ...extras] };
      }),
    [visibleSuggestions, suggestionExtraChanges],
  );
  const editedSuggestionMap = useMemo(
    () => buildEditedSuggestionMap(effectiveSuggestions, suggestionEdits),
    [effectiveSuggestions, suggestionEdits],
  );
  const suggestionValidationErrors = useMemo(
    () =>
      validateEditedSuggestions({
        suggestions: effectiveSuggestions,
        editedMap: editedSuggestionMap,
        acceptedSuggestionIds,
        sharedViews: sharedViews.map((v) => ({
          id: v.id,
          name: v.name,
          schedule: v.schedule ?? null,
        })),
      }),
    [
      effectiveSuggestions,
      editedSuggestionMap,
      acceptedSuggestionIds,
      sharedViews,
    ],
  );
  // T315 — Non-blocking warnings for accepted edits that (typically via a
  // day-override) leave the originally-targeted gap day still uncovered.
  const suggestionCoverageWarnings = useMemo(
    () =>
      computeUncoveredOriginalGapWarnings({
        suggestions: effectiveSuggestions,
        editedMap: editedSuggestionMap,
        acceptedSuggestionIds,
        sharedViews: sharedViews.map((v) => ({
          id: v.id,
          name: v.name,
          schedule: v.schedule ?? null,
        })),
      }),
    [
      effectiveSuggestions,
      editedSuggestionMap,
      acceptedSuggestionIds,
      sharedViews,
    ],
  );
  const suggestionCoverageWarningById = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const w of suggestionCoverageWarnings) {
      m.set(w.viewId, w.uncoveredDays);
    }
    return m;
  }, [suggestionCoverageWarnings]);
  const setSuggestionChangeOverride = (
    viewId: string,
    changeIndex: number,
    patch: SuggestionEditOverride,
  ) => {
    setSuggestionEdits((prev) => {
      const forView = { ...(prev[viewId] ?? {}) };
      const current = forView[changeIndex] ?? {};
      forView[changeIndex] = { ...current, ...patch };
      return { ...prev, [viewId]: forView };
    });
    setLastCoverAllBatch(null);
  };
  // T318 — Append sibling add-window changes for each day listed in the
  // warning. Deduped against existing extras so clicking twice is a no-op.
  const coverOriginalDayForSuggestion = (
    viewId: string,
    uncoveredDays: number[],
  ) => {
    const suggestion = coverageSuggestions.suggestions.find(
      (s) => s.viewId === viewId,
    );
    if (!suggestion) return;
    const existing = suggestionExtraChanges[viewId] ?? [];
    const seen = new Set(
      existing.map((c) =>
        c.kind === "add-window"
          ? `${c.day}|${c.startMinute}|${c.endMinute}`
          : "",
      ),
    );
    const fresh = buildOriginalDayCoverageChanges(
      suggestion.changes,
      uncoveredDays,
    ).filter((c) => {
      if (c.kind !== "add-window") return false;
      const key = `${c.day}|${c.startMinute}|${c.endMinute}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length === 0) return;
    setSuggestionExtraChanges((prev) => ({
      ...prev,
      [viewId]: [...(prev[viewId] ?? []), ...fresh],
    }));
    // Make sure the suggestion is selected so the appended windows actually
    // get applied (and the overlap guard runs against them).
    setAcceptedSuggestionIds((prev) => {
      if (prev.has(viewId)) return prev;
      const next = new Set(prev);
      next.add(viewId);
      return next;
    });
    setLastCoverAllBatch(null);
  };
  // T332 — Batch version of `coverOriginalDayForSuggestion`. Walks every
  // currently-flagged warning and appends sibling add-window extras for each,
  // skipping any view whose sibling cover would trip the overlap guard so the
  // remaining views still get cleared in one click.
  const coverAllFlaggedDays = () => {
    if (suggestionCoverageWarnings.length < 2) return;
    const workingExtras: Record<string, CoverageSuggestionChange[]> = {
      ...suggestionExtraChanges,
    };
    const committed: Record<string, CoverageSuggestionChange[]> = {};
    const newlyAcceptedIds = new Set<string>();
    const sharedViewsLite = sharedViews.map((v) => ({
      id: v.id,
      name: v.name,
      schedule: v.schedule ?? null,
    }));
    // T340 — Track which views the batch covered vs skipped (and the
    // conflicting view's name where the overlap guard reported one) so the
    // post-click toast can give the admin an immediate, named summary.
    const coveredNames: string[] = [];
    const skippedEntries: { name: string; conflictsWith?: string }[] = [];
    for (const warning of suggestionCoverageWarnings) {
      const suggestion = coverageSuggestions.suggestions.find(
        (s) => s.viewId === warning.viewId,
      );
      if (!suggestion) continue;
      const existing = workingExtras[warning.viewId] ?? [];
      const seen = new Set(
        existing.map((c) =>
          c.kind === "add-window"
            ? `${c.day}|${c.startMinute}|${c.endMinute}`
            : "",
        ),
      );
      const fresh = buildOriginalDayCoverageChanges(
        suggestion.changes,
        warning.uncoveredDays,
      ).filter((c) => {
        if (c.kind !== "add-window") return false;
        const key = `${c.day}|${c.startMinute}|${c.endMinute}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (fresh.length === 0) continue;
      const trialExtras: Record<string, CoverageSuggestionChange[]> = {
        ...workingExtras,
        [warning.viewId]: [...existing, ...fresh],
      };
      const trialEffective = visibleSuggestions.map((s) => {
        const extras = trialExtras[s.viewId];
        if (!extras || extras.length === 0) return s;
        return { ...s, changes: [...s.changes, ...extras] };
      });
      const trialAccepted = new Set(acceptedSuggestionIds);
      trialAccepted.add(warning.viewId);
      for (const id of newlyAcceptedIds) trialAccepted.add(id);
      const trialEditedMap = buildEditedSuggestionMap(
        trialEffective,
        suggestionEdits,
      );
      const trialErrors = validateEditedSuggestions({
        suggestions: trialEffective,
        editedMap: trialEditedMap,
        acceptedSuggestionIds: trialAccepted,
        sharedViews: sharedViewsLite,
      });
      if (trialErrors[warning.viewId]) {
        // Sibling cover would trip the overlap guard for this view — skip
        // and remember why so the post-click toast can name the conflicting
        // view. Per-view warning + action remain available.
        // T340 — error format from validateEditedSuggestions is
        // "Edits would overlap with X, Y" — extract the name(s) for the
        // toast where present.
        const msg = trialErrors[warning.viewId];
        const m = /^Edits would overlap with (.+)$/.exec(msg);
        skippedEntries.push({
          name: suggestion.viewName,
          conflictsWith: m ? m[1] : undefined,
        });
        continue;
      }
      workingExtras[warning.viewId] = [...existing, ...fresh];
      committed[warning.viewId] = fresh;
      coveredNames.push(suggestion.viewName);
      if (!acceptedSuggestionIds.has(warning.viewId)) {
        newlyAcceptedIds.add(warning.viewId);
      }
    }
    if (Object.keys(committed).length === 0) {
      // T340 — Nothing committed (every flagged view tripped the overlap
      // guard). Tell the admin so they don't think the click did nothing,
      // and point them at the per-view actions.
      toast({
        title: "No batch covers applied",
        description:
          skippedEntries.length > 0
            ? `Every flagged view would overlap with another view (${skippedEntries
                .map((e) =>
                  e.conflictsWith
                    ? `${e.name} → ${e.conflictsWith}`
                    : e.name,
                )
                .join(", ")}). Use the per-view "Cover original day too" buttons.`
            : 'Use the per-view "Cover original day too" buttons instead.',
        variant: "destructive",
      });
      return;
    }
    setSuggestionExtraChanges((prev) => {
      const next = { ...prev };
      for (const [vid, fresh] of Object.entries(committed)) {
        next[vid] = [...(next[vid] ?? []), ...fresh];
      }
      return next;
    });
    if (newlyAcceptedIds.size > 0) {
      setAcceptedSuggestionIds((prev) => {
        const next = new Set(prev);
        for (const id of newlyAcceptedIds) next.add(id);
        return next;
      });
    }
    // T341 — Snapshot just what this batch added so a follow-up Undo click
    // can back it out without touching earlier per-view extras or
    // previously-accepted ids.
    const snapshotExtras: CoverAllBatchSnapshot["extras"] = {};
    for (const [vid, fresh] of Object.entries(committed)) {
      snapshotExtras[vid] = fresh
        .filter(
          (c): c is Extract<CoverageSuggestionChange, { kind: "add-window" }> =>
            c.kind === "add-window",
        )
        .map((c) => ({
          day: c.day,
          startMinute: c.startMinute,
          endMinute: c.endMinute,
        }));
    }
    setLastCoverAllBatch({
      extras: snapshotExtras,
      newlyAcceptedIds: Array.from(newlyAcceptedIds),
    });
    // T340 — Confirm the result to the admin. If nothing was skipped, just
    // confirm success; otherwise list which views were covered and which
    // were skipped (with the conflicting view's name where the overlap
    // guard reported one).
    const coveredPart = `Covered ${coveredNames.join(" + ")}`;
    if (skippedEntries.length === 0) {
      toast({
        title: "Cover all flagged days",
        description: `${coveredPart}.`,
      });
    } else {
      const skippedPart = skippedEntries
        .map((e) =>
          e.conflictsWith
            ? `${e.name} (would overlap with ${e.conflictsWith})`
            : e.name,
        )
        .join(", ");
      toast({
        title: "Cover all flagged days",
        description: `${coveredPart}. Skipped ${skippedPart}.`,
      });
    }
  };
  // T341 — Reverse the most recent "Cover all flagged days" batch: drop only
  // the sibling extras that batch appended (matched by day/start/end so any
  // earlier per-view extras are left alone) and unset only the views the
  // batch newly accepted.
  const undoCoverAllFlaggedDays = () => {
    const snapshot = lastCoverAllBatch;
    if (!snapshot) return;
    setSuggestionExtraChanges((prev) => {
      const out: Record<string, CoverageSuggestionChange[]> = { ...prev };
      for (const [vid, removed] of Object.entries(snapshot.extras)) {
        const arr = prev[vid];
        if (!arr || arr.length === 0) continue;
        const toRemove = new Map<string, number>();
        for (const r of removed) {
          const key = `${r.day}|${r.startMinute}|${r.endMinute}`;
          toRemove.set(key, (toRemove.get(key) ?? 0) + 1);
        }
        const kept: CoverageSuggestionChange[] = [];
        for (const c of arr) {
          if (c.kind === "add-window") {
            const key = `${c.day}|${c.startMinute}|${c.endMinute}`;
            const remaining = toRemove.get(key) ?? 0;
            if (remaining > 0) {
              toRemove.set(key, remaining - 1);
              continue;
            }
          }
          kept.push(c);
        }
        if (kept.length === 0) delete out[vid];
        else out[vid] = kept;
      }
      return out;
    });
    if (snapshot.newlyAcceptedIds.length > 0) {
      setAcceptedSuggestionIds((prev) => {
        const next = new Set(prev);
        for (const id of snapshot.newlyAcceptedIds) next.delete(id);
        return next;
      });
    }
    setLastCoverAllBatch(null);
  };
  const removeSuggestionExtraChange = (viewId: string, extraIndex: number) => {
    setSuggestionExtraChanges((prev) => {
      const arr = prev[viewId];
      if (!arr || extraIndex < 0 || extraIndex >= arr.length) return prev;
      const next = arr.slice();
      next.splice(extraIndex, 1);
      const out = { ...prev };
      if (next.length === 0) delete out[viewId];
      else out[viewId] = next;
      return out;
    });
    setLastCoverAllBatch(null);
  };
  const resetSuggestionChangeOverride = (
    viewId: string,
    changeIndex: number,
  ) => {
    setSuggestionEdits((prev) => {
      const forView = { ...(prev[viewId] ?? {}) };
      delete forView[changeIndex];
      const next = { ...prev };
      if (Object.keys(forView).length === 0) {
        delete next[viewId];
      } else {
        next[viewId] = forView;
      }
      return next;
    });
    setLastCoverAllBatch(null);
  };
  // T284 — Apply admin-selected coverage-fix suggestions by patching each
  // affected view's schedule. Mutations run sequentially so an early failure
  // surfaces a useful toast without spamming the user with parallel errors.
  // T295 — Use the admin-edited "after" schedule (if any tweaks were made).
  const [applyingSuggestions, setApplyingSuggestions] = useState(false);
  const applySelectedSuggestions = async () => {
    const selected = effectiveSuggestions.filter((s) =>
      acceptedSuggestionIds.has(s.viewId),
    );
    if (!selected.length) return;
    if (selected.some((s) => suggestionValidationErrors[s.viewId])) return;
    setApplyingSuggestions(true);
    setLastCoverAllBatch(null);
    let applied = 0;
    try {
      for (const s of selected) {
        const edited = editedSuggestionMap.get(s.viewId);
        const after = edited?.after ?? s.after;
        await setScheduleMut.mutateAsync({ id: s.viewId, schedule: after });
        applied++;
      }
      toast({
        title: "Coverage fixes applied",
        description: `${applied} view${applied === 1 ? "" : "s"} updated`,
      });
      setSuggestionsDialogOpen(false);
    } catch {
      // setScheduleMut's onError already toasts; just stop here.
    } finally {
      setApplyingSuggestions(false);
    }
  };
  // T296 — Build the schedule the "new fallback view" mode would install.
  // When extension suggestions are also selected, the fallback only needs to
  // cover the gaps those extensions can't absorb (`unresolvedGaps`). When
  // they're not, it has to cover every initial gap on its own. Memoized so
  // the dialog preview and the apply handler always agree on what windows
  // will be created.
  const fallbackGaps = useMemo(
    () =>
      selectFallbackGaps(
        suggestionMode,
        acceptedSuggestionIds.size,
        visibleSuggestions.length,
        coverageSuggestions.initialGaps,
        coverageSuggestions.unresolvedGaps,
      ),
    [
      suggestionMode,
      acceptedSuggestionIds,
      coverageSuggestions.initialGaps,
      coverageSuggestions.unresolvedGaps,
      visibleSuggestions.length,
    ],
  );
  const fallbackSchedule = useMemo(
    () => buildScheduleFromGaps(fallbackGaps),
    [fallbackGaps],
  );
  const applyNewFallbackView = async () => {
    const name = fallbackViewName.trim();
    if (!name) return;
    if (fallbackSchedule.windows.length === 0) return;
    setApplyingSuggestions(true);
    try {
      const selectedExt = effectiveSuggestions.filter((s) =>
        acceptedSuggestionIds.has(s.viewId),
      );
      const result = await applyNewFallbackViewFlow(
        {
          name,
          schedule: fallbackSchedule,
          selectedExtensions: selectedExt.map((s) => {
            const edited = editedSuggestionMap.get(s.viewId);
            return { viewId: s.viewId, after: edited?.after ?? s.after };
          }),
          // T305 — Fallback filters are now editable inline in the dialog,
          // defaulting to the dashboard's currently-applied filters when the
          // dialog opens (see openSuggestionsDialog). Pass the per-instance
          // edits as `filters` and keep `useCurrentFilters: true` so the
          // helper persists exactly those values (it already trims packageId
          // in that branch).
          filters: {
            dryRun: fallbackDryRun,
            status: fallbackStatus,
            packageId: fallbackPackageId,
          },
          useCurrentFilters: true,
        },
        {
          postSavedView: async (body) => {
            const createRes = await apiRequest(
              "POST",
              "/api/admin/broadcasts/saved-views",
              body,
            );
            const createJson = (await createRes.json()) as {
              ok?: boolean;
              view?: { id: string };
            };
            const newId = createJson?.view?.id;
            if (!newId) throw new Error("Created view missing id");
            return { id: newId };
          },
          patchSchedule: async (id, schedule) => {
            await setScheduleMut.mutateAsync({ id, schedule });
          },
        },
      );
      if (!result) return;
      invalidateSavedViews();
      toast({
        title: "Fallback view created",
        description: `${name} now covers ${fallbackSchedule.windows.length} window${fallbackSchedule.windows.length === 1 ? "" : "s"}`,
      });
      setSuggestionsDialogOpen(false);
    } catch (err: any) {
      toast({
        title: "Could not create fallback view",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setApplyingSuggestions(false);
    }
  };
  const describeCoverageChange = (c: CoverageSuggestionChange): string => {
    const dayLabel = SCHEDULE_DAY_LABELS[c.day];
    if (c.kind === "extend-end") {
      return `Extend ${dayLabel} window to end at ${minutesToHHMM(c.to)} (was ${minutesToHHMM(c.from)})`;
    }
    if (c.kind === "extend-start") {
      return `Extend ${dayLabel} window to start at ${minutesToHHMM(c.to)} (was ${minutesToHHMM(c.from)})`;
    }
    return `Add window ${dayLabel} ${minutesToHHMM(c.startMinute)}–${minutesToHHMM(c.endMinute)}`;
  };
  const openScheduleEditor = (view: SavedView) => {
    setScheduleDraft((prev) => ({
      ...prev,
      [view.id]: view.schedule
        ? {
            enabled: view.schedule.enabled,
            timezone: "local",
            windows: view.schedule.windows.map((w) => ({
              days: [...w.days],
              startMinute: w.startMinute,
              endMinute: w.endMinute,
            })),
          }
        : {
            enabled: true,
            timezone: "local",
            windows: [{ days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60 }],
          },
    }));
  };
  // T283 — Open the schedule editor for `view` and seed/extend the draft
  // so a (day, hour..hour+1) window is present. Used by "Cover with view…"
  // from the coverage popover so admins don't have to reconstruct the
  // clicked weekday/hour by hand in Manage views.
  const openScheduleEditorForCell = (
    view: SavedView,
    day: number,
    hour: number,
  ) => {
    const startMinute = hour * 60;
    const endMinute = (hour + 1) * 60;
    setScheduleDraft((prev) => {
      const existing = prev[view.id];
      const base: SavedViewSchedule = existing
        ? {
            enabled: existing.enabled,
            timezone: existing.timezone,
            windows: existing.windows.map((w) => ({
              days: [...w.days],
              startMinute: w.startMinute,
              endMinute: w.endMinute,
            })),
          }
        : view.schedule
          ? {
              enabled: view.schedule.enabled,
              timezone: "local",
              windows: view.schedule.windows.map((w) => ({
                days: [...w.days],
                startMinute: w.startMinute,
                endMinute: w.endMinute,
              })),
            }
          : { enabled: true, timezone: "local", windows: [] };
      return {
        ...prev,
        [view.id]: {
          ...base,
          enabled: true,
          windows: [
            { days: [day], startMinute, endMinute },
            ...base.windows,
          ],
        },
      };
    });
    setManageViewsOpen(true);
    setCoveragePopoverOpen(false);
  };
  // T283 — Open the schedule editor for an overlapping view so the admin
  // can shrink/remove the conflicting window. No auto-edit; we just route
  // them to the right row in Manage views.
  const openScheduleEditorForOverlap = (view: SavedView) => {
    openScheduleEditor(view);
    setManageViewsOpen(true);
    setCoveragePopoverOpen(false);
  };
  const closeScheduleEditor = (id: string) => {
    setScheduleDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const updateScheduleDraft = (
    id: string,
    updater: (draft: SavedViewSchedule) => SavedViewSchedule,
  ) => {
    setScheduleDraft((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: updater(current) };
    });
  };
  const saveScheduleDraft = (view: SavedView) => {
    const draft = scheduleDraft[view.id];
    if (!draft) return;
    for (const w of draft.windows) {
      if (w.startMinute === w.endMinute) {
        toast({
          title: "Invalid schedule",
          description: "Each window needs a non-zero duration.",
          variant: "destructive",
        });
        return;
      }
      if (!w.days.length) {
        toast({
          title: "Invalid schedule",
          description: "Each window needs at least one day selected.",
          variant: "destructive",
        });
        return;
      }
    }
    setScheduleMut.mutate(
      { id: view.id, schedule: draft },
      {
        onSuccess: () => {
          closeScheduleEditor(view.id);
          toast({ title: "Schedule saved", description: view.name });
        },
      },
    );
  };
  const clearSchedule = (view: SavedView) => {
    setScheduleMut.mutate(
      { id: view.id, schedule: null },
      {
        onSuccess: () => {
          closeScheduleEditor(view.id);
          toast({ title: "Schedule cleared", description: view.name });
        },
      },
    );
  };
  const toggleViewScope = (view: SavedView) => {
    const nextScope: "private" | "shared" =
      view.scope === "shared" ? "private" : "shared";
    updateViewMut.mutate(
      { id: view.id, scope: nextScope },
      {
        onSuccess: () => {
          toast({
            title:
              nextScope === "shared"
                ? "View shared with team"
                : "View made private",
            description: view.name,
          });
        },
      },
    );
  };

  const deleteViewMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest(
        "DELETE",
        `/api/admin/broadcasts/saved-views/${id}`,
      );
      return r.json();
    },
    onSuccess: () => invalidateSavedViews(),
    onError: (err: any) => {
      toast({
        title: "Could not delete view",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });
  const deleteSavedView = (view: SavedView) => {
    deleteViewMut.mutate(view.id, {
      onSuccess: () => {
        toast({ title: "View deleted", description: view.name });
      },
    });
  };

  // T264: Compact "Pinned by X · 3h ago" line so admins can see accountability
  // at a glance and audit silent overrides without leaving the page.
  const teamDefaultPinLabel = (v: SavedView): string | null => {
    if (!v.isTeamDefault) return null;
    const who = v.teamDefaultSetBy?.displayName ?? "Unknown admin";
    if (!v.teamDefaultSetAt) return `Pinned by ${who}`;
    let when: string;
    try {
      when = formatDistanceToNow(new Date(v.teamDefaultSetAt), { addSuffix: true });
    } catch {
      when = new Date(v.teamDefaultSetAt).toLocaleString();
    }
    return `Pinned by ${who} · ${when}`;
  };
  const teamDefaultPinTooltip = (v: SavedView): string | null => {
    if (!v.isTeamDefault) return null;
    const who = v.teamDefaultSetBy?.displayName ?? "Unknown admin";
    const role = v.teamDefaultSetBy?.role ? ` (${v.teamDefaultSetBy.role})` : "";
    const when = v.teamDefaultSetAt
      ? new Date(v.teamDefaultSetAt).toLocaleString()
      : "unknown time";
    return `Pinned as team default by ${who}${role} on ${when}`;
  };

  const creatorTooltip = (v: SavedView) => {
    const parts: string[] = [];
    parts.push(`Created by: ${v.creator.displayName}`);
    if (v.creator.email) parts.push(`Email: ${v.creator.email}`);
    if (v.creator.role) parts.push(`Role: ${v.creator.role}`);
    if (v.creator.status === "disabled") {
      const when = v.creator.disabledAt
        ? ` on ${new Date(v.creator.disabledAt).toLocaleDateString()}`
        : "";
      parts.push(
        `Account status: disabled${when} — this admin can no longer sign in, so they cannot answer questions about this view.`,
      );
    } else if (v.creator.status === "removed") {
      parts.push(
        "Account status: removed — the creator account no longer exists. Consider deleting or reclaiming this shared view.",
      );
    }
    return parts.join("\n");
  };

  const creatorStatusBadge = (v: SavedView, testIdSuffix: string) => {
    const status = v.creator.status;
    if (status !== "disabled" && status !== "removed") return null;
    const label = status === "disabled" ? "disabled" : "removed";
    const tip =
      status === "disabled"
        ? `${v.creator.displayName} can no longer sign in${
            v.creator.disabledAt
              ? ` (disabled ${new Date(v.creator.disabledAt).toLocaleDateString()})`
              : ""
          }. This shared view is stale — ask another admin or delete it.`
        : `The creator account no longer exists. This shared view is stale — consider deleting it.`;
    return (
      <Badge
        variant="outline"
        className="ml-1 text-[10px] py-0 px-1.5 gap-1 border-amber-500/60 text-amber-600 dark:text-amber-400"
        title={tip}
        data-testid={`badge-creator-status-${testIdSuffix}-${v.id}`}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        {label}
      </Badge>
    );
  };

  const describeView = (v: {
    dryRun: "all" | "dry" | "live";
    status: string;
    packageId: string;
  }) => {
    const parts: string[] = [];
    parts.push(
      v.dryRun === "all"
        ? "any mode"
        : v.dryRun === "dry"
          ? "dry-run only"
          : "live only",
    );
    parts.push(v.status === "all" ? "any status" : `status: ${v.status}`);
    if (v.packageId) parts.push(`pkg: ${v.packageId}`);
    return parts.join(" · ");
  };

  const copyShareLink = async () => {
    if (typeof window === "undefined") return;
    // T288 — When sharing a scheduled-preview link, stamp the current admin's
    // display name onto the URL as `?sharedBy=<name>` so the recipient's
    // banner can name a person to ask follow-up questions instead of saying
    // "a teammate". Falls back gracefully if the viewer profile isn't loaded
    // yet or this isn't a scheduled-preview link.
    let href = window.location.href;
    // T297 — Track whether the sharer's own name will resolve in the staff
    // directory the recipient's banner uses. If it won't (typo, renamed
    // account, inactive/missing email), the recipient sees no "Message me"
    // button, so we warn the sharer at copy-time so they can fix it before
    // sending. Uses the same case-insensitive trimmed match as T292.
    let unreachableSharer = false;
    // T303 — When the sharer's name doesn't resolve in the staff directory,
    // suggest the 1-2 closest names so they know whether they have a typo,
    // need to rename an existing entry, or genuinely need to be added.
    let unreachableSuggestions: string[] = [];
    try {
      const url = new URL(href);
      const myName = savedViewsQ.data?.viewerDisplayName?.trim() ?? "";
      if (scheduledPreviewAt && myName) {
        const stamped = myName.slice(0, 80);
        url.searchParams.set("sharedBy", stamped);
        const dir = savedViewsQ.data?.staffDirectory ?? [];
        const target = stamped.trim().toLowerCase();
        const match = target
          ? dir.find(
              (c) =>
                c.displayName.trim().toLowerCase() === target &&
                !!c.email,
            )
          : undefined;
        unreachableSharer = !match;
        if (unreachableSharer && target) {
          // Normalize by lowercasing and stripping punctuation/whitespace
          // so "J. Doe" and "j doe" both reduce to "jdoe" for comparison.
          const normalize = (s: string) =>
            s.toLowerCase().replace(/[^a-z0-9]+/g, "");
          const lev = (a: string, b: string): number => {
            if (a === b) return 0;
            if (!a.length) return b.length;
            if (!b.length) return a.length;
            const prev = new Array(b.length + 1);
            for (let j = 0; j <= b.length; j++) prev[j] = j;
            for (let i = 1; i <= a.length; i++) {
              let curr = i;
              for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                const next = Math.min(
                  curr + 1,
                  prev[j] + 1,
                  prev[j - 1] + cost,
                );
                prev[j - 1] = curr;
                curr = next;
              }
              prev[b.length] = curr;
            }
            return prev[b.length];
          };
          const targetNorm = normalize(stamped);
          const rawTarget = stamped.trim();
          const scored = dir
            .filter((c) => !!c.email && !!c.displayName)
            .map((c) => {
              const candNorm = normalize(c.displayName);
              const distance = lev(targetNorm, candNorm);
              const longer = Math.max(targetNorm.length, candNorm.length, 1);
              // Distinct raw spelling — required so we don't suggest the
              // sharer's own name back to them when an exact raw match would
              // already have resolved. distance===0 here means a punctuation
              // or spacing-only difference (e.g. "Jane-Doe" vs "Jane Doe"),
              // which is exactly the case we want to surface.
              const rawDiffers = c.displayName.trim() !== rawTarget;
              return { name: c.displayName, distance, longer, rawDiffers };
            })
            // A match counts as "close" when it's within ~30% of the longer
            // name's length and no more than 4 edits away — strict enough to
            // avoid noisy suggestions, loose enough to catch typos and
            // punctuation/spacing-only differences (distance 0 after
            // normalization).
            .filter(
              (s) =>
                s.rawDiffers &&
                s.distance <= 4 &&
                s.distance / s.longer <= 0.34,
            )
            .sort((a, b) => a.distance - b.distance);
          unreachableSuggestions = scored.slice(0, 2).map((s) => s.name);
        }
      } else {
        url.searchParams.delete("sharedBy");
      }
      href = url.toString();
    } catch {
      // ignore URL parsing failures and fall back to raw href
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        const ta = document.createElement("textarea");
        ta.value = href;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      // T294 — Warn when the previewed moment is so close that the recipient
      // may open the link after auto-revert (T287) has already kicked in,
      // which would silently surface the live rotation with no context.
      const expiresSoon = previewExpiresSoon(scheduledPreviewAt, new Date());
      const expiresSoonMsg = `Heads up: this preview moment is less than ${Math.round(
        PREVIEW_EXPIRES_SOON_THRESHOLD_MS / 60000,
      )} minutes away — by the time a teammate opens the link, they may already see the live rotation instead.`;
      const suggestionMsg = unreachableSuggestions.length
        ? ` Did you mean: ${unreachableSuggestions.join(", ")}?`
        : "";
      const unreachableMsg =
        "Heads up: your name isn't in the staff directory used by the recipient's banner, so they won't see a \"Message me\" button. Ask an admin to add or reactivate your account before sharing." +
        suggestionMsg;
      const description = expiresSoon && unreachableSharer
        ? `${expiresSoonMsg} ${unreachableMsg}`
        : expiresSoon
          ? expiresSoonMsg
          : unreachableSharer
            ? unreachableMsg
            : "Filter view URL copied to clipboard.";
      toast({
        title: "Link copied",
        description,
        variant: expiresSoon || unreachableSharer ? "destructive" : undefined,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Copy this URL manually: " + href,
        variant: "destructive",
      });
    }
  };

  const LIVE_ALERT_STORAGE_KEY = "mougle.admin.broadcastPreview.liveAlert.v1";
  type LiveAlertSettings = {
    threshold: number;
    snoozeUntil: number | null;
    snoozeAtCount: number | null;
  };
  const readLiveAlertSettings = (): LiveAlertSettings => {
    if (typeof window === "undefined") {
      return { threshold: 0, snoozeUntil: null, snoozeAtCount: null };
    }
    try {
      const raw = window.localStorage.getItem(LIVE_ALERT_STORAGE_KEY);
      if (!raw) return { threshold: 0, snoozeUntil: null, snoozeAtCount: null };
      const parsed = JSON.parse(raw);
      const threshold =
        typeof parsed?.threshold === "number" && parsed.threshold >= 0
          ? Math.floor(parsed.threshold)
          : 0;
      const snoozeUntil =
        typeof parsed?.snoozeUntil === "number" ? parsed.snoozeUntil : null;
      const snoozeAtCount =
        typeof parsed?.snoozeAtCount === "number" ? parsed.snoozeAtCount : null;
      return { threshold, snoozeUntil, snoozeAtCount };
    } catch {
      return { threshold: 0, snoozeUntil: null, snoozeAtCount: null };
    }
  };
  const initialLiveAlert = readLiveAlertSettings();
  const [liveAlertThreshold, setLiveAlertThreshold] = useState<number>(
    initialLiveAlert.threshold,
  );
  const [liveAlertSnoozeUntil, setLiveAlertSnoozeUntil] = useState<number | null>(
    initialLiveAlert.snoozeUntil,
  );
  const [liveAlertSnoozeAtCount, setLiveAlertSnoozeAtCount] = useState<number | null>(
    initialLiveAlert.snoozeAtCount,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        LIVE_ALERT_STORAGE_KEY,
        JSON.stringify({
          threshold: liveAlertThreshold,
          snoozeUntil: liveAlertSnoozeUntil,
          snoozeAtCount: liveAlertSnoozeAtCount,
        }),
      );
    } catch {
      // ignore quota / privacy errors
    }
  }, [liveAlertThreshold, liveAlertSnoozeUntil, liveAlertSnoozeAtCount]);

  const allBroadcasts = listQ.data?.broadcasts ?? [];
  const availableStatuses = Array.from(
    new Set(allBroadcasts.map((b) => b.status).filter(Boolean))
  ).sort();
  const dryRunCount = allBroadcasts.filter((b) => b.dryRun).length;
  const liveCount = allBroadcasts.length - dryRunCount;
  const now = Date.now();
  const snoozeActive =
    liveAlertSnoozeUntil !== null && liveAlertSnoozeUntil > now;
  const dismissedForCurrentCount =
    liveAlertSnoozeAtCount !== null && liveCount <= liveAlertSnoozeAtCount;
  const liveAlertActive =
    liveCount > liveAlertThreshold && !snoozeActive && !dismissedForCurrentCount;
  useEffect(() => {
    if (
      liveAlertSnoozeAtCount !== null &&
      liveCount <= liveAlertThreshold
    ) {
      setLiveAlertSnoozeAtCount(null);
    }
  }, [liveCount, liveAlertThreshold, liveAlertSnoozeAtCount]);
  useEffect(() => {
    if (
      liveAlertSnoozeUntil !== null &&
      liveAlertSnoozeUntil <= now
    ) {
      setLiveAlertSnoozeUntil(null);
    }
  }, [now, liveAlertSnoozeUntil]);
  const toastedForRef = useRef<{ count: number; threshold: number } | null>(null);
  useEffect(() => {
    if (!liveAlertActive) {
      if (liveCount <= liveAlertThreshold) {
        toastedForRef.current = null;
      }
      return;
    }
    const prev = toastedForRef.current;
    if (prev && prev.count === liveCount && prev.threshold === liveAlertThreshold) {
      return;
    }
    toastedForRef.current = { count: liveCount, threshold: liveAlertThreshold };
    toast({
      title: `Live broadcast detected (${liveCount} live)`,
      description:
        liveAlertThreshold === 0
          ? "Threshold is 0 — any live broadcast triggers this warning."
          : `Live count is above your threshold of ${liveAlertThreshold}.`,
      variant: "destructive",
    });
  }, [liveAlertActive, liveCount, liveAlertThreshold, toast]);

  // Audit log of live-alert threshold crossings. We record a row when the
  // raw count crosses above the configured threshold ("triggered") and
  // another when it falls back to/below the threshold ("cleared"), so
  // admins can review brief flaps that auto-resolved before they looked.
  type LiveAlertEvent = {
    id: string;
    kind: "triggered" | "cleared";
    liveCount: number;
    threshold: number;
    recordedBy: string | null;
    createdAt: string;
  };
  const liveAlertEventsQ = useQuery<{ ok: true; events: LiveAlertEvent[] }>({
    queryKey: ["/api/admin/broadcasts/live-alerts/events"],
    queryFn: async () => {
      const r = await fetch(
        "/api/admin/broadcasts/live-alerts/events?limit=20",
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return r.json();
    },
  });
  const aboveThresholdRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (listQ.isLoading) return;
    const above = liveCount > liveAlertThreshold;
    const prev = aboveThresholdRef.current;
    if (prev === null) {
      aboveThresholdRef.current = above;
      return;
    }
    if (prev === above) return;
    aboveThresholdRef.current = above;
    const kind: "triggered" | "cleared" = above ? "triggered" : "cleared";
    apiRequest("POST", "/api/admin/broadcasts/live-alerts/events", {
      kind,
      liveCount,
      threshold: liveAlertThreshold,
    })
      .then(() => {
        qc.invalidateQueries({
          queryKey: ["/api/admin/broadcasts/live-alerts/events"],
        });
      })
      .catch(() => {
        // Non-fatal: alert auditing is best-effort, never block the UI.
      });
  }, [listQ.isLoading, liveCount, liveAlertThreshold, qc]);
  const statusCounts = allBroadcasts.reduce<Record<string, number>>((acc, b) => {
    const key = b.status || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const statusCountEntries = Object.entries(statusCounts).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const packageQuery = filterPackageId.trim().toLowerCase();
  const visibleBroadcasts = allBroadcasts.filter((b) => {
    if (filterDryRun === "dry" && !b.dryRun) return false;
    if (filterDryRun === "live" && b.dryRun) return false;
    if (filterStatus !== "all" && b.status !== filterStatus) return false;
    if (packageQuery && !b.packageId.toLowerCase().includes(packageQuery)) return false;
    return true;
  });
  const hiddenCount = allBroadcasts.length - visibleBroadcasts.length;
  const filtersActive =
    filterDryRun !== "all" || filterStatus !== "all" || packageQuery.length > 0;
  const clearFilters = () => {
    setFilterDryRun("all");
    setFilterStatus("all");
    setFilterPackageId("");
  };
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const known = new Set(visibleBroadcasts.map((b) => b.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (known.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
  }, [visibleBroadcasts, selectedIds]);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const allVisibleSelected =
    visibleBroadcasts.length > 0 && visibleBroadcasts.every((b) => selectedIds.has(b.id));
  const someVisibleSelected =
    visibleBroadcasts.some((b) => selectedIds.has(b.id)) && !allVisibleSelected;
  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const b of visibleBroadcasts) next.add(b.id);
      } else {
        for (const b of visibleBroadcasts) next.delete(b.id);
      }
      return next;
    });
  };

  async function runBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkRunning(true);
    let succeeded = 0;
    let failed = 0;
    let coversRemoved = 0;
    let mp4sRemoved = 0;
    let manifestsRemoved = 0;
    const failedIds: string[] = [];
    for (const id of ids) {
      try {
        const r = await apiRequest("DELETE", `/api/admin/broadcasts/${id}`);
        const json = (await r.json()) as {
          ok: true;
          deleted: { id: string; coversRemoved: number; mp4Removed: boolean; manifestRemoved: boolean };
        };
        succeeded += 1;
        coversRemoved += json.deleted.coversRemoved;
        if (json.deleted.mp4Removed) mp4sRemoved += 1;
        if (json.deleted.manifestRemoved) manifestsRemoved += 1;
        if (selectedId === id) setSelectedId(null);
      } catch {
        failed += 1;
        failedIds.push(id);
      }
    }
    setBulkRunning(false);
    setBulkConfirmOpen(false);
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
    const summary = [
      `${succeeded} deleted`,
      failed > 0 ? `${failed} failed` : null,
      `${coversRemoved} cover${coversRemoved === 1 ? "" : "s"}`,
      `${mp4sRemoved} mp4${mp4sRemoved === 1 ? "" : "s"}`,
      `${manifestsRemoved} manifest${manifestsRemoved === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" · ");
    toast({
      title:
        failed === 0
          ? `Bulk delete complete (${succeeded}/${ids.length})`
          : `Bulk delete finished with ${failed} error${failed === 1 ? "" : "s"}`,
      description:
        failed === 0
          ? summary
          : `${summary}${failedIds.length ? ` · failed: ${failedIds.join(", ")}` : ""}`,
      variant: failed === 0 ? undefined : "destructive",
    });
  }

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/admin/broadcasts/${id}`);
      return r.json() as Promise<{
        ok: true;
        deleted: { id: string; coversRemoved: number; mp4Removed: boolean; manifestRemoved: boolean };
      }>;
    },
    onSuccess: (res) => {
      const d = res.deleted;
      const parts = [
        `${d.coversRemoved} cover${d.coversRemoved === 1 ? "" : "s"}`,
        d.mp4Removed ? "mp4 removed" : "mp4 absent",
        d.manifestRemoved ? "manifest removed" : "manifest absent",
      ];
      toast({ title: `Broadcast ${d.id} deleted`, description: parts.join(" · ") });
      if (selectedId === d.id) setSelectedId(null);
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [recropLoading, setRecropLoading] = useState(false);

  async function handleRecropSavedCover() {
    if (!selected) return;
    const url = editCover.trim();
    if (!url) {
      toast({
        title: "No saved cover",
        description: "Upload or paste a cover image URL first.",
        variant: "destructive",
      });
      return;
    }
    setRecropLoading(true);
    try {
      const isSameOrigin = url.startsWith("/") || url.startsWith(window.location.origin);
      const fetchUrl = isSameOrigin
        ? url
        : `/api/admin/broadcasts/cover-proxy?url=${encodeURIComponent(url)}`;
      const r = await fetch(fetchUrl, { credentials: "include" });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(text || `Failed to load image (${r.status})`);
      }
      const blob = await r.blob();
      const ct = (blob.type || "image/jpeg").toLowerCase();
      const ext =
        ct === "image/png" ? "png" :
        ct === "image/webp" ? "webp" :
        ct === "image/gif" ? "gif" : "jpg";
      const baseName = `cover-${selected.id}`;
      const file = new File([blob], `${baseName}.${ext}`, {
        type: ct.startsWith("image/") ? ct : "image/jpeg",
      });
      setCropFile(file);
      setCropOpen(true);
    } catch (e) {
      toast({
        title: "Couldn't load saved cover",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setRecropLoading(false);
    }
  }
  const uploadCoverMut = useMutation({
    mutationFn: async (file: File) => {
      if (!selected) throw new Error("no broadcast selected");
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/admin/broadcasts/${selected.id}/cover/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.ok) {
        throw new Error(json.message || json.error || `Upload failed (${r.status})`);
      }
      return json as { ok: true; broadcast: BroadcastRow; coverImageUrl: string };
    },
    onSuccess: (res) => {
      setEditCover(res.coverImageUrl);
      qc.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
      toast({
        title: "Cover image uploaded",
        description: "Stored in private object storage and saved to this broadcast.",
      });
      if (coverFileRef.current) coverFileRef.current.value = "";
    },
    onError: (e: Error) =>
      toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="container max-w-7xl py-6 space-y-4" data-testid="page-broadcast-preview">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Tv2 className="w-6 h-6" /> Broadcast Compositor (T6)
          <Badge variant="outline" data-testid="badge-dry-run-default">dryRun=true by default</Badge>
        </h1>
      </div>
      {/* T281 — When this page is opened via a shared `?scheduledPreviewAt=...`
          link, show a prominent banner so the viewer immediately understands
          they're looking at a frozen future snapshot, not the live rotation.
          The banner is only rendered for the shared-link case; if the admin
          set the timestamp themselves via the "Preview at…" picker, the
          existing amber indicator near the rotation is enough. */}
      {scheduledPreviewAt &&
        shouldShowSharedPreviewBanner({ scheduledPreviewAt, previewSource, sharedBannerDismissed }) && (
        <div
          className="flex flex-wrap items-start gap-3 rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
          data-testid="banner-shared-scheduled-preview"
          role="status"
        >
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium" data-testid="text-shared-preview-banner-title">
              Viewing scheduled rotation as of{" "}
              <span className="font-semibold">
                {scheduledPreviewAt.toLocaleString()}
              </span>
            </div>
            <div className="text-xs opacity-90" data-testid="text-shared-preview-banner-body">
              {sharedByName ? (
                <>
                  Shared by{" "}
                  <span
                    className="font-semibold"
                    data-testid="text-shared-preview-banner-sharer"
                  >
                    {sharedByName}
                  </span>{" "}
                  — this is a frozen snapshot, not the live rotation. Reach
                  out to them with follow-up questions.
                </>
              ) : (
                <>
                  Shared by a teammate — this is a frozen snapshot, not the
                  live rotation. Decisions based on this view may be out of
                  date.
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {sharedByName && sharedBySlackHref && (
              <Button
                asChild
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-amber-500/60 bg-background gap-1"
                data-testid="button-shared-preview-slack-sharer"
                title={`Message ${sharedByName} on Slack about this snapshot`}
              >
                <a href={sharedBySlackHref} target="_blank" rel="noreferrer">
                  <MessageSquare className="w-3 h-3" />
                  Slack {sharedByName}
                </a>
              </Button>
            )}
            {sharedByName && sharedByEmail && (
              <Button
                asChild
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-amber-500/60 bg-background gap-1"
                data-testid="button-shared-preview-message-sharer"
                title={`Email ${sharedByName} (${sharedByEmail}) about this snapshot`}
              >
                <a
                  href={(() => {
                    const subject = `Question about shared broadcast preview (${
                      scheduledPreviewAt ? scheduledPreviewAt.toLocaleString() : ""
                    })`;
                    const body = `Hi ${sharedByName},\n\nI have a follow-up question about the broadcast rotation snapshot you shared:\n${
                      typeof window !== "undefined" ? window.location.href : ""
                    }\n\n`;
                    return `mailto:${encodeURIComponent(
                      sharedByEmail,
                    )}?subject=${encodeURIComponent(
                      subject,
                    )}&body=${encodeURIComponent(body)}`;
                  })()}
                >
                  <Mail className="w-3 h-3" />
                  Message {sharedByName}
                </a>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px] border-amber-500/60 bg-background"
              onClick={() => {
                setScheduledPreviewAt(null);
                setPreviewSource(null);
                setSharedBannerDismissed(false);
              }}
              data-testid="button-shared-preview-back-to-live"
            >
              Back to live
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setSharedBannerDismissed(true)}
              title="Dismiss banner"
              data-testid="button-shared-preview-dismiss"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1" data-testid="card-broadcast-form">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Render a new broadcast</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label>Package ID</Label>
              <Input value={packageId} onChange={(e) => setPackageId(e.target.value)} data-testid="input-package-id" />
            </div>
            <p className="text-[11px] text-muted-foreground" data-testid="text-approval-note">
              Approval is checked server-side from <code>broadcast_package_approvals</code>.
              The render API ignores any client-supplied approval field.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Brand</Label>
                <Input value={brandLabel} onChange={(e) => setBrandLabel(e.target.value)} data-testid="input-brand-label" />
              </div>
              <div className="space-y-1">
                <Label>Kicker</Label>
                <Input value={kicker} onChange={(e) => setKicker(e.target.value)} data-testid="input-kicker" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Headline</Label>
              <Textarea rows={2} value={headline} onChange={(e) => setHeadline(e.target.value)} data-testid="input-headline" />
            </div>
            <div className="space-y-1">
              <Label>Viewer-facing title (Live Channel)</Label>
              <Input
                value={viewerTitle}
                onChange={(e) => setViewerTitle(e.target.value)}
                placeholder="Leave blank to fall back to the headline"
                data-testid="input-viewer-title"
              />
            </div>
            <div className="space-y-1">
              <Label>Cover image URL (Live Channel thumbnail)</Label>
              <Input
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://… leave blank to fall back to b-roll thumbnail"
                data-testid="input-cover-image-url"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Speaker name</Label>
                <Input value={speakerName} onChange={(e) => setSpeakerName(e.target.value)} data-testid="input-speaker-name" />
              </div>
              <div className="space-y-1">
                <Label>Speaker role</Label>
                <Input value={speakerRole} onChange={(e) => setSpeakerRole(e.target.value)} data-testid="input-speaker-role" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Ticker items (· separated)</Label>
              <Textarea rows={2} value={tickerItems} onChange={(e) => setTickerItems(e.target.value)} data-testid="input-ticker" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={breakingEnabled} onCheckedChange={setBreakingEnabled} data-testid="switch-breaking" />
              <Label className="text-xs">Breaking bar enabled</Label>
            </div>
            {breakingEnabled && (
              <Textarea rows={2} value={breakingHeadline} onChange={(e) => setBreakingHeadline(e.target.value)} data-testid="input-breaking-headline" />
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Confidence</Label>
                <Select value={confidence} onValueChange={(v) => { if (isConfidenceLevel(v)) setConfidence(v); }}>
                  <SelectTrigger data-testid="select-confidence"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">high</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="low">low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Score (0–1)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={confidenceScore}
                  onChange={(e) => setConfidenceScore(Number(e.target.value))}
                  data-testid="input-confidence-score"
                />
              </div>
              <div className="space-y-1">
                <Label>Duration (s)</Label>
                <Input
                  type="number"
                  min={2}
                  max={60}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  data-testid="input-duration"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Sources (name | url | license, one per line)</Label>
              <Textarea
                rows={4}
                value={sourcesText}
                onChange={(e) => setSourcesText(e.target.value)}
                data-testid="input-sources"
              />
            </div>
            <Button
              className="w-full"
              disabled={renderMut.isPending || !packageId.trim()}
              onClick={() => renderMut.mutate()}
              data-testid="button-render-broadcast"
            >
              {renderMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              Render broadcast (dry-run)
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Output stays under PRIVATE_OBJECT_DIR/broadcasts. No public upload, no social post.
              Non-dry-run renders require an explicit founder approval flag handled by T10 gating.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="card-broadcast-list">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent broadcasts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {listQ.isLoading && <div className="text-muted-foreground">Loading…</div>}
            {liveAlertActive && (
              <div
                className="rounded border border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-xs space-y-2"
                role="alert"
                data-testid="banner-live-broadcast-alert"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium" data-testid="text-live-alert-title">
                      Unexpected live broadcast{liveCount === 1 ? "" : "s"} detected
                    </div>
                    <div className="text-[11px] opacity-90" data-testid="text-live-alert-body">
                      {liveCount} live broadcast{liveCount === 1 ? "" : "s"} above your
                      threshold of {liveAlertThreshold}. Verify these were intentional.
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setLiveAlertSnoozeUntil(Date.now() + 60 * 60 * 1000);
                      }}
                      data-testid="button-snooze-live-alert"
                    >
                      <BellOff className="w-3 h-3 mr-1" /> Snooze 1h
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setLiveAlertSnoozeAtCount(liveCount)}
                      data-testid="button-dismiss-live-alert"
                    >
                      <X className="w-3 h-3 mr-1" /> Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {allBroadcasts.length > 0 && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 text-[11px] rounded border border-border bg-muted/30 px-2 py-2"
                data-testid="live-alert-settings"
              >
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground" htmlFor="input-live-alert-threshold">
                    Live alert threshold
                  </Label>
                  <Input
                    id="input-live-alert-threshold"
                    type="number"
                    min={0}
                    value={liveAlertThreshold}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setLiveAlertThreshold(Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
                    }}
                    className="h-7 w-20 text-xs"
                    data-testid="input-live-alert-threshold"
                  />
                  <span className="text-muted-foreground">
                    Warn when live count is above this number.
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  {snoozeActive && liveAlertSnoozeUntil && (
                    <span data-testid="text-live-alert-snoozed">
                      Snoozed until{" "}
                      {new Date(liveAlertSnoozeUntil).toLocaleTimeString()}
                    </span>
                  )}
                  {dismissedForCurrentCount && !snoozeActive && (
                    <span data-testid="text-live-alert-dismissed">
                      Dismissed for current count ({liveAlertSnoozeAtCount}). Will re-show if it
                      rises.
                    </span>
                  )}
                  {(snoozeActive || dismissedForCurrentCount) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setLiveAlertSnoozeUntil(null);
                        setLiveAlertSnoozeAtCount(null);
                      }}
                      data-testid="button-reset-live-alert"
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div
              className="flex flex-wrap items-center justify-between gap-2 text-[11px] rounded border border-border bg-muted/30 px-2 py-2"
              data-testid="server-live-alert-settings"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Label
                  className="text-[11px] text-muted-foreground"
                  htmlFor="input-server-live-alert-threshold"
                >
                  Server alert threshold
                </Label>
                <Input
                  id="input-server-live-alert-threshold"
                  type="number"
                  min={0}
                  value={serverThresholdDraft}
                  onChange={(e) => setServerThresholdDraft(e.target.value)}
                  className="h-7 w-20 text-xs"
                  data-testid="input-server-live-alert-threshold"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={serverThresholdMut.isPending}
                  onClick={() => {
                    const n = Number(serverThresholdDraft);
                    if (!Number.isFinite(n) || n < 0) {
                      toast({
                        title: "Invalid threshold",
                        description: "Enter a non-negative integer.",
                        variant: "destructive",
                      });
                      return;
                    }
                    serverThresholdMut.mutate(Math.floor(n));
                  }}
                  data-testid="button-save-server-live-alert-threshold"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={serverScanNowMut.isPending}
                  onClick={() => serverScanNowMut.mutate()}
                  data-testid="button-server-live-alert-scan-now"
                >
                  Scan now
                </Button>
                <span className="text-muted-foreground">
                  Emails root admins + creates a platform alert even when no
                  one is on this page. 0 = any live broadcast triggers.
                </span>
              </div>
              <div
                className="flex items-center gap-3 text-muted-foreground"
                data-testid="text-server-live-alert-status"
              >
                {liveAlertStatusQ.data ? (
                  <>
                    <span>
                      Server saw{" "}
                      <strong className="text-foreground">
                        {liveAlertStatusQ.data.status.lastLiveCount ?? "—"}
                      </strong>{" "}
                      live
                    </span>
                    <span>
                      Last scan{" "}
                      {liveAlertStatusQ.data.status.lastScanAt
                        ? new Date(
                            liveAlertStatusQ.data.status.lastScanAt,
                          ).toLocaleTimeString()
                        : "never"}
                    </span>
                    {liveAlertStatusQ.data.status.lastAlertAt && (
                      <span>
                        Last email{" "}
                        {new Date(
                          liveAlertStatusQ.data.status.lastAlertAt,
                        ).toLocaleTimeString()}
                      </span>
                    )}
                  </>
                ) : (
                  <span>Loading status…</span>
                )}
              </div>
            </div>
            {(() => {
              const events = liveAlertEventsQ.data?.events ?? [];
              if (events.length === 0) return null;
              const shown = events.slice(0, 8);
              return (
                <div
                  className="rounded border border-border bg-muted/30 px-2 py-2 text-[11px] space-y-1"
                  data-testid="panel-recent-live-alerts"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted-foreground">
                      Recent live alerts
                    </span>
                    <span className="text-muted-foreground">
                      Last {shown.length} of {events.length}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {shown.map((ev) => {
                      const ts = new Date(ev.createdAt);
                      const tsLabel = Number.isNaN(ts.getTime())
                        ? ev.createdAt
                        : ts.toLocaleString();
                      const isTriggered = ev.kind === "triggered";
                      return (
                        <li
                          key={ev.id}
                          className="flex items-center gap-2"
                          data-testid={`row-live-alert-event-${ev.id}`}
                        >
                          <Badge
                            variant={isTriggered ? "destructive" : "secondary"}
                            className="h-4 px-1.5 text-[10px] uppercase"
                            data-testid={`badge-live-alert-kind-${ev.id}`}
                          >
                            {isTriggered ? "Triggered" : "Cleared"}
                          </Badge>
                          <span
                            className="tabular-nums text-muted-foreground"
                            data-testid={`text-live-alert-time-${ev.id}`}
                          >
                            {tsLabel}
                          </span>
                          <span
                            className="text-muted-foreground"
                            data-testid={`text-live-alert-detail-${ev.id}`}
                          >
                            live={ev.liveCount} · threshold={ev.threshold}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}
            {allBroadcasts.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-1.5 text-[11px] rounded border border-border bg-muted/30 px-2 py-2"
                data-testid="broadcast-summary"
              >
                <span className="text-muted-foreground mr-1">
                  Totals ({allBroadcasts.length}):
                </span>
                <button
                  type="button"
                  onClick={() => setFilterDryRun("dry")}
                  className="inline-flex"
                  title="Show dry-run only"
                  data-testid="button-summary-dry-run"
                >
                  <Badge
                    variant={filterDryRun === "dry" ? "default" : "secondary"}
                    className="cursor-pointer hover:bg-muted-foreground/20"
                  >
                    {dryRunCount} dry-run
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDryRun("live")}
                  className="inline-flex"
                  title="Show live only"
                  data-testid="button-summary-live"
                >
                  <Badge
                    variant={filterDryRun === "live" ? "default" : "secondary"}
                    className={`cursor-pointer hover:bg-muted-foreground/20 ${liveCount > 0 ? "border-amber-500/60 text-amber-600 dark:text-amber-400" : ""}`}
                  >
                    {liveCount} live
                  </Badge>
                </button>
                {statusCountEntries.length > 0 && (
                  <span className="text-muted-foreground mx-1">·</span>
                )}
                {statusCountEntries.map(([status, count]) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilterStatus(status)}
                    className="inline-flex"
                    title={`Filter by status: ${status}`}
                    data-testid={`button-summary-status-${status}`}
                  >
                    <Badge
                      variant={filterStatus === status ? "default" : "outline"}
                      className="cursor-pointer hover:bg-muted-foreground/20"
                    >
                      {count} {status}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            {allBroadcasts.length > 0 && (
              <div
                className="rounded border border-border bg-muted/30 px-2 py-2 space-y-2"
                data-testid="broadcast-filters"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1 min-w-[140px]">
                    <Label className="text-[11px] text-muted-foreground">Mode</Label>
                    <Select value={filterDryRun} onValueChange={(v) => setFilterDryRun(v as "all" | "dry" | "live")}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-filter-dry-run">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All (dry-run & live)</SelectItem>
                        <SelectItem value="dry">Dry-run only</SelectItem>
                        <SelectItem value="live">Live only (hide dry-run)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 min-w-[140px]">
                    <Label className="text-[11px] text-muted-foreground">Status</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-filter-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any status</SelectItem>
                        {availableStatuses.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 flex-1 min-w-[180px]">
                    <Label className="text-[11px] text-muted-foreground">Search packageId</Label>
                    <Input
                      value={filterPackageId}
                      onChange={(e) => setFilterPackageId(e.target.value)}
                      placeholder="e.g. demo-pkg-001"
                      className="h-8 text-xs"
                      data-testid="input-filter-package-id"
                    />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        data-testid="button-saved-views-menu"
                        title="Apply a saved filter view"
                      >
                        <Bookmark className="w-3 h-3 mr-1" />
                        Saved views{savedViews.length > 0 ? ` (${savedViews.length})` : ""}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[260px]">
                      {savedViews.length === 0 && (
                        <>
                          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
                          <div
                            className="px-2 py-1.5 text-xs text-muted-foreground"
                            data-testid="text-no-saved-views"
                          >
                            No saved views yet. Set filters and click "Save current view".
                          </div>
                        </>
                      )}
                      {sharedViews.length > 0 && (
                        <>
                          <DropdownMenuLabel
                            className="flex items-center gap-1.5"
                            data-testid="label-shared-views-group"
                          >
                            <Users2 className="w-3 h-3" /> Shared with team
                          </DropdownMenuLabel>
                          {sharedViews.map((v) => (
                            <DropdownMenuItem
                              key={v.id}
                              onSelect={() => applySavedView(v)}
                              className="flex flex-col items-start gap-0.5"
                              data-testid={`menu-item-saved-view-${v.id}`}
                            >
                              <span className="font-medium text-xs flex items-center gap-1.5 flex-wrap">
                                <Users2 className="w-3 h-3" /> {v.name}
                                {v.isTeamDefault && (
                                  <Badge
                                    variant="default"
                                    className="text-[10px] py-0 px-1.5 flex items-center gap-1"
                                    data-testid={`badge-team-default-menu-${v.id}`}
                                    title={teamDefaultPinTooltip(v) ?? undefined}
                                  >
                                    <Pin className="w-2.5 h-2.5" /> Team default
                                  </Badge>
                                )}
                                {!v.isOwn && (
                                  <span
                                    className="text-[10px] font-normal text-muted-foreground"
                                    title={creatorTooltip(v)}
                                    data-testid={`text-shared-view-creator-${v.id}`}
                                  >
                                    (shared by {v.creator.displayName})
                                  </span>
                                )}
                                {creatorStatusBadge(v, "dropdown")}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {describeView(v)}
                              </span>
                              {v.isTeamDefault && (
                                <span
                                  className="text-[10px] text-muted-foreground italic"
                                  title={teamDefaultPinTooltip(v) ?? undefined}
                                  data-testid={`text-team-default-pin-menu-${v.id}`}
                                >
                                  {teamDefaultPinLabel(v)}
                                </span>
                              )}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                      {personalViews.length > 0 && (
                        <>
                          {sharedViews.length > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuLabel
                            className="flex items-center gap-1.5"
                            data-testid="label-personal-views-group"
                          >
                            <Star className="w-3 h-3" /> My views
                          </DropdownMenuLabel>
                          {personalViews.map((v) => (
                            <DropdownMenuItem
                              key={v.id}
                              onSelect={() => applySavedView(v)}
                              className="flex flex-col items-start gap-0.5"
                              data-testid={`menu-item-saved-view-${v.id}`}
                            >
                              <span className="font-medium text-xs flex items-center gap-1.5">
                                <Star className="w-3 h-3" /> {v.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {describeView(v)}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setNewViewName("");
                          setSaveViewOpen(true);
                        }}
                        disabled={!filtersActive}
                        data-testid="menu-item-save-current-view"
                      >
                        <Bookmark className="w-3 h-3 mr-2" />
                        Save current view{filtersActive ? "" : " (set filters first)"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setRenameDraft({});
                          setManageViewsOpen(true);
                        }}
                        disabled={savedViews.length === 0}
                        data-testid="menu-item-manage-saved-views"
                      >
                        <Pencil className="w-3 h-3 mr-2" />
                        Rename or delete views
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {hasAnyScheduledSharedView && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRenameDraft({});
                          setManageViewsOpen(true);
                        }}
                        className={`flex h-8 items-center gap-1 rounded border border-dashed px-2 text-[11px] hover:text-foreground ${
                          previewIsInPast
                            ? "border-rose-500/60 bg-rose-500/10 text-rose-600 dark:text-rose-300"
                            : scheduledPreviewAt
                              ? "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                              : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                        title={
                          previewIsInPast
                            ? "This preview timestamp is in the past — sharing this link will show a rotation that already happened."
                            : "Open Manage views to edit schedules"
                        }
                        data-testid="indicator-scheduled-view-status"
                      >
                        <Clock className="w-3 h-3" />
                        <span data-testid="text-scheduled-view-now">
                          {scheduledPreviewAt ? (
                            <>
                              At{" "}
                              <span className="font-medium text-foreground">
                                {formatScheduleClock(scheduledPreviewAt)}
                              </span>
                              :{" "}
                            </>
                          ) : (
                            "Now: "
                          )}
                          {activeScheduledView ? (
                            <span className="font-medium text-foreground">
                              {activeScheduledView.name}
                            </span>
                          ) : (
                            "none"
                          )}
                        </span>
                        {nextScheduleChange && (
                          <span
                            className="text-muted-foreground"
                            data-testid="text-scheduled-view-next"
                          >
                            {" · "}Then:{" "}
                            <span className="font-medium text-foreground">
                              {nextScheduleChange.view
                                ? nextScheduleChange.view.name
                                : "none"}
                            </span>{" "}
                            at {formatScheduleClock(nextScheduleChange.at)}
                          </span>
                        )}
                      </button>
                      <Popover
                        open={previewPickerOpen}
                        onOpenChange={(open) => {
                          setPreviewPickerOpen(open);
                          if (open) {
                            const seed = scheduledPreviewAt ?? new Date();
                            const pad = (n: number) => String(n).padStart(2, "0");
                            setPreviewPickerDraft(
                              `${seed.getFullYear()}-${pad(seed.getMonth() + 1)}-${pad(seed.getDate())}T${pad(seed.getHours())}:${pad(seed.getMinutes())}`,
                            );
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-[11px]"
                            title="Preview which scheduled view will be active at a future date/time"
                            data-testid="button-open-schedule-preview-picker"
                          >
                            <CalendarClock className="w-3 h-3 mr-1" />
                            Preview at…
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-72 space-y-2 p-3"
                          data-testid="popover-schedule-preview-picker"
                        >
                          <div className="text-xs font-medium">
                            Preview scheduled view at
                          </div>
                          <Input
                            type="datetime-local"
                            value={previewPickerDraft}
                            min={(() => {
                              const n = new Date();
                              const pad = (x: number) => String(x).padStart(2, "0");
                              return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
                            })()}
                            onChange={(e) => setPreviewPickerDraft(e.target.value)}
                            className="h-8 text-xs"
                            data-testid="input-schedule-preview-datetime"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Pick any future date/time in your local timezone.
                            The indicator will show which view would be active
                            and the next transition after it.
                          </p>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px]"
                              onClick={() => setPreviewPickerOpen(false)}
                              data-testid="button-cancel-schedule-preview"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-[11px]"
                              disabled={!previewPickerDraft}
                              onClick={() => {
                                const parsed = new Date(previewPickerDraft);
                                if (Number.isNaN(parsed.getTime())) {
                                  toast({
                                    title: "Invalid date/time",
                                    description: "Please pick a valid date and time.",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                if (parsed.getTime() <= Date.now()) {
                                  toast({
                                    title: "Pick a future time",
                                    description: "The preview is meant for auditing upcoming rotation slots — choose a date/time in the future.",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                setScheduledPreviewAt(parsed);
                                setPreviewSource("picker");
                                setSharedBannerDismissed(false);
                                setPreviewPickerOpen(false);
                              }}
                              data-testid="button-apply-schedule-preview"
                            >
                              Preview
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      {scheduledPreviewAt && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-[11px]"
                          onClick={() => {
                            setScheduledPreviewAt(null);
                            setPreviewSource(null);
                            setSharedBannerDismissed(false);
                          }}
                          title="Return to the live ticking indicator"
                          data-testid="button-schedule-preview-back-to-live"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Back to live
                        </Button>
                      )}
                      <Popover
                        open={coveragePopoverOpen}
                        onOpenChange={setCoveragePopoverOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-[11px]"
                            title="See which hours of the week have gaps or overlaps across scheduled shared views"
                            data-testid="button-open-schedule-coverage"
                          >
                            <Grid3x3 className="w-3 h-3 mr-1" />
                            Coverage
                            {(weeklyCoverageSummary.gaps > 0 ||
                              weeklyCoverageSummary.conflicts > 0) && (
                              <span
                                className="ml-1 text-[10px] text-muted-foreground"
                                data-testid="text-coverage-summary-badge"
                              >
                                ({weeklyCoverageSummary.gaps} gap
                                {weeklyCoverageSummary.gaps === 1 ? "" : "s"}
                                {", "}
                                {weeklyCoverageSummary.conflicts} conflict
                                {weeklyCoverageSummary.conflicts === 1 ? "" : "s"})
                              </span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[28rem] space-y-2 p-3"
                          data-testid="popover-schedule-coverage"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-medium">
                              Weekly coverage
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/70 border border-emerald-600/60" />
                                covered
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted border border-border" />
                                gap
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/70 border border-amber-600/60" />
                                conflict
                              </span>
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Click any hour to see quick actions — preview that
                            timestamp, cover a gap with a shared view, or fix
                            an overlap. Times are shown in your local timezone
                            (next occurrence of that weekday + hour).
                          </p>
                          <div
                            className="overflow-x-auto"
                            data-testid="grid-schedule-coverage"
                          >
                            <table className="text-[9px] border-separate border-spacing-0">
                              <thead>
                                <tr>
                                  <th className="w-8" />
                                  {Array.from({ length: 24 }).map((_, h) => (
                                    <th
                                      key={h}
                                      className="px-0 pb-1 text-center font-normal text-muted-foreground w-3.5"
                                    >
                                      {h % 3 === 0 ? h : ""}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {SCHEDULE_DAY_LABELS.map((label, day) => (
                                  <tr key={day}>
                                    <td className="pr-1 text-right text-muted-foreground align-middle">
                                      {label}
                                    </td>
                                    {Array.from({ length: 24 }).map((_, hour) => {
                                      const cell =
                                        weeklyCoverageGrid[day * 24 + hour];
                                      const bg =
                                        cell.status === "conflict"
                                          ? "bg-amber-500/70 hover:bg-amber-500 border-amber-600/60"
                                          : cell.status === "gap"
                                            ? "bg-muted hover:bg-muted-foreground/20 border-border"
                                            : "bg-emerald-500/70 hover:bg-emerald-500 border-emerald-600/60";
                                      const tip = (() => {
                                        const hh = `${String(hour).padStart(2, "0")}:00`;
                                        const range = `${label} ${hh}–${String((hour + 1) % 24).padStart(2, "0")}:00`;
                                        if (cell.status === "gap") {
                                          return `${range} — no scheduled view`;
                                        }
                                        const names = cell.viewNames.join(", ");
                                        if (cell.status === "conflict") {
                                          return `${range} — overlap: ${names}`;
                                        }
                                        return `${range} — ${names}`;
                                      })();
                                      const isSelected =
                                        selectedCoverageCell?.day === day &&
                                        selectedCoverageCell?.hour === hour;
                                      return (
                                        <td key={hour} className="p-0">
                                          <button
                                            type="button"
                                            title={tip}
                                            aria-label={tip}
                                            onClick={() =>
                                              setSelectedCoverageCell(
                                                isSelected
                                                  ? null
                                                  : { day, hour },
                                              )
                                            }
                                            className={`block w-3.5 h-3.5 border ${bg} ${isSelected ? "ring-2 ring-foreground ring-offset-1 ring-offset-popover" : ""}`}
                                            data-testid={`button-coverage-cell-${day}-${hour}`}
                                            data-status={cell.status}
                                            data-selected={isSelected ? "true" : undefined}
                                          />
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {/* T283 — Action panel for the currently selected
                              cell. Lets admins jump straight from "this hour
                              is uncovered/overlapping" into the schedule
                              editor for a specific shared view, pre-filled
                              with the clicked weekday and hour. */}
                          {selectedCoverageCell && (() => {
                            const { day, hour } = selectedCoverageCell;
                            const cell =
                              weeklyCoverageGrid[day * 24 + hour];
                            const hh = `${String(hour).padStart(2, "0")}:00`;
                            const range = `${SCHEDULE_DAY_LABELS[day]} ${hh}–${String((hour + 1) % 24).padStart(2, "0")}:00`;
                            const previewAt = () => {
                              const target = nextOccurrenceOfHour(
                                day,
                                hour,
                                new Date(),
                              );
                              const pad = (n: number) =>
                                String(n).padStart(2, "0");
                              setPreviewPickerDraft(
                                `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`,
                              );
                              setScheduledPreviewAt(target);
                              setCoveragePopoverOpen(false);
                            };
                            const overlappingViews = sharedViews.filter((v) =>
                              cell.viewIds.includes(v.id),
                            );
                            const coverCandidates = sharedViews;
                            return (
                              <div
                                className="rounded border border-border bg-muted/30 p-2 space-y-1.5"
                                data-testid="panel-coverage-cell-actions"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div
                                    className="text-[11px] font-medium"
                                    data-testid="text-coverage-cell-range"
                                  >
                                    {range}
                                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                                      {cell.status === "gap"
                                        ? "no scheduled view"
                                        : cell.status === "conflict"
                                          ? `overlap: ${cell.viewNames.join(", ")}`
                                          : cell.viewNames.join(", ")}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 text-[10px]"
                                    onClick={() =>
                                      setSelectedCoverageCell(null)
                                    }
                                    data-testid="button-coverage-cell-deselect"
                                    title="Close this hour's actions"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={previewAt}
                                    data-testid="button-coverage-cell-preview"
                                    title="Preview the dashboard at this weekday and hour"
                                  >
                                    Preview this hour
                                  </Button>
                                </div>
                                {viewerIsFounder &&
                                  cell.status === "conflict" &&
                                  overlappingViews.length > 0 && (
                                    <div className="space-y-1">
                                      <div className="text-[10px] text-muted-foreground">
                                        Fix overlap — open a view to shrink or
                                        remove its window:
                                      </div>
                                      <div
                                        className="flex flex-wrap gap-1.5"
                                        data-testid="list-coverage-fix-overlap"
                                      >
                                        {overlappingViews.map((v) => (
                                          <Button
                                            key={v.id}
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-[10px]"
                                            onClick={() =>
                                              openScheduleEditorForOverlap(v)
                                            }
                                            data-testid={`button-coverage-fix-overlap-${v.id}`}
                                            title={`Open the schedule editor for ${v.name} so you can shrink or remove the conflicting window`}
                                          >
                                            <Clock className="w-3 h-3 mr-1" />
                                            Fix in {v.name}
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                {viewerIsFounder &&
                                  cell.status !== "gap" &&
                                  cell.status !== "conflict" &&
                                  overlappingViews.length > 0 && (
                                    <div className="space-y-1">
                                      <div className="text-[10px] text-muted-foreground">
                                        Edit window — open a covering view to
                                        shrink, extend, or remove the window
                                        that covers this hour:
                                      </div>
                                      <div
                                        className="flex flex-wrap gap-1.5"
                                        data-testid="list-coverage-edit-window"
                                      >
                                        {overlappingViews.map((v) => (
                                          <Button
                                            key={v.id}
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-[10px]"
                                            onClick={() =>
                                              openScheduleEditorForOverlap(v)
                                            }
                                            data-testid={`button-coverage-edit-window-${v.id}`}
                                            title={`Open the schedule editor for ${v.name} so you can shrink, extend, or remove the window covering ${SCHEDULE_DAY_LABELS[day]} ${hh}`}
                                          >
                                            <Clock className="w-3 h-3 mr-1" />
                                            Edit window in {v.name}
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                {viewerIsFounder &&
                                  cell.status === "gap" && (
                                    <div className="space-y-1">
                                      <div className="text-[10px] text-muted-foreground">
                                        Cover with view — adds a one-hour
                                        window for {SCHEDULE_DAY_LABELS[day]}{" "}
                                        {hh} to the chosen shared view:
                                      </div>
                                      {coverCandidates.length === 0 ? (
                                        <div
                                          className="text-[10px] text-muted-foreground italic"
                                          data-testid="text-coverage-cover-empty"
                                        >
                                          No shared views yet — use the
                                          create form below to make one for
                                          this hour.
                                        </div>
                                      ) : (
                                        <div
                                          className="flex flex-wrap gap-1.5"
                                          data-testid="list-coverage-cover-with"
                                        >
                                          {coverCandidates.map((v) => (
                                            <Button
                                              key={v.id}
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="h-6 px-2 text-[10px]"
                                              onClick={() =>
                                                openScheduleEditorForCell(
                                                  v,
                                                  day,
                                                  hour,
                                                )
                                              }
                                              data-testid={`button-coverage-cover-with-${v.id}`}
                                              title={`Open the schedule editor for ${v.name} with a new ${hh}–${String((hour + 1) % 24).padStart(2, "0")}:00 window on ${SCHEDULE_DAY_LABELS[day]} pre-filled`}
                                            >
                                              <Clock className="w-3 h-3 mr-1" />
                                              Cover with {v.name}
                                            </Button>
                                          ))}
                                        </div>
                                      )}
                                      {/* T290 — Inline "+ New shared view"
                                          creator. Uses the dashboard's
                                          current filters as the view body,
                                          then opens the schedule editor
                                          with the clicked hour pre-filled. */}
                                      <div
                                        className="pt-1 border-t border-border/60 space-y-1.5"
                                        data-testid="panel-coverage-cover-new"
                                      >
                                        {/* T301 — One-click "use my current
                                            filters" shortcut. Auto-names the
                                            view from the active filter chips
                                            + the clicked weekday/hour so
                                            admins skip the rename step in
                                            the common case. */}
                                        {(() => {
                                          const derivedName =
                                            deriveCoverViewName(day, hour);
                                          return (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="default"
                                              className="h-7 px-2 text-[10px] w-full justify-center"
                                              disabled={
                                                createViewForCellMut.isPending
                                              }
                                              onClick={() =>
                                                createViewForCellMut.mutate({
                                                  name: derivedName,
                                                  day,
                                                  hour,
                                                })
                                              }
                                              data-testid="button-coverage-cover-with-current-filters"
                                              title={`Create a shared view named "${derivedName}" using your current filters (mode: ${filterDryRun}, status: ${filterStatus}${filterPackageId.trim() ? `, package: ${filterPackageId.trim()}` : ""}) and open the schedule editor with a ${hh}–${String((hour + 1) % 24).padStart(2, "0")}:00 window on ${SCHEDULE_DAY_LABELS[day]} pre-filled. You can rename it after.`}
                                            >
                                              {createViewForCellMut.isPending ? (
                                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                              ) : (
                                                <Plus className="w-3 h-3 mr-1" />
                                              )}
                                              Cover with current filters
                                              <span
                                                className="ml-1 text-[10px] opacity-80 truncate max-w-[160px]"
                                                data-testid="text-coverage-cover-current-derived-name"
                                              >
                                                ({derivedName})
                                              </span>
                                            </Button>
                                          );
                                        })()}
                                        <div className="text-[10px] text-muted-foreground">
                                          Or create a brand-new shared view
                                          for this hour (uses your current
                                          filters) with a custom name:
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <Input
                                            value={coverNewViewName}
                                            onChange={(e) =>
                                              setCoverNewViewName(
                                                e.target.value,
                                              )
                                            }
                                            onKeyDown={(e) => {
                                              if (
                                                e.key === "Enter" &&
                                                coverNewViewName.trim() &&
                                                !createViewForCellMut.isPending
                                              ) {
                                                e.preventDefault();
                                                createViewForCellMut.mutate({
                                                  name: coverNewViewName.trim(),
                                                  day,
                                                  hour,
                                                });
                                              }
                                            }}
                                            placeholder={`e.g. ${SCHEDULE_DAY_LABELS[day]} ${hh} coverage`}
                                            className="h-7 text-[11px] flex-1 min-w-[140px]"
                                            disabled={
                                              createViewForCellMut.isPending
                                            }
                                            data-testid="input-coverage-new-view-name"
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="default"
                                            className="h-7 px-2 text-[10px]"
                                            disabled={
                                              !coverNewViewName.trim() ||
                                              createViewForCellMut.isPending
                                            }
                                            onClick={() =>
                                              createViewForCellMut.mutate({
                                                name: coverNewViewName.trim(),
                                                day,
                                                hour,
                                              })
                                            }
                                            data-testid="button-coverage-create-new-view"
                                            title={`Create a new shared view named "${coverNewViewName.trim() || "…"}" and open its schedule editor with a ${hh}–${String((hour + 1) % 24).padStart(2, "0")}:00 window on ${SCHEDULE_DAY_LABELS[day]} pre-filled`}
                                          >
                                            {createViewForCellMut.isPending ? (
                                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                            ) : (
                                              <Plus className="w-3 h-3 mr-1" />
                                            )}
                                            Create new shared view…
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                {!viewerIsFounder &&
                                  (cell.status === "gap" ||
                                    cell.status === "conflict") && (
                                    <div
                                      className="text-[10px] text-muted-foreground italic"
                                      data-testid="text-coverage-founder-only"
                                    >
                                      Only founders can edit shared-view
                                      schedules.
                                    </div>
                                  )}
                              </div>
                            );
                          })()}
                          {weeklyCoverageSummary.gaps === 0 &&
                          weeklyCoverageSummary.conflicts === 0 ? (
                            <p
                              className="text-[10px] text-emerald-600 dark:text-emerald-400"
                              data-testid="text-coverage-all-clear"
                            >
                              Every hour of the week is covered by exactly one
                              scheduled view.
                            </p>
                          ) : (
                            <p
                              className="text-[10px] text-muted-foreground"
                              data-testid="text-coverage-summary-detail"
                            >
                              {weeklyCoverageSummary.gaps} uncovered hour
                              {weeklyCoverageSummary.gaps === 1 ? "" : "s"} ·{" "}
                              {weeklyCoverageSummary.conflicts} overlapping hour
                              {weeklyCoverageSummary.conflicts === 1 ? "" : "s"}{" "}
                              across the week.
                            </p>
                          )}
                          {coverageSuggestions.suggestions.length > 0 && (
                            <div className="flex items-center justify-between gap-2 pt-1 border-t">
                              <span className="text-[10px] text-muted-foreground">
                                Auto-fix proposes edits to{" "}
                                {coverageSuggestions.suggestions.length} view
                                {coverageSuggestions.suggestions.length === 1
                                  ? ""
                                  : "s"}{" "}
                                to close{" "}
                                {coverageSuggestions.initialGaps.length -
                                  coverageSuggestions.unresolvedGaps.length}
                                /{coverageSuggestions.initialGaps.length} gap
                                {coverageSuggestions.initialGaps.length === 1
                                  ? ""
                                  : "s"}
                                .
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                className="h-7 text-[11px]"
                                onClick={openSuggestionsDialog}
                                data-testid="button-suggest-coverage-fix"
                                title="Preview a heuristic schedule edit that fills uncovered hours without creating new overlaps"
                              >
                                Suggest fix
                              </Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                      {previewIsInPast && (
                        <span
                          className="text-[11px] text-rose-600 dark:text-rose-300"
                          data-testid="text-schedule-preview-past-warning"
                          title="The previewed time has already passed. Sharing this link will show a rotation that is no longer upcoming."
                        >
                          This preview is in the past
                        </span>
                      )}
                    </div>
                  )}
                  {(filtersActive || scheduledPreviewAt) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={copyShareLink}
                      className={`h-8 ${previewIsInPast ? "text-rose-600 dark:text-rose-300" : ""}`}
                      data-testid="button-copy-filter-link"
                      title={
                        previewIsInPast
                          ? "Heads up: the previewed timestamp is in the past, so this link will show a rotation that already happened."
                          : scheduledPreviewAt
                            ? "Copy a shareable URL for this filter view and previewed timestamp"
                            : "Copy a shareable URL for this filter view"
                      }
                    >
                      <Link2 className="w-3 h-3 mr-1" /> Copy link
                      {previewIsInPast && (
                        <span className="ml-1 text-[10px] font-medium uppercase tracking-wide">
                          (stale)
                        </span>
                      )}
                    </Button>
                  )}
                  {filtersActive && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={clearFilters}
                      className="h-8"
                      data-testid="button-clear-filters"
                    >
                      <X className="w-3 h-3 mr-1" /> Clear
                    </Button>
                  )}
                </div>
                {filtersActive && (
                  <div
                    className="flex flex-wrap items-center gap-1.5 text-[11px]"
                    data-testid="text-active-filters"
                  >
                    <span className="text-muted-foreground">Active filters:</span>
                    {filterDryRun !== "all" && (
                      <Badge variant="secondary" data-testid="badge-active-filter-dry-run">
                        {filterDryRun === "dry" ? "Dry-run only" : "Live only"}
                      </Badge>
                    )}
                    {filterStatus !== "all" && (
                      <Badge variant="secondary" data-testid="badge-active-filter-status">
                        status: {filterStatus}
                      </Badge>
                    )}
                    {packageQuery && (
                      <Badge variant="secondary" data-testid="badge-active-filter-package-id">
                        packageId: "{filterPackageId.trim()}"
                      </Badge>
                    )}
                    <span className="text-muted-foreground ml-1" data-testid="text-filter-result-count">
                      Showing {visibleBroadcasts.length} of {allBroadcasts.length}
                      {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
                    </span>
                  </div>
                )}
              </div>
            )}
            {visibleBroadcasts.length > 0 && (
              <div className="flex items-center justify-between gap-2 rounded border border-border bg-muted/40 px-2 py-1.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <Checkbox
                    checked={
                      allVisibleSelected
                        ? true
                        : someVisibleSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(c) => toggleSelectAllVisible(c === true)}
                    data-testid="checkbox-select-all-broadcasts"
                    aria-label="Select all broadcasts"
                  />
                  <span data-testid="text-bulk-selection-count">
                    {selectedIds.size > 0
                      ? `${selectedIds.size} selected`
                      : `Select all (${visibleBroadcasts.length})`}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedIds(new Set())}
                      disabled={bulkRunning}
                      data-testid="button-clear-bulk-selection"
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={selectedIds.size === 0 || bulkRunning}
                    onClick={() => setBulkConfirmOpen(true)}
                    data-testid="button-bulk-delete-broadcasts"
                  >
                    {bulkRunning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Delete selected
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-1 max-h-72 overflow-auto">
              {visibleBroadcasts.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-stretch gap-1 rounded border border-border ${selectedId === b.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center pl-2">
                    <Checkbox
                      checked={selectedIds.has(b.id)}
                      onCheckedChange={(c) => toggleSelected(b.id, c === true)}
                      disabled={bulkRunning}
                      data-testid={`checkbox-select-broadcast-${b.id}`}
                      aria-label={`Select broadcast ${b.id}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    className="flex-1 min-w-0 text-left p-2 hover:bg-muted rounded-l"
                    data-testid={`button-select-broadcast-${b.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">{b.packageId}</div>
                      <div className="flex items-center gap-1">
                        <Badge variant={b.dryRun ? "secondary" : "default"}>{b.dryRun ? "dry-run" : "live"}</Badge>
                        <Badge variant="outline">{b.status}</Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(b.id)}
                    disabled={deleteMut.isPending}
                    className="px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-r border-l border-border"
                    title="Delete broadcast"
                    aria-label={`Delete broadcast ${b.id}`}
                    data-testid={`button-delete-broadcast-${b.id}`}
                  >
                    {deleteMut.isPending && deleteMut.variables === b.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
              {listQ.data && allBroadcasts.length === 0 && (
                <div className="text-xs text-muted-foreground" data-testid="text-no-broadcasts">
                  No broadcasts yet. Use the form to render the first one.
                </div>
              )}
              {listQ.data && allBroadcasts.length > 0 && visibleBroadcasts.length === 0 && (
                <div className="text-xs text-muted-foreground" data-testid="text-no-broadcasts-match">
                  No broadcasts match the active filters.{" "}
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={clearFilters}
                    data-testid="button-clear-filters-inline"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
            {selected && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium" data-testid="text-selected-broadcast">
                    {selected.packageId}
                  </div>
                  <a
                    href={`/api/admin/broadcasts/${selected.id}/manifest`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary inline-flex items-center gap-1"
                    data-testid="link-manifest"
                  >
                    <FileJson className="w-3 h-3" /> Manifest JSON
                  </a>
                </div>
                <video
                  controls
                  src={`/api/admin/broadcasts/${selected.id}/preview`}
                  className="w-full rounded border border-border bg-black"
                  data-testid="video-broadcast-preview"
                />
                <div className="rounded border border-border p-2 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Viewer-facing title & cover (Live Channel)
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Falls back to manifest headline when empty"
                      data-testid="input-edit-title"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cover image URL</Label>
                    <Input
                      value={editCover}
                      onChange={(e) => setEditCover(e.target.value)}
                      placeholder="Falls back to first b-roll thumbnail when empty"
                      data-testid="input-edit-cover"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Or upload an image (stored privately)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        ref={coverFileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={uploadCoverMut.isPending}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setCropFile(f);
                            setCropOpen(true);
                          }
                        }}
                        data-testid="input-upload-cover"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={uploadCoverMut.isPending}
                        onClick={() => coverFileRef.current?.click()}
                        data-testid="button-pick-cover"
                      >
                        {uploadCoverMut.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Upload className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      PNG, JPEG, WebP, or GIF up to 8MB. Saved under
                      <code className="mx-1">PRIVATE_OBJECT_DIR/broadcasts/covers/</code>
                      and served at a stable admin-controlled URL.
                    </p>
                  </div>
                  {editCover.trim() && (
                    <div className="space-y-2">
                      <img
                        src={editCover.trim()}
                        alt="Cover preview"
                        className="w-full h-32 object-cover rounded border border-border"
                        data-testid="img-cover-preview"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={recropLoading || uploadCoverMut.isPending}
                        onClick={handleRecropSavedCover}
                        data-testid="button-recrop-saved-cover"
                      >
                        {recropLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-2" />
                        ) : (
                          <Crop className="w-3 h-3 mr-2" />
                        )}
                        Re-crop saved cover
                      </Button>
                    </div>
                  )}
                  <Button
                    size="sm"
                    onClick={() => updateMetaMut.mutate()}
                    disabled={updateMetaMut.isPending}
                    data-testid="button-save-broadcast-meta"
                  >
                    {updateMetaMut.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                    ) : null}
                    Save title & cover
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-border p-2">
                    <div className="text-muted-foreground">Confidence</div>
                    <div className="font-medium">
                      {selected.manifestJson?.confidence?.level} ·{" "}
                      {Math.round((selected.manifestJson?.confidence?.score ?? 0) * 100)}%
                    </div>
                  </div>
                  <div className="rounded border border-border p-2">
                    <div className="text-muted-foreground">Layers</div>
                    <div className="font-medium truncate">
                      {(selected.manifestJson?.layers ?? []).join(", ")}
                    </div>
                  </div>
                </div>
                <div className="rounded border border-border p-2 text-xs">
                  <div className="text-muted-foreground mb-1">Source attributions</div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {(selected.manifestJson?.sources ?? []).map((s: BroadcastSourceManifestItem, i: number) => (
                      <li key={i}>
                        <span className="font-medium">{s.name}</span> · {s.license}
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary ml-1"
                            data-testid={`link-source-${i}`}
                          >
                            (link)
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  variant="outline"
                  disabled
                  className="w-full"
                  data-testid="button-approve-publish-disabled"
                >
                  <ShieldCheck className="w-4 h-4 mr-2" /> Approve for publishing (T10 gate — disabled)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* T354 — Founder-only dialog that previews the parsed entries of a
          rotated fallback-preset audit archive so admins can confirm they're
          grabbing the right file before downloading, or skip the download
          entirely for casual investigations. */}
      <Dialog
        open={!!inspectingArchive}
        onOpenChange={(o) => {
          if (!o) setInspectingArchive(null);
        }}
      >
        <DialogContent
          className="max-w-2xl"
          data-testid="dialog-fallback-preset-audit-archive-inspect"
        >
          <DialogHeader>
            <DialogTitle>Inspect audit archive</DialogTitle>
            <DialogDescription>
              Search and page through entries parsed from this rotated
              fallback-preset audit archive.{" "}
              <span
                className="font-mono"
                data-testid="text-fallback-preset-audit-inspect-name"
              >
                {inspectingArchive}
              </span>
            </DialogDescription>
          </DialogHeader>
          {/* T357 — Actor + date-range filters so admins can finish casual
              investigations inside the dialog instead of downloading the
              JSONL. Mirrors the full-history filter controls. */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
            <Select
              value={inspectActorFilter || "__all__"}
              onValueChange={(v) =>
                setInspectActorFilter(v === "__all__" ? "" : v)
              }
            >
              <SelectTrigger
                className="h-6 text-[10px] px-1.5 w-[180px]"
                data-testid="select-fallback-preset-audit-inspect-actor"
              >
                <SelectValue placeholder="All actors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="__all__"
                  data-testid="option-fallback-preset-audit-inspect-actor-all"
                >
                  All actors
                </SelectItem>
                {(inspectFallbackAuditFirstPage?.actors ?? []).map((a) => (
                  <SelectItem
                    key={a.actorId}
                    value={a.actorId}
                    data-testid={`option-fallback-preset-audit-inspect-actor-${a.actorId}`}
                  >
                    {a.actor.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {inspectActorFilter && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                onClick={() => setInspectActorFilter("")}
                data-testid="button-fallback-preset-audit-inspect-actor-clear"
              >
                Clear
              </button>
            )}
            {/* T358 — Action-class filter (All / Updated / Cleared). Lives next
                to the actor + date controls so admins can isolate the exact
                event class they care about. */}
            <Select
              value={inspectActionFilter}
              onValueChange={(v) =>
                setInspectActionFilter(v as "all" | "set" | "clear")
              }
            >
              <SelectTrigger
                className="h-6 text-[10px] px-1.5 w-[120px]"
                data-testid="select-fallback-preset-audit-inspect-action"
              >
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="all"
                  data-testid="option-fallback-preset-audit-inspect-action-all"
                >
                  All actions
                </SelectItem>
                <SelectItem
                  value="set"
                  data-testid="option-fallback-preset-audit-inspect-action-set"
                >
                  Updated
                </SelectItem>
                <SelectItem
                  value="clear"
                  data-testid="option-fallback-preset-audit-inspect-action-clear"
                >
                  Cleared
                </SelectItem>
              </SelectContent>
            </Select>
            {inspectActionFilter !== "all" && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                onClick={() => setInspectActionFilter("all")}
                data-testid="button-fallback-preset-audit-inspect-action-clear"
              >
                Clear
              </button>
            )}
            <label
              className="text-[10px] text-muted-foreground flex items-center gap-1"
              htmlFor="input-fallback-preset-audit-inspect-from"
            >
              From
              <input
                id="input-fallback-preset-audit-inspect-from"
                type="datetime-local"
                value={inspectFrom}
                onChange={(e) => setInspectFrom(e.target.value)}
                className="h-6 text-[10px] px-1 rounded border border-input bg-background"
                data-testid="input-fallback-preset-audit-inspect-from"
              />
            </label>
            <label
              className="text-[10px] text-muted-foreground flex items-center gap-1"
              htmlFor="input-fallback-preset-audit-inspect-to"
            >
              To
              <input
                id="input-fallback-preset-audit-inspect-to"
                type="datetime-local"
                value={inspectTo}
                onChange={(e) => setInspectTo(e.target.value)}
                className="h-6 text-[10px] px-1 rounded border border-input bg-background"
                data-testid="input-fallback-preset-audit-inspect-to"
              />
            </label>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Quick:</span>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-input bg-background hover:bg-accent"
                onClick={() => applyInspectQuickRange(24)}
                data-testid="button-fallback-preset-audit-inspect-quick-24h"
              >
                Last 24h
              </button>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-input bg-background hover:bg-accent"
                onClick={() => applyInspectQuickRange(24 * 7)}
                data-testid="button-fallback-preset-audit-inspect-quick-7d"
              >
                Last 7d
              </button>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-input bg-background hover:bg-accent"
                onClick={() => applyInspectQuickRange(24 * 30)}
                data-testid="button-fallback-preset-audit-inspect-quick-30d"
              >
                Last 30d
              </button>
            </div>
            {(inspectFrom || inspectTo) && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                onClick={() => {
                  setInspectFrom("");
                  setInspectTo("");
                }}
                data-testid="button-fallback-preset-audit-inspect-date-clear"
              >
                Clear dates
              </button>
            )}
          </div>
          <div className="space-y-2 text-xs">
            {inspectFallbackAuditArchiveQ.isLoading ? (
              <p
                className="text-muted-foreground"
                data-testid="text-fallback-preset-audit-inspect-loading"
              >
                Loading archive…
              </p>
            ) : inspectFallbackAuditArchiveQ.isError ? (
              <p
                className="text-destructive"
                data-testid="text-fallback-preset-audit-inspect-error"
              >
                {(inspectFallbackAuditArchiveQ.error as Error)?.message ||
                  "Couldn't load this archive."}
              </p>
            ) : inspectFallbackAuditFirstPage ? (
              (() => {
                const firstPage = inspectFallbackAuditFirstPage;
                const entries = inspectFallbackAuditEntries;
                const matched = inspectFallbackAuditMatched;
                const fmt = (
                  s:
                    | { dryRun: string; status: string; packageId: string }
                    | null,
                ) =>
                  s
                    ? `dryRun=${s.dryRun}, status=${s.status}${
                        s.packageId ? `, pkg="${s.packageId}"` : ", no pkg"
                      }`
                    : "(not pinned)";
                const scope = inspectFallbackAuditHasFilters
                  ? "matching filters"
                  : "in this archive";
                return (
                  <>
                    <div
                      className="text-muted-foreground"
                      data-testid="text-fallback-preset-audit-inspect-summary"
                    >
                      {matched} {inspectActionScopeLabel}entr
                      {matched === 1 ? "y" : "ies"} {scope}
                      {inspectFallbackAuditHasFilters
                        ? ` (of ${firstPage.totalEntries} total)`
                        : ""}
                      {entries.length < matched
                        ? ` · showing the most recent ${entries.length}`
                        : ""}
                      {firstPage.corruptLines > 0
                        ? ` · ${firstPage.corruptLines} corrupt line${
                            firstPage.corruptLines === 1 ? "" : "s"
                          } skipped`
                        : ""}
                    </div>
                    {/* T361 — Set vs clear breakdown for the current actor +
                        date scope (ignores the action filter itself so both
                        sides remain visible). Lets admins spot anomalies like
                        "20 clears vs 2 updates" without flipping filters. */}
                    <div
                      className="text-muted-foreground text-[11px]"
                      data-testid="text-fallback-preset-audit-inspect-breakdown"
                    >
                      Updates:{" "}
                      <span
                        className="font-medium text-foreground/90"
                        data-testid="text-fallback-preset-audit-inspect-breakdown-set"
                      >
                        {firstPage.setCount}
                      </span>{" "}
                      ·{" "}
                      Cleared:{" "}
                      <span
                        className="font-medium text-foreground/90"
                        data-testid="text-fallback-preset-audit-inspect-breakdown-clear"
                      >
                        {firstPage.clearCount}
                      </span>
                    </div>
                    {entries.length === 0 ? (
                      <p
                        className="text-muted-foreground"
                        data-testid="text-fallback-preset-audit-inspect-empty"
                      >
                        {inspectFallbackAuditHasFilters
                          ? "No entries match the current filters."
                          : "No readable entries in this archive."}
                      </p>
                    ) : (
                      <>
                        <ul
                          className="space-y-1 max-h-[50vh] overflow-y-auto pr-1"
                          data-testid="list-fallback-preset-audit-inspect-entries"
                        >
                          {entries.map((e, idx) => {
                            const when = e.ts
                              ? new Date(e.ts).toLocaleString()
                              : "unknown time";
                            const key = e.id ?? `${e.ts ?? ""}-${idx}`;
                            return (
                              <li
                                key={key}
                                className="text-muted-foreground rounded border border-border/60 px-1.5 py-1 bg-background/60"
                                data-testid={`row-fallback-preset-audit-inspect-entry-${idx}`}
                              >
                                <div className="font-medium text-foreground/90">
                                  {e.action === "clear" ? "Cleared" : "Updated"}{" "}
                                  by{" "}
                                  <span
                                    data-testid={`text-fallback-preset-audit-inspect-actor-${idx}`}
                                  >
                                    {e.actor.displayName}
                                  </span>{" "}
                                  ·{" "}
                                  <span
                                    data-testid={`text-fallback-preset-audit-inspect-ts-${idx}`}
                                  >
                                    {when}
                                  </span>
                                </div>
                                <div
                                  data-testid={`text-fallback-preset-audit-inspect-before-${idx}`}
                                >
                                  Before: {fmt(e.before)}
                                </div>
                                <div
                                  data-testid={`text-fallback-preset-audit-inspect-after-${idx}`}
                                >
                                  After: {fmt(e.after)}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        {inspectFallbackAuditArchiveQ.hasNextPage && (
                          <div
                            className="flex items-center justify-between gap-2 pt-1"
                            data-testid="fallback-preset-audit-inspect-pager"
                          >
                            <span
                              className="text-[10px] text-muted-foreground"
                              data-testid="text-fallback-preset-audit-inspect-range"
                            >
                              Showing {entries.length} of {matched}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                inspectFallbackAuditArchiveQ.isFetchingNextPage
                              }
                              onClick={() =>
                                inspectFallbackAuditArchiveQ.fetchNextPage()
                              }
                              data-testid="button-load-more-fallback-preset-audit-inspect"
                            >
                              {inspectFallbackAuditArchiveQ.isFetchingNextPage
                                ? "Loading…"
                                : "Load more"}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()
            ) : null}
          </div>
          <DialogFooter>
            {viewerIsFounder && inspectingArchive && (
              <Button
                variant="outline"
                size="sm"
                asChild
                data-testid="button-fallback-preset-audit-inspect-download"
              >
                <a
                  href={`/api/admin/broadcasts/fallback-default-preset-audit/archives/${encodeURIComponent(
                    inspectingArchive,
                  )}`}
                  download={inspectingArchive}
                >
                  Download JSONL
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInspectingArchive(null)}
              data-testid="button-fallback-preset-audit-inspect-close"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={saveViewOpen}
        onOpenChange={(o) => {
          setSaveViewOpen(o);
          if (!o) {
            setNewViewName("");
            setNewViewShared(false);
          }
        }}
      >
        <DialogContent data-testid="dialog-save-view">
          <DialogHeader>
            <DialogTitle>Save current filter view</DialogTitle>
            <DialogDescription>
              Give this filter combination a name. Private views are visible only
              to you; shared views appear in every admin's "Saved views" menu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-2">
              <Label htmlFor="input-new-view-name">View name</Label>
              <Input
                id="input-new-view-name"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder='e.g. "Live failures last 24h"'
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newViewName.trim()) {
                    e.preventDefault();
                    saveCurrentAsView();
                  }
                }}
                data-testid="input-new-view-name"
              />
            </div>
            <div className="flex items-start justify-between gap-3 rounded border border-border p-2">
              <div className="space-y-0.5">
                <Label
                  htmlFor="switch-new-view-shared"
                  className="text-xs font-medium flex items-center gap-1.5"
                >
                  <Users2 className="w-3 h-3" /> Share with team
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Other admins will see this in their "Saved views" menu under
                  "Shared with team".
                </p>
              </div>
              <Switch
                id="switch-new-view-shared"
                checked={newViewShared}
                onCheckedChange={setNewViewShared}
                data-testid="switch-new-view-shared"
              />
            </div>
            <div
              className="rounded border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground"
              data-testid="text-new-view-summary"
            >
              {describeView({
                dryRun: filterDryRun,
                status: filterStatus,
                packageId: filterPackageId.trim(),
              })}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSaveViewOpen(false)}
              data-testid="button-cancel-save-view"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveCurrentAsView}
              disabled={!newViewName.trim() || createViewMut.isPending}
              data-testid="button-confirm-save-view"
            >
              {createViewMut.isPending ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : newViewShared ? (
                <Users2 className="w-3 h-3 mr-2" />
              ) : (
                <Bookmark className="w-3 h-3 mr-2" />
              )}
              {newViewShared ? "Save & share" : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={suggestionsDialogOpen}
        onOpenChange={(o) => {
          if (!applyingSuggestions) setSuggestionsDialogOpen(o);
        }}
      >
        <DialogContent
          className="max-w-2xl"
          data-testid="dialog-coverage-suggestions"
        >
          <DialogHeader>
            <DialogTitle>Suggested schedule fixes</DialogTitle>
            <DialogDescription>
              These per-view edits would close uncovered hours without creating
              new overlaps. Pick which to apply — or spin up a brand-new
              shared view dedicated to gap-filling.
            </DialogDescription>
          </DialogHeader>
          {viewerIsFounder && (
            <div
              className="flex items-center gap-1 rounded-md border bg-muted/40 p-1"
              data-testid="group-suggestion-mode"
              role="tablist"
              aria-label="Suggestion mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={suggestionMode === "extend-existing"}
                onClick={() => setSuggestionMode("extend-existing")}
                disabled={applyingSuggestions}
                className={`flex-1 text-[11px] px-2 py-1.5 rounded ${suggestionMode === "extend-existing" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="button-suggestion-mode-extend"
              >
                Extend existing views
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={suggestionMode === "new-fallback"}
                onClick={() => setSuggestionMode("new-fallback")}
                disabled={applyingSuggestions}
                className={`flex-1 text-[11px] px-2 py-1.5 rounded ${suggestionMode === "new-fallback" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="button-suggestion-mode-new-fallback"
              >
                Create new fallback view
              </button>
            </div>
          )}
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {suggestionMode === "new-fallback" && viewerIsFounder && (
              <div
                className="border rounded p-3 space-y-2"
                data-testid="section-new-fallback-view"
              >
                <div className="space-y-1">
                  <Label htmlFor="input-fallback-view-name" className="text-xs">
                    New shared view name
                  </Label>
                  <Input
                    id="input-fallback-view-name"
                    value={fallbackViewName}
                    onChange={(e) => setFallbackViewName(e.target.value)}
                    disabled={applyingSuggestions}
                    className="h-8 text-xs"
                    placeholder="Coverage fallback"
                    data-testid="input-fallback-view-name"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Filters for this fallback view</Label>
                    <div className="flex items-center gap-2">
                      {fallbackPreset && (
                        <button
                          type="button"
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                          onClick={() => {
                            setFallbackDryRun(fallbackPreset.dryRun);
                            setFallbackStatus(fallbackPreset.status);
                            setFallbackPackageId(fallbackPreset.packageId);
                          }}
                          disabled={applyingSuggestions}
                          data-testid="button-fallback-reset-to-team-default"
                          title="Reset to the team-default fallback filters pinned in Manage views"
                        >
                          Reset to team default
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        onClick={() => {
                          setFallbackDryRun(filterDryRun);
                          setFallbackStatus(filterStatus);
                          setFallbackPackageId(filterPackageId);
                        }}
                        disabled={applyingSuggestions}
                        data-testid="button-fallback-reset-to-current"
                        title="Copy the filters I currently have applied on the dashboard"
                      >
                        Reset to current filters
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1 min-w-[140px]">
                      <Label className="text-[10px] text-muted-foreground">Dry-run mode</Label>
                      <Select
                        value={fallbackDryRun}
                        onValueChange={(v) =>
                          setFallbackDryRun(v as "all" | "dry" | "live")
                        }
                        disabled={applyingSuggestions}
                      >
                        <SelectTrigger
                          className="h-8 text-xs"
                          data-testid="select-fallback-dry-run"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All (dry-run & live)</SelectItem>
                          <SelectItem value="dry">Dry-run only</SelectItem>
                          <SelectItem value="live">Live only (hide dry-run)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 min-w-[120px]">
                      <Label className="text-[10px] text-muted-foreground">Status</Label>
                      <Select
                        value={fallbackStatus}
                        onValueChange={setFallbackStatus}
                        disabled={applyingSuggestions}
                      >
                        <SelectTrigger
                          className="h-8 text-xs"
                          data-testid="select-fallback-status"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Any status</SelectItem>
                          {availableStatuses.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 flex-1 min-w-[160px]">
                      <Label className="text-[10px] text-muted-foreground">packageId</Label>
                      <Input
                        value={fallbackPackageId}
                        onChange={(e) => setFallbackPackageId(e.target.value)}
                        placeholder="e.g. demo-pkg-001 (blank = all)"
                        className="h-8 text-xs"
                        disabled={applyingSuggestions}
                        data-testid="input-fallback-package-id"
                      />
                    </div>
                  </div>
                  <p
                    className="text-[10px] text-muted-foreground"
                    data-testid="text-fallback-filter-summary"
                  >
                    Saved as: dryRun={fallbackDryRun}, status={fallbackStatus}
                    {fallbackPackageId.trim()
                      ? `, pkg="${fallbackPackageId.trim()}"`
                      : ", no package filter"}
                  </p>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Schedule will cover{" "}
                  <span
                    className="font-medium text-foreground"
                    data-testid="text-fallback-window-count"
                  >
                    {fallbackSchedule.windows.length} window
                    {fallbackSchedule.windows.length === 1 ? "" : "s"}
                  </span>{" "}
                  ({fallbackGaps.reduce((acc, g) => acc + (g.end - g.start), 0)}{" "}
                  minute
                  {fallbackGaps.reduce((acc, g) => acc + (g.end - g.start), 0) === 1
                    ? ""
                    : "s"}{" "}
                  per week)
                  {acceptedSuggestionIds.size > 0 &&
                  coverageSuggestions.suggestions.length > 0
                    ? " — limited to the gaps the selected extensions cannot absorb."
                    : "."}
                </div>
                {fallbackSchedule.windows.length === 0 ? (
                  <p
                    className="text-[11px] text-emerald-600 dark:text-emerald-400"
                    data-testid="text-fallback-no-gaps"
                  >
                    No remaining gaps — nothing to create.
                  </p>
                ) : (
                  <ul
                    className="text-[10px] text-muted-foreground list-disc pl-4 space-y-0.5 max-h-32 overflow-auto"
                    data-testid="list-fallback-windows"
                  >
                    {fallbackSchedule.windows.map((w, i) => (
                      <li
                        key={i}
                        data-testid={`text-fallback-window-${i}`}
                      >
                        {formatScheduleRange(
                          w.days[0],
                          w.startMinute,
                          w.endMinute,
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {coverageSuggestions.suggestions.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Tip: leave some extension suggestions checked below to let
                    them absorb adjacent gaps first; the new view will only
                    cover what's left over.
                  </p>
                )}
              </div>
            )}
            {dismissedSuggestionIds.size > 0 && (
              <div
                className="flex items-center justify-between rounded border border-dashed border-muted-foreground/30 px-2 py-1.5 text-[11px] text-muted-foreground"
                data-testid="banner-dismissed-suggestions"
              >
                <span data-testid="text-dismissed-suggestion-count">
                  {dismissedSuggestionIds.size} suggestion
                  {dismissedSuggestionIds.size === 1 ? "" : "s"} dismissed
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={restoreDismissedSuggestions}
                  disabled={applyingSuggestions}
                  data-testid="button-restore-dismissed-suggestions"
                >
                  Restore dismissed
                </Button>
              </div>
            )}
            {coverageSuggestions.suggestions.length === 0 ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="text-coverage-suggestions-empty"
              >
                No suggestions to apply — coverage is already complete.
              </p>
            ) : visibleSuggestions.length === 0 ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="text-coverage-suggestions-all-dismissed"
              >
                All suggestions dismissed. Restore them to apply any fixes.
              </p>
            ) : (
              visibleSuggestions.map((s: CoverageSuggestion) => {
                const checked = acceptedSuggestionIds.has(s.viewId);
                const edited = editedSuggestionMap.get(s.viewId);
                const extras = suggestionExtraChanges[s.viewId] ?? [];
                const effectiveOrigChanges = [...s.changes, ...extras];
                const editedChanges = edited?.changes ?? effectiveOrigChanges;
                const editedAfter = edited?.after ?? s.after;
                const editsForView = suggestionEdits[s.viewId] ?? {};
                const error = suggestionValidationErrors[s.viewId];
                const originalCount = s.changes.length;
                return (
                  <div
                    key={s.viewId}
                    className="border rounded p-3 flex items-start gap-3"
                    data-testid={`row-coverage-suggestion-${s.viewId}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        toggleSuggestion(s.viewId, v === true)
                      }
                      data-testid={`checkbox-coverage-suggestion-${s.viewId}`}
                      aria-label={`Apply schedule edit to ${s.viewName}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="text-sm font-medium"
                          data-testid={`text-coverage-suggestion-name-${s.viewId}`}
                        >
                          {s.viewName}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => dismissSuggestion(s.viewId)}
                          disabled={applyingSuggestions}
                          data-testid={`button-coverage-suggestion-dismiss-${s.viewId}`}
                          aria-label={`Dismiss suggestion for ${s.viewName}`}
                          title="Remove this suggestion from the list"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Dismiss
                        </Button>
                      </div>
                      <ul className="text-xs text-muted-foreground pl-0 mt-1 space-y-2">
                        {effectiveOrigChanges.map((origChange, i) => {
                          const isExtra = i >= originalCount;
                          const extraIndex = i - originalCount;
                          const c = editedChanges[i];
                          const override = editsForView[i];
                          const isEdited = !!override;
                          const dayLabel = SCHEDULE_DAY_LABELS[c.day];
                          const bounds = getChangeBounds(origChange);
                          let startValue: number;
                          let endValue: number;
                          let startEditable: boolean;
                          let endEditable: boolean;
                          if (c.kind === "extend-end") {
                            const w = editedAfter.windows[c.windowIndex];
                            startValue = w?.startMinute ?? c.to;
                            endValue = c.to;
                            startEditable = false;
                            endEditable = true;
                          } else if (c.kind === "extend-start") {
                            const w = editedAfter.windows[c.windowIndex];
                            startValue = c.to;
                            endValue = w?.endMinute ?? c.to;
                            startEditable = true;
                            endEditable = false;
                          } else {
                            startValue = c.startMinute;
                            endValue = c.endMinute;
                            startEditable = true;
                            endEditable = true;
                          }
                          const startMinAttr =
                            bounds.startMin !== undefined
                              ? minutesToHHMM(bounds.startMin)
                              : undefined;
                          const startMaxAttr =
                            bounds.startMax !== undefined
                              ? minutesToHHMM(bounds.startMax)
                              : undefined;
                          const endMinAttr =
                            bounds.endMin !== undefined
                              ? minutesToHHMM(bounds.endMin)
                              : undefined;
                          const endMaxAttr =
                            bounds.endMax !== undefined
                              ? minutesToHHMM(bounds.endMax)
                              : undefined;
                          const kindLabel =
                            c.kind === "add-window"
                              ? isExtra
                                ? "Add window (original day cover)"
                                : "Add window"
                              : c.kind === "extend-end"
                                ? "Extend end"
                                : "Extend start";
                          return (
                            <li
                              key={i}
                              className="space-y-1"
                              data-testid={`text-coverage-suggestion-change-${s.viewId}-${i}`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {kindLabel}
                                </span>
                                <Select
                                  value={String(c.day)}
                                  onValueChange={(v) => {
                                    const d = Number(v);
                                    if (!Number.isFinite(d)) return;
                                    setSuggestionChangeOverride(s.viewId, i, {
                                      day: d,
                                    });
                                  }}
                                >
                                  <SelectTrigger
                                    className="h-7 w-[80px] text-xs"
                                    aria-label={`Day of week for ${s.viewName} change ${i + 1}`}
                                    data-testid={`select-coverage-suggestion-day-${s.viewId}-${i}`}
                                  >
                                    <SelectValue>{dayLabel}</SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SCHEDULE_DAY_LABELS.map((label, di) => (
                                      <SelectItem
                                        key={di}
                                        value={String(di)}
                                        data-testid={`select-coverage-suggestion-day-${s.viewId}-${i}-option-${di}`}
                                      >
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="time"
                                  className="h-7 w-[100px] text-xs"
                                  value={minutesToHHMM(startValue)}
                                  disabled={!startEditable}
                                  min={startMinAttr}
                                  max={startMaxAttr}
                                  onChange={(e) => {
                                    const v = hhmmToMinutes(e.target.value);
                                    if (v === null) return;
                                    setSuggestionChangeOverride(s.viewId, i, {
                                      start: v,
                                    });
                                  }}
                                  data-testid={`input-coverage-suggestion-start-${s.viewId}-${i}`}
                                  aria-label={`Start time for ${s.viewName} change ${i + 1}`}
                                />
                                <span>–</span>
                                <Input
                                  type="time"
                                  className="h-7 w-[100px] text-xs"
                                  value={minutesToHHMM(endValue)}
                                  disabled={!endEditable}
                                  min={endMinAttr}
                                  max={endMaxAttr}
                                  onChange={(e) => {
                                    const v = hhmmToMinutes(e.target.value);
                                    if (v === null) return;
                                    setSuggestionChangeOverride(s.viewId, i, {
                                      end: v,
                                    });
                                  }}
                                  data-testid={`input-coverage-suggestion-end-${s.viewId}-${i}`}
                                  aria-label={`End time for ${s.viewName} change ${i + 1}`}
                                />
                                {isEdited && !isExtra && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() =>
                                      resetSuggestionChangeOverride(
                                        s.viewId,
                                        i,
                                      )
                                    }
                                    data-testid={`button-coverage-suggestion-reset-${s.viewId}-${i}`}
                                  >
                                    Reset
                                  </Button>
                                )}
                                {isExtra && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => {
                                      if (isEdited) {
                                        resetSuggestionChangeOverride(
                                          s.viewId,
                                          i,
                                        );
                                      }
                                      removeSuggestionExtraChange(
                                        s.viewId,
                                        extraIndex,
                                      );
                                    }}
                                    data-testid={`button-coverage-suggestion-remove-extra-${s.viewId}-${extraIndex}`}
                                  >
                                    Remove
                                  </Button>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {isExtra ? "Added: " : "Suggested: "}
                                {describeCoverageChange(origChange)}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="text-[10px] text-muted-foreground mt-2">
                        <div data-testid={`text-coverage-suggestion-before-${s.viewId}`}>
                          Before: {summarizeSchedule(s.before)}
                        </div>
                        <div data-testid={`text-coverage-suggestion-after-${s.viewId}`}>
                          After: {summarizeSchedule(editedAfter)}
                        </div>
                      </div>
                      {error && (
                        <div
                          className="text-[11px] text-destructive mt-2"
                          data-testid={`text-coverage-suggestion-error-${s.viewId}`}
                        >
                          {error}
                        </div>
                      )}
                      {!error && suggestionCoverageWarningById.has(s.viewId) && (
                        <div
                          className="flex flex-wrap items-center gap-2 mt-2"
                          data-testid={`text-coverage-suggestion-warning-${s.viewId}`}
                        >
                          <span className="text-[11px] text-amber-600 dark:text-amber-400">
                            Warning: original gap on{" "}
                            {suggestionCoverageWarningById
                              .get(s.viewId)!
                              .map((d) => SCHEDULE_DAY_LABELS[d])
                              .join(", ")}{" "}
                            will remain uncovered after this edit.
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() =>
                              coverOriginalDayForSuggestion(
                                s.viewId,
                                suggestionCoverageWarningById.get(s.viewId)!,
                              )
                            }
                            data-testid={`button-coverage-suggestion-cover-original-${s.viewId}`}
                          >
                            Cover original day too
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {coverageSuggestions.unresolvedGaps.length > 0 && (
              <p
                className="text-[11px] text-amber-600 dark:text-amber-400"
                data-testid="text-coverage-unresolved-gaps"
              >
                {coverageSuggestions.unresolvedGaps.length} gap
                {coverageSuggestions.unresolvedGaps.length === 1
                  ? ""
                  : "s"}{" "}
                could not be auto-filled. You may need to add a new shared view
                manually.
              </p>
            )}
          </div>
          {suggestionCoverageWarnings.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 px-1"
              data-testid="text-coverage-suggestions-warning-summary"
            >
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                {suggestionCoverageWarnings.length} accepted edit
                {suggestionCoverageWarnings.length === 1 ? "" : "s"} leave
                {suggestionCoverageWarnings.length === 1 ? "s" : ""} the
                original gap day uncovered:{" "}
                {Array.from(
                  new Set(
                    suggestionCoverageWarnings.flatMap((w) =>
                      w.uncoveredDays.map((d) => SCHEDULE_DAY_LABELS[d]),
                    ),
                  ),
                ).join(", ")}
                .
              </span>
              {suggestionCoverageWarnings.length >= 2 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={coverAllFlaggedDays}
                  data-testid="button-coverage-suggestions-cover-all-flagged"
                >
                  Cover all flagged days
                </Button>
              )}
              {lastCoverAllBatch &&
                (Object.keys(lastCoverAllBatch.extras).length > 0 ||
                  lastCoverAllBatch.newlyAcceptedIds.length > 0) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={undoCoverAllFlaggedDays}
                    data-testid="button-coverage-suggestions-undo-cover-all-flagged"
                  >
                    Undo
                  </Button>
                )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSuggestionsDialogOpen(false)}
              disabled={applyingSuggestions}
              data-testid="button-coverage-suggestions-dismiss"
            >
              Dismiss
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAcceptedSuggestionIds(
                  new Set(visibleSuggestions.map((s) => s.viewId)),
                );
                setLastCoverAllBatch(null);
              }}
              disabled={
                applyingSuggestions || visibleSuggestions.length === 0
              }
              data-testid="button-coverage-suggestions-select-all"
            >
              Select all
            </Button>
            <Button
              type="button"
              onClick={
                suggestionMode === "new-fallback"
                  ? applyNewFallbackView
                  : applySelectedSuggestions
              }
              disabled={
                applyingSuggestions ||
                (suggestionMode === "new-fallback"
                  ? !fallbackViewName.trim() ||
                    fallbackSchedule.windows.length === 0
                  : acceptedSuggestionIds.size === 0 ||
                    visibleSuggestions.some(
                      (s) =>
                        acceptedSuggestionIds.has(s.viewId) &&
                        !!suggestionValidationErrors[s.viewId],
                    ))
              }
              data-testid="button-coverage-suggestions-apply"
            >
              {applyingSuggestions ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : null}
              {suggestionMode === "new-fallback"
                ? `Create fallback view${fallbackSchedule.windows.length > 0 ? ` (${fallbackSchedule.windows.length} window${fallbackSchedule.windows.length === 1 ? "" : "s"})` : ""}`
                : `Apply${acceptedSuggestionIds.size > 0 ? ` (${acceptedSuggestionIds.size})` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={manageViewsOpen}
        onOpenChange={(o) => {
          setManageViewsOpen(o);
          if (!o) setRenameDraft({});
        }}
      >
        <DialogContent data-testid="dialog-manage-saved-views">
          <DialogHeader>
            <DialogTitle>Manage saved views</DialogTitle>
            <DialogDescription>
              Rename, share, or delete saved filter views. Shared views appear
              in every admin's "Saved views" menu. Only the creator or a
              founder can modify a shared view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-auto">
            {/* T310 — Team-default fallback filter preset editor. Founders can
                pin a dryRun/status/packageId combo that becomes the starting
                point for the "Create new fallback view" form in the Suggest
                fix dialog, regardless of whatever filters are currently
                applied on the dashboard. */}
            <div
              className="rounded border border-border p-2 space-y-2 bg-muted/30"
              data-testid="section-fallback-default-preset"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium flex items-center gap-1.5">
                  <Pin className="w-3 h-3" /> Default fallback filters
                </div>
                {fallbackPreset ? (
                  <Badge
                    variant="default"
                    className="text-[10px] py-0 px-1.5"
                    data-testid="badge-fallback-default-preset-pinned"
                  >
                    Pinned
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="text-[10px] py-0 px-1.5"
                    data-testid="badge-fallback-default-preset-unpinned"
                  >
                    Not pinned
                  </Badge>
                )}
              </div>
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="text-fallback-default-preset-summary"
              >
                {fallbackPreset
                  ? `New fallback views start as: dryRun=${fallbackPreset.dryRun}, status=${fallbackPreset.status}${fallbackPreset.packageId ? `, pkg="${fallbackPreset.packageId}"` : ", no package filter"}.`
                  : "The Suggest fix dialog inherits your currently-applied dashboard filters when creating a new fallback view. Pin a preset to make it predictable team-wide."}
              </p>
              {fallbackPreset && (
                <p
                  className="text-[10px] text-muted-foreground"
                  data-testid="text-fallback-default-preset-meta"
                >
                  Last set by {fallbackPreset.updatedBy.displayName} ·{" "}
                  {new Date(fallbackPreset.updatedAt).toLocaleString()}
                </p>
              )}
              {viewerIsFounder ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() =>
                      saveFallbackPresetMut.mutate({
                        dryRun: filterDryRun,
                        status: filterStatus,
                        packageId: filterPackageId.trim(),
                      })
                    }
                    disabled={saveFallbackPresetMut.isPending}
                    data-testid="button-pin-fallback-default-from-current"
                    title="Save the dashboard filters I have applied right now as the team default"
                  >
                    {saveFallbackPresetMut.isPending ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : null}
                    Pin current filters
                  </Button>
                  {fallbackPreset && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      onClick={() => clearFallbackPresetMut.mutate()}
                      disabled={clearFallbackPresetMut.isPending}
                      data-testid="button-clear-fallback-default-preset"
                    >
                      {clearFallbackPresetMut.isPending ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : null}
                      Clear
                    </Button>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    Current filters: dryRun={filterDryRun}, status={filterStatus}
                    {filterPackageId.trim()
                      ? `, pkg="${filterPackageId.trim()}"`
                      : ", no package"}
                  </span>
                </div>
              ) : (
                <p
                  className="text-[10px] text-muted-foreground italic"
                  data-testid="text-fallback-default-preset-founder-only"
                >
                  Only a founder can change this preset.
                </p>
              )}
              {/* T316 — Recent preset changes so founders can see who last
                  updated the team default and what the previous values were
                  before applying a new change. */}
              <div
                className="border-t border-border pt-2 mt-1 space-y-1"
                data-testid="section-fallback-default-preset-history"
              >
                <div className="text-[11px] font-medium flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Recent changes
                </div>
                {/* T320 — Actor filter so admins can narrow the history to a
                    specific founder ("what did *I* change last", "did Alice
                    override my pin"). Mirrors the schedule audit's viewId
                    filter pattern. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Select
                    value={fallbackPresetAuditActorFilter || "__all__"}
                    onValueChange={(v) =>
                      setFallbackPresetAuditActorFilter(v === "__all__" ? "" : v)
                    }
                  >
                    <SelectTrigger
                      className="h-6 text-[10px] px-1.5 w-[180px]"
                      data-testid="select-fallback-default-preset-history-actor"
                    >
                      <SelectValue placeholder="All actors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        value="__all__"
                        data-testid="option-fallback-default-preset-history-actor-all"
                      >
                        All actors
                      </SelectItem>
                      {(fallbackPresetAuditFirstPage?.actors ?? []).map((a) => (
                        <SelectItem
                          key={a.actorId}
                          value={a.actorId}
                          data-testid={`option-fallback-default-preset-history-actor-${a.actorId}`}
                        >
                          {a.actor.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fallbackPresetAuditActorFilter && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      onClick={() => setFallbackPresetAuditActorFilter("")}
                      data-testid="button-fallback-default-preset-history-actor-clear"
                    >
                      Clear
                    </button>
                  )}
                  {/* T326 — Date range filter so admins can scope the history
                      to a specific incident window. Composes with the actor
                      filter above. */}
                  <label
                    className="text-[10px] text-muted-foreground flex items-center gap-1"
                    htmlFor="input-fallback-default-preset-history-from"
                  >
                    From
                    <input
                      id="input-fallback-default-preset-history-from"
                      type="datetime-local"
                      value={fallbackPresetAuditFrom}
                      onChange={(e) => setFallbackPresetAuditFrom(e.target.value)}
                      className="h-6 text-[10px] px-1 rounded border border-input bg-background"
                      data-testid="input-fallback-default-preset-history-from"
                    />
                  </label>
                  <label
                    className="text-[10px] text-muted-foreground flex items-center gap-1"
                    htmlFor="input-fallback-default-preset-history-to"
                  >
                    To
                    <input
                      id="input-fallback-default-preset-history-to"
                      type="datetime-local"
                      value={fallbackPresetAuditTo}
                      onChange={(e) => setFallbackPresetAuditTo(e.target.value)}
                      className="h-6 text-[10px] px-1 rounded border border-input bg-background"
                      data-testid="input-fallback-default-preset-history-to"
                    />
                  </label>
                  {/* T329 — Quick-range presets so admins can jump to the
                      most common incident-review windows without typing
                      into the datetime pickers. Composes with the actor
                      filter and the manual From/To inputs. */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      Quick:
                    </span>
                    <button
                      type="button"
                      className="text-[10px] px-1.5 py-0.5 rounded border border-input bg-background hover:bg-accent"
                      onClick={() => applyFallbackPresetAuditQuickRange(24)}
                      data-testid="button-fallback-default-preset-history-quick-24h"
                    >
                      Last 24h
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1.5 py-0.5 rounded border border-input bg-background hover:bg-accent"
                      onClick={() => applyFallbackPresetAuditQuickRange(24 * 7)}
                      data-testid="button-fallback-default-preset-history-quick-7d"
                    >
                      Last 7d
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1.5 py-0.5 rounded border border-input bg-background hover:bg-accent"
                      onClick={() => applyFallbackPresetAuditQuickRange(24 * 30)}
                      data-testid="button-fallback-default-preset-history-quick-30d"
                    >
                      Last 30d
                    </button>
                  </div>
                  {(fallbackPresetAuditFrom || fallbackPresetAuditTo) && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      onClick={() => {
                        setFallbackPresetAuditFrom("");
                        setFallbackPresetAuditTo("");
                      }}
                      data-testid="button-fallback-default-preset-history-date-clear"
                    >
                      Clear dates
                    </button>
                  )}
                </div>
                {/* T330 — Match counter so admins can tell an empty result
                    from filters that excluded everything during triage. */}
                {fallbackPresetAuditQ.data &&
                  (() => {
                    // T342 — `useInfiniteQuery` wraps results as
                    // `{ pages, pageParams }`, so read the total from the
                    // freshest page and the shown count from the flattened
                    // entries derived above.
                    const total = fallbackPresetAuditTotal;
                    const shown = fallbackPresetAuditEntries.length;
                    const hasActor = Boolean(fallbackPresetAuditActorFilter);
                    const hasDate = Boolean(
                      fallbackPresetAuditFromIso || fallbackPresetAuditToIso,
                    );
                    const scope =
                      hasDate && hasActor
                        ? "in range for actor"
                        : hasDate
                        ? "in range"
                        : hasActor
                        ? "for actor"
                        : "recorded";
                    const label =
                      total === 0
                        ? hasDate || hasActor
                          ? `No matches ${scope}`
                          : "No changes recorded yet"
                        : shown < total
                        ? `Showing ${shown} of ${total} ${scope}`
                        : `Showing ${total} of ${total} ${scope}`;
                    return (
                      <p
                        className="text-[10px] text-muted-foreground"
                        data-testid="text-fallback-default-preset-history-count"
                      >
                        {label}
                      </p>
                    );
                  })()}
                {/* T328 — Admin-tunable retention for the fallback-preset
                    audit log. Mirrors the cover-/media-sweep audit-retention
                    cards in ProductionHouse. Founders can nudge max bytes /
                    max archives without an env-var redeploy. */}
                {fallbackPresetAuditStats &&
                  (() => {
                    const s = fallbackPresetAuditStats;
                    const limits = s.limits;
                    const minBytesKib = limits
                      ? Math.ceil(limits.bytesMin / 1024)
                      : 64;
                    const maxBytesKib = limits
                      ? Math.floor(limits.bytesMax / 1024)
                      : 102400;
                    const minArchives = limits?.archivesMin ?? 1;
                    const maxArchives = limits?.archivesMax ?? 100;
                    const currentKib = Math.round(s.maxBytes / 1024);
                    const saving = saveFallbackAuditRetentionMut.isPending;
                    return (
                      <div
                        className="rounded border border-border/60 bg-background/60 px-2 py-1.5 space-y-1.5"
                        data-testid="fallback-preset-audit-retention"
                      >
                        <div className="uppercase tracking-wider text-muted-foreground text-[9px]">
                          Audit log retention
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div>
                            <label
                              className="text-muted-foreground"
                              htmlFor="fallback-preset-audit-bytes"
                            >
                              Max file size (KiB)
                            </label>
                            <Input
                              id="fallback-preset-audit-bytes"
                              type="number"
                              min={minBytesKib}
                              max={maxBytesKib}
                              value={fallbackAuditBytesKibDraft}
                              onChange={(e) =>
                                setFallbackAuditBytesKibDraft(e.target.value)
                              }
                              className="h-6 text-[10px] px-1.5 w-24 mt-0.5"
                              data-testid="input-fallback-preset-audit-bytes"
                            />
                            <div className="text-muted-foreground mt-0.5">
                              Current: {currentKib} KiB
                              {s.maxBytesSource && (
                                <span className="ml-1 opacity-70">
                                  (source: {s.maxBytesSource})
                                </span>
                              )}
                            </div>
                            {limits && (
                              <div className="text-muted-foreground/80">
                                Allowed: {minBytesKib}–{maxBytesKib} KiB
                              </div>
                            )}
                          </div>
                          <div>
                            <label
                              className="text-muted-foreground"
                              htmlFor="fallback-preset-audit-archives"
                            >
                              Max archives kept
                            </label>
                            <Input
                              id="fallback-preset-audit-archives"
                              type="number"
                              min={minArchives}
                              max={maxArchives}
                              step={1}
                              value={fallbackAuditArchivesDraft}
                              onChange={(e) =>
                                setFallbackAuditArchivesDraft(e.target.value)
                              }
                              className="h-6 text-[10px] px-1.5 w-20 mt-0.5"
                              data-testid="input-fallback-preset-audit-archives"
                            />
                            <div className="text-muted-foreground mt-0.5">
                              Current: {s.maxArchives}
                              {s.maxArchivesSource && (
                                <span className="ml-1 opacity-70">
                                  (source: {s.maxArchivesSource})
                                </span>
                              )}
                            </div>
                            {limits && (
                              <div className="text-muted-foreground/80">
                                Allowed: {minArchives}–{maxArchives}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={saveFallbackAuditRetention}
                            disabled={saving}
                            className="h-6 px-2 text-[10px]"
                            data-testid="button-fallback-preset-audit-retention-save"
                          >
                            {saving ? "Saving…" : "Save retention"}
                          </Button>
                          {fallbackAuditRetentionMsg && (
                            <span
                              className="text-[10px] text-amber-300"
                              data-testid="text-fallback-preset-audit-retention-msg"
                            >
                              {fallbackAuditRetentionMsg}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground/80 text-[10px]">
                          Controls rotation of{" "}
                          <span className="font-mono">
                            broadcast-fallback-default-preset.jsonl
                          </span>
                          : the active file is archived once it exceeds the size
                          above, and old archives are pruned so at most this
                          many are kept.
                        </div>
                      </div>
                    );
                  })()}
                {/* T323 — On-disk audit-log stats so admins can confirm
                    retention is keeping the fallback-preset audit footprint
                    in check without SSHing into the box. */}
                {fallbackPresetAuditFirstPage?.stats &&
                  (() => {
                    const s = fallbackPresetAuditFirstPage.stats!;
                    const fmt = (b: number) => {
                      if (!Number.isFinite(b) || b <= 0) return "0 B";
                      if (b < 1024) return `${b} B`;
                      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KiB`;
                      return `${(b / 1024 / 1024).toFixed(2)} MiB`;
                    };
                    const pct =
                      s.activeExists && s.maxBytes > 0
                        ? Math.min(
                            100,
                            Math.round((s.activeBytes / s.maxBytes) * 100),
                          )
                        : null;
                    // T337 — Newest-first archive rotation history. Cap the
                    // visible list at 5 so the panel stays compact even when
                    // an admin has bumped max archives well above the
                    // default; the full count is still in "Archives kept".
                    const archives = s.archives ?? [];
                    const visibleArchives = archives.slice(0, 5);
                    const lastRotatedIso = s.lastRotatedAt ?? null;
                    const lastRotatedLabel = lastRotatedIso
                      ? (() => {
                          const d = new Date(lastRotatedIso);
                          return Number.isFinite(d.getTime())
                            ? d.toLocaleString()
                            : lastRotatedIso;
                        })()
                      : null;
                    const forceRotating =
                      forceRotateFallbackAuditMut.isPending;
                    // T351 — Track which archive (if any) is mid-delete so
                    // we can disable that specific row's button and show a
                    // "Deleting…" label without freezing the whole list.
                    const deletingArchive =
                      deleteFallbackAuditArchiveMut.isPending
                        ? (deleteFallbackAuditArchiveMut.variables as
                            | string
                            | undefined) ?? null
                        : null;
                    return (
                      <div className="space-y-1.5">
                        <div
                          className="grid grid-cols-3 gap-2 rounded border border-border/60 bg-background/60 px-2 py-1.5 text-[10px]"
                          data-testid="fallback-preset-audit-stats"
                        >
                          <div>
                            <div className="uppercase tracking-wider text-muted-foreground text-[9px]">
                              Active file
                            </div>
                            <div
                              className="text-foreground/90 mt-0.5"
                              data-testid="text-fallback-preset-audit-active-size"
                            >
                              {s.activeExists
                                ? `${fmt(s.activeBytes)} / ${fmt(s.maxBytes)} max`
                                : "Empty (no changes recorded)"}
                            </div>
                            {pct !== null && (
                              <div className="text-muted-foreground mt-0.5">
                                {pct}% of rotation threshold
                              </div>
                            )}
                            {/* T365 — "N set · N clear" breakdown for the
                                active (un-rotated) file, mirroring what
                                each rotated archive row already shows so
                                admins don't have to open the live log to
                                find out what's happened since the last
                                rotation. Optional chaining keeps the line
                                hidden when paired with an older server. */}
                            {s.activeExists &&
                              (typeof s.activeSetCount === "number" ||
                                typeof s.activeClearCount === "number") && (
                                <div
                                  className="text-muted-foreground mt-0.5 tabular-nums"
                                  title={`${s.activeSetCount ?? 0} update${
                                    (s.activeSetCount ?? 0) === 1 ? "" : "s"
                                  } · ${s.activeClearCount ?? 0} clear${
                                    (s.activeClearCount ?? 0) === 1 ? "" : "s"
                                  } since last rotation`}
                                  data-testid="text-fallback-preset-audit-active-counts"
                                >
                                  {(s.activeSetCount ?? 0)} set ·{" "}
                                  {(s.activeClearCount ?? 0)} clear
                                </div>
                              )}
                          </div>
                          <div>
                            <div className="uppercase tracking-wider text-muted-foreground text-[9px]">
                              Archives kept
                            </div>
                            <div
                              className="text-foreground/90 mt-0.5"
                              data-testid="text-fallback-preset-audit-archive-count"
                            >
                              {s.archiveCount} / {s.maxArchives} max
                            </div>
                            <div className="text-muted-foreground mt-0.5">
                              {fmt(s.archiveBytes)} in archives
                            </div>
                            <div
                              className="text-muted-foreground mt-0.5"
                              data-testid="text-fallback-preset-audit-last-rotated"
                            >
                              {lastRotatedLabel
                                ? `Last rotated ${lastRotatedLabel}`
                                : "Never rotated"}
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-wider text-muted-foreground text-[9px]">
                              Total disk used
                            </div>
                            <div
                              className="text-foreground/90 mt-0.5"
                              data-testid="text-fallback-preset-audit-total-bytes"
                            >
                              {fmt(s.totalBytes)}
                            </div>
                            <div className="text-muted-foreground mt-0.5">
                              Active + all archives
                            </div>
                          </div>
                        </div>
                        {/* T337 — Recent rotation history mini-list. Lets
                            admins eyeball that a recent retention tweak
                            actually produced (or pruned) the expected
                            archive file without opening a shell. */}
                        <div
                          className="rounded border border-border/60 bg-background/60 px-2 py-1.5 text-[10px] space-y-1"
                          data-testid="fallback-preset-audit-archives"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="uppercase tracking-wider text-muted-foreground text-[9px]">
                              Archives (newest first)
                            </div>
                            <div className="flex items-center gap-1">
                            {/* T355 — One-click bundle of every rotated
                                archive plus the active file as a single
                                timestamped ZIP, so quarterly evidence
                                snapshots don't require clicking through
                                each archive individually. Founder-gated
                                to match the sibling per-archive download
                                / delete / force-rotate controls. */}
                            {viewerIsFounder && (() => {
                              // T356 — Surface the uncompressed bundle size
                              // (sum of archives + active file) so founders
                              // aren't downloading blind on slow links, and
                              // confirm before kicking off unusually large
                              // (>50 MB) downloads.
                              const bundleEmpty =
                                s.archiveCount === 0 && !s.activeExists;
                              const sizeLabel = bundleEmpty
                                ? null
                                : fmt(s.totalBytes);
                              const LARGE_BUNDLE_BYTES = 50 * 1024 * 1024;
                              const isLarge =
                                !bundleEmpty &&
                                s.totalBytes > LARGE_BUNDLE_BYTES;
                              return (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  asChild
                                  disabled={bundleEmpty}
                                  title={
                                    bundleEmpty
                                      ? "No archives or active file to bundle yet"
                                      : `Download every archive (and the active file) as one ZIP — about ${sizeLabel} uncompressed`
                                  }
                                  className="h-5 px-2 text-[10px]"
                                >
                                  <a
                                    href="/api/admin/broadcasts/fallback-default-preset-audit/archives-bundle"
                                    data-testid="button-fallback-preset-audit-archives-bundle"
                                    onClick={(e) => {
                                      if (bundleEmpty) {
                                        e.preventDefault();
                                        return;
                                      }
                                      if (
                                        isLarge &&
                                        !window.confirm(
                                          `This bundle is about ${sizeLabel} uncompressed, which is unusually large and may take a while on slow connections.\n\nDownload anyway?`,
                                        )
                                      ) {
                                        e.preventDefault();
                                      }
                                    }}
                                  >
                                    {bundleEmpty
                                      ? "Download all (.zip)"
                                      : `Download all (~${sizeLabel})`}
                                  </a>
                                </Button>
                              );
                            })()}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                // T348 — Warn before force-rotating when it
                                // could create a near-empty archive or push
                                // an existing archive past the retention
                                // limit. Skip the prompt when rotation is
                                // clearly safe (active ≥ 50% of max and
                                // archive count < max).
                                const activePctOfMax =
                                  s.maxBytes > 0
                                    ? s.activeBytes / s.maxBytes
                                    : 0;
                                const willPruneExisting =
                                  s.maxArchives > 0 &&
                                  s.archiveCount >= s.maxArchives &&
                                  s.archiveCount > 0;
                                const zeroRetention = s.maxArchives === 0;
                                const isSmall = activePctOfMax < 0.5;
                                if (
                                  isSmall ||
                                  willPruneExisting ||
                                  zeroRetention
                                ) {
                                  const pctLabel =
                                    s.maxBytes > 0
                                      ? `${Math.round(activePctOfMax * 100)}% of the ${fmt(s.maxBytes)} rotation threshold`
                                      : `${fmt(s.activeBytes)}`;
                                  const parts: string[] = [
                                    `The active audit file is only ${fmt(s.activeBytes)} (${pctLabel}).`,
                                  ];
                                  if (zeroRetention) {
                                    parts.push(
                                      `"Max archives kept" is 0, so the rotated file will be discarded immediately and no archive will be retained. This audit history cannot be recovered.`,
                                    );
                                  } else if (willPruneExisting) {
                                    parts.push(
                                      `You already have ${s.archiveCount}/${s.maxArchives} archives, so rotating now will permanently delete the oldest archive to make room. That history cannot be recovered.`,
                                    );
                                  } else {
                                    parts.push(
                                      `Rotating now will create a tiny archive and may push an older, more useful archive past the ${s.maxArchives}-archive retention limit on the next rotation.`,
                                    );
                                  }
                                  parts.push("Force rotate anyway?");
                                  if (!window.confirm(parts.join("\n\n"))) {
                                    return;
                                  }
                                }
                                forceRotateFallbackAuditMut.mutate();
                              }}
                              disabled={forceRotating || !s.activeExists}
                              title={
                                s.activeExists
                                  ? "Rotate the active file into a new archive now"
                                  : "No active audit file yet — make a preset change first"
                              }
                              className="h-5 px-2 text-[10px]"
                              data-testid="button-fallback-preset-audit-force-rotate"
                            >
                              {forceRotating ? "Rotating…" : "Force rotate now"}
                            </Button>
                            </div>
                          </div>
                          {archives.length === 0 ? (
                            <div
                              className="text-muted-foreground"
                              data-testid="text-fallback-preset-audit-archives-empty"
                            >
                              No rotations yet — the active file hasn't
                              filled up since this audit log was created.
                            </div>
                          ) : (
                            <ul className="space-y-0.5">
                              {visibleArchives.map((a) => {
                                const when = a.rotatedAt
                                  ? (() => {
                                      const d = new Date(a.rotatedAt);
                                      return Number.isFinite(d.getTime())
                                        ? d.toLocaleString()
                                        : a.rotatedAt;
                                    })()
                                  : "unknown time";
                                const isDeletingThis =
                                  deletingArchive === a.name;
                                return (
                                  <li
                                    key={a.name}
                                    className="flex items-center justify-between gap-2"
                                    data-testid={`row-fallback-preset-audit-archive-${a.name}`}
                                  >
                                    <span className="min-w-0 flex-1 truncate">
                                      <span className="text-foreground/90">
                                        {when}
                                      </span>
                                      <span
                                        className="ml-1 font-mono text-muted-foreground/80"
                                        title={a.name}
                                      >
                                        · {a.name}
                                      </span>
                                    </span>
                                    <span className="text-muted-foreground shrink-0">
                                      {fmt(a.bytes)}
                                    </span>
                                    {/* T363 — At-a-glance set/clear
                                        breakdown so admins can see which
                                        archives actually contain clears
                                        without opening Inspect. Counts
                                        come from a server-side cache keyed
                                        by name+mtime+size. */}
                                    {(typeof a.setCount === "number" ||
                                      typeof a.clearCount === "number") && (
                                      <span
                                        className="text-muted-foreground/80 shrink-0 tabular-nums"
                                        title={`${a.setCount ?? 0} update${
                                          (a.setCount ?? 0) === 1 ? "" : "s"
                                        } · ${a.clearCount ?? 0} clear${
                                          (a.clearCount ?? 0) === 1 ? "" : "s"
                                        }`}
                                        data-testid={`text-fallback-preset-audit-archive-counts-${a.name}`}
                                      >
                                        {(a.setCount ?? 0)} set ·{" "}
                                        {(a.clearCount ?? 0)} clear
                                      </span>
                                    )}
                                    {/* T354 — Per-archive inspect so admins
                                        can preview the parsed entries (last
                                        ~50) in a dialog before downloading,
                                        or skip the download for casual
                                        investigations. Founder-gated to
                                        match the sibling controls. */}
                                    {viewerIsFounder && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 px-1.5 text-[10px] shrink-0"
                                        onClick={() =>
                                          openInspectArchive(a.name)
                                        }
                                        title="Preview the last ~50 entries from this archive"
                                        data-testid={`button-fallback-preset-audit-archive-inspect-${a.name}`}
                                      >
                                        Inspect
                                      </Button>
                                    )}
                                    {/* T360 — Quick-filter chips that open
                                        the inspect dialog with the action
                                        filter already applied, saving admins
                                        a click when they're chasing a
                                        specific event class (e.g. unexpected
                                        clears from yesterday). Founder-gated
                                        to match the sibling Inspect control. */}
                                    {/* T363 — If the server reported zero
                                        entries of a class, disable the chip
                                        so admins don't waste a round-trip
                                        opening an empty view. Older servers
                                        that don't send counts leave the
                                        chip enabled (typeof check below). */}
                                    {viewerIsFounder && (() => {
                                      const knownEmpty =
                                        typeof a.setCount === "number" &&
                                        a.setCount === 0;
                                      return (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 px-1.5 text-[10px] shrink-0"
                                          disabled={knownEmpty}
                                          onClick={() =>
                                            openInspectArchive(a.name, "set")
                                          }
                                          title={
                                            knownEmpty
                                              ? "This archive has no update (set) entries"
                                              : "Inspect this archive, pre-filtered to update (set) entries"
                                          }
                                          data-testid={`button-fallback-preset-audit-archive-inspect-set-${a.name}`}
                                        >
                                          Updates only
                                        </Button>
                                      );
                                    })()}
                                    {viewerIsFounder && (() => {
                                      const knownEmpty =
                                        typeof a.clearCount === "number" &&
                                        a.clearCount === 0;
                                      return (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 px-1.5 text-[10px] shrink-0"
                                          disabled={knownEmpty}
                                          onClick={() =>
                                            openInspectArchive(a.name, "clear")
                                          }
                                          title={
                                            knownEmpty
                                              ? "This archive has no clear entries"
                                              : "Inspect this archive, pre-filtered to clear entries"
                                          }
                                          data-testid={`button-fallback-preset-audit-archive-inspect-clear-${a.name}`}
                                        >
                                          Clears only
                                        </Button>
                                      );
                                    })()}
                                    {/* T352 — Per-archive download so founders
                                        can keep a local copy of an archive
                                        before pruning it. Uses a plain
                                        anchor with `download` so the file
                                        streams over the existing cookie
                                        session without needing a blob in
                                        memory. Gated to founders to match
                                        the sibling delete control. */}
                                    {viewerIsFounder && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 px-1.5 text-[10px] shrink-0"
                                        asChild
                                        title="Download this archive as JSONL"
                                      >
                                        <a
                                          href={`/api/admin/broadcasts/fallback-default-preset-audit/archives/${encodeURIComponent(a.name)}`}
                                          download={a.name}
                                          data-testid={`button-fallback-preset-audit-archive-download-${a.name}`}
                                        >
                                          Download
                                        </a>
                                      </Button>
                                    )}
                                    {/* T351 — Per-archive delete so founders
                                        can prune a single noisy/test archive
                                        without waiting for retention to age
                                        it out or force-rotating until it
                                        falls off. Gated to founders to
                                        match the rest of the rotate/
                                        retention controls. */}
                                    {viewerIsFounder && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 px-1.5 text-[10px] text-destructive hover:text-destructive shrink-0"
                                        disabled={
                                          isDeletingThis ||
                                          deleteFallbackAuditArchiveMut.isPending
                                        }
                                        onClick={() => {
                                          const parts = [
                                            `Delete this rotated audit archive?`,
                                            `Name: ${a.name}`,
                                            `Size: ${fmt(a.bytes)}`,
                                            `Rotated: ${when}`,
                                            `This file will be permanently removed and its history cannot be recovered.`,
                                          ];
                                          if (
                                            !window.confirm(parts.join("\n\n"))
                                          ) {
                                            return;
                                          }
                                          deleteFallbackAuditArchiveMut.mutate(
                                            a.name,
                                          );
                                        }}
                                        title="Permanently delete this archive"
                                        data-testid={`button-fallback-preset-audit-archive-delete-${a.name}`}
                                      >
                                        {isDeletingThis ? "Deleting…" : "Delete"}
                                      </Button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {archives.length > visibleArchives.length && (
                            <div className="text-muted-foreground/80">
                              +{archives.length - visibleArchives.length}{" "}
                              older archive
                              {archives.length - visibleArchives.length === 1
                                ? ""
                                : "s"}{" "}
                              not shown
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                {fallbackPresetAuditQ.isLoading ? (
                  <p
                    className="text-[10px] text-muted-foreground"
                    data-testid="text-fallback-default-preset-history-loading"
                  >
                    Loading history…
                  </p>
                ) : fallbackPresetAuditQ.isError ? (
                  <p
                    className="text-[10px] text-destructive"
                    data-testid="text-fallback-default-preset-history-error"
                  >
                    Couldn't load history.
                  </p>
                ) : fallbackPresetAuditEntries.length === 0 ? (
                  <p
                    className="text-[10px] text-muted-foreground"
                    data-testid="text-fallback-default-preset-history-empty"
                  >
                    No changes recorded yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {fallbackPresetAuditEntries.map((e, idx) => {
                      const fmt = (
                        s: { dryRun: string; status: string; packageId: string } | null,
                      ) =>
                        s
                          ? `dryRun=${s.dryRun}, status=${s.status}${s.packageId ? `, pkg="${s.packageId}"` : ", no pkg"}`
                          : "(not pinned)";
                      const when = e.ts ? new Date(e.ts).toLocaleString() : "unknown time";
                      const key = e.id ?? `${e.ts ?? ""}-${idx}`;
                      return (
                        <li
                          key={key}
                          className="text-[10px] text-muted-foreground rounded border border-border/60 px-1.5 py-1 bg-background/60"
                          data-testid={`row-fallback-default-preset-history-${idx}`}
                        >
                          <div className="font-medium text-foreground/90">
                            {e.action === "clear" ? "Cleared" : "Updated"} by{" "}
                            <span data-testid={`text-fallback-default-preset-history-actor-${idx}`}>
                              {e.actor.displayName}
                            </span>{" "}
                            · <span data-testid={`text-fallback-default-preset-history-ts-${idx}`}>{when}</span>
                          </div>
                          <div data-testid={`text-fallback-default-preset-history-before-${idx}`}>
                            Before: {fmt(e.before)}
                          </div>
                          <div data-testid={`text-fallback-default-preset-history-after-${idx}`}>
                            After: {fmt(e.after)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {fallbackPresetAuditEntries.length > 0 && (
                  <div
                    className="pt-1 flex items-center gap-2 flex-wrap"
                    data-testid="fallback-default-preset-history-pager"
                  >
                    <span
                      className="text-[10px] text-muted-foreground"
                      data-testid="text-fallback-default-preset-history-range"
                    >
                      Showing {fallbackPresetAuditRangeStart}–
                      {fallbackPresetAuditRangeEnd} of{" "}
                      {fallbackPresetAuditTotal}
                    </span>
                    {fallbackPresetAuditHasMore && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => fallbackPresetAuditQ.fetchNextPage()}
                        disabled={fallbackPresetAuditQ.isFetchingNextPage}
                        data-testid="button-load-more-fallback-default-preset-history"
                      >
                        {fallbackPresetAuditQ.isFetchingNextPage
                          ? "Loading…"
                          : "Load more"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {/* T324 — Admin-tunable retention for the fallback-preset
                  audit log. Mirrors the cover/media sweep controls. */}
              <div
                className="border-t border-border pt-2 mt-1 space-y-2"
                data-testid="section-fallback-default-preset-audit-retention"
              >
                <div className="text-[11px] font-medium flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Audit log retention
                </div>
                {!viewerIsFounder ? (
                  <p
                    className="text-[10px] text-muted-foreground italic"
                    data-testid="text-fallback-default-preset-retention-founder-only"
                  >
                    Only a founder can change audit retention.
                  </p>
                ) : fallbackPresetRetentionQ.isLoading ? (
                  <p
                    className="text-[10px] text-muted-foreground"
                    data-testid="text-fallback-default-preset-retention-loading"
                  >
                    Loading retention settings…
                  </p>
                ) : !fallbackPresetRetention ? (
                  <p
                    className="text-[10px] text-destructive"
                    data-testid="text-fallback-default-preset-retention-error"
                  >
                    Couldn't load retention settings.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
                      <div>
                        <label
                          className="text-muted-foreground text-[10px]"
                          htmlFor="fp-retention-bytes"
                        >
                          Max audit file size (KiB)
                        </label>
                        <Input
                          id="fp-retention-bytes"
                          type="number"
                          min={Math.ceil(
                            fallbackPresetRetention.auditLimits.bytesMin / 1024,
                          )}
                          max={Math.floor(
                            fallbackPresetRetention.auditLimits.bytesMax / 1024,
                          )}
                          value={fpRetentionBytesKibDraft}
                          onChange={(e) =>
                            setFpRetentionBytesKibDraft(e.target.value)
                          }
                          className="h-7 text-xs w-32 mt-1"
                          data-testid="input-fallback-default-preset-retention-bytes"
                        />
                        <div className="text-muted-foreground text-[10px] mt-1">
                          Current: {fmtKiB(fallbackPresetRetention.auditMaxBytes)}
                          <span className="ml-1 opacity-70">
                            (source: {fallbackPresetRetention.auditMaxBytesSource})
                          </span>
                          <span
                            className="block"
                            data-testid="text-fallback-default-preset-active-audit-bytes"
                          >
                            Active file:{" "}
                            {typeof fallbackPresetRetention.activeAuditBytes ===
                            "number"
                              ? fmtKiB(fallbackPresetRetention.activeAuditBytes)
                              : "—"}
                          </span>
                          <span className="block opacity-70">
                            Allowed: {fmtKiB(fallbackPresetRetention.auditLimits.bytesMin)}–{fmtKiB(fallbackPresetRetention.auditLimits.bytesMax)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label
                          className="text-muted-foreground text-[10px]"
                          htmlFor="fp-retention-archives"
                        >
                          Max archives kept
                        </label>
                        <Input
                          id="fp-retention-archives"
                          type="number"
                          min={fallbackPresetRetention.auditLimits.archivesMin}
                          max={fallbackPresetRetention.auditLimits.archivesMax}
                          step={1}
                          value={fpRetentionArchivesDraft}
                          onChange={(e) =>
                            setFpRetentionArchivesDraft(e.target.value)
                          }
                          className="h-7 text-xs w-24 mt-1"
                          data-testid="input-fallback-default-preset-retention-archives"
                        />
                        <div className="text-muted-foreground text-[10px] mt-1">
                          Current: {fallbackPresetRetention.auditMaxArchives}
                          <span className="ml-1 opacity-70">
                            (source: {fallbackPresetRetention.auditMaxArchivesSource})
                          </span>
                          <span
                            className="block"
                            data-testid="text-fallback-default-preset-current-archive-count"
                          >
                            Archives kept:{" "}
                            {typeof fallbackPresetRetention.currentArchiveCount ===
                            "number"
                              ? fallbackPresetRetention.currentArchiveCount
                              : "—"}
                          </span>
                          <span className="block opacity-70">
                            Allowed: {fallbackPresetRetention.auditLimits.archivesMin}–{fallbackPresetRetention.auditLimits.archivesMax}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={saveFallbackPresetRetention}
                        disabled={saveFallbackPresetRetentionMut.isPending}
                        data-testid="button-fallback-default-preset-retention-save"
                      >
                        {saveFallbackPresetRetentionMut.isPending ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : null}
                        Save retention
                      </Button>
                      {fpRetentionMsg && (
                        <span
                          className="text-[10px] text-amber-600 dark:text-amber-300"
                          data-testid="text-fallback-default-preset-retention-msg"
                        >
                          {fpRetentionMsg}
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-[10px]">
                      Controls rotation of{" "}
                      <span className="font-mono">
                        broadcast-fallback-default-preset.jsonl
                      </span>
                      : the active file is archived once it exceeds the size
                      above, and old archives are pruned so at most this many
                      are kept.
                    </div>
                  </>
                )}
              </div>
            </div>
            {savedViews.length === 0 && (
              <div
                className="text-xs text-muted-foreground"
                data-testid="text-manage-saved-views-empty"
              >
                No saved views.
              </div>
            )}
            {savedViews.map((v) => {
              const draft = renameDraft[v.id];
              const isRenaming = draft !== undefined;
              const isShared = v.scope === "shared";
              return (
                <div
                  key={v.id}
                  className="rounded border border-border p-2 space-y-1.5"
                  data-testid={`row-saved-view-${v.id}`}
                >
                  <div className="flex items-center gap-2">
                    {isRenaming ? (
                      <Input
                        value={draft}
                        onChange={(e) =>
                          setRenameDraft((prev) => ({
                            ...prev,
                            [v.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (draft ?? "").trim()) {
                            e.preventDefault();
                            renameSavedView(v.id);
                          } else if (e.key === "Escape") {
                            setRenameDraft((prev) => {
                              const next = { ...prev };
                              delete next[v.id];
                              return next;
                            });
                          }
                        }}
                        className="h-8 text-xs flex-1"
                        autoFocus
                        data-testid={`input-rename-view-${v.id}`}
                      />
                    ) : (
                      <div
                        className="flex-1 text-xs font-medium flex items-center gap-1.5"
                        data-testid={`text-view-name-${v.id}`}
                      >
                        {isShared ? (
                          <Users2 className="w-3 h-3" />
                        ) : (
                          <Lock className="w-3 h-3" />
                        )}
                        {v.name}
                        <Badge
                          variant={isShared ? "default" : "secondary"}
                          className="ml-1 text-[10px] py-0 px-1.5"
                          data-testid={`badge-view-scope-${v.id}`}
                        >
                          {isShared ? "Shared" : "Private"}
                        </Badge>
                        {v.isTeamDefault && (
                          <Badge
                            variant="default"
                            className="text-[10px] py-0 px-1.5 flex items-center gap-1"
                            data-testid={`badge-team-default-${v.id}`}
                            title={teamDefaultPinTooltip(v) ?? undefined}
                          >
                            <Pin className="w-2.5 h-2.5" /> Team default
                          </Badge>
                        )}
                        {v.schedule && v.schedule.windows.length > 0 && (
                          <Badge
                            variant={v.schedule.enabled ? "default" : "secondary"}
                            className="text-[10px] py-0 px-1.5 flex items-center gap-1"
                            title={summarizeSchedule(v.schedule)}
                            data-testid={`badge-view-scheduled-${v.id}`}
                          >
                            <Clock className="w-2.5 h-2.5" />
                            {v.schedule.enabled ? "Scheduled" : "Sched (off)"}
                          </Badge>
                        )}
                        {!v.isOwn && (
                          <span
                            className="text-[10px] font-normal text-muted-foreground"
                            title={creatorTooltip(v)}
                            data-testid={`text-view-owner-${v.id}`}
                          >
                            · by {v.creator.displayName}
                          </span>
                        )}
                        {creatorStatusBadge(v, "manage")}
                      </div>
                    )}
                    {isRenaming ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => renameSavedView(v.id)}
                          disabled={
                            !(draft ?? "").trim() || updateViewMut.isPending
                          }
                          data-testid={`button-confirm-rename-view-${v.id}`}
                          title="Save name"
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setRenameDraft((prev) => {
                              const next = { ...prev };
                              delete next[v.id];
                              return next;
                            })
                          }
                          data-testid={`button-cancel-rename-view-${v.id}`}
                          title="Cancel rename"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleViewScope(v)}
                          disabled={!v.canModify || updateViewMut.isPending}
                          data-testid={`button-toggle-scope-view-${v.id}`}
                          title={
                            !v.canModify
                              ? "Only the creator or a founder can change sharing"
                              : isShared
                                ? "Make private"
                                : "Share with team"
                          }
                        >
                          {isShared ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            <Users2 className="w-3 h-3" />
                          )}
                        </Button>
                        {viewerIsFounder && isShared && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleTeamDefault(v)}
                            disabled={setTeamDefaultMut.isPending}
                            data-testid={`button-toggle-team-default-${v.id}`}
                            title={
                              v.isTeamDefault
                                ? "Remove as team default"
                                : "Set as team default"
                            }
                          >
                            {v.isTeamDefault ? (
                              <PinOff className="w-3 h-3" />
                            ) : (
                              <Pin className="w-3 h-3" />
                            )}
                          </Button>
                        )}
                        {viewerIsFounder && isShared && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              scheduleDraft[v.id]
                                ? closeScheduleEditor(v.id)
                                : openScheduleEditor(v)
                            }
                            data-testid={`button-edit-schedule-${v.id}`}
                            title={
                              v.schedule && v.schedule.windows.length > 0
                                ? `Edit schedule (${summarizeSchedule(v.schedule)})`
                                : "Schedule when this view auto-applies"
                            }
                          >
                            <Clock className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setRenameDraft((prev) => ({
                              ...prev,
                              [v.id]: v.name,
                            }))
                          }
                          disabled={!v.canModify}
                          data-testid={`button-rename-view-${v.id}`}
                          title={
                            v.canModify
                              ? "Rename view"
                              : "Only the creator or a founder can rename this view"
                          }
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteSavedView(v)}
                          disabled={!v.canModify || deleteViewMut.isPending}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-view-${v.id}`}
                          title={
                            v.canModify
                              ? "Delete view"
                              : "Only the creator or a founder can delete this view"
                          }
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {describeView(v)}
                  </div>
                  {v.isTeamDefault && (
                    <div
                      className="text-[10px] text-muted-foreground italic"
                      title={teamDefaultPinTooltip(v) ?? undefined}
                      data-testid={`text-team-default-pin-${v.id}`}
                    >
                      {teamDefaultPinLabel(v)}
                    </div>
                  )}
                  {v.schedule && v.schedule.windows.length > 0 && !scheduleDraft[v.id] && (
                    <div
                      className="text-[10px] text-muted-foreground flex items-center gap-1"
                      data-testid={`text-view-schedule-${v.id}`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {summarizeSchedule(v.schedule)}
                    </div>
                  )}
                  {/* T271 — Row footer warning: surface overlap/gap issues
                      involving THIS saved view so founders notice the
                      misconfiguration after saving. Conflicts shown here are
                      filtered to ones that include this view; gaps are a
                      week-wide property so we show them on each scheduled
                      row. */}
                  {!scheduleDraft[v.id] &&
                    v.schedule &&
                    v.schedule.enabled &&
                    v.schedule.windows.length > 0 &&
                    (() => {
                      const myConflicts = savedScheduleDiagnostics.conflicts.filter(
                        (c) => c.viewIds.includes(v.id),
                      );
                      const gaps = savedScheduleDiagnostics.gaps;
                      if (!myConflicts.length && !gaps.length) return null;
                      const conflictLines = myConflicts.slice(0, 3).map((c) => {
                        const others = c.viewNames.filter((n) => n !== v.name);
                        return `${formatScheduleRange(c.day, c.start, c.end)} conflicts with ${others.join(", ") || c.viewNames.join(", ")}`;
                      });
                      const gapLines = gaps
                        .slice(0, 3)
                        .map((g) => `${formatScheduleRange(g.day, g.start, g.end)} uncovered`);
                      const extraConflicts = myConflicts.length - conflictLines.length;
                      const extraGaps = gaps.length - gapLines.length;
                      return (
                        <div
                          className="text-[10px] text-amber-600 dark:text-amber-400 flex items-start gap-1"
                          data-testid={`warn-view-schedule-${v.id}`}
                        >
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <div className="space-y-0.5">
                            {conflictLines.map((line, i) => (
                              <div key={`c-${i}`}>{line}</div>
                            ))}
                            {extraConflicts > 0 && (
                              <div>+{extraConflicts} more conflict window(s)</div>
                            )}
                            {gapLines.map((line, i) => (
                              <div key={`g-${i}`}>Coverage: {line}</div>
                            ))}
                            {extraGaps > 0 && (
                              <div>+{extraGaps} more uncovered window(s)</div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  {scheduleDraft[v.id] && (
                    <div
                      className="rounded border border-border bg-muted/30 p-2 space-y-2"
                      data-testid={`editor-schedule-${v.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-medium flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          Auto-apply schedule
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px]">
                          <Switch
                            checked={scheduleDraft[v.id].enabled}
                            onCheckedChange={(checked) =>
                              updateScheduleDraft(v.id, (d) => ({ ...d, enabled: !!checked }))
                            }
                            data-testid={`switch-schedule-enabled-${v.id}`}
                          />
                          <span>{scheduleDraft[v.id].enabled ? "On" : "Off"}</span>
                        </label>
                      </div>
                      <div className="space-y-2">
                        {scheduleDraft[v.id].windows.map((w, wi) => (
                          <div
                            key={wi}
                            className="rounded border border-border/60 p-2 space-y-1.5"
                            data-testid={`row-schedule-window-${v.id}-${wi}`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {SCHEDULE_DAY_LABELS.map((label, di) => {
                                const checked = w.days.includes(di);
                                return (
                                  <label
                                    key={di}
                                    className="flex items-center gap-1 text-[10px]"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(c) => {
                                        updateScheduleDraft(v.id, (d) => {
                                          const next = d.windows.slice();
                                          const cur = next[wi];
                                          const days = c
                                            ? Array.from(new Set([...cur.days, di]))
                                            : cur.days.filter((x) => x !== di);
                                          next[wi] = { ...cur, days };
                                          return { ...d, windows: next };
                                        });
                                      }}
                                      data-testid={`checkbox-schedule-day-${v.id}-${wi}-${di}`}
                                    />
                                    {label}
                                  </label>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <label className="text-[10px] flex items-center gap-1">
                                Start
                                <Input
                                  type="time"
                                  value={minutesToHHMM(w.startMinute)}
                                  onChange={(e) => {
                                    const mins = hhmmToMinutes(e.target.value);
                                    if (mins === null) return;
                                    updateScheduleDraft(v.id, (d) => {
                                      const next = d.windows.slice();
                                      next[wi] = { ...next[wi], startMinute: mins };
                                      return { ...d, windows: next };
                                    });
                                  }}
                                  className="h-7 text-xs w-[100px]"
                                  data-testid={`input-schedule-start-${v.id}-${wi}`}
                                />
                              </label>
                              <label className="text-[10px] flex items-center gap-1">
                                End
                                <Input
                                  type="time"
                                  value={minutesToHHMM(w.endMinute)}
                                  onChange={(e) => {
                                    const mins = hhmmToMinutes(e.target.value);
                                    if (mins === null) return;
                                    updateScheduleDraft(v.id, (d) => {
                                      const next = d.windows.slice();
                                      next[wi] = { ...next[wi], endMinute: mins };
                                      return { ...d, windows: next };
                                    });
                                  }}
                                  className="h-7 text-xs w-[100px]"
                                  data-testid={`input-schedule-end-${v.id}-${wi}`}
                                />
                              </label>
                              {w.endMinute <= w.startMinute && (
                                <span className="text-[10px] text-muted-foreground">
                                  wraps past midnight
                                </span>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[10px] text-destructive hover:text-destructive"
                                onClick={() =>
                                  updateScheduleDraft(v.id, (d) => ({
                                    ...d,
                                    windows: d.windows.filter((_, x) => x !== wi),
                                  }))
                                }
                                data-testid={`button-remove-schedule-window-${v.id}-${wi}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px]"
                          onClick={() =>
                            updateScheduleDraft(v.id, (d) => ({
                              ...d,
                              windows: [
                                ...d.windows,
                                { days: [0, 6], startMinute: 0, endMinute: 9 * 60 },
                              ],
                            }))
                          }
                          disabled={scheduleDraft[v.id].windows.length >= 20}
                          data-testid={`button-add-schedule-window-${v.id}`}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Add window
                        </Button>
                      </div>
                      {/* T271 — Pre-save warning summary: shows what coverage
                          will look like across all enabled scheduled shared
                          views once this draft is saved. */}
                      {(() => {
                        const preview = draftScheduleDiagnostics(
                          v.id,
                          scheduleDraft[v.id],
                        );
                        if (!preview.conflicts.length && !preview.gaps.length) {
                          if (!preview.hasAnyEnabled) return null;
                          return (
                            <div
                              className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                              data-testid={`preview-schedule-ok-${v.id}`}
                            >
                              <Check className="w-3 h-3" />
                              No overlaps or gaps after saving.
                            </div>
                          );
                        }
                        const conflictLines = preview.conflicts
                          .slice(0, 4)
                          .map(
                            (c) =>
                              `${formatScheduleRange(c.day, c.start, c.end)} conflicts: ${c.viewNames.join(", ")}`,
                          );
                        const gapLines = preview.gaps
                          .slice(0, 4)
                          .map((g) => `${formatScheduleRange(g.day, g.start, g.end)} uncovered`);
                        const extraConflicts =
                          preview.conflicts.length - conflictLines.length;
                        const extraGaps = preview.gaps.length - gapLines.length;
                        return (
                          <div
                            className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-2 flex items-start gap-1.5"
                            data-testid={`preview-schedule-warnings-${v.id}`}
                          >
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <div className="space-y-0.5">
                              <div className="font-medium">
                                Coverage after saving:
                              </div>
                              {conflictLines.map((line, i) => (
                                <div key={`pc-${i}`}>{line}</div>
                              ))}
                              {extraConflicts > 0 && (
                                <div>+{extraConflicts} more conflict window(s)</div>
                              )}
                              {gapLines.map((line, i) => (
                                <div key={`pg-${i}`}>{line}</div>
                              ))}
                              {extraGaps > 0 && (
                                <div>+{extraGaps} more uncovered window(s)</div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] text-destructive hover:text-destructive"
                          onClick={() => clearSchedule(v)}
                          disabled={setScheduleMut.isPending || !v.schedule}
                          data-testid={`button-clear-schedule-${v.id}`}
                        >
                          Clear schedule
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px]"
                          onClick={() => closeScheduleEditor(v.id)}
                          data-testid={`button-cancel-schedule-${v.id}`}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-[10px]"
                          onClick={() => saveScheduleDraft(v)}
                          disabled={setScheduleMut.isPending}
                          data-testid={`button-save-schedule-${v.id}`}
                        >
                          Save schedule
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* T270 — Schedule history (audit log reader). */}
          <div
            className="mt-4 border-t border-border pt-3 space-y-2"
            data-testid="section-schedule-history"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Schedule history</div>
                <div className="text-xs text-muted-foreground">
                  Recent changes to shared-view schedules
                  {scheduleAuditQ.data
                    ? ` (showing ${scheduleAuditQ.data.entries.length} of ${scheduleAuditQ.data.total})`
                    : ""}
                  .
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => scheduleAuditQ.refetch()}
                disabled={scheduleAuditQ.isFetching}
                data-testid="button-refresh-schedule-history"
              >
                {scheduleAuditQ.isFetching ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {scheduleAuditQ.isLoading && (
                <div
                  className="text-xs text-muted-foreground"
                  data-testid="text-schedule-history-loading"
                >
                  Loading audit log…
                </div>
              )}
              {scheduleAuditQ.isError && (
                <div
                  className="text-xs text-destructive"
                  data-testid="text-schedule-history-error"
                >
                  Could not load audit log.
                </div>
              )}
              {scheduleAuditQ.data &&
                scheduleAuditQ.data.entries.length === 0 && (
                  <div
                    className="text-xs text-muted-foreground"
                    data-testid="text-schedule-history-empty"
                  >
                    No schedule changes recorded yet.
                  </div>
                )}
              {scheduleAuditQ.data?.entries.map((e, idx) => {
                const when = e.ts
                  ? formatDistanceToNow(new Date(e.ts), { addSuffix: true })
                  : "unknown time";
                const rowKey = e.id ?? `${e.ts ?? "noTs"}-${idx}`;
                const beforeText = summarizeSchedule(e.before);
                const afterText = summarizeSchedule(e.after);
                return (
                  <div
                    key={rowKey}
                    className="rounded border border-border p-2 text-xs space-y-1"
                    data-testid={`row-schedule-audit-${rowKey}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-medium">
                        <span data-testid={`text-schedule-audit-view-${rowKey}`}>
                          {e.viewName ?? "(unknown view)"}
                        </span>
                        <span className="ml-2 text-muted-foreground font-normal">
                          by{" "}
                          <span
                            data-testid={`text-schedule-audit-actor-${rowKey}`}
                          >
                            {e.actor.displayName}
                          </span>
                        </span>
                      </div>
                      <div
                        className="text-muted-foreground"
                        title={e.ts ?? ""}
                        data-testid={`text-schedule-audit-when-${rowKey}`}
                      >
                        {when}
                      </div>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                      <div className="text-muted-foreground">Before:</div>
                      <div
                        className="font-mono text-[11px] break-words"
                        data-testid={`text-schedule-audit-before-${rowKey}`}
                      >
                        {beforeText}
                      </div>
                      <div className="text-muted-foreground">After:</div>
                      <div
                        className="font-mono text-[11px] break-words"
                        data-testid={`text-schedule-audit-after-${rowKey}`}
                      >
                        {afterText}
                      </div>
                    </div>
                  </div>
                );
              })}
              {scheduleAuditQ.data?.hasMore && (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setScheduleAuditLimit((n) => Math.min(200, n + 20))
                    }
                    data-testid="button-load-more-schedule-history"
                  >
                    Load more
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setManageViewsOpen(false)}
              data-testid="button-close-manage-saved-views"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CoverImageCropDialog
        file={cropFile}
        open={cropOpen}
        onOpenChange={(o) => {
          setCropOpen(o);
          if (!o) {
            setCropFile(null);
            if (coverFileRef.current) coverFileRef.current.value = "";
          }
        }}
        onCropped={(f) => uploadCoverMut.mutate(f)}
      />
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(o) => {
          if (!o && !deleteMut.isPending) setDeleteId(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-delete-broadcast">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this broadcast?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes broadcast <code>{deleteId}</code> from the database and also deletes its
              cover image, mp4 file, and manifest from private storage. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending} data-testid="button-cancel-delete-broadcast">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteId) deleteMut.mutate(deleteId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-broadcast"
            >
              {deleteMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete broadcast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={bulkConfirmOpen}
        onOpenChange={(o) => {
          if (!o && !bulkRunning) setBulkConfirmOpen(false);
        }}
      >
        <AlertDialogContent data-testid="dialog-bulk-delete-broadcasts">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} broadcast{selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the following broadcasts from the database and also deletes their
              cover images, mp4 files, and manifests from private storage. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div
            className="max-h-48 overflow-auto rounded border border-border bg-muted/30 p-2 text-xs font-mono space-y-0.5"
            data-testid="list-bulk-delete-ids"
          >
            {Array.from(selectedIds).map((id) => (
              <div key={id} data-testid={`text-bulk-delete-id-${id}`}>
                {id}
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={bulkRunning}
              data-testid="button-cancel-bulk-delete-broadcasts"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkRunning || selectedIds.size === 0}
              onClick={(e) => {
                e.preventDefault();
                void runBulkDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete-broadcasts"
            >
              {bulkRunning ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete {selectedIds.size} broadcast{selectedIds.size === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
