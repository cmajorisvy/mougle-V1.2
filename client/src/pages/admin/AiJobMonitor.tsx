import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

const RELATIVE_RE = /^(\d+)(h|d)$/;
function parseInitialParams() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["status", "jobType", "origin", "lockedBy", "requestedByUserId", "requestedByAdminId", "since", "until"]) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  return out;
}
function resolveSinceUntil(v: string): string | undefined {
  if (!v) return undefined;
  const m = v.match(RELATIVE_RE);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const ms = m[2] === "h" ? n * 3600_000 : n * 86_400_000;
    return new Date(Date.now() - ms).toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, AlertCircle, ChevronDown, ChevronUp, RotateCw, Ban } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToast } from "@/hooks/use-toast";

type Item = {
  jobId: string;
  jobType: string;
  origin: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  startedAt: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  requestedByUserId: string | null;
  requestedByAdminId: string | null;
  retryCount: number;
  maxRetries: number;
  durationMs: number | null;
  sourceSummary: Record<string, any> | null;
  resultSummary: Record<string, any> | null;
  error: string | null;
};

const STATUS_OPTS = ["", "pending", "running", "succeeded", "failed", "rejected", "cancelled"];
const ORIGIN_OPTS = ["", "user", "inhouse"];
const TYPE_OPTS = ["", "user.claim_extraction", "vector.clustering", "inhouse.newsroom"];

function statusColor(s: string) {
  switch (s) {
    case "succeeded": return "border-emerald-500/40 text-emerald-400";
    case "failed":
    case "rejected": return "border-red-500/40 text-red-400";
    case "running":
    case "claimed": return "border-blue-500/40 text-blue-400";
    case "cancelled": return "border-zinc-500/40 text-zinc-400";
    default: return "border-yellow-500/40 text-yellow-400";
  }
}

export default function AiJobMonitor() {
  const { isLoading: authLoading, isAuthenticated, isAuthorized } = useAdminAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initial = useMemo(parseInitialParams, []);
  const [status, setStatus] = useState(STATUS_OPTS.includes(initial.status) ? initial.status : "");
  const [jobType, setJobType] = useState(initial.jobType ?? "");
  const [origin, setOrigin] = useState(ORIGIN_OPTS.includes(initial.origin) ? initial.origin : "");
  const [lockedBy, setLockedBy] = useState(initial.lockedBy ?? "");
  const [requestedByUserId, setRequestedByUserId] = useState(initial.requestedByUserId ?? "");
  const [requestedByAdminId, setRequestedByAdminId] = useState(initial.requestedByAdminId ?? "");
  const [since, setSince] = useState(initial.since ?? "");
  const [until, setUntil] = useState(initial.until ?? "");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const actionMutation = useMutation({
    mutationFn: async (args: { jobId: string; action: "retry" | "cancel" }) => {
      const res = await fetch(`/api/admin/ai-jobs/${args.jobId}/${args.action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || `${res.status}`);
      return body;
    },
    onSuccess: (data: any, vars) => {
      toast({
        title: vars.action === "retry" ? "Job re-queued" : "Job cancelled",
        description: data?.message ?? "",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-jobs"] });
    },
    onError: (err: any, vars) => {
      toast({
        title: `${vars.action === "retry" ? "Retry" : "Cancel"} failed`,
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
    onSettled: () => setBusyJobId(null),
  });

  const handleAction = (jobId: string, action: "retry" | "cancel") => {
    const verb = action === "retry" ? "re-queue" : "cancel";
    if (!window.confirm(`Are you sure you want to ${verb} job ${jobId}?`)) return;
    setBusyJobId(jobId);
    actionMutation.mutate({ jobId, action });
  };

  const resolvedSince = useMemo(() => resolveSinceUntil(since), [since]);
  const resolvedUntil = useMemo(() => resolveSinceUntil(until), [until]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (jobType) p.set("jobType", jobType);
    if (origin) p.set("origin", origin);
    if (lockedBy) p.set("lockedBy", lockedBy);
    if (requestedByUserId) p.set("requestedByUserId", requestedByUserId);
    if (requestedByAdminId) p.set("requestedByAdminId", requestedByAdminId);
    if (resolvedSince) p.set("since", resolvedSince);
    if (resolvedUntil) p.set("until", resolvedUntil);
    p.set("limit", "100");
    return p.toString();
  }, [status, jobType, origin, lockedBy, requestedByUserId, requestedByAdminId, resolvedSince, resolvedUntil]);

  // Keep URL in sync with current filters (replaceState — no navigation).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (jobType) p.set("jobType", jobType);
    if (origin) p.set("origin", origin);
    if (lockedBy) p.set("lockedBy", lockedBy);
    if (requestedByUserId) p.set("requestedByUserId", requestedByUserId);
    if (requestedByAdminId) p.set("requestedByAdminId", requestedByAdminId);
    if (since) p.set("since", since);
    if (until) p.set("until", until);
    const q = p.toString();
    const next = `${window.location.pathname}${q ? `?${q}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [status, jobType, origin, lockedBy, requestedByUserId, requestedByAdminId, since, until]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ count: number; items: Item[] }>({
    queryKey: ["admin-ai-jobs", status, jobType, origin, lockedBy, requestedByUserId, requestedByAdminId, resolvedSince, resolvedUntil],
    enabled: !authLoading && isAuthenticated && isAuthorized,
    queryFn: async () => {
      const res = await fetch(`/api/admin/ai-jobs?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  if (authLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!isAuthenticated || !isAuthorized) return null;

  const items = data?.items ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-job-monitor">AI Job Monitor</h1>
          <p className="text-sm text-muted-foreground">All AI jobs across users, admins, and the in-house newsroom.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/ai-workers">
            <Button variant="outline" size="sm" data-testid="link-ai-workers">
              AI Workers
            </Button>
          </Link>
          <Link href="/admin/ai-retention">
            <Button variant="outline" size="sm" data-testid="link-ai-retention">
              Retention
            </Button>
          </Link>
          <Link href="/admin/ai-ops">
            <Button variant="outline" size="sm" data-testid="link-ai-ops">
              AI Ops
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-monitor">
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-card/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Status</Label>
          <select className="w-full mt-1 bg-background border border-white/10 rounded-md text-sm h-9 px-2"
            value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-monitor-status">
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s || "any"}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Job type</Label>
          <select className="w-full mt-1 bg-background border border-white/10 rounded-md text-sm h-9 px-2"
            value={jobType} onChange={(e) => setJobType(e.target.value)} data-testid="select-monitor-type">
            {TYPE_OPTS.map((t) => <option key={t} value={t}>{t || "any"}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Origin</Label>
          <select className="w-full mt-1 bg-background border border-white/10 rounded-md text-sm h-9 px-2"
            value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="select-monitor-origin">
            {ORIGIN_OPTS.map((o) => <option key={o} value={o}>{o || "any"}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Locked by</Label>
          <Input
            value={lockedBy}
            onChange={(e) => setLockedBy(e.target.value)}
            placeholder="e.g. python-worker"
            className="mt-1 h-9 text-sm"
            data-testid="input-locked-by"
          />
        </div>
        <div>
          <Label className="text-xs">Requested by user</Label>
          <Input
            value={requestedByUserId}
            onChange={(e) => setRequestedByUserId(e.target.value)}
            placeholder="user id"
            className="mt-1 h-9 text-sm"
            data-testid="input-requested-by-user"
          />
        </div>
        <div>
          <Label className="text-xs">Requested by admin</Label>
          <Input
            value={requestedByAdminId}
            onChange={(e) => setRequestedByAdminId(e.target.value)}
            placeholder="admin id"
            className="mt-1 h-9 text-sm"
            data-testid="input-requested-by-admin"
          />
        </div>
        <div>
          <Label className="text-xs">Since</Label>
          <Input
            value={since}
            onChange={(e) => setSince(e.target.value)}
            placeholder="24h, 7d, or ISO date"
            className="mt-1 h-9 text-sm"
            data-testid="input-since"
          />
        </div>
        <div>
          <Label className="text-xs">Until</Label>
          <Input
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            placeholder="ISO date"
            className="mt-1 h-9 text-sm"
            data-testid="input-until"
          />
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {isError && (
        <div className="flex items-start gap-2 text-sm text-red-400" data-testid="text-monitor-error">
          <AlertCircle className="w-4 h-4 mt-0.5" /> {(error as Error)?.message}
        </div>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <div className="text-sm text-muted-foreground" data-testid="text-monitor-empty">No jobs match.</div>
      )}

      <ul className="space-y-2">
        {items.map((j) => {
          const open = !!expanded[j.jobId];
          return (
            <li key={j.jobId} className="rounded-xl border border-white/10 bg-card/40 p-3" data-testid={`row-monitor-${j.jobId}`}>
              <button
                className="flex items-center justify-between w-full text-left gap-2"
                onClick={() => setExpanded((e) => ({ ...e, [j.jobId]: !open }))}
                data-testid={`button-toggle-monitor-${j.jobId}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${statusColor(j.status)}`}>{j.status}</Badge>
                  <Badge variant="outline" className="text-[10px]">{j.origin}</Badge>
                  <span className="text-sm font-mono truncate">{j.jobType}</span>
                  {j.lockedBy && (
                    <Badge variant="secondary" className="text-[10px]">locked: {j.lockedBy}</Badge>
                  )}
                  {j.retryCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">retry {j.retryCount}/{j.maxRetries}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {formatDistanceToNow(new Date(j.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {open && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <Kv label="Job ID" value={j.jobId} mono />
                  <Kv label="Requested by user" value={j.requestedByUserId ?? "—"} mono />
                  <Kv label="Requested by admin" value={j.requestedByAdminId ?? "—"} mono />
                  <Kv label="Created" value={j.createdAt} />
                  <Kv label="Updated" value={j.updatedAt} />
                  <Kv label="Started" value={j.startedAt ?? "—"} />
                  <Kv label="Locked at" value={j.lockedAt ?? "—"} />
                  <Kv label="Completed" value={j.completedAt ?? "—"} />
                  <Kv label="Failed" value={j.failedAt ?? "—"} />
                  <Kv label="Duration (ms)" value={j.durationMs == null ? "—" : String(j.durationMs)} />
                  {j.sourceSummary && (
                    <div className="md:col-span-2">
                      <div className="text-muted-foreground">Source summary</div>
                      <pre className="font-mono whitespace-pre-wrap">{JSON.stringify(j.sourceSummary, null, 2)}</pre>
                    </div>
                  )}
                  {j.resultSummary && (
                    <div className="md:col-span-2" data-testid={`text-monitor-result-${j.jobId}`}>
                      <div className="text-muted-foreground">Result summary</div>
                      <pre className="font-mono whitespace-pre-wrap">{JSON.stringify(j.resultSummary, null, 2)}</pre>
                    </div>
                  )}
                  {j.error && (
                    <div className="md:col-span-2 text-red-400" data-testid={`text-monitor-jobs-error-${j.jobId}`}>
                      <div className="text-muted-foreground">Error</div>
                      <div className="font-mono whitespace-pre-wrap">{j.error}</div>
                    </div>
                  )}
                  <div className="md:col-span-2 pt-2 border-t border-white/10">
                    <AuditPanel jobId={j.jobId} />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2 pt-2 border-t border-white/10">
                    {(j.status === "failed" || j.status === "rejected") &&
                      j.retryCount < j.maxRetries && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyJobId === j.jobId}
                          onClick={() => handleAction(j.jobId, "retry")}
                          data-testid={`button-retry-${j.jobId}`}
                        >
                          {busyJobId === j.jobId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                          ) : (
                            <RotateCw className="w-3.5 h-3.5 mr-2" />
                          )}
                          Retry ({j.retryCount}/{j.maxRetries})
                        </Button>
                      )}
                    {(j.status === "pending" || j.status === "running") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyJobId === j.jobId}
                        onClick={() => handleAction(j.jobId, "cancel")}
                        data-testid={`button-cancel-${j.jobId}`}
                      >
                        {busyJobId === j.jobId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                        ) : (
                          <Ban className="w-3.5 h-3.5 mr-2" />
                        )}
                        Cancel
                      </Button>
                    )}
                    {j.status === "succeeded" && (
                      <span className="text-xs text-muted-foreground">
                        No actions available — job succeeded.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono" : ""}>{value}</div>
    </div>
  );
}

type AuditEvent = {
  id: string;
  jobId: string;
  eventType: string;
  actorType: string;
  actorUserId: string | null;
  actorAdminId: string | null;
  actorWorkerId: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  message: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

function eventColor(type: string) {
  if (type.endsWith(".created") || type.endsWith(".retried")) return "border-blue-500/40 text-blue-400";
  if (type.endsWith(".succeeded")) return "border-emerald-500/40 text-emerald-400";
  if (type.endsWith(".failed") || type.endsWith(".rejected") || type.endsWith(".result_rejected")) return "border-red-500/40 text-red-400";
  if (type.endsWith(".cancelled")) return "border-orange-500/40 text-orange-400";
  if (type.endsWith(".stale_detected")) return "border-yellow-500/40 text-yellow-400";
  if (type.endsWith(".claimed") || type.endsWith(".running")) return "border-purple-500/40 text-purple-400";
  return "border-zinc-500/40 text-zinc-400";
}

function AuditPanel({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ count: number; items: AuditEvent[] }>({
    queryKey: ["admin-ai-job-events", jobId],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/admin/ai-jobs/${jobId}/events`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        data-testid={`button-show-audit-${jobId}`}
        className="text-xs"
      >
        Show audit log
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Audit log</div>
        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid={`button-refresh-audit-${jobId}`}
            className="text-xs h-7"
          >
            {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => setOpen(false)}
            data-testid={`button-hide-audit-${jobId}`}
            className="text-xs h-7"
          >
            Hide
          </Button>
        </div>
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading events…</div>}
      {isError && (
        <div className="text-xs text-red-400" data-testid={`text-audit-error-${jobId}`}>
          {(error as Error)?.message}
        </div>
      )}
      {!isLoading && !isError && (data?.count ?? 0) === 0 && (
        <div className="text-xs text-muted-foreground" data-testid={`text-audit-empty-${jobId}`}>
          No events recorded.
        </div>
      )}
      <ul className="space-y-1.5" data-testid={`list-audit-${jobId}`}>
        {(data?.items ?? []).map((ev) => (
          <li
            key={ev.id}
            className="rounded-md border border-white/5 bg-background/40 p-2 text-xs"
            data-testid={`row-audit-${ev.id}`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-[10px] ${eventColor(ev.eventType)}`}>
                {ev.eventType}
              </Badge>
              <Badge variant="outline" className="text-[10px]">{ev.actorType}</Badge>
              {ev.previousStatus && ev.newStatus && ev.previousStatus !== ev.newStatus && (
                <span className="text-muted-foreground font-mono">
                  {ev.previousStatus} → {ev.newStatus}
                </span>
              )}
              <span className="text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
              </span>
            </div>
            {ev.message && <div className="mt-1">{ev.message}</div>}
            <div className="mt-1 text-muted-foreground text-[11px] font-mono space-x-2">
              {ev.actorAdminId && <span>admin:{ev.actorAdminId}</span>}
              {ev.actorUserId && <span>user:{ev.actorUserId}</span>}
              {ev.actorWorkerId && <span>worker:{ev.actorWorkerId}</span>}
            </div>
            {ev.metadata && Object.keys(ev.metadata).length > 0 && (
              <pre className="mt-1 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                {JSON.stringify(ev.metadata)}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
