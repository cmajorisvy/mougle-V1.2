import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type AdminNewsToDebatePayload, type AdminNewsToDebateResult } from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, FileText, Loader2, Newspaper, Radio, ShieldCheck, Sparkles } from "lucide-react";

function reliabilityClass(quality: string) {
  if (quality === "high") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (quality === "medium") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  return "bg-red-500/10 text-red-300 border-red-500/20";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString();
}

function DraftResult({ result }: { result: AdminNewsToDebateResult }) {
  const transcriptByRound = result.transcript.reduce<Record<number, typeof result.transcript>>((acc, turn) => {
    const round = turn.roundNumber || 1;
    acc[round] = [...(acc[round] || []), turn];
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-300" />
              <h2 className="text-lg font-semibold">Draft Generated</h2>
              <Badge className="bg-violet-500/10 text-violet-300 border-violet-500/20">Admin Review</Badge>
            </div>
            <p className="text-sm text-zinc-400 mt-2">{result.debate.title}</p>
          </div>
          <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">Debate #{result.debate.id}</Badge>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-5">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-500">Status</p>
            <p className="text-sm font-medium text-zinc-100">{result.debate.status}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-500">Article</p>
            <p className="text-sm font-medium text-zinc-100">{result.article.reusedExisting ? "Reused existing" : "Created manual record"}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-500">Public Exposure</p>
            <p className="text-sm font-medium text-zinc-100">Blocked</p>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Source Reliability</h3>
            <Badge className={reliabilityClass(result.sourceReliability.quality)}>{result.sourceReliability.score.toFixed(2)}</Badge>
          </div>
          <div className="mt-4 space-y-2">
            {result.sourceReliability.factors.map((factor) => (
              <p key={factor} className="text-sm text-zinc-400">{factor}</p>
            ))}
          </div>
        </Card>

        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5 lg:col-span-2">
          <h3 className="font-semibold">Selected Agents</h3>
          <div className="grid md:grid-cols-2 gap-3 mt-4">
            {result.selectedAgents.map((agent) => (
              <div key={agent.key} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-sm font-medium text-zinc-100">{agent.displayName}</p>
                <p className="text-xs text-zinc-500 mt-1">{agent.position}</p>
                <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{agent.role}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
        <h3 className="font-semibold">MOUGLE Synthesis</h3>
        <p className="text-sm text-zinc-300 mt-3 leading-6">{result.synthesis.conclusion}</p>
        {result.synthesis.openRisks.length > 0 && (
          <div className="mt-4 rounded-lg border border-yellow-500/15 bg-yellow-500/[0.04] p-3">
            <p className="text-xs uppercase tracking-wide text-yellow-300 mb-2">Open Disagreements / Risks</p>
            <ul className="space-y-1">
              {result.synthesis.openRisks.map((risk) => (
                <li key={risk} className="text-sm text-zinc-300">{risk}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
        <h3 className="font-semibold">Draft Transcript</h3>
        <div className="mt-4 space-y-4">
          {Object.entries(transcriptByRound).map(([round, turns]) => (
            <div key={round} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Round {round}</p>
              <div className="space-y-3">
                {turns.map((turn) => (
                  <div key={turn.id} className="border-l border-violet-500/30 pl-3">
                    <p className="text-xs text-zinc-500">Turn {turn.turnOrder} · {turn.audienceReaction?.stance || "analysis"}</p>
                    <p className="text-sm text-zinc-300 mt-1 leading-6">{turn.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
        <h3 className="font-semibold">Initial Claims & Evidence</h3>
        <div className="mt-4 grid gap-3">
          {result.claims.map((claim) => (
            <div key={claim.id} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-sm text-zinc-200">{claim.statement}</p>
              <p className="text-xs text-zinc-500 mt-2">
                {claim.status} · confidence {claim.confidenceScore.toFixed(2)} · {claim.evidenceUrl || "source reference stored"}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function NewsToDebate() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";
  const [mode, setMode] = useState<"existing" | "manual">("existing");
  const [articleId, setArticleId] = useState("");
  const [manualArticle, setManualArticle] = useState({
    title: "",
    sourceName: "",
    sourceUrl: "",
    content: "",
    publishedAt: "",
  });

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const { data: articles = [], isLoading: articlesLoading, refetch } = useQuery({
    queryKey: ["admin-news-to-debate-articles"],
    queryFn: () => api.admin.newsToDebateArticles(40),
    enabled: isRootAdmin,
  });

  const selectedArticle = useMemo(
    () => articles.find((article) => String(article.id) === articleId),
    [articles, articleId],
  );

  const generateMutation = useMutation({
    mutationFn: (payload: AdminNewsToDebatePayload) => api.admin.generateNewsToDebate(payload),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#060611] flex items-center justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (!isAuthenticated || !isRootAdmin) return null;

  const canGenerate = mode === "existing"
    ? !!articleId
    : manualArticle.title.trim().length >= 8 && manualArticle.sourceUrl.trim().length >= 8 && manualArticle.content.trim().length >= 40;

  function generateDraft() {
    const payload: AdminNewsToDebatePayload = mode === "existing"
      ? { articleId: Number(articleId) }
      : {
        manualArticle: {
          title: manualArticle.title.trim(),
          sourceName: manualArticle.sourceName.trim() || undefined,
          sourceUrl: manualArticle.sourceUrl.trim(),
          content: manualArticle.content.trim(),
          publishedAt: manualArticle.publishedAt || undefined,
        },
      };
    generateMutation.mutate(payload);
  }

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <button onClick={() => navigate("/admin/dashboard")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4" data-testid="link-back-admin">
            <ArrowLeft className="w-4 h-4" /> Admin Dashboard
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Newspaper className="w-8 h-8 text-pink-300" />
                <h1 className="text-2xl font-bold">News-to-Debate</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Manual/admin-reviewed conversion of one news item into an internal debate draft, claim set, and MOUGLE synthesis.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={articlesLoading} className="border-white/10 text-zinc-300">
              {articlesLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Refresh Articles
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/live-studio")} className="border-white/10 text-zinc-300">
              <Radio className="w-4 h-4 mr-2" />
              Live Studio
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Generate Internal Draft</h2>
              <p className="text-sm text-zinc-500 mt-1">The output is stored as draft/admin-review material and is not published.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                <ShieldCheck className="w-3 h-3 mr-1" /> Manual trigger
              </Badge>
              <Badge className="bg-yellow-500/10 text-yellow-300 border-yellow-500/20">Admin approval required</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No private memory</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No public publish</Badge>
            </div>
          </div>

          <div className="grid lg:grid-cols-[220px_1fr] gap-4 mt-6">
            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">Source</label>
              <Select value={mode} onValueChange={(value) => setMode(value as "existing" | "manual")}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Existing article</SelectItem>
                  <SelectItem value="manual">Manual article</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "existing" ? (
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-500">Article</label>
                <Select value={articleId} onValueChange={setArticleId}>
                  <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                    <SelectValue placeholder="Select a news article" />
                  </SelectTrigger>
                  <SelectContent>
                    {articles.map((article) => (
                      <SelectItem key={article.id} value={String(article.id)}>
                        #{article.id} · {article.title.slice(0, 90)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedArticle && (
                  <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-sm text-zinc-200">{selectedArticle.title}</p>
                    <p className="text-xs text-zinc-500 mt-1">{selectedArticle.sourceName} · {formatDate(selectedArticle.publishedAt || selectedArticle.createdAt)}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-3">
                <Input
                  value={manualArticle.title}
                  onChange={(event) => setManualArticle((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Article title"
                  className="bg-[#090912] border-white/10 text-zinc-100"
                />
                <div className="grid md:grid-cols-2 gap-3">
                  <Input
                    value={manualArticle.sourceName}
                    onChange={(event) => setManualArticle((current) => ({ ...current, sourceName: event.target.value }))}
                    placeholder="Source name"
                    className="bg-[#090912] border-white/10 text-zinc-100"
                  />
                  <Input
                    value={manualArticle.sourceUrl}
                    onChange={(event) => setManualArticle((current) => ({ ...current, sourceUrl: event.target.value }))}
                    placeholder="Source URL"
                    className="bg-[#090912] border-white/10 text-zinc-100"
                  />
                </div>
                <Textarea
                  value={manualArticle.content}
                  onChange={(event) => setManualArticle((current) => ({ ...current, content: event.target.value }))}
                  placeholder="Article body or excerpt"
                  className="min-h-40 bg-[#090912] border-white/10 text-zinc-100"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mt-6">
            {generateMutation.isError ? (
              <div className="flex items-start gap-2 text-sm text-red-300">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <span>{generateMutation.error instanceof Error ? generateMutation.error.message : "Unable to generate draft"}</span>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Requires seeded, enabled system agents and configured AI integration.</p>
            )}
            <Button onClick={generateDraft} disabled={!canGenerate || generateMutation.isPending} className="bg-pink-600 hover:bg-pink-700">
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Generate Debate Draft
            </Button>
          </div>
        </Card>

        {generateMutation.data && <DraftResult result={generateMutation.data} />}
      </main>
    </div>
  );
}
