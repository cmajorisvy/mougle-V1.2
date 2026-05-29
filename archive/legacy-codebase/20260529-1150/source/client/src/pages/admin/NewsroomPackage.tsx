import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Newspaper, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useAiJobRunner } from "@/hooks/use-ai-job";

function splitIds(raw: string): string[] {
  return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

type NewsroomResult = {
  package_id?: string;
  summary?: string;
  top_claims?: Array<{ text?: string; confidence?: number; claim_type?: string }>;
  topic_clusters?: Array<{ label?: string; size?: number; keywords?: string[] }>;
  risk_flags?: Array<{ kind?: string; message?: string; severity?: string }>;
  source_questions?: string[];
  suggested_followups?: string[];
  editorial_notes?: string;
  confidence?: number;
  generated_at?: string;
};

export default function NewsroomPackage() {
  const { isLoading, isAuthenticated, isAuthorized } = useAdminAuth();
  const [postIds, setPostIds] = useState("");
  const [claimJobIds, setClaimJobIds] = useState("");
  const [clusterJobIds, setClusterJobIds] = useState("");
  const [sourcesRaw, setSourcesRaw] = useState("");
  const [templateId, setTemplateId] = useState("news_desk");

  const runner = useAiJobRunner<Record<string, unknown>>(
    "/api/admin/ai-jobs/newsroom-package",
    { intervalMs: 3000 },
  );

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!isAuthenticated || !isAuthorized) return null;

  const sources = sourcesRaw
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text, idx) => ({ id: `src:${idx}`, text }));

  const submit = () => {
    const body: Record<string, unknown> = { templateId };
    const p = splitIds(postIds);
    const cj = splitIds(claimJobIds);
    const kj = splitIds(clusterJobIds);
    if (p.length) body.postIds = p;
    if (cj.length) body.claimJobIds = cj;
    if (kj.length) body.clusterJobIds = kj;
    if (sources.length) body.sources = sources;
    runner.run(body);
  };

  const status = runner.job?.status;
  const result: NewsroomResult | undefined = runner.job?.result;
  const enqueueResp = runner.enqueueResponse as
    | { jobId?: string; statusUrl?: string; source?: Record<string, any> }
    | null;
  const summary = enqueueResp?.source;
  const isWorking = runner.isEnqueuing || (!!status && !runner.isTerminal);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="heading-newsroom">
          <Newspaper className="w-6 h-6 text-amber-400" />
          Newsroom Package Generator
        </h1>
        <p className="text-sm text-muted-foreground">
          Admin-only. Aggregates posts, prior AI job results, and direct text into a single newsroom intelligence package.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-card/40 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="post-ids">Post IDs (comma or newline separated)</Label>
            <Textarea
              id="post-ids" rows={3} value={postIds}
              onChange={(e) => setPostIds(e.target.value)}
              data-testid="input-post-ids"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="template-id">Template</Label>
            <Input
              id="template-id" value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              data-testid="input-template-id"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="claim-jobs">Claim job IDs (succeeded only)</Label>
            <Textarea
              id="claim-jobs" rows={3} value={claimJobIds}
              onChange={(e) => setClaimJobIds(e.target.value)}
              data-testid="input-claim-jobs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cluster-jobs">Cluster job IDs (succeeded only)</Label>
            <Textarea
              id="cluster-jobs" rows={3} value={clusterJobIds}
              onChange={(e) => setClusterJobIds(e.target.value)}
              data-testid="input-cluster-jobs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sources">Direct source text (separate items with a blank line)</Label>
          <Textarea
            id="sources" rows={6} value={sourcesRaw}
            onChange={(e) => setSourcesRaw(e.target.value)}
            placeholder={"First source...\n\nSecond source..."}
            data-testid="input-sources"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={isWorking} data-testid="button-generate-package">
            {isWorking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Newspaper className="w-4 h-4 mr-2" />}
            Generate package
          </Button>
          {status && <Badge variant="outline" data-testid="badge-newsroom-status">{status}</Badge>}
          {runner.isPolling && <span className="text-xs text-muted-foreground">Polling job…</span>}
        </div>

        {runner.enqueueError && (
          <div className="flex items-start gap-2 text-sm text-red-400" data-testid="text-newsroom-error">
            <AlertCircle className="w-4 h-4 mt-0.5" /> {runner.enqueueError}
          </div>
        )}
      </div>

      {summary && (
        <div className="rounded-xl border border-white/10 bg-card/40 p-4 text-xs space-y-1" data-testid="section-source-summary">
          <div className="font-medium text-sm">Source summary</div>
          <pre className="whitespace-pre-wrap text-muted-foreground">{JSON.stringify(summary, null, 2)}</pre>
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400" data-testid="text-newsroom-failed">
          Job failed: {runner.job?.error?.message ?? "unknown error"}
        </div>
      )}

      {status === "succeeded" && result && (
        <div className="space-y-4" data-testid="section-newsroom-result">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-2 text-emerald-400 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Package {result.package_id ?? ""} generated
            {typeof result.confidence === "number" && (
              <Badge variant="outline" className="ml-2">{Math.round(result.confidence * 100)}%</Badge>
            )}
            {result.generated_at && (
              <span className="ml-auto text-xs text-muted-foreground">{result.generated_at}</span>
            )}
          </div>

          {result.summary && (
            <Section title="Summary"><p className="text-sm">{result.summary}</p></Section>
          )}

          {Array.isArray(result.top_claims) && result.top_claims.length > 0 && (
            <Section title="Top claims">
              <ul className="space-y-2">
                {result.top_claims.map((c, i) => (
                  <li key={i} className="rounded border border-white/5 p-2 text-sm" data-testid={`card-newsroom-claim-${i}`}>
                    <div>{c.text}</div>
                    <div className="mt-1 flex gap-1">
                      {c.claim_type && <Badge variant="outline" className="text-[10px]">{c.claim_type}</Badge>}
                      {typeof c.confidence === "number" && (
                        <Badge variant="outline" className="text-[10px]">{Math.round(c.confidence * 100)}%</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {Array.isArray(result.topic_clusters) && result.topic_clusters.length > 0 && (
            <Section title="Topic clusters">
              <ul className="space-y-2">
                {result.topic_clusters.map((c, i) => (
                  <li key={i} className="rounded border border-white/5 p-2 text-sm" data-testid={`card-newsroom-cluster-${i}`}>
                    <div className="font-medium">{c.label}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">{c.size ?? 0} items</Badge>
                      {(c.keywords ?? []).map((k, j) => (
                        <Badge key={j} variant="secondary" className="text-[10px]">{k}</Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {Array.isArray(result.risk_flags) && result.risk_flags.length > 0 && (
            <Section title="Risk flags">
              <ul className="space-y-1 text-sm">
                {result.risk_flags.map((r, i) => (
                  <li key={i} className="flex items-start gap-2" data-testid={`text-newsroom-flag-${i}`}>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-yellow-500/40 text-yellow-400"
                    >
                      {r.severity ?? r.kind ?? "flag"}
                    </Badge>
                    <span>{r.message}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {Array.isArray(result.source_questions) && result.source_questions.length > 0 && (
            <Section title="Source questions">
              <ul className="list-disc pl-5 text-sm space-y-1">
                {result.source_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </Section>
          )}

          {Array.isArray(result.suggested_followups) && result.suggested_followups.length > 0 && (
            <Section title="Suggested follow-ups">
              <ul className="list-disc pl-5 text-sm space-y-1">
                {result.suggested_followups.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </Section>
          )}

          {result.editorial_notes && (
            <Section title="Editorial notes"><p className="text-sm">{result.editorial_notes}</p></Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-4 space-y-2">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}
