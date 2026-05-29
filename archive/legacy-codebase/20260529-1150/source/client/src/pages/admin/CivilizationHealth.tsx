import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, type AdminCivilizationHealthMetric, type AdminCivilizationHealthSection, type AdminCivilizationHealthStatus } from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Gavel,
  HeartPulse,
  Loader2,
  Radio,
  RefreshCw,
  ShieldCheck,
  Store,
  TrendingUp,
} from "lucide-react";

const sectionIcons: Record<string, any> = {
  ues: BrainCircuit,
  agents: Bot,
  truth: ShieldCheck,
  governance: Gavel,
  cost: CircleDollarSign,
  knowledge: Database,
  marketplace: Store,
  media_pipeline: TrendingUp,
};

function statusBadgeClass(status: AdminCivilizationHealthStatus | string) {
  if (status === "healthy" || status === "low") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "watch" || status === "medium") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  if (status === "risk" || status === "high") return "bg-orange-500/10 text-orange-300 border-orange-500/20";
  return "bg-red-500/10 text-red-300 border-red-500/20";
}

function qualityBadgeClass(quality: string) {
  if (quality === "calculated") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (quality === "partial") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function labelFor(value: string) {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function MetricTile({ metric }: { metric: AdminCivilizationHealthMetric }) {
  return (
    <Card className="bg-white/[0.03] border-white/[0.06] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500">{metric.label}</p>
          <p className="text-2xl font-semibold text-white mt-1">{metric.displayValue}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge className={statusBadgeClass(metric.status)}>{metric.status}</Badge>
          <Badge className={qualityBadgeClass(metric.sourceQuality)}>{metric.sourceQuality}</Badge>
        </div>
      </div>
      <p className="text-xs text-zinc-500 mt-3 leading-5">{metric.explanation}</p>
      <p className="text-[11px] text-zinc-600 mt-2">{metric.dataPoints} data points</p>
    </Card>
  );
}

function HealthSection({ section }: { section: AdminCivilizationHealthSection }) {
  const Icon = sectionIcons[section.key] || Activity;
  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/[0.05] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>
              <Badge className={statusBadgeClass(section.status)}>{section.status}</Badge>
              <Badge className={qualityBadgeClass(section.sourceQuality)}>{section.sourceQuality}</Badge>
            </div>
            <p className="text-sm text-zinc-500 mt-1">{section.summary}</p>
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">
        {section.metrics.map((metric) => (
          <MetricTile key={`${section.key}-${metric.key}`} metric={metric} />
        ))}
      </div>
    </Card>
  );
}

export default function CivilizationHealth() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/admin/login", { replace: true });
      return;
    }
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-civilization-health"],
    queryFn: () => api.admin.civilizationHealth(),
    enabled: isRootAdmin,
    refetchInterval: 60000,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#060611] flex items-center justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (!isAuthenticated || !isRootAdmin) return null;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <button onClick={() => navigate("/admin/dashboard")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4" /> Admin Dashboard
          </button>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <HeartPulse className="w-8 h-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">Civilization Health</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
                <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Read Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                UES, truth quality, agent risk, policy risk, cost burn, marketplace quality, and read-only safe-mode recommendations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/digital-world")} className="border-white/10 text-zinc-300">
                Digital World
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/safe-mode")} className="border-white/10 text-zinc-300">
                Safe Mode
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/live-studio")} className="border-white/10 text-zinc-300">
                <Radio className="w-4 h-4 mr-2" />
                Live Studio
              </Button>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="border-white/10 text-zinc-300">
                {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <Card className="bg-red-500/10 border-red-500/20 p-4 text-red-200">
            {(error as Error).message || "Unable to load civilization health."}
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin mr-3" /> Loading civilization health...
          </div>
        )}

        {data && (
          <>
            <div className="grid xl:grid-cols-[1.1fr_.9fr] gap-5">
              <Card className="bg-gradient-to-br from-cyan-500/[0.10] to-violet-500/[0.08] border-cyan-500/20 p-6">
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={statusBadgeClass(data.summary.collapseRiskLevel)}>
                        Collapse risk: {data.summary.collapseRiskLevel}
                      </Badge>
                      <Badge className={data.summary.founderReviewNeeded ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}>
                        {data.summary.founderReviewNeeded ? "Founder review needed" : "Monitor"}
                      </Badge>
                    </div>
                    <p className="text-sm text-zinc-500 mt-4">Overall Civilization Health</p>
                    <p className="text-6xl font-bold text-white mt-1">{data.summary.displayScore}</p>
                    <p className="text-sm text-zinc-400 mt-4 max-w-3xl leading-6">{data.summary.explanation}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 min-w-[260px]">
                    {[
                      ["UES", data.ues.averageUES],
                      ["P", data.ues.averageP],
                      ["D", data.ues.averageD],
                      ["Omega", data.ues.averageOmega],
                      ["Xi", data.ues.averageXi],
                      ["Correction", data.ues.correctionCapacity],
                    ].map(([label, value]) => (
                      <Card key={label as string} className="bg-black/20 border-white/[0.06] p-3">
                        <p className="text-[11px] text-zinc-500">{label}</p>
                        <p className="text-xl font-semibold text-white mt-1">{Math.round(Number(value) * 100)}%</p>
                      </Card>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-300" />
                  <h2 className="text-lg font-semibold">Safe-Mode Recommendations</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {data.recommendations.map((recommendation) => (
                    <div key={recommendation.key} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-cyan-300" />
                        <p className="text-sm font-medium text-zinc-100">{recommendation.label}</p>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 leading-5">{recommendation.reason}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-200">
                  No automatic safe-mode enforcement, pause action, public publishing change, or marketplace action is performed by this dashboard.
                </div>
              </Card>
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              <Card className="bg-white/[0.03] border-white/[0.06] p-4">
                <BarChart3 className="w-5 h-5 text-cyan-300 mb-3" />
                <p className="text-xs text-zinc-500">Data Quality</p>
                <p className="text-xl font-semibold text-white mt-1">{data.dataQuality.overall}</p>
                <p className="text-[11px] text-zinc-600 mt-2">{data.dataQuality.calculated} calculated · {data.dataQuality.partial} partial · {data.dataQuality.fallback} fallback</p>
              </Card>
              <Card className="bg-white/[0.03] border-white/[0.06] p-4">
                <Activity className="w-5 h-5 text-violet-300 mb-3" />
                <p className="text-xs text-zinc-500">Collapse Score</p>
                <p className="text-xl font-semibold text-white mt-1">{Math.round(data.collapseRisk.score * 100)}%</p>
                <p className="text-[11px] text-zinc-600 mt-2">{data.collapseRisk.signals.length} signals</p>
              </Card>
              <Card className="bg-white/[0.03] border-white/[0.06] p-4">
                <ShieldCheck className="w-5 h-5 text-emerald-300 mb-3" />
                <p className="text-xs text-zinc-500">Root/Admin Only</p>
                <p className="text-xl font-semibold text-white mt-1">{data.safeguards.rootAdminOnly ? "Yes" : "No"}</p>
                <p className="text-[11px] text-zinc-600 mt-2">Staff access blocked in this phase</p>
              </Card>
              <Card className="bg-white/[0.03] border-white/[0.06] p-4">
                <Database className="w-5 h-5 text-amber-300 mb-3" />
                <p className="text-xs text-zinc-500">Private Memory</p>
                <p className="text-xl font-semibold text-white mt-1">{data.safeguards.noPrivateMemoryContent ? "Hidden" : "Review"}</p>
                <p className="text-[11px] text-zinc-600 mt-2">Aggregate vault counts only</p>
              </Card>
            </div>

            <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-red-300" />
                <h2 className="text-lg font-semibold">Collapse Risk Signals</h2>
                <Badge className={statusBadgeClass(data.collapseRisk.level)}>{data.collapseRisk.level}</Badge>
                <Badge className={qualityBadgeClass(data.collapseRisk.sourceQuality)}>{data.collapseRisk.sourceQuality}</Badge>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.collapseRisk.signals.map((signal) => (
                  <Card key={signal.key} className="bg-white/[0.03] border-white/[0.06] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{signal.label}</p>
                        <p className="text-xs text-zinc-500 mt-2 leading-5">{signal.explanation}</p>
                      </div>
                      <Badge className={statusBadgeClass(signal.status)}>{signal.status}</Badge>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-3">Signal {Math.round(signal.value * 100)}% · Weight {signal.weight}</p>
                  </Card>
                ))}
              </div>
            </Card>

            <div className="space-y-5">
              {data.sections.map((section) => (
                <HealthSection key={section.key} section={section} />
              ))}
            </div>

            <p className="text-xs text-zinc-600">
              Last generated {new Date(data.generatedAt).toLocaleString()} · Phase 20 monitoring is read-only and does not expose raw private memory, secrets, tokens, or credentials.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
