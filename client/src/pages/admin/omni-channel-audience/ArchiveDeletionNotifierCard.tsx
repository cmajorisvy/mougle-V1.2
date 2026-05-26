import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ARCHIVE_DELETION_NOTIFIER_URL, buildArchiveDeletionNotifierPayload } from "../omni-channel-audience-forms";
import { ArchivePolicy, ArchiveStats, formatBytes } from "./_shared";
import {
  isValidIanaTimeZone as sharedIsValidIanaTimeZone,
  resolveBrowserTimeZone as sharedResolveBrowserTimeZone,
  useAdminTimeZonePreference,
} from "@/lib/admin-timezone";

type ArchiveSnoozePolicy =
  | { kind: "fixed" }
  | { kind: "auto_extend"; extendDays: number }
  | {
      kind: "weekday_mute";
      days: number[];
      startHour: number;
      endHour: number;
      timeZone?: string;
    };

// Task #615 — IANA time-zone validation that mirrors the server-side
// `isValidTimeZone` check. `Intl.DateTimeFormat` throws on unknown
// zones in both Node and modern browsers, so a try/catch is enough.
// Task #878 — Delegated to the shared admin-timezone helper so this
// page and the orphan-reconcile page share the exact same validator.
const isValidIanaTimeZone = sharedIsValidIanaTimeZone;

// Task #615 — small curated list of common IANA zones so the founder
// has a one-click pick without typing. The browser-detected zone and
// UTC are always present at the top; duplicates are de-duped while
// preserving order.
const COMMON_IANA_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Moscow",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

// Task #878 — Delegated to the shared admin-timezone helper.
const detectBrowserTimeZone = sharedResolveBrowserTimeZone;

interface ArchiveDeletionNotifierConfig {
  enabled: boolean;
  recipients: string[];
  warningLeadDays: number;
  digestIntervalHours: number;
  postCleanupFileThreshold: number;
  postCleanupBytesThreshold: number;
  lastDigestAt: string | null;
  lastDigestSignature: string | null;
  snoozeUntil: string | null;
  snoozeStartedAt: string | null;
  snoozeSuppressedCount: number;
  snoozeSuppressedFiles: number;
  snoozeSuppressedBytes: number;
  snoozePolicy: ArchiveSnoozePolicy;
  lastSnoozeRecapAt: string | null;
  lastSnoozeSource: "manual" | "auto" | "weekday_window" | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface ArchiveDeletionSnoozeLogEntry {
  id: string;
  snoozeId: string;
  startedAt: string;
  endedAt: string | null;
  endedReason: "expired" | "replaced" | "unsnoozed" | "cleared" | null;
  source: "manual" | "auto" | "weekday_window";
  policyKind: "fixed" | "auto_extend" | "weekday_mute";
  policyExtendDays: number | null;
  policyDays: number[] | null;
  policyStartHour: number | null;
  policyEndHour: number | null;
  snoozeUntil: string | null;
  createdBy: string | null;
  createdByDisplayName: string | null;
  createdByEmail: string | null;
  suppressedCount: number;
  suppressedFiles: number;
  suppressedBytes: number;
}

interface ArchiveDeletionNotifierHistoryEntry {
  id: string;
  kind: "digest" | "post_cleanup" | "test" | "snooze_recap";
  reason:
    | "sent"
    | "disabled"
    | "snoozed"
    | "no_recipients"
    | "no_pending_deletions"
    | "deduplicated"
    | "below_threshold"
    | "send_failed";
  notified: boolean;
  recipients: string[];
  fileCount: number;
  totalBytes: number;
  earliestExpiryIso: string | null;
  errorMessage: string | null;
  snoozeSource: "manual" | "auto" | "weekday_window" | null;
  occurredAt: string;
}

export function ArchiveDeletionNotifierCard() {
  const qc = useQueryClient();
  const configQuery = useQuery<{ config: ArchiveDeletionNotifierConfig }>({
    queryKey: ["/api/admin/newsroom/audience/retention/archive/deletion-notifier"],
  });
  const historyQuery = useQuery<{ history: ArchiveDeletionNotifierHistoryEntry[] }>({
    queryKey: [
      "/api/admin/newsroom/audience/retention/archive/deletion-notifier/history?limit=20",
    ],
    refetchInterval: 30_000,
  });
  const statsQuery = useQuery<{ policy: ArchivePolicy; stats: ArchiveStats }>({
    queryKey: ["/api/admin/newsroom/audience/retention/archive/policy"],
    refetchInterval: 30_000,
  });

  const [enabled, setEnabled] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [warningLeadDaysText, setWarningLeadDaysText] = useState("7");
  const [digestHoursText, setDigestHoursText] = useState("24");
  const [fileThresholdText, setFileThresholdText] = useState("10");
  const [mbThresholdText, setMbThresholdText] = useState("100");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Task #676: notify-on-weakening toggle for the archive-deletion notifier.
  const NOTIFY_ON_WEAKENING_URL =
    "/api/admin/newsroom/audience/retention/archive/deletion-notifier/notify-on-weakening";
  const notifyOnWeakeningQuery = useQuery<{ enabled: boolean }>({
    queryKey: [NOTIFY_ON_WEAKENING_URL],
  });
  const notifyOnWeakeningMutation = useMutation({
    mutationFn: async (next: boolean) =>
      apiRequest("POST", NOTIFY_ON_WEAKENING_URL, { enabled: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NOTIFY_ON_WEAKENING_URL] });
    },
  });

  useEffect(() => {
    const c = configQuery.data?.config;
    if (c && !hydrated) {
      setEnabled(c.enabled);
      setRecipientsText(c.recipients.join(", "));
      setWarningLeadDaysText(String(c.warningLeadDays));
      setDigestHoursText(String(c.digestIntervalHours));
      setFileThresholdText(String(c.postCleanupFileThreshold));
      setMbThresholdText(
        String(Math.max(0, Math.round(c.postCleanupBytesThreshold / (1024 * 1024)))),
      );
      setHydrated(true);
    }
  }, [configQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildArchiveDeletionNotifierPayload({
        enabled,
        recipientsText,
        warningLeadDaysText,
        digestHoursText,
        fileThresholdText,
        mbThresholdText,
      });
      return await apiRequest(
        "PUT",
        ARCHIVE_DELETION_NOTIFIER_URL,
        payload,
      );
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({
        queryKey: [ARCHIVE_DELETION_NOTIFIER_URL],
      });
    },
    onError: (e: any) => setSaveError(e?.message ?? "save failed"),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/archive/deletion-notifier/test",
      );
      return (await res.json()) as {
        ok: boolean;
        recipients: string[];
        errorMessage: string | null;
      };
    },
    onSuccess: (data) => {
      setSaveError(null);
      setTestResult(
        data.ok
          ? `Test sent to ${data.recipients.join(", ")}`
          : `Test failed: ${data.errorMessage ?? "unknown error"}`,
      );
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/retention/archive/deletion-notifier/history?limit=20",
        ],
      });
    },
    onError: (e: any) => {
      setTestResult(null);
      setSaveError(e?.message ?? "test send failed");
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async (vars: {
      snoozeUntil: string | null;
      snoozePolicy?: ArchiveSnoozePolicy | null;
    }) => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/archive/deletion-notifier/snooze",
        vars,
      );
      return (await res.json()) as { config: ArchiveDeletionNotifierConfig };
    },
    onSuccess: (data) => {
      setSaveError(null);
      const p = data.config.snoozePolicy;
      const policyLabel =
        p?.kind === "auto_extend"
          ? ` (auto-extending +${p.extendDays}d)`
          : p?.kind === "weekday_mute"
            ? ` (recurring weekday mute)`
            : "";
      setTestResult(
        data.config.snoozeUntil
          ? `Snoozed until ${new Date(data.config.snoozeUntil).toLocaleString()}${policyLabel}`
          : p?.kind === "weekday_mute"
            ? `Recurring weekday mute active${policyLabel}`
            : "Snooze cleared",
      );
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/retention/archive/deletion-notifier"],
      });
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/retention/archive/deletion-notifier/snooze-log?limit=10",
        ],
      });
    },
    onError: (e: any) => setSaveError(e?.message ?? "snooze failed"),
  });

  const snoozeLogQuery = useQuery<{ entries: ArchiveDeletionSnoozeLogEntry[] }>({
    queryKey: [
      "/api/admin/newsroom/audience/retention/archive/deletion-notifier/snooze-log?limit=10",
    ],
    refetchInterval: 60_000,
  });
  const snoozeLog = snoozeLogQuery.data?.entries ?? [];

  const [snoozeUntilText, setSnoozeUntilText] = useState("");

  // Task #615 — founder-pickable IANA time zone for the recurring
  // weekday_mute window. Defaults to the browser's detected zone so a
  // founder in LA doesn't accidentally configure a UTC window when
  // they meant local time.
  // Task #878 — Now sourced from the shared admin-wide timezone
  // preference (`mougle.admin.timeZone`) so picking a zone here also
  // applies to the orphan-reconcile flapping chart and any other
  // admin surface, and vice-versa. Per-page override still works:
  // changing the dropdown updates the shared preference. Reset
  // returns to the browser-detected default.
  const {
    timeZone: weekdayTimeZone,
    browserTimeZone,
    setTimeZone: setWeekdayTimeZone,
    resetTimeZone: resetWeekdayTimeZone,
  } = useAdminTimeZonePreference();

  const weekdayTimeZoneOptions = useMemo(() => {
    const persisted =
      configQuery.data?.config?.snoozePolicy?.kind === "weekday_mute"
        ? configQuery.data?.config?.snoozePolicy?.timeZone
        : undefined;
    const ordered = [browserTimeZone, ...COMMON_IANA_TIME_ZONES];
    if (persisted && isValidIanaTimeZone(persisted)) ordered.unshift(persisted);
    if (weekdayTimeZone && isValidIanaTimeZone(weekdayTimeZone)) {
      ordered.unshift(weekdayTimeZone);
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tz of ordered) {
      if (!tz || seen.has(tz)) continue;
      seen.add(tz);
      out.push(tz);
    }
    return out;
  }, [configQuery.data, weekdayTimeZone, browserTimeZone]);

  const snoozeFor = (ms: number) => {
    const until = new Date(Date.now() + ms).toISOString();
    snoozeMutation.mutate({ snoozeUntil: until, snoozePolicy: { kind: "fixed" } });
  };

  const snoozeAutoExtend = () => {
    // Start an auto-extending snooze for 1 day from now; the scheduler
    // will keep bumping it forward by 1 day until the founder unsnoozes.
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    snoozeMutation.mutate({
      snoozeUntil: until,
      snoozePolicy: { kind: "auto_extend", extendDays: 1 },
    });
  };

  const snoozeWeekdayMute = () => {
    // Mon–Fri 18:00 → next-day 08:00 in the founder's selected zone
    // (Task #615). Recurring mute window; no explicit snoozeUntil
    // needed. Reject unknown zones client-side before the round-trip
    // (the server already drops them, but the founder deserves a
    // visible error rather than silent UTC fallback).
    const tz = weekdayTimeZone || "UTC";
    if (!isValidIanaTimeZone(tz)) {
      setSaveError(`Invalid time zone: ${tz}`);
      return;
    }
    snoozeMutation.mutate({
      snoozeUntil: null,
      snoozePolicy: {
        kind: "weekday_mute",
        days: [1, 2, 3, 4, 5],
        startHour: 18,
        endHour: 8,
        timeZone: tz,
      },
    });
  };

  const snoozeUntilDate = () => {
    const v = snoozeUntilText.trim();
    if (!v) {
      setSaveError("pick a date/time first");
      return;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      setSaveError("invalid date/time");
      return;
    }
    if (d.getTime() <= Date.now()) {
      setSaveError("snooze must be in the future");
      return;
    }
    snoozeMutation.mutate({
      snoozeUntil: d.toISOString(),
      snoozePolicy: { kind: "fixed" },
    });
  };

  const testDigestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/archive/deletion-notifier/test-digest",
      );
      return (await res.json()) as {
        ok: boolean;
        recipients: string[];
        errorMessage: string | null;
      };
    },
    onSuccess: (data) => {
      setSaveError(null);
      setTestResult(
        data.ok
          ? `Digest preview sent to ${data.recipients.join(", ")}`
          : `Digest preview failed: ${data.errorMessage ?? "unknown error"}`,
      );
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/retention/archive/deletion-notifier/history?limit=20",
        ],
      });
    },
    onError: (e: any) => {
      setTestResult(null);
      setSaveError(e?.message ?? "digest preview failed");
    },
  });

  const resendRecapMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/archive/deletion-notifier/resend-recap",
      );
      return (await res.json()) as {
        result: {
          recapSent: boolean;
          reason: string;
          suppressedCount: number;
          suppressedFiles: number;
          suppressedBytes: number;
          recipients: string[];
          errorMessage: string | null;
        };
      };
    },
    onSuccess: (data) => {
      const r = data.result;
      if (r.recapSent) {
        setSaveError(null);
        setTestResult(
          `Recap resent to ${r.recipients.join(", ")} (${r.suppressedCount} alert${r.suppressedCount === 1 ? "" : "s"})`,
        );
      } else {
        setTestResult(null);
        setSaveError(`Resend skipped: ${r.reason}${r.errorMessage ? ` — ${r.errorMessage}` : ""}`);
      }
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/retention/archive/deletion-notifier/history?limit=20",
        ],
      });
    },
    onError: (e: any) => setSaveError(e?.message ?? "resend failed"),
  });

  const runDigestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/archive/deletion-notifier/run-digest",
      );
      return (await res.json()) as { result: { notified: boolean; reason: string } };
    },
    onSuccess: (data) => {
      setTestResult(
        data.result.notified
          ? `Digest sent (${data.result.reason})`
          : `Digest skipped (${data.result.reason})`,
      );
      qc.invalidateQueries({
        queryKey: [
          "/api/admin/newsroom/audience/retention/archive/deletion-notifier/history?limit=20",
        ],
      });
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/retention/archive/deletion-notifier"],
      });
    },
    onError: (e: any) => setSaveError(e?.message ?? "digest run failed"),
  });

  const config = configQuery.data?.config;
  const history = historyQuery.data?.history ?? [];
  const archiveStats = statsQuery.data?.stats;
  const archivePolicy = statsQuery.data?.policy;
  const previewFiles = archiveStats?.expiredFileCount ?? 0;
  const previewBytes = archiveStats?.expiredBytes ?? 0;
  const previewMb = previewBytes / (1024 * 1024);
  const liveFileThreshold = Math.max(0, Math.floor(Number(fileThresholdText) || 0));
  const liveBytesThreshold = Math.max(0, Math.floor(Number(mbThresholdText) || 0)) * 1024 * 1024;
  const autoDeleteOff = archivePolicy?.autoDeleteEnabled === false;
  const wouldDeleteAnything = previewFiles > 0 && !autoDeleteOff;
  const overFiles =
    wouldDeleteAnything && liveFileThreshold > 0 && previewFiles >= liveFileThreshold;
  const overBytes =
    wouldDeleteAnything && liveBytesThreshold > 0 && previewBytes >= liveBytesThreshold;
  const sweepWouldDoNothing = !wouldDeleteAnything;
  const subjectPreview = autoDeleteOff
    ? "(next sweep would skip — auto-delete is OFF)"
    : previewFiles === 0
      ? "(next sweep would skip — no expired files)"
      : `[ARCHIVE] ${previewFiles.toLocaleString()} audience archive file${previewFiles === 1 ? "" : "s"} permanently deleted (${previewMb.toFixed(2)} MB)`;

  const nextBatchPreview = archiveStats?.nextExpiryBatch;
  const digestFileCount = nextBatchPreview?.fileCount ?? 0;
  const digestBytes = nextBatchPreview?.totalBytes ?? 0;
  const digestMb = digestBytes / (1024 * 1024);
  const digestWarningLeadDays = nextBatchPreview?.withinDays ?? 0;
  const digestEarliestIso = nextBatchPreview?.earliestExpiryIso ?? null;
  const digestSubjectPreview =
    digestFileCount === 0
      ? "(no upcoming-expiry digest — no files due in the warning window)"
      : `[ARCHIVE] ${digestFileCount.toLocaleString()} audience archive file${digestFileCount === 1 ? "" : "s"} scheduled for permanent deletion within ${digestWarningLeadDays}d`;
  const liveDigestIntervalHours = Math.max(1, Math.floor(Number(digestHoursText) || 24));
  const lastDigestMs = config?.lastDigestAt ? Date.parse(config.lastDigestAt) : NaN;
  const nextDigestEligibleMs = Number.isFinite(lastDigestMs)
    ? lastDigestMs + liveDigestIntervalHours * 60 * 60 * 1000
    : null;
  const nowMs = Date.now();
  const withinDedupWindow =
    nextDigestEligibleMs !== null && nowMs < nextDigestEligibleMs;
  const currentDigestSignature = `${digestFileCount}|${digestEarliestIso ?? "none"}`;
  const sameDigestSignature =
    config?.lastDigestSignature !== null &&
    config?.lastDigestSignature === currentDigestSignature;
  const digestWouldDedup =
    digestFileCount > 0 && withinDedupWindow && sameDigestSignature;
  const digestWouldSend = digestFileCount > 0 && !digestWouldDedup;
  const nextDigestLabel =
    digestFileCount === 0
      ? "—"
      : !Number.isFinite(lastDigestMs)
        ? "as soon as the scheduler ticks (no digest sent yet)"
        : withinDedupWindow && sameDigestSignature
          ? `deduplicated until ${new Date(nextDigestEligibleMs!).toLocaleString()}`
          : withinDedupWindow && !sameDigestSignature
            ? "as soon as the scheduler ticks (batch changed since last digest)"
            : "as soon as the scheduler ticks (dedup window elapsed)";

  return (
    <Card data-testid="card-archive-deletion-notifier">
      <CardHeader>
        <CardTitle>Archive Deletion Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Email founder / ops a daily digest when audience archive files are
          about to be permanently deleted, plus a post-cleanup summary
          whenever a sweep crosses your file or byte threshold. Toggle off
          to mute entirely.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Enabled</span>
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-archive-notifier-enabled"
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Warning lead (days)</span>
            <Input
              value={warningLeadDaysText}
              onChange={(e) => setWarningLeadDaysText(e.target.value)}
              data-testid="input-archive-notifier-lead-days"
              inputMode="numeric"
              placeholder="7"
            />
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Digest interval (hours)</span>
            <Input
              value={digestHoursText}
              onChange={(e) => setDigestHoursText(e.target.value)}
              data-testid="input-archive-notifier-digest-hours"
              inputMode="numeric"
              placeholder="24"
            />
          </label>
        </div>
        <div
          className="rounded border bg-muted/30 p-3 text-xs space-y-1"
          data-testid="block-archive-notifier-next-sweep-preview"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">Next sweep would delete:</span>
            <span data-testid="text-archive-notifier-preview-files">
              ~{previewFiles.toLocaleString()} file{previewFiles === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span data-testid="text-archive-notifier-preview-bytes">
              ~{previewMb.toFixed(2)} MB
            </span>
            {statsQuery.isLoading && (
              <span className="text-muted-foreground">(loading…)</span>
            )}
            {archivePolicy && archivePolicy.autoDeleteEnabled === false && (
              <Badge variant="outline" data-testid="badge-archive-notifier-autodelete-off">
                auto-delete OFF
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground">
            Email subject preview:{" "}
            <code
              className="font-mono text-[11px]"
              data-testid="text-archive-notifier-subject-preview"
            >
              {subjectPreview}
            </code>
          </div>
        </div>
        <div
          className="rounded border bg-muted/30 p-3 text-xs space-y-1"
          data-testid="block-archive-notifier-digest-preview"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">Upcoming-expiry digest:</span>
            <span data-testid="text-archive-notifier-digest-files">
              ~{digestFileCount.toLocaleString()} file{digestFileCount === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span data-testid="text-archive-notifier-digest-bytes">
              ~{digestMb.toFixed(2)} MB
            </span>
            <span className="text-muted-foreground">·</span>
            <span data-testid="text-archive-notifier-digest-window">
              within {digestWarningLeadDays}d
            </span>
            {digestWouldSend && (
              <Badge variant="default" data-testid="badge-archive-notifier-digest-status">
                would send
              </Badge>
            )}
            {digestWouldDedup && (
              <Badge variant="secondary" data-testid="badge-archive-notifier-digest-status">
                would dedup
              </Badge>
            )}
            {digestFileCount === 0 && (
              <Badge variant="outline" data-testid="badge-archive-notifier-digest-status">
                nothing due
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground">
            Email subject preview:{" "}
            <code
              className="font-mono text-[11px]"
              data-testid="text-archive-notifier-digest-subject-preview"
            >
              {digestSubjectPreview}
            </code>
          </div>
          <div className="text-muted-foreground">
            Next digest at:{" "}
            <span data-testid="text-archive-notifier-digest-next-at">
              {nextDigestLabel}
            </span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground flex items-center gap-2">
              Cleanup file threshold
              <Badge
                variant={overFiles ? "default" : "secondary"}
                data-testid="badge-archive-notifier-file-threshold-status"
              >
                {overFiles ? "would alert" : "would stay quiet"}
              </Badge>
            </span>
            <Input
              value={fileThresholdText}
              onChange={(e) => setFileThresholdText(e.target.value)}
              data-testid="input-archive-notifier-file-threshold"
              inputMode="numeric"
              placeholder="10"
            />
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground flex items-center gap-2">
              Cleanup bytes threshold (MB)
              <Badge
                variant={overBytes ? "default" : "secondary"}
                data-testid="badge-archive-notifier-bytes-threshold-status"
              >
                {overBytes ? "would alert" : "would stay quiet"}
              </Badge>
            </span>
            <Input
              value={mbThresholdText}
              onChange={(e) => setMbThresholdText(e.target.value)}
              data-testid="input-archive-notifier-bytes-threshold"
              inputMode="numeric"
              placeholder="100"
            />
          </label>
          <div className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Last digest sent</span>
            <div
              className="h-9 rounded border bg-muted/30 px-2 text-sm flex items-center"
              data-testid="text-archive-notifier-last-digest"
            >
              {config?.lastDigestAt
                ? new Date(config.lastDigestAt).toLocaleString()
                : "Never"}
            </div>
          </div>
        </div>
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">Recipients (comma or space separated)</span>
          <Input
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            data-testid="input-archive-notifier-recipients"
            placeholder="founder@example.com, ops@example.com"
          />
        </label>
        <label
          className="flex items-center gap-2 text-[11px] cursor-pointer select-none"
          data-testid="label-archive-deletion-notify-on-weakening"
        >
          <input
            type="checkbox"
            className="h-3 w-3"
            checked={notifyOnWeakeningQuery.data?.enabled ?? true}
            disabled={
              notifyOnWeakeningQuery.isLoading ||
              notifyOnWeakeningMutation.isPending
            }
            onChange={(e) =>
              notifyOnWeakeningMutation.mutate(e.target.checked)
            }
            data-testid="checkbox-archive-deletion-notify-on-weakening"
          />
          <span>
            Notify on weakening (email all root admins when this notifier is
            turned off or a post-cleanup threshold is loosened by 2x+)
          </span>
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-archive-notifier-save"
          >
            {saveMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={
              testMutation.isPending ||
              !config ||
              config.recipients.length === 0
            }
            data-testid="button-archive-notifier-test"
          >
            {testMutation.isPending ? "Sending…" : "Send test email"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => testDigestMutation.mutate()}
            disabled={
              testDigestMutation.isPending ||
              !config ||
              config.recipients.length === 0
            }
            data-testid="button-archive-notifier-test-digest"
          >
            {testDigestMutation.isPending ? "Sending…" : "Send test digest"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runDigestMutation.mutate()}
            disabled={runDigestMutation.isPending || !config?.enabled}
            data-testid="button-archive-notifier-run-digest"
          >
            {runDigestMutation.isPending ? "Running…" : "Run digest now"}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resendRecapMutation.mutate()}
                disabled={
                  resendRecapMutation.isPending ||
                  !config?.enabled ||
                  !config?.lastSnoozeRecapAt ||
                  (config?.recipients.length ?? 0) === 0
                }
                data-testid="button-archive-notifier-resend-recap"
              >
                {resendRecapMutation.isPending ? "Sending…" : "Resend last recap"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[260px]">
                Re-send the most recent "snooze ended — here's what you missed"
                recap email using the counters persisted from that snooze
                window. Useful when the auto-fired recap bounced or got
                deleted. Does not change snooze or dedup state.
              </p>
            </TooltipContent>
          </Tooltip>
          {config && (
            <Badge variant="outline" data-testid="badge-archive-notifier-status">
              {config.enabled ? "Enabled" : "Disabled"} · {config.recipients.length}{" "}
              recipient{config.recipients.length === 1 ? "" : "s"} · lead{" "}
              {config.warningLeadDays}d
            </Badge>
          )}
          {config?.snoozeUntil &&
            new Date(config.snoozeUntil).getTime() > Date.now() && (
              <>
                <Badge
                  variant="destructive"
                  data-testid="badge-archive-notifier-snoozed-until"
                >
                  Snoozed until {new Date(config.snoozeUntil).toLocaleString()}
                  {config.snoozePolicy?.kind === "auto_extend" &&
                    ` · auto-extending +${config.snoozePolicy.extendDays}d`}
                  {config.lastSnoozeSource === "auto" && " · auto-extended"}
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      data-testid="badge-archive-notifier-snooze-suppressed"
                    >
                      {config.snoozeSuppressedCount.toLocaleString()} alert
                      {config.snoozeSuppressedCount === 1 ? "" : "s"} suppressed
                      while snoozed
                      {config.snoozeSuppressedCount > 0 && (
                        <>
                          {" "}
                          ({config.snoozeSuppressedFiles.toLocaleString()} file
                          {config.snoozeSuppressedFiles === 1 ? "" : "s"} /{" "}
                          {(
                            config.snoozeSuppressedBytes /
                            (1024 * 1024)
                          ).toFixed(2)}{" "}
                          MB)
                        </>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-[260px]">
                      Running count of digest and post-cleanup alerts that
                      were swallowed during the current snooze window.
                      Includes both the upcoming-expiry digest and the
                      post-cleanup summary. Resets when the snooze is
                      cleared, replaced, or expires.
                      {config.snoozeStartedAt && (
                        <>
                          <br />
                          <span className="text-muted-foreground">
                            Snooze started{" "}
                            {new Date(config.snoozeStartedAt).toLocaleString()}
                          </span>
                        </>
                      )}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          {config?.snoozePolicy?.kind === "weekday_mute" && (
            <Badge
              variant="destructive"
              data-testid="badge-archive-notifier-weekday-mute"
            >
              Weekday mute · {config.snoozePolicy.days.join(",")} ·{" "}
              {String(config.snoozePolicy.startHour).padStart(2, "0")}:00→
              {String(config.snoozePolicy.endHour).padStart(2, "0")}:00{" "}
              <span data-testid="text-archive-notifier-weekday-mute-tz">
                {config.snoozePolicy.timeZone ?? "UTC"}
              </span>
            </Badge>
          )}
          {testResult && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-archive-notifier-test-result"
            >
              {testResult}
            </span>
          )}
          {saveError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-archive-notifier-error"
            >
              {saveError}
            </span>
          )}
        </div>
        <div
          className="flex gap-2 flex-wrap items-center pt-1 border-t pt-3"
          data-testid="block-archive-notifier-snooze"
        >
          <span className="text-xs text-muted-foreground">
            Snooze alerts (recipients & thresholds stay configured):
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => snoozeFor(24 * 60 * 60 * 1000)}
            disabled={snoozeMutation.isPending}
            data-testid="button-archive-notifier-snooze-1d"
          >
            Snooze 1 day
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => snoozeFor(7 * 24 * 60 * 60 * 1000)}
            disabled={snoozeMutation.isPending}
            data-testid="button-archive-notifier-snooze-1w"
          >
            Snooze 1 week
          </Button>
          <Input
            type="datetime-local"
            value={snoozeUntilText}
            onChange={(e) => setSnoozeUntilText(e.target.value)}
            className="h-9 w-auto"
            data-testid="input-archive-notifier-snooze-until"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={snoozeUntilDate}
            disabled={snoozeMutation.isPending || !snoozeUntilText}
            data-testid="button-archive-notifier-snooze-until"
          >
            Snooze until date
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={snoozeAutoExtend}
            disabled={snoozeMutation.isPending}
            data-testid="button-archive-notifier-snooze-auto-extend"
          >
            Auto-extend until I unsnooze
          </Button>
          <label
            className="text-xs flex items-center gap-1"
            data-testid="label-archive-notifier-weekday-tz"
          >
            <span className="text-muted-foreground">Zone</span>
            <select
              value={weekdayTimeZone}
              onChange={(e) => setWeekdayTimeZone(e.target.value)}
              className="h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-archive-notifier-weekday-tz"
              title={`Browser: ${browserTimeZone} (shared admin preference)`}
            >
              {weekdayTimeZoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz === browserTimeZone ? `${tz} (browser)` : tz}
                </option>
              ))}
            </select>
            {weekdayTimeZone !== browserTimeZone && (
              <button
                type="button"
                className="text-xs underline text-muted-foreground hover:text-foreground"
                onClick={() => resetWeekdayTimeZone()}
                data-testid="button-archive-notifier-weekday-tz-reset"
              >
                reset
              </button>
            )}
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={snoozeWeekdayMute}
            disabled={
              snoozeMutation.isPending || !isValidIanaTimeZone(weekdayTimeZone)
            }
            data-testid="button-archive-notifier-snooze-weekday"
          >
            Snooze every weekday (Mon–Fri 18→8 {weekdayTimeZone || "UTC"})
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              snoozeMutation.mutate({
                snoozeUntil: null,
                snoozePolicy: { kind: "fixed" },
              })
            }
            disabled={
              snoozeMutation.isPending ||
              ((!config?.snoozeUntil ||
                new Date(config.snoozeUntil).getTime() <= Date.now()) &&
                config?.snoozePolicy?.kind !== "auto_extend" &&
                config?.snoozePolicy?.kind !== "weekday_mute")
            }
            data-testid="button-archive-notifier-unsnooze"
          >
            Unsnooze
          </Button>
        </div>
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-2">
            Past snooze windows (last 10)
          </div>
          {snoozeLogQuery.isLoading ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-archive-notifier-snooze-log-loading"
            >
              Loading…
            </p>
          ) : snoozeLog.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-no-archive-notifier-snooze-log"
            >
              No snooze windows recorded yet.
            </p>
          ) : (
            <div className="space-y-1">
              {snoozeLog.map((s) => {
                const policyLabel =
                  s.policyKind === "auto_extend"
                    ? `auto-extend +${s.policyExtendDays ?? 0}d`
                    : s.policyKind === "weekday_mute"
                      ? `weekday mute (${(s.policyDays ?? []).join(",")} ${s.policyStartHour ?? "?"}–${s.policyEndHour ?? "?"})`
                      : "fixed";
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-xs rounded border p-2 gap-2"
                    data-testid={`row-archive-notifier-snooze-log-${s.id}`}
                  >
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge
                        variant={s.endedAt === null ? "default" : "outline"}
                      >
                        {s.endedAt === null ? "open" : (s.endedReason ?? "closed")}
                      </Badge>
                      <Badge variant="outline">{s.source}</Badge>
                      <Badge variant="outline">{policyLabel}</Badge>
                      <span className="text-muted-foreground">
                        suppressed:{s.suppressedCount}
                      </span>
                      <span className="text-muted-foreground">
                        files:{s.suppressedFiles}
                      </span>
                      <span className="text-muted-foreground">
                        bytes:{formatBytes(s.suppressedBytes)}
                      </span>
                      <span className="text-muted-foreground">
                        started:{new Date(s.startedAt).toLocaleString()}
                      </span>
                      {s.endedAt && (
                        <span className="text-muted-foreground">
                          ended:{new Date(s.endedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div
                      className="text-muted-foreground truncate max-w-[30%]"
                      title={s.createdBy ?? undefined}
                    >
                      {s.createdByDisplayName
                        ? `${s.createdByDisplayName}${s.createdByEmail ? ` (${s.createdByEmail})` : ""}`
                        : s.createdByEmail ?? s.createdBy ?? ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-2">
            Recent notifications
          </div>
          {historyQuery.isLoading ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-archive-notifier-history-loading"
            >
              Loading…
            </p>
          ) : history.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-no-archive-notifier-history"
            >
              No notifications yet. Enable the notifier and the next archive
              sweep (or a manual digest) will populate this list.
            </p>
          ) : (
            <div className="space-y-1">
              {history.map((h) => {
                const isRecap = h.kind === "snooze_recap";
                let recapTrigger: string | null = null;
                let recapSuppressedCount: number | null = null;
                let recapErrorDetail: string | null = null;
                if (isRecap && h.errorMessage) {
                  const parts = h.errorMessage.split(";");
                  for (const p of parts) {
                    const [k, ...rest] = p.split(":");
                    const v = rest.join(":");
                    if (k === "trigger") recapTrigger = v;
                    else if (k === "count") {
                      const n = Number(v);
                      if (Number.isFinite(n)) recapSuppressedCount = n;
                    } else if (p.trim().length > 0) {
                      recapErrorDetail =
                        (recapErrorDetail ? `${recapErrorDetail};` : "") + p;
                    }
                  }
                }
                const triggerLabel =
                  recapTrigger === "manual_unsnooze"
                    ? "manual unsnooze"
                    : recapTrigger === "natural_expiry"
                      ? "natural expiry"
                      : recapTrigger === "replaced"
                        ? "replaced"
                        : null;
                const kindLabel = isRecap ? "Snooze recap" : h.kind;
                const trailing = isRecap
                  ? h.reason === "send_failed"
                    ? recapErrorDetail ?? "send failed"
                    : h.recipients.join(", ")
                  : h.errorMessage ?? h.recipients.join(", ");
                return (
                  <div
                    key={h.id}
                    className="flex items-center justify-between text-xs rounded border p-2 gap-2"
                    data-testid={`row-archive-notifier-history-${h.id}`}
                  >
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge
                        variant={
                          h.notified
                            ? "default"
                            : h.reason === "send_failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {h.reason}
                      </Badge>
                      <Badge
                        variant={isRecap ? "default" : "outline"}
                        data-testid={`badge-archive-notifier-kind-${h.id}`}
                      >
                        {kindLabel}
                      </Badge>
                      {isRecap && triggerLabel && (
                        <Badge
                          variant="outline"
                          data-testid={`badge-archive-notifier-recap-trigger-${h.id}`}
                        >
                          trigger: {triggerLabel}
                        </Badge>
                      )}
                      {h.reason === "snoozed" && h.snoozeSource && (
                        <Badge
                          variant={h.snoozeSource === "auto" ? "default" : "outline"}
                          data-testid={`badge-archive-notifier-snooze-source-${h.id}`}
                        >
                          {h.snoozeSource === "manual"
                            ? "manual snooze"
                            : h.snoozeSource === "auto"
                              ? "auto-extended"
                              : "weekday window"}
                        </Badge>
                      )}
                      {isRecap && recapSuppressedCount !== null && (
                        <span
                          className="text-muted-foreground"
                          data-testid={`text-archive-notifier-recap-suppressed-${h.id}`}
                        >
                          suppressed:{recapSuppressedCount}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        files:{h.fileCount}
                      </span>
                      <span className="text-muted-foreground">
                        bytes:{formatBytes(h.totalBytes)}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(h.occurredAt).toLocaleString()}
                      </span>
                    </div>
                    <div
                      className={`truncate max-w-[40%] ${
                        isRecap && h.reason === "send_failed"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                      data-testid={
                        isRecap && h.reason === "send_failed"
                          ? `text-archive-notifier-recap-error-${h.id}`
                          : undefined
                      }
                    >
                      {trailing}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
