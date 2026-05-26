import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AudienceAuditRiskSignal,
  PLATFORMS,
  RISK_SIGNAL_BADGE_CLASS,
  RISK_SIGNAL_DESCRIPTIONS,
  RISK_SIGNAL_LABELS,
  RISK_SIGNAL_ORDER,
} from "./_shared";

const HISTORY_EXPORT_FILTER_STORAGE_KEY =
  "mougle.omniChannelAudience.historyExportFilters.v2";

// Task #703 — the history hard cap is founder-configurable and lives
// in `system_settings` under `audience_audit_export_history_row_cap`.
// We fetch the live value from `/api/admin/newsroom/audience/export/row-cap`
// so the preflight `confirm()` + inline "filtered total vs cap" hint
// agree with the server on the truncation boundary. The constant below
// is only the first-paint fallback before the query resolves.
const AUDIT_EXPORT_HISTORY_ROW_CAP_FALLBACK = 100_000;
const ROW_CAP_URL = "/api/admin/newsroom/audience/export/row-cap";

// Task #555 — soft warning threshold for the Download history buttons.
// Task #597 — the threshold is now stored server-side in `system_settings`
// under `audience_audit_export_warn_threshold` and loaded from
// `/api/admin/newsroom/audience/export-log/warn-threshold` so a founder
// can set the team-wide guardrail once and have it apply for every
// admin, browser, and incognito session. The localStorage entry is
// retained as a last-resort cache (e.g. first paint before the server
// query resolves), but the server value always wins once it arrives.
const HISTORY_EXPORT_WARN_THRESHOLD_STORAGE_KEY =
  "mougle.omniChannelAudience.historyExportWarnThreshold.v1";
const HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT = 10000;
const HISTORY_EXPORT_WARN_THRESHOLD_URL =
  "/api/admin/newsroom/audience/export-log/warn-threshold";

function readHistoryExportWarnThreshold(): number {
  if (typeof window === "undefined") return HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT;
  try {
    const raw = window.localStorage.getItem(
      HISTORY_EXPORT_WARN_THRESHOLD_STORAGE_KEY,
    );
    if (!raw) return HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT;
    }
    return Math.floor(n);
  } catch {
    return HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT;
  }
}

function writeHistoryExportWarnThreshold(value: number) {
  if (typeof window === "undefined") return;
  try {
    if (value === HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT) {
      window.localStorage.removeItem(HISTORY_EXPORT_WARN_THRESHOLD_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      HISTORY_EXPORT_WARN_THRESHOLD_STORAGE_KEY,
      String(value),
    );
  } catch {
    // ignore quota / privacy-mode errors
  }
}

type HistoryExportPersistedField =
  | "actorId"
  | "from"
  | "to"
  | "platform"
  | "formatFilter"
  | "minRows";

function readHistoryExportFilter(field: HistoryExportPersistedField): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(HISTORY_EXPORT_FILTER_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const value = parsed?.[field];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

const HISTORY_EXPORT_URL_KEYS: readonly HistoryExportPersistedField[] = [
  "actorId",
  "from",
  "to",
  "platform",
  "formatFilter",
  "minRows",
];

function readHistoryExportUrlFilter(field: HistoryExportPersistedField): string {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(field);
    return v ?? "";
  } catch {
    return "";
  }
}

function hasAnyHistoryExportUrlFilter(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return HISTORY_EXPORT_URL_KEYS.some((k) => params.get(k) !== null);
  } catch {
    return false;
  }
}

function readHistoryExportFilterInitial(
  field: HistoryExportPersistedField,
): string {
  if (hasAnyHistoryExportUrlFilter()) {
    return readHistoryExportUrlFilter(field);
  }
  return readHistoryExportFilter(field);
}

function writeHistoryExportFilters(values: {
  actorId: string;
  from: string;
  to: string;
  platform: string;
  formatFilter: string;
  minRows: string;
}) {
  if (typeof window === "undefined") return;
  try {
    if (
      !values.actorId &&
      !values.from &&
      !values.to &&
      !values.platform &&
      !values.formatFilter &&
      !values.minRows
    ) {
      window.localStorage.removeItem(HISTORY_EXPORT_FILTER_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      HISTORY_EXPORT_FILTER_STORAGE_KEY,
      JSON.stringify(values),
    );
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function ExportLogCard(_props: { productionId: string }) {
  const qc = useQueryClient();

  // Task #703 — load the founder-configurable hard cap for the
  // history downloads. Used by both preflight `confirm()` paths and
  // the inline "exceeds N row" hint on the list view.
  type RowCapConfig = {
    rowCap: number;
    isDefault: boolean;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  type RowCapResponse = {
    caps: { trail: RowCapConfig; history: RowCapConfig };
    defaultRowCap: number;
    minRowCap: number;
    maxRowCap: number;
  };
  const rowCapQuery = useQuery<RowCapResponse>({ queryKey: [ROW_CAP_URL] });
  const historyCap =
    rowCapQuery.data?.caps.history.rowCap ??
    AUDIT_EXPORT_HISTORY_ROW_CAP_FALLBACK;
  const rowCapDefault =
    rowCapQuery.data?.defaultRowCap ?? AUDIT_EXPORT_HISTORY_ROW_CAP_FALLBACK;
  const rowCapMin = rowCapQuery.data?.minRowCap ?? 1000;
  const rowCapMax = rowCapQuery.data?.maxRowCap ?? 1_000_000;
  const [historyCapInput, setHistoryCapInput] = useState<string>("");
  const [historyCapError, setHistoryCapError] = useState<string | null>(null);
  const historyCapMutation = useMutation({
    mutationFn: async (rowCap: number | null) => {
      return await apiRequest("PUT", ROW_CAP_URL, {
        kind: "history",
        rowCap,
      });
    },
    onSuccess: () => {
      setHistoryCapError(null);
      setHistoryCapInput("");
      qc.invalidateQueries({ queryKey: [ROW_CAP_URL] });
    },
    onError: (e: any) =>
      setHistoryCapError(e?.message ?? "failed to save row cap"),
  });
  const commitHistoryCap = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      historyCapMutation.mutate(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
      setHistoryCapError("Enter a whole number of rows");
      return;
    }
    if (n < rowCapMin || n > rowCapMax) {
      setHistoryCapError(
        `Cap must be between ${rowCapMin.toLocaleString()} and ${rowCapMax.toLocaleString()}`,
      );
      return;
    }
    historyCapMutation.mutate(n);
  };

  const [historyExporting, setHistoryExporting] = useState<null | "json" | "csv">(null);
  const [historyExportError, setHistoryExportError] = useState<string | null>(null);
  const [filteredHistoryExporting, setFilteredHistoryExporting] = useState<null | "json" | "csv">(null);
  const [filteredHistoryExportError, setFilteredHistoryExportError] = useState<string | null>(null);
  const [historyExportFrom, setHistoryExportFrom] = useState<string>(
    () => readHistoryExportFilterInitial("from"),
  );
  const [historyExportTo, setHistoryExportTo] = useState<string>(
    () => readHistoryExportFilterInitial("to"),
  );
  const [historyExportActorId, setHistoryExportActorId] = useState<string>(
    () => readHistoryExportFilterInitial("actorId"),
  );
  const [historyExportPlatform, setHistoryExportPlatform] = useState<string>(
    () => readHistoryExportFilterInitial("platform"),
  );
  const [historyExportFormatFilter, setHistoryExportFormatFilter] = useState<string>(
    () => readHistoryExportFilterInitial("formatFilter"),
  );
  const [historyExportMinRows, setHistoryExportMinRows] = useState<string>(
    () => readHistoryExportFilterInitial("minRows"),
  );
  const [historyExportCopyLinkStatus, setHistoryExportCopyLinkStatus] =
    useState<"idle" | "copied" | "error">("idle");
  const [historyExportWarnThreshold, setHistoryExportWarnThresholdState] =
    useState<number>(() => readHistoryExportWarnThreshold());
  const [historyExportWarnThresholdInput, setHistoryExportWarnThresholdInput] =
    useState<string>(() => {
      const v = readHistoryExportWarnThreshold();
      return v === HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT ? "" : String(v);
    });
  const [historyExportWarnThresholdError, setHistoryExportWarnThresholdError] =
    useState<string | null>(null);
  const historyExportWarnThresholdQuery = useQuery<{
    config: {
      threshold: number;
      isDefault: boolean;
      updatedAt: string | null;
      updatedBy: string | null;
    };
    defaultThreshold: number;
  }>({
    queryKey: [HISTORY_EXPORT_WARN_THRESHOLD_URL],
  });
  useEffect(() => {
    const cfg = historyExportWarnThresholdQuery.data?.config;
    if (!cfg) return;
    setHistoryExportWarnThresholdState(cfg.threshold);
    setHistoryExportWarnThresholdInput(
      cfg.threshold === HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT
        ? ""
        : String(cfg.threshold),
    );
    writeHistoryExportWarnThreshold(cfg.threshold);
    setHistoryExportWarnThresholdError(null);
  }, [historyExportWarnThresholdQuery.data?.config?.threshold]);
  const historyExportWarnThresholdMutation = useMutation({
    mutationFn: async (threshold: number | null) => {
      return await apiRequest(
        "PUT",
        HISTORY_EXPORT_WARN_THRESHOLD_URL,
        { threshold },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [HISTORY_EXPORT_WARN_THRESHOLD_URL] });
    },
    onError: (e: any) =>
      setHistoryExportWarnThresholdError(
        e?.message ?? "failed to save threshold",
      ),
  });
  const commitHistoryExportWarnThreshold = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      setHistoryExportWarnThresholdState(HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT);
      writeHistoryExportWarnThreshold(HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT);
      setHistoryExportWarnThresholdError(null);
      historyExportWarnThresholdMutation.mutate(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
      setHistoryExportWarnThresholdError(
        "Enter a non-negative whole number (rows)",
      );
      return;
    }
    setHistoryExportWarnThresholdState(n);
    writeHistoryExportWarnThreshold(n);
    setHistoryExportWarnThresholdError(null);
    historyExportWarnThresholdMutation.mutate(n);
  };

  useEffect(() => {
    writeHistoryExportFilters({
      actorId: historyExportActorId,
      from: historyExportFrom,
      to: historyExportTo,
      platform: historyExportPlatform,
      formatFilter: historyExportFormatFilter,
      minRows: historyExportMinRows,
    });
  }, [
    historyExportActorId,
    historyExportFrom,
    historyExportTo,
    historyExportPlatform,
    historyExportFormatFilter,
    historyExportMinRows,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const fields: Record<HistoryExportPersistedField, string> = {
        actorId: historyExportActorId.trim(),
        from: historyExportFrom,
        to: historyExportTo,
        platform: historyExportPlatform,
        formatFilter: historyExportFormatFilter,
        minRows: historyExportMinRows.trim(),
      };
      for (const key of HISTORY_EXPORT_URL_KEYS) {
        const v = fields[key];
        if (v) params.set(key, v);
        else params.delete(key);
      }
      const qs = params.toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next !== current) {
        window.history.replaceState(null, "", next);
      }
    } catch {
      // ignore — URL update is best-effort
    }
  }, [
    historyExportActorId,
    historyExportFrom,
    historyExportTo,
    historyExportPlatform,
    historyExportFormatFilter,
    historyExportMinRows,
  ]);

  const copyHistoryExportShareLink = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("clipboard_unavailable");
      }
      setHistoryExportCopyLinkStatus("copied");
    } catch {
      setHistoryExportCopyLinkStatus("error");
    } finally {
      window.setTimeout(() => setHistoryExportCopyLinkStatus("idle"), 1800);
    }
  };

  const resetSavedHistoryExportFilters = () => {
    setHistoryExportActorId("");
    setHistoryExportFrom("");
    setHistoryExportTo("");
    setHistoryExportPlatform("");
    setHistoryExportFormatFilter("");
    setHistoryExportMinRows("");
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(HISTORY_EXPORT_FILTER_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  const hasPersistedHistoryExportFilters = Boolean(
    historyExportActorId ||
      historyExportFrom ||
      historyExportTo ||
      historyExportPlatform ||
      historyExportFormatFilter ||
      historyExportMinRows,
  );

  const [logActorId, setLogActorId] = useState<string>("");
  const [logFrom, setLogFrom] = useState<string>("");
  const [logTo, setLogTo] = useState<string>("");
  const [logPlatform, setLogPlatform] = useState<string>("");
  const [logFormat, setLogFormat] = useState<string>("");
  const [logMinRows, setLogMinRows] = useState<string>("");
  const [logFlaggedOnly, setLogFlaggedOnly] = useState<boolean>(false);
  const [trendView, setTrendView] = useState<"all" | "byActor">("all");
  const [trendShowWindowStats, setTrendShowWindowStats] = useState<boolean>(true);
  const [logSortBy, setLogSortBy] = useState<"exportedAt" | "totalRowCount">("exportedAt");
  const [logSortOrder, setLogSortOrder] = useState<"asc" | "desc">("desc");
  const [logPageSize, setLogPageSize] = useState<number>(25);
  const [logPage, setLogPage] = useState<number>(0);

  const downloadFilteredExportHistory = async (format: "json" | "csv") => {
    // Task #632 — hard-cap preflight using the same `total` the
    // filtered list view already shows. If the count would be silently
    // truncated by the server cap, warn explicitly before pulling.
    if (typeof window !== "undefined") {
      const total = exportLogQuery.data?.total;
      if (typeof total === "number" && total > historyCap) {
        const ok = window.confirm(
          `${total.toLocaleString()} rows match your current filters — that exceeds the hard cap of ` +
            `${historyCap.toLocaleString()} rows on filtered history downloads.\n\n` +
            `The download will be marked truncated:true and will stop at the cap. Narrow your filters first, or continue anyway?`,
        );
        if (!ok) return;
      }
    }
    setFilteredHistoryExporting(format);
    setFilteredHistoryExportError(null);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      params.set("sortBy", logSortBy);
      params.set("sortOrder", logSortOrder);
      if (logActorId.trim()) params.set("actorId", logActorId.trim());
      if (logFrom) params.set("from", new Date(logFrom).toISOString());
      if (logTo) params.set("to", new Date(logTo).toISOString());
      if (logPlatform) params.set("platform", logPlatform);
      if (logFormat) params.set("formatFilter", logFormat);
      if (logMinRows.trim() && !Number.isNaN(Number(logMinRows))) {
        params.set("minTotalRows", String(Number(logMinRows)));
      }
      if (logFlaggedOnly) params.set("flaggedOnly", "true");
      const res = await fetch(
        `/api/admin/newsroom/audience/export-log/export-filtered?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `filtered history export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `audience-audit-export-history-filtered-${stamp}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && k.startsWith("/api/admin/newsroom/audience/export-log");
        },
      });
    } catch (e: any) {
      setFilteredHistoryExportError(e?.message ?? "filtered history export failed");
    } finally {
      setFilteredHistoryExporting(null);
    }
  };

  const downloadExportHistory = async (format: "json" | "csv") => {
    // Task #632 — hard-cap preflight that runs BEFORE the per-admin
    // warn-threshold check below. The cap is enforced by the server,
    // so even if the operator dismissed every prior warning, exceeding
    // the cap silently truncates the file — we surface that explicitly.
    if (typeof window !== "undefined") {
      const previewCount = historyExportCountQuery.data?.count;
      if (
        typeof previewCount === "number" &&
        previewCount > historyCap
      ) {
        const ok = window.confirm(
          `${previewCount.toLocaleString()} rows match your current filters — that exceeds the hard cap of ` +
            `${historyCap.toLocaleString()} rows on history downloads.\n\n` +
            `The download will be marked truncated:true and will stop at the cap. Narrow your filters first, or continue anyway?`,
        );
        if (!ok) return;
      }
    }
    // Task #598 — close the loophole where an admin clicks Download while
    // the count preview is still loading (or has errored) and silently
    // skips the warning. If the count is still in-flight we briefly wait
    // for it to resolve before deciding. If it never resolves AND there's
    // no date filter narrowing the export, we fall back to a
    // "row count unknown — continue?" prompt so a multi-hundred-MB
    // download can't slip through unnoticed.
    if (historyExportWarnThreshold > 0 && typeof window !== "undefined") {
      let previewCount = historyExportCountQuery.data?.count;
      const countInFlight =
        historyExportCountQuery.isLoading || historyExportCountQuery.isFetching;
      if (typeof previewCount !== "number" && countInFlight) {
        try {
          const refetched = await Promise.race<
            { data?: { count?: number } } | null
          >([
            historyExportCountQuery.refetch(),
            new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
          if (refetched && typeof refetched.data?.count === "number") {
            previewCount = refetched.data.count;
          }
        } catch {
          // fall through to the unknown-count path below
        }
      }
      if (
        typeof previewCount === "number" &&
        previewCount > historyExportWarnThreshold
      ) {
        const proceed = window.confirm(
          `This will download ${previewCount.toLocaleString()} rows ` +
            `(threshold ${historyExportWarnThreshold.toLocaleString()}). ` +
            `That can be a very large ${format.toUpperCase()} file. Continue?`,
        );
        if (!proceed) return;
      } else if (typeof previewCount !== "number") {
        const noDateFilter = !historyExportFrom && !historyExportTo;
        if (noDateFilter) {
          const proceed = window.confirm(
            `Row count unknown — the preview hasn't returned a value ` +
              `(${historyExportCountQuery.isError ? "error" : "still loading"}) ` +
              `and no date range is set, so this could be a very large ` +
              `${format.toUpperCase()} file. Continue?`,
          );
          if (!proceed) return;
        }
      }
    }
    setHistoryExporting(format);
    setHistoryExportError(null);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (historyExportFrom) params.set("from", new Date(historyExportFrom).toISOString());
      if (historyExportTo) params.set("to", new Date(historyExportTo).toISOString());
      if (historyExportActorId.trim()) params.set("actorId", historyExportActorId.trim());
      if (historyExportPlatform) params.set("platform", historyExportPlatform);
      if (historyExportFormatFilter) params.set("formatFilter", historyExportFormatFilter);
      if (historyExportMinRows.trim() && !Number.isNaN(Number(historyExportMinRows))) {
        params.set("minTotalRows", String(Number(historyExportMinRows)));
      }
      const res = await fetch(
        `/api/admin/newsroom/audience/export-log/export?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `history export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `audience-audit-export-history-${stamp}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/export-log"] });
    } catch (e: any) {
      setHistoryExportError(e?.message ?? "history export failed");
    } finally {
      setHistoryExporting(null);
    }
  };

  const logQueryParams = (() => {
    const p = new URLSearchParams();
    p.set("limit", String(logPageSize));
    p.set("offset", String(logPage * logPageSize));
    p.set("sortBy", logSortBy);
    p.set("sortOrder", logSortOrder);
    if (logActorId.trim()) p.set("actorId", logActorId.trim());
    if (logFrom) p.set("from", new Date(logFrom).toISOString());
    if (logTo) p.set("to", new Date(logTo).toISOString());
    if (logPlatform) p.set("platform", logPlatform);
    if (logFormat) p.set("format", logFormat);
    if (logMinRows.trim() && !Number.isNaN(Number(logMinRows))) {
      p.set("minTotalRows", String(Number(logMinRows)));
    }
    if (logFlaggedOnly) p.set("flaggedOnly", "true");
    return p.toString();
  })();

  const exportLogQuery = useQuery<{
    exports: Array<{
      exportId: string;
      actorId: string;
      actorType: string;
      actorRole: string | null;
      format: "json" | "csv" | "json-history" | "csv-history";
      filters: {
        fromDate: string | null;
        toDate: string | null;
        platform: string | null;
        productionId: string | null;
      };
      rowCounts: {
        connectors: number;
        messages: number;
        decisions: number;
        commands: number;
        total: number;
      };
      riskSignals: AudienceAuditRiskSignal[];
      exportedAt: string;
      outlier?: {
        isOutlier: boolean;
        rollingMedian: number;
        rollingP95: number;
        threshold: number;
        sampleSize: number;
        multiplier: number;
      };
    }>;
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: [`/api/admin/newsroom/audience/export-log?${logQueryParams}`],
  });

  const historyExportCountParams = useMemo(() => {
    const params = new URLSearchParams();
    if (historyExportFrom) params.set("from", new Date(historyExportFrom).toISOString());
    if (historyExportTo) params.set("to", new Date(historyExportTo).toISOString());
    if (historyExportActorId.trim()) params.set("actorId", historyExportActorId.trim());
    if (historyExportPlatform) params.set("platform", historyExportPlatform);
    if (historyExportFormatFilter) params.set("formatFilter", historyExportFormatFilter);
    if (historyExportMinRows.trim() && !Number.isNaN(Number(historyExportMinRows))) {
      params.set("minTotalRows", String(Number(historyExportMinRows)));
    }
    return params.toString();
  }, [
    historyExportFrom,
    historyExportTo,
    historyExportActorId,
    historyExportPlatform,
    historyExportFormatFilter,
    historyExportMinRows,
  ]);
  const historyExportCountQuery = useQuery<{ count: number }>({
    queryKey: [
      `/api/admin/newsroom/audience/export-log/count?${historyExportCountParams}`,
    ],
  });

  type TrendPreset = "last50" | "24h" | "7d" | "30d" | "custom";
  const TREND_PRESETS: ReadonlyArray<TrendPreset> = [
    "last50",
    "24h",
    "7d",
    "30d",
    "custom",
  ];
  const [trendPreset, setTrendPreset] = useState<TrendPreset>(() => {
    if (typeof window === "undefined") return "last50";
    const v = new URLSearchParams(window.location.search).get("trendPreset");
    return TREND_PRESETS.includes(v as TrendPreset)
      ? (v as TrendPreset)
      : "last50";
  });
  const isValidDateString = (v: string): boolean =>
    !!v && !Number.isNaN(new Date(v).getTime());
  const [trendFrom, setTrendFrom] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const v =
      new URLSearchParams(window.location.search).get("trendFrom") ?? "";
    return isValidDateString(v) ? v : "";
  });
  const [trendTo, setTrendTo] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const v = new URLSearchParams(window.location.search).get("trendTo") ?? "";
    return isValidDateString(v) ? v : "";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (trendPreset === "last50") {
      p.delete("trendPreset");
    } else {
      p.set("trendPreset", trendPreset);
    }
    if (trendPreset === "custom" && trendFrom) {
      p.set("trendFrom", trendFrom);
    } else {
      p.delete("trendFrom");
    }
    if (trendPreset === "custom" && trendTo) {
      p.set("trendTo", trendTo);
    } else {
      p.delete("trendTo");
    }
    const qs = p.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  }, [trendPreset, trendFrom, trendTo]);
  const trendWindow = (() => {
    const now = Date.now();
    const isoFromMs = (ms: number) => new Date(ms).toISOString();
    if (trendPreset === "24h") {
      return { from: isoFromMs(now - 24 * 60 * 60 * 1000), to: isoFromMs(now) };
    }
    if (trendPreset === "7d") {
      return {
        from: isoFromMs(now - 7 * 24 * 60 * 60 * 1000),
        to: isoFromMs(now),
      };
    }
    if (trendPreset === "30d") {
      return {
        from: isoFromMs(now - 30 * 24 * 60 * 60 * 1000),
        to: isoFromMs(now),
      };
    }
    if (trendPreset === "custom") {
      const fromIso =
        trendFrom && isValidDateString(trendFrom)
          ? new Date(trendFrom).toISOString()
          : null;
      const toIso =
        trendTo && isValidDateString(trendTo)
          ? new Date(trendTo).toISOString()
          : null;
      if (fromIso || toIso) return { from: fromIso, to: toIso };
    }
    return { from: null, to: null };
  })();
  const trendCustomInvalid =
    trendPreset === "custom" &&
    !!trendFrom &&
    !!trendTo &&
    new Date(trendFrom).getTime() > new Date(trendTo).getTime();
  // Task #587 — "Copy link" button next to the trend controls. Copies the
  // current page URL (which already mirrors trendPreset / trendFrom / trendTo
  // via Task #551) to the clipboard with a transient inline confirmation.
  const [trendCopyLinkStatus, setTrendCopyLinkStatus] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const copyTrendShareLink = async () => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        const ta = document.createElement("textarea");
        ta.value = href;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand copy failed");
      }
      setTrendCopyLinkStatus("copied");
    } catch {
      setTrendCopyLinkStatus("error");
    }
    window.setTimeout(() => setTrendCopyLinkStatus("idle"), 2000);
  };
  const trendQueryUrl = (() => {
    const p = new URLSearchParams();
    const limit = trendWindow.from || trendWindow.to ? 500 : 50;
    p.set("limit", String(limit));
    p.set("offset", "0");
    p.set("sortBy", "exportedAt");
    p.set("sortOrder", "desc");
    if (trendWindow.from) p.set("from", trendWindow.from);
    if (trendWindow.to) p.set("to", trendWindow.to);
    return `/api/admin/newsroom/audience/export-log?${p.toString()}`;
  })();
  const exportTrendQuery = useQuery<{
    exports: Array<{
      exportId: string;
      exportedAt: string;
      actorId: string;
      actorType?: string | null;
      actorRole?: string | null;
      rowCounts: { total: number };
      outlier?: {
        isOutlier: boolean;
        rollingMedian: number;
        rollingP95: number;
        threshold: number;
        sampleSize: number;
        multiplier: number;
      };
    }>;
  }>({
    queryKey: [trendQueryUrl],
    enabled: !trendCustomInvalid,
  });
  const trendRowsRaw = exportTrendQuery.data?.exports ?? [];

  const toggleLogSort = (col: "exportedAt" | "totalRowCount") => {
    if (logSortBy === col) {
      setLogSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setLogSortBy(col);
      setLogSortOrder("desc");
    }
    setLogPage(0);
  };

  const resetLogFilters = () => {
    setLogActorId("");
    setLogFrom("");
    setLogTo("");
    setLogPlatform("");
    setLogFormat("");
    setLogMinRows("");
    setLogFlaggedOnly(false);
    setLogPage(0);
  };

  // Task #596 — when the admin clicks an actor chip in the trend legend to
  // filter the export log to that actor, we smoothly scroll the Audit
  // Export History card into view, but only when it isn't already fully
  // visible (otherwise the page jumps unnecessarily on large screens).
  const exportLogCardRef = useRef<HTMLDivElement | null>(null);
  const filterLogByActor = (actorId: string) => {
    const next = logActorId.trim() === actorId ? "" : actorId;
    setLogActorId(next);
    setLogPage(0);
    if (typeof window === "undefined") return;
    const el = exportLogCardRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight;
      const fullyVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
      if (fullyVisible) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
      <Card data-testid="card-export-log" ref={exportLogCardRef}>
        <CardHeader>
          <CardTitle>Audit Export History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Every audit-trail export is logged here with the admin who pulled it,
            the filters they used, and the row counts in each section — even when
            the export returns zero rows. Use this trail to investigate any leaked
            export.
          </p>
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6 mb-3">
            <Input
              placeholder="Actor ID"
              value={logActorId}
              onChange={(e) => { setLogActorId(e.target.value); setLogPage(0); }}
              data-testid="input-log-actor-id"
            />
            <Input
              type="datetime-local"
              value={logFrom}
              onChange={(e) => { setLogFrom(e.target.value); setLogPage(0); }}
              data-testid="input-log-from"
            />
            <Input
              type="datetime-local"
              value={logTo}
              onChange={(e) => { setLogTo(e.target.value); setLogPage(0); }}
              data-testid="input-log-to"
            />
            <select
              className="rounded border px-2 py-1 text-sm bg-background"
              value={logPlatform}
              onChange={(e) => { setLogPlatform(e.target.value); setLogPage(0); }}
              data-testid="select-log-platform"
            >
              <option value="">All platforms</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              className="rounded border px-2 py-1 text-sm bg-background"
              value={logFormat}
              onChange={(e) => { setLogFormat(e.target.value); setLogPage(0); }}
              data-testid="select-log-format"
            >
              <option value="">All formats</option>
              <option value="json">json</option>
              <option value="csv">csv</option>
            </select>
            <Input
              type="number"
              min={0}
              placeholder="Min total rows"
              value={logMinRows}
              onChange={(e) => { setLogMinRows(e.target.value); setLogPage(0); }}
              data-testid="input-log-min-rows"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
            <label
              className="flex items-center gap-1.5 cursor-pointer select-none"
              data-testid="label-log-flagged-only"
            >
              <input
                type="checkbox"
                checked={logFlaggedOnly}
                onChange={(e) => { setLogFlaggedOnly(e.target.checked); setLogPage(0); }}
                data-testid="checkbox-log-flagged-only"
              />
              <span>Only flagged exports</span>
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={resetLogFilters}
              data-testid="button-log-reset-filters"
            >
              Reset filters
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={filteredHistoryExporting !== null}
              onClick={() => downloadFilteredExportHistory("csv")}
              data-testid="button-download-filtered-csv"
            >
              {filteredHistoryExporting === "csv"
                ? "Downloading…"
                : "Download filtered (CSV)"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={filteredHistoryExporting !== null}
              onClick={() => downloadFilteredExportHistory("json")}
              data-testid="button-download-filtered-json"
            >
              {filteredHistoryExporting === "json"
                ? "Downloading…"
                : "Download filtered (JSON)"}
            </Button>
            <span className="text-muted-foreground" data-testid="text-log-total">
              {exportLogQuery.data?.total ?? 0} matching exports
            </span>
            {/* Task #632 — surface filtered-total vs hard cap so the
                operator knows the filtered download will be truncated
                before they click. */}
            {typeof exportLogQuery.data?.total === "number" &&
              exportLogQuery.data.total > historyCap && (
                <span
                  className="text-destructive font-medium"
                  data-testid="text-log-cap-warning"
                >
                  ⚠ Exceeds {historyCap.toLocaleString()} row
                  cap — filtered download will be truncated.
                </span>
              )}
            <span className="ml-auto flex items-center gap-2">
              <label className="text-muted-foreground">Page size</label>
              <select
                className="rounded border px-2 py-1 bg-background"
                value={logPageSize}
                onChange={(e) => { setLogPageSize(Number(e.target.value)); setLogPage(0); }}
                data-testid="select-log-page-size"
              >
                {[25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-2 mb-2">
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground" htmlFor="input-history-export-from">
                From
              </label>
              <input
                id="input-history-export-from"
                type="datetime-local"
                className="rounded border px-2 py-1 text-xs bg-background"
                value={historyExportFrom}
                onChange={(e) => setHistoryExportFrom(e.target.value)}
                data-testid="input-history-export-from"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground" htmlFor="input-history-export-to">
                To
              </label>
              <input
                id="input-history-export-to"
                type="datetime-local"
                className="rounded border px-2 py-1 text-xs bg-background"
                value={historyExportTo}
                onChange={(e) => setHistoryExportTo(e.target.value)}
                data-testid="input-history-export-to"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground" htmlFor="input-history-export-actor">
                Actor ID
              </label>
              <input
                id="input-history-export-actor"
                type="text"
                placeholder="e.g. usr_123"
                className="rounded border px-2 py-1 text-xs bg-background"
                value={historyExportActorId}
                onChange={(e) => setHistoryExportActorId(e.target.value)}
                data-testid="input-history-export-actor"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground" htmlFor="select-history-export-format">
                Format
              </label>
              <select
                id="select-history-export-format"
                className="rounded border px-2 py-1 text-xs bg-background"
                value={historyExportFormatFilter}
                onChange={(e) => setHistoryExportFormatFilter(e.target.value)}
                data-testid="select-history-export-format"
              >
                <option value="">Any format</option>
                <option value="json">json</option>
                <option value="csv">csv</option>
                <option value="json-history">json-history</option>
                <option value="csv-history">csv-history</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground" htmlFor="select-history-export-platform">
                Platform
              </label>
              <select
                id="select-history-export-platform"
                className="rounded border px-2 py-1 text-xs bg-background"
                value={historyExportPlatform}
                onChange={(e) => setHistoryExportPlatform(e.target.value)}
                data-testid="select-history-export-platform"
              >
                <option value="">Any platform</option>
                <option value="youtube">youtube</option>
                <option value="facebook">facebook</option>
                <option value="x">x</option>
                <option value="telegram">telegram</option>
                <option value="instagram">instagram</option>
                <option value="tiktok">tiktok</option>
                <option value="linkedin">linkedin</option>
                <option value="reddit">reddit</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground" htmlFor="input-history-export-min-rows">
                Min total rows
              </label>
              <input
                id="input-history-export-min-rows"
                type="number"
                min={0}
                placeholder="0"
                className="rounded border px-2 py-1 text-xs bg-background w-24"
                value={historyExportMinRows}
                onChange={(e) => setHistoryExportMinRows(e.target.value)}
                data-testid="input-history-export-min-rows"
              />
            </div>
            {(() => {
              const hasListFilters = Boolean(
                logActorId.trim() ||
                  logFrom ||
                  logTo ||
                  logPlatform ||
                  logFormat ||
                  logMinRows.trim(),
              );
              const inSyncWithList =
                hasListFilters &&
                historyExportActorId.trim() === logActorId.trim() &&
                historyExportFrom === logFrom &&
                historyExportTo === logTo &&
                historyExportPlatform === (logPlatform ?? "") &&
                historyExportFormatFilter === (logFormat ?? "") &&
                historyExportMinRows.trim() === logMinRows.trim();
              return (
                <>
                  <Button
                    size="sm"
                    variant={inSyncWithList ? "secondary" : "outline"}
                    disabled={!hasListFilters || inSyncWithList}
                    onClick={() => {
                      setHistoryExportActorId(logActorId.trim());
                      setHistoryExportFrom(logFrom);
                      setHistoryExportTo(logTo);
                      setHistoryExportPlatform(logPlatform ?? "");
                      setHistoryExportFormatFilter(logFormat ?? "");
                      setHistoryExportMinRows(logMinRows.trim());
                    }}
                    title={
                      hasListFilters
                        ? inSyncWithList
                          ? "Download filters match the list view"
                          : "Copy filters from the list view above"
                        : "Set filters on the list view above first"
                    }
                    data-testid="button-history-export-use-list-filters"
                  >
                    {inSyncWithList ? "Linked to list filters" : "Use list filters"}
                  </Button>
                  {hasPersistedHistoryExportFilters && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetSavedHistoryExportFilters}
                        title="Clear all six filters and remove the values saved in this browser between visits"
                        data-testid="button-history-export-reset-filters"
                      >
                        Reset filters
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyHistoryExportShareLink}
                        title="Copy a shareable URL that pre-populates these six filters for another admin"
                        data-testid="button-history-export-copy-link"
                      >
                        {historyExportCopyLinkStatus === "copied"
                          ? "Link copied"
                          : historyExportCopyLinkStatus === "error"
                            ? "Copy failed"
                            : "Copy link"}
                      </Button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">
              Hand this off to regulators or incident responders:
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={historyExporting !== null}
              onClick={() => downloadExportHistory("json")}
              data-testid="button-download-history-json"
            >
              {historyExporting === "json" ? "Downloading…" : "Download history (JSON)"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={historyExporting !== null}
              onClick={() => downloadExportHistory("csv")}
              data-testid="button-download-history-csv"
            >
              {historyExporting === "csv" ? "Downloading…" : "Download history (CSV)"}
            </Button>
            {(() => {
              if (historyExportCountQuery.isError) {
                return (
                  <span
                    className="text-xs text-destructive"
                    data-testid="text-history-export-count-error"
                    title={
                      (historyExportCountQuery.error as Error | undefined)?.message ??
                      "count failed"
                    }
                  >
                    Count unavailable
                  </span>
                );
              }
              if (historyExportCountQuery.isLoading || historyExportCountQuery.isFetching) {
                return (
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid="text-history-export-count-loading"
                  >
                    Counting…
                  </span>
                );
              }
              const count = historyExportCountQuery.data?.count ?? 0;
              const isLarge =
                historyExportWarnThreshold > 0 &&
                count > historyExportWarnThreshold;
              return (
                <span
                  className={`text-xs ${
                    isLarge
                      ? "text-amber-600 dark:text-amber-400 font-medium"
                      : "text-muted-foreground"
                  }`}
                  data-testid="text-history-export-count"
                  data-large={isLarge ? "true" : "false"}
                >
                  {count.toLocaleString()} {count === 1 ? "row" : "rows"} match these filters
                  {isLarge
                    ? ` — above warn threshold (${historyExportWarnThreshold.toLocaleString()}); you'll be asked to confirm`
                    : ""}
                </span>
              );
            })()}
          </div>
          <div
            className="flex flex-wrap items-center gap-2 mb-3"
            data-testid="row-history-export-warn-threshold"
          >
            <label
              className="text-xs text-muted-foreground"
              htmlFor="input-history-export-warn-threshold"
            >
              Warn above
            </label>
            <Input
              id="input-history-export-warn-threshold"
              type="number"
              min={0}
              step={1000}
              className="h-7 w-28 text-xs"
              placeholder={String(HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT)}
              value={historyExportWarnThresholdInput}
              onChange={(e) =>
                setHistoryExportWarnThresholdInput(e.target.value)
              }
              onBlur={() =>
                commitHistoryExportWarnThreshold(historyExportWarnThresholdInput)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHistoryExportWarnThreshold(
                    historyExportWarnThresholdInput,
                  );
                }
              }}
              data-testid="input-history-export-warn-threshold"
            />
            <span className="text-xs text-muted-foreground">
              rows (current: {historyExportWarnThreshold.toLocaleString()};
              {historyExportWarnThreshold === 0
                ? " warning disabled"
                : " default 10,000"}
              )
            </span>
            {historyExportWarnThreshold !==
              HISTORY_EXPORT_WARN_THRESHOLD_DEFAULT && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setHistoryExportWarnThresholdInput("");
                  commitHistoryExportWarnThreshold("");
                }}
                data-testid="button-history-export-warn-threshold-reset"
              >
                Reset
              </Button>
            )}
            {historyExportWarnThresholdError && (
              <span
                className="text-xs text-destructive"
                data-testid="text-history-export-warn-threshold-error"
              >
                {historyExportWarnThresholdError}
              </span>
            )}
          </div>
          {/* Task #703 — founder-configurable hard row cap for the
              history downloads (separate from the soft warn-threshold
              above). The server enforces the cap; this control lets a
              founder raise it for a regulator pull or lower it during
              an incident without shipping code. */}
          <div
            className="flex items-center gap-2 flex-wrap pt-1"
            data-testid="block-history-row-cap"
          >
            <label
              className="text-xs text-muted-foreground"
              htmlFor="input-history-row-cap"
            >
              Hard cap
            </label>
            <Input
              id="input-history-row-cap"
              type="number"
              min={rowCapMin}
              max={rowCapMax}
              step={1000}
              className="h-7 w-32 text-xs"
              placeholder={`${rowCapDefault.toLocaleString()} (default)`}
              value={historyCapInput}
              onChange={(e) => {
                setHistoryCapInput(e.target.value);
                setHistoryCapError(null);
              }}
              onBlur={() => commitHistoryCap(historyCapInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHistoryCap(historyCapInput);
                }
              }}
              data-testid="input-history-row-cap"
            />
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-history-row-cap-current"
            >
              rows (current: {historyCap.toLocaleString()}
              {rowCapQuery.data?.caps.history.isDefault ? "; default" : ""};
              bounds {rowCapMin.toLocaleString()}–{rowCapMax.toLocaleString()})
            </span>
            {!rowCapQuery.data?.caps.history.isDefault && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setHistoryCapInput("");
                  setHistoryCapError(null);
                  historyCapMutation.mutate(null);
                }}
                disabled={historyCapMutation.isPending}
                data-testid="button-history-row-cap-reset"
              >
                Reset
              </Button>
            )}
            {historyCapError && (
              <span
                className="text-xs text-destructive"
                data-testid="text-history-row-cap-error"
              >
                {historyCapError}
              </span>
            )}
          </div>
          {historyExportError && (
            <p
              className="text-xs text-destructive mb-3"
              data-testid="text-history-export-error"
            >
              {historyExportError}
            </p>
          )}
          {filteredHistoryExportError && (
            <p
              className="text-xs text-destructive mb-3"
              data-testid="text-filtered-history-export-error"
            >
              {filteredHistoryExportError}
            </p>
          )}
          {(() => {
            const trendRowsRaw = exportTrendQuery.data?.exports ?? [];
            const presetOptions: Array<{ key: TrendPreset; label: string }> = [
              { key: "last50", label: "Last 50" },
              { key: "24h", label: "24h" },
              { key: "7d", label: "7d" },
              { key: "30d", label: "30d" },
              { key: "custom", label: "Custom" },
            ];
            const trendControls = (
              <div
                className="mb-2 flex flex-wrap items-end gap-2"
                data-testid="trend-window-controls"
              >
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-muted-foreground mr-1">
                    Window:
                  </span>
                  {presetOptions.map((opt) => (
                    <Button
                      key={opt.key}
                      size="sm"
                      variant={trendPreset === opt.key ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setTrendPreset(opt.key)}
                      data-testid={`button-trend-window-${opt.key}`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <div
                  className="flex flex-wrap items-center gap-1"
                  data-testid="trend-window-copy-link-group"
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={copyTrendShareLink}
                    data-testid="button-trend-copy-link"
                    title="Copy a shareable link to this trend window"
                  >
                    Copy link
                  </Button>
                  {trendCopyLinkStatus === "copied" && (
                    <span
                      className="text-xs text-muted-foreground"
                      data-testid="text-trend-copy-link-status"
                    >
                      Link copied
                    </span>
                  )}
                  {trendCopyLinkStatus === "error" && (
                    <span
                      className="text-xs text-destructive"
                      data-testid="text-trend-copy-link-status"
                    >
                      Copy failed
                    </span>
                  )}
                </div>
                {trendPreset === "custom" && (
                  <div className="flex flex-wrap items-center gap-1">
                    <Input
                      type="datetime-local"
                      value={trendFrom}
                      onChange={(e) => setTrendFrom(e.target.value)}
                      className="h-7 w-[180px] text-xs"
                      data-testid="input-trend-from"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="datetime-local"
                      value={trendTo}
                      onChange={(e) => setTrendTo(e.target.value)}
                      className="h-7 w-[180px] text-xs"
                      data-testid="input-trend-to"
                    />
                    {(trendFrom || trendTo) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setTrendFrom("");
                          setTrendTo("");
                        }}
                        data-testid="button-trend-clear-custom"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
            if (trendCustomInvalid) {
              return (
                <div
                  className="mb-4 rounded border p-3"
                  data-testid="card-export-log-trend-invalid"
                >
                  {trendControls}
                  <p className="text-xs text-destructive">
                    Custom window is invalid: "from" must be before "to".
                  </p>
                </div>
              );
            }
            if (exportTrendQuery.isLoading) {
              return (
                <div
                  className="mb-4 rounded border p-3"
                  data-testid="card-export-log-trend-loading"
                >
                  {trendControls}
                  <p className="text-xs text-muted-foreground">
                    Loading export-size trend…
                  </p>
                </div>
              );
            }
            if (trendRowsRaw.length === 0) {
              return (
                <div
                  className="mb-4 rounded border p-3"
                  data-testid="card-export-log-trend-empty"
                >
                  {trendControls}
                  <p className="text-xs text-muted-foreground">
                    {trendPreset === "last50"
                      ? "No exports yet — trend chart will appear after the first audit pull."
                      : "No audit pulls in the selected window. Try a wider range."}
                  </p>
                </div>
              );
            }
            // Server returns newest-first; reverse so the chart reads left → right
            // as oldest → newest.
            const trendRows = [...trendRowsRaw].reverse();
            const latestOutlier = (() => {
              for (let i = trendRowsRaw.length - 1; i >= 0; i--) {
                const o = trendRowsRaw[i]?.outlier;
                if (o) return o;
              }
              return null;
            })();
            const median = latestOutlier?.rollingMedian ?? 0;
            const threshold = latestOutlier?.threshold ?? 0;
            const rollingP95 = latestOutlier?.rollingP95 ?? 0;
            // Task #550 — compute median / p95 from ONLY the points currently
            // visible in the window, independent of each row's rolling stats
            // (which were captured against the full history at export time).
            // This lets admins see whether the selected window is unusually
            // busy compared to itself.
            const windowTotals = trendRows
              .map((e) => e.rowCounts.total)
              .filter((n) => Number.isFinite(n))
              .sort((a, b) => a - b);
            const percentile = (sorted: number[], p: number): number => {
              if (sorted.length === 0) return 0;
              if (sorted.length === 1) return sorted[0];
              const rank = (p / 100) * (sorted.length - 1);
              const lo = Math.floor(rank);
              const hi = Math.ceil(rank);
              if (lo === hi) return sorted[lo];
              const frac = rank - lo;
              return sorted[lo] * (1 - frac) + sorted[hi] * frac;
            };
            const windowMedian = percentile(windowTotals, 50);
            const windowP95 = percentile(windowTotals, 95);
            // Task #592 — flag the visible window when its busy-rate jumps off
            // the chart vs. the rolling baseline. Two independent triggers:
            //   1) window p95 >= 2× rolling p95 (sharp spike at the top)
            //   2) every bar in the window is above the rolling median
            //      (sustained elevation, even without a single huge spike)
            // We require a minimum number of bars so a 2-bar window can't
            // light up the badge on noise.
            const HOT_WINDOW_MIN_BARS = 5;
            const HOT_WINDOW_P95_RATIO = 2;
            const hotWindowEnoughBars =
              windowTotals.length >= HOT_WINDOW_MIN_BARS;
            const hotWindowP95Ratio =
              rollingP95 > 0 ? windowP95 / rollingP95 : 0;
            const hotWindowP95Spike =
              rollingP95 > 0 && hotWindowP95Ratio >= HOT_WINDOW_P95_RATIO;
            const hotWindowAllAboveMedian =
              median > 0 &&
              windowTotals.length > 0 &&
              windowTotals.every((n) => n > median);
            const hotWindowReasons: string[] = [];
            if (hotWindowEnoughBars && hotWindowP95Spike) {
              hotWindowReasons.push(
                `Window p95 (${windowP95.toFixed(0)}) is ${hotWindowP95Ratio.toFixed(
                  1,
                )}× the rolling p95 (${rollingP95.toFixed(
                  0,
                )}); threshold ≥ ${HOT_WINDOW_P95_RATIO}×.`,
              );
            }
            if (hotWindowEnoughBars && hotWindowAllAboveMedian) {
              hotWindowReasons.push(
                `Every one of the ${windowTotals.length} bars in the window is above the rolling median (${median.toFixed(
                  0,
                )}).`,
              );
            }
            const hotWindowActive = hotWindowReasons.length > 0;
            const data = trendRows.map((e, idx) => ({
              idx,
              exportId: e.exportId,
              exportedAt: e.exportedAt,
              actorId: e.actorId,
              actorType: e.actorType ?? null,
              actorRole: e.actorRole ?? null,
              total: e.rowCounts.total,
              isOutlier: !!e.outlier?.isOutlier,
              multiplier: e.outlier?.multiplier ?? null,
            }));
            const maxTotal = data.reduce((m, d) => Math.max(m, d.total), 0);
            const yMaxCandidates = [maxTotal, threshold, median];
            if (trendShowWindowStats) {
              yMaxCandidates.push(windowMedian, windowP95);
            }
            const yMax = Math.max(...yMaxCandidates) * 1.1 || 1;
            const outlierCount = data.filter((d) => d.isOutlier).length;
            // Task #504 — deterministic per-actor color so the same actor keeps
            // the same swatch across renders and between the legend / bars.
            const ACTOR_PALETTE = [
              "#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2",
              "#db2777", "#ca8a04", "#0d9488", "#7c3aed", "#dc2626",
              "#65a30d", "#0369a1",
            ];
            const hashActor = (id: string): number => {
              let h = 0;
              for (let i = 0; i < id.length; i++) {
                h = (h * 31 + id.charCodeAt(i)) | 0;
              }
              return Math.abs(h);
            };
            const actorColor = (id: string): string =>
              ACTOR_PALETTE[hashActor(id) % ACTOR_PALETTE.length];
            // Stable insertion-order list of actors present in the window so
            // the legend is deterministic per render.
            const actorSeen = new Map<string, { actorType: string | null; count: number; total: number }>();
            for (const d of data) {
              const cur = actorSeen.get(d.actorId);
              if (cur) {
                cur.count += 1;
                cur.total += d.total;
              } else {
                actorSeen.set(d.actorId, {
                  actorType: d.actorType,
                  count: 1,
                  total: d.total,
                });
              }
            }
            const actorLegend = Array.from(actorSeen.entries()).map(([id, v]) => ({
              actorId: id,
              actorType: v.actorType,
              count: v.count,
              total: v.total,
              color: actorColor(id),
            }));
            return (
              <div
                className="mb-4 rounded border p-3"
                data-testid="card-export-log-trend"
              >
                {trendControls}
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-medium">
                      Export-size trend
                      {hotWindowActive && (
                        <Badge
                          variant="destructive"
                          className="ml-2 align-middle text-[10px]"
                          data-testid="badge-trend-hot-window"
                          title={`Hot window — ${hotWindowReasons.join(" ")}`}
                        >
                          Hot window
                        </Badge>
                      )}
                    </p>
                    <p
                      className="text-xs text-muted-foreground"
                      data-testid="text-trend-window-description"
                    >
                      {trendPreset === "last50"
                        ? `Last ${data.length} audit pulls (oldest → newest).`
                        : trendPreset === "custom"
                          ? `${data.length} pulls in custom window${
                              trendWindow.from
                                ? ` from ${new Date(trendWindow.from).toLocaleString()}`
                                : ""
                            }${
                              trendWindow.to
                                ? ` to ${new Date(trendWindow.to).toLocaleString()}`
                                : ""
                            } (oldest → newest).`
                          : `${data.length} pulls in last ${trendPreset} (oldest → newest).`}{" "}
                      {trendView === "all"
                        ? "Red bars are flagged outliers."
                        : "Bars are colored by actor — a single color dominating the chart points to that actor."}{" "}
                      <span data-testid="text-trend-stats-caption">
                        Solid blue / dashed red lines are <strong>rolling</strong>{" "}
                        stats from each row's full export history at the time of
                        that export. Dotted teal / amber lines are{" "}
                        <strong>window</strong> stats recomputed from just the
                        bars currently visible.
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div
                      className="inline-flex items-center rounded border overflow-hidden"
                      data-testid="toggle-trend-view"
                    >
                      <button
                        type="button"
                        className={`px-2 py-0.5 text-xs ${
                          trendView === "all"
                            ? "bg-muted font-medium"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setTrendView("all")}
                        data-testid="button-trend-view-all"
                      >
                        All actors
                      </button>
                      <button
                        type="button"
                        className={`px-2 py-0.5 text-xs border-l ${
                          trendView === "byActor"
                            ? "bg-muted font-medium"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setTrendView("byActor")}
                        data-testid="button-trend-view-by-actor"
                      >
                        By actor
                      </button>
                    </div>
                    <span
                      className="inline-flex items-center gap-1"
                      data-testid="legend-trend-median"
                      title="Rolling median across each row's full export history at the time of that export."
                    >
                      <span className="inline-block h-0.5 w-4 bg-blue-500" />
                      Rolling median: {median.toFixed(0)}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      data-testid="legend-trend-threshold"
                      title="Rolling outlier threshold from row history."
                    >
                      <span className="inline-block h-0.5 w-4 border-t border-dashed border-red-500" />
                      Rolling threshold: {threshold.toFixed(0)}
                    </span>
                    {trendShowWindowStats && (
                      <>
                        <span
                          className="inline-flex items-center gap-1"
                          data-testid="legend-trend-window-median"
                          title="Median of just the bars currently visible in this window."
                        >
                          <span className="inline-block h-0.5 w-4 border-t-2 border-dotted border-teal-500" />
                          Window median: {windowMedian.toFixed(0)}
                        </span>
                        <span
                          className="inline-flex items-center gap-1"
                          data-testid="legend-trend-window-p95"
                          title="95th percentile of just the bars currently visible in this window."
                        >
                          <span className="inline-block h-0.5 w-4 border-t-2 border-dotted border-amber-500" />
                          Window p95: {windowP95.toFixed(0)}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                      onClick={() => setTrendShowWindowStats((v) => !v)}
                      data-testid="button-toggle-window-stats"
                      title="Toggle median / p95 computed from just the visible window."
                    >
                      {trendShowWindowStats ? "Hide window stats" : "Show window stats"}
                    </button>
                    <span
                      className="text-muted-foreground"
                      data-testid="text-trend-outlier-count"
                    >
                      {outlierCount} outlier{outlierCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                {trendView === "byActor" && (
                  <div
                    className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"
                    data-testid="legend-trend-actors"
                  >
                    {actorLegend.map((a) => {
                      const isActive = logActorId.trim() === a.actorId;
                      return (
                        <button
                          type="button"
                          key={a.actorId}
                          onClick={() => filterLogByActor(a.actorId)}
                          className={`inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted ${
                            isActive
                              ? "ring-1 ring-primary bg-muted font-medium"
                              : ""
                          }`}
                          title={`${a.actorId} — ${a.count} pull${
                            a.count === 1 ? "" : "s"
                          }, ${a.total} rows total. Click to ${
                            isActive ? "clear" : "filter"
                          } the export log${isActive ? "" : ` to this actor`}.`}
                          data-testid={`legend-trend-actor-${a.actorId}`}
                          aria-pressed={isActive}
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ backgroundColor: a.color }}
                          />
                          <span className="font-mono">
                            {a.actorId.length > 18
                              ? `${a.actorId.slice(0, 8)}…${a.actorId.slice(-6)}`
                              : a.actorId}
                          </span>
                          <span className="text-muted-foreground">
                            ({a.count})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {logActorId.trim() && (() => {
                  const activeActorStats = actorLegend.find(
                    (a) => a.actorId === logActorId.trim(),
                  );
                  return (
                  <div
                    className="mb-2 flex flex-wrap items-center gap-2 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-[11px]"
                    data-testid="indicator-log-actor-filter"
                  >
                    <span className="text-muted-foreground">
                      Export log filtered to actor:
                    </span>
                    <span
                      className="font-mono"
                      data-testid="text-log-actor-filter-value"
                    >
                      {logActorId.trim()}
                    </span>
                    {activeActorStats ? (
                      <span
                        className="text-muted-foreground"
                        data-testid="text-log-actor-filter-counts"
                        title={`This actor made ${activeActorStats.count} export pull${
                          activeActorStats.count === 1 ? "" : "s"
                        } totaling ${activeActorStats.total} row${
                          activeActorStats.total === 1 ? "" : "s"
                        } in the current trend window.`}
                      >
                        · {activeActorStats.count} pull
                        {activeActorStats.count === 1 ? "" : "s"},{" "}
                        {activeActorStats.total} row
                        {activeActorStats.total === 1 ? "" : "s"} in window
                      </span>
                    ) : (
                      <span
                        className="text-muted-foreground"
                        data-testid="text-log-actor-filter-counts-empty"
                        title="This actor has no export pulls in the current trend window."
                      >
                        · no pulls in window
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setLogActorId("");
                        setLogPage(0);
                      }}
                      className="ml-auto rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted"
                      data-testid="button-clear-log-actor-filter"
                    >
                      Clear actor filter ✕
                    </button>
                  </div>
                  );
                })()}
                <div className="h-[160px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="idx" tick={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        width={36}
                        domain={[0, yMax]}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "rgba(127,127,127,0.1)" }}
                        contentStyle={{ fontSize: "11px" }}
                        labelFormatter={() => ""}
                        formatter={(value: any, _name, item: any) => {
                          const row = item?.payload;
                          if (!row) return [value, "rows"];
                          const sizeLabel = `${row.total} rows${
                            row.multiplier != null
                              ? ` (${row.multiplier.toFixed(1)}× median)`
                              : ""
                          }`;
                          if (trendView === "byActor") {
                            return [
                              sizeLabel,
                              `${row.actorId} — ${new Date(
                                row.exportedAt,
                              ).toLocaleString()}`,
                            ];
                          }
                          return [
                            sizeLabel,
                            new Date(row.exportedAt).toLocaleString(),
                          ];
                        }}
                      />
                      {median > 0 && (
                        <ReferenceLine
                          y={median}
                          stroke="#3b82f6"
                          strokeWidth={1}
                          ifOverflow="extendDomain"
                        />
                      )}
                      {threshold > 0 && (
                        <ReferenceLine
                          y={threshold}
                          stroke="#ef4444"
                          strokeDasharray="4 3"
                          strokeWidth={1}
                          ifOverflow="extendDomain"
                        />
                      )}
                      {trendShowWindowStats && windowMedian > 0 && (
                        <ReferenceLine
                          y={windowMedian}
                          stroke="#14b8a6"
                          strokeDasharray="1 3"
                          strokeWidth={1.25}
                          ifOverflow="extendDomain"
                        />
                      )}
                      {trendShowWindowStats && windowP95 > 0 && (
                        <ReferenceLine
                          y={windowP95}
                          stroke="#f59e0b"
                          strokeDasharray="1 3"
                          strokeWidth={1.25}
                          ifOverflow="extendDomain"
                        />
                      )}
                      <Bar
                        dataKey="total"
                        isAnimationActive={false}
                        onClick={(payload: any) => {
                          if (trendView !== "byActor") return;
                          const id = payload?.actorId ?? payload?.payload?.actorId;
                          if (typeof id === "string" && id) {
                            filterLogByActor(id);
                          }
                        }}
                      >
                        {data.map((d) => {
                          const isActiveActor =
                            trendView === "byActor" &&
                            logActorId.trim() === d.actorId;
                          const isDimmed =
                            trendView === "byActor" &&
                            logActorId.trim() !== "" &&
                            !isActiveActor;
                          const fill =
                            trendView === "byActor"
                              ? actorColor(d.actorId)
                              : d.isOutlier
                                ? "#ef4444"
                                : "#64748b";
                          return (
                            <Cell
                              key={d.exportId}
                              fill={fill}
                              fillOpacity={isDimmed ? 0.25 : 1}
                              stroke={isActiveActor ? "#0f172a" : undefined}
                              strokeWidth={isActiveActor ? 1 : 0}
                              cursor={
                                trendView === "byActor" ? "pointer" : undefined
                              }
                              data-testid={
                                trendView === "byActor"
                                  ? `bar-trend-actor-${d.actorId}-${d.exportId}`
                                  : d.isOutlier
                                    ? `bar-trend-outlier-${d.exportId}`
                                    : `bar-trend-${d.exportId}`
                              }
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
          {exportLogQuery.isLoading ? (
            <p className="text-sm text-muted-foreground" data-testid="text-export-log-loading">Loading…</p>
          ) : (exportLogQuery.data?.exports ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-export-log">
              No audit exports match the current filters.
            </p>
          ) : (
            <ScrollArea className="h-[280px]">
              <table className="w-full text-xs" data-testid="table-export-log">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-2">
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => toggleLogSort("exportedAt")}
                        data-testid="button-sort-when"
                      >
                        When {logSortBy === "exportedAt" ? (logSortOrder === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="py-1 pr-2">Actor</th>
                    <th className="py-1 pr-2">Format</th>
                    <th className="py-1 pr-2">Risk signals</th>
                    <th className="py-1 pr-2">Filters</th>
                    <th className="py-1 pr-2 text-right">Conn</th>
                    <th className="py-1 pr-2 text-right">Msg</th>
                    <th className="py-1 pr-2 text-right">Dec</th>
                    <th className="py-1 pr-2 text-right">Cmd</th>
                    <th className="py-1 pr-2 text-right">
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => toggleLogSort("totalRowCount")}
                        data-testid="button-sort-total"
                      >
                        Total {logSortBy === "totalRowCount" ? (logSortOrder === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(exportLogQuery.data?.exports ?? []).map((e) => {
                    const parts = [
                      e.filters.fromDate ? `from=${e.filters.fromDate}` : null,
                      e.filters.toDate ? `to=${e.filters.toDate}` : null,
                      e.filters.platform ? `platform=${e.filters.platform}` : null,
                      e.filters.productionId ? `prod=${e.filters.productionId}` : null,
                    ].filter(Boolean).join(" · ") || "(none)";
                    return (
                      <tr
                        key={e.exportId}
                        className="border-t"
                        data-testid={`row-export-log-${e.exportId}`}
                      >
                        <td className="py-1 pr-2 whitespace-nowrap">
                          {new Date(e.exportedAt).toLocaleString()}
                        </td>
                        <td className="py-1 pr-2">
                          <div className="flex flex-col">
                            <span className="font-mono">{e.actorId}</span>
                            <span className="text-muted-foreground">
                              {e.actorType}{e.actorRole ? ` · ${e.actorRole}` : ""}
                            </span>
                          </div>
                        </td>
                        <td className="py-1 pr-2">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline">{e.format}</Badge>
                            {e.outlier?.isOutlier && (
                              <Badge
                                variant="destructive"
                                title={`Outlier: ${e.rowCounts.total} rows is ${e.outlier.multiplier.toFixed(1)}× the rolling median of ${e.outlier.rollingMedian.toFixed(0)} (p95 ${e.outlier.rollingP95.toFixed(0)}, sample ${e.outlier.sampleSize}).`}
                                data-testid={`badge-outlier-${e.exportId}`}
                              >
                                Outlier · {e.outlier.multiplier.toFixed(1)}×
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-1 pr-2">
                          {(e.riskSignals ?? []).length === 0 ? (
                            <span
                              className="text-muted-foreground text-[11px]"
                              data-testid={`text-risk-signals-none-${e.exportId}`}
                            >
                              —
                            </span>
                          ) : (
                            <div
                              className="flex flex-wrap gap-1"
                              data-testid={`cell-risk-signals-${e.exportId}`}
                            >
                              {(e.riskSignals ?? []).map((sig) => {
                                const known = (
                                  RISK_SIGNAL_LABELS as Record<string, string>
                                )[sig];
                                return (
                                  <Tooltip key={sig}>
                                    <TooltipTrigger asChild>
                                      <span
                                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                                          (
                                            RISK_SIGNAL_BADGE_CLASS as Record<
                                              string,
                                              string
                                            >
                                          )[sig] ?? "bg-muted text-foreground border-border"
                                        }`}
                                        data-testid={`badge-risk-${sig}-${e.exportId}`}
                                      >
                                        {known ?? sig}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {(
                                        RISK_SIGNAL_DESCRIPTIONS as Record<
                                          string,
                                          string
                                        >
                                      )[sig] ?? sig}
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-1 pr-2 font-mono text-[11px] break-all">{parts}</td>
                        <td className="py-1 pr-2 text-right">{e.rowCounts.connectors}</td>
                        <td className="py-1 pr-2 text-right">{e.rowCounts.messages}</td>
                        <td className="py-1 pr-2 text-right">{e.rowCounts.decisions}</td>
                        <td className="py-1 pr-2 text-right">{e.rowCounts.commands}</td>
                        <td className="py-1 pr-2 text-right font-medium">{e.rowCounts.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          )}
          <div
            className="mt-3 rounded border border-border bg-muted/30 p-2 text-[11px]"
            data-testid="legend-risk-signals"
          >
            <div className="mb-1 font-medium text-muted-foreground">
              Risk signal legend
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {RISK_SIGNAL_ORDER.map((sig) => (
                <div key={sig} className="flex items-start gap-1.5">
                  <span
                    className={`mt-0.5 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${RISK_SIGNAL_BADGE_CLASS[sig]}`}
                  >
                    {RISK_SIGNAL_LABELS[sig]}
                  </span>
                  <span className="text-muted-foreground">
                    {RISK_SIGNAL_DESCRIPTIONS[sig]}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {(() => {
            const total = exportLogQuery.data?.total ?? 0;
            const totalPages = Math.max(1, Math.ceil(total / logPageSize));
            const current = logPage + 1;
            return (
              <div className="flex items-center justify-between text-xs mt-3">
                <span className="text-muted-foreground" data-testid="text-log-page">
                  Page {current} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={logPage === 0}
                    onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                    data-testid="button-log-prev"
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={current >= totalPages}
                    onClick={() => setLogPage((p) => p + 1)}
                    data-testid="button-log-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
  );
}
