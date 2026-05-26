import { useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Layers, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAiJobRunner } from "@/hooks/use-ai-job";

type Cluster = {
  cluster_id?: string;
  label?: string;
  size?: number;
  member_ids?: string[];
  representative_text?: string;
  keywords?: string[];
  confidence?: number;
};

export default function AiTools() {
  const [raw, setRaw] = useState("");
  const items = useMemo(
    () =>
      raw
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text, idx) => ({ id: `item:${idx}`, text })),
    [raw],
  );

  const runner = useAiJobRunner<{ items: { id: string; text: string }[] }>(
    "/api/ai-jobs/semantic-clustering",
  );

  const status = runner.job?.status;
  const clusters: Cluster[] = Array.isArray(runner.job?.result?.clusters)
    ? runner.job!.result.clusters
    : [];
  const tooFew = items.length < 2;
  const tooMany = items.length > 500;
  const disabled = tooFew || tooMany || runner.isEnqueuing || (!!status && !runner.isTerminal);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="heading-ai-tools">
            <Layers className="w-6 h-6 text-purple-400" />
            AI Tools — Semantic Clustering
          </h1>
          <p className="text-sm text-muted-foreground">
            Paste two or more snippets (separated by a blank line) to group them by topic.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-card/40 p-5 space-y-3">
          <Label htmlFor="cluster-items">Items</Label>
          <Textarea
            id="cluster-items"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={10}
            placeholder={"First snippet of text...\n\nSecond snippet of text...\n\nThird snippet of text..."}
            data-testid="input-cluster-items"
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground" data-testid="text-item-count">
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
            {tooFew && raw.length > 0 && (
              <span className="text-yellow-400" data-testid="text-too-few">Need at least 2 items</span>
            )}
            {tooMany && (
              <span className="text-red-400" data-testid="text-too-many">Limit is 500 items</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => runner.run({ items })}
              disabled={disabled}
              data-testid="button-run-clustering"
            >
              {runner.isEnqueuing || (status && !runner.isTerminal) ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Cluster
            </Button>
            {status && (
              <Badge variant="outline" data-testid="badge-cluster-status">{status}</Badge>
            )}
            {runner.isPolling && <span className="text-xs text-muted-foreground">Polling job…</span>}
          </div>

          {runner.enqueueError && (
            <div className="flex items-start gap-2 text-sm text-red-400" data-testid="text-cluster-error">
              <AlertCircle className="w-4 h-4 mt-0.5" /> {runner.enqueueError}
            </div>
          )}
        </div>

        {status === "failed" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400" data-testid="text-cluster-failed">
            Job failed: {runner.job?.error?.message ?? "unknown error"}
          </div>
        )}

        {status === "succeeded" && (
          <div className="space-y-3" data-testid="section-clusters">
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              {clusters.length} cluster{clusters.length === 1 ? "" : "s"}
            </div>
            {clusters.map((c, i) => (
              <div
                key={c.cluster_id ?? i}
                className="rounded-xl border border-white/10 bg-card/40 p-4 space-y-2"
                data-testid={`card-cluster-${i}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium" data-testid={`text-cluster-label-${i}`}>
                    {c.label || `Cluster ${i + 1}`}
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" data-testid={`badge-cluster-size-${i}`}>
                      {c.size ?? c.member_ids?.length ?? 0} items
                    </Badge>
                    {typeof c.confidence === "number" && (
                      <Badge variant="outline">{Math.round(c.confidence * 100)}%</Badge>
                    )}
                  </div>
                </div>
                {c.representative_text && (
                  <div className="text-sm text-muted-foreground" data-testid={`text-cluster-rep-${i}`}>
                    {c.representative_text}
                  </div>
                )}
                {Array.isArray(c.keywords) && c.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.keywords.map((k, j) => (
                      <Badge key={j} variant="secondary" className="text-[10px]">{k}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
