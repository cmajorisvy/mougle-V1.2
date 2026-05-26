import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";

const HISTORY_STATUS_OPTS = ["", "succeeded", "failed", "running"];
function parseRetentionInitial() {
  if (typeof window === "undefined") return { status: "", dryRun: "", section: "" };
  const p = new URLSearchParams(window.location.search);
  return {
    status: p.get("status") ?? "",
    dryRun: p.get("dryRun") ?? "",
    section: p.get("section") ?? "",
  };
}
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Policy = {
  completedRetentionDays: number;
  failedRetentionDays: number;
  eventRetentionDays: number;
  workerStaleRetentionDays: number;
};

type Counts = {
  completedJobsEligible: number;
  failedJobsEligible: number;
  eventsEligible: number;
  workersEligible: number;
};

type RunResponse = {
  runId: string;
  dryRun: boolean;
  policy: Policy;
  eligibleCounts: Counts;
  deletedCounts: Counts | null;
  status: string;
};

type HistoryRow = {
  runId: string;
  adminId: string | null;
  dryRun: boolean;
  policy: Policy;
  eligibleCounts: Counts;
  deletedCounts: Counts | null;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

export default function AiRetention() {
  const qc = useQueryClient();
  const [policyOverride, setPolicyOverride] = useState<Partial<Policy>>({});
  const [lastResult, setLastResult] = useState<RunResponse | null>(null);
  const initialUrl = useMemo(parseRetentionInitial, []);
  const [historyStatus, setHistoryStatus] = useState(
    HISTORY_STATUS_OPTS.includes(initialUrl.status) ? initialUrl.status : "",
  );
  const [historyDryRun, setHistoryDryRun] = useState(
    initialUrl.dryRun === "true" || initialUrl.dryRun === "false" ? initialUrl.dryRun : "",
  );
  const historyRef = useRef<HTMLDivElement | null>(null);
  const exportsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialUrl.section === "history" && historyRef.current) {
      historyRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (initialUrl.section === "exports" && exportsRef.current) {
      exportsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialUrl.section]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (historyStatus) p.set("status", historyStatus); else p.delete("status");
    if (historyDryRun) p.set("dryRun", historyDryRun); else p.delete("dryRun");
    const q = p.toString();
    const next = `${window.location.pathname}${q ? `?${q}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [historyStatus, historyDryRun]);

  const preview = useQuery<{ policy: Policy; eligible: Counts }>({
    queryKey: ["admin-ai-retention-preview"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-retention/preview", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const historyQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "25");
    if (historyStatus) p.set("status", historyStatus);
    if (historyDryRun === "true" || historyDryRun === "false") p.set("dryRun", historyDryRun);
    return p.toString();
  }, [historyStatus, historyDryRun]);

  const history = useQuery<{ runs: HistoryRow[] }>({
    queryKey: ["admin-ai-retention-runs", historyStatus, historyDryRun],
    queryFn: async () => {
      const res = await fetch(`/api/admin/ai-retention/runs?${historyQs}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const policy: Policy = {
    completedRetentionDays: policyOverride.completedRetentionDays ?? preview.data?.policy.completedRetentionDays ?? 90,
    failedRetentionDays: policyOverride.failedRetentionDays ?? preview.data?.policy.failedRetentionDays ?? 180,
    eventRetentionDays: policyOverride.eventRetentionDays ?? preview.data?.policy.eventRetentionDays ?? 180,
    workerStaleRetentionDays: policyOverride.workerStaleRetentionDays ?? preview.data?.policy.workerStaleRetentionDays ?? 30,
  };

  const run = useMutation<RunResponse, Error, { dryRun: boolean }>({
    mutationFn: async ({ dryRun }) => {
      const res = await fetch("/api/admin/ai-retention/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, ...policy }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      qc.invalidateQueries({ queryKey: ["admin-ai-retention-preview"] });
      qc.invalidateQueries({ queryKey: ["admin-ai-retention-runs"] });
    },
  });

  const onRunReal = () => {
    const ok = window.confirm(
      "This will PERMANENTLY DELETE old AI jobs, audit events, and worker rows.\n\n" +
        "Pending/running jobs and workers with an active job are NEVER deleted.\n\n" +
        "This action cannot be undone. Continue?",
    );
    if (ok) run.mutate({ dryRun: false });
  };

  return (
    <div className="container max-w-5xl py-6 space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/ai-jobs">
            <Button variant="ghost" size="sm" data-testid="link-back-jobs" className="h-7 px-2">
              <ArrowLeft className="w-3 h-3 mr-1" /> AI Jobs
            </Button>
          </Link>
        </div>
        <h1 className="text-2xl font-semibold mt-1">AI Retention &amp; Cleanup</h1>
        <p className="text-sm text-muted-foreground">
          Prune old AI operational data. Cleanup is irreversible — preview first.
        </p>
      </div>

      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="py-3 text-xs text-yellow-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            Pending and running jobs are never deleted. Workers currently
            holding a job are never deleted. Safe minimums are enforced server-side.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Retention policy (days)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["completedRetentionDays","failedRetentionDays","eventRetentionDays","workerStaleRetentionDays"] as const).map((k) => (
            <div key={k}>
              <Label className="text-xs">{labelFor(k)}</Label>
              <Input
                type="number"
                min={k === "workerStaleRetentionDays" ? 1 : 7}
                value={policy[k]}
                onChange={(e) => setPolicyOverride((p) => ({ ...p, [k]: parseInt(e.target.value, 10) || 0 }))}
                data-testid={`input-${k}`}
                className="mt-1"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Eligible (current preview)</CardTitle>
          <Button
            variant="outline" size="sm"
            onClick={() => preview.refetch()}
            disabled={preview.isFetching}
            data-testid="button-refresh-preview"
          >
            {preview.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {preview.isLoading && <div className="text-muted-foreground" data-testid="text-preview-loading">Loading…</div>}
          {preview.isError && <div className="text-red-400" data-testid="text-preview-error">{(preview.error as Error)?.message}</div>}
          {preview.data && (
            <>
              <Stat label="Succeeded jobs" value={preview.data.eligible.completedJobsEligible} testId="stat-completed" />
              <Stat label="Failed / rejected jobs" value={preview.data.eligible.failedJobsEligible} testId="stat-failed" />
              <Stat label="Audit events" value={preview.data.eligible.eventsEligible} testId="stat-events" />
              <Stat label="Stale workers" value={preview.data.eligible.workersEligible} testId="stat-workers" />
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => run.mutate({ dryRun: true })}
          disabled={run.isPending}
          variant="outline"
          data-testid="button-dry-run"
        >
          {run.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Dry run with current policy
        </Button>
        <Button
          onClick={onRunReal}
          disabled={run.isPending}
          variant="destructive"
          data-testid="button-run-cleanup"
        >
          Run cleanup (irreversible)
        </Button>
      </div>

      {run.isError && (
        <div className="text-sm text-red-400" data-testid="text-run-error">
          {(run.error as Error)?.message}
        </div>
      )}

      {lastResult && (
        <Card data-testid="card-last-result">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Last run — {lastResult.dryRun ? "dry run" : "executed"} · {lastResult.runId.slice(0, 8)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Succeeded jobs" value={(lastResult.deletedCounts ?? lastResult.eligibleCounts).completedJobsEligible} testId="result-completed" />
            <Stat label="Failed / rejected jobs" value={(lastResult.deletedCounts ?? lastResult.eligibleCounts).failedJobsEligible} testId="result-failed" />
            <Stat label="Audit events" value={(lastResult.deletedCounts ?? lastResult.eligibleCounts).eventsEligible} testId="result-events" />
            <Stat label="Stale workers" value={(lastResult.deletedCounts ?? lastResult.eligibleCounts).workersEligible} testId="result-workers" />
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-history" ref={historyRef as any}>
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Cleanup history</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="bg-background border border-white/10 rounded-md text-xs h-8 px-2"
              value={historyStatus}
              onChange={(e) => setHistoryStatus(e.target.value)}
              data-testid="select-history-status"
            >
              {HISTORY_STATUS_OPTS.map((s) => <option key={s} value={s}>{s ? `status: ${s}` : "any status"}</option>)}
            </select>
            <select
              className="bg-background border border-white/10 rounded-md text-xs h-8 px-2"
              value={historyDryRun}
              onChange={(e) => setHistoryDryRun(e.target.value)}
              data-testid="select-history-dry-run"
            >
              <option value="">any kind</option>
              <option value="true">dry-run only</option>
              <option value="false">executed only</option>
            </select>
            <a
              href={`/api/admin/ai-retention/runs.csv${historyQs ? `?${historyQs}` : ""}`}
              download
            >
              <Button variant="outline" size="sm" data-testid="button-export-history-csv">
                Export CSV
              </Button>
            </a>
            <Button
              variant="outline" size="sm"
              onClick={() => history.refetch()}
              disabled={history.isFetching}
              data-testid="button-refresh-history"
            >
              {history.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {history.isLoading && <div className="text-muted-foreground" data-testid="text-history-loading">Loading…</div>}
          {history.isError && <div className="text-red-400" data-testid="text-history-error">{(history.error as Error)?.message}</div>}
          {history.data && history.data.runs.length === 0 && (
            <div className="text-muted-foreground" data-testid="text-history-empty">No cleanup runs yet.</div>
          )}
          {history.data && history.data.runs.map((r) => (
            <div
              key={r.runId}
              className="border border-border rounded p-2 flex flex-col gap-1"
              data-testid={`history-row-${r.runId}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                <Badge variant={r.dryRun ? "secondary" : "destructive"}>
                  {r.dryRun ? "dry-run" : "executed"}
                </Badge>
                <Badge variant={r.status === "succeeded" ? "default" : r.status === "failed" ? "destructive" : "outline"}>
                  {r.status}
                </Badge>
                <span className="text-muted-foreground">admin: {r.adminId ?? "—"}</span>
                <span className="text-muted-foreground font-mono">{r.runId.slice(0, 8)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                policy {policySummary(r.policy)}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Inline label="eligible jobs ok" value={r.eligibleCounts?.completedJobsEligible} />
                <Inline label="eligible jobs failed" value={r.eligibleCounts?.failedJobsEligible} />
                <Inline label="eligible events" value={r.eligibleCounts?.eventsEligible} />
                <Inline label="eligible workers" value={r.eligibleCounts?.workersEligible} />
              </div>
              {r.deletedCounts && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <Inline label="deleted jobs ok" value={r.deletedCounts.completedJobsEligible} highlight />
                  <Inline label="deleted jobs failed" value={r.deletedCounts.failedJobsEligible} highlight />
                  <Inline label="deleted events" value={r.deletedCounts.eventsEligible} highlight />
                  <Inline label="deleted workers" value={r.deletedCounts.workersEligible} highlight />
                </div>
              )}
              {r.error && (
                <div className="text-xs text-red-400" data-testid={`history-error-${r.runId}`}>
                  {r.error}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div id="exports" ref={exportsRef}>
        <ExportHistoryCard />
      </div>
    </div>
  );
}

type ExportEvent = {
  exportId: string;
  exportType: string;
  adminId: string | null;
  filters: Record<string, unknown> | null;
  rowCount: number;
  filename: string;
  status: string;
  error: string | null;
  createdAt: string;
};

function ExportHistoryCard() {
  const [exportType, setExportType] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const q = useQuery<{ count: number; events: ExportEvent[] }>({
    queryKey: ["/api/admin/ai-export-events", exportType, statusFilter],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (exportType) p.set("exportType", exportType);
      if (statusFilter) p.set("status", statusFilter);
      p.set("limit", "50");
      const r = await fetch(`/api/admin/ai-export-events?${p.toString()}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });
  const summarizeFilters = (f: Record<string, unknown> | null) => {
    if (!f) return "—";
    const parts = Object.entries(f).map(([k, v]) => `${k}=${String(v)}`);
    return parts.length ? parts.join(", ") : "—";
  };
  return (
    <Card data-testid="card-export-history">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base">CSV export history</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="bg-background border border-white/10 rounded-md text-xs h-8 px-2"
            value={exportType}
            onChange={(e) => setExportType(e.target.value)}
            data-testid="select-export-type"
          >
            <option value="">any type</option>
            <option value="ai_ops_snapshots_csv">snapshots</option>
            <option value="ai_retention_runs_csv">retention runs</option>
          </select>
          <select
            className="bg-background border border-white/10 rounded-md text-xs h-8 px-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid="select-export-status"
          >
            <option value="">any status</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
          </select>
          <Button
            variant="outline" size="sm"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            data-testid="button-refresh-export-history"
          >
            {q.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {q.isLoading && <div className="text-muted-foreground" data-testid="text-export-history-loading">Loading…</div>}
        {q.isError && <div className="text-red-400" data-testid="text-export-history-error">{(q.error as Error)?.message}</div>}
        {q.data && q.data.events.length === 0 && (
          <div className="text-muted-foreground" data-testid="text-export-history-empty">No CSV exports yet.</div>
        )}
        {q.data && q.data.events.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-3">When</th>
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3">Admin</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Rows</th>
                  <th className="py-1 pr-3">Filename</th>
                  <th className="py-1 pr-3">Filters</th>
                </tr>
              </thead>
              <tbody>
                {q.data.events.map((e) => (
                  <tr key={e.exportId} className="border-t border-border align-top" data-testid={`export-event-${e.exportId}`}>
                    <td className="py-1 pr-3 font-mono whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="py-1 pr-3">{e.exportType.replace(/_csv$/, "")}</td>
                    <td className="py-1 pr-3 font-mono">{e.adminId ?? "—"}</td>
                    <td className="py-1 pr-3">
                      <Badge variant={e.status === "succeeded" ? "default" : "destructive"}>{e.status}</Badge>
                      {e.error && <div className="text-red-400 mt-1 max-w-xs break-words" data-testid={`export-event-error-${e.exportId}`}>{e.error}</div>}
                    </td>
                    <td className="py-1 pr-3 font-mono text-right">{e.rowCount.toLocaleString()}</td>
                    <td className="py-1 pr-3 font-mono break-all">{e.filename}</td>
                    <td className="py-1 pr-3 text-muted-foreground break-all">{summarizeFilters(e.filters)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function labelFor(k: keyof Policy): string {
  switch (k) {
    case "completedRetentionDays": return "Succeeded jobs";
    case "failedRetentionDays": return "Failed jobs";
    case "eventRetentionDays": return "Audit events";
    case "workerStaleRetentionDays": return "Stale workers";
  }
}

function policySummary(p: Policy | undefined): string {
  if (!p) return "—";
  return `ok=${p.completedRetentionDays}d · fail=${p.failedRetentionDays}d · events=${p.eventRetentionDays}d · workers=${p.workerStaleRetentionDays}d`;
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div data-testid={testId}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-mono">{value.toLocaleString()}</div>
    </div>
  );
}

function Inline({ label, value, highlight }: { label: string; value: number | undefined; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${highlight ? "text-red-300" : ""}`}>{(value ?? 0).toLocaleString()}</span>
    </div>
  );
}
