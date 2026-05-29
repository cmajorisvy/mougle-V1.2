import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useAiJobRunner } from "@/hooks/use-ai-job";
import { cn } from "@/lib/utils";

type Claim = {
  claim_id?: string;
  text?: string;
  claim_type?: string;
  confidence?: number;
  entities?: string[];
  evidence_needed?: boolean;
  notes?: string;
};

export function ClaimExtractionPanel({ postId }: { postId: string }) {
  const [expanded, setExpanded] = useState(true);
  const runner = useAiJobRunner<Record<string, never>>(
    `/api/posts/${postId}/claim-extraction`,
  );

  const status = runner.job?.status;
  const isWorking = runner.isEnqueuing || (!!status && !runner.isTerminal);
  const claims: Claim[] = Array.isArray(runner.job?.result?.claims)
    ? runner.job!.result.claims
    : [];

  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-4 space-y-3" data-testid="panel-claim-extraction">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setExpanded((e) => !e)}
        data-testid="button-toggle-claims"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="w-4 h-4 text-purple-400" />
          AI Claim Extraction
          {status && (
            <Badge variant="outline" className="ml-2 text-xs" data-testid="badge-claim-status">
              {status}
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => runner.run({})}
              disabled={isWorking}
              data-testid="button-extract-claims"
            >
              {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {runner.job ? "Re-run" : "Extract claims"}
            </Button>
            {runner.isPolling && (
              <span className="text-xs text-muted-foreground" data-testid="text-claim-polling">
                Polling job…
              </span>
            )}
          </div>

          {runner.enqueueError && (
            <div className="flex items-start gap-2 text-xs text-red-400" data-testid="text-claim-error">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5" /> {runner.enqueueError}
            </div>
          )}
          {runner.pollError && (
            <div className="flex items-start gap-2 text-xs text-red-400" data-testid="text-claim-poll-error">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5" /> {runner.pollError}
            </div>
          )}

          {runner.job?.status === "failed" && (
            <div className="text-xs text-red-400" data-testid="text-claim-failed">
              Job failed: {runner.job.error?.message ?? "unknown error"}
            </div>
          )}

          {runner.job?.status === "succeeded" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {claims.length} claim{claims.length === 1 ? "" : "s"} extracted
              </div>
              {claims.length === 0 && (
                <div className="text-xs text-muted-foreground">No claims found in this post.</div>
              )}
              <ul className="space-y-2">
                {claims.map((c, i) => (
                  <li
                    key={c.claim_id ?? i}
                    className="rounded-lg border border-white/5 bg-background/40 p-3 text-sm"
                    data-testid={`card-claim-${i}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-foreground" data-testid={`text-claim-text-${i}`}>{c.text}</div>
                      <div className="flex flex-wrap gap-1 shrink-0">
                        {c.claim_type && (
                          <Badge variant="outline" className="text-[10px]" data-testid={`badge-claim-type-${i}`}>
                            {c.claim_type}
                          </Badge>
                        )}
                        {typeof c.confidence === "number" && (
                          <Badge variant="outline" className="text-[10px]" data-testid={`badge-claim-confidence-${i}`}>
                            {Math.round(c.confidence * 100)}%
                          </Badge>
                        )}
                        {c.evidence_needed && (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] border-yellow-500/40 text-yellow-400")}
                            data-testid={`badge-claim-evidence-${i}`}
                          >
                            evidence needed
                          </Badge>
                        )}
                      </div>
                    </div>
                    {Array.isArray(c.entities) && c.entities.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.entities.map((e, j) => (
                          <Badge key={j} variant="secondary" className="text-[10px]">{e}</Badge>
                        ))}
                      </div>
                    )}
                    {c.notes && (
                      <div className="mt-2 text-xs text-muted-foreground" data-testid={`text-claim-notes-${i}`}>
                        {c.notes}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
