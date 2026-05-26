import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Item = {
  jobId: string;
  jobType: string;
  origin: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  sourceSummary: Record<string, any> | null;
  resultSummary: Record<string, any> | null;
  statusUrl: string;
  error: string | null;
};

const STATUS_OPTS = ["", "pending", "running", "succeeded", "failed", "rejected", "cancelled"];
const TYPE_OPTS = ["", "user.claim_extraction", "vector.clustering"];

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

export default function MyAiJobs() {
  const [status, setStatus] = useState("");
  const [jobType, setJobType] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (jobType) p.set("jobType", jobType);
    p.set("limit", "50");
    return p.toString();
  }, [status, jobType]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ count: number; items: Item[] }>({
    queryKey: ["my-ai-jobs", status, jobType],
    queryFn: async () => {
      const res = await fetch(`/api/ai-jobs?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const items = data?.items ?? [];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="heading-my-jobs">My AI Jobs</h1>
            <p className="text-sm text-muted-foreground">
              History of claim-extraction and clustering jobs you've enqueued.
            </p>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-jobs"
          >
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
            Refresh
          </Button>
        </div>

        <div className="rounded-xl border border-white/10 bg-card/40 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Status</Label>
            <select
              className="w-full mt-1 bg-background border border-white/10 rounded-md text-sm h-9 px-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              data-testid="select-status"
            >
              {STATUS_OPTS.map((s) => <option key={s} value={s}>{s || "any"}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Job type</Label>
            <select
              className="w-full mt-1 bg-background border border-white/10 rounded-md text-sm h-9 px-2"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              data-testid="select-job-type"
            >
              {TYPE_OPTS.map((t) => <option key={t} value={t}>{t || "any"}</option>)}
            </select>
          </div>
          <div className="flex items-end text-xs text-muted-foreground">
            {data ? `${data.count} result${data.count === 1 ? "" : "s"}` : ""}
          </div>
        </div>

        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {isError && (
          <div className="flex items-start gap-2 text-sm text-red-400" data-testid="text-error">
            <AlertCircle className="w-4 h-4 mt-0.5" /> {(error as Error)?.message}
          </div>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <div className="text-sm text-muted-foreground" data-testid="text-empty">No jobs yet.</div>
        )}

        <ul className="space-y-2">
          {items.map((j) => {
            const open = !!expanded[j.jobId];
            return (
              <li
                key={j.jobId}
                className="rounded-xl border border-white/10 bg-card/40 p-3"
                data-testid={`row-job-${j.jobId}`}
              >
                <button
                  className="flex items-center justify-between w-full text-left"
                  onClick={() => setExpanded((e) => ({ ...e, [j.jobId]: !open }))}
                  data-testid={`button-toggle-${j.jobId}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={`text-[10px] ${statusColor(j.status)}`}>
                      {j.status}
                    </Badge>
                    <span className="text-sm font-mono truncate">{j.jobType}</span>
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                      {formatDistanceToNow(new Date(j.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {open && (
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="text-muted-foreground font-mono">{j.jobId}</div>
                    {j.sourceSummary && (
                      <div>
                        <span className="text-muted-foreground">Source:</span>{" "}
                        <span className="font-mono">{JSON.stringify(j.sourceSummary)}</span>
                      </div>
                    )}
                    {j.resultSummary && (
                      <div data-testid={`text-result-${j.jobId}`}>
                        <span className="text-muted-foreground">Result:</span>{" "}
                        <span className="font-mono">{JSON.stringify(j.resultSummary)}</span>
                      </div>
                    )}
                    {j.status === "failed" && (
                      <div className="text-red-400">Job failed.</div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Layout>
  );
}
