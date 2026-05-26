import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Link2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  COMMON_ADMIN_TIME_ZONES,
  isValidIanaTimeZone as sharedIsValidIanaTimeZone,
  resolveBrowserTimeZone as sharedResolveBrowserTimeZone,
  useAdminTimeZonePreference,
} from "@/lib/admin-timezone";

type Orphan = {
  id: string;
  name: string;
  storageKey: string;
  byteSize: number;
  sha256: string;
  archivedAt: string | null;
  status: string;
};

type ListResponse = {
  ok: boolean;
  items: Orphan[];
};

type ActionState = {
  id: string;
  action: "hard_delete" | "relink_object";
} | null;

type ActionResult = {
  id: string;
  ok: boolean;
  message: string;
} | null;

type BulkResult = {
  id: string;
  name: string;
  ok: boolean;
  message?: string;
  storageKeyUpdated?: boolean;
  oldStorageKey?: string;
  newStorageKey?: string;
};

const ORPHANS_URL = "/api/admin/production-assets/orphans/list";
const SWEEP_STATUS_URL = "/api/admin/production-assets/orphan-sweep/status";
const FLAP_CONFIG_HISTORY_URL =
  "/api/admin/production-assets/orphans/sweep/flapping-config/history";
// Task #839 — Task #825 durable audit trail (snapshot diffs).
const FLAP_CONFIG_HISTORY_AUDIT_URL =
  "/api/admin/production-assets/orphans/sweep/flapping/config-history";
// Task #845 — sweep-threshold change-history audit trail.
const SWEEP_THRESHOLD_HISTORY_URL =
  "/api/admin/production-assets/orphan-sweep/threshold/history";

type SweepThresholdHistoryEntry = {
  id: string;
  previousValue: string | null;
  newValue: string;
  actorUserId: string | null;
  changedAt: string;
};

type SweepThresholdHistoryResponse = {
  ok: boolean;
  items: SweepThresholdHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
};

// Task #849 — fixed page size + filter state mirrors the flapping-config
// history card. Founders can narrow by actor / date range and paginate.
const SWEEP_THRESHOLD_HISTORY_PAGE_SIZE = 10;

type SweepThresholdHistoryFilters = {
  from: string;
  to: string;
  actorUserId: string;
};

function buildSweepThresholdHistoryUrl(
  filters: SweepThresholdHistoryFilters,
  page: number,
  timeZone: string,
): string {
  const params = new URLSearchParams();
  params.set("limit", String(SWEEP_THRESHOLD_HISTORY_PAGE_SIZE));
  params.set("offset", String(page * SWEEP_THRESHOLD_HISTORY_PAGE_SIZE));
  if (filters.from) {
    // Task #873 — interpret the wall-clock "from" boundary in the
    // founder-selected timezone so this card lines up with the sibling
    // flap-history card / chart instead of the browser's local midnight.
    const iso = zonedWallClockToUtcIso(filters.from, timeZone);
    if (iso) params.set("from", iso);
  }
  if (filters.to) {
    const iso = zonedWallClockToUtcIso(filters.to, timeZone);
    if (iso) params.set("to", iso);
  }
  const actor = filters.actorUserId.trim();
  if (actor) params.set("actorUserId", actor);
  return `${SWEEP_THRESHOLD_HISTORY_URL}?${params.toString()}`;
}

// Task #848 — "Top changers" leaderboard over a configurable window.
const FLAP_CONFIG_HISTORY_ACTOR_STATS_URL =
  "/api/admin/production-assets/orphans/sweep/flapping/config-history/actor-stats";

type FlapConfigHistoryActorStat = {
  actorUserId: string | null;
  changeCount: number;
  lastChangeAt: string;
};

type FlapConfigHistoryActorStatsResponse = {
  ok: boolean;
  items: FlapConfigHistoryActorStat[];
  windowDays: number;
  since: string;
  limit: number;
};

const FLAP_ACTOR_STATS_WINDOW_OPTIONS = [1, 7, 30, 90] as const;
type FlapActorStatsWindow = (typeof FLAP_ACTOR_STATS_WINDOW_OPTIONS)[number];

// Task #851 — per-day change-counts sparkline. Counts come from the same
// Task #825 history table consumed by the audit card; the window
// (in days) is bounded by the server to 1..90.
const FLAP_CONFIG_HISTORY_DAILY_STATS_URL =
  "/api/admin/production-assets/orphans/sweep/flapping/config-history/daily-stats";

type FlapConfigHistoryDailyBucket = {
  day: string;
  count: number;
};

type FlapConfigHistoryDailyStatsResponse = {
  ok: boolean;
  windowDays: number;
  timeZone: string;
  since: string;
  totalCount: number;
  buckets: FlapConfigHistoryDailyBucket[];
  // Task #871 — server sets this `true` when the underlying aggregation
  // SQL throws (e.g. the Task #865 GROUP BY regression). The chart
  // surfaces it as an explicit error so "query crashed" no longer looks
  // identical to "no changes in window".
  queryFailed?: boolean;
  errorReason?: string | null;
};

const FLAP_DAILY_STATS_WINDOW_OPTIONS = [7, 14, 30, 90] as const;
type FlapDailyStatsWindow = (typeof FLAP_DAILY_STATS_WINDOW_OPTIONS)[number];

// Task #858 — per-day flapping alert + digest counts. Overlaid on the
// Task #851 "Changes per day" chart so founders can confirm at a glance
// whether each tuning spike followed a real alert storm.
const FLAP_ALERT_DAILY_STATS_URL =
  "/api/admin/production-assets/orphans/sweep/flapping/alerts/daily-stats";

// Task #861 — per-day drill-down. Clicking an alert marker fetches the
// underlying `platform_alerts` rows for that UTC day.
const FLAP_ALERT_BY_DAY_URL =
  "/api/admin/production-assets/orphans/sweep/flapping/alerts/by-day";

type FlapAlertByDayKind = "alert" | "digest";

type FlapAlertByDayRow = {
  id: string;
  type: string;
  kind: FlapAlertByDayKind;
  severity: string;
  message: string;
  details: unknown;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  autoTriggered: boolean;
  createdAt: string;
};

type FlapAlertByDayResponse = {
  ok: boolean;
  day: string;
  dayStart: string;
  dayEnd: string;
  limit: number;
  total: number;
  alertCount: number;
  digestCount: number;
  items: FlapAlertByDayRow[];
};

type FlapAlertDailyBucket = {
  day: string;
  alertCount: number;
  digestCount: number;
  total: number;
};

type FlapAlertDailyStatsResponse = {
  ok: boolean;
  windowDays: number;
  // Task #877 — Echoed by the server so the chart can confirm which
  // zone the overlay buckets are anchored to (mirrors the config-
  // history daily-stats response).
  timeZone: string;
  since: string;
  totalAlertCount: number;
  totalDigestCount: number;
  totalCount: number;
  buckets: FlapAlertDailyBucket[];
};

// Task #859 — Founders pick the timezone the daily chart buckets by, so a
// 9pm-PT tweak doesn't appear to "spill" into tomorrow on the UTC day.
// Default is the browser's resolved timezone (falls back to UTC).
// Task #878 — The list of common zones and the IANA-validation /
// browser-detection helpers now live in `@/lib/admin-timezone` so every
// admin surface uses the same vocabulary and the same persisted picker.
const FLAP_DAILY_STATS_COMMON_TIMEZONES = COMMON_ADMIN_TIME_ZONES;

const resolveBrowserTimeZone = sharedResolveBrowserTimeZone;
const isValidIanaTimeZone = sharedIsValidIanaTimeZone;

// Task #864 — Format an ISO/UTC timestamp as a wall-clock string in the
// founder-selected timezone. Falls back to `toLocaleString()` if the
// browser rejects the timezone token.
function formatInTimeZone(input: string | number | Date, timeZone: string): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString(undefined, { timeZone });
  } catch {
    return d.toLocaleString();
  }
}

// Task #864 — Interpret a `datetime-local` wall-clock string ("YYYY-MM-DDTHH:mm[:ss]")
// as occurring in `timeZone` and return the equivalent UTC ISO instant.
// Used so the audit-table from/to filters bucket by the same zone the chart does:
// e.g. picking 2026-05-22T00:00 with timeZone "America/Los_Angeles" sends the
// UTC instant 2026-05-22T07:00Z rather than the browser's local midnight.
function zonedWallClockToUtcIso(
  wallClock: string,
  timeZone: string,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    wallClock.trim(),
  );
  if (!m) {
    const fallback = new Date(wallClock);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }
  const [, Y, Mo, D, H, Mi, S] = m;
  const asIfUtc = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +(S ?? "0"));
  let offsetMs = 0;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(new Date(asIfUtc));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const hour = get("hour") === 24 ? 0 : get("hour");
    const asWall = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      hour,
      get("minute"),
      get("second"),
    );
    offsetMs = asWall - asIfUtc;
  } catch {
    offsetMs = 0;
  }
  return new Date(asIfUtc - offsetMs).toISOString();
}

type FlapConfigChangedField = "flappingThreshold" | "flappingWindowMs";

type FlapConfigSnapshot = {
  flappingThreshold: number;
  flappingWindowMs: number;
};

type FlapConfigHistoryAuditEntry = {
  id: string;
  occurredAt: string;
  updatedBy: string | null;
  action: "updated" | "restored_default";
  previousConfig: FlapConfigSnapshot | null;
  newConfig: FlapConfigSnapshot | null;
  changedFields: FlapConfigChangedField[];
};

type FlapConfigHistoryAuditResponse = {
  ok: boolean;
  items: FlapConfigHistoryAuditEntry[];
  limit: number;
};

const FLAP_AUDIT_LIMIT_OPTIONS = [10, 25, 50] as const;
type FlapAuditLimit = (typeof FLAP_AUDIT_LIMIT_OPTIONS)[number];

function labelFlapAuditField(f: FlapConfigChangedField): string {
  if (f === "flappingThreshold") return "Threshold";
  if (f === "flappingWindowMs") return "Window";
  return f;
}

function formatFlapAuditSnapshotField(
  field: FlapConfigChangedField,
  snap: FlapConfigSnapshot | null,
): string {
  if (!snap) return "—";
  if (field === "flappingThreshold") return String(snap.flappingThreshold);
  if (field === "flappingWindowMs") {
    const hours = snap.flappingWindowMs / (60 * 60 * 1000);
    return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(2)}h`;
  }
  return "—";
}

type FlapConfigChange = {
  id: string;
  setting: string;
  previousValue: string | null;
  newValue: string;
  actorUserId: string | null;
  changedAt: string;
};

type FlapConfigHistoryResponse = {
  ok: boolean;
  items: FlapConfigChange[];
  total: number;
  limit: number;
  offset: number;
};

const FLAP_HISTORY_PAGE_SIZE = 10;

type FlapHistoryFilters = {
  from: string;
  to: string;
  actorUserId: string;
};

function buildFlapHistoryUrl(
  filters: FlapHistoryFilters,
  page: number,
  timeZone: string,
): string {
  const params = new URLSearchParams();
  params.set("limit", String(FLAP_HISTORY_PAGE_SIZE));
  params.set("offset", String(page * FLAP_HISTORY_PAGE_SIZE));
  if (filters.from) {
    // Task #864 — interpret the wall-clock "from" boundary in the
    // founder-selected timezone so the audit list lines up with the
    // chart's day buckets instead of the browser's local midnight.
    const iso = zonedWallClockToUtcIso(filters.from, timeZone);
    if (iso) params.set("from", iso);
  }
  if (filters.to) {
    const iso = zonedWallClockToUtcIso(filters.to, timeZone);
    if (iso) params.set("to", iso);
  }
  const actor = filters.actorUserId.trim();
  if (actor) params.set("actorUserId", actor);
  return `${FLAP_CONFIG_HISTORY_URL}?${params.toString()}`;
}

function formatFlapConfigValue(setting: string, raw: string | null): string {
  if (raw == null) return "—";
  if (setting === "flapping_window_ms") {
    const ms = Number(raw);
    if (!Number.isFinite(ms)) return raw;
    const hours = ms / (60 * 60 * 1000);
    return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(2)}h`;
  }
  return raw;
}

function labelFlapConfigSetting(setting: string): string {
  if (setting === "flapping_threshold") return "Flapping threshold";
  if (setting === "flapping_window_ms") return "Flapping window";
  return setting;
}

type SweepStatus = {
  lastScanAt: number | null;
  lastOrphanCount: number | null;
  threshold: number;
  wasAboveThreshold: boolean;
  nextScanAt: number | null;
  intervalMs: number | null;
  lastAutoResolvedAt: number | null;
  lastAutoResolvedCount: number | null;
  flapping: boolean;
  flappingCount: number;
  flappingWindowMs: number;
  flappingThreshold: number;
  flappingSnoozeUntil: number | null;
  flappingSnoozeActive: boolean;
  flappingSnoozeMaxMs: number;
  // Task #805 — recurring flapping-digest cadence + snooze receipt.
  flappingDigestIntervalMs: number;
  flappingDigestLastSentAt: number | null;
  flappingDigestNextEligibleAt: number | null;
  flappingDigestSnoozeUntil: string | null;
};

const FLAPPING_SNOOZE_URL =
  "/api/admin/production-assets/orphan-sweep/flapping-snooze";
const FLAPPING_UNSNOOZE_URL =
  "/api/admin/production-assets/orphan-sweep/flapping-unsnooze";
const FLAPPING_SNOOZE_LOG_URL =
  "/api/admin/production-assets/orphan-sweep/flapping-snooze-log";

type SweepStatusResponse = { ok: boolean; status: SweepStatus };

// Task #813 — flapping-digest snooze (mirrors audit-email snooze shape).
type FlappingDigestSnoozeConfig = {
  snoozeUntil: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  expiryReminderSentAt: string | null;
};

type FlappingDigestSnoozeHistoryEntry = {
  id: string;
  alertKey: string;
  action: "set" | "cleared" | "expired";
  snoozeUntil: string | null;
  updatedBy: string | null;
  occurredAt: string;
};

type FlappingDigestSnoozeResponse = {
  ok: boolean;
  snooze: FlappingDigestSnoozeConfig;
  history: FlappingDigestSnoozeHistoryEntry[];
};

const FLAPPING_DIGEST_SNOOZE_URL =
  "/api/admin/production-assets/orphans/sweep/flapping-digest/snooze";

type FlappingSnoozeLogEntry = {
  id: string;
  action: string;
  snoozeUntil: string | null;
  updatedBy: string | null;
  reason: string | null;
  // Task #815 — running count of flapping alerts swallowed during this snooze window.
  suppressedCount: number;
  occurredAt: string;
};

type FlappingSnoozeLogResponse = {
  ok: boolean;
  entries: FlappingSnoozeLogEntry[];
  total: number;
  limit: number;
  offset: number;
};


function formatWindowMs(ms: number): string {
  const h = Math.round(ms / (60 * 60 * 1000));
  if (h >= 24 && h % 24 === 0) {
    const d = h / 24;
    return `${d}d`;
  }
  return `${h}h`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function shortHash(s: string): string {
  if (!s) return "";
  return s.length <= 16 ? s : `${s.slice(0, 10)}…${s.slice(-4)}`;
}

export default function OrphanReconcilePanel() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<ListResponse>({
    queryKey: [ORPHANS_URL],
  });
  const sweepQuery = useQuery<SweepStatusResponse>({
    queryKey: [SWEEP_STATUS_URL],
    refetchInterval: 60_000,
  });
  const refetchSweepStatus = sweepQuery.refetch;
  const snoozeQuery = useQuery<FlappingDigestSnoozeResponse>({
    queryKey: [FLAPPING_DIGEST_SNOOZE_URL],
    refetchInterval: 60_000,
  });
  const snoozeConfig = snoozeQuery.data?.snooze ?? null;
  const snoozeHistory = snoozeQuery.data?.history ?? [];
  const snoozeActiveUntilMs =
    snoozeConfig?.snoozeUntil &&
    !Number.isNaN(Date.parse(snoozeConfig.snoozeUntil))
      ? Date.parse(snoozeConfig.snoozeUntil)
      : null;
  const snoozeIsActive =
    snoozeActiveUntilMs !== null && snoozeActiveUntilMs > Date.now();
  const [snoozeUntilDraft, setSnoozeUntilDraft] = useState<string>("");
  const [digestSnoozeMsg, setDigestSnoozeMsg] = useState<string | null>(null);
  const snoozeMutation = useMutation({
    mutationFn: async (snoozeUntil: string | null) => {
      const res = await apiRequest("POST", FLAPPING_DIGEST_SNOOZE_URL, {
        snoozeUntil,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(
          json?.message || json?.error || `Snooze failed (HTTP ${res.status})`,
        );
      }
      return json as FlappingDigestSnoozeResponse;
    },
    onSuccess: (data) => {
      setDigestSnoozeMsg(
        data.snooze.snoozeUntil
          ? `Snoozed until ${new Date(data.snooze.snoozeUntil).toLocaleString()}`
          : "Snooze cleared.",
      );
      queryClient.setQueryData([FLAPPING_DIGEST_SNOOZE_URL], data);
      queryClient.invalidateQueries({ queryKey: [SWEEP_STATUS_URL] });
    },
    onError: (e: any) => {
      setDigestSnoozeMsg(e?.message || "Snooze failed");
    },
  });
  function snoozeFor(ms: number) {
    setDigestSnoozeMsg(null);
    snoozeMutation.mutate(new Date(Date.now() + ms).toISOString());
  }
  function snoozeUntilCustom() {
    const v = snoozeUntilDraft.trim();
    if (!v) {
      setDigestSnoozeMsg("Pick a date/time first.");
      return;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      setDigestSnoozeMsg("Invalid date/time.");
      return;
    }
    if (d.getTime() <= Date.now()) {
      setDigestSnoozeMsg("Snooze must be in the future.");
      return;
    }
    setDigestSnoozeMsg(null);
    snoozeMutation.mutate(d.toISOString());
  }
  function clearSnooze() {
    setDigestSnoozeMsg(null);
    snoozeMutation.mutate(null);
  }
  // Task #864 — hoisted from the daily-stats card below so the flapping-config
  // audit/history/top-changers surfaces can also bucket and format by the same
  // founder-selected timezone.
  // Task #878 — Use the shared admin-wide timezone preference so picking a
  // zone on this page also applies to every other admin surface (e.g. the
  // archive-deletion notifier). Legacy `mougle.admin.flapDailyStatsTimeZone`
  // values are migrated to the shared key by `useAdminTimeZonePreference`.
  const {
    timeZone: flapDailyStatsTimeZone,
    browserTimeZone,
    setTimeZone: setFlapDailyStatsTimeZone,
    resetTimeZone: resetFlapDailyStatsTimeZone,
  } = useAdminTimeZonePreference();
  const flapDailyStatsTimeZoneOptions = useMemo(() => {
    const set = new Set<string>(FLAP_DAILY_STATS_COMMON_TIMEZONES);
    set.add(browserTimeZone);
    set.add(flapDailyStatsTimeZone);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [browserTimeZone, flapDailyStatsTimeZone]);
  const [flapHistoryFilterDraft, setFlapHistoryFilterDraft] =
    useState<FlapHistoryFilters>({ from: "", to: "", actorUserId: "" });
  const [flapHistoryFilters, setFlapHistoryFilters] =
    useState<FlapHistoryFilters>({ from: "", to: "", actorUserId: "" });
  const [flapHistoryPage, setFlapHistoryPage] = useState(0);
  const [flapHistoryFilterMsg, setFlapHistoryFilterMsg] = useState<
    string | null
  >(null);
  const flapHistoryUrl = useMemo(
    () =>
      buildFlapHistoryUrl(
        flapHistoryFilters,
        flapHistoryPage,
        flapDailyStatsTimeZone,
      ),
    [flapHistoryFilters, flapHistoryPage, flapDailyStatsTimeZone],
  );
  const flapHistoryQuery = useQuery<FlapConfigHistoryResponse>({
    queryKey: [flapHistoryUrl],
  });
  function applyFlapHistoryFilters() {
    if (flapHistoryFilterDraft.from && flapHistoryFilterDraft.to) {
      const f = new Date(flapHistoryFilterDraft.from).getTime();
      const t = new Date(flapHistoryFilterDraft.to).getTime();
      if (Number.isFinite(f) && Number.isFinite(t) && f > t) {
        setFlapHistoryFilterMsg("From date must be on or before To date.");
        return;
      }
    }
    setFlapHistoryFilterMsg(null);
    setFlapHistoryFilters({ ...flapHistoryFilterDraft });
    setFlapHistoryPage(0);
  }
  function clearFlapHistoryFilters() {
    const empty = { from: "", to: "", actorUserId: "" };
    setFlapHistoryFilterDraft(empty);
    setFlapHistoryFilters(empty);
    setFlapHistoryPage(0);
    setFlapHistoryFilterMsg(null);
  }
  // Task #839 — Task #825 audit-trail card (snapshot diffs).
  // Task #847 — actor filter so admins can narrow the audit list to a
  // specific user when investigating noisy threshold/window changes.
  const [flapAuditLimit, setFlapAuditLimit] = useState<FlapAuditLimit>(10);
  const [flapAuditActorDraft, setFlapAuditActorDraft] = useState<string>("");
  const [flapAuditActor, setFlapAuditActor] = useState<string>("");
  const flapAuditUrl = (() => {
    const params = new URLSearchParams();
    params.set("limit", String(flapAuditLimit));
    if (flapAuditActor) params.set("actorUserId", flapAuditActor);
    return `${FLAP_CONFIG_HISTORY_AUDIT_URL}?${params.toString()}`;
  })();
  const flapAuditQuery = useQuery<FlapConfigHistoryAuditResponse>({
    queryKey: [flapAuditUrl],
  });
  function applyFlapAuditActor() {
    setFlapAuditActor(flapAuditActorDraft.trim());
  }
  function clearFlapAuditActor() {
    setFlapAuditActorDraft("");
    setFlapAuditActor("");
  }
  // Task #845 — sweep-threshold change-history audit card.
  // Task #849 — actor/date filters + Prev/Next pagination, mirroring
  // the Task #810 flapping-config history card.
  const [sweepThresholdHistoryFilterDraft, setSweepThresholdHistoryFilterDraft] =
    useState<SweepThresholdHistoryFilters>({
      from: "",
      to: "",
      actorUserId: "",
    });
  const [sweepThresholdHistoryFilters, setSweepThresholdHistoryFilters] =
    useState<SweepThresholdHistoryFilters>({
      from: "",
      to: "",
      actorUserId: "",
    });
  const [sweepThresholdHistoryPage, setSweepThresholdHistoryPage] = useState(0);
  const [sweepThresholdHistoryFilterMsg, setSweepThresholdHistoryFilterMsg] =
    useState<string | null>(null);
  const sweepThresholdHistoryUrl = useMemo(
    () =>
      buildSweepThresholdHistoryUrl(
        sweepThresholdHistoryFilters,
        sweepThresholdHistoryPage,
        flapDailyStatsTimeZone,
      ),
    [
      sweepThresholdHistoryFilters,
      sweepThresholdHistoryPage,
      flapDailyStatsTimeZone,
    ],
  );
  const sweepThresholdHistoryQuery = useQuery<SweepThresholdHistoryResponse>({
    queryKey: [sweepThresholdHistoryUrl],
  });
  function applySweepThresholdHistoryFilters() {
    if (
      sweepThresholdHistoryFilterDraft.from &&
      sweepThresholdHistoryFilterDraft.to
    ) {
      const f = new Date(sweepThresholdHistoryFilterDraft.from).getTime();
      const t = new Date(sweepThresholdHistoryFilterDraft.to).getTime();
      if (Number.isFinite(f) && Number.isFinite(t) && f > t) {
        setSweepThresholdHistoryFilterMsg(
          "From date must be on or before To date.",
        );
        return;
      }
    }
    setSweepThresholdHistoryFilterMsg(null);
    setSweepThresholdHistoryFilters({ ...sweepThresholdHistoryFilterDraft });
    setSweepThresholdHistoryPage(0);
  }
  function clearSweepThresholdHistoryFilters() {
    const empty = { from: "", to: "", actorUserId: "" };
    setSweepThresholdHistoryFilterDraft(empty);
    setSweepThresholdHistoryFilters(empty);
    setSweepThresholdHistoryPage(0);
    setSweepThresholdHistoryFilterMsg(null);
  }

  // Task #848 — "Top changers" leaderboard. Counts come from the same
  // Task #825 history table consumed by the audit card above; clicking
  // a row applies that actor as the audit-card filter.
  const [flapActorStatsWindow, setFlapActorStatsWindow] =
    useState<FlapActorStatsWindow>(7);
  const flapActorStatsUrl = (() => {
    const params = new URLSearchParams();
    params.set("windowDays", String(flapActorStatsWindow));
    params.set("limit", "5");
    return `${FLAP_CONFIG_HISTORY_ACTOR_STATS_URL}?${params.toString()}`;
  })();
  const flapActorStatsQuery = useQuery<FlapConfigHistoryActorStatsResponse>({
    queryKey: [flapActorStatsUrl],
  });
  function applyActorStatsRow(actor: string | null) {
    // Task #857 — null actor is surfaced in the leaderboard as "system";
    // clicking such a row should populate the audit filter with the same
    // visible label so the prefilled input matches what the user clicked.
    const trimmed = actor === null ? "system" : actor.trim();
    // Task #860 — clicking the row whose actor is already the active filter
    // toggles the filter off, so admins can clear it without reaching for
    // the separate "Any actor" button in a different visual block.
    if (flapAuditActor === trimmed) {
      setFlapAuditActorDraft("");
      setFlapAuditActor("");
      return;
    }
    setFlapAuditActorDraft(trimmed);
    setFlapAuditActor(trimmed);
  }

  // Task #888 — export the currently-applied flapping-config history
  // filters as CSV. Mirrors `exportSweepThresholdHistoryCsv` below 1:1.
  const [flapHistoryCsvBusy, setFlapHistoryCsvBusy] = useState(false);
  async function exportFlapHistoryCsv() {
    if (flapHistoryCsvBusy) return;
    setFlapHistoryCsvBusy(true);
    try {
      const params = new URLSearchParams();
      const f = flapHistoryFilters.from;
      const t = flapHistoryFilters.to;
      if (f) {
        const iso = zonedWallClockToUtcIso(f, flapDailyStatsTimeZone);
        if (iso) params.set("from", iso);
      }
      if (t) {
        const iso = zonedWallClockToUtcIso(t, flapDailyStatsTimeZone);
        if (iso) params.set("to", iso);
      }
      const actor = flapHistoryFilters.actorUserId.trim();
      if (actor) params.set("actorUserId", actor);
      if (flapDailyStatsTimeZone) {
        params.set("timeZone", flapDailyStatsTimeZone);
      }
      const qs = params.toString();
      const url = `${FLAP_CONFIG_HISTORY_URL}.csv${qs ? `?${qs}` : ""}`;
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
          const j = await resp.json();
          if (j && typeof j.error === "string") msg = j.error;
        } catch {}
        setFlapHistoryFilterMsg(`Export failed: ${msg}`);
        return;
      }
      const blob = await resp.blob();
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const filename =
        match?.[1] ?? `orphan-sweep-flapping-config-history-${Date.now()}.csv`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setFlapHistoryFilterMsg(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setFlapHistoryCsvBusy(false);
    }
  }

  // Task #853 — export the currently-applied filter set to CSV.
  const [sweepThresholdHistoryCsvBusy, setSweepThresholdHistoryCsvBusy] =
    useState(false);
  async function exportSweepThresholdHistoryCsv() {
    if (sweepThresholdHistoryCsvBusy) return;
    setSweepThresholdHistoryCsvBusy(true);
    try {
      const params = new URLSearchParams();
      const f = sweepThresholdHistoryFilters.from;
      const t = sweepThresholdHistoryFilters.to;
      if (f) {
        // Task #873 — same zoned-boundary interpretation as the URL builder,
        // so the CSV export covers exactly the rows shown in the card.
        const iso = zonedWallClockToUtcIso(f, flapDailyStatsTimeZone);
        if (iso) params.set("from", iso);
      }
      if (t) {
        const iso = zonedWallClockToUtcIso(t, flapDailyStatsTimeZone);
        if (iso) params.set("to", iso);
      }
      const actor = sweepThresholdHistoryFilters.actorUserId.trim();
      if (actor) params.set("actorUserId", actor);
      // Task #879 — pass the founder-selected zone so the CSV's
      // changed_at_local column matches what the on-screen card shows.
      if (flapDailyStatsTimeZone) {
        params.set("timeZone", flapDailyStatsTimeZone);
      }
      const qs = params.toString();
      const url = `${SWEEP_THRESHOLD_HISTORY_URL}.csv${qs ? `?${qs}` : ""}`;
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
          const j = await resp.json();
          if (j && typeof j.error === "string") msg = j.error;
        } catch {}
        setSweepThresholdHistoryFilterMsg(`Export failed: ${msg}`);
        return;
      }
      const blob = await resp.blob();
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const filename =
        match?.[1] ?? `orphan-sweep-threshold-history-${Date.now()}.csv`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setSweepThresholdHistoryFilterMsg(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSweepThresholdHistoryCsvBusy(false);
    }
  }

  // Task #851 — Daily change-counts sparkline. Founders can spot tuning
  // spikes (e.g. clusters right after an alert storm) without scrolling
  // through individual audit rows.
  const [flapDailyStatsWindow, setFlapDailyStatsWindow] =
    useState<FlapDailyStatsWindow>(14);
  // Task #864 — timezone state hoisted earlier in the component so the
  // audit/history/top-changers surfaces above can share it (now using the
  // localStorage-backed preference hook added by Task #874). See above.
  const flapDailyStatsUrl = (() => {
    const params = new URLSearchParams();
    params.set("windowDays", String(flapDailyStatsWindow));
    params.set("timeZone", flapDailyStatsTimeZone);
    return `${FLAP_CONFIG_HISTORY_DAILY_STATS_URL}?${params.toString()}`;
  })();
  const flapDailyStatsQuery = useQuery<FlapConfigHistoryDailyStatsResponse>({
    queryKey: [flapDailyStatsUrl],
  });
  // Task #858 — alert/digest counts on the SAME window as the changes-
  // per-day chart, so the founder UI can overlay alert markers.
  // Task #877 — Pass the chart's selected time zone through so the
  // overlay buckets by the SAME founder-chosen calendar day as the
  // underlying config-history series (otherwise a non-UTC founder sees
  // overlay markers slide off the bars they belong to).
  const flapAlertDailyStatsUrl = (() => {
    const params = new URLSearchParams();
    params.set("windowDays", String(flapDailyStatsWindow));
    params.set("timeZone", flapDailyStatsTimeZone);
    return `${FLAP_ALERT_DAILY_STATS_URL}?${params.toString()}`;
  })();
  const flapAlertDailyStatsQuery = useQuery<FlapAlertDailyStatsResponse>({
    queryKey: [flapAlertDailyStatsUrl],
  });
  // Task #861 — drill-down state. Clicking an alert marker with
  // `total > 0` sets the day; a detail card below the chart then
  // fetches the matching `platform_alerts` rows.
  const [selectedAlertDay, setSelectedAlertDay] = useState<string | null>(
    null,
  );
  const flapAlertByDayUrl =
    selectedAlertDay != null
      ? `${FLAP_ALERT_BY_DAY_URL}?day=${encodeURIComponent(selectedAlertDay)}`
      : null;
  const flapAlertByDayQuery = useQuery<FlapAlertByDayResponse>({
    queryKey: flapAlertByDayUrl ? [flapAlertByDayUrl] : ["flap-alert-by-day-idle"],
    enabled: flapAlertByDayUrl != null,
  });
  // Task #869 — inline acknowledge on a per-day drill-down row. Reuses
  // the shared platform_alerts ack route. On success we patch the
  // by-day cache so the badge flips to "ack" without a full reload, and
  // invalidate the daily-stats / overview caches so counts stay in sync.
  const [ackErrorById, setAckErrorById] = useState<Record<string, string>>({});
  const ackFlapAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/panic-button/alerts/${encodeURIComponent(alertId)}/acknowledge`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json && (json.message || json.error)) ||
            `Acknowledge failed (HTTP ${res.status})`,
        );
      }
      return { alertId, alert: json };
    },
    onSuccess: ({ alertId, alert }) => {
      setAckErrorById((m) => {
        if (!(alertId in m)) return m;
        const next = { ...m };
        delete next[alertId];
        return next;
      });
      if (flapAlertByDayUrl) {
        queryClient.setQueryData<FlapAlertByDayResponse>(
          [flapAlertByDayUrl],
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              items: prev.items.map((r) =>
                r.id === alertId
                  ? {
                      ...r,
                      acknowledged: true,
                      acknowledgedBy:
                        (alert && (alert.acknowledgedBy as string)) ??
                        r.acknowledgedBy ??
                        "admin",
                      acknowledgedAt:
                        (alert && (alert.acknowledgedAt as string)) ??
                        r.acknowledgedAt ??
                        new Date().toISOString(),
                    }
                  : r,
              ),
            };
          },
        );
      }
      queryClient.invalidateQueries({ queryKey: [flapAlertDailyStatsUrl] });
      queryClient.invalidateQueries({ queryKey: [SWEEP_STATUS_URL] });
    },
    onError: (err, alertId) => {
      setAckErrorById((m) => ({
        ...m,
        [alertId]: err instanceof Error ? err.message : String(err),
      }));
    },
  });
  const [pending, setPending] = useState<ActionState>(null);
  const [lastResult, setLastResult] = useState<ActionResult>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Task #870 — per-row "View payload" expansion + copy state for the
  // flapping-alert by-day drill-down. Keyed by alert row id.
  const [flapAlertPayloadOpen, setFlapAlertPayloadOpen] = useState<
    Set<string>
  >(new Set());
  const [flapAlertPayloadCopied, setFlapAlertPayloadCopied] = useState<
    string | null
  >(null);
  const toggleFlapAlertPayload = (id: string) => {
    setFlapAlertPayloadOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const copyFlapAlertPayload = async (id: string, payload: unknown) => {
    try {
      const text = JSON.stringify(payload, null, 2);
      await navigator.clipboard.writeText(text);
      setFlapAlertPayloadCopied(id);
      setTimeout(() => {
        setFlapAlertPayloadCopied((curr) => (curr === id ? null : curr));
      }, 1500);
    } catch {
      /* ignore */
    }
  };
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRelinking, setBulkRelinking] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);
  const [bulkResultsKind, setBulkResultsKind] = useState<
    "hard_delete" | "relink_object" | null
  >(null);
  const [thresholdDraft, setThresholdDraft] = useState<string>("");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdMsg, setThresholdMsg] = useState<string | null>(null);
  const [flapThresholdDraft, setFlapThresholdDraft] = useState<string>("");
  const [savingFlapThreshold, setSavingFlapThreshold] = useState(false);
  const [flapThresholdMsg, setFlapThresholdMsg] = useState<string | null>(null);
  const [flapWindowDraft, setFlapWindowDraft] = useState<string>("");
  const [savingFlapWindow, setSavingFlapWindow] = useState(false);
  const [flapWindowMsg, setFlapWindowMsg] = useState<string | null>(null);
  const [snoozeBusy, setSnoozeBusy] = useState(false);
  const [snoozeMsg, setSnoozeMsg] = useState<string | null>(null);
  const [snoozeLogOpen, setSnoozeLogOpen] = useState(false);
  const SNOOZE_LOG_PAGE_SIZE = 10;
  const [snoozeLogPage, setSnoozeLogPage] = useState(0);
  const [snoozeLogActorDraft, setSnoozeLogActorDraft] = useState("");
  const [snoozeLogFromDraft, setSnoozeLogFromDraft] = useState("");
  const [snoozeLogToDraft, setSnoozeLogToDraft] = useState("");
  const [snoozeLogFilters, setSnoozeLogFilters] = useState<{
    actor: string;
    from: string;
    to: string;
  }>({ actor: "", from: "", to: "" });
  const [snoozeLogFilterErr, setSnoozeLogFilterErr] = useState<string | null>(
    null,
  );

  const snoozeLogQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(SNOOZE_LOG_PAGE_SIZE));
    params.set("offset", String(snoozeLogPage * SNOOZE_LOG_PAGE_SIZE));
    if (snoozeLogFilters.actor) params.set("actor", snoozeLogFilters.actor);
    if (snoozeLogFilters.from) {
      const d = new Date(snoozeLogFilters.from);
      if (!Number.isNaN(d.getTime())) params.set("from", d.toISOString());
    }
    if (snoozeLogFilters.to) {
      const d = new Date(snoozeLogFilters.to);
      if (!Number.isNaN(d.getTime())) params.set("to", d.toISOString());
    }
    return params.toString();
  }, [snoozeLogPage, snoozeLogFilters]);

  const snoozeLogQuery = useQuery<FlappingSnoozeLogResponse>({
    queryKey: [FLAPPING_SNOOZE_LOG_URL, snoozeLogQueryString],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `${FLAPPING_SNOOZE_LOG_URL}?${snoozeLogQueryString}`,
      );
      return (await res.json()) as FlappingSnoozeLogResponse;
    },
  });

  function applySnoozeLogFilters() {
    if (snoozeLogFromDraft) {
      const d = new Date(snoozeLogFromDraft);
      if (Number.isNaN(d.getTime())) {
        setSnoozeLogFilterErr("Invalid 'from' date.");
        return;
      }
    }
    if (snoozeLogToDraft) {
      const d = new Date(snoozeLogToDraft);
      if (Number.isNaN(d.getTime())) {
        setSnoozeLogFilterErr("Invalid 'to' date.");
        return;
      }
    }
    if (
      snoozeLogFromDraft &&
      snoozeLogToDraft &&
      new Date(snoozeLogFromDraft).getTime() >
        new Date(snoozeLogToDraft).getTime()
    ) {
      setSnoozeLogFilterErr("'from' must be before 'to'.");
      return;
    }
    setSnoozeLogFilterErr(null);
    setSnoozeLogPage(0);
    setSnoozeLogFilters({
      actor: snoozeLogActorDraft.trim(),
      from: snoozeLogFromDraft,
      to: snoozeLogToDraft,
    });
  }

  function clearSnoozeLogFilters() {
    setSnoozeLogFilterErr(null);
    setSnoozeLogActorDraft("");
    setSnoozeLogFromDraft("");
    setSnoozeLogToDraft("");
    setSnoozeLogPage(0);
    setSnoozeLogFilters({ actor: "", from: "", to: "" });
  }

  const sweepStatus = sweepQuery.data?.status ?? null;
  const snoozeLogEntries = snoozeLogQuery.data?.entries ?? [];
  const snoozeLogTotal = snoozeLogQuery.data?.total ?? 0;
  const snoozeLogPageStart =
    snoozeLogTotal === 0 ? 0 : snoozeLogPage * SNOOZE_LOG_PAGE_SIZE + 1;
  const snoozeLogPageEnd =
    snoozeLogPage * SNOOZE_LOG_PAGE_SIZE + snoozeLogEntries.length;
  const snoozeLogHasPrev = snoozeLogPage > 0;
  const snoozeLogHasNext =
    (snoozeLogPage + 1) * SNOOZE_LOG_PAGE_SIZE < snoozeLogTotal;

  useEffect(() => {
    if (sweepStatus && thresholdDraft === "") {
      setThresholdDraft(String(sweepStatus.threshold));
    }
  }, [sweepStatus, thresholdDraft]);

  useEffect(() => {
    if (sweepStatus && flapThresholdDraft === "") {
      setFlapThresholdDraft(String(sweepStatus.flappingThreshold));
    }
  }, [sweepStatus, flapThresholdDraft]);

  useEffect(() => {
    if (sweepStatus && flapWindowDraft === "") {
      const hours = sweepStatus.flappingWindowMs / (60 * 60 * 1000);
      setFlapWindowDraft(
        Number.isInteger(hours) ? String(hours) : hours.toFixed(2),
      );
    }
  }, [sweepStatus, flapWindowDraft]);

  const FLAP_WINDOW_MIN_MS = 60_000;
  const FLAP_WINDOW_MAX_MS = 90 * 24 * 60 * 60 * 1000;

  const items = data?.items ?? [];

  const allSelected = useMemo(
    () => items.length > 0 && items.every((o) => selected.has(o.id)),
    [items, selected],
  );

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of items) {
        if (checked) next.add(o.id);
        else next.delete(o.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function snoozeFlapping(hours: number) {
    setSnoozeBusy(true);
    setSnoozeMsg(null);
    try {
      const res = await apiRequest("POST", FLAPPING_SNOOZE_URL, { hours });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setSnoozeMsg(
          json?.message || json?.error || `Snooze failed (HTTP ${res.status})`,
        );
      } else {
        setSnoozeMsg(
          `Snoozed until ${new Date(json.snoozeUntil).toLocaleString()}`,
        );
        await queryClient.invalidateQueries({ queryKey: [SWEEP_STATUS_URL] });
        await queryClient.invalidateQueries({
          queryKey: [FLAPPING_SNOOZE_LOG_URL],
        });
      }
    } catch (e: any) {
      setSnoozeMsg(e?.message || "Snooze failed");
    } finally {
      setSnoozeBusy(false);
    }
  }

  async function unsnoozeFlapping() {
    setSnoozeBusy(true);
    setSnoozeMsg(null);
    try {
      const res = await apiRequest("POST", FLAPPING_UNSNOOZE_URL, {});
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setSnoozeMsg(
          json?.message ||
            json?.error ||
            `Unsnooze failed (HTTP ${res.status})`,
        );
      } else {
        setSnoozeMsg("Snooze cleared.");
        await queryClient.invalidateQueries({ queryKey: [SWEEP_STATUS_URL] });
        await queryClient.invalidateQueries({
          queryKey: [FLAPPING_SNOOZE_LOG_URL],
        });
      }
    } catch (e: any) {
      setSnoozeMsg(e?.message || "Unsnooze failed");
    } finally {
      setSnoozeBusy(false);
    }
  }

  async function saveThreshold() {
    const n = Number(thresholdDraft);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      setThresholdMsg("Threshold must be a non-negative integer.");
      return;
    }
    setSavingThreshold(true);
    setThresholdMsg(null);
    try {
      const res = await apiRequest(
        "POST",
        "/api/admin/production-assets/orphan-sweep/threshold",
        { threshold: n },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setThresholdMsg(
          json?.message || json?.error || `Save failed (HTTP ${res.status})`,
        );
      } else {
        setThresholdMsg(`Saved (threshold = ${json.threshold}).`);
        await queryClient.invalidateQueries({ queryKey: [SWEEP_STATUS_URL] });
        await queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            (q.queryKey[0] as string).startsWith(SWEEP_THRESHOLD_HISTORY_URL),
        });
      }
    } catch (e: any) {
      setThresholdMsg(e?.message || "Save failed");
    } finally {
      setSavingThreshold(false);
    }
  }

  async function saveFlapThreshold() {
    const n = Number(flapThresholdDraft);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 2 || n > 1000) {
      setFlapThresholdMsg("Threshold must be an integer between 2 and 1000.");
      return;
    }
    setSavingFlapThreshold(true);
    setFlapThresholdMsg(null);
    try {
      const res = await apiRequest(
        "POST",
        "/api/admin/production-assets/orphans/sweep/flapping-threshold",
        { value: n },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setFlapThresholdMsg(
          json?.message ||
            json?.error ||
            `Save failed (HTTP ${res.status})`,
        );
      } else {
        setFlapThresholdMsg(`Saved (flapping threshold = ${json.value}).`);
        await queryClient.invalidateQueries({ queryKey: [SWEEP_STATUS_URL] });
        await queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            (q.queryKey[0] as string).startsWith(FLAP_CONFIG_HISTORY_URL),
        });
      }
    } catch (e: any) {
      setFlapThresholdMsg(e?.message || "Save failed");
    } finally {
      setSavingFlapThreshold(false);
    }
  }

  async function saveFlapWindow() {
    const hours = Number(flapWindowDraft);
    if (!Number.isFinite(hours) || hours <= 0) {
      setFlapWindowMsg("Window must be a positive number of hours.");
      return;
    }
    const ms = Math.round(hours * 60 * 60 * 1000);
    if (ms < FLAP_WINDOW_MIN_MS || ms > FLAP_WINDOW_MAX_MS) {
      setFlapWindowMsg(
        "Window must be between 1 minute (~0.017h) and 90 days (2160h).",
      );
      return;
    }
    setSavingFlapWindow(true);
    setFlapWindowMsg(null);
    try {
      const res = await apiRequest(
        "POST",
        "/api/admin/production-assets/orphans/sweep/flapping-window-ms",
        { value: ms },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setFlapWindowMsg(
          json?.message ||
            json?.error ||
            `Save failed (HTTP ${res.status})`,
        );
      } else {
        const savedHours = (json.value as number) / (60 * 60 * 1000);
        setFlapWindowMsg(`Saved (flapping window = ${savedHours}h).`);
        await queryClient.invalidateQueries({ queryKey: [SWEEP_STATUS_URL] });
        await queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            (q.queryKey[0] as string).startsWith(FLAP_CONFIG_HISTORY_URL),
        });
      }
    } catch (e: any) {
      setFlapWindowMsg(e?.message || "Save failed");
    } finally {
      setSavingFlapWindow(false);
    }
  }

  async function runAction(
    orphan: Orphan,
    action: "hard_delete" | "relink_object",
  ) {
    const verb = action === "hard_delete" ? "Hard-delete" : "Re-link";
    const confirmMsg =
      action === "hard_delete"
        ? `Hard-delete the orphan row for "${orphan.name}"?\n\n` +
          `This removes the database row + audit-log rows. The object bytes are already gone.\n\n` +
          `Type DELETE to confirm:`
        : `Re-link "${orphan.name}"?\n\n` +
          `The server will verify the bytes have come back at the original storageKey, ` +
          `or — if you supply a new storageKey on the next prompt — that the bytes at ` +
          `that new path match this row's sha256 and byte size.\n\nProceed?`;

    if (action === "hard_delete") {
      const typed = prompt(confirmMsg);
      if (typed === null) return;
      if (typed !== "DELETE") {
        alert("Confirmation did not match. Hard-delete cancelled.");
        return;
      }
    } else {
      if (!confirm(confirmMsg)) return;
    }

    let reason: string | null = "";
    let newStorageKey: string | null = null;
    if (action === "hard_delete") {
      reason = prompt(
        "Reason for hard-delete (required, recorded in moderation log):",
        "Orphan row reconcile — object bytes confirmed missing.",
      );
      if (reason === null) return;
      if (!reason.trim()) {
        alert("A non-empty reason is required.");
        return;
      }
    } else {
      // Task #812 — let admins point the row at a restored copy that
      // came back under a different storageKey. Leaving this blank keeps
      // the original behaviour (re-check the existing storageKey).
      const supplied = prompt(
        `Optional: new storageKey for "${orphan.name}".\n\n` +
          `Leave blank to re-check the existing key:\n  ${orphan.storageKey}\n\n` +
          `If you supply a value, the server will refuse unless the bytes at the new ` +
          `key match this row's sha256 and byte size.`,
        "",
      );
      if (supplied === null) return;
      const trimmed = supplied.trim();
      if (trimmed.length > 0 && trimmed !== orphan.storageKey) {
        newStorageKey = trimmed;
        reason = prompt(
          "Optional: reason for re-linking to a new storageKey (recorded in the audit log):",
          "Object bytes restored under a new path.",
        );
        if (reason === null) return;
      }
    }

    setPending({ id: orphan.id, action });
    setLastResult(null);
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/production-assets/${orphan.id}/reconcile`,
        {
          action,
          confirm: true,
          ...(reason && reason.trim() ? { reason: reason.trim() } : {}),
          ...(newStorageKey ? { newStorageKey } : {}),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setLastResult({
          id: orphan.id,
          ok: false,
          message:
            json?.message || json?.error || `${verb} failed (HTTP ${res.status})`,
        });
      } else {
        const resultStatus =
          json?.result?.status ?? json?.result?.action ?? "done";
        setLastResult({
          id: orphan.id,
          ok: true,
          message: `${verb} ok — ${resultStatus}`,
        });
      }
    } catch (err: any) {
      setLastResult({
        id: orphan.id,
        ok: false,
        message: err?.message || "Request failed",
      });
    } finally {
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: [ORPHANS_URL] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/production-assets"],
      });
      await refetch();
    }
  }

  async function bulkHardDelete() {
    const ids = Array.from(selected);
    const targets = items.filter((o) => ids.includes(o.id));
    if (targets.length === 0) {
      alert("No orphan rows selected.");
      return;
    }
    const confirmMsg =
      `HARD-DELETE ${targets.length} orphan row${targets.length === 1 ? "" : "s"}?\n\n` +
      `This removes the database row + audit-log rows for each selected orphan.\n` +
      `The object bytes are already gone. This cannot be undone.\n\n` +
      targets.map((o) => `• ${o.name}`).join("\n") +
      `\n\nType DELETE to confirm:`;
    const typed = prompt(confirmMsg);
    if (typed === null) return;
    if (typed !== "DELETE") {
      alert("Confirmation did not match. Bulk hard-delete cancelled.");
      return;
    }
    const reason = prompt(
      "Reason for bulk hard-delete (required, recorded in moderation log for every orphan):",
      "Orphan rows reconcile — object bytes confirmed missing.",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert("A non-empty reason is required.");
      return;
    }

    setBulkDeleting(true);
    setBulkResults(null);
    setBulkResultsKind(null);
    setLastResult(null);
    const nameById = new Map(targets.map((o) => [o.id, o.name] as const));
    let results: BulkResult[] = [];
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/production-assets/orphans/bulk-reconcile`,
        {
          ids: ids,
          action: "hard_delete",
          confirm: true,
          reason: reason.trim(),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const message =
          json?.message || json?.error || `HTTP ${res.status}`;
        results = targets.map((o) => ({
          id: o.id,
          name: o.name,
          ok: false,
          message,
        }));
      } else {
        const perId: Array<{ id: string; ok: boolean; message?: string }> =
          Array.isArray(json?.results) ? json.results : [];
        results = perId.map((r) => ({
          id: r.id,
          name: nameById.get(r.id) ?? r.id,
          ok: !!r.ok,
          message: r.message,
        }));
      }
    } catch (err: any) {
      const message = err?.message || "Request failed";
      results = targets.map((o) => ({
        id: o.id,
        name: o.name,
        ok: false,
        message,
      }));
    }
    setBulkResults(results);
    setBulkResultsKind("hard_delete");
    setBulkDeleting(false);
    const succeededIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (!succeededIds.has(id)) next.add(id);
      return next;
    });
    await queryClient.invalidateQueries({ queryKey: [ORPHANS_URL] });
    await queryClient.invalidateQueries({
      queryKey: ["/api/admin/production-assets"],
    });
    await queryClient.invalidateQueries({ queryKey: [SWEEP_STATUS_URL] });
    await refetch();
    await refetchSweepStatus();
  }

  async function bulkRelink(opts?: {
    prefixRewrite?: { from: string; to: string };
    newStorageKeys?: Record<string, string>;
    reason?: string;
  }) {
    const ids = Array.from(selected);
    const targets = items.filter((o) => ids.includes(o.id));
    if (targets.length === 0) {
      alert("No orphan rows selected.");
      return;
    }
    const rewriting =
      !!opts?.prefixRewrite ||
      (opts?.newStorageKeys && Object.keys(opts.newStorageKeys).length > 0);
    const confirmMsg = rewriting
      ? `Re-link ${targets.length} orphan row${targets.length === 1 ? "" : "s"} ` +
        `to new storage keys?\n\n` +
        (opts?.prefixRewrite
          ? `Prefix rewrite:\n  from "${opts.prefixRewrite.from}"\n  to   "${opts.prefixRewrite.to}"\n\n`
          : "") +
        (opts?.newStorageKeys
          ? `Per-id overrides: ${Object.keys(opts.newStorageKeys).length}\n\n`
          : "") +
        `For every affected row, the server will verify the bytes at the new ` +
        `key match the row's sha256 + byte size, then atomically rewrite the ` +
        `storageKey and write an audit-log entry. Rows that don't match the ` +
        `rule (or whose new bytes fail verification) stay in the list.\n\n` +
        targets.map((o) => `• ${o.name}`).join("\n") +
        `\n\nProceed?`
      : `Re-link ${targets.length} orphan row${targets.length === 1 ? "" : "s"}?\n\n` +
        `The server will head-probe each one's storageKey. Rows whose bytes ` +
        `are present will be reported as ok; rows whose bytes are still ` +
        `missing will be reported as failed. No database rows are modified.\n\n` +
        targets.map((o) => `• ${o.name}`).join("\n") +
        `\n\nProceed?`;
    if (!confirm(confirmMsg)) return;

    setBulkRelinking(true);
    setBulkResults(null);
    setBulkResultsKind(null);
    setLastResult(null);
    const nameById = new Map(targets.map((o) => [o.id, o.name] as const));
    let results: BulkResult[] = [];
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/production-assets/orphans/bulk-reconcile`,
        {
          ids: ids,
          action: "relink_object",
          confirm: true,
          ...(opts?.reason ? { reason: opts.reason } : {}),
          ...(opts?.prefixRewrite
            ? { prefixRewrite: opts.prefixRewrite }
            : {}),
          ...(opts?.newStorageKeys
            ? { newStorageKeys: opts.newStorageKeys }
            : {}),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const message =
          json?.message || json?.error || `HTTP ${res.status}`;
        results = targets.map((o) => ({
          id: o.id,
          name: o.name,
          ok: false,
          message,
        }));
      } else {
        const perId: Array<{
          id: string;
          ok: boolean;
          message?: string;
          storageKeyUpdated?: boolean;
          oldStorageKey?: string;
          newStorageKey?: string;
        }> = Array.isArray(json?.results) ? json.results : [];
        results = perId.map((r) => ({
          id: r.id,
          name: nameById.get(r.id) ?? r.id,
          ok: !!r.ok,
          message: r.message,
          storageKeyUpdated: r.storageKeyUpdated,
          oldStorageKey: r.oldStorageKey,
          newStorageKey: r.newStorageKey,
        }));
      }
    } catch (err: any) {
      const message = err?.message || "Request failed";
      results = targets.map((o) => ({
        id: o.id,
        name: o.name,
        ok: false,
        message,
      }));
    }
    setBulkResults(results);
    setBulkResultsKind("relink_object");
    setBulkRelinking(false);
    const succeededIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (!succeededIds.has(id)) next.add(id);
      return next;
    });
    await queryClient.invalidateQueries({ queryKey: [ORPHANS_URL] });
    await queryClient.invalidateQueries({
      queryKey: ["/api/admin/production-assets"],
    });
    await refetch();
  }

  async function bulkRelinkWithPrefixRewrite() {
    const ids = Array.from(selected);
    const targets = items.filter((o) => ids.includes(o.id));
    if (targets.length === 0) {
      alert("No orphan rows selected.");
      return;
    }
    const sampleKeys = targets.slice(0, 5).map((o) => `  ${o.storageKey}`).join("\n");
    const fromRaw = prompt(
      `Rewrite the storageKey prefix for ${targets.length} selected row${targets.length === 1 ? "" : "s"}.\n\n` +
        `Enter the OLD prefix to match.\nSample selected keys:\n${sampleKeys}`,
      "",
    );
    if (fromRaw === null) return;
    const from = fromRaw;
    if (!from || from.length === 0) {
      alert("Old prefix is required.");
      return;
    }
    const matching = targets.filter((o) => o.storageKey.startsWith(from));
    if (matching.length === 0) {
      alert(
        `No selected row's storageKey starts with "${from}". Nothing to rewrite.`,
      );
      return;
    }
    const toRaw = prompt(
      `New prefix to replace "${from}" with.\n\n` +
        `${matching.length} of ${targets.length} selected row${targets.length === 1 ? "" : "s"} match this prefix.\n` +
        `Rows that don't match will be left alone.`,
      from,
    );
    if (toRaw === null) return;
    const to = toRaw;
    if (to === from) {
      alert("New prefix is identical to the old one. Nothing to rewrite.");
      return;
    }
    const reason = prompt(
      "Optional: reason recorded on every successful rewrite audit row.",
      "Object bytes restored under a new prefix.",
    );
    if (reason === null) return;
    await bulkRelink({
      prefixRewrite: { from, to },
      reason: reason.trim() || undefined,
    });
  }

  async function bulkRelinkWithJsonMap() {
    const ids = Array.from(selected);
    const targets = items.filter((o) => ids.includes(o.id));
    if (targets.length === 0) {
      alert("No orphan rows selected.");
      return;
    }
    const template: Record<string, string> = {};
    for (const o of targets) template[o.id] = o.storageKey;
    const raw = prompt(
      `Paste a JSON object mapping asset id → new storageKey.\n\n` +
        `Only entries whose id is in the current selection are sent. Empty\n` +
        `values are ignored. The server verifies sha256 + byte size before\n` +
        `rewriting each row.`,
      JSON.stringify(template, null, 2),
    );
    if (raw === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      alert(`Invalid JSON: ${err?.message || String(err)}`);
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      alert("JSON must be an object of { assetId: \"newStorageKey\" }.");
      return;
    }
    const selectedSet = new Set(ids);
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!selectedSet.has(k)) continue;
      if (typeof v !== "string") continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      map[k] = trimmed;
    }
    if (Object.keys(map).length === 0) {
      alert(
        "No usable id → newStorageKey entries found. Nothing was sent.",
      );
      return;
    }
    const reason = prompt(
      "Optional: reason recorded on every successful rewrite audit row.",
      "Object bytes restored under per-id paths.",
    );
    if (reason === null) return;
    await bulkRelink({
      newStorageKeys: map,
      reason: reason.trim() || undefined,
    });
  }

  return (
    <Card className="mb-6 border-amber-500/30" data-testid="card-orphan-reconcile">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Orphaned asset rows
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Archived rows whose object bytes are missing from storage. Use{" "}
              <strong>Hard-delete</strong> to permanently drop the row, or{" "}
              <strong>Re-link</strong> if the bytes have come back.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-400"
              data-testid="badge-orphan-count"
            >
              {items.length} orphan{items.length === 1 ? "" : "s"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-orphans"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sweepStatus &&
          (sweepStatus.flappingSnoozeActive ? (
            <div
              className="mb-3 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
              data-testid="banner-sweep-flapping-snoozed"
            >
              <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div
                  className="font-medium text-foreground"
                  data-testid="text-orphan-sweep-flapping-snoozed-title"
                >
                  Flapping banner snoozed
                </div>
                <div
                  className="mt-0.5"
                  data-testid="text-orphan-sweep-flapping-snoozed-detail"
                >
                  Founder paused this alert until{" "}
                  <strong
                    className="text-foreground"
                    data-testid="text-orphan-sweep-flapping-snoozed-until"
                  >
                    {sweepStatus.flappingSnoozeUntil
                      ? new Date(sweepStatus.flappingSnoozeUntil).toLocaleString()
                      : "—"}
                  </strong>
                  . The full warning will return automatically once the snooze
                  expires.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={unsnoozeFlapping}
                disabled={snoozeBusy}
                className="h-7 px-2 text-xs"
                data-testid="button-orphan-sweep-flapping-unsnooze"
              >
                {snoozeBusy ? "…" : "Unsnooze"}
              </Button>
            </div>
          ) : sweepStatus.flapping ? (
            <div
              className="mb-3 flex flex-wrap items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300"
              data-testid="banner-sweep-flapping"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1 min-w-[240px]">
                <div
                  className="font-medium text-amber-200"
                  data-testid="text-orphan-sweep-flapping-title"
                >
                  Sweep is flapping — consider raising the threshold
                </div>
                <div
                  className="mt-0.5 text-amber-300/80"
                  data-testid="text-orphan-sweep-flapping-detail"
                >
                  The orphan-sweep alert has auto-cleared{" "}
                  <strong data-testid="text-sweep-flapping-count">
                    {sweepStatus.flappingCount}
                  </strong>{" "}
                  time{sweepStatus.flappingCount === 1 ? "" : "s"} in the last{" "}
                  <span data-testid="text-sweep-flapping-window">
                    {formatWindowMs(sweepStatus.flappingWindowMs)}
                  </span>{" "}
                  (flapping threshold:{" "}
                  <span data-testid="text-sweep-flapping-threshold">
                    {sweepStatus.flappingThreshold}
                  </span>
                  ). The current alert threshold of {sweepStatus.threshold} may
                  be too aggressive.
                </div>
                <div
                  className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-amber-300/80"
                  data-testid="text-orphan-sweep-flapping-digest"
                >
                  <span data-testid="text-orphan-sweep-flapping-digest-last-sent">
                    Last digest:{" "}
                    {sweepStatus.flappingDigestLastSentAt
                      ? new Date(
                          sweepStatus.flappingDigestLastSentAt,
                        ).toLocaleString()
                      : "—"}
                  </span>
                  <span>·</span>
                  <span data-testid="text-orphan-sweep-flapping-digest-next-eligible">
                    Next eligible:{" "}
                    {sweepStatus.flappingDigestNextEligibleAt
                      ? new Date(
                          sweepStatus.flappingDigestNextEligibleAt,
                        ).toLocaleString()
                      : "—"}
                  </span>
                  <span>·</span>
                  <span>
                    Cadence:{" "}
                    {formatWindowMs(sweepStatus.flappingDigestIntervalMs)}
                  </span>
                  {snoozeIsActive && (
                    <Badge
                      variant="outline"
                      className="border-sky-500/40 text-sky-300"
                      data-testid="badge-orphan-sweep-flapping-digest-snoozed"
                    >
                      <BellOff className="mr-1 h-3 w-3" />
                      Snoozed until{" "}
                      {new Date(snoozeActiveUntilMs!).toLocaleString()}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-amber-300/70">
                  Snooze
                </span>
                {[1, 4, 12, 24].map((h) => (
                  <Button
                    key={h}
                    variant="outline"
                    size="sm"
                    onClick={() => snoozeFlapping(h)}
                    disabled={snoozeBusy}
                    className="h-7 px-2 text-xs border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                    data-testid={`button-orphan-sweep-flapping-snooze-${h}h`}
                  >
                    {h}h
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="mb-3 flex items-center gap-2 rounded border border-border bg-muted/10 p-2 text-[11px] text-muted-foreground"
              data-testid="banner-sweep-stable"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>
                Sweep stable —{" "}
                <span data-testid="text-sweep-stable-count">
                  {sweepStatus.flappingCount}
                </span>{" "}
                auto-clear{sweepStatus.flappingCount === 1 ? "" : "s"} in the
                last {formatWindowMs(sweepStatus.flappingWindowMs)} (flapping
                threshold: {sweepStatus.flappingThreshold}).
              </span>
              <Activity className="ml-auto h-3.5 w-3.5 text-muted-foreground/60" />
            </div>
          ))}
        {snoozeMsg && (
          <div
            className="mb-3 rounded border border-border bg-muted/20 p-2 text-[11px] text-muted-foreground"
            data-testid="text-orphan-sweep-flapping-snooze-msg"
          >
            {snoozeMsg}
          </div>
        )}
        {(() => {
          const entries = snoozeLogQuery.data?.entries ?? [];
          if (entries.length === 0) return null;
          const visible = entries.slice(0, 8);
          return (
            <div
              className="mb-3 rounded border border-border bg-muted/10 p-2 text-[11px]"
              data-testid="card-orphan-sweep-flapping-snooze-log"
            >
              <div className="mb-1.5 flex items-center justify-between text-muted-foreground">
                <span className="uppercase tracking-wider text-[10px]">
                  Flapping snooze log
                </span>
                <span
                  className="text-[10px]"
                  data-testid="text-flapping-snooze-log-count"
                >
                  {entries.length} entr{entries.length === 1 ? "y" : "ies"}
                </span>
              </div>
              <div className="space-y-1">
                {visible.map((e) => {
                  const isSet = e.action === "set";
                  return (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-baseline gap-2 border-t border-border/40 pt-1 first:border-t-0 first:pt-0"
                      data-testid={`row-flapping-snooze-log-${e.id}`}
                    >
                      <Badge
                        variant="outline"
                        className="h-4 px-1 text-[10px] uppercase"
                        data-testid={`badge-flapping-snooze-action-${e.id}`}
                      >
                        {e.action}
                      </Badge>
                      <span
                        className="text-muted-foreground"
                        data-testid={`text-flapping-snooze-occurred-${e.id}`}
                      >
                        {new Date(e.occurredAt).toLocaleString()}
                      </span>
                      {e.snoozeUntil && (
                        <span
                          className="text-muted-foreground/80"
                          data-testid={`text-flapping-snooze-until-${e.id}`}
                        >
                          until {new Date(e.snoozeUntil).toLocaleString()}
                        </span>
                      )}
                      {e.updatedBy && (
                        <span
                          className="text-muted-foreground/80"
                          data-testid={`text-flapping-snooze-actor-${e.id}`}
                        >
                          by {e.updatedBy}
                        </span>
                      )}
                      <span
                        className={
                          e.suppressedCount > 0
                            ? "ml-auto text-amber-300"
                            : "ml-auto text-muted-foreground/70"
                        }
                        data-testid={`text-flapping-snooze-suppressed-${e.id}`}
                        title={
                          isSet
                            ? "Alerts swallowed so far in this active window"
                            : "Final tally of alerts swallowed by this window"
                        }
                      >
                        {e.suppressedCount} swallowed
                        {isSet && " (so far)"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        <div
          className="mb-3 rounded border border-border bg-muted/10"
          data-testid="panel-orphan-sweep-flapping-snooze-log"
        >
          <button
            type="button"
            onClick={() => setSnoozeLogOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] text-muted-foreground hover:bg-muted/20"
            data-testid="button-orphan-sweep-flapping-snooze-log-toggle"
            aria-expanded={snoozeLogOpen}
          >
            <span className="flex items-center gap-1.5">
              {snoozeLogOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <span className="font-medium text-foreground">
                Recent snooze actions
              </span>
              <span data-testid="text-orphan-sweep-flapping-snooze-log-count">
                ({snoozeLogTotal})
              </span>
            </span>
            <span className="text-[10px] uppercase tracking-wider">
              {snoozeLogQuery.isFetching ? "refreshing…" : "audit trail"}
            </span>
          </button>
          {snoozeLogOpen && (
            <div className="border-t border-border px-3 py-2 text-[11px]">
              <div
                className="mb-2 grid gap-2 sm:grid-cols-4"
                data-testid="panel-orphan-sweep-flapping-snooze-log-filters"
              >
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    Actor
                  </label>
                  <Input
                    value={snoozeLogActorDraft}
                    onChange={(e) => setSnoozeLogActorDraft(e.target.value)}
                    placeholder="user id / email"
                    className="h-7 text-[11px]"
                    data-testid="input-orphan-sweep-flapping-snooze-log-actor"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    From
                  </label>
                  <Input
                    type="datetime-local"
                    value={snoozeLogFromDraft}
                    onChange={(e) => setSnoozeLogFromDraft(e.target.value)}
                    className="h-7 text-[11px]"
                    data-testid="input-orphan-sweep-flapping-snooze-log-from"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    To
                  </label>
                  <Input
                    type="datetime-local"
                    value={snoozeLogToDraft}
                    onChange={(e) => setSnoozeLogToDraft(e.target.value)}
                    className="h-7 text-[11px]"
                    data-testid="input-orphan-sweep-flapping-snooze-log-to"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={applySnoozeLogFilters}
                    data-testid="button-orphan-sweep-flapping-snooze-log-apply"
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={clearSnoozeLogFilters}
                    data-testid="button-orphan-sweep-flapping-snooze-log-clear"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              {snoozeLogFilterErr && (
                <div
                  className="mb-2 text-destructive"
                  data-testid="text-orphan-sweep-flapping-snooze-log-filter-error"
                >
                  {snoozeLogFilterErr}
                </div>
              )}
              {snoozeLogQuery.isLoading ? (
                <div
                  className="py-2 text-muted-foreground"
                  data-testid="text-orphan-sweep-flapping-snooze-log-loading"
                >
                  Loading snooze history…
                </div>
              ) : snoozeLogQuery.error ? (
                <div
                  className="py-2 text-destructive"
                  data-testid="text-orphan-sweep-flapping-snooze-log-error"
                >
                  Failed to load snooze history:{" "}
                  {(snoozeLogQuery.error as Error).message}
                </div>
              ) : snoozeLogEntries.length === 0 ? (
                <div
                  className="py-2 text-muted-foreground"
                  data-testid="text-orphan-sweep-flapping-snooze-log-empty"
                >
                  No snooze actions recorded yet.
                </div>
              ) : (
                <ul className="space-y-1">
                  {snoozeLogEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center gap-2 border-b border-border/40 py-1 last:border-b-0"
                      data-testid={`row-orphan-sweep-flapping-snooze-log-${entry.id}`}
                    >
                      <Badge
                        variant="outline"
                        className={
                          entry.action === "snooze"
                            ? "border-amber-500/40 text-amber-300"
                            : entry.action === "unsnooze"
                              ? "border-emerald-500/40 text-emerald-300"
                              : "border-border text-muted-foreground"
                        }
                        data-testid={`badge-orphan-sweep-flapping-snooze-log-action-${entry.id}`}
                      >
                        {entry.action}
                      </Badge>
                      <span
                        className="text-foreground"
                        data-testid={`text-orphan-sweep-flapping-snooze-log-occurred-${entry.id}`}
                      >
                        {new Date(entry.occurredAt).toLocaleString()}
                      </span>
                      {entry.snoozeUntil && (
                        <span
                          className="text-muted-foreground"
                          data-testid={`text-orphan-sweep-flapping-snooze-log-until-${entry.id}`}
                        >
                          → until{" "}
                          {new Date(entry.snoozeUntil).toLocaleString()}
                        </span>
                      )}
                      <span
                        className="text-muted-foreground"
                        data-testid={`text-orphan-sweep-flapping-snooze-log-actor-${entry.id}`}
                      >
                        by {entry.updatedBy ?? "—"}
                      </span>
                      {entry.reason && (
                        <span
                          className="text-muted-foreground"
                          title={entry.reason}
                        >
                          — {entry.reason}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {snoozeLogTotal > 0 && (
                <div
                  className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-muted-foreground"
                  data-testid="panel-orphan-sweep-flapping-snooze-log-pagination"
                >
                  <span
                    data-testid="text-orphan-sweep-flapping-snooze-log-range"
                  >
                    Showing {snoozeLogPageStart}–{snoozeLogPageEnd} of{" "}
                    {snoozeLogTotal}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px]"
                      disabled={!snoozeLogHasPrev || snoozeLogQuery.isFetching}
                      onClick={() =>
                        setSnoozeLogPage((p) => Math.max(0, p - 1))
                      }
                      data-testid="button-orphan-sweep-flapping-snooze-log-prev"
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px]"
                      disabled={!snoozeLogHasNext || snoozeLogQuery.isFetching}
                      onClick={() => setSnoozeLogPage((p) => p + 1)}
                      data-testid="button-orphan-sweep-flapping-snooze-log-next"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div
          className="mb-4 grid gap-3 md:grid-cols-3 text-[11px] border border-border rounded-md p-3 bg-muted/20"
          data-testid="card-orphan-sweep-status"
        >
          <div>
            <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
              Last scheduled scan
            </div>
            <div
              className="mt-1"
              data-testid="text-orphan-sweep-last-scan"
            >
              {sweepStatus?.lastScanAt
                ? `${new Date(sweepStatus.lastScanAt).toLocaleString()} — ${
                    sweepStatus.lastOrphanCount ?? 0
                  } orphan${sweepStatus.lastOrphanCount === 1 ? "" : "s"}`
                : "Background sweep has not run yet."}
            </div>
            {sweepStatus?.nextScanAt && (
              <div
                className="text-muted-foreground text-[10px] mt-0.5"
                data-testid="text-orphan-sweep-next-scan"
              >
                Next: {new Date(sweepStatus.nextScanAt).toLocaleString()}
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
              Alert threshold
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={thresholdDraft}
                onChange={(e) => setThresholdDraft(e.target.value)}
                className="h-7 text-xs w-24"
                data-testid="input-orphan-sweep-threshold"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveThreshold}
                disabled={
                  savingThreshold ||
                  thresholdDraft === "" ||
                  Number(thresholdDraft) === sweepStatus?.threshold
                }
                data-testid="button-orphan-sweep-threshold-save"
                className="h-7 px-2 text-xs"
              >
                {savingThreshold ? "Saving…" : "Save"}
              </Button>
            </div>
            <div className="text-muted-foreground text-[10px] mt-1">
              Founders are alerted when orphan count exceeds this value.
            </div>
            {thresholdMsg && (
              <div
                className="text-[10px] mt-1 text-amber-400"
                data-testid="text-orphan-sweep-threshold-msg"
              >
                {thresholdMsg}
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
              Current state
            </div>
            <div
              className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] ${
                sweepStatus?.wasAboveThreshold
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              }`}
              data-testid="badge-orphan-sweep-state"
            >
              {sweepStatus?.wasAboveThreshold
                ? "Above threshold — alert active"
                : "At or below threshold"}
            </div>
            {sweepStatus?.lastAutoResolvedAt && (
              <div
                className="text-muted-foreground text-[10px] mt-1"
                data-testid="text-orphan-sweep-last-auto-resolved"
              >
                Auto-cleared {sweepStatus.lastAutoResolvedCount ?? 0} alert
                {sweepStatus.lastAutoResolvedCount === 1 ? "" : "s"} at{" "}
                {new Date(sweepStatus.lastAutoResolvedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        <div
          className="mb-4 grid gap-3 md:grid-cols-2 text-[11px] border border-border rounded-md p-3 bg-muted/20"
          data-testid="card-orphan-sweep-flapping-config"
        >
          <div>
            <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
              Flapping threshold
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={2}
                max={1000}
                step={1}
                value={flapThresholdDraft}
                onChange={(e) => setFlapThresholdDraft(e.target.value)}
                className="h-7 text-xs w-24"
                data-testid="input-orphan-sweep-flapping-threshold"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveFlapThreshold}
                disabled={
                  savingFlapThreshold ||
                  flapThresholdDraft === "" ||
                  Number(flapThresholdDraft) ===
                    sweepStatus?.flappingThreshold
                }
                data-testid="button-orphan-sweep-flapping-threshold-save"
                className="h-7 px-2 text-xs"
              >
                {savingFlapThreshold ? "Saving…" : "Save"}
              </Button>
              <span
                className="text-muted-foreground text-[10px]"
                data-testid="text-orphan-sweep-flapping-count"
              >
                current: {sweepStatus?.flappingCount ?? 0} auto-clear
                {sweepStatus?.flappingCount === 1 ? "" : "s"} in window
              </span>
            </div>
            <div className="text-muted-foreground text-[10px] mt-1">
              Auto-clears within the window required to mark the sweep as
              flapping. Bounds: 2..1000.
            </div>
            {flapThresholdMsg && (
              <div
                className="text-[10px] mt-1 text-amber-400"
                data-testid="text-orphan-sweep-flapping-threshold-msg"
              >
                {flapThresholdMsg}
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
              Flapping window (hours)
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0.02}
                max={2160}
                step={0.5}
                value={flapWindowDraft}
                onChange={(e) => setFlapWindowDraft(e.target.value)}
                className="h-7 text-xs w-24"
                data-testid="input-orphan-sweep-flapping-window-hours"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveFlapWindow}
                disabled={
                  savingFlapWindow ||
                  flapWindowDraft === "" ||
                  (sweepStatus
                    ? Math.round(Number(flapWindowDraft) * 60 * 60 * 1000) ===
                      sweepStatus.flappingWindowMs
                    : false)
                }
                data-testid="button-orphan-sweep-flapping-window-save"
                className="h-7 px-2 text-xs"
              >
                {savingFlapWindow ? "Saving…" : "Save"}
              </Button>
              <span
                className="text-muted-foreground text-[10px]"
                data-testid="text-orphan-sweep-flapping-window-current"
              >
                current:{" "}
                {sweepStatus
                  ? (sweepStatus.flappingWindowMs / (60 * 60 * 1000)).toFixed(2)
                  : "—"}
                h
              </span>
            </div>
            <div className="text-muted-foreground text-[10px] mt-1">
              How far back auto-clears are counted. Bounds: 1 minute (~0.017h)
              .. 90 days (2160h).
            </div>
            {flapWindowMsg && (
              <div
                className="text-[10px] mt-1 text-amber-400"
                data-testid="text-orphan-sweep-flapping-window-msg"
              >
                {flapWindowMsg}
              </div>
            )}
          </div>
        </div>

        <div
          className="mb-4 rounded-md border border-border bg-muted/20 p-3 text-[11px] space-y-3"
          data-testid="card-orphan-sweep-flapping-digest-snooze"
        >
          <div className="flex flex-wrap items-center gap-2">
            <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="uppercase tracking-wider text-muted-foreground text-[10px]">
              Flapping-digest snooze
            </span>
            {snoozeIsActive ? (
              <Badge
                variant="outline"
                className="border-sky-500/40 text-sky-300"
                data-testid="badge-flapping-digest-snooze-active"
              >
                Active — until{" "}
                {new Date(snoozeActiveUntilMs!).toLocaleString()}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-400"
                data-testid="badge-flapping-digest-snooze-inactive"
              >
                Not snoozed
              </Badge>
            )}
            {sweepStatus && (
              <span
                className="ml-auto flex items-center gap-1 text-muted-foreground"
                data-testid="text-flapping-digest-cadence"
              >
                <Clock className="h-3 w-3" />
                Cadence:{" "}
                {formatWindowMs(sweepStatus.flappingDigestIntervalMs)}
              </span>
            )}
          </div>
          <div
            className="grid gap-2 md:grid-cols-2 text-muted-foreground"
            data-testid="text-flapping-digest-receipts"
          >
            <div>
              Last digest sent:{" "}
              <span
                className="text-foreground"
                data-testid="text-flapping-digest-last-sent"
              >
                {sweepStatus?.flappingDigestLastSentAt
                  ? new Date(
                      sweepStatus.flappingDigestLastSentAt,
                    ).toLocaleString()
                  : "—"}
              </span>
            </div>
            <div>
              Next eligible at:{" "}
              <span
                className="text-foreground"
                data-testid="text-flapping-digest-next-eligible"
              >
                {sweepStatus?.flappingDigestNextEligibleAt
                  ? new Date(
                      sweepStatus.flappingDigestNextEligibleAt,
                    ).toLocaleString()
                  : "—"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Snooze for:</span>
            {[
              { label: "1h", ms: 60 * 60 * 1000 },
              { label: "4h", ms: 4 * 60 * 60 * 1000 },
              { label: "24h", ms: 24 * 60 * 60 * 1000 },
              { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
            ].map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => snoozeFor(p.ms)}
                disabled={snoozeMutation.isPending}
                data-testid={`button-flapping-digest-snooze-${p.label}`}
              >
                {p.label}
              </Button>
            ))}
            <Input
              type="datetime-local"
              value={snoozeUntilDraft}
              onChange={(e) => setSnoozeUntilDraft(e.target.value)}
              className="h-7 text-xs w-56"
              data-testid="input-flapping-digest-snooze-until"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={snoozeUntilCustom}
              disabled={snoozeMutation.isPending || !snoozeUntilDraft}
              data-testid="button-flapping-digest-snooze-custom"
            >
              Snooze until
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={clearSnooze}
              disabled={snoozeMutation.isPending || !snoozeIsActive}
              data-testid="button-flapping-digest-unsnooze"
            >
              Unsnooze
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Pauses the recurring flapping-digest email. Bounded to 90 days
            (server cap). Audit history below mirrors the omni-channel-audience
            snooze log.
          </div>
          {digestSnoozeMsg && (
            <div
              className="text-[10px] text-amber-400"
              data-testid="text-flapping-digest-snooze-msg"
            >
              {digestSnoozeMsg}
            </div>
          )}
          <div data-testid="card-flapping-digest-snooze-history">
            <div className="uppercase tracking-wider text-muted-foreground text-[10px] mb-1">
              Snooze history (newest first, last 10)
            </div>
            {snoozeQuery.isLoading ? (
              <div
                className="text-muted-foreground text-[10px]"
                data-testid="text-flapping-digest-snooze-history-loading"
              >
                Loading…
              </div>
            ) : snoozeHistory.length === 0 ? (
              <div
                className="text-muted-foreground text-[10px]"
                data-testid="text-flapping-digest-snooze-history-empty"
              >
                No snooze actions recorded yet.
              </div>
            ) : (
              <ul className="space-y-1">
                {snoozeHistory.slice(0, 10).map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center gap-2 text-[10px]"
                    data-testid={`row-flapping-digest-snooze-history-${h.id}`}
                  >
                    <Badge
                      variant="outline"
                      className={
                        h.action === "set"
                          ? "border-sky-500/40 text-sky-300"
                          : h.action === "cleared"
                            ? "border-emerald-500/40 text-emerald-400"
                            : "border-muted-foreground/40 text-muted-foreground"
                      }
                    >
                      {h.action}
                    </Badge>
                    <span className="text-foreground">
                      {new Date(h.occurredAt).toLocaleString()}
                    </span>
                    {h.snoozeUntil && (
                      <span className="text-muted-foreground">
                        → until {new Date(h.snoozeUntil).toLocaleString()}
                      </span>
                    )}
                    {h.updatedBy && (
                      <span className="text-muted-foreground">
                        · by{" "}
                        <code className="font-mono">{h.updatedBy}</code>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div
          className="mb-4 border border-border rounded-md p-3 bg-muted/20 text-[11px]"
          data-testid="card-orphan-sweep-flapping-config-history"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
              Recent flapping-config changes
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => flapHistoryQuery.refetch()}
              disabled={flapHistoryQuery.isFetching}
              data-testid="button-orphan-sweep-flapping-config-history-refresh"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              {flapHistoryQuery.isFetching ? "Loading…" : "Refresh"}
            </Button>
            {/* Task #888 — CSV export of the active flapping-config
                history filter set, mirroring the sweep-threshold card. */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={exportFlapHistoryCsv}
              disabled={flapHistoryCsvBusy}
              data-testid="button-orphan-sweep-flapping-config-history-export-csv"
            >
              {flapHistoryCsvBusy ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
          <div
            className="mb-2 flex flex-wrap items-end gap-2"
            data-testid="flap-config-history-filters"
          >
            <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
              <span>From</span>
              <Input
                type="datetime-local"
                value={flapHistoryFilterDraft.from}
                onChange={(e) =>
                  setFlapHistoryFilterDraft((f) => ({
                    ...f,
                    from: e.target.value,
                  }))
                }
                className="h-7 text-[11px] w-[180px]"
                data-testid="input-flap-config-history-from"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
              <span>To</span>
              <Input
                type="datetime-local"
                value={flapHistoryFilterDraft.to}
                onChange={(e) =>
                  setFlapHistoryFilterDraft((f) => ({
                    ...f,
                    to: e.target.value,
                  }))
                }
                className="h-7 text-[11px] w-[180px]"
                data-testid="input-flap-config-history-to"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
              <span>Actor user ID</span>
              <Input
                type="text"
                value={flapHistoryFilterDraft.actorUserId}
                onChange={(e) =>
                  setFlapHistoryFilterDraft((f) => ({
                    ...f,
                    actorUserId: e.target.value,
                  }))
                }
                placeholder="e.g. usr_abc123"
                className="h-7 text-[11px] w-[180px]"
                data-testid="input-flap-config-history-actor"
              />
            </label>
            <Button
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={applyFlapHistoryFilters}
              data-testid="button-flap-config-history-apply"
            >
              Apply filters
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={clearFlapHistoryFilters}
              data-testid="button-flap-config-history-clear"
            >
              Clear
            </Button>
          </div>
          {flapHistoryFilterMsg && (
            <div
              className="mb-2 text-destructive text-[10px]"
              data-testid="text-flap-config-history-filter-msg"
            >
              {flapHistoryFilterMsg}
            </div>
          )}
          {flapHistoryQuery.isLoading ? (
            <div
              className="text-muted-foreground text-[10px]"
              data-testid="text-flap-config-history-loading"
            >
              Loading change history…
            </div>
          ) : flapHistoryQuery.error ? (
            <div
              className="text-destructive text-[10px]"
              data-testid="text-flap-config-history-error"
            >
              Failed to load history:{" "}
              {(flapHistoryQuery.error as Error).message}
            </div>
          ) : (flapHistoryQuery.data?.items ?? []).length === 0 ? (
            <div
              className="text-muted-foreground text-[10px]"
              data-testid="text-flap-config-history-empty"
            >
              No flapping-config changes recorded yet.
            </div>
          ) : (
            <ul
              className="space-y-1"
              data-testid="list-flap-config-history"
            >
              {(flapHistoryQuery.data?.items ?? []).map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2"
                  data-testid={`flap-config-history-row-${row.id}`}
                >
                  <span
                    className="text-muted-foreground text-[10px] tabular-nums"
                    data-testid={`text-flap-config-history-time-${row.id}`}
                    title={`${row.changedAt} (${flapDailyStatsTimeZone})`}
                  >
                    {formatInTimeZone(row.changedAt, flapDailyStatsTimeZone)}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    data-testid={`badge-flap-config-history-setting-${row.id}`}
                  >
                    {labelFlapConfigSetting(row.setting)}
                  </Badge>
                  <span
                    className="text-[10px]"
                    data-testid={`text-flap-config-history-change-${row.id}`}
                  >
                    <span className="text-muted-foreground">
                      {formatFlapConfigValue(row.setting, row.previousValue)}
                    </span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-medium">
                      {formatFlapConfigValue(row.setting, row.newValue)}
                    </span>
                  </span>
                  <span
                    className="text-muted-foreground text-[10px]"
                    data-testid={`text-flap-config-history-actor-${row.id}`}
                  >
                    by {row.actorUserId ?? "system"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(() => {
            const total = flapHistoryQuery.data?.total ?? 0;
            const items = flapHistoryQuery.data?.items ?? [];
            if (total === 0) return null;
            const start = flapHistoryPage * FLAP_HISTORY_PAGE_SIZE + 1;
            const end =
              flapHistoryPage * FLAP_HISTORY_PAGE_SIZE + items.length;
            const hasNext = end < total;
            const hasPrev = flapHistoryPage > 0;
            return (
              <div
                className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"
                data-testid="flap-config-history-pagination"
              >
                <span data-testid="text-flap-config-history-range">
                  Showing {start}–{end} of {total}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      setFlapHistoryPage((p) => Math.max(0, p - 1))
                    }
                    disabled={!hasPrev || flapHistoryQuery.isFetching}
                    data-testid="button-flap-config-history-prev"
                  >
                    Prev
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setFlapHistoryPage((p) => p + 1)}
                    disabled={!hasNext || flapHistoryQuery.isFetching}
                    data-testid="button-flap-config-history-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>

        <div
          className="mb-4 border border-border rounded-md p-3 bg-muted/20 text-[11px]"
          data-testid="card-flap-config-history-audit"
        >
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
              Flapping config change history
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>Actor</span>
                <Input
                  type="text"
                  value={flapAuditActorDraft}
                  onChange={(e) => setFlapAuditActorDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyFlapAuditActor();
                    }
                  }}
                  placeholder="any actor"
                  className="h-6 text-[10px] w-[140px]"
                  data-testid="input-flap-config-history-audit-actor"
                />
              </label>
              <Button
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={applyFlapAuditActor}
                disabled={
                  flapAuditActorDraft.trim() === flapAuditActor ||
                  flapAuditQuery.isFetching
                }
                data-testid="button-flap-config-history-audit-actor-apply"
              >
                Apply
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={clearFlapAuditActor}
                disabled={!flapAuditActor && !flapAuditActorDraft}
                data-testid="button-flap-config-history-audit-actor-clear"
              >
                Any actor
              </Button>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>Limit</span>
                <select
                  value={flapAuditLimit}
                  onChange={(e) =>
                    setFlapAuditLimit(
                      Number(e.target.value) as FlapAuditLimit,
                    )
                  }
                  className="h-6 rounded border border-border bg-background px-1 text-[10px]"
                  data-testid="select-flap-config-history-audit-limit"
                >
                  {FLAP_AUDIT_LIMIT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => flapAuditQuery.refetch()}
                disabled={flapAuditQuery.isFetching}
                data-testid="button-flap-config-history-audit-refresh"
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                {flapAuditQuery.isFetching ? "Loading…" : "Refresh"}
              </Button>
            </div>
          </div>
          {flapAuditActor && (
            <div
              className="mb-2 text-[10px] text-muted-foreground"
              data-testid="text-flap-config-history-audit-actor-filter"
            >
              Filtering by actor{" "}
              <code className="font-mono">{flapAuditActor}</code>
            </div>
          )}
          {/* Task #851 — Daily change-counts sparkline.
              Task #858 — Alert/digest markers overlaid on the same axis. */}
          {(() => {
            const data = flapDailyStatsQuery.data;
            const buckets = data?.buckets ?? [];
            const maxCount = buckets.reduce(
              (m, b) => (b.count > m ? b.count : m),
              0,
            );
            const alertData = flapAlertDailyStatsQuery.data;
            const alertBuckets = alertData?.buckets ?? [];
            const alertByDay = new Map<string, FlapAlertDailyBucket>();
            for (const a of alertBuckets) alertByDay.set(a.day, a);
            const maxAlertTotal = alertBuckets.reduce(
              (m, b) => (b.total > m ? b.total : m),
              0,
            );
            return (
              <div
                className="mb-3 border border-border/60 rounded-md p-2 bg-background/40"
                data-testid="card-flap-config-history-daily-stats"
              >
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
                    Changes per day
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>Window</span>
                      <select
                        value={flapDailyStatsWindow}
                        onChange={(e) =>
                          setFlapDailyStatsWindow(
                            Number(e.target.value) as FlapDailyStatsWindow,
                          )
                        }
                        className="h-6 rounded border border-border bg-background px-1 text-[10px]"
                        data-testid="select-flap-config-history-daily-stats-window"
                      >
                        {FLAP_DAILY_STATS_WINDOW_OPTIONS.map((d) => (
                          <option key={d} value={d}>
                            {`${d}d`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span title="Bucket each change by the calendar day in this timezone">
                        TZ
                      </span>
                      <select
                        value={flapDailyStatsTimeZone}
                        onChange={(e) =>
                          setFlapDailyStatsTimeZone(e.target.value)
                        }
                        className="h-6 rounded border border-border bg-background px-1 text-[10px] max-w-[180px]"
                        data-testid="select-flap-config-history-daily-stats-timezone"
                        title={`Browser: ${browserTimeZone}`}
                      >
                        {flapDailyStatsTimeZoneOptions.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz === browserTimeZone ? `${tz} (browser)` : tz}
                          </option>
                        ))}
                      </select>
                      {flapDailyStatsTimeZone !== browserTimeZone && (
                        <button
                          type="button"
                          className="text-[10px] underline text-muted-foreground hover:text-foreground"
                          onClick={() => resetFlapDailyStatsTimeZone()}
                          data-testid="button-flap-config-history-daily-stats-timezone-reset"
                        >
                          reset
                        </button>
                      )}
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        flapDailyStatsQuery.refetch();
                        flapAlertDailyStatsQuery.refetch();
                      }}
                      disabled={
                        flapDailyStatsQuery.isFetching ||
                        flapAlertDailyStatsQuery.isFetching
                      }
                      data-testid="button-flap-config-history-daily-stats-refresh"
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      {flapDailyStatsQuery.isFetching ||
                      flapAlertDailyStatsQuery.isFetching
                        ? "Loading…"
                        : "Refresh"}
                    </Button>
                  </div>
                </div>
                {flapDailyStatsQuery.isLoading ? (
                  <div
                    className="text-muted-foreground text-[10px]"
                    data-testid="text-flap-config-history-daily-stats-loading"
                  >
                    Loading daily stats…
                  </div>
                ) : flapDailyStatsQuery.error ? (
                  <div
                    className="text-destructive text-[10px]"
                    data-testid="text-flap-config-history-daily-stats-error"
                  >
                    Failed to load daily stats:{" "}
                    {(flapDailyStatsQuery.error as Error).message}
                  </div>
                ) : data?.queryFailed ? (
                  // Task #871 — server-side aggregation SQL threw. Render a
                  // visible error instead of the all-zero fallback bars so a
                  // regression like the Task #865 GROUP BY bug can't hide as
                  // "quiet" data.
                  <div
                    className="text-destructive text-[10px] border border-destructive/40 rounded-sm p-2 bg-destructive/5"
                    data-testid="text-flap-config-history-daily-stats-query-failed"
                    data-query-failed="true"
                    data-error-reason={data?.errorReason ?? ""}
                    role="alert"
                  >
                    Daily-stats query failed on the server. Bars are hidden
                    because the underlying SQL threw — this is NOT the same
                    as "no changes in this window". Reason:{" "}
                    {data?.errorReason ?? "unknown"}
                  </div>
                ) : buckets.length === 0 ? (
                  <div
                    className="text-muted-foreground text-[10px]"
                    data-testid="text-flap-config-history-daily-stats-empty"
                  >
                    No data.
                  </div>
                ) : (
                  <>
                    <div
                      className="flex items-end gap-[2px] h-12"
                      data-testid="list-flap-config-history-daily-stats"
                      role="img"
                      aria-label={`Flapping config changes per day for the last ${flapDailyStatsWindow} days (${data?.timeZone ?? flapDailyStatsTimeZone})`}
                    >
                      {buckets.map((b) => {
                        const ratio =
                          maxCount > 0 ? b.count / maxCount : 0;
                        const heightPct =
                          b.count > 0
                            ? Math.max(8, Math.round(ratio * 100))
                            : 0;
                        const tooltip = `${b.day} (${data?.timeZone ?? flapDailyStatsTimeZone}): ${b.count} ${
                          b.count === 1 ? "change" : "changes"
                        }`;
                        return (
                          <div
                            key={b.day}
                            className="flex-1 min-w-[3px] flex items-end h-full"
                            data-testid={`flap-config-history-daily-stats-bar-${b.day}`}
                            data-day={b.day}
                            data-count={b.count}
                            title={tooltip}
                            aria-label={tooltip}
                          >
                            <div
                              className={
                                b.count > 0
                                  ? "w-full bg-primary/70 rounded-sm"
                                  : "w-full bg-muted-foreground/20 rounded-sm h-[2px]"
                              }
                              style={
                                b.count > 0
                                  ? { height: `${heightPct}%` }
                                  : undefined
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                    {/* Task #858 — overlay row of alert/digest markers on the
                        same per-day axis. Bars in this row use the orange
                        destructive palette so they are visually distinct
                        from the primary "changes" bars above. */}
                    <div
                      className="mt-[2px] flex items-end gap-[2px] h-4"
                      data-testid="list-flap-alert-daily-stats"
                      role="img"
                      aria-label={`Flapping alerts and digests per day for the last ${flapDailyStatsWindow} days`}
                    >
                      {buckets.map((b) => {
                        const a = alertByDay.get(b.day);
                        const alertCount = a?.alertCount ?? 0;
                        const digestCount = a?.digestCount ?? 0;
                        const total = a?.total ?? 0;
                        const ratio =
                          maxAlertTotal > 0 ? total / maxAlertTotal : 0;
                        const heightPct =
                          total > 0
                            ? Math.max(20, Math.round(ratio * 100))
                            : 0;
                        const parts: string[] = [];
                        if (alertCount > 0) {
                          parts.push(
                            `${alertCount} alert${alertCount === 1 ? "" : "s"}`,
                          );
                        }
                        if (digestCount > 0) {
                          parts.push(
                            `${digestCount} digest${digestCount === 1 ? "" : "s"}`,
                          );
                        }
                        const tooltip =
                          total > 0
                            ? `${b.day}: ${parts.join(" + ")} (click to view rows)`
                            : `${b.day}: no alerts`;
                        const isSelected = selectedAlertDay === b.day;
                        if (total > 0) {
                          // Task #861 — clickable marker. Opens the
                          // per-day detail card below the chart.
                          return (
                            <button
                              type="button"
                              key={`alert-${b.day}`}
                              className={`flex-1 min-w-[3px] flex items-end h-full p-0 bg-transparent border-0 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm ${
                                isSelected ? "ring-1 ring-ring" : ""
                              }`}
                              data-testid={`button-flap-alert-daily-stats-bar-${b.day}`}
                              data-day={b.day}
                              data-alert-count={alertCount}
                              data-digest-count={digestCount}
                              data-total={total}
                              data-selected={isSelected ? "true" : "false"}
                              title={tooltip}
                              aria-label={tooltip}
                              aria-pressed={isSelected}
                              onClick={() =>
                                setSelectedAlertDay((prev) =>
                                  prev === b.day ? null : b.day,
                                )
                              }
                            >
                              <div
                                className={
                                  isSelected
                                    ? "w-full bg-destructive rounded-sm"
                                    : "w-full bg-destructive/70 hover:bg-destructive rounded-sm"
                                }
                                style={{ height: `${heightPct}%` }}
                              />
                            </button>
                          );
                        }
                        return (
                          <div
                            key={`alert-${b.day}`}
                            className="flex-1 min-w-[3px] flex items-end h-full"
                            data-testid={`flap-alert-daily-stats-bar-${b.day}`}
                            data-day={b.day}
                            data-alert-count={alertCount}
                            data-digest-count={digestCount}
                            data-total={total}
                            title={tooltip}
                            aria-label={tooltip}
                          >
                            <div className="w-full" />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums gap-2 flex-wrap">
                      <span
                        data-testid="text-flap-config-history-daily-stats-range"
                      >
                        {buckets[0]?.day} → {buckets[buckets.length - 1]?.day}{" "}
                        <span
                          className="text-muted-foreground/80"
                          data-testid="text-flap-config-history-daily-stats-timezone"
                        >
                          ({data?.timeZone ?? flapDailyStatsTimeZone})
                        </span>
                      </span>
                      <span
                        data-testid="text-flap-config-history-daily-stats-total"
                      >
                        {data?.totalCount ?? 0}{" "}
                        {data?.totalCount === 1 ? "change" : "changes"} · peak{" "}
                        {maxCount}/day
                      </span>
                    </div>
                    <div className="mt-[2px] flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-sm bg-destructive/70" />
                        <span>Alerts + digests</span>
                      </span>
                      <span
                        data-testid="text-flap-alert-daily-stats-total"
                      >
                        {flapAlertDailyStatsQuery.isLoading
                          ? "Loading alerts…"
                          : flapAlertDailyStatsQuery.error
                          ? `Alert overlay error: ${
                              (flapAlertDailyStatsQuery.error as Error).message
                            }`
                          : `${alertData?.totalAlertCount ?? 0} alert${
                              (alertData?.totalAlertCount ?? 0) === 1
                                ? ""
                                : "s"
                            } · ${alertData?.totalDigestCount ?? 0} digest${
                              (alertData?.totalDigestCount ?? 0) === 1
                                ? ""
                                : "s"
                            } · peak ${maxAlertTotal}/day`}
                      </span>
                    </div>
                  </>
                )}
                {/* Task #861 — per-day alert drill-down. Shows the raw
                    `platform_alerts` rows behind a clicked marker. */}
                {selectedAlertDay != null && (
                  <div
                    className="mt-3 border-t border-border/60 pt-2"
                    data-testid="card-flap-alert-by-day-detail"
                    data-day={selectedAlertDay}
                  >
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
                        Alerts on{" "}
                        <span
                          className="text-foreground font-mono normal-case"
                          data-testid="text-flap-alert-by-day-day"
                        >
                          {selectedAlertDay}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => flapAlertByDayQuery.refetch()}
                          disabled={flapAlertByDayQuery.isFetching}
                          data-testid="button-flap-alert-by-day-refresh"
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          {flapAlertByDayQuery.isFetching
                            ? "Loading…"
                            : "Refresh"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setSelectedAlertDay(null)}
                          data-testid="button-flap-alert-by-day-close"
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                    {flapAlertByDayQuery.isLoading ? (
                      <div
                        className="text-muted-foreground text-[10px]"
                        data-testid="text-flap-alert-by-day-loading"
                      >
                        Loading alerts…
                      </div>
                    ) : flapAlertByDayQuery.error ? (
                      <div
                        className="text-destructive text-[10px]"
                        data-testid="text-flap-alert-by-day-error"
                      >
                        Failed to load alerts:{" "}
                        {(flapAlertByDayQuery.error as Error).message}
                      </div>
                    ) : (flapAlertByDayQuery.data?.items.length ?? 0) === 0 ? (
                      <div
                        className="text-muted-foreground text-[10px]"
                        data-testid="text-flap-alert-by-day-empty"
                      >
                        No flapping alerts found for {selectedAlertDay}.
                      </div>
                    ) : (
                      <>
                        <div
                          className="mb-2 text-[10px] text-muted-foreground tabular-nums"
                          data-testid="text-flap-alert-by-day-summary"
                        >
                          {flapAlertByDayQuery.data?.total ?? 0} total ·{" "}
                          {flapAlertByDayQuery.data?.alertCount ?? 0} alert
                          {(flapAlertByDayQuery.data?.alertCount ?? 0) === 1
                            ? ""
                            : "s"}{" "}
                          · {flapAlertByDayQuery.data?.digestCount ?? 0} digest
                          {(flapAlertByDayQuery.data?.digestCount ?? 0) === 1
                            ? ""
                            : "s"}
                          {(flapAlertByDayQuery.data?.total ?? 0) >
                            (flapAlertByDayQuery.data?.items.length ?? 0) && (
                            <>
                              {" "}
                              · showing newest{" "}
                              {flapAlertByDayQuery.data?.items.length ?? 0}
                            </>
                          )}
                        </div>
                        <ul
                          className="space-y-2"
                          data-testid="list-flap-alert-by-day-rows"
                        >
                          {flapAlertByDayQuery.data?.items.map((row) => (
                            <li
                              key={row.id}
                              className="rounded-md border border-border/60 bg-background/60 p-2"
                              data-testid={`row-flap-alert-by-day-${row.id}`}
                              data-alert-id={row.id}
                              data-alert-kind={row.kind}
                              data-alert-severity={row.severity}
                              data-alert-acknowledged={
                                row.acknowledged ? "true" : "false"
                              }
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <Badge
                                    variant={
                                      row.kind === "digest"
                                        ? "secondary"
                                        : "destructive"
                                    }
                                    className="text-[10px]"
                                    data-testid={`badge-flap-alert-by-day-kind-${row.id}`}
                                  >
                                    {row.kind}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                    data-testid={`badge-flap-alert-by-day-severity-${row.id}`}
                                  >
                                    {row.severity}
                                  </Badge>
                                  {row.acknowledged ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] border-green-500/50 text-green-600"
                                      data-testid={`badge-flap-alert-by-day-ack-${row.id}`}
                                    >
                                      <CheckCircle2 className="mr-1 h-3 w-3" />
                                      ack
                                      {row.acknowledgedBy
                                        ? ` · ${row.acknowledgedBy}`
                                        : ""}
                                    </Badge>
                                  ) : (
                                    <>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] border-amber-500/50 text-amber-600"
                                        data-testid={`badge-flap-alert-by-day-unack-${row.id}`}
                                      >
                                        <AlertTriangle className="mr-1 h-3 w-3" />
                                        unack
                                      </Badge>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        onClick={() =>
                                          ackFlapAlertMutation.mutate(row.id)
                                        }
                                        disabled={
                                          ackFlapAlertMutation.isPending &&
                                          ackFlapAlertMutation.variables ===
                                            row.id
                                        }
                                        data-testid={`button-flap-alert-by-day-ack-${row.id}`}
                                      >
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        {ackFlapAlertMutation.isPending &&
                                        ackFlapAlertMutation.variables ===
                                          row.id
                                          ? "Acking…"
                                          : "Acknowledge"}
                                      </Button>
                                    </>
                                  )}
                                </div>
                                <span
                                  className="text-[10px] text-muted-foreground tabular-nums"
                                  data-testid={`text-flap-alert-by-day-created-at-${row.id}`}
                                  title={row.createdAt}
                                >
                                  {new Date(row.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <div
                                className="mt-1 text-[11px] text-foreground whitespace-pre-wrap break-words"
                                data-testid={`text-flap-alert-by-day-message-${row.id}`}
                              >
                                {row.message}
                              </div>
                              <div
                                className="mt-1 text-[10px] text-muted-foreground font-mono break-all"
                                data-testid={`text-flap-alert-by-day-type-${row.id}`}
                              >
                                {row.type} · {row.id}
                              </div>
                              {ackErrorById[row.id] && (
                                <div
                                  className="mt-1 text-[10px] text-destructive"
                                  data-testid={`text-flap-alert-by-day-ack-error-${row.id}`}
                                >
                                  {ackErrorById[row.id]}
                                </div>
                              )}
                              {(() => {
                                const hasPayload =
                                  row.details != null &&
                                  !(
                                    typeof row.details === "object" &&
                                    !Array.isArray(row.details) &&
                                    Object.keys(
                                      row.details as Record<string, unknown>,
                                    ).length === 0
                                  );
                                const isOpen = flapAlertPayloadOpen.has(row.id);
                                if (!hasPayload) {
                                  return (
                                    <div
                                      className="mt-1 text-[10px] text-muted-foreground italic"
                                      data-testid={`text-flap-alert-by-day-no-payload-${row.id}`}
                                    >
                                      no payload
                                    </div>
                                  );
                                }
                                return (
                                  <div className="mt-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleFlapAlertPayload(row.id)
                                      }
                                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                                      aria-expanded={isOpen}
                                      data-testid={`button-flap-alert-by-day-toggle-payload-${row.id}`}
                                    >
                                      {isOpen ? (
                                        <ChevronDown className="h-3 w-3" />
                                      ) : (
                                        <ChevronRight className="h-3 w-3" />
                                      )}
                                      {isOpen ? "Hide payload" : "View payload"}
                                    </button>
                                    {isOpen && (
                                      <div className="mt-1 rounded border border-border/60 bg-muted/40 p-2">
                                        <div className="flex items-center justify-end mb-1">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              copyFlapAlertPayload(
                                                row.id,
                                                row.details,
                                              )
                                            }
                                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                                            data-testid={`button-flap-alert-by-day-copy-payload-${row.id}`}
                                          >
                                            {flapAlertPayloadCopied === row.id
                                              ? "Copied"
                                              : "Copy"}
                                          </button>
                                        </div>
                                        <pre
                                          className="max-h-64 overflow-auto text-[10px] font-mono whitespace-pre-wrap break-words text-foreground"
                                          data-testid={`text-flap-alert-by-day-payload-${row.id}`}
                                        >
                                          {JSON.stringify(
                                            row.details,
                                            null,
                                            2,
                                          )}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {/* Task #848 — Top changers leaderboard. */}
          <div
            className="mb-3 border border-border/60 rounded-md p-2 bg-background/40"
            data-testid="card-flap-config-history-actor-stats"
          >
            <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
              <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
                Top changers
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span>Window</span>
                  <select
                    value={flapActorStatsWindow}
                    onChange={(e) =>
                      setFlapActorStatsWindow(
                        Number(e.target.value) as FlapActorStatsWindow,
                      )
                    }
                    className="h-6 rounded border border-border bg-background px-1 text-[10px]"
                    data-testid="select-flap-config-history-actor-stats-window"
                  >
                    {FLAP_ACTOR_STATS_WINDOW_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d === 1 ? "24h" : `${d}d`}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => flapActorStatsQuery.refetch()}
                  disabled={flapActorStatsQuery.isFetching}
                  data-testid="button-flap-config-history-actor-stats-refresh"
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  {flapActorStatsQuery.isFetching ? "Loading…" : "Refresh"}
                </Button>
              </div>
            </div>
            {flapActorStatsQuery.isLoading ? (
              <div
                className="text-muted-foreground text-[10px]"
                data-testid="text-flap-config-history-actor-stats-loading"
              >
                Loading top changers…
              </div>
            ) : flapActorStatsQuery.error ? (
              <div
                className="text-destructive text-[10px]"
                data-testid="text-flap-config-history-actor-stats-error"
              >
                Failed to load top changers:{" "}
                {(flapActorStatsQuery.error as Error).message}
              </div>
            ) : (flapActorStatsQuery.data?.items ?? []).length === 0 ? (
              <div
                className="text-muted-foreground text-[10px]"
                data-testid="text-flap-config-history-actor-stats-empty"
              >
                No flapping-config changes in the last{" "}
                {flapActorStatsWindow === 1
                  ? "24 hours"
                  : `${flapActorStatsWindow} days`}
                .
              </div>
            ) : (
              <ul
                className="space-y-1"
                data-testid="list-flap-config-history-actor-stats"
              >
                {(flapActorStatsQuery.data?.items ?? []).map((row, idx) => {
                  const actorKey = row.actorUserId ?? "__system__";
                  // Task #860 — highlight the row whose actor matches the
                  // currently-active audit filter so admins can see which
                  // leaderboard entry is driving the prefill, and clicking
                  // it again will toggle the filter back off.
                  const rowFilterValue =
                    row.actorUserId === null
                      ? "system"
                      : row.actorUserId.trim();
                  const isActive = flapAuditActor === rowFilterValue;
                  return (
                    <li
                      key={actorKey}
                      data-testid={`flap-config-history-actor-stats-row-${actorKey}`}
                      data-active={isActive ? "true" : "false"}
                    >
                      <button
                        type="button"
                        onClick={() => applyActorStatsRow(row.actorUserId)}
                        aria-pressed={isActive}
                        className={`w-full flex items-center justify-between gap-2 text-left rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring ${
                          isActive
                            ? "bg-primary/15 ring-1 ring-primary/40 hover:bg-primary/20"
                            : "hover:bg-muted/40"
                        }`}
                        data-testid={`button-flap-config-history-actor-stats-apply-${actorKey}`}
                        title={
                          isActive
                            ? `Clear actor filter (currently ${row.actorUserId ?? "system"})`
                            : `Filter audit list by ${row.actorUserId ?? "system"}`
                        }
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Badge
                            variant="outline"
                            className="text-[10px] tabular-nums"
                            data-testid={`badge-flap-config-history-actor-stats-rank-${actorKey}`}
                          >
                            #{idx + 1}
                          </Badge>
                          <code
                            className="font-mono text-[10px] truncate"
                            data-testid={`text-flap-config-history-actor-stats-actor-${actorKey}`}
                          >
                            {row.actorUserId ?? "system"}
                          </code>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span
                            className="text-muted-foreground text-[10px] tabular-nums"
                            data-testid={`text-flap-config-history-actor-stats-last-${actorKey}`}
                            title={`${row.lastChangeAt} (${flapDailyStatsTimeZone})`}
                          >
                            last{" "}
                            {formatInTimeZone(
                              row.lastChangeAt,
                              flapDailyStatsTimeZone,
                            )}
                          </span>
                          <Badge
                            className="text-[10px] tabular-nums"
                            data-testid={`badge-flap-config-history-actor-stats-count-${actorKey}`}
                          >
                            {row.changeCount}{" "}
                            {row.changeCount === 1 ? "change" : "changes"}
                          </Badge>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {flapAuditQuery.isLoading ? (
            <div
              className="text-muted-foreground text-[10px]"
              data-testid="text-flap-config-history-audit-loading"
            >
              Loading change history…
            </div>
          ) : flapAuditQuery.error ? (
            <div
              className="text-destructive text-[10px]"
              data-testid="text-flap-config-history-audit-error"
            >
              Failed to load history:{" "}
              {(flapAuditQuery.error as Error).message}
            </div>
          ) : (flapAuditQuery.data?.items ?? []).length === 0 ? (
            <div
              className="text-muted-foreground text-[10px]"
              data-testid="text-flap-config-history-audit-empty"
            >
              No flapping-config changes recorded yet.
            </div>
          ) : (
            <ul
              className="space-y-1"
              data-testid="list-flap-config-history-audit"
            >
              {(flapAuditQuery.data?.items ?? []).map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2"
                  data-testid={`flap-config-history-audit-row-${row.id}`}
                >
                  <span
                    className="text-muted-foreground tabular-nums"
                    data-testid={`text-flap-config-history-audit-time-${row.id}`}
                    title={`${row.occurredAt} (${flapDailyStatsTimeZone})`}
                  >
                    {formatInTimeZone(row.occurredAt, flapDailyStatsTimeZone)}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    data-testid={`badge-flap-config-history-audit-action-${row.id}`}
                  >
                    {row.action === "restored_default"
                      ? "restored default"
                      : "updated"}
                  </Badge>
                  <span
                    className="text-muted-foreground"
                    data-testid={`text-flap-config-history-audit-actor-${row.id}`}
                  >
                    by{" "}
                    <code className="font-mono">
                      {row.updatedBy ?? "system"}
                    </code>
                  </span>
                  <span
                    className="flex flex-wrap items-center gap-1"
                    data-testid={`flap-config-history-audit-changes-${row.id}`}
                  >
                    {row.changedFields.length === 0 ? (
                      <span className="text-muted-foreground">
                        (no fields changed)
                      </span>
                    ) : (
                      row.changedFields.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center gap-1"
                          data-testid={`flap-config-history-audit-change-${row.id}-${f}`}
                        >
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                          >
                            {labelFlapAuditField(f)}
                          </Badge>
                          <span className="text-muted-foreground">
                            {formatFlapAuditSnapshotField(
                              f,
                              row.previousConfig,
                            )}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-medium">
                            {formatFlapAuditSnapshotField(
                              f,
                              row.newConfig,
                            )}
                          </span>
                        </span>
                      ))
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="mb-4 border border-border rounded-md p-3 bg-muted/20 text-[11px]"
          data-testid="card-sweep-threshold-history"
        >
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="uppercase tracking-wider text-muted-foreground text-[10px]">
              Sweep threshold change history
            </div>
            {/* Task #873 — show the active timezone so admins know which
                zone the row timestamps + from/to filters are bucketed by. */}
            <span
              className="text-muted-foreground text-[10px]"
              data-testid="text-sweep-threshold-history-timezone"
              title={`Timestamps and from/to boundaries are interpreted in ${flapDailyStatsTimeZone}. Change the zone in the daily-stats chart selector below.`}
            >
              Zone: {flapDailyStatsTimeZone}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => sweepThresholdHistoryQuery.refetch()}
              disabled={sweepThresholdHistoryQuery.isFetching}
              data-testid="button-sweep-threshold-history-refresh"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              {sweepThresholdHistoryQuery.isFetching ? "Loading…" : "Refresh"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={exportSweepThresholdHistoryCsv}
              disabled={sweepThresholdHistoryCsvBusy}
              data-testid="button-sweep-threshold-history-export-csv"
            >
              {sweepThresholdHistoryCsvBusy ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
          <div
            className="mb-2 flex flex-wrap items-end gap-2"
            data-testid="sweep-threshold-history-filters"
          >
            <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
              <span>From</span>
              <Input
                type="datetime-local"
                value={sweepThresholdHistoryFilterDraft.from}
                onChange={(e) =>
                  setSweepThresholdHistoryFilterDraft((f) => ({
                    ...f,
                    from: e.target.value,
                  }))
                }
                className="h-7 text-[11px] w-[180px]"
                data-testid="input-sweep-threshold-history-from"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
              <span>To</span>
              <Input
                type="datetime-local"
                value={sweepThresholdHistoryFilterDraft.to}
                onChange={(e) =>
                  setSweepThresholdHistoryFilterDraft((f) => ({
                    ...f,
                    to: e.target.value,
                  }))
                }
                className="h-7 text-[11px] w-[180px]"
                data-testid="input-sweep-threshold-history-to"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
              <span>Actor user ID</span>
              <Input
                type="text"
                value={sweepThresholdHistoryFilterDraft.actorUserId}
                onChange={(e) =>
                  setSweepThresholdHistoryFilterDraft((f) => ({
                    ...f,
                    actorUserId: e.target.value,
                  }))
                }
                placeholder="e.g. usr_abc123"
                className="h-7 text-[11px] w-[180px]"
                data-testid="input-sweep-threshold-history-actor"
              />
            </label>
            <Button
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={applySweepThresholdHistoryFilters}
              data-testid="button-sweep-threshold-history-apply"
            >
              Apply filters
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={clearSweepThresholdHistoryFilters}
              data-testid="button-sweep-threshold-history-clear"
            >
              Clear
            </Button>
          </div>
          {sweepThresholdHistoryFilterMsg && (
            <div
              className="mb-2 text-destructive text-[10px]"
              data-testid="text-sweep-threshold-history-filter-msg"
            >
              {sweepThresholdHistoryFilterMsg}
            </div>
          )}
          {sweepThresholdHistoryQuery.isLoading ? (
            <div
              className="text-muted-foreground text-[10px]"
              data-testid="text-sweep-threshold-history-loading"
            >
              Loading change history…
            </div>
          ) : sweepThresholdHistoryQuery.error ? (
            <div
              className="text-destructive text-[10px]"
              data-testid="text-sweep-threshold-history-error"
            >
              Failed to load history:{" "}
              {(sweepThresholdHistoryQuery.error as Error).message}
            </div>
          ) : (sweepThresholdHistoryQuery.data?.items ?? []).length === 0 ? (
            <div
              className="text-muted-foreground text-[10px]"
              data-testid="text-sweep-threshold-history-empty"
            >
              No sweep-threshold changes recorded yet.
            </div>
          ) : (
            <ul
              className="space-y-1"
              data-testid="list-sweep-threshold-history"
            >
              {(sweepThresholdHistoryQuery.data?.items ?? []).map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2"
                  data-testid={`sweep-threshold-history-row-${row.id}`}
                >
                  <span
                    className="text-muted-foreground tabular-nums"
                    data-testid={`text-sweep-threshold-history-time-${row.id}`}
                    title={`${row.changedAt} (${flapDailyStatsTimeZone})`}
                  >
                    {formatInTimeZone(row.changedAt, flapDailyStatsTimeZone)}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    data-testid={`badge-sweep-threshold-history-setting-${row.id}`}
                  >
                    Threshold
                  </Badge>
                  <span
                    data-testid={`text-sweep-threshold-history-change-${row.id}`}
                  >
                    <span className="text-muted-foreground">
                      {row.previousValue ?? "—"}
                    </span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-medium">{row.newValue}</span>
                  </span>
                  <span
                    className="text-muted-foreground"
                    data-testid={`text-sweep-threshold-history-actor-${row.id}`}
                  >
                    by{" "}
                    <code className="font-mono">
                      {row.actorUserId ?? "system"}
                    </code>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(() => {
            const total = sweepThresholdHistoryQuery.data?.total ?? 0;
            const items = sweepThresholdHistoryQuery.data?.items ?? [];
            if (total === 0) return null;
            const start =
              sweepThresholdHistoryPage * SWEEP_THRESHOLD_HISTORY_PAGE_SIZE + 1;
            const end =
              sweepThresholdHistoryPage * SWEEP_THRESHOLD_HISTORY_PAGE_SIZE +
              items.length;
            const hasNext = end < total;
            const hasPrev = sweepThresholdHistoryPage > 0;
            return (
              <div
                className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"
                data-testid="sweep-threshold-history-pagination"
              >
                <span data-testid="text-sweep-threshold-history-range">
                  Showing {start}–{end} of {total}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      setSweepThresholdHistoryPage((p) => Math.max(0, p - 1))
                    }
                    disabled={!hasPrev || sweepThresholdHistoryQuery.isFetching}
                    data-testid="button-sweep-threshold-history-prev"
                  >
                    Prev
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setSweepThresholdHistoryPage((p) => p + 1)}
                    disabled={!hasNext || sweepThresholdHistoryQuery.isFetching}
                    data-testid="button-sweep-threshold-history-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>

        {items.length > 0 && (
          <div
            className="mb-3 flex flex-wrap items-center gap-2 rounded border border-border bg-muted/20 p-2 text-xs"
            data-testid="orphan-bulk-toolbar"
          >
            <span
              className="text-muted-foreground"
              data-testid="text-orphan-bulk-select-count"
            >
              {selected.size} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAll(!allSelected)}
              disabled={items.length === 0 || bulkDeleting || bulkRelinking}
              data-testid="button-orphan-select-all"
            >
              {allSelected ? "Unselect all" : "Select all"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              disabled={selected.size === 0 || bulkDeleting || bulkRelinking}
              data-testid="button-orphan-clear-selection"
            >
              Clear selection
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkRelink()}
              disabled={selected.size === 0 || bulkDeleting || bulkRelinking}
              data-testid="button-orphan-bulk-relink"
            >
              <Link2 className="mr-2 h-4 w-4" />
              {bulkRelinking
                ? "Re-linking…"
                : `Re-link selected (${selected.size})`}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={bulkRelinkWithPrefixRewrite}
              disabled={selected.size === 0 || bulkDeleting || bulkRelinking}
              data-testid="button-orphan-bulk-relink-prefix"
              title="Rewrite a shared storageKey prefix for every selected row"
            >
              <Link2 className="mr-2 h-4 w-4" />
              Re-link with prefix…
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={bulkRelinkWithJsonMap}
              disabled={selected.size === 0 || bulkDeleting || bulkRelinking}
              data-testid="button-orphan-bulk-relink-map"
              title="Paste a JSON map of asset id → new storageKey"
            >
              <Link2 className="mr-2 h-4 w-4" />
              Re-link with id map…
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={bulkHardDelete}
              disabled={selected.size === 0 || bulkDeleting || bulkRelinking}
              data-testid="button-orphan-bulk-hard-delete"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {bulkDeleting
                ? "Hard-deleting…"
                : `Hard-delete selected (${selected.size})`}
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Re-link head-probes each row; rows whose bytes are still missing
              stay in the list.
            </span>
          </div>
        )}

        {bulkResults && (
          <div
            className="mb-3 rounded border border-border bg-muted/20 p-3 text-xs"
            data-testid="orphan-bulk-results"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className="font-medium"
                data-testid="text-orphan-bulk-results-summary"
              >
                {bulkResultsKind === "relink_object"
                  ? "Bulk re-link"
                  : "Bulk hard-delete"}
                : {bulkResults.filter((r) => r.ok).length} succeeded,{" "}
                {bulkResults.filter((r) => !r.ok).length} failed
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBulkResults(null);
                  setBulkResultsKind(null);
                }}
                data-testid="button-dismiss-orphan-bulk-results"
              >
                Dismiss
              </Button>
            </div>
            <ul className="space-y-1">
              {bulkResults.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2"
                  data-testid={`orphan-bulk-result-${r.id}`}
                >
                  <Badge
                    variant="outline"
                    className={
                      r.ok
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-destructive/60 text-destructive"
                    }
                  >
                    {r.ok ? "ok" : "failed"}
                  </Badge>
                  <span className="font-medium">{r.name}</span>
                  <code className="text-[10px] text-muted-foreground">
                    {r.id}
                  </code>
                  {r.message && (
                    <span className="text-muted-foreground">— {r.message}</span>
                  )}
                  {r.storageKeyUpdated && r.oldStorageKey && r.newStorageKey && (
                    <code
                      className="text-[10px] text-muted-foreground"
                      title={`${r.oldStorageKey} → ${r.newStorageKey}`}
                      data-testid={`orphan-bulk-result-rewrite-${r.id}`}
                    >
                      {r.oldStorageKey} → {r.newStorageKey}
                    </code>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {lastResult && (
          <div
            className="mb-3 rounded border border-border bg-muted/20 p-2 text-xs"
            data-testid="text-orphan-action-result"
          >
            <Badge
              variant="outline"
              className={
                lastResult.ok
                  ? "border-emerald-500/40 text-emerald-400"
                  : "border-destructive/60 text-destructive"
              }
            >
              {lastResult.ok ? "ok" : "failed"}
            </Badge>
            <code className="ml-2 text-[10px] text-muted-foreground">
              {lastResult.id}
            </code>
            <span className="ml-2">{lastResult.message}</span>
          </div>
        )}

        {isLoading ? (
          <div
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="text-orphans-loading"
          >
            Scanning archived rows for missing object bytes…
          </div>
        ) : error ? (
          <div
            className="py-6 text-center text-sm text-destructive"
            data-testid="text-orphans-error"
          >
            Failed to load orphans: {(error as Error).message}
          </div>
        ) : items.length === 0 ? (
          <div
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="text-orphans-empty"
          >
            No orphaned rows detected. All archived assets still have their bytes
            in storage.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      disabled={items.length === 0 || bulkDeleting || bulkRelinking}
                      onCheckedChange={(v) => toggleAll(v === true)}
                      aria-label="Select all orphans"
                      data-testid="checkbox-orphan-select-all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>sha256</TableHead>
                  <TableHead>Archived</TableHead>
                  <TableHead>Storage key</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((o) => {
                  const isPendingDelete =
                    pending?.id === o.id && pending.action === "hard_delete";
                  const isPendingRelink =
                    pending?.id === o.id && pending.action === "relink_object";
                  const anyPending =
                    pending !== null || bulkDeleting || bulkRelinking;
                  return (
                    <TableRow key={o.id} data-testid={`row-orphan-${o.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(o.id)}
                          disabled={bulkDeleting || bulkRelinking}
                          onCheckedChange={(v) => toggleOne(o.id, v === true)}
                          aria-label={`Select ${o.name}`}
                          data-testid={`checkbox-orphan-select-${o.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{o.name}</div>
                        <code className="text-[10px] text-muted-foreground">
                          {o.id}
                        </code>
                      </TableCell>
                      <TableCell data-testid={`text-orphan-size-${o.id}`}>
                        {formatBytes(o.byteSize)}
                      </TableCell>
                      <TableCell>
                        <code
                          className="text-[10px]"
                          title={o.sha256}
                          data-testid={`text-orphan-sha256-${o.id}`}
                        >
                          {shortHash(o.sha256)}
                        </code>
                      </TableCell>
                      <TableCell data-testid={`text-orphan-archived-${o.id}`}>
                        {o.archivedAt
                          ? new Date(o.archivedAt).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <code
                          className="text-[10px] text-muted-foreground"
                          title={o.storageKey}
                          data-testid={`text-orphan-storage-key-${o.id}`}
                        >
                          {o.storageKey}
                        </code>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={anyPending}
                            onClick={() => runAction(o, "relink_object")}
                            data-testid={`button-orphan-relink-${o.id}`}
                          >
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            {isPendingRelink ? "Re-linking…" : "Re-link"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={anyPending}
                            onClick={() => runAction(o, "hard_delete")}
                            data-testid={`button-orphan-hard-delete-${o.id}`}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            {isPendingDelete ? "Deleting…" : "Hard-delete"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
