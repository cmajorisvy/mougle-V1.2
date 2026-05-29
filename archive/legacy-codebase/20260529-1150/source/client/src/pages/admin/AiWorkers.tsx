import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Worker = {
  workerId: string;
  status: string;
  derivedStatus: "online" | "stale" | "offline";
  lastSeenAt: string;
  startedAt: string | null;
  currentJobId: string | null;
  hostname: string | null;
  processId: string | null;
  version: string | null;
  capabilities: string[];
  jobsClaimedCount: number;
  jobsSucceededCount: number;
  jobsFailedCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

const DERIVED_OPTS = ["", "online", "stale", "offline"];
const STATUS_OPTS = ["", "idle", "busy", "draining", "unhealthy", "online"];

function parseInitial() {
  if (typeof window === "undefined") return { workerId: "", status: "", derivedStatus: "" };
  const p = new URLSearchParams(window.location.search);
  return {
    workerId: p.get("workerId") ?? "",
    status: p.get("status") ?? "",
    derivedStatus: p.get("derivedStatus") ?? "",
  };
}

function derivedColor(s: Worker["derivedStatus"]) {
  if (s === "online") return "border-emerald-500/40 text-emerald-400";
  if (s === "stale") return "border-yellow-500/40 text-yellow-400";
  return "border-red-500/40 text-red-400";
}

function reportedColor(s: string) {
  if (s === "idle" || s === "online") return "border-blue-500/40 text-blue-400";
  if (s === "busy") return "border-purple-500/40 text-purple-400";
  if (s === "draining") return "border-orange-500/40 text-orange-400";
  if (s === "unhealthy") return "border-red-500/40 text-red-400";
  return "border-zinc-500/40 text-zinc-400";
}

export default function AiWorkers() {
  const initial = useMemo(parseInitial, []);
  const [workerId, setWorkerId] = useState(initial.workerId);
  const [statusFilter, setStatusFilter] = useState(STATUS_OPTS.includes(initial.status) ? initial.status : "");
  const [derivedFilter, setDerivedFilter] = useState(
    DERIVED_OPTS.includes(initial.derivedStatus) ? initial.derivedStatus : "",
  );

  // URL sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams();
    if (workerId) p.set("workerId", workerId);
    if (statusFilter) p.set("status", statusFilter);
    if (derivedFilter) p.set("derivedStatus", derivedFilter);
    const q = p.toString();
    const next = `${window.location.pathname}${q ? `?${q}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [workerId, statusFilter, derivedFilter]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{
    count: number;
    items: Worker[];
  }>({
    queryKey: ["admin-ai-workers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-workers", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const items = data?.items ?? [];
  const wq = workerId.trim().toLowerCase();
  const filtered = items.filter((w) => {
    if (statusFilter && w.status !== statusFilter) return false;
    if (derivedFilter && w.derivedStatus !== derivedFilter) return false;
    if (wq && !w.workerId.toLowerCase().includes(wq)) return false;
    return true;
  });

  // Scroll to highlighted worker once data is in.
  const highlightTargetRef = useRef<HTMLDivElement | null>(null);
  const exactMatchId = wq ? items.find((w) => w.workerId.toLowerCase() === wq)?.workerId : undefined;
  useEffect(() => {
    if (exactMatchId && highlightTargetRef.current) {
      highlightTargetRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [exactMatchId, data]);

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/admin/ai-jobs">
              <Button variant="ghost" size="sm" data-testid="link-back-jobs" className="h-7 px-2">
                <ArrowLeft className="w-3 h-3 mr-1" /> AI Jobs
              </Button>
            </Link>
            <Link href="/admin/ai-retention">
              <Button variant="ghost" size="sm" data-testid="link-ai-retention" className="h-7 px-2">
                Retention
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-semibold mt-1">AI Workers</h1>
          <p className="text-sm text-muted-foreground">
            Health and throughput for connected Python workers.
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          variant="outline"
          size="sm"
          data-testid="button-refresh-workers"
        >
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-white/10 bg-card/40 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Worker ID search</Label>
          <Input
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            placeholder="exact match scrolls/highlights"
            className="mt-1 h-9 text-sm"
            data-testid="input-worker-id"
          />
        </div>
        <div>
          <Label className="text-xs">Derived status</Label>
          <select
            className="w-full mt-1 bg-background border border-white/10 rounded-md text-sm h-9 px-2"
            value={derivedFilter}
            onChange={(e) => setDerivedFilter(e.target.value)}
            data-testid="select-derived-status"
          >
            {DERIVED_OPTS.map((s) => <option key={s} value={s}>{s || "any"}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Reported status</Label>
          <select
            className="w-full mt-1 bg-background border border-white/10 rounded-md text-sm h-9 px-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid="select-reported-status"
          >
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s || "any"}</option>)}
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground" data-testid="text-workers-loading">
          Loading workers…
        </div>
      )}
      {isError && (
        <div className="text-sm text-red-400" data-testid="text-workers-error">
          {(error as Error)?.message}
        </div>
      )}
      {!isLoading && !isError && filtered.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="text-workers-empty">
            {items.length === 0
              ? "No workers have checked in yet. Start the Python worker to register one."
              : "No workers match the current filters."}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3" data-testid="list-workers">
        {filtered.map((w) => {
          const isHighlight = exactMatchId === w.workerId;
          return (
            <div
              key={w.workerId}
              ref={isHighlight ? highlightTargetRef : null}
              className={isHighlight ? "ring-2 ring-primary rounded-lg" : ""}
              data-testid={isHighlight ? `highlight-worker-${w.workerId}` : undefined}
            >
              <Card data-testid={`card-worker-${w.workerId}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base font-mono" data-testid={`text-worker-id-${w.workerId}`}>
                      {w.workerId}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={derivedColor(w.derivedStatus)} data-testid={`badge-derived-${w.workerId}`}>
                        {w.derivedStatus}
                      </Badge>
                      <Badge variant="outline" className={reportedColor(w.status)} data-testid={`badge-reported-${w.workerId}`}>
                        {w.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <Kv label="Last seen" value={formatDistanceToNow(new Date(w.lastSeenAt), { addSuffix: true })} />
                  <Kv
                    label="Current job"
                    value={w.currentJobId ?? "—"}
                    mono
                    linkHref={w.currentJobId ? `/admin/ai-jobs?lockedBy=${encodeURIComponent(w.workerId)}` : undefined}
                  />
                  <Kv label="Hostname" value={w.hostname ?? "—"} />
                  <Kv label="Version" value={w.version ?? "—"} />
                  <div>
                    <div className="text-muted-foreground">Capabilities</div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {(w.capabilities ?? []).length === 0 ? (
                        <span>—</span>
                      ) : (
                        w.capabilities.map((c) => (
                          <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Kv label="Claimed" value={String(w.jobsClaimedCount)} />
                    <Kv label="Succeeded" value={String(w.jobsSucceededCount)} />
                    <Kv label="Failed" value={String(w.jobsFailedCount)} />
                  </div>
                  <div className="md:col-span-2">
                    <Link href={`/admin/ai-jobs?lockedBy=${encodeURIComponent(w.workerId)}`}>
                      <Button size="sm" variant="ghost" className="text-xs h-7" data-testid={`link-jobs-by-${w.workerId}`}>
                        View jobs locked by this worker →
                      </Button>
                    </Link>
                  </div>
                  {w.lastError && (
                    <div className="md:col-span-2 text-red-400" data-testid={`text-worker-error-${w.workerId}`}>
                      <div className="text-muted-foreground">Last error</div>
                      <div className="font-mono whitespace-pre-wrap">{w.lastError}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kv({ label, value, mono, linkHref }: { label: string; value: string; mono?: boolean; linkHref?: string }) {
  const body = <div className={mono ? "font-mono" : ""}>{value}</div>;
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      {linkHref ? (
        <Link href={linkHref}>
          <a className="hover:underline text-primary">{body}</a>
        </Link>
      ) : (
        body
      )}
    </div>
  );
}
