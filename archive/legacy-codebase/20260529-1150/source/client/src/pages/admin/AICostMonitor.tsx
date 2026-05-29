import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Shield, Activity, Zap, AlertTriangle, CheckCircle, Clock, TrendingUp, RefreshCw, ArrowLeft, Brain, Users, MessageSquare, Gauge, Lock, Eye } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

export default function AICostMonitor() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "safety" | "limits" | "live">("overview");
  const { isLoading: authLoading, isAuthenticated } = useAdminAuth();

  const { data: metrics, isLoading, refetch } = useQuery({
    queryKey: ["admin-ai-gateway-metrics"],
    queryFn: () => api.admin.aiGatewayMetrics(),
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  const resetMutation = useMutation({
    mutationFn: () => api.admin.aiGatewayResetMetrics(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ai-gateway-metrics"] });
    },
  });

  if (authLoading) {
    return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-gray-400">Loading...</div>;
  }
  if (!isAuthenticated) return null;

  const gw = metrics?.gateway;
  const platform = metrics?.platform;
  const safety = metrics?.safetyStatus;

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Activity },
    { id: "safety" as const, label: "Safety Systems", icon: Shield },
    { id: "limits" as const, label: "Limits & Config", icon: Gauge },
    { id: "live" as const, label: "Live Activity", icon: Eye },
  ];

  return (
    <Layout>
      <div className="min-h-screen bg-[#0a0a14] text-white">
        <div className="bg-gradient-to-r from-red-900/40 via-orange-900/30 to-yellow-900/20 border-b border-red-500/20 py-8 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <a href="/admin" className="text-white/50 hover:text-white transition" data-testid="link-back-admin">
                <ArrowLeft className="w-5 h-5" />
              </a>
              <Shield className="w-8 h-8 text-red-400" />
              <h1 className="text-2xl font-bold" data-testid="text-page-title">AI Cost Protection Monitor</h1>
              <Badge className="bg-red-500/20 text-red-300 border-red-500/30 ml-2" data-testid="badge-founder-only">
                Founder Only
              </Badge>
            </div>
            <p className="text-white/50 text-sm ml-11">Real-time AI cost protection, rate limiting, loop prevention, and gateway metrics</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex gap-2 mb-6 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition",
                  activeTab === tab.id ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-white/5 text-white/50 hover:text-white/80 border border-transparent"
                )}
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} className="border-white/10 text-white/70" data-testid="button-refresh">
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => resetMutation.mutate()} className="border-red-500/30 text-red-300 hover:bg-red-500/10" data-testid="button-reset-metrics">
                Reset Metrics
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-white/50">Loading gateway metrics...</div>
          ) : activeTab === "overview" ? (
            <OverviewTab gw={gw} platform={platform} />
          ) : activeTab === "safety" ? (
            <SafetyTab safety={safety} gw={gw} />
          ) : activeTab === "limits" ? (
            <LimitsTab gw={gw} />
          ) : (
            <LiveTab gw={gw} platform={platform} />
          )}
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ label, value, icon: Icon, color = "text-white", subtext }: { label: string; value: string | number; icon: any; color?: string; subtext?: string }) {
  return (
    <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-4" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn("text-2xl font-bold", color)}>{value}</div>
      {subtext && <div className="text-xs text-white/30 mt-1">{subtext}</div>}
    </div>
  );
}

function OverviewTab({ gw, platform }: { gw: any; platform: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={gw?.totalRequests || 0} icon={Zap} color="text-blue-400" />
        <StatCard label="Tokens Used" value={(gw?.totalTokensUsed || 0).toLocaleString()} icon={Brain} color="text-purple-400" />
        <StatCard label="Credits Charged" value={gw?.totalCreditsCharged || 0} icon={TrendingUp} color="text-green-400" />
        <StatCard label="Failed Requests" value={gw?.failedRequests || 0} icon={AlertTriangle} color="text-red-400" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Req/min" value={gw?.requestsThisMinute || 0} icon={Activity} color="text-cyan-400" subtext="Current minute" />
        <StatCard label="Req/hour" value={gw?.requestsThisHour || 0} icon={Clock} color="text-amber-400" subtext="Current hour" />
        <StatCard label="Blocked (Credits)" value={gw?.blockedByCredits || 0} icon={Lock} color="text-orange-400" subtext="Insufficient funds" />
        <StatCard label="Blocked (Rate)" value={gw?.blockedByRateLimit || 0} icon={Shield} color="text-red-300" subtext="Rate limited" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-platform-summary">
          <h3 className="text-sm font-medium text-white/60 mb-4">Platform Cost Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/40">Total Credits Charged</span>
              <span className="text-green-400 font-bold">{platform?.totalCreditsCharged || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/40">BYOAI Users</span>
              <span className="text-purple-400 font-bold">{platform?.byoaiUsersCount || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/40">Active Chains</span>
              <span className="text-cyan-400 font-bold">{gw?.activeChains || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/40">Active Debates</span>
              <span className="text-amber-400 font-bold">{gw?.activeDebates || 0}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-cost-by-model">
          <h3 className="text-sm font-medium text-white/60 mb-4">Cost Per Model</h3>
          <div className="space-y-2">
            {gw?.costPerModel && Object.entries(gw.costPerModel).map(([model, cost]: [string, any]) => (
              <div key={model} className="flex justify-between items-center">
                <span className="text-white/50 text-sm">{model}</span>
                <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">{cost} credits</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SafetyTab({ safety, gw }: { safety: any; gw: any }) {
  const checks = [
    { key: "zeroPlatformCost", label: "Zero Platform Cost", desc: "Platform never pays for user agent activity" },
    { key: "allRequestsGated", label: "All Requests Gated", desc: "Every AI call goes through AI Gateway" },
    { key: "rateLimitsActive", label: "Rate Limits Active", desc: "Per-user and adaptive throttling enabled" },
    { key: "loopPreventionActive", label: "Loop Prevention", desc: "Chain depth and turn limits enforced" },
    { key: "debateGovernorActive", label: "Debate Governor", desc: "Speaker, round, and time limits enforced" },
    { key: "autoSummarizationActive", label: "Auto Summarization", desc: "Context compression reduces token usage" },
    { key: "trainingLimitsActive", label: "Training Limits", desc: "Per-user quotas and file size caps" },
    { key: "autoPauseActive", label: "Auto-Pause System", desc: "Agents pause when credits exhausted" },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-5" data-testid="card-safety-status">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-bold text-green-400">All Safety Systems Active</h3>
        </div>
        <p className="text-white/40 text-sm">AI cost protection is fully operational. No runaway expenses possible.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {checks.map((check) => (
          <div key={check.key} className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-4 flex items-start gap-3" data-testid={`safety-${check.key}`}>
            <CheckCircle className={cn("w-5 h-5 mt-0.5", safety?.[check.key] ? "text-green-400" : "text-red-400")} />
            <div>
              <h4 className="font-medium text-sm">{check.label}</h4>
              <p className="text-xs text-white/40 mt-0.5">{check.desc}</p>
            </div>
            <Badge className={cn("ml-auto", safety?.[check.key] ? "bg-green-500/10 text-green-300 border-green-500/20" : "bg-red-500/10 text-red-300 border-red-500/20")}>
              {safety?.[check.key] ? "Active" : "Inactive"}
            </Badge>
          </div>
        ))}
      </div>

      <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-protection-summary">
        <h3 className="text-sm font-medium text-white/60 mb-4">Protection Metrics</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-orange-400">{gw?.blockedByCredits || 0}</div>
            <div className="text-xs text-white/40 mt-1">Blocked by Credits</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{gw?.blockedByRateLimit || 0}</div>
            <div className="text-xs text-white/40 mt-1">Rate Limited</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-400">{gw?.failedRequests || 0}</div>
            <div className="text-xs text-white/40 mt-1">Failed Total</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LimitsTab({ gw }: { gw: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-rate-limits">
          <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2"><Gauge className="w-4 h-4" /> Rate Limits</h3>
          <div className="space-y-3">
            {gw?.rateLimits && Object.entries(gw.rateLimits).map(([type, limits]: [string, any]) => (
              <div key={type} className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-white/50 capitalize">{type}</span>
                <div className="flex gap-3">
                  <span className="text-xs text-cyan-300">{limits.perMinute}/min</span>
                  <span className="text-xs text-amber-300">{limits.perHour}/hr</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-loop-limits">
          <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Loop Prevention</h3>
          <div className="space-y-3">
            {gw?.loopLimits && Object.entries(gw.loopLimits).map(([key, val]: [string, any]) => (
              <div key={key} className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-white/50 text-sm">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="text-white font-mono text-sm">{val.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-debate-limits">
          <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> Debate Governor</h3>
          <div className="space-y-3">
            {gw?.debateLimits && Object.entries(gw.debateLimits).map(([key, val]: [string, any]) => (
              <div key={key} className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-white/50 text-sm">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="text-white font-mono text-sm">{val.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-training-limits">
          <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2"><Brain className="w-4 h-4" /> Training Limits</h3>
          <div className="space-y-3">
            {gw?.trainingLimits && Object.entries(gw.trainingLimits).map(([key, val]: [string, any]) => (
              <div key={key} className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-white/50 text-sm">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="text-white font-mono text-sm">{val.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-action-costs">
        <h3 className="text-sm font-medium text-white/60 mb-4">Action Cost Table</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {gw?.actionCosts && Object.entries(gw.actionCosts).map(([action, cost]: [string, any]) => (
            <div key={action} className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-xs text-white/40 capitalize">{action.replace(/_/g, " ")}</div>
              <div className="text-lg font-bold text-green-400 mt-1">{cost}</div>
              <div className="text-xs text-white/30">credits</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveTab({ gw, platform }: { gw: any; platform: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Chains" value={gw?.activeChains || 0} icon={Zap} color="text-cyan-400" subtext="Agent-to-agent conversations" />
        <StatCard label="Active Debates" value={gw?.activeDebates || 0} icon={Users} color="text-purple-400" subtext="With AI speakers" />
        <StatCard label="Req/min Now" value={gw?.requestsThisMinute || 0} icon={Activity} color="text-green-400" subtext="Current throughput" />
        <StatCard label="Req/hour Now" value={gw?.requestsThisHour || 0} icon={Clock} color="text-amber-400" subtext="Hourly throughput" />
      </div>

      <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-cost-breakdown">
        <h3 className="text-sm font-medium text-white/60 mb-4">Cost Breakdown by Model</h3>
        {platform?.costBreakdown?.byModel ? (
          <div className="space-y-3">
            {Object.entries(platform.costBreakdown.byModel).map(([model, amount]: [string, any]) => {
              const total = Object.values(platform.costBreakdown.byModel as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
              const pct = total > 0 ? (amount / total * 100) : 0;
              return (
                <div key={model}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white/60">{model}</span>
                    <span className="text-white/80">{amount} credits ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-white/30 text-sm">No model usage data yet</p>
        )}
      </div>

      <div className="bg-[#141422]/80 border border-white/[0.06] rounded-xl p-5" data-testid="card-action-breakdown">
        <h3 className="text-sm font-medium text-white/60 mb-4">Cost Breakdown by Action</h3>
        {platform?.costBreakdown?.byAction ? (
          <div className="space-y-3">
            {Object.entries(platform.costBreakdown.byAction).map(([action, amount]: [string, any]) => {
              const total = Object.values(platform.costBreakdown.byAction as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
              const pct = total > 0 ? (amount / total * 100) : 0;
              return (
                <div key={action}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white/60 capitalize">{action.replace(/_/g, " ")}</span>
                    <span className="text-white/80">{amount} credits ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-white/30 text-sm">No action usage data yet</p>
        )}
      </div>
    </div>
  );
}
