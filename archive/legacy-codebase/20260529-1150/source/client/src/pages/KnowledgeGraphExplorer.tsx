import { useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, type PublicKnowledgeGraphSummary } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GluonHowItWorksPanel } from "@/components/gluon/GluonPublic";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  Loader2,
  Lock,
  Network,
  ShieldCheck,
} from "lucide-react";

function labelFor(value: string) {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCount(value: number | undefined) {
  return Math.round(value || 0).toLocaleString();
}

function percent(value: number | undefined) {
  return `${Math.round(Math.max(0, Math.min(1, value || 0)) * 100)}%`;
}

function statusClass(status: string) {
  if (["verified", "approved", "supported", "consensus", "source_reference", "high_confidence"].includes(status)) {
    return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  }
  return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold text-white mt-1">{formatCount(value)}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-white/[0.08] bg-[#10101a] p-8 text-center">
      <Lock className="w-8 h-8 text-cyan-300 mx-auto" />
      <h2 className="text-lg font-semibold text-white mt-4">No public-safe graph records yet</h2>
      <p className="text-sm text-zinc-500 max-w-xl mx-auto mt-2 leading-6">
        Mougle only shows graph records that pass the public-safe server filter. Private, business, restricted, unknown, or internal records stay hidden.
      </p>
    </Card>
  );
}

function SafetyChecks({ summary }: { summary: PublicKnowledgeGraphSummary }) {
  const checks = [
    ["Personal and private data excluded", summary.leakPreventionChecks.personalPrivateExcluded],
    ["Business and restricted data excluded", summary.leakPreventionChecks.businessRestrictedExcluded],
    ["Unknown classifications denied", summary.leakPreventionChecks.unknownClassificationExcluded],
    ["Raw internals omitted", summary.leakPreventionChecks.rawInternalsOmitted],
  ];

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/[0.06] p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-emerald-300" />
        <h2 className="text-lg font-semibold text-white">Public Safety Filter</h2>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
        {checks.map(([label, check]) => {
          const safeCheck = check as PublicKnowledgeGraphSummary["leakPreventionChecks"]["personalPrivateExcluded"];
          return (
            <div key={label as string} className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
              <div className="flex items-center gap-2">
                {safeCheck.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-300" /> : <AlertTriangle className="w-4 h-4 text-red-300" />}
                <p className="text-sm font-medium text-white">{label as string}</p>
              </div>
              <p className="text-xs text-zinc-400 mt-2 leading-5">{safeCheck.explanation}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function KnowledgeGraphExplorer() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Knowledge Graph Beta | Mougle";

    const existingRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = existingRobots?.getAttribute("content") || null;
    const robots = existingRobots || document.createElement("meta");
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", "noindex,nofollow");
    if (!existingRobots) document.head.appendChild(robots);

    return () => {
      document.title = previousTitle;
      if (existingRobots && previousRobots != null) {
        existingRobots.setAttribute("content", previousRobots);
      } else if (!existingRobots) {
        robots.remove();
      }
    };
  }, []);

  const summaryQuery = useQuery({
    queryKey: ["public-knowledge-graph-summary"],
    queryFn: () => api.publicKnowledgeGraph.summary(),
  });

  const nodesQuery = useQuery({
    queryKey: ["public-knowledge-graph-nodes"],
    queryFn: () => api.publicKnowledgeGraph.nodes({ limit: 24 }),
  });

  const edgesQuery = useQuery({
    queryKey: ["public-knowledge-graph-edges"],
    queryFn: () => api.publicKnowledgeGraph.edges({ limit: 36 }),
  });

  const summary = summaryQuery.data;
  const nodes = nodesQuery.data?.items || [];
  const edges = edgesQuery.data?.items || [];
  const isLoading = summaryQuery.isLoading || nodesQuery.isLoading || edgesQuery.isLoading;
  const error = summaryQuery.error || nodesQuery.error || edgesQuery.error;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <header className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-5">
        <div className="max-w-7xl mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link href="/">
            <button className="text-left">
              <p className="text-lg font-semibold text-white">Mougle</p>
              <p className="text-xs text-zinc-500">Public-Safe Graph Projection Beta</p>
            </button>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Beta Prep</Badge>
            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">Public-safe only</Badge>
            <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">Noindex</Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <section className="grid lg:grid-cols-[1.4fr_0.8fr] gap-6 items-stretch">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Network className="w-8 h-8 text-cyan-300" />
              <h1 className="text-3xl font-bold">Public-Safe Knowledge Graph Projection</h1>
            </div>
            <p className="text-zinc-400 leading-7 max-w-3xl">
              Explore a public-safe projection of Mougle knowledge relationships that pass strict server-side safety checks. This is not the internal agent graph; private memory, restricted business knowledge, raw provenance, and admin-only quality metrics are never shown here.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/discussions">
                <Button className="bg-cyan-500 hover:bg-cyan-400 text-black">
                  Discussions <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/ai-news-updates">
                <Button variant="outline" className="border-white/10 text-zinc-300 hover:text-white">
                  AI News
                </Button>
              </Link>
            </div>
          </div>
          <Card className="border-white/[0.08] bg-[#10101a] p-5">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-300" />
              <h2 className="text-lg font-semibold text-white">Privacy Boundary</h2>
            </div>
            <p className="text-sm text-zinc-400 mt-3 leading-6">
              The public explorer receives only projected summaries. Raw source IDs, internal metadata, private memory, business knowledge, unknown classifications, and admin quality metrics are not returned.
            </p>
          </Card>
        </section>

        {error && (
          <Card className="bg-red-500/10 border-red-500/20 p-4 text-red-200">
            {(error as Error).message || "Unable to load the public knowledge graph."}
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading public graph...
          </div>
        )}

        {summary && !isLoading && (
          <>
            <section className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <SummaryTile label="Public-safe nodes" value={summary.totals.nodes} />
              <SummaryTile label="Public-safe edges" value={summary.totals.edges} />
              <SummaryTile label="Topics" value={summary.totals.topics} />
              <SummaryTile label="Entities" value={summary.totals.entities} />
              <SummaryTile label="Relationships" value={summary.totals.relationships} />
            </section>

            <SafetyChecks summary={summary} />

            {nodes.length === 0 && edges.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <section className="grid xl:grid-cols-[1fr_0.9fr] gap-6">
                  <Card className="border-white/[0.08] bg-[#10101a] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-lg font-semibold text-white">Public Topics and Entities</h2>
                      <Badge className="bg-white/[0.05] text-zinc-300 border-white/[0.08]">
                        {formatCount(nodesQuery.data?.total)} total
                      </Badge>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3 mt-4">
                      {nodes.map((node) => (
                        <div key={node.id} className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">{labelFor(node.type)}</Badge>
                            <Badge className={statusClass(node.verificationStatus)}>{labelFor(node.verificationStatus)}</Badge>
                          </div>
                          <h3 className="font-semibold text-white mt-3">{node.label}</h3>
                          {node.summary && <p className="text-sm text-zinc-400 mt-2 leading-6">{node.summary}</p>}
                          <div className="flex flex-wrap gap-2 mt-4 text-xs text-zinc-500">
                            <span>{percent(node.confidence)} confidence</span>
                            <span>{node.sourceSummary}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="border-white/[0.08] bg-[#10101a] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-lg font-semibold text-white">Public Relationships</h2>
                      <Badge className="bg-white/[0.05] text-zinc-300 border-white/[0.08]">
                        {formatCount(edgesQuery.data?.total)} total
                      </Badge>
                    </div>
                    <div className="space-y-3 mt-4">
                      {edges.map((edge) => (
                        <div key={edge.id} className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <GitBranch className="w-4 h-4 text-cyan-300" />
                            <Badge className="bg-white/[0.05] text-zinc-300 border-white/[0.08]">{labelFor(edge.relationType)}</Badge>
                            <Badge className={statusClass(edge.verificationStatus)}>{labelFor(edge.verificationStatus)}</Badge>
                          </div>
                          <p className="text-sm text-zinc-400 mt-3 leading-6">{edge.provenanceSummary}</p>
                          <div className="flex flex-wrap gap-2 mt-4 text-xs text-zinc-500">
                            <span>{percent(edge.confidence)} confidence</span>
                            <span>{edge.sourceSummary}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </section>

                <GluonHowItWorksPanel audience="public" topic="knowledgeGraph" />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
