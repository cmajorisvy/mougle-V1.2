import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Moon,
  Loader2,
  BellOff,
  Bell,
  History,
  BarChart3,
  Download,
  Trash2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { useToast } from "@/hooks/use-toast";

type SnoozePolicy =
  | { kind: "fixed" }
  | { kind: "auto_extend"; extendDays: number }
  | {
      kind: "weekday_mute";
      days: number[];
      startHour: number;
      endHour: number;
    };

interface PtoConfig {
  enabled: boolean;
  enrolledNotifiers: string[];
  snoozePolicy: SnoozePolicy;
  snoozeUntil: string | null;
  snoozeStartedAt: string | null;
  snoozeSuppressedCount: number;
  lastSnoozeSource: "manual" | "auto" | "weekday_window" | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface NotifierStatus {
  id: string;
  label: string;
  description: string;
  ownSnoozeUntil: string | null;
  ownEnabled: boolean;
}

interface PtoResponse {
  config: PtoConfig;
  currentlySnoozed: boolean;
  effectiveSnoozeUntil: string | null;
  snoozeSource: "manual" | "auto" | "weekday_window" | null;
  notifiers: NotifierStatus[];
}

interface SuppressionLogEntry {
  id: string;
  notifierId: string;
  snoozeSource: "manual" | "auto" | "weekday_window" | null;
  effectiveUntil: string | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

interface SuppressionLogResponse {
  entries: SuppressionLogEntry[];
  limit: number;
}

interface SuppressionStatBucket {
  day: string;
  notifierId: string;
  source: "manual" | "auto" | "weekday_window" | "unknown";
  count: number;
}

interface SuppressionStatsResponse {
  windowDays: number;
  since: string;
  totalCount: number;
  buckets: SuppressionStatBucket[];
}

const SOURCE_COLORS: Record<string, string> = {
  manual: "#60a5fa",
  auto: "#a78bfa",
  weekday_window: "#34d399",
  unknown: "#9ca3af",
};
const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  auto: "Auto-extend",
  weekday_window: "Weekday window",
  unknown: "Unknown",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function FounderPtoMode() {
  const { data, isLoading, isError } = useQuery<PtoResponse>({
    queryKey: ["/api/admin/founder-pto-mode"],
    refetchInterval: 15_000,
  });

  const [suppressionNotifierFilter, setSuppressionNotifierFilter] =
    useState<string>("");
  const [suppressionChartDays, setSuppressionChartDays] = useState<7 | 30 | 90>(
    30,
  );
  const suppressionStatsQuery = useQuery<SuppressionStatsResponse>({
    queryKey: [
      "/api/admin/founder-pto-mode/suppression-stats",
      suppressionNotifierFilter,
      suppressionChartDays,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        days: String(suppressionChartDays),
      });
      if (suppressionNotifierFilter) {
        params.set("notifierId", suppressionNotifierFilter);
      }
      const res = await apiRequest(
        "GET",
        `/api/admin/founder-pto-mode/suppression-stats?${params.toString()}`,
      );
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const suppressionLogQuery = useQuery<SuppressionLogResponse>({
    queryKey: [
      "/api/admin/founder-pto-mode/suppression-log",
      suppressionNotifierFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "20" });
      if (suppressionNotifierFilter) {
        params.set("notifierId", suppressionNotifierFilter);
      }
      const res = await apiRequest(
        "GET",
        `/api/admin/founder-pto-mode/suppression-log?${params.toString()}`,
      );
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const [snoozeDate, setSnoozeDate] = useState<string>("");
  const [policyKind, setPolicyKind] =
    useState<SnoozePolicy["kind"]>("fixed");
  const [extendDays, setExtendDays] = useState<number>(7);
  const [weekdays, setWeekdays] = useState<number[]>([6, 0]); // Sat + Sun
  const [startHour, setStartHour] = useState<number>(18);
  const [endHour, setEndHour] = useState<number>(8);

  const enrollmentMutation = useMutation({
    mutationFn: async (input: {
      enabled: boolean;
      enrolledNotifiers: string[];
    }) => {
      const res = await apiRequest("PUT", "/api/admin/founder-pto-mode", input);
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/founder-pto-mode"],
      }),
  });

  const { toast } = useToast();
  const [clearOpen, setClearOpen] = useState(false);

  const clearLogMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "DELETE",
        "/api/admin/founder-pto-mode/suppression-log",
      );
      return res.json() as Promise<{ deletedCount: number }>;
    },
    onSuccess: (r) => {
      toast({
        title: "Suppression log cleared",
        description: `${r.deletedCount} entr${
          r.deletedCount === 1 ? "y" : "ies"
        } removed.`,
      });
      setClearOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/founder-pto-mode/suppression-log"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to clear log",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  function downloadCsv() {
    const params = new URLSearchParams();
    if (suppressionNotifierFilter) {
      params.set("notifierId", suppressionNotifierFilter);
    }
    const qs = params.toString();
    const url = `/api/admin/founder-pto-mode/suppression-log/export${
      qs ? `?${qs}` : ""
    }`;
    window.location.href = url;
  }

  const snoozeMutation = useMutation({
    mutationFn: async (input: {
      snoozeUntil: string | null;
      snoozePolicy: SnoozePolicy | null;
    }) => {
      const res = await apiRequest(
        "POST",
        "/api/admin/founder-pto-mode/snooze",
        input,
      );
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/founder-pto-mode"],
      }),
  });

  const cfg = data?.config;
  const enrolled = useMemo(
    () => new Set(cfg?.enrolledNotifiers ?? []),
    [cfg?.enrolledNotifiers],
  );

  function toggleNotifier(id: string) {
    if (!cfg) return;
    const next = new Set(enrolled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    enrollmentMutation.mutate({
      enabled: cfg.enabled,
      enrolledNotifiers: Array.from(next),
    });
  }

  function buildPolicy(): SnoozePolicy | null {
    if (policyKind === "fixed") return { kind: "fixed" };
    if (policyKind === "auto_extend") {
      return { kind: "auto_extend", extendDays };
    }
    return { kind: "weekday_mute", days: weekdays, startHour, endHour };
  }

  function applySnooze() {
    const policy = buildPolicy();
    let snoozeUntil: string | null = null;
    if (snoozeDate) {
      const d = new Date(snoozeDate);
      if (!Number.isNaN(d.getTime())) snoozeUntil = d.toISOString();
    }
    // weekday_mute does not require a snoozeUntil — it's a recurring window.
    if (policy?.kind === "weekday_mute" && !snoozeUntil) {
      snoozeUntil = null;
    }
    snoozeMutation.mutate({ snoozeUntil, snoozePolicy: policy });
  }

  function quickSnooze(hours: number) {
    const d = new Date(Date.now() + hours * 60 * 60 * 1000);
    snoozeMutation.mutate({
      snoozeUntil: d.toISOString(),
      snoozePolicy: { kind: "fixed" },
    });
  }

  function unsnooze() {
    snoozeMutation.mutate({ snoozeUntil: null, snoozePolicy: null });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/dashboard"
              className="text-gray-400 hover:text-white"
              data-testid="link-back-dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Moon className="w-6 h-6 text-indigo-400" />
              Founder PTO mode
            </h1>
          </div>
          <Link
            href="/admin/omni-channel-audience"
            className="text-sm text-gray-400 hover:text-white"
            data-testid="link-audience"
          >
            Per-notifier settings →
          </Link>
        </div>

        <p className="text-sm text-gray-400 mb-6">
          One switch mutes every enrolled notifier with the same policy.
          Per-notifier overrides on each notifier's own page still apply
          independently — PTO mode adds an extra mute on top, it never
          un-mutes.
        </p>

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}

        {isError && (
          <Card className="p-4 border-red-700 bg-red-950/30 text-red-200">
            Failed to load PTO mode. You may not have root-admin access.
          </Card>
        )}

        {cfg && data && (
          <>
            <Card
              className="p-6 mb-6 border-gray-800 bg-gray-900/60"
              data-testid="card-pto-master"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {data.currentlySnoozed ? (
                      <BellOff className="w-5 h-5 text-amber-400" />
                    ) : (
                      <Bell className="w-5 h-5 text-emerald-400" />
                    )}
                    <h2 className="text-lg font-semibold">
                      {data.currentlySnoozed
                        ? "PTO mode is muting alerts"
                        : "PTO mode is not muting alerts"}
                    </h2>
                  </div>
                  <p className="text-sm text-gray-400">
                    {data.currentlySnoozed
                      ? `Effective until ${formatTime(
                          data.effectiveSnoozeUntil,
                        )} (${data.snoozeSource ?? "manual"})`
                      : cfg.enabled
                        ? "Enabled, but no active window."
                        : "Globally disabled."}
                  </p>
                  {cfg.snoozeSuppressedCount > 0 && (
                    <p
                      className="text-xs text-amber-300 mt-1"
                      data-testid="text-suppressed-count"
                    >
                      {cfg.snoozeSuppressedCount} alerts swallowed since
                      this window started.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="pto-enabled"
                    className="text-sm text-gray-300"
                  >
                    Enabled
                  </Label>
                  <Switch
                    id="pto-enabled"
                    checked={cfg.enabled}
                    onCheckedChange={(v) =>
                      enrollmentMutation.mutate({
                        enabled: v,
                        enrolledNotifiers: cfg.enrolledNotifiers,
                      })
                    }
                    data-testid="switch-pto-enabled"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => quickSnooze(24)}
                  disabled={snoozeMutation.isPending}
                  data-testid="button-snooze-1d"
                >
                  Snooze 1 day
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => quickSnooze(24 * 7)}
                  disabled={snoozeMutation.isPending}
                  data-testid="button-snooze-7d"
                >
                  Snooze 1 week
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => quickSnooze(24 * 14)}
                  disabled={snoozeMutation.isPending}
                  data-testid="button-snooze-14d"
                >
                  Snooze 2 weeks
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={unsnooze}
                  disabled={snoozeMutation.isPending}
                  data-testid="button-unsnooze"
                >
                  Unsnooze
                </Button>
              </div>

              <div className="border-t border-gray-800 pt-4 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">
                  Custom policy
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(["fixed", "auto_extend", "weekday_mute"] as const).map(
                    (k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={policyKind === k ? "default" : "outline"}
                        onClick={() => setPolicyKind(k)}
                        data-testid={`button-policy-${k}`}
                      >
                        {k === "fixed"
                          ? "Fixed window"
                          : k === "auto_extend"
                            ? "Auto-extend"
                            : "Weekday mute"}
                      </Button>
                    ),
                  )}
                </div>

                {policyKind !== "weekday_mute" && (
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="snooze-until"
                      className="text-sm w-32 text-gray-300"
                    >
                      Snooze until
                    </Label>
                    <Input
                      id="snooze-until"
                      type="datetime-local"
                      value={snoozeDate}
                      onChange={(e) => setSnoozeDate(e.target.value)}
                      className="max-w-xs"
                      data-testid="input-snooze-until"
                    />
                  </div>
                )}

                {policyKind === "auto_extend" && (
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="extend-days"
                      className="text-sm w-32 text-gray-300"
                    >
                      Extend by (days)
                    </Label>
                    <Input
                      id="extend-days"
                      type="number"
                      min={1}
                      max={30}
                      value={extendDays}
                      onChange={(e) =>
                        setExtendDays(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="max-w-[100px]"
                      data-testid="input-extend-days"
                    />
                    <span className="text-xs text-gray-500">
                      Bumps forward each time the window elapses. Founder
                      must unsnooze explicitly.
                    </span>
                  </div>
                )}

                {policyKind === "weekday_mute" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {WEEKDAY_LABELS.map((label, idx) => (
                        <Button
                          key={idx}
                          size="sm"
                          variant={
                            weekdays.includes(idx) ? "default" : "outline"
                          }
                          onClick={() =>
                            setWeekdays((cur) =>
                              cur.includes(idx)
                                ? cur.filter((d) => d !== idx)
                                : [...cur, idx].sort((a, b) => a - b),
                            )
                          }
                          data-testid={`button-weekday-${idx}`}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm w-32 text-gray-300">
                        Start hour (UTC)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={startHour}
                        onChange={(e) =>
                          setStartHour(
                            Math.max(
                              0,
                              Math.min(23, Number(e.target.value) || 0),
                            ),
                          )
                        }
                        className="max-w-[80px]"
                        data-testid="input-start-hour"
                      />
                      <Label className="text-sm text-gray-300">End hour</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={endHour}
                        onChange={(e) =>
                          setEndHour(
                            Math.max(
                              0,
                              Math.min(23, Number(e.target.value) || 0),
                            ),
                          )
                        }
                        className="max-w-[80px]"
                        data-testid="input-end-hour"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      If start ≥ end the window crosses midnight (e.g.
                      18→8 mutes 18:00 through 08:00 the next day).
                    </p>
                  </div>
                )}

                <Button
                  size="sm"
                  onClick={applySnooze}
                  disabled={snoozeMutation.isPending}
                  data-testid="button-apply-policy"
                >
                  Apply policy
                </Button>
              </div>
            </Card>

            <Card
              className="p-6 border-gray-800 bg-gray-900/60"
              data-testid="card-notifier-list"
            >
              <h2 className="text-lg font-semibold mb-1">
                Enrolled notifiers
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                Uncheck a notifier to keep it out of PTO mode (its own
                per-notifier snooze still works). Check it to mute it
                whenever PTO is active.
              </p>
              <div className="space-y-3">
                {data.notifiers.map((n) => {
                  const ptoMuted =
                    enrolled.has(n.id) && data.currentlySnoozed;
                  return (
                    <div
                      key={n.id}
                      className="flex items-start justify-between gap-4 p-3 rounded-md border border-gray-800 bg-gray-950"
                      data-testid={`notifier-row-${n.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {n.label}
                          </span>
                          {ptoMuted && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 uppercase tracking-wider"
                              data-testid={`badge-pto-muted-${n.id}`}
                            >
                              PTO muted
                            </span>
                          )}
                          {!n.ownEnabled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 uppercase tracking-wider">
                              Off
                            </span>
                          )}
                          {n.ownSnoozeUntil && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/40 text-indigo-300"
                              data-testid={`badge-own-snooze-${n.id}`}
                            >
                              Own snooze until {formatTime(n.ownSnoozeUntil)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {n.description}
                        </p>
                      </div>
                      <Switch
                        checked={enrolled.has(n.id)}
                        onCheckedChange={() => toggleNotifier(n.id)}
                        data-testid={`switch-enroll-${n.id}`}
                      />
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card
              className="p-6 mt-6 border-gray-800 bg-gray-900/60"
              data-testid="card-suppression-log"
            >
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-400" />
                  Alerts swallowed by PTO mode
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={suppressionNotifierFilter}
                    onChange={(e) =>
                      setSuppressionNotifierFilter(e.target.value)
                    }
                    className="text-xs bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-300"
                    data-testid="select-suppression-filter"
                  >
                    <option value="">All notifiers</option>
                    {data.notifiers.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={downloadCsv}
                    data-testid="button-suppression-export"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download log CSV
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setClearOpen(true)}
                    disabled={
                      clearLogMutation.isPending ||
                      (suppressionLogQuery.data?.entries.length ?? 0) === 0
                    }
                    data-testid="button-suppression-clear"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Clear history
                  </Button>
                </div>
              </div>
              <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
                <AlertDialogContent data-testid="dialog-suppression-clear">
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Wipe the PTO suppression log?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes every recorded
                      swallowed-alert entry. Export a CSV first if you
                      need it for a postmortem. This action is recorded
                      as an audit event.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-suppression-clear-cancel">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => clearLogMutation.mutate()}
                      disabled={clearLogMutation.isPending}
                      data-testid="button-suppression-clear-confirm"
                    >
                      {clearLogMutation.isPending
                        ? "Clearing…"
                        : "Yes, clear history"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <p className="text-xs text-gray-500 mb-3">
                Every time PTO mode swallows a notifier send, the
                notifier id, the snooze source, and a short summary land
                here. Pruned on the same cadence as the audience audit
                tables, so this only ever shows the recent past.
              </p>

              <div
                className="mb-4 border border-gray-800 rounded-md bg-gray-950 p-3"
                data-testid="card-suppression-chart"
              >
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                    Last {suppressionChartDays} days
                    {suppressionNotifierFilter
                      ? ` · ${
                          data.notifiers.find(
                            (n) => n.id === suppressionNotifierFilter,
                          )?.label ?? suppressionNotifierFilter
                        }`
                      : " · all notifiers"}
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="inline-flex rounded-md border border-gray-800 bg-gray-900 p-0.5"
                      data-testid="group-suppression-chart-window"
                      role="group"
                      aria-label="Chart window"
                    >
                      {([7, 30, 90] as const).map((d) => {
                        const active = suppressionChartDays === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setSuppressionChartDays(d)}
                            className={`px-2 py-0.5 text-xs rounded ${
                              active
                                ? "bg-amber-500/20 text-amber-200"
                                : "text-gray-400 hover:text-gray-200"
                            }`}
                            data-testid={`button-suppression-chart-window-${d}d`}
                            aria-pressed={active}
                          >
                            {d}d
                          </button>
                        );
                      })}
                    </div>
                    <div
                      className="text-xs text-gray-500"
                      data-testid="text-suppression-stats-total"
                    >
                      {suppressionStatsQuery.data?.totalCount ?? 0} swallowed
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      data-testid="button-download-suppression-csv"
                      disabled={
                        (suppressionStatsQuery.data?.buckets.length ?? 0) === 0
                      }
                      onClick={() => {
                        const buckets =
                          suppressionStatsQuery.data?.buckets ?? [];
                        const windowDays =
                          suppressionStatsQuery.data?.windowDays ?? 30;
                        const filterPart = suppressionNotifierFilter
                          ? suppressionNotifierFilter.replace(
                              /[^a-zA-Z0-9_-]+/g,
                              "_",
                            )
                          : "all";
                        const today = new Date()
                          .toISOString()
                          .slice(0, 10);
                        const filename = `pto-suppression-${today}-${windowDays}d-${filterPart}.csv`;
                        const escape = (v: string | number): string => {
                          const s = String(v);
                          return /[",\n\r]/.test(s)
                            ? `"${s.replace(/"/g, '""')}"`
                            : s;
                        };
                        const header = "day,notifier_id,source,count";
                        const rows = buckets
                          .slice()
                          .sort((a, b) => {
                            if (a.day !== b.day)
                              return a.day.localeCompare(b.day);
                            if (a.notifierId !== b.notifierId)
                              return a.notifierId.localeCompare(b.notifierId);
                            return a.source.localeCompare(b.source);
                          })
                          .map(
                            (b) =>
                              `${escape(b.day)},${escape(b.notifierId)},${escape(b.source)},${escape(b.count)}`,
                          );
                        const csv = [header, ...rows].join("\n") + "\n";
                        const blob = new Blob([csv], {
                          type: "text/csv;charset=utf-8;",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Download chart CSV
                    </Button>
                  </div>
                </div>
                {suppressionStatsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 py-6 justify-center">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading chart…
                  </div>
                ) : (suppressionStatsQuery.data?.buckets.length ?? 0) === 0 ? (
                  <p
                    className="text-xs text-gray-500 py-6 text-center"
                    data-testid="text-suppression-chart-empty"
                  >
                    No alerts swallowed in the last {suppressionChartDays} days
                    {suppressionNotifierFilter
                      ? " for this notifier."
                      : "."}
                  </p>
                ) : (
                  (() => {
                    const buckets =
                      suppressionStatsQuery.data?.buckets ?? [];
                    // When filtering on a single notifier we stack by
                    // source (manual / auto / weekday_window). When
                    // unfiltered we stack by notifier id so the founder
                    // can see at a glance which notifier dominates.
                    const stackBy: "source" | "notifierId" =
                      suppressionNotifierFilter ? "source" : "notifierId";
                    const keySet = new Set<string>();
                    const byDay = new Map<string, Record<string, number>>();
                    for (const b of buckets) {
                      const k =
                        stackBy === "source" ? b.source : b.notifierId;
                      keySet.add(k);
                      const row = byDay.get(b.day) ?? { day: b.day } as any;
                      row[k] = ((row[k] as number) ?? 0) + b.count;
                      byDay.set(b.day, row);
                    }
                    const chartData = Array.from(byDay.values()).sort(
                      (a: any, b: any) => a.day.localeCompare(b.day),
                    );
                    const keys = Array.from(keySet).sort();
                    const colorFor = (k: string): string => {
                      if (stackBy === "source") {
                        return SOURCE_COLORS[k] ?? "#9ca3af";
                      }
                      // Stable color-by-notifier
                      const palette = [
                        "#60a5fa",
                        "#a78bfa",
                        "#34d399",
                        "#f59e0b",
                        "#f472b6",
                        "#22d3ee",
                        "#fb7185",
                        "#facc15",
                        "#4ade80",
                      ];
                      const idx = keys.indexOf(k);
                      return palette[idx % palette.length];
                    };
                    const labelFor = (k: string): string => {
                      if (stackBy === "source") {
                        return SOURCE_LABELS[k] ?? k;
                      }
                      return (
                        data.notifiers.find((n) => n.id === k)?.label ?? k
                      );
                    };
                    return (
                      <div
                        style={{ width: "100%", height: 180 }}
                        data-testid="chart-suppression"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={chartData}
                            margin={{
                              top: 4,
                              right: 8,
                              left: -16,
                              bottom: 0,
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#1f2937"
                            />
                            <XAxis
                              dataKey="day"
                              tick={{ fill: "#9ca3af", fontSize: 10 }}
                              tickFormatter={(d: string) => d.slice(5)}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fill: "#9ca3af", fontSize: 10 }}
                            />
                            <RechartsTooltip
                              contentStyle={{
                                background: "#0b1220",
                                border: "1px solid #1f2937",
                                fontSize: 12,
                              }}
                              formatter={(value: any, name: any) => [
                                value,
                                labelFor(String(name)),
                              ]}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: 11 }}
                              formatter={(v: string) => labelFor(v)}
                            />
                            {keys.map((k) => (
                              <Bar
                                key={k}
                                dataKey={k}
                                stackId="a"
                                fill={colorFor(k)}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()
                )}
              </div>

              {suppressionLogQuery.isLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              )}
              {!suppressionLogQuery.isLoading &&
                (suppressionLogQuery.data?.entries.length ?? 0) === 0 && (
                  <p
                    className="text-sm text-gray-500"
                    data-testid="text-suppression-empty"
                  >
                    No alerts swallowed yet
                    {suppressionNotifierFilter
                      ? " for this notifier."
                      : "."}
                  </p>
                )}
              <ul className="space-y-2">
                {(suppressionLogQuery.data?.entries ?? []).map((e) => (
                  <li
                    key={e.id}
                    className="text-sm border border-gray-800 rounded-md p-3 bg-gray-950"
                    data-testid={`suppression-entry-${e.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-gray-200">
                        {e.notifierId}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {formatTime(e.occurredAt)}
                      </span>
                    </div>
                    {e.summary && (
                      <p className="text-xs text-gray-400">{e.summary}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                      {e.snoozeSource && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-800">
                          {e.snoozeSource}
                        </span>
                      )}
                      {e.effectiveUntil && (
                        <span>
                          window until {formatTime(e.effectiveUntil)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <p
              className="text-xs text-gray-600 mt-6"
              data-testid="text-updated-by"
            >
              Last change: {formatTime(cfg.updatedAt)} by{" "}
              {cfg.updatedBy ?? "—"}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
